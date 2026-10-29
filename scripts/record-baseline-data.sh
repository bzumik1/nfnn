#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
store="${BASELINE_SCREENS_STORE:-/mnt/project-files/nfnn-ux/snimky/v2-baseline}"
work="$(mktemp -d)"
screens="$work/screens"
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
  stop_server
  rm -rf "$work"
}
trap finish EXIT

echo "== Receipt corpus and shared cases from the backend"
rm -rf "$root/regression/v2/receipts" "$root/regression/v2/screens" "$root/shared-cases/admin-overview" "$root/shared-cases/donor-summary" \
  "$root/shared-cases/monthly-report" "$root/shared-cases/receipts" "$root/backend/build/receipt-corpus"
(cd "$root/backend" && GOLDEN_FILES=write ./gradlew test --rerun "${generators[@]}" -PnoCucumber "${gradle_init[@]}" -q)
cp -r "$root/backend/build/receipt-corpus" "$receipts"

echo "== This worktree's frontend on a port of its own"
port="$(node -e "const s = require('node:net').createServer(); s.listen(0, '127.0.0.1', () => { console.log(s.address().port); s.close(); });")"
setsid bash -c "cd '$root/frontend' && exec node_modules/.bin/ng serve --host 127.0.0.1 --port $port" >"$work/ng-serve.log" 2>&1 &
server_group=$!
for _ in $(seq 1 180); do
  if ! kill -0 "$server_group" 2>/dev/null; then
    cat "$work/ng-serve.log" >&2
    echo "ng serve on port $port stopped before it served the site" >&2
    exit 1
  fi
  if curl -fs --noproxy "*" -o /dev/null "http://127.0.0.1:$port/"; then
    break
  fi
  sleep 1
done
curl -fsS --noproxy "*" -o /dev/null "http://127.0.0.1:$port/"
export E2E_BASE_URL="http://127.0.0.1:$port"

echo "== Screens, recorded once and checked against a second run"
screens_run() {
  (cd "$root/frontend" && BASELINE_SCREENS=1 BASELINE_SCREENS_DIR="$screens" \
    npx playwright test --project=baseline --workers=2 --reporter=line "$@")
}
screens_run --update-snapshots=all
screens_run --update-snapshots=none
stop_server
node "$root/scripts/screens-manifest.mjs" "$screens" regression/v2/screens/manifest.json "$store"
node "$root/scripts/screens-manifest.mjs" --check "$screens"

echo "== Every suite, which reads the recorded files back with their digests, and the test inventory"
(cd "$root/backend" && GOLDEN_FILES=digests ./gradlew test --rerun "${gradle_init[@]}" -q)
(cd "$root/frontend" && npx playwright test --list --reporter=json >"$work/inventory-playwright.json")
(cd "$root/frontend" && npx ng test --watch=false --reporters=json --output-file="$work/inventory-vitest.json" >/dev/null)
(cd "$root/mcp" && npx vitest run --reporter=json --outputFile="$work/inventory-mcp-vitest.json" >/dev/null)
node "$root/scripts/test-inventory.mjs" --playwright="$work/inventory-playwright.json" --frontendVitest="$work/inventory-vitest.json" \
  --mcpVitest="$work/inventory-mcp-vitest.json"

echo "== The screenshots and the rendered receipts into $store"
mkdir -p "$store/receipts"
find "$store" -maxdepth 1 -type f -name '*.png' -delete
find "$store/receipts" -maxdepth 1 -type f -delete
cp "$screens"/*.png "$store"/
cp "$receipts"/* "$store/receipts"/
node "$root/scripts/screens-manifest.mjs" --check "$store"

echo "Recorded. Review: git status regression/v2 shared-cases; screenshots and receipts in $store"
