import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { InputError } from './validation';

export const token = () => randomBytes(32).toString('base64url');
export const hash = (value: string) => createHash('sha256').update(value).digest('hex');
export function safeEqual(a: string, b: string) {
  return timingSafeEqual(Buffer.from(hash(a)), Buffer.from(hash(b)));
}
export function baseUrl() {
  const url = new URL(process.env.ONBOARDING_BASE_URL || 'http://localhost:3002');
  if (url.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(url.hostname))
    throw new Error('ONBOARDING_BASE_URL richiede HTTPS');
  return url.origin;
}
export function sameOrigin(req: Request) {
  if (req.headers.get('origin') !== baseUrl()) throw new InputError('Origine non autorizzata', 403);
}
export function bearer(req: Request) {
  const value = req.headers.get('authorization') || '';
  if (!/^Bearer [A-Za-z0-9_-]{32,200}$/.test(value)) throw new InputError('Accesso non autorizzato', 401);
  return value.slice(7);
}
function secret() {
  const value = process.env.ONBOARDING_SESSION_SECRET;
  if (!value || value.length < 32) throw new Error('Configura ONBOARDING_SESSION_SECRET');
  return value;
}
export function adminCookie() {
  const expires = String(Date.now() + 8 * 60 * 60 * 1000);
  const signature = createHmac('sha256', secret()).update(`admin:${expires}`).digest('base64url');
  return `${expires}.${signature}`;
}
export function isAdmin(cookie: string | undefined) {
  if (!cookie) return false;
  const [expires, signature, extra] = cookie.split('.');
  if (extra || !signature || !/^\d{13}$/.test(expires) || Number(expires) < Date.now()) return false;
  const expected = createHmac('sha256', secret()).update(`admin:${expires}`).digest('base64url');
  return safeEqual(signature, expected);
}
export function requestIsAdmin(req: Request) {
  const cookie = req.headers.get('cookie')?.split(';').map(p => p.trim()).find(p => p.startsWith('onboarding_admin='))?.slice('onboarding_admin='.length);
  return isAdmin(cookie);
}
export function allowedReturnUrl(value: unknown, origins: string[]) {
  if (typeof value !== 'string' || value.length > 2000) throw new InputError('Indirizzo di ritorno non valido');
  const url = new URL(value);
  if (!origins.includes(url.origin) || url.username || url.password || url.hash) throw new InputError('Indirizzo di ritorno non autorizzato');
  return url.toString();
}
export async function jsonBody(req: Request, maximum = 150_000) {
  if (!req.headers.get('content-type')?.startsWith('application/json')) throw new InputError('Invia JSON', 415);
  if (Number(req.headers.get('content-length') ?? 0) > maximum) throw new InputError('Richiesta troppo grande', 413);
  if (!req.body) throw new InputError('Richiesta vuota');
  const reader = req.body.getReader();
  const decoder = new TextDecoder();
  let result = '', size = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > maximum) throw new InputError('Richiesta troppo grande', 413);
      result += decoder.decode(part.value, { stream: true });
    }
    result += decoder.decode();
  } finally { await reader.cancel().catch(() => undefined); reader.releaseLock(); }
  try { return JSON.parse(result) as unknown; } catch { throw new InputError('JSON non valido'); }
}
export function errorResponse(error: unknown) {
  return Response.json({ error: error instanceof InputError ? error.message : 'Servizio temporaneamente non disponibile. Riprova.' },
    { status: error instanceof InputError ? error.status : 503, headers: { 'Cache-Control': 'no-store' } });
}
