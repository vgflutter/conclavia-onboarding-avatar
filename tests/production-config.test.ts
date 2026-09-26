import { test } from 'node:test';
import assert from 'node:assert/strict';
import { productionErrors } from '../scripts/production-config.mjs';

const valid = {
  ONBOARDING_BASE_URL: 'https://onboarding.conclavia.me',
  MONGODB_URI: 'mongodb://private-mongo:27017',
  MONGODB_DB_NAME: 'synthetic_config_only',
  ONBOARDING_ADMIN_TOKEN: 'a'.repeat(48),
  ONBOARDING_SESSION_SECRET: 'b'.repeat(48),
  ONBOARDING_AI_ENABLED: 'false',
};
test('production preflight accepts injected configuration without connecting to any service', () => {
  assert.deepEqual(productionErrors(valid), []);
  assert.deepEqual(productionErrors({ ...valid, ONBOARDING_AI_ENABLED: 'true',
    OPENAI_API_KEY: 'synthetic', INWORLD_API_KEY: 'synthetic' }), []);
});
test('production launch rejects development, placeholder and ambiguous public origins', () => {
  for (const origin of ['', 'http://onboarding.conclavia.me', 'https://localhost',
    'https://onboarding.conclavia.example', 'https://onboarding.conclavia.me/path',
    'https://private:credential@onboarding.conclavia.me', 'https://onboarding.conclavia.me?q=1']) {
    assert.ok(productionErrors({ ...valid, ONBOARDING_BASE_URL: origin }).some(e => e.startsWith('ONBOARDING_BASE_URL')));
  }
});
test('production requires explicit database, independent admin/session credentials and provider selection', () => {
  for (const key of ['MONGODB_URI', 'MONGODB_DB_NAME', 'ONBOARDING_ADMIN_TOKEN',
    'ONBOARDING_SESSION_SECRET', 'ONBOARDING_AI_ENABLED']) {
    assert.ok(productionErrors({ ...valid, [key]: '' }).some(e => e.includes(key)));
  }
  assert.ok(productionErrors({ ...valid, ONBOARDING_SESSION_SECRET: valid.ONBOARDING_ADMIN_TOKEN }).length);
  assert.ok(productionErrors({ ...valid, ONBOARDING_ADMIN_TOKEN: 'replace-with-a-real-credential-at-least-32' }).length);
});
test('voice mode cannot launch without both providers or with an incompatible transcription model', () => {
  const voice = { ...valid, ONBOARDING_AI_ENABLED: 'true' };
  assert.equal(productionErrors(voice).length, 2);
  assert.ok(productionErrors({ ...voice, OPENAI_API_KEY: 'synthetic', INWORLD_API_KEY: 'synthetic',
    OPENAI_TRANSCRIPTION_MODEL: 'unsupported' }).some(e => e.startsWith('OPENAI_TRANSCRIPTION_MODEL')));
});
test('rejected configuration does not echo credentials, connection strings or URLs', () => {
  const hidden = 'private-material-never-print';
  const errors = productionErrors({ ...valid, ONBOARDING_BASE_URL: `https://${hidden}@host.invalid`,
    MONGODB_URI: hidden, ONBOARDING_ADMIN_TOKEN: hidden, ONBOARDING_SESSION_SECRET: hidden });
  assert.ok(errors.length >= 4);
  assert.ok(!JSON.stringify(errors).includes(hidden));
});
