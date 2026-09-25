import { useEffect, useState } from "react";
import { Bell, Mail, Save, Webhook } from "lucide-react";
import { Pill } from "@/components/common/badges";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldSet, FieldLegend } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { useUpdateIntegrations } from "@/lib/hooks";
import type { IntegrationsSettings, NotifyEvent } from "@/lib/types";
import { SecretField, TestIntegration, touched } from "./fields";

const EVENT_LABELS: Record<NotifyEvent, { label: string; hint: string }> = {
  task_blocked: { label: "Someone needs your input", hint: "An employee asked you a question and paused." },
  cycle_finished: { label: "Cycle finished", hint: "Maya's report after each optimisation cycle." },
  rollback: { label: "Change rolled back", hint: "A change hurt search performance and was reverted." },
  job_failed: { label: "Job failed", hint: "An audit, cycle or apply job errored." },
  budget_reached: { label: "Budget reached", hint: "The daily LLM budget paused AI work." },
  agent_message: { label: "Messages from Maya", hint: "Important news the manager decides to share." },
};

export function NotificationsTab({ data }: { data: IntegrationsSettings }) {
  const save = useUpdateIntegrations();
  const [form, setForm] = useState({ public_url: data.public_url, smtp_host: data.smtp_host, smtp_port: data.smtp_port, smtp_user: data.smtp_user, smtp_from: data.smtp_from, notify_email: data.notify_email });
  const [events, setEvents] = useState<NotifyEvent[]>(data.notify_events);
  const [slack, setSlack] = useState<string | undefined>();
  const [hook, setHook] = useState<string | undefined>();
  const [smtpPass, setSmtpPass] = useState<string | undefined>();
  useEffect(() => {
    setForm({ public_url: data.public_url, smtp_host: data.smtp_host, smtp_port: data.smtp_port, smtp_user: data.smtp_user, smtp_from: data.smtp_from, notify_email: data.notify_email });
    setEvents(data.notify_events);
  }, [data]);
  const configured = data.slack_webhook_url_set || data.notify_webhook_url_set || (!!data.smtp_host && !!data.notify_email);
  const submit = () => save.mutate({ ...form, notify_events: events, ...touched({ slack_webhook_url: slack, notify_webhook_url: hook, smtp_password: smtpPass }) },
    { onSuccess: () => { setSlack(undefined); setHook(undefined); setSmtpPass(undefined); } });

  return (
    <Card className="shadow-xs">
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2"><Bell className="size-4" /> Notifications <Pill tone={configured ? "success" : "neutral"}>{configured ? "On" : "No channel yet"}</Pill></CardTitle>
        <CardDescription>Your crew works around the clock — choose where they reach you.</CardDescription>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          <SecretField id="slack" label="Slack incoming webhook" value={slack} onChange={setSlack} isSet={data.slack_webhook_url_set} placeholder="https://hooks.slack.com/services/…" />
          <SecretField id="hook" label="Generic webhook (JSON POST)" value={hook} onChange={setHook} isSet={data.notify_webhook_url_set} placeholder="https://example.com/rankcrew-events"
            description="Receives {event, title, body, url, level, site, at} — use it for Discord, Teams, Zapier or n8n." />
          <Separator />
          <div className="flex items-center gap-2 text-sm font-medium"><Mail className="size-4" /> Email (SMTP)</div>
          <div className="grid gap-4 sm:grid-cols-[1fr_7rem]">
            <Field><FieldLabel htmlFor="smtp-host">SMTP host</FieldLabel><Input id="smtp-host" value={form.smtp_host} onChange={(e) => setForm({ ...form, smtp_host: e.target.value })} placeholder="smtp.example.com" /></Field>
            <Field><FieldLabel htmlFor="smtp-port">Port</FieldLabel><Input id="smtp-port" type="number" value={form.smtp_port} onChange={(e) => setForm({ ...form, smtp_port: Number(e.target.value) })} /></Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field><FieldLabel htmlFor="smtp-user">Username</FieldLabel><Input id="smtp-user" value={form.smtp_user} onChange={(e) => setForm({ ...form, smtp_user: e.target.value })} autoComplete="off" /></Field>
            <SecretField id="smtp-pass" label="Password" value={smtpPass} onChange={setSmtpPass} isSet={data.smtp_password_set} placeholder="App password" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field><FieldLabel htmlFor="smtp-from">From address</FieldLabel><Input id="smtp-from" type="email" value={form.smtp_from} onChange={(e) => setForm({ ...form, smtp_from: e.target.value })} placeholder="rankcrew@example.com" /></Field>
            <Field><FieldLabel htmlFor="notify-to">Send to</FieldLabel><Input id="notify-to" type="email" value={form.notify_email} onChange={(e) => setForm({ ...form, notify_email: e.target.value })} placeholder="you@example.com" /></Field>
          </div>
          <Separator />
          <Field>
            <FieldLabel htmlFor="public-url"><Webhook className="size-4" /> Rankcrew URL</FieldLabel>
            <Input id="public-url" type="url" value={form.public_url} onChange={(e) => setForm({ ...form, public_url: e.target.value })} placeholder="https://rankcrew.example.com" />
            <FieldDescription>Used for "Open in Rankcrew" links in messages.</FieldDescription>
          </Field>
          <FieldSet>
            <FieldLegend variant="label">Notify me when…</FieldLegend>
            <div className="grid gap-3 sm:grid-cols-2">
              {(data.events ?? []).map((ev) => (
                <Field key={ev} orientation="horizontal">
                  <Checkbox id={`ev-${ev}`} checked={events.includes(ev)} onCheckedChange={(c) => setEvents(c ? [...events, ev] : events.filter((x) => x !== ev))} />
                  <div className="grid gap-0.5">
                    <FieldLabel htmlFor={`ev-${ev}`} className="font-normal">{EVENT_LABELS[ev]?.label ?? ev}</FieldLabel>
                    <FieldDescription className="text-xs">{EVENT_LABELS[ev]?.hint}</FieldDescription>
                  </div>
                </Field>
              ))}
            </div>
          </FieldSet>
        </FieldGroup>
      </CardContent>
      <CardFooter className="flex-wrap justify-between gap-3 border-t">
        <TestIntegration target="notify" label="Send test" />
        <Button size="sm" disabled={save.isPending} onClick={submit}><Save /> Save</Button>
      </CardFooter>
    </Card>
  );
}
