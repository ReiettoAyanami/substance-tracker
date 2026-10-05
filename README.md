# substance-tracker

A personal, mobile-first web app to log purchases (batches) and consumptions of any substance that has a unit, and see how much is left, how fast it goes and what it costs. Multi-user, with an Android app.

MySQL 8.4 · Node 22 API with Fastify (`api/`) · Angular 21 (`web/`) · everything runs in Docker.

All you need is **Docker with Compose v2**. No Node on the host.

## Install

```sh
git clone https://github.com/ReiettoAyanami/substance-tracker.git
cd substance-tracker
cp .env.example .env
```

In `.env`, set at least:

| Variable | What |
|---|---|
| `MYSQL_ROOT_PASSWORD`, `DB_PASSWORD` | long passwords, letters and digits only |
| `AUTH_SECRET` | `openssl rand -base64 32` |
| `APP_URL` | the address you open the app at (see below) |
| `APP_VERSION` | optional: a specific version (`a26.0.0`); unset, the latest release |

Then:

```sh
docker compose -f compose.prod.yaml pull
docker compose -f compose.prod.yaml up -d
```

The app listens on port `8080` (`APP_PORT`).

## First sign-in

On the first start the app creates the administrator `admin`, with a generated password written to `to_delete.password.txt` in the project folder.

1. Open the app at `APP_URL` and sign in as `admin` with that password.
2. Delete the file and change the password in **Settings**.

If the file is not there (the log says so), generate a new password:

```sh
docker compose -f compose.prod.yaml exec app node dist/cli.js reset-password admin
```

## The app's address (`APP_URL`)

Signing in works **only** from the address in `APP_URL`, exactly as it appears in the browser's address bar. From any other address you get *"Signing in works only from the address of the app"*.

| How you use it | `APP_URL` |
|---|---|
| from this PC only | `http://localhost:8080` |
| from your phone and other devices on the network | `http://<PC's IP>:8080`, and use that address on the PC too |
| behind a domain | `https://tracker.example.com` |

After changing it: `docker compose -f compose.prod.yaml up -d`.

## Update

```sh
docker compose -f compose.prod.yaml pull
docker compose -f compose.prod.yaml up -d
```

The database migrates itself on start. Take a backup first.

## Backup and restore

```sh
# Backup -> ./backup.sql
docker compose -f compose.prod.yaml exec db sh -c 'mysqldump -uroot -p$MYSQL_ROOT_PASSWORD --single-transaction --routines --triggers --databases $MYSQL_DATABASE > /tmp/backup.sql'
docker compose -f compose.prod.yaml cp db:/tmp/backup.sql ./backup.sql
docker compose -f compose.prod.yaml exec db rm /tmp/backup.sql

# Restore from ./backup.sql
docker compose -f compose.prod.yaml cp ./backup.sql db:/tmp/backup.sql
docker compose -f compose.prod.yaml exec db sh -c 'mysql -uroot -p$MYSQL_ROOT_PASSWORD < /tmp/backup.sql'
```

> **Never run `docker compose -f compose.prod.yaml down -v`**: `-v` deletes the database.

## Android app

Download the APK from the [releases page](https://github.com/ReiettoAyanami/substance-tracker/releases) or from your instance at `/download/substance.apk`, install it, and enter your server's address on first launch. The app only accepts **https** servers: with an `http://` instance, use the browser on your phone. Requires Android 7.0 or later.

## Useful commands

```sh
docker compose -f compose.prod.yaml ps            # status
docker compose -f compose.prod.yaml logs -f app   # logs
docker compose -f compose.prod.yaml down          # stop (data is kept)
```

## Development

```sh
cp .env.example .env
docker compose -f compose.dev.yaml up -d                                 # db, api, web
docker compose -f compose.dev.yaml exec api npm test                     # API tests
docker compose -f compose.dev.yaml exec web npx ng test --watch=false    # web tests
```

The site is at `http://localhost:4200`, the API at `http://localhost:3001/api/health`. Changes start from the `dev` branch.
