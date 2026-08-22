// src/pages/SecretaryWorkspacePage.tsx
import React, { useState } from "react";
import { useProjectContext } from "../context/ProjectContext";
import { canAccessSecretaryWorkspace, canApproveSecretaryDocuments } from "../lib/permissions";
import { PageHeader, Tabs, Card, Badge } from "../components/ui";
import { AlertCircle } from "lucide-react";
import CorrespondenceSection from "./secretary/CorrespondenceSection";
import WorkerAdminSection from "./secretary/WorkerAdminSection";
import ComplianceSection from "./secretary/ComplianceSection";
import SchedulingSection from "./secretary/SchedulingSection";
import TaskTrackerSection from "./secretary/TaskTrackerSection";
import MeetingMinutesSection from "./secretary/MeetingMinutesSection";

type SecretaryTab = "correspondence" | "workers" | "compliance" | "scheduling" | "tasks" | "minutes";

// TODO: Stage 2 — replace with a real count query against
// secretary_documents WHERE status = 'pending_approval', company-scoped —
// same placeholder-now/real-later pattern as every Director Dashboard
// card's Stage 1 round. Also drives the nav badge in AppLayout.tsx,
// which currently uses the same hardcoded placeholder value — keep both
// in sync once this is wired for real, or better, lift the real fetch
// into one shared place both can read from.
const PLACEHOLDER_PENDING_APPROVALS = 1;

export default function SecretaryWorkspacePage() {
  const { userRole, loadingProjects } = useProjectContext();
  const [tab, setTab] = useState<SecretaryTab>("correspondence");

  // Defense in depth — the "/secretary" route is already wrapped in a
  // RoleGuard in App.tsx, but this page also checks directly in case
  // it's ever rendered from somewhere that isn't route-guarded, same
  // established pattern as SettingsPage.tsx and DirectorDashboardPage.tsx.
  if (!loadingProjects && !canAccessSecretaryWorkspace(userRole)) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-8">
        <div className="text-center">
          <div className="text-5xl mb-4">🔒</div>
          <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-2">Access Restricted</h2>
          <p className="text-sm text-slate-500">You don't have permission to access this page.<br/>Contact your administrator.</p>
        </div>
      </div>
    );
  }

  const canApprove = canApproveSecretaryDocuments(userRole);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#080b10]">
      <PageHeader
        title="Secretary Workspace"
        subtitle="Correspondence, worker admin, compliance, scheduling, tasks, and meeting minutes"
        actions={
          canApprove && PLACEHOLDER_PENDING_APPROVALS > 0 ? (
            <Badge color="amber" dot>{PLACEHOLDER_PENDING_APPROVALS} pending approval{PLACEHOLDER_PENDING_APPROVALS === 1 ? "" : "s"}</Badge>
          ) : undefined
        }
      />

      <div className="px-4 sm:px-6">
        <Tabs
          tabs={[
            { key: "correspondence" as SecretaryTab, label: "Correspondence" },
            { key: "workers" as SecretaryTab,        label: "Worker Admin" },
            { key: "compliance" as SecretaryTab,      label: "Compliance" },
            { key: "scheduling" as SecretaryTab,      label: "Scheduling" },
            { key: "tasks" as SecretaryTab,           label: "Tasks" },
            { key: "minutes" as SecretaryTab,         label: "Meeting Minutes" },
          ]}
          active={tab}
          onChange={setTab}
        />
      </div>

      <div className="p-6 max-w-5xl mx-auto space-y-5">
        {canApprove && (
          <Card>
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center flex-shrink-0">
                <AlertCircle size={16} className="text-amber-400" />
              </div>
              <div>
                {/* TODO: Stage 2 — real pending-approval list, filtered
                    to secretary_documents where status='pending_approval',
                    with Approve/Reject actions that write the status
                    transition (validated server-side by
                    validate_secretary_document_status_transition()). */}
                <div className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                  {PLACEHOLDER_PENDING_APPROVALS} document{PLACEHOLDER_PENDING_APPROVALS === 1 ? "" : "s"} awaiting your approval
                </div>
                <div className="text-xs text-slate-500">Placeholder — Stage 2 wires this to real secretary_documents rows.</div>
              </div>
            </div>
          </Card>
        )}

        {tab === "correspondence" && <CorrespondenceSection />}
        {tab === "workers" && <WorkerAdminSection />}
        {tab === "compliance" && <ComplianceSection />}
        {tab === "scheduling" && <SchedulingSection />}
        {tab === "tasks" && <TaskTrackerSection />}
        {tab === "minutes" && <MeetingMinutesSection />}
      </div>
    </div>
  );
}
