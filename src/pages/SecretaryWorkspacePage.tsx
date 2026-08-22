// src/pages/SecretaryWorkspacePage.tsx
import React, { useEffect, useState } from "react";
import { useProjectContext } from "../context/ProjectContext";
import { canAccessSecretaryWorkspace, canApproveSecretaryDocuments } from "../lib/permissions";
import { PageHeader, Tabs, Card, Badge } from "../components/ui";
import { AlertCircle } from "lucide-react";
import { supabase } from "../lib/supabase";
import CorrespondenceSection from "./secretary/CorrespondenceSection";
import WorkerAdminSection from "./secretary/WorkerAdminSection";
import ComplianceSection from "./secretary/ComplianceSection";
import SchedulingSection from "./secretary/SchedulingSection";
import TaskTrackerSection from "./secretary/TaskTrackerSection";
import MeetingMinutesSection from "./secretary/MeetingMinutesSection";

type SecretaryTab = "correspondence" | "workers" | "compliance" | "scheduling" | "tasks" | "minutes";

export default function SecretaryWorkspacePage() {
  const { userRole, loadingProjects } = useProjectContext();
  const [tab, setTab] = useState<SecretaryTab>("correspondence");

  // Real count, replacing the Stage 1 hardcoded placeholder — covers only
  // secretary_documents (Correspondence). AppLayout.tsx's nav badge is a
  // separate, still-hardcoded placeholder (out of scope for this section
  // pass, see its own TODO) — the two will disagree until that's wired too.
  const [pendingApprovals, setPendingApprovals] = useState<number>(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase
        .from("user_profiles").select("company_id").eq("id", user.id).maybeSingle();
      if (!profile?.company_id) return;
      const { count } = await supabase
        .from("secretary_documents")
        .select("id", { count: "exact", head: true })
        .eq("company_id", profile.company_id)
        .eq("status", "pending_approval");
      if (!cancelled) setPendingApprovals(count || 0);
    })();
    return () => { cancelled = true; };
  }, [tab]);

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
          canApprove && pendingApprovals > 0 ? (
            <Badge color="amber" dot>{pendingApprovals} pending approval{pendingApprovals === 1 ? "" : "s"}</Badge>
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
        {canApprove && pendingApprovals > 0 && (
          <Card onClick={() => setTab("correspondence")} className="cursor-pointer hover:border-amber-300 dark:hover:border-amber-500/30 transition-colors">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center flex-shrink-0">
                <AlertCircle size={16} className="text-amber-400" />
              </div>
              <div>
                <div className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                  {pendingApprovals} document{pendingApprovals === 1 ? "" : "s"} awaiting your approval
                </div>
                <div className="text-xs text-slate-500">Real count from secretary_documents — click to review in Correspondence.</div>
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
