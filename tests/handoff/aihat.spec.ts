import { expect, test, type APIRequestContext, type BrowserContext } from '@playwright/test';
import type { Answers, SessionView } from '../../src/lib/onboarding/types';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { collections } from '../../src/lib/onboarding/db';
import { hash } from '../../src/lib/onboarding/security';
import { defaultAvatar } from '../../src/lib/onboarding/example';
const require = createRequire(resolve('../aihat-client/package.json'));
type Launch = { sessionId: string; url: string };
const { encode } = require('next-auth/jwt');
const host = 'http://localhost:3114';
const service = 'http://localhost:3103';
async function login(context: BrowserContext, email = 'synthetic@example.test', locale: 'it' | 'en' = 'it') {
  const jwt = await encode({ secret: process.env.NEXTAUTH_SECRET, token: { email, sub: email, name: 'Cliente di prova' }, maxAge: 3600 });
  await context.addCookies([
    { name: 'next-auth.session-token', value: jwt, domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax' },
    { name: 'unmatt.uiLocale', value: locale, domain: 'localhost', path: '/' },
  ]);
}
async function launch(request: APIRequestContext, flow: 'risk' | 'portfolio', target: 'investor' | 'create'): Promise<Launch> {
  const res = await request.post(`${host}/api/bff/onboarding/sessions`, { headers: { origin: host }, data: { flow, target } });
  expect(res.status()).toBe(200); return res.json();
}
async function fill(request: APIRequestContext, session: Launch, supplied?: Answers) {
  const root = `${service}/api/v1/sessions/${session.sessionId}`;
  const headers = { origin: service, Authorization: `Bearer ${new URL(session.url).hash.slice(1)}` };
  let revision = 0;
  const post = async (action: string, data: Record<string, unknown>): Promise<SessionView> => {
    const res = await request.post(`${root}/${action}`, { headers, data: { ...data, revision, operationId: randomUUID() } });
    expect(res.ok()).toBeTruthy(); const view = await res.json(); revision = view.revision; return view;
  };
  const view = await post('consent', { accept: true });
  const answers: Answers = {};
  for (const q of view.flow.questions) {
    if (q.when && !q.when.values.includes(String(answers[q.when.field]))) continue;
    const value = supplied ? supplied[q.id] : q.type === 'multi_select' ? [q.options!.at(-1)!.id] : q.options!.at(-1)!.id;
    if (value === undefined) await post('answer', { questionId: q.id, skip: true });
    else { answers[q.id] = value; await post('answer', { questionId: q.id, value }); }
  }
  await post('complete', {}); return { view, answers };
}
test.beforeAll(async () => {
  await (await collections()).sites.insertOne({ _id: 'aihat-test', name: 'AIHat', keyHash: hash(process.env.CONCLAVIA_ONBOARDING_API_KEY!), allowedOrigins: [host], avatar: defaultAvatar, context: '', flows: [], revision: 1, updatedAt: new Date() });
});
test.afterAll(async () => {
  if (process.env.MONGODB_URI !== 'mongodb://127.0.0.1:27018' || !process.env.MONGODB_DB_NAME?.startsWith('onboarding_test_')) throw new Error('Unsafe cleanup');
  await mongoose.connection.db!.dropDatabase(); await mongoose.disconnect();
});
test('risk questionnaire returns to the actual AIHat review without overwriting the draft or saving it', async ({ page, context }) => {
  const request = context.request;
  await login(context);
  await page.goto(`${host}/investor?mode=edit`);
  await page.getByRole('button', { name: 'Inizia con l’avatar' }).click();
  await page.waitForURL(`${service}/s/**`);
  const sessionId = new URL(page.url()).pathname.split('/').at(-1);
  // The actual browser consumed the capability; resume through the authenticated host.
  const session = await launch(request, 'risk', 'investor');
  expect(session.sessionId).toBe(sessionId);
  const { view, answers } = await fill(request, session);
  await page.goto(`${host}/investor?mode=edit`);
  await page.goto(session.url);
  await page.getByRole('link', { name: 'Continua su AIHat' }).click();
  await expect(page).toHaveURL(new RegExp(`/investor.*onboardingSession=${session.sessionId}`));
  await expect(page.getByText('Risposte raccolte con l’avatar. Controlla il riepilogo e salva il profilo per applicarle.')).toBeVisible();
  const q = view.flow.questions[0]; const selected = q.options!.find(o => o.id === answers[q.id])!.label;
  await expect(page.getByText(selected, { exact: true })).toBeVisible();
  const writes = await (await request.get('http://localhost:3115/writes')).json(); expect(writes).toEqual([]);
  await page.screenshot({ path: 'test-results/aihat-review.png', fullPage: true });
});
test('portfolio returns to review; all-equity keeps its dedicated confirmation; another account cannot retrieve the result', async ({ page, context }) => {
  const request = context.request;
  await login(context);
  const values = { portfolioType: 'new', objective: 'moderate_growth', incomeNeed: 'none', horizonBucket: '3_7y', hasWithdrawal: 'no', amount: 12500, baseCurrency: 'CHF', riskUsage: 'auto', currencyHedge: 'dont_know', geos: ['global'], instruments: 'etf_only', allocationMode: 'auto', note: 'Preferenza sintetica di verifica' };
  const session = await launch(request, 'portfolio', 'create'); await fill(request, session, values);
  await page.goto(`${host}/portfolio/create?mode=new&onboardingSession=${session.sessionId}`);
  await expect(page.getByText('Risposte raccolte con l’avatar. Controllale prima di proseguire o generare il portafoglio.')).toBeVisible();
  await expect(page.getByText(/CHF 12[,.]500/, { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /Generate portfolio|Genera portafoglio/ })).toBeEnabled();
  const equity = await launch(request, 'portfolio', 'create'); await fill(request, equity, { ...values, riskUsage: 'all_equity' });
  await page.goto(`${host}/portfolio/create?mode=new&onboardingSession=${equity.sessionId}`);
  await expect(page.getByText('Hai richiesto un portafoglio interamente azionario. Conferma la scelta con il controllo dedicato qui sotto per proseguire.')).toBeVisible();
  await login(context, 'another-synthetic@example.test');
  await page.goto(`${host}/portfolio/create?mode=new&onboardingSession=${session.sessionId}`);
  await expect(page.getByText('Il percorso con avatar non è disponibile. Puoi proseguire con il questionario.')).toBeVisible();
  const writes = await (await request.get('http://localhost:3115/writes')).json(); expect(writes).toEqual([]);
});

async function configure(request: APIRequestContext, email: string, options: Record<string, unknown> = {}) {
  expect((await request.post('http://localhost:3115/__test/config', { data: { email, ...options } })).ok()).toBeTruthy();
}
async function writesFor(request: APIRequestContext, email: string) {
  return (await request.get('http://localhost:3115/writes', { params: { email } })).json() as Promise<{ path: string; body: { answers: unknown } }[]>;
}
const portfolioValues = { portfolioType: 'new', objective: 'moderate_growth', incomeNeed: 'none', horizonBucket: '3_7y', hasWithdrawal: 'no', amount: 12500, baseCurrency: 'CHF', riskUsage: 'auto', currencyHedge: 'dont_know', geos: ['global'], instruments: 'etf_only', allocationMode: 'auto' };

test('complete real risk UI, explicit host save and second avatar lead to portfolio review without creating investments', async ({ page, context }) => {
  test.setTimeout(150_000);
  const email = 'chain-avatar@example.test';
  await configure(context.request, email, { hasProfile: false }); await login(context, email);
  await page.goto(`${host}/portfolio/create?mode=new`);
  await page.getByRole('button', { name: 'Inizia con l’avatar' }).click();
  await page.waitForURL(`${service}/s/**`);
  const session = { sessionId: new URL(page.url()).pathname.split('/').at(-1)! };
  const record = await (await collections()).sessions.findOne({ _id: session.sessionId });
  if (!record) throw new Error('Synthetic session missing');
  const view = { flow: record.flow };
  const answers: Answers = {};
  await page.getByRole('checkbox').check(); await page.getByRole('button', { name: 'Continua scrivendo' }).click();
  for (const q of view.flow.questions) {
    await expect(page.getByRole('heading', { name: q.title, exact: true })).toBeVisible();
    const option = q.options!.at(-1)!;
    await page.getByRole('group', { name: q.title, exact: true }).getByRole('button').last().click();
    answers[q.id] = q.type === 'multi_select' ? [option.id] : option.id;
    await page.getByRole('button', { name: 'Conferma risposta' }).click();
  }
  await expect(page.getByRole('heading', { name: 'Rivediamo le tue risposte.' })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Conferma tutte le risposte' }).click();
  await page.getByRole('link', { name: 'Continua su AIHat' }).click();
  await expect(page.getByRole('heading', { name: 'Conferma profilo', exact: true })).toBeVisible();
  expect(await writesFor(context.request, email)).toEqual([]);
  await page.getByRole('button', { name: 'Avanti al portafoglio', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Continua con l’avatar', exact: true })).toBeVisible();
  const writes = await writesFor(context.request, email);
  expect(writes).toHaveLength(1); expect(writes[0].path).toBe('/api/v1/investor/risk-profile');
  expect(Object.keys(writes[0].body.answers as object)).toHaveLength(view.flow.questions.length);
  await page.getByRole('button', { name: 'Continua con l’avatar', exact: true }).click();
  await page.waitForURL(`${service}/s/**`);
  const second = await launch(context.request, 'portfolio', 'create');
  expect(second.sessionId).not.toBe(session.sessionId);
  await fill(context.request, second, portfolioValues);
  await page.goto(second.url); await page.reload(); await page.getByRole('link', { name: 'Continua su AIHat' }).click();
  await expect(page.getByRole('heading', { name: 'Revisione', exact: true })).toBeVisible();
  await expect(page.getByText(/CHF 12[,.]500/, { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Genera portafoglio', exact: true })).toBeEnabled();
  expect(await writesFor(context.request, email)).toHaveLength(1);
});

test('failed profile submit preserves review and retries once before allowing the manual portfolio route', async ({ page, context }) => {
  const email = 'retry-manual@example.test';
  await configure(context.request, email, { hasProfile: false, failProfileOnce: true }); await login(context, email);
  const risk = await launch(context.request, 'risk', 'create'); await fill(context.request, risk);
  await page.goto(`${host}/portfolio/create?mode=new&onboardingSession=${risk.sessionId}`);
  await page.getByRole('button', { name: 'Avanti al portafoglio', exact: true }).click();
  await expect(page.getByText('Errore di rete durante il salvataggio del profilo. Riprova.', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Conferma profilo', exact: true })).toBeVisible();
  expect(await writesFor(context.request, email)).toHaveLength(1);
  await page.getByRole('button', { name: 'Avanti al portafoglio', exact: true }).click();
  await page.getByRole('button', { name: 'Preferisco il questionario', exact: true }).click();
  await expect(page.getByRole('button', { name: /Costruisci da zero/ })).toBeVisible();
  await page.getByRole('button', { name: /Importa portafoglio/ }).click();
  await page.getByRole('button', { name: /Vai all'import/ }).click();
  await expect(page).toHaveURL(/\/portfolio\/import\?mode=new/);
  await expect(page.getByRole('heading', { name: 'Scegli come vuoi importarlo' })).toBeVisible();
  const writes = await writesFor(context.request, email);
  expect(writes).toHaveLength(2); expect(writes.every(w => w.path.endsWith('/risk-profile'))).toBe(true);
});

test('avatar import returns to the existing import form without inventing allocation or creating a portfolio', async ({ page, context }) => {
  const email = 'avatar-import@example.test'; await login(context, email);
  const session = await launch(context.request, 'portfolio', 'create');
  await fill(context.request, session, { portfolioType: 'import' });
  await page.goto(`${host}/portfolio/create?mode=new&onboardingSession=${session.sessionId}`);
  await page.getByRole('button', { name: /Vai all'import/ }).click();
  await expect(page).toHaveURL(/\/portfolio\/import\?mode=new/);
  await expect(page.getByRole('heading', { name: 'Scegli come vuoi importarlo' })).toBeVisible();
  expect(await writesFor(context.request, email)).toEqual([]);
  await page.getByRole('tab', { name: /ISIN per ISIN/ }).click();
  await page.getByPlaceholder('IE00BK5BQT80').fill('IE00B4L5Y983');
  await page.getByPlaceholder('1000', { exact: true }).fill('12500');
  await page.getByRole('button', { name: 'Analizza portafoglio', exact: true }).click();
  await expect(page).toHaveURL(/\/portfolio\/import\/review\?mode=new/);
  await expect(page.getByText('Synthetic imported ETF', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText('Synthetic imported ETF', { exact: true })).toBeVisible();
  const writes = await writesFor(context.request, email);
  expect(writes).toHaveLength(1); expect(writes[0].path).toBe('/api/v1/portfolio/import/analyze');
});

test('manual percentages and a planned withdrawal remain exact in host review after reload', async ({ page, context }) => {
  const email = 'allocation-review@example.test'; await login(context, email);
  const session = await launch(context.request, 'portfolio', 'create');
  await fill(context.request, session, { ...portfolioValues, allocationMode: 'manual', equities: 50, bonds: 30, commodities: 10, cash: 10, hasWithdrawal: 'yes', withdrawalAmount: 1250, withdrawalMonth: '2028-06', withdrawalProbability: 'probable' });
  await page.goto(`${host}/portfolio/create?mode=new&onboardingSession=${session.sessionId}`); await page.reload();
  await expect(page.getByRole('heading', { name: 'Revisione', exact: true })).toBeVisible();
  await expect(page.getByText(/Azioni 50%.*Obbligazioni 30%.*Materie prime 10%.*Liquidit/)).toBeVisible();
  await expect(page.getByText(/CHF 1[,.]?250.*2028-06/)).toBeVisible();
  expect(await writesFor(context.request, email)).toEqual([]);
});

test('unfinished session is rejected by the host; original service answers remain resumable', async ({ page, context }) => {
  const email = 'unfinished@example.test'; await login(context, email);
  const session = await launch(context.request, 'portfolio', 'create');
  await page.goto(`${host}/portfolio/create?mode=new&onboardingSession=${session.sessionId}`);
  await expect(page.locator('p[role=alert]')).toContainText('non è disponibile');
  expect(await writesFor(context.request, email)).toEqual([]);
  const resumed = await launch(context.request, 'portfolio', 'create'); expect(resumed.sessionId).toBe(session.sessionId);
  await page.goto(resumed.url); await expect(page.getByRole('checkbox')).not.toBeChecked();
});

test('English mobile host launch failure offers the manual route without disclosing server details', async ({ page, context }) => {
  const email = 'mobile-fallback@example.test'; await configure(context.request, email, { locale: 'en' });
  await login(context, email, 'en'); await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/api/bff/onboarding/sessions', route => route.fulfill({ status: 503, json: { error: 'private-synthetic-provider-detail' } }));
  await page.goto(`${host}/portfolio/create?mode=new`);
  await page.getByRole('button', { name: 'Start with the avatar', exact: true }).click();
  await expect(page.locator('p[role=alert]')).not.toContainText('private-synthetic-provider-detail');
  await page.getByRole('button', { name: /Start the questionnaire|Use the questionnaire|Continue the questionnaire/ }).click();
  await expect(page.getByRole('button', { name: /Build from zero/ })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await writesFor(context.request, email)).toEqual([]);
});

test('the manual questionnaire still reaches review and enforces the minimum capital', async ({ page, context }) => {
  const email = 'manual-create@example.test'; await login(context, email);
  await page.goto(`${host}/portfolio/create?mode=new`);
  await page.getByRole('button', { name: 'Inizia il questionario', exact: true }).click();
  await page.getByRole('button', { name: /Costruisci da zero/ }).click();
  await page.getByRole('button', { name: /^Avanti/ }).click();
  await page.getByRole('button', { name: /Crescita bilanciata/ }).click();
  await page.getByRole('button', { name: /No, preferisco accumulare/ }).click();
  await page.getByRole('button', { name: /^Avanti/ }).click();
  await page.getByRole('button', { name: /3-7 anni/ }).click();
  await page.getByPlaceholder('Capitale iniziale').fill('499');
  await expect(page.getByRole('button', { name: /^Avanti/ })).toBeDisabled();
  await page.getByPlaceholder('Capitale iniziale').fill('6000');
  await page.getByRole('button', { name: /^Avanti/ }).click();
  await page.getByRole('button', { name: /Non so, suggerisci tu/ }).click();
  await page.getByRole('button', { name: /^Avanti/ }).click();
  await page.getByRole('button', { name: /^Avanti/ }).click();
  await expect(page.getByRole('heading', { name: 'Revisione', exact: true })).toBeVisible();
  await expect(page.getByText(/(?:CHF|EUR|USD|GBP) 6[,.]?000/, { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Genera portafoglio', exact: true })).toBeEnabled();
  expect(await writesFor(context.request, email)).toEqual([]);
});
