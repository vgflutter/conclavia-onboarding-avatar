import { randomUUID } from 'node:crypto';
import { auditCollection, database, limit } from './db';
import { nextQuestion } from './engine';
import { hash } from './security';
import { InputError, record } from './validation';
import type { Interpretation, Session, SessionView } from './types';

export const clientAuditEvents = ['transcript_held', 'voice_error', 'voice_started', 'voice_paused', 'voice_resumed', 'voice_stopped', 'voice_command'] as const;
export const clientAuditReasons = ['context_changed', 'request_failed', 'recognition_failed', 'pause_command', 'repeat_command', 'resume_command',
  'user_action', 'mode_changed', 'session_completed', 'review_started', 'idle_timeout', 'session_expired', 'permission_denied', 'connection_failed'] as const;
export type ClientAuditInput = {
  event: typeof clientAuditEvents[number]; text?: string; questionId?: string; previousQuestionId?: string; revision?: number;
  reason?: typeof clientAuditReasons[number];
};
type ServerAction = 'turn' | 'answer' | 'confirm-answer' | 'complete';
type AuditValue = string | number | null | AuditValue[] | { [key: string]: AuditValue };
type AuditOutcome = 'saved' | 'awaiting_confirmation' | 'awaiting_replacement' | 'clarify' | 'out_of_scope' | 'not_applied' | 'completed' | 'replayed' | 'error' | 'reported';
export type AuditEvent = {
  _id: string; siteId: string; sessionId: string; at: Date; expiresAt: Date;
  source: 'server' | 'client'; event: ServerAction | ClientAuditInput['event'];
  outcome: AuditOutcome; text?: string; inputMode?: 'voice' | 'text';
  questionBefore?: string; questionAfter?: string; revisionBefore: number; revisionAfter?: number;
  statusBefore: Session['status']; statusAfter?: Session['status']; latencyMs?: number;
  interpretation?: { action: string; questionId: string; explanation: string; valueJson: string | null };
  changedAnswers?: { questionId: string; before: AuditValue; after: AuditValue }[];
  skippedBefore?: string[]; skippedAfter?: string[];
  pendingBefore?: AuditValue; pendingAfter?: AuditValue;
  client?: { questionId?: string; previousQuestionId?: string; revision?: number; reason?: ClientAuditInput['reason'] };
  errorCode?: string; truncated?: boolean;
};
export type AuditWriteOutcome = 'stored' | 'limited' | 'unavailable';
const maximumEvents = { server: 1000, client: 300 };
const maximumEventBytes = 32_000;

export function parseClientAudit(value: unknown): ClientAuditInput {
  if (!record(value) || Object.keys(value).some(key => !['event', 'text', 'questionId', 'previousQuestionId', 'revision', 'reason'].includes(key)) ||
    !clientAuditEvents.includes(value.event as ClientAuditInput['event']) ||
    (value.text !== undefined && (typeof value.text !== 'string' || value.text.length > 4000)) ||
    (value.questionId !== undefined && (typeof value.questionId !== 'string' || !value.questionId.length || value.questionId.length > 80)) ||
    (value.previousQuestionId !== undefined && (typeof value.previousQuestionId !== 'string' || !value.previousQuestionId.length || value.previousQuestionId.length > 80)) ||
    (value.revision !== undefined && (!Number.isSafeInteger(value.revision) || Number(value.revision) < 0)) ||
    (value.reason !== undefined && !clientAuditReasons.includes(value.reason as NonNullable<ClientAuditInput['reason']>))) {
    throw new InputError('Evento non valido');
  }
  return { event: value.event as ClientAuditInput['event'],
    ...(value.text !== undefined ? { text: value.text as string } : {}),
    ...(value.questionId !== undefined ? { questionId: value.questionId as string } : {}),
    ...(value.previousQuestionId !== undefined ? { previousQuestionId: value.previousQuestionId as string } : {}),
    ...(value.revision !== undefined ? { revision: value.revision as number } : {}),
    ...(value.reason !== undefined ? { reason: value.reason as ClientAuditInput['reason'] } : {}) };
}

function currentQuestion(session: Pick<Session, 'flow' | 'answers' | 'skipped' | 'pendingAnswer'>) {
  return session.pendingAnswer?.questionId ?? nextQuestion(session.flow, session.answers, session.skipped)?.id;
}
function envelope(session: Session) {
  return { _id: randomUUID(), siteId: session.siteId, sessionId: session._id, at: new Date(), expiresAt: session.expiresAt,
    questionBefore: currentQuestion(session), revisionBefore: session.revision, statusBefore: session.status };
}
function boundedValue(value: unknown): AuditValue {
  if (value === undefined || value === null) return null;
  const encoded = JSON.stringify(value);
  // Existing questionnaire values can be large. Never let optional diagnostics
  // duplicate unbounded arrays or strings; a preview is explicitly marked.
  if (encoded.length > 3000) return { truncated: 'true', preview: encoded.slice(0, 3000) };
  return JSON.parse(encoded) as AuditValue;
}
function boundEvent(event: AuditEvent): AuditEvent {
  if (Buffer.byteLength(JSON.stringify(event), 'utf8') <= maximumEventBytes) return event;
  return { ...event, changedAnswers: undefined, pendingBefore: undefined, pendingAfter: undefined,
    skippedBefore: undefined, skippedAfter: undefined,
    interpretation: event.interpretation ? { ...event.interpretation, valueJson: null } : undefined, truncated: true };
}
export function safeAuditError(error: unknown): string {
  if (!(error instanceof InputError)) return 'SERVICE_ERROR';
  return ({ 400: 'VALIDATION_ERROR', 401: 'UNAUTHORIZED', 403: 'FORBIDDEN', 404: 'NOT_FOUND',
    409: 'REVISION_CONFLICT', 413: 'PAYLOAD_TOO_LARGE', 429: 'LIMIT_REACHED', 503: 'SERVICE_UNAVAILABLE' } as Record<number, string>)[error.status] ?? 'REQUEST_ERROR';
}

export function buildClientAudit(session: Session, input: ClientAuditInput): AuditEvent {
  // Identity, source and real revision always come from the authenticated session.
  // Client-reported context is kept separately and cannot impersonate server data.
  return { ...envelope(session), source: 'client', event: input.event, outcome: 'reported',
    ...(input.text !== undefined ? { text: input.text } : {}),
    client: { ...(input.questionId !== undefined ? { questionId: input.questionId } : {}),
      ...(input.previousQuestionId !== undefined ? { previousQuestionId: input.previousQuestionId } : {}),
      ...(input.revision !== undefined ? { revision: input.revision } : {}), ...(input.reason ? { reason: input.reason } : {}) } };
}

export function buildServerAudit(session: Session, action: ServerAction, after: SessionView | undefined,
  details: { text?: string; inputMode?: 'voice' | 'text'; interpretation?: Interpretation; latencyMs: number; error?: unknown }): AuditEvent {
  const changedAnswers = after ? [...new Set([...Object.keys(session.answers), ...Object.keys(after.answers)])]
    .filter(key => JSON.stringify(session.answers[key]) !== JSON.stringify(after.answers[key]))
    .map(questionId => ({ questionId, before: boundedValue(session.answers[questionId]), after: boundedValue(after.answers[questionId]) })) : [];
  const pendingChanged = after && JSON.stringify(session.pendingAnswer ?? null) !== JSON.stringify(after.pendingAnswer ?? null);
  const skippedChanged = after && JSON.stringify(session.skipped) !== JSON.stringify(after.skipped);
  const interpretation = details.interpretation;
  const outcome: AuditOutcome = details.error !== undefined ? 'error' : after?.revision === session.revision ? 'replayed' :
    after?.status === 'completed' ? 'completed' : after?.pendingAnswer && pendingChanged ?
      (after.pendingAnswer.value === null ? 'awaiting_replacement' : 'awaiting_confirmation') :
    changedAnswers.length || skippedChanged ? 'saved' : interpretation?.action === 'clarify' ? 'clarify' :
    interpretation?.action === 'out_of_scope' ? 'out_of_scope' : 'not_applied';
  return boundEvent({ ...envelope(session), source: 'server', event: action, outcome,
    ...(details.text !== undefined ? { text: details.text.slice(0, 4000) } : {}), ...(details.inputMode ? { inputMode: details.inputMode } : {}),
    latencyMs: Math.max(0, Math.round(details.latencyMs)),
    ...(after ? { revisionAfter: after.revision, questionAfter: currentQuestion(after), statusAfter: after.status,
      changedAnswers, skippedBefore: session.skipped, skippedAfter: after.skipped,
      pendingBefore: boundedValue(session.pendingAnswer), pendingAfter: boundedValue(after.pendingAnswer) } : {}),
    ...(interpretation ? { interpretation: { action: interpretation.action, questionId: interpretation.questionId.slice(0, 80),
      explanation: interpretation.explanation.slice(0, 700), valueJson: interpretation.valueJson?.slice(0, 8000) ?? null } } : {}),
    ...(details.error !== undefined ? { errorCode: safeAuditError(details.error) } : {}) });
}

async function persistAudit(event: AuditEvent, clientKey: string): Promise<AuditWriteOutcome> {
  if (event.expiresAt.getTime() <= Date.now()) return 'limited';
  if (event.source === 'client' && !await limit(`audit-client:${clientKey}`, 60, 60)) return 'limited';
  const events = await auditCollection();
  const db = await database();
  try {
    await db.collection<{ _id: string; count: number; expiresAt: Date }>('onboarding_limits').findOneAndUpdate({
      _id: `audit-session:${event.source}:${event.siteId}:${event.sessionId}`, count: { $lt: maximumEvents[event.source] } },
      { $inc: { count: 1 }, $setOnInsert: { expiresAt: event.expiresAt } }, { upsert: true });
  } catch (error) {
    if ((error as { code?: number }).code === 11000) return 'limited';
    throw error;
  }
  await events.insertOne(event);
  return 'stored';
}

export async function writeAudit(session: Session, event: AuditEvent,
  store: (event: AuditEvent, clientKey: string) => Promise<AuditWriteOutcome> = persistAudit): Promise<AuditWriteOutcome> {
  if (event.siteId !== session.siteId || event.sessionId !== session._id || event.expiresAt.getTime() !== session.expiresAt.getTime()) return 'unavailable';
  try { return await store(event, hash(`${session.siteId}:${session.subject}`)); }
  catch { return 'unavailable'; }
}

export async function auditedMutation(session: Session, action: ServerAction, mutate: () => Promise<SessionView>,
  details: { text?: string; inputMode?: 'voice' | 'text'; interpretation?: () => Interpretation | undefined } = {},
  store: typeof writeAudit = writeAudit): Promise<SessionView> {
  const started = Date.now();
  const save = async (after?: SessionView, error?: unknown) => {
    try {
      await store(session, buildServerAudit(session, action, after, {
        text: details.text, inputMode: details.inputMode, interpretation: details.interpretation?.(), latencyMs: Date.now() - started, error,
      }));
    } catch { /* Optional audit failures must never replace a successful result or the original error. */ }
  };
  try {
    const result = await mutate();
    await save(result);
    return result;
  } catch (error) {
    await save(undefined, error);
    throw error;
  }
}
