---
name: new-feature
description: Implement a feature end to end (bounded context, tests first, Liquibase, REST, Angular, MCP tool, docs) in the order the project rules require
---
# New feature checklist

1. Owner: name the bounded context. A concept spanning two means a wrong boundary or a missing context: say so before coding. Read the relevant parts of `docs/requirements.md` (client decisions) and `docs/system-overview.md` (what exists).
2. Contract first: endpoints, records, problem types and rules into `docs/api-contract.md`.
3. Acceptance: `features/<context>/<use_case>.feature` with the happy path and every rule, steps in `<context>/cucumber/`; watch it fail. Cover what `testing.md` lists for a new feature (401, 404 for another donor's resource, limits, time boundaries).
4. Domain: value objects, aggregate behaviour, domain service if a rule spans aggregates; unit tests; sealed `DomainException` subtype with `problem.<code>.*` texts in cs and en.
5. Application: use case service (`@Transactional`, or none when it calls the network or renders, `backend.md`), command and view records, ports for anything external.
6. Infrastructure: JPA entity and adapter, Liquibase `db/changelog/<context>/NNN_<change>.xml` that the previous image survives, external adapters; a Testcontainers test per new query.
7. REST: controller with request/response records and validation; a public endpoint gets its `permitAll` line and a rate limiter; an administration endpoint lives under `/api/admin/<context>/...`, publishes `AdminActionPerformed` for every change, and is either web-only (dangerous or irreversible: guarded by `BrowserSessionAuthorizationManager`, `security.md`) or gets its connector tool.
8. Connector: for an administration read or reversible change, the tool in `mcp/src/tools/reading.ts` or `writing.ts` (`admin:write` for a change) with a case in `mcp/test`; `npm run check`.
9. Frontend: `features/<area>/<name>-api.ts` with DTOs, components with specs, i18n ids on every text; an administration page goes to `features/admin/<page>/` with its calls in `admin-api.ts`, a route in `admin.routes.ts` and an entry in `ADMIN_SECTIONS`; e2e journey with every `/api` call mocked, an axe case for a new page or dialog, screenshots (skill `visual-check`).
10. Docs: `docs/system-overview.md`, `docs/frontend-overview.md` for every page, route, service or shared piece, `docs/security-overview.md` for a security mechanism, `docs/requirements.md` when the client decided something, `deploy/README.md` for an operator step. A value the server's operator sets becomes a `Setting` in `operations/domain/settings` with a label in `frontend/src/app/features/operations/setting-labels.ts` (and in the connector's settings tool when it is not a secret).
11. Run everything (`CLAUDE.md`, Done means). PR body: what and why, manual server steps, screenshots.
