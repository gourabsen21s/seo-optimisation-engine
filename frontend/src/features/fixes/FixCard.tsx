/* eslint-disable @typescript-eslint/no-explicit-any */
import { ArrowRight, Bot, Braces, Code2, FileCode2, FileMinus2, FilePen, FilePlus2, GitPullRequest, Hand, Link, Unlink, Heading, Image, Languages, Link2, MonitorSmartphone, RotateCcw, Share2, ShieldCheck, ShieldX, TextCursorInput, TrendingDown, TrendingUp, UserRound } from "lucide-react";
import { Pill } from "@/components/common/badges";
import { CodeBlock, DiffView, ExternalLink, Markdown } from "@/components/common/blocks";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import type { Fix, FixKind } from "@/lib/types";
import { cn, pathOf, timeAgo } from "@/lib/utils";

export const FIX_META: Record<FixKind, { label: string; icon: typeof Heading }> = {
  set_title: { label: "Title", icon: Heading },
  set_meta_description: { label: "Meta description", icon: TextCursorInput },
  set_canonical: { label: "Canonical", icon: Link2 },
  set_lang: { label: "Language", icon: Languages },
  add_viewport: { label: "Viewport", icon: MonitorSmartphone },
  set_image_alt: { label: "Image alt text", icon: Image },
  add_json_ld: { label: "Structured data", icon: Braces },
  set_open_graph: { label: "Open Graph", icon: Share2 },
  write_file: { label: "Site file", icon: FileCode2 },
  create_page: { label: "New page draft", icon: FilePlus2 },
  add_internal_link: { label: "Internal link", icon: Link },
  remove_internal_link: { label: "Remove link", icon: Unlink },
  code_change: { label: "Code change", icon: Code2 },
  manual: { label: "Manual action", icon: Hand },
};

const ROLLBACKABLE: FixKind[] = ["set_title", "set_meta_description", "add_internal_link", "code_change"];

function LinkChange({ p, removing }: { p: Record<string, any>; removing?: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border p-2.5 text-sm">
      {removing ? <Unlink className="size-4 text-muted-foreground" /> : <Link className="size-4 text-muted-foreground" />}
      <span>“<span className={cn("font-medium", !removing && "underline decoration-primary/40 underline-offset-4")}>{p.anchor_text}</span>”</span>
      <ArrowRight className="size-3.5 text-muted-foreground" />
      <ExternalLink href={p.href} className="text-sm">{p.target_title || pathOf(p.href)}</ExternalLink>
    </div>
  );
}

function CodeChange({ p }: { p: Record<string, any> }) {
  const files = (p.files ?? []) as { path: string; before: string | null; after: string | null }[];
  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <GitPullRequest className="size-3.5" /> Ships as a pull request{p.source ? ` to ${String(p.source).replace(/^github:/, "")}` : ""}
      </div>
      <div className="grid gap-1 rounded-lg border p-2">
        {files.map((f) => {
          const Icon = f.before == null ? FilePlus2 : f.after == null ? FileMinus2 : FilePen;
          const tone = f.before == null ? "text-emerald-600" : f.after == null ? "text-red-600" : "text-muted-foreground";
          return (
            <div key={f.path} className="flex items-center gap-2 font-mono text-xs">
              <Icon className={cn("size-3.5 shrink-0", tone)} /><span className="truncate">{f.path}</span>
              <span className="ml-auto shrink-0 text-muted-foreground">{f.before == null ? "new" : f.after == null ? "deleted" : "modified"}</span>
            </div>
          );
        })}
      </div>
      {p.details && <div className="rounded-lg bg-muted/40 p-3"><Markdown>{p.details}</Markdown></div>}
      {p.diff && (
        <Collapsible>
          <CollapsibleTrigger asChild><Button variant="outline" size="xs"><Code2 /> View diff</Button></CollapsibleTrigger>
          <CollapsibleContent className="mt-2"><DiffView diff={p.diff} /></CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
}

function BeforeAfter({ before, after }: { before?: string | null; after?: string | null }) {
  return (
    <div className="grid items-stretch gap-2 md:grid-cols-[1fr_auto_1fr]">
      <div className="rounded-lg border bg-muted/40 p-2.5 text-sm"><div className="mb-1 text-[11px] font-medium text-muted-foreground uppercase">Before</div>{before || <span className="text-muted-foreground italic">(missing)</span>}</div>
      <ArrowRight className="hidden size-4 self-center text-muted-foreground md:block" />
      <div className="rounded-lg border border-primary/30 bg-primary/5 p-2.5 text-sm"><div className="mb-1 text-[11px] font-medium text-primary uppercase">After · {after?.length ?? 0} chars</div>{after}</div>
    </div>
  );
}

function Payload({ fix }: { fix: Fix }) {
  const p = fix.payload as Record<string, any>;
  switch (fix.kind) {
    case "set_title": return <BeforeAfter before={p.previous} after={p.title} />;
    case "set_meta_description": return <BeforeAfter before={p.previous} after={p.meta_description} />;
    case "set_canonical": return <BeforeAfter before={p.previous} after={p.canonical} />;
    case "set_lang": return <BeforeAfter before={p.previous} after={p.lang} />;
    case "add_viewport": return <CodeBlock>{`<meta name="viewport" content="${p.viewport ?? "width=device-width, initial-scale=1"}">`}</CodeBlock>;
    case "set_image_alt":
      return (
        <div className="grid gap-1.5">
          {(p.alts ?? []).map((a: { src: string; alt: string }) => (
            <div key={a.src} className="flex items-center gap-2 rounded-lg border p-2 text-sm">
              <Image className="size-4 shrink-0 text-muted-foreground" /><span className="max-w-48 truncate text-xs text-muted-foreground">{pathOf(a.src)}</span><ArrowRight className="size-3 text-muted-foreground" /><span>“{a.alt}”</span>
            </div>
          ))}
        </div>
      );
    case "add_json_ld": return <CodeBlock>{JSON.stringify(p.schema, null, 2)}</CodeBlock>;
    case "set_open_graph":
      return <div className="grid gap-1 text-sm">{Object.entries(p).filter(([k, v]) => k !== "verification" && v).map(([k, v]) => <div key={k}><span className="text-muted-foreground">og:{k}</span> {String(v)}</div>)}</div>;
    case "write_file": return <><div className="text-sm font-medium">/{p.path}</div><CodeBlock maxHeight="14rem">{p.content}</CodeBlock></>;
    case "create_page":
      return (
        <div className="grid gap-2">
          <div className="text-sm"><span className="font-medium">{p.title}</span> <span className="text-muted-foreground">/{p.slug}/ · {p.publish ? "will publish" : "draft"}</span></div>
          <div className="prose-chat max-h-56 overflow-y-auto rounded-lg border bg-muted/30 p-3" dangerouslySetInnerHTML={{ __html: p.html }} />
        </div>
      );
    case "add_internal_link": return <LinkChange p={p} />;
    case "remove_internal_link": return <LinkChange p={p} removing />;
    case "code_change": return <CodeChange p={p} />;
    case "manual": return <p className="text-sm whitespace-pre-wrap">{p.instructions}</p>;
    default: return <CodeBlock>{JSON.stringify(p, null, 2)}</CodeBlock>;
  }
}

function Verification({ v }: { v: Record<string, any> }) {
  const passed = v.passed === true;
  const conf = typeof v.confidence === "object" && v.confidence ? Math.min(...(Object.values(v.confidence) as number[])) : null;
  const reasons = [v.accurate === false && "Not accurate to the page", v.clickbait_or_stuffed === true && "Clickbait or keyword-stuffed", v.policy_safe === false && "Possible policy issue", v.error && `Error: ${v.error}`].filter(Boolean);
  return (
    <div className={cn("flex items-start gap-2 rounded-lg p-2.5 text-xs", passed ? "bg-emerald-500/10 text-emerald-800 dark:text-emerald-300" : "bg-amber-500/10 text-amber-800 dark:text-amber-300")}>
      {passed ? <ShieldCheck className="size-4 shrink-0" /> : <ShieldX className="size-4 shrink-0" />}
      <div>
        <div className="font-medium">Jev {passed ? "verified this change" : "held this change for review"}{conf != null && ` · ${Math.round(conf * 100)}% confidence`}</div>
        {reasons.length > 0 && <div>{reasons.join(" · ")}</div>}
      </div>
    </div>
  );
}

export function FixCard({ fix, selected, onSelect, onRollback }: { fix: Fix; selected: boolean; onSelect?: (v: boolean) => void; onRollback?: () => void }) {
  const meta = FIX_META[fix.kind] ?? FIX_META.manual;
  const v = fix.payload?.verification as Record<string, any> | undefined;
  const impact = fix.impact?.verdict;
  return (
    <Card className={cn("gap-3 p-4 shadow-xs transition-shadow hover:shadow-xs", selected && "ring-2 ring-primary/50")}>
      <div className="flex items-start gap-3">
        {onSelect && <Checkbox checked={selected} onCheckedChange={(c) => onSelect(c === true)} className="mt-1" aria-label="Select fix" />}
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted text-foreground"><meta.icon className="size-4" /></span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-medium">{fix.title}</span>
            <Pill tone="neutral">{meta.label}</Pill>
            <Pill tone={fix.risk === "safe" ? "success" : "warning"}>{fix.risk === "safe" ? "Low risk" : "Needs review"}</Pill>
            <Pill tone={fix.source === "agent" ? "brand" : "neutral"}>{fix.source === "agent" ? <Bot /> : <UserRound />}{fix.source === "agent" ? "AI crew" : fix.source === "rules" ? "Rule engine" : fix.source}</Pill>
            {fix.requirement && <Pill tone="neutral">R{fix.requirement}</Pill>}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
            {fix.target_url && <ExternalLink href={fix.target_url}>{pathOf(fix.target_url)}</ExternalLink>}
            <span>{timeAgo(fix.applied_at ?? fix.created_at)}</span>
          </div>
          {fix.rationale && <p className="mt-1.5 text-sm text-muted-foreground">{fix.rationale}</p>}
        </div>
      </div>
      <div className={cn("grid gap-3", onSelect && "md:pl-8")}>
        <Payload fix={fix} />
        {v && <Verification v={v} />}
        {fix.result && (
          <Collapsible>
            <div className={cn("flex items-center gap-2 rounded-lg p-2.5 text-xs", fix.result.ok ? "bg-muted" : "bg-red-500/10 text-red-700 dark:text-red-400")}>
              <span className="flex-1">{fix.result.message}</span>
              {fix.result.diff && <CollapsibleTrigger asChild><Button variant="ghost" size="xs">View diff</Button></CollapsibleTrigger>}
            </div>
            {fix.result.diff && <CollapsibleContent className="mt-2"><DiffView diff={fix.result.diff} /></CollapsibleContent>}
          </Collapsible>
        )}
        {impact && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Pill tone={impact === "improved" ? "success" : impact === "worse" ? "danger" : "neutral"}>
              {impact === "improved" ? <TrendingUp /> : impact === "worse" ? <TrendingDown /> : null}Impact: {impact}
            </Pill>
            {fix.impact?.rolled_back && <Pill tone="warning"><RotateCcw />Rolled back</Pill>}
            {fix.impact?.delta && <span className="text-xs text-muted-foreground">{Object.entries(fix.impact.delta).map(([k, d]) => `${k.replace(/_/g, " ")} ${d > 0 ? "+" : ""}${d}`).join(" · ")}</span>}
          </div>
        )}
        {fix.status === "applied" && onRollback && ROLLBACKABLE.includes(fix.kind) && !fix.impact?.rolled_back && fix.source !== "rollback"
          && (fix.payload.previous || ["add_internal_link", "code_change"].includes(fix.kind)) && (
          <Button variant="outline" size="sm" className="justify-self-start" onClick={onRollback}><RotateCcw /> Roll back</Button>
        )}
      </div>
    </Card>
  );
}
