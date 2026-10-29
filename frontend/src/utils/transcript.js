// Gemini Live can emit cumulative transcript snapshots or adjacent text
// fragments. Prefer provider offsets for event identity when they are present.
export const mergeTranscript = (previous, next) => {
  const before = (previous || '').trim();
  const after = (next || '').trim();
  if (!after) return before;
  if (!before) return after;
  if (after.startsWith(before)) return after;
  if (before.startsWith(after) || before === after) return before;

  const beforeWords = before.split(/\s+/);
  const afterWords = after.split(/\s+/);
  const maxOverlap = Math.min(beforeWords.length, afterWords.length);
  for (let size = maxOverlap; size > 0; size -= 1) {
    const left = beforeWords.slice(-size).join(' ').toLocaleLowerCase();
    const right = afterWords.slice(0, size).join(' ').toLocaleLowerCase();
    if (left === right) return [...beforeWords, ...afterWords.slice(size)].join(' ');
  }
  return `${before} ${after}`;
};

const offsetKey = (event) => {
  if (!event || (event.startOffset == null && event.endOffset == null)) return null;
  return `${JSON.stringify(event.startOffset ?? '')}:${JSON.stringify(event.endOffset ?? '')}`;
};

const offsetMilliseconds = (value) => {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value.endsWith('s')) return Number.parseFloat(value) * 1000;
  if (value && typeof value === 'object') {
    return Number(value.seconds || 0) * 1000 + Number(value.nanos || 0) / 1_000_000;
  }
  return null;
};

export class LiveTranscriptTurn {
  constructor(createId = () => globalThis.crypto?.randomUUID?.() || `turn_${Date.now()}_${Math.random().toString(36).slice(2)}`) {
    this.createId = createId;
    this.seenInput = new Set();
    this.seenOutput = new Set();
    this.reset();
  }

  reset() {
    this.turnId = null;
    this.userText = '';
    this.userDraft = '';
    this.assistantText = '';
    this.assistantFallback = '';
    this.completed = false;
    this.closed = false;
  }

  discard() {
    this.seenInput.clear();
    this.seenOutput.clear();
    this.lastCompletedInput = '';
    this.reset();
  }

  #ensureTurn() {
    if (this.closed) this.reset();
    this.turnId ||= this.createId();
  }

  #append(field, seen, event) {
    const value = (event?.text || '').trim();
    if (!value) return;
    const key = offsetKey(event);
    const signature = key && `${key}:${value}`;
    if (signature && seen.has(signature)) return;
    if (signature) seen.add(signature);
    const offsetStart = offsetMilliseconds(event?.startOffset);
    const offsetEnd = offsetMilliseconds(event?.endOffset);
    const endField = field === 'userText' ? 'lastInputEnd' : 'lastOutputEnd';
    const nextSegment = key && offsetStart != null && this[endField] != null && offsetStart >= this[endField];
    if (key && (nextSegment || this[field].trim() === value)) this[field] = `${this[field]} ${value}`.trim();
    else this[field] = mergeTranscript(this[field], value);
    if (offsetEnd != null) this[endField] = Math.max(this[endField] ?? offsetEnd, offsetEnd);
  }

  apply(serverContent = {}) {
    const input = serverContent.inputTranscription;
    const interim = serverContent.interimInputTranscription;
    if (this.closed && input?.text && !interim?.text && input.text.trim() === this.lastCompletedInput) return null;
    if (input?.text || interim?.text) this.#ensureTurn();

    if (serverContent.interrupted) {
      this.assistantText = '';
      this.assistantFallback = '';
    }

    if (input?.text) {
      this.#append('userText', this.seenInput, input);
      this.userDraft = this.userText;
    } else if (interim?.text && !this.userText) {
      // Interim transcription is a replaceable hypothesis, never a final chat turn.
      this.userDraft = interim.text.trim();
    }

    if (serverContent.outputTranscription?.text && !this.closed) {
      this.#ensureTurn();
      this.#append('assistantText', this.seenOutput, serverContent.outputTranscription);
    }
    if (!serverContent.outputTranscription?.text && !this.assistantText && !this.closed) {
      for (const part of serverContent.modelTurn?.parts || []) {
        if (part.text) this.assistantFallback = mergeTranscript(this.assistantFallback, part.text);
      }
    }

    if (serverContent.turnComplete && this.turnId && !this.completed && !this.closed) {
      this.completed = true;
      return { ...this.snapshot(), completed: true };
    }
    return null;
  }

  snapshot() {
    return {
      turnId: this.turnId,
      userText: this.userText.trim(),
      assistantText: (this.assistantText || this.assistantFallback).trim(),
      draftUser: this.userDraft,
      draftAssistant: this.assistantText || this.assistantFallback,
    };
  }

  consumeCompleted() {
    if (!this.completed) return null;
    const turn = this.snapshot();
    this.lastCompletedInput = turn.userText;
    this.closed = true;
    this.completed = false;
    this.turnId = null;
    this.userText = '';
    this.userDraft = '';
    this.assistantText = '';
    this.assistantFallback = '';
    return turn;
  }
}
