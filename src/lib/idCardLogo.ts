// src/lib/idCardLogo.ts
//
// How the company logo sits on the Worker and Staff ID cards. One set of numbers (card pixels, on the 213 x 338 portrait card) is shared by
// the on-screen preview, the Worker canvas print and the Staff print page, so all of them lay the logo out the same way:
//   FRONT (navy)  a white rounded-rectangle "plate" with a thin gold border, centred in a 56px band at the top. The logo sits inside it at its
//                 natural aspect ratio (contain: never cropped, never stretched) with even padding, so the plate follows the logo's shape: about
//                 56% of the card width for a wide logo, narrower for a square or tall one, and never taller than the band.
//   BACK (light)  no plate. The logo at its natural aspect ratio, centred, no taller than 26px and no wider than half the card.
// A logo is never scaled above its own pixel size (same as CSS max-width / max-height), so the preview and the canvas agree exactly.

export const ID_LOGO = {
  plateMaxW: 119,      // ~56% of the 213px card; keeps clear of the OFFICIAL ID badge
  plateMaxH: 56,       // the band the old circle occupied
  platePad: 5,         // even padding between plate edge and logo
  plateBorder: 1,      // thin gold border
  plateRadius: 7,
  backMaxW: 106,       // ~50% of the card
  backMaxH: 26,        // the old small circle's height
} as const;

const inset = ID_LOGO.platePad + ID_LOGO.plateBorder;
// The box the logo itself must fit inside on the front plate.
export const PLATE_IMG_MAX_W = ID_LOGO.plateMaxW - 2 * inset;
export const PLATE_IMG_MAX_H = ID_LOGO.plateMaxH - 2 * inset;
export const PLATE_INSET = inset;

// Fit (iw x ih) inside (maxW x maxH) keeping the aspect ratio, never above the natural size. An image with no known size (some SVGs) fills the box.
export function fitInside(iw: number, ih: number, maxW: number, maxH: number): { w: number; h: number } {
  if (!iw || !ih) return { w: maxW, h: maxH };
  const scale = Math.min(1, maxW / iw, maxH / ih);
  return { w: iw * scale, h: ih * scale };
}

const escapeAttr = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;");

// ── Static HTML for the Staff print page. `u` turns card pixels into a CSS length (the print page works in mm). ──
export function frontLogoPlateHtml(o: { logoUrl?: string | null; initial: string; u: (px: number) => string; bandHeight: string; gold: string; navy: string }): string {
  const { logoUrl, initial, u, bandHeight, gold, navy } = o;
  const border = `${u(ID_LOGO.plateBorder)} solid ${gold}`;
  const plate = logoUrl
    ? `<div style="background:#fff;border:${border};border-radius:${u(ID_LOGO.plateRadius)};padding:${u(ID_LOGO.platePad)};line-height:0">` +
      `<img src="${escapeAttr(logoUrl)}" alt="logo" style="display:block;width:auto;height:auto;max-width:${u(PLATE_IMG_MAX_W)};max-height:calc(${bandHeight} - ${u(2 * inset)});object-fit:contain"/></div>`
    : `<div style="box-sizing:border-box;width:${bandHeight};height:${bandHeight};background:#fff;border:${border};border-radius:${u(ID_LOGO.plateRadius)};display:flex;align-items:center;justify-content:center">` +
      `<span style="font-size:${u(22)};font-weight:800;color:${navy}">${initial}</span></div>`;
  return `<div style="height:${bandHeight};display:flex;align-items:center;justify-content:center">${plate}</div>`;
}

export function backLogoHtml(o: { logoUrl?: string | null; initial: string; u: (px: number) => string; bandHeight: string; navy: string; initialSize: string }): string {
  const { logoUrl, initial, u, bandHeight, navy, initialSize } = o;
  const mark = logoUrl
    ? `<img src="${escapeAttr(logoUrl)}" alt="logo" style="display:block;width:auto;height:auto;max-width:${u(ID_LOGO.backMaxW)};max-height:${bandHeight};object-fit:contain"/>`
    : `<div style="box-sizing:border-box;width:${bandHeight};height:${bandHeight};border-radius:${u(6)};background:${navy};display:flex;align-items:center;justify-content:center"><span style="font-size:${initialSize};font-weight:800;color:#fff">${initial}</span></div>`;
  return `<div style="height:${bandHeight};display:flex;align-items:center;justify-content:center">${mark}</div>`;
}
