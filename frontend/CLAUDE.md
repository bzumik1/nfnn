# Frontend — CLAUDE.md

Angular 21 application for the Nadační fond Nová naděje site. Read this together with the repo-root `CLAUDE.md` (which covers the higher-level monorepo architecture, DDD bounded contexts, and the design prototype). This file documents what is specific to `frontend/`.

## Stack

- **Angular 21** with **standalone components** (no NgModules anywhere — do not introduce them).
- **Angular flat file naming**: components are `name.ts` / `name.html` / `name.scss` (e.g. `hero.ts`, not `hero.component.ts`). Class names also drop the `Component` suffix (`export class Hero {}`). Keep this style for any new component.
- **SCSS** for all styles (`inlineStyleLanguage: scss` in `angular.json`). Per-component SCSS for component-scoped rules; `src/styles.scss` for true globals.
- **`@angular/localize`** wired in `angular.json`, `main.ts`, `tsconfig.app.json`. Czech is the source locale; English target is empty until translated. Do **not** run `ng add @angular/localize` again.
- **Vitest** for unit tests (`@angular/build:unit-test` builder; `src/test-setup.ts` gives jsdom the `<dialog>` methods `showModal()` and `close()` it lacks), **Playwright** for E2E (`e2e/`).
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
  index.html                  Root HTML: title, meta description, Open Graph tags, the icons (`favicon.ico` with `sizes="32x32"`, so Chrome takes `favicon.svg`; `apple-touch-icon.png`), app-root. Loads nothing from other sites.
  main.ts                     bootstrapApplication entry, references @angular/localize.
  styles.scss                 Loads the theme; reset, scrollbar, keyframes.
  styles/themes/              The look: `_nova-nadeje.scss` declares the fonts (`@font-face` for `fonts/`) and sets every design token on `:root`.
  app/
    app.{ts,html,scss}        Root: `<router-outlet />` and the sign-in dialog rendered while `LoginDialogService.isOpen()` (re-created on every open, so its fields and panels start clean; it is an `app-dialog`, and its "Přihlásit se / Registrace" switch carries `aria-pressed`).
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
    shared/ui/                Behaviour-only building blocks the features share: `form-field/` (see Design system), `password-reveal/` (`<app-password-reveal>` around a password input adds an eye button, "Zobrazit heslo" with `aria-pressed` and `aria-controls`, that switches the input between `password` and `text`; every password field uses it), `copy-button/` (`<app-copy-button [value]="…" what="číslo účtu">`: "Kopírovat" plus the hidden `what` as its name, writes the value to the clipboard, says "Zkopírováno" for 2 s and in a `role="status"` line, and shows a visible sentence when the browser refuses) and `dialog/` (`<app-dialog labelledBy="…" [wide]="…" (dismissed)="…">` on a native `<dialog>` opened with `showModal()`: the browser keeps the focus inside and makes the page under it inert, focus goes to the `autofocus` control, Esc, the × button and a click on the backdrop emit `dismissed`, and destroying it returns the focus to the element that opened it; on phones up to 480 px it fills the screen).
    layout/
      site-header/            Sticky top nav, desktop links + mobile burger menu (signal-based open state; the button carries `aria-expanded`, `aria-controls="mobile-menu"` and "Otevřít/Zavřít menu"; Esc closes the menu and returns the focus to the button, a click outside or on a link closes it).
      site-footer/            Footer with columns and bottom bar.
    features/                 One folder per backend bounded context.
      content/                Public marketing pages.
        content.routes.ts     `''` → home, `'zasady-ochrany-osobnich-udaju'` → privacy policy, `'**'` → not-found (all lazy, with titles).
        home/
          home.{ts,html,scss} Composes the section components below; passes the signed-in donor's variable symbol from AuthStore to the donate section.
          sections/
            hero/             Full-bleed hero with overlay copy and CTA.
            stats-bar/        Numbers strip under the hero; the years are counted from the registry entry on 28 October 2005 on the visitor's day.
            about/            Two-column About section with image.
            projects/         Project grid + project-card child component (plain cards, nothing to click).
            news/             News card grid (placeholder content, no link until news has pages of its own).
            donate-cta/       Donation band: preset or custom amount (a text field taking whole crowns with spaces, its hint shown after leaving it), QR payment from PaymentQrApi (debounced, latest request wins) with an "Uložit QR kód" download, bank details (account, amount, the donor's variable symbol when given, IBAN), each with an `app-copy-button`; a note under them says the gift shows in the overview once booked, or, without a symbol, to sign in before paying, with "Založit účet" and "Přihlásit se" opening the dialog. On phones the bank details come before the QR code (CSS `order`), since a phone cannot scan its own screen.
        privacy-policy/       "Zásady ochrany osobních údajů" (GDPR) page, linked from the footer bottom row.
        not-found/            "Tuhle stránku jsme nenašli" for any unknown address under the public shell, with links home and to the contact form; sets `<meta name="robots" content="noindex">` while shown, since nginx answers 200 for every path.
      contact/
        contact-api.ts        HTTP service: POST /api/contact/messages.
        contact-form/         Contact form; posts through ContactApi, honeypot field, 429 and generic errors. A line under the submit button says the data serves only to handle the message and links the privacy policy (no consent wording: the policy's basis for the form is legitimate interest).
      donations/
        payment-qr-api.ts     HTTP service: GET /api/donations/payment-qr (SPAYD, PNG QR code, bank account); `paymentQr(amount, variableSymbol, purpose = 'DONATION')` sends `purpose` only for `ACCOUNT_VERIFICATION`.
        donations-api.ts      HTTP service: GET /api/donations/me and /api/donations/me/summary; `requestBankCheck()` (POST) and `bankCheck()` (GET) /api/donations/me/bank-check, and `checkBankUntilDone()`, which posts the check and polls it every 2 s while `checking`, at most 45 times, emitting every answer; DTOs as in the contract. The API's `year` filter has no frontend caller, so the service does not offer it. `singleReceipt(id)` and `yearlyReceipt(year)` GET /api/donations/me/{id}/receipt and /api/donations/me/receipts/yearly?year= as a blob and return a `DownloadedFile` (`blob`, `fileName` from Content-Disposition: `filename*=UTF-8''` first, then `filename=`, else `potvrzeni-o-daru.pdf` / `potvrzeni-o-darech-<year>.pdf`).
        bank-accounts-api.ts  HTTP service: GET /api/donations/me/bank-accounts (the donor's known sender accounts: `ACTIVE`, `AWAITING_PAYMENT`, `DISCONNECTED`, `shared`), POST …/{id}/disconnect and …/{id}/reconnect (204). `DonationItem` carries `pairedBy` (`VARIABLE_SYMBOL` | `SENDER_ACCOUNT` | null) and `senderAccount`.
        file-download.ts      `saveBlob(file)`: object URL, a hidden `<a download>` clicked inside the page and removed, the URL revoked in a `setTimeout(…, 0)` (Safari and Firefox cancel a download revoked synchronously).
        donation-date.ts      Formats the API's `YYYY-MM-DD` as `15. 03. 2026` (no locale data, no time zone); `formatBankTime` formats an instant as Prague `18. 10. 2026 10:05`.
        donation-amount.ts    Formats crowns for display: whole amounts without decimals, hellers always with two (`1 000,50`).
        testing/              Donation fixtures for specs (excluded from the app build).
      donors/
        donors.routes.ts      `'prehled'` → dashboard (the whole `/donor` branch sits behind `donorGuard` in app.routes.ts).
        login-dialog/         Sign-in / registration dialog opened from the header; posts through AuthStore and shows the problem's title and detail on failure. The "Obnovit heslo" tab posts the trimmed address through `AuthApi.requestPasswordReset` and shows "E-mail odeslán!" on 202, its own sentence on 429 and `describeProblem` otherwise.
        password-reset/       Public page `/obnova-hesla` (link from the reset e-mail, `#token=…`): reads the token from the fragment once and removes it with `Location.replaceState`, asks for the new password twice ("Hesla se neshodují." without a request), posts `AuthApi.confirmPasswordReset`; on 204 calls `AuthStore.logout()` when the browser still holds a session, then the success panel offers the sign-in dialog; `donors/invalid-password-reset-token` and a missing token show panels offering the dialog's reset tab (`LoginDialogService.open('reset')`); other failures show `describeProblem` in the form's alert line. Each panel's `<h1 id="password-reset-title" tabindex="-1">` takes focus after a panel switch.
        donor-field-messages.ts  The field messages for name, street, city and postal code, shared by the registration form and the profile card.
        dashboard/            Donor portal: `top-bar/` (`app-dashboard-top-bar`, a sticky `<header>`) has the logo and "← Hlavní stránka" ("Domů" up to 420 px), both linking to `/` without ending the session, the donor's name with a person icon (hidden up to 768 px; no greeting, since names are not declined into the vocative) and the red "Odhlásit se" (`--color-danger*`, solid on hover), which ends the session and goes home; `symbol-card/` (the variable symbol with an `app-copy-button` and "Přispět znovu" to `/#donate`, where the home page puts the symbol into the QR payment); `profile-card/` ("Údaje na potvrzení o daru": name, IČO for a company, address, e-mail and the receipt language; "Upravit údaje" turns it into a form that sends name, address and `preferredLocale` through `AuthStore.updateProfile` (`PATCH /api/donors/me`), e-mail and IČO stay read-only; the focus goes to the first field on edit and back to the button after saving or cancelling, the language hint says a new language reaches only receipts downloaded for the first time (an issued receipt and its replacements keep their language), a `role="status"` line confirms the save (name and address reach every receipt downloaded from then on, the language only first downloads), a problem shows in the form's alert line, and an ended session emits `sessionEnded`, which the dashboard answers like a failed load); `bank-accounts-card/` ("Moje bankovní účty", below the payments: one row per account from BankAccountsApi with its status label and hint, "ověřeno …", "odpojen od …" (the day after `disconnectedOn`), the gifts without a symbol; "Odpojit" asks for an inline confirmation (focus on "Zrušit"), "Připojit znovu" reconnects, both reload the list, announce the result in a `role="status"` line and move the focus to the card's heading; a problem shows through `describeProblem` in a `role="alert"` line, and 404/409 reload the list; "Přidat účet" opens an `app-dialog` with the 1 Kč instructions, the QR from `PaymentQrApi.paymentQr(1, variableSymbol, 'ACCOUNT_VERIFICATION')` (message "Ověření účtu Nadační fond Nová naděje"), the account number, the message and the symbol; while it is open it watches for the payment in a `role="status"` box: "Čekáme na vaši platbu…" with a spinning ring, and 30 s after opening, then 30 s after each check ended (so the backend's global 30 s pause is not hit), `checkBankUntilDone()` and the account list again, emitting `bankChecked` with the last answer (the dashboard updates "Údaje z banky k …" and reloads the donations when it changed); an account `ACTIVE` now that was not `ACTIVE` when the dialog opened (new, or an `AWAITING_PAYMENT` one) turns the box into a drawn tick "Účet … je ověřený" with its hint and ends the watch, also when the dashboard's reload brought it; a hidden tab pauses the watch and checks at once when visible again; after 20 checks it stops with "Platba zatím nedorazila" and "Kontrolovat dál"; the animations stop under `prefers-reduced-motion`; an ended session emits `sessionEnded`; the dashboard calls its `reload()` whenever the bank check reloads the donations); a payment paired by `SENDER_ACCOUNT` carries the tag "bez VS · …3333/2010" in its purpose cell (full sentence as `title` and visually hidden text); stat cards, year toggle and payments table from DonationsApi (summary + full list on open, signals `state` loading/ready/error, retry, empty state; a 401 `auth/unauthenticated` or a session forgotten by a failed refresh sends the donor home with the sign-in dialog, like `donorGuard`). PDF receipts: "Stáhnout PDF" (not on a `REFUNDED` row) saves the single receipt and "↓ PDF za rok" the yearly one through `saveBlob`; the yearly button is disabled with the line "Potvrzení za rok … bude ke stažení po skončení roku." for a year above the summary's `yearlyReceiptsAvailableThrough` (the frontend keeps no calendar of its own). A running download disables its button, which reads "Připravujeme PDF…". Failures show in a `role="alert"` line in the card the download started from: the problem's title for `donations/year-not-yet-completed` and `donations/yearly-receipt-not-available`; the title of a 404 on a single receipt, after which summary and list are fetched again (without the loading state); "Potvrzení se nepodařilo stáhnout. Zkuste to prosím znovu." otherwise; an ended session goes home with the sign-in dialog. Bank check: on open and on "Obnovit" it posts `DonationsApi.requestBankCheck`, shows "Kontrolujeme nové platby v bance…" (button disabled) while `checking`, polls `bankCheck()` every 2 s for at most 45 times, then shows "Údaje z banky k …" and fetches summary and list again (without the loading state) when `bankDataAsOf` changed, always after "Obnovit"; a failed check leaves only the button. A note under the payments explains the bank delays and the variable symbol. Every payment cell carries `data-label` (its column name), so up to 640 px the table shows each row as a card with the labels from CSS; amounts are right-aligned with `--numeric-figures`.
public/
  favicon.svg                 The star from `images/logo.svg` (the lettering is unreadable at tab size) in a square viewBox 840 units wide, strokes thickened to 64 (face 52) in those units so it holds at 16 px; white fill, so it shows on dark tabs too. Its `<style>` hides the face (`g.face`), a smudge at that size, when the icon is drawn 24 px wide or less; in an `<img>` Chromium measures that in CSS px, so a 16 px image has no face on a 2x screen either (`e2e/home-assets.spec.ts`).
  favicon.ico                 16, 32 and 48 px renders of `favicon.svg`, so the 16 px frame has no face.
  apple-touch-icon.png        180 px, the same star in a square viewBox 1060 units wide (a wider margin, since iOS rounds the corners) with stroke-width 40 (face 32) in those units, about 7 px (face 5 px) at 180 px, on opaque white (iOS fills transparency with black).
  images/                     Site imagery (hero, about, donate, news1-3, proj1-5, logo). Reference as `/images/<file>`.
e2e/                          Playwright specs; `donor-session.ts` holds the sample donor, the sign-in and `mockDonorApi` (QR payment, summary and list, the bank check, an empty bank account list, and with the `receipts` option both receipt endpoints answering a tiny PDF with both Content-Disposition forms: `potvrzeni-o-darech-<year>.pdf` and the given single file name), which every donor spec registers before opening a page so nothing escapes to the dev proxy. `password-reset.spec.ts` covers the dialog's reset tab and the `/obnova-hesla` page with mocked request and confirm endpoints. Download tests take `const [download] = await Promise.all([page.waitForEvent('download'), <click>])` and check `download.suggestedFilename()`.
```

## Routing

Defined in `src/app/app.routes.ts`. Two top-level lazy paths today:

- `''` → `layout/public-shell` (header, footer) with `children`: `'obnova-hesla'` → `features/donors/password-reset/` (lazy `loadComponent`, title "Nové heslo | Nová naděje – nadační fond"), then `''` → `features/content/content.routes.ts` (home page, privacy policy). A route cannot have both `children` and `loadChildren`, so the content routes hang under a child of their own.
- `'donor'` → `layout/donor-shell` with `features/donors/donors.routes.ts` (dashboard at `/donor/prehled`), guarded by `core/auth/donor-guard.ts`.
- Unknown addresses keep their URL and show `features/content/not-found/` (the `'**'` route at the end of `content.routes.ts`); there is no top-level redirect.

In-page navigation uses `routerLink="/" fragment="..."` (e.g. `fragment="about"`); anchor scrolling is enabled in `app.config.ts`. The old `#about`-style hash links from the design prototype are reproduced this way.

When a feature gains real routes (e.g. `contact`, `donations`), add a `<feature>.routes.ts` and `loadChildren` it from `app.routes.ts` — do **not** add eager imports.

## Design system

The look is kept apart from the behaviour so it can change without touching components. `src/styles/themes/_nova-nadeje.scss` is the theme: it gives every design token its value on `:root`, and `src/styles.scss` loads it. Components only reference tokens:

- Colour, named by role, not by hue: `--color-accent` (`-soft`, `-bg`, `-on-inverse`, `-2`, `-3`), `--color-on-accent`, `--color-text` (`-secondary`, `-muted`, `-soft`, `-subtle`), `--color-surface` (`-alt`, `-accent`, `-inverse`, `-inverse-strong`), `--color-on-inverse`, `--color-on-image`, `--color-image-shade`, `--color-backdrop`, `--color-border` (`-soft`, `-accent`), `--color-divider`, `--color-focus-ring`, `--color-danger*` (with `--color-on-danger`), `--color-success*`. A translucent variant is `color-mix(in srgb, var(--color-on-image) 65%, transparent)`, never an `rgba()`.
- Type: `--font-serif` (Playfair Display, headlines), `--font-sans` (Inter, body), both self-hosted variable fonts (latin and latin-ext WOFF2 from Fontsource, OFL licences beside them in `src/styles/themes/fonts/`; the build hashes them into `/media/`, which nginx caches as immutable), `--font-mono`, and `--numeric-figures` (`font-variant-numeric` for amounts and dates, so Playfair's old-style figures line up).
- Shape: `--radius-xs` … `--radius-xl`, `--radius-field`, `--radius-card`, `--radius-media`, `--radius-dialog`, `--radius-pill`, `--radius-round`.
- Depth: one `--shadow-*` per role (`card`, `panel`, `dialog`, `header`, `menu`, `cta`, `button`, `tab`, `focus`, …); shadows of accent buttons mix `--color-accent`, so they follow it.
- Layout: `--content-max: 1200px`, `--header-height`.
- Animations: `@keyframes scrollDot`, `@keyframes fadeInUp`.

`npm run lint:styles` (Stylelint, run by the PR check) fails on a hex, `rgb()`/`hsl()` or named colour, a `font-family`, a `border-radius` or a `box-shadow`/`text-shadow` in `src/app/**`, `src/styles/*.scss` or `src/styles.scss` that is not a token (the theme in `src/styles/themes/` is the one place with raw values). A new look is a change to the theme file; if a component needs a value the theme does not have, add a token there.

Every form field goes through `shared/ui/form-field/`: `<app-form-field label="…" [hint]="…" [messages]="{ required: …, email: … }">` wraps one control marked `appFormControl` (it needs an `id` and `ngModel`), renders the `<label for>`, the hint and the message for the control's first error key, and sets `aria-invalid` and `aria-describedby` on the control once it is touched or its form submitted. `form[appFocusFirstInvalid]` moves the focus to the first invalid control on submit. A field's error is said at the field in its own words, never as one sentence for the whole form; a form-level error is only for what no single field owns (passwords that do not match, a refusal from the API). The control's look is the global `.form-control` in `src/styles/_form-controls.scss`; components only space the fields.

Photos that only illustrate the text next to them (hero, about, donate, project and news cards) take `alt=""`; icons are inline SVGs with `aria-hidden="true"` and `stroke="currentColor"`, never emoji inside translated text, which screen readers would read out. `src/index.html` holds the meta description and the Open Graph tags; `og:image` and `og:url` wait for the real domain.

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

Images and other public files live in `public/`. The build copies `public/**/*` to the output root, so `<img src="/images/hero-1920.webp">` works in dev and prod identically. Photos are WebP: the hero in 1280/1920/2560 px with `srcset`, `sizes="max(100vw, 150vh, 900px)"` (it covers the whole screen, which on a phone is taller than wide) and `fetchpriority="high"`; the about and donate photos in 720/1440 px; project and news cards at 600 px. Every photo below the hero has `loading="lazy"` written before `src`/`srcset` (Angular sets attributes in template order, and a `src` set first starts the download) plus `width`/`height`, so the about and donate photos, hidden on phones, are never downloaded there. Convert a new photo with Pillow or `cwebp` at quality about 78; no file is used that the templates do not name. The ImageMagick in cloud sessions has no SVG renderer, so the icons were rendered with Playwright's Chromium (a page holding the SVG at the target size, screenshot with `omitBackground`) and packed with `convert 16.png 32.png 48.png favicon.ico`. **Do not** reference files under `Claude Design/images/` — copy them into `public/images/` instead.

## What is intentionally *not* implemented yet

- No real translations (English target empty).

When implementing a feature that touches the backend, add: a service in `core/` (or a feature subfolder), HTTP types as DTOs (not entities), a guard if it's auth-gated, a route, and at least one Vitest spec following the project's `Given … when … then` BDD naming.

## Conventions reminder (from repo-root `CLAUDE.md`)

- **No comments in code.** Expressive names + tests are the documentation.
- **English** for all identifiers, file names, comments. **Czech** for user-facing copy, with i18n keys.
- **Standalone components only**, flat file naming, SCSS, constructor injection.
- **Mirror the backend bounded contexts** in `features/` — never invent a feature folder that doesn't correspond to one.
- One section per file under `home/sections/`; reusable presentational pieces graduate to `shared/` once they're used in more than one place.
