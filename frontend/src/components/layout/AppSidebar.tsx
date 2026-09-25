import { Link, useLocation, useNavigate } from "react-router-dom";
import { BookOpen, Check, ChevronsUpDown, EllipsisVertical, Globe, LogOut, Plus, Settings } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { LogoMark } from "@/components/brand/Logo";
import { LiveDot } from "@/components/common/badges";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuShortcut, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarHeader, SidebarMenu, SidebarMenuBadge, SidebarMenuButton, SidebarMenuItem, SidebarRail, useSidebar,
} from "@/components/ui/sidebar";
import { BRAND } from "@/config/brand";
import { AddSiteDialog } from "@/features/sites/AddSiteDialog";
import { auth } from "@/lib/api";
import { useLatestAudit, useSite, useSites } from "@/lib/hooks";
import type { Site } from "@/lib/types";
import { useCurrentSite } from "@/lib/useCurrentSite";
import { cn, hostname } from "@/lib/utils";
import { SITE_NAV } from "./nav";

function SiteFavicon({ site, className }: { site?: Site; className?: string }) {
  return (
    <span className={cn("flex aspect-square size-8 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground", className)}>
      {site ? <span className="text-xs font-semibold uppercase">{hostname(site.url).replace(/^www\./, "").slice(0, 2)}</span> : <Globe className="size-4" />}
    </span>
  );
}

function SiteSwitcher({ siteId }: { siteId: number | null }) {
  const sites = useSites();
  const navigate = useNavigate();
  const { isMobile } = useSidebar();
  const current = sites.data?.find((s) => s.id === siteId);
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton size="lg" className="data-[state=open]:bg-sidebar-accent">
              {current ? <SiteFavicon site={current} /> : <LogoMark />}
              <div className="grid min-w-0 flex-1 text-left leading-tight">
                <span className="truncate text-sm font-medium">{current ? current.name : BRAND.name}</span>
                <span className="truncate text-xs text-muted-foreground">{current ? hostname(current.url) : BRAND.tagline}</span>
              </div>
              <ChevronsUpDown className="ml-auto size-4 text-muted-foreground" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-(--radix-dropdown-menu-trigger-width) min-w-64" side={isMobile ? "bottom" : "right"} align="start" sideOffset={6}>
            <DropdownMenuLabel className="text-xs text-muted-foreground">Websites</DropdownMenuLabel>
            {(sites.data ?? []).map((s, i) => (
              <DropdownMenuItem key={s.id} onClick={() => navigate(`/sites/${s.id}/overview`)} className="gap-2 p-2">
                <SiteFavicon site={s} className="size-6 rounded-md border bg-background text-foreground [&_span]:text-[10px]" />
                <span className="min-w-0 flex-1 truncate">{s.name}</span>
                {s.latest_scores?.overall != null && <span className="text-xs text-muted-foreground tabular-nums">{Math.round(s.latest_scores.overall)}</span>}
                {s.id === siteId && <Check className="size-4" />}
                {i < 9 && <DropdownMenuShortcut>⌘{i + 1}</DropdownMenuShortcut>}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => navigate("/")} className="gap-2 p-2"><Globe className="size-4" /> All websites</DropdownMenuItem>
            <AddSiteDialog trigger={<DropdownMenuItem onSelect={(e) => e.preventDefault()} className="gap-2 p-2"><Plus className="size-4" /> Add website</DropdownMenuItem>} />
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

function SiteNav({ siteId }: { siteId: number }) {
  const { pathname } = useLocation();
  const site = useSite(siteId);
  const latest = useLatestAudit(siteId);
  const s = site.data;
  const findings = latest.report?.findings.filter((f) => f.severity === "critical" || f.severity === "high").length ?? 0;
  const badges: Record<string, React.ReactNode> = {
    open_tasks: s?.counts.waiting_on_you ? <span className="text-amber-600 dark:text-amber-400">{s.counts.waiting_on_you}</span> : s?.counts.open_tasks || null,
    fixes: s?.counts.proposed_fixes || null,
    findings: findings || null,
    live: <LiveDot />,
  };
  return (
    <>
      {SITE_NAV.map((group) => (
        <SidebarGroup key={group.label}>
          <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {group.items.map((item) => (
                <SidebarMenuItem key={item.section}>
                  <SidebarMenuButton asChild isActive={pathname.startsWith(`/sites/${siteId}/${item.section}`)} tooltip={item.label}>
                    <Link to={`/sites/${siteId}/${item.section}`}>
                      <item.icon />
                      <span>{item.label}</span>
                    </Link>
                  </SidebarMenuButton>
                  {item.badge && badges[item.badge] != null && <SidebarMenuBadge>{badges[item.badge]}</SidebarMenuBadge>}
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      ))}
    </>
  );
}

function HomeNav() {
  const sites = useSites();
  return (
    <SidebarGroup>
      <SidebarGroupLabel>Websites</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {(sites.data ?? []).map((s) => (
            <SidebarMenuItem key={s.id}>
              <SidebarMenuButton asChild tooltip={s.name}>
                <Link to={`/sites/${s.id}/overview`}>
                  <Globe />
                  <span>{s.name}</span>
                </Link>
              </SidebarMenuButton>
              {s.counts.waiting_on_you ? <SidebarMenuBadge className="text-amber-600">{s.counts.waiting_on_you}</SidebarMenuBadge> : null}
            </SidebarMenuItem>
          ))}
          <SidebarMenuItem>
            <AddSiteDialog trigger={<SidebarMenuButton className="text-muted-foreground"><Plus /> <span>Add website</span></SidebarMenuButton>} />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

function UserMenu() {
  const navigate = useNavigate();
  const { isMobile } = useSidebar();
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton size="lg" className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground">
              <Avatar className="size-8 rounded-lg">
                <AvatarFallback className="rounded-lg">OW</AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">Owner</span>
                <span className="truncate text-xs text-muted-foreground">API key session</span>
              </div>
              <EllipsisVertical className="ml-auto size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg" side={isMobile ? "bottom" : "right"} align="end" sideOffset={4}>
            <DropdownMenuLabel className="p-0 font-normal">
              <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                <Avatar className="size-8 rounded-lg"><AvatarFallback className="rounded-lg">OW</AvatarFallback></Avatar>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">Owner</span>
                  <span className="truncate text-xs text-muted-foreground">API key session</span>
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem onClick={() => navigate("/settings")}><Settings /> Workspace settings</DropdownMenuItem>
              <DropdownMenuItem onClick={() => window.open("/api/docs", "_blank")}><BookOpen /> API docs</DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => auth.logout()}><LogOut /> Log out</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

export function AppSidebar(props: React.ComponentProps<typeof Sidebar>) {
  const { pathname } = useLocation();
  const { siteId } = useCurrentSite();
  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <SiteSwitcher siteId={siteId} />
      </SidebarHeader>
      <SidebarContent className="scrollbar-thin">
        {siteId != null ? <SiteNav siteId={siteId} /> : <HomeNav />}
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild isActive={pathname === "/settings"} tooltip="Workspace settings">
              <Link to="/settings"><Settings /><span>Workspace settings</span></Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <UserMenu />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
