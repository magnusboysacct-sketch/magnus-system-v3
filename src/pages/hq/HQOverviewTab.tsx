// src/pages/hq/HQOverviewTab.tsx — Magnus HQ Overview: what needs attention, the platform today, and 30-day charts.
// Counts and totals only. HQ never sees a company's documents, payroll or clients here.
// Template companies and the HQ login's own company are never counted.

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, ChevronRight, CircleCheck, RefreshCw, ShieldAlert } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Alert, Btn, Card, CardHeader, Spinner, StatCard } from "../../components/ui";
import { cn } from "../../lib/theme";
import { fetchOverview, type DailyPoint, type HQOverview } from "../../lib/hq/platformAdmin";

const n = (v: number | null | undefined) => (v ?? 0).toLocaleString("en-JM");

function fmtBytes(b: number) {
  if (b < 1024 * 1024) return `${Math.max(1, Math.round(b / 1024))} KB`;
  if (b < 1024 ** 3) return `${(b / 1024 ** 2).toFixed(1)} MB`;
  return `${(b / 1024 ** 3).toFixed(2)} GB`;
}

function shortDay(iso: string) {
  return new Date(`${iso}T12:00:00`).toLocaleDateString("en-JM", { day: "numeric", month: "short" });
}

function DailyChart({ title, subtitle, data, color }: { title: string; subtitle: string; data: DailyPoint[]; color: string }) {
  const rows = data.map((d) => ({ label: shortDay(d.day), n: d.n }));
  return (
    <Card>
      <CardHeader title={title} subtitle={subtitle} />
      <div className="h-44">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ left: -20, right: 4, top: 4 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" className="text-slate-200 dark:text-white/10" />
            <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={6} stroke="currentColor" className="text-slate-400" />
            <YAxis allowDecimals={false} tick={{ fontSize: 10 }} stroke="currentColor" className="text-slate-400" />
            <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} cursor={{ fillOpacity: 0.08 }} />
            <Bar dataKey="n" name="Count" fill={color} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

export default function HQOverviewTab({ onOpenTab }: { onOpenTab: (tab: string) => void }) {
  const [data, setData] = useState<HQOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true); setError(null);
    try {
      setData(await fetchOverview());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (!data) {
    return error
      ? <Alert type="error">{error}</Alert>
      : <div className="flex justify-center py-16"><Spinner /></div>;
  }

  const c = data.companies;
  const x = data.numbers;

  return (
    <div className="space-y-4">
      {error && <Alert type="error" onClose={() => setError(null)}>{error}</Alert>}

      {/* Needs your attention */}
      <Card padding={false}>
        <div className="p-4 pb-2">
          <CardHeader
            title="Needs your attention"
            subtitle={`Updated ${new Date(data.generated_at).toLocaleTimeString("en-JM", { timeStyle: "short" })}`}
            action={<Btn icon={<RefreshCw size={13} className={busy ? "animate-spin" : ""} />} onClick={() => { void load(); }} disabled={busy}>Refresh</Btn>}
          />
        </div>
        {data.attention.length === 0 ? (
          <div className="flex items-center gap-2 px-4 pb-4 text-sm text-emerald-700 dark:text-emerald-400">
            <CircleCheck size={16} /> Nothing needs you right now.
          </div>
        ) : (
          <div className="border-t border-slate-100 dark:border-white/[0.04]">
            {data.attention.map((a, i) => (
              <button
                key={`${a.tab}:${a.title}:${i}`}
                onClick={() => onOpenTab(a.tab)}
                className={cn(
                  "w-full flex items-center gap-3 px-4 py-3 text-left border-l-4 border-b border-b-slate-100 dark:border-b-white/[0.04] hover:bg-slate-50 dark:hover:bg-white/[0.03] transition-colors",
                  a.level === "problem" ? "border-l-red-500" : a.level === "warn" ? "border-l-amber-400" : "border-l-sky-400",
                )}
              >
                {a.level === "problem"
                  ? <ShieldAlert size={16} className="text-red-500 shrink-0" />
                  : <AlertTriangle size={16} className="text-amber-500 shrink-0" />}
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-slate-800 dark:text-slate-200">{a.title}</div>
                  <div className="text-[11px] text-slate-500">{a.detail}</div>
                </div>
                <ChevronRight size={14} className="text-slate-400 shrink-0" />
              </button>
            ))}
          </div>
        )}
      </Card>

      {/* Companies */}
      <div>
        <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2 px-1">Companies</div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <StatCard label="Total" value={n(c.total)} sub={`${n(c.new_30d)} new in 30 days`} />
          <StatCard label="On trial" value={n(c.trial)} />
          <StatCard label="Paid" value={n(c.paid)} color="text-emerald-600 dark:text-emerald-400" />
          <StatCard label="Past due" value={n(c.past_due)} color={c.past_due > 0 ? "text-amber-600 dark:text-amber-400" : undefined} />
          <StatCard label="Closed" value={n(c.closed)} sub="Arrives with the Companies tab" />
        </div>
      </div>

      {/* The platform today */}
      <div>
        <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2 px-1">The platform today</div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          <StatCard label="Users" value={n(x.users)} sub={`${n(x.active_today)} active today · ${n(x.active_7d)} this week`} />
          <StatCard label="Active workers" value={n(x.workers)} />
          <StatCard label="Projects" value={n(x.projects)} sub={`${n(x.projects_active)} active`} />
          <StatCard label="Payroll runs" value={n(x.payroll_runs_month)} sub="This month" />
          <StatCard label="Invoices raised" value={n(x.invoices_month)} sub={`This month · ${n(x.invoices_total)} in all`} />
          <StatCard label="Documents stored" value={n(x.files)} sub={fmtBytes(x.storage_bytes)} />
          <StatCard label="Platform income" value={x.income_month == null ? "—" : `J$${n(x.income_month)}`} sub="This month · arrives with billing" />
        </div>
      </div>

      {/* Charts */}
      <div className="grid gap-4 lg:grid-cols-2">
        <DailyChart title="New companies" subtitle="Sign-ups per day, last 30 days" data={data.new_companies_daily} color="#6366f1" />
        <DailyChart title="Active users" subtitle="People who used Magnus each day, last 30 days" data={data.active_users_daily} color="#22d3ee" />
      </div>
    </div>
  );
}
