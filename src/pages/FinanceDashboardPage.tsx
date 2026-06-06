// src/pages/FinanceDashboardPage.tsx — Full Finance Department Hub
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import {
  PageHeader, StatCard, Card, CardHeader, Badge, Btn,
  Table, Th, Tr, Td, Empty, Tabs, Progress, Alert, cn
} from "../components/ui";
import {
  DollarSign, TrendingUp, TrendingDown, BookOpen,
  ArrowRight, Receipt, FileText, CreditCard, Wallet,
  PieChart, BarChart3, RefreshCw, Building2, Package,
  CheckCircle2, AlertCircle, Clock, Plus, ArrowUpRight,
  ArrowDownRight, Layers, Settings
} from "lucide-react";

type Tab = "overview" | "accounts" | "ledger" | "reports";

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(n);
}
function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const ACCOUNT_TYPE_COLOR: Record<string, any> = {
  asset: "cyan", liability: "red", equity: "violet",
  revenue: "green", expense: "amber"
};

const ACCOUNT_TYPE_BG: Record<string, string> = {
  asset: "bg-cyan-500/10 border-cyan-500/20 text-cyan-400",
  liability: "bg-red-500/10 border-red-500/20 text-red-400",
  equity: "bg-violet-500/10 border-violet-500/20 text-violet-400",
  revenue: "bg-emerald-500/10 border-emerald-500/20 text-emerald-400",
  expense: "bg-amber-500/10 border-amber-500/20 text-amber-400",
};

export default function FinanceDashboardPage() {
  const nav = useNavigate();
  const [tab, setTab] = useState<Tab>("overview");
  const [loading, setLoading] = useState(true);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [balances, setBalances] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Summary stats
  const [stats, setStats] = useState({
    totalAssets: 0, totalLiabilities: 0, totalEquity: 0,
    totalRevenue: 0, totalExpenses: 0, netIncome: 0,
  });

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      supabase.from("user_profiles").select("company_id").eq("id", user.id).maybeSingle()
        .then(({ data }) => { if (data?.company_id) setCompanyId(data.company_id); });
    });
  }, []);

  useEffect(() => { if (companyId) loadAll(); }, [companyId]);

  async function loadAll() {
    setLoading(true); setError(null);
    try {
      const [accRes, txRes, balRes] = await Promise.all([
        // Chart of accounts
        supabase.from("chart_of_accounts")
          .select("id, code, name, type, subtype, is_active, current_balance, level, parent_id, is_project_linkable")
          .eq("company_id", companyId!)
          .eq("is_active", true)
          .order("code", { ascending: true }),
        // Recent GL transactions
        supabase.from("gl_transactions")
          .select("id, transaction_number, transaction_date, description, total_amount, status, source_type, currency")
          .eq("company_id", companyId!)
          .order("transaction_date", { ascending: false })
          .limit(20),
        // Account balances
        supabase.from("v_account_balances")
          .select("*")
          .eq("company_id", companyId!)
          .order("code", { ascending: true }),
      ]);

      const accs = accRes.data || [];
      const txs = txRes.data || [];
      const bals = balRes.data || [];

      setAccounts(accs);
      setTransactions(txs);
      setBalances(bals);

      // Calculate summary from account balances
      const totalAssets = accs.filter(a => a.type === "asset").reduce((s: number, a: any) => s + (a.current_balance || 0), 0);
      const totalLiabilities = accs.filter(a => a.type === "liability").reduce((s: number, a: any) => s + (a.current_balance || 0), 0);
      const totalEquity = accs.filter(a => a.type === "equity").reduce((s: number, a: any) => s + (a.current_balance || 0), 0);
      const totalRevenue = accs.filter(a => a.type === "revenue").reduce((s: number, a: any) => s + (a.current_balance || 0), 0);
      const totalExpenses = accs.filter(a => a.type === "expense").reduce((s: number, a: any) => s + (a.current_balance || 0), 0);

      setStats({
        totalAssets, totalLiabilities, totalEquity,
        totalRevenue, totalExpenses,
        netIncome: totalRevenue - totalExpenses,
      });
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }

  // Group accounts by type
  const byType = accounts.reduce((acc: Record<string, any[]>, a) => {
    if (!acc[a.type]) acc[a.type] = [];
    acc[a.type].push(a);
    return acc;
  }, {});

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#080b10]">
      <PageHeader
        title="Finance Department"
        subtitle="General ledger, accounts, and financial reports"
        actions={
          <>
            <Btn variant="ghost" size="sm"
              icon={<RefreshCw size={13} className={loading ? "animate-spin" : ""}/>}
              onClick={loadAll}/>
            <Btn variant="secondary" size="sm" icon={<BookOpen size={13}/>}
              onClick={() => setTab("accounts")}>
              Chart of Accounts
            </Btn>
            <Btn variant="primary" size="sm" icon={<Plus size={13}/>}
              onClick={() => nav("/finance/journal-entry")}>New Entry
            </Btn>
          </>
        }
      />

      <Tabs
        tabs={[
          { key: "overview" as Tab,  label: "Overview" },
          { key: "accounts" as Tab,  label: "Chart of Accounts", count: accounts.length },
          { key: "ledger" as Tab,    label: "General Ledger",    count: transactions.length },
          { key: "reports" as Tab,   label: "Reports" },
        ]}
        active={tab}
        onChange={setTab}
      />

      <div className="p-6 space-y-5">
        {error && <Alert type="error" onClose={() => setError(null)}>{error}</Alert>}

        {/* ── Overview Tab ── */}
        {tab === "overview" && (
          <>
            {/* Trial Balance Summary */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <StatCard label="Total Assets"      value={fmt(stats.totalAssets)}      color="text-cyan-300"    icon={<TrendingUp size={15}/>}/>
              <StatCard label="Total Liabilities" value={fmt(stats.totalLiabilities)} color="text-red-300"     icon={<TrendingDown size={15}/>}/>
              <StatCard label="Total Equity"      value={fmt(stats.totalEquity)}      color="text-violet-300"  icon={<Wallet size={15}/>}/>
              <StatCard label="Total Revenue"     value={fmt(stats.totalRevenue)}      color="text-emerald-300" icon={<ArrowUpRight size={15}/>}/>
              <StatCard label="Total Expenses"    value={fmt(stats.totalExpenses)}     color="text-amber-300"   icon={<ArrowDownRight size={15}/>}/>
              <StatCard
                label="Net Income"
                value={fmt(stats.netIncome)}
                color={stats.netIncome >= 0 ? "text-emerald-300" : "text-red-300"}
                icon={<PieChart size={15}/>}
                sub={stats.netIncome >= 0 ? "Profit" : "Loss"}
              />
            </div>

            {/* Accounting Equation */}
            <Card>
              <CardHeader title="Accounting Equation" subtitle="Assets = Liabilities + Equity"/>
              <div className="flex items-center justify-between gap-4">
                <div className="flex-1 text-center p-4 rounded-xl bg-cyan-500/10 border border-cyan-500/20">
                  <div className="text-[9px] font-bold uppercase tracking-widest text-cyan-600 mb-1">Assets</div>
                  <div className="text-2xl font-bold text-cyan-300">{fmt(stats.totalAssets)}</div>
                </div>
                <div className="text-xl font-bold text-slate-600">=</div>
                <div className="flex-1 text-center p-4 rounded-xl bg-red-500/10 border border-red-500/20">
                  <div className="text-[9px] font-bold uppercase tracking-widest text-red-600 mb-1">Liabilities</div>
                  <div className="text-2xl font-bold text-red-300">{fmt(stats.totalLiabilities)}</div>
                </div>
                <div className="text-xl font-bold text-slate-600">+</div>
                <div className="flex-1 text-center p-4 rounded-xl bg-violet-500/10 border border-violet-500/20">
                  <div className="text-[9px] font-bold uppercase tracking-widest text-violet-600 mb-1">Equity</div>
                  <div className="text-2xl font-bold text-violet-300">{fmt(stats.totalEquity)}</div>
                </div>
              </div>
              <div className={cn("mt-3 text-center text-[10px] font-semibold", Math.abs(stats.totalAssets - (stats.totalLiabilities + stats.totalEquity)) < 0.01 ? "text-emerald-400" : "text-amber-400")}>
                {Math.abs(stats.totalAssets - (stats.totalLiabilities + stats.totalEquity)) < 0.01 ? "✓ Balanced" : "⚠ Out of balance — check your journal entries"}
              </div>
            </Card>

            {/* Quick Finance Links */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: "Expenses",         icon: <Receipt size={15}/>,    to: "/expenses",            color: "bg-amber-500/10 border-amber-500/20 text-amber-400" },
                { label: "Transactions",     icon: <DollarSign size={15}/>, to: "/finance/transactions", color: "bg-cyan-500/10 border-cyan-500/20 text-cyan-400" },
                { label: "Cash Flow",        icon: <TrendingUp size={15}/>, to: "/cash-flow",            color: "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" },
                { label: "Accounts Recv.",   icon: <FileText size={15}/>,   to: "/accounts-receivable",  color: "bg-blue-500/10 border-blue-500/20 text-blue-400" },
              ].map(l => (
                <button key={l.to} onClick={() => nav(l.to)}
                  className="flex items-center gap-3 p-4 rounded-xl border border-white/[0.07] bg-[#0c1018] hover:border-white/[0.13] hover:bg-[#111820] transition-colors text-left group">
                  <div className={cn("w-9 h-9 rounded-lg border flex items-center justify-center flex-shrink-0", l.color)}>{l.icon}</div>
                  <span className="text-xs font-semibold text-slate-400 group-hover:text-slate-200 transition-colors">{l.label}</span>
                  <ArrowRight size={11} className="ml-auto text-slate-700 group-hover:text-slate-400"/>
                </button>
              ))}
            </div>

            {/* Recent GL Transactions */}
            <Card padding={false}>
              <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
                <span className="text-sm font-semibold text-slate-200">Recent Journal Entries</span>
                <Btn size="xs" variant="ghost" onClick={() => setTab("ledger")}>View all <ArrowRight size={11}/></Btn>
              </div>
              {transactions.length === 0 ? (
                <Empty icon={<BookOpen size={18}/>} title="No journal entries yet"
                  body="Post transactions to see them here."
                  action={<Btn variant="primary" size="sm" onClick={() => nav("/finance/journal-entry")}>New Entry</Btn>}/>
              ) : (
                <Table>
                  <thead><tr><Th>Date</Th><Th>Reference</Th><Th>Description</Th><Th>Source</Th><Th>Status</Th><Th right>Amount</Th></tr></thead>
                  <tbody>
                    {transactions.slice(0,8).map((tx: any) => (
                      <Tr key={tx.id}>
                        <Td muted>{fmtDate(tx.transaction_date)}</Td>
                        <Td><span className="font-mono text-[10px] text-slate-300">{tx.transaction_number}</span></Td>
                        <Td><span className="font-medium text-slate-200 text-xs truncate max-w-[200px] block">{tx.description}</span></Td>
                        <Td><Badge color="slate">{tx.source_type?.replace("_"," ")}</Badge></Td>
                        <Td>
                          <Badge color={tx.status === "posted" ? "green" : tx.status === "draft" ? "amber" : "red"} dot>
                            {tx.status}
                          </Badge>
                        </Td>
                        <Td right><span className="font-semibold text-slate-200">{fmt(tx.total_amount)}</span></Td>
                      </Tr>
                    ))}
                  </tbody>
                </Table>
              )}
            </Card>
          </>
        )}

        {/* ── Chart of Accounts Tab ── */}
        {tab === "accounts" && (
          <>
            <div className="flex items-center justify-between">
              <div className="text-xs text-slate-600">{accounts.length} active accounts across {Object.keys(byType).length} types</div>
              <Btn variant="primary" size="sm" icon={<Plus size={13}/>}
                onClick={() => nav("/settings")}>
                Add Account
              </Btn>
            </div>

            {/* By type */}
            {(["asset","liability","equity","revenue","expense"] as const).map(type => {
              const typeAccounts = byType[type] || [];
              if (typeAccounts.length === 0) return null;
              const typeTotal = typeAccounts.reduce((s: number, a: any) => s + (a.current_balance || 0), 0);
              return (
                <Card key={type} padding={false}>
                  <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
                    <div className="flex items-center gap-2">
                      <Badge color={ACCOUNT_TYPE_COLOR[type]}>{type}</Badge>
                      <span className="text-xs text-slate-600">{typeAccounts.length} accounts</span>
                    </div>
                    <span className="text-sm font-bold text-slate-200">{fmt(typeTotal)}</span>
                  </div>
                  <Table>
                    <thead><tr><Th>Code</Th><Th>Account Name</Th><Th>Subtype</Th><Th>Project Linkable</Th><Th right>Balance</Th></tr></thead>
                    <tbody>
                      {typeAccounts.map((a: any) => (
                        <Tr key={a.id}>
                          <Td><span className="font-mono text-[10px] text-slate-400">{a.code}</span></Td>
                          <Td>
                            <span className="font-medium text-slate-200" style={{ paddingLeft: `${(a.level - 1) * 16}px` }}>
                              {a.level > 1 ? "↳ " : ""}{a.name}
                            </span>
                          </Td>
                          <Td muted className="capitalize">{a.subtype?.replace(/_/g," ") || "—"}</Td>
                          <Td>{a.is_project_linkable ? <span className="text-emerald-400 text-[10px] font-semibold">✓ Yes</span> : <span className="text-slate-700 text-[10px]">—</span>}</Td>
                          <Td right>
                            <span className={cn("font-semibold text-sm", (a.current_balance || 0) >= 0 ? "text-slate-200" : "text-red-400")}>
                              {fmt(a.current_balance || 0)}
                            </span>
                          </Td>
                        </Tr>
                      ))}
                    </tbody>
                  </Table>
                </Card>
              );
            })}
          </>
        )}

        {/* ── General Ledger Tab ── */}
        {tab === "ledger" && (
          <>
            <div className="flex items-center justify-between">
              <div className="text-xs text-slate-600">{transactions.length} entries</div>
              <div className="flex gap-2">
                <Btn variant="secondary" size="sm" icon={<FileText size={13}/>}
                  onClick={() => nav("/finance/transactions")}>
                  Bank Transactions
                </Btn>
                <Btn variant="primary" size="sm" icon={<Plus size={13}/>}
                  onClick={() => nav("/expenses")}>
                  Log Expense
                </Btn>
              </div>
            </div>

            <Card padding={false}>
              {transactions.length === 0 ? (
                <Empty icon={<BookOpen size={18}/>} title="No journal entries"
                  body="Journal entries are created automatically when you post expenses, invoices, and payments."
                  action={<Btn variant="primary" size="sm" onClick={() => nav("/finance/journal-entry")}>New Journal Entry</Btn>}/>
              ) : (
                <Table>
                  <thead>
                    <tr>
                      <Th>Date</Th>
                      <Th>Ref #</Th>
                      <Th>Description</Th>
                      <Th>Source</Th>
                      <Th>Currency</Th>
                      <Th>Status</Th>
                      <Th right>Amount</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.map((tx: any) => (
                      <Tr key={tx.id}>
                        <Td muted>{fmtDate(tx.transaction_date)}</Td>
                        <Td><span className="font-mono text-[10px] text-cyan-400">{tx.transaction_number}</span></Td>
                        <Td><span className="text-slate-200 text-xs">{tx.description}</span></Td>
                        <Td><Badge color="slate">{tx.source_type?.replace(/_/g," ")}</Badge></Td>
                        <Td muted>{tx.currency || "USD"}</Td>
                        <Td>
                          <Badge
                            color={tx.status === "posted" ? "green" : tx.status === "draft" ? "amber" : "red"}
                            dot>
                            {tx.status}
                          </Badge>
                        </Td>
                        <Td right>
                          <span className="font-semibold text-slate-200">{fmt(tx.total_amount)}</span>
                        </Td>
                      </Tr>
                    ))}
                  </tbody>
                </Table>
              )}
            </Card>
          </>
        )}

        {/* ── Reports Tab ── */}
        {tab === "reports" && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* P&L Summary */}
              <div className="md:col-span-2">
                <Card>
                  <CardHeader title="Profit & Loss Summary" subtitle="Revenue vs Expenses"/>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between py-2 border-b border-white/[0.05]">
                      <span className="text-sm font-semibold text-slate-200">Total Revenue</span>
                      <span className="text-sm font-bold text-emerald-400">{fmt(stats.totalRevenue)}</span>
                    </div>
                    {(byType["revenue"] || []).map((a: any) => (
                      <div key={a.id} className="flex items-center justify-between pl-4">
                        <span className="text-xs text-slate-500">{a.name}</span>
                        <span className="text-xs text-slate-300">{fmt(a.current_balance || 0)}</span>
                      </div>
                    ))}
                    <div className="flex items-center justify-between py-2 border-b border-white/[0.05]">
                      <span className="text-sm font-semibold text-slate-200">Total Expenses</span>
                      <span className="text-sm font-bold text-amber-400">{fmt(stats.totalExpenses)}</span>
                    </div>
                    {(byType["expense"] || []).map((a: any) => (
                      <div key={a.id} className="flex items-center justify-between pl-4">
                        <span className="text-xs text-slate-500">{a.name}</span>
                        <span className="text-xs text-slate-300">{fmt(a.current_balance || 0)}</span>
                      </div>
                    ))}
                    <div className={cn("flex items-center justify-between py-3 px-4 rounded-xl border",
                      stats.netIncome >= 0 ? "bg-emerald-500/10 border-emerald-500/20" : "bg-red-500/10 border-red-500/20")}>
                      <span className="text-sm font-bold text-slate-200">Net {stats.netIncome >= 0 ? "Income" : "Loss"}</span>
                      <span className={cn("text-lg font-bold", stats.netIncome >= 0 ? "text-emerald-400" : "text-red-400")}>
                        {fmt(Math.abs(stats.netIncome))}
                      </span>
                    </div>
                  </div>
                </Card>
              </div>

              {/* Balance Sheet Summary */}
              <Card>
                <CardHeader title="Balance Sheet" subtitle="Financial position"/>
                <div className="space-y-3">
                  {[
                    { label: "Assets",      value: stats.totalAssets,      color: "text-cyan-400" },
                    { label: "Liabilities", value: stats.totalLiabilities, color: "text-red-400" },
                    { label: "Equity",      value: stats.totalEquity,      color: "text-violet-400" },
                  ].map(r => (
                    <div key={r.label} className="flex items-center justify-between">
                      <span className="text-xs text-slate-500">{r.label}</span>
                      <span className={cn("text-sm font-bold", r.color)}>{fmt(r.value)}</span>
                    </div>
                  ))}
                  <div className="border-t border-white/[0.06] pt-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-400">L + E</span>
                      <span className="text-sm font-bold text-slate-200">{fmt(stats.totalLiabilities + stats.totalEquity)}</span>
                    </div>
                  </div>
                  <Progress
                    value={stats.totalAssets}
                    max={Math.max(stats.totalAssets, stats.totalLiabilities + stats.totalEquity, 1)}
                    color={Math.abs(stats.totalAssets - (stats.totalLiabilities + stats.totalEquity)) < 0.01 ? "cyan" : "amber"}
                  />
                  <div className={cn("text-center text-[10px] font-semibold", Math.abs(stats.totalAssets - (stats.totalLiabilities + stats.totalEquity)) < 0.01 ? "text-emerald-400" : "text-amber-400")}>
                    {Math.abs(stats.totalAssets - (stats.totalLiabilities + stats.totalEquity)) < 0.01 ? "✓ Balanced" : "⚠ Check entries"}
                  </div>
                </div>
              </Card>
            </div>

            {/* Export options */}
            <Card>
              <CardHeader title="Export Reports" subtitle="Download for audit and review"/>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { label: "Trial Balance",  icon: <BarChart3 size={14}/> },
                  { label: "P&L Statement",  icon: <TrendingUp size={14}/> },
                  { label: "Balance Sheet",  icon: <Layers size={14}/> },
                  { label: "Cash Flow",      icon: <DollarSign size={14}/> },
                ].map(r => (
                  <button key={r.label}
                    className="flex items-center gap-2.5 p-3 rounded-xl border border-white/[0.07] bg-white/[0.02] hover:border-white/[0.12] hover:bg-white/[0.04] transition-colors text-left">
                    <span className="text-slate-600">{r.icon}</span>
                    <span className="text-xs text-slate-400">{r.label}</span>
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-slate-700 mt-3">Full export with date range filters coming in the next update.</p>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
