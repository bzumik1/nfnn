#!/bin/sh
# Starts as root only to rotate the connector's log file (LOG_FILE) and hand it to the node user;
# the rotation keeps running as root in the background and the connector itself runs as node.
set -eu

if [ "$(id -u)" = 0 ]; then
  if [ -n "${LOG_FILE:-}" ] && mkdir -p "$(dirname "$LOG_FILE")" 2>/dev/null; then
    rotate-log --once "$LOG_FILE"
    if touch "$LOG_FILE" 2>/dev/null && chown node:node "$LOG_FILE" 2>/dev/null; then
      rotate-log "$LOG_FILE" sh -c 'touch "$0" && chown node:node "$0"' "$LOG_FILE" &
    else
      echo "Could not make $LOG_FILE writable for the node user; the connector logs to the console only"
    fi
  fi
  exec su-exec node "$@"
fi

exec "$@"
