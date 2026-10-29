import React, { useEffect, useState } from 'react';
import { BookOpen, Clock, Volume2, VolumeX } from 'lucide-react';

export const MessageBubble = ({ message }) => {
  const [isSpeaking, setIsSpeaking] = useState(false);

  useEffect(() => () => {
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  }, []);

  const toggleSpeech = () => {
    if (!('speechSynthesis' in window)) {
      window.alert('Text-to-speech is not supported in this browser.');
      return;
    }
    if (isSpeaking) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      return;
    }
    window.speechSynthesis.cancel();
    const spokenText = (message.text || '')
      .replace(/```[\s\S]*?```/g, ' Code block omitted. ')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
      .replace(/[*#_>]/g, '')
      .trim();
    if (!spokenText) return;
    const utterance = new SpeechSynthesisUtterance(spokenText);
    utterance.lang = 'en-IN';
    utterance.rate = 1;
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    setIsSpeaking(true);
    window.speechSynthesis.speak(utterance);
  };
  const isAssistant = message.sender === 'assistant';

  const formatTime = (ts) => {
    if (!ts) return '';
    try {
      const d = new Date(ts);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  const renderFormattedContent = (text) => {
    if (!text) return null;

    const paragraphs = text.split('\n\n');

    return paragraphs.map((para, pIdx) => {
      if (para.includes('\n- ') || para.startsWith('- ') || para.includes('\n* ') || para.startsWith('* ')) {
        const lines = para.split('\n');
        return (
          <ul key={pIdx} className="list-disc list-inside space-y-1 my-1.5 text-slate-200">
            {lines.map((line, lIdx) => {
              const cleanLine = line.replace(/^[-*]\s+/, '');
              return (
                <li key={lIdx} className="leading-relaxed">
                  {renderInlineStyles(cleanLine)}
                </li>
              );
            })}
          </ul>
        );
      }

      if (/^\d+\.\s+/.test(para)) {
        const lines = para.split('\n');
        return (
          <ol key={pIdx} className="list-decimal list-inside space-y-1 my-1.5 text-slate-200">
            {lines.map((line, lIdx) => {
              const cleanLine = line.replace(/^\d+\.\s+/, '');
              return (
                <li key={lIdx} className="leading-relaxed">
                  {renderInlineStyles(cleanLine)}
                </li>
              );
            })}
          </ol>
        );
      }

      return (
        <p key={pIdx} className="leading-relaxed mb-1.5 last:mb-0">
          {renderInlineStyles(para)}
        </p>
      );
    });
  };

  const renderInlineStyles = (line) => {
    const parts = line.split(/(\[.*?\]\(.*?\)|https?:\/\/[^\s<>()]+)/gi);
    return parts.map((part, index) => {
      const linkMatch = part.match(/^\[(.*?)\]\((.*?)\)$/);
      if (linkMatch) {
        return (
          <a key={index} href={linkMatch[2]} target="_blank" rel="noopener noreferrer" className="text-[#a3e635] hover:underline font-medium">
            {linkMatch[1]}
          </a>
        );
      }
      const rawUrlMatch = part.match(/^(https?:\/\/[^\s<>()]+?)([.,!?;:]*)$/i);
      if (rawUrlMatch) {
        return (
          <React.Fragment key={index}>
            <a href={rawUrlMatch[1]} target="_blank" rel="noopener noreferrer" className="text-[#a3e635] hover:underline font-medium break-all">
              {rawUrlMatch[1]}
            </a>
            {rawUrlMatch[2]}
          </React.Fragment>
        );
      }
      
      const subParts = part.split(/(\*\*.*?\*\*|`.*?`)/g);
      return subParts.map((subPart, subIndex) => {
        if (subPart.startsWith('**') && subPart.endsWith('**')) {
          return (
            <strong key={`${index}-${subIndex}`} className="font-semibold text-white">
              {subPart.slice(2, -2)}
            </strong>
          );
        }
        if (subPart.startsWith('`') && subPart.endsWith('`')) {
          return (
            <code key={`${index}-${subIndex}`} className="px-1.5 py-0.5 rounded bg-[#0b0f19] text-[#a3e635] text-xs font-mono border border-[#22304a]">
              {subPart.slice(1, -1)}
            </code>
          );
        }
        return subPart;
      });
    });
  };

  return (
    <div className={`flex items-end gap-2 my-3 ${isAssistant ? 'justify-start' : 'justify-end'}`}>
      {/* Message Box */}
      <div className={`max-w-[85%] sm:max-w-[80%] flex flex-col ${isAssistant ? 'items-start' : 'items-end'}`}>
        <div
          className={`px-4 py-3 rounded-2xl text-sm shadow-bubble ${
            isAssistant
              ? 'bg-[#141c2e] text-slate-200 border border-[#22304a] rounded-bl-sm'
              : 'bg-gradient-to-r from-[#19273c] to-[#1e2f4a] text-white border border-[#a3e635]/30 rounded-br-sm font-normal'
          }`}
        >
          {isAssistant && message.isStreaming && !message.text ? (
            <div className="flex items-center space-x-1.5 py-1 text-slate-300">
              <span className="text-xs font-medium mr-1">Generating response</span>
              <span className="w-1.5 h-1.5 rounded-full bg-[#a3e635] animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-1.5 h-1.5 rounded-full bg-[#a3e635] animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-1.5 h-1.5 rounded-full bg-[#a3e635] animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          ) : (
            <>
              {renderFormattedContent(message.text)}
              {isAssistant && message.isStreaming && (
                <span className="inline-block w-1.5 h-3.5 ml-1 bg-[#a3e635] rounded-xs animate-pulse align-middle" />
              )}
            </>
          )}

          {/* RAG Knowledge Citations */}
          {isAssistant && !message.isStreaming && message.sources && message.sources.length > 0 && (
            <div className="mt-2.5 pt-2 border-t border-[#22304a] flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] text-slate-400 flex items-center gap-1 font-medium">
                <BookOpen className="w-3 h-3 text-[#a3e635]" />
                Verified Sources:
              </span>
              {Array.from(new Map(message.sources
                .map((source) => {
                  const title = (source.title || '')
                    .replace(/^PDF Chunk \d+:\s*/i, '')
                    .replace(/_/g, ' ')
                    .trim();
                  return [source.url || title, { ...source, title }];
                })
                .filter(([key, source]) => key && source.title)).values())
                .map((source, i) => (
                  <a
                    key={source.url || `${source.title}-${i}`}
                    href={source.url || undefined}
                    target={source.url ? '_blank' : undefined}
                    rel={source.url ? 'noopener noreferrer' : undefined}
                    className="text-[10px] px-2 py-0.5 rounded-md bg-[#0b0f19] text-[#a3e635] border border-[#a3e635]/30 font-medium tracking-wide flex items-center gap-1"
                  >
                    <span>{source.url ? '🔗' : '📄'}</span>
                    <span>{source.title}</span>
                  </a>
                ))}
            </div>
          )}
        </div>

        {/* Timestamp and optional text-to-speech control */}
        <div className="flex items-center gap-2 mt-1 px-1 text-[10px] text-slate-500">
          <Clock className="w-2.5 h-2.5" />
          <span>{formatTime(message.timestamp)}</span>
          {isAssistant && message.text && !message.isStreaming && (
            <button type="button" onClick={toggleSpeech}
              title={isSpeaking ? 'Stop reading response' : 'Read response aloud'}
              aria-label={isSpeaking ? 'Stop reading response' : 'Read response aloud'}
              className="inline-flex items-center gap-1 hover:text-[#a3e635] transition-colors">
              {isSpeaking ? <VolumeX className="w-3 h-3" /> : <Volume2 className="w-3 h-3" />}
              <span>{isSpeaking ? 'Stop' : 'Listen'}</span>
            </button>
          )}
        </div>
      </div>

    </div>
  );
};
