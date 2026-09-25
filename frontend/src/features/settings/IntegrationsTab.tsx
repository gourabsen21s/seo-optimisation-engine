import { useEffect, useState } from "react";
import { Gauge, Globe2, Radar, Save, Search, Send } from "lucide-react";
import { Pill } from "@/components/common/badges";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useUpdateIntegrations } from "@/lib/hooks";
import type { IntegrationsSettings, SerpProvider } from "@/lib/types";
import { SecretField, TestIntegration, touched } from "./fields";

const PROVIDERS: { value: SerpProvider; label: string; hint: string }[] = [
  { value: "serper", label: "Serper.dev — Google results", hint: "Fast and inexpensive. serper.dev" },
  { value: "serpapi", label: "SerpAPI — Google results", hint: "Mature API with many engines. serpapi.com" },
  { value: "brave", label: "Brave Search API", hint: "Independent index — an approximation of Google. brave.com/search/api" },
];

function Status({ ok, on = "Connected", off = "Not connected" }: { ok: boolean; on?: string; off?: string }) {
  return <Pill tone={ok ? "success" : "neutral"}>{ok ? on : off}</Pill>;
}

export function IntegrationsTab({ data }: { data: IntegrationsSettings }) {
  const save = useUpdateIntegrations();
  const [serp, setSerp] = useState({ provider: data.serp_provider, country: data.serp_country, language: data.serp_language });
  const [serpKey, setSerpKey] = useState<string | undefined>();
  const [oprKey, setOprKey] = useState<string | undefined>();
  const [psiKey, setPsiKey] = useState<string | undefined>();
  const [indexNow, setIndexNow] = useState<string | undefined>();
  useEffect(() => setSerp({ provider: data.serp_provider, country: data.serp_country, language: data.serp_language }), [data]);
  const reset = () => { setSerpKey(undefined); setOprKey(undefined); setPsiKey(undefined); setIndexNow(undefined); };

  return (
    <div className="grid gap-6">
      <Card className="shadow-xs">
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2"><Search className="size-4" /> Live search results <Status ok={!!data.serp_provider && data.serp_api_key_set} /></CardTitle>
          <CardDescription>Lets the crew see real results pages: live rank checks, competitor analysis, content gaps, People Also Ask and link prospecting. Without it, rankings come from Search Console only.</CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <Field>
              <FieldLabel>Provider</FieldLabel>
              <Select value={serp.provider || "none"} onValueChange={(v) => setSerp({ ...serp, provider: (v === "none" ? "" : v) as SerpProvider })}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {PROVIDERS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <FieldDescription>{PROVIDERS.find((p) => p.value === serp.provider)?.hint ?? "We never scrape Google directly."}</FieldDescription>
            </Field>
            {serp.provider && (
              <>
                <SecretField id="serp-key" label="API key" value={serpKey} onChange={setSerpKey} isSet={data.serp_api_key_set} />
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field><FieldLabel htmlFor="gl">Country</FieldLabel><Input id="gl" value={serp.country} maxLength={5} onChange={(e) => setSerp({ ...serp, country: e.target.value.toLowerCase() })} /><FieldDescription>Two-letter code, e.g. us, gb, in</FieldDescription></Field>
                  <Field><FieldLabel htmlFor="hl">Language</FieldLabel><Input id="hl" value={serp.language} maxLength={10} onChange={(e) => setSerp({ ...serp, language: e.target.value.toLowerCase() })} /><FieldDescription>e.g. en, de, hi</FieldDescription></Field>
                </div>
              </>
            )}
          </FieldGroup>
        </CardContent>
        <CardFooter className="flex-wrap justify-between gap-3 border-t">
          <TestIntegration target="serp" />
          <Button size="sm" disabled={save.isPending} onClick={() => save.mutate({ serp_provider: serp.provider, serp_country: serp.country, serp_language: serp.language, ...touched({ serp_api_key: serpKey }) }, { onSuccess: reset })}><Save /> Save</Button>
        </CardFooter>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="shadow-xs">
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center gap-2"><Radar className="size-4" /> Domain authority <Status ok={data.openpagerank_api_key_set} /></CardTitle>
            <CardDescription>Open PageRank scores help Kai qualify link prospects and benchmark competitors. Free key at openpagerank.com.</CardDescription>
          </CardHeader>
          <CardContent><SecretField id="opr" label="Open PageRank key" value={oprKey} onChange={setOprKey} isSet={data.openpagerank_api_key_set} /></CardContent>
          <CardFooter className="flex-wrap justify-between gap-3 border-t">
            <TestIntegration target="openpagerank" />
            <Button size="sm" disabled={save.isPending} onClick={() => save.mutate(touched({ openpagerank_api_key: oprKey }), { onSuccess: reset })}><Save /> Save</Button>
          </CardFooter>
        </Card>

        <Card className="shadow-xs">
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center gap-2"><Gauge className="size-4" /> PageSpeed Insights <Status ok={data.pagespeed_api_key_set} on="Key set" off="Keyless (limited)" /></CardTitle>
            <CardDescription>Core Web Vitals for Nora and the audit. Works without a key at low volume; a Google Cloud key raises the quota.</CardDescription>
          </CardHeader>
          <CardContent><SecretField id="psi" label="API key" value={psiKey} onChange={setPsiKey} isSet={data.pagespeed_api_key_set} /></CardContent>
          <CardFooter className="flex-wrap justify-between gap-3 border-t">
            <TestIntegration target="pagespeed" />
            <Button size="sm" disabled={save.isPending} onClick={() => save.mutate(touched({ pagespeed_api_key: psiKey }), { onSuccess: reset })}><Save /> Save</Button>
          </CardFooter>
        </Card>
      </div>

      <Card className="shadow-xs">
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2"><Send className="size-4" /> IndexNow <Status ok={data.indexnow_key_set} on="Enabled" off="Off" /></CardTitle>
          <CardDescription>Instantly notifies Bing, Yandex, Seznam and others when pages change. Nora proposes hosting the key file on your site automatically. Google uses your sitemap via Search Console instead.</CardDescription>
        </CardHeader>
        <CardContent>
          <SecretField id="indexnow" label="IndexNow key" value={indexNow} onChange={setIndexNow} isSet={data.indexnow_key_set} placeholder="8–128 characters (letters, numbers, dashes)"
            description={<>Any random string, e.g. <button type="button" className="underline underline-offset-4" onClick={() => setIndexNow(crypto.randomUUID().replace(/-/g, ""))}>generate one</button>.</>} />
        </CardContent>
        <CardFooter className="justify-end border-t">
          <Button size="sm" disabled={save.isPending} onClick={() => save.mutate(touched({ indexnow_key: indexNow }), { onSuccess: reset })}><Save /> Save</Button>
        </CardFooter>
      </Card>

      <p className="flex items-center gap-2 text-xs text-muted-foreground"><Globe2 className="size-3.5" /> Keys are encrypted at rest and never shown again after saving.</p>
    </div>
  );
}
