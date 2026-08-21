// src/pages/dashboard/ProjectHealthCard.tsx
import React from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { Card, CardHeader } from "../../components/ui";

const PLACEHOLDER_DATA = [
  { project: "Riverside Villas",     budget: 420000, actual: 470000 },
  { project: "Harbor View Offices",  budget: 610000, actual: 585000 },
  { project: "Palisadoes Extension", budget: 280000, actual: 265000 },
  { project: "Montego Bay Retail",   budget: 195000, actual: 140000 },
];

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

// TODO: Stage 2 — wire to v_project_finance_summary (already used in
// DashboardPage.tsx for budget_total) joined against each active project's
// actual cost-to-date, filtered to active projects only. Same view, not a
// second independently-computed budget figure.
export default function ProjectHealthCard() {
  return (
    <Card>
      <CardHeader title="Project Health" subtitle="Budget vs actual, active projects" />
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={PLACEHOLDER_DATA}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" className="text-slate-200 dark:text-white/10" />
            <XAxis dataKey="project" tick={{ fontSize: 10 }} stroke="currentColor" className="text-slate-400" interval={0} angle={-15} textAnchor="end" height={60} />
            <YAxis tickFormatter={fmt} tick={{ fontSize: 10 }} stroke="currentColor" className="text-slate-400" />
            <Tooltip formatter={(v) => fmt(Number(v))} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="budget" name="Budget" fill="#60a5fa" radius={[4, 4, 0, 0]} />
            <Bar dataKey="actual" name="Actual" fill="#f472b6" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
