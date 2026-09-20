# Conclavia Onboarding Avatar

Servizio indipendente per raccogliere risposte strutturate attraverso un avatar, una domanda alla volta. Il sito cliente mantiene autenticazione, regole di business e conferma delle proprie operazioni. Prima integrazione: i questionari profilo investitore e portafoglio di AIHat.

## Avvio locale

Richiede Node **22.21.1+**, il repository fratello `../conclavia-avatar-kit` e il Mongo già usato da Meeting. Il kit è privato: serve un account GitHub autorizzato. In questa macchina Mongo è raggiunto dal tunnel SSH `mongo-tunnel`, sulla porta 27017.

Per una nuova installazione, clonare nella stessa directory e poi entrare in Onboarding:

```sh
git clone https://github.com/vgflutter/conclavia-avatar-kit.git
git clone https://github.com/vgflutter/conclavia-meeting-avatar.git
git clone https://github.com/vgflutter/conclavia-onboarding-avatar.git
cd conclavia-onboarding-avatar
```

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

Per collegare AIHat configurare le tre variabili `CONCLAVIA_ONBOARDING_URL`, `CONCLAVIA_ONBOARDING_API_KEY`, `CONCLAVIA_ONBOARDING_ENABLED`. Il pulsante **Compila con l’avatar** apre la pagina dedicata. Il backend AIHat deve essere raggiungibile attraverso il suo `API_BASE_URL`; Meeting occupa già la porta 3000, AIHat client usa 3001 e Onboarding 3002. Nella macchina corrente queste variabili sono già configurate. Il setup e il seed non scrivono automaticamente nel file ambiente di AIHat; su un altro ambiente impostarle nel backend/BFF di AIHat con la chiave del sito generata dallo studio. Nessuna modifica alle porte del backend è stata imposta.

## Cosa è implementato

- Studio con siti, avatar, voci, contesto, origini consentite e percorsi JSON versionati.
- Tre renderer condivisi: editoriale 2D, ritratto 2.5D, personaggio 3D. Labiale e audio in streaming tramite Inworld.
- Microfono WebRTC con turni automatici e interruzione della voce dell’avatar; trascrizione OpenAI, estrazione delle risposte con schema strutturato e validazione server. Campi e testo disponibili anche senza microfono.
- Webcam opzionale con sola anteprima locale: nessuna analisi visiva del cliente, registrazione o invio del video.
- Domande condizionali, correzioni, campi facoltativi, riepilogo, conferma esplicita, ripresa autorizzata e isolamento tra siti/clienti.
- AIHat riceve una bozza nei propri riepiloghi: conserva scoring, salvataggio, generazione e conferma specifica del portafoglio interamente azionario.

Lo studio e l’interfaccia cliente sono inizialmente in italiano. Gli schemi supportano anche contenuti e voce inglesi; la localizzazione completa dell’interfaccia resta da fare.

## Avatar: un solo sorgente

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

I test browser del servizio usano la porta **3103** e `.next-e2e`, separati dal normale dev server 3002. La prova AIHat aggiunge il frontend 3114 e un backend sintetico 3115. Non eseguire le due suite browser Onboarding contemporaneamente.

I test browser richiedono un Mongo temporaneo locale sulla porta **27018**, separato dal tunnel applicativo, e Chrome. Creano e rimuovono solo database con prefisso `onboarding_test_`. Provider disabilitati, credenziali sintetiche, nessun cliente reale. La qualità della conversazione con microfono e provider reali va verificata separatamente.

[Allineamento workspace e repository](docs/workspace-alignment.md) · [Architettura](docs/architecture.md) · [Contratto e iframe](docs/integration.md) · [Task](docs/tasks.md) · [Verifiche e limiti](docs/verification.md)
