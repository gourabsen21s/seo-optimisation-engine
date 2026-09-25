import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { RequirementLevel, RequirementStatus, SectionId, Severity } from "./types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const SECTION_NAMES: Record<SectionId, string> = {
  A: "Account & Eligibility",
  B: "Legal & Trust Pages",
  C: "Technical Foundation",
  D: "Structured Data",
  E: "Navigation",
  F: "Content Standards",
  G: "UX & Ads",
  H: "Application & Post-Approval",
};

export const SECTIONS = Object.keys(SECTION_NAMES) as SectionId[];

export const SEVERITIES: Severity[] = ["critical", "high", "medium", "low", "info"];

export const SEVERITY_STYLES: Record<Severity, { badge: string; dot: string; fill: string }> = {
  critical: {
    badge: "bg-red-500/10 text-red-700 ring-red-500/25 dark:text-red-400",
    dot: "bg-red-500",
    fill: "#ef4444",
  },
  high: {
    badge: "bg-orange-500/10 text-orange-700 ring-orange-500/25 dark:text-orange-400",
    dot: "bg-orange-500",
    fill: "#f97316",
  },
  medium: {
    badge: "bg-amber-500/10 text-amber-700 ring-amber-500/25 dark:text-amber-400",
    dot: "bg-amber-500",
    fill: "#f59e0b",
  },
  low: {
    badge: "bg-sky-500/10 text-sky-700 ring-sky-500/25 dark:text-sky-400",
    dot: "bg-sky-500",
    fill: "#0ea5e9",
  },
  info: {
    badge: "bg-zinc-500/10 text-zinc-700 ring-zinc-500/25 dark:text-zinc-300",
    dot: "bg-zinc-400",
    fill: "#a1a1aa",
  },
};

export const STATUS_STYLES: Record<RequirementStatus, { badge: string; text: string; label: string }> = {
  pass: { badge: "bg-emerald-500/10 text-emerald-700 ring-emerald-500/25 dark:text-emerald-400", text: "text-emerald-600 dark:text-emerald-400", label: "Pass" },
  warn: { badge: "bg-amber-500/10 text-amber-700 ring-amber-500/25 dark:text-amber-400", text: "text-amber-600 dark:text-amber-400", label: "Warning" },
  fail: { badge: "bg-red-500/10 text-red-700 ring-red-500/25 dark:text-red-400", text: "text-red-600 dark:text-red-400", label: "Fail" },
  manual: { badge: "bg-zinc-500/10 text-zinc-700 ring-zinc-500/25 dark:text-zinc-300", text: "text-zinc-500 dark:text-zinc-400", label: "Manual" },
};

export const LEVEL_LABELS: Record<RequirementLevel, string> = {
  mandatory: "Mandatory",
  strongly_advised: "Strongly advised",
  recommended: "Recommended",
};

/** Colour for a 0–100 score. */
export function scoreColor(score: number | null | undefined): { text: string; stroke: string } {
  if (score == null) return { text: "text-muted-foreground", stroke: "var(--color-muted-foreground)" };
  if (score >= 85) return { text: "text-emerald-600 dark:text-emerald-400", stroke: "#10b981" };
  if (score >= 65) return { text: "text-amber-600 dark:text-amber-400", stroke: "#f59e0b" };
  return { text: "text-red-600 dark:text-red-400", stroke: "#ef4444" };
}

export function formatScore(score: number | null | undefined): string {
  return score == null ? "–" : String(Math.round(score));
}

const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "never";
  const d = parseDate(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const diff = (d.getTime() - Date.now()) / 1000;
  const abs = Math.abs(diff);
  if (abs < 45) return "just now";
  if (abs < 3600) return rtf.format(Math.round(diff / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), "hour");
  if (abs < 86400 * 30) return rtf.format(Math.round(diff / 86400), "day");
  return d.toLocaleDateString();
}

/** Backend timestamps may be naive (no TZ). Treat them as UTC. */
export function parseDate(iso: string): Date {
  const hasTz = /[zZ]$|[+-]\d\d:?\d\d$/.test(iso);
  return new Date(hasTz ? iso : `${iso}Z`);
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "–";
  const d = parseDate(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export function formatShortDate(iso: string): string {
  const d = parseDate(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function formatTime(iso: string): string {
  const d = parseDate(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function formatDuration(start: string | null, end: string | null): string {
  if (!start || !end) return "–";
  const ms = parseDate(end).getTime() - parseDate(start).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "–";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${s % 60}s`;
}

const nf = new Intl.NumberFormat();
export function formatNumber(n: number | null | undefined, digits = 0): string {
  if (n == null || Number.isNaN(n)) return "–";
  return digits ? n.toFixed(digits) : nf.format(Math.round(n));
}

export function compactNumber(n: number | null | undefined): string {
  if (n == null) return "–";
  return new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(n);
}

export function hostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function pathOf(url: string): string {
  try {
    const u = new URL(url);
    return (u.pathname + u.search) || "/";
  } catch {
    return url;
  }
}

export function splitList(value: string): string[] {
  return value
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function titleCase(s: string): string {
  return s.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function pluralize(n: number, word: string, plural = `${word}s`): string {
  return `${formatNumber(n)} ${n === 1 ? word : plural}`;
}
