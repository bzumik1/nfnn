---
name: visual-check-in-cloud
description: How to screenshot donor-dashboard UI in a cloud session using the preinstalled Chromium and the existing e2e mocks
metadata:
  type: reference
---

Cloud sessions have Chromium preinstalled in `/opt/pw-browsers` (`PLAYWRIGHT_BROWSERS_PATH` is set); never run `playwright install`. A throwaway spec in `frontend/e2e/` can reuse `mockDonorApi` + `signIn` from `e2e/donor-session.ts` and override a route afterwards (later `page.route` wins). Delete the spec and `frontend/test-results/` afterwards.

Gotchas: `signIn` clicks `.nav-login`, which is hidden on phones, so sign in at 1280 px and resize after. `app-dialog` fades in, so wait ~600 ms before a dialog screenshot.

Related: [[dashboard-design-conventions]]
