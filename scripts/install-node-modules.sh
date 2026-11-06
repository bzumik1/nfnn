#!/usr/bin/env bash
[ -n "${1:-}" ] || { echo "usage: scripts/install-node-modules.sh <repository root>" >&2; exit 2; }
root=$(cd "$1" && pwd) || exit 2
status=0
for dir in frontend mcp; do
  if [ ! -d "$root/$dir" ]; then
    echo "no $dir/ in $root"
    status=1
    continue
  fi
  (
    cd "$root/$dir" || exit 1
    if [ ! -f node_modules/.package-lock.json ] || [ package-lock.json -nt node_modules/.package-lock.json ]; then
      npm ci --no-audit --no-fund --loglevel=error >&2
    fi
  ) || {
    echo "npm ci failed in $dir/; run it before npm start, npm test or npm run check"
    status=1
  }
done
exit $status
