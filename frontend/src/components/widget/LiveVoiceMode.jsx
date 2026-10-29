import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Mic, MicOff, RefreshCw } from 'lucide-react';
import { buildGeminiLiveSetup, cleanupMicrophoneResources, stopAudioSources } from '../../utils/liveAudio.js';
import { LiveTranscriptTurn } from '../../utils/transcript.js';
import { isConversationEndIntent } from '../../utils/conversationIntent.js';

const INITIAL_STATUS = 'Ended';

const pcmToBase64 = (input, sampleRate) => {
  const ratio = sampleRate / 16000;
  const outputLength = Math.floor(input.length / ratio);
  const pcm = new Int16Array(outputLength);
  for (let index = 0; index < outputLength; index += 1) {
    const start = Math.floor(index * ratio);
    const end = Math.min(input.length, Math.floor((index + 1) * ratio));
    let sum = 0;
    for (let sample = start; sample < end; sample += 1) sum += input[sample];
    const value = Math.max(-1, Math.min(1, sum / Math.max(1, end - start)));
    pcm[index] = value < 0 ? value * 32768 : value * 32767;
  }
  const bytes = new Uint8Array(pcm.buffer);
  let binary = '';
  for (let index = 0; index < bytes.length; index += 1) binary += String.fromCharCode(bytes[index]);
  return window.btoa(binary);
};

const decodeBase64 = (value) => {
  const binary = window.atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
};

const getErrorMessage = (error) => {
  if (error?.name === 'TimeoutError') {
    return 'Microphone permission did not finish. Allow microphone access or connect a microphone, then reconnect.';
  }
  if (error?.name === 'NotAllowedError' || error?.name === 'SecurityError') {
    return 'Microphone permission was denied. Allow microphone access in your browser settings, then reconnect.';
  }
  if (error?.name === 'NotFoundError' || error?.name === 'OverconstrainedError') {
    return 'No usable microphone was found. Connect a microphone and try again.';
  }
  return error?.message || 'The live connection could not start. Check your network and try again.';
};

const requestMicrophone = (constraints, timeoutMs = 8000) => {
  const microphoneRequest = navigator.mediaDevices.getUserMedia(constraints);
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = window.setTimeout(() => reject(Object.assign(new Error('Microphone permission timed out.'), { name: 'TimeoutError' })), timeoutMs);
  });
  return Promise.race([microphoneRequest, timeout]).then((stream) => {
    window.clearTimeout(timer);
    return stream;
  }).catch((error) => {
    window.clearTimeout(timer);
    // A late permission grant must not leave an active microphone behind.
    microphoneRequest.then((stream) => stream.getTracks().forEach((track) => track.stop())).catch(() => {});
    throw error;
  });
};

export const LiveVoiceMode = ({ sessionId, messages, onTurn, onLeadCapture, autoStart = false, onEnd }) => {
  const [status, setStatus] = useState(INITIAL_STATUS);
  const [error, setError] = useState('');
  const [muted, setMuted] = useState(false);
  const [draftUser, setDraftUser] = useState('');
  const [draftAssistant, setDraftAssistant] = useState('');
  const [starting, setStarting] = useState(false);
  const socketRef = useRef(null);
  const streamRef = useRef(null);
  const audioContextRef = useRef(null);
  const processorRef = useRef(null);
  const sourceRef = useRef(null);
  const mutedOutputRef = useRef(null);
  const outputSourcesRef = useRef(new Set());
  const nextPlayTimeRef = useRef(0);
  const intentionalCloseRef = useRef(false);
  const setupTimeoutRef = useRef(null);
  const settleTimeoutRef = useRef(null);
  const transcriptRef = useRef(null);
  if (!transcriptRef.current) transcriptRef.current = new LiveTranscriptTurn();
  const statusRef = useRef(INITIAL_STATUS);
  const pendingInitialHistoryRef = useRef([]);
  const persistTurnRef = useRef(null);
  const sessionReadyRef = useRef(false);
  const mutedRef = useRef(false);
  const turnCompleteRef = useRef(false);
  const completionPendingRef = useRef(false);
  const sessionGenerationRef = useRef(0);
  const startingRef = useRef(false);
  const tokenAbortRef = useRef(null);
  const previousSessionIdRef = useRef(sessionId);
  const autoStartTimerRef = useRef(null);
  const closeAfterGoodbyeRef = useRef(false);
  const goodbyeSavedRef = useRef(false);
  const endSessionRef = useRef(null);
  const finishGoodbyeRef = useRef(null);

  const changeStatus = useCallback((next) => {
    statusRef.current = next;
    setStatus(next);
  }, []);

  const stopPlayback = useCallback(() => {
    nextPlayTimeRef.current = stopAudioSources(outputSourcesRef.current, audioContextRef.current?.currentTime || 0);
  }, []);

  const stopMicrophone = useCallback(() => {
    cleanupMicrophoneResources({
      processor: processorRef.current,
      source: sourceRef.current,
      silentOutput: mutedOutputRef.current,
      stream: streamRef.current,
    });
    processorRef.current = null;
    sourceRef.current = null;
    mutedOutputRef.current = null;
    streamRef.current = null;
  }, []);

  const disposeSession = useCallback((closeSocket = true) => {
    window.clearTimeout(setupTimeoutRef.current);
    window.clearTimeout(settleTimeoutRef.current);
    tokenAbortRef.current?.abort();
    tokenAbortRef.current = null;
    stopPlayback();
    turnCompleteRef.current = false;
    stopMicrophone();
    sessionReadyRef.current = false;
    if (closeSocket && socketRef.current) {
      intentionalCloseRef.current = true;
      const socket = socketRef.current;
      socketRef.current = null;
      socket.onopen = null;
      socket.onmessage = null;
      socket.onerror = null;
      socket.onclose = null;
      try { socket.close(1000, 'Live session ended'); } catch { /* already closed */ }
    }
    const context = audioContextRef.current;
    audioContextRef.current = null;
    if (context && context.state !== 'closed') context.close().catch(() => {});
  }, [stopMicrophone, stopPlayback]);

  const scheduleAudio = useCallback((base64) => {
    const context = audioContextRef.current;
    if (!context || context.state === 'closed') return;
    const bytes = decodeBase64(base64);
    const samples = new Int16Array(bytes.buffer, bytes.byteOffset, Math.floor(bytes.byteLength / 2));
    if (!samples.length) return;
    const buffer = context.createBuffer(1, samples.length, 24000);
    const channel = buffer.getChannelData(0);
    for (let index = 0; index < samples.length; index += 1) channel[index] = samples[index] / 32768;
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(context.destination);
    const startAt = Math.max(context.currentTime + 0.025, nextPlayTimeRef.current);
    nextPlayTimeRef.current = startAt + buffer.duration;
    outputSourcesRef.current.add(source);
    turnCompleteRef.current = false;
    source.onended = () => {
      outputSourcesRef.current.delete(source);
      finishGoodbyeRef.current?.();
      if (outputSourcesRef.current.size === 0 && turnCompleteRef.current) changeStatus('Thinking');
    };
    source.start(startAt);
    changeStatus('Speaking');
  }, [changeStatus]);

  const persistCompletedTurn = useCallback(async () => {
    window.clearTimeout(settleTimeoutRef.current);
    const completedTurn = transcriptRef.current.consumeCompleted();
    if (!completedTurn) return null;
    turnCompleteRef.current = false;
    const { userText, assistantText, turnId } = completedTurn;
    setDraftUser('');
    setDraftAssistant('');
    if (userText || assistantText) {
      // Add the finalized turn to the visible chat immediately. Persistence
      // remains best-effort and uses the existing idempotent backend endpoint.
      onTurn?.({ turnId, userText, assistantText });
      try {
        const response = await fetch('/api/live/turn', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId, turnId, userText, assistantText }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'The transcript could not be saved.');
        if (result.triggerForm) onLeadCapture?.(result.extractedContact);
      } catch { /* Keep the completed turn visible if history persistence is unavailable. */ }
    }
    if (statusRef.current !== 'Ended') changeStatus('Listening');
    return completedTurn;
  }, [changeStatus, onLeadCapture, onTurn, sessionId]);
  persistTurnRef.current = persistCompletedTurn;

  const handleServerMessage = useCallback(async (payload) => {
    if (payload.setupComplete) {
      window.clearTimeout(setupTimeoutRef.current);
      const history = pendingInitialHistoryRef.current;
      if (history.length) {
        socketRef.current?.send(JSON.stringify({
          clientContent: {
            turns: history.map((message) => ({
              role: message.sender === 'assistant' ? 'model' : 'user',
              parts: [{ text: message.text }],
            })),
            turnComplete: true,
          },
        }));
      }
      sessionReadyRef.current = true;
      changeStatus('Listening');
      return;
    }

    if (payload.error) {
      throw new Error(payload.error.message || 'Gemini reported a live session error.');
    }
    if (payload.serverContent) {
      const content = payload.serverContent;
      const completedTurn = transcriptRef.current.apply(content);
      const transcript = transcriptRef.current.snapshot();
      setDraftUser(transcript.draftUser);
      setDraftAssistant(transcript.draftAssistant);
      if (content.interrupted) {
        stopPlayback();
        turnCompleteRef.current = false;
        completionPendingRef.current = false;
        window.clearTimeout(settleTimeoutRef.current);
        changeStatus('Listening');
      }
      for (const part of content.modelTurn?.parts || []) {
        const audio = part.inlineData;
        if (audio?.data && (audio.mimeType || '').startsWith('audio/pcm')) scheduleAudio(audio.data);
      }
      if (content.turnComplete) {
        completionPendingRef.current = true;
        turnCompleteRef.current = true;
        changeStatus(outputSourcesRef.current.size ? 'Speaking' : 'Thinking');
      } else if (content.waitingForInput) {
        changeStatus('Listening');
      } else if (content.modelTurn?.parts?.length) {
        changeStatus('Speaking');
      }
      // Gemini sends finalized input transcription independently, without a
      // guaranteed ordering relative to turnComplete. Keep a short settling
      // window and refresh it as the delayed transcript arrives.
      if (completionPendingRef.current && transcriptRef.current.snapshot().turnId) {
        window.clearTimeout(settleTimeoutRef.current);
        settleTimeoutRef.current = window.setTimeout(async () => {
          transcriptRef.current.apply({ turnComplete: true });
          const finalizedTurn = await persistCompletedTurn();
          completionPendingRef.current = false;
          if (isConversationEndIntent(finalizedTurn?.userText || '')) {
            closeAfterGoodbyeRef.current = true;
            goodbyeSavedRef.current = true;
            finishGoodbyeRef.current?.();
          }
        }, 1000);
      }
    }
    if (payload.toolCall?.functionCalls?.length) {
      changeStatus('Thinking');
      const functionResponses = await Promise.all(payload.toolCall.functionCalls.map(async (call) => {
        if (call.name !== 'search_vvnt_knowledge') {
          return { id: call.id, name: call.name, response: { error: 'Unsupported knowledge tool.' } };
        }
        try {
          const response = await fetch('/api/live/retrieve', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: call.args?.query, pageLink: call.args?.pageLink === true }),
          });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error || 'Knowledge search failed.');
          return { id: call.id, name: call.name, response: { result } };
        } catch {
          return { id: call.id, name: call.name, response: { error: 'VVnT SeQuor knowledge search failed. Do not guess the answer.' } };
        }
      }));
      if (socketRef.current?.readyState === WebSocket.OPEN) {
        socketRef.current.send(JSON.stringify({ toolResponse: { functionResponses } }));
      }
    }
    if (payload.goAway) {
      changeStatus('Reconnecting');
      setError('Gemini is closing this live connection. Reconnect to continue the conversation.');
    }
  }, [changeStatus, persistCompletedTurn, scheduleAudio, stopPlayback]);

  const startSession = useCallback(async (isReconnect = false) => {
    if (startingRef.current) return;
    startingRef.current = true;
    const generation = ++sessionGenerationRef.current;
    setStarting(true);
    setError('');
    setMuted(false);
    if (isReconnect) {
      transcriptRef.current.discard();
      turnCompleteRef.current = false;
      completionPendingRef.current = false;
      setDraftUser('');
      setDraftAssistant('');
    }
    disposeSession(true);
    intentionalCloseRef.current = false;
    mutedRef.current = false;
    changeStatus(isReconnect ? 'Reconnecting' : 'Connecting');
    try {
      if (!navigator.mediaDevices?.getUserMedia || !window.WebSocket) {
        throw new Error('Live Voice Mode needs a browser that supports microphone capture and WebSockets.');
      }
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) throw new Error('Live audio is not supported in this browser.');
      const tokenAbort = new AbortController();
      tokenAbortRef.current = tokenAbort;
      const tokenResponsePromise = fetch('/api/live/session', { method: 'POST', signal: tokenAbort.signal });
      const microphoneStreamPromise = requestMicrophone({ audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      } });
      let tokenResponse;
      let microphoneStream;
      try {
        [tokenResponse, microphoneStream] = await Promise.all([tokenResponsePromise, microphoneStreamPromise]);
      } catch (error) {
        microphoneStreamPromise.then((stream) => stream.getTracks().forEach((track) => track.stop())).catch(() => {});
        throw error;
      }
      if (tokenAbortRef.current === tokenAbort) tokenAbortRef.current = null;
      if (generation !== sessionGenerationRef.current) {
        microphoneStream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = microphoneStream;
      audioContextRef.current = new AudioContextClass();
      await audioContextRef.current.resume();
      if (generation !== sessionGenerationRef.current) return;
      const tokenPayload = await tokenResponse.json();
      if (!tokenResponse.ok) throw new Error(tokenPayload.error || 'Could not request a Gemini Live session.');
      pendingInitialHistoryRef.current = (messages || [])
        .filter((message) => ['user', 'assistant'].includes(message.sender) && message.text?.trim())
        .slice(-12)
        .map(({ sender, text }) => ({ sender, text: text.slice(0, 3000) }));

      const socket = new WebSocket(tokenPayload.websocketUrl);
      socketRef.current = socket;
      setupTimeoutRef.current = window.setTimeout(() => {
        setError('Gemini did not finish connecting in time. Check your network and reconnect.');
        changeStatus('Ended');
        disposeSession(true);
      }, 15_000);
      socket.onopen = () => {
        if (generation !== sessionGenerationRef.current) return;
        socket.send(JSON.stringify(buildGeminiLiveSetup(tokenPayload)));
      };
      socket.onmessage = async (event) => {
        if (generation !== sessionGenerationRef.current) return;
        try {
          const data = typeof event.data === 'string'
            ? event.data
            : event.data instanceof Blob
              ? await event.data.text()
              : event.data instanceof ArrayBuffer
                ? new TextDecoder().decode(event.data)
                : '';
          handleServerMessage(JSON.parse(data)).catch((exception) => {
            setError(getErrorMessage(exception));
            changeStatus('Ended');
            disposeSession(true);
          });
        } catch (exception) {
          console.warn('[Gemini Live] Could not decode server message', {
            dataType: event.data?.constructor?.name || typeof event.data,
            messageLength: typeof event.data === 'string' ? event.data.length : event.data?.byteLength || null,
          });
          setError('Gemini returned an unreadable live response. Reconnect to continue.');
          changeStatus('Ended');
          disposeSession(true);
        }
      };
      socket.onerror = () => {
        if (generation !== sessionGenerationRef.current) return;
        setError('The connection to Gemini Live failed. Check your network and reconnect.');
        changeStatus('Ended');
      };
      socket.onclose = (event) => {
        if (generation !== sessionGenerationRef.current) return;
        window.clearTimeout(setupTimeoutRef.current);
        if (socketRef.current === socket) {
          socketRef.current = null;
          disposeSession(false);
        }
        if (!intentionalCloseRef.current && statusRef.current !== 'Ended') {
          setError(event.code === 1008
            ? 'The Gemini Live session expired or was rejected. Reconnect to start a fresh session.'
            : 'The Gemini Live connection closed. Reconnect to continue.');
          changeStatus('Ended');
        }
      };

      const context = audioContextRef.current;
      const microphone = context.createMediaStreamSource(streamRef.current);
      const processor = context.createScriptProcessor(1024, 1, 1);
      const silentOutput = context.createGain();
      silentOutput.gain.value = 0;
      processor.onaudioprocess = (event) => {
        if (socket.readyState !== WebSocket.OPEN || !sessionReadyRef.current || mutedRef.current) return;
        const data = pcmToBase64(event.inputBuffer.getChannelData(0), context.sampleRate);
        socket.send(JSON.stringify({ realtimeInput: { audio: { data, mimeType: 'audio/pcm;rate=16000' } } }));
      };
      microphone.connect(processor);
      processor.connect(silentOutput);
      silentOutput.connect(context.destination);
      sourceRef.current = microphone;
      processorRef.current = processor;
      mutedOutputRef.current = silentOutput;
    } catch (exception) {
      if (generation !== sessionGenerationRef.current) return;
      disposeSession(true);
      changeStatus('Ended');
      setError(getErrorMessage(exception));
    } finally {
      startingRef.current = false;
      setStarting(false);
    }
  }, [changeStatus, disposeSession, handleServerMessage, messages]);

  const endSession = useCallback(() => {
    sessionGenerationRef.current += 1;
    closeAfterGoodbyeRef.current = false;
    completionPendingRef.current = false;
    persistCompletedTurn();
    disposeSession(true);
    transcriptRef.current.discard();
    setDraftUser('');
    setDraftAssistant('');
    setError('');
    changeStatus('Ended');
    onEnd?.();
  }, [changeStatus, disposeSession, onEnd, persistCompletedTurn]);

  endSessionRef.current = endSession;
  finishGoodbyeRef.current = () => {
    if (closeAfterGoodbyeRef.current && goodbyeSavedRef.current && outputSourcesRef.current.size === 0) {
      closeAfterGoodbyeRef.current = false;
      endSessionRef.current?.();
    }
  };

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    mutedRef.current = next;
    streamRef.current?.getAudioTracks().forEach((track) => { track.enabled = !next; });
  };

  const stopSpeaking = () => {
    stopPlayback();
    turnCompleteRef.current = false;
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ clientContent: { turnComplete: true } }));
    }
    changeStatus('Listening');
  };

  useEffect(() => () => {
    sessionGenerationRef.current += 1;
    startingRef.current = false;
    window.clearTimeout(settleTimeoutRef.current);
    persistTurnRef.current?.();
    transcriptRef.current.discard();
    disposeSession(true);
  }, [disposeSession]);

  useEffect(() => {
    if (previousSessionIdRef.current && previousSessionIdRef.current !== sessionId) {
      sessionGenerationRef.current += 1;
      disposeSession(true);
      transcriptRef.current.discard();
      setDraftUser('');
      setDraftAssistant('');
      setError('');
      changeStatus('Ended');
    }
    previousSessionIdRef.current = sessionId;
  }, [changeStatus, disposeSession, sessionId]);

  useEffect(() => {
    window.clearTimeout(autoStartTimerRef.current);
    if (!autoStart) return undefined;
    // Defer one tick so React StrictMode's development-only mount probe can
    // clean up without consuming a real Live token or leaving a socket behind.
    autoStartTimerRef.current = window.setTimeout(() => startSession(), 0);
    return () => window.clearTimeout(autoStartTimerRef.current);
    // Live startup is tied to the explicit transition into voice mode. Keeping
    // this effect independent from message updates prevents a new socket per turn.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart]);

  return (
    <section className="flex min-h-0 flex-1 flex-col bg-[#0b0f19]" aria-label="VVnT SeQuor AI Live Voice Mode">
      <div className="live-voice-stage flex flex-1 flex-col items-center justify-center gap-5 px-4 py-6 text-center">
        <div aria-hidden="true" className={`live-orb live-orb-${status.toLowerCase()} ${status === 'Listening' || status === 'Speaking' || status === 'Thinking' ? 'live-orb-active' : ''}`}>
          <div className="live-orb-core" />
        </div>
        <p className="text-xs font-medium text-slate-300" role="status" aria-live="polite">
          {status === 'Listening' ? 'Listening' : status === 'Speaking' ? 'Speaking' : status === 'Thinking' ? 'Thinking' : status === 'Ended' ? 'Live voice ended' : status}
        </p>
        {(status === 'Ended' || error) && (
          <div className="flex flex-wrap items-center justify-center gap-2">
            <button type="button" onClick={() => startSession(status === 'Reconnecting' || Boolean(error))} disabled={starting}
              className="inline-flex items-center gap-2 rounded-xl bg-[#a3e635] px-4 py-2 text-sm font-semibold text-[#0b0f19] transition hover:bg-[#8ece25] disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#a3e635]">
              <RefreshCw className={`h-4 w-4 ${starting ? 'animate-spin' : ''}`} />
              {starting ? 'Connecting…' : error ? 'Reconnect' : 'Start Live Conversation'}
            </button>
            {error && <button type="button" onClick={endSession}
              className="rounded-xl border border-[#22304a] px-4 py-2 text-sm font-medium text-slate-300 transition hover:border-[#a3e635]/60 hover:text-[#a3e635] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#a3e635]">
              Back to text chat
            </button>}
          </div>
        )}
        {error && <p role="alert" className="max-w-sm text-xs text-rose-300">{error}</p>}
      </div>
      {status !== 'Ended' && (
        <div className="live-voice-controls flex items-center gap-3 border-t border-[#22304a] bg-[#0b0f19] px-4 py-3">
          <div className="flex min-w-0 flex-1 items-center rounded-full border border-[#64748b] bg-[#141c2e] px-4 py-2.5 shadow-inner">
            <span className="min-w-0 flex-1 text-left text-sm text-slate-400">Ask VVnT SeQuor AI</span>
            <button type="button" onClick={endSession} aria-label="End live conversation" title="End live conversation"
              className="inline-flex shrink-0 items-center gap-2 rounded-full bg-slate-950 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#a3e635]">
              <span className="tracking-[0.18em] text-[10px] text-slate-300">••••••</span> End
            </button>
          </div>
          <button type="button" onClick={toggleMute} aria-label={muted ? 'Unmute microphone' : 'Mute microphone'} title={muted ? 'Unmute microphone' : 'Mute microphone'}
            className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full border transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#a3e635] ${muted ? 'border-rose-300/60 bg-rose-300/10 text-rose-200' : 'border-[#64748b] bg-[#141c2e] text-slate-200 hover:border-[#a3e635]/70 hover:text-[#a3e635]'}`}>
            {muted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
          </button>
        </div>
      )}
      <div className="sr-only" aria-live="polite" aria-label="Live conversation transcript">
        {draftUser} {draftAssistant}
      </div>
    </section>
  );
};
