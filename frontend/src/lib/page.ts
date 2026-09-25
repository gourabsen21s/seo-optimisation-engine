import { createContext, useContext, useEffect } from "react";

export type PageMeta = { title: string; subtitle?: string };
export const PageMetaContext = createContext<(meta: PageMeta) => void>(() => {});

/** Sets the top-bar title and document title for the current page. */
export function usePageTitle(title: string, subtitle?: string) {
  const set = useContext(PageMetaContext);
  useEffect(() => {
    set({ title, subtitle });
    document.title = title ? `${title} · Rankcrew` : "Rankcrew";
  }, [set, title, subtitle]);
}
