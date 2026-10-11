// src/pages/dashboard/OwnerDrawsCard.tsx
import React, { useEffect, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { AlertTriangle } from "lucide-react";
import { Card, CardHeader, Spinner, Empty } from "../../components/ui";
import { supabase } from "../../lib/supabase";
import { fetchOwnerDrawsYTD } from "../../lib/ownerDraws";

interface OwnerDraw {
  owner: string;
  ytd: number;
}

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "JMD", maximumFractionDigits: 0 }).format(n);
}

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

        // Every active equity account of this company with posted Fund Transfer activity this year, named by the account's own name
        // (src/lib/ownerDraws.ts - the same function the AI summary uses, so the two cannot disagree).
        const rows = await fetchOwnerDrawsYTD(profile.company_id);
        if (!alive) return;
        setDraws(rows.map(r => ({ owner: r.accountName, ytd: r.ytd })));
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
          <Empty title="No owner draws this year" body="No Fund Transfer postings to owner equity accounts yet." />
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
