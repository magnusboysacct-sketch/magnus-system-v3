// src/pages/dashboard/ReceivablesPayablesCard.tsx
import React, { useEffect, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { AlertTriangle } from "lucide-react";
import { Card, CardHeader, Spinner, Empty } from "../../components/ui";
import { supabase } from "../../lib/supabase";

interface AgingBucket {
  bucket: string;
  amount: number;
}

// "Not Yet Due" first, then the 4 overdue buckets — matches
// get_ar_ap_aging()'s own bucket order (20260822040000_add_not_yet_due_
// aging_bucket.sql), so a healthy not-yet-due invoice doesn't visually
// blend into the 0-30-days-overdue bar.
const BUCKET_ORDER = ["Not Yet Due", "0-30", "31-60", "61-90", "90+"];

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "JMD", maximumFractionDigits: 0 }).format(n);
}

export default function ReceivablesPayablesCard() {
  const [arAging, setArAging] = useState<AgingBucket[] | null>(null);
  const [apAging, setApAging] = useState<AgingBucket[] | null>(null);
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

        // SQL-side aging aggregation via get_ar_ap_aging() — no aging
        // logic exists anywhere else in the app to mirror (checked
        // AccountsReceivablePage.tsx and AccountsPayablePage.tsx
        // directly), so this is genuinely new, not reused. Same 1000-
        // row-cap discipline as the P&L card even though these two
        // tables are small today.
        const { data, error: agingErr } = await supabase
          .rpc("get_ar_ap_aging", { p_company_id: profile.company_id });
        if (agingErr) throw agingErr;

        if (!alive) return;
        const byKindAndBucket = new Map<string, number>();
        for (const row of data || []) {
          byKindAndBucket.set(`${row.kind}:${row.bucket}`, Number(row.amount) || 0);
        }
        // Every bucket shown even if zero — unlike the P&L monthly trend
        // (where a missing month means "not posted yet," genuinely
        // ambiguous), a zero-balance aging bucket is an unambiguous,
        // honest zero: no invoices/bills happen to fall in that range.
        setArAging(BUCKET_ORDER.map(bucket => ({ bucket, amount: byKindAndBucket.get(`receivable:${bucket}`) || 0 })));
        setApAging(BUCKET_ORDER.map(bucket => ({ bucket, amount: byKindAndBucket.get(`payable:${bucket}`) || 0 })));
      } catch (e: any) {
        if (!alive) return;
        console.error("ReceivablesPayablesCard failed to load:", e);
        setError(e.message || "Couldn't load receivables/payables aging");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const arTotal = (arAging || []).reduce((s, b) => s + b.amount, 0);
  const apTotal = (apAging || []).reduce((s, b) => s + b.amount, 0);
  const isEmpty = !loading && !error && arTotal === 0 && apTotal === 0;

  return (
    <Card>
      <CardHeader title="Receivables & Payables" subtitle="Aging, by days outstanding" />

      {loading ? (
        <div className="h-48 flex items-center justify-center">
          <Spinner size={20} />
        </div>
      ) : error ? (
        <div className="h-48 flex flex-col items-center justify-center gap-2 text-center px-4">
          <AlertTriangle size={20} className="text-amber-400" />
          <div className="text-xs text-slate-500">Couldn't load receivables/payables aging right now.</div>
        </div>
      ) : isEmpty ? (
        <div className="h-48 flex items-center justify-center">
          <Empty title="Nothing outstanding" body="No unpaid invoices or bills right now." />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-emerald-600 dark:text-emerald-400 mb-2">
              Receivables — {fmt(arTotal)}
            </div>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={arAging!}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" className="text-slate-200 dark:text-white/10" />
                  <XAxis dataKey="bucket" tick={{ fontSize: 9 }} stroke="currentColor" className="text-slate-400" interval={0} angle={-25} textAnchor="end" height={40} />
                  <YAxis tickFormatter={fmt} tick={{ fontSize: 9 }} stroke="currentColor" className="text-slate-400" width={50} />
                  <Tooltip formatter={(v) => fmt(Number(v))} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                  <Bar dataKey="amount" fill="#34d399" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-red-600 dark:text-red-400 mb-2">
              Payables — {fmt(apTotal)}
            </div>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={apAging!}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" className="text-slate-200 dark:text-white/10" />
                  <XAxis dataKey="bucket" tick={{ fontSize: 9 }} stroke="currentColor" className="text-slate-400" interval={0} angle={-25} textAnchor="end" height={40} />
                  <YAxis tickFormatter={fmt} tick={{ fontSize: 9 }} stroke="currentColor" className="text-slate-400" width={50} />
                  <Tooltip formatter={(v) => fmt(Number(v))} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                  <Bar dataKey="amount" fill="#f87171" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
