import { Link } from "react-router-dom";
import { ArrowRight, CheckCircle2, Coins, KanbanSquare, Loader2, Sparkles, XCircle } from "lucide-react";
import { Pill } from "@/components/common/badges";
import { EmptyState, Markdown, PageHeader, SectionLabel } from "@/components/common/blocks";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { StrategyView } from "@/features/team/StrategyView";
import { useCycles, useStartCycle } from "@/lib/hooks";
import { compactNumber, formatDateTime, formatDuration } from "@/lib/utils";
import { useSiteCtx } from "./SiteLayout";

export default function CyclesPage() {
  const { site, siteId } = useSiteCtx();
  const cycles = useCycles(siteId);
  const start = useStartCycle(siteId);
  const runs = cycles.data ?? [];
  return (
    <div className="grid gap-5">
      <PageHeader
        icon={<Sparkles />}
        title="Cycles & strategy"
        description="Each optimisation cycle: Theo audits, Maya plans and assigns, the crew works, then Maya reviews and reports."
        actions={<Button onClick={() => start.mutate(true)} disabled={!!site.active_job || start.isPending} className="bg-primary text-primary-foreground"><Sparkles /> Run a cycle</Button>}
      />
      {cycles.isLoading ? <Skeleton className="h-64" /> : !runs.length ? (
        <EmptyState icon={<Sparkles />} title="No cycles yet" description="Start one and watch the crew get to work in the Office." />
      ) : (
        <Accordion type="single" collapsible defaultValue={String(runs[0].id)} className="grid gap-3">
          {runs.map((r) => {
            const running = r.status === "running";
            return (
              <AccordionItem key={r.id} value={String(r.id)} className="overflow-hidden rounded-xl border bg-card shadow-xs last:border-b">
                <AccordionTrigger className="px-5 py-4 hover:no-underline">
                  <div className="flex flex-1 flex-wrap items-center gap-3 text-left">
                    <span className={running ? "flex size-9 items-center justify-center rounded-xl bg-primary text-white" : "flex size-9 items-center justify-center rounded-xl bg-muted"}>
                      {running ? <Loader2 className="size-4 animate-spin" /> : r.status === "failed" ? <XCircle className="size-4 text-red-600" /> : <CheckCircle2 className="size-4 text-emerald-600" />}
                    </span>
                    <div className="min-w-0">
                      <div className="font-medium">Cycle #{r.id}</div>
                      <div className="text-xs text-muted-foreground">{formatDateTime(r.created_at)}{r.finished_at && ` · ${formatDuration(r.created_at, r.finished_at)}`}{r.model && ` · ${r.model}`}</div>
                    </div>
                    <div className="ml-auto flex flex-wrap gap-1.5">
                      <Pill tone={running ? "brand" : r.status === "failed" ? "danger" : "success"}>{running ? "Team working" : r.status}</Pill>
                      {r.usage && <Pill tone="neutral"><Coins />{compactNumber(r.usage.input_tokens + r.usage.output_tokens)} tokens</Pill>}
                    </div>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="grid gap-6 border-t px-5 pt-5 pb-6">
                  {running && !r.output?.cycle && (
                    <Card className="flex-row items-center gap-3 bg-primary/5 p-4 text-sm">
                      <Loader2 className="size-4 animate-spin text-primary" /> The team is working on this cycle's tasks. Maya writes the report when the board is clear.
                    </Card>
                  )}
                  {r.error && <p className="text-sm text-red-600">{r.error}</p>}
                  {r.output?.cycle && (
                    <div className="grid gap-4 md:grid-cols-[1.5fr_1fr]">
                      <div className="grid gap-3">
                        <SectionLabel>Summary</SectionLabel>
                        <Markdown>{r.output.cycle.summary}</Markdown>
                        {r.output.cycle.actions?.length > 0 && (
                          <ul className="grid gap-1.5 text-sm">{r.output.cycle.actions.map((a, i) => <li key={i} className="flex gap-2"><CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />{a}</li>)}</ul>
                        )}
                      </div>
                      <div className="grid content-start gap-3">
                        {r.output.cycle.next_focus && <Card className="gap-1 p-4"><SectionLabel className="mb-0">Next focus</SectionLabel><p className="text-sm">{r.output.cycle.next_focus}</p></Card>}
                        {r.output.cycle.expected_impact && <Card className="gap-1 p-4"><SectionLabel className="mb-0">Expected impact</SectionLabel><p className="text-sm">{r.output.cycle.expected_impact}</p></Card>}
                      </div>
                    </div>
                  )}
                  {r.output?.strategy && <><SectionLabel>Content strategy</SectionLabel><StrategyView strategy={r.output.strategy} /></>}
                  <Button asChild variant="outline" className="justify-self-start"><Link to={`../board?run=${r.id}`} relative="path"><KanbanSquare /> View this cycle's tasks <ArrowRight /></Link></Button>
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      )}
    </div>
  );
}
