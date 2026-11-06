---
paths:
  - ".github/**"
  - "regression/**"
  - "scripts/**"
  - "frontend/e2e/**"
  - "backend/src/test/**"
---
# Testing rules: nightly

The general rules (TDD, given/when/then naming) are in `testing.md`.

## Nightly
`nightly.yml` runs on `main` every night (01:23 UTC; by hand from Actions) what is too slow or too time-dependent for every PR, and a failure opens or updates one issue labelled `nightly` (`deploy-ci.md`). While a nightly job is red, the next slice of its area waits (plan v3, 5.6 e). The jobs and their areas, kept the same in the `report` job of `nightly.yml`; a slice that adds a nightly job adds its row in both:

| Nightly job | Area | What waits while it is red |
|---|---|---|
| `public-screens` ("Veřejné stránky proti v2") | the public site | the next slice that changes public pages or their look (2.4, 2.5, 2.6, 2.7, 2.22, 2.26a) |
| `release` ("Zkouška vydání", `deployed` and `latest`) | operations, schema and images | the next slice with a Liquibase changeset or a change to the images, compose, backups or the import (2.3, 2.4, 2.9, 2.12, 2.17, 2.27) |
| `sync-convergence` ("Konvergence synchronizace") | the donor's device copy and its sync | the next slice that changes the sync or the device copy (2.13, 2.17) |
| `bulk-receipts` ("Hromadná potvrzení (300)") | drawing receipts in the browser and the bulk receipts | the next slice that changes the receipt drawing or the bulk receipts (2.19) |

`public-screens` compares the v2 states (`BASELINE_SCREENS=v2`) of `BASELINE_COMMIT` with `main` through `compare-screens.mjs --v2-only --public-only --accepted=regression/public-screens-since-v2.json`: only shots taken outside `/darce` and `/sprava` count (the app-like areas of Phase 2 are compared with the approved mockups instead, plan v3 3.8), and a public state that differs from v2 passes only when that file lists it as `{"state", "since", "reason"}` (the PR or slice that changed it, and why). A PR that changes a public page on purpose adds its state there in the same PR, and a listed state that no longer differs is removed (the report lists it). A removed shot always fails, listed or not. Since 2.0 every public v2 state is listed, because the header and the footer changed after v2 (#225, #228, #245, #248, #263, #267), so today the job proves only that every public v2 state still renders and none is gone; the guard of a public page's look is the `visual` job of each PR. `release` runs the rollback probe of the PR check against the deployed revision and `latest` (`deploy-ci.md`, `release`). `sync-convergence` runs `DonorDeviceSyncTest` with `SYNC_CONVERGENCE_SEEDS=300` (a PR runs 30, `testing-shared-cases.md`, Logic on both sides). `bulk-receipts` (slice 2.29) runs `e2e/bulk-receipts-load.spec.ts` with `BULK_RECEIPTS_LOAD=1` against the production build: 300 donors issued and drawn into one PDF with Chromium's CPU throttled to a quarter, every page read back, within 180 s; Chromium throttles only the page, not the drawing worker, so the budget leaves room for a truly slow device (about 20 s measured, about 75 s estimated).
