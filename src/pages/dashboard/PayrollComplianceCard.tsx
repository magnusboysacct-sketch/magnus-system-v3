// src/pages/dashboard/PayrollComplianceCard.tsx
import React, { useEffect, useState } from "react";
import { Calendar, AlertTriangle } from "lucide-react";
import { Card, CardHeader, Badge, Spinner, Empty } from "../../components/ui";
import { supabase } from "../../lib/supabase";

type Urgency = "overdue" | "week" | "soon" | "normal";

interface RemittanceRow {
  id: string;
  periodLabel: string;
  dueDate: string;
  totalDue: number;
  urgency: Urgency;
}

interface LastPayroll {
  periodLabel: string;
  totalNetPay: number;
}

const URGENCY_COLOR: Record<Urgency, "red" | "amber" | "slate"> = {
  overdue: "red", week: "red", soon: "amber", normal: "slate",
};
const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];

// Parses the date-only string's components directly rather than via
// new Date(isoString) — JS treats a bare "YYYY-MM-DD" as UTC midnight,
// and toLocaleDateString() renders in the browser's LOCAL timezone, so
// for any timezone behind UTC (Jamaica is UTC-5) that UTC midnight
// instant lands on the PREVIOUS local day — "2026-09-14" was displaying
// as "Sep 13". Constructing the Date via the (year, monthIndex, day)
// local-time constructor overload avoids UTC interpretation entirely.
function fmtDate(d: string) {
  const [year, month, day] = d.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "JMD", maximumFractionDigits: 0 }).format(n);
}

// Same classification DashboardPage.tsx already uses for its single most-
// urgent remittance alert (overdue if past due, "week" inside 7 days,
// "soon" inside 14 days) — mirrored exactly, just applied to every pending
// row here instead of picking only the soonest one, since this card is
// meant to show the full upcoming list, not one banner.
//
// Same UTC-midnight parsing issue fmtDate() had, plus a second, separate
// one: even after parsing dueDate correctly, comparing it against
// Date.now() (the current instant, including today's time-of-day) rather
// than "today at local midnight" leaves a fractional-day remainder that
// Math.ceil can round inconsistently near a day boundary. Fixed by
// normalizing BOTH sides to local midnight before subtracting — the
// difference is then always an exact whole number of days, so the
// rounding function used no longer matters.
function classifyUrgency(dueDate: string): Urgency {
  const [year, month, day] = dueDate.split("-").map(Number);
  const due = new Date(year, month - 1, day);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.round((due.getTime() - today.getTime()) / 86400000);
  if (days < 0) return "overdue";
  if (days < 7) return "week";
  if (days <= 14) return "soon";
  return "normal";
}

export default function PayrollComplianceCard() {
  const [lastPayroll, setLastPayroll] = useState<LastPayroll | null>(null);
  const [remittances, setRemittances] = useState<RemittanceRow[] | null>(null);
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

        // "Next Payroll" — no scheduled-future-date concept exists anywhere
        // in the real schema (staff_payroll_runs only records paid_at, a
        // PAST timestamp, once a run is actually processed; there's no
        // payroll_periods-style advance schedule for staff payroll the way
        // there might be for field workers — and PayrollPage.tsx's own
        // comment confirms payroll_periods is a different, field-worker-
        // only table, not this one). Rather than fabricate a future date
        // that doesn't exist anywhere, this shows the real most recent
        // processed run instead, clearly labeled "Last Payroll Run" — see
        // report for why this substitution was made, flagged for Veron
        // rather than silently guessed.
        const { data: lastRuns, error: runsErr } = await supabase
          .from("staff_payroll_runs")
          .select("period_month, period_year, net_pay")
          .eq("company_id", profile.company_id)
          .order("period_year", { ascending: false })
          .order("period_month", { ascending: false });
        if (runsErr) throw runsErr;

        let last: LastPayroll | null = null;
        if (lastRuns && lastRuns.length > 0) {
          const { period_month, period_year } = lastRuns[0];
          const totalNetPay = lastRuns
            .filter(r => r.period_month === period_month && r.period_year === period_year)
            .reduce((s, r) => s + (Number(r.net_pay) || 0), 0);
          last = { periodLabel: `${MONTH_NAMES[period_month - 1]} ${period_year}`, totalNetPay };
        }

        // Full pending remittance list — real columns confirmed directly
        // from PayrollPage.tsx's Remittance interface + loadRemittances()/
        // the DashboardPage.tsx alert query, not guessed. One row per
        // period (period_month/period_year), not per contribution type —
        // government_remittances combines PAYE/NHT/NIS/Education Tax/HEART
        // into sub-total columns on a single row with one combined
        // total_due, unlike Stage 1's placeholder shape (4 separate NHT/
        // NIS/PAYE/Education Tax rows) — flagged clearly in the report,
        // adapted to the real one-row-per-period structure rather than
        // forced into a shape the data doesn't actually have.
        const { data: pending, error: remErr } = await supabase
          .from("government_remittances")
          .select("id, period_month, period_year, due_date, total_due")
          .eq("company_id", profile.company_id)
          .eq("status", "pending")
          .order("due_date", { ascending: true });
        if (remErr) throw remErr;

        if (!alive) return;
        setLastPayroll(last);
        setRemittances((pending || []).map((r: any) => ({
          id: r.id,
          periodLabel: `${MONTH_NAMES[r.period_month - 1]} ${r.period_year}`,
          dueDate: r.due_date,
          totalDue: Number(r.total_due) || 0,
          urgency: classifyUrgency(r.due_date),
        })));
      } catch (e: any) {
        if (!alive) return;
        console.error("PayrollComplianceCard failed to load:", e);
        setError(e.message || "Couldn't load payroll compliance data");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  return (
    <Card>
      <CardHeader title="Payroll & Remittance Compliance" subtitle="Recent payroll and upcoming statutory deadlines" />

      {loading ? (
        <div className="h-48 flex items-center justify-center">
          <Spinner size={20} />
        </div>
      ) : error ? (
        <div className="h-48 flex flex-col items-center justify-center gap-2 text-center px-4">
          <AlertTriangle size={20} className="text-amber-400" />
          <div className="text-xs text-slate-500">Couldn't load payroll compliance data right now.</div>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-3 p-3 rounded-xl border border-cyan-500/20 bg-cyan-500/5 mb-4">
            <div className="w-9 h-9 rounded-lg bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center flex-shrink-0">
              <Calendar size={16} className="text-cyan-400" />
            </div>
            <div className="min-w-0">
              <div className="text-[10px] font-bold uppercase tracking-widest text-cyan-600 dark:text-cyan-400">Last Payroll Run</div>
              {lastPayroll ? (
                <div className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                  {lastPayroll.periodLabel} — {fmt(lastPayroll.totalNetPay)} net
                </div>
              ) : (
                <div className="text-sm font-semibold text-slate-500">No payroll runs yet</div>
              )}
            </div>
          </div>

          {!remittances || remittances.length === 0 ? (
            <Empty title="No pending remittances" body="All statutory remittances are marked paid." />
          ) : (
            <div className="space-y-2">
              {remittances.map(r => (
                <div key={r.id} className="flex items-center justify-between py-2 px-3 rounded-lg border border-slate-200 dark:border-white/[0.06]">
                  <div className="flex items-center gap-2 min-w-0">
                    <AlertTriangle size={13} className={r.urgency === "overdue" || r.urgency === "week" ? "text-red-400" : r.urgency === "soon" ? "text-amber-400" : "text-slate-400"} />
                    <span className="text-xs text-slate-700 dark:text-slate-300 truncate">{r.periodLabel} Remittance</span>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-xs text-slate-500">{fmtDate(r.dueDate)}</span>
                    <Badge color={URGENCY_COLOR[r.urgency]}>{fmt(r.totalDue)}</Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </Card>
  );
}
