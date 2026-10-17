# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Web application for the foundation **Nadační fond Nová naděje**. Czech-language site (i18n-ready for English) with a public marketing site, content administration, donor portal with PDF donation receipts, and a contact form.

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
- PDF receipts: Thymeleaf templates in `src/main/resources/templates/pdf/`, rendered via `openhtmltopdf-pdfbox`

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

**Smoke feature placeholder:**
A trivial `smoke.feature` + `SmokeStepDefinitions` exists so `./gradlew test` is green on a fresh checkout. The file's own comment block instructs to remove it once real features exist. Do not build on top of it — the moment you add the first real feature in any bounded context, delete `smoke.feature` and `SmokeStepDefinitions.java`.

**ArchUnit scaffolding accommodations:**
The DDD layering rule uses `withOptionalLayers(true)` and the slices rule uses `allowEmptyShould(true)`. These exist solely because the project starts with empty layers. Once each layer in each bounded context has at least one real class, consider tightening these rules (drop the flags) — it's stricter and catches more.

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
- `.github/workflows/images.yml` runs on a push to `main` on GitHub's runner and pushes `ghcr.io/bzumik1/nfnn-backend` and `-frontend` (`latest` and the short SHA, private packages).
- Deploying is manual for now: on ZimaOS, `/DATA/AppData/nfnn/` holds a copy of `deploy/compose.yml` and the `.env`, and `docker compose pull && docker compose up -d --wait` there starts the new images. A change to `deploy/compose.yml` or `deploy/env.example` reaches the server only when someone copies it there; say so in the PR. Automating this with a self-hosted runner like kocarky's is planned; that runner would need the Docker socket, so the repo must stay private.
- Secrets live only in `/DATA/AppData/nfnn/.env` on the server (`deploy/env.example` lists them). GitHub needs no secrets: `GITHUB_TOKEN` pushes the images.
- Port 8080 is taken on the ZimaOS box; the frontend publishes 8089. Nginx Proxy Manager terminates TLS for `nfnn.znamenacek.duckdns.org` and forwards to it.
- The `backup` service writes a daily `pg_dump` to `/DATA/AppData/nfnn/backups/`.
- The mail health indicator is off, so `/actuator/health` (the backend's Docker healthcheck) does not go DOWN when SMTP is missing or unreachable.
- Cache headers live in `frontend/nginx.conf`: `index.html` is `no-cache`, hashed bundles are immutable, `public/images/` is cached for an hour. A location with its own `add_header` drops inherited ones, so each location includes `nginx-security-headers.conf`.

## Configuration

Backend reads `application.yml` (production defaults, env-driven) plus the active profile's overlay (`application-dev.yml` is the local default; `prod` is set explicitly via `SPRING_PROFILES_ACTIVE=prod` in compose).

`spring.profiles.default: dev` means the `dev` profile is implicit when nothing is set, but `getActiveProfiles()` will still return empty in that case — assert against `getDefaultProfiles()` if you need to check this in tests.

Database, mail, JWT, and contact recipient are all driven by env vars (see `.env.example`). Database schema is managed by **Liquibase only** — Hibernate is configured with `ddl-auto: validate`. Add changelogs under `backend/src/main/resources/db/changelog/<context>/` and they will be auto-included by the master changelog (`db.changelog-master.xml` uses `<includeAll>` per context folder).

i18n message bundles live at `backend/src/main/resources/i18n/messages_{cs,en}.properties`. Czech is primary; English keys may be empty until translated. The default locale resolver reads the `Accept-Language` header.

## Conventions

- **Java**: prefer `record` for value objects, DTOs, and immutable configuration; constructor injection only (no field `@Autowired`); avoid Lombok unless explicitly requested.
- **No comments in code.** ArchUnit rules, expressive method/class names, and tests are the documentation. The exception is package-level `package-info.java` only when a package's role is non-obvious.
- **All identifiers, code, and commit messages in English.** UI strings and user-facing copy in Czech (with i18n keys for future English).
- **Never bypass DDD layer rules** to "get it working." If a layer rule blocks something, the design is wrong — surface the conflict to the user instead of relaxing the ArchUnit rule.
- **Database**: always Liquibase changelogs, never `ddl-auto: update` or raw `schema.sql`. One changelog file per logical change; never edit a checked-in changelog (write a new one).
- **Spring Boot 4 naming**: starter is `spring-boot-starter-webmvc` (not `-web`). Other starters follow the same pattern; check before assuming.
- **Cross-context communication**: prefer publishing a Spring `ApplicationEvent` from one context's application service and consuming it in another's `@EventListener`. Direct method calls across contexts are forbidden by ArchUnit.

## Current state of the scaffold

- **Backend**: empty bounded contexts (only `package-info.java` per package). One smoke `.feature` and its glue exist solely to keep the test suite green and wired. `AppApplication.java` is the Spring Boot entry point. No domain code, no REST endpoints, no JPA entities, no Liquibase changelogs, no email or PDF templates.
- **Frontend**: default Angular welcome page in `src/app/app.{ts,html,scss}`. Empty feature folders under `src/app/features/`. No real components, no routes beyond the default, no real i18n strings.
- **Verified to pass on a clean checkout** (with Docker daemon available): `./gradlew test` (4 tests in ~11s) and `npm run build` (~2.5s). All ArchUnit DDD rules currently pass against the empty scaffold.

When implementing a new feature, expect to create files across all four layers of the relevant bounded context, plus a Liquibase changelog, a `.feature` file, unit tests, and the corresponding Angular feature folder.
