# Conclavia Onboarding Avatar

Servizio indipendente per raccogliere risposte strutturate attraverso un avatar, una domanda alla volta. Il sito cliente mantiene autenticazione, regole di business e conferma delle proprie operazioni. Prima integrazione: i questionari profilo investitore e portafoglio di AIHat.

## Verso la produzione

[Piano di rilascio Conclavia/Umatt](docs/production.md): dominio **conclavia.me**, Onboarding pubblico su `onboarding.conclavia.me` e Meeting privato su `meeting.conclavia.me`, Mongo esistente, backup, collaudi e task. Onboarding dispone di build standalone, Dockerfile non-root, esempio Compose con porta locale e controllo della configurazione all'avvio. `/api/health` verifica Mongo senza esporre dati. Il VPS è disponibile su **64.177.50.65**, con accesso SSH a chiave e Docker installato. I due DNS e il tunnel Mongo persistente verso Unmatt sono configurati; Meeting e Onboarding sono attivi in HTTPS in modalità collaudo, con AI e bot reali disattivati. Release: `20260925194514674-b664d1`.

Il pilot concordato usa **un VPS da 1 vCPU e 2 GB RAM per Meeting e Onboarding insieme**, Mongo esterno e immagini costruite sul Mac o in CI. Il collaudo combinato e il monitoraggio determineranno l'eventuale upgrade. Il progetto fratello **conclavia-deploy** automatizza build e rilascio coordinato, gateway autenticato, verifiche e rollback. La guida operativa è in [conclavia-deploy](https://github.com/vgflutter/conclavia-deploy/blob/main/README.md); il Compose interno rimane un esempio per il solo Onboarding.

## Avvio locale

Richiede Node **22.21.1+**, il repository fratello `../conclavia-avatar-kit` e una connessione Mongo configurata. Nella macchina di sviluppo si riusa il Mongo esistente, raggiunto dal tunnel SSH `mongo-tunnel` sulla porta 27017. Il kit è privato: serve un account GitHub autorizzato. Meeting non deve essere in esecuzione per usare Onboarding.

Per una nuova installazione, clonare nella stessa directory e poi entrare in Onboarding:

```sh
git clone https://github.com/vgflutter/conclavia-avatar-kit.git
git clone https://github.com/vgflutter/conclavia-onboarding-avatar.git
cd conclavia-onboarding-avatar
```

Il checkout fratello `conclavia-meeting-avatar` serve se si vuole riutilizzarne la configurazione locale o verificare entrambi i consumer del kit; non è una dipendenza runtime del servizio.

Per aggiornare checkout esistenti seguire le [istruzioni coordinate del kit](https://github.com/vgflutter/conclavia-avatar-kit#aggiornamento-coordinato), senza sostituire i file `.env.local`.

Se Meeting è già configurato, `setup:local` ne riusa Mongo e provider. Su una macchina nuova, creare prima `.env.local` da `.env.example` **solo se assente** e impostare la connessione Mongo esistente e i provider: il setup genera poi le credenziali locali dello studio. Il servizio può funzionare anche senza un’installazione Meeting configurata.

```sh
npm --prefix ../conclavia-avatar-kit ci
npm ci
npm run setup:local
npm run seed
npm run dev
```

- Studio: <http://localhost:3002/studio>
- Accesso: `.local/studio-access.txt`, privato e ignorato da Git.
- `setup:local` importa solo le variabili Mongo/OpenAI/Inworld necessarie da Meeting, senza modificarne il file. Conserva la configurazione locale già presente.
- `seed` crea i siti `demo` e `aihat` solo se assenti; importa l’aspetto iniziale di Meeting in sola lettura. Le credenziali sito sono salvate una volta in `.local/*-integration.env`.
- Nel sito demo, scheda **Percorsi → Prova percorso**, si può provare l’onboarding senza account AIHat. Salvare prima le modifiche allo studio.

Per collegare Unmatt/AIHat configurare nel suo BFF le tre variabili `CONCLAVIA_ONBOARDING_URL`, `CONCLAVIA_ONBOARDING_API_KEY`, `CONCLAVIA_ONBOARDING_ENABLED`. Il pulsante **Inizia con l’avatar** apre la pagina del servizio. Il backend AIHat deve essere raggiungibile attraverso il suo `API_BASE_URL`; nello sviluppo corrente Meeting usa 3000, AIHat client 3001 e Onboarding 3002. Il setup e il seed non scrivono automaticamente nel file ambiente di AIHat.

Nello studio Conclavia, scegliere il sito `aihat`, verificare il nome mostrato al cliente e aggiungere l'origine esatta del frontend alle **Origini autorizzate**. `NEXTAUTH_URL` nel BFF deve coincidere con quell'origine. La chiave sito si copia dal file privato `.local/aihat-integration.env` generato al primo seed, oppure si conserva alla creazione del sito nello studio; non si inserisce nel codice client né in variabili `NEXT_PUBLIC_`. Il pulsante di integrazione non richiede account Conclavia al cliente finale: la sua identità è verificata dal BFF Unmatt.

Unmatt integra solo API HTTP e redirect: non installa il kit né importa codice Conclavia. Per un servizio remoto cambiano gli indirizzi e le origini autorizzate, non questa separazione. Il servizio e il frontend devono usare HTTPS fuori da localhost. [Contratto di integrazione](docs/integration.md).

## Cosa è implementato

- Studio con siti, avatar, voci, contesto, origini consentite e percorsi JSON versionati.
- Quattro renderer condivisi: editoriale 2D, ritratto 2.5D, personaggio 3D e host fotografico beta. Cinque identità e nove combinazioni supportate: i due nuovi ritratti fotografici Studio sono disponibili nel 2.5D; il catalogo e il server impediscono combinazioni prive di asset. Labiale e audio in streaming tramite Inworld.
- Microfono WebRTC con turni automatici e interruzione della voce dell’avatar; trascrizione OpenAI, estrazione delle risposte con schema strutturato e validazione server. Campi e testo disponibili anche senza microfono.
- Percorso vocale con domanda visibile, sottotitoli testuali, stati di ascolto/risposta, pausa, passaggio alla scrittura e riepilogo modificabile. La webcam non fa parte del percorso cliente.
- Il microfono si attiva dopo il consenso e un'azione esplicita del cliente; il browser può chiedere il relativo permesso. Importi e campi marcati `confirmSpoken` richiedono conferma quando interpretati dalla conversazione.
- Domande condizionali, correzioni, campi facoltativi, riepilogo, conferma esplicita, ripresa autorizzata e isolamento tra siti/clienti.
- AIHat riceve una bozza nei propri riepiloghi: conserva scoring, salvataggio, generazione e conferma specifica del portafoglio interamente azionario.

Lo studio è in italiano. I controlli del percorso cliente sono disponibili in italiano e inglese secondo `flow.locale`; domande, opzioni e contenuti del percorso devono essere forniti nella stessa lingua dal sito che lo integra. L'adattatore Unmatt attuale pubblica questionari italiani: cambiare lingua nell'host non traduce automaticamente il questionario esterno.

Una sessione attiva conserva lo schema originale. Se il questionario pubblicato dall'host cambia, l'adattatore può richiedere di ripartire anziché applicare risposte a uno schema diverso. Il riepilogo confermato su Conclavia resta una bozza per il sito: non salva automaticamente il profilo investitore e non genera un portafoglio.

## Avatar: un solo sorgente

La [review del 21 settembre](https://github.com/vgflutter/conclavia-avatar-kit/blob/main/docs/reviews/2026-09-21-production.md) documenta dieci cicli per famiglia e i limiti residui. Include nuovi ritratti fotografici, labiale/palpebre/dita rivisti e recupero dei renderer dopo errori. La variante ceramica 3D non ha superato la review e resta esclusa dalla selezione. Next è aggiornato a 16.3.5; i GLB condivisi usano ETag/304.

Il progetto [conclavia-avatar-kit](https://github.com/vgflutter/conclavia-avatar-kit/blob/main/README.md) contiene componenti, animazioni, modelli, ritratti, catalogo voci e player. Meeting e Onboarding lo importano tramite `@conclavia/avatar-kit`; i precedenti percorsi negli applicativi sono piccoli re-export di compatibilità. Una modifica al kit viene usata da entrambi i dev server. Sono incluse anche le ultime correzioni di Meeting alle spalle e al gomito del 2D. Con entrambi i consumer installati, `npm run check:avatar-kit` verifica il collegamento effettivo e l’assenza di copie locali.

La scelta dell’avatar e del contesto rimane specifica di ciascun sito/applicazione. Le sessioni già iniziate conservano lo snapshot di tali impostazioni. Il codice e gli asset vengono invece aggiornati con il rilascio del pacchetto: per rilasci indipendenti occorre pubblicare e fissare una versione privata del kit.

## Verifiche

```sh
npm test
npm run lint
npm run typecheck
npm run build
npm run test:e2e
# Con i repository AIHat presenti:
npm run test:aihat
npm run test:handoff
```

Verifica del 21 settembre: **12 test unitari e 5 flussi browser passati**, inclusi i due ritratti Studio e la rivalidazione GLB 304; lint, TypeScript e build Next 16.3.5 passati. Il nuovo selettore della select è stato corretto prima del rerun completo. [Risultati del kit e limiti](https://github.com/vgflutter/conclavia-meeting-avatar/blob/main/docs/avatar-kit-review-2026-09-21.md).

I test browser del servizio usano la porta **3103** e `.next-e2e`, separati dal normale dev server 3002. La prova AIHat aggiunge il frontend 3114 e un backend sintetico 3115. Non eseguire le due suite browser Onboarding contemporaneamente.

Se il frontend AIHat normale è già in esecuzione, impostare `ONBOARDING_TEST_HOST_DIR` su una copia di lavoro isolata e installata del client: la suite handoff userà quella directory, evitando di condividere `.next` e il lock del dev server con la sessione locale dell'utente.

I test browser richiedono un Mongo temporaneo locale sulla porta **27018**, separato dal tunnel applicativo, e Chrome. Creano e rimuovono solo database con prefisso `onboarding_test_`. Provider disabilitati, credenziali sintetiche, nessun cliente reale. La qualità della conversazione con microfono e provider reali va verificata separatamente.

I sottotitoli presentano la domanda, la frase dell'assistente e la trascrizione in arrivo; non sono evidenziati parola per parola in sincronia con l'audio. La verifica con audio sintetico e provider reali non sostituisce quella con un microfono fisico. Safari/iOS e i permessi voce in iframe richiedono prove sui dispositivi destinatari; l’adapter Unmatt documentato usa il redirect; il suo collaudo completo non è stato ripetuto in questa revisione.

[Allineamento workspace e repository](docs/workspace-alignment.md) · [Architettura](docs/architecture.md) · [Contratto e iframe](docs/integration.md) · [Task](docs/tasks.md) · [Verifiche e limiti](docs/verification.md)

## Volto fotografico condiviso

Lo stile **Conclavia · Fotorealistico (beta)** usa il personaggio della homepage, con asset e renderer in `conclavia-avatar-kit`. Gli studi lo mostrano come scelta esplicita; nessun profilo reale viene migrato. Il Play nell’anteprima riproduce un benvenuto preregistrato IT/EN. Le risposte arbitrarie usano un labiale dinamico sperimentale: la qualità non è equivalente al video preregistrato e richiede accettazione audiovisiva prima dell’uso operativo. [Modalità, limiti e authoring](https://github.com/vgflutter/conclavia-avatar-kit/blob/main/docs/host/integration.md).

I sei media vengono serviti da `/avatars/host-v1/[asset]`, con allowlist, richieste Range, HEAD ed ETag. Il tracing standalone include gli asset del kit; eseguire `npm run check:avatar-kit` prima delle build coordinate.

## Configurazione dell’integrazione

La scheda **04 Integrazione** mostra il percorso sito → Conclavia → server del sito, permette di salvare pagina dedicata/iframe e URL di ritorno, e genera esempi backend/browser con una guida scaricabile senza chiavi. Il ritorno deve appartenere alle origini autorizzate. Le preferenze aiutano a costruire l’adapter: non lo installano e non sostituiscono il `returnUrl` esplicito richiesto dall’API. Una prova nello Studio non certifica l’integrazione con Umatt. [Contratto e verifica](docs/integration.md).

[Verifica del 26 settembre 2026](docs/verification-2026-09-26.md): prove automatiche, limiti del collaudo e stato distinto dell’integrazione pubblica Umatt.
