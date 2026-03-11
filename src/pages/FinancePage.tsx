import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useProjectContext } from "../context/ProjectContext";

type CostControlTotals = {
  total_budget: number;
  total_committed: number;
  total_delivered: number;
  total_paid: number;
  total_remaining_budget_after_commit: number;
  total_remaining_budget_after_delivery: number;
  total_undelivered_committed: number;
  total_over_delivery_variance: number;
  total_over_commitment_variance: number;
};

type CostControlCategoryRow = {
  cost_category: string;
  budget_amount: number;
  committed_amount: number;
  delivered_amount: number;
  paid_amount: number;
  remaining_budget_after_commit: number;
  remaining_budget_after_delivery: number;
  undelivered_committed_amount: number;
  over_delivery_variance: number;
  over_commitment_variance: number;
};

function numOr(value: unknown, fallback = 0): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export default function FinancePage() {
  const { currentProjectId, currentProject } = useProjectContext();
  const { projectId: routeProjectId } = useParams<{ projectId?: string }>();
  const navigate = useNavigate();

  const projectId = routeProjectId || currentProjectId || null;

  const [loading, setLoading] = useState(true);
  const [projectName, setProjectName] = useState("");

  const [costControlTotals, setCostControlTotals] = useState<CostControlTotals | null>(null);
  const [costControlCategories, setCostControlCategories] = useState<CostControlCategoryRow[]>([]);
  const [costControlLoading, setCostControlLoading] = useState(false);
  const [costControlError, setCostControlError] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId) {
      setLoading(false);
      setProjectName("");
      setCostControlTotals(null);
      setCostControlCategories([]);
      setCostControlError(null);
      return;
    }

    let alive = true;

    async function loadFinanceData() {
      setLoading(true);
      setCostControlLoading(true);
      setCostControlError(null);

      try {
        const [
          projectResp,
          totalsResp,
          categoriesResp,
        ] = await Promise.all([
          supabase.from("projects").select("name").eq("id", projectId).maybeSingle(),
          supabase
            .from("v_cost_control_project_totals")
            .select(
              `
              total_budget,
              total_committed,
              total_delivered,
              total_paid,
              total_remaining_budget_after_commit,
              total_remaining_budget_after_delivery,
              total_undelivered_committed,
              total_over_delivery_variance,
              total_over_commitment_variance
              `
            )
            .eq("project_id", projectId)
            .maybeSingle(),
          supabase
            .from("v_cost_control_categories")
            .select(
              `
              cost_category,
              budget_amount,
              committed_amount,
              delivered_amount,
              paid_amount,
              remaining_budget_after_commit,
              remaining_budget_after_delivery,
              undelivered_committed_amount,
              over_delivery_variance,
              over_commitment_variance
              `
            )
            .eq("project_id", projectId)
            .order("cost_category", { ascending: true }),
        ]);

        if (projectResp.error) throw projectResp.error;
        if (totalsResp.error) throw totalsResp.error;
        if (categoriesResp.error) throw categoriesResp.error;

        if (!alive) return;

        setProjectName(String(projectResp.data?.name ?? ""));

        setCostControlTotals({
          total_budget: numOr(totalsResp.data?.total_budget),
          total_committed: numOr(totalsResp.data?.total_committed),
          total_delivered: numOr(totalsResp.data?.total_delivered),
          total_paid: numOr(totalsResp.data?.total_paid),
          total_remaining_budget_after_commit: numOr(
            totalsResp.data?.total_remaining_budget_after_commit
          ),
          total_remaining_budget_after_delivery: numOr(
            totalsResp.data?.total_remaining_budget_after_delivery
          ),
          total_undelivered_committed: numOr(totalsResp.data?.total_undelivered_committed),
          total_over_delivery_variance: numOr(totalsResp.data?.total_over_delivery_variance),
          total_over_commitment_variance: numOr(totalsResp.data?.total_over_commitment_variance),
        });

        setCostControlCategories(
          (categoriesResp.data ?? []).map((row: any) => ({
            cost_category: String(row.cost_category ?? "Uncategorized"),
            budget_amount: numOr(row.budget_amount),
            committed_amount: numOr(row.committed_amount),
            delivered_amount: numOr(row.delivered_amount),
            paid_amount: numOr(row.paid_amount),
            remaining_budget_after_commit: numOr(row.remaining_budget_after_commit),
            remaining_budget_after_delivery: numOr(row.remaining_budget_after_delivery),
            undelivered_committed_amount: numOr(row.undelivered_committed_amount),
            over_delivery_variance: numOr(row.over_delivery_variance),
            over_commitment_variance: numOr(row.over_commitment_variance),
          }))
        );
      } catch (e: any) {
        console.error("[Finance] loadFinanceData failed:", e);
        if (!alive) return;
        setCostControlError(e?.message ?? "Failed to load finance data");
        setCostControlTotals(null);
        setCostControlCategories([]);
      } finally {
        if (!alive) return;
        setLoading(false);
        setCostControlLoading(false);
      }
    }

    void loadFinanceData();

    return () => {
      alive = false;
    };
  }, [projectId]);

  const summary = useMemo(() => {
    const total_budget = numOr(costControlTotals?.total_budget);
    const committed_value = numOr(costControlTotals?.total_committed);
    const delivered_value = numOr(costControlTotals?.total_delivered);
    const remaining_budget = numOr(costControlTotals?.total_remaining_budget_after_delivery);

    // positive = under budget, negative = over budget
    const variance = total_budget - delivered_value;

    return {
      total_budget,
      committed_value,
      delivered_value,
      remaining_budget,
      variance,
    };
  }, [costControlTotals]);

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
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3 mb-6">
            <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
              <div className="text-xs text-slate-400">Budget</div>
              <div className="mt-1 text-lg font-semibold text-white">
                {costControlLoading
                  ? "Loading..."
                  : `$${formatCurrency(numOr(costControlTotals?.total_budget))}`}
              </div>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
              <div className="text-xs text-slate-400">Committed</div>
              <div className="mt-1 text-lg font-semibold text-white">
                {costControlLoading
                  ? "Loading..."
                  : `$${formatCurrency(numOr(costControlTotals?.total_committed))}`}
              </div>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
              <div className="text-xs text-slate-400">Delivered</div>
              <div className="mt-1 text-lg font-semibold text-white">
                {costControlLoading
                  ? "Loading..."
                  : `$${formatCurrency(numOr(costControlTotals?.total_delivered))}`}
              </div>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
              <div className="text-xs text-slate-400">Remaining</div>
              <div className="mt-1 text-lg font-semibold text-white">
                {costControlLoading
                  ? "Loading..."
                  : `$${formatCurrency(
                      numOr(costControlTotals?.total_remaining_budget_after_delivery)
                    )}`}
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
                {costControlLoading
                  ? "Loading..."
                  : `$${formatCurrency(Math.abs(summary.variance))}`}
              </div>
            </div>
          </div>

          {costControlError ? (
            <div className="text-xs text-red-400 mb-4">
              Cost control error: {costControlError}
            </div>
          ) : null}

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

          {costControlCategories.length > 0 && (
            <div className="rounded-2xl border border-slate-800 bg-slate-900/30 overflow-hidden mt-6">
              <div className="px-6 py-4 border-b border-slate-800 bg-slate-900/50">
                <h3 className="font-semibold">Category Breakdown</h3>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-800 text-left text-xs text-slate-400">
                      <th className="px-6 py-3 font-medium">Category</th>
                      <th className="px-6 py-3 font-medium text-right">Budget</th>
                      <th className="px-6 py-3 font-medium text-right">Committed</th>
                      <th className="px-6 py-3 font-medium text-right">Delivered</th>
                      <th className="px-6 py-3 font-medium text-right">Remaining</th>
                      <th className="px-6 py-3 font-medium text-right">Progress</th>
                    </tr>
                  </thead>
                  <tbody>
                    {costControlCategories.map((cat) => {
                      const progress =
                        cat.committed_amount > 0
                          ? (cat.delivered_amount / cat.committed_amount) * 100
                          : 0;

                      return (
                        <tr
                          key={cat.cost_category}
                          className="border-b border-slate-800/50 hover:bg-slate-900/50"
                        >
                          <td className="px-6 py-3">
                            <div className="font-medium text-sm">
                              {cat.cost_category || "Uncategorized"}
                            </div>
                          </td>
                          <td className="px-6 py-3 text-right">
                            <div className="text-sm">
                              ${formatCurrency(cat.budget_amount)}
                            </div>
                          </td>
                          <td className="px-6 py-3 text-right">
                            <div className="text-sm">
                              ${formatCurrency(cat.committed_amount)}
                            </div>
                          </td>
                          <td className="px-6 py-3 text-right">
                            <div className="text-sm text-emerald-400">
                              ${formatCurrency(cat.delivered_amount)}
                            </div>
                          </td>
                          <td className="px-6 py-3 text-right">
                            <div className="text-sm">
                              ${formatCurrency(cat.remaining_budget_after_delivery)}
                            </div>
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
                        $
                        {formatCurrency(
                          costControlCategories.reduce((sum, cat) => sum + cat.budget_amount, 0)
                        )}
                      </td>
                      <td className="px-6 py-3 text-right text-sm font-semibold">
                        $
                        {formatCurrency(
                          costControlCategories.reduce((sum, cat) => sum + cat.committed_amount, 0)
                        )}
                      </td>
                      <td className="px-6 py-3 text-right text-sm font-semibold text-emerald-400">
                        $
                        {formatCurrency(
                          costControlCategories.reduce((sum, cat) => sum + cat.delivered_amount, 0)
                        )}
                      </td>
                      <td className="px-6 py-3 text-right text-sm font-semibold">
                        $
                        {formatCurrency(
                          costControlCategories.reduce(
                            (sum, cat) => sum + cat.remaining_budget_after_delivery,
                            0
                          )
                        )}
                      </td>
                      <td className="px-6 py-3" />
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