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
import {
  PageHeader, Card, Badge, Btn, Table, Th, Tr, Td, Empty
} from "../components/ui";
import { Plus, Pencil, Ban, Landmark, RefreshCw, RotateCcw, Link2, BookPlus } from "lucide-react";

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
            <Btn variant="primary" size="sm" icon={<Plus size={13}/>} onClick={openAdd}>Add Bank Account</Btn>
          </>
        }
      />

      <div className="p-6 space-y-5">
        {error && (
          <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</div>
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
      </div>

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
