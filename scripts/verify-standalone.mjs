// Offline providers; only the existing temporary test Mongo at 127.0.0.1:27018.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { cp, mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = process.argv[2] || '.next-build-production';
if (!/^\.next(?:-[a-z0-9-]+)?$/u.test(dist)) throw new Error('Provide a local .next build directory');
const temporary = await mkdtemp(join(tmpdir(), 'conclavia-standalone-'));
const app = join(temporary, 'conclavia-onboarding-avatar');
const environment = {
  PATH: process.env.PATH, NODE_ENV: 'production', NEXT_TELEMETRY_DISABLED: '1', HOSTNAME: '127.0.0.1',
  ONBOARDING_BASE_URL: 'https://onboarding.example.com', ONBOARDING_AI_ENABLED: 'false',
  MONGODB_URI: 'mongodb://127.0.0.1:27018', MONGODB_DB_NAME: 'onboarding_test_readiness_only',
  ONBOARDING_ADMIN_TOKEN: randomBytes(32).toString('hex'),
  ONBOARDING_SESSION_SECRET: randomBytes(32).toString('hex'),
};
const sha = data => createHash('sha256').update(data).digest('hex');
let child;

async function stop() {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise(resolveExit => child.once('exit', resolveExit));
  child.kill('SIGTERM');
  const kill = setTimeout(() => child?.kill('SIGKILL'), 3000);
  await exited;
  clearTimeout(kill);
}
async function unusedPort() {
  const socket = createServer();
  await new Promise((resolveListen, reject) => {
    socket.once('error', reject);
    socket.listen(0, '127.0.0.1', resolveListen);
  });
  const port = socket.address().port;
  await new Promise(resolveClose => socket.close(resolveClose));
  return port;
}
async function start(overrides = {}) {
  await stop();
  const port = await unusedPort();
  child = spawn(process.execPath, ['scripts/start-production.mjs'], {
    cwd: app, env: { ...environment, ...overrides, PORT: String(port) }, stdio: 'ignore',
  });
  const origin = `http://127.0.0.1:${port}`;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (child.exitCode !== null) throw new Error('Standalone process exited before serving requests');
    try {
      const response = await fetch(origin, { signal: AbortSignal.timeout(500) });
      if (response.ok) return origin;
    } catch { /* Wait only for this test's process. */ }
    await delay(100);
  }
  throw new Error('Standalone process did not become available');
}

try {
  await cp(join(root, dist, 'standalone'), temporary, { recursive: true,
    filter: source => !basename(source).startsWith('.env') });
  await cp(join(root, dist, 'static'), join(app, dist, 'static'), { recursive: true });
  await cp(join(root, 'public'), join(app, 'public'), { recursive: true });
  for (const file of ['production-config.mjs', 'check-production.mjs', 'start-production.mjs'])
    await cp(join(root, 'scripts', file), join(app, 'scripts', file), { recursive: true });

  const rejected = spawnSync(process.execPath, ['scripts/start-production.mjs'], {
    cwd: app, env: { ...environment, ONBOARDING_BASE_URL: 'http://localhost:3002' }, encoding: 'utf8',
  });
  assert.equal(rejected.status, 1);
  assert.match(rejected.stderr, /ONBOARDING_BASE_URL/u);
  assert.ok(!rejected.stderr.includes(environment.ONBOARDING_ADMIN_TOKEN));
  console.log('PASS: invalid runtime configuration fails before listening');

  let origin = await start();
  const health = await fetch(`${origin}/api/health`, { signal: AbortSignal.timeout(12000) });
  assert.equal(health.status, 200, 'Temporary Mongo must be running on port 27018');
  assert.deepEqual(await health.json(), { status: 'ok' });
  assert.match(health.headers.get('cache-control'), /no-store/u);
  console.log('PASS: readiness pings isolated test Mongo without exposing details');

  const html = await (await fetch(origin)).text();
  const scripts = [...html.matchAll(/src="([^"]+\.js[^"]*)"/gu)].map(match => match[1]);
  assert.ok(scripts.length > 0);
  for (const script of scripts) assert.equal((await fetch(new URL(script, origin))).status, 200);
  for (const file of ['male.glb', 'female.glb']) {
    const response = await fetch(`${origin}/avatars/rigged-v1/${file}`);
    assert.equal(response.status, 200);
    assert.equal(sha(Buffer.from(await response.arrayBuffer())),
      sha(await readFile(join(root, '../conclavia-avatar-kit/assets/rigged-v1', file))));
  }
  assert.equal((await fetch(`${origin}/avatars/rigged-v1/unknown.glb`)).status, 404);
  for (const file of ['avatar-host.webp', 'avatar-host-listening.mp4', 'avatar-welcome-it.mp4', 'avatar-welcome-en.mp4', 'mouth-atlas.png', 'motion.json']) {
    const response = await fetch(`${origin}/avatars/host-v1/${file}`);
    assert.equal(response.status, 200);
    assert.equal(sha(Buffer.from(await response.arrayBuffer())), sha(await readFile(join(root, '../conclavia-avatar-kit/assets/host-v1', file))));
  }
  const part = await fetch(`${origin}/avatars/host-v1/avatar-host-listening.mp4`, { headers: { range: 'bytes=0-31' } });
  assert.equal(part.status, 206); assert.equal((await part.arrayBuffer()).byteLength, 32);
  assert.equal((await fetch(`${origin}/avatars/host-v1/manifest.json`)).status, 404);
  console.log('PASS: standalone includes the exact shared photoreal host and serves byte ranges');
  console.log('PASS: standalone serves its JavaScript and exact shared GLBs; unknown assets are denied');

  // Reserve a TCP port without a Mongo server: connections cannot reach any real database.
  const unavailable = createServer(socket => socket.destroy());
  await new Promise(resolveListen => unavailable.listen(0, '127.0.0.1', resolveListen));
  try {
    origin = await start({ MONGODB_URI: `mongodb://127.0.0.1:${unavailable.address().port}` });
    const response = await fetch(`${origin}/api/health`, { signal: AbortSignal.timeout(12000) });
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { status: 'unavailable' });
    console.log('PASS: Mongo failure returns a redacted 503');
  } finally {
    await stop();
    await new Promise(resolveClose => unavailable.close(resolveClose));
  }
} finally {
  await stop();
  await rm(temporary, { recursive: true, force: true });
}
