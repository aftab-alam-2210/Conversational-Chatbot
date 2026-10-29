const joinTranscriptParts = (...parts) => parts
  .map((part) => part.trim())
  .filter(Boolean)
  .join(' ');

export const readDictationResults = (results, baseText = '') => {
  const entries = Array.from(results || []);
  const finalized = entries.filter((result) => result.isFinal).map((result) => result[0]?.transcript || '');
  const interim = entries.filter((result) => !result.isFinal).map((result) => result[0]?.transcript || '');
  const finalText = joinTranscriptParts(...finalized);
  const interimText = joinTranscriptParts(...interim);

  return {
    finalText,
    interimText,
    displayText: joinTranscriptParts(baseText, finalText, interimText),
  };
};

export const finalizeDictationText = (baseText = '', finalizedText = '') => joinTranscriptParts(baseText, finalizedText);
