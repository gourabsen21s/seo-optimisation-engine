import { useState } from "react";
import { Link } from "react-router-dom";
import { Building2, Check, ChevronRight, Globe, Loader2, MessageCircleQuestion, Plus, Rocket, X } from "lucide-react";
import { Pill } from "@/components/common/badges";
import { PageHeader, StatCard } from "@/components/common/blocks";
import { Reveal } from "@/components/common/motion";
import { ScoreRing } from "@/components/common/ScoreRing";
import { jobLabel } from "@/components/common/JobProgress";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { BRAND } from "@/config/brand";
import { AddSiteDialog } from "@/features/sites/AddSiteDialog";
import { autopilotMeta } from "@/features/sites/autopilot";
import { EmployeeAvatar } from "@/features/team/EmployeeAvatar";
import { EMPLOYEE_IDS } from "@/features/team/employees";
import { useMe, useSites } from "@/lib/hooks";
import type { Site } from "@/lib/types";
import { cn, hostname, timeAgo } from "@/lib/utils";
import { fmtCredits } from "@/components/layout/AccountBits";

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

function SiteCard({ site }: { site: Site }) {
  const ap = autopilotMeta(site.autopilot);
  const s = site.latest_scores;
  return (
    <Card data-reveal className="relative shadow-xs transition-colors hover:bg-accent/40">
      <CardHeader>
        <CardTitle className="truncate">
          <Link to={`/sites/${site.id}/overview`} className="after:absolute after:inset-0">{site.name}</Link>
        </CardTitle>
        <CardDescription className="truncate">{hostname(site.url)}</CardDescription>
        <CardAction><ScoreRing score={s?.overall ?? null} size={56} stroke={5} /></CardAction>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="flex flex-wrap gap-1.5">
          <Pill tone={site.autopilot === "off" ? "neutral" : "brand"}><ap.icon />{site.autopilot === "off" ? "Manual" : `Autopilot: ${site.autopilot}`}</Pill>
          {site.active_job && <Pill tone="info"><Loader2 className="animate-spin" />{jobLabel(site.active_job.type)}</Pill>}
          {(site.counts.waiting_on_you ?? 0) > 0 && <Pill tone="warning"><MessageCircleQuestion />{site.counts.waiting_on_you} waiting on you</Pill>}
        </div>
        <dl className="grid grid-cols-3 gap-4 text-sm">
          <div><dt className="text-muted-foreground">SEO</dt><dd className="text-lg font-semibold tabular-nums">{s?.seo ?? "–"}</dd></div>
          <div><dt className="text-muted-foreground">AdSense</dt><dd className="text-lg font-semibold tabular-nums">{s?.adsense ?? "–"}</dd></div>
          <div><dt className="text-muted-foreground">Fixes</dt><dd className="text-lg font-semibold tabular-nums">{site.counts.proposed_fixes}</dd></div>
        </dl>
      </CardContent>
      <CardFooter className="justify-between border-t text-xs text-muted-foreground">
        <div className="flex -space-x-1.5">{EMPLOYEE_IDS.slice(0, 5).map((id) => <EmployeeAvatar key={id} actor={id} size="xs" />)}</div>
        <span className="flex items-center gap-1">{site.last_audit_at ? `Audited ${timeAgo(site.last_audit_at)}` : "Not audited yet"} <ChevronRight className="size-3.5" /></span>
      </CardFooter>
    </Card>
  );
}

const DISMISS_KEY = "rc:onboarding-done";

/** First-run checklist: the few steps between signing up and the crew doing useful work. */
function GettingStarted({ sites }: { sites: Site[] }) {
  const me = useMe().data;
  const [hidden, setHidden] = useState(() => { try { return localStorage.getItem(DISMISS_KEY) === "1"; } catch { return false; } });
  const first = sites[0];
  const steps = [
    ...(me?.require_verification ? [{ label: "Confirm your email", done: !!me.user?.email_verified, hint: "Check your inbox for the link." }] : []),
    { label: "Add your website", done: sites.length > 0, hint: "Paste its address; the crew starts with a free look around." },
    { label: "Run your first audit", done: sites.some((s) => s.last_audit_at), hint: "Scores for SEO health and AdSense readiness.", to: first && `/sites/${first.id}/overview` },
    { label: "Review the proposed fixes", done: sites.some((s) => s.counts.applied_fixes > 0), hint: "Approve what you like; nothing changes on your site until you do.", to: first && `/sites/${first.id}/fixes` },
    { label: "Connect Search Console", done: sites.some((s) => s.gsc_configured), hint: "Optional. Real clicks, impressions and positions.", to: first && `/sites/${first.id}/settings?tab=gsc` },
  ];
  const left = steps.filter((s) => !s.done).length;
  if (hidden || left === 0) return null;
  const dismiss = () => { setHidden(true); try { localStorage.setItem(DISMISS_KEY, "1"); } catch { /* private mode */ } };
  return (
    <Card className="shadow-xs">
      <CardHeader>
        <CardTitle>Get your crew working</CardTitle>
        <CardDescription>{steps.length - left} of {steps.length} done{me?.account.metered ? ` · ${fmtCredits(Math.max(0, me.account.credits))} credits available` : ""}</CardDescription>
        <CardAction><Button variant="ghost" size="icon-sm" aria-label="Hide checklist" onClick={dismiss}><X /></Button></CardAction>
      </CardHeader>
      <CardContent>
        <ol className="grid gap-1 sm:grid-cols-2 xl:grid-cols-3">
          {steps.map((s, i) => {
            const body = (
              <>
                <span className={cn("mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border text-[11px] font-medium tabular-nums", s.done ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground")}>{s.done ? <Check className="size-3" /> : i + 1}</span>
                <span className="min-w-0"><span className={cn("block text-sm font-medium", s.done && "text-muted-foreground line-through")}>{s.label}</span><span className="block text-xs text-muted-foreground">{s.hint}</span></span>
              </>
            );
            const cls = "flex gap-3 rounded-lg p-2.5 text-left";
            return <li key={s.label}>{s.to && !s.done ? <Link to={s.to} className={cn(cls, "transition-colors hover:bg-accent")}>{body}</Link> : <div className={cls}>{body}</div>}</li>;
          })}
        </ol>
      </CardContent>
    </Card>
  );
}

export function SitesPage() {
  const me = useMe().data;
  const sites = useSites();
  const list = sites.data ?? [];

  if (sites.isLoading) {
    return <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-56 rounded-xl" />)}</div>;
  }

  if (list.length === 0) {
    return (
      <Empty className="min-h-[70svh] border border-dashed">
        <EmptyHeader>
          <EmptyMedia>
            <div className="flex -space-x-2">{EMPLOYEE_IDS.slice(0, 5).map((id) => <EmployeeAvatar key={id} actor={id} size="md" />)}</div>
          </EmptyMedia>
          <EmptyTitle>Add your first website</EmptyTitle>
          <EmptyDescription>{BRAND.description}{me?.account.metered && me.account.credits > 0 ? ` You have ${fmtCredits(me.account.credits)} credits to start with.` : ""}</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <AddSiteDialog trigger={<Button><Plus /> Add website</Button>} />
        </EmptyContent>
      </Empty>
    );
  }

  const avg = (k: "overall" | "adsense") => {
    const vals = list.map((s) => s.latest_scores?.[k]).filter((v): v is number => v != null);
    return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
  };
  const waiting = list.reduce((a, s) => a + (s.counts.waiting_on_you ?? 0), 0);
  const openTasks = list.reduce((a, s) => a + (s.counts.open_tasks ?? 0), 0);

  return (
    <div className="grid gap-6">
      <PageHeader
        title={greeting()}
        description={`Your crew is looking after ${list.length} ${list.length === 1 ? "website" : "websites"}.`}
        actions={<AddSiteDialog trigger={<Button><Plus /> Add website</Button>} />}
      />
      <GettingStarted sites={list} />
      <Reveal className="grid grid-cols-1 gap-4 @xl/main:grid-cols-2 @5xl/main:grid-cols-4">
        <StatCard icon={<Globe />} label="Websites" value={list.length} />
        <StatCard icon={<Rocket />} label="Average score" value={avg("overall")} hint="SEO + AdSense readiness" />
        <StatCard icon={<Building2 />} label="Open tasks" value={openTasks} hint="Across the crew" />
        <StatCard icon={<MessageCircleQuestion />} label="Waiting on you" value={waiting} tone={waiting ? "warning" : "default"} hint={waiting ? "Answer to unblock the team" : "Nothing needs you"} />
      </Reveal>
      <Reveal className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" deps={[list.length]}>
        {list.map((s) => <SiteCard key={s.id} site={s} />)}
        <AddSiteDialog
          trigger={
            <button type="button" data-reveal className="flex min-h-56 flex-col items-center justify-center gap-2 rounded-xl border border-dashed text-sm text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground">
              <Plus className="size-4" /> Add website
            </button>
          }
        />
      </Reveal>
    </div>
  );
}
