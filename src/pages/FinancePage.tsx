// src/pages/FinancePage.tsx
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useProjectContext } from "../context/ProjectContext";
import {
  PageHeader, StatCard, Card, CardHeader, Badge, Btn,
  Table, Th, Tr, Td, Empty, Progress, Tabs, cn
} from "../components/ui";
import {
  DollarSign, TrendingUp, TrendingDown, Receipt,
  ArrowRight, FileText, CreditCard, Wallet,
  RefreshCw, Building2, Package
} from "lucide-react";

type Tab = "overview" | "receivable" | "payable";

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency", currency: "USD", maximumFractionDigits: 0
  }).format(n);
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const STATUS_COLOR: Record<string, any> = {
  draft: "slate", sent: "blue", partial: "amber",
  paid: "green", overdue: "red", cancelled: "slate",
  pending: "amber", approved: "cyan", disputed: "red",
};

export default function FinancePage() {
  const { projects } = useProjectContext();
  const nav = useNavigate();
  const [tab, setTab] = useState<Tab>("overview");
  const [loading, setLoading] = useState(true);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [stats, setStats] = useState({
    totalReceivable: 0, totalPayable: 0,
    overdueInvoices: 0, totalExpenses: 0,
    clientInvoices: [] as any[],
    supplierInvoices: [] as any[],
    recentExpenses: [] as any[],
  });

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      supabase.from("user_profiles").select("company_id").eq("id", user.id).maybeSingle()
        .then(({ data }) => { if (data?.company_id) setCompanyId(data.company_id); });
    });
  }, []);

  useEffect(() => { if (companyId) loadData(); }, [companyId]);

  async function loadData() {
    setLoading(true);
    try {
      const [ciRes, siRes, expRes] = await Promise.all([
        // Client invoices — confirmed columns
        supabase.from("client_invoices")
          .select("id, invoice_number, invoice_date, due_date, total_amount, balance_due, status, project_id, client_id, clients(name), projects(name)")
          .eq("company_id", companyId!)
          .order("due_date", { ascending: true })
          .limit(20),
        // Supplier invoices — confirmed columns
        supabase.from("supplier_invoices")
          .select("id, invoice_number, invoice_date, due_date, total_amount, balance_due, status, supplier_id, project_id, suppliers(name), projects(name)")
          .eq("company_id", companyId!)
          .order("due_date", { ascending: true })
          .limit(20),
        // Expenses — confirmed columns
        supabase.from("expenses")
          .select("id, amount, description, expense_date, status, projects(name), expense_categories(name)")
          .eq("company_id", companyId!)
          .order("created_at", { ascending: false })
          .limit(10),
      ]);

      const clientInvoices = ciRes.data || [];
      const supplierInvoices = siRes.data || [];
      const expenses = expRes.data || [];

      const totalReceivable = clientInvoices
        .filter(i => !["paid", "cancelled"].includes(i.status))
        .reduce((s: number, i: any) => s + (i.balance_due || 0), 0);

      const totalPayable = supplierInvoices
        .filter(i => !["paid"].includes(i.status))
        .reduce((s: number, i: any) => s + (i.balance_due || 0), 0);

      const overdueInvoices = clientInvoices
        .filter(i => i.status === "overdue" || (i.status !== "paid" && new Date(i.due_date) < new Date())).length;

      const totalExpenses = expenses.reduce((s: number, e: any) => s + (e.amount || 0), 0);

      setStats({ totalReceivable, totalPayable, overdueInvoices, totalExpenses, clientInvoices, supplierInvoices, recentExpenses: expenses });
    } catch (e: any) { console.error(e); }
    finally { setLoading(false); }
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#080b10]">
      <PageHeader
        title="Finance"
        subtitle="Financial overview"
        actions={
          <>
            <Btn variant="ghost" size="sm" icon={<RefreshCw size={13} className={loading ? "animate-spin" : ""}/>} onClick={loadData}/>
            <Btn variant="secondary" size="sm" onClick={() => nav("/expenses")}>Log Expense</Btn>
            <Btn variant="primary" size="sm" icon={<FileText size={13}/>} onClick={() => nav("/finance/transactions")}>Transactions</Btn>
          </>
        }
      />

      <Tabs
        tabs={[
          { key: "overview" as Tab,    label: "Overview" },
          { key: "receivable" as Tab,  label: "Receivable", count: stats.clientInvoices.filter(i => i.status !== "paid").length },
          { key: "payable" as Tab,     label: "Payable",    count: stats.supplierInvoices.filter(i => i.status !== "paid").length },
        ]}
        active={tab}
        onChange={setTab}
      />

      <div className="p-6 space-y-5">

        {/* ── Overview Tab ── */}
        {tab === "overview" && (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard label="Accounts Receivable" value={fmt(stats.totalReceivable)}
                icon={<TrendingUp size={15}/>} color="text-emerald-300"
                sub="Outstanding client invoices"/>
              <StatCard label="Accounts Payable" value={fmt(stats.totalPayable)}
                icon={<TrendingDown size={15}/>} color="text-red-300"
                sub="Outstanding supplier invoices"/>
              <StatCard label="Overdue Invoices" value={stats.overdueInvoices}
                icon={<Receipt size={15}/>} color={stats.overdueInvoices > 0 ? "text-red-300" : "text-slate-300"}
                sub="Require immediate attention"/>
              <StatCard label="Total Expenses" value={fmt(stats.totalExpenses)}
                icon={<DollarSign size={15}/>} color="text-amber-300"
                sub="Recent period"/>
            </div>

            {/* Quick links */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: "Transactions",      icon: <Receipt size={15}/>,     to: "/finance/transactions",   color: "text-cyan-400",   bg: "bg-cyan-500/10 border-cyan-500/20" },
                { label: "Expenses",          icon: <DollarSign size={15}/>,  to: "/expenses",               color: "text-amber-400",  bg: "bg-amber-500/10 border-amber-500/20" },
                { label: "Cash Flow",         icon: <TrendingUp size={15}/>,  to: "/cash-flow",              color: "text-emerald-400",bg: "bg-emerald-500/10 border-emerald-500/20" },
                { label: "Accounts Recv.",    icon: <FileText size={15}/>,    to: "/accounts-receivable",    color: "text-blue-400",   bg: "bg-blue-500/10 border-blue-500/20" },
              ].map(l => (
                <button key={l.to} onClick={() => nav(l.to)}
                  className="flex items-center gap-3 p-4 rounded-xl border border-slate-200 dark:border-white/[0.07] bg-white dark:bg-[#0c1018] hover:border-slate-300 dark:hover:border-white/[0.13] hover:bg-slate-50 dark:hover:bg-[#111820] transition-colors text-left group">
                  <div className={cn("w-9 h-9 rounded-lg border flex items-center justify-center flex-shrink-0", l.bg)}>
                    <span className={l.color}>{l.icon}</span>
                  </div>
                  <span className="text-xs font-semibold text-slate-400 group-hover:text-slate-200 transition-colors">{l.label}</span>
                  <ArrowRight size={12} className="ml-auto text-slate-700 group-hover:text-slate-400"/>
                </button>
              ))}
            </div>

            {/* Recent expenses */}
            <Card padding={false}>
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-white/[0.06]">
                <span className="text-sm font-semibold text-slate-200">Recent Expenses</span>
                <Btn size="xs" variant="ghost" onClick={() => nav("/expenses")}>View all <ArrowRight size={11}/></Btn>
              </div>
              {stats.recentExpenses.length === 0 ? (
                <Empty icon={<Receipt size={16}/>} title="No expenses yet" action={<Btn variant="primary" size="sm" onClick={() => nav("/expenses")}>Log expense</Btn>}/>
              ) : (
                <Table>
                  <thead><tr><Th>Description</Th><Th>Category</Th><Th>Project</Th><Th>Date</Th><Th right>Amount</Th><Th>Status</Th></tr></thead>
                  <tbody>
                    {stats.recentExpenses.map((e: any) => (
                      <Tr key={e.id}>
                        <Td><span className="font-medium text-slate-200">{e.description || "—"}</span></Td>
                        <Td muted>{e.expense_categories?.name || "—"}</Td>
                        <Td muted>{e.projects?.name || "—"}</Td>
                        <Td muted>{e.expense_date ? fmtDate(e.expense_date) : "—"}</Td>
                        <Td right><span className="font-semibold text-slate-200">{fmt(e.amount)}</span></Td>
                        <Td><Badge color={STATUS_COLOR[e.status || "pending"] || "slate"} dot>{e.status || "pending"}</Badge></Td>
                      </Tr>
                    ))}
                  </tbody>
                </Table>
              )}
            </Card>
          </>
        )}

        {/* ── Receivable Tab ── */}
        {tab === "receivable" && (
          <Card padding={false}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-white/[0.06]">
              <span className="text-sm font-semibold text-slate-200">Client Invoices</span>
              <Btn size="xs" variant="ghost" onClick={() => nav("/accounts-receivable")}>Full view <ArrowRight size={11}/></Btn>
            </div>
            {stats.clientInvoices.length === 0 ? (
              <Empty icon={<FileText size={18}/>} title="No client invoices" body="Create invoices from the Accounts Receivable page."/>
            ) : (
              <Table>
                <thead><tr><Th>Invoice #</Th><Th>Client</Th><Th>Project</Th><Th>Due Date</Th><Th right>Total</Th><Th right>Balance</Th><Th>Status</Th></tr></thead>
                <tbody>
                  {stats.clientInvoices.map((inv: any) => (
                    <Tr key={inv.id}>
                      <Td><span className="font-mono text-xs text-slate-300">{inv.invoice_number}</span></Td>
                      <Td><span className="font-medium text-slate-200">{(inv.clients as any)?.name || "—"}</span></Td>
                      <Td muted>{(inv.projects as any)?.name || "—"}</Td>
                      <Td muted className={new Date(inv.due_date) < new Date() && inv.status !== "paid" ? "text-red-400" : ""}>
                        {fmtDate(inv.due_date)}
                      </Td>
                      <Td right>{fmt(inv.total_amount)}</Td>
                      <Td right><span className={inv.balance_due > 0 ? "text-amber-400 font-semibold" : "text-slate-600"}>{fmt(inv.balance_due)}</span></Td>
                      <Td><Badge color={STATUS_COLOR[inv.status] || "slate"} dot>{inv.status}</Badge></Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>
        )}

        {/* ── Payable Tab ── */}
        {tab === "payable" && (
          <Card padding={false}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-white/[0.06]">
              <span className="text-sm font-semibold text-slate-200">Supplier Invoices</span>
            </div>
            {stats.supplierInvoices.length === 0 ? (
              <Empty icon={<Package size={18}/>} title="No supplier invoices" body="Supplier invoices appear here after receiving purchase orders."/>
            ) : (
              <Table>
                <thead><tr><Th>Invoice #</Th><Th>Supplier</Th><Th>Project</Th><Th>Due Date</Th><Th right>Total</Th><Th right>Balance</Th><Th>Status</Th></tr></thead>
                <tbody>
                  {stats.supplierInvoices.map((inv: any) => (
                    <Tr key={inv.id}>
                      <Td><span className="font-mono text-xs text-slate-300">{inv.invoice_number}</span></Td>
                      <Td><span className="font-medium text-slate-200">{(inv.suppliers as any)?.name || "—"}</span></Td>
                      <Td muted>{(inv.projects as any)?.name || "—"}</Td>
                      <Td muted className={new Date(inv.due_date) < new Date() && inv.status !== "paid" ? "text-red-400" : ""}>
                        {fmtDate(inv.due_date)}
                      </Td>
                      <Td right>{fmt(inv.total_amount)}</Td>
                      <Td right><span className={inv.balance_due > 0 ? "text-red-400 font-semibold" : "text-slate-600"}>{fmt(inv.balance_due)}</span></Td>
                      <Td><Badge color={STATUS_COLOR[inv.status] || "slate"} dot>{inv.status}</Badge></Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}