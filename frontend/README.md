# Frontend

Angular 22 (standalone, zoneless, signály), SCSS s tokeny v motivu `src/themes/nova-nadeje/_theme.scss` (motiv se volí při sestavení, viz `.claude/rules/frontend.md`), Vitest a Playwright. Vyžaduje Node ^22.22.3, ^24.15 nebo ≥ 26 (CI a image používají 24).

```bash
npm ci
npm start                    # http://localhost:4200, /api se proxuje na backend :8080
npm run format               # Prettier přes src/, e2e/ a konfigurační soubory (format:check jen kontroluje)
npm run lint                 # ESLint (angular-eslint): TypeScript, šablony a jejich přístupnost
npm run lint:styles          # Stylelint: v komponentách jen tokeny z motivu; každý motiv má všechny tokeny
npm test -- --watch=false    # Vitest
npm run build                # produkční build do dist/frontend/browser/
npm run e2e                  # Playwright (jednou předtím npm run e2e:install, v cloudu npx playwright install chromium)
E2E_THEME=control npx playwright test e2e/theme.spec.ts   # kontrolní motiv přebarví každou stránku
```

Co kde je: [docs/frontend-overview.md](../docs/frontend-overview.md). Pravidla: `.claude/rules/frontend.md` a `testing.md`.
