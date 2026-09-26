# Verifica del 26 settembre 2026

Questa revisione conserva il lavoro già presente sul percorso vocale (interruzione, conferma delle risposte, audit e localizzazione), aggiunge l’host fotografico condiviso e rende configurabile l’integrazione nello Studio.

- 76 test unitari superati: motore, interpretazioni sintetiche, conferme, audit, scadenze, interruzione e preferenze di integrazione.
- 25 prove browser Chrome superate su Mongo temporaneo `127.0.0.1:27018`, database `onboarding_test_*`, porta 3103. Includono nuova integrazione, persistenza e compatibilità con client precedenti, URL non autorizzati, esempi senza segreti, export, layout mobile, avatar condiviso e snapshot immutabili.
- Lint, typecheck, build produzione e verifica standalone superati. Standalone include esattamente i media condivisi e supporta Range; health verifica Mongo e restituisce errori senza dettagli privati.
- Kit: 6 test unitari e controllo dei consumer; Meeting: regressioni avatar/player e quattro prove dedicate al nuovo host e al proxy pubblico superate; build superata.
- Deploy: 6 test Node, 19 test Python, prova con Caddy reale superati.
- Homepage: suite browser IT/EN superata sui nuovi master Qwen/LatentSync, sei larghezze, movimento, Play/pausa/ripresa, caricamento differito e nessuna richiesta esterna. IT 6,44 s ed EN 7,72 s; inizio e durata audio/video coincidono. Questo non certifica un labiale perfetto o l’accettazione della voce da parte dell’utente.

Nessun provider a pagamento è stato chiamato dai test. Le suite opzionali `test:aihat` e `test:handoff` non sono state eseguite: richiedono accesso ai repository cliente, esclusi dall’ambito autorizzato attuale. Le modifiche preesistenti ai relativi fixture sono state conservate.

La qualità del microfono reale, la trascrizione ricevuta da Teams, il salvataggio dal sito cliente e l’accettazione visiva del labiale arbitrario restano verifiche distinte. Il nuovo stile fotografico è una scelta sperimentale, non il default dei profili reali. Per il collegamento Umatt pubblico vedere [stato verificato](integration-status-2026-09-26.md).

## Rilascio verificato

Applicazioni `20260926082504698-d50e52`: Meeting `ff831e8`, Onboarding `f916c4f`, kit `2cc5462`, tutti da checkout puliti. Homepage `web-20260926082505776-c1ecf8`, sorgente Web `296780f`. I successivi commit di documentazione non modificano il codice distribuito.

Sul dominio pubblico la suite browser IT/EN è passata con i nuovi media. I sei asset di ciascuna app e i quattro media pubblici corrispondono ai checksum canonici del kit; verificati ETag/304, Range/206, HEAD e accesso anonimo negato alle API gestionali. Entrambi i container applicativi e Nginx sono healthy. Il tunnel Mongo è attivo; AI disattivata e bot in preview sono stati conservati. La pubblicazione statica non ha riavviato le app; il rilascio applicativo ha superato le guardie sulle conversazioni.

SSL/TLS verificato sui quattro domini, inclusi TLS 1.2/1.3 e redirect HTTP. I certificati Let's Encrypt scadono il 24 dicembre 2026. L’integrazione pubblica Umatt rimane rinviata fino alla definizione di origine e pagina di ritorno.
