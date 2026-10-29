import { GoogleGenAI } from '@google/genai';
import { classifyIntent } from '../ai/intentClassifier.js';
import { ragService } from '../ai/ragService.js';
import { SessionRepository } from '../models/ChatSession.js';
import { SYSTEM_PROMPT } from '../ai/prompts/systemPrompt.js';

export const LIVE_MODELS = new Set([
  'gemini-3.8-live',
  'gemini-3.8-live-extended-thinking',
  'gemini-3.1-flash-live-preview',
]);
const LIVE_VOICES = new Set([
  'Zephyr', 'Puck', 'Charon', 'Kore', 'Fenrir', 'Leda', 'Orus', 'Aoede', 'Callirrhoe',
  'Autonoe', 'Enceladus', 'Iapetus', 'Umbriel', 'Algieba', 'Despina', 'Erinome',
  'Algenib', 'Rasalgethi', 'Laomedeia', 'Achernar', 'Alnilam', 'Schedar', 'Gacrux',
  'Pulcherrima', 'Achird', 'Zubenelgenubi', 'Vindemiatrix', 'Sadachbia', 'Sadaltager', 'Sulafat',
]);
const DEFAULT_LIVE_VOICE = 'Aoede';
const TOKEN_LIMIT = 5;
const TOKEN_WINDOW_MS = 60_000;
const tokenRequests = new Map();
const retrievalRequests = new Map();
const turnRequests = new Map();
const savedLiveTurns = new Map();
const LIVE_TURN_TTL_MS = 15 * 60_000;

const getAllowedOrigins = () => {
  const configured = process.env.LIVE_ALLOWED_ORIGINS || process.env.CLIENT_URL || 'http://localhost:5173';
  return new Set(configured.split(',').map((origin) => origin.trim()).filter(Boolean));
};

const isAllowedOrigin = (req) => {
  const origin = req.get('origin');
  return Boolean(origin && getAllowedOrigins().has(origin));
};

const isWithinTokenLimit = (req) => {
  const now = Date.now();
  const key = req.ip || req.socket?.remoteAddress || 'unknown';
  const recent = (tokenRequests.get(key) || []).filter((time) => now - time < TOKEN_WINDOW_MS);
  if (recent.length >= TOKEN_LIMIT) {
    tokenRequests.set(key, recent);
    return false;
  }
  recent.push(now);
  tokenRequests.set(key, recent);
  if (tokenRequests.size > 1000) {
    for (const [ip, times] of tokenRequests) {
      if (!times.some((time) => now - time < TOKEN_WINDOW_MS)) tokenRequests.delete(ip);
    }
  }
  return true;
};

const isWithinRetrievalLimit = (req) => {
  const now = Date.now();
  const key = req.ip || req.socket?.remoteAddress || 'unknown';
  const recent = (retrievalRequests.get(key) || []).filter((time) => now - time < TOKEN_WINDOW_MS);
  if (recent.length >= 30) {
    retrievalRequests.set(key, recent);
    return false;
  }
  recent.push(now);
  retrievalRequests.set(key, recent);
  if (retrievalRequests.size > 1000) {
    for (const [ip, times] of retrievalRequests) {
      if (!times.some((time) => now - time < TOKEN_WINDOW_MS)) retrievalRequests.delete(ip);
    }
  }
  return true;
};

const isWithinTurnLimit = (req) => {
  const now = Date.now();
  const key = req.ip || req.socket?.remoteAddress || 'unknown';
  const recent = (turnRequests.get(key) || []).filter((time) => now - time < TOKEN_WINDOW_MS);
  if (recent.length >= 60) {
    turnRequests.set(key, recent);
    return false;
  }
  recent.push(now);
  turnRequests.set(key, recent);
  if (turnRequests.size > 1000) {
    for (const [ip, times] of turnRequests) {
      if (!times.some((time) => now - time < TOKEN_WINDOW_MS)) turnRequests.delete(ip);
    }
  }
  return true;
};

const LIVE_SYSTEM_INSTRUCTION = `${SYSTEM_PROMPT}\n\nFor company facts, call search_vvnt_knowledge and use only the returned evidence. For EVERY request for an official company page, URL, or link, call the tool with pageLink=true and the topic from the user's wording (for example, "compliance page"). Return the exact matching official URL from sources; do not treat a broad unrelated result as a match, and never invent a URL. If no matching page is returned, say the site index has no verified match. For clients, solutions, and contact questions, use only the matching focused tool result; never substitute a careers page, generic company overview, or unrelated service source. For unclear or nonsensical input, ask for a rephrased VVnT SeQuor question without calling the tool. For “explain briefly” or “simplify that,” use the immediately preceding conversation turn; ask a concise clarification if there is no clear prior answer. If the user asks to end/close the conversation, or says a short sign-off such as "ok, end", "thanks", or "that's all", prioritize a brief warm spoken farewell immediately without calling tools or asking a follow-up. The client closes the Live session after the farewell audio finishes. Keep answers concise, answer the current question first, and make sure spoken responses are clearly transcribed.`;
export const LIVE_TOOLS = [{
  functionDeclarations: [{
    name: 'search_vvnt_knowledge',
    description: 'Search official VVnT SeQuor website and company records for factual answers. Always use pageLink=true for requests asking for an official page, URL, or link, including short requests such as "compliance page link".',
    parameters: {
      type: 'OBJECT',
      properties: {
        query: { type: 'STRING', description: 'The company topic or the user\'s exact page/link topic, such as compliance, self-compliance, or accessibility.' },
        pageLink: { type: 'BOOLEAN', description: 'Set true only when the user requests an official website page, URL, or link.' },
      },
      required: ['query'],
    },
  }],
}];

export const requestGeminiLiveToken = async ({ apiKey, model, config, tokenClient = new GoogleGenAI({ apiKey }) }) => {
  return tokenClient.authTokens.create({
    config: {
      uses: 1,
      newSessionExpireTime: new Date(Date.now() + 60_000).toISOString(),
      expireTime: new Date(Date.now() + 20 * 60_000).toISOString(),
      liveConnectConstraints: { model, config },
    },
  });
};

export const createLiveSession = async (req, res, { tokenRequester = requestGeminiLiveToken } = {}) => {
  if (process.env.LIVE_VOICE_ENABLED !== 'true') {
    return res.status(503).json({ error: 'Live Voice Mode is disabled on this server.' });
  }
  if (!isAllowedOrigin(req)) {
    return res.status(403).json({ error: 'Live Voice Mode is not available from this site origin.' });
  }
  if (!isWithinTokenLimit(req)) {
    return res.status(429).json({ error: 'Too many live sessions were requested. Please wait a minute and try again.' });
  }
  if (!process.env.GEMINI_API_KEY) {
    return res.status(503).json({ error: 'Live Voice Mode is not configured. Add GEMINI_API_KEY on the server.' });
  }

  const model = process.env.GEMINI_LIVE_MODEL || 'gemini-3.8-live';
  if (!LIVE_MODELS.has(model)) {
    return res.status(500).json({ error: 'The configured Gemini Live model is not supported by this application.' });
  }
  const configuredVoice = process.env.GEMINI_LIVE_VOICE || DEFAULT_LIVE_VOICE;
  const voiceName = LIVE_VOICES.has(configuredVoice) ? configuredVoice : DEFAULT_LIVE_VOICE;

  try {
    const token = await tokenRequester({
      apiKey: process.env.GEMINI_API_KEY,
      model,
      config: {
        responseModalities: ['AUDIO'],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName } } },
        systemInstruction: { parts: [{ text: LIVE_SYSTEM_INSTRUCTION }] },
        tools: LIVE_TOOLS,
        inputAudioTranscription: {},
        outputAudioTranscription: {},
        realtimeInputConfig: {
          automaticActivityDetection: {
            disabled: false,
            silenceDurationMs: 700,
          },
        },
        sessionResumption: {},
        contextWindowCompression: {
          slidingWindow: { targetTokens: '12000' },
        },
      },
    });

    if (!token.name) return res.status(502).json({ error: 'Gemini did not return a Live session token. Please try again.' });
    return res.json({
      token: token.name,
      model,
      voiceName,
      expiresAt: token.expireTime,
      websocketUrl: `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained?access_token=${encodeURIComponent(token.name)}`,
    });
  } catch (error) {
    const status = error.status || error.statusCode;
    const safeMessage = error.message?.replaceAll(process.env.GEMINI_API_KEY || '\0', '[redacted]').slice(0, 500);
    console.warn('[Gemini Live] Token request rejected', { httpStatus: status || null, message: safeMessage });
    if (status === 401 || status === 403) {
      return res.status(502).json({ error: 'Gemini rejected the server credentials. Check GEMINI_API_KEY and its API access.' });
    }
    if (status === 429) {
      return res.status(429).json({ error: 'Gemini Live is temporarily rate limited or the project quota is exhausted. Try again later.' });
    }
    const details = process.env.NODE_ENV === 'development' && status
      ? { providerStatus: error.statusText || null, details: safeMessage }
      : undefined;
    return res.status(502).json({ error: 'Could not start a Gemini Live session. Check model availability and server connectivity.', ...(details ? { details } : {}) });
  }
};

export const retrieveLiveKnowledge = async (req, res) => {
  if (!isAllowedOrigin(req)) {
    return res.status(403).json({ error: 'Live Voice Mode is not available from this site origin.' });
  }
  const query = typeof req.body?.query === 'string' ? req.body.query.trim() : '';
  const pageLink = req.body?.pageLink === true;
  if (!query || query.length > 1000) {
    return res.status(400).json({ error: 'A search query of 1 to 1000 characters is required.' });
  }
  if (!isWithinRetrievalLimit(req)) {
    return res.status(429).json({ error: 'Too many knowledge searches were requested. Please wait and try again.' });
  }
  try {
    const result = await ragService.retrieveContext(pageLink ? `official page link for ${query}` : query, 4);
    const missingEvidenceGuidance = !result.evidenceFound
      ? ({
          identity: 'No individual chatbot developer is identified in the verified knowledge base.',
          careers: 'Current vacancies and recruitment status are not verified in the knowledge base.',
          compensation: 'Intern and employee compensation details are not available in the verified knowledge base.',
        }[result.queryCategory] || 'The requested detail is not verified in the knowledge base.')
      : null;
    return res.json({
      context: result.contextText.slice(0, 8000),
      sources: result.sources || [],
      confidence: result.confidence ?? 0,
      evidenceFound: result.evidenceFound ?? false,
      queryCategory: result.queryCategory || null,
      missingEvidenceGuidance,
    });
  } catch {
    return res.status(503).json({ error: 'The VVnT SeQuor knowledge search is temporarily unavailable.' });
  }
};

export const saveLiveTurn = async (req, res) => {
  const { sessionId, turnId, userText, assistantText } = req.body || {};
  if (!isAllowedOrigin(req)) {
    return res.status(403).json({ error: 'Live Voice Mode is not available from this site origin.' });
  }
  if (typeof sessionId !== 'string' || sessionId.length < 1 || sessionId.length > 128) {
    return res.status(400).json({ error: 'A valid chat session ID is required.' });
  }
  if (turnId != null && (typeof turnId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(turnId))) {
    return res.status(400).json({ error: 'A valid live turn ID is required.' });
  }
  if ((userText != null && (typeof userText !== 'string' || userText.length > 6000)) ||
      (assistantText != null && (typeof assistantText !== 'string' || assistantText.length > 6000))) {
    return res.status(400).json({ error: 'Live transcript entries must be text under 6000 characters.' });
  }

  const turnKey = turnId ? `${sessionId}:${turnId}` : null;
  const now = Date.now();
  for (const [key, entry] of savedLiveTurns) {
    if (entry.expiresAt <= now) savedLiveTurns.delete(key);
  }
  if (turnKey && savedLiveTurns.has(turnKey)) {
    try {
      const result = await savedLiveTurns.get(turnKey).promise;
      return res.json({ ...result, duplicate: true });
    } catch {
      savedLiveTurns.delete(turnKey);
    }
  }
  if (!isWithinTurnLimit(req)) {
    return res.status(429).json({ error: 'Too many live transcript updates were requested. Please wait and try again.' });
  }

  const savePromise = (async () => {
    try {
      await SessionRepository.getOrCreateSession(sessionId);
      const intent = classifyIntent(userText || '').intent;
      if (userText?.trim()) {
        await SessionRepository.appendMessage(sessionId, { sender: 'user', text: userText.trim(), intent, timestamp: new Date() });
      }
      if (assistantText?.trim()) {
        await SessionRepository.appendMessage(sessionId, { sender: 'assistant', text: assistantText.trim(), intent, timestamp: new Date() });
      }
      const intentResult = classifyIntent(userText || '');
      return {
        success: true,
        intent: intentResult.intent,
        action: intentResult.action,
        triggerForm: intentResult.triggerForm,
        extractedContact: intentResult.extractedContact,
      };
    } catch {
      throw new Error('Could not save the live conversation to chat history.');
    }
  })();
  if (turnKey) {
    savedLiveTurns.set(turnKey, { expiresAt: now + LIVE_TURN_TTL_MS, promise: savePromise });
    if (savedLiveTurns.size > 2000) {
      for (const [key, entry] of savedLiveTurns) {
        if (entry.expiresAt <= now || savedLiveTurns.size > 1500) savedLiveTurns.delete(key);
      }
    }
  }
  try {
    return res.json(await savePromise);
  } catch {
    if (turnKey) savedLiveTurns.delete(turnKey);
    return res.status(500).json({ error: 'Could not save the live conversation to chat history.' });
  }
};
