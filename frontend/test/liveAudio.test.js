import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGeminiLiveSetup, cleanupMicrophoneResources, stopAudioSources } from '../src/utils/liveAudio.js';
import { LiveTranscriptTurn, mergeTranscript } from '../src/utils/transcript.js';

test('Gemini WebSocket setup nests speechConfig inside generationConfig', () => {
  const payload = buildGeminiLiveSetup({ model: 'gemini-live-example', voiceName: 'Aoede' });
  assert.equal(payload.setup.model, 'models/gemini-live-example');
  assert.deepEqual(payload.setup.generationConfig.responseModalities, ['AUDIO']);
  assert.equal(payload.setup.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName, 'Aoede');
  assert.equal(Object.hasOwn(payload.setup, 'speechConfig'), false);
});

test('interrupting playback stops and clears all queued audio sources', () => {
  let stopped = 0;
  const sources = new Set([
    { stop: () => { stopped += 1; } },
    { stop: () => { stopped += 1; } },
  ]);
  const nextTime = stopAudioSources(sources, 12.5);
  assert.equal(stopped, 2);
  assert.equal(sources.size, 0);
  assert.equal(nextTime, 12.5);
});

test('playback interruption tolerates sources that already ended', () => {
  const sources = new Set([{ stop: () => { throw new Error('already stopped'); } }]);
  assert.equal(stopAudioSources(sources, 0), 0);
  assert.equal(sources.size, 0);
});

test('microphone cleanup removes audio handlers, disconnects nodes, and stops tracks', () => {
  let disconnected = 0;
  let stopped = 0;
  const processor = { onaudioprocess: () => {}, disconnect: () => { disconnected += 1; } };
  const source = { disconnect: () => { disconnected += 1; } };
  const silentOutput = { disconnect: () => { disconnected += 1; } };
  const stream = { getTracks: () => [{ readyState: 'live', stop: () => { stopped += 1; } }] };
  cleanupMicrophoneResources({ processor, source, silentOutput, stream });
  assert.equal(processor.onaudioprocess, null);
  assert.equal(disconnected, 3);
  assert.equal(stopped, 1);
});

test('transcript reconciliation handles cumulative and overlapping updates', () => {
  assert.equal(mergeTranscript('hello', 'hello there'), 'hello there');
  assert.equal(mergeTranscript('hello there', 'there friend'), 'hello there friend');
  assert.equal(mergeTranscript('hello there', 'hello'), 'hello there');
  assert.equal(mergeTranscript('hello there', 'hello there'), 'hello there');
  assert.equal(mergeTranscript('I really really mean it', 'I really really mean it'), 'I really really mean it');
});

test('partial hypotheses are replaced and the finalized transcript persists once', () => {
  let id = 0;
  const turn = new LiveTranscriptTurn(() => `voice-${++id}`);
  turn.apply({ interimInputTranscription: { text: 'Where is' } });
  assert.equal(turn.snapshot().draftUser, 'Where is');
  turn.apply({ interimInputTranscription: { text: 'Where is your office' } });
  assert.equal(turn.snapshot().draftUser, 'Where is your office');
  turn.apply({ inputTranscription: { text: 'Where is your office?', startOffset: '0s', endOffset: '2s' } });
  assert.equal(turn.snapshot().userText, 'Where is your office?');
  turn.apply({ outputTranscription: { text: 'Our office is in Bengaluru.', startOffset: '2s', endOffset: '4s' } });
  const final = turn.apply({ turnComplete: true });
  assert.equal(final.assistantText, 'Our office is in Bengaluru.');
  assert.deepEqual(turn.consumeCompleted(), {
    turnId: 'voice-1', userText: 'Where is your office?', assistantText: 'Our office is in Bengaluru.',
    draftUser: 'Where is your office?', draftAssistant: 'Our office is in Bengaluru.',
  });
  assert.equal(turn.consumeCompleted(), null);
  assert.equal(turn.apply({ turnComplete: true }), null);
  assert.equal(turn.apply({
    inputTranscription: { text: 'Where is your office?', startOffset: '0s', endOffset: '2s' },
    outputTranscription: { text: 'Our office is in Bengaluru.', startOffset: '2s', endOffset: '4s' },
    turnComplete: true,
  }), null);
});

test('offset identity drops duplicate events while preserving legitimate repeated words', () => {
  const turn = new LiveTranscriptTurn(() => 'voice-offsets');
  const first = { text: 'yes', startOffset: '0s', endOffset: '300ms' };
  const repeated = { text: 'yes', startOffset: '350ms', endOffset: '600ms' };
  turn.apply({ inputTranscription: first });
  turn.apply({ inputTranscription: first });
  turn.apply({ inputTranscription: repeated });
  assert.equal(turn.snapshot().userText, 'yes yes');

  const repeatedSuffix = new LiveTranscriptTurn(() => 'voice-suffix');
  repeatedSuffix.apply({ inputTranscription: { text: 'say world', startOffset: '0s', endOffset: '1s' } });
  repeatedSuffix.apply({ inputTranscription: { text: 'world', startOffset: '1s', endOffset: '1.3s' } });
  assert.equal(repeatedSuffix.snapshot().userText, 'say world world');

  const answer = { text: 'Cloud support', startOffset: '1s', endOffset: '2s' };
  turn.apply({ outputTranscription: answer });
  turn.apply({ outputTranscription: answer });
  turn.apply({ outputTranscription: { text: 'is available.', startOffset: '2s', endOffset: '3s' } });
  assert.equal(turn.snapshot().assistantText, 'Cloud support is available.');
});

test('final transcript updates handle cumulative snapshots and delta fragments', () => {
  const turn = new LiveTranscriptTurn(() => 'voice-updates');
  turn.apply({ inputTranscription: { text: 'Tell me', startOffset: '0s', endOffset: '1s' } });
  turn.apply({ inputTranscription: { text: 'Tell me about', startOffset: '0s', endOffset: '2s' } });
  turn.apply({ inputTranscription: { text: 'VVnT', startOffset: '2s', endOffset: '3s' } });
  assert.equal(turn.snapshot().userText, 'Tell me about VVnT');
});

test('model text fallback is not duplicated when output transcription arrives later', () => {
  const turn = new LiveTranscriptTurn(() => 'voice-canonical');
  turn.apply({ inputTranscription: { text: 'What services do you offer?' } });
  turn.apply({ modelTurn: { parts: [{ text: 'We offer cloud support.' }] } });
  turn.apply({ outputTranscription: { text: 'We offer cloud support.' } });
  assert.equal(turn.snapshot().assistantText, 'We offer cloud support.');
});

test('reconnect discards an incomplete draft and accepts a fresh finalized turn', () => {
  let id = 0;
  const turn = new LiveTranscriptTurn(() => `reconnect-${++id}`);
  turn.apply({ interimInputTranscription: { text: 'unfinished phrase' } });
  turn.discard();
  assert.equal(turn.snapshot().draftUser, '');
  turn.apply({ inputTranscription: { text: 'new question', startOffset: '0s', endOffset: '1s' } });
  turn.apply({ outputTranscription: { text: 'new answer', startOffset: '1s', endOffset: '2s' } });
  assert.equal(turn.apply({ turnComplete: true }).turnId, 'reconnect-2');
});

test('interrupted output text is discarded before the next completed answer', () => {
  const turn = new LiveTranscriptTurn(() => 'voice-interruption');
  turn.apply({ inputTranscription: { text: 'first question' } });
  turn.apply({ outputTranscription: { text: 'partial answer' } });
  turn.apply({ interrupted: true });
  turn.apply({ inputTranscription: { text: 'first question, second question' } });
  turn.apply({ outputTranscription: { text: 'complete answer' } });
  assert.equal(turn.apply({ turnComplete: true }).assistantText, 'complete answer');
});
