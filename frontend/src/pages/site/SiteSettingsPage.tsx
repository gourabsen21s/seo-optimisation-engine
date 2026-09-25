import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, CheckCircle2, Globe2, PlugZap, Save, Settings2, Trash2, UserRound, XCircle, Code2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/blocks";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldSeparator } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { AUTOPILOT_OPTIONS } from "@/features/sites/autopilot";
import { api, errorMessage } from "@/lib/api";
import { useConnectorFields, useDeleteSite, useSaveConnector, useSaveGsc, useUpdateSite } from "@/lib/hooks";
import type { AutopilotMode, ConnectorType, Niche, SiteProfile, TestResult } from "@/lib/types";
import { splitList } from "@/lib/utils";
import { useSiteCtx } from "./SiteLayout";

function TestButton({ run }: { run: () => Promise<TestResult> }) {
  const [state, setState] = useState<{ busy: boolean; res?: TestResult }>({ busy: false });
  return (
    <div className="flex items-center gap-2">
      <Button type="button" variant="outline" disabled={state.busy} onClick={async () => {
        setState({ busy: true });
        try { setState({ busy: false, res: await run() }); } catch (e) { setState({ busy: false, res: { ok: false, error: errorMessage(e) } }); }
      }}>{state.busy ? <Spinner /> : <PlugZap />} Test connection</Button>
      {state.res && (state.res.ok
        ? <span className="flex items-center gap-1 text-sm text-emerald-600"><CheckCircle2 className="size-4" /> Connected</span>
        : <span className="flex items-center gap-1 text-sm text-red-600"><XCircle className="size-4" /> {state.res.error ?? "Failed"}</span>)}
    </div>
  );
}

function General() {
  const { site, siteId } = useSiteCtx();
  const update = useUpdateSite(siteId);
  const [f, setF] = useState({ name: site.name, autopilot: site.autopilot, audit_every_hours: site.audit_every_hours, cycle_every_hours: site.cycle_every_hours, auto_publish_content: site.auto_publish_content, obey_robots: site.obey_robots, max_pages: site.max_pages ?? "" as number | "" });
  return (
    <Card className="shadow-xs">
      <CardHeader><CardTitle>General</CardTitle><CardDescription>How the crew works on this website.</CardDescription></CardHeader>
      <CardContent>
        <FieldGroup>
          <Field><FieldLabel>Display name</FieldLabel><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <Field>
            <FieldLabel>Autopilot</FieldLabel>
            <RadioGroup value={f.autopilot} onValueChange={(v) => setF({ ...f, autopilot: v as AutopilotMode })} className="grid gap-2 md:grid-cols-3">
              {AUTOPILOT_OPTIONS.map((o) => (
                <label key={o.value} className="flex cursor-pointer flex-col gap-1.5 rounded-xl border p-3 transition-colors has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5">
                  <span className="flex items-center gap-2 text-sm font-medium"><RadioGroupItem value={o.value} /><o.icon className="size-4 text-primary" />{o.label.split(" — ")[0]}</span>
                  <span className="text-xs text-muted-foreground">{o.description}</span>
                </label>
              ))}
            </RadioGroup>
          </Field>
          <div className="grid gap-4 md:grid-cols-3">
            <Field><FieldLabel>Audit every (hours)</FieldLabel><Input type="number" min={0} value={f.audit_every_hours} onChange={(e) => setF({ ...f, audit_every_hours: Number(e.target.value) })} /><FieldDescription>0 = manual only</FieldDescription></Field>
            <Field><FieldLabel>Optimisation cycle every (hours)</FieldLabel><Input type="number" min={0} value={f.cycle_every_hours} onChange={(e) => setF({ ...f, cycle_every_hours: Number(e.target.value) })} /><FieldDescription>Runs when autopilot is on</FieldDescription></Field>
            <Field><FieldLabel>Max pages per crawl</FieldLabel><Input type="number" min={1} placeholder="Server default" value={f.max_pages} onChange={(e) => setF({ ...f, max_pages: e.target.value === "" ? "" : Number(e.target.value) })} /></Field>
          </div>
          <FieldSeparator />
          <Field orientation="horizontal">
            <Switch checked={f.obey_robots} onCheckedChange={(v) => setF({ ...f, obey_robots: v })} />
            <div><FieldLabel>Respect robots.txt while crawling</FieldLabel><FieldDescription>Turn off only for your own site if robots.txt blocks crawlers.</FieldDescription></div>
          </Field>
          <Field orientation="horizontal">
            <Switch checked={f.auto_publish_content} onCheckedChange={(v) => setF({ ...f, auto_publish_content: v })} />
            <div><FieldLabel>Auto-publish AI-written articles</FieldLabel><FieldDescription>Off = drafts for your review.</FieldDescription></div>
          </Field>
          {f.auto_publish_content && (
            <Alert variant="destructive"><AlertTriangle /><AlertTitle>Risky for AdSense</AlertTitle><AlertDescription>The approval manual (R28) warns that unedited AI content leads to “low value content” rejections.</AlertDescription></Alert>
          )}
        </FieldGroup>
      </CardContent>
      <CardFooter className="justify-end border-t pt-6">
        <Button disabled={update.isPending} onClick={() => update.mutate({ ...f, max_pages: f.max_pages === "" ? null : f.max_pages })}><Save /> Save changes</Button>
      </CardFooter>
    </Card>
  );
}

function Connector() {
  const { site, siteId } = useSiteCtx();
  const fields = useConnectorFields();
  const save = useSaveConnector(siteId);
  const [type, setType] = useState<ConnectorType>(site.connector_type ?? "wordpress");
  const [cfg, setCfg] = useState<Record<string, unknown>>({ ...site.connector_public });
  useEffect(() => { if (type !== site.connector_type) setCfg({}); else setCfg({ ...site.connector_public }); }, [type, site.connector_type, site.connector_public]);
  const defs = fields.data?.[type] ?? [];
  return (
    <Card className="shadow-xs">
      <CardHeader><CardTitle>Connector</CardTitle><CardDescription>Where approved fixes are applied. Secrets are encrypted at rest.</CardDescription></CardHeader>
      <CardContent>
        <FieldGroup>
          <Field>
            <FieldLabel>Type</FieldLabel>
            <Select value={type} onValueChange={(v) => setType(v as ConnectorType)}>
              <SelectTrigger className="w-full md:w-80"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="wordpress">WordPress (REST API + bridge plugin)</SelectItem><SelectItem value="github">GitHub (pull requests + code edits)</SelectItem><SelectItem value="local">Local files (+ code edits)</SelectItem></SelectContent>
            </Select>
          </Field>
          {(type === "github" || type === "local") && <Alert><Code2 /><AlertTitle>Unlocks source-code edits</AlertTitle><AlertDescription>Ezra, your Web Engineer, can change framework code (Next.js, Astro, Hugo, Jekyll…) in this repository. Every change is reviewed as a diff and ships as a pull request.</AlertDescription></Alert>}
          {type === "wordpress" && <Alert><Globe2 /><AlertTitle>Install the SEO Engine Bridge plugin</AlertTitle><AlertDescription>From the repo's <code>wordpress/</code> folder — it makes SEO fields, JSON-LD and robots/ads/llms.txt writable over REST.</AlertDescription></Alert>}
          {defs.map((d) => d.type === "checkbox" ? (
            <Field key={d.name} orientation="horizontal">
              <Checkbox checked={Boolean(cfg[d.name] ?? d.default)} onCheckedChange={(v) => setCfg({ ...cfg, [d.name]: v === true })} />
              <FieldLabel className="font-normal">{d.label}</FieldLabel>
            </Field>
          ) : (
            <Field key={d.name}>
              <FieldLabel>{d.label}{d.required && <span className="text-red-500"> *</span>}</FieldLabel>
              <Input type={d.type === "password" ? "password" : d.type === "url" ? "url" : "text"} value={String(cfg[d.name] ?? "")} onChange={(e) => setCfg({ ...cfg, [d.name]: e.target.value })}
                placeholder={d.type === "password" && site.connector_type === type && site.connector_configured ? "•••••••• (unchanged)" : String(d.default ?? "")} />
              {d.help && <FieldDescription>{d.help}</FieldDescription>}
            </Field>
          ))}
        </FieldGroup>
      </CardContent>
      <CardFooter className="flex-wrap justify-between gap-3 border-t pt-6">
        <TestButton run={() => api.testConnector(siteId)} />
        <Button disabled={save.isPending} onClick={() => save.mutate({ type, config: cfg })}><Save /> Save connector</Button>
      </CardFooter>
    </Card>
  );
}

function SearchConsole() {
  const { site, siteId } = useSiteCtx();
  const save = useSaveGsc(siteId);
  const [property, setProperty] = useState(site.gsc_property ?? "");
  const [json, setJson] = useState("");
  return (
    <Card className="shadow-xs">
      <CardHeader><CardTitle>Google Search Console</CardTitle><CardDescription>Unlocks ranking data for Ravi, impact measurement and automatic rollback.</CardDescription></CardHeader>
      <CardContent>
        <FieldGroup>
          <Field><FieldLabel>Property</FieldLabel><Input value={property} onChange={(e) => setProperty(e.target.value)} placeholder="sc-domain:example.com or https://example.com/" /></Field>
          <Field>
            <FieldLabel>Service account JSON key</FieldLabel>
            <Textarea value={json} onChange={(e) => setJson(e.target.value)} rows={6} className="font-mono text-xs" placeholder={site.gsc_configured ? "Stored — paste a new key to replace it" : '{ "type": "service_account", … }'} />
            <FieldDescription>Create a service account in Google Cloud, enable the Search Console API, and add its email as a Full user on the property.</FieldDescription>
          </Field>
        </FieldGroup>
      </CardContent>
      <CardFooter className="flex-wrap justify-between gap-3 border-t pt-6">
        <TestButton run={() => api.testGsc(siteId)} />
        <Button disabled={save.isPending || !property.trim()} onClick={() => save.mutate({ property: property.trim(), json })}><Save /> Save</Button>
      </CardFooter>
    </Card>
  );
}

function Profile() {
  const { site, siteId } = useSiteCtx();
  const update = useUpdateSite(siteId);
  const [p, setP] = useState<SiteProfile>(site.profile);
  const set = (k: keyof SiteProfile, v: unknown) => setP({ ...p, [k]: v });
  const text = (k: keyof SiteProfile, label: string, placeholder = "") => (
    <Field><FieldLabel>{label}</FieldLabel><Input value={String(p[k] ?? "")} onChange={(e) => set(k, e.target.value)} placeholder={placeholder} /></Field>
  );
  return (
    <Card className="shadow-xs">
      <CardHeader><CardTitle>Publisher profile</CardTitle><CardDescription>Used for legal page drafts, structured data and every employee's briefing.</CardDescription></CardHeader>
      <CardContent>
        <FieldGroup>
          <div className="grid gap-4 md:grid-cols-2">
            {text("name", "Site name")}{text("owner_name", "Legal owner name")}{text("email", "Contact email")}{text("publisher_id", "AdSense publisher ID", "pub-0000000000000000")}
            {text("city", "City")}{text("country", "Country")}{text("author_name", "Main author")}{text("author_url", "Author page URL")}{text("logo_url", "Logo URL")}{text("language", "Language", "en")}
          </div>
          <Field><FieldLabel>Description</FieldLabel><Textarea rows={2} value={p.description} onChange={(e) => set("description", e.target.value)} /></Field>
          <Field><FieldLabel>Author bio</FieldLabel><Textarea rows={2} value={p.author_bio} onChange={(e) => set("author_bio", e.target.value)} /></Field>
          <div className="grid gap-4 md:grid-cols-2">
            <Field>
              <FieldLabel>Niche</FieldLabel>
              <Select value={p.niche} onValueChange={(v) => set("niche", v as Niche)}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="general">General</SelectItem><SelectItem value="health">Health & wellness</SelectItem><SelectItem value="finance">Finance</SelectItem><SelectItem value="news">News</SelectItem></SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel>Target keywords</FieldLabel>
              <Input value={p.target_keywords.join(", ")} onChange={(e) => set("target_keywords", splitList(e.target.value))} placeholder="yoga sutras, pranayama, …" />
            </Field>
          </div>
          <Field><FieldLabel>Social profiles</FieldLabel><Textarea rows={2} value={p.social_links.join("\n")} onChange={(e) => set("social_links", splitList(e.target.value))} placeholder="One URL per line" /></Field>
          <Field orientation="horizontal"><Switch checked={p.block_ai_training} onCheckedChange={(v) => set("block_ai_training", v)} /><FieldLabel className="font-normal">Block AI training crawlers in robots.txt (doesn't affect Search or AdSense)</FieldLabel></Field>
        </FieldGroup>
      </CardContent>
      <CardFooter className="justify-end border-t pt-6"><Button disabled={update.isPending} onClick={() => update.mutate({ profile: p })}><Save /> Save profile</Button></CardFooter>
    </Card>
  );
}

function Danger() {
  const { site, siteId } = useSiteCtx();
  const del = useDeleteSite();
  const navigate = useNavigate();
  const [confirm, setConfirm] = useState("");
  return (
    <Card className="border-red-500/30 shadow-xs">
      <CardHeader><CardTitle className="text-red-600">Delete website</CardTitle><CardDescription>Removes audits, fixes, tasks, reports and the crew's memory for this site. This can't be undone.</CardDescription></CardHeader>
      <CardFooter>
        <AlertDialog>
          <AlertDialogTrigger asChild><Button variant="destructive"><Trash2 /> Delete {site.name}</Button></AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader><AlertDialogTitle>Delete {site.name}?</AlertDialogTitle><AlertDialogDescription>Type the site name to confirm.</AlertDialogDescription></AlertDialogHeader>
            <Input value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder={site.name} />
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction disabled={confirm !== site.name} onClick={() => del.mutate(siteId, { onSuccess: () => { toast.success("Website deleted"); navigate("/"); } })}>Delete forever</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardFooter>
    </Card>
  );
}

export default function SiteSettingsPage() {
  return (
    <div className="grid gap-5">
      <PageHeader icon={<Settings2 />} title="Site settings" description="Autopilot, connections and the publisher profile." />
      <Tabs defaultValue="general" className="gap-5">
        <TabsList className="w-full justify-start overflow-x-auto md:w-fit">
          <TabsTrigger value="general"><Settings2 /> General</TabsTrigger>
          <TabsTrigger value="connector"><PlugZap /> Connector</TabsTrigger>
          <TabsTrigger value="gsc"><Globe2 /> Search Console</TabsTrigger>
          <TabsTrigger value="profile"><UserRound /> Profile</TabsTrigger>
          <TabsTrigger value="danger"><Trash2 /> Danger zone</TabsTrigger>
        </TabsList>
        <TabsContent value="general"><General /></TabsContent>
        <TabsContent value="connector"><Connector /></TabsContent>
        <TabsContent value="gsc"><SearchConsole /></TabsContent>
        <TabsContent value="profile"><Profile /></TabsContent>
        <TabsContent value="danger"><Danger /></TabsContent>
      </Tabs>
    </div>
  );
}
