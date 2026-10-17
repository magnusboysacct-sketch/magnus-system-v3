// src/lib/receiptHtml.ts
// The payment-receipt documents: the worker receipt (advance / progress / final / payment) that FieldPaymentForm and FieldPaymentsPage print, and
// the same document built from the data of a public receipt link (/receipt/:token), plus a simple receipt for client payments.
//
// generateReceiptHTML does NOT escape the values it is given (staff-entered text from their own screens), so anything that comes from the database for
// a public page goes through escapeHtml first (see buildPublicReceiptHtml). The public receipt carries the worker's NAME only: no ID number, phone,
// address, notes, signature or "paid by" - get_public_receipt does not return them and the builder never asks for them.
import { buildPrintDocument } from "./printUtils";

// A date-only value ('YYYY-MM-DD', e.g. work_date) is that calendar day, not midnight UTC (which reads as the day before in Jamaica).
function receiptDay(v: unknown): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v || ""));
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date((v as string | number | undefined) || Date.now());
}

// ── Receipt Generator ─────────────────────────────────────────────────────────
// Generates receipt HTML from payment data — no image stored
export function generateReceiptHTML(payment: any, company: any, logoBase64?: string|null, watermark?: {url:string;opacity:number}|null) {
  const totalAdvances = payment.previous_advances||0;
  const earned = Number(payment.total_amount||0);
  const balance = earned - totalAdvances;
  
  return `
  <div style="background:#fff;padding:32px;font-family:Georgia,serif;color:#1a1a1a;max-width:600px;margin:0 auto">
    <div style="text-align:center;border-bottom:3px solid #1a1a1a;padding-bottom:20px;margin-bottom:20px">
      ${logoBase64?`<img src="${logoBase64}" style="display:block;width:auto;height:auto;max-height:90px;max-width:260px;object-fit:contain;margin:0 auto 10px"/>`:""}
      <div style="font-size:18px;font-weight:900;letter-spacing:2px;text-transform:uppercase">${company?.company_name||""}</div>
      ${company?.address_line1?`<div style="font-size:11px;color:#666;margin-top:3px">${company.address_line1}${company?.parish?`, ${company.parish}`:""}${company?.country?`, ${company.country}`:""}</div>`:""}
      <div style="font-size:11px;color:#666">${company?.phone?`Tel: ${company.phone}`:""}${company?.phone&&company?.email?" · ":""}${company?.email||""}</div>
      <div style="margin-top:12px">
        <div style="font-size:11px;font-weight:700;letter-spacing:3px;text-transform:uppercase;color:${payment.payment_type==="advance"?"#d97706":payment.payment_type==="final"?"#16a34a":"#0891b2"}">
          ${payment.payment_type==="advance"?"⚡ ADVANCE PAYMENT":payment.payment_type==="final"?"✅ FINAL PAYMENT — PAID IN FULL":"💰 PAYMENT RECEIPT"}
        </div>
        <div style="font-size:20px;font-weight:900;text-transform:uppercase;letter-spacing:3px;margin-top:4px">Payment Receipt</div>
        <div style="font-size:11px;color:#666;margin-top:3px">Receipt #${payment.receipt_number} · ${new Date(payment.created_at||Date.now()).toLocaleDateString("en-US",{month:"long",day:"numeric",year:"numeric"})}</div>
      </div>
    </div>
    
    ${payment.project_name||payment.milestone_name||payment.task_name?`
    <div style="background:#f0f9ff;border-left:4px solid #0891b2;border-radius:8px;padding:12px 16px;margin-bottom:16px">
      ${payment.project_name?`<div style="font-size:12px;margin-bottom:3px"><span style="color:#666;width:80px;display:inline-block">Project:</span><strong>${payment.project_name}</strong></div>`:""}
      ${payment.milestone_name?`<div style="font-size:12px;margin-bottom:3px"><span style="color:#666;width:80px;display:inline-block">Milestone:</span><strong>${payment.milestone_name}</strong></div>`:""}
      ${payment.task_name?`<div style="font-size:12px"><span style="color:#666;width:80px;display:inline-block">Task:</span><strong>${payment.task_name}</strong></div>`:""}
    </div>`:""}

    <table style="width:100%;border-collapse:collapse;margin-bottom:16px">
      <tbody>
        <tr style="border-bottom:1px solid #f0f0f0"><td style="padding:7px 0;color:#666;font-size:12px;width:140px">Worker</td><td style="padding:7px 0;font-size:13px;font-weight:600;text-align:right">${payment.worker_name}</td></tr>
        ${payment.worker_id_number?`<tr style="border-bottom:1px solid #f0f0f0"><td style="padding:7px 0;color:#666;font-size:12px">ID Number</td><td style="padding:7px 0;font-size:13px;font-weight:600;text-align:right">${payment.worker_id_number}</td></tr>`:""}
        ${payment.worker_phone?`<tr style="border-bottom:1px solid #f0f0f0"><td style="padding:7px 0;color:#666;font-size:12px">Phone</td><td style="padding:7px 0;font-size:13px;font-weight:600;text-align:right">${payment.worker_phone}</td></tr>`:""}
        ${payment.trade_type?`<tr style="border-bottom:1px solid #f0f0f0"><td style="padding:7px 0;color:#666;font-size:12px">Trade</td><td style="padding:7px 0;font-size:13px;font-weight:600;text-align:right">${payment.trade_type}</td></tr>`:""}
        <tr style="border-bottom:1px solid #f0f0f0"><td style="padding:7px 0;color:#666;font-size:12px">Work Date</td><td style="padding:7px 0;font-size:13px;font-weight:600;text-align:right">${receiptDay(payment.work_date).toLocaleDateString("en-US",{month:"long",day:"numeric",year:"numeric"})}</td></tr>
        <tr style="border-bottom:1px solid #f0f0f0"><td style="padding:7px 0;color:#666;font-size:12px">Payment Method</td><td style="padding:7px 0;font-size:13px;font-weight:600;text-align:right;text-transform:uppercase">${(payment.payment_method||"cash").replace("_"," ")}</td></tr>
        ${payment.work_type?`<tr style="border-bottom:1px solid #f0f0f0"><td style="padding:7px 0;color:#666;font-size:12px">Work Done</td><td style="padding:7px 0;font-size:13px;font-weight:600;text-align:right">${payment.work_type}</td></tr>`:""}
        ${totalAdvances>0?`<tr style="border-bottom:1px solid #f0f0f0"><td style="padding:7px 0;color:#666;font-size:12px">Previous Advances</td><td style="padding:7px 0;font-size:13px;font-weight:600;text-align:right;color:#d97706">- ${new Intl.NumberFormat("en-US",{style:"currency",currency:"JMD"}).format(totalAdvances)}</td></tr>`:""}
        ${payment.notes?`<tr style="border-bottom:1px solid #f0f0f0"><td style="padding:7px 0;color:#666;font-size:12px">Notes</td><td style="padding:7px 0;font-size:13px;text-align:right">${payment.notes}</td></tr>`:""}
      </tbody>
    </table>

    <div style="border-top:3px solid #1a1a1a;border-bottom:3px solid #1a1a1a;padding:12px 0;display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
      <span style="font-size:16px;font-weight:900">${payment.payment_type==="advance"?"ADVANCE PAID":"TOTAL PAID"}</span>
      <span style="font-size:26px;font-weight:900;color:${payment.payment_type==="advance"?"#d97706":"#16a34a"}">${new Intl.NumberFormat("en-US",{style:"currency",currency:"JMD"}).format(earned)}</span>
    </div>

    ${payment.payment_type==="advance"?`
    <div style="background:#fef3c7;border:1px solid #f59e0b;border-radius:8px;padding:10px 14px;margin-bottom:16px;font-size:12px;color:#92400e">
      ⚡ This is an advance payment. Balance will be settled upon completion of work.
    </div>`:""}

    ${payment.payment_type==="final"?`
    <div style="background:#d1fae5;border:1px solid #10b981;border-radius:8px;padding:10px 14px;margin-bottom:16px;font-size:12px;color:#065f46;text-align:center;font-weight:700">
      ✅ PAID IN FULL — All advances settled. Thank you!
    </div>`:""}

    ${payment.signature_data?`
    <div style="border-top:1px solid #e5e7eb;padding-top:14px;margin-top:8px">
      <div style="font-size:10px;color:#999;letter-spacing:1px;text-transform:uppercase;margin-bottom:6px">Worker Signature</div>
      <img src="${payment.signature_data}" style="height:56px;border:1px solid #e5e7eb;border-radius:6px;padding:4px"/>
      <div style="font-size:11px;color:#666;margin-top:4px">${payment.worker_name}</div>
    </div>`:""}

    ${watermark?.url?`<img src="${watermark.url}" style="position:fixed;bottom:6mm;right:6mm;height:${(watermark as any).size||25}mm;width:${(watermark as any).size||25}mm;object-fit:contain;object-position:bottom right;opacity:${watermark.opacity};pointer-events:none;z-index:0;-webkit-print-color-adjust:exact;print-color-adjust:exact"/>`:""}
    <div style="border-top:1px solid #e5e7eb;margin-top:16px;padding-top:12px;text-align:center;font-size:10px;color:#999">
      ${payment.public_view?"":`Paid by: ${payment.supervisor_name||""} · `}${new Date(payment.created_at||Date.now()).toLocaleDateString()}<br/>
      ${company?.company_name||""}${company?.tagline?` · "${company.tagline}"`:""}
    </div>
  </div>`;
}

// ── Public receipt data (what get_public_receipt returns) ────────────────────────────────────────────────────────────────────

export interface PublicReceiptCompany {
  name: string;
  logo_url: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  tagline: string | null;
}

export interface PublicReceipt {
  kind: "field_payment" | "client_payment";
  company: PublicReceiptCompany;
  receipt_number: string | null;
  receipt_date: string | null;
  party_name: string | null;
  project_name: string | null;
  payment_method: string | null;
  amount: number | string | null;
  // field payments
  work_date?: string | null;
  payment_type?: string | null;
  milestone_name?: string | null;
  task_name?: string | null;
  description?: string | null;
  previous_advances?: number | string | null;
  // client payments
  invoice_number?: string | null;
  reference_number?: string | null;
}

export function escapeHtml(v: unknown): string {
  return String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}

const fmtMoney = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "JMD" }).format(n);

// Only an https image address may be placed in the page; anything else is dropped (the receipt then shows the company name without a logo).
export function safeLogoUrl(u: unknown): string {
  const s = typeof u === "string" ? u.trim() : "";
  return /^https:\/\/[^\s"'<>]+$/i.test(s) ? s : "";
}

// 'YYYY-MM-DD' dates are shown as that calendar day (no time-zone shift); full timestamps as the local date.
function longDate(v: string | null | undefined): string {
  if (!v) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(v);
  return isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

const PAYMENT_TYPES = ["advance", "progress", "final", "payment"];

// The worker receipt, laid out exactly like the printed one (same generator), from the public data.
function fieldReceiptBody(r: PublicReceipt): string {
  const t = PAYMENT_TYPES.includes(String(r.payment_type)) ? String(r.payment_type) : "payment";
  const e = (v: string | null | undefined) => (v ? escapeHtml(v) : undefined);
  const co = r.company;
  const paymentData = {
    receipt_number: escapeHtml(r.receipt_number ?? ""),
    worker_name: escapeHtml(r.party_name ?? ""),
    work_date: r.work_date || r.receipt_date,
    work_type: e(r.description),
    payment_method: escapeHtml(r.payment_method || "cash"),
    total_amount: Number(r.amount) || 0,
    payment_type: t,
    previous_advances: t === "final" ? Number(r.previous_advances) || 0 : 0,
    project_name: e(r.project_name),
    milestone_name: e(r.milestone_name),
    task_name: e(r.task_name || r.description),   // same fallback as the printed receipt in the payments list
    created_at: r.receipt_date,
    public_view: true,
  };
  const company = { company_name: escapeHtml(co.name), address_line1: e(co.address), phone: e(co.phone), email: e(co.email), tagline: e(co.tagline) };
  const logo = safeLogoUrl(co.logo_url);
  return generateReceiptHTML(paymentData, company, logo ? escapeHtml(logo) : null);
}

// A simple receipt for a client payment: who paid, against what, how, how much. No invoice balance.
function clientReceiptBody(r: PublicReceipt): string {
  const co = r.company;
  const logo = safeLogoUrl(co.logo_url);
  const row = (label: string, value: string | null | undefined, extra = "") =>
    value ? `<tr style="border-bottom:1px solid #f0f0f0"><td style="padding:7px 0;color:#666;font-size:12px;width:140px">${label}</td><td style="padding:7px 0;font-size:13px;font-weight:600;text-align:right;${extra}">${escapeHtml(value)}</td></tr>` : "";
  const against = [r.invoice_number ? `Invoice ${r.invoice_number}` : "", r.project_name || ""].filter(Boolean).join(" · ");
  return `
  <div style="background:#fff;padding:32px;font-family:Georgia,serif;color:#1a1a1a;max-width:600px;margin:0 auto">
    <div style="text-align:center;border-bottom:3px solid #1a1a1a;padding-bottom:20px;margin-bottom:20px">
      ${logo ? `<img src="${escapeHtml(logo)}" style="display:block;width:auto;height:auto;max-height:90px;max-width:260px;object-fit:contain;margin:0 auto 10px"/>` : ""}
      <div style="font-size:18px;font-weight:900;letter-spacing:2px;text-transform:uppercase">${escapeHtml(co.name)}</div>
      ${co.address ? `<div style="font-size:11px;color:#666;margin-top:3px">${escapeHtml(co.address)}</div>` : ""}
      <div style="font-size:11px;color:#666">${co.phone ? `Tel: ${escapeHtml(co.phone)}` : ""}${co.phone && co.email ? " · " : ""}${escapeHtml(co.email || "")}</div>
      <div style="margin-top:12px">
        <div style="font-size:11px;font-weight:700;letter-spacing:3px;text-transform:uppercase;color:#0891b2">💰 PAYMENT RECEIVED</div>
        <div style="font-size:20px;font-weight:900;text-transform:uppercase;letter-spacing:3px;margin-top:4px">Payment Receipt</div>
        <div style="font-size:11px;color:#666;margin-top:3px">${r.receipt_number ? `Receipt #${escapeHtml(r.receipt_number)} · ` : ""}${escapeHtml(longDate(r.receipt_date))}</div>
      </div>
    </div>
    <table style="width:100%;border-collapse:collapse;margin-bottom:16px">
      <tbody>
        ${row("Received from", r.party_name)}
        ${row("Paid against", against)}
        ${row("Payment Method", (r.payment_method || "").replace(/_/g, " "), "text-transform:uppercase")}
        ${row("Reference", r.reference_number)}
      </tbody>
    </table>
    <div style="border-top:3px solid #1a1a1a;border-bottom:3px solid #1a1a1a;padding:12px 0;display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
      <span style="font-size:16px;font-weight:900">AMOUNT RECEIVED</span>
      <span style="font-size:26px;font-weight:900;color:#16a34a">${escapeHtml(fmtMoney(Number(r.amount) || 0))}</span>
    </div>
    <div style="border-top:1px solid #e5e7eb;margin-top:16px;padding-top:12px;text-align:center;font-size:10px;color:#999">
      Thank you for your payment.<br/>
      ${escapeHtml(co.name)}${co.tagline ? ` · "${escapeHtml(co.tagline)}"` : ""}
    </div>
  </div>`;
}

export function buildPublicReceiptHtml(r: PublicReceipt): string {
  return r.kind === "client_payment" ? clientReceiptBody(r) : fieldReceiptBody(r);
}

// The full print document (shown in the in-app print preview: Print, or "Save as PDF" in the browser's print dialog).
export function buildPublicReceiptDocument(r: PublicReceipt): string {
  return buildPrintDocument(buildPublicReceiptHtml(r), { title: `Receipt ${r.receipt_number || ""}`.trim() });
}
