// src/pages/dashboard/WorkforceSnapshotCard.tsx
import React, { useEffect, useState } from "react";
import { Users, HardHat, AlertTriangle } from "lucide-react";
import { Card, CardHeader, StatCard, Spinner } from "../../components/ui";
import { supabase } from "../../lib/supabase";

// Real JMD currency format — matches FieldPaymentsPage.tsx's own fmtJMD
// exactly (field_payments is Jamaican-worker-specific data throughout this
// app; a generic USD formatter here would be its own, quieter inaccuracy).
function fmtJMD(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "JMD", minimumFractionDigits: 0 }).format(n);
}

// No week-boundary convention exists anywhere else in the codebase
// (checked) — Monday-to-today, per the handoff's own suggested default.
// Computed in local time, consistent with how dates are handled elsewhere
// in this app (plain Date/toLocaleDateString, no timezone library).
function mondayOfThisWeek(): string {
  const now = new Date();
  const day = now.getDay(); // 0 = Sunday, 1 = Monday, ... 6 = Saturday
  const diffToMonday = day === 0 ? 6 : day - 1;
  const monday = new Date(now);
  monday.setDate(now.getDate() - diffToMonday);
  monday.setHours(0, 0, 0, 0);
  return monday.toISOString().slice(0, 10); // YYYY-MM-DD, matches work_date's date type
}

export default function WorkforceSnapshotCard() {
  const [activeWorkers, setActiveWorkers] = useState<number | null>(null);
  const [weeklyFieldPayments, setWeeklyFieldPayments] = useState<number | null>(null);
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

        // Identical filter to DashboardPage.tsx's own proven-correct Active
        // Workers KPI — workers has no is_active column (confirmed against
        // the table's real migration earlier this session), status='active'
        // is the real three-state column value, not guessed here.
        const { data: workers, error: workersErr } = await supabase
          .from("workers").select("id")
          .eq("company_id", profile.company_id)
          .eq("status", "active");
        if (workersErr) throw workersErr;

        // Same query shape FieldPaymentsPage.tsx's own loadPayments() uses
        // (select, filter by company_id, no status filter — its own
        // totalPaid stat sums ALL statuses unfiltered, so this mirrors
        // that rather than imposing a different, disagreeing convention),
        // narrowed to work_date >= Monday of the current week.
        const monday = mondayOfThisWeek();
        const { data: payments, error: paymentsErr } = await supabase
          .from("field_payments").select("total_amount")
          .eq("company_id", profile.company_id)
          .gte("work_date", monday);
        if (paymentsErr) throw paymentsErr;

        if (!alive) return;
        setActiveWorkers((workers || []).length);
        setWeeklyFieldPayments((payments || []).reduce((s, p: any) => s + (Number(p.total_amount) || 0), 0));
      } catch (e: any) {
        if (!alive) return;
        console.error("WorkforceSnapshotCard failed to load:", e);
        setError(e.message || "Couldn't load workforce snapshot");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  return (
    <Card>
      <CardHeader title="Workforce Snapshot" subtitle="This week" />
      {loading ? (
        <div className="h-20 flex items-center justify-center">
          <Spinner size={20} />
        </div>
      ) : error ? (
        <div className="h-20 flex flex-col items-center justify-center gap-2 text-center px-4">
          <AlertTriangle size={18} className="text-amber-400" />
          <div className="text-xs text-slate-500">Couldn't load workforce data right now.</div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <StatCard label="Active Workers" value={activeWorkers ?? 0} color="text-cyan-300" icon={<Users size={15} />} />
          <StatCard label="Field Payments (wk)" value={fmtJMD(weeklyFieldPayments ?? 0)} color="text-amber-300" icon={<HardHat size={15} />} />
        </div>
      )}
    </Card>
  );
}
