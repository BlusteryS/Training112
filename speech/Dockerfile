# syntax=docker/dockerfile:1
FROM python:3.13-slim-bookworm
COPY --from=ghcr.io/astral-sh/uv:0.12.15 /uv /usr/local/bin/uv
RUN apt-get update && apt-get install -y --no-install-recommends libsndfile1 libgomp1 \
    && rm -rf /var/lib/apt/lists/*
ENV UV_LINK_MODE=copy UV_PROJECT_ENVIRONMENT=/opt/speech PYTHONUNBUFFERED=1 \
    PATH=/opt/speech/bin:$PATH HF_HUB_OFFLINE=1 OMP_NUM_THREADS=1 OPENBLAS_NUM_THREADS=1
WORKDIR /app
COPY speech/pyproject.toml speech/uv.lock ./
RUN --mount=type=cache,target=/root/.cache/uv uv sync --frozen --no-dev --no-install-project
COPY speech/src ./src
RUN --mount=type=cache,target=/root/.cache/uv uv sync --frozen --no-dev
COPY speech/config ./config
COPY speech/assets ./assets
RUN --mount=type=cache,target=/root/.cache/speech-downloads \
    training112-install-models --directory /app/.models
RUN useradd --uid 10001 --create-home speech && mkdir -p /app/.cache/audio && chown -R speech:speech /app
USER speech
