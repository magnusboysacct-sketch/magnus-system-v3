// TEMPORARY (removed with the /share-test A/B test). Measures what a link-preview bot gets for each test variant of the preview image.
//
//   node scripts/measure-share-test.mjs https://app.magnusboys.com            all variants a-e
//   node scripts/measure-share-test.mjs https://app.magnusboys.com b c        just those
//   node scripts/measure-share-test.mjs --image https://…/some.png            just one image URL
//
// For each variant: fetch /share-test/<variant> as WhatsApp, read og:image, then fetch that image 3 times (1st = cold, 2nd/3rd = warm) and print time to
// first byte, total time, size, PNG shape and the response headers WhatsApp's fetcher sees. "Cold" is only truly cold on the first run after a deploy
// (or after the function has been idle for a while); run it right after deploying.
const UA = "WhatsApp/2.23.20.0 A";
const args = process.argv.slice(2);
const HEADERS = ["content-type", "content-length", "transfer-encoding", "content-encoding", "cache-control", "etag", "last-modified", "age", "x-vercel-cache", "cf-cache-status", "x-vercel-id", "server"];

async function timed(url, init = {}) {
  const t0 = performance.now();
  const res = await fetch(url, { redirect: "manual", ...init, headers: { "user-agent": UA, ...(init.headers || {}) } });
  const ttfb = performance.now() - t0;
  const body = new Uint8Array(await res.arrayBuffer());
  return { res, body, ttfb, total: performance.now() - t0 };
}

function describePng(b) {
  if (b.length < 26 || b[0] !== 0x89 || b[1] !== 0x50) return "not a PNG";
  const dv = new DataView(b.buffer, b.byteOffset);
  const ct = { 0: "grey", 2: "RGB (no alpha)", 4: "grey+alpha", 6: "RGBA (has alpha)", 3: "palette" }[b[25]] || b[25];
  return `${dv.getUint32(16)}x${dv.getUint32(20)}, ${b[24]}-bit ${ct}, ${b[28] ? "interlaced" : "not interlaced"}`;
}

async function measureImage(label, url) {
  console.log(`\n${label}\n  ${url.length > 150 ? url.slice(0, 150) + "…" : url}`);
  for (const [i, kind] of ["cold (1st)", "warm (2nd)", "warm (3rd)"].entries()) {
    const r = await timed(url);
    console.log(`  ${kind}: HTTP ${r.res.status}  first byte ${r.ttfb.toFixed(0)} ms  total ${r.total.toFixed(0)} ms  ${r.body.length} bytes`);
    if (i === 0) {
      console.log(`    image: ${describePng(r.body)}`);
      for (const h of HEADERS) { const v = r.res.headers.get(h); console.log(`    ${h.padEnd(18)} ${v ?? "(none)"}`); }
      if (r.res.headers.get("content-length") && Number(r.res.headers.get("content-length")) !== r.body.length) console.log("    !! content-length differs from the body size");
      if (!r.res.headers.get("content-length")) console.log("    !! no Content-Length (chunked)");
      if (r.body.length > 300_000) console.log("    !! over 300 KB");
    }
  }
}

if (args[0] === "--image") {
  await measureImage("image", args[1]);
} else {
  const base = (args[0] || "https://app.magnusboys.com").replace(/\/+$/, "");
  const variants = args.length > 1 ? args.slice(1) : ["a", "b", "c", "d", "e"];
  for (const v of variants) {
    const page = await timed(`${base}/share-test/${v}?r=${Date.now()}`);
    const html = new TextDecoder().decode(page.body);
    const img = /property="og:image" content="([^"]+)"/.exec(html)?.[1]?.replaceAll("&amp;", "&");
    console.log(`\n=== variant ${v}: page HTTP ${page.res.status} in ${page.total.toFixed(0)} ms, ${page.body.length} bytes` + (img ? "" : "   (no og:image: you got the normal app page — is SHARE_TEST_TOKEN set?)"));
    if (img) await measureImage(`variant ${v} image`, img);
  }
}
