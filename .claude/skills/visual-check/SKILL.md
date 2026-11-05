---
name: visual-check
description: Screenshot a UI change at 390 and 1280 px with Playwright and the e2e API mocks, before and after, to audit it and attach it to the PR; check the security headers and CSP against the production nginx
---
# Visual check of a UI change

Jakub wants before/after screenshots of every visible change (2026-10-18); audit them yourself before handing over.

1. `cd frontend && npm ci` once. In a cloud session first follow skill `cloud-session` (Node 26, `npx playwright install --only-shell chromium`); locally `npx playwright install --only-shell chromium` once.
2. Write a throwaway spec `frontend/e2e/zz-shot.spec.ts`: `mockDonorApi(page, …)` and `signIn(page)` from `e2e/donor-session.ts` (sign in at 1280 px; the header button is hidden on phones), then `page.route` overrides for the state you need (a later route wins; mock every `/api` call the page makes), `page.setViewportSize` 390×844 and 1280×900, `page.screenshot({ path, fullPage: true, animations: 'disabled' })`. For a dialog, wait for `expect(dialog).toBeVisible()` first.
3. `npx playwright test e2e/zz-shot.spec.ts` (the config builds the production bundle and serves it; with `npm start` already running on :4200 locally it uses that instead). For the "before", run the same spec on `main` (`git stash` or a worktree).
4. Look at each image at real size and zoomed in: cut-offs, overlaps, wrapping, contrast, focus ring, Czech typography (`1 000 Kč`, dates). Fix and reshoot until clean.
5. Delete the spec and `frontend/test-results/`. Attach the images to the PR; in a claude.ai project also save them under `/mnt/project-files/nfnn-ux/snimky/<change>/` and attach them to the reply.

## Screens against the merge base
A Phase 1 slice proves "screenshots equal" against its merge base, not against the v2 PNGs (non-v3 UX PRs moved 54 of them; `testing.md`, Regression against v2):
1. In `frontend/`: `npm run screens:compare -- --out=/tmp/…/screens` (add `--head-spec` when the slice adds states to `e2e/baseline/screens.spec.ts`, so the base is shot with them too; `--base=<commit>` for another base). It builds the merge base (a temporary worktree) and this checkout, shoots `e2e/baseline/screens.spec.ts` on both and compares them: pages within 0.2 % of their pixels, the QR and bank-detail element shots exactly.
2. Read `report.md` in the output folder and open the crops (`crops/<shot>-base|head|diff.png`) of every differing shot. A difference the slice did not mean to make is a bug; one it meant is named in the PR with its crop. Never in the repository: the script refuses an output folder inside it.
3. A new state for Phase 1 goes into `SCREENS` only when it existed at `BASELINE_COMMIT` and is recorded from there, twice with the same pixels, with the slice's spec patch `regression/v2/additions/<slice>.patch` (`--patch=… --v2-only --base-only`, then `screens-manifest.mjs --add`; `testing.md`); otherwise into `SCREENS_SINCE_V2`.

## Phones and tablets
The device projects (`testing.md`, Phones and tablets) check boxes, not pixels, so before handing over a visible change look at their screens too, as t3code has an agent review its simulator shots:
1. In `frontend/`: `npm run e2e:devices` (WebKit and Chromium's headless shell installed, skill `cloud-session`). A new page or state the change adds gets its step in `e2e/devices/steps.ts`.
2. Open `test-results/device-report/index.html`, or read the PNGs under `test-results/device-report/<pose>/<step>.png` (one per pose and step, in CSS pixels; red frame: a finding, amber: a known one). For a PR, CI keeps the same folder as the artifact `zarizeni`.
3. Report only what a visitor would notice: text clipped, overlapping or cut mid-word where it should wrap, a column so narrow it holds a word per line, controls overlapping, cut off or under the header, the bottom bar or a dialog edge, content hidden behind fixed chrome, unreadable contrast, large unexplained gaps, error states that should not be there. Leave out the fixture content itself, the status-bar strip at the very top (`frontend-overview.md`, Shell), content scrolling under the fixed header, a dialog's backdrop over the page, and wrapping onto more lines at 200 % text. Prefer no finding to a speculative one.
4. A finding the change caused is fixed in the PR; one it did not cause goes to Jakub with its screen, and stays out of `known-findings.ts` until he decides.

## Headers
The dev server sends no security headers; `npm run e2e` serves the production build with the headers of `nginx-security-headers.conf` (`scripts/serve-dist.mjs`) and fails a test on any CSP or Trusted Types violation (`e2e/fixtures.ts`, `cspViolations`), so the suite already covers what its journeys open. Still, a change to the Content-Security-Policy, to `nginx.conf`, or anything that adds an inline script, an external resource or a new kind of embed is checked against the production nginx:
1. `npm run build`; pull `nginx:1.30-alpine` (in the cloud `mirror.gcr.io/library/nginx:1.30-alpine`, tagged back) or whatever `frontend/Dockerfile` names.
2. `docker run -d --name nfnn-nginx -p 8089:80 --add-host backend:127.0.0.1 --add-host mcp:127.0.0.1 -v "$PWD/dist/frontend/browser:/usr/share/nginx/html:ro" -v "$PWD/nginx.conf:/etc/nginx/conf.d/default.conf:ro" -v "$PWD/nginx-security-headers.conf:/etc/nginx/snippets/security-headers.conf:ro" -v "$(mktemp -d):/logs" nginx:1.30-alpine` (nginx exits on an unresolvable upstream or a missing `/logs`; compare the mount targets with `frontend/Dockerfile`).
3. `E2E_BASE_URL=http://localhost:8089 npm run e2e` (the tests mock `/api`) with a throwaway spec that opens the pages you changed that no journey reaches: the fixture fails it on any violation a page reports. `curl -sI http://localhost:8089/` shows the headers. Then `docker rm -f nfnn-nginx`.
