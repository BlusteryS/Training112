# syntax=docker/dockerfile:1
FROM eclipse-temurin:25-jdk-alpine AS build
WORKDIR /build
COPY backend/gradlew backend/settings.gradle.kts backend/build.gradle.kts backend/gradle.properties ./
COPY backend/gradle ./gradle
COPY backend/src ./src
RUN --mount=type=cache,target=/root/.gradle \
    ./gradlew --no-daemon --max-workers=1 -Dorg.gradle.jvmargs="-Xmx256m -XX:MaxMetaspaceSize=256m" installDist

FROM eclipse-temurin:25-jre-alpine
RUN addgroup -S app && adduser -S -G app app
WORKDIR /app
COPY --from=build --chown=app:app /build/build/install/training112-backend/ ./
USER app
EXPOSE 8080
ENTRYPOINT ["java", "-XX:MaxRAMPercentage=65", "-XX:+ExitOnOutOfMemoryError", "-cp", "/app/lib/*", "com.training112.Main"]
