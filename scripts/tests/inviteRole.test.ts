// The role check of the admin-invite-user edge function (supabase/functions/admin-invite-user/inviteRole.ts).
// Run:  npm run test:invite
import test from "node:test";
import assert from "node:assert/strict";
import { INVITE_ROLES, parseInviteRole } from "../../supabase/functions/admin-invite-user/inviteRole";
import { readFileSync } from "node:fs";

test("the seven real roles are accepted exactly as they are", () => {
  assert.deepEqual([...INVITE_ROLES], ["director", "admin", "estimator", "supervisor", "office_user", "site_user", "secretary"]);
  for (const r of INVITE_ROLES) assert.deepEqual(parseInviteRole(r), { ok: true, role: r });
  assert.deepEqual(parseInviteRole("  secretary "), { ok: true, role: "secretary" }, "surrounding spaces are trimmed");
});

test("an unknown role is refused with a clear message - it is never turned into site_user", () => {
  for (const bad of ["worker", "owner", "accounts", "site_supervisor", "project_manager", "viewer", "Director", "ADMIN", "site user", "site_user;", "director,admin", "*"]) {
    const r = parseInviteRole(bad);
    assert.equal(r.ok, false, bad);
    assert.ok(!r.ok && r.error.startsWith(`Unknown role "${bad}"`), bad);
    assert.ok(!r.ok && r.error.includes("Choose one of: director, admin, estimator, supervisor, office_user, site_user, secretary."), bad);
  }
});

test("a missing, empty or non-text role is refused too (no default)", () => {
  for (const bad of [undefined, null, "", "   "]) {
    const r = parseInviteRole(bad);
    assert.equal(r.ok, false, String(bad));
    assert.ok(!r.ok && r.error.startsWith("A role is required."));
  }
  for (const bad of [5, true, {}, ["admin"]]) {
    const r = parseInviteRole(bad);
    assert.equal(r.ok, false, JSON.stringify(bad));
    assert.ok(!r.ok && r.error.startsWith("The role must be text."));
  }
});

test("a strange value cannot flood or break the message", () => {
  const r = parseInviteRole("x".repeat(500) + "\n<script>");
  assert.ok(!r.ok && r.error.length < 200 && !r.error.includes("\n"));
  const odd = parseInviteRole("adm\u0000in‮");
  assert.ok(!odd.ok && odd.error.startsWith('Unknown role "admin"'));
});

test("the edge function uses it: the role comes from parseInviteRole and nothing falls back to site_user", () => {
  const src = readFileSync("supabase/functions/admin-invite-user/index.ts", "utf8");
  assert.match(src, /parseInviteRole\(body\.role\)/);
  assert.match(src, /if \(!parsedRole\.ok\)[\s\S]{0,80}jsonResponse\(\{ error: parsedRole\.error \}, 400\)/);
  assert.doesNotMatch(src, /\?\s*rawRole\s*:\s*"site_user"/);
  assert.doesNotMatch(src, /body\.role \|\| "site_user"/);
});
