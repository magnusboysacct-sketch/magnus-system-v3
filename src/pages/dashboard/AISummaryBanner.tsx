// src/pages/dashboard/AISummaryBanner.tsx
import React, { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { aiChat } from "../../lib/magnusAI";

const FALLBACK_TEXT =
  "AI summary is unavailable right now — the cards below still show today's real numbers.";

// Session-level cache (persists across remounts/navigation within this
// browser tab, cleared when the tab closes) — "regenerate once per
// dashboard load, not continuously" per the brief. Keyed by company_id so
// switching companies (not that this app supports it today, but just in
// case) doesn't serve a stale summary. Module-level, not React state, so
// it survives this component unmounting/remounting entirely.
const sessionCacheKey = (companyId: string) => `director-dashboard-ai-summary:${companyId}`;

export default function AISummaryBanner() {
  const [summary, setSummary] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Not signed in");
        const { data: profile } = await supabase
          .from("user_profiles").select("company_id").eq("id", user.id).maybeSingle();
        const companyId = profile?.company_id;
        if (!companyId) throw new Error("Couldn't determine company");

        const cacheKey = sessionCacheKey(companyId);
        const cached = sessionStorage.getItem(cacheKey);
        if (cached) {
          if (!alive) return;
          setSummary(cached);
          setLoading(false);
          return;
        }

        // Gather already-aggregated figures the other 8 cards each compute
        // themselves — NOT raw rows. There's no shared state between cards
        // in this dashboard (each resolves its own company_id and queries
        // independently, by design — see the note on CashPositionCard's
        // report about this), so the only way to reuse "already computed"
        // numbers without touching those 8 files is to run the same small,
        // targeted aggregate queries/RPCs they already use, a second time,
        // here. Every query below mirrors an existing card's own query
        // exactly — nothing new is being computed, just re-fetched compactly.
        const todayYear = new Date().getFullYear();
        const monday = (() => {
          const now = new Date();
          const day = now.getDay();
          const diff = day === 0 ? 6 : day - 1;
          const d = new Date(now);
          d.setDate(now.getDate() - diff);
          d.setHours(0, 0, 0, 0);
          return d.toISOString().slice(0, 10);
        })();
        const today = new Date().toISOString().slice(0, 10);

        const [
          cashRes,
          plAccountsRes,
          activeProjectsRes,
          remittanceRes,
          workersRes,
          fieldPaymentsRes,
          ownerAccountsRes,
          agingRes,
          overdueInvoicesRes,
          overdueBillsRes,
        ] = await Promise.all([
          // Cash Position's own filter (type=asset, subtype bank/current_asset)
          supabase.from("v_account_balances").select("current_balance")
            .eq("company_id", companyId).eq("type", "asset").in("subtype", ["bank", "current_asset"]),
          // P&L Overview's own filter
          supabase.from("chart_of_accounts").select("type, current_balance")
            .eq("company_id", companyId).eq("is_active", true).in("type", ["revenue", "expense"]),
          // Project Health's own filter
          supabase.from("projects").select("id").eq("company_id", companyId).eq("status", "active"),
          // Payroll Compliance's own filter, soonest one only
          supabase.from("government_remittances").select("period_month, period_year, due_date, total_due")
            .eq("company_id", companyId).eq("status", "pending").order("due_date", { ascending: true }).limit(1),
          // Workforce Snapshot's own filter
          supabase.from("workers").select("id").eq("company_id", companyId).eq("status", "active"),
          supabase.from("field_payments").select("total_amount").eq("company_id", companyId).gte("work_date", monday),
          // Owner Draws' own account lookup
          supabase.from("chart_of_accounts").select("id, code").eq("company_id", companyId).in("code", ["3440", "3450"]),
          // Receivables & Payables' own RPC
          supabase.rpc("get_ar_ap_aging", { p_company_id: companyId }),
          // Needs Attention's own overdue-invoice count
          supabase.from("client_invoices").select("id", { count: "exact", head: true })
            .eq("company_id", companyId).in("status", ["sent", "partial", "overdue"]).gt("balance_due", 0).lte("due_date", today),
          supabase.from("supplier_invoices").select("id", { count: "exact", head: true })
            .eq("company_id", companyId).gt("balance_due", 0).lte("due_date", today),
        ]);

        const totalLiquidCash = (cashRes.data || []).reduce((s, a: any) => s + (Number(a.current_balance) || 0), 0);

        const plRows = plAccountsRes.data || [];
        const totalRevenue = plRows.filter((a: any) => a.type === "revenue").reduce((s, a: any) => s + (Number(a.current_balance) || 0), 0);
        const totalExpenses = plRows.filter((a: any) => a.type === "expense").reduce((s, a: any) => s + (Number(a.current_balance) || 0), 0);
        const netIncome = totalRevenue - totalExpenses;

        const activeProjectCount = (activeProjectsRes.data || []).length;

        const r = (remittanceRes.data || [])[0];
        const nextRemittance = r ? { dueDate: r.due_date, amount: Number(r.total_due) || 0 } : null;

        const activeWorkers = (workersRes.data || []).length;
        const fieldPaymentsThisWeek = (fieldPaymentsRes.data || []).reduce((s, p: any) => s + (Number(p.total_amount) || 0), 0);

        // Owner draws — the SAME year-scoped 3-query chain
        // OwnerDrawsCard.tsx uses, not the all-time current_balance
        // shortcut this originally had. That shortcut showed a real but
        // different figure (all-time cumulative vs. this-year-only), and
        // with both numbers visible on the same page at once, that read
        // as a contradiction rather than an acceptable approximation —
        // fixed by computing it exactly the same way Card 6 does.
        const ownerAccounts = ownerAccountsRes.data || [];
        let enronDraw = 0, veronDraw = 0;
        if (ownerAccounts.length > 0) {
          const accountIdToCode = new Map(ownerAccounts.map((a: any) => [a.id, a.code]));
          const { data: drawTransactions } = await supabase
            .from("gl_transactions")
            .select("id")
            .eq("company_id", companyId)
            .eq("source_type", "fund_transfer")
            .eq("status", "posted")
            .gte("transaction_date", `${todayYear}-01-01`)
            .lte("transaction_date", `${todayYear}-12-31`);
          const drawTransactionIds = (drawTransactions || []).map((t: any) => t.id);
          if (drawTransactionIds.length > 0) {
            const { data: drawEntries } = await supabase
              .from("gl_entries")
              .select("account_id, debit, credit")
              .in("account_id", Array.from(accountIdToCode.keys()))
              .in("transaction_id", drawTransactionIds);
            for (const e of drawEntries || []) {
              const code = accountIdToCode.get((e as any).account_id);
              // Equity is credit-normal; a draw is a net debit, so
              // debit - credit is the direction a draw actually moves in
              // (same reasoning as OwnerDrawsCard.tsx).
              const net = (Number((e as any).debit) || 0) - (Number((e as any).credit) || 0);
              if (code === "3440") enronDraw += net;
              if (code === "3450") veronDraw += net;
            }
          }
        }

        const agingByKind: Record<string, number> = {};
        for (const row of agingRes.data || []) {
          agingByKind[(row as any).kind] = (agingByKind[(row as any).kind] || 0) + (Number((row as any).amount) || 0);
        }

        const needsAttentionCount =
          (overdueInvoicesRes.count || 0) + (overdueBillsRes.count || 0) + (nextRemittance ? 1 : 0);

        const context = {
          cash_position: { total_liquid_cash: totalLiquidCash },
          profit_and_loss: { total_revenue: totalRevenue, total_expenses: totalExpenses, net_income: netIncome },
          projects: { active_count: activeProjectCount },
          next_remittance: nextRemittance,
          workforce: { active_workers: activeWorkers, field_payments_this_week: fieldPaymentsThisWeek },
          owner_draws_ytd: { enron_williams: enronDraw, veron_williams: veronDraw, year: todayYear },
          receivables_payables: { receivable_total: agingByKind["receivable"] || 0, payable_total: agingByKind["payable"] || 0 },
          needs_attention_count: needsAttentionCount,
          // Explicit, named data gaps — the whole reason this is passed at
          // all rather than just the numbers: several figures above are
          // real but structurally incomplete right now (not wrong, just
          // partial), and the model has no way to know that from the raw
          // numbers alone.
          data_caveats: [
            "profit_and_loss and receivables_payables' revenue-side figures only reflect Expenses and Fund Transfer transactions posted to the general ledger so far — Invoices, Bills, Customer Payments, and Supplier Payments are not yet posted, so revenue and net income are very likely understated, not necessarily a sign of a slow period.",
            "projects.active_count is real, but budget and actual-cost figures for those projects are currently $0 across the board — BOQ items and job-costing data have not been entered for them yet. This is a data gap, not a claim that projects have no budget.",
          ],
        };

        const message =
          "Give a 2-3 sentence, plain-English summary of this construction company's current financial and operational position, written for the company director glancing at their dashboard. " +
          "Use specific real numbers from the data below where you have them. " +
          "Do not state or imply a confident conclusion about anything listed in data_caveats — if you mention one of those areas at all, say plainly that the data is incomplete rather than describing it as good, bad, on-track, or complete.";

        const result = await aiChat(message, context);
        const finalText = result && result.trim() ? result.trim() : FALLBACK_TEXT;

        if (!alive) return;
        setSummary(finalText);
        if (result && result.trim()) {
          try { sessionStorage.setItem(cacheKey, finalText); } catch { /* storage full/unavailable — fine to skip caching */ }
        }
      } catch (e: any) {
        console.error("AISummaryBanner failed to load:", e);
        if (!alive) return;
        setSummary(FALLBACK_TEXT);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  return (
    <div className="relative overflow-hidden rounded-2xl border border-cyan-500/20 bg-gradient-to-br from-cyan-500/10 via-white dark:via-[#0c1018] to-emerald-500/10 p-5">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center flex-shrink-0">
          <Sparkles size={16} className="text-cyan-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[10px] font-bold uppercase tracking-widest text-cyan-600 dark:text-cyan-400 mb-1">
            Magnus AI Summary
          </div>
          {loading ? (
            <div className="h-4 w-3/4 rounded bg-cyan-500/10 animate-pulse" />
          ) : (
            <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">{summary}</p>
          )}
        </div>
      </div>
    </div>
  );
}
