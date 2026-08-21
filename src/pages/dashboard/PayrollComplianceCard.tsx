// src/pages/dashboard/PayrollComplianceCard.tsx
import React from "react";
import { Calendar, AlertTriangle } from "lucide-react";
import { Card, CardHeader, Badge } from "../../components/ui";

const PLACEHOLDER_REMITTANCES = [
  { label: "NHT — July 2026",           dueDate: "2026-08-14", amount: 18400, urgency: "soon" as const },
  { label: "NIS — July 2026",           dueDate: "2026-08-14", amount: 9200,  urgency: "soon" as const },
  { label: "PAYE — July 2026",          dueDate: "2026-08-14", amount: 22100, urgency: "soon" as const },
  { label: "Education Tax — July 2026", dueDate: "2026-08-14", amount: 5400,  urgency: "week" as const },
];

const URGENCY_COLOR = { soon: "amber", week: "red" } as const;

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

// TODO: Stage 2 — wire "Next Payroll" to payroll_periods (next upcoming
// pay_date) and the remittance list to the government_remittances table
// (already queried in DashboardPage.tsx, which shows only its single most
// urgent alert as a banner — this card shows the full upcoming list).
export default function PayrollComplianceCard() {
  return (
    <Card>
      <CardHeader title="Payroll & Remittance Compliance" subtitle="Upcoming pay dates and statutory deadlines" />
      <div className="flex items-center gap-3 p-3 rounded-xl border border-cyan-500/20 bg-cyan-500/5 mb-4">
        <div className="w-9 h-9 rounded-lg bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center flex-shrink-0">
          <Calendar size={16} className="text-cyan-400" />
        </div>
        <div>
          <div className="text-[10px] font-bold uppercase tracking-widest text-cyan-600 dark:text-cyan-400">Next Payroll</div>
          <div className="text-sm font-semibold text-slate-800 dark:text-slate-200">August 15, 2026</div>
        </div>
      </div>
      <div className="space-y-2">
        {PLACEHOLDER_REMITTANCES.map(r => (
          <div key={r.label} className="flex items-center justify-between py-2 px-3 rounded-lg border border-slate-200 dark:border-white/[0.06]">
            <div className="flex items-center gap-2 min-w-0">
              <AlertTriangle size={13} className={r.urgency === "week" ? "text-red-400" : "text-amber-400"} />
              <span className="text-xs text-slate-700 dark:text-slate-300 truncate">{r.label}</span>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className="text-xs text-slate-500">{fmtDate(r.dueDate)}</span>
              <Badge color={URGENCY_COLOR[r.urgency]}>{fmt(r.amount)}</Badge>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
