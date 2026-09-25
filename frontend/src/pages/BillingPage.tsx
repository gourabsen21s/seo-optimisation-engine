import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowDownRight, ArrowUpRight, Coins, CreditCard, Lock, Receipt } from "lucide-react";
import { toast } from "sonner";
import { Pill } from "@/components/common/badges";
import { EmptyState, PageHeader } from "@/components/common/blocks";
import { AnimatedNumber, Reveal } from "@/components/common/motion";
import { fmtCredits } from "@/components/layout/AccountBits";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api, errorMessage } from "@/lib/api";
import { qk, useBilling, useMe } from "@/lib/hooks";
import type { Pack } from "@/lib/types";
import { cn, formatDateTime } from "@/lib/utils";

const REASONS: Record<string, string> = {
  signup: "Welcome credits", purchase: "Credit pack", grant: "Added by support", adjustment: "Adjustment",
  audit: "Audit", llm: "AI work", rank_check: "Rank check", refund: "Refund",
};
const money = (cents: number, currency: string) =>
  new Intl.NumberFormat(undefined, { style: "currency", currency: currency.toUpperCase(), maximumFractionDigits: cents % 100 ? 2 : 0 }).format(cents / 100);

function PackCard({ pack, currency, best, enabled, onBuy, busy }: { pack: Pack; currency: string; best: boolean; enabled: boolean; onBuy: () => void; busy: boolean }) {
  const per = pack.price_cents / pack.credits;
  return (
    <Card data-reveal className={cn("relative transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-md", best && "ring-2 ring-primary")}>
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-2">
          {pack.name}
          {best && <Pill tone="brand">Best value</Pill>}
        </CardTitle>
        <CardDescription>{pack.note}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-1">
        <div className="font-display text-4xl font-semibold tabular-nums">{pack.credits.toLocaleString()}<span className="ml-1.5 font-sans text-base font-normal text-muted-foreground">credits</span></div>
        <div className="text-sm text-muted-foreground">{money(pack.price_cents, currency)} · {money(per * 100, currency)} per 100 credits</div>
      </CardContent>
      <CardFooter>
        <Button className="w-full" disabled={!enabled || busy} onClick={onBuy}>{busy ? <Spinner /> : <CreditCard />} Buy {pack.name}</Button>
      </CardFooter>
    </Card>
  );
}

export default function BillingPage() {
  const me = useMe().data;
  const billing = useBilling();
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const [buying, setBuying] = useState<string | null>(null);
  const paidBefore = useRef<number | null>(null);

  // Back from Stripe: the webhook usually lands within seconds, so poll briefly for the new balance.
  useEffect(() => {
    const status = params.get("checkout");
    if (!status) return;
    setParams((p) => { const n = new URLSearchParams(p); n.delete("checkout"); n.delete("session_id"); return n; }, { replace: true });
    if (status === "cancelled") { toast("Checkout cancelled. No charge was made."); return; }
    toast.success("Payment received", { description: "Your credits will appear in a moment." });
    paidBefore.current = billing.data?.purchases.filter((p) => p.status === "paid").length ?? null;
    let n = 0;
    const id = setInterval(async () => {
      n += 1;
      const b = await qc.fetchQuery({ queryKey: qk.billing, queryFn: api.billing, staleTime: 0 });
      qc.invalidateQueries({ queryKey: qk.me });
      const paid = b.purchases.filter((p) => p.status === "paid").length;
      if ((paidBefore.current !== null && paid > paidBefore.current) || n >= 12) clearInterval(id);
    }, 2000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const buy = async (pack: Pack) => {
    setBuying(pack.id);
    try {
      const { url } = await api.checkout(pack.id);
      window.location.assign(url);
    } catch (e) {
      toast.error(errorMessage(e));
      setBuying(null);
    }
  };

  const b = billing.data;
  if (billing.isPending || !b) return <div className="grid gap-4"><Skeleton className="h-9 w-64" /><Skeleton className="h-40 w-full" /><Skeleton className="h-64 w-full" /></div>;
  const bestId = [...b.packs].sort((x, y) => x.price_cents / x.credits - y.price_cents / y.credits)[0]?.id;
  const spent = Object.values(b.spend.by_reason).reduce((a, v) => a + v, 0);

  return (
    <div className="grid gap-6">
      <PageHeader title="Billing & credits" description="Credits pay for the crew's work. No subscription: top up when you need more, and see exactly where every credit went." />

      <Reveal className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <Card data-reveal className="overflow-hidden">
          <CardHeader>
            <CardDescription className="flex items-center gap-2"><Coins className="size-4 text-primary" /> Balance</CardDescription>
            <CardTitle className="font-display text-6xl font-semibold tracking-tight tabular-nums">
              <AnimatedNumber value={Math.max(0, b.credits)} decimals={Number.isInteger(b.credits) ? 0 : 1} />
              <span className="ml-2 font-sans text-lg font-normal text-muted-foreground">credits</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm">
            {!b.metered ? (
              <p className="text-muted-foreground">This is the operator workspace. Its work is not metered.</p>
            ) : b.credits <= 0 ? (
              <p className="font-medium text-destructive">You are out of credits, so audits, AI tasks and rank checks are paused. Buy a pack below to resume.</p>
            ) : (
              <p className="text-muted-foreground">Spent in the last {b.spend.days} days: <b className="text-foreground tabular-nums">{fmtCredits(spent)}</b></p>
            )}
            {spent > 0 && (
              <div className="grid gap-2">
                {Object.entries(b.spend.by_reason).sort((x, y) => y[1] - x[1]).map(([reason, v]) => (
                  <div key={reason} className="grid grid-cols-[8rem_minmax(0,1fr)_4rem] items-center gap-3">
                    <span className="text-muted-foreground">{REASONS[reason] ?? reason}</span>
                    <span className="h-1.5 overflow-hidden rounded-full bg-muted"><span className="block h-full rounded-full bg-primary" style={{ width: `${Math.max(4, (v / spent) * 100)}%` }} /></span>
                    <span className="text-right tabular-nums">{fmtCredits(v)}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
        <Card data-reveal>
          <CardHeader>
            <CardTitle>What things cost</CardTitle>
            <CardDescription>Credits are only spent when the crew does work. Signing up includes {b.signup_credits} free.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableBody>
                {b.prices.map((p) => (
                  <TableRow key={p.item}>
                    <TableCell className="font-medium">{p.item}<span className="block text-xs font-normal text-muted-foreground">{p.unit}</span></TableCell>
                    <TableCell className="text-right tabular-nums">{p.credits ? `${fmtCredits(p.credits)} credit${p.credits === 1 ? "" : "s"}` : "Free"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </Reveal>

      {b.metered && (
        <section className="grid gap-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-xl font-semibold">Add credits</h2>
            {!b.enabled && <span className="flex items-center gap-1.5 text-sm text-muted-foreground"><Lock className="size-3.5" /> Payments are not set up on this server yet.</span>}
          </div>
          <Reveal className="grid gap-4 md:grid-cols-3">
            {b.packs.map((p) => <PackCard key={p.id} pack={p} currency={b.currency} best={p.id === bestId} enabled={b.enabled && !!me?.user} busy={buying === p.id} onBuy={() => buy(p)} />)}
          </Reveal>
          <p className="text-xs text-muted-foreground">Payments are processed by Stripe; card details never reach our servers. Credits do not expire.</p>
        </section>
      )}

      <Tabs defaultValue="history" className="gap-4">
        <TabsList>
          <TabsTrigger value="history">Credit history</TabsTrigger>
          <TabsTrigger value="purchases">Purchases</TabsTrigger>
        </TabsList>
        <TabsContent value="history">
          {b.ledger.length ? (
            <Card className="py-0">
              <Table>
                <TableHeader>
                  <TableRow><TableHead>When</TableHead><TableHead>What</TableHead><TableHead className="hidden md:table-cell">Site</TableHead><TableHead className="text-right">Credits</TableHead><TableHead className="hidden text-right sm:table-cell">Balance</TableHead></TableRow>
                </TableHeader>
                <TableBody>
                  {b.ledger.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell className="whitespace-nowrap text-muted-foreground">{formatDateTime(e.at)}</TableCell>
                      <TableCell><span className="font-medium">{REASONS[e.reason] ?? e.reason}</span>{e.note && <span className="block max-w-xs truncate text-xs text-muted-foreground">{e.note}</span>}</TableCell>
                      <TableCell className="hidden text-muted-foreground md:table-cell">{e.site ?? "–"}</TableCell>
                      <TableCell className={cn("text-right font-medium tabular-nums", e.amount > 0 ? "text-emerald-600 dark:text-emerald-400" : "")}>
                        <span className="inline-flex items-center gap-1">{e.amount > 0 ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5 text-muted-foreground" />}{e.amount > 0 ? "+" : ""}{fmtCredits(e.amount)}</span>
                      </TableCell>
                      <TableCell className="hidden text-right text-muted-foreground tabular-nums sm:table-cell">{fmtCredits(e.balance)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          ) : <EmptyState icon={<Receipt />} title="No credit activity yet" description="Every credit added or spent shows up here." />}
        </TabsContent>
        <TabsContent value="purchases">
          {b.purchases.length ? (
            <Card className="py-0">
              <Table>
                <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Pack</TableHead><TableHead className="text-right">Credits</TableHead><TableHead className="text-right">Amount</TableHead><TableHead className="text-right">Status</TableHead></TableRow></TableHeader>
                <TableBody>
                  {b.purchases.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="text-muted-foreground">{formatDateTime(p.paid_at ?? p.created_at)}</TableCell>
                      <TableCell className="font-medium capitalize">{p.pack_id}</TableCell>
                      <TableCell className="text-right tabular-nums">{p.credits.toLocaleString()}</TableCell>
                      <TableCell className="text-right tabular-nums">{money(p.amount_cents, p.currency)}</TableCell>
                      <TableCell className="text-right"><Pill tone={p.status === "paid" ? "success" : p.status === "pending" ? "warning" : "neutral"}>{p.status === "pending" ? "Awaiting payment" : p.status}</Pill></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          ) : <EmptyState icon={<CreditCard />} title="No purchases yet" description="Credit packs you buy appear here with their status." />}
        </TabsContent>
      </Tabs>
    </div>
  );
}
