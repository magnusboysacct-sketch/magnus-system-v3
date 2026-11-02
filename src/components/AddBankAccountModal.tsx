// src/components/AddBankAccountModal.tsx
//
// Shared "Add Bank Account" form — extracted out of CashFlowPage.tsx,
// which had this exact form/logic inline (showAddAccount/newAccount/
// handleAddAccount local state) but, as of a few sessions ago, no button
// left anywhere that opened it (the Accounts tab there now shows real
// chart_of_accounts data instead — see that file's own comments). The
// underlying createBankAccount() call and the fields it needs were never
// touched; this is a lift-and-reuse, not a rewrite.
//
// Used by UploadStatementPage.tsx (a real trigger — its account picker
// sources from bank_accounts, which was empty with no way to populate it)
// and by CashFlowPage.tsx (kept mounted so its own showAddAccount state
// still does something meaningful if ever flipped true again, but
// deliberately given no trigger button there — that removal was
// intentional, see CashFlowPage.tsx's own comments, and is NOT reversed
// here).
//
// Extended to also support EDIT mode (pass an `account`), used by the new
// BankAccountsPage.tsx — an optional prop, so both existing callers above
// (which never pass `account`) keep behaving exactly as before, still
// always in create mode.

//
// Banking Step 1: every bank account is an account in the Chart of Accounts. "In your books" picks which one:
// a new account created automatically (the default), or an existing bank / cash account that isn't linked yet
// (e.g. 1710 Current Account JMD). Credit cards and lines of credit link to liability accounts. The balance typed
// here is the BANK's figure (for checking against the books later); the books balance comes from what is recorded.

import { useEffect, useState } from "react";
import { createBankAccount, updateBankAccount, fetchBankLedgerAccounts } from "../lib/finance";
import type { BankAccount, BankLedgerAccount } from "../lib/finance";
import { supabase } from "../lib/supabase";
import { Modal, Field, Input, Select, Btn } from "../components/ui";

/** The message from a thrown Error or a Supabase error object. */
const errText = (e: unknown): string =>
  e && typeof e === "object" && "message" in e && typeof (e as { message: unknown }).message === "string" ? (e as { message: string }).message : "";

const ledgerTypeFor = (t: BankAccount["account_type"]) => (t === "credit" || t === "line_of_credit" ? "liability" : "asset");

const blankForm = {
  account_name: "",
  account_type: "checking" as BankAccount["account_type"],
  bank_name: "",
  account_number_last_4: "",
  current_balance: "",
  chart_account_id: "",
};

export interface AddBankAccountModalProps {
  open: boolean;
  onClose: () => void;
  // Fires with the newly-created row after a successful save, so callers
  // can refresh their own account list / auto-select the new account
  // without a page reload. Not required — CashFlowPage.tsx's own re-fetch
  // (loadData()) doesn't need it, since it just reloads everything.
  onCreated?: (account: BankAccount) => void;
  // Edit-mode counterpart to onCreated, fired after a successful update.
  onUpdated?: (account: BankAccount) => void;
  // When set, the modal opens pre-filled with this account's values and
  // saves via updateBankAccount() instead of createBankAccount(). Omit
  // (or pass null/undefined) for the original create-mode behavior.
  account?: BankAccount | null;
}

export function AddBankAccountModal({ open, onClose, onCreated, onUpdated, account }: AddBankAccountModalProps) {
  const [form, setForm] = useState(blankForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isEdit = !!account;
  const [ledger, setLedger] = useState<BankLedgerAccount[]>([]);
  const [linkedIds, setLinkedIds] = useState<Set<string>>(new Set());

  // The chart accounts that can be picked, and which are already linked to another bank account.
  useEffect(() => {
    if (!open) return;
    let alive = true;
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        const { data: profile } = await supabase.from("user_profiles").select("company_id").eq("id", user?.id ?? "").maybeSingle();
        if (!profile?.company_id) return;
        const [accts, banks] = await Promise.all([
          fetchBankLedgerAccounts(profile.company_id),
          supabase.from("bank_accounts").select("id, chart_account_id").eq("company_id", profile.company_id),
        ]);
        if (!alive) return;
        setLedger(accts);
        setLinkedIds(new Set((banks.data || [])
          .filter((b: { id: string; chart_account_id: string | null }) => b.chart_account_id && b.id !== account?.id)
          .map((b: { chart_account_id: string | null }) => b.chart_account_id as string)));
      } catch { /* the list just stays empty: "create new" still works */ }
    })();
    return () => { alive = false; };
  }, [open, account]);

  // Re-initialize the form every time the modal opens — from the target
  // account's current values in edit mode, or blank in create mode. Keyed
  // on [open, account] rather than just mount, since a single modal
  // instance in BankAccountsPage.tsx gets reused across "Add" and every
  // row's "Edit" click, each needing fresh values, not whatever was left
  // over from the previous open.
  useEffect(() => {
    if (!open) return;
    if (account) {
      setForm({
        account_name: account.account_name,
        account_type: account.account_type,
        bank_name: account.bank_name || "",
        account_number_last_4: account.account_number_last_4 || "",
        current_balance: String(account.current_balance ?? ""),
        chart_account_id: account.chart_account_id || "",
      });
    } else {
      setForm(blankForm);
    }
    setError(null);
  }, [open, account]);

  function handleClose() {
    if (saving) return; // don't let the modal close mid-save
    onClose();
  }

  async function handleSave() {
    setError(null);
    if (!form.account_name.trim()) {
      setError("Account name is required");
      return;
    }
    setSaving(true);
    try {
      const balance = parseFloat(form.current_balance) || 0;
      if (account) {
        // Only the fields this form actually shows — deliberately NOT
        // also touching available_balance the way create does (that
        // pairing only makes sense at creation time, when there's no
        // real available_balance yet; silently overwriting it on every
        // edit would clobber a value the user never saw or intended to
        // change).
        const updated = await updateBankAccount(account.id, {
          account_name: form.account_name.trim(),
          account_type: form.account_type,
          bank_name: form.bank_name.trim() || null,
          account_number_last_4: form.account_number_last_4.trim() || null,
          current_balance: balance,
          // Leaving "create new" on an unlinked account keeps it unlinked here; the page's "Create in chart" button does that.
          ...(form.chart_account_id ? { chart_account_id: form.chart_account_id } : {}),
        });
        onUpdated?.(updated);
      } else {
        const created = await createBankAccount({
          account_name: form.account_name.trim(),
          account_type: form.account_type,
          bank_name: form.bank_name.trim() || undefined,
          account_number_last_4: form.account_number_last_4.trim() || undefined,
          current_balance: balance,
          available_balance: balance,
          chart_account_id: form.chart_account_id || null,
        });
        onCreated?.(created);
      }
      onClose();
    } catch (e: unknown) {
      setError(errText(e) || `Failed to ${isEdit ? "update" : "create"} account`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={handleClose}
      title={isEdit ? "Edit Bank Account" : "Add Bank Account"}
      subtitle={isEdit ? "Update this account's details" : "Create a new bank account or credit card to track"}>
      <div className="space-y-3">
        {error && <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</div>}
        <Field label="Account Name">
          <Input placeholder="e.g. NCB Business Checking" value={form.account_name}
            onChange={e => setForm(s => ({ ...s, account_name: e.target.value }))} autoFocus/>
        </Field>
        <Field label="Account Type">
          <Select value={form.account_type} onChange={e => setForm(s => ({ ...s, account_type: e.target.value as BankAccount["account_type"] }))}>
            <option value="checking">Checking</option>
            <option value="savings">Savings</option>
            <option value="credit">Credit Card</option>
            <option value="line_of_credit">Line of Credit</option>
          </Select>
        </Field>
        <Field label="Bank / Institution (optional)">
          <Input placeholder="e.g. NCB, Scotiabank, JN Bank" value={form.bank_name}
            onChange={e => setForm(s => ({ ...s, bank_name: e.target.value }))}/>
        </Field>
        <Field label="Last 4 Digits (optional)">
          <Input placeholder="e.g. 4821" maxLength={4} value={form.account_number_last_4}
            onChange={e => setForm(s => ({ ...s, account_number_last_4: e.target.value.replace(/\D/g, "") }))}/>
        </Field>
        {(() => {
          const kind = ledgerTypeFor(form.account_type);
          const options = ledger.filter(a => a.type === kind && (a.is_active !== false) && (!linkedIds.has(a.id) || a.id === form.chart_account_id));
          return (
            <Field label="In your books (Chart of Accounts)"
              hint={kind === "asset"
                ? "Pick the bank account that is already in your chart, or let Magnus add a new one. This is what you choose in \"Paid from\" and transfers."
                : "Credit cards and lines of credit are money owed, so they are liability accounts in your chart."}>
              <Select value={form.chart_account_id} onChange={e => setForm(s => ({ ...s, chart_account_id: e.target.value }))}>
                <option value="">{isEdit && account?.chart_account_id ? "(keep as it is)" : "Add a new account to my chart (recommended)"}</option>
                {options.map(a => <option key={a.id} value={a.id}>{a.code} - {a.name}</option>)}
              </Select>
            </Field>
          );
        })()}
        <Field label="Balance on the bank statement (optional)"
          hint="What the bank says today. It is only used to check your books against the bank; your books balance comes from what you record.">
          <Input type="number" placeholder="0.00" value={form.current_balance}
            onChange={e => setForm(s => ({ ...s, current_balance: e.target.value }))}/>
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <Btn variant="ghost" size="sm" onClick={handleClose}>Cancel</Btn>
          <Btn variant="primary" size="sm" onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : isEdit ? "Save Changes" : "Add Account"}
          </Btn>
        </div>
      </div>
    </Modal>
  );
}
