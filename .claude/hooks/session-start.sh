#!/usr/bin/env bash
# SessionStart hook: a cloud session starts from a fresh clone, so install the
# frontend's dependencies once. Playwright's browser build is not installed
# here: when npm run e2e reports it missing, run npx playwright install
# chromium once. Does nothing on a local machine.
[ "$CLAUDE_CODE_REMOTE" = "true" ] || exit 0
cd "${CLAUDE_PROJECT_DIR:-$(dirname "$0")/../..}/frontend" || exit 0
if [ ! -f node_modules/.package-lock.json ] || [ package-lock.json -nt node_modules/.package-lock.json ]; then
  npm ci --no-audit --no-fund --loglevel=error >/dev/null 2>&1 \
    || echo "npm ci failed in frontend/; run it before npm start, npm test or npm run e2e"
fi
exit 0
