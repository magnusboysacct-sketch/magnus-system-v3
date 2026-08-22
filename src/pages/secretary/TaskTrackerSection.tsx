// src/pages/secretary/TaskTrackerSection.tsx
import React from "react";
import { CheckSquare, Square } from "lucide-react";
import { Card, CardHeader, Badge } from "../../components/ui";

const PLACEHOLDER_TASKS = [
  { title: "Renew general liability insurance", done: false, priority: "high" as const },
  { title: "File Q2 GCT return", done: false, priority: "high" as const },
  { title: "Order office supplies", done: true, priority: "low" as const },
  { title: "Schedule annual fire drill", done: false, priority: "medium" as const },
];

const PRIORITY_COLOR: Record<string, "red" | "amber" | "slate"> = { high: "red", medium: "amber", low: "slate" };

// TODO: Stage 2 — needs a real table (e.g. secretary_tasks: id,
// company_id, title, done, priority, due_date, assigned_to) —
// deliberately distinct from project_tasks, which is construction-task-
// scoped (per-project, contractor-facing), not company-admin-scoped.
export default function TaskTrackerSection() {
  return (
    <Card>
      <CardHeader title="Admin To-Do" subtitle="Company-admin tasks — separate from project tasks" />
      <div className="space-y-2">
        {PLACEHOLDER_TASKS.map((t, i) => (
          <div key={i} className="flex items-center justify-between py-2.5 px-3 rounded-lg border border-slate-200 dark:border-white/[0.06]">
            <div className="flex items-center gap-2.5 min-w-0">
              {t.done ? <CheckSquare size={15} className="text-emerald-400 flex-shrink-0" /> : <Square size={15} className="text-slate-400 flex-shrink-0" />}
              <span className={`text-xs font-semibold truncate ${t.done ? "text-slate-400 line-through" : "text-slate-800 dark:text-slate-200"}`}>{t.title}</span>
            </div>
            {!t.done && <Badge color={PRIORITY_COLOR[t.priority]}>{t.priority}</Badge>}
          </div>
        ))}
      </div>
    </Card>
  );
}
