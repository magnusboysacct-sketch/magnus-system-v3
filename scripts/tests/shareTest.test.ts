// TEMPORARY tests for the A/B preview-image test (api/share-test.ts). Removed together with it.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { DEFAULT_CARD_FILE, TEST_ALIAS, resolveTestAlias, shareTestHandler, staticCardUrl, testTarget } from "../../api/_lib/shareTest";
import { shareCardHandler } from "../../api/_lib/cardHandler";
import { cardVersion, isPreviewBot } from "../../api/_lib/sharePreview";

const SUPABASE = "https://abcdefgh.supabase.co";
const SECRET_TOKEN = "SECRET-portal-token-0f8fad5b-d9cb-469f";
const LOGO = `${SUPABASE}/storage/v1/object/public/company-logos/co-1/logo/1_logo.png`;
const ENV = { SUPABASE_URL: SUPABASE, SUPABASE_ANON_KEY: "anon", SHARE_TEST_TOKEN: SECRET_TOKEN };
const WA = "WhatsApp/2.23.20.0 A";
const APP_HTML = "<!doctype html><title>Magnus System</title>";

function stubFetch(rpc: () => unknown) {
  const real = globalThis.fetch; const rpcBodies: unknown[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const u = String(input);
    if (u.endsWith("/index.html")) return new Response(APP_HTML);
    if (u.includes("/rest/v1/rpc/get_share_preview")) { rpcBodies.push(JSON.parse(String(init?.body))); return new Response(JSON.stringify(rpc()), { status: 200 }); }
    throw new Error("unexpected fetch " + u);
  }) as typeof fetch;
  return { rpcBodies, restore: () => { globalThis.fetch = real; } };
}
const COMPANY = () => ({ company_name: "Veron Williams", logo_url: LOGO, title: "Project portal – Veron Williams", description: "Sign in to view your project updates and documents.", token: "LEAK" });
const call = (variant: string, ua = WA, env: Record<string, string | undefined> = ENV, host = "app.magnusboys.com") =>
  shareTestHandler(new Request(`https://${host}/api/share-test?variant=${variant}`, { headers: { "user-agent": ua, "x-forwarded-host": host } }), env);
const metas = (html: string) => [...html.matchAll(/<meta (?:property|name)="([^"]+)" content="([^"]*)">/g)].map((m) => [m[1], m[2]] as const);

test("share-test: the three variants are the same page and differ ONLY in the image (and their own address)", async () => {
  const f = stubFetch(COMPANY);
  try {
    const pages: Record<string, string> = {};
    for (const v of ["a", "b", "c", "d", "e"]) { const r = await call(v); assert.equal(r.status, 200); assert.equal(r.headers.get("cache-control"), "no-store"); pages[v] = await r.text(); }
    const imageProps = new Set(["og:image", "og:image:secure_url", "twitter:image", "og:url"]);
    const rest = (h: string) => JSON.stringify(metas(h).filter(([k]) => !imageProps.has(k)));
    for (const v of ["b", "c", "d", "e"]) assert.equal(rest(pages.a), rest(pages[v]), v);
    for (const v of ["b", "c", "d", "e"]) assert.equal(pages.a.replace(/(og:image|og:image:secure_url|twitter:image|og:url)" content="[^"]*"/g, "$1"), pages[v].replace(/(og:image|og:image:secure_url|twitter:image|og:url)" content="[^"]*"/g, "$1"), v);
    assert.equal(pages.a.replace(/(og:image|og:image:secure_url|twitter:image|og:url)" content="[^"]*"/g, "$1"), pages.b.replace(/(og:image|og:image:secure_url|twitter:image|og:url)" content="[^"]*"/g, "$1"));
    const img = (h: string) => new Map(metas(h)).get("og:image")!;
    assert.equal(img(pages.a), "https://app.magnusboys.com/og-image.png");
    assert.match(img(pages.b), new RegExp(`^https://app\\.magnusboys\\.com/api/share-card/test/${TEST_ALIAS}/${cardVersion("Veron Williams", LOGO)}\\.png$`));
    assert.equal(img(pages.c), `${SUPABASE}/storage/v1/object/public/company-logos/d280bd58-b0e0-4a34-9c47-8f0bda3eb9af/${DEFAULT_CARD_FILE}`);
    assert.equal(img(pages.d), `${SUPABASE}/storage/v1/object/public/company-logos/d280bd58-b0e0-4a34-9c47-8f0bda3eb9af/share-card-v1-rgb.png`);
    assert.equal(img(pages.e), "https://app.magnusboys.com/share-test-card.png");
    for (const v of ["a", "b", "c", "d", "e"]) {
      const m = new Map(metas(pages[v]));
      assert.equal(m.get("og:image:secure_url"), m.get("og:image")); assert.equal(m.get("twitter:image"), m.get("og:image"));
      assert.equal(m.get("og:image:width"), "1200"); assert.equal(m.get("og:image:height"), "630"); assert.equal(m.get("og:image:type"), "image/png");
      assert.equal(m.get("og:url"), `https://app.magnusboys.com/share-test/${v}`);
      assert.equal(m.get("twitter:card"), "summary_large_image");
      assert.equal(m.get("og:title"), "Project portal – Veron Williams"); assert.equal(m.get("og:site_name"), "Veron Williams");
    }
  } finally { f.restore(); }
});

test("share-test: the token is never in a response (and extra database fields are dropped)", async () => {
  const f = stubFetch(COMPANY);
  try {
    for (const v of ["a", "b", "c", "d", "e"]) { const html = await (await call(v)).text(); assert.equal(html.includes(SECRET_TOKEN), false, v); assert.equal(html.includes("LEAK"), false, v); assert.equal(html.includes("0f8fad5b"), false, v); }
    assert.deepEqual(f.rpcBodies[0], { p_kind: "portal", p_token: SECRET_TOKEN }, "the real token is used only in the database call");
  } finally { f.restore(); }
});

test("share-test: people, other variants, a missing token or an unknown company all get the normal app", async () => {
  const f = stubFetch(COMPANY);
  try {
    const normal = async (r: Response) => { assert.equal(r.status, 200); assert.equal(await r.text(), APP_HTML); };
    await normal(await call("a", "Mozilla/5.0 Chrome/126"));
    await normal(await call("f")); await normal(await call(""));
    await normal(await call("a", WA, { ...ENV, SHARE_TEST_TOKEN: undefined }));
    await normal(await call("a", WA, { ...ENV, SHARE_TEST_TOKEN: "short" }));
    await normal(await call("a", WA, { ...ENV, SHARE_TEST_KIND: "bogus" }));
  } finally { f.restore(); }
  const g = stubFetch(() => null);
  try { assert.equal(await (await call("b")).text(), APP_HTML); } finally { g.restore(); }
});

test("share-test: variant c's URL can be overridden, and defaults to the company's own storage folder", () => {
  assert.equal(staticCardUrl({ ...ENV, SHARE_TEST_CARD_URL: "https://cdn.example.com/x.png" }), "https://cdn.example.com/x.png");
  assert.match(staticCardUrl(ENV)!, /\/storage\/v1\/object\/public\/company-logos\/[0-9a-f-]{36}\/share-card-v1\.png$/);
  assert.equal(staticCardUrl({}), null);
  assert.deepEqual(testTarget(ENV), { kind: "portal", token: SECRET_TOKEN });
  assert.equal(testTarget({}), null);
});

test("share-test: the card endpoint resolves ONLY its own alias, and only through the server-side token", async () => {
  assert.deepEqual(resolveTestAlias("test", TEST_ALIAS, ENV), { kind: "portal", token: SECRET_TOKEN });
  assert.equal(resolveTestAlias("test", "another-alias", ENV), null);
  assert.equal(resolveTestAlias("portal", TEST_ALIAS, ENV), null);
  assert.equal(resolveTestAlias("test", TEST_ALIAS, {}), null);
  // through the real handler: k=test&t=<alias> renders the test company; a wrong alias gets the platform card and never reaches the database
  Object.assign(process.env, ENV);
  const real = globalThis.fetch; const rpc: unknown[] = []; const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const u = String(input);
    if (u.includes("/rpc/get_share_preview")) { rpc.push(JSON.parse(String(init?.body))); return new Response(JSON.stringify({ company_name: "Veron Williams" }), { status: 200 }); }
    if (u.endsWith("/og-image.png")) return new Response(png, { status: 200, headers: { "content-type": "image/png" } });
    throw new Error("unexpected " + u);
  }) as typeof fetch;
  try {
    const ok = await shareCardHandler(new Request(`https://app.magnusboys.com/api/share-card?k=test&t=${TEST_ALIAS}&v=${cardVersion("Veron Williams", null)}`));
    assert.equal(ok.headers.get("content-type"), "image/png");
    assert.deepEqual(rpc, [{ p_kind: "portal", p_token: SECRET_TOKEN }]);
    const bad = await shareCardHandler(new Request("https://app.magnusboys.com/api/share-card?k=test&t=not-the-alias"));
    assert.deepEqual([...new Uint8Array(await bad.arrayBuffer())], [...png], "platform card");
    assert.equal(rpc.length, 1, "no further database call");
  } finally { globalThis.fetch = real; for (const k of Object.keys(ENV)) delete process.env[k]; }
});

test("share-test: vercel.json rewrites /share-test/:variant for preview bots only", () => {
  const cfg = JSON.parse(fs.readFileSync(new URL("../../vercel.json", import.meta.url), "utf8"));
  const r = cfg.rewrites.find((x: { source: string }) => x.source === "/share-test/:variant");
  assert.ok(r); assert.equal(r.destination, "/api/share-test?variant=:variant");
  const re = new RegExp(r.has[0].value);
  assert.equal(re.test(WA), true); assert.equal(isPreviewBot(WA), true);
  assert.equal(re.test("Mozilla/5.0 (Windows NT 10.0) Chrome/126 Safari/537.36"), false);
  assert.ok(cfg.rewrites.indexOf(r) < cfg.rewrites.length - 1, "ahead of the catch-all");
});

test("share-test: the local copies of the card exist — RGBA (as the dynamic card is) and RGB (no alpha, like og-image.png)", () => {
  const colorType = (p: string) => fs.readFileSync(new URL("../../" + p, import.meta.url))[25];
  assert.equal(colorType("public/og-image.png"), 2, "the static card that goes large is plain RGB");
  assert.equal(colorType("public/share-test-card.png"), 2, "variant e's file is RGB");
});
