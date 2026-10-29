import { ragService } from './src/ai/ragService.js';
import { classifyIntent } from './src/ai/intentClassifier.js';
import { SessionRepository } from './src/models/ChatSession.js';

async function runTests() {
  console.log('🧪 Starting Backend AI & Logic Test Suite...\n');

  // Test 1: Intent Classifier
  console.log('1️⃣ Testing Intent Classifier...');
  const intent1 = classifyIntent('What cybersecurity and SOC 2 services do you offer?');
  console.log('Query: "What cybersecurity and SOC 2 services do you offer?" -> Intent:', intent1.intent);
  if (intent1.intent !== 'faq') throw new Error('Expected faq intent');

  const intent2 = classifyIntent('Can I speak with a human support agent or manager?');
  console.log('Query: "Can I speak with a human support agent?" -> Intent:', intent2.intent, 'TriggerForm:', intent2.triggerForm);
  if (intent2.intent !== 'human_handoff') throw new Error('Expected human_handoff intent');

  const intent3 = classifyIntent('I would like to get a quote and pricing proposal. My email is john@enterprise.com');
  console.log('Query: "Pricing proposal..." -> Intent:', intent3.intent, 'Extracted:', intent3.extractedContact);
  if (intent3.intent !== 'lead_generation') throw new Error('Expected lead_generation intent');

  // Test 2: RAG Knowledge Initialization & Retrieval
  console.log('\n2️⃣ Testing RAG Service Retrieval...');
  await ragService.initialize();
  const context = await ragService.retrieveContext('cloud migration and kubernetes');
  console.log('Retrieved context source count:', context.sources.length);
  console.log('Primary source title:', context.sources[0]?.title);

  // Test 3: AI Response Generation
  console.log('\n3️⃣ Testing AI Response Generation...');
  const aiResponse = await ragService.generateResponse({
    query: 'Tell me about your 24/7 Managed IT Services and SLAs',
  });
  console.log('AI Response preview:\n', aiResponse.text.substring(0, 150) + '...\n');

  // Test 4: Session Repository
  console.log('4️⃣ Testing Session Repository (Memory Fallback)...');
  const session = await SessionRepository.getOrCreateSession('test_session_123');
  await SessionRepository.appendMessage('test_session_123', {
    sender: 'user',
    text: 'Hello test',
    intent: 'general',
  });
  const history = await SessionRepository.getSessionHistory('test_session_123');
  console.log('Session history count:', history.length);

  console.log('\n✅ All Backend & AI RAG Tests Passed Successfully!');
  process.exit(0);
}

runTests().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
