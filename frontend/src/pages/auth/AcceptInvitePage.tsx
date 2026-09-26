import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { api, errorMessage } from "@/lib/api";
import { qk, useMe } from "@/lib/hooks";
import { AuthLayout, PasswordInput, StrengthMeter, strength } from "./AuthLayout";

export function AcceptInvitePage() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const me = useMe();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const info = useQuery({ queryKey: ["invite", token], queryFn: () => api.inviteInfo(token), enabled: !!token, retry: false });
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [accept, setAccept] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!token || info.isError) {
    return (
      <AuthLayout title="Invitation not valid." subtitle={info.isError ? errorMessage(info.error) : "Open the link from your invitation email again."}>
        <Button asChild><Link to="/login">Sign in</Link></Button>
      </AuthLayout>
    );
  }
  if (info.isPending) return <AuthLayout title="One moment…"><Spinner className="size-6" /></AuthLayout>;
  if (me.data?.user) {
    return (
      <AuthLayout title="You are signed in." subtitle={<>This invitation is for <b className="text-foreground">{info.data.email}</b>. Each email belongs to one workspace, so sign out first to accept it with a new account.</>}>
        <Button asChild><Link to="/sites">Back to your workspace</Link></Button>
      </AuthLayout>
    );
  }
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (strength(password).score === 0) return setError("Use at least 10 characters.");
    if (!accept) return setError("Please accept the terms to join.");
    setBusy(true);
    setError(null);
    try {
      qc.setQueryData(qk.me, await api.acceptInvite({ token, name, password, accept_terms: accept }));
      navigate("/sites", { replace: true });
    } catch (err) { setError(errorMessage(err)); } finally { setBusy(false); }
  };
  return (
    <AuthLayout title={`Join ${info.data.workspace}.`} subtitle={<>{info.data.invited_by ?? "A teammate"} invited <b className="text-foreground">{info.data.email}</b> as {info.data.role === "owner" ? "an owner" : "a member"}. Choose a password to join.</>}
      caption="Night shift. There is a desk waiting for you.">
      <form onSubmit={submit} noValidate>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="name">Your name</FieldLabel>
            <Input id="name" autoComplete="name" className="h-11" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </Field>
          <Field>
            <FieldLabel htmlFor="email">Email</FieldLabel>
            <Input id="email" className="h-11 bg-muted" value={info.data.email} readOnly />
          </Field>
          <Field data-invalid={!!error || undefined}>
            <FieldLabel htmlFor="password">Password</FieldLabel>
            <PasswordInput id="password" autoComplete="new-password" value={password} onChange={setPassword} />
            <StrengthMeter password={password} />
          </Field>
          <Field orientation="horizontal">
            <Checkbox id="terms" checked={accept} onCheckedChange={(v) => setAccept(v === true)} />
            <FieldLabel htmlFor="terms" className="font-normal"><span>I agree to the <Link to="/terms" target="_blank" className="underline">Terms</Link> and <Link to="/privacy" target="_blank" className="underline">Privacy Policy</Link></span></FieldLabel>
          </Field>
          {error && <FieldError>{error}</FieldError>}
          <Button type="submit" size="lg" className="h-11" disabled={busy || !password}>{busy && <Spinner />} Join workspace</Button>
        </FieldGroup>
      </form>
    </AuthLayout>
  );
}
