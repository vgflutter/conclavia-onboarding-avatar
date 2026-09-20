import { collections } from '@/lib/onboarding/db';
import { budget, createSession, mutate, sessionForRequest, siteForRequest } from '@/lib/onboarding/sessions';
import { applyInterpretation, confirm, publicSession, setAnswer } from '@/lib/onboarding/engine';
import { errorResponse, hash, jsonBody, sameOrigin } from '@/lib/onboarding/security';
import { baseUrl, token } from '@/lib/onboarding/security';
import { InputError, record, text } from '@/lib/onboarding/validation';
import { interpret } from '@/lib/onboarding/intelligence';
import { inworldSpeechResponse } from '@/lib/inworld-tts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ path: string[] }> };

export async function GET(req: Request, context: Context) {
  try {
    const { path } = await context.params;
    if (path[0] !== 'sessions' || path.length < 2 || path.length > 3) throw new InputError('Non trovato', 404);
    if (path[2] === 'result') {
      const site = await siteForRequest(req);
      const subject = text(new URL(req.url).searchParams.get('subject'), 'riferimento cliente', 150);
      const { sessions } = await collections();
      const session = await sessions.findOne({ _id: path[1], siteId: site._id, subject, expiresAt: { $gt: new Date() } });
      if (!session) throw new InputError('Sessione non trovata', 404);
      if (session.status !== 'completed') throw new InputError('Risposte non ancora confermate', 409);
      return Response.json({ sessionId: session._id, subject: session.subject, flowId: session.flow.id,
        flowVersion: session.flow.version, answers: session.answers, confirmedAt: session.confirmedAt });
    }
    if (path.length !== 2) throw new InputError('Non trovato', 404);
    return Response.json(publicSession(await sessionForRequest(req, path[1])));
  } catch (error) { return errorResponse(error); }
}

export async function POST(req: Request, context: Context) {
  try {
    const { path } = await context.params;
    if (path[0] !== 'sessions') throw new InputError('Non trovato', 404);
    if (path.length === 1) return Response.json(await createSession(await siteForRequest(req), await jsonBody(req)), { status: 201 });
    if (path.length !== 3) throw new InputError('Non trovato', 404);
    const [ , sessionId, action ] = path;
    if (action === 'resume') {
      const site = await siteForRequest(req);
      const body = await jsonBody(req, 1000);
      if (!record(body)) throw new InputError('Richiesta non valida');
      const subject = text(body.subject, 'riferimento cliente', 150);
      const capability = token();
      const { sessions } = await collections();
      const session = await sessions.findOneAndUpdate({ _id: sessionId, siteId: site._id, subject,
        status: { $ne: 'completed' }, ...(typeof body.flowVersion === 'string' ? { 'flow.version': body.flowVersion } : {}), expiresAt: { $gt: new Date() } },
        { $set: { tokenHash: hash(capability), tokenExpiresAt: new Date(Date.now() + 2 * 3600_000) } }, { returnDocument: 'after' });
      if (!session) throw new InputError('Sessione non disponibile', 404);
      return Response.json({ sessionId, url: `${baseUrl()}/s/${sessionId}#${capability}`, expiresAt: session.tokenExpiresAt });
    }
    sameOrigin(req);
    const session = await sessionForRequest(req, sessionId);
    const body = await jsonBody(req, action === 'realtime' ? 32_000 : 16_000);
    if (!record(body)) throw new InputError('Richiesta non valida');
    if (action === 'consent') {
      if (body.accept !== true) throw new InputError('Conferma necessaria per continuare');
      return Response.json(await mutate(session, body.revision, body.operationId,
        s => ({ ...s, consentAt: s.consentAt || new Date().toISOString() })));
    }
    if (!session.consentAt) throw new InputError('Conferma prima la modalità di trattamento', 403);
    if (session.status === 'completed') throw new InputError('Sessione già confermata', 409);
    if (action === 'answer') return Response.json(await mutate(session, body.revision, body.operationId,
      s => setAnswer(s, text(body.questionId, 'domanda', 80), body.value, body.skip === true)));
    if (action === 'turn') {
      const utterance = text(body.text, 'risposta', 4000);
      return Response.json(await mutate(session, body.revision, body.operationId, async s => {
        await budget(s, 'turns', 300);
        return applyInterpretation(s, utterance, await interpret(s, utterance));
      }));
    }
    if (action === 'complete') return Response.json(await mutate(session, body.revision, body.operationId, confirm));
    if (action === 'speech') {
      const spoken = session.messages.find(m => m.id === body.messageId && m.role === 'assistant');
      if (!spoken || spoken.id !== session.messages.at(-1)?.id) throw new InputError('Messaggio non disponibile');
      await budget(session, 'speechRequests', 450);
      return await inworldSpeechResponse({ text: spoken.text, language: session.flow.locale,
        voiceId: session.flow.locale === 'it' ? session.avatar.voiceIt : session.avatar.voiceEn,
        speakingRate: session.avatar.speakingRate, signal: req.signal });
    }
    if (action === 'realtime') {
      if (process.env.ONBOARDING_AI_ENABLED !== 'true' || !process.env.OPENAI_API_KEY) throw new InputError('Audio live non configurato', 503);
      const sdp = text(body.sdp, 'connessione audio', 30_000);
      await budget(session, 'realtimeConnections', 8);
      // Live-transcribe currently rejects server_vad; this flow requires automatic turn detection.
      const model = process.env.OPENAI_TRANSCRIPTION_MODEL || 'gpt-4o-transcribe';
      if (!['gpt-4o-transcribe', 'gpt-4o-mini-transcribe'].includes(model)) throw new InputError('Modello di trascrizione non compatibile con i turni automatici', 503);
      const sessionConfig = { type: 'transcription', audio: { input: {
        noise_reduction: { type: 'near_field' },
        transcription: { model, language: session.flow.locale,
          prompt: session.flow.locale === 'it' ? 'Questionario di onboarding in italiano. Trascrivi fedelmente numeri e risposte.' : 'Onboarding questionnaire in English. Transcribe numbers and answers faithfully.' },
        turn_detection: { type: 'server_vad', threshold: .5, prefix_padding_ms: 300, silence_duration_ms: 700 },
      } } };
      const minted = await fetch('https://api.openai.com/v1/realtime/client_secrets', {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10_000),
        headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ session: sessionConfig, expires_after: { anchor: 'created_at', seconds: 60 } }),
      });
      if (!minted.ok) { await minted.body?.cancel(); throw new InputError('Trascrizione live non disponibile', 503); }
      const ephemeral = await minted.json();
      if (typeof ephemeral.value !== 'string') throw new InputError('Trascrizione live non disponibile', 503);
      const response = await fetch('https://api.openai.com/v1/realtime/calls', {
        method: 'POST', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(20_000),
        headers: { Authorization: `Bearer ${ephemeral.value}`, 'Content-Type': 'application/sdp', 'OpenAI-Safety-Identifier': hash(`${session.siteId}:${session.subject}`) }, body: sdp,
      });
      if (!response.ok) { await response.body?.cancel(); throw new InputError('Connessione vocale non disponibile. Riprova o usa i campi.', 503); }
      return Response.json({ sdp: await response.text() });
    }
    throw new InputError('Non trovato', 404);
  } catch (error) { return errorResponse(error); }
}
