#!/usr/bin/env bash
set -uo pipefail

root=$(git rev-parse --show-toplevel) || exit 1
markers="$root/.t3"
log="$markers/setup.log"
running="$markers/setup-running"

mkdir -p "$markers"

claim() {
  (set -C; echo $$ > "$running") 2>/dev/null
}

held_by_setup() {
  local owner
  owner=$(cat "$running" 2>/dev/null) || return 1
  [ -n "$owner" ] && kill -0 "$owner" 2>/dev/null \
    && ps -p "$owner" -o command= 2>/dev/null | grep -q 'setup-worktree\.sh'
}

refuse() {
  echo "The setup is already running as $(cat "$running" 2>/dev/null); wait for .t3/setup-done or .t3/setup-failed" >&2
  exit 1
}

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
    kill -CONT -- "-$install" 2>/dev/null
    wait "$install" 2>/dev/null
  fi
  exit "$1"
}

trap_signals() {
  trap 'cancel 129' HUP
  trap 'cancel 130' INT
  trap 'cancel 143' TERM
}

if ! claim; then
  held_by_setup && refuse
  rm -f "$running"
  claim || refuse
fi
trap finish EXIT
trap_signals
rm -f "$markers/setup-done" "$markers/setup-failed"

deferred=
trap 'deferred=129' HUP
trap 'deferred=130' INT
trap 'deferred=143' TERM
set -m
{ bash "$(dirname "$0")/install-node-modules.sh" "$root" 2>&1 | tee "$log"; } </dev/null &
install=$!
set +m
trap_signals
[ -z "$deferred" ] || cancel "$deferred"
wait "$install"
