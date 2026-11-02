// src/components/AdvanceModals.tsx — Banking Step 4b-3: advances to suppliers and contractors.
// GiveAdvanceModal: money paid before the bill (with proof: signature / photo). It is not a cost yet: the books hold it
// in "Advances to Suppliers and Subcontractors" until it is used on their bill.
// ApplyAdvanceModal: use (part of) an advance on that supplier's bill; the bank does not change again.

import { useEffect, useState } from "react";
import { Modal, Field, Input, Select, Btn } from "./ui";
import { supabase } from "../lib/supabase";
import { fetchMoneyAccounts, type MoneyAccount } from "../lib/banking";
import {
  applyAdvance, emptyProof, fetchAdvances, fetchSuppliers, fetchWorkerChoices, giveAdvance, PAY_METHODS, supplierForWorker, uploadBillProof,
  type PayMethod, type ProofValue, type SupplierAdvance, type SupplierOption, type WorkerOption,
} from "../lib/bills";
import { ProofFields } from "./BillPaymentProof";

const jmd = (n: number) => new Intl.NumberFormat("en-JM", { style: "currency", currency: "JMD", maximumFractionDigits: 2 }).format(n || 0);
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const r2 = (n: number) => Math.round(n * 100) / 100;
const errMsg = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback);

function MoneyAccountOptions({ accounts }: { accounts: MoneyAccount[] }) {
  const groups: [string, MoneyAccount[]][] = [
    ["Bank accounts", accounts.filter((a) => a.isBank && a.type === "asset")],
    ["Cash, petty cash and funds", accounts.filter((a) => !a.isBank && a.type === "asset")],
    ["Credit cards and lines of credit", accounts.filter((a) => a.type === "liability")],
  ];
  return (
    <>
      {groups.filter(([, g]) => g.length > 0).map(([label, g]) => (
        <optgroup key={label} label={label}>
          {g.map((a) => <option key={a.id} value={a.id}>{a.code} - {a.name} ({a.type === "liability" ? "owed " : ""}{jmd(a.current_balance)})</option>)}
        </optgroup>
      ))}
    </>
  );
}

export function GiveAdvanceModal({ open, onClose, companyId, onDone }: {
  open: boolean;
  onClose: () => void;
  companyId: string | null;
  onDone: (message: string) => void;
}) {
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);
  const [workers, setWorkers] = useState<WorkerOption[]>([]);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [accounts, setAccounts] = useState<MoneyAccount[]>([]);
  const [form, setForm] = useState({ supplierId: "", projectId: "", amount: "", date: today(), from: "", method: "cash" as PayMethod, reference: "" });
  const [proof, setProof] = useState<ProofValue>(emptyProof());
  const [proofKey, setProofKey] = useState(0);
  const [linking, setLinking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !companyId) return;
    let alive = true;
    setForm({ supplierId: "", projectId: "", amount: "", date: today(), from: "", method: "cash", reference: "" });
    setProof(emptyProof());
    setProofKey((k) => k + 1);
    setError(null);
    Promise.all([
      fetchSuppliers(companyId),
      fetchWorkerChoices(companyId).catch(() => [] as WorkerOption[]),
      supabase.from("projects").select("id, name, status").eq("company_id", companyId).order("name"),
      fetchMoneyAccounts(),
    ]).then(([s, w, pr, a]) => {
      if (!alive) return;
      setSuppliers(s);
      setWorkers(w);
      setProjects(((pr.data || []) as { id: string; name: string; status: string }[]).filter((p) => p.status !== "cancelled"));
      setAccounts(a);
      const bank = a.find((x) => x.isBank && x.type === "asset");
      if (bank) setForm((f) => ({ ...f, from: f.from || bank.id }));
    }).catch((e: unknown) => { if (alive) setError(errMsg(e, "Could not load the form.")); });
    return () => { alive = false; };
  }, [open, companyId]);

  const linked = new Set(suppliers.map((s) => s.workerId).filter(Boolean));
  const otherWorkers = workers.filter((w) => !linked.has(w.id));
  const who = suppliers.find((s) => s.id === form.supplierId);

  async function chooseWho(value: string) {
    setError(null);
    if (!value.startsWith("w:")) {
      setForm((f) => ({ ...f, supplierId: value }));
      setProof((p) => ({ ...p, receivedBy: suppliers.find((s) => s.id === value)?.name ?? p.receivedBy }));
      return;
    }
    const w = workers.find((x) => x.id === value.slice(2));
    if (!w) return;
    setLinking(true);
    try {
      const id = await supplierForWorker(w.id);
      setSuppliers((list) => list.some((s) => s.id === id) ? list
        : [...list, { id, name: w.name, workerId: w.id, type: "contractor" as const }].sort((a, b) => a.name.localeCompare(b.name)));
      setForm((f) => ({ ...f, supplierId: id }));
      setProof((p) => ({ ...p, receivedBy: w.name }));
    } catch (e: unknown) {
      setError(errMsg(e, "Could not use that worker."));
    } finally {
      setLinking(false);
    }
  }

  const amount = Number(form.amount);

  async function save() {
    if (saving || !companyId) return;
    setError(null);
    if (!form.supplierId) { setError("Choose who the advance is for."); return; }
    if (!(amount > 0)) { setError("Type an amount above zero."); return; }
    if (!form.from) { setError("Choose where the money was paid from."); return; }
    if (proof.signature && !proof.receivedBy.trim()) { setError("Type the name of the person who signed."); return; }
    setSaving(true);
    try {
      const proofPath = proof.photo ? await uploadBillProof(companyId, proof.photo) : null;
      await giveAdvance({
        supplierId: form.supplierId, projectId: form.projectId || null, amount: r2(amount), date: form.date, paidFrom: form.from,
        method: form.method, reference: form.reference, receivedBy: proof.signature ? proof.receivedBy : "", signature: proof.signature, proofPath,
      });
      const unsigned = form.method === "cash" && !proof.signature && !proofPath;
      onDone(`Advance of ${jmd(amount)} to ${who?.name ?? "them"} saved. Use it on their bill when it comes in.`
        + (unsigned ? " It shows as \"Not signed yet\" until you add a signature or photo." : ""));
      onClose();
    } catch (e: unknown) {
      setError(errMsg(e, "The advance was not saved."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={() => { if (!saving) onClose(); }} title="Give an advance"
      subtitle="Money paid to a supplier or contractor before their bill. It comes off their bill later.">
      <div className="space-y-3">
        {error && <div className="text-xs text-red-500 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</div>}
        <Field label="To (supplier, contractor or worker)">
          <Select value={form.supplierId} disabled={linking} onChange={(e) => { void chooseWho(e.target.value); }}>
            <option value="">{linking ? "Loading..." : "Choose"}</option>
            {suppliers.length > 0 && (
              <optgroup label="Suppliers and contractors">
                {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </optgroup>
            )}
            {otherWorkers.length > 0 && (
              <optgroup label="From your Workers list">
                {otherWorkers.map((w) => <option key={w.id} value={`w:${w.id}`}>{w.name}</option>)}
              </optgroup>
            )}
          </Select>
        </Field>
        <Field label="Project (optional)" hint="The job the advance is for.">
          <Select value={form.projectId} onChange={(e) => setForm((f) => ({ ...f, projectId: e.target.value }))}>
            <option value="">No project</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
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
        <Field label="Paid from">
          <Select value={form.from} onChange={(e) => setForm((f) => ({ ...f, from: e.target.value }))}>
            <option value="">Choose an account</option>
            <MoneyAccountOptions accounts={accounts} />
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="How">
            <Select value={form.method} onChange={(e) => setForm((f) => ({ ...f, method: e.target.value as PayMethod }))}>
              {PAY_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </Select>
          </Field>
          <Field label={form.method === "check" ? "Cheque number" : "Reference (optional)"}>
            <Input value={form.reference} onChange={(e) => setForm((f) => ({ ...f, reference: e.target.value }))} />
          </Field>
        </div>
        <ProofFields key={proofKey} value={proof} onChange={setProof} cash={form.method === "cash"} />
        {form.method === "cash" && !proof.signature && !proof.photo && (
          <div className="text-[11px] text-amber-600 dark:text-amber-400">
            No signature or photo: you can still save it, but it shows as "Not signed yet" until the proof is added.
          </div>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <Btn variant="ghost" size="sm" onClick={onClose} disabled={saving}>Cancel</Btn>
          <Btn variant="primary" size="sm" onClick={() => { void save(); }} disabled={saving || !form.supplierId || !(amount > 0) || !form.from}>
            {saving ? "Saving..." : "Save advance"}
          </Btn>
        </div>
      </div>
    </Modal>
  );
}

export function ApplyAdvanceModal({ open, onClose, companyId, bill, owed, onDone }: {
  open: boolean;
  onClose: () => void;
  companyId: string | null;
  bill: { id: string; invoice_number: string; supplier_id: string | null; supplier: string } | null;
  /** What can still be paid on the bill now (less retention). */
  owed: number;
  onDone: (message: string) => void;
}) {
  const [advances, setAdvances] = useState<SupplierAdvance[]>([]);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ advanceId: "", amount: "", date: today() });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !companyId || !bill?.supplier_id) return;
    let alive = true;
    setError(null);
    setLoading(true);
    fetchAdvances(companyId, { supplierId: bill.supplier_id }).then((list) => {
      if (!alive) return;
      const usable = list.filter((a) => a.left > 0);
      setAdvances(usable);
      const first = usable[0];
      setForm({ advanceId: first?.id ?? "", amount: first ? String(r2(Math.min(first.left, owed))) : "", date: today() });
    }).catch((e: unknown) => { if (alive) setError(errMsg(e, "Could not load the advances.")); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [open, companyId, bill?.supplier_id, owed]);

  const adv = advances.find((a) => a.id === form.advanceId);
  const amount = Number(form.amount);

  async function save() {
    if (saving || !bill) return;
    setError(null);
    if (!adv) { setError("Choose the advance."); return; }
    if (!(amount > 0)) { setError("Type an amount above zero."); return; }
    if (amount > adv.left + 0.001) { setError(`Only ${jmd(adv.left)} is left on this advance.`); return; }
    if (amount > owed + 0.001) { setError(`Only ${jmd(owed)} is owed on this bill now.`); return; }
    setSaving(true);
    try {
      await applyAdvance(adv.id, bill.id, r2(amount), form.date);
      onDone(`${jmd(amount)} from advance ${adv.payment_number ?? ""} used on bill ${bill.invoice_number}.`);
      onClose();
    } catch (e: unknown) {
      setError(errMsg(e, "The advance was not used."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={() => { if (!saving) onClose(); }} title={`Use an advance on bill ${bill?.invoice_number ?? ""}`}
      subtitle={`Money already given to ${bill?.supplier ?? "them"} comes off this bill. ${jmd(owed)} is owed now.`}>
      <div className="space-y-3">
        {error && <div className="text-xs text-red-500 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</div>}
        {loading ? <div className="text-xs text-slate-500">Loading advances...</div> : advances.length === 0 ? (
          <div className="text-xs text-slate-500">{bill?.supplier ?? "They"} have no advance left to use.</div>
        ) : (
          <>
            <Field label="Advance">
              <Select value={form.advanceId} onChange={(e) => {
                const a = advances.find((x) => x.id === e.target.value);
                setForm((f) => ({ ...f, advanceId: e.target.value, amount: a ? String(r2(Math.min(a.left, owed))) : f.amount }));
              }}>
                {advances.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.payment_number} · {a.payment_date}{a.project ? ` · ${a.project}` : ""} · {jmd(a.left)} left
                  </option>
                ))}
              </Select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Amount to use (J$)">
                <Input type="number" inputMode="decimal" min="0" step="0.01" value={form.amount}
                  onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} />
              </Field>
              <Field label="Date">
                <Input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
              </Field>
            </div>
          </>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <Btn variant="ghost" size="sm" onClick={onClose} disabled={saving}>Cancel</Btn>
          <Btn variant="primary" size="sm" onClick={() => { void save(); }} disabled={saving || !adv || !(amount > 0)}>
            {saving ? "Saving..." : "Use advance"}
          </Btn>
        </div>
      </div>
    </Modal>
  );
}
