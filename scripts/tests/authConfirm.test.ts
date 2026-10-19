// What /auth/confirm does with the links in Supabase's auth emails (src/lib/authConfirmCore.ts).
// Run:  npm run test:authconfirm
import test from "node:test";
import assert from "node:assert/strict";
import { planConfirm, safeNext } from "../../src/lib/authConfirmCore";

test("signup, magic link, email and change-email links are verified here, then go to next (default /)", () => {
  assert.deepEqual(planConfirm("?token_hash=abc123&type=signup"), { kind: "verify", tokenHash: "abc123", type: "signup", next: "/" });
  assert.deepEqual(planConfirm("?token_hash=abc123&type=email&next=/settings"), { kind: "verify", tokenHash: "abc123", type: "email", next: "/settings" });
  assert.deepEqual(planConfirm("token_hash=h&type=magiclink&next=%2Fprojects%3Ftab%3D2"), { kind: "verify", tokenHash: "h", type: "magiclink", next: "/projects?tab=2" });
  assert.deepEqual(planConfirm("?token_hash=h&type=email_change"), { kind: "verify", tokenHash: "h", type: "email_change", next: "/" });
});

test("recovery and invite links are passed on UNUSED to the page that spends the token (it sets the password), so /reset-password and /accept-invite keep working", () => {
  assert.deepEqual(planConfirm("?token_hash=abc&type=recovery&next=/reset-password"), { kind: "forward", to: "/reset-password?token_hash=abc&type=recovery" });
  assert.deepEqual(planConfirm("?token_hash=abc&type=invite&next=/accept-invite"), { kind: "forward", to: "/accept-invite?token_hash=abc&type=invite" });
  // the destination is fixed: a different next cannot send the token elsewhere, and next is not passed on (AcceptInvitePage would use it as its post-sign-in destination)
  assert.deepEqual(planConfirm("?token_hash=abc&type=recovery&next=https://evil.test"), { kind: "forward", to: "/reset-password?token_hash=abc&type=recovery" });
  assert.deepEqual(planConfirm("?token_hash=a%26b%3Dc&type=invite"), { kind: "forward", to: "/accept-invite?token_hash=a%26b%3Dc&type=invite" });
});

test("a link with no token or an unknown type is an error with a readable message", () => {
  for (const s of ["", "?type=signup", "?token_hash=&type=signup", "?token_hash=abc", "?token_hash=abc&type=bogus", "?token_hash=abc&type=SIGNUP"]) {
    const p = planConfirm(s);
    assert.equal(p.kind, "error", s);
    assert.ok(p.kind === "error" && p.message.length > 10);
  }
});

test("next can only be a path inside the app", () => {
  assert.equal(safeNext("/projects/1"), "/projects/1");
  assert.equal(safeNext("/a?b=1#c"), "/a?b=1#c");
  for (const bad of [null, undefined, "", "  ", "projects", "https://evil.test", "//evil.test", "/\\evil.test", "javascript:alert(1)", "/ok\nLocation: x", "/auth/confirm?token_hash=x", "/auth/confirm"])
    assert.equal(safeNext(bad as string), "/", String(bad));
  assert.equal(safeNext("//evil.test", "/home"), "/home");
  // an open redirect through verify-then-redirect is closed
  assert.deepEqual(planConfirm("?token_hash=h&type=signup&next=//evil.test"), { kind: "verify", tokenHash: "h", type: "signup", next: "/" });
});
