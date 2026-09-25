"""Apply fixes to a WordPress site via the REST API + the SEO Engine Bridge plugin (wordpress/seo-engine-bridge.php).

Auth: a WordPress Application Password (Users → Profile → Application Passwords) for an Administrator.
"""

from __future__ import annotations

import json
import re
from typing import Any
from urllib.parse import urlsplit

import httpx

from ..audit.context import norm_url
from ..fixes.models import FixAction, FixKind, FixResult
from .base import Connector, ConnectorError

META_KEYS = {
    "rank_math": {"title": "rank_math_title", "description": "rank_math_description",
                  "canonical": "rank_math_canonical_url", "og_title": "rank_math_facebook_title",
                  "og_description": "rank_math_facebook_description"},
    "yoast": {"title": "_yoast_wpseo_title", "description": "_yoast_wpseo_metadesc",
              "canonical": "_yoast_wpseo_canonical", "og_title": "_yoast_wpseo_opengraph-title",
              "og_description": "_yoast_wpseo_opengraph-description"},
    "none": {"title": "_seo_engine_title", "description": "_seo_engine_description",
             "canonical": "_seo_engine_canonical", "og_title": "_seo_engine_og_title",
             "og_description": "_seo_engine_og_description"},
}
IMG_TAG = re.compile(r"<img\b[^>]*>", re.I)


class WordPressConnector(Connector):
    name = "wordpress"
    supported = {FixKind.SET_TITLE, FixKind.SET_META_DESCRIPTION, FixKind.SET_CANONICAL, FixKind.SET_IMAGE_ALT,
                 FixKind.ADD_JSON_LD, FixKind.SET_OPEN_GRAPH, FixKind.WRITE_FILE, FixKind.CREATE_PAGE,
                 FixKind.ADD_INTERNAL_LINK, FixKind.REMOVE_INTERNAL_LINK}

    def __init__(self, base_url: str, username: str, app_password: str, timeout: float = 30,
                 transport: httpx.AsyncBaseTransport | None = None):
        self.base = base_url.rstrip("/")
        self.client = httpx.AsyncClient(base_url=f"{self.base}/wp-json", auth=(username, app_password.replace(" ", "")),
                                        timeout=timeout, headers={"User-Agent": "seo-engine/1.0"}, transport=transport)
        self._status: dict[str, Any] | None = None

    async def _req(self, method: str, path: str, **kw) -> Any:
        resp = await self.client.request(method, path, **kw)
        if resp.status_code >= 400:
            raise ConnectorError(f"WordPress {method} {path} → {resp.status_code}: {resp.text[:300]}")
        return resp.json() if resp.content else None

    async def bridge_status(self) -> dict[str, Any]:
        if self._status is None:
            try:
                self._status = await self._req("GET", "/seo-engine/v1/status")
            except ConnectorError:
                self._status = {"installed": False, "seo_plugin": "none"}
        return self._status

    async def test(self) -> dict[str, Any]:
        me = await self._req("GET", "/wp/v2/users/me", params={"context": "edit"})
        if "administrator" not in (me.get("roles") or []):
            raise ConnectorError("the WordPress user must be an Administrator")
        status = await self.bridge_status()
        return {"ok": True, "user": me.get("name"), "bridge_installed": status.get("installed", False),
                "seo_plugin": status.get("seo_plugin"), "version": status.get("version")}

    async def close(self) -> None:
        await self.client.aclose()

    # ------------------------------------------------------------------ resolution

    async def resolve(self, url: str) -> tuple[str, int] | None:
        """Map a public URL to (rest_base, id). Returns ('home', 0) for a posts-page homepage."""
        status = await self.bridge_status()
        if norm_url(url) == norm_url(self.base + "/"):
            front = int(status.get("page_on_front") or 0)
            return ("pages", front) if front else ("home", 0)
        slug = [s for s in urlsplit(url).path.split("/") if s][-1:] or [""]
        for rest_base in ("posts", "pages"):
            items = await self._req("GET", f"/wp/v2/{rest_base}", params={"slug": slug[0], "_fields": "id,link",
                                                                           "status": "publish,draft,future,private"})
            for item in items or []:
                if norm_url(item["link"]) == norm_url(url):
                    return rest_base, item["id"]
        return None  # never guess: a slug match with a different URL could be another post

    # ------------------------------------------------------------------ apply

    async def _meta_update(self, fix: FixAction, fields: dict[str, str], dry_run: bool) -> FixResult:
        status = await self.bridge_status()
        if not status.get("installed"):
            return FixResult(fix_id=fix.id, ok=False, manual=True,
                             message="Install the SEO Engine Bridge plugin so SEO fields are writable via REST.")
        keys = META_KEYS.get(status.get("seo_plugin", "none"), META_KEYS["none"])
        meta = {keys[k]: v for k, v in fields.items() if v is not None}
        target = await self.resolve(fix.target_url or "")
        if target is None:
            return FixResult(fix_id=fix.id, ok=False, message=f"no post/page found for {fix.target_url}")
        rest_base, obj_id = target
        preview = f"{rest_base}/{obj_id or 'front'} meta ← {json.dumps(meta, ensure_ascii=False)}"
        if dry_run:
            return FixResult(fix_id=fix.id, ok=True, message="would set " + preview, diff=preview)
        if rest_base == "home":
            await self._req("POST", "/seo-engine/v1/home-meta", json={"meta": meta})
        else:
            await self._req("POST", f"/wp/v2/{rest_base}/{obj_id}", json={"meta": meta})
        return FixResult(fix_id=fix.id, ok=True, message="set " + preview, diff=preview)

    async def _jsonld(self, fix: FixAction, dry_run: bool) -> FixResult:
        status = await self.bridge_status()
        if not status.get("installed"):
            return FixResult(fix_id=fix.id, ok=False, manual=True, message="Install the SEO Engine Bridge plugin.")
        schema = fix.payload["schema"]
        stype = fix.payload.get("schema_type") or schema.get("@type")
        if fix.payload.get("sitewide"):
            if not dry_run:
                await self._req("POST", "/seo-engine/v1/sitewide-jsonld", json={"type": stype, "schema": schema})
            return FixResult(fix_id=fix.id, ok=True, message=f"{'would add' if dry_run else 'added'} sitewide {stype}")
        target = await self.resolve(fix.target_url or "")
        if target is None or target[0] == "home":
            return FixResult(fix_id=fix.id, ok=False, message=f"no post/page found for {fix.target_url}")
        rest_base, obj_id = target
        current = await self._req("GET", f"/wp/v2/{rest_base}/{obj_id}", params={"context": "edit", "_fields": "meta"})
        blocks = json.loads((current.get("meta") or {}).get("_seo_engine_jsonld") or "{}")
        blocks[stype] = schema
        if not dry_run:
            await self._req("POST", f"/wp/v2/{rest_base}/{obj_id}",
                            json={"meta": {"_seo_engine_jsonld": json.dumps(blocks, ensure_ascii=False)}})
        return FixResult(fix_id=fix.id, ok=True, message=f"{'would add' if dry_run else 'added'} {stype} to "
                                                         f"{rest_base}/{obj_id}")

    async def _image_alts(self, fix: FixAction, dry_run: bool) -> FixResult:
        target = await self.resolve(fix.target_url or "")
        if target is None or target[0] == "home":
            return FixResult(fix_id=fix.id, ok=False, message=f"no post/page found for {fix.target_url}")
        rest_base, obj_id = target
        post = await self._req("GET", f"/wp/v2/{rest_base}/{obj_id}", params={"context": "edit"})
        raw: str = post["content"]["raw"]
        alts = {urlsplit(a["src"]).path: a["alt"] for a in fix.payload["alts"]}
        changed = 0

        def repl(m: re.Match) -> str:
            nonlocal changed
            tag = m.group(0)
            src = re.search(r'\ssrc=["\']([^"\']+)', tag)
            if not src or urlsplit(src.group(1)).path not in alts:
                return tag
            alt = alts[urlsplit(src.group(1)).path].replace('"', "&quot;")
            if re.search(r'\salt=["\']\s*["\']', tag):
                changed += 1
                return re.sub(r'\salt=["\']\s*["\']', f' alt="{alt}"', tag, count=1)
            if not re.search(r"\salt=", tag):
                changed += 1
                return tag.replace("<img", f'<img alt="{alt}"', 1)
            return tag

        new_raw = IMG_TAG.sub(repl, raw)
        if not changed:
            return FixResult(fix_id=fix.id, ok=False, message="images not found in post content (theme/featured "
                                                              "images must be fixed in the Media Library)")
        if not dry_run:
            await self._req("POST", f"/wp/v2/{rest_base}/{obj_id}", json={"content": new_raw})
            for path, alt in alts.items():
                name = path.rsplit("/", 1)[-1].rsplit(".", 1)[0]
                media = await self._req("GET", "/wp/v2/media", params={"search": name, "_fields": "id,source_url,alt_text"})
                for m in media or []:
                    if urlsplit(m["source_url"]).path == path and not m.get("alt_text"):
                        await self._req("POST", f"/wp/v2/media/{m['id']}", json={"alt_text": alt})
        return FixResult(fix_id=fix.id, ok=True, message=f"{'would set' if dry_run else 'set'} alt on {changed} images")

    async def _link(self, fix: FixAction, dry_run: bool) -> FixResult:
        from ..fixes.htmlpatch import PatchError
        from ..fixes.links import insert_link, remove_link

        target = await self.resolve(fix.target_url or "")
        if target is None or target[0] == "home":
            return FixResult(fix_id=fix.id, ok=False, message=f"no post/page found for {fix.target_url}")
        rest_base, obj_id = target
        post = await self._req("GET", f"/wp/v2/{rest_base}/{obj_id}", params={"context": "edit"})
        raw: str = post["content"]["raw"]
        p = fix.payload
        try:
            new_raw = (insert_link(raw, p["href"], p["anchor_text"]) if fix.kind == FixKind.ADD_INTERNAL_LINK
                       else remove_link(raw, p["href"], p.get("anchor_text")))
        except PatchError as exc:
            return FixResult(fix_id=fix.id, ok=False, message=str(exc))
        from ..fixes.htmlpatch import unified_diff

        diff = unified_diff(raw, new_raw, f"{rest_base}/{obj_id}")
        if not dry_run:
            await self._req("POST", f"/wp/v2/{rest_base}/{obj_id}", json={"content": new_raw})
        verb = "link" if fix.kind == FixKind.ADD_INTERNAL_LINK else "unlink"
        return FixResult(fix_id=fix.id, ok=True, message=f"{'would ' + verb if dry_run else verb + 'ed'} "
                                                         f"“{p.get('anchor_text')}” in {rest_base}/{obj_id}", diff=diff)

    async def _write_file(self, fix: FixAction, dry_run: bool) -> FixResult:
        path = fix.payload["path"].lstrip("/")
        if path not in ("robots.txt", "ads.txt", "llms.txt"):
            return FixResult(fix_id=fix.id, ok=False, manual=True,
                             message=f"{path} must be uploaded manually (or generated by your SEO plugin).")
        status = await self.bridge_status()
        if not status.get("installed"):
            return FixResult(fix_id=fix.id, ok=False, manual=True,
                             message=f"Install the SEO Engine Bridge plugin or upload {path} via SFTP.")
        if not dry_run:
            await self._req("POST", "/seo-engine/v1/files", json={"path": path, "content": fix.payload["content"]})
        return FixResult(fix_id=fix.id, ok=True, message=f"{'would serve' if dry_run else 'serving'} /{path}",
                         diff=fix.payload["content"])

    async def _create_page(self, fix: FixAction, dry_run: bool) -> FixResult:
        p = fix.payload
        rest_base = "posts" if p.get("post_type") == "post" else "pages"
        status = "publish" if p.get("publish") else "draft"
        body: dict[str, Any] = {"title": p["title"], "content": p["html"], "slug": p["slug"], "status": status}
        if p.get("meta_description"):
            keys = META_KEYS.get((await self.bridge_status()).get("seo_plugin", "none"), META_KEYS["none"])
            body["meta"] = {keys["description"]: p["meta_description"]}
        if dry_run:
            return FixResult(fix_id=fix.id, ok=True, message=f"would create {status} {rest_base[:-1]} '{p['title']}'")
        created = await self._req("POST", f"/wp/v2/{rest_base}", json=body)
        return FixResult(fix_id=fix.id, ok=True, message=f"created {status} {rest_base[:-1]} #{created['id']}: "
                                                         f"{created.get('link')}")

    async def apply(self, fixes: list[FixAction], dry_run: bool = True) -> list[FixResult]:
        results = []
        for fix in fixes:
            try:
                p = fix.payload
                if fix.kind == FixKind.SET_TITLE:
                    results.append(await self._meta_update(fix, {"title": p["title"]}, dry_run))
                elif fix.kind == FixKind.SET_META_DESCRIPTION:
                    results.append(await self._meta_update(fix, {"description": p["meta_description"]}, dry_run))
                elif fix.kind == FixKind.SET_CANONICAL:
                    results.append(await self._meta_update(fix, {"canonical": p["canonical"]}, dry_run))
                elif fix.kind == FixKind.SET_OPEN_GRAPH:
                    results.append(await self._meta_update(
                        fix, {"og_title": p.get("title"), "og_description": p.get("description")}, dry_run))
                elif fix.kind == FixKind.ADD_JSON_LD:
                    results.append(await self._jsonld(fix, dry_run))
                elif fix.kind == FixKind.SET_IMAGE_ALT:
                    results.append(await self._image_alts(fix, dry_run))
                elif fix.kind == FixKind.WRITE_FILE:
                    results.append(await self._write_file(fix, dry_run))
                elif fix.kind == FixKind.CREATE_PAGE:
                    results.append(await self._create_page(fix, dry_run))
                elif fix.kind in (FixKind.ADD_INTERNAL_LINK, FixKind.REMOVE_INTERNAL_LINK):
                    results.append(await self._link(fix, dry_run))
                else:
                    results.append(self.unsupported(fix))
            except (ConnectorError, httpx.HTTPError, KeyError) as exc:
                results.append(FixResult(fix_id=fix.id, ok=False, message=str(exc)))
        return results
