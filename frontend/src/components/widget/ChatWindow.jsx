import React, { useRef, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Header } from './Header';
import { MessageBubble } from './MessageBubble';
import { TypingIndicator } from './TypingIndicator';
import { ChatInput } from './ChatInput';
import { LiveVoiceMode } from './LiveVoiceMode';
import { LeadCaptureModal } from './LeadCaptureModal';
import { QUICK_PROMPTS } from '../../utils/constants';

export const ChatWindow = ({
  messages,
  isLoading,
  onSendMessage,
  onReset,
  onClose,
  isLeadModalOpen,
  setIsLeadModalOpen,
  sessionId,
  extractedContact,
  onLiveTurn,
  onLiveLeadCapture,
}) => {
  const messagesEndRef = useRef(null);
  const [isLive, setIsLive] = useState(false);
  const [startLive, setStartLive] = useState(false);

  const showTextChat = () => {
    setIsLive(false);
    setStartLive(false);
    window.setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 0);
  };

  const startNewChat = () => {
    setIsLive(false);
    setStartLive(false);
    onReset();
  };

  const endChat = () => {
    setIsLive(false);
    setStartLive(false);
    onClose();
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96, y: 15 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96, y: 15 }}
      transition={{ type: 'spring', damping: 25, stiffness: 350 }}
      className="relative flex flex-col w-[calc(100vw-2.5rem)] max-w-[380px] sm:w-[410px] sm:max-w-none h-[570px] max-h-[85vh] bg-[#0b0f19]/95 backdrop-blur-xl border border-[#22304a] rounded-2xl shadow-2xl overflow-hidden z-50 text-slate-100"
    >
      {/* Lead Capture Modal */}
      <LeadCaptureModal
        isOpen={isLeadModalOpen}
        onClose={() => setIsLeadModalOpen(false)}
        sessionId={sessionId}
        initialEmail={extractedContact?.email || ''}
        initialPhone={extractedContact?.phone || ''}
      />

      {/* Header */}
      <Header
        onReset={startNewChat}
        onClose={onClose}
        onEndChat={endChat}
        onViewRecentChat={showTextChat}
        onOpenLeadForm={() => setIsLeadModalOpen(true)}
      />

      {isLive ? (
        <LiveVoiceMode
          sessionId={sessionId}
          messages={messages}
          onTurn={onLiveTurn}
          onLeadCapture={onLiveLeadCapture}
          autoStart={startLive}
          onEnd={() => { setIsLive(false); setStartLive(false); }}
        />
      ) : (
        <>
          <div className="flex-1 overflow-y-auto p-3.5 custom-scrollbar space-y-1">
            {messages.length === 0 && (
              <div className="max-w-[94%] rounded-[1.4rem] border border-[#22304a] bg-[#141c2e] px-5 py-4 text-base leading-relaxed text-slate-100 shadow-sm">
                Hey 👋 Ask me anything about VVnT SeQuor.
              </div>
            )}
            {messages.map((msg) => <MessageBubble key={msg.id} message={msg} />)}
            {isLoading && <TypingIndicator />}
            <div ref={messagesEndRef} />
          </div>

          {messages.length === 0 && (
            <div className="border-t border-[#22304a] bg-[#0b0f19]/80 px-3 pb-3 pt-2">
              <div className="grid grid-cols-2 gap-2">
                {QUICK_PROMPTS.map((prompt, idx) => (
                  <button key={idx} onClick={() => onSendMessage(prompt)}
                    className={`min-h-11 rounded-full border border-[#334155] bg-transparent px-4 py-2 text-center text-xs leading-snug text-slate-200 transition-all hover:border-[#a3e635]/70 hover:bg-[#141c2e] hover:text-[#d9f99d] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#a3e635] ${idx < 2 ? 'col-span-2' : ''}`}>
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          )}

          <ChatInput onSendMessage={onSendMessage} onStartLive={() => { setIsLive(true); setStartLive(true); }} isLoading={isLoading} />
        </>
      )}
    </motion.div>
  );
};
