# Verifiche — 20 settembre 2026

## Risultati

| Area | Verifica | Esito |
| --- | --- | --- |
| Onboarding | 11 test del motore, validazione, privacy della vista, origini, correzioni e ordine trascrizioni | Superati |
| Contratto AIHat | 5 test con il questionario reale del backend e il suo scoring deterministico, allocazione/import/interamente azionario | Superati |
| Browser servizio | Percorso completo, correzione condizioni, conferma; autorizzazioni/tenant/scadenza; concorrenza; studio/renderer; iframe cross-origin | Superati |
| Browser AIHat | Due scenari su frontend reali e backend sintetico: rischio, portafoglio, conferma specifica azionaria, isolamento account, nessun salvataggio automatico | Superati |
| Meeting | 46 casi relativi ad avatar, animazioni e audio coperti durante l’estrazione | Superati dopo correzioni; vedere nota sotto |
| Build | Meeting, Onboarding, AIHat | Superate |
| Analisi statica | Lint Meeting/Onboarding, lint file AIHat modificati, typecheck kit e consumer | Superati |
| Distribuzione asset | Server standalone Meeting su porta temporanea: GLB maschile/femminile 200, sconosciuto 404 | Superata |
| Mongo applicativo | Connessione, siti demo/AIHat, accesso studio e presenza configurazione provider | Verificati senza usare clienti reali |
| Configurazione OpenAI | Creazione di credenziale effimera trascrizione, senza inviare audio | Accettata per `gpt-4o-transcribe` con `server_vad` |

### Regressioni individuate e corrette

- Risoluzione degli asset condivisi nel bundle Turbopack: il percorso virtuale di `require.resolve` non era un file leggibile dal server. Ora gli asset sono letti dal pacchetto installato e inclusi nel tracing della build.
- Cambio rapido da 3D ad altro stile durante la compilazione WebGL: rilascio anticipato delle risorse. Ora la distruzione è coordinata con il completamento della compilazione asincrona. La correzione è nel kit comune.
- Rientro del profilo rischio AIHat: un effetto React ripristinava le risposte precedenti dopo l’inizializzazione della bozza. Ora conserva le risposte raccolte dall’avatar; il baseline del profilo salvato resta separato.
- `gpt-live-transcribe` rifiuta il rilevamento automatico dei turni. Selezionato e verificato il modello compatibile, evitando una configurazione audio che avrebbe fallito all’avvio.

La prima esecuzione dei 46 casi Meeting ha dato 39 successi e 7 fallimenti per gli asset. Dopo la correzione sono passati tutti i 12 test dei due file interessati (`avatar-rigged`, `avatar-styles`). Successivamente gli 8 test `avatar-workspace` e `avatar-styles` sono stati rieseguiti con successo dopo la centralizzazione dei cataloghi. Nessuna chiamata a provider a pagamento nelle regressioni. Gli avvisi WebGL dei test di fallback sono intenzionali.

## Isolamento e limiti

I test browser usano esclusivamente il Mongo temporaneo 27018 e database dedicati. Il tunnel 27017 serve l’applicazione normale e non è stato usato per i test. Il backend della prova di passaggio AIHat è sintetico: usa lo schema e il calcolo rischio reali, rifiuta ogni scrittura e verifica che l’onboarding non effettui salvataggi o generazioni.

Non è ancora stata verificata una conversazione completa con microfono, trascrizione, interpretazione e TTS reali. La configurazione OpenAI accettata non prova latenza, qualità dei dialoghi o precisione del labiale. Le misure di sincronizzazione dei test Meeting riguardano audio sintetico. Safari/iOS e i permessi media nell’iframe richiedono prova dedicata.

Studio locale disponibile su `http://localhost:3002/studio`; accesso in `.local/studio-access.txt`. AIHat richiede il suo backend su `http://localhost:3333` e il frontend su `http://localhost:3001`. Non è stato avviato né modificato il backend reale AIHat. Nessun deployment o pubblicazione su npm. Commit e push dei repository sono gestiti nel successivo [allineamento workspace](workspace-alignment.md), con una nuova esecuzione delle regressioni.

## Riferimenti dei protocolli

- [OpenAI: trascrizione Realtime](https://developers.openai.com/api/docs/guides/realtime-transcription)
- [OpenAI: collegamento WebRTC](https://developers.openai.com/api/docs/guides/voice-webrtc?api=realtime)
- [OpenAI: credenziali effimere](https://developers.openai.com/api/reference/resources/realtime/subresources/client_secrets)
- [OpenAI: output strutturati](https://developers.openai.com/api/docs/guides/structured-outputs)

## Allineamento successivo e pubblicazione Git

Il [report workspace](workspace-alignment.md) registra la verifica coordinata successiva alle ultime modifiche Meeting, inclusa la correzione della spalla 2D: 62 regressioni Meeting, 11 unit test Onboarding, 5 contratti AIHat, 5 scenari browser del servizio e 2 scenari di rientro AIHat.
