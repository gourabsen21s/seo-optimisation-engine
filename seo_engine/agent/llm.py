"""Provider-agnostic LLM configuration → PydanticAI model.

Any "<provider>:<model>" string PydanticAI understands works (anthropic, openai, google-gla, groq, mistral,
deepseek, xai, bedrock, azure, openrouter, ollama, together, fireworks, cerebras, ...). An explicit API key
and/or base URL can be supplied from the UI; otherwise the provider's standard environment variable is used.
Anything that speaks the OpenAI Chat Completions API (vLLM, LM Studio, LiteLLM proxy, ...) works through
"openai-compatible:<model>" plus a base URL.
"""

from __future__ import annotations

from pydantic import BaseModel
from pydantic_ai.models import Model, infer_model

PROVIDERS = [
    {"id": "anthropic", "label": "Anthropic (Claude)", "example": "claude-opus-5", "env": "ANTHROPIC_API_KEY"},
    {"id": "openai", "label": "OpenAI", "example": "gpt-5", "env": "OPENAI_API_KEY"},
    {"id": "google-gla", "label": "Google Gemini", "example": "gemini-2.5-pro", "env": "GOOGLE_API_KEY"},
    {"id": "groq", "label": "Groq", "example": "llama-3.3-70b-versatile", "env": "GROQ_API_KEY"},
    {"id": "mistral", "label": "Mistral", "example": "mistral-large-latest", "env": "MISTRAL_API_KEY"},
    {"id": "deepseek", "label": "DeepSeek", "example": "deepseek-chat", "env": "DEEPSEEK_API_KEY"},
    {"id": "xai", "label": "xAI (Grok)", "example": "grok-4", "env": "XAI_API_KEY"},
    {"id": "openrouter", "label": "OpenRouter (any model)", "example": "anthropic/claude-opus-5",
     "env": "OPENROUTER_API_KEY"},
    {"id": "typesafe", "label": "TypeSafe Jev (typed decisions only — use as Judge)", "example": "jev-latest",
     "env": "TYPESAFE_API_KEY"},
    {"id": "ollama", "label": "Ollama (local)", "example": "llama3.3", "env": "OLLAMA_BASE_URL"},
    {"id": "openai-compatible", "label": "OpenAI-compatible endpoint (vLLM, LM Studio, LiteLLM)",
     "example": "my-model", "env": ""},
]


class LLMConfig(BaseModel):
    model: str = "anthropic:claude-opus-5"  # "<provider>:<model name>"
    api_key: str = ""
    base_url: str = ""
    temperature: float | None = None
    max_tokens: int = 8000

    @property
    def provider(self) -> str:
        return self.model.split(":", 1)[0] if ":" in self.model else ""

    @property
    def model_name(self) -> str:
        return self.model.split(":", 1)[1] if ":" in self.model else self.model


class LLMNotConfigured(RuntimeError):
    pass


def build_model(cfg: LLMConfig) -> Model:
    provider, name = cfg.provider, cfg.model_name
    if not name:
        raise LLMNotConfigured("No model name configured")
    if not provider:  # bare names ("test", "gpt-5", ...) are resolved by PydanticAI itself
        try:
            return infer_model(name)
        except Exception as exc:
            raise LLMNotConfigured(f"Cannot initialise model {name!r}: {exc}") from exc

    if provider == "anthropic" and (cfg.api_key or cfg.base_url):
        from pydantic_ai.models.anthropic import AnthropicModel
        from pydantic_ai.providers.anthropic import AnthropicProvider

        return AnthropicModel(name, provider=AnthropicProvider(api_key=cfg.api_key or None,
                                                               base_url=cfg.base_url or None))
    if provider in ("google-gla", "google") and cfg.api_key:
        from pydantic_ai.models.google import GoogleModel
        from pydantic_ai.providers.google import GoogleProvider

        return GoogleModel(name, provider=GoogleProvider(api_key=cfg.api_key))
    if provider == "groq" and cfg.api_key:
        from pydantic_ai.models.groq import GroqModel
        from pydantic_ai.providers.groq import GroqProvider

        return GroqModel(name, provider=GroqProvider(api_key=cfg.api_key))
    if provider == "mistral" and cfg.api_key:
        from pydantic_ai.models.mistral import MistralModel
        from pydantic_ai.providers.mistral import MistralProvider

        return MistralModel(name, provider=MistralProvider(api_key=cfg.api_key))
    if provider == "typesafe" and (cfg.api_key or cfg.base_url):
        from pydantic_ai.models.typesafe import TypeSafeModel
        from pydantic_ai.providers.typesafe import TypeSafeProvider

        return TypeSafeModel(name, provider=TypeSafeProvider(api_key=cfg.api_key or None,
                                                             base_url=cfg.base_url or None))
    if provider == "openrouter" and cfg.api_key:
        from pydantic_ai.models.openai import OpenAIChatModel
        from pydantic_ai.providers.openrouter import OpenRouterProvider

        return OpenAIChatModel(name, provider=OpenRouterProvider(api_key=cfg.api_key))
    if provider == "ollama":
        from pydantic_ai.models.openai import OpenAIChatModel
        from pydantic_ai.providers.ollama import OllamaProvider

        return OpenAIChatModel(name, provider=OllamaProvider(base_url=cfg.base_url or "http://localhost:11434/v1",
                                                             api_key=cfg.api_key or None))
    if provider in ("openai-compatible", "openai") and (cfg.base_url or cfg.api_key):
        from pydantic_ai.models.openai import OpenAIChatModel
        from pydantic_ai.providers.openai import OpenAIProvider

        if provider == "openai-compatible" and not cfg.base_url:
            raise LLMNotConfigured("openai-compatible provider requires a base URL")
        return OpenAIChatModel(name, provider=OpenAIProvider(base_url=cfg.base_url or None,
                                                             api_key=cfg.api_key or "not-needed"))
    try:
        return infer_model(cfg.model)
    except Exception as exc:  # missing env var, unknown provider, missing optional dependency
        raise LLMNotConfigured(f"Cannot initialise model {cfg.model!r}: {exc}") from exc


def model_settings(cfg: LLMConfig) -> dict:
    settings: dict = {"max_tokens": cfg.max_tokens}
    if cfg.temperature is not None:
        settings["temperature"] = cfg.temperature
    return settings
