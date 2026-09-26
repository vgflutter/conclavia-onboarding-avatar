import { test, expect } from '@playwright/test';

test('readiness checks Mongo and exposes only a minimal uncached status', async ({ request }) => {
  const response = await request.get('/api/health');
  expect(response.status()).toBe(200);
  expect(response.headers()['cache-control']).toContain('no-store');
  expect(await response.json()).toEqual({ status: 'ok' });
});
