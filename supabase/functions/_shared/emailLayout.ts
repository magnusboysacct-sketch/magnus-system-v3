// supabase/functions/_shared/emailLayout.ts
//
// One light, dark-mode-proof layout for every client-facing email, so they all match and a company logo (dark, light, colourful,
// or a transparent PNG) is always shown on white.
//
// Why it is built this way:
//   - A complete HTML document with <meta name="color-scheme" content="light only"> and <meta name="supported-color-schemes"
//     content="light"> (Apple Mail / Outlook / iOS honour these and will not flip the message to dark).
//   - Table layout with an explicit bgcolor ATTRIBUTE and inline background on the page, the card, the header, the body and the
//     footer. Mail apps that recolour "unstyled" areas have nothing to recolour.
//   - Gmail's dark mode ignores color-scheme and inverts plain light backgrounds. Giving the header/body cells a
//     background-image (a flat white gradient) is the known way to make Gmail leave them alone. Best effort: a client that
//     force-inverts everything regardless cannot be fully controlled from the sender's side.
//   - The logo sits in its own white cell at natural proportions (width/height auto, capped). Email clients ignore object-fit.
//   - The button is a table cell with bgcolor, so it renders as a gold button in Outlook too.

export function esc(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

const WHITE = "#ffffff";
const PAGE = "#f6f6f6";
const FOOTER = "#f0f0f0";
const GOLD = "#d4a017";
const FONT = "Arial,Helvetica,sans-serif";
// Flat gradients: harmless visually, and they stop Gmail's dark mode from inverting the cell.
const keepWhite = `background-color:${WHITE};background-image:linear-gradient(${WHITE},${WHITE});`;
const keepPage = `background-color:${PAGE};background-image:linear-gradient(${PAGE},${PAGE});`;
const keepFooter = `background-color:${FOOTER};background-image:linear-gradient(${FOOTER},${FOOTER});`;

export interface EmailBrand {
  logoUrl?: string | null;
  companyName: string;
  tagline?: string | null;
}

// A gold call-to-action button that survives Outlook and dark modes.
export function emailButton(href: string, label: string): string {
  return `<table role="presentation" align="center" border="0" cellpadding="0" cellspacing="0" style="margin:32px auto;">
  <tr><td align="center" bgcolor="${GOLD}" style="background-color:${GOLD};border-radius:6px;">
    <a href="${href}" style="display:inline-block;padding:14px 28px;font-family:${FONT};font-size:16px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:6px;background-color:${GOLD};">${esc(label)}</a>
  </td></tr>
</table>`;
}

function headerCell(brand: EmailBrand): string {
  const name = esc(brand.companyName);
  // With a logo the logo stands alone (a wordmark already contains the company name); without one the name is shown as text.
  const top = brand.logoUrl
    ? `<img src="${esc(brand.logoUrl)}" alt="${name}" style="display:block;margin:0 auto 12px;width:auto;height:auto;max-height:70px;max-width:260px;border:0;outline:none;">`
    : `<h2 style="margin:0;font-family:${FONT};font-size:24px;color:#111111;">${name}</h2>`;
  const tagline = brand.tagline ? `<p style="margin:8px 0 0;font-family:${FONT};font-size:13px;color:#666666;">${esc(brand.tagline)}</p>` : "";
  return `<tr><td align="center" bgcolor="${WHITE}" style="${keepWhite}padding:24px;text-align:center;border-top:5px solid ${GOLD};border-bottom:1px solid #e5e7eb;color:#111111;">
      ${top}
      ${tagline}
    </td></tr>`;
}

// The full client-facing email: light header (logo on white), body, grey footer.
export function renderEmail(opts: { title: string; brand: EmailBrand; bodyHtml: string; footerLines?: string[] }): string {
  const footer = (opts.footerLines || []).filter((l) => String(l ?? "").trim() !== "");
  const footerRow = footer.length
    ? `<tr><td align="center" bgcolor="${FOOTER}" style="${keepFooter}padding:18px;text-align:center;font-family:${FONT};font-size:12px;color:#666666;">
      ${footer.map((l, i) => `<p style="margin:${i === 0 ? "0" : "5px 0 0"};color:#666666;">${esc(l)}</p>`).join("\n      ")}
    </td></tr>`
    : "";
  return documentShell(
    opts.title,
    `<table role="presentation" width="620" align="center" border="0" cellpadding="0" cellspacing="0" bgcolor="${WHITE}" style="width:100%;max-width:620px;${keepWhite}border:1px solid #dddddd;border-radius:10px;">
    ${headerCell(opts.brand)}
    <tr><td bgcolor="${WHITE}" style="${keepWhite}padding:32px;font-family:${FONT};font-size:15px;line-height:1.5;color:#222222;">
      ${opts.bodyHtml}
    </td></tr>
    ${footerRow}
  </table>`
  );
}

// For emails that keep their own letter/payslip layout but must still stay on a white page in dark-mode mail apps.
export function lightOnlyWrap(title: string, innerHtml: string): string {
  return documentShell(
    title,
    `<table role="presentation" width="640" align="center" border="0" cellpadding="0" cellspacing="0" bgcolor="${WHITE}" style="width:100%;max-width:640px;${keepWhite}">
    <tr><td bgcolor="${WHITE}" style="${keepWhite}color:#1a1a1a;">${innerHtml}</td></tr>
  </table>`
  );
}

function documentShell(title: string, cardHtml: string): string {
  return `<!DOCTYPE html>
<html lang="en" style="color-scheme:light only;supported-color-schemes:light;background-color:${PAGE};">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light">
<title>${esc(title)}</title>
<style>
  :root { color-scheme: light only; supported-color-schemes: light; }
  body { margin:0; padding:0; background-color:${PAGE}; }
</style>
</head>
<body bgcolor="${PAGE}" style="margin:0;padding:0;${keepPage}">
<table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" bgcolor="${PAGE}" style="${keepPage}">
  <tr><td align="center" bgcolor="${PAGE}" style="${keepPage}padding:30px 12px;">
  ${cardHtml}
  </td></tr>
</table>
</body>
</html>`;
}
