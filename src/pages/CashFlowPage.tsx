// src/pages/CashFlowPage.tsx
import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import {
  PageHeader, StatCard, Card, CardHeader, Badge, Btn,
  Table, Th, Tr, Td, Empty, Tabs, cn
} from "../components/ui";
import {
  TrendingUp, TrendingDown, DollarSign,
  ArrowUpRight, ArrowDownRight, RefreshCw,
  Wallet, Building2
} from "lucide-react";

type Transaction = {
  id: string;
  transaction_type: string;
  amount: number;
  description: string | null;
  transaction_date: string | null;
  reference_number: string | null;
  bank_account_id: string | null;
  created_at: string;
  bank_accounts?: { account_name: string } | null;
};

type BankAccount = {
  id: string;
  account_name: string;
  account_type: string;
  current_balance: number;
  currency: string;
};

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency", currency: "USD", maximumFractionDigits: 2
  }).format(n);
}

function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const TYPE_COLOR: Record<string, any> = {
  income: "green", receipt: "green", payment: "red",
  expense: "red", transfer: "blue", adjustment: "slate",
};

export default function CashFlowPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [period, setPeriod] = useState<"30" | "90" | "365">("30");

  const totalIn = transactions
    .filter(t => ["income", "receipt"].includes(t.transaction_type))
    .reduce((s, t) => s + (t.amount || 0), 0);

  const totalOut = transactions
    .filter(t => ["expense", "payment"].includes(t.transaction_type))
    .reduce((s, t) => s + (t.amount || 0), 0);

  const netFlow = totalIn - totalOut;

  const totalBalance = accounts.reduce((s, a) => s + (a.current_balance || 0), 0);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      supabase.from("user_profiles").select("company_id").eq("id", user.id).maybeSingle()
        .then(({ data }) => { if (data?.company_id) setCompanyId(data.company_id); });
    });
  }, []);

  useEffect(() => { if (companyId) loadData(); }, [companyId, period]);

  async function loadData() {
    setLoading(true);
    try {
      const since = new Date();
      since.setDate(since.getDate() - parseInt(period));

      const [txRes, accRes] = await Promise.all([
        supabase.from("cash_transactions")
          .select("*, bank_accounts(account_name)")
          .eq("company_id", companyId!)
          .gte("created_at", since.toISOString())
          .order("created_at", { ascending: false })
          .limit(100),
        supabase.from("bank_accounts")
          .select("*")
          .eq("company_id", companyId!),
      ]);

      setTransactions(txRes.data || []);
      setAccounts(accRes.data || []);
    } catch (e: any) { console.error(e); }
    finally { setLoading(false); }
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#080b10]">
      <PageHeader
        title="Cash Flow"
        subtitle="Bank accounts and transaction history"
        actions={
          <>
            <Btn variant="ghost" size="sm" icon={<RefreshCw size={13} className={loading ? "animate-spin" : ""}/>} onClick={loadData}/>
            <div className="flex items-center gap-1 rounded-lg border border-white/[0.08] bg-white/[0.04] p-1">
              {(["30","90","365"] as const).map(p => (
                <button key={p} onClick={() => setPeriod(p)}
                  className={cn("px-2.5 py-1 rounded-md text-[10px] font-bold transition-colors",
                    period === p ? "bg-white/10 text-slate-200" : "text-slate-600 hover:text-slate-400")}>
                  {p === "365" ? "1Y" : `${p}D`}
                </button>
              ))}
            </div>
          </>
        }
      />

      <div className="p-6 space-y-5">

        {/* KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Total Balance" value={fmt(totalBalance)}
            icon={<Wallet size={15}/>} color="text-cyan-300" sub={`${accounts.length} account${accounts.length !== 1 ? "s" : ""}`}/>
          <StatCard label={`Cash In (${period}d)`} value={fmt(totalIn)}
            icon={<ArrowUpRight size={15}/>} color="text-emerald-300"/>
          <StatCard label={`Cash Out (${period}d)`} value={fmt(totalOut)}
            icon={<ArrowDownRight size={15}/>} color="text-red-300"/>
          <StatCard label="Net Flow" value={fmt(netFlow)}
            icon={netFlow >= 0 ? <TrendingUp size={15}/> : <TrendingDown size={15}/>}
            color={netFlow >= 0 ? "text-emerald-300" : "text-red-300"}/>
        </div>

        {/* Bank accounts */}
        {accounts.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {accounts.map(a => (
              <Card key={a.id}>
                <div className="flex items-start justify-between mb-3">
                  <div className="w-9 h-9 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center">
                    <Building2 size={14} className="text-cyan-400"/>
                  </div>
                  <Badge color="slate">{a.account_type}</Badge>
                </div>
                <div className="text-sm font-semibold text-slate-200 mb-1">{a.account_name}</div>
                <div className={cn("text-xl font-bold", a.current_balance >= 0 ? "text-emerald-400" : "text-red-400")}>
                  {fmt(a.current_balance)}
                </div>
                <div className="text-[10px] text-slate-700 mt-1">{a.currency || "USD"}</div>
              </Card>
            ))}
          </div>
        )}

        {/* Transactions table */}
        <Card padding={false}>
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
            <span className="text-sm font-semibold text-slate-200">
              Transactions <span className="text-slate-600 font-normal text-xs ml-2">last {period} days</span>
            </span>
            <span className="text-xs text-slate-600">{transactions.length} records</span>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12 text-xs text-slate-600">
              <RefreshCw size={14} className="animate-spin mr-2"/> Loading...
            </div>
          ) : transactions.length === 0 ? (
            <Empty icon={<DollarSign size={18}/>} title="No transactions found"
              body="Cash transactions will appear here as you record income and expenses."/>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Date</Th>
                  <Th>Description</Th>
                  <Th>Account</Th>
                  <Th>Type</Th>
                  <Th>Reference</Th>
                  <Th right>Amount</Th>
                </tr>
              </thead>
              <tbody>
                {transactions.map(t => {
                  const isIn = ["income", "receipt"].includes(t.transaction_type);
                  return (
                    <Tr key={t.id}>
                      <Td muted>{fmtDate(t.transaction_date || t.created_at)}</Td>
                      <Td><span className="font-medium text-slate-200">{t.description || "—"}</span></Td>
                      <Td muted>{t.bank_accounts?.account_name || "—"}</Td>
                      <Td>
                        <Badge color={TYPE_COLOR[t.transaction_type] || "slate"} dot>
                          {t.transaction_type}
                        </Badge>
                      </Td>
                      <Td muted className="font-mono text-[10px]">{t.reference_number || "—"}</Td>
                      <Td right>
                        <span className={cn("font-semibold", isIn ? "text-emerald-400" : "text-red-400")}>
                          {isIn ? "+" : "-"}{fmt(Math.abs(t.amount))}
                        </span>
                      </Td>
                    </Tr>
                  );
                })}
              </tbody>
            </Table>
          )}
        </Card>
      </div>
    </div>
  );
}
