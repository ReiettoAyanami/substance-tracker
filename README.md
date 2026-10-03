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
- Utenti: ogni pagina e ogni chiamata a `/api` vuole un utente collegato. Quando il database non ha ancora un amministratore, l'API lo crea all'avvio: `lenzi` (`ADMIN_USERNAME`, `ADMIN_EMAIL` per cambiarli), con una password generata scritta in `to_delete.password.txt` nella root del progetto (ignorato da git). Accedi, poi cancella il file.

### Database demo

Mentre si costruisce il frontend, l'API di sviluppo usa `substance_tracker_demo`, un database usa-e-getta con dati vari, al posto di `substance_tracker`. Serve la riga `API_DB_NAME=substance_tracker_demo` nel `.env`: la legge solo il servizio `api`, mentre `DB_NAME` e il database dei test non cambiano.

```sh
# Una volta sola, dopo aver aggiunto API_DB_NAME al .env
docker compose -f compose.dev.yaml up -d api

# Ricrea il database demo da zero e lo riempie tramite l'API (Git Bash)
bash db/demo/reset-demo.sh

# Lo stesso, ma lo lascia vuoto (per vedere la home vuota)
bash db/demo/reset-demo.sh --empty
```

- Lo script fa `DROP DATABASE substance_tracker_demo` a ogni esecuzione. Non tocca mai `substance_tracker` né `substance_tracker_test`: se l'API non punta al database demo si ferma senza fare nulla.
- Lanciato due volte dà gli stessi dati con gli stessi id: le date sono fisse e il database è nuovo. Cambiano solo i timbri di registrazione (`createdAt`, `deactivatedAt`, `archivedAt`).
- I dati sono in `db/demo/fill-demo.mjs`: 7 sostanze, una per ogni caso da vedere sulla card (molti lotti, segmenti minuscoli, ultimo lotto finito, decimali, scorta 0 con consumi one-time, nessun lotto, nome e prezzo enormi, sostanza archiviata). In fondo, i consumi per la pagina consumi (43 in tutto): oltre 20 per le Sigarette (quattro pacchetti a luglio, finiti), una one-time a 0 €, un consumo annullato, qualche nota.
- Per tornare al database di sviluppo: togli `API_DB_NAME` dal `.env` e `docker compose -f compose.dev.yaml up -d api`.

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
#    (APP_URL), il segreto delle sessioni (AUTH_SECRET) e il primo amministratore (ADMIN_USERNAME).
#    Senza uno di questi compose si rifiuta di partire.
cp .env.example .env    # poi modifica .env

# 2. Build dell'immagine (Angular + API) e avvio
docker compose -f compose.prod.yaml up -d --build

# 3. Stato e log
docker compose -f compose.prod.yaml ps
docker compose -f compose.prod.yaml logs -f app

# 4. Aggiornamento dopo un git pull
docker compose -f compose.prod.yaml up -d --build

# 5. Stop (i dati restano nel volume)
docker compose -f compose.prod.yaml down
```

L'app risponde su `http://localhost:8080` (`APP_PORT`), e si apre da `APP_URL`: da un altro indirizzo l'accesso viene rifiutato.

### Primo avvio: l'amministratore

Al primo avvio, quando il database non ha amministratori, l'API crea `ADMIN_USERNAME` (permanente: è l'indirizzo delle sue pagine) con l'email `ADMIN_EMAIL` e una password generata, scritta in `to_delete.password.txt` accanto a `compose.prod.yaml`. Accedi con quelle credenziali, poi cancella il file: la password si cambia da Settings. Il log (`docker compose -f compose.prod.yaml logs app`) dice dove l'ha scritta, mai la password.

Se il file non si può scrivere (su Linux la cartella deve essere scrivibile dall'utente 1000 del container), l'amministratore c'è comunque e il log lo dice: gli si dà una password con `docker compose -f compose.prod.yaml exec app node dist/cli.js reset-password <username>`, che la stampa una volta sola.

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
