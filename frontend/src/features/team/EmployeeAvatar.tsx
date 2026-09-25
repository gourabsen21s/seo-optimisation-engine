import { Bot, User } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import type { Actor, TeamMemberStatus } from "@/lib/types";
import { gradientOf, initials, useEmployees } from "./employees";

const SIZES = { xs: "size-5", sm: "size-7", md: "size-9", lg: "size-12", xl: "size-16" };
const TEXT = { xs: "text-[9px]", sm: "text-[10px]", md: "text-xs", lg: "text-sm", xl: "text-lg" };
const STATUS_DOT = { working: "bg-emerald-500", blocked: "bg-amber-500", idle: "bg-zinc-400" };

export function EmployeeAvatar({ actor, size = "md", status, className, ring = true }: {
  actor: Actor | string;
  size?: keyof typeof SIZES;
  status?: TeamMemberStatus;
  className?: string;
  ring?: boolean;
}) {
  const dir = useEmployees();
  const name = dir.name(actor);
  const isHuman = actor === "human";
  const isSystem = !isHuman && dir.get(actor).kind === "system";
  return (
    <span className={cn("relative inline-flex shrink-0", className)} title={`${name}${isHuman ? "" : ` · ${dir.title(actor)}`}`}>
      <Avatar className={cn(SIZES[size], ring && "ring-2 ring-background shadow-xs")}>
        <AvatarFallback className={cn("font-semibold tracking-tight text-white", TEXT[size])} style={{ background: gradientOf(actor) }}>
          {isHuman ? <User className="size-[55%]" /> : actor === "compliance" ? <Bot className="size-[55%]" /> : size === "xs" ? name.charAt(0).toUpperCase() : initials(name)}
        </AvatarFallback>
      </Avatar>
      {status && (
        <span className={cn("absolute -right-0.5 -bottom-0.5 size-[30%] min-h-2 min-w-2 rounded-full ring-2 ring-background", STATUS_DOT[status], status === "working" && "animate-pulse")} />
      )}
      {isSystem && size !== "xs" && status == null && <span className="sr-only">system</span>}
    </span>
  );
}

export function EmployeeName({ actor, className }: { actor: Actor | string; className?: string }) {
  const dir = useEmployees();
  return <span className={cn("font-medium", className)}>{dir.name(actor)}</span>;
}
