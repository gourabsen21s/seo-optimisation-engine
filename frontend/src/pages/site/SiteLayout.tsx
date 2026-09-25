import { Navigate, Outlet, useOutletContext, useParams } from "react-router-dom";
import { Globe } from "lucide-react";
import { EmptyState } from "@/components/common/blocks";
import { Skeleton } from "@/components/ui/skeleton";
import { TaskSheet } from "@/features/team/TaskSheet";
import { ApiError } from "@/lib/api";
import { useSite } from "@/lib/hooks";
import type { Site } from "@/lib/types";

export type SiteCtx = { site: Site; siteId: number };
export const useSiteCtx = () => useOutletContext<SiteCtx>();

export function SiteLayout() {
  const { siteId: raw } = useParams();
  const siteId = Number(raw);
  const site = useSite(siteId);
  if (!Number.isFinite(siteId)) return <Navigate to="/sites" replace />;
  if (site.isLoading) {
    return (
      <div className="grid gap-4">
        <Skeleton className="h-10 w-72" />
        <div className="grid gap-4 md:grid-cols-3"><Skeleton className="h-44" /><Skeleton className="h-44" /><Skeleton className="h-44" /></div>
        <Skeleton className="h-72" />
      </div>
    );
  }
  if (!site.data) {
    const notFound = site.error instanceof ApiError && site.error.status === 404;
    return <EmptyState icon={<Globe />} title={notFound ? "Website not found" : "Could not load website"} description={notFound ? "It may have been deleted." : String(site.error ?? "")} />;
  }
  return (
    <>
      <Outlet context={{ site: site.data, siteId } satisfies SiteCtx} />
      <TaskSheet siteId={siteId} />
    </>
  );
}
