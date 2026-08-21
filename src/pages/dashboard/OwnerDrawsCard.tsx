// src/pages/dashboard/OwnerDrawsCard.tsx
import React from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Card, CardHeader } from "../../components/ui";

const PLACEHOLDER_DATA = [
  { owner: "Enron Williams", ytd: 42000 },
  { owner: "Veron Williams", ytd: 48000 },
];

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

// TODO: Stage 2 — wire to gl_transactions/gl_entries filtered by
// source_type = 'fund_transfer', debit account_id matching the "Enron
// Williams" (3440) / "Veron Williams" (3450) equity accounts, summed
// year-to-date by transaction_date — same owner-draw-vs-internal-transfer
// routing logic built for the Transfer Fund import entity (owner draws
// only, never ordinary internal transfers between operating accounts).
export default function OwnerDrawsCard() {
  return (
    <Card>
      <CardHeader title="Owner Draws" subtitle="Year to date" />
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={PLACEHOLDER_DATA} layout="vertical" margin={{ left: 8, right: 16 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="currentColor" className="text-slate-200 dark:text-white/10" />
            <XAxis type="number" tickFormatter={fmt} tick={{ fontSize: 10 }} stroke="currentColor" className="text-slate-400" />
            <YAxis type="category" dataKey="owner" width={100} tick={{ fontSize: 10 }} stroke="currentColor" className="text-slate-400" />
            <Tooltip formatter={(v) => fmt(Number(v))} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
            <Bar dataKey="ytd" fill="#a78bfa" radius={[0, 6, 6, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
