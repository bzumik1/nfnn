---
name: backend-in-cloud
description: Run the backend's Gradle build and tests in a claude.ai cloud session, where Maven Central rate-limits and the Docker daemon is not running
---
# Backend tests in a cloud session

Verified 2026-10-22. Gradle's foojay toolchain downloads JDK 25 by itself (`~/.gradle/jdks`); nothing to install.

1. Maven Central answers HTTP 429 from the cloud, which disables the repository for the build. Write `/tmp/mirror.gradle.kts`:
   ```kotlin
   val mirror = "https://maven-central.storage-download.googleapis.com/maven2/"
   settingsEvaluated { pluginManagement.repositories { removeAll { it.name == "MavenRepo" }; maven(url = mirror); gradlePluginPortal() } }
   allprojects {
       buildscript.repositories { removeAll { it.name == "MavenRepo" }; maven(url = mirror); gradlePluginPortal() }
       repositories { removeAll { it.name == "MavenRepo" }; maven(url = mirror) }
   }
   ```
   and add `--init-script /tmp/mirror.gradle.kts` to every `./gradlew` call. Keeping `mavenCentral()` next to the mirror is not enough: a version range (`io.cucumber:query`) queries every repository.
2. ArchUnit or single classes, no Docker: `./gradlew test --tests "*architecture*" -PnoCucumber --init-script /tmp/mirror.gradle.kts` (`-PnoCucumber` leaves out the Cucumber suite, which `--tests` cannot filter and which would otherwise run every scenario).
3. Everything (Testcontainers, Cucumber): start Docker as root with `dockerd > /tmp/dockerd.log 2>&1 &` and wait until `docker info` answers. Docker Hub rate-limits, so `docker pull mirror.gcr.io/library/postgres:17-alpine && docker tag mirror.gcr.io/library/postgres:17-alpine postgres:17-alpine`, then `TESTCONTAINERS_HUB_IMAGE_NAME_PREFIX=mirror.gcr.io/ ./gradlew test --init-script /tmp/mirror.gradle.kts` (Ryuk comes through the mirror too).
4. `docker build` has no registry access in the cloud; the PR check builds the images.
