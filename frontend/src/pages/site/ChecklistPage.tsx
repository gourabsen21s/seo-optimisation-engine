import { useState } from "react";
import { ListChecks } from "lucide-react";
import { Pill, RequirementStatusIcon } from "@/components/common/badges";
import { EmptyState, PageHeader } from "@/components/common/blocks";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useLatestAudit } from "@/lib/hooks";
import type { RequirementStatus } from "@/lib/types";
import { LEVEL_LABELS, SECTION_NAMES, SECTIONS } from "@/lib/utils";
import { useSiteCtx } from "./SiteLayout";

export default function ChecklistPage() {
  const { siteId } = useSiteCtx();
  const { report, isLoading } = useLatestAudit(siteId);
  const [filter, setFilter] = useState<"all" | RequirementStatus>("all");
  if (isLoading) return <Skeleton className="h-96" />;
  if (!report) return <EmptyState icon={<ListChecks />} title="No audit yet" description="Run an audit from the Overview." />;

  const reqs = report.requirements;
  const count = (s: RequirementStatus) => reqs.filter((r) => r.status === s).length;
  const automated = reqs.filter((r) => r.status !== "manual").length;
  const mandatoryFail = reqs.filter((r) => r.status === "fail" && r.level === "mandatory").length;
  const shown = reqs.filter((r) => filter === "all" || r.status === filter);

  return (
    <div className="grid gap-5">
      <PageHeader icon={<ListChecks />} title="AdSense approval checklist" description="All 40 requirements from the approval manual, checked automatically where possible." />
      <Card className="shadow-xs">
        <CardContent className="grid gap-4 p-5 md:grid-cols-[auto_1fr] md:items-center">
          <div>
            <div className="text-4xl font-semibold tracking-tight tabular">{count("pass")}<span className="text-lg text-muted-foreground">/{automated}</span></div>
            <div className="text-sm text-muted-foreground">automated checks passing</div>
          </div>
          <div className="grid gap-2">
            <Progress value={(count("pass") / Math.max(1, automated)) * 100} className="h-2.5 [&>div]:bg-primary" />
            <div className="flex flex-wrap gap-2 text-xs">
              <Pill tone="success">{count("pass")} pass</Pill><Pill tone="warning">{count("warn")} warnings</Pill><Pill tone="danger">{count("fail")} failing</Pill><Pill tone="neutral">{count("manual")} manual</Pill>
              {mandatoryFail > 0 && <Pill tone="danger">{mandatoryFail} mandatory failing</Pill>}
            </div>
          </div>
        </CardContent>
      </Card>
      <Tabs value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
        <TabsList>
          <TabsTrigger value="all">All {reqs.length}</TabsTrigger>
          <TabsTrigger value="fail">Failing {count("fail")}</TabsTrigger>
          <TabsTrigger value="warn">Warnings {count("warn")}</TabsTrigger>
          <TabsTrigger value="manual">Manual {count("manual")}</TabsTrigger>
          <TabsTrigger value="pass">Passing {count("pass")}</TabsTrigger>
        </TabsList>
      </Tabs>
      <Accordion type="multiple" defaultValue={SECTIONS} className="grid gap-3">
        {SECTIONS.map((sec) => {
          const items = shown.filter((r) => r.section === sec);
          if (!items.length) return null;
          const all = reqs.filter((r) => r.section === sec);
          return (
            <AccordionItem key={sec} value={sec} className="overflow-hidden rounded-xl border bg-card shadow-xs last:border-b">
              <AccordionTrigger className="px-5 hover:no-underline">
                <div className="flex flex-1 items-center gap-3">
                  <span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-sm font-semibold text-primary">{sec}</span>
                  <span className="font-medium">{SECTION_NAMES[sec]}</span>
                  <span className="ml-auto flex items-center gap-3 text-xs text-muted-foreground">
                    {all.filter((r) => r.status === "pass").length}/{all.filter((r) => r.status !== "manual").length} passing
                    <span className="w-16 font-semibold text-foreground tabular">{report.section_scores[sec]}/100</span>
                  </span>
                </div>
              </AccordionTrigger>
              <AccordionContent className="divide-y border-t p-0">
                {items.map((r) => (
                  <div key={r.id} className="flex items-start gap-3 px-5 py-3.5">
                    <RequirementStatusIcon status={r.status} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
                        <span className="text-muted-foreground">R{r.id}</span>{r.title}
                        <Pill tone={r.level === "mandatory" ? "danger" : r.level === "strongly_advised" ? "warning" : "neutral"}>{LEVEL_LABELS[r.level]}</Pill>
                      </div>
                      <p className="mt-0.5 text-sm text-muted-foreground">{r.verify}</p>
                      {r.findings.length > 0 && <div className="mt-1.5 flex flex-wrap gap-1">{r.findings.map((c) => <code key={c} className="rounded bg-muted px-1.5 py-0.5 text-[11px]">{c}</code>)}</div>}
                    </div>
                  </div>
                ))}
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>
    </div>
  );
}
