import { randomUUID } from 'node:crypto';
import { collections, limit } from './db';
import { baseUrl, bearer, hash, token, allowedReturnUrl } from './security';
import { InputError, text, validateFlow, record } from './validation';
import { message, publicSession } from './engine';
import type { Session, Site } from './types';

export async function siteForRequest(req: Request): Promise<Site> {
  const { sites } = await collections();
  const site = await sites.findOne({ keyHash: hash(bearer(req)) });
  if (!site) throw new InputError('Credenziale sito non valida', 401);
  return site;
}
export async function sessionForRequest(req: Request, sessionId: string): Promise<Session> {
  const { sessions } = await collections();
  const session = await sessions.findOne({ _id: sessionId, tokenHash: hash(bearer(req)),
    tokenExpiresAt: { $gt: new Date() }, expiresAt: { $gt: new Date() } });
  if (!session) throw new InputError('Sessione scaduta o non autorizzata. Riaprila dal sito.', 401);
  return session;
}
export async function createSession(site: Site, body: unknown) {
  if (!record(body)) throw new InputError('Richiesta non valida');
  if (!await limit(`create:${site._id}`, 100, 3600)) throw new InputError('Limite di sessioni raggiunto', 429);
  const flow = body.flow ? validateFlow(body.flow) : site.flows.find(f => f.id === body.flowId);
  if (!flow) throw new InputError('Percorso non disponibile');
  const returnUrl = allowedReturnUrl(body.returnUrl, site.allowedOrigins);
  const subject = text(body.subject, 'riferimento cliente', 150);
  const capability = token();
  const session: Session = {
    _id: randomUUID(), siteId: site._id, subject, flow, avatar: site.avatar,
    context: site.context, siteName: site.name, returnUrl, tokenHash: hash(capability),
    tokenExpiresAt: new Date(Date.now() + 2 * 3600_000), expiresAt: new Date(Date.now() + 7 * 86400_000),
    createdAt: new Date(), answers: {}, skipped: [], status: 'in_progress', revision: 0,
    operations: [], messages: [message('assistant', `${flow.introduction} ${flow.questions[0].title}`)],
    turns: 0, speechRequests: 0, realtimeConnections: 0,
  };
  const { sessions } = await collections();
  await sessions.insertOne(session);
  return { sessionId: session._id, url: `${baseUrl()}/s/${session._id}#${capability}`, expiresAt: session.tokenExpiresAt };
}
export async function mutate(session: Session, revision: unknown, operation: unknown,
  change: (s: Session) => Promise<Session> | Session) {
  const operationId = text(operation, 'operazione', 100);
  const { sessions } = await collections();
  if (session.operations.includes(operationId)) return publicSession(session);
  if (!Number.isInteger(revision) || revision !== session.revision) throw new InputError('La sessione è cambiata. Ricarica le risposte.', 409);
  if (session.status === 'completed') throw new InputError('Sessione già confermata', 409);
  const lockId = randomUUID();
  const locked = await sessions.findOneAndUpdate({ _id: session._id, revision: session.revision,
    $or: [{ lockUntil: { $exists: false } }, { lockUntil: { $lt: new Date() } }] },
    { $set: { lockId, lockUntil: new Date(Date.now() + 30_000) } }, { returnDocument: 'after' });
  if (!locked) throw new InputError('Una risposta è già in elaborazione. Riprova tra poco.', 409);
  try {
    const updated = await change(session);
    const saved = await sessions.findOneAndUpdate({ _id: session._id, revision: session.revision, lockId }, {
      $set: { answers: updated.answers, skipped: updated.skipped, messages: updated.messages,
        pendingAnswer: updated.pendingAnswer ?? null,
        status: updated.status, ...(updated.consentAt ? { consentAt: updated.consentAt } : {}),
        ...(updated.confirmedAt ? { confirmedAt: updated.confirmedAt } : {}),
        operations: [...session.operations, operationId].slice(-500) },
      $inc: { revision: 1 }, $unset: { lockId: '', lockUntil: '' },
    }, { returnDocument: 'after' });
    if (!saved) throw new InputError('Sessione modificata. Ricarica le risposte.', 409);
    return publicSession(saved);
  } finally {
    await sessions.updateOne({ _id: session._id, lockId }, { $unset: { lockId: '', lockUntil: '' } });
  }
}
export async function budget(session: Session, field: 'turns' | 'speechRequests' | 'realtimeConnections', maximum: number) {
  const { sessions } = await collections();
  const updated = await sessions.updateOne({ _id: session._id, [field]: { $lt: maximum } }, { $inc: { [field]: 1 } });
  if (!updated.modifiedCount) throw new InputError('Limite della sessione raggiunto. Continua con i campi del questionario.', 429);
}
