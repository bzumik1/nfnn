# API Contract — NFNN

Agreed HTTP API contract between Angular 21 frontend and Spring Boot 4 + DDD backend. This document is the source of truth for endpoint shape, auth flow, error format, and bounded-context allocation. It is the result of a frontend/backend design pass against the prototype in `Claude Design/Nova Nadeje.html` and the architecture in `CLAUDE.md`.

When adding a new endpoint, update this file in the same change.

## Conventions

- All endpoints under `/api/<context>/...`. Contexts: `content`, `donors`, `donations`, `contact`. No cross-context HTTP calls — use `ApplicationEvent` for behavioral coordination.
- JSON in / JSON out. Exception: PDF receipts return `application/pdf`, media returns image binary.
- Errors follow RFC 7807 `application/problem+json` (Spring `ProblemDetail`). `type` URI namespace: `https://novanadeje.cz/problems/<context>/<code>`. Per-field validation errors carried in an `errors: [{ field, message }]` array.
- Identifiers: UUIDv7 (string) for all entity IDs. Public URLs for content use `slug` (kebab-case, unique, immutable after publish); admin URLs use `id`.
- Money: `{ amountMinor: long, currency: "CZK" }`. Domain value object `Money` lives in `shared/domain/`. Sealed `Currency` (CZK only for now).
- Dates: ISO-8601. `LocalDate` as `YYYY-MM-DD`, instants as `YYYY-MM-DDTHH:MM:SSZ`. UI formatting (e.g. `15. 03. 2026`) is the frontend's job.
- Locale signaling: frontend sends `Accept-Language: cs` (default) or `en` on every request via HTTP interceptor. Used for `ProblemDetail` titles/details and (later) translated CMS content. **Exception:** PDF receipts use `donor.preferredLocale` from the profile, not `Accept-Language`, so generated PDFs are deterministic.
- Pagination response shape, uniform across the API:
  ```json
  { "items": [...], "page": 0, "size": 20, "totalElements": 42, "totalPages": 3 }
  ```
- CORS: not configured. Production is same-origin via the nginx in `frontend/Dockerfile`; dev uses Angular's `proxy.conf.json`. Re-evaluate if a non-browser client appears.
- HTML body fields (news / projects long-form text): backend sanitizes on **write** with a jsoup whitelist. Frontend renders as-is.
- Caching: public CMS GETs return `Cache-Control: public, max-age=60` and an `ETag`. Yearly receipt PDFs return `Last-Modified`. Listing endpoints support `If-None-Match`.

## Authentication

JWT-based, scoped to `donors` bounded context. Roles in JWT claims: `DONOR`, `ADMIN` (no separate admin bounded context — admins are donors with elevated role).

| Token | Lifetime | Storage (frontend) | Transport |
|---|---|---|---|
| Access | ~15 min | In-memory only (no localStorage) | `Authorization: Bearer ...` header |
| Refresh | ~14 days | HttpOnly + Secure + SameSite=Strict cookie, path `/api/donors/auth/refresh` | Set-Cookie on login/refresh; sent automatically by browser |

Refresh tokens are stored server-side (`donor_refresh_token` table) and rotated on every refresh (anti-replay). Logout invalidates the current refresh token.

Password rules: min 12 characters; checked against a small disallow-list of common passwords; BCrypt cost 12.

## Bounded contexts and endpoints

### `content` — public CMS

Public:

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/content/home` | Home page sections (hero, about, stats, donate, contactInfo). |
| `GET` | `/api/content/projects?page&size&year` | Paginated list of projects. |
| `GET` | `/api/content/projects/{slug}` | Project detail. 404 if unknown slug. |
| `GET` | `/api/content/news?page&size&tag` | Paginated news, newest first. |
| `GET` | `/api/content/news/{slug}` | News article detail (sanitized HTML body). 404 if unknown slug. |
| `GET` | `/api/content/media/{id}` | Image binary. `id` is UUIDv7, never raw filename. |

Admin (role `ADMIN` required):

| Method | Path | Purpose |
|---|---|---|
| `POST/PATCH/DELETE` | `/api/content/admin/projects[/{id}]` | Project CRUD. |
| `POST/PATCH/DELETE` | `/api/content/admin/news[/{id}]` | News CRUD. |
| `PATCH` | `/api/content/admin/home` | Update home page (singleton). |
| `POST` | `/api/content/admin/media` | Upload image (`multipart/form-data`). Returns `{ id, url, contentType, sizeBytes }`. |

#### `GET /api/content/home` response shape

```json
{
  "hero": { "eyebrow": "...", "title": "...", "subtitle": "...", "primaryCtaLabel": "...", "secondaryCtaLabel": "...", "imageUrl": "..." },
  "about": { "eyebrow": "...", "title": "...", "paragraphs": ["...", "..."], "imageUrl": "...", "highlight": { "title": "...", "text": "..." } },
  "stats": [{ "value": "19+", "label": "let pomáháme" }],
  "donate": { "title": "...", "body": "...", "bankAccount": "123456789/0800", "iban": "CZ12 0800 0000 0012 3456 7890" },
  "contactInfo": { "email": "info@novanadeje.cz", "address": "...", "ico": "12345678" },
  "latestNews": [ /* 3 newest news items, same shape as /news list item */ ]
}
```

**Storage strategy (hybrid):** static sections (`hero`, `about`, `stats`, `donate`, `contactInfo`) read from a YAML config in the backend; `latestNews` joined live from DB. When the foundation needs admin-edit on hero/about, migrate those sections into DB-backed entities. The frontend does not see this distinction.

**SPAYD QR string is not in this response.** It moved to `donations` (see below) so the QR can carry a dynamic amount and the donor's variable symbol. Frontend can also generate the SPAYD string client-side from `bankAccount`/`iban` since the format is deterministic — the endpoint exists as a fallback.

#### Project / news list item shape

```json
{
  "id": "...",
  "slug": "dominik",
  "name": "Dominik",
  "year": 2024,
  "tag": "Kompenzační pomůcky",
  "shortDescription": "...",
  "coverImageUrl": "/api/content/media/...",
  "publishedAt": "2024-09-01T00:00:00Z"
}
```

Detail adds: `longDescription`, `gallery: string[]`. News uses `title`/`perex`/`body` instead of `name`/`shortDescription`/`longDescription`.

### `donors` — donor accounts and authentication

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `POST` | `/api/donors/auth/register` | public | Create donor account. 201 with access token + refresh cookie. |
| `POST` | `/api/donors/auth/login` | public | 200 with access token + refresh cookie. 401 `auth/invalid-credentials`. |
| `POST` | `/api/donors/auth/refresh` | refresh cookie | New access token (and rotated refresh cookie). |
| `POST` | `/api/donors/auth/logout` | donor | Invalidates refresh token. 204. |
| `POST` | `/api/donors/auth/password-reset/request` | public | Always 202 (no email enumeration). Rate-limited 3/h/email. |
| `POST` | `/api/donors/auth/password-reset/confirm` | public | Consume token + set new password. 204. |
| `GET` | `/api/donors/me` | donor | Profile + variable symbol. |
| `PATCH` | `/api/donors/me` | donor | Update `fullName`, `preferredLocale`. |

#### Auth response shape (register/login)

```json
{
  "user": { "id": "...", "fullName": "...", "email": "...", "preferredLocale": "cs", "variableSymbol": "..." },
  "accessToken": "eyJ...",
  "accessTokenExpiresAt": "2026-05-02T13:30:00Z"
}
```

Refresh token is **not** in the JSON body — it ships in a `Set-Cookie` header.

#### Validation

- `email`: `@Email`, max 254.
- `fullName`: `@NotBlank @Size(min=2, max=120)`.
- `password`: `@Size(min=12, max=128)` + disallow common passwords.
- `preferredLocale`: `cs` or `en`.

#### `GET /api/donors/me` response

```json
{
  "id": "...",
  "fullName": "...",
  "email": "...",
  "preferredLocale": "cs",
  "variableSymbol": "...",
  "roles": ["DONOR"],
  "createdAt": "..."
}
```

`variableSymbol` is generated at registration (deterministic from `donor.id`), shown in the donor dashboard so the donor can put it on bank transfers. Backend uses it to match incoming bank statements to donors.

### `donations` — donations and PDF receipts

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `GET` | `/api/donations/me?year=` | donor | List of caller's donations + total. |
| `GET` | `/api/donations/me/summary` | donor | Dashboard stat cards (total, count, last, byYear). |
| `GET` | `/api/donations/me/{id}/receipt` | donor | PDF for one donation. |
| `GET` | `/api/donations/me/receipts/yearly?year=` | donor | PDF yearly summary. 404 if no donations that year, 400 for future year. |
| `GET` | `/api/donations/payment-qr?amount=&donorId=` | public (donorId optional) | Returns SPAYD string + PNG QR. Donor sees their VS embedded. |
| `GET/POST/PATCH` | `/api/donations/admin[...]` | admin | List/filter, manually record donation, edit. |

#### `GET /api/donations/me` response

```json
{
  "items": [
    {
      "id": "...",
      "receiptNumber": "000001",
      "receivedAt": "2026-03-15",
      "amountMinor": 50000,
      "currency": "CZK",
      "purpose": "Obecný příspěvek",
      "status": "RECEIVED",
      "source": "BANK_TRANSFER"
    }
  ],
  "totalAmountMinor": 375000,
  "currency": "CZK",
  "count": 4
}
```

Enums:
- `DonationStatus`: `RECEIVED`, `REFUNDED`.
- `DonationSource`: `BANK_TRANSFER`, `MANUAL` (admin-recorded).

#### PDF receipt endpoints

- `Content-Type: application/pdf`.
- `Content-Disposition: attachment; filename*=UTF-8''<urlencoded-filename>` (RFC 5987).
- 403 `donations/not-your-donation` if the receipt belongs to someone else.
- 404 `donations/yearly-receipt-not-available` for a year with no donations.
- 400 `donations/year-not-yet-completed` for a future year.

PDF locale uses `donor.preferredLocale`, not `Accept-Language`.

#### `GET /api/donations/payment-qr`

```
GET /api/donations/payment-qr?amount=500&donorId=...
```

Response:
```json
{
  "spayd": "SPD*1.0*ACC:CZ12...*AM:500*CC:CZK*X-VS:...",
  "qrPngBase64": "iVBORw0KG..."
}
```

If `donorId` is omitted, the SPAYD has no `X-VS:` segment.

### `contact` — contact form

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `POST` | `/api/contact/messages` | public | Send a message; backend emails it asynchronously. 202. |

Request:
```json
{ "fullName": "...", "email": "...", "subject": "...", "message": "...", "website": "" }
```

- All visible fields `@NotBlank`. `email` `@Email`. `message` `@Size(max=5000)`.
- `website` is a honeypot — must be empty. If non-empty, return 202 but do not send.
- Rate limit: 5/hour/IP via Bucket4j (in-memory, Caffeine-backed).

## Cross-context events

All events are immutable Java `record`s in `<context>/application/event/`, published from application services through `ApplicationEventPublisher` and consumed via `@TransactionalEventListener(phase = AFTER_COMMIT)`. Events never carry JPA entities — only IDs and value objects.

| Event | Publisher | Listener | Effect |
|---|---|---|---|
| `DonorRegistered` | `donors/application` | `donors/infrastructure` (welcome email) | Send welcome email via Thymeleaf `templates/email/donors/welcome.html`. |
| `DonorPasswordResetRequested` | `donors/application` | `donors/infrastructure` | Send reset link email. |
| `DonationRecorded` | `donations/application` | `donations/infrastructure` | Send donation confirmation with link to PDF. No-op if `donorId == null` (anonymous bank transfer not yet matched). |
| `ContactMessageReceived` | `contact/application` | `contact/infrastructure` | Forward to `app.contact.recipient-email`. |

Side effects belong to the publishing context, unless another context owns a real reaction in its own model.

## Walking skeleton — TDD order

Implementation order is `contact` → `donors` → `donations` → `content`. Each context starts with one Cucumber `.feature` covering the minimal happy path, then domain types, then JPA / Liquibase / REST / templates. Delete `smoke.feature` and `SmokeStepDefinitions` as soon as `contact` has its first real `.feature`.

### `contact` first feature

`src/test/resources/features/contact/contact_message.feature`:

```gherkin
Feature: Visitor sends a contact message

  Scenario: Valid message is accepted
    Given the email server accepts messages
    When the visitor submits a contact message
      | name    | Jana Nováková        |
      | email   | jana@example.cz      |
      | subject | Dotaz                |
      | message | Mám dotaz k projektu |
    Then the response status is 202
    And one email is delivered to "info@novanadeje.cz"

  Scenario: Honeypot blocks bot
    When the visitor submits a contact message with a non-empty "website" field
    Then the response status is 202
    And no email is sent
```

Domain: `ContactMessage` aggregate, `EmailAddress` (in `shared`), `ContactMessageReceived` event.
Liquibase: `db/changelog/contact/001_create_contact_message.xml`.

### `donors` first features

Registration, login, invalid login. Domain: `Donor` aggregate, `Role` sealed enum, `PasswordHash`, `VariableSymbol`, `RefreshToken`. Liquibase: `001_create_donor.xml`, `002_create_donor_role.xml`, `003_create_refresh_token.xml`, `004_create_password_reset_token.xml`.

### `donations` first features

Manual donation recording (admin), PDF receipt download, yearly summary edge cases. Domain: `Donation` aggregate, `Money` (in `shared`), `DonationStatus`, `DonationSource`, `DonationReceiptRenderer` port (implemented by openhtmltopdf adapter). Liquibase: `001_create_donation.xml`.

### `content` first features

Home page returns content; project detail by slug. Domain: `Project`, `NewsArticle`, `Slug`, `PublicationStatus`. Liquibase: `001_create_project.xml`, `002_create_news_article.xml`, `003_create_news_tag.xml`. Media table only when admin upload is implemented.

## ArchUnit follow-ups

Once each layer of each bounded context has a real class, drop the scaffolding flags in `DddLayeringRulesTest`:
- remove `withOptionalLayers(true)` from the layered architecture rule
- remove `allowEmptyShould(true)` from the slices rule

Add: rules forbidding `org.springframework..` and `jakarta.persistence..` in `domain` packages, and forbidding REST controllers from returning classes from `..infrastructure..`.

## Shared kernel inventory

Belongs in `shared/domain/`:
- `Money(amountMinor, Currency)`
- `Currency` (sealed; `CZK`)
- `EmailAddress`
- `PersonName`
- `LocaleCode` (`cs`, `en`)
- `Slug`

Does **not** belong in `shared`: JWT types, `Donation`, `Donor`, JPA-related types, Spring `Page`.

## UX notes affecting the API

- **Language switcher in nav.** For unauthenticated visitors it switches the UI locale only (cookie or `localStorage`). For authenticated donors it persists `preferredLocale` via `PATCH /api/donors/me` so PDF receipts come out in the chosen language.
- **Password rules.** Frontend shows the 12-character minimum and disallow-list hint inline; backend is the source of truth for validation.
- **Refresh on 401.** Angular HTTP interceptor catches 401 with `type` `auth/expired-token`, calls `POST /api/donors/auth/refresh` with `withCredentials: true`, retries the original request. On second 401 → redirect to `/prihlaseni`.

## Decisions made (recap)

| Topic | Decision |
|---|---|
| Admin auth | Role on `Donor`, no separate context. |
| Refresh token transport | HttpOnly Secure SameSite=Strict cookie, path `/api/donors/auth/refresh`. |
| Money | `amountMinor` + `currency`, `Money` value object in `shared`. |
| ID format | UUIDv7 string. |
| Public content URLs | By `slug`. |
| Home content storage | Hybrid: static sections in YAML, news/projects in DB. |
| CMS i18n | Czech only for now; structure ready (`Accept-Language`) for adding `content_translation` table later. |
| Static images | `frontend/public/` for now; backend volume + `/api/content/media/{id}` once admin upload is implemented. |
| Donation statuses | `RECEIVED`, `REFUNDED`. |
| Bank reconciliation | Variable symbol derived from donor ID; admin imports CSV later. |
| Yearly receipt edge cases | 404 for empty year, 400 for future year. |
| Rate limiting | Bucket4j + Caffeine in-memory. |
| Antispam (contact) | Honeypot + rate limit. No captcha until needed. |
| PDF preview | None — frontend builds preview from list response. |
| CORS | Not configured (same-origin in prod, dev proxy in dev). |

## Open items

- `Cache-Control` / `ETag` exact strategy per endpoint — agree once first endpoints are live.
- Audit columns (`createdBy`, `updatedBy`) on admin-editable entities — defer until first admin endpoint is built.
- Health indicator for outbound mail (Spring `MailHealthIndicator`).
- Migration plan for moving home content from YAML into DB once the admin needs to edit it.
