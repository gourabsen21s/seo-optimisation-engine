import { lazy, Suspense, useEffect, useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { LogoMark } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { BRAND } from "@/config/brand";
import { SCENE } from "@/features/office/layout";
import { api, ApiError, auth, errorMessage } from "@/lib/api";
import { useApiKey } from "@/lib/hooks";

// Loaded on demand so the office renderer stays out of the entry bundle.
const OfficeWorld = lazy(() => import("@/features/office/OfficeWorld").then((m) => ({ default: m.OfficeWorld })));
const NIGHT_SHIFT = ["auditor", "rank_analyst"] as const;
const clockNow = () => new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });

/** The office while you were away: the product's own renderer, always on the night palette. */
function NightShift() {
  const [time, setTime] = useState(clockNow);
  useEffect(() => {
    const id = setInterval(() => setTime(clockNow()), 30_000);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="dark relative hidden overflow-hidden bg-[#0a0e17] lg:block">
      <svg viewBox={`0 0 ${SCENE.w} ${SCENE.h}`} preserveAspectRatio="xMidYMid slice" className="absolute inset-0 size-full" role="img" aria-label="The Rankcrew office on the night shift: Theo re-crawls while Ravi checks the rankings.">
        <g className="office-scene">
          <Suspense fallback={null}><OfficeWorld dark working={NIGHT_SHIFT} /></Suspense>
        </g>
      </svg>
      {/* density only where the caption sits */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-[#0a0e17]/90 to-transparent" />
      <p className="absolute bottom-8 left-8 flex items-center gap-3 rounded-xl border border-white/10 bg-[#0a0e17]/80 px-4 py-2.5 text-sm text-[#edf1f7] shadow-lg">
        <span className="size-2 rounded-full bg-emerald-400 ring-3 ring-emerald-400/20" aria-hidden />
        <span className="font-semibold text-[#ff8a3d] tabular-nums">{time}</span>
        Night shift. Theo re-crawls, Ravi checks the rankings.
      </p>
    </div>
  );
}

export function LoginPage() {
  const existing = useApiKey();
  const navigate = useNavigate();
  const location = useLocation();
  const [key, setKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const from = (location.state as { from?: string } | null)?.from ?? "/sites";

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
    <div className="grid min-h-svh bg-background lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
      <NightShift />
      <div className="flex flex-col gap-6 p-6 md:p-10">
        <div className="flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 font-heading text-base font-semibold">
            <LogoMark className="size-7 rounded-lg bg-primary text-primary-foreground [&_svg]:size-4" />
            {BRAND.name}
          </Link>
          <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-3.5" /> How it works
          </Link>
        </div>
        <div className="flex flex-1 items-center justify-center">
          <div className="grid w-full max-w-sm gap-8">
            <div className="grid gap-2">
              <h1 className="rc-title text-4xl leading-none font-semibold"><span>Welcome back.</span></h1>
              <p className="text-muted-foreground">Sign in with your workspace API key to see what the crew did while you were away.</p>
            </div>
            <form onSubmit={submit}>
              <FieldGroup>
                <Field data-invalid={!!error || undefined}>
                  <FieldLabel htmlFor="api-key">API key</FieldLabel>
                  <Input id="api-key" type="password" autoComplete="current-password" className="h-11" value={key} onChange={(e) => setKey(e.target.value)} autoFocus required aria-invalid={!!error} />
                  {error && <FieldError>{error}</FieldError>}
                </Field>
                <Field>
                  <Button type="submit" size="lg" className="h-11" disabled={busy || !key.trim()}>{busy && <Spinner />} Sign in</Button>
                  <FieldDescription>
                    Keys are set on the server with <code>SEO_API_KEYS</code>. Run <code>seo-engine gen-secrets</code> to make one.
                  </FieldDescription>
                </Field>
              </FieldGroup>
            </form>
          </div>
        </div>
        <p className="text-center text-xs text-muted-foreground">{BRAND.tagline}. Self-hosted.</p>
      </div>
    </div>
  );
}
