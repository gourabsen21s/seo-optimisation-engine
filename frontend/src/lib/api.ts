import type {
  Activity,
  AgentRun,
  Audit,
  AuditSummary,
  AuthCheck,
  ChatResponse,
  ChatEntry,
  ConnectorField,
  ConnectorType,
  CreateSiteBody,
  CreateSiteResponse,
  CreateTaskBody,
  Employee,
  Fix,
  FixResult,
  FixStatus,
  Job,
  JobRef,
  KnowledgeHit,
  KnowledgeKind,
  LLMTestResult,
  Memory,
  MemoryScope,
  Metric,
  Report,
  ReportKind,
  Requirement,
  SettingsResponse,
  SettingsUpdate,
  Site,
  SitePatch,
  Task,
  TaskFilters,
  TaskPatch,
  TeamResponse,
  TestResult,
  Capabilities,
  IntegrationTarget,
  IntegrationsSettings,
  IntegrationsUpdate,
  KeywordHistoryPoint,
  TrackedKeyword,
  UsageSummary,
} from "./types";

const KEY_STORAGE = "seo-engine-api-key";
export const API_BASE = "/api";

// ---------------------------------------------------------------------------
// API key store (localStorage + subscribers, usable with useSyncExternalStore)
// ---------------------------------------------------------------------------
type Listener = () => void;
const listeners = new Set<Listener>();

function readKey(): string | null {
  try {
    return localStorage.getItem(KEY_STORAGE);
  } catch {
    return null;
  }
}

let currentKey: string | null = readKey();

export const auth = {
  getKey: () => currentKey,
  setKey(key: string | null) {
    currentKey = key;
    try {
      if (key) localStorage.setItem(KEY_STORAGE, key);
      else localStorage.removeItem(KEY_STORAGE);
    } catch {
      /* storage unavailable */
    }
    listeners.forEach((l) => l());
  },
  logout() {
    auth.setKey(null);
  },
  subscribe(l: Listener) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
};

if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key === KEY_STORAGE) {
      currentKey = e.newValue;
      listeners.forEach((l) => l());
    }
  });
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------
export class ApiError extends Error {
  status: number;
  detail: string;
  constructor(status: number, detail: string) {
    super(detail || `Request failed (${status})`);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
  }
}

function extractDetail(body: unknown, fallback: string): string {
  if (body && typeof body === "object" && "detail" in body) {
    const d = (body as { detail: unknown }).detail;
    if (typeof d === "string") return d;
    if (Array.isArray(d)) {
      return d
        .map((item) => {
          if (item && typeof item === "object") {
            const o = item as { msg?: unknown; loc?: unknown };
            const loc = Array.isArray(o.loc) ? o.loc.filter((p) => p !== "body").join(".") : "";
            const msg = typeof o.msg === "string" ? o.msg : JSON.stringify(item);
            return loc ? `${loc}: ${msg}` : msg;
          }
          return String(item);
        })
        .join("; ");
    }
    if (d != null) return JSON.stringify(d);
  }
  if (typeof body === "string" && body.trim()) return body.slice(0, 300);
  return fallback;
}

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.detail;
  if (err instanceof Error) return err.message;
  return String(err);
}

// ---------------------------------------------------------------------------
// Core fetch wrapper
// ---------------------------------------------------------------------------
type RequestOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  query?: Record<string, string | number | boolean | null | undefined>;
  key?: string | null;
  signal?: AbortSignal;
  /** Skip the global logout-on-401 behaviour (used by the login form). */
  noAuthRedirect?: boolean;
};

function buildUrl(path: string, query?: RequestOptions["query"]): string {
  let url = `${API_BASE}${path}`;
  if (query) {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null && v !== "") params.set(k, String(v));
    }
    const qs = params.toString();
    if (qs) url += `?${qs}`;
  }
  return url;
}

export async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  const key = opts.key !== undefined ? opts.key : currentKey;
  if (key) headers["X-API-Key"] = key;
  let body: BodyInit | undefined;
  if (opts.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(opts.body);
  }

  let res: Response;
  try {
    res = await fetch(buildUrl(path, opts.query), { method: opts.method ?? "GET", headers, body, signal: opts.signal });
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") throw e;
    throw new ApiError(0, "Cannot reach the server. Is the backend running?");
  }

  if (res.status === 204) return undefined as T;

  const text = await res.text();
  let parsed: unknown = undefined;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }

  if (!res.ok) {
    // Only log out if this request used the key that's still active — a stale 401 (e.g. a request sent
    // before login finished) must not wipe a freshly entered key.
    if (res.status === 401 && !opts.noAuthRedirect && key && key === currentKey) auth.logout();
    throw new ApiError(res.status, extractDetail(parsed, res.statusText || `HTTP ${res.status}`));
  }
  return parsed as T;
}

/** URL with the API key as a query parameter (for downloads / EventSource). */
export function authedUrl(path: string, query: Record<string, string> = {}): string {
  const params = new URLSearchParams(query);
  if (currentKey) params.set("api_key", currentKey);
  return `${API_BASE}${path}?${params.toString()}`;
}

// ---------------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------------
export const api = {
  checkAuth: (key: string) => request<AuthCheck>("/auth/check", { key, noAuthRedirect: true }),

  // sites
  listSites: () => request<Site[]>("/sites"),
  getSite: (id: number) => request<Site>(`/sites/${id}`),
  createSite: (body: CreateSiteBody) => request<CreateSiteResponse>("/sites", { method: "POST", body }),
  updateSite: (id: number, body: SitePatch) => request<Site>(`/sites/${id}`, { method: "PATCH", body }),
  deleteSite: (id: number) => request<void>(`/sites/${id}`, { method: "DELETE" }),

  // connectors
  connectorFields: () => request<Record<ConnectorType, ConnectorField[]>>("/connectors/fields"),
  saveConnector: (id: number, type: ConnectorType, config: Record<string, unknown>) =>
    request<Site>(`/sites/${id}/connector`, { method: "PUT", body: { type, config } }),
  testConnector: (id: number) => request<TestResult>(`/sites/${id}/connector/test`, { method: "POST" }),

  // search console
  saveGsc: (id: number, property_url: string, service_account_json: string) =>
    request<Site>(`/sites/${id}/gsc`, { method: "PUT", body: { property_url, service_account_json } }),
  testGsc: (id: number) => request<TestResult>(`/sites/${id}/gsc/test`, { method: "POST" }),
  metrics: (id: number) => request<Metric[]>(`/sites/${id}/metrics`),

  // audits
  startAudit: (id: number) => request<JobRef>(`/sites/${id}/audits`, { method: "POST" }),
  listAudits: (id: number) => request<AuditSummary[]>(`/sites/${id}/audits`),
  getAudit: (auditId: number) => request<Audit>(`/audits/${auditId}`),
  auditExportUrl: (auditId: number, format: "html" | "json") => authedUrl(`/audits/${auditId}/export`, { format }),

  // cycles
  startCycle: (id: number, fresh_audit = false) =>
    request<JobRef>(`/sites/${id}/cycles`, { method: "POST", body: { fresh_audit } }),
  listCycles: (id: number) => request<AgentRun[]>(`/sites/${id}/cycles`),

  // fixes
  listFixes: (id: number, status?: FixStatus) => request<Fix[]>(`/sites/${id}/fixes`, { query: { status } }),
  approveFixes: (ids: string[]) => request<{ updated: number }>("/fixes/approve", { method: "POST", body: { ids } }),
  rejectFixes: (ids: string[]) => request<{ updated: number }>("/fixes/reject", { method: "POST", body: { ids } }),
  previewFixes: (id: number, ids: string[]) =>
    request<{ results: FixResult[] }>(`/sites/${id}/fixes/preview`, { method: "POST", body: { ids } }),
  applyFixes: (id: number, ids: string[]) => request<JobRef>(`/sites/${id}/fixes/apply`, { method: "POST", body: { ids } }),
  rollbackFix: (fixId: string) => request<JobRef>(`/fixes/${encodeURIComponent(fixId)}/rollback`, { method: "POST" }),

  // chat
  getChat: (id: number) => request<{ transcript: ChatEntry[] }>(`/sites/${id}/chat`),
  sendChat: (id: number, message: string) => request<ChatResponse>(`/sites/${id}/chat`, { method: "POST", body: { message } }),
  clearChat: (id: number) => request<void>(`/sites/${id}/chat`, { method: "DELETE" }),

  // agent team
  roster: () => request<Employee[]>("/team/roster"),
  team: (id: number) => request<TeamResponse>(`/sites/${id}/team`),
  listTasks: (id: number, f: TaskFilters = {}) =>
    request<Task[]>(`/sites/${id}/tasks`, { query: { status: f.status?.join(","), assignee: f.assignee, run_id: f.run_id } }),
  createTask: (id: number, body: CreateTaskBody) => request<Task>(`/sites/${id}/tasks`, { method: "POST", body }),
  getTask: (taskId: number) => request<Task>(`/tasks/${taskId}`),
  updateTask: (taskId: number, body: TaskPatch) => request<Task>(`/tasks/${taskId}`, { method: "PATCH", body }),
  commentTask: (taskId: number, body: string) => request<Task>(`/tasks/${taskId}/comments`, { method: "POST", body: { body } }),
  activity: (id: number, limit = 100) => request<Activity[]>(`/sites/${id}/activity`, { query: { limit } }),

  // memory & knowledge
  listMemories: (id: number, employee?: MemoryScope, q?: string) => request<Memory[]>(`/sites/${id}/memories`, { query: { employee, q } }),
  addMemory: (id: number, text: string, employee: MemoryScope = "team") =>
    request<{ id: string }>(`/sites/${id}/memories`, { method: "POST", body: { text, employee } }),
  deleteMemory: (id: number, memoryId: string) => request<void>(`/sites/${id}/memories/${encodeURIComponent(memoryId)}`, { method: "DELETE" }),
  knowledge: (id: number, q: string, kinds?: KnowledgeKind[]) =>
    request<KnowledgeHit[]>(`/sites/${id}/knowledge`, { query: { q, kind: kinds?.length ? kinds.join(",") : undefined } }),

  // reports
  listReports: (id: number, kind?: ReportKind) => request<Report[]>(`/sites/${id}/reports`, { query: { kind } }),
  generateReport: (id: number, kind: "standup" | "weekly") => request<JobRef>(`/sites/${id}/reports/${kind}`, { method: "POST" }),

  // jobs
  getJob: (jobId: number) => request<Job>(`/jobs/${jobId}`),
  listJobs: (id: number) => request<Job[]>(`/sites/${id}/jobs`),
  jobStreamUrl: (jobId: number) => authedUrl(`/jobs/${jobId}/stream`),

  // settings
  getSettings: () => request<SettingsResponse>("/settings/llm"),
  updateSettings: (body: SettingsUpdate) => request<SettingsResponse>("/settings/llm", { method: "PUT", body }),
  testLlm: (target: "llm" | "judge") => request<LLMTestResult>("/settings/llm/test", { method: "POST", body: { target } }),

  requirements: () => request<Requirement[]>("/requirements"),

  // integrations, usage & capabilities
  getIntegrations: () => request<IntegrationsSettings>("/settings/integrations"),
  updateIntegrations: (body: IntegrationsUpdate) => request<IntegrationsSettings>("/settings/integrations", { method: "PUT", body }),
  testIntegration: (target: IntegrationTarget) => request<LLMTestResult>("/settings/integrations/test", { method: "POST", body: { target } }),
  usage: (days = 30) => request<UsageSummary>("/settings/usage", { query: { days } }),
  capabilities: () => request<Capabilities>("/capabilities"),

  // rank tracking
  listKeywords: (id: number) => request<TrackedKeyword[]>(`/sites/${id}/keywords`),
  addKeywords: (id: number, keywords: { keyword: string; target_url?: string | null; country?: string | null }[]) =>
    request<{ added: number }>(`/sites/${id}/keywords`, { method: "POST", body: { keywords } }),
  deleteKeyword: (id: number, keywordId: number) => request<void>(`/sites/${id}/keywords/${keywordId}`, { method: "DELETE" }),
  keywordHistory: (id: number, keywordId: number, days = 90) =>
    request<KeywordHistoryPoint[]>(`/sites/${id}/keywords/${keywordId}/history`, { query: { days } }),
  checkRankings: (id: number) => request<JobRef>(`/sites/${id}/keywords/check`, { method: "POST" }),
};
