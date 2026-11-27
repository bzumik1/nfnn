# Testing rules (TDD, given/when/then)

Write the test first, watch it fail for the right reason, make it pass with the smallest change, refactor green. Every behaviour has a test at the lowest level that can prove it.

The rest of the testing rules load only with the files of their area; a reference to `testing.md` and one of these sections means the file beside it:
- Backend (levels, Cucumber, integration, architecture, test support and fakes, keeping the suite fast): `testing-backend.md`.
- Frontend (Vitest, Playwright, CSP violations, phones and tablets, Safari, web as an app, receipt PDF): `testing-frontend.md`; fixed waits in e2e: Frontend e2e below.
- Logic on both sides (shared cases): `testing-shared-cases.md`.
- Regression against v2 (recording, transcripts, golden cases, data sets and screens, hygiene, comparison, CI): `testing-regression.md`.
- Nightly: `testing-nightly.md`.

## Naming (given/when/then)
- Backend: `should_<expected>_when_<action>[_given_<state>]` plus `@DisplayName("Given X, when Y, then Z")` on every test (`architecture/TestNamingRulesTest`); a shared setup may be a `@Nested @DisplayName("Given …")` class whose tests read "when …, then …". Cucumber: one English feature per use case, tagged with its context folder's tag (`FeatureContextTagsTest`).
- Frontend and connector: `describe('Given …')` → `it('when …, then …')`.

## What a new backend feature covers
Happy path and each rule as scenarios; validation and problem types; 401 without token and 404 for another donor's resource; rate limits; time boundaries with `MutableClock`; scheduler on and off; a repository test for every derived or hand-written query; a rendering test per new template; `cs` and `en` texts for every new key.

## Frontend e2e
- No fixed waits: a Playwright test waits on state the page exposes (`expect`, `expect.poll`, `toPass`, `e2e/settled.ts`); a wait for time itself waits on the page's clock (`performance.now()`), as `dialog-back.spec.ts` rests a finger past the flick window. Lint refuses `waitForTimeout` in `e2e/`, called, bracketed or destructured (`no-restricted-syntax`, `scripts/eslint-fixed-waits.test.mjs`) except in `e2e/fixed-waits.ts`, whose `waitWhileNothingMayHappen(page, ms)` is the one way to wait a fixed time, only in a test that proves nothing happens (a page that does not reload); no `eslint-disable` directive, which is a comment (ESLint runs with `noInlineConfig`). A `setTimeout` in e2e only bounds a wait, delays a mock's answer, flushes a task, throws a planted error from a task of its own or paces a poll of observable state, never stands in for one.

## Quarantine of flaky e2e tests (Jakub 2026-11-27, #2125)
- A team lead may move a known flaky e2e test with an open issue into `frontend/e2e/quarantine.json`, one entry per test with its `since` time, in a PR that names the issue and declares the file (`Výjimka:`). At most 5 entries. Each is fixed within 48 h of its `since`; past that its fix comes before other work.
- The listed tests keep running in the job `e2e (karanténa)`, which does not block `gate`; the shards leave out exactly them, and the inventory keeps them. The PR that fixes one removes its entry and closes its issue.
- `scripts/e2e-quarantine.mjs` in the `frontend` job fails `gate` on a sixth entry, an entry whose issue is missing or closed, one naming no test, and on a PR one past 48 h by the CI clock (on `main` only a warning; the nightly fails and reports it, `deploy-ci.md`). How to add an entry: `testing-frontend.md`.

## Connector (`mcp/`)
- Vitest specs in `mcp/test/*.spec.ts`, same naming (`describe('Given …')` → `it('when …, then …')`); the backend is `test/fake-backend.ts`, never a real one.

## Running
What to run before "done" is in `CLAUDE.md` (Done means); the backend details are in `testing-backend.md`. In a cloud session: skill `cloud-session`.
