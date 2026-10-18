# Frontend — CLAUDE.md

Angular 21 application for the Nadační fond Nová naděje site. Read this together with the repo-root `CLAUDE.md` (which covers the higher-level monorepo architecture, DDD bounded contexts, and the design prototype). This file documents what is specific to `frontend/`.

## Stack

- **Angular 21** with **standalone components** (no NgModules anywhere — do not introduce them).
- **Angular flat file naming**: components are `name.ts` / `name.html` / `name.scss` (e.g. `hero.ts`, not `hero.component.ts`). Class names also drop the `Component` suffix (`export class Hero {}`). Keep this style for any new component.
- **SCSS** for all styles (`inlineStyleLanguage: scss` in `angular.json`). Per-component SCSS for component-scoped rules; `src/styles.scss` for true globals.
- **`@angular/localize`** wired in `angular.json`, `main.ts`, `tsconfig.app.json`. Czech is the source locale; English target is empty until translated. Do **not** run `ng add @angular/localize` again.
- **Vitest** for unit tests (`@angular/build:unit-test` builder), **Playwright** for E2E (`e2e/`).
- **Build tooling**: `@angular/build:application` (Vite-based). No webpack config.

## Required Node version

Use **Node 22 LTS** (Angular 21 supports 22 and 24 LTS; **Node 25 is unsupported and currently fails on this machine** because the system Node 25 from Homebrew is linked against a missing `libsimdjson.31.dylib`).

`node@22` is installed via Homebrew but is keg-only — prepend its bin to PATH per session, or via your shell rc:

```bash
export PATH="/opt/homebrew/opt/node@22/bin:$PATH"
```

Verify with `node --version` before running any npm command. If `node_modules` was installed with a different Node, delete `node_modules` and `package-lock.json` and re-run `npm install`.

## Common commands

Run from `frontend/`.

| Command | Purpose |
|---|---|
| `npm install` | Install deps (Node 22). |
| `npm start` | Dev server at `http://localhost:4200`. Watch mode. |
| `npm run build` | Production build → `dist/frontend/browser/`. |
| `npm run watch` | Development build, recompiles on change. |
| `npm test` | Vitest unit tests. |
| `npm run e2e` | Playwright tests (run `npm run e2e:install` once to fetch browsers). |

## Source layout

```
src/
  index.html                  Root HTML. Loads Google Fonts (Playfair Display, Inter), title, app-root.
  main.ts                     bootstrapApplication entry, references @angular/localize.
  styles.scss                 Global CSS variables (design tokens), reset, scrollbar, keyframes.
  app/
    app.{ts,html,scss}        Root: `<router-outlet />` and the sign-in dialog rendered while `LoginDialogService.isOpen()` (re-created on every open, so its fields and panels start clean).
    app.config.ts             provideRouter + withInMemoryScrolling (anchor scrolling on for #fragment links).
    app.routes.ts             Top-level routes (lazy children per bounded context).
    core/                     Singletons: HTTP services, interceptors, guards, auth state.
      auth/
        donor.ts              DTOs: Donor, RegisterDonorRequest, AuthResponse; `PASSWORD_MIN_LENGTH` (12, shared by the registration form and the password reset page).
        auth-api.ts           HTTP: /api/donors/auth/{register,login,refresh,logout}, /api/donors/auth/password-reset/{request,confirm} (`requestPasswordReset`, `confirmPasswordReset`), /api/donors/me.
        auth-store.ts         Signals `donor`, `status`, `signedIn`; access token in memory; refresh shared between callers; restore() on app start.
        auth-interceptor.ts   Adds `Authorization: Bearer` to /api/** (not the auth endpoints); parses an `application/problem+json` Blob body (a failed blob download) into the HttpErrorResponse first; on 401 `auth/expired-token` refreshes once and retries.
        donor-guard.ts        canActivate for `/donor/**`: waits for the restore, otherwise goes home and opens the sign-in dialog.
        login-dialog.service.ts  Open/closed state of the sign-in dialog and the tab it opens on (`LoginDialogMode` `login` | `register` | `reset`; `open(mode = 'login')` sets `initialMode`, which the dialog reads once when it is created). Used by the header, the guard, the dashboard, the password reset page and the dialog.
        api-problem.ts        Reads an RFC 7807 body out of an HttpErrorResponse; `describeProblem(failure, generic)` turns it into one line (title, detail, field messages) or `generic` when there is no problem body.
        testing/              Fixtures for specs (excluded from the app build).
    shared/                   Reusable presentational components/pipes/directives. (Currently empty.)
    layout/
      site-header/            Sticky top nav, desktop links + mobile burger menu (signal-based open state).
      site-footer/            Footer with columns and bottom bar.
    features/                 One folder per backend bounded context.
      content/                Public marketing pages.
        content.routes.ts     `''` → home, `'zasady-ochrany-osobnich-udaju'` → privacy policy (both lazy, with titles).
        home/
          home.{ts,html,scss} Composes the section components below; passes the signed-in donor's variable symbol from AuthStore to the donate section.
          sections/
            hero/             Full-bleed hero with overlay copy and CTA.
            stats-bar/        Numbers strip under the hero.
            about/            Two-column About section with image.
            projects/         Project grid + project-card child component.
            news/             News card grid (placeholder content).
            donate-cta/       Donation band: preset or custom amount, QR payment from PaymentQrApi (debounced, latest request wins), bank account and the donor's variable symbol when given.
        privacy-policy/       "Zásady ochrany osobních údajů" (GDPR) page, linked from the footer bottom row.
      contact/
        contact-api.ts        HTTP service: POST /api/contact/messages.
        contact-form/         Contact form; posts through ContactApi, honeypot field, 429 and generic errors.
      donations/
        payment-qr-api.ts     HTTP service: GET /api/donations/payment-qr (SPAYD, PNG QR code, bank account).
        donations-api.ts      HTTP service: GET /api/donations/me and /api/donations/me/summary; DTOs as in the contract. The API's `year` filter has no frontend caller, so the service does not offer it. `singleReceipt(id)` and `yearlyReceipt(year)` GET /api/donations/me/{id}/receipt and /api/donations/me/receipts/yearly?year= as a blob and return a `DownloadedFile` (`blob`, `fileName` from Content-Disposition: `filename*=UTF-8''` first, then `filename=`, else `potvrzeni-o-daru.pdf` / `potvrzeni-o-darech-<year>.pdf`).
        file-download.ts      `saveBlob(file)`: object URL, a hidden `<a download>` clicked inside the page and removed, the URL revoked in a `setTimeout(…, 0)` (Safari and Firefox cancel a download revoked synchronously).
        donation-date.ts      Formats the API's `YYYY-MM-DD` as `15. 03. 2026` (no locale data, no time zone).
        donation-amount.ts    Formats crowns for display: whole amounts without decimals, hellers always with two (`1 000,50`).
        testing/              Donation fixtures for specs (excluded from the app build).
      donors/
        donors.routes.ts      `'prehled'` → dashboard (the whole `/donor` branch sits behind `donorGuard` in app.routes.ts).
        login-dialog/         Sign-in / registration dialog opened from the header; posts through AuthStore and shows the problem's title and detail on failure. The "Obnovit heslo" tab posts the trimmed address through `AuthApi.requestPasswordReset` and shows "E-mail odeslán!" on 202, its own sentence on 429 and `describeProblem` otherwise.
        password-reset/       Public page `/obnova-hesla` (link from the reset e-mail, `#token=…`): reads the token from the fragment once and removes it with `Location.replaceState`, asks for the new password twice ("Hesla se neshodují." without a request), posts `AuthApi.confirmPasswordReset`; on 204 calls `AuthStore.logout()` when the browser still holds a session, then the success panel offers the sign-in dialog; `donors/invalid-password-reset-token` and a missing token show panels offering the dialog's reset tab (`LoginDialogService.open('reset')`); other failures show `describeProblem` in the form's alert line. Each panel's `<h1 id="password-reset-title" tabindex="-1">` takes focus after a panel switch.
        dashboard/            Donor portal: greeting, variable symbol, sign-out; stat cards, year toggle and payments table from DonationsApi (summary + full list on open, signals `state` loading/ready/error, retry, empty state; a 401 `auth/unauthenticated` or a session forgotten by a failed refresh sends the donor home with the sign-in dialog, like `donorGuard`). PDF receipts: "Stáhnout PDF" (not on a `REFUNDED` row) saves the single receipt and "↓ PDF za rok" the yearly one through `saveBlob`; the yearly button is disabled with the line "Potvrzení za rok … bude ke stažení po skončení roku." for a year above the summary's `yearlyReceiptsAvailableThrough` (the frontend keeps no calendar of its own). A running download disables its button, which reads "Připravujeme PDF…". Failures show in a `role="alert"` line in the card the download started from: the problem's title for `donations/year-not-yet-completed` and `donations/yearly-receipt-not-available`; the title of a 404 on a single receipt, after which summary and list are fetched again (without the loading state); "Potvrzení se nepodařilo stáhnout. Zkuste to prosím znovu." otherwise; an ended session goes home with the sign-in dialog.
public/
  favicon.ico
  images/                     Site imagery (hero, about, donate, news1-3, proj1-5, logo). Reference as `/images/<file>`.
e2e/                          Playwright specs; `donor-session.ts` holds the sample donor, the sign-in and `mockDonorApi` (QR payment, summary and list, and with the `receipts` option both receipt endpoints answering a tiny PDF with both Content-Disposition forms: `potvrzeni-o-darech-<year>.pdf` and the given single file name), which every donor spec registers before opening a page so nothing escapes to the dev proxy. `password-reset.spec.ts` covers the dialog's reset tab and the `/obnova-hesla` page with mocked request and confirm endpoints. Download tests take `const [download] = await Promise.all([page.waitForEvent('download'), <click>])` and check `download.suggestedFilename()`.
```

## Routing

Defined in `src/app/app.routes.ts`. Two top-level lazy paths today:

- `''` → `layout/public-shell` (header, footer) with `children`: `'obnova-hesla'` → `features/donors/password-reset/` (lazy `loadComponent`, title "Nové heslo | Nová naděje – nadační fond"), then `''` → `features/content/content.routes.ts` (home page, privacy policy). A route cannot have both `children` and `loadChildren`, so the content routes hang under a child of their own.
- `'donor'` → `layout/donor-shell` with `features/donors/donors.routes.ts` (dashboard at `/donor/prehled`), guarded by `core/auth/donor-guard.ts`.
- `'**'` → redirect to `/`.

In-page navigation uses `routerLink="/" fragment="..."` (e.g. `fragment="about"`); anchor scrolling is enabled in `app.config.ts`. The old `#about`-style hash links from the design prototype are reproduced this way.

When a feature gains real routes (e.g. `contact`, `donations`), add a `<feature>.routes.ts` and `loadChildren` it from `app.routes.ts` — do **not** add eager imports.

## Design system

The design lives in CSS custom properties on `:root` in `src/styles.scss`:

- Color: `--color-accent` (`#2563EB`), `--color-text` (`#1a1a2e`), `--color-surface*`, `--color-border*`, `--color-dark`.
- Type: `--font-serif` (Playfair Display, headlines), `--font-sans` (Inter, body).
- Layout: `--content-max: 1200px`.
- Effects: `--shadow-card`, `--shadow-card-hover`, `--shadow-cta`.
- Animations: `@keyframes scrollDot`, `@keyframes fadeInUp`.

**Use these variables in component SCSS instead of hardcoding values.** If a section needs a new token, add it to `:root` rather than redefining locally.

The visual reference is `Claude Design/Nova Nadeje.html` at the repo root — a static React-in-the-browser prototype. **Treat it as the source of truth for visuals only**; never embed its JSX or pull React in. All sections in `home/sections/` are 1:1 ports.

## i18n conventions

Every user-visible Czech string is marked. Convention used throughout the codebase:

- Text: `i18n="@@<context>.<area>.<key>"`, e.g. `i18n="@@layout.header.nav.home"`.
- Translatable attributes: `i18n-alt`, `i18n-aria-label`, `i18n-placeholder` paired with the same `@@<id>` scheme.
- Czech is the in-template source. English keys will be filled when translation starts; the empty target file is not yet generated.

When adding new copy, **always** mark it with a stable `@@id`. Renaming an id silently breaks translations later.

## API access

Backend lives at `http://localhost:8080` and exposes everything under `/api/...`. `npm start` proxies `/api/*` there through `proxy.conf.json` (`serve.options.proxyConfig` in `angular.json`). `HttpClient` is provided in `app.config.ts` with `withFetch()`. Each feature keeps its own HTTP service next to its components (`features/contact/contact-api.ts`); cross-feature singletons (auth state, interceptors) go to `core/`.

Errors from the backend are RFC 7807 `application/problem+json`; the `HttpErrorResponse.error` body carries `type`, `title`, `detail`, `status` and, for validation, `errors: [{ field, message }]`. `core/auth/api-problem.ts` reads it; titles and details are already localized by the backend (`Accept-Language`), so components show them as they are.

Donor sessions: `AuthStore` keeps the access token in memory only; the refresh token is an HttpOnly cookie the browser sends to `/api/donors/auth/**` by itself. A `localStorage` flag (`nfnn.donor-session`) only says that a session may exist, so `restore()` on app start calls `refresh` for returning donors and nothing for everyone else. Every `/api/**` call goes through `authInterceptor`; nothing else should add the header.

Production: nginx in `frontend/Dockerfile` proxies `/api/*` to the `backend` container in compose. Components must only call relative `/api/...` URLs. The backend trusts forwarded headers, so `nginx.conf` resolves the visitor's address itself (`set_real_ip_from` the private ranges, `real_ip_header X-Forwarded-For`, `real_ip_recursive on`), sends the backend `X-Forwarded-For $remote_addr` and drops a client-sent `Forwarded`; the per-address rate limits rely on it.

## Assets

Images and other public files live in `public/`. The build copies `public/**/*` to the output root, so `<img src="/images/hero.jpg">` works in dev and prod identically. **Do not** reference files under `Claude Design/images/` — copy them into `public/images/` instead.

## What is intentionally *not* implemented yet

- No real translations (English target empty).
- `shared/` is still a placeholder (`.gitkeep`).

When implementing a feature that touches the backend, add: a service in `core/` (or a feature subfolder), HTTP types as DTOs (not entities), a guard if it's auth-gated, a route, and at least one Vitest spec following the project's `Given … when … then` BDD naming.

## Conventions reminder (from repo-root `CLAUDE.md`)

- **No comments in code.** Expressive names + tests are the documentation.
- **English** for all identifiers, file names, comments. **Czech** for user-facing copy, with i18n keys.
- **Standalone components only**, flat file naming, SCSS, constructor injection.
- **Mirror the backend bounded contexts** in `features/` — never invent a feature folder that doesn't correspond to one.
- One section per file under `home/sections/`; reusable presentational pieces graduate to `shared/` once they're used in more than one place.
