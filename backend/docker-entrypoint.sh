#!/bin/sh
# Waits while a dump is waiting in the restore folder or a restore has failed: the backup container
# restores the dump into the empty database first and renames it to .done, and only then may
# Liquibase run. A .failed file keeps the backend down on purpose, so a failed restore never turns
# into a fresh empty database; the operator removes the file or puts a good dump in its place.
set -eu

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
