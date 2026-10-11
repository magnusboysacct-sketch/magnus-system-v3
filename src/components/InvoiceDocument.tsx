// src/components/InvoiceDocument.tsx
//
// THE printable invoice. Modeled on ContractDocument: one component that takes plain data only (no database access) and is
// printed through the shared openPrintWindow helper. It is rendered to static markup at print time, so nothing about the
// on-screen Invoice Details modal changes.
//   invoice    the client_invoices row (invoice_number, invoice_date, due_date, status, subtotal, tax_rate, tax_amount,
//              total_amount, amount_paid, balance_due, terms; the internal notes field is never printed)
//   lineItems  client_invoice_line_items rows (line_number, description, quantity, unit, rate, amount)
//   payments   client_payments rows (payment_date, payment_method, reference_number, amount)
//   client     the bill-to client {name, contact_name, email, phone, address}
//   company    company_settings (company_name, logo_url, address_line1/2, parish, phone, email, website)
//   signature  the "Authorized by" block: an optional image plus the signer's name/title
// The signature comes from the invoice's creator (their personal signature, else the company default, else a blank line);
// a missing signature never stops an invoice from printing.
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { supabase } from "../lib/supabase";
import { openPrintWindow } from "../lib/printUtils";
import { formatContractDate } from "../lib/contractDocument";
import { resolveCompanySignature, resolveUserSignature, type ResolvedSignature } from "../lib/userSignature";
import { watermarkFromCompany } from "./ContractDocument";

const fmtDate = (d: string | null | undefined) => formatContractDate(d) || "—";
function fmtJMD(n: unknown) {
  const v = Number(n);
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "JMD", minimumFractionDigits: 2 }).format(Number.isFinite(v) ? v : 0);
}
const fmtQty = (n: unknown) => {
  const v = Number(n);
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 3 }).format(Number.isFinite(v) ? v : 0);
};
const titleCase = (s: unknown) => String(s || "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

export interface InvoiceSignatureBlock {
  src: string | null; // image to show, or null for a blank signature line
  signerName?: string | null;
  signerTitle?: string | null;
}

export interface InvoiceDocumentProps {
  invoice: any;
  lineItems: any[];
  payments: any[];
  client?: { name?: string | null; contact_name?: string | null; email?: string | null; phone?: string | null; address?: string | null } | null;
  projectName?: string | null;
  company?: any;
  signature?: InvoiceSignatureBlock | null;
}

export const INVOICE_PRINT_CSS = `
      .inv-page{max-width:800px;margin:0 auto;padding:40px 48px}
      table{width:100%;border-collapse:collapse}
      thead{display:table-header-group}
      tr{page-break-inside:avoid}
      .inv-section{page-break-inside:avoid}
    `;

const STATUS_COLOR: Record<string, string> = { paid: "#16a34a", overdue: "#dc2626", partial: "#d97706", cancelled: "#6b7280" };

const th: React.CSSProperties = { background: "#1a1a1a", color: "white", padding: "8px 10px", textAlign: "left", fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5 };
const td: React.CSSProperties = { padding: "8px 10px", borderBottom: "1px solid #e5e7eb", fontSize: 12, verticalAlign: "top" };
const label: React.CSSProperties = { fontSize: 10, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase", color: "#9ca3af", marginBottom: 4 };

export default function InvoiceDocument({ invoice, lineItems, payments, client, projectName, company, signature }: InvoiceDocumentProps) {
  const status = String(invoice?.status || "").toLowerCase();
  const address = [company?.address_line1, company?.address_line2, company?.parish].map((s: any) => (s ? String(s).trim() : "")).filter(Boolean).join(", ");
  const contactLine = [company?.phone, company?.email, company?.website].filter(Boolean).join(" · ");
  const showTax = Number(invoice?.tax_amount || 0) > 0 || Number(invoice?.tax_rate || 0) > 0;
  const items = Array.isArray(lineItems) ? lineItems : [];
  const pays = Array.isArray(payments) ? payments : [];
  const sigName = signature?.signerName || "";
  const sigTitle = signature?.signerTitle || "";

  return (
    <div id="invoice-print-content" style={{ position: "relative" }}>
      <div className="inv-page" style={{ fontFamily: "Georgia,serif", color: "#1a1a1a" }}>

        {/* Company header + invoice title */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 24, paddingBottom: 18, borderBottom: "3px solid #1a1a1a", marginBottom: 24 }}>
          <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
            {company?.logo_url && (
              <img src={company.logo_url} alt="logo" style={{ width: 64, height: 64, borderRadius: 8, objectFit: "contain" }} />
            )}
            <div>
              <div style={{ fontSize: 17, fontWeight: 800 }}>{company?.company_name || ""}</div>
              {address && <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>{address}</div>}
              {contactLine && <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>{contactLine}</div>}
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 28, fontWeight: 900, letterSpacing: 2 }}>INVOICE</div>
            <div style={{ fontSize: 13, fontWeight: 700, marginTop: 2 }}>{invoice?.invoice_number || ""}</div>
          </div>
        </div>

        {/* Invoice facts + bill to */}
        <div style={{ display: "flex", justifyContent: "space-between", gap: 24, marginBottom: 24 }}>
          <div style={{ flex: 1 }}>
            <div style={label}>Bill To</div>
            <div style={{ fontSize: 14, fontWeight: 700 }}>{client?.name || "—"}</div>
            {client?.contact_name && client.contact_name !== client?.name && <div style={{ fontSize: 12, color: "#4b5563" }}>Attn: {client.contact_name}</div>}
            {client?.address && <div style={{ fontSize: 12, color: "#4b5563", whiteSpace: "pre-line" }}>{client.address}</div>}
            {client?.email && <div style={{ fontSize: 12, color: "#4b5563" }}>{client.email}</div>}
            {client?.phone && <div style={{ fontSize: 12, color: "#4b5563" }}>{client.phone}</div>}
            {projectName && <div style={{ fontSize: 12, marginTop: 8 }}><span style={{ color: "#9ca3af" }}>Project: </span>{projectName}</div>}
          </div>
          <div style={{ minWidth: 220 }}>
            <table>
              <tbody>
                {([
                  ["Invoice Date", fmtDate(invoice?.invoice_date)],
                  ["Due Date", fmtDate(invoice?.due_date)],
                ] as [string, string][]).map(([k, v]) => (
                  <tr key={k}>
                    <td style={{ padding: "3px 0", fontSize: 11, color: "#9ca3af", textTransform: "uppercase", letterSpacing: 0.5 }}>{k}</td>
                    <td style={{ padding: "3px 0", fontSize: 12, fontWeight: 700, textAlign: "right" }}>{v}</td>
                  </tr>
                ))}
                <tr>
                  <td style={{ padding: "3px 0", fontSize: 11, color: "#9ca3af", textTransform: "uppercase", letterSpacing: 0.5 }}>Status</td>
                  <td style={{ padding: "3px 0", fontSize: 12, fontWeight: 800, textAlign: "right", textTransform: "uppercase", color: STATUS_COLOR[status] || "#1a1a1a" }}>{status || "—"}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Line items */}
        <div className="inv-section" style={{ marginBottom: 20 }}>
          <table>
            <thead>
              <tr>
                <th style={{ ...th, width: 30 }}>#</th>
                <th style={th}>Description</th>
                <th style={{ ...th, textAlign: "right" }}>Qty</th>
                <th style={th}>Unit</th>
                <th style={{ ...th, textAlign: "right" }}>Rate</th>
                <th style={{ ...th, textAlign: "right" }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr><td colSpan={6} style={{ ...td, textAlign: "center", color: "#9ca3af" }}>No line items</td></tr>
              ) : items.map((it, i) => (
                <tr key={it.id || i}>
                  <td style={{ ...td, color: "#9ca3af" }}>{it.line_number || i + 1}</td>
                  <td style={td}>{it.description}{it.notes ? <div style={{ fontSize: 10, color: "#6b7280" }}>{it.notes}</div> : null}</td>
                  <td style={{ ...td, textAlign: "right" }}>{fmtQty(it.quantity)}</td>
                  <td style={td}>{it.unit || ""}</td>
                  <td style={{ ...td, textAlign: "right" }}>{fmtJMD(it.rate)}</td>
                  <td style={{ ...td, textAlign: "right", fontWeight: 700 }}>{fmtJMD(it.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Totals */}
        <div className="inv-section" style={{ display: "flex", justifyContent: "flex-end", marginBottom: 28 }}>
          <table style={{ width: 300 }}>
            <tbody>
              <tr>
                <td style={{ padding: "4px 0", fontSize: 12, color: "#6b7280" }}>Subtotal</td>
                <td style={{ padding: "4px 0", fontSize: 12, textAlign: "right" }}>{fmtJMD(invoice?.subtotal)}</td>
              </tr>
              {showTax && (
                <tr>
                  <td style={{ padding: "4px 0", fontSize: 12, color: "#6b7280" }}>Tax ({Number(invoice?.tax_rate || 0)}%)</td>
                  <td style={{ padding: "4px 0", fontSize: 12, textAlign: "right" }}>{fmtJMD(invoice?.tax_amount)}</td>
                </tr>
              )}
              <tr>
                <td style={{ padding: "6px 0", fontSize: 13, fontWeight: 800, borderTop: "1px solid #1a1a1a" }}>Total</td>
                <td style={{ padding: "6px 0", fontSize: 13, fontWeight: 800, textAlign: "right", borderTop: "1px solid #1a1a1a" }}>{fmtJMD(invoice?.total_amount)}</td>
              </tr>
              <tr>
                <td style={{ padding: "4px 0", fontSize: 12, color: "#6b7280" }}>Amount Paid</td>
                <td style={{ padding: "4px 0", fontSize: 12, textAlign: "right", color: "#16a34a" }}>{fmtJMD(invoice?.amount_paid)}</td>
              </tr>
              <tr>
                <td style={{ padding: "8px 0", fontSize: 15, fontWeight: 900, borderTop: "2px solid #1a1a1a" }}>Balance Due</td>
                <td style={{ padding: "8px 0", fontSize: 15, fontWeight: 900, textAlign: "right", borderTop: "2px solid #1a1a1a" }}>{fmtJMD(invoice?.balance_due)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Payment history (only when there are payments) */}
        {pays.length > 0 && (
          <div className="inv-section" style={{ marginBottom: 28 }}>
            <div style={{ ...label, marginBottom: 6 }}>Payments Received</div>
            <table>
              <thead>
                <tr>
                  <th style={th}>Date</th>
                  <th style={th}>Method</th>
                  <th style={th}>Reference</th>
                  <th style={{ ...th, textAlign: "right" }}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {pays.map((p, i) => (
                  <tr key={p.id || i}>
                    <td style={td}>{fmtDate(p.payment_date)}</td>
                    <td style={td}>{titleCase(p.payment_method) || "—"}</td>
                    <td style={td}>{p.reference_number || "—"}</td>
                    <td style={{ ...td, textAlign: "right", fontWeight: 700 }}>{fmtJMD(p.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Payment terms (only when present). The internal notes field is deliberately never printed. */}
        {invoice?.terms && (
          <div className="inv-section" style={{ marginBottom: 28, fontSize: 12 }}>
            <div style={label}>Payment Terms</div>
            <div style={{ whiteSpace: "pre-line" }}>{invoice.terms}</div>
          </div>
        )}

        {/* Signature block: the image only when one was found; otherwise just the blank line */}
        <div className="inv-section" style={{ marginTop: 36, marginBottom: 32 }}>
          <div style={{ width: 260 }}>
            {signature?.src ? (
              <img data-signature="invoice" src={signature.src} alt="Authorized signature" style={{ maxHeight: 60, maxWidth: 220, objectFit: "contain", display: "block", marginBottom: 6 }} />
            ) : (
              <div style={{ height: 54 }} />
            )}
            <div style={{ borderTop: "2px solid #1a1a1a", paddingTop: 6, fontSize: 11, color: "#6b7280" }}>
              Authorized by{sigName ? `: ${sigName}` : ""}
            </div>
            {sigTitle && <div style={{ fontSize: 11, color: "#9ca3af" }}>{sigTitle}</div>}
          </div>
        </div>

        {/* Footer */}
        <div style={{ borderTop: "1px solid #e5e7eb", paddingTop: 12, textAlign: "center", fontSize: 10, color: "#9ca3af" }}>
          Thank you for your business{company?.company_name ? ` · ${company.company_name}` : ""}
        </div>
      </div>
    </div>
  );
}

// Renders the invoice to markup ready for openPrintWindow.
export function renderInvoiceHtml(props: InvoiceDocumentProps): string {
  return `<style>${INVOICE_PRINT_CSS}</style>${renderToStaticMarkup(<InvoiceDocument {...props} />)}`;
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));

// Which signature goes on an invoice: the creator's personal signature if they saved one, else the company default, else none.
// The signer's name/title are shown only next to a PERSONAL signature (a company signature is not one person's).
async function resolveInvoiceSignature(invoice: any): Promise<InvoiceSignatureBlock> {
  let resolved: ResolvedSignature | null = null;
  try {
    // With no recorded creator, only the company default applies (never the signed-in user's own signature).
    resolved = invoice?.created_by
      ? await resolveUserSignature(invoice.created_by)
      : await resolveCompanySignature(invoice?.company_id);
  } catch {
    resolved = null;
  }
  if (!resolved) return { src: null };
  if (resolved.source === "personal" && invoice?.created_by) {
    try {
      const { data } = await supabase.from("user_profiles").select("full_name, job_title").eq("id", invoice.created_by).maybeSingle();
      return { src: resolved.url, signerName: data?.full_name ?? null, signerTitle: data?.job_title ?? null };
    } catch {
      /* the image is enough */
    }
  }
  return { src: resolved.url };
}

// Prints an invoice. The window is opened synchronously (pop-up blockers only allow that inside the click) and shows a short
// "preparing" message while the company, client and signature are loaded, then the real document replaces it.
// Returns false when the browser blocked the window. Anything that can't be loaded is simply left off the document.
export async function printInvoiceFresh(opts: { invoice: any; lineItems: any[]; payments: any[] }): Promise<boolean> {
  const { invoice, lineItems, payments } = opts;
  const w = window.open("", "_blank");
  if (!w) return false;
  try {
    w.document.write('<!DOCTYPE html><html><head><title>Preparing invoice…</title></head><body style="font-family:sans-serif;color:#555;padding:24px">Preparing invoice…</body></html>');
  } catch { /* the placeholder is cosmetic */ }

  try {
    const [company, client, signature] = await Promise.all([
      (async () => {
        try {
          if (!invoice?.company_id) return null;
          const { data } = await supabase.from("company_settings").select("*").eq("company_id", invoice.company_id).maybeSingle();
          return data ?? null;
        } catch { return null; }
      })(),
      (async () => {
        try {
          if (!invoice?.client_id) return invoice?.clients?.name ? { name: invoice.clients.name } : null;
          const { data } = await supabase.from("clients").select("name, contact_name, email, phone, address").eq("id", invoice.client_id).maybeSingle();
          return data ?? (invoice?.clients?.name ? { name: invoice.clients.name } : null);
        } catch { return invoice?.clients?.name ? { name: invoice.clients.name } : null; }
      })(),
      resolveInvoiceSignature(invoice),
    ]);

    const html = renderInvoiceHtml({ invoice, lineItems, payments, client, projectName: invoice?.projects?.name ?? null, company, signature });
    return openPrintWindow(html, {
      title: escapeHtml(`Invoice ${invoice?.invoice_number || ""}`.trim()),
      watermark: watermarkFromCompany(company),
      tagline: company?.tagline ?? undefined,
      waitForImages: true,
      existingWindow: w,
    });
  } catch (e) {
    try { w.close(); } catch { /* ignore */ }
    throw e;
  }
}
