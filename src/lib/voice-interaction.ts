import type { SessionView } from './onboarding/types';
import { activeQuestions } from './onboarding/validation';

export function voiceQuestion(session: SessionView | null) {
  return session?.pendingAnswer?.questionId ?? (session && activeQuestions(session.flow, session.answers)
    .find(question => !Object.hasOwn(session.answers, question.id) && !session.skipped.includes(question.id))?.id) ?? null;
}

export function voiceContext(session: SessionView | null, interaction: number) {
  // A clarification changes the revision, but not the question being answered.
  // A different question, confirmation value or microphone interaction does.
  return JSON.stringify([voiceQuestion(session), session?.pendingAnswer ?? null, interaction]);
}

export function voiceCommand(text: string): 'pause' | 'repeat' | null {
  const normalized = text.trim().toLocaleLowerCase().replace(/[.!?…]+$/u, '').trim();
  if (['basta', 'pausa', 'fermati', 'metti in pausa', 'stop', 'pause', 'pause the conversation'].includes(normalized)) return 'pause';
  if (['ripeti', 'ripeti la domanda', 'puoi ripetere', 'repeat', 'repeat the question', 'can you repeat'].includes(normalized)) return 'repeat';
  return null;
}
