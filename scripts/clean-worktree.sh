#!/usr/bin/env bash
set -euo pipefail

root=$(git rev-parse --show-toplevel)
main=$(git worktree list --porcelain | sed -n '1s/^worktree //p')

if [ -z "$main" ] || [ "$(cd "$root" && pwd -P)" = "$(cd "$main" && pwd -P)" ]; then
  echo "$root is the main checkout; the cleanup runs only in a linked worktree" >&2
  exit 1
fi

for path in backend/build frontend/dist frontend/test-results frontend/.angular mcp/dist; do
  rm -rf -- "${root:?}/$path"
done
