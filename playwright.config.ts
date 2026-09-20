import { defineConfig, devices } from '@playwright/test';
import { randomUUID } from 'node:crypto';

// The existing temporary local test Mongo only. Never the SSH-forwarded application DB.
process.env.MONGODB_URI = 'mongodb://127.0.0.1:27018';
process.env.ONBOARDING_TEST_DB ||= `onboarding_test_${randomUUID().replaceAll('-', '')}`;
process.env.MONGODB_DB_NAME = process.env.ONBOARDING_TEST_DB;
process.env.NEXT_DIST_DIR = '.next-e2e';
process.env.ONBOARDING_BASE_URL = 'http://localhost:3103';
process.env.ONBOARDING_AI_ENABLED = 'false';
process.env.OPENAI_API_KEY = '';
process.env.INWORLD_API_KEY = '';
process.env.ONBOARDING_ADMIN_TOKEN = 'test-admin-credential-with-at-least-32-chars';
process.env.ONBOARDING_SESSION_SECRET = 'test-signing-secret-with-at-least-32-chars';

export default defineConfig({ testDir: './tests/browser', fullyParallel: false, workers: 1, timeout: 60_000,
  use: { baseURL: 'http://localhost:3103', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  webServer: { command: 'npm run dev -- --port 3103', url: 'http://localhost:3103', reuseExistingServer: false, timeout: 90_000 },
  projects: [{ name: 'chrome', use: { ...devices['Desktop Chrome'], channel: 'chrome' } }],
});
