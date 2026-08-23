// src/pages/dashboard/OwnerDrawsCard.tsx
import React, { useEffect, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { AlertTriangle } from "lucide-react";
import { Card, CardHeader, Spinner, Empty } from "../../components/ui";
import { supabase } from "../../lib/supabase";

interface OwnerDraw {
  owner: string;
  ytd: number;
}

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "JMD", maximumFractionDigits: 0 }).format(n);
}

const OWNER_ACCOUNTS: Record<string, string> = { "3440": "Enron Williams", "3450": "Veron Williams" };

export default function OwnerDrawsCard() {
  const [draws, setDraws] = useState<OwnerDraw[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Not signed in");
        const { data: profile, error: profErr } = await supabase
          .from("user_profiles").select("company_id").eq("id", user.id).maybeSingle();
        if (profErr) throw profErr;
        if (!profile?.company_id) throw new Error("Couldn't determine company");

        // Three plain, separate queries rather than a PostgREST embedded
        // join — this codebase has an already-established, real gotcha
        // (see PayrollPage.tsx's own comment) where PostgREST's schema
        // cache doesn't reliably pick up a foreign key right after it's
        // added by hand, silently breaking embed syntax. Each step here
        // reuses only plain .eq()/.in() filtering, avoiding that risk
        // entirely — and none of these three result sets is large enough
        // (one company, one source_type, one year, two specific accounts)
        // to need SQL-side aggregation the way the 1000-row-scale GL
        // history did for the P&L monthly function.

        // 1. The two owner equity accounts by their real codes.
        const { data: accounts, error: acctErr } = await supabase
          .from("chart_of_accounts")
          .select("id, code")
          .eq("company_id", profile.company_id)
          .in("code", Object.keys(OWNER_ACCOUNTS));
        if (acctErr) throw acctErr;

        if (!accounts || accounts.length === 0) {
          if (!alive) return;
          setDraws([]);
          return;
        }
        const accountIdToCode = new Map(accounts.map(a => [a.id, a.code]));

        // 2. This year's posted Fund Transfer transactions — same
        // Jan 1–Dec 31 YTD boundary fetchWorkerYTDSummary() already uses
        // (src/lib/workerPortal.ts), the only existing YTD convention
        // anywhere in this app, mirrored rather than inventing a
        // different one.
        const year = new Date().getFullYear();
        const { data: transactions, error: txErr } = await supabase
          .from("gl_transactions")
          .select("id")
          .eq("company_id", profile.company_id)
          .eq("source_type", "fund_transfer")
          .eq("status", "posted")
          .gte("transaction_date", `${year}-01-01`)
          .lte("transaction_date", `${year}-12-31`);
        if (txErr) throw txErr;

        const transactionIds = (transactions || []).map(t => t.id);
        if (transactionIds.length === 0) {
          if (!alive) return;
          setDraws([]);
          return;
        }

        // 3. The entries touching either owner account within those
        // transactions. A draw posts Dr [owner equity account] / Cr [From
        // Account] (see the Transfer Fund entity design) — equity is
        // credit-normal, so debit is the direction that REDUCES it, i.e.
        // the direction a draw actually moves in. Summing debit - credit
        // (not credit - debit, the normal equity-balance sign) is
        // deliberate: this card asks "how much flowed OUT via draws,"
        // the opposite question from "what's this account's balance."
        const { data: entries, error: entriesErr } = await supabase
          .from("gl_entries")
          .select("account_id, debit, credit")
          .in("account_id", Array.from(accountIdToCode.keys()))
          .in("transaction_id", transactionIds);
        if (entriesErr) throw entriesErr;

        const totalsByCode: Record<string, number> = {};
        for (const e of entries || []) {
          const code = accountIdToCode.get((e as any).account_id);
          if (!code) continue;
          const net = (Number((e as any).debit) || 0) - (Number((e as any).credit) || 0);
          totalsByCode[code] = (totalsByCode[code] || 0) + net;
        }

        if (!alive) return;
        const fetchedCodes = new Set(accounts.map(a => a.code));
        setDraws(
          Object.entries(OWNER_ACCOUNTS)
            .filter(([code]) => fetchedCodes.has(code))
            .map(([code, name]) => ({ owner: name, ytd: totalsByCode[code] || 0 }))
        );
      } catch (e: any) {
        if (!alive) return;
        console.error("OwnerDrawsCard failed to load:", e);
        setError(e.message || "Couldn't load owner draws");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  return (
    <Card>
      <CardHeader title="Owner Draws" subtitle="Year to date" />
      {loading ? (
        <div className="h-48 flex items-center justify-center">
          <Spinner size={20} />
        </div>
      ) : error ? (
        <div className="h-48 flex flex-col items-center justify-center gap-2 text-center px-4">
          <AlertTriangle size={20} className="text-amber-400" />
          <div className="text-xs text-slate-500">Couldn't load owner draws right now.</div>
        </div>
      ) : !draws || draws.length === 0 ? (
        <div className="h-48 flex items-center justify-center">
          <Empty title="No owner draws this year" body="No Fund Transfer postings to Enron/Veron Williams' equity accounts yet." />
        </div>
      ) : (
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={draws} layout="vertical" margin={{ left: 8, right: 16 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="currentColor" className="text-slate-200 dark:text-white/10" />
              <XAxis type="number" tickFormatter={fmt} tick={{ fontSize: 10 }} stroke="currentColor" className="text-slate-400" />
              <YAxis type="category" dataKey="owner" width={100} tick={{ fontSize: 10 }} stroke="currentColor" className="text-slate-400" />
              <Tooltip formatter={(v) => fmt(Number(v))} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              <Bar dataKey="ytd" fill="#a78bfa" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}
