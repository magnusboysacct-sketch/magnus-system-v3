// src/App.tsx — Clean rebuild router
// Same auth logic, same routes, new AppLayout replaces SidebarLayout

import React, { useEffect, useState } from "react";
import VerifyWorkerPage from './pages/VerifyWorkerPage';
import ClientPortalPage from './pages/ClientPortalPage';
import ClientLoginPage from './pages/ClientLoginPage';
import ClientResetPasswordPage from './pages/ClientResetPasswordPage';
import AccessLogPage from './pages/AccessLogPage';
import ProjectIssuesPage from './pages/ProjectIssuesPage';
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from "react-router-dom";
import AppLayout from "./layout/AppLayout";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { ProjectProvider } from "./context/ProjectContext";
import { supabase } from "./lib/supabase";

// --- Pages -------------------------------------------------------------------
import LoginPage              from "./pages/LoginPage";
import AcceptInvitePage       from "./pages/AcceptInvitePage";
import ResetPasswordPage      from "./pages/ResetPasswordPage";
import ClientProjectPage      from "./pages/ClientProjectPage";
import WorkerPortalPage       from "./pages/WorkerPortalPage";
import FieldOpsPage           from "./pages/FieldOpsPage";
import FieldAppPage           from "./pages/FieldAppPage";
import DashboardPage          from "./pages/DashboardPage";
import ClientsPage            from "./pages/ClientsPage";
import ProjectsPage           from "./pages/ProjectsPage";
import ProjectDashboardPage   from "./pages/ProjectDashboardPage";
import EstimatesPage          from "./pages/EstimatesPage";
import BOQPage                from "./pages/BOQPage";
import AssembliesPage         from "./pages/AssembliesPage";
import RatesPage              from "./pages/RatesPage";
import TakeoffPage            from "./pages/TakeoffPage";
import ProcurementPage        from "./pages/ProcurementPage";
import ReceivingPage          from "./pages/ReceivingPage";
import SupplierPriceSyncPage  from "./pages/SupplierPriceSyncPage";
import FinanceDashboardPage from "./pages/FinanceDashboardPage";
import JournalEntryPage from "./pages/JournalEntryPage";
import FinancePage            from "./pages/FinancePage";
import FinanceTransactionsPage from "./pages/FinanceTransactionsPage";
import FinanceReportsPage     from "./pages/FinanceReportsPage";
import UploadStatementPage    from "./pages/UploadStatementPage";
import ExpensesPage           from "./pages/ExpensesPage";
import CashFlowPage           from "./pages/CashFlowPage";
import AccountsReceivablePage from "./pages/AccountsReceivablePage";
import FieldPaymentsPage      from "./pages/FieldPaymentsPage";
import WorkersPage            from "./pages/WorkersPage";
import ReportsPage            from "./pages/ReportsPage";
import ContractsPage          from "./pages/ContractsPage";

import SettingsPage           from "./pages/SettingsPage";
import SettingsRecordsPage     from "./pages/SettingsRecordsPage";
import SettingsCompanyPage      from "./pages/SettingsCompanyPage";
import WorkerVerifyPage         from "./pages/WorkerVerifyPage";
import SettingsMasterListsPage      from "./pages/SettingsMasterListsPage";
import SettingsMasterCategoriesPage from "./pages/SettingsMasterCategoriesPage";
import SettingsCostCodesPage  from "./pages/SettingsCostCodesPage";
import SettingsUsersPage      from "./pages/SettingsUsersPage";
import BillingPage            from "./pages/BillingPage";
import UpgradePage from "./pages/UpgradePage";
import JamaicanPayrollMonitoringPage from "./pages/JamaicanPayrollMonitoringPage";
import PayrollComparisonReviewPage   from "./pages/PayrollComparisonReviewPage";
import PayrollSimulationCenterPage   from "./pages/PayrollSimulationCenterPage";

// --- Auth hash handler --------------------------------------------------------

function AuthHashRouter() {
  const nav = useNavigate();
  useEffect(() => {
    const hash = window.location.hash || "";
    if (!hash) return;
    const params = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);
    const type = params.get("type");
    if (type === "recovery") {
      nav(`/reset-password${window.location.hash}`, { replace: true });
    } else if (type === "invite" || params.get("access_token") || params.get("error_code")) {
      nav(`/accept-invite${window.location.hash}`, { replace: true });
    }
  }, [nav]);
  return null;
}

// --- Auth guard ---------------------------------------------------------------

function RequireAuth({ children }: { children: React.ReactNode }) {
  const loc = useLocation();
  const nav = useNavigate();
  const [checking, setChecking] = useState(true);
  const [authed, setAuthed] = useState(false);
  const [subscriptionExpired, setSubscriptionExpired] = useState(false);

  useEffect(() => {
    let alive = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!alive) return;
      const authed = !!data.session;
      setAuthed(authed);
      if (authed) {
        try {
          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            const { data: profile } = await supabase.from("user_profiles").select("company_id").eq("id", user.id).maybeSingle();
            if (profile?.company_id) {
              const { data: cs } = await supabase.from("company_settings").select("trial_expires_at,subscription_status,subscription_expires_at").eq("company_id", profile.company_id).maybeSingle();
              if (cs) {
                const now = new Date();
                const trialExpired = cs.trial_expires_at ? new Date(cs.trial_expires_at) < now : false;
                const subActive = cs.subscription_status === "active" && (!cs.subscription_expires_at || new Date(cs.subscription_expires_at) > now);
                if (trialExpired && !subActive) { if (alive) setSubscriptionExpired(true); }
              }
            }
          }
        } catch {}
      }
      if (alive) setChecking(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (!alive) return;
      setAuthed(!!session);
      setChecking(false);
    });
    return () => { alive = false; sub.subscription.unsubscribe(); };
  }, []);

  if (checking) return (
    <div className="min-h-screen bg-[#080b10] flex items-center justify-center">
      <div className="flex items-center gap-2.5 text-xs text-slate-500">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="animate-spin text-cyan-500">
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2.5" strokeOpacity="0.2"/>
          <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
        </svg>
        Loading…
      </div>
    </div>
  );

  if (!authed) {
    const next = encodeURIComponent(loc.pathname + loc.search);
    return <Navigate to={`/login?next=${next}`} replace />;
  }

  if (subscriptionExpired && loc.pathname !== "/upgrade" && loc.pathname !== "/settings/company") {
    return <Navigate to="/upgrade" replace />;
  }

  return <>{children}</>;
}

// --- App ----------------------------------------------------------------------

export default function App() {
  return (
    <ErrorBoundary context="Application">
      <ProjectProvider>
        <BrowserRouter>
          <AuthHashRouter />
          <Routes>
            {/* Public */}
            <Route path="/verify/:workerId" element={<WorkerVerifyPage />} />
            <Route path="/login"          element={<LoginPage />} />
            <Route path="/accept-invite"  element={<AcceptInvitePage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />

            {/* Standalone portals */}
            <Route path="/client/projects/:projectId" element={<RequireAuth><ClientProjectPage /></RequireAuth>} />
            <Route path="/worker/portal"              element={<RequireAuth><WorkerPortalPage /></RequireAuth>} />
            <Route path="/field-ops"                  element={<RequireAuth><FieldOpsPage /></RequireAuth>} />
            <Route path="/field"                      element={<Navigate to="/field-payments" replace />} />

            {/* Protected app shell */}
            <Route element={<RequireAuth><AppLayout /></RequireAuth>}>
              <Route path="/"                       element={<DashboardPage />} />

              {/* CRM */}
              <Route path="/clients"                element={<ClientsPage />} />
              <Route path="/projects"               element={<ProjectsPage />} />
              <Route path="/projects/:projectId"    element={<ProjectDashboardPage />} />

              {/* Project-scoped */}
              <Route path="/projects/:projectId/boq"          element={<BOQPage />} />
              <Route path="/projects/:projectId/takeoff"      element={<TakeoffPage />} />
              <Route path="/projects/:projectId/procurement"  element={<ProcurementPage />} />
              <Route path="/projects/:projectId/finance"      element={<FinancePage />} />
              <Route path="/projects/:projectId/finance/transactions" element={<FinanceTransactionsPage />} />
              <Route path="/projects/:projectId/finance/reports"      element={<FinanceReportsPage />} />
              <Route path="/projects/:projectId/reports"      element={<ReportsPage />} />

              {/* Estimating */}
              <Route path="/estimates"    element={<EstimatesPage />} />
              <Route path="/contracts"    element={<ContractsPage />} />
              <Route path="/boq"          element={<BOQPage />} />
              <Route path="/takeoff"      element={<TakeoffPage />} />
              <Route path="/assemblies"   element={<AssembliesPage />} />
              <Route path="/rates"        element={<RatesPage />} />

              {/* Procurement */}
              <Route path="/procurement"     element={<ProcurementPage />} />
              <Route path="/receiving"       element={<ReceivingPage />} />
              <Route path="/receiving/:id"   element={<ReceivingPage />} />
              <Route path="/supplier-prices" element={<SupplierPriceSyncPage />} />

              {/* Finance */}
              <Route path="/finance" element={<FinanceDashboardPage />} />
              <Route path="/finance/journal-entry" element={<JournalEntryPage />} />
              <Route path="/finance/transactions"    element={<FinanceTransactionsPage />} />
              <Route path="/finance/reports"         element={<FinanceReportsPage />} />
              <Route path="/expenses"                element={<ExpensesPage />} />
              <Route path="/cash-flow"               element={<CashFlowPage />} />
              <Route path="/finance/upload-statement" element={<UploadStatementPage />} />
              <Route path="/accounts-receivable"     element={<AccountsReceivablePage />} />
              <Route path="/field-payments"          element={<FieldPaymentsPage />} />

              {/* People */}
              <Route path="/workers"                 element={<WorkersPage />} />

              {/* Reports + Settings */}
              <Route path="/reports"                       element={<ReportsPage />} />
              <Route path="/billing"                       element={<BillingPage />} />
              <Route path="/upgrade" element={<UpgradePage />} />
              <Route path="/materials-library" element={<Navigate to="/rates" replace />} />
              <Route path="/settings"                      element={<SettingsPage />} />
              <Route path="/settings/company"              element={<SettingsCompanyPage />} />
              <Route path="/settings/master-lists"         element={<SettingsMasterListsPage />} />
              <Route path="/settings/master-categories"    element={<SettingsMasterCategoriesPage />} />
              <Route path="/settings/cost-codes"           element={<SettingsCostCodesPage />} />
              <Route path="/settings/users"                element={<SettingsUsersPage />} />
              <Route path="/settings/records"              element={<SettingsRecordsPage />} />
              <Route path="/settings/company"              element={<Navigate to="/settings" replace />} />

              {/* Admin / Payroll */}
              <Route path="/admin/jamaican-payroll-monitoring"          element={<JamaicanPayrollMonitoringPage />} />
              <Route path="/admin/payroll-comparison-review"            element={<PayrollComparisonReviewPage />} />
              <Route path="/admin/payroll-simulation-center"            element={<PayrollSimulationCenterPage />} />
              <Route path="/projects/:currentProjectId/admin/payroll-simulation-center" element={<PayrollSimulationCenterPage />} />
            </Route>

            <Route path="/verify/:workerId" element={<VerifyWorkerPage />} />
            <Route path="/portal/:token" element={<ClientPortalPage />} />
            <Route path="/client-login" element={<ClientLoginPage />} />
            <Route path="/client-reset-password" element={<ClientResetPasswordPage />} />
            <Route path="/client-portal/:clientId" element={<ClientPortalPage />} />
            <Route path="/projects/:projectId/issues" element={<ProjectIssuesPage />} />
            <Route path="/access-log" element={<AccessLogPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </BrowserRouter>
      </ProjectProvider>
    </ErrorBoundary>
  );
}
