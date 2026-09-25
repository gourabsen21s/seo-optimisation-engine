import { ChevronRight } from "lucide-react";
import { EmployeeAvatar } from "@/features/team/EmployeeAvatar";
import { EMPLOYEE_IDS, useEmployees } from "@/features/team/employees";
import type { Activity, EmployeeId } from "@/lib/types";
import { cn, timeAgo } from "@/lib/utils";

const isEmployee = (a: string): a is EmployeeId => (EMPLOYEE_IDS as string[]).includes(a);

/** Live activity list for the office side panel: hovering an entry spotlights that employee in the scene. */
export function OfficeActivity({ items, onOpenTask, onHover }: { items: Activity[]; onOpenTask: (id: number) => void; onHover: (id: EmployeeId | null) => void }) {
  const dir = useEmployees();
  return (
    <ol className="grid gap-0.5" onMouseLeave={() => onHover(null)}>
      {items.map((a, i) => {
        const name = dir.name(a.actor);
        const msg = a.message.replace(new RegExp(`^${name}\\s*`), "");
        const clickable = a.task_id != null;
        const Row = clickable ? "button" : "div";
        return (
          <li key={a.id} className="animate-in fade-in slide-in-from-left-1" style={{ animationDelay: `${Math.min(i, 10) * 25}ms` }}>
            <Row
              {...(clickable ? { type: "button" as const, onClick: () => onOpenTask(a.task_id as number) } : {})}
              onMouseEnter={() => onHover(isEmployee(a.actor) ? a.actor : null)}
              onFocus={() => onHover(isEmployee(a.actor) ? a.actor : null)}
              onBlur={() => onHover(null)}
              className={cn(
                "group flex w-full gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none",
                clickable && "cursor-pointer",
              )}
            >
              <EmployeeAvatar actor={a.actor} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="line-clamp-2 text-sm leading-snug">
                  <span className="font-medium">{name}</span> <span className="text-muted-foreground">{msg}</span>
                </p>
                <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                  <span>{timeAgo(a.created_at)}</span>
                  {clickable && <span className="ml-auto flex items-center font-medium text-foreground/70 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">Open task <ChevronRight className="size-3" /></span>}
                </div>
              </div>
            </Row>
          </li>
        );
      })}
    </ol>
  );
}
