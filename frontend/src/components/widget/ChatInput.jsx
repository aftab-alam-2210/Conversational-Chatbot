import React, { useState, useRef, useEffect } from 'react';
import { AudioLines, Mic, MicOff, Paperclip, SendHorizontal, X } from 'lucide-react';
import { finalizeDictationText, readDictationResults } from '../../utils/dictation.js';

export const ChatInput = ({ onSendMessage, onStartLive, onFileSelect, isLoading, disabled }) => {
  const [input, setInput] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [voiceError, setVoiceError] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);
  const recognitionRef = useRef(null);
  const dictationBaseRef = useRef('');
  const finalizedSegmentsRef = useRef([]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  }, [input]);

  useEffect(() => () => {
    if (recognitionRef.current) {
      recognitionRef.current.onend = null;
      recognitionRef.current.stop();
    }
  }, []);

  const toggleDictation = () => {
    setVoiceError('');
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setVoiceError('Voice dictation is not supported in this browser.');
      return;
    }
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = 'en-IN';
    recognition.interimResults = true;
    recognition.continuous = false;
    dictationBaseRef.current = input.trimEnd();
    finalizedSegmentsRef.current = [];
    recognitionRef.current = recognition;
    recognition.onstart = () => setIsListening(true);
    recognition.onresult = (event) => {
      const transcript = readDictationResults(event.results, dictationBaseRef.current);
      finalizedSegmentsRef.current = [transcript.finalText];
      setInput(transcript.displayText);
    };
    recognition.onerror = (event) => {
      if (event.error !== 'aborted') setVoiceError(event.error === 'not-allowed' ? 'Microphone permission denied.' : 'Could not capture voice.');
      setIsListening(false);
    };
    recognition.onend = () => {
      setInput(finalizeDictationText(dictationBaseRef.current, finalizedSegmentsRef.current.join(' ')));
      setIsListening(false);
    };
    try { recognition.start(); } catch { setIsListening(false); setVoiceError('Microphone could not start.'); }
  };

  const handleFileChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setSelectedFile(file);
    onFileSelect?.(file);
    event.target.value = '';
  };

  const clearFile = () => {
    setSelectedFile(null);
    onFileSelect?.(null);
  };

  const handleSubmit = (e) => {
    e?.preventDefault();
    if (!input.trim() || isLoading || disabled) return;
    onSendMessage(input.trim());
    setInput('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
  };
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(); }
  };

  return (
    <form onSubmit={handleSubmit} className="p-3 bg-[#0b0f19] border-t border-[#22304a] rounded-b-2xl">
      {selectedFile && (
        <div className="mb-2 flex max-w-full items-center gap-2 rounded-lg border border-[#22304a] bg-[#141c2e] px-2.5 py-1.5 text-[11px] text-slate-300">
          <Paperclip className="h-3.5 w-3.5 shrink-0 text-[#a3e635]" />
          <span className="min-w-0 flex-1 truncate">{selectedFile.name}</span>
          <button type="button" onClick={clearFile} aria-label="Remove attached file" className="rounded p-0.5 text-slate-400 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#a3e635]"><X className="h-3.5 w-3.5" /></button>
        </div>
      )}
      <div className="flex items-end gap-2">
        <div className="flex min-w-0 flex-1 items-end rounded-xl border border-[#22304a] bg-[#141c2e] transition-all focus-within:border-[#a3e635]/80 focus-within:ring-1 focus-within:ring-[#a3e635]/30">
          <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileChange} />
          <button type="button" onClick={() => fileInputRef.current?.click()} disabled={isLoading || disabled}
            title="Attach a file" aria-label="Attach a file"
            className="mb-1 ml-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-[#19273c] hover:text-[#a3e635] disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#a3e635]">
            <Paperclip className="h-4 w-4" />
          </button>
          <textarea ref={textareaRef} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={handleKeyDown}
            placeholder="Ask SeQuor AI about Cloud, AI, Security..." rows={1} disabled={isLoading || disabled} aria-label="Message"
            className="min-w-0 w-full bg-transparent py-2 pl-2 pr-3 text-xs leading-relaxed text-slate-100 placeholder-slate-500 focus:outline-none resize-none max-h-28 custom-scrollbar" />
        </div>
        <button type="button" onClick={toggleDictation} disabled={isLoading || disabled}
          title={isListening ? 'Stop microphone dictation' : 'Use microphone dictation'} aria-label={isListening ? 'Stop microphone dictation' : 'Use microphone dictation'}
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#a3e635] ${isListening ? 'border-rose-400/50 bg-rose-400/10 text-rose-300 animate-pulse' : 'border-[#22304a] bg-[#141c2e] text-slate-300 hover:border-[#a3e635]/50 hover:text-[#a3e635]'}`}>
          {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
        </button>
        <button type={input.trim() ? 'submit' : 'button'} onClick={!input.trim() ? onStartLive : undefined} disabled={isLoading || disabled}
          title={input.trim() ? 'Send message' : 'Start live voice conversation'} aria-label={input.trim() ? 'Send message' : 'Start live voice conversation'}
          className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all flex-shrink-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#a3e635] ${input.trim() && !isLoading ? 'bg-[#a3e635] hover:bg-[#8ece25] text-[#0b0f19] font-bold active:scale-95 shadow-sm' : 'bg-[#141c2e] text-[#a3e635] border border-[#22304a] hover:border-[#a3e635]/50 disabled:opacity-50'}`}>
          {input.trim() ? <SendHorizontal className="w-4 h-4" /> : <AudioLines className="w-4 h-4" />}
        </button>
      </div>
      {voiceError && <p role="status" className="mt-1.5 px-1 text-[10px] text-amber-300">{voiceError}</p>}
    </form>
  );
};
