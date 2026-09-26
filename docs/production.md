# Conclavia verso la produzione — aggiornamento 26 settembre 2026

## Ambito e proposta

Prima un ambiente di collaudo HTTPS, poi un pilot Onboarding con Umatt. Meeting viene pubblicato come workspace privato dopo aver configurato gli accessi degli operatori e verificato il bot sul dominio definitivo. Il kit è incorporato nelle immagini delle due app e non richiede un server.

La revisione riguarda i cinque repository Conclavia in `/Users/vins/work`: Meeting, Onboarding, Avatar Kit, Web e Deploy. `aihat-client` e `aihat-server` sono esclusi da letture, modifiche e suite di integrazione. GiviLoop è uno strumento di sviluppo separato, non un servizio da distribuire con Conclavia. Non esiste un checkout chiamato Umatt in questa directory; la documentazione precedente usa anche Unmatt. Identità del sito e origine HTTPS vanno confermate prima di registrarlo in produzione.

Il dominio acquistato e confermato è **conclavia.me**. L'utente ha scelto di iniziare con il piano **vc2-1c-2gb: 1 vCPU, 2 GB RAM, 55 GB SSD, 2 TB/mese di traffico**, per **Meeting e Onboarding sullo stesso VPS**, con eventuale upgrade dopo il collaudo. Il prezzo mostrato nello screenshot è $10/mese; il VPS è stato acquistato e risponde su **64.177.50.65**, con Ubuntu 26.04.1 LTS e architettura x86-64. Accesso SSH a chiave e bootstrap Docker verificati; regione da confermare. DNS configurati; Mongo raggiunto dal VPS tramite tunnel persistente verso il server Unmatt. Restano da confermare origine HTTPS di Umatt e accettazione del pilot vocale. Meeting e Onboarding sono ora attivi in HTTPS per collaudo, con AI e bot reali disattivati; la vetrina bilingue è pubblicata su `conclavia.me`, mentre lo staging separato rimane una proposta.

| Destinazione proposta | Ruolo | Esposizione |
| --- | --- | --- |
| `conclavia.me` / `www.conclavia.me` | Presentazione dei servizi in italiano e inglese | Pubblicato: Nginx interno, HTTPS Caddy; www reindirizza al dominio principale |
| `onboarding.conclavia.me` | Sessioni cliente, API e studio | HTTPS; chiave sito/capability sulle API, login amministratore sullo studio |
| `meeting.conclavia.me` | Workspace Meeting | SSO/proxy autenticato per operatori; eccezioni esplicite per renderer e callback bot |
| `onboarding-staging.conclavia.me`, `meeting-staging.conclavia.me` | Collaudo prima del rilascio | Nomi proposti; dati sintetici, credenziali e database distinti |

Un server/container sempre attivo è il punto di partenza proposto: Meeting avvia monitor in processo e deve riconciliare ingressi/uscite anche senza un browser aperto. Prima release con **una replica Meeting**. Dimensionare durante il pilot; questa revisione non acquista servizi né crea infrastruttura cloud. Per Onboarding è aggiunto un esempio Compose dietro reverse proxy sul server host, coerente con la [guida Next.js al self-hosting](https://nextjs.org/docs/app/guides/self-hosting). Compose/Caddy sono una base per un VPS Linux; l'immagine resta utilizzabile anche su una piattaforma container gestita.

L'audio WebRTC del cliente va al provider di trascrizione; interpretazione e TTS passano dalle API Conclavia. Il percorso cliente attuale non usa la webcam. Un successo HTTP non dimostra qualità del microfono, latenza o comprensione delle risposte.

### Dominio e DNS

Verifica pubblica del 25 settembre 2026, in sola lettura tramite `dig`:

| Nome | Stato rilevato |
| --- | --- |
| `conclavia.me` | NS `ns11.domaincontrol.com` e `ns12.domaincontrol.com`; record A `3.33.130.190` e `15.197.148.33` |
| `www.conclavia.me` | CNAME verso `conclavia.me` |
| `onboarding.conclavia.me` | NXDOMAIN, confermato interrogando entrambi i nameserver autoritativi |
| `meeting.conclavia.me` | NXDOMAIN, confermato interrogando entrambi i nameserver autoritativi |

La tabella conserva il rilievo iniziale, precedente al deploy: non descrive i DNS attuali. I record sono stati configurati dall'utente durante il task di deploy; nessuna modifica al registrar è stata eseguita dai tool. Aggiungere record A `onboarding` e `meeting` verso **64.177.50.65**, senza AAAA finché IPv6 non è configurato. I quattro nomi pubblici ora risolvono su 64.177.50.65 nella verifica successiva al setup. Su una piattaforma gestita usare invece i record richiesti dal suo ingresso. I nomi staging proposti non sono stati verificati né creati.

Configurazione prevista **solo nell'ambiente remoto**:

```dotenv
# Servizio Onboarding
ONBOARDING_BASE_URL=https://onboarding.conclavia.me
# Servizio Meeting, dopo la configurazione delle policy del gateway
CONCLAVIA_PUBLIC_URL=https://meeting.conclavia.me
```

Gli ambienti locali mantengono i rispettivi URL di sviluppo. L'origine HTTPS di Umatt va autorizzata esattamente nel suo sito dello studio Conclavia; non coincide automaticamente con `conclavia.me` e non è ancora nota.

### Server iniziale concordato

**1 vCPU / 2 GB RAM / 55 GB SSD per entrambi i servizi**, secondo la scelta dell'utente. Usare Linux con una versione Ubuntu LTS supportata dal provider e un IP pubblico stabile. Il rendering avatar avviene nel browser (o browser del bot); i modelli AI e TTS sono servizi esterni, quindi l'architettura attuale non richiede una GPU sul VPS.

Impostazione del primo pilot:

- Una replica Meeting e una replica Onboarding, con un solo reverse proxy HTTPS.
- Mongo rimane nell'installazione esistente; scegliere possibilmente una regione vicina al database, la cui posizione resta da confermare.
- Build Docker sul Mac o in CI, per l'architettura del VPS. Sul server distribuire solo immagini già costruite; niente `next dev`, compilazioni o suite di test.
- Collaudo prima con ciascun servizio, poi con Meeting attivo e conversazioni Onboarding contemporanee. Non tenere un secondo ambiente staging sempre acceso sullo stesso VPS da 2 GB.
- Misurare RAM disponibile, memoria dei container, CPU, latenza HTTP, errori, tempi dei turni vocali e riavvii. Conservare metriche aggregate senza trascrizioni o capability.

Non abbiamo ancora misurato il carico su questa taglia: la scelta autorizza il pilot con entrambi, senza fissare un numero garantito di clienti simultanei. Valutare un upgrade a **2 vCPU / 4 GB** se compaiono terminazioni per memoria, saturazione persistente o degradazione riproducibile dei tempi durante l'uso combinato. Se la latenza dipende da rete o provider esterni, correggere quella causa prima di attribuirla al VPS. Il ridimensionamento va pianificato secondo la procedura del provider e può richiedere una finestra di manutenzione.

Il prezzo di riferimento $10/mese proviene dallo screenshot fornito, non da un preventivo comprensivo di eventuali imposte o extra. AI, voce, bot ed eventuali backup esterni hanno costi separati. Un singolo VPS non offre ridondanza applicativa: backup, allarmi e ripristino restano task di rilascio. Aggiornamenti del sistema operativo e manutenzione dei container saranno a carico nostro.

## Valutazione dei repository

| Componente | Stato osservato | Lavoro prima dell'uso reale |
| --- | --- | --- |
| Avatar Kit | Sorgente comune verificato nei consumer; manifesto dei tre commit già disponibile | Bloccare commit della release e conservare manifesto/immagini/digest; verificare avatar sui dispositivi target |
| Onboarding | Isolamento sito/cliente, snapshot, TTL, consenso, vincoli e ritorno autenticato; modifiche vocali locali già presenti prima della revisione | Revisionare e committare anche quelle modifiche; collaudo reale e procedure amministrative |
| Distribuzione Onboarding | Aggiunti standalone, Dockerfile non-root, Compose, controllo offline all'avvio e readiness Mongo | Build Linux e avvio su VPS verificati; restano media reali e carico |
| Meeting | Docker standalone presente; scheduler e bot; workspace singolo | Autenticazione pagine **e API** sul dominio proprio, callback/renderer, ingresso/uscita e riavvio |
| Mongo esistente | Connessione configurabile; Onboarding usa solo `onboarding_*` | Rete stabile dal server, autorizzazioni per servizio, backup e ripristino provato |
| Umatt | Contratto HTTP/redirect documentato lato Conclavia | Confermare origine e collaudare con il sito; nessuna modifica AIHat in questa revisione |

### Accessi Meeting: requisito bloccante

`conclavia-meeting-avatar/src/proxy.ts` limita il traffico pubblico solo per `*.trycloudflare.com`. Un dominio personalizzato non eredita la restrizione. Non esiste un'autenticazione utenti propria: non basta puntare il DNS all'immagine esistente.

Il gateway deve autenticare tutte le pagine e API gestionali, comprese `/api/meetings/*`, `/api/avatar/*`, `/api/context` e `/api/meeting-series/*`. Le sole eccezioni pubbliche da verificare sono `/meeting-room/*`, `/api/meeting-room/*`, `/api/webhooks/attendee`, `/api/health`, gli asset Next necessari e i GLB consentiti. Le route bot conservano i propri controlli di capability e firma/token callback. Non esporre Recall se non usato. Negare il resto per default; provare anche l'accesso diretto all'IP/porta applicativa.

Il bot non può completare un login interattivo davanti al renderer o alle callback. Il Caddyfile Onboarding **non è una configurazione valida per Meeting**. Il progetto fratello **conclavia-deploy** implementa questa policy in Caddy: prova locale con Caddy reale e controllo HTTPS sul VPS passati, inclusa la risposta 401 sulle API gestionali senza autenticazione. Resta aperta anche l'accettazione del riconoscimento vocale Teams descritta in `docs/caption-recognition-2026-09-13.md` nel repository Meeting.

### Accessi e limiti Onboarding

Lo studio dispone di login con cookie firmato e limitazione dei tentativi. Per il pilot è un accesso amministrativo condiviso, non un sistema con ruoli, audit individuale e SSO. Limitare gli operatori; prima del self-service per più organizzazioni servono gestione utenti, rotazione/revoca chiavi sito e audit amministrativo. Le chiavi sito restano server-only; le risposte non viaggiano nel redirect.

Quote attuali: 100 nuove sessioni/ora/sito, 300 turni, 450 richieste TTS e 8 connessioni audio/sessione. Non sono un tetto di spesa globale: definire limiti/allarmi anche nei provider. Concordare con Umatt i picchi attesi e provare il carico sintetico prima di aumentare le quote.

## Tool di deploy coordinato

Il progetto `/Users/vins/work/conclavia-deploy` prepara immagini per entrambe le app dallo stesso snapshot del kit, trasferisce bundle verificati e ambiente privato via SSH, controlla Mongo, bot attivi e sessioni Onboarding incomplete, attiva la release e prova HTTPS/autenticazione. Se il rilascio fallisce tenta il ripristino della release precedente. Consultare il suo README per setup, DNS, configurazione, manutenzione e rollback. Non esegue seed e non modifica AIHat.

Sul VPS il sistema vede circa 1637 MiB di RAM: limiti iniziali di 512 MiB per app e 96 MiB per Caddy. Le build avvengono fuori dal VPS. Release `20260926200232371-7dd045` attiva per entrambi i servizi, con container healthy, DNS e certificati HTTPS verificati. Il tunnel persistente raggiunge Mongo su Unmatt tramite la sola rete Docker privata. AI e bot reali restano disattivati per questo collaudo; il manifesto della release del 26 settembre registra commit puliti per le due app e il kit.

## Deploy Onboarding preparato

File: [Dockerfile](../Dockerfile), [Compose](../deploy/compose.yaml), [Caddy](../deploy/Caddyfile.example), [preflight](../scripts/production-config.mjs).

Prerequisiti: kit privato accessibile, checkout fratelli, Docker BuildKit e Compose **2.30+**. Il kit arriva come [contesto aggiuntivo](https://docs.docker.com/reference/compose-file/build/), senza credenziali Git nell'immagine. `env_file.format: raw` conserva valori letterali, compresi `$`, secondo la [specifica Compose](https://docs.docker.com/reference/compose-file/services/#env_file).

Creare fuori dal checkout un file privato, ad esempio `/etc/conclavia/onboarding.env`, con permessi limitati. Formato `NOME=valore`, **senza virgolette** intorno ai valori e senza interpolazione. Non copiare `.env.local` automaticamente: il tunnel Mongo del portatile non esiste nel container e le credenziali locali non sono una configurazione di produzione.

Impostare:

- `ONBOARDING_BASE_URL`: origine HTTPS definitiva, senza percorso/query.
- `MONGODB_URI` e `MONGODB_DB_NAME`: connessione e nome esplicito del database esistente; host raggiungibile dalla rete del container.
- `ONBOARDING_ADMIN_TOKEN` e `ONBOARDING_SESSION_SECRET`: due credenziali casuali distinte, almeno 32 caratteri; non riutilizzare quelle di sviluppo.
- `ONBOARDING_AI_ENABLED`: `true` per il pilot vocale; `false` per collaudo senza AI.
- `OPENAI_API_KEY` e `INWORLD_API_KEY` per il pilot vocale; modello/voce seguono [.env.example](../.env.example).

Il preflight legge solo l'ambiente iniettato e stampa nomi di variabili/regole, senza valori. Non contatta Mongo o provider. Il container lo esegue prima di avviare il server: un errore ferma l'avvio. Un `next start` esterno al container non lo esegue automaticamente: usare `npm run check:production` con le variabili già iniettate.

Dalla directory Onboarding, **sulla macchina di build o in CI**, costruire l'immagine per l'architettura del VPS (esempio x86-64), quindi trasferire l'archivio al server:

```sh
docker buildx build --platform linux/amd64 --load \
  --build-context avatar-kit=../conclavia-avatar-kit \
  -t conclavia-onboarding:release-identificata .
docker image save -o /tmp/conclavia-onboarding.tar conclavia-onboarding:release-identificata
```

Sul VPS, dalla directory Onboarding, con l'archivio già trasferito in `/tmp`:

```sh
export ONBOARDING_ENV_FILE=/etc/conclavia/onboarding.env
export CONCLAVIA_ONBOARDING_IMAGE=conclavia-onboarding:release-identificata
docker compose -f deploy/compose.yaml config --quiet
docker image load -i /tmp/conclavia-onboarding.tar
docker compose -f deploy/compose.yaml up -d --no-build --pull never --wait onboarding
curl --fail http://127.0.0.1:3002/api/health
```

Usare `config --quiet`: l'output completo potrebbe stampare l'ambiente risolto. La build usa un elenco esplicito di file consentiti; ambiente locale, registrazioni, `.git` e fixture non entrano nel contesto dell'app. Il server non gira come root e la porta è pubblicata solo su `127.0.0.1`. Il Compose non crea Mongo e non esegue seed/migrazioni. Questo Compose avvia solo Onboarding. Per il rilascio coordinato usare il progetto fratello **conclavia-deploy**, che genera Compose e Caddy per entrambi e include controllo degli accessi, stato e rollback. Anche l'immagine Meeting va costruita fuori dal VPS.

`GET /api/health` esegue un ping Mongo e restituisce solo `{"status":"ok"}` oppure `503 {"status":"unavailable"}`, senza dati/credenziali e senza creare indici o record. Non verifica provider o tutti i permessi sulle collezioni: una sessione sintetica deve verificare il percorso applicativo. Compose non riavvia automaticamente un processo vivo solo perché unhealthy; configurare un allarme.

Il reverse proxy dell'esempio gira sullo stesso host. Configurare DNS/firewall per `onboarding.conclavia.me` prima dell'abilitazione. Caddy gestisce [HTTPS automatico](https://caddyserver.com/docs/automatic-https); `flush_interval -1` nel [reverse proxy](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy) inoltra subito i chunk TTS. Il limite del corpo richiesta è compatibile con i limiti API. Non attivare access log integrali delle URL; usare metriche per route, status e durata. Eventuali CDN/load balancer aggiuntivi richiedono una nuova prova di streaming/cache.

Lo studio conserva il proprio login. L'esempio non configura SSO, filtro IP o protezione DDoS dedicata. Prima dell'apertura pubblica della piattaforma completa configurare il gateway scelto e verificarne le policy.

## Mongo, backup e continuità

Riutilizzare l'installazione Mongo esistente. La produzione deve raggiungerla tramite connessione stabile privata/TLS o tunnel gestito sul server, indipendente dal Mac. Nessuna porta Mongo pubblica viene aggiunta. `127.0.0.1:27017` nel container non indica il Mongo del portatile.

Staging usa un database separato con dati sintetici e permessi distinti. Onboarding usa le collezioni con prefisso `onboarding_`, comprese quelle di audit aggiunte successivamente: verificare che il suo utente possa operare lì senza scrivere nelle collezioni Meeting/AIHat. Coordinare i backup con il responsabile Mongo, senza modificare dati o permessi AIHat in questa attività.

Sessioni Onboarding: scadenza 7 giorni; capability browser: 2 ore, rinnovabile dal sito. La TTL non definisce durata dei backup o conservazione dei provider. Prima dei clienti reali definire informativa, conservazione, responsabilità e cancellazione con il titolare del servizio. Restano da documentare retention e cancellazione delle memorie Meeting.

Conservare una release precedente con digest immagine e manifesto dei tre repository. Il rollback usa quell'immagine e configurazione compatibile, senza seed o ripristino Mongo automatico. Drenare le conversazioni durante il rilascio; attendere l'uscita confermata dei bot Meeting prima di interventi che li interrompano. Provare il ripristino backup su database isolato e annotare il tempo di recupero prima del go-live.

## Task e criteri di uscita

| Ordine | Task | Risultato richiesto | Stato |
| --- | --- | --- | --- |
| 1 | Dominio, hosting e Umatt | Dominio, accesso DNS, piattaforma/regione, origine sito e operatori | `conclavia.me`, VPS 64.177.50.65, SSH a chiave, Docker, DNS e tunnel Mongo confermati; regione e origine Umatt da completare |
| 2 | Packaging e provenienza kit | Standalone, container non-root, configurazione runtime, manifesto tre commit | Build Linux delle due app e import delle immagini sul VPS verificati |
| 3 | Staging HTTPS | DNS/TLS, rete Mongo, accesso studio, allarmi | Primo collaudo HTTPS attivo sui domini definitivi; allarmi e staging separato da completare |
| 4 | Protezione Meeting | Autenticazione pagine/API e sole eccezioni bot, prova di accesso anonimo negato | Caddy testato in locale; API gestionali anonime respinte anche in HTTPS sul VPS |
| 5 | Dati e operazioni | Backup/ripristino provato, retention, credenziali e limiti di spesa | Da completare |
| 6 | Collegamento Umatt | Sito/chiave dedicati, origini esatte, sessione/ritorno/ripresa autenticati | Contratto pronto; collaudo da concordare, AIHat escluso |
| 7 | Collaudo media | Microfono IT/EN, interruzione, correzioni/importi, rete debole, desktop/iOS/Android | Da eseguire sui dispositivi reali |
| 8 | Collaudo Meeting | Ingresso/uscita, callback, renderer, audio/trascrizione Teams e riavvio | Da eseguire con riunione dedicata |
| 9 | Pilot | Commit revisionati, immagini immutabili, manifesti, rollback e monitoraggio | Release di collaudo attiva; AI/bot reali disattivati, pilot vocale ancora da accettare |
| 10 | Altri clienti | Ruoli, audit, rotazione chiavi, amministrazione tenant, quote/fatturazione | Successivo al pilot; Meeting oggi è workspace singolo |

## Verifiche della revisione iniziale e successivo deploy

| Controllo | Risultato |
| --- | --- |
| Unitari Onboarding, incluse le modifiche vocali già presenti e 5 casi preflight | **50 passati** |
| Browser Onboarding: conversazione, isolamento, correzioni, voce simulata, iframe e readiness | **20 passati** |
| Avatar Kit: catalogo e consegna asset | **4 passati** |
| `check:avatar-kit` | Stesso sorgente fisico nei due consumer; SHA-256 `81b47af8fbd288d5ff000031a7aa8ba93f5d80e1df38a0a7b975ea8aeb1409f8` |
| Lint, TypeScript e build Onboarding | Passati; build isolata in `.next-build-production`, server locale 3002 preservato |
| Standalone avviato da directory temporanea, senza `.env` locali | Configurazione errata respinta; readiness 200 con Mongo temporaneo; JavaScript e GLB esatti disponibili; asset sconosciuti 404; Mongo irraggiungibile restituisce 503 senza dettagli |
| `npm audit --omit=dev` sui tre Conclavia | Nessuna vulnerabilità segnalata nei lockfile correnti alla data della verifica; non è un audit completo di sicurezza |
| Docker/Compose/Caddy | Successivamente installati e verificati: build Linux di entrambe le app, Caddy reale, container healthy sul VPS, HTTPS e protezione delle API |

Ripetere la verifica standalone dopo una build isolata, con Mongo temporaneo già in ascolto su 27018:

```sh
env NEXT_DIST_DIR=.next-build-production NEXT_TELEMETRY_DISABLED=1 \
  MONGODB_URI=mongodb://127.0.0.1:27018 MONGODB_DB_NAME=onboarding_test_production_build \
  ONBOARDING_AI_ENABLED=false OPENAI_API_KEY= INWORLD_API_KEY= npm run build
npm run test:standalone
```

Il comando standalone usa porte temporanee, ambiente sintetico, copia temporanea della build e controllo byte-per-byte dei GLB. Non crea sessioni né chiama provider; rimuove la copia e termina solo i propri processi. Se si usa la build standard, passare `npm run test:standalone -- .next`. Le prove non certificano audio reale, carico, HTTPS, backup o protezione del gateway Meeting.

Nella revisione iniziale non furono modificati DNS, server remoti, configurazioni locali private, Mongo applicativo o repository AIHat. Nel successivo task di deploy è stato configurato il VPS: SSH a chiave, Docker, regole firewall mirate, tunnel Mongo e applicazioni in modalità collaudo. Nessun seed, modifica di record cliente o intervento nei repository/servizi AIHat. I test del servizio usano solo Mongo temporaneo su 27018 e provider simulati; escluse le suite `test:aihat` e `test:handoff`. La successiva revisione del 26 settembre aggiunge il volto fotografico condiviso anche a Meeting/kit e il pannello Integrazione: vedere `verification-2026-09-26.md` e i manifesti del tool di deploy per lo stato del rilascio.

### Verifiche aggiuntive del tool di deploy

Conclavia-deploy: 6 test Node, 19 test Python e una suite con Caddy reale passati. Build Linux amd64 di entrambe le app, esportazione/importazione delle immagini e identità delle immagini verificate. Sul VPS: HTTPS e health Mongo 200, gestione anonima 401, redirect HTTP verso HTTPS, tunnel persistente attivo; porte pubbliche 27017/3000/3002 chiuse. La chiave dedicata del tunnel rifiuta shell e inoltri verso altre porte. Nessun provider a pagamento chiamato. Il rollback dopo errore è verificato in simulazione; non è stato provocato un guasto della release pubblicata.
