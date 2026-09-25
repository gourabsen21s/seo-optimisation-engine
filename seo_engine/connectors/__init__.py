"""Connectors turn approved FixActions into real changes on a website."""

from __future__ import annotations

from typing import Any

from ..generators.profile import SiteProfile
from .base import Connector, ConnectorError


def build_connector(kind: str, config: dict[str, Any], profile: SiteProfile | None = None) -> Connector:
    if kind == "wordpress":
        from .wordpress import WordPressConnector

        return WordPressConnector(config["base_url"], config["username"], config["app_password"])
    if kind == "github":
        from .github import GitHubConnector

        return GitHubConnector(config["repo"], config["token"], config.get("branch", "main"),
                               config.get("site_dir", ""), config.get("drafts_dir", "seo-drafts"),
                               bool(config.get("auto_merge")), profile)
    if kind == "local":
        from .local import LocalConnector

        return LocalConnector(config["root"], config.get("drafts_dir", "seo-drafts"), profile)
    raise ConnectorError(f"unknown connector type {kind!r}")


CONNECTOR_FIELDS = {
    "wordpress": [
        {"name": "base_url", "label": "Site URL", "type": "url", "required": True},
        {"name": "username", "label": "Admin username", "type": "text", "required": True},
        {"name": "app_password", "label": "Application password", "type": "password", "required": True,
         "help": "Users → Profile → Application Passwords. Install the SEO Engine Bridge plugin too."},
    ],
    "github": [
        {"name": "repo", "label": "Repository (owner/name)", "type": "text", "required": True},
        {"name": "token", "label": "Fine-grained token (contents + pull requests: write)", "type": "password",
         "required": True},
        {"name": "branch", "label": "Base branch", "type": "text", "default": "main"},
        {"name": "site_dir", "label": "Site folder in repo (e.g. public)", "type": "text", "default": ""},
        {"name": "auto_merge", "label": "Auto-merge PRs (autopilot)", "type": "checkbox", "default": False},
    ],
    "local": [
        {"name": "root", "label": "Absolute path to the site's files", "type": "text", "required": True},
    ],
}

__all__ = ["CONNECTOR_FIELDS", "Connector", "ConnectorError", "build_connector"]
