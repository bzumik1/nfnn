#!/bin/sh
# Backs the nfnn database up, restores a dump left in the restore folder or asked for by the
# administration, and rehearses a restore once a week. A restore goes into a staging database first
# and replaces the live one by renaming only when it succeeded, after a -pred-obnovou backup, so a
# failed restore leaves the current data as they were. A restored database keeps every sequence (the
# receipt numbers) at the higher of its current and restored value, and a Liquibase lock caught in
# the dump is released. A restored database is handed to the application role novanadeje_app, as
# nfnn-postgres does at every start, because the backend logs in as that role and is no superuser.
# $BACKUPS/status/restore.running exists while one runs and the backend waits
# for it to go. Everything is reported in the container log, in $LOGS/backup.log and in key=value
# files under $BACKUPS/status, which the backend reads for the administration page.
# The database password is read from $SECRETS_DIR/db-password once nfnn-postgres marks it ready.
# The schedule is the one the backend writes to $BACKUPS/requests/schedule (chosen on /sprava/zalohy),
# read again on every pass; a missing or invalid value keeps the default below, and the schedule in
# use is reported in $BACKUPS/status/schedule.

set -u

BACKUPS=${BACKUPS_DIR:-/backups}
RESTORE=${RESTORE_DIR:-/restore}
DEFAULT_BACKUP_TIME=${BACKUP_TIME:-03:00}
DEFAULT_TEST_RESTORE_DAY=${TEST_RESTORE_DAY:-7}
DEFAULT_TEST_RESTORE_TIME=${TEST_RESTORE_TIME:-04:00}
BACKUP_TIME=""
TEST_RESTORE_DAY=""
TEST_RESTORE_TIME=""
KEEP_DAYS=${KEEP_DAYS:-30}
TEST_DATABASE=${TEST_DATABASE:-nfnn_restore_test}
STAGING_DATABASE=${STAGING_DATABASE:-nfnn_restore_staging}
RETIRED_DATABASE=${RETIRED_DATABASE:-nfnn_restore_retired}
OWNERSHIP_SQL=${OWNERSHIP_SQL:-/usr/local/share/nfnn/own-by-app-role.sql}
LOGS=${LOGS_DIR:-/logs}
SECRETS=${SECRETS_DIR:-/secrets}
POLL_SECONDS=10

STATUS="$BACKUPS/status"
REQUESTS="$BACKUPS/requests"
RUNNING="$STATUS/restore.running"
SCHEDULE="$REQUESTS/schedule"

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

reached() {
  [ "$(date +%H%M)" -ge "$(echo "$1" | tr -d :)" ]
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

read_database_password() {
  [ -n "${PGPASSWORD:-}" ] && return 0
  [ -d "$SECRETS" ] || return 0
  p_waited=0
  until [ -f "$SECRETS/db-password.ready" ] && [ -s "$SECRETS/db-password" ]; do
    if [ $((p_waited % 60)) -eq 0 ]; then
      log "waiting for the database password in $SECRETS (nfnn-postgres writes it; waited ${p_waited}s)"
    fi
    sleep 5
    p_waited=$((p_waited + 5))
  done
  PGPASSWORD=$(cat "$SECRETS/db-password")
  export PGPASSWORD
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
  while [ -e "$BACKUPS/$b_name" ]; do
    sleep 5
    b_name="nfnn-$(date +%Y-%m-%d_%H%M)$1.dump"
  done
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

dumped_rows() {
  pg_restore --data-only --table="$2" --file=- "$1" | awk '/^COPY /{copying=1; next} /^\\\.$/{copying=0} copying{rows++} END{print rows+0}'
}

compare_rows() {
  m_total=0
  m_mismatch=""
  for m_table in $(pg_restore --list "$1" | sed -n 's/^[0-9]*; [0-9]* [0-9]* TABLE DATA public \([^ ]*\) .*/\1/p'); do
    m_dumped=$(dumped_rows "$1" "$m_table" 2>> "$3")
    m_restored=$(psql --dbname="$2" --tuples-only --no-align --command="select count(*) from public.\"$m_table\"" 2>> "$3" | tr -d '[:space:]')
    if [ -z "$m_restored" ] || [ "$m_dumped" != "$m_restored" ]; then
      m_mismatch="$m_mismatch $m_table"
    else
      m_total=$((m_total + m_restored))
    fi
  done
  [ -z "$m_mismatch" ]
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
    t_changesets=$(applied_changesets "$TEST_DATABASE" "$STATUS/test-restore.err")
    t_rows_match=false
    if compare_rows "$t_newest" "$TEST_DATABASE" "$STATUS/test-restore.err"; then
      t_rows_match=true
    fi
    dropdb --if-exists "$TEST_DATABASE" > /dev/null 2>&1
    if [ "${t_tables:-0}" -gt 0 ] 2>/dev/null && [ "${t_changesets:-0}" -gt 0 ] 2>/dev/null && [ "$t_rows_match" = true ]; then
      write_status test-restore "outcome=ok" "started_at=$t_started" "finished_at=$(now_utc)" "file=$t_file" "size=$(file_size "$t_newest")" "tables=$t_tables" "request=$t_request"
      log "test restore of $t_file succeeded: $t_tables tables and $m_total rows, as many in every table as the backup holds"
      return 0
    fi
    if [ "$t_rows_match" = true ]; then
      t_error="the restored database has no tables or no applied changesets"
    else
      t_error="the restored database holds a different number of rows than the backup in:$m_mismatch"
    fi
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

server_psql() {
  psql --dbname=postgres --quiet --no-align --tuples-only -v ON_ERROR_STOP=1 "$@"
}

database_exists() {
  [ "$(server_psql --command="select count(*) from pg_database where datname = '$1'" 2>/dev/null | tr -d '[:space:]')" = 1 ]
}

allow_connections() {
  server_psql --command="alter database \"$PGDATABASE\" with allow_connections true" > /dev/null 2>&1
}

release_liquibase_lock() {
  psql --dbname="$1" --quiet --no-align --tuples-only -v ON_ERROR_STOP=1 \
    --command="do \$\$ begin if to_regclass('public.databasechangeloglock') is not null then update public.databasechangeloglock set locked = false, lockgranted = null, lockedby = null where locked; end if; end \$\$" > /dev/null 2>> "$2"
}

hand_to_app_role() {
  psql --dbname="$1" --quiet --no-align --tuples-only -v ON_ERROR_STOP=1 --file="$OWNERSHIP_SQL" > /dev/null 2>> "$2"
}

applied_changesets() {
  psql --dbname="$1" --tuples-only --no-align --command="select count(*) from public.databasechangelog" 2>> "$2" | tr -d '[:space:]'
}

recover_interrupted_restore() {
  rm -f "$RUNNING"
  if ! database_exists "$PGDATABASE" && database_exists "$RETIRED_DATABASE"; then
    server_psql --command="alter database \"$RETIRED_DATABASE\" rename to \"$PGDATABASE\"" > /dev/null
    log "an interrupted restore left the database renamed; it is back as $PGDATABASE"
  elif database_exists "$RETIRED_DATABASE"; then
    dropdb --if-exists "$RETIRED_DATABASE" > /dev/null 2>&1
  fi
  allow_connections
  dropdb --if-exists "$STAGING_DATABASE" > /dev/null 2>&1
  find "$RESTORE" -maxdepth 1 -name '*.upload.part' -delete 2>/dev/null
}

keep_sequences_ahead() {
  server_psql --command="alter database \"$RETIRED_DATABASE\" with allow_connections true" > /dev/null 2>> "$STATUS/restore.err" || return 1
  k_values=$(psql --dbname="$RETIRED_DATABASE" --quiet --no-align --tuples-only -v ON_ERROR_STOP=1 \
    --command="select coalesce(string_agg(format('(%L, %s)', sequencename, last_value), ', '), '') from pg_sequences where schemaname = 'public' and last_value is not null" 2>> "$STATUS/restore.err") || return 1
  [ -n "$k_values" ] || return 0
  psql --dbname="$STAGING_DATABASE" --quiet --no-align --tuples-only -v ON_ERROR_STOP=1 \
    --command="select setval(format('public.%I', s.sequencename)::regclass, v.last_value) from pg_sequences s join (values $k_values) as v (sequencename, last_value) on v.sequencename = s.sequencename where s.schemaname = 'public' and (s.last_value is null or s.last_value < v.last_value)" > /dev/null 2>> "$STATUS/restore.err"
}

swap_in_staging() {
  server_psql --command="alter database \"$PGDATABASE\" with allow_connections false" > /dev/null 2>> "$STATUS/restore.err" || return 1
  s_tries=0
  until server_psql --command="select pg_terminate_backend(pid) from pg_stat_activity where datname = '$PGDATABASE' and pid <> pg_backend_pid()" > /dev/null 2>&1 \
      && server_psql --command="alter database \"$PGDATABASE\" rename to \"$RETIRED_DATABASE\"" > /dev/null 2>> "$STATUS/restore.err"; do
    s_tries=$((s_tries + 1))
    if [ "$s_tries" -ge 30 ]; then
      allow_connections
      return 1
    fi
    sleep 1
  done
  if ! keep_sequences_ahead \
      || ! server_psql --command="alter database \"$STAGING_DATABASE\" rename to \"$PGDATABASE\"" > /dev/null 2>> "$STATUS/restore.err"; then
    server_psql --command="alter database \"$RETIRED_DATABASE\" rename to \"$PGDATABASE\"" > /dev/null 2>&1
    allow_connections
    return 1
  fi
  dropdb --if-exists "$RETIRED_DATABASE" > /dev/null 2>&1
  return 0
}

restore_dump() {
  r_dump=$1
  r_file=$2
  r_request=$3
  r_admin=$4
  r_started=$(now_utc)
  : > "$STATUS/restore.err"
  log "restoring $r_file"
  if ! database_is_empty && ! take_backup "-pred-obnovou" ""; then
    write_status restore "outcome=failed" "started_at=$r_started" "finished_at=$(now_utc)" "file=$r_file" "request=$r_request" "admin=$r_admin" "error=the safety backup of the current data failed, so nothing was restored"
    log "restore of $r_file not started: the safety backup failed"
    return 1
  fi
  dropdb --if-exists "$STAGING_DATABASE" > /dev/null 2>&1
  r_tables=0
  if createdb "$STAGING_DATABASE" 2>> "$STATUS/restore.err" \
      && pg_restore --exit-on-error --single-transaction --dbname="$STAGING_DATABASE" "$r_dump" 2>> "$STATUS/restore.err"; then
    r_tables=$(psql --dbname="$STAGING_DATABASE" --tuples-only --no-align --command="select count(*) from information_schema.tables where table_schema = 'public'" 2>> "$STATUS/restore.err" | tr -d '[:space:]')
    r_changesets=$(applied_changesets "$STAGING_DATABASE" "$STATUS/restore.err")
    if [ "${r_tables:-0}" -gt 0 ] 2>/dev/null && [ "${r_changesets:-0}" -gt 0 ] 2>/dev/null; then
      if release_liquibase_lock "$STAGING_DATABASE" "$STATUS/restore.err" \
          && hand_to_app_role "$STAGING_DATABASE" "$STATUS/restore.err" \
          && swap_in_staging; then
        write_status restore "outcome=ok" "started_at=$r_started" "finished_at=$(now_utc)" "file=$r_file" "size=$(file_size "$r_dump")" "tables=$r_tables" "request=$r_request" "admin=$r_admin"
        log "restore of $r_file succeeded: $r_tables tables"
        return 0
      fi
      r_error="the restored database could not replace the current one: $(tail -n 1 "$STATUS/restore.err" | tr -d '\n' | cut -c1-400)"
    else
      r_error="the backup holds no tables or no applied changesets, so it is not a backup of this site"
    fi
  else
    r_error=$(tail -n 1 "$STATUS/restore.err" | tr -d '\n' | cut -c1-500)
  fi
  dropdb --if-exists "$STAGING_DATABASE" > /dev/null 2>&1
  write_status restore "outcome=failed" "started_at=$r_started" "finished_at=$(now_utc)" "file=$r_file" "request=$r_request" "admin=$r_admin" "error=$r_error"
  log "restore of $r_file failed, the current data stay: $r_error"
  return 1
}

restore_from_folder() {
  [ -d "$RESTORE" ] || return 0
  set -- "$RESTORE"/*.dump
  [ -e "$1" ] || return 0
  f_started=$(now_utc)
  write_status restore.running "started_at=$f_started" "file=$(basename "$1")"
  if [ $# -gt 1 ]; then
    for f_other in "$@"; do
      mv "$f_other" "$f_other.skipped"
    done
    write_status restore "outcome=failed" "started_at=$f_started" "finished_at=$(now_utc)" "file=$(basename "$1")" "error=more than one dump in the restore folder; put exactly one there"
    log "restore skipped: more than one dump in $RESTORE"
    rm -f "$RUNNING"
    return 1
  fi
  f_dump=$1
  f_file=$(basename "$f_dump")
  case "$f_file" in
    *.force.dump) f_forced=1 ;;
    *) f_forced=0 ;;
  esac
  if [ "$f_forced" = 0 ] && ! database_is_empty; then
    mv "$f_dump" "$f_dump.skipped"
    write_status restore "outcome=failed" "started_at=$f_started" "finished_at=$(now_utc)" "file=$f_file" "error=the database is not empty; name the file .force.dump to replace it"
    log "restore of $f_file skipped: the database is not empty"
    rm -f "$RUNNING"
    return 1
  fi
  if restore_dump "$f_dump" "$f_file" "" ""; then
    mv "$f_dump" "$f_dump.done"
  else
    mv "$f_dump" "$f_dump.failed"
  fi
  rm -f "$RUNNING"
}

request_value() {
  sed -n "s/^$2=//p" "$1" | head -n 1 | tr -d '\r\n'
}

valid_time() {
  case "$1" in
    [01][0-9]:[0-5][0-9]|2[0-3]:[0-5][0-9]) return 0 ;;
  esac
  return 1
}

valid_day() {
  case "$1" in
    [1-7]) return 0 ;;
  esac
  return 1
}

planned_value() {
  if [ -f "$SCHEDULE" ]; then
    p_value=$(request_value "$SCHEDULE" "$1")
    if "$3" "$p_value"; then
      echo "$p_value"
      return
    fi
  fi
  echo "$2"
}

load_schedule() {
  l_backup_time=$(planned_value backup_time "$DEFAULT_BACKUP_TIME" valid_time)
  l_test_day=$(planned_value test_restore_day "$DEFAULT_TEST_RESTORE_DAY" valid_day)
  l_test_time=$(planned_value test_restore_time "$DEFAULT_TEST_RESTORE_TIME" valid_time)
  [ "$l_backup_time $l_test_day $l_test_time" = "$BACKUP_TIME $TEST_RESTORE_DAY $TEST_RESTORE_TIME" ] && return 0
  if [ -n "$BACKUP_TIME" ]; then
    if [ "$l_backup_time" != "$BACKUP_TIME" ] && ! reached "$l_backup_time"; then
      last_backup_day=""
    fi
    if [ "$l_test_day $l_test_time" != "$TEST_RESTORE_DAY $TEST_RESTORE_TIME" ] && ! reached "$l_test_time"; then
      last_test_day=""
    fi
  fi
  BACKUP_TIME=$l_backup_time
  TEST_RESTORE_DAY=$l_test_day
  TEST_RESTORE_TIME=$l_test_time
  write_status schedule "backup_time=$BACKUP_TIME" "test_restore_day=$TEST_RESTORE_DAY" "test_restore_time=$TEST_RESTORE_TIME"
  log "schedule: daily backup at $BACKUP_TIME, test restore on day $TEST_RESTORE_DAY at $TEST_RESTORE_TIME"
}

restore_requested() {
  q_request=$1
  q_id=$(basename "$q_request" .restore)
  q_source=$(request_value "$q_request" source)
  q_file=$(request_value "$q_request" file)
  q_admin=$(request_value "$q_request" admin)
  q_started=$(now_utc)
  write_status restore.running "started_at=$q_started" "file=$q_file" "request=$q_id"
  rm -f "$q_request"
  case "$q_admin" in
    *[!0-9a-f-]*) q_admin="" ;;
  esac
  q_dump=""
  case "$q_source:$q_file" in
    */*|*:.*) ;;
    backup:nfnn-*.dump) [ -f "$BACKUPS/$q_file" ] && q_dump="$BACKUPS/$q_file" ;;
    upload:*.upload) [ -f "$RESTORE/$q_file" ] && q_dump="$RESTORE/$q_file" ;;
  esac
  if [ -z "$q_dump" ]; then
    write_status restore "outcome=failed" "started_at=$q_started" "finished_at=$(now_utc)" "file=$q_file" "request=$q_id" "admin=$q_admin" "error=the backup to restore was not found"
    log "restore request $q_id refused: the backup to restore was not found"
  else
    restore_dump "$q_dump" "$q_file" "$q_id" "$q_admin"
  fi
  if [ "$q_source" = upload ] && [ -n "$q_dump" ]; then
    rm -f "$q_dump"
  fi
  rm -f "$RUNNING"
}

handle_requests() {
  for request in "$REQUESTS"/*.backup "$REQUESTS"/*.test-restore "$REQUESTS"/*.restore; do
    [ -e "$request" ] || continue
    id=$(basename "$request")
    case "$id" in
      *.backup) rm -f "$request"; take_backup "-rucni" "${id%.backup}" ;;
      *.test-restore) rm -f "$request"; test_restore "${id%.test-restore}" ;;
      *.restore) restore_requested "$request" ;;
    esac
  done
  find "$RESTORE" -maxdepth 1 -name '*.upload' -mmin +60 -delete 2>/dev/null
}

mkdir -p "$STATUS" "$REQUESTS"
chmod 1777 "$REQUESTS"
rm -f "$REQUESTS"/*.backup "$REQUESTS"/*.test-restore
log "nfnn backup started: backups in $BACKUPS, restore folder $RESTORE"
load_schedule

read_database_password
wait_for_database
recover_interrupted_restore
restore_from_folder
handle_requests
take_backup "" ""

last_backup_day=""
if reached "$BACKUP_TIME"; then
  last_backup_day=$(date +%Y-%m-%d)
fi
last_test_day=""
if [ "$(sed -n 's/^started_at=\(.\{10\}\).*/\1/p' "$STATUS/test-restore" 2>/dev/null)" = "$(date +%Y-%m-%d)" ]; then
  last_test_day=$(date +%Y-%m-%d)
fi
while true; do
  sleep "$POLL_SECONDS"
  handle_requests
  load_schedule
  today=$(date +%Y-%m-%d)
  if reached "$BACKUP_TIME" && [ "$last_backup_day" != "$today" ]; then
    last_backup_day=$today
    take_backup "" ""
  fi
  if [ "$(date +%u)" = "$TEST_RESTORE_DAY" ] && reached "$TEST_RESTORE_TIME" && [ "$last_test_day" != "$today" ]; then
    last_test_day=$today
    test_restore ""
  fi
done
