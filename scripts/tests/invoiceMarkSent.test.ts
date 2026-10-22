// "Mark as sent" for client invoices (src/lib/invoiceMarkSent.ts, src/components/MarkAsSentModal.tsx, src/pages/AccountsReceivablePage.tsx, migration 20260954000000).
// (The database side is also run in memory against the real migration.)
// Run:  npm run test:marksent
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  SENT_METHODS, canMarkSent, canUndoMarkedSent, defaultMarkSent, isMarkedSent, jamaicaToday, markSentError, markedSentDetails, markedSentLine, sentMethodLabel, validateMarkSent,
  type MarkSentInput,
} from "../../src/lib/invoiceMarkSent";

const ok: MarkSentInput = { sentDate: "2026-10-20", method: "hand_delivered", note: "", reminders: false, portal: true };

test("the five delivery options, in the order and wording asked for", () => {
  assert.deepEqual(SENT_METHODS.map((m) => m.label), ["Hand delivered", "WhatsApp", "Printed", "Not sent (records only)", "Other"]);
  assert.equal(sentMethodLabel("hand_delivered"), "Hand delivered"); assert.equal(sentMethodLabel("not_sent"), "Not sent (records only)"); assert.equal(sentMethodLabel(null), "");
});

test("who may mark: the same roles that can send; who may undo: director and admin only", () => {
  for (const r of ["director", "admin", "estimator", "supervisor", "office_user", "secretary"]) assert.equal(canMarkSent(r), true, r);
  for (const r of ["site_user", "worker", "", null, undefined, "Director"]) assert.equal(canMarkSent(r as string), false, String(r));
  for (const r of ["director", "admin"]) assert.equal(canUndoMarkedSent(r), true, r);
  for (const r of ["secretary", "estimator", "supervisor", "office_user", "site_user", null, undefined]) assert.equal(canUndoMarkedSent(r as string), false, String(r));
});

test("the date: a real date, today or earlier, never in the future", () => {
  assert.equal(validateMarkSent(ok, "2026-10-20"), null, "today");
  assert.equal(validateMarkSent({ ...ok, sentDate: "2026-01-02" }, "2026-10-20"), null, "back-dated");
  assert.match(String(validateMarkSent({ ...ok, sentDate: "2026-10-21" }, "2026-10-20")), /future/);
  for (const bad of ["", "20/10/2026", "2026-13-40", "yesterday"]) assert.match(String(validateMarkSent({ ...ok, sentDate: bad }, "2026-10-20")), /Enter the date/, bad);
});

test("the method is required; 'Other' needs a note; the note is capped", () => {
  assert.match(String(validateMarkSent({ ...ok, method: "" }, "2026-10-20")), /how the invoice was delivered/);
  assert.match(String(validateMarkSent({ ...ok, method: "other", note: "  " }, "2026-10-20")), /Add a note/);
  assert.equal(validateMarkSent({ ...ok, method: "other", note: "couriered" }, "2026-10-20"), null);
  assert.equal(validateMarkSent({ ...ok, method: "not_sent" }, "2026-10-20"), null, "'Not sent' needs no note");
  assert.match(String(validateMarkSent({ ...ok, note: "x".repeat(501) }, "2026-10-20")), /too long/);
});

test("defaults: today, reminders OFF, portal ON only when the client has portal access", () => {
  const d = defaultMarkSent(true, "2026-10-20");
  assert.deepEqual(d, { sentDate: "2026-10-20", method: "hand_delivered", note: "", reminders: false, portal: true });
  assert.equal(defaultMarkSent(false, "2026-10-20").portal, false);
  assert.match(jamaicaToday(new Date("2026-10-21T03:30:00Z")), /^2026-10-20$/, "Jamaica is UTC-5: 03:30 UTC is still the 20th there");
  assert.match(jamaicaToday(), /^\d{4}-\d{2}-\d{2}$/);
});

test("the line on the invoice: 'Marked as sent by <name> on <date> - <method>'", () => {
  const inv = { status: "sent", marked_sent_at: "2026-10-21T14:00:00Z", marked_sent_by_name: "Jane Smith", sent_date: "2026-10-03", sent_method: "hand_delivered" };
  assert.equal(markedSentLine(inv), "Marked as sent by Jane Smith on Oct 3, 2026 - Hand delivered");
  assert.equal(markedSentLine({ ...inv, marked_sent_by_name: null, sent_method: "not_sent" }), "Marked as sent on Oct 3, 2026 - Not sent (records only)");
  assert.equal(isMarkedSent(inv), true);
  assert.equal(isMarkedSent({ ...inv, status: "draft" }), false, "back to draft: no longer marked");
  assert.equal(isMarkedSent({ status: "sent", marked_sent_at: null, sent_method: null }), false, "a normally sent invoice");
  assert.equal(isMarkedSent(null), false);
  assert.deepEqual(markedSentDetails({ marked_sent_note: "left with foreman", marked_sent_reminders: false, marked_sent_portal: true }),
    ["Note: left with foreman", "Automatic payment reminders: off", "Shown in the client portal"]);
  assert.deepEqual(markedSentDetails({ marked_sent_reminders: true, marked_sent_portal: false }), ["Automatic payment reminders: on", "Not shown in the client portal"]);
});

test("database answers become readable messages", () => {
  assert.match(markSentError({ code: "42501", message: "x" }), /Only a director or admin/);
  assert.match(markSentError({ message: "Only a draft invoice can be marked as sent" }), /Only a draft invoice/);
  assert.match(markSentError({ message: "A payment is recorded against this invoice, so it can no longer be taken back to draft" }), /payment is recorded/);
  assert.match(markSentError({ message: "This invoice was also sent to the client (email). Withdraw it from the client instead" }), /Withdraw it from the client/);
  assert.match(markSentError({ message: "The date sent cannot be in the future" }), /future/);
  assert.match(markSentError({ message: "boom" }), /could not be updated: boom/);
  assert.match(markSentError(null), /could not be updated/);
});

test("the migration: columns, the two functions, their permissions, the hidden-from-client columns, no change to existing invoices", () => {
  const sql = readFileSync("supabase/migrations/20260954000000_invoice_mark_as_sent.sql", "utf8");
  for (const c of ["sent_method", "marked_sent_at", "marked_sent_by ", "marked_sent_by_name", "marked_sent_note", "marked_sent_reminders", "marked_sent_portal"]) assert.ok(sql.includes(`ADD COLUMN IF NOT EXISTS ${c}`) || sql.includes(c), c);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.mark_invoice_sent\(uuid, date, text, text, boolean, boolean\) FROM PUBLIC, anon;/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.unmark_invoice_sent\(uuid\) FROM PUBLIC, anon;/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.mark_invoice_sent\(uuid, date, text, text, boolean, boolean\) TO authenticated, service_role;/);
  assert.match(sql, /v_company   uuid := public\._portal_staff_company\(\)/, "same roles as sending");
  assert.match(sql, /v_role NOT IN \('director', 'admin'\)/, "undo: director / admin");
  assert.match(sql, /p_reminders boolean DEFAULT false/, "reminders default off");
  for (const c of ["sent_method", "marked_sent_by_name", "marked_sent_note", "marked_sent_reminders", "marked_sent_portal"]) assert.ok(new RegExp(`get_portal_invoices[\\s\\S]*- '${c}'`).test(sql), `the portal hides ${c}`);
  // section 4 is the LIVE function (manager-only through the contact-scoped helper of 20260936), guarded, with only the column list changed
  assert.match(sql, /LIVE function \(pg_get_functiondef on production/);
  assert.doesNotMatch(sql, /Same function as 20260922000000/);
  assert.match(sql, /_portal_session_client\(\) is not the contact-scoped version \(migration 20260936000000\)/, "refuses to run without the contact-scoped helper");
  assert.match(sql, /get_portal_invoices\(\) is not the version this file was written against/, "refuses to replace some other version");
  assert.match(sql, /v_client uuid := public\._portal_session_client\(p_session_token\)/);
  assert.match(sql, /WHERE i\.client_id = v_client AND i\.shared_at IS NOT NULL/);
  assert.doesNotMatch(sql.slice(sql.indexOf("-- ── 4.")), /GRANT|REVOKE/, "section 4 leaves the grants alone");
  assert.doesNotMatch(sql, /CREATE (OR REPLACE )?FUNCTION public\._portal_session_(client|ctx)/, "the contact-scoped helpers are not touched");
  assert.doesNotMatch(sql, /UPDATE\s+(public\.)?client_invoices\s+SET[^;]*WHERE\s+(true|1\s*=\s*1)/i, "no blanket update of existing invoices");
  assert.doesNotMatch(sql, /\bgl_(transactions|entries)\b/, "the ledger is not touched (a normal send posts nothing either)");
});

test("the page: Mark as sent on draft invoices (list row and invoice view), the Undo only for director / admin, the info line", () => {
  const page = readFileSync("src/pages/AccountsReceivablePage.tsx", "utf8");
  assert.equal((page.match(/inv\.status === "draft" && canMarkSent\(userRole\)/g) || []).length, 1, "list row");
  assert.equal((page.match(/selectedInvoice\.status === "draft" && canMarkSent\(userRole\)/g) || []).length, 1, "invoice view");
  assert.ok(page.includes("isMarkedSent(selectedInvoice) && canUndoMarkedSent(userRole)") && page.includes("Undo - back to draft"));
  assert.ok(page.includes("invoicePayments.length === 0"), "no undo while a payment is shown");
  assert.ok(page.includes("markedSentLine(selectedInvoice)"));
  assert.ok(page.includes("<MarkAsSentModal"));
  const modal = readFileSync("src/components/MarkAsSentModal.tsx", "utf8");
  assert.ok(modal.includes("Send automatic payment reminders to the client") && modal.includes("Show in the client portal") && modal.includes("Date sent") && modal.includes("How it was delivered"));
  assert.ok(modal.includes("max={today}"), "the date picker stops at today");
  assert.doesNotMatch(modal, /sendEmail|openWhatsApp|openEmail|functions\.invoke/, "the dialog sends nothing");
  const api = readFileSync("src/lib/invoiceMarkSentApi.ts", "utf8");
  assert.ok(api.includes('"mark_invoice_sent"') && api.includes('"unmark_invoice_sent"'));
});

test("the reminder job still emails only invoices with reminders on (so a marked invoice with reminders off is skipped)", () => {
  const fn = readFileSync("supabase/functions/send-payment-reminders/index.ts", "utf8");
  assert.ok(fn.includes('.eq("reminder_enabled", true)') && fn.includes("\"paid\",\"cancelled\",\"draft\""));
});
