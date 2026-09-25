"""Talk to Maya, the SEO Manager. She sees the audit, the board, team memory and site knowledge, and can assign
work to colleagues or propose fixes. History is persisted with PydanticAI's message adapter."""

from __future__ import annotations

from typing import Any

from pydantic_ai import Agent, UsageLimits
from pydantic_ai.exceptions import AgentRunError, UnexpectedModelBehavior, UsageLimitExceeded
from pydantic_ai.messages import ModelMessagesTypeAdapter
from sqlalchemy import delete, select

from ..agent.llm import LLMNotConfigured, build_model, model_settings
from ..agent.tools import seo_tools
from ..core.config import get_settings
from ..db import ChatSession, session_scope
from ..knowledge.memory import TEAM, get_memory
from ..workforce.research_tools import RANKS, RESEARCH, manager_tools, subset
from ..workforce.roster import MANAGER, ROSTER
from ..workforce.tools import EmployeeDeps, collab_tools
from . import budget
from . import fixes as fix_service
from .common import ServiceError, latest_audit, now
from .settings import get_llm_config
from .sites import get_site, gsc_for, profile_of

CHAT_RULES = """
You are chatting with the site owner. Answer concretely using your tools (audit, pages, board, memory, site
knowledge, live search results, keyword research, rank tracking) and cite URLs, finding codes and requirement
numbers (R1–R40). When the owner asks for work, either
propose fixes directly (propose_* tools) or assign it to the right colleague with create_task. When the owner
tells you a durable fact or preference (brand voice, priorities, things to avoid), save it with remember(scope="team").
Keep replies concise, in Markdown.
"""


async def _session(site_id: int) -> ChatSession:
    async with session_scope() as s:
        chat = await s.scalar(select(ChatSession).where(ChatSession.site_id == site_id).order_by(ChatSession.id.desc()))
        if chat is None:
            chat = ChatSession(site_id=site_id)
            s.add(chat)
            await s.flush()
        return chat


async def transcript(site_id: int) -> list[dict[str, Any]]:
    return (await _session(site_id)).transcript


async def send(site_id: int, message: str) -> dict[str, Any]:
    site = await get_site(site_id)
    audit, report, crawl = await latest_audit(site_id)
    chat = await _session(site_id)
    history = ModelMessagesTypeAdapter.validate_json(chat.messages_json or "[]")
    cfg = await get_llm_config()
    deps = EmployeeDeps(profile=profile_of(site), report=report, crawl=crawl, settings=get_settings(), cfg=cfg,
                        gsc=gsc_for(site), site_id=site.id, employee_id=MANAGER, created_tasks=[])
    memories = await get_memory().recall(site.id, message, TEAM, limit=6)
    memo = "\n".join(f"- {m['text']}" for m in memories)
    try:
        remaining = await budget.ensure_budget(site.id, "chat")
        agent = Agent(build_model(cfg), deps_type=EmployeeDeps, output_type=str,
                      instructions=ROSTER[MANAGER].card() + CHAT_RULES + (f"\nTeam memory:\n{memo}" if memo else ""),
                      toolsets=[collab_tools, seo_tools, subset(RESEARCH, RANKS), manager_tools], retries=2,
                      model_settings=model_settings(cfg), name="chat")
        result = await agent.run(message, deps=deps, message_history=history[-40:],
                                 usage_limits=UsageLimits(request_limit=25, total_tokens_limit=remaining or None))
        await budget.record(site.id, "chat", cfg.model, result.usage)
    except LLMNotConfigured as exc:
        raise ServiceError(f"No LLM configured: {exc}") from exc
    except (UnexpectedModelBehavior, UsageLimitExceeded, AgentRunError) as exc:
        raise ServiceError(f"Maya could not complete this request: {str(exc)[:300]}") from exc
    reply, messages = result.output, result.all_messages()
    rows = await fix_service.persist(site_id, deps.proposals, audit_id=audit.id) if deps.proposals else []
    async with session_scope() as s:
        c = await s.get(ChatSession, chat.id)
        c.messages_json = ModelMessagesTypeAdapter.dump_json(messages).decode()
        c.transcript = [*c.transcript, {"role": "user", "content": message, "at": now().isoformat()},
                        {"role": "assistant", "content": reply, "at": now().isoformat()}][-200:]
        entries = c.transcript
    return {"reply": reply, "transcript": entries, "proposals": [fix_service.serialize(r) for r in rows],
            "created_tasks": deps.created_tasks or []}


async def clear(site_id: int) -> None:
    async with session_scope() as s:
        await s.execute(delete(ChatSession).where(ChatSession.site_id == site_id))
