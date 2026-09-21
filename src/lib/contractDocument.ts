// src/lib/contractDocument.ts
//
// Shared, read-only helpers for showing a contract to a client and for printing it:
// which fields appear (empty ones are skipped), Jamaica-time / date-only-safe formatting,
// and the printable HTML for the client's own signed copy.
//
// The contract's internal `notes` field is deliberately NOT part of any of this.
export function escapeHtml(v: unknown): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Date-only values (YYYY-MM-DD) are calendar dates and must not shift a day in Jamaica;
// full timestamps are shown in Jamaica time.
export function formatContractDate(d: unknown): string {
  if (!d) return "";
  const s = String(d);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  const dt = m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])) : new Date(s);
  if (isNaN(dt.getTime())) return "";
  return dt.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: m ? "UTC" : "America/Jamaica",
  });
}

// "Sep 20, 2026, 8:07 PM" in Jamaica time (the year is always shown - this is a record).
export function formatJamaicaDateTimeFull(iso: unknown): string {
  if (!iso) return "";
  try {
    const dt = new Date(String(iso));
    if (isNaN(dt.getTime())) return "";
    return dt.toLocaleString("en-US", {
      timeZone: "America/Jamaica",
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

function formatMoney(n: unknown): string {
  const v = Number(n);
  if (n === null || n === undefined || n === "" || isNaN(v)) return "";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "JMD" }).format(v);
}

function prettyBilling(v: unknown): string {
  const s = String(v || "").trim();
  if (!s) return "";
  if (s === "time_materials") return "Time & materials";
  const t = s.replace(/_/g, " ");
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export interface ContractRow {
  label: string;
  value: string;
}

export interface ContractSection {
  key: string;
  title: string;
  text: string;
}

// Short facts, in reading order. Empty ones are skipped.
export function contractSummaryRows(c: any): ContractRow[] {
  const rows: ContractRow[] = [];
  const add = (label: string, value: string) => {
    if (value && value.trim()) rows.push({ label, value });
  };
  add("Contract No.", String(c?.contract_number || ""));
  add("Contract Date", formatContractDate(c?.contract_date));
  add("Start Date", formatContractDate(c?.start_date));
  add("Completion Date", formatContractDate(c?.completion_date));
  add("Contract Amount", formatMoney(c?.contract_amount));
  if (c?.retention_percent !== null && c?.retention_percent !== undefined && c?.retention_percent !== "") {
    add("Retention", `${Number(c.retention_percent) || 0}%`);
  }
  add("Billing Schedule", prettyBilling(c?.billing_schedule));
  if (c?.warranty_period_months !== null && c?.warranty_period_months !== undefined && c?.warranty_period_months !== "") {
    add("Warranty Period", `${Number(c.warranty_period_months) || 0} months`);
  }
  add("Governing Law", String(c?.governing_law || ""));
  return rows;
}

// Longer clauses, in reading order. Empty ones are skipped.
export function contractLongSections(c: any): ContractSection[] {
  const out: ContractSection[] = [];
  const add = (key: string, title: string, v: unknown) => {
    const text = String(v ?? "").trim();
    if (text) out.push({ key, title, text });
  };
  add("payment_terms", "Payment Terms", c?.payment_terms);
  add("scope_of_work", "Scope of Work", c?.scope_of_work);
  add("terms_and_conditions", "Terms & Conditions", c?.terms_and_conditions);
  add("penalty_clause", "Penalty Clause", c?.penalty_clause);
  add("insurance_details", "Insurance", c?.insurance_details);
  return out;
}

// A clean, print-ready document for the client's own signed copy (opened in a print window).
export function buildPortalContractHtml(opts: {
  contract: any;
  company: any;
  clientName: string;
}): string {
  const { contract: c, company, clientName } = opts;
  const rows = contractSummaryRows(c);
  const sections = contractLongSections(c);
  const contact = [company?.address_line1, company?.phone, company?.email].filter(Boolean).map(escapeHtml).join(" &middot; ");
  const coName = escapeHtml(company?.company_name || "Magnus Boys Construction");

  const sigSide = (label: string, at: unknown, url: unknown) => {
    const img = at && url ? `<img class="sig" src="${escapeHtml(url)}" alt="${escapeHtml(label)} signature"/>` : "";
    const cap = at ? `Signed ${escapeHtml(formatJamaicaDateTimeFull(at))}` : "Signature pending";
    return `<div class="sigbox"><div class="siglabel">${escapeHtml(label)}</div>${img}<div class="sigcap">${cap}</div></div>`;
  };

  return `<style>
    .page{max-width:800px;margin:0 auto;padding:40px 48px;font-family:Georgia,serif;color:#1a1a1a}
    .head{text-align:center;margin-bottom:20px}
    .co{font-size:18px;font-weight:800}
    .sub{font-size:11px;color:#6b7280;margin-top:3px}
    .kicker{text-align:center;font-size:10px;letter-spacing:4px;color:#9ca3af;font-weight:700;margin-top:18px}
    h1{text-align:center;font-size:24px;font-weight:800;margin:4px 0 6px}
    .prep{text-align:center;font-size:12px;color:#6b7280;margin-bottom:22px}
    table{width:100%;border-collapse:collapse;margin-bottom:8px}
    td{padding:7px 10px;border-bottom:1px solid #e5e7eb;font-size:13px;vertical-align:top}
    td.k{width:180px;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.5px}
    h2{font-size:14px;font-weight:700;margin:22px 0 8px;border-bottom:2px solid #1a1a1a;padding-bottom:5px;text-transform:uppercase;letter-spacing:.8px}
    .txt{font-size:12.5px;line-height:1.8;white-space:pre-wrap;color:#374151}
    .sec{page-break-inside:avoid}
    .sigs{display:grid;grid-template-columns:1fr 1fr;gap:40px;margin-top:8px}
    .sigbox{page-break-inside:avoid}
    .siglabel{font-size:12px;font-weight:700;text-transform:uppercase;margin-bottom:6px}
    .sig{max-height:70px;max-width:220px;object-fit:contain;display:block;margin-bottom:4px}
    .sigcap{border-top:1px solid #1a1a1a;padding-top:5px;font-size:11px;color:#374151}
    .foot{margin-top:34px;border-top:2px solid #1a1a1a;padding-top:10px;text-align:center;font-size:10px;color:#9ca3af}
  </style>
  <div class="page">
    <div class="head"><div class="co">${coName}</div>${contact ? `<div class="sub">${contact}</div>` : ""}</div>
    <div class="kicker">CONTRACT</div>
    <h1>${escapeHtml(c?.contract_name || "")}</h1>
    <div class="prep">Prepared for ${escapeHtml(clientName || "the client")}</div>
    ${rows.length ? `<table><tbody>${rows.map((r) => `<tr><td class="k">${escapeHtml(r.label)}</td><td>${escapeHtml(r.value)}</td></tr>`).join("")}</tbody></table>` : ""}
    ${sections.map((s) => `<div class="sec"><h2>${escapeHtml(s.title)}</h2><div class="txt">${escapeHtml(s.text)}</div></div>`).join("")}
    <div class="sec"><h2>Signatures</h2>
      <div class="sigs">${sigSide("Contractor", c?.contractor_signed_at, c?.contractor_signature_url)}${sigSide("Client", c?.client_signed_at, c?.client_signature_url)}</div>
    </div>
    <div class="foot">${coName}${contact ? " &middot; " + contact : ""}</div>
  </div>`;
}
