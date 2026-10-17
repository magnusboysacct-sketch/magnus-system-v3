// api/_lib/cardHandler.ts — the card image endpoint as a Web-standard handler (Request -> Response). api/share-card.ts wraps it for Vercel's Node.js
// runtime (nodeAdapter.ts); the unit tests call it directly.
import { renderCard } from "./card.js";
import { cardVersion, fetchSharePreview, isShareKind, isValidToken, loadLogo, previewEnv } from "./sharePreview.js";

// ── GET /api/share-card?k=<portal|contact|photos>&t=<token>&v=<fingerprint>  ->  1200x630 PNG for link previews ────────────────
// The card is addressed by the same kind + token as the share link. It looks the company up ITSELF (get_share_preview) and draws only what the database
// returns: nothing about what is drawn — no name, no logo URL — is read from the request, so it cannot be used to put arbitrary text or images on our
// domain. Anything the database does not recognise (unknown, revoked, expired token; malformed parameters; database trouble) gets the platform's own
// card, /og-image.png — exactly what the page itself shows in that case.
//
// The logo may only come from our own Supabase company-logos storage, over https, with no redirects, at most 4 MB and 4 s. v is only a cache-buster (the
// fingerprint of the name + logo the preview page built the URL for): when it matches the current data the card is cached for a year; when it does not
// (the company changed its logo since), or the logo could not be loaded, the card is cached only briefly.
const LONG = "public, max-age=31536000, s-maxage=31536000, immutable";
const SHORT = "public, max-age=300, s-maxage=300";

// The platform's own card, as the page uses it.
async function platformCard(request: Request): Promise<Response> {
  try {
    const res = await fetch(new URL("/og-image.png", request.url));
    // (a real static file; if a rewrite handed back the app's HTML instead, that is not an image)
    if (res.ok && (res.headers.get("content-type") || "").startsWith("image/")) return new Response(await res.arrayBuffer(), { status: 200, headers: { "Content-Type": "image/png", "Cache-Control": SHORT } });
  } catch { /* fall through */ }
  return new Response(null, { status: 302, headers: { Location: "/og-image.png", "Cache-Control": "no-store" } });
}

export async function shareCardHandler(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const kind = url.searchParams.get("k");
  const token = url.searchParams.get("t");
  if (!isShareKind(kind) || !isValidToken(token)) return platformCard(request);

  const preview = await fetchSharePreview(kind, token);
  if (!preview) return platformCard(request);

  const logo = preview.logo_url ? await loadLogo(preview.logo_url, previewEnv()?.url) : null;
  const settled = !preview.logo_url || !!logo;                                            // a logo that failed to load is retried soon
  const current = url.searchParams.get("v") === cardVersion(preview.company_name, preview.logo_url);
  try {
    return await renderCard({ name: preview.company_name, logo }, settled && current ? LONG : SHORT);
  } catch {
    return platformCard(request);                                                          // never leave a preview without an image
  }
}
