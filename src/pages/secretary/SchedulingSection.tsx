// src/pages/secretary/SchedulingSection.tsx
import React from "react";
import { CalendarDays, MapPin, Users as UsersIcon } from "lucide-react";
import { Card, CardHeader, Badge } from "../../components/ui";

const TYPE_ICON: Record<string, React.ReactNode> = {
  meeting: <UsersIcon size={13} className="text-cyan-400" />,
  site_visit: <MapPin size={13} className="text-emerald-400" />,
  deadline: <CalendarDays size={13} className="text-red-400" />,
};

const PLACEHOLDER_EVENTS = [
  { title: "Client meeting — Harbor View Offices", type: "meeting", date: "2026-08-25", time: "10:00 AM" },
  { title: "Site visit — Riverside Villas", type: "site_visit", date: "2026-08-26", time: "2:00 PM" },
  { title: "NEPA permit renewal deadline", type: "deadline", date: "2026-08-29", time: null },
  { title: "Board meeting", type: "meeting", date: "2026-09-02", time: "9:00 AM" },
];

// TODO: Stage 2 — needs a real table (e.g. secretary_events: id,
// company_id, title, event_type, event_date, event_time, location,
// related_project_id) — no existing calendar/scheduling table covers
// company-admin-level events today (project_tasks is construction-task-
// scoped, a different concept). A simple list-style view like this one
// is intentionally not a full calendar widget yet, per the Stage 1 brief.
export default function SchedulingSection() {
  return (
    <Card>
      <CardHeader title="Upcoming" subtitle="Meetings, site visits, and deadlines" />
      <div className="space-y-2">
        {PLACEHOLDER_EVENTS.map((e, i) => (
          <div key={i} className="flex items-center justify-between py-2.5 px-3 rounded-lg border border-slate-200 dark:border-white/[0.06]">
            <div className="flex items-center gap-2.5 min-w-0">
              {TYPE_ICON[e.type]}
              <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">{e.title}</span>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {e.time && <span className="text-[11px] text-slate-500">{e.time}</span>}
              <Badge color="slate">{e.date}</Badge>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
