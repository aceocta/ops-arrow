import { Suspense, lazy } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth/AuthContext";
import LoginPage from "./auth/LoginPage";
import AppLayout from "./components/AppLayout";

// Route-level code splitting — each page is its own chunk so the initial bundle stays small.
const DashboardPage = lazy(() => import("./features/dashboard/DashboardPage"));
const RotaPage = lazy(() => import("./features/rota/RotaPage"));
const TimesheetsPage = lazy(() => import("./features/timesheets/TimesheetsPage"));
const ApprovalsPage = lazy(() => import("./features/approvals/ApprovalsPage"));
const StaffPage = lazy(() => import("./features/staff/StaffPage"));
const TemperaturePage = lazy(() => import("./features/temperature/TemperaturePage"));
const CompliancePage = lazy(() => import("./features/compliance/CompliancePage"));
const RefusalsPage = lazy(() => import("./features/refusals/RefusalsPage"));
const VisitorsPage = lazy(() => import("./features/visitors/VisitorsPage"));
const SettingsPage = lazy(() => import("./features/settings/SettingsPage"));

function Protected({ children }: { children: React.ReactNode }) {
  const { ready, profile } = useAuth();
  if (!ready) return <div className="flex h-full items-center justify-center text-sm text-slate-400">Loading…</div>;
  return profile ? <>{children}</> : <Navigate to="/login" replace />;
}

const Fallback = () => <div className="p-6 text-sm text-slate-400">Loading…</div>;

export default function App() {
  const { profile } = useAuth();
  return (
    <Routes>
      <Route path="/login" element={profile ? <Navigate to="/" replace /> : <LoginPage />} />
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
        <Route path="/approvals" element={<Suspense fallback={<Fallback />}><ApprovalsPage /></Suspense>} />
        <Route path="/staff" element={<Suspense fallback={<Fallback />}><StaffPage /></Suspense>} />
        <Route path="/temperature" element={<Suspense fallback={<Fallback />}><TemperaturePage /></Suspense>} />
        <Route path="/compliance" element={<Suspense fallback={<Fallback />}><CompliancePage /></Suspense>} />
        <Route path="/refusals" element={<Suspense fallback={<Fallback />}><RefusalsPage /></Suspense>} />
        <Route path="/visitors" element={<Suspense fallback={<Fallback />}><VisitorsPage /></Suspense>} />
        <Route path="/settings" element={<Suspense fallback={<Fallback />}><SettingsPage /></Suspense>} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
