import type { Site } from './types';
import { InputError, record, text } from './validation';
import { allowedReturnUrl } from './security';

export function validateIntegration(value: unknown, origins: string[]): NonNullable<Site['integration']> {
  if (value === undefined) return { mode: 'redirect', returnUrl: '' };
  if (!record(value) || !['redirect', 'iframe'].includes(String(value.mode)))
    throw new InputError('Modalità di integrazione non valida');
  const returnUrl = text(value.returnUrl, 'pagina di ritorno', 2000, true);
  try {
    return { mode: value.mode as 'redirect' | 'iframe', returnUrl: returnUrl ? allowedReturnUrl(returnUrl, origins) : '' };
  } catch { throw new InputError('La pagina di ritorno deve appartenere a un’origine autorizzata, senza credenziali o frammenti'); }
}
