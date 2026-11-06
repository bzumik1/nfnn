#!/usr/bin/env bash
set -euo pipefail

folder=${1:?usage: scripts/backend-log.sh <logs folder>}
[ -f "$folder/backend.log" ] || { echo "::error::$folder holds no backend.log" >&2; exit 1; }

find "$folder" -maxdepth 1 -type f -name 'backend.log.*.gz' -printf '%f\n' | sort -V | while read -r name; do
  gzip -dc "$folder/$name"
done
cat "$folder/backend.log"
