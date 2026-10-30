#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
store="${BASELINE_SCREENS_STORE:-/mnt/project-files/nfnn-ux/snimky/v2-baseline}"
work="$(mktemp -d)"
first_run="$work/screens"
second_run="$work/screens-again"
receipts="$work/receipts"
server_group=""
gradle_init=()
if [[ -n "${GRADLE_INIT_SCRIPT:-}" ]]; then
  gradle_init=(--init-script "$GRADLE_INIT_SCRIPT")
fi
generators=(--tests "*ReceiptCorpusTest*" --tests "*ReceiptFormattingCasesTest*" --tests "*MonthlyReportFormattingCasesTest*" --tests "*OverviewGoldenCasesTest*")
export LC_ALL=C.UTF-8 LANG=C.UTF-8 CI=1

stop_server() {
  if [[ -n "$server_group" ]]; then
    kill -- "-$server_group" 2>/dev/null || true
    server_group=""
  fi
}
finish() {
  local status=$?
  stop_server
  if [[ $status -eq 0 ]]; then
    rm -rf "$work"
  else
    echo "Recording failed; the shots, receipts and logs so far are kept in $work" >&2
  fi
}
trap finish EXIT

start_server() {
  local port
  port="$(node -e "const s = require('node:net').createServer(); s.listen(0, '127.0.0.1', () => { console.log(s.address().port); s.close(); });")"
  setsid bash -c "cd '$root/frontend' && exec node scripts/serve-dist.mjs '$work/dist/browser' $port" >"$work/serve-$port.log" 2>&1 &
  server_group=$!
  for _ in $(seq 1 180); do
    if ! kill -0 "$server_group" 2>/dev/null; then
      server_group=""
      echo "The server on port $port stopped before it served the site (log: $work/serve-$port.log)" >&2
      return 1
    fi
    if curl -fs --noproxy "*" -o /dev/null "http://127.0.0.1:$port/"; then
      export E2E_BASE_URL="http://127.0.0.1:$port"
      return 0
    fi
    sleep 1
  done
  echo "The server on port $port did not serve the site within 180 s" >&2
  return 1
}

echo "== Receipt corpus and shared cases from the backend"
rm -rf "$root/regression/v2/receipts" "$root/regression/v2/screens" "$root/shared-cases/admin-overview" "$root/shared-cases/donor-summary" \
  "$root/shared-cases/monthly-report" "$root/shared-cases/receipts" "$root/backend/build/receipt-corpus"
(cd "$root/backend" && GOLDEN_FILES=write ./gradlew test --rerun "${generators[@]}" -PnoCucumber "${gradle_init[@]}" -q)
cp -r "$root/backend/build/receipt-corpus" "$receipts"
node "$root/scripts/receipts-check.mjs" "$receipts"

echo "== This worktree's frontend, built for production and served on a port of its own"
(cd "$root/frontend" && npx ng build --output-path="$work/dist" >"$work/ng-build.log" 2>&1) || { cat "$work/ng-build.log" >&2; exit 1; }
start_server || { stop_server; start_server; }

echo "== Screens, recorded twice into separate folders"
screens_run() {
  (cd "$root/frontend" && BASELINE_SCREENS=1 BASELINE_SCREENS_DIR="$1" \
    npx playwright test --project=baseline --workers=2 --reporter=line --update-snapshots=all)
}
screens_run "$first_run"
screens_run "$second_run"
stop_server
node "$root/scripts/screens-manifest.mjs" "$first_run" regression/v2/screens/manifest.json "$store"
if ! node "$root/scripts/screens-manifest.mjs" --check "$second_run"; then
  echo "The second recording differs from the first in the states above" >&2
  exit 1
fi

echo "== Every suite, which reads the recorded files back with their digests, and the test inventory"
(cd "$root/backend" && GOLDEN_FILES=digests ./gradlew test --rerun acceptanceTest --rerun "${gradle_init[@]}" -q)
(cd "$root/frontend" && npx playwright test --list --reporter=json >"$work/inventory-playwright.json")
(cd "$root/frontend" && npx ng test --watch=false --reporters=json --output-file="$work/inventory-vitest.json" >/dev/null)
(cd "$root/mcp" && npx vitest run --reporter=json --outputFile="$work/inventory-mcp-vitest.json" >/dev/null)
node "$root/scripts/test-inventory.mjs" --playwright="$work/inventory-playwright.json" --frontendVitest="$work/inventory-vitest.json" \
  --mcpVitest="$work/inventory-mcp-vitest.json"
(cd "$root/backend" && ./gradlew test --rerun --tests "*BaselineHygieneTest*" --tests "*BaselineDataSetsTest*" -PnoCucumber "${gradle_init[@]}" -q)

echo "== The screenshots and the rendered receipts, staged in $store/.incoming and checked there"
rm -rf "$store/.incoming"
mkdir -p "$store/.incoming/receipts"
cp "$first_run"/*.png "$store/.incoming"/
cp "$receipts"/* "$store/.incoming/receipts"/
node "$root/scripts/screens-manifest.mjs" --check "$store/.incoming"
node "$root/scripts/receipts-check.mjs" "$store/.incoming/receipts"

echo "== The staged files into place, the replaced ones into $store/.previous"
rm -rf "$store/.previous"
mkdir -p "$store/.previous"
find "$store" -maxdepth 1 -type f -name '*.png' -exec mv -t "$store/.previous" {} +
if [[ -d "$store/receipts" ]]; then
  mv "$store/receipts" "$store/.previous/receipts"
fi
find "$store/.incoming" -maxdepth 1 -type f -name '*.png' -exec mv -t "$store" {} +
mv "$store/.incoming/receipts" "$store/receipts"
rmdir "$store/.incoming"
node "$root/scripts/screens-manifest.mjs" --check "$store"
node "$root/scripts/receipts-check.mjs" "$store/receipts"

echo "Recorded. Review: git status regression/v2 shared-cases; screenshots and receipts in $store, the previous ones in $store/.previous"
