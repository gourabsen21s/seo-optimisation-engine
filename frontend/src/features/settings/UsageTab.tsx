import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, XAxis } from "recharts";
import { Coins, Gauge, Save, Sigma } from "lucide-react";
import { StatCard } from "@/components/common/blocks";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmployeeAvatar } from "@/features/team/EmployeeAvatar";
import { useEmployees } from "@/features/team/employees";
import { useUpdateIntegrations } from "@/lib/hooks";
import type { IntegrationsSettings } from "@/lib/types";
import { formatShortDate } from "@/lib/utils";

const chart = { tokens: { label: "Tokens", color: "var(--primary)" } } satisfies ChartConfig;
const fmt = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));

export function UsageTab({ data }: { data: IntegrationsSettings }) {
  const save = useUpdateIntegrations();
  const dir = useEmployees();
  const u = data.usage;
  const [budget, setBudget] = useState(String(data.llm_daily_token_budget || ""));
  useEffect(() => setBudget(String(data.llm_daily_token_budget || "")), [data]);
  const total = u.by_actor.reduce((s, a) => s + a.input_tokens + a.output_tokens, 0);
  const pct = u.budget ? Math.min(100, Math.round((u.today / u.budget) * 100)) : 0;
  const rows = [...u.by_actor].sort((a, b) => b.input_tokens + b.output_tokens - (a.input_tokens + a.output_tokens));
  const who = (actor: string) => {
    const [id, tool] = actor.split(":");
    return { id, name: id === "chat" ? "Chat with Maya" : dir.name(id), tool };
  };

  return (
    <div className="grid gap-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard icon={<Coins />} label="Tokens today" value={u.today} hint={u.budget ? `${pct}% of daily budget` : "No daily budget"} tone={pct >= 90 ? "warning" : "default"} />
        <StatCard icon={<Sigma />} label={`Last ${u.last_days} days`} value={total} hint={`${u.by_actor.reduce((s, a) => s + a.requests, 0)} model requests`} />
        <StatCard icon={<Gauge />} label="Daily budget" value={u.budget || null} hint={u.budget ? "Tokens per UTC day" : "Unlimited"} />
      </div>

      <Card className="shadow-xs">
        <CardHeader><CardTitle>Daily usage</CardTitle><CardDescription>Input + output tokens across all employees, chat and code edits</CardDescription></CardHeader>
        <CardContent>
          {u.per_day.length ? (
            <ChartContainer config={chart} className="h-56 w-full">
              <BarChart data={u.per_day.map((d) => ({ ...d, label: formatShortDate(d.date) }))}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={16} />
                <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
                <Bar dataKey="tokens" fill="var(--color-tokens)" radius={4} />
              </BarChart>
            </ChartContainer>
          ) : <p className="text-sm text-muted-foreground">No AI usage recorded yet.</p>}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <Card className="gap-0 py-0 shadow-xs">
          <CardHeader className="border-b py-4"><CardTitle>By employee</CardTitle></CardHeader>
          <Table>
            <TableHeader><TableRow><TableHead className="pl-4">Who</TableHead><TableHead className="text-right">Requests</TableHead><TableHead className="text-right">Input</TableHead><TableHead className="pr-4 text-right">Output</TableHead></TableRow></TableHeader>
            <TableBody>
              {rows.map((r) => {
                const w = who(r.actor);
                return (
                  <TableRow key={r.actor}>
                    <TableCell className="pl-4"><div className="flex items-center gap-2">{w.id !== "chat" && <EmployeeAvatar actor={w.id} size="xs" ring={false} />}<span className="font-medium">{w.name}</span>{w.tool && <span className="text-xs text-muted-foreground">via {w.tool}</span>}</div></TableCell>
                    <TableCell className="text-right tabular-nums">{r.requests}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(r.input_tokens)}</TableCell>
                    <TableCell className="pr-4 text-right tabular-nums">{fmt(r.output_tokens)}</TableCell>
                  </TableRow>
                );
              })}
              {!rows.length && <TableRow><TableCell colSpan={4} className="py-8 text-center text-muted-foreground">Nothing yet</TableCell></TableRow>}
            </TableBody>
          </Table>
        </Card>

        <Card className="shadow-xs">
          <CardHeader><CardTitle>Spending cap</CardTitle><CardDescription>AI work pauses when today's tokens reach the cap, and resumes at midnight UTC.</CardDescription></CardHeader>
          <CardContent className="grid gap-4">
            <Field>
              <FieldLabel htmlFor="budget">Daily token budget</FieldLabel>
              <Input id="budget" type="number" min={0} step={50000} value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="Unlimited" />
              <FieldDescription>0 or blank = unlimited. 1M tokens ≈ a few busy cycles.</FieldDescription>
            </Field>
            {u.budget > 0 && (
              <div className="grid gap-1.5 text-xs text-muted-foreground">
                <Progress value={pct} />
                <span>{fmt(u.today)} of {fmt(u.budget)} used today</span>
              </div>
            )}
          </CardContent>
          <CardFooter className="justify-end border-t">
            <Button size="sm" disabled={save.isPending} onClick={() => save.mutate({ llm_daily_token_budget: Math.max(0, Number(budget) || 0) })}><Save /> Save</Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
