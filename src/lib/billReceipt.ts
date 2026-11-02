// src/lib/billReceipt.ts — Banking Step 4b-2: a printable receipt for a bill payment (with the signature, if signed).
// Every value is escaped: names and references are typed by staff and suppliers.

import { escapeHtml } from "./receiptHtml";
import { showPrintPreview } from "./printPreview";
import { PAY_METHODS } from "./bills";

const jmd = (n: number) => new Intl.NumberFormat("en-JM", { style: "currency", currency: "JMD", maximumFractionDigits: 2 }).format(n || 0);
const day = (d: string) => new Date(`${d.slice(0, 10)}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

export interface BillReceiptData {
  company: string;
  receiptNumber: string;
  date: string;
  amount: number;
  method: string | null;
  reference: string | null;
  retention: boolean;
  supplier: string;
  billNumber: string;
  project: string | null;
  receivedBy: string | null;
  signature: string | null;
  signedAt: string | null;
}

export function billReceiptHtml(r: BillReceiptData): string {
  const how = PAY_METHODS.find((m) => m.value === r.method)?.label ?? "Payment";
  const row = (k: string, v: string) => `<tr><td class="k">${escapeHtml(k)}</td><td>${escapeHtml(v)}</td></tr>`;
  const sig = r.signature && /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(r.signature)
    ? `<img src="${r.signature}" alt="Signature" class="sig"/>`
    : `<div class="sigline"></div>`;
  return `<!doctype html><html><head><meta charset="utf-8"><title>Payment receipt ${escapeHtml(r.receiptNumber)}</title>
<style>
  body{font-family:Arial,Helvetica,sans-serif;color:#0f172a;margin:0;padding:32px;max-width:640px}
  h1{font-size:20px;margin:0 0 2px} .co{font-size:13px;color:#475569;margin-bottom:20px}
  .amt{font-size:28px;font-weight:700;margin:12px 0 18px}
  table{border-collapse:collapse;width:100%;font-size:13px} td{padding:6px 0;border-bottom:1px solid #e2e8f0;vertical-align:top}
  td.k{color:#64748b;width:40%} .sig{height:80px;margin-top:24px;display:block} .sigline{height:60px;border-bottom:1px solid #0f172a;margin-top:40px;width:60%}
  .who{font-size:12px;color:#475569;margin-top:6px} .foot{margin-top:28px;font-size:11px;color:#94a3b8}
</style></head><body>
<h1>Payment receipt</h1>
<div class="co">${escapeHtml(r.company)} · ${escapeHtml(r.receiptNumber)}</div>
<div class="amt">${escapeHtml(jmd(r.amount))}</div>
<table>
${row("Paid to", r.supplier)}
${row("For", (r.retention ? "Retention held on bill " : "Bill ") + r.billNumber)}
${r.project ? row("Project", r.project) : ""}
${row("Date paid", day(r.date))}
${row("How", how + (r.reference ? ` (${r.reference})` : ""))}
</table>
${sig}
<div class="who">Received by: ${escapeHtml(r.receivedBy || "________________________")}${r.signedAt ? ` · signed ${escapeHtml(new Date(r.signedAt).toLocaleString("en-GB"))}` : ""}</div>
<div class="foot">I confirm I received the amount above. Made with Magnus Boy's System.</div>
</body></html>`;
}

export function showBillReceipt(r: BillReceiptData): void {
  showPrintPreview(billReceiptHtml(r), { title: `Payment receipt ${r.receiptNumber}` });
}
