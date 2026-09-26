import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, KeyRound, MailPlus, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { Pill } from "@/components/common/badges";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api, errorMessage } from "@/lib/api";
import { useMe } from "@/lib/hooks";
import { formatShortDate, timeAgo } from "@/lib/utils";

const MEMBERS = ["workspace-members"] as const;
const KEYS = ["workspace-api-keys"] as const;

function Confirm({ title, description, action, onConfirm, children }: { title: string; description: string; action: string; onConfirm: () => void; children: React.ReactNode }) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>{children}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader><AlertDialogTitle>{title}</AlertDialogTitle><AlertDialogDescription>{description}</AlertDialogDescription></AlertDialogHeader>
        <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={onConfirm}>{action}</AlertDialogAction></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function TeamCard() {
  const me = useMe().data!;
  const qc = useQueryClient();
  const q = useQuery({ queryKey: MEMBERS, queryFn: api.members });
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"member" | "owner">("member");
  const [busy, setBusy] = useState(false);
  const [devLink, setDevLink] = useState<string | null>(null);
  const isOwner = me.user?.role === "owner";
  const refresh = () => qc.invalidateQueries({ queryKey: MEMBERS });

  const invite = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await api.invite(email.trim(), role);
      setDevLink(r.dev_invite_url);
      toast.success(`Invitation sent to ${r.email}`);
      setEmail("");
      refresh();
    } catch (err) { toast.error(errorMessage(err)); } finally { setBusy(false); }
  };
  const run = async (fn: () => Promise<unknown>, ok: string) => {
    try { await fn(); toast.success(ok); refresh(); } catch (err) { toast.error(errorMessage(err)); }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Users className="size-5 text-primary" /> Team</CardTitle>
        <CardDescription>Everyone here shares this workspace's sites, crew and credits. Owners manage the team, API keys and notification settings.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6">
        {me.account.kind === "operator" && <p className="text-sm text-muted-foreground">This is the operator workspace. Add operators with <code className="text-xs">seo-engine create-admin</code> instead of invitations.</p>}
        {isOwner && me.account.kind === "customer" && (
          <form onSubmit={invite} className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_9rem_auto] sm:items-end">
            <Field>
              <FieldLabel htmlFor="inv-email">Invite by email</FieldLabel>
              <Input id="inv-email" type="email" placeholder="teammate@company.com" value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <Field>
              <FieldLabel htmlFor="inv-role">Role</FieldLabel>
              <NativeSelect id="inv-role" value={role} onChange={(e) => setRole(e.target.value as "member" | "owner")}>
                <NativeSelectOption value="member">Member</NativeSelectOption>
                <NativeSelectOption value="owner">Owner</NativeSelectOption>
              </NativeSelect>
            </Field>
            <Button type="submit" disabled={busy || !email.trim()}>{busy ? <Spinner /> : <MailPlus />} Invite</Button>
          </form>
        )}
        {devLink && <p className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">No mail server is configured, so here is the invitation link (development only): <a className="font-medium break-all text-foreground underline" href={devLink}>{devLink}</a></p>}
        {q.isPending ? <Skeleton className="h-32" /> : (
          <Table>
            <TableHeader><TableRow><TableHead>Person</TableHead><TableHead>Role</TableHead><TableHead className="hidden md:table-cell">Last sign-in</TableHead><TableHead /></TableRow></TableHeader>
            <TableBody>
              {q.data?.members.map((m) => (
                <TableRow key={m.id}>
                  <TableCell><span className="font-medium">{m.name || m.email.split("@")[0]}</span>{m.id === me.user?.id && <span className="text-muted-foreground"> (you)</span>}<span className="block text-xs text-muted-foreground">{m.email}</span></TableCell>
                  <TableCell>
                    {isOwner && me.account.kind === "customer" && m.id !== me.user?.id ? (
                      <NativeSelect size="sm" aria-label={`Role for ${m.email}`} value={m.role} onChange={(e) => run(() => api.setMemberRole(m.id, e.target.value as "member" | "owner"), "Role updated")}>
                        <NativeSelectOption value="member">Member</NativeSelectOption>
                        <NativeSelectOption value="owner">Owner</NativeSelectOption>
                      </NativeSelect>
                    ) : <Pill tone={m.role === "owner" ? "brand" : "neutral"}>{m.role}</Pill>}
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground md:table-cell">{m.last_login_at ? timeAgo(m.last_login_at) : "Never"}</TableCell>
                  <TableCell className="text-right">
                    {isOwner && me.account.kind === "customer" && m.id !== me.user?.id && (
                      <Confirm title={`Remove ${m.email}?`} description="They lose access to this workspace immediately, and API keys they created and invitations they sent stop working. Their work stays." action="Remove" onConfirm={() => run(() => api.removeMember(m.id), "Member removed")}>
                        <Button size="icon-sm" variant="ghost" aria-label={`Remove ${m.email}`}><Trash2 /></Button>
                      </Confirm>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {q.data?.invites.map((i) => (
                <TableRow key={`i-${i.id}`}>
                  <TableCell><span className="font-medium">{i.email}</span><span className="block text-xs text-muted-foreground">Invited {timeAgo(i.created_at)} · expires {formatShortDate(i.expires_at)}</span></TableCell>
                  <TableCell><Pill tone="warning">Invited · {i.role}</Pill></TableCell>
                  <TableCell className="hidden md:table-cell" />
                  <TableCell className="text-right">{isOwner && <Button size="sm" variant="ghost" onClick={() => run(() => api.revokeInvite(i.id), "Invitation withdrawn")}>Withdraw</Button>}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

export function ApiKeysCard() {
  const me = useMe().data!;
  const qc = useQueryClient();
  const q = useQuery({ queryKey: KEYS, queryFn: api.apiKeys });
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [fresh, setFresh] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const isOwner = me.user?.role === "owner" && me.account.kind === "customer";
  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await api.createApiKey(name.trim());
      setFresh(r.key);
      setName("");
      qc.invalidateQueries({ queryKey: KEYS });
    } catch (err) { toast.error(errorMessage(err)); } finally { setBusy(false); }
  };
  const revoke = async (id: number) => {
    try { await api.revokeApiKey(id); toast.success("Key revoked"); qc.invalidateQueries({ queryKey: KEYS }); } catch (err) { toast.error(errorMessage(err)); }
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><KeyRound className="size-5 text-primary" /> API keys</CardTitle>
        <CardDescription>Use the API from scripts and CI. A key acts for this workspace and spends its credits. Send it as <code className="text-xs">Authorization: Bearer rc_…</code>; docs are at <a className="underline" href="/api/docs" target="_blank" rel="noreferrer">/api/docs</a>.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5">
        {isOwner ? (
          <form onSubmit={create} className="flex flex-wrap items-end gap-3">
            <Field className="min-w-56 flex-1">
              <FieldLabel htmlFor="key-name">Key name</FieldLabel>
              <Input id="key-name" placeholder="CI pipeline" maxLength={100} value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Button type="submit" disabled={busy}>{busy ? <Spinner /> : <KeyRound />} Create key</Button>
          </form>
        ) : <p className="text-sm text-muted-foreground">{me.account.kind === "operator" ? "The operator workspace uses the SEO_API_KEYS server setting instead." : "Only owners can create or revoke keys."}</p>}
        {q.isPending ? <Skeleton className="h-20" /> : q.data?.length ? (
          <Table>
            <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Key</TableHead><TableHead className="hidden md:table-cell">Last used</TableHead><TableHead /></TableRow></TableHeader>
            <TableBody>
              {q.data.map((k) => (
                <TableRow key={k.id}>
                  <TableCell className="font-medium">{k.name}<span className="block text-xs font-normal text-muted-foreground">Created {formatShortDate(k.created_at)}{k.created_by ? ` by ${k.created_by}` : ""}</span></TableCell>
                  <TableCell><code className="text-xs">{k.prefix}…</code></TableCell>
                  <TableCell className="hidden text-muted-foreground md:table-cell">{k.last_used_at ? timeAgo(k.last_used_at) : "Never"}</TableCell>
                  <TableCell className="text-right">{isOwner && (
                    <Confirm title={`Revoke ${k.name}?`} description="Anything using this key stops working straight away." action="Revoke" onConfirm={() => revoke(k.id)}>
                      <Button size="sm" variant="ghost">Revoke</Button>
                    </Confirm>
                  )}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : <p className="text-sm text-muted-foreground">No keys yet.</p>}
      </CardContent>
      <Dialog open={!!fresh} onOpenChange={(o) => { if (!o) { setFresh(null); setCopied(false); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Copy your new key</DialogTitle>
            <DialogDescription>This is the only time it is shown. Store it somewhere safe; if you lose it, revoke it and create another.</DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <div className="flex gap-2">
                <Input readOnly value={fresh ?? ""} className="font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
                <Button variant="outline" onClick={() => { void navigator.clipboard?.writeText(fresh ?? ""); setCopied(true); }}>{copied ? <Check /> : <Copy />} {copied ? "Copied" : "Copy"}</Button>
              </div>
              <FieldDescription>Example: <code className="text-xs">curl -H "Authorization: Bearer {fresh?.slice(0, 10)}…" {typeof window !== "undefined" ? window.location.origin : ""}/api/sites</code></FieldDescription>
            </Field>
          </FieldGroup>
          <DialogFooter><Button onClick={() => { setFresh(null); setCopied(false); }}>Done</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
