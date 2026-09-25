import { useMemo } from "react";
import { useRoster } from "@/lib/hooks";
import type { Actor, Employee, EmployeeId, TaskPriority, TaskStatus } from "@/lib/types";

export const EMPLOYEE_IDS: EmployeeId[] = ["manager", "auditor", "rank_analyst", "researcher", "onpage", "strategist", "writer", "link_builder", "tech_seo", "engineer", "compliance"];
/** Employees a task can be assigned to (Jev only verifies changes). */
export const ASSIGNABLE_IDS: EmployeeId[] = EMPLOYEE_IDS.filter((id) => id !== "compliance");

/** Visual identity shared by avatars and the office characters. */
export type Persona = {
  /** Two gradient stops (CSS colours). */
  from: string;
  to: string;
  /** Tailwind classes for tinted text. */
  text: string;
  skin: string;
  hair: string;
  hairStyle: "bun" | "short" | "long" | "curly" | "buzz" | "bob" | "robot";
  shirt: string;
  accessory?: "glasses" | "headset" | "tie" | "beret" | "cap" | "hoodie" | "earring";
};

export const PERSONAS: Record<Actor, Persona> = {
  manager: { from: "#6366f1", to: "#a855f7", text: "text-indigo-600 dark:text-indigo-300", skin: "#f1c7a5", hair: "#2b2118", hairStyle: "bun", shirt: "#6366f1", accessory: "headset" },
  auditor: { from: "#0ea5e9", to: "#2563eb", text: "text-sky-600 dark:text-sky-300", skin: "#c68c65", hair: "#1c1917", hairStyle: "short", shirt: "#0284c7", accessory: "glasses" },
  rank_analyst: { from: "#f59e0b", to: "#ea580c", text: "text-amber-600 dark:text-amber-300", skin: "#8d5a3b", hair: "#0c0a09", hairStyle: "buzz", shirt: "#d97706", accessory: "tie" },
  onpage: { from: "#10b981", to: "#0d9488", text: "text-emerald-600 dark:text-emerald-300", skin: "#f5d0b5", hair: "#a16207", hairStyle: "long", shirt: "#059669" },
  strategist: { from: "#f97316", to: "#e11d48", text: "text-orange-600 dark:text-orange-300", skin: "#b57852", hair: "#292524", hairStyle: "curly", shirt: "#ea580c", accessory: "glasses" },
  writer: { from: "#ec4899", to: "#8b5cf6", text: "text-pink-600 dark:text-pink-300", skin: "#f3c9a8", hair: "#7c2d12", hairStyle: "bob", shirt: "#db2777", accessory: "beret" },
  compliance: { from: "#14b8a6", to: "#0891b2", text: "text-teal-600 dark:text-teal-300", skin: "#cbd5e1", hair: "#64748b", hairStyle: "robot", shirt: "#0f766e" },
  researcher: { from: "#8b5cf6", to: "#6d28d9", text: "text-violet-600 dark:text-violet-300", skin: "#e0ac85", hair: "#1f1a17", hairStyle: "long", shirt: "#7c3aed", accessory: "earring" },
  link_builder: { from: "#84cc16", to: "#16a34a", text: "text-lime-700 dark:text-lime-300", skin: "#a8704a", hair: "#3b2a20", hairStyle: "short", shirt: "#65a30d", accessory: "cap" },
  tech_seo: { from: "#06b6d4", to: "#3b82f6", text: "text-cyan-600 dark:text-cyan-300", skin: "#f0c4a0", hair: "#b45309", hairStyle: "bob", shirt: "#0891b2", accessory: "glasses" },
  engineer: { from: "#f43f5e", to: "#f97316", text: "text-rose-600 dark:text-rose-300", skin: "#7b4a31", hair: "#0c0a09", hairStyle: "curly", shirt: "#334155", accessory: "hoodie" },
  human: { from: "#71717a", to: "#3f3f46", text: "text-foreground", skin: "#e8b995", hair: "#3f3f46", hairStyle: "short", shirt: "#52525b" },
};

export const persona = (actor: Actor | string): Persona => PERSONAS[actor as Actor] ?? PERSONAS.human;
export const gradientOf = (actor: Actor | string) => {
  const p = persona(actor);
  return `linear-gradient(135deg, ${p.from}, ${p.to})`;
};

const STATIC: Record<EmployeeId, Employee> = {
  manager: { id: "manager", name: "Maya", title: "SEO Manager", reports_to: "human", kind: "llm", summary: "Plans each optimisation cycle, assigns and reviews the team's work and reports to you.", responsibilities: ["Plan optimisation cycles", "Assign tasks", "Review work", "Write reports"], can_assign_to: ["rank_analyst", "researcher", "onpage", "strategist", "writer", "link_builder", "tech_seo", "engineer", "auditor"], kpis: [] },
  auditor: { id: "auditor", name: "Theo", title: "Technical SEO Auditor", reports_to: "manager", kind: "system", summary: "Crawls the site and runs the technical SEO and AdSense audit.", responsibilities: ["Crawl the site", "Run the audit", "Refresh site knowledge"], can_assign_to: [], kpis: [] },
  rank_analyst: { id: "rank_analyst", name: "Ravi", title: "Rank Analyst", reports_to: "manager", kind: "llm", summary: "Mines Search Console for ranking opportunities and indexing problems.", responsibilities: ["Striking-distance queries", "Indexing issues", "Quick ranking wins"], can_assign_to: ["onpage"], kpis: [] },
  onpage: { id: "onpage", name: "Lena", title: "On-page Optimizer", reports_to: "manager", kind: "llm", summary: "Improves titles, meta descriptions, structured data and alt text.", responsibilities: ["Titles & descriptions", "Structured data", "Alt text"], can_assign_to: [], kpis: [] },
  strategist: { id: "strategist", name: "Omar", title: "Content Strategist", reports_to: "manager", kind: "llm", summary: "Builds the content strategy and briefs the writer.", responsibilities: ["Content plan", "Policy risks", "Brief the writer"], can_assign_to: ["writer"], kpis: [] },
  writer: { id: "writer", name: "Iris", title: "Content Writer", reports_to: "strategist", kind: "llm", summary: "Drafts and rewrites articles from briefs.", responsibilities: ["Draft articles", "Rewrite thin content", "Flag facts to verify"], can_assign_to: [], kpis: [] },
  researcher: { id: "researcher", name: "Zara", title: "Market Researcher", reports_to: "manager", kind: "llm", summary: "Finds real search demand, analyses who ranks and why, and uncovers content gaps.", responsibilities: ["Keyword research", "Live search results", "Competitor gaps", "Rank tracking"], can_assign_to: ["strategist", "writer"], kpis: [] },
  link_builder: { id: "link_builder", name: "Kai", title: "Link Builder", reports_to: "manager", kind: "llm", summary: "Strengthens internal linking and finds genuine backlink opportunities.", responsibilities: ["Internal links", "Orphan pages", "Link prospects", "Outreach drafts"], can_assign_to: ["engineer"], kpis: [] },
  tech_seo: { id: "tech_seo", name: "Nora", title: "Technical SEO Engineer", reports_to: "manager", kind: "llm", summary: "Keeps the site fast, crawlable and indexed.", responsibilities: ["Core Web Vitals", "Indexing", "Canonicals & schema"], can_assign_to: ["engineer"], kpis: [] },
  engineer: { id: "engineer", name: "Ezra", title: "Web Engineer", reports_to: "manager", kind: "llm", summary: "Edits the site's source code in its repository and ships changes as reviewed pull requests.", responsibilities: ["Framework metadata & templates", "Sitemaps & redirects", "Performance fixes", "Pull requests"], can_assign_to: [], kpis: [] },
  compliance: { id: "compliance", name: "Jev", title: "Compliance Officer", reports_to: "manager", kind: "system", summary: "TypeSafe Jev verifies every proposed change before it can be applied.", responsibilities: ["Verify changes", "Hold back unsafe edits"], can_assign_to: [], kpis: [] },
};

export const HUMAN = { id: "human" as const, name: "You", title: "Site owner" };

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return parts.length === 1 ? parts[0].slice(0, 2).toUpperCase() : (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export type Directory = {
  list: Employee[];
  assignable: Employee[];
  get: (id: EmployeeId | string) => Employee;
  name: (actor: Actor | string) => string;
  title: (actor: Actor | string) => string;
};

function build(roster?: Employee[]): Directory {
  const byId = new Map<string, Employee>(EMPLOYEE_IDS.map((id) => [id, STATIC[id]]));
  for (const e of roster ?? []) byId.set(e.id, { ...STATIC[e.id], ...e });
  const get = (id: string) => byId.get(id) ?? { ...STATIC.manager, id: id as EmployeeId, name: id, title: "" };
  const list = EMPLOYEE_IDS.map((id) => get(id));
  return {
    list,
    assignable: list.filter((e) => ASSIGNABLE_IDS.includes(e.id)),
    get,
    name: (a) => (a === "human" ? HUMAN.name : get(a).name),
    title: (a) => (a === "human" ? HUMAN.title : get(a).title),
  };
}

const staticDirectory = build();

/** Employee directory backed by `GET /team/roster`, with a static fallback. */
export function useEmployees(): Directory {
  const roster = useRoster();
  return useMemo(() => (roster.data ? build(roster.data) : staticDirectory), [roster.data]);
}

export const PRIORITIES: { value: TaskPriority; label: string; tone: "danger" | "warning" | "neutral" | "info" }[] = [
  { value: 1, label: "Urgent", tone: "danger" },
  { value: 2, label: "High", tone: "warning" },
  { value: 3, label: "Normal", tone: "neutral" },
  { value: 4, label: "Low", tone: "info" },
];
export const priorityMeta = (p: number) => PRIORITIES.find((x) => x.value === p) ?? PRIORITIES[2];

export const TASK_STATUS: Record<TaskStatus, { label: string; tone: "neutral" | "brand" | "warning" | "success" | "danger" }> = {
  todo: { label: "To do", tone: "neutral" },
  in_progress: { label: "In progress", tone: "brand" },
  blocked: { label: "Waiting on you", tone: "warning" },
  done: { label: "Done", tone: "success" },
  failed: { label: "Failed", tone: "danger" },
  cancelled: { label: "Cancelled", tone: "neutral" },
};
export const TASK_KIND_LABELS: Record<string, string> = { plan: "Plan", wrap_up: "Wrap-up", audit: "Audit" };
