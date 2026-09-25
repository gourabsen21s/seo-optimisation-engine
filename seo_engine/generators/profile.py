"""Publisher profile used to fill templates."""

from __future__ import annotations

from pydantic import BaseModel, Field


class SiteProfile(BaseModel):
    """Publisher facts used to fill templates. Stored per site and editable in the UI."""

    name: str = ""
    url: str = ""
    description: str = ""
    owner_name: str = ""
    email: str = ""
    city: str = ""
    region: str = ""
    country: str = ""
    country_code: str = ""
    language: str = "en"
    logo_url: str = ""
    founding_year: str = ""
    social_links: list[str] = Field(default_factory=list)
    publisher_id: str = ""  # pub-XXXXXXXXXXXXXXXX
    platform: str = "other"  # wordpress | static | other (auto-detected)
    niche: str = "general"  # general | health | finance | news
    author_name: str = ""
    author_bio: str = ""
    author_url: str = ""
    author_image: str = ""
    block_ai_training: bool = False
    target_keywords: list[str] = Field(default_factory=list)

    @property
    def base(self) -> str:
        return self.url.rstrip("/") + "/"
