// src/pages/dashboard/PnLOverviewCard.tsx
import React, { useEffect, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { AlertTriangle, Info } from "lucide-react";
import { Card, CardHeader, Spinner, Empty } from "../../components/ui";
import { supabase } from "../../lib/supabase";

interface MonthlyPnL {
  month: string;
  revenue: number;
  expenses: number;
}

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

export default function PnLOverviewCard() {
  const [trend, setTrend] = useState<MonthlyPnL[] | null>(null);
  const [netIncome, setNetIncome] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        // company_id resolved from the logged-in session, same pattern as
        // every other page in this app and as CashPositionCard.tsx.
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Not signed in");
        const { data: profile, error: profErr } = await supabase
          .from("user_profiles").select("company_id").eq("id", user.id).maybeSingle();
        if (profErr) throw profErr;
        if (!profile?.company_id) throw new Error("Couldn't determine company");

        // Prominent Net Income headline: the EXACT same calculation
        // FinanceDashboardPage.tsx already does (sum current_balance by
        // type='revenue'/'expense' from chart_of_accounts) — reused, not a
        // second, independently-derived figure that could disagree with
        // the Finance Dashboard's own number.
        const { data: accs, error: accErr } = await supabase
          .from("chart_of_accounts")
          .select("type, current_balance")
          .eq("company_id", profile.company_id)
          .eq("is_active", true)
          .in("type", ["revenue", "expense"]);
        if (accErr) throw accErr;

        const totalRevenue = (accs || []).filter(a => a.type === "revenue").reduce((s, a) => s + (a.current_balance || 0), 0);
        const totalExpenses = (accs || []).filter(a => a.type === "expense").reduce((s, a) => s + (a.current_balance || 0), 0);

        // Monthly trend: SQL-side aggregation via get_monthly_pnl(), not
        // raw gl_entries pulled into JS — PostgREST's silent 1000-row cap
        // would otherwise truncate a real GL history before any chart
        // needs to render (same bug already found and fixed several times
        // this session). Only returns months with real posted activity —
        // no fabricated zero-padding for months nothing's been posted to
        // yet, see the migration's own comment for why.
        const { data: monthly, error: pnlErr } = await supabase
          .rpc("get_monthly_pnl", { p_company_id: profile.company_id, p_months_back: 6 });
        if (pnlErr) throw pnlErr;

        if (!alive) return;
        setNetIncome(totalRevenue - totalExpenses);
        setTrend((monthly || []).map((m: any) => ({
          month: m.month_label,
          revenue: Number(m.revenue) || 0,
          expenses: Number(m.expenses) || 0,
        })));
      } catch (e: any) {
        if (!alive) return;
        // Logged, not thrown further — a failed P&L query must never
        // break the rest of the dashboard, same standard as Card 1.
        console.error("PnLOverviewCard failed to load:", e);
        setError(e.message || "Couldn't load P&L overview");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  return (
    <Card>
      <CardHeader title="P&L Overview" subtitle="Revenue vs expenses, last 6 months" />

      {/* TEMP: remove this note once all GL entity types are posted — Veron
          will ask for this specifically. Only Expenses and Fund Transfer are
          posted to the GL so far — Invoices, Bills, Customer Payments,
          Supplier Payments, and Field Payments still need Phase 2 posting —
          so Revenue in particular is currently far from complete. Same
          styling as CashPositionCard.tsx's caveat note, duplicated rather
          than shared since that file wasn't touched for this card. */}
      <div className="flex items-start gap-2 mb-3 px-3 py-2 rounded-lg bg-slate-100 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.06]">
        <Info size={13} className="text-slate-400 dark:text-slate-500 mt-0.5 flex-shrink-0" />
        <p className="text-[11px] text-slate-500 dark:text-slate-500 leading-snug">
          Revenue reflects only entities posted so far (Expenses, Fund Transfer) — figures will be
          incomplete until Invoices, Bills, Customer Payments, and Supplier Payments are posted.
        </p>
      </div>

      {loading ? (
        <div className="h-64 flex items-center justify-center">
          <Spinner size={20} />
        </div>
      ) : error ? (
        <div className="h-64 flex flex-col items-center justify-center gap-2 text-center px-4">
          <AlertTriangle size={20} className="text-amber-400" />
          <div className="text-xs text-slate-500">Couldn't load P&L overview right now.</div>
        </div>
      ) : !trend || trend.length === 0 ? (
        <div className="h-64 flex items-center justify-center">
          <Empty title="No posted GL activity yet" body="No revenue or expense transactions have been posted in the selected period." />
        </div>
      ) : (
        <>
          <div className="mb-3">
            <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-600">Net Income</div>
            <div className={`text-2xl font-bold ${(netIncome ?? 0) >= 0 ? "text-emerald-600 dark:text-emerald-300" : "text-red-600 dark:text-red-400"}`}>
              {fmt(netIncome ?? 0)}
            </div>
          </div>
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={trend}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" className="text-slate-200 dark:text-white/10" />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} stroke="currentColor" className="text-slate-400" />
                <YAxis tickFormatter={fmt} tick={{ fontSize: 10 }} stroke="currentColor" className="text-slate-400" />
                <Tooltip formatter={(v) => fmt(Number(v))} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="revenue" name="Revenue" fill="#34d399" radius={[4, 4, 0, 0]} />
                <Bar dataKey="expenses" name="Expenses" fill="#fbbf24" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </Card>
  );
}
