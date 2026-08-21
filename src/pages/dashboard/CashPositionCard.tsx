// src/pages/dashboard/CashPositionCard.tsx
import React from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Card, CardHeader } from "../../components/ui";

const PLACEHOLDER_DATA = [
  { name: "Current Account JMD", balance: 84200 },
  { name: "Savings Account JMD", balance: 52000 },
  { name: "Undeposited Funds",   balance: 18400 },
  { name: "Petty Cash",          balance: 3600 },
  { name: "Enron Petty Cash",    balance: 2100 },
  { name: "Veron Petty Cash",    balance: 1900 },
];

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

// TODO: Stage 2 — wire to the v_account_balances view (same one
// FinanceDashboardPage.tsx already queries for its own per-type totals),
// filtered to the real cash/bank-fund accounts by subtype — do not derive
// this a second, independently-computed way that could disagree with the
// Finance Dashboard's own numbers.
export default function CashPositionCard() {
  return (
    <Card>
      <CardHeader title="Cash Position" subtitle="Balances across operating accounts" />
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={PLACEHOLDER_DATA} layout="vertical" margin={{ left: 8, right: 16 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="currentColor" className="text-slate-200 dark:text-white/10" />
            <XAxis type="number" tickFormatter={fmt} tick={{ fontSize: 10 }} stroke="currentColor" className="text-slate-400" />
            <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 10 }} stroke="currentColor" className="text-slate-400" />
            <Tooltip formatter={(v) => fmt(Number(v))} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
            <Bar dataKey="balance" fill="#22d3ee" radius={[0, 6, 6, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
