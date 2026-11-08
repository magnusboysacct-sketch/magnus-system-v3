// src/App.tsx — Clean rebuild router
// Same auth logic, same routes, new AppLayout replaces SidebarLayout

import React, { Fragment, Suspense, lazy, useEffect, useState } from "react";
import ClientPortalPage from './pages/ClientPortalPage';
import ClientLoginPage from './pages/ClientLoginPage';
import ClientResetPasswordPage from './pages/ClientResetPasswordPage';
import AccessLogPage from './pages/AccessLogPage';
import ProjectIssuesPage from './pages/ProjectIssuesPage';
import ProjectLogsPage from './pages/ProjectLogsPage';
import ProjectPhotosPage from './pages/ProjectPhotosPage';
import SharedPhotosPage from './pages/SharedPhotosPage';
import PublicReceiptPage from './pages/PublicReceiptPage';
import MySignaturePage from './pages/MySignaturePage';
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate, useParams } from "react-router-dom";
import ProjectUrlSync from "./components/ProjectUrlSync";
import AppLayout from "./layout/AppLayout";
import UpdateBanner from "./components/UpdateBanner";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { ProjectProvider, useProjectContext } from "./context/ProjectContext";
import { useFinanceAccess } from "./hooks/useFinanceAccess";
import { supabase } from "./lib/supabase";
import { canAccessDirectorDashboard, PAYROLL_ROLES, WORKERS_PAGE_ROLES } from "./lib/permissions";

// --- Pages -------------------------------------------------------------------
import LoginPage              from "./pages/LoginPage";
import AcceptInvitePage       from "./pages/AcceptInvitePage";
import ResetPasswordPage      from "./pages/ResetPasswordPage";
import AuthConfirmPage        from "./pages/AuthConfirmPage";
import ClientProjectPage      from "./pages/ClientProjectPage";
import WorkerLoginPage        from "./pages/WorkerLoginPage";
import GetAppPage             from "./pages/GetAppPage";
import ProjectFilesPage       from "./pages/ProjectFilesPage";
import WorkerHomePage         from "./pages/WorkerHomePage";
import FieldOpsPage           from "./pages/FieldOpsPage";
import FieldAppPage           from "./pages/FieldAppPage";
import DashboardPage          from "./pages/DashboardPage";
import DirectorDashboardPage  from "./pages/DirectorDashboardPage";
import SecretaryWorkspacePage from "./pages/SecretaryWorkspacePage";
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
import SiteVisitPage          from "./pages/SiteVisitPage";
import ProjectPlansPage       from "./pages/ProjectPlansPage";
import FinanceDashboardPage from "./pages/FinanceDashboardPage";
import JournalEntryPage from "./pages/JournalEntryPage";
import FinancePage            from "./pages/FinancePage";
import FinanceTransactionsPage from "./pages/FinanceTransactionsPage";
import FinanceReportsPage     from "./pages/FinanceReportsPage";
import UploadStatementPage    from "./pages/UploadStatementPage";
import BankReviewPage         from "./pages/BankReviewPage";
import ReconcilePage          from "./pages/ReconcilePage";
import BankAccountsPage       from "./pages/BankAccountsPage";
import ExpensesPage           from "./pages/ExpensesPage";
import CashFlowPage           from "./pages/CashFlowPage";
import AccountsReceivablePage from "./pages/AccountsReceivablePage";
import AccountsPayablePage    from "./pages/AccountsPayablePage";
import FieldPaymentsPage      from "./pages/FieldPaymentsPage";
import WorkersPage            from "./pages/WorkersPage";
import AttendancePage         from "./pages/AttendancePage";
import SuppliersPage          from "./pages/SuppliersPage";
import ReportsPage            from "./pages/ReportsPage";
import ContractsPage          from "./pages/ContractsPage";
import HelpCenterPage         from "./pages/HelpCenterPage";
import StaffPortalManagerPage from "./pages/StaffPortalManagerPage";
import PayrollPage            from "./pages/PayrollPage";

import WorkerVerifyPage         from "./pages/WorkerVerifyPage";
import IdVerifyPage            from "./pages/IdVerifyPage";
import SettingsShell from "./pages/settings/SettingsShell";
import SettingsMasterCategoriesPage from "./pages/SettingsMasterCategoriesPage";
import SettingsCostCodesPage  from "./pages/SettingsCostCodesPage";
// "My plan" (Step 5 of Magnus HQ) replaces the old BillingPage / UpgradePage; /billing and /upgrade both open it.
import MyPlanPage             from "./pages/MyPlanPage";
import SupportAccessPage      from "./pages/SupportAccessPage";
import JamaicanPayrollMonitoringPage from "./pages/JamaicanPayrollMonitoringPage";
import PayrollComparisonReviewPage   from "./pages/PayrollComparisonReviewPage";
import PayrollSimulationCenterPage   from "./pages/PayrollSimulationCenterPage";

// Magnus HQ (platform owner control room): loaded on its own so normal users never download it.
const HQPage = lazy(() => import("./pages/hq/HQPage"));
import { fetchCompanyStatus } from "./hooks/useCompanyStatus";
import { recordVisit } from "./lib/hq/traffic";
import { FeatureGate, MaintenanceGate } from "./components/PlatformGates";

// --- Auth hash handler --------------------------------------------------------

// Project pages are rebuilt when their project changes: the old page (and any answer it is still waiting for) is dropped, the new one starts with its own loading state.
// ByUrlProject: the project is in the address (/projects/<id>/...). ByCurrentProject: the page shows the project chosen in the sidebar. (See lib/projectScope.ts.)
function ByUrlProject({ children }: { children: React.ReactNode }) {
  const p = useParams();
  return <Fragment key={p.projectId ?? p.currentProjectId ?? ""}>{children}</Fragment>;
}
function ByCurrentProject({ children }: { children: React.ReactNode }) {
  const { currentProjectId } = useProjectContext();
  return <Fragment key={currentProjectId ?? "none"}>{children}</Fragment>;
}

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
  // System companies (templates, the Magnus HQ login's own company) never expire and never count as tenants.
  const [systemCompany, setSystemCompany] = useState(false);
  // Closed by Magnus HQ: nobody in the company can use it (data is kept until the 90 days are up).
  const [companyClosed, setCompanyClosed] = useState(false);

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
              // companies.is_system arrives with migration 20260955; before that this just comes back empty.
              const { data: co } = await supabase.from("companies").select("is_system").eq("id", profile.company_id).maybeSingle();
              const isSystem = !!(co as { is_system?: boolean } | null)?.is_system;
              if (alive) setSystemCompany(isSystem);
              const st = await fetchCompanyStatus();
              if (alive && st.status === "closed") setCompanyClosed(true);
              // An ended trial no longer locks anyone out. Billing is decided by Magnus HQ's Charging switch:
              // unpaid after the grace days = read-only (enforced by the database), never a lock-out.
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
    <div className="fixed inset-0 bg-gradient-to-br from-slate-50 to-blue-50 flex flex-col items-center justify-center z-50">
      <div className="mb-8 flex flex-col items-center px-8">
        <img src="/icon-512x512.png" alt="Magnus Boys Construction"
          className="w-40 h-40 object-contain mb-6"/>
        <h1 className="text-2xl font-bold text-slate-800 tracking-tight text-center">Magnus Boy&apos;s System</h1>
        <p className="text-sm text-slate-500 mt-1 text-center">Construction ERP</p>
      </div>
      <div className="w-48 h-1.5 bg-slate-200 rounded-full overflow-hidden">
        <div className="h-full bg-gradient-to-r from-red-500 to-blue-700 rounded-full" style={{ animation: "splashSlide 1.5s ease-in-out infinite" }}/>
      </div>
      <p className="text-xs text-slate-400 mt-4">Loading your workspace...</p>
    </div>
  );

  if (!authed) {
    const next = encodeURIComponent(loc.pathname + loc.search);
    return <Navigate to={`/login?next=${next}`} replace />;
  }

  if (companyClosed && !loc.pathname.startsWith("/hq")) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-6">
        <div className="max-w-sm text-center">
          <div className="text-4xl mb-4">🔒</div>
          <h1 className="text-lg font-semibold text-slate-800 dark:text-slate-100">This company account is closed</h1>
          <p className="text-sm text-slate-500 mt-2">
            Nobody can sign in to it right now. If you think this is a mistake, contact Magnus Boy&apos;s System support.
          </p>
          <button
            onClick={async () => { await supabase.auth.signOut(); nav("/login", { replace: true }); }}
            className="mt-6 px-4 py-2 rounded-lg bg-slate-900 text-white text-sm dark:bg-white dark:text-slate-900"
          >
            Sign out
          </button>
        </div>
      </div>
    );
  }

  // The Magnus HQ login's own company is a system company: its home is HQ, not a company dashboard.
  if (systemCompany && loc.pathname === "/") {
    return <Navigate to="/hq" replace />;
  }

  return <>{children}</>;
}

// --- Role-based route guards ---------------------------------------------------

function AccessRestricted() {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center">
      <div className="text-center p-8">
        <div className="text-4xl mb-4">🔒</div>
        <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-2">
          Access Restricted
        </h2>
        <p className="text-slate-500 text-sm">
          You don't have permission to access this page.
          <br/>Contact your administrator.
        </p>
      </div>
    </div>
  );
}

// Generic role-list guard — reads userRole from ProjectContext (populated
// from user_profiles.role in the same fetch that loads projects, so
// loadingProjects doubles as "is the role known yet").
function RoleGuard({
  allowedRoles,
  children,
}: {
  allowedRoles: string[];
  children: React.ReactNode;
}) {
  const { userRole, loadingProjects } = useProjectContext();
  if (loadingProjects) return null;
  if (!userRole || !allowedRoles.includes(userRole)) {
    return <AccessRestricted />;
  }
  return <>{children}</>;
}

// Root ("/") landing-page switch — NOT a block-or-allow guard like
// RoleGuard above; every role reaches a real page here, just a different
// one for directors. Non-directors get exactly today's DashboardPage,
// completely unchanged — this only decides WHICH page renders, it never
// shows AccessRestricted for "/".
function RootRoute() {
  const { userRole, loadingProjects } = useProjectContext();
  if (loadingProjects) return null;
  return canAccessDirectorDashboard(userRole) ? <DirectorDashboardPage /> : <DashboardPage />;
}

// Finance-specific guard — reuses the existing finance_access_level system
// (useFinanceAccess) already correctly enforced on FinanceTransactionsPage,
// rather than a second, parallel role-list check for the same feature area.
function FinanceGuard({
  level,
  children,
}: {
  level: "full" | "project";
  children: React.ReactNode;
}) {
  const { canAccessFullFinance, canAccessProjectFinance, loading } = useFinanceAccess();
  if (loading) return null;
  const allowed = level === "full" ? canAccessFullFinance : canAccessProjectFinance;
  if (!allowed) return <AccessRestricted />;
  return <>{children}</>;
}

// --- App ----------------------------------------------------------------------

// Magnus HQ traffic: anonymous count of which section of the app is used (no names, no ids).
function TrafficCounter() {
  const loc = useLocation();
  useEffect(() => { recordVisit(loc.pathname); }, [loc.pathname]);
  return null;
}

export default function App() {
  return (
    <ErrorBoundary context="Application">
      <ProjectProvider>
        <BrowserRouter>
          <AuthHashRouter />
          <TrafficCounter />
          <ProjectUrlSync />
          <UpdateBanner />
          <MaintenanceGate>
          <Routes>
            {/* Public */}
            <Route path="/verify/:workerId" element={<WorkerVerifyPage />} />
            <Route path="/v/:code" element={<IdVerifyPage />} />
            <Route path="/login"          element={<LoginPage />} />
            <Route path="/accept-invite"  element={<AcceptInvitePage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route path="/auth/confirm"   element={<AuthConfirmPage />} />

            {/* Standalone portals */}
            <Route path="/client/projects/:projectId" element={<RequireAuth><ClientProjectPage /></RequireAuth>} />
            {/* The worker portal: workers sign in with their worker number + PIN (no Supabase login, see lib/workerPortalApi.ts). The old /worker/portal page needed a staff-style login that cannot exist. */}
            <Route path="/get-app"                    element={<GetAppPage />} />{/* how to install the Magnus Workers Android app (mobile/) */}
            <Route path="/worker"                     element={<FeatureGate feature="worker_portal"><WorkerLoginPage /></FeatureGate>} />
            <Route path="/worker/home"                element={<FeatureGate feature="worker_portal"><WorkerHomePage /></FeatureGate>} />
            <Route path="/worker/portal"              element={<Navigate to="/worker" replace />} />
            <Route path="/field-ops"                  element={<ByCurrentProject><RequireAuth><FieldOpsPage /></RequireAuth></ByCurrentProject>} />
            <Route path="/field"                      element={<Navigate to="/field-payments" replace />} />

            {/* Protected app shell */}
            <Route element={<RequireAuth><AppLayout /></RequireAuth>}>
              <Route path="/"                       element={<RootRoute />} />

              {/* CRM */}
              <Route path="/clients"                element={<ClientsPage />} />
              <Route path="/projects"               element={<ProjectsPage />} />
              <Route path="/projects/:projectId"    element={<ByUrlProject><ProjectDashboardPage /></ByUrlProject>} />

              {/* Project-scoped */}
              <Route path="/projects/:projectId/boq"          element={<ByUrlProject><BOQPage /></ByUrlProject>} />
              <Route path="/projects/:projectId/takeoff"      element={<ByUrlProject><TakeoffPage /></ByUrlProject>} />
              <Route path="/projects/:projectId/procurement"  element={<ByUrlProject><ProcurementPage /></ByUrlProject>} />
              <Route path="/projects/:projectId/finance"      element={<ByUrlProject><FinanceGuard level="project"><FinancePage /></FinanceGuard></ByUrlProject>} />
              <Route path="/projects/:projectId/finance/transactions" element={<ByUrlProject><FinanceTransactionsPage /></ByUrlProject>} />
              <Route path="/projects/:projectId/finance/reports"      element={<ByUrlProject><FinanceGuard level="project"><FinanceReportsPage /></FinanceGuard></ByUrlProject>} />
              <Route path="/projects/:projectId/reports"      element={<ByUrlProject><ReportsPage /></ByUrlProject>} />
              <Route path="/projects/:projectId/files"        element={<ByUrlProject><ProjectFilesPage /></ByUrlProject>} />{/* Client BOQ + Statements folders */}

              {/* Estimating */}
              <Route path="/estimates"    element={<EstimatesPage />} />
              <Route path="/contracts"    element={<ContractsPage />} />
              <Route path="/boq"          element={<ByCurrentProject><BOQPage /></ByCurrentProject>} />
              <Route path="/takeoff"      element={<ByCurrentProject><TakeoffPage /></ByCurrentProject>} />
              <Route path="/assemblies"   element={<AssembliesPage />} />
              <Route path="/rates"        element={<RatesPage />} />

              {/* Procurement */}
              <Route path="/procurement"     element={<ByCurrentProject><ProcurementPage /></ByCurrentProject>} />
              <Route path="/receiving"       element={<ByCurrentProject><ReceivingPage /></ByCurrentProject>} />
              <Route path="/receiving/:id"   element={<ByCurrentProject><ReceivingPage /></ByCurrentProject>} />
              <Route path="/supplier-prices" element={<ByCurrentProject><SupplierPriceSyncPage /></ByCurrentProject>} />

              {/* Finance */}
              <Route path="/finance" element={<FinanceGuard level="full"><FinanceDashboardPage /></FinanceGuard>} />
              <Route path="/finance/journal-entry" element={<FinanceGuard level="full"><JournalEntryPage /></FinanceGuard>} />
              <Route path="/finance/transactions"    element={<ByCurrentProject><FinanceTransactionsPage /></ByCurrentProject>} />
              <Route path="/finance/reports"         element={<ByCurrentProject><FinanceGuard level="full"><FinanceReportsPage /></FinanceGuard></ByCurrentProject>} />
              <Route path="/expenses"                element={<FinanceGuard level="full"><ExpensesPage /></FinanceGuard>} />
              <Route path="/cash-flow"               element={<FinanceGuard level="full"><CashFlowPage /></FinanceGuard>} />
              <Route path="/finance/bank-accounts"   element={<FinanceGuard level="full"><BankAccountsPage /></FinanceGuard>} />
              <Route path="/finance/upload-statement" element={<FinanceGuard level="full"><UploadStatementPage /></FinanceGuard>} />
              <Route path="/finance/bank-review"     element={<FinanceGuard level="full"><BankReviewPage /></FinanceGuard>} />
              <Route path="/finance/reconcile"       element={<FinanceGuard level="full"><ReconcilePage /></FinanceGuard>} />
              <Route path="/accounts-receivable"     element={<FinanceGuard level="full"><AccountsReceivablePage /></FinanceGuard>} />
              <Route path="/accounts-payable"        element={<FinanceGuard level="full"><AccountsPayablePage /></FinanceGuard>} />
              <Route path="/field-payments"          element={<RoleGuard allowedRoles={["director","supervisor","site_user"]}><FieldPaymentsPage /></RoleGuard>} />
              <Route path="/payroll"                 element={<FeatureGate feature="payroll"><RoleGuard allowedRoles={[...PAYROLL_ROLES]}><PayrollPage /></RoleGuard></FeatureGate>} />

              {/* People */}
              <Route path="/workers"                 element={<RoleGuard allowedRoles={[...WORKERS_PAGE_ROLES]}><WorkersPage /></RoleGuard>} />
              <Route path="/attendance"              element={<RoleGuard allowedRoles={["director", "admin", "supervisor", "site_user", "office_user"]}><AttendancePage /></RoleGuard>} />
              <Route path="/suppliers"               element={<RoleGuard allowedRoles={["director","supervisor","site_user"]}><SuppliersPage /></RoleGuard>} />
              <Route path="/staff-portal"            element={<RoleGuard allowedRoles={["director","admin"]}><StaffPortalManagerPage /></RoleGuard>} />

              {/* Help */}
              <Route path="/help"                          element={<HelpCenterPage />} />
              {/* Every signed-in user's own signature - deliberately no role guard */}
              <Route path="/my-signature"                  element={<MySignaturePage />} />

              {/* Secretary Workspace — accessible to secretary/admin/director,
                  a normal route addition (not a root-route switch like the
                  Director Dashboard, since this is an additional nav
                  section, not a landing-page replacement). */}
              <Route path="/secretary"                     element={<RoleGuard allowedRoles={["secretary","admin","director"]}><SecretaryWorkspacePage /></RoleGuard>} />

              {/* Reports + Settings */}
              <Route path="/reports"                       element={<ReportsPage />} />
              <Route path="/billing"                       element={<MyPlanPage />} />
              <Route path="/upgrade"                       element={<MyPlanPage />} />
              {/* Let Magnus support look at the company read-only for 24 hours (directors / admins; the page checks). */}
              <Route path="/support-access"                element={<SupportAccessPage />} />
              <Route path="/materials-library" element={<Navigate to="/rates" replace />} />
              {/* Settings: one shell with a tab per section (company, branding, documents, estimates, payroll-rates, master-lists, users, records, notifications, import). */}
              {/* /settings opens the first tab; the old page URLs are the same tab ids, so they keep working. Two pages that no screen links to stay as they were. */}
              <Route path="/settings"                      element={<Navigate to="/settings/company" replace />} />
              <Route path="/settings/master-categories"    element={<RoleGuard allowedRoles={["director"]}><SettingsMasterCategoriesPage /></RoleGuard>} />
              <Route path="/settings/cost-codes"           element={<RoleGuard allowedRoles={["director"]}><SettingsCostCodesPage /></RoleGuard>} />
              <Route path="/settings/:tab"                 element={<RoleGuard allowedRoles={["director"]}><SettingsShell /></RoleGuard>} />

              {/* Admin / Payroll */}
              <Route path="/admin/jamaican-payroll-monitoring"          element={<FeatureGate feature="payroll"><JamaicanPayrollMonitoringPage /></FeatureGate>} />
              <Route path="/admin/payroll-comparison-review"            element={<FeatureGate feature="payroll"><PayrollComparisonReviewPage /></FeatureGate>} />
              <Route path="/admin/payroll-simulation-center"            element={<FeatureGate feature="payroll"><PayrollSimulationCenterPage /></FeatureGate>} />
              <Route path="/projects/:currentProjectId/admin/payroll-simulation-center" element={<FeatureGate feature="payroll"><ByUrlProject><PayrollSimulationCenterPage /></ByUrlProject></FeatureGate>} />
            </Route>

            <Route path="/portal/:token" element={<FeatureGate feature="client_portal"><ClientPortalPage /></FeatureGate>} />
            {/* A field officer's own invite link: signs in as that one contact, who sees only their assigned projects */}
            <Route path="/portal/contact/:contactToken" element={<FeatureGate feature="client_portal"><ClientPortalPage /></FeatureGate>} />
            {/* Public, no login: a photo share link (checked server-side by the photo-share-resolve function) */}
            <Route path="/shared/:token" element={<SharedPhotosPage />} />
            {/* Public, no login: a payment receipt link (checked by the get_public_receipt database function) */}
            <Route path="/receipt/:token" element={<FeatureGate feature="public_receipts"><PublicReceiptPage /></FeatureGate>} />
            <Route path="/client-login" element={<FeatureGate feature="client_portal"><ClientLoginPage /></FeatureGate>} />
            <Route path="/client-reset-password" element={<FeatureGate feature="client_portal"><ClientResetPasswordPage /></FeatureGate>} />
            {/* Session-based login (ClientLoginPage.tsx's email+password flow)
                is its own route with its own param name, distinct from
                /portal/:token's magic-link flow above — the two used to
                share this route as /client-portal/:clientId, which
                ClientPortalPage.tsx's useParams<{token}>() could never
                actually read (wrong param name), so a client logging in
                via email+password landed on a page stuck in "loading"
                forever. */}
            <Route path="/client-portal/session/:sessionToken" element={<FeatureGate feature="client_portal"><ClientPortalPage /></FeatureGate>} />
            {/* Staff pages: full-screen (no sidebar), login required */}
            <Route path="/projects/:projectId/site-visit" element={<ByUrlProject><RequireAuth><SiteVisitPage /></RequireAuth></ByUrlProject>} />
            <Route path="/projects/:projectId/plans" element={<ByUrlProject><RequireAuth><ProjectPlansPage /></RequireAuth></ByUrlProject>} />
            <Route path="/projects/:projectId/issues" element={<ByUrlProject><RequireAuth><ProjectIssuesPage /></RequireAuth></ByUrlProject>} />
            <Route path="/projects/:projectId/logs" element={<ByUrlProject><RequireAuth><ProjectLogsPage /></RequireAuth></ByUrlProject>} />
            <Route path="/projects/:projectId/photos" element={<ByUrlProject><RequireAuth><ProjectPhotosPage /></RequireAuth></ByUrlProject>} />
            <Route path="/access-log" element={<RequireAuth><AccessLogPage /></RequireAuth>} />
            {/* Magnus HQ: platform admins only, 2-step login required. Not wrapped in RequireAuth on purpose:
                signed-out visitors and non-admins are sent to "/" exactly like an unknown address. */}
            <Route path="/hq" element={<Suspense fallback={null}><HQPage /></Suspense>} />
            <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
          </MaintenanceGate>
        </BrowserRouter>
      </ProjectProvider>
    </ErrorBoundary>
  );
}
