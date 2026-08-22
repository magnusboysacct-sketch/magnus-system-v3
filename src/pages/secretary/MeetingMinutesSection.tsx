// src/pages/secretary/MeetingMinutesSection.tsx
import React from "react";
import { Plus, FileText } from "lucide-react";
import { Card, CardHeader, Btn } from "../../components/ui";

const PLACEHOLDER_MINUTES = [
  { title: "Board Meeting — August 2026", date: "2026-08-05", attendees: 5 },
  { title: "Site Coordination — Harbor View Offices", date: "2026-07-28", attendees: 4 },
  { title: "Board Meeting — July 2026", date: "2026-07-01", attendees: 5 },
];

// TODO: Stage 2 — this is likely just another document_type within
// secretary_documents ('meeting_minutes') rather than a separate table —
// reuses the same draft/pending_approval/approved/printed workflow (a
// meeting minutes document plausibly still wants sign-off before it's
// treated as the official record), same reasoning as document_type being
// left as plain text rather than a fixed enum.
export default function MeetingMinutesSection() {
  return (
    <Card>
      <div className="flex items-center justify-between">
        <CardHeader title="Meeting Minutes" subtitle="Past meeting notes" />
        <Btn variant="primary" size="sm" icon={<Plus size={13} />}>New Minutes</Btn>
      </div>
      <div className="space-y-2">
        {PLACEHOLDER_MINUTES.map((m, i) => (
          <div key={i} className="flex items-center justify-between py-2.5 px-3 rounded-lg border border-slate-200 dark:border-white/[0.06]">
            <div className="flex items-center gap-2.5 min-w-0">
              <FileText size={14} className="text-slate-400 flex-shrink-0" />
              <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">{m.title}</span>
            </div>
            <div className="flex items-center gap-3 flex-shrink-0 text-[11px] text-slate-500">
              <span>{m.attendees} attendees</span>
              <span>{m.date}</span>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
