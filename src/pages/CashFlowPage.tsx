// src/pages/CashFlowPage.tsx
import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import {
  withdrawFunds,
} from "../lib/finance";
import {
  PageHeader, StatCard, Card, CardHeader, Badge, Btn,
  Table, Th, Tr, Td, Empty, Tabs, Modal, Field, Input, Select, cn
} from "../components/ui";
import { AddBankAccountModal } from "../components/AddBankAccountModal";
import {
  TrendingUp, TrendingDown, DollarSign,
  ArrowUpRight, ArrowDownRight, RefreshCw,
  Wallet, Building2, ArrowLeftRight, MinusCircle, Search
} from "lucide-react";

type Transaction = {
  id: string;
  transaction_type: string;
  amount: number;
  description: string | null;
  transaction_date: string | null;
  reference_number: string | null;
  bank_account_id: string | null;
  created_at: string;
  bank_accounts?: { account_name: string } | null;
};

type BankAccount = {
  id: string;
  account_name: string;
  account_type: "checking" | "savings" | "credit" | "line_of_credit";
  bank_name?: string | null;
  account_number_last_4?: string | null;
  current_balance: number;
  available_balance: number;
  is_primary: boolean;
  is_active: boolean;
};

type TransferPair = {
  reference_number: string;
  date: string;
  amount: number;
  description: string | null;
  fromAccountName: string;
  toAccountName: string;
  fromId: string;
  toId: string;
};

// ─── GL-connected Transfer Funds ────────────────────────────────────────
// Replaces the old bank_accounts-only transfer (transferFunds() in
// lib/finance.ts, still used nowhere else in this file now) — that path
// never touched gl_transactions/gl_entries, so a transfer made through it
// was invisible to Cash Position, Trial Balance, Balance Sheet, and every
// GL-based report built this session. This posts real gl_transactions/
// gl_entries instead, same source_type='fund_transfer' shape as the 237
// historical entries scripts/post-fund-transfers.ts posted, Dr [To] /
// Cr [From], both sides drawn from chart_of_accounts — not bank_accounts.
// bank_accounts/cash_transactions themselves are untouched by this; they
// simply stop being this feature's data source.

// Same "cash" classification CashPositionCard.tsx already uses: asset-type,
// subtype bank or current_asset (chart_of_accounts has no separate
// "petty_cash" subtype — confirmed against lib/accounting.ts's own
// AccountSubtype union — Petty Cash accounts live under current_asset).
type GLCashAccount = { id: string; code: string; name: string; current_balance: number };

type GLTransferRow = {
  id: string;
  transaction_number: string;
  date: string;
  description: string | null;
  amount: number;
  fromName: string;
  toName: string;
};

// Overview's Transactions table, GL-derived — one row per gl_entries leg
// touching a real cash account (not one row per gl_transactions header,
// unlike FinanceDashboardPage.tsx's General Ledger tab; a cash movement
// row needs to show which specific account it hit, the same shape
// cash_transactions used to provide).
type CashLedgerRow = {
  id: string;
  date: string;
  description: string | null;
  sourceType: string | null;
  accountName: string;
  debit: number;
  credit: number;
};

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency", currency: "JMD", maximumFractionDigits: 2
  }).format(n);
}

function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function fmtDateTime(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

// ─── Transfers tab date-range filter — same preset+custom pattern already
// proven in ExpensesPage.tsx and FinanceDashboardPage.tsx (DATE_RANGES/
// getCutoff/resolveDateWindow), copied rather than imported since none of
// those files export this shape. Deliberately scoped to the Transfers tab
// only — Overview already owns its own date control (the 30D/90D/1Y
// period selector), so it gets text search only, no second date filter.
type DateRange = "week" | "month" | "quarter" | "year" | "all" | "custom";

const DATE_RANGES: { key: DateRange; label: string }[] = [
  { key: "week", label: "This Week" },
  { key: "month", label: "This Month" },
  { key: "quarter", label: "This Quarter" },
  { key: "year", label: "This Year" },
  { key: "all", label: "All Time" },
  { key: "custom", label: "Custom Range" },
];

function getCutoff(range: DateRange): string | null {
  const now = new Date();
  if (range === "all" || range === "custom") return null;
  if (range === "week") { now.setDate(now.getDate() - 7); }
  else if (range === "month") { now.setMonth(now.getMonth() - 1); }
  else if (range === "quarter") { now.setMonth(now.getMonth() - 3); }
  else if (range === "year") { now.setFullYear(now.getFullYear() - 1); }
  return now.toISOString();
}

function customRangeBounds(start: string, end: string): { start: string | null; end: string | null } {
  return {
    start: start ? new Date(`${start}T00:00:00`).toISOString() : null,
    end: end ? new Date(`${end}T23:59:59.999`).toISOString() : null,
  };
}

function resolveDateWindow(range: DateRange, customStart: string, customEnd: string): { start: string | null; end: string | null } {
  return range === "custom" ? customRangeBounds(customStart, customEnd) : { start: getCutoff(range), end: null };
}

export default function CashFlowPage() {
  const [tab, setTab] = useState<"overview" | "accounts" | "transfers">("overview");
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [period, setPeriod] = useState<"30" | "90" | "365">("30");

  // Modals
  const [showAddAccount, setShowAddAccount] = useState(false);
  const [showTransfer, setShowTransfer] = useState(false);
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [activeAccount, setActiveAccount] = useState<BankAccount | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // GL cash/bank accounts for the new Transfer picker, and the live log of
  // GL-posted fund transfers — both queried fresh from chart_of_accounts /
  // gl_transactions, never hardcoded.
  const [glAccounts, setGlAccounts] = useState<GLCashAccount[]>([]);
  const [glTransfers, setGlTransfers] = useState<GLTransferRow[]>([]);
  const [transferSuccess, setTransferSuccess] = useState<string | null>(null);

  // Transfers tab filters — text search (From/To/Description) + date-range
  // (preset+custom), combined together. Client-side, on the already-loaded
  // glTransfers (capped at 200 rows — cheap to filter locally).
  const [transferSearch, setTransferSearch] = useState("");
  const [transferDateRange, setTransferDateRange] = useState<DateRange>("all");
  const [transferCustomStart, setTransferCustomStart] = useState("");
  const [transferCustomEnd, setTransferCustomEnd] = useState("");

  // Overview tab filter — search only (Description/Account). No date
  // control here on purpose: the 30D/90D/1Y period selector above already
  // scopes this tab's data, and a second date filter would just compete
  // with it.
  const [overviewSearch, setOverviewSearch] = useState("");

  // Transfer form state — fromAccountId/toAccountId/date added: the old
  // form only had "to", because "from" was implied by whichever
  // bank_accounts card the user clicked. GL accounts aren't tied to a
  // clicked card, so both sides are now explicit.
  const [transferForm, setTransferForm] = useState({
    fromAccountId: "", toAccountId: "", amount: "", description: "",
    date: new Date().toISOString().split("T")[0],
  });

  // Withdraw form state
  const [withdrawForm, setWithdrawForm] = useState({ amount: "", reason: "", category: "Withdrawal" });

  // Overview KPIs — now GL-derived, same fix as last round's Transfers tab
  // badge. totalIn/totalOut used to come from cash_transactions (the same
  // table that had 2 fake test rows manually deleted earlier this
  // session); totalBalance used to sum bank_accounts (0 real rows). All
  // three now read the real chart_of_accounts/gl_entries data instead —
  // see glAccounts (already loaded for the Transfer picker/Accounts tab)
  // and glCashStats below.
  const [glCashStats, setGlCashStats] = useState({ totalIn: 0, totalOut: 0 });
  const [glLedgerEntries, setGlLedgerEntries] = useState<CashLedgerRow[]>([]);
  const [glCashLoading, setGlCashLoading] = useState(true);
  const totalIn = glCashStats.totalIn;
  const totalOut = glCashStats.totalOut;
  const netFlow = totalIn - totalOut;
  const totalBalance = glAccounts.reduce((s, a) => s + (a.current_balance || 0), 0);

  // Group transfer legs into paired rows by reference_number
  const transferPairs: TransferPair[] = (() => {
    const transferTxns = transactions.filter(t => t.transaction_type === "transfer" && t.reference_number);
    const byRef = new Map<string, Transaction[]>();
    for (const t of transferTxns) {
      const ref = t.reference_number!;
      if (!byRef.has(ref)) byRef.set(ref, []);
      byRef.get(ref)!.push(t);
    }
    const pairs: TransferPair[] = [];
    byRef.forEach((legs, ref) => {
      const outLeg = legs.find(l => l.amount < 0);
      const inLeg = legs.find(l => l.amount > 0);
      if (outLeg && inLeg) {
        pairs.push({
          reference_number: ref,
          date: outLeg.transaction_date || outLeg.created_at,
          amount: Math.abs(outLeg.amount),
          description: outLeg.description,
          fromAccountName: outLeg.bank_accounts?.account_name || "—",
          toAccountName: inLeg.bank_accounts?.account_name || "—",
          fromId: outLeg.id,
          toId: inLeg.id,
        });
      }
    });
    return pairs.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  })();

  const unlinkedTransferCount = transactions.filter(
    t => t.transaction_type === "transfer" && !t.reference_number
  ).length;

  // Transfers tab: search + date range combined (narrow together, not
  // replace each other) — same as ExpensesPage.tsx's own matchSearch &&
  // matchDate combination.
  const transferWindow = resolveDateWindow(transferDateRange, transferCustomStart, transferCustomEnd);
  const filteredGlTransfers = glTransfers.filter(t => {
    const q = transferSearch.trim().toLowerCase();
    if (q) {
      const hit = t.fromName.toLowerCase().includes(q)
        || t.toName.toLowerCase().includes(q)
        || (t.description || "").toLowerCase().includes(q);
      if (!hit) return false;
    }
    const time = new Date(t.date).getTime();
    if (transferWindow.start && time < new Date(transferWindow.start).getTime()) return false;
    if (transferWindow.end && time > new Date(transferWindow.end).getTime()) return false;
    return true;
  });

  // Overview tab: search only, over the already period-scoped glLedgerEntries.
  const filteredGlLedgerEntries = glLedgerEntries.filter(r => {
    const q = overviewSearch.trim().toLowerCase();
    if (!q) return true;
    return (r.description || "").toLowerCase().includes(q) || r.accountName.toLowerCase().includes(q);
  });

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      supabase.from("user_profiles").select("company_id").eq("id", user.id).maybeSingle()
        .then(({ data }) => { if (data?.company_id) setCompanyId(data.company_id); });
    });
  }, []);

  useEffect(() => { if (companyId) loadData(); }, [companyId, period]);
  useEffect(() => { if (companyId) { loadGLAccounts(); loadGLTransfers(); } }, [companyId]);
  // Depends on glAccounts (not just companyId/period) — needs the real
  // cash account ids before it can query gl_entries against them. Only
  // re-fires when glAccounts is actually re-set (a genuine reload), not on
  // every render, since setGlAccounts is only called from loadGLAccounts().
  useEffect(() => {
    if (companyId && glAccounts.length > 0) loadGLCashStats(period);
    else if (companyId) {
      setGlCashStats({ totalIn: 0, totalOut: 0 });
      setGlLedgerEntries([]);
      setGlCashLoading(false);
    }
  }, [companyId, period, glAccounts]);

  // Cash In = debits landing on real cash accounts within the period
  // (asset accounts are debit-normal, so a debit is money arriving); Cash
  // Out = credits leaving them. Same account set as totalBalance/
  // CashPositionCard.tsx (glAccounts), same PostgREST embedded-resource
  // filtering + manual pagination-safe loop already proven in
  // FinanceDashboardPage.tsx's loadPeriodPnL/Cash Flow export.
  //
  // Also builds glLedgerEntries (Overview's Transactions table) from the
  // exact same fetched rows — one pass, not a second query, since both
  // need the identical filtered set of cash-touching gl_entries.
  async function loadGLCashStats(p: "30" | "90" | "365") {
    if (!companyId || glAccounts.length === 0) return;
    setGlCashLoading(true);
    try {
      const since = new Date();
      since.setDate(since.getDate() - parseInt(p));
      const cashIds = glAccounts.map(a => a.id);
      const accountNameById = new Map(glAccounts.map(a => [a.id, a.name]));

      const PAGE = 1000;
      let totalIn = 0, totalOut = 0;
      let allRows: any[] = [];
      let from = 0;
      for (let guard = 0; guard < 200; guard++) {
        const { data, error } = await supabase
          .from("gl_entries")
          .select("id, account_id, debit, credit, gl_transactions!inner(transaction_date, description, source_type, status, company_id)")
          .eq("gl_transactions.company_id", companyId)
          .eq("gl_transactions.status", "posted")
          .in("account_id", cashIds)
          .gte("gl_transactions.transaction_date", since.toISOString())
          .range(from, from + PAGE - 1);
        if (error) throw error;
        allRows = allRows.concat(data || []);
        for (const row of (data as any[]) || []) {
          totalIn += Number(row.debit) || 0;
          totalOut += Number(row.credit) || 0;
        }
        if (!data || data.length < PAGE) break;
        from += PAGE;
      }
      setGlCashStats({ totalIn, totalOut });

      // Display cap at 200 rows, same as the old cash_transactions
      // .limit(200) — totals above already reflect the FULL fetched set,
      // not just this capped display slice.
      const rows: CashLedgerRow[] = allRows
        .map((row: any) => ({
          id: row.id,
          date: row.gl_transactions?.transaction_date,
          description: row.gl_transactions?.description ?? null,
          sourceType: row.gl_transactions?.source_type ?? null,
          accountName: accountNameById.get(row.account_id) || "—",
          debit: Number(row.debit) || 0,
          credit: Number(row.credit) || 0,
        }))
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .slice(0, 200);
      setGlLedgerEntries(rows);
    } catch (e: any) {
      console.error("loadGLCashStats failed:", e);
    } finally {
      setGlCashLoading(false);
    }
  }

  // Real, active, bank/current_asset chart_of_accounts — queried live, not
  // hardcoded from any prior session's list (that list drifts as accounts
  // are added/deactivated).
  async function loadGLAccounts() {
    if (!companyId) return;
    try {
      const { data, error } = await supabase
        .from("chart_of_accounts")
        .select("id, code, name, current_balance")
        .eq("company_id", companyId)
        .eq("type", "asset")
        .in("subtype", ["bank", "current_asset"])
        .eq("is_active", true)
        .order("code", { ascending: true });
      if (error) throw error;
      setGlAccounts(data || []);
    } catch (e: any) {
      console.error("loadGLAccounts failed:", e);
    }
  }

  // Live log of GL-posted fund transfers, for the Transfers tab — without
  // this, a transfer made through the new modal would post correctly but
  // never visibly confirm itself anywhere in this tab (the existing
  // Transfer Log table below reads cash_transactions, which this feature
  // deliberately no longer writes to). Two-step fetch (transactions, then
  // their entries) rather than a single embedded-resource query, since
  // debit/credit → from/to needs to be resolved per transaction in JS
  // anyway.
  async function loadGLTransfers() {
    if (!companyId) return;
    try {
      const { data: txs, error: txErr } = await supabase
        .from("gl_transactions")
        .select("id, transaction_number, transaction_date, description, total_amount")
        .eq("company_id", companyId)
        .eq("source_type", "fund_transfer")
        .eq("status", "posted")
        .order("transaction_date", { ascending: false })
        .limit(200);
      if (txErr) throw txErr;

      const ids = (txs || []).map(t => t.id);
      if (ids.length === 0) { setGlTransfers([]); return; }

      const { data: entries, error: entErr } = await supabase
        .from("gl_entries")
        .select("transaction_id, debit, credit, chart_of_accounts(name)")
        .in("transaction_id", ids);
      if (entErr) throw entErr;

      const byTx = new Map<string, any[]>();
      for (const e of (entries as any[]) || []) {
        if (!byTx.has(e.transaction_id)) byTx.set(e.transaction_id, []);
        byTx.get(e.transaction_id)!.push(e);
      }

      const rows: GLTransferRow[] = (txs || []).map(t => {
        const legs = byTx.get(t.id) || [];
        const toLeg = legs.find(l => Number(l.debit) > 0);
        const fromLeg = legs.find(l => Number(l.credit) > 0);
        return {
          id: t.id,
          transaction_number: t.transaction_number,
          date: t.transaction_date,
          description: t.description,
          amount: Number(t.total_amount) || 0,
          fromName: fromLeg?.chart_of_accounts?.name || "—",
          toName: toLeg?.chart_of_accounts?.name || "—",
        };
      });
      setGlTransfers(rows);
    } catch (e: any) {
      console.error("loadGLTransfers failed:", e);
    }
  }

  async function loadData() {
    setLoading(true);
    try {
      const since = new Date();
      since.setDate(since.getDate() - parseInt(period));

      const [txRes, accRes] = await Promise.all([
        supabase.from("cash_transactions")
          .select("*, bank_accounts(account_name)")
          .eq("company_id", companyId!)
          .gte("created_at", since.toISOString())
          .order("created_at", { ascending: false })
          .limit(200),
        supabase.from("bank_accounts")
          .select("*")
          .eq("company_id", companyId!)
          .eq("is_active", true)
          .order("is_primary", { ascending: false }),
      ]);

      setTransactions(txRes.data || []);
      setAccounts(accRes.data || []);
    } catch (e: any) { console.error(e); }
    finally { setLoading(false); }
  }

  function openTransfer() {
    // No longer takes a BankAccount — the old flow implied "from" by
    // whichever bank_accounts card was clicked; GL accounts aren't tied
    // to one, so both From and To are picked explicitly in the modal.
    setTransferForm({
      fromAccountId: "", toAccountId: "", amount: "", description: "",
      date: new Date().toISOString().split("T")[0],
    });
    setFormError(null);
    setTransferSuccess(null);
    setShowTransfer(true);
  }

  function openWithdraw(account: BankAccount) {
    setActiveAccount(account);
    setWithdrawForm({ amount: "", reason: "", category: "Withdrawal" });
    setFormError(null);
    setShowWithdraw(true);
  }

  // Posts a real gl_transaction (source_type='fund_transfer', Dr [To] /
  // Cr [From]) directly, not through lib/finance.ts's transferFunds()
  // (bank_accounts-only, no GL). Header is inserted with its FINAL
  // status='posted' in a single INSERT — same shape JournalEntryPage.tsx's
  // save() already uses for a live single-transaction post — rather than
  // insert-as-draft-then-update. Confirmed via 20260820020000_add_balance_
  // update_trigger_on_posting.sql that this is the path that correctly
  // triggers chart_of_accounts.current_balance via update_account_balance()
  // (its INSERT branch on gl_entries only applies when the parent
  // gl_transactions row is ALREADY status='posted' at insert time).
  // Deliberately does NOT also run a manual chart_of_accounts UPDATE the
  // way JournalEntryPage.tsx's save() does after this — that trailing
  // update is a separate, real double-counting bug there (flagged
  // separately, not fixed here — out of this feature's scope), not a
  // pattern to copy.
  async function handleTransfer() {
    setFormError(null);
    setTransferSuccess(null);
    const amount = parseFloat(transferForm.amount);
    const fromAcct = glAccounts.find(a => a.id === transferForm.fromAccountId);
    const toAcct = glAccounts.find(a => a.id === transferForm.toAccountId);

    if (!transferForm.fromAccountId) { setFormError("Choose a source account"); return; }
    if (!transferForm.toAccountId) { setFormError("Choose a destination account"); return; }
    if (transferForm.fromAccountId === transferForm.toAccountId) { setFormError("Source and destination must be different accounts"); return; }
    if (!amount || amount <= 0) { setFormError("Enter a valid amount"); return; }
    if (!fromAcct || !toAcct) { setFormError("Selected account not found — refresh and try again"); return; }
    if (!transferForm.date) { setFormError("Choose a date"); return; }
    if (!companyId) { setFormError("Couldn't determine company"); return; }

    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      // Same FT- prefix as the 237 historical Fund Transfer entries
      // (scripts/post-fund-transfers.ts) — timestamp + random suffix, not
      // a sequence, so concurrent transfers can never collide.
      const txNumber = `FT-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const description = transferForm.description.trim() || `Fund transfer: ${fromAcct.name} -> ${toAcct.name}`;

      const { data: tx, error: txErr } = await supabase
        .from("gl_transactions")
        .insert({
          company_id: companyId,
          transaction_number: txNumber,
          transaction_date: transferForm.date,
          source_type: "fund_transfer",
          description,
          total_amount: amount,
          currency: "JMD",
          status: "posted",
          posted_by: user?.id,
          posted_at: new Date().toISOString(),
          created_by: user?.id,
        })
        .select()
        .maybeSingle();
      if (txErr) throw txErr;
      if (!tx) throw new Error("Failed to create transfer transaction");

      const entries = [
        { transaction_id: tx.id, company_id: companyId, account_id: toAcct.id, debit: amount, credit: 0, description, line_number: 1, entry_type: "regular", reconciled: false },
        { transaction_id: tx.id, company_id: companyId, account_id: fromAcct.id, debit: 0, credit: amount, description, line_number: 2, entry_type: "regular", reconciled: false },
      ];
      const { error: entryErr } = await supabase.from("gl_entries").insert(entries);
      if (entryErr) {
        // Orphaned-header cleanup — same discipline as every posting
        // script this session: a posted header with no entries is worse
        // than no header at all (it would sit in gl_transactions with a
        // nonzero total_amount but nothing backing it).
        await supabase.from("gl_transactions").delete().eq("id", tx.id);
        throw entryErr;
      }

      setShowTransfer(false);
      setTransferSuccess(`${txNumber} posted: ${fmt(amount)} from ${fromAcct.name} to ${toAcct.name}.`);
      await Promise.all([loadGLAccounts(), loadGLTransfers()]);
    } catch (e: any) {
      setFormError(e.message || "Transfer failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleWithdraw() {
    setFormError(null);
    const amount = parseFloat(withdrawForm.amount);
    if (!amount || amount <= 0) { setFormError("Enter a valid amount"); return; }
    if (!withdrawForm.reason.trim()) { setFormError("Enter a reason for this withdrawal"); return; }
    if (!activeAccount) return;

    setSaving(true);
    try {
      await withdrawFunds({
        accountId: activeAccount.id,
        amount,
        reason: withdrawForm.reason.trim(),
        category: withdrawForm.category,
      });
      setShowWithdraw(false);
      await loadData();
    } catch (e: any) {
      setFormError(e.message || "Withdrawal failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#080b10]">
      <PageHeader
        title="Cash Flow"
        subtitle="Bank accounts, transfers, and transaction history"
        actions={
          <>
            <Btn variant="ghost" size="sm" icon={<RefreshCw size={13} className={(loading || glCashLoading) ? "animate-spin" : ""}/>}
              onClick={() => { loadData(); loadGLCashStats(period); }}/>
            {tab === "overview" && (
              <div className="flex items-center gap-1 rounded-lg border border-slate-200 dark:border-white/[0.08] bg-slate-50 dark:bg-white/[0.04] p-1">
                {(["30","90","365"] as const).map(p => (
                  <button key={p} onClick={() => setPeriod(p)}
                    className={cn("px-2.5 py-1 rounded-md text-[10px] font-bold transition-colors",
                      period === p ? "bg-slate-200 dark:bg-white/10 text-slate-800 dark:text-slate-200" : "text-slate-600 hover:text-slate-400")}>
                    {p === "365" ? "1Y" : `${p}D`}
                  </button>
                ))}
              </div>
            )}
            {/* "Add Account" and "Upload Statement" removed from here —
                both are bank_accounts-based (createBankAccount() /
                UploadStatementPage.tsx's own account picker reads
                bank_accounts directly). Now that this tab shows real
                chart_of_accounts entries, "Add Account" would silently
                create a bank_accounts row invisible to this list, and
                Upload Statement's account picker would show an empty
                list. Flagged for Veron rather than repurposed — see
                report. Modals/functions left in place, just unreachable
                from here. */}
            {tab === "transfers" && (
              <Btn variant="primary" size="sm" icon={<ArrowLeftRight size={13}/>} onClick={openTransfer}>
                New Transfer
              </Btn>
            )}
          </>
        }
      />

      <div className="px-6">
        <Tabs
          tabs={[
            { key: "overview", label: "Overview" },
            { key: "accounts", label: "Accounts", count: glAccounts.length },
            { key: "transfers", label: "Transfers", count: glTransfers.length },
          ]}
          active={tab}
          onChange={setTab}
        />
      </div>

      <div className="p-6 space-y-5">

        {tab === "overview" && (
          <>
            {/* KPIs */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard label="Total Balance" value={fmt(totalBalance)}
                icon={<Wallet size={15}/>} color="text-cyan-300" sub={`${glAccounts.length} account${glAccounts.length !== 1 ? "s" : ""}`}/>
              <StatCard label={`Cash In (${period}d)`} value={fmt(totalIn)}
                icon={<ArrowUpRight size={15}/>} color="text-emerald-300"/>
              <StatCard label={`Cash Out (${period}d)`} value={fmt(totalOut)}
                icon={<ArrowDownRight size={15}/>} color="text-red-300"/>
              <StatCard label="Net Flow" value={fmt(netFlow)}
                icon={netFlow >= 0 ? <TrendingUp size={15}/> : <TrendingDown size={15}/>}
                color={netFlow >= 0 ? "text-emerald-300" : "text-red-300"}/>
            </div>

            {/* Transactions table — now GL-derived (gl_entries touching the
                same real bank/current_asset cash accounts as the KPIs
                above), not cash_transactions. One row per entry leg, same
                general column shape (date/description/source/account/
                amount) as FinanceDashboardPage.tsx's General Ledger tab,
                for visual consistency, adapted to show which account each
                leg hit — the Ledger tab shows one row per transaction
                header instead, since that's not tied to a single account. */}
            {/* Search only — the period selector above (30D/90D/1Y) already
                owns date scoping for this tab; a second date filter here
                would just compete with it. */}
            <div className="relative max-w-sm">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-700"/>
              <Input className="pl-8" placeholder="Search description or account..."
                value={overviewSearch} onChange={e => setOverviewSearch(e.target.value)}/>
            </div>

            <Card padding={false}>
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-white/[0.06]">
                <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                  Transactions <span className="text-slate-600 font-normal text-xs ml-2">last {period} days</span>
                </span>
                <span className="text-xs text-slate-600">{filteredGlLedgerEntries.length} records</span>
              </div>

              {glCashLoading ? (
                <div className="flex items-center justify-center py-12 text-xs text-slate-600">
                  <RefreshCw size={14} className="animate-spin mr-2"/> Loading...
                </div>
              ) : filteredGlLedgerEntries.length === 0 ? (
                <Empty icon={<DollarSign size={18}/>} title="No cash movement found"
                  body={overviewSearch ? "No transactions match your search." : "Posted GL activity touching your bank/cash accounts will appear here."}/>
              ) : (
                <Table>
                  <thead>
                    <tr>
                      <Th>Date</Th>
                      <Th>Description</Th>
                      <Th>Account</Th>
                      <Th>Source</Th>
                      <Th right>Amount</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredGlLedgerEntries.map(r => {
                      const isIn = r.debit > 0;
                      const amount = isIn ? r.debit : r.credit;
                      return (
                        <Tr key={r.id}>
                          <Td muted>{fmtDate(r.date)}</Td>
                          <Td><span className="font-medium text-slate-800 dark:text-slate-200">{r.description || "—"}</span></Td>
                          <Td muted>{r.accountName}</Td>
                          <Td><Badge color="slate">{r.sourceType?.replace(/_/g, " ") || "—"}</Badge></Td>
                          <Td right>
                            <span className={cn("font-semibold", isIn ? "text-emerald-400" : "text-red-400")}>
                              {isIn ? "+" : "-"}{fmt(amount)}
                            </span>
                          </Td>
                        </Tr>
                      );
                    })}
                  </tbody>
                </Table>
              )}
            </Card>
          </>
        )}

        {tab === "accounts" && (
          <>
            {/* Real chart_of_accounts entries now — same bank/current_asset/
                active filter as Task 1's totalBalance and CashPositionCard.tsx
                (glAccounts, already loaded for the Transfer picker). Replaces
                the old bank_accounts list (0 real rows). No per-card action
                buttons: "Transfer" lives on the Transfers tab now, and
                Withdraw is bank_accounts-based (no valid target here — see
                report) rather than rebuilt against the GL in this pass. */}
            {glAccounts.length === 0 ? (
              <Card>
                <Empty icon={<Building2 size={18}/>} title="No cash/bank accounts found"
                  body="No active chart_of_accounts entries with a bank or current-asset subtype exist yet."/>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {glAccounts.map(a => (
                  <Card key={a.id}>
                    <div className="flex items-start justify-between mb-3">
                      <div className="w-9 h-9 rounded-lg flex items-center justify-center border bg-cyan-500/10 border-cyan-500/20">
                        <Building2 size={14} className="text-cyan-400"/>
                      </div>
                      <Badge color="slate">{a.code}</Badge>
                    </div>
                    <div className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-2">{a.name}</div>
                    <div className={cn("text-xl font-bold", a.current_balance >= 0 ? "text-emerald-400" : "text-red-400")}>
                      {fmt(a.current_balance)}
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </>
        )}

        {tab === "transfers" && (
          <>
            {transferSuccess && (
              <div className="text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2">
                ✓ {transferSuccess}
              </div>
            )}

            {/* GL-connected Fund Transfers — the new, live feature. Posts
                directly to gl_transactions/gl_entries (source_type=
                'fund_transfer'), so these show up in Cash Position, Trial
                Balance, Balance Sheet, and every GL report immediately,
                unlike the old bank_accounts-only Transfer Log below. */}
            <div className="flex flex-wrap gap-3">
              <div className="relative flex-1 max-w-sm">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-700"/>
                <Input className="pl-8" placeholder="Search from/to/description..."
                  value={transferSearch} onChange={e => setTransferSearch(e.target.value)}/>
              </div>
              <Select value={transferDateRange} onChange={e => setTransferDateRange(e.target.value as DateRange)} className="w-40">
                {DATE_RANGES.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
              </Select>
              {transferDateRange === "custom" && (
                <>
                  <Input type="date" value={transferCustomStart} onChange={e => setTransferCustomStart(e.target.value)} className="w-36" aria-label="Custom range start"/>
                  <Input type="date" value={transferCustomEnd} onChange={e => setTransferCustomEnd(e.target.value)} className="w-36" aria-label="Custom range end"/>
                </>
              )}
            </div>

            <Card padding={false}>
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-white/[0.06]">
                <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                  Fund Transfers <span className="text-slate-600 font-normal text-xs ml-2">GL-posted</span>
                </span>
                <span className="text-xs text-slate-600">{filteredGlTransfers.length} transfers</span>
              </div>
              {filteredGlTransfers.length === 0 ? (
                <Empty icon={<ArrowLeftRight size={18}/>} title="No fund transfers yet"
                  body={transferSearch || transferDateRange !== "all"
                    ? "No transfers match your filters."
                    : "Transfers you post here move directly between chart_of_accounts and show up on every GL report immediately."}
                  action={<Btn variant="primary" size="sm" onClick={openTransfer}>New Transfer</Btn>}/>
              ) : (
                <Table>
                  <thead>
                    <tr>
                      <Th>Date</Th>
                      <Th>Reference</Th>
                      <Th>From</Th>
                      <Th>To</Th>
                      <Th>Description</Th>
                      <Th right>Amount</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredGlTransfers.map(t => (
                      <Tr key={t.id}>
                        <Td muted>{fmtDate(t.date)}</Td>
                        <Td muted className="font-mono text-[10px]">{t.transaction_number}</Td>
                        <Td><span className="font-medium text-slate-800 dark:text-slate-200">{t.fromName}</span></Td>
                        <Td><span className="font-medium text-slate-800 dark:text-slate-200">{t.toName}</span></Td>
                        <Td muted>{t.description || "—"}</Td>
                        <Td right><span className="font-semibold text-cyan-300">{fmt(t.amount)}</span></Td>
                      </Tr>
                    ))}
                  </tbody>
                </Table>
              )}
            </Card>

            {/* Old bank_accounts-based Transfer Log — untouched, kept for
                whatever historical records exist there. New transfers no
                longer write to this. */}
            {unlinkedTransferCount > 0 && (
              <div className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
                {unlinkedTransferCount} older transfer record{unlinkedTransferCount !== 1 ? "s" : ""} from before this log existed {unlinkedTransferCount !== 1 ? "aren't" : "isn't"} linked and won't appear here — they're still visible in the Overview tab.
              </div>
            )}
            <Card padding={false}>
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-white/[0.06]">
                <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                  Bank Account Transfer Log <span className="text-slate-600 font-normal text-xs ml-2">last {period} days, legacy</span>
                </span>
                <span className="text-xs text-slate-600">{transferPairs.length} transfers</span>
              </div>

              {loading ? (
                <div className="flex items-center justify-center py-12 text-xs text-slate-600">
                  <RefreshCw size={14} className="animate-spin mr-2"/> Loading...
                </div>
              ) : transferPairs.length === 0 ? (
                <Empty icon={<ArrowLeftRight size={18}/>} title="No transfers yet"
                  body="Transfers between your accounts will appear here, with both sides linked together."/>
              ) : (
                <Table>
                  <thead>
                    <tr>
                      <Th>Date</Th>
                      <Th>From</Th>
                      <Th>To</Th>
                      <Th>Description</Th>
                      <Th right>Amount</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {transferPairs.map(p => (
                      <Tr key={p.reference_number}>
                        <Td muted>{fmtDateTime(p.date)}</Td>
                        <Td><span className="font-medium text-slate-800 dark:text-slate-200">{p.fromAccountName}</span></Td>
                        <Td><span className="font-medium text-slate-800 dark:text-slate-200">{p.toAccountName}</span></Td>
                        <Td muted>{p.description || "—"}</Td>
                        <Td right><span className="font-semibold text-cyan-300">{fmt(p.amount)}</span></Td>
                      </Tr>
                    ))}
                  </tbody>
                </Table>
              )}
            </Card>
          </>
        )}
      </div>

      {/* Add Account modal — shared component (see components/
          AddBankAccountModal.tsx). No trigger button here on purpose: that
          removal a few sessions ago was intentional (this tab shows real
          chart_of_accounts data now, see the Accounts tab's own comments)
          and is not reversed by this extraction. showAddAccount stays
          wired up in case anything still flips it true. */}
      <AddBankAccountModal open={showAddAccount} onClose={() => setShowAddAccount(false)} onCreated={() => loadData()}/>

      {/* Transfer modal — GL account-to-account, posts immediately (same
          real-time-confirmed-action standard as Log Expense: no separate
          draft/approval step). From/To are both chart_of_accounts, not
          bank_accounts. */}
      <Modal open={showTransfer} onClose={() => setShowTransfer(false)} title="Transfer Funds" subtitle="Posts directly to the General Ledger">
        <div className="space-y-3">
          {formError && <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{formError}</div>}
          <Field label="From Account">
            <Select value={transferForm.fromAccountId} onChange={e => setTransferForm(s => ({ ...s, fromAccountId: e.target.value }))}>
              <option value="">Select source account...</option>
              {glAccounts.filter(a => a.id !== transferForm.toAccountId).map(a => (
                <option key={a.id} value={a.id}>{a.code} — {a.name} ({fmt(a.current_balance)})</option>
              ))}
            </Select>
          </Field>
          <Field label="To Account">
            <Select value={transferForm.toAccountId} onChange={e => setTransferForm(s => ({ ...s, toAccountId: e.target.value }))}>
              <option value="">Select destination account...</option>
              {glAccounts.filter(a => a.id !== transferForm.fromAccountId).map(a => (
                <option key={a.id} value={a.id}>{a.code} — {a.name} ({fmt(a.current_balance)})</option>
              ))}
            </Select>
          </Field>
          <Field label="Amount">
            <Input type="number" placeholder="0.00" value={transferForm.amount}
              onChange={e => setTransferForm(s => ({ ...s, amount: e.target.value }))}/>
          </Field>
          {(() => {
            const fromAcct = glAccounts.find(a => a.id === transferForm.fromAccountId);
            const amount = parseFloat(transferForm.amount);
            if (!fromAcct || !amount || amount <= 0) return null;
            const after = fromAcct.current_balance - amount;
            if (after >= 0) return null;
            // Not blocked — chart_of_accounts allows asset accounts to go
            // negative (confirmed: the current_balance >= 0 check
            // constraint explicitly exempts type IN ('asset','expense',
            // 'revenue')) — this is a courtesy warning only.
            return (
              <div className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
                This will bring {fromAcct.name} to a negative balance ({fmt(after)}).
              </div>
            );
          })()}
          <Field label="Date">
            <Input type="date" value={transferForm.date}
              onChange={e => setTransferForm(s => ({ ...s, date: e.target.value }))}/>
          </Field>
          <Field label="Description (optional)">
            <Input placeholder="e.g. Moving funds for payroll" value={transferForm.description}
              onChange={e => setTransferForm(s => ({ ...s, description: e.target.value }))}/>
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <Btn variant="ghost" size="sm" onClick={() => setShowTransfer(false)}>Cancel</Btn>
            <Btn variant="primary" size="sm" onClick={handleTransfer} disabled={saving}>
              {saving ? "Posting..." : "Post Transfer"}
            </Btn>
          </div>
        </div>
      </Modal>

      {/* Withdraw modal */}
      <Modal open={showWithdraw} onClose={() => setShowWithdraw(false)} title="Withdraw Funds" subtitle={activeAccount ? `From ${activeAccount.account_name}` : undefined}>
        <div className="space-y-3">
          {formError && <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{formError}</div>}
          <Field label="Amount">
            <Input type="number" placeholder="0.00" value={withdrawForm.amount}
              onChange={e => setWithdrawForm(s => ({ ...s, amount: e.target.value }))}/>
          </Field>
          <Field label="Category">
            <Select value={withdrawForm.category} onChange={e => setWithdrawForm(s => ({ ...s, category: e.target.value }))}>
              <option value="Withdrawal">General Withdrawal</option>
              <option value="Owner Draw">Owner Draw</option>
              <option value="Cash for Site">Cash for Site</option>
              <option value="Petty Cash">Petty Cash</option>
            </Select>
          </Field>
          <Field label="Reason">
            <Input placeholder="What is this withdrawal for?" value={withdrawForm.reason}
              onChange={e => setWithdrawForm(s => ({ ...s, reason: e.target.value }))}/>
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <Btn variant="ghost" size="sm" onClick={() => setShowWithdraw(false)}>Cancel</Btn>
            <Btn variant="primary" size="sm" onClick={handleWithdraw} disabled={saving}>
              {saving ? "Withdrawing..." : "Withdraw"}
            </Btn>
          </div>
        </div>
      </Modal>
    </div>
  );
}