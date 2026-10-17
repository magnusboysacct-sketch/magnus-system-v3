// Unit tests for the link-preview pages (api/share-preview.ts, api/share-card.ts, api/_lib/*) and the vercel.json bot rewrite.
// Run:  npm run test:share
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import zlib from "node:zlib";
import sharp from "sharp";
import {
  BOT_UA_NAMES, CARD, CARD_LAYOUT, buildCardUrl, buildPreviewHtml, cardVersion, fitLogo, imageInfo, isAllowedLogoUrl, isPreviewBot, layoutCard, loadLogo,
  normalizePreview, parseSharePath, sharePath,
} from "../../api/_lib/sharePreview";
import { renderCard } from "../../api/_lib/card";
import { sharePreviewHandler as handler } from "../../api/_lib/previewHandler";
import { shareCardHandler } from "../../api/_lib/cardHandler";

const SUPABASE = "https://abcdefgh.supabase.co";
const VALID_TOKEN = "0f8fad5b-d9cb-469f-a165-70867728950e";
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
  const html = buildPreviewHtml({ title: 'Project portal – "Acme" <b>&Co', description: "Sign in.", company: 'Acme "&" <Co>', pageUrl: "https://app.magnusboys.com/portal/tok-1234567", imageUrl: "https://app.magnusboys.com/api/share-card/portal/tok-1234567/1g9bd16.png" });
  for (const needle of [
    'property="og:title"', 'property="og:description"', 'property="og:image" content="https://app.magnusboys.com/api/share-card/portal/tok-1234567/1g9bd16.png"', 'property="og:image:secure_url" content="https://app.magnusboys.com/api/share-card/portal/tok-1234567/1g9bd16.png"', 'property="og:image:alt" content="Acme &quot;&amp;&quot; &lt;Co&gt; logo"', 'name="twitter:image" content="https://app.magnusboys.com/api/share-card/portal/tok-1234567/1g9bd16.png"', 'property="og:image:width" content="1200"',
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
  const u = new URL(buildCardUrl("https://app.magnusboys.com", "portal", VALID_TOKEN, "Acme Ltd", GOOD_LOGO));
  assert.equal(u.origin, "https://app.magnusboys.com");
  assert.equal(u.pathname, "/api/share-card/portal/" + VALID_TOKEN + "/" + cardVersion("Acme Ltd", GOOD_LOGO) + ".png", "a plain .png path: kind / token / cache-buster");
  assert.equal(u.search, "", "no query string at all");
  for (const kind of ["contact", "photos"] as const) assert.match(buildCardUrl("https://app.magnusboys.com", kind, VALID_TOKEN, "Acme", null), new RegExp("/api/share-card/" + kind + "/" + VALID_TOKEN + "/[0-9a-z]+\\.png$"));
  assert.equal(u.toString().includes("Acme"), false);
  assert.equal(u.toString().includes("supabase"), false);
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

test("logo geometry: natural shape, as large as the centre square allows (550x550 inside 40px padding), never enlarged past 2x", () => {
  const wide = fitLogo(4000, 1343);
  assert.equal(wide.w, 550); assert.ok(Math.abs(wide.w / wide.h - 4000 / 1343) < 0.02);
  const square = fitLogo(1000, 1000); assert.deepEqual(square, { w: 550, h: 550 });
  const tall = fitLogo(400, 900); assert.equal(tall.h, 550); assert.ok(tall.w < 550);
  const tiny = fitLogo(50, 50); assert.equal(tiny.w, 100);
  for (const f of [wide, square, tall, tiny]) assert.ok(f.w <= 550 && f.h <= 550);
  assert.deepEqual(CARD.square, { x: 285, size: 630, pad: 40 });
  assert.equal(CARD.inner, CARD.square.size - 2 * CARD.square.pad);
  // a vector logo has arbitrary units (Magnus Boys' SVG is 76.2 x 76.2): it scales up to fill the box instead of stopping at 2x
  assert.deepEqual(fitLogo(76.2, 76.2, true), { w: 550, h: 550 });
  assert.deepEqual(fitLogo(76.2, 76.2, false), { w: 152, h: 152 });
});

test("card layout: the name goes under the logo only if it still fits inside the square", () => {
  const wide = layoutCard("Veron Williams", { width: 4000, height: 1343 });
  assert.equal(wide.showName, true); assert.ok(wide.logo!.h + 24 + 46 <= 550);
  assert.equal(layoutCard("Magnus Boys Construction Limited", { width: 4000, height: 1343 }).nameLines, 2);
  assert.equal(layoutCard("Acme", { width: 1000, height: 1000 }).showName, false, "a square logo fills the square: no room for the name");
  assert.equal(layoutCard("Acme", { width: 400, height: 900 }).showName, false, "a tall logo fills the square: no room for the name");
  assert.equal(layoutCard("Acme", { width: 1200, height: 700 }).showName, true, "a 550x321 logo leaves room");
  const none = layoutCard("Veron Williams", null);
  assert.equal(none.logo, null); assert.equal(none.showName, true);
});

test("card fingerprint includes the layout revision (bumping it gives every card a new URL)", () => {
  assert.ok(CARD_LAYOUT >= 2);
  let h = 0x811c9dc5; const legacy = `${"Acme"}\u0000${GOOD_LOGO}`;   // the pre-layout-2 formula
  for (let i = 0; i < legacy.length; i++) { h ^= legacy.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  assert.notEqual(cardVersion("Acme", GOOD_LOGO), h.toString(36));
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
  assert.equal(got!.vector, false);
  const svg = await loadLogo(GOOD_LOGO.replace("logo.png","logo.svg"), SUPABASE, (async () => new Response("<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"76.2\" height=\"76.2\"></svg>", { status: 200 })) as unknown as typeof fetch);
  assert.ok(svg && svg.vector === true && svg.dataUri.startsWith("data:image/svg+xml;base64,"));
  assert.equal(await loadLogo("https://evil.example.com/x.png", SUPABASE, ok), null);
  assert.equal(calls, 1, "the disallowed URL was never fetched");
  assert.equal(await loadLogo(GOOD_LOGO, SUPABASE, (async () => new Response("<html>", { status: 200 })) as unknown as typeof fetch), null);
  assert.equal(await loadLogo(GOOD_LOGO, SUPABASE, (async () => new Response("x", { status: 404 })) as unknown as typeof fetch), null);
  assert.equal(await loadLogo(GOOD_LOGO, SUPABASE, (async () => { throw new Error("redirect"); }) as unknown as typeof fetch), null);
  assert.equal(await loadLogo(GOOD_LOGO, SUPABASE, (async () => new Response(png as BodyInit, { status: 200, headers: { "content-length": "9000000" } })) as unknown as typeof fetch), null);
  assert.equal(await loadLogo(null, SUPABASE, ok), null);
});

// ── the card ───────────────────────────────────────────────────────────────────────────────────────────────────────────
async function render(logo: { w: number; h: number } | null, cache = "public, max-age=31536000, immutable") {
  const l = logo ? { dataUri: `data:image/png;base64,${Buffer.from(solidPng(logo.w, logo.h, [200, 30, 60])).toString("base64")}`, width: logo.w, height: logo.h } : null;
  const res = await renderCard({ name: "Veron Williams Construction", logo: l }, cache);
  const bytes = new Uint8Array(await res.arrayBuffer());
  return { res, bytes };
}
for (const [label, logo] of [["wide logo (4000x1343 shape)", { w: 1200, h: 403 }], ["square logo", { w: 600, h: 600 }], ["tall logo", { w: 300, h: 700 }], ["no logo", null]] as const) {
  test(`card renders a 1200x630 PNG: ${label}`, async () => {
    const { res, bytes } = await render(logo);
    assert.equal(res.headers.get("content-type"), "image/png");
    assert.equal(res.headers.get("content-length"), String(bytes.length), "Content-Length matches the body");
    assert.equal(res.headers.get("cache-control"), "public, max-age=31536000, immutable", "exactly one Cache-Control, the one we asked for");
    assert.deepEqual(Array.from(bytes.subarray(0, 8)), [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    assert.deepEqual(pngSize(bytes), [1200, 630]);
    assert.ok(bytes.length < 300_000, `small enough for WhatsApp (${bytes.length} bytes)`);
    if (process.env.SHARE_CARD_OUT) fs.writeFileSync(`${process.env.SHARE_CARD_OUT}/card-${label.replace(/[^a-z0-9]+/gi, "-")}.png`, bytes);
  });
}

test("card stays under 300 KB: a logo too detailed for that is left off and the name is drawn alone", async () => {
  // an incompressible (random) logo: its PNG alone is several hundred KB
  const w = 700, h = 240, raw = Buffer.alloc(h * (1 + w * 3));
  for (let y = 0; y < h; y++) { raw[y * (1 + w * 3)] = 0; for (let x = 0; x < w * 3; x++) raw[y * (1 + w * 3) + 1 + x] = (Math.imul(y * 7919 + x, 2654435761) >>> 24) & 255; }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const noisy = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), crcChunk("IHDR", ihdr), crcChunk("IDAT", zlib.deflateSync(raw, { level: 0 })), crcChunk("IEND", Buffer.alloc(0))]);
  assert.ok(noisy.length > 300_000, "the test logo is big (" + noisy.length + " bytes)");
  const res = await renderCard({ name: "Veron Williams", logo: { dataUri: "data:image/png;base64," + noisy.toString("base64"), width: w, height: h } }, "public, max-age=300");
  const bytes = new Uint8Array(await res.arrayBuffer());
  assert.ok(bytes.length <= 300_000, "card is " + bytes.length + " bytes");
  assert.deepEqual(pngSize(bytes), [1200, 630]);
  assert.equal(res.headers.get("content-length"), String(bytes.length));
});

test("node adapter: always sends the whole body with a Content-Length (never chunked), plus the handler's own headers", async () => {
  const { toNodeHandler } = await import("../../api/_lib/nodeAdapter");
  const body = Buffer.from([1, 2, 3, 4, 5]);
  const out: { status?: number; headers: Record<string, string>; body?: Buffer } = { headers: {} };
  const res = { setHeader: (k: string, v: string) => { out.headers[k.toLowerCase()] = v; }, set statusCode(v: number) { out.status = v; }, end: (b?: Buffer) => { out.body = b; } };
  await toNodeHandler(async () => new Response(body as BodyInit, { status: 200, headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=60" } }))(
    { url: "/x", method: "GET", headers: { host: "app.magnusboys.com" } } as never, res as never);
  assert.equal(out.status, 200); assert.equal(out.headers["content-type"], "image/png"); assert.equal(out.headers["content-length"], "5"); assert.equal(out.headers["cache-control"], "public, max-age=60");
  assert.deepEqual([...out.body!], [1, 2, 3, 4, 5]);
  assert.equal("transfer-encoding" in out.headers, false);
});

test("vercel.json: the .png card path is rewritten to the card handler, ahead of the bot rewrites and the catch-all", () => {
  const cfg = JSON.parse(fs.readFileSync(new URL("../../vercel.json", import.meta.url), "utf8"));
  const first = cfg.rewrites[0];
  assert.equal(first.source, "/api/share-card/:kind/:token/:v.png");
  assert.equal(first.destination, "/api/share-card?k=:kind&t=:token&v=:v");
  assert.equal(first.has, undefined, "for everyone: the card is public, like a static image");
});

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
    assert.match(html, new RegExp(`og:image" content="https://app\\.magnusboys\\.com/api/share-card/portal/${VALID}/[0-9a-z]+\\.png"`));
    assert.match(html, new RegExp(`og:image:secure_url" content="https://app\\.magnusboys\\.com/api/share-card/portal/${VALID}/[0-9a-z]+\\.png"`));
    assert.match(html, new RegExp(`twitter:image" content="https://app\\.magnusboys\\.com/api/share-card/portal/${VALID}/[0-9a-z]+\\.png"`));
    assert.match(html, /og:image:alt" content="Veron Williams logo"/);
    assert.equal(/share-card[^"]*[?&](n|l)=/.test(html), false, "no name or logo URL in the card URL");
    assert.equal(html.includes("supabase.co"), false);
    assert.match(html, new RegExp(`og:url" content="https://app\\.magnusboys\\.com/portal/${VALID}"`));
    assert.equal(html.includes("leak@example.com") || html.includes("LEAK"), false);
    assert.deepEqual(f.seen[0].body, { p_kind: "portal", p_token: VALID });
    const contact = await (await call(`/api/share-preview?kind=contact&token=${VALID}`, WA)).text();
    assert.match(contact, new RegExp(`og:url" content="https://app\\.magnusboys\\.com/portal/contact/${VALID}"`));
    const photos = await (await call(`/api/share-preview?kind=photos&token=${VALID}`, "facebookexternalhit/1.1")).text();
    assert.match(photos, new RegExp(`og:url" content="https://app\\.magnusboys\\.com/shared/${VALID}"`));
    assert.match(photos, new RegExp(`share-card/photos/${VALID}/[0-9a-z]+\\.png`));
    assert.match(contact, new RegExp(`share-card/contact/${VALID}/[0-9a-z]+\\.png`));
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

// ── the card endpoint: renders only from the database result for kind + token ────────────────────────────────────────────────
const MAGNUS_PNG = solidPng(1200, 630, [11, 22, 99]);
const EVIL_LOGO = "https://evil.example.com/logo.png";
function withCardFetch(rpc: (body: { p_kind: string; p_token: string }) => unknown, opts: { ogImage?: boolean } = {}) {
  const real = globalThis.fetch;
  const seen: string[] = []; const rpcCalls: Array<{ p_kind: string; p_token: string }> = [];
  const logoBytes = solidPng(1200, 403, [200, 30, 60]);
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input); seen.push(url);
    if (url.includes("/rest/v1/rpc/get_share_preview")) { const body = JSON.parse(String(init?.body)); rpcCalls.push(body); return new Response(JSON.stringify(rpc(body)), { status: 200, headers: { "content-type": "application/json" } }); }
    if (url === "https://app.magnusboys.com/og-image.png") { if (opts.ogImage === false) throw new Error("static file unavailable"); return new Response(MAGNUS_PNG as BodyInit, { status: 200, headers: { "content-type": "image/png" } }); }
    if (url === GOOD_LOGO) return new Response(logoBytes as BodyInit, { status: 200, headers: { "content-type": "image/png" } });
    throw new Error("unexpected fetch " + url);
  }) as typeof fetch;
  return { seen, rpcCalls, restore: () => { globalThis.fetch = real; } };
}
const VALID_COMPANY = () => ({ company_name: "Veron Williams", logo_url: GOOD_LOGO, title: "x", description: "y", token: "LEAK" });
async function cardCall(qs: string) {
  const res = await shareCardHandler(new Request("https://app.magnusboys.com/api/share-card?" + qs));
  return { res, bytes: new Uint8Array(await res.arrayBuffer()) };
}
const same = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((v, i) => v === b[i]);
const LONG_CC = "public, max-age=31536000, s-maxage=31536000, immutable", SHORT_CC = "public, max-age=300, s-maxage=300";

test("card endpoint: kind + token -> the card for THAT company, built from the database result, cached for a year", async () => {
  process.env.SUPABASE_URL = SUPABASE; process.env.SUPABASE_ANON_KEY = "anon-key";
  const f = withCardFetch(VALID_COMPANY);
  try {
    const v = cardVersion("Veron Williams", GOOD_LOGO);
    const { res, bytes } = await cardCall("k=portal&t=" + VALID_TOKEN + "&v=" + v);
    assert.equal(res.status, 200); assert.equal(res.headers.get("content-type"), "image/png");
    assert.equal(res.headers.get("cache-control"), LONG_CC);
    assert.deepEqual(pngSize(bytes), [1200, 630]);
    assert.equal(same(bytes, MAGNUS_PNG), false, "a real company gets its own card, not the platform's");
    assert.deepEqual(f.rpcCalls, [{ p_kind: "portal", p_token: VALID_TOKEN }]);
    assert.ok(f.seen.includes(GOOD_LOGO), "the company's logo was loaded");
    for (const [k, t] of [["contact", VALID_TOKEN], ["photos", VALID_TOKEN]]) { const r = await cardCall("k=" + k + "&t=" + t + "&v=" + v); assert.equal(r.res.headers.get("content-type"), "image/png"); }
    assert.deepEqual(f.rpcCalls.map((c) => c.p_kind), ["portal", "contact", "photos"]);
  } finally { f.restore(); }
});

test("card endpoint: a URL with a made-up name or logo renders NOTHING custom", async () => {
  process.env.SUPABASE_URL = SUPABASE; process.env.SUPABASE_ANON_KEY = "anon-key";
  const f = withCardFetch(VALID_COMPANY);
  try {
    // the old shape (?n=...&l=...) and any other name-ish parameters with no valid kind + token: the platform's own card, no lookups at all
    for (const qs of ["n=FREE+TEXT+ON+OUR+DOMAIN", "n=EVIL&l=" + encodeURIComponent(EVIL_LOGO), "name=EVIL&logo=" + encodeURIComponent(EVIL_LOGO), "", "k=portal", "t=" + VALID_TOKEN, "k=bogus&t=" + VALID_TOKEN, "k=portal&t=short&n=EVIL"]) {
      const { res, bytes } = await cardCall(qs);
      assert.equal(res.headers.get("content-type"), "image/png", qs);
      assert.ok(same(bytes, MAGNUS_PNG), "platform card for: " + qs);
    }
    assert.equal(f.rpcCalls.length, 0, "no database call, and nothing was rendered");
    assert.equal(f.seen.some((u) => u.includes("evil.example.com")), false);

    // even WITH a valid kind + token, extra n / l parameters are ignored: the result is byte-identical to the request without them
    const v = cardVersion("Veron Williams", GOOD_LOGO);
    const plain = await cardCall("k=portal&t=" + VALID_TOKEN + "&v=" + v);
    const decorated = await cardCall("k=portal&t=" + VALID_TOKEN + "&v=" + v + "&n=" + encodeURIComponent("SOMETHING ELSE ENTIRELY") + "&l=" + encodeURIComponent(EVIL_LOGO));
    assert.ok(same(plain.bytes, decorated.bytes), "n and l change nothing");
    assert.equal(decorated.res.headers.get("cache-control"), LONG_CC);
    assert.equal(f.seen.some((u) => u.includes("evil.example.com")), false, "the logo URL from the query string was never fetched");
  } finally { f.restore(); }
});

test("card endpoint: unknown, revoked, expired, malformed all get the platform's card, identically (no probing)", async () => {
  process.env.SUPABASE_URL = SUPABASE; process.env.SUPABASE_ANON_KEY = "anon-key";
  const f = withCardFetch(() => null);
  try {
    const answers = [];
    for (const qs of ["k=portal&t=" + VALID_TOKEN, "k=photos&t=" + VALID_TOKEN, "k=contact&t=" + VALID_TOKEN + "&v=abc", "k=portal&t=nope", "k=portal", ""]) {
      const { res, bytes } = await cardCall(qs);
      answers.push({ status: res.status, ct: res.headers.get("content-type"), cc: res.headers.get("cache-control"), same: same(bytes, MAGNUS_PNG) });
    }
    for (const a of answers) assert.deepEqual(a, answers[0]);
    assert.deepEqual(answers[0], { status: 200, ct: "image/png", cc: SHORT_CC, same: true });
  } finally { f.restore(); }
});

test("card endpoint: database trouble, missing env, or a missing static card all fail safe", async () => {
  process.env.SUPABASE_URL = SUPABASE; process.env.SUPABASE_ANON_KEY = "anon-key";
  const real = globalThis.fetch;
  try {
    globalThis.fetch = (async (input: RequestInfo | URL) => { if (String(input).endsWith("/og-image.png")) return new Response(MAGNUS_PNG as BodyInit, { headers: { "content-type": "image/png" } }); throw new Error("db down"); }) as typeof fetch;
    assert.ok(same((await cardCall("k=portal&t=" + VALID_TOKEN)).bytes, MAGNUS_PNG));
    delete process.env.SUPABASE_URL; delete process.env.SUPABASE_ANON_KEY; delete process.env.VITE_SUPABASE_URL; delete process.env.VITE_SUPABASE_ANON_KEY;
    assert.ok(same((await cardCall("k=portal&t=" + VALID_TOKEN)).bytes, MAGNUS_PNG));
    globalThis.fetch = (async () => { throw new Error("nothing works"); }) as typeof fetch;
    const { res } = await cardCall("k=portal&t=short");
    assert.equal(res.status, 302); assert.equal(res.headers.get("location"), "/og-image.png");
    // a static-file request that comes back as the app's HTML (not an image) is not served as a card
    globalThis.fetch = (async (input: RequestInfo | URL) => { if (String(input).endsWith("/og-image.png")) return new Response("<!doctype html>", { status: 200, headers: { "content-type": "text/html" } }); throw new Error("x"); }) as typeof fetch;
    assert.equal((await cardCall("k=portal&t=short")).res.status, 302);
  } finally { globalThis.fetch = real; process.env.SUPABASE_URL = SUPABASE; process.env.SUPABASE_ANON_KEY = "anon-key"; }
});

test("card endpoint: cache is long only when the fingerprint is current and the logo loaded; the logo allow-list still applies", async () => {
  process.env.SUPABASE_URL = SUPABASE; process.env.SUPABASE_ANON_KEY = "anon-key";
  let f = withCardFetch(VALID_COMPANY);
  try {
    const v = cardVersion("Veron Williams", GOOD_LOGO);
    assert.equal((await cardCall("k=portal&t=" + VALID_TOKEN + "&v=" + v)).res.headers.get("cache-control"), LONG_CC);
    assert.equal((await cardCall("k=portal&t=" + VALID_TOKEN + "&v=stale")).res.headers.get("cache-control"), SHORT_CC, "stale fingerprint (the company changed its logo since)");
    assert.equal((await cardCall("k=portal&t=" + VALID_TOKEN)).res.headers.get("cache-control"), SHORT_CC, "no fingerprint");
  } finally { f.restore(); }
  // a company whose logo URL is not in our company-logos bucket: never fetched; the name-only card, cached briefly
  f = withCardFetch(() => ({ ...VALID_COMPANY(), logo_url: EVIL_LOGO }));
  try {
    const { res, bytes } = await cardCall("k=portal&t=" + VALID_TOKEN + "&v=" + cardVersion("Veron Williams", EVIL_LOGO));
    assert.equal(res.headers.get("content-type"), "image/png"); assert.deepEqual(pngSize(bytes), [1200, 630]);
    assert.equal(res.headers.get("cache-control"), SHORT_CC);
    assert.equal(f.seen.includes(EVIL_LOGO), false);
  } finally { f.restore(); }
  // a company with no logo at all is a settled answer: long cache
  f = withCardFetch(() => ({ company_name: "Beta Builders" }));
  try {
    const { res } = await cardCall("k=portal&t=" + VALID_TOKEN + "&v=" + cardVersion("Beta Builders", null));
    assert.equal(res.headers.get("cache-control"), LONG_CC);
  } finally { f.restore(); }
});

// ── deployment guards (things that only break on Vercel, found by `vercel build`) ───────────────────────────────────────────────
const readRepo = (p: string) => fs.readFileSync(new URL("../../" + p, import.meta.url), "utf8");
const importsOf = (src: string) => [...src.matchAll(/(?:from|import\()\s*["']([^"']+)["']/g)].map((m) => m[1]);

test("deployment: no edge runtime and no @vercel/* import in api/ (Vercel rejects '@vercel' modules in edge functions)", () => {
  for (const f of ["api/share-preview.ts", "api/share-card.ts", "api/_lib/cardHandler.ts", "api/_lib/previewHandler.ts", "api/_lib/card.ts", "api/_lib/nodeAdapter.ts", "api/_lib/sharePreview.ts"]) {
    const src = readRepo(f);
    assert.equal(/runtime\s*:\s*["']edge["']/.test(src), false, f + " must run on the Node.js runtime");
    assert.equal(importsOf(src).some((i) => i.startsWith("@vercel/")), false, f);
  }
});

test("deployment: every relative import in api/ has the .js extension (Node ESM + Vercel's TypeScript check)", () => {
  for (const f of ["api/share-preview.ts", "api/share-card.ts", "api/_lib/cardHandler.ts", "api/_lib/previewHandler.ts", "api/_lib/card.ts", "api/_lib/nodeAdapter.ts", "api/_lib/sharePreview.ts"]) {
    for (const spec of importsOf(readRepo(f)).filter((i) => i.startsWith("."))) assert.match(spec, /\.js$/, f + " imports " + spec);
  }
});

test("deployment: the preview function does not pull in the card renderer (satori / resvg need files that only the card function ships)", () => {
  for (const f of ["api/share-preview.ts", "api/_lib/previewHandler.ts", "api/_lib/nodeAdapter.ts", "api/_lib/sharePreview.ts"]) {
    const specs = importsOf(readRepo(f));
    assert.equal(specs.some((i) => /card|satori|resvg/i.test(i)), false, f + ": " + specs.join(", "));
  }
  // and the card renderer itself loads satori/resvg lazily, so a missing file can only fail a render (-> platform card), never the function start
  const card = readRepo("api/_lib/card.ts");
  assert.equal(/^import .* from ["'](satori|@resvg\/resvg-wasm)["']/m.test(card), false);
});

test("deployment: vercel.json ships the font and both wasm files with the card function", () => {
  const cfg = JSON.parse(readRepo("vercel.json"));
  const inc: string = cfg.functions["api/share-card.ts"].includeFiles;
  for (const need of ["node_modules/@resvg/resvg-wasm/index_bg.wasm", "node_modules/harfbuzzjs/hb.wasm", "api/_lib/Geist-Regular.ttf"]) {
    assert.ok(inc.includes(need), need);
    assert.ok(fs.existsSync(new URL("../../" + need, import.meta.url)), need + " exists");
  }
});


// ── the card is designed for the square crop: nothing outside the centre 630x630 square, content inside the 40px padding ─────────────
async function ink(png: Uint8Array) {
  const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  let minX = info.width, maxX = -1, minY = info.height, maxY = -1, outside = 0;
  for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
    const i = (y * info.width + x) * 3;
    if (data[i] < 250 || data[i + 1] < 250 || data[i + 2] < 250) {
      minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      if (x < CARD.square.x || x >= CARD.square.x + CARD.square.size) outside++;
    }
  }
  return { minX, maxX, minY, maxY, outside, width: info.width, height: info.height };
}
for (const [label, logo, wantW, wantH, name] of [
  ["wide logo (4000x1343 shape)", { w: 1200, h: 403 }, 550, 185, "Veron Williams"],
  ["square logo", { w: 600, h: 600 }, 550, 550, "Acme"],
  ["tall logo", { w: 300, h: 700 }, 236, 550, "Acme"],
] as const) {
  test("square-crop card, " + label + ": all ink inside the centre square and its padding, logo as large as fits", async () => {
    const l = { dataUri: "data:image/png;base64," + Buffer.from(solidPng(logo.w, logo.h, [200, 30, 60])).toString("base64"), width: logo.w, height: logo.h };
    const res = await renderCard({ name, logo: l }, "public, max-age=60");
    const png = new Uint8Array(await res.arrayBuffer());
    const k = await ink(png);
    assert.deepEqual([k.width, k.height], [1200, 630]);
    assert.equal(k.outside, 0, "nothing at all drawn outside x 285-915");
    assert.ok(k.minX >= CARD.square.x + CARD.square.pad - 2 && k.maxX <= CARD.square.x + CARD.square.size - CARD.square.pad + 2, "inside the horizontal padding: " + k.minX + ".." + k.maxX);
    assert.ok(k.minY >= CARD.square.pad - 2 && k.maxY <= 630 - CARD.square.pad + 2, "inside the vertical padding: " + k.minY + ".." + k.maxY);
    // the red logo block itself (the name text is dark, not red)
    const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    let rx0 = 9999, rx1 = -1, ry0 = 9999, ry1 = -1;
    for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) { const i = (y * info.width + x) * 3; if (data[i] > 150 && data[i + 1] < 80 && data[i + 2] < 110) { rx0 = Math.min(rx0, x); rx1 = Math.max(rx1, x); ry0 = Math.min(ry0, y); ry1 = Math.max(ry1, y); } }
    assert.ok(Math.abs((rx1 - rx0 + 1) - wantW) <= 4 && Math.abs((ry1 - ry0 + 1) - wantH) <= 4, "logo is " + (rx1 - rx0 + 1) + "x" + (ry1 - ry0 + 1) + ", wanted about " + wantW + "x" + wantH);
    assert.ok(Math.abs((rx0 + rx1) / 2 - 600) <= 3, "logo is centred horizontally");
    assert.equal(png.length < CARD.maxBytes, true);
    if (process.env.SHARE_CARD_OUT) fs.writeFileSync(process.env.SHARE_CARD_OUT + "/square-" + label.replace(/[^a-z0-9]+/gi, "-") + ".png", png);
  });
}

test("square-crop card: the name appears under a wide logo, and is left off a square or tall one", async () => {
  const mk = (w: number, h: number) => ({ dataUri: "data:image/png;base64," + Buffer.from(solidPng(w, h, [200, 30, 60])).toString("base64"), width: w, height: h });
  const inkBelowLogo = async (w: number, h: number) => {
    const png = new Uint8Array(await (await renderCard({ name: "Veron Williams", logo: mk(w, h) }, "x")).arrayBuffer());
    const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    let dark = 0;
    for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) { const i = (y * info.width + x) * 3; if (data[i] < 90 && data[i + 1] < 90 && data[i + 2] < 110) dark++; }
    return dark;
  };
  assert.ok(await inkBelowLogo(1200, 403) > 500, "wide logo: the dark name text is drawn");
  assert.equal(await inkBelowLogo(600, 600), 0, "square logo: no name");
  assert.equal(await inkBelowLogo(300, 700), 0, "tall logo: no name");
});

test("square-crop card: a name-only card (no logo) stays inside the square, including a very long name", async () => {
  for (const name of ["Veron Williams", "Magnus Boys Construction & Engineering Services Limited"]) {
    const png = new Uint8Array(await (await renderCard({ name, logo: null }, "x")).arrayBuffer());
    const k = await ink(png);
    assert.equal(k.outside, 0, name);
    assert.ok(k.minX >= CARD.square.x + CARD.square.pad - 2 && k.maxX <= CARD.square.x + CARD.square.size - CARD.square.pad + 2, name + ": " + k.minX + ".." + k.maxX);
  }
});