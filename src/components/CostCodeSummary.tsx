import { useEffect, useState } from "react";
import { FileText, TrendingUp, TrendingDown, DollarSign } from "lucide-react";
import { getProjectCostsByCode, type ProjectCostsByCode } from "../lib/costCodes";

interface Props {
  projectId: string;
  showTitle?: boolean;
}

export default function CostCodeSummary({ projectId, showTitle = true }: Props) {
  const [costData, setCostData] = useState<ProjectCostsByCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [groupByCategory, setGroupByCategory] = useState(false);

  useEffect(() => {
    loadData();
  }, [projectId]);

  async function loadData() {
    try {
      setLoading(true);
      const data = await getProjectCostsByCode(projectId);
      setCostData(data);
    } catch (error) {
      console.error("Error loading cost code summary:", error);
    } finally {
      setLoading(false);
    }
  }

  function formatCurrency(value: number): string {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
    }).format(value);
  }

  function formatPercent(value: number): string {
    return `${Number(value).toFixed(1)}%`;
  }

  const totals = costData.reduce(
    (acc, row) => ({
      budget: acc.budget + Number(row.boq_budget || row.budget_amount),
      committed: acc.committed + Number(row.committed_amount),
      actual: acc.actual + Number(row.actual_amount),
      variance: acc.variance + Number(row.variance),
    }),
    { budget: 0, committed: 0, actual: 0, variance: 0 }
  );

  const groupedData = groupByCategory
    ? costData.reduce((acc, row) => {
        const category = row.cost_code_category || "Uncategorized";
        if (!acc[category]) {
          acc[category] = [];
        }
        acc[category].push(row);
        return acc;
      }, {} as Record<string, ProjectCostsByCode[]>)
    : { All: costData };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-gray-500">Loading cost code summary...</div>
      </div>
    );
  }

  if (costData.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-8 text-center">
        <FileText size={48} className="mx-auto text-gray-400 mb-4" />
        <h3 className="text-lg font-medium text-gray-900 mb-2">No Cost Codes Assigned</h3>
        <p className="text-sm text-gray-600">
          Assign cost codes to BOQ items, expenses, and procurement to see cost analysis here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {showTitle && (
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Cost Code Summary</h2>
            <p className="text-sm text-gray-600">Budget vs. Actual by Cost Code</p>
          </div>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={groupByCategory}
                onChange={(e) => setGroupByCategory(e.target.checked)}
                className="w-4 h-4"
              />
              Group by Category
            </label>
          </div>
        </div>
      )}

      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="flex items-center gap-2 text-sm text-gray-600 mb-1">
            <FileText size={16} />
            Total Budget
          </div>
          <div className="text-2xl font-bold text-gray-900">
            {formatCurrency(totals.budget)}
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="flex items-center gap-2 text-sm text-gray-600 mb-1">
            <DollarSign size={16} />
            Committed
          </div>
          <div className="text-2xl font-bold text-blue-600">
            {formatCurrency(totals.committed)}
          </div>
          <div className="text-xs text-gray-500 mt-1">
            {totals.budget > 0 ? formatPercent((totals.committed / totals.budget) * 100) : "0%"} of
            budget
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="flex items-center gap-2 text-sm text-gray-600 mb-1">
            <TrendingUp size={16} />
            Actual Costs
          </div>
          <div className="text-2xl font-bold text-orange-600">
            {formatCurrency(totals.actual)}
          </div>
          <div className="text-xs text-gray-500 mt-1">
            {totals.budget > 0 ? formatPercent((totals.actual / totals.budget) * 100) : "0%"} spent
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="flex items-center gap-2 text-sm text-gray-600 mb-1">
            {totals.variance >= 0 ? (
              <TrendingDown size={16} className="text-green-600" />
            ) : (
              <TrendingUp size={16} className="text-red-600" />
            )}
            Variance
          </div>
          <div
            className={`text-2xl font-bold ${
              totals.variance >= 0 ? "text-green-600" : "text-red-600"
            }`}
          >
            {formatCurrency(totals.variance)}
          </div>
          <div className="text-xs text-gray-500 mt-1">
            {totals.variance >= 0 ? "Under budget" : "Over budget"}
          </div>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">
                  Cost Code
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">
                  Description
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-700 uppercase">
                  Budget
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-700 uppercase">
                  Committed
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-700 uppercase">
                  Actual
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-700 uppercase">
                  Variance
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-700 uppercase">
                  % Spent
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {Object.entries(groupedData).map(([category, rows]) => (
                <>
                  {groupByCategory && (
                    <tr key={`cat-${category}`} className="bg-gray-100">
                      <td colSpan={7} className="px-4 py-2 font-semibold text-gray-900">
                        {category}
                      </td>
                    </tr>
                  )}
                  {rows.map((row) => {
                    const budget = Number(row.boq_budget || row.budget_amount);
                    const variance = Number(row.variance);
                    return (
                      <tr key={row.cost_code_id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-mono text-gray-900">{row.cost_code}</td>
                        <td className="px-4 py-3 text-gray-900">
                          {row.cost_code_description}
                          {!groupByCategory && row.cost_code_category && (
                            <span className="ml-2 text-xs text-gray-500">
                              ({row.cost_code_category})
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right font-medium">
                          {formatCurrency(budget)}
                        </td>
                        <td className="px-4 py-3 text-right text-blue-600">
                          {formatCurrency(Number(row.committed_amount))}
                        </td>
                        <td className="px-4 py-3 text-right text-orange-600">
                          {formatCurrency(Number(row.actual_amount))}
                        </td>
                        <td
                          className={`px-4 py-3 text-right font-medium ${
                            variance >= 0 ? "text-green-600" : "text-red-600"
                          }`}
                        >
                          {formatCurrency(variance)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <div className="w-20 bg-gray-200 rounded-full h-2">
                              <div
                                className={`h-2 rounded-full ${
                                  Number(row.percent_spent) > 100
                                    ? "bg-red-500"
                                    : Number(row.percent_spent) > 90
                                    ? "bg-orange-500"
                                    : "bg-green-500"
                                }`}
                                style={{
                                  width: `${Math.min(Number(row.percent_spent), 100)}%`,
                                }}
                              />
                            </div>
                            <span className="text-gray-700 font-medium">
                              {formatPercent(Number(row.percent_spent))}
                            </span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </>
              ))}
            </tbody>
            <tfoot className="bg-gray-50 border-t-2 border-gray-300">
              <tr className="font-bold">
                <td colSpan={2} className="px-4 py-3 text-gray-900">
                  TOTALS
                </td>
                <td className="px-4 py-3 text-right text-gray-900">
                  {formatCurrency(totals.budget)}
                </td>
                <td className="px-4 py-3 text-right text-blue-600">
                  {formatCurrency(totals.committed)}
                </td>
                <td className="px-4 py-3 text-right text-orange-600">
                  {formatCurrency(totals.actual)}
                </td>
                <td
                  className={`px-4 py-3 text-right ${
                    totals.variance >= 0 ? "text-green-600" : "text-red-600"
                  }`}
                >
                  {formatCurrency(totals.variance)}
                </td>
                <td className="px-4 py-3 text-right text-gray-900">
                  {totals.budget > 0
                    ? formatPercent((totals.actual / totals.budget) * 100)
                    : "0%"}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}
