# Stato verificato dell’integrazione · 26 settembre 2026

Inventario in sola lettura dal container Onboarding di Conclavia, attraverso il Mongo esistente. Nessuna chiave, risposta o riferimento cliente esportato; nessuna scrittura nelle configurazioni reali.

- Esiste il sito con ID `aihat` e nome visibile `unmatt`, revisione 2.
- Sono autorizzate esclusivamente le origini locali `http://localhost:3001` e `http://localhost:3002`.
- Non ci sono percorsi memorizzati per questo sito: l’adapter deve inviare lo schema all’apertura della sessione.
- Una sessione non-preview risulta completata fra quelle non scadute. Non è una prova del recupero/salvataggio del risultato da parte del sito cliente, né identifica l’ambiente da cui era partita.
- Nessuna sessione Onboarding incompleta aveva una capability ancora valida al momento del controllo.
- Meeting e Onboarding sul VPS rispondono in modalità collaudo, con AI/bot disattivati; il tunnel Mongo verso Unmatt è operativo.

Per collegare il frontend pubblico mancano l’origine HTTPS esatta e la pagina di ritorno, rinviate dall’operatore a un momento successivo. Non sono state inventate né aggiunte origini. La configurazione Conclavia può essere completata nello Studio; il sito cliente deve usare l’endpoint pubblico e conservare la chiave nel suo backend. I repository AIHat non sono stati letti o modificati in questa revisione e il loro collaudo end-to-end non è stato eseguito.

Il nuovo pannello distingue questi passaggi e permette di esportare una guida senza segreti. La schermata in `screenshots/integration-studio-demo.png` usa dati sintetici e non documenta una configurazione cliente reale.
