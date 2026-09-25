import { useMemo, useState } from "react";
import { FileSearch, Lightbulb, Search, Wrench } from "lucide-react";
import { Pill, SeverityBadge } from "@/components/common/badges";
import { EmptyState, ExternalLink, PageHeader } from "@/components/common/blocks";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useLatestAudit } from "@/lib/hooks";
import type { Severity } from "@/lib/types";
import { cn, SEVERITIES, SEVERITY_STYLES } from "@/lib/utils";
import { useSiteCtx } from "./SiteLayout";

export default function FindingsPage() {
  const { siteId } = useSiteCtx();
  const { report, isLoading } = useLatestAudit(siteId);
  const [q, setQ] = useState("");
  const [sev, setSev] = useState<Severity[]>([]);
  const [cat, setCat] = useState("all");

  const findings = useMemo(() => (report?.findings ?? []).filter((f) =>
    (!sev.length || sev.includes(f.severity)) && (cat === "all" || f.category === cat) &&
    (!q || `${f.title} ${f.detail} ${f.code}`.toLowerCase().includes(q.toLowerCase()))), [report, sev, cat, q]);

  if (isLoading) return <Skeleton className="h-96" />;
  if (!report) return <EmptyState icon={<FileSearch />} title="No audit yet" description="Run an audit from the Overview." />;

  return (
    <div className="grid gap-5">
      <PageHeader icon={<FileSearch />} title="Findings" description={`${report.findings.length} issues found in the latest audit, most severe first.`} />
      <div className="flex flex-wrap items-center gap-2">
        <InputGroup className="w-full sm:w-72">
          <InputGroupAddon><Search /></InputGroupAddon>
          <InputGroupInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search findings…" />
        </InputGroup>
        <ToggleGroup type="multiple" variant="outline" value={sev} onValueChange={(v) => setSev(v as Severity[])} className="flex-wrap">
          {SEVERITIES.map((s) => (
            <ToggleGroupItem key={s} value={s} className="gap-1.5 capitalize">
              <span className={cn("size-2 rounded-full", SEVERITY_STYLES[s].dot)} />{s}<span className="text-muted-foreground tabular">{report.stats.by_severity[s] ?? 0}</span>
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <Select value={cat} onValueChange={setCat}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            {["all", "seo", "adsense", "performance", "content"].map((c) => <SelectItem key={c} value={c} className="capitalize">{c === "all" ? "All categories" : c}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      {!findings.length ? <EmptyState icon={<Search />} title="No matching findings" /> : (
        <Accordion type="multiple" className="grid gap-2">
          {findings.map((f) => (
            <AccordionItem key={f.code} value={f.code} className="rounded-xl border bg-card px-4 shadow-xs last:border-b">
              <AccordionTrigger className="gap-3 hover:no-underline">
                <div className="flex flex-1 flex-wrap items-center gap-2 text-left">
                  <SeverityBadge severity={f.severity} />
                  <span className="font-medium">{f.title}</span>
                  <span className="ml-auto flex gap-1.5">
                    {f.requirement && <Pill tone="neutral">R{f.requirement}</Pill>}
                    <Pill tone="neutral" className="capitalize">{f.category}</Pill>
                    {f.fixable && <Pill tone="brand"><Wrench />Auto-fixable</Pill>}
                    {f.urls.length > 0 && <Pill tone="info">{f.urls.length} URLs</Pill>}
                  </span>
                </div>
              </AccordionTrigger>
              <AccordionContent className="grid gap-3 pb-4">
                {f.detail && <p className="text-sm text-muted-foreground">{f.detail}</p>}
                {f.recommendation && (
                  <div className="flex gap-2 rounded-lg bg-primary/5 p-3 text-sm"><Lightbulb className="mt-0.5 size-4 shrink-0 text-primary" />{f.recommendation}</div>
                )}
                {f.urls.length > 0 && (
                  <div className="grid max-h-48 gap-1 overflow-y-auto text-sm">
                    {f.urls.slice(0, 100).map((u) => <ExternalLink key={u} href={u}>{u}</ExternalLink>)}
                  </div>
                )}
                <code className="text-xs text-muted-foreground">{f.code}</code>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      )}
    </div>
  );
}
