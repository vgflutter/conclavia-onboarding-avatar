import { randomUUID } from 'node:crypto';
import type { Answers, Flow, Interpretation, Message, Session, SessionView } from './types';
import { activeQuestions, conditionMet, InputError, validateAnswer } from './validation';

export const copy = (locale: 'it' | 'en') => locale === 'it' ? {
  review: 'Abbiamo raccolto le risposte. Controlla il riepilogo: puoi correggerle prima di confermare.',
  scope: 'Posso aiutarti solo con questo onboarding. Torniamo alla domanda del questionario.',
  unclear: 'Non ho capito con certezza la risposta. Puoi precisarla o scegliere una delle opzioni?',
  saved: 'Ho aggiornato la risposta.',
} : {
  review: 'Your answers are ready. Review them and make any corrections before confirming.',
  scope: 'I can only help with this onboarding. Let’s return to the questionnaire.',
  unclear: 'I’m not sure which answer you mean. Please clarify or select an option.',
  saved: 'I have updated your answer.',
};
export function nextQuestion(flow: Flow, answers: Answers, skipped: string[]) {
  return activeQuestions(flow, answers).find(q => !Object.hasOwn(answers, q.id) && !skipped.includes(q.id));
}
export function completionErrors(flow: Flow, answers: Answers): string[] {
  const errors: string[] = [];
  for (const q of activeQuestions(flow, answers)) {
    if (!Object.hasOwn(answers, q.id)) { if (q.required) errors.push(q.title); }
    else { try { validateAnswer(q, answers[q.id]); } catch { errors.push(q.title); } }
  }
  for (const sum of flow.sums ?? []) {
    if (conditionMet(sum.when, answers) && !(Math.abs(sum.fields.reduce((n, k) => n + (typeof answers[k] === 'number' ? answers[k] as number : NaN), 0) - sum.total) <= 0.001))
      errors.push(`La somma di ${sum.fields.join(', ')} deve essere ${sum.total}`);
  }
  return errors;
}
export function message(role: Message['role'], text: string): Message {
  return { id: randomUUID(), role, text: text.slice(0, 4000), at: new Date().toISOString() };
}
export function setAnswer(session: Session, questionId: string, value: unknown, skip = false): Session {
  if (session.status === 'completed') throw new InputError('Sessione già confermata', 409);
  const question = activeQuestions(session.flow, session.answers).find(q => q.id === questionId);
  if (!question) throw new InputError('Domanda non disponibile');
  if (skip && question.required) throw new InputError('La domanda è obbligatoria');
  const answers = { ...session.answers };
  let skipped = session.skipped.filter(k => k !== questionId);
  if (skip) { delete answers[questionId]; skipped.push(questionId); }
  else answers[questionId] = validateAnswer(question, value);
  // Conditions reference earlier fields only: prune descendants in dependency order.
  for (const field of session.flow.questions) {
    if (!conditionMet(field.when, answers)) {
      delete answers[field.id]; skipped = skipped.filter(k => k !== field.id);
    }
  }
  const next = nextQuestion(session.flow, answers, skipped);
  const status = next ? 'in_progress' : 'review';
  const reply = next ? `${copy(session.flow.locale).saved} ${next.title}` : copy(session.flow.locale).review;
  return { ...session, answers, skipped, status, messages: [...session.messages, message('assistant', reply)].slice(-160) };
}
export function applyInterpretation(session: Session, spoken: string, result: Interpretation): Session {
  const updated = { ...session, messages: [...session.messages, message('user', spoken)].slice(-159) };
  const q = nextQuestion(session.flow, session.answers, session.skipped);
  // Only the current question or a previously answered field may be changed by speech.
  if (result.action === 'answer' || result.action === 'skip') {
    if (result.questionId !== q?.id && !Object.hasOwn(session.answers, result.questionId))
      return { ...updated, messages: [...updated.messages, message('assistant', copy(session.flow.locale).unclear)] };
    try {
      return setAnswer(updated, result.questionId, result.valueJson === null ? undefined : JSON.parse(result.valueJson), result.action === 'skip');
    } catch {
      return { ...updated, messages: [...updated.messages, message('assistant', copy(session.flow.locale).unclear)] };
    }
  }
  const explanation = result.action === 'out_of_scope' ? copy(session.flow.locale).scope :
    result.explanation?.trim().slice(0, 700) || q?.description || copy(session.flow.locale).unclear;
  return { ...updated, messages: [...updated.messages, message('assistant', `${explanation}${q ? ` ${q.title}` : ''}`)] };
}
export function confirm(session: Session): Session {
  if (session.status === 'completed') return session;
  if (!session.consentAt) throw new InputError('Conferma prima la modalità di trattamento');
  const errors = completionErrors(session.flow, session.answers);
  if (errors.length) throw new InputError(`Controlla: ${errors.join('; ')}`);
  if (nextQuestion(session.flow, session.answers, session.skipped)) throw new InputError('Completa o salta le domande rimanenti');
  return { ...session, status: 'completed', confirmedAt: new Date().toISOString() };
}
export function publicSession(session: Session): SessionView {
  return { id: session._id, siteName: session.siteName, flow: session.flow, avatar: session.avatar,
    returnUrl: session.returnUrl, answers: session.answers, skipped: session.skipped,
    messages: session.messages, status: session.status, revision: session.revision,
    consentAt: session.consentAt, confirmedAt: session.confirmedAt, expiresAt: session.tokenExpiresAt.toISOString() };
}
