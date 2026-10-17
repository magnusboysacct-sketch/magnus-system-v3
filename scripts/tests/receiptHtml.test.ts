// Unit tests for the public receipt document (src/lib/receiptHtml.ts): what it shows, what it must never show, and that database text is escaped.
// Run:  npm run test:share
import test from "node:test";
import assert from "node:assert/strict";
import { buildPublicReceiptHtml, escapeHtml, generateReceiptHTML, safeLogoUrl, type PublicReceipt } from "../../src/lib/receiptHtml";

const jmd = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "JMD" }).format(n);   // the receipts format money this way
const COMPANY = { name: "Veron Williams Construction", logo_url: "https://abcdefgh.supabase.co/storage/v1/object/public/company-logos/co-1/logo.png",
  address: "1 Main St, Kingston, Jamaica", phone: "876-555-0100", email: "office@example.com", tagline: "Built to last" };

const field = (over: Partial<PublicReceipt> = {}): PublicReceipt => ({
  kind: "field_payment", company: COMPANY, receipt_number: "FP-202610-123456", receipt_date: "2026-10-05T14:00:00Z", work_date: "2026-10-05",
  payment_type: "final", party_name: "Jane Doe", project_name: "Mango Villa", milestone_name: "Slab", task_name: "Pour slab", description: "Pour slab (20 m3)",
  payment_method: "bank_transfer", amount: 50000, previous_advances: 15000, ...over,
});
const client = (over: Partial<PublicReceipt> = {}): PublicReceipt => ({
  kind: "client_payment", company: COMPANY, receipt_number: "PAY-1", receipt_date: "2026-10-05", party_name: "Acme Ltd", invoice_number: "INV-0042",
  project_name: "Mango Villa", payment_method: "check", reference_number: "CHQ 991", amount: 120000, ...over,
});

test("public worker receipt: company, name, project, amount and the previous-advances line on a final payment", () => {
  const html = buildPublicReceiptHtml(field());
  for (const s of ["Veron Williams Construction", "Jane Doe", "Mango Villa", "Slab", "Pour slab", "FP-202610-123456", "Previous Advances", jmd(15000), jmd(50000), "PAID IN FULL", COMPANY.logo_url])
    assert.ok(html.includes(s), s);
});

test("public worker receipt: no ID number, phone, signature, notes or 'Paid by' (the data is not even in the payload, and the builder never prints them)", () => {
  const html = buildPublicReceiptHtml(field());
  for (const label of ["ID Number", "Phone", "Worker Signature", "Notes", "Paid by"]) assert.equal(html.includes(label), false, label);
  // even if a caller passed extra fields they are never read
  const sneaky = { ...field(), worker_id_number: "123-456-789", worker_phone: "876-999-0000", signature_data: "data:image/png;base64,AAAA", notes: "secret", supervisor_name: "Boss" } as unknown as PublicReceipt;
  const h2 = buildPublicReceiptHtml(sneaky);
  for (const s of ["123-456-789", "876-999-0000", "data:image/png", "secret", "Boss"]) assert.equal(h2.includes(s), false, s);
});

test("public worker receipt: advance receipts keep the text line and show no previous-advances row; other types show none either", () => {
  const adv = buildPublicReceiptHtml(field({ payment_type: "advance", previous_advances: null }));
  assert.ok(adv.includes("This is an advance payment. Balance will be settled upon completion of work."));
  assert.equal(adv.includes("Previous Advances"), false);
  assert.equal(buildPublicReceiptHtml(field({ payment_type: "payment", previous_advances: 999 })).includes("Previous Advances"), false);
  assert.equal(buildPublicReceiptHtml(field({ payment_type: "final", previous_advances: 0 })).includes("Previous Advances"), false);
});

test("public receipts escape every database string (no HTML injection through names, project, description, company)", () => {
  const evil = `<img src=x onerror=alert(1)>"'&`;
  const html = buildPublicReceiptHtml(field({ party_name: evil, project_name: evil, milestone_name: evil, task_name: evil, description: evil, receipt_number: evil,
    company: { ...COMPANY, name: evil, address: evil, phone: evil, email: evil, tagline: evil } }));
  assert.equal(html.includes("<img src=x"), false);
  assert.equal(/onerror=alert\(1\)>/.test(html.replace(/&lt;img src=x onerror=alert\(1\)&gt;/g, "")), false);
  assert.ok(html.includes("&lt;img src=x onerror=alert(1)&gt;"));
  const c = buildPublicReceiptHtml(client({ party_name: evil, invoice_number: evil, project_name: evil, reference_number: evil, company: { ...COMPANY, name: evil } }));
  assert.equal(c.includes("<img src=x"), false);
});

test("logo: only an https address is placed in the page, and it is attribute-escaped", () => {
  assert.equal(safeLogoUrl("javascript:alert(1)"), "");
  assert.equal(safeLogoUrl("data:image/png;base64,AAAA"), "");
  assert.equal(safeLogoUrl('https://x.test/a.png" onerror="alert(1)'), "");
  assert.equal(safeLogoUrl(null), "");
  assert.equal(safeLogoUrl(COMPANY.logo_url), COMPANY.logo_url);
  const h = buildPublicReceiptHtml(field({ company: { ...COMPANY, logo_url: "javascript:alert(1)" } }));
  assert.equal(h.includes("javascript:"), false);
  assert.ok(h.includes("Veron Williams Construction"));   // the company name still shows without a logo
});

test("public client receipt: simple layout with invoice number and project, no invoice balance", () => {
  const html = buildPublicReceiptHtml(client());
  for (const s of ["Veron Williams Construction", "Acme Ltd", "Invoice INV-0042", "Mango Villa", "CHQ 991", jmd(120000), "AMOUNT RECEIVED", "PAY-1", "October 5, 2026"]) assert.ok(html.includes(s), s);
  for (const s of ["Balance", "Remaining", "Previous Advances", "Worker"]) assert.equal(html.includes(s), false, s);
  assert.equal(buildPublicReceiptHtml(client({ invoice_number: null })).includes("Invoice INV"), false);
});

test("printed receipt is unchanged when the staff print it (Paid by line, ID and phone rows still there)", () => {
  const html = generateReceiptHTML({ receipt_number: "FP-1", worker_name: "Jane Doe", worker_id_number: "123", worker_phone: "876", payment_type: "payment", total_amount: 100,
    supervisor_name: "Boss", created_at: "2026-10-05T14:00:00Z", work_date: "2026-10-05", payment_method: "cash" }, { company_name: "Co" });
  for (const s of ["ID Number", "Phone", "Paid by: Boss"]) assert.ok(html.includes(s), s);
});

test("escapeHtml", () => assert.equal(escapeHtml(`<a href="x">&'</a>`), "&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;"));

test("a date-only work date is that calendar day in any time zone (not the day before)", () => {
  for (const tz of ["America/Jamaica", "UTC", "Pacific/Auckland"]) {
    const out = require_tz(tz);
    assert.ok(out.includes("October 5, 2026"), tz + ": " + out);
  }
});
function require_tz(tz: string): string {
  const prev = process.env.TZ;
  process.env.TZ = tz;
  try {
    const html = generateReceiptHTML({ receipt_number: "FP-1", worker_name: "J", payment_type: "payment", total_amount: 1, work_date: "2026-10-05", payment_method: "cash", created_at: "2026-10-05T14:00:00Z" }, { company_name: "Co" });
    return /Work Date<\/td><td[^>]*>([^<]*)</.exec(html)?.[1] ?? "";
  } finally { if (prev === undefined) delete process.env.TZ; else process.env.TZ = prev; }
}
