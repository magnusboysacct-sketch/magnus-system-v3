import React, { useEffect, useState } from "react";
import { TrendingUp, TrendingDown, DollarSign, Calendar, ArrowUpRight, ArrowDownRight } from "lucide-react";
import {
  fetchBankAccounts,
  fetchCashTransactions,
  getCashFlowSummary,
  getARSummary,
  getAPSummary,
} from "../lib/finance";
import { useFinanceAccess } from "../hooks/useFinanceAccess";
import { FinanceAccessDenied } from "../components/FinanceAccessDenied";

export default function CashFlowPage() {
  const financeAccess = useFinanceAccess();
  const [loading, setLoading] = useState(true);
  const [bankAccounts, setBankAccounts] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [summary, setSummary] = useState({
    income: 0,
    expenses: 0,
    netCashFlow: 0,
  });
  const [arSummary, setArSummary] = useState({ totalOutstanding: 0, overdueCount: 0 });
  const [apSummary, setApSummary] = useState({ totalDue: 0, pendingApprovalCount: 0 });
  const [dateRange, setDateRange] = useState({
    start: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split("T")[0],
    end: new Date().toISOString().split("T")[0],
  });

  if (financeAccess.loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-slate-600">Loading...</div>
      </div>
    );
  }

  if (!financeAccess.canViewCashFlow) {
    return <FinanceAccessDenied />;
  }

  useEffect(() => {
    loadData();
  }, [dateRange]);

  async function loadData() {
    try {
      const { supabase } = await import("../lib/supabase");
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from("user_profiles")
        .select("company_id")
        .eq("id", user.id)
        .single();

      if (!profile?.company_id) return;

      const [accounts, trans, cashSummary, ar, ap] = await Promise.all([
        fetchBankAccounts(profile.company_id),
        fetchCashTransactions(profile.company_id, dateRange.start, dateRange.end),
        getCashFlowSummary(profile.company_id, dateRange.start, dateRange.end),
        getARSummary(profile.company_id),
        getAPSummary(profile.company_id),
      ]);

      setBankAccounts(accounts);
      setTransactions(trans);
      setSummary(cashSummary);
      setArSummary(ar);
      setApSummary(ap);
    } catch (error) {
      console.error("Error loading cash flow data:", error);
    } finally {
      setLoading(false);
    }
  }

  const totalBankBalance = bankAccounts.reduce((sum, acc) => sum + Number(acc.current_balance || 0), 0);

  return (
    <>
      <div className="border-b border-slate-200 bg-white px-8 py-5">
        <h1 className="text-2xl font-bold text-slate-900">Cash Flow</h1>
        <p className="text-sm text-slate-600">Monitor cash position and financial health</p>
      </div>

      <div className="p-8">
        <div className="mb-6 flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Calendar size={18} className="text-slate-500" />
            <input
              type="date"
              value={dateRange.start}
              onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
            />
            <span className="text-slate-500">to</span>
            <input
              type="date"
              value={dateRange.end}
              onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
            />
          </div>
        </div>

        <div className="mb-6 grid grid-cols-4 gap-4">
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-sm font-medium text-slate-600">Total Cash</div>
              <div className="rounded-lg bg-blue-50 p-2">
                <DollarSign size={18} className="text-blue-600" />
              </div>
            </div>
            <div className="text-2xl font-bold text-slate-900">${totalBankBalance.toLocaleString()}</div>
            <div className="mt-1 text-xs text-slate-500">Across all accounts</div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-sm font-medium text-slate-600">Cash Inflow</div>
              <div className="rounded-lg bg-green-50 p-2">
                <ArrowUpRight size={18} className="text-green-600" />
              </div>
            </div>
            <div className="text-2xl font-bold text-green-600">${summary.income.toLocaleString()}</div>
            <div className="mt-1 text-xs text-slate-500">This period</div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-sm font-medium text-slate-600">Cash Outflow</div>
              <div className="rounded-lg bg-red-50 p-2">
                <ArrowDownRight size={18} className="text-red-600" />
              </div>
            </div>
            <div className="text-2xl font-bold text-red-600">${summary.expenses.toLocaleString()}</div>
            <div className="mt-1 text-xs text-slate-500">This period</div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-sm font-medium text-slate-600">Net Cash Flow</div>
              <div className={`rounded-lg p-2 ${summary.netCashFlow >= 0 ? "bg-green-50" : "bg-red-50"}`}>
                {summary.netCashFlow >= 0 ? (
                  <TrendingUp size={18} className="text-green-600" />
                ) : (
                  <TrendingDown size={18} className="text-red-600" />
                )}
              </div>
            </div>
            <div className={`text-2xl font-bold ${summary.netCashFlow >= 0 ? "text-green-600" : "text-red-600"}`}>
              ${Math.abs(summary.netCashFlow).toLocaleString()}
            </div>
            <div className="mt-1 text-xs text-slate-500">This period</div>
          </div>
        </div>

        <div className="mb-6 grid grid-cols-2 gap-6">
          <div className="rounded-xl border border-slate-200 bg-white p-6">
            <h3 className="mb-4 text-lg font-semibold text-slate-900">Bank Accounts</h3>
            <div className="space-y-3">
              {bankAccounts.map((account) => (
                <div
                  key={account.id}
                  className="flex items-center justify-between rounded-lg border border-slate-200 p-4"
                >
                  <div>
                    <div className="font-medium text-slate-900">{account.account_name}</div>
                    <div className="text-sm text-slate-500 capitalize">
                      {account.account_type.replace("_", " ")}
                      {account.bank_name && ` • ${account.bank_name}`}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold text-slate-900">
                      ${Number(account.current_balance).toLocaleString()}
                    </div>
                    {account.is_primary && (
                      <span className="text-xs font-medium text-blue-600">Primary</span>
                    )}
                  </div>
                </div>
              ))}
              {bankAccounts.length === 0 && (
                <div className="py-8 text-center text-sm text-slate-500">No bank accounts configured</div>
              )}
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-xl border border-slate-200 bg-white p-6">
              <h3 className="mb-4 text-lg font-semibold text-slate-900">Accounts Receivable</h3>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm text-slate-600">Outstanding</div>
                  <div className="mt-1 text-2xl font-bold text-slate-900">
                    ${arSummary.totalOutstanding.toLocaleString()}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm text-slate-600">Overdue</div>
                  <div className="mt-1 text-2xl font-bold text-red-600">{arSummary.overdueCount}</div>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-6">
              <h3 className="mb-4 text-lg font-semibold text-slate-900">Accounts Payable</h3>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm text-slate-600">Total Due</div>
                  <div className="mt-1 text-2xl font-bold text-slate-900">
                    ${apSummary.totalDue.toLocaleString()}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm text-slate-600">Pending Approval</div>
                  <div className="mt-1 text-2xl font-bold text-orange-600">{apSummary.pendingApprovalCount}</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-6 py-4">
            <h3 className="text-lg font-semibold text-slate-900">Recent Transactions</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-slate-200 bg-slate-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-700">
                    Date
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-700">
                    Description
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-700">
                    Type
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-700">
                    Account
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-700">
                    Amount
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {transactions.slice(0, 20).map((txn) => (
                  <tr key={txn.id} className="hover:bg-slate-50">
                    <td className="px-6 py-4 text-sm text-slate-900">{txn.transaction_date}</td>
                    <td className="px-6 py-4">
                      <div className="text-sm font-medium text-slate-900">{txn.description}</div>
                      {txn.reference_number && (
                        <div className="text-xs text-slate-500">Ref: {txn.reference_number}</div>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium capitalize ${
                          txn.transaction_type === "income"
                            ? "bg-green-50 text-green-700"
                            : txn.transaction_type === "expense"
                            ? "bg-red-50 text-red-700"
                            : "bg-blue-50 text-blue-700"
                        }`}
                      >
                        {txn.transaction_type}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600">
                      {txn.bank_accounts?.account_name || "-"}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <span
                        className={`text-sm font-medium ${
                          txn.transaction_type === "income" ? "text-green-600" : "text-red-600"
                        }`}
                      >
                        {txn.transaction_type === "income" ? "+" : "-"}$
                        {Number(txn.amount).toLocaleString()}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {transactions.length === 0 && (
              <div className="py-12 text-center text-sm text-slate-500">No transactions in this period</div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
