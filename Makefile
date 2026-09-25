.PHONY: install tools dev web test lint fmt migrate up down logs

PY ?= .venv/bin/python

install:            ## Create venv and install backend + frontend deps
	python3 -m venv .venv
	$(PY) -m pip install -e ".[dev,postgres]"
	cd frontend && npm install

tools:              ## Install Aider (code edits) in an isolated env at ./.tools/aider
	uv venv .tools/aider --python 3.12 && uv pip install --python .tools/aider/bin/python aider-chat

dev:                ## Run API (with in-process jobs + scheduler) on :8000
	$(PY) -m seo_engine.cli serve --reload

web:                ## Run the UI dev server on :5173 (proxies /api to :8000)
	cd frontend && npm run dev

test:               ## Backend tests
	$(PY) -m pytest -q

lint:               ## Ruff + TypeScript checks
	$(PY) -m ruff check seo_engine tests migrations
	cd frontend && npm run typecheck

fmt:
	$(PY) -m ruff check --fix seo_engine tests migrations

migrate:            ## Apply database migrations
	$(PY) -m seo_engine.cli migrate

up:                 ## Production stack: app + worker + Postgres + Redis
	docker compose up -d --build

down:
	docker compose down

logs:
	docker compose logs -f app worker
