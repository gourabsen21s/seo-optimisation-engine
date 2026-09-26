import { useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { Globe, Plus, Rocket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useCreateSite } from "@/lib/hooks";
import type { AutopilotMode } from "@/lib/types";
import { AUTOPILOT_OPTIONS } from "./autopilot";

export function AddSiteDialog({ trigger }: { trigger?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  // A site typed on the landing page before signing up opens here, prefilled, once.
  useEffect(() => {
    try {
      const pending = sessionStorage.getItem("rc:pending-site");
      if (pending) { sessionStorage.removeItem("rc:pending-site"); setUrl(pending); setOpen(true); }
    } catch { /* storage off */ }
  }, []);
  const [name, setName] = useState("");
  const [autopilot, setAutopilot] = useState<AutopilotMode>("off");
  const [start, setStart] = useState(true);
  const create = useCreateSite();
  const navigate = useNavigate();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    create.mutate({ url: url.trim(), name: name.trim() || undefined, autopilot, start_audit: start }, {
      onSuccess: (res) => {
        setOpen(false);
        setUrl("");
        setName("");
        navigate(`/sites/${res.site.id}/overview`);
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger ?? <Button><Plus /> Add website</Button>}</DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={submit} className="grid gap-5">
          <DialogHeader>
            <div className="mb-1 flex size-11 items-center justify-center rounded-xl bg-primary text-primary-foreground"><Rocket className="size-5" /></div>
            <DialogTitle>Hire a crew for a new website</DialogTitle>
            <DialogDescription>Theo crawls and audits it first; then the team can start improving it.</DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="site-url">Website URL</FieldLabel>
              <InputGroup>
                <InputGroupAddon><Globe /></InputGroupAddon>
                <InputGroupInput id="site-url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com" required autoFocus />
              </InputGroup>
            </Field>
            <Field>
              <FieldLabel htmlFor="site-name">Display name <span className="font-normal text-muted-foreground">(optional)</span></FieldLabel>
              <Input id="site-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="My blog" />
            </Field>
            <Field>
              <FieldLabel>Autopilot</FieldLabel>
              <RadioGroup value={autopilot} onValueChange={(v) => setAutopilot(v as AutopilotMode)} className="grid gap-2">
                {AUTOPILOT_OPTIONS.map((o) => (
                  <label key={o.value} className="flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5">
                    <RadioGroupItem value={o.value} className="mt-0.5" />
                    <span className="grid gap-0.5">
                      <span className="flex items-center gap-2 text-sm font-medium"><o.icon className="size-4 text-primary" />{o.label}</span>
                      <span className="text-xs text-muted-foreground">{o.description}</span>
                    </span>
                  </label>
                ))}
              </RadioGroup>
              <FieldDescription>You can change this any time in Site settings.</FieldDescription>
            </Field>
            <Field orientation="horizontal">
              <Checkbox id="start-audit" checked={start} onCheckedChange={(v) => setStart(v === true)} />
              <FieldLabel htmlFor="start-audit" className="font-normal">Run the first audit right away</FieldLabel>
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={create.isPending || url.trim().length < 4}>{create.isPending ? "Adding…" : "Add website"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
