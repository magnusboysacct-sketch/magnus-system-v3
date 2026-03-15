import { useEffect, useState } from "react";
import type { ProjectFinanceSummary } from "../lib/finance";
import { fetchProjectFinanceSummary } from "../lib/finance";
import { DollarSign, TrendingUp, TrendingDown, CircleAlert as AlertCircle } from "lucide-react";

interface Props {
  projectId: string;
}

export default function ProjectFinanceSummaryComponent({ projectId }: Props) {
  const [summary, setSummary] = useState<ProjectFinanceSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadSummary();
  }, [projectId]);

  async function loadSummary() {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchProjectFinanceSummary(projectId);
      setSummary(data);
    } catch (err: any) {
      setError(err.message);
      console.error("Error loading finance summary:", err);
    } finally {
      setLoading(false);
    }
  }

  function formatCurrency(value: number | null | undefined): string {
    if (value === null || value === undefined) return "$0.00";
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
    }).format(value);
  }

  function formatPercent(value: number | null | undefined): string {
    if (value === null || value === undefined) return "0%";
    return `${value.toFixed(1)}%`;
  }

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-gray-200 rounded w-1/3"></div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-24 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
        <div>
          <h3 className="font-medium text-red-900">Error Loading Finance Summary</h3>
          <p className="text-sm text-red-700 mt-1">{error}</p>
        </div>
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-6 text-center">
        <p className="text-gray-600">No financial data available for this project.</p>
      </div>
    );
  }

  const isPositiveMargin = summary.projected_margin >= 0;
  const isOverBudget = summary.actual_total > summary.budget_total;

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Project Financial Summary</h2>
          <p className="text-sm text-gray-600 mt-1">{summary.project_name}</p>
        </div>

        <div className="p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-blue-50 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <p className="text-sm font-medium text-blue-900">Budget</p>
                  <p className="text-2xl font-bold text-blue-700 mt-1">
                    {formatCurrency(summary.budget_total)}
                  </p>
                </div>
                <DollarSign className="w-8 h-8 text-blue-600 opacity-50" />
              </div>
            </div>

            <div className="bg-purple-50 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <p className="text-sm font-medium text-purple-900">Committed</p>
                  <p className="text-2xl font-bold text-purple-700 mt-1">
                    {formatCurrency(summary.committed_total)}
                  </p>
                </div>
                <DollarSign className="w-8 h-8 text-purple-600 opacity-50" />
              </div>
            </div>

            <div className={`rounded-lg p-4 ${isOverBudget ? "bg-red-50" : "bg-orange-50"}`}>
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <p className={`text-sm font-medium ${isOverBudget ? "text-red-900" : "text-orange-900"}`}>
                    Actual Cost
                  </p>
                  <p className={`text-2xl font-bold mt-1 ${isOverBudget ? "text-red-700" : "text-orange-700"}`}>
                    {formatCurrency(summary.actual_total)}
                  </p>
                  {summary.budget_total > 0 && (
                    <p className="text-xs text-gray-600 mt-1">
                      {formatPercent(summary.cost_completion_percent)} of budget
                    </p>
                  )}
                </div>
                <DollarSign className={`w-8 h-8 opacity-50 ${isOverBudget ? "text-red-600" : "text-orange-600"}`} />
              </div>
            </div>

            <div className={`rounded-lg p-4 ${isPositiveMargin ? "bg-green-50" : "bg-red-50"}`}>
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <p className={`text-sm font-medium ${isPositiveMargin ? "text-green-900" : "text-red-900"}`}>
                    Projected Margin
                  </p>
                  <p className={`text-2xl font-bold mt-1 ${isPositiveMargin ? "text-green-700" : "text-red-700"}`}>
                    {formatCurrency(summary.projected_margin)}
                  </p>
                  <p className="text-xs text-gray-600 mt-1">
                    {formatPercent(summary.margin_percent)} margin
                  </p>
                </div>
                {isPositiveMargin ? (
                  <TrendingUp className="w-8 h-8 text-green-600 opacity-50" />
                ) : (
                  <TrendingDown className="w-8 h-8 text-red-600 opacity-50" />
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="border border-gray-200 rounded-lg p-4">
              <h3 className="font-semibold text-gray-900 mb-4">Revenue & Collections</h3>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Billed</span>
                  <span className="font-semibold text-gray-900">{formatCurrency(summary.billed_total)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Received</span>
                  <span className="font-semibold text-green-700">{formatCurrency(summary.received_total)}</span>
                </div>
                <div className="flex justify-between items-center pt-2 border-t border-gray-200">
                  <span className="text-sm font-medium text-gray-700">Outstanding AR</span>
                  <span className="font-semibold text-orange-600">{formatCurrency(summary.ar_outstanding)}</span>
                </div>
                {summary.billed_total > 0 && (
                  <div className="pt-2">
                    <div className="flex justify-between items-center text-xs text-gray-600 mb-1">
                      <span>Collection Rate</span>
                      <span>{formatPercent(summary.collection_percent)}</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-green-600 h-2 rounded-full transition-all"
                        style={{ width: `${Math.min(summary.collection_percent, 100)}%` }}
                      ></div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="border border-gray-200 rounded-lg p-4">
              <h3 className="font-semibold text-gray-900 mb-4">Cost & Payables</h3>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Budget</span>
                  <span className="font-semibold text-gray-900">{formatCurrency(summary.budget_total)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Actual Cost</span>
                  <span className={`font-semibold ${isOverBudget ? "text-red-700" : "text-gray-900"}`}>
                    {formatCurrency(summary.actual_total)}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Variance</span>
                  <span className={`font-semibold ${summary.budget_variance >= 0 ? "text-green-700" : "text-red-700"}`}>
                    {formatCurrency(summary.budget_variance)}
                  </span>
                </div>
                <div className="flex justify-between items-center pt-2 border-t border-gray-200">
                  <span className="text-sm font-medium text-gray-700">Outstanding AP</span>
                  <span className="font-semibold text-orange-600">{formatCurrency(summary.ap_outstanding)}</span>
                </div>
              </div>
            </div>
          </div>

          {summary.budget_total > 0 && (
            <div className="border border-gray-200 rounded-lg p-4">
              <h3 className="font-semibold text-gray-900 mb-4">Project Progress</h3>
              <div className="space-y-4">
                <div>
                  <div className="flex justify-between items-center text-sm mb-2">
                    <span className="text-gray-600">Cost Completion</span>
                    <span className="font-medium text-gray-900">{formatPercent(summary.cost_completion_percent)}</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-3">
                    <div
                      className={`h-3 rounded-full transition-all ${
                        summary.cost_completion_percent > 100 ? "bg-red-600" : "bg-orange-600"
                      }`}
                      style={{ width: `${Math.min(summary.cost_completion_percent, 100)}%` }}
                    ></div>
                  </div>
                </div>

                <div>
                  <div className="flex justify-between items-center text-sm mb-2">
                    <span className="text-gray-600">Billing Completion</span>
                    <span className="font-medium text-gray-900">{formatPercent(summary.billing_completion_percent)}</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-3">
                    <div
                      className="bg-blue-600 h-3 rounded-full transition-all"
                      style={{ width: `${Math.min(summary.billing_completion_percent, 100)}%` }}
                    ></div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
