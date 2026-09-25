import { useState } from "react";
import { Brain, BookOpen, GraduationCap, Search, Sparkles, Trash2, Users } from "lucide-react";
import { Pill } from "@/components/common/badges";
import { EmptyState, ExternalLink, PageHeader } from "@/components/common/blocks";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { EmployeeAvatar } from "@/features/team/EmployeeAvatar";
import { useEmployees } from "@/features/team/employees";
import { useAddMemory, useDebounced, useDeleteMemory, useKnowledge, useMemories, useTeam } from "@/lib/hooks";
import type { KnowledgeKind, MemoryScope } from "@/lib/types";
import { cn, pathOf, timeAgo } from "@/lib/utils";
import { useSiteCtx } from "./SiteLayout";

const KIND_LABEL: Record<string, string> = { learning: "Lesson", note: "Note", owner_note: "From you" };

export default function MemoryPage() {
  const { siteId } = useSiteCtx();
  const dir = useEmployees();
  const team = useTeam(siteId);
  const [scope, setScope] = useState<MemoryScope | null>(null);
  const [q, setQ] = useState("");
  const dq = useDebounced(q, 300);
  const memories = useMemories(siteId, scope, dq);
  const add = useAddMemory(siteId);
  const del = useDeleteMemory(siteId);
  const [note, setNote] = useState("");
  const [kq, setKq] = useState("");
  const [kinds, setKinds] = useState<KnowledgeKind[]>([]);
  const dkq = useDebounced(kq, 350);
  const knowledge = useKnowledge(siteId, dkq, kinds);
  const counts = new Map((team.data?.employees ?? []).map((e) => [e.id, e.memories]));

  const scopes: { id: MemoryScope | null; label: string; count?: number }[] = [
    { id: null, label: "Everything" },
    { id: "team", label: "Team (shared)", count: team.data?.team_memories },
    ...dir.list.map((e) => ({ id: e.id as MemoryScope, label: e.name, count: counts.get(e.id) })),
  ];

  return (
    <div className="grid gap-5">
      <PageHeader icon={<Brain />} title="Team memory" description="What the crew has learned about this site. The most relevant memories are added to every task briefing." />
      <div className="grid gap-5 lg:grid-cols-[240px_1fr]">
        <Card className="h-fit gap-1 p-2 shadow-xs">
          {scopes.map((s) => (
            <button key={s.label} type="button" onClick={() => setScope(s.id)} className={cn("flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors hover:bg-muted", scope === s.id && "bg-primary/10 font-medium text-primary")}>
              {s.id === null ? <Sparkles className="size-4" /> : s.id === "team" ? <Users className="size-4" /> : <EmployeeAvatar actor={s.id} size="xs" ring={false} />}
              <span className="flex-1">{s.label}</span>
              {s.count != null && <span className="text-xs text-muted-foreground tabular">{s.count}</span>}
            </button>
          ))}
        </Card>

        <div className="grid content-start gap-4">
          <Card className="shadow-xs">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base"><GraduationCap className="size-4 text-primary" /> Teach the team</CardTitle>
              <CardDescription>Preferences, facts and rules — e.g. “Never promise health outcomes” or “Our audience is beginners”.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2">
              <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Tell the crew something they should always remember…" />
              <Button className="justify-self-end" disabled={note.trim().length < 3 || add.isPending} onClick={() => add.mutate({ text: note.trim(), employee: scope && scope !== "team" ? scope : "team" }, { onSuccess: () => setNote("") })}>
                Save to {scope && scope !== "team" ? `${dir.name(scope)}'s` : "team"} memory
              </Button>
            </CardContent>
          </Card>

          <InputGroup>
            <InputGroupAddon><Search /></InputGroupAddon>
            <InputGroupInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search memories by meaning — e.g. “what works for titles?”" />
          </InputGroup>

          {memories.isLoading ? <Skeleton className="h-40" /> : !(memories.data ?? []).length ? (
            <EmptyState icon={<Brain />} title={q ? "No matching memories" : "No memories yet"} description="Employees save lessons after every task." />
          ) : (
            <div className="grid gap-2">
              {(memories.data ?? []).map((m, i) => (
                <Card key={m.id} className="group flex-row items-start gap-3 p-3.5 shadow-xs animate-in fade-in slide-in-from-bottom-1" style={{ animationDelay: `${Math.min(i, 10) * 25}ms`, animationFillMode: "backwards" }}>
                  {m.employee === "team" ? <span className="flex size-7 items-center justify-center rounded-full bg-muted"><Users className="size-3.5" /></span> : <EmployeeAvatar actor={m.employee} size="sm" />}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm">{m.text}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <Pill tone={m.kind === "owner_note" ? "brand" : "neutral"}>{KIND_LABEL[m.kind] ?? m.kind}</Pill>
                      <span>{m.employee === "team" ? "Team" : dir.name(m.employee)}</span>
                      <span>{timeAgo(m.created_at)}</span>
                      {m.score != null && q && <span>{Math.round(m.score * 100)}% match</span>}
                    </div>
                  </div>
                  <AlertDialog>
                    <AlertDialogTrigger asChild><Button variant="ghost" size="icon-sm" className="opacity-0 transition-opacity group-hover:opacity-100" aria-label="Forget"><Trash2 /></Button></AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader><AlertDialogTitle>Forget this memory?</AlertDialogTitle><AlertDialogDescription>“{m.text}”</AlertDialogDescription></AlertDialogHeader>
                      <AlertDialogFooter><AlertDialogCancel>Keep</AlertDialogCancel><AlertDialogAction onClick={() => del.mutate(m.id)}>Forget</AlertDialogAction></AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </Card>
              ))}
            </div>
          )}

          <Card className="mt-2 shadow-xs">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base"><BookOpen className="size-4 text-primary" /> Site knowledge</CardTitle>
              <CardDescription>Semantic search across your pages, audit findings and search queries — the same index the crew uses.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              <div className="flex flex-wrap gap-2">
                <InputGroup className="min-w-60 flex-1">
                  <InputGroupAddon><Search /></InputGroupAddon>
                  <InputGroupInput value={kq} onChange={(e) => setKq(e.target.value)} placeholder="e.g. privacy policy cookies" />
                </InputGroup>
                <ToggleGroup type="multiple" variant="outline" value={kinds} onValueChange={(v) => setKinds(v as KnowledgeKind[])}>
                  <ToggleGroupItem value="page">Pages</ToggleGroupItem><ToggleGroupItem value="finding">Findings</ToggleGroupItem><ToggleGroupItem value="query">Queries</ToggleGroupItem>
                </ToggleGroup>
              </div>
              {(knowledge.data ?? []).map((h, i) => (
                <div key={`${h.url}-${i}`} className="rounded-lg border p-3 text-sm">
                  <div className="mb-1 flex items-center gap-2"><Pill tone="info" className="capitalize">{h.kind}</Pill>{h.url && <ExternalLink href={h.url} className="text-xs">{pathOf(h.url)}</ExternalLink>}<span className="ml-auto text-xs text-muted-foreground">{Math.round(h.score * 100)}%</span></div>
                  <p className="line-clamp-3 text-muted-foreground">{h.text}</p>
                </div>
              ))}
              {dkq.length > 1 && knowledge.data?.length === 0 && <p className="text-sm text-muted-foreground">No matches.</p>}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
