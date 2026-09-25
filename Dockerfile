# syntax=docker/dockerfile:1.7

# ---------- web UI ----------
FROM node:22-alpine AS web
WORKDIR /web
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

# ---------- Python app ----------
FROM python:3.12-slim AS app
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PYDANTIC_AI_NO_BANNER=1 \
    MEM0_TELEMETRY=False \
    FASTEMBED_CACHE_PATH=/opt/fastembed \
    XDG_CACHE_HOME=/opt/cache \
    SEO_AIDER_PATH=/opt/aider/bin/aider \
    SEO_ENVIRONMENT=production

# git + ripgrep power the Web Engineer's code workspaces and search; Node lets it run site builds (opt-in).
RUN apt-get update \
    && apt-get install -y --no-install-recommends git ripgrep ca-certificates nodejs npm \
    && rm -rf /var/lib/apt/lists/*

# Aider (open-source coding agent) in its own virtualenv so its pins never clash with the app's.
RUN python -m venv /opt/aider && /opt/aider/bin/pip install aider-chat \
    && /opt/aider/bin/aider --version

RUN useradd --create-home --uid 10001 app
WORKDIR /app

COPY pyproject.toml README.md ./
COPY seo_engine ./seo_engine
RUN pip install ".[postgres]"
# Bake the local embedding model into the image (memory + context engine work offline, no API key).
RUN python -c "from fastembed import TextEmbedding; TextEmbedding('BAAI/bge-small-en-v1.5')" \
    && chmod -R a+rX /opt/fastembed
# Pre-fetch tree-sitter grammars used for code outlines/syntax checks (no downloads at runtime).
RUN python -c "from tree_sitter_language_pack import get_parser; [get_parser(l) for l in ('html','javascript','typescript','tsx','css','scss','json','yaml','toml','markdown','astro','vue','svelte','php','python','ruby','go','liquid','twig')]" \
    && chmod -R a+rX /opt/cache

COPY alembic.ini ./
COPY migrations ./migrations
COPY wordpress ./wordpress
COPY --from=web /web/dist ./frontend/dist
RUN mkdir -p /app/data && chown app:app /app/data

USER app
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/healthz', timeout=4)"

# Apply migrations, then serve API + UI.
CMD ["sh", "-c", "seo-engine migrate && exec seo-engine serve --workers ${WEB_CONCURRENCY:-2}"]
