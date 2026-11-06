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
`nightly.yml` runs on `main` every night what is too slow or too time-dependent for every PR; a failure opens or updates one issue labelled `nightly` (`deploy-ci.md`). What each job runs: `docs/system-overview.md` "Nightly".

While a nightly job is red, the next slice of its area waits (plan v3, 5.6 e). The jobs and their areas, kept the same in the `report` job of `nightly.yml`; a slice that adds a nightly job adds its row in both:

| Nightly job | Area | What waits while it is red |
|---|---|---|
| `public-screens` ("Veřejné stránky proti v2") | the public site | the next slice that changes public pages or their look (2.4, 2.5, 2.6, 2.7, 2.22, 2.26a) |
| `release` ("Zkouška vydání", `deployed` and `latest`) | operations, schema and images | the next slice with a Liquibase changeset or a change to the images, compose, backups or the import (2.3, 2.4, 2.9, 2.12, 2.17, 2.27) |
| `sync-convergence` ("Konvergence synchronizace") | the donor's device copy and its sync | the next slice that changes the sync or the device copy (2.13, 2.17) |
| `bulk-receipts` ("Hromadná potvrzení (300)") | drawing receipts in the browser and the bulk receipts | the next slice that changes the receipt drawing or the bulk receipts (2.19) |

- `public-screens` counts only shots outside `/darce` and `/sprava` (the app areas are compared with the approved mockups, plan v3 3.8). A PR that changes a public page on purpose adds its state to `regression/public-screens-since-v2.json` as `{"state", "since", "reason"}` in the same PR, and removes a listed state that no longer differs (the report lists it). A removed shot always fails, listed or not. The guard of a public page's look is each PR's `visual` job.
