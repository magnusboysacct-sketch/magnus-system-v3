import { hashPassword, verifyPassword, normalizeEmail, equalStrings } from "../../functions/_shared/portalPassword.ts";
const ok = (n: string, c: boolean) => { console.log((c ? "PASS " : "FAIL ") + n); if (!c) Deno.exitCode = 1; };
// legacy hash exactly as the old code made it
const legacy = async (p: string) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(p + "magnus_portal_2026")))).map(b => b.toString(16).padStart(2, "0")).join("");
const L = await legacy("hunter22");
ok("legacy hash verifies and asks for rehash", JSON.stringify(await verifyPassword("hunter22", L)) === '{"ok":true,"needsRehash":true}');
ok("legacy hash rejects wrong password", !(await verifyPassword("hunter23", L)).ok);
ok("legacy uppercase hex still verifies", (await verifyPassword("hunter22", L.toUpperCase())).ok);
const h1 = await hashPassword("hunter22"), h2 = await hashPassword("hunter22");
ok("new format shape", /^pbkdf2_sha256\$600000\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/.test(h1));
ok("per-user salt: same password, different hashes", h1 !== h2);
ok("new hash verifies, no rehash", JSON.stringify(await verifyPassword("hunter22", h1)) === '{"ok":true,"needsRehash":false}');
ok("new hash rejects wrong password", !(await verifyPassword("Hunter22", h1)).ok);
const low = h1.replace("$600000$", "$1000$");
ok("tampered iteration count fails", !(await verifyPassword("hunter22", low)).ok);
ok("garbage / null / empty fail", !(await verifyPassword("x", "nope")).ok && !(await verifyPassword("x", null)).ok && !(await verifyPassword("", "")).ok);
ok("absurd iteration count rejected", !(await verifyPassword("x", "pbkdf2_sha256$999999999$AA==$AA==")).ok);
ok("normal email accepted", normalizeEmail("  Officer.One+site@FFTP.org.jm ") === "officer.one+site@fftp.org.jm");
for (const bad of ["a@b.c,portal_enabled.eq.true", "x@y.z,id.neq.00000000-0000-0000-0000-000000000000", "a@b.c)", "a b@c.d", "a@b", "@b.c", "a@b.c'", "a@(b).c", ""])
  ok(`email rejected: ${JSON.stringify(bad)}`, normalizeEmail(bad) === null);
ok("equalStrings", equalStrings("abc", "abc") && !equalStrings("abc", "abd") && !equalStrings("abc", "ab"));
