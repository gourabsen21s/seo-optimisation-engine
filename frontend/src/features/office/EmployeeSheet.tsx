import { Brain, CheckCircle2, CircleDot, ClipboardList, Target, XCircle } from "lucide-react";
import { SectionLabel } from "@/components/common/blocks";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { EmployeeAvatar } from "@/features/team/EmployeeAvatar";
import { ASSIGNABLE_IDS, gradientOf, useEmployees } from "@/features/team/employees";
import { NewTaskDialog, TaskStatusBadge } from "@/features/team/TaskBits";
import { useTaskParam } from "@/features/team/useTaskParam";
import { useMemories, useTasks } from "@/lib/hooks";
import type { EmployeeId, TeamMember } from "@/lib/types";
import { timeAgo } from "@/lib/utils";

/** Employee profile: role, live status, current work, recent tasks and memories. */
export function EmployeeSheet({ siteId, employeeId, member, onClose }: { siteId: number; employeeId: EmployeeId | null; member?: TeamMember; onClose: () => void }) {
  const dir = useEmployees();
  const { openTask } = useTaskParam();
  const id = employeeId ?? "manager";
  const e = dir.get(id);
  const tasks = useTasks(siteId, { assignee: id });
  const memories = useMemories(siteId, id, "");

  return (
    <Sheet open={employeeId != null} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full gap-0 overflow-hidden p-0 sm:max-w-md">
        <div className="relative h-28 shrink-0" style={{ background: gradientOf(id) }}>
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.35),transparent_60%)]" />
        </div>
        <SheetHeader className="-mt-10 px-5 pb-3">
          <EmployeeAvatar actor={id} size="xl" status={member?.status} className="mb-2" />
          <SheetTitle className="text-xl">{e.name}</SheetTitle>
          <SheetDescription>{e.title}{e.kind === "system" ? " · automated" : " · AI employee"} · reports to {dir.name(e.reports_to)}</SheetDescription>
        </SheetHeader>
        <ScrollArea className="min-h-0 flex-1">
          <div className="grid gap-6 px-5 pb-6">
            <p className="text-sm leading-relaxed text-muted-foreground">{e.summary}</p>
            <div className="grid grid-cols-4 gap-2 text-center">
              {[
                { icon: CheckCircle2, v: member?.counts.done ?? 0, l: "Done" },
                { icon: CircleDot, v: (member?.counts.todo ?? 0) + (member?.counts.in_progress ?? 0), l: "Open" },
                { icon: XCircle, v: member?.counts.failed ?? 0, l: "Failed" },
                { icon: Brain, v: member?.memories ?? 0, l: "Memories" },
              ].map((s) => (
                <Card key={s.l} className="gap-0.5 p-2.5">
                  <s.icon className="mx-auto size-4 text-muted-foreground" />
                  <div className="text-lg font-semibold tabular">{s.v}</div>
                  <div className="text-[11px] text-muted-foreground">{s.l}</div>
                </Card>
              ))}
            </div>
            {member?.current_task && (
              <button type="button" onClick={() => openTask(member.current_task!.id)} className="rounded-xl bg-primary/5 p-3 text-left transition-colors hover:bg-primary/10">
                <div className="mb-1 text-xs font-medium text-primary">{member.status === "blocked" ? "Waiting on you" : "Working on now"}</div>
                <div className="text-sm font-medium">{member.current_task.title}</div>
              </button>
            )}
            <div>
              <SectionLabel className="flex items-center gap-1.5"><Target className="size-3.5" />Responsibilities</SectionLabel>
              <ul className="grid gap-1.5">{e.responsibilities.map((r) => <li key={r} className="flex gap-2 text-sm"><span className="mt-2 size-1.5 shrink-0 rounded-full" style={{ background: gradientOf(id) }} />{r}</li>)}</ul>
            </div>
            <div>
              <SectionLabel className="flex items-center gap-1.5"><ClipboardList className="size-3.5" />Recent tasks</SectionLabel>
              {tasks.isLoading ? <Skeleton className="h-16" /> : (tasks.data ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">No tasks yet.</p>
              ) : (
                <div className="grid gap-1.5">
                  {(tasks.data ?? []).slice(0, 8).map((t) => (
                    <button key={t.id} type="button" onClick={() => openTask(t.id)} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors hover:bg-muted">
                      <span className="min-w-0 flex-1 truncate">{t.title}</span>
                      <TaskStatusBadge status={t.status} />
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div>
              <SectionLabel className="flex items-center gap-1.5"><Brain className="size-3.5" />What {e.name} remembers</SectionLabel>
              {(memories.data ?? []).length === 0 ? <p className="text-sm text-muted-foreground">Nothing yet — lessons are saved after each task.</p> : (
                <ul className="grid gap-2">
                  {(memories.data ?? []).slice(0, 5).map((m) => (
                    <li key={m.id} className="rounded-lg bg-muted/60 px-3 py-2 text-sm">{m.text}<div className="mt-0.5 text-[11px] text-muted-foreground">{timeAgo(m.created_at)}</div></li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </ScrollArea>
        {ASSIGNABLE_IDS.includes(id) && (
          <div className="border-t p-4">
            <NewTaskDialog siteId={siteId} defaultAssignee={id} trigger={<Button className="w-full"><ClipboardList /> Assign a task to {e.name}</Button>} />
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
