// api/_lib/ogPage.ts — what WhatsApp / Facebook / Google see for the public pages (they don't run the app's JavaScript).
// vercel.json sends only those bots here, for /pricing, /status, /feedback, /privacy and /terms. People get the normal page.

const PAGES: Record<string, { title: string; description: string }> = {
  pricing: { title: "Pricing | Magnus Boy's System", description: "Simple monthly plans for Caribbean construction companies, with a free trial. Free during launch." },
  status: { title: "Status | Magnus Boy's System", description: "Is Magnus Boy's System working right now?" },
  feedback: { title: "Ideas & feedback | Magnus Boy's System", description: "Tell the Magnus team what would make it better." },
  privacy: { title: "Privacy policy | Magnus Boy's System", description: "How Magnus Boy's System looks after your company's data." },
  terms: { title: "Terms | Magnus Boy's System", description: "The terms for using Magnus Boy's System." },
};

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function ogPageHtml(page: string, origin = "https://app.magnusboys.com"): string {
  const p = PAGES[page] ?? { title: "Magnus Boy's System", description: "Run your construction company from your phone." };
  const url = `${origin}/${PAGES[page] ? page : ""}`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>${esc(p.title)}</title>
<meta name="description" content="${esc(p.description)}">
<link rel="canonical" href="${url}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Magnus Boy's System">
<meta property="og:url" content="${url}">
<meta property="og:title" content="${esc(p.title)}">
<meta property="og:description" content="${esc(p.description)}">
<meta property="og:image" content="${origin}/og-image.png">
<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(p.title)}">
<meta name="twitter:description" content="${esc(p.description)}">
<meta name="twitter:image" content="${origin}/og-image.png">
</head><body><h1>${esc(p.title)}</h1><p>${esc(p.description)}</p><a href="${url}">${url}</a></body></html>`;
}

export async function ogPageHandler(request: Request): Promise<Response> {
  const page = new URL(request.url).searchParams.get("page") ?? "";
  return new Response(ogPageHtml(page), {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=3600" },
  });
}
