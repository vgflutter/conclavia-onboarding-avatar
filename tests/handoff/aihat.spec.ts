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
async function login(context: BrowserContext, email = 'synthetic@example.test') {
  const jwt = await encode({ secret: process.env.NEXTAUTH_SECRET, token: { email, sub: email, name: 'Cliente di prova' }, maxAge: 3600 });
  await context.addCookies([{ name: 'next-auth.session-token', value: jwt, domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax' }]);
}
async function launch(request: APIRequestContext, flow: 'risk' | 'portfolio', target: 'investor' | 'create'): Promise<Launch> {
  const res = await request.post(`${host}/api/bff/onboarding/sessions`, { headers: { origin: host }, data: { flow, target } });
  expect(res.status(), await res.text()).toBe(200); return res.json();
}
async function fill(request: APIRequestContext, session: Launch, supplied?: Answers) {
  const root = `${service}/api/v1/sessions/${session.sessionId}`;
  const headers = { origin: service, Authorization: `Bearer ${new URL(session.url).hash.slice(1)}` };
  let revision = 0;
  const post = async (action: string, data: Record<string, unknown>): Promise<SessionView> => {
    const res = await request.post(`${root}/${action}`, { headers, data: { ...data, revision, operationId: randomUUID() } });
    expect(res.ok(), await res.text()).toBeTruthy(); const view = await res.json(); revision = view.revision; return view;
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
  await page.getByRole('button', { name: 'Compila con l’avatar' }).click();
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
