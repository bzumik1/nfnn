# API Contract — NFNN

Agreed HTTP API contract between Angular 22 frontend and Spring Boot 4 + DDD backend. This document is the source of truth for endpoint shape, auth flow, error format, and bounded-context allocation. It came out of a frontend/backend design pass against the original prototype (removed from the repo in October 2026) and the architecture in `CLAUDE.md`; how the system works today is in `docs/system-overview.md`.

When adding a new endpoint, update this file in the same change.

## Conventions

- All endpoints under `/api/<context>/...`. Contexts: `content`, `donors`, `donations`, `contact`. No cross-context HTTP calls — use `ApplicationEvent` for behavioral coordination.
- JSON in / JSON out. Exception: PDF receipts return `application/pdf`, media returns image binary.
- Errors follow RFC 7807 `application/problem+json` (Spring `ProblemDetail`). `type` URI namespace: `https://nfnn.cz/problems/<context>/<code>`. Per-field validation errors carried in an `errors: [{ field, message }]` array.
- Identifiers: UUIDv7 (string) for all entity IDs. Public URLs for content use `slug` (kebab-case, unique, immutable after publish); admin URLs use `id`.
- Money: `{ amountMinor: long, currency: "CZK" }`. Domain value object `Money` lives in `shared/domain/`. Sealed `Currency` (CZK only for now).
- Dates: ISO-8601. `LocalDate` as `YYYY-MM-DD`, instants as `YYYY-MM-DDTHH:MM:SSZ`. UI formatting (e.g. `15. 03. 2026`) is the frontend's job.
- Locale signaling: frontend sends `Accept-Language: cs` (default) or `en` on every request via HTTP interceptor. Used for `ProblemDetail` titles/details and (later) translated CMS content. **Exception:** a PDF receipt is rendered in the donor's `preferredLocale` at the time it is issued and keeps it, never in `Accept-Language` (see "PDF receipts").
- Pagination response shape, uniform across the API:
  ```json
  { "items": [...], "page": 0, "size": 20, "totalElements": 42, "totalPages": 3 }
  ```
- CORS: not configured. Production is same-origin via the nginx in `frontend/Dockerfile`; dev uses Angular's `proxy.conf.json`. Re-evaluate if a non-browser client appears.
- HTML body fields (news / projects long-form text): backend sanitizes on **write** with a jsoup whitelist. Frontend renders as-is.
- Caching: public CMS GETs return `Cache-Control: public, max-age=60` and an `ETag`. Receipt PDFs are `Cache-Control: private, no-store`. Listing endpoints support `If-None-Match`.

## Authentication

JWT-based, scoped to `donors` bounded context. Roles in JWT claims: `DONOR`, `ADMIN` (no separate admin bounded context — admins are donors with elevated role).

Everything under `/api/admin/**` needs the `ADMIN` role (`ApiSecurityConfiguration`, `hasRole(ADMIN_ROLE)`): a donor without it gets 403 `auth/forbidden`, no token 401 `auth/unauthenticated`. The role is granted by another administrator in the administration (`POST /api/admin/donors/administrators`, see "Administrators") or, for the first administrator, by the `ADMIN_EMAILS` env at startup (nothing is done by SQL, Jakub, 2026-10-22); it travels in the JWT, so it takes effect at the donor's next sign-in or token refresh (at most 15 minutes), and taking it away ends every session of the donor. Each context exposes its administration under `/api/admin/<context>/...`; see "Administration". The administration is reachable from the internet, so an administrator signs in with a second factor: `ADMIN` is put into the JWT only for a session opened with the code from an authenticator app (TOTP, see "Second factor"); an administrator without the second factor signs in as a plain donor (`roles: ["DONOR"]`, `secondFactor.neededForAdministration: true`) and gets 403 under `/api/admin/**` until they turn it on (Jakub, 2026-10-22).

| Token | Lifetime | Storage (frontend) | Transport |
|---|---|---|---|
| Access | ~15 min | In-memory only (no localStorage) | `Authorization: Bearer ...` header |
| Refresh | 14 days | HttpOnly + Secure + SameSite=Strict cookie, path `/api/donors/auth` | Set-Cookie on register/login/refresh; sent automatically by the browser to refresh and logout |

Refresh tokens are stored server-side as hashes (`donor_refresh_token` table) and rotated on every refresh; presenting an already rotated token revokes every session of the donor. Logout invalidates the current refresh token.

Password rules: 12–128 characters; checked against a small disallow-list of common passwords; stored as BCrypt (cost 12) of the password's SHA-256 hex digest, so the whole password counts (BCrypt alone reads 72 bytes).

## Bounded contexts and endpoints

### `content` — public CMS

_Planned, not implemented: the `content` package is empty and the site's content lives in the Angular components until the admin exists (`docs/requirements.md` §7). The sample values below are placeholders._

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
| `POST/PATCH/DELETE` | `/api/admin/content/projects[/{id}]` | Project CRUD. |
| `POST/PATCH/DELETE` | `/api/admin/content/news[/{id}]` | News CRUD. |
| `PATCH` | `/api/admin/content/home` | Update home page (singleton). |
| `POST` | `/api/admin/content/media` | Upload image (`multipart/form-data`). Returns `{ id, url, contentType, sizeBytes }`. |

#### `GET /api/content/home` response shape

```json
{
  "hero": { "eyebrow": "...", "title": "...", "subtitle": "...", "primaryCtaLabel": "...", "secondaryCtaLabel": "...", "imageUrl": "..." },
  "about": { "eyebrow": "...", "title": "...", "paragraphs": ["...", "..."], "imageUrl": "...", "highlight": { "title": "...", "text": "..." } },
  "stats": [{ "value": "19+", "label": "let pomáháme" }],
  "donate": { "title": "...", "body": "...", "bankAccount": "5544332217/2010", "iban": "CZ26 2010 0000 0055 4433 2217" },
  "contactInfo": { "email": "info@nfnn.cz", "address": "...", "ico": "27278794" },
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

Implemented: register with e-mail verification, login, refresh, logout, profile, password reset.

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `POST` | `/api/donors/auth/register` | public | Create a donor account that opens once the e-mail is confirmed. Always 202 without a body and without a session, also for an address that already has an account (see "E-mail verification"). 400 `validation` (field errors, incl. a wrong IČO check digit), 400 `donors/company-identifier-required` / `donors/company-identifier-not-allowed`, 400 `donors/password-too-common` (a password shorter than 12 or longer than 128 characters is a `validation` field error), 429 `donors/rate-limited` after 5 registrations per hour from one client address (see "Sign-in and registration limits"). |
| `POST` | `/api/donors/auth/email-verification/request` | public | Sends a new verification link when the address belongs to an account whose e-mail is not confirmed yet. Always 202 without a body; 400 `validation` for a malformed address; 429 `donors/rate-limited` after 5 requests per hour from one client address. See "E-mail verification". |
| `POST` | `/api/donors/auth/email-verification/confirm` | public | Confirms the e-mail from the link's token. 200 with the auth response and the refresh cookie (the donor is signed in). 400 `validation` (field error for `token`), 400 `donors/invalid-email-verification-token`. |
| `POST` | `/api/donors/auth/login` | public | 200 with the auth response and the refresh cookie. 401 `auth/invalid-credentials` for a wrong password and an unknown email alike; 401 `auth/email-not-verified` for the right password at an account whose e-mail is not confirmed yet; 401 `auth/second-factor-required` with a `challenge` for the right password at an account with the second factor on (see "Second factor"). 429 `donors/rate-limited` after 10 sign-ins per 15 minutes from one client address (see "Sign-in and registration limits"). |
| `POST` | `/api/donors/auth/login/second-factor` | public | Completes a sign-in answered `auth/second-factor-required`: `{ "challenge": "…", "code": "123456" }` → 200 with the auth response and the refresh cookie. 400 `validation`, 401 `auth/invalid-second-factor-code` (the attempt counts against the challenge), 401 `auth/invalid-second-factor-challenge` (unknown, expired, used or out of attempts: start over with the password), 429 `donors/rate-limited` after 10 codes per 15 minutes from one client address. |
| `POST` | `/api/donors/auth/refresh` | refresh cookie | New access token and a rotated refresh cookie. 401 `auth/invalid-refresh-token` when the cookie is missing, expired, revoked or already used (a reused token revokes every session of that donor). |
| `POST` | `/api/donors/auth/logout` | refresh cookie | Revokes the refresh token and clears the cookie. 204 even without a cookie. |
| `POST` | `/api/donors/auth/password-reset/request` | public | Sends a reset link to the address when it belongs to a donor. Always 202 without a body (no email enumeration); 400 `validation` for a malformed address; 429 `donors/rate-limited` after 5 requests per hour from one client address. See "Password reset". |
| `POST` | `/api/donors/auth/password-reset/confirm` | public | Sets a new password from the link's token. 204 without a body, clearing the refresh cookie. 400 `validation` (field errors for `token`, `password`), 400 `donors/password-too-common`, 400 `donors/invalid-password-reset-token`. |
| `GET` | `/api/donors/me` | donor | Profile incl. the variable symbol. |
| `PATCH` | `/api/donors/me` | donor | Partial update of `name`, `address`, `preferredLocale`; omitted fields stay. |
| `PUT` | `/api/donors/me/password` | donor | Replaces the password after checking the current one; 200 with the auth response and a new refresh cookie, every other session revoked. 400 `validation`, 400 `donors/wrong-password`, 400 `donors/password-too-common`, 429 `donors/rate-limited` after 10 attempts per 15 minutes from one client address. See "Changing the password and the e-mail". |
| `POST` | `/api/donors/me/email-change` | donor | Sends a confirmation link to a new address after checking the password; always 202 without a body, also for an address another account has. 400 `validation`, 400 `donors/wrong-password`, 400 `donors/email-unchanged`, 429 `donors/rate-limited` after 5 requests per hour from one client address. The link is confirmed through `POST /api/donors/auth/email-verification/confirm`. |
| `POST` | `/api/donors/me/second-factor/setup` | donor | Starts turning the second factor on: `{ "password": "…" }` → 200 with the secret, the `otpauth://` link and its QR code. 400 `validation`, 400 `donors/wrong-password`, 409 `donors/second-factor-already-enabled`, 429 `donors/rate-limited` (10 second-factor changes per 15 minutes per client address, shared by the three endpoints). See "Second factor". |
| `POST` | `/api/donors/me/second-factor/confirm` | donor | Turns it on with the first code from the app: `{ "code": "123456" }` → 200 with the auth response and a new refresh cookie, every other session revoked. 400 `validation`, 400 `donors/second-factor-not-pending`, 400 `donors/second-factor-code-rejected`, 409 `donors/second-factor-already-enabled`, 429 `donors/rate-limited`. |
| `GET` | `/api/admin/donors/administrators` | admin | Who administers the site: `{ "items": [{ "donorId", "name", "email", "secondFactorEnabled" }] }`, ordered by name. See "Administrators". |
| `POST` | `/api/admin/donors/administrators` | admin | Grants the role to a registered donor: `{ "email": "…" }` → 201 with the item. 400 `validation`, 404 `donors/email-not-registered`, 409 `donors/already-administrator`. |
| `DELETE` | `/api/admin/donors/administrators/{donorId}` | admin | Takes the role away and ends every session of the donor → 204. 400 `donors/own-administration`, 404 `donors/donor-not-found`, 409 `donors/not-administrator`. |
| `POST` | `/api/admin/donors/{donorId}/second-factor/reset` | admin | Turns the donor's two-factor authentication off after a lost phone, ends every session of the donor and e-mails them → 204. 400 `donors/second-factor-not-enabled`, 404 `donors/donor-not-found`. |
| `GET` | `/api/admin/donors?query=` | admin | Up to 20 donor accounts whose name or e-mail contains, or whose variable symbol starts with, the query (`@Size(max = 254)`, blank → empty list), ordered by name: `{ "items": [DonorAccount] }`. See "Donors". |
| `GET` | `/api/admin/donors/{donorId}` | admin | One donor's account for the donor card: type, name, IČO, address, e-mail, variable symbol, locale, registration, `emailVerified`, `administrator`, `secondFactorEnabled`. 404 `donors/donor-not-found`. |
| `GET` | `/api/admin/donors/actions?before=&limit=` | admin | The audit trail (`admin_action`) newest first with the administrators' names, `limit` 1–200 (default 50) entries performed before `before` (default now), `hasMore` for the next page. See "Audit trail". |
| `POST` | `/api/donors/me/second-factor/disable` | donor | Turns it off: `{ "password": "…", "code": "123456" }` → 200 with the auth response and a new refresh cookie, every other session revoked. 400 `validation`, 400 `donors/wrong-password`, 400 `donors/second-factor-not-enabled`, 400 `donors/second-factor-code-rejected`, 429 `donors/rate-limited`. |

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
- `password`: 12–128 characters, not on the common-password list; stored as BCrypt (cost 12) of the SHA-256 hex digest of the UTF-8 password (`infrastructure/security/BCryptPasswordHasher`), so every character counts: BCrypt alone reads the first 72 bytes and refuses longer input, which 128 Czech letters exceed.
- `preferredLocale`: `cs` (default) or `en`.

#### Auth response (e-mail confirmation, login, second factor, refresh, password change, second-factor change)

```json
{
  "user": { "...": "the GET /api/donors/me body" },
  "accessToken": "eyJ...",
  "accessTokenExpiresAt": "2026-10-17T10:15:00Z"
}
```

The access token is an HS256 JWT (`iss`, `sub` = donor id, `roles`, 15 minutes; `app.security.jwt.*`). `roles` are the session's roles: `ADMIN` is in them only when the session was opened with the second factor (`Donor.sessionRoles(secondFactorVerified)`), and a refresh keeps what its refresh token recorded (`donor_refresh_token.second_factor_verified`), so a session never gains `ADMIN` without the code. It is signed with `JWT_SECRET` (`app.security.jwt.secret`, at least 32 characters, `shared/infrastructure/security/JwtProperties`); only the dev profile has a default, and any other profile without it stops at startup with an error naming `JWT_SECRET`. The refresh token is **not** in the body: it ships as the `refresh_token` cookie (`HttpOnly; Secure; SameSite=Strict; Path=/api/donors/auth`, 14 days; `app.donors.session.refresh-token-ttl`), so only the auth endpoints ever receive it. The backend stores its SHA-256 hash in `donor_refresh_token`.

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
  "registeredAt": "2026-10-17T10:00:00Z",
  "secondFactor": { "enabled": false, "neededForAdministration": false }
}
```

`roles` are the roles of this session (see "Auth response"), sorted as `Role` declares them (`DONOR`, `ADMIN`). `secondFactor.enabled` says whether the donor signs in with a code from an authenticator app; `neededForAdministration` is true for an administrator who has not turned it on yet, which the overview explains (see "Second factor").

`variableSymbol` is a random 10-digit number (first digit 1–9), unique among donors, generated at registration. The dashboard shows it so the donor puts it on bank transfers; `donations` will match incoming payments by it.

#### Sign-in and registration limits

- `POST /api/donors/auth/login`: 10 requests per 15 minutes per client address (`SignInRateLimiter`); `POST /api/donors/auth/register`: 5 requests per hour per client address (`RegistrationRateLimiter`). Both sit in `donors/interfaces/rest`, each with its own `FixedWindowRateLimiter`, like `PasswordResetRateLimiter`; the limits are constants in those classes. The window is fixed: it starts with the address's first request and closes after the whole period, whatever came in between.
- Every request that reaches the controller counts, successful or not: a right password, a wrong one, an unknown e-mail, a taken e-mail, an unconfirmed account. A body that fails validation is answered 400 before the controller runs and does not count; it costs no hashing.
- A limited request answers 429 with type `donors/rate-limited` and the generic title and detail of `RateLimitExceededException`, before any password is hashed or any registration work is done. Sign-ins and registrations have separate counters, and both are separate from the password reset's.
- The client address is `getRemoteAddr()` after `ForwardedHeaderFilter`; the nginx in `frontend/` resolves the visitor's address itself and rewrites `X-Forwarded-For`, so a client cannot choose it (see "Password reset"). The counters live in memory per backend instance and start empty after a restart. Visitors behind one shared address (an office, a school, a mobile carrier's NAT) share the limits, accepted.
- The limits brake password guessing and mass registration from one address. They are not an account lockout, so nobody can lock a donor out of the account; guessing spread over many addresses is not covered, and a CAPTCHA or a per-account delay is the escalation if it appears.
- An unknown e-mail costs the same as a real one: the password is compared against a fixed BCrypt cost-12 hash of a random string (`UNKNOWN_DONOR_HASH` in `DonorAuthenticationService`), so both run one BCrypt comparison and answer the same 401. A malformed e-mail or a password the password rules refuse (shorter than 12 characters or on the common list) is answered 401 without hashing; that depends only on what was sent and says nothing about the account.

Frontend: the sign-in dialog answers a 429 on sign-in or registration with "Příliš mnoho pokusů z této adresy. Zkuste to prosím za chvíli znovu." (`donor.login.error.tooManyAttempts`). Cucumber: `features/donors/donor_login.feature` and `donor_registration.feature`.

#### E-mail verification

An account opens only once its owner has opened the link from the verification e-mail (Jakub, 22 October 2026: before the launch on nfnn.cz). Until then the donor cannot sign in, `donations` has no record of the donor and no payment can be paired to the symbol. Donors registered before this change were marked confirmed by the migration (`email_verified_at` = `registered_at`).

`POST /api/donors/auth/register` (the "Registration request" above) stores the donor with `email_verified_at` null, issues a verification link and answers 202 without a body. The same request for an address that already has an account also answers 202, so the answer never says whether an address is registered:

- An address whose account is confirmed: nothing is stored, and the account's owner gets the e-mail "Váš dárcovský účet už existuje – Nová naděje" (`templates/email/donors/registration-repeated.html`, `donors.registrationRepeated.email.*`): someone tried to register with the address, the account already exists, sign in or reset the password; it links the site root and carries no token. Whoever knows the address can trigger this e-mail within the registration limit, accepted.
- An address whose account is not confirmed yet: the earlier registration is deleted (its links go with it, `ON DELETE CASCADE`; it had no sessions and no `donor_record`) and the new one is stored with a new symbol and a new link, so a donor who mistyped something or never received the e-mail simply registers again, and the newest data wins. The flush after the delete frees the unique address before the insert (`JpaDonorRepository.delete`). Someone who knows a pending address can replace that registration with their own password until the owner confirms; the owner then sees a name they did not enter or cannot sign in and resets the password, which ends every session. Accepted for the minutes a registration waits.

`POST /api/donors/auth/email-verification/request` with `{ "email": "jana@example.cz" }`: the same validation and address handling as the password reset request (trimmed, lowercased, `EmailAddress.SHAPE_REGEX`); always 202; a new link only for an account whose e-mail is not confirmed (an unknown address and a confirmed account get nothing, logged at DEBUG and INFO); at most 3 live links per donor (`app.donors.email-verification.max-live-links`), the earlier ones stay valid; 5 requests per hour per client address (`EmailVerificationRateLimiter`) → 429 `donors/rate-limited`.

The e-mail (`templates/email/donors/email-verification.html`, `donors.emailVerification.email.*`, subject "Potvrďte svůj e-mail – Nová naděje", title "Vítejte v Nové naději") is also the welcome e-mail: it names the account's address, carries the link `{app.site.public-url}/potvrzeni-emailu#token=<secret>`, says the link is valid for `app.donors.email-verification.token-ttl` (PT24H, written in hours) and once, and that an unconfirmed account stays inactive. Like the reset e-mail it carries nothing from the profile (the name is unverified free text) and the token travels in the fragment.

`POST /api/donors/auth/email-verification/confirm` with `{ "token": "<43 base64url characters>" }`:

- `token`: `@NotBlank`, `^[A-Za-z0-9_-]{43}$`, else 400 `validation` with a field error.
- 400 `donors/invalid-email-verification-token` for a well-formed token that is unknown, expired, already used, or whose donor is gone or already confirmed (one code, no distinction; the lookup is by the SHA-256 of the presented value).
- 200 on success with the auth response and the refresh cookie: the token is marked used atomically (a concurrent confirm loses and answers 400), the donor's `email_verified_at` is set, every verification link of the donor is deleted (a confirmed account keeps none), `DonorRegistered` is published (so `donor_record` is created and the donor's payments are paired in this transaction, exactly as the registration did before) and a session opens, so the page can take the donor straight to the overview.
- A token issued by `POST /api/donors/me/email-change` (its row carries `new_email`) confirms an e-mail change instead: the donor must be confirmed and the new address still free (else 400 `donors/invalid-email-verification-token`), the donor's `email` becomes the new address, every verification link and every refresh token of the donor goes, `DonorEmailChanged` is published (the notice to the previous address) and a session opens; 200 with the auth response, whose `user.email` is the new address. See "Changing the password and the e-mail".
- Not rate-limited, for the same reasons as the reset confirm.

Sign-in with the right password at an unconfirmed account answers 401 `auth/email-not-verified` (title "E-mail ještě není potvrzený", detail asks to open the link or have a new one sent); a wrong password at such an account answers `auth/invalid-credentials` like anywhere else, so the code never reveals an unconfirmed address to someone without the password. A password reset request for an unconfirmed account sends nothing (the donor confirms the e-mail first, or registers again).

Table `donor_email_verification_token` (`donors/004_add_donor_email_verification.xml`, which also adds `donor.email_verified_at` and fills it for existing donors): the same columns, FK and cleanup as `donor_password_reset_token`.

Domain: `Donor.verifyEmail(at)` / `isEmailVerified()` / `emailVerifiedAt()`, `EmailVerificationToken`, `EmailVerificationTokenRepository`, `InvalidEmailVerificationToken` (`RuleViolation`), `EmailNotVerified` (`AuthenticationFailure`); `LinkSecret` is the 43-character secret shared with the password reset (formerly `PasswordResetSecret`). Application: `DonorEmailVerificationService` (`issueLink`, `requestVerification`, `confirm`), `DonorEmailVerificationProperties`, the events `DonorEmailVerificationRequested` and `DonorRegistrationRepeated` in `donors/application/event`; `DonorRegistrationService.register` no longer opens a session nor publishes `DonorRegistered`. Infrastructure: `infrastructure/mail/DonorRegistrationEmailSender` (`@Async AFTER_COMMIT`, both e-mails) and the JPA trio. REST: `interfaces/rest/DonorEmailVerificationController`, `EmailVerificationRateLimiter`, the masked request records, `SessionResponses` shared with `DonorAuthController`. Cucumber: `features/donors/donor_email_verification.feature`; the shared glue `cucumber/DonorRegistrations` registers and confirms a donor through the e-mail, which every "registered" Given step uses.

Frontend: after a registration the dialog shows "Zkontrolujte si e-mail" with the address (`role="status"`) and a way back to the sign-in tab; a sign-in answered `auth/email-not-verified` shows the problem and a "Poslat ověřovací e-mail znovu" button that posts the request and confirms in a `role="status"` line. The public route `potvrzeni-emailu` (`features/donors/email-verification/`) reads the token from the fragment, replaces the URL, posts the confirm at once ("Potvrzujeme váš e-mail"), adopts the session and offers "Přejít do přehledu"; an invalid link or a missing token shows a form that asks for the address and posts the request ("E-mail odeslán"); another failure offers a retry.

#### Changing the password and the e-mail

Both actions need the donor JWT and the current password (Jakub, 22 October 2026, task 3 of plan v2). `interfaces/rest/DonorCredentialsController`, `application/DonorCredentialsService`; the request records `ChangePasswordRequest` and `EmailChangeRequest` mask every field in `toString`.

`PUT /api/donors/me/password` with `{ "currentPassword": "…", "newPassword": "…" }`:

- `currentPassword`: `@NotBlank`, max 128; `newPassword`: `@NotBlank`, 12–128; else 400 `validation` with field errors. A malformed current password (shorter than 12 characters or on the common list) is answered as a wrong one, without hashing.
- 400 `donors/wrong-password` (title "Nesprávné současné heslo") when the current password does not match; 400 `donors/password-too-common` for a new password on the list. Nothing changes in either case.
- 200 on success with the auth response and a fresh `refresh_token` cookie: the new hash is stored, every refresh token of the donor is revoked (the other devices lose their session at their next refresh, within 15 minutes) and a new session opens for this device, so the donor stays signed in where the change was made. No e-mail is sent.
- 10 attempts per 15 minutes per client address (`PasswordChangeRateLimiter`) → 429 `donors/rate-limited`, counted before any hashing; separate from the sign-in counter.

`POST /api/donors/me/email-change` with `{ "newEmail": "jana.nova@example.cz", "password": "…" }`:

- `newEmail`: trimmed, `@Email`, `EmailAddress.SHAPE_REGEX`, max 254, stored lowercased; `password`: `@NotBlank`, max 128; else 400 `validation`.
- 400 `donors/wrong-password` when the password does not match (checked before the address is looked at); 400 `donors/email-unchanged` (title "Tuto adresu už váš účet má") when the new address equals the current one, case-insensitively.
- 202 without a body otherwise, so the answer never says whether an address is registered:
  - A free address gets the e-mail "Potvrďte novou e-mailovou adresu – Nová naděje" (`templates/email/donors/email-change.html`, `donors.emailChange.email.*`) with the link `{app.site.public-url}/potvrzeni-emailu#token=<secret>`: the same `donor_email_verification_token` row as a registration link, with the new address in `new_email`, valid `app.donors.email-verification.token-ttl` (24 h), once, at most 3 live links per donor together with the registration links, `DonorEmailChangeRequested` → `infrastructure/mail/DonorEmailChangeEmailSender`. The e-mail names only the new address.
  - An address another account has: nothing is stored; that account's owner gets "Vaši adresu chtěl použít jiný účet – Nová naděje" (`email-in-use.html`, `donors.emailInUse.email.*`, in the owner's locale, no link; `DonorEmailAddressInUse`), which names the address and says nothing changed.
- 5 requests per hour per client address (`EmailChangeRateLimiter`) → 429 `donors/rate-limited`, before any hashing.
- Until the link is opened the account keeps its current address: sign-in, the reset and every e-mail use it. Opening the link (`POST /api/donors/auth/email-verification/confirm`, above) switches the address, revokes every refresh token, opens a session and sends "E-mail vašeho dárcovského účtu byl změněn – Nová naděje" (`email-changed.html`, `donors.emailChanged.email.*`, `DonorEmailChanged`) to the previous address, naming both addresses and `app.mail.sender-email` to write to if it was not the donor. A link whose address was registered meanwhile answers 400 `donors/invalid-email-verification-token` and changes nothing. `donations` keeps no e-mail, so no cross-context event is needed.

Schema: `donors/005_add_new_email_to_verification_token.xml` adds the nullable `new_email varchar(254)` to `donor_email_verification_token`. Domain: `Donor.changeEmail(newEmail)` (confirmed donors only; `EmailUnchanged` for the same address), `EmailVerificationToken.issueForChange` / `isForChange()` / `newEmail()`, `WrongPassword` and `EmailUnchanged` (`RuleViolation`). Cucumber: `features/donors/donor_credentials.feature`.

Frontend: the overview's "Přihlašovací údaje" card (`features/donors/dashboard/account-card/`) shows the address and offers "Změnit e-mail" (new address + current password, "Poslat potvrzovací odkaz"; on 202 a `role="status"` line says where the link went and that the current address stays until it is opened) and "Změnit heslo" (current, new and new again with the 12-character hint; mismatch is a form-level alert; on 200 `AuthStore.changePassword` adopts the new session and the line says the other sign-ins ended). Backend refusals appear as a form-level `role="alert"` through `describeProblem`; `auth/unauthenticated` sends the donor to sign in like the other cards. The link opens the existing `/potvrzeni-emailu` page, which signs the donor in with the new address.

#### Second factor

Any donor can protect the account with a time-based one-time code (TOTP, RFC 6238: HMAC-SHA1, 6 digits, 30-second steps, one step of tolerance each way) from an authenticator app; an administrator has to (Jakub, 2026-10-22, plan v2 task 5b). `domain/SecondFactor` (aggregate per donor: the 20-byte secret as 32 base32 characters in `TotpSecret`, `confirmedAt`, `lastUsedStep`), `domain/Totp` (`codeAt`, `matchingStep`; `TotpTest` checks the RFC 6238 vectors), `domain/SecondFactorChallenge`, `application/DonorSecondFactorService`, `DonorAuthenticationService.completeSecondFactor`, `interfaces/rest/DonorSecondFactorController`; the request records mask every field in `toString`, `code` is validated as exactly six digits (`Totp.CODE_SHAPE`).

Turning it on, signed in:

- `POST /api/donors/me/second-factor/setup` with the current password (400 `donors/wrong-password`; 409 `donors/second-factor-already-enabled` while it is on) stores a pending factor with a fresh secret (a second call replaces a pending one) and answers `{ "secret": "GEZD…", "otpauthUri": "otpauth://totp/Nov%C3%A1%20nad%C4%9Bje:jana%40example.cz?secret=…&issuer=Nov%C3%A1%20nad%C4%9Bje&algorithm=SHA1&digits=6&period=30", "qrPngBase64": "…" }` (`SecondFactorEnrolmentResponse`; the issuer is `app.donors.second-factor.issuer`, the label the donor's e-mail; the QR is the link rendered by the shared `ZxingQrCodeRenderer` at 240 px). A pending factor changes nothing about sign-in.
- `POST /api/donors/me/second-factor/confirm` with the first code the app shows (400 `donors/second-factor-not-pending` without a set-up, 400 `donors/second-factor-code-rejected`, title "Nesprávný kód", for a code that does not match) marks it confirmed, remembers the step the code came from, revokes every refresh token and opens a session **with** the second factor verified: 200 with the auth response and a fresh cookie, so an administrator is an administrator at once (`roles` contain `ADMIN`).
- `POST /api/donors/me/second-factor/disable` with the password and a fresh code (400 `donors/wrong-password`, 400 `donors/second-factor-not-enabled`, 400 `donors/second-factor-code-rejected` for a wrong or already used code) deletes the factor, revokes every refresh token and opens a plain session (an administrator loses `ADMIN` until they turn it on again). No e-mail is sent either way.
- The three endpoints share one counter: 10 requests per 15 minutes per client address (`SecondFactorChangeRateLimiter`) → 429 `donors/rate-limited`, before any hashing.

Signing in with it on:

- `POST /api/donors/auth/login` with the right password answers 401 with type `auth/second-factor-required` (title "Zadejte kód z aplikace") whose problem carries `challenge` (a 43-character secret) and `challengeExpiresAt`; no session opens and no cookie is set. The challenge is stored as its SHA-256 in `donor_second_factor_challenge`, valid `app.donors.second-factor.challenge-ttl` (5 minutes), for at most `app.donors.second-factor.challenge-attempts` (5) wrong codes, once. A wrong password, an unknown e-mail and an unconfirmed e-mail are answered as before, so the answer says nothing about the second factor until the password is right.
- `POST /api/donors/auth/login/second-factor` with `{ "challenge", "code" }`: 200 with the auth response and the refresh cookie when the code matches the current step or the one before or after and that step is newer than the last one used (a code is accepted once; the step is stored in `donor_second_factor.last_used_step`). 401 `auth/invalid-second-factor-code` ("Nesprávný kód") counts one attempt on the challenge; 401 `auth/invalid-second-factor-challenge` ("Přihlášení vypršelo") for a malformed, unknown, expired, used or exhausted challenge, after which the donor starts over with the password. 10 codes per 15 minutes per client address (`SecondFactorRateLimiter`), separate from the sign-in counter.
- The session opened with the code, and every refresh of it, carries the donor's full roles; a session opened by a password change, an e-mail confirmation or the reset keeps what it had (`DonorCredentialsService.changePassword(donorId, secondFactorVerified, …)` reads it from the JWT's roles).

Schema: `donors/006_add_second_factor.xml` adds `donor_second_factor` (`donor_id` PK and FK with cascade, `secret varchar(32)` stored in plain text because the server has to compute the code from it, `created_at`, `confirmed_at`, `last_used_step`), `donor_second_factor_challenge` (`id`, `donor_id` FK, `secret_hash` unique, `issued_at`, `expires_at`, `failed_attempts`, `used_at`; indexed by `donor_id`) and `donor_refresh_token.second_factor_verified boolean not null default false`. A lost authenticator is solved by hand: `delete from donor_second_factor where donor_id = …` in `deploy/README.md` ("Správci"); there are no recovery codes (decided for this version, Claude's default). Spent challenges are not deleted yet (a row per sign-in attempt at an account with the factor on). Cucumber: `features/donors/donor_second_factor.feature`; `admin_import_state.feature` proves the gate opens only after the code. Test glue: `cucumber/TotpCodes` computes codes from the scenario clock, `SecondFactorEnrolments.enable(alias)` turns it on through the API, `DonorSessions.signInAgain` answers a challenge with the code.

Frontend: the sign-in dialog answers `auth/second-factor-required` with a code step ("Přihlášení dokončíte kódem z ověřovací aplikace", field "Kód z aplikace" with `autocomplete="one-time-code"`, "← Zpět na heslo"); a wrong code keeps the step with the problem in the alert line, an invalid challenge goes back to the password form with "Přihlášení vypršelo. Zadejte prosím znovu e-mail a heslo." (`AuthStore.completeSecondFactor`). The overview's "Přihlašovací údaje" card shows "Dvoufaktorové ověření: Zapnuté/Vypnuté", for an administrator without it "Správa se vám otevře, až zapnete dvoufaktorové ověření a přihlásíte se s kódem z aplikace.", and offers "Zapnout dvoufaktorové ověření" (password → QR code, the key in groups of four with a copy button, the first code → `AuthStore.confirmSecondFactor` adopts the new session) or "Vypnout dvoufaktorové ověření" (password + code → `AuthStore.disableSecondFactor`).

#### Password reset

A donor who forgot the password asks for a link from the sign-in dialog, opens it from the e-mail and sets a new password on the public page `/obnova-hesla`, then signs in by hand. Both endpoints take JSON and answer without a body.

`POST /api/donors/auth/password-reset/request` with `{ "email": "jana@example.cz" }`:

- `email`: `@NotBlank @Email`, max 254, and the shape `EmailAddress` requires (`EmailAddress.SHAPE_REGEX`, a dot in the domain, so `jana@localhost` is a field error and not a domain exception), else 400 `validation` with a field error for `email`. Surrounding spaces are stripped before validation (registration still rejects them) and the address is lowercased, so `"  JANA@Example.cz "` reaches the donor registered as `jana@example.cz`.
- Always 202, whether or not the address belongs to a donor and whether or not an e-mail is sent. Nothing expensive runs on the request thread (no hashing, no mail: the e-mail is sent after the commit, asynchronously); the remaining timing difference between a known and an unknown address is a few database statements, accepted.
- 5 requests per hour per client address (`FixedWindowRateLimiter`, like the contact form) → 429 with type `donors/rate-limited` and the generic title and detail of `RateLimitExceededException`. The limit is a brake on how many e-mails the foundation's SMTP account sends, not an identity check. The backend trusts forwarded headers from any peer (`server.forward-headers-strategy: framework`), so the nginx in `frontend/` resolves the visitor's address itself (`real_ip` from the private proxy ranges) and rewrites `X-Forwarded-For` to it, dropping any client-sent `Forwarded` header. A CAPTCHA is the escalation if abuse appears (requirements: none until needed).
- At most 3 live links per donor (`app.donors.password-reset.max-live-links`): while the donor holds three unused, unexpired links, a further request answers 202 and sends nothing. A request never cancels an earlier link, so nobody can lock a donor out of a link already received; whoever knows the address can keep the three links occupied for up to an hour, accepted. The count is taken without a lock on the donor, so requests for one address that arrive at the same instant can each send a link (a few extra e-mails within the per-address limit), accepted.
- The e-mail (`templates/email/donors/password-reset.html`, multipart plain text + HTML, `From` "Nová naděje – nadační fond" with the address of `app.mail.sender-email`, no `Reply-To`, subject and body in the donor's `preferredLocale` from the `donors.passwordReset.email.*` bundle keys) names the account's address and carries the link `{app.site.public-url}/obnova-hesla#token=<secret>`. It contains nothing from the donor's profile (the registered name is unverified free text and could carry a phishing sentence under the foundation's sender); the only image is the foundation's logo, attached inline (`cid:logo`) by the shared layout, never loaded from the network. The token travels in the URL fragment, so it never reaches an access log or a `Referer`; the page reads it and removes it from the address bar.
- A send failure (no SMTP configured, a rejected address) is logged at ERROR with the donor id and the exception class only; the request already answered 202 and the donor can ask again.

`POST /api/donors/auth/password-reset/confirm` with `{ "token": "<43 base64url characters>", "password": "new passphrase" }`:

- `token`: `@NotBlank`, `^[A-Za-z0-9_-]{43}$`; `password`: `@NotBlank`, 12–128 characters (the same annotations as registration), else 400 `validation` with field errors.
- 400 `donors/password-too-common` for a password on the common list, checked before the token is consumed, so a weak password does not burn the link.
- 400 `donors/invalid-password-reset-token` for a well-formed token that is unknown, expired or already used (one code, no distinction; the lookup is by the SHA-256 of the presented value).
- 204 on success: the password is replaced, the token is marked used atomically (a concurrent confirm with the same token loses and answers 400), the donor's other reset links are deleted, every refresh token of the donor is revoked and the response clears the `refresh_token` cookie. Two different live links of one donor confirmed at the same instant can cross their row locks in PostgreSQL: the loser answers 500 instead of 400 while the end state is the same (one password, one used link, the others deleted), accepted. No session is opened: the donor signs in with the new password. Access tokens already issued stay valid until they expire (at most 15 minutes); there is no denylist.
- Not rate-limited: 256-bit tokens, a hash lookup, and no hashing before a valid token is found.

Table `donor_password_reset_token` (`donors/003_create_donor_password_reset_token.xml`): `id` (UUIDv7), `donor_id` (cascade), `secret_hash` (SHA-256 hex, unique), `issued_at`, `expires_at` (`issued_at` + `app.donors.password-reset.token-ttl`, PT1H), `used_at`. A request first deletes the donor's used and expired rows and a confirm deletes the donor's other rows, so the table holds at most the live links plus the last used one and needs no cleanup job.

Domain: `PasswordResetToken` aggregate, `LinkSecret` (generated like `RefreshTokenSecret`; the two are never interchangeable: a reset secret presented as the refresh cookie answers 401 `auth/invalid-refresh-token`), `PasswordResetTokenRepository`, `InvalidPasswordResetToken` (`RuleViolation`). Application: `DonorPasswordResetService` (`requestReset`, `confirmReset`), `DonorPasswordResetProperties`, the event `DonorPasswordResetRequested` in `donors/application/event`. Infrastructure: `infrastructure/mail/PasswordResetEmailSender` (`@Async AFTER_COMMIT`) and the JPA trio. REST: `interfaces/rest/DonorPasswordResetController` and `PasswordResetRateLimiter`; the request records mask every field in their `toString()` (Spring MVC logs request bodies at DEBUG in the dev profile), and `LoginRequest` and `RegisterDonorRequest` now mask the address, the name, the postal address and the password too (the type, the company identifier and the locale stay readable). Configuration: `PUBLIC_URL` → `app.site.public-url` (`shared/infrastructure/config/PublicUrlProperties`, validated: absolute `http(s)` URL without a query or a fragment, trailing slash stripped; default `https://nfnn.znamenacek.duckdns.org`, `http://localhost:4200` in the dev profile), `MAIL_FROM` → `app.mail.sender-email` (`shared/infrastructure/mail/MailSenderProperties`, shared with the contact form; falls back to `CONTACT_RECIPIENT`). Cucumber: `features/donors/donor_password_reset.feature`.

Frontend: the dialog's "Obnovit heslo" tab posts the request and shows "E-mail odeslán!" on 202 (its own sentence on 429); the public route `obnova-hesla` under the public shell (`features/donors/password-reset/`) reads the token from the fragment, replaces the URL, asks for the new password twice, posts the confirm, clears a session the browser still holds and offers the sign-in dialog on success; an invalid or missing link offers the dialog's reset tab (`LoginDialogService.open('reset')`).

#### Frontend session handling

`core/auth/AuthStore` keeps the donor and the access token in memory only. `authInterceptor` adds `Authorization: Bearer` to every `/api/**` call except `/api/donors/auth/**`; on a 401 whose problem type ends with `auth/expired-token` it refreshes once (one request even for parallel calls) and retries. A `localStorage` flag (`nfnn.donor-session`) only records that a session may exist, so the app calls `refresh` on start for returning donors and skips it for everyone else; `donorGuard` waits for that restore before opening `/donor/**` and otherwise sends the visitor home with the sign-in dialog open.

### `donations` — donations and PDF receipts

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `GET` | `/api/donations/me?year=` | donor | Caller's donations, newest first, optionally one year, with the total and count. |
| `GET` | `/api/donations/me/summary` | donor | Dashboard stat cards: total, count, last donation, totals per year. |
| `POST` | `/api/donations/me/bank-check` | donor | Asks the bank for new payments now unless the bank was asked in the last 30 seconds; 202 with when the bank data was last updated and whether a check is running. See "Bank check on demand". |
| `GET` | `/api/donations/me/bank-check` | donor | The same answer without asking the bank; the dashboard polls it while `checking` is true. |
| `GET` | `/api/donations/me/{id}/receipt` | donor | PDF receipt of one `RECEIVED` donation of the caller received from the first receipt year on. 404 for an unknown or another donor's id, 400 for an older donation. |
| `GET` | `/api/donations/me/bank-accounts` | donor | The caller's bank accounts: the accounts the foundation pairs their payments without a symbol from, with the donations paired through each and the question about an older variable symbol. See "Donor's bank accounts". |
| `POST` | `/api/donations/me/bank-accounts/{id}/disconnect` | donor | Stops pairing later payments without a symbol from that account to the caller; 204. Donations paired before stay. |
| `POST` | `/api/donations/me/bank-accounts/{id}/reconnect` | donor | Connects a disconnected account again once a payment with the caller's symbol arrives from it; 204. |
| `POST` | `/api/donations/me/bank-accounts/{id}/symbol-claim/confirm` | donor | Answers "yes" to the account's question about an older variable symbol (body `{"variableSymbol": "…"}`): stores the answer and pairs the payments with that symbol from the account; 200 with the count and the yearly receipts that changed. See "Older variable symbol confirmation". |
| `POST` | `/api/donations/me/bank-accounts/{id}/symbol-claim/decline` | donor | Answers "no" to the same question: stores the answer and pairs nothing; 204. |
| `GET` | `/api/donations/me/receipts/yearly?year=` | donor | PDF receipt of the caller's donations received in a completed year from the first receipt year on. 400 before the first receipt year and while the year is not completed, 404 when it has none. |
| `GET` | `/api/donations/payment-qr?amount=&variableSymbol=&purpose=` | public | Returns the SPAYD string (Czech "QR platba"), its PNG QR code and the foundation's bank account. A signed-in donor's frontend passes their variable symbol; the 1 Kč payment that verifies an account passes `purpose=ACCOUNT_VERIFICATION`. |
| `GET` | `/api/admin/donations/import-state` | admin | The Fio import's state for the administration: covered period, last attempt and success, last failure, failures in a row, the outage being reported. See "Administration". |
| `GET` | `/api/admin/donations/payments?pairing=unpaired\|paired&year=` | admin | Bank payments for the administration: the unpaired ones newest first, or the paired ones of one year with their donation, donor and whether a receipt was issued. See "Bank payments". |
| `GET` | `/api/admin/donations/donors?query=` | admin | Up to 20 donor records whose name contains or whose variable symbol starts with the query, for the pairing dialog. |
| `GET` | `/api/admin/donations/donors/{donorId}` | admin | The donor card's donation side: the `donor_record`, the bank accounts with their donation counts, every donation and every issued receipt. 404 `donations/donor-not-found`. See "Donor accounts". |
| `POST` | `/api/admin/donations/donors/{donorId}/bank-accounts/{linkId}/disconnect` | admin | Turns the pairing from the account off for the donor, as the donor's own "Vypnout párování" does, audited as `DISCONNECT_SENDER_ACCOUNT` → 204. 404 `donations/donor-not-found`, 404 `donations/bank-account-not-found`, 409 `donations/bank-account-already-disconnected`. |
| `POST` | `/api/admin/donations/donors/{donorId}/bank-accounts/{linkId}/reconnect` | admin | Turns it on again (`AWAITING_PAYMENT`), audited as `RECONNECT_SENDER_ACCOUNT` → 204. 404s as above, 409 `donations/bank-account-already-connected`. |
| `DELETE` | `/api/admin/donations/donors/{donorId}/bank-accounts/{linkId}` | admin | Removes the account from the donor: deletes the donations paired through it and the donor's older-symbol answers at it, the payments are unpaired again, audited as `REMOVE_SENDER_ACCOUNT_LINK` → 204. 404s as above, 409 `donations/bank-account-has-receipt`. |
| `POST` | `/api/admin/donations/payments/{id}/pair` | admin | Pairs an unpaired payment with a donor by hand (`{"donorId": "…"}`): a `MANUAL` donation, audited as `PAIR_PAYMENT`; 200 with the donation id and the yearly receipts it changes. |
| `POST` | `/api/admin/donations/payments/{id}/unpair` | admin | Deletes the payment's donation and keeps the payment out of automatic pairing, audited as `UNPAIR_PAYMENT`; 200 with the yearly receipts it changes; 409 when a single receipt was issued for the donation. |
| `GET` | `/api/admin/donations/symbol-claims` | admin | Every donor's answer to the older-symbol question, newest first, with donor, account, symbol, answer, time and the number of donations paired through it. See "Symbol claims". |
| `POST` | `/api/admin/donations/symbol-claims/{id}/reverse` | admin | Reverses a mistaken "yes": deletes the donations paired through the claim and turns the answer into `DECLINED`, audited as `REVERSE_SYMBOL_CLAIM` → 204. 404 `donations/symbol-claim-not-found`, 409 `donations/symbol-claim-not-confirmed`, 409 `donations/symbol-claim-has-receipt`. |
| `DELETE` | `/api/admin/donations/symbol-claims/{id}` | admin | Deletes a mistaken "no" so the account asks the donor again, audited as `RESET_SYMBOL_CLAIM` → 204. 404 `donations/symbol-claim-not-found`, 409 `donations/symbol-claim-still-confirmed`. |
| `POST/PATCH` | `/api/admin/donations[...]` | admin | Planned: manually record a donation without a bank payment, edit. |

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
      "source": "BANK_TRANSFER",
      "pairedBy": "SENDER_ACCOUNT",
      "senderAccount": "2900233333/2010",
      "confirmedSymbol": null,
      "receiptAvailable": true
    }
  ],
  "totalAmountMinor": 375000,
  "currency": "CZK",
  "count": 4
}
```

- `receiptNumber` is the number of the donation's active single receipt (the one its last download issued and nothing has replaced), `null` before the first download and for a `REFUNDED` donation; see "PDF receipts".
- `receiptAvailable` is `true` when the donation's single receipt can be downloaded: the donation is `RECEIVED` and was received on or after 1 January of the first receipt year (`app.donations.receipt.first-year`, 2026). Older donations stay in the list, the totals and the summary, but have no receipt, so the frontend offers no PDF for them.
- `purpose` is the text to show for the donation's `donation.purpose`, resolved by `Accept-Language` from the message bundles (`donation.purpose.<PURPOSE>`): `GENERAL` is "Obecný příspěvek", `ACCOUNT_VERIFICATION` is "Ověření účtu". The pairing sets `ACCOUNT_VERIFICATION` when the payment is exactly 1 Kč and its message for the recipient, without diacritics, case and repeated spaces, contains `OVERENI UCTU` (the QR payment that adds a bank account sends "OVERENI UCTU NADACNI FOND NOVA NADEJE"); every other payment, a larger one with that message included, is `GENERAL`. A verification payment is still a gift: it counts in the totals and on the receipts like any other. A project-bound purpose comes with the admin.
- `pairedBy` is `VARIABLE_SYMBOL`, `SENDER_ACCOUNT` or `CONFIRMED_SYMBOL` (`null` for a manual donation). `senderAccount` is the account (`number/bank code`) a donation paired by account or by a confirmed symbol was paired through, `null` otherwise. `confirmedSymbol` is the older variable symbol (matching form, without leading zeros) of a `CONFIRMED_SYMBOL` donation, `null` otherwise (see "Older variable symbol confirmation"). The dashboard tags a donation paired by account „bez VS · …5399/0800“ and one paired by a confirmed symbol „VS 6123456789 · …5399/0800“.
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
  "yearlyReceiptsAvailableThrough": 2025,
  "receiptsAvailableFrom": 2026
}
```

- Same counting rule as the list: `RECEIVED` donations only.
- `lastReceivedAt` is the newest `receivedAt`, `null` when there is none.
- `byYear` holds one entry per calendar year with at least one counted donation, newest year first; empty when there are none.
- `yearlyReceiptsAvailableThrough` is the last completed calendar year in Prague time (`2025` during 2026): the yearly receipt can be downloaded for that year and earlier, so the frontend decides nothing from its own clock.
- `receiptsAvailableFrom` is the first receipt year (`app.donations.receipt.first-year`, `2026`): receipts, single and yearly, are issued only for donations received from 1 January of that year, so the yearly receipt can be downloaded for the years from `receiptsAvailableFrom` through `yearlyReceiptsAvailableThrough`.

Enums:
- `DonationStatus`: `RECEIVED`, `REFUNDED`.
- `DonationSource`: `BANK_TRANSFER`, `MANUAL` (admin-recorded).

#### PDF receipts

`GET /api/donations/me/{id}/receipt` returns the receipt of one `RECEIVED` donation of the caller ("Potvrzení o přijetí daru"); `GET /api/donations/me/receipts/yearly?year=YYYY` returns the receipt of every `RECEIVED` donation the caller gave in a completed calendar year ("Potvrzení o přijatých darech za rok YYYY"). Both find the caller by the JWT subject; 401 `auth/unauthenticated` without a token. Nothing is e-mailed.

Receipts are issued only for donations received from 1 January of the first receipt year (`app.donations.receipt.first-year`, `RECEIPT_FIRST_YEAR`, default `2026`; `domain/receipt/FirstReceiptYear`): the foundation may have issued receipts for earlier gifts itself, so the web issues none for them. Older donations are still listed (`receiptAvailable` is `false` for them, `receiptsAvailableFrom` in the summary names the year), and both endpoints refuse them with 400 `donations/receipt-before-first-year` (`ReceiptBeforeFirstYear`, a `RuleViolation`), title "Za dary z této doby potvrzení na webu nevystavujeme". The title cannot name the year, because the problem handler resolves titles without arguments; the frontend takes the year from `receiptsAvailableFrom`. A receipt issued before the floor was raised stays issued, but is no longer served.

Response:

- `200`, `Content-Type: application/pdf`, `Content-Length`, `Cache-Control: private, no-store`, `Content-Disposition: attachment; filename="<ascii>"; filename*=UTF-8''<urlencoded>` (both forms, as Spring's `ContentDisposition` writes them).
- File names are ASCII, resolved in the controller from the message bundle (`receipt.fileName.single`, `receipt.fileName.yearly`) in the receipt's language: Czech `potvrzeni-o-daru-2027-000001.pdf` (single, with the receipt number) and `potvrzeni-o-darech-2026.pdf` (yearly, with the year); English `donation-receipt-2027-000001.pdf` and `donation-summary-2026.pdf`.

Single receipt:

- 404 `donations/donation-not-found` for an id that does not exist or belongs to another donor (one query, no existence leak; there is no 403).
- 404 `donations/receipt-not-available` for a `REFUNDED` donation.
- 400 `donations/receipt-before-first-year` for a `RECEIVED` donation received before 1 January of the first receipt year. The checks run in this order (not found or foreign, refunded, before the first receipt year), so the answer never tells another donor's donation from a missing one.
- 400 `validation` for an id that is not a UUID.

Yearly receipt:

- `year` is required and four digits (`@Min(1000) @Max(9999)`), else 400 `validation`.
- 400 `donations/receipt-before-first-year` for a year before the first receipt year, checked first.
- 400 `donations/year-not-yet-completed` while `year` is the current Prague calendar year or later: a receipt covers a completed year and is available from 1 January.
- 404 `donations/yearly-receipt-not-available` for a completed year in which the caller has no `RECEIVED` donation.

A receipt is a frozen document. The first download issues it: the PDF is rendered and gets a receipt number and an issue date, and `donation_receipt` keeps what it was rendered from instead of the file (see "Receipts kept as template and data"); every later download renders the same bytes again, so a number always denotes one document. When the data the receipt certifies has changed since it was issued (a late-paired payment of that year, a changed donor name or address; the certified data is hashed into `fingerprint`), the next download issues a replacement with a new number that states which receipt it replaces, and the old one is marked superseded (`superseded_at`). A changed signatory, template or preferred language never re-issues. Issuing is serialised per donor: a transaction of its own first locks the donor's `donor_record` row and only then reads the donations and the donor record and computes the fingerprint, so two parallel downloads yield one receipt, and a download that had to wait certifies what was committed meanwhile (a profile change holds that row until it commits, and so does an import that stored a donation of the donor, through the foreign key); a replacement is therefore never issued from older data than the receipt it replaces. A receipt is voided only by its replacement: when a certified donation later becomes `REFUNDED`, the single receipt answers 404 `donations/receipt-not-available` (the yearly one 404 `donations/yearly-receipt-not-available` once no `RECEIVED` donation of the year remains) and the stored receipt keeps `superseded_at` empty, so the foundation deals with a receipt of a refunded gift by hand; nothing marks a donation `REFUNDED` yet.

Receipt numbers are `YYYY-NNNNNN`: the year of issue and a six-digit serial from the sequence `donation_receipt_number_seq`, which never resets (`2027-000001`, `2027-000002`, ..., at most 999 999). A gap is possible (a render that failed consumed a serial) and acceptable.

The language of a receipt is the donor's `preferredLocale` at first issue, stored on the receipt; a later change of the preference does not re-issue, and a replacement keeps the language of the receipt it replaces. An `en` receipt is bilingual, every Czech label and paragraph with its English rendering beneath; a `cs` receipt is Czech only. `Accept-Language` plays no part.

The document (Thymeleaf template `templates/pdf/donation-receipt.html`, rendered by openhtmltopdf with embedded DejaVu Sans) carries the title, number and issue date; the replaced receipt when there is one; the foundation (name, IČO, seat, registry court and file); the donor (person: name and residence; company: name, IČO and seat; always the variable symbol); the gift or gifts: one donation with its form, date of crediting, amount and the foundation's account, or the yearly table of dates and amounts oldest first with the count and the total; the declaration that the gifts were given without consideration for the statutory purposes, naming § 15 odst. 1 and § 20 odst. 8 of zákon č. 586/1992 Sb.; place and date of issue, the signature image when configured, the signatory's name and role; and a running footer with the foundation line and the receipt number on every page. The texts live under `receipt.*` in the message bundles.

Table `donation_receipt` (`db/changelog/donations/005_create_donation_receipt.xml`, `008_keep_receipts_as_template_and_data.xml`, `009_drop_receipts_stored_as_pdf.xml`):

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
| `template_sha256` | FK to `receipt_template`: the markup and texts the receipt was rendered with |
| `data` | the receipt's values as JSON, already formatted as printed (`"500 Kč"`, `"15. 3. 2026"`), with no texts and no images |
| `logo_sha256`, `signature_sha256` | FKs to `receipt_image`; no signature when the receipt was issued without one |
| `render_profile` | `1`: openhtmltopdf with the DejaVu Sans fonts in `resources/fonts/` |
| `pdf_sha256` | SHA-256 hex of the file issued, kept to compare a later rendering with |
| `supersedes_id`, `superseded_at` | the receipt this one replaces; when this one was replaced |

`ck_donation_receipt_shape` ties `kind` to `donation_id` and `receipt_year`; the snapshot columns (template, data, logo, profile, PDF digest) are not null; partial unique indexes keep one active (not superseded) receipt per donation and per donor and year.

#### Receipts kept as template and data

A receipt stores no PDF. Issuing freezes it into a snapshot: the template bundle, the logo and the signature image are each stored once by the SHA-256 of their content (`receipt_template`: `sha256`, `content`, `first_used_at`; `receipt_image`: `sha256`, `media_type`, `content`, `first_used_at`; insert if absent), and the receipt row holds their digests, its `data` (about 1 kB, 15 kB for 120 gifts) and `render_profile`. The template bundle is canonical JSON `{"html":…,"texts":{"cs":{…},"en":{…}}}` with `templates/pdf/donation-receipt.html` and every `receipt.*` text of the message bundles except `receipt.fileName.*`, so changing the markup or a text adds a new bundle and leaves issued receipts on theirs. A download of an active receipt whose fingerprint still matches renders the snapshot again (40–125 ms); the PDF is deterministic, with `CreationDate` set to `issued_at` and the document `/ID` derived from the number, so the bytes equal those first served. Receipts stored as PDF files during the test run before `008` were deleted by `009`, which also dropped `content`; their donors get a new receipt with a new number on the next download. The fingerprint keeps its role: it decides whether the certified data changed and a replacement is due; `pdf_sha256` only records the issued file. A stored template or image whose content no longer matches its digest, an unknown digest or an unknown render profile fails the download with 500 instead of serving a different document.

Rendering is capped at `app.donations.receipt.concurrent-renders` (3) at a time across the backend, so a wave of downloads (the New Year) queues instead of exhausting memory; each waiting download holds no database connection until its turn. A download waits for its turn before it opens its transaction and locks the donor, so the 404s (an unknown, foreign or refunded donation, a completed year without a `RECEIVED` donation) and the 400 for a single donation received before the first receipt year are answered only after that wait too, behind the renders running at the moment; only the two 400s of the yearly receipt (a year before the first receipt year, a year not yet completed) are answered before it.

What may change and what may not: a new template or text is fine (a new bundle); a new logo or signature is fine (a new image); a change to how `data` is formatted affects only receipts issued afterwards. A change to the fonts, to openhtmltopdf's output or to `ThymeleafPdfReceiptRenderer` that alters the layout of an existing bundle would change issued receipts, so it needs a new `render_profile` that keeps profile 1 rendering as before. `ReceiptTemplateHistoryTest` guards this: `src/test/resources/receipts/history/<sha256>/` keeps every template bundle that was ever current, with sample data and the text of each sample page, and the test renders each from its stored data and compares the text; it fails when the current bundle is not recorded and writes the candidate folder to `backend/build/receipt-history/`, which is reviewed and committed with the change. It also pins the SHA-256 of both fonts.

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
| `concurrent-renders` | - | `3`: receipts rendered at the same time; at least 1 |
| `first-year` | `RECEIPT_FIRST_YEAR` | `2026`: receipts are issued for donations received from 1 January of this year; empty means the default; a whole number outside 1000–9999 that fits a Java `int` stops the startup with `RECEIPT_FIRST_YEAR (app.donations.receipt.first-year) must be a four-digit year, but is …`, and text that is not a whole number, or a number too large for an `int` such as `99999999999`, stops it in the binder with `Failed to bind properties under 'app.donations.receipt.first-year' to java.lang.Integer` |

The account number printed on the receipt is `app.donations.bank-account.account-number`.

#### `GET /api/donations/payment-qr`

```
GET /api/donations/payment-qr?amount=500&variableSymbol=1234567890
```

- `amount`: whole CZK, required, 1 to 1 000 000.
- `variableSymbol`: optional, 1 to 10 digits. The frontend sends the signed-in donor's `variableSymbol` from `GET /api/donors/me`; the backend does not look the donor up, so the endpoint stays public and stateless.
- `purpose`: optional, `DONATION` (default, message "Dar Nadační fond Nová naděje") or `ACCOUNT_VERIFICATION` (message "Ověření účtu Nadační fond Nová naděje", for the payment that adds a bank account, see "Donor's bank accounts"). `ACCOUNT_VERIFICATION` needs `variableSymbol`, else 400 `donations/verification-needs-variable-symbol`; another value answers 400 `validation` for `purpose`. The purpose changes only the message: the import pairs the payment by its symbol either way.
- A missing, non-numeric or out-of-range parameter answers 400 `validation` with `errors: [{ field, message }]`, `field` being the query parameter name.

Response:
```json
{
  "spayd": "SPD*1.0*ACC:CZ2620100000005544332217*AM:500.00*CC:CZK*X-VS:1234567890*RN:NADACNI FOND NOVA NADEJE*MSG:DAR NADACNI FOND NOVA NADEJE",
  "qrPngBase64": "iVBORw0KG...",
  "bankAccount": {
    "accountNumber": "5544332217/2010",
    "iban": "CZ2620100000005544332217",
    "recipientName": "Nadační fond Nová naděje"
  }
}
```

SPAYD 1.0 rules the backend follows (`donations/domain/payment/QrPayment`): fields joined by `*` in the order `ACC` (IBAN, no spaces), `AM` (two decimals, `.` separator), `CC:CZK`, `X-VS` (only when a variable symbol was given), `RN` (recipient name, max 35 characters), `MSG` (the purpose's message, max 60 characters). `RN` and `MSG` are uppercase ASCII without diacritics, limited to the QR alphanumeric set (`0-9 A-Z space $ % + - . / :`). The PNG is 300x300 px, error correction level M.

The bank account comes from `app.donations.bank-account.{account-number,iban,recipient-name}` (env `BANK_ACCOUNT_NUMBER`, `BANK_IBAN`, `BANK_RECIPIENT_NAME`). The defaults are placeholders until the foundation supplies its real account; an IBAN that fails the mod-97 check stops the backend at startup.

#### Fio import and pairing

Implemented: the backend downloads the foundation account's movements from the Fio API every hour, and when a donor opens the overview (see "Bank check on demand"), and turns them into donations. `GET /api/donations/me` and `/api/donations/me/summary` read the `donation` table described here for the donor in the JWT subject; the receipts keep their own table, `donation_receipt` (see "PDF receipts").

Tables (`db/changelog/donations/001`–`012`):

| Table | Holds | Columns that matter to readers of the API |
|---|---|---|
| `donor_record` | The `donations` copy of each donor, fed by the shared events above; no FK to `donor`, the ids are equal by construction. It carries the receipt data. | `donor_id`, `type` (`PERSON`/`COMPANY`), `name`, `company_identifier`, `street`, `city`, `postal_code`, `variable_symbol` (unique), `preferred_locale`, `registered_at`, `updated_at` |
| `bank_payment` | Every incoming CZK movement, stored once (`bank_transaction_id` is Fio's movement id and unique). Texts from the bank are cut to their column width before storing. | `booked_on`, `amount_minor`, `currency`, `sender_account_number`/`sender_bank_code` (canonical Czech account, null for a foreign payer), `counterparty_*` as sent, `variable_symbol` as sent (e.g. `0558`), `matching_variable_symbol` (digits with leading zeros stripped, null when there is none), `constant_symbol`, `specific_symbol`, `message_for_recipient`, `transaction_type`, `imported_at` |
| `admin_action` | What administrators changed and when (see "Administration", "Audit trail"); written by `shared/infrastructure/audit/AdminActionLog` before the use case's commit. | `admin_id`, `action`, `subject_id`, `details`, `performed_at` |
| `bank_import_state` | One row (`id = 1`): the period the application has downloaded, the last attempt and the outage being reported (see "Import outage alerts"). | `covered_from`/`covered_to`, `last_attempted_at`, `last_succeeded_at`, `last_failure_kind` (`RATE_LIMITED`, `HISTORY_LOCKED`, `UNAUTHORIZED`, `TRANSPORT`, `INVALID_RESPONSE`, `UNEXPECTED`), `last_failure_message`, `consecutive_failures` (counted failures in a row, 0 after a success), `reported_outage` (the kind the foundation was e-mailed about, null when none is open) |
| `donation` | A payment given to a donor (`Donation` aggregate). `uq_donation_bank_payment` makes a double pairing impossible. | `donor_id` (FK to `donor_record`), `bank_payment_id`, `received_on` (= `booked_on`), `amount_minor`, `currency`, `source` (`BANK_TRANSFER`; `MANUAL` has no producer yet), `status` (`RECEIVED`; `REFUNDED` has no producer yet), `paired_by` (`VARIABLE_SYMBOL`, `SENDER_ACCOUNT`, `CONFIRMED_SYMBOL`, enforced by `ck_donation_paired_by`; `MANUAL` comes with the admin task and a changelog that widens the check), `sender_account_id` (FK to `donor_sender_account`, the link a `SENDER_ACCOUNT` or `CONFIRMED_SYMBOL` donation was paired through; null otherwise), `symbol_claim_id` (FK to `donor_symbol_claim`, the claim a `CONFIRMED_SYMBOL` donation was paired by; null otherwise). Checks keep them consistent: a link only with `SENDER_ACCOUNT` or `CONFIRMED_SYMBOL` (`ck_donation_sender_account_pairing`), a claim exactly when `CONFIRMED_SYMBOL` (`ck_donation_symbol_claim_pairing`), and `CONFIRMED_SYMBOL` always with a link (`ck_donation_confirmed_symbol_link`). `purpose` (`GENERAL` or `ACCOUNT_VERIFICATION`, from the payment's message; see `GET /api/donations/me`), `recorded_at` |
| `donor_sender_account` | One row per period a donor's account pairs payments (`SenderAccountLink`): a new row when the account is learned or reconnected, the row's end set when it is disconnected, never deleted. At most one live (not `DISCONNECTED`) row per donor and account (`uq_donor_sender_account_live`; a learned or reconnected link is inserted with `on conflict ... do nothing` against it). | `id`, `donor_id`, `account_number`, `bank_code`, `status` (`ACTIVE`, `AWAITING_PAYMENT`, `DISCONNECTED`), `learned_from_payment_id` and `learned_at` (the payment with the donor's symbol that proved it, null while awaiting), `valid_from`/`valid_to` (booking days the link pairs, both inclusive, null = unbounded), `created_at`, `disconnected_at` |
| `donor_symbol_claim` | A donor's answer to whether the payments with an old variable symbol from one of their accounts are theirs (`SymbolClaim`, pairing rule 8): one row per donor, account and symbol (`uq_donor_symbol_claim`; an answer is inserted with `on conflict ... do nothing`, so the first answer stays), never changed by the donor, deleted with its donor record. The answer endpoints of "Donor's bank accounts" insert it; an administrator reverses a yes to `DECLINED` or deletes a no (see "Symbol claims"). | `id`, `donor_id` (FK to `donor_record`), `account_number`, `bank_code`, `variable_symbol` (the matching form: one to ten digits without a leading zero, `ck_donor_symbol_claim_symbol`), `answer` (`CONFIRMED`, `DECLINED`), `answered_at` |
| `donation_receipt` | Every receipt ever issued, with its template and data ; see "PDF receipts". | `donor_id`, `kind`, `donation_id`, `receipt_year`, `number`, `issued_on`, `locale`, `fingerprint`, `template_sha256`, `data`, `logo_sha256`, `signature_sha256`, `render_profile`, `pdf_sha256`, `supersedes_id`, `superseded_at` |
| `receipt_template`, `receipt_image` | The receipt template bundles and images, each stored once by its SHA-256. | `sha256`, `content`, `media_type` (images), `first_used_at` |

"Unpaired" is derived: a `bank_payment` no `donation` references. The reason a payment stayed unpaired is logged, not stored.

Import cycle (`donations/application/importing`, `donations/infrastructure/fio`):

- `FioImportScheduler` exists only when `FIO_TOKEN` is set; it runs `ImportBankPaymentsService.importIncomingPayments` 30 seconds after start (`STARTUP`) and then with a fixed delay of one hour (`HOURLY`), on Boot's single-thread `TaskScheduler` (`@EnableScheduling` in `shared/infrastructure/scheduling`). Overlapping runs are skipped with a WARN. Without a token the `FioClient` bean is `DisabledFioClient` and nothing calls the bank.
- The application owns the downloaded period (`bank_import_state.covered_from/covered_to`). Every run is exactly one `GET /periods/` request from `max(covered_to − 3 days, today − 89 days)` to today (Prague calendar date); the three-day overlap catches late and back-dated bookings, and a movement delivered twice is skipped by its transaction id. The bank-side bookmark (`/last/`, `setLastDownloadedId`, `setLastDownloadedDate`) is never used.
- Only the `STARTUP` run may ask for history Fio keeps locked (older than 90 days): on the first run ever it asks from `FIO_HISTORY_FROM` when set, and at every later start again while `FIO_HISTORY_FROM` lies before `covered_from`. An `HOURLY` run never does. The requested period is what gets covered; for a deep request the period the bank reports is trusted instead (it equals the request in practice). A run that leaves days between the old and the new coverage logs a WARN naming the gap and the `FIO_HISTORY_FROM` that closes it.
- Follow-ups: a 409 (one request per token per 30 seconds) is retried once at the bank's retry time plus a second with the same trigger; a 422 on a period that needed the unlock records `HISTORY_LOCKED` and retries 31 seconds later for the servable window as `HOURLY`; a 422 inside the window is an ERROR about `history-window` and waits for the next hour. At most one follow-up is pending and at most three run per hourly tick. `UNAUTHORIZED` (token missing, not yet active or expired after 180 days) is an ERROR with the renewal instruction; `TRANSPORT`, `INVALID_RESPONSE` and `UNEXPECTED` wait for the next hour. Every failure line carries the kind and the bank's token-masked message (`failed with TRANSPORT (…)`). Every failure lands in `bank_import_state`; the third counted failure in a row, a rejected token and the success after either e-mail the foundation (see "Import outage alerts"); `/actuator/health` never depends on Fio.
- The adapter (`FioBankStatementSource`, over the `io.github.bzumik1:fio-api` client) drops outgoing, zero and non-CZK movements and an amount that is not a whole number of hellers (each with a WARN naming the movement id), takes the counterparty account and bank code as the bank sent them (columns 2 and 3), parses the sender from them into a canonical Czech account (`SenderAccount.parse`; an IBAN or a missing bank code gives no sender), keeps the raw variable symbol next to its matching form and stores the bank's Czech type label (`typeLabel`). The library refuses a whole answer with a payment symbol that is not digits of the allowed length (variable and specific 1–10, constant 1–4) as `INVALID_RESPONSE`. The client is built with `RateLimit.failFast()`: it never waits for the 30-second slot itself, so a 409 or a request it holds back is `RATE_LIMITED` with its retry time and becomes a follow-up. Payments, donations, learned accounts and the coverage are written in one transaction per run.

Pairing rules (`donations/domain/pairing/PaymentPairingPolicy`, applied by `PaymentPairingService` over every unpaired payment at the end of each import and, for one donor, right after a registration). Each import pairs in three passes over the unpaired payments: by symbol (rule 1), then by account (rule 3), then by confirmed symbol (rule 8), so an account learned in the run counts for both later passes:

1. Symbol first. A payment whose `matching_variable_symbol` equals a donor's symbol becomes that donor's donation (`paired_by = VARIABLE_SYMBOL`), even when the sender account was learned by someone else: the payer named the donor. Such a payment also teaches the donor its sender account, which is the only way an account is ever learned (`DonorRecord.learnSenderAccountFrom` refuses any other payment). It teaches nothing when the donor already has any link to that account (a disconnected one included: only the donor reconnects it), when the account is excluded (rule 7), or when it has no Czech sender. A link awaiting a payment (after a reconnect) is proved by such a payment booked on or after its start and becomes `ACTIVE`.
2. A symbol nobody has pairs only through the donor's confirmed claim (rule 8); otherwise it stays unpaired whatever the account. It never teaches an account (a mistyped symbol must not become someone's gift).
3. No symbol: exactly one donor must have a proved link to the sender account whose period covers the payment's booking day; then the payment is theirs (`paired_by = SENDER_ACCOUNT`, `sender_account_id` = that link). A newly learned link has no start, so it also pairs the donor's older payments from the account; when other donors' proved links to the account ended (they disconnected them), the new link starts the day after the latest such end, whether or not those donors have connected the account again since (`DonorRecord.releasedSenderAccountOn`), so the new owner never gets a previous owner's history. A donor whose link to the account never ended has no such end, so with only such donors the new link has no start and the account is shared over its whole history. A previous holder's reconnect, once a payment proves it, covers the days from its own start, so from then on the account is shared with the new link, whichever of the two proving payments was handled first. A disconnected link pairs payments up to and including its last day. Two or more owners leave it unpaired (one WARN per account and run, naming the bank transaction id); no owner, or no Czech sender, leaves it unpaired. The symbol pass runs over the whole unpaired set before the account pass, so an account learned today pairs older payments without a symbol in the same run.
4. A variable symbol of `0` (what Fio sends for some standing orders) counts as no symbol: it is stored raw, its matching form is null, and the payment goes to the account rule.
5. The sender's name is never used for pairing, also not to check that the account belongs to the donor (Jakub's decision of 18 October 2026: a donor who proves an account with their symbol gets its payments even when the bank names someone else). Only the type check of the question about an older variable symbol reads it (see "Older variable symbol confirmation").
6. The hourly run never re-points or removes a donation: a payment keeps its donor when imported again, and an account that a second donor proves with their own symbol leaves the first donor's earlier account-based donations in place while later payments from it without a symbol stay unpaired. Disconnecting an account changes no donation either; a donation the donor says is not theirs is for the admin.
7. Excluded accounts (`pairing.excluded-accounts`, for example a payment gateway's or a collection account many people pay through) are never learned and never pair a payment without a symbol (`EXCLUDED_SENDER_ACCOUNT`); a payment from them with a donor's symbol still pairs by the symbol.
8. Confirmed symbols. A donor's `CONFIRMED` claim (donor, sender account and symbol in `donor_symbol_claim`) pairs a payment from that account whose `matching_variable_symbol` is the claimed symbol and belongs to no registered donor, when exactly one donor's proved link to the account covers the payment's booking day and that donor is the claimant: `paired_by = CONFIRMED_SYMBOL`, `sender_account_id` = that link, `symbol_claim_id` = the claim. This is the account rule (rule 3) applied to the confirmed symbol: another donor's link covering the day leaves the payment unpaired (`AMBIGUOUS_SENDER_ACCOUNT`, in an import one WARN per account and run naming the bank transaction id and the claim id), no covering link of the claimant leaves it unpaired (`UNKNOWN_VARIABLE_SYMBOL`), and an excluded account pairs nothing (`EXCLUDED_SENDER_ACCOUNT`, also when the donor learned it before it was excluded). A `DECLINED` claim pairs nothing. A claim never teaches, starts or ends a link, so the days after a disconnect and before a proved reconnect stay unpaired. A registered donor's symbol always wins (rule 1): once someone registers with a claimed symbol, new payments with it are theirs and the donations the claim paired stay. `PaymentPairingService.pairConfirmedSymbol(claim)` pairs one claim's unpaired payments the same way, for the answer endpoint, and returns them.

Every pairing writer (`pairUnpaired` at the end of an import, `pairPaymentsOf` after a registration and `pairConfirmedSymbol`) first takes the transaction-scoped PostgreSQL advisory lock `pg_advisory_xact_lock(20261022)` through the `PairingLock` port (`infrastructure/persistence/PostgresPairingLock`, which refuses to run outside a transaction). The writers therefore run one after another, each reads what the one before it committed, and the lock is released when the transaction ends; `uq_donation_bank_payment` stays the last guard. The import's INFO line and its `ImportCounts` report the payments paired by symbol, by account and by confirmed symbol separately, with the accounts learned and the payments left unpaired.

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

| `pairing.excluded-accounts` | `PAIRING_EXCLUDED_ACCOUNTS` | empty | comma-separated Czech accounts written `number/bank code` (`2400000002/2010,19-2000145399/0800`) that are never learned (pairing rule 7); an entry that is not a Czech account stops the startup |
| `import.on-demand-cooldown` | — | `PT30S` | how long after the last attempt (successful or not) a donor's bank check does not ask the bank; Fio allows one request per token per 30 seconds |

#### Donor's bank accounts

A donor sees the accounts their payments without a symbol are paired from and can disconnect one or connect it again. Every account is proved the same way: a payment with the donor's variable symbol from it (one koruna is enough). There is no other way to add an account and no check of the holder's name. The dashboard calls disconnect and reconnect "Vypnout párování" and "Zapnout párování" (a disconnected row says "Párování vypnuto"); the API keeps the names below.

`GET /api/donations/me/bank-accounts` (401 without a token; a donor without a record gets an empty list):

```json
{
  "items": [
    {
      "id": "0192f0f1-...",
      "accountNumber": "2900233333/2010",
      "status": "ACTIVE",
      "verifiedOn": "2026-10-17",
      "connectedFrom": null,
      "disconnectedOn": null,
      "donationCount": 2,
      "totalAmountMinor": 50000,
      "currency": "CZK",
      "lastDonationOn": "2026-10-12",
      "shared": false,
      "pairingExcluded": false,
      "verificationPaymentOn": "2026-10-16",
      "symbolOffer": { "variableSymbol": "6123456789", "paymentCount": 14, "firstMonth": "2025-01", "lastMonth": "2026-10" },
      "confirmedSymbols": []
    }
  ]
}
```

- One item per link (`donor_sender_account` row), live ones first, then newest first; a reconnected account appears twice, the old period as `DISCONNECTED`. An excluded account appears only when it was learned before it was excluded; it keeps its donations and pairs nothing more.
- `status`: `ACTIVE` pairs payments; `AWAITING_PAYMENT` was reconnected and waits for a payment with the symbol booked from `connectedFrom`; `DISCONNECTED` ended on `disconnectedOn` (its last paired booking day, the Prague date of the disconnect).
- `verifiedOn` is the Prague date the proving payment was paired, null while awaiting. `connectedFrom` is the link's first booking day, null when it pairs the account's whole history.
- `donationCount`, `totalAmountMinor` and `lastDonationOn` cover the `RECEIVED` donations paired by account (`paired_by = SENDER_ACCOUNT`) through this link (`donation.sender_account_id`); donations paired by symbol or by a confirmed symbol are not counted here, so the dashboard's „N darů bez VS“ stays true.
- `shared` is true for an active link when another donor also has an active link to the account; payments without a symbol from it then stay unpaired (rule 3). Another donor's link that still awaits its payment does not count, and an excluded account is never shared.
- `pairingExcluded` is true when the account is in `pairing.excluded-accounts` (rule 7): it pairs only payments with the symbol. Disconnect works as for any other link. Reconnect answers 204 too, but an excluded account is never learned (rule 7), so a payment never proves its new link: it stays `AWAITING_PAYMENT` and pairs nothing. The dashboard shows a live excluded row with its own hint and no "Vypnout párování", except an `AWAITING_PAYMENT` one, which reads "Jen s variabilním symbolem" instead of "Čeká na platbu" and keeps "Vypnout párování" so the donor can end the wait; the newest disconnected excluded row of its number says why it offers no "Zapnout párování".
- `verificationPaymentOn` is the booking day of the donor's latest verification payment from the account (a `RECEIVED` donation with purpose `ACCOUNT_VERIFICATION` paired by the donor's symbol), the same on every row of the account, `null` when there is none. It lets the add-account dialog see that a one-koruna payment arrived from an account that was already verified.
- `symbolOffer` is the question about an older variable symbol (see "Older variable symbol confirmation"), `null` unless the row asks it: the symbol in its matching form, `paymentCount` (at least 1), and `firstMonth` and `lastMonth` (`YYYY-MM`) of the payments a confirmation would pair. It never carries amounts or names.
- `confirmedSymbols` lists the symbols the donor confirmed for the account, oldest answer first, on the account's first row (the newest link of that number) and empty on its other rows; a declined symbol is not listed.

`POST /api/donations/me/bank-accounts/{id}/disconnect` answers 204 and ends the link today (Prague date): payments booked up to today still pair, later ones without a symbol stay unpaired, the donations paired before stay. 404 `donations/bank-account-not-found` for an unknown id or another donor's link, 409 `donations/bank-account-already-disconnected` when it is already disconnected. A later payment with the symbol does not connect it again.

`POST /api/donations/me/bank-accounts/{id}/reconnect` answers 204 and creates a link `AWAITING_PAYMENT` from today for the same account; it becomes `ACTIVE` (not for an excluded account, see `pairingExcluded`) with the next payment with the donor's symbol from that account booked from today and pairs payments without a symbol booked from today on, never the gap. 404 as above, 409 `donations/bank-account-already-connected` when the donor already has a live link to the account (also for an `ACTIVE` id).

`POST /api/donations/me/bank-accounts/{id}/symbol-claim/confirm` with the body `{"variableSymbol": "6123456789"}` answers "yes" to the row's question: it stores the answer and pairs the payments the question counted, and answers 200:

```json
{ "pairedCount": 14, "changedYearlyReceipts": [2026] }
```

- `pairedCount` is the number of payments paired now; later ones pair in the import (pairing rule 8).
- `changedYearlyReceipts` lists, ascending, the years from the first receipt year on that gained a donation and already have an active yearly receipt. The next download of such a year issues a replacement (see "PDF receipts"), and the dashboard says „Potvrzení za rok 2026 se změnilo, stáhněte si nové.“

`POST /api/donations/me/bank-accounts/{id}/symbol-claim/decline` with the same body answers "no": it stores the answer, pairs nothing, and answers 204.

Both endpoints share their errors:
- 400 `validation` with the field `variableSymbol` when the symbol is missing or is not one to ten digits without a leading zero (the symbol goes in the body, not the path, so it stays out of access logs);
- 401 without a token;
- 404 `donations/bank-account-not-found` for an unknown id or another donor's link;
- 409 `donations/symbol-claim-already-answered` („Na tuto otázku jste už odpověděli“) when the donor already answered that symbol for the account, either way;
- 409 `donations/symbol-offer-not-available` („Tato otázka už neplatí“) when the row does not ask about that symbol now: it never did, or the bank data or the account changed since the list was read.

Code: `domain/donor/SenderAccountLink` (status, period, proof) inside the `DonorRecord` aggregate, `ExcludedSenderAccounts`; `application/bankaccount/DonorBankAccountsService` and `BankAccountView`; `interfaces/rest/DonorBankAccountsController`; `infrastructure/bank/PairingProperties`; Liquibase `donations/006_link_sender_accounts_over_time.xml`, which gives every existing row an id, keeps it `ACTIVE` without a period and fills `donation.sender_account_id` for donations already paired by account. Receipts do not change: a receipt lists donations, not accounts, and a donation added later through a proved account replaces the receipt by the fingerprint rule of "PDF receipts". `features/donations/donor_bank_accounts.feature` covers the list, the one-koruna proof with the earlier payments, disconnect, reconnect, the take-over without history (also while the previous holder's reconnect awaits its payment), the shared account, an excluded account, an account learned before it was excluded, the 404 and 409 answers and 401.

##### Older variable symbol confirmation

Long-standing donors often send a standing order with an older variable symbol of their own that no registered donor has, so its payments stay unpaired (pairing rule 2). Once a donor verifies an account with the one-koruna payment, the account's row may ask whether such a symbol is theirs, and "yes" pairs its payments from that account like payments without a symbol (Jakub's decision of 22 October 2026, variant a′; the background is in `parovani-stary-vs.md`). The question is derived on every read and never stored; only the answer is (`donor_symbol_claim`). Accounts verified before the feature get the question too, and a deeper import, a new registration or a second donor withdraws a question that no longer holds.

A row asks about a symbol when all of these hold (`domain/pairing/SymbolClaimOfferPolicy`, fed by `application/bankaccount/SymbolClaimOffers`):

1. **Trigger.** The donor has a verification payment from the account: a `RECEIVED` donation with purpose `ACCOUNT_VERIFICATION` (exactly 1 Kč with „OVERENI UCTU“ in the message) paired by the donor's own symbol. It does not matter whether that payment proved the link or the link was learned earlier from an ordinary gift. An ordinary gift with the symbol, a one-koruna payment without the message, and one without the symbol ask nothing.
2. **The row.** It is the donor's `ACTIVE` link today; an `AWAITING_PAYMENT` or `DISCONNECTED` row asks nothing.
3. **The account.** It is not excluded (rule 7). No other donor's link covers today and no other donor holds an `ACTIVE` link to it, so a `shared` row asks nothing, nor does a row whose account another donor has already taken over from tomorrow.
4. **Exactly one candidate.** T is the booking day of the donor's earliest verification payment from the account. The candidates are the matching variable symbols of the payments from the account, paired or not, booked on or before T on days one of the donor's links to the account covers, minus the donor's own symbol (which also removes the verification payments). Exactly one symbol must remain, and no registered donor may hold it. Two or more symbols (a family or collection account), or a registered donor's symbol among them, ask nothing. A symbol first sent after T is never asked about and does not count against the earlier one. So a donor whose verification payment took the account over on the day the previous holder turned pairing off has no covered day up to T (the new link starts the day after) and is not asked.
5. **Type check.** Every verification payment from the account is checked against the donor's type (`domain/bank/CounterpartyNames`). A person is not asked when the bank names the counterparty like a legal entity, by a Czech legal form or a word of one: `s.r.o.`, `spol.`, `a.s.`, `z.s.`, `o.p.s.`, `v.o.s.`, `k.s.`, `z.ú.`, `s.p.`, `p.o.`, `SE`, `SVJ`, `společenství` (as in `společenství vlastníků jednotek`), `společnost` (as in `akciová společnost` or `společnost s ručením omezeným`), `ústav` (as in `zapsaný ústav`), `družstvo`, `nadace`, `nadační fond`, `spolek`, `obec` or `město`, tolerant of spaces, dots, case and diacritics. A form counts only as a whole word (`družstvo` in any case ending), so `Pospíšil`, `Obecný` or `Městský` is a person. A company is not asked when the name is present but does not look like one. A payment without a name is not checked. The check can misread a name either way. A legal entity whose form is missing from the list (a spelled-out `příspěvková organizace` or `státní podnik`, a `farnost`), or whose name the bank cut before its form, reads as a person, so a person may be asked about that account and a company is not. A person's initials or surname read as a form (`Novák A. S.`, `Jan de Vos`) keep a person donor from being asked, and let a company donor be asked about that account. A sole trader registered as a company, whom the bank names as a person, is not asked; they are asked only when that name reads as a form, as above, or the verification payment carries no name.
6. **Not answered.** The donor has not answered that symbol for the account, either way, and no other donor has confirmed it for the account. This is judged after "exactly one", so a declined symbol never leaves room to ask about a second one.
7. **Something to pair.** `paymentCount` counts the unpaired payments from the account with the symbol, before and after T, that a confirmation would pair: rule 8's covering test, exactly one donor's proved link covering the booking day, and that link is the donor's. The months are those of the first and last of them. A count of 0 asks nothing. So the count in the question is what "yes" pairs.

Answers (`application/bankaccount/SymbolClaimService`): confirm and decline each run as one transaction that first takes the pairing lock (see "Fio import and pairing"). The transaction then:

1. finds the caller's link (404);
2. refuses a symbol the donor already answered for the account (409 `symbol-claim-already-answered`);
3. derives the question again and refuses a different symbol or a question that is gone (409 `symbol-offer-not-available`);
4. stores the answer with its time (an answer stored by a concurrent request gives 409 `symbol-claim-already-answered`).

Confirm then pairs the counted payments in the same transaction (`PaymentPairingService.pairConfirmedSymbol`), so an answer commits together with its donations or not at all. Every later payment with the symbol from the account pairs in the hourly import and the bank check (pairing rule 8). A claim never teaches, starts or ends a link. Once the account is excluded, the claim pairs nothing more.

The donor cannot change an answer, and the question does not come back after either one. A mistake is fixed by an administrator on `/sprava/starsi-symboly` (see "Administration" → "Symbol claims"): the page lists the answers; it reverses a mistaken yes by deleting the claim's donations and turning the answer into `DECLINED`, under the pairing lock and the donor's `donor_record` row lock, and refuses while an issued receipt may certify one of them (a single receipt of the donation, or a yearly receipt of its year, superseded or not, issued at or after its `recorded_at`); and it deletes a mistaken no, after which the question comes back if it still holds. The INFO and WARN log lines of an answer and of pairing by a claim carry only ids (donor, link, claim, bank payment) and counts; the symbol and the account appear only in the pairing's existing DEBUG lines, and no line of the claim or the pairing carries a name.

Code: `domain/donor/SymbolClaim`, `SymbolClaimRepository`, `SymbolOfferNotAvailable`, `SymbolClaimAlreadyAnswered`; `domain/pairing/SymbolClaimOffer` and `SymbolClaimOfferPolicy`; `domain/bank/CounterpartyNames`; `application/bankaccount/SymbolClaimOffers`, `SymbolClaimService` and `SymbolClaimConfirmation`; `interfaces/rest/SymbolClaimRequest` and `SymbolClaimConfirmationResponse` on `DonorBankAccountsController`. `features/donations/symbol_claims.feature` asks and answers through these endpoints. It covers:
- the trigger after a one-koruna proof and after a gift;
- the cases that ask nothing: no genuine verification, two symbols, a registered donor's symbol, another donor's confirmation, a symbol after T, the type check, an excluded account, a shared account, an awaiting reconnect, and a take-over on the verification day;
- declining;
- the ambiguous days, a later registration, and the disconnect gap;
- leading zeros;
- a deeper import that withdraws a question or pairs older payments;
- the changed yearly receipt;
- 400, 401, 404 and both 409 answers.

It seeds a claim through `SymbolClaimRepository` only where no question can be asked: a claim from before the account was excluded, and one at an account the donor never verified. `application/admin/AdminSymbolClaimsServiceIntegrationTest` proves the correction against PostgreSQL: the reversal refused by a single receipt and by a yearly receipt issued after the pairing, the reversal allowed by a yearly receipt issued before it (nothing pairs again, the account asks nothing, the earlier receipt is served again), a declined claim refused, the reset with the question back, a confirmed claim that cannot be reset, and the listing.

#### Bank check on demand

The dashboard calls `POST /api/donations/me/bank-check` every time it opens and when the donor presses "Obnovit", so a payment the bank has already booked shows up without waiting for the hourly run. The hourly run stays.

```json
{ "bankDataAsOf": "2026-10-18T08:05:30.123456Z", "checking": true }
```

- `bankDataAsOf` is `bank_import_state.last_succeeded_at` (null before the first successful import); `checking` is true while an import is queued, running or waiting for a follow-up after a 409.
- `BankCheckService.requestCheck` asks for an import only when `bank_import_state.last_attempted_at` is older than `import.on-demand-cooldown`. The limit is global, not per donor (anyone can register several accounts), so the bank never sees more than one request per 30 seconds however many donors open the overview. Requests arriving while one is queued join it.
- `FioImportScheduler` implements the `application/importing/BankImportRequests` port: the request is queued on the same single-thread `TaskScheduler` as the hourly run, so the two never overlap, and runs `ImportBankPaymentsService.importOnDemand`, which checks the cooldown again against the stored state and then imports like an hourly run (`ON_DEMAND` trigger, never the locked history). A 409 becomes a follow-up as for any run. Without `FIO_TOKEN` the port is `DisabledBankImportRequests`: nothing is asked and `checking` is always false.
- The dashboard shows "Údaje z banky k {čas}" (Prague time) or "Kontrolujeme nové platby v bance…", polls `GET` every 2 seconds for at most 90 seconds while `checking` is true, and loads the summary and the list again when `bankDataAsOf` changed (always after "Obnovit"). A note under the payments says that an instant payment usually shows within a minute, an ordinary transfer from another bank can take until the next business day, and that pairing needs the donor's variable symbol.

`spring.task.scheduling.pool.size` is 1; on shutdown the scheduler drops tasks still waiting for their time (the next hourly tick, a pending follow-up) and waits up to 30 s only for a running import. Logging: the token is never logged (`FioImportProperties.toString()` masks it and the Fio library masks it in every message); counterparty names, account numbers and symbols appear only at DEBUG. At INFO every run logs what the bank answered (`FioBankStatementSource`) and one completion line `Fio import {trigger} {period} completed: ... covered {coverage}` with the counts (`ImportBankPaymentsService`); the pairing after a registration logs one INFO line with its counts.

#### Monthly report

Not an endpoint: nothing is exposed over HTTP. Every day at 07:00 Prague time the backend checks whether the report for the previous calendar month has gone out and, if not, e-mails it to the foundation. It normally leaves on the 1st; when the backend was down that morning it leaves at the next morning check of the month. Besides telling the foundation how the site is doing, it keeps the Brevo SMTP key alive: Brevo cancels a key that has sent nothing for 90 days.

- Content (Czech, `donations.monthlyReport.email.*` in the bundles, multipart text and HTML from `templates/email/donations/monthly-report.html`, subject "Měsíční přehled Nová naděje – září 2026"): donors registered by the end of the month (`donor_record.registered_at` before the first Prague midnight of the next month) and the new ones in the month; `RECEIVED` donations of the month and of the year to date (count and CZK sum by `donation.received_on`, refunds left out); incoming payments booked in the month that no donation references (`bank_payment.booked_on`, unpaired at the time of sending); the last successful bank import and, when the last attempt failed, its time and a Czech line for its `ImportFailureKind`. Amounts read "1 234,50 Kč", times are Prague time.
- Once per month: `application/report/MonthlyReportService.sendDueReport` picks the month before today (`FoundationCalendar`), and in one transaction inserts the month into `donation_monthly_report` (`report_month`, the first day of the month, primary key; `sent_at`) with `on conflict do nothing`, compiles the report and sends it. A month already recorded sends nothing; a second instance waits on the row and then finds it recorded. A send failure (`MonthlyReportNotDelivered`) rolls the row back, so the next morning tries again. `sendReportFor(ReportMonth)` refuses a month that has not ended.
- Logging: `infrastructure/report/MonthlyReportScheduler` logs `Monthly report for 2026-09 sent` at INFO, and on a refused send `Monthly report for 2026-09 could not be sent: <exception class>; retrying at the next check` at ERROR, never the recipient or the content; it never lets an exception reach the scheduler thread.
- Configuration: `app.donations.report.cron` (default `0 0 7 * * *`, evaluated in `Europe/Prague`; `-` or empty turns the check off, and every `@SpringBootTest` pins `-`), `app.donations.report.recipient` from `REPORT_RECIPIENT`, defaulting to `CONTACT_RECIPIENT` and then `info@nfnn.cz` (validated at startup). The sender is `app.mail.sender-email` named "Nová naděje – nadační fond".

Code: `domain/report` (`ReportMonth` with the Prague month boundaries, `MonthlyReport.compile`, `DonorCounts`, `Tally`, `BankImportStatus`, `ImportFailure`, the `MonthlyReportLog` port), the queries `DonorRecordRepository.countRegisteredBefore`, `DonationRepository.findReceivedOnBetween` and `BankPaymentRepository.findUnpairedBookedBetween`; `application/report` (`MonthlyReportService`, the `MonthlyReportSender` port, `MonthlyReportOutcome`, `MonthlyReportNotDelivered`); `infrastructure/report` (`MonthlyReportScheduler`, `MonthlyReportScheduleCondition`, `MonthlyReportProperties`, `MonthlyReportEmailSender`, `MonthlyReportFormats`) and `infrastructure/persistence/JpaMonthlyReportLog`; Liquibase `donations/007_create_donation_monthly_report.xml`. `features/donations/monthly_report.feature` covers the figures and the month boundaries, an empty month with a failed import, once per month with a missed 1st, the retry after a refused send and the refusal of a month that has not ended; the scenarios call `MonthlyReportService` directly and `support/RecordingMailSender.failNextSend()` refuses one e-mail.

#### Import outage alerts

Not an endpoint. The foundation is e-mailed once when the Fio import stops working and once when it works again, so an outage is noticed before the monthly report. Everything happens inside the import transaction that records the attempt; the e-mail itself leaves after the commit on the async executor, so a refused send never fails the import.

- When: `BankImportState.failed` counts `TRANSPORT`, `INVALID_RESPONSE`, `UNEXPECTED` and `UNAUTHORIZED` failures in a row (`consecutive_failures`); `RATE_LIMITED` and `HISTORY_LOCKED` neither count nor reset the streak (they are expected and retried by themselves). The third counted failure in a row opens an outage, a rejected token (`UNAUTHORIZED`) opens one at once, and an open outage of another kind is reported once more when the token gets rejected (the fix differs). The kind reported is kept in `reported_outage`, so a restart neither repeats nor forgets the alert; while it is open, further failures send nothing. A successful import closes it (`BankImportState.succeeded`), resets the count and sends the recovery.
- Events (`donations/application/event`): `BankImportOutageDetected(ImportOutage(kind, consecutiveFailures, lastSucceededAt, detectedAt))` and `BankImportRecovered(ImportRecovery(outageKind, failures, lastSucceededBefore, recoveredAt))`, published by `application/importing/BankStatementRecorder` before it saves the state; the recorder logs the outage at ERROR (`Fio import outage: TRANSPORT failed 3 times in a row, the foundation is being told`) and the recovery at INFO.
- E-mails (`infrastructure/report/ImportAlertEmailSender`, `@Async` `@TransactionalEventListener(AFTER_COMMIT)`, Czech, `donations.importAlert.email.*`, to `app.donations.report.recipient` = `REPORT_RECIPIENT` from `app.mail.sender-email`): the outage e-mail (subject "Stahování plateb z banky selhává – Nová naděje", `templates/email/donations/import-outage.html`) says how many attempts failed in a row and when the last one was, or that Fio rejected the token, then the reason and what to do for the kind (`outage.reason.<KIND>`, `outage.action.<KIND>`: renew the token per `deploy/README.md`, check the connection, read the backend log), the last successful download (or "zatím žádné"), that donors see no new gifts meanwhile, and that the next message comes with the recovery; the recovery e-mail (subject "Stahování plateb z banky zase funguje – Nová naděje", `import-recovered.html`) says when the import worked again, how many attempts had failed (Czech plural by `ChoiceFormat`) and the last success before the outage. The sender logs `Fio import alert e-mail sent: outage TRANSPORT` at INFO and a refused send at ERROR with the alert and the exception class (`The Fio import alert e-mail (outage UNAUTHORIZED) could not be sent: MailSendException`); a refused outage e-mail is not retried (the outage stays recorded, the recovery still goes out), a mail server that is down shows in the log.
- Liquibase `donations/012_track_import_outages.xml` adds `consecutive_failures` and `reported_outage` to `bank_import_state`. `features/donations/import_outage_alerts.feature` covers the third failure (and the silent fourth), the rejected token, the recovery (and the silent next success), the rate limit and locked history not counting, two failures and a success sending nothing, and the refused outage e-mail; `BankImportStateTest` has the rules, `ImportAlertEmailSenderTest` the texts (previews `backend/build/email-preview/import-outage*.html`, `import-recovered.html`).

### Administration (`/api/admin/**`)

Administrators are donors with the `ADMIN` role (see "Authentication"); there is no admin context, each context serves its own administration under `/api/admin/<context>/...` from its `interfaces/rest`. The Angular area is `/sprava` (`docs/frontend-overview.md`). Done so far: the skeleton (role gate, audit trail, the first read-only endpoint), the second factor (an administrator holds `ADMIN` only in a session opened with the code, see "Second factor") the bank payments (manual pairing and unpairing, see "Bank payments") the administrators (granting and taking away the role, turning a donor's two-factor authentication off, see "Administrators"), the older-symbol answers (reversing a mistaken yes, deleting a mistaken no, see "Symbol claims"), the audit trail itself (see "Audit trail") and the donors (search, the donor card, turning a donor's two-factor authentication off, managing a donor's bank accounts, see "Donors" and "Donor accounts"); the GDPR erasure of a donor, content and the report settings follow one PR at a time (`docs/requirements.md` §7).

#### `GET /api/admin/donations/import-state`

`donations/interfaces/rest/AdminImportStateController` → `application/importing/ImportStatusService.currentState()` (read-only) → the `BankImportState` row. 200:

```json
{
  "coveredFrom": "2026-07-20",
  "coveredTo": "2026-10-17",
  "lastAttemptedAt": "2026-10-18T09:00:00Z",
  "lastSucceededAt": "2026-10-17T10:00:00Z",
  "lastFailure": { "kind": "UNAUTHORIZED", "message": "HTTP 401", "attemptedAt": "2026-10-18T09:00:00Z" },
  "consecutiveFailures": 1,
  "reportedOutage": "UNAUTHORIZED"
}
```

Every field but `consecutiveFailures` is null until it has a value (a fresh database answers all nulls and 0); `lastFailure` is the last attempt's failure (null after a success), `kind` and `reportedOutage` are `ImportFailureKind` values (see "Import outage alerts"), `message` is the failure text kept for the log, at most the stored length. 401 without a token, 403 `auth/forbidden` for a donor without the role or for an administrator whose session was opened without the second factor; the role gained while signed in shows at the next sign-in with the code.

#### Bank payments

`donations/interfaces/rest/AdminPaymentsController`. `GET /api/admin/donations/payments?pairing=unpaired` (the default) → `application/admin/AdminPaymentsService.listUnpaired()` (read-only): every `bank_payment` without a `donation`, newest booking day first, then the higher bank transaction id. `pairing=paired&year=2026` → `listPaired(year)`: the donations received in that Prague calendar year with their payment; without `year` the newest year that has a donation; `availableYears` lists every year with a donation, newest first. `pairing` other than `unpaired|paired` or a `year` outside 1000–9999 answers 400. 200:

```json
{
  "year": 2026,
  "availableYears": [2026, 2025],
  "items": [
    {
      "id": "019a…", "bankTransactionId": 26683551, "bookedOn": "2026-10-10", "amountMinor": 50000, "currency": "CZK",
      "variableSymbol": "1111111111", "counterpartyAccount": "2900233333/2010", "counterpartyName": "Nováková Jana",
      "messageForRecipient": "Dar pro fond", "importedAt": "2026-10-17T10:00:00Z", "unpairedByAdminAt": null,
      "donation": { "id": "019a…", "donorId": "019a…", "donorName": "Jana Nováková", "pairedBy": "MANUAL", "status": "RECEIVED", "recordedAt": "2026-10-18T09:00:00Z", "receiptIssued": false }
    }
  ]
}
```

`year` and `availableYears` are null and empty for the unpaired list. `counterpartyAccount` is the canonical sender account (`number/bank code`) or, when the bank sent something that is not a Czech account, the raw account and bank code; `variableSymbol` is the symbol as the bank sent it (`"0"` and blanks become null at import). `donation` is null for an unpaired payment; `donorName` is null when the donor record is gone; `receiptIssued` is true when any receipt (single or yearly, active or superseded) references the donation. `unpairedByAdminAt` is set once an administrator unpaired the payment: from then on automatic pairing skips it (`BankPaymentJpaRepository` filters `unpaired_by_admin_at is null` in every query the pairing uses, the monthly report still counts it among the unpaired), so a payment with a donor's symbol does not come back at the next import; only a new manual pairing gives it a donation.

`GET /api/admin/donations/donors?query=nov` → `AdminPaymentsService.searchDonors(query)`: up to 20 `donor_record` rows whose name contains the query (case-insensitive) or whose variable symbol starts with it, ordered by name; `%`, `_` and `!` in the query are literal; a blank query answers an empty list; `query` is at most 160 characters (400 above). 200 `{"items": [{"donorId", "name", "type": "PERSON|COMPANY", "variableSymbol", "companyIdentifier"}]}`.

`POST /api/admin/donations/payments/{id}/pair` with `{"donorId": "…"}` (`@NotNull`, 400 `validation-failed` without it) → `application/pairing/ManualPairingService.pair(adminId, paymentId, donorId)`: takes the pairing lock (`PairingLock`, the same advisory lock as the import), loads the payment (404 `donations/bank-payment-not-found`), refuses one that already has a donation (409 `donations/bank-payment-already-paired`), loads the donor record (404 `donations/donor-not-found`), locks the donor's `donor_record` row like a receipt download does, stores `Donation.fromBankPayment(…, PairingMethod.MANUAL, now)` (the purpose is derived from the payment as for any other pairing, so a 1 Kč "OVERENI UCTU" payment stays an account verification; no sender account is learned and no symbol claim is touched) and publishes `AdminActionPerformed(adminId, "PAIR_PAYMENT", paymentId, details, now)`. 200 `{"donationId": "…", "changedYearlyReceipts": [2026]}`: the years (at most the payment's year) from the first receipt year on for which the donor already holds an active yearly receipt, so the administrator can tell the donor that the next download replaces it (the receipt itself is replaced lazily, as after a late import).

`POST /api/admin/donations/payments/{id}/unpair` (no body) → `ManualPairingService.unpair(adminId, paymentId)`: lock, payment (404 `donations/bank-payment-not-found`), its donation (409 `donations/bank-payment-not-paired` when there is none), the donor row lock, then 409 `donations/donation-has-receipt` when a receipt references the donation (the `donation_receipt.donation_id` foreign key would refuse the delete anyway; a yearly receipt does not block, it is reported instead); otherwise the donation is deleted, the payment is saved with `unpaired_by_admin_at = now` and `AdminActionPerformed(adminId, "UNPAIR_PAYMENT", paymentId, details, now)` is published. 200 `{"changedYearlyReceipts": [2026]}` as above. The `details` of both actions name the bank transaction id, amount, booking day, donor id, donation id and the pairing method, never a name or an account.

Every endpoint: 401 without a token, 403 `auth/forbidden` for a donor without the role or a session without the second factor. Liquibase `donations/013_pair_payments_by_hand.xml` adds `bank_payment.unpaired_by_admin_at` and lets `ck_donation_paired_by` admit `MANUAL`. Tests: `features/donations/admin_payments.feature` (eleven scenarios: the list and its fields, pairing with the audit record and the donor's overview, the already paired payment, the unknown payment and donor, the missing donor id, unpairing with the hourly import not pairing again and a new manual pairing, the unpaired payment, the donation with a single receipt, the yearly receipt in both directions, the donor search, 403 and 401), `application/pairing/ManualPairingServiceTest`, `application/admin/AdminPaymentsServiceTest`, the repository tests for every new query.

#### Symbol claims

`donations/interfaces/rest/AdminSymbolClaimsController` → `application/admin/AdminSymbolClaimsService`. `GET /api/admin/donations/symbol-claims` (read-only) lists every row of `donor_symbol_claim` newest first (`SymbolClaimRepository.findAllNewestFirst`, by `answered_at` then id) with the donor's name from `donor_record` (`donorName` null when the record is gone) and the number of donations paired through the claim (`DonationRepository.countBySymbolClaims`, one grouped query):

```json
{ "items": [{ "id": "019a…", "donorId": "019a…", "donorName": "Jana Nováková", "account": "1234567/0800", "variableSymbol": "6123456789",
              "answer": "CONFIRMED", "answeredAt": "2026-10-20T09:00:00Z", "donationCount": 3 }] }
```

`POST /api/admin/donations/symbol-claims/{id}/reverse` (no body) → `reverse(adminId, claimId)`: for a mistaken "yes". Takes the pairing lock (the same advisory lock as the import and the donor's answer), loads the claim (404 `donations/symbol-claim-not-found`), `SymbolClaim.reverse(now)` gives the `DECLINED` copy (409 `donations/symbol-claim-not-confirmed` for a "no"), locks the donor's `donor_record` row so no receipt of theirs is issued meanwhile, loads the donations paired through the claim and refuses with 409 `donations/symbol-claim-has-receipt` while an issued receipt may certify one of them: a single receipt of the donation (`DonationReceiptRepository.findDonationsWithReceipt`), or a yearly receipt of the donation's year issued at or after its `recorded_at`, superseded or not (`existsYearlyIssuedSince`); a yearly receipt issued before the pairing never covered them and stays. Then it deletes the donations, saves the reversed claim and publishes `AdminActionPerformed("REVERSE_SYMBOL_CLAIM", claimId, "Confirmed symbol claim … of donor … for symbol … reversed to DECLINED; N donation(s) paired through it deleted")`. 204. The payments with that symbol are unpaired again, the hourly import leaves them so (a `DECLINED` claim pairs nothing) and the account does not ask again.

`DELETE /api/admin/donations/symbol-claims/{id}` → `reset(adminId, claimId)`: for a mistaken "no", or so that the donor can answer again after a reversed "yes". Lock, claim (404), 409 `donations/symbol-claim-still-confirmed` for a "yes" (reverse it first), `SymbolClaimRepository.delete`, `AdminActionPerformed("RESET_SYMBOL_CLAIM", claimId, …)`. 204. The account carries the `symbolOffer` again at the next read if the question still holds.

Every endpoint: 401 without a token, 403 `auth/forbidden` for a donor without the role or a session without the second factor. Tests: `features/donations/admin_symbol_claims.feature` (the list, the reversal with its audit record and the payments staying unpaired through an import, the refusal by a receipt, a no that cannot be reversed but can be deleted so the account asks again, a yes that cannot be deleted, an unknown id, 403, 401), `AdminSymbolClaimsServiceTest` (mocks), `AdminSymbolClaimsServiceIntegrationTest` (see "Older variable symbol confirmation"), `SymbolClaimTest`, `JpaSymbolClaimRepositoryTest`, `JpaDonationRepositoryTest`, `JpaDonationReceiptRepositoryTest`.

#### Donor accounts (`/api/admin/donations/donors/{donorId}/...`)

`donations/interfaces/rest/AdminDonorAccountsController` → `application/admin/AdminDonorAccountsService`. `GET /api/admin/donations/donors/{donorId}` (read-only) answers the donation side of the donor card: the `donor_record` (404 `donations/donor-not-found` when the donor never registered an account, so the card says so), `bankAccounts` as `GET /api/donations/me/bank-accounts` lists them for the donor (`DonorBankAccountsService.listBankAccounts`, the same items with `donationCount`, `totalAmountMinor`, `lastDonationOn`, `shared`, `pairingExcluded`), `donations` as `GET /api/donations/me` lists them (`DonorDonationsService.listDonations`, every donation, `purposeText` localized by `Accept-Language`) and `receipts`, every row of `donation_receipt` of the donor newest first (`DonationReceiptRepository.findByDonorNewestFirst`), superseded ones included:

```json
{ "donor": { "donorId": "01a1…", "name": "Petr Svoboda", "type": "PERSON", "variableSymbol": "7310945528", "companyIdentifier": null,
             "address": { "street": "…", "city": "…", "postalCode": "…" }, "preferredLocale": "cs", "registeredAt": "2026-10-17T10:00:00Z" },
  "bankAccounts": [ BankAccountItem ],
  "donations": { "items": [ Donation ], "totalAmountMinor": 80000, "currency": "CZK", "count": 2 },
  "receipts": [{ "id": "019a…", "number": "2026-000001", "kind": "SINGLE", "donationId": "0192…", "donationReceivedOn": "2026-10-10",
                 "year": null, "issuedOn": "2026-10-17", "issuedAt": "2026-10-17T09:00:00Z", "locale": "cs", "active": true }] }
```

`POST …/bank-accounts/{linkId}/disconnect` and `POST …/bank-accounts/{linkId}/reconnect` (no body) → `disconnect(adminId, donorId, linkId)` and `reconnect(…)`: the administrator's copies of the donor's own "Vypnout párování" and "Zapnout párování" (see "Donor's bank accounts"), same aggregate methods (`DonorRecord.disconnectSenderAccount`, `reconnectSenderAccount`), same rules (a disconnected link keeps its donations and only stops pairing from today; a reconnected one waits for a payment with the donor's symbol, `AWAITING_PAYMENT`), same problems (404 `donations/bank-account-not-found`, 409 `donations/bank-account-already-disconnected`, 409 `donations/bank-account-already-connected`), plus `AdminActionPerformed("DISCONNECT_SENDER_ACCOUNT" | "RECONNECT_SENDER_ACCOUNT", donorId, "Pairing from bank account … (link …) of donor … turned off|on")`. 204.

`DELETE …/bank-accounts/{linkId}` → `remove(adminId, donorId, linkId)`: for an account the donor's record learned by mistake (a shared account, a wrong 1 Kč payment, a bulk payer). It takes the pairing lock, loads the record and the link (404s), locks the donor row (`receipts.lockDonor`, so no receipt is issued meanwhile), loads the donations paired through the link (`DonationRepository.findBySenderAccountLink`) and refuses with 409 `donations/bank-account-has-receipt` while an issued receipt may certify one of them (the same rule as the symbol-claim reversal: `application/admin/ReceiptCoverage`, a single receipt of the donation or a yearly receipt of its year issued at or after its `recorded_at`). Then it deletes those donations, deletes the donor's `donor_symbol_claim` rows at that account (the answers belong to the account, so a later verification asks again), removes the link from the aggregate (`DonorRecord.removeSenderAccountLink`) and the row (`DonorRecordRepository.deleteSenderAccountLink`), and publishes `AdminActionPerformed("REMOVE_SENDER_ACCOUNT_LINK", donorId, "Bank account … (link …, STATUS) removed from donor …; N donation(s) paired through it and M answer(s) about older symbols deleted")`. 204. The payments are unpaired again and the hourly import leaves them so (the record no longer knows the account); the donor's other links, donations and receipts stay. The whole link is removed whatever its status, a disconnected one too.

Every endpoint: 401 without a token, 403 `auth/forbidden` for a donor without the role or a session without the second factor; another donor's link answers 404. Tests: `features/donations/admin_donor_accounts.feature` (the card with record, accounts, donations and receipts, the empty card, disconnect and reconnect with their audit records and a second disconnect refused, the removal with the donations and the symbol answer gone, the payments unpaired through an import and the audit record, the removal refused by a receipt without an audit record, a disconnected account removed, unknown donor and account, 403, 401), `AdminDonorAccountsServiceTest`, `DonorRecordTest`, `JpaDonorRecordRepositoryTest`, `JpaDonationRepositoryTest`, `JpaDonationReceiptRepositoryTest`.

#### Administrators (`/api/admin/donors/...`)

Jakub, 2026-10-22: nothing in the administration is done by SQL on the server, every administrative action has to be possible in the GUI. The `donors` context therefore serves the administrators under `/api/admin/donors` from `interfaces/rest/AdminDonorsController` → `application/AdministratorService`.

`GET /api/admin/donors/administrators` (read-only) lists the donors who hold `ADMIN` (`DonorRepository.findAdministrators`, ordered by name and e-mail) with `secondFactorEnabled` from `SecondFactorRepository`, so the administrator sees who cannot open the administration yet:

```json
{ "items": [{ "donorId": "01a18e56-…", "name": "Jana Nováková", "email": "jana@example.cz", "secondFactorEnabled": true }] }
```

`POST /api/admin/donors/administrators` with `{"email": "petr@example.cz"}` (`@NotBlank @Email @Size(max = 254)`, 400 `validation`) → `AdministratorService.grant(adminId, email)`: the donor registered with the address (404 `donors/email-not-registered`, so the administrator learns the donor has to register first), `Donor.grantAdministration()` (409 `donors/already-administrator`), saved, `AdminActionPerformed(adminId, "GRANT_ADMINISTRATION", donorId, …)`. 201 with the item. The new administrator still needs the second factor and a new sign-in (see "Authentication"); the item says `secondFactorEnabled: false` until then. A donor whose e-mail is not verified yet can be granted the role; they cannot sign in before the verification anyway.

`DELETE /api/admin/donors/administrators/{donorId}` → `AdministratorService.revoke(adminId, donorId)`: refused for the administrator's own id (400 `donors/own-administration`, before any lookup, so the site always keeps at least one administrator), 404 `donors/donor-not-found`, `Donor.revokeAdministration()` (409 `donors/not-administrator`), saved, every refresh token of the donor revoked (`RefreshTokenRepository.revokeAllOf`, so the role is gone within the access token's 15 minutes), `AdminActionPerformed("REVOKE_ADMINISTRATION")`. 204.

`POST /api/admin/donors/{donorId}/second-factor/reset` (no body) → `AdministratorService.resetSecondFactor(adminId, donorId)`: for a donor who lost the authenticator; 404 `donors/donor-not-found`, 400 `donors/second-factor-not-enabled` without a confirmed factor; deletes the `donor_second_factor` row, revokes every refresh token, publishes `AdminActionPerformed("RESET_SECOND_FACTOR")` and `donors/application/event/DonorSecondFactorReset(donorId, email, locale)`, which `infrastructure/mail/DonorSecondFactorResetEmailSender` turns `AFTER_COMMIT` into the e-mail "Dvoufaktorové ověření vašeho účtu bylo vypnuto – Nová naděje" (template `email/donors/second-factor-reset`, texts `donors.secondFactorReset.email.*`, cs and en): what happened, that the donor signs in with the password only and can turn the factor on again, and where to write if they did not ask for it. 204. An administrator whose factor was reset is a plain donor until they enrol again. The page `/sprava/spravci` offers the reset for other administrators and the donor card `/sprava/darci/{id}` for any donor. There are no recovery codes (decision of task 5b, unchanged).

First administrator: `app.donors.administrators.emails` (`ADMIN_EMAILS`, comma-separated, each validated as an e-mail at startup, `application/AdministratorProperties`) is read by `application/AdministratorBootstrap` on `ApplicationReadyEvent`: every address that belongs to a registered donor without the role gets it (`AdministratorService.grantAtStartup`, logged, no audit row because no administrator acted); an address nobody registered with is logged at WARN and tried again at the next start; an administrator the GUI took the role from gets it back at the next start as long as the address stays in the env, so the env is for the bootstrap and the GUI for everything else (`deploy/README.md`, "Správci").

Every endpoint: 401 without a token, 403 `auth/forbidden` for a donor without the role or a session without the second factor. Tests: `features/donors/admin_administrators.feature` (list, grant and the sign-in with the second factor afterwards, unknown e-mail, duplicate, blank e-mail, revoke and the role gone at the next sign-in, self, non-administrator, unknown donor, the second factor reset with its e-mail and the administration closed afterwards, reset without a factor, 403, 401, the startup bootstrap running twice), `AdministratorServiceTest`, `AdministratorBootstrapTest`, `AdministratorPropertiesTest`, `DonorTest`, `JpaDonorRepositoryTest`, `DonorSecondFactorResetEmailSenderTest`.

#### Donors (`/api/admin/donors`, `/api/admin/donors/{donorId}`)

The donor card of the administration (`/sprava/darci`, plan v2 task 7a) is served by both contexts, each for its own data, and the Angular page puts the two halves together: the `donors` context knows the account (`AdminDonorsController` → `application/DonorAdministrationService`, read-only), the `donations` context the record, accounts, donations and receipts (see "Donor accounts").

`GET /api/admin/donors?query=nov` → `DonorAdministrationService.search(query)`: the query is trimmed, a blank one answers an empty list without a lookup, otherwise `DonorRepository.search(query, 20)` (`JpaDonorRepository`: `%`, `_` and `!` in the query are escaped, so they match literally; case-insensitive `like` over `name` and `email`, prefix match over `variable_symbol`, ordered by name and e-mail, at most 20 rows). Each item is the donor's account with `secondFactorEnabled` from `SecondFactorRepository` (a confirmed factor only):

```json
{ "items": [{ "donorId": "01a18e56-…", "type": "PERSON", "name": "Jana Nováková", "companyIdentifier": null,
              "address": { "street": "Dlouhá 12", "city": "Ústí nad Labem", "postalCode": "400 01" },
              "email": "jana@example.cz", "variableSymbol": "1234567890", "preferredLocale": "cs",
              "registeredAt": "2026-10-17T10:00:00Z", "emailVerified": true, "administrator": true, "secondFactorEnabled": true }] }
```

`GET /api/admin/donors/{donorId}` → `DonorAdministrationService.view(donorId)`: the same item for one donor, 404 `donors/donor-not-found`. The card offers `POST /api/admin/donors/{donorId}/second-factor/reset` (see "Administrators") for any donor with the factor on. Nothing here changes the account: the donor's name, address, e-mail and password stay the donor's own to change (`/api/donors/me`), and the GDPR erasure is task 7b.

Every endpoint: 401 without a token, 403 `auth/forbidden` for a donor without the role or a session without the second factor. Tests: `features/donors/admin_donors.feature` (search by a part of the name, the e-mail in another case and the start of the symbol, a query matching a person and a company, `%` and a blank query matching nothing, the card's fields, the two-factor reset from the card with its audit record and e-mail, unknown donor, 403, 401), `DonorAdministrationServiceTest`, `JpaDonorRepositoryTest`.

#### Audit trail

Every change an administrator makes is recorded in `admin_action` (Liquibase `shared/001_create_admin_action.xml`, included by the master changelog's new `db/changelog/shared/` folder): `id` (UUIDv7), `admin_id` (the donor id from the JWT), `action` (an upper-case code up to 64 characters, e.g. `PAIR_PAYMENT`), `subject_id` (the affected row's id, nullable), `details` (up to 2000 characters of plain text, never personal data beyond what the action needs), `performed_at`; indexed by `performed_at`, `admin_id` and `subject_id`. A use case publishes `shared/application/event/AdminActionPerformed(adminId, action, Optional<UUID> subjectId, details, performedAt)` from its transaction; `shared/infrastructure/audit/AdminActionLog` stores it `BEFORE_COMMIT`, so the change and its record commit together or neither does, and logs `Admin {id} performed {ACTION} on {subject}` at INFO. The manual pairing publishes `PAIR_PAYMENT` and `UNPAIR_PAYMENT` (see "Bank payments"), the administrators `GRANT_ADMINISTRATION`, `REVOKE_ADMINISTRATION` and `RESET_SECOND_FACTOR` (see "Administrators"), the symbol claims `REVERSE_SYMBOL_CLAIM` and `RESET_SYMBOL_CLAIM` (see "Symbol claims"); `AdminActionLogTest` proves the commit and the rollback against PostgreSQL, `AdminActionPerformedTest` the record's rules.

Reading the trail: `GET /api/admin/donors/actions?before=2026-10-22T10:00:00Z&limit=50` (`AdminDonorsController` → `donors/application/AdministratorActivityService`, read-only). `shared` owns the table and the read port `shared/application/audit/AdminActionTrail.findPerformedBefore(before, limit)` (`AdminActionEntry` records; `shared/infrastructure/audit/JpaAdminActionTrail`, ordered by `performed_at` desc then id desc), and the `donors` context names the administrators through `DonorRepository.findByIds`, so no context reads another's table. `before` defaults to now, `limit` to 50 and is 1–200 (400 `validation` outside); the service fetches one entry more than the page to answer `hasMore`:

```json
{ "items": [{ "id": "019a…", "adminId": "01a1…", "adminName": "Jana Nováková", "adminEmail": "jana@example.cz", "action": "GRANT_ADMINISTRATION",
              "subjectId": "019a…", "details": "Donor 019a… granted the ADMIN role", "performedAt": "2026-10-22T10:00:00Z" }],
  "hasMore": true }
```

`adminName` and `adminEmail` are null when the administrator's donor account is gone (a former administrator who still holds an account is named). The next page asks with `before` set to the oldest `performedAt` listed. The page `/sprava/historie` shows it (`docs/frontend-overview.md`). Tests: `features/donors/admin_actions.feature` (the trail newest first with names and subjects, paging with `limit` and `before`, a former administrator still named, `limit` 0 and 201 refused, 403, 401), `AdministratorActivityServiceTest`, `JpaAdminActionTrailTest`, `JpaDonorRepositoryTest`.

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
- Retention: the privacy policy promises that a message stays in the web database for a year. Every day at 03:30 Prague time `infrastructure/retention/ContactMessageRetentionScheduler` runs `application/ContactMessageRetentionService.deleteExpiredMessages`, which deletes the `contact_message` rows whose `received_at` lies before now (the application `Clock`) minus `retention.max-age`, in one `DELETE` statement (`ContactMessageRepository.deleteReceivedBefore`) served by the index `ix_contact_message_received_at`. A message therefore goes at the first run after it turns 365 days old, at most a day later. The run logs the count and the cutoff at INFO when it deleted something, never a message's content or sender; a failure is one ERROR line with the exception class, and the next day's run tries again. The copy forwarded by e-mail lives in the foundation's mailbox, which the application cannot reach; the daily `pg_dump` backups keep a deleted row until they are themselves deleted after about 30 days (`deploy/compose.yml`).

Configuration (`application.yml`, `app.contact.*`):

| Property | Env var | Default | Meaning |
|---|---|---|---|
| `recipient-email` | `CONTACT_RECIPIENT` | `info@nfnn.cz` | where the messages are forwarded |
| `retention.max-age` | — | `P365D` | how long a message stays in `contact_message`; a duration that is not positive stops the startup naming the property (`ContactMessageRetentionProperties`) |
| `retention.cron` | — | `0 30 3 * * *` | when the deletion runs, Prague time; `-` turns it off, as every `@SpringBootTest` does |

`features/contact/contact_message_retention.feature` covers a message received 366 days ago that goes and one received yesterday that stays, and a message received 364 days ago that stays.

## Cross-context events

Events consumed by another context live in `shared/application/event/` and carry only shared types and JDK types; events consumed inside their own context stay in `<context>/application/event/`. All are immutable Java `record`s published from application services through `ApplicationEventPublisher`; they never carry JPA entities, only IDs and value objects. Three kinds of listener:

- Side-effect listeners (mail) run `@Async @TransactionalEventListener(phase = AFTER_COMMIT)`, off the request thread.
- A projection another context's correctness depends on runs `BEFORE_COMMIT` in the publisher's transaction, so the source row and the projection commit together or neither does.
- Follow-up work on that projection runs synchronously `AFTER_COMMIT` in its own `REQUIRES_NEW` transaction and must only log on failure, never fail the request.

| Event | Publisher | Listener | Effect |
|---|---|---|---|
| `DonorRegistered` | `donors/application` (`DonorEmailVerificationService.confirm`, once the e-mail is confirmed; never for an unconfirmed registration) | `donations/infrastructure/events/DonorRecordSynchronizer`, `BEFORE_COMMIT` | `DonorRecordService.register`: copies the donor into `donor_record` in the confirmation transaction (an upsert, so a replayed event changes nothing). A failure fails the confirmation. The verification e-mail doubles as the welcome e-mail. |
| `DonorRegistered` | as above | `DonorRecordSynchronizer`, `AFTER_COMMIT`, synchronous | `DonorRecordService.pairPaymentsOf` in `REQUIRES_NEW`: pairs the stored payments carrying the donor's symbol and, through the accounts learned from them, the donor's earlier payments without a symbol. Any failure, including a lost race with the hourly import, is a WARN; the confirmation response is unaffected. |
| `DonorProfileChanged` | `donors/application` (`DonorProfileService`) | `DonorRecordSynchronizer`, `BEFORE_COMMIT` | `DonorRecordService.changeProfile`: name, address and locale on the `donor_record` copy; the symbol, the pairings and the learned accounts stay. A missing copy is a WARN, never an error for `PATCH /api/donors/me`. |
| `DonorPasswordResetRequested` | `donors/application` (`DonorPasswordResetService`), in `donors/application/event` | `donors/infrastructure/mail/PasswordResetEmailSender`, `@Async AFTER_COMMIT` | Sends the reset link e-mail to the donor's address in the donor's locale. Carries the donor id, the `LinkSecret` record (masked `toString`), the `EmailAddress`, the `LocaleCode` and the expiry, never the name. A send failure is logged with the donor id and the exception class, nothing else. |
| `DonorEmailVerificationRequested` | `donors/application` (`DonorEmailVerificationService`), in `donors/application/event` | `donors/infrastructure/mail/DonorRegistrationEmailSender`, `@Async AFTER_COMMIT` | Sends the verification (welcome) e-mail with the link; the same shape as the reset event. |
| `DonorRegistrationRepeated` | `donors/application` (`DonorRegistrationService`), in `donors/application/event` | `DonorRegistrationEmailSender`, `@Async AFTER_COMMIT` | Tells a confirmed account's owner that someone registered with their address; carries the donor id, the `EmailAddress` and the `LocaleCode`. |
| `DonorEmailChangeRequested` | `donors/application` (`DonorEmailVerificationService.issueChangeLink`), in `donors/application/event` | `donors/infrastructure/mail/DonorEmailChangeEmailSender`, `@Async AFTER_COMMIT` | Sends the confirmation link to the new address; carries the donor id, the new `EmailAddress`, the `LocaleCode`, the `LinkSecret` and the expiry. |
| `DonorEmailChanged` | `donors/application` (`DonorEmailVerificationService.confirm`, change tokens only) | `DonorEmailChangeEmailSender`, `@Async AFTER_COMMIT` | Tells the previous address that the account's e-mail changed to the new one; carries the donor id, both addresses and the locale. |
| `DonorEmailAddressInUse` | `donors/application` (`DonorCredentialsService.requestEmailChange`) | `DonorEmailChangeEmailSender`, `@Async AFTER_COMMIT` | Tells the owner of an address that another account tried to take it; carries the owner's id, the address and the owner's locale. |
| `DonationRecorded` | not published in v1 | — | Nothing is sent in v1 (`docs/requirements.md` §8) and nothing consumes it; the admin task decides whether it is needed. |
| `AdminActionPerformed` | any context's application service that performs an administrator's change (`ManualPairingService`, `AdministratorService`, `AdminSymbolClaimsService`), in `shared/application/event` | `shared/infrastructure/audit/AdminActionLog`, `BEFORE_COMMIT` | Stores the action in `admin_action` in the use case's transaction and logs it; see "Audit trail". |
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

`src/test/resources/features/contact/contact_message.feature` covers the accepted message, the honeypot, field errors and the rate limit, and `contact_message_retention.feature` the deletion after a year. Domain: `ContactMessage` aggregate, `EmailAddress` (in `shared`), `ContactMessageReceived` event, `ContactMessageRepository.deleteReceivedBefore`. Application: `SubmitContactMessageService`, `ContactMessageRetentionService` with `ContactMessageRetentionProperties` and `ContactMessagePurge`. Liquibase: `db/changelog/contact/001_create_contact_message.xml` (with the `received_at` index the retention uses).

Shared pieces that came with it and that every later context reuses:
- `shared/infrastructure/security/ApiSecurityConfiguration`: stateless chain, CSRF off, `permitAll` only for the public endpoints listed there and the health endpoint, everything else `authenticated()`. Unauthenticated and forbidden requests answer `application/problem+json` (types `auth/unauthenticated`, `auth/forbidden`) through `ApiExceptionHandler`, never a Basic challenge. A new public endpoint has to be added to that chain.
- `shared/interfaces/rest/ApiExceptionHandler`: validation errors become a problem with type `validation` and `errors: [{ field, message }]`; titles come from `i18n/messages_*.properties` by `Accept-Language`. `RateLimitExceededException` answers 429.
- `shared/infrastructure/ratelimit/FixedWindowRateLimiter` (a key's window starts at its first request; the cache has no scheduler, so an expired key, a client address, leaves memory at the cache's next maintenance, which a later request triggers, or at a restart, as the privacy policy says) and a `java.time.Clock` bean (`shared/infrastructure/time`), which tests replace with a `MutableClock`.
- `shared/infrastructure/async`: `@EnableAsync`, so `@TransactionalEventListener(AFTER_COMMIT)` listeners run off the request thread with `@Async`.
- Test support in `src/test/java/.../support/`: `MutableClock`, `RecordingMailSender` (records instead of sending), both wired as `@Primary` by `TestSupportConfiguration`, and `cucumber/ApiClient` for HTTP calls in step definitions; it sends each scenario's requests from a client address of its own (`X-Forwarded-For`), and `When the following requests come from another client address` switches to a new one, so the per-address limits of one scenario never reach the next.

### `donors` (done)

`features/donors/donor_second_factor.feature` covers the second factor (set-up, confirmation, sign-in with the code, wrong, reused and late codes, the challenge's five attempts and five minutes, both limits, the administrator role only with the code, turning it off); see "Second factor". `features/donors/donor_registration.feature` and `donor_login.feature` cover registration as a person and as a company, the IČO rules, duplicate emails, weak passwords, sign-in, expiry of the access token, refresh rotation and reuse, sign-out, the profile update and the per-address sign-in and registration limits (the request over the limit refused with 429, every kind of request counted, the window opening again after its period). Domain: `Donor` aggregate, `Role`, `CompanyIdentifier`, `VariableSymbol`, `RawPassword` / `PasswordHash` (`PasswordHasher` port; `BCryptPasswordHasher` adapter, BCrypt cost 12 over the SHA-256 hex digest, `BCryptPasswordHasherTest`; `donor_login.feature` proves a password over 72 bytes signs in and is checked as a whole), `RefreshToken` / `RefreshTokenSecret`; `DonorType` moved to `shared/domain` with the Fio import. Liquibase: `donors/001_create_donor.xml` (`donor`, `donor_role`), `002_create_donor_refresh_token.xml`. The password reset adds `donor_password_reset.feature`, `003_create_donor_password_reset_token.xml` and the classes listed under "Password reset". The limits of "Sign-in and registration limits" add `interfaces/rest/SignInRateLimiter` and `RegistrationRateLimiter` with `SignInRateLimiterTest` and `RegistrationRateLimiterTest`, and `DonorAuthControllerTest`, which proves that a limited request reaches neither the authentication nor the registration service; `DonorAuthenticationServiceTest` proves that `UNKNOWN_DONOR_HASH` matches the BCrypt format at cost 12, so an unknown e-mail runs a real comparison, and that neither the password sent nor a random one matches it.

Shared pieces that came with it: the sealed `shared/domain/error/DomainException` family (`RuleViolation` 400, `Conflict` 409, `NotFound` 404, `AuthenticationFailure` 401, `AccessDenied` 403), which `ApiExceptionHandler` maps to a problem whose `type` is the exception's code and whose title and detail come from `problem.<code>.title` / `.detail` in the message bundles; `PostalAddress` and `LocaleCode` value objects; `shared/infrastructure/security/JwtConfiguration` (encoder, decoder validated against the application `Clock`, roles → `ROLE_*` authorities), with `ApiSecurityConfiguration` acting as an OAuth2 resource server. Cucumber scenarios truncate every application table and restart every sequence before they start (`support/DatabaseCleaner`). The password reset added `shared/infrastructure/mail/MailSenderProperties` (`app.mail.sender-email`, the `From` of every outgoing e-mail) and `shared/infrastructure/config/PublicUrlProperties` (`app.site.public-url`, the address visitors use, for links in e-mails). Every e-mail (contact forward, password reset, monthly report) is composed by `shared/infrastructure/mail/BrandedEmails` from an `EmailDraft`: multipart plain text + HTML, `From` "Nová naděje – nadační fond" (`email.senderName`), the HTML wrapped in `templates/email/layout.html` (the site's look, inline styles, the logo as an inline `cid:logo` attachment, footer with the foundation's identity and the site link) around the context's `th:fragment="content"`; the colours of the templates are checked against the site theme by `EmailTemplateColoursTest`.

### `donations` (import, pairing, the donor's overview and the PDF receipts done)

`features/donations/admin_import_state.feature` covers `GET /api/admin/donations/import-state` (the state after a rejected token, the empty state, 403 for a donor, 401 without a token, the role taking effect at the next sign-in; glue `cucumber/AdminStepDefinitions`, which grants the role straight in `donor_role` as a test shortcut, and `donations/cucumber/AdminImportStateStepDefinitions`). `features/donations/donor_record_sync.feature`, `fio_payment_import.feature`, `import_outage_alerts.feature`, `payment_pairing.feature` and `symbol_claims.feature` cover the donor copy, the import cycle with its failures and the outage e-mails (see "Import outage alerts") and the pairing rules of "Fio import and pairing" (`symbol_claims.feature` asks and answers the question about an older symbol through the bank accounts endpoints and seeds a claim through `SymbolClaimRepository` with `donations/cucumber/SymbolClaimStepDefinitions` only where no question can be asked, see "Older variable symbol confirmation", and `application/pairing/SymbolClaimPairingConcurrencyTest` proves against PostgreSQL that a confirmation and an import running together pair every payment once and that an import waits for the pairing lock); `bank_check_on_demand.feature` covers "Bank check on demand" (a payment fetched by a check, the 30-second cooldown shared by donors and after a failure, the last update time, 401 without a token), with `support/SynchronousBankImportRequests` running the requested import in the request thread; `donor_donations_overview.feature` covers `GET /api/donations/me` and `/api/donations/me/summary` (empty list and zero summary, ordering, the `year` filter and its validation, the purpose in the caller's language, the account verification purpose, another donor's isolation, 401 without a token). Domain: `Donation` aggregate, `DonationStatus`, `DonationSource`, `PairingMethod`, `DonationPurpose` (`of(BankPayment)`), `BankPayment`, `DonorRecord`, `PaymentPairingPolicy`, the `importing` package (`ImportPlanner`, `ImportCoverage`, `BankImportState`), and for the overview `DonationList` (items with the total and count of `RECEIVED` ones, `inYear`), `DonationSummary` (total, count, last receipt day, `YearTotal` per year newest first) built from `DonationRepository.findByDonorNewestFirst`. Application: the read-only `application/overview/DonorDonationsService`. REST: `interfaces/rest/DonorDonationsController` with `DonationListResponse` and `DonationSummaryResponse`; the controller resolves `donation.purpose.<PURPOSE>` from the message bundles, and ArchUnit keeps `MessageSource` and the web packages out of `domain` and `application`. Liquibase: `donations/001_create_donor_record.xml`, `002_create_bank_payment.xml` (`bank_payment`, `bank_import_state`), `003_create_donation.xml`, `004_create_donor_sender_account.xml`, `010_add_donation_purpose.xml` (fills `ACCOUNT_VERIFICATION` for donations already paired from such a payment), `011_confirm_old_variable_symbols.xml` (`donor_symbol_claim`, `donation.symbol_claim_id` and the pairing checks). `donation_receipts.feature` (seventeen scenarios; glue `donations/cucumber/DonorReceiptStepDefinitions`, which reads the PDF text with PDFBox) covers the rules of "PDF receipts": the yearly receipt of a completed year kept as template and data and the same document served again, the current year and a non-numeric year, a completed year without donations, only that year's donations oldest first, the replacement after a late-paired payment or a changed address, the single receipt and its number in the list, the refunded donation, another donor's or an unknown id, the company and the person party, the bilingual `en` receipt and the language kept after a switch, the Prague year boundary, 401 without a token, `yearlyReceiptsAvailableThrough`, and the first receipt year (older donations listed with `receiptAvailable` false, both receipts refused with `receipt-before-first-year`, `receiptsAvailableFrom`). Domain: `domain/FoundationCalendar` (the Prague `ZONE` and `today(clock)`; `importing/BankCalendar` delegates to it) and the `receipt` package: the `DonationReceipt` aggregate (`issueForDonation`, `issueForYear`, `markSuperseded`, `certifies`), `DonationReceiptId`, `ReceiptKind`, `ReceiptNumber`, `ReceiptFingerprint` (SHA-256 of the certified data), `ReceiptDocument` with `ReceiptLine`, `ReceiptParty`, `ReplacedReceipt`, `FoundationIdentity` and `Signatory`, `ReceiptDocumentFactory`, `ReceiptCalendar` (`isCompleted`, `lastCompleted`), `FirstReceiptYear` (`admits` a day or a year), the `DonationReceiptRepository` interface, the `NotFound` exceptions `DonationNotFound`, `ReceiptNotAvailable` and `YearlyReceiptNotAvailable` and the `RuleViolation`s `YearNotYetCompleted` and `ReceiptBeforeFirstYear`. Application: `application/receipt/DonationReceiptService` (today's Prague date, the first receipt year and the completed-year rule for the yearly receipt, and the rendering limit), `DonationReceiptIssuer` (one `REQUIRES_NEW` transaction per download that locks the donor record first; then `ReceiptRequestReader`, which runs only inside a transaction (`MANDATORY`), finds the caller's donation with `DonationRepository.findByIdForDonor` (refusing a refunded one, then one received before the first receipt year) or the year's `RECEIVED` donations, reads the donor record and builds the `ReceiptRequest` with its fingerprint, and the issuer serves the active receipt whose fingerprint still matches, otherwise renders and stores a new one, superseding the old) returning an `IssuedReceipt`, and the `DonationReceiptRenderer` port; `DonorDonationsService` now returns `DonationOverview` (the list with the active single receipt numbers and `receiptAvailable`) and `DonationSummaryView` (the summary with the last completed year and the first receipt year). Infrastructure: `infrastructure/pdf/ThymeleafPdfReceiptRenderer` (`freeze` stores the `ReceiptTemplate` bundle and the `ReceiptImage`s through the `ReceiptResources` port and writes `ReceiptData`; `render` merges the data with the bundle's `ReceiptTexts` for `cs` and `en` and the images, processes the markup with its own string-template Thymeleaf engine and lays it out with openhtmltopdf and the embedded `fonts/DejaVuSans*.ttf`, deterministically; `ReceiptFormats` for dates and amounts), `persistence/JpaReceiptResources` (`receipt_template`, `receipt_image`), `ReceiptProperties` (`app.donations.receipt.*`) and `ReceiptConfiguration` (the `FoundationIdentity`, `Signatory`, `FirstReceiptYear` and `ConfiguredSignatureImage` beans), `persistence/JpaDonationReceiptRepository` (`nextSerial` from the sequence, `lockDonor` with `select ... for update`; a donor without a record has no row to lock, and the reads that follow answer as before). REST: `interfaces/rest/DonationReceiptController`. Liquibase: `005_create_donation_receipt.xml`, `008_keep_receipts_as_template_and_data.xml`, `009_drop_receipts_stored_as_pdf.xml`. Domain: `ReceiptContent` (the `ReceiptSnapshot` and the issued PDF's `ContentDigest`); application: `ReceiptRenderingLimit` (a fair semaphore around each issuer call, `DonationReceiptIssuer.issueForDonation` and `issueForYear`). `ReceiptTemplateHistoryTest` keeps every template bundle renderable (see "Receipts kept as template and data"). ArchUnit (`AdapterLibraryRulesTest`) keeps openhtmltopdf, PDFBox and Thymeleaf in `..infrastructure..`; `DonationReceiptIssuerConcurrencyTest` proves against PostgreSQL that two parallel downloads yield one receipt and that a download waiting for the donor's row, held by an uncommitted profile change or imported donation, issues from what that transaction committed. Still to come: manual donation recording (admin).

### `content` first features

Home page returns content; project detail by slug. Domain: `Project`, `NewsArticle`, `Slug`, `PublicationStatus`. Liquibase: `001_create_project.xml`, `002_create_news_article.xml`, `003_create_news_tag.xml`. Media table only when admin upload is implemented.

## ArchUnit

`architecture/DddLayeringRulesTest` and `AdapterLibraryRulesTest` (ArchUnit ≥ 1.5 for Java 25 class files; the scaffolding flags `withOptionalLayers` and `allowEmptyShould` are gone, so a rule fails on an empty match): layer dependencies per context, no dependencies between contexts, no `org.springframework..`, `jakarta.persistence..` or `jakarta.validation..` in `domain`, web and servlet types kept out of `domain` and `application`, REST controllers never expose `..infrastructure.persistence..` types, and the adapter libraries (ZXing, openhtmltopdf, PDFBox, Thymeleaf, `io.github.bzumik1.fio..`, `MessageSource`) confined to infrastructure.

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

Belongs in `shared/application/event/`: `DonorRegistered`, `DonorProfileChanged`, `AdminActionPerformed` (see "Cross-context events"). `shared/infrastructure/audit/` holds the `admin_action` adapter, because the trail serves every context. `shared/application/qr/QrCodeRenderer` (port) and `shared/infrastructure/qr/ZxingQrCodeRenderer` render QR codes for the payment (`donations`) and the authenticator link (`donors`); ZXing stays an adapter library.

Does **not** belong in `shared`: JWT types, `Donation`, `Donor`, JPA-related types, Spring `Page`.

## UX notes affecting the API

- **Language switcher in nav.** For unauthenticated visitors it switches the UI locale only (cookie or `localStorage`). For authenticated donors it persists `preferredLocale` via `PATCH /api/donors/me` so receipts issued from then on come out in the chosen language (an issued receipt keeps its language).
- **Password rules.** Frontend shows the 12-character minimum and disallow-list hint inline; backend is the source of truth for validation.
- **Refresh on 401.** Angular HTTP interceptor catches 401 with `type` `auth/expired-token`, calls `POST /api/donors/auth/refresh` with `withCredentials: true`, retries the original request. On a second 401 the session ends: the donor is sent home and the sign-in dialog opens (`donorGuard` and the dashboard); there is no sign-in page.

## Decisions made (recap)

| Topic | Decision |
|---|---|
| Admin auth | Role on `Donor`, no separate context. The administration is reachable from the internet; `ADMIN` is in the JWT only for a session opened with the TOTP second factor (Jakub, 22 October 2026). The role is granted and taken away in the administration (`/sprava/spravci`), the first administrator comes from `ADMIN_EMAILS`; nothing is administered by SQL (Jakub, 22 October 2026). No recovery codes: a lost authenticator is turned off by another administrator in the administration, with an e-mail to the donor. |
| Refresh token transport | HttpOnly Secure SameSite=Strict cookie, path `/api/donors/auth` (sent to refresh and logout). |
| Money | `amountMinor` + `currency`, `Money` value object in `shared`. |
| ID format | UUIDv7 string. |
| Public content URLs | By `slug`. |
| Home content storage | Hybrid: static sections in YAML, news/projects in DB. |
| CMS i18n | Czech only for now; structure ready (`Accept-Language`) for adding `content_translation` table later. |
| Static images | `frontend/public/` for now; backend volume + `/api/content/media/{id}` once admin upload is implemented. |
| Donation statuses | `RECEIVED`, `REFUNDED`. |
| Bank reconciliation | Random 10-digit variable symbol per donor; hourly Fio API import pairs by symbol, then by learned sender account for payments without a symbol, then by an older symbol the donor confirmed for that account; CSV import deferred to the admin task. |
| Older variable symbol | A payment with a symbol no registered donor has pairs only through the donor's confirmed answer, never merely because the donor verified the account. The bank accounts card asks after a one-koruna verification, when exactly one such symbol came from the account up to that day; the question is derived and only the answer is stored, and the donor cannot change it. On from the merge, with no switch (Jakub, 22 October 2026, variant a′). |
| Yearly receipt edge cases | 404 for a completed year without donations, 400 while the year is not completed (Prague calendar). |
| First receipt year | Receipts only for donations received from 1 January 2026 (`RECEIPT_FIRST_YEAR`); older donations are listed without a PDF and both receipt endpoints answer 400 `receipt-before-first-year` (Jakub, 22 October 2026). |
| Receipt of someone else's donation | 404 `donation-not-found`, not 403: no existence leak. |
| Receipts | Frozen documents: the first download issues, numbers (`YYYY-NNNNNN`) and stores the template and data it rendered; changed certified data issues a replacement with a new number that names the replaced one. Language: the donor's preference at issue, `en` bilingual. |
| Rate limiting | Own `FixedWindowRateLimiter` over Caffeine, in memory, per client address (`shared/infrastructure`). |
| Antispam (contact) | Honeypot + rate limit. No captcha until needed. |
| PDF preview | None: the dashboard downloads the file. |
| CORS | Not configured (same-origin in prod, dev proxy in dev). |

## Open items

- With the admin: `Cache-Control` / `ETag` per endpoint, audit columns (`createdBy`, `updatedBy`) on admin-editable entities, moving home content from YAML into the database.
- The outbound-mail health indicator stays off on purpose: the container healthcheck must not fail on SMTP (`deploy/README.md`).
