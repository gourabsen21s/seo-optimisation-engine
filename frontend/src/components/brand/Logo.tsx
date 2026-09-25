import { BRAND } from "@/config/brand";
import { cn } from "@/lib/utils";

/** Rankcrew mark: three rising bars (the crew). Inherits color from the container. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <span className={cn("flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground", className)}>
      <svg viewBox="0 0 32 32" className="size-4.5" fill="currentColor" aria-hidden>
        <rect x="5" y="17" width="5.5" height="10" rx="2" opacity="0.55" />
        <rect x="13.25" y="11" width="5.5" height="16" rx="2" opacity="0.8" />
        <rect x="21.5" y="5" width="5.5" height="22" rx="2" />
      </svg>
    </span>
  );
}

export function Logo({ className, showTagline = false }: { className?: string; showTagline?: boolean }) {
  return (
    <span className={cn("flex items-center gap-2", className)}>
      <LogoMark />
      <span className="grid text-left text-sm leading-tight">
        <span className="truncate font-medium">{BRAND.name}</span>
        {showTagline && <span className="truncate text-xs text-muted-foreground">{BRAND.tagline}</span>}
      </span>
    </span>
  );
}
