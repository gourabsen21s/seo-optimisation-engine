import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Globe, Moon, Play, Search, Settings, Sparkles, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator, CommandShortcut } from "@/components/ui/command";
import { Kbd } from "@/components/ui/kbd";
import { useSites, useStartAudit, useStartCycle } from "@/lib/hooks";
import { useCurrentSite } from "@/lib/useCurrentSite";
import { SITE_NAV } from "./nav";

function SiteActions({ siteId, close }: { siteId: number; close: () => void }) {
  const audit = useStartAudit(siteId);
  const cycle = useStartCycle(siteId);
  return (
    <CommandGroup heading="Actions">
      <CommandItem onSelect={() => { cycle.mutate(true); close(); }}><Sparkles /> Run optimisation cycle</CommandItem>
      <CommandItem onSelect={() => { audit.mutate(); close(); }}><Play /> Run audit</CommandItem>
    </CommandGroup>
  );
}

/** ⌘K palette: jump anywhere, switch sites, run actions. */
export function CommandMenu() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { siteId } = useCurrentSite();
  const sites = useSites();
  const { resolvedTheme, setTheme } = useTheme();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
      if ((e.metaKey || e.ctrlKey) && /^[1-9]$/.test(e.key) && sites.data?.[Number(e.key) - 1]) {
        e.preventDefault();
        navigate(`/sites/${sites.data[Number(e.key) - 1].id}/overview`);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate, sites.data]);

  const go = (to: string) => { navigate(to); setOpen(false); };

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)} className="hidden h-8 w-60 justify-start gap-2 rounded-lg bg-muted/40 px-2.5 text-sm font-normal text-muted-foreground shadow-none md:flex">
        <Search className="size-4" /> Search or jump to…
        <Kbd className="ml-auto">⌘K</Kbd>
      </Button>
      <Button variant="ghost" size="icon" onClick={() => setOpen(true)} className="md:hidden" aria-label="Search"><Search /></Button>
      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="Type a command or search…" />
        <CommandList>
          <CommandEmpty>No results.</CommandEmpty>
          {siteId != null && (
            <>
              {SITE_NAV.map((g) => (
                <CommandGroup key={g.label} heading={g.label}>
                  {g.items.map((i) => (
                    <CommandItem key={i.section} onSelect={() => go(`/sites/${siteId}/${i.section}`)}><i.icon /> {i.label}</CommandItem>
                  ))}
                </CommandGroup>
              ))}
              <SiteActions siteId={siteId} close={() => setOpen(false)} />
              <CommandSeparator />
            </>
          )}
          <CommandGroup heading="Websites">
            {(sites.data ?? []).map((s, i) => (
              <CommandItem key={s.id} onSelect={() => go(`/sites/${s.id}/overview`)}><Globe /> {s.name}{i < 9 && <CommandShortcut>⌘{i + 1}</CommandShortcut>}</CommandItem>
            ))}
            <CommandItem onSelect={() => go("/sites")}><Globe /> All websites</CommandItem>
          </CommandGroup>
          <CommandGroup heading="Preferences">
            <CommandItem onSelect={() => { setTheme(resolvedTheme === "dark" ? "light" : "dark"); setOpen(false); }}>
              {resolvedTheme === "dark" ? <Sun /> : <Moon />} Switch to {resolvedTheme === "dark" ? "light" : "dark"} mode
            </CommandItem>
            <CommandItem onSelect={() => go("/settings")}><Settings /> Workspace settings</CommandItem>
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  );
}
