# Integrare un sito

La chiave sito si usa esclusivamente nel backend del sito. Il browser riceve una URL di sessione con capability limitata, mai la chiave di integrazione. Ogni sito possiede origini di ritorno esplicitamente autorizzate nello studio.

## 1. Creare una sessione dal server

`POST /api/v1/sessions`, header `Authorization: Bearer <chiave sito>`, JSON:

```json
{
  "subject": "riferimento-opaco-del-cliente-autenticato",
  "flowId": "primo-accesso",
  "returnUrl": "https://cliente.example/onboarding/riepilogo"
}
```

In alternativa a `flowId`, passare `flow` con uno schema conforme a `src/lib/onboarding/types.ts`. AIHat usa questa modalità per mantenere i propri questionari nella propria applicazione. Esempio minimo:

```json
{
  "id": "primo-accesso",
  "version": "1",
  "title": "Primo accesso",
  "locale": "it",
  "objective": "Raccogliere il nome preferito per iniziare il servizio.",
  "introduction": "Ti accompagno nel primo accesso.",
  "questions": [
    { "id": "name", "title": "Come preferisci essere chiamato?", "type": "text", "required": true, "maxLength": 100 }
  ]
}
```

Risposta 201: `{ sessionId, url, expiresAt }`. Redirigere il browser a `url`, dopo averne verificato l’origine attesa. Non registrare la URL completa nei log: il frammento contiene la capability della sessione.

Il sito cliente non deve acquisire il microfono né integrare renderer o SDK voce. La pagina Conclavia presenta il consenso e il pulsante **Inizia a parlare**; il browser può chiedere il permesso del microfono. **Continua scrivendo** permette di iniziare senza voce. Durante il percorso sono disponibili pausa, passaggio alla scrittura, correzioni e revisione finale; non è richiesta la webcam.

I campi numerici e quelli con `confirmSpoken: true` richiedono conferma quando la risposta viene interpretata dalla conversazione. Per esempio, il sito può usare questa proprietà su una scelta di valuta. La conferma del singolo valore è distinta dalla conferma finale di tutte le risposte e dalle successive operazioni nel sito cliente.

Il sito fornisce domanda, opzioni e descrizioni nella lingua scelta con `flow.locale` (`it` o `en`); Conclavia usa quella lingua per i propri controlli e per la conversazione. Il servizio non traduce automaticamente uno schema italiano perché il sito cliente cambia lingua.

## 2. Recuperare il risultato dal server

La pagina di completamento torna a `returnUrl`, aggiungendo `onboardingSession=<id>`; nessuna risposta nel redirect. Il backend autenticato del sito chiama:

`GET /api/v1/sessions/<id>/result?subject=<riferimento-opaco>`

con la propria chiave sito. Risposta:

```json
{
  "sessionId": "uuid",
  "subject": "riferimento-opaco",
  "flowId": "primo-accesso",
  "flowVersion": "1",
  "answers": { "name": "Mario" },
  "confirmedAt": "2026-09-20T12:00:00.000Z"
}
```

Il sito verifica sessione, soggetto autenticato, conferma, versione e schema, poi presenta il proprio riepilogo. Il completamento dell’avatar non è l’autorizzazione a creare ordini, portafogli o altre operazioni del sito.

`POST /api/v1/sessions/<id>/resume` con `{ subject, flowVersion }` restituisce una nuova URL per una sessione incompleta: la capability precedente viene invalidata. Non riprende sessioni scadute, completate o di altri clienti/siti.

Il servizio conserva lo schema originale della sessione. Se `flowVersion` non coincide, la ripresa restituisce `404`, come per una sessione non più disponibile. Un timeout o un errore temporaneo non prova che la sessione sia persa: il sito conserva il suo riferimento e permette un nuovo tentativo. L'adattatore Unmatt crea una nuova sessione solo dopo un `404`.

## Iframe

La stessa URL può essere assegnata a un iframe creato dal sito:

```html
<iframe
  id="conclavia-onboarding"
  title="Onboarding con assistente virtuale"
  allow="microphone; autoplay"
  referrerpolicy="no-referrer"
  style="width:100%;height:850px;border:0"
></iframe>
```

Impostare `src` alla URL ricevuta dal proprio backend. Se il sito usa una Permissions-Policy restrittiva, deve delegare microfono e riproduzione audio anche all’origine Onboarding. La delega non sostituisce il consenso del cliente o il permesso richiesto dal browser. In produzione entrambe le origini devono usare HTTPS. La pagina Onboarding ammette solo gli antenati configurati per quel sito.

```js
const frame = document.querySelector('#conclavia-onboarding');
const expectedOrigin = 'https://onboarding.example';
const expectedSessionId = launched.sessionId; // ricevuto dal backend del sito
frame.src = launched.url;
window.addEventListener('message', event => {
  if (event.origin !== expectedOrigin || event.source !== frame.contentWindow) return;
  if (event.data?.type !== 'conclavia.completed' || event.data.sessionId !== expectedSessionId) return;
  // Il backend autenticato del sito recupera e valida il risultato.
  window.location.assign(`/onboarding/riepilogo?onboardingSession=${encodeURIComponent(expectedSessionId)}`);
});
```

Il percorso in iframe e la notifica al parent sono verificati in Chrome su due origini locali. La prima integrazione AIHat usa il redirect. Safari/iOS, permessi in iframe e microfono reale restano da collaudare sui dispositivi destinatari.

## Adattatore AIHat

- Il BFF crea la sessione solo per un cliente autenticato e per le combinazioni previste di questionario e destinazione.
- `subject` deriva da HMAC dell’identità; non viene inviata l’email al servizio.
- Il profilo di rischio proviene dal questionario del backend, con gli stessi ID ma senza punteggi.
- Il portafoglio richiede un profilo già salvato e replica le preferenze del wizard. La diramazione import rimanda all’importatore esistente.
- Il risultato torna a `/investor` o `/portfolio/create`, viene rivalidato e diventa una bozza. Scoring, conferma interamente azionaria e generazione restano quelli esistenti.
- `CONCLAVIA_ONBOARDING_ENABLED=false` nasconde l’alternativa avatar. Il questionario tradizionale resta accessibile anche quando il servizio non è disponibile.

## Audit operativo del servizio

Conclavia conserva gli eventi in `onboarding_audit_events`, separati dalle risposte restituite al sito cliente. Ogni evento scade con la sessione (`expiresAt`, indice MongoDB TTL): normalmente sette giorni dalla creazione, non sette giorni dall'ultima interazione. La rimozione fisica avviene al successivo passaggio del processo TTL MongoDB. Le letture amministrative escludono subito gli eventi scaduti.

Per conversazioni e modifiche strutturate l'audit registra domanda e revisione prima/dopo, risposte effettivamente cambiate, proposta in attesa di conferma, stato, durata e risultato. Per i turni include testo ricevuto e interpretazione del modello (`action`, `questionId`, `valueJson`, `explanation`). `POST /sessions/<id>/turn` accetta `source: "voice" | "text"` per distinguere trascrizione e scrittura; il valore predefinito è `text`. Un risultato `not_applied` indica che non è stata rilevata una modifica, non prova da solo un errore: può anche essere una risposta invariata. Gli errori usano codici sicuri, senza messaggi del provider.

La pagina Conclavia può inviare `POST /api/v1/sessions/<id>/events`, con capability della sessione, origine autorizzata e consenso già espresso:

```json
{
  "event": "transcript_held",
  "text": "Seimila euro",
  "questionId": "currency",
  "previousQuestionId": "amount",
  "revision": 7,
  "reason": "context_changed"
}
```

- Eventi ammessi: `transcript_held`, `voice_error`, `voice_started`, `voice_paused`, `voice_resumed`, `voice_stopped`, `voice_command`.
- Campi facoltativi: `text` (massimo 4000 caratteri), `questionId` e `previousQuestionId` (massimo 80), `revision` (intero non negativo), `reason`.
- Motivi ammessi: `context_changed`, `request_failed`, `recognition_failed`, `pause_command`, `repeat_command`, `resume_command`, `user_action`, `mode_changed`, `session_completed`, `review_started`, `idle_timeout`, `session_expired`, `permission_denied`, `connection_failed`.

Campi estranei sono rifiutati. Identità del sito/sessione, origine client/server e revisione effettiva sono determinati sul server; il contesto dichiarato dal browser resta separato. Non vengono acquisiti audio, identificatori del dispositivo, SDP, chiavi o capability. Le trascrizioni possono contenere dati personali forniti dal cliente e seguono la stessa conservazione delle risposte.

La risposta è `202 { "ok": true }`; questo conferma l'accettazione best effort, non garantisce persistenza se lo storage diagnostico non è disponibile. Il limite è 60 eventi browser/minuto per sito e cliente, 300 eventi browser per sessione e 1000 eventi server per sessione, con quote separate. Il superamento della quota browser restituisce `429`; non blocca le risposte del questionario. Gli eventi possono essere inviati dopo la conferma finale finché la capability è valida, per registrare l'arresto della voce. Ogni documento è limitato a 32 KB: valori molto grandi vengono abbreviati o omessi, con indicazione `truncated` quando viene ridotto il documento.

Solo un amministratore Conclavia autenticato può esportare `GET /api/admin/sites/<siteId>/sessions/<sessionId>/audit?offset=0`. La risposta contiene `events` (massimo 200) e `nextOffset` (`null` a fine elenco). La sessione deve appartenere al sito indicato ed essere ancora valida. Le API pubbliche della sessione e del risultato non includono gli audit; una chiave del sito cliente non autorizza l'export amministrativo.

## Pannello di integrazione

In **Studio → 04 Integrazione** l’operatore configura le origini del sito, la modalità `redirect` o `iframe` e la pagina di ritorno. Il salvataggio esplicito conserva `site.integration = { mode, returnUrl }`, con controllo della revisione e dell’origine; i client amministrativi precedenti che omettono il campo conservano le preferenze esistenti. Nessuna migrazione delle sessioni pubblicate.

Queste impostazioni sono indicazioni per l’adapter e per gli esempi esportati: `POST /api/v1/sessions` continua a richiedere un `returnUrl` esplicito. Un backend può inviare il proprio `flow` oppure usare un `flowId` salvato. La guida scaricabile contiene le impostazioni di lavoro e funzioni di partenza, mai la chiave del sito. Autenticazione del cliente, associazione server fra cliente e sessione, validazione della versione e salvataggio idempotente restano responsabilità del sito.

La pagina distingue configurazione da collaudo. Un’origine autorizzata, un Mongo raggiungibile o un’anteprima completata non provano che Umatt abbia ricevuto e salvato il risultato. Per verificarlo servono avvio dal sito, conferma, recupero autenticato del risultato e riscontro nel backend del sito. In questa revisione i repository del cliente non sono stati ispezionati né modificati; le schermate dimostrative usano solo `demo.example` e dati sintetici.
