// src/pages/dashboard/NeedsAttentionCard.tsx
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertCircle, Clock, FileWarning, AlertTriangle } from "lucide-react";
import { Card, CardHeader, Btn, Spinner, Empty } from "../../components/ui";
import { supabase } from "../../lib/supabase";

interface AttentionItem {
  id: string;
  icon: React.ReactNode;
  label: string;
  detail: string;
  daysUntilDue: number; // negative = overdue by N days, positive = due in N days
}

const SHOWN_LIMIT = 6;
const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "JMD", maximumFractionDigits: 0 }).format(n);
}
function daysUntil(dateStr: string): number {
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000);
}

export default function NeedsAttentionCard() {
  const nav = useNavigate();
  const [items, setItems] = useState<AttentionItem[] | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Not signed in");
        const { data: profile, error: profErr } = await supabase
          .from("user_profiles").select("company_id").eq("id", user.id).maybeSingle();
        if (profErr) throw profErr;
        if (!profile?.company_id) throw new Error("Couldn't determine company");

        const today = new Date().toISOString().slice(0, 10);
        const all: AttentionItem[] = [];

        // 1. Overdue client invoices — same partition Card 7's aging
        // buckets already use ("not in Not Yet Due" = due_date <= today),
        // same status exclusion (draft/cancelled aren't real receivables).
        const { data: invoices, error: invErr } = await supabase
          .from("client_invoices")
          .select("id, invoice_number, balance_due, due_date")
          .eq("company_id", profile.company_id)
          .in("status", ["sent", "partial", "overdue"])
          .gt("balance_due", 0)
          .lte("due_date", today);
        if (invErr) throw invErr;
        for (const inv of invoices || []) {
          const days = daysUntil(inv.due_date);
          all.push({
            id: `inv-${inv.id}`,
            icon: <FileWarning size={14} className="text-red-400" />,
            label: `Invoice ${inv.invoice_number} overdue ${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"}`,
            detail: fmt(Number(inv.balance_due) || 0),
            daysUntilDue: days,
          });
        }

        // 2. Overdue supplier bills — same pattern, no draft/cancelled
        // status exists on this table so no extra exclusion is needed
        // (matches Card 7's own reasoning). Confirmed by Veron this round
        // there are currently 0 outstanding bills at all — this section
        // is expected to come back empty right now, not fabricated.
        const { data: bills, error: billErr } = await supabase
          .from("supplier_invoices")
          .select("id, invoice_number, balance_due, due_date")
          .eq("company_id", profile.company_id)
          .gt("balance_due", 0)
          .lte("due_date", today);
        if (billErr) throw billErr;
        for (const b of bills || []) {
          const days = daysUntil(b.due_date);
          all.push({
            id: `bill-${b.id}`,
            icon: <FileWarning size={14} className="text-red-400" />,
            label: `Bill ${b.invoice_number} overdue ${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"}`,
            detail: fmt(Number(b.balance_due) || 0),
            daysUntilDue: days,
          });
        }

        // 3. Remittances — same table/status filter as Card 4
        // (PayrollComplianceCard.tsx), same urgency classification,
        // duplicated rather than imported since that card wasn't touched
        // for this one. Only surfaces urgent ones (overdue or due within
        // 14 days) — Card 4 itself still shows the complete pending list;
        // this is only the subset that belongs in an alert feed.
        const { data: remittances, error: remErr } = await supabase
          .from("government_remittances")
          .select("id, period_month, period_year, due_date, total_due")
          .eq("company_id", profile.company_id)
          .eq("status", "pending");
        if (remErr) throw remErr;
        for (const r of remittances || []) {
          const days = daysUntil(r.due_date);
          if (days > 14) continue; // not urgent enough for this feed
          const periodLabel = `${MONTH_NAMES[r.period_month - 1]} ${r.period_year}`;
          all.push({
            id: `rem-${r.id}`,
            icon: <Clock size={14} className={days < 0 ? "text-red-400" : "text-amber-400"} />,
            label: days < 0
              ? `${periodLabel} remittance overdue ${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"}`
              : `${periodLabel} remittance due in ${days} day${days === 1 ? "" : "s"}`,
            detail: fmt(Number(r.total_due) || 0),
            daysUntilDue: days,
          });
        }

        // Note: unmatched bank/credit-card transactions (cash_transactions,
        // behind FinanceTransactionsPage.tsx's "Needs Review" feed) were
        // deliberately left out — Veron confirmed that page shows all
        // zeros right now, no real data to surface. Not queried at all
        // here rather than showing a fabricated empty-state item.

        // Most overdue first, then soonest-upcoming.
        all.sort((a, b) => a.daysUntilDue - b.daysUntilDue);

        if (!alive) return;
        setTotalCount(all.length);
        setItems(all.slice(0, SHOWN_LIMIT));
      } catch (e: any) {
        if (!alive) return;
        console.error("NeedsAttentionCard failed to load:", e);
        setError(e.message || "Couldn't load attention items");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  return (
    <Card>
      <div className="flex items-center justify-between gap-3">
        <CardHeader title="Needs Attention" subtitle="Items requiring review" />
        {totalCount > SHOWN_LIMIT && (
          <Btn variant="ghost" size="xs" onClick={() => nav("/accounts-receivable")}>+{totalCount - SHOWN_LIMIT} more</Btn>
        )}
      </div>

      {loading ? (
        <div className="h-32 flex items-center justify-center">
          <Spinner size={20} />
        </div>
      ) : error ? (
        <div className="h-32 flex flex-col items-center justify-center gap-2 text-center px-4">
          <AlertTriangle size={20} className="text-amber-400" />
          <div className="text-xs text-slate-500">Couldn't load attention items right now.</div>
        </div>
      ) : !items || items.length === 0 ? (
        <div className="h-32 flex items-center justify-center">
          <Empty icon={<AlertCircle size={18} />} title="Nothing needs your attention right now" />
        </div>
      ) : (
        <div className="space-y-2">
          {items.map(item => (
            <div key={item.id} className="flex items-start gap-2.5 py-2 px-3 rounded-lg border border-slate-200 dark:border-white/[0.06]">
              <div className="mt-0.5 flex-shrink-0">{item.icon}</div>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">{item.label}</div>
                <div className="text-[11px] text-slate-500 truncate">{item.detail}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
