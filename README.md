# Nadační fond Nová naděje

Web nadačního fondu — Spring Boot 4 (Java 25, DDD) + Angular 21.

## Struktura

```
backend/         Java backend (Spring Boot, Gradle)
frontend/        Angular frontend
Claude Design/   HTML prototyp s designem (zdrojový vzor)
docker-compose.yml   Stack pro ZimaOS (postgres + backend + frontend)
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
npm install
ng add @angular/localize    # jednorázově při prvním checkoutu
npm start                   # dev server na http://localhost:4200, /api proxy na backend
```

## Testy

| | Backend | Frontend |
|---|---|---|
| Unit | `./gradlew test` | `npm test` |
| Cucumber / E2E | `./gradlew test --tests "*AcceptanceTests"` | `npm run e2e` |

## Produkční nasazení (ZimaOS)

Merge do `main` postaví Docker image do ghcr.io a runner na Zimě je hned nasadí z `deploy/compose.yml`. Jednorázové nastavení, zálohy a obnova jsou v [deploy/README.md](deploy/README.md).

Lokálně celý stack spustíš přes `cp .env.example .env && docker compose up -d --build`, frontend pak běží na `http://localhost:8080`.

## Architektura

Detaily DDD vrstev, bounded contextů, testovacích konvencí a pravidel jsou v [CLAUDE.md](CLAUDE.md).
