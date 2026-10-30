# syntax=docker/dockerfile:1.7

FROM eclipse-temurin:25-jdk AS build
WORKDIR /workspace
ENV GRADLE_USER_HOME=/workspace/.gradle-home
COPY gradlew settings.gradle.kts build.gradle.kts ./
COPY gradle ./gradle
RUN ./gradlew --no-daemon --init-script gradle/download-dependencies.init.gradle.kts downloadDependencies || true
COPY src ./src
RUN ./gradlew --no-daemon clean bootJar -x test

FROM eclipse-temurin:25-jre
ARG REVISION=dev
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends age && rm -rf /var/lib/apt/lists/* \
    && groupadd --system app && useradd --system --gid app --home-dir /app app
COPY --from=build /workspace/build/libs/*.jar app.jar
COPY --chmod=0755 docker-entrypoint.sh /app/docker-entrypoint.sh
ENV APP_REVISION=$REVISION
EXPOSE 8080
ENTRYPOINT ["/app/docker-entrypoint.sh"]
