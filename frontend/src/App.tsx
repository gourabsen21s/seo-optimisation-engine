import { lazy, Suspense, useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/AppShell";
import { Skeleton } from "@/components/ui/skeleton";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ApiError, sessionEvents } from "@/lib/api";
import { qk, useMe } from "@/lib/hooks";
import { ForgotPasswordPage, ResetPasswordPage, VerifyEmailPage } from "@/pages/auth/AccountFlows";
import { LoginPage } from "@/pages/LoginPage";
import { NotFoundPage } from "@/pages/NotFoundPage";
import { SignupPage } from "@/pages/auth/SignupPage";
import { SitesPage } from "@/pages/SitesPage";
import { SiteLayout } from "@/pages/site/SiteLayout";

const LandingPage = lazy(() => import("@/features/landing/LandingPage"));
const LegalPage = lazy(() => import("@/pages/LegalPage"));
const BillingPage = lazy(() => import("@/pages/BillingPage"));
const AccountPage = lazy(() => import("@/pages/AccountPage"));
const OverviewPage = lazy(() => import("@/pages/site/OverviewPage"));
const OfficePage = lazy(() => import("@/pages/site/OfficePage"));
const ChatPage = lazy(() => import("@/pages/site/ChatPage"));
const BoardPage = lazy(() => import("@/pages/site/BoardPage"));
const CyclesPage = lazy(() => import("@/pages/site/CyclesPage"));
const FindingsPage = lazy(() => import("@/pages/site/FindingsPage"));
const ChecklistPage = lazy(() => import("@/pages/site/ChecklistPage"));
const PagesPage = lazy(() => import("@/pages/site/PagesPage"));
const ContentPage = lazy(() => import("@/pages/site/ContentPage"));
const FixesPage = lazy(() => import("@/pages/site/FixesPage"));
const MemoryPage = lazy(() => import("@/pages/site/MemoryPage"));
const ReportsPage = lazy(() => import("@/pages/site/ReportsPage"));
const RankingsPage = lazy(() => import("@/pages/site/RankingsPage"));
const SiteSettingsPage = lazy(() => import("@/pages/site/SiteSettingsPage"));
const WorkspaceSettingsPage = lazy(() => import("@/pages/WorkspaceSettingsPage"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      refetchOnWindowFocus: true,
      retry: (count, err) => !(err instanceof ApiError && err.status >= 400 && err.status < 500) && count < 2,
    },
    mutations: { retry: false },
  },
});

/** Reacts to what the server says about the session: signed out, out of credits, email not confirmed. */
function SessionWatcher() {
  const navigate = useNavigate();
  useEffect(() => sessionEvents.on((event, detail) => {
    if (event === "unauthorized") {
      queryClient.setQueryData(qk.me, null);
      queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== "me" && q.queryKey[0] !== "packs" });
    } else if (event === "credits") {
      queryClient.invalidateQueries({ queryKey: qk.me });
      toast.error("Out of credits", { id: "credits", description: detail, action: { label: "Add credits", onClick: () => navigate("/billing") } });
    } else if (event === "unverified") {
      toast.warning("Confirm your email", { id: "unverified", description: detail });
    }
  }), [navigate]);
  return null;
}

const Splash = () => <div className="min-h-svh bg-background" />;

function RequireAuth({ children }: { children: React.ReactNode }) {
  const me = useMe();
  const location = useLocation();
  if (me.isPending) return <Splash />;
  if (!me.data) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  return <>{children}</>;
}

const PageFallback = () => (
  <div className="grid gap-4"><Skeleton className="h-9 w-64" /><Skeleton className="h-64 w-full" /></div>
);
const lazyPage = (el: React.ReactNode) => <Suspense fallback={<PageFallback />}>{el}</Suspense>;

const SECTIONS: Record<string, React.ComponentType> = {
  overview: OverviewPage, office: OfficePage, chat: ChatPage, board: BoardPage, cycles: CyclesPage, findings: FindingsPage,
  rankings: RankingsPage, checklist: ChecklistPage, pages: PagesPage, content: ContentPage, fixes: FixesPage, memory: MemoryPage, reports: ReportsPage, settings: SiteSettingsPage,
};

export default function App() {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange storageKey="rankcrew-theme">
      <QueryClientProvider client={queryClient}>
        <TooltipProvider delayDuration={200}>
          <BrowserRouter>
            <SessionWatcher />
            <Routes>
              <Route index element={<Suspense fallback={<div className="min-h-svh bg-[#0a0e17]" />}><LandingPage /></Suspense>} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/signup" element={<SignupPage />} />
              <Route path="/forgot-password" element={<ForgotPasswordPage />} />
              <Route path="/reset-password" element={<ResetPasswordPage />} />
              <Route path="/verify-email" element={<VerifyEmailPage />} />
              <Route path="/terms" element={<Suspense fallback={<Splash />}><LegalPage doc="terms" /></Suspense>} />
              <Route path="/privacy" element={<Suspense fallback={<Splash />}><LegalPage doc="privacy" /></Suspense>} />
              <Route element={<RequireAuth><AppShell /></RequireAuth>}>
                <Route path="sites" element={<SitesPage />} />
                <Route path="billing" element={lazyPage(<BillingPage />)} />
                <Route path="account" element={lazyPage(<AccountPage />)} />
                <Route path="settings" element={lazyPage(<WorkspaceSettingsPage />)} />
                <Route path="sites/:siteId" element={<SiteLayout />}>
                  <Route index element={<Navigate to="overview" replace />} />
                  {Object.entries(SECTIONS).map(([section, Page]) => (
                    <Route key={section} path={section} element={lazyPage(<Page />)} />
                  ))}
                  <Route path="*" element={<Navigate to="overview" replace />} />
                </Route>
                <Route path="*" element={<NotFoundPage />} />
              </Route>
            </Routes>
          </BrowserRouter>
          <Toaster richColors closeButton position="bottom-right" />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
