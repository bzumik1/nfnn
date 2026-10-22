# Testing rules (TDD, given/when/then)

Write the test first, watch it fail for the right reason, make it pass with the smallest change, refactor green. Every behaviour has a test at the lowest level that can prove it.

## Backend
| Level | Tool and place | Rules |
|---|---|---|
| Unit | JUnit 5 + AssertJ + Mockito, `src/test/java/.../<context>/<layer>/` | `should_<expected>_when_<action>_given_<state>` and/or `@DisplayName("Given X, when Y, then Z")`; AssertJ only; Mockito only for ports at the application boundary, never for domain objects; fixtures in test packages (`Donations`, `Receipts`, `BankPayments`, `QrCodes`) |
| Acceptance | Cucumber, `src/test/resources/features/<context>/<use_case>.feature` (English Gherkin), glue in `<context>/cucumber/`, shared steps in `cucumber/` | One feature per use case; scenarios go through HTTP with `cucumber/ApiClient`; suite `cucumber/AcceptanceTests` glues `cz.novanadeje.app`; `CucumberSpringConfiguration` boots the app with Testcontainers PostgreSQL and `TestSupportConfiguration` |
| Integration | `@SpringBootTest` or JPA slice + `TestcontainersConfiguration` | Real PostgreSQL 17 only, never H2; pin `app.donations.fio.token=`, `app.donations.report.cron=-`, `app.contact.retention.cron=-` |
| Architecture | ArchUnit, `architecture/` | A new invariant gets a rule; rules fail on an empty match (no `allowEmptyShould`) |

Test support (`support/`, wired `@Primary` by `TestSupportConfiguration`):
- `MutableClock`: `Given today is {date}` moves it; `FioImportStepDefinitions` restarts it after the scenario; `DonorSessions.actAs(alias)` signs a donor in again after the clock expired the token.
- `RecordingMailSender` + `MailContents`: assert on sent mail, no SMTP.
- `FakeFioClient` + `FioMovements`: serves added movements, refuses history older than 90 days until `unlockHistory()`, throws on the bookmark methods (`newTransactions`, `setLastDownloaded*`), so `/last/` can never pass.
- `SynchronousBankImportRequests`: the on-demand import runs in the request thread.
- `DatabaseCleaner`: `@Before` truncates tables and restarts sequences (receipt numbers start at `000001`), clears mail, resets the fake Fio client, advances the clock a day.
- `ScenarioDonors` (`{Jana}` in tables = Jana's symbol), `ParameterTypes` (`{date}` ISO). Each scenario sends from its own client address (`X-Forwarded-For`, trusted by the backend); `When the following requests come from another client address` switches.

A new feature covers: happy path and each rule as scenarios; validation and problem types; 401 without token and 404 for another donor's resource; rate limits; time boundaries with `MutableClock`; scheduler on and off; a repository test per new query; a rendering test per new template; `cs` and `en` texts for every new key.

## Frontend
- Vitest specs beside the code (`name.spec.ts`): `describe('Given …')` → `it('when …, then …')`; nested `describe('when …')` with `it('then …')` when outcomes share a setup. TestBed with `provideHttpClient()`, `provideHttpClientTesting()` (`http.verify()` in `afterEach`), `provideRouter([])`; drive the DOM (events, `fixture.whenStable()`) and assert visible text and ARIA, not internals; fixtures in `*/testing/` (excluded from the app build); `src/test-setup.ts` polyfills `<dialog>` for jsdom.
- Playwright in `e2e/` by user journey, same naming; every donor spec registers `mockDonorApi` (nothing reaches a backend); `signIn` at 1280 px (the header button is hidden on phones), resize after; downloads via `page.waitForEvent('download')`; `accessibility.spec.ts` runs axe with WCAG 2.2 AA tags on every page and dialog, so a new page or dialog gets a case there.
- Test behaviour, text and accessibility, never style values.

## Running
`./gradlew test` (Docker) and `npm run lint:styles && npm test -- --watch=false && npm run build && npm run e2e` before "done"; `./gradlew build` is what the PR check runs. Without Docker run `--tests "*architecture*" -PnoCucumber` and the touched classes (`-PnoCucumber` leaves out the Cucumber suite, which `--tests` cannot filter), and say so in the PR. Cloud sessions: Chromium is preinstalled (`PLAYWRIGHT_BROWSERS_PATH`), never `playwright install`; Maven Central rate-limits, so run Gradle as skill `backend-in-cloud` describes.
