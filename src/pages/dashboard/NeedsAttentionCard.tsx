// src/pages/dashboard/NeedsAttentionCard.tsx
import React from "react";
import { AlertCircle, Clock, FileWarning } from "lucide-react";
import { Card, CardHeader } from "../../components/ui";

const PLACEHOLDER_ALERTS = [
  { icon: <FileWarning size={14} className="text-red-400" />,   label: "Invoice INV-1042 overdue 34 days", detail: "Harbor View Offices — $12,400" },
  { icon: <Clock size={14} className="text-amber-400" />,       label: "PAYE remittance due in 4 days",     detail: "July 2026 — $22,100" },
  { icon: <AlertCircle size={14} className="text-orange-400" />, label: "Unmatched bank transaction",        detail: "$3,600 deposit, Aug 12 — no matching invoice" },
  { icon: <FileWarning size={14} className="text-red-400" />,   label: "Bill BILL-0091 overdue 12 days",    detail: "ABC Hardware — $6,800" },
];

// TODO: Stage 2 — wire each alert type to its real source and merge into
// one sorted-by-urgency feed: overdue invoices (client_invoices where
// status != 'paid' and due_date past), upcoming remittances
// (government_remittances), unmatched transactions (bank_transactions /
// credit_card_transactions with no gl_transaction_id), overdue bills
// (supplier_invoices where status != 'paid' and due_date past).
export default function NeedsAttentionCard() {
  return (
    <Card>
      <CardHeader title="Needs Attention" subtitle="Items requiring review" />
      <div className="space-y-2">
        {PLACEHOLDER_ALERTS.map((a, i) => (
          <div key={i} className="flex items-start gap-2.5 py-2 px-3 rounded-lg border border-slate-200 dark:border-white/[0.06]">
            <div className="mt-0.5 flex-shrink-0">{a.icon}</div>
            <div className="min-w-0">
              <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">{a.label}</div>
              <div className="text-[11px] text-slate-500 truncate">{a.detail}</div>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
