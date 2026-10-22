---
name: new-feature
description: Implement a feature end to end (bounded context, tests first, Liquibase, REST, Angular, docs) in the order the project rules require
---
# New feature checklist

1. Owner: name the bounded context. A concept spanning two means a wrong boundary or a missing context: say so before coding. Read `docs/requirements.md` (client decisions) and `docs/system-overview.md` (what exists).
2. Contract first: endpoints, records, problem types and rules into `docs/api-contract.md`.
3. Acceptance: `features/<context>/<use_case>.feature` with the happy path and every rule, steps in `<context>/cucumber/`; watch it fail.
4. Domain: value objects, aggregate behaviour, domain service if a rule spans aggregates; unit tests; sealed `DomainException` subtype with `problem.<code>.*` texts in cs and en.
5. Application: use case service (`@Transactional`), command and view records, ports for anything external.
6. Infrastructure: JPA entity and adapter, Liquibase `db/changelog/<context>/NNN_<change>.xml`, external adapters; a Testcontainers test per new query.
7. REST: controller with request/response records and validation; `permitAll` line and a rate limiter when public.
8. Frontend: `features/<context>/<name>-api.ts` with DTOs, components with specs, i18n ids on every text, e2e journey on `mockDonorApi`, an axe case for a new page or dialog, screenshots (skill `visual-check`).
9. Docs: `docs/system-overview.md` paragraph; `docs/requirements.md` when the client decided something; `deploy/README.md`, `deploy/backend.env.example` and `.env.example` for a new setting.
10. Run everything (`testing.md`, Running). PR body: what and why, manual server steps, screenshots.
