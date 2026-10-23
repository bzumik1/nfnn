# CLAUDE.md

Web of Nadační fond Nová naděje (nfnn.cz): public site, donor portal with PDF donation receipts, contact form. Gifts arrive by bank transfer and are imported from the Fio API. Czech UI; English code, identifiers, commits.

Read before building, update in the same PR: `docs/requirements.md` (client decisions, Czech), `docs/api-contract.md` (HTTP contract), `docs/system-overview.md` (how each context works today), `docs/frontend-overview.md` (what the Angular app contains), `deploy/README.md` (server, Czech).

## Layout

| Path | What |
|---|---|
| `backend/` | Spring Boot 4.0, Java 25, Gradle Kotlin DSL. Strict DDD: `cz.novanadeje.app.{content,donors,donations,contact,operations}` + `shared`, each `domain / application / infrastructure / interfaces/rest`, enforced by ArchUnit |
| `frontend/` | Angular 22 standalone, zoneless, signals, SCSS design tokens, Vitest, Playwright + axe |
| `deploy/` | ZimaOS compose and env templates (production); `docker-compose.yml` at the root is the local stack |
| `.github/workflows/` | `pr-check.yml` on every PR; `images.yml` on push to `main` publishes ghcr.io images |
| `.claude/rules/` | `backend.md`, `frontend.md`, `testing.md`, `security.md`, `reliability.md` load with this file. `deploy-ci.md` (deploy, CI, backups) loads only when a file under `deploy/`, `.github/`, a Dockerfile or nginx config is opened; a claude.ai project thread never loads it, so read it before touching those files |

## Commands

| Backend, in `backend/` | |
|---|---|
| `./gradlew test` | everything; needs Docker (Testcontainers PostgreSQL, Cucumber) |
| `./gradlew test --tests "*architecture*" -PnoCucumber` | ArchUnit only, no Docker (`-PnoCucumber` leaves out the Cucumber suite, which `--tests` cannot filter) |
| `./gradlew test --tests "*AcceptanceTests"` | Cucumber suite |
| `./gradlew bootTestRun` | app with Testcontainers PostgreSQL; `bootRun` uses an external Postgres (`dev` profile) |
| **Frontend, in `frontend/`** (Node 22.22.3+ or 24.15+; 25 is unsupported) | |
| `npm ci`, `npm start` | dependencies; dev server :4200 with `/api` proxied to :8080 |
| `npm run format`, `npm run format:check` | Prettier over `src/`, `e2e/` and the config files; the check runs in CI |
| `npm run lint` | ESLint (angular-eslint): TypeScript, templates and their accessibility; runs in CI |
| `npm run lint:styles` | Stylelint: component styles use theme tokens only |
| `npm test -- --watch=false` | Vitest |
| `npm run build` | production build to `dist/frontend/browser/` |
| `npm run e2e` | Playwright; when it reports a missing browser build (cloud sessions ship an older Chromium), run `npx playwright install chromium` once |
| **Stack** | `cp .env.example .env && docker compose up -d --build`, frontend on :8080; `JWT_SECRET` has no default |

## Production logs

The server writes `backend.log` (Spring Boot, rotated) and `backup.log` into `/DATA/AppData/nfnn/logs/`, served read-only by the `nfnn-ops` container behind a Cloudflare tunnel and Cloudflare Access at `https://ops.nfnn.cz` (`deploy/README.md`, "Logy pro Clauda"). With `NFNN_OPS_CLIENT_ID` and `NFNN_OPS_CLIENT_SECRET` in the environment:

```bash
h=(-H "CF-Access-Client-Id: $NFNN_OPS_CLIENT_ID" -H "CF-Access-Client-Secret: $NFNN_OPS_CLIENT_SECRET")
curl -sS "${h[@]}" https://ops.nfnn.cz/info                                   # {"build":{"revision":"<short sha>"}}
curl -sS "${h[@]}" https://ops.nfnn.cz/health
curl -sS "${h[@]}" -H 'Range: bytes=-50000' https://ops.nfnn.cz/logs/backend.log   # the tail; /logs/ lists the files
curl -sS "${h[@]}" https://ops.nfnn.cz/logs/backup.log
```

After a deploy, check `/info` against the merge commit and `Backend revision … is ready` in the log. The logs carry ids and outcomes, never names or tokens; quote them in a thread only as far as needed. Without the two variables (or a 403) the tunnel or the token is not set up: ask Jakub, never guess at the server.

## Non-negotiable

- Test first: failing test, smallest change, refactor. Given/when/then naming everywhere (`testing.md`).
- ArchUnit enforces layering and context isolation. Never relax a rule or call across contexts; surface the conflict.
- Schema only through Liquibase (`ddl-auto: validate`); never edit a checked-in changelog.
- No comments in code; `record` for values, DTOs and config; constructor injection (Java) or `inject()` (Angular); no Lombok.
- Czech copy carries i18n ids; identifiers, commits and PR titles are English and imperative.
- Every change is a branch and a PR to `main`; CI green before merge. Claude may merge its own green PR (Jakub, 2026-10-17). Deploy stays manual (`deploy-ci.md`).

## Done means

1. New tests failed first and pass now. `./gradlew test` and `npm run format:check && npm run lint && npm run lint:styles && npm test -- --watch=false && npm run build && npm run e2e` pass. Without Docker: `--tests "*architecture*" -PnoCucumber` plus the touched test classes (`--tests "*Name*" -PnoCucumber`), and the PR says so.
2. Docs the change touches are updated (contract, overview, requirements for a client decision, `deploy/README.md` for operations).
3. A visible UI change has before/after screenshots at 390 and 1280 px attached (skill `visual-check`).
4. The PR body names anything that reaches the server only by hand (compose, env templates, Nginx Proxy Manager, Fio).

## Gotchas

- ArchUnit must be ≥ 1.5 for Java 25 class files; 1.4 imported nothing and every rule passed vacuously, so rules now fail on an empty match.
- Every `@SpringBootTest` pins `app.donations.fio.token=`, `app.donations.report.cron=-`, `app.contact.retention.cron=-`.
- `build.gradle.kts` sets `TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE=/var/run/docker.sock`; keep it.
- A receipt template or `receipt.*` text change fails `ReceiptTemplateHistoryTest` until its candidate is reviewed and committed (skill `receipt-template`).
- `@angular/localize` is wired in; never run `ng add @angular/localize` again. Never use H2.
- `db/changelog/content/.gitkeep` stays: the master changelog's `includeAll` needs every context folder to exist, and a missing one stops the backend at startup.
- `spring.profiles.default: dev`: `getActiveProfiles()` is empty then; assert on `getDefaultProfiles()`.
- The original HTML prototype was removed from the repo (git history keeps it); the theme in `frontend/src/styles/themes/_nova-nadeje.scss` and the existing components are the visual reference.
