import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { ArrowLeft, AlertTriangle, CheckCircle2, Plus } from "lucide-react";

export default function ProjectIssuesPage() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const [issues, setIssues] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<"all"|"open"|"resolved">("all");
  const [severityFilter, setSeverityFilter] = useState<"all"|"low"|"medium"|"high">("all");
  const [projectName, setProjectName] = useState("");
  const [showNewIssueModal, setShowNewIssueModal] = useState(false);
  const [issueText, setIssueText] = useState("");
  const [issueSeverity, setIssueSeverity] = useState<"low"|"medium"|"high">("medium");

  useEffect(() => { loadIssues(); loadProject(); }, [projectId]);

  async function loadProject() {
    const { data } = await supabase.from("projects").select("name").eq("id", projectId!).single();
    if (data) setProjectName(data.name);
  }

  async function loadIssues() {
    setLoading(true);
    const { data } = await supabase
      .from("project_issues")
      .select("*")
      .eq("project_id", projectId!)
      .order("reported_at", { ascending: false });
    setIssues(data || []);
    setLoading(false);
  }

  async function markResolved(id: string) {
    await supabase.from("project_issues").update({ status: "resolved" }).eq("id", id);
    loadIssues();
  }

  async function submitIssue() {
    if (!issueText.trim()) return;
    const { data: { user } } = await supabase.auth.getUser();
    const { data: profile } = await supabase.from("user_profiles").select("company_id").eq("id", user!.id).single();
    const { error } = await supabase.from("project_issues").insert({
      project_id: projectId,
      company_id: profile?.company_id,
      description: issueText,
      severity: issueSeverity,
      reported_at: new Date().toISOString(),
      status: "open",
    });
    if (error) { alert("Failed to log issue."); return; }
    setIssueText("");
    setIssueSeverity("medium");
    setShowNewIssueModal(false);
    loadIssues();
  }

  const filtered = issues.filter(i => {
    if (statusFilter !== "all" && i.status !== statusFilter) return false;
    if (severityFilter !== "all" && i.severity !== severityFilter) return false;
    return true;
  });

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-4 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate(`/projects/${projectId}`)}
          className="p-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
          <ArrowLeft size={18} className="text-slate-600 dark:text-slate-300"/>
        </button>
        <div>
          <h1 className="text-lg font-bold text-slate-800 dark:text-slate-100">Issues & Delays</h1>
          <p className="text-xs text-slate-500">{projectName}</p>
        </div>
        <button onClick={() => setShowNewIssueModal(true)}
          className="ml-auto flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-xl transition-colors">
          <Plus size={16}/> Log Issue
        </button>
      </div>

      {/* Status filter tabs */}
      <div className="flex gap-2 mb-3">
        {(["all","open","resolved"] as const).map(s => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={`px-4 py-1.5 rounded-full text-xs font-semibold capitalize transition-colors ${
              statusFilter === s
                ? "bg-slate-800 dark:bg-slate-100 text-white dark:text-slate-900"
                : "bg-white dark:bg-slate-800 text-slate-500 border border-slate-200 dark:border-slate-700"
            }`}>{s}</button>
        ))}
      </div>

      {/* Severity filter */}
      <div className="flex gap-2 mb-5">
        {(["all","low","medium","high"] as const).map(s => (
          <button key={s} onClick={() => setSeverityFilter(s)}
            className={`px-3 py-1 rounded-full text-xs font-semibold capitalize transition-colors ${
              severityFilter === s
                ? s === "high" ? "bg-red-500 text-white"
                  : s === "medium" ? "bg-yellow-500 text-white"
                  : s === "low" ? "bg-blue-500 text-white"
                  : "bg-slate-800 dark:bg-slate-100 text-white dark:text-slate-900"
                : "bg-white dark:bg-slate-800 text-slate-500 border border-slate-200 dark:border-slate-700"
            }`}>{s}</button>
        ))}
      </div>

      {/* Issues list */}
      {loading ? (
        <div className="text-center py-12 text-slate-400 text-sm">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12">
          <CheckCircle2 size={40} className="mx-auto text-slate-300 mb-3"/>
          <p className="text-slate-500 text-sm">No issues found</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(issue => (
            <div key={issue.id} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4">
              <div className="flex items-start gap-3">
                <span className={`mt-1 w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                  issue.severity === "high" ? "bg-red-500" :
                  issue.severity === "medium" ? "bg-yellow-500" : "bg-blue-400"
                }`}/>
                <div className="flex-1">
                  <p className="text-sm text-slate-700 dark:text-slate-200">{issue.description}</p>
                  <div className="flex items-center gap-3 mt-2">
                    <span className="text-xs text-slate-400">{new Date(issue.reported_at).toLocaleDateString()}</span>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                      issue.severity === "high" ? "bg-red-100 dark:bg-red-500/20 text-red-600 dark:text-red-400" :
                      issue.severity === "medium" ? "bg-yellow-100 dark:bg-yellow-500/20 text-yellow-600 dark:text-yellow-400" :
                      "bg-blue-100 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400"
                    }`}>{issue.severity}</span>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                      issue.status === "open"
                        ? "bg-orange-100 dark:bg-orange-500/20 text-orange-600 dark:text-orange-400"
                        : "bg-green-100 dark:bg-green-500/20 text-green-600 dark:text-green-400"
                    }`}>{issue.status}</span>
                  </div>
                </div>
                {issue.status === "open" && (
                  <button onClick={() => markResolved(issue.id)}
                    className="flex-shrink-0 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-semibold rounded-lg transition-colors">
                    Resolve
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* New Issue Modal */}
      {showNewIssueModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <div className="flex items-center gap-2 mb-4">
              <AlertTriangle size={18} className="text-red-500"/>
              <h2 className="text-base font-bold text-slate-800 dark:text-slate-100">Log Issue / Delay</h2>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium text-slate-500 mb-2 block">Severity</label>
                <div className="flex gap-2">
                  {(["low","medium","high"] as const).map(s => (
                    <button key={s} onClick={() => setIssueSeverity(s)}
                      className={`flex-1 py-2 rounded-lg text-xs font-semibold capitalize transition-colors ${
                        issueSeverity === s
                          ? s === "high" ? "bg-red-500 text-white"
                            : s === "medium" ? "bg-yellow-500 text-white"
                            : "bg-blue-500 text-white"
                          : "bg-slate-100 dark:bg-slate-800 text-slate-500"
                      }`}>{s}</button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500 mb-1 block">Description</label>
                <textarea value={issueText} onChange={e => setIssueText(e.target.value)}
                  placeholder="Describe the issue or delay..."
                  className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-slate-800 dark:text-slate-200 resize-none h-28 focus:outline-none focus:ring-2 focus:ring-red-500/30"/>
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setShowNewIssueModal(false)}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-sm text-slate-500">Cancel</button>
              <button onClick={submitIssue}
                className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-semibold transition-colors">Submit Issue</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
