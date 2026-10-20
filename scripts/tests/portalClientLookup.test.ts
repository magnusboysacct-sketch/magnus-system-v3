// Finding a portal client by email (supabase/functions/_shared/portalClientLookup.ts), used by client-portal-login and client-password-reset.
// Run:  npm run test:portallookup
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { findPortalClientByEmail, pickPortalClient } from "../../supabase/functions/_shared/portalClientLookup";

type Row = { id: string; email: string | null; portal_email: string | null; portal_enabled: boolean };

// a tiny stand-in for supabaseAdmin.from("clients").select(...).eq(...).eq(...).limit(n)
function fakeAdmin(rows: Row[], opts: { fail?: boolean } = {}) {
  const log: string[] = [];
  return {
    log,
    from(table: string) {
      assert.equal(table, "clients");
      const filters: Array<[string, unknown]> = [];
      const b = {
        select(cols: string) { log.push("select " + cols); return b; },
        eq(col: string, val: unknown) { filters.push([col, val]); return b; },
        limit(n: number) {
          log.push("where " + filters.map(([c, v]) => `${c}=${v}`).join(" and ") + ` limit ${n}`);
          const data = rows.filter((r) => filters.every(([c, v]) => (r as unknown as Record<string, unknown>)[c] === v)).slice(0, n);
          return Promise.resolve(opts.fail ? { data: null, error: { message: "boom" } } : { data, error: null });
        },
      };
      return b;
    },
  };
}
const C = (id: string, email: string | null, portal_email: string | null, portal_enabled = true): Row => ({ id, email, portal_email, portal_enabled });

test("a client whose portal_email is set is found ONLY by that portal_email", async () => {
  const rows = [C("a", "contact@x.test", "login@x.test")];
  assert.equal((await findPortalClientByEmail<Row>(fakeAdmin(rows), "login@x.test", "id, email"))?.id, "a");
  assert.equal(await findPortalClientByEmail<Row>(fakeAdmin(rows), "contact@x.test", "id, email"), null, "the contact email no longer opens or resets it");
});

test("the plain email works only while the client has no portal_email (null or blank)", async () => {
  const rows = [C("n", "null@x.test", null), C("b", "blank@x.test", ""), C("s", "spaces@x.test", "   ")];
  for (const [e, id] of [["null@x.test", "n"], ["blank@x.test", "b"], ["spaces@x.test", "s"]]) assert.equal((await findPortalClientByEmail<Row>(fakeAdmin(rows), e, "id"))?.id, id, e);
});

test("a portal-enabled client only: a client with the portal off, or an unknown address, is not found", async () => {
  const rows = [C("off", "off@x.test", null, false), C("offp", "x@x.test", "offp@x.test", false), C("on", "on@x.test", null)];
  assert.equal(await findPortalClientByEmail<Row>(fakeAdmin(rows), "off@x.test", "id"), null);
  assert.equal(await findPortalClientByEmail<Row>(fakeAdmin(rows), "offp@x.test", "id"), null);
  assert.equal(await findPortalClientByEmail<Row>(fakeAdmin(rows), "nobody@x.test", "id"), null);
  assert.equal((await findPortalClientByEmail<Row>(fakeAdmin(rows), "on@x.test", "id"))?.id, "on");
});

test("the old way would have found the wrong account: client A's contact email is client B's login", async () => {
  // A signs in as login-a@x.test; B (no portal_email) uses shared@x.test; A's primary contact email is ALSO shared@x.test
  const rows = [C("A", "shared@x.test", "login-a@x.test"), C("B", "b@x.test", "shared@x.test")];
  assert.equal((await findPortalClientByEmail<Row>(fakeAdmin(rows), "shared@x.test", "id"))?.id, "B", "only B's portal_email counts");
  assert.equal((await findPortalClientByEmail<Row>(fakeAdmin(rows), "login-a@x.test", "id"))?.id, "A");
});

test("two matches are ambiguous and match nobody; a database error matches nobody", async () => {
  assert.equal(await findPortalClientByEmail<Row>(fakeAdmin([C("a", null, "dup@x.test"), C("b", null, "dup@x.test")]), "dup@x.test", "id"), null);
  assert.equal(await findPortalClientByEmail<Row>(fakeAdmin([C("a", "dup@x.test", null), C("b", "dup@x.test", "")]), "dup@x.test", "id"), null);
  assert.equal(await findPortalClientByEmail<Row>(fakeAdmin([C("a", "ok@x.test", null)], { fail: true }), "ok@x.test", "id"), null);
});

test("portal_email is always selected (the rule needs it), and the address is only ever used as a filter VALUE", async () => {
  const admin = fakeAdmin([C("a", "q@x.test", null)]);
  await findPortalClientByEmail<Row>(admin, "q@x.test", "id, name");
  assert.ok(admin.log.every((l) => !l.startsWith("select") || /portal_email/.test(l)), admin.log.join("; "));
  const admin2 = fakeAdmin([]);
  await findPortalClientByEmail<Row>(admin2, "a,b.eq.c@x.test", "id, portal_email");
  assert.ok(admin2.log.some((l) => l.includes("portal_email=a,b.eq.c@x.test")), "a comma / dot in the value cannot add a filter (it is not a PostgREST or() string)");
});

test("pickPortalClient: the pure rule", () => {
  const a = { id: "a", portal_email: "p@x.test" }, b = { id: "b", portal_email: null }, c = { id: "c", portal_email: "" };
  assert.equal(pickPortalClient([a], [a])?.id, "a");
  assert.equal(pickPortalClient([a], [b])?.id, "a", "a portal_email match beats a plain match");
  assert.equal(pickPortalClient([], [a]), null);
  assert.equal(pickPortalClient([], [b])?.id, "b");
  assert.equal(pickPortalClient([], [c])?.id, "c");
  assert.equal(pickPortalClient([], [b, c]), null);
  assert.equal(pickPortalClient([], []), null);
});

test("the two edge functions use the helper and no longer look a client up with email OR portal_email", () => {
  for (const f of ["supabase/functions/client-portal-login/index.ts", "supabase/functions/client-password-reset/index.ts"]) {
    const src = readFileSync(f, "utf8");
    assert.ok(src.includes('from "../_shared/portalClientLookup.ts"') && src.includes("findPortalClientByEmail"), f);
    assert.ok(!/\.or\(`email\.eq\./.test(src) && !/portal_email\.eq\.\$\{email\}/.test(src), `${f} still has the OR lookup`);
    assert.ok(src.includes("normalizeEmail"), `${f} keeps normalizeEmail`);
  }
  const resetCalls = (readFileSync("supabase/functions/client-password-reset/index.ts", "utf8").match(/findPortalClientByEmail</g) || []).length;
  assert.equal(resetCalls, 2, "the request and the confirm step both use it");
});
