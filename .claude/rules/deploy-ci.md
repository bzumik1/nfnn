---
paths:
  - "deploy/**"
  - ".github/**"
  - "docker-compose.yml"
  - ".env.example"
  - "backend/Dockerfile"
  - "frontend/Dockerfile"
  - "frontend/nginx*.conf"
---
# Deployment and CI

Server setup and every operator step are in `deploy/README.md` (Czech); modelled on `bzumik1/kocarky`. Deploy is manual by decision (Jakub, 2026-10-17): a self-hosted runner with the Docker socket was rejected, so never run a PR's code on the server.

## Pipelines

- `pr-check.yml`, every PR to `main`, GitHub runner: `./gradlew build` (Testcontainers works there), `npm run format:check`, `npm run lint`, `npm run lint:styles`, `ng test`, `npm run build`, Playwright e2e, then both images built and `deploy/compose.yml` started and probed. Its stack job fills the env templates with fresh `openssl rand -hex 32` values and fails when a template loses `POSTGRES_PASSWORD`/`PGPASSWORD`/`DB_PASSWORD` or `JWT_SECRET`, when `deploy/compose.yml` names a secret key (`POSTGRES_PASSWORD`, `PGPASSWORD`, `DB_PASSWORD`, `JWT_SECRET`, `MAIL_PASSWORD`, `FIO_TOKEN`), when postgres or backup receives a backend secret, when the compose holds a `$`, or when a template value (commented or not) would not survive ZimaOS's YAML re-typing (see below).
- `images.yml`, push to `main`: pushes `ghcr.io/bzumik1/nfnn-backend` and `-frontend` as `latest` and the short SHA. The packages are public (switched once on GitHub, not by the workflow) so ZimaOS pulls without logging in; the images hold no secrets.

## ZimaOS install and update

- `deploy/compose.yml` is pasted unchanged into ZimaOS → App Store → Custom Install as the app "Nová naděje". It holds no `${...}`, no secrets and no per-server values. A change to it or to an env template reaches the server only by hand (paste again / edit the file there): say so in the PR.
- New version: after "Publish Docker images" is green, Save the app's settings in ZimaOS without changes; that pulls the new `latest` and recreates the containers (Update and a plain restart keep the old image). Save reuses the compose and env values of the last install, so a changed compose or env file needs uninstall + Custom Install. Verify with `docker inspect` label `org.opencontainers.image.revision`.
- ZimaOS quirks the files are written around: it stores the compose without `$$` escapes (any `$` becomes an empty variable; the backup command uses backticks); it replaces the project name with `compose-<hash>` (every service sets `container_name: nfnn-<service>`); it runs the app on the default `bridge` network without service DNS (every service sets `network_mode: bridge` and reaches others through `links:`: backend → postgres, backup → postgres, frontend → backend; a new service that talks to another needs a `links:` entry); it starts the app once, so `depends_on` uses `service_started`, never `service_healthy` (the backend restarts until Postgres accepts connections, the backup loop waits with `pg_isready`); it adds a memory reservation and silently never creates a container whose `limits.memory` is below it, so no limit goes under 256M; port 8080 is taken on the box, the frontend publishes 8089.
- ZimaOS copies the env files' values into its stored compose as `environment:` at install time (seen 2026-10-18) and re-types them as YAML: an unquoted `2025-01-01` reached the backend as `2025-01-01 00:00:00 +0000 UTC`. `FIO_HISTORY_FROM` is the one allowed date and `BankImportProperties` accepts that form; every other value must read as the same string, a plain integer or `true`/`false`.

## Secrets and configuration

- Two env files on the server, read through `env_file` (short syntax, absolute paths), never mounted: `/DATA/AppData/nfnn/env/db.env` holds the database password as `POSTGRES_PASSWORD`, `PGPASSWORD` and `DB_PASSWORD` and goes to postgres, backup and backend; `backend.env` holds `JWT_SECRET`, `FIO_TOKEN`, `MAIL_*` and the optional `MAIL_FROM`, `CONTACT_RECIPIENT`, `REPORT_RECIPIENT`, `PUBLIC_URL`, `FIO_HISTORY_FROM`, `RECEIPT_*`, `PAIRING_EXCLUDED_ACCOUNTS` and goes to the backend only. Templates: `deploy/db.env.example`, `deploy/backend.env.example`; `.gitignore` ignores every filled `*.env`. Both files must exist before the install (compose refuses a missing `env_file`).
- An empty value is not an absent one for Spring (empty `MAIL_FROM`, `PUBLIC_URL` or `RECEIPT_SIGNATORY_NAME` stops the startup): an optional line whose empty value is invalid or changes behaviour stays commented out in the template, with its default as the example.
- A key under `environment:` overrides `env_file`, so the compose keeps only `SPRING_PROFILES_ACTIVE`, `DB_URL`, `DB_USERNAME`, `JAVA_TOOL_OPTIONS`, `TZ` and the database names. `JWT_SECRET` has a default only in `application-dev.yml`; any other profile without it stops at startup.
- Bind mounts under `/DATA/AppData/nfnn/`: postgres data, `backups/`, and `config/` mounted read-only as `/config` in the backend (the receipt signature image).

## Proxy, headers, mail

- Nginx Proxy Manager terminates TLS for `nfnn.znamenacek.duckdns.org` and forwards to 8089. The real domain `nfnn.cz` (WEDOS, holder the foundation) goes through Cloudflare like kocarky's: "Přechod na skutečnou doménu" in `deploy/README.md`. `novanadeje.cz` belongs to someone else: never use it in addresses or URIs.
- The backend trusts forwarded headers from any peer (`server.forward-headers-strategy: framework`), so `frontend/nginx.conf` resolves the visitor itself: `set_real_ip_from` the private ranges, `real_ip_header X-Forwarded-For`, `real_ip_recursive on`, then sends `X-Forwarded-For $remote_addr` and an emptied `Forwarded`; a client cannot pick the address the per-address limits count. Behind Cloudflare, NPM must take the address from `CF-Connecting-IP` ("Obnova hesla" in the README).
- Cache headers in `frontend/nginx.conf`: `index.html` `no-cache`, hashed bundles immutable, `public/images/` one hour. A location with its own `add_header` drops the inherited ones, so each location includes `nginx-security-headers.conf`.
- Mail for `info@nfnn.cz` arrives through Cloudflare Email Routing; the backend sends through Brevo's SMTP relay ("E-maily" in the README; SPF stays Cloudflare's, Brevo aligns through DKIM). The mail health indicator is off, so `/actuator/health` (the Docker healthcheck) stays UP without SMTP.

## Backups and rollback

- The `backup` service writes a daily `pg_dump` to `/DATA/AppData/nfnn/backups/`. A restore drops and recreates the `public` schema, then `pg_restore --exit-on-error --single-transaction` (`--clean` leaves newer tables behind and Liquibase fails on them). Rollback: the older short-SHA image tag in the ZimaOS app settings, plus a restore when the newer version changed the schema; "Zálohy" in the README.
