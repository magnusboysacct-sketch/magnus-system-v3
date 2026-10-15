// api/share-preview.ts — what link-preview bots (WhatsApp, Facebook, Twitter/X, Slack, Telegram, LinkedIn, Discord, Skype, Google) get for a share link.
//
// vercel.json sends /portal/<token>, /portal/contact/<token> and /shared/<token> here ONLY when the user agent is one of those bots; people
// (and every other request) get the normal app exactly as before. The bots do not run JavaScript, so this returns a tiny page whose og:* tags name
// the SENDING company (company_settings, via the get_share_preview function) and point at the 1200x630 card (api/share-card.ts).
//
// An unknown, revoked or expired token — or anything malformed — gets exactly the same answer as no token at all: the normal index.html with the
// platform's own preview tags. Nothing in the response tells them apart, so tokens cannot be probed.
import { buildCardUrl, buildPreviewHtml, isPreviewBot, isShareKind, isValidToken, normalizePreview, sharePath } from "./_lib/sharePreview";

export const config = { runtime: "edge" };

const HTML_HEADERS = { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" };

async function normalApp(request: Request): Promise<Response> {
  try {
    const res = await fetch(new URL("/index.html", request.url), { headers: { Accept: "text/html" } });
    if (res.ok) return new Response(await res.text(), { status: 200, headers: HTML_HEADERS });
  } catch { /* fall through */ }
  return new Response("<!doctype html><title>Magnus System</title>", { status: 200, headers: HTML_HEADERS });
}

export default async function handler(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const kind = url.searchParams.get("kind");
  const token = url.searchParams.get("token");
  if (!isPreviewBot(request.headers.get("user-agent")) || !isShareKind(kind) || !isValidToken(token)) return normalApp(request);

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) return normalApp(request);

  let raw: unknown = null;
  try {
    const res = await fetch(`${supabaseUrl.replace(/\/+$/, "")}/rest/v1/rpc/get_share_preview`, {
      method: "POST",
      headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ p_kind: kind, p_token: token }),
      signal: AbortSignal.timeout(4000),
    });
    if (res.ok) raw = await res.json();
  } catch { /* treated as "no preview" */ }

  const preview = normalizePreview(raw, kind);
  if (!preview) return normalApp(request);

  const host = request.headers.get("x-forwarded-host") || url.host;
  const origin = `https://${host}`;
  const html = buildPreviewHtml({
    title: preview.title,
    description: preview.description,
    company: preview.company_name,
    pageUrl: origin + sharePath(kind, token),
    imageUrl: buildCardUrl(origin, preview.company_name, preview.logo_url),
  });
  return new Response(html, { status: 200, headers: HTML_HEADERS });
}
