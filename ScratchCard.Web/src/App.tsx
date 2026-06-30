import { Suspense, lazy } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { useAuth } from "./auth/AuthContext";
import LoginPage from "./auth/LoginPage";
import AppLayout from "./components/AppLayout";
import { Smartphone, LogOut } from "lucide-react";

// The web portal is for company owners and shop managers only. Cashiers / sales assistants use the
// mobile app. PlatformAdmin keeps access as the support hatch.
const WEB_PORTAL_ROLES = ["PlatformAdmin", "CompanyOwner", "Manager"];

// Route-level code splitting — each page is its own chunk so the initial bundle stays small.
const DashboardPage = lazy(() => import("./features/dashboard/DashboardPage"));
const RotaPage = lazy(() => import("./features/rota/RotaPage"));
const TimesheetsPage = lazy(() => import("./features/timesheets/TimesheetsPage"));
const PayRatesPage = lazy(() => import("./features/timesheets/PayRatesPage"));
const ShiftSwapsPage = lazy(() => import("./features/rota/ShiftSwapsPage"));
const ApprovalsPage = lazy(() => import("./features/approvals/ApprovalsPage"));
const LeavePage = lazy(() => import("./features/leave/LeavePage"));
const StaffPage = lazy(() => import("./features/staff/StaffPage"));
const TemperaturePage = lazy(() => import("./features/temperature/TemperaturePage"));
const TemperatureConfigPage = lazy(() => import("./features/temperature/TemperatureConfigPage"));
const CompliancePage = lazy(() => import("./features/compliance/CompliancePage"));
const RefusalsPage = lazy(() => import("./features/refusals/RefusalsPage"));
const VisitorsPage = lazy(() => import("./features/visitors/VisitorsPage"));
const SettingsPage = lazy(() => import("./features/settings/SettingsPage"));
const FeatureTogglesPage = lazy(() => import("./features/settings/FeatureTogglesPage"));
const ShopsPage = lazy(() => import("./features/shops/ShopsPage"));
const BillingPage = lazy(() => import("./features/billing/BillingPage"));
const BillingCallbackPage = lazy(() => import("./features/billing/BillingCallbackPage"));
const TillReconciliationPage = lazy(() => import("./features/till/TillReconciliationPage"));
const TillsPage = lazy(() => import("./features/till/TillsPage"));
const TillCataloguePage = lazy(() => import("./features/till/TillCataloguePage"));
const TillGroupsPage = lazy(() => import("./features/till/TillGroupsPage"));
const TillLineReportPage = lazy(() => import("./features/till/TillLineReportPage"));
const GamesPage = lazy(() => import("./features/games/GamesPage"));
const GameApprovalsPage = lazy(() => import("./features/games/GameApprovalsPage"));
const ProductExpiryPage = lazy(() => import("./features/product-expiry/ProductExpiryPage"));
const ProductHistoryPage = lazy(() => import("./features/product-expiry/ProductHistoryPage"));
const SignupPage = lazy(() => import("./auth/SignupPage"));
const CompanySetupPage = lazy(() => import("./features/setup/CompanySetupPage"));

function NoWebAccess() {
  const { profile, logout } = useAuth();
  const name = profile?.displayName || [profile?.firstName, profile?.lastName].filter(Boolean).join(" ") || profile?.email;
  return (
    <div className="flex min-h-full items-center justify-center bg-gradient-to-br from-brand-50 to-slate-100 p-4 dark:from-slate-900 dark:to-slate-950">
      <div className="card w-full max-w-md space-y-4 p-6 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
          <Smartphone className="h-7 w-7" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Use the mobile app</h1>
          <p className="mt-1 text-sm text-slate-500">
            {name ? <span className="font-medium text-slate-700">{name}</span> : "Your account"} — the web portal is for
            company owners and shop managers. Day-to-day work like shifts, sales and logs is done in the Ops Arrow mobile app.
          </p>
        </div>
        <button className="btn-ghost w-full" onClick={() => logout()}>
          <LogOut className="h-4 w-4" /> Sign out
        </button>
      </div>
    </div>
  );
}

function Protected({ children, requireCompany = true }: { children: React.ReactNode; requireCompany?: boolean }) {
  const { ready, profile } = useAuth();
  const location = useLocation();
  if (!ready) return <div className="flex h-full items-center justify-center text-sm text-slate-400">Loading…</div>;
  // Remember where the user was heading (e.g. a /billing?shopId=… email deep link) so login can
  // send them back there instead of always dropping them on the dashboard.
  if (!profile) return <Navigate to="/login" replace state={{ from: location }} />;
  // Owners & managers only — cashiers / sales assistants belong on the mobile app. Enforced here so
  // it holds for fresh logins, restored sessions on refresh, and direct deep links alike.
  const webAllowed = (profile.roles ?? []).some((r) => WEB_PORTAL_ROLES.includes(r));
  if (!webAllowed) return <NoWebAccess />;
  // Fresh signups have an account but no company yet — finish onboarding before entering the app.
  if (requireCompany && profile.hasCompanySetup === false) return <Navigate to="/setup" replace />;
  return <>{children}</>;
}

const Fallback = () => <div className="p-6 text-sm text-slate-400">Loading…</div>;

export default function App() {
  const { profile } = useAuth();
  return (
    <Routes>
      <Route path="/login" element={profile ? <Navigate to="/" replace /> : <LoginPage />} />
      <Route
        path="/signup"
        element={profile ? <Navigate to="/" replace /> : <Suspense fallback={<Fallback />}><SignupPage /></Suspense>}
      />
      {/* Standalone (no AppLayout): the sidebar is useless until a company + shop exist. */}
      <Route
        path="/setup"
        element={
          <Protected requireCompany={false}>
            <Suspense fallback={<Fallback />}><CompanySetupPage /></Suspense>
          </Protected>
        }
      />
      <Route
        element={
          <Protected>
            <AppLayout />
          </Protected>
        }
      >
        <Route path="/" element={<Suspense fallback={<Fallback />}><DashboardPage /></Suspense>} />
        <Route path="/rota" element={<Suspense fallback={<Fallback />}><RotaPage /></Suspense>} />
        <Route path="/timesheets" element={<Suspense fallback={<Fallback />}><TimesheetsPage /></Suspense>} />
        <Route path="/timesheets/rates" element={<Suspense fallback={<Fallback />}><PayRatesPage /></Suspense>} />
        <Route path="/shift-swaps" element={<Suspense fallback={<Fallback />}><ShiftSwapsPage /></Suspense>} />
        <Route path="/approvals" element={<Suspense fallback={<Fallback />}><ApprovalsPage /></Suspense>} />
        <Route path="/leave" element={<Suspense fallback={<Fallback />}><LeavePage /></Suspense>} />
        <Route path="/staff" element={<Suspense fallback={<Fallback />}><StaffPage /></Suspense>} />
        <Route path="/temperature" element={<Suspense fallback={<Fallback />}><TemperaturePage /></Suspense>} />
        <Route path="/temperature/config" element={<Suspense fallback={<Fallback />}><TemperatureConfigPage /></Suspense>} />
        <Route path="/compliance" element={<Suspense fallback={<Fallback />}><CompliancePage /></Suspense>} />
        <Route path="/refusals" element={<Suspense fallback={<Fallback />}><RefusalsPage /></Suspense>} />
        <Route path="/visitors" element={<Suspense fallback={<Fallback />}><VisitorsPage /></Suspense>} />
        <Route path="/games" element={<Suspense fallback={<Fallback />}><GamesPage /></Suspense>} />
        <Route path="/games/approvals" element={<Suspense fallback={<Fallback />}><GameApprovalsPage /></Suspense>} />
        <Route path="/product-expiry" element={<Suspense fallback={<Fallback />}><ProductExpiryPage /></Suspense>} />
        <Route path="/product-expiry/history" element={<Suspense fallback={<Fallback />}><ProductHistoryPage /></Suspense>} />
        <Route path="/shops" element={<Suspense fallback={<Fallback />}><ShopsPage /></Suspense>} />
        <Route path="/billing" element={<Suspense fallback={<Fallback />}><BillingPage /></Suspense>} />
        {/* Stripe redirect targets (SuccessUrl / CancelUrl / PortalReturnUrl in the API's Stripe options). */}
        <Route path="/billing/success" element={<Suspense fallback={<Fallback />}><BillingCallbackPage variant="success" /></Suspense>} />
        <Route path="/billing/cancel" element={<Suspense fallback={<Fallback />}><BillingCallbackPage variant="cancel" /></Suspense>} />
        <Route path="/billing/portal-return" element={<Suspense fallback={<Fallback />}><BillingCallbackPage variant="portal" /></Suspense>} />
        <Route path="/till" element={<Suspense fallback={<Fallback />}><TillReconciliationPage /></Suspense>} />
        <Route path="/till/tills" element={<Suspense fallback={<Fallback />}><TillsPage /></Suspense>} />
        <Route path="/till/catalogue" element={<Suspense fallback={<Fallback />}><TillCataloguePage /></Suspense>} />
        <Route path="/till/groups" element={<Suspense fallback={<Fallback />}><TillGroupsPage /></Suspense>} />
        <Route path="/till/report" element={<Suspense fallback={<Fallback />}><TillLineReportPage /></Suspense>} />
        <Route path="/settings" element={<Suspense fallback={<Fallback />}><SettingsPage /></Suspense>} />
        <Route path="/settings/features" element={<Suspense fallback={<Fallback />}><FeatureTogglesPage /></Suspense>} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
