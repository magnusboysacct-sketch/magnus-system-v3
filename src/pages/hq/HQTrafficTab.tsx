// src/pages/hq/HQTrafficTab.tsx — anonymous traffic: views per hour, busiest sections, visitors per day.
// Counts only: no names, no addresses, no device ids are ever collected.

import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Alert, Btn, Card, CardHeader, Spinner } from "../../components/ui";
import { fetchTraffic, type HQTraffic } from "../../lib/hq/platformAdmin";

export default function HQTrafficTab() {
  const [t, setT] = useState<HQTraffic | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    try { setT(await fetchTraffic()); } catch (e: unknown) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  if (!t) return error ? <Alert type="error">{error}</Alert> : <div className="flex justify-center py-16"><Spinner /></div>;

  const hours = t.by_hour.map((h) => ({
    label: new Date(h.hour).toLocaleTimeString("en-JM", { hour: "numeric" }),
    "Signed in": h.signed_in,
    "Signed out": Math.max(0, h.views - h.signed_in),
  }));
  const days = t.visitors_daily.map((d) => ({
    label: new Date(`${d.day}T12:00:00`).toLocaleDateString("en-JM", { day: "numeric", month: "short" }),
    "Signed in": d.signed_in,
    "Signed out": d.visitors,
  }));
  const maxSection = Math.max(1, ...t.by_section.map((s) => s.views));

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Btn icon={<RefreshCw size={13} className={busy ? "animate-spin" : ""} />} onClick={() => { void load(); }} disabled={busy}>Refresh</Btn>
      </div>

      <Card>
        <CardHeader title="Views per hour" subtitle="Last 48 hours. A view = moving into a section of the app." />
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={hours} margin={{ left: -20, right: 4, top: 4 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" className="text-slate-200 dark:text-white/10" />
              <XAxis dataKey="label" tick={{ fontSize: 9 }} interval={5} stroke="currentColor" className="text-slate-400" />
              <YAxis allowDecimals={false} tick={{ fontSize: 10 }} stroke="currentColor" className="text-slate-400" />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="Signed in" stackId="a" fill="#6366f1" />
              <Bar dataKey="Signed out" stackId="a" fill="#94a3b8" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Visitors per day" subtitle="Last 30 days. Each browser counts once a day." />
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={days} margin={{ left: -20, right: 4, top: 4 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" className="text-slate-200 dark:text-white/10" />
                <XAxis dataKey="label" tick={{ fontSize: 9 }} interval={6} stroke="currentColor" className="text-slate-400" />
                <YAxis allowDecimals={false} tick={{ fontSize: 10 }} stroke="currentColor" className="text-slate-400" />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="Signed in" stackId="a" fill="#22d3ee" />
                <Bar dataKey="Signed out" stackId="a" fill="#94a3b8" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <CardHeader title="Busiest sections" subtitle="Last 7 days" />
          {t.by_section.length === 0 ? <p className="text-xs text-slate-500">No visits counted yet.</p> : (
            <div className="space-y-1.5">
              {t.by_section.map((s) => (
                <div key={s.section} className="flex items-center gap-2 text-xs">
                  <span className="w-28 truncate text-slate-600 dark:text-slate-400">/{s.section}</span>
                  <div className="flex-1 h-2 rounded-full bg-slate-100 dark:bg-white/10 overflow-hidden">
                    <div className="h-full bg-indigo-500" style={{ width: `${(100 * s.views) / maxSection}%` }} />
                  </div>
                  <span className="w-12 text-right tabular-nums">{s.views.toLocaleString("en-JM")}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
