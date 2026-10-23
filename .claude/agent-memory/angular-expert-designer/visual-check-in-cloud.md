---
name: visual-check-in-cloud
description: How to screenshot UI in a cloud session using the e2e mocks; the setup lives in skills cloud-session and visual-check
metadata:
  type: reference
---

Cloud sessions need Node 24 first (the image's Node 22.22.0 is too old for `ng`) and `npx playwright install chromium` once (the preinstalled `/opt/pw-browsers` build is older than Playwright's pin): skill `cloud-session`. A throwaway spec in `frontend/e2e/` reuses `mockDonorApi` + `signIn` from `e2e/donor-session.ts` and overrides routes afterwards (a later `page.route` wins); delete the spec and `frontend/test-results/` afterwards (skill `visual-check`).

Gotchas: `signIn` clicks `.nav-login`, which is hidden on phones, so sign in at 1280 px and resize after. Dialogs animate in: wait for the dialog to be visible and shoot with `animations: 'disabled'`.
