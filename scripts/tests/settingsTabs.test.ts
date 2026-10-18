// The Settings tab list (src/pages/settings/settingsTabs.ts): who sees which tab, and that every old page URL is still a tab.
// Run:  npm run test:settings
import test from "node:test";
import assert from "node:assert/strict";
import { BILLING_LINK, DEFAULT_TAB, SETTINGS_TABS, settingsTabPath, tabsForRole } from "../../src/pages/settings/settingsTabs";

test("settings tabs: ids are unique, URL-safe and each has a name and a description", () => {
  const ids = SETTINGS_TABS.map((t) => t.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const t of SETTINGS_TABS) { assert.match(t.id, /^[a-z][a-z-]*$/); assert.ok(t.label.length > 2 && t.description.length > 5 && t.roles.length > 0, t.id); }
  assert.equal(settingsTabPath("branding"), "/settings/branding");
  assert.ok(ids.includes(DEFAULT_TAB));
});

test("settings tabs: the old page URLs are still tabs (so /settings/records etc. keep working); /settings/company is the first", () => {
  const ids = SETTINGS_TABS.map((t) => t.id);
  for (const old of ["company", "estimates", "payroll-rates", "master-lists", "users", "records", "import"]) assert.ok(ids.includes(old), old);
  assert.equal(ids[0], "company");
  assert.deepEqual(["company", "branding", "documents", "estimates", "payroll-rates", "master-lists", "users", "records", "notifications", "import"].sort(), [...ids].sort());
});

test("settings tabs: only the director sees them (the same ceiling the old route guards had); nobody else sees any", () => {
  assert.equal(tabsForRole("director").length, SETTINGS_TABS.length);
  for (const role of ["admin", "estimator", "supervisor", "office_user", "site_user", "secretary", "", null, undefined]) assert.deepEqual(tabsForRole(role as string), [], String(role));
  assert.deepEqual([...BILLING_LINK.roles], ["director"]);
});

test("settings tabs: tabs that share one form share a group (one Save), others have their own", () => {
  const g = (id: string) => SETTINGS_TABS.find((t) => t.id === id)!.group;
  assert.equal(g("company"), g("documents")); assert.equal(g("company"), g("notifications"));
  assert.notEqual(g("branding"), g("company")); assert.notEqual(g("estimates"), g("payroll-rates"));
  assert.equal(g("users"), undefined);
});
