import { useCallback, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Activity, Radio, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { invalidateSite, useJobStream } from "@/lib/hooks";
import type { Job } from "@/lib/types";
import { cn, formatDuration, formatTime, titleCase } from "@/lib/utils";
import { JobStatusBadge } from "./badges";

const JOB_LABELS: Record<string, string> = {
  audit: "Site audit",
  cycle: "Optimisation cycle",
  apply: "Applying fixes",
  rollback: "Rolling back fix",
  measure: "Measuring impact",
  task: "Team task",
  standup: "Daily standup",
  weekly_report: "Weekly report",
};

export const jobLabel = (type?: string | null) => (type ? (JOB_LABELS[type] ?? titleCase(type)) : "Job");

/** Live, auto-scrolling log for a background job (SSE with polling fallback). */
export function JobProgress({ jobId, siteId, onDismiss, onDone: onDoneProp, className }: {
  jobId: number;
  siteId: number | null;
  onDismiss?: () => void;
  onDone?: (job: Job) => void;
  className?: string;
}) {
  const qc = useQueryClient();
  const onDone = useCallback(
    (job: Job) => {
      invalidateSite(qc, job.site_id ?? siteId);
      const label = jobLabel(job.type);
      if (job.status === "done") toast.success(`${label} finished`);
      else toast.error(`${label} failed`, { description: job.error ?? undefined });
      onDoneProp?.(job);
    },
    [qc, siteId, onDoneProp],
  );
  const { job, events, status, transport, error } = useJobStream(jobId, onDone);
  const logRef = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  useEffect(() => {
    const el = logRef.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [events.length]);

  const active = status === "queued" || status === "running" || status == null;

  return (
    <Card className={cn("gap-0 overflow-hidden py-0 shadow-xs", active && " ", className)} aria-live="polite">
      <div className="flex flex-wrap items-center gap-3 px-4 py-3">
        <div className={cn("flex size-9 items-center justify-center rounded-xl", active ? "bg-primary text-white" : "bg-muted text-muted-foreground")}>
          <Activity className={cn("size-4", active && "animate-pulse")} aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-sm font-medium">
            {jobLabel(job?.type)} <span className="font-normal text-muted-foreground">#{jobId}</span>
          </div>
          <div className="text-xs text-muted-foreground">
            {job?.started_at ? `Started ${formatTime(job.started_at)}` : "Waiting to start…"}
            {job?.finished_at && ` · took ${formatDuration(job.started_at, job.finished_at)}`}
            {transport && active && (
              <span className="ml-2 inline-flex items-center gap-1"><Radio className="size-3" aria-hidden /> {transport === "sse" ? "live" : "polling"}</span>
            )}
          </div>
        </div>
        <JobStatusBadge status={status ?? "queued"} />
        {onDismiss && !active && (
          <Button variant="ghost" size="icon-sm" onClick={onDismiss} aria-label="Dismiss"><X /></Button>
        )}
      </div>
      {active && <Progress value={null} className="h-0.5 rounded-none [&>div]:animate-pulse [&>div]:bg-primary" />}
      <div
        ref={logRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
        }}
        className="scrollbar-thin max-h-60 overflow-y-auto border-t bg-muted/30 px-4 py-3 font-mono text-xs leading-5"
        role="log"
        aria-label="Job log"
      >
        {events.length === 0 && <div className="text-muted-foreground">{error ? `Could not load progress: ${error}` : "Waiting for progress…"}</div>}
        {events.map((e, i) => (
          <div key={`${e.at}-${i}`} className="flex gap-2 animate-in fade-in slide-in-from-bottom-1">
            <span className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", e.level === "error" ? "bg-red-500" : e.level === "warning" ? "bg-amber-500" : "bg-primary/60")} />
            <span className="shrink-0 text-muted-foreground tabular">{formatTime(e.at)}</span>
            <span className={cn("break-words", e.level === "error" && "text-red-600 dark:text-red-400", e.level === "warning" && "text-amber-600 dark:text-amber-400")}>{e.message}</span>
          </div>
        ))}
        {job?.status === "failed" && job.error && <div className="mt-2 text-red-600 dark:text-red-400">Error: {job.error}</div>}
      </div>
    </Card>
  );
}
