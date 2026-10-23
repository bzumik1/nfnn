# syntax=docker/dockerfile:1.7

FROM eclipse-temurin:25-jdk AS build
WORKDIR /workspace
COPY gradlew settings.gradle.kts build.gradle.kts ./
COPY gradle ./gradle
RUN --mount=type=cache,target=/root/.gradle ./gradlew --no-daemon dependencies || true
COPY src ./src
RUN --mount=type=cache,target=/root/.gradle ./gradlew --no-daemon clean bootJar -x test

FROM eclipse-temurin:25-jre
WORKDIR /app
RUN groupadd --system app && useradd --system --gid app --home-dir /app app
COPY --from=build /workspace/build/libs/*.jar app.jar
COPY --chmod=0755 docker-entrypoint.sh /app/docker-entrypoint.sh
USER app
EXPOSE 8080
ENTRYPOINT ["/app/docker-entrypoint.sh"]
