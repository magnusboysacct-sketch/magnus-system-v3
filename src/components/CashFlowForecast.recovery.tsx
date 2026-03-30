import { useEffect, useState } from "react";
import { TrendingUp, TrendingDown, Calendar, DollarSign, CircleAlert as AlertCircle, ChevronDown, ChevronUp } from "lucide-react";
import {
  getCashFlowForecast,
  getCashPositionSummary,
  getOutstandingReceivables,
  getOutstandingPayables,
  getUpcomingPayroll,
  formatCurrency,
  formatShortDate,
  getPriorityColor,
  getAgingColor,
  type CashFlowForecast as ForecastPeriod,
  type CashPositionSummary,
  type OutstandingReceivable,
  type OutstandingPayable,
  type UpcomingPayroll,
} from "../lib/cashFlow";

interface Props {
  companyId: string;
}

export default function CashFlowForecast({ companyId }: Props) {
  const [loading, setLoading] = useState(true);
  const [interval, setInterval] = useState<"week" | "month">("week");
  const [forecast, setForecast] = useState<ForecastPeriod[]>([]);
  const [summary, setSummary] = useState<CashPositionSummary | null>(null);
  const [receivables, setReceivables] = useState<OutstandingReceivable[]>([]);
  const [payables, setPayables] = useState<OutstandingPayable[]>([]);
  const [payroll, setPayroll] = useState<UpcomingPayroll[]>([]);
  const [showReceivables, setShowReceivables] = useState(false);
  const [showPayables, setShowPayables] = useState(false);
  const [showPayroll, setShowPayroll] = useState(false);

  useEffect(() => {
    loadData();
  }, [companyId, interval]);

  async function loadData() {
    try {
      setLoading(true);
      const [forecastData, summaryData, receivablesData, payablesData, payrollData] =
        await Promise.all([
          getCashFlowForecast(companyId, undefined, undefined, interval),
          getCashPositionSummary(companyId),
          getOutstandingReceivables(companyId),
          getOutstandingPayables(companyId),
          getUpcomingPayroll(companyId, interval === "week" ? 12 : 24),
        ]);

      setForecast(forecastData);
      setSummary(summaryData);
      setReceivables(receivablesData);
      setPayables(payablesData);
      setPayroll(payrollData);
    } catch (error) {
      console.error("Error loading cash flow data:", error);
    } finally {
      setLoading(false);
    }
  }

  function calculateProjectedBalance(periodIndex: number): number {
    if (!summary) return 0;

    let balance = summary.current_cash_balance;
    for (let i = 0; i <= periodIndex; i++) {
      balance += forecast[i].net_cash_flow;
    }
    return balance;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-slate-400">Loading cash flow forecast...</div>
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="bg-slate-900/30 border border-slate-800 rounded-lg p-8 text-center">
        <AlertCircle size={48} className="mx-auto text-slate-400 mb-4" />
        <h3 className="text-lg font-medium text-white mb-2">No Cash Flow Data</h3>
        <p className="text-sm text-slate-400">
          Set up bank accounts, invoices, and payroll to see cash flow forecasts.
        </p>
      </div>
    );
  }

  const totalInflows = forecast.reduce((sum, p) => sum + Number(p.expected_inflows), 0);
  const totalOutflows = forecast.reduce((sum, p) => sum + Number(p.expected_outflows), 0);
  const netForecast = totalInflows - totalOutflows;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">Cash Flow Forecast</h2>
          <p className="text-sm text-slate-400">
            {interval === "week" ? "12-week" : "6-month"} cash flow projection
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setInterval("week")}
            className={`px-4 py-2 text-sm rounded ${
              interval === "week"
                ? "bg-blue-600 text-white"
                : "bg-slate-800 text-slate-300 hover:bg-slate-700"
            }`}
          >
            Weekly
          </button>
          <button
            onClick={() => setInterval("month")}
            className={`px-4 py-2 text-sm rounded ${
              interval === "month"
                ? "bg-blue-600 text-white"
                : "bg-slate-800 text-slate-300 hover:bg-slate-700"
            }`}
          >
            Monthly
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
          <div className="flex items-center gap-2 text-xs text-slate-400 mb-1">
            <DollarSign size={16} />
            Current Cash
          </div>
          <div className="text-2xl font-bold text-white">
            {formatCurrency(summary.current_cash_balance)}
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
          <div className="flex items-center gap-2 text-xs text-slate-400 mb-1">
            <TrendingUp size={16} />
            Expected Inflows
          </div>
          <div className="text-2xl font-bold text-emerald-400">{formatCurrency(totalInflows)}</div>
          <div className="text-xs text-slate-400 mt-1">
            {receivables.length} invoice{receivables.length !== 1 ? "s" : ""}
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
          <div className="flex items-center gap-2 text-xs text-slate-400 mb-1">
            <TrendingDown size={16} />
            Expected Outflows
          </div>
          <div className="text-2xl font-bold text-red-400">{formatCurrency(totalOutflows)}</div>
          <div className="text-xs text-slate-400 mt-1">
            {payables.length + payroll.length} payment{payables.length + payroll.length !== 1 ? "s" : ""}
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
          <div className="flex items-center gap-2 text-xs text-slate-400 mb-1">
            <Calendar size={16} />
            Projected Balance
          </div>
          <div
            className={`text-2xl font-bold ${
              summary.current_cash_balance + netForecast >= 0 ? "text-emerald-400" : "text-red-400"
            }`}
          >
            {formatCurrency(summary.current_cash_balance + netForecast)}
          </div>
          <div className="text-xs text-slate-400 mt-1">
            {netForecast >= 0 ? "+" : ""}
            {formatCurrency(netForecast)} net
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900/30 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-900/50 border-b border-slate-800">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">
                  Period
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-slate-400 uppercase">
                  Inflows
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-slate-400 uppercase">
                  Outflows
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-slate-400 uppercase">
                  Net
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-slate-400 uppercase">
                  Balance
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium text-slate-400 uppercase">
                  Items
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {forecast.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                    No forecast data available
                  </td>
                </tr>
              ) : (
                forecast.map((period, idx) => {
                  const projectedBalance = calculateProjectedBalance(idx);
                  const netCashFlow = Number(period.net_cash_flow);
                  return (
                    <tr key={idx} className="hover:bg-slate-900/50">
                      <td className="px-4 py-3 text-sm text-white">{period.period_label}</td>
                      <td className="px-4 py-3 text-sm text-right text-emerald-400">
                        {formatCurrency(Number(period.expected_inflows))}
                      </td>
                      <td className="px-4 py-3 text-sm text-right text-red-400">
                        {formatCurrency(Number(period.expected_outflows))}
                      </td>
                      <td
                        className={`px-4 py-3 text-sm text-right font-medium ${
                          netCashFlow >= 0 ? "text-emerald-400" : "text-red-400"
                        }`}
                      >
                        {netCashFlow >= 0 ? "+" : ""}
                        {formatCurrency(netCashFlow)}
                      </td>
                      <td
                        className={`px-4 py-3 text-sm text-right font-semibold ${
                          projectedBalance >= 0 ? "text-white" : "text-red-400"
                        }`}
                      >
                        {formatCurrency(projectedBalance)}
                      </td>
                      <td className="px-4 py-3 text-sm text-center text-slate-400">
                        <div className="flex items-center justify-center gap-2">
                          <span className="text-emerald-400">{period.receivables_count}</span>/
                          <span className="text-red-400">
                            {period.payables_count + period.payroll_count}
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="space-y-4">
        <button
          onClick={() => setShowReceivables(!showReceivables)}
          className="w-full flex items-center justify-between px-6 py-4 bg-slate-900/30 border border-slate-800 rounded-lg hover:bg-slate-900/50"
        >
          <div className="flex items-center gap-3">
            <TrendingUp size={20} className="text-emerald-400" />
            <div className="text-left">
              <div className="text-sm font-medium text-white">Outstanding Receivables</div>
              <div className="text-xs text-slate-400">
                {receivables.length} invoice{receivables.length !== 1 ? "s" : ""} • Total:{" "}
                {formatCurrency(receivables.reduce((sum, r) => sum + Number(r.balance_due), 0))}
              </div>
            </div>
          </div>
          {showReceivables ? (
            <ChevronUp size={20} className="text-slate-400" />
          ) : (
            <ChevronDown size={20} className="text-slate-400" />
          )}
        </button>

        {showReceivables && receivables.length > 0 && (
          <div className="rounded-lg border border-slate-800 bg-slate-900/30 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-900/50 border-b border-slate-800">
                <tr>
                  <th className="px-4 py-2 text-left text-xs text-slate-400">Invoice</th>
                  <th className="px-4 py-2 text-left text-xs text-slate-400">Due Date</th>
                  <th className="px-4 py-2 text-right text-xs text-slate-400">Amount</th>
                  <th className="px-4 py-2 text-center text-xs text-slate-400">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {receivables.map((r) => (
                  <tr key={r.invoice_id} className="hover:bg-slate-900/50">
                    <td className="px-4 py-2 text-white">{r.invoice_number}</td>
                    <td className="px-4 py-2 text-slate-300">
                      {r.due_date ? formatShortDate(r.due_date) : "—"}
                    </td>
                    <td className="px-4 py-2 text-right text-emerald-400">
                      {formatCurrency(Number(r.balance_due))}
                    </td>
                    <td className="px-4 py-2 text-center">
                      <span
                        className={`inline-flex px-2 py-1 text-xs font-medium rounded ${getAgingColor(
                          r.aging_category
                        )}`}
                      >
                        {r.aging_category}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <button
          onClick={() => setShowPayables(!showPayables)}
          className="w-full flex items-center justify-between px-6 py-4 bg-slate-900/30 border border-slate-800 rounded-lg hover:bg-slate-900/50"
        >
          <div className="flex items-center gap-3">
            <TrendingDown size={20} className="text-red-400" />
            <div className="text-left">
              <div className="text-sm font-medium text-white">Outstanding Payables</div>
              <div className="text-xs text-slate-400">
                {payables.length} invoice{payables.length !== 1 ? "s" : ""} • Total:{" "}
                {formatCurrency(payables.reduce((sum, p) => sum + Number(p.balance_due), 0))}
              </div>
            </div>
          </div>
          {showPayables ? (
            <ChevronUp size={20} className="text-slate-400" />
          ) : (
            <ChevronDown size={20} className="text-slate-400" />
          )}
        </button>

        {showPayables && payables.length > 0 && (
          <div className="rounded-lg border border-slate-800 bg-slate-900/30 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-900/50 border-b border-slate-800">
                <tr>
                  <th className="px-4 py-2 text-left text-xs text-slate-400">Invoice</th>
                  <th className="px-4 py-2 text-left text-xs text-slate-400">Due Date</th>
                  <th className="px-4 py-2 text-right text-xs text-slate-400">Amount</th>
                  <th className="px-4 py-2 text-center text-xs text-slate-400">Priority</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {payables.map((p) => (
                  <tr key={p.invoice_id} className="hover:bg-slate-900/50">
                    <td className="px-4 py-2 text-white">{p.invoice_number}</td>
                    <td className="px-4 py-2 text-slate-300">
                      {p.due_date ? formatShortDate(p.due_date) : "—"}
                    </td>
                    <td className="px-4 py-2 text-right text-red-400">
                      {formatCurrency(Number(p.balance_due))}
                    </td>
                    <td className="px-4 py-2 text-center">
                      <span
                        className={`inline-flex px-2 py-1 text-xs font-medium rounded ${getPriorityColor(
                          p.priority
                        )}`}
                      >
                        {p.priority}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {payroll.length > 0 && (
          <>
            <button
              onClick={() => setShowPayroll(!showPayroll)}
              className="w-full flex items-center justify-between px-6 py-4 bg-slate-900/30 border border-slate-800 rounded-lg hover:bg-slate-900/50"
            >
              <div className="flex items-center gap-3">
                <Calendar size={20} className="text-blue-400" />
                <div className="text-left">
                  <div className="text-sm font-medium text-white">Upcoming Payroll</div>
                  <div className="text-xs text-slate-400">
                    {payroll.length} period{payroll.length !== 1 ? "s" : ""} • Total:{" "}
                    {formatCurrency(
                      payroll.reduce((sum, p) => sum + Number(p.estimated_amount), 0)
                    )}
                  </div>
                </div>
              </div>
              {showPayroll ? (
                <ChevronUp size={20} className="text-slate-400" />
              ) : (
                <ChevronDown size={20} className="text-slate-400" />
              )}
            </button>

            {showPayroll && (
              <div className="rounded-lg border border-slate-800 bg-slate-900/30 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-slate-900/50 border-b border-slate-800">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs text-slate-400">Period</th>
                      <th className="px-4 py-2 text-left text-xs text-slate-400">Pay Date</th>
                      <th className="px-4 py-2 text-right text-xs text-slate-400">Amount</th>
                      <th className="px-4 py-2 text-center text-xs text-slate-400">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/50">
                    {payroll.map((p, idx) => (
                      <tr key={p.period_id || idx} className="hover:bg-slate-900/50">
                        <td className="px-4 py-2 text-white">
                          {formatShortDate(p.period_start)} - {formatShortDate(p.period_end)}
                        </td>
                        <td className="px-4 py-2 text-slate-300">
                          {formatShortDate(p.pay_date)}
                        </td>
                        <td className="px-4 py-2 text-right text-blue-400">
                          {formatCurrency(Number(p.estimated_amount))}
                        </td>
                        <td className="px-4 py-2 text-center">
                          <span className="inline-flex px-2 py-1 text-xs font-medium rounded bg-blue-100 text-blue-800">
                            {p.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
