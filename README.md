# substance-tracker

Web app personale (mobile first) per registrare acquisti (lotti) e consumi di qualsiasi sostanza con un'unità, e sapere quanto ne resta, quanto se ne consuma e quanto costa.

Stack: MySQL 8.4, API Node 22 + TypeScript + Fastify + mysql2 (`api/`), SPA Angular 21 (`web/`). Tutto gira in Docker.

## Prerequisiti

- Docker Desktop con Docker Compose v2 (`docker compose version`).
- Git.
- Node sull'host **non** serve: `npm install`, build e test girano dentro i container.

## Sviluppo

I comandi si lanciano dalla root del progetto (PowerShell o Git Bash).

```sh
# 1. Configurazione (una volta sola): copia il template e cambia le password
cp .env.example .env

# 2. Avvio: db, api (tsx watch) e web (ng serve)
docker compose -f compose.dev.yaml up -d

# 3. Log (Ctrl+C per uscire)
docker compose -f compose.dev.yaml logs -f api web

# 4. Test dell'API (vitest sul database substance_tracker_test)
docker compose -f compose.dev.yaml exec api npm test

# 5. Stop (i dati restano nel volume)
docker compose -f compose.dev.yaml down
```

Note:

- Il primo avvio è lento: `api` e `web` eseguono `npm install` dentro il container. I `node_modules` stanno in volumi Docker, mai sull'host Windows. Dopo aver cambiato un `package.json` basta `docker compose -f compose.dev.yaml restart api` (o `web`).
- Hot reload: `api` e `web` fanno polling dei file, perché i bind mount da Windows non propagano gli eventi di modifica.
- Il database di test `<DB_NAME>_test` viene creato da `db/dev-init/01-test-db.sh` solo quando il volume del db è nuovo. Se il volume esisteva già:
  `docker compose -f compose.dev.yaml exec db bash /docker-entrypoint-initdb.d/01-test-db.sh`
- `docker compose -f compose.dev.yaml down -v` cancella anche il database di sviluppo e i `node_modules`: usalo solo se vuoi ripartire da zero.
- In dev Angular chiama l'API con percorsi relativi (`/api/...`): `ng serve` li inoltra al servizio `api` tramite `web/proxy.conf.json`. Quindi anche `http://localhost:4200/api/health` risponde.
- Utenti: ogni pagina e ogni chiamata a `/api` vuole un utente collegato. Quando il database non ha ancora un amministratore, l'API lo crea all'avvio: `admin` (`ADMIN_USERNAME`, `ADMIN_EMAIL` per cambiarli; il pannello di amministrazione è in `/<username>/admin`, quindi `/admin/admin`), con una password generata scritta in `to_delete.password.txt` nella root del progetto (ignorato da git). Accedi, poi cancella il file.

### Database demo

Mentre si costruisce il frontend, l'API di sviluppo usa `substance_tracker_demo`, un database usa-e-getta con dati vari, al posto di `substance_tracker`. Serve la riga `API_DB_NAME=substance_tracker_demo` nel `.env`: la legge solo il servizio `api`, mentre `DB_NAME` e il database dei test non cambiano.

```sh
# Una volta sola, dopo aver aggiunto API_DB_NAME al .env
docker compose -f compose.dev.yaml up -d api

# Ricrea il database demo da zero e lo riempie tramite l'API (Git Bash)
bash db/demo/reset-demo.sh

# Lo stesso, ma senza dati: solo l'amministratore (per vedere la home vuota)
bash db/demo/reset-demo.sh --empty

# Un altro database demo (il nome comincia con substance_tracker_demo), per provare lo script
# senza toccare quello di tutti i giorni: l'API deve puntare lì (API_DB_NAME)
bash db/demo/reset-demo.sh --db substance_tracker_demo_prova
```

- Lo script fa `DROP DATABASE` del database demo a ogni esecuzione. Non tocca mai `substance_tracker` né `substance_tracker_test` (accetta solo nomi che cominciano con `substance_tracker_demo`): se l'API non punta a quel database si ferma senza fare nulla.
- Gli utenti: all'avvio sul database nuovo l'API crea l'amministratore (`admin`, o `ADMIN_USERNAME`) e scrive la sua password in `to_delete.password.txt` (riscritto a ogni reset); lo script crea poi `test-user` (password `Test-user-pass-1`), che ha tutti i dati qui sotto, e `other-user` (`Other-user-pass-1`) con due sostanze sue, per provare insieme l'accesso, l'isolamento (le cose dell'altro non esistono) e l'impersonazione. Password demo, solo sviluppo: un'istanza di produzione non ha utenti demo né dati.
- Lanciato due volte dà gli stessi dati con gli stessi id: le date sono fisse e il database è nuovo. Cambiano solo i timbri di registrazione (`createdAt`, `deactivatedAt`, `archivedAt`).
- I dati di `test-user` sono in `db/demo/fill-demo.mjs`: 7 sostanze, una per ogni caso da vedere sulla card (molti lotti, segmenti minuscoli, ultimo lotto finito, decimali, scorta 0 con consumi one-time, nessun lotto, nome e prezzo enormi, sostanza archiviata). In fondo, i consumi per la pagina consumi (43 in tutto): oltre 20 per le Sigarette (quattro pacchetti a luglio, finiti), una one-time a 0 €, un consumo annullato, qualche nota.
- Per tornare al database di sviluppo: togli `API_DB_NAME` dal `.env` e `docker compose -f compose.dev.yaml up -d api`.

### App Android (sviluppo)

L'app Android è il sito impacchettato con Capacitor (`web/android`, `web/capacitor.config.ts`; design in `wiki/projects/substance-tracker/design-android.md` nel brain). Due app dallo stesso codice: **Substance tracker** (`io.github.reiettoayanami.substancetracker`, solo https, firmata dalla CI) e **Substance tracker dev** (`...substancetracker.dev`, chiave di prova, accetta http), che stanno insieme sullo stesso telefono. Si costruisce nel container Android (`tools/android/`), che parte solo su richiesta: su Windows non serve installare niente.

```sh
# 1. Il container Android (la prima volta costruisce l'immagine), poi l'SDK nel suo volume (~1 GB, una volta)
docker compose -f compose.dev.yaml --profile android up -d android
docker compose -f compose.dev.yaml exec android android.sh setup

# 2. La build per l'app (font e icone dentro, la sua CSP, niente Admin) copiata nel progetto Android
docker compose -f compose.dev.yaml exec web npx ng build --configuration production,android
docker compose -f compose.dev.yaml exec web npx cap sync android
#    ...oppure, per vedere subito le modifiche sul telefono, la versione che carica le pagine da ng serve
docker compose -f compose.dev.yaml exec -e CAP_LIVE_RELOAD=http://localhost:4200 web npx cap sync android

# 3. L'APK dell'app dev, installato sul telefono (o sull'emulatore) collegato, e aperto
docker compose -f compose.dev.yaml exec android android.sh build
docker compose -f compose.dev.yaml exec android android.sh install
docker compose -f compose.dev.yaml exec android android.sh live    # solo con CAP_LIVE_RELOAD
docker compose -f compose.dev.yaml exec android android.sh start

# Un emulatore senza finestra, se il PC ha la virtualizzazione (KVM): la prima volta scarica Android 16 (~1,5 GB)
docker compose -f compose.dev.yaml exec android android.sh emulator
```

**Collegare il telefono.** Docker su Windows non vede le porte USB, quindi `adb` arriva al telefono in un altro modo:

- **Wi-Fi (consigliato, Android 11 o più):** telefono e PC sulla stessa rete → Opzioni sviluppatore → Debug wireless attivo → "Associa dispositivo con codice di accoppiamento". Poi, con l'indirizzo:porta e il codice che mostra (il codice vale circa un minuto):
  `docker compose -f compose.dev.yaml exec android android.sh pair <ip:porta> <codice>`, e con l'indirizzo:porta della schermata "Debug wireless" (è un'altra porta):
  `docker compose -f compose.dev.yaml exec android android.sh connect <ip:porta>`. Il comando mostra anche la versione di Android del telefono.
- **Cavo USB:** scarica "SDK Platform-Tools" per Windows da developer.android.com (uno zip, basta scompattarlo), collega il telefono e accetta "Consentire il debug USB?"; nella cartella scompattata `adb devices` deve mostrarlo come `device`, poi `adb install web\android\app\build\outputs\apk\dev\debug\app-dev-debug.apk`.

Note:

- Con il live reload il telefono raggiunge `ng serve` attraverso adb (`android.sh live`: la porta 4200 del telefono porta al container, e da lì al servizio `web`), quindi niente firewall né indirizzi: la pagina è `http://localhost:4200`, l'unico nome che il dev server accetta.
- Il live reload serve per l'aspetto delle pagine. Per tutto il resto si prova la build impacchettata (punto 2, senza `CAP_LIVE_RELOAD`), perché in live reload Capacitor si comporta diversamente: le chiamate con indirizzo relativo (`/api/...`) passano dalla WebView invece che dalle richieste native, e una richiesta nativa fallita torna come 200 con la pagina del dev server invece di un errore (prova del 2026-10-04).
- L'APK dell'app dev è firmato con la chiave di debug del container, che sta nel volume `android-home`: resta la stessa tra una build e l'altra, quindi l'app si aggiorna senza disinstallarla. Se il volume viene cancellato, l'app dev va disinstallata una volta.
- Requisiti dell'app: Android 7.0 o più (API 24, il minimo di Capacitor 8.5).

## Porte

| Servizio | Host | Container | Note |
|---|---|---|---|
| db (dev) | `DB_HOST_PORT` = 3306 | 3306 | per client MySQL locali. Se la 3306 dell'host è già occupata (es. un MySQL dentro WSL) Docker Desktop non pubblica la porta senza dare errore: usa un'altra porta, es. `DB_HOST_PORT=3307` in `.env` |
| api (dev) | `API_HOST_PORT` = 3001 | 3000 | `http://localhost:3001/api/health` (la 3000 dell'host è occupata) |
| web (dev) | `WEB_HOST_PORT` = 4200 | 4200 | `http://localhost:4200` |
| app (prod) | `APP_PORT` = 8080 | 3000 | API su `/api`, Angular su `/` |
| db (prod) | nessuna | 3306 | raggiungibile solo dalla rete interna di compose |

I progetti compose si chiamano `substance-tracker-dev` e `substance-tracker-prod`: volumi e reti di dev e prod non si toccano.

## Schema del database

Lo schema vive in `api/migrations/` (`001_init.sql`, `002_…`). L'API applica all'avvio i file non ancora eseguiti, in ordine di nome, e li registra nella tabella `schema_migrations`. Per cambiare lo schema si aggiunge un nuovo file numerato: mai modificare una migrazione già applicata.

## Produzione

```sh
# 1. .env con segreti veri (password lunghe, solo lettere e numeri), l'indirizzo dell'istanza
#    (APP_URL), il segreto delle sessioni (AUTH_SECRET); il primo amministratore è `admin`
#    se ADMIN_USERNAME non dice altro.
#    Senza uno di questi compose si rifiuta di partire.
cp .env.example .env    # poi modifica .env

# 2. Avvio con l'immagine pubblicata (vedi "Rilasci e aggiornamenti")
docker compose -f compose.prod.yaml pull
docker compose -f compose.prod.yaml up -d
#    ...oppure, finché non c'è un rilascio o per usare questo codice, build qui e avvio
docker compose -f compose.prod.yaml up -d --build

# 3. Stato e log
docker compose -f compose.prod.yaml ps
docker compose -f compose.prod.yaml logs -f app

# 4. Aggiornamento: la nuova immagine, poi il riavvio (le migrazioni partono da sole)
docker compose -f compose.prod.yaml pull
docker compose -f compose.prod.yaml up -d

# 5. Stop (i dati restano nel volume)
docker compose -f compose.prod.yaml down
```

L'app risponde su `http://localhost:8080` (`APP_PORT`), e si apre da `APP_URL`: da un altro indirizzo l'accesso viene rifiutato.

Ogni risposta porta gli header di sicurezza (`api/src/shared/security-headers.ts`): script solo dall'istanza, stili e font anche da Google Fonts, nessun riquadro (l'app non si apre dentro un iframe di un altro sito, nemmeno di una dashboard), `nosniff`, `Referrer-Policy: same-origin`, e HSTS per un anno quando `APP_URL` è https.

### Primo avvio: l'amministratore

Al primo avvio, quando il database non ha amministratori, l'API crea `ADMIN_USERNAME` (`admin` se non è impostato; permanente: è l'indirizzo delle sue pagine, e il suo pannello di amministrazione è `/<username>/admin`) con l'email `ADMIN_EMAIL` e una password generata, scritta in `to_delete.password.txt` accanto a `compose.prod.yaml`. Accedi con quelle credenziali, poi cancella il file: la password si cambia da Settings. Il log (`docker compose -f compose.prod.yaml logs app`) dice dove l'ha scritta, mai la password.

Se il file non si può scrivere (su Linux la cartella deve essere scrivibile dall'utente 1000 del container), l'amministratore c'è comunque e il log lo dice: gli si dà una password con `docker compose -f compose.prod.yaml exec app node dist/cli.js reset-password <username>`, che la stampa una volta sola.

Se l'amministratore non si può creare (per esempio `ADMIN_USERNAME=login`: è una parola riservata, come `api`; uno username ha 3-30 caratteri fra lettere minuscole, cifre, `-` e `_`), l'app non parte: il log dice perché, si corregge il `.env` e al riavvio riprova.

### Rilasci e aggiornamenti

- **Versioni** (`api/src/version.ts`, mostrata in basso a destra): `<prefisso><anno>.<backend>.<frontend>`. `dev26.0.0` sui rami di sviluppo, che si chiamano come la loro versione; `a` alpha, `b` beta, `v` release solo su `main`, solo numeri. Cambia solo quando lo decide lenzi.
- **CI** (`.github/workflows/ci.yml`, a ogni push su `main` e sui rami `dev*`, e sulle pull request): controlla le regole delle versioni, fa girare i test dell'API (con MySQL 8.4) e del web, la build del web, `npm audit` e la build dell'immagine. `npm audit` blocca sulle vulnerabilità alte o critiche di ciò che finisce nell'immagine (le dipendenze di produzione); quelle degli strumenti di build (Angular CLI, builder) le mostra senza bloccare.
- **Immagini**: da `main`, con una versione `a`/`b`/`v`, la CI pubblica `ghcr.io/reiettoayanami/substance-tracker:<versione>`; una `v` diventa anche `latest`. Una versione già pubblicata non viene mai sovrascritta: il commit non si pubblica e la CI lo segnala. Solo `linux/amd64` per ora.
- **Rilasciare**: su `main`, nello stesso push, il codice approvato e la versione `a`/`b`/`v` in `api/src/version.ts`.
- **Scegliere una versione** sull'istanza: `APP_VERSION=a26.0.0` nel `.env` (senza: l'ultima release), poi i comandi del punto 4.
- **Dependabot** (`.github/dependabot.yml`): ogni settimana le patch delle dipendenze npm, dell'immagine Node e delle azioni della CI, minori e patch raggruppate. Legge la configurazione dal ramo predefinito del repository.

> **Mai `docker compose -f compose.prod.yaml down -v` con dati veri**: `-v` cancella il volume del database. Prima di qualsiasi operazione rischiosa, fai un backup.

## Backup del database

Il dump viene scritto dentro il container e poi copiato sull'host (funziona uguale da PowerShell e da Git Bash, e non passa per la redirezione `>` di PowerShell, che cambierebbe la codifica del file):

```sh
docker compose -f compose.prod.yaml exec db sh -c 'mysqldump -uroot -p$MYSQL_ROOT_PASSWORD --single-transaction --routines --triggers --databases $MYSQL_DATABASE > /tmp/backup.sql'
docker compose -f compose.prod.yaml cp db:/tmp/backup.sql ./backup.sql
docker compose -f compose.prod.yaml exec db rm /tmp/backup.sql
```

Ripristino (sovrascrive le tabelle presenti nel dump):

```sh
docker compose -f compose.prod.yaml cp ./backup.sql db:/tmp/backup.sql
docker compose -f compose.prod.yaml exec db sh -c 'mysql -uroot -p$MYSQL_ROOT_PASSWORD < /tmp/backup.sql'
```

In Git Bash, se i percorsi `/tmp/...` vengono convertiti in percorsi Windows, anteponi `MSYS_NO_PATHCONV=1` al comando. Per il database di sviluppo basta usare `-f compose.dev.yaml`.
