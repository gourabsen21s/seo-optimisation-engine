import type {
  Activity,
  AgentRun,
  Audit,
  AuditSummary,
  AccountNotify,
  AccountNotifyUpdate,
  AdminAccount,
  ApiKeyInfo,
  WorkspaceMembers,
  BillingOverview,
  Me,
  PacksInfo,
  SignupBody,
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

export const API_BASE = "/api";

// ---------------------------------------------------------------------------
// Session events. The session itself lives in an HttpOnly cookie the page cannot read; the client only hears
// when the server says it is gone (401), out of credits (402) or waiting on email verification.
// ---------------------------------------------------------------------------
export type SessionEvent = "unauthorized" | "credits" | "unverified";
type Listener = (e: SessionEvent, detail: string) => void;
const listeners = new Set<Listener>();
export const sessionEvents = {
  on(l: Listener) {
    listeners.add(l);
    return () => { listeners.delete(l); };
  },
  emit(e: SessionEvent, detail = "") {
    listeners.forEach((l) => l(e, detail));
  },
};

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------
export class ApiError extends Error {
  status: number;
  detail: string;
  code: string | null;
  constructor(status: number, detail: string, code: string | null = null) {
    super(detail || `Request failed (${status})`);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
    this.code = code;
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
  signal?: AbortSignal;
  /** Skip the global signed-out handling for a 401 (the session check and sign-in forms). */
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
  // The custom header is our CSRF guard: a cross-site form cannot set it.
  const headers: Record<string, string> = { Accept: "application/json", "X-Requested-With": "rankcrew" };
  let body: BodyInit | undefined;
  if (opts.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(opts.body);
  }

  let res: Response;
  try {
    res = await fetch(buildUrl(path, opts.query), { method: opts.method ?? "GET", headers, body, signal: opts.signal, credentials: "same-origin" });
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
    const detail = extractDetail(parsed, res.statusText || `HTTP ${res.status}`);
    const code = parsed && typeof parsed === "object" && "code" in parsed ? (parsed as { code: unknown }).code : null;
    if (res.status === 401 && !opts.noAuthRedirect) sessionEvents.emit("unauthorized", detail);
    else if (res.status === 402) sessionEvents.emit("credits", detail);
    else if (res.status === 403 && code === "email_not_verified") sessionEvents.emit("unverified", detail);
    throw new ApiError(res.status, detail, typeof code === "string" ? code : null);
  }
  return parsed as T;
}

/** URL for downloads / EventSource (the session cookie authenticates them). */
export function authedUrl(path: string, query: Record<string, string> = {}): string {
  const qs = new URLSearchParams(query).toString();
  return `${API_BASE}${path}${qs ? `?${qs}` : ""}`;
}

// ---------------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------------
export const api = {
  // account & session
  me: () => request<Me>("/auth/me", { noAuthRedirect: true }),
  signup: (body: SignupBody) => request<Me & { dev_verify_url: string | null }>("/auth/signup", { method: "POST", body, noAuthRedirect: true }),
  login: (email: string, password: string) => request<Me>("/auth/login", { method: "POST", body: { email, password }, noAuthRedirect: true }),
  logout: () => request<void>("/auth/logout", { method: "POST", noAuthRedirect: true }),
  verifyEmail: (token: string) => request<{ ok: boolean; email: string }>("/auth/verify-email", { method: "POST", body: { token }, noAuthRedirect: true }),
  resendVerification: () => request<{ ok: boolean; already_verified?: boolean; dev_verify_url?: string | null }>("/auth/resend-verification", { method: "POST" }),
  forgotPassword: (email: string) => request<{ ok: boolean; dev_reset_url?: string | null }>("/auth/forgot-password", { method: "POST", body: { email }, noAuthRedirect: true }),
  resetPassword: (token: string, password: string) => request<Me>("/auth/reset-password", { method: "POST", body: { token, password }, noAuthRedirect: true }),
  changePassword: (current_password: string, new_password: string) => request<{ ok: boolean }>("/auth/change-password", { method: "POST", body: { current_password, new_password } }),
  updateProfile: (body: { name?: string; account_name?: string }) => request<Me>("/auth/profile", { method: "PATCH", body }),
  deleteAccount: (password: string) => request<void>("/auth/delete-account", { method: "POST", body: { password } }),

  // billing
  packs: () => request<PacksInfo>("/billing/packs", { noAuthRedirect: true }),
  billing: () => request<BillingOverview>("/billing"),
  checkout: (pack_id: string) => request<{ url: string }>("/billing/checkout", { method: "POST", body: { pack_id } }),
  accountNotifications: () => request<AccountNotify>("/account/notifications"),
  updateAccountNotifications: (body: AccountNotifyUpdate) => request<AccountNotify>("/account/notifications", { method: "PUT", body }),
  testAccountNotifications: () => request<{ ok: boolean; message: string }>("/account/notifications/test", { method: "POST" }),
  accountUsage: (days = 30) => request<UsageSummary & { spend: { days: number; by_reason: Record<string, number> } }>("/account/usage", { query: { days } }),
  // workspace: members, invitations, API keys
  members: () => request<WorkspaceMembers>("/workspace/members"),
  invite: (email: string, role: "member" | "owner") => request<{ id: number; email: string; role: string; dev_invite_url: string | null }>("/workspace/invites", { method: "POST", body: { email, role } }),
  revokeInvite: (id: number) => request<void>(`/workspace/invites/${id}`, { method: "DELETE" }),
  setMemberRole: (id: number, role: "member" | "owner") => request<WorkspaceMembers>(`/workspace/members/${id}`, { method: "PATCH", body: { role } }),
  removeMember: (id: number) => request<void>(`/workspace/members/${id}`, { method: "DELETE" }),
  apiKeys: () => request<ApiKeyInfo[]>("/workspace/api-keys"),
  createApiKey: (name: string) => request<ApiKeyInfo & { key: string }>("/workspace/api-keys", { method: "POST", body: { name } }),
  revokeApiKey: (id: number) => request<void>(`/workspace/api-keys/${id}`, { method: "DELETE" }),
  inviteInfo: (token: string) => request<{ email: string; workspace: string; role: string; invited_by: string | null }>("/auth/invite", { query: { token }, noAuthRedirect: true }),
  acceptInvite: (body: { token: string; name: string; password: string; accept_terms: boolean }) => request<Me>("/auth/accept-invite", { method: "POST", body, noAuthRedirect: true }),
  adminStatus: (id: number, value: "active" | "suspended") => request<{ ok: boolean }>(`/admin/accounts/${id}/status`, { method: "POST", query: { value } }),
  adminAccounts: (q = "") => request<AdminAccount[]>("/admin/accounts", { query: { q } }),
  adminGrant: (id: number, credits: number, note: string) => request<{ credits: number }>(`/admin/accounts/${id}/credits`, { method: "POST", body: { credits, note } }),


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
