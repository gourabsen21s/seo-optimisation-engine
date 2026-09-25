import { useRef } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { jobLabel } from "@/components/common/JobProgress";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { gsap, prefersReducedMotion, useGSAP } from "@/lib/gsap";
import { useSites } from "@/lib/hooks";
import { useCurrentSite } from "@/lib/useCurrentSite";
import { AppSidebar } from "./AppSidebar";
import { CommandMenu } from "./CommandMenu";
import { DayStrip } from "./DayStrip";
import { sectionMeta } from "./nav";
import { ThemeToggle } from "./ThemeToggle";

function Crumbs() {
  const { siteId, section } = useCurrentSite();
  const { pathname } = useLocation();
  const sites = useSites();
  const site = sites.data?.find((s) => s.id === siteId);
  const meta = section ? sectionMeta(section) : null;
  return (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem className="hidden sm:block"><BreadcrumbLink asChild><Link to="/sites">Websites</Link></BreadcrumbLink></BreadcrumbItem>
        {site && (
          <>
            <BreadcrumbSeparator className="hidden sm:block" />
            <BreadcrumbItem><BreadcrumbLink asChild><Link to={`/sites/${site.id}/overview`}>{site.name}</Link></BreadcrumbLink></BreadcrumbItem>
          </>
        )}
        {meta && (
          <>
            <BreadcrumbSeparator />
            <BreadcrumbItem><BreadcrumbPage>{meta.label}</BreadcrumbPage></BreadcrumbItem>
          </>
        )}
        {pathname === "/settings" && (
          <>
            <BreadcrumbSeparator />
            <BreadcrumbItem><BreadcrumbPage>Workspace settings</BreadcrumbPage></BreadcrumbItem>
          </>
        )}
      </BreadcrumbList>
    </Breadcrumb>
  );
}

function RunningJobs() {
  const sites = useSites();
  const running = (sites.data ?? []).filter((s) => s.active_job);
  if (!running.length) return null;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link to={`/sites/${running[0].id}/overview`} className="flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground">
          <Loader2 className="size-3.5 animate-spin" /> {running.length === 1 ? jobLabel(running[0].active_job?.type) : `${running.length} jobs`}
        </Link>
      </TooltipTrigger>
      <TooltipContent>{running.map((s) => `${s.name}: ${jobLabel(s.active_job?.type)}`).join(" · ")}</TooltipContent>
    </Tooltip>
  );
}

/** Subtle fade on route change. */
function PageTransition({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const { pathname } = useLocation();
  useGSAP(() => {
    if (!ref.current || prefersReducedMotion()) return;
    gsap.fromTo(ref.current, { autoAlpha: 0, y: 10 }, { autoAlpha: 1, y: 0, duration: 0.45, ease: "expo.out", clearProps: "transform,opacity,visibility" });
  }, { dependencies: [pathname] });
  return <div ref={ref} className="flex flex-1 flex-col">{children}</div>;
}

/** Layout from the shadcn dashboard-01 block: inset sidebar + site header. */
export function AppShell() {
  return (
    <SidebarProvider
      style={{ "--sidebar-width": "calc(var(--spacing) * 72)", "--header-height": "calc(var(--spacing) * 12)" } as React.CSSProperties}
    >
      <AppSidebar variant="inset" />
      <SidebarInset className="min-w-0">
        <header className="sticky top-0 z-20 flex h-(--header-height) shrink-0 items-center gap-2 rounded-t-xl border-b bg-background transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)">
          <div className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mx-2 data-[orientation=vertical]:h-4" />
            <Crumbs />
            <div className="ml-auto flex items-center gap-3">
              <DayStrip />
              <RunningJobs />
              <CommandMenu />
              <ThemeToggle />
            </div>
          </div>
        </header>
        <div className="@container/main flex min-w-0 flex-1 flex-col">
          <main className="flex min-w-0 flex-1 flex-col gap-4 p-4 md:gap-6 md:p-6 lg:px-6">
            <PageTransition>
              <Outlet />
            </PageTransition>
          </main>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
