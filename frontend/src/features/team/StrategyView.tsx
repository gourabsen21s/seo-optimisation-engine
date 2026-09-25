import { AlertTriangle, CheckSquare, FileText, Target } from "lucide-react";
import { Pill } from "@/components/common/badges";
import { Markdown, SectionLabel } from "@/components/common/blocks";
import { Card, CardContent } from "@/components/ui/card";
import type { Strategy } from "@/lib/types";

const tone = (v: string) => (v === "high" ? "danger" : v === "medium" ? "warning" : "neutral") as "danger" | "warning" | "neutral";

/** Renders the Content Strategist's structured strategy report. */
export function StrategyView({ strategy }: { strategy: Strategy }) {
  return (
    <div className="grid gap-5">
      {strategy.summary && <Markdown>{strategy.summary}</Markdown>}
      {strategy.priorities?.length > 0 && (
        <div>
          <SectionLabel>Priorities</SectionLabel>
          <div className="grid gap-2">
            {strategy.priorities.map((p, i) => (
              <div key={i} className="flex items-start gap-3 rounded-xl border bg-card/60 p-3">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">{p.title}</div>
                  <div className="text-sm text-muted-foreground">{p.why}</div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <Pill tone={tone(p.impact)}>impact {p.impact}</Pill>
                  <Pill tone="neutral">effort {p.effort}</Pill>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {strategy.content_plan?.length > 0 && (
        <div>
          <SectionLabel>Content plan</SectionLabel>
          <div className="grid gap-3 md:grid-cols-2">
            {strategy.content_plan.map((c, i) => (
              <Card key={i} className="gap-2 p-4 shadow-xs">
                <div className="flex items-start gap-2">
                  <FileText className="mt-0.5 size-4 shrink-0 text-primary" />
                  <div className="text-sm font-medium">{c.title}</div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <Pill tone="brand"><Target />{c.target_keyword}</Pill>
                  <Pill tone="neutral">{c.search_intent}</Pill>
                  <Pill tone="info">{c.action} · {c.target_words} words</Pill>
                </div>
                {c.outline?.length > 0 && (
                  <ul className="ml-5 list-disc text-xs text-muted-foreground">{c.outline.slice(0, 6).map((o, j) => <li key={j}>{o}</li>)}</ul>
                )}
              </Card>
            ))}
          </div>
        </div>
      )}
      {strategy.content_risks?.length > 0 && (
        <div>
          <SectionLabel>Content risks</SectionLabel>
          <div className="grid gap-2">
            {strategy.content_risks.map((r, i) => (
              <Card key={i} className="flex-row items-start gap-3 border-amber-500/30 bg-amber-500/5 p-3">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
                <CardContent className="grid gap-1 p-0 text-sm">
                  <div className="font-medium">{r.category} <span className="font-normal text-muted-foreground">· {r.url}</span></div>
                  <div className="text-muted-foreground">“{r.excerpt}” — {r.explanation}</div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
      {strategy.manual_actions?.length > 0 && (
        <div>
          <SectionLabel>For you to do</SectionLabel>
          <ul className="grid gap-1.5">
            {strategy.manual_actions.map((m, i) => (
              <li key={i} className="flex items-start gap-2 text-sm"><CheckSquare className="mt-0.5 size-4 shrink-0 text-muted-foreground" />{m}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
