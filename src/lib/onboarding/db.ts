import mongoose from 'mongoose';
import type { Session, Site } from './types';
type Runtime = { connection?: Promise<typeof mongoose>; indexes?: Promise<void> };
const globalDb = globalThis as typeof globalThis & { onboardingDb?: Runtime };
const runtime = globalDb.onboardingDb ??= {};

export async function database() {
  if (!process.env.MONGODB_URI) throw new Error('MongoDB non configurato');
  runtime.connection ??= mongoose.connect(process.env.MONGODB_URI, {
    ...(process.env.MONGODB_DB_NAME ? { dbName: process.env.MONGODB_DB_NAME } : {}),
    serverSelectionTimeoutMS: 8000, bufferCommands: false,
  });
  try { await runtime.connection; } catch (error) { runtime.connection = undefined; throw error; }
  const db = mongoose.connection.db;
  if (!db) throw new Error('MongoDB non disponibile');
  return db;
}
export async function collections() {
  const db = await database();
  const sites = db.collection<Site>('onboarding_sites');
  const sessions = db.collection<Session & { lockId?: string; lockUntil?: Date }>('onboarding_sessions');
  const limits = db.collection<{ _id: string; count: number; expiresAt: Date }>('onboarding_limits');
  runtime.indexes ??= (async () => {
    await sites.createIndex({ keyHash: 1 }, { unique: true });
    await sessions.createIndex({ siteId: 1, subject: 1, createdAt: -1 });
    await sessions.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
    await limits.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  })().catch(error => { runtime.indexes = undefined; throw error; });
  await runtime.indexes;
  return { sites, sessions, limits };
}
export async function limit(key: string, maximum: number, seconds = 60) {
  const { limits } = await collections();
  const bucket = Math.floor(Date.now() / (seconds * 1000));
  const row = await limits.findOneAndUpdate({ _id: `${key}:${bucket}` }, {
    $inc: { count: 1 }, $setOnInsert: { expiresAt: new Date((bucket + 2) * seconds * 1000) },
  }, { upsert: true, returnDocument: 'after' });
  return (row?.count ?? maximum + 1) <= maximum;
}
