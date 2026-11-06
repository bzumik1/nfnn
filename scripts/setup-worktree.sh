#!/usr/bin/env bash
set -uo pipefail

root=$(git rev-parse --show-toplevel) || exit 1
markers="$root/.t3"
log="$markers/setup.log"
running="$markers/setup-running"

mkdir -p "$markers"
if [ -f "$running" ]; then
  owner=$(cat "$running")
  if [ -n "$owner" ] && kill -0 "$owner" 2>/dev/null; then
    echo "The setup is already running as $owner; wait for .t3/setup-done or .t3/setup-failed" >&2
    exit 1
  fi
fi
echo $$ > "$running"
rm -f "$markers/setup-done" "$markers/setup-failed"

install=
cancelled=

finish() {
  local status=$?
  if [ "$status" -eq 0 ]; then
    date -u +%Y-%m-%dT%H:%M:%SZ > "$markers/setup-done"
  else
    { echo "Setup exited with $status:"; tail -n 40 "$log" 2>/dev/null; } > "$markers/setup-failed"
  fi
  rm -f "$running"
  [ -n "$cancelled" ] || exit 0
}

cancel() {
  cancelled=$1
  if [ -n "$install" ]; then
    kill -TERM -- "-$install" 2>/dev/null
    wait "$install" 2>/dev/null
  fi
  exit "$1"
}

trap finish EXIT
trap 'cancel 129' HUP
trap 'cancel 130' INT
trap 'cancel 143' TERM

set -m
{ bash "$(dirname "$0")/install-node-modules.sh" "$root" 2>&1 | tee "$log"; } &
install=$!
set +m
wait "$install"
