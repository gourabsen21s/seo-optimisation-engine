import { useEffect, useState } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { Bot, CheckCircle2, ChevronDown, Cpu, KeyRound, Save, ShieldCheck, XCircle, Zap } from "lucide-react";
import { Pill } from "@/components/common/badges";
import { PageHeader } from "@/components/common/blocks";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Slider } from "@/components/ui/slider";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AccountsTab } from "@/features/settings/AccountsTab";
import { CodeTab } from "@/features/settings/CodeTab";
import { IntegrationsTab } from "@/features/settings/IntegrationsTab";
import { NotificationsTab } from "@/features/settings/NotificationsTab";
import { UsageTab } from "@/features/settings/UsageTab";
import { api, errorMessage } from "@/lib/api";
import { useIntegrations, useMe, useSettings, useUpdateSettings } from "@/lib/hooks";
import type { LLMTestResult, Provider } from "@/lib/types";

const providerOf = (model: string) => (model.includes(":") ? model.split(":")[0] : "custom");

function TestLlm({ target }: { target: "llm" | "judge" }) {
  const [s, setS] = useState<{ busy: boolean; res?: LLMTestResult }>({ busy: false });
  return (
    <div className="flex items-center gap-2 text-sm">
      <Button variant="outline" disabled={s.busy} onClick={async () => {
        setS({ busy: true });
        try { setS({ busy: false, res: await api.testLlm(target) }); } catch (e) { setS({ busy: false, res: { ok: false, message: errorMessage(e), latency_ms: 0 } }); }
      }}>{s.busy ? <Spinner /> : <Zap />} Test</Button>
      {s.res && (s.res.ok
        ? <span className="flex items-center gap-1 text-emerald-600"><CheckCircle2 className="size-4" />{s.res.latency_ms} ms</span>
        : <span className="flex max-w-md items-center gap-1 truncate text-red-600"><XCircle className="size-4 shrink-0" />{s.res.message}</span>)}
    </div>
  );
}

function ModelFields({ providers, model, setModel, apiKey, setApiKey, keySet, baseUrl, setBaseUrl }: {
  providers: Provider[]; model: string; setModel: (v: string) => void; apiKey: string | null; setApiKey: (v: string | null) => void; keySet: boolean; baseUrl: string; setBaseUrl: (v: string) => void;
}) {
  const provider = providerOf(model);
  const known = providers.find((p) => p.id === provider);
  const needsUrl = ["ollama", "openai-compatible"].includes(provider);
  return (
    <>
      <div className="grid gap-4 md:grid-cols-2">
        <Field>
          <FieldLabel>Provider</FieldLabel>
          <Select value={known ? provider : "custom"} onValueChange={(v) => v !== "custom" && setModel(`${v}:${providers.find((p) => p.id === v)?.example ?? ""}`)}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              {providers.map((p) => <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>)}
              <SelectItem value="custom">Other (type below)</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field>
          <FieldLabel>Model</FieldLabel>
          <Input value={model} onChange={(e) => setModel(e.target.value)} className="font-mono" placeholder="provider:model" />
          <FieldDescription>Format <code>provider:model</code>{known?.env ? ` · or set ${known.env} on the server` : ""}</FieldDescription>
        </Field>
      </div>
      <Field>
        <FieldLabel>API key</FieldLabel>
        <InputGroup>
          <InputGroupAddon><KeyRound /></InputGroupAddon>
          <InputGroupInput type="password" value={apiKey ?? ""} onChange={(e) => setApiKey(e.target.value)} placeholder={keySet ? "•••••••• stored — leave blank to keep" : "Paste an API key"} />
          {keySet && <InputGroupAddon align="inline-end"><InputGroupButton size="xs" variant="ghost" onClick={() => setApiKey("")}>Clear</InputGroupButton></InputGroupAddon>}
        </InputGroup>
        <FieldDescription>Stored encrypted. {apiKey === "" && keySet ? "Will be cleared on save." : ""}</FieldDescription>
      </Field>
      <Collapsible defaultOpen={needsUrl || !!baseUrl}>
        <CollapsibleTrigger asChild><Button variant="ghost" size="sm" className="-ml-2 text-muted-foreground"><ChevronDown /> Advanced</Button></CollapsibleTrigger>
        <CollapsibleContent className="pt-2">
          <Field><FieldLabel>Base URL</FieldLabel><Input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder={provider === "ollama" ? "http://localhost:11434/v1" : "https://…/v1"} /></Field>
        </CollapsibleContent>
      </Collapsible>
    </>
  );
}

export default function WorkspaceSettingsPage() {
  const me = useMe().data;
  // Platform settings are for operators; customers manage their own account instead.
  if (me && !me.is_superuser) return <Navigate to="/account" replace />;
  return <PlatformSettings />;
}

function PlatformSettings() {
  const settings = useSettings();
  const integrations = useIntegrations();
  const update = useUpdateSettings();
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") ?? "models";
  const d = settings.data;
  const [llm, setLlm] = useState({ model: "", base_url: "", temperature: null as number | null, max_tokens: 8000 });
  const [llmKey, setLlmKey] = useState<string | null>(null);
  const [judge, setJudge] = useState({ model: "", base_url: "", enabled: true, min_confidence: 0.6 });
  const [judgeKey, setJudgeKey] = useState<string | null>(null);

  useEffect(() => {
    if (!d) return;
    setLlm({ model: d.llm.model, base_url: d.llm.base_url, temperature: d.llm.temperature, max_tokens: d.llm.max_tokens });
    setJudge({ model: d.judge.model, base_url: d.judge.base_url, enabled: d.judge.enabled, min_confidence: d.judge.min_confidence });
  }, [d]);

  if (!d) return <div className="grid gap-4"><Skeleton className="h-10 w-64" /><Skeleton className="h-80" /><Skeleton className="h-80" /></div>;

  const i = integrations.data;
  const pending = <div className="grid gap-4"><Skeleton className="h-64" /><Skeleton className="h-48" /></div>;
  return (
    <div className="grid max-w-5xl gap-6">
      <PageHeader icon={<Cpu />} title="Platform settings" description="Operator only: the AI models, research integrations, email server and spending limits every customer's crew runs on." />
      <Tabs value={tab} onValueChange={(v) => setParams((prev) => { const n = new URLSearchParams(prev); n.set("tab", v); return n; }, { replace: true })} className="gap-6">
        <div className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
          <TabsList>
            <TabsTrigger value="models">AI models</TabsTrigger>
            <TabsTrigger value="integrations">Integrations</TabsTrigger>
            <TabsTrigger value="notifications">Notifications</TabsTrigger>
            <TabsTrigger value="usage">Usage &amp; budget</TabsTrigger>
            <TabsTrigger value="code">Code edits</TabsTrigger>
            <TabsTrigger value="accounts">Customers</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="integrations">{i ? <IntegrationsTab data={i} /> : pending}</TabsContent>
        <TabsContent value="notifications">{i ? <NotificationsTab data={i} /> : pending}</TabsContent>
        <TabsContent value="usage">{i ? <UsageTab data={i} /> : pending}</TabsContent>
        <TabsContent value="code">{i ? <CodeTab data={i} /> : pending}</TabsContent>
        <TabsContent value="accounts"><AccountsTab /></TabsContent>
        <TabsContent value="models" className="grid gap-6">
      <Card className="shadow-xs">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Bot className="size-5 text-primary" /> Language model <Pill tone={d.llm.api_key_set ? "success" : "warning"}>{d.llm.api_key_set ? "Key configured" : "No key"}</Pill></CardTitle>
          <CardDescription>Powers the whole crew — planning, research, analysis, writing, link building, code edits and chat.</CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <ModelFields providers={d.providers} model={llm.model} setModel={(model) => setLlm({ ...llm, model })} apiKey={llmKey} setApiKey={setLlmKey} keySet={d.llm.api_key_set} baseUrl={llm.base_url} setBaseUrl={(base_url) => setLlm({ ...llm, base_url })} />
            <div className="grid gap-4 md:grid-cols-2">
              <Field><FieldLabel>Max output tokens</FieldLabel><Input type="number" min={512} value={llm.max_tokens} onChange={(e) => setLlm({ ...llm, max_tokens: Number(e.target.value) })} /></Field>
              <Field><FieldLabel>Temperature <span className="font-normal text-muted-foreground">(blank = model default)</span></FieldLabel><Input type="number" step="0.1" min={0} max={2} value={llm.temperature ?? ""} onChange={(e) => setLlm({ ...llm, temperature: e.target.value === "" ? null : Number(e.target.value) })} /></Field>
            </div>
          </FieldGroup>
        </CardContent>
        <CardFooter className="flex-wrap justify-between gap-3 border-t pt-6">
          <TestLlm target="llm" />
          <Button disabled={update.isPending || !llm.model} onClick={() => update.mutate({ llm: { ...llm, api_key: llmKey } }, { onSuccess: () => setLlmKey(null) })}><Save /> Save</Button>
        </CardFooter>
      </Card>

      <Card className="shadow-xs">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><ShieldCheck className="size-5 text-teal-600" /> Compliance judge · Jev <Pill tone={judge.enabled ? (d.judge.api_key_set ? "success" : "warning") : "neutral"}>{judge.enabled ? (d.judge.api_key_set ? "Active" : "Needs a key") : "Disabled"}</Pill></CardTitle>
          <CardDescription>TypeSafe Jev makes fast typed decisions: it judges every page's content and verifies AI-written changes before autopilot applies them.</CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <Field orientation="horizontal"><Switch checked={judge.enabled} onCheckedChange={(v) => setJudge({ ...judge, enabled: v })} /><FieldLabel className="font-normal">Enable the judge</FieldLabel></Field>
            <ModelFields providers={d.providers} model={judge.model} setModel={(model) => setJudge({ ...judge, model })} apiKey={judgeKey} setApiKey={setJudgeKey} keySet={d.judge.api_key_set} baseUrl={judge.base_url} setBaseUrl={(base_url) => setJudge({ ...judge, base_url })} />
            <Field>
              <FieldLabel>Minimum confidence · {Math.round(judge.min_confidence * 100)}%</FieldLabel>
              <Slider value={[judge.min_confidence]} min={0.3} max={0.95} step={0.05} onValueChange={([v]) => setJudge({ ...judge, min_confidence: v })} />
              <FieldDescription>Judgements below this confidence don't create findings.</FieldDescription>
            </Field>
          </FieldGroup>
        </CardContent>
        <CardFooter className="flex-wrap justify-between gap-3 border-t pt-6">
          <TestLlm target="judge" />
          <Button disabled={update.isPending} onClick={() => update.mutate({ judge: { ...judge, api_key: judgeKey } }, { onSuccess: () => setJudgeKey(null) })}><Save /> Save</Button>
        </CardFooter>
      </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
