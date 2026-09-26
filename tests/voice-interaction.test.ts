import test from 'node:test';
import assert from 'node:assert/strict';
import { voiceCommand, voiceContext } from '../src/lib/voice-interaction';
import type { SessionView } from '../src/lib/onboarding/types';

const session = {
  flow: { questions: [
    { id: 'income', title: 'Income', type: 'text', required: true },
    { id: 'amount', title: 'Amount', type: 'number', required: true },
  ] }, answers: {}, skipped: [], revision: 1, pendingAnswer: null,
} as unknown as SessionView;

test('a clarification on the same question does not invalidate a spoken answer', () => {
  assert.equal(voiceContext(session, 0), voiceContext({ ...session, revision: 2 }, 0));
});
test('different questions, confirmation values and microphone interactions invalidate old audio', () => {
  assert.notEqual(voiceContext(session, 0), voiceContext({ ...session, answers: { income: 'stable' } }, 0));
  assert.notEqual(voiceContext(session, 0), voiceContext(session, 1));
  const pending = { ...session, pendingAnswer: { questionId: 'amount', value: 500 } };
  assert.notEqual(voiceContext(pending, 0), voiceContext({ ...pending, pendingAnswer: { questionId: 'amount', value: 600 } }, 0));
  assert.notEqual(voiceContext(pending, 0), voiceContext({ ...pending, pendingAnswer: { questionId: 'amount', value: null } }, 0));
});
test('explicit Italian and English pause/repeat commands are recognized locally', () => {
  for (const text of ['Basta.', 'Metti in pausa!', 'Pause.', 'Stop']) assert.equal(voiceCommand(text), 'pause');
  for (const text of ['Ripeti la domanda.', 'Puoi ripetere?', 'Repeat the question!']) assert.equal(voiceCommand(text), 'repeat');
});
test('normal questionnaire answers are never swallowed as commands', () => {
  for (const text of ['Mi basta il quaranta per cento', 'Aspetterei', 'Wait', '-40%', 'Non so', 'Ripeti oppure passa oltre'])
    assert.equal(voiceCommand(text), null);
});
