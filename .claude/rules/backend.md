# Backend rules: architecture, design, persistence, configuration

## Contexts and layers
- Contexts `content` (still empty), `donors`, `donations`, `contact`, kernel `shared`. Per context: `domain` depends on nothing (no Spring, JPA, Bean Validation); `application` → domain; `infrastructure` → domain, application; `interfaces/rest` → all. Contexts never depend on each other. Rules: `architecture/DddLayeringRulesTest`, `AdapterLibraryRulesTest` (zxing, openhtmltopdf, PDFBox, Thymeleaf only in `..infrastructure..`; `io.github.bzumik1.fio..` only in `donations/infrastructure/fio`; `MessageSource` only in adapters).
- Name the owning context before writing code. A concept that fits two contexts means a wrong boundary or a missing context: say so, never force it.
- Cross-context only by events: a record in `shared/application/event/` (`DonorRegistered`, `DonorProfileChanged`) published with `ApplicationEventPublisher`, consumed with `@TransactionalEventListener` (`BEFORE_COMMIT` for a copy that must not be lost, `AFTER_COMMIT` + `@Async` for side effects like mail). A context keeps its own copy of foreign data (`donor_record` in donations).
- `shared` holds only stable concepts: value objects (`Money`, `Currency`, `EmailAddress`, `Iban`, `VariableSymbol`, `PostalAddress`, `LocaleCode`, `DonorType`, `UuidV7`), the sealed `DomainException` family, the events, and cross-cutting infrastructure (security chain and JWT, `ApiExceptionHandler` + `ProblemTypes`, `FixedWindowRateLimiter`, `Clock`, scheduling, async, `MailSenderProperties`, `PublicUrlProperties`).

## Domain
- Aggregates own their invariants and behaviour (no anemic entities); value objects are records that validate in the compact constructor; ids are records over `UuidV7`. Domain services only for rules spanning aggregates (`PaymentPairingPolicy`, `ImportPlanner`, `ReceiptDocumentFactory`).
- Failures are sealed `DomainException` subtypes with a `code`: `RuleViolation` 400, `Conflict` 409, `NotFound` 404, `AuthenticationFailure` 401, `AccessDenied` 403. `ApiExceptionHandler` maps them to problem+json with `problem.<code>.title|detail` from `i18n/messages_{cs,en}.properties`; add both texts with the exception.
- `Clock` is injected, never `Instant.now()`; Prague calendars live in `FoundationCalendar`, `ReceiptCalendar`, `BankCalendar`. `Optional` only as a return type. Immutable by default. Secrets mask `toString` (`RawPassword`).

## Application
- One use case per service; `@Transactional` on application services (`readOnly` for queries), never on controllers; short transactions; `REQUIRES_NEW` only with a stated reason (`DonationReceiptIssuer` locks the donor row).
- Commands, queries and views are records; the layer knows no HTTP, JPA entity or template. Ports are interfaces here, implemented in infrastructure (`BankStatementSource`, `BankImportRequests`, `QrCodeRenderer`, `DonationReceiptRenderer`, `MonthlyReportSender`).
- Retry-safe by design: imports keyed by bank transaction id, the monthly report recorded in the sending transaction, receipt numbers from a sequence under the donor lock.

## REST (`<context>/interfaces/rest`)
- Paths `/api/<context>/...`; request and response records only; Jakarta validation on requests with `@Size` limits from domain constants; `Accept-Language` selects texts.
- Errors are problem+json: types `https://nfnn.cz/problems/<context>/<code>` (`ProblemTypes`); validation 400 with `errors[{field,message}]`; 401/403 from the security chain (never a Basic challenge); 429 `rate-limited` from a limiter built like `SignInRateLimiter` (per client address, counted before any hashing or work).
- A public endpoint needs its `permitAll` line in `ApiSecurityConfiguration`; everything else needs the donor JWT. Another donor's resource answers 404.
- Every endpoint change updates `docs/api-contract.md` in the same PR.

## Persistence
- JPA entities and Spring Data repositories live in `<context>/infrastructure/persistence/` as package-private details of the adapter implementing the domain repository interface; the adapter maps domain ↔ entity.
- Liquibase: `db/changelog/<context>/NNN_<change>.xml`, auto-included by the master; one changelog per logical change; never edit a checked-in one. Prefer backward-compatible steps (add nullable, fill, constrain later): a rollback means restoring a dump. Index every FK and query path; unique constraints state invariants. Types: `uuid`, `timestamp with time zone`, `date`, `varchar(n)` sized to the domain limit.
- `open-in-view: false`: load what the use case needs inside it; no lazy access afterwards.

## Configuration and operations
- `@ConfigurationProperties` records under `app.*`, validated at startup (fail fast: `JWT_SECRET` outside dev, invalid IBAN, empty optional values). Production defaults in `application.yml`, dev overlay in `application-dev.yml`, env names documented in `deploy/backend.env.example` and `.env.example`. Without `FIO_TOKEN` the import is off (`DisabledFioClient`, no scheduler bean).
- Schedulers share one thread: every job has a property that `-` turns off (tests pin it off), catches its own exceptions, logs the outcome and tolerates a missed run.
- Logging: SLF4J `log` field; ids and outcomes only, never names, e-mails, addresses, tokens or message bodies; `warn` for expected failures, `error` with the exception for unexpected ones.
- Templates: Thymeleaf e-mails in `templates/email/<context>/` as `th:fragment="content"` fragments of the shared `templates/email/layout.html`, composed by `shared/infrastructure/mail/BrandedEmails` from an `EmailDraft` (text and HTML parts, `th:text` only, inline styles with theme colours only, sender `app.mail.sender-email`, links from `app.site.public-url`); receipts in `templates/pdf/`, rendered deterministically from the stored template bundle (skill `receipt-template`).
