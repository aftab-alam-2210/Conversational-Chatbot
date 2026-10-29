import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { RAGService } from '../src/ai/ragService.js';

const docs = JSON.parse(fs.readFileSync(new URL('../src/ai/knowledge/vvnt_knowledge_base.json', import.meta.url), 'utf8'));
const websiteDocs = JSON.parse(fs.readFileSync(new URL('../src/ai/knowledge/website_knowledge_base.json', import.meta.url), 'utf8'));
const makeService = () => {
  const service = new RAGService();
  service.rawDocs = [...docs, ...websiteDocs];
  service.isInitialized = true;
  service.hasOpenAI = false;
  service.hasOpenRouter = false;
  return service;
};

const unsupportedQuestions = [
  'Who built you? Tell me the name.',
  'Who developed this chatbot?',
  'Is there any hiring going on in this company?',
  'Are there any current vacancies?',
  'How can I apply for a job?',
];

test('identity questions do not retrieve unrelated company documents', async () => {
  const service = makeService();
  for (const query of unsupportedQuestions.slice(0, 2)) {
    const result = await service.retrieveContext(query);
    assert.equal(result.contextText, '', query);
    assert.deepEqual(result.sources, [], query);
  }
});

test('current hiring questions retrieve only the official Careers URL', async () => {
  const service = makeService();
  for (const query of unsupportedQuestions.slice(2)) {
    const result = await service.retrieveContext(query);
    assert.equal(result.evidenceFound, true, query);
    assert.ok(result.sources.length > 0, query);
    assert.ok(result.sources.every((source) => source.url === 'https://vvntsequor.in/careers.html'), query);
    assert.match(result.contextText, /open roles|open now|apply/i, query);
    assert.doesNotMatch(result.contextText, /Zomato|HCL|client portfolio/i, query);
  }
});

test('cybersecurity retrieval prefers the verified cybersecurity document and excludes incidental matches', async () => {
  const result = await makeService().retrieveContext('Tell me about your cybersecurity services.');
  assert.ok(result.sources.length > 0);
  assert.match(result.sources[0].title, /Cybersecurity/i);
  assert.equal(result.sources[0].url, 'https://vvntsequor.in/offerings/cybersecurity.html');
  assert.equal(result.sources.some((source) => /Skill Development|Talent Pool|Client/i.test(source.title)), false);
  assert.match(result.contextText, /VAPT|Penetration Testing/i);
});

test('existing technical retrieval remains available with confidence metadata', async () => {
  const result = await makeService().retrieveContext('cloud migration and kubernetes');
  assert.equal(result.evidenceFound, true);
  assert.ok(result.confidence >= 0.3);
  assert.ok(result.sources.length > 0);
});

test('final answers acknowledge unknown creator and ground current hiring in the official Careers page', async () => {
  const service = makeService();
  const identity = await service.generateResponse({ query: unsupportedQuestions[0] });
  assert.match(identity.text, /^I'm SeQuor AI, VVnT SeQuor's virtual assistant\./);
  assert.match(identity.text, /doesn't identify the individual/);
  assert.doesNotMatch(identity.text, /Anil Gupta|Parveen|Bhawna|cybersecurity|services/i);
  const identityVariant = await service.generateResponse({ query: unsupportedQuestions[1] });
  assert.match(identityVariant.text, /doesn't identify the individual/);

  const variants = unsupportedQuestions.slice(2);
  for (const query of variants) {
    const answer = await service.generateResponse({ query });
    assert.match(answer.text, /official VVnT SeQuor Careers page/i, query);
    assert.match(answer.text, /open roles/i, query);
    assert.doesNotMatch(answer.text, /Zomato|HCL|sales@/i, query);
    assert.ok(answer.sources.some((source) => source.url === 'https://vvntsequor.in/careers.html'), query);
  }
});

test('identity typos and compensation questions cannot fall into unrelated company retrieval', async () => {
  const service = makeService();
  const identity = await service.generateResponse({ query: 'Who build you?' });
  assert.match(identity.text, /doesn't identify the individual/);
  const identityTypo = await service.generateResponse({ query: 'Who nuild you?' });
  assert.match(identityTypo.text, /doesn't identify the individual/);
  const salary = await service.generateResponse({ query: 'What is the sallery of intern?' });
  assert.match(salary.text, /stipend amount/i);
  assert.doesNotMatch(salary.text, /Zomato|HCL|client|company deck/i);
  assert.ok(salary.sources.some((source) => source.url === 'https://vvntsequor.in/careers.html'));
});

test('final cybersecurity answer is concise and grounded in retrieved evidence', async () => {
  const service = makeService();
  const answer = await service.generateResponse({ query: 'Tell me about your cybersecurity services.' });
  assert.match(answer.text, /Vulnerability Assessment and Penetration Testing \(VAPT\)/);
  assert.match(answer.text, /Third-Party Assessment & Audits \(3PAA\)/);
  assert.doesNotMatch(answer.text, /Skill India|Zomato|company records|Schedule Consultation/i);
  assert.ok(answer.text.length < 500);
  assert.match(answer.sources[0].title, /Cybersecurity/i);
});

test('solutions, clients, and contact questions use only their matching trusted sources', async () => {
  const service = makeService();

  const solutions = await service.generateResponse({ query: 'What solutions does the company offer?' });
  assert.match(solutions.text, /Cybersecurity & Cyber Assurance/);
  assert.match(solutions.text, /GenAI & Agentic AI Development/);
  assert.match(solutions.text, /Digital Testing & Automation/);
  assert.ok(solutions.sources.every((source) => source.url === 'https://vvntsequor.in/services.html'));
  assert.doesNotMatch(solutions.text, /Building inclusive, resilient|Company Deck/i);

  const clients = await service.generateResponse({ query: "Who are the company's clients?" });
  assert.match(clients.text, /Zomato \/ Blinkit \/ Eternal/);
  assert.match(clients.text, /HCL Technologies/);
  assert.match(clients.text, /Larsen & Toubro/);
  assert.ok(clients.sources.every((source) => source.category === 'Clients & Portfolio'));
  assert.doesNotMatch(clients.text, /open roles|apply now|careers/i);

  const contact = await service.generateResponse({ query: 'How can I contact the company?' });
  assert.match(contact.text, /sales@vvntsequor\.in/);
  assert.match(contact.text, /\+91 88028 01739/);
  assert.ok(contact.sources.every((source) => source.url === 'https://vvntsequor.in/contact.html'));
});

test('unclear input and clarification follow-ups do not trigger unrelated retrieval', async () => {
  const service = makeService();
  const unclear = await service.generateResponse({ query: 'asdfgh, what can you do?' });
  assert.match(unclear.text, /I can help with VVnT SeQuor services/i);
  assert.deepEqual(unclear.sources, []);
  assert.doesNotMatch(unclear.text, /cybersecurity maturity|VAPT Services Portfolio/i);

  const followUp = await service.generateResponse({
    query: "I didn't understand. Can you explain briefly?",
    history: [{
      sender: 'assistant',
      text: 'VVnT SeQuor provides cloud security assessments and DevSecOps support. This includes detailed implementation advice.',
      sources: [{ title: 'Cybersecurity', url: 'https://vvntsequor.in/offerings/cybersecurity.html' }],
    }],
  });
  assert.equal(followUp.text, 'In brief: VVnT SeQuor provides cloud security assessments and DevSecOps support.');
  assert.deepEqual(followUp.sources, [{ title: 'Cybersecurity', url: 'https://vvntsequor.in/offerings/cybersecurity.html' }]);

  const ambiguousFollowUp = await service.generateResponse({ query: 'Explain briefly.' });
  assert.match(ambiguousFollowUp.text, /What would you like me to explain briefly/i);
  assert.deepEqual(ambiguousFollowUp.sources, []);
});
