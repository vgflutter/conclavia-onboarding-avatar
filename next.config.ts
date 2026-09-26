import path from 'node:path';
import type { NextConfig } from 'next';
const config: NextConfig = {
  output: 'standalone',
  distDir: process.env.NEXT_DIST_DIR || '.next',
  turbopack: { root: path.resolve(process.cwd(), '..') },
  transpilePackages: ['@conclavia/avatar-kit'],
  outputFileTracingRoot: path.resolve(process.cwd(), '..'),
  outputFileTracingIncludes: { '/avatars/host-v1/*': ['./node_modules/@conclavia/avatar-kit/assets/host-v1/*', '../conclavia-avatar-kit/assets/host-v1/*'], '/avatars/rigged-v1/*': ['./node_modules/@conclavia/avatar-kit/assets/**/*', '../conclavia-avatar-kit/assets/**/*'] },
  async headers() {
    return [{ source: '/:path*', headers: [
      { key: 'Referrer-Policy', value: 'no-referrer' },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Permissions-Policy', value: 'camera=(self), microphone=(self)' },
      { key: 'Cache-Control', value: 'no-store' },
    ] }];
  },
};
export default config;
