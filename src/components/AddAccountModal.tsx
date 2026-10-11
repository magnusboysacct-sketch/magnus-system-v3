// src/components/AddAccountModal.tsx
//
// "Add Account" for the Chart of Accounts tab (chart_of_accounts). Same shape as AddBankAccountModal.tsx, which is a different
// thing: that one writes bank_accounts rows. The form rules (code ranges, subtypes, parent/level, validation) live in
// src/lib/chartOfAccountsForm.ts.
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { createChartOfAccount } from "../lib/accounting";
import type { AccountSubtype, AccountType, ChartOfAccount } from "../lib/accounting";
import {
  ACCOUNT_TYPES, SUBTYPES_BY_TYPE, subtypeLabel, suggestNextCode, eligibleParents, checkAccountForm, parseOpeningBalance,
  blankAccountForm, CODE_MAX_LENGTH, NAME_MAX_LENGTH,
} from "../lib/chartOfAccountsForm";
import type { AccountFormValues, AccountLike } from "../lib/chartOfAccountsForm";
import { Modal, Field, Input, Select, Textarea, Btn } from "../components/ui";

export interface AddAccountModalProps {
  open: boolean;
  onClose: () => void;
  // Fires with the new row after a successful save, so the page can reload its list.
  onCreated?: (account: ChartOfAccount) => void;
  // The accounts the page already shows (used for the parent picker, the next-code suggestion and the duplicate check).
  accounts: AccountLike[];
  companyId: string | null;
}

export function AddAccountModal({ open, onClose, onCreated, accounts, companyId }: AddAccountModalProps) {
  const [form, setForm] = useState<AccountFormValues>(blankAccountForm);
  const [codeTouched, setCodeTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  useEffect(() => {
    if (!open) return;
    setForm(blankAccountForm); setCodeTouched(false); setErrors([]);
  }, [open]);

  const type = form.type;
  const parents = useMemo(() => eligibleParents(accounts, type), [accounts, type]);
  const parent = form.parentId ? accounts.find((a) => a.id === form.parentId) ?? null : null;
  const suggestion = type ? suggestNextCode(type, accounts.map((a) => a.code), parent?.code) : "";
  const check = useMemo(() => checkAccountForm(form, accounts), [form, accounts]);
  const canLink = type === "revenue" || type === "expense";

  // Until the user types their own code, keep it filled with the next free one for the chosen type/parent.
  useEffect(() => {
    if (!open || codeTouched) return;
    setForm((f) => (f.code === suggestion ? f : { ...f, code: suggestion }));
  }, [open, codeTouched, suggestion]);

  function changeType(next: AccountType | "") {
    setForm((f) => ({
      ...f,
      type: next,
      subtype: next && SUBTYPES_BY_TYPE[next].includes(f.subtype as AccountSubtype) ? f.subtype : "",
      parentId: "", // parents are same-type only
      isProjectLinkable: next === "revenue" || next === "expense" ? f.isProjectLinkable : false,
    }));
  }

  function handleClose() {
    if (saving) return; // don't let the modal close mid-save
    onClose();
  }

  async function handleSave() {
    setErrors([]);
    if (!companyId) { setErrors(["Your company could not be determined. Reload the page and try again."]); return; }
    const result = checkAccountForm(form, accounts);
    if (result.errors.length > 0) { setErrors(result.errors); return; }
    setSaving(true);
    try {
      const code = form.code.trim();
      // The page only lists ACTIVE accounts, but a code is unique across all of them: ask the database too.
      const { data: existing, error: lookupError } = await supabase
        .from("chart_of_accounts").select("id, name, is_active").eq("company_id", companyId).eq("code", code).maybeSingle();
      if (lookupError) throw lookupError;
      if (existing) {
        setErrors([`Code ${code} is already used by "${existing.name}"${existing.is_active === false ? " (an inactive account)" : ""}. Choose a different code.`]);
        return;
      }
      const created = await createChartOfAccount({
        company_id: companyId,
        code,
        name: form.name.trim(),
        type: form.type as AccountType,
        subtype: (form.subtype || undefined) as AccountSubtype | undefined,
        parent_id: result.parent?.id,
        level: result.level,
        is_project_linkable: canLink && form.isProjectLinkable,
        is_owner_private: false,
        opening_balance: parseOpeningBalance(form.openingBalance) ?? 0,
        description: form.description.trim() || undefined,
      });
      onCreated?.(created);
      onClose();
    } catch (e: any) {
      const message = String(e?.message ?? "");
      setErrors([e?.code === "23505" || /duplicate key|unique/i.test(message)
        ? `That account code is already in use. Choose a different code.`
        : message || "Failed to create the account."]);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={handleClose} title="Add Account" subtitle="Add an account to your Chart of Accounts">
      <div className="space-y-3">
        {errors.length > 0 && (
          <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 space-y-0.5">
            {errors.map((m, i) => <div key={i}>{m}</div>)}
          </div>
        )}
        <Field label="Account Type">
          <Select value={form.type} onChange={(e) => changeType(e.target.value as AccountType | "")}>
            <option value="">Choose a type…</option>
            {ACCOUNT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </Select>
        </Field>
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-1">
            <Field label="Code" hint={suggestion && form.code !== suggestion ? `Next free: ${suggestion}` : "Digits only"}>
              <Input inputMode="numeric" maxLength={CODE_MAX_LENGTH} placeholder="e.g. 1010" value={form.code}
                onChange={(e) => { setCodeTouched(true); setForm((f) => ({ ...f, code: e.target.value.replace(/\D/g, "") })); }}/>
            </Field>
          </div>
          <div className="col-span-2">
            <Field label="Account Name">
              <Input placeholder="e.g. Operating Bank Account" maxLength={NAME_MAX_LENGTH} value={form.name} autoFocus
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}/>
            </Field>
          </div>
        </div>
        <Field label="Subtype (optional)">
          <Select value={form.subtype} disabled={!type} onChange={(e) => setForm((f) => ({ ...f, subtype: e.target.value }))}>
            <option value="">{type ? "None" : "Choose a type first"}</option>
            {type && SUBTYPES_BY_TYPE[type].map((s) => <option key={s} value={s}>{subtypeLabel(s)}</option>)}
          </Select>
        </Field>
        <Field label="Parent Account (optional)" hint={type ? "Only accounts of the same type can be a parent." : undefined}>
          <Select value={form.parentId} disabled={!type} onChange={(e) => setForm((f) => ({ ...f, parentId: e.target.value }))}>
            <option value="">{type ? "None (top level)" : "Choose a type first"}</option>
            {parents.map((p) => <option key={p.id} value={p.id}>{p.code} - {p.name}</option>)}
          </Select>
        </Field>
        {canLink && (
          <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400 cursor-pointer">
            <input type="checkbox" checked={form.isProjectLinkable} onChange={(e) => setForm((f) => ({ ...f, isProjectLinkable: e.target.checked }))}/>
            Project linkable (can be assigned to a project)
          </label>
        )}
        <Field label="Opening Balance" hint="Saved on the account only: it is not posted to the ledger, so it won't change any balance or report. To start an account with a balance, record an opening-balance journal entry.">
          <Input type="number" step="0.01" placeholder="0.00" value={form.openingBalance}
            onChange={(e) => setForm((f) => ({ ...f, openingBalance: e.target.value }))}/>
        </Field>
        <Field label="Description (optional)">
          <Textarea rows={2} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}/>
        </Field>
        {check.warnings.length > 0 && (
          <div className="text-[11px] text-amber-500 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2 space-y-0.5">
            {check.warnings.map((m, i) => <div key={i}>{m}</div>)}
          </div>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <Btn variant="ghost" size="sm" onClick={handleClose}>Cancel</Btn>
          <Btn variant="primary" size="sm" onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Add Account"}
          </Btn>
        </div>
      </div>
    </Modal>
  );
}
