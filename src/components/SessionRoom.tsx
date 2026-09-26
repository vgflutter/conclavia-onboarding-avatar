'use client';
import { useEffect, useRef, useState } from 'react';
import { BusinessAvatar } from './BusinessAvatar';
import { AnswerField, answerLabel } from './AnswerField';
import { sessionCopy } from './session-copy';
import type { SessionView } from '@/lib/onboarding/types';
import type { AvatarViseme } from '@/lib/avatar-visemes';
import { activeQuestions } from '@/lib/onboarding/validation';
import { playStreamingSpeech } from '@/lib/streaming-voice-player';
import { startTranscription, type LiveConnection } from '@/lib/live-transcription';
import { voiceCommand, voiceContext, voiceQuestion } from '@/lib/voice-interaction';
import styles from './SessionRoom.module.css';

const rest = { viseme: 'rest' as AvatarViseme, level: 0 };
function Microphone() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3m-4 0h8" /></svg>;
}

export function SessionRoom({ id }: { id: string }) {
  const [session, setSession] = useState<SessionView | null>(null);
  const current = useRef<SessionView | null>(null);
  const capability = useRef('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [accepted, setAccepted] = useState(false);
  const [mode, setMode] = useState<'voice' | 'text'>('voice');
  const [edit, setEdit] = useState('');
  const [options, setOptions] = useState(false);
  const [utterance, setUtterance] = useState('');
  const [heldTranscript, setHeldTranscript] = useState(false);
  const [partial, setPartial] = useState('');
  const partialText = useRef('');
  const [live, setLive] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  const [hearing, setHearing] = useState(false);
  const inputSpeaking = useRef(false);
  const [speaking, setSpeaking] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [frame, setFrame] = useState(rest);
  const [lastAnswer, setLastAnswer] = useState('');
  const speech = useRef<AbortController | null>(null);
  const connection = useRef<LiveConnection | null>(null);
  const connectingAbort = useRef<AbortController | null>(null);
  const audioContext = useRef<AudioContext | null>(null);
  const audioEnabled = useRef(false);
  const work = useRef(Promise.resolve());
  // An in-flight transcript belongs to one question and one microphone interaction.
  const interaction = useRef(0);
  const lastActivity = useRef(0);
  const liveStarted = useRef(0);
  const mounted = useRef(true);
  const endpoint = '/api/v1/sessions/' + id;
  const c = sessionCopy[session?.flow.locale ?? 'it'];
  const words = () => sessionCopy[current.current?.flow.locale ?? 'it'];

  function update(value: SessionView) {
    const previous = current.current;
    if (previous) {
      const changed = Object.keys(value.answers).find(key => JSON.stringify(value.answers[key]) !== JSON.stringify(previous.answers[key]));
      if (changed) setLastAnswer(changed);
    }
    current.current = value;
    setSession(value);
  }
  function questionContext() {
    return voiceContext(current.current, interaction.current);
  }
  function audit(event: string, reason: string, text?: string, previousQuestionId?: string) {
    const s = current.current;
    if (!s?.consentAt || !capability.current) return;
    void fetch(endpoint + '/events', {
      method: 'POST', keepalive: true, headers: { Authorization: 'Bearer ' + capability.current, 'Content-Type': 'application/json' },
      body: JSON.stringify({ event, reason, previousQuestionId, revision: s.revision, questionId: voiceQuestion(s) ?? undefined, ...(text ? { text: text.slice(0, 4000) } : {}) }),
    }).catch(() => undefined);
  }
  async function request(action = '', body?: unknown): Promise<SessionView & { sdp: string }> {
    const res = await fetch(endpoint + (action ? '/' + action : ''), {
      method: body ? 'POST' : 'GET', headers: { Authorization: 'Bearer ' + capability.current, 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}), cache: 'no-store',
    });
    if (!res.ok) throw Object.assign(new Error('Request failed'), { status: res.status });
    return res.json();
  }
  function stopSpeech() {
    speech.current?.abort();
    if (mounted.current) { setSpeaking(false); setPreparing(false); setFrame(rest); }
  }
  function updatePartial(value: string) {
    partialText.current = value;
    if (mounted.current) setPartial(value);
  }
  function stopMedia() {
    interaction.current++;
    inputSpeaking.current = false;
    audioEnabled.current = false;
    stopSpeech();
    connectingAbort.current?.abort(); connectingAbort.current = null;
    connection.current?.stop(); connection.current = null;
    void audioContext.current?.close().catch(() => undefined); audioContext.current = null;
    pausedRef.current = false;
    if (mounted.current) { setLive(false); setConnecting(false); setPaused(false); setHearing(false); updatePartial(''); }
  }
  function switchToText() {
    const draft = partialText.current.trim();
    if (draft) setUtterance(previous => previous ? previous + ' ' + draft : draft);
    audit('voice_stopped', 'mode_changed');
    stopMedia(); setMode('text'); setHeldTranscript(false);
  }

  useEffect(() => {
    mounted.current = true;
    const key = 'conclavia-session:' + id;
    const fragment = window.location.hash.slice(1);
    try {
      capability.current = /^[A-Za-z0-9_-]{43}$/.test(fragment) ? fragment : sessionStorage.getItem(key) || '';
      if (fragment) { sessionStorage.setItem(key, capability.current); history.replaceState(null, '', window.location.pathname); }
    } catch { capability.current = /^[A-Za-z0-9_-]{43}$/.test(fragment) ? fragment : ''; }
    void request().then(data => { if (mounted.current) update(data); })
      .catch(() => { if (mounted.current) setError(words().loadError); });
    const hide = () => stopMedia();
    window.addEventListener('pagehide', hide);
    const idle = setInterval(() => {
      if (connection.current && (Date.now() - lastActivity.current > 5 * 60_000 ||
        Date.now() - liveStarted.current > 30 * 60_000 || Date.now() > Date.parse(current.current?.expiresAt || ''))) {
        audit('voice_stopped', Date.now() > Date.parse(current.current?.expiresAt || '') ? 'session_expired' : 'idle_timeout');
        stopMedia(); setError(words().interrupted);
      }
    }, 10_000);
    return () => { mounted.current = false; clearInterval(idle); window.removeEventListener('pagehide', hide); stopMedia(); };
    // A capability belongs to this route and is never sent to the host site.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function say(s: SessionView) {
    if (!audioEnabled.current || pausedRef.current || inputSpeaking.current || s.status === 'completed') return;
    const last = s.messages.at(-1);
    if (last?.role !== 'assistant') return;
    stopSpeech();
    const controller = new AbortController(); speech.current = controller;
    setPreparing(true);
    try {
      await playStreamingSpeech({
        endpoint: endpoint + '/speech', payload: { messageId: last.id },
        headers: { Authorization: 'Bearer ' + capability.current }, signal: controller.signal,
        audioContext: audioContext.current ?? undefined,
        onFrame: (viseme, level) => { if (mounted.current && !controller.signal.aborted) setFrame({ viseme, level }); },
        onStart: () => { if (mounted.current && !controller.signal.aborted) { setPreparing(false); setSpeaking(true); } },
      });
    } catch {
      if (!controller.signal.aborted && mounted.current) setError(words().voiceError);
    } finally {
      if (speech.current === controller && mounted.current) { setPreparing(false); setSpeaking(false); setFrame(rest); }
    }
  }
  async function act(action: string, body: Record<string, unknown>) {
    if (!current.current || busyRef.current) return false;
    // Called only from events, after render; the compiler follows the shared callback as render code.
    // eslint-disable-next-line react-hooks/purity
    busyRef.current = true; setBusy(true); setError(''); lastActivity.current = Date.now(); stopSpeech();
    const started = interaction.current;
    try {
      const updated = await request(action, { ...body, revision: current.current.revision, operationId: crypto.randomUUID() });
      if (!mounted.current) return false;
      update(updated); setEdit(''); setOptions(false);
      if (!inputSpeaking.current) { setHearing(false); updatePartial(''); }
      if (updated.status === 'completed') {
        audit('voice_stopped', 'session_completed');
        stopMedia();
        if (window.parent !== window) window.parent.postMessage({ type: 'conclavia.completed', sessionId: id }, new URL(updated.returnUrl).origin);
      } else {
        // Final review is explicit: background speech must not change its answers.
        if (updated.status === 'review' && !updated.pendingAnswer) {
          audit('voice_stopped', 'review_started');
          connection.current?.stop(); connection.current = null;
          connectingAbort.current?.abort(); connectingAbort.current = null;
          setLive(false);
        }
        if (action !== 'consent' && started === interaction.current && !inputSpeaking.current) void say(updated);
      }
      return true;
    } catch (e) {
      const status = (e as { status?: number }).status;
      if (mounted.current) setError(status === 401 ? words().expired : status === 409 ? words().conflict :
        status === 400 ? words().validationError : words().requestError);
      if (status === 409) { const fresh = await request().catch(() => null); if (fresh && mounted.current) update(fresh); }
      return false;
    } finally { busyRef.current = false; if (mounted.current) setBusy(false); }
  }
  async function prepareAudio() {
    audioContext.current ??= new AudioContext({ sampleRate: 24000, latencyHint: 'interactive' });
    await audioContext.current.resume();
  }
  function keepTranscript(text: string, message: string, reason = 'request_failed', capturedContext?: string) {
    let previousQuestionId: string | undefined;
    try {
      const question = capturedContext ? JSON.parse(capturedContext)[0] : null;
      if (typeof question === 'string') previousQuestionId = question;
    } catch { /* Older clients may use a different capture context. */ }
    audit('transcript_held', reason, text, previousQuestionId);
    stopMedia(); setUtterance(text); setHeldTranscript(true); setError(message);
  }
  async function startAudio() {
    if (connectingAbort.current || connection.current || busyRef.current) return;
    setMode('voice'); setError(''); setConnecting(true); setPaused(false); pausedRef.current = false;
    const controller = new AbortController(); connectingAbort.current = controller;
    try {
      await prepareAudio();
      const conn = await startTranscription({
        signal: controller.signal,
        negotiate: async sdp => (await request('realtime', { sdp })).sdp,
        question: questionContext,
        onSpeech: () => { inputSpeaking.current = true; lastActivity.current = Date.now(); stopSpeech(); setHearing(true); },
        onSpeechEnd: () => { inputSpeaking.current = false; setHearing(false); },
        onPartial: updatePartial,
        onError: () => { audit('voice_error', 'recognition_failed'); switchToText(); setError(words().voiceError); },
        onText: (transcript, originalQuestion) => {
          work.current = work.current.then(async () => {
            if (controller.signal.aborted || !mounted.current || pausedRef.current) return;
            const command = voiceCommand(transcript);
            if (command) {
              audit('voice_command', command === 'pause' ? 'pause_command' : 'repeat_command', transcript);
              updatePartial('');
              if (command === 'pause') togglePause();
              else if (current.current) void say(current.current);
              return;
            }
            if (originalQuestion !== questionContext() || busyRef.current) {
              keepTranscript(transcript, words().checkTranscript, 'context_changed', originalQuestion); return;
            }
            const ok = await act('turn', { text: transcript, source: 'voice' });
            if (!ok && mounted.current) keepTranscript(transcript, words().requestError);
          }).catch(() => { if (mounted.current) keepTranscript(transcript, words().requestError); });
        },
      });
      if (controller.signal.aborted) { conn.stop(); return; }
      connection.current = conn; audioEnabled.current = true; setHeldTranscript(false);
      audit('voice_started', 'user_action');
      // Called only from events, after render; the compiler follows the shared callback as render code.
      // eslint-disable-next-line react-hooks/purity
      liveStarted.current = Date.now(); lastActivity.current = Date.now(); setLive(true);
      if (current.current) void say(current.current);
    } catch (e) {
      const cancelled = controller.signal.aborted;
      if (!cancelled) {
        audit('voice_error', (e as { name?: string }).name === 'NotAllowedError' ? 'permission_denied' : 'connection_failed');
        switchToText();
        setError((e as { name?: string }).name === 'NotAllowedError' ? words().micError : words().voiceError);
      }
    } finally {
      if (connectingAbort.current === controller) {
        if (!connection.current) connectingAbort.current = null;
        if (mounted.current) setConnecting(false);
      }
    }
  }
  async function begin(voice: boolean) {
    if (busyRef.current) return;
    // Resume playback from the click gesture, before awaiting the consent request.
    if (voice) {
      try { await prepareAudio(); } catch { voice = false; }
    }
    const ok = await act('consent', { accept: true });
    if (!ok) { stopMedia(); return; }
    if (voice) await startAudio(); else switchToText();
  }
  function togglePause() {
    const next = !pausedRef.current;
    interaction.current++; pausedRef.current = next; connection.current?.mute(next);
    inputSpeaking.current = false;
    // Called only from events, after render; the compiler follows the shared callback as render code.
    // eslint-disable-next-line react-hooks/purity
    stopSpeech(); setPaused(next); setHearing(false); updatePartial(''); lastActivity.current = Date.now();
    audit(next ? 'voice_paused' : 'voice_resumed', 'user_action');
    if (!next && current.current) void say(current.current);
  }
  function editAnswer(questionId: string) { switchToText(); setEdit(questionId); setError(''); }

  if (!session) return <main className={styles.room}><div className={styles.loading} role="status">{error || c.loading}</div></main>;
  const locale = session.flow.locale;
  const questions = activeQuestions(session.flow, session.answers);
  const next = questions.find(q => !Object.hasOwn(session.answers, q.id) && !session.skipped.includes(q.id));
  const field = questions.find(q => q.id === (edit || session.pendingAnswer?.questionId)) ?? next;
  const answered = questions.filter(q => Object.hasOwn(session.answers, q.id) || session.skipped.includes(q.id)).length;
  const reviewing = !field;
  const recent = questions.find(q => q.id === lastAnswer && Object.hasOwn(session.answers, q.id));
  const pending = !edit && session.pendingAnswer?.value != null ? session.pendingAnswer : null;
  const spokenText = session.messages.at(-1)?.text ?? '';
  // The fixed question already captions that sentence. Keep only the additional speech below it.
  const subtitle = field && spokenText.endsWith(field.title) ? spokenText.slice(0, -field.title.length).trim() : spokenText;
  const status = reviewing ? c.reviewing : paused ? c.paused : busy ? c.thinking : connecting || preparing ? c.preparing :
    speaking ? c.speaking : hearing ? c.hearing : live ? c.listening : c.ready;
  const returnToSite = new URL(session.returnUrl); returnToSite.searchParams.set('onboardingSession', id);
  const avatar = <BusinessAvatar language={locale} appearance={session.avatar.appearance} visualStyle={session.avatar.visualStyle} mood="friendly"
    viseme={frame.viseme} voiceLevel={frame.level} ariaLabel={session.avatar.name} />;

  return <main className={styles.room} lang={locale}>
    <header className={styles.header}><a className={styles.brand} href={session.returnUrl} onClick={stopMedia}><span />{session.siteName}</a>
      <span>{session.flow.title}</span><a className={styles.exit} href={session.returnUrl} onClick={stopMedia}>{c.return} ↗</a></header>
    {!session.consentAt ? <section className={styles.welcome}>
      <div className={styles.welcomeAvatar}>{avatar}</div>
      <div className={styles.eyebrow}>{session.avatar.name} · {c.virtual}</div>
      <h1>{c.welcome}</h1><p className={styles.lead}>{c.intro}</p><p>{c.introDetail}</p>
      <details className={styles.privacy}><summary>{c.privacyTitle}</summary><p>{c.privacy}</p></details>
      <label className={styles.consent}><input type="checkbox" checked={accepted} onChange={e => setAccepted(e.target.checked)} /><span>{c.consent}</span></label>
      {error && <p role="alert" className={styles.error}>{error}</p>}
      <div className={styles.actions}><button className={styles.primary} disabled={!accepted || busy} onClick={() => begin(true)}><Microphone />{c.begin}</button>
        <button className={styles.linkButton} disabled={!accepted || busy} onClick={() => begin(false)}>{c.beginText} →</button></div>
    </section> : session.status === 'completed' ? <section className={styles.welcome}>
      <div className={styles.doneIcon}>✓</div><div className={styles.eyebrow}>{c.finish}</div><h1>{c.finished}</h1>
      <p>{c.finishedHint}</p><a className={styles.primary} href={returnToSite.toString()} target="_top">{c.continue} {session.siteName} →</a>
    </section> : <div className={styles.content}>
      <div className={styles.progressRow}><span>{reviewing ? c.reviewing : c.step + ' ' + (questions.indexOf(field!) + 1) + ' ' + c.of + ' ' + questions.length}</span>
        <span>{answered} / {questions.length}</span></div>
      <div className={styles.progress} role="progressbar" aria-label={c.progress} aria-valuenow={answered} aria-valuemin={0} aria-valuemax={questions.length}>
        <span style={{ width: answered / questions.length * 100 + '%' }} /></div>
      <section className={styles.stage} data-mode={mode} data-expanded={mode === 'voice' && (options || Boolean(edit))} data-reviewing={reviewing}>
        <div className={styles.avatar}>{avatar}</div>
        <div className={styles.status} role="status" data-active={live && !paused && !reviewing}>
          <span className={styles.wave} data-animated={speaking || hearing}><i /><i /><i /><i /><i /></span>{status}</div>
        <h1 className={styles.question}>{field?.title ?? c.reviewTitle}</h1>
        {mode === 'text' && field?.description && <p className={styles.description}>{field.description}</p>}
        {mode === 'voice' && <div className={styles.subtitles} aria-live="polite" aria-atomic="true">
          {partial ? <p><span>{c.understood}</span>{partial}</p> : <p>{busy ? c.thinking : subtitle}</p>}
        </div>}
        {error && <p role="alert" className={styles.error}>{error}</p>}
        {heldTranscript && <form className={styles.transcriptReview} onSubmit={async event => {
          event.preventDefault();
          const submitted = utterance;
          try { await prepareAudio(); } catch { /* The written answer remains available without playback. */ }
          if (await act('turn', { text: submitted, source: 'voice' })) {
            setHeldTranscript(false); setUtterance('');
            if (current.current?.status === 'in_progress') await startAudio();
          }
        }}>
          <label>{c.understood}<input aria-label={c.textLabel} disabled={busy} value={utterance} maxLength={4000} onChange={event => setUtterance(event.target.value)} /></label>
          <div className={styles.actions}>
            <button className={styles.primary} disabled={busy || !utterance.trim()}>{c.useTranscript}</button>
            <button type="button" disabled={busy} onClick={() => { setUtterance(''); setHeldTranscript(false); void startAudio(); }}>{c.repeatVoice}</button>
            <button type="button" className={styles.linkButton} onClick={switchToText}>{c.write}</button>
          </div>
        </form>}
        {pending && field && <div className={styles.confirmation}>
          <span>{c.confirmValue}</span><strong>{answerLabel(field, pending.value ?? undefined, locale)}</strong>
          <div className={styles.actions}><button className={styles.primary} disabled={busy} onClick={() => act('confirm-answer', { accept: true })}>{c.yes}</button>
            <button disabled={busy} onClick={() => act('confirm-answer', { accept: false })}>{c.change}</button></div>
        </div>}
        {!reviewing && !heldTranscript && mode === 'voice' && <div className={styles.voiceControls}>
          <p>{paused ? c.pausedHint : live ? c.voiceHint : c.readyHint}</p>
          <div className={styles.actions}>{live ? <button className={paused ? styles.primary : styles.pause} onClick={togglePause}>
            {paused ? <Microphone /> : <span aria-hidden="true">Ⅱ</span>}{paused ? c.resume : c.pause}</button> :
            <button className={styles.primary} disabled={connecting || busy} onClick={startAudio}><Microphone />{connecting ? c.preparing : c.start}</button>}
            <button className={styles.linkButton} onClick={switchToText}>{c.write}</button></div>
          {!!field?.options?.length && <button className={styles.linkButton} onClick={() => setOptions(!options)} aria-expanded={options}>{options ? c.hideOptions : c.options}</button>}
        </div>}
        {field && <div hidden={heldTranscript || (mode === 'voice' && !options && !edit)} className={styles.fields}>
          <AnswerField key={field.id + ':' + edit + ':' + JSON.stringify(session.answers[field.id])} field={field}
            initial={session.answers[field.id]} locale={locale} busy={busy}
            submit={(value, skip) => act('answer', { questionId: field.id, value, skip })} cancel={edit ? () => setEdit('') : undefined} />
        </div>}
        {!reviewing && mode === 'text' && !edit && <div className={styles.textConversation}>
          <p aria-live="polite">{busy ? c.thinking : session.messages.at(-1)?.text}</p>
          <form onSubmit={async e => {
            e.preventDefault();
            const submitted = utterance;
            if (await act('turn', { text: submitted, source: 'text' })) setUtterance(draft => draft === submitted ? '' : draft);
          }}>
            <input aria-label={c.textLabel} placeholder={c.textLabel + '…'} maxLength={4000} value={utterance} onChange={e => setUtterance(e.target.value)} />
            <button disabled={busy || !utterance.trim()}>{c.send}</button>
          </form>
          <button className={styles.linkButton} disabled={busy} onClick={startAudio}><Microphone />{c.voice}</button>
        </div>}
        {reviewing && <p>{c.reviewHint}</p>}
      </section>
      {recent && !reviewing && !edit && <div className={styles.saved}><span><small>✓ {c.saved}</small>{answerLabel(recent, session.answers[recent.id], locale)}</span>
        <button className={styles.linkButton} disabled={busy} onClick={() => editAnswer(recent.id)}>{c.edit}</button></div>}
      {answered > 0 && <details className={styles.review} open={reviewing}>
        <summary>{c.answers} · {answered}</summary>
        {questions.filter(q => Object.hasOwn(session.answers, q.id) || session.skipped.includes(q.id)).map(q => <div className={styles.reviewItem} key={q.id}>
          <div><h2>{q.title}</h2><p>{answerLabel(q, session.answers[q.id], locale)}</p></div>
          <button disabled={busy} onClick={() => editAnswer(q.id)}>{c.edit}</button></div>)}
      </details>}
      {reviewing && <div className={styles.finalActions}><button className={styles.primary} disabled={busy} onClick={() => act('complete', {})}>{c.complete} →</button></div>}
      <details className={styles.transcript}><summary>{c.conversation}</summary>
        {session.messages.map(m => <p key={m.id}><strong>{m.role === 'assistant' ? session.avatar.name : c.you}:</strong> {m.text}</p>)}</details>
      <footer className={styles.footer}>{c.virtual} · {c.savedHint}</footer>
    </div>}
  </main>;
}
