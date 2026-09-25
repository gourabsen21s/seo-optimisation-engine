import type { ReactNode } from "react";
import { ExternalLink as ExternalIcon } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { cn } from "@/lib/utils";
import { AnimatedNumber } from "./motion";

/** Page title row: title, description, optional actions (right). `icon` is accepted for API compatibility. */
export function PageHeader({ title, description, actions, className }: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-center justify-between gap-4", className)}>
      <div className="grid min-w-0 gap-1.5">
        <h1 className="rc-title text-3xl leading-tight font-semibold md:text-[2.1rem]">
          <span className="max-w-full truncate align-bottom">{title}</span>
        </h1>
        {description && <p className="max-w-prose text-sm text-muted-foreground text-pretty">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** Metric card following the shadcn dashboard-01 "section cards" pattern. */
export function StatCard({ icon, label, value, hint, tone = "default", suffix, className }: {
  icon: ReactNode;
  label: string;
  value: number | null | undefined;
  hint?: ReactNode;
  tone?: "default" | "danger" | "success" | "warning";
  suffix?: string;
  className?: string;
}) {
  const tones = {
    default: "text-muted-foreground",
    danger: "text-red-600 dark:text-red-400",
    success: "text-emerald-600 dark:text-emerald-400",
    warning: "text-amber-600 dark:text-amber-400",
  };
  return (
    <Card data-reveal className={cn("@container/card shadow-xs transition-[transform,box-shadow] duration-200 ease-out hover:-translate-y-0.5 hover:shadow-md", className)}>
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="font-display text-3xl font-semibold tabular-nums @[250px]/card:text-4xl">
          <AnimatedNumber value={value} suffix={suffix} />
        </CardTitle>
        <CardAction>
          <Badge variant="outline" className={cn("[&_svg]:size-3.5", tones[tone])}>{icon}</Badge>
        </CardAction>
      </CardHeader>
      {hint && <CardFooter className="text-sm text-muted-foreground"><span className="line-clamp-1">{hint}</span></CardFooter>}
    </Card>
  );
}

export function EmptyState({ icon, title, description, action, className }: {
  icon: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <Empty className={cn("border border-dashed", className)}>
      <EmptyHeader>
        <EmptyMedia variant="icon">{icon}</EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        {description && <EmptyDescription>{description}</EmptyDescription>}
      </EmptyHeader>
      {action && <EmptyContent>{action}</EmptyContent>}
    </Empty>
  );
}

export function Markdown({ children, className }: { children: string; className?: string }) {
  return (
    <div className={cn("prose-chat", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{ a: ({ node: _node, ...props }) => <a {...props} target="_blank" rel="noreferrer noopener" /> }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}

export function ExternalLink({ href, children, className }: { href: string; children?: ReactNode; className?: string }) {
  return (
    <a href={href} target="_blank" rel="noreferrer noopener" className={cn("inline-flex min-w-0 items-center gap-1 text-primary underline-offset-4 hover:underline", className)}>
      <span className="truncate">{children ?? href}</span>
      <ExternalIcon className="size-3 shrink-0 opacity-70" aria-hidden />
    </a>
  );
}

/** Unified-diff renderer with +/- colouring. */
export function DiffView({ diff, className, maxHeight = "20rem" }: { diff: string; className?: string; maxHeight?: string }) {
  const lines = diff.replace(/\n$/, "").split("\n");
  return (
    <pre className={cn("scrollbar-thin overflow-auto rounded-xl border bg-muted/40 py-2 font-mono text-xs leading-5", className)} style={{ maxHeight }}>
      {lines.map((line, i) => {
        const cls = line.startsWith("+++") || line.startsWith("---")
          ? "font-semibold text-muted-foreground"
          : line.startsWith("+")
            ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
            : line.startsWith("-")
              ? "bg-red-500/10 text-red-700 dark:text-red-400"
              : line.startsWith("@@") ? "text-sky-600 dark:text-sky-400" : "text-foreground/80";
        return <div key={i} className={cn("px-3 whitespace-pre", cls)}>{line || " "}</div>;
      })}
    </pre>
  );
}

export function CodeBlock({ children, className, maxHeight = "12rem" }: { children: string; className?: string; maxHeight?: string }) {
  return (
    <pre className={cn("scrollbar-thin overflow-auto rounded-lg border bg-muted/50 p-3 font-mono text-xs leading-5 break-all whitespace-pre-wrap", className)} style={{ maxHeight }}>
      {children}
    </pre>
  );
}

/** Small section heading used inside cards/sheets. */
export function SectionLabel({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase", className)}>{children}</div>;
}
