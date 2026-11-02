// src/components/PayBillModal.tsx — Banking Step 4b: pay a bill (full or part), or pay out the retention held on it.
// Saves once through pay_bill(); the database refuses more than is owed and an accidental second save.

import { useEffect, useState } from "react";
import { Modal, Field, Input, Select, Btn } from "./ui";
import { fetchMoneyAccounts, type MoneyAccount } from "../lib/banking";
import { emptyProof, payBill, PAY_METHODS, uploadBillProof, type PayMethod, type ProofValue } from "../lib/bills";
import { ProofFields } from "./BillPaymentProof";

const jmd = (n: number) => new Intl.NumberFormat("en-JM", { style: "currency", currency: "JMD", maximumFractionDigits: 2 }).format(n || 0);
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export function PayBillModal({ open, onClose, bill, owed, retention, companyId, onDone }: {
  open: boolean;
  companyId: string | null;
  onClose: () => void;
  bill: { id: string; invoice_number: string; supplier: string } | null;
  /** What can be paid now: the bill less retention less what is paid (or, for retention, what is still held). */
  owed: number;
  retention: boolean;
  onDone: (message: string) => void;
}) {
  const [accounts, setAccounts] = useState<MoneyAccount[]>([]);
  const [form, setForm] = useState({ amount: "", date: today(), from: "", method: "wire" as PayMethod, reference: "" });
  const [proof, setProof] = useState<ProofValue>(emptyProof());
  const [proofKey, setProofKey] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setForm({ amount: owed > 0 ? String(owed) : "", date: today(), from: "", method: "wire", reference: "" });
    setProof(emptyProof(bill?.supplier ?? ""));
    setProofKey((k) => k + 1);
    setError(null);
    fetchMoneyAccounts().then((a) => {
      if (!alive) return;
      setAccounts(a);
      const bank = a.find((x) => x.isBank && x.type === "asset");
      if (bank) setForm((f) => ({ ...f, from: f.from || bank.id }));
    }).catch((e: unknown) => { if (alive) setError(e instanceof Error ? e.message : "Could not load your accounts."); });
    return () => { alive = false; };
  }, [open, owed, bill?.supplier]);

  const amount = Number(form.amount);
  const from = accounts.find((a) => a.id === form.from);

  async function save() {
    if (saving || !bill) return;
    setError(null);
    if (!form.from) { setError("Choose where the money was paid from."); return; }
    if (!(amount > 0)) { setError("Type an amount above zero."); return; }
    if (amount > owed + 0.001) { setError(`Only ${jmd(owed)} can be paid on this bill now.`); return; }
    if (proof.signature && !proof.receivedBy.trim()) { setError("Type the name of the person who signed."); return; }
    setSaving(true);
    try {
      const proofPath = proof.photo && companyId ? await uploadBillProof(companyId, proof.photo) : null;
      await payBill({
        billId: bill.id, amount, date: form.date, paidFrom: form.from, method: form.method, reference: form.reference, retention,
        receivedBy: proof.signature ? proof.receivedBy : "", signature: proof.signature, proofPath,
      });
      const unsigned = form.method === "cash" && !proof.signature && !proofPath;
      onDone(`${retention ? "Retention" : "Payment"} of ${jmd(amount)} to ${bill.supplier} saved from ${from?.code} ${from?.name}.`
        + (unsigned ? " It shows as \"Not signed yet\" until you add a signature or photo." : ""));
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "The payment was not saved.");
    } finally {
      setSaving(false);
    }
  }

  const groups: [string, MoneyAccount[]][] = [
    ["Bank accounts", accounts.filter((a) => a.isBank && a.type === "asset")],
    ["Cash, petty cash and funds", accounts.filter((a) => !a.isBank && a.type === "asset")],
    ["Credit cards and lines of credit", accounts.filter((a) => a.type === "liability")],
  ];

  return (
    <Modal open={open} onClose={() => { if (!saving) onClose(); }}
      title={retention ? `Pay retention - bill ${bill?.invoice_number ?? ""}` : `Pay bill ${bill?.invoice_number ?? ""}`}
      subtitle={retention
        ? `Pay ${bill?.supplier ?? "them"} the money held back, now the work is accepted. ${jmd(owed)} is still held.`
        : `${bill?.supplier ?? ""}: ${jmd(owed)} to pay now. You can pay part of it.`}>
      <div className="space-y-3">
        {error && <div className="text-xs text-red-500 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</div>}
        <Field label="Paid from">
          <Select value={form.from} onChange={(e) => setForm((f) => ({ ...f, from: e.target.value }))}>
            <option value="">Choose an account</option>
            {groups.filter(([, g]) => g.length > 0).map(([label, g]) => (
              <optgroup key={label} label={label}>
                {g.map((a) => <option key={a.id} value={a.id}>{a.code} - {a.name} ({a.type === "liability" ? "owed " : ""}{jmd(a.current_balance)})</option>)}
              </optgroup>
            ))}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Amount (J$)">
            <Input type="number" inputMode="decimal" min="0" step="0.01" value={form.amount}
              onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} />
          </Field>
          <Field label="Date paid">
            <Input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
          </Field>
        </div>
        {!retention && owed > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {[25, 50, 100].map((p) => (
              <Btn key={p} variant="ghost" size="sm" onClick={() => setForm((f) => ({ ...f, amount: String(Math.round(owed * p) / 100) }))}>{p === 100 ? "All" : `${p}%`}</Btn>
            ))}
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="How">
            <Select value={form.method} onChange={(e) => setForm((f) => ({ ...f, method: e.target.value as PayMethod }))}>
              {PAY_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </Select>
          </Field>
          <Field label={form.method === "check" ? "Cheque number" : "Reference (optional)"}>
            <Input value={form.reference} placeholder="e.g. transfer number" onChange={(e) => setForm((f) => ({ ...f, reference: e.target.value }))} />
          </Field>
        </div>
        <ProofFields key={proofKey} value={proof} onChange={setProof} cash={form.method === "cash"} />
        {form.method === "cash" && !proof.signature && !proof.photo && (
          <div className="text-[11px] text-amber-600 dark:text-amber-400">
            No signature or photo: you can still save it, but it shows as "Not signed yet" until the proof is added.
          </div>
        )}
        {from && from.type === "asset" && amount > from.current_balance && (
          <div className="text-[11px] text-amber-600 dark:text-amber-400">
            {from.code} {from.name} only shows {jmd(from.current_balance)} in your books. You can still save it if the books are not up to date yet.
          </div>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <Btn variant="ghost" size="sm" onClick={onClose} disabled={saving}>Cancel</Btn>
          <Btn variant="primary" size="sm" onClick={() => { void save(); }} disabled={saving || !form.from || !(amount > 0)}>
            {saving ? "Saving..." : retention ? "Pay retention" : "Save payment"}
          </Btn>
        </div>
      </div>
    </Modal>
  );
}
