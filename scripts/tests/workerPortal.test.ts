// The pure parts of the worker portal: worker number input, PIN rules, temporary PINs, who may manage access, the WhatsApp message, and a few invariants of the edge functions.
// (The database side is tested in memory against the real migration 20260952000000.)
// Run:  npm run test:workerportal
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  GENERIC_LOGIN_ERROR, canManageWorkerPortal, clientIp, generateTempPin, isPinShape, isStrongPin, normalizeEmployeeNumber, weakPinReason,
} from "../../supabase/functions/_shared/workerPortal";
import { WORKER_PORTAL_URL, buildWorkerPortalMessage } from "../../src/lib/workerPortalMessage";
import { canManageWorkerPortal as uiCanManage, canAccessWorkersPage } from "../../src/lib/permissions";

test("a worker number is read leniently: case, spaces, a missing hyphen, short digits", () => {
  assert.equal(normalizeEmployeeNumber("MBW-007"), "MBW-007");
  assert.equal(normalizeEmployeeNumber("  mbw-007 "), "MBW-007");
  assert.equal(normalizeEmployeeNumber("mbw 007"), "MBW-007");
  assert.equal(normalizeEmployeeNumber("MBW007"), "MBW-007");
  assert.equal(normalizeEmployeeNumber("mbw-7"), "MBW-007");
  assert.equal(normalizeEmployeeNumber("MBW_12"), "MBW-012");
  assert.equal(normalizeEmployeeNumber("MBW-1000"), "MBW-1000");
  assert.equal(normalizeEmployeeNumber("VWW2-001"), "VWW2-001");
  assert.equal(normalizeEmployeeNumber("mbw–007"), "MBW-007", "an en dash typed by a phone keyboard");
  for (const bad of ["", "   ", null, undefined, "MBW", "-001", "M-001", "ABCDEFG-001", "MBW-", "MBW-ABC", "MBW-0000001", "MBW-001; DROP TABLE", "12-345", "x".repeat(40), 7]) assert.equal(normalizeEmployeeNumber(bad), null, String(bad));
});

test("a PIN is exactly 6 digits", () => {
  for (const ok of ["482915", "000001", "907315"]) assert.equal(isPinShape(ok), true, ok);
  for (const bad of ["12345", "1234567", "12345a", "12 345", "", null, undefined, 123456, "１２３４５６"]) assert.equal(isPinShape(bad), false, String(bad));
});

test("easy PINs are refused: the same digit, straight runs, repeated patterns, only two digits, the usual favourites", () => {
  for (const weak of ["000000", "111111", "999999", "123456", "654321", "234567", "012345", "987654", "121212", "123123", "112233", "123321", "696969", "101010", "159753", "121121", "131313", "455454"]) {
    assert.notEqual(weakPinReason(weak), null, weak);
    assert.equal(isStrongPin(weak), false, weak);
  }
  for (const strong of ["482915", "907315", "130482", "251864", "800512", "314159"]) assert.equal(weakPinReason(strong), null, strong);
  assert.match(String(weakPinReason("12345")), /exactly 6 digits/);
});

test("a temporary PIN is random, 6 digits, always strong; a bad random source cannot loop forever", () => {
  let seed = 1;
  const rnd = (n: number) => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed % n; };
  const seen = new Set<string>();
  for (let i = 0; i < 300; i++) { const p = generateTempPin(rnd); assert.equal(isStrongPin(p), true, p); seen.add(p); }
  assert.ok(seen.size > 250, "PINs differ");
  assert.throws(() => generateTempPin(() => 0), /Could not generate/);
  assert.equal(generateTempPin((() => { const seq = [0, 0, 0, 0, 0, 0, 4, 8, 2, 9, 1, 5]; let i = 0; return () => seq[i++]; })()), "482915", "a weak draw (000000) is thrown away and drawn again");
});

test("only a director, admin or secretary manage worker portal access (the function, the screen and the Workers page all agree)", () => {
  for (const ok of ["director", "admin", "secretary"]) { assert.equal(canManageWorkerPortal(ok), true, ok); assert.equal(uiCanManage(ok), true, ok); assert.equal(canAccessWorkersPage(ok), true, `${ok} can open the Workers page to reach the card`); }
  for (const no of ["supervisor", "site_user", "estimator", "office_user", "worker", "", null, undefined, "DIRECTOR"]) { assert.equal(canManageWorkerPortal(no as string), false, String(no)); assert.equal(uiCanManage(no as string), false, String(no)); }
});

test("the caller's address: the first x-forwarded-for entry, else cf-connecting-ip, else unknown", () => {
  const h = (o: Record<string, string>) => ({ get: (k: string) => o[k.toLowerCase()] ?? null });
  assert.equal(clientIp(h({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" })), "203.0.113.7");
  assert.equal(clientIp(h({ "cf-connecting-ip": "198.51.100.2" })), "198.51.100.2");
  assert.equal(clientIp(h({})), "unknown");
});

test("the message the office sends: company, link, worker number, temporary PIN and the instruction; plain text, no emoji", () => {
  const m = buildWorkerPortalMessage({ companyName: "Magnus Boys Construction Limited", employeeId: "MBW-007", pin: "482915" });
  assert.equal(m, "Magnus Boys Construction Limited worker portal: https://app.magnusboys.com/worker\nWorker No: MBW-007\nTemporary PIN: 482915\nYou will be asked to choose your own PIN.\nSave this link or add it to your home screen: https://app.magnusboys.com/worker");
  assert.equal(WORKER_PORTAL_URL, "https://app.magnusboys.com/worker");
  assert.doesNotMatch(m, /[^\x20-\x7e\n]/, "ASCII only");
  assert.match(buildWorkerPortalMessage({ companyName: "  ", employeeId: "X-1", pin: "123" }), /^Your company worker portal:/);
});

test("the edge functions: one generic sign-in error, no PIN or token in logs, the role list, the files rule", () => {
  const login = readFileSync("supabase/functions/worker-portal-login/index.ts", "utf8");
  const admin = readFileSync("supabase/functions/worker-portal-admin/index.ts", "utf8");
  const files = readFileSync("supabase/functions/worker-portal-files/index.ts", "utf8");
  assert.match(GENERIC_LOGIN_ERROR, /^Employee number or PIN is wrong/);
  assert.equal((login.match(/error: GENERIC_LOGIN_ERROR/g) || []).length, 1, "every sign-in failure goes through the one answer");
  for (const src of [login, admin, files]) {
    assert.doesNotMatch(src, /console\.(log|error|warn)\([^)]*(\bpin\b|new_pin|current_pin|\btoken\b)/i, "PINs and tokens are never logged");
    assert.match(src, /Deno\.serve/);
  }
  assert.match(login, /worker_portal_record_failure/); assert.match(login, /worker_portal_ip_blocked/); assert.match(login, /verifyPassword/);
  assert.match(login, /sha256Hex\(token\)/, "only a hash of the session token is stored");
  assert.doesNotMatch(login, /return jsonResponse\(\{[^}]*pin_hash/, "the stored hash never leaves the function");
  assert.match(admin, /canManageWorkerPortal\(profile\.role\)/); assert.match(admin, /worker\.company_id !== profile\.company_id/); assert.match(admin, /asCaller\.rpc\("worker_portal_staff_set_pin"/);
  assert.match(files, /isShowablePhotoPath\(path\)/); assert.match(files, /startsWith\(`\$\{ref\.company_id\}\/`\)/);
});

test("the migration's grants match the design: anon only gets the five token functions", () => {
  const sql = readFileSync("supabase/migrations/20260952000000_worker_portal_access.sql", "utf8");
  const grantsAnon = [...sql.matchAll(/GRANT EXECUTE ON FUNCTION([^;]*?) TO ([^;]*);/g)].filter((m) => /\banon\b/.test(m[2])).flatMap((m) => m[1].match(/worker_portal_\w+/g) || []);
  assert.deepEqual([...new Set(grantsAnon)].sort(), ["worker_portal_advances", "worker_portal_home", "worker_portal_notices", "worker_portal_payments", "worker_portal_receipt_link"]);
  assert.match(sql, /REVOKE ALL ON public\.worker_portal_access, public\.worker_portal_sessions, public\.worker_portal_login_attempts FROM PUBLIC, anon, authenticated;/);
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
  assert.doesNotMatch(sql, /CREATE POLICY[^;]*worker_portal_(access|sessions|login_attempts)/, "no client policy on the new tables");
});
