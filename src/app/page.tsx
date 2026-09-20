import Link from 'next/link';
export default function Home() {
  return <main className="welcome"><div className="wordmark">conclavia<span>ONBOARDING</span></div>
    <div className="eyebrow">Un volto. Una voce. Un percorso.</div>
    <h1>Il primo incontro<br />diventa una conversazione.</h1>
    <p>Un avatar che ascolta, spiega le domande e accompagna ogni cliente fino al completamento del suo onboarding.</p>
    <Link className="button primary" href="/studio">Apri lo studio <span>↗</span></Link>
    <div className="welcome-foot"><span>01 · Configura l’avatar</span><span>02 · Definisci il percorso</span><span>03 · Collegalo al tuo sito</span></div>
  </main>;
}
