// src/pages/BankAccountsPage.tsx
//
// Management page for bank_accounts — view, add, edit, deactivate. Built
// entirely on top of the existing lib/finance.ts functions (createBankAccount,
// updateBankAccount, deactivateBankAccount, fetchBankAccounts) confirmed
// this session to be fully implemented but never wired to any UI beyond
// two dropdown pickers (UploadStatementPage.tsx, FinanceTransactionsPage.tsx).
// None of those four functions are modified here — this is UI only.
//
// Reuses the shared AddBankAccountModal (components/AddBankAccountModal.tsx)
// for both Add and Edit, rather than a second, duplicate form — passing an
// `account` puts it in edit mode.

//
// Banking Step 1: each bank account is an account in the Chart of Accounts. "In your books" shows which one and its
// books balance (from what is recorded); "Bank statement" is the figure typed from the bank, for checking. A bank
// account not in the books yet gets "Create in chart" / "Link" buttons.

import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { fetchBankAccounts, deactivateBankAccount, updateBankAccount, fetchBankLedgerAccounts, createChartAccountForBank } from "../lib/finance";
import type { BankAccount, BankLedgerAccount } from "../lib/finance";
import { AddBankAccountModal } from "../components/AddBankAccountModal";
import { TransferMoneyModal } from "../components/TransferMoneyModal";
import { fetchRecentTransfers, undoTransfer, fetchOpeningBalances, setOpeningBalance, fetchMoneyAccounts, setMoneyAccount, fetchBooksSetup, fetchRevenueAccounts, setBooksStart, type TransferRow, type OpeningBalance, type MoneyAccount, type BooksSetup } from "../lib/banking";
import {
  PageHeader, Card, Badge, Btn, Table, Th, Tr, Td, Empty, Modal, Field, Input
} from "../components/ui";
import { Plus, Pencil, Ban, Landmark, RefreshCw, RotateCcw, Link2, BookPlus, ArrowLeftRight, Undo2, CalendarDays } from "lucide-react";

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency", currency: "JMD", maximumFractionDigits: 2
  }).format(n);
}

/** The message from a thrown Error or a Supabase error object. */
const errText = (e: unknown): string =>
  e && typeof e === "object" && "message" in e && typeof (e as { message: unknown }).message === "string" ? (e as { message: string }).message : "";

const ACCOUNT_TYPE_LABEL: Record<string, string> = {
  checking: "Checking", savings: "Savings",
  credit: "Credit Card", line_of_credit: "Line of Credit",
};

export default function BankAccountsPage() {
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showModal, setShowModal] = useState(false);
  const [editingAccount, setEditingAccount] = useState<BankAccount | null>(null);
  const [deactivatingId, setDeactivatingId] = useState<string | null>(null);
  const [reactivatingId, setReactivatingId] = useState<string | null>(null);
  const [ledger, setLedger] = useState<Map<string, BankLedgerAccount>>(new Map());
  const [creatingId, setCreatingId] = useState<string | null>(null);
  const [showTransfer, setShowTransfer] = useState(false);
  const [transfers, setTransfers] = useState<TransferRow[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [undoing, setUndoing] = useState<{ id: string; number: string; what: "transfer" | "opening balance" } | null>(null);
  const [openings, setOpenings] = useState<Map<string, OpeningBalance>>(new Map());
  const [opening, setOpening] = useState<BankAccount | null>(null);
  const [openForm, setOpenForm] = useState({ amount: "", date: "" });
  const [openBusy, setOpenBusy] = useState(false);
  const [moneyAccts, setMoneyAccts] = useState<MoneyAccount[]>([]);
  const [addMoneyId, setAddMoneyId] = useState("");
  const [books, setBooks] = useState<BooksSetup>({ startDate: null, revenueAccountId: null });
  const [booksOpen, setBooksOpen] = useState(false);
  const [booksForm, setBooksForm] = useState({ date: "", revenueId: "" });
  const [revenueAccts, setRevenueAccts] = useState<{ id: string; code: string; name: string }[]>([]);
  const [booksBusy, setBooksBusy] = useState(false);
  const [undoReason, setUndoReason] = useState("");
  const [undoBusy, setUndoBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      supabase.from("user_profiles").select("company_id").eq("id", user.id).maybeSingle()
        .then(({ data }) => { if (data?.company_id) setCompanyId(data.company_id); });
    });
  }, []);

  useEffect(() => { if (companyId) loadAccounts(); }, [companyId]); // eslint-disable-line react-hooks/exhaustive-deps -- loads once per company

  // fetchBankAccounts() itself has no is_active filter (confirmed reading
  // lib/finance.ts directly) — it returns every row for the company, so
  // both the active and inactive sections below come from this one fetch,
  // split client-side.
  async function loadAccounts() {
    if (!companyId) return;
    setLoading(true);
    setError(null);
    try {
      const [data, accts] = await Promise.all([fetchBankAccounts(companyId), fetchBankLedgerAccounts(companyId)]);
      setAccounts(data || []);
      setLedger(new Map(accts.map(a => [a.id, a])));
      setTransfers(await fetchRecentTransfers(companyId).catch(() => []));
      setOpenings(await fetchOpeningBalances(companyId).catch(() => new Map<string, OpeningBalance>()));
      setMoneyAccts(await fetchMoneyAccounts().catch(() => []));
      setBooks(await fetchBooksSetup(companyId));
    } catch (e: unknown) {
      setError(errText(e) || "Failed to load bank accounts");
    } finally {
      setLoading(false);
    }
  }

  function openAdd() {
    setEditingAccount(null);
    setShowModal(true);
  }

  function openEdit(account: BankAccount) {
    setEditingAccount(account);
    setShowModal(true);
  }

  // Soft-delete only — deactivateBankAccount() sets is_active: false, it
  // never removes the row. Confirmed before calling it, same as every
  // other destructive-ish action in this app (window.confirm(), matching
  // ExpensesPage.tsx's own deleteExpense() pattern).
  async function handleDeactivate(account: BankAccount) {
    if (!window.confirm(
      `Deactivate "${account.account_name}"? It will stop appearing in account pickers, but its history is kept — this does not delete it.`
    )) return;
    setDeactivatingId(account.id);
    setError(null);
    try {
      await deactivateBankAccount(account.id);
      await loadAccounts();
    } catch (e: unknown) {
      setError(errText(e) || "Failed to deactivate account");
    } finally {
      setDeactivatingId(null);
    }
  }

  // Reuses updateBankAccount() — no new backend function, same as
  // deactivate reuses deactivateBankAccount(). Same confirm-then-refresh
  // shape as handleDeactivate above.
  async function handleReactivate(account: BankAccount) {
    if (!window.confirm(`Reactivate "${account.account_name}"?`)) return;
    setReactivatingId(account.id);
    setError(null);
    try {
      await updateBankAccount(account.id, { is_active: true });
      await loadAccounts();
    } catch (e: unknown) {
      setError(errText(e) || "Failed to reactivate account");
    } finally {
      setReactivatingId(null);
    }
  }

  async function handleCreateInChart(account: BankAccount) {
    setCreatingId(account.id);
    setError(null);
    try {
      await createChartAccountForBank(account.id);
      await loadAccounts();
    } catch (e: unknown) {
      setError(errText(e) || "Failed to add it to the chart");
    } finally {
      setCreatingId(null);
    }
  }

  async function confirmUndo() {
    if (!undoing) return;
    setUndoBusy(true);
    setError(null);
    try {
      const n = await undoTransfer(undoing.id, undoReason.trim());
      setNotice(`${undoing.what === "transfer" ? "Transfer" : "Opening balance"} ${undoing.number} undone (reversing entry ${n}).`);
      setUndoing(null);
      setUndoReason("");
      await loadAccounts();
    } catch (e: unknown) {
      setError(errText(e) || "Could not undo the transfer");
    } finally {
      setUndoBusy(false);
    }
  }

  async function openBooks() {
    setBooksForm({ date: books.startDate || "", revenueId: books.revenueAccountId || "" });
    setBooksOpen(true);
    if (companyId) setRevenueAccts(await fetchRevenueAccounts(companyId).catch(() => []));
  }

  async function saveBooks() {
    setBooksBusy(true);
    setError(null);
    try {
      const r = await setBooksStart(booksForm.date, booksForm.revenueId || null);
      setNotice(r.openingInvoices > 0
        ? `Books start on ${booksForm.date}. ${r.openingInvoices} unpaid invoice(s) from before that date came in as opening receivables (${fmt(r.openingTotal)}).`
        : `Books start on ${booksForm.date}.`);
      setBooksOpen(false);
      await loadAccounts();
    } catch (e: unknown) {
      setError(errText(e) || "Could not save the books start date");
    } finally {
      setBooksBusy(false);
    }
  }

  function openOpening(a: BankAccount) {
    const d = new Date();
    setOpenForm({
      amount: a.current_balance ? String(a.current_balance) : "",
      date: books.startDate || `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
    });
    setOpening(a);
  }

  async function saveOpening() {
    if (!opening) return;
    setOpenBusy(true);
    setError(null);
    try {
      const n = await setOpeningBalance(opening.id, Number(openForm.amount), openForm.date);
      setNotice(`Opening balance for ${opening.account_name} is in the books (${n}).`);
      setOpening(null);
      await loadAccounts();
    } catch (e: unknown) {
      setError(errText(e) || "Could not save the opening balance");
    } finally {
      setOpenBusy(false);
    }
  }

  async function toggleMoney(id: string, on: boolean) {
    setError(null);
    try {
      await setMoneyAccount(id, on);
      setAddMoneyId("");
      await loadAccounts();
    } catch (e: unknown) {
      setError(errText(e) || "Could not change the account");
    }
  }

  const acctLabel = (id: string | null) => {
    const l = id ? ledger.get(id) : undefined;
    return l ? `${l.code} ${l.name}` : "—";
  };

  const activeAccounts = accounts.filter(a => a.is_active);
  const inactiveAccounts = accounts.filter(a => !a.is_active);

  function renderRow(a: BankAccount, inactive: boolean) {
    const dim = inactive ? "opacity-60" : undefined;
    return (
      <Tr key={a.id}>
        <Td className={dim}>
          <span className="font-medium text-slate-800 dark:text-slate-200">{a.account_name}</span>
          {a.is_primary && <Badge color="cyan">Primary</Badge>}
        </Td>
        <Td muted className={dim}>{ACCOUNT_TYPE_LABEL[a.account_type] || a.account_type}</Td>
        <Td muted className={dim}>{a.bank_name || "—"}</Td>
        <Td muted className={`font-mono text-[10px] ${dim || ""}`}>
          {a.account_number_last_4 ? `•••• ${a.account_number_last_4}` : "—"}
        </Td>
        <Td className={dim}>
          {(() => {
            const l = a.chart_account_id ? ledger.get(a.chart_account_id) : undefined;
            if (l) {
              return (
                <div>
                  <div className="text-xs text-slate-700 dark:text-slate-300">{l.code} - {l.name}</div>
                  <div className="text-[11px] font-semibold text-slate-800 dark:text-slate-200">{fmt(Number(l.current_balance ?? 0))}</div>
                  {(() => {
                    const ob = openings.get(a.id);
                    if (ob) {
                      return (
                        <div className="text-[10px] text-slate-500 mt-0.5">
                          Opening {fmt(ob.amount)} on {ob.date} ·{" "}
                          <button className="underline hover:text-slate-700 dark:hover:text-slate-300"
                            onClick={() => { setUndoReason(""); setUndoing({ id: ob.id, number: ob.number, what: "opening balance" }); }}>undo</button>
                        </div>
                      );
                    }
                    return !inactive && (
                      <button onClick={() => openOpening(a)}
                        className="mt-1 text-[10px] font-semibold text-cyan-700 dark:text-cyan-300 hover:underline">
                        Set opening balance
                      </button>
                    );
                  })()}
                </div>
              );
            }
            return (
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge color="amber">Not in your books</Badge>
                {!inactive && (
                  <>
                    <Btn size="sm" icon={<BookPlus size={12}/>} disabled={creatingId === a.id} onClick={() => handleCreateInChart(a)}>
                      {creatingId === a.id ? "Adding..." : "Create in chart"}
                    </Btn>
                    <Btn size="sm" variant="ghost" icon={<Link2 size={12}/>} onClick={() => openEdit(a)}>Link</Btn>
                  </>
                )}
              </div>
            );
          })()}
        </Td>
        <Td right muted className={dim}>{fmt(a.current_balance)}</Td>
        <Td className={dim}>
          <Badge color={inactive ? "slate" : "green"} dot>{inactive ? "Inactive" : "Active"}</Badge>
        </Td>
        <Td>
          <div className="flex items-center gap-1">
            <button onClick={() => openEdit(a)} title="Edit"
              className="p-1 rounded hover:bg-slate-100 dark:hover:bg-white/[0.06] text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors">
              <Pencil size={12}/>
            </button>
            {!inactive && (
              <button onClick={() => handleDeactivate(a)} title="Deactivate"
                disabled={deactivatingId === a.id}
                className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-500/10 text-slate-400 hover:text-red-500 transition-colors disabled:opacity-50">
                <Ban size={12}/>
              </button>
            )}
            {inactive && (
              <button onClick={() => handleReactivate(a)} title="Reactivate"
                disabled={reactivatingId === a.id}
                className="p-1 rounded hover:bg-emerald-50 dark:hover:bg-emerald-500/10 text-slate-400 hover:text-emerald-500 transition-colors disabled:opacity-50">
                <RotateCcw size={12}/>
              </button>
            )}
          </div>
        </Td>
      </Tr>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#080b10]">
      <PageHeader
        title="Bank Accounts"
        subtitle="Each bank account is an account in your Chart of Accounts. Its books balance comes from what you record."
        actions={
          <>
            <Btn variant="ghost" size="sm" icon={<RefreshCw size={13} className={loading ? "animate-spin" : ""}/>} onClick={loadAccounts}/>
            <Btn size="sm" icon={<ArrowLeftRight size={13}/>} onClick={() => setShowTransfer(true)}>Transfer money</Btn>
            <Btn variant="primary" size="sm" icon={<Plus size={13}/>} onClick={openAdd}>Add Bank Account</Btn>
          </>
        }
      />

      <div className="p-6 space-y-5">
        {error && (
          <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</div>
        )}
        {notice && (
          <div className="flex items-start justify-between gap-3 text-xs text-emerald-700 dark:text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2">
            <span>{notice}</span>
            <button onClick={() => setNotice(null)} className="text-emerald-600 hover:text-emerald-800" aria-label="Close">✕</button>
          </div>
        )}

        {!loading && (
          <Card>
            <div className="flex flex-wrap items-center gap-3">
              <CalendarDays size={18} className={books.startDate ? "text-cyan-600" : "text-amber-500"}/>
              <div className="flex-1 min-w-[220px]">
                <div className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                  Books start date: {books.startDate ? books.startDate : <span className="text-amber-600">not set</span>}
                </div>
                <div className="text-[11px] text-slate-500">
                  {books.startDate
                    ? "Issued invoices from this date go into your books automatically. Unpaid older invoices came in as opening receivables."
                    : "Choose the day your books start in Magnus. From then on, issued invoices go into the books automatically."}
                </div>
              </div>
              <Btn size="sm" variant={books.startDate ? "secondary" : "primary"} onClick={() => { void openBooks(); }}>
                {books.startDate ? "Change" : "Set start date"}
              </Btn>
            </div>
          </Card>
        )}

        <Card padding={false}>
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-white/[0.06]">
            <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">Active Accounts</span>
            <span className="text-xs text-slate-600">{activeAccounts.length}</span>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12 text-xs text-slate-600">
              <RefreshCw size={14} className="animate-spin mr-2"/> Loading...
            </div>
          ) : activeAccounts.length === 0 ? (
            <Empty icon={<Landmark size={18}/>} title="No bank accounts yet"
              body="Add one to start uploading statements and tracking transfers against it."
              action={<Btn variant="primary" size="sm" onClick={openAdd}>Add Bank Account</Btn>}/>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Account</Th>
                  <Th>Type</Th>
                  <Th>Bank</Th>
                  <Th>Last 4</Th>
                  <Th>In your books</Th>
                  <Th right>Bank statement</Th>
                  <Th>Status</Th>
                  <Th>Actions</Th>
                </tr>
              </thead>
              <tbody>
                {activeAccounts.map(a => renderRow(a, false))}
              </tbody>
            </Table>
          )}
        </Card>

        {/* Kept visible rather than hidden — deactivateBankAccount() is a
            soft-delete only (is_active: false), and hiding these entirely
            would lose visibility into real historical accounts. Only
            rendered when at least one exists, so a fresh company with no
            deactivated accounts doesn't see an empty "Inactive" card. */}
        {!loading && inactiveAccounts.length > 0 && (
          <Card padding={false}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-white/[0.06]">
              <span className="text-sm font-semibold text-slate-600 dark:text-slate-400">Inactive Accounts</span>
              <span className="text-xs text-slate-600">{inactiveAccounts.length}</span>
            </div>
            <Table>
              <thead>
                <tr>
                  <Th>Account</Th>
                  <Th>Type</Th>
                  <Th>Bank</Th>
                  <Th>Last 4</Th>
                  <Th>In your books</Th>
                  <Th right>Bank statement</Th>
                  <Th>Status</Th>
                  <Th>Actions</Th>
                </tr>
              </thead>
              <tbody>
                {inactiveAccounts.map(a => renderRow(a, true))}
              </tbody>
            </Table>
          </Card>
        )}
        {!loading && (() => {
          // Cash, petty cash and fund accounts: money accounts that are not a bank account above.
          const funds = moneyAccts.filter(m => !m.isBank && m.type === "asset");
          const moneyIds = new Set(moneyAccts.map(m => m.id));
          const parentIds = new Set([...ledger.values()].map(l => l.parent_id).filter(Boolean));
          const candidates = [...ledger.values()]
            .filter(l => l.type === "asset" && l.is_active !== false && !moneyIds.has(l.id) && !parentIds.has(l.id)
              && !/(receivable|inventory|prepaid|deposit paid|retainage|advance tax|input credit)/i.test(l.name))
            .sort((a, b) => a.code.localeCompare(b.code));
          return (
            <Card padding={false}>
              <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-slate-200 dark:border-white/[0.06]">
                <div>
                  <div className="text-sm font-semibold text-slate-800 dark:text-slate-200">Cash, petty cash and fund accounts</div>
                  <div className="text-[11px] text-slate-500">Money held outside the bank, e.g. petty cash or a job fund for a partner or supervisor. They can be used in transfers and "Paid from".</div>
                </div>
                <div className="flex items-center gap-2">
                  <select value={addMoneyId} onChange={e => setAddMoneyId(e.target.value)}
                    className="text-xs rounded-lg border border-slate-300 dark:border-white/[0.08] bg-white dark:bg-white/[0.04] px-2 py-1.5 text-slate-700 dark:text-slate-300 max-w-[240px]">
                    <option value="">Add an account from your chart…</option>
                    {candidates.map(c => <option key={c.id} value={c.id}>{c.code} - {c.name}</option>)}
                  </select>
                  <Btn size="sm" disabled={!addMoneyId} onClick={() => { void toggleMoney(addMoneyId, true); }}>Add</Btn>
                </div>
              </div>
              {funds.length === 0 ? (
                <div className="px-4 py-5 text-xs text-slate-500">None yet. Add your petty cash or a job fund from your chart above.</div>
              ) : (
                <Table>
                  <thead><tr><Th>Account</Th><Th right>In your books</Th><Th>{""}</Th></tr></thead>
                  <tbody>
                    {funds.map(f => (
                      <Tr key={f.id}>
                        <Td><span className="text-slate-800 dark:text-slate-200">{f.code} - {f.name}</span></Td>
                        <Td right><span className="font-semibold text-slate-800 dark:text-slate-200">{fmt(f.current_balance)}</span></Td>
                        <Td>
                          {ledger.get(f.id)?.subtype === "bank" && (
                            <button onClick={() => { void toggleMoney(f.id, false); }} title="Stop using it as a money account"
                              className="text-[11px] text-slate-400 hover:text-red-500">Remove</button>
                          )}
                        </Td>
                      </Tr>
                    ))}
                  </tbody>
                </Table>
              )}
            </Card>
          );
        })()}

        {!loading && (
          <Card padding={false}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-white/[0.06]">
              <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">Recent transfers</span>
              <Btn size="sm" variant="ghost" icon={<ArrowLeftRight size={12}/>} onClick={() => setShowTransfer(true)}>Transfer money</Btn>
            </div>
            {transfers.length === 0 ? (
              <div className="px-4 py-6 text-xs text-slate-500">No transfers yet. Use "Transfer money" to move money between your bank, cash and fund accounts.</div>
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>Date</Th>
                    <Th>From</Th>
                    <Th>To</Th>
                    <Th right>Amount</Th>
                    <Th>Note</Th>
                    <Th>Entry</Th>
                    <Th>{""}</Th>
                  </tr>
                </thead>
                <tbody>
                  {transfers.map(t => (
                    <Tr key={t.id}>
                      <Td muted className={t.status === "voided" ? "line-through opacity-60" : undefined}>{t.date}</Td>
                      <Td className={t.status === "voided" ? "line-through opacity-60" : undefined}>{acctLabel(t.fromId)}</Td>
                      <Td className={t.status === "voided" ? "line-through opacity-60" : undefined}>{acctLabel(t.toId)}</Td>
                      <Td right className={t.status === "voided" ? "line-through opacity-60" : undefined}>
                        <span className="font-semibold text-slate-800 dark:text-slate-200">{fmt(t.amount)}</span>
                      </Td>
                      <Td muted className="max-w-[220px] truncate">{t.note || ""}</Td>
                      <Td muted className="font-mono text-[10px]">{t.number}</Td>
                      <Td>
                        {t.status === "voided"
                          ? <Badge color="slate">Undone</Badge>
                          : t.status === "posted" && (
                            <Btn size="sm" variant="ghost" icon={<Undo2 size={12}/>} onClick={() => { setUndoReason(""); setUndoing({ id: t.id, number: t.number, what: "transfer" }); }}>Undo</Btn>
                          )}
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>
        )}
      </div>

      <TransferMoneyModal open={showTransfer} onClose={() => setShowTransfer(false)} companyId={companyId}
        onDone={(m) => { setNotice(m); void loadAccounts(); }} />

      <Modal open={!!undoing} onClose={() => { if (!undoBusy) setUndoing(null); }} title={`Undo ${undoing?.what ?? ""} ${undoing?.number ?? ""}?`}
        subtitle="It is reversed with a new entry. The original stays in the books, marked undone.">
        <div className="space-y-3">
          <Field label="Why are you undoing it?">
            <Input value={undoReason} onChange={e => setUndoReason(e.target.value)} placeholder="e.g. wrong amount" autoFocus/>
          </Field>
          <div className="flex justify-end gap-2">
            <Btn variant="ghost" size="sm" onClick={() => setUndoing(null)} disabled={undoBusy}>Cancel</Btn>
            <Btn variant="danger" size="sm" onClick={() => { void confirmUndo(); }} disabled={undoBusy || undoReason.trim().length < 3}>
              {undoBusy ? "Undoing..." : `Undo ${undoing?.what ?? ""}`}
            </Btn>
          </div>
        </div>
      </Modal>

      <Modal open={!!opening} onClose={() => { if (!openBusy) setOpening(null); }} title={`Opening balance: ${opening?.account_name ?? ""}`}
        subtitle="The standard first step for a bank account in your books: what the bank statement said on the day your books start.">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Books start on">
              <Input type="date" value={openForm.date} onChange={e => setOpenForm(f => ({ ...f, date: e.target.value }))}/>
            </Field>
            <Field label="Balance on that day (J$)">
              <Input type="number" inputMode="decimal" step="0.01" value={openForm.amount}
                onChange={e => setOpenForm(f => ({ ...f, amount: e.target.value }))}/>
            </Field>
          </div>
          <p className="text-[11px] text-slate-500">
            {opening && (opening.account_type === "credit" || opening.account_type === "line_of_credit")
              ? "For a credit card or line of credit, type what you OWED on that day. "
              : "Type a minus amount if the account was overdrawn. "}
            Everything after this date is recorded in Magnus (transfers, payments, expenses). It goes against "Opening Balance Equity" in your chart, which Magnus adds if you don't have it.
          </p>
          <div className="flex justify-end gap-2">
            <Btn variant="ghost" size="sm" onClick={() => setOpening(null)} disabled={openBusy}>Cancel</Btn>
            <Btn variant="primary" size="sm" onClick={() => { void saveOpening(); }} disabled={openBusy || !openForm.date || !Number(openForm.amount)}>
              {openBusy ? "Saving..." : "Save opening balance"}
            </Btn>
          </div>
        </div>
      </Modal>

      <Modal open={booksOpen} onClose={() => { if (!booksBusy) setBooksOpen(false); }} title="Books start date"
        subtitle="The day your books start in Magnus. Nothing older is re-entered.">
        <div className="space-y-3">
          <Field label="Books start on">
            <Input type="date" value={booksForm.date} onChange={e => setBooksForm(f => ({ ...f, date: e.target.value }))}/>
          </Field>
          <Field label="Invoices go to this revenue account" hint="You can still choose another one on a single invoice later.">
            <select value={booksForm.revenueId} onChange={e => setBooksForm(f => ({ ...f, revenueId: e.target.value }))}
              className="w-full text-sm rounded-lg border border-slate-300 dark:border-white/[0.08] bg-white dark:bg-white/[0.04] px-3 py-2 text-slate-900 dark:text-slate-200">
              <option value="">The first revenue account in my chart</option>
              {revenueAccts.map(r => <option key={r.id} value={r.id}>{r.code} - {r.name}</option>)}
            </select>
          </Field>
          <ul className="text-[11px] text-slate-500 list-disc pl-4 space-y-1">
            <li>Use the date of a bank statement you have, e.g. the last day of last month. Set each bank's opening balance on the same date.</li>
            <li>Invoices you issue (sent) on or after this date go into the books: client owes you, income earned, GCT payable.</li>
            <li>Invoices from before this date that were still unpaid on that day come in once, as opening receivables.</li>
            <li>The date can be changed until invoices after it are in the books.</li>
          </ul>
          <div className="flex justify-end gap-2">
            <Btn variant="ghost" size="sm" onClick={() => setBooksOpen(false)} disabled={booksBusy}>Cancel</Btn>
            <Btn variant="primary" size="sm" onClick={() => { void saveBooks(); }} disabled={booksBusy || !booksForm.date}>
              {booksBusy ? "Saving..." : "Save"}
            </Btn>
          </div>
        </div>
      </Modal>

      <AddBankAccountModal
        open={showModal}
        onClose={() => setShowModal(false)}
        account={editingAccount}
        onCreated={() => loadAccounts()}
        onUpdated={() => loadAccounts()}
      />
    </div>
  );
}
