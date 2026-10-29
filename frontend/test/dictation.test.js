import test from 'node:test';
import assert from 'node:assert/strict';
import { finalizeDictationText, readDictationResults } from '../src/utils/dictation.js';

const result = (transcript, isFinal = false) => ({ 0: { transcript }, isFinal });

test('replaces interim hypotheses instead of appending repeated snapshots', () => {
  assert.equal(readDictationResults([result('hello')]).displayText, 'hello');
  assert.equal(readDictationResults([result('hello how')]).displayText, 'hello how');
  assert.equal(readDictationResults([result('hello how are you', true)]).displayText, 'hello how are you');
});

test('preserves finalized segments and only the current interim segment', () => {
  const transcript = readDictationResults([
    result('hello', true),
    result('how are you'),
  ], 'Please say');
  assert.equal(transcript.finalText, 'hello');
  assert.equal(transcript.interimText, 'how are you');
  assert.equal(transcript.displayText, 'Please say hello how are you');
  assert.equal(finalizeDictationText('Please say', transcript.finalText), 'Please say hello');
});

test('keeps legitimate repeated words while avoiding duplicate result snapshots', () => {
  const results = [result('hello hello how are you', true)];
  assert.equal(readDictationResults(results).displayText, 'hello hello how are you');
  assert.equal(readDictationResults(results).displayText, 'hello hello how are you');
});
