import { useEffect } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { LogoMark } from "@/components/brand/Logo";
import { BRAND } from "@/config/brand";

// Company details come from the build environment so they can be set without code changes.
const env = import.meta.env;
const COMPANY = (env.VITE_LEGAL_NAME as string | undefined) || BRAND.name;
const EMAIL = (env.VITE_SUPPORT_EMAIL as string | undefined) || "support@" + (typeof window !== "undefined" ? window.location.hostname : "rankcrew");
const ADDRESS = env.VITE_LEGAL_ADDRESS as string | undefined;
const UPDATED = (env.VITE_LEGAL_UPDATED as string | undefined) || "26 September 2026";

type Section = { h: string; p: React.ReactNode[] };

const TERMS: Section[] = [
  { h: "The service", p: [<>{BRAND.name} is a hosted service in which AI agents audit websites for search and AdSense readiness, propose and (when you allow it) apply changes, and measure the results. These terms are an agreement between you and {COMPANY}.</>] },
  { h: "Your account", p: ["You must give a valid email address and keep your password private. You are responsible for activity in your workspace. Tell us straight away if you think your account has been used without permission."] },
  { h: "Sites you add", p: ["Only add websites you own or are authorised to manage. By connecting a site you let the service crawl it and, where you connect WordPress, GitHub or a file connector and choose an autopilot mode, make the changes you approve or allow. You are responsible for reviewing changes and for keeping backups of your site."] },
  { h: "Credits and payment", p: [
    "Work is paid for with credits. The price of each kind of work is shown in Billing before you spend anything. Credits are bought in packs through our payment processor, Stripe, and do not expire while your account is open.",
    "Credits are not refundable except where the law requires it or where a charge was made in error. We may change prices for future purchases; credits you already hold keep their value.",
  ] },
  { h: "Acceptable use", p: ["Do not use the service to break the law, to attack or overload other people's websites, to generate deceptive or harmful content, or to get around usage limits. We may suspend accounts that do."] },
  { h: "No guaranteed rankings", p: ["Search rankings depend on many things outside anyone's control, including competition and search engine decisions. We do not promise any particular ranking, traffic or AdSense approval."] },
  { h: "Your content", p: ["You keep ownership of your sites and data. You give us the permissions needed to run the service for you. AI-written text is saved as drafts unless you choose otherwise; you are responsible for what you publish."] },
  { h: "Availability and changes", p: ["We work to keep the service available but do not guarantee it will be uninterrupted. We may change or improve features. If we make a material change to these terms we will tell you by email or in the app."] },
  { h: "Ending the agreement", p: ["You can delete your workspace at any time from Account. We may suspend or close accounts that breach these terms. When a workspace is deleted, its data is removed."] },
  { h: "Liability", p: [<>To the extent the law allows, {COMPANY} is not liable for indirect or consequential losses, and our total liability is limited to the amount you paid us in the twelve months before the claim.</>] },
  { h: "Contact", p: [<>Questions about these terms: <a className="underline" href={`mailto:${EMAIL}`}>{EMAIL}</a>{ADDRESS ? `, ${ADDRESS}` : ""}.</>] },
];

const PRIVACY: Section[] = [
  { h: "What we collect", p: [
    "Account details: your name, email address, a hash of your password (never the password itself), and your workspace name.",
    "Site data: the pages the crew crawls, audit results, proposed changes, task history and the notes the crew keeps about your site. Connector and Search Console credentials you provide are stored encrypted.",
    "Usage: the work performed and credits spent, and basic request logs used to keep the service secure.",
    "Payments: handled by Stripe. We receive the outcome of a payment, never your card details.",
  ] },
  { h: "How we use it", p: ["To run the service you asked for, to bill for it, to keep it secure, and to contact you about your account. We do not sell your data and we do not use it to advertise to you."] },
  { h: "Who else processes it", p: ["Stripe (payments), our email provider (account and notification emails), and the AI model providers that power the crew, which receive the page content and instructions needed for each task. Each is bound to use the data only to provide their service to us."] },
  { h: "Cookies", p: ["We set one essential cookie that keeps you signed in. We do not use advertising or tracking cookies."] },
  { h: "Retention and deletion", p: ["We keep your data while your account is open. Deleting your workspace from Account removes its sites, audits, tasks and memories. Payment records are kept as long as tax law requires."] },
  { h: "Security", p: ["Passwords are hashed, session tokens are stored only as hashes, credentials are encrypted at rest, and all traffic is encrypted in transit."] },
  { h: "Your rights", p: [<>You can see and change your details in Account and delete your workspace at any time. For any other request about your data, email <a className="underline" href={`mailto:${EMAIL}`}>{EMAIL}</a>.</>] },
];

export default function LegalPage({ doc }: { doc: "terms" | "privacy" }) {
  const title = doc === "terms" ? "Terms of Service" : "Privacy Policy";
  const sections = doc === "terms" ? TERMS : PRIVACY;
  useEffect(() => {
    const prev = document.title;
    document.title = `${title} · ${BRAND.name}`;
    return () => { document.title = prev; };
  }, [title]);
  return (
    <div className="min-h-svh bg-background">
      <header className="mx-auto flex max-w-3xl items-center justify-between px-6 py-6">
        <Link to="/" className="flex items-center gap-2 font-heading font-semibold"><LogoMark className="size-7 rounded-lg bg-primary text-primary-foreground [&_svg]:size-4" />{BRAND.name}</Link>
        <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-3.5" /> Home</Link>
      </header>
      <main className="mx-auto max-w-3xl px-6 pb-24">
        <h1 className="font-display text-5xl font-semibold">{title}</h1>
        <p className="mt-3 text-sm text-muted-foreground">Last updated {UPDATED}. {doc === "terms" ? <Link className="underline" to="/privacy">Privacy Policy</Link> : <Link className="underline" to="/terms">Terms of Service</Link>}</p>
        <div className="mt-10 grid gap-8">
          {sections.map((s) => (
            <section key={s.h} className="grid gap-2">
              <h2 className="text-xl font-semibold">{s.h}</h2>
              {s.p.map((para, i) => <p key={i} className="max-w-prose leading-relaxed text-muted-foreground">{para}</p>)}
            </section>
          ))}
        </div>
      </main>
    </div>
  );
}
