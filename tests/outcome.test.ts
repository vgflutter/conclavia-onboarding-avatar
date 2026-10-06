import test from 'node:test';
import assert from 'node:assert/strict';
import { abandon, confirm, confirmAnswer, publicSession, setAnswer } from '../src/lib/onboarding/engine';
import { outcomeUrl } from '../src/lib/onboarding/outcome';
import { defaultAvatar, exampleFlow } from '../src/lib/onboarding/example';
import { validateIntegration } from '../src/lib/onboarding/integration';
import type { Session } from '../src/lib/onboarding/types';

const fixture = (): Session => ({ _id: 'synthetic-session', siteId: 'test', subject: 'opaque', flow: exampleFlow, avatar: defaultAvatar,
  context: '', siteName: 'Test', returnUrl: 'https://client.example/return?mode=new&onboardingStatus=old',
  abandonUrl: 'https://client.example/cancel?mode=new', tokenHash: 'private', tokenExpiresAt: new Date(Date.now() + 10000),
  expiresAt: new Date(Date.now() + 20000), createdAt: new Date(), answers: {}, skipped: [], messages: [], operations: [],
  status: 'in_progress', revision: 0, turns: 0, speechRequests: 0, realtimeConnections: 0 });

test('abandonment before consent is explicit, idempotent and cannot become confirmation', () => {
  const session = abandon(fixture());
  assert.equal(session.status, 'abandoned'); assert.ok(session.abandonedAt); assert.equal(session.confirmedAt, undefined);
  assert.equal(abandon(session), session);
  assert.throws(() => confirm(session)); assert.throws(() => setAnswer(session, 'name', 'changed'));
  assert.throws(() => confirmAnswer(session, true));
  const view = publicSession(session);
  assert.equal(view.abandonedAt, session.abandonedAt); assert.equal('subject' in view, false); assert.equal('tokenHash' in view, false);
});
test('confirmed sessions cannot be abandoned and preserve the original timestamp', () => {
  const session = { ...fixture(), status: 'completed' as const, confirmedAt: new Date().toISOString() };
  assert.throws(() => abandon(session)); assert.equal(confirm(session), session);
});
test('return callbacks contain only session and outcome, preserve host parameters and support separate abandonment URLs', () => {
  const view = publicSession(abandon(fixture()));
  const cancelled = new URL(outcomeUrl(view));
  assert.equal(cancelled.pathname, '/cancel'); assert.equal(cancelled.searchParams.get('mode'), 'new');
  assert.equal(cancelled.searchParams.get('onboardingStatus'), 'abandoned');
  assert.equal(cancelled.searchParams.get('onboardingSession'), view.id);
  const completed = new URL(outcomeUrl({ ...view, status: 'completed' }));
  assert.equal(completed.pathname, '/return'); assert.equal(completed.searchParams.get('onboardingStatus'), 'success');
  assert.equal([...completed.searchParams.keys()].length, 3); assert.equal(completed.hash, '');
});
test('both callback destinations must belong to the authorized site origins', () => {
  const integration = { mode: 'redirect', returnUrl: 'https://client.example/return', abandonUrl: 'https://client.example/cancel' };
  assert.deepEqual(validateIntegration(integration, ['https://client.example']), integration);
  for (const abandonUrl of ['https://other.example/cancel', 'https://user:pass@client.example/cancel', 'https://client.example/cancel#token'])
    assert.throws(() => validateIntegration({ ...integration, abandonUrl }, ['https://client.example']));
});
