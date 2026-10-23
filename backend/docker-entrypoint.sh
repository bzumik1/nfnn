#!/bin/sh
# Starts as root only to give the log folder to the app user, then drops to that user for Java.
# Waits while a dump is waiting in the restore folder or a restore has failed: the backup container
# restores the dump into the empty database first and renames it to .done, and only then may
# Liquibase run. A .failed file keeps the backend down on purpose, so a failed restore never turns
# into a fresh empty database; the operator removes the file or puts a good dump in its place.
# With the secrets folder mounted, it generates the access-token signing key and the key that
# encrypts stored settings on the first start, waits until nfnn-postgres has the database password
# ready and hands all three to Java as JWT_SECRET, SETTINGS_KEY and DB_PASSWORD (variables set by
# the environment win).
set -eu

LOG_DIR=${LOG_DIR:-/logs}
SECRETS_DIR=${SECRETS_DIR:-/secrets}

generate_secret() {
  if [ ! -s "$SECRETS_DIR/$1" ]; then
    (umask 077 && head -c 32 /dev/urandom | base64 | tr -d '\n' > "$SECRETS_DIR/$1.part")
    mv "$SECRETS_DIR/$1.part" "$SECRETS_DIR/$1"
    echo "Generated $SECRETS_DIR/$1"
  fi
  chmod 600 "$SECRETS_DIR/$1"
}

if [ "$(id -u)" = 0 ]; then
  mkdir -p "$LOG_DIR" 2>/dev/null || true
  chown app:app "$LOG_DIR" 2>/dev/null || chmod 1777 "$LOG_DIR" 2>/dev/null || echo "Could not make $LOG_DIR writable for the app user; the log file will not be written"
  if [ -d "$SECRETS_DIR" ]; then
    generate_secret jwt-secret
    generate_secret settings-key
    JWT_SECRET=${JWT_SECRET:-$(cat "$SECRETS_DIR/jwt-secret")}
    SETTINGS_KEY=${SETTINGS_KEY:-$(cat "$SECRETS_DIR/settings-key")}
    export JWT_SECRET SETTINGS_KEY
    if [ -z "${DB_PASSWORD:-}" ]; then
      waited=0
      until [ -f "$SECRETS_DIR/db-password.ready" ] && [ -s "$SECRETS_DIR/db-password" ]; do
        if [ $((waited % 60)) -eq 0 ]; then
          echo "Waiting for nfnn-postgres to set the database password in $SECRETS_DIR (waited ${waited}s)"
        fi
        sleep 5
        waited=$((waited + 5))
      done
      DB_PASSWORD=$(cat "$SECRETS_DIR/db-password")
      export DB_PASSWORD
    fi
  fi
  exec setpriv --reuid=app --regid=app --clear-groups "$0" "$@"
fi

RESTORE_DIR=${RESTORE_DIR:-/restore}
waited=0
while [ -d "$RESTORE_DIR" ] && [ -n "$(find "$RESTORE_DIR" -maxdepth 1 \( -name '*.dump' -o -name '*.dump.failed' \) -print -quit 2>/dev/null)" ]; do
  if [ $((waited % 60)) -eq 0 ]; then
    echo "A dump is waiting in $RESTORE_DIR or a restore failed; the backend starts once the backup container has restored it and no .failed file is left (waited ${waited}s)"
  fi
  sleep 5
  waited=$((waited + 5))
done

exec java --enable-native-access=ALL-UNNAMED -jar /app/app.jar
