import React, { useEffect, useState } from "react";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useLocation,
  useNavigate,
} from "react-router-dom";
import SidebarLayout from "./layout/SidebarLayout";
import { ErrorBoundary } from "./components/ErrorBoundary";

import DashboardPage from "./pages/DashboardPage";
import ClientsPage from "./pages/ClientsPage";
import ProjectsPage from "./pages/ProjectsPage";
import ProjectDashboardPage from "./pages/ProjectDashboardPage";
import EstimatesPage from "./pages/EstimatesPage";
import BOQPage from "./pages/BOQPage";
import AssembliesPage from "./pages/AssembliesPage.tsx";
import RatesPage from "./pages/RatesPage";
import TakeoffPage from "./pages/TakeoffPage";
import ProcurementPage from "./pages/ProcurementPage";
import FinancePage from "./pages/FinancePage";
import ReportsPage from "./pages/ReportsPage";
import SettingsPage from "./pages/SettingsPage";
import SettingsMasterListsPage from "./pages/SettingsMasterListsPage";
import SettingsMasterCategoriesPage from "./pages/SettingsMasterCategoriesPage";
import SettingsCostCodesPage from "./pages/SettingsCostCodesPage";
import BillingPage from "./pages/BillingPage";
import LoginPage from "./pages/LoginPage";
import AcceptInvitePage from "./pages/AcceptInvitePage";
import ClientProjectPage from "./pages/ClientProjectPage";
import WorkerPortalPage from "./pages/WorkerPortalPage";
import FieldOpsPage from "./pages/FieldOpsPage";
import { supabase } from "./lib/supabase";
import CompanyUsersPage from "./pages/CompanyUsersPage";
import { ProjectProvider } from "./context/ProjectContext";
import ReceivingPage from "./pages/ReceivingPage";
import WorkersPage from "./pages/WorkersPage";
import CashFlowPage from "./pages/CashFlowPage";
import AccountsReceivablePage from "./pages/AccountsReceivablePage";
import ExpensesPage from "./pages/ExpensesPage";
import FinanceDashboardPage from "./pages/FinanceDashboardPage";
import FinanceTransactionsPage from "./pages/FinanceTransactionsPage";

function AuthHashRouter() {
  const nav = useNavigate();

  useEffect(() => {
    const hash = window.location.hash || "";
    if (!hash) return;

    const params = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);
    const type = params.get("type");
    const accessToken = params.get("access_token");
    const errorCode = params.get("error_code");

    if (type === "invite" || accessToken || errorCode) {
      nav(`/accept-invite${window.location.hash}`, { replace: true });
    }
  }, [nav]);

  return null;
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const loc = useLocation();
  const [checking, setChecking] = useState(true);
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    let alive = true;

    async function check() {
      const { data } = await supabase.auth.getSession();
      if (!alive) return;
      setAuthed(!!data.session);
      setChecking(false);
    }

    check();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!alive) return;
      setAuthed(!!session);
      setChecking(false);
    });

    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  if (checking) {
    return <div className="p-6 text-sm opacity-70">Loading...</div>;
  }

  if (!authed) {
    const next = encodeURIComponent(loc.pathname + loc.search);
    return <Navigate to={`/login?next=${next}`} replace />;
  }

  return <>{children}</>;
}

export default function App() {
  return (
    <ErrorBoundary context="Application">
      <ProjectProvider>
        <BrowserRouter>
          <AuthHashRouter />

        <Routes>
          {/* Public routes */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/accept-invite" element={<AcceptInvitePage />} />

          {/* Client Portal routes */}
          <Route
            path="/client/projects/:projectId"
            element={
              <RequireAuth>
                <ClientProjectPage />
              </RequireAuth>
            }
          />

          {/* Worker Portal routes */}
          <Route
            path="/worker/portal"
            element={
              <RequireAuth>
                <WorkerPortalPage />
              </RequireAuth>
            }
          />

          {/* Field Operations routes */}
          <Route
            path="/field-ops"
            element={
              <RequireAuth>
                <FieldOpsPage />
              </RequireAuth>
            }
          />

          {/* Protected routes */}
          <Route
            element={
              <RequireAuth>
                <SidebarLayout />
              </RequireAuth>
            }
          >
            <Route path="/" element={<DashboardPage />} />
            <Route path="/clients" element={<ClientsPage />} />
            <Route path="/projects" element={<ProjectsPage />} />
            <Route path="/projects/:projectId" element={<ProjectDashboardPage />} />
            <Route path="/projects/:projectId/boq" element={<BOQPage />} />
            <Route path="/projects/:projectId/takeoff" element={<TakeoffPage />} />
            <Route path="/projects/:projectId/procurement" element={<ProcurementPage />} />
            <Route path="/projects/:projectId/finance" element={<FinancePage />} />
            <Route path="/projects/:projectId/finance/dashboard" element={<FinanceDashboardPage />} />
            <Route path="/projects/:projectId/finance/transactions" element={<FinanceTransactionsPage />} />
            <Route path="/projects/:projectId/reports" element={<ReportsPage />} />
            <Route path="/estimates" element={<EstimatesPage />} />
            <Route path="/boq" element={<BOQPage />} />
            <Route path="/assemblies" element={<AssembliesPage />} />
            <Route path="/rates" element={<RatesPage />} />
            <Route path="/takeoff" element={<TakeoffPage />} />
            <Route path="/procurement" element={<ProcurementPage />} />
            <Route path="/receiving" element={<ReceivingPage />} />
            <Route path="/finance" element={<FinancePage />} />
            <Route path="/workers" element={<WorkersPage />} />
            <Route path="/cash-flow" element={<CashFlowPage />} />
            <Route path="/accounts-receivable" element={<AccountsReceivablePage />} />
            <Route path="/expenses" element={<ExpensesPage />} />
            <Route path="/reports" element={<ReportsPage />} />
            <Route path="/billing" element={<BillingPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/settings/master-categories" element={<SettingsMasterCategoriesPage />} />
            <Route path="/settings/master-lists" element={<SettingsMasterListsPage />} />
            <Route path="/settings/cost-codes" element={<SettingsCostCodesPage />} />
            <Route path="/settings/users" element={<CompanyUsersPage />} />
            <Route path="/settings/company" element={<Navigate to="/settings" replace />} />
            <Route path="/receiving/:id" element={<ReceivingPage />} />
          </Route>

          {/* fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </ProjectProvider>
    </ErrorBoundary>
  );
}