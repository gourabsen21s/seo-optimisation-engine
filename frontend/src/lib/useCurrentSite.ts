import { useMatch } from "react-router-dom";

/** Current site id + section from the URL; usable anywhere (incl. layouts above the site routes). */
export function useCurrentSite(): { siteId: number | null; section: string | null } {
  const m = useMatch("/sites/:siteId/*");
  const raw = m?.params.siteId;
  const siteId = raw && /^\d+$/.test(raw) ? Number(raw) : null;
  const section = m?.params["*"]?.split("/")[0] || null;
  return { siteId, section };
}
