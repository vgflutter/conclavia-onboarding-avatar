'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { BusinessAvatar } from './BusinessAvatar';
import { IntegrationPanel } from './IntegrationPanel';
import { defaultAvatar, exampleFlow } from '@/lib/onboarding/example';
import { AVATAR_VOICES } from '@/lib/avatar-voice-catalog';
import { compatibleAvatarVoice } from '@conclavia/avatar-kit/lib/avatar-voice-catalog';
import { avatarAppearanceForStyle, avatarAppearancesForStyle } from '@conclavia/avatar-kit/lib/avatar-catalog';
import { ASSISTANT_VISUAL_STYLES } from '@conclavia/avatar-kit/types/assistant-profile';
import { avatarVisualStyleLabel } from '@conclavia/avatar-kit/lib/avatar-visual-style';
import type { Site } from '@/lib/onboarding/types';

type PublicSite = Omit<Site, 'keyHash'>;
async function api(path: string, method = 'GET', body?: unknown) {
  const res = await fetch(`/api/admin/${path}`, { method, headers: { 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const data = await res.json();
  if (!res.ok) throw Object.assign(new Error(data.error || 'Operazione non riuscita'), { status: res.status });
  return data;
}
export function Studio() {
  const [sites, setSites] = useState<PublicSite[]>([]);
  const [draft, setDraft] = useState<PublicSite | null>(null);
  const [logged, setLogged] = useState<boolean | null>(null);
  const [loginToken, setLoginToken] = useState('');
  const [tab, setTab] = useState('avatar');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [flowsJson, setFlowsJson] = useState('[]');
  const [apiKey, setApiKey] = useState('');
  const [creating, setCreating] = useState(false);
  const [integrationOrigin, setIntegrationOrigin] = useState('');
  const [stats, setStats] = useState({ active: 0, completed: 0 });
  const [providers, setProviders] = useState({ intelligence: false, voice: false });
  function choose(site: PublicSite) { setDraft(structuredClone(site)); setFlowsJson(JSON.stringify(site.flows, null, 2)); setNotice(''); setError(''); setCreating(false); setApiKey(''); }
  function chooseStyle(visualStyle: Site['avatar']['visualStyle']) {
    if (!draft) return;
    const appearance = avatarAppearanceForStyle(draft.avatar.appearance, visualStyle);
    setDraft({ ...draft, avatar: { ...draft.avatar, visualStyle, appearance,
      ...(visualStyle === 'photoreal_host' ? { voiceIt: compatibleAvatarVoice(draft.avatar.voiceIt, 'it', appearance),
        voiceEn: compatibleAvatarVoice(draft.avatar.voiceEn, 'en', appearance) } : {}) } });
  }
  async function load() {
    try {
      const data = await api('sites');
      setSites(data.sites); setStats(data.stats); setProviders(data.providers); setIntegrationOrigin(data.origin); setLogged(true);
      if (data.sites[0]) choose(data.sites[0]);
    } catch (e) {
      setLogged(false);
      if ((e as { status?: number }).status !== 401) setError((e as Error).message);
    }
  }
  useEffect(() => {
    let active = true;
    void api('sites').then(data => {
      if (!active) return;
      setSites(data.sites); setStats(data.stats); setProviders(data.providers); setIntegrationOrigin(data.origin); setLogged(true);
      if (data.sites[0]) choose(data.sites[0]);
    }).catch(e => { if (active) { setLogged(false); if (e.status !== 401) setError(e.message); } });
    return () => { active = false; };
  }, []);
  async function login(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError('');
    try { await api('login', 'POST', { token: loginToken }); setLoginToken(''); await load(); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function save() {
    if (!draft) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const body = { ...draft, flows: JSON.parse(flowsJson) };
      const data = await api(creating ? 'sites' : `sites/${draft._id}`, creating ? 'POST' : 'PUT', { ...body, id: draft._id });
      setDraft(data.site); setSites(current => [...current.filter(s => s._id !== data.site._id), data.site]);
      setCreating(false); setFlowsJson(JSON.stringify(data.site.flows, null, 2));
      if (data.apiKey) setApiKey(data.apiKey);
      setNotice('Configurazione salvata. Le nuove sessioni useranno queste impostazioni.');
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  function newSite() {
    setDraft({ _id: '', name: '', allowedOrigins: ['http://localhost:3001'], avatar: { ...defaultAvatar }, context: '', flows: [], revision: 0, updatedAt: new Date() });
    setFlowsJson('[]'); setCreating(true); setTab('integration'); setApiKey(''); setError(''); setNotice('');
  }
  async function preview(flowId: string) {
    if (!draft) return;
    setBusy(true); setError('');
    try { const data = await api(`sites/${draft._id}/preview`, 'POST', { flowId }); window.location.assign(data.url); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  if (logged === null) return <main className="login"><p>Caricamento dello studio…</p></main>;
  if (!logged) return <main className="login"><div className="wordmark">conclavia<span>ONBOARDING STUDIO</span></div>
    <div className="eyebrow">Il tuo spazio di lavoro</div><h1>Progetta il primo incontro.</h1><p>Accedi per configurare gli avatar e i percorsi dei tuoi siti.</p>
    <form className="stack" onSubmit={login}><label>Chiave di accesso allo studio<input autoComplete="current-password" type="password" required value={loginToken} onChange={e => setLoginToken(e.target.value)} /></label>
      {error && <p role="alert" className="notice error">{error}</p>}<button className="primary" disabled={busy}>Accedi allo studio →</button></form></main>;
  return <div className="studio"><aside className="sidebar"><Link href="/" className="wordmark" style={{ textDecoration: 'none' }}>conclavia<span>ONBOARDING STUDIO</span></Link>
    <nav><button className="selected" onClick={() => setTab('avatar')}>◉ &nbsp; Il tuo onboarding</button><button onClick={newSite}>＋ &nbsp; Aggiungi sito</button></nav>
    <div className="sidebar-foot"><p>Una conversazione,<br />un passo alla volta.</p><button className="quiet" onClick={async () => { await api('logout', 'POST'); setLogged(false); setDraft(null); }}>Esci</button></div></aside>
    <main className="studio-main"><header className="row spread studio-header"><span className="eyebrow" style={{ margin: 0 }}>Workspace / Configurazione</span><span className="pill">{stats.active} in corso · {stats.completed} completati</span></header>
      <div className="studio-title row spread"><div><h1>Un’accoglienza che ti somiglia.</h1><p>Prepara l’avatar, il contesto e le domande. Al resto pensa la conversazione.</p></div></div>
      {error && <p role="alert" className="notice error">{error}</p>}{notice && <p role="status" className="notice">{notice}</p>}
      {!draft ? <div className="card"><h2>Il primo sito</h2><p>Crea un sito per iniziare a configurare il tuo onboarding.</p><button className="primary" onClick={newSite}>Aggiungi sito</button></div> : <>
        <div className="row spread"><label>Sito<select value={creating ? '' : draft._id} onChange={e => { const site = sites.find(s => s._id === e.target.value); if (site) choose(site); }}><option value="" disabled>Nuovo sito</option>{sites.map(s => <option key={s._id} value={s._id}>{s.name}</option>)}</select></label>
          <span className="small muted">{creating ? 'Nuova configurazione' : `Versione ${draft.revision}`} · Salvataggio esplicito</span></div>
        <nav className="tabs" aria-label="Configurazione">{[['avatar', '01 Avatar'], ['context', '02 Contesto'], ['flows', '03 Percorsi'], ['integration', '04 Integrazione']].map(([key, label]) => <button key={key} className={tab === key ? 'active' : ''} onClick={() => setTab(key)}>{label}</button>)}</nav>
        <div className={tab === 'integration' ? 'workspace integration-workspace' : 'workspace'}><section className="card stack">
          {tab === 'avatar' && <><div><div className="eyebrow">Il volto del tuo servizio</div><h2>Piacere di conoscerti.</h2><p>Scegli come si presenta e come parla il tuo assistente.</p></div>
            <label>Nome dell’avatar<input value={draft.avatar.name} maxLength={80} onChange={e => setDraft({ ...draft, avatar: { ...draft.avatar, name: e.target.value } })} /></label>
            <label>Stile visivo</label><div className="style-options">{ASSISTANT_VISUAL_STYLES.map(value => <button className={draft.avatar.visualStyle === value ? 'selected' : ''} key={value} onClick={() => chooseStyle(value)}>{avatarVisualStyleLabel(value, true)}</button>)}</div>
            {draft.avatar.visualStyle === 'photoreal_host' && <p className="small">Il volto della homepage, con movimenti naturali e labiale dinamico sperimentale. Il benvenuto registrato e le risposte libere hanno una resa diversa.</p>}
            <div className="fields"><label>Personaggio<select value={draft.avatar.appearance} onChange={e => setDraft({ ...draft, avatar: { ...draft.avatar, appearance: e.target.value as Site['avatar']['appearance'] } })}>{avatarAppearancesForStyle(draft.avatar.visualStyle).map(avatar => <option key={avatar.id} value={avatar.id}>{avatar.labels.it}</option>)}</select></label>
              <label>Velocità della voce<input type="number" min="0.8" max="1.2" step="0.05" value={draft.avatar.speakingRate} onChange={e => setDraft({ ...draft, avatar: { ...draft.avatar, speakingRate: Number(e.target.value) } })} /></label></div>
            <div className="fields">{(['it', 'en'] as const).map(locale => <label key={locale}>{locale === 'it' ? 'Voce italiana' : 'Voce inglese'}<select value={locale === 'it' ? draft.avatar.voiceIt : draft.avatar.voiceEn} onChange={e => setDraft({ ...draft, avatar: { ...draft.avatar, [locale === 'it' ? 'voiceIt' : 'voiceEn']: e.target.value } })}>{AVATAR_VOICES.filter(v => v.language === locale).map(v => <option key={v.id} value={v.id}>{v.name} · {v.gender === 'male' ? 'M' : 'F'}</option>)}</select></label>)}</div>
          </>}
          {tab === 'context' && <><div><div className="eyebrow">Una conversazione con uno scopo</div><h2>Il contesto giusto.</h2><p>Descrivi il servizio e le informazioni utili per spiegare le domande ai clienti.</p></div>
            <label>Contesto del sito<textarea rows={13} maxLength={8000} value={draft.context} onChange={e => setDraft({ ...draft, context: e.target.value })} placeholder="Chi siete, a cosa serve questo onboarding, termini da spiegare…" /></label>
            <div className="notice">L’avatar resta nel percorso di onboarding. Raccoglie risposte esplicite, chiarisce le ambiguità e chiede al cliente di confermare il riepilogo.</div></>}
          {tab === 'flows' && <><div><div className="eyebrow">Dalle domande alle risposte</div><h2>Ogni percorso ha un obiettivo.</h2><p>Configura le domande qui oppure ricevi un questionario dal tuo sito quando inizia la sessione.</p></div>
            {draft.flows.map(flow => <div className="flow-row" key={flow.id}><div className="row spread"><div><h3>{flow.title}</h3><p className="small">{flow.questions.length} domande · {flow.locale.toUpperCase()} · v{flow.version}</p></div><button disabled={busy} onClick={() => preview(flow.id)}>Prova percorso ↗</button></div><p className="small">{flow.objective}</p></div>)}
            {!draft.flows.length && <p>Nessun percorso salvato. Il sito può comunque inviare il proprio questionario.</p>}
            <button onClick={() => { const next = [...draft.flows.filter(f => f.id !== exampleFlow.id), exampleFlow]; setDraft({ ...draft, flows: next }); setFlowsJson(JSON.stringify(next, null, 2)); }}>Aggiungi percorso di esempio</button>
            <details><summary>Definizione dei percorsi · editor avanzato</summary><p className="small">Domande, opzioni, condizioni e vincoli. Il salvataggio controlla lo schema.</p><label>Schema dei percorsi<textarea className="code" rows={20} value={flowsJson} onChange={e => setFlowsJson(e.target.value)} /></label></details>
          </>}
          {tab === 'integration' && <IntegrationPanel key={draft._id} site={draft} onChange={setDraft} creating={creating} apiKey={apiKey} origin={integrationOrigin} />}
          <div className="form-actions row spread"><span className="small muted">Le sessioni in corso mantengono la loro configurazione.</span><button className="primary" disabled={busy} onClick={save}>{busy ? 'Salvataggio…' : creating ? 'Crea sito' : 'Salva modifiche'} →</button></div>
        </section><aside className="preview"><div className="preview-avatar"><BusinessAvatar appearance={draft.avatar.appearance} visualStyle={draft.avatar.visualStyle} mood="friendly" voiceLevel={0} welcomeLanguage="it" /></div><div className="preview-caption"><div className="row spread"><h3>{draft.avatar.name || 'Il tuo avatar'}</h3><span className="pill">Anteprima</span></div><p className="small" style={{ margin: '10px 0 0' }}>Qui per accompagnarti, una domanda alla volta.</p></div></aside></div>
        <p className="small muted" style={{ marginTop: 24 }}>Conversazione: {providers.intelligence ? 'configurata' : 'da configurare'} · Voce: {providers.voice ? 'configurata' : 'da configurare'}</p>
      </>}
    </main></div>;
}
