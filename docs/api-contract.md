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
- Locale signaling: frontend sends `Accept-Language: cs` (default) or `en` on every request via HTTP interceptor. Used for `ProblemDetail` titles/details and (later) translated CMS content. **Exception:** a PDF receipt is rendered in the donor's `preferredLocale` at the time it is issued and then stored, never in `Accept-Language` (see "PDF receipts").
- Pagination response shape, uniform across the API:
  ```json
  { "items": [...], "page": 0, "size": 20, "totalElements": 42, "totalPages": 3 }
  ```
- CORS: not configured. Production is same-origin via the nginx in `frontend/Dockerfile`; dev uses Angular's `proxy.conf.json`. Re-evaluate if a non-browser client appears.
- HTML body fields (news / projects long-form text): backend sanitizes on **write** with a jsoup whitelist. Frontend renders as-is.
- Caching: public CMS GETs return `Cache-Control: public, max-age=60` and an `ETag`. Receipt PDFs are `Cache-Control: private, no-store`. Listing endpoints support `If-None-Match`.

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

Implemented: register, login, refresh, logout, profile, password reset.

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `POST` | `/api/donors/auth/register` | public | Create a donor account. 201 with the auth response and the refresh cookie. 400 `validation` (field errors, incl. a wrong IČO check digit), 400 `donors/company-identifier-required` / `donors/company-identifier-not-allowed`, 400 `donors/password-too-common` (a password shorter than 12 or longer than 128 characters is a `validation` field error), 409 `donors/email-already-registered`. |
| `POST` | `/api/donors/auth/login` | public | 200 with the auth response and the refresh cookie. 401 `auth/invalid-credentials` for a wrong password and an unknown email alike. |
| `POST` | `/api/donors/auth/refresh` | refresh cookie | New access token and a rotated refresh cookie. 401 `auth/invalid-refresh-token` when the cookie is missing, expired, revoked or already used (a reused token revokes every session of that donor). |
| `POST` | `/api/donors/auth/logout` | refresh cookie | Revokes the refresh token and clears the cookie. 204 even without a cookie. |
| `POST` | `/api/donors/auth/password-reset/request` | public | Sends a reset link to the address when it belongs to a donor. Always 202 without a body (no email enumeration); 400 `validation` for a malformed address; 429 `donors/rate-limited` after 5 requests per hour from one client address. See "Password reset". |
| `POST` | `/api/donors/auth/password-reset/confirm` | public | Sets a new password from the link's token. 204 without a body, clearing the refresh cookie. 400 `validation` (field errors for `token`, `password`), 400 `donors/password-too-common`, 400 `donors/invalid-password-reset-token`. |
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

The access token is an HS256 JWT (`iss`, `sub` = donor id, `roles`, 15 minutes; `app.security.jwt.*`). It is signed with `JWT_SECRET` (`app.security.jwt.secret`, at least 32 characters, `shared/infrastructure/security/JwtProperties`); only the dev profile has a default, and any other profile without it stops at startup with an error naming `JWT_SECRET`. The refresh token is **not** in the body: it ships as the `refresh_token` cookie (`HttpOnly; Secure; SameSite=Strict; Path=/api/donors/auth`, 14 days; `app.donors.session.refresh-token-ttl`), so only the auth endpoints ever receive it. The backend stores its SHA-256 hash in `donor_refresh_token`.

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

#### Password reset

A donor who forgot the password asks for a link from the sign-in dialog, opens it from the e-mail and sets a new password on the public page `/obnova-hesla`, then signs in by hand. Both endpoints take JSON and answer without a body.

`POST /api/donors/auth/password-reset/request` with `{ "email": "jana@example.cz" }`:

- `email`: `@NotBlank @Email`, max 254, and the shape `EmailAddress` requires (`EmailAddress.SHAPE_REGEX`, a dot in the domain, so `jana@localhost` is a field error and not a domain exception), else 400 `validation` with a field error for `email`. Surrounding spaces are stripped before validation (registration still rejects them) and the address is lowercased, so `"  JANA@Example.cz "` reaches the donor registered as `jana@example.cz`.
- Always 202, whether or not the address belongs to a donor and whether or not an e-mail is sent. Nothing expensive runs on the request thread (no hashing, no mail: the e-mail is sent after the commit, asynchronously); the remaining timing difference between a known and an unknown address is a few database statements, accepted.
- 5 requests per hour per client address (`FixedWindowRateLimiter`, like the contact form) → 429 with type `donors/rate-limited` and the generic title and detail of `RateLimitExceededException`. The limit is a brake on how many e-mails the foundation's SMTP account sends, not an identity check. The backend trusts forwarded headers from any peer (`server.forward-headers-strategy: framework`), so the nginx in `frontend/` resolves the visitor's address itself (`real_ip` from the private proxy ranges) and rewrites `X-Forwarded-For` to it, dropping any client-sent `Forwarded` header. A CAPTCHA is the escalation if abuse appears (requirements: none until needed).
- At most 3 live links per donor (`app.donors.password-reset.max-live-links`): while the donor holds three unused, unexpired links, a further request answers 202 and sends nothing. A request never cancels an earlier link, so nobody can lock a donor out of a link already received; whoever knows the address can keep the three links occupied for up to an hour, accepted. The count is taken without a lock on the donor, so requests for one address that arrive at the same instant can each send a link (a few extra e-mails within the per-address limit), accepted.
- The e-mail (`templates/email/donors/password-reset.html`, multipart plain text + HTML, `From` "Nová naděje – nadační fond" with the address of `app.mail.sender-email`, no `Reply-To`, subject and body in the donor's `preferredLocale` from the `donors.passwordReset.email.*` bundle keys) names the account's address and carries the link `{app.site.public-url}/obnova-hesla#token=<secret>`. It contains nothing from the donor's profile (the registered name is unverified free text and could carry a phishing sentence under the foundation's sender) and no images. The token travels in the URL fragment, so it never reaches an access log or a `Referer`; the page reads it and removes it from the address bar.
- A send failure (no SMTP configured, a rejected address) is logged at ERROR with the donor id and the exception class only; the request already answered 202 and the donor can ask again.

`POST /api/donors/auth/password-reset/confirm` with `{ "token": "<43 base64url characters>", "password": "new passphrase" }`:

- `token`: `@NotBlank`, `^[A-Za-z0-9_-]{43}$`; `password`: `@NotBlank`, 12–128 characters (the same annotations as registration), else 400 `validation` with field errors.
- 400 `donors/password-too-common` for a password on the common list, checked before the token is consumed, so a weak password does not burn the link.
- 400 `donors/invalid-password-reset-token` for a well-formed token that is unknown, expired or already used (one code, no distinction; the lookup is by the SHA-256 of the presented value).
- 204 on success: the password is replaced, the token is marked used atomically (a concurrent confirm with the same token loses and answers 400), the donor's other reset links are deleted, every refresh token of the donor is revoked and the response clears the `refresh_token` cookie. Two different live links of one donor confirmed at the same instant can cross their row locks in PostgreSQL: the loser answers 500 instead of 400 while the end state is the same (one password, one used link, the others deleted), accepted. No session is opened: the donor signs in with the new password. Access tokens already issued stay valid until they expire (at most 15 minutes); there is no denylist.
- Not rate-limited: 256-bit tokens, a hash lookup, and no hashing before a valid token is found.

Table `donor_password_reset_token` (`donors/003_create_donor_password_reset_token.xml`): `id` (UUIDv7), `donor_id` (cascade), `secret_hash` (SHA-256 hex, unique), `issued_at`, `expires_at` (`issued_at` + `app.donors.password-reset.token-ttl`, PT1H), `used_at`. A request first deletes the donor's used and expired rows and a confirm deletes the donor's other rows, so the table holds at most the live links plus the last used one and needs no cleanup job.

Domain: `PasswordResetToken` aggregate, `PasswordResetSecret` (generated like `RefreshTokenSecret`; the two are never interchangeable: a reset secret presented as the refresh cookie answers 401 `auth/invalid-refresh-token`), `PasswordResetTokenRepository`, `InvalidPasswordResetToken` (`RuleViolation`). Application: `DonorPasswordResetService` (`requestReset`, `confirmReset`), `DonorPasswordResetProperties`, the event `DonorPasswordResetRequested` in `donors/application/event`. Infrastructure: `infrastructure/mail/PasswordResetEmailSender` (`@Async AFTER_COMMIT`) and the JPA trio. REST: `interfaces/rest/DonorPasswordResetController` and `PasswordResetRateLimiter`; the request records mask every field in their `toString()` (Spring MVC logs request bodies at DEBUG in the dev profile), and `LoginRequest` and `RegisterDonorRequest` now mask the address, the name, the postal address and the password too (the type, the company identifier and the locale stay readable). Configuration: `PUBLIC_URL` → `app.site.public-url` (`shared/infrastructure/config/PublicUrlProperties`, validated: absolute `http(s)` URL without a query or a fragment, trailing slash stripped; default `https://nfnn.znamenacek.duckdns.org`, `http://localhost:4200` in the dev profile), `MAIL_FROM` → `app.mail.sender-email` (`shared/infrastructure/mail/MailSenderProperties`, shared with the contact form; falls back to `CONTACT_RECIPIENT`). Cucumber: `features/donors/donor_password_reset.feature`.

Frontend: the dialog's "Obnovit heslo" tab posts the request and shows "E-mail odeslán!" on 202 (its own sentence on 429); the public route `obnova-hesla` under the public shell (`features/donors/password-reset/`) reads the token from the fragment, replaces the URL, asks for the new password twice, posts the confirm, clears a session the browser still holds and offers the sign-in dialog on success; an invalid or missing link offers the dialog's reset tab (`LoginDialogService.open('reset')`).

#### Frontend session handling

`core/auth/AuthStore` keeps the donor and the access token in memory only. `authInterceptor` adds `Authorization: Bearer` to every `/api/**` call except `/api/donors/auth/**`; on a 401 whose problem type ends with `auth/expired-token` it refreshes once (one request even for parallel calls) and retries. A `localStorage` flag (`nfnn.donor-session`) only records that a session may exist, so the app calls `refresh` on start for returning donors and skips it for everyone else; `donorGuard` waits for that restore before opening `/donor/**` and otherwise sends the visitor home with the sign-in dialog open.

### `donations` — donations and PDF receipts

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `GET` | `/api/donations/me?year=` | donor | Caller's donations, newest first, optionally one year, with the total and count. |
| `GET` | `/api/donations/me/summary` | donor | Dashboard stat cards: total, count, last donation, totals per year. |
| `GET` | `/api/donations/me/{id}/receipt` | donor | PDF receipt of one `RECEIVED` donation of the caller. 404 for an unknown or another donor's id. |
| `GET` | `/api/donations/me/receipts/yearly?year=` | donor | PDF receipt of the caller's donations received in a completed year. 400 while the year is not completed, 404 when it has none. |
| `GET` | `/api/donations/payment-qr?amount=&variableSymbol=` | public | Returns the SPAYD string (Czech "QR platba"), its PNG QR code and the foundation's bank account. A signed-in donor's frontend passes their variable symbol. |
| `GET/POST/PATCH` | `/api/donations/admin[...]` | admin | List/filter, manually record donation, edit. |

#### `GET /api/donations/me` and `GET /api/donations/me/summary`

Both read the caller's donations, found by the donor id in the JWT subject (`donor_record.donor_id`); 401 `unauthenticated` without a token. A donor the `donations` context has no record of, or one with no donations yet, gets 200 with an empty list and zero totals, never 404. Another donor's donations are never visible: there is no id parameter, the caller is the only filter.

`GET /api/donations/me?year=` lists the donations, newest first (`receivedAt`, then `recordedAt`, then `id`, descending; the id breaks the tie between donations paired in one import run, which share their `recordedAt`). `year` is optional; when given it must be a four-digit year (`@Min(1000) @Max(9999)`, else 400 `validation`) and only donations received in that year are returned, with `totalAmountMinor` and `count` covering the returned items. An empty `year=` counts as absent. A year with no donations gives an empty list.

```json
{
  "items": [
    {
      "id": "0192f0f1-...",
      "receiptNumber": null,
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

- `receiptNumber` is the number of the donation's active single receipt (the one its last download issued and nothing has replaced), `null` before the first download and for a `REFUNDED` donation; see "PDF receipts".
- `purpose` is the text to show, resolved by `Accept-Language` from the message bundles (`donation.purpose.general`, Czech "Obecný příspěvek"); v1 knows only the general purpose, a project-bound purpose comes with the admin.
- `totalAmountMinor` and `count` add up `RECEIVED` donations only; a `REFUNDED` one stays in `items` with its status. `currency` is `CZK` even for an empty list (every imported donation is CZK).

`GET /api/donations/me/summary` feeds the dashboard's stat cards and the year toggle:

```json
{
  "totalAmountMinor": 375000,
  "currency": "CZK",
  "count": 4,
  "lastReceivedAt": "2026-03-15",
  "byYear": [
    { "year": 2026, "count": 2, "totalAmountMinor": 150000 },
    { "year": 2025, "count": 2, "totalAmountMinor": 225000 }
  ],
  "yearlyReceiptsAvailableThrough": 2025
}
```

- Same counting rule as the list: `RECEIVED` donations only.
- `lastReceivedAt` is the newest `receivedAt`, `null` when there is none.
- `byYear` holds one entry per calendar year with at least one counted donation, newest year first; empty when there are none.
- `yearlyReceiptsAvailableThrough` is the last completed calendar year in Prague time (`2025` during 2026): the yearly receipt can be downloaded for that year and earlier, so the frontend decides nothing from its own clock.

Enums:
- `DonationStatus`: `RECEIVED`, `REFUNDED`.
- `DonationSource`: `BANK_TRANSFER`, `MANUAL` (admin-recorded).

#### PDF receipts

`GET /api/donations/me/{id}/receipt` returns the receipt of one `RECEIVED` donation of the caller ("Potvrzení o přijetí daru"); `GET /api/donations/me/receipts/yearly?year=YYYY` returns the receipt of every `RECEIVED` donation the caller gave in a completed calendar year ("Potvrzení o přijatých darech za rok YYYY"). Both find the caller by the JWT subject; 401 `auth/unauthenticated` without a token. Nothing is e-mailed.

Response:

- `200`, `Content-Type: application/pdf`, `Content-Length`, `Cache-Control: private, no-store`, `Content-Disposition: attachment; filename="<ascii>"; filename*=UTF-8''<urlencoded>` (both forms, as Spring's `ContentDisposition` writes them).
- File names are ASCII, resolved in the controller from the message bundle (`receipt.fileName.single`, `receipt.fileName.yearly`) in the receipt's language: Czech `potvrzeni-o-daru-2027-000001.pdf` (single, with the receipt number) and `potvrzeni-o-darech-2026.pdf` (yearly, with the year); English `donation-receipt-2027-000001.pdf` and `donation-summary-2026.pdf`.

Single receipt:

- 404 `donations/donation-not-found` for an id that does not exist or belongs to another donor (one query, no existence leak; there is no 403).
- 404 `donations/receipt-not-available` for a `REFUNDED` donation.
- 400 `validation` for an id that is not a UUID.

Yearly receipt:

- `year` is required and four digits (`@Min(1000) @Max(9999)`), else 400 `validation`.
- 400 `donations/year-not-yet-completed` while `year` is the current Prague calendar year or later: a receipt covers a completed year and is available from 1 January.
- 404 `donations/yearly-receipt-not-available` for a completed year in which the caller has no `RECEIVED` donation.

A receipt is a frozen document. The first download issues it: the PDF is rendered, gets a receipt number and an issue date, and its bytes are stored in `donation_receipt`; every later download serves the stored bytes, so a number always denotes one document. When the data the receipt certifies has changed since it was issued (a late-paired payment of that year, a changed donor name or address; the certified data is hashed into `fingerprint`), the next download issues a replacement with a new number that states which receipt it replaces, and the old one is marked superseded (`superseded_at`). A changed signatory, template or preferred language never re-issues. Issuing is serialised per donor (a row lock on `donor_record` in a transaction of its own), so two parallel downloads yield one receipt. A receipt is voided only by its replacement: when a certified donation later becomes `REFUNDED`, the single receipt answers 404 `donations/receipt-not-available` (the yearly one 404 `donations/yearly-receipt-not-available` once no `RECEIVED` donation of the year remains) and the stored receipt keeps `superseded_at` empty, so the foundation deals with a receipt of a refunded gift by hand; nothing marks a donation `REFUNDED` yet.

Receipt numbers are `YYYY-NNNNNN`: the year of issue and a six-digit serial from the sequence `donation_receipt_number_seq`, which never resets (`2027-000001`, `2027-000002`, ..., at most 999 999). A gap is possible (a render that failed consumed a serial) and acceptable.

The language of a receipt is the donor's `preferredLocale` at first issue, stored on the receipt; a later change of the preference does not re-issue, and a replacement keeps the language of the receipt it replaces. An `en` receipt is bilingual, every Czech label and paragraph with its English rendering beneath; a `cs` receipt is Czech only. `Accept-Language` plays no part.

The document (Thymeleaf template `templates/pdf/donation-receipt.html`, rendered by openhtmltopdf with embedded DejaVu Sans) carries the title, number and issue date; the replaced receipt when there is one; the foundation (name, IČO, seat, registry court and file); the donor (person: name and residence; company: name, IČO and seat; always the variable symbol); the gift or gifts: one donation with its form, date of crediting, amount and the foundation's account, or the yearly table of dates and amounts oldest first with the count and the total; the declaration that the gifts were given without consideration for the statutory purposes, naming § 15 odst. 1 and § 20 odst. 8 of zákon č. 586/1992 Sb.; place and date of issue, the signature image when configured, the signatory's name and role; and a running footer with the foundation line and the receipt number on every page. The texts live under `receipt.*` in the message bundles.

Table `donation_receipt` (`db/changelog/donations/005_create_donation_receipt.xml`):

| Column | Holds |
|---|---|
| `id` | UUIDv7 |
| `donor_id` | FK to `donor_record` |
| `kind` | `SINGLE` / `YEARLY` |
| `donation_id` | FK to `donation`, set for `SINGLE` |
| `receipt_year` | set for `YEARLY` |
| `number` | `YYYY-NNNNNN`, unique |
| `issued_on`, `issued_at` | Prague calendar date and instant of issue |
| `locale` | `cs` / `en` |
| `fingerprint` | SHA-256 hex of the certified data |
| `content` | the PDF bytes |
| `supersedes_id`, `superseded_at` | the receipt this one replaces; when this one was replaced |

`ck_donation_receipt_shape` ties `kind` to `donation_id` and `receipt_year`; partial unique indexes keep one active (not superseded) receipt per donation and per donor and year.

Configuration (`application.yml`, `app.donations.receipt.*`; the defaults ship a working receipt, the env vars are for the operator):

| Property | Env var | Default |
|---|---|---|
| `foundation-name` | - | `Nová naděje - nadační fond` |
| `foundation-company-identifier` | - | `27278794` |
| `foundation-street` / `-city` / `-postal-code` | - | `Jiráskova 436` / `Nový Bor` / `473 01` |
| `registry-court` | - | `Krajský soud v Ústí nad Labem` |
| `registry-file` | - | `N 78` |
| `issue-place` / `issue-place-en` | - | `V Novém Boru` / `Nový Bor` |
| `signatory-name` | `RECEIPT_SIGNATORY_NAME` | `Pavel Znamenáček` |
| `signatory-role` | `RECEIPT_SIGNATORY_ROLE` | `předseda správní rady` |
| `signature-image` | `RECEIPT_SIGNATURE_IMAGE` | empty: no image, only the line and the name; a path to a PNG or JPEG that must exist at startup |

The account number printed on the receipt is `app.donations.bank-account.account-number`.

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

#### Fio import and pairing

Implemented, with no endpoint of its own: the backend downloads the foundation account's movements from the Fio API every hour and turns them into donations. `GET /api/donations/me` and `/api/donations/me/summary` read the `donation` table described here for the donor in the JWT subject; the receipts keep their own table, `donation_receipt` (see "PDF receipts").

Tables (`db/changelog/donations/001`–`005`):

| Table | Holds | Columns that matter to readers of the API |
|---|---|---|
| `donor_record` | The `donations` copy of each donor, fed by the shared events above; no FK to `donor`, the ids are equal by construction. It carries the receipt data. | `donor_id`, `type` (`PERSON`/`COMPANY`), `name`, `company_identifier`, `street`, `city`, `postal_code`, `variable_symbol` (unique), `preferred_locale`, `registered_at`, `updated_at` |
| `bank_payment` | Every incoming CZK movement, stored once (`bank_transaction_id` is Fio's movement id and unique). Texts from the bank are cut to their column width before storing. | `booked_on`, `amount_minor`, `currency`, `sender_account_number`/`sender_bank_code` (canonical Czech account, null for a foreign payer), `counterparty_*` as sent, `variable_symbol` as sent (e.g. `0558`), `matching_variable_symbol` (digits with leading zeros stripped, null when there is none), `constant_symbol`, `specific_symbol`, `message_for_recipient`, `transaction_type`, `imported_at` |
| `bank_import_state` | One row (`id = 1`): the period the application has downloaded and the last attempt. | `covered_from`/`covered_to`, `last_attempted_at`, `last_succeeded_at`, `last_failure_kind` (`RATE_LIMITED`, `HISTORY_LOCKED`, `UNAUTHORIZED`, `TRANSPORT`, `INVALID_RESPONSE`, `UNEXPECTED`), `last_failure_message` |
| `donation` | A payment given to a donor (`Donation` aggregate). `uq_donation_bank_payment` makes a double pairing impossible. | `donor_id` (FK to `donor_record`), `bank_payment_id`, `received_on` (= `booked_on`), `amount_minor`, `currency`, `source` (`BANK_TRANSFER`; `MANUAL` has no producer yet), `status` (`RECEIVED`; `REFUNDED` has no producer yet), `paired_by` (`VARIABLE_SYMBOL`, `SENDER_ACCOUNT`; `MANUAL` comes with the admin task), `recorded_at` |
| `donor_sender_account` | Sender accounts learned for a donor, insert-only (`on conflict do nothing`), with the payment they were learned from. | `donor_id`, `account_number`, `bank_code`, `learned_from_payment_id`, `learned_at` |
| `donation_receipt` | Every receipt ever issued, with its PDF; see "PDF receipts". | `donor_id`, `kind`, `donation_id`, `receipt_year`, `number`, `issued_on`, `locale`, `fingerprint`, `content`, `supersedes_id`, `superseded_at` |

"Unpaired" is derived: a `bank_payment` no `donation` references. The reason a payment stayed unpaired is logged, not stored.

Import cycle (`donations/application/importing`, `donations/infrastructure/fio`):

- `FioImportScheduler` exists only when `FIO_TOKEN` is set; it runs `ImportBankPaymentsService.importIncomingPayments` 30 seconds after start (`STARTUP`) and then with a fixed delay of one hour (`HOURLY`), on Boot's single-thread `TaskScheduler` (`@EnableScheduling` in `shared/infrastructure/scheduling`). Overlapping runs are skipped with a WARN. Without a token the `FioClient` bean is `DisabledFioClient` and nothing calls the bank.
- The application owns the downloaded period (`bank_import_state.covered_from/covered_to`). Every run is exactly one `GET /periods/` request from `max(covered_to − 3 days, today − 89 days)` to today (Prague calendar date); the three-day overlap catches late and back-dated bookings, and a movement delivered twice is skipped by its transaction id. The bank-side bookmark (`/last/`, `setLastDownloadedId`, `setLastDownloadedDate`) is never used.
- Only the `STARTUP` run may ask for history Fio keeps locked (older than 90 days): on the first run ever it asks from `FIO_HISTORY_FROM` when set, and at every later start again while `FIO_HISTORY_FROM` lies before `covered_from`. An `HOURLY` run never does. The requested period is what gets covered; for a deep request the period the bank reports is trusted instead (it equals the request in practice). A run that leaves days between the old and the new coverage logs a WARN naming the gap and the `FIO_HISTORY_FROM` that closes it.
- Follow-ups: a 409 (one request per token per 30 seconds) is retried once at the bank's retry time plus a second with the same trigger; a 422 on a period that needed the unlock records `HISTORY_LOCKED` and retries 31 seconds later for the servable window as `HOURLY`; a 422 inside the window is an ERROR about `history-window` and waits for the next hour. At most one follow-up is pending and at most three run per hourly tick. `UNAUTHORIZED` (token missing, not yet active or expired after 180 days) is an ERROR with the renewal instruction; `TRANSPORT`, `INVALID_RESPONSE` and `UNEXPECTED` wait for the next hour. Every failure line carries the kind and the bank's token-masked message (`failed with TRANSPORT (…)`). Every failure lands in `bank_import_state`; `/actuator/health` never depends on Fio.
- The adapter (`FioBankStatementSource`, over the `io.github.bzumik1:fio-api` client) drops outgoing, zero and non-CZK movements and an amount that is not a whole number of hellers (each with a WARN naming the movement id), takes the counterparty account and bank code as the bank sent them (columns 2 and 3), parses the sender from them into a canonical Czech account (`SenderAccount.parse`; an IBAN or a missing bank code gives no sender), keeps the raw variable symbol next to its matching form and stores the bank's Czech type label (`typeLabel`). The library refuses a whole answer with a payment symbol that is not digits of the allowed length (variable and specific 1–10, constant 1–4) as `INVALID_RESPONSE`. The client is built with `RateLimit.failFast()`: it never waits for the 30-second slot itself, so a 409 or a request it holds back is `RATE_LIMITED` with its retry time and becomes a follow-up. Payments, donations, learned accounts and the coverage are written in one transaction per run.

Pairing rules (`donations/domain/pairing/PaymentPairingPolicy`, applied by `PaymentPairingService` over every unpaired payment at the end of each import and, for one donor, right after a registration):

1. Symbol first. A payment whose `matching_variable_symbol` equals a donor's symbol becomes that donor's donation (`paired_by = VARIABLE_SYMBOL`), even when the sender account was learned by someone else: the payer named the donor. Such a payment also teaches the donor its sender account, which is the only way an account is ever learned (`DonorRecord.learnSenderAccountFrom` refuses any other payment).
2. A symbol nobody has stays unpaired whatever the account, and teaches nothing (a mistyped symbol must not become someone's gift).
3. No symbol: the sender account must have been learned by exactly one donor who pays from it; then the payment is theirs (`paired_by = SENDER_ACCOUNT`). Two or more owners leave it unpaired (one WARN per account and run, naming the bank transaction id); no owner, or no Czech sender, leaves it unpaired. The symbol pass runs over the whole unpaired set before the account pass, so an account learned today pairs older payments without a symbol in the same run.
4. A variable symbol of `0` (what Fio sends for some standing orders) counts as no symbol: it is stored raw, its matching form is null, and the payment goes to the account rule.
5. The sender's name is never used.
6. The hourly run never re-points or removes a donation: a payment keeps its donor when imported again, and an account that a second donor proves with their own symbol leaves the first donor's earlier account-based donations in place while later payments from it without a symbol stay unpaired.

Configuration (`application.yml`, `app.donations.*`):

| Property | Env var | Default | Meaning |
|---|---|---|---|
| `fio.token` | `FIO_TOKEN` | empty → import off | read-only Fio token ("Sledování účtu"); a character other than a letter, digit, `-` or `_`, or fewer than 16 characters, stops the startup |
| `fio.base-uri` | — | `https://fioapi.fio.cz/v1/rest` | `https` only (the token travels in the path); plain `http` is accepted only for `127.0.0.1` and `[::1]`, anything else stops the startup |
| `fio.interval` | — | `PT1H` | fixed delay between runs |
| `fio.initial-delay` | — | `PT30S` | before the `STARTUP` run |
| `fio.request-timeout` | — | `PT2M` | |
| `import.overlap` | — | `P3D` | re-requested days |
| `import.history-window` | — | `P89D` | servable without the unlock (Fio refuses `from` older than 90 days) |
| `import.history-from` | `FIO_HISTORY_FROM` | empty | first-import depth, ISO date (`YYYY-MM-DD`); anything else stops the startup |

`spring.task.scheduling.pool.size` is 1; on shutdown the scheduler drops tasks still waiting for their time (the next hourly tick, a pending follow-up) and waits up to 30 s only for a running import. Logging: the token is never logged (`FioImportProperties.toString()` masks it and the Fio library masks it in every message); counterparty names, account numbers and symbols appear only at DEBUG. At INFO every run logs what the bank answered (`FioBankStatementSource`) and one completion line `Fio import {trigger} {period} completed: ... covered {coverage}` with the counts (`ImportBankPaymentsService`); the pairing after a registration logs one INFO line with its counts.

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
- Rate limit: 5/hour per client address (fixed window, Caffeine-backed, in-memory). The 6th request answers 429 with type `contact/rate-limited`. The client address is `getRemoteAddr()` after `ForwardedHeaderFilter`, so behind the nginx in `frontend/` it is the visitor's address from `X-Forwarded-For`; that nginx resolves the visitor's address itself and rewrites the header, so a client cannot choose it (see "Password reset").
- The forwarded email goes to `app.contact.recipient-email` (`CONTACT_RECIPIENT`) from `app.mail.sender-email` (`MAIL_FROM`, defaults to the recipient; `shared/infrastructure/mail/MailSenderProperties`, shared with the password reset e-mail) with `Reply-To` set to the visitor, body from `templates/email/contact/message-received.html`.

## Cross-context events

Events consumed by another context live in `shared/application/event/` and carry only shared types and JDK types; events consumed inside their own context stay in `<context>/application/event/`. All are immutable Java `record`s published from application services through `ApplicationEventPublisher`; they never carry JPA entities, only IDs and value objects. Three kinds of listener:

- Side-effect listeners (mail) run `@Async @TransactionalEventListener(phase = AFTER_COMMIT)`, off the request thread.
- A projection another context's correctness depends on runs `BEFORE_COMMIT` in the publisher's transaction, so the source row and the projection commit together or neither does.
- Follow-up work on that projection runs synchronously `AFTER_COMMIT` in its own `REQUIRES_NEW` transaction and must only log on failure, never fail the request.

| Event | Publisher | Listener | Effect |
|---|---|---|---|
| `DonorRegistered` | `donors/application` (`DonorRegistrationService`) | `donations/infrastructure/events/DonorRecordSynchronizer`, `BEFORE_COMMIT` | `DonorRecordService.register`: copies the donor into `donor_record` in the registration transaction (an upsert, so a replayed event changes nothing). A failure fails the registration. No welcome email is sent in v1. |
| `DonorRegistered` | as above | `DonorRecordSynchronizer`, `AFTER_COMMIT`, synchronous | `DonorRecordService.pairPaymentsOf` in `REQUIRES_NEW`: pairs the stored payments carrying the donor's symbol and, through the accounts learned from them, the donor's earlier payments without a symbol. Any failure, including a lost race with the hourly import, is a WARN; the registration response is unaffected. |
| `DonorProfileChanged` | `donors/application` (`DonorProfileService`) | `DonorRecordSynchronizer`, `BEFORE_COMMIT` | `DonorRecordService.changeProfile`: name, address and locale on the `donor_record` copy; the symbol, the pairings and the learned accounts stay. A missing copy is a WARN, never an error for `PATCH /api/donors/me`. |
| `DonorPasswordResetRequested` | `donors/application` (`DonorPasswordResetService`), in `donors/application/event` | `donors/infrastructure/mail/PasswordResetEmailSender`, `@Async AFTER_COMMIT` | Sends the reset link e-mail to the donor's address in the donor's locale. Carries the donor id, the `PasswordResetSecret` record (masked `toString`), the `EmailAddress`, the `LocaleCode` and the expiry, never the name. A send failure is logged with the donor id and the exception class, nothing else. |
| `DonationRecorded` | not published in v1 | — | Nothing is sent in v1 (`docs/requirements.md` §8) and nothing consumes it; the admin task decides whether it is needed. |
| `ContactMessageReceived` | `contact/application` | `contact/infrastructure` (`@Async AFTER_COMMIT`) | Forward to `app.contact.recipient-email`. |

Shapes of the shared events:

```java
record DonorRegistered(UUID donorId, DonorType type, String name, Optional<String> companyIdentifier, PostalAddress address,
                       EmailAddress email, VariableSymbol variableSymbol, LocaleCode preferredLocale, Instant registeredAt)
record DonorProfileChanged(UUID donorId, String name, PostalAddress address, LocaleCode preferredLocale)
```

The donor id travels as a `UUID` and the IČO as a `String`, because `DonorId` and `CompanyIdentifier` stay in `donors`; `preferredLocale` is on both events because the PDF receipt is rendered in it.

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

`features/donors/donor_registration.feature` and `donor_login.feature` cover registration as a person and as a company, the IČO rules, duplicate emails, weak passwords, sign-in, expiry of the access token, refresh rotation and reuse, sign-out and the profile update. Domain: `Donor` aggregate, `Role`, `CompanyIdentifier`, `VariableSymbol`, `RawPassword` / `PasswordHash` (`PasswordHasher` port, BCrypt adapter), `RefreshToken` / `RefreshTokenSecret`; `DonorType` moved to `shared/domain` with the Fio import. Liquibase: `donors/001_create_donor.xml` (`donor`, `donor_role`), `002_create_donor_refresh_token.xml`. The password reset adds `donor_password_reset.feature`, `003_create_donor_password_reset_token.xml` and the classes listed under "Password reset".

Shared pieces that came with it: the sealed `shared/domain/error/DomainException` family (`RuleViolation` 400, `Conflict` 409, `NotFound` 404, `AuthenticationFailure` 401, `AccessDenied` 403), which `ApiExceptionHandler` maps to a problem whose `type` is the exception's code and whose title and detail come from `problem.<code>.title` / `.detail` in the message bundles; `PostalAddress` and `LocaleCode` value objects; `shared/infrastructure/security/JwtConfiguration` (encoder, decoder validated against the application `Clock`, roles → `ROLE_*` authorities), with `ApiSecurityConfiguration` acting as an OAuth2 resource server. Cucumber scenarios truncate every application table and restart every sequence before they start (`support/DatabaseCleaner`). The password reset added `shared/infrastructure/mail/MailSenderProperties` (`app.mail.sender-email`, the `From` of every outgoing e-mail) and `shared/infrastructure/config/PublicUrlProperties` (`app.site.public-url`, the address visitors use, for links in e-mails).

### `donations` (import, pairing, the donor's overview and the PDF receipts done)

`features/donations/donor_record_sync.feature`, `fio_payment_import.feature` and `payment_pairing.feature` cover the donor copy, the import cycle with its failures and the pairing rules of "Fio import and pairing"; `donor_donations_overview.feature` covers `GET /api/donations/me` and `/api/donations/me/summary` (empty list and zero summary, ordering, the `year` filter and its validation, the purpose in the caller's language, another donor's isolation, 401 without a token). Domain: `Donation` aggregate, `DonationStatus`, `DonationSource`, `PairingMethod`, `BankPayment`, `DonorRecord`, `PaymentPairingPolicy`, the `importing` package (`ImportPlanner`, `ImportCoverage`, `BankImportState`), and for the overview `DonationList` (items with the total and count of `RECEIVED` ones, `inYear`), `DonationSummary` (total, count, last receipt day, `YearTotal` per year newest first) built from `DonationRepository.findByDonorNewestFirst`. Application: the read-only `application/overview/DonorDonationsService`. REST: `interfaces/rest/DonorDonationsController` with `DonationListResponse` and `DonationSummaryResponse`; the controller resolves `donation.purpose.general` from the message bundles, and ArchUnit keeps `MessageSource` and the web packages out of `domain` and `application`. Liquibase: `donations/001_create_donor_record.xml`, `002_create_bank_payment.xml` (`bank_payment`, `bank_import_state`), `003_create_donation.xml`, `004_create_donor_sender_account.xml`. `donation_receipts.feature` (sixteen scenarios; glue `donations/cucumber/DonorReceiptStepDefinitions`, which reads the PDF text with PDFBox) covers the rules of "PDF receipts": the yearly receipt of a completed year and the stored document served again, the current year and a non-numeric year, a completed year without donations, only that year's donations oldest first, the replacement after a late-paired payment or a changed address, the single receipt and its number in the list, the refunded donation, another donor's or an unknown id, the company and the person party, the bilingual `en` receipt and the language kept after a switch, the Prague year boundary, 401 without a token and `yearlyReceiptsAvailableThrough`. Domain: `domain/FoundationCalendar` (the Prague `ZONE` and `today(clock)`; `importing/BankCalendar` delegates to it) and the `receipt` package: the `DonationReceipt` aggregate (`issueForDonation`, `issueForYear`, `markSuperseded`, `certifies`), `DonationReceiptId`, `ReceiptKind`, `ReceiptNumber`, `ReceiptFingerprint` (SHA-256 of the certified data), `ReceiptDocument` with `ReceiptLine`, `ReceiptParty`, `ReplacedReceipt`, `FoundationIdentity` and `Signatory`, `ReceiptDocumentFactory`, `ReceiptCalendar` (`isCompleted`, `lastCompleted`), the `DonationReceiptRepository` interface, the `NotFound` exceptions `DonationNotFound`, `ReceiptNotAvailable` and `YearlyReceiptNotAvailable` and the `RuleViolation` `YearNotYetCompleted`. Application: `application/receipt/DonationReceiptService` (finds the caller's donation with `DonationRepository.findByIdForDonor` or the year's `RECEIVED` donations and builds a `ReceiptRequest`), `DonationReceiptIssuer` (one `REQUIRES_NEW` transaction per download, the donor record locked; serves the active receipt whose fingerprint still matches, otherwise renders and stores a new one, superseding the old) returning an `IssuedReceipt`, and the `DonationReceiptRenderer` port; `DonorDonationsService` now returns `DonationOverview` (the list with the active single receipt numbers) and `DonationSummaryView` (the summary with the last completed year). Infrastructure: `infrastructure/pdf/ThymeleafPdfReceiptRenderer` (template `templates/pdf/donation-receipt.html`, openhtmltopdf with the embedded `fonts/DejaVuSans*.ttf`, `ReceiptTexts` bound to `cs` and `en`, `ReceiptFormats` for dates and amounts), `ReceiptProperties` (`app.donations.receipt.*`) and `ReceiptConfiguration` (the `FoundationIdentity`, `Signatory` and `ConfiguredSignatureImage` beans), `persistence/JpaDonationReceiptRepository` (`nextSerial` from the sequence, `lockDonor` with `select ... for update`). REST: `interfaces/rest/DonationReceiptController`. Liquibase: `005_create_donation_receipt.xml`. ArchUnit (`AdapterLibraryRulesTest`) keeps openhtmltopdf, PDFBox and Thymeleaf in `..infrastructure..`; `DonationReceiptIssuerConcurrencyTest` proves that two parallel downloads yield one receipt. Still to come: manual donation recording (admin).

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
- `DonorType` (`PERSON`, `COMPANY`; moved from `donors`, the receipt and the `donations` copy need it)
- `VariableSymbol`, `PostalAddress`, `Iban`, `UuidV7`

Belongs in `shared/application/event/`: `DonorRegistered`, `DonorProfileChanged` (see "Cross-context events").

Does **not** belong in `shared`: JWT types, `Donation`, `Donor`, JPA-related types, Spring `Page`.

## UX notes affecting the API

- **Language switcher in nav.** For unauthenticated visitors it switches the UI locale only (cookie or `localStorage`). For authenticated donors it persists `preferredLocale` via `PATCH /api/donors/me` so receipts issued from then on come out in the chosen language (an issued receipt keeps its language).
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
| Bank reconciliation | Random 10-digit variable symbol per donor; hourly Fio API import pairs by symbol, then by learned sender account for payments without a symbol; CSV import deferred to the admin task. |
| Yearly receipt edge cases | 404 for a completed year without donations, 400 while the year is not completed (Prague calendar). |
| Receipt of someone else's donation | 404 `donation-not-found`, not 403: no existence leak. |
| Receipts | Frozen documents: the first download issues, numbers (`YYYY-NNNNNN`) and stores the PDF; changed certified data issues a replacement with a new number that names the replaced one. Language: the donor's preference at issue, `en` bilingual. |
| Rate limiting | Bucket4j + Caffeine in-memory. |
| Antispam (contact) | Honeypot + rate limit. No captcha until needed. |
| PDF preview | None: the dashboard downloads the file. |
| CORS | Not configured (same-origin in prod, dev proxy in dev). |

## Open items

- `Cache-Control` / `ETag` exact strategy per endpoint — agree once first endpoints are live.
- Audit columns (`createdBy`, `updatedBy`) on admin-editable entities — defer until first admin endpoint is built.
- Health indicator for outbound mail (Spring `MailHealthIndicator`).
- Migration plan for moving home content from YAML into DB once the admin needs to edit it.
