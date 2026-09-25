import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Check, Eye, PlugZap, Rocket, Search, Wrench, X } from "lucide-react";
import { EmptyState, PageHeader } from "@/components/common/blocks";
import { DiffView } from "@/components/common/blocks";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FixCard } from "@/features/fixes/FixCard";
import { useApplyFixes, useFixDecision, useFixes, usePreviewFixes, useRollbackFix } from "@/lib/hooks";
import type { FixResult, FixStatus } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useSiteCtx } from "./SiteLayout";

const TABS: { value: FixStatus | "open"; label: string }[] = [
  { value: "open", label: "To review" }, { value: "applied", label: "Applied" }, { value: "failed", label: "Failed" }, { value: "rejected", label: "Rejected" },
];

export default function FixesPage() {
  const { site, siteId } = useSiteCtx();
  const fixes = useFixes(siteId);
  const decide = useFixDecision(siteId);
  const preview = usePreviewFixes(siteId);
  const apply = useApplyFixes(siteId);
  const rollback = useRollbackFix(siteId);
  const [tab, setTab] = useState<FixStatus | "open">("open");
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [previewResults, setPreviewResults] = useState<FixResult[] | null>(null);

  const all = fixes.data ?? [];
  const count = (t: string) => all.filter((f) => (t === "open" ? f.status === "proposed" || f.status === "approved" : f.status === t)).length;
  const list = useMemo(() => all.filter((f) => (tab === "open" ? f.status === "proposed" || f.status === "approved" : f.status === tab) && (!q || `${f.title} ${f.target_url ?? ""}`.toLowerCase().includes(q.toLowerCase()))), [all, tab, q]);
  const selected = list.filter((f) => sel.has(f.id));
  const applicable = selected.filter((f) => f.kind !== "manual").map((f) => f.id);
  const toggle = (id: string, on: boolean) => setSel((s) => { const n = new Set(s); if (on) n.add(id); else n.delete(id); return n; });

  return (
    <div className="grid gap-5">
      <PageHeader icon={<Wrench />} title="Fixes" description="Changes proposed by the rule engine and the AI crew. Preview any change as a diff before applying it." />
      {!site.connector_configured && (
        <Alert><PlugZap /><AlertTitle>Connect your site to apply fixes</AlertTitle><AlertDescription>Add a WordPress, GitHub or local-files connector in <Link to="../settings" relative="path" className="font-medium text-primary underline-offset-4 hover:underline">Site settings</Link>.</AlertDescription></Alert>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Tabs value={tab} onValueChange={(v) => { setTab(v as typeof tab); setSel(new Set()); }}>
          <TabsList>{TABS.map((t) => <TabsTrigger key={t.value} value={t.value}>{t.label} <span className="ml-1 text-muted-foreground tabular">{count(t.value)}</span></TabsTrigger>)}</TabsList>
        </Tabs>
        <InputGroup className="ml-auto w-full sm:w-64">
          <InputGroupAddon><Search /></InputGroupAddon>
          <InputGroupInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search fixes…" />
        </InputGroup>
      </div>

      {tab === "open" && list.length > 0 && (
        <Card className={cn("sticky top-16 z-10 flex-row flex-wrap items-center gap-2 p-3 shadow-xs", selected.length && " ")}>
          <label className="flex items-center gap-2 px-1 text-sm">
            <Checkbox checked={selected.length === list.length && list.length > 0} onCheckedChange={(c) => setSel(c === true ? new Set(list.map((f) => f.id)) : new Set())} />
            {selected.length ? `${selected.length} selected` : "Select all"}
          </label>
          <div className="ml-auto flex flex-wrap gap-2">
            <Button variant="ghost" size="sm" disabled={!selected.length} onClick={() => decide.mutate({ action: "reject", ids: selected.map((f) => f.id) }, { onSuccess: () => setSel(new Set()) })}><X /> Reject</Button>
            <Button variant="outline" size="sm" disabled={!selected.length} onClick={() => decide.mutate({ action: "approve", ids: selected.map((f) => f.id) })}><Check /> Approve</Button>
            <Button variant="outline" size="sm" disabled={!applicable.length || !site.connector_configured || preview.isPending} onClick={() => preview.mutate(applicable, { onSuccess: (r) => setPreviewResults(r.results) })}><Eye /> {preview.isPending ? "Previewing…" : "Preview"}</Button>
            <Button size="sm" disabled={!applicable.length || !site.connector_configured || apply.isPending} onClick={() => apply.mutate(applicable, { onSuccess: () => setSel(new Set()) })} className="bg-primary text-primary-foreground"><Rocket /> Apply {applicable.length || ""}</Button>
          </div>
        </Card>
      )}

      {fixes.isLoading ? <Skeleton className="h-64" /> : !list.length ? (
        <EmptyState icon={<Wrench />} title={tab === "open" ? "Nothing to review" : "Nothing here yet"} description={tab === "open" ? "Run an audit or an optimisation cycle and the crew will propose fixes." : undefined} />
      ) : (
        <div className="grid gap-3">
          {list.map((f, i) => (
            <div key={f.id} className="animate-in fade-in slide-in-from-bottom-1" style={{ animationDelay: `${Math.min(i, 10) * 30}ms`, animationFillMode: "backwards" }}>
              <FixCard fix={f} selected={sel.has(f.id)} onSelect={tab === "open" ? (v) => toggle(f.id, v) : undefined} onRollback={() => rollback.mutate(f.id)} />
            </div>
          ))}
        </div>
      )}

      <Dialog open={previewResults != null} onOpenChange={(o) => !o && setPreviewResults(null)}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Dry-run preview</DialogTitle>
            <DialogDescription>Nothing has changed on your site yet. This is exactly what applying would do.</DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh] pr-3">
            <div className="grid gap-3">
              {(previewResults ?? []).map((r) => {
                const f = all.find((x) => x.id === r.fix_id);
                return (
                  <div key={r.fix_id} className="grid gap-2 rounded-xl border p-3">
                    <div className="flex items-center gap-2 text-sm font-medium">{r.ok ? <Check className="size-4 text-emerald-600" /> : <X className="size-4 text-red-600" />}{f?.title ?? r.fix_id}</div>
                    <div className="text-xs text-muted-foreground">{r.message}</div>
                    {r.diff && <DiffView diff={r.diff} maxHeight="16rem" />}
                  </div>
                );
              })}
            </div>
          </ScrollArea>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setPreviewResults(null)}>Close</Button>
            <Button className="bg-primary text-primary-foreground" onClick={() => { apply.mutate(applicable, { onSuccess: () => { setSel(new Set()); setPreviewResults(null); } }); }}><Rocket /> Apply these changes</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
