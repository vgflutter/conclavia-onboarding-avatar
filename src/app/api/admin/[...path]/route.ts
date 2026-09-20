import { collections, limit } from '@/lib/onboarding/db';
import { adminCookie, baseUrl, errorResponse, hash, jsonBody, requestIsAdmin, safeEqual, sameOrigin, token } from '@/lib/onboarding/security';
import { id, InputError, record, text, validateAvatar, validateFlow, validateOrigins } from '@/lib/onboarding/validation';
import { createSession } from '@/lib/onboarding/sessions';
import type { Site } from '@/lib/onboarding/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ path: string[] }> };
const safeSite = (site: Site) => { const { keyHash: _, ...view } = site; void _; return view; };

export async function GET(req: Request, context: Context) {
  try {
    if (!requestIsAdmin(req)) throw new InputError('Accedi allo studio', 401);
    const { path } = await context.params;
    if (path.join('/') !== 'sites') throw new InputError('Non trovato', 404);
    const { sites, sessions } = await collections();
    const rows = await sites.find().sort({ name: 1 }).limit(100).toArray();
    return Response.json({ sites: rows.map(safeSite), stats: {
      active: await sessions.countDocuments({ status: { $ne: 'completed' }, expiresAt: { $gt: new Date() } }),
      completed: await sessions.countDocuments({ status: 'completed', expiresAt: { $gt: new Date() } }),
    }, providers: { intelligence: process.env.ONBOARDING_AI_ENABLED === 'true' && !!process.env.OPENAI_API_KEY,
      voice: !!process.env.INWORLD_API_KEY }, origin: baseUrl() });
  } catch (error) { return errorResponse(error); }
}
export async function POST(req: Request, context: Context) {
  try {
    sameOrigin(req);
    const { path } = await context.params;
    if (path.join('/') === 'login') {
      if (!await limit('admin-login', 30, 300)) throw new InputError('Troppi tentativi. Riprova più tardi.', 429);
      const body = await jsonBody(req, 1000);
      const configured = process.env.ONBOARDING_ADMIN_TOKEN;
      if (!configured || configured.length < 32 || !record(body) || typeof body.token !== 'string' || !safeEqual(body.token, configured)) throw new InputError('Credenziale non valida', 401);
      return Response.json({ ok: true }, { headers: { 'Set-Cookie': `onboarding_admin=${adminCookie()}; Path=/; HttpOnly; SameSite=Strict; Max-Age=28800${baseUrl().startsWith('https:') ? '; Secure' : ''}` } });
    }
    if (!requestIsAdmin(req)) throw new InputError('Accedi allo studio', 401);
    if (path.join('/') === 'logout') return Response.json({ ok: true }, { headers: { 'Set-Cookie': 'onboarding_admin=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0' } });
    const { sites } = await collections();
    if (path[0] !== 'sites') throw new InputError('Non trovato', 404);
    if (path.length === 3 && path[2] === 'preview') {
      const site = await sites.findOne({ _id: path[1] });
      if (!site) throw new InputError('Sito non trovato', 404);
      const body = await jsonBody(req, 1000);
      if (!record(body)) throw new InputError('Richiesta non valida');
      return Response.json(await createSession({ ...site, allowedOrigins: [baseUrl()] }, {
        flowId: body.flowId, subject: 'studio-preview', returnUrl: `${baseUrl()}/studio`,
      }));
    }
    if (path.length !== 1) throw new InputError('Non trovato', 404);
    const body = await jsonBody(req);
    if (!record(body)) throw new InputError('Richiesta non valida');
    const key = token();
    const site: Site = { _id: id(body.id), name: text(body.name, 'nome'), keyHash: hash(key),
      allowedOrigins: validateOrigins(body.allowedOrigins), avatar: validateAvatar(body.avatar),
      context: text(body.context ?? '', 'contesto', 8000, true), flows: [], revision: 1, updatedAt: new Date() };
    if (await sites.findOne({ _id: site._id })) throw new InputError('Identificatore già utilizzato', 409);
    await sites.insertOne(site);
    return Response.json({ site: safeSite(site), apiKey: key }, { status: 201 });
  } catch (error) { return errorResponse(error); }
}
export async function PUT(req: Request, context: Context) {
  try {
    sameOrigin(req);
    if (!requestIsAdmin(req)) throw new InputError('Accedi allo studio', 401);
    const { path } = await context.params;
    if (path[0] !== 'sites' || path.length !== 2) throw new InputError('Non trovato', 404);
    const body = await jsonBody(req);
    if (!record(body) || !Number.isInteger(body.revision) || !Array.isArray(body.flows) || body.flows.length > 30) throw new InputError('Configurazione non valida');
    const flows = body.flows.map(validateFlow);
    if (new Set(flows.map(f => f.id)).size !== flows.length) throw new InputError('Identificatori dei flussi duplicati');
    const { sites } = await collections();
    const site = await sites.findOneAndUpdate({ _id: path[1], revision: body.revision as number }, {
      $set: { name: text(body.name, 'nome'), avatar: validateAvatar(body.avatar),
        context: text(body.context, 'contesto', 8000, true), allowedOrigins: validateOrigins(body.allowedOrigins),
        flows, updatedAt: new Date() }, $inc: { revision: 1 },
    }, { returnDocument: 'after' });
    if (!site) throw new InputError('Configurazione modificata altrove. Ricarica prima di salvare.', 409);
    return Response.json({ site: safeSite(site) });
  } catch (error) { return errorResponse(error); }
}
