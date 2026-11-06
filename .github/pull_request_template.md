## What and why

<!-- What the PR changes and why: the decision, slice or issue behind it. Name a new port, endpoint, dependency or breaking schema or API change here (CLAUDE.md, .claude/rules). -->

## How it was verified

<!-- The commands of CLAUDE.md "Done means" you actually ran, each with its outcome, for every part the PR touches: -->
<!-- backend: ./gradlew test (or, only without Docker, --tests "*architecture*" -PnoCucumber plus the touched classes, and say so) -->
<!-- frontend: npm run format:check && npm run lint && npm run lint:styles && npm test -- --watch=false && npm run build && npm run e2e && npm run e2e:pwa -->
<!-- connector: npm run check && npm run build -->
<!-- Then what could not be run and why (CI runs it, no Docker, no Mac with Xcode), and the tests written first that failed before the change. -->

## Screenshots

<!-- A visible UI change: before and after at 390 and 1280 px of each changed route or state (skill visual-check). Otherwise write: None, nothing visible changes. -->

## Steps on the server by hand

<!-- What reaches the server only by hand: a changed deploy/compose.yml (uninstall + Custom Install), a new setting to enter, Nginx Proxy Manager, Cloudflare, Fio. Otherwise write: None. -->

## Srovnání s v2

<!-- Paste the report of the compare-v2 job (its job summary or the artifact srovnani-s-v2). If CI runs no jobs (only docs/, .claude/ or Markdown), say so instead. -->

<!-- The two lines below are read by CI, each only as a whole line of its own. Replace each comment, keeping the word before the colon: -->
<!-- roadmap: write "beze změny" after the colon when docs/roadmap.md does not change; when it changes, delete the line. Left as it is, roadmap-check fails. -->
<!-- look: write "beze změny" after the colon, or rewrite the line as "Vzhled se mění: /sprava/platby, /darce/*, sign-in-dialog" (routes or states of the screens spec). Left as it is, nothing may differ on the screens. -->
<!-- pr-check has no trigger on an edited description: after editing the look line, push again or use "Re-run all jobs" (re-running only the failed job keeps the old reading). -->

Roadmapa: <!-- beze změny -->
Vzhled: <!-- beze změny -->
