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
| Refresh | 14 days | HttpOnly + Secure + SameSite=Strict cookie, path `/api/donors/auth` | Set-Cookie on register/login/refresh; sent automatically by the browser to refresh and logout |

Refresh tokens are stored server-side as hashes (`donor_refresh_token` table) and rotated on every refresh; presenting an already rotated token revokes every session of the donor. Logout invalidates the current refresh token.

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
  "donate": { "title": "...", "body": "...", "bankAccount": "5544332217/2010", "iban": "CZ26 2010 0000 0055 4433 2217" },
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

Implemented: register, login, refresh, logout, profile. Password reset is task 7.

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `POST` | `/api/donors/auth/register` | public | Create a donor account. 201 with the auth response and the refresh cookie. 400 `validation` (field errors, incl. a wrong IČO check digit), 400 `donors/company-identifier-required` / `donors/company-identifier-not-allowed`, 400 `donors/password-too-short` / `-too-long` / `-too-common`, 409 `donors/email-already-registered`. |
| `POST` | `/api/donors/auth/login` | public | 200 with the auth response and the refresh cookie. 401 `auth/invalid-credentials` for a wrong password and an unknown email alike. |
| `POST` | `/api/donors/auth/refresh` | refresh cookie | New access token and a rotated refresh cookie. 401 `auth/invalid-refresh-token` when the cookie is missing, expired, revoked or already used (a reused token revokes every session of that donor). |
| `POST` | `/api/donors/auth/logout` | refresh cookie | Revokes the refresh token and clears the cookie. 204 even without a cookie. |
| `POST` | `/api/donors/auth/password-reset/request` | public | Planned (task 7). Always 202 (no email enumeration), rate-limited. |
| `POST` | `/api/donors/auth/password-reset/confirm` | public | Planned (task 7). Consume the token and set a new password. 204. |
| `GET` | `/api/donors/me` | donor | Profile incl. the variable symbol. |
| `PATCH` | `/api/donors/me` | donor | Partial update of `name`, `address`, `preferredLocale`; omitted fields stay. |

#### Registration request

```json
{
  "type": "COMPANY",
  "name": "Stavby Novák s.r.o.",
  "companyIdentifier": "45274649",
  "address": { "street": "Průmyslová 5", "city": "Teplice", "postalCode": "415 01" },
  "email": "ucetni@stavby.cz",
  "password": "correct horse battery",
  "preferredLocale": "cs"
}
```

- `type` is `PERSON` or `COMPANY`. A company must send `companyIdentifier` (IČO: 8 digits with a valid check digit, spaces allowed); a person must not. Both go on the gift confirmation, which is why `address` is required.
- `name`: `@NotBlank`, max 160; the person's full name or the company name.
- `email`: `@Email`, max 254; stored trimmed and lowercased, so uniqueness is case-insensitive.
- `password`: 12–128 characters, not on the common-password list; stored as BCrypt (cost 12).
- `preferredLocale`: `cs` (default) or `en`.

#### Auth response (register, login, refresh)

```json
{
  "user": { "...": "the GET /api/donors/me body" },
  "accessToken": "eyJ...",
  "accessTokenExpiresAt": "2026-10-17T10:15:00Z"
}
```

The access token is an HS256 JWT (`iss`, `sub` = donor id, `roles`, 15 minutes; `app.security.jwt.*`). The refresh token is **not** in the body: it ships as the `refresh_token` cookie (`HttpOnly; Secure; SameSite=Strict; Path=/api/donors/auth`, 14 days; `app.donors.session.refresh-token-ttl`), so only the auth endpoints ever receive it. The backend stores its SHA-256 hash in `donor_refresh_token`.

#### `GET /api/donors/me` response

```json
{
  "id": "01a18e56-bdb0-775a-bd0a-a60756831369",
  "type": "PERSON",
  "name": "Jana Nováková",
  "companyIdentifier": null,
  "address": { "street": "Dlouhá 12", "city": "Ústí nad Labem", "postalCode": "400 01" },
  "email": "jana@example.cz",
  "preferredLocale": "cs",
  "variableSymbol": "4821937560",
  "roles": ["DONOR"],
  "registeredAt": "2026-10-17T10:00:00Z"
}
```

`variableSymbol` is a random 10-digit number (first digit 1–9), unique among donors, generated at registration. The dashboard shows it so the donor puts it on bank transfers; `donations` will match incoming payments by it.

#### Frontend session handling

`core/auth/AuthStore` keeps the donor and the access token in memory only. `authInterceptor` adds `Authorization: Bearer` to every `/api/**` call except `/api/donors/auth/**`; on a 401 whose problem type ends with `auth/expired-token` it refreshes once (one request even for parallel calls) and retries. A `localStorage` flag (`nfnn.donor-session`) only records that a session may exist, so the app calls `refresh` on start for returning donors and skips it for everyone else; `donorGuard` waits for that restore before opening `/donor/**` and otherwise sends the visitor home with the sign-in dialog open.

### `donations` — donations and PDF receipts

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `GET` | `/api/donations/me?year=` | donor | List of caller's donations + total. |
| `GET` | `/api/donations/me/summary` | donor | Dashboard stat cards (total, count, last, byYear). |
| `GET` | `/api/donations/me/{id}/receipt` | donor | PDF for one donation. |
| `GET` | `/api/donations/me/receipts/yearly?year=` | donor | PDF yearly summary. 404 if no donations that year, 400 for future year. |
| `GET` | `/api/donations/payment-qr?amount=&variableSymbol=` | public | Returns the SPAYD string (Czech "QR platba"), its PNG QR code and the foundation's bank account. A signed-in donor's frontend passes their variable symbol. |
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
GET /api/donations/payment-qr?amount=500&variableSymbol=1234567890
```

- `amount`: whole CZK, required, 1 to 1 000 000.
- `variableSymbol`: optional, 1 to 10 digits. The frontend sends the signed-in donor's `variableSymbol` from `GET /api/donors/me`; the backend does not look the donor up, so the endpoint stays public and stateless.
- A missing, non-numeric or out-of-range parameter answers 400 `validation` with `errors: [{ field, message }]`, `field` being the query parameter name.

Response:
```json
{
  "spayd": "SPD*1.0*ACC:CZ2620100000005544332217*AM:500.00*CC:CZK*X-VS:1234567890*RN:NADACNI FOND NOVA NADEJE*MSG:DAR NOVA NADEJE",
  "qrPngBase64": "iVBORw0KG...",
  "bankAccount": {
    "accountNumber": "5544332217/2010",
    "iban": "CZ2620100000005544332217",
    "recipientName": "Nadační fond Nová naděje"
  }
}
```

SPAYD 1.0 rules the backend follows (`donations/domain/payment/QrPayment`): fields joined by `*` in the order `ACC` (IBAN, no spaces), `AM` (two decimals, `.` separator), `CC:CZK`, `X-VS` (only when a variable symbol was given), `RN` (recipient name, max 35 characters), `MSG` (max 60 characters). `RN` and `MSG` are uppercase ASCII without diacritics, limited to the QR alphanumeric set (`0-9 A-Z space $ % + - . / :`). The PNG is 300x300 px, error correction level M.

The bank account comes from `app.donations.bank-account.{account-number,iban,recipient-name}` (env `BANK_ACCOUNT_NUMBER`, `BANK_IBAN`, `BANK_RECIPIENT_NAME`). The defaults are placeholders until the foundation supplies its real account; an IBAN that fails the mod-97 check stops the backend at startup.

### `contact` — contact form

Implemented.

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `POST` | `/api/contact/messages` | public | Send a message; backend stores it and emails it asynchronously after commit. 202. |

Request:
```json
{ "fullName": "...", "email": "...", "message": "...", "website": "" }
```

- `fullName` `@NotBlank @Size(max=120)`, `email` `@NotBlank @Email @Size(max=254)`, `message` `@NotBlank @Size(max=5000)`. There is no subject field: the prototype's form has none, and the email subject is built from the sender's name.
- `website` is a honeypot — must be empty. If non-empty, return 202 but store and send nothing.
- Rate limit: 5/hour per client address (fixed window, Caffeine-backed, in-memory). The 6th request answers 429 with type `contact/rate-limited`. The client address is `getRemoteAddr()` after `ForwardedHeaderFilter`, so behind the nginx in `frontend/` it is the visitor's address from `X-Forwarded-For`.
- The forwarded email goes to `app.contact.recipient-email` (`CONTACT_RECIPIENT`) from `app.contact.sender-email` (`MAIL_FROM`, defaults to the recipient) with `Reply-To` set to the visitor, body from `templates/email/contact/message-received.html`.

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

Implementation order is `contact` → `donors` → `donations` → `content`. Each context starts with one Cucumber `.feature` covering the minimal happy path, then domain types, then JPA / Liquibase / REST / templates.

### `contact` (done)

`src/test/resources/features/contact/contact_message.feature` covers the accepted message, the honeypot, field errors and the rate limit. Domain: `ContactMessage` aggregate, `EmailAddress` (in `shared`), `ContactMessageReceived` event. Liquibase: `db/changelog/contact/001_create_contact_message.xml`.

Shared pieces that came with it and that every later context reuses:
- `shared/infrastructure/security/ApiSecurityConfiguration`: stateless chain, CSRF off, `permitAll` only for the public endpoints listed there and the health endpoint, everything else `authenticated()`. Unauthenticated and forbidden requests answer `application/problem+json` (types `auth/unauthenticated`, `auth/forbidden`) through `ApiExceptionHandler`, never a Basic challenge. A new public endpoint has to be added to that chain.
- `shared/interfaces/rest/ApiExceptionHandler`: validation errors become a problem with type `validation` and `errors: [{ field, message }]`; titles come from `i18n/messages_*.properties` by `Accept-Language`. `RateLimitExceededException` answers 429.
- `shared/infrastructure/ratelimit/FixedWindowRateLimiter` and a `java.time.Clock` bean (`shared/infrastructure/time`), which tests replace with a `MutableClock`.
- `shared/infrastructure/async`: `@EnableAsync`, so `@TransactionalEventListener(AFTER_COMMIT)` listeners run off the request thread with `@Async`.
- Test support in `src/test/java/.../support/`: `MutableClock`, `RecordingMailSender` (records instead of sending), both wired as `@Primary` by `TestSupportConfiguration`, and `cucumber/ApiClient` for HTTP calls in step definitions.

### `donors` (done)

`features/donors/donor_registration.feature` and `donor_login.feature` cover registration as a person and as a company, the IČO rules, duplicate emails, weak passwords, sign-in, expiry of the access token, refresh rotation and reuse, sign-out and the profile update. Domain: `Donor` aggregate, `DonorType`, `Role`, `CompanyIdentifier`, `VariableSymbol`, `RawPassword` / `PasswordHash` (`PasswordHasher` port, BCrypt adapter), `RefreshToken` / `RefreshTokenSecret`. Liquibase: `donors/001_create_donor.xml` (`donor`, `donor_role`), `002_create_donor_refresh_token.xml`. Password reset (task 7) adds its own token table.

Shared pieces that came with it: the sealed `shared/domain/error/DomainException` family (`RuleViolation` 400, `Conflict` 409, `NotFound` 404, `AuthenticationFailure` 401, `AccessDenied` 403), which `ApiExceptionHandler` maps to a problem whose `type` is the exception's code and whose title and detail come from `problem.<code>.title` / `.detail` in the message bundles; `PostalAddress` and `LocaleCode` value objects; `shared/infrastructure/security/JwtConfiguration` (encoder, decoder validated against the application `Clock`, roles → `ROLE_*` authorities), with `ApiSecurityConfiguration` acting as an OAuth2 resource server. Cucumber scenarios truncate every application table before they start (`support/DatabaseCleaner`).

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
