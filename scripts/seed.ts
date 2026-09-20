import { mkdirSync, writeFileSync } from 'node:fs';
import mongoose from 'mongoose';
import { collections, database } from '../src/lib/onboarding/db';
import { defaultAvatar, exampleFlow } from '../src/lib/onboarding/example';
import { hash, token } from '../src/lib/onboarding/security';
import { validateAvatar } from '../src/lib/onboarding/validation';

async function main() {
  const { sites } = await collections();
  const db = await database();
  // Read only the visual/voice profile from the existing meeting project.
  const inherited = await db.collection('assistantprofiles').findOne({ key: 'default' },
    { projection: { displayName: 1, appearance: 1, visualStyle: 1, voice: 1 } });
  let avatar = { ...defaultAvatar };
  if (inherited) {
    try { avatar = validateAvatar({ name: inherited.displayName || defaultAvatar.name,
      appearance: inherited.appearance, visualStyle: inherited.visualStyle || 'editorial',
      voiceIt: inherited.voice?.inworldVoiceIdIt || process.env.INWORLD_VOICE_ID_IT || 'Gianni',
      voiceEn: inherited.voice?.inworldVoiceIdEn || process.env.INWORLD_VOICE_ID || 'Dennis',
      speakingRate: inherited.voice?.speakingRate || 1 }); } catch { /* Keep a valid independent default. */ }
  }
  mkdirSync('.local', { recursive: true });
  for (const [id, name, context] of [
    ['demo', 'Il tuo sito', 'Accompagna il cliente nel primo accesso al servizio.'],
    ['aihat', 'AIHat', 'Onboarding AIHat: raccogliere le risposte ai questionari del profilo investitore e del portafoglio. Non dare consigli di investimento, non suggerire le risposte ai test di conoscenza, non calcolare punteggi e non creare portafogli. Le conferme e le valutazioni finali appartengono ad AIHat.'],
  ]) {
    if (await sites.findOne({ _id: id })) { console.log(`${id}: configurazione esistente preservata.`); continue; }
    const key = token();
    await sites.insertOne({ _id: id, name, keyHash: hash(key), context, avatar,
      allowedOrigins: ['http://localhost:3001', 'http://localhost:3002'],
      flows: id === 'demo' ? [exampleFlow] : [], revision: 1, updatedAt: new Date() });
    writeFileSync(`.local/${id}-integration.env`, `CONCLAVIA_ONBOARDING_URL=http://localhost:3002\nCONCLAVIA_ONBOARDING_API_KEY=${key}\nCONCLAVIA_ONBOARDING_ENABLED=true\n`, { mode: 0o600 });
    console.log(`${id}: creato. Credenziale nel file privato .local/${id}-integration.env.`);
  }
}
main().catch(() => { console.error('Setup non completato: verifica la connessione Mongo e la configurazione. Nessun dato sorgente è stato modificato.'); process.exitCode = 1; }).finally(() => mongoose.disconnect());
