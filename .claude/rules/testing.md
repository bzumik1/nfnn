# Testing rules (TDD, given/when/then)

Write the test first, watch it fail for the right reason, make it pass with the smallest change, refactor green. Every behaviour has a test at the lowest level that can prove it.

The rest of the testing rules load only with the files of their area; a reference to `testing.md` and one of these sections means the file beside it:
- Backend (levels, Cucumber, integration, architecture, test support and fakes, keeping the suite fast): `testing-backend.md`.
- Frontend (Vitest, Playwright, CSP violations, phones and tablets, Safari, web as an app, receipt PDF): `testing-frontend.md`.
- Logic on both sides (shared cases): `testing-shared-cases.md`.
- Regression against v2 (recording, transcripts, golden cases, data sets and screens, hygiene, comparison, CI): `testing-regression.md`.
- Nightly: `testing-nightly.md`.

## Naming (given/when/then)
- Backend: `should_<expected>_when_<action>[_given_<state>]` plus `@DisplayName("Given X, when Y, then Z")` on every test (`architecture/TestNamingRulesTest`); a shared setup may be a `@Nested @DisplayName("Given …")` class whose tests read "when …, then …". Cucumber: one English feature per use case, tagged with its context folder's tag (`FeatureContextTagsTest`).
- Frontend and connector: `describe('Given …')` → `it('when …, then …')`.

## What a new backend feature covers
Happy path and each rule as scenarios; validation and problem types; 401 without token and 404 for another donor's resource; rate limits; time boundaries with `MutableClock`; scheduler on and off; a repository test for every derived or hand-written query; a rendering test per new template; `cs` and `en` texts for every new key.

## Connector (`mcp/`)
- Vitest specs in `mcp/test/*.spec.ts`, same naming (`describe('Given …')` → `it('when …, then …')`); the backend is `test/fake-backend.ts`, never a real one.

## Running
What to run before "done" is in `CLAUDE.md` (Done means); the backend details are in `testing-backend.md`. In a cloud session: skill `cloud-session`.
