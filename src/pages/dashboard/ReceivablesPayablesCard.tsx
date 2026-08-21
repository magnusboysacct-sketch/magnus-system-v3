// src/pages/dashboard/ReceivablesPayablesCard.tsx
import React from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Card, CardHeader } from "../../components/ui";

const AR_AGING = [
  { bucket: "0-30",  amount: 34000 },
  { bucket: "31-60", amount: 12500 },
  { bucket: "61-90", amount: 6200 },
  { bucket: "90+",   amount: 4100 },
];
const AP_AGING = [
  { bucket: "0-30",  amount: 21000 },
  { bucket: "31-60", amount: 9800 },
  { bucket: "61-90", amount: 3100 },
  { bucket: "90+",   amount: 1200 },
];

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

// TODO: Stage 2 — wire Receivables to client_invoices (balance_due,
// bucketed by days past due_date) and Payables to supplier_invoices
// (balance_due, bucketed by days past due_date) — two independent queries
// against the two real AR/AP source tables, same aging-bucket shape shown
// here with placeholder data.
export default function ReceivablesPayablesCard() {
  return (
    <Card>
      <CardHeader title="Receivables & Payables" subtitle="Aging, by days outstanding" />
      <div className="grid grid-cols-2 gap-4">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-widest text-emerald-600 dark:text-emerald-400 mb-2">
            Receivables
          </div>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={AR_AGING}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" className="text-slate-200 dark:text-white/10" />
                <XAxis dataKey="bucket" tick={{ fontSize: 10 }} stroke="currentColor" className="text-slate-400" />
                <YAxis tickFormatter={fmt} tick={{ fontSize: 9 }} stroke="currentColor" className="text-slate-400" width={50} />
                <Tooltip formatter={(v) => fmt(Number(v))} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <Bar dataKey="amount" fill="#34d399" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div>
          <div className="text-[10px] font-bold uppercase tracking-widest text-red-600 dark:text-red-400 mb-2">
            Payables
          </div>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={AP_AGING}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" className="text-slate-200 dark:text-white/10" />
                <XAxis dataKey="bucket" tick={{ fontSize: 10 }} stroke="currentColor" className="text-slate-400" />
                <YAxis tickFormatter={fmt} tick={{ fontSize: 9 }} stroke="currentColor" className="text-slate-400" width={50} />
                <Tooltip formatter={(v) => fmt(Number(v))} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <Bar dataKey="amount" fill="#f87171" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </Card>
  );
}
