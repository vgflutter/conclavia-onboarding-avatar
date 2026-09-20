import { NextResponse, type NextRequest } from 'next/server';
import { collections } from '@/lib/onboarding/db';
import { baseUrl } from '@/lib/onboarding/security';

export async function proxy(req: NextRequest) {
  const response = NextResponse.next();
  let ancestors = "'none'";
  if (req.nextUrl.pathname.startsWith('/s/')) {
    try {
      const id = req.nextUrl.pathname.split('/')[2];
      const { sessions, sites } = await collections();
      const session = await sessions.findOne({ _id: id, expiresAt: { $gt: new Date() } }, { projection: { siteId: 1 } });
      const site = session && await sites.findOne({ _id: session.siteId }, { projection: { allowedOrigins: 1 } });
      if (site) ancestors = [baseUrl(), ...site.allowedOrigins].join(' ');
    } catch { /* Deny framing when the allowlist cannot be loaded. */ }
  }
  response.headers.set('Content-Security-Policy', `frame-ancestors ${ancestors}; object-src 'none'; base-uri 'self'`);
  return response;
}
export const config = { matcher: ['/studio/:path*', '/s/:path*', '/'] };
