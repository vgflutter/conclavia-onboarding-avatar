'use client';
import { useState } from 'react';
import type { Site } from '@/lib/onboarding/types';
import styles from './IntegrationPanel.module.css';

type PublicSite = Omit<Site, 'keyHash'>;
export function IntegrationPanel({ site, onChange, creating, apiKey, origin }: {
  site: PublicSite; onChange: (site: PublicSite) => void; creating: boolean; apiKey: string; origin: string;
}) {
  const [copied, setCopied] = useState('');
  const integration = site.integration ?? { mode: 'redirect' as const, returnUrl: '' };
  const publicOrigin = site.allowedOrigins.some(value => {
    try { const url = new URL(value); return url.protocol === 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname); }
    catch { return false; }
  });
  const setIntegration = (patch: Partial<typeof integration>) => onChange({ ...site, integration: { ...integration, ...patch } });
  const serverExample = `// Solo sul backend del tuo sito. Nessuna chiave nel browser.
const origin = ${JSON.stringify(origin)};
const headers = {
  Authorization: 'Bearer ' + process.env.CONCLAVIA_SITE_KEY,
  'Content-Type': 'application/json',
};

// subject viene dall'utente autenticato; flow dal tuo adapter.
export async function startOnboarding(subject, flow) {
  const response = await fetch(origin + '/api/v1/sessions', {
    method: 'POST', headers, cache: 'no-store',
    body: JSON.stringify({ subject, flow,
      returnUrl: ${JSON.stringify(integration.returnUrl || 'https://your-site.example/onboarding/return')},
    }),
  });
  if (!response.ok) throw new Error('Avvio non riuscito');
  const launched = await response.json();
  if (new URL(launched.url).origin !== origin) throw new Error('Origine non valida');
  // Salva sessionId associato a subject sul tuo server.
  // Invia url solo al browser di questo utente; non registrarla nei log.
  return launched;
}

// sessionId deve provenire dall'associazione salvata sul tuo server.
export async function readConfirmedResult(sessionId, subject) {
  const url = new URL(origin + '/api/v1/sessions/' + encodeURIComponent(sessionId) + '/result');
  url.searchParams.set('subject', subject);
  const response = await fetch(url, { headers, cache: 'no-store' });
  if (response.status === 409) return null; // Conferma ancora mancante.
  if (!response.ok) throw new Error('Risultato non disponibile');
  return response.json(); // Valida flowVersion e answers prima di salvarli.
}`;
  const browserExample = integration.mode === 'redirect'
    ? `// launched arriva dal TUO backend autenticato.
if (new URL(launched.url).origin !== ${JSON.stringify(origin)}) throw new Error('Origine non valida');
window.location.assign(launched.url);
// Al ritorno, chiedi al tuo backend di verificare il risultato.
// Il solo ritorno alla pagina non prova che il cliente abbia confermato.`
    : `// launched arriva dal TUO backend autenticato.
const expectedOrigin = ${JSON.stringify(origin)};
if (new URL(launched.url).origin !== expectedOrigin) throw new Error('Origine non valida');
const frame = document.createElement('iframe');
frame.title = 'Onboarding Conclavia';
frame.allow = 'microphone; camera';
frame.src = launched.url;
document.querySelector('#onboarding').append(frame);
window.addEventListener('message', event => {
  if (event.origin !== expectedOrigin || event.source !== frame.contentWindow) return;
  if (event.data?.type !== 'conclavia.completed' || event.data.sessionId !== launched.sessionId) return;
  // Chiedi al TUO backend di recuperare e validare il risultato.
  // Non usare postMessage come prova delle risposte o autorizzazione a salvarle.
});`;
  async function copy(value: string, label: string) {
    try { await navigator.clipboard.writeText(value); setCopied(`${label} copiato`); }
    catch { setCopied('Copia non disponibile: seleziona il testo manualmente.'); }
  }
  function download() {
    const content = `# Integrazione Conclavia · ${site.name}\n\nConfigurazione di lavoro: salva le modifiche nello Studio prima di usarla.\n\nSito: ${site._id}\nOrigine Conclavia: ${origin}\nModalità: ${integration.mode}\nRitorno: ${integration.returnUrl || 'DA CONFIGURARE'}\nOrigini autorizzate: ${site.allowedOrigins.join(', ')}\n\n## Backend\n\n\`\`\`js\n${serverExample}\n\`\`\`\n\n## Browser\n\n\`\`\`js\n${browserExample}\n\`\`\`\n\n## Verifica finale\n\nAvvio dal sito con utente di test; conferma in Conclavia; recupero server del risultato; verifica proprietà della sessione, versione del percorso e schema; salvataggio idempotente nel sito. Gli esempi sono funzioni di partenza, non un adapter completo.\n`;
    const url = URL.createObjectURL(new Blob([content], { type: 'text/markdown;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = 'conclavia-integration.md'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <div className="stack">
    <div><div className="eyebrow">Dal tuo sito, al primo incontro</div><h2>Un collegamento chiaro.</h2><p>Il tuo sito gestisce il cliente. Conclavia accompagna la conversazione. Le risposte confermate tornano al tuo server.</p></div>
    <ol className={styles.journey} aria-label="Come funziona l’integrazione">
      <li><span>01 / IL TUO SITO</span><h3>Apri la sessione</h3><p>Il backend identifica il cliente e invia il questionario.</p></li>
      <li><span>02 / CONCLAVIA</span><h3>Parla e conferma</h3><p>L’avatar guida il percorso. Il cliente rivede le risposte.</p></li>
      <li><span>03 / IL TUO SERVER</span><h3>Recupera e salva</h3><p>Il backend verifica il risultato e lo salva nel tuo servizio.</p></li>
    </ol>
    <div className="fields"><label>Nome del sito<input value={site.name} onChange={e => onChange({ ...site, name: e.target.value })} /></label><label>Identificatore<input disabled={!creating} value={site._id} onChange={e => onChange({ ...site, _id: e.target.value })} placeholder="il-tuo-sito" /></label></div>
    <fieldset className={styles.modes}><legend>Dove avviene la conversazione?</legend>
      <button type="button" aria-pressed={integration.mode === 'redirect'} onClick={() => setIntegration({ mode: 'redirect' })}><strong>Pagina Conclavia ↗</strong><span>Consigliata per iniziare. Al termine il cliente torna al tuo sito.</span></button>
      <button type="button" aria-pressed={integration.mode === 'iframe'} onClick={() => setIntegration({ mode: 'iframe' })}><strong>Dentro il tuo sito</strong><span>Un iframe mantiene la conversazione nella tua interfaccia.</span></button>
    </fieldset>
    <label>Origini autorizzate · una per riga<textarea rows={3} value={site.allowedOrigins.join('\n')} onChange={e => onChange({ ...site, allowedOrigins: e.target.value.split('\n') })} /></label>
    {!publicOrigin && <p className="notice">Le origini attuali sono locali o da completare. Per collegare il sito pubblico aggiungi la sua origine HTTPS esatta, senza percorso, e salva.</p>}
    <label>Pagina di ritorno<input type="url" value={integration.returnUrl} onChange={e => setIntegration({ returnUrl: e.target.value })} placeholder="https://tuo-sito.it/onboarding/ritorno" /><span className="small muted">L’indirizzo completo deve appartenere a un’origine autorizzata. Il backend lo passa all’apertura di ogni sessione.</span></label>
    <div className={styles.status}><span className="eyebrow">Cosa è configurato</span><dl><div><dt>Percorsi nello Studio</dt><dd>{site.flows.length || 'Nessuno'} · il backend può anche inviarli all’avvio</dd></div><div><dt>Pagina di ritorno</dt><dd>{integration.returnUrl ? 'Inserita nella configurazione' : 'Da impostare'}</dd></div><div><dt>Verifica dal tuo sito</dt><dd>Da eseguire con un cliente di test</dd></div></dl><p className="small">Salva esplicitamente le modifiche. Queste impostazioni non installano l’adapter sul tuo sito e non attestano che il risultato sia stato salvato dal tuo servizio.</p></div>
    <div className="notice">La chiave di integrazione resta sul server del sito, nella variabile <code>CONCLAVIA_SITE_KEY</code>. Ogni cliente riceve soltanto l’accesso temporaneo alla propria sessione.</div>
    {apiKey && <label>Chiave creata · copiala ora, verrà mostrata una sola volta<input readOnly type="password" value={apiKey} onFocus={e => e.target.select()} /><button onClick={() => copy(apiKey, 'Valore')}>Copia chiave</button></label>}
    <details className={styles.example}><summary>Per chi integra · esempi e verifica</summary><p>Funzioni di partenza per il tuo adapter. Autenticazione, associazione cliente-sessione, validazione e salvataggio restano nel tuo backend.</p><h3>1. Backend del sito</h3><pre className="code">{serverExample}</pre><button onClick={() => copy(serverExample, 'Esempio backend')}>Copia esempio backend</button><h3>2. Apertura nel browser</h3><pre className="code">{browserExample}</pre><button onClick={() => copy(browserExample, 'Esempio browser')}>Copia esempio browser</button><h3>3. Verifica completa</h3><p>Avvia dal sito con un utente di test, completa e conferma, poi verifica il recupero e il salvataggio idempotente del risultato. Un’anteprima nello Studio controlla il percorso, non il collegamento del tuo backend.</p><button onClick={download}>Scarica guida di integrazione</button></details>
    <span role="status" className="small">{copied}</span>
  </div>;
}
