#!/bin/sh
# Backs the nfnn database up, restores a dump left in the restore folder and rehearses a restore
# once a week. Everything is reported in the container log, in $LOGS/backup.log and in key=value
# files under $BACKUPS/status, which the backend reads for the administration page.

set -u

BACKUPS=${BACKUPS_DIR:-/backups}
RESTORE=${RESTORE_DIR:-/restore}
BACKUP_TIME=${BACKUP_TIME:-03:00}
TEST_RESTORE_DAY=${TEST_RESTORE_DAY:-7}
TEST_RESTORE_TIME=${TEST_RESTORE_TIME:-04:00}
KEEP_DAYS=${KEEP_DAYS:-30}
TEST_DATABASE=${TEST_DATABASE:-nfnn_restore_test}
LOGS=${LOGS_DIR:-/logs}
POLL_SECONDS=10

STATUS="$BACKUPS/status"
REQUESTS="$BACKUPS/requests"

log() {
  log_line="$(date +%Y-%m-%dT%H:%M:%S%z) $*"
  echo "$log_line"
  if [ -d "$LOGS" ]; then
    echo "$log_line" >> "$LOGS/backup.log" 2>/dev/null || true
  fi
}

now_utc() {
  date -u +%Y-%m-%dT%H:%M:%SZ
}

write_status() {
  status_name=$1
  shift
  mkdir -p "$STATUS"
  : > "$STATUS/$status_name.part"
  for status_line in "$@"; do
    printf '%s\n' "$status_line" >> "$STATUS/$status_name.part"
  done
  mv "$STATUS/$status_name.part" "$STATUS/$status_name"
}

file_size() {
  stat -c %s "$1" 2>/dev/null || echo 0
}

wait_for_database() {
  until pg_isready --quiet; do
    sleep 5
  done
}

take_backup() {
  b_request=$2
  b_started=$(now_utc)
  b_name="nfnn-$(date +%Y-%m-%d_%H%M)$1.dump"
  if pg_dump --format=custom --compress=zstd:19 --file="$BACKUPS/nfnn.dump.part" 2> "$STATUS/backup.err"; then
    mv "$BACKUPS/nfnn.dump.part" "$BACKUPS/$b_name"
    write_status backup "outcome=ok" "started_at=$b_started" "finished_at=$(now_utc)" "file=$b_name" "size=$(file_size "$BACKUPS/$b_name")" "request=$b_request"
    log "backup written: $b_name"
    find "$BACKUPS" -maxdepth 1 -name 'nfnn-*.dump' -mtime "+$KEEP_DAYS" -delete
    return 0
  fi
  rm -f "$BACKUPS/nfnn.dump.part"
  b_error=$(tail -n 1 "$STATUS/backup.err" | tr -d '\n' | cut -c1-500)
  write_status backup "outcome=failed" "started_at=$b_started" "finished_at=$(now_utc)" "file=$b_name" "request=$b_request" "error=$b_error"
  log "backup failed: $b_error"
  return 1
}

test_restore() {
  t_request=$1
  t_started=$(now_utc)
  t_newest=$(ls -t "$BACKUPS"/nfnn-*.dump 2>/dev/null | head -n 1)
  if [ -z "$t_newest" ]; then
    write_status test-restore "outcome=failed" "started_at=$t_started" "finished_at=$(now_utc)" "request=$t_request" "error=no backup to restore"
    log "test restore failed: no backup to restore"
    return 1
  fi
  t_file=$(basename "$t_newest")
  dropdb --if-exists "$TEST_DATABASE" > /dev/null 2>&1
  if createdb "$TEST_DATABASE" 2> "$STATUS/test-restore.err" \
      && pg_restore --exit-on-error --single-transaction --dbname="$TEST_DATABASE" "$t_newest" 2>> "$STATUS/test-restore.err"; then
    t_tables=$(psql --dbname="$TEST_DATABASE" --tuples-only --no-align --command="select count(*) from information_schema.tables where table_schema = 'public'" 2>> "$STATUS/test-restore.err" | tr -d '[:space:]')
    dropdb --if-exists "$TEST_DATABASE" > /dev/null 2>&1
    if [ "${t_tables:-0}" -gt 0 ] 2>/dev/null; then
      write_status test-restore "outcome=ok" "started_at=$t_started" "finished_at=$(now_utc)" "file=$t_file" "size=$(file_size "$t_newest")" "tables=$t_tables" "request=$t_request"
      log "test restore of $t_file succeeded: $t_tables tables"
      return 0
    fi
    t_error="the restored database has no tables"
  else
    dropdb --if-exists "$TEST_DATABASE" > /dev/null 2>&1
    t_error=$(tail -n 1 "$STATUS/test-restore.err" | tr -d '\n' | cut -c1-500)
  fi
  write_status test-restore "outcome=failed" "started_at=$t_started" "finished_at=$(now_utc)" "file=$t_file" "request=$t_request" "error=$t_error"
  log "test restore of $t_file failed: $t_error"
  return 1
}

database_is_empty() {
  e_tables=$(psql --tuples-only --no-align --command="select count(*) from information_schema.tables where table_schema = 'public'" | tr -d '[:space:]')
  [ "${e_tables:-1}" = "0" ]
}

restore_from_folder() {
  [ -d "$RESTORE" ] || return 0
  set -- "$RESTORE"/*.dump
  [ -e "$1" ] || return 0
  r_started=$(now_utc)
  if [ $# -gt 1 ]; then
    for r_other in "$@"; do
      mv "$r_other" "$r_other.skipped"
    done
    write_status restore "outcome=failed" "started_at=$r_started" "finished_at=$(now_utc)" "file=$(basename "$1")" "error=more than one dump in the restore folder; put exactly one there"
    log "restore skipped: more than one dump in $RESTORE"
    return 1
  fi
  r_dump=$1
  r_file=$(basename "$r_dump")
  r_forced=0
  case "$r_file" in
    *.force.dump) r_forced=1 ;;
  esac
  if ! database_is_empty && [ "$r_forced" = 0 ]; then
    mv "$r_dump" "$r_dump.skipped"
    write_status restore "outcome=failed" "started_at=$r_started" "finished_at=$(now_utc)" "file=$r_file" "error=the database is not empty; name the file .force.dump to replace it"
    log "restore of $r_file skipped: the database is not empty"
    return 1
  fi
  log "restoring $r_file"
  if [ "$r_forced" = 1 ] && ! database_is_empty; then
    take_backup "-pred-obnovou" "" || return 1
  fi
  psql --quiet --no-align --tuples-only \
    --command="select pg_terminate_backend(pid) from pg_stat_activity where datname = current_database() and pid <> pg_backend_pid()" > /dev/null 2>&1
  if psql --quiet -v ON_ERROR_STOP=1 --command='drop schema public cascade' --command='create schema public' 2> "$STATUS/restore.err" \
      && pg_restore --exit-on-error --single-transaction --dbname="$PGDATABASE" "$r_dump" 2>> "$STATUS/restore.err"; then
    mv "$r_dump" "$r_dump.done"
    write_status restore "outcome=ok" "started_at=$r_started" "finished_at=$(now_utc)" "file=$r_file" "size=$(file_size "$r_dump.done")"
    log "restore of $r_file succeeded"
    return 0
  fi
  r_error=$(tail -n 1 "$STATUS/restore.err" | tr -d '\n' | cut -c1-500)
  mv "$r_dump" "$r_dump.failed"
  write_status restore "outcome=failed" "started_at=$r_started" "finished_at=$(now_utc)" "file=$r_file" "error=$r_error"
  log "restore of $r_file failed: $r_error"
  return 1
}

handle_requests() {
  for request in "$REQUESTS"/*.backup "$REQUESTS"/*.test-restore; do
    [ -e "$request" ] || continue
    id=$(basename "$request")
    rm -f "$request"
    case "$id" in
      *.backup) take_backup "-rucni" "${id%.backup}" ;;
      *.test-restore) test_restore "${id%.test-restore}" ;;
    esac
  done
}

mkdir -p "$STATUS" "$REQUESTS"
chmod 1777 "$REQUESTS"
rm -f "$REQUESTS"/*.backup "$REQUESTS"/*.test-restore
log "nfnn backup started: backups in $BACKUPS, restore folder $RESTORE, daily backup at $BACKUP_TIME, test restore on day $TEST_RESTORE_DAY at $TEST_RESTORE_TIME"

wait_for_database
restore_from_folder
take_backup "" ""

last_backup_day=""
last_test_day=""
while true; do
  sleep "$POLL_SECONDS"
  handle_requests
  today=$(date +%Y-%m-%d)
  if [ "$(date +%H:%M)" = "$BACKUP_TIME" ] && [ "$last_backup_day" != "$today" ]; then
    last_backup_day=$today
    take_backup "" ""
  fi
  if [ "$(date +%u)" = "$TEST_RESTORE_DAY" ] && [ "$(date +%H:%M)" = "$TEST_RESTORE_TIME" ] && [ "$last_test_day" != "$today" ]; then
    last_test_day=$today
    test_restore ""
  fi
done
