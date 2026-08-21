// src/pages/DirectorDashboardPage.tsx
//
// Director-only landing page — App.tsx's root "/" route switches between
// this and the existing DashboardPage based on userRole (director vs
// everyone else, unchanged). This component also checks the role directly
// itself, same defense-in-depth idiom SettingsPage.tsx already uses ("the
// route itself is already wrapped in a RoleGuard... but this page also
// checks directly in case it's ever rendered from somewhere that isn't
// route-guarded") — in case this is ever reached some other way.
//
// Stage 1 (this file): layout and navigation only, every card below is a
// separate component under src/pages/dashboard/ with hardcoded placeholder
// data and its own TODO pointing at the real Stage 2 data source. No real
// Supabase queries here beyond the role check itself.
import React from "react";
import { useProjectContext } from "../context/ProjectContext";
import { canAccessDirectorDashboard } from "../lib/permissions";
import { PageHeader } from "../components/ui";
import AISummaryBanner from "./dashboard/AISummaryBanner";
import CashPositionCard from "./dashboard/CashPositionCard";
import PnLOverviewCard from "./dashboard/PnLOverviewCard";
import ProjectHealthCard from "./dashboard/ProjectHealthCard";
import ReceivablesPayablesCard from "./dashboard/ReceivablesPayablesCard";
import PayrollComplianceCard from "./dashboard/PayrollComplianceCard";
import WorkforceSnapshotCard from "./dashboard/WorkforceSnapshotCard";
import OwnerDrawsCard from "./dashboard/OwnerDrawsCard";
import NeedsAttentionCard from "./dashboard/NeedsAttentionCard";

export default function DirectorDashboardPage() {
  const { userRole, loadingProjects } = useProjectContext();

  if (!loadingProjects && !canAccessDirectorDashboard(userRole)) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-8">
        <div className="text-center">
          <div className="text-5xl mb-4">🔒</div>
          <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-2">Access Restricted</h2>
          <p className="text-sm text-slate-500">You don't have permission to access this page.<br />Contact your administrator.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#080b10]">
      {/* Same restrained navy/gold brand accent as DashboardPage.tsx's own
          header bar, for visual consistency across the two landing pages. */}
      <div className="h-[3px] bg-gradient-to-r from-[#C9A84C] via-[#C9A84C]/40 to-transparent" />
      <PageHeader title="Director Dashboard" subtitle="Company-wide financial and operational overview" />

      <div className="p-6 space-y-5">
        <AISummaryBanner />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <CashPositionCard />
          <PnLOverviewCard />
        </div>

        <ProjectHealthCard />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <ReceivablesPayablesCard />
          <PayrollComplianceCard />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <WorkforceSnapshotCard />
          <OwnerDrawsCard />
          <NeedsAttentionCard />
        </div>
      </div>
    </div>
  );
}
