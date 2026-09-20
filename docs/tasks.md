# Task e stato — 20 settembre 2026

Prima integrazione: AIHat. Servizio indipendente, Mongo esistente, avatar condivisi con Meeting.

| Task | Risultato | Stato |
| --- | --- | --- |
| 1. Libreria comune | `conclavia-avatar-kit`: renderer, animazioni, asset, cataloghi, validazione aspetto, labiale e audio; entrambi i consumer migrati | Implementato e verificato |
| 2. Fondazione | Next.js indipendente, Mongo con collezioni dedicate, chiavi sito, capability sessione | Implementato e verificato |
| 3. Studio | Configurazione avatar, voce, contesto, origini e flussi per sito | Implementato e verificato |
| 4. Questionari | Schemi versionati, condizioni, validazione, ripresa, correzioni e conferma finale | Implementato e verificato |
| 5. Conversazione | Trascrizione WebRTC, voce Inworld, labiale, interruzioni, webcam locale facoltativa, testo/campi | Implementato; prova vocale reale da eseguire |
| 6. AIHat | Alternativa ai questionari reali, restituzione autenticata alle bozze dei riepiloghi | Implementato; passaggio browser verificato con backend sintetico |
| 7. Embed | Pagina dedicata, iframe con origini consentite e notifica senza dati personali | Implementato; iframe verificato in Chrome |
| 8. Qualità | Test motore/contratti/browser, regressioni Meeting, build dei tre applicativi, documentazione | Eseguito; dettagli in verification.md |
| 9. Esercizio locale | Tunnel esistente ripristinato, siti demo/AIHat creati, configurazione AIHat collegata, studio su 3002 | Pronto |
| 10. Allineamento repository | Kit GitHub dedicato, README e build allineati, controllo ripetibile dei consumer | Verificato; vedi workspace-alignment.md |

## Decisioni applicate

- Prima esperienza AIHat su pagina dedicata; stesso contratto utilizzabile in iframe.
- Avatar visibile/parlante e cliente a voce; webcam locale facoltativa, nessun file audio/video salvato da Conclavia.
- Italiano iniziale; schema e voce supportano anche inglese.
- L'avatar raccoglie risposte e chiarisce termini. Non calcola il profilo né propone investimenti.
- AIHat mantiene validazioni e pulsanti di conferma/salvataggio; percorso interamente azionario e import restano quelli esistenti.
- Sessioni conservate 7 giorni, capability browser di 2 ore; ripresa autorizzata dal sito.
- Impostazioni per applicazione/sito; implementazione e cataloghi degli avatar nel kit comune.

Le prime scelte sono i default adottati mentre l’utente non era disponibile. Non richiedono di cambiare il contratto qualora vengano riviste.

## Prossime verifiche e sviluppo del servizio

1. Conversazione con microfono reale: trascrizione di numeri, pause, rumore, barge-in, labiale e latenza dei provider.
2. Percorso con un account AIHat di prova e backend effettivo; conferma manuale delle bozze e della UX completa.
3. Safari/iOS e permessi audio/video in iframe sui dispositivi destinatari.
4. Per distribuire il servizio: pacchetto avatar versionato privato, domini HTTPS, ruoli e accessi studio, rotazione chiavi, quote e osservabilità. Per utenti non tecnici, editor visuale delle domande al posto dell’attuale editor JSON.
