import type { Answer, Answers, Field, Flow, Avatar } from './types';
import { isAvatarAppearance, isAvatarAppearanceSupported } from '@conclavia/avatar-kit/lib/avatar-catalog';
import { isAvatarVisualStyle } from '@conclavia/avatar-kit/lib/avatar-visual-style';

export class InputError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
export function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
export function text(value: unknown, name: string, max = 200, allowEmpty = false): string {
  if (typeof value !== 'string' || value.length > max || (!allowEmpty && !value.trim()))
    throw new InputError(`Campo non valido: ${name}`);
  return value.trim();
}
const identifier = /^[a-zA-Z][a-zA-Z0-9_-]{0,79}$/;
export function id(value: unknown): string {
  const result = text(value, 'id', 80);
  if (!identifier.test(result) || ['__proto__', 'constructor', 'prototype'].includes(result))
    throw new InputError('Identificatore non valido');
  return result;
}
export function conditionMet(when: Field['when'], answers: Answers) {
  return !when || (typeof answers[when.field] === 'string' && when.values.includes(answers[when.field] as string));
}
export function activeQuestions(flow: Flow, answers: Answers) {
  return flow.questions.filter(q => conditionMet(q.when, answers));
}
export function validateAnswer(field: Field, value: unknown): Answer {
  if (field.type === 'single_select') {
    if (typeof value !== 'string' || !field.options?.some(o => o.id === value))
      throw new InputError(`Scegli un'opzione per «${field.title}»`);
    return value;
  }
  if (field.type === 'multi_select') {
    if (!Array.isArray(value) || value.length > (field.max ?? 80) || (field.required && !value.length) ||
      value.some(v => typeof v !== 'string' || !field.options?.some(o => o.id === v)))
      throw new InputError(`Selezioni non valide per «${field.title}»`);
    const selected = [...new Set(value)] as string[];
    if (selected.length > 1 && selected.some(v => field.exclusiveOptions?.includes(v)))
      throw new InputError('Questa opzione non può essere combinata con altre');
    return selected;
  }
  if (field.type === 'number') {
    if (typeof value !== 'number' || !Number.isFinite(value) ||
      value < (field.min ?? -1e12) || value > (field.max ?? 1e12))
      throw new InputError(`Numero fuori dai limiti per «${field.title}»`);
    return value;
  }
  if (field.type === 'records') {
    if (!Array.isArray(value) || value.length > (field.max ?? 10) || value.length < (field.min ?? (field.required ? 1 : 0)))
      throw new InputError(`Elenco non valido per «${field.title}»`);
    return value.map(row => {
      if (!record(row) || Object.keys(row).some(k => !field.fields?.some(f => f.id === k)))
        throw new InputError('Campi non validi');
      const validated: Record<string, string | number> = {};
      for (const child of field.fields ?? []) {
        if (!Object.hasOwn(row, child.id)) {
          if (child.required) throw new InputError(`Manca ${child.title}`);
        } else validated[child.id] = validateAnswer(child, row[child.id]) as string | number;
      }
      return validated;
    });
  }
  if (field.type === 'month' && (typeof value !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(value))) throw new InputError('Usa un mese valido nel formato AAAA-MM');
  const result = text(value, field.title, field.maxLength ?? 2000, !field.required);
  if (field.type === 'date' && (!/^\d{4}-\d{2}-\d{2}$/.test(result) ||
    !Number.isFinite(Date.parse(result)) || new Date(result).toISOString().slice(0, 10) !== result))
    throw new InputError('Usa una data valida nel formato AAAA-MM-GG');
  return result;
}
function fields(value: unknown, nested = false): Field[] {
  if (!Array.isArray(value) || !value.length || value.length > (nested ? 12 : 100))
    throw new InputError('Servono da 1 a 100 domande');
  const seen = new Set<string>();
  return value.map(raw => {
    if (!record(raw)) throw new InputError('Domanda non valida');
    const key = id(raw.id);
    if (seen.has(key)) throw new InputError(`Domanda duplicata: ${key}`);
    const kind = raw.type as Field['type'];
    if (!['single_select', 'multi_select', 'number', 'text', 'date', 'month', 'records'].includes(kind) ||
      (nested && ['multi_select', 'records'].includes(kind))) throw new InputError('Tipo domanda non valido');
    const result: Field = { id: key, title: text(raw.title, 'domanda', 700), type: kind, required: raw.required !== false };
    if (raw.description !== undefined) result.description = text(raw.description, 'descrizione', 1500, true);
    if (['single_select', 'multi_select'].includes(kind)) {
      if (!Array.isArray(raw.options) || !raw.options.length || raw.options.length > 80) throw new InputError('Opzioni mancanti');
      const optionIds = new Set<string>();
      result.options = raw.options.map(o => {
        if (!record(o)) throw new InputError('Opzione non valida');
        const optionId = text(o.id, 'opzione', 100);
        if (optionIds.has(optionId)) throw new InputError('Opzione duplicata');
        optionIds.add(optionId);
        return { id: optionId, label: text(o.label, 'etichetta', 700), ...(o.description ? { description: text(o.description, 'descrizione', 1000) } : {}) };
      });
      if (raw.exclusiveOptions !== undefined) {
        if (!Array.isArray(raw.exclusiveOptions) || raw.exclusiveOptions.some(v => typeof v !== 'string' || !optionIds.has(v))) throw new InputError('Opzioni esclusive non valide');
        result.exclusiveOptions = raw.exclusiveOptions as string[];
      }
    }
    for (const constraint of ['min', 'max', 'maxLength'] as const) {
      if (raw[constraint] !== undefined) {
        if (typeof raw[constraint] !== 'number' || !Number.isFinite(raw[constraint])) throw new InputError('Limite non valido');
        result[constraint] = raw[constraint];
      }
    }
    if ((result.min ?? -Infinity) > (result.max ?? Infinity)) throw new InputError('Limiti invertiti');
    if (result.maxLength !== undefined && (result.maxLength < 1 || result.maxLength > 4000)) throw new InputError('Lunghezza non valida');
    if (kind === 'records') {
      result.fields = fields(raw.fields, true);
      if ((result.max ?? 10) > 10 || (result.min ?? 0) < 0) throw new InputError('Massimo 10 elementi');
    }
    if (raw.when !== undefined) {
      if (nested || !record(raw.when) || !seen.has(String(raw.when.field)) || !Array.isArray(raw.when.values) ||
        !raw.when.values.length || raw.when.values.some(v => typeof v !== 'string'))
        throw new InputError('La condizione deve riferirsi a una domanda precedente');
      result.when = { field: id(raw.when.field), values: raw.when.values as string[] };
    }
    seen.add(key);
    return result;
  });
}
export function validateFlow(value: unknown): Flow {
  if (!record(value)) throw new InputError('Flusso non valido');
  const flow: Flow = {
    id: id(value.id), version: text(value.version, 'versione', 100), title: text(value.title, 'titolo', 200),
    locale: value.locale === 'en' ? 'en' : 'it', objective: text(value.objective, 'obiettivo', 2000),
    introduction: text(value.introduction, 'introduzione', 1200), questions: fields(value.questions),
  };
  if (value.sums !== undefined) {
    if (!Array.isArray(value.sums) || value.sums.length > 10) throw new InputError('Vincoli non validi');
    flow.sums = value.sums.map(raw => {
      if (!record(raw) || !Array.isArray(raw.fields) || !raw.fields.length || raw.fields.some(k => !flow.questions.some(q => q.id === k && q.type === 'number')) || typeof raw.total !== 'number' || !Number.isFinite(raw.total)) throw new InputError('Vincolo somma non valido');
      let when: Field['when'];
      if (raw.when !== undefined) {
        if (!record(raw.when) || !flow.questions.some(q => q.id === (raw.when as Record<string, unknown>).field) || !Array.isArray(raw.when.values) || raw.when.values.some(v => typeof v !== 'string')) throw new InputError('Condizione somma non valida');
        when = { field: String(raw.when.field), values: raw.when.values as string[] };
      }
      return { fields: raw.fields as string[], total: raw.total, ...(when ? { when } : {}) };
    });
  }
  return flow;
}
export function validateAvatar(value: unknown): Avatar {
  if (!record(value)) throw new InputError('Avatar non valido');
  if (!isAvatarAppearance(value.appearance) || !isAvatarVisualStyle(value.visualStyle)) throw new InputError('Aspetto non valido');
  if (!isAvatarAppearanceSupported(value.appearance, value.visualStyle)) throw new InputError('Personaggio non disponibile in questo stile');
  if (typeof value.speakingRate !== 'number' || value.speakingRate < .8 || value.speakingRate > 1.2) throw new InputError('Velocità non valida');
  return { name: text(value.name, 'nome', 80), appearance: value.appearance as Avatar['appearance'],
    visualStyle: value.visualStyle as Avatar['visualStyle'], voiceIt: text(value.voiceIt, 'voce italiana', 120),
    voiceEn: text(value.voiceEn, 'voce inglese', 120), speakingRate: value.speakingRate };
}
export function validateOrigins(value: unknown): string[] {
  if (!Array.isArray(value) || !value.length || value.length > 20) throw new InputError('Specifica le origini autorizzate');
  return [...new Set(value.map(v => {
    const url = new URL(text(v, 'origine', 300));
    if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) ||
      url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new InputError('Origine non valida');
    return url.origin;
  }))];
}
