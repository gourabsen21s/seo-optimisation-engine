import { CheckCircle2, CircleDashed, CircleX, Loader2, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { JobStatus, RequirementStatus, Severity } from "@/lib/types";
import { cn, SEVERITY_STYLES, STATUS_STYLES } from "@/lib/utils";

// shadcn data-table style: outline badge, muted text, only the icon/dot carries color.
const pill = "px-1.5 text-muted-foreground";

export function SeverityBadge({ severity, className }: { severity: Severity; className?: string }) {
  return (
    <Badge variant="outline" className={cn(pill, "capitalize", className)}>
      <span className={cn("size-1.5 rounded-full", SEVERITY_STYLES[severity].dot)} />
      {severity}
    </Badge>
  );
}

const REQ_ICON = { pass: CheckCircle2, warn: TriangleAlert, fail: CircleX, manual: CircleDashed };

export function RequirementStatusBadge({ status, className }: { status: RequirementStatus; className?: string }) {
  const Icon = REQ_ICON[status];
  return (
    <Badge variant="outline" className={cn(pill, className)}>
      <Icon className={STATUS_STYLES[status].text} />
      {STATUS_STYLES[status].label}
    </Badge>
  );
}

export function RequirementStatusIcon({ status, className }: { status: RequirementStatus; className?: string }) {
  const Icon = REQ_ICON[status];
  return <Icon className={cn("size-5 shrink-0", STATUS_STYLES[status].text, className)} aria-label={STATUS_STYLES[status].label} />;
}

export function JobStatusBadge({ status }: { status: JobStatus }) {
  const map = {
    queued: { cls: "text-muted-foreground", label: "Queued" },
    running: { cls: "text-foreground", label: "Running" },
    done: { cls: "text-emerald-600 dark:text-emerald-400", label: "Done" },
    failed: { cls: "text-red-600 dark:text-red-400", label: "Failed" },
  }[status];
  return (
    <Badge variant="outline" className={pill}>
      {status === "running" ? <Loader2 className="animate-spin" /> : <span className={cn("size-1.5 rounded-full bg-current", map.cls)} />}
      {map.label}
    </Badge>
  );
}

/** Generic tinted pill: success | warning | danger | info | neutral | brand. */
export function Pill({ tone = "neutral", children, className }: { tone?: "success" | "warning" | "danger" | "info" | "neutral" | "brand"; children: React.ReactNode; className?: string }) {
  const tones = {
    success: "[&>svg]:text-emerald-600 dark:[&>svg]:text-emerald-400",
    warning: "[&>svg]:text-amber-600 dark:[&>svg]:text-amber-400",
    danger: "[&>svg]:text-red-600 dark:[&>svg]:text-red-400",
    info: "[&>svg]:text-sky-600 dark:[&>svg]:text-sky-400",
    neutral: "",
    brand: "text-foreground",
  };
  return <Badge variant="outline" className={cn(pill, tones[tone], className)}>{children}</Badge>;
}

export function LiveDot({ className, tone = "bg-emerald-500" }: { className?: string; tone?: string }) {
  return (
    <span className={cn("relative inline-flex size-2", className)}>
      <span className={cn("absolute inset-0 animate-ping rounded-full opacity-60", tone)} />
      <span className={cn("relative size-2 rounded-full", tone)} />
    </span>
  );
}
