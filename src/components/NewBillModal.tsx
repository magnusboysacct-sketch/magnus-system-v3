// src/components/NewBillModal.tsx — Banking Step 4a: enter a bill from a supplier, subcontractor or workman.
// Each line is charged to a cost account. Retention (e.g. 10% held back until the work is accepted) and GCT are optional.
// "Save and approve" puts it in the books straight away; "Save - waiting for approval" leaves it out until approved.
// Scan the bill: the AI reads who it is from, the number, dates, lines and GCT; the picture is filed in the monthly
// receipts folder (same as expense receipts) and kept with the bill. Someone not in the list can be added on the spot.

import { useEffect, useMemo, useState } from "react";
import { Camera, Plus, ScanLine, Trash2, X } from "lucide-react";
import { Modal, Field, Input, Select, Btn, Textarea } from "./ui";
import { supabase } from "../lib/supabase";
import {
  addSupplier, createBill, fetchCostAccounts, fetchSuppliers, fetchWorkerChoices, GCT_RATE, guessCostAccount, matchName,
  setBillFile, supplierForWorker, uploadBillFile,
  type CostAccount, type SupplierOption, type SupplierType, type WorkerOption,
} from "../lib/bills";
import { magnusAI } from "../lib/magnusAI";

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
  const [adding, setAdding] = useState<{ name: string; phone: string; type: SupplierType; address: string } | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanNote, setScanNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [notFound, setNotFound] = useState<{ name: string; address: string } | null>(null);
  const [paperTotal, setPaperTotal] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !companyId) return;
    let alive = true;
    setForm({ supplierId: "", number: "", date: today(), due: plusDays(today(), 30), projectId: "", retention: "", gct: "", notes: "" });
    setLines([blankLine(1)]);
    setAdding(null);
    setError(null);
    setFile(null);
    setScanNote(null);
    setNotFound(null);
    setPaperTotal(null);
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

  // Show the picture while the form is open.
  useEffect(() => {
    if (!file) { setPreview(null); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  async function scan(f: File) {
    setFile(f);
    setError(null);
    setScanNote(null);
    setNotFound(null);
    setPaperTotal(null);
    setScanning(true);
    try {
      const r = await magnusAI.scanBill(f);
      // Who it is from: a supplier, or someone on the Workers list, or offer to add them.
      let supplierId = "";
      let contractor = false;
      if (r.vendor) {
        const s = matchName(r.vendor, suppliers);
        if (s) { supplierId = s.id; contractor = s.type === "contractor"; }
        else {
          const w = matchName(r.vendor, workers.filter((x) => !suppliers.some((s2) => s2.workerId === x.id)));
          if (w) { await chooseFrom(`w:${w.id}`); contractor = true; }
          else setNotFound({ name: r.vendor, address: r.vendorAddress });
        }
      }
      setForm((f0) => ({
        ...f0,
        supplierId: supplierId || f0.supplierId,
        number: r.invoiceNumber || f0.number,
        date: r.date || f0.date,
        due: r.dueDate && r.dueDate >= (r.date || f0.date) ? r.dueDate : plusDays(r.date || f0.date, 30),
        gct: r.tax > 0 ? String(r2(r.tax)) : f0.gct,
      }));
      const read = r.lineItems.length > 0 ? r.lineItems
        : r.amount > 0 ? [{ description: r.vendor ? `Bill from ${r.vendor}` : "Bill", quantity: 1, unitPrice: r.amount - r.tax, amount: r.amount - r.tax }] : [];
      if (read.length > 0) {
        setLines(read.map((l, i) => {
          const qty = l.quantity && l.quantity !== 1 ? ` (${l.quantity} x ${jmd(l.unitPrice)})` : "";
          return { key: i + 1, item: `${l.description || "Item"}${qty}`.slice(0, 200), amount: l.amount > 0 ? String(r2(l.amount)) : "",
                   accountId: guessCostAccount(l.description, accounts, contractor) };
        }));
      }
      setPaperTotal(r.amount > 0 ? r2(r.amount) : null);
      setScanNote({ ok: true, text: `Filled in from the scan${r.vendor ? ` (${r.vendor})` : ""}. Check every line and cost account before saving.` });
    } catch (e: unknown) {
      setScanNote({ ok: false, text: `${e instanceof Error ? e.message : "The bill could not be read."} Type it in below. The picture is still saved with the bill.` });
    } finally {
      setScanning(false);
    }
  }

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
      const s = await addSupplier(companyId, adding.name, adding.phone, adding.type, adding.address);
      setSuppliers((list) => [...list, s].sort((a, b) => a.name.localeCompare(b.name)));
      setForm((f) => ({ ...f, supplierId: s.id }));
      setAdding(null);
      setNotFound(null);
      if (s.type === "contractor") {
        // Lines the scan guessed as materials are more likely the contractor's work: re-guess the ones still on materials.
        setLines((ls) => ls.map((l) => (l.item && l.accountId === guessCostAccount(l.item, accounts, false)
          ? { ...l, accountId: guessCostAccount(l.item, accounts, true) } : l)));
      }
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
      const billId = await createBill(
        {
          supplier_id: form.supplierId, project_id: form.projectId || null, invoice_number: form.number.trim(),
          invoice_date: form.date, due_date: form.due, tax_amount: gct, retention_percent: retPct, notes: form.notes.trim(),
        },
        used.map((l) => ({ item_name: l.item.trim(), chart_account_id: l.accountId, amount: r2(Number(l.amount)) })),
        approve,
      );
      // File the picture in the monthly receipts folder and keep it with the bill.
      let fileNote = "";
      if (file && companyId) {
        try {
          await setBillFile(billId, await uploadBillFile(companyId, file, form.date));
          fileNote = " The picture is filed in the receipts folder.";
        } catch (e: unknown) {
          fileNote = ` The bill is saved, but the picture was not (${e instanceof Error ? e.message : "upload failed"}): open the bill and tap "Attach bill picture".`;
        }
      }
      const who = suppliers.find((s) => s.id === form.supplierId)?.name ?? "the supplier";
      onDone((approve
        ? `Bill ${form.number.trim()} from ${who} saved and approved (${jmd(total)}). It is in the books.`
        : `Bill ${form.number.trim()} from ${who} saved (${jmd(total)}). It goes in the books when it is approved.`) + fileNote);
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

        <div className="rounded-lg border border-dashed border-cyan-500/40 bg-cyan-500/5 px-3 py-2.5">
          {file ? (
            <div className="flex items-start gap-3">
              {preview && <img src={preview} alt="The bill" className="w-16 h-20 object-cover rounded border border-slate-200 dark:border-white/10 flex-shrink-0" />}
              <div className="min-w-0 flex-1 text-xs">
                <div className="font-semibold text-slate-700 dark:text-slate-300 truncate">{file.name}</div>
                {scanning
                  ? <div className="text-cyan-600 dark:text-cyan-400 mt-1">Reading the bill...</div>
                  : scanNote && <div className={scanNote.ok ? "text-emerald-600 dark:text-emerald-400 mt-1" : "text-amber-600 dark:text-amber-400 mt-1"}>{scanNote.text}</div>}
                <div className="text-[10px] text-slate-500 mt-1">Saved with the bill, in the receipts folder for {form.date.slice(0, 7)}.</div>
              </div>
              <Btn variant="ghost" size="sm" icon={<X size={13} />} disabled={scanning} onClick={() => { setFile(null); setScanNote(null); }} />
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <label className="inline-flex items-center gap-1.5 cursor-pointer rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold px-3 py-1.5">
                <ScanLine size={14} /> Scan the bill
                <input type="file" accept="image/*" capture="environment" className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void scan(f); }} />
              </label>
              <label className="inline-flex items-center gap-1.5 cursor-pointer text-xs text-slate-600 dark:text-slate-400 hover:text-cyan-600">
                <Camera size={13} /> or choose a picture
                <input type="file" accept="image/*" className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void scan(f); }} />
              </label>
              <span className="text-[11px] text-slate-500 w-full">Take a photo of their bill: the AI fills in the form and the picture goes in your receipts folder.</span>
            </div>
          )}
        </div>

        {notFound && !adding && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-xs text-amber-800 dark:text-amber-200 space-y-2">
            <div><b>{notFound.name}</b> is not in your list yet. Add them as:</div>
            <div className="flex flex-wrap gap-2">
              <Btn variant="primary" size="sm" onClick={() => setAdding({ name: notFound.name, phone: "", type: "supplier", address: notFound.address })}>A supplier (materials, rentals)</Btn>
              <Btn variant="primary" size="sm" onClick={() => setAdding({ name: notFound.name, phone: "", type: "contractor", address: notFound.address })}>A contractor (does the work)</Btn>
              <Btn variant="ghost" size="sm" onClick={() => setNotFound(null)}>No, choose from the list</Btn>
            </div>
          </div>
        )}

        <Field label="From (supplier, subcontractor or workman)">
          {adding ? (
            <div className="space-y-2 rounded-lg border border-slate-200 dark:border-white/[0.07] p-2.5">
              <div className="flex gap-1.5">
                {(["supplier", "contractor"] as SupplierType[]).map((t) => (
                  <Btn key={t} size="sm" variant={adding.type === t ? "primary" : "ghost"} onClick={() => setAdding({ ...adding, type: t })}>
                    {t === "supplier" ? "Supplier" : "Contractor"}
                  </Btn>
                ))}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-[1fr_10rem] gap-2">
                <Input autoFocus placeholder={adding.type === "contractor" ? "Name, e.g. John Brown (mason)" : "Name, e.g. ABC Hardware"} value={adding.name}
                  onChange={(e) => setAdding({ ...adding, name: e.target.value })} />
                <Input placeholder="Phone (optional)" value={adding.phone}
                  onChange={(e) => setAdding({ ...adding, phone: e.target.value })} />
              </div>
              <Input placeholder="Address (optional)" value={adding.address}
                onChange={(e) => setAdding({ ...adding, address: e.target.value })} />
              <div className="flex justify-end gap-2">
                <Btn variant="ghost" size="sm" onClick={() => setAdding(null)}>Cancel</Btn>
                <Btn variant="primary" size="sm" onClick={() => { void saveSupplier(); }} disabled={!adding.name.trim()}>Add {adding.type}</Btn>
              </div>
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
              <Btn variant="ghost" size="sm" icon={<Plus size={13} />} onClick={() => setAdding({ name: "", phone: "", type: "supplier", address: "" })}>New</Btn>
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
          {paperTotal !== null && Math.abs(paperTotal - total) > 0.5 && (
            <div className="text-amber-600 dark:text-amber-400">The bill on paper says {jmd(paperTotal)}. Check the lines and GCT.</div>
          )}
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
