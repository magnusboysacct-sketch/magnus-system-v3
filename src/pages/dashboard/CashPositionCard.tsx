// src/pages/dashboard/CashPositionCard.tsx
import React, { useEffect, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { AlertTriangle, Info } from "lucide-react";
import { Card, CardHeader, Spinner, Empty } from "../../components/ui";
import { supabase } from "../../lib/supabase";

interface CashAccount {
  name: string;
  balance: number;
}

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

// Liquid-cash subtypes only, out of the real asset subtype vocabulary
// (current_asset, fixed_asset, bank, accounts_receivable, inventory,
// prepaid_expense — confirmed against chart_of_accounts' real CHECK
// constraint). 'bank' and 'current_asset' are the two that represent
// actual cash-like holdings; the other four (AR, fixed assets, inventory,
// prepaid expenses) are real assets too but not liquid cash, so
// deliberately excluded here even though they're also type='asset'.
const CASH_SUBTYPES = ["bank", "current_asset"];

export default function CashPositionCard() {
  const [accounts, setAccounts] = useState<CashAccount[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        // company_id resolved from the logged-in session, same pattern
        // every other page in this app uses — never hardcoded in
        // application code (the "give exact company_id directly" note is
        // for one-off SQL Editor scripts, not this).
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Not signed in");
        const { data: profile, error: profErr } = await supabase
          .from("user_profiles").select("company_id").eq("id", user.id).maybeSingle();
        if (profErr) throw profErr;
        if (!profile?.company_id) throw new Error("Couldn't determine company");

        // Same v_account_balances view FinanceDashboardPage.tsx already
        // queries for its own "accounts" tab — reused here, not a second,
        // independently-derived balance calculation that could disagree
        // with the Finance Dashboard's own numbers.
        const { data, error: balErr } = await supabase
          .from("v_account_balances")
          .select("name, current_balance, type, subtype")
          .eq("company_id", profile.company_id)
          .eq("type", "asset")
          .in("subtype", CASH_SUBTYPES)
          .order("code", { ascending: true });
        if (balErr) throw balErr;

        if (!alive) return;
        setAccounts((data || []).map(a => ({ name: a.name, balance: a.current_balance || 0 })));
      } catch (e: any) {
        if (!alive) return;
        // Logged, not thrown further — a failed Cash Position query must
        // never break the rest of the dashboard, per Stage 2's explicit
        // instruction. The card renders its own inline error state below.
        console.error("CashPositionCard failed to load:", e);
        setError(e.message || "Couldn't load cash position");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const total = (accounts || []).reduce((s, a) => s + a.balance, 0);

  return (
    <Card>
      <CardHeader title="Cash Position" subtitle="Balances across operating accounts" />

      {/* TEMP: remove once Supplier Payments and Field Payments are also
          posted — Veron will ask for this specifically. Updated once
          Invoices ($41.3M) and Customer Payments ($29.6M) were confirmed
          posted this session — Invoices never actually affected this card
          in the first place (it debits/credits Accounts Receivable and
          Revenue, neither a bank/current_asset subtype account this card
          sums), so it was dropped from the note rather than marked done.
          Customer Payments DOES affect this card — it debits 1600
          Undeposited Funds, a real cash-fund account (confirmed via
          scripts/post-expenses.ts's own PAID_THROUGH_TO_ACCOUNT_CODE
          mapping, which already treats 1600 as a cash source/destination
          alongside petty cash and the bank current account) — so that
          inflow is now correctly reflected. Direction flipped from the
          original note: it used to warn balances "may appear lower than
          actual" (real customer payments not yet in the GL); now the risk
          runs the other way — Supplier Payments and Field Payments are
          real cash OUTFLOWS not yet posted, so balances may currently
          appear HIGHER than actual until those are done too. */}
      <div className="flex items-start gap-2 mb-3 px-3 py-2 rounded-lg bg-slate-100 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.06]">
        <Info size={13} className="text-slate-400 dark:text-slate-500 mt-0.5 flex-shrink-0" />
        <p className="text-[11px] text-slate-500 dark:text-slate-500 leading-snug">
          Balances reflect posted GL transactions only. Supplier Payments and Field Payments
          haven't been posted to the GL yet — real cash may be lower than shown here until that's complete.
        </p>
      </div>

      {loading ? (
        <div className="h-64 flex items-center justify-center">
          <Spinner size={20} />
        </div>
      ) : error ? (
        <div className="h-64 flex flex-col items-center justify-center gap-2 text-center px-4">
          <AlertTriangle size={20} className="text-amber-400" />
          <div className="text-xs text-slate-500">Couldn't load cash position right now.</div>
        </div>
      ) : !accounts || accounts.length === 0 ? (
        <div className="h-64 flex items-center justify-center">
          <Empty title="No cash/bank accounts found" body="No asset accounts with a bank or current-asset subtype exist yet." />
        </div>
      ) : (
        <>
          <div className="mb-3">
            <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-600">
              Total Liquid Cash
            </div>
            <div className="text-2xl font-bold text-cyan-600 dark:text-cyan-300">{fmt(total)}</div>
          </div>
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={accounts} layout="vertical" margin={{ left: 8, right: 16 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="currentColor" className="text-slate-200 dark:text-white/10" />
                <XAxis type="number" tickFormatter={fmt} tick={{ fontSize: 10 }} stroke="currentColor" className="text-slate-400" />
                <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 10 }} stroke="currentColor" className="text-slate-400" />
                <Tooltip formatter={(v) => fmt(Number(v))} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <Bar dataKey="balance" fill="#22d3ee" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </Card>
  );
}
