'use client';
import { useEffect, useRef, useState } from 'react';
import { BusinessAvatar } from './BusinessAvatar';
import { AnswerField, answerLabel } from './AnswerField';
import type { SessionView } from '@/lib/onboarding/types';
import type { AvatarViseme } from '@/lib/avatar-visemes';
import { activeQuestions } from '@/lib/onboarding/validation';
import { playStreamingSpeech } from '@/lib/streaming-voice-player';
import { startTranscription, type LiveConnection } from '@/lib/live-transcription';

export function SessionRoom({ id }: { id: string }) {
  const [session, setSession] = useState<SessionView | null>(null);
  const current = useRef<SessionView | null>(null);
  const capability = useRef('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [accepted, setAccepted] = useState(false);
  const [edit, setEdit] = useState('');
  const [utterance, setUtterance] = useState('');
  const [partial, setPartial] = useState('');
  const [live, setLive] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [muted, setMuted] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [frame, setFrame] = useState<{ viseme: AvatarViseme; level: number }>({ viseme: 'rest', level: 0 });
  const [camera, setCamera] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const cameraStream = useRef<MediaStream | null>(null);
  const speech = useRef<AbortController | null>(null);
  const connection = useRef<LiveConnection | null>(null);
  const connectingAbort = useRef<AbortController | null>(null);
  const audioContext = useRef<AudioContext | null>(null);
  const audioEnabled = useRef(false);
  const work = useRef(Promise.resolve());
  const lastActivity = useRef(0);
  const liveStarted = useRef(0);
  const mounted = useRef(true);
  const endpoint = `/api/v1/sessions/${id}`;
  function update(value: SessionView) { current.current = value; setSession(value); }
  function questionId() {
    const s = current.current;
    return s ? activeQuestions(s.flow, s.answers).find(q => !Object.hasOwn(s.answers, q.id) && !s.skipped.includes(q.id))?.id || '' : '';
  }
  async function request(action = '', body?: unknown) {
    const res = await fetch(`${endpoint}${action ? `/${action}` : ''}`, { method: body ? 'POST' : 'GET',
      headers: { Authorization: `Bearer ${capability.current}`, 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}), cache: 'no-store' });
    const data = await res.json();
    if (!res.ok) throw Object.assign(new Error(data.error || 'Operazione non riuscita'), { status: res.status });
    return data;
  }
  function stopMedia() {
    audioEnabled.current = false; speech.current?.abort(); connectingAbort.current?.abort(); connection.current?.stop(); connection.current = null;
    cameraStream.current?.getTracks().forEach(t => t.stop()); cameraStream.current = null;
    void audioContext.current?.close().catch(() => undefined); audioContext.current = null;
    if (mounted.current) { setLive(false); setConnecting(false); setCamera(false); setSpeaking(false); setPartial(''); }
  }
  useEffect(() => {
    mounted.current = true;
    const key = `conclavia-session:${id}`;
    const fragment = window.location.hash.slice(1);
    capability.current = /^[A-Za-z0-9_-]{43}$/.test(fragment) ? fragment : sessionStorage.getItem(key) || '';
    if (fragment) { sessionStorage.setItem(key, capability.current); history.replaceState(null, '', window.location.pathname); }
    void request().then(data => { if (mounted.current) update(data); }).catch(e => { if (mounted.current) setError(e.message); });
    const hide = () => stopMedia();
    window.addEventListener('pagehide', hide);
    const idle = setInterval(() => {
      if (connection.current && (Date.now() - lastActivity.current > 5 * 60_000 || Date.now() - liveStarted.current > 30 * 60_000 || Date.now() > Date.parse(current.current?.expiresAt || ''))) {
        stopMedia(); setError('Audio in pausa. Puoi riattivarlo per continuare.');
      }
    }, 10_000);
    return () => { mounted.current = false; clearInterval(idle); window.removeEventListener('pagehide', hide); stopMedia(); };
    // A capability belongs to this route and is never sent to the host site.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  async function say(s: SessionView) {
    if (!audioEnabled.current || s.status === 'completed') return;
    const last = s.messages.at(-1);
    if (last?.role !== 'assistant') return;
    speech.current?.abort();
    const controller = new AbortController(); speech.current = controller;
    setSpeaking(true);
    try {
      await playStreamingSpeech({ endpoint: `${endpoint}/speech`, payload: { messageId: last.id },
        headers: { Authorization: `Bearer ${capability.current}` }, signal: controller.signal,
        audioContext: audioContext.current ?? undefined,
        onFrame: (viseme, level) => { if (mounted.current && !controller.signal.aborted) setFrame({ viseme, level }); }, onStart: () => undefined });
    } catch {
      if (!controller.signal.aborted && mounted.current) setError('La voce non è disponibile. Puoi leggere la domanda e continuare.');
    } finally {
      if (speech.current === controller && mounted.current) { setSpeaking(false); setFrame({ viseme: 'rest', level: 0 }); }
    }
  }
  async function act(action: string, body: Record<string, unknown>) {
    if (!current.current || busyRef.current) return false;
    busyRef.current = true; setBusy(true); setError(''); lastActivity.current = Date.now(); speech.current?.abort();
    try {
      const updated = await request(action, { ...body, revision: current.current.revision, operationId: crypto.randomUUID() });
      if (!mounted.current) return false;
      update(updated); setEdit('');
      if (updated.status === 'completed') {
        stopMedia();
        if (window.parent !== window) window.parent.postMessage({ type: 'conclavia.completed', sessionId: id }, new URL(updated.returnUrl).origin);
      } else if (action !== 'consent') void say(updated);
      return true;
    } catch (e) {
      if (mounted.current) setError((e as Error).message);
      if ((e as { status?: number }).status === 409) { const fresh = await request().catch(() => null); if (fresh && mounted.current) update(fresh); }
      return false;
    } finally { busyRef.current = false; if (mounted.current) setBusy(false); }
  }
  async function startAudio() {
    if (connecting || live) return;
    setError(''); setConnecting(true); setMuted(false);
    const controller = new AbortController(); connectingAbort.current = controller;
    try {
      audioContext.current = new AudioContext({ sampleRate: 24000, latencyHint: 'interactive' });
      await audioContext.current.resume();
      const conn = await startTranscription({ signal: controller.signal,
        negotiate: async sdp => (await request('realtime', { sdp })).sdp,
        question: questionId,
        onSpeech: () => { lastActivity.current = Date.now(); speech.current?.abort(); },
        onPartial: setPartial,
        onError: message => { stopMedia(); setError(message); },
        onText: (transcript, originalQuestion) => {
          work.current = work.current.then(async () => {
            if (controller.signal.aborted || !mounted.current) return;
            if (originalQuestion !== questionId() || busyRef.current) {
              setUtterance(transcript); setError('Ho ricevuto questa frase mentre cambiava la domanda. Controllala nel campo qui sotto prima di inviarla.'); return;
            }
            const ok = await act('turn', { text: transcript });
            if (!ok && mounted.current) setUtterance(transcript);
          }).catch(() => { if (mounted.current) setError('Riprova a inviare la risposta.'); });
        },
      });
      if (controller.signal.aborted) { conn.stop(); return; }
      connection.current = conn; audioEnabled.current = true; liveStarted.current = Date.now(); lastActivity.current = Date.now(); setLive(true);
      if (current.current) void say(current.current);
    } catch (e) { const cancelled = controller.signal.aborted; stopMedia(); if (!cancelled) setError((e as Error).message || 'Microfono non disponibile. Puoi continuare con i campi.'); }
    finally { if (mounted.current) setConnecting(false); }
  }
  async function toggleCamera() {
    if (cameraStream.current) { cameraStream.current.getTracks().forEach(t => t.stop()); cameraStream.current = null; setCamera(false); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      if (!mounted.current || current.current?.status === 'completed') { stream.getTracks().forEach(t => t.stop()); return; }
      cameraStream.current = stream; setCamera(true);
      if (video.current) video.current.srcObject = stream;
    } catch { setError('Webcam non disponibile. Puoi proseguire senza.'); }
  }
  if (!session) return <main className="login"><div className="wordmark">conclavia<span>ONBOARDING</span></div><p className={error ? 'notice error' : ''}>{error || 'Prepariamo il tuo primo incontro…'}</p></main>;
  const questions = activeQuestions(session.flow, session.answers);
  const next = questions.find(q => !Object.hasOwn(session.answers, q.id) && !session.skipped.includes(q.id));
  const field = edit ? questions.find(q => q.id === edit) : next;
  const answered = questions.filter(q => Object.hasOwn(session.answers, q.id) || session.skipped.includes(q.id)).length;
  const returnToSite = new URL(session.returnUrl); returnToSite.searchParams.set('onboardingSession', id);
  return <main className="room"><header className="row spread room-header"><div className="wordmark">conclavia<span>ONBOARDING</span></div><div className="row"><span className="small muted">Un percorso per {session.siteName}</span><span className="pill">{session.flow.title}</span></div></header>
    {!session.consentAt ? <section className="card consent stack"><div className="eyebrow">Benvenuto, iniziamo da qui</div><h1>{session.avatar.name} ti accompagna nel tuo onboarding.</h1><p>Puoi rispondere a voce o usare i campi a schermo. Alla fine controllerai e confermerai le risposte.</p>
      <div className="notice">È un assistente virtuale. Se attivi la voce, l’audio viene inviato a OpenAI per la trascrizione; anche le frasi scritte nella conversazione vengono interpretate tramite OpenAI. Le frasi dell’avatar vengono inviate a Inworld per la sintesi vocale. Le risposte e la conversazione sono conservate per 7 giorni nel servizio. Dopo la tua conferma, {session.siteName} può recuperare le risposte al questionario. Conclavia non salva file audio o video. La webcam, facoltativa, mostra solo la tua anteprima locale.</div>
      <label className="consent-check"><input type="checkbox" checked={accepted} onChange={e => setAccepted(e.target.checked)} /><span>Ho letto come funziona il percorso e desidero continuare con questo assistente.</span></label>
      {error && <p role="alert" className="notice error">{error}</p>}<div className="row"><button className="primary" disabled={!accepted || busy} onClick={() => act('consent', { accept: true })}>Inizia il percorso →</button><a href={session.returnUrl}>Torna al sito</a></div></section> : session.status === 'completed' ?
      <section className="card done"><div className="done-icon">✓</div><div className="eyebrow">Tutto pronto</div><h1>Grazie per questo primo incontro.</h1><p>Le tue risposte sono confermate. Torna su {session.siteName} per proseguire.</p><a className="button primary" href={returnToSite.toString()} target="_top">Continua su {session.siteName} →</a></section> :
      <><div className="room-grid"><section className="avatar-stage" aria-label="Avatar"><div className="stage-top row spread"><div><strong>{session.avatar.name}</strong><div className="small muted">Il tuo assistente per l’onboarding</div></div><span className="pill">{speaking ? 'Sta parlando' : live && !muted ? 'In ascolto' : 'Pronto ad aiutarti'}</span></div>
        <div className="stage-character"><BusinessAvatar appearance={session.avatar.appearance} visualStyle={session.avatar.visualStyle} mood="friendly" viseme={frame.viseme} voiceLevel={frame.level} ariaLabel={`Avatar di ${session.avatar.name}`} /></div>
        <video className="self-video" hidden={!camera} ref={video} autoPlay playsInline muted aria-label="La tua webcam, visibile solo a te" />
        <div className="stage-controls"><div className="row">{!live ? <button className="primary" disabled={connecting || busy} onClick={startAudio}>{connecting ? 'Connessione…' : '◉ Attiva conversazione vocale'}</button> : <><button className={muted ? 'primary' : ''} onClick={() => { connection.current?.mute(!muted); setMuted(!muted); }}>{muted ? 'Riattiva microfono' : 'Silenzia microfono'}</button><button onClick={stopMedia}>Termina audio</button></>}
          <button onClick={toggleCamera}>{camera ? 'Spegni webcam' : 'Webcam facoltativa'}</button></div><p className="small">{partial || 'Puoi sempre usare i campi o scrivere la tua risposta.'}</p></div></section>
        <section className="question-panel"><div className="card"><div className="row spread"><span className="eyebrow" style={{ margin: 0 }}>Il tuo percorso</span><span className="small muted">{answered} / {questions.length}</span></div><div className="progress" role="progressbar" aria-label="Avanzamento" aria-valuenow={answered} aria-valuemin={0} aria-valuemax={questions.length}><span style={{ width: `${answered / questions.length * 100}%` }} /></div>
          {error && <p role="alert" className="notice error">{error}</p>}
          {field ? <><h2>{field.title}</h2>{field.description && <p>{field.description}</p>}<AnswerField key={`${field.id}:${edit}`} field={field} initial={session.answers[field.id]} busy={busy} submit={(value, skip) => act('answer', { questionId: field.id, value, skip })} cancel={edit ? () => setEdit('') : undefined} /></> : <><h2>Rivediamo le tue risposte.</h2><p>Puoi correggere ogni risposta prima di confermare.</p><button className="primary" disabled={busy} onClick={() => act('complete', {})}>Conferma tutte le risposte →</button></>}
        </div><div className="assistant-message" aria-live="polite">{busy ? 'Sto elaborando la tua risposta…' : session.messages.at(-1)?.text}</div>
          <form className="text-answer" onSubmit={async e => { e.preventDefault(); if (await act('turn', { text: utterance })) setUtterance(''); }}><input aria-label="Scrivi una risposta o chiedi un chiarimento" placeholder="Scrivi una risposta o chiedi un chiarimento…" maxLength={4000} value={utterance} onChange={e => setUtterance(e.target.value)} /><button disabled={busy || !utterance.trim()}>Invia</button></form>
          {answered > 0 && <details open={!next}><summary>Le tue risposte · {answered}</summary>{questions.filter(q => Object.hasOwn(session.answers, q.id) || session.skipped.includes(q.id)).map(q => <div className="review-item" key={q.id}><h3>{q.title}</h3><div className="row spread"><p>{answerLabel(q, session.answers[q.id])}</p><button disabled={busy} onClick={() => setEdit(q.id)}>Modifica</button></div></div>)}</details>}
          <details><summary>Conversazione</summary><div className="transcript">{session.messages.map(m => <p key={m.id}><strong>{m.role === 'assistant' ? session.avatar.name : 'Tu'}:</strong> {m.text}</p>)}</div></details>
        </section></div><footer className="room-footer row spread"><span>Assistente virtuale · Le risposte vengono salvate durante il percorso.</span><a href={session.returnUrl} onClick={stopMedia}>Esci e torna al sito</a></footer></>}
  </main>;
}
