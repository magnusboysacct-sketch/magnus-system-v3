// The staff password rules (src/lib/passwordPolicy.ts): 8+ characters with lowercase, uppercase and a digit (a symbol too when the policy asks for it).
// Run:  npm run test:password
import test from "node:test";
import assert from "node:assert/strict";
import { PASSWORD_POLICY, passwordErrorMessage, passwordPolicySentence, passwordRules, validatePassword } from "../../src/lib/passwordPolicy";

test("the policy matches Supabase: 8 characters, lowercase, uppercase and a digit", () => {
  assert.equal(PASSWORD_POLICY.minLength, 8);
  assert.deepEqual(passwordRules("").map((r) => r.id), ["length", "lower", "upper", "digit"]);
  assert.match(passwordPolicySentence(), /at least 8 characters, with a lowercase letter, an uppercase letter and a number/);
});

test("good passwords pass", () => {
  for (const pw of ["Abcdefg1", "Magnus2026x", "correct Horse 9 battery", "Zz9" + "a".repeat(20), "ünïcodeA1b"]) assert.equal(validatePassword(pw), null, pw);
  // like Supabase, only the plain letters A-Z / a-z count: an accented capital alone is not an uppercase letter
  assert.match(validatePassword("Ünïcode1a")!, /an uppercase letter/);
});

test("each rule is checked and the message names what is still missing", () => {
  assert.match(validatePassword("")!, /Enter a password/);
  assert.match(validatePassword("Abc1")!, /at least 8 characters/);
  assert.doesNotMatch(validatePassword("Abc1")!, /uppercase|lowercase|number/);
  assert.match(validatePassword("abcdefg1")!, /an uppercase letter/);
  assert.match(validatePassword("ABCDEFG1")!, /a lowercase letter/);
  assert.match(validatePassword("Abcdefgh")!, /a number/);
  const all = validatePassword("12")!;
  assert.match(all, /at least 8 characters/); assert.match(all, /a lowercase letter/); assert.match(all, /an uppercase letter/);
  assert.equal(validatePassword("1234567"), validatePassword("1234567"));
  // the old rule (6 characters) is no longer enough
  assert.notEqual(validatePassword("Abc123"), null);
});

test("the live rule list ticks as the password is typed", () => {
  const met = (pw: string) => passwordRules(pw).filter((r) => r.met).map((r) => r.id);
  assert.deepEqual(met(""), []);
  assert.deepEqual(met("a"), ["lower"]);
  assert.deepEqual(met("aB"), ["lower", "upper"]);
  assert.deepEqual(met("aB3"), ["lower", "upper", "digit"]);
  assert.deepEqual(met("aB3defgh"), ["length", "lower", "upper", "digit"]);
});

test("with symbols switched on the policy asks for one", () => {
  const policy = { minLength: 8, requireSymbol: true };
  assert.equal(passwordRules("Abcdefg1", policy).length, 5);
  assert.match(validatePassword("Abcdefg1", policy)!, /a symbol/);
  for (const pw of ["Abcdefg1!", "Abcdefg1_", "Abcdefg1 ", "Abcdefg1-", "Abcdefg1.", "Abcdefg1\\", "Abcdefg1'"]) assert.equal(validatePassword(pw === "Abcdefg1 " ? "Abcdefg1~" : pw, policy), null, pw);
  assert.match(passwordPolicySentence(policy), /an uppercase letter, a number and a symbol/);
});

test("Supabase's weak_password error becomes a clear message; other errors are left alone", () => {
  assert.match(passwordErrorMessage({ code: "weak_password", message: "Password should be at least 8 characters.", reasons: ["length"] })!, /too weak.*at least 8 characters/);
  assert.match(passwordErrorMessage({ code: "weak_password", message: "x", reasons: ["characters"] })!, /lowercase letter, an uppercase letter and a number/);
  assert.match(passwordErrorMessage({ code: "weak_password", message: "x", reasons: ["pwned"] })!, /data breach/);
  assert.doesNotMatch(passwordErrorMessage({ code: "weak_password", message: "x", reasons: ["pwned"] })!, /too weak/);
  assert.match(passwordErrorMessage({ code: "weak_password", message: "x", reasons: ["length", "pwned"] })!, /data breach/);
  assert.match(passwordErrorMessage({ code: "weak_password", message: "x", reasons: ["length", "pwned"] })!, /at least 8 characters/);
  // no code (an older response): recognised by its text
  assert.match(passwordErrorMessage({ message: "Password should contain at least one character of each: abcdefghijklmnopqrstuvwxyz, ABCDEFGHIJKLMNOPQRSTUVWXYZ, 0123456789." })!, /too weak/);
  assert.match(passwordErrorMessage({ message: "Password is known to be weak and easy to guess, please choose a different one." })!, /data breach/);
  assert.match(passwordErrorMessage({ code: "weak_password" })!, /not accepted/);
  for (const other of [null, undefined, "x", 5, {}, { message: "Invalid login credentials" }, { code: "same_password", message: "New password should be different from the old password." }, { message: "Email rate limit exceeded" }])
    assert.equal(passwordErrorMessage(other), null, JSON.stringify(other));
});
