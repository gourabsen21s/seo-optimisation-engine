import { useState } from "react";
import { CalendarDays, Newspaper, Sparkles, Sun } from "lucide-react";
import { Pill } from "@/components/common/badges";
import { EmptyState, Markdown, PageHeader } from "@/components/common/blocks";
import { JobProgress } from "@/components/common/JobProgress";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmployeeAvatar } from "@/features/team/EmployeeAvatar";
import { useGenerateReport, useReports } from "@/lib/hooks";
import type { ReportKind } from "@/lib/types";
import { cn, formatDateTime, timeAgo } from "@/lib/utils";
import { useSiteCtx } from "./SiteLayout";

const KIND = { standup: { label: "Standup", icon: Sun }, weekly: { label: "Weekly", icon: CalendarDays }, cycle: { label: "Cycle", icon: Sparkles } } as const;

export default function ReportsPage() {
  const { siteId } = useSiteCtx();
  const [kind, setKind] = useState<ReportKind | "all">("all");
  const reports = useReports(siteId, kind === "all" ? null : kind);
  const gen = useGenerateReport(siteId);
  const [jobId, setJobId] = useState<number | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const list = reports.data ?? [];
  const selected = list.find((r) => r.id === selectedId) ?? list[0];

  const generate = (k: "standup" | "weekly") => gen.mutate(k, { onSuccess: (r) => setJobId(r.job_id) });

  return (
    <div className="grid gap-5">
      <PageHeader
        icon={<Newspaper />}
        title="Reports"
        description="Daily standups, weekly reports from Maya, and a report at the end of every optimisation cycle."
        actions={<>
          <Button variant="outline" onClick={() => generate("standup")} disabled={gen.isPending}><Sun /> Standup now</Button>
          <Button onClick={() => generate("weekly")} disabled={gen.isPending}><CalendarDays /> Weekly report</Button>
        </>}
      />
      {jobId != null && <JobProgress jobId={jobId} siteId={siteId} onDismiss={() => setJobId(null)} onDone={() => reports.refetch()} />}
      <Tabs value={kind} onValueChange={(v) => { setKind(v as typeof kind); setSelectedId(null); }}>
        <TabsList><TabsTrigger value="all">All</TabsTrigger><TabsTrigger value="standup">Standups</TabsTrigger><TabsTrigger value="weekly">Weekly</TabsTrigger><TabsTrigger value="cycle">Cycles</TabsTrigger></TabsList>
      </Tabs>
      {reports.isLoading ? <Skeleton className="h-80" /> : !list.length ? (
        <EmptyState icon={<Newspaper />} title="No reports yet" description="Reports appear automatically when autopilot is on — or generate one now." />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
          <Card className="gap-0 p-0 shadow-xs">
            <ScrollArea className="max-h-[70vh]">
              <div className="grid gap-1 p-2">
                {list.map((r) => {
                  const K = KIND[r.kind];
                  return (
                    <button key={r.id} type="button" onClick={() => setSelectedId(r.id)} className={cn("flex items-start gap-3 rounded-xl p-3 text-left transition-colors hover:bg-muted", selected?.id === r.id && "bg-primary/10")}>
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted"><K.icon className="size-4" /></span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{r.title}</span>
                        <span className="text-xs text-muted-foreground">{timeAgo(r.created_at)}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </ScrollArea>
          </Card>
          {selected && (
            <Card key={selected.id} className="shadow-xs animate-in fade-in slide-in-from-right-2">
              <CardHeader className="flex flex-row items-center gap-3">
                <EmployeeAvatar actor={selected.author} size="md" />
                <div className="min-w-0 flex-1"><CardTitle>{selected.title}</CardTitle><div className="text-xs text-muted-foreground">{formatDateTime(selected.created_at)}</div></div>
                <Pill tone="brand">{KIND[selected.kind].label}</Pill>
              </CardHeader>
              <CardContent><Markdown>{selected.content}</Markdown></CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
