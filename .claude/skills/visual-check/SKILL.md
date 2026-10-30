---
name: visual-check
description: Screenshot a UI change at 390 and 1280 px with Playwright and the e2e API mocks, before and after, to audit it and attach it to the PR; check the security headers and CSP against the production nginx
---
# Visual check of a UI change

Jakub wants before/after screenshots of every visible change (2026-10-18); audit them yourself before handing over.

1. `cd frontend && npm ci` once. In a cloud session first follow skill `cloud-session` (Node 24, `npx playwright install --only-shell chromium`); locally `npx playwright install --only-shell chromium` once.
2. Write a throwaway spec `frontend/e2e/zz-shot.spec.ts`: `mockDonorApi(page, …)` and `signIn(page)` from `e2e/donor-session.ts` (sign in at 1280 px; the header button is hidden on phones), then `page.route` overrides for the state you need (a later route wins; mock every `/api` call the page makes), `page.setViewportSize` 390×844 and 1280×900, `page.screenshot({ path, fullPage: true, animations: 'disabled' })`. For a dialog, wait for `expect(dialog).toBeVisible()` first.
3. `npx playwright test e2e/zz-shot.spec.ts` (the config builds the production bundle and serves it; with `npm start` already running on :4200 locally it uses that instead). For the "before", run the same spec on `main` (`git stash` or a worktree).
4. Look at each image at real size and zoomed in: cut-offs, overlaps, wrapping, contrast, focus ring, Czech typography (`1 000 Kč`, dates). Fix and reshoot until clean.
5. Delete the spec and `frontend/test-results/`. Attach the images to the PR; in a claude.ai project also save them under `/mnt/project-files/nfnn-ux/snimky/<change>/` and attach them to the reply.

## Screens against the merge base
A Phase 1 slice proves "screenshots equal" against its merge base, not against the v2 PNGs (non-v3 UX PRs moved 54 of them; `testing.md`, Regression against v2):
1. In `frontend/`: `npm run screens:compare -- --out=/tmp/…/screens` (add `--head-spec` when the slice adds states to `e2e/baseline/screens.spec.ts`, so the base is shot with them too; `--base=<commit>` for another base). It builds the merge base (a temporary worktree) and this checkout, shoots `e2e/baseline/screens.spec.ts` on both and compares them: pages within 0.2 % of their pixels, the QR and bank-detail element shots exactly.
2. Read `report.md` in the output folder and open the crops (`crops/<shot>-base|head|diff.png`) of every differing shot. A difference the slice did not mean to make is a bug; one it meant is named in the PR with its crop. Never in the repository: the script refuses an output folder inside it.
3. A new state for Phase 1 goes into `SCREENS` only when it existed at `BASELINE_COMMIT` and is recorded from there, twice with the same pixels, with the slice's spec patch `regression/v2/additions/<slice>.patch` (`--patch=… --v2-only --base-only`, then `screens-manifest.mjs --add`; `testing.md`); otherwise into `SCREENS_SINCE_V2`.

## Headers
The dev server sends no security headers, so a change to the Content-Security-Policy, to `nginx.conf`, or anything that adds an inline script, an external resource or a new kind of embed is checked against the production nginx:
1. `npm run build`; pull `nginx:1.30-alpine` (in the cloud `mirror.gcr.io/library/nginx:1.30-alpine`, tagged back) or whatever `frontend/Dockerfile` names.
2. `docker run -d --name nfnn-nginx -p 8089:80 --add-host backend:127.0.0.1 --add-host mcp:127.0.0.1 -v "$PWD/dist/frontend/browser:/usr/share/nginx/html:ro" -v "$PWD/nginx.conf:/etc/nginx/conf.d/default.conf:ro" -v "$PWD/nginx-security-headers.conf:/etc/nginx/snippets/security-headers.conf:ro" -v "$(mktemp -d):/logs" nginx:1.30-alpine` (nginx exits on an unresolvable upstream or a missing `/logs`; compare the mount targets with `frontend/Dockerfile`).
3. `E2E_BASE_URL=http://localhost:8089 npm run e2e` (the tests mock `/api`) with a throwaway spec that collects violations (`page.on('console', m => m.type() === 'error' && errors.push(m.text()))`) on the pages you changed and expects none (the suite itself does not fail on console errors); `curl -sI http://localhost:8089/` shows the headers. Then `docker rm -f nfnn-nginx`.
