// src/components/BillFromPOModal.tsx — Banking Step 4c: enter the supplier's bill for a Purchase Order.
// Each PO line shows what was ordered, received and already billed; the bill is checked against the PO price and what
// was received (three-way match). A bill that matches can be approved now; one that doesn't is saved waiting for
// approval with the lines flagged. The bill picture (optional) goes in the monthly receipts folder.

import { useEffect, useMemo, useState } from "react";
import { Camera, X } from "lucide-react";
import { Modal, Field, Input, Select, Btn } from "./ui";
import { describeDuplicate, useDuplicateCheck } from "../lib/duplicates";
import {
  createBillFromPO, fetchBillablePOs, fetchCostAccounts, fetchPOLines, GCT_RATE, guessCostAccount, setBillFile, uploadBillFile,
  type BillablePO, type CostAccount, type POLine,
} from "../lib/bills";

const jmd = (n: number) => new Intl.NumberFormat("en-JM", { style: "currency", currency: "JMD", maximumFractionDigits: 2 }).format(n || 0);
const qtyFmt = (n: number) => String(Math.round(n * 10000) / 10000);
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

type Row = POLine & { use: boolean; qty: string; price: string; accountId: string };

export function BillFromPOModal({ open, onClose, companyId, canApprove, presetPoId, onDone }: {
  open: boolean;
  onClose: () => void;
  companyId: string | null;
  canApprove: boolean;
  presetPoId?: string | null;
  onDone: (message: string) => void;
}) {
  const [pos, setPos] = useState<BillablePO[]>([]);
  const [accounts, setAccounts] = useState<CostAccount[]>([]);
  const [poId, setPoId] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [form, setForm] = useState({ number: "", date: today(), due: plusDays(today(), 30), gct: "", retention: "", notes: "" });
  const [file, setFile] = useState<File | null>(null);
  const [loadingLines, setLoadingLines] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !companyId) return;
    let alive = true;
    setForm({ number: "", date: today(), due: plusDays(today(), 30), gct: "", retention: "", notes: "" });
    setFile(null);
    setError(null);
    setRows([]);
    setPoId(presetPoId || "");
    Promise.all([fetchBillablePOs(companyId), fetchCostAccounts(companyId)]).then(([p, a]) => {
      if (!alive) return;
      setPos(p);
      setAccounts(a);
      if (presetPoId && !p.some((x) => x.id === presetPoId)) setError("That purchase order is not issued yet (or is cancelled). Issue it first.");
    }).catch((e: unknown) => { if (alive) setError(e instanceof Error ? e.message : "Could not load the purchase orders."); });
    return () => { alive = false; };
  }, [open, companyId, presetPoId]);

  useEffect(() => {
    if (!open || !poId || accounts.length === 0) { setRows([]); return; }
    let alive = true;
    setLoadingLines(true);
    fetchPOLines(poId).then((lines) => {
      if (!alive) return;
      setRows(lines.map((l) => ({
        ...l, use: l.left_to_bill > 0, qty: l.left_to_bill > 0 ? qtyFmt(l.left_to_bill) : "", price: String(l.rate),
        accountId: guessCostAccount(l.material_name, accounts, false),
      })));
    }).catch((e: unknown) => { if (alive) setError(e instanceof Error ? e.message : "Could not load the PO lines."); })
      .finally(() => { if (alive) setLoadingLines(false); });
    return () => { alive = false; };
  }, [open, poId, accounts]);

  const po = pos.find((p) => p.id === poId);
  const dups = useDuplicateCheck({ number: form.number, vendor: po?.supplier }, open && !!po && !!form.number.trim()).filter((d) => d.exact);
  const used = rows.filter((r) => r.use);
  const flag = (r: Row): string | null => {
    const q = Number(r.qty), p = Number(r.price);
    const parts: string[] = [];
    if (r.received <= 0) parts.push("nothing received yet");
    else if (q > r.left_to_bill + 0.0001) parts.push(`only ${qtyFmt(r.left_to_bill)} received and not billed`);
    if (Math.abs(p - r.rate) > 0.005) parts.push(`PO price is ${jmd(r.rate)}`);
    return parts.length ? parts.join("; ") : null;
  };
  const anyFlag = used.some((r) => flag(r));
  const subtotal = useMemo(() => r2(used.reduce((t, r) => t + r2((Number(r.qty) || 0) * (Number(r.price) || 0)), 0)), [used]);
  const gct = Number(form.gct) > 0 ? r2(Number(form.gct)) : 0;
  const retPct = Number(form.retention) > 0 ? Number(form.retention) : 0;
  const total = r2(subtotal + gct);

  function setRow(id: string, patch: Partial<Row>) {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  async function save(approve: boolean) {
    if (saving || !po) return;
    setError(null);
    if (!form.number.trim()) { setError("Type the bill number (the number on their bill)."); return; }
    if (dups.length > 0) { setError(`Already exists: ${describeDuplicate(dups[0])}. It was not entered again.`); return; }
    if (used.length === 0) { setError("Tick at least one line to bill."); return; }
    for (const r of used) {
      if (!(Number(r.qty) > 0)) { setError(`Type the quantity billed for "${r.material_name}".`); return; }
      if (!(Number(r.price) >= 0)) { setError(`Type the price for "${r.material_name}".`); return; }
      if (!r.accountId) { setError(`Choose the cost account for "${r.material_name}".`); return; }
    }
    if (approve && anyFlag) { setError("Some lines don't match the PO or what was received. Save it waiting for approval, then check and approve it."); return; }
    setSaving(true);
    try {
      const billId = await createBillFromPO(po.id,
        { invoice_number: form.number.trim(), invoice_date: form.date, due_date: form.due, tax_amount: gct, retention_percent: retPct, notes: form.notes.trim() },
        used.map((r) => ({ po_item_id: r.id, quantity: Number(r.qty), unit_cost: Number(r.price), chart_account_id: r.accountId })),
        approve);
      let fileNote = "";
      if (file && companyId) {
        try { await setBillFile(billId, await uploadBillFile(companyId, file, form.date)); fileNote = " The picture is filed in the receipts folder."; }
        catch { fileNote = " The bill is saved, but the picture was not: open the bill and tap \"Attach bill picture\"."; }
      }
      onDone(`Bill ${form.number.trim()} for ${po.po_number} (${po.supplier}) saved, ${jmd(total)}. `
        + (approve ? "It matched and is in the books." : anyFlag ? "Some lines are flagged: check them, then approve." : "It goes in the books when it is approved.")
        + fileNote);
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "The bill was not saved.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={() => { if (!saving) onClose(); }} title="Bill from a purchase order" width="max-w-3xl"
      subtitle="Checked against the PO price and what was received.">
      <div className="space-y-3">
        {error && <div className="text-xs text-red-500 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</div>}

        <Field label="Purchase order">
          <Select value={poId} onChange={(e) => setPoId(e.target.value)}>
            <option value="">{pos.length === 0 ? "No issued purchase orders" : "Choose"}</option>
            {pos.map((p) => (
              <option key={p.id} value={p.id}>{p.po_number} · {p.supplier}{p.project ? ` · ${p.project}` : ""} · {p.status.replace("_", " ")}</option>
            ))}
          </Select>
        </Field>

        {po && (
          <>
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

            {dups.length > 0 && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-700 dark:text-red-300">
                <b>Already exists:</b> {describeDuplicate(dups[0])}. This bill can't be entered again.
              </div>
            )}

            <div className="rounded-lg border border-slate-200 dark:border-white/[0.07] overflow-x-auto">
              {loadingLines ? <div className="p-3 text-xs text-slate-500">Loading the PO lines...</div> : (
                <table className="w-full text-xs">
                  <thead className="text-[10px] uppercase tracking-wide text-slate-500">
                    <tr className="border-b border-slate-200 dark:border-white/[0.06]">
                      <th className="p-2 text-left">Bill</th><th className="p-2 text-left">Item</th>
                      <th className="p-2 text-right">Ordered</th><th className="p-2 text-right">Received</th><th className="p-2 text-right">Billed before</th>
                      <th className="p-2 text-left">Qty on this bill</th><th className="p-2 text-left">Price</th><th className="p-2 text-left">Cost account</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => {
                      const f = r.use ? flag(r) : null;
                      return (
                        <tr key={r.id} className="border-b border-slate-100 dark:border-white/[0.04] align-top">
                          <td className="p-2"><input type="checkbox" checked={r.use} onChange={(e) => setRow(r.id, { use: e.target.checked })} /></td>
                          <td className="p-2">
                            <div className="font-medium text-slate-800 dark:text-slate-200">{r.material_name}</div>
                            {f && <div className="text-[10px] text-amber-600 dark:text-amber-400">{f}</div>}
                          </td>
                          <td className="p-2 text-right">{qtyFmt(r.ordered)} {r.unit || ""}</td>
                          <td className="p-2 text-right">{qtyFmt(r.received)}</td>
                          <td className="p-2 text-right">{qtyFmt(r.billed)}</td>
                          <td className="p-2 w-24"><Input type="number" inputMode="decimal" min="0" step="any" value={r.qty} disabled={!r.use}
                            onChange={(e) => setRow(r.id, { qty: e.target.value })} /></td>
                          <td className="p-2 w-28"><Input type="number" inputMode="decimal" min="0" step="0.01" value={r.price} disabled={!r.use}
                            onChange={(e) => setRow(r.id, { price: e.target.value })} /></td>
                          <td className="p-2 min-w-[12rem]">
                            <Select value={r.accountId} disabled={!r.use} onChange={(e) => setRow(r.id, { accountId: e.target.value })}>
                              <option value="">Cost account</option>
                              {accounts.map((a) => <option key={a.id} value={a.id}>{a.code} - {a.name}</option>)}
                            </Select>
                          </td>
                        </tr>
                      );
                    })}
                    {rows.length === 0 && <tr><td colSpan={8} className="p-3 text-slate-500">This PO has no lines.</td></tr>}
                  </tbody>
                </table>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="GCT on the bill (J$)">
                <div className="flex gap-2">
                  <Input type="number" inputMode="decimal" min="0" step="0.01" placeholder="0.00" value={form.gct}
                    onChange={(e) => setForm((f) => ({ ...f, gct: e.target.value }))} />
                  <Btn variant="ghost" size="sm" disabled={!(subtotal > 0)} onClick={() => setForm((f) => ({ ...f, gct: String(r2(subtotal * GCT_RATE)) }))}>15%</Btn>
                </div>
              </Field>
              <Field label="Retention held back (%)">
                <Input type="number" inputMode="decimal" min="0" max="50" step="0.5" placeholder="0" value={form.retention}
                  onChange={(e) => setForm((f) => ({ ...f, retention: e.target.value }))} />
              </Field>
            </div>

            <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400 cursor-pointer">
              <Camera size={14} />
              <span className="flex-1 truncate">{file ? file.name : "Photo of their bill (optional, goes in the receipts folder)"}</span>
              {file
                ? <button type="button" onClick={(e) => { e.preventDefault(); setFile(null); }} className="text-slate-500 hover:text-red-500"><X size={13} /></button>
                : <span className="text-cyan-600 dark:text-cyan-400 font-semibold">Add photo</span>}
              <input type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => { setFile(e.target.files?.[0] ?? null); e.target.value = ""; }} />
            </label>

            <div className="rounded-lg border border-slate-200 dark:border-white/[0.07] px-3 py-2 text-xs space-y-1">
              <div className="flex justify-between"><span className="text-slate-500">Goods</span><span>{jmd(subtotal)}</span></div>
              {gct > 0 && <div className="flex justify-between"><span className="text-slate-500">GCT</span><span>{jmd(gct)}</span></div>}
              <div className="flex justify-between font-semibold"><span>Bill total</span><span>{jmd(total)}</span></div>
              {anyFlag
                ? <div className="text-amber-600 dark:text-amber-400">Some lines don't match the PO or what was received. Save it waiting for approval; a director checks it.</div>
                : used.length > 0 && <div className="text-emerald-600 dark:text-emerald-400">Matches the PO and what was received.</div>}
            </div>
          </>
        )}

        <div className="flex flex-wrap justify-end gap-2 pt-1">
          <Btn variant="ghost" size="sm" onClick={onClose} disabled={saving}>Cancel</Btn>
          <Btn variant="secondary" size="sm" onClick={() => { void save(false); }} disabled={saving || !po || dups.length > 0}>{saving ? "Saving..." : "Save - waiting for approval"}</Btn>
          {canApprove && (
            <Btn variant="primary" size="sm" onClick={() => { void save(true); }} disabled={saving || !po || anyFlag || dups.length > 0}>{saving ? "Saving..." : "Save and approve"}</Btn>
          )}
        </div>
      </div>
    </Modal>
  );
}
