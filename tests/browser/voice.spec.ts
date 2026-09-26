import { expect, test, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { applyInterpretation, confirm, confirmAnswer, message, publicSession, setAnswer } from '../../src/lib/onboarding/engine';
import { defaultAvatar } from '../../src/lib/onboarding/example';
import type { Interpretation, Session } from '../../src/lib/onboarding/types';

// Synthetic audio and provider events exercise the real browser player and state machine.
// They do not measure microphone recognition or a provider's conversational quality.
function fixture(locale: 'it' | 'en' = 'it'): Session {
  return {
    _id: randomUUID(), siteId: 'voice-test', subject: 'synthetic', siteName: 'unmatt', context: '',
    flow: { id: 'voice', version: '1', title: locale === 'it' ? 'Il tuo profilo investitore' : 'Your investor profile', locale,
      objective: 'Synthetic UX test', introduction: '', questions: [
        { id: 'income', type: 'single_select', required: true, title: locale === 'it' ? 'Quanto è stabile il tuo reddito?' : 'How stable is your income?',
          options: [{ id: 'stable', label: locale === 'it' ? 'Stabile' : 'Stable' }, { id: 'variable', label: locale === 'it' ? 'Variabile' : 'Variable' }] },
        { id: 'amount', type: 'number', required: true, title: locale === 'it' ? 'Quale capitale vuoi destinare?' : 'How much would you like to set aside?', min: 500 },
      ] },
    avatar: defaultAvatar, returnUrl: 'http://localhost:3103/return', answers: {}, skipped: [], messages: [],
    tokenHash: '', tokenExpiresAt: new Date(Date.now() + 3600_000), expiresAt: new Date(Date.now() + 3600_000),
    createdAt: new Date(), status: 'in_progress', revision: 0, turns: 0, speechRequests: 0, realtimeConnections: 0, operations: [],
  };
}
async function fakeMicrophone(page: Page, deny = false) {
  await page.addInitScript(({ deny }) => {
    type Harness = Window & { voiceEvent?: (event: Record<string, unknown>) => void; micTrack?: MediaStreamTrack; micRequested?: number };
    const w = window as Harness;
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { value: async () => {
      w.micRequested = (w.micRequested ?? 0) + 1;
      if (deny) throw new DOMException('Denied', 'NotAllowedError');
      const audio = new AudioContext();
      const stream = audio.createMediaStreamDestination().stream;
      w.micTrack = stream.getAudioTracks()[0];
      return stream;
    } });
    class Peer {
      connectionState = 'connected';
      channel = { readyState: 'open', onmessage: null as null | ((event: { data: string }) => void), onopen: null, onerror: null, send() {} };
      addTrack() {}
      createDataChannel() {
        w.voiceEvent = event => this.channel.onmessage?.({ data: JSON.stringify(event) });
        return this.channel;
      }
      async createOffer() { return { type: 'offer', sdp: 'synthetic' }; }
      async setLocalDescription() {}
      async setRemoteDescription() {}
      close() { this.connectionState = 'closed'; }
    }
    Object.defineProperty(window, 'RTCPeerConnection', { value: Peer });
  }, { deny });
}
async function emit(page: Page, type: string, item_id: string, extra: Record<string, unknown> = {}) {
  await page.evaluate(data => (window as Window & { voiceEvent?: (data: Record<string, unknown>) => void }).voiceEvent?.(data), { type, item_id, ...extra });
}
async function speak(page: Page, text: string) {
  const id = randomUUID();
  await emit(page, 'input_audio_buffer.speech_started', id);
  await emit(page, 'conversation.item.input_audio_transcription.delta', id, { delta: text });
  await emit(page, 'conversation.item.input_audio_transcription.completed', id, { transcript: text });
}
async function setup(page: Page, options: { locale?: 'it' | 'en'; deny?: boolean; resume?: boolean; failTurn?: boolean; failVoice?: boolean; host?: boolean } = {}) {
  let s = fixture(options.locale);
  if (options.host) s.avatar = { ...defaultAvatar, appearance: 'conclavia_host', visualStyle: 'photoreal_host' };
  s.messages = [message('assistant', s.flow.questions[0].title)];
  if (options.resume) s.consentAt = 'yes';
  const calls: string[] = [];
  const root = '/api/v1/sessions/' + s._id;
  await fakeMicrophone(page, options.deny);
  const samples = Buffer.alloc(24000 * 2 * 2);
  for (let i = 0; i < samples.length / 2; i++) samples.writeInt16LE(Math.round(Math.sin(i / 20) * 1200), i * 2);
  await page.route('**' + root + '**', async route => {
    const action = new URL(route.request().url()).pathname.slice(root.length + 1);
    calls.push(action || 'read');
    const data = route.request().method() === 'POST' ? route.request().postDataJSON() : {};
    if (action === 'events') return route.fulfill({ status: 202, json: { ok: true } });
    if (action === 'realtime') return route.fulfill({ json: { sdp: 'synthetic' } });
    if (action === 'speech') return options.failVoice ? route.fulfill({ status: 503, json: { error: 'provider detail must stay hidden' } }) :
      route.fulfill({ contentType: 'application/x-ndjson', body: JSON.stringify({ audio: samples.toString('base64'), ...(options.host ? { phones: [{ start: 0, end: 2, viseme: 'a' }] } : {}) }) + '\n' + JSON.stringify({ done: true }) + '\n' });
    if (action === 'consent') s = { ...s, consentAt: 'yes' };
    if (action === 'answer') s = setAnswer(s, data.questionId, data.value, data.skip);
    if (action === 'confirm-answer') s = confirmAnswer(s, data.accept);
    if (action === 'complete') s = confirm(s);
    if (action === 'turn') {
      if (options.failTurn) return route.fulfill({ status: 503, json: { error: 'provider detail must stay hidden' } });
      let interpretation: Interpretation;
      if (data.text === 'non so') interpretation = { action: 'clarify', questionId: 'income', valueJson: null, explanation: 'Pensa a quanto varia il tuo reddito.' };
      else if (data.text === 'stabile') interpretation = { action: 'answer', questionId: 'income', valueJson: '"stable"', explanation: '' };
      else if (data.text === 'sì') interpretation = { action: 'confirm_answer', questionId: 'amount', valueJson: null, explanation: '' };
      else interpretation = { action: 'answer', questionId: 'amount', valueJson: data.text === 'quindicimila' ? '15000' : '12500', explanation: '' };
      s = applyInterpretation(s, data.text, interpretation);
    }
    if (action) s.revision++;
    return route.fulfill({ json: publicSession(s) });
  });
  await page.goto('/s/' + s._id + '#' + 'v'.repeat(43));
  return { state: () => s, calls };
}
async function start(page: Page) {
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Inizia a parlare', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Metti in pausa' })).toBeVisible();
}

test('shared photoreal host follows session speech and clears articulation immediately on interruption', async ({ page }) => {
  await setup(page, { host: true });
  const canvas = page.getByTestId('photoreal-canvas');
  await expect(canvas).toHaveAttribute('data-renderer-ready', 'true');
  await expect(canvas).toHaveAttribute('data-mouth-weight', '0');
  await start(page);
  await expect(canvas).toHaveAttribute('data-viseme', 'a');
  await emit(page, 'input_audio_buffer.speech_started', randomUUID());
  await expect(canvas).toHaveAttribute('data-viseme', 'rest');
  await expect(canvas).toHaveAttribute('data-mouth-weight', '0');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'test-results/photoreal-onboarding-mobile.png', fullPage: true });
  await expect(page.getByTestId('avatar-photoreal')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('voice starts from consent, supports clarification, interruption, amount correction and explicit final review', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  const app = await setup(page);
  await page.screenshot({ path: 'test-results/voice-welcome.png', fullPage: true });
  expect(await page.evaluate(() => (window as Window & { micRequested?: number }).micRequested ?? 0)).toBe(0);
  await start(page);
  await expect(page.getByRole('status')).toHaveText('Sto parlando');
  await expect(page.getByRole('button', { name: 'Stabile', exact: true })).not.toBeVisible();
  await page.screenshot({ path: 'test-results/voice-desktop.png', fullPage: true });
  const interrupted = randomUUID();
  await emit(page, 'input_audio_buffer.speech_started', interrupted);
  await expect(page.getByRole('status')).toHaveText('Ti sto ascoltando…');
  await emit(page, 'conversation.item.input_audio_transcription.completed', interrupted, { transcript: 'non so' });
  await expect(page.locator('[class*=subtitles]')).toContainText('Pensa a quanto varia');
  expect(app.state().answers).toEqual({});
  await speak(page, 'stabile');
  await expect(page.getByRole('heading', { name: 'Quale capitale vuoi destinare?' })).toBeVisible();
  expect(app.state().answers.income).toBe('stable');
  await speak(page, 'dodicimila e cinquecento');
  await expect(page.getByRole('button', { name: 'Sì, corretto' })).toBeVisible();
  expect(app.state().answers.amount).toBeUndefined();
  await page.screenshot({ path: 'test-results/voice-confirmation.png', fullPage: true });
  await page.getByRole('button', { name: 'No, correggo' }).click();
  await expect(page.getByRole('button', { name: 'Sì, corretto' })).not.toBeVisible();
  await speak(page, 'quindicimila');
  await expect(page.locator('[class*=confirmation]')).toContainText('15.000');
  await speak(page, 'sì');
  await expect(page.getByRole('heading', { name: 'Rivediamo le tue risposte.' })).toBeVisible();
  expect(app.state().answers.amount).toBe(15000);
  expect(app.state().status).toBe('review');
  expect(await page.evaluate(() => (window as Window & { micTrack?: MediaStreamTrack }).micTrack?.readyState)).toBe('ended');
  await page.getByRole('button', { name: 'Conferma tutte le risposte' }).click();
  await expect(page.getByRole('heading', { name: 'Grazie per questo primo incontro.' })).toBeVisible();
  expect(app.state().status).toBe('completed');
  expect(await page.evaluate(() => (window as Window & { micTrack?: MediaStreamTrack }).micTrack?.readyState)).toBe('ended');
  expect(errors).toEqual([]);
});
test('pause drops late audio; switching to writing preserves an unsent selection and saved answers', async ({ page }) => {
  const app = await setup(page);
  await start(page);
  const late = randomUUID();
  await emit(page, 'input_audio_buffer.speech_started', late);
  await page.getByRole('button', { name: 'Metti in pausa' }).click();
  expect(await page.evaluate(() => (window as Window & { micTrack?: MediaStreamTrack }).micTrack?.enabled)).toBe(false);
  await page.getByRole('button', { name: 'Riprendi conversazione' }).click();
  await emit(page, 'conversation.item.input_audio_transcription.completed', late, { transcript: 'stabile' });
  await page.getByRole('button', { name: 'Mostra le opzioni' }).click();
  await page.getByRole('button', { name: 'Stabile', exact: true }).click();
  await page.getByRole('button', { name: 'Scrivi invece' }).click();
  await expect(page.getByRole('button', { name: 'Stabile', exact: true })).toHaveAttribute('aria-pressed', 'true');
  expect(app.calls.filter(c => c === 'turn')).toHaveLength(0);
  await page.getByRole('button', { name: 'Conferma risposta' }).click();
  await expect(page.getByRole('spinbutton')).toBeVisible();
  await page.getByRole('button', { name: 'Passa alla voce' }).click();
  await expect(page.getByRole('button', { name: 'Metti in pausa' })).toBeVisible();
  expect(app.state().answers).toEqual({ income: 'stable' });
});
test('microphone denial falls back to typing with a useful message and no provider details', async ({ page }) => {
  await setup(page, { deny: true });
  await page.getByRole('checkbox').check(); await page.getByRole('button', { name: 'Inizia a parlare', exact: true }).click();
  await expect(page.locator('main').getByRole('alert')).toContainText('permesso nel browser');
  await expect(page.getByRole('button', { name: 'Stabile', exact: true })).toBeVisible();
});
test('a transcript from the previous question is kept for review, never assigned to the next answer', async ({ page }) => {
  const app = await setup(page); await start(page);
  const old = randomUUID();
  await emit(page, 'input_audio_buffer.speech_started', old);
  await page.getByRole('button', { name: 'Mostra le opzioni' }).click();
  await page.getByRole('button', { name: 'Stabile', exact: true }).click();
  await page.getByRole('button', { name: 'Conferma risposta' }).click();
  await expect(page.getByRole('heading', { name: 'Quale capitale vuoi destinare?' })).toBeVisible();
  await emit(page, 'conversation.item.input_audio_transcription.completed', old, { transcript: 'stabile' });
  await expect(page.getByRole('textbox', { name: 'Scrivi una risposta o chiedi un chiarimento' })).toHaveValue('stabile');
  expect(app.state().answers).toEqual({ income: 'stable' });
  expect(app.calls.filter(c => c === 'turn')).toHaveLength(0);
});
test('mobile voice keeps the question and main controls visible without horizontal scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setup(page);
  await start(page);
  await expect(page.getByRole('heading', { name: 'Quanto è stabile il tuo reddito?' })).toBeInViewport();
  await expect(page.getByRole('button', { name: 'Scrivi invece' })).toBeInViewport();
  await page.screenshot({ path: 'test-results/voice-mobile.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test('failed interpretation keeps the transcript for retry without advancing', async ({ page }) => {
  const app = await setup(page, { failTurn: true }); await start(page); await speak(page, 'stabile');
  await expect(page.getByRole('textbox', { name: 'Scrivi una risposta o chiedi un chiarimento' })).toHaveValue('stabile');
  expect(app.state().answers).toEqual({});
  await expect(page.locator('main').getByRole('alert')).not.toContainText('provider');
});
test('switching to writing keeps a partial spoken reply as an editable draft', async ({ page }) => {
  const app = await setup(page); await start(page);
  const item = randomUUID();
  await emit(page, 'input_audio_buffer.speech_started', item);
  await emit(page, 'conversation.item.input_audio_transcription.delta', item, { delta: 'Il mio reddito è' });
  await page.getByRole('button', { name: 'Scrivi invece' }).click();
  await expect(page.getByRole('textbox', { name: 'Scrivi una risposta o chiedi un chiarimento' })).toHaveValue('Il mio reddito è');
  expect(app.state().answers).toEqual({});
});
test('reload requires a gesture before opening the microphone and mobile English controls fit', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setup(page, { locale: 'en', resume: true });
  await expect(page.getByRole('button', { name: 'Start conversation', exact: true })).toBeVisible();
  expect(await page.evaluate(() => (window as Window & { micRequested?: number }).micRequested ?? 0)).toBe(0);
  await page.getByRole('button', { name: 'Type instead' }).click();
  await page.getByRole('button', { name: 'Stable', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm answer' }).click();
  await expect(page.getByRole('spinbutton')).toBeVisible();
  await page.screenshot({ path: 'test-results/voice-mobile-en.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test('voice provider failure leaves the question readable and the microphone usable', async ({ page }) => {
  await setup(page, { failVoice: true }); await start(page);
  await expect(page.locator('main').getByRole('alert')).toContainText('La voce non è disponibile');
  await expect(page.getByRole('heading', { name: 'Quanto è stabile il tuo reddito?' })).toBeVisible();
  await expect(page.locator('main').getByRole('alert')).not.toContainText('provider');
});

test('a new typed draft survives the delayed response to the previous message', async ({ page }) => {
  const app = await setup(page);
  let release!: () => void;
  const delayed = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/turn', async route => { await delayed; await route.fallback(); });
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Continua scrivendo' }).click();
  const input = page.getByRole('textbox', { name: 'Scrivi una risposta o chiedi un chiarimento' });
  await input.fill('stabile');
  const pending = page.waitForRequest(request => request.url().endsWith('/turn'));
  await page.getByRole('button', { name: 'Invia', exact: true }).click(); await pending;
  try {
    await input.fill('Vorrei chiarire la prossima domanda');
  } finally { release(); }
  await expect(page.getByRole('heading', { name: 'Quale capitale vuoi destinare?' })).toBeVisible();
  await expect(input).toHaveValue('Vorrei chiarire la prossima domanda');
  expect(app.state().answers).toEqual({ income: 'stable' });
});


test('spoken pause and repeat control the avatar without answering the questionnaire', async ({ page }) => {
  const app = await setup(page); await start(page);
  const before = app.calls.filter(call => call === 'speech').length;
  await speak(page, 'Ripeti la domanda.');
  await expect.poll(() => app.calls.filter(call => call === 'speech').length).toBeGreaterThan(before);
  await speak(page, 'Basta.');
  await expect(page.getByRole('status')).toHaveText('In pausa');
  expect(await page.evaluate(() => (window as Window & { micTrack?: MediaStreamTrack }).micTrack?.enabled)).toBe(false);
  expect(app.calls.filter(call => call === 'turn')).toHaveLength(0);
  expect(app.state().answers).toEqual({});
  await page.getByRole('button', { name: 'Riprendi conversazione' }).click();
  await speak(page, 'stabile');
  await expect(page.getByRole('heading', { name: 'Quale capitale vuoi destinare?' })).toBeVisible();
});

test('a delayed clarification does not reject an answer already spoken to the same question', async ({ page }) => {
  const app = await setup(page); await start(page);
  let release!: () => void;
  const delayed = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/turn', async route => {
    if (route.request().postDataJSON().text === 'non so') await delayed;
    await route.fallback();
  });
  const request = page.waitForRequest(request => request.url().endsWith('/turn'));
  await speak(page, 'non so'); await request;
  const second = randomUUID();
  await emit(page, 'input_audio_buffer.speech_started', second);
  await emit(page, 'conversation.item.input_audio_transcription.delta', second, { delta: 'stabile' });
  release();
  await expect.poll(() => app.state().messages.some(message => message.text.includes('Pensa a quanto varia'))).toBe(true);
  await emit(page, 'conversation.item.input_audio_transcription.completed', second, { transcript: 'stabile' });
  await expect(page.getByRole('heading', { name: 'Quale capitale vuoi destinare?' })).toBeVisible();
  expect(app.state().answers.income).toBe('stable');
  await expect(page.getByRole('button', { name: 'Usa questa risposta' })).toHaveCount(0);
});
