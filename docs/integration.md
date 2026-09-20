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

Il sito verifica versione e schema, poi presenta il proprio riepilogo. Il completamento dell’avatar non è l’autorizzazione a creare ordini, portafogli o altre operazioni del sito.

`POST /api/v1/sessions/<id>/resume` con `{ subject, flowVersion }` restituisce una nuova URL per una sessione incompleta: la capability precedente viene invalidata. Non riprende sessioni scadute, completate o di altri clienti/siti.

## Iframe

La stessa URL può essere assegnata a un iframe creato dal sito:

```html
<iframe
  id="conclavia-onboarding"
  title="Onboarding con assistente virtuale"
  allow="microphone; camera; autoplay"
  referrerpolicy="no-referrer"
  style="width:100%;height:850px;border:0"
></iframe>
```

Impostare `src` alla URL ricevuta dal proprio backend. Se il sito usa una Permissions-Policy restrittiva, deve delegare microfono e webcam anche all’origine Onboarding. In produzione entrambe le origini devono usare HTTPS. La pagina Onboarding ammette solo gli antenati configurati per quel sito.

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
