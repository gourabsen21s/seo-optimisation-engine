import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Ban, CheckCircle2, CircleDashed, KanbanSquare, Loader2, MessageCircleQuestion, Search, XCircle } from "lucide-react";
import { EmptyState, PageHeader } from "@/components/common/blocks";
import { Badge } from "@/components/ui/badge";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { EmployeeAvatar } from "@/features/team/EmployeeAvatar";
import { useEmployees } from "@/features/team/employees";
import { NewTaskDialog, TaskCard } from "@/features/team/TaskBits";
import { useTaskParam } from "@/features/team/useTaskParam";
import { useCycles, useTasks } from "@/lib/hooks";
import type { EmployeeId, TaskStatus } from "@/lib/types";
import { cn, formatShortDate } from "@/lib/utils";
import { useSiteCtx } from "./SiteLayout";

const COLUMNS: { status: TaskStatus; label: string; icon: typeof Loader2; tone: string }[] = [
  { status: "todo", label: "To do", icon: CircleDashed, tone: "text-muted-foreground" },
  { status: "in_progress", label: "In progress", icon: Loader2, tone: "text-primary" },
  { status: "blocked", label: "Waiting on you", icon: MessageCircleQuestion, tone: "text-amber-600" },
  { status: "done", label: "Done", icon: CheckCircle2, tone: "text-emerald-600" },
  { status: "failed", label: "Failed", icon: XCircle, tone: "text-red-600" },
];

export default function BoardPage() {
  const { siteId } = useSiteCtx();
  const dir = useEmployees();
  const [params, setParams] = useSearchParams();
  const assignee = (params.get("assignee") as EmployeeId | null) ?? null;
  const runId = params.get("run") ? Number(params.get("run")) : undefined;
  const [q, setQ] = useState("");
  const [showCancelled, setShowCancelled] = useState(false);
  const tasks = useTasks(siteId, { assignee: assignee ?? undefined, run_id: runId });
  const cycles = useCycles(siteId);
  const { openTask } = useTaskParam();

  const setParam = (k: string, v: string | null) => setParams((prev) => {
    const next = new URLSearchParams(prev);
    if (v) next.set(k, v); else next.delete(k);
    return next;
  });

  const filtered = useMemo(() => (tasks.data ?? []).filter((t) => !q || t.title.toLowerCase().includes(q.toLowerCase())), [tasks.data, q]);
  const columns = showCancelled ? [...COLUMNS, { status: "cancelled" as const, label: "Cancelled", icon: Ban, tone: "text-muted-foreground" }] : COLUMNS;

  return (
    <div className="grid gap-5">
      <PageHeader icon={<KanbanSquare />} title="Task board" description="Every piece of work the crew is doing — and what's waiting on you." actions={<NewTaskDialog siteId={siteId} />} />
      <div className="flex flex-wrap items-center gap-2">
        <InputGroup className="w-full sm:w-64">
          <InputGroupAddon><Search /></InputGroupAddon>
          <InputGroupInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search tasks…" />
        </InputGroup>
        <Select value={assignee ?? "all"} onValueChange={(v) => setParam("assignee", v === "all" ? null : v)}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Everyone</SelectItem>
            {dir.list.map((e) => <SelectItem key={e.id} value={e.id}><EmployeeAvatar actor={e.id} size="xs" ring={false} /> {e.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={runId ? String(runId) : "all"} onValueChange={(v) => setParam("run", v === "all" ? null : v)}>
          <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All cycles</SelectItem>
            {(cycles.data ?? []).map((c) => <SelectItem key={c.id} value={String(c.id)}>Cycle #{c.id} · {formatShortDate(c.created_at)}</SelectItem>)}
          </SelectContent>
        </Select>
        <label className="ml-auto flex items-center gap-2 text-sm text-muted-foreground"><Switch checked={showCancelled} onCheckedChange={setShowCancelled} /> Show cancelled</label>
      </div>

      {tasks.isLoading ? (
        <div className="grid gap-4 md:grid-cols-5">{COLUMNS.map((c) => <Skeleton key={c.status} className="h-96 rounded-xl" />)}</div>
      ) : !tasks.data?.length ? (
        <EmptyState icon={<KanbanSquare />} title="No tasks yet" description="Run an optimisation cycle and Maya will assign work — or assign a task yourself." action={<NewTaskDialog siteId={siteId} />} />
      ) : (
        <ScrollArea className="w-full pb-3">
          <div className={cn("grid min-w-[1100px] gap-4", showCancelled ? "grid-cols-6" : "grid-cols-5")}>
            {columns.map((col) => {
              const items = filtered.filter((t) => t.status === col.status);
              return (
                <div key={col.status} className={cn("flex flex-col gap-3 rounded-xl bg-muted/40 p-3", col.status === "blocked" && items.length > 0 && "bg-amber-500/5 ring-1 ring-amber-500/25")}>
                  <div className="flex items-center gap-2 px-1">
                    <col.icon className={cn("size-4", col.tone, col.status === "in_progress" && items.length > 0 && "animate-spin")} />
                    <span className="text-sm font-medium">{col.label}</span>
                    <Badge variant="secondary" className="ml-auto tabular">{items.length}</Badge>
                  </div>
                  <div className="grid gap-2.5">
                    {items.map((t, i) => (
                      <div key={t.id} className="animate-in fade-in slide-in-from-bottom-1" style={{ animationDelay: `${Math.min(i, 8) * 35}ms`, animationFillMode: "backwards" }}>
                        <TaskCard task={t} onOpen={openTask} />
                      </div>
                    ))}
                    {!items.length && <div className="rounded-xl border border-dashed p-6 text-center text-xs text-muted-foreground">Empty</div>}
                  </div>
                </div>
              );
            })}
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      )}
    </div>
  );
}
