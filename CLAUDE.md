# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Web application for the foundation **Nadační fond Nová naděje**. Czech-language site (i18n-ready for English) with a public marketing site, content administration, donor portal with PDF donation receipts, and a contact form.

**Product requirements** (Czech, agreed with the client) are in `docs/requirements.md`: what the first version does, what is deferred, and the open questions. Read it before building a feature; update it when the client decides something new. The HTTP API is specified in `docs/api-contract.md`.

The HTML/React prototype in `Claude Design/Nova Nadeje.html` is the **visual reference only** — it is a static prototype using Babel-in-the-browser. The production frontend is Angular and the design must be re-implemented in components, not embedded.

## Repository layout

Monorepo with two independently deployable applications:

```
backend/    Spring Boot 4 + Java 25, strict DDD, Gradle (Kotlin DSL)
frontend/   Angular 21 (standalone components, SCSS, Vitest, Playwright)
```

`docker-compose.yml` at the repo root runs the stack locally. Production on ZimaOS uses `deploy/compose.yml` with images from ghcr.io; see Deployment below.

## Backend architecture

**Strict DDD with four bounded contexts** under `cz.novanadeje.app`:

- `content` — pages, news, projects (CMS)
- `donors` — donor accounts and authentication (JWT)
- `donations` — donation records and PDF receipt generation
- `contact` — contact form and outbound email
- `shared` — shared kernel (value objects, base types reusable across contexts)

Each bounded context is **package-by-feature** with four layers:

```
<context>/domain/           Entities, value objects, domain services, repository interfaces
<context>/application/      Use cases, application services, DTOs, ports
<context>/infrastructure/   JPA adapters, Liquibase changelogs, external integrations (mail, PDF)
<context>/interfaces/rest/  REST controllers (inbound adapter)
```

**Dependency rule (enforced by ArchUnit in `architecture/DddLayeringRulesTest`):**

- `domain` depends on nothing (not even Spring)
- `application` may depend on `domain`
- `infrastructure` may depend on `domain` and `application`
- `interfaces` may depend on all three
- **Bounded contexts must not depend on each other** — cross-context communication goes through `shared` (only for stable shared concepts) or via Spring `ApplicationEventPublisher` domain events (for behavior-level coordination)

When adding a new feature, decide which bounded context owns it before writing code. If a domain concept fits two contexts, that's a signal one is missing or the boundary is wrong — surface this to the user.

**REST conventions:**
- All HTTP endpoints live under `/api/<context>/...` (e.g. `/api/contact/messages`, `/api/donations/receipts`)
- Controllers in `<context>/interfaces/rest/` accept and return DTOs (records), never JPA entities
- Validation via Jakarta Bean Validation (`@Valid`, `@NotBlank`, etc.) on request DTOs
- Errors return `application/problem+json` (RFC 7807) — use Spring's `ProblemDetail`

**Persistence:**
- JPA entities live in `<context>/infrastructure/persistence/`, never in `domain/`
- Domain types are mapped to/from JPA entities by an adapter implementing the repository interface declared in `<context>/domain/`
- Hibernate is configured with `ddl-auto: validate` — schema is owned by Liquibase. Adding a JPA field without a corresponding Liquibase changelog will cause startup to fail.

**Templates:**
- Email bodies: Thymeleaf templates in `src/main/resources/templates/email/<context>/`
- PDF receipts: Thymeleaf templates in `src/main/resources/templates/pdf/`, rendered via `openhtmltopdf-pdfbox`. Issued receipts keep the template they were issued with, so a change to the receipt markup or a `receipt.*` text fails `ReceiptTemplateHistoryTest` until the candidate it writes to `build/receipt-history/` is reviewed and copied into `src/test/resources/receipts/history/`

## Frontend architecture

Angular 21 with **standalone components** (no NgModules). Note Angular 21's flat file naming: `app.ts` instead of `app.component.ts` — keep this style for new components.

Mirror the backend bounded contexts in `src/app/features/`:

```
src/app/core/         Singletons: services, HTTP interceptors, guards, auth state
src/app/shared/       Reusable presentational components, pipes, directives
src/app/layout/       App shell: header, footer, navigation
src/app/features/{content,donors,donations,contact}/   Feature folders per BC
src/app/features/.../<feature>.routes.ts               Lazy-loaded route definitions
```

**Routing:** lazy-loaded per feature via `loadChildren` / `loadComponent` in `app.routes.ts`. Each feature exports its own `<feature>.routes.ts`.

**Internationalization:** `@angular/localize` is wired up. Czech is the source locale; English is the target locale and is empty until translated. Mark translatable text with `i18n` attributes from day one — extracting strings later is painful. Translation files live in `src/locale/`.

**Static assets:** images and other public assets go in `frontend/public/` (served at the root URL by Angular). Design source images currently live in `Claude Design/images/` — copy what is actually used into `frontend/public/` rather than referencing the design folder.

**API access:** in dev, `npm start` proxies `/api/*` to `http://localhost:8080`. In prod, the nginx in `frontend/Dockerfile` proxies `/api/*` to the `backend` service in compose. The Angular code only ever calls relative `/api/...` URLs.

## Testing — TDD with BDD given/when/then

**This is non-negotiable: write tests first, every behavior is covered.**

### Backend

| Tool | Purpose | Location |
|---|---|---|
| **JUnit 5 + AssertJ + Mockito** | Unit tests of domain and application | `src/test/java/.../<context>/...` |
| **Cucumber (Gherkin)** | Acceptance tests for use cases | `src/test/resources/features/<context>/*.feature` + glue in `src/test/java/.../<context>/` |
| **Testcontainers** | Integration tests against real PostgreSQL | wired via the public `TestcontainersConfiguration` |
| **ArchUnit** | Architectural invariants | `src/test/java/.../architecture/` |

**Naming conventions:**
- Unit tests: method name `should_<expected>_when_<action>_given_<state>` **or** `@DisplayName("Given X, when Y, then Z")`. AssertJ inside.
- Cucumber `.feature` files in English Gherkin (`Given/When/Then` keywords). One feature file per use case, placed under `features/<context>/`.
- Cucumber glue (step definitions) live in the same package as the bounded context they test (e.g. `cz.novanadeje.app.donations.cucumber`), not in one shared dump folder. The Cucumber suite (`AcceptanceTests`) glues from `cz.novanadeje.app`, so any subpackage is discovered.
- **Never use H2** — Testcontainers provides real PostgreSQL.

**Test support (`src/test/java/.../support/`):** `TestSupportConfiguration` replaces the `Clock` bean with a `MutableClock` and the `JavaMailSender` with a `RecordingMailSender`, so scenarios can move time (rate-limit windows, year boundaries) and assert on sent emails without an SMTP server. `FakeFioClient` (`@Primary`, reset per scenario) replaces the `FioClient`: it serves movements added with `FioMovements`, reports the requested period by default, refuses history older than 90 days until `unlockHistory()`, and throws on the bookmark methods (`newTransactions`, `setLastDownloaded*`), so a regression to `/last/` cannot pass the suite. Cucumber step definitions call the API through `cucumber/ApiClient`; a `@Before` hook in `CommonStepDefinitions` truncates the tables and restarts the sequences (`support/DatabaseCleaner`, so receipt numbers start at `000001` in every scenario), clears recorded mail, resets the fake Fio client and advances the clock a day. `ApiClient` sends each scenario's requests from a client address of its own (`X-Forwarded-For`, which the backend trusts; `When the following requests come from another client address` switches to a new one), which isolates scenarios from each other's per-address rate-limit windows: the day's advance alone does not, because many scenarios set the clock back to a fixed date such as `Given today is 2026-10-17`, where an earlier scenario's window still looks open. `cucumber/DonorSessions.actAs(alias)` signs a donor in again when the moved clock has expired their access token (the `JwtDecoder` validates against the `MutableClock`); `ScenarioDonors` keeps the credentials for that. `cucumber/ParameterTypes` adds `{date}` (ISO) and `cucumber/ScenarioDonors` remembers a scenario's donors by alias so a movement table can write `{Jana}` for Jana's variable symbol. `Given today is {date}` moves the shared `MutableClock` to that day; `FioImportStepDefinitions` puts it back after the scenario so the clock keeps moving forward.

**ArchUnit and Java 25:** ArchUnit must be at least 1.5 to parse Java 25 class files. With 1.4.0 it silently imported zero classes, so every rule passed vacuously. The rules now fail on an empty `that()` match (`withOptionalLayers` and `allowEmptyShould` were dropped), which guards against that.

### Frontend

- **Vitest** for unit/component tests (Angular 21 default; Karma is gone). Convention: `describe('Given ...', () => { it('when ..., then ...', ...) })`.
- **Playwright** for E2E. Tests in `frontend/e2e/`, organized by user journey, same given/when/then naming.

## Common commands

### Backend (`backend/`)

| Command | Purpose |
|---|---|
| `./gradlew bootRun` | Run app locally against an external Postgres (uses `dev` profile) |
| `./gradlew bootTestRun` | Run app with a Testcontainers-managed PostgreSQL — needs Docker but no manual DB setup |
| `./gradlew build` | Compile + run all tests + assemble jar |
| `./gradlew test` | Run all tests (Docker required for Testcontainers and Cucumber smoke) |
| `./gradlew test --tests "*<ClassName>*"` | Run a single test class |
| `./gradlew test --tests "*architecture*"` | Run only ArchUnit DDD rules (no Docker required) |
| `./gradlew test --tests "*AcceptanceTests"` | Run Cucumber suite only |
| `./gradlew bootJar` | Build executable jar |

Java 25 is downloaded automatically by Gradle's **toolchain** via the `foojay-resolver` plugin in `settings.gradle.kts` — you do **not** need JDK 25 on PATH. Local JDK 17+ is enough to run `./gradlew`.

The `Test` task in `build.gradle.kts` sets `TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE=/var/run/docker.sock` so Testcontainers' Ryuk container mounts the in-VM Docker socket path. This is the standard path on Docker Desktop, Colima, and native Linux — do not remove it.

### Frontend (`frontend/`)

| Command | Purpose |
|---|---|
| `npm install` | Install dependencies (run on **Node 22 or 24 LTS** — Node 25 is unsupported by Angular) |
| `npm start` | Dev server at `http://localhost:4200`, proxies `/api` to backend |
| `npm run build` | Production build to `dist/frontend/browser/` |
| `npm test` | Vitest unit tests |
| `npm run e2e` | Playwright end-to-end tests |
| `npm run e2e:install` | Install Playwright browsers (run once) |

`@angular/localize` is already wired into `angular.json`, `main.ts`, and the tsconfigs — do not run `ng add @angular/localize` again.

### Full stack locally (Docker)

| Command | Purpose |
|---|---|
| `cp .env.example .env` | Create local env file (edit secrets before first run) |
| `docker compose up -d --build` | Build and start all three services |
| `docker compose logs -f backend` | Tail backend logs |
| `docker compose down` | Stop everything |

`JWT_SECRET` is required and has no default — compose will refuse to start without it.

## Deployment

Modelled on the sister site `bzumik1/kocarky`; the server setup and the deploy steps are in `deploy/README.md` (Czech).

- `.github/workflows/pr-check.yml` runs on every PR to `main` on GitHub's runner: `./gradlew build` (Testcontainers works there), frontend unit tests and build, then both Docker images built and `deploy/compose.yml` started and probed. Never run it, or anything a PR triggers, on a self-hosted runner: unmerged code must not run on the server.
- `.github/workflows/images.yml` runs on a push to `main` on GitHub's runner and pushes `ghcr.io/bzumik1/nfnn-backend` and `-frontend` (`latest` and the short SHA). Both packages are public, so ZimaOS pulls without logging in; the images hold no secrets, which live only in the env files on the ZimaOS box. Visibility was switched once on GitHub, not by the workflow.
- `deploy/compose.yml` is pasted unchanged into ZimaOS → App Store → Custom Install as the app "Nová naděje", like kocarky's `server/` files. It holds no `${...}` variables, because the ZimaOS form has no `.env`, and no secrets or per-server values. A change to the file reaches the server only when someone pastes it into ZimaOS again; say so in the PR. Deploying a new version is manual: after "Publish Docker images" is green, Save the app's settings in ZimaOS without changes, which pulls the new `latest` and recreates the containers (the Update button and a plain restart keep the old image). Saving reuses the compose and env values from the last install, so changes to `compose.yml` or the env files still need a reinstall. A self-hosted runner with the Docker socket was rejected as too much access to the server.
- Secrets and per-server values live in two env files on the server, read through `env_file` (short syntax, absolute paths). `/DATA/AppData/nfnn/env/db.env` holds the database password under the three names the containers read (`POSTGRES_PASSWORD`, `PGPASSWORD`, `DB_PASSWORD`) and goes to postgres, backup and backend; `backend.env` holds `JWT_SECRET`, `FIO_TOKEN`, `MAIL_*` and the optional `MAIL_FROM`, `CONTACT_RECIPIENT`, `REPORT_RECIPIENT`, `PUBLIC_URL`, `FIO_HISTORY_FROM` and `RECEIPT_*`, and goes to the backend only, so the database containers never see the backend's secrets. The templates are `deploy/db.env.example` and `deploy/backend.env.example`; `.gitignore` ignores every filled `*.env`. An empty value is not an absent one for Spring (an empty `MAIL_FROM`, `PUBLIC_URL` or `RECEIPT_SIGNATORY_NAME` stops the startup), so an optional line whose empty value is invalid or changes behaviour stays commented out in the template, with its default as the example. A key under `environment:` overrides the same key from `env_file`, so the compose file must not set anything the files set; it keeps only `SPRING_PROFILES_ACTIVE`, `DB_URL`, `DB_USERNAME`, `JAVA_TOOL_OPTIONS`, `TZ` and the database names. The files must exist before the install (compose refuses a missing `env_file`), and ZimaOS copies their values into its stored compose as `environment:` at install time (seen on the server 2026-10-18), so a changed file takes effect only after the app is reinstalled; a restart or `docker compose up --force-recreate` keeps the old values. A change to a template reaches the server only when someone edits the file there; say so in the PR. `JWT_SECRET` has a default only in `application-dev.yml`, so a backend without it stops at startup. The backend also mounts `/DATA/AppData/nfnn/config` read-only as `/config` (the receipt signature image).
- The PR check's stack job builds the env files from the templates, filling the database password and `JWT_SECRET` with fresh `openssl rand -hex 32` values, so it fails when a template loses one of those lines; it also fails when `deploy/compose.yml` names a secret key (`POSTGRES_PASSWORD`, `PGPASSWORD`, `DB_PASSWORD`, `JWT_SECRET`, `MAIL_PASSWORD`, `FIO_TOKEN`) and when postgres or backup receives one of the backend's secrets. ZimaOS reads the copied env values as YAML (an unquoted `2025-01-01` reached the backend as `2025-01-01 00:00:00 +0000 UTC`), so the check also fails when a template value, commented or not, is not read as the same string, a plain integer or `true`/`false`; `FIO_HISTORY_FROM` is the one allowed date, and `BankImportProperties` takes the date out of that form.
- Postgres data, backups and the backend's read-only `config/` are bind-mounted under `/DATA/AppData/nfnn/`; the env files in `/DATA/AppData/nfnn/env/` are read by compose through `env_file`, not mounted.
- ZimaOS stores the pasted compose file without its `$$` escapes, so a `$` anywhere in `deploy/compose.yml` turns into an empty variable on the server. The file holds no `$` (the backup command uses backticks), and the PR check fails if one appears.
- ZimaOS replaces the compose project name with `compose-<hash>`, so every service sets `container_name: nfnn-<service>` to stay findable in Portainer and `docker ps`.
- ZimaOS runs the app on Docker's default `bridge` network, which has no DNS for service names, so every service sets `network_mode: bridge` and reaches the others through `links:` (backend → postgres, backup → postgres, frontend → backend). A new service that talks to another needs a `links:` entry too.
- `depends_on` uses `service_started`, not `service_healthy`: ZimaOS starts the app once, and a dependency that is not healthy yet would leave the dependent container never started. The backend restarts on its own until Postgres accepts connections, and the backup loop waits with `pg_isready`.
- ZimaOS adds its own memory reservation to every service and refuses to create a container whose `limits.memory` is below it, so no limit in `deploy/compose.yml` goes under 256M (a 128M frontend was silently never created).
- Port 8080 is taken on the ZimaOS box; the frontend publishes 8089. Nginx Proxy Manager terminates TLS for `nfnn.znamenacek.duckdns.org` and forwards to it.
- The foundation's domain is `nfnn.cz` (WEDOS, holder the foundation), to be served through Cloudflare like kocarky's; the steps are in "Přechod na skutečnou doménu" in `deploy/README.md`. Mail for `info@nfnn.cz` (the default `CONTACT_RECIPIENT` and sender, shown on the site) is forwarded by Cloudflare Email Routing, and the backend sends through Brevo's SMTP relay ("E-maily" in the README; SPF stays Cloudflare's alone, Brevo aligns through DKIM). `novanadeje.cz` belongs to someone else: never use it in addresses or URIs.
- The `backup` service writes a daily `pg_dump` to `/DATA/AppData/nfnn/backups/`. A restore drops and recreates the `public` schema before `pg_restore --exit-on-error --single-transaction`: `pg_restore --clean` leaves tables from a newer version behind while restoring the older `databasechangelog`, and Liquibase then fails re-creating them. Rolling back means setting the backend and frontend image tag to an older short SHA in the ZimaOS app settings, plus a restore when the newer version changed the schema; both are in "Zálohy" in `deploy/README.md`.
- The mail health indicator is off, so `/actuator/health` (the backend's Docker healthcheck) does not go DOWN when SMTP is missing or unreachable.
- Cache headers live in `frontend/nginx.conf`: `index.html` is `no-cache`, hashed bundles are immutable, `public/images/` is cached for an hour. A location with its own `add_header` drops inherited ones, so each location includes `nginx-security-headers.conf`.
- The backend trusts forwarded headers from any peer (`server.forward-headers-strategy: framework`), so `frontend/nginx.conf` resolves the visitor's address itself: `set_real_ip_from` the private ranges (Nginx Proxy Manager sends `X-Forwarded-For` by itself), `real_ip_header X-Forwarded-For` with `real_ip_recursive on`, then `X-Forwarded-For $remote_addr` to the backend and an emptied `Forwarded`, so a client cannot choose the address the per-address rate limits (contact form, password reset, sign-in, registration) count. After a move behind Cloudflare, NPM has to take the visitor's address from `CF-Connecting-IP` (see "Obnova hesla" in `deploy/README.md`).

## Configuration

Backend reads `application.yml` (production defaults, env-driven) plus the active profile's overlay (`application-dev.yml` is the local default; `prod` is set explicitly via `SPRING_PROFILES_ACTIVE=prod` in compose).

`spring.profiles.default: dev` means the `dev` profile is implicit when nothing is set, but `getActiveProfiles()` will still return empty in that case — assert against `getDefaultProfiles()` if you need to check this in tests.

Database, mail, JWT, and contact recipient are all driven by env vars (see `.env.example` locally and `deploy/*.env.example` on the server). `JWT_SECRET` has a default only in the dev profile; any other profile without it fails at startup with an error naming `JWT_SECRET` (`JwtProperties`). Database schema is managed by **Liquibase only** — Hibernate is configured with `ddl-auto: validate`. Add changelogs under `backend/src/main/resources/db/changelog/<context>/` and they will be auto-included by the master changelog (`db.changelog-master.xml` uses `<includeAll>` per context folder).

i18n message bundles live at `backend/src/main/resources/i18n/messages_{cs,en}.properties`. Czech is primary; English keys may be empty until translated. The default locale resolver reads the `Accept-Language` header.

## Conventions

- **Java**: prefer `record` for value objects, DTOs, and immutable configuration; constructor injection only (no field `@Autowired`); avoid Lombok unless explicitly requested.
- **No comments in code.** ArchUnit rules, expressive method/class names, and tests are the documentation. The exception is package-level `package-info.java` only when a package's role is non-obvious.
- **All identifiers, code, and commit messages in English.** UI strings and user-facing copy in Czech (with i18n keys for future English).
- **Never bypass DDD layer rules** to "get it working." If a layer rule blocks something, the design is wrong — surface the conflict to the user instead of relaxing the ArchUnit rule.
- **Database**: always Liquibase changelogs, never `ddl-auto: update` or raw `schema.sql`. One changelog file per logical change; never edit a checked-in changelog (write a new one).
- **Spring Boot 4 naming**: starter is `spring-boot-starter-webmvc` (not `-web`). Other starters follow the same pattern; check before assuming.
- **Cross-context communication**: prefer publishing a Spring `ApplicationEvent` from one context's application service and consuming it in another's `@EventListener`. Direct method calls across contexts are forbidden by ArchUnit.

## Current state

- **Backend**: `contact` is implemented end to end (`POST /api/contact/messages`, stored in `contact_message`, forwarded by email after commit) and keeps a message for a year: every day at 03:30 Prague time `infrastructure/retention/ContactMessageRetentionScheduler` runs `application/ContactMessageRetentionService`, which deletes the rows with `received_at` before now minus `app.contact.retention.max-age` (`P365D`) in one `DELETE` over `ix_contact_message_received_at` (cron `app.contact.retention.cron`, `-` turns it off, which every `@SpringBootTest` sets); the copy forwarded to the foundation's mailbox is not touched, and the privacy policy promises the year for the web database only. `donors` covers registration (person or company with IČO), sign-in, refresh-token sessions, sign-out and the profile (`/api/donors/auth/**`, `/api/donors/me`); the API is an OAuth2 resource server validating its own HS256 JWTs. Sign-in allows 10 requests per 15 minutes and registration 5 per hour per client address (`interfaces/rest/SignInRateLimiter` and `RegistrationRateLimiter`, built like the reset limiter): every request counts, successful or not, and a limited one answers 429 `donors/rate-limited` before any hashing or registration work. A sign-in with an unknown e-mail is compared against a real BCrypt cost-12 hash (`UNKNOWN_DONOR_HASH` in `DonorAuthenticationService`), so it costs the same as one with a real account; see "Sign-in and registration limits" in `docs/api-contract.md`. A donor who forgot the password asks for a link through `POST /api/donors/auth/password-reset/request` (always 202; `interfaces/rest/PasswordResetRateLimiter` allows 5 requests per hour per client address, then 429 `donors/rate-limited`) and sets a new one through `POST /api/donors/auth/password-reset/confirm` (204): `application/DonorPasswordResetService` stores at most three live links per donor in `donor_password_reset_token` (the SHA-256 of a 43-character `PasswordResetSecret`, valid for `app.donors.password-reset.token-ttl`, one hour) and publishes `DonorPasswordResetRequested`, which `infrastructure/mail/PasswordResetEmailSender` (`@Async AFTER_COMMIT`, send failures logged with the donor id and the exception class only) turns into the multipart e-mail with the link `{app.site.public-url}/obnova-hesla#token=…` from the `From` of `app.mail.sender-email`; the confirm marks the token used atomically, deletes the donor's other links, revokes every refresh token and clears the refresh cookie, and the donor signs in by hand. The rules, the table and the configuration are in "Password reset" in `docs/api-contract.md`. `donations` offers the QR payment (`GET /api/donations/payment-qr`, public: `donations/domain/payment/QrPayment` builds the SPAYD string, ZXing renders the PNG, the foundation's account comes from `app.donations.bank-account.*`) and holds the Fio import: every hour `FioImportScheduler` runs `ImportBankPaymentsService`, which asks the Fio API once for the period since `bank_import_state.covered_to` minus three days (the first run after a start may ask for locked history down to `FIO_HISTORY_FROM`), stores incoming CZK movements in `bank_payment` and pairs them into `donation` (`PaymentPairingService`: by variable symbol first, then, for payments without a symbol, through the one donor's `SenderAccountLink` whose period covers the booking day; a link is learned only from a payment with the donor's symbol, a newly learned one pairs the account's earlier payments unless another donor disconnected the account, then it starts the day after; accounts in `app.donations.pairing.excluded-accounts` (`PAIRING_EXCLUDED_ACCOUNTS`) are never learned). A signed-in donor sees and manages their accounts through `GET /api/donations/me/bank-accounts` and `POST .../{id}/disconnect|reconnect` (`application/bankaccount/DonorBankAccountsService`): a disconnect ends the link today and keeps its donations, a disconnected account is never relearned automatically, and a reconnect creates a link `AWAITING_PAYMENT` from today that the next payment with the symbol proves. Links live in `donor_sender_account` (one row per period, at most one live per donor and account), and `donation.sender_account_id` names the link a donation was paired through; see "Donor's bank accounts" in `docs/api-contract.md`. The dashboard also asks for an import on demand through `POST /api/donations/me/bank-check` (polled with `GET`): `application/importing/BankCheckService` requests one through the `BankImportRequests` port (implemented by `FioImportScheduler`, which queues an `ON_DEMAND` run on the scheduler thread; `DisabledBankImportRequests` without a token) unless `bank_import_state.last_attempted_at` is younger than `app.donations.import.on-demand-cooldown` (30 s, global, not per donor), and answers `bankDataAsOf` (the last success) and `checking`; in tests `support/SynchronousBankImportRequests` (`@Primary`) runs the import in the request thread. A signed-in donor reads their donations through `GET /api/donations/me` (optional `year`, newest first with the total and count of `RECEIVED` ones) and `GET /api/donations/me/summary` (total, count, last receipt day, totals per year): `interfaces/rest/DonorDonationsController` calls the read-only `application/overview/DonorDonationsService`, which builds the domain's `DonationList` and `DonationSummary` from `DonationRepository.findByDonorNewestFirst`; the purpose text comes from `donation.purpose.general` in the message bundles by `Accept-Language`. The donor downloads PDF receipts through `GET /api/donations/me/{id}/receipt` (one `RECEIVED` donation) and `GET /api/donations/me/receipts/yearly?year=` (a completed Prague calendar year, from 1 January; `FoundationCalendar` holds the zone): `interfaces/rest/DonationReceiptController` calls `application/receipt/DonationReceiptService`, and `DonationReceiptIssuer` (one `REQUIRES_NEW` transaction per download with the donor's `donor_record` row locked) serves the active receipt or, on the first download and whenever the certified data (the donations, the donor's name and address, hashed into a fingerprint) has changed, renders a new one with the next number `YYYY-NNNNNN` from `donation_receipt_number_seq` that supersedes the old; an issued receipt never changes and keeps the donor's preferred language of that moment (`en` is bilingual). No PDF is stored: `donation_receipt` keeps the receipt's pre-formatted `data` (JSON) and the SHA-256 digests of the template bundle (markup plus `receipt.*` texts, in `receipt_template`), the logo and the signature (in `receipt_image`), each stored once, and every download renders it again byte for byte (CreationDate is `issued_at`, the `/ID` comes from the number). `ReceiptRenderingLimit` lets `app.donations.receipt.concurrent-renders` (3) downloads render at once. `infrastructure/pdf/ThymeleafPdfReceiptRenderer` (`freeze` and `render`, render profile 1) renders the stored bundle with its own string-template Thymeleaf engine and openhtmltopdf with the embedded DejaVu Sans fonts (`resources/fonts/`, pinned by `ReceiptTemplateHistoryTest`, which also renders every recorded bundle in `src/test/resources/receipts/history/` from its sample data); the foundation's identity, the issue place, the signatory and the optional signature image come from `app.donations.receipt.*` (`RECEIPT_SIGNATORY_NAME`, `RECEIPT_SIGNATORY_ROLE`, `RECEIPT_SIGNATURE_IMAGE`; see `deploy/README.md`), and openhtmltopdf, PDFBox and Thymeleaf are allowed only in `..infrastructure..` (ArchUnit). The rules, the table and the configuration are in "PDF receipts" in `docs/api-contract.md`. `donor_record` is the donations copy of each donor, filled by `infrastructure/events/DonorRecordSynchronizer` from the shared `DonorRegistered` (copy `BEFORE_COMMIT`, pairing synchronously `AFTER_COMMIT` in `REQUIRES_NEW`) and `DonorProfileChanged` events. Without `FIO_TOKEN` the import is off: the `FioClient` bean is `DisabledFioClient` and there is no scheduler bean; every `@SpringBootTest` pins `app.donations.fio.token=`. The Fio client is the published library `io.github.bzumik1:fio-api` from Maven Central, built with `RateLimit.failFast()` so a refused or held-back request becomes a follow-up instead of blocking the scheduler thread; its package `io.github.bzumik1.fio..` is allowed only in `donations/infrastructure/fio` (ArchUnit). The rules, tables and configuration are in "Fio import and pairing" in `docs/api-contract.md`. Every day at 07:00 Prague time `infrastructure/report/MonthlyReportScheduler` (`app.donations.report.cron`, off with `-` or empty, pinned to `-` in every `@SpringBootTest`) runs `application/report/MonthlyReportService.sendDueReport`, which e-mails the previous month's statistics (registered and new donors, `RECEIVED` donations of the month and of the year to date, unpaired incoming payments of the month, the last bank import success and failure; `domain/report/MonthlyReport`, `templates/email/donations/monthly-report.html`) to `app.donations.report.recipient` (`REPORT_RECIPIENT`, defaulting to `CONTACT_RECIPIENT`) from `app.mail.sender-email`; the month is recorded in `donation_monthly_report` in the same transaction as the send, so a restart, a second instance or a missed 1st still sends it once, and a refused send rolls the record back and is retried the next morning. Besides informing the foundation it keeps the Brevo SMTP key alive (Brevo cancels a key unused for 90 days); see "Monthly report" in `docs/api-contract.md`. `shared` holds `EmailAddress`, `UuidV7`, `Money`, `Currency`, `Iban`, `VariableSymbol`, `PostalAddress`, `LocaleCode`, `DonorType`, the sealed `DomainException` family, the cross-context events in `shared/application/event/`, the security filter chain and JWT configuration, the problem+json exception handler, the rate limiter, the `Clock` bean, `@EnableScheduling` (`shared/infrastructure/scheduling/SchedulingConfiguration`; Boot's `TaskScheduler` has one thread), `shared/infrastructure/mail/MailSenderProperties` (`app.mail.sender-email` from `MAIL_FROM`, falling back to `CONTACT_RECIPIENT`: the `From` of every outgoing e-mail, the contact forwarder included) and `shared/infrastructure/config/PublicUrlProperties` (`app.site.public-url` from `PUBLIC_URL`, the address visitors use, validated at startup, for links in e-mails); see "Shared pieces" in `docs/api-contract.md`. `content` is still an empty package.
- **Frontend**: the public site and the donor portal are built as components, with the site's own icons (`public/favicon.svg`, `favicon.ico`, `apple-touch-icon.png`, the logo's star); the contact form (`features/contact/contact-api.ts`, with a line under the button linking the privacy policy), the QR payment in the donate section (`features/donations/payment-qr-api.ts`; the home page passes a signed-in donor's variable symbol into it) and the donor account (`core/auth/`: `AuthStore`, `authInterceptor`, `donorGuard`, the sign-in/registration dialog, which answers a 429 on sign-in or registration with "Příliš mnoho pokusů z této adresy. Zkuste to prosím za chvíli znovu.", the dashboard header) talk to the backend. So do the dialog's "Obnovit heslo" tab (`AuthApi.requestPasswordReset`, "E-mail odeslán!" on 202, its own sentence on 429) and the public page `/obnova-hesla` (`features/donors/password-reset/`, lazy under the public shell): it reads the token from the URL fragment once, removes it from the address bar with `Location.replaceState`, asks for the new password twice and posts `AuthApi.confirmPasswordReset`; on 204 it ends a session the browser still holds and offers the sign-in dialog, and an invalid or missing link offers the dialog's reset tab through `LoginDialogService.open(mode)` (`login` | `register` | `reset`, read once by the dialog as its initial tab). `core/auth/api-problem.ts` (`describeProblem`) turns a problem body into one line for both, and `PASSWORD_MIN_LENGTH` lives in `core/auth/donor.ts`. The dashboard's "Moje bankovní účty" card (`features/donors/dashboard/bank-accounts-card/`, `features/donations/bank-accounts-api.ts`) lists the accounts, disconnects and reconnects them and explains adding one with a 1 Kč QR payment; a payment paired by account carries the tag "bez VS". The dashboard's stat cards, year toggle and payments table read `GET /api/donations/me/summary` and `GET /api/donations/me` through `features/donations/donations-api.ts` (`DonationsApi`); on open and on "Obnovit" it posts the bank check, shows "Údaje z banky k …" or "Kontrolujeme nové platby v bance…", polls while `checking` and reloads the donations when the bank data changed; the "↓ PDF za rok" and "Stáhnout PDF" buttons download the receipts through `DonationsApi.yearlyReceipt` / `singleReceipt` (blob responses, the file name from `Content-Disposition`) and save them with `features/donations/file-download.ts` (`saveBlob`); `authInterceptor` parses an `application/problem+json` Blob body into the `HttpErrorResponse` first, so the problem types and the expired-token refresh work for downloads too. `provideHttpClient(withFetch(), withInterceptors([authInterceptor]))` and the session restore on start are in `app.config.ts`; `npm start` proxies `/api` through `proxy.conf.json`.
- **Verified to pass on a clean checkout** (with Docker daemon available): `./gradlew test` and `npm run build`.

When implementing a new feature, expect to create files across all four layers of the relevant bounded context, plus a Liquibase changelog, a `.feature` file, unit tests, and the corresponding Angular feature folder.
