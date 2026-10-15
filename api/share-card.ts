// api/share-card.ts — GET /api/share-card?n=<company name>&l=<logo url>&v=<fingerprint>  ->  1200x630 PNG for link previews.
//
// The logo may only come from our own Supabase company-logos storage (so this cannot be used to fetch arbitrary URLs); the name is plain text.
// The URL carries a fingerprint of name + logo (see cardVersion), so a new logo is a new URL and the card can be cached for a year.
// If the logo is missing, unreadable or not a supported format the card shows the company name large, and is cached only briefly in case the
// logo is merely slow to load.
import { renderCard } from "./_lib/card";
import { loadLogo, stripControl } from "./_lib/sharePreview";

export const config = { runtime: "edge" };

const LONG = "public, max-age=31536000, s-maxage=31536000, immutable";
const SHORT = "public, max-age=300, s-maxage=300";

export default async function handler(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const name = stripControl(url.searchParams.get("n"), 80);
  if (!name) return new Response("Missing name", { status: 400, headers: { "Cache-Control": "no-store" } });

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const logoParam = url.searchParams.get("l");
  const logo = logoParam ? await loadLogo(logoParam, supabaseUrl) : null;

  // No logo on purpose (no l=) is a settled answer; a logo that was asked for but could not be loaded is retried soon.
  return renderCard({ name, logo }, !logoParam || logo ? LONG : SHORT);
}
