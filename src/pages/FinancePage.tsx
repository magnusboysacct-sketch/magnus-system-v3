import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useProjectContext } from "../context/ProjectContext";
import { getCommittedDeliveredSummary, getCategoryBreakdown } from "../lib/costs";

function numOr(value: unknown, fallback = 0): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function formatCurrency(value: number) {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export default function FinancePage() {
  const navigate = useNavigate();
  const { projectId: routeProjectId } = useParams<{ projectId?: string }>();
  const { currentProjectId, currentProject } = useProjectContext();

  const projectId = routeProjectId || currentProjectId || null;

  const [loading, setLoading] = useState(true);
  const [projectName, setProjectName] = useState("");
  const [summary, setSummary] = useState({
    total_budget: 0,
    committed_value: 0,
    delivered_value: 0,
    remaining_budget: 0,
    variance: 0,
  });
  const [categories, setCategories] = useState<Array<{
    category: string;
    committed: number;
    delivered: number;
    remaining: number;
  }>>([]);
  const [error, setError] = useState<string | null>(null);
  const [costControlItems, setCostControlItems] = useState<
  Array<{
    cost_category: string;
    cost_code: string;
    item_name: string;
    budget_amount: number;
    committed_amount: number;
    delivered_amount: number;
    paid_amount: number;
    remaining_budget_after_commit: number;
    remaining_budget_after_delivery: number;
    undelivered_committed_amount: number;
    over_delivery_variance: number;
    over_commitment_variance: number;
  }>
>([]);


  useEffect(() => {
    let alive = true;

    async function loadFinanceData() {
      if (!projectId) {
        if (!alive) return;
        setProjectName("");
        setSummary({
          total_budget: 0,
          committed_value: 0,
          delivered_value: 0,
          remaining_budget: 0,
          variance: 0,
        });
        setCategories([]);
        setCostControlItems([]);
        setError(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const { data: projectRow, error: projectError } = await supabase
          .from("projects")
          .select("name")
          .eq("id", projectId)
          .maybeSingle();

        if (projectError) throw projectError;

        const summaryData = await getCommittedDeliveredSummary(projectId);
        const categoryData = await getCategoryBreakdown(projectId);
                const { data: itemRows, error: itemsError } = await supabase
          .from("v_cost_control_items")
          .select(`
            cost_category,
            cost_code,
            item_name,
            budget_amount,
            committed_amount,
            delivered_amount,
            paid_amount,
            remaining_budget_after_commit,
            remaining_budget_after_delivery,
            undelivered_committed_amount,
            over_delivery_variance,
            over_commitment_variance
          `)
          .eq("project_id", projectId)
          .order("cost_category", { ascending: true })
          .order("item_name", { ascending: true });

        if (itemsError) throw itemsError;

        if (!alive) return;

        setProjectName(String(projectRow?.name ?? ""));
        setSummary(summaryData);
        setCategories(categoryData);
                setCostControlItems(
          (itemRows ?? []).map((row: any) => ({
            cost_category: String(row.cost_category ?? "Uncategorized"),
            cost_code: String(row.cost_code ?? ""),
            item_name: String(row.item_name ?? "Unnamed Item"),
            budget_amount: Number(row.budget_amount ?? 0),
            committed_amount: Number(row.committed_amount ?? 0),
            delivered_amount: Number(row.delivered_amount ?? 0),
            paid_amount: Number(row.paid_amount ?? 0),
            remaining_budget_after_commit: Number(row.remaining_budget_after_commit ?? 0),
            remaining_budget_after_delivery: Number(row.remaining_budget_after_delivery ?? 0),
            undelivered_committed_amount: Number(row.undelivered_committed_amount ?? 0),
            over_delivery_variance: Number(row.over_delivery_variance ?? 0),
            over_commitment_variance: Number(row.over_commitment_variance ?? 0),
          }))
        );
      } catch (e: any) {
        console.error("[Finance] loadFinanceData failed:", e);
        if (!alive) return;
        setError(e?.message ?? "Failed to load finance data");
        setSummary({
          total_budget: 0,
          committed_value: 0,
          delivered_value: 0,
          remaining_budget: 0,
          variance: 0,
        });
        setCategories([]);
        setCostControlItems([]);
      } finally {
        if (alive) setLoading(false);
      }
    }
    void loadFinanceData();

    return () => {
      alive = false;
    };
  }, [projectId]);

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
          <p className="text-sm text-slate-400">Please select a project from the projects page</p>
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

          {currentProject && (
            <div className="mt-2 text-sm text-slate-500 dark:text-slate-400">
              Project:{" "}
              <span className="font-semibold text-slate-700 dark:text-slate-200">
                {currentProject.name}
              </span>
            </div>
          )}

          <p className="text-slate-400 mt-1">
            {projectName ? `${projectName} - ` : ""}
            Budget, commitments, and delivery tracking
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
          {error && (
            <div className="mb-4 rounded-xl border border-red-800 bg-red-900/20 p-4">
              <p className="text-sm text-red-400">Error: {error}</p>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-5 gap-3 mb-6">
            <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
              <div className="text-xs text-slate-400">Budget</div>
              <div className="mt-1 text-lg font-semibold text-white">
                ${formatCurrency(numOr(summary.total_budget))}
              </div>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
              <div className="text-xs text-slate-400">Committed</div>
              <div className="mt-1 text-lg font-semibold text-white">
                ${formatCurrency(numOr(summary.committed_value))}
              </div>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
              <div className="text-xs text-slate-400">Delivered</div>
              <div className="mt-1 text-lg font-semibold text-white">
                ${formatCurrency(numOr(summary.delivered_value))}
              </div>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
              <div className="text-xs text-slate-400">Remaining</div>
              <div className="mt-1 text-lg font-semibold text-white">
                ${formatCurrency(numOr(summary.remaining_budget))}
              </div>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
              <div className="text-xs text-slate-400">Variance</div>
              <div
                className={
                  "mt-1 text-lg font-semibold " +
                  (summary.variance >= 0 ? "text-emerald-400" : "text-red-400")
                }
              >
                ${formatCurrency(Math.abs(summary.variance))}
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
                      width:
                        summary.total_budget > 0
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
                      width:
                        summary.committed_value > 0
                          ? `${Math.min((summary.delivered_value / summary.committed_value) * 100, 100)}%`
                          : "0%",
                    }}
                  />
                </div>
              </div>
            </div>
          </div>

          {categories.length > 0 && (
            <div className="rounded-2xl border border-slate-800 bg-slate-900/30 overflow-hidden mt-6">
              <div className="px-6 py-4 border-b border-slate-800 bg-slate-900/50">
                <h3 className="font-semibold">Category Breakdown</h3>
              </div>
                        {costControlItems.length > 0 && (
            <div className="rounded-2xl border border-slate-800 bg-slate-900/30 overflow-hidden mt-6">
              <div className="px-6 py-4 border-b border-slate-800 bg-slate-900/50">
                <h3 className="font-semibold">Item Breakdown</h3>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-800 text-left text-xs text-slate-400">
                      <th className="px-6 py-3 font-medium">Category</th>
                      <th className="px-6 py-3 font-medium">Code</th>
                      <th className="px-6 py-3 font-medium">Item</th>
                      <th className="px-6 py-3 font-medium text-right">Budget</th>
                      <th className="px-6 py-3 font-medium text-right">Committed</th>
                      <th className="px-6 py-3 font-medium text-right">Delivered</th>
                      <th className="px-6 py-3 font-medium text-right">Remaining</th>
                    </tr>
                  </thead>
                  <tbody>
                    {costControlItems.map((row, idx) => (
                      <tr
                        key={`${row.cost_category}-${row.cost_code}-${row.item_name}-${idx}`}
                        className="border-b border-slate-800/50 hover:bg-slate-900/50"
                      >
                        <td className="px-6 py-3 text-sm">
                          {row.cost_category || "Uncategorized"}
                        </td>
                        <td className="px-6 py-3 text-sm text-slate-400">
                          {row.cost_code || "—"}
                        </td>
                        <td className="px-6 py-3 text-sm">
                          {row.item_name || "Unnamed Item"}
                        </td>
                        <td className="px-6 py-3 text-right text-sm">
                          ${formatCurrency(row.budget_amount)}
                        </td>
                        <td className="px-6 py-3 text-right text-sm">
                          ${formatCurrency(row.committed_amount)}
                        </td>
                        <td className="px-6 py-3 text-right text-sm text-emerald-400">
                          ${formatCurrency(row.delivered_amount)}
                        </td>
                        <td className="px-6 py-3 text-right text-sm">
                          ${formatCurrency(row.remaining_budget_after_delivery)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-slate-700 bg-slate-900/50">
                      <td className="px-6 py-3 text-sm font-semibold" colSpan={3}>
                        Total
                      </td>
                      <td className="px-6 py-3 text-right text-sm font-semibold">
                        ${formatCurrency(costControlItems.reduce((sum, row) => sum + row.budget_amount, 0))}
                      </td>
                      <td className="px-6 py-3 text-right text-sm font-semibold">
                        ${formatCurrency(costControlItems.reduce((sum, row) => sum + row.committed_amount, 0))}
                      </td>
                      <td className="px-6 py-3 text-right text-sm font-semibold text-emerald-400">
                        ${formatCurrency(costControlItems.reduce((sum, row) => sum + row.delivered_amount, 0))}
                      </td>
                      <td className="px-6 py-3 text-right text-sm font-semibold">
                        ${formatCurrency(
                          costControlItems.reduce(
                            (sum, row) => sum + row.remaining_budget_after_delivery,
                            0
                          )
                        )}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}

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
                    {categories.map((cat) => {
                      const progress =
                        cat.committed > 0
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
                          <td className="px-6 py-3 text-right text-sm">
                            ${formatCurrency(cat.committed)}
                          </td>
                          <td className="px-6 py-3 text-right text-sm text-emerald-400">
                            ${formatCurrency(cat.delivered)}
                          </td>
                          <td className="px-6 py-3 text-right text-sm">
                            ${formatCurrency(cat.remaining)}
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
                        ${formatCurrency(categories.reduce((sum, cat) => sum + cat.committed, 0))}
                      </td>
                      <td className="px-6 py-3 text-right text-sm font-semibold text-emerald-400">
                        ${formatCurrency(categories.reduce((sum, cat) => sum + cat.delivered, 0))}
                      </td>
                      <td className="px-6 py-3 text-right text-sm font-semibold">
                        ${formatCurrency(categories.reduce((sum, cat) => sum + cat.remaining, 0))}
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
