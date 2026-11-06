#!/usr/bin/env bash
root=${1:?usage: scripts/install-node-modules.sh <repository root>}
status=0
for dir in frontend mcp; do
  cd "$root/$dir" || continue
  if [ ! -f node_modules/.package-lock.json ] || [ package-lock.json -nt node_modules/.package-lock.json ]; then
    if ! npm ci --no-audit --no-fund --loglevel=error >&2; then
      echo "npm ci failed in $dir/; run it before npm start, npm test or npm run check"
      status=1
    fi
  fi
done
exit $status
