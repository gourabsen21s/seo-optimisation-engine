/* eslint-disable @typescript-eslint/no-explicit-any */
// API contract types. Keep in sync with the FastAPI backend.

export type Severity = "critical" | "high" | "medium" | "low" | "info";
export type SectionId = "A" | "B" | "C" | "D" | "E" | "F" | "G" | "H";
export type FindingCategory = "seo" | "adsense" | "performance" | "content";

export type Finding = {
  code: string;
  title: string;
  severity: Severity;
  requirement: number | null;
  category: FindingCategory;
  detail: string;
  recommendation: string;
  urls: string[];
  fixable: boolean;
};

export type RequirementStatus = "pass" | "warn" | "fail" | "manual";
export type RequirementLevel = "mandatory" | "strongly_advised" | "recommended";

export type RequirementResult = {
  id: number;
  section: SectionId;
  title: string;
  level: RequirementLevel;
  status: RequirementStatus;
  verify: string;
  findings: string[];
};

export type PageRow = {
  url: string;
  status: number;
  type: string;
  title: string | null;
  meta_description: string | null;
  words: number;
  h1: string[];
  indexable: boolean;
  response_ms: number;
  images_missing_alt: number;
  schema: string[];
};

export type PageSpeed = {
  url: string;
  strategy: string;
  performance?: number | null;
  accessibility?: number | null;
  best_practices?: number | null;
  seo?: number | null;
  lcp_ms?: number | null;
  cls?: number | null;
  inp_ms?: number | null;
  tbt_ms?: number | null;
  error?: string;
  opportunities?: { id: string; title: string; savings_ms: number }[];
};

export type AuditReport = {
  site_url: string;
  seo_score: number;
  adsense_score: number;
  overall_score: number;
  section_scores: Record<SectionId, number>;
  pages_crawled: number;
  findings: Finding[];
  requirements: RequirementResult[];
  pages: PageRow[];
  stats: {
    html_pages: number;
    articles: number;
    avg_words: number;
    sitemap_urls: number;
    broken: number;
    truncated: boolean;
    by_severity: Record<Severity, number>;
  };
  pagespeed: PageSpeed[];
};

export type Judgement = {
  url: string;
  words: number;
  policy_risks: string[];
  reads_generic_ai: number;
  helpful_depth: number;
  cites_sources: boolean;
  needs_medical_disclaimer: boolean;
  search_intent: string;
  confidence: Record<string, number>;
};

export type Scores = { overall: number; seo: number; adsense: number };
export type ActiveJob = { id: number; type: string; status: string } | null;
export type AutopilotMode = "off" | "safe" | "full";
export type ConnectorType = "wordpress" | "github" | "local";
export type Niche = "general" | "health" | "finance" | "news";

export type SiteProfile = {
  name: string;
  url: string;
  description: string;
  owner_name: string;
  email: string;
  city: string;
  region: string;
  country: string;
  country_code: string;
  language: string;
  logo_url: string;
  founding_year: string;
  social_links: string[];
  publisher_id: string;
  platform: string;
  niche: Niche;
  author_name: string;
  author_bio: string;
  author_url: string;
  author_image: string;
  block_ai_training: boolean;
  target_keywords: string[];
};

export type Site = {
  id: number;
  name: string;
  url: string;
  platform: string;
  autopilot: AutopilotMode;
  audit_every_hours: number;
  cycle_every_hours: number;
  auto_publish_content: boolean;
  obey_robots: boolean;
  max_pages: number | null;
  connector_type: ConnectorType | null;
  connector_configured: boolean;
  connector_public: Record<string, string | boolean>;
  gsc_property: string | null;
  gsc_configured: boolean;
  last_audit_at: string | null;
  last_cycle_at: string | null;
  latest_scores: Scores | null;
  profile: SiteProfile;
  created_at: string;
  active_job: ActiveJob;
  counts: {
    proposed_fixes: number;
    applied_fixes: number;
    audits: number;
    /** Team tasks that are todo / in progress / blocked. */
    open_tasks?: number;
    /** Tasks blocked on a question for the human owner. */
    waiting_on_you?: number;
  };
};

export type JobStatus = "queued" | "running" | "done" | "failed";

export type AuditSummary = {
  id: number;
  status: JobStatus;
  overall_score: number | null;
  seo_score: number | null;
  adsense_score: number | null;
  created_at: string;
  finished_at: string | null;
  error: string | null;
};

export type Audit = AuditSummary & { report: AuditReport | null; judgements: Judgement[] | null };

export type FixStatus = "proposed" | "approved" | "rejected" | "applied" | "failed";
export type FixKind =
  | "set_title"
  | "set_meta_description"
  | "set_canonical"
  | "set_lang"
  | "add_viewport"
  | "set_image_alt"
  | "add_json_ld"
  | "set_open_graph"
  | "write_file"
  | "create_page"
  | "add_internal_link"
  | "remove_internal_link"
  | "code_change"
  | "manual";

export type Fix = {
  id: string;
  kind: FixKind;
  title: string;
  rationale: string;
  target_url: string | null;
  payload: Record<string, any>;
  risk: "safe" | "review";
  requirement: number | null;
  finding_code: string | null;
  source: "rules" | "agent" | "rollback";
  status: FixStatus;
  result: { ok: boolean; message: string; diff?: string | null; manual?: boolean } | null;
  baseline: Record<string, number> | null;
  impact: { verdict?: "improved" | "neutral" | "worse"; delta?: Record<string, number>; rolled_back?: boolean } | null;
  rollback_of: string | null;
  created_at: string;
  applied_at: string | null;
};

export type FixResult = { fix_id: string; ok: boolean; message: string; diff: string | null; manual: boolean };

export type JobEvent = { at: string; message: string; level?: "info" | "warning" | "error" };
export type JobType = "audit" | "cycle" | "apply" | "rollback" | "measure" | "task" | "standup" | "weekly_report";

export type Job = {
  id: number;
  type: JobType;
  site_id: number | null;
  status: JobStatus;
  events: JobEvent[];
  result: Record<string, any> | null;
  error: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
};

export type StrategyPriority = { title: string; why: string; impact: string; effort: string };
export type ContentPlanItem = {
  title: string;
  target_keyword: string;
  search_intent: string;
  outline: string[];
  internal_links: string[];
  target_words: number;
  action: string;
  existing_url: string | null;
};
export type ContentRisk = { url: string; category: string; excerpt: string; explanation: string; severity: string };
export type Strategy = {
  summary: string;
  priorities: StrategyPriority[];
  content_plan: ContentPlanItem[];
  content_risks: ContentRisk[];
  manual_actions: string[];
};
export type Usage = { requests: number; input_tokens: number; output_tokens: number };

export type AgentRun = {
  id: number;
  kind: "cycle";
  status: string;
  model: string | null;
  output: {
    cycle?: { summary: string; actions: string[]; next_focus: string; expected_impact: string };
    strategy?: Strategy;
    stats?: Record<string, number>;
  } | null;
  usage: Usage | null;
  error: string | null;
  created_at: string;
  finished_at: string | null;
};

export type Metric = {
  captured_at: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number | null;
  top_queries: { query: string; clicks: number; impressions: number; position: number }[];
};

export type ChatEntry = { role: "user" | "assistant"; content: string; at: string };
export type Provider = { id: string; label: string; example: string; env: string };
export type LLMSettings = { model: string; base_url: string; api_key_set: boolean; temperature: number | null; max_tokens: number };
export type JudgeSettings = { model: string; base_url: string; api_key_set: boolean; enabled: boolean; min_confidence: number };
export type ConnectorField = {
  name: string;
  label: string;
  type: "text" | "url" | "password" | "checkbox";
  required?: boolean;
  default?: any;
  help?: string;
};
export type Requirement = { id: number; section: string; title: string; level: string; automated: boolean; verify: string };

// ---- agent team ----
export type EmployeeId =
  | "manager" | "auditor" | "rank_analyst" | "onpage" | "strategist" | "writer" | "compliance"
  | "researcher" | "link_builder" | "tech_seo" | "engineer";
export type Actor = EmployeeId | "human";

export type Employee = {
  id: EmployeeId;
  name: string;
  title: string;
  reports_to: Actor;
  kind: "llm" | "system";
  summary: string;
  responsibilities: string[];
  can_assign_to: EmployeeId[];
  kpis: string[];
};

export type TeamMemberStatus = "working" | "blocked" | "idle";
export type TaskCounts = { todo: number; in_progress: number; blocked: number; done: number; failed: number };

export type TeamMember = Employee & {
  status: TeamMemberStatus;
  current_task: { id: number; title: string } | null;
  counts: TaskCounts;
  memories: number;
};

export type TeamResponse = { employees: TeamMember[]; team_memories: number };

export type TaskStatus = "todo" | "in_progress" | "blocked" | "done" | "failed" | "cancelled";
export type TaskKind = "plan" | "wrap_up" | "audit" | "custom";
export type TaskPriority = 1 | 2 | 3 | 4;

export type TaskComment = {
  id: number;
  author: Actor;
  body: string;
  kind: "comment" | "question" | "answer";
  created_at: string;
};

export type RankOpportunity = {
  url: string;
  query: string;
  position: number | null;
  impressions: number;
  kind: string;
  recommendation: string;
};

export type ContentDraft = {
  title: string;
  meta_description: string;
  slug: string;
  html_body: string;
  facts_to_verify: string[];
};

export type TaskOutput = {
  summary: string;
  /** Markdown. */
  details?: string;
  outcome?: "done" | "blocked";
  learnings?: string[];
  team_notes?: string[];
  fixes?: { proposed: number; applied: number; held_back: number };
  created_tasks?: number[];
  insights?: { summary: string; opportunities: RankOpportunity[]; index_issues: string[] } | null;
  strategy?: Strategy | null;
  draft?: ContentDraft | null;
  actions?: string[];
  next_focus?: string;
  expected_impact?: string;
  audit_id?: number;
};

export type Task = {
  id: number;
  site_id: number;
  run_id: number | null;
  parent_id: number | null;
  depth: number;
  kind: TaskKind;
  title: string;
  description: string;
  assignee: EmployeeId;
  created_by: Actor;
  status: TaskStatus;
  /** 1 urgent … 4 low */
  priority: TaskPriority;
  input: Record<string, any>;
  output: TaskOutput | null;
  usage: Usage | null;
  error: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  comments?: TaskComment[];
};

export type ActivityVerb = "created_task" | "started" | "completed" | "blocked" | "failed" | "commented" | "proposed_fixes" | "reviewed";

export type Activity = {
  id: number;
  actor: Actor;
  verb: ActivityVerb | (string & {});
  message: string;
  task_id: number | null;
  created_at: string;
};

export type MemoryScope = EmployeeId | "team";

export type Memory = {
  id: string;
  text: string;
  employee: MemoryScope;
  kind: "learning" | "note" | "owner_note" | (string & {});
  metadata: Record<string, any>;
  score: number | null;
  created_at: string | null;
  updated_at: string | null;
};

export type KnowledgeKind = "page" | "finding" | "query";
export type KnowledgeHit = { kind: KnowledgeKind; url: string; title: string; text: string; score: number };

export type ReportKind = "standup" | "weekly" | "cycle";
export type Report = { id: number; kind: ReportKind; author: EmployeeId; title: string; content: string; created_at: string };

export type TaskFilters = { status?: TaskStatus[]; assignee?: EmployeeId; run_id?: number };
export type CreateTaskBody = { assignee: EmployeeId; title: string; description?: string; priority?: TaskPriority };
export type TaskPatch = { assignee?: EmployeeId; priority?: TaskPriority; status?: "todo" | "cancelled" | "done" };

// ---- request / response shapes ----
export type AuthCheck = { ok: true; environment: string };
export type CreateSiteBody = { url: string; name?: string; autopilot?: AutopilotMode; start_audit?: boolean };
export type CreateSiteResponse = { site: Site; job_id: number | null; audit_blocked?: string | null };

// ── accounts & billing ───────────────────────────────────────────────────────
export type Me = {
  user: { id: number; email: string; name: string; role: "owner" | "member"; email_verified: boolean; created_at: string } | null;
  account: { id: number; name: string; kind: "customer" | "operator"; credits: number; metered: boolean };
  is_superuser: boolean;
  via: "session" | "api_key";
  require_verification: boolean;
  billing_enabled: boolean;
};
export type SignupBody = { email: string; password: string; name?: string; company?: string; accept_terms: boolean };
export type Pack = { id: string; name: string; credits: number; price_cents: number; note: string };
export type PriceRow = { item: string; unit: string; credits: number };
export type PacksInfo = { currency: string; enabled: boolean; signup_credits: number; packs: Pack[]; prices: PriceRow[] };
export type LedgerEntry = { id: number; at: string; amount: number; balance: number; reason: string; note: string; site_id: number | null; site: string | null };
export type Purchase = { id: number; pack_id: string; credits: number; amount_cents: number; currency: string; status: "pending" | "paid" | "expired" | "failed" | "refunded"; refunded_cents: number; created_at: string; paid_at: string | null };
export type BillingOverview = PacksInfo & {
  credits: number;
  metered: boolean;
  purchases: Purchase[];
  ledger: LedgerEntry[];
  spend: { days: number; by_reason: Record<string, number> };
};
export type AccountNotify = {
  email_members: boolean; extra_emails: string[]; events: string[]; all_events: string[];
  slack_webhook_set: boolean; notify_webhook_set: boolean; email_available: boolean;
};
export type AccountNotifyUpdate = Partial<{ email_members: boolean; extra_emails: string[]; events: string[]; slack_webhook_url: string; notify_webhook_url: string }>;
export type Member = { id: number; email: string; name: string; role: "owner" | "member"; email_verified: boolean; last_login_at: string | null; created_at: string };
export type PendingInvite = { id: number; email: string; role: string; created_at: string; expires_at: string };
export type WorkspaceMembers = { members: Member[]; invites: PendingInvite[] };
export type ApiKeyInfo = { id: number; name: string; prefix: string; created_at: string; last_used_at: string | null; created_by?: string | null };
export type AdminAccount = { id: number; name: string; kind: string; status: string; credits: number; owner: string | null; sites: number; created_at: string };
export type SitePatch = Partial<{
  name: string;
  profile: Partial<SiteProfile>;
  autopilot: AutopilotMode;
  audit_every_hours: number;
  cycle_every_hours: number;
  auto_publish_content: boolean;
  obey_robots: boolean;
  max_pages: number | null;
}>;
export type TestResult = { ok: boolean; details?: unknown; error?: string };
export type JobRef = { job_id: number };
export type ChatResponse = { reply: string; transcript: ChatEntry[]; proposals: Fix[]; created_tasks?: number[] };
export type SettingsResponse = { llm: LLMSettings; judge: JudgeSettings; providers: Provider[] };
export type SettingsUpdate = {
  llm?: { model: string; api_key?: string | null; base_url: string; temperature: number | null; max_tokens: number };
  judge?: { model: string; api_key?: string | null; base_url: string; enabled: boolean; min_confidence: number };
};
export type LLMTestResult = { ok: boolean; message: string; latency_ms: number };

// ---------------------------------------------------------------------------
// Integrations, usage, capabilities, rank tracking
// ---------------------------------------------------------------------------
export type SerpProvider = "" | "serper" | "serpapi" | "brave";
export type NotifyEvent = "task_blocked" | "cycle_finished" | "rollback" | "job_failed" | "budget_reached" | "agent_message";

export type UsageSummary = {
  today: number;
  budget: number;
  last_days: number;
  per_day: { date: string; tokens: number }[];
  by_actor: { actor: string; input_tokens: number; output_tokens: number; requests: number }[];
};

export type IntegrationsSettings = {
  serp_provider: SerpProvider;
  serp_country: string;
  serp_language: string;
  public_url: string;
  smtp_host: string;
  smtp_port: number;
  smtp_user: string;
  smtp_from: string;
  notify_email: string;
  notify_events: NotifyEvent[];
  llm_daily_token_budget: number;
  code_execution_enabled: boolean;
  serp_api_key_set: boolean;
  openpagerank_api_key_set: boolean;
  pagespeed_api_key_set: boolean;
  indexnow_key_set: boolean;
  slack_webhook_url_set: boolean;
  notify_webhook_url_set: boolean;
  smtp_password_set: boolean;
  events: NotifyEvent[];
  usage: UsageSummary;
};

/** Partial update; for secrets: omit = keep, "" = clear. */
export type IntegrationsUpdate = Partial<{
  serp_provider: SerpProvider;
  serp_api_key: string;
  serp_country: string;
  serp_language: string;
  openpagerank_api_key: string;
  pagespeed_api_key: string;
  indexnow_key: string;
  public_url: string;
  slack_webhook_url: string;
  notify_webhook_url: string;
  smtp_host: string;
  smtp_port: number;
  smtp_user: string;
  smtp_password: string;
  smtp_from: string;
  notify_email: string;
  notify_events: NotifyEvent[];
  llm_daily_token_budget: number;
  code_execution_enabled: boolean;
}>;

export type IntegrationTarget = "serp" | "openpagerank" | "pagespeed" | "notify";

export type Capabilities = {
  serp: boolean;
  serp_provider: SerpProvider | null;
  domain_authority: boolean;
  pagespeed_key: boolean;
  indexnow: boolean;
  notifications: boolean;
  code_edits: boolean;
  code_execution: boolean;
  ripgrep: boolean;
  git: boolean;
  budget: number;
};

export type RankPoint = { at: string; position: number | null };
export type Competitor = { position: number; domain: string; url: string; title: string };
export type TrackedKeyword = {
  id: number;
  keyword: string;
  country: string;
  target_url: string | null;
  added_by: string;
  created_at: string;
  position: number | null;
  url: string | null;
  source: string | null;
  checked_at: string | null;
  change: number | null;
  best: number | null;
  competitors: Competitor[];
  trend: RankPoint[];
};
export type KeywordHistoryPoint = RankPoint & { url: string | null; source: string; competitors: Competitor[] };
