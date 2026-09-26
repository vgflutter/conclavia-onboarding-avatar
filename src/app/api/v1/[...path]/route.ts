import { collections } from '@/lib/onboarding/db';
import { budget, createSession, mutate, sessionForRequest, siteForRequest } from '@/lib/onboarding/sessions';
import { applyInterpretation, confirm, confirmAnswer, publicSession, setAnswer } from '@/lib/onboarding/engine';
import { errorResponse, hash, jsonBody, sameOrigin } from '@/lib/onboarding/security';
import { baseUrl, token } from '@/lib/onboarding/security';
import { InputError, record, text } from '@/lib/onboarding/validation';
import { interpret } from '@/lib/onboarding/intelligence';
import { transcriptionConnection } from '@/lib/onboarding/realtime';
import { inworldSpeechResponse } from '@/lib/inworld-tts';
import { auditedMutation, buildClientAudit, parseClientAudit, writeAudit } from '@/lib/onboarding/audit';
import type { Interpretation } from '@/lib/onboarding/types';

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
    const body = await jsonBody(req, action === 'realtime' ? 32_000 : action === 'events' ? 18_000 : 16_000);
    if (!record(body)) throw new InputError('Richiesta non valida');
    if (action === 'consent') {
      if (body.accept !== true) throw new InputError('Conferma necessaria per continuare');
      return Response.json(await mutate(session, body.revision, body.operationId,
        s => ({ ...s, consentAt: s.consentAt || new Date().toISOString() })));
    }
    if (!session.consentAt) throw new InputError('Conferma prima la modalità di trattamento', 403);
    if (action === 'events') {
      const result = await writeAudit(session, buildClientAudit(session, parseClientAudit(body)));
      if (result === 'limited') throw new InputError('Troppi eventi. Riprova più tardi.', 429);
      return Response.json({ ok: true }, { status: 202 });
    }
    if (session.status === 'completed') throw new InputError('Sessione già confermata', 409);
    if (action === 'answer') return Response.json(await auditedMutation(session, 'answer', () => mutate(session, body.revision, body.operationId,
      s => setAnswer(s, text(body.questionId, 'domanda', 80), body.value, body.skip === true))));
    if (action === 'confirm-answer') {
      if (typeof body.accept !== 'boolean') throw new InputError('Conferma non valida');
      return Response.json(await auditedMutation(session, 'confirm-answer', () => mutate(session, body.revision, body.operationId, s => confirmAnswer(s, body.accept as boolean))));
    }
    if (action === 'turn') {
      const utterance = text(body.text, 'risposta', 4000);
      if (body.source !== undefined && body.source !== 'voice' && body.source !== 'text') throw new InputError('Modalità non valida');
      let interpretation: Interpretation | undefined;
      return Response.json(await auditedMutation(session, 'turn', () => mutate(session, body.revision, body.operationId, async s => {
        await budget(s, 'turns', 300);
        interpretation = await interpret(s, utterance);
        return applyInterpretation(s, utterance, interpretation);
      }), { text: utterance, inputMode: body.source === 'voice' ? 'voice' : 'text', interpretation: () => interpretation }));
    }
    if (action === 'complete') return Response.json(await auditedMutation(session, 'complete', () => mutate(session, body.revision, body.operationId, confirm)));
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
      await budget(session, 'realtimeConnections', 8);
      return Response.json(await transcriptionConnection(session, body.sdp));
    }
    throw new InputError('Non trovato', 404);
  } catch (error) { return errorResponse(error); }
}
