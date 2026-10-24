#!/bin/sh
# Starts the nfnn database with passwords nobody has to type. On the first start it generates the
# superuser's password into $SECRETS_DIR/db-password (mode 600, root), which only the backup reads,
# and the password of the application role novanadeje_app into $SECRETS_DIR/db-app-password, which
# the backend reads: the backend is no superuser, so a hole in it cannot reach the server through
# the database. A new database gets the role from /docker-entrypoint-initdb.d/nfnn-app-role.sh.
# An existing one (or one with another password, the old db.env) is brought in line before the
# real server starts, by a private instance listening only on a temporary socket: it sets both
# passwords to the files', creates the role if missing and hands it the database, its schema and
# every table, view and sequence (own-by-app-role.sql; the backup does the same after a restore).
# $SECRETS_DIR/db-password.ready tells the backend and the backup that the roles accept the
# passwords; it is removed at every start and written once they hold.
set -eu

SECRETS_DIR=${SECRETS_DIR:-/secrets}
PASSWORD_FILE="$SECRETS_DIR/db-password"
APP_PASSWORD_FILE="$SECRETS_DIR/db-app-password"
READY_FILE="$SECRETS_DIR/db-password.ready"
PGDATA=${PGDATA:-/var/lib/postgresql/data}
SYNC_SOCKET=/tmp/nfnn-password-sync
INIT_PASSWORD_FILE=/tmp/nfnn-app-password
SQL_DIR=/usr/local/share/nfnn

log() {
  echo "nfnn-postgres: $*"
}

if [ "${1:-}" != "postgres" ] || [ ! -d "$SECRETS_DIR" ]; then
  exec docker-entrypoint.sh "$@"
fi

generate_password() {
  if [ ! -s "$1" ]; then
    (umask 077 && head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n' > "$1.part")
    mv "$1.part" "$1"
    log "generated a new database password in $1"
  fi
  chown root:root "$1"
  chmod 600 "$1"
}

sync_psql() {
  gosu postgres psql -X -q -v ON_ERROR_STOP=1 -h "$SYNC_SOCKET" -U "${POSTGRES_USER:-postgres}" "$@" > /dev/null
}

rm -f "$READY_FILE"
generate_password "$PASSWORD_FILE"
generate_password "$APP_PASSWORD_FILE"
POSTGRES_PASSWORD=$(cat "$PASSWORD_FILE")
export POSTGRES_PASSWORD

if [ -s "$PGDATA/PG_VERSION" ]; then
  mkdir -p "$SYNC_SOCKET"
  chown postgres:postgres "$SYNC_SOCKET"
  chmod 700 "$SYNC_SOCKET"
  if gosu postgres pg_ctl -D "$PGDATA" -w -t 120 -l /tmp/nfnn-password-sync.log \
        -o "-c listen_addresses='' -c unix_socket_directories=$SYNC_SOCKET" start > /dev/null; then
    if printf '%s\n' "ALTER ROLE CURRENT_USER PASSWORD :'password';" \
          | sync_psql -d postgres -v password="$POSTGRES_PASSWORD" \
        && sync_psql -d postgres -v app_password="$(cat "$APP_PASSWORD_FILE")" -f "$SQL_DIR/app-role.sql"; then
      if sync_psql -d "${POSTGRES_DB:-${POSTGRES_USER:-postgres}}" -f "$SQL_DIR/own-by-app-role.sql"; then
        log "the database belongs to the application role novanadeje_app"
      else
        log "could not hand the database to the application role novanadeje_app; the backend cannot change its tables"
      fi
      touch "$READY_FILE"
      log "the database roles use the passwords from $PASSWORD_FILE and $APP_PASSWORD_FILE"
    else
      log "could not set the database roles' passwords; the backend and the backup wait until they are set"
    fi
    gosu postgres pg_ctl -D "$PGDATA" -m fast -w stop > /dev/null
  else
    log "the database did not start for the password check:"
    cat /tmp/nfnn-password-sync.log || true
  fi
  rm -rf "$SYNC_SOCKET"
else
  (umask 077 && cat "$APP_PASSWORD_FILE" > "$INIT_PASSWORD_FILE")
  chown postgres:postgres "$INIT_PASSWORD_FILE"
  touch "$READY_FILE"
  log "a new database is created with the passwords from $PASSWORD_FILE and $APP_PASSWORD_FILE"
fi

exec docker-entrypoint.sh "$@"
