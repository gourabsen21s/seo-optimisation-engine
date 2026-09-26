import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, MailCheck, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { api, errorMessage } from "@/lib/api";
import { qk, useMe } from "@/lib/hooks";
import { AuthLayout, PasswordInput, StrengthMeter, strength } from "./AuthLayout";

function DevLink({ href, label }: { href?: string | null; label: string }) {
  if (!href) return null;
  return (
    <p className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
      No mail server is configured, so here is the link directly (development only): <a className="font-medium break-all text-foreground underline" href={href}>{label}</a>
    </p>
  );
}

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState<{ dev?: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await api.forgotPassword(email.trim());
      setSent({ dev: r.dev_reset_url });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  if (sent) {
    return (
      <AuthLayout title="Check your inbox." subtitle={<>If an account exists for <b className="text-foreground">{email}</b>, we sent a link to reset the password. It works for one hour.</>}>
        <div className="grid gap-4">
          <MailCheck className="size-10 text-primary" aria-hidden />
          <DevLink href={sent.dev} label="Reset password" />
          <Button variant="outline" asChild><Link to="/login">Back to sign in</Link></Button>
        </div>
      </AuthLayout>
    );
  }
  return (
    <AuthLayout title="Reset your password." subtitle="Enter your account email and we will send you a link.">
      <form onSubmit={submit} noValidate>
        <FieldGroup>
          <Field data-invalid={!!error || undefined}>
            <FieldLabel htmlFor="email">Email</FieldLabel>
            <Input id="email" type="email" autoComplete="email" className="h-11" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus required />
            {error && <FieldError>{error}</FieldError>}
          </Field>
          <Button type="submit" size="lg" className="h-11" disabled={busy || !email.trim()}>{busy && <Spinner />} Send reset link</Button>
          <p className="text-center text-sm text-muted-foreground"><Link to="/login" className="underline underline-offset-4">Back to sign in</Link></p>
        </FieldGroup>
      </form>
    </AuthLayout>
  );
}

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (strength(pw).score === 0) return setError("Use at least 10 characters.");
    if (pw !== pw2) return setError("The two passwords do not match.");
    setBusy(true);
    setError(null);
    try {
      qc.setQueryData(qk.me, await api.resetPassword(token, pw));
      navigate("/sites", { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  if (!token) {
    return (
      <AuthLayout title="Link missing." subtitle="Open the link from your email again, or request a new one.">
        <Button asChild><Link to="/forgot-password">Request a new link</Link></Button>
      </AuthLayout>
    );
  }
  return (
    <AuthLayout title="Choose a new password." subtitle="You will stay signed in on this device; other sessions are signed out.">
      <form onSubmit={submit} noValidate>
        <FieldGroup>
          <Field data-invalid={!!error || undefined}>
            <FieldLabel htmlFor="pw">New password</FieldLabel>
            <PasswordInput id="pw" autoComplete="new-password" value={pw} onChange={setPw} autoFocus />
            <StrengthMeter password={pw} />
          </Field>
          <Field data-invalid={!!error || undefined}>
            <FieldLabel htmlFor="pw2">Repeat it</FieldLabel>
            <PasswordInput id="pw2" autoComplete="new-password" value={pw2} onChange={setPw2} />
            {error && <FieldError>{error} {/expired|invalid/i.test(error) && <Link className="underline" to="/forgot-password">Get a new link</Link>}</FieldError>}
          </Field>
          <Button type="submit" size="lg" className="h-11" disabled={busy || !pw || !pw2}>{busy && <Spinner />} Set password</Button>
        </FieldGroup>
      </form>
    </AuthLayout>
  );
}

export function VerifyEmailPage() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const qc = useQueryClient();
  const me = useMe();
  const [state, setState] = useState<{ ok: boolean; message: string } | null>(null);
  const once = useRef(false);
  useEffect(() => {
    if (once.current || !token) return;
    once.current = true;
    api.verifyEmail(token)
      .then((r) => { setState({ ok: true, message: r.email }); qc.invalidateQueries({ queryKey: qk.me }); })
      .catch((e) => setState({ ok: false, message: errorMessage(e) }));
  }, [token, qc]);
  const next = me.data ? "/sites" : "/login";
  if (!token) {
    return (
      <AuthLayout title="Link missing." subtitle="Open the confirmation link from your email again.">
        <Button asChild><Link to={next}>Continue</Link></Button>
      </AuthLayout>
    );
  }
  if (!state) return <AuthLayout title="Confirming…" subtitle="One moment."><Spinner className="size-6" /></AuthLayout>;
  return state.ok ? (
    <AuthLayout title="Email confirmed." subtitle={<><b className="text-foreground">{state.message}</b> is confirmed. The crew can start work.</>} caption="The lights are on. The crew is ready.">
      <div className="grid gap-4">
        <CheckCircle2 className="size-10 text-emerald-500" aria-hidden />
        <Button size="lg" asChild><Link to={next}>{me.data ? "Go to your crew" : "Sign in"}</Link></Button>
      </div>
    </AuthLayout>
  ) : (
    <AuthLayout title="That link did not work." subtitle={state.message}>
      <div className="grid gap-4">
        <XCircle className="size-10 text-destructive" aria-hidden />
        <Button asChild><Link to={next}>{me.data ? "Back to your crew (resend from the banner)" : "Sign in to resend"}</Link></Button>
      </div>
    </AuthLayout>
  );
}
