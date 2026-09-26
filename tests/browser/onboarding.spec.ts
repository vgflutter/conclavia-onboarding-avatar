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
test('shared host is configurable, its assets seek correctly, and active snapshots remain immutable', async ({ page, request }) => {
  expect((await request.post('/api/admin/login', { headers, data: { token: process.env.ONBOARDING_ADMIN_TOKEN } })).ok()).toBe(true);
  const avatar = { ...defaultAvatar, appearance: 'conclavia_host', visualStyle: 'photoreal_host' };
  const created = await request.post('/api/admin/sites', { headers, data: { id: 'host-test', name: 'Host test', avatar, context: '', allowedOrigins: [origin] } });
  expect(created.status()).toBe(201);
  const data = await created.json();
  const launch = await create(request, data.apiKey);
  await page.goto(launch.url);
  await expect(page.getByTestId('photoreal-canvas')).toHaveAttribute('data-renderer-ready', 'true');
  const site = { ...data.site, avatar: defaultAvatar, id: 'host-test' };
  expect((await request.put('/api/admin/sites/host-test', { headers, data: site })).status()).toBe(200);
  await page.reload();
  await expect(page.getByTestId('avatar-photoreal')).toHaveAttribute('data-appearance', 'conclavia_host');
  const part = await request.get('/avatars/host-v1/avatar-welcome-it.mp4', { headers: { range: 'bytes=0-31' } });
  expect(part.status()).toBe(206); expect((await part.body()).length).toBe(32);
  expect((await request.get('/avatars/host-v1/manifest.json')).status()).toBe(404);
  // Invalid style/identity pairs never reach the stored site or future sessions.
  expect((await request.put('/api/admin/sites/host-test', { headers, data: { ...site, revision: site.revision + 1, avatar: { ...avatar, visualStyle: 'editorial' } } })).status()).toBe(400);
});
test('a customer completes the conditional onboarding, corrects a branch, reviews and confirms', async ({ page, request }) => {
  const launch = await create(request);
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(launch.url);
  await page.getByRole('checkbox').check(); await page.getByRole('button', { name: 'Continua scrivendo' }).click();
  await page.getByRole('textbox', { name: 'Come preferisci essere chiamato?' }).fill('Mario');
  await page.getByRole('button', { name: 'Conferma risposta' }).click();
  await page.getByRole('button', { name: 'Per la mia attività' }).click(); await page.getByRole('button', { name: 'Conferma risposta' }).click();
  await page.getByRole('spinbutton', { name: 'Quante persone' }).fill('4'); await page.getByRole('button', { name: 'Conferma risposta' }).click();
  await page.getByRole('textbox', { name: 'Quale risultato' }).fill('Preparare il primo accesso'); await page.getByRole('button', { name: 'Conferma risposta' }).click();
  await expect(page.getByRole('heading', { name: 'Rivediamo le tue risposte.' })).toBeVisible();
  await page.locator('[class*=reviewItem]').filter({ hasText: 'In quale contesto' }).getByRole('button', { name: 'Modifica' }).click();
  await page.getByRole('button', { name: 'Per me', exact: true }).click(); await page.getByRole('button', { name: 'Salva correzione' }).click();
  await expect(page.locator('[class*=reviewItem]').filter({ hasText: 'Quante persone' })).toHaveCount(0);
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
test('pending spoken answers persist, reject safely and require an explicit single-answer confirmation', async ({ request }) => {
  const launch = await create(request);
  const root = '/api/v1/sessions/' + launch.sessionId;
  const auth = { origin, Authorization: 'Bearer ' + new URL(launch.url).hash.slice(1) };
  const sessions = (await collections()).sessions;
  // Seed a synthetic interpreted proposal; the provider is deliberately absent in this suite.
  await sessions.updateOne({ _id: launch.sessionId }, { $set: {
    consentAt: 'yes', answers: { name: 'Test', activity: 'business' }, revision: 1,
    pendingAnswer: { questionId: 'teamSize', value: 4 },
  } });
  expect((await (await request.get(root, { headers: auth })).json()).pendingAnswer).toEqual({ questionId: 'teamSize', value: 4 });
  const rejected = await request.post(root + '/confirm-answer', { headers: auth, data: { accept: false, revision: 1, operationId: randomUUID() } });
  expect(rejected.status()).toBe(200);
  expect((await rejected.json()).pendingAnswer).toEqual({ questionId: 'teamSize', value: null });
  const badConfirm = await request.post(root + '/confirm-answer', { headers: auth, data: { accept: true, revision: 2, operationId: randomUUID() } });
  expect(badConfirm.status()).toBe(400);
  await sessions.updateOne({ _id: launch.sessionId }, { $set: { pendingAnswer: { questionId: 'teamSize', value: 7 } } });
  const op = randomUUID();
  const save = () => request.post(root + '/confirm-answer', { headers: auth, data: { accept: true, revision: 2, operationId: op } });
  const saved = await (await save()).json();
  expect(saved.answers.teamSize).toBe(7); expect(saved.pendingAnswer).toBeNull(); expect(saved.revision).toBe(3);
  expect((await (await save()).json()).revision).toBe(3);
  const reload = await (await request.get(root, { headers: auth })).json();
  expect(reload.pendingAnswer).toBeNull(); expect(reload.answers.teamSize).toBe(7);
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

test('integration preferences persist, reject disallowed returns and generate secret-free examples', async ({ page, request }) => {
  expect((await request.post('/api/admin/login', { headers, data: { token: process.env.ONBOARDING_ADMIN_TOKEN } })).ok()).toBe(true);
  const created = await request.post('/api/admin/sites', { headers, data: {
    id: 'integration-demo', name: 'Umatt · ambiente dimostrativo', avatar: defaultAvatar, context: '',
    allowedOrigins: ['https://demo.example'],
  } });
  expect(created.status()).toBe(201);
  const { site, apiKey } = await created.json();
  const preference = { ...site, integration: { mode: 'iframe', returnUrl: 'https://demo.example/onboarding/return' } };
  const saved = await request.put('/api/admin/sites/integration-demo', { headers, data: preference });
  expect(saved.status()).toBe(200);
  const current = (await saved.json()).site;
  expect((await request.put('/api/admin/sites/integration-demo', { headers, data: { ...current, allowedOrigins: ['https://other.example'] } })).status()).toBe(400);
  // An older caller omitting preferences must not erase the saved setup.
  const { integration: _, ...legacy } = current; void _;
  const updated = await request.put('/api/admin/sites/integration-demo', { headers, data: legacy });
  expect(updated.status()).toBe(200); expect((await updated.json()).site.integration).toEqual(preference.integration);
  await page.goto('/studio');
  await page.getByLabel('Chiave di accesso allo studio').fill(process.env.ONBOARDING_ADMIN_TOKEN!);
  await page.getByRole('button', { name: 'Accedi allo studio' }).click();
  await page.getByRole('combobox', { name: 'Sito', exact: true }).selectOption('integration-demo');
  await page.getByRole('button', { name: '04 Integrazione' }).click();
  await expect(page.getByRole('button', { name: /Dentro il tuo sito/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByLabel('Pagina di ritorno')).toHaveValue(preference.integration.returnUrl);
  await expect(page.getByText('Da eseguire con un cliente di test')).toBeVisible();
  await page.getByRole('button', { name: /Pagina Conclavia/ }).click();
  await page.getByRole('button', { name: /Salva modifiche/ }).click();
  await expect(page.getByText('Configurazione salvata.', { exact: false })).toBeVisible();
  await page.locator('summary').filter({ hasText: 'Per chi integra' }).click();
  await expect(page.locator('pre').first()).toContainText('CONCLAVIA_SITE_KEY');
  expect(await page.locator('body').innerText()).not.toContain(apiKey);
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Scarica guida di integrazione' }).click();
  expect((await download).suggestedFilename()).toBe('conclavia-integration.md');
  await page.locator('summary').filter({ hasText: 'Per chi integra' }).click();
  // Documentation capture: omit the development server's floating indicator.
  await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' });
  await page.screenshot({ path: 'test-results/integration-studio-demo.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/integration-studio-demo-mobile.png', fullPage: true });
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
    await frame.getByRole('checkbox').check(); await frame.getByRole('button', { name: 'Continua scrivendo' }).click();
    await frame.getByRole('textbox', { name: 'Come preferisci essere chiamato?' }).fill('Mario');
    await frame.getByRole('button', { name: 'Conferma risposta' }).click();
    await frame.getByRole('button', { name: 'Conferma tutte le risposte' }).click();
    await expect.poll(() => page.evaluate(() => (window as Window & { received?: unknown }).received)).toEqual({ type: 'conclavia.completed', sessionId: launch.sessionId });
  } finally { parent.closeAllConnections(); await new Promise<void>(resolve => parent.close(() => resolve())); }
});

test('a stale browser tab recovers the current answer without overwriting it', async ({ page, context, request }) => {
  const launch = await create(request);
  const auth = { origin, Authorization: `Bearer ${new URL(launch.url).hash.slice(1)}` };
  const root = `/api/v1/sessions/${launch.sessionId}`;
  expect((await request.post(`${root}/consent`, { headers: auth, data: { accept: true, revision: 0, operationId: randomUUID() } })).ok()).toBeTruthy();
  const second = await context.newPage();
  try {
    await page.goto(launch.url); await second.goto(launch.url);
    for (const tab of [page, second]) await tab.getByRole('button', { name: 'Scrivi invece' }).click();
    await page.getByRole('textbox', { name: 'Come preferisci essere chiamato?' }).fill('First confirmed');
    await second.getByRole('textbox', { name: 'Come preferisci essere chiamato?' }).fill('Stale replacement');
    await page.getByRole('button', { name: 'Conferma risposta' }).click();
    await expect(page.getByRole('heading', { name: 'In quale contesto userai il servizio?' })).toBeVisible();
    await second.getByRole('button', { name: 'Conferma risposta' }).click();
    await expect(second.locator('main').getByRole('alert')).toBeVisible();
    await expect(second.getByRole('heading', { name: 'In quale contesto userai il servizio?' })).toBeVisible();
    const current = await (await request.get(root, { headers: auth })).json();
    expect(current.answers.name).toBe('First confirmed'); expect(current.revision).toBe(2);
  } finally { await second.close(); }
});

test('published site changes do not alter an active session snapshot or reveal private context', async ({ request }) => {
  const first = await create(request);
  const before = await (await collections()).sessions.findOne({ _id: first.sessionId });
  if (!before) throw new Error('Missing synthetic session');
  const original = await (await collections()).sites.findOne({ _id: before.siteId });
  if (!original) throw new Error('Missing synthetic site');
  try {
    await (await collections()).sites.updateOne({ _id: before.siteId }, { $set: { context: 'Updated private synthetic context', avatar: { ...original.avatar, name: 'Updated host avatar' }, revision: 2 } });
    const second = await create(request);
    const after = await (await collections()).sessions.findOne({ _id: first.sessionId });
    const fresh = await (await collections()).sessions.findOne({ _id: second.sessionId });
    expect(after?.avatar).toEqual(before.avatar); expect(after?.context).toBe(before.context); expect(after?.flow).toEqual(before.flow);
    expect(fresh?.avatar.name).toBe('Updated host avatar');
    const view = await (await request.get(`/api/v1/sessions/${first.sessionId}`, { headers: { Authorization: `Bearer ${new URL(first.url).hash.slice(1)}` } })).json();
    expect(view.context).toBeUndefined(); expect(view.subject).toBeUndefined(); expect(view.tokenHash).toBeUndefined();
  } finally { await (await collections()).sites.replaceOne({ _id: original._id }, original); }
});

test('review is not completion and a confirmed result cannot be silently edited', async ({ request }) => {
  const launch = await create(request);
  const auth = { origin, Authorization: `Bearer ${new URL(launch.url).hash.slice(1)}` };
  const root = `/api/v1/sessions/${launch.sessionId}`;
  let revision = 0;
  const post = async (action: string, data: Record<string, unknown>) => {
    const response = await request.post(`${root}/${action}`, { headers: auth, data: { ...data, revision, operationId: randomUUID() } });
    expect(response.ok()).toBeTruthy(); const view = await response.json(); revision = view.revision; return view;
  };
  await post('consent', { accept: true }); await post('answer', { questionId: 'name', value: 'Confirmed customer' });
  await post('answer', { questionId: 'activity', value: 'personal' });
  const review = await post('answer', { questionId: 'goal', value: 'Start safely' }); expect(review.status).toBe('review');
  const resultUrl = `${root}/result?subject=fictional-user`;
  expect((await request.get(resultUrl, { headers: { Authorization: `Bearer ${key}` } })).status()).toBe(409);
  await post('complete', {});
  const final = await (await request.get(resultUrl, { headers: { Authorization: `Bearer ${key}` } })).json();
  expect(final.answers).toEqual({ name: 'Confirmed customer', activity: 'personal', goal: 'Start safely' });
  expect((await request.post(`${root}/answer`, { headers: auth, data: { revision, operationId: randomUUID(), questionId: 'name', value: 'Unconfirmed replacement' } })).status()).toBe(409);
  const unchanged = await (await request.get(resultUrl, { headers: { Authorization: `Bearer ${key}` } })).json();
  expect(unchanged.answers).toEqual(final.answers); expect(unchanged.confirmedAt).toBe(final.confirmedAt);
});
