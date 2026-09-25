import { useState } from "react";
import { Bot, ClipboardList, Flag, Plus, Sparkles, UserRound, Wrench } from "lucide-react";
import { Pill } from "@/components/common/badges";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useCreateTask } from "@/lib/hooks";
import type { Activity, EmployeeId, Task, TaskPriority, TaskStatus } from "@/lib/types";
import { cn, timeAgo } from "@/lib/utils";
import { EmployeeAvatar } from "./EmployeeAvatar";
import { PRIORITIES, priorityMeta, TASK_KIND_LABELS, TASK_STATUS, useEmployees } from "./employees";

export function TaskStatusBadge({ status }: { status: TaskStatus }) {
  const m = TASK_STATUS[status];
  return <Pill tone={m.tone}>{status === "in_progress" && <span className="size-1.5 animate-pulse rounded-full bg-current" />}{m.label}</Pill>;
}

export function PriorityBadge({ priority }: { priority: number }) {
  const m = priorityMeta(priority);
  return <Pill tone={m.tone}><Flag />{m.label}</Pill>;
}

export function TaskKindBadge({ kind }: { kind: string }) {
  if (!TASK_KIND_LABELS[kind]) return null;
  return <Pill tone="brand"><Sparkles />{TASK_KIND_LABELS[kind]}</Pill>;
}

/** Kanban card. */
export function TaskCard({ task, onOpen }: { task: Task; onOpen: (id: number) => void }) {
  const dir = useEmployees();
  const fixes = task.output?.fixes;
  return (
    <Card
      role="button"
      tabIndex={0}
      onClick={() => onOpen(task.id)}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onOpen(task.id)}
      className={cn(
        "group cursor-pointer gap-2.5 p-3.5 shadow-xs transition-all duration-200 hover:shadow-xs focus-visible:ring-2 focus-visible:ring-ring",
        task.status === "blocked" && "ring-1 ring-amber-500/40",
        task.status === "in_progress" && " ",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="line-clamp-2 text-sm leading-snug font-medium">{task.title}</div>
        <EmployeeAvatar actor={task.assignee} size="sm" />
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <PriorityBadge priority={task.priority} />
        <TaskKindBadge kind={task.kind} />
        {fixes && fixes.proposed > 0 && <Pill tone="info"><Wrench />{fixes.proposed} fixes</Pill>}
      </div>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          {task.created_by === "human" ? <UserRound className="size-3" /> : <Bot className="size-3" />}
          from {dir.name(task.created_by)}
        </span>
        <span>{timeAgo(task.completed_at ?? task.started_at ?? task.created_at)}</span>
      </div>
    </Card>
  );
}

/** "Assign a task" dialog. */
export function NewTaskDialog({ siteId, defaultAssignee, trigger }: { siteId: number; defaultAssignee?: EmployeeId; trigger?: React.ReactNode }) {
  const dir = useEmployees();
  const create = useCreateTask(siteId);
  const [open, setOpen] = useState(false);
  const [assignee, setAssignee] = useState<EmployeeId>(defaultAssignee ?? "manager");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<TaskPriority>(2);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    create.mutate({ assignee, title: title.trim(), description: description.trim(), priority }, {
      onSuccess: () => {
        setOpen(false);
        setTitle("");
        setDescription("");
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o && defaultAssignee) setAssignee(defaultAssignee); }}>
      <DialogTrigger asChild>{trigger ?? <Button><Plus /> New task</Button>}</DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={submit} className="grid gap-5">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><ClipboardList className="size-5 text-primary" /> Assign a task</DialogTitle>
            <DialogDescription>It starts right away. The employee gets a full briefing: site state, memory and relevant pages.</DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel>Assign to</FieldLabel>
              <Select value={assignee} onValueChange={(v) => setAssignee(v as EmployeeId)}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {dir.assignable.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      <EmployeeAvatar actor={e.id} size="xs" ring={false} /> {e.name} <span className="text-muted-foreground">· {e.title}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="task-title">What needs doing?</FieldLabel>
              <Input id="task-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Rewrite the homepage title for “yoga sutras”" required minLength={3} autoFocus />
            </Field>
            <Field>
              <FieldLabel htmlFor="task-desc">Details</FieldLabel>
              <Textarea id="task-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={4} placeholder="Context, URLs, constraints…" />
              <FieldDescription>Be specific — this becomes part of their briefing.</FieldDescription>
            </Field>
            <Field>
              <FieldLabel>Priority</FieldLabel>
              <ToggleGroup type="single" variant="outline" value={String(priority)} onValueChange={(v) => v && setPriority(Number(v) as TaskPriority)} className="w-full">
                {PRIORITIES.map((p) => <ToggleGroupItem key={p.value} value={String(p.value)} className="flex-1">{p.label}</ToggleGroupItem>)}
              </ToggleGroup>
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={create.isPending || title.trim().length < 3}>{create.isPending ? "Assigning…" : `Assign to ${dir.name(assignee)}`}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Team activity feed. */
export function ActivityFeed({ items, onOpenTask, compact = false }: { items: Activity[]; onOpenTask?: (id: number) => void; compact?: boolean }) {
  const dir = useEmployees();
  return (
    <ol className="relative grid gap-0.5">
      {items.map((a, i) => (
        <li key={a.id} className="group relative flex gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-muted/60 animate-in fade-in slide-in-from-left-1" style={{ animationDelay: `${Math.min(i, 10) * 30}ms` }}>
          <EmployeeAvatar actor={a.actor} size="sm" />
          <div className="min-w-0 flex-1">
            <p className={cn("text-sm leading-snug", compact && "line-clamp-2")}>
              <span className="font-medium">{dir.name(a.actor)}</span>{" "}
              <span className="text-muted-foreground">{a.message.replace(new RegExp(`^${dir.name(a.actor)}\\s*`), "")}</span>
            </p>
            <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
              <span>{timeAgo(a.created_at)}</span>
              {a.task_id != null && onOpenTask && (
                <button type="button" onClick={() => onOpenTask(a.task_id as number)} className="font-medium text-primary opacity-80 hover:underline group-hover:opacity-100">
                  Open task
                </button>
              )}
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}
