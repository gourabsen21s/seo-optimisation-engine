from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="SEO_", env_file=".env", extra="ignore")

    environment: str = "development"  # development | production
    database_url: str = "sqlite+aiosqlite:///./seo_engine.db"
    # Redis for the arq job queue. Empty = run jobs in-process (single-node / development).
    redis_url: str = ""
    # Comma-separated list of API keys accepted by the HTTP API.
    api_keys: str = ""
    # Fernet key used to encrypt connector credentials at rest.
    # Generate with: python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
    secret_key: str = ""

    user_agent: str = "SEOEngineBot/1.0 (+https://github.com/seo-engine)"
    max_pages: int = 300
    crawl_concurrency: int = 8
    request_timeout: float = 20.0
    external_link_check_limit: int = 150
    # Block crawling of private/loopback addresses (SSRF protection). Only disable for local testing.
    allow_private_networks: bool = False

    # Default LLM, as "<provider>:<model>". Providers: anthropic, openai, google, groq,
    # mistral, ollama, openai-compatible. Overridable at runtime from the UI Settings page.
    llm_model: str = "anthropic:claude-opus-5"
    # Only used for "openai-compatible" / "ollama" providers (OpenRouter, vLLM, LM Studio, ...).
    llm_base_url: str = ""
    # Optional explicit key; otherwise the provider's standard env var is used
    # (ANTHROPIC_API_KEY, OPENAI_API_KEY, GOOGLE_API_KEY, GROQ_API_KEY, MISTRAL_API_KEY).
    llm_api_key: str = ""
    ai_concurrency: int = 4
    ai_max_pages: int = 60
    agent_request_limit: int = 60
    pagespeed_api_key: str = ""
    pagespeed_sample: int = 3

    job_timeout_seconds: int = 3 * 3600
    scheduler_enabled: bool = True
    scheduler_interval_seconds: int = 600
    # Days after applying a fix before its ranking impact is measured (and auto-rolled back if worse).
    impact_window_days: int = 14
    # ---- memory + context engine (Mem0 + Qdrant + FastEmbed)
    data_dir: str = "./data"
    # Qdrant server URL (required when API and worker run as separate processes). Empty = embedded, on disk.
    qdrant_url: str = ""
    qdrant_api_key: str = ""
    embedder: str = "fastembed"  # fastembed (local model) | hash (offline, tests)
    embed_model: str = "BAAI/bge-small-en-v1.5"
    memory_enabled: bool = True
    # ---- workforce
    task_concurrency: int = 3
    task_request_limit: int = 25
    max_tasks_per_cycle: int = 25
    max_task_depth: int = 3
    judge_model: str = "typesafe:jev-latest"
    judge_api_key: str = ""
    # Daily cap on LLM tokens (input + output) across all employees and chat. 0 = unlimited.
    llm_daily_token_budget: int = 0

    # ---- research integrations (all optional; overridable from the UI → Workspace settings → Integrations)
    # Live Google results for rank checks, SERP and competitor research: serper | serpapi | brave
    serp_provider: str = ""
    serp_api_key: str = ""
    serp_country: str = "us"
    serp_language: str = "en"
    # Domain authority (free key at openpagerank.com)
    openpagerank_api_key: str = ""
    # IndexNow key (Bing, Yandex, Seznam…). The engine proposes hosting /<key>.txt on the site.
    indexnow_key: str = ""
    research_cache_ttl_seconds: int = 3600

    # ---- code engineering (Aider runs in its own environment; see README → Code edits)
    aider_path: str = ""  # default: `aider` on PATH, else ./.tools/aider/bin/aider
    aider_timeout_seconds: int = 900
    workspace_max_mb: int = 400
    # Let the Web Engineer run the site's own build/lint/test scripts. This executes repository code on this
    # server — enable only inside a container/sandbox.
    code_execution_enabled: bool = False

    # ---- notifications
    public_url: str = ""  # where the UI is reachable, for links in notifications
    slack_webhook_url: str = ""
    notify_webhook_url: str = ""
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from: str = ""
    notify_email: str = ""

    cors_origins: list[str] = Field(default_factory=list)
    # Built web UI. Defaults to ./frontend/dist (repo checkout or Docker image working directory).
    frontend_dist: str = ""

    @property
    def api_key_list(self) -> list[str]:
        return [k.strip() for k in self.api_keys.split(",") if k.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
