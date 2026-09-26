import { randomUUID } from 'node:crypto';
import type { Answer, Answers, Field, Flow, Interpretation, Message, Session, SessionView } from './types';
import { activeQuestions, conditionMet, InputError, validateAnswer } from './validation';

export const copy = (locale: 'it' | 'en') => locale === 'it' ? {
  review: 'Abbiamo raccolto le risposte. Controlla il riepilogo: puoi correggerle prima di confermare.',
  scope: 'Restiamo su questa domanda.',
  unclear: 'Non sono sicuro di aver capito. Puoi dirlo in un altro modo?',
  saved: 'Ho aggiornato la risposta.',
  check: 'Ho capito:',
  correct: 'È corretto?',
  retry: 'Va bene, riproviamo.',
} : {
  review: 'Your answers are ready. Review them and make any corrections before confirming.',
  scope: 'Let’s stay with this question.',
  unclear: 'I’m not sure I understood. Could you say that another way?',
  saved: 'I have updated your answer.',
  check: 'I understood:',
  correct: 'Is that right?',
  retry: 'Let’s try again.',
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
  const corrected = Object.hasOwn(session.answers, questionId) || session.skipped.includes(questionId);
  const reply = next ? `${corrected ? `${copy(session.flow.locale).saved} ` : ''}${next.title}` : copy(session.flow.locale).review;
  return { ...session, answers, skipped, status, pendingAnswer: null, messages: [...session.messages, message('assistant', reply)].slice(-160) };
}
function spokenValue(field: Field, value: Answer, locale: 'it' | 'en'): string {
  if (typeof value === 'number') return new Intl.NumberFormat(locale, { maximumSignificantDigits: 21 }).format(value);
  if (Array.isArray(value)) return value.map(item => typeof item === 'string' ?
    field.options?.find(o => o.id === item)?.label ?? item :
    (field.fields ?? []).filter(f => Object.hasOwn(item, f.id)).map(f => `${f.title}: ${spokenValue(f, item[f.id], locale)}`).join(', ')).join('; ');
  return field.options?.find(o => o.id === value)?.label ?? value;
}
export function confirmAnswer(session: Session, accept: boolean): Session {
  if (session.status === 'completed') throw new InputError('Sessione già confermata', 409);
  const pending = session.pendingAnswer;
  if (!pending) throw new InputError('Nessuna risposta da confermare', 409);
  if (accept) {
    if (pending.value === null) throw new InputError('Indica prima la risposta corretta');
    return setAnswer(session, pending.questionId, pending.value);
  }
  const field = activeQuestions(session.flow, session.answers).find(q => q.id === pending.questionId);
  return { ...session, pendingAnswer: { questionId: pending.questionId, value: null }, messages: [...session.messages,
    message('assistant', `${copy(session.flow.locale).retry} ${field?.title ?? ''}`)].slice(-160) };
}
export function applyInterpretation(session: Session, spoken: string, result: Interpretation): Session {
  const updated = { ...session, messages: [...session.messages, message('user', spoken)].slice(-159) };
  const q = session.pendingAnswer ? activeQuestions(session.flow, session.answers).find(q => q.id === session.pendingAnswer?.questionId) :
    nextQuestion(session.flow, session.answers, session.skipped);
  if (result.action === 'confirm_answer' || result.action === 'reject_answer') {
    if (session.pendingAnswer && result.questionId === session.pendingAnswer.questionId &&
      (result.action === 'reject_answer' || session.pendingAnswer.value !== null))
      return confirmAnswer(updated, result.action === 'confirm_answer');
    return { ...updated, messages: [...updated.messages, message('assistant', copy(session.flow.locale).unclear)] };
  }
  // Only the current question or a previously answered field may be changed by speech.
  if (result.action === 'answer' || result.action === 'skip') {
    if (result.questionId !== q?.id && !Object.hasOwn(session.answers, result.questionId) && !session.skipped.includes(result.questionId))
      return { ...updated, messages: [...updated.messages, message('assistant', copy(session.flow.locale).unclear)] };
    try {
      const field = activeQuestions(session.flow, session.answers).find(q => q.id === result.questionId)!;
      // Some models omit the JSON quotes around a selected ID. Accept only an exact
      // snapshot option ID; labels, guessed choices and numeric coercions stay invalid.
      const exactOption = field.type === 'single_select' && field.options?.some(o => o.id === result.valueJson);
      const value = exactOption ? result.valueJson : result.valueJson === null ? undefined : JSON.parse(result.valueJson);
      if (result.action === 'answer' && (field.type === 'number' || field.type === 'records' || field.confirmSpoken)) {
        const validated = validateAnswer(field, value);
        const c = copy(session.flow.locale);
        return { ...updated, pendingAnswer: { questionId: field.id, value: validated },
          messages: [...updated.messages, message('assistant', `${c.check} ${spokenValue(field, validated, session.flow.locale)}. ${c.correct}`)] };
      }
      return setAnswer(updated, result.questionId, value, result.action === 'skip');
    } catch {
      return { ...updated, messages: [...updated.messages, message('assistant', copy(session.flow.locale).unclear)] };
    }
  }
  const c = copy(session.flow.locale);
  if (result.action === 'out_of_scope') {
    // Do not voice unsolicited model advice even if its action says out_of_scope.
    const reply = q ? `${c.scope} ${q.title}` : c.review;
    return { ...updated, messages: [...updated.messages, message('assistant', reply)] };
  }
  const clarification = result.explanation?.trim();
  // A long monologue is not a useful voice fallback. Keep the answer unchanged
  // and invite another attempt, rather than reading a description or option list.
  const explanation = clarification && clarification.length <= 350 ? clarification : c.unclear;
  const questionEnd = explanation.indexOf('?');
  const reply = questionEnd >= 0 ? explanation.slice(0, questionEnd + 1) : !q ? explanation : `${explanation} ${q.title}`;
  return { ...updated, messages: [...updated.messages, message('assistant', reply)] };
}
export function confirm(session: Session): Session {
  if (session.status === 'completed') return session;
  if (!session.consentAt) throw new InputError('Conferma prima la modalità di trattamento');
  if (session.pendingAnswer) throw new InputError('Conferma o correggi prima la risposta in sospeso');
  const errors = completionErrors(session.flow, session.answers);
  if (errors.length) throw new InputError(`Controlla: ${errors.join('; ')}`);
  if (nextQuestion(session.flow, session.answers, session.skipped)) throw new InputError('Completa o salta le domande rimanenti');
  return { ...session, status: 'completed', confirmedAt: new Date().toISOString() };
}
export function publicSession(session: Session): SessionView {
  return { id: session._id, siteName: session.siteName, flow: session.flow, avatar: session.avatar,
    returnUrl: session.returnUrl, answers: session.answers, skipped: session.skipped,
    messages: session.messages, status: session.status, revision: session.revision, pendingAnswer: session.pendingAnswer ?? null,
    consentAt: session.consentAt, confirmedAt: session.confirmedAt, expiresAt: session.tokenExpiresAt.toISOString() };
}
