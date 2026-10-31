# syntax=docker/dockerfile:1.7

FROM eclipse-temurin:25-jdk AS build
WORKDIR /workspace
ENV GRADLE_USER_HOME=/workspace/.gradle-home
COPY gradlew settings.gradle.kts build.gradle.kts ./
COPY gradle ./gradle
RUN ./gradlew --no-daemon --init-script gradle/download-dependencies.init.gradle.kts downloadDependencies || true
COPY src ./src
RUN ./gradlew --no-daemon clean bootJar -x test
RUN library=$(jar tf /workspace/build/libs/*.jar | grep '^BOOT-INF/lib/webp-imageio-[^/]*\.jar$') \
    && native="native/Linux/$(uname -m)/libwebp-imageio.so" \
    && mkdir -p /workspace/webp && cd /workspace/webp \
    && jar xf /workspace/build/libs/*.jar "$library" \
    && jar xf "$library" "$native" \
    && install -D -m 0644 "$native" /workspace/native/libwebp-imageio.so

FROM eclipse-temurin:25-jre
ARG REVISION=dev
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends age openssl && rm -rf /var/lib/apt/lists/* \
    && groupadd --system app && useradd --system --gid app --home-dir /app app
COPY --from=build /workspace/build/libs/*.jar app.jar
COPY --from=build /workspace/native/ /app/native/
COPY --chmod=0755 docker-entrypoint.sh /app/docker-entrypoint.sh
ENV APP_REVISION=$REVISION
EXPOSE 8080
ENTRYPOINT ["/app/docker-entrypoint.sh"]
