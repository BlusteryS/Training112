# syntax=docker/dockerfile:1
FROM python:3.12-slim-bookworm
COPY --from=ghcr.io/astral-sh/uv:0.8.15 /uv /usr/local/bin/uv
RUN apt-get update && apt-get install -y --no-install-recommends git build-essential libsndfile1 libgomp1 \
    && rm -rf /var/lib/apt/lists/*
ENV UV_LINK_MODE=copy \
    UV_PROJECT_ENVIRONMENT=/opt/speech \
    PYTHONUNBUFFERED=1 \
    HF_HOME=/app/.models/huggingface \
    PATH=/opt/speech/bin:$PATH
WORKDIR /app
COPY qwen /opt/qwen-project
RUN --mount=type=cache,target=/root/.cache/uv \
    UV_PROJECT_ENVIRONMENT=/opt/qwen uv sync --project /opt/qwen-project --frozen --no-dev
COPY pyproject.toml uv.lock ./
RUN --mount=type=cache,target=/root/.cache/uv uv sync --frozen --no-dev --no-install-project
COPY src ./src
RUN --mount=type=cache,target=/root/.cache/uv uv sync --frozen --no-dev
COPY config ./config
COPY assets ./assets
RUN useradd --uid 10001 --create-home speech && mkdir -p /app/.models && chown speech:speech /app/.models
USER speech
EXPOSE 5555
COPY --chmod=755 entrypoint.sh /app/entrypoint.sh
ENTRYPOINT ["/app/entrypoint.sh"]
