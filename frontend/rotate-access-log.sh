#!/bin/sh
# Runs from /docker-entrypoint.d before nginx starts: rotates an access log left over from an
# earlier day, then keeps rotating it daily in the background and has nginx reopen it each time.
set -u

ACCESS_LOG=/logs/nginx-access.log
rotate-log --once "$ACCESS_LOG"
rotate-log "$ACCESS_LOG" nginx -s reopen &
