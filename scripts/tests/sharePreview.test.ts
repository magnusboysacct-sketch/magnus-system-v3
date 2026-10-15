// Unit tests for the link-preview pages (api/share-preview.ts, api/share-card.ts, api/_lib/*) and the vercel.json bot rewrite.
// Run:  npm run test:share
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import {
  BOT_UA_NAMES, buildCardUrl, buildPreviewHtml, cardVersion, fitLogo, imageInfo, isAllowedLogoUrl, isPreviewBot, loadLogo,
  normalizePreview, parseSharePath, sharePath,
} from "../../api/_lib/sharePreview";
import { createRequire } from "node:module";
import handler from "../../api/share-preview";

const SUPABASE = "https://abcdefgh.supabase.co";
const GOOD_LOGO = `${SUPABASE}/storage/v1/object/public/company-logos/co-1/logo/123_logo.png`;

// ── a tiny PNG writer (solid colour) so the card can be rendered without any image files ──────────────────────────────────
function crcChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(body) >>> 0);
  return Buffer.concat([len, body, crc]);
}
function solidPng(w: number, h: number, rgb: [number, number, number]): Uint8Array {
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: w }, () => rgb).flat())]);
  const raw = Buffer.concat(Array.from({ length: h }, () => row));
  return new Uint8Array(Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), crcChunk("IHDR", ihdr), crcChunk("IDAT", zlib.deflateSync(raw)), crcChunk("IEND", Buffer.alloc(0))]));
}
const pngSize = (b: Uint8Array) => { const dv = new DataView(b.buffer, b.byteOffset); return [dv.getUint32(16), dv.getUint32(20)]; };

// ── bot detection ───────────────────────────────────────────────────────────────────────────────────────────────────────
const BOT_UAS = [
  "WhatsApp/2.23.20.0 A",
  "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
  "Facebot",
  "Twitterbot/1.0",
  "Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)",
  "Mozilla/5.0 (compatible; TelegramBot like TwitterBot)",
  "LinkedInBot/1.0 (compatible; Mozilla/5.0; Apache-HttpClient +http://www.linkedin.com)",
  "Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)",
  "Mozilla/5.0 (Windows NT 6.1; WOW64) SkypeUriPreview Preview/0.5 skype-url-preview@microsoft.com",
  "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
];
const HUMAN_UAS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/450.0]",
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/126.0 Mobile Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0",
  "curl/8.4.0", "",
];

test("bot detection: every link-preview bot is detected, ordinary browsers (incl. iPad Safari and the Facebook in-app browser) are not", () => {
  for (const ua of BOT_UAS) assert.equal(isPreviewBot(ua), true, ua);
  for (const ua of HUMAN_UAS) assert.equal(isPreviewBot(ua), false, ua);
  assert.equal(isPreviewBot(null), false);
  assert.equal(isPreviewBot(undefined), false);
  assert.equal(BOT_UAS.length, BOT_UA_NAMES.length);
});

test("vercel.json: the bot rewrites match exactly the same user agents, go before the SPA catch-all, and the catch-all leaves /api alone", () => {
  const cfg = JSON.parse(fs.readFileSync(new URL("../../vercel.json", import.meta.url), "utf8"));
  const rw = cfg.rewrites as Array<{ source: string; destination: string; has?: Array<{ type: string; key: string; value: string }> }>;
  const bot = rw.filter((r) => r.has);
  assert.deepEqual(bot.map((r) => r.destination), [
    "/api/share-preview?kind=contact&token=:token", "/api/share-preview?kind=portal&token=:token", "/api/share-preview?kind=photos&token=:token",
  ]);
  assert.deepEqual(bot.map((r) => r.source), ["/portal/contact/:token", "/portal/:token", "/shared/:token"]);
  for (const r of bot) {
    assert.equal(r.has!.length, 1); assert.equal(r.has![0].type, "header"); assert.equal(r.has![0].key, "user-agent");
    const re = new RegExp(r.has![0].value);
    for (const ua of [...BOT_UAS, ...HUMAN_UAS]) assert.equal(re.test(ua), isPreviewBot(ua), `${ua} vs ${r.source}`);
  }
  const catchAll = rw[rw.length - 1];
  assert.equal(rw.indexOf(catchAll), rw.length - 1, "catch-all is last");
  assert.equal(catchAll.destination, "/");
  assert.equal(new RegExp(`^${catchAll.source}$`).test("/api/share-card"), false);
  assert.equal(new RegExp(`^${catchAll.source}$`).test("/portal/abc"), true);
});

// ── URL patterns ────────────────────────────────────────────────────────────────────────────────────────────────────────
test("share URL patterns", () => {
  const t = "0f8fad5b-d9cb-469f-a165-70867728950e";
  assert.deepEqual(parseSharePath(`/portal/${t}`), { kind: "portal", token: t });
  assert.deepEqual(parseSharePath(`/portal/contact/${t}`), { kind: "contact", token: t });
  assert.deepEqual(parseSharePath(`/shared/${t}/`), { kind: "photos", token: t });
  for (const bad of ["/portal/", "/portal/short", "/portal/contact", "/portal/a b c d e f g h", `/portal/${t}/extra`, `/client-portal/session/${t}`, `/verify/${t}`, "/", `/portal/${"x".repeat(200)}`]) assert.equal(parseSharePath(bad), null, bad);
  assert.equal(sharePath("contact", t), `/portal/contact/${t}`);
  assert.equal(sharePath("photos", t), `/shared/${t}`);
  assert.equal(sharePath("portal", t), `/portal/${t}`);
});

// ── no leaks ────────────────────────────────────────────────────────────────────────────────────────────────────────────
test("normalizePreview keeps ONLY the four public fields, whatever else the database sends", () => {
  const out = normalizePreview({ company_name: "Veron Williams", logo_url: GOOD_LOGO, title: "Project portal – Veron Williams", description: "Sign in.", client_name: "Mr Brown", email: "a@b.c", amount: 1234, token: "SECRET-TOKEN-123", address: "5 King St" }, "portal");
  assert.deepEqual(Object.keys(out!).sort(), ["company_name", "description", "logo_url", "title"]);
  assert.equal(JSON.stringify(out).includes("SECRET"), false);
  assert.equal(JSON.stringify(out).includes("Brown"), false);
  assert.equal(normalizePreview(null, "portal"), null);
  assert.equal(normalizePreview("x", "portal"), null);
  assert.equal(normalizePreview([], "portal"), null);
  assert.equal(normalizePreview({ company_name: "   " }, "portal"), null);
  const g = normalizePreview({ company_name: "Acme" }, "photos")!;
  assert.equal(g.title, "Project photos – Acme"); assert.equal(g.logo_url, null);
  assert.equal(normalizePreview({ company_name: "Acme" }, "contact")!.title, "Project portal – Acme");
  assert.equal(normalizePreview({ company_name: "A".repeat(500) }, "portal")!.company_name.length, 80);
});

test("the preview page: all required tags, escaped values, and nothing but the four fields + the page URL", () => {
  const html = buildPreviewHtml({ title: 'Project portal – "Acme" <b>&Co', description: "Sign in.", company: 'Acme "&" <Co>', pageUrl: "https://app.magnusboys.com/portal/tok-1234567", imageUrl: "https://app.magnusboys.com/api/share-card?n=Acme&v=1" });
  for (const needle of [
    'property="og:title"', 'property="og:description"', 'property="og:image" content="https://app.magnusboys.com/api/share-card?n=Acme&amp;v=1"', 'property="og:image:width" content="1200"',
    'property="og:image:height" content="630"', 'property="og:image:type" content="image/png"', 'name="twitter:card" content="summary_large_image"',
    'property="og:url" content="https://app.magnusboys.com/portal/tok-1234567"', 'property="og:site_name" content="Acme &quot;&amp;&quot; &lt;Co&gt;"',
  ]) assert.ok(html.includes(needle), needle);
  assert.equal(html.includes("<b>"), false);
  assert.equal(/Magnus/i.test(html.replaceAll("magnusboys.com", "")), false);
});

test("card URL: fingerprint changes with the logo or name", () => {
  assert.notEqual(cardVersion("Acme", "a"), cardVersion("Acme", "b"));
  assert.notEqual(cardVersion("Acme", null), cardVersion("Acme2", null));
  assert.equal(cardVersion("Acme", GOOD_LOGO), cardVersion("Acme", GOOD_LOGO));
  const u = new URL(buildCardUrl("https://app.magnusboys.com", "Acme Ltd", GOOD_LOGO));
  assert.equal(u.origin + u.pathname, "https://app.magnusboys.com/api/share-card");
  assert.equal(u.searchParams.get("n"), "Acme Ltd"); assert.equal(u.searchParams.get("l"), GOOD_LOGO); assert.ok(u.searchParams.get("v"));
});

test("logo URL allow-list: only our Supabase company-logos bucket", () => {
  assert.equal(isAllowedLogoUrl(GOOD_LOGO, SUPABASE), true);
  for (const bad of [
    "http://abcdefgh.supabase.co/storage/v1/object/public/company-logos/x.png", "https://evil.example.com/storage/v1/object/public/company-logos/x.png",
    "https://abcdefgh.supabase.co/storage/v1/object/public/other-bucket/x.png", "https://abcdefgh.supabase.co/storage/v1/object/public/company-logos/../secret.png",
    "https://abcdefgh.supabase.co/storage/v1/object/public/company-logos/%2e%2e/x.png", "https://user:pw@abcdefgh.supabase.co/storage/v1/object/public/company-logos/x.png",
    "https://abcdefgh.supabase.co:8443/storage/v1/object/public/company-logos/x.png", "https://abcdefgh.supabase.co.evil.com/storage/v1/object/public/company-logos/x.png",
    "file:///etc/passwd", "not a url", "", "javascript:alert(1)",
  ]) assert.equal(isAllowedLogoUrl(bad, SUPABASE), false, bad);
  assert.equal(isAllowedLogoUrl(GOOD_LOGO, undefined), false);
});

// ── images ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
test("image sizes are read from the file headers", () => {
  assert.deepEqual(imageInfo(solidPng(4000, 1343, [1, 2, 3]).subarray(0, 64)), { mime: "image/png", width: 4000, height: 1343 });
  const gif = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x90, 0x01, 0x2c, 0x01, 0, 0, 0]);
  assert.deepEqual(imageInfo(gif), { mime: "image/gif", width: 400, height: 300 });
  const jpg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x4a, 0x46, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x01, 0x2c, 0x01, 0x90, 0x01, 0x01, 0x11, 0x00, 0xff, 0xd9]);
  assert.deepEqual(imageInfo(jpg), { mime: "image/jpeg", width: 400, height: 300 });
  const enc = (s: string) => new TextEncoder().encode(s);
  assert.deepEqual(imageInfo(enc('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 50"><rect/></svg>')), { mime: "image/svg+xml", width: 200, height: 50 });
  assert.deepEqual(imageInfo(enc('<?xml version="1.0"?><svg width="120px" height="40px"></svg>')), { mime: "image/svg+xml", width: 120, height: 40 });
  assert.equal(imageInfo(enc("<html>not an image</html>")), null);
  assert.equal(imageInfo(new Uint8Array([1, 2, 3])), null);
  assert.equal(imageInfo(new TextEncoder().encode("RIFFxxxxWEBPVP8 ")), null);
});

test("logo geometry: natural shape, inside the centre square, at most 60% of the height", () => {
  const wide = fitLogo(4000, 1343);
  assert.equal(wide.w, 560); assert.ok(Math.abs(wide.w / wide.h - 4000 / 1343) < 0.02);
  const square = fitLogo(1000, 1000); assert.equal(square.w, 378); assert.equal(square.h, 378);
  const tall = fitLogo(400, 900); assert.equal(tall.h, 378); assert.ok(tall.w < 378);
  const tiny = fitLogo(50, 50); assert.equal(tiny.w, 100);
  for (const f of [wide, square, tall, tiny]) { assert.ok(f.w <= 560 && f.h <= 378); }
});

test("card cache header is exactly what the caller asks for (a short cache for a card whose logo failed)", async () => {
  const short = "public, max-age=300, s-maxage=300";
  const { res } = await render(null, short);
  assert.equal(res.headers.get("cache-control"), short);
  assert.equal(res.headers.get("content-type"), "image/png");
});

test("loadLogo: fetches only the allowed URL, with no redirects; non-images, big files and failures give null", async () => {
  const png = solidPng(300, 100, [10, 20, 30]);
  let calls = 0;
  const ok = (async (u: string, init?: RequestInit) => { calls++; assert.equal(init?.redirect, "error"); return new Response(png as BodyInit, { status: 200, headers: { "content-type": "image/png" } }); }) as unknown as typeof fetch;
  const got = await loadLogo(GOOD_LOGO, SUPABASE, ok);
  assert.ok(got && got.width === 300 && got.height === 100 && got.dataUri.startsWith("data:image/png;base64,"));
  assert.equal(await loadLogo("https://evil.example.com/x.png", SUPABASE, ok), null);
  assert.equal(calls, 1, "the disallowed URL was never fetched");
  assert.equal(await loadLogo(GOOD_LOGO, SUPABASE, (async () => new Response("<html>", { status: 200 })) as unknown as typeof fetch), null);
  assert.equal(await loadLogo(GOOD_LOGO, SUPABASE, (async () => new Response("x", { status: 404 })) as unknown as typeof fetch), null);
  assert.equal(await loadLogo(GOOD_LOGO, SUPABASE, (async () => { throw new Error("redirect"); }) as unknown as typeof fetch), null);
  assert.equal(await loadLogo(GOOD_LOGO, SUPABASE, (async () => new Response(png as BodyInit, { status: 200, headers: { "content-length": "9000000" } })) as unknown as typeof fetch), null);
  assert.equal(await loadLogo(null, SUPABASE, ok), null);
});

// ── the card ───────────────────────────────────────────────────────────────────────────────────────────────────────────
// @vercel/og's Node build expects a CommonJS require() to exist; the edge build used in production does not (so it is loaded here, lazily).
async function render(logo: { w: number; h: number } | null, cache = "public, max-age=31536000, immutable") {
  const req = createRequire(import.meta.url);
  const g = globalThis as unknown as { require?: NodeRequire; __dirname?: string; __filename?: string };
  g.require ??= req;
  // The Node build looks for hb.wasm (the text shaper) next to itself; the package keeps it in harfbuzzjs. Production uses the edge build, which has it built in.
  if (!g.__dirname) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "og-"));
    fs.copyFileSync(req.resolve("harfbuzzjs/hb.wasm"), path.join(dir, "hb.wasm"));
    g.__dirname = dir; g.__filename = path.join(dir, "index.js");
  }
  const { renderCard } = await import("../../api/_lib/card");
  const l = logo ? { dataUri: `data:image/png;base64,${Buffer.from(solidPng(logo.w, logo.h, [200, 30, 60])).toString("base64")}`, width: logo.w, height: logo.h } : null;
  const res = renderCard({ name: "Veron Williams Construction", logo: l }, cache);
  const bytes = new Uint8Array(await res.arrayBuffer());
  return { res, bytes };
}
for (const [label, logo] of [["wide logo (4000x1343 shape)", { w: 1200, h: 403 }], ["square logo", { w: 600, h: 600 }], ["tall logo", { w: 300, h: 700 }], ["no logo", null]] as const) {
  test(`card renders a 1200x630 PNG: ${label}`, async () => {
    const { res, bytes } = await render(logo);
    assert.equal(res.headers.get("content-type"), "image/png");
    assert.equal(res.headers.get("cache-control"), "public, max-age=31536000, immutable", "exactly one Cache-Control, the one we asked for");
    assert.deepEqual(Array.from(bytes.subarray(0, 8)), [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    assert.deepEqual(pngSize(bytes), [1200, 630]);
    assert.ok(bytes.length < 300_000, `small enough for WhatsApp (${bytes.length} bytes)`);
    if (process.env.SHARE_CARD_OUT) fs.writeFileSync(`${process.env.SHARE_CARD_OUT}/card-${label.replace(/[^a-z0-9]+/gi, "-")}.png`, bytes);
  });
}

// ── the crawler endpoint (token -> company mapping goes through the database function; here it is faked) ───────────────────────
const APP_HTML = "<!doctype html><title>Magnus System</title><meta property=\"og:image\" content=\"https://app.magnusboys.com/og-image.png\">";
function withFetch(rpc: (body: { p_kind: string; p_token: string }) => unknown) {
  const real = globalThis.fetch;
  const seen: Array<{ url: string; body?: unknown }> = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/index.html")) return new Response(APP_HTML, { status: 200 });
    if (url.includes("/rest/v1/rpc/get_share_preview")) {
      const body = JSON.parse(String(init?.body));
      seen.push({ url, body });
      assert.equal((init?.headers as Record<string, string>).apikey, "anon-key");
      return new Response(JSON.stringify(rpc(body)), { status: 200, headers: { "content-type": "application/json" } });
    }
    throw new Error("unexpected fetch " + url);
  }) as typeof fetch;
  return { seen, restore: () => { globalThis.fetch = real; } };
}
const call = (path: string, ua: string) => handler(new Request(`https://app.magnusboys.com${path}`, { headers: { "user-agent": ua, "x-forwarded-host": "app.magnusboys.com" } }));
const WA = "WhatsApp/2.23.20.0 A", CHROME = HUMAN_UAS[0];
const VALID = "0f8fad5b-d9cb-469f-a165-70867728950e";

test("endpoint: a link-preview bot gets the sending company's tags; a person gets the normal app", async () => {
  process.env.SUPABASE_URL = SUPABASE; process.env.SUPABASE_ANON_KEY = "anon-key";
  const f = withFetch(({ p_kind }) => ({ company_name: "Veron Williams", logo_url: GOOD_LOGO, title: `Project portal – Veron Williams`, description: "Sign in.", client_email: "leak@example.com", token: "LEAK", kind: p_kind }));
  try {
    const bot = await call(`/api/share-preview?kind=portal&token=${VALID}`, WA);
    const html = await bot.text();
    assert.equal(bot.status, 200); assert.equal(bot.headers.get("cache-control"), "no-store");
    assert.match(html, /og:title" content="Project portal – Veron Williams"/);
    assert.match(html, /og:site_name" content="Veron Williams"/);
    assert.match(html, new RegExp(`og:image" content="https://app\\.magnusboys\\.com/api/share-card\\?n=Veron\\+Williams&amp;l=${encodeURIComponent(GOOD_LOGO).replace(/\./g, "\\.")}&amp;v=`));
    assert.match(html, new RegExp(`og:url" content="https://app\\.magnusboys\\.com/portal/${VALID}"`));
    assert.equal(html.includes("leak@example.com") || html.includes("LEAK"), false);
    assert.deepEqual(f.seen[0].body, { p_kind: "portal", p_token: VALID });
    const contact = await (await call(`/api/share-preview?kind=contact&token=${VALID}`, WA)).text();
    assert.match(contact, new RegExp(`og:url" content="https://app\\.magnusboys\\.com/portal/contact/${VALID}"`));
    const photos = await (await call(`/api/share-preview?kind=photos&token=${VALID}`, "facebookexternalhit/1.1")).text();
    assert.match(photos, new RegExp(`og:url" content="https://app\\.magnusboys\\.com/shared/${VALID}"`));
    const calls = f.seen.length;
    const human = await call(`/api/share-preview?kind=portal&token=${VALID}`, CHROME);
    assert.equal(await human.text(), APP_HTML);
    assert.equal(f.seen.length, calls, "no database call for a person");
  } finally { f.restore(); }
});

test("endpoint: unknown, revoked, expired, malformed and disabled all look exactly the same (no probing)", async () => {
  process.env.SUPABASE_URL = SUPABASE; process.env.SUPABASE_ANON_KEY = "anon-key";
  const f = withFetch(() => null); // what get_share_preview returns for every one of those cases
  try {
    const answers = [];
    for (const path of [`/api/share-preview?kind=portal&token=${VALID}`, `/api/share-preview?kind=photos&token=${VALID}`, "/api/share-preview?kind=portal&token=short", "/api/share-preview?kind=bogus&token=" + VALID, "/api/share-preview", `/api/share-preview?kind=contact&token=${"x".repeat(300)}`]) {
      const r = await call(path, WA);
      answers.push({ status: r.status, ct: r.headers.get("content-type"), cc: r.headers.get("cache-control"), body: await r.text() });
    }
    for (const a of answers) assert.deepEqual(a, answers[0]);
    assert.equal(answers[0].body, APP_HTML);
    assert.equal(answers[0].status, 200);
  } finally { f.restore(); }
});

test("endpoint: falls back to the normal app if the database call fails or env is missing", async () => {
  const real = globalThis.fetch;
  process.env.SUPABASE_URL = SUPABASE; process.env.SUPABASE_ANON_KEY = "anon-key";
  globalThis.fetch = (async (input: RequestInfo | URL) => { if (String(input).endsWith("/index.html")) return new Response(APP_HTML); throw new Error("db down"); }) as typeof fetch;
  try {
    assert.equal(await (await call(`/api/share-preview?kind=portal&token=${VALID}`, WA)).text(), APP_HTML);
    delete process.env.SUPABASE_URL; delete process.env.SUPABASE_ANON_KEY; delete process.env.VITE_SUPABASE_URL; delete process.env.VITE_SUPABASE_ANON_KEY;
    assert.equal(await (await call(`/api/share-preview?kind=portal&token=${VALID}`, WA)).text(), APP_HTML);
    process.env.VITE_SUPABASE_URL = SUPABASE; process.env.VITE_SUPABASE_ANON_KEY = "anon-key";
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => { const u = String(input); if (u.endsWith("/index.html")) return new Response(APP_HTML); assert.equal((init?.headers as Record<string, string>).apikey, "anon-key"); return new Response(JSON.stringify({ company_name: "Acme" })); }) as typeof fetch;
    assert.match(await (await call(`/api/share-preview?kind=portal&token=${VALID}`, WA)).text(), /og:site_name" content="Acme"/);
  } finally { globalThis.fetch = real; }
});
