'use client';
import { useState } from 'react';
import { sessionCopy } from './session-copy';
import type { Answer, Field } from '@/lib/onboarding/types';
export function answerLabel(field: Field, value: Answer | undefined, locale: 'it' | 'en' = 'it'): string {
  const c = sessionCopy[locale];
  if (value === undefined) return c.notProvided;
  if (field.type === 'records') return (value as Record<string, string | number>[]).map(row => (field.fields ?? []).map(f => `${f.title}: ${answerLabel(f, row[f.id], locale)}`).join(' · ')).join('; ') || c.none;
  if (Array.isArray(value)) return (value as string[]).map(v => field.options?.find(o => o.id === v)?.label ?? v).join(', ') || c.none;
  if (typeof value === 'number') return new Intl.NumberFormat(locale, { maximumSignificantDigits: 21 }).format(value);
  return field.options?.find(o => o.id === value)?.label ?? String(value);
}
function Control({ field, value, change, locale }: { field: Field; value: unknown; locale: 'it' | 'en'; change: (value: unknown) => void }) {
  if (field.type === 'single_select' || field.type === 'multi_select') return <div className="answer-options" role="group" aria-label={field.title}>
    {field.options?.map(option => {
      const checked = field.type === 'single_select' ? value === option.id : Array.isArray(value) && value.includes(option.id);
      return <button type="button" className={checked ? 'checked' : ''} aria-pressed={checked} key={option.id} onClick={() => {
        if (field.type === 'single_select') return change(option.id);
        const old: string[] = Array.isArray(value) ? value : [];
        change(checked ? old.filter(v => v !== option.id) : field.exclusiveOptions?.includes(option.id) ? [option.id] : [...old.filter(v => !field.exclusiveOptions?.includes(v)), option.id]);
      }}><span className="circle" /><span>{option.label}{option.description && <span className="muted small" style={{ display: 'block' }}>{option.description}</span>}</span></button>;
    })}
  </div>;
  if (field.type === 'records') {
    const rows = (Array.isArray(value) ? value : []) as Record<string, unknown>[];
    return <div className="stack">{rows.map((row, index) => <div className="record-row" key={index}>{field.fields?.map(child => <label key={child.id}>{child.title}<Control field={child} locale={locale} value={row[child.id]} change={v => change(rows.map((r, i) => i === index ? { ...r, [child.id]: v } : r))} /></label>)}<button type="button" onClick={() => change(rows.filter((_, i) => i !== index))}>{sessionCopy[locale].remove}</button></div>)}
      {rows.length < (field.max ?? 10) && <button type="button" onClick={() => change([...rows, {}])}>＋ {sessionCopy[locale].add}</button>}</div>;
  }
  if (field.type === 'text') return <textarea aria-label={field.title} rows={3} maxLength={field.maxLength ?? 2000} value={String(value ?? '')} onChange={e => change(e.target.value)} />;
  return <input aria-label={field.title} type={field.type === 'date' ? 'date' : field.type === 'month' ? 'month' : 'number'} step="any" min={field.min} max={field.max} value={typeof value === 'number' || typeof value === 'string' ? value : ''} onChange={e => change(field.type === 'number' ? e.target.value === '' ? '' : Number(e.target.value) : e.target.value)} />;
}
export function AnswerField({ field, initial, busy, submit, cancel, locale = 'it' }: { locale?: 'it' | 'en'; field: Field; initial?: Answer; busy: boolean; submit: (value: unknown, skip?: boolean) => void; cancel?: () => void }) {
  const c = sessionCopy[locale];
  const [value, setValue] = useState<unknown>(initial ?? (['records', 'multi_select'].includes(field.type) ? [] : ''));
  return <form className="stack" onSubmit={e => { e.preventDefault(); submit(value); }}>
    <Control field={field} locale={locale} value={value} change={setValue} />
    <div className="row"><button className="primary" disabled={busy}>{cancel ? c.saveEdit : c.save} →</button>
      {!field.required && <button type="button" disabled={busy} onClick={() => submit(undefined, true)}>{c.skip}</button>}
      {cancel && <button type="button" onClick={cancel}>{c.cancel}</button>}</div>
  </form>;
}
