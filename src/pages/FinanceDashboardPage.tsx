// src/pages/FinanceDashboardPage.tsx — Full Finance Department Hub
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import {
  PageHeader, StatCard, Card, CardHeader, Badge, Btn,
  Table, Th, Tr, Td, Empty, Tabs, Progress, Alert, cn
} from "../components/ui";
import {
  DollarSign, TrendingUp, TrendingDown, BookOpen,
  ArrowRight, Receipt, FileText, CreditCard, Wallet,
  PieChart, BarChart3, RefreshCw, Building2, Package,
  CheckCircle2, AlertCircle, Clock, Plus, ArrowUpRight,
  ArrowDownRight, Layers, Settings, Download, Printer
} from "lucide-react";
import { useCompanySettings } from "../hooks/useCompanySettings";
import { openPrintWindow } from "../lib/printUtils";

type Tab = "overview" | "accounts" | "ledger" | "reports";

// ─── Date range filter — same proven pattern as ReportsPage.tsx (not
// imported from there since it doesn't export these; ReportsPage.tsx
// itself is untouched, this is a deliberate copy of its shape). Only
// affects Reports' P&L and the General Ledger tab — see the header notes
// on periodPnL/loadLedgerTransactions below for why Overview and Balance
// Sheet are deliberately excluded. ─────────────────────────────────────

type DateRange = "week" | "month" | "quarter" | "year" | "all" | "custom";

const DATE_RANGES: { key: DateRange; label: string }[] = [
  { key: "week", label: "This Week" },
  { key: "month", label: "This Month" },
  { key: "quarter", label: "This Quarter" },
  { key: "year", label: "This Year" },
  { key: "all", label: "All Time" },
  { key: "custom", label: "Custom Range" },
];

// Presets only — "custom" is handled separately by customRangeBounds()
// below, since a preset is always "cutoff through now" (a single lower
// bound), while a custom range needs both an arbitrary start AND end.
function getCutoff(range: DateRange): string | null {
  const now = new Date();
  if (range === "all" || range === "custom") return null;
  if (range === "week") { now.setDate(now.getDate() - 7); }
  else if (range === "month") { now.setMonth(now.getMonth() - 1); }
  else if (range === "quarter") { now.setMonth(now.getMonth() - 3); }
  else if (range === "year") { now.setFullYear(now.getFullYear() - 1); }
  return now.toISOString();
}

// Custom range bounds — local-midnight-safe, same discipline as every
// date field built this session: new Date("YYYY-MM-DD") alone parses as
// UTC midnight and can shift a day depending on the browser's timezone,
// so the time component is set explicitly rather than left implicit.
// Empty start/end means "no bound on that side".
function customRangeBounds(start: string, end: string): { start: string | null; end: string | null } {
  return {
    start: start ? new Date(`${start}T00:00:00`).toISOString() : null,
    end: end ? new Date(`${end}T23:59:59.999`).toISOString() : null,
  };
}

// Resolves whichever of the preset/custom shapes is active into one
// consistent {start, end} pair — shared by both loadPeriodPnL and
// loadLedgerTransactions below so they can't drift out of sync with each
// other on how "custom" is interpreted.
function resolveDateWindow(range: DateRange, customStart: string, customEnd: string): { start: string | null; end: string | null } {
  return range === "custom" ? customRangeBounds(customStart, customEnd) : { start: getCutoff(range), end: null };
}

// Real company currency is JMD throughout — confirmed by every posting
// script and Chart of Accounts entry this session. Same wrong-default bug
// found in 19 other files across the app (see this round's own report) —
// only these two spots fixed here, deliberately not touched more broadly.
function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "JMD", maximumFractionDigits: 2 }).format(n);
}
function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const ACCOUNT_TYPE_COLOR: Record<string, any> = {
  asset: "cyan", liability: "red", equity: "violet",
  revenue: "green", expense: "amber"
};

const ACCOUNT_TYPE_BG: Record<string, string> = {
  asset: "bg-cyan-500/10 border-cyan-500/20 text-cyan-400",
  liability: "bg-red-500/10 border-red-500/20 text-red-400",
  equity: "bg-violet-500/10 border-violet-500/20 text-violet-400",
  revenue: "bg-emerald-500/10 border-emerald-500/20 text-emerald-400",
  expense: "bg-amber-500/10 border-amber-500/20 text-amber-400",
};

// ─── Export Reports — CSV mirrors ExpensesPage.tsx's own exportCSV()
// (Blob + object URL + synthetic <a download> click), PDF reuses
// printUtils.ts's openPrintWindow() (the same mechanism ContractsPage.tsx
// and Secretary Workspace's Correspondence letters already use). Both
// carry company name/branding + a generation timestamp, since these are
// for audit/review per the section's own subtitle. ──────────────────────

interface ReportTable {
  title: string;
  columns: string[];
  rows: (string | number)[][];
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function generatedAtLabel(): string {
  return new Date().toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
}

// Unlike ExpensesPage.tsx's naive exportCSV() (plain .join(",") with no
// escaping), account/report row values here are quoted when they contain a
// comma/quote/newline — a strict superset that changes nothing for any
// value that doesn't need it, and avoids genuinely corrupting a CSV cell
// that does (an account or category name with a comma in it).
function csvCell(v: string | number): string {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function downloadReportCSV(companyName: string, table: ReportTable) {
  const lines = [
    csvCell(companyName),
    csvCell(table.title),
    csvCell(`Generated ${generatedAtLabel()}`),
    "",
    table.columns.map(csvCell).join(","),
    ...table.rows.map(r => r.map(csvCell).join(",")),
  ];
  const csv = lines.join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  a.download = `${table.title.toLowerCase().replace(/[^a-z0-9]+/g, "_")}_${Date.now()}.csv`;
  a.click();
}

function downloadReportPDF(companyName: string, logoUrl: string | null, table: ReportTable) {
  const logoImg = logoUrl
    ? `<img src="${logoUrl}" alt="logo" style="width:64px;height:64px;border-radius:10px;object-fit:cover;display:block;margin:0 auto 14px"/>`
    : "";
  const headHtml = table.columns
    .map((c, i) => `<th style="padding:8px 10px;text-align:${i === table.columns.length - 1 ? "right" : "left"};font-size:11px;text-transform:uppercase;letter-spacing:0.5px;border-bottom:2px solid #1a1a1a">${escapeHtml(c)}</th>`)
    .join("");
  const rowsHtml = table.rows
    .map(r => `<tr>${r.map((c, i) => `<td style="padding:7px 10px;border-bottom:1px solid #e5e7eb;font-size:12px;${i === r.length - 1 ? "text-align:right" : ""}">${escapeHtml(String(c))}</td>`).join("")}</tr>`)
    .join("");
  const html = `
    <div style="max-width:760px;margin:0 auto;padding:56px 48px">
      <div style="text-align:center;margin-bottom:28px">
        ${logoImg}
        <div style="font-weight:700;font-size:17px">${escapeHtml(companyName)}</div>
        <div style="font-size:13px;color:#555;margin-top:4px">${escapeHtml(table.title)}</div>
        <div style="font-size:10px;color:#999;margin-top:2px">Generated ${escapeHtml(generatedAtLabel())}</div>
      </div>
      <table style="width:100%;border-collapse:collapse">
        <thead><tr>${headHtml}</tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </div>`;
  openPrintWindow(html, { title: table.title });
}

export default function FinanceDashboardPage() {
  const nav = useNavigate();
  const [tab, setTab] = useState<Tab>("overview");
  const [loading, setLoading] = useState(true);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [balances, setBalances] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Summary stats — Overview + Balance Sheet only, always all-time
  // (chart_of_accounts.current_balance is a running cumulative total, not
  // a time-series — there's no way to derive "as of a past date" from it,
  // and a trailing-window Balance Sheet isn't a real accounting concept
  // anyway, see the date-range filter's own header comment).
  const [stats, setStats] = useState({
    totalAssets: 0, totalLiabilities: 0, totalEquity: 0,
    totalRevenue: 0, totalExpenses: 0, netIncome: 0,
  });

  // Default "all" — a Balance Sheet is normally a point-in-time snapshot,
  // not period-bound the way P&L naturally is, so starting narrowed would
  // be a strange default for a page whose Balance Sheet section can't be
  // narrowed at all. Only actually used by Reports' P&L and the General
  // Ledger tab.
  const [dateRange, setDateRange] = useState<DateRange>("all");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");

  // Reports tab's genuinely period-filtered P&L — separate from `stats`
  // above on purpose. null while loading/unavailable, in which case the
  // P&L card falls back to stats' all-time totals rather than showing
  // nothing.
  const [periodPnL, setPeriodPnL] = useState<{
    revenue: number; expenses: number;
    revenueAccounts: { id: string; name: string; total: number }[];
    expenseAccounts: { id: string; name: string; total: number }[];
  } | null>(null);

  // General Ledger tab's own transaction list — deliberately separate
  // from `transactions` above, which Overview's "Recent Transactions"
  // preview also reads and must stay unfiltered/most-recent regardless of
  // this page's date range control.
  const [ledgerTransactions, setLedgerTransactions] = useState<any[]>([]);

  // Export Reports — company branding for CSV/PDF exports, same source
  // Correspondence letters already use. exportingKey disables the
  // clicked report's buttons only, not the whole card, while its export
  // (Cash Flow's especially, which fetches live) is in flight.
  const { settings: companySettings } = useCompanySettings();
  const [exportingKey, setExportingKey] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      supabase.from("user_profiles").select("company_id").eq("id", user.id).maybeSingle()
        .then(({ data }) => { if (data?.company_id) setCompanyId(data.company_id); });
    });
  }, []);

  useEffect(() => { if (companyId) loadAll(); }, [companyId]);

  // Re-run both date-filtered loads whenever the range changes. Both are
  // cheap enough to just always run rather than gating on which tab is
  // active — avoids the extra complexity of lazy per-tab fetching for a
  // page this size.
  useEffect(() => {
    if (!companyId) return;
    // Skip until both custom fields are actually filled in, rather than
    // re-querying on every keystroke of a half-entered custom range (a
    // start with no end yet would otherwise fire a query for "everything
    // from that date onward", a real but premature/wasteful fetch).
    if (dateRange === "custom" && (!customStart || !customEnd)) return;
    loadPeriodPnL(dateRange, customStart, customEnd);
    loadLedgerTransactions(dateRange, customStart, customEnd);
  }, [companyId, dateRange, customStart, customEnd]);

  // Genuinely period-bound revenue/expenses, unlike `stats` above — reads
  // gl_entries joined through gl_transactions (for transaction_date/
  // status) and chart_of_accounts (for type), filtered server-side via
  // PostgREST's embedded-resource filtering (the !inner + dotted-column
  // syntax below). This is a real, standard PostgREST feature, but it's
  // also a genuinely more complex query shape than anything else in this
  // file — flagged since it hasn't been exercised live from here before;
  // if it ever errors, the fallback is a two-step fetch (transaction ids
  // filtered by date, then entries by transaction_id IN (...)) instead.
  async function loadPeriodPnL(range: DateRange, customStart: string, customEnd: string) {
    if (!companyId) return;
    const { start, end } = resolveDateWindow(range, customStart, customEnd);
    try {
      let q = supabase
        .from("gl_entries")
        .select("debit, credit, account_id, chart_of_accounts!inner(id, name, type), gl_transactions!inner(transaction_date, status, company_id)")
        .eq("gl_transactions.company_id", companyId)
        .eq("gl_transactions.status", "posted")
        .in("chart_of_accounts.type", ["revenue", "expense"]);
      if (start) q = q.gte("gl_transactions.transaction_date", start);
      if (end) q = q.lte("gl_transactions.transaction_date", end);
      const { data, error } = await q;
      if (error) throw error;

      const revenueByAccount = new Map<string, { name: string; total: number }>();
      const expenseByAccount = new Map<string, { name: string; total: number }>();
      let revenue = 0, expenses = 0;

      for (const row of (data as any[]) || []) {
        const acct = row.chart_of_accounts;
        if (!acct) continue;
        const debit = Number(row.debit) || 0;
        const credit = Number(row.credit) || 0;
        if (acct.type === "revenue") {
          // Revenue is credit-normal.
          const net = credit - debit;
          revenue += net;
          const cur = revenueByAccount.get(acct.id) || { name: acct.name, total: 0 };
          cur.total += net;
          revenueByAccount.set(acct.id, cur);
        } else if (acct.type === "expense") {
          // Expense is debit-normal.
          const net = debit - credit;
          expenses += net;
          const cur = expenseByAccount.get(acct.id) || { name: acct.name, total: 0 };
          cur.total += net;
          expenseByAccount.set(acct.id, cur);
        }
      }

      setPeriodPnL({
        revenue, expenses,
        revenueAccounts: Array.from(revenueByAccount, ([id, v]) => ({ id, ...v })),
        expenseAccounts: Array.from(expenseByAccount, ([id, v]) => ({ id, ...v })),
      });
    } catch (e: any) {
      console.error("loadPeriodPnL failed:", e);
      setPeriodPnL(null);
    }
  }

  // General Ledger tab's own list, filtered server-side by the same
  // cutoff — the original loadAll() fetch is hard-capped at .limit(20)
  // (kept as-is for Overview's "Recent Transactions" preview, which
  // should only ever show a handful of the latest activity regardless of
  // this page's date range). Re-querying here instead of filtering that
  // already-capped set client-side matters now more than it used to —
  // this session posted hundreds of real transactions (313 field
  // payments alone), so the old top-20 slice would silently show far
  // fewer results than a real "This Year" filter should. Same
  // PostgREST-1000-row-cap-safe pagination loop as every other page this
  // session that fetches a potentially large table.
  async function loadLedgerTransactions(range: DateRange, customStart: string, customEnd: string) {
    if (!companyId) return;
    const { start, end } = resolveDateWindow(range, customStart, customEnd);
    try {
      const PAGE = 1000;
      let all: any[] = [];
      let from = 0;
      for (let guard = 0; guard < 200; guard++) {
        let q = supabase
          .from("gl_transactions")
          .select("id, transaction_number, transaction_date, description, total_amount, status, source_type, currency")
          .eq("company_id", companyId)
          .order("transaction_date", { ascending: false })
          .range(from, from + PAGE - 1);
        if (start) q = q.gte("transaction_date", start);
        if (end) q = q.lte("transaction_date", end);
        const { data: page, error } = await q;
        if (error) throw error;
        all = all.concat(page || []);
        if (!page || page.length < PAGE) break;
        from += PAGE;
      }
      setLedgerTransactions(all);
    } catch (e: any) {
      console.error("loadLedgerTransactions failed:", e);
    }
  }

  async function loadAll() {
    setLoading(true); setError(null);
    try {
      const [accRes, txRes, balRes] = await Promise.all([
        // Chart of accounts
        supabase.from("chart_of_accounts")
          .select("id, code, name, type, subtype, is_active, current_balance, level, parent_id, is_project_linkable")
          .eq("company_id", companyId!)
          .eq("is_active", true)
          .order("code", { ascending: true }),
        // Recent GL transactions
        supabase.from("gl_transactions")
          .select("id, transaction_number, transaction_date, description, total_amount, status, source_type, currency")
          .eq("company_id", companyId!)
          .order("transaction_date", { ascending: false })
          .limit(20),
        // Account balances
        supabase.from("v_account_balances")
          .select("*")
          .eq("company_id", companyId!)
          .order("code", { ascending: true }),
      ]);

      const accs = accRes.data || [];
      const txs = txRes.data || [];
      const bals = balRes.data || [];

      setAccounts(accs);
      setTransactions(txs);
      setBalances(bals);

      // Calculate summary from account balances
      const totalAssets = accs.filter(a => a.type === "asset").reduce((s: number, a: any) => s + (a.current_balance || 0), 0);
      const totalLiabilities = accs.filter(a => a.type === "liability").reduce((s: number, a: any) => s + (a.current_balance || 0), 0);
      const totalEquity = accs.filter(a => a.type === "equity").reduce((s: number, a: any) => s + (a.current_balance || 0), 0);
      const totalRevenue = accs.filter(a => a.type === "revenue").reduce((s: number, a: any) => s + (a.current_balance || 0), 0);
      const totalExpenses = accs.filter(a => a.type === "expense").reduce((s: number, a: any) => s + (a.current_balance || 0), 0);

      setStats({
        totalAssets, totalLiabilities, totalEquity,
        totalRevenue, totalExpenses,
        netIncome: totalRevenue - totalExpenses,
      });
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }

  // Group accounts by type
  const byType = accounts.reduce((acc: Record<string, any[]>, a) => {
    if (!acc[a.type]) acc[a.type] = [];
    acc[a.type].push(a);
    return acc;
  }, {});

  // The accounting equation is Assets = Liabilities + Equity + Net Income
  // (revenue - expenses), not just Liabilities + Equity — that's only
  // true once closing entries have moved the period's net income into
  // retained earnings, which this app never does. Without folding net
  // income in, the equation compares against an incomplete equity side
  // and reports "out of balance" even when the ledger is genuinely
  // correct. stats.totalEquity itself is left as-is (the real sum of
  // equity-type account balances) — this is a separate, derived total
  // used only for the equation/balance check, so "Total Equity" stat
  // cards elsewhere keep meaning what they already mean.
  const totalEquityAndEarnings = stats.totalEquity + stats.netIncome;

  // Reports tab's P&L display values — periodPnL once loaded (genuinely
  // filtered by dateRange), falling back to stats' all-time totals only
  // while periodPnL is still null (initial load / a failed query), so the
  // card never shows a blank flash. Does NOT affect the Balance Sheet
  // card or the "Balanced" equation above, which both stay on `stats`
  // unconditionally, by design.
  const pnlRevenue = periodPnL?.revenue ?? stats.totalRevenue;
  const pnlExpenses = periodPnL?.expenses ?? stats.totalExpenses;
  const pnlNetIncome = pnlRevenue - pnlExpenses;
  const pnlRevenueAccounts = periodPnL?.revenueAccounts ?? (byType["revenue"] || []).map((a: any) => ({ id: a.id, name: a.name, total: a.current_balance || 0 }));
  const pnlExpenseAccounts = periodPnL?.expenseAccounts ?? (byType["expense"] || []).map((a: any) => ({ id: a.id, name: a.name, total: a.current_balance || 0 }));

  // ─── Export Reports — table builders ───────────────────────────────
  // Trial Balance & Balance Sheet: point-in-time snapshots straight from
  // `accounts`/`stats`/`byType`, the same all-time data the Accounts tab
  // and the Reports tab's own Balance Sheet card already show — not a
  // separate re-fetch. Cash Flow's account list also reads straight from
  // `accounts` (already loaded, includes `subtype`), but its movement
  // figures need a fresh, date-scoped gl_entries query, since nothing on
  // screen already shows this.

  function buildTrialBalanceTable(): ReportTable {
    const rows = accounts
      .slice()
      .sort((a, b) => String(a.code).localeCompare(String(b.code)))
      .map(a => [a.code, a.name, a.type, fmt(a.current_balance || 0)]);
    return { title: "Trial Balance", columns: ["Code", "Name", "Type", "Balance"], rows };
  }

  // Exports exactly what's currently on the P&L Summary card — same
  // pnlRevenue/pnlExpenses/pnlRevenueAccounts/pnlExpenseAccounts the card
  // itself renders, so the export can never disagree with the screen.
  function buildPnLTable(): ReportTable {
    const periodLabel = dateRange === "custom"
      ? `${customStart || "…"} to ${customEnd || "…"}`
      : DATE_RANGES.find(r => r.key === dateRange)?.label || dateRange;
    const rows: (string | number)[][] = [];
    rows.push(["Revenue", "", ""]);
    for (const a of pnlRevenueAccounts) rows.push([a.name, "Revenue", fmt(a.total)]);
    rows.push(["Total Revenue", "", fmt(pnlRevenue)]);
    rows.push(["Expenses", "", ""]);
    for (const a of pnlExpenseAccounts) rows.push([a.name, "Expense", fmt(a.total)]);
    rows.push(["Total Expenses", "", fmt(pnlExpenses)]);
    rows.push([pnlNetIncome >= 0 ? "Net Income" : "Net Loss", "", fmt(Math.abs(pnlNetIncome))]);
    return { title: `P&L Statement — ${periodLabel}`, columns: ["Account", "Type", "Amount"], rows };
  }

  // Always current, unaffected by dateRange — same reasoning as the
  // Reports tab's own Balance Sheet card. Account-level detail included
  // (not just the 3 headline totals) so the export is actually useful for
  // review, matching Trial Balance's level of detail.
  function buildBalanceSheetTable(): ReportTable {
    const rows: (string | number)[][] = [];
    rows.push(["Assets", "", ""]);
    for (const a of (byType["asset"] || [])) rows.push([a.name, "Asset", fmt(a.current_balance || 0)]);
    rows.push(["Total Assets", "", fmt(stats.totalAssets)]);
    rows.push(["Liabilities", "", ""]);
    for (const a of (byType["liability"] || [])) rows.push([a.name, "Liability", fmt(a.current_balance || 0)]);
    rows.push(["Total Liabilities", "", fmt(stats.totalLiabilities)]);
    rows.push(["Equity", "", ""]);
    for (const a of (byType["equity"] || [])) rows.push([a.name, "Equity", fmt(a.current_balance || 0)]);
    rows.push(["Retained Earnings to Date", "", fmt(stats.netIncome)]);
    rows.push(["Total Liabilities + Equity", "", fmt(stats.totalLiabilities + totalEquityAndEarnings)]);
    return { title: `Balance Sheet — as of ${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`, columns: ["Account", "Type", "Amount"], rows };
  }

  // Not CashFlowPage.tsx's data — that page is built on a separate
  // bank_accounts/bank-transaction system (confirmed by reading it
  // directly), unrelated to the GL this session's posting scripts wrote
  // to. Using it here would produce an incomplete "Cash Flow" report,
  // since virtually all real cash movement this session went through GL
  // posting, not bank_accounts inserts. Instead: a genuine GL-derived net
  // cash movement summary, scoped to the same dateRange as the P&L card
  // above (consistent with the other 3 reports, all GL-derived) — sums
  // debit-credit on every "cash" account (type=asset, subtype in
  // bank/current_asset — CashPositionCard.tsx's own established
  // classification) from posted gl_entries in the window. This is
  // deliberately labeled "Net Cash Movement by Account" rather than a
  // formal GAAP Statement of Cash Flows — it doesn't split
  // operating/investing/financing, which would need a materially bigger
  // classification effort this session hasn't built.
  async function buildCashFlowTable(): Promise<ReportTable> {
    const periodLabel = dateRange === "custom"
      ? `${customStart || "…"} to ${customEnd || "…"}`
      : DATE_RANGES.find(r => r.key === dateRange)?.label || dateRange;
    const title = `Cash Flow — Net Movement by Account (${periodLabel})`;
    if (!companyId) return { title, columns: ["Account", "Net Movement"], rows: [] };

    const cashAccountIds = accounts
      .filter(a => a.type === "asset" && ["bank", "current_asset"].includes(a.subtype))
      .map(a => a.id);
    if (cashAccountIds.length === 0) return { title, columns: ["Account", "Net Movement"], rows: [] };

    const { start, end } = resolveDateWindow(dateRange, customStart, customEnd);
    let q = supabase
      .from("gl_entries")
      .select("debit, credit, account_id, chart_of_accounts!inner(id, name), gl_transactions!inner(transaction_date, status, company_id)")
      .eq("gl_transactions.company_id", companyId)
      .eq("gl_transactions.status", "posted")
      .in("account_id", cashAccountIds);
    if (start) q = q.gte("gl_transactions.transaction_date", start);
    if (end) q = q.lte("gl_transactions.transaction_date", end);
    const { data, error } = await q;
    if (error) { console.error("buildCashFlowTable failed:", error); return { title, columns: ["Account", "Net Movement"], rows: [] }; }

    const byAccount = new Map<string, { name: string; net: number }>();
    let total = 0;
    for (const row of (data as any[]) || []) {
      const acct = row.chart_of_accounts;
      if (!acct) continue;
      // Cash is an asset — debit-normal, so net inflow is debit - credit.
      const net = (Number(row.debit) || 0) - (Number(row.credit) || 0);
      total += net;
      const cur = byAccount.get(acct.id) || { name: acct.name, net: 0 };
      cur.net += net;
      byAccount.set(acct.id, cur);
    }
    const rows: (string | number)[][] = Array.from(byAccount.values()).map(a => [a.name, fmt(a.net)]);
    rows.push(["Net Cash Movement (Period)", fmt(total)]);
    return { title, columns: ["Account", "Net Movement"], rows };
  }

  async function handleExport(reportKey: string, format: "csv" | "pdf") {
    setExportingKey(reportKey);
    try {
      const table = reportKey === "trial_balance" ? buildTrialBalanceTable()
        : reportKey === "pnl" ? buildPnLTable()
        : reportKey === "balance_sheet" ? buildBalanceSheetTable()
        : await buildCashFlowTable();
      const companyName = companySettings?.company_name || "Magnus Boys Construction";
      if (format === "csv") downloadReportCSV(companyName, table);
      else downloadReportPDF(companyName, companySettings?.logo_url ?? null, table);
    } catch (e: any) {
      console.error("Export failed:", e);
      setError("Export failed: " + (e.message || "unknown error"));
    } finally {
      setExportingKey(null);
    }
  }

  const EXPORT_REPORTS: { key: string; label: string; icon: React.ReactNode }[] = [
    { key: "trial_balance", label: "Trial Balance", icon: <BarChart3 size={14} /> },
    { key: "pnl", label: "P&L Statement", icon: <TrendingUp size={14} /> },
    { key: "balance_sheet", label: "Balance Sheet", icon: <Layers size={14} /> },
    { key: "cash_flow", label: "Cash Flow", icon: <DollarSign size={14} /> },
  ];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#080b10]">
      <PageHeader
        title="Finance Department"
        subtitle="General ledger, accounts, and financial reports"
        actions={
          <>
            <Btn variant="ghost" size="sm"
              icon={<RefreshCw size={13} className={loading ? "animate-spin" : ""}/>}
              onClick={loadAll}/>
            <Btn variant="secondary" size="sm" icon={<BookOpen size={13}/>}
              onClick={() => setTab("accounts")}>
              Chart of Accounts
            </Btn>
            <Btn variant="primary" size="sm" icon={<Plus size={13}/>}
              onClick={() => nav("/finance/journal-entry")}>New Entry
            </Btn>
          </>
        }
      />

      <Tabs
        tabs={[
          { key: "overview" as Tab,  label: "Overview" },
          { key: "accounts" as Tab,  label: "Chart of Accounts", count: accounts.length },
          { key: "ledger" as Tab,    label: "General Ledger",    count: ledgerTransactions.length },
          { key: "reports" as Tab,   label: "Reports" },
        ]}
        active={tab}
        onChange={setTab}
      />

      <div className="p-6 space-y-5">
        {error && <Alert type="error" onClose={() => setError(null)}>{error}</Alert>}

        {/* ── Overview Tab ── */}
        {tab === "overview" && (
          <>
            {/* Trial Balance Summary */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <StatCard label="Total Assets"      value={fmt(stats.totalAssets)}      color="text-cyan-300"    icon={<TrendingUp size={15}/>}/>
              <StatCard label="Total Liabilities" value={fmt(stats.totalLiabilities)} color="text-red-300"     icon={<TrendingDown size={15}/>}/>
              <StatCard label="Total Equity"      value={fmt(stats.totalEquity)}      color="text-violet-300"  icon={<Wallet size={15}/>}/>
              <StatCard label="Total Revenue"     value={fmt(stats.totalRevenue)}      color="text-emerald-300" icon={<ArrowUpRight size={15}/>}/>
              <StatCard label="Total Expenses"    value={fmt(stats.totalExpenses)}     color="text-amber-300"   icon={<ArrowDownRight size={15}/>}/>
              <StatCard
                label="Net Income"
                value={fmt(stats.netIncome)}
                color={stats.netIncome >= 0 ? "text-emerald-300" : "text-red-300"}
                icon={<PieChart size={15}/>}
                sub={stats.netIncome >= 0 ? "Profit" : "Loss"}
              />
            </div>

            {/* Accounting Equation */}
            <Card>
              <CardHeader title="Accounting Equation" subtitle="Assets = Liabilities + Equity + Net Income"/>
              <div className="flex items-center justify-between gap-2 md:gap-4">
                <div className="flex-1 min-w-0 text-center p-3 md:p-4 rounded-xl bg-cyan-500/10 border border-cyan-500/20">
                  <div className="text-[9px] font-bold uppercase tracking-widest text-cyan-600 mb-1">Assets</div>
                  <div className="text-base md:text-2xl font-bold text-cyan-300 truncate">{fmt(stats.totalAssets)}</div>
                </div>
                <div className="text-lg md:text-xl font-bold text-slate-600 flex-shrink-0">=</div>
                <div className="flex-1 min-w-0 text-center p-3 md:p-4 rounded-xl bg-red-500/10 border border-red-500/20">
                  <div className="text-[9px] font-bold uppercase tracking-widest text-red-600 mb-1">Liabilities</div>
                  <div className="text-base md:text-2xl font-bold text-red-300 truncate">{fmt(stats.totalLiabilities)}</div>
                </div>
                <div className="text-lg md:text-xl font-bold text-slate-600 flex-shrink-0">+</div>
                <div className="flex-1 min-w-0 text-center p-3 md:p-4 rounded-xl bg-violet-500/10 border border-violet-500/20">
                  <div className="text-[9px] font-bold uppercase tracking-widest text-violet-600 mb-1">Equity</div>
                  <div className="text-base md:text-2xl font-bold text-violet-300 truncate">{fmt(stats.totalEquity)}</div>
                </div>
                <div className="text-lg md:text-xl font-bold text-slate-600 flex-shrink-0">+</div>
                <div className="flex-1 min-w-0 text-center p-3 md:p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                  <div className="text-[9px] font-bold uppercase tracking-widest text-emerald-600 mb-1">Current Period Earnings</div>
                  <div className="text-base md:text-2xl font-bold text-emerald-300 truncate">{fmt(stats.netIncome)}</div>
                </div>
              </div>
              <div className="mt-2 text-center text-[9px] text-slate-500">
                Current Period Earnings = Revenue − Expenses, not yet closed to retained earnings
              </div>
              <div className={cn("mt-3 text-center text-[10px] font-semibold", Math.abs(stats.totalAssets - (stats.totalLiabilities + totalEquityAndEarnings)) < 0.01 ? "text-emerald-400" : "text-amber-400")}>
                {Math.abs(stats.totalAssets - (stats.totalLiabilities + totalEquityAndEarnings)) < 0.01 ? "✓ Balanced" : "⚠ Out of balance — check your journal entries"}
              </div>
            </Card>

            {/* Quick Finance Links */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: "Expenses",         icon: <Receipt size={15}/>,    to: "/expenses",            color: "bg-amber-500/10 border-amber-500/20 text-amber-400" },
                { label: "Transactions",     icon: <DollarSign size={15}/>, to: "/finance/transactions", color: "bg-cyan-500/10 border-cyan-500/20 text-cyan-400" },
                { label: "Cash Flow",        icon: <TrendingUp size={15}/>, to: "/cash-flow",            color: "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" },
                { label: "Accounts Recv.",   icon: <FileText size={15}/>,   to: "/accounts-receivable",  color: "bg-blue-500/10 border-blue-500/20 text-blue-400" },
              ].map(l => (
                <button key={l.to} onClick={() => nav(l.to)}
                  className="flex items-center gap-3 p-4 rounded-xl border border-slate-200 dark:border-white/[0.07] bg-white dark:bg-[#0c1018] hover:border-slate-300 dark:hover:border-white/[0.13] hover:bg-slate-50 dark:hover:bg-[#111820] transition-colors text-left group">
                  <div className={cn("w-9 h-9 rounded-lg border flex items-center justify-center flex-shrink-0", l.color)}>{l.icon}</div>
                  <span className="text-xs font-semibold text-slate-400 group-hover:text-slate-200 transition-colors">{l.label}</span>
                  <ArrowRight size={11} className="ml-auto text-slate-700 group-hover:text-slate-400"/>
                </button>
              ))}
            </div>

            {/* Recent GL Transactions */}
            <Card padding={false}>
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-white/[0.06]">
                <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">Recent Journal Entries</span>
                <Btn size="xs" variant="ghost" onClick={() => setTab("ledger")}>View all <ArrowRight size={11}/></Btn>
              </div>
              {transactions.length === 0 ? (
                <Empty icon={<BookOpen size={18}/>} title="No journal entries yet"
                  body="Post transactions to see them here."
                  action={<Btn variant="primary" size="sm" onClick={() => nav("/finance/journal-entry")}>New Entry</Btn>}/>
              ) : (
                <Table>
                  <thead><tr><Th>Date</Th><Th>Reference</Th><Th>Description</Th><Th>Source</Th><Th>Status</Th><Th right>Amount</Th></tr></thead>
                  <tbody>
                    {transactions.slice(0,8).map((tx: any) => (
                      <Tr key={tx.id}>
                        <Td muted>{fmtDate(tx.transaction_date)}</Td>
                        <Td><span className="font-mono text-[10px] text-slate-300">{tx.transaction_number}</span></Td>
                        <Td><span className="font-medium text-slate-800 dark:text-slate-200 text-xs truncate max-w-[200px] block">{tx.description}</span></Td>
                        <Td><Badge color="slate">{tx.source_type?.replace("_"," ")}</Badge></Td>
                        <Td>
                          <Badge color={tx.status === "posted" ? "green" : tx.status === "draft" ? "amber" : "red"} dot>
                            {tx.status}
                          </Badge>
                        </Td>
                        <Td right><span className="font-semibold text-slate-800 dark:text-slate-200">{fmt(tx.total_amount)}</span></Td>
                      </Tr>
                    ))}
                  </tbody>
                </Table>
              )}
            </Card>
          </>
        )}

        {/* ── Chart of Accounts Tab ── */}
        {tab === "accounts" && (
          <>
            <div className="flex items-center justify-between">
              <div className="text-xs text-slate-600">{accounts.length} active accounts across {Object.keys(byType).length} types</div>
              <Btn variant="primary" size="sm" icon={<Plus size={13}/>}
                onClick={() => nav("/settings")}>
                Add Account
              </Btn>
            </div>

            {/* By type */}
            {(["asset","liability","equity","revenue","expense"] as const).map(type => {
              const typeAccounts = byType[type] || [];
              if (typeAccounts.length === 0) return null;
              const typeTotal = typeAccounts.reduce((s: number, a: any) => s + (a.current_balance || 0), 0);
              return (
                <Card key={type} padding={false}>
                  <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-white/[0.06]">
                    <div className="flex items-center gap-2">
                      <Badge color={ACCOUNT_TYPE_COLOR[type]}>{type}</Badge>
                      <span className="text-xs text-slate-600">{typeAccounts.length} accounts</span>
                    </div>
                    <span className="text-sm font-bold text-slate-800 dark:text-slate-200">{fmt(typeTotal)}</span>
                  </div>
                  <Table>
                    <thead><tr><Th>Code</Th><Th>Account Name</Th><Th>Subtype</Th><Th>Project Linkable</Th><Th right>Balance</Th></tr></thead>
                    <tbody>
                      {typeAccounts.map((a: any) => (
                        <Tr key={a.id}>
                          <Td><span className="font-mono text-[10px] text-slate-400">{a.code}</span></Td>
                          <Td>
                            <span className="font-medium text-slate-800 dark:text-slate-200" style={{ paddingLeft: `${(a.level - 1) * 16}px` }}>
                              {a.level > 1 ? "↳ " : ""}{a.name}
                            </span>
                          </Td>
                          <Td muted className="capitalize">{a.subtype?.replace(/_/g," ") || "—"}</Td>
                          <Td>{a.is_project_linkable ? <span className="text-emerald-400 text-[10px] font-semibold">✓ Yes</span> : <span className="text-slate-700 text-[10px]">—</span>}</Td>
                          <Td right>
                            <span className={cn("font-semibold text-sm", (a.current_balance || 0) >= 0 ? "text-slate-800 dark:text-slate-200" : "text-red-400")}>
                              {fmt(a.current_balance || 0)}
                            </span>
                          </Td>
                        </Tr>
                      ))}
                    </tbody>
                  </Table>
                </Card>
              );
            })}
          </>
        )}

        {/* ── General Ledger Tab ── */}
        {tab === "ledger" && (
          <>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="text-xs text-slate-600">{ledgerTransactions.length} entries</div>
              <div className="flex gap-2 items-center">
                <select value={dateRange} onChange={e => setDateRange(e.target.value as DateRange)}
                  className="bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] rounded-lg px-3 py-2 text-xs text-slate-700 dark:text-slate-300 outline-none [&>option]:bg-white dark:[&>option]:bg-[#111820]">
                  {DATE_RANGES.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
                </select>
                {dateRange === "custom" && (
                  <>
                    <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)} aria-label="Custom range start"
                      className="bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] rounded-lg px-2 py-2 text-xs text-slate-700 dark:text-slate-300 outline-none"/>
                    <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)} aria-label="Custom range end"
                      className="bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] rounded-lg px-2 py-2 text-xs text-slate-700 dark:text-slate-300 outline-none"/>
                  </>
                )}
                <Btn variant="secondary" size="sm" icon={<FileText size={13}/>}
                  onClick={() => nav("/finance/transactions")}>
                  Bank Transactions
                </Btn>
                <Btn variant="primary" size="sm" icon={<Plus size={13}/>}
                  onClick={() => nav("/expenses")}>
                  Log Expense
                </Btn>
              </div>
            </div>

            <Card padding={false}>
              {ledgerTransactions.length === 0 ? (
                <Empty icon={<BookOpen size={18}/>} title="No journal entries"
                  body="Journal entries are created automatically when you post expenses, invoices, and payments."
                  action={<Btn variant="primary" size="sm" onClick={() => nav("/finance/journal-entry")}>New Journal Entry</Btn>}/>
              ) : (
                <Table>
                  <thead>
                    <tr>
                      <Th>Date</Th>
                      <Th>Ref #</Th>
                      <Th>Description</Th>
                      <Th>Source</Th>
                      <Th>Currency</Th>
                      <Th>Status</Th>
                      <Th right>Amount</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {ledgerTransactions.map((tx: any) => (
                      <Tr key={tx.id}>
                        <Td muted>{fmtDate(tx.transaction_date)}</Td>
                        <Td><span className="font-mono text-[10px] text-cyan-400">{tx.transaction_number}</span></Td>
                        <Td><span className="text-slate-800 dark:text-slate-200 text-xs">{tx.description}</span></Td>
                        <Td><Badge color="slate">{tx.source_type?.replace(/_/g," ")}</Badge></Td>
                        <Td muted>{tx.currency || "JMD"}</Td>
                        <Td>
                          <Badge
                            color={tx.status === "posted" ? "green" : tx.status === "draft" ? "amber" : "red"}
                            dot>
                            {tx.status}
                          </Badge>
                        </Td>
                        <Td right>
                          <span className="font-semibold text-slate-800 dark:text-slate-200">{fmt(tx.total_amount)}</span>
                        </Td>
                      </Tr>
                    ))}
                  </tbody>
                </Table>
              )}
            </Card>
          </>
        )}

        {/* ── Reports Tab ── */}
        {tab === "reports" && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* P&L Summary */}
              <div className="md:col-span-2">
                <Card>
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <CardHeader title="Profit & Loss Summary" subtitle="Revenue vs Expenses"/>
                    <div className="flex items-center gap-2 flex-wrap">
                      <select value={dateRange} onChange={e => setDateRange(e.target.value as DateRange)}
                        className="bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] rounded-lg px-3 py-2 text-xs text-slate-700 dark:text-slate-300 outline-none [&>option]:bg-white dark:[&>option]:bg-[#111820]">
                        {DATE_RANGES.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
                      </select>
                      {dateRange === "custom" && (
                        <>
                          <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)} aria-label="Custom range start"
                            className="bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] rounded-lg px-2 py-2 text-xs text-slate-700 dark:text-slate-300 outline-none"/>
                          <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)} aria-label="Custom range end"
                            className="bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] rounded-lg px-2 py-2 text-xs text-slate-700 dark:text-slate-300 outline-none"/>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-white/[0.05]">
                      <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">Total Revenue</span>
                      <span className="text-sm font-bold text-emerald-400">{fmt(pnlRevenue)}</span>
                    </div>
                    {pnlRevenueAccounts.map((a) => (
                      <div key={a.id} className="flex items-center justify-between pl-4">
                        <span className="text-xs text-slate-500">{a.name}</span>
                        <span className="text-xs text-slate-300">{fmt(a.total)}</span>
                      </div>
                    ))}
                    <div className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-white/[0.05]">
                      <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">Total Expenses</span>
                      <span className="text-sm font-bold text-amber-400">{fmt(pnlExpenses)}</span>
                    </div>
                    {pnlExpenseAccounts.map((a) => (
                      <div key={a.id} className="flex items-center justify-between pl-4">
                        <span className="text-xs text-slate-500">{a.name}</span>
                        <span className="text-xs text-slate-300">{fmt(a.total)}</span>
                      </div>
                    ))}
                    <div className={cn("flex items-center justify-between py-3 px-4 rounded-xl border",
                      pnlNetIncome >= 0 ? "bg-emerald-500/10 border-emerald-500/20" : "bg-red-500/10 border-red-500/20")}>
                      <span className="text-sm font-bold text-slate-800 dark:text-slate-200">Net {pnlNetIncome >= 0 ? "Income" : "Loss"}</span>
                      <span className={cn("text-lg font-bold", pnlNetIncome >= 0 ? "text-emerald-400" : "text-red-400")}>
                        {fmt(Math.abs(pnlNetIncome))}
                      </span>
                    </div>
                  </div>
                </Card>
              </div>

              {/* Balance Sheet Summary — deliberately always all-time,
                  unaffected by the P&L card's date range above. A Balance
                  Sheet is a cumulative-since-inception snapshot, not a
                  period total the way revenue/expenses are — narrowing it
                  to a trailing window wouldn't be a real balance sheet,
                  and chart_of_accounts.current_balance (what this reads)
                  is a running total with no way to derive "as of a past
                  date" from it anyway. */}
              <Card>
                <CardHeader title="Balance Sheet" subtitle="Financial position — always current, not affected by the date range above"/>
                <div className="space-y-3">
                  {[
                    { label: "Assets",      value: stats.totalAssets,      color: "text-cyan-400" },
                    { label: "Liabilities", value: stats.totalLiabilities, color: "text-red-400" },
                    { label: "Equity",      value: stats.totalEquity,      color: "text-violet-400" },
                  ].map(r => (
                    <div key={r.label} className="flex items-center justify-between">
                      <span className="text-xs text-slate-500">{r.label}</span>
                      <span className={cn("text-sm font-bold", r.color)}>{fmt(r.value)}</span>
                    </div>
                  ))}
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-500">Retained Earnings to Date</span>
                    <span className="text-sm font-bold text-emerald-400">{fmt(stats.netIncome)}</span>
                  </div>
                  <div className="border-t border-slate-200 dark:border-white/[0.06] pt-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-400">L + E + Net Income</span>
                      <span className="text-sm font-bold text-slate-800 dark:text-slate-200">{fmt(stats.totalLiabilities + totalEquityAndEarnings)}</span>
                    </div>
                  </div>
                  <Progress
                    value={stats.totalAssets}
                    max={Math.max(stats.totalAssets, stats.totalLiabilities + totalEquityAndEarnings, 1)}
                    color={Math.abs(stats.totalAssets - (stats.totalLiabilities + totalEquityAndEarnings)) < 0.01 ? "cyan" : "amber"}
                  />
                  <div className={cn("text-center text-[10px] font-semibold", Math.abs(stats.totalAssets - (stats.totalLiabilities + totalEquityAndEarnings)) < 0.01 ? "text-emerald-400" : "text-amber-400")}>
                    {Math.abs(stats.totalAssets - (stats.totalLiabilities + totalEquityAndEarnings)) < 0.01 ? "✓ Balanced" : "⚠ Check entries"}
                  </div>
                </div>
              </Card>
            </div>

            {/* Export options — Trial Balance & Balance Sheet are always-
                current snapshots; P&L and Cash Flow respect the date range
                selected above (Cash Flow fetches live on click, the others
                read from state already on screen). Every export carries
                company branding + a generation timestamp. */}
            <Card>
              <CardHeader title="Export Reports" subtitle="Download for audit and review"/>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {EXPORT_REPORTS.map(r => (
                  <div key={r.key}
                    className="flex items-center justify-between gap-3 p-3 rounded-xl border border-slate-200 dark:border-white/[0.07] bg-slate-50 dark:bg-white/[0.02]">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="text-slate-600">{r.icon}</span>
                      <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 truncate">{r.label}</span>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <Btn variant="secondary" size="xs" icon={<Download size={11}/>}
                        disabled={exportingKey === r.key}
                        onClick={() => handleExport(r.key, "csv")}>CSV</Btn>
                      <Btn variant="secondary" size="xs" icon={<Printer size={11}/>}
                        disabled={exportingKey === r.key}
                        onClick={() => handleExport(r.key, "pdf")}>PDF</Btn>
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-slate-700 mt-3">Trial Balance & Balance Sheet are always-current; P&L and Cash Flow reflect the date range selected above.</p>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}