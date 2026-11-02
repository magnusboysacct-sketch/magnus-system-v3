// src/components/NewBillModal.tsx — Banking Step 4a: enter a bill from a supplier, subcontractor or workman.
// Each line is charged to a cost account. Retention (e.g. 10% held back until the work is accepted) and GCT are optional.
// "Save and approve" puts it in the books straight away; "Save - waiting for approval" leaves it out until approved.

import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Modal, Field, Input, Select, Btn, Textarea } from "./ui";
import { supabase } from "../lib/supabase";
import {
  addSupplier, createBill, fetchCostAccounts, fetchSuppliers, fetchWorkerChoices, GCT_RATE, supplierForWorker,
  type CostAccount, type SupplierOption, type WorkerOption,
} from "../lib/bills";

const jmd = (n: number) => new Intl.NumberFormat("en-JM", { style: "currency", currency: "JMD", maximumFractionDigits: 2 }).format(n || 0);
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const plusDays = (iso: string, days: number) => {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const r2 = (n: number) => Math.round(n * 100) / 100;

type Line = { key: number; item: string; accountId: string; amount: string };
const blankLine = (key: number, accountId = ""): Line => ({ key, item: "", accountId, amount: "" });

export function NewBillModal({ open, onClose, companyId, canApprove, onDone }: {
  open: boolean;
  onClose: () => void;
  companyId: string | null;
  canApprove: boolean;
  onDone: (message: string) => void;
}) {
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);
  const [workers, setWorkers] = useState<WorkerOption[]>([]);
  const [linking, setLinking] = useState(false);
  const [accounts, setAccounts] = useState<CostAccount[]>([]);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [form, setForm] = useState({ supplierId: "", number: "", date: today(), due: plusDays(today(), 30), projectId: "", retention: "", gct: "", notes: "" });
  const [lines, setLines] = useState<Line[]>([blankLine(1)]);
  const [adding, setAdding] = useState<{ name: string; phone: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !companyId) return;
    let alive = true;
    setForm({ supplierId: "", number: "", date: today(), due: plusDays(today(), 30), projectId: "", retention: "", gct: "", notes: "" });
    setLines([blankLine(1)]);
    setAdding(null);
    setError(null);
    Promise.all([
      fetchSuppliers(companyId),
      fetchCostAccounts(companyId),
      fetchWorkerChoices(companyId).catch(() => [] as WorkerOption[]),
      supabase.from("projects").select("id, name, status").eq("company_id", companyId).order("name"),
    ]).then(([s, a, w, pr]) => {
      if (!alive) return;
      setSuppliers(s);
      setWorkers(w);
      setAccounts(a);
      setProjects(((pr.data || []) as { id: string; name: string; status: string }[]).filter((p) => p.status !== "cancelled"));
    }).catch((e: unknown) => { if (alive) setError(e instanceof Error ? e.message : "Could not load the form."); });
    return () => { alive = false; };
  }, [open, companyId]);

  const subtotal = useMemo(() => r2(lines.reduce((s, l) => s + (Number(l.amount) > 0 ? Number(l.amount) : 0), 0)), [lines]);
  const gct = Number(form.gct) > 0 ? r2(Number(form.gct)) : 0;
  const retPct = Number(form.retention) > 0 ? Number(form.retention) : 0;
  const retention = r2(subtotal * retPct / 100);
  const total = r2(subtotal + gct);
  const payNow = r2(total - retention);

  function setLine(key: number, patch: Partial<Line>) {
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  // A worker / subcontractor was chosen: use (or make) their supplier record.
  async function chooseFrom(value: string) {
    setError(null);
    if (!value.startsWith("w:")) { setForm((f) => ({ ...f, supplierId: value })); return; }
    const w = workers.find((x) => x.id === value.slice(2));
    if (!w) return;
    setLinking(true);
    try {
      const id = await supplierForWorker(w.id);
      setSuppliers((list) => list.some((s) => s.id === id) ? list
        : [...list, { id, name: w.name, workerId: w.id }].sort((a, b) => a.name.localeCompare(b.name)));
      setForm((f) => ({ ...f, supplierId: id }));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not use that worker.");
    } finally {
      setLinking(false);
    }
  }

  const linkedWorkers = new Set(suppliers.map((s) => s.workerId).filter(Boolean));
  const unlinkedWorkers = workers.filter((w) => !linkedWorkers.has(w.id));
  const workerTypeLabel = (t: string) => t === "subcontractor" ? "subcontractor" : t === "crew_lead" ? "crew lead" : "worker";

  async function saveSupplier() {
    if (!companyId || !adding || !adding.name.trim()) return;
    setError(null);
    try {
      const s = await addSupplier(companyId, adding.name, adding.phone);
      setSuppliers((list) => [...list, s].sort((a, b) => a.name.localeCompare(b.name)));
      setForm((f) => ({ ...f, supplierId: s.id }));
      setAdding(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "The supplier was not saved.");
    }
  }

  function check(): string | null {
    if (!form.supplierId) return "Choose who the bill is from.";
    if (!form.number.trim()) return "Type the bill number (the number on their bill).";
    const used = lines.filter((l) => l.item.trim() || l.amount);
    if (used.length === 0) return "Add at least one line.";
    for (const l of used) {
      if (!l.item.trim()) return "Every line needs a description.";
      if (!(Number(l.amount) > 0)) return `Type an amount for "${l.item.trim()}".`;
      if (!l.accountId) return `Choose the cost account for "${l.item.trim()}".`;
    }
    if (retPct > 50) return "Retention above 50% is not allowed.";
    if (form.due < form.date) return "The due date is before the bill date.";
    return null;
  }

  async function save(approve: boolean) {
    if (saving) return;
    const problem = check();
    if (problem) { setError(problem); return; }
    setError(null);
    setSaving(true);
    try {
      const used = lines.filter((l) => l.item.trim());
      await createBill(
        {
          supplier_id: form.supplierId, project_id: form.projectId || null, invoice_number: form.number.trim(),
          invoice_date: form.date, due_date: form.due, tax_amount: gct, retention_percent: retPct, notes: form.notes.trim(),
        },
        used.map((l) => ({ item_name: l.item.trim(), chart_account_id: l.accountId, amount: r2(Number(l.amount)) })),
        approve,
      );
      const who = suppliers.find((s) => s.id === form.supplierId)?.name ?? "the supplier";
      onDone(approve
        ? `Bill ${form.number.trim()} from ${who} saved and approved (${jmd(total)}). It is in the books.`
        : `Bill ${form.number.trim()} from ${who} saved (${jmd(total)}). It goes in the books when it is approved.`);
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "The bill was not saved.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={() => { if (!saving) onClose(); }} title="New bill" width="max-w-2xl"
      subtitle="A bill from a supplier, subcontractor or workman. You pay it later from Payables.">
      <div className="space-y-3">
        {error && <div className="text-xs text-red-500 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</div>}

        <Field label="From (supplier, subcontractor or workman)">
          {adding ? (
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_10rem_auto_auto] gap-2">
              <Input autoFocus placeholder="Name, e.g. John Brown (mason)" value={adding.name}
                onChange={(e) => setAdding({ ...adding, name: e.target.value })} />
              <Input placeholder="Phone (optional)" value={adding.phone}
                onChange={(e) => setAdding({ ...adding, phone: e.target.value })} />
              <Btn variant="primary" size="sm" onClick={() => { void saveSupplier(); }} disabled={!adding.name.trim()}>Add</Btn>
              <Btn variant="ghost" size="sm" onClick={() => setAdding(null)}>Cancel</Btn>
            </div>
          ) : (
            <div className="flex gap-2">
              <Select value={form.supplierId} disabled={linking} onChange={(e) => { void chooseFrom(e.target.value); }}>
                <option value="">{linking ? "Loading..." : suppliers.length + unlinkedWorkers.length === 0 ? "Nobody yet - tap New" : "Choose"}</option>
                {suppliers.length > 0 && (
                  <optgroup label="Suppliers and contractors">
                    {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </optgroup>
                )}
                {unlinkedWorkers.length > 0 && (
                  <optgroup label="From your Workers list">
                    {unlinkedWorkers.map((w) => <option key={w.id} value={`w:${w.id}`}>{w.name} ({workerTypeLabel(w.type)})</option>)}
                  </optgroup>
                )}
              </Select>
              <Btn variant="ghost" size="sm" icon={<Plus size={13} />} onClick={() => setAdding({ name: "", phone: "" })}>New</Btn>
            </div>
          )}
        </Field>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Field label="Bill number">
            <Input placeholder="Number on their bill" value={form.number} onChange={(e) => setForm((f) => ({ ...f, number: e.target.value }))} />
          </Field>
          <Field label="Bill date">
            <Input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value, due: f.due < e.target.value ? e.target.value : f.due }))} />
          </Field>
          <Field label="Due date">
            <Input type="date" value={form.due} onChange={(e) => setForm((f) => ({ ...f, due: e.target.value }))} />
          </Field>
        </div>

        <Field label="Project (optional)" hint="Pick the job so the cost shows on that job.">
          <Select value={form.projectId} onChange={(e) => setForm((f) => ({ ...f, projectId: e.target.value }))}>
            <option value="">No project</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        </Field>

        <div>
          <div className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">What the bill is for</div>
          <div className="space-y-2">
            {lines.map((l) => (
              <div key={l.key} className="grid grid-cols-[1fr_7rem_auto] sm:grid-cols-[1fr_14rem_8rem_auto] gap-2 items-start">
                <Input placeholder="e.g. Block work, stage 2" value={l.item} onChange={(e) => setLine(l.key, { item: e.target.value })} />
                <div className="col-span-3 sm:col-span-1 order-last sm:order-none">
                  <Select value={l.accountId} onChange={(e) => setLine(l.key, { accountId: e.target.value })}>
                    <option value="">Cost account</option>
                    {accounts.map((a) => <option key={a.id} value={a.id}>{a.code} - {a.name}</option>)}
                  </Select>
                </div>
                <Input type="number" inputMode="decimal" min="0" step="0.01" placeholder="Amount" value={l.amount}
                  onChange={(e) => setLine(l.key, { amount: e.target.value })} />
                <Btn variant="ghost" size="sm" icon={<Trash2 size={13} />} disabled={lines.length === 1}
                  onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} />
              </div>
            ))}
          </div>
          <div className="mt-2">
            <Btn variant="ghost" size="sm" icon={<Plus size={13} />}
              onClick={() => setLines((ls) => [...ls, blankLine(Math.max(...ls.map((x) => x.key)) + 1, ls[ls.length - 1]?.accountId ?? "")])}>
              Add a line
            </Btn>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="GCT on the bill (J$)" hint="Only if the bill shows GCT.">
            <div className="flex gap-2">
              <Input type="number" inputMode="decimal" min="0" step="0.01" placeholder="0.00" value={form.gct}
                onChange={(e) => setForm((f) => ({ ...f, gct: e.target.value }))} />
              <Btn variant="ghost" size="sm" disabled={!(subtotal > 0)} onClick={() => setForm((f) => ({ ...f, gct: String(r2(subtotal * GCT_RATE)) }))}>15%</Btn>
            </div>
          </Field>
          <Field label="Retention held back (%)" hint="e.g. 10. Kept until the work is accepted.">
            <Input type="number" inputMode="decimal" min="0" max="50" step="0.5" placeholder="0" value={form.retention}
              onChange={(e) => setForm((f) => ({ ...f, retention: e.target.value }))} />
          </Field>
        </div>

        <Field label="Note (optional)">
          <Textarea rows={2} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
        </Field>

        <div className="rounded-lg border border-slate-200 dark:border-white/[0.07] px-3 py-2 text-xs space-y-1">
          <div className="flex justify-between"><span className="text-slate-500">Work / goods</span><span>{jmd(subtotal)}</span></div>
          {gct > 0 && <div className="flex justify-between"><span className="text-slate-500">GCT</span><span>{jmd(gct)}</span></div>}
          <div className="flex justify-between font-semibold"><span>Bill total</span><span>{jmd(total)}</span></div>
          {retention > 0 && (
            <>
              <div className="flex justify-between text-amber-600 dark:text-amber-400"><span>Retention held back ({retPct}%)</span><span>-{jmd(retention)}</span></div>
              <div className="flex justify-between font-semibold"><span>To pay now</span><span>{jmd(payNow)}</span></div>
            </>
          )}
        </div>

        <div className="flex flex-wrap justify-end gap-2 pt-2">
          <Btn variant="ghost" size="sm" onClick={onClose} disabled={saving}>Cancel</Btn>
          <Btn variant="secondary" size="sm" onClick={() => { void save(false); }} disabled={saving}>
            {saving ? "Saving..." : "Save - waiting for approval"}
          </Btn>
          {canApprove && (
            <Btn variant="primary" size="sm" onClick={() => { void save(true); }} disabled={saving}>
              {saving ? "Saving..." : "Save and approve"}
            </Btn>
          )}
        </div>
      </div>
    </Modal>
  );
}
