#!/bin/sh
set -e
PB=/pb/pocketbase
ARGS="--dir=/pb/pb_data --hooksDir=/pb/pb_hooks --migrationsDir=/pb/pb_migrations"

# Optional: Settings (z. B. SMTP-Passwort) verschlüsselt ablegen. 32 Zeichen.
if [ -n "$PB_ENCRYPTION_KEY" ]; then
  ARGS="$ARGS --encryptionEnv=PB_ENCRYPTION_KEY"
fi

# Optional: Superuser beim Start anlegen/aktualisieren
if [ -n "$PB_ADMIN_EMAIL" ] && [ -n "$PB_ADMIN_PASSWORD" ]; then
  $PB superuser upsert "$PB_ADMIN_EMAIL" "$PB_ADMIN_PASSWORD" $ARGS || echo "WARN: superuser upsert fehlgeschlagen"
fi

exec $PB serve --http=0.0.0.0:8090 $ARGS
