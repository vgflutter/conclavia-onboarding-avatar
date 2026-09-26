import { test } from 'node:test';
import assert from 'node:assert/strict';
import { auditedMutation, buildClientAudit, buildServerAudit, parseClientAudit, safeAuditError, writeAudit } from '../src/lib/onboarding/audit';
import type { AuditEvent } from '../src/lib/onboarding/audit';
import { exampleFlow, defaultAvatar } from '../src/lib/onboarding/example';
import { applyInterpretation, confirmAnswer, publicSession, setAnswer } from '../src/lib/onboarding/engine';
import { InputError } from '../src/lib/onboarding/validation';
import type { Session, SessionView } from '../src/lib/onboarding/types';

function session(): Session {
  return { _id: 'session-a', siteId: 'tenant-a', subject: 'private-subject', flow: structuredClone(exampleFlow), avatar: defaultAvatar,
    context: 'private-context', siteName: 'Demo', returnUrl: 'https://demo.example/return', tokenHash: 'private-capability-hash',
    tokenExpiresAt: new Date(Date.now() + 1000), expiresAt: new Date(Date.now() + 10_000), createdAt: new Date(),
    consentAt: new Date().toISOString(), answers: {}, skipped: [], messages: [], operations: [], status: 'in_progress', revision: 3,
    turns: 0, speechRequests: 0, realtimeConnections: 0 };
}
function view(s: Session): SessionView { return publicSession({ ...s, revision: s.revision + 1 }); }

test('client telemetry allows held transcripts and old/new context but cannot forge server identity or metadata', () => {
  const parsed = parseClientAudit({ event: 'transcript_held', text: 'Seimila', questionId: 'new', previousQuestionId: 'old', revision: 1, reason: 'context_changed' });
  const s = session(), event = buildClientAudit(s, parsed);
  assert.equal(event.source, 'client'); assert.equal(event.siteId, s.siteId); assert.equal(event.revisionBefore, 3);
  assert.deepEqual(event.client, { questionId: 'new', previousQuestionId: 'old', revision: 1, reason: 'context_changed' });
  for (const key of ['source', 'action', 'siteId', 'sessionId', 'token', 'audio', 'sdp', 'deviceId', 'interpretation']) {
    assert.throws(() => parseClientAudit({ event: 'voice_error', [key]: 'forged' }), InputError);
  }
  for (const bad of [{ event: 'turn' }, { event: 'voice_error', reason: 'raw-error-secret' },
    { event: 'voice_error', text: 'x'.repeat(4001) }, { event: 'voice_error', questionId: 'q'.repeat(81) },
    { event: 'voice_error', previousQuestionId: '' }, { event: 'voice_error', revision: -1 },
    { event: 'voice_error', revision: 1.1 }, { event: 'voice_error', revision: '2' }]) assert.throws(() => parseClientAudit(bad), InputError);
});
test('server audit records answer changes and navigation without copying private context, identity or capabilities', () => {
  const s = session(), after = view(setAnswer(s, 'name', 'Mario'));
  const event = buildServerAudit(s, 'turn', after, { text: 'Mi chiamo Mario', inputMode: 'voice', latencyMs: 123,
    interpretation: { action: 'answer', questionId: 'name', valueJson: '"Mario"', explanation: '' } });
  assert.equal(event.outcome, 'saved'); assert.equal(event.questionBefore, 'name'); assert.equal(event.questionAfter, 'activity');
  assert.equal(event.revisionAfter, 4); assert.equal(event.inputMode, 'voice'); assert.equal(event.latencyMs, 123);
  assert.deepEqual(event.changedAnswers, [{ questionId: 'name', before: null, after: 'Mario' }]);
  assert.equal(event.expiresAt, s.expiresAt);
  for (const secret of ['private-subject', 'private-context', 'private-capability-hash']) assert.equal(JSON.stringify(event).includes(secret), false);
  assert.equal(Object.hasOwn(publicSession(s), 'audit'), false);
});
test('pending spoken values, rejection and later confirmation remain distinct outcomes', () => {
  const s = session(); s.flow.questions = [{ id: 'amount', title: 'Amount', type: 'number', required: true, min: 500 }];
  const interpreted = { action: 'answer' as const, questionId: 'amount', valueJson: '6000', explanation: '' };
  const pending = applyInterpretation(s, 'Seimila', interpreted);
  const proposal = buildServerAudit(s, 'turn', view(pending), { interpretation: interpreted, latencyMs: 1 });
  assert.equal(proposal.outcome, 'awaiting_confirmation'); assert.deepEqual(proposal.changedAnswers, []);
  assert.deepEqual(proposal.pendingAfter, { questionId: 'amount', value: 6000 });
  assert.equal(buildServerAudit(pending, 'confirm-answer', view(confirmAnswer(pending, false)), { latencyMs: 1 }).outcome, 'awaiting_replacement');
  const accepted = buildServerAudit(pending, 'confirm-answer', view(confirmAnswer(pending, true)), { latencyMs: 1 });
  assert.equal(accepted.outcome, 'saved'); assert.deepEqual(accepted.changedAnswers, [{ questionId: 'amount', before: null, after: 6000 }]);
});
test('clarifications, out-of-scope and rejected interpretations are not reported as saved answers', () => {
  for (const action of ['clarify', 'out_of_scope', 'answer'] as const) {
    const s = session(), interpretation = { action, questionId: 'name', valueJson: '{invalid}', explanation: '' };
    const event = buildServerAudit(s, 'turn', view(applyInterpretation(s, 'Dato di prova', interpretation)), { interpretation, latencyMs: 1 });
    assert.equal(event.outcome, action === 'answer' ? 'not_applied' : action);
    assert.deepEqual(event.changedAnswers, []);
  }
  const s = session(); assert.equal(buildServerAudit(s, 'answer', publicSession(s), { latencyMs: 1 }).outcome, 'replayed');
});
test('branch corrections retain removed answers in the audit difference', () => {
  let s = setAnswer(session(), 'name', 'Mario'); s = setAnswer(s, 'activity', 'business'); s = setAnswer(s, 'teamSize', 4);
  const event = buildServerAudit(s, 'answer', view(setAnswer(s, 'activity', 'personal')), { latencyMs: 1 });
  assert.deepEqual(event.changedAnswers?.find(change => change.questionId === 'teamSize'), { questionId: 'teamSize', before: 4, after: null });
});
test('audit errors expose safe codes only and never provider messages', () => {
  for (const error of [new Error('provider-secret'), new InputError('provider-secret', 503), new InputError('provider-secret', 400)]) {
    const event = buildServerAudit(session(), 'turn', undefined, { latencyMs: 2, error });
    assert.equal(event.outcome, 'error'); assert.equal(JSON.stringify(event).includes('provider-secret'), false);
  }
  assert.equal(safeAuditError(new InputError('secret', 409)), 'REVISION_CONFLICT');
  assert.equal(safeAuditError(new InputError('secret', 400)), 'VALIDATION_ERROR');
});
test('large Unicode answers and skipped lists cannot create unbounded audit events', () => {
  const s = session(), after = view(s);
  after.answers = Object.fromEntries(Array.from({ length: 100 }, (_, i) => ['field' + i, '😀'.repeat(3000)]));
  after.skipped = Array.from({ length: 100 }, (_, i) => ('skipped' + i).padEnd(80, 'x'));
  const event = buildServerAudit(s, 'turn', after, { text: '😀'.repeat(2000), latencyMs: 1,
    interpretation: { action: 'answer', questionId: 'name', valueJson: '😀'.repeat(4000), explanation: '😀'.repeat(350) } });
  assert.equal(event.truncated, true); assert.ok(Buffer.byteLength(JSON.stringify(event)) <= 32_000);
});
test('audit persistence refuses tenant/session/expiry substitution', async () => {
  const s = session(), event = buildClientAudit(s, { event: 'voice_started' }); let writes = 0;
  const store = async () => { writes++; return 'stored' as const; };
  for (const forged of [{ ...event, siteId: 'tenant-b' }, { ...event, sessionId: 'other' }, { ...event, expiresAt: new Date(Date.now() + 9999999) }]) {
    assert.equal(await writeAudit(s, forged, store), 'unavailable');
  }
  assert.equal(writes, 0); assert.equal(await writeAudit(s, event, store), 'stored'); assert.equal(writes, 1);
  assert.equal(await writeAudit(s, event, async () => { throw Error('database unavailable'); }), 'unavailable');
});
test('awaited audit failures cannot undo saved answers or mask the original operation error', async () => {
  const s = session(), after = view(setAnswer(s, 'name', 'Mario'));
  assert.equal(await auditedMutation(s, 'answer', async () => after, {}, async () => { throw Error('audit unavailable'); }), after);
  assert.equal(await auditedMutation(s, 'answer', async () => after, { interpretation: () => { throw Error('audit formatting'); } }), after);
  const original = new InputError('Answer rejected'); let recorded: AuditEvent | undefined;
  await assert.rejects(auditedMutation(s, 'answer', async () => { throw original; }, {}, async (_, event) => { recorded = event; throw Error('audit unavailable'); }), error => error === original);
  assert.equal(recorded?.errorCode, 'VALIDATION_ERROR');
  let stored = false;
  await auditedMutation(s, 'answer', async () => after, {}, async () => { await Promise.resolve(); stored = true; return 'stored'; });
  assert.equal(stored, true);
});
