#!/usr/bin/env bash
# SessionStart hook: a cloud session starts from a fresh clone. Puts Node 24
# first on PATH when the image's Node is too old for Angular 22, then installs
# the frontend's and the connector's dependencies. Playwright's browser build
# is not installed here: run npx playwright install chromium once (skill
# cloud-session). Does nothing on a local machine; a claude.ai project thread
# runs no hooks, so there the skill's steps are done by hand.
[ "$CLAUDE_CODE_REMOTE" = "true" ] || exit 0
root="${CLAUDE_PROJECT_DIR:-$(dirname "$0")/../..}"

if ! node -e 'const [a,b,c]=process.versions.node.split(".").map(Number);process.exit((a===22&&(b>22||b===22&&c>=3))||(a===24&&b>=15)||a>=26?0:1)' 2>/dev/null; then
  base=https://nodejs.org/dist/latest-v24.x
  v=$(curl -fsS "$base/SHASUMS256.txt" | grep -o 'node-v24[^ ]*-linux-x64\.tar\.xz')
  if [ -n "$v" ] && cd /tmp && curl -fsSO "$base/$v" && curl -fsS "$base/SHASUMS256.txt" | grep " $v\$" | sha256sum -c - >/dev/null \
    && mkdir -p /opt/node24 "$HOME/.local/bin" && tar -xJf "$v" -C /opt/node24 --strip-components=1; then
    ln -sf /opt/node24/bin/node /opt/node24/bin/npm /opt/node24/bin/npx "$HOME/.local/bin/"
    [ -n "$CLAUDE_ENV_FILE" ] && echo "export PATH=\"$HOME/.local/bin:\$PATH\"" >> "$CLAUDE_ENV_FILE"
    export PATH="$HOME/.local/bin:$PATH"
  else
    echo "Could not install Node 24; Angular 22 needs Node ^22.22.3, ^24.15 or >= 26 (skill cloud-session)"
  fi
fi

for dir in frontend mcp; do
  cd "$root/$dir" || continue
  if [ ! -f node_modules/.package-lock.json ] || [ package-lock.json -nt node_modules/.package-lock.json ]; then
    npm ci --no-audit --no-fund --loglevel=error >/dev/null 2>&1 \
      || echo "npm ci failed in $dir/; run it before npm start, npm test or npm run check"
  fi
done
exit 0
