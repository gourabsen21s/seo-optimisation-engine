"""End-to-end audit: crawl → PageSpeed → checks → report."""

from __future__ import annotations

from collections.abc import Awaitable, Callable

from ..core.config import Settings, get_settings
from ..core.models import AuditReport, CrawlResult
from ..crawler import crawl_site
from .context import AuditContext
from .pagespeed import pagespeed_sample
from .registry import run_checks
from .scoring import build_report

Progress = Callable[[str], Awaitable[None]]


async def _noop(_: str) -> None:
    return None


async def run_audit(url: str, settings: Settings | None = None, obey_robots: bool = True,
                    progress: Progress = _noop) -> tuple[AuditReport, CrawlResult]:
    settings = settings or get_settings()
    await progress(f"Crawling {url} (up to {settings.max_pages} pages)")
    crawl = await crawl_site(url, settings, obey_robots=obey_robots)
    await progress(f"Crawled {len(crawl.pages)} URLs; sitemap has {len(crawl.sitemap_entries)} entries")

    sample = [crawl.base_url] + [p.final_url for p in crawl.html_pages() if p.page_type == "article"][:2]
    pagespeed = []
    if settings.pagespeed_api_key:
        await progress("Measuring Core Web Vitals with PageSpeed Insights")
        pagespeed = await pagespeed_sample(sample, settings)

    await progress("Running AdSense-manual and SEO checks")
    findings = run_checks(AuditContext(crawl, pagespeed))
    report = build_report(crawl, findings, pagespeed)
    await progress(f"Audit complete — overall score {report.overall_score}/100, {len(findings)} findings")
    return report, crawl
