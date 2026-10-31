---
name: cloud-session
description: Prepare a claude.ai cloud container to build and test nfnn - Node 24 for Angular, Playwright's Chromium, a Maven Central mirror and UTF-8 locale for Gradle, dockerd for Testcontainers, the production nginx for header checks
---
# Building and testing in a cloud session

Verified 2026-10-23. Cloud containers start from a fresh clone; the session-start hook (single-repository cloud sessions) installs Node 24 when needed and runs `npm ci` in `frontend/` and `mcp/`; a claude.ai project thread runs no hooks at all.

## Node 24 (frontend and connector)
The image ships Node 22.22.0, below Angular 22's minimum (`^22.22.3 || ^24.15 || >=26`): every `ng` command refuses to start. Where the hook did not run, run it by hand from the repository root; it installs the current Node 24 into `/opt/node24`, links it into `~/.local/bin` (before `/opt/node22/bin` on `PATH`) and runs `npm ci` in `frontend/` and `mcp/`:
```bash
CLAUDE_CODE_REMOTE=true CLAUDE_PROJECT_DIR=$PWD bash .claude/hooks/session-start.sh && hash -r && node -v
```
Run `npm ci` again after a merge to `main` that changed a `package-lock.json`, or `format:check` may pass locally on an older Prettier than CI's.

## Playwright
The preinstalled Chromium (`/opt/pw-browsers`) is older than the build Playwright pins, so `npm run e2e` reports a missing executable: run `npx playwright install --with-deps --only-shell chromium webkit` once (headless runs need only Chromium's headless shell, not the full browser; WebKit is for the `iphone` project, and `--with-deps` installs its system libraries, about a minute). `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD` only stops the npm postinstall, not this.

## Gradle (backend)
1. Maven Central answers HTTP 429 from the cloud. Write `/tmp/mirror.gradle.kts`:
   ```kotlin
   val mirror = "https://maven-central.storage-download.googleapis.com/maven2/"
   settingsEvaluated { pluginManagement.repositories { removeAll { it.name == "MavenRepo" }; maven(url = mirror); gradlePluginPortal() } }
   allprojects {
       buildscript.repositories { removeAll { it.name == "MavenRepo" }; maven(url = mirror); gradlePluginPortal() }
       repositories { removeAll { it.name == "MavenRepo" }; maven(url = mirror) }
   }
   ```
   and add `--init-script /tmp/mirror.gradle.kts` to every `./gradlew` call. Keeping `mavenCentral()` next to the mirror is not enough: a version range (`io.cucumber:query`) queries every repository. The mirror lags fresh releases by days; when a just-released version is missing, test against the previous one and let CI run the new one, and say so in the PR.
2. Run Gradle as `LC_ALL=C.UTF-8 LANG=C.UTF-8 ./gradlew …` (run `./gradlew --stop` first if a daemon started without it): with the POSIX locale the test report fails on the Czech scenario names ("Kč") and the build fails even when every test passed. Gradle's foojay toolchain downloads JDK 25 by itself.
3. ArchUnit or single classes, no Docker: `./gradlew test --tests "*architecture*" -PnoCucumber --init-script /tmp/mirror.gradle.kts`.
4. Everything (Testcontainers, Cucumber): start Docker as root with `dockerd > /tmp/dockerd.log 2>&1 &` and wait until `docker info` answers (a restart of the container stops it; start it again). Docker Hub rate-limits, so `docker pull mirror.gcr.io/library/postgres:17-alpine && docker tag mirror.gcr.io/library/postgres:17-alpine postgres:17-alpine`, then `TESTCONTAINERS_HUB_IMAGE_NAME_PREFIX=mirror.gcr.io/ LC_ALL=C.UTF-8 LANG=C.UTF-8 ./gradlew test --init-script /tmp/mirror.gradle.kts` (Ryuk comes through the mirror too). On the 4-core container the whole run takes about 3 minutes when the container is quiet and up to 6 when other sessions load it (measured 2026-10-29; 14 to 19 minutes before the test hasher, the Awaitility defaults and the forks): the `test` task first, then `acceptanceTest`, each on two forks with a PostgreSQL container per fork and context. One context's scenarios: `CUCUMBER_FILTER_TAGS=@<tag> … ./gradlew acceptanceTest`, about a minute plus the context start. Results sit in `build/test-results/{test,acceptanceTest}/`, test logs inside the result XML's `system-out`.
   Several agents share one container: run the full suite under `flock /tmp/nfnn-full-suite.lock` (skill `thread-workflow`).
5. `docker build` has no registry access for `npm ci` or Gradle inside the build; the PR check builds the images.
