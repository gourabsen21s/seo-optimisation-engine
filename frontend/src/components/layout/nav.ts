import {
  Bot, Brain, Building2, ClipboardCheck, FileSearch, FileText, KanbanSquare, LayoutDashboard, LineChart, ListChecks, MessagesSquare, Newspaper, Settings2, Sparkles, Wrench,
  type LucideIcon,
} from "lucide-react";

export type NavItem = { section: string; label: string; icon: LucideIcon; badge?: "open_tasks" | "waiting" | "fixes" | "findings" | "live" };
export type NavGroup = { label: string; items: NavItem[] };

/** Site workspace navigation (routes are /sites/:id/<section>). */
export const SITE_NAV: NavGroup[] = [
  {
    label: "Workspace",
    items: [
      { section: "overview", label: "Overview", icon: LayoutDashboard },
      { section: "office", label: "Office", icon: Building2, badge: "live" },
      { section: "chat", label: "Chat with Maya", icon: MessagesSquare },
      { section: "board", label: "Task board", icon: KanbanSquare, badge: "open_tasks" },
      { section: "cycles", label: "Cycles & strategy", icon: Sparkles },
    ],
  },
  {
    label: "Audit",
    items: [
      { section: "rankings", label: "Rankings", icon: LineChart },
      { section: "findings", label: "Findings", icon: FileSearch, badge: "findings" },
      { section: "checklist", label: "AdSense checklist", icon: ListChecks },
      { section: "pages", label: "Pages", icon: FileText },
      { section: "content", label: "Content quality", icon: ClipboardCheck },
    ],
  },
  {
    label: "Improve",
    items: [
      { section: "fixes", label: "Fixes", icon: Wrench, badge: "fixes" },
      { section: "memory", label: "Team memory", icon: Brain },
      { section: "reports", label: "Reports", icon: Newspaper },
    ],
  },
  {
    label: "Configure",
    items: [{ section: "settings", label: "Site settings", icon: Settings2 }],
  },
];

export const ALL_SECTIONS = SITE_NAV.flatMap((g) => g.items);
export const sectionMeta = (section: string) => ALL_SECTIONS.find((i) => i.section === section) ?? { section, label: "Overview", icon: LayoutDashboard };
export const TEAM_ICON = Bot;
