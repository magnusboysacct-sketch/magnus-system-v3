import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useProjectContext } from "../context/ProjectContext";
import { getCommittedDeliveredSummary, getCategoryBreakdown, getBudgetVsActual, getCommittedDeliveredSummaryByBucketDetailed } from "../lib/costs";
import SupplierInvoiceManager from "../components/SupplierInvoiceManager";
import CostCodeSummary from "../components/CostCodeSummary";
import CashFlowForecast from "../components/CashFlowForecast";
import { useFinanceAccess } from "../hooks/useFinanceAccess";
import { FinanceAccessDenied } from "../components/FinanceAccessDenied";
import { theme } from "../lib/theme";

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
  const financeAccess = useFinanceAccess();

  const [loading, setLoading] = useState(true);
  const [projectName, setProjectName] = useState("");
  const [budgetVsActual, setBudgetVsActual] = useState<any>(null);
  const [committedByBucket, setCommittedByBucket] = useState({
    material_committed: 0,
    labor_committed: 0,
    equipment_committed: 0,
    other_committed: 0,
    total_committed: 0,
    material_delivered: 0,
    labor_delivered: 0,
    equipment_delivered: 0,
    other_delivered: 0,
    total_delivered: 0,
  });
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
  const [companyId, setCompanyId] = useState<string | null>(null);

  const projectId = routeProjectId || currentProjectId || null;

  useEffect(() => {
    let alive = true;

    async function loadFinanceData() {
      if (!projectId) {
        if (!alive) return;
        setProjectName("");
        setBudgetVsActual(null);
        setSummary({
          total_budget: 0,
          committed_value: 0,
          delivered_value: 0,
          remaining_budget: 0,
          variance: 0,
        });
        setCategories([]);
        setCommittedByBucket({
          material_committed: 0,
          labor_committed: 0,
          equipment_committed: 0,
          other_committed: 0,
          total_committed: 0,
          material_delivered: 0,
          labor_delivered: 0,
          equipment_delivered: 0,
          other_delivered: 0,
          total_delivered: 0,
        });
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
          .select("name, company_id")
          .eq("id", projectId)
          .maybeSingle();

        if (projectError) throw projectError;

        if (projectRow?.company_id) {
          setCompanyId(projectRow.company_id);
        }

        const summaryData = await getCommittedDeliveredSummary(projectId);
        const budgetData = await getBudgetVsActual(projectId);
        const categoryData = await getCategoryBreakdown(projectId);
        const committedByBucketData = await getCommittedDeliveredSummaryByBucketDetailed(projectId);
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
        setBudgetVsActual(budgetData);
        setSummary(summaryData);
        setCategories(categoryData);
        setCommittedByBucket(committedByBucketData);
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
        setBudgetVsActual(null);
        setSummary({
          total_budget: 0,
          committed_value: 0,
          delivered_value: 0,
          remaining_budget: 0,
          variance: 0,
        });
        setCategories([]);
        setCommittedByBucket({
          material_committed: 0,
          labor_committed: 0,
          equipment_committed: 0,
          other_committed: 0,
          total_committed: 0,
          material_delivered: 0,
          labor_delivered: 0,
          equipment_delivered: 0,
          other_delivered: 0,
          total_delivered: 0,
        });
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

  if (financeAccess.loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-slate-600">Loading...</div>
      </div>
    );
  }

  if (!financeAccess.canViewCompanyReports) {
    return <FinanceAccessDenied />;
  }

  if (!projectId) {
    return (
      <div className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">Finance</h1>

            {currentProject && (
              <div className={`mt-2 text-sm ${theme.text.muted}`}>
                Project:{" "}
                <span className={`font-semibold ${theme.text.secondary}`}>
                  {currentProject.name}
                </span>
              </div>
            )}

            <p className={`${theme.text.muted} mt-1`}>Select a project to view financial details</p>
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
            <div className={`mt-2 text-sm ${theme.text.muted}`}>
              Project:{" "}
              <span className={`font-semibold ${theme.text.secondary}`}>
                {currentProject.name}
              </span>
            </div>
          )}

          <p className={`${theme.text.muted} mt-1`}>
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

          {/* Financial Control Section */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/30 p-6 mb-6">
            <h3 className="font-semibold mb-4">Financial Control</h3>
            
            {/* Status Chips */}
            {(() => {
              const budget = numOr(budgetVsActual?.budget?.total_budget || 0);
              const actual = numOr(budgetVsActual?.actual?.total_cost || 0);
              const committed = numOr(summary.committed_value || 0);
              const exposure = actual + committed;
              const remaining = budget - exposure;
              const usedPercent = budget > 0 ? (exposure / budget) * 100 : 0;
              
              let budgetStatus = { text: "No Budget", color: "bg-slate-800 text-slate-300 border-slate-600" };
              let exposureStatus = { text: "No Budget", color: "bg-slate-800 text-slate-300 border-slate-600" };
              let remainingStatus = { text: "No Budget", color: "bg-slate-800 text-slate-300 border-slate-600" };
              let riskMessage = "No project budget has been established yet.";
              let riskColor = "bg-slate-800 border-slate-600 text-slate-300";
              
              if (budget === 0) {
                budgetStatus = { text: "No Budget", color: "bg-slate-800 text-slate-300 border-slate-600" };
                exposureStatus = { text: "No Budget", color: "bg-slate-800 text-slate-300 border-slate-600" };
                remainingStatus = { text: "No Budget", color: "bg-slate-800 text-slate-300 border-slate-600" };
                riskMessage = "No project budget has been established yet.";
                riskColor = "bg-slate-800 border-slate-600 text-slate-300";
              } else if (usedPercent < 90 && remaining >= 0) {
                budgetStatus = { text: "Healthy", color: "bg-emerald-800 text-emerald-300 border-emerald-600" };
                exposureStatus = { text: "Healthy", color: "bg-emerald-800 text-emerald-300 border-emerald-600" };
                remainingStatus = { text: "Healthy", color: "bg-emerald-800 text-emerald-300 border-emerald-600" };
                riskMessage = "Project spending is within budget and currently healthy.";
                riskColor = "bg-emerald-800 border-emerald-600 text-emerald-300";
              } else if (usedPercent >= 90 && usedPercent <= 100 && remaining >= 0) {
                budgetStatus = { text: "Watch", color: "bg-amber-800 text-amber-300 border-amber-600" };
                exposureStatus = { text: "Watch", color: "bg-amber-800 text-amber-300 border-amber-600" };
                remainingStatus = { text: "Watch", color: "bg-amber-800 text-amber-300 border-amber-600" };
                riskMessage = "Project spending is approaching budget limit and should be watched closely.";
                riskColor = "bg-amber-800 border-amber-600 text-amber-300";
              } else if (usedPercent > 100 || remaining < 0) {
                budgetStatus = { text: "Overrun", color: "bg-red-800 text-red-300 border-red-600" };
                exposureStatus = { text: "Overrun", color: "bg-red-800 text-red-300 border-red-600" };
                remainingStatus = { text: "Overrun", color: "bg-red-800 text-red-300 border-red-600" };
                riskMessage = "Project exposure has exceeded budget and needs immediate attention.";
                riskColor = "bg-red-800 border-red-600 text-red-300";
              }
              
              return (
                <>
                  <div className="flex gap-2 mb-4">
                    <div className={`px-3 py-1 rounded-full text-xs font-medium ${budgetStatus.color}`}>
                      Budget: {budgetStatus.text}
                    </div>
                    <div className={`px-3 py-1 rounded-full text-xs font-medium ${exposureStatus.color}`}>
                      Exposure: {exposureStatus.text}
                    </div>
                    <div className={`px-3 py-1 rounded-full text-xs font-medium ${remainingStatus.color}`}>
                      Remaining: {remainingStatus.text}
                    </div>
                  </div>
                  
                  <div className={`rounded-xl border ${riskColor} p-3`}>
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-current opacity-20"></div>
                      <p className="text-sm font-medium">
                        <strong>Top Risk:</strong> {riskMessage}
                      </p>
                    </div>
                  </div>
                </>
              );
            })()}
            
            <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
              <div className={`rounded-xl border ${
                numOr(budgetVsActual?.budget?.total_budget || 0) === 0 
                  ? "border-slate-700 bg-slate-800/40" 
                  : "border-slate-800 bg-slate-900/40"
              } p-4`}>
                <div className="text-xs text-slate-400">Budget</div>
                <div className={`mt-1 text-lg font-semibold ${
                  numOr(budgetVsActual?.budget?.total_budget || 0) === 0 
                    ? "text-slate-400" 
                    : "text-white"
                }`}>
                  ${formatCurrency(numOr(budgetVsActual?.budget?.total_budget || 0))}
                </div>
                <div className="text-xs text-slate-500 mt-1">Source: BOQ</div>
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
                <div className="text-xs text-slate-400">Actual</div>
                <div className="mt-1 text-lg font-semibold text-blue-400">
                  ${formatCurrency(numOr(budgetVsActual?.actual?.total_cost || 0))}
                </div>
                <div className="text-xs text-slate-500 mt-1">Source: Project Costs</div>
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
                <div className="text-xs text-slate-400">Committed</div>
                <div className="mt-1 text-lg font-semibold text-blue-400">
                  ${formatCurrency(numOr(summary.committed_value || 0))}
                </div>
                <div className="text-xs text-slate-500 mt-1">Source: Procurement / PO</div>
              </div>

              {(() => {
                const budget = numOr(budgetVsActual?.budget?.total_budget || 0);
                const actual = numOr(budgetVsActual?.actual?.total_cost || 0);
                const committed = numOr(summary.committed_value || 0);
                const exposure = actual + committed;
                const exposureRatio = budget > 0 ? exposure / budget : 0;
                
                let borderColor = "border-slate-800";
                let bgColor = "bg-slate-900/40";
                let textColor = "text-amber-400";
                
                if (budget > 0 && exposureRatio >= 0.9 && exposureRatio <= 1) {
                  borderColor = "border-amber-800";
                  bgColor = "bg-amber-900/20";
                  textColor = "text-amber-300";
                } else if (budget > 0 && exposureRatio > 1) {
                  borderColor = "border-red-800";
                  bgColor = "bg-red-900/20";
                  textColor = "text-red-300";
                }
                
                return (
                  <div className={`rounded-xl border ${borderColor} ${bgColor} p-4`}>
                    <div className="text-xs text-slate-400">Exposure</div>
                    <div className={`mt-1 text-lg font-semibold ${textColor}`}>
                      ${formatCurrency(exposure)}
                    </div>
                    <div className="text-xs text-slate-500 mt-1">Source: Computed</div>
                  </div>
                );
              })()}

              {(() => {
                const budget = numOr(budgetVsActual?.budget?.total_budget || 0);
                const actual = numOr(budgetVsActual?.actual?.total_cost || 0);
                const committed = numOr(summary.committed_value || 0);
                const remaining = budget - (actual + committed);
                
                let borderColor = "border-slate-800";
                let bgColor = "bg-slate-900/40";
                let textColor = "text-white";
                
                if (remaining >= 0) {
                  borderColor = "border-emerald-800";
                  bgColor = "bg-emerald-900/20";
                  textColor = "text-emerald-300";
                } else {
                  borderColor = "border-red-800";
                  bgColor = "bg-red-900/20";
                  textColor = "text-red-300";
                }
                
                return (
                  <div className={`rounded-xl border ${borderColor} ${bgColor} p-4`}>
                    <div className="text-xs text-slate-400">Remaining</div>
                    <div className={`mt-1 text-lg font-semibold ${textColor}`}>
                      ${formatCurrency(remaining)}
                    </div>
                    <div className="text-xs text-slate-500 mt-1">Source: Computed</div>
                  </div>
                );
              })()}
            </div>
          </div>

          {/* Variance Strip */}
          {(() => {
            const budget = numOr(budgetVsActual?.budget?.total_budget || 0);
            const actual = numOr(budgetVsActual?.actual?.total_cost || 0);
            const committed = numOr(summary.committed_value || 0);
            const exposure = actual + committed;
            const remaining = budget - exposure;
            const usedPercent = budget > 0 ? (exposure / budget) * 100 : 0;
            
            let stripBg = "bg-slate-900/40";
            let usedTextColor = "text-slate-400";
            let remainingTextColor = "text-slate-400";
            
            if (budget === 0) {
              stripBg = "bg-slate-900/40";
              usedTextColor = "text-slate-400";
              remainingTextColor = "text-slate-400";
            } else if (usedPercent >= 90 && usedPercent <= 100) {
              stripBg = "bg-amber-900/20";
              usedTextColor = "text-amber-300";
              remainingTextColor = "text-amber-300";
            } else if (usedPercent > 100) {
              stripBg = "bg-red-900/20";
              usedTextColor = "text-red-300";
              remainingTextColor = "text-red-300";
            } else {
              stripBg = "bg-slate-900/40";
              usedTextColor = "text-slate-400";
              remainingTextColor = "text-slate-400";
            }
            
            return (
              <div className={`rounded-xl border border-slate-800 ${stripBg} p-4 mb-6`}>
                <div className="grid grid-cols-4 gap-4 text-xs">
                  <div>
                    <div className="text-slate-500">Budget</div>
                    <div className={`font-semibold ${usedTextColor}`}>
                      ${formatCurrency(budget)}
                    </div>
                    <div className="text-xs text-slate-500">Source: BOQ</div>
                  </div>
                  <div>
                    <div className="text-slate-500">Exposure</div>
                    <div className={`font-semibold ${usedTextColor}`}>
                      ${formatCurrency(exposure)}
                    </div>
                    <div className="text-xs text-slate-500">Source: Computed</div>
                  </div>
                  <div>
                    <div className="text-slate-500">Remaining</div>
                    <div className={`font-semibold ${remainingTextColor}`}>
                      ${formatCurrency(remaining)}
                    </div>
                    <div className="text-xs text-slate-500">Source: Computed</div>
                  </div>
                  <div>
                    <div className="text-slate-500">Used %</div>
                    <div className={`font-semibold ${usedTextColor}`}>
                      {usedPercent.toFixed(1)}%
                    </div>
                    <div className="text-xs text-slate-500">Source: Computed</div>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Source Legend */}
          <div className="flex gap-2 mb-4">
            <div className="px-2 py-1 rounded-full bg-slate-800 text-slate-400 text-xs">
              BOQ
            </div>
            <div className="px-2 py-1 rounded-full bg-slate-800 text-slate-400 text-xs">
              Project Costs
            </div>
            <div className="px-2 py-1 rounded-full bg-slate-800 text-slate-400 text-xs">
              Procurement / PO
            </div>
            <div className="px-2 py-1 rounded-full bg-slate-800 text-slate-400 text-xs">
              Computed
            </div>
          </div>

          {/* Data Freshness */}
          <div className="text-xs text-slate-500 mb-6">
            Based on current BOQ, procurement, and project cost data.
          </div>

          {/* Budget vs Actual by Cost Bucket */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4 mb-6">
            <h4 className="font-semibold text-sm mb-3">Budget vs Actual by Cost Bucket</h4>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-700 text-left text-slate-500">
                    <th className="px-3 py-2 font-medium">Category</th>
                    <th className="px-3 py-2 font-medium text-right">Budget</th>
                    <th className="px-3 py-2 font-medium text-right">Actual</th>
                    <th className="px-3 py-2 font-medium text-right">Committed</th>
                    <th className="px-3 py-2 font-medium text-right">Delivered</th>
                    <th className="px-3 py-2 font-medium text-right">Delivery %</th>
                    <th className="px-3 py-2 font-medium text-right">Exposure</th>
                    <th className="px-3 py-2 font-medium text-right">Remaining</th>
                    <th className="px-3 py-2 font-medium text-center">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {budgetVsActual && (
                    <>
                      <tr className="border-b border-slate-800/50">
                        <td className="px-3 py-2 font-medium">Material</td>
                        <td className="px-3 py-2 text-right">${formatCurrency(numOr(budgetVsActual.budget.material_budget))}</td>
                        <td className="px-3 py-2 text-right text-blue-400">${formatCurrency(numOr(budgetVsActual.actual.material_cost))}</td>
                        <td className="px-3 py-2 text-right text-blue-400">
                          ${formatCurrency(numOr(committedByBucket.material_committed))}
                        </td>
                        <td className="px-3 py-2 text-right text-green-400">
                          ${formatCurrency(numOr(committedByBucket.material_delivered))}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {(() => {
                            const committed = numOr(committedByBucket.material_committed);
                            const delivered = numOr(committedByBucket.material_delivered);
                            const deliveryProgress = committed > 0 ? (delivered / committed) * 100 : 0;
                            const displayPercent = deliveryProgress.toFixed(1);
                            
                            let colorClass = "text-slate-400";
                            if (committed > 0) {
                              if (deliveryProgress >= 100) {
                                colorClass = "text-emerald-400 font-medium";
                              } else if (deliveryProgress >= 50) {
                                colorClass = "text-blue-400";
                              } else {
                                colorClass = "text-slate-400";
                              }
                            }
                            
                            return (
                              <div className="flex items-center justify-end gap-1">
                                <span className={colorClass}>{displayPercent}%</span>
                                {committed > 0 && (
                                  <div className="w-8 h-1 bg-slate-700 rounded-full overflow-hidden">
                                    <div 
                                      className={`h-full transition-all ${
                                        deliveryProgress >= 100 ? 'bg-emerald-400' : 
                                        deliveryProgress >= 50 ? 'bg-blue-400' : 'bg-slate-500'
                                      }`}
                                      style={{ width: `${Math.min(deliveryProgress, 100)}%` }}
                                    />
                                  </div>
                                )}
                              </div>
                            );
                          })()}
                        </td>
                        <td className="px-3 py-2 text-right text-amber-400">${formatCurrency(numOr(budgetVsActual.actual.material_cost) + numOr(committedByBucket.material_committed))}</td>
                        <td className="px-3 py-2 text-right">${formatCurrency(numOr(budgetVsActual.budget.material_budget - (budgetVsActual.actual.material_cost + committedByBucket.material_committed)))}</td>
                        <td className="px-3 py-2">
                          {(() => {
                            const budget = numOr(budgetVsActual.budget.material_budget);
                            const actual = numOr(budgetVsActual.actual.material_cost);
                            const committed = numOr(committedByBucket.material_committed);
                            const delivered = numOr(committedByBucket.material_delivered);
                            const exposure = actual + committed;
                            const remaining = budget - exposure;
                            const usedPercent = budget > 0 ? (exposure / budget) * 100 : 0;
                            const deliveryProgress = committed > 0 ? (delivered / committed) * 100 : 0;
                            
                            let status = { text: "No Budget", color: "bg-slate-800 text-slate-300 border-slate-600" };
                            
                            if (budget <= 0) {
                              status = { text: "No Budget", color: "bg-slate-800 text-slate-300 border-slate-600" };
                            } else if (remaining < 0 || usedPercent > 100) {
                              status = { text: "Overrun", color: "bg-red-800 text-red-300 border-red-600" };
                            } else if (usedPercent >= 90 && usedPercent <= 100) {
                              status = { text: "Watch", color: "bg-amber-800 text-amber-300 border-amber-600" };
                            } else {
                              status = { text: "Healthy", color: "bg-emerald-800 text-emerald-300 border-emerald-600" };
                            }
                            
                            let riskNote = "";
                            if (budget <= 0) {
                              riskNote = "No budget set";
                            } else if (remaining < 0) {
                              riskNote = "Exposure exceeds budget";
                            } else if (committed > 0 && delivered === 0) {
                              riskNote = "Committed with no delivery yet";
                            } else if (committed > 0 && deliveryProgress < 50) {
                              riskNote = "Low delivery progress";
                            } else if (exposure / budget >= 0.9) {
                              riskNote = "Approaching budget limit";
                            } else {
                              riskNote = "Healthy";
                            }
                            
                            return (
                              <div>
                                <div className={`px-2 py-1 rounded-full text-xs font-medium ${status.color}`}>
                                  {status.text}
                                </div>
                                <div className="text-xs text-slate-500 mt-1">{riskNote}</div>
                              </div>
                            );
                          })()}
                        </td>
                      </tr>
                      <tr className="border-b border-slate-800/50">
                        <td className="px-3 py-2 font-medium">Labor</td>
                        <td className="px-3 py-2 text-right">${formatCurrency(numOr(budgetVsActual.budget.labor_budget))}</td>
                        <td className="px-3 py-2 text-right text-blue-400">${formatCurrency(numOr(budgetVsActual.actual.labor_cost))}</td>
                        <td className="px-3 py-2 text-right text-blue-400">
                          ${formatCurrency(numOr(committedByBucket.labor_committed))}
                        </td>
                        <td className="px-3 py-2 text-right text-green-400">
                          ${formatCurrency(numOr(committedByBucket.labor_delivered))}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {(() => {
                            const committed = numOr(committedByBucket.labor_committed);
                            const delivered = numOr(committedByBucket.labor_delivered);
                            const deliveryProgress = committed > 0 ? (delivered / committed) * 100 : 0;
                            const displayPercent = deliveryProgress.toFixed(1);
                            
                            let colorClass = "text-slate-400";
                            if (committed > 0) {
                              if (deliveryProgress >= 100) {
                                colorClass = "text-emerald-400 font-medium";
                              } else if (deliveryProgress >= 50) {
                                colorClass = "text-blue-400";
                              } else {
                                colorClass = "text-slate-400";
                              }
                            }
                            
                            return (
                              <div className="flex items-center justify-end gap-1">
                                <span className={colorClass}>{displayPercent}%</span>
                                {committed > 0 && (
                                  <div className="w-8 h-1 bg-slate-700 rounded-full overflow-hidden">
                                    <div 
                                      className={`h-full transition-all ${
                                        deliveryProgress >= 100 ? 'bg-emerald-400' : 
                                        deliveryProgress >= 50 ? 'bg-blue-400' : 'bg-slate-500'
                                      }`}
                                      style={{ width: `${Math.min(deliveryProgress, 100)}%` }}
                                    />
                                  </div>
                                )}
                              </div>
                            );
                          })()}
                        </td>
                        <td className="px-3 py-2 text-right text-amber-400">${formatCurrency(numOr(budgetVsActual.actual.labor_cost) + numOr(committedByBucket.labor_committed))}</td>
                        <td className="px-3 py-2 text-right">${formatCurrency(numOr(budgetVsActual.budget.labor_budget - (budgetVsActual.actual.labor_cost + committedByBucket.labor_committed)))}</td>
                        <td className="px-3 py-2">
                          {(() => {
                            const budget = numOr(budgetVsActual.budget.labor_budget);
                            const actual = numOr(budgetVsActual.actual.labor_cost);
                            const committed = numOr(committedByBucket.labor_committed);
                            const delivered = numOr(committedByBucket.labor_delivered);
                            const exposure = actual + committed;
                            const remaining = budget - exposure;
                            const usedPercent = budget > 0 ? (exposure / budget) * 100 : 0;
                            const deliveryProgress = committed > 0 ? (delivered / committed) * 100 : 0;
                            
                            let status = { text: "No Budget", color: "bg-slate-800 text-slate-300 border-slate-600" };
                            
                            if (budget <= 0) {
                              status = { text: "No Budget", color: "bg-slate-800 text-slate-300 border-slate-600" };
                            } else if (remaining < 0 || usedPercent > 100) {
                              status = { text: "Overrun", color: "bg-red-800 text-red-300 border-red-600" };
                            } else if (usedPercent >= 90 && usedPercent <= 100) {
                              status = { text: "Watch", color: "bg-amber-800 text-amber-300 border-amber-600" };
                            } else {
                              status = { text: "Healthy", color: "bg-emerald-800 text-emerald-300 border-emerald-600" };
                            }
                            
                            let riskNote = "";
                            if (budget <= 0) {
                              riskNote = "No budget set";
                            } else if (remaining < 0) {
                              riskNote = "Exposure exceeds budget";
                            } else if (committed > 0 && delivered === 0) {
                              riskNote = "Committed with no delivery yet";
                            } else if (committed > 0 && deliveryProgress < 50) {
                              riskNote = "Low delivery progress";
                            } else if (exposure / budget >= 0.9) {
                              riskNote = "Approaching budget limit";
                            } else {
                              riskNote = "Healthy";
                            }
                            
                            return (
                              <div>
                                <div className={`px-2 py-1 rounded-full text-xs font-medium ${status.color}`}>
                                  {status.text}
                                </div>
                                <div className="text-xs text-slate-500 mt-1">{riskNote}</div>
                              </div>
                            );
                          })()}
                        </td>
                      </tr>
                      <tr className="border-b border-slate-800/50">
                        <td className="px-3 py-2 font-medium">Equipment</td>
                        <td className="px-3 py-2 text-right">${formatCurrency(numOr(budgetVsActual.budget.equipment_budget))}</td>
                        <td className="px-3 py-2 text-right text-blue-400">${formatCurrency(numOr(budgetVsActual.actual.equipment_cost))}</td>
                        <td className="px-3 py-2 text-right text-blue-400">
                          ${formatCurrency(numOr(committedByBucket.equipment_committed))}
                        </td>
                        <td className="px-3 py-2 text-right text-green-400">
                          ${formatCurrency(numOr(committedByBucket.equipment_delivered))}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {(() => {
                            const committed = numOr(committedByBucket.equipment_committed);
                            const delivered = numOr(committedByBucket.equipment_delivered);
                            const deliveryProgress = committed > 0 ? (delivered / committed) * 100 : 0;
                            const displayPercent = deliveryProgress.toFixed(1);
                            
                            let colorClass = "text-slate-400";
                            if (committed > 0) {
                              if (deliveryProgress >= 100) {
                                colorClass = "text-emerald-400 font-medium";
                              } else if (deliveryProgress >= 50) {
                                colorClass = "text-blue-400";
                              } else {
                                colorClass = "text-slate-400";
                              }
                            }
                            
                            return (
                              <div className="flex items-center justify-end gap-1">
                                <span className={colorClass}>{displayPercent}%</span>
                                {committed > 0 && (
                                  <div className="w-8 h-1 bg-slate-700 rounded-full overflow-hidden">
                                    <div 
                                      className={`h-full transition-all ${
                                        deliveryProgress >= 100 ? 'bg-emerald-400' : 
                                        deliveryProgress >= 50 ? 'bg-blue-400' : 'bg-slate-500'
                                      }`}
                                      style={{ width: `${Math.min(deliveryProgress, 100)}%` }}
                                    />
                                  </div>
                                )}
                              </div>
                            );
                          })()}
                        </td>
                        <td className="px-3 py-2 text-right text-amber-400">${formatCurrency(numOr(budgetVsActual.actual.equipment_cost) + numOr(committedByBucket.equipment_committed))}</td>
                        <td className="px-3 py-2 text-right">${formatCurrency(numOr(budgetVsActual.budget.equipment_budget - (budgetVsActual.actual.equipment_cost + committedByBucket.equipment_committed)))}</td>
                        <td className="px-3 py-2">
                          {(() => {
                            const budget = numOr(budgetVsActual.budget.equipment_budget);
                            const actual = numOr(budgetVsActual.actual.equipment_cost);
                            const committed = numOr(committedByBucket.equipment_committed);
                            const delivered = numOr(committedByBucket.equipment_delivered);
                            const exposure = actual + committed;
                            const remaining = budget - exposure;
                            const usedPercent = budget > 0 ? (exposure / budget) * 100 : 0;
                            const deliveryProgress = committed > 0 ? (delivered / committed) * 100 : 0;
                            
                            let status = { text: "No Budget", color: "bg-slate-800 text-slate-300 border-slate-600" };
                            
                            if (budget <= 0) {
                              status = { text: "No Budget", color: "bg-slate-800 text-slate-300 border-slate-600" };
                            } else if (remaining < 0 || usedPercent > 100) {
                              status = { text: "Overrun", color: "bg-red-800 text-red-300 border-red-600" };
                            } else if (usedPercent >= 90 && usedPercent <= 100) {
                              status = { text: "Watch", color: "bg-amber-800 text-amber-300 border-amber-600" };
                            } else {
                              status = { text: "Healthy", color: "bg-emerald-800 text-emerald-300 border-emerald-600" };
                            }
                            
                            let riskNote = "";
                            if (budget <= 0) {
                              riskNote = "No budget set";
                            } else if (remaining < 0) {
                              riskNote = "Exposure exceeds budget";
                            } else if (committed > 0 && delivered === 0) {
                              riskNote = "Committed with no delivery yet";
                            } else if (committed > 0 && deliveryProgress < 50) {
                              riskNote = "Low delivery progress";
                            } else if (exposure / budget >= 0.9) {
                              riskNote = "Approaching budget limit";
                            } else {
                              riskNote = "Healthy";
                            }
                            
                            return (
                              <div>
                                <div className={`px-2 py-1 rounded-full text-xs font-medium ${status.color}`}>
                                  {status.text}
                                </div>
                                <div className="text-xs text-slate-500 mt-1">{riskNote}</div>
                              </div>
                            );
                          })()}
                        </td>
                      </tr>
                      <tr className="border-b border-slate-800/50">
                        <td className="px-3 py-2 font-medium">Other</td>
                        <td className="px-3 py-2 text-right">${formatCurrency(numOr(budgetVsActual.budget.other_budget))}</td>
                        <td className="px-3 py-2 text-right text-blue-400">${formatCurrency(numOr(budgetVsActual.actual.other_cost))}</td>
                        <td className="px-3 py-2 text-right text-blue-400">
                          ${formatCurrency(numOr(committedByBucket.other_committed))}
                        </td>
                        <td className="px-3 py-2 text-right text-green-400">
                          ${formatCurrency(numOr(committedByBucket.other_delivered))}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {(() => {
                            const committed = numOr(committedByBucket.other_committed);
                            const delivered = numOr(committedByBucket.other_delivered);
                            const deliveryProgress = committed > 0 ? (delivered / committed) * 100 : 0;
                            const displayPercent = deliveryProgress.toFixed(1);
                            
                            let colorClass = "text-slate-400";
                            if (committed > 0) {
                              if (deliveryProgress >= 100) {
                                colorClass = "text-emerald-400 font-medium";
                              } else if (deliveryProgress >= 50) {
                                colorClass = "text-blue-400";
                              } else {
                                colorClass = "text-slate-400";
                              }
                            }
                            
                            return (
                              <div className="flex items-center justify-end gap-1">
                                <span className={colorClass}>{displayPercent}%</span>
                                {committed > 0 && (
                                  <div className="w-8 h-1 bg-slate-700 rounded-full overflow-hidden">
                                    <div 
                                      className={`h-full transition-all ${
                                        deliveryProgress >= 100 ? 'bg-emerald-400' : 
                                        deliveryProgress >= 50 ? 'bg-blue-400' : 'bg-slate-500'
                                      }`}
                                      style={{ width: `${Math.min(deliveryProgress, 100)}%` }}
                                    />
                                  </div>
                                )}
                              </div>
                            );
                          })()}
                        </td>
                        <td className="px-3 py-2 text-right text-amber-400">${formatCurrency(numOr(budgetVsActual.actual.other_cost) + numOr(committedByBucket.other_committed))}</td>
                        <td className="px-3 py-2 text-right">${formatCurrency(numOr(budgetVsActual.budget.other_budget - (budgetVsActual.actual.other_cost + committedByBucket.other_committed)))}</td>
                        <td className="px-3 py-2">
                          {(() => {
                            const budget = numOr(budgetVsActual.budget.other_budget);
                            const actual = numOr(budgetVsActual.actual.other_cost);
                            const committed = numOr(committedByBucket.other_committed);
                            const delivered = numOr(committedByBucket.other_delivered);
                            const exposure = actual + committed;
                            const remaining = budget - exposure;
                            const usedPercent = budget > 0 ? (exposure / budget) * 100 : 0;
                            const deliveryProgress = committed > 0 ? (delivered / committed) * 100 : 0;
                            
                            let status = { text: "No Budget", color: "bg-slate-800 text-slate-300 border-slate-600" };
                            
                            if (budget <= 0) {
                              status = { text: "No Budget", color: "bg-slate-800 text-slate-300 border-slate-600" };
                            } else if (remaining < 0 || usedPercent > 100) {
                              status = { text: "Overrun", color: "bg-red-800 text-red-300 border-red-600" };
                            } else if (usedPercent >= 90 && usedPercent <= 100) {
                              status = { text: "Watch", color: "bg-amber-800 text-amber-300 border-amber-600" };
                            } else {
                              status = { text: "Healthy", color: "bg-emerald-800 text-emerald-300 border-emerald-600" };
                            }
                            
                            let riskNote = "";
                            if (budget <= 0) {
                              riskNote = "No budget set";
                            } else if (remaining < 0) {
                              riskNote = "Exposure exceeds budget";
                            } else if (committed > 0 && delivered === 0) {
                              riskNote = "Committed with no delivery yet";
                            } else if (committed > 0 && deliveryProgress < 50) {
                              riskNote = "Low delivery progress";
                            } else if (exposure / budget >= 0.9) {
                              riskNote = "Approaching budget limit";
                            } else {
                              riskNote = "Healthy";
                            }
                            
                            return (
                              <div>
                                <div className={`px-2 py-1 rounded-full text-xs font-medium ${status.color}`}>
                                  {status.text}
                                </div>
                                <div className="text-xs text-slate-500 mt-1">{riskNote}</div>
                              </div>
                            );
                          })()}
                        </td>
                      </tr>
                      <tr className="border-t-2 border-slate-700 bg-slate-900/50 font-semibold">
                        <td className="px-3 py-2 font-medium">Totals</td>
                        <td className="px-3 py-2 text-right">
                          ${formatCurrency(
                            numOr(budgetVsActual.budget.material_budget) +
                            numOr(budgetVsActual.budget.labor_budget) +
                            numOr(budgetVsActual.budget.equipment_budget) +
                            numOr(budgetVsActual.budget.other_budget)
                          )}
                        </td>
                        <td className="px-3 py-2 text-right text-blue-400">
                          ${formatCurrency(
                            numOr(budgetVsActual.actual.material_cost) +
                            numOr(budgetVsActual.actual.labor_cost) +
                            numOr(budgetVsActual.actual.equipment_cost) +
                            numOr(budgetVsActual.actual.other_cost)
                          )}
                        </td>
                        <td className="px-3 py-2 text-right text-blue-400">
                          ${formatCurrency(numOr(committedByBucket.total_committed))}
                        </td>
                        <td className="px-3 py-2 text-right text-green-400">
                          ${formatCurrency(numOr(committedByBucket.total_delivered))}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {(() => {
                            const committed = numOr(committedByBucket.total_committed);
                            const delivered = numOr(committedByBucket.total_delivered);
                            const deliveryProgress = committed > 0 ? (delivered / committed) * 100 : 0;
                            const displayPercent = deliveryProgress.toFixed(1);
                            
                            let colorClass = "text-slate-400";
                            if (committed > 0) {
                              if (deliveryProgress >= 100) {
                                colorClass = "text-emerald-400 font-medium";
                              } else if (deliveryProgress >= 50) {
                                colorClass = "text-blue-400";
                              } else {
                                colorClass = "text-slate-400";
                              }
                            }
                            
                            return (
                              <div className="flex items-center justify-end gap-1">
                                <span className={colorClass}>{displayPercent}%</span>
                                {committed > 0 && (
                                  <div className="w-8 h-1 bg-slate-700 rounded-full overflow-hidden">
                                    <div 
                                      className={`h-full transition-all ${
                                        deliveryProgress >= 100 ? 'bg-emerald-400' : 
                                        deliveryProgress >= 50 ? 'bg-blue-400' : 'bg-slate-500'
                                      }`}
                                      style={{ width: `${Math.min(deliveryProgress, 100)}%` }}
                                    />
                                  </div>
                                )}
                              </div>
                            );
                          })()}
                        </td>
                        <td className="px-3 py-2 text-right text-amber-400">
                          ${formatCurrency(
                            (numOr(budgetVsActual.actual.material_cost) +
                             numOr(budgetVsActual.actual.labor_cost) +
                             numOr(budgetVsActual.actual.equipment_cost) +
                             numOr(budgetVsActual.actual.other_cost)) +
                            numOr(committedByBucket.total_committed)
                          )}
                        </td>
                        <td className="px-3 py-2 text-right">
                          ${formatCurrency(
                            (numOr(budgetVsActual.budget.material_budget) +
                             numOr(budgetVsActual.budget.labor_budget) +
                             numOr(budgetVsActual.budget.equipment_budget) +
                             numOr(budgetVsActual.budget.other_budget)) -
                            ((numOr(budgetVsActual.actual.material_cost) +
                              numOr(budgetVsActual.actual.labor_cost) +
                              numOr(budgetVsActual.actual.equipment_cost) +
                              numOr(budgetVsActual.actual.other_cost)) +
                             numOr(committedByBucket.total_committed))
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {(() => {
                            const totalBudget = numOr(budgetVsActual.budget.material_budget) +
                                              numOr(budgetVsActual.budget.labor_budget) +
                                              numOr(budgetVsActual.budget.equipment_budget) +
                                              numOr(budgetVsActual.budget.other_budget);
                            const totalActual = numOr(budgetVsActual.actual.material_cost) +
                                              numOr(budgetVsActual.actual.labor_cost) +
                                              numOr(budgetVsActual.actual.equipment_cost) +
                                              numOr(budgetVsActual.actual.other_cost);
                            const totalCommitted = numOr(committedByBucket.total_committed);
                            const totalDelivered = numOr(committedByBucket.total_delivered);
                            const totalExposure = totalActual + totalCommitted;
                            const totalRemaining = totalBudget - totalExposure;
                            const totalUsedPercent = totalBudget > 0 ? (totalExposure / totalBudget) * 100 : 0;
                            const totalDeliveryProgress = totalCommitted > 0 ? (totalDelivered / totalCommitted) * 100 : 0;
                            
                            let status = { text: "No Budget", color: "bg-slate-800 text-slate-300 border-slate-600" };
                            
                            if (totalBudget <= 0) {
                              status = { text: "No Budget", color: "bg-slate-800 text-slate-300 border-slate-600" };
                            } else if (totalRemaining < 0 || totalUsedPercent > 100) {
                              status = { text: "Overrun", color: "bg-red-800 text-red-300 border-red-600" };
                            } else if (totalUsedPercent >= 90 && totalUsedPercent <= 100) {
                              status = { text: "Watch", color: "bg-amber-800 text-amber-300 border-amber-600" };
                            } else {
                              status = { text: "Healthy", color: "bg-emerald-800 text-emerald-300 border-emerald-600" };
                            }
                            
                            let riskNote = "";
                            if (totalBudget <= 0) {
                              riskNote = "No budget set";
                            } else if (totalRemaining < 0) {
                              riskNote = "Exposure exceeds budget";
                            } else if (totalCommitted > 0 && totalDelivered === 0) {
                              riskNote = "Committed with no delivery yet";
                            } else if (totalCommitted > 0 && totalDeliveryProgress < 50) {
                              riskNote = "Low delivery progress";
                            } else if (totalExposure / totalBudget >= 0.9) {
                              riskNote = "Approaching budget limit";
                            } else {
                              riskNote = "Healthy";
                            }
                            
                            return (
                              <div>
                                <div className={`px-2 py-1 rounded-full text-xs font-medium ${status.color}`}>
                                  {status.text}
                                </div>
                                <div className="text-xs text-slate-500 mt-1">{riskNote}</div>
                              </div>
                            );
                          })()}
                        </td>
                      </tr>
                    </>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Bucket Note */}
          <div className="text-xs text-slate-500 mb-6">
            Committed by cost bucket is now using real procurement data with finance bucket classification.
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

          {companyId && (
            <div className="rounded-2xl border border-slate-800 bg-slate-900/30 p-6 mt-6">
              <CashFlowForecast companyId={companyId} />
            </div>
          )}

          {projectId && (
            <div className="rounded-2xl border border-slate-800 bg-slate-900/30 p-6 mt-6">
              <CostCodeSummary projectId={projectId} />
            </div>
          )}

          {projectId && companyId && (
            <div className="rounded-2xl border border-slate-800 bg-slate-900/30 p-6 mt-6">
              <SupplierInvoiceManager projectId={projectId} companyId={companyId} />
            </div>
          )}
        </>
      )}
    </div>
  );
}
