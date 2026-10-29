export const stopAudioSources = (sources, currentTime = 0) => {
  sources.forEach((source) => {
    try { source.stop(); } catch { /* already ended */ }
  });
  sources.clear();
  return currentTime;
};

export const cleanupMicrophoneResources = ({ processor, source, silentOutput, stream }) => {
  if (processor) {
    processor.onaudioprocess = null;
    try { processor.disconnect(); } catch { /* already disconnected */ }
  }
  for (const node of [source, silentOutput]) {
    try { node?.disconnect(); } catch { /* already disconnected */ }
  }
  stream?.getTracks().forEach((track) => {
    if (track.readyState !== 'ended') track.stop();
  });
};

// Raw Gemini Live WebSocket setup uses the API wire schema, where speechConfig
// belongs inside generationConfig (the server SDK's config shape differs).
export const buildGeminiLiveSetup = ({ model, voiceName = 'Aoede' }) => ({
  setup: {
    model: `models/${model}`,
    generationConfig: {
      responseModalities: ['AUDIO'],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName } } },
    },
    // The backend's ephemeral-token constraints request these transcripts;
    // include them in the actual WebSocket setup so both sides of the spoken
    // conversation can be synchronized into chat history.
    inputAudioTranscription: {},
    outputAudioTranscription: {},
    historyConfig: { initialHistoryInClientContent: true },
  },
});
