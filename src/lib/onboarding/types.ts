import type { AssistantAppearance, AssistantVisualStyle } from '@/types/assistant-profile';

export type Scalar = string | number;
export type Answer = Scalar | string[] | Record<string, Scalar>[];
export type Answers = Record<string, Answer>;
export type Option = { id: string; label: string; description?: string };
export type Field = {
  id: string; title: string; description?: string;
  type: 'single_select' | 'multi_select' | 'number' | 'text' | 'date' | 'month' | 'records';
  required: boolean; options?: Option[]; exclusiveOptions?: string[];
  min?: number; max?: number; maxLength?: number;
  confirmSpoken?: boolean;
  when?: { field: string; values: string[] };
  fields?: Field[];
};
export type Flow = {
  id: string; version: string; title: string; locale: 'it' | 'en';
  objective: string; introduction: string; questions: Field[];
  sums?: { fields: string[]; total: number; when?: { field: string; values: string[] } }[];
};
export type Avatar = {
  name: string; appearance: AssistantAppearance; visualStyle: AssistantVisualStyle;
  voiceIt: string; voiceEn: string; speakingRate: number;
};
export type Site = {
  _id: string; name: string; keyHash: string; allowedOrigins: string[];
  avatar: Avatar; context: string; flows: Flow[]; revision: number; updatedAt: Date;
  integration?: { mode: 'redirect' | 'iframe'; returnUrl: string };
};
export type Message = { id: string; role: 'user' | 'assistant'; text: string; at: string };
export type PendingAnswer = { questionId: string; value: Answer | null };
export type Session = {
  _id: string; siteId: string; subject: string; flow: Flow; avatar: Avatar;
  context: string; siteName: string; returnUrl: string;
  tokenHash: string; tokenExpiresAt: Date; expiresAt: Date; createdAt: Date;
  answers: Answers; skipped: string[]; messages: Message[]; operations: string[];
  status: 'in_progress' | 'review' | 'completed'; revision: number;
  consentAt?: string; confirmedAt?: string;
  pendingAnswer?: PendingAnswer | null;
  turns: number; speechRequests: number; realtimeConnections: number;
};
export type SessionView = {
  id: string; siteName: string; flow: Flow; avatar: Avatar; returnUrl: string;
  answers: Answers; skipped: string[]; messages: Message[];
  status: Session['status']; revision: number; consentAt?: string; confirmedAt?: string;
  expiresAt: string;
  pendingAnswer?: PendingAnswer | null;
};
export type Interpretation = {
  action: 'answer' | 'clarify' | 'out_of_scope' | 'skip' | 'confirm_answer' | 'reject_answer';
  questionId: string; valueJson: string | null; explanation: string;
};
