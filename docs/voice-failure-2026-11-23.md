# Voce e layout Onboarding — 23 novembre 2026

Stato finale: correzione della gestione audio e layout ampio anche durante la scrittura pubblicati, commit applicativo `e68e6e6`, release `20261123180752245-7f1530`. Il blocco del credito Inworld resta distinto dal rilascio.

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

Al controllo iniziale c’è una conversazione attiva. Nessun riavvio o abbandono forzato: il runbook richiede di attendere conclusione/scadenza prima dell’attivazione. Versione attiva all’inizio dell’intervento: release Conclavia `20261111183115722-40a8e0`, immagine Onboarding `sha256:6b2b4ad270c164e1fa6a27412657e77bd2fd0febba35250249031d045e72c145` (costruita nella release `20261006230501292-eb15ad`). Immagine candidata verificata: `conclavia-onboarding:voice-fix-20261123`, digest Linux `sha256:3f04563d5fa379238d7f6f772e75fd65a229b53b309f9ba98689679f4faa77f5`. Sorgenti isolati e configurazione del collaudo immagine in `/private/tmp/onboarding-voice-fix-20261123/`; il container di collaudo è stato fermato. In quella fase la correzione era pronta e non ancora online. Il limite della conversazione attiva è stato superato dopo la sua conclusione, come registrato nel rilascio finale. Unmatt e Meeting non sono stati riavviati né modificati.


## Layout richiesto dopo la diagnosi

Il limite comune di 480 px rendeva la conversazione stretta anche su desktop. La superficie vocale ora arriva a 1180 px: da 960 px di viewport l’avatar occupa la colonna principale (fino a 580 px di diametro), mentre domanda, sottotitoli e comandi rimangono affiancati in un pannello compatto. I comandi desktop sono nel normale flusso, senza il riquadro fisso inferiore.

Su mobile/tablet il percorso resta verticale, con avatar più grande e dock inferiore ridotto. I viewport bassi e il telefono orizzontale hanno proporzioni dedicate per mantenere leggibili domanda e comandi. Quando si aprono le opzioni su mobile, il dock entra nel normale flusso e l’avatar si riduce temporaneamente: le scelte non vengono coperte dai comandi fissi. I pulsanti principali restano di almeno 44 px. L’uscita ha una presentazione discreta; dopo il consenso la pagina torna all’inizio per mostrare l’avatar intero. Campi, revisione e fallback testuale restano disponibili.

Otto verifiche visive superate con sessioni e audio sintetici, senza overflow orizzontale o errori JavaScript: desktop 1440×900 e 1750×1000, laptop 1280×720, tablet 834×1112, telefoni 390×844 e 375×667, orizzontale 844×390 e viewport ridotto 720×450. Screenshot in `/private/tmp/onboarding-layout-20261123/`. La build Linux con il kit di produzione è pronta: immagine `conclavia-onboarding:voice-layout-20261123`, digest `sha256:edd6c57fa55777760a825fd9ca52ca0bb7581ca04a7f4617b21edaef1149957f`; include anche la correzione della riproduzione vocale. Questa candidata sostituisce quella della sola voce per il prossimo rilascio.

La suite vocale di 15 casi è passata sull’immagine Linux. Dopo la rifinitura finale delle opzioni mobile sono passati anche i due flussi di selezione/ripresa e i due controlli visivi dei telefoni sull’immagine definitiva. Lint, TypeScript e 82 test unitari superati. La guardia, ricontrollata dopo la conclusione del percorso, ha rilevato zero conversazioni attive e ha permesso il rilascio. La ricarica Inworld rimane un intervento distinto dal layout.


## Primo rilascio verificato

| Dato | Valore |
| --- | --- |
| Commit applicativo attivo | `180caeb2ef7a1ce817f3fc3adbdaee4a00afd647` (include il fix vocale `64cf566`) |
| Release | `20261123172257900-6344de` |
| Immagine Onboarding | `sha256:edd6c57fa55777760a825fd9ca52ca0bb7581ca04a7f4617b21edaef1149957f` |
| WorkingDirectory | `/app/conclavia-onboarding-avatar` (verificata prima dell’attivazione) |
| Release precedente conservata | `20261111183115722-40a8e0` |
| Archivio trasportato SHA-256 | `77b565ea5793270bc019ac3a85e4e9da805b3bf4dc6fcc0fd2bbd7263db4e840` |

Rilascio limitato al solo Onboarding, adattando l’helper già usato per gli aggiornamenti del solo Meeting e riusando `remote.py`: verifica checksum/immagine, entrambi i lock (canonico e legacy), guardie Mongo in sola lettura, controllo Compose/Caddy, health HTTPS e ripristino automatico del solo servizio precedente in caso di errore. Gli ambienti sono stati copiati dalla release attiva sul VPS e confrontati per hash; nessun env di sviluppo o credenziale è stato trasferito dal Mac.

Meeting, gateway e sito conservano ID, immagine e istante di avvio originali. Anche gli hash degli ambienti sono invariati. Unmatt, Daily e pubblicazioni non sono stati modificati o riavviati. Il precedente rilascio rimane disponibile per il ripristino.

Controlli del deployer: 69 Node, 66 Python e test Caddy nativo superati. Dopo l’attivazione: container Onboarding healthy; entrambi gli health HTTPS positivi; API gestionali anonime `401` con Basic auth. `onboarding-voice status` riconferma release/immagine nuove e flag/chiavi presenti, senza verificarne il credito.

Chrome sul dominio reale `https://onboarding.conclavia.me`: desktop 1440×900 e mobile 390×844 superati, incluse apertura delle opzioni, domanda e comandi visibili, nessun overflow orizzontale o errore JavaScript. Avatar misurato a 580 px su desktop e 351 px su mobile. Le API di sessione e l’audio sono simulati nel browser: nessuna sessione cliente creata, nessuna chiamata ai provider. Il credito Inworld non è stato ricaricato e la voce reale non è certificata da questi controlli.

Bundle e ricevuta sul VPS: `/opt/conclavia/releases/20261123172257900-6344de/` e `onboarding-only-receipt.json`. Copia locale degli script, manifesti, checksum e ricevuta in `/private/tmp/onboarding-layout-20261123/`. Questi percorsi non contengono materiale da pubblicare in Git; il repository conserva soltanto questo resoconto senza segreti.


## Correzione del layout durante la scrittura

La successiva schermata dell’utente mostrava il fallback testuale: il primo rilascio applicava la griglia ampia alla sola modalità vocale. Quando Inworld falliva e il client passava alla scrittura, l’avatar tornava a 96 px su desktop e il questionario occupava una colonna verticale.

Il layout condiviso ora si applica a tutti i passaggi in corso, sia a voce sia scrivendo, compresi accesso manuale e ripresa. Su desktop l’avatar mantiene la stessa dimensione dopo l’errore, con domanda e risposte affiancate. Le quattro scelte dello screenshot stanno in due colonne; titolo, descrizione e avviso hanno proporzioni compatte. Il messaggio dell’assistente sotto le opzioni mostra soltanto il testo aggiuntivo, senza ripetere la domanda già visibile. L’avviso IT/EN è più breve e continua a spiegare che il microfono è stato fermato.

Il caso di regressione della riproduzione fallita controlla anche che l’avatar desktop mantenga la dimensione e resti accanto al questionario. Collaudi visivi con quattro opzioni e descrizione, in italiano/inglese, su desktop 1304×728 (caso dello screenshot), 1440×900, 1280×720 e telefoni 390×844/375×667, più avvio scritto manuale e ripresa. Screenshot e artefatti in `/private/tmp/onboarding-text-layout-20261123/`.

Immagine candidata con lo stesso kit di produzione: `conclavia-onboarding:text-layout-20261123`, digest `sha256:d54e725666a643c679c574b98d97cad38fdbf2ea7b7358f9939d3f848076a0ef`. Build, 82 unit test, lint e TypeScript passati; sull’immagine definitiva passano tutte le 15 regressioni vocali (compresa la dimensione dell’avatar dopo il guasto) e i sette scenari visivi/scritti. Rilascio completato dopo la conferma dell’utente di aver interrotto il nuovo percorso e il superamento delle guardie remote. Il credito Inworld e i dati dei questionari rimangono invariati.


### Rilascio della correzione del layout scritto

- Commit applicativo attivo: `e68e6e607431cf43e5764b21624534b61e9d4614`.
- Release: `20261123180752245-7f1530`; immagine Onboarding `sha256:d54e725666a643c679c574b98d97cad38fdbf2ea7b7358f9939d3f848076a0ef`.
- Release precedente conservata: `20261123172257900-6344de`; ripristino automatico del solo Onboarding predisposto con lo stesso helper del primo rilascio.
- WorkingDirectory riconfermata prima dell’attivazione: `/app/conclavia-onboarding-avatar`. Checksum dell’archivio trasportato: `d567f2c84171c5a89b9a4581e1ded07adf87abf7374cd0a58b60f499d4b2e511`.

Onboarding healthy, health HTTPS e protezioni delle API gestionali verificati. ID, immagine e avvio di Meeting, gateway e sito invariati; hash degli ambienti preservati. Nessuna modifica a Unmatt, Daily, provider o dati dei questionari. Lo stesso kit avatar rimane incorporato nell’immagine.

Verifica Chrome sulla produzione superata per tre scenari: dimensioni della schermata dell’utente con audio fallito e quattro opzioni, telefono 390×844 con audio fallito, avvio scritto manuale desktop. Nessun overflow orizzontale o errore JavaScript; scelta «Stabile», conferma e avanzamento verificati su sessioni simulate. Avatar misurato a 495 px nel viewport 1304×728, 280 px su telefono e 580 px nel percorso scritto manuale 1440×900. Nessuna chiamata ai provider o scrittura di dati reali nel collaudo.

Ricevuta remota: `/opt/conclavia/releases/20261123180752245-7f1530/onboarding-only-receipt.json`. Artefatti locali, manifesti, helper e screenshot verificati: `/private/tmp/onboarding-text-layout-20261123/`. La presenza delle chiavi/flag è riconfermata dal tool vocale; la verifica del layout non attesta il ripristino del credito o dell’audio Inworld.
