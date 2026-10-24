#!/bin/sh
# Runs once, when the stock entrypoint creates a new database: creates the application role with the
# password nfnn-postgres left in /tmp/nfnn-app-password and hands it the new database.
set -eu

password_file=/tmp/nfnn-app-password
[ -f "$password_file" ] || exit 0
psql -X -q -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres \
  -v app_password="$(cat "$password_file")" -f /usr/local/share/nfnn/app-role.sql > /dev/null
psql -X -q -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  -f /usr/local/share/nfnn/own-by-app-role.sql > /dev/null
rm -f "$password_file"
echo "nfnn-postgres: the new database belongs to the application role novanadeje_app"
