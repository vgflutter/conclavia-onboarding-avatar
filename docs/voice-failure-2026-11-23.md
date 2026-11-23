# Guasto della voce Onboarding — 23 novembre 2026

## Diagnosi

Sul servizio `https://onboarding.conclavia.me` la configurazione runtime è abilitata e le credenziali OpenAI/Inworld sono presenti. Un solo controllo Inworld con la frase sintetica «Ciao.» restituisce `HTTP 402`, classificato come credito insufficiente. Non sono stati usati audio, risposte o record di clienti nel controllo del provider.

La generazione dell’audio dell’avatar fallisce, mentre la trascrizione può restare collegata. Il client mostrava quindi il messaggio generico di voce non disponibile insieme a «Ti ascolto» e al pulsante di pausa. Le risposte visibili di chiarimento non dimostrano un errore di interpretazione: la schermata, da sola, non contiene ciò che è stato pronunciato.

## Correzione

Quando la riproduzione fallisce, `SessionRoom` registra soltanto il motivo consentito `playback_failed`, chiude microfono e connessione e passa ai campi/testo. Mantiene le risposte salvate e usa il passaggio alla scrittura già esistente per eventuali bozze. Il messaggio IT/EN identifica la riproduzione dell’avatar e indica «Passa alla voce» per riprovare esplicitamente. Un’interruzione volontaria dell’utente non attiva il fallback e non produce un errore.

La correzione non ripristina credito Inworld. Dopo la ricarica serve un nuovo collaudo audio; non ripetere richieste fallite, ruotare chiavi o cambiare voce/provider per aggirare il credito. [Procedura operativa della voce](../../conclavia-deploy/docs/codex-deploy.md#configurazione-della-voce-onboarding).

## Verifiche e rilascio

- 82 test unitari, 6 contratti AIHat, lint e TypeScript superati.
- Tre nuove regressioni Chrome superate: guasto iniziale in italiano/inglese, layout mobile, compilazione manuale e nuovo tentativo, guasto dopo una risposta salvata e ignoramento degli eventi del microfono chiuso.
- Tutte le 15 regressioni vocali Chrome superate nella riesecuzione completa. Build Linux `amd64` superata (`npm run build` nel Dockerfile); i tre nuovi casi passano anche sull’immagine risultante, con API e microfono simulati.
- Screenshot del fallback IT desktop ed EN mobile verificati; nessun overflow orizzontale.
- Le regressioni usano provider/audio sintetici. Non certificano la qualità del microfono fisico o una conversazione reale.

Prima della build confrontati gli hash dei sorgenti con l’immagine originale di produzione: il codice runtime `HEAD` coincide; differisce soltanto il file generato `next-env.d.ts`. La build candidata usa lo snapshot del kit `163be621502a9ed20edb1134bec3a11c3f82a95b` dell’immagine Onboarding attiva, con hash verificati sul manifesto. Le modifiche estranee già presenti nel kit, nel deployer e in `tsconfig.json` rimangono escluse.

Al controllo iniziale c’è una conversazione attiva. Nessun riavvio o abbandono forzato: il runbook richiede di attendere conclusione/scadenza prima dell’attivazione. Versione effettivamente attiva: release Conclavia `20261111183115722-40a8e0`, immagine Onboarding `sha256:6b2b4ad270c164e1fa6a27412657e77bd2fd0febba35250249031d045e72c145` (costruita nella release `20261006230501292-eb15ad`). Immagine candidata verificata: `conclavia-onboarding:voice-fix-20261123`, digest Linux `sha256:3f04563d5fa379238d7f6f772e75fd65a229b53b309f9ba98689679f4faa77f5`. Sorgenti isolati e configurazione del collaudo immagine in `/private/tmp/onboarding-voice-fix-20261123/`; il container di collaudo è stato fermato. La correzione non è ancora online: la build pronta non è una release attivata. Unmatt e Meeting non sono stati riavviati né modificati.
