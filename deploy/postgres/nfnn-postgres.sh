#!/bin/sh
# Starts the nfnn database with a password nobody has to type. On the first start it generates the
# password into $SECRETS_DIR/db-password (mode 600, root), where the backend and the backup read it.
# A database created earlier with another password (the old db.env) gets this one: before the real
# server starts, a private instance listening only on a temporary socket sets the role's password
# to the file's. $SECRETS_DIR/db-password.ready tells the backend and the backup that the role
# accepts the password; it is removed at every start and written once the password holds.
set -eu

SECRETS_DIR=${SECRETS_DIR:-/secrets}
PASSWORD_FILE="$SECRETS_DIR/db-password"
READY_FILE="$SECRETS_DIR/db-password.ready"
PGDATA=${PGDATA:-/var/lib/postgresql/data}
SYNC_SOCKET=/tmp/nfnn-password-sync

log() {
  echo "nfnn-postgres: $*"
}

if [ "${1:-}" != "postgres" ] || [ ! -d "$SECRETS_DIR" ]; then
  exec docker-entrypoint.sh "$@"
fi

rm -f "$READY_FILE"
if [ ! -s "$PASSWORD_FILE" ]; then
  (umask 077 && head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n' > "$PASSWORD_FILE.part")
  mv "$PASSWORD_FILE.part" "$PASSWORD_FILE"
  log "generated a new database password in $PASSWORD_FILE"
fi
chown root:root "$PASSWORD_FILE"
chmod 600 "$PASSWORD_FILE"
POSTGRES_PASSWORD=$(cat "$PASSWORD_FILE")
export POSTGRES_PASSWORD

if [ -s "$PGDATA/PG_VERSION" ]; then
  mkdir -p "$SYNC_SOCKET"
  chown postgres:postgres "$SYNC_SOCKET"
  chmod 700 "$SYNC_SOCKET"
  if gosu postgres pg_ctl -D "$PGDATA" -w -t 120 -l /tmp/nfnn-password-sync.log \
        -o "-c listen_addresses='' -c unix_socket_directories=$SYNC_SOCKET" start > /dev/null; then
    if printf '%s\n' "ALTER ROLE CURRENT_USER PASSWORD :'password';" \
        | gosu postgres psql -X -q -v ON_ERROR_STOP=1 -h "$SYNC_SOCKET" -U "${POSTGRES_USER:-postgres}" \
            -d "${POSTGRES_DB:-${POSTGRES_USER:-postgres}}" -v password="$POSTGRES_PASSWORD" > /dev/null; then
      touch "$READY_FILE"
      log "the database role uses the password from $PASSWORD_FILE"
    else
      log "could not set the database role's password; the backend and the backup wait until it is set"
    fi
    gosu postgres pg_ctl -D "$PGDATA" -m fast -w stop > /dev/null
  else
    log "the database did not start for the password check:"
    cat /tmp/nfnn-password-sync.log || true
  fi
  rm -rf "$SYNC_SOCKET"
else
  touch "$READY_FILE"
  log "a new database is created with the password from $PASSWORD_FILE"
fi

exec docker-entrypoint.sh "$@"
