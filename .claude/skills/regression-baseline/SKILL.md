---
name: regression-baseline
description: Record API transcripts and the test inventory, add a screen state or receipt sample to the v2 baseline from a checkout of BASELINE_COMMIT, compare screens with the merge base or the v2 store, and recover the main recording in CI
---
# Regression baseline: recording and extending it

The rules are in `.claude/rules/testing-regression.md`; how each piece works is in `docs/system-overview.md` "Regression against v2 and shared cases". Never regenerate a baseline file to get a check green, and never write into `regression/v2/` from a checkout other than the one each step names.

## Record the API transcripts
1. `env -u FIO_TOKEN API_TRANSCRIPTS=record ./gradlew acceptanceTest --rerun` in `backend/` (`--rerun`, or `cleanAcceptanceTest` first, so Gradle does not skip it; `./gradlew test` and `build` record too). No `MAIL_*`, `APP_*`, `SPRING_APPLICATION_JSON`, Spring secret, secret setting or server-generated secret (`JWT_SECRET`, `SETTINGS_KEY`, `BACKUP_KEY`, `RECEIPT_SIGNING_KEY`, `DB_PASSWORD`) in the environment: recording refuses to start.
2. The files land in `backend/build/api-transcripts/<context>/<feature>.json`. Record twice and `diff -r` the two: they must be the same bytes.
3. Only a checkout of `BASELINE_COMMIT` copies them to `regression/v2/api/`. On any other checkout the recording is compared, never copied: `node scripts/compare-v2.mjs` (options in the overview, "Comparison").

## Collect the test inventory
- Backend: `./gradlew test` (JUnit XML in `build/test-results/test/` and `build/test-results/acceptanceTest/`).
- In `frontend/`: `npx ng test --watch=false --reporters=json --output-file=$PWD/test-results/inventory-vitest.json` and `npx playwright test --list --reporter=json > test-results/inventory-playwright.json`.
- In `mcp/`: `npx vitest run --reporter=json --outputFile=test-results/inventory-vitest.json`.
- Then `node scripts/test-inventory.mjs` (writes `regression/v2/test-inventory.json` only at the baseline commit; elsewhere `--out=<file>` for the comparison).

## Regenerate the data sets, receipts and screens (baseline commit only)
- QR cases: `GOLDEN_FILES=write ./gradlew test --tests "*QrGoldenCasesTest" -PnoCucumber`.
- Everything else in one step: `env -u FIO_TOKEN scripts/record-baseline-data.sh` (Docker, Node 24, Playwright's Chromium, `npm ci` in `frontend/` and `mcp/`). It stops before changing a file anywhere but on that checkout, shoots the screens twice and fails unless both runs agree, and keeps its temporary folder on a failure.

## Add a screen state to the baseline
1. Make the spec change on a checkout of `BASELINE_COMMIT` and keep it as `regression/v2/additions/<slice>.patch` (`git diff $(cat regression/v2/BASELINE_COMMIT) -- frontend/e2e/baseline`); it must apply to that commit and never changes once committed.
2. From the root of the PR's checkout: `out=$(mktemp -d) && for run in 1 2; do node scripts/compare-screens.mjs --base=<BASELINE_COMMIT> --patch=regression/v2/additions/<slice>.patch --v2-only --base-only --out=$out/$run || exit 1; done && node scripts/screens-manifest.mjs --add $out/1/base-shots $out/2/base-shots <slice>`.
3. Copy the new PNGs from `$out/1/base-shots` into the store `/mnt/project-files/nfnn-ux/snimky/v2-baseline/`, never over a file there; `node scripts/screens-manifest.mjs --check <store>` must pass.
4. Declare it in the PR's changes file: `{"kind": "baseline-addition", "file": "regression/v2/screens/manifest.json", "recordedFrom": "<BASELINE_COMMIT>", "patch": "regression/v2/additions/<slice>.patch", "record": "<the commands of step 2>", "reason": …}` (example: `regression/v2/changes/0.6c.json`).

A new receipt sample is added the same way, as a new file `regression/v2/receipts/<sample>.json`.

## Compare screens
- With the merge base (what a slice proves): in `frontend/`, `npm run screens:compare` (`--head-spec` also compares the states the slice adds; `--base=<commit>`, `--out=<folder>`, `--keep`). Its `report.md` summary goes into the PR under "Srovnání s v2", a visible change named with its crop.
- With the v2 store: `node scripts/screens-manifest.mjs --check <folder>` checks digests; for pixels, copy the store to a temporary folder, serve this checkout's build with `node scripts/serve-dist.mjs dist/frontend/browser <port>`, and run `E2E_BASE_URL=http://localhost:<port> BASELINE_SCREENS=1 BASELINE_SCREENS_DIR=<copy> npx playwright test e2e/baseline/screens.spec.ts --project=baseline --update-snapshots=none`. A digest that differs means comparing pixels, never recording again.

## When CI's `main-recording` finds no recording of `main`
Re-run the push run of `pr-check.yml` on the newest `main` commit (Actions, PR check, Re-run all jobs), then this PR's check. Only when no push run keeps the three artifacts at all does the comparison run against v2 alone.
