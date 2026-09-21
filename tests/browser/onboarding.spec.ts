import { expect, test, type APIRequestContext } from '@playwright/test';
import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { defaultAvatar, exampleFlow } from '../../src/lib/onboarding/example';
import { collections } from '../../src/lib/onboarding/db';
import { hash } from '../../src/lib/onboarding/security';

const origin = 'http://localhost:3103';
const headers = { origin };
let key: string, otherKey: string;
async function create(request: APIRequestContext, apiKey = key, subject = 'fictional-user') {
  const res = await request.post('/api/v1/sessions', { headers: { Authorization: `Bearer ${apiKey}` }, data: {
    subject, flow: exampleFlow, returnUrl: `${origin}/return`,
  } });
  expect(res.status()).toBe(201);
  return res.json() as Promise<{ sessionId: string; url: string }>;
}
test.beforeAll(async ({ request }) => {
  const login = await request.post('/api/admin/login', { headers, data: { token: process.env.ONBOARDING_ADMIN_TOKEN } });
  expect(login.ok()).toBeTruthy();
  for (const id of ['demo', 'other']) {
    const res = await request.post('/api/admin/sites', { headers, data: { id, name: id, avatar: defaultAvatar, context: 'Private onboarding context', allowedOrigins: [origin, 'http://localhost:3116'] } });
    expect(res.status()).toBe(201);
    const data = await res.json(); if (id === 'demo') key = data.apiKey; else otherKey = data.apiKey;
  }
});
test.afterAll(async () => {
  if (!process.env.MONGODB_DB_NAME?.startsWith('onboarding_test_') || process.env.MONGODB_URI !== 'mongodb://127.0.0.1:27018') throw new Error('Refuse unsafe test cleanup');
  const db = (await collections()).sites.dbName;
  expect(db).toBe(process.env.MONGODB_DB_NAME);
  await mongoose.connection.db!.dropDatabase(); await mongoose.disconnect();
});
test('a customer completes the conditional onboarding, corrects a branch, reviews and confirms', async ({ page, request }) => {
  const launch = await create(request);
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(launch.url);
  await page.getByRole('checkbox').check(); await page.getByRole('button', { name: 'Inizia il percorso' }).click();
  await page.getByRole('textbox', { name: 'Come preferisci essere chiamato?' }).fill('Mario');
  await page.getByRole('button', { name: 'Conferma risposta' }).click();
  await page.getByRole('button', { name: 'Per la mia attività' }).click(); await page.getByRole('button', { name: 'Conferma risposta' }).click();
  await page.getByRole('spinbutton', { name: 'Quante persone' }).fill('4'); await page.getByRole('button', { name: 'Conferma risposta' }).click();
  await page.getByRole('textbox', { name: 'Quale risultato' }).fill('Preparare il primo accesso'); await page.getByRole('button', { name: 'Conferma risposta' }).click();
  await expect(page.getByRole('heading', { name: 'Rivediamo le tue risposte.' })).toBeVisible();
  await page.locator('.review-item').filter({ hasText: 'In quale contesto' }).getByRole('button', { name: 'Modifica' }).click();
  await page.getByRole('button', { name: 'Per me', exact: true }).click(); await page.getByRole('button', { name: 'Salva correzione' }).click();
  await expect(page.locator('.review-item').filter({ hasText: 'Quante persone' })).toHaveCount(0);
  await page.reload(); await expect(page.getByRole('heading', { name: 'Rivediamo le tue risposte.' })).toBeVisible();
  await page.getByRole('button', { name: 'Conferma tutte le risposte' }).click();
  await expect(page.getByRole('heading', { name: 'Grazie per questo primo incontro.' })).toBeVisible();
  const result = await request.get(`/api/v1/sessions/${launch.sessionId}/result?subject=fictional-user`, { headers: { Authorization: `Bearer ${key}` } });
  expect(result.ok()).toBeTruthy(); expect((await result.json()).answers).toEqual({ name: 'Mario', activity: 'personal', goal: 'Preparare il primo accesso' });
  expect(errors).toEqual([]);
});
test('capabilities, ownership, consent, expiry and tenant isolation are enforced', async ({ request }) => {
  const launch = await create(request); const token = new URL(launch.url).hash.slice(1);
  const auth = { Authorization: `Bearer ${token}`, origin };
  expect((await request.get(`/api/v1/sessions/${launch.sessionId}`)).status()).toBe(401);
  expect((await request.post(`/api/v1/sessions/${launch.sessionId}/answer`, { headers: auth, data: { revision: 0, operationId: randomUUID(), questionId: 'name', value: 'Test' } })).status()).toBe(403);
  expect((await request.get(`/api/v1/sessions/${launch.sessionId}/result?subject=fictional-user`, { headers: { Authorization: `Bearer ${otherKey}` } })).status()).toBe(404);
  expect((await request.get(`/api/v1/sessions/${launch.sessionId}/result?subject=another-user`, { headers: { Authorization: `Bearer ${key}` } })).status()).toBe(404);
  expect((await request.post(`/api/v1/sessions/${launch.sessionId}/consent`, { headers: { ...auth, origin: 'https://evil.example' }, data: { accept: true } })).status()).toBe(403);
  const view = await (await request.get(`/api/v1/sessions/${launch.sessionId}`, { headers: auth })).json();
  expect(view.context).toBeUndefined(); expect(view.tokenHash).toBeUndefined(); expect(view.subject).toBeUndefined();
  await (await collections()).sessions.updateOne({ _id: launch.sessionId }, { $set: { tokenExpiresAt: new Date(0) } });
  expect((await request.get(`/api/v1/sessions/${launch.sessionId}`, { headers: auth })).status()).toBe(401);
  const resumed = await request.post(`/api/v1/sessions/${launch.sessionId}/resume`, { headers: { Authorization: `Bearer ${key}` }, data: { subject: 'fictional-user', flowVersion: exampleFlow.version } });
  expect(resumed.ok()).toBeTruthy(); expect(hash(new URL((await resumed.json()).url).hash.slice(1))).not.toBe(hash(token));
});
test('concurrent writes and retried operations cannot silently replace answers', async ({ request }) => {
  const launch = await create(request); const auth = { Authorization: `Bearer ${new URL(launch.url).hash.slice(1)}`, origin };
  const root = `/api/v1/sessions/${launch.sessionId}`;
  const op = randomUUID();
  const consent = await request.post(`${root}/consent`, { headers: auth, data: { revision: 0, operationId: op, accept: true } });
  expect((await consent.json()).revision).toBe(1);
  expect((await (await request.post(`${root}/consent`, { headers: auth, data: { revision: 0, operationId: op, accept: true } })).json()).revision).toBe(1);
  const responses = await Promise.all(['First', 'Second'].map(value => request.post(`${root}/answer`, { headers: auth, data: { revision: 1, operationId: randomUUID(), questionId: 'name', value } })));
  expect(responses.map(r => r.status()).sort()).toEqual([200, 409]);
  const final = await (await request.get(root, { headers: auth })).json(); expect(final.revision).toBe(2);
  expect((await request.post(`${root}/realtime`, { headers: auth, data: { sdp: 'not a real SDP' } })).status()).toBe(503);
});
test('studio and shared avatar assets render without duplicate React instances', async ({ page, request }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/studio'); await page.getByLabel('Chiave di accesso allo studio').fill(process.env.ONBOARDING_ADMIN_TOKEN!);
  await page.getByRole('button', { name: 'Accedi allo studio' }).click();
  await expect(page.getByRole('heading', { name: 'Un’accoglienza che ti somiglia.' })).toBeVisible();
  await page.getByRole('button', { name: 'Personaggio 3D', exact: true }).click();
  await expect(page.locator('canvas')).toBeVisible();
  const model = await request.get('/avatars/rigged-v1/male.glb'); expect(model.ok()).toBeTruthy(); expect((await model.body()).length).toBeGreaterThan(1_000_000);
  expect((await request.get('/avatars/rigged-v1/male.glb', { headers: { 'If-None-Match': model.headers().etag } })).status()).toBe(304);
  expect((await request.get('/avatars/rigged-v1/unknown.glb')).status()).toBe(404);
  await page.getByRole('button', { name: 'Ritratto 2.5D', exact: true }).click(); await expect(page.locator('canvas')).toBeVisible();
  const appearance = page.getByRole('combobox', { name: /^Personaggio/ });
  await expect(appearance.locator('option')).toHaveCount(4);
  const italianVoice = await page.getByRole('combobox', { name: /^Voce italiana/ }).inputValue();
  for (const identity of ['portrait_natural_male', 'portrait_natural_female']) {
    await appearance.selectOption(identity);
    await expect(page.getByTestId('avatar-portrait')).toHaveAttribute('data-appearance', identity);
    await expect(page.getByTestId('portrait-canvas')).toHaveAttribute('data-renderer-ready', 'true');
  }
  await page.getByRole('button', { name: 'Personaggio 3D', exact: true }).click();
  await expect(appearance).toHaveValue('business_clay_female');
  await expect(appearance.locator('option')).toHaveCount(2);
  await expect(page.getByRole('combobox', { name: /^Voce italiana/ })).toHaveValue(italianVoice);
  await page.getByRole('button', { name: 'Ritratto 2.5D', exact: true }).click();
  await appearance.selectOption('portrait_natural_female');
  await expect(page.getByTestId('portrait-canvas')).toHaveAttribute('data-renderer-ready', 'true');
  await page.screenshot({ path: 'test-results/studio.png', fullPage: true });
  expect(errors).toEqual([]);
});

test('an allowed cross-origin iframe completes and sends only its session ID to the parent', async ({ page, request }) => {
  const res = await request.post('/api/v1/sessions', { headers: { Authorization: `Bearer ${key}` }, data: {
    subject: 'fictional-embedded-user', flow: { ...exampleFlow, questions: exampleFlow.questions.slice(0, 1) }, returnUrl: 'http://localhost:3116/return',
  } });
  expect(res.status()).toBe(201);
  const launch = await res.json();
  const csp = (await request.get(launch.url.split('#')[0])).headers()['content-security-policy'];
  expect(csp).toContain('http://localhost:3116');
  // Use a real local parent: an intercepted document has no local address space in Chrome.
  const parent = createServer((_req, response) => { response.setHeader('Content-Type', 'text/html'); response.end(
    `<iframe id="onboarding" title="Onboarding" allow="microphone; camera" src="${launch.url}" style="width:100%;height:850px"></iframe>
    <script>window.addEventListener('message', e => {
      if (e.origin === '${origin}' && e.source === document.getElementById('onboarding').contentWindow) window.received = e.data;
    });</script>`); });
  await new Promise<void>(resolve => parent.listen(3116, 'localhost', resolve));
  try {
    await page.goto('http://localhost:3116/embed');
    const frame = page.frameLocator('#onboarding');
    await frame.getByRole('checkbox').check(); await frame.getByRole('button', { name: 'Inizia il percorso' }).click();
    await frame.getByRole('textbox', { name: 'Come preferisci essere chiamato?' }).fill('Mario');
    await frame.getByRole('button', { name: 'Conferma risposta' }).click();
    await frame.getByRole('button', { name: 'Conferma tutte le risposte' }).click();
    await expect.poll(() => page.evaluate(() => (window as Window & { received?: unknown }).received)).toEqual({ type: 'conclavia.completed', sessionId: launch.sessionId });
  } finally { parent.closeAllConnections(); await new Promise<void>(resolve => parent.close(() => resolve())); }
});
