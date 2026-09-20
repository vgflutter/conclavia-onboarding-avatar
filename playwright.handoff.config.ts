import { defineConfig } from '@playwright/test';
import base from './playwright.config';

// Optional cross-repository integration: both real frontends, a synthetic backend.
const hostEnv = {
  API_BASE_URL: 'http://localhost:3115', NEXTAUTH_URL: 'http://localhost:3114',
  NEXTAUTH_SECRET: 'synthetic-nextauth-secret-for-handoff-only',
  INTERNAL_JWT_SECRET: 'synthetic-internal-secret-for-handoff-only',
  CONCLAVIA_ONBOARDING_ENABLED: 'true', CONCLAVIA_ONBOARDING_URL: 'http://localhost:3103',
  CONCLAVIA_ONBOARDING_API_KEY: 'synthetic-site-key-for-handoff-only-00000000',
  NEXT_PUBLIC_GA_MEASUREMENT_ID: '',
};
Object.assign(process.env, hostEnv);
export default defineConfig({ ...base, testDir: './tests/handoff', timeout: 90_000,
  webServer: [
    { command: 'node tests/handoff/backend.mjs', url: 'http://localhost:3115/health', timeout: 30_000 },
    { command: 'npm run dev -- --port 3103', url: 'http://localhost:3103', timeout: 90_000 },
    { command: 'npm run dev -- --port 3114', cwd: '../aihat-client', url: 'http://localhost:3114/api/auth/providers', env: hostEnv, timeout: 90_000 },
  ],
});
