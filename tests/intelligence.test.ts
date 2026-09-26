import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { interpret } from '../src/lib/onboarding/intelligence';
import { applyInterpretation } from '../src/lib/onboarding/engine';
import { defaultAvatar, exampleFlow } from '../src/lib/onboarding/example';
import type { Field, Interpretation, Session } from '../src/lib/onboarding/types';

function session(questions: Field[]): Session {
  return { _id: 'synthetic', siteId: 'synthetic', subject: 'synthetic', siteName: 'Synthetic', flow: { ...exampleFlow, questions },
    avatar: defaultAvatar, context: '', returnUrl: 'https://example.test/return', tokenHash: 'synthetic',
    createdAt: new Date(), expiresAt: new Date(), tokenExpiresAt: new Date(), answers: {}, skipped: [], messages: [], operations: [],
    status: 'in_progress', revision: 0, turns: 0, speechRequests: 0, realtimeConnections: 0 };
}
const amount: Field = { id: 'amount', title: 'Quale importo?', type: 'number', required: true, min: 0 };
const choice: Field = { id: 'choice', title: 'Quale modalità?', type: 'single_select', required: true, options: [{ id: 'manual', label: 'Manuale' }] };
type ProviderReply = Interpretation & { value: unknown };
function provider(t: TestContext, reply: ProviderReply) {
  const calls: { reasoning: { effort: string }; input: string }[] = [];
  for (const [name, value] of Object.entries({ ONBOARDING_AI_ENABLED: 'true', OPENAI_API_KEY: 'synthetic-no-provider-call' })) {
    const previous = process.env[name]; process.env[name] = value;
    t.after(() => { if (previous === undefined) delete process.env[name]; else process.env[name] = previous; });
  }
  t.mock.method(globalThis, 'fetch', async (_input: string | URL | Request, init?: RequestInit) => {
    calls.push(JSON.parse(String(init?.body)));
    return Response.json({ status: 'completed', output: [{ content: [{ type: 'output_text', text: JSON.stringify(reply) }] }] });
  });
  return calls;
}
const answer = (questionId: string, value: unknown): ProviderReply => ({ action: 'answer', questionId, value, valueJson: null, explanation: '' });

test('native numeric extraction uses low reasoning and retains cents as a number requiring confirmation', async t => {
  const s = session([amount, choice]);
  const calls = provider(t, answer('amount', 2000.25));
  const result = await interpret(s, 'duemila euro e venticinque centesimi');
  assert.equal(calls[0].reasoning.effort, 'low');
  assert.equal(JSON.parse(calls[0].input).currentQuestion.id, 'amount');
  const updated = applyInterpretation(s, 'duemila euro e venticinque centesimi', result);
  assert.equal(updated.pendingAnswer?.value, 2000.25);
  assert.deepEqual(updated.answers, {});
});

test('structured records request low reasoning without weakening field validation', async t => {
  const records: Field = { id: 'withdrawals', title: 'Quali prelievi?', type: 'records', required: true, fields: [amount] };
  const s = session([records]);
  const calls = provider(t, { ...answer('withdrawals', null), valueJson: JSON.stringify([{ amount: 1250.75 }]) });
  const result = await interpret(s, 'Un prelievo di 1250,75');
  assert.equal(calls[0].reasoning.effort, 'low');
  assert.deepEqual(applyInterpretation(s, 'Un prelievo di 1250,75', result).pendingAnswer?.value, [{ amount: 1250.75 }]);
});

test('a pending numeric confirmation keeps its own question context with low reasoning', async t => {
  const s = session([amount, choice]); s.answers.amount = 1000; s.pendingAnswer = { questionId: 'amount', value: 1250.75 };
  const calls = provider(t, { action: 'confirm_answer', questionId: 'amount', value: null, valueJson: null, explanation: '' });
  const result = await interpret(s, 'Sì, corretto');
  assert.equal(calls[0].reasoning.effort, 'low');
  assert.equal(JSON.parse(calls[0].input).currentQuestion.id, 'amount');
  const updated = applyInterpretation(s, 'Sì, corretto', result);
  assert.equal(updated.answers.amount, 1250.75);
  assert.equal(updated.status, 'in_progress');
});

test('selections use low reasoning for context classification and preserve their string option IDs', async t => {
  const s = session([choice]);
  const calls = provider(t, answer('choice', 'manual'));
  const result = await interpret(s, 'Manuale');
  assert.equal(calls[0].reasoning.effort, 'low');
  assert.equal(applyInterpretation(s, 'Manuale', result).answers.choice, 'manual');
});

test('a string-valued numeric reply is never coerced into a valid amount', async t => {
  const s = session([amount]); provider(t, answer('amount', '2000.25'));
  const result = await interpret(s, 'duemila euro e venticinque centesimi');
  const updated = applyInterpretation(s, 'duemila euro e venticinque centesimi', result);
  assert.deepEqual(updated.answers, {});
  assert.equal(updated.pendingAnswer, undefined);
});

test('native null cannot become a zero amount or overwrite a saved answer', async t => {
  const s = session([amount, choice]); s.answers.amount = 1000;
  provider(t, answer('amount', null));
  const result = await interpret(s, 'Non ricordo');
  assert.equal(result.valueJson, null);
  const updated = applyInterpretation(s, 'Non ricordo', result);
  assert.equal(updated.answers.amount, 1000);
  assert.equal(updated.pendingAnswer, undefined);
});

for (const value of [true, { amount: 2000 }, [2000], undefined]) {
  test(`invalid native value ${JSON.stringify(value)} is rejected before reaching the engine`, async t => {
    provider(t, answer('amount', value));
    await assert.rejects(() => interpret(session([amount]), 'duemila'), /Risposta non valida/);
  });
}

test('a previous selection corrected during a numeric question uses the selection type', async t => {
  const s = session([choice, amount]); s.answers.choice = 'manual';
  provider(t, answer('choice', 'manual'));
  const result = await interpret(s, 'Confermo manuale per la modalità precedente');
  assert.equal(result.valueJson, '"manual"');
  assert.equal(Object.hasOwn(result, 'value'), false);
  assert.equal(applyInterpretation(s, 'Confermo manuale per la modalità precedente', result).answers.choice, 'manual');
});

test('a previous numeric correction during a selection retains its number type and requires confirmation', async t => {
  const s = session([amount, choice]); s.answers.amount = 1000;
  provider(t, answer('amount', 2000.5));
  const result = await interpret(s, 'Correggi il precedente importo a 2000,50');
  const updated = applyInterpretation(s, 'Correggi il precedente importo a 2000,50', result);
  assert.equal(updated.pendingAnswer?.value, 2000.5);
  assert.equal(updated.answers.amount, 1000);
});

test('native text and multi-selection values are encoded internally without changing the public contract', async t => {
  const s = session([{ id: 'name', title: 'Name', required: true, type: 'text' }]);
  provider(t, answer('name', 'Alex'));
  const result = await interpret(s, 'My name is Alex.');
  assert.deepEqual(Object.keys(result).sort(), ['action', 'explanation', 'questionId', 'valueJson']);
  assert.equal(applyInterpretation(s, 'My name is Alex.', result).answers.name, 'Alex');
});

test('native multi-selection arrays preserve exact option IDs', async t => {
  const s = session([{ ...choice, type: 'multi_select' }]);
  provider(t, answer('choice', ['manual']));
  const result = await interpret(s, 'Manuale');
  assert.deepEqual(applyInterpretation(s, 'Manuale', result).answers.choice, ['manual']);
});

test('selection interpretation receives the published option order and preserves exact IDs for a categorical ordinal', async t => {
  const s = session([{ ...choice, options: [{ id: 'steady_strategy', label: 'Stabile' }, { id: 'flexible_strategy', label: 'Flessibile' }] }]);
  const calls = provider(t, answer('choice', 'steady_strategy'));
  const result = await interpret(s, '1.');
  assert.deepEqual(JSON.parse(calls[0].input).currentQuestion.options.map((option: { id: string }) => option.id), ['steady_strategy', 'flexible_strategy']);
  assert.equal(applyInterpretation(s, '1.', result).answers.choice, 'steady_strategy');
});

test('a bare integer with numeric options is clarified before any model call, without changing saved answers', async t => {
  const s = session([{ ...choice, options: [{ id: 'five_years', label: '5 anni' }, { id: 'one_year', label: '1 anno' }] }]);
  const calls = provider(t, answer('choice', 'five_years'));
  const result = await interpret(s, '1.');
  assert.equal(calls.length, 0);
  const updated = applyInterpretation(s, '1.', result);
  assert.deepEqual(updated.answers, {});
  assert.equal(updated.messages.at(-1)!.text, 'Intendi un valore o la posizione nell’elenco?');
});

test('numeric ambiguity preserves a pending answer and is localized for English', async t => {
  const s = session([{ ...choice, options: [{ id: 'five', label: '5 years' }, { id: 'one', label: '1 year' }] }]);
  s.flow.locale = 'en'; s.answers.choice = 'five'; s.pendingAnswer = { questionId: 'choice', value: 'one' };
  const calls = provider(t, answer('choice', 'five'));
  const result = await interpret(s, '1');
  const updated = applyInterpretation(s, '1', result);
  assert.equal(calls.length, 0);
  assert.equal(updated.answers.choice, 'five');
  assert.deepEqual(updated.pendingAnswer, s.pendingAnswer);
  assert.equal(result.explanation, 'Do you mean a value or a position in the list?');
});

test('an explicit ordinal remains interpretable when the options describe numeric values', async t => {
  const s = session([{ ...choice, options: [{ id: 'five', label: '5 anni' }, { id: 'one', label: '1 anno' }] }]);
  const calls = provider(t, answer('choice', 'five'));
  const result = await interpret(s, 'La prima');
  assert.equal(calls.length, 1);
  assert.equal(applyInterpretation(s, 'La prima', result).answers.choice, 'five');
});

test('a bare value outside the possible index range is not blocked by the ambiguity guard', async t => {
  const s = session([{ ...choice, options: [{ id: 'five', label: '5%' }, { id: 'forty', label: '40%' }] }]);
  const calls = provider(t, answer('choice', 'forty'));
  const result = await interpret(s, '40');
  assert.equal(calls.length, 1);
  assert.equal(applyInterpretation(s, '40', result).answers.choice, 'forty');
});

test('an exact numeric option label is not mistaken for an ambiguous index', async t => {
  const s = session([{ ...choice, options: [{ id: 'five', label: '5' }, { id: 'one', label: '1' }] }]);
  const calls = provider(t, answer('choice', 'one'));
  const result = await interpret(s, '1.');
  assert.equal(calls.length, 1);
  assert.equal(applyInterpretation(s, '1.', result).answers.choice, 'one');
});

test('bare amounts remain native numeric answers and still require confirmation', async t => {
  const s = session([amount]);
  const calls = provider(t, answer('amount', 1));
  const result = await interpret(s, '1.');
  assert.equal(calls.length, 1);
  assert.equal(applyInterpretation(s, '1.', result).pendingAnswer?.value, 1);
});

test('a percentage selection maps through the exact native ID without coercing it into an option position', async t => {
  const s = session([{ ...choice, options: [{ id: 'loss_5', label: '-5%' }, { id: 'loss_40', label: '-40%' }] }]);
  provider(t, answer('choice', 'loss_40'));
  const result = await interpret(s, '-40%');
  assert.equal(applyInterpretation(s, '-40%', result).answers.choice, 'loss_40');
});
