import { CheckCircle2, CircleDashed, Code2, GitPullRequest, ShieldAlert, TerminalSquare } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldContent, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Item, ItemContent, ItemDescription, ItemMedia, ItemTitle } from "@/components/ui/item";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { EmployeeAvatar } from "@/features/team/EmployeeAvatar";
import { useCapabilities, useUpdateIntegrations } from "@/lib/hooks";
import type { IntegrationsSettings } from "@/lib/types";

function Check({ ok, label, hint }: { ok: boolean; label: string; hint: string }) {
  return (
    <Item variant="outline" size="sm">
      <ItemMedia>{ok ? <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400" /> : <CircleDashed className="size-4 text-muted-foreground" />}</ItemMedia>
      <ItemContent>
        <ItemTitle>{label}</ItemTitle>
        <ItemDescription>{hint}</ItemDescription>
      </ItemContent>
    </Item>
  );
}

export function CodeTab({ data }: { data: IntegrationsSettings }) {
  const caps = useCapabilities();
  const save = useUpdateIntegrations();
  const c = caps.data;
  return (
    <div className="grid gap-6">
      <Card className="shadow-xs">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><EmployeeAvatar actor="engineer" size="sm" /> Ezra, your Web Engineer</CardTitle>
          <CardDescription>
            For sites connected through GitHub or a local folder, Ezra edits the real source code — Next.js metadata, Astro layouts, Hugo templates,
            sitemaps, redirects, schema components — the way a senior developer would.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm">
          <ol className="grid gap-2">
            {[
              [Code2, "A fresh copy of the repository is prepared for each task; Ezra explores it with code search, file outlines (tree-sitter) and page-to-source mapping."],
              [TerminalSquare, "Edits are made by Aider — an open-source coding agent built for large codebases — using the same LLM as the rest of your crew."],
              [GitPullRequest, "Every change becomes one reviewable fix with a full diff. Applying it opens a pull request (or merges it on full autopilot); rollback reverts it exactly."],
            ].map(([Icon, text], i) => {
              const I = Icon as typeof Code2;
              return <li key={i} className="flex gap-3"><I className="mt-0.5 size-4 shrink-0 text-muted-foreground" /><span className="text-muted-foreground">{text as string}</span></li>;
            })}
          </ol>
        </CardContent>
      </Card>

      <Card className="shadow-xs">
        <CardHeader><CardTitle>Server readiness</CardTitle><CardDescription>What this Rankcrew server has installed.</CardDescription></CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-2">
          {!c ? <><Skeleton className="h-14" /><Skeleton className="h-14" /></> : (
            <>
              <Check ok={c.code_edits} label="Aider" hint={c.code_edits ? "Ready for code edits" : "Install: uv tool install aider-chat"} />
              <Check ok={c.git} label="git" hint={c.git ? "Workspaces are version-tracked" : "Install git on the server"} />
              <Check ok={c.ripgrep} label="ripgrep" hint={c.ripgrep ? "Fast code search" : "Optional — built-in search is used instead"} />
              <Check ok={c.code_execution} label="Build checks" hint={c.code_execution ? "Ezra can run build / lint / test" : "Disabled (see below)"} />
            </>
          )}
        </CardContent>
      </Card>

      <Card className="shadow-xs">
        <CardHeader><CardTitle>Build verification</CardTitle></CardHeader>
        <CardContent className="grid gap-4">
          <Field orientation="horizontal">
            <FieldContent>
              <FieldLabel htmlFor="exec">Let Ezra run the site's build, lint and test scripts</FieldLabel>
              <FieldDescription>Catches broken builds before a pull request is opened. Installs dependencies and runs package.json scripts in the workspace.</FieldDescription>
            </FieldContent>
            <Switch id="exec" checked={data.code_execution_enabled} disabled={save.isPending} onCheckedChange={(v) => save.mutate({ code_execution_enabled: v })} />
          </Field>
          <Alert variant={data.code_execution_enabled ? "destructive" : "default"}>
            <ShieldAlert />
            <AlertTitle>This runs repository code on your server</AlertTitle>
            <AlertDescription>Only enable it for repositories you trust, and run Rankcrew in a container (the provided Docker image) so builds are isolated.</AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    </div>
  );
}
