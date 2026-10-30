#!/bin/sh
# Starts as root only to give the log folder to the app user, then drops to that user for Java.
# Waits while a restore is due or running, so Liquibase never runs before it: a dump in the restore
# folder (restored when the backup container starts), a restore request from the administration or
# the first setup, or the backup container's restore.running marker. A request the backup container
# has not taken within five minutes is dropped, so the site comes back with the data it had.
# With the secrets folder mounted, it generates the access-token signing key, the key that encrypts
# stored settings, the age key that encrypts the backups and the Ed25519 seed that signs the
# verification QR codes on receipts on the first start, waits until nfnn-postgres has the password
# of the application role novanadeje_app ready and hands them to Java as JWT_SECRET, SETTINGS_KEY,
# BACKUP_KEY, RECEIPT_SIGNING_KEY and DB_PASSWORD (variables set by the environment win). The seed
# never leaves secrets/, which no backup holds: a new server signs with a new key of its own.
# After a restore of a backup uploaded in the first setup with its own key, the backup container
# leaves that key as /restore/backup-key.adopt and records its public recipient in
# /backups/status/adopted-key, which this container mounts read-only; once the restore is over the
# key replaces the generated backup key only when it matches that record (the previous key is kept
# as backup-key.replaced-<time>), so the backups made before and after the restore open with the
# same key and the app user, who can write to /restore, cannot plant a key of its own.
# The superuser's password stays with the database and the backup.
# Java starts only once the database named in DB_URL accepts TCP connections, for at most
# DATABASE_PATIENCE_SECONDS (two minutes; then it starts anyway and fails as before): nfnn-postgres
# marks the passwords ready before a new database is even created, and neither that initialisation
# nor its password check on an existing database listens on TCP, so an open port means the server
# the backend will use, and the backend does not stop and restart on a fresh install.
set -eu

LOG_DIR=${LOG_DIR:-/logs}
SECRETS_DIR=${SECRETS_DIR:-/secrets}
RESTORE_DIR=${RESTORE_DIR:-/restore}
REQUESTS_DIR=${REQUESTS_DIR:-/backups/requests}
RUNNING_FILE=${RESTORE_RUNNING_FILE:-/backups/status/restore.running}
REQUEST_PATIENCE_MINUTES=${REQUEST_PATIENCE_MINUTES:-5}
BACKUP_KEY_FILE="$SECRETS_DIR/backup-key"
ADOPTED_BACKUP_KEY="$RESTORE_DIR/backup-key.adopt"
ADOPTED_KEY_RECORD=${ADOPTED_KEY_RECORD:-/backups/status/adopted-key}
DATABASE_PATIENCE_SECONDS=${DATABASE_PATIENCE_SECONDS:-120}

generate_secret() {
  if [ ! -s "$SECRETS_DIR/$1" ]; then
    (umask 077 && head -c 32 /dev/urandom | base64 | tr -d '\n' > "$SECRETS_DIR/$1.part")
    mv "$SECRETS_DIR/$1.part" "$SECRETS_DIR/$1"
    echo "Generated $SECRETS_DIR/$1"
  fi
  chmod 600 "$SECRETS_DIR/$1"
}

generate_backup_key() {
  if [ ! -s "$BACKUP_KEY_FILE" ]; then
    rm -f "$BACKUP_KEY_FILE.part"
    (umask 077 && age-keygen -o "$BACKUP_KEY_FILE.part" 2> /dev/null)
    mv "$BACKUP_KEY_FILE.part" "$BACKUP_KEY_FILE"
    echo "Generated $BACKUP_KEY_FILE"
  fi
  chmod 600 "$BACKUP_KEY_FILE"
}

adopt_backup_key() {
  [ -f "$ADOPTED_BACKUP_KEY" ] || return 0
  candidate=$(umask 077 && mktemp "$SECRETS_DIR/backup-key.adopt.XXXXXX")
  head -c 200 "$ADOPTED_BACKUP_KEY" 2>/dev/null | grep -m 1 '^AGE-SECRET-KEY-' > "$candidate" || true
  setpriv --reuid=app --regid=app --clear-groups rm -f "$ADOPTED_BACKUP_KEY" 2>/dev/null || rm -f "$ADOPTED_BACKUP_KEY" 2>/dev/null \
    || echo "Could not remove $ADOPTED_BACKUP_KEY; it is checked again at the next start"
  recorded=$(sed -n 's/^recipient=//p' "$ADOPTED_KEY_RECORD" 2>/dev/null | head -n 1)
  recipient=$(age-keygen -y "$candidate" 2>/dev/null || true)
  if [ -z "$recipient" ]; then
    echo "The backup key left by the restore is not a valid age key; the server keeps its own"
  elif [ "$recipient" != "$recorded" ]; then
    echo "WARNING: the backup key left in $RESTORE_DIR is not the one the backup container recorded after a restore; the server keeps its own"
  elif [ "$recipient" = "$(age-keygen -y "$BACKUP_KEY_FILE" 2>/dev/null || true)" ]; then
    echo "The backup key left by the restore is already the server's backup key"
  else
    replaced="$BACKUP_KEY_FILE.replaced-$(date -u +%Y%m%dT%H%M%SZ)"
    cp -p "$BACKUP_KEY_FILE" "$replaced"
    chmod 600 "$replaced"
    mv "$candidate" "$BACKUP_KEY_FILE"
    chmod 600 "$BACKUP_KEY_FILE"
    echo "WARNING: the backup key entered with the restored backup is now the server's backup key; the previous one is kept as $replaced"
  fi
  rm -f "$candidate"
}

restore_due() {
  [ -f "$RUNNING_FILE" ] && return 0
  [ -d "$REQUESTS_DIR" ] && [ -n "$(find "$REQUESTS_DIR" -maxdepth 1 -name '*.restore' -print -quit 2>/dev/null)" ] && return 0
  [ -d "$RESTORE_DIR" ] && [ -n "$(find "$RESTORE_DIR" -maxdepth 1 \( -name '*.dump' -o -name '*.dump.age' \) -print -quit 2>/dev/null)" ] && return 0
  return 1
}

wait_while_restore_due() {
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
}

database_address() {
  address=${DB_URL:-}
  case "$address" in jdbc:postgresql://*) ;; *) return 1 ;; esac
  address=${address#jdbc:postgresql://}
  address=${address%%[/?]*}
  case "$address" in ''|*,*|\[*) return 1 ;; esac
  DATABASE_HOST=${address%%:*}
  DATABASE_PORT=${address#"$DATABASE_HOST"}
  DATABASE_PORT=${DATABASE_PORT#:}
  DATABASE_PORT=${DATABASE_PORT:-5432}
}

wait_for_database() {
  database_address || return 0
  started=$(date +%s)
  logged=-60
  until timeout 2 bash -c 'exec 3<>"/dev/tcp/$0/$1"' "$DATABASE_HOST" "$DATABASE_PORT" 2>/dev/null; do
    waited=$(($(date +%s) - started))
    if [ "$waited" -ge "$DATABASE_PATIENCE_SECONDS" ]; then
      echo "The database at $DATABASE_HOST:$DATABASE_PORT accepted no connection within ${DATABASE_PATIENCE_SECONDS}s; starting anyway"
      return 0
    fi
    if [ $((waited - logged)) -ge 60 ]; then
      echo "Waiting for the database at $DATABASE_HOST:$DATABASE_PORT to accept connections (waited ${waited}s)"
      logged=$waited
    fi
    sleep 1
  done
}

if [ "$(id -u)" = 0 ]; then
  mkdir -p "$LOG_DIR" 2>/dev/null || true
  chown app:app "$LOG_DIR" 2>/dev/null || chmod 1777 "$LOG_DIR" 2>/dev/null || echo "Could not make $LOG_DIR writable for the app user; the log file will not be written"
  if [ -d "$RESTORE_DIR" ]; then
    chown app:app "$RESTORE_DIR" 2>/dev/null || echo "Could not make $RESTORE_DIR writable for the app user; a backup cannot be uploaded in the first setup"
  fi
  if [ -d "$SECRETS_DIR" ]; then
    generate_secret jwt-secret
    generate_secret settings-key
    generate_secret receipt-signing-key
    generate_backup_key
  fi
  wait_while_restore_due
  if [ -d "$SECRETS_DIR" ]; then
    adopt_backup_key
    JWT_SECRET=${JWT_SECRET:-$(cat "$SECRETS_DIR/jwt-secret")}
    SETTINGS_KEY=${SETTINGS_KEY:-$(cat "$SECRETS_DIR/settings-key")}
    BACKUP_KEY=${BACKUP_KEY:-$(grep -m 1 '^AGE-SECRET-KEY-' "$BACKUP_KEY_FILE" || true)}
    RECEIPT_SIGNING_KEY=${RECEIPT_SIGNING_KEY:-$(cat "$SECRETS_DIR/receipt-signing-key")}
    export JWT_SECRET SETTINGS_KEY BACKUP_KEY RECEIPT_SIGNING_KEY
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

wait_while_restore_due
wait_for_database

exec java --enable-native-access=ALL-UNNAMED -jar /app/app.jar
