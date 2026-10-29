#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
screens_store="${BASELINE_SCREENS_STORE:-/mnt/project-files/nfnn-ux/snimky/v2-baseline}"
screens_run="$(mktemp -d)/screens"
gradle_init=()
if [[ -n "${GRADLE_INIT_SCRIPT:-}" ]]; then
  gradle_init=(--init-script "$GRADLE_INIT_SCRIPT")
fi
generators=(--tests "*ReceiptCorpusTest*" --tests "*ReceiptFormattingCasesTest*" --tests "*MonthlyReportFormattingCasesTest*" --tests "*OverviewGoldenCasesTest*")
export LC_ALL=C.UTF-8 LANG=C.UTF-8

echo "== Receipt corpus and shared cases from the backend"
rm -rf "$root/regression/v2/receipts" "$root/shared-cases/admin-overview" "$root/shared-cases/donor-summary" \
  "$root/shared-cases/monthly-report" "$root/shared-cases/receipts"
(cd "$root/backend" && GOLDEN_FILES=write ./gradlew test --rerun "${generators[@]}" -PnoCucumber "${gradle_init[@]}" -q)

echo "== Screens, recorded once and checked against a second run"
(cd "$root/frontend" && BASELINE_SCREENS=1 BASELINE_SCREENS_DIR="$screens_run" \
  npx playwright test e2e/baseline/screens.spec.ts --workers=2 --update-snapshots=all --reporter=line)
(cd "$root/frontend" && BASELINE_SCREENS=1 BASELINE_SCREENS_DIR="$screens_run" \
  npx playwright test e2e/baseline/screens.spec.ts --workers=2 --reporter=line)
node "$root/scripts/screens-manifest.mjs" "$screens_run" regression/v2/screens/manifest.json "$screens_store"
rm -rf "$screens_store"
mkdir -p "$screens_store"
cp "$screens_run"/*.png "$screens_store"/

echo "== The recorded files read back unchanged, in the shape the runners expect, with nothing real in them"
(cd "$root/backend" && ./gradlew test --rerun "${generators[@]}" --tests "*BaselineDataSetsTest*" --tests "*BaselineHygieneTest*" -PnoCucumber "${gradle_init[@]}" -q)

echo "Recorded. Review: git status regression/v2 shared-cases; screenshots in $screens_store"
