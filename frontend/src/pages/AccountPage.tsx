import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Bell, CheckCircle2, KeyRound, Save, Send, Trash2, UserRound } from "lucide-react";
import { toast } from "sonner";
import { Pill } from "@/components/common/badges";
import { PageHeader } from "@/components/common/blocks";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ApiKeysCard, TeamCard } from "@/features/account/WorkspaceCards";
import { api, errorMessage } from "@/lib/api";
import { qk, useAccountNotify, useMe } from "@/lib/hooks";
import { PasswordInput, StrengthMeter } from "@/pages/auth/AuthLayout";

const EVENT_LABELS: Record<string, string> = {
  task_blocked: "A task is waiting on you", cycle_finished: "An optimisation cycle finished", rollback: "A change was rolled back",
  job_failed: "An audit or apply failed", budget_reached: "AI work paused by a budget", agent_message: "Messages from Maya",
  credits_exhausted: "You ran out of credits",
};

function Profile() {
  const me = useMe().data!;
  const qc = useQueryClient();
  const [name, setName] = useState(me.user?.name ?? "");
  const [workspace, setWorkspace] = useState(me.account.name);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      qc.setQueryData(qk.me, await api.updateProfile({ name, account_name: workspace }));
      toast.success("Saved");
    } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><UserRound className="size-5 text-primary" /> Profile</CardTitle>
        <CardDescription>How you and your workspace appear in reports and emails.</CardDescription>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="email">Email</FieldLabel>
            <div className="flex items-center gap-2">
              <Input id="email" value={me.user?.email ?? ""} readOnly className="bg-muted" />
              {me.user?.email_verified ? <Pill tone="success"><CheckCircle2 className="size-3" /> Confirmed</Pill> : <Pill tone="warning">Not confirmed</Pill>}
            </div>
          </Field>
          <Field>
            <FieldLabel htmlFor="name">Your name</FieldLabel>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} maxLength={200} />
          </Field>
          <Field>
            <FieldLabel htmlFor="ws">Workspace name</FieldLabel>
            <Input id="ws" value={workspace} onChange={(e) => setWorkspace(e.target.value)} maxLength={200} disabled={me.user?.role !== "owner"} />
          </Field>
        </FieldGroup>
      </CardContent>
      <CardFooter><Button disabled={busy} onClick={save}>{busy ? <Spinner /> : <Save />} Save</Button></CardFooter>
    </Card>
  );
}

function Password() {
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.changePassword(cur, next);
      setCur(""); setNext("");
      toast.success("Password changed. Other devices were signed out.");
    } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><KeyRound className="size-5 text-primary" /> Password</CardTitle>
        <CardDescription>Changing it signs out every other device.</CardDescription>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          <Field data-invalid={!!error || undefined}>
            <FieldLabel htmlFor="cur">Current password</FieldLabel>
            <PasswordInput id="cur" autoComplete="current-password" value={cur} onChange={setCur} />
          </Field>
          <Field data-invalid={!!error || undefined}>
            <FieldLabel htmlFor="new">New password</FieldLabel>
            <PasswordInput id="new" autoComplete="new-password" value={next} onChange={setNext} />
            <StrengthMeter password={next} />
            {error && <FieldError>{error}</FieldError>}
          </Field>
        </FieldGroup>
      </CardContent>
      <CardFooter><Button disabled={busy || !cur || next.length < 10} onClick={save}>{busy ? <Spinner /> : <Save />} Change password</Button></CardFooter>
    </Card>
  );
}

function Notifications() {
  const me = useMe().data!;
  const isOwner = me.user?.role === "owner";
  const q = useAccountNotify();
  const qc = useQueryClient();
  const [emailMembers, setEmailMembers] = useState(true);
  const [extra, setExtra] = useState("");
  const [slack, setSlack] = useState<string | null>(null);
  const [hook, setHook] = useState<string | null>(null);
  const [events, setEvents] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!q.data) return;
    setEmailMembers(q.data.email_members);
    setExtra(q.data.extra_emails.join(", "));
    setEvents(q.data.events);
  }, [q.data]);
  if (!q.data) return <Card><CardContent className="py-10"><Spinner /></CardContent></Card>;
  const d = q.data;
  const save = async () => {
    setBusy(true);
    try {
      const body = {
        email_members: emailMembers, events,
        extra_emails: extra.split(/[,\s]+/).map((s) => s.trim()).filter(Boolean),
        ...(slack !== null ? { slack_webhook_url: slack } : {}),
        ...(hook !== null ? { notify_webhook_url: hook } : {}),
      };
      qc.setQueryData(qk.accountNotify, await api.updateAccountNotifications(body));
      setSlack(null); setHook(null);
      toast.success("Notification settings saved");
    } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
  };
  const test = async () => {
    const r = await api.testAccountNotifications().catch((e) => ({ ok: false, message: errorMessage(e) }));
    (r.ok ? toast.success : toast.error)(r.message);
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Bell className="size-5 text-primary" /> Notifications</CardTitle>
        <CardDescription>Where the crew tells you about questions, finished cycles and anything that needs you.{!isOwner && " Only workspace owners can change these."}</CardDescription>
      </CardHeader>
      <CardContent>
        <fieldset disabled={!isOwner} className="contents">
        <FieldGroup>
          <Field orientation="horizontal">
            <Switch id="em" checked={emailMembers} onCheckedChange={setEmailMembers} disabled={!d.email_available} />
            <FieldLabel htmlFor="em" className="font-normal">Email everyone in this workspace{!d.email_available && <span className="text-muted-foreground"> (email is not available on this server yet)</span>}</FieldLabel>
          </Field>
          <Field>
            <FieldLabel htmlFor="extra">Also email</FieldLabel>
            <Input id="extra" placeholder="teammate@company.com, ops@company.com" value={extra} onChange={(e) => setExtra(e.target.value)} />
          </Field>
          <Field>
            <FieldLabel htmlFor="slack">Slack incoming webhook</FieldLabel>
            <Input id="slack" type="password" autoComplete="off" placeholder={d.slack_webhook_set ? "•••••••• saved. Leave blank to keep" : "https://hooks.slack.com/services/…"} value={slack ?? ""} onChange={(e) => setSlack(e.target.value)} />
          </Field>
          <Field>
            <FieldLabel htmlFor="hook">JSON webhook (Discord, Teams, Zapier, n8n)</FieldLabel>
            <Input id="hook" type="password" autoComplete="off" placeholder={d.notify_webhook_set ? "•••••••• saved. Leave blank to keep" : "https://…"} value={hook ?? ""} onChange={(e) => setHook(e.target.value)} />
            <FieldDescription>Webhook URLs are stored encrypted.</FieldDescription>
          </Field>
          <fieldset className="grid gap-2">
            <legend className="mb-1 text-sm font-medium">Tell me when</legend>
            {d.all_events.map((ev) => (
              <label key={ev} className="flex items-center gap-2 text-sm">
                <Checkbox checked={events.includes(ev)} onCheckedChange={(v) => setEvents(v ? [...events, ev] : events.filter((x) => x !== ev))} />
                {EVENT_LABELS[ev] ?? ev}
              </label>
            ))}
          </fieldset>
        </FieldGroup>
        </fieldset>
      </CardContent>
      {isOwner && (
        <CardFooter className="gap-2">
          <Button disabled={busy} onClick={save}>{busy ? <Spinner /> : <Save />} Save</Button>
          <Button variant="outline" onClick={test}><Send /> Send a test</Button>
        </CardFooter>
      )}
    </Card>
  );
}

function DangerZone() {
  const me = useMe().data!;
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [pw, setPw] = useState("");
  const [error, setError] = useState<string | null>(null);
  if (me.user?.role !== "owner" || me.account.kind !== "customer") return null;
  const del = async () => {
    try {
      await api.deleteAccount(pw);
      qc.clear();
      qc.setQueryData(qk.me, null);
      navigate("/", { replace: true });
    } catch (e) { setError(errorMessage(e)); }
  };
  return (
    <Card className="ring-destructive/30">
      <CardHeader>
        <CardTitle className="text-destructive">Delete workspace</CardTitle>
        <CardDescription>Removes {me.account.name}, every site, audit, fix, task and memory, and all unused credits. This cannot be undone.</CardDescription>
      </CardHeader>
      <CardFooter>
        <AlertDialog onOpenChange={() => { setPw(""); setError(null); }}>
          <AlertDialogTrigger asChild><Button variant="destructive"><Trash2 /> Delete workspace</Button></AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete {me.account.name}?</AlertDialogTitle>
              <AlertDialogDescription>Everything in this workspace is erased permanently. Enter your password to confirm.</AlertDialogDescription>
            </AlertDialogHeader>
            <Field data-invalid={!!error || undefined}>
              <PasswordInput id="del-pw" autoComplete="current-password" value={pw} onChange={setPw} />
              {error && <FieldError>{error}</FieldError>}
            </Field>
            <AlertDialogFooter>
              <AlertDialogCancel>Keep it</AlertDialogCancel>
              <AlertDialogAction disabled={!pw} onClick={(e) => { e.preventDefault(); void del(); }}>Delete forever</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardFooter>
    </Card>
  );
}

export default function AccountPage() {
  const me = useMe().data;
  const [params, setParams] = useSearchParams();
  if (!me) return null;
  const tab = params.get("tab") ?? "profile";
  const setTab = (v: string) => setParams((p) => { const n = new URLSearchParams(p); n.set("tab", v); return n; }, { replace: true });
  return (
    <div className="grid max-w-5xl gap-6">
      <PageHeader title="Account" description={me.user ? `Signed in as ${me.user.email} · ${me.account.name}` : "Operator API key session"} />
      {me.user ? (
        <Tabs value={tab} onValueChange={setTab} className="gap-6">
          <div className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
            <TabsList>
              <TabsTrigger value="profile">Profile &amp; security</TabsTrigger>
              <TabsTrigger value="team">Team</TabsTrigger>
              <TabsTrigger value="keys">API keys</TabsTrigger>
              <TabsTrigger value="notifications">Notifications</TabsTrigger>
            </TabsList>
          </div>
          <TabsContent value="profile" className="grid items-start gap-6 lg:grid-cols-2">
            <Profile />
            <div className="grid gap-6"><Password /><DangerZone /></div>
          </TabsContent>
          <TabsContent value="team"><TeamCard /></TabsContent>
          <TabsContent value="keys"><ApiKeysCard /></TabsContent>
          <TabsContent value="notifications"><Notifications /></TabsContent>
        </Tabs>
      ) : (
        <p className="text-muted-foreground">Operator keys have no profile. Sign in with an account to manage one.</p>
      )}
    </div>
  );
}
