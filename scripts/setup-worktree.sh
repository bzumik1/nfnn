#!/usr/bin/env bash
set -uo pipefail

root=$(git rev-parse --show-toplevel) || exit 1
markers="$root/.t3"
log="$markers/setup.log"

mkdir -p "$markers"
rm -f "$markers/setup-done" "$markers/setup-failed"
echo $$ > "$markers/setup-running"

finish() {
  local status=$?
  if [ "$status" -eq 0 ]; then
    date -u +%Y-%m-%dT%H:%M:%SZ > "$markers/setup-done"
  else
    { echo "Setup exited with $status:"; tail -n 40 "$log" 2>/dev/null; } > "$markers/setup-failed"
  fi
  rm -f "$markers/setup-running"
}
trap finish EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

bash "$(dirname "$0")/install-node-modules.sh" "$root" 2>&1 | tee "$log"
