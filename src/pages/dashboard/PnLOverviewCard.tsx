// src/pages/dashboard/PnLOverviewCard.tsx
import React from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { Card, CardHeader } from "../../components/ui";

const PLACEHOLDER_DATA = [
  { month: "Feb", revenue: 62000, expenses: 48000 },
  { month: "Mar", revenue: 71000, expenses: 55000 },
  { month: "Apr", revenue: 68000, expenses: 51000 },
  { month: "May", revenue: 79000, expenses: 60000 },
  { month: "Jun", revenue: 84000, expenses: 63000 },
  { month: "Jul", revenue: 91000, expenses: 66000 },
];

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

// TODO: Stage 2 — wire to the exact totalRevenue/totalExpenses/netIncome
// calculation FinanceDashboardPage.tsx already computes from
// chart_of_accounts (summing current_balance by type='revenue'/'expense'),
// broken out per month via gl_transactions.transaction_date — reuse that
// pattern rather than a second, separately-derived P&L calculation that
// could disagree with the Finance Dashboard's own figures.
export default function PnLOverviewCard() {
  return (
    <Card>
      <CardHeader title="P&L Overview" subtitle="Revenue vs expenses, last 6 months" />
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={PLACEHOLDER_DATA}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" className="text-slate-200 dark:text-white/10" />
            <XAxis dataKey="month" tick={{ fontSize: 10 }} stroke="currentColor" className="text-slate-400" />
            <YAxis tickFormatter={fmt} tick={{ fontSize: 10 }} stroke="currentColor" className="text-slate-400" />
            <Tooltip formatter={(v) => fmt(Number(v))} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="revenue" name="Revenue" fill="#34d399" radius={[4, 4, 0, 0]} />
            <Bar dataKey="expenses" name="Expenses" fill="#fbbf24" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
