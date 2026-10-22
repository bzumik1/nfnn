# Frontend

Angular 21 (standalone, zoneless, signály), SCSS s tokeny v `src/styles/themes/_nova-nadeje.scss`, Vitest a Playwright. Vyžaduje Node 22 nebo 24 LTS.

```bash
npm ci
npm start                    # http://localhost:4200, /api se proxuje na backend :8080
npm run format               # Prettier přes src/, e2e/ a konfigurační soubory (format:check jen kontroluje)
npm run lint                 # ESLint (angular-eslint): TypeScript, šablony a jejich přístupnost
npm run lint:styles          # Stylelint: v komponentách jen tokeny z theme
npm test -- --watch=false    # Vitest
npm run build                # produkční build do dist/frontend/browser/
npm run e2e                  # Playwright (jednou předtím npm run e2e:install)
```

Co kde je: [docs/frontend-overview.md](../docs/frontend-overview.md). Pravidla: `.claude/rules/frontend.md` a `testing.md`.
