# substance-tracker

Web app personale (mobile first) per registrare acquisti (lotti) e consumi di qualsiasi sostanza con un'unità, e sapere quanto ne resta, quanto se ne consuma e quanto costa. Multiutente, con app Android.

MySQL 8.4 · API Node 22 + Fastify (`api/`) · Angular 21 (`web/`) · tutto in Docker.

Serve solo **Docker con Compose v2**. Node sull'host non serve.

## Installare

```sh
git clone https://github.com/ReiettoAyanami/substance-tracker.git
cd substance-tracker
cp .env.example .env
```

Nel `.env` imposta almeno:

| Variabile | Cosa |
|---|---|
| `MYSQL_ROOT_PASSWORD`, `DB_PASSWORD` | password lunghe, solo lettere e numeri |
| `AUTH_SECRET` | `openssl rand -base64 32` |
| `APP_URL` | l'indirizzo da cui apri l'app (vedi sotto) |
| `APP_VERSION` | facoltativa: una versione precisa (`a26.0.0`); senza, l'ultima release |

Poi:

```sh
docker compose -f compose.prod.yaml pull
docker compose -f compose.prod.yaml up -d
```

L'app risponde sulla porta `8080` (`APP_PORT`).

## Primo accesso

Al primo avvio viene creato l'amministratore `admin`, con una password generata e scritta in `to_delete.password.txt` nella cartella del progetto.

1. Apri l'app da `APP_URL` ed entra con `admin` e quella password.
2. Cancella il file e cambia la password da **Settings**.

Se il file non c'è (il log lo dice), genera una password nuova:

```sh
docker compose -f compose.prod.yaml exec app node dist/cli.js reset-password admin
```

## L'indirizzo dell'app (`APP_URL`)

Il login funziona **solo** dall'indirizzo scritto in `APP_URL`, uguale a quello nella barra del browser. Da un altro indirizzo compare *"Signing in works only from the address of the app"*.

| Come la usi | `APP_URL` |
|---|---|
| solo da questo PC | `http://localhost:8080` |
| da telefono e altri PC della rete | `http://<IP del PC>:8080`, e usa quell'indirizzo anche dal PC |
| dietro un dominio | `https://tracker.example.com` |

Dopo averlo cambiato: `docker compose -f compose.prod.yaml up -d`.

## Aggiornare

```sh
docker compose -f compose.prod.yaml pull
docker compose -f compose.prod.yaml up -d
```

Il database si aggiorna da solo all'avvio. Fai prima un backup.

## Backup e ripristino

```sh
# Backup -> ./backup.sql
docker compose -f compose.prod.yaml exec db sh -c 'mysqldump -uroot -p$MYSQL_ROOT_PASSWORD --single-transaction --routines --triggers --databases $MYSQL_DATABASE > /tmp/backup.sql'
docker compose -f compose.prod.yaml cp db:/tmp/backup.sql ./backup.sql
docker compose -f compose.prod.yaml exec db rm /tmp/backup.sql

# Ripristino da ./backup.sql
docker compose -f compose.prod.yaml cp ./backup.sql db:/tmp/backup.sql
docker compose -f compose.prod.yaml exec db sh -c 'mysql -uroot -p$MYSQL_ROOT_PASSWORD < /tmp/backup.sql'
```

> **Mai `docker compose -f compose.prod.yaml down -v`**: `-v` cancella il database.

## App Android

Scarica l'APK dalla [pagina delle release](https://github.com/ReiettoAyanami/substance-tracker/releases) o dalla tua istanza su `/download/substance.apk`, installalo e al primo avvio inserisci l'indirizzo del server. L'app accetta solo server **https**: con un'istanza `http://` dal telefono usa il browser. Serve Android 7.0 o più.

## Comandi utili

```sh
docker compose -f compose.prod.yaml ps            # stato
docker compose -f compose.prod.yaml logs -f app   # log
docker compose -f compose.prod.yaml down          # stop (i dati restano)
```

## Sviluppo

```sh
cp .env.example .env
docker compose -f compose.dev.yaml up -d                 # db, api, web
docker compose -f compose.dev.yaml exec api npm test     # test dell'API
docker compose -f compose.dev.yaml exec web npx ng test --watch=false   # test del web
```

Il sito è su `http://localhost:4200`, l'API su `http://localhost:3001/api/health`. Le modifiche partono dal ramo `dev`.
