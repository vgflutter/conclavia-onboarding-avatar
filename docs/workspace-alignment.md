# Allineamento dei repository Conclavia — 20 settembre 2026

## Sorgente condivisa

| Repository | Ruolo |
| --- | --- |
| [conclavia-avatar-kit](https://github.com/vgflutter/conclavia-avatar-kit) | Libreria privata, sorgente di renderer, animazioni, cataloghi, asset e player |
| [conclavia-meeting-avatar](https://github.com/vgflutter/conclavia-meeting-avatar) | Consumer per riunioni; preserva le ultime modifiche e la correzione della spalla 2D |
| [conclavia-onboarding-avatar](https://github.com/vgflutter/conclavia-onboarding-avatar) | Consumer per onboarding indipendente e configurazione per sito |
| [aihat-client](https://github.com/vgflutter/aihat-client) | Adattatore server e rientro nelle bozze; nessuna dipendenza diretta dal renderer |

Entrambi i consumer hanno la dipendenza `file:../conclavia-avatar-kit`. Le installazioni risolvono alla medesima directory fisica. Sono presenti 25 re-export compatibili in Meeting e 22 in Onboarding; i CSS, i tre ritratti e i GLB usati dal renderer sono nel kit. Nuovi stili e animazioni si modificano lì, mantenendo le impostazioni salvate specifiche di ciascun servizio.

Il confronto con il commit Meeting `ffb2ba5` ha confermato che il kit conserva le modifiche originali, con gli adattamenti degli import e le correzioni successive: spalla/maniche 2D, cleanup WebGL, cataloghi centralizzati e player con header/AudioContext opzionali. Nessun ripristino dei vecchi renderer è stato applicato.

Commit del kit verificato: [`08c3062`](https://github.com/vgflutter/conclavia-avatar-kit/commit/08c3062576b18c57d7735737f42a4f6796831f45).

Impronta SHA-256 di tutti i file in `src` e `assets` del kit verificato:

```text
e977406bdc9a02f873954cecceb108bcac70de7ba0717c86dd3730c0dd93aa57
```

## Verifica ripetibile della condivisione

Con i tre repository affiancati e installati:

```sh
npm --prefix ../conclavia-avatar-kit run check:consumers
# Oppure, da uno dei due consumer:
npm run check:avatar-kit
```

Il controllo verifica il percorso effettivo del pacchetto, l’assenza di implementazioni nei re-export, l’assenza degli asset duplicati e l’allineamento delle versioni React/React DOM/Three. Fallisce se un consumer torna a una copia locale. Per aggiornare i checkout seguire il [README del kit](https://github.com/vgflutter/conclavia-avatar-kit#aggiornamento-coordinato).

`file:` collega i sorgenti in sviluppo, ma non fissa un commit remoto e non aggiorna un bundle già distribuito. I rilasci coordinati devono registrare i commit dei repository e ricostruire le applicazioni interessate. Il kit resta un pacchetto privato non pubblicato su npm.

## Verifiche eseguite

| Verifica | Risultato |
| --- | --- |
| Meeting: 11 file di regressione avatar, animazione, sillabe, gesto, espressioni, ritratti, GLB e streaming | **62 test superati** |
| Onboarding: motore/validazione/isolamento logico e ordine trascrizioni | **11 test superati** |
| Adattatore AIHat sul questionario e scoring reali, senza persistenza | **5 test superati** |
| Browser Onboarding: flusso completo, tenant, concorrenza, renderer e iframe | **5 test superati** |
| Passaggio browser AIHat → Onboarding → AIHat | **2 test superati**, backend sintetico e nessun salvataggio automatico |
| Kit, Meeting, Onboarding e file AIHat interessati | TypeScript e lint superati |
| Meeting, Onboarding e AIHat | Build di produzione superate |
| Runtime standalone Meeting | Entrambi i GLB restituiti con contenuto SHA-256 identico al kit; asset sconosciuto 404 |
| Dipendenze condivise | Percorso comune, re-export e versioni allineati |

La prova di passaggio AIHat è stata convertita in TypeScript per eliminare un conflitto ESM/CommonJS nel caricamento del kit da Playwright. La prima esecuzione non riusciva a caricare i test; la successiva ha eseguito e superato entrambi i casi.

Le regressioni scrivono esclusivamente sul Mongo temporaneo 27018. Il database applicativo, la configurazione locale, il server Meeting 3000 e il server Onboarding 3002 sono preservati. Nessuna prova con clienti o chiamata a provider a pagamento.

## Documentazione e distribuzione

README dei tre progetti Conclavia e documentazione AIHat allineati su Node 22.21.1+, struttura dei checkout, installazione, aggiornamenti, porte, proprietà delle impostazioni e limiti di verifica. I collegamenti agli asset spostati e alle relative attribuzioni puntano al kit su GitHub.

Il Dockerfile Meeting riceve il kit come contesto nominato e conserva il layout standalone con i repository affiancati:

```sh
# Dalla directory conclavia-meeting-avatar:
docker build --build-context avatar-kit=../conclavia-avatar-kit -t conclavia .
```

La CLI Docker non è disponibile in questa macchina: **nessuna build container è stata eseguita**. È stata verificata separatamente la build Next standalone e la sua consegna degli asset condivisi. Conversazione con microfono reale, ricevuto audio/video in Teams e distribuzione remota restano verifiche separate.
