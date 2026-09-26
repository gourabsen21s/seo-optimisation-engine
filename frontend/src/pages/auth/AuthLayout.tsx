import { lazy, Suspense, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Eye, EyeOff } from "lucide-react";
import { LogoMark } from "@/components/brand/Logo";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { BRAND } from "@/config/brand";
import { SCENE } from "@/features/office/layout";

// Loaded on demand so the office renderer stays out of the entry bundle.
const OfficeWorld = lazy(() => import("@/features/office/OfficeWorld").then((m) => ({ default: m.OfficeWorld })));
const NIGHT_SHIFT = ["auditor", "rank_analyst"] as const;
const clockNow = () => new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });

/** The office while you were away: the product's own renderer, always on the night palette. */
function NightShift({ caption }: { caption: string }) {
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
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-[#0a0e17]/90 to-transparent" />
      <p className="absolute right-8 bottom-8 left-8 flex max-w-md items-center gap-3 rounded-xl border border-white/10 bg-[#0a0e17]/80 px-4 py-2.5 text-sm text-[#edf1f7] shadow-lg">
        <span className="size-2 shrink-0 rounded-full bg-emerald-400 ring-3 ring-emerald-400/20" aria-hidden />
        <span className="font-semibold text-[#ff8a3d] tabular-nums">{time}</span>
        {caption}
      </p>
    </div>
  );
}

export function AuthLayout({ title, subtitle, children, caption = "Night shift. Theo re-crawls, Ravi checks the rankings.", footer }: {
  title: string;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
  caption?: string;
  footer?: React.ReactNode;
}) {
  return (
    <div className="grid min-h-svh bg-background lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
      <NightShift caption={caption} />
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
        <main className="flex flex-1 items-center justify-center">
          <div className="grid w-full max-w-sm gap-8">
            <div className="grid gap-2">
              <h1 className="rc-title text-4xl leading-none font-semibold"><span>{title}</span></h1>
              {subtitle && <p className="text-muted-foreground">{subtitle}</p>}
            </div>
            {children}
          </div>
        </main>
        <p className="text-center text-xs text-muted-foreground">
          {footer ?? <>{BRAND.tagline}. <Link className="underline underline-offset-3 hover:text-foreground" to="/terms">Terms</Link> · <Link className="underline underline-offset-3 hover:text-foreground" to="/privacy">Privacy</Link></>}
        </p>
      </div>
    </div>
  );
}

/** Password input with a show/hide toggle. */
export function PasswordInput({ id, value, onChange, autoComplete, invalid, autoFocus }: {
  id: string; value: string; onChange: (v: string) => void; autoComplete: string; invalid?: boolean; autoFocus?: boolean;
}) {
  const [show, setShow] = useState(false);
  return (
    <InputGroup className="h-11">
      <InputGroupInput id={id} type={show ? "text" : "password"} autoComplete={autoComplete} value={value} onChange={(e) => onChange(e.target.value)} aria-invalid={invalid} required autoFocus={autoFocus} />
      <InputGroupAddon align="inline-end">
        <InputGroupButton size="icon-xs" aria-label={show ? "Hide password" : "Show password"} onClick={() => setShow((v) => !v)}>
          {show ? <EyeOff /> : <Eye />}
        </InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  );
}

/** Rough strength meter: length and variety. The server enforces the real rules. */
export function strength(pw: string): { score: 0 | 1 | 2 | 3; label: string } {
  if (pw.length < 10) return { score: 0, label: "At least 10 characters" };
  const kinds = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(pw)).length;
  if (pw.length >= 16 || (pw.length >= 12 && kinds >= 3)) return { score: 3, label: "Strong" };
  if (kinds >= 2) return { score: 2, label: "Good" };
  return { score: 1, label: "Okay. Longer is better" };
}

export function StrengthMeter({ password }: { password: string }) {
  const s = strength(password);
  if (!password) return null;
  return (
    <div className="grid gap-1.5" aria-live="polite">
      <div className="grid grid-cols-3 gap-1">
        {[1, 2, 3].map((i) => <span key={i} className={`h-1 rounded-full transition-colors ${s.score >= i ? (s.score === 3 ? "bg-emerald-500" : s.score === 2 ? "bg-primary" : "bg-amber-500") : "bg-muted"}`} />)}
      </div>
      <span className="text-xs text-muted-foreground">{s.label}</span>
    </div>
  );
}
