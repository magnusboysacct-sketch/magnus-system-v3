// The client form's Phone / Email fields and the portal login email (src/lib/clientPortalEmail.ts, src/pages/ClientsPage.tsx).
// Run:  npm run test:clients
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { canChangePortalEmail, changeConfirmation, portalEmailError, portalLoginEmail, validatePortalEmail } from "../../src/lib/clientPortalEmail";

test("the portal login email is portal_email, else the client's email", () => {
  assert.equal(portalLoginEmail({ email: "a@x.test", portal_email: "login@x.test" }), "login@x.test");
  assert.equal(portalLoginEmail({ email: " a@x.test ", portal_email: null }), "a@x.test");
  assert.equal(portalLoginEmail({ email: null, portal_email: "" }), "");
});

test("only a director or admin may change it", () => {
  for (const ok of ["director", "admin"]) assert.equal(canChangePortalEmail(ok), true, ok);
  for (const no of ["secretary", "estimator", "supervisor", "site_user", "office_user", "", null, undefined, "Director"]) assert.equal(canChangePortalEmail(no as string), false, String(no));
});

test("the new address is checked before anything is sent", () => {
  assert.equal(validatePortalEmail("new@x.test", "old@x.test"), null);
  assert.equal(validatePortalEmail("  NEW@X.test ", "old@x.test"), null);
  assert.match(String(validatePortalEmail("", "old@x.test")), /Enter the new/);
  for (const bad of ["no", "a@b", "a b@c.de", "@x.test", "a@@x.test"]) assert.match(String(validatePortalEmail(bad, "old@x.test")), /does not look right/, bad);
  assert.match(String(validatePortalEmail("OLD@x.test", " old@x.test ")), /already the portal login email/);
});

test("the confirmation names the client, the old and new address, and what happens", () => {
  const m = changeConfirmation("Acme Ltd", "old@x.test", " NEW@x.test ");
  assert.match(m, /Acme Ltd/); assert.match(m, /From: old@x\.test/); assert.match(m, /To: new@x\.test/);
  assert.match(m, /sign in with the new email/); assert.match(m, /password stays the same/); assert.match(m, /signed out/); assert.match(m, /reset link/);
  assert.match(changeConfirmation("Acme", "", "n@x.test"), /From: \(none\)/);
});

test("database answers become readable messages", () => {
  assert.match(portalEmailError({ code: "42501", message: "Not allowed" }), /Only a director or admin/);
  assert.match(portalEmailError({ message: "That email is already used for another portal login" }), /already used/);
  assert.equal(portalEmailError(null), "");
  assert.match(portalEmailError({}), /could not be changed/);
});

test("the client form: Phone and Email are never disabled or read-only; with contacts they are saved to the primary contact; the portal email has its own action", () => {
  const page = readFileSync("src/pages/ClientsPage.tsx", "utf8");
  const form = page.slice(page.indexOf('<Field label="Phone"'), page.indexOf('<Field label="Address">'));
  assert.ok(form.includes("value={form.phone}") && form.includes("value={form.email}"));
  assert.ok(!/disabled|readOnly|pointer-events/i.test(form.replace(/disabled=\{!form/g, "")), "no lock on the two inputs");
  assert.ok(form.includes("onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}") && form.includes("onChange={e => setForm(f => ({ ...f, email: e.target.value }))}"), "each input is bound to its own field");
  assert.ok(page.includes("updateClientContact(primary.id"), "with contacts, phone and email are saved to the primary contact");
  assert.ok(page.includes("<ClientPortalEmail"), "the portal login email has its own action");
  const contacts = readFileSync("src/components/ClientContactsManager.tsx", "utf8");
  const cform = contacts.slice(contacts.indexOf('<Field label="Phone"'), contacts.indexOf('<Field label="Email"') + 200);
  assert.ok(!/disabled|readOnly/.test(cform) && cform.includes('onChange={set("phone")}') && cform.includes('onChange={set("email")}'), "contact phone / email are plain editable inputs");
});

test("the migration: the guard, the pin and the director / admin action", () => {
  const sql = readFileSync("supabase/migrations/20260953000000_client_portal_email_protection.sql", "utf8");
  assert.match(sql, /NEW\.portal_email := lower\(btrim\(OLD\.email\)\)/);
  assert.match(sql, /Only a director or admin can change the portal login email/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.change_client_portal_email\(uuid, text\) FROM PUBLIC, anon;/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.change_client_portal_email\(uuid, text\) TO authenticated, service_role;/);
});
