import { useState } from "react";
import { CheckCircle2, KeyRound, XCircle, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { Spinner } from "@/components/ui/spinner";
import { api, errorMessage } from "@/lib/api";
import type { IntegrationTarget, LLMTestResult } from "@/lib/types";

/** Password-style input for a stored secret: blank keeps it, "Clear" removes it on save. */
export function SecretField({ label, value, onChange, isSet, placeholder, description, id }: {
  label: string; value: string | undefined; onChange: (v: string | undefined) => void; isSet: boolean;
  placeholder?: string; description?: React.ReactNode; id: string;
}) {
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <InputGroup>
        <InputGroupAddon><KeyRound /></InputGroupAddon>
        <InputGroupInput id={id} type="password" autoComplete="off" value={value ?? ""} onChange={(e) => onChange(e.target.value)}
          placeholder={isSet ? "•••••••• stored — leave blank to keep" : placeholder ?? "Paste a key"} />
        {isSet && (
          <InputGroupAddon align="inline-end">
            <InputGroupButton size="xs" variant="ghost" onClick={() => onChange("")}>Clear</InputGroupButton>
          </InputGroupAddon>
        )}
      </InputGroup>
      <FieldDescription>{value === "" && isSet ? "Will be removed when you save." : description}</FieldDescription>
    </Field>
  );
}

export function TestIntegration({ target, label = "Test" }: { target: IntegrationTarget; label?: string }) {
  const [s, setS] = useState<{ busy: boolean; res?: LLMTestResult }>({ busy: false });
  return (
    <div className="flex min-w-0 items-center gap-2 text-sm">
      <Button variant="outline" size="sm" disabled={s.busy} onClick={async () => {
        setS({ busy: true });
        try { setS({ busy: false, res: await api.testIntegration(target) }); } catch (e) { setS({ busy: false, res: { ok: false, message: errorMessage(e), latency_ms: 0 } }); }
      }}>{s.busy ? <Spinner /> : <Zap />} {label}</Button>
      {s.res && (s.res.ok
        ? <span className="flex min-w-0 items-center gap-1 text-emerald-600 dark:text-emerald-400"><CheckCircle2 className="size-4 shrink-0" /><span className="truncate">{s.res.message}</span></span>
        : <span className="flex min-w-0 items-center gap-1 text-red-600 dark:text-red-400"><XCircle className="size-4 shrink-0" /><span className="truncate">{s.res.message}</span></span>)}
    </div>
  );
}

/** Keep only the secret fields the user actually touched (undefined = untouched). */
export function touched<T extends Record<string, unknown>>(obj: T): Partial<T> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as Partial<T>;
}
