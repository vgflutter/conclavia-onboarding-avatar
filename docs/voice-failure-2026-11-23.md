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


## Layout richiesto dopo la diagnosi

Il limite comune di 480 px rendeva la conversazione stretta anche su desktop. La superficie vocale ora arriva a 1180 px: da 960 px di viewport l’avatar occupa la colonna principale (fino a 580 px di diametro), mentre domanda, sottotitoli e comandi rimangono affiancati in un pannello compatto. I comandi desktop sono nel normale flusso, senza il riquadro fisso inferiore.

Su mobile/tablet il percorso resta verticale, con avatar più grande e dock inferiore ridotto. I viewport bassi e il telefono orizzontale hanno proporzioni dedicate per mantenere leggibili domanda e comandi. Quando si aprono le opzioni su mobile, il dock entra nel normale flusso e l’avatar si riduce temporaneamente: le scelte non vengono coperte dai comandi fissi. I pulsanti principali restano di almeno 44 px. L’uscita ha una presentazione discreta; dopo il consenso la pagina torna all’inizio per mostrare l’avatar intero. Campi, revisione e fallback testuale restano disponibili.

Otto verifiche visive superate con sessioni e audio sintetici, senza overflow orizzontale o errori JavaScript: desktop 1440×900 e 1750×1000, laptop 1280×720, tablet 834×1112, telefoni 390×844 e 375×667, orizzontale 844×390 e viewport ridotto 720×450. Screenshot in `/private/tmp/onboarding-layout-20261123/`. La build Linux con il kit di produzione è pronta: immagine `conclavia-onboarding:voice-layout-20261123`, digest `sha256:edd6c57fa55777760a825fd9ca52ca0bb7581ca04a7f4617b21edaef1149957f`; include anche la correzione della riproduzione vocale. Questa candidata sostituisce quella della sola voce per il prossimo rilascio.

La suite vocale di 15 casi è passata sull’immagine Linux. Dopo la rifinitura finale delle opzioni mobile sono passati anche i due flussi di selezione/ripresa e i due controlli visivi dei telefoni sull’immagine definitiva. Lint, TypeScript e 82 test unitari superati. La guardia, ricontrollata dopo la conclusione del percorso, rileva zero conversazioni attive: attivazione in preparazione. La ricarica Inworld rimane un intervento distinto dal layout. Esito e versione attiva vengono registrati dopo il rilascio.
