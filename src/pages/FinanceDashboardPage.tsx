import React, { useEffect, useState, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  AlertTriangle,
  Bot,
  CreditCard,
  Landmark,
  Plus,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Eye,
  CheckCircle,
  Clock,
} from "lucide-react";
import { supabase } from "../lib/supabase";
import { useProjectContext } from "../context/ProjectContext";
import { useFinanceAccess } from "../hooks/useFinanceAccess";
import { FinanceAccessDenied } from "../components/FinanceAccessDenied";
import { fetchBankTransactions } from "../services/finance/bankParser";
import { fetchCreditCardTransactions } from "../services/finance/creditCard";
import { fetchBankAccounts } from "../lib/finance";
import type { BankTransaction } from "../services/finance/bankParser";
import type { CreditCardTransaction } from "../services/finance/creditCard";
import type { BankAccount } from "../lib/finance";

function formatCurrency(value: number) {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatDateTime(dateString: string) {
  return new Date(dateString).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function FinanceDashboardPage() {
  const navigate = useNavigate();
  const { projectId: routeProjectId } = useParams<{ projectId?: string }>();
  const { currentProjectId, currentProject } = useProjectContext();
  const financeAccess = useFinanceAccess();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [bankTransactions, setBankTransactions] = useState<BankTransaction[]>([]);
  const [creditCardTransactions, setCreditCardTransactions] = useState<CreditCardTransaction[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);

  const projectId = currentProjectId || routeProjectId;

  // Load data
  useEffect(() => {
    async function loadDashboardData() {
      if (!projectId || !financeAccess.canAccessProjectFinance) return;

      try {
        setLoading(true);
        setError(null);

        // Get company ID from project
        const { data: project } = await supabase
          .from("projects")
          .select("company_id")
          .eq("id", projectId)
          .single();

        if (!project?.company_id) {
          throw new Error("Project not found or no company associated");
        }

        setCompanyId(project.company_id);

        // Load all data in parallel
        const [bankAccountsData, bankTxnsData, creditTxnsData] = await Promise.all([
          fetchBankAccounts(project.company_id),
          fetchBankTransactions(project.company_id),
          fetchCreditCardTransactions(project.company_id),
        ]);

        setBankAccounts(bankAccountsData);
        setBankTransactions(bankTxnsData);
        setCreditCardTransactions(creditTxnsData);

      } catch (err) {
        console.error("Error loading dashboard data:", err);
        setError(err instanceof Error ? err.message : "Failed to load dashboard data");
      } finally {
        setLoading(false);
      }
    }

    loadDashboardData();
  }, [projectId, financeAccess.canAccessProjectFinance]);

  // Calculate summary metrics
  const summaryMetrics = useMemo(() => {
    if (!bankTransactions.length && !creditCardTransactions.length) {
      return {
        companyCash: 0,
        projectCommitted: 0,
        projectActual: 0,
        safeOwnerDraw: 0,
        outstandingCreditLiability: 0,
        unmatchedCount: 0,
      };
    }

    // Company cash - sum of all bank account balances
    const companyCash = bankAccounts.reduce((sum, account) => sum + (account.current_balance || 0), 0);

    // Project committed - sum of unmatched bank and credit transactions (negative amounts are expenses)
    const projectCommitted = [
      ...bankTransactions.filter(t => !t.gl_transaction_id),
      ...creditCardTransactions.filter(t => !t.gl_transaction_id)
    ].reduce((sum, txn) => sum + (txn.amount < 0 ? Math.abs(txn.amount) : 0), 0);

    // Project actual - sum of posted transactions (negative amounts are expenses)
    const projectActual = [
      ...bankTransactions.filter(t => t.gl_transaction_id),
      ...creditCardTransactions.filter(t => t.gl_transaction_id)
    ].reduce((sum, txn) => sum + (txn.amount < 0 ? Math.abs(txn.amount) : 0), 0);

    // Safe owner draw - company cash minus committed expenses
    const safeOwnerDraw = Math.max(0, companyCash - projectCommitted);

    // Outstanding credit liability - sum of credit card balances (positive amounts are charges)
    const outstandingCreditLiability = creditCardTransactions
      .filter(t => t.amount > 0 && !t.gl_transaction_id)
      .reduce((sum, txn) => sum + txn.amount, 0);

    // Unmatched transactions count
    const unmatchedCount = [
      ...bankTransactions,
      ...creditCardTransactions
    ].filter(t => t.match_status === 'unmatched').length;

    return {
      companyCash,
      projectCommitted,
      projectActual,
      safeOwnerDraw,
      outstandingCreditLiability,
      unmatchedCount,
    };
  }, [bankTransactions, creditCardTransactions, bankAccounts]);

  // Recent transactions
  const recentBankTransactions = useMemo(() => 
    bankTransactions
      .sort((a, b) => new Date(b.transaction_date).getTime() - new Date(a.transaction_date).getTime())
      .slice(0, 5),
  [bankTransactions]);

  const recentCreditTransactions = useMemo(() =>
    creditCardTransactions
      .sort((a, b) => new Date(b.transaction_date).getTime() - new Date(a.transaction_date).getTime())
      .slice(0, 5),
  [creditCardTransactions]);

  // Finance alerts
  const financeAlerts = useMemo(() => {
    const alerts = [];
    
    // Low cash alert
    if (summaryMetrics.companyCash < 5000) {
      alerts.push({
        type: "warning",
        title: "Low Cash Balance",
        message: `Company cash balance is ${formatCurrency(summaryMetrics.companyCash)}`,
        icon: AlertTriangle,
      });
    }

    // High credit liability alert
    if (summaryMetrics.outstandingCreditLiability > 10000) {
      alerts.push({
        type: "warning",
        title: "High Credit Card Liability",
        message: `Outstanding credit balance is ${formatCurrency(summaryMetrics.outstandingCreditLiability)}`,
        icon: CreditCard,
      });
    }

    // Many unmatched transactions alert
    if (summaryMetrics.unmatchedCount > 10) {
      alerts.push({
        type: "info",
        title: "Transactions Need Review",
        message: `${summaryMetrics.unmatchedCount} transactions need classification and matching`,
        icon: Clock,
      });
    }

    return alerts;
  }, [summaryMetrics]);

  // Automation queue
  const automationQueue = useMemo(() => {
    const allTransactions = [...bankTransactions, ...creditCardTransactions];
    
    const needsReview = allTransactions.filter(t => 
      t.match_status === 'unmatched' || (t.confidence_score ?? 0) < 0.7
    ).length;

    const highConfidence = allTransactions.filter(t => 
      !t.gl_transaction_id && (t.confidence_score ?? 0) >= 0.7
    ).length;

    return { needsReview, highConfidence };
  }, [bankTransactions, creditCardTransactions]);

  if (!financeAccess.canAccessProjectFinance) {
    return <FinanceAccessDenied />;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950">
        <div className="flex items-center justify-center p-8">
          <div className="text-center">
            <div className="mb-4 text-2xl text-slate-400">Loading Finance Dashboard...</div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-950">
        <div className="flex items-center justify-center p-8">
          <div className="rounded-xl border border-rose-800/60 bg-rose-900/20 p-6">
            <div className="text-rose-300">Error: {error}</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950">
      <div className="border-b border-slate-800 bg-slate-900/30">
        <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-white">Finance Dashboard</h1>
              <p className="text-slate-400">
                {currentProject?.name || "Project"} Financial Overview
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => navigate(`/projects/${projectId}/finance/transactions`)}
                className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-sky-700"
              >
                <Eye className="h-4 w-4" />
                View Transactions
              </button>
              <button
                onClick={() => navigate(`/projects/${projectId}/finance`)}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800/70 px-4 py-2 text-sm text-slate-200 transition hover:bg-slate-800"
              >
                <Plus className="h-4 w-4" />
                Finance Hub
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {/* Summary Cards */}
        <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-400">Company Cash</p>
                <p className="mt-2 text-3xl font-bold text-white">
                  {formatCurrency(summaryMetrics.companyCash)}
                </p>
              </div>
              <div className="rounded-lg bg-emerald-900/20 p-3">
                <DollarSign className="h-6 w-6 text-emerald-400" />
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-400">Project Committed</p>
                <p className="mt-2 text-3xl font-bold text-white">
                  {formatCurrency(summaryMetrics.projectCommitted)}
                </p>
              </div>
              <div className="rounded-lg bg-amber-900/20 p-3">
                <TrendingUp className="h-6 w-6 text-amber-400" />
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-400">Project Actual</p>
                <p className="mt-2 text-3xl font-bold text-white">
                  {formatCurrency(summaryMetrics.projectActual)}
                </p>
              </div>
              <div className="rounded-lg bg-sky-900/20 p-3">
                <TrendingDown className="h-6 w-6 text-sky-400" />
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-400">Safe Owner Draw</p>
                <p className="mt-2 text-3xl font-bold text-white">
                  {formatCurrency(summaryMetrics.safeOwnerDraw)}
                </p>
              </div>
              <div className="rounded-lg bg-emerald-900/20 p-3">
                <CheckCircle className="h-6 w-6 text-emerald-400" />
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-400">Credit Liability</p>
                <p className="mt-2 text-3xl font-bold text-white">
                  {formatCurrency(summaryMetrics.outstandingCreditLiability)}
                </p>
              </div>
              <div className="rounded-lg bg-rose-900/20 p-3">
                <CreditCard className="h-6 w-6 text-rose-400" />
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-400">Unmatched</p>
                <p className="mt-2 text-3xl font-bold text-white">
                  {summaryMetrics.unmatchedCount}
                </p>
              </div>
              <div className="rounded-lg bg-violet-900/20 p-3">
                <Clock className="h-6 w-6 text-violet-400" />
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Recent Bank Transactions */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/30">
            <div className="border-b border-slate-800 px-6 py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Landmark className="h-5 w-5 text-sky-400" />
                  <h2 className="text-lg font-semibold text-white">Recent Bank Transactions</h2>
                </div>
                <button
                  onClick={() => navigate(`/projects/${projectId}/finance/transactions?tab=bank`)}
                  className="text-sm text-sky-400 hover:text-sky-300"
                >
                  View All
                </button>
              </div>
            </div>
            <div className="p-6">
              {recentBankTransactions.length > 0 ? (
                <div className="space-y-3">
                  {recentBankTransactions.map((transaction) => (
                    <div key={transaction.id} className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-800/30 p-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-white">
                          {transaction.description}
                        </p>
                        <p className="text-xs text-slate-400">
                          {formatDateTime(transaction.transaction_date)}
                        </p>
                      </div>
                      <div className={`text-sm font-semibold ${
                        transaction.amount >= 0 ? "text-emerald-400" : "text-rose-400"
                      }`}>
                        {transaction.amount >= 0 ? "+" : ""}
                        {formatCurrency(transaction.amount)}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <Landmark className="mx-auto h-12 w-12 text-slate-600" />
                  <p className="mt-2 text-sm text-slate-400">No bank transactions yet</p>
                </div>
              )}
            </div>
          </div>

          {/* Recent Credit Card Transactions */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/30">
            <div className="border-b border-slate-800 px-6 py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CreditCard className="h-5 w-5 text-violet-400" />
                  <h2 className="text-lg font-semibold text-white">Recent Credit Card Transactions</h2>
                </div>
                <button
                  onClick={() => navigate(`/projects/${projectId}/finance/transactions?tab=credit`)}
                  className="text-sm text-violet-400 hover:text-violet-300"
                >
                  View All
                </button>
              </div>
            </div>
            <div className="p-6">
              {recentCreditTransactions.length > 0 ? (
                <div className="space-y-3">
                  {recentCreditTransactions.map((transaction) => (
                    <div key={transaction.id} className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-800/30 p-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-white">
                          {transaction.description}
                        </p>
                        <p className="text-xs text-slate-400">
                          {formatDateTime(transaction.transaction_date)}
                        </p>
                      </div>
                      <div className={`text-sm font-semibold ${
                        transaction.amount >= 0 ? "text-emerald-400" : "text-rose-400"
                      }`}>
                        {transaction.amount >= 0 ? "+" : ""}
                        {formatCurrency(transaction.amount)}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <CreditCard className="mx-auto h-12 w-12 text-slate-600" />
                  <p className="mt-2 text-sm text-slate-400">No credit card transactions yet</p>
                </div>
              )}
            </div>
          </div>

          {/* Finance Alerts */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/30">
            <div className="border-b border-slate-800 px-6 py-4">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-400" />
                <h2 className="text-lg font-semibold text-white">Finance Alerts</h2>
              </div>
            </div>
            <div className="p-6">
              {financeAlerts.length > 0 ? (
                <div className="space-y-3">
                  {financeAlerts.map((alert, index) => (
                    <div key={index} className="flex items-start gap-3 rounded-lg border border-slate-800 bg-slate-800/30 p-3">
                      <alert.icon className={`h-5 w-5 mt-0.5 ${
                        alert.type === "warning" ? "text-amber-400" : "text-sky-400"
                      }`} />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-white">{alert.title}</p>
                        <p className="text-xs text-slate-400">{alert.message}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <CheckCircle className="mx-auto h-12 w-12 text-emerald-600" />
                  <p className="mt-2 text-sm text-slate-400">All systems normal</p>
                </div>
              )}
            </div>
          </div>

          {/* Automation Queue */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/30">
            <div className="border-b border-slate-800 px-6 py-4">
              <div className="flex items-center gap-2">
                <Bot className="h-5 w-5 text-violet-400" />
                <h2 className="text-lg font-semibold text-white">Automation Queue</h2>
              </div>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-lg border border-slate-800 bg-slate-800/30 p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-slate-400">Needs Review</p>
                      <p className="mt-2 text-2xl font-bold text-amber-400">
                        {automationQueue.needsReview}
                      </p>
                    </div>
                    <Clock className="h-8 w-8 text-amber-400" />
                  </div>
                  <button
                    onClick={() => navigate(`/projects/${projectId}/finance/transactions?status=needs_review`)}
                    className="mt-3 w-full rounded-lg border border-amber-700 bg-amber-900/20 px-3 py-2 text-xs font-medium text-amber-300 transition hover:bg-amber-800"
                  >
                    Review Now
                  </button>
                </div>

                <div className="rounded-lg border border-slate-800 bg-slate-800/30 p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-slate-400">High Confidence</p>
                      <p className="mt-2 text-2xl font-bold text-emerald-400">
                        {automationQueue.highConfidence}
                      </p>
                    </div>
                    <CheckCircle className="h-8 w-8 text-emerald-400" />
                  </div>
                  <button
                    onClick={() => navigate(`/projects/${projectId}/finance/transactions?status=ready_to_post`)}
                    className="mt-3 w-full rounded-lg bg-emerald-600 px-3 py-2 text-xs font-medium text-white transition hover:bg-emerald-700"
                  >
                    Auto Post Ready
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
