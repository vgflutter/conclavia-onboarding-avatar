import type { Session } from './types';
import { hash } from './security';
import { InputError, text } from './validation';

/** Keep SDP byte-for-byte intact: trimming its final CRLF makes a valid offer fail. */
export async function transcriptionConnection(session: Pick<Session, 'siteId' | 'subject' | 'flow'>, offer: unknown, fetcher: typeof fetch = fetch) {
  text(offer, 'connessione audio', 30_000);
  const sdp = offer as string;
  // Live-transcribe currently rejects server_vad; this flow requires automatic turn detection.
  const model = process.env.OPENAI_TRANSCRIPTION_MODEL || 'gpt-4o-transcribe';
  if (!['gpt-4o-transcribe', 'gpt-4o-mini-transcribe'].includes(model)) throw new InputError('Modello di trascrizione non compatibile con i turni automatici', 503);
  const sessionConfig = { type: 'transcription', audio: { input: {
    noise_reduction: { type: 'near_field' },
    transcription: { model, language: session.flow.locale,
      prompt: session.flow.locale === 'it' ? 'Questionario di onboarding in italiano. Trascrivi fedelmente numeri e risposte.' : 'Onboarding questionnaire in English. Transcribe numbers and answers faithfully.' },
    turn_detection: { type: 'server_vad', threshold: .5, prefix_padding_ms: 300, silence_duration_ms: 1200 },
  } } };
  const minted = await fetcher('https://api.openai.com/v1/realtime/client_secrets', {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10_000),
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json',
      'OpenAI-Safety-Identifier': hash(`${session.siteId}:${session.subject}`) },
    body: JSON.stringify({ session: sessionConfig, expires_after: { anchor: 'created_at', seconds: 60 } }),
  });
  if (!minted.ok) { await minted.body?.cancel(); throw new InputError('Trascrizione live non disponibile', 503); }
  const ephemeral = await minted.json();
  if (typeof ephemeral.value !== 'string') throw new InputError('Trascrizione live non disponibile', 503);
  const response = await fetcher('https://api.openai.com/v1/realtime/calls', {
    method: 'POST', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(20_000),
    headers: { Authorization: `Bearer ${ephemeral.value}`, 'Content-Type': 'application/sdp' }, body: sdp,
  });
  if (!response.ok) { await response.body?.cancel(); throw new InputError('Connessione vocale non disponibile. Riprova o usa i campi.', 503); }
  return { sdp: await response.text() };
}
