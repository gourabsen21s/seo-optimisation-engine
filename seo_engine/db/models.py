"""SQLAlchemy 2.0 ORM models."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    LargeBinary,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship
from sqlalchemy.types import TypeDecorator

JSONType = JSON().with_variant(JSONB(), "postgresql")


class UTCDateTime(TypeDecorator):
    """Timezone-aware UTC datetimes on every backend (SQLite otherwise returns naive values)."""

    impl = DateTime(timezone=True)
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is not None and value.tzinfo is None:
            value = value.replace(tzinfo=UTC)
        return value

    def process_result_value(self, value, dialect):
        if value is not None and value.tzinfo is None:
            value = value.replace(tzinfo=UTC)
        return value


def utcnow() -> datetime:
    return datetime.now(UTC)


class Base(DeclarativeBase):
    type_annotation_map = {dict[str, Any]: JSONType, list[Any]: JSONType}


class Site(Base):
    __tablename__ = "sites"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    url: Mapped[str] = mapped_column(String(500), unique=True)
    profile: Mapped[dict[str, Any]] = mapped_column(default=dict)
    connector_type: Mapped[str | None] = mapped_column(String(30))
    connector_secret: Mapped[str | None] = mapped_column(Text)  # encrypted JSON
    gsc_property: Mapped[str | None] = mapped_column(String(300))
    gsc_secret: Mapped[str | None] = mapped_column(Text)  # encrypted service-account JSON
    autopilot: Mapped[str] = mapped_column(String(10), default="off")  # off | safe | full
    audit_every_hours: Mapped[int] = mapped_column(Integer, default=24)  # 0 = manual only
    cycle_every_hours: Mapped[int] = mapped_column(Integer, default=168)  # autonomous optimisation cycle
    auto_publish_content: Mapped[bool] = mapped_column(Boolean, default=False)
    obey_robots: Mapped[bool] = mapped_column(Boolean, default=True)
    max_pages: Mapped[int | None] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow, onupdate=utcnow)
    last_audit_at: Mapped[datetime | None] = mapped_column(UTCDateTime())
    last_cycle_at: Mapped[datetime | None] = mapped_column(UTCDateTime())

    audits: Mapped[list[Audit]] = relationship(back_populates="site", cascade="all, delete-orphan",
                                               order_by="Audit.id.desc()")


class Audit(Base):
    __tablename__ = "audits"
    __table_args__ = (Index("ix_audits_site_created", "site_id", "created_at"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    site_id: Mapped[int] = mapped_column(ForeignKey("sites.id", ondelete="CASCADE"))
    status: Mapped[str] = mapped_column(String(20), default="queued")  # queued | running | done | failed
    overall_score: Mapped[int | None] = mapped_column(Integer)
    seo_score: Mapped[int | None] = mapped_column(Integer)
    adsense_score: Mapped[int | None] = mapped_column(Integer)
    report: Mapped[dict[str, Any] | None] = mapped_column(JSONType)
    crawl_gz: Mapped[bytes | None] = mapped_column(LargeBinary)
    judgements: Mapped[list[Any] | None] = mapped_column(JSONType)
    error: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow)
    finished_at: Mapped[datetime | None] = mapped_column(UTCDateTime())

    site: Mapped[Site] = relationship(back_populates="audits")


class AgentRun(Base):
    """One autonomous optimisation cycle (or a one-off strategy run)."""

    __tablename__ = "agent_runs"

    id: Mapped[int] = mapped_column(primary_key=True)
    site_id: Mapped[int] = mapped_column(ForeignKey("sites.id", ondelete="CASCADE"), index=True)
    audit_id: Mapped[int | None] = mapped_column(ForeignKey("audits.id", ondelete="SET NULL"))
    kind: Mapped[str] = mapped_column(String(20), default="cycle")
    status: Mapped[str] = mapped_column(String(20), default="queued")
    model: Mapped[str | None] = mapped_column(String(200))
    output: Mapped[dict[str, Any] | None] = mapped_column(JSONType)
    usage: Mapped[dict[str, Any] | None] = mapped_column(JSONType)
    error: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow)
    finished_at: Mapped[datetime | None] = mapped_column(UTCDateTime())


class Fix(Base):
    __tablename__ = "fixes"
    __table_args__ = (Index("ix_fixes_site_status", "site_id", "status"),)

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    site_id: Mapped[int] = mapped_column(ForeignKey("sites.id", ondelete="CASCADE"))
    audit_id: Mapped[int | None] = mapped_column(ForeignKey("audits.id", ondelete="SET NULL"))
    run_id: Mapped[int | None] = mapped_column(ForeignKey("agent_runs.id", ondelete="SET NULL"))
    kind: Mapped[str] = mapped_column(String(40))
    title: Mapped[str] = mapped_column(String(300))
    rationale: Mapped[str] = mapped_column(Text, default="")
    target_url: Mapped[str | None] = mapped_column(String(1000))
    payload: Mapped[dict[str, Any]] = mapped_column(default=dict)
    risk: Mapped[str] = mapped_column(String(10), default="safe")
    requirement: Mapped[int | None] = mapped_column(Integer)
    finding_code: Mapped[str | None] = mapped_column(String(80))
    source: Mapped[str] = mapped_column(String(20), default="rules")
    status: Mapped[str] = mapped_column(String(20), default="proposed")
    result: Mapped[dict[str, Any] | None] = mapped_column(JSONType)
    baseline: Mapped[dict[str, Any] | None] = mapped_column(JSONType)  # GSC page metrics when applied
    impact: Mapped[dict[str, Any] | None] = mapped_column(JSONType)  # measured later
    rollback_of: Mapped[str | None] = mapped_column(String(32))
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow)
    applied_at: Mapped[datetime | None] = mapped_column(UTCDateTime())


class Job(Base):
    __tablename__ = "jobs"

    id: Mapped[int] = mapped_column(primary_key=True)
    type: Mapped[str] = mapped_column(String(40))
    site_id: Mapped[int | None] = mapped_column(ForeignKey("sites.id", ondelete="CASCADE"), index=True)
    params: Mapped[dict[str, Any]] = mapped_column(default=dict)
    status: Mapped[str] = mapped_column(String(20), default="queued")  # queued | running | done | failed
    events: Mapped[list[Any]] = mapped_column(default=list)
    result: Mapped[dict[str, Any] | None] = mapped_column(JSONType)
    error: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow)
    started_at: Mapped[datetime | None] = mapped_column(UTCDateTime())
    finished_at: Mapped[datetime | None] = mapped_column(UTCDateTime())


class MetricSnapshot(Base):
    """Daily Search Console totals for trend charts and impact measurement."""

    __tablename__ = "metric_snapshots"
    __table_args__ = (Index("ix_metrics_site_date", "site_id", "captured_at"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    site_id: Mapped[int] = mapped_column(ForeignKey("sites.id", ondelete="CASCADE"))
    captured_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow)
    clicks: Mapped[float] = mapped_column(Float, default=0)
    impressions: Mapped[float] = mapped_column(Float, default=0)
    ctr: Mapped[float] = mapped_column(Float, default=0)
    position: Mapped[float | None] = mapped_column(Float)
    top_queries: Mapped[list[Any]] = mapped_column(default=list)


class ChatSession(Base):
    __tablename__ = "chat_sessions"

    id: Mapped[int] = mapped_column(primary_key=True)
    site_id: Mapped[int] = mapped_column(ForeignKey("sites.id", ondelete="CASCADE"), index=True)
    messages_json: Mapped[str] = mapped_column(Text, default="[]")  # PydanticAI ModelMessagesTypeAdapter JSON
    transcript: Mapped[list[Any]] = mapped_column(default=list)  # [{role, content, at}] for the UI
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow, onupdate=utcnow)


class AppSetting(Base):
    __tablename__ = "app_settings"

    key: Mapped[str] = mapped_column(String(100), primary_key=True)
    value: Mapped[str] = mapped_column(Text)  # encrypted JSON
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow, onupdate=utcnow)


class Task(Base):
    """A unit of work on the team board, assigned to one AI employee (or created by the human owner)."""

    __tablename__ = "tasks"
    __table_args__ = (Index("ix_tasks_site_status", "site_id", "status"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    site_id: Mapped[int] = mapped_column(ForeignKey("sites.id", ondelete="CASCADE"))
    run_id: Mapped[int | None] = mapped_column(ForeignKey("agent_runs.id", ondelete="SET NULL"), index=True)
    parent_id: Mapped[int | None] = mapped_column(ForeignKey("tasks.id", ondelete="SET NULL"))
    depth: Mapped[int] = mapped_column(Integer, default=0)
    kind: Mapped[str] = mapped_column(String(40), default="custom")
    title: Mapped[str] = mapped_column(String(300))
    description: Mapped[str] = mapped_column(Text, default="")
    assignee: Mapped[str] = mapped_column(String(40))
    created_by: Mapped[str] = mapped_column(String(40))  # employee id or "human"
    status: Mapped[str] = mapped_column(String(20), default="todo")  # todo|in_progress|blocked|done|failed|cancelled
    priority: Mapped[int] = mapped_column(Integer, default=2)  # 1 urgent … 4 low
    input: Mapped[dict[str, Any]] = mapped_column(default=dict)
    output: Mapped[dict[str, Any] | None] = mapped_column(JSONType)
    usage: Mapped[dict[str, Any] | None] = mapped_column(JSONType)
    error: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow)
    started_at: Mapped[datetime | None] = mapped_column(UTCDateTime())
    completed_at: Mapped[datetime | None] = mapped_column(UTCDateTime())


class TaskComment(Base):
    __tablename__ = "task_comments"

    id: Mapped[int] = mapped_column(primary_key=True)
    task_id: Mapped[int] = mapped_column(ForeignKey("tasks.id", ondelete="CASCADE"), index=True)
    author: Mapped[str] = mapped_column(String(40))  # employee id or "human"
    body: Mapped[str] = mapped_column(Text)
    kind: Mapped[str] = mapped_column(String(20), default="comment")  # comment | question | answer | handoff
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow)


class Activity(Base):
    """The team's activity feed."""

    __tablename__ = "activities"
    __table_args__ = (Index("ix_activities_site_created", "site_id", "created_at"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    site_id: Mapped[int] = mapped_column(ForeignKey("sites.id", ondelete="CASCADE"))
    actor: Mapped[str] = mapped_column(String(40))
    verb: Mapped[str] = mapped_column(String(40))  # started | completed | created_task | asked | commented | ...
    message: Mapped[str] = mapped_column(Text)
    task_id: Mapped[int | None] = mapped_column(ForeignKey("tasks.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow)


class Report(Base):
    __tablename__ = "reports"
    __table_args__ = (Index("ix_reports_site_kind", "site_id", "kind", "created_at"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    site_id: Mapped[int] = mapped_column(ForeignKey("sites.id", ondelete="CASCADE"))
    kind: Mapped[str] = mapped_column(String(20))  # standup | weekly | cycle
    author: Mapped[str] = mapped_column(String(40))
    title: Mapped[str] = mapped_column(String(300))
    content: Mapped[str] = mapped_column(Text)  # markdown
    data: Mapped[dict[str, Any]] = mapped_column(default=dict)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow)


class LLMUsage(Base):
    """Ledger of LLM token usage — powers the daily budget and the usage dashboard."""

    __tablename__ = "llm_usage"
    __table_args__ = (Index("ix_llm_usage_at", "at"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow)
    site_id: Mapped[int | None] = mapped_column(ForeignKey("sites.id", ondelete="SET NULL"))
    actor: Mapped[str] = mapped_column(String(40))  # employee id or "chat"
    model: Mapped[str | None] = mapped_column(String(200))
    requests: Mapped[int] = mapped_column(Integer, default=0)
    input_tokens: Mapped[int] = mapped_column(Integer, default=0)
    output_tokens: Mapped[int] = mapped_column(Integer, default=0)


class TrackedKeyword(Base):
    """A keyword whose ranking the team tracks over time."""

    __tablename__ = "tracked_keywords"
    __table_args__ = (UniqueConstraint("site_id", "keyword", "country", name="uq_tracked_keyword"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    site_id: Mapped[int] = mapped_column(ForeignKey("sites.id", ondelete="CASCADE"), index=True)
    keyword: Mapped[str] = mapped_column(String(300))
    country: Mapped[str] = mapped_column(String(5), default="us")
    target_url: Mapped[str | None] = mapped_column(String(1000))
    added_by: Mapped[str] = mapped_column(String(40), default="human")
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow)


class RankSnapshot(Base):
    __tablename__ = "rank_snapshots"
    __table_args__ = (Index("ix_rank_snapshots_kw_at", "keyword_id", "captured_at"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    keyword_id: Mapped[int] = mapped_column(ForeignKey("tracked_keywords.id", ondelete="CASCADE"))
    site_id: Mapped[int] = mapped_column(ForeignKey("sites.id", ondelete="CASCADE"))
    captured_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow)
    position: Mapped[float | None] = mapped_column(Float)  # None = not in the checked results
    url: Mapped[str | None] = mapped_column(String(1000))
    source: Mapped[str] = mapped_column(String(20))  # serper | serpapi | brave | gsc
    competitors: Mapped[list[Any]] = mapped_column(default=list)  # top results [{position, domain, url, title}]
