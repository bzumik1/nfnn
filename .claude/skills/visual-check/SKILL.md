---
name: visual-check
description: Screenshot a UI change at 390 and 1280 px with Playwright and the e2e API mocks, before and after, to audit it and attach it to the PR
---
# Visual check of a UI change

Jakub wants before/after screenshots of every visible change (2026-10-18); audit them yourself before handing over.

1. `cd frontend && npm ci` once. When Playwright reports a missing browser build, `npx playwright install chromium` once (cloud sessions ship an older Chromium than the pin); locally `npm run e2e:install` once.
2. Write a throwaway spec `frontend/e2e/zz-shot.spec.ts`: `mockDonorApi(page, …)` and `signIn(page)` from `e2e/donor-session.ts` (sign in at 1280 px; the header button is hidden on phones), then `page.route` overrides for the state you need (a later route wins), `page.setViewportSize` 390×844 and 1280×900, `page.screenshot({ path, fullPage: true })`. Dialogs fade in: wait ~600 ms before shooting one.
3. `npx playwright test e2e/zz-shot.spec.ts` (the config starts `ng serve`). For the "before", run the same spec on `main` (`git stash` or a worktree).
4. Look at each image at real size and zoomed in: cut-offs, overlaps, wrapping, contrast, focus ring, Czech typography (`1 000 Kč`, dates). Fix and reshoot until clean.
5. Delete the spec and `frontend/test-results/`. Attach the images to the PR; in a claude.ai project also save them under `/mnt/project-files/nfnn-ux/snimky/<change>/` and attach them to the reply.
