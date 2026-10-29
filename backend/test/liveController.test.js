import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createLiveSession,
  LIVE_MODELS,
  LIVE_TOOLS,
  requestGeminiLiveToken,
  retrieveLiveKnowledge,
  saveLiveTurn,
} from '../src/controllers/liveController.js';
import { SessionRepository } from '../src/models/ChatSession.js';
import { handleChatMessage } from '../src/controllers/chatController.js';

const makeResponse = () => ({
  statusCode: 200,
  body: null,
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; },
});

const withEnv = async (values, callback) => {
  const previous = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
  Object.entries(values).forEach(([key, value]) => {
    if (value == null) delete process.env[key];
    else process.env[key] = value;
  });
  try { await callback(); }
  finally {
    Object.entries(previous).forEach(([key, value]) => {
      if (value == null) delete process.env[key];
      else process.env[key] = value;
    });
  }
};

test('live session initialization validates feature flag, origin, credentials, and model', async () => {
  await withEnv({ LIVE_VOICE_ENABLED: 'false', GEMINI_API_KEY: null, LIVE_ALLOWED_ORIGINS: 'https://widget.example' }, async () => {
    const disabled = makeResponse();
    await createLiveSession({ get: () => 'https://widget.example', ip: 'test-disabled' }, disabled);
    assert.equal(disabled.statusCode, 503);
  });

  await withEnv({ LIVE_VOICE_ENABLED: 'true', GEMINI_API_KEY: null, LIVE_ALLOWED_ORIGINS: 'https://widget.example' }, async () => {
    const forbidden = makeResponse();
    await createLiveSession({ get: () => 'https://other.example', ip: 'test-origin' }, forbidden);
    assert.equal(forbidden.statusCode, 403);

    const missingKey = makeResponse();
    await createLiveSession({ get: () => 'https://widget.example', ip: 'test-key' }, missingKey);
    assert.equal(missingKey.statusCode, 503);
    assert.match(missingKey.body.error, /GEMINI_API_KEY/);
  });

  await withEnv({ LIVE_VOICE_ENABLED: 'true', GEMINI_API_KEY: 'test-placeholder', GEMINI_LIVE_MODEL: 'not-a-live-model', LIVE_ALLOWED_ORIGINS: 'https://widget.example' }, async () => {
    const unsupported = makeResponse();
    await createLiveSession({ get: () => 'https://widget.example', ip: 'test-model' }, unsupported);
    assert.equal(unsupported.statusCode, 500);
    assert.ok(LIVE_MODELS.has('gemini-3.8-live'));
  });
});

test('live session endpoint returns an ephemeral token from the documented provider flow', async () => {
  await withEnv({ LIVE_VOICE_ENABLED: 'true', GEMINI_API_KEY: 'server-only-test-key', GEMINI_LIVE_MODEL: 'gemini-3.8-live', LIVE_ALLOWED_ORIGINS: 'https://widget.example' }, async () => {
    const response = makeResponse();
    await createLiveSession({ get: () => 'https://widget.example', ip: `test-session-${Date.now()}` }, response, {
      tokenRequester: async ({ apiKey, model, config }) => {
        assert.equal(apiKey, 'server-only-test-key');
        assert.equal(model, 'gemini-3.8-live');
        assert.ok(config.tools);
        return { name: 'auth_tokens/test-session-token', expireTime: '2026-10-26T00:20:00.000Z' };
      },
    });
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.model, 'gemini-3.8-live');
    assert.match(response.body.websocketUrl, /BidiGenerateContentConstrained\?access_token=auth_tokens%2Ftest-session-token$/);
  });
});

test('live knowledge tool is narrowly scoped to company retrieval', () => {
  const declarations = LIVE_TOOLS.flatMap((tool) => tool.functionDeclarations);
  assert.equal(declarations.length, 1);
  assert.equal(declarations[0].name, 'search_vvnt_knowledge');
  assert.deepEqual(declarations[0].parameters.required, ['query']);
});

test('Live token request uses the installed Google GenAI SDK and constrained model config', async () => {
  let request;
  const token = await requestGeminiLiveToken({
    apiKey: 'server-only-test-key',
    model: 'gemini-3.8-live',
    config: { responseModalities: ['AUDIO'], inputAudioTranscription: {} },
    tokenClient: { authTokens: { create: async (value) => {
      request = value;
      return { name: 'auth_tokens/test-short-lived-token' };
    } } },
  });
  assert.equal(request.config.uses, 1);
  assert.equal(request.config.liveConnectConstraints.model, 'gemini-3.8-live');
  assert.deepEqual(request.config.liveConnectConstraints.config.responseModalities, ['AUDIO']);
  assert.equal(token.name, 'auth_tokens/test-short-lived-token');
});

test('Live token request preserves provider status for safe controller classification', async () => {
  await assert.rejects(
    requestGeminiLiveToken({
      apiKey: 'server-only-test-key',
      model: 'gemini-3.8-live',
      config: {},
      tokenClient: { authTokens: { create: async () => { throw Object.assign(new Error('private provider payload'), { status: 429 }); } } },
    }),
    (error) => error.status === 429 && error.message.includes('private provider payload'),
  );
});

test('live retrieval uses the existing VVnT knowledge service and bounds query input', async () => {
  await withEnv({ LIVE_ALLOWED_ORIGINS: 'https://widget.example' }, async () => {
  const invalid = makeResponse();
  await retrieveLiveKnowledge({ get: () => 'https://widget.example', body: { query: 'x'.repeat(1001) } }, invalid);
  assert.equal(invalid.statusCode, 400);

  const response = makeResponse();
  await retrieveLiveKnowledge({ get: () => 'https://widget.example', body: { query: 'VVnT SeQuor cloud migration' } }, response);
  assert.equal(response.statusCode, 200);
  assert.ok(response.body.context.length > 0);
  assert.ok(Array.isArray(response.body.sources));
  });
});

test('live retrieval returns focused source material for contact questions', async () => {
  await withEnv({ LIVE_ALLOWED_ORIGINS: 'https://widget.example' }, async () => {
    const response = makeResponse();
    await retrieveLiveKnowledge({ get: () => 'https://widget.example', body: { query: 'How can I contact the company?' } }, response);
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.queryCategory, 'contact');
    assert.ok(response.body.sources.length > 0);
    assert.ok(response.body.sources.every((source) => source.url === 'https://vvntsequor.in/contact.html'));
    assert.doesNotMatch(response.body.context, /open roles|Careers at VVnT/i);
  });
});

test('live transcripts are persisted through the existing session repository', async () => {
  const sessionId = `live-test-${Date.now()}`;
  const request = { get: () => 'https://widget.example', body: { sessionId, turnId: `turn_${Date.now()}`, userText: 'Tell me about VVnT cloud services', assistantText: 'VVnT provides cloud services.' } };
  const response = makeResponse();
  await withEnv({ LIVE_ALLOWED_ORIGINS: 'https://widget.example' }, async () => {
  await saveLiveTurn(request, response);
  assert.equal(response.statusCode, 200);
  const history = await SessionRepository.getSessionHistory(sessionId);
  assert.deepEqual(history.map((message) => message.sender), ['user', 'assistant']);
  assert.equal(history[1].text, 'VVnT provides cloud services.');

  const duplicate = makeResponse();
  await saveLiveTurn(request, duplicate);
  assert.equal(duplicate.body.duplicate, true);
  assert.equal((await SessionRepository.getSessionHistory(sessionId)).length, 2);
  });
});

test('live transcript persistence rejects a disallowed origin', async () => {
  await withEnv({ LIVE_ALLOWED_ORIGINS: 'https://widget.example' }, async () => {
    const response = makeResponse();
    await saveLiveTurn({ get: () => 'https://attacker.example', body: { sessionId: 'origin-test', userText: 'Hello' } }, response);
    assert.equal(response.statusCode, 403);
  });
});

test('session history preserves source links for later grounded follow-ups', async () => {
  const sessionId = `source-history-${Date.now()}`;
  await SessionRepository.getOrCreateSession(sessionId);
  await SessionRepository.appendMessage(sessionId, {
    sender: 'assistant',
    text: 'VVnT SeQuor offers cybersecurity services.',
    sources: [{
      title: 'Cybersecurity & Cyber Assurance Services',
      category: 'Cybersecurity',
      relevance: 1,
      url: 'https://vvntsequor.in/offerings/cybersecurity.html',
    }],
  });
  const [message] = await SessionRepository.getSessionHistory(sessionId);
  assert.equal(message.sources[0].url, 'https://vvntsequor.in/offerings/cybersecurity.html');
  assert.equal(message.sources[0].relevance, 1);
});

test('existing text chat response and lead-capture contract remain intact', async () => {
  const response = makeResponse();
  const request = {
    body: {
      sessionId: `chat-compat-${Date.now()}`,
      message: 'Please send a pricing proposal to voice-test@example.com',
    },
  };
  await handleChatMessage(request, response);
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.success, true);
  assert.equal(response.body.intent, 'lead_generation');
  assert.equal(response.body.triggerForm, true);
  assert.equal(response.body.extractedContact.email, 'voice-test@example.com');
  assert.equal(typeof response.body.reply, 'string');
});
