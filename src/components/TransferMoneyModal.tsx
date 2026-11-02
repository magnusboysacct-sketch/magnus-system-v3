// src/components/TransferMoneyModal.tsx — Banking Step 2: "Transfer money" between bank, cash and fund accounts
// (e.g. bank -> a partner's job fund, bank -> petty cash, savings -> current, bank -> credit card). It saves ONE posted
// journal entry through money_transfer() (DEBIT "To", CREDIT "From"); balances update straight away.

import { useEffect, useMemo, useState } from "react";
import { ArrowDown } from "lucide-react";
import { Modal, Field, Input, Select, Btn, Textarea } from "./ui";
import { supabase } from "../lib/supabase";
import { fetchMoneyAccounts, looksForeign, transferMoney, type MoneyAccount } from "../lib/banking";

const jmd = (n: number) => `${n < 0 ? "-" : ""}J$${Math.abs(n).toLocaleString("en-JM", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

function AccountOptions({ accounts, exclude }: { accounts: MoneyAccount[]; exclude?: string }) {
  const list = accounts.filter((a) => a.id !== exclude);
  const groups: [string, MoneyAccount[]][] = [
    ["Bank accounts", list.filter((a) => a.isBank && a.type === "asset")],
    ["Cash, petty cash and funds", list.filter((a) => !a.isBank && a.type === "asset")],
    ["Credit cards and lines of credit", list.filter((a) => a.type === "liability")],
  ];
  return (
    <>
      {groups.filter(([, g]) => g.length > 0).map(([label, g]) => (
        <optgroup key={label} label={label}>
          {g.map((a) => (
            <option key={a.id} value={a.id}>
              {a.code} - {a.name} ({a.type === "liability" ? "owed " : ""}{jmd(a.current_balance)})
            </option>
          ))}
        </optgroup>
      ))}
    </>
  );
}

export function TransferMoneyModal({ open, onClose, companyId, onDone }: {
  open: boolean;
  onClose: () => void;
  companyId: string | null;
  onDone: (message: string) => void;
}) {
  const [accounts, setAccounts] = useState<MoneyAccount[]>([]);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [form, setForm] = useState({ fromId: "", toId: "", amount: "", date: today(), note: "", projectId: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !companyId) return;
    let alive = true;
    setForm({ fromId: "", toId: "", amount: "", date: today(), note: "", projectId: "" });
    setError(null);
    Promise.all([
      fetchMoneyAccounts(companyId),
      supabase.from("projects").select("id, name, status").eq("company_id", companyId).order("name"),
    ]).then(([accts, pr]) => {
      if (!alive) return;
      setAccounts(accts);
      setProjects(((pr.data || []) as { id: string; name: string; status: string }[]).filter((p) => p.status !== "cancelled"));
    }).catch((e: unknown) => { if (alive) setError(e instanceof Error ? e.message : "Could not load your accounts."); });
    return () => { alive = false; };
  }, [open, companyId]);

  const from = useMemo(() => accounts.find((a) => a.id === form.fromId), [accounts, form.fromId]);
  const to = useMemo(() => accounts.find((a) => a.id === form.toId), [accounts, form.toId]);
  const amount = Number(form.amount);
  const foreign = [from, to].find((a) => a && looksForeign(a.name));
  const short = from && from.type === "asset" && amount > from.current_balance;

  async function save() {
    setError(null);
    if (!form.fromId || !form.toId) { setError("Choose where the money comes from and where it goes."); return; }
    if (!(amount > 0)) { setError("Type an amount above zero."); return; }
    setSaving(true);
    try {
      const number = await transferMoney({
        fromId: form.fromId, toId: form.toId, amount, date: form.date, note: form.note.trim(), projectId: form.projectId || null,
      });
      onDone(`Moved ${jmd(amount)} from ${from?.code} ${from?.name} to ${to?.code} ${to?.name} (${number}).`);
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "The transfer was not saved.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={() => { if (!saving) onClose(); }} title="Transfer money"
      subtitle="Move money between your bank, cash and fund accounts. It goes in the books straight away.">
      <div className="space-y-3">
        {error && <div className="text-xs text-red-500 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</div>}
        <Field label="From (where the money comes out)">
          <Select value={form.fromId} onChange={(e) => setForm((f) => ({ ...f, fromId: e.target.value }))}>
            <option value="">Choose an account</option>
            <AccountOptions accounts={accounts} exclude={form.toId} />
          </Select>
        </Field>
        <div className="flex justify-center text-slate-400"><ArrowDown size={16} /></div>
        <Field label="To (where the money goes in)">
          <Select value={form.toId} onChange={(e) => setForm((f) => ({ ...f, toId: e.target.value }))}>
            <option value="">Choose an account</option>
            <AccountOptions accounts={accounts} exclude={form.fromId} />
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Amount (J$)">
            <Input type="number" inputMode="decimal" min="0" step="0.01" placeholder="0.00" value={form.amount}
              onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} />
          </Field>
          <Field label="Date">
            <Input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
          </Field>
        </div>
        <Field label="Project (optional)" hint="Tag it to a job, e.g. the money given out for that job.">
          <Select value={form.projectId} onChange={(e) => setForm((f) => ({ ...f, projectId: e.target.value }))}>
            <option value="">No project</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        </Field>
        <Field label="Note (optional)">
          <Textarea rows={2} placeholder="e.g. Water harvesting - money for Enron's expenses" value={form.note}
            onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} />
        </Field>
        {short && (
          <div className="text-[11px] text-amber-600 dark:text-amber-400">
            {from!.code} {from!.name} only shows {jmd(from!.current_balance)} in your books. You can still save it if the books are not up to date yet.
          </div>
        )}
        {foreign && (
          <div className="text-[11px] text-amber-600 dark:text-amber-400">
            {foreign.code} {foreign.name} looks like a foreign-currency account. The transfer is recorded in J$ as typed, with no conversion.
          </div>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <Btn variant="ghost" size="sm" onClick={onClose} disabled={saving}>Cancel</Btn>
          <Btn variant="primary" size="sm" onClick={() => { void save(); }} disabled={saving || !form.fromId || !form.toId || !(amount > 0)}>
            {saving ? "Saving..." : "Transfer"}
          </Btn>
        </div>
      </div>
    </Modal>
  );
}
