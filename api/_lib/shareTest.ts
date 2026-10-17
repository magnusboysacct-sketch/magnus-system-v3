// api/_lib/shareTest.ts — TEMPORARY A/B test for how WhatsApp lays out our link previews (see api/share-test.ts). Remove with `git revert` of the commit
// that added it; nothing else depends on it.
//
// Why: WhatsApp shows the static /og-image.png as a LARGE image across the top, but our dynamic company card as a small square thumbnail. The test serves the
// SAME preview page for one fixed company with three different og:image values:
//   a  https://<host>/og-image.png                                   the static file known to go large
//   b  https://<host>/api/share-card/test/<alias>/<v>.png            our dynamic card (current behaviour)
//   c  a pre-generated copy of the same card in Supabase public storage: a plain static file on a CDN
// Two optional diagnostics, to tell WHY a card might not go large if c does not: our card is an RGBA PNG (with an alpha channel) while og-image.png is plain RGB.
//   d  the same card, flattened to RGB (no alpha), in Supabase public storage       (c vs d: is it the alpha channel?)
//   e  the same RGB file served from our own domain (/share-test-card.png)           (d vs e: is it the host?)
// The company comes from SHARE_TEST_TOKEN (a real, enabled portal token of the test company) in the server environment. The token never appears in any
// response or log: b's image URL uses the public alias below instead, which only the card handler maps back to the token.
import { buildPreviewHtml, cardVersion, fetchSharePreview, isPreviewBot, isShareKind, isValidToken, previewEnv, type ShareKind } from "./sharePreview.js";

export const TEST_ALIAS = "company-card-test";
export const TEST_VARIANTS = ["a", "b", "c", "d", "e"] as const;
export type TestVariant = (typeof TEST_VARIANTS)[number];

// VERON WILLIAMS (public: it is the folder name in the company-logos bucket). Override with SHARE_TEST_CARD_URL for another file / company.
const DEFAULT_COMPANY_ID = "d280bd58-b0e0-4a34-9c47-8f0bda3eb9af";
export const DEFAULT_CARD_FILE = `share-card-v1.png`;
export const DEFAULT_CARD_FILE_RGB = `share-card-v1-rgb.png`;

export function testTarget(env: Record<string, string | undefined> = process.env): { kind: ShareKind; token: string } | null {
  const token = env.SHARE_TEST_TOKEN;
  const kind = env.SHARE_TEST_KIND || "portal";
  return isShareKind(kind) && isValidToken(token) ? { kind, token } : null;
}

// The card endpoint calls this first: k=test&t=<alias> means "the test company" and is resolved on the server; anything else is untouched.
export function resolveTestAlias(kind: string | null, token: string | null, env: Record<string, string | undefined> = process.env): { kind: ShareKind; token: string } | null {
  return kind === "test" && token === TEST_ALIAS ? testTarget(env) : null;
}

export function staticCardUrl(env: Record<string, string | undefined> = process.env, file = DEFAULT_CARD_FILE): string | null {
  if (file === DEFAULT_CARD_FILE && env.SHARE_TEST_CARD_URL) return env.SHARE_TEST_CARD_URL;
  const base = previewEnv(env)?.url;
  return base ? `${base}/storage/v1/object/public/company-logos/${DEFAULT_COMPANY_ID}/${file}` : null;
}

async function normalApp(request: Request): Promise<Response> {
  const headers = { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" };
  try {
    const res = await fetch(new URL("/index.html", request.url), { headers: { Accept: "text/html" } });
    if (res.ok) return new Response(await res.text(), { status: 200, headers });
  } catch { /* fall through */ }
  return new Response("<!doctype html><title>Magnus System</title>", { status: 200, headers });
}

// GET /api/share-test?variant=a|b|c|d|e  (reached through the bot-only rewrite of /share-test/:variant)
export async function shareTestHandler(request: Request, env: Record<string, string | undefined> = process.env): Promise<Response> {
  const url = new URL(request.url);
  const variant = url.searchParams.get("variant");
  const target = testTarget(env);
  if (!isPreviewBot(request.headers.get("user-agent")) || !(TEST_VARIANTS as readonly string[]).includes(variant || "") || !target) return normalApp(request);

  const preview = await fetchSharePreview(target.kind, target.token, fetch, previewEnv(env));
  if (!preview) return normalApp(request);

  const origin = `https://${request.headers.get("x-forwarded-host") || url.host}`;
  let imageUrl: string | null;
  if (variant === "a") imageUrl = `${origin}/og-image.png`;
  else if (variant === "b") imageUrl = `${origin}/api/share-card/test/${TEST_ALIAS}/${cardVersion(preview.company_name, preview.logo_url)}.png`;
  else if (variant === "c") imageUrl = staticCardUrl(env);
  else if (variant === "d") imageUrl = staticCardUrl(env, DEFAULT_CARD_FILE_RGB);
  else imageUrl = `${origin}/share-test-card.png`;
  if (!imageUrl) return normalApp(request);

  const html = buildPreviewHtml({
    title: preview.title, description: preview.description, company: preview.company_name,
    pageUrl: `${origin}/share-test/${variant}`,           // the only other thing that differs between the variants: their own address
    imageUrl,
  });
  return new Response(html, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}
