import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, ApiError, errorMessage } from "./api";
import type {
  AutopilotMode,
  ConnectorType,
  CreateSiteBody,
  CreateTaskBody,
  FixStatus,
  IntegrationsUpdate,
  Job,
  JobEvent,
  JobStatus,
  KnowledgeKind,
  MemoryScope,
  ReportKind,
  SettingsUpdate,
  SitePatch,
  Task,
  TaskFilters,
  TaskPatch,
} from "./types";

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------
export const qk = {
  me: ["me"] as const,
  billing: ["billing"] as const,
  packs: ["packs"] as const,
  accountNotify: ["account-notify"] as const,
  sites: ["sites"] as const,
  site: (id: number) => ["site", id] as const,
  audits: (siteId: number) => ["audits", siteId] as const,
  audit: (auditId: number) => ["audit", auditId] as const,
  fixes: (siteId: number, status?: FixStatus) => (status ? (["fixes", siteId, status] as const) : (["fixes", siteId] as const)),
  cycles: (siteId: number) => ["cycles", siteId] as const,
  chat: (siteId: number) => ["chat", siteId] as const,
  jobs: (siteId: number) => ["jobs", siteId] as const,
  job: (jobId: number) => ["job", jobId] as const,
  metrics: (siteId: number) => ["metrics", siteId] as const,
  settings: ["settings"] as const,
  connectorFields: ["connector-fields"] as const,
  requirements: ["requirements"] as const,
  roster: ["roster"] as const,
  integrations: ["integrations"] as const,
  capabilities: ["capabilities"] as const,
  keywords: (siteId: number) => ["keywords", siteId] as const,
  keywordHistory: (siteId: number, keywordId: number) => ["keywordHistory", siteId, keywordId] as const,
  team: (siteId: number) => ["team", siteId] as const,
  tasks: (siteId: number, f?: TaskFilters) => (f ? (["tasks", siteId, f] as const) : (["tasks", siteId] as const)),
  task: (taskId: number) => ["task", taskId] as const,
  activity: (siteId: number, limit?: number) => (limit != null ? (["activity", siteId, limit] as const) : (["activity", siteId] as const)),
  memories: (siteId: number, employee?: MemoryScope | null, q?: string) =>
    employee !== undefined ? (["memories", siteId, employee ?? "all", q ?? ""] as const) : (["memories", siteId] as const),
  knowledge: (siteId: number, q: string, kinds: KnowledgeKind[]) => ["knowledge", siteId, q, kinds.join(",")] as const,
  reports: (siteId: number, kind?: ReportKind | null) => (kind !== undefined ? (["reports", siteId, kind ?? "all"] as const) : (["reports", siteId] as const)),
};

/** Refresh everything the agent team touches for a site (tasks, team, activity, reports, memory). */
export function invalidateTeam(qc: QueryClient, siteId: number) {
  for (const key of [qk.tasks(siteId), qk.team(siteId), qk.activity(siteId), qk.site(siteId), qk.cycles(siteId)]) {
    qc.invalidateQueries({ queryKey: key });
  }
  qc.invalidateQueries({ queryKey: qk.sites });
}

export function invalidateSite(qc: QueryClient, siteId: number | null | undefined) {
  qc.invalidateQueries({ queryKey: qk.sites });
  if (siteId == null) return;
  for (const key of [
    qk.site(siteId),
    qk.audits(siteId),
    qk.fixes(siteId),
    qk.cycles(siteId),
    qk.jobs(siteId),
    qk.metrics(siteId),
    qk.chat(siteId),
    qk.tasks(siteId),
    qk.team(siteId),
    qk.activity(siteId),
    qk.reports(siteId),
    qk.memories(siteId),
  ]) {
    qc.invalidateQueries({ queryKey: key });
  }
  qc.invalidateQueries({ queryKey: ["audit"] });
}

// ---------------------------------------------------------------------------
// Auth / theme
// ---------------------------------------------------------------------------
/** The signed-in user and workspace; null when signed out (a 401 is an answer, not an error). */
export function useMe() {
  return useQuery({
    queryKey: qk.me,
    queryFn: async () => {
      try {
        return await api.me();
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return null;
        throw e;
      }
    },
    staleTime: 30_000,
    retry: false,
  });
}

export function useBilling(enabled = true) {
  return useQuery({ queryKey: qk.billing, queryFn: api.billing, enabled, staleTime: 10_000 });
}

export function usePacks() {
  return useQuery({ queryKey: qk.packs, queryFn: api.packs, staleTime: 5 * 60_000 });
}

export function useAccountNotify() {
  return useQuery({ queryKey: qk.accountNotify, queryFn: api.accountNotifications });
}

export type Theme = "light" | "dark" | "system";
const THEME_KEY = "seo-engine-theme";

function applyTheme(theme: Theme) {
  const dark = theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(() => {
    try {
      const t = localStorage.getItem(THEME_KEY);
      return t === "light" || t === "dark" ? t : "system";
    } catch {
      return "system";
    }
  });

  useEffect(() => {
    applyTheme(theme);
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [theme]);

  const setTheme = useCallback((t: Theme) => {
    try {
      localStorage.setItem(THEME_KEY, t);
    } catch {
      /* ignore */
    }
    setThemeState(t);
  }, []);

  const resolved: "light" | "dark" =
    theme === "system" ? (typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light") : theme;

  return { theme, resolved, setTheme };
}

/** True when the <html> element has the `dark` class; reacts to changes. */
export function useIsDark(): boolean {
  const subscribe = useCallback((cb: () => void) => {
    const obs = new MutationObserver(cb);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);
  return useSyncExternalStore(subscribe, () => document.documentElement.classList.contains("dark"), () => false);
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------
export function useSites() {
  return useQuery({
    queryKey: qk.sites,
    queryFn: api.listSites,
    refetchInterval: (q) => (q.state.data?.some((s) => s.active_job) ? 5000 : q.state.data?.some((s) => (s.counts.open_tasks ?? 0) > 0) ? 10000 : 30000),
  });
}

export function useSite(id: number) {
  return useQuery({
    queryKey: qk.site(id),
    queryFn: () => api.getSite(id),
    enabled: Number.isFinite(id),
    refetchInterval: (q) => (q.state.data?.active_job ? 4000 : (q.state.data?.counts.open_tasks ?? 0) > 0 ? 6000 : 30000),
  });
}

export function useAudits(siteId: number) {
  return useQuery({ queryKey: qk.audits(siteId), queryFn: () => api.listAudits(siteId) });
}

export function useAudit(auditId: number | null | undefined) {
  return useQuery({
    queryKey: qk.audit(auditId ?? -1),
    queryFn: () => api.getAudit(auditId as number),
    enabled: auditId != null,
    staleTime: 60_000,
  });
}

/** The newest finished audit for a site (with the full report). */
export function useLatestAudit(siteId: number) {
  const audits = useAudits(siteId);
  const latestDone = useMemo(() => audits.data?.find((a) => a.status === "done") ?? null, [audits.data]);
  const audit = useAudit(latestDone?.id);
  return {
    audits,
    summary: latestDone,
    audit,
    report: audit.data?.report ?? null,
    isLoading: audits.isLoading || (latestDone != null && audit.isLoading),
    error: audits.error ?? audit.error,
  };
}

export function useFixes(siteId: number, status?: FixStatus) {
  return useQuery({ queryKey: qk.fixes(siteId, status), queryFn: () => api.listFixes(siteId, status) });
}

export function useCycles(siteId: number) {
  return useQuery({ queryKey: qk.cycles(siteId), queryFn: () => api.listCycles(siteId) });
}

export function useChat(siteId: number) {
  return useQuery({ queryKey: qk.chat(siteId), queryFn: () => api.getChat(siteId) });
}

export function useSiteJobs(siteId: number) {
  return useQuery({ queryKey: qk.jobs(siteId), queryFn: () => api.listJobs(siteId) });
}

export function useMetrics(siteId: number) {
  return useQuery({ queryKey: qk.metrics(siteId), queryFn: () => api.metrics(siteId), retry: false });
}

export function useSettings() {
  return useQuery({ queryKey: qk.settings, queryFn: api.getSettings });
}

export function useConnectorFields() {
  return useQuery({ queryKey: qk.connectorFields, queryFn: api.connectorFields, staleTime: Infinity });
}

export function useRequirements() {
  return useQuery({ queryKey: qk.requirements, queryFn: api.requirements, staleTime: Infinity });
}

// ---------------------------------------------------------------------------
// Agent team
// ---------------------------------------------------------------------------
const isLive = (t: Pick<Task, "status">) => t.status === "todo" || t.status === "in_progress";

export function useRoster() {
  const signedIn = !!useMe().data;
  return useQuery({ queryKey: [...qk.roster, signedIn], queryFn: api.roster, staleTime: Infinity, retry: false, enabled: signedIn });
}

export function useTeam(siteId: number) {
  return useQuery({
    queryKey: qk.team(siteId),
    queryFn: () => api.team(siteId),
    refetchInterval: (q) => (q.state.data?.employees.some((e) => e.status === "working") ? 4000 : 20000),
  });
}

/** Tasks for a site. Polls every 4s while any task is queued or running, otherwise stops. */
export function useTasks(siteId: number, filters: TaskFilters = {}) {
  return useQuery({
    queryKey: qk.tasks(siteId, filters),
    queryFn: () => api.listTasks(siteId, filters),
    refetchInterval: (q) => (q.state.data?.some(isLive) ? 4000 : false),
  });
}

export function useTask(taskId: number | null) {
  return useQuery({
    queryKey: qk.task(taskId ?? -1),
    queryFn: () => api.getTask(taskId as number),
    enabled: taskId != null,
    refetchInterval: (q) => (q.state.data && isLive(q.state.data) ? 4000 : false),
  });
}

export function useActivity(siteId: number, limit = 100, live = false) {
  return useQuery({
    queryKey: qk.activity(siteId, limit),
    queryFn: () => api.activity(siteId, limit),
    refetchInterval: live ? 5000 : 30000,
  });
}

export function useMemories(siteId: number, employee: MemoryScope | null, q: string) {
  return useQuery({
    queryKey: qk.memories(siteId, employee, q),
    queryFn: () => api.listMemories(siteId, employee ?? undefined, q || undefined),
    placeholderData: (prev) => prev,
  });
}

export function useKnowledge(siteId: number, q: string, kinds: KnowledgeKind[]) {
  return useQuery({
    queryKey: qk.knowledge(siteId, q, kinds),
    queryFn: () => api.knowledge(siteId, q, kinds),
    enabled: q.trim().length > 1,
    placeholderData: (prev) => prev,
    staleTime: 60_000,
  });
}

export function useReports(siteId: number, kind: ReportKind | null) {
  return useQuery({ queryKey: qk.reports(siteId, kind), queryFn: () => api.listReports(siteId, kind ?? undefined) });
}

// ---------------------------------------------------------------------------
// Tracked jobs: jobs started from this browser, per site, so progress panels
// appear immediately (before the site's `active_job` refreshes) and remain
// visible after completion until dismissed.
// ---------------------------------------------------------------------------
let trackedJobs: Record<number, number> = {};
const trackedListeners = new Set<() => void>();

export const jobTracker = {
  track(siteId: number, jobId: number) {
    trackedJobs = { ...trackedJobs, [siteId]: jobId };
    trackedListeners.forEach((l) => l());
  },
  dismiss(siteId: number) {
    const next = { ...trackedJobs };
    delete next[siteId];
    trackedJobs = next;
    trackedListeners.forEach((l) => l());
  },
  subscribe(l: () => void) {
    trackedListeners.add(l);
    return () => trackedListeners.delete(l);
  },
  snapshot: () => trackedJobs,
};

export function useTrackedJob(siteId: number): number | null {
  const all = useSyncExternalStore(jobTracker.subscribe, jobTracker.snapshot, jobTracker.snapshot);
  return all[siteId] ?? null;
}

// ---------------------------------------------------------------------------
// Live job progress: SSE with polling fallback
// ---------------------------------------------------------------------------
export type JobStreamState = {
  job: Job | null;
  events: JobEvent[];
  status: JobStatus | null;
  transport: "sse" | "polling" | null;
  error: string | null;
};

const eventKey = (e: JobEvent) => `${e.at}|${e.message}`;

function mergeEvents(prev: JobEvent[], incoming: JobEvent[]): JobEvent[] {
  const seen = new Set(prev.map(eventKey));
  const out = [...prev];
  for (const e of incoming) {
    const k = eventKey(e);
    if (!seen.has(k)) {
      seen.add(k);
      out.push(e);
    }
  }
  return out;
}

export function useJobStream(jobId: number | null, onDone?: (job: Job) => void): JobStreamState {
  const [state, setState] = useState<JobStreamState>({ job: null, events: [], status: null, transport: null, error: null });
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  useEffect(() => {
    setState({ job: null, events: [], status: null, transport: null, error: null });
    if (jobId == null) return;

    let cancelled = false;
    let finished = false;
    let es: EventSource | null = null;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;

    const finish = (job: Job) => {
      if (finished || cancelled) return;
      finished = true;
      es?.close();
      if (pollTimer) clearTimeout(pollTimer);
      setState((s) => ({ ...s, job, status: job.status, events: mergeEvents(s.events, job.events ?? []) }));
      onDoneRef.current?.(job);
    };

    const applyJob = (job: Job) => {
      if (cancelled) return;
      if (job.status === "done" || job.status === "failed") {
        finish(job);
        return;
      }
      setState((s) => ({ ...s, job, status: job.status, events: mergeEvents(s.events, job.events ?? []) }));
    };

    const poll = async () => {
      if (cancelled || finished) return;
      try {
        applyJob(await api.getJob(jobId));
        setState((s) => (s.error ? { ...s, error: null } : s));
      } catch (e) {
        if (!cancelled) setState((s) => ({ ...s, error: errorMessage(e) }));
      }
      if (!cancelled && !finished) pollTimer = setTimeout(poll, 2000);
    };

    const startPolling = () => {
      es?.close();
      es = null;
      if (cancelled || finished) return;
      setState((s) => ({ ...s, transport: "polling" }));
      if (!pollTimer) void poll();
    };

    // Initial snapshot (history + handles already-finished jobs)
    api
      .getJob(jobId)
      .then(applyJob)
      .catch((e) => !cancelled && setState((s) => ({ ...s, error: errorMessage(e) })));

    if (typeof EventSource !== "undefined") {
      try {
        es = new EventSource(api.jobStreamUrl(jobId));
        setState((s) => ({ ...s, transport: "sse" }));
        es.addEventListener("progress", (ev) => {
          try {
            const e = JSON.parse((ev as MessageEvent<string>).data) as JobEvent;
            setState((s) => ({ ...s, status: s.status === "queued" || !s.status ? "running" : s.status, events: mergeEvents(s.events, [e]) }));
          } catch {
            /* ignore malformed */
          }
        });
        es.addEventListener("done", (ev) => {
          try {
            finish(JSON.parse((ev as MessageEvent<string>).data) as Job);
          } catch {
            startPolling();
          }
        });
        es.onerror = () => {
          if (!finished) startPolling();
        };
      } catch {
        startPolling();
      }
    } else {
      startPolling();
    }

    return () => {
      cancelled = true;
      es?.close();
      if (pollTimer) clearTimeout(pollTimer);
    };
  }, [jobId]);

  return state;
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------
export function useCreateSite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateSiteBody) => api.createSite(body),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: qk.sites });
      if (res.job_id != null) jobTracker.track(res.site.id, res.job_id);
      qc.invalidateQueries({ queryKey: qk.me });
      if (res.audit_blocked) toast.warning(`Added ${res.site.name || res.site.url}`, { description: `The first audit is waiting: ${res.audit_blocked}` });
      else toast.success(`Added ${res.site.name || res.site.url}`, { description: res.job_id ? "First audit started." : undefined });
    },
    onError: (e) => toast.error("Could not add site", { description: errorMessage(e) }),
  });
}

export function useUpdateSite(siteId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: SitePatch) => api.updateSite(siteId, body),
    onSuccess: (site) => {
      qc.setQueryData(qk.site(siteId), site);
      qc.invalidateQueries({ queryKey: qk.sites });
      toast.success("Settings saved");
    },
    onError: (e) => toast.error("Could not save", { description: errorMessage(e) }),
  });
}

export function useSetAutopilot(siteId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (autopilot: AutopilotMode) => api.updateSite(siteId, { autopilot }),
    onSuccess: (site) => {
      qc.setQueryData(qk.site(siteId), site);
      qc.invalidateQueries({ queryKey: qk.sites });
      toast.success(`Autopilot: ${site.autopilot}`);
    },
    onError: (e) => toast.error("Could not change autopilot", { description: errorMessage(e) }),
  });
}

export function useDeleteSite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.deleteSite(id),
    onSuccess: (_d, id) => {
      qc.removeQueries({ queryKey: qk.site(id) });
      qc.invalidateQueries({ queryKey: qk.sites });
      toast.success("Site deleted");
    },
    onError: (e) => toast.error("Could not delete site", { description: errorMessage(e) }),
  });
}

export function useStartAudit(siteId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.startAudit(siteId),
    onSuccess: ({ job_id }) => {
      jobTracker.track(siteId, job_id);
      qc.invalidateQueries({ queryKey: qk.site(siteId) });
      qc.invalidateQueries({ queryKey: qk.sites });
      toast.success("Audit started");
    },
    onError: (e) => toast.error("Could not start audit", { description: errorMessage(e) }),
  });
}

export function useStartCycle(siteId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (freshAudit: boolean) => api.startCycle(siteId, freshAudit),
    onSuccess: ({ job_id }) => {
      jobTracker.track(siteId, job_id);
      qc.invalidateQueries({ queryKey: qk.site(siteId) });
      qc.invalidateQueries({ queryKey: qk.sites });
      toast.success("Optimisation cycle started", { description: "Theo audits, then Maya plans and assigns tasks to the team." });
    },
    onError: (e) => toast.error("Could not start cycle", { description: errorMessage(e) }),
  });
}

export function useFixDecision(siteId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ action, ids }: { action: "approve" | "reject"; ids: string[] }) =>
      action === "approve" ? api.approveFixes(ids) : api.rejectFixes(ids),
    onSuccess: (res, { action }) => {
      qc.invalidateQueries({ queryKey: qk.fixes(siteId) });
      qc.invalidateQueries({ queryKey: qk.site(siteId) });
      qc.invalidateQueries({ queryKey: qk.sites });
      toast.success(`${action === "approve" ? "Approved" : "Rejected"} ${res.updated} fix${res.updated === 1 ? "" : "es"}`);
    },
    onError: (e) => toast.error("Update failed", { description: errorMessage(e) }),
  });
}

export function usePreviewFixes(siteId: number) {
  return useMutation({
    mutationFn: (ids: string[]) => api.previewFixes(siteId, ids),
    onError: (e) => toast.error("Preview failed", { description: errorMessage(e) }),
  });
}

export function useApplyFixes(siteId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) => api.applyFixes(siteId, ids),
    onSuccess: ({ job_id }) => {
      jobTracker.track(siteId, job_id);
      qc.invalidateQueries({ queryKey: qk.site(siteId) });
      toast.success("Applying fixes", { description: "Progress is shown on the Overview panel." });
    },
    onError: (e) => toast.error("Could not apply fixes", { description: errorMessage(e) }),
  });
}

export function useRollbackFix(siteId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (fixId: string) => api.rollbackFix(fixId),
    onSuccess: ({ job_id }) => {
      jobTracker.track(siteId, job_id);
      qc.invalidateQueries({ queryKey: qk.site(siteId) });
      toast.success("Rollback started");
    },
    onError: (e) => toast.error("Rollback failed", { description: errorMessage(e) }),
  });
}

export function useSendChat(siteId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (message: string) => api.sendChat(siteId, message),
    onSuccess: (res) => {
      qc.setQueryData(qk.chat(siteId), { transcript: res.transcript });
      if (res.proposals.length) {
        qc.invalidateQueries({ queryKey: qk.fixes(siteId) });
        qc.invalidateQueries({ queryKey: qk.site(siteId) });
      }
      if (res.created_tasks?.length) invalidateTeam(qc, siteId);
    },
    onError: (e) => toast.error("Maya could not reply", { description: errorMessage(e) }),
  });
}

export function useCreateTask(siteId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateTaskBody) => api.createTask(siteId, body),
    onSuccess: (task) => {
      qc.setQueryData(qk.task(task.id), task);
      invalidateTeam(qc, siteId);
      toast.success("Task assigned", { description: task.title });
    },
    onError: (e) => toast.error("Could not create task", { description: errorMessage(e) }),
  });
}

export function useUpdateTask(siteId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: TaskPatch }) => api.updateTask(id, patch),
    onSuccess: (task) => {
      qc.setQueryData(qk.task(task.id), task);
      invalidateTeam(qc, siteId);
    },
    onError: (e) => toast.error("Could not update task", { description: errorMessage(e) }),
  });
}

export function useCommentTask(siteId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: string }) => api.commentTask(id, body),
    onSuccess: (task) => {
      qc.setQueryData(qk.task(task.id), task);
      invalidateTeam(qc, siteId);
    },
    onError: (e) => toast.error("Could not post comment", { description: errorMessage(e) }),
  });
}

export function useAddMemory(siteId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ text, employee }: { text: string; employee: MemoryScope }) => api.addMemory(siteId, text, employee),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.memories(siteId) });
      qc.invalidateQueries({ queryKey: qk.team(siteId) });
      toast.success("The team will remember that");
    },
    onError: (e) => toast.error("Could not save memory", { description: errorMessage(e) }),
  });
}

export function useDeleteMemory(siteId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (memoryId: string) => api.deleteMemory(siteId, memoryId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.memories(siteId) });
      qc.invalidateQueries({ queryKey: qk.team(siteId) });
      toast.success("Memory deleted");
    },
    onError: (e) => toast.error("Could not delete memory", { description: errorMessage(e) }),
  });
}

export function useGenerateReport(siteId: number) {
  return useMutation({
    mutationFn: (kind: "standup" | "weekly") => api.generateReport(siteId, kind),
    onSuccess: (_r, kind) => toast.success(kind === "standup" ? "Generating standup" : "Generating weekly report"),
    onError: (e) => toast.error("Could not generate report", { description: errorMessage(e) }),
  });
}

export function useClearChat(siteId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.clearChat(siteId),
    onSuccess: () => {
      qc.setQueryData(qk.chat(siteId), { transcript: [] });
      toast.success("Chat cleared");
    },
    onError: (e) => toast.error("Could not clear chat", { description: errorMessage(e) }),
  });
}

export function useSaveConnector(siteId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ type, config }: { type: ConnectorType; config: Record<string, unknown> }) => api.saveConnector(siteId, type, config),
    onSuccess: (site) => {
      qc.setQueryData(qk.site(siteId), site);
      qc.invalidateQueries({ queryKey: qk.sites });
      toast.success("Connector saved");
    },
    onError: (e) => toast.error("Could not save connector", { description: errorMessage(e) }),
  });
}

export function useSaveGsc(siteId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ property, json }: { property: string; json: string }) => api.saveGsc(siteId, property, json),
    onSuccess: (site) => {
      qc.setQueryData(qk.site(siteId), site);
      toast.success("Search Console saved");
    },
    onError: (e) => toast.error("Could not save Search Console", { description: errorMessage(e) }),
  });
}

export function useUpdateSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: SettingsUpdate) => api.updateSettings(body),
    onSuccess: (data) => {
      qc.setQueryData(qk.settings, data);
      toast.success("Settings saved");
    },
    onError: (e) => toast.error("Could not save settings", { description: errorMessage(e) }),
  });
}

// ---------------------------------------------------------------------------
// Misc
// ---------------------------------------------------------------------------
export function useDebounced<T>(value: T, ms = 200): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (cb: () => void) => {
      const mq = window.matchMedia(query);
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    [query],
  );
  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches, () => false);
}

export type LatestAudit = ReturnType<typeof useLatestAudit>;

// ---------------------------------------------------------------------------
// Integrations, capabilities & rank tracking
// ---------------------------------------------------------------------------
export function useIntegrations() {
  return useQuery({ queryKey: qk.integrations, queryFn: api.getIntegrations });
}

export function useUpdateIntegrations() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: IntegrationsUpdate) => api.updateIntegrations(body),
    onSuccess: (data) => {
      qc.setQueryData(qk.integrations, data);
      qc.invalidateQueries({ queryKey: qk.capabilities });
      toast.success("Settings saved");
    },
    onError: (e) => toast.error("Could not save settings", { description: errorMessage(e) }),
  });
}

export function useCapabilities() {
  return useQuery({ queryKey: qk.capabilities, queryFn: api.capabilities, staleTime: 60_000 });
}

export function useKeywords(siteId: number) {
  return useQuery({ queryKey: qk.keywords(siteId), queryFn: () => api.listKeywords(siteId), refetchInterval: 60_000 });
}

export function useKeywordHistory(siteId: number, keywordId: number | null) {
  return useQuery({
    queryKey: qk.keywordHistory(siteId, keywordId ?? -1),
    queryFn: () => api.keywordHistory(siteId, keywordId!),
    enabled: keywordId != null,
  });
}

export function useAddKeywords(siteId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (keywords: { keyword: string; target_url?: string | null }[]) => api.addKeywords(siteId, keywords),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: qk.keywords(siteId) });
      toast.success(r.added ? `Tracking ${r.added} new keyword${r.added === 1 ? "" : "s"}` : "Those keywords are already tracked");
    },
    onError: (e) => toast.error("Could not add keywords", { description: errorMessage(e) }),
  });
}

export function useDeleteKeyword(siteId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (keywordId: number) => api.deleteKeyword(siteId, keywordId),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.keywords(siteId) }),
    onError: (e) => toast.error("Could not remove keyword", { description: errorMessage(e) }),
  });
}

export function useCheckRankings(siteId: number) {
  return useMutation({
    mutationFn: () => api.checkRankings(siteId),
    onSuccess: (r) => {
      jobTracker.track(siteId, r.job_id);
      toast.success("Checking rankings…");
    },
    onError: (e) => toast.error("Could not start the rank check", { description: errorMessage(e) }),
  });
}
