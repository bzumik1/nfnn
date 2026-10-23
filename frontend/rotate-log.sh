#!/bin/sh
# Rotates one log file by the UTC day: the lines of a finished day move to FILE.YYYY-MM-DD.gz,
# COMMAND runs so the writer starts a new file, and archives older than LOG_KEEP_DAYS (14) go.
# With --once it only rotates a file left over from an earlier day and returns; without it, it
# checks every minute and never returns. Usage: rotate-log [--once] FILE [COMMAND...]
set -u
umask 022

once=false
if [ "${1:-}" = --once ]; then
  once=true
  shift
fi
file=$1
shift
keep_days=${LOG_KEEP_DAYS:-14}

today() {
  date -u +%Y-%m-%d
}

rotate() {
  day=$1
  shift
  [ -s "$file" ] || return 0
  mv "$file" "$file.$day" || return 0
  if [ $# -gt 0 ]; then "$@" || echo "rotate-log: $* failed after moving $file"; fi
  if gzip -9c "$file.$day" >> "$file.$day.gz"; then rm -f "$file.$day"; fi
  find "$(dirname "$file")" -maxdepth 1 -name "$(basename "$file").*.gz" -mtime +$((keep_days - 1)) -exec rm -f {} +
}

if [ -s "$file" ]; then current=$(date -u -r "$file" +%Y-%m-%d); else current=$(today); fi
if [ "$current" != "$(today)" ]; then
  rotate "$current" "$@"
  current=$(today)
fi
if [ "$once" = true ]; then exit 0; fi

while sleep 60; do
  now=$(today)
  if [ "$now" != "$current" ]; then
    rotate "$current" "$@"
    current=$now
  fi
done
