const END_CONVERSATION_PATTERNS = [
  /^\s*(?:(?:ok(?:ay)?|alright|please)[,\s]*)?(?:end|finish|close|stop|terminate)(?:\s+(?:(?:this|that|the|our|my)\s+)?(?:chat|conversation|voice|session|call|it|here|now))?\s*[.!?]*\s*$/i,
  /\b(?:end|finish|close|stop|terminate)\s+(?:(?:this|the|our|my)\s+)?(?:chat|conversation|voice|session|call)\b/i,
  /\b(?:end|finish|close|stop)\s+(?:it|here|now)\b/i,
  /\b(?:thank(?:s| you)(?: very much)?|ok(?:ay)?\s+thank(?:s| you)?)\b[,.!\s]*(?:now\s+)?(?:you can\s+)?(?:end|finish|close|stop)\b/i,
  /\b(?:end|finish|close|stop)\b.{0,40}\b(?:thank(?:s| you)|goodbye|bye)\b/i,
  /\b(?:we can|you can|let's|lets)\s+(?:end|finish|close|stop)\b/i,
  /\b(?:that's all|that is all|i'm done|i am done|we're done|we are done|goodbye|good bye|bye for now|see you later)\b[.!\s]*$/i,
  /\b(?:that's enough|that is enough|i'm finished|i am finished|we can stop here)\b[.!\s]*$/i,
  /\b(?:ok|okay|alright)[,\s]+thank(?:s| you)(?: very much)?[.!\s]*$/i,
  /^\s*(?:(?:ok(?:ay)?|alright)[,\s]*)?thank(?:s| you)(?: very much)?[.!?\s]*$/i,
];

export const isConversationEndIntent = (text = '') =>
  END_CONVERSATION_PATTERNS.some((pattern) => pattern.test(text.trim()));
