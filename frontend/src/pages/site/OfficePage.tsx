import { useEffect, useMemo, useRef, useState } from "react";
import { ClipboardList, Coffee, MessageCircle, MessageCircleQuestion, MousePointerClick, Sparkles, Tag, Users } from "lucide-react";
import { LiveDot, Pill } from "@/components/common/badges";
import { PageHeader, SectionLabel, StatCard } from "@/components/common/blocks";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { EmployeeSheet } from "@/features/office/EmployeeSheet";
import { OfficeActivity } from "@/features/office/OfficeActivity";
import { type BoardCounts, OfficeFloor, STATUS_META } from "@/features/office/OfficeFloor";
import { EmployeeAvatar } from "@/features/team/EmployeeAvatar";
import { EMPLOYEE_IDS, useEmployees } from "@/features/team/employees";
import { NewTaskDialog } from "@/features/team/TaskBits";
import { useTaskParam } from "@/features/team/useTaskParam";
import { useActivity, useStartCycle, useTeam } from "@/lib/hooks";
import type { EmployeeId, TeamMemberStatus } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useSiteCtx } from "./SiteLayout";

export default function OfficePage() {
  const { site, siteId } = useSiteCtx();
  const team = useTeam(siteId);
  const activity = useActivity(siteId, 40, true);
  const dir = useEmployees();
  const { openTask } = useTaskParam();
  const cycle = useStartCycle(siteId);
  const [selected, setSelected] = useState<EmployeeId | null>(null);
  const [highlight, setHighlight] = useState<EmployeeId | null>(null);
  const [view, setView] = useState<string[]>(["names", "bubbles"]);
  const members = team.data?.employees;

  const statusOf = useMemo(() => {
    const m = new Map((members ?? []).map((x) => [x.id, x.status]));
    return (id: EmployeeId): TeamMemberStatus => m.get(id) ?? "idle";
  }, [members]);
  const working = members?.filter((m) => m.status === "working") ?? [];
  const blocked = members?.filter((m) => m.status === "blocked") ?? [];
  const available = EMPLOYEE_IDS.length - working.length - blocked.length;

  const counts = useMemo<BoardCounts>(() => {
    const sum = (k: "todo" | "in_progress" | "blocked" | "done") => (members ?? []).reduce((n, m) => n + (m.counts?.[k] ?? 0), 0);
    return { todo: sum("todo"), doing: sum("in_progress"), waiting: Math.max(sum("blocked"), site.counts.waiting_on_you ?? 0), done: sum("done") };
  }, [members, site.counts.waiting_on_you]);

  // "Assign a task to X" from a desk or the hover card: one dialog, opened programmatically with a preset assignee.
  const [assignReq, setAssignReq] = useState<{ id: EmployeeId; n: number } | null>(null);
  const assignBtn = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (assignReq) assignBtn.current?.click(); }, [assignReq]);
  const openAssign = (id: EmployeeId) => setAssignReq((r) => ({ id, n: (r?.n ?? 0) + 1 }));

  const legend: { s: TeamMemberStatus; n: number }[] = [
    { s: "working", n: working.length },
    { s: "blocked", n: blocked.length },
    { s: "idle", n: available },
  ];

  return (
    <div className="grid gap-5">
      <PageHeader
        title={<span className="flex items-center gap-3">The office <Pill tone="success"><LiveDot className="mr-0.5" /> Live</Pill></span>}
        description="Watch your AI crew work in real time. Hover anyone to see what they're doing, click a desk to hand them a task."
        actions={
          <>
            <NewTaskDialog siteId={siteId} />
            <Button variant="outline" onClick={() => cycle.mutate(true)} disabled={!!site.active_job || cycle.isPending}><Sparkles /> Start a cycle</Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard icon={<Users />} label="Working now" value={working.length} hint={working.length ? working.map((m) => dir.name(m.id)).join(", ") : "Nobody on a task"} />
        <StatCard icon={<MessageCircleQuestion />} label="Waiting on you" value={blocked.length} tone={blocked.length ? "warning" : "default"} hint={blocked.length ? "Answer to unblock them" : "No open questions"} />
        <StatCard icon={<Coffee />} label="Available" value={available} tone="success" hint="Roaming the office" />
        <StatCard icon={<ClipboardList />} label="Open tasks" value={site.counts.open_tasks ?? counts.todo + counts.doing + counts.waiting} hint={`${counts.done} done so far`} />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Card className="gap-0 self-start overflow-hidden py-0 shadow-xs">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b px-4 py-2.5">
            <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-label="Status legend">
              {legend.map((l) => (
                <li key={l.s} className="flex items-center gap-1.5">
                  <span className={cn("size-2 rounded-full", STATUS_META[l.s].dot, l.s === "working" && l.n > 0 && "animate-pulse")} />
                  {STATUS_META[l.s].label} <span className="font-medium text-foreground tabular-nums">{l.n}</span>
                </li>
              ))}
            </ul>
            <ToggleGroup type="multiple" variant="outline" size="sm" value={view} onValueChange={setView} className="ml-auto" aria-label="Scene options">
              <ToggleGroupItem value="names" aria-label="Show name labels"><Tag /> Names</ToggleGroupItem>
              <ToggleGroupItem value="bubbles" aria-label="Show speech bubbles"><MessageCircle /> Bubbles</ToggleGroupItem>
            </ToggleGroup>
          </div>
          {team.isLoading ? <Skeleton className="aspect-square w-full rounded-none sm:aspect-[1440/860]" /> : (
            <OfficeFloor
              siteId={siteId}
              members={members}
              activity={activity.data}
              counts={counts}
              showNames={view.includes("names")}
              highlight={highlight}
              onSelect={setSelected}
              onAssign={openAssign}
              onOpenTask={openTask}
              className={cn(!view.includes("bubbles") && "[&_.office-bubble]:hidden")}
            />
          )}
          <p className="flex items-center gap-2 border-t px-4 py-2.5 text-xs text-muted-foreground">
            <MousePointerClick className="size-3.5 shrink-0" />
            <span>Click a desk to assign a task · the coffee machine or foosball table for a break · the whiteboard opens the board.</span>
          </p>
        </Card>

        {/* Side panel: on wide screens it matches the office card's height and the feed scrolls. */}
        <div className="relative min-h-0">
          <div className="grid gap-4 md:grid-cols-2 xl:absolute xl:inset-0 xl:flex xl:flex-col">
            <Card className="gap-3 py-4 shadow-xs xl:max-h-[45%] xl:shrink-0">
              <CardHeader className="px-4">
                <CardTitle>Right now</CardTitle>
                <CardDescription>{working.length || blocked.length ? `${working.length} working · ${blocked.length} waiting on you` : "Nobody is on a task"}</CardDescription>
              </CardHeader>
              <CardContent className="min-h-0 flex-1 px-2">
                <ScrollArea className="h-full max-h-64 xl:max-h-none [&>[data-slot=scroll-area-viewport]]:max-h-[inherit]">
                  <div className="grid gap-0.5 px-2" onMouseLeave={() => setHighlight(null)}>
                    {[...blocked, ...working].map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onMouseEnter={() => setHighlight(m.id)}
                        onFocus={() => setHighlight(m.id)}
                        onBlur={() => setHighlight(null)}
                        onClick={() => (m.current_task ? openTask(m.current_task.id) : setSelected(m.id))}
                        className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none"
                      >
                        <EmployeeAvatar actor={m.id} size="sm" status={m.status} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 text-sm font-medium">
                            {dir.name(m.id)}
                            {m.status === "blocked" && <Pill tone="warning" className="h-4 px-1 text-[10px]"><MessageCircleQuestion />Needs you</Pill>}
                          </div>
                          <div className="truncate text-xs text-muted-foreground">{m.current_task?.title}</div>
                        </div>
                      </button>
                    ))}
                    {!working.length && !blocked.length && <p className="px-2 text-sm text-muted-foreground">The crew is roaming the office. Assign a task or start a cycle.</p>}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
            <Card className="min-h-0 gap-3 py-4 shadow-xs xl:flex-1">
              <CardHeader className="px-4">
                <CardTitle>Activity</CardTitle>
                <CardDescription>Hover an entry to find them in the office</CardDescription>
                <CardAction><LiveDot /></CardAction>
              </CardHeader>
              <CardContent className="min-h-0 flex-1 px-2">
                <ScrollArea className="h-80 px-2 xl:h-full">
                  {activity.isLoading ? (
                    <div className="grid gap-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
                  ) : activity.data?.length ? (
                    <OfficeActivity items={activity.data} onOpenTask={openTask} onHover={setHighlight} />
                  ) : (
                    <p className="px-2 text-sm text-muted-foreground">Nothing yet.</p>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      <div>
        <SectionLabel>The crew</SectionLabel>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6" onMouseLeave={() => setHighlight(null)}>
          {EMPLOYEE_IDS.map((id) => {
            const m = members?.find((x) => x.id === id);
            const s = statusOf(id);
            return (
              <button
                key={id}
                type="button"
                onClick={() => setSelected(id)}
                onMouseEnter={() => setHighlight(id)}
                onFocus={() => setHighlight(id)}
                onBlur={() => setHighlight(null)}
                className="flex items-center gap-3 rounded-xl border bg-card p-3 text-left shadow-xs transition-colors hover:bg-muted/50"
              >
                <EmployeeAvatar actor={id} size="md" status={s} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">{dir.name(id)}</div>
                  <div className="truncate text-xs text-muted-foreground">{dir.title(id)}</div>
                  <div className="mt-0.5 truncate text-[11px] text-muted-foreground">{m ? `${m.counts.done} done · ${m.memories} memories` : STATUS_META[s].label}</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <EmployeeSheet siteId={siteId} employeeId={selected} member={members?.find((m) => m.id === selected)} onClose={() => setSelected(null)} />
      <NewTaskDialog
        key={assignReq?.id ?? "none"}
        siteId={siteId}
        defaultAssignee={assignReq?.id}
        trigger={<button ref={assignBtn} type="button" className="hidden" tabIndex={-1} aria-hidden />}
      />
    </div>
  );
}
