import { useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { LogoMark } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { BRAND } from "@/config/brand";
import { api, ApiError, auth, errorMessage } from "@/lib/api";
import { useApiKey } from "@/lib/hooks";

/** Based on the shadcn login-03 block. */
export function LoginPage() {
  const existing = useApiKey();
  const navigate = useNavigate();
  const location = useLocation();
  const [key, setKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const from = (location.state as { from?: string } | null)?.from ?? "/";

  if (existing) return <Navigate to={from} replace />;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.checkAuth(key.trim());
      auth.setKey(key.trim());
      navigate(from, { replace: true });
    } catch (err) {
      setError(err instanceof ApiError && err.status === 401 ? "That API key was not accepted." : errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 bg-muted p-6 md:p-10">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <Link to="/" className="flex items-center gap-2 self-center font-medium">
          <LogoMark className="size-6 rounded-md bg-primary text-primary-foreground [&_svg]:size-3.5" />
          {BRAND.name}
        </Link>
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader className="text-center">
              <CardTitle className="text-xl">Welcome back</CardTitle>
              <CardDescription>Sign in with your workspace API key</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={submit}>
                <FieldGroup>
                  <Field data-invalid={!!error || undefined}>
                    <FieldLabel htmlFor="api-key">API key</FieldLabel>
                    <Input id="api-key" type="password" autoComplete="current-password" value={key} onChange={(e) => setKey(e.target.value)} autoFocus required aria-invalid={!!error} />
                    {error && <FieldError>{error}</FieldError>}
                  </Field>
                  <Field>
                    <Button type="submit" disabled={busy || !key.trim()}>{busy && <Spinner />} Sign in</Button>
                    <FieldDescription className="text-center">
                      Keys are configured on the server with <code>SEO_API_KEYS</code>.
                    </FieldDescription>
                  </Field>
                </FieldGroup>
              </form>
            </CardContent>
          </Card>
          <FieldDescription className="px-6 text-center">{BRAND.tagline}.</FieldDescription>
        </div>
      </div>
    </div>
  );
}
