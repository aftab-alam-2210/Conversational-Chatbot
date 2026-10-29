import { ragService } from '../ai/ragService.js';
import { classifyIntent } from '../ai/intentClassifier.js';
import { SessionRepository } from '../models/ChatSession.js';

export const handleChatMessage = async (req, res) => {
  try {
    const { message, sessionId = `sess_${Date.now()}`, metadata = {} } = req.body;

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return res.status(400).json({ error: 'Message content is required.' });
    }

    // 1. Get or create chat session
    await SessionRepository.getOrCreateSession(sessionId, metadata);

    // 2. Fetch past conversation history
    const history = await SessionRepository.getSessionHistory(sessionId);

    // 3. Classify Intent
    const intentResult = classifyIntent(message);

    // 4. Save User Message
    await SessionRepository.appendMessage(sessionId, {
      sender: 'user',
      text: message,
      intent: intentResult.intent,
      timestamp: new Date(),
    });

    // 5. Generate AI / RAG Response
    const aiResult = await ragService.generateResponse({
      query: message,
      history,
    });

    // 6. Save Assistant Response
    await SessionRepository.appendMessage(sessionId, {
      sender: 'assistant',
      text: aiResult.text,
      intent: intentResult.intent,
      sources: aiResult.sources,
      timestamp: new Date(),
    });

    return res.status(200).json({
      success: true,
      sessionId,
      reply: aiResult.text,
      intent: intentResult.intent,
      action: intentResult.action,
      triggerForm: intentResult.triggerForm,
      sources: aiResult.sources || [],
      confidence: aiResult.confidence ?? null,
      evidenceFound: aiResult.evidenceFound ?? null,
      queryCategory: aiResult.queryCategory || null,
      extractedContact: intentResult.extractedContact,
    });
  } catch (error) {
    console.error('[ChatController] Error processing chat message:', error);
    return res.status(500).json({
      error: 'An internal server error occurred while processing your request.',
      details: error.message,
    });
  }
};

export const handleChatStream = async (req, res) => {
  try {
    const { message, sessionId = `sess_${Date.now()}`, metadata = {} } = req.body;

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return res.status(400).json({ error: 'Message content is required.' });
    }

    // Configure Server-Sent Events headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    // 1. Session & History
    await SessionRepository.getOrCreateSession(sessionId, metadata);
    const history = await SessionRepository.getSessionHistory(sessionId);

    // 2. Intent Analysis
    const intentResult = classifyIntent(message);

    // 3. Save User Message
    await SessionRepository.appendMessage(sessionId, {
      sender: 'user',
      text: message,
      intent: intentResult.intent,
      timestamp: new Date(),
    });

    // Send metadata event
    res.write(`data: ${JSON.stringify({
      type: 'meta',
      sessionId,
      intent: intentResult.intent,
      action: intentResult.action,
      triggerForm: intentResult.triggerForm,
      extractedContact: intentResult.extractedContact,
    })}\n\n`);

    let accumulatedText = '';

    // 4. Stream response from LangChain / RAG
    const aiResult = await ragService.generateResponse({
      query: message,
      history,
      onChunk: (chunk) => {
        accumulatedText += chunk;
        res.write(`data: ${JSON.stringify({ type: 'chunk', content: chunk })}\n\n`);
      },
    });

    // 5. Save Completed Assistant Message
    await SessionRepository.appendMessage(sessionId, {
      sender: 'assistant',
      text: accumulatedText || aiResult.text,
      intent: intentResult.intent,
      sources: aiResult.sources,
      timestamp: new Date(),
    });

    // Send completion event
    res.write(`data: ${JSON.stringify({
      type: 'done',
      sources: aiResult.sources || [],
      fullText: accumulatedText || aiResult.text,
      confidence: aiResult.confidence ?? null,
      evidenceFound: aiResult.evidenceFound ?? null,
      queryCategory: aiResult.queryCategory || null,
    })}\n\n`);

    res.end();
  } catch (error) {
    console.error('[ChatController] Error in stream:', error);
    res.write(`data: ${JSON.stringify({ type: 'error', error: error.message })}\n\n`);
    res.end();
  }
};

export const getSessionHistory = async (req, res) => {
  try {
    const { sessionId } = req.params;
    if (!sessionId) {
      return res.status(400).json({ error: 'Session ID is required.' });
    }

    const messages = await SessionRepository.getSessionHistory(sessionId);
    return res.status(200).json({
      success: true,
      sessionId,
      messages,
    });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to retrieve history.', details: error.message });
  }
};
