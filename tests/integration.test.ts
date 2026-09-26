import test from 'node:test';
import assert from 'node:assert/strict';
import { validateIntegration } from '../src/lib/onboarding/integration';
import { InputError, validateOrigins } from '../src/lib/onboarding/validation';

test('integration preferences retain backward compatibility and validate return origins', () => {
  const origins = ['https://example.com'];
  assert.deepEqual(validateIntegration(undefined, origins), { mode: 'redirect', returnUrl: '' });
  assert.deepEqual(validateIntegration({ mode: 'iframe', returnUrl: 'https://example.com/return?flow=demo' }, origins),
    { mode: 'iframe', returnUrl: 'https://example.com/return?flow=demo' });
  for (const value of [null, { mode: 'popup', returnUrl: '' }, { mode: 'redirect', returnUrl: 'not a url' },
    ...['https://other.example/return', 'https://user:pass@example.com/return', 'https://example.com/return#secret', 'javascript:alert(1)']
      .map(returnUrl => ({ mode: 'redirect', returnUrl }))]) assert.throws(() => validateIntegration(value, origins));
  assert.throws(() => validateOrigins(['incomplete-domain']), error => error instanceof InputError && error.status === 400);
});
