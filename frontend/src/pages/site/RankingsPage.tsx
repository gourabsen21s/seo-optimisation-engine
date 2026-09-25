import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { ArrowDown, ArrowUp, Crown, LineChart as LineChartIcon, Minus, Plus, RefreshCw, Search, Target, Trash2, Trophy } from "lucide-react";
import { EmptyState, ExternalLink, PageHeader, StatCard } from "@/components/common/blocks";
import { JobProgress } from "@/components/common/JobProgress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { EmployeeAvatar } from "@/features/team/EmployeeAvatar";
import { jobTracker, useAddKeywords, useCapabilities, useCheckRankings, useDeleteKeyword, useKeywordHistory, useKeywords, useTrackedJob } from "@/lib/hooks";
import type { TrackedKeyword } from "@/lib/types";
import { cn, formatShortDate, pathOf, timeAgo } from "@/lib/utils";
import { useSiteCtx } from "./SiteLayout";

const historyChart = { position: { label: "Position", color: "var(--primary)" } } satisfies ChartConfig;

function Position({ value }: { value: number | null }) {
  if (value == null) return <span className="text-muted-foreground">—</span>;
  const v = Math.round(value * 10) / 10;
  return (
    <span className="inline-flex items-center gap-1 font-semibold tabular-nums">
      {v <= 3 && <Crown className="size-3.5 text-amber-500" />}
      {v}
    </span>
  );
}

function Change({ value }: { value: number | null }) {
  if (value == null || value === 0) return <span className="inline-flex items-center gap-0.5 text-xs text-muted-foreground"><Minus className="size-3" /></span>;
  const up = value > 0;
  return (
    <span className={cn("inline-flex items-center gap-0.5 text-xs font-medium tabular-nums", up ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400")}>
      {up ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />}{Math.abs(value)}
    </span>
  );
}

/** Tiny position sparkline (lower is better, so the axis is inverted). */
function Sparkline({ points }: { points: TrackedKeyword["trend"] }) {
  const data = points.filter((p) => p.position != null);
  if (data.length < 2) return <span className="text-xs text-muted-foreground">—</span>;
  const max = Math.max(...data.map((p) => p.position!));
  const min = Math.min(...data.map((p) => p.position!));
  const w = 88;
  const h = 24;
  const x = (i: number) => (i / (data.length - 1)) * (w - 4) + 2;
  const y = (v: number) => (max === min ? h / 2 : ((v - min) / (max - min)) * (h - 4) + 2);
  const d = data.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(p.position!).toFixed(1)}`).join(" ");
  const improving = data[data.length - 1].position! <= data[0].position!;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="overflow-visible" aria-hidden>
      <path d={d} fill="none" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"
        className={improving ? "stroke-emerald-500" : "stroke-red-500"} />
      <circle cx={x(data.length - 1)} cy={y(data[data.length - 1].position!)} r="2.25" className={improving ? "fill-emerald-500" : "fill-red-500"} />
    </svg>
  );
}

function AddKeywordsDialog({ siteId }: { siteId: number }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [target, setTarget] = useState("");
  const add = useAddKeywords(siteId);
  const keywords = text.split("\n").map((k) => k.trim()).filter(Boolean);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm"><Plus /> Track keywords</Button></DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Track keywords</DialogTitle>
          <DialogDescription>Rankings are checked daily. Your crew also adds keywords it finds valuable.</DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="kw">Keywords</FieldLabel>
            <Textarea id="kw" rows={6} value={text} onChange={(e) => setText(e.target.value)} placeholder={"one keyword per line\nsourdough starter\nhow to feed a sourdough starter"} />
            <FieldDescription>{keywords.length} keyword{keywords.length === 1 ? "" : "s"}</FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="target">Target page <span className="font-normal text-muted-foreground">(optional)</span></FieldLabel>
            <Input id="target" type="url" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="https://example.com/guide/" />
          </Field>
        </FieldGroup>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button disabled={!keywords.length || add.isPending} onClick={() => add.mutate(keywords.map((keyword) => ({ keyword, target_url: target || null })), {
            onSuccess: () => { setOpen(false); setText(""); setTarget(""); },
          })}>Track {keywords.length || ""}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function KeywordSheet({ siteId, keyword, onClose }: { siteId: number; keyword: TrackedKeyword | null; onClose: () => void }) {
  const history = useKeywordHistory(siteId, keyword?.id ?? null);
  const data = (history.data ?? []).map((h) => ({ date: formatShortDate(h.at), position: h.position }));
  const latest = history.data?.at(-1);
  return (
    <Sheet open={!!keyword} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full gap-0 sm:max-w-xl">
        {keyword && (
          <>
            <SheetHeader className="border-b">
              <SheetTitle className="pr-8">{keyword.keyword}</SheetTitle>
              <SheetDescription>
                {keyword.country.toUpperCase()} · {keyword.source === "gsc" ? "Search Console average position" : keyword.source ? `Live results via ${keyword.source}` : "Not checked yet"}
              </SheetDescription>
            </SheetHeader>
            <div className="grid gap-6 overflow-y-auto p-4">
              <div className="grid grid-cols-3 gap-3 text-sm">
                <div className="rounded-lg border p-3"><div className="text-muted-foreground">Current</div><div className="text-2xl"><Position value={keyword.position} /></div></div>
                <div className="rounded-lg border p-3"><div className="text-muted-foreground">Best</div><div className="text-2xl"><Position value={keyword.best} /></div></div>
                <div className="rounded-lg border p-3"><div className="text-muted-foreground">Change</div><div className="pt-2"><Change value={keyword.change} /></div></div>
              </div>
              <Card className="shadow-xs">
                <CardHeader><CardTitle>Position history</CardTitle><CardDescription>Lower is better · last 90 days</CardDescription></CardHeader>
                <CardContent>
                  {history.isLoading ? <Skeleton className="h-48" /> : data.length > 1 ? (
                    <ChartContainer config={historyChart} className="h-48 w-full">
                      <LineChart data={data} margin={{ left: 0, right: 8, top: 8 }}>
                        <CartesianGrid vertical={false} />
                        <XAxis dataKey="date" tickLine={false} axisLine={false} minTickGap={24} />
                        <YAxis reversed domain={[1, "dataMax"]} allowDecimals={false} tickLine={false} axisLine={false} width={28} />
                        <ChartTooltip content={<ChartTooltipContent />} />
                        <Line dataKey="position" type="monotone" stroke="var(--color-position)" strokeWidth={2} dot={false} connectNulls />
                      </LineChart>
                    </ChartContainer>
                  ) : <p className="text-sm text-muted-foreground">History appears after two checks.</p>}
                </CardContent>
              </Card>
              {keyword.url && (
                <div className="grid gap-1 text-sm">
                  <div className="font-medium">Ranking page</div>
                  <ExternalLink href={keyword.url}>{pathOf(keyword.url)}</ExternalLink>
                  {keyword.target_url && keyword.target_url !== keyword.url && (
                    <p className="text-xs text-amber-600 dark:text-amber-400">Differs from the target page ({pathOf(keyword.target_url)}) — possible cannibalisation.</p>
                  )}
                </div>
              )}
              {!!latest?.competitors?.length && (
                <div className="grid gap-2">
                  <div className="text-sm font-medium">Top results at last check</div>
                  <div className="grid gap-1.5">
                    {latest.competitors.map((c) => (
                      <div key={`${c.position}-${c.url}`} className="flex items-center gap-3 rounded-lg border p-2.5 text-sm">
                        <span className="w-6 text-center font-semibold tabular-nums text-muted-foreground">{c.position}</span>
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-medium">{c.title || c.domain}</div>
                          <ExternalLink href={c.url} className="text-xs">{c.domain}</ExternalLink>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

export default function RankingsPage() {
  const { siteId, site } = useSiteCtx();
  const keywords = useKeywords(siteId);
  const caps = useCapabilities();
  const check = useCheckRankings(siteId);
  const remove = useDeleteKeyword(siteId);
  const tracked = useTrackedJob(siteId);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<TrackedKeyword | null>(null);
  const rows = useMemo(() => (keywords.data ?? []).filter((k) => !q || k.keyword.includes(q.toLowerCase()))
    .sort((a, b) => (a.position ?? 999) - (b.position ?? 999)), [keywords.data, q]);
  const all = keywords.data ?? [];
  const ranked = all.filter((k) => k.position != null);
  const avg = ranked.length ? Math.round((ranked.reduce((s, k) => s + (k.position ?? 0), 0) / ranked.length) * 10) / 10 : null;
  const canCheck = !!caps.data?.serp || site.gsc_configured;

  return (
    <div className="grid gap-6">
      <PageHeader
        icon={<LineChartIcon />}
        title="Rankings"
        description="Daily positions for the keywords that matter — tracked by you and your crew."
        actions={
          <>
            <Button variant="outline" size="sm" disabled={!all.length || !canCheck || check.isPending} onClick={() => check.mutate()}><RefreshCw className={cn(check.isPending && "animate-spin")} /> Check now</Button>
            <AddKeywordsDialog siteId={siteId} />
          </>
        }
      />

      {caps.data && !canCheck && (
        <Alert>
          <Target />
          <AlertTitle>Connect a rankings source</AlertTitle>
          <AlertDescription>
            Add a search results provider (Serper, SerpAPI or Brave) in <Link to="/settings?tab=integrations" className="underline underline-offset-4">Workspace settings → Integrations</Link>, or connect Search Console in <Link to={`/sites/${siteId}/settings`} className="underline underline-offset-4">Site settings</Link>.
          </AlertDescription>
        </Alert>
      )}

      {tracked != null && <JobProgress key={tracked} jobId={tracked} siteId={siteId} onDismiss={() => jobTracker.dismiss(siteId)} />}

      <div className="grid grid-cols-1 gap-4 @xl/main:grid-cols-2 @5xl/main:grid-cols-4">
        <StatCard icon={<Target />} label="Tracked keywords" value={all.length} />
        <StatCard icon={<Trophy />} label="Top 3" value={ranked.filter((k) => (k.position ?? 99) <= 3).length} tone="success" />
        <StatCard icon={<Crown />} label="Top 10" value={ranked.filter((k) => (k.position ?? 99) <= 10).length} hint={ranked.length ? `${ranked.length} ranking in the checked results` : undefined} />
        <StatCard icon={<LineChartIcon />} label="Average position" value={avg} hint="Of ranking keywords" />
      </div>

      {keywords.isLoading ? <Skeleton className="h-96" /> : !all.length ? (
        <EmptyState icon={<Target />} title="No keywords tracked yet"
          description="Add the searches you want to win. Zara and Ravi will also track the most valuable keywords they find."
          action={<AddKeywordsDialog siteId={siteId} />} />
      ) : (
        <Card className="gap-0 py-0 shadow-xs">
          <div className="flex items-center gap-2 border-b p-3">
            <InputGroup className="max-w-xs">
              <InputGroupAddon><Search /></InputGroupAddon>
              <InputGroupInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter keywords…" />
            </InputGroup>
            <span className="ml-auto text-xs text-muted-foreground">{rows.length} of {all.length}</span>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Keyword</TableHead>
                <TableHead className="text-right">Position</TableHead>
                <TableHead className="hidden sm:table-cell">Change</TableHead>
                <TableHead className="hidden md:table-cell">Trend</TableHead>
                <TableHead className="hidden lg:table-cell">Ranking page</TableHead>
                <TableHead className="hidden md:table-cell">Checked</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((k) => (
                <TableRow key={k.id} className="cursor-pointer" onClick={() => setOpen(k)}>
                  <TableCell className="max-w-64 pl-4">
                    <div className="flex items-center gap-2">
                      {k.added_by !== "human" && (
                        <Tooltip><TooltipTrigger asChild><span><EmployeeAvatar actor={k.added_by} size="xs" ring={false} /></span></TooltipTrigger><TooltipContent>Tracked by the crew</TooltipContent></Tooltip>
                      )}
                      <span className="truncate font-medium">{k.keyword}</span>
                      <Badge variant="outline" className="hidden px-1.5 text-muted-foreground sm:inline-flex">{k.country.toUpperCase()}</Badge>
                    </div>
                  </TableCell>
                  <TableCell className="text-right"><Position value={k.position} /></TableCell>
                  <TableCell className="hidden sm:table-cell"><Change value={k.change} /></TableCell>
                  <TableCell className="hidden md:table-cell"><Sparkline points={k.trend} /></TableCell>
                  <TableCell className="hidden max-w-56 truncate text-xs text-muted-foreground lg:table-cell">{k.url ? pathOf(k.url) : "—"}</TableCell>
                  <TableCell className="hidden text-xs text-muted-foreground md:table-cell">{k.checked_at ? timeAgo(k.checked_at) : "Pending"}</TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Button variant="ghost" size="icon-sm" aria-label={`Stop tracking ${k.keyword}`} onClick={() => remove.mutate(k.id)}><Trash2 /></Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
      <KeywordSheet siteId={siteId} keyword={open} onClose={() => setOpen(null)} />
    </div>
  );
}
