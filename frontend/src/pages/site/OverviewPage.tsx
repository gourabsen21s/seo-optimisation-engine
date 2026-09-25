import { Link } from "react-router-dom";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  ArrowRight, BookOpenCheck, Bug, CircleCheck, CircleDashed, Download, FileText, Globe, Link2Off, Map as MapIcon, MessageCircleQuestion, Play, Sparkles, Wrench,
} from "lucide-react";
import { Pill, SeverityBadge } from "@/components/common/badges";
import { EmptyState, ExternalLink, PageHeader, SectionLabel, StatCard } from "@/components/common/blocks";
import { JobProgress } from "@/components/common/JobProgress";
import { Reveal } from "@/components/common/motion";
import { ScoreRing } from "@/components/common/ScoreRing";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { AUTOPILOT_OPTIONS } from "@/features/sites/autopilot";
import { EmployeeAvatar } from "@/features/team/EmployeeAvatar";
import { useEmployees } from "@/features/team/employees";
import { ActivityFeed } from "@/features/team/TaskBits";
import { useTaskParam } from "@/features/team/useTaskParam";
import { api } from "@/lib/api";
import { jobTracker, useActivity, useAudits, useCycles, useLatestAudit, useMediaQuery, useMetrics, useSetAutopilot, useStartAudit, useStartCycle, useTeam, useTrackedJob } from "@/lib/hooks";
import type { AutopilotMode } from "@/lib/types";
import { formatShortDate, hostname, SECTION_NAMES, SECTIONS, timeAgo } from "@/lib/utils";
import { useSiteCtx } from "./SiteLayout";

const sectionChart = { score: { label: "Score", color: "var(--primary)" } } satisfies ChartConfig;
const trendChart = { overall: { label: "Overall", color: "var(--primary)" }, seo: { label: "SEO", color: "var(--chart-2)" }, adsense: { label: "AdSense", color: "var(--chart-1)" } } satisfies ChartConfig;
const gscChart = { clicks: { label: "Clicks", color: "var(--primary)" }, impressions: { label: "Impressions", color: "var(--chart-3)" } } satisfies ChartConfig;

function Hero() {
  const { site, siteId } = useSiteCtx();
  const audit = useStartAudit(siteId);
  const cycle = useStartCycle(siteId);
  const autopilot = useSetAutopilot(siteId);
  const latest = useLatestAudit(siteId);
  const busy = !!site.active_job;
  return (
    <PageHeader
      title={site.name}
      description={
        <span className="flex flex-wrap items-center gap-x-1.5">
          <span>{hostname(site.url)}</span>
          <span aria-hidden>·</span>
          <span>{site.last_audit_at ? `Audited ${timeAgo(site.last_audit_at)}` : "Not audited yet"}</span>
          {site.last_cycle_at && <><span aria-hidden>·</span><span>Last cycle {timeAgo(site.last_cycle_at)}</span></>}
        </span>
      }
      actions={
        <>
          <Select value={site.autopilot} onValueChange={(v) => autopilot.mutate(v as AutopilotMode)}>
            <SelectTrigger size="sm" className="w-56" aria-label="Autopilot"><SelectValue /></SelectTrigger>
            <SelectContent>{AUTOPILOT_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}><o.icon /> {o.label}</SelectItem>)}</SelectContent>
          </Select>
          {latest.summary && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild><Button variant="outline" size="sm"><Download /> Export</Button></DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => window.open(api.auditExportUrl(latest.summary!.id, "html"), "_blank")}><FileText /> HTML report</DropdownMenuItem>
                <DropdownMenuItem onClick={() => window.open(api.auditExportUrl(latest.summary!.id, "json"), "_blank")}><FileText /> JSON data</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <Button variant="outline" size="sm" disabled={busy || audit.isPending} onClick={() => audit.mutate()}><Play /> Run audit</Button>
          <Button size="sm" disabled={busy || cycle.isPending} onClick={() => cycle.mutate(true)}><Sparkles /> Run cycle</Button>
        </>
      }
    />
  );
}

function TeamStrip() {
  const { siteId, site } = useSiteCtx();
  const team = useTeam(siteId);
  const activity = useActivity(siteId, 6, true);
  const dir = useEmployees();
  const { openTask } = useTaskParam();
  const working = team.data?.employees.filter((e) => e.status === "working") ?? [];
  return (
    <Card className="shadow-xs">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">Your crew</CardTitle>
        <CardDescription>{working.length ? `${working.length} working right now` : "Everyone's free"}{site.counts.waiting_on_you ? ` · ${site.counts.waiting_on_you} waiting on you` : ""}</CardDescription>
        <CardAction><Button asChild variant="ghost" size="sm"><Link to="../office" relative="path">Open office <ArrowRight /></Link></Button></CardAction>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="flex flex-wrap gap-2">
          {(team.data?.employees ?? []).map((e) => (
            <button key={e.id} type="button" onClick={() => e.current_task && openTask(e.current_task.id)} className="flex items-center gap-2 rounded-md border py-1 pr-3 pl-1 text-left transition-colors hover:bg-accent">
              <EmployeeAvatar actor={e.id} size="sm" status={e.status} />
              <span className="text-xs"><span className="font-medium">{dir.name(e.id)}</span><span className="block max-w-36 truncate text-muted-foreground">{e.current_task?.title ?? (e.status === "blocked" ? "Needs you" : "Idle")}</span></span>
            </button>
          ))}
        </div>
        {(site.counts.waiting_on_you ?? 0) > 0 && (
          <Button asChild variant="outline" className="justify-start"><Link to="../board" relative="path"><MessageCircleQuestion className="text-amber-600" /> {site.counts.waiting_on_you} question{site.counts.waiting_on_you === 1 ? "" : "s"} waiting for your answer</Link></Button>
        )}
        {activity.data?.length ? <ActivityFeed items={activity.data} onOpenTask={openTask} compact /> : <p className="text-sm text-muted-foreground">No team activity yet — run an optimisation cycle.</p>}
      </CardContent>
    </Card>
  );
}

export default function OverviewPage() {
  const { site, siteId } = useSiteCtx();
  const latest = useLatestAudit(siteId);
  const audits = useAudits(siteId);
  const cycles = useCycles(siteId);
  const metrics = useMetrics(siteId);
  const tracked = useTrackedJob(siteId);
  const ring = useMediaQuery("(max-width: 640px)") ? 92 : 132;
  const jobId = tracked ?? site.active_job?.id ?? null;
  const r = latest.report;

  const trend = (audits.data ?? []).filter((a) => a.status === "done").slice(0, 12).reverse()
    .map((a) => ({ date: formatShortDate(a.created_at), overall: a.overall_score, seo: a.seo_score, adsense: a.adsense_score }));
  const sections = r ? SECTIONS.map((k) => ({ section: `${k} · ${SECTION_NAMES[k]}`, short: k, score: r.section_scores[k] })) : [];
  const lastCycle = cycles.data?.[0];
  const topFindings = r?.findings.filter((f) => f.severity !== "info").slice(0, 5) ?? [];

  return (
    <div className="grid gap-6">
      <Hero />
      {jobId != null && <JobProgress key={jobId} jobId={jobId} siteId={siteId} onDismiss={tracked ? () => jobTracker.dismiss(siteId) : undefined} />}

      {latest.isLoading ? (
        <div className="grid gap-4 md:grid-cols-3"><Skeleton className="h-52" /><Skeleton className="h-52" /><Skeleton className="h-52" /></div>
      ) : !r ? (
        <EmptyState icon={<BookOpenCheck />} title="No audit yet" description="Run an audit — Theo will crawl the site and check all 40 AdSense requirements plus core SEO." />
      ) : (
        <>
          <Reveal className="grid gap-4 lg:grid-cols-[1.1fr_1fr]">
            <Card data-reveal className="shadow-xs">
              <CardHeader>
                <CardTitle>Scores</CardTitle>
                <CardDescription>Audit #{latest.summary?.id} · {r.pages_crawled} URLs crawled</CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-3 gap-2">
                <ScoreRing size={ring} stroke={ring < 100 ? 8 : 11} score={r.overall_score} label="Overall" sublabel="SEO + AdSense" />
                <ScoreRing size={ring} stroke={ring < 100 ? 8 : 11} score={r.seo_score} label="SEO health" sublabel="Technical & on-page" />
                <ScoreRing size={ring} stroke={ring < 100 ? 8 : 11} score={r.adsense_score} label="AdSense ready" sublabel="40-point manual" />
              </CardContent>
            </Card>
            <Card data-reveal className="shadow-xs">
              <CardHeader>
                <CardTitle>AdSense sections</CardTitle>
                <CardDescription>Score per section of the approval manual</CardDescription>
              </CardHeader>
              <CardContent>
                <ChartContainer config={sectionChart} className="h-56 w-full">
                  <BarChart data={sections} layout="vertical" margin={{ left: 0, right: 12 }}>
                    <CartesianGrid horizontal={false} />
                    <XAxis type="number" domain={[0, 100]} hide />
                    <YAxis dataKey="short" type="category" tickLine={false} axisLine={false} width={24} />
                    <ChartTooltip cursor={false} content={<ChartTooltipContent labelKey="section" nameKey="score" />} />
                    <Bar dataKey="score" fill="var(--color-score)" radius={4} barSize={14} animationDuration={900} />
                  </BarChart>
                </ChartContainer>
              </CardContent>
            </Card>
          </Reveal>

          <Reveal className="grid grid-cols-1 gap-4 @xl/main:grid-cols-2 @5xl/main:grid-cols-5">
            <StatCard icon={<Globe />} label="Pages crawled" value={r.stats.html_pages} hint={r.stats.truncated ? "crawl limit reached" : "HTML pages"} />
            <StatCard icon={<FileText />} label="Articles" value={r.stats.articles} hint={`${r.stats.avg_words} words avg`} />
            <StatCard icon={<Link2Off />} label="Broken links" value={r.stats.broken} tone={r.stats.broken ? "danger" : "success"} />
            <StatCard icon={<MapIcon />} label="Sitemap URLs" value={r.stats.sitemap_urls} />
            <StatCard icon={<Wrench />} label="Fixes to review" value={site.counts.proposed_fixes} hint={`${site.counts.applied_fixes} applied`} />
          </Reveal>
        </>
      )}

      <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <div className="grid content-start gap-4">
          {trend.length > 1 && (
            <Card className="shadow-xs">
              <CardHeader><CardTitle>Score trend</CardTitle><CardDescription>Last {trend.length} audits</CardDescription></CardHeader>
              <CardContent>
                <ChartContainer config={trendChart} className="h-52 w-full">
                  <AreaChart data={trend} margin={{ left: 0, right: 8 }}>
                    <defs>
                      {Object.keys(trendChart).map((k) => (
                        <linearGradient key={k} id={`fill-${k}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={`var(--color-${k})`} stopOpacity={0.35} /><stop offset="95%" stopColor={`var(--color-${k})`} stopOpacity={0} />
                        </linearGradient>
                      ))}
                    </defs>
                    <CartesianGrid vertical={false} />
                    <XAxis dataKey="date" tickLine={false} axisLine={false} />
                    <YAxis domain={[0, 100]} tickLine={false} axisLine={false} width={28} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    {Object.keys(trendChart).map((k) => <Area key={k} dataKey={k} type="monotone" stroke={`var(--color-${k})`} fill={`url(#fill-${k})`} strokeWidth={2} />)}
                  </AreaChart>
                </ChartContainer>
              </CardContent>
            </Card>
          )}
          {(metrics.data?.length ?? 0) > 1 && (
            <Card className="shadow-xs">
              <CardHeader><CardTitle>Search Console</CardTitle><CardDescription>Daily clicks & impressions</CardDescription></CardHeader>
              <CardContent>
                <ChartContainer config={gscChart} className="h-52 w-full">
                  <AreaChart data={(metrics.data ?? []).map((m) => ({ ...m, date: formatShortDate(m.captured_at) }))}>
                    <CartesianGrid vertical={false} />
                    <XAxis dataKey="date" tickLine={false} axisLine={false} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Area dataKey="impressions" type="monotone" stroke="var(--color-impressions)" fill="var(--color-impressions)" fillOpacity={0.12} />
                    <Area dataKey="clicks" type="monotone" stroke="var(--color-clicks)" fill="var(--color-clicks)" fillOpacity={0.2} />
                  </AreaChart>
                </ChartContainer>
              </CardContent>
            </Card>
          )}
          {lastCycle?.output?.cycle && (
            <Card className="shadow-xs">
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Sparkles className="size-4 text-primary" /> Latest cycle</CardTitle>
                <CardDescription>Maya's report · {timeAgo(lastCycle.finished_at ?? lastCycle.created_at)}</CardDescription>
                <CardAction><Button asChild variant="ghost" size="sm"><Link to="../cycles" relative="path">Details <ArrowRight /></Link></Button></CardAction>
              </CardHeader>
              <CardContent className="grid gap-3 text-sm">
                <p className="leading-relaxed">{lastCycle.output.cycle.summary}</p>
                {lastCycle.output.cycle.next_focus && <p><span className="font-medium">Next focus: </span><span className="text-muted-foreground">{lastCycle.output.cycle.next_focus}</span></p>}
              </CardContent>
            </Card>
          )}
          {topFindings.length > 0 && (
            <Card className="shadow-xs">
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Bug className="size-4 text-primary" /> Top issues</CardTitle>
                <CardAction><Button asChild variant="ghost" size="sm"><Link to="../findings" relative="path">All findings <ArrowRight /></Link></Button></CardAction>
              </CardHeader>
              <CardContent className="grid gap-2">
                {topFindings.map((f) => (
                  <div key={f.code} className="flex items-start gap-3 rounded-lg border p-3">
                    <SeverityBadge severity={f.severity} />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium">{f.title}</div>
                      {f.urls[0] && <ExternalLink href={f.urls[0]} className="text-xs">{f.urls[0]}</ExternalLink>}
                    </div>
                    {f.requirement && <Pill tone="neutral">R{f.requirement}</Pill>}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
        <div className="grid content-start gap-4">
          <TeamStrip />
          <Card className="shadow-xs">
            <CardHeader><CardTitle>Connections</CardTitle></CardHeader>
            <CardContent className="grid gap-2 text-sm">
              <SectionLabel>Where fixes are applied</SectionLabel>
              <div className="flex items-center justify-between rounded-lg border p-3"><span>{site.connector_type ? `${site.connector_type[0].toUpperCase()}${site.connector_type.slice(1)}` : "No connector"}</span><Pill tone={site.connector_configured ? "success" : "warning"}>{site.connector_configured ? <CircleCheck /> : <CircleDashed />}{site.connector_configured ? "Connected" : "Not set"}</Pill></div>
              <div className="flex items-center justify-between rounded-lg border p-3"><span>Google Search Console</span><Pill tone={site.gsc_configured ? "success" : "neutral"}>{site.gsc_configured ? <CircleCheck /> : <CircleDashed />}{site.gsc_configured ? "Connected" : "Optional"}</Pill></div>
              <Button asChild variant="outline" size="sm" className="mt-1"><Link to="../settings" relative="path">Manage connections</Link></Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
