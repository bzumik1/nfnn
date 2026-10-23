---
name: cloud-session
description: Prepare a claude.ai cloud container to build and test nfnn - Node 24 for Angular, Playwright's Chromium, a Maven Central mirror and UTF-8 locale for Gradle, dockerd for Testcontainers, the production nginx for header checks
---
# Building and testing in a cloud session

Verified 2026-10-23. Cloud containers start from a fresh clone; the session-start hook installs the frontend's dependencies only in a single-repository session, and a claude.ai project thread runs no hooks at all.

## Node 24 (frontend and connector)
The image ships Node 22.22.0, below Angular 22's minimum (`^22.22.3 || ^24.15 || >=26`): every `ng` command refuses to start. Install the current Node 24 once and put it first on `PATH` (`/root/.local/bin` comes before `/opt/node22/bin`):
```bash
base=https://nodejs.org/dist/latest-v24.x
v=$(curl -sS $base/SHASUMS256.txt | grep -o 'node-v24[^ ]*-linux-x64\.tar\.xz')
cd /tmp && curl -sSO $base/$v && curl -sS $base/SHASUMS256.txt | grep " $v\$" | sha256sum -c - \
  && mkdir -p /opt/node24 && tar -xJf $v -C /opt/node24 --strip-components=1 \
  && ln -sf /opt/node24/bin/node /opt/node24/bin/npm /opt/node24/bin/npx /root/.local/bin/ && hash -r && node -v
```
Then `npm ci` in `frontend/` and `mcp/`. Run `npm ci` again after a merge to `main` that changed a `package-lock.json`, or `format:check` may pass locally on an older Prettier than CI's.

## Playwright
The preinstalled Chromium (`/opt/pw-browsers`) is older than the build Playwright pins, so `npm run e2e` reports a missing executable: run `npx playwright install chromium` once (about 2 minutes). `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD` only stops the npm postinstall, not this.

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
4. Everything (Testcontainers, Cucumber): start Docker as root with `dockerd > /tmp/dockerd.log 2>&1 &` and wait until `docker info` answers (a restart of the container stops it; start it again). Docker Hub rate-limits, so `docker pull mirror.gcr.io/library/postgres:17-alpine && docker tag mirror.gcr.io/library/postgres:17-alpine postgres:17-alpine`, then `TESTCONTAINERS_HUB_IMAGE_NAME_PREFIX=mirror.gcr.io/ LC_ALL=C.UTF-8 LANG=C.UTF-8 ./gradlew test --init-script /tmp/mirror.gradle.kts` (Ryuk comes through the mirror too). Test logs sit inside the result XML's `system-out`.
5. `docker build` has no registry access for `npm ci` or Gradle inside the build; the PR check builds the images.
