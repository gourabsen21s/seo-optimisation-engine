"""Site management: CRUD, connector + Search Console credentials, serialisation."""

from __future__ import annotations

from typing import Any

from sqlalchemy import func, select

from ..connectors import CONNECTOR_FIELDS, Connector, ConnectorError, build_connector
from ..crawler import normalize_start_url
from ..db import Audit, Fix, Job, Site, Task, session_scope
from ..generators.profile import SiteProfile
from ..integrations.gsc import GSCConfig, GSCError, SearchConsole
from .common import NotFound, ServiceError, secret_box

EDITABLE = {"name", "autopilot", "audit_every_hours", "cycle_every_hours", "auto_publish_content", "obey_robots",
            "max_pages"}
AUTOPILOT_MODES = {"off", "safe", "full"}


def profile_of(site: Site) -> SiteProfile:
    return SiteProfile(**{"url": site.url, "name": site.name, **(site.profile or {})})


async def get_site(site_id: int) -> Site:
    async with session_scope() as s:
        site = await s.get(Site, site_id)
    if site is None:
        raise NotFound(f"site {site_id} not found")
    return site


async def serialize(site: Site) -> dict[str, Any]:
    async with session_scope() as s:
        latest = await s.scalar(select(Audit).where(Audit.site_id == site.id, Audit.status == "done")
                                .order_by(Audit.id.desc()).limit(1))
        active = await s.scalar(select(Job).where(Job.site_id == site.id, Job.status.in_(("queued", "running")),
                                                  Job.type.in_(("audit", "cycle", "apply", "rollback")))
                                .order_by(Job.id.desc()).limit(1))
        running_tasks = await s.scalar(select(func.count()).select_from(Task).where(
            Task.site_id == site.id, Task.status.in_(("todo", "in_progress"))))
        waiting_on_you = await s.scalar(select(func.count()).select_from(Task).where(
            Task.site_id == site.id, Task.status == "blocked"))
        counts = dict((await s.execute(select(Fix.status, func.count()).where(Fix.site_id == site.id)
                                       .group_by(Fix.status))).all())
        audits = await s.scalar(select(func.count()).select_from(Audit).where(Audit.site_id == site.id))
    public: dict[str, Any] = {}
    if site.connector_type and site.connector_secret:
        cfg = secret_box().decrypt(site.connector_secret)
        secret_fields = {f["name"] for f in CONNECTOR_FIELDS.get(site.connector_type, []) if f["type"] == "password"}
        public = {k: v for k, v in cfg.items() if k not in secret_fields}
    profile = profile_of(site)
    return {
        "id": site.id, "name": site.name, "url": site.url, "platform": profile.platform,
        "autopilot": site.autopilot, "audit_every_hours": site.audit_every_hours,
        "cycle_every_hours": site.cycle_every_hours, "auto_publish_content": site.auto_publish_content,
        "obey_robots": site.obey_robots, "max_pages": site.max_pages,
        "connector_type": site.connector_type, "connector_configured": bool(site.connector_secret),
        "connector_public": public, "gsc_property": site.gsc_property, "gsc_configured": bool(site.gsc_secret),
        "last_audit_at": site.last_audit_at, "last_cycle_at": site.last_cycle_at,
        "latest_scores": {"overall": latest.overall_score, "seo": latest.seo_score,
                          "adsense": latest.adsense_score} if latest else None,
        "profile": profile.model_dump(), "created_at": site.created_at,
        "active_job": {"id": active.id, "type": active.type, "status": active.status} if active else None,
        "counts": {"proposed_fixes": counts.get("proposed", 0) + counts.get("approved", 0),
                   "applied_fixes": counts.get("applied", 0), "audits": audits or 0,
                   "open_tasks": running_tasks or 0, "waiting_on_you": waiting_on_you or 0},
    }


async def list_sites(account_id: int | None = None) -> list[Site]:
    """Sites of one account, or every site when `account_id` is None (operator API keys)."""
    q = select(Site).order_by(Site.name)
    if account_id is not None:
        q = q.where(Site.account_id == account_id)
    async with session_scope() as s:
        return list(await s.scalars(q))


async def create_site(url: str, name: str | None = None, autopilot: str = "off", account_id: int | None = None) -> Site:
    url = normalize_start_url(url)
    if autopilot not in AUTOPILOT_MODES:
        raise ServiceError(f"autopilot must be one of {sorted(AUTOPILOT_MODES)}")
    async with session_scope() as s:
        if await s.scalar(select(Site).where(Site.url == url, Site.account_id == account_id)):
            raise ServiceError(f"{url} is already in your workspace")
        site = Site(url=url, name=name or url.split("//", 1)[-1].strip("/"), autopilot=autopilot, profile={},
                    account_id=account_id)
        s.add(site)
        await s.flush()
        return site


async def update_site(site_id: int, data: dict[str, Any]) -> Site:
    async with session_scope() as s:
        site = await s.get(Site, site_id)
        if site is None:
            raise NotFound(f"site {site_id} not found")
        if "autopilot" in data and data["autopilot"] not in AUTOPILOT_MODES:
            raise ServiceError(f"autopilot must be one of {sorted(AUTOPILOT_MODES)}")
        for key in EDITABLE & data.keys():
            setattr(site, key, data[key])
        if "profile" in data and data["profile"] is not None:
            merged = {**(site.profile or {}), **SiteProfile(**data["profile"]).model_dump()}
            site.profile = merged
        return site


async def delete_site(site_id: int) -> None:
    async with session_scope() as s:
        site = await s.get(Site, site_id)
        if site is None:
            raise NotFound(f"site {site_id} not found")
        await s.delete(site)
    from ..knowledge import get_index, get_memory

    try:
        await get_memory().forget_site(site_id)
        await get_index().delete_site(site_id)
    except Exception:  # a missing vector store must not block deletion
        pass


# ----------------------------------------------------------------------------- connector

async def set_connector(site_id: int, kind: str, config: dict[str, Any]) -> Site:
    if kind not in CONNECTOR_FIELDS:
        raise ServiceError(f"unknown connector type {kind!r}")
    async with session_scope() as s:
        site = await s.get(Site, site_id)
        if site is None:
            raise NotFound(f"site {site_id} not found")
        existing = secret_box().decrypt(site.connector_secret) if site.connector_type == kind else {}
        merged = {**existing, **{k: v for k, v in config.items() if v not in (None, "")}}
        missing = [f["name"] for f in CONNECTOR_FIELDS[kind] if f.get("required") and not merged.get(f["name"])]
        if missing:
            raise ServiceError(f"missing connector fields: {', '.join(missing)}")
        site.connector_type = kind
        site.connector_secret = secret_box().encrypt(merged)
        return site


def connector_for(site: Site) -> Connector:
    if not site.connector_type or not site.connector_secret:
        raise ServiceError("No connector configured for this site (Settings → Connector).")
    return build_connector(site.connector_type, secret_box().decrypt(site.connector_secret), profile_of(site))


async def test_connector(site_id: int) -> dict[str, Any]:
    site = await get_site(site_id)
    try:
        connector = connector_for(site)
        details = await connector.test()
        if hasattr(connector, "close"):
            await connector.close()
        return {"ok": True, "details": details}
    except (ConnectorError, ServiceError, KeyError) as exc:
        return {"ok": False, "error": str(exc)}


# ----------------------------------------------------------------------------- search console

async def set_gsc(site_id: int, property_url: str, service_account_json: str | None) -> Site:
    async with session_scope() as s:
        site = await s.get(Site, site_id)
        if site is None:
            raise NotFound(f"site {site_id} not found")
        site.gsc_property = property_url.strip()
        if service_account_json:
            GSCConfig(property_url=property_url, service_account_json=service_account_json)
            SearchConsole(GSCConfig(property_url=property_url, service_account_json=service_account_json))
            site.gsc_secret = secret_box().encrypt({"service_account_json": service_account_json})
        return site


def gsc_for(site: Site) -> SearchConsole | None:
    if not site.gsc_property or not site.gsc_secret:
        return None
    creds = secret_box().decrypt(site.gsc_secret)
    return SearchConsole(GSCConfig(property_url=site.gsc_property, service_account_json=creds["service_account_json"]))


async def test_gsc(site_id: int) -> dict[str, Any]:
    site = await get_site(site_id)
    try:
        gsc = gsc_for(site)
        if gsc is None:
            return {"ok": False, "error": "Search Console is not configured"}
        return {"ok": True, "details": await gsc.test()}
    except (GSCError, ValueError) as exc:
        return {"ok": False, "error": str(exc)}
