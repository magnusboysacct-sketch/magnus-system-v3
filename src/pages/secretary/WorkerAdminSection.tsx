// src/pages/secretary/WorkerAdminSection.tsx
import React from "react";
import { UserCheck, AlertTriangle } from "lucide-react";
import { Card, CardHeader, Btn, Badge, Table, Th, Tr, Td } from "../../components/ui";

const PLACEHOLDER_WORKERS = [
  { name: "Marcus Bailey", role: "Site Supervisor" },
  { name: "Andrea Fisher", role: "Mason" },
  { name: "Sean Powell", role: "Electrician" },
];

// Real column confirmed directly from the workers table's migration
// history (20260723000001_add_workers_id_expiry_date.sql): id_expiry_date
// is specifically ID CARD expiry, not a general "certification/license"
// concept — there's no dedicated certifications/licenses table or column
// on workers today. This placeholder uses id_expiry_date as the closest
// real, existing field; Stage 2 needs a decision on whether to reuse it
// as-is or introduce a proper certifications concept.
const PLACEHOLDER_EXPIRY = [
  { name: "Marcus Bailey", item: "ID Card", expires: "2026-09-02", daysLeft: 11 },
  { name: "Andrea Fisher", item: "ID Card", expires: "2026-11-14", daysLeft: 84 },
];

export default function WorkerAdminSection() {
  return (
    <div className="space-y-5">
      {/* TODO: Stage 2 — wire to a real workers SELECT (id, first_name,
          last_name, job_title, hire_date, worker_type, status — all
          confirmed real columns, not guessed) and an "Employment Letter"
          flow that pre-fills a secretary_documents draft from the
          selected worker's record, same auto-fill spirit as any existing
          "duplicate"/"copy from" flow elsewhere in this app. */}
      <Card>
        <CardHeader title="Employment Letters" subtitle="Auto-fill from a worker's record" />
        <div className="space-y-2">
          {PLACEHOLDER_WORKERS.map(w => (
            <div key={w.name} className="flex items-center justify-between py-2.5 px-3 rounded-lg border border-slate-200 dark:border-white/[0.06]">
              <div className="flex items-center gap-2.5 min-w-0">
                <UserCheck size={14} className="text-cyan-400 flex-shrink-0" />
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">{w.name}</div>
                  <div className="text-[11px] text-slate-500">{w.role}</div>
                </div>
              </div>
              <Btn variant="secondary" size="xs">Generate Letter</Btn>
            </div>
          ))}
        </div>
      </Card>

      {/* TODO: Stage 2 — wire to workers.id_expiry_date, filtered to
          expires within N days (e.g. 30/60/90), ordered soonest first —
          same urgency-classification spirit as the Director Dashboard's
          Payroll & Remittance Compliance card. */}
      <Card padding={false}>
        <div className="px-4 py-3 border-b border-slate-200 dark:border-white/[0.06] flex items-center gap-2">
          <AlertTriangle size={14} className="text-amber-400" />
          <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">Upcoming ID Card Expiries</span>
        </div>
        <Table>
          <thead><tr><Th>Worker</Th><Th>Item</Th><Th>Expires</Th><Th right>Days Left</Th></tr></thead>
          <tbody>
            {PLACEHOLDER_EXPIRY.map((e, i) => (
              <Tr key={i}>
                <Td>{e.name}</Td>
                <Td muted>{e.item}</Td>
                <Td muted>{e.expires}</Td>
                <Td right><Badge color={e.daysLeft <= 14 ? "red" : "amber"}>{e.daysLeft}d</Badge></Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
