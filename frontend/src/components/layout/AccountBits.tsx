import { useState } from "react";
import { Link } from "react-router-dom";
import { Coins, MailWarning } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { api, errorMessage } from "@/lib/api";
import { useMe } from "@/lib/hooks";
import { cn } from "@/lib/utils";

export const fmtCredits = (c: number) => (Number.isInteger(c) ? c.toLocaleString() : c.toLocaleString(undefined, { maximumFractionDigits: 1 }));

/** Credit balance in the header; amber when it is running low, red when empty. */
export function CreditsChip() {
  const me = useMe().data;
  if (!me?.account.metered) return null;
  const c = me.account.credits;
  const tone = c <= 0 ? "border-destructive/40 bg-destructive/10 text-destructive" : c < 25 ? "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300" : "text-foreground";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link to="/billing" className={cn("flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-sm font-medium tabular-nums transition-colors hover:bg-accent", tone)}>
          <Coins className="size-4 text-primary" aria-hidden />
          {fmtCredits(Math.max(0, c))}
          <span className="sr-only">credits</span>
        </Link>
      </TooltipTrigger>
      <TooltipContent>{c <= 0 ? "Out of credits. The crew has paused." : "Credits left. Click to add more."}</TooltipContent>
    </Tooltip>
  );
}

export function VerifyBanner() {
  const me = useMe().data;
  const [busy, setBusy] = useState(false);
  const [dev, setDev] = useState<string | null>(() => { try { return sessionStorage.getItem("rc:dev-verify"); } catch { return null; } });
  if (!me?.user || me.user.email_verified || !me.require_verification) return null;
  const resend = async () => {
    setBusy(true);
    try {
      const r = await api.resendVerification();
      if (r.dev_verify_url) setDev(r.dev_verify_url);
      toast.success(`Sent a new link to ${me.user!.email}`);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div role="status" className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b bg-amber-500/10 px-4 py-2.5 text-sm lg:px-6">
      <MailWarning className="size-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
      <span className="min-w-0 flex-1">Confirm <b>{me.user.email}</b> to let the crew start. The link is in your inbox.</span>
      {dev && <a className="text-xs underline" href={dev}>Open link (dev)</a>}
      <Button size="sm" variant="outline" disabled={busy} onClick={resend}>Resend link</Button>
    </div>
  );
}
