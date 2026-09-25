import { useEffect, useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { api, ApiError, errorMessage } from "@/lib/api";
import { qk, useMe, usePacks } from "@/lib/hooks";
import { AuthLayout, PasswordInput, StrengthMeter, strength } from "./AuthLayout";

export const PENDING_SITE = "rc:pending-site";

export function SignupPage() {
  const me = useMe();
  const packs = usePacks();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [form, setForm] = useState({ name: "", email: params.get("email") ?? "", password: "", company: "" });
  const [accept, setAccept] = useState(false);
  const [error, setError] = useState<{ field?: string; message: string } | null>(null);
  const [busy, setBusy] = useState(false);

  // A site typed on the landing page is added right after sign-up.
  useEffect(() => {
    const site = params.get("site");
    if (site) try { sessionStorage.setItem(PENDING_SITE, site); } catch { /* storage off */ }
  }, [params]);

  if (me.data) return <Navigate to="/sites" replace />;
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });
  const credits = packs.data?.signup_credits ?? 100;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (strength(form.password).score === 0) return setError({ field: "password", message: "Use at least 10 characters." });
    if (!accept) return setError({ field: "terms", message: "Please accept the terms to continue." });
    setBusy(true);
    setError(null);
    try {
      const res = await api.signup({ ...form, email: form.email.trim(), accept_terms: accept });
      qc.setQueryData(qk.me, res);
      if (res.dev_verify_url) try { sessionStorage.setItem("rc:dev-verify", res.dev_verify_url); } catch { /* ignore */ }
      navigate("/sites", { replace: true });
    } catch (err) {
      const message = errorMessage(err);
      setError({ field: err instanceof ApiError && err.status === 409 ? "email" : /password/i.test(message) ? "password" : undefined, message });
    } finally {
      setBusy(false);
    }
  };

  const err = (f: string) => (error?.field === f ? error.message : null);
  return (
    <AuthLayout title="Hire the crew." subtitle={<>Start free with <b className="text-foreground">{credits} credits</b>, enough for a full audit and a first round of fixes. No card needed.</>}
      caption="Night shift. The desks are ready for your site.">
      <form onSubmit={submit} noValidate>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="name">Your name</FieldLabel>
            <Input id="name" autoComplete="name" className="h-11" value={form.name} onChange={set("name")} autoFocus />
          </Field>
          <Field data-invalid={!!err("email") || undefined}>
            <FieldLabel htmlFor="email">Work email</FieldLabel>
            <Input id="email" type="email" autoComplete="email" className="h-11" value={form.email} onChange={set("email")} required aria-invalid={!!err("email")} />
            {err("email") && <FieldError>{err("email")} {/already exists/.test(err("email")!) && <Link className="underline" to="/login">Sign in</Link>}</FieldError>}
          </Field>
          <Field data-invalid={!!err("password") || undefined}>
            <FieldLabel htmlFor="password">Password</FieldLabel>
            <PasswordInput id="password" autoComplete="new-password" value={form.password} onChange={(password) => setForm({ ...form, password })} invalid={!!err("password")} />
            <StrengthMeter password={form.password} />
            {err("password") && <FieldError>{err("password")}</FieldError>}
          </Field>
          <Field>
            <FieldLabel htmlFor="company">Company or site <span className="font-normal text-muted-foreground">(optional)</span></FieldLabel>
            <Input id="company" autoComplete="organization" className="h-11" value={form.company} onChange={set("company")} />
          </Field>
          <Field orientation="horizontal" data-invalid={!!err("terms") || undefined}>
            <Checkbox id="terms" checked={accept} onCheckedChange={(v) => setAccept(v === true)} aria-invalid={!!err("terms")} />
            <FieldLabel htmlFor="terms" className="font-normal">
              <span>I agree to the <Link to="/terms" target="_blank" className="underline underline-offset-3">Terms</Link> and <Link to="/privacy" target="_blank" className="underline underline-offset-3">Privacy Policy</Link></span>
            </FieldLabel>
          </Field>
          {err("terms") && <FieldError>{err("terms")}</FieldError>}
          {error && !error.field && <FieldError>{error.message}</FieldError>}
          <Button type="submit" size="lg" className="h-11" disabled={busy || !form.email.trim() || !form.password}>{busy && <Spinner />} Create account</Button>
          <FieldDescription className="text-center">
            Already have an account? <Link to="/login" className="font-medium text-foreground underline underline-offset-4">Sign in</Link>
          </FieldDescription>
        </FieldGroup>
      </form>
    </AuthLayout>
  );
}
