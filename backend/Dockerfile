# syntax=docker/dockerfile:1.7

FROM eclipse-temurin:25-jdk AS build
WORKDIR /workspace
ENV GRADLE_USER_HOME=/workspace/.gradle-home
COPY gradlew settings.gradle.kts build.gradle.kts ./
COPY gradle ./gradle
RUN ./gradlew --no-daemon --init-script gradle/download-dependencies.init.gradle.kts downloadDependencies || true
COPY src ./src
RUN ./gradlew --no-daemon clean bootJar -x test
RUN java -Djarmode=tools -jar /workspace/build/libs/*.jar extract --destination /workspace/extracted \
    && mv /workspace/extracted/*.jar /workspace/extracted/app.jar
RUN library=$(jar tf /workspace/build/libs/*.jar | grep '^BOOT-INF/lib/webp-imageio-[^/]*\.jar$') \
    && native="native/Linux/$(uname -m)/libwebp-imageio.so" \
    && mkdir -p /workspace/webp && cd /workspace/webp \
    && jar xf /workspace/build/libs/*.jar "$library" \
    && jar xf "$library" "$native" \
    && install -D -m 0644 "$native" /workspace/native/libwebp-imageio.so

FROM eclipse-temurin:25-jre AS runtime
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends age openssl && rm -rf /var/lib/apt/lists/* \
    && groupadd --system app && useradd --system --gid app --home-dir /app app
COPY --from=build /workspace/extracted/lib/ /app/lib/
COPY --from=build /workspace/extracted/app.jar /app/app.jar
COPY --from=build /workspace/native/ /app/native/

FROM runtime AS aot-training
RUN --network=none java -XX:+UseSerialGC -Xmx768m -Xms256m -XX:MetaspaceSize=160m --enable-native-access=ALL-UNNAMED \
    -Djava.library.path=/app/native -Dcom.luciad.imageio.webp.tmpdir=/app/native \
    -XX:AOTCacheOutput=/app/app.aot -Dspring.context.exit=onRefresh -jar /app/app.jar \
    --spring.liquibase.enabled=false --spring.jpa.hibernate.ddl-auto=none \
    --spring.jpa.properties.hibernate.boot.allow_jdbc_metadata_access=false \
    --spring.jpa.database-platform=org.hibernate.dialect.PostgreSQLDialect --spring.sql.init.mode=never \
    && test -s /app/app.aot

FROM runtime
COPY --from=aot-training /app/app.aot /app/app.aot
COPY --chmod=0755 docker-entrypoint.sh /app/docker-entrypoint.sh
ARG REVISION=dev
ENV APP_REVISION=$REVISION
EXPOSE 8080
ENTRYPOINT ["/app/docker-entrypoint.sh"]
