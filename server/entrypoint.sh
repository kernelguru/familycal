#!/bin/sh
set -e
PB=/pb/pocketbase
DATA=/pb/pb_data
ARGS="--dir=$DATA --hooksDir=/pb/pb_hooks --migrationsDir=/pb/pb_migrations"

# Läuft der Container als root, Rechte des Datenordners korrigieren und
# PocketBase als unprivilegierten Nutzer starten.
RUN_AS=""
if [ "$(id -u)" = "0" ]; then
  PUID="${PUID:-1000}"
  PGID="${PGID:-1000}"
  mkdir -p "$DATA"
  if [ "$(stat -c %u:%g "$DATA")" != "$PUID:$PGID" ] || [ -n "$(find "$DATA" \! -user "$PUID" -print -quit 2>/dev/null)" ]; then
    echo "Setze Besitzer von $DATA auf $PUID:$PGID"
    chown -R "$PUID:$PGID" "$DATA"
  fi
  RUN_AS="su-exec $PUID:$PGID"
fi

if [ ! -w "$DATA" ] && [ -z "$RUN_AS" ]; then
  echo "FEHLER: $DATA ist nicht beschreibbar. Auf dem Host ausführen: chown -R $(id -u):$(id -g) ./pb_data" >&2
  exit 1
fi

# Optional: Settings (z. B. SMTP-Passwort) verschlüsselt ablegen. 32 Zeichen.
if [ -n "$PB_ENCRYPTION_KEY" ]; then
  ARGS="$ARGS --encryptionEnv=PB_ENCRYPTION_KEY"
fi

# Optional: Superuser beim Start anlegen/aktualisieren
if [ -n "$PB_ADMIN_EMAIL" ] && [ -n "$PB_ADMIN_PASSWORD" ]; then
  $RUN_AS $PB superuser upsert "$PB_ADMIN_EMAIL" "$PB_ADMIN_PASSWORD" $ARGS || echo "WARN: superuser upsert fehlgeschlagen"
fi

exec $RUN_AS $PB serve --http=0.0.0.0:8090 $ARGS
