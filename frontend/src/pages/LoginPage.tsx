import { useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { api, errorMessage } from "@/lib/api";
import { qk, useMe } from "@/lib/hooks";
import { AuthLayout, PasswordInput } from "@/pages/auth/AuthLayout";

export function LoginPage() {
  const me = useMe();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const from = (location.state as { from?: string } | null)?.from ?? "/sites";

  if (me.data) return <Navigate to={from} replace />;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api.login(email.trim(), password);
      qc.setQueryData(qk.me, res);
      navigate(from, { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout title="Welcome back." subtitle="Sign in to see what the crew did while you were away.">
      <form onSubmit={submit} noValidate>
        <FieldGroup>
          <Field data-invalid={!!error || undefined}>
            <FieldLabel htmlFor="email">Email</FieldLabel>
            <Input id="email" type="email" autoComplete="email" className="h-11" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus required aria-invalid={!!error} />
          </Field>
          <Field data-invalid={!!error || undefined}>
            <div className="flex items-center justify-between">
              <FieldLabel htmlFor="password">Password</FieldLabel>
              <Link to="/forgot-password" className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">Forgot password?</Link>
            </div>
            <PasswordInput id="password" autoComplete="current-password" value={password} onChange={setPassword} invalid={!!error} />
            {error && <FieldError>{error}</FieldError>}
          </Field>
          <Button type="submit" size="lg" className="h-11" disabled={busy || !email.trim() || !password}>{busy && <Spinner />} Sign in</Button>
          <p className="text-center text-sm text-muted-foreground">
            New to Rankcrew? <Link to="/signup" className="font-medium text-foreground underline underline-offset-4">Start free</Link>
          </p>
        </FieldGroup>
      </form>
    </AuthLayout>
  );
}
