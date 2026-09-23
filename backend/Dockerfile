# syntax=docker/dockerfile:1
FROM eclipse-temurin:25-jdk-alpine AS build
WORKDIR /build
COPY backend/gradlew backend/settings.gradle.kts backend/build.gradle.kts backend/gradle.properties ./
COPY backend/gradle ./gradle
COPY backend/src ./src
COPY speech/src/speech112/contracts /speech/src/speech112/contracts
RUN --mount=type=cache,target=/root/.gradle ./gradlew --no-daemon --max-workers=2 installDist

FROM eclipse-temurin:25-jre-alpine
RUN addgroup -S app && adduser -S -G app app
WORKDIR /app
COPY --from=build --chown=app:app /build/build/install/training112-backend/ ./
ENV PATH="/app/bin:${PATH}"
USER app
EXPOSE 8080
ENTRYPOINT []
CMD ["training112-backend"]
