import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateAvatar } from '../src/lib/onboarding/validation';
import { defaultAvatar } from '../src/lib/onboarding/example';

test('studio accepts photographic identities and rejects unavailable styles without rewriting voices', () => {
  for (const appearance of ['portrait_natural_male', 'portrait_natural_female']) {
    const value = { ...defaultAvatar, visualStyle: 'portrait_2_5d', appearance };
    assert.deepEqual(validateAvatar(value), value);
    assert.throws(() => validateAvatar({ ...value, visualStyle: 'editorial' }), /Personaggio non disponibile/);
  }
  assert.throws(() => validateAvatar({ ...defaultAvatar, visualStyle: 'sculpted_3d' }), /Aspetto non valido/);
  assert.equal(validateAvatar({ ...defaultAvatar, visualStyle: 'stylized_3d' }).visualStyle, 'stylized_3d');
});
