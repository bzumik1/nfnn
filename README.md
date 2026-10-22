# Nadační fond Nová naděje

Web nadačního fondu — Spring Boot 4 (Java 25, DDD) + Angular 21.

## Struktura

```
backend/         Java backend (Spring Boot, Gradle)
frontend/        Angular frontend
deploy/          Compose a šablony env pro produkci na ZimaOS
docs/            Zadání, API kontrakt, přehled systému a frontendu
.claude/         Pravidla, skills, agenti a hooky pro Claude Code
docker-compose.yml   Lokální stack (postgres + backend + frontend)
```

## Lokální vývoj

### Backend

```bash
cd backend
./gradlew bootTestRun     # spustí backend i s Postgres přes Testcontainers, nepotřebuje lokální DB
```

Bez Testcontainers (přes `docker compose` Postgres):

```bash
docker compose up -d postgres
cd backend
./gradlew bootRun
```

Backend poběží na `http://localhost:8080`. JDK 25 si Gradle stáhne sám (toolchain) — lokálně stačí JDK 17+.

### Frontend

> Vyžaduje **Node 22 nebo 24 LTS**. Node 25 není Angularem podporován.

```bash
cd frontend
npm ci
npm start                   # dev server na http://localhost:4200, /api proxy na backend
```

## Testy

| | Backend | Frontend |
|---|---|---|
| Unit | `./gradlew test` (potřebuje Docker) | `npm test -- --watch=false` |
| Cucumber / E2E | `./gradlew test --tests "*AcceptanceTests"` | `npm run e2e` |
| Bez Dockeru | `./gradlew test --tests "*architecture*" -PnoCucumber` | `npm run format:check`, `npm run lint`, `npm run lint:styles`, `npm run build` |

## Produkční nasazení (ZimaOS)

Merge do `main` postaví Docker image do ghcr.io, na Zimě běží jako aplikace z `deploy/compose.yml` (ZimaOS → Custom Install). Instalace, nasazení nové verze, zálohy a obnova jsou v [deploy/README.md](deploy/README.md).

Lokálně celý stack spustíš přes `cp .env.example .env && docker compose up -d --build`, frontend pak běží na `http://localhost:8080`.

## Architektura

Pravidla pro vývoj jsou v [CLAUDE.md](CLAUDE.md) a `.claude/rules/`; jak systém dnes funguje, v [docs/system-overview.md](docs/system-overview.md) a [docs/frontend-overview.md](docs/frontend-overview.md); HTTP kontrakt v [docs/api-contract.md](docs/api-contract.md).
