import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Ban, CheckCircle2, Coins, Lightbulb, MessageCircleQuestion, NotebookPen, RotateCcw, SendHorizontal, TrendingUp, Users, Wrench } from "lucide-react";
import { Pill } from "@/components/common/badges";
import { Markdown, SectionLabel } from "@/components/common/blocks";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useCommentTask, useTask, useUpdateTask } from "@/lib/hooks";
import type { EmployeeId, Task, TaskPriority } from "@/lib/types";
import { cn, compactNumber, formatDateTime, formatDuration, pathOf, timeAgo } from "@/lib/utils";
import { EmployeeAvatar } from "./EmployeeAvatar";
import { PRIORITIES, useEmployees } from "./employees";
import { TaskKindBadge, TaskStatusBadge } from "./TaskBits";
import { StrategyView } from "./StrategyView";
import { useTaskParam } from "./useTaskParam";

function TaskRef({ id }: { id: number }) {
  const { openTask } = useTaskParam();
  const t = useTask(id);
  return (
    <button type="button" onClick={() => openTask(id)} className="flex w-full items-center gap-2 rounded-lg border bg-card/60 px-3 py-2 text-left text-sm transition-colors hover:bg-muted">
      {t.data ? <EmployeeAvatar actor={t.data.assignee} size="xs" /> : <Skeleton className="size-5 rounded-full" />}
      <span className="min-w-0 flex-1 truncate">{t.data?.title ?? `Task #${id}`}</span>
      {t.data && <TaskStatusBadge status={t.data.status} />}
    </button>
  );
}

function Output({ task }: { task: Task }) {
  const { siteId } = useParams();
  const o = task.output;
  if (!o) return null;
  return (
    <div className="grid gap-5">
      <div>
        <SectionLabel>Result</SectionLabel>
        <p className="text-sm leading-relaxed">{o.summary}</p>
      </div>
      {o.details && <Markdown className="rounded-xl border bg-muted/30 p-4">{o.details}</Markdown>}
      {o.fixes && o.fixes.proposed > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-3">
          <Wrench className="size-4 text-primary" />
          <span className="text-sm">{o.fixes.proposed} fixes proposed · {o.fixes.applied} applied{o.fixes.held_back ? ` · ${o.fixes.held_back} held back by Jev` : ""}</span>
          <Button asChild variant="link" size="sm" className="ml-auto"><Link to={`/sites/${siteId}/fixes`}>Review fixes</Link></Button>
        </div>
      )}
      {o.insights && o.insights.opportunities.length > 0 && (
        <div>
          <SectionLabel className="flex items-center gap-1.5"><TrendingUp className="size-3.5" />Ranking opportunities</SectionLabel>
          <div className="grid gap-2">
            {o.insights.opportunities.slice(0, 8).map((op, i) => (
              <div key={i} className="rounded-lg border p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">“{op.query}”</span>
                  {op.position != null && <Pill tone="info">pos {op.position.toFixed(1)}</Pill>}
                  <Pill tone="neutral">{compactNumber(op.impressions)} impr.</Pill>
                  <span className="truncate text-xs text-muted-foreground">{pathOf(op.url)}</span>
                </div>
                <div className="mt-1 text-muted-foreground">{op.recommendation}</div>
              </div>
            ))}
          </div>
        </div>
      )}
      {o.strategy && <StrategyView strategy={o.strategy} />}
      {o.draft && (
        <div>
          <SectionLabel className="flex items-center gap-1.5"><NotebookPen className="size-3.5" />Draft: {o.draft.title}</SectionLabel>
          <div className="prose-chat max-h-72 overflow-y-auto rounded-xl border bg-muted/30 p-4" dangerouslySetInnerHTML={{ __html: o.draft.html_body }} />
          {o.draft.facts_to_verify.length > 0 && (
            <Alert className="mt-2"><AlertTitle>Facts to verify before publishing</AlertTitle><AlertDescription><ul className="ml-4 list-disc">{o.draft.facts_to_verify.map((f, i) => <li key={i}>{f}</li>)}</ul></AlertDescription></Alert>
          )}
        </div>
      )}
      {(o.learnings?.length || o.team_notes?.length) ? (
        <div>
          <SectionLabel className="flex items-center gap-1.5"><Lightbulb className="size-3.5" />Remembered</SectionLabel>
          <ul className="grid gap-1.5 text-sm">
            {o.learnings?.map((l, i) => <li key={`l${i}`} className="flex gap-2"><span className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" />{l}</li>)}
            {o.team_notes?.map((l, i) => <li key={`t${i}`} className="flex gap-2"><Users className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />{l}</li>)}
          </ul>
        </div>
      ) : null}
      {o.created_tasks && o.created_tasks.length > 0 && (
        <div>
          <SectionLabel>Delegated</SectionLabel>
          <div className="grid gap-1.5">{o.created_tasks.map((id) => <TaskRef key={id} id={id} />)}</div>
        </div>
      )}
      {o.next_focus && <div className="text-sm"><span className="font-medium">Next focus: </span>{o.next_focus}</div>}
    </div>
  );
}

function Thread({ task, siteId }: { task: Task; siteId: number }) {
  const dir = useEmployees();
  const comment = useCommentTask(siteId);
  const [body, setBody] = useState("");
  const send = () => body.trim() && comment.mutate({ id: task.id, body: body.trim() }, { onSuccess: () => setBody("") });
  const blocked = task.status === "blocked";
  return (
    <div className="grid gap-3">
      <SectionLabel>Conversation</SectionLabel>
      {(task.comments ?? []).length === 0 && <p className="text-sm text-muted-foreground">No comments yet.</p>}
      {(task.comments ?? []).map((c) => (
        <div key={c.id} className={cn("flex gap-2.5", c.author === "human" && "flex-row-reverse")}>
          <EmployeeAvatar actor={c.author} size="sm" />
          <div className={cn(
            "max-w-[85%] rounded-xl px-3.5 py-2 text-sm",
            c.author === "human" ? "rounded-tr-sm bg-primary text-primary-foreground" : "rounded-tl-sm bg-muted",
            c.kind === "question" && "bg-amber-500/10 ring-1 ring-amber-500/40",
          )}>
            <div className="mb-0.5 text-xs opacity-70">{dir.name(c.author)} · {timeAgo(c.created_at)}{c.kind === "question" && " · asks you"}</div>
            <div className="whitespace-pre-wrap">{c.body}</div>
          </div>
        </div>
      ))}
      <div className={cn("rounded-xl border bg-card p-2 shadow-xs focus-within:ring-2 focus-within:ring-ring/40", blocked && "ring-1 ring-amber-500/50")}>
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) send(); }}
          placeholder={blocked ? `Answer ${dir.name(task.assignee)}'s question…` : "Add a comment…"}
          rows={2}
          className="min-h-0 resize-none border-0 bg-transparent shadow-none focus-visible:ring-0"
        />
        <div className="flex items-center justify-between px-1">
          <span className="text-xs text-muted-foreground">⌘ + Enter</span>
          <Button size="sm" onClick={send} disabled={!body.trim() || comment.isPending}>
            <SendHorizontal /> {blocked ? "Reply & resume" : "Send"}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function TaskSheet({ siteId }: { siteId: number }) {
  const { taskId, closeTask } = useTaskParam();
  const t = useTask(taskId);
  const update = useUpdateTask(siteId);
  const dir = useEmployees();
  const task = t.data;
  const question = task?.comments?.filter((c) => c.kind === "question").at(-1);

  return (
    <Sheet open={taskId != null} onOpenChange={(o) => !o && closeTask()}>
      <SheetContent className="w-full gap-0 p-0 sm:max-w-xl">
        {!task ? (
          <div className="grid gap-3 p-6"><Skeleton className="h-6 w-2/3" /><Skeleton className="h-4 w-1/2" /><Skeleton className="h-40 w-full" /></div>
        ) : (
          <>
            <SheetHeader className="border-b p-5">
              <div className="flex flex-wrap items-center gap-2">
                <TaskStatusBadge status={task.status} />
                <TaskKindBadge kind={task.kind} />
                <span className="text-xs text-muted-foreground">#{task.id}</span>
              </div>
              <SheetTitle className="text-lg leading-snug">{task.title}</SheetTitle>
              <SheetDescription className="flex items-center gap-2">
                <EmployeeAvatar actor={task.assignee} size="xs" />
                {dir.name(task.assignee)} · assigned by {dir.name(task.created_by)} · {timeAgo(task.created_at)}
              </SheetDescription>
            </SheetHeader>
            <ScrollArea className="min-h-0 flex-1">
              <div className="grid gap-6 p-5">
                {task.status === "blocked" && question && (
                  <Alert className="border-amber-500/40 bg-amber-500/5">
                    <MessageCircleQuestion className="text-amber-600" />
                    <AlertTitle>{dir.name(task.assignee)} needs your input</AlertTitle>
                    <AlertDescription>{question.body}</AlertDescription>
                  </Alert>
                )}
                {task.status === "failed" && task.error && (
                  <Alert variant="destructive"><Ban /><AlertTitle>Task failed</AlertTitle><AlertDescription className="break-words">{task.error}</AlertDescription></Alert>
                )}
                <div className="grid grid-cols-[minmax(0,1fr)_9rem] gap-3">
                  <div className="grid gap-1.5">
                    <span className="text-xs font-medium text-muted-foreground">Assignee</span>
                    <Select value={task.assignee} onValueChange={(v) => update.mutate({ id: task.id, patch: { assignee: v as EmployeeId } })}>
                      <SelectTrigger className="w-full min-w-0 [&>span]:truncate"><SelectValue /></SelectTrigger>
                      <SelectContent>{dir.assignable.map((e) => <SelectItem key={e.id} value={e.id}>{e.name} · {e.title}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-1.5">
                    <span className="text-xs font-medium text-muted-foreground">Priority</span>
                    <Select value={String(task.priority)} onValueChange={(v) => update.mutate({ id: task.id, patch: { priority: Number(v) as TaskPriority } })}>
                      <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>{PRIORITIES.map((p) => <SelectItem key={p.value} value={String(p.value)}>{p.label}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
                {task.description && (
                  <div>
                    <SectionLabel>Brief</SectionLabel>
                    <p className="text-sm leading-relaxed whitespace-pre-wrap text-muted-foreground">{task.description}</p>
                  </div>
                )}
                <Output task={task} />
                <Separator />
                <Thread task={task} siteId={siteId} />
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span>Created {formatDateTime(task.created_at)}</span>
                  {task.started_at && <span>Worked {formatDuration(task.started_at, task.completed_at)}</span>}
                  {task.usage && <span className="flex items-center gap-1"><Coins className="size-3" />{task.usage.requests} requests · {compactNumber(task.usage.input_tokens + task.usage.output_tokens)} tokens</span>}
                </div>
              </div>
            </ScrollArea>
            <div className="flex flex-wrap justify-end gap-2 border-t p-4">
              {["failed", "cancelled", "blocked"].includes(task.status) && (
                <Button variant="outline" onClick={() => update.mutate({ id: task.id, patch: { status: "todo" } })}><RotateCcw /> Retry</Button>
              )}
              {["todo", "blocked", "failed"].includes(task.status) && (
                <Button variant="ghost" onClick={() => update.mutate({ id: task.id, patch: { status: "cancelled" } })}>Cancel task</Button>
              )}
              {task.status !== "done" && task.status !== "cancelled" && (
                <Button variant="secondary" onClick={() => update.mutate({ id: task.id, patch: { status: "done" } })}><CheckCircle2 /> Mark done</Button>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
