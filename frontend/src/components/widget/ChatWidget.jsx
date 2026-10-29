import React, { useState, useEffect, useCallback } from 'react';
import { AnimatePresence } from 'framer-motion';
import { LauncherButton } from './LauncherButton';
import { ChatWindow } from './ChatWindow';

export const ChatWidget = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLeadModalOpen, setIsLeadModalOpen] = useState(false);
  const [extractedContact, setExtractedContact] = useState(null);
  const [sessionId, setSessionId] = useState('');

  const mergeSessionHistory = useCallback((storedMessages) => {
    if (!Array.isArray(storedMessages) || !storedMessages.length) return;
    const normalized = storedMessages.map((message, index) => {
      const parsedTimestamp = Date.parse(message.timestamp || '');
      const timestamp = Number.isFinite(parsedTimestamp) ? new Date(parsedTimestamp).toISOString() : new Date().toISOString();
      return {
        ...message,
        id: message.id || message._id || `history-${message.sender}-${new Date(timestamp).getTime()}-${index}`,
        timestamp,
      };
    });
    setMessages((current) => {
      const merged = [...normalized];
      for (const message of current) {
        const duplicate = merged.some((stored) => {
          if (stored.id === message.id) return true;
          if (stored.sender !== message.sender || stored.text !== message.text) return false;
          const storedTime = new Date(stored.timestamp).getTime();
          const currentTime = new Date(message.timestamp).getTime();
          return Number.isFinite(storedTime) && Number.isFinite(currentTime) && Math.abs(storedTime - currentTime) < 5000;
        });
        if (!duplicate) merged.push(message);
      }
      return merged;
    });
  }, []);

  // Initialize or retrieve Session ID
  useEffect(() => {
    let currentSession = sessionStorage.getItem('vvnt_chat_session_id');
    if (!currentSession) {
      currentSession = `sess_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      sessionStorage.setItem('vvnt_chat_session_id', currentSession);
    }
    setSessionId(currentSession);
  }, []);

  useEffect(() => {
    if (!sessionId) return undefined;
    let cancelled = false;
    fetch(`/api/chat/history/${encodeURIComponent(sessionId)}`)
      .then((response) => response.ok ? response.json() : null)
      .then((result) => {
        if (!cancelled && result?.success) mergeSessionHistory(result.messages);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [mergeSessionHistory, sessionId]);

  const handleToggle = () => {
    setIsOpen((prev) => {
      const next = !prev;
      if (next) setUnreadCount(0);
      return next;
    });
  };

  const handleReset = () => {
    const newSession = `sess_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    sessionStorage.setItem('vvnt_chat_session_id', newSession);
    setSessionId(newSession);
    setMessages([]);
  };

  const handleLiveTurn = ({ turnId, userText, assistantText }) => {
    const timestamp = new Date().toISOString();
    setMessages((previous) => {
      const additions = [
        ...(userText ? [{ id: `live-user-${turnId}`, sender: 'user', text: userText, timestamp }] : []),
        ...(assistantText ? [{ id: `live-assistant-${turnId}`, sender: 'assistant', text: assistantText, timestamp }] : []),
      ];
      const existing = new Set(previous.map((message) => message.id));
      return [...previous, ...additions.filter((message) => !existing.has(message.id))];
    });
  };

  const handleLiveLeadCapture = (contact) => {
    setExtractedContact(contact || null);
    setIsLeadModalOpen(true);
  };

  const handleSendMessage = async (text) => {
    if (!text.trim() || isLoading) return;

    const userMessageId = `usr_${Date.now()}`;
    const userMsg = {
      id: userMessageId,
      sender: 'user',
      text,
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);

    const assistantTempId = `ast_${Date.now()}`;

    try {
      // 1. Attempt Streaming Request via SSE
      const response = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          sessionId,
        }),
      });

      if (!response.ok || !response.body) {
        // Fallback to standard non-streaming endpoint
        const fallbackRes = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: text, sessionId }),
        });
        const data = await fallbackRes.json();

        setMessages((prev) => [
          ...prev,
          {
            id: assistantTempId,
            sender: 'assistant',
            text: data.reply,
            sources: data.sources || [],
            timestamp: new Date().toISOString(),
          },
        ]);

        if (data.triggerForm) {
          setExtractedContact(data.extractedContact);
          setTimeout(() => setIsLeadModalOpen(true), 800);
        }
        setIsLoading(false);
        return;
      }

      // 2. Read SSE Stream
      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let accumulatedText = '';
      let sources = [];
      let triggerModal = false;

      // Add placeholder assistant message
      setMessages((prev) => [
        ...prev,
        {
          id: assistantTempId,
          sender: 'assistant',
          text: '',
          sources: [],
          isStreaming: true,
          timestamp: new Date().toISOString(),
        },
      ]);
      setIsLoading(false); // Stop standalone typing indicator since stream message bubble handles typing state

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        const rawChunk = decoder.decode(value, { stream: true });
        const lines = rawChunk.split('\n\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const payload = JSON.parse(line.replace('data: ', '').trim());
              if (payload.type === 'meta') {
                if (payload.triggerForm) {
                  triggerModal = true;
                  setExtractedContact(payload.extractedContact);
                }
              } else if (payload.type === 'chunk') {
                accumulatedText += payload.content;
                setMessages((prev) =>
                  prev.map((msg) =>
                    msg.id === assistantTempId ? { ...msg, text: accumulatedText, isStreaming: true } : msg
                  )
                );
              } else if (payload.type === 'done') {
                sources = payload.sources || [];
                setMessages((prev) =>
                  prev.map((msg) =>
                    msg.id === assistantTempId
                      ? { ...msg, text: payload.fullText || accumulatedText, sources, isStreaming: false }
                      : msg
                  )
                );
              }
            } catch (err) {
              // Ignore partial JSON parse errors in stream
            }
          }
        }
      }

      if (triggerModal) {
        setTimeout(() => setIsLeadModalOpen(true), 800);
      }
    } catch (error) {
      console.error('Error during chat interaction:', error);
      setMessages((prev) => [
        ...prev,
        {
          id: `err_${Date.now()}`,
          sender: 'assistant',
          text: "I apologize, but I encountered a connection issue. Please feel free to email our team directly at `support@vvntsequor.com` or try again.",
          timestamp: new Date().toISOString(),
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col items-end gap-3 font-sans">
      <AnimatePresence>
        {isOpen && (
          <ChatWindow
            messages={messages}
            isLoading={isLoading}
            onSendMessage={handleSendMessage}
            onReset={handleReset}
            onClose={() => setIsOpen(false)}
            isLeadModalOpen={isLeadModalOpen}
            setIsLeadModalOpen={setIsLeadModalOpen}
            sessionId={sessionId}
            extractedContact={extractedContact}
            onLiveTurn={handleLiveTurn}
            onLiveLeadCapture={handleLiveLeadCapture}
          />
        )}
      </AnimatePresence>

      <LauncherButton
        isOpen={isOpen}
        onClick={handleToggle}
        unreadCount={unreadCount}
      />
    </div>
  );
};
