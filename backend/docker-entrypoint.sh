#!/bin/sh
# Starts as root only to give the log folder to the app user, then drops to that user for Java.
# Waits while a restore is due or running, so Liquibase never runs before it: a dump in the restore
# folder (restored when the backup container starts), a restore request from the administration or
# the first setup, or the backup container's restore.running marker. A request the backup container
# has not taken within five minutes is dropped, so the site comes back with the data it had.
# With the secrets folder mounted, it generates the access-token signing key and the key that
# encrypts stored settings on the first start, waits until nfnn-postgres has the password of the
# application role novanadeje_app ready and hands all three to Java as JWT_SECRET, SETTINGS_KEY and
# DB_PASSWORD (variables set by the environment win). The superuser's password stays with the
# database and the backup.
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
  if [ -d "${RESTORE_DIR:-/restore}" ]; then
    chown app:app "${RESTORE_DIR:-/restore}" 2>/dev/null || echo "Could not make ${RESTORE_DIR:-/restore} writable for the app user; a backup cannot be uploaded in the first setup"
  fi
  if [ -d "$SECRETS_DIR" ]; then
    generate_secret jwt-secret
    generate_secret settings-key
    JWT_SECRET=${JWT_SECRET:-$(cat "$SECRETS_DIR/jwt-secret")}
    SETTINGS_KEY=${SETTINGS_KEY:-$(cat "$SECRETS_DIR/settings-key")}
    export JWT_SECRET SETTINGS_KEY
    if [ -z "${DB_PASSWORD:-}" ]; then
      waited=0
      until [ -f "$SECRETS_DIR/db-password.ready" ] && [ -s "$SECRETS_DIR/db-app-password" ]; do
        if [ $((waited % 60)) -eq 0 ]; then
          echo "Waiting for nfnn-postgres to set the database password in $SECRETS_DIR (waited ${waited}s)"
        fi
        sleep 5
        waited=$((waited + 5))
      done
      DB_PASSWORD=$(cat "$SECRETS_DIR/db-app-password")
      export DB_PASSWORD
    fi
  fi
  exec setpriv --reuid=app --regid=app --clear-groups "$0" "$@"
fi

RESTORE_DIR=${RESTORE_DIR:-/restore}
REQUESTS_DIR=${REQUESTS_DIR:-/backups/requests}
RUNNING_FILE=${RESTORE_RUNNING_FILE:-/backups/status/restore.running}
REQUEST_PATIENCE_MINUTES=${REQUEST_PATIENCE_MINUTES:-5}

restore_due() {
  [ -f "$RUNNING_FILE" ] && return 0
  [ -d "$REQUESTS_DIR" ] && [ -n "$(find "$REQUESTS_DIR" -maxdepth 1 -name '*.restore' -print -quit 2>/dev/null)" ] && return 0
  [ -d "$RESTORE_DIR" ] && [ -n "$(find "$RESTORE_DIR" -maxdepth 1 -name '*.dump' -print -quit 2>/dev/null)" ] && return 0
  return 1
}

waited=0
while restore_due; do
  if [ ! -f "$RUNNING_FILE" ] && [ -d "$REQUESTS_DIR" ]; then
    for stale in $(find "$REQUESTS_DIR" -maxdepth 1 -name '*.restore' -mmin +"$REQUEST_PATIENCE_MINUTES" 2>/dev/null); do
      rm -f "$stale"
      echo "The backup container did not take the restore request $(basename "$stale") within $REQUEST_PATIENCE_MINUTES minutes; starting with the current data"
    done
  fi
  if [ $((waited % 60)) -eq 0 ]; then
    echo "A restore is due or running; the backend starts once the backup container has finished it (waited ${waited}s)"
  fi
  sleep 5
  waited=$((waited + 5))
done

exec java --enable-native-access=ALL-UNNAMED -jar /app/app.jar
