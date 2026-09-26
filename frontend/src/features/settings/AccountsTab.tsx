import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Coins, Search } from "lucide-react";
import { toast } from "sonner";
import { Pill } from "@/components/common/badges";
import { fmtCredits } from "@/components/layout/AccountBits";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api, errorMessage } from "@/lib/api";
import type { AdminAccount } from "@/lib/types";
import { formatShortDate } from "@/lib/utils";

/** Operator view of customer workspaces: find one, and add or remove credits (support, refunds, trials). */
export function AccountsTab() {
  const [q, setQ] = useState("");
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ["admin-accounts", q], queryFn: () => api.adminAccounts(q), placeholderData: (p) => p });
  const [target, setTarget] = useState<AdminAccount | null>(null);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const setStatus = async (a: AdminAccount, value: "active" | "suspended") => {
    if (value === "suspended" && !window.confirm(`Suspend ${a.name}? Its members are signed out and its crew stops until you reactivate it.`)) return;
    try {
      await api.adminStatus(a.id, value);
      toast.success(`${a.name} ${value === "active" ? "reactivated" : "suspended"}`);
      qc.invalidateQueries({ queryKey: ["admin-accounts"] });
    } catch (e) { toast.error(errorMessage(e)); }
  };
  const grant = async () => {
    if (!target) return;
    try {
      const r = await api.adminGrant(target.id, Number(amount), note);
      toast.success(`${target.name}: ${fmtCredits(r.credits)} credits`);
      setTarget(null); setAmount(""); setNote("");
      qc.invalidateQueries({ queryKey: ["admin-accounts"] });
    } catch (e) { toast.error(errorMessage(e)); }
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle>Customer workspaces</CardTitle>
        <CardDescription>Every account on this platform. Add credits for support or refunds; negative amounts remove credits.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <InputGroup className="max-w-sm">
          <InputGroupAddon><Search /></InputGroupAddon>
          <InputGroupInput placeholder="Search by name or email" value={q} onChange={(e) => setQ(e.target.value)} />
        </InputGroup>
        {list.isPending ? <Skeleton className="h-40" /> : (
          <Table>
            <TableHeader><TableRow><TableHead>Workspace</TableHead><TableHead>Owner</TableHead><TableHead className="text-right">Sites</TableHead><TableHead className="text-right">Credits</TableHead><TableHead className="hidden md:table-cell">Created</TableHead><TableHead /></TableRow></TableHeader>
            <TableBody>
              {(list.data ?? []).map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="font-medium">{a.name} {a.kind === "operator" && <Pill tone="brand">operator</Pill>} {a.status !== "active" && <Pill tone="danger">{a.status}</Pill>}</TableCell>
                  <TableCell className="text-muted-foreground">{a.owner ?? "–"}</TableCell>
                  <TableCell className="text-right tabular-nums">{a.sites}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtCredits(a.credits)}</TableCell>
                  <TableCell className="hidden text-muted-foreground md:table-cell">{formatShortDate(a.created_at)}</TableCell>
                  <TableCell className="text-right">{a.kind === "customer" && (
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="outline" onClick={() => setTarget(a)}><Coins /> Credits</Button>
                      <Button size="sm" variant="ghost" onClick={() => setStatus(a, a.status === "active" ? "suspended" : "active")}>{a.status === "active" ? "Suspend" : "Reactivate"}</Button>
                    </div>
                  )}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
      <Dialog open={!!target} onOpenChange={(o) => !o && setTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adjust credits for {target?.name}</DialogTitle>
            <DialogDescription>Current balance: {target ? fmtCredits(target.credits) : 0}. The change is recorded in their credit history.</DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field><FieldLabel htmlFor="amt">Credits (negative to remove)</FieldLabel><Input id="amt" type="number" step="1" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
            <Field><FieldLabel htmlFor="note">Note shown to the customer</FieldLabel><Input id="note" maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Refund for a failed audit" /></Field>
          </FieldGroup>
          <DialogFooter><Button disabled={!amount || Number(amount) === 0 || Number.isNaN(Number(amount))} onClick={grant}>Apply</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
