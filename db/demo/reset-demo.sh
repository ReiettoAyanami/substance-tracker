#!/usr/bin/env bash
# Dev only. Recreates the demo database substance_tracker_demo from scratch and fills it with
# varied data through the API (db/demo/fill-demo.mjs). Run from the project root, with the dev
# stack up (Git Bash is fine on Windows):
#   db/demo/reset-demo.sh           drop, recreate, migrate, fill
#   db/demo/reset-demo.sh --empty   drop, recreate, migrate, leave it empty
# The dev API must already point at the demo database (API_DB_NAME=substance_tracker_demo in .env,
# then `docker compose -f compose.dev.yaml up -d api`): otherwise the script stops before doing
# anything, so it can never touch substance_tracker or the test database.
# A fresh database and fixed dates: running it twice gives the same data, with the same ids.

set -euo pipefail
export MSYS_NO_PATHCONV=1 # Git Bash: do not rewrite arguments that look like paths

DEMO_DB=substance_tracker_demo
COMPOSE=(docker compose -f compose.dev.yaml)

empty=false
case "${1:-}" in
  '') ;;
  --empty) empty=true ;;
  *) echo "usage: db/demo/reset-demo.sh [--empty]" >&2; exit 2 ;;
esac

[ -f compose.dev.yaml ] || { echo "Run this from the project root" >&2; exit 1; }

# 1. Safety: the api container must be configured for the demo database.
api_container=$("${COMPOSE[@]}" ps -a -q api)
[ -n "$api_container" ] || { echo "No api container: start the dev stack first" >&2; exit 1; }
api_db=$(docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' "$api_container" | sed -n 's/^DB_NAME=//p' | tr -d '\r')
if [ "$api_db" != "$DEMO_DB" ]; then
  echo "The dev API uses '$api_db', not '$DEMO_DB'. Nothing done." >&2
  echo "Set API_DB_NAME=$DEMO_DB in .env, run 'docker compose -f compose.dev.yaml up -d api', retry." >&2
  exit 1
fi

# 2. Drop and recreate it as root, inside the db container (the password never leaves it).
db_user=$("${COMPOSE[@]}" exec -T db printenv MYSQL_USER | tr -d '\r')
echo "Recreating $DEMO_DB (drop + create + grant to '$db_user')"
"${COMPOSE[@]}" exec -T db sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql -uroot' <<SQL
DROP DATABASE IF EXISTS \`$DEMO_DB\`;
CREATE DATABASE \`$DEMO_DB\`;
GRANT ALL PRIVILEGES ON \`$DEMO_DB\`.* TO '$db_user'@'%';
SQL

# 3. Restart the API: it applies the migrations at startup, before it starts listening.
echo "Restarting api (migrations run at startup)"
"${COMPOSE[@]}" restart api >/dev/null 2>&1
health="fetch('http://localhost:3000/api/health').then(r => r.json())
  .then(b => process.exit(b.status === 'ok' && b.db === 'ok' ? 0 : 1), () => process.exit(1))"
for _ in $(seq 1 60); do
  if "${COMPOSE[@]}" exec -T api node -e "$health" 2>/dev/null; then break; fi
  sleep 2
done
"${COMPOSE[@]}" exec -T api node -e "$health" 2>/dev/null || { echo "The API did not come up: docker compose -f compose.dev.yaml logs api" >&2; exit 1; }

# 4. Fill it through the API (Node inside the api container: nothing needed on the host).
if $empty; then
  echo "Done: $DEMO_DB is empty (--empty)"
else
  "${COMPOSE[@]}" exec -T api node --input-type=module - < db/demo/fill-demo.mjs
  echo "Done: $DEMO_DB filled"
fi
