import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  getCommittedDeliveredSummary,
  getCategoryBreakdown,
  type CommittedDeliveredSummary,
  type CategoryBreakdown,
} from "../lib/costs";
import { supabase } from "../lib/supabase";
import { useProjectContext } from "../context/ProjectContext";

export default function FinancePage() {
const { projectId: routeProjectId } = useParams<{ projectId?: string }>();
const projectId = routeProjectId || currentProjectId;
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [projectName, setProjectName] = useState<string>("");
  const [summary, setSummary] = useState<CommittedDeliveredSummary>({
    total_budget: 0,
    committed_value: 0,
    delivered_value: 0,
    remaining_budget: 0,
    variance: 0,
  });
  const [categoryBreakdown, setCategoryBreakdown] = useState<CategoryBreakdown[]>([]);
  const { currentProjectId, currentProject } = useProjectContext();

  if (!currentProjectId) {
  return (
    <div className="p-6 text-sm text-slate-500">
      Please select a project from the top bar before using Finance.
    </div>
  );
}

  useEffect(() => {
    if (projectId) {
      loadData();
    } else {
      setLoading(false);
    }
  }, [projectId]);

  async function loadData() {
    if (!projectId) return;

    setLoading(true);
    try {
      const { data: project } = await supabase
        .from("projects")
        .select("name")
        .eq("id", projectId)
        .single();

      if (project) {
        setProjectName(project.name || "");
      }

      const summaryData = await getCommittedDeliveredSummary(projectId);
      setSummary(summaryData);

      const breakdown = await getCategoryBreakdown(projectId);
      setCategoryBreakdown(breakdown);
    } catch (e) {
      console.error("Error loading finance data:", e);
    } finally {
      setLoading(false);
    }
  }

  function formatCurrency(value: number) {
    return value.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  if (!projectId) {
    return (
      <div className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">Finance</h1>

            {currentProject && (
  <div className="mt-2 text-sm text-slate-500 dark:text-slate-400">
    Project:{" "}
    <span className="font-semibold text-slate-700 dark:text-slate-200">
      {currentProject.name}
    </span>
  </div>
)}
            <p className="text-slate-400 mt-1">Select a project to view financial details</p>
          </div>
        </div>

        <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/30 p-8 text-center">
          <p className="text-sm text-slate-400">
            Please select a project from the projects page
          </p>
          <button
            onClick={() => navigate("/projects")}
            className="mt-4 px-3 py-2 rounded-xl bg-slate-800/60 hover:bg-slate-800 text-sm"
          >
            Go to Projects
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-semibold">Finance</h1>
          <p className="text-slate-400 mt-1">
            {projectName ? `${projectName} - ` : ""}Budget, commitments, and delivery tracking
          </p>
        </div>

        <button
          onClick={() => navigate(`/projects/${projectId}`)}
          className="px-3 py-2 rounded-xl bg-slate-800/60 hover:bg-slate-800 text-sm"
        >
          Back to Project
        </button>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/30 p-8 text-center">
          <p className="text-slate-400">Loading financial data...</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-5 gap-4 mb-6">
            <div className="rounded-xl border border-slate-800 bg-slate-900/30 p-4">
              <div className="text-xs text-slate-400 mb-1">Budget / Estimated</div>
              <div className="text-2xl font-semibold mt-1">
                ${formatCurrency(summary.total_budget)}
              </div>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-900/30 p-4">
              <div className="text-xs text-slate-400 mb-1">Committed PO Value</div>
              <div className="text-2xl font-semibold mt-1 text-blue-400">
                ${formatCurrency(summary.committed_value)}
              </div>
              <div className="text-xs text-slate-500 mt-1">
                {summary.total_budget > 0
                  ? `${((summary.committed_value / summary.total_budget) * 100).toFixed(1)}% of budget`
                  : "—"}
              </div>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-900/30 p-4">
              <div className="text-xs text-slate-400 mb-1">Delivered Value</div>
              <div className="text-2xl font-semibold mt-1 text-emerald-400">
                ${formatCurrency(summary.delivered_value)}
              </div>
              <div className="text-xs text-slate-500 mt-1">
                {summary.committed_value > 0
                  ? `${((summary.delivered_value / summary.committed_value) * 100).toFixed(1)}% delivered`
                  : "—"}
              </div>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-900/30 p-4">
              <div className="text-xs text-slate-400 mb-1">Remaining Budget</div>
              <div className="text-2xl font-semibold mt-1">
                ${formatCurrency(summary.remaining_budget)}
              </div>
              <div className="text-xs text-slate-500 mt-1">
                {summary.total_budget > 0
                  ? `${((summary.remaining_budget / summary.total_budget) * 100).toFixed(1)}% remaining`
                  : "—"}
              </div>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-900/30 p-4">
              <div className="text-xs text-slate-400 mb-1">Variance</div>
              <div
                className={
                  "text-2xl font-semibold mt-1 " +
                  (summary.variance >= 0 ? "text-emerald-400" : "text-red-400")
                }
              >
                ${formatCurrency(Math.abs(summary.variance))}
              </div>
              <div className="text-xs text-slate-500 mt-1">
                {summary.variance >= 0 ? "Under budget" : "Over budget"}
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/30 p-6">
            <h3 className="font-semibold mb-4">Financial Progress</h3>

            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between text-sm mb-2">
                  <span className="text-slate-400">Committed</span>
                  <span className="font-medium">
                    ${formatCurrency(summary.committed_value)} of ${formatCurrency(summary.total_budget)}
                  </span>
                </div>
                <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
                  <div
                    className="h-full bg-blue-500 transition-all"
                    style={{
                      width: summary.total_budget > 0
                        ? `${Math.min((summary.committed_value / summary.total_budget) * 100, 100)}%`
                        : "0%",
                    }}
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between text-sm mb-2">
                  <span className="text-slate-400">Delivered</span>
                  <span className="font-medium">
                    ${formatCurrency(summary.delivered_value)} of ${formatCurrency(summary.committed_value)}
                  </span>
                </div>
                <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 transition-all"
                    style={{
                      width: summary.committed_value > 0
                        ? `${Math.min((summary.delivered_value / summary.committed_value) * 100, 100)}%`
                        : "0%",
                    }}
                  />
                </div>
              </div>
            </div>
          </div>

          {categoryBreakdown.length > 0 && (
            <div className="rounded-2xl border border-slate-800 bg-slate-900/30 overflow-hidden mt-6">
              <div className="px-6 py-4 border-b border-slate-800 bg-slate-900/50">
                <h3 className="font-semibold">Category Breakdown</h3>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-800 text-left text-xs text-slate-400">
                      <th className="px-6 py-3 font-medium">Category</th>
                      <th className="px-6 py-3 font-medium text-right">Committed</th>
                      <th className="px-6 py-3 font-medium text-right">Delivered</th>
                      <th className="px-6 py-3 font-medium text-right">Remaining</th>
                      <th className="px-6 py-3 font-medium text-right">Progress</th>
                    </tr>
                  </thead>
                  <tbody>
                    {categoryBreakdown.map((cat) => {
                      const progress = cat.committed > 0
                        ? (cat.delivered / cat.committed) * 100
                        : 0;

                      return (
                        <tr
                          key={cat.category}
                          className="border-b border-slate-800/50 hover:bg-slate-900/50"
                        >
                          <td className="px-6 py-3">
                            <div className="font-medium text-sm">
                              {cat.category || "Uncategorized"}
                            </div>
                          </td>
                          <td className="px-6 py-3 text-right">
                            <div className="text-sm">${formatCurrency(cat.committed)}</div>
                          </td>
                          <td className="px-6 py-3 text-right">
                            <div className="text-sm text-emerald-400">
                              ${formatCurrency(cat.delivered)}
                            </div>
                          </td>
                          <td className="px-6 py-3 text-right">
                            <div className="text-sm">${formatCurrency(cat.remaining)}</div>
                          </td>
                          <td className="px-6 py-3 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <div className="w-24 h-1.5 rounded-full bg-slate-800 overflow-hidden">
                                <div
                                  className="h-full bg-emerald-500 transition-all"
                                  style={{ width: `${Math.min(progress, 100)}%` }}
                                />
                              </div>
                              <span className="text-xs text-slate-400 w-12 text-right">
                                {progress.toFixed(0)}%
                              </span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-slate-700 bg-slate-900/50">
                      <td className="px-6 py-3 text-sm font-semibold">Total</td>
                      <td className="px-6 py-3 text-right text-sm font-semibold">
                        ${formatCurrency(categoryBreakdown.reduce((sum, cat) => sum + cat.committed, 0))}
                      </td>
                      <td className="px-6 py-3 text-right text-sm font-semibold text-emerald-400">
                        ${formatCurrency(categoryBreakdown.reduce((sum, cat) => sum + cat.delivered, 0))}
                      </td>
                      <td className="px-6 py-3 text-right text-sm font-semibold">
                        ${formatCurrency(categoryBreakdown.reduce((sum, cat) => sum + cat.remaining, 0))}
                      </td>
                      <td className="px-6 py-3"></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
