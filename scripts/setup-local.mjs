import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';

const target = resolve('.env.local');
const source = resolve(process.argv[2] || '../conclavia-meeting-avatar/.env.local');
const existing = existsSync(target) ? parseEnv(readFileSync(target, 'utf8')) : {};
const upstream = existsSync(source) ? parseEnv(readFileSync(source, 'utf8')) : {};
const additions = {};
for (const key of ['MONGODB_URI', 'MONGODB_DB_NAME', 'OPENAI_API_KEY', 'INWORLD_API_KEY', 'INWORLD_TTS_MODEL', 'INWORLD_VOICE_ID_IT', 'INWORLD_VOICE_ID']) {
  if (!existing[key] && upstream[key]) additions[key] = upstream[key];
}
if (!existing.MONGODB_URI && !additions.MONGODB_URI) throw new Error('MongoDB esistente non trovato. Imposta MONGODB_URI in .env.local.');
const defaults = { ONBOARDING_BASE_URL: 'http://localhost:3002', ONBOARDING_AI_ENABLED: 'true',
  OPENAI_ONBOARDING_MODEL: upstream.OPENAI_MEETING_MODEL || 'gpt-5.4-mini', OPENAI_TRANSCRIPTION_MODEL: 'gpt-4o-transcribe',
  ONBOARDING_ADMIN_TOKEN: randomBytes(32).toString('base64url'), ONBOARDING_SESSION_SECRET: randomBytes(32).toString('base64url') };
for (const [key, value] of Object.entries(defaults)) if (!existing[key]) additions[key] = value;
if (Object.keys(additions).length) {
  const before = existsSync(target) ? readFileSync(target, 'utf8') : '';
  const lines = Object.entries(additions).map(([key, value]) => `${key}=${JSON.stringify(value)}`).join('\n');
  writeFileSync(target, `${before}\n# Conclavia onboarding local setup\n${lines}\n`, { mode: 0o600 });
}
mkdirSync('.local', { recursive: true });
writeFileSync('.local/studio-access.txt', `Studio: http://localhost:3002/studio\nChiave di accesso: ${existing.ONBOARDING_ADMIN_TOKEN || additions.ONBOARDING_ADMIN_TOKEN}\n`, { mode: 0o600 });
console.log('Configurazione locale pronta. Mongo e provider riutilizzati; nessun valore sensibile stampato.');
console.log('Accesso allo studio: .local/studio-access.txt (file privato, escluso da Git).');
