import fs from 'node:fs';
import { RAGService } from '../src/ai/ragService.js';

const cases = JSON.parse(fs.readFileSync(new URL('../evals/rag_cases.json', import.meta.url), 'utf8'));
const service = new RAGService();
service.hasOpenAI = false;
service.hasOpenRouter = false;

const includesAll = (text, values) => values.every((value) => text.toLowerCase().includes(value.toLowerCase()));
const includesAny = (text, values) => values.some((value) => text.toLowerCase().includes(value.toLowerCase()));

const results = [];
for (const testCase of cases) {
  const retrieval = await service.retrieveContext(testCase.question);
  const answer = await service.generateResponse({ query: testCase.question });
  const answerText = answer.text || '';
  const retrievalPass = testCase.evidenceAvailable
    ? retrieval.evidenceFound && retrieval.sources.length > 0
    : !retrieval.evidenceFound && retrieval.sources.length === 0;
  const answerPass = includesAll(answerText, testCase.mustContain || []) && !includesAny(answerText, testCase.mustNotContain || []);
  results.push({
    id: testCase.id,
    category: testCase.category,
    retrievalPass,
    answerPass,
    confidence: retrieval.confidence,
    sources: retrieval.sources.map(({ title }) => title),
    answer: answerText,
  });
}

const passed = results.filter((result) => result.retrievalPass && result.answerPass).length;
console.log(JSON.stringify({ total: results.length, passed, failed: results.length - passed, results }, null, 2));
if (passed !== results.length) process.exitCode = 1;
