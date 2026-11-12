// src/components/InvoiceLinesModal.tsx — change the lines of an invoice (more work from the client on the same job), and
// "Add from BOQ": what the project's BOQ has that is not on an invoice yet (new items, or more quantity of an item).
// Saved by invoice_save_lines (migration 20261003000000): totals, balance, status and the books follow; a SENT invoice
// becomes "Revised invoice, Rev N". A paid or cancelled invoice is not changed.
import { useEffect, useMemo, useState } from "react";
import {
  fetchBoqUnbilled, fetchInvoiceLinesForEdit, fetchProjectBoqs, lineAmount, newKey, r2, saveInvoiceLines,
  type EditLine, type ProjectBoq, type UnbilledItem,
} from "../lib/invoiceEdit";

type Inv = {
  id: string; invoice_number?: string | null; status?: string | null; project_id?: string | null;
  tax_rate?: number | null; amount_paid?: number | null; revision?: number | null;
};

const money = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "JMD" }).format(n || 0);
const inp = "w-full rounded-lg border border-slate-200 dark:border-white/[0.1] bg-white dark:bg-[#111820] px-2 py-1.5 text-sm text-slate-800 dark:text-slate-200";
const btn = "rounded-lg px-3 py-2 text-sm font-semibold transition disabled:opacity-50";

export default function InvoiceLinesModal({ invoice, onClose, onSaved }: { invoice: Inv; onClose: () => void; onSaved: (msg: string) => void }) {
  const locked = invoice.status === "paid" || invoice.status === "cancelled";
  const sent = !!invoice.status && invoice.status !== "draft";
  const [lines, setLines] = useState<EditLine[]>([]);
  const [tax, setTax] = useState(String(invoice.tax_rate ?? 0));
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [boqOpen, setBoqOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    fetchInvoiceLinesForEdit(invoice.id)
      .then((l) => { if (alive) { setLines(l); setLoading(false); } })
      .catch((e) => { if (alive) { setErr(e instanceof Error ? e.message : "Could not load the lines."); setLoading(false); } });
    return () => { alive = false; };
  }, [invoice.id]);

  const sub = r2(lines.reduce((s, l) => s + lineAmount(l), 0));
  const taxAmt = r2(sub * (Number(tax) || 0) / 100);
  const total = r2(sub + taxAmt);
  const paid = Number(invoice.amount_paid || 0);

  const set = (key: string, f: keyof EditLine, v: string) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, [f]: v } : l)));
  const remove = (key: string) => setLines((ls) => ls.filter((l) => l.key !== key));
  const addBlank = () => setLines((ls) => [...ls, { key: newKey(), description: "", quantity: "1", unit: "ea", rate: "", notes: "", line_name: "", source_boq_section_item_id: null }]);

  async function save() {
    setErr(null);
    if (lines.length === 0) { setErr("An invoice needs at least one line."); return; }
    const bad = lines.findIndex((l) => !l.description.trim() || !(Number(l.quantity) > 0) || !(Number(l.rate) >= 0) || l.rate === "");
    if (bad >= 0) { setErr(`Line ${bad + 1}: fill in what it is, a quantity more than 0, and the rate.`); return; }
    if (total < paid) { setErr(`The client already paid ${money(paid)} on this invoice, so the total can't be less than that.`); return; }
    if (sent && !window.confirm(`This invoice was already sent. Saving makes it "Revised invoice, Rev ${Number(invoice.revision || 0) + 1}". Send the client the new copy afterwards. Continue?`)) return;
    setSaving(true);
    try {
      const r = await saveInvoiceLines(invoice.id, lines, Number(tax) || 0, note);
      onSaved(r.revision > 0 && sent
        ? `Invoice ${invoice.invoice_number || ""} revised (Rev ${r.revision}). New total ${money(r.total)}, balance ${money(r.balance_due)}. Send the client the new copy.`
        : `Invoice ${invoice.invoice_number || ""} saved. Total ${money(r.total)}.`);
    } catch (e) { setErr(e instanceof Error ? e.message : "Could not save."); setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4" onClick={onClose}>
      <div className="w-full sm:max-w-3xl max-h-[95vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-white dark:bg-[#0d1117] p-4 space-y-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">Change invoice lines · {invoice.invoice_number}</h3>
          <button onClick={onClose} className="text-slate-500 text-xl leading-none px-2">×</button>
        </div>

        {locked ? (
          <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            {invoice.status === "paid" ? "This invoice is fully paid, so it is not changed. Put the extra work on a new invoice for the same project." : "This invoice is cancelled."}
          </div>
        ) : (<>
          {sent && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              This invoice was already sent. Saving makes it <b>Revised invoice, Rev {Number(invoice.revision || 0) + 1}</b>. The books change by themselves. Send the client the new copy.
            </div>
          )}
          {loading ? <div className="text-sm text-slate-500">Loading…</div> : (
            <div className="space-y-2">
              {lines.map((l, i) => (
                <div key={l.key} className="rounded-lg border border-slate-200 dark:border-white/[0.08] p-2 space-y-1.5">
                  <div className="flex gap-2 items-start">
                    <span className="mt-2 text-xs text-slate-400 w-5">{i + 1}</span>
                    <input value={l.description} onChange={(e) => set(l.key, "description", e.target.value)} placeholder="What it is" className={inp} />
                    <button onClick={() => remove(l.key)} className="mt-1 text-red-600 text-sm font-bold px-2" title="Remove this line">✕</button>
                  </div>
                  <div className="grid grid-cols-4 gap-2 pl-7">
                    <label className="text-[10px] text-slate-500">Qty<input type="number" inputMode="decimal" value={l.quantity} onChange={(e) => set(l.key, "quantity", e.target.value)} className={inp} /></label>
                    <label className="text-[10px] text-slate-500">Unit<input value={l.unit} onChange={(e) => set(l.key, "unit", e.target.value)} className={inp} /></label>
                    <label className="text-[10px] text-slate-500">Rate<input type="number" inputMode="decimal" value={l.rate} onChange={(e) => set(l.key, "rate", e.target.value)} className={inp} /></label>
                    <div className="text-[10px] text-slate-500">Amount<div className="py-1.5 text-sm font-bold text-slate-800 dark:text-slate-200">{money(lineAmount(l))}</div></div>
                  </div>
                  {l.source_boq_section_item_id && <div className="pl-7 text-[10px] text-cyan-700 dark:text-cyan-400">From the BOQ</div>}
                </div>
              ))}
              <div className="flex flex-wrap gap-2">
                <button onClick={addBlank} className={`${btn} border border-slate-300 text-slate-700 dark:text-slate-300`}>+ Add a line</button>
                {invoice.project_id && <button onClick={() => setBoqOpen((o) => !o)} className={`${btn} bg-cyan-600 hover:bg-cyan-500 text-white`}>+ Add from BOQ</button>}
              </div>
              {boqOpen && invoice.project_id && (
                <BoqPicker projectId={invoice.project_id} current={lines}
                  onAdd={(add) => { setLines((ls) => [...ls, ...add]); setBoqOpen(false); }} />
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs text-slate-500">Tax rate (%)<input type="number" inputMode="decimal" value={tax} onChange={(e) => setTax(e.target.value)} className={inp} /></label>
            {sent && <label className="text-xs text-slate-500">What changed (kept on the invoice)<input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Extra work: 5 more tanks" className={inp} /></label>}
          </div>

          <div className="rounded-lg bg-slate-50 dark:bg-white/[0.03] p-3 text-sm space-y-1">
            <div className="flex justify-between"><span>Subtotal</span><span>{money(sub)}</span></div>
            <div className="flex justify-between"><span>Tax</span><span>{money(taxAmt)}</span></div>
            <div className="flex justify-between font-bold"><span>Total</span><span>{money(total)}</span></div>
            {paid > 0 && <div className="flex justify-between text-emerald-700"><span>Already paid</span><span>- {money(paid)}</span></div>}
            {paid > 0 && <div className="flex justify-between font-bold"><span>Balance</span><span>{money(r2(total - paid))}</span></div>}
          </div>

          {err && <div className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">{err}</div>}
          <button onClick={() => void save()} disabled={saving || loading} className={`${btn} w-full min-h-[48px] bg-green-600 hover:bg-green-500 text-white`}>
            {saving ? "Saving…" : sent ? "Save the revised invoice" : "Save"}
          </button>
        </>)}
        <button onClick={onClose} className={`${btn} w-full border border-slate-300 text-slate-700 dark:text-slate-300`}>Cancel</button>
      </div>
    </div>
  );
}

// What the BOQ has that is not billed yet: tick items, set how many and the rate, add them as lines.
function BoqPicker({ projectId, current, onAdd }: { projectId: string; current: EditLine[]; onAdd: (lines: EditLine[]) => void }) {
  const [boqs, setBoqs] = useState<ProjectBoq[]>([]);
  const [boqId, setBoqId] = useState("");
  const [items, setItems] = useState<UnbilledItem[]>([]);
  const [markup, setMarkup] = useState("0");
  const [pick, setPick] = useState<Record<string, { on: boolean; qty: string; rate: string }>>({});
  const [showAll, setShowAll] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchProjectBoqs(projectId).then((b) => {
      setBoqs(b);
      const first = b.find((x) => x.status === "approved") || b[0];
      if (first) setBoqId(first.id); else setLoading(false);
    }).catch((e) => { setErr(e instanceof Error ? e.message : "Could not load the BOQ."); setLoading(false); });
  }, [projectId]);

  useEffect(() => {
    if (!boqId) return;
    fetchBoqUnbilled(boqId).then((r) => { setItems(r); setPick({}); setLoading(false); })
      .catch((e) => { setErr(e instanceof Error ? e.message : "Could not load the BOQ."); setLoading(false); });
  }, [boqId]);

  // lines added from the BOQ just now (not saved yet, key starts with "b") also count as billed
  const onThis = useMemo(() => {
    const m = new Map<string, number>();
    current.forEach((l) => {
      if (l.key.startsWith("b") && l.source_boq_section_item_id) m.set(l.source_boq_section_item_id, (m.get(l.source_boq_section_item_id) || 0) + (Number(l.quantity) || 0));
    });
    return m;
  }, [current]);
  const factor = 1 + (Number(markup) || 0) / 100;
  const rateFor = (it: UnbilledItem) => {
    const same = current.find((l) => l.description.trim().toLowerCase() === (it.item_name || "").trim().toLowerCase() && Number(l.rate) > 0);
    return same ? String(Number(same.rate)) : String(r2(it.rate * factor));
  };
  const left = (it: UnbilledItem) => r2(Math.max(0, it.boq_qty - it.billed_qty - (onThis.get(it.item_id) || 0)));
  const shown = items.filter((it) => showAll || left(it) > 0);

  function add() {
    const out: EditLine[] = [];
    for (const it of items) {
      const p = pick[it.item_id];
      if (!p?.on) continue;
      const qty = Number(p.qty ?? left(it));
      const rate = Number(p.rate ?? rateFor(it));
      if (!(qty > 0)) { setErr(`${it.item_name}: the quantity must be more than 0.`); return; }
      if (!(rate >= 0)) { setErr(`${it.item_name}: type the rate.`); return; }
      out.push({ key: `b${newKey()}`, description: (it.item_name || "Item").trim(), quantity: String(qty), unit: it.unit || "ea", rate: String(rate),
        notes: (it.description || "").trim(), line_name: (it.line_name || "").trim(), source_boq_section_item_id: it.item_id });
    }
    if (out.length === 0) { setErr("Tick at least one item."); return; }
    onAdd(out);
  }

  return (
    <div className="rounded-xl border border-cyan-300 dark:border-cyan-500/30 bg-cyan-50/50 dark:bg-cyan-500/5 p-3 space-y-2">
      <div className="text-sm font-bold text-slate-800 dark:text-slate-100">Add from the BOQ</div>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-[10px] text-slate-500">BOQ
          <select value={boqId} onChange={(e) => { setLoading(true); setBoqId(e.target.value); }} className={inp}>
            {boqs.map((b) => <option key={b.id} value={b.id}>Version {b.version ?? "?"}{b.status ? ` (${b.status})` : ""}</option>)}
          </select>
        </label>
        <label className="text-[10px] text-slate-500">Markup on BOQ rates (%)
          <input type="number" inputMode="decimal" value={markup} onChange={(e) => setMarkup(e.target.value)} className={inp} />
        </label>
      </div>
      <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
        <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} /> Show items already billed too
      </label>
      {loading ? <div className="text-sm text-slate-500">Loading…</div>
        : boqs.length === 0 ? <div className="text-sm text-slate-500">This project has no BOQ.</div>
        : shown.length === 0 ? <div className="text-sm text-slate-500">Everything in this BOQ is already on an invoice. Add the extra work to the BOQ first (or tick "Show items already billed too").</div>
        : (
        <div className="max-h-72 overflow-y-auto divide-y divide-slate-200 dark:divide-white/[0.06] rounded-lg border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#0d1117]">
          {shown.map((it) => {
            const p = pick[it.item_id];
            const qty = p?.qty ?? String(left(it) || it.boq_qty);
            const rate = p?.rate ?? rateFor(it);
            return (
              <div key={it.item_id} className="p-2 space-y-1">
                <label className="flex items-start gap-2 text-sm">
                  <input type="checkbox" className="mt-1 h-4 w-4" checked={!!p?.on} onChange={(e) => setPick((m) => ({ ...m, [it.item_id]: { on: e.target.checked, qty, rate } }))} />
                  <span className="flex-1">
                    <span className="font-semibold text-slate-800 dark:text-slate-200">{it.item_name || "Item"}</span>
                    {it.section_title && <span className="text-xs text-slate-500"> · {it.section_title}</span>}
                    <span className="block text-xs text-slate-500">BOQ {it.boq_qty} {it.unit || ""} · already billed {it.billed_qty} · <b className="text-cyan-700 dark:text-cyan-400">left {left(it)}</b></span>
                  </span>
                </label>
                {p?.on && (
                  <div className="grid grid-cols-2 gap-2 pl-6">
                    <label className="text-[10px] text-slate-500">Qty to add<input type="number" inputMode="decimal" value={qty} onChange={(e) => setPick((m) => ({ ...m, [it.item_id]: { on: true, qty: e.target.value, rate } }))} className={inp} /></label>
                    <label className="text-[10px] text-slate-500">Rate<input type="number" inputMode="decimal" value={rate} onChange={(e) => setPick((m) => ({ ...m, [it.item_id]: { on: true, qty, rate: e.target.value } }))} className={inp} /></label>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      <div className="text-[10px] text-slate-500">"Already billed" counts this project's invoices (not cancelled). An old invoice made "one line per section" can't be matched item by item: check the quantities.</div>
      {err && <div className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">{err}</div>}
      <button onClick={add} className={`${btn} w-full bg-cyan-600 hover:bg-cyan-500 text-white`}>Add the ticked items to the invoice</button>
    </div>
  );
}
