// api/_lib/card.ts — renders the 1200x630 link-preview card (white, company logo centred at its natural shape, company name underneath).
//
// satori turns the element tree into an SVG and resvg (WebAssembly build: no native binaries) rasterises it to a PNG. This runs in a normal Node.js
// serverless function. The font and the resvg .wasm are read from files that vercel.json ("functions" -> includeFiles) puts into the function.
import { readFileSync } from "node:fs";
import type { ReactElement } from "react";
import { CARD, fitLogo } from "./sharePreview.js";

type Node = { type: string; props: Record<string, unknown> };
// Plain element objects (what JSX would produce) so this file needs no React or JSX setup.
const h = (type: string, style: Record<string, unknown>, children?: unknown, extra: Record<string, unknown> = {}): Node => ({ type, props: { style, children, ...extra } });

export interface CardInput {
  name: string;
  logo: { dataUri: string; width: number; height: number } | null;
}

// Card-image elements. With a logo: the logo (contain, as large as the box in sharePreview.ts allows), name under it. Without: the name alone, large.
export function cardElement({ name, logo }: CardInput): ReactElement {
  const nameStyle = (size: number, clamp: number) => ({
    display: "flex", maxWidth: 900, textAlign: "center", justifyContent: "center", fontSize: size, fontWeight: 600, color: "#111827", lineHeight: 1.15,
    lineClamp: clamp, wordBreak: "break-word",
  });
  const root = (children: unknown) =>
    h("div", { width: CARD.width, height: CARD.height, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "#ffffff" }, children);

  if (!logo) {
    const size = name.length <= 14 ? 120 : name.length <= 28 ? 92 : 68;
    return root(h("div", nameStyle(size, 3), name)) as unknown as ReactElement;
  }
  const { w, h: ph } = fitLogo(logo.width, logo.height);
  return root([
    h("img", { width: w, height: ph, objectFit: "contain" }, undefined, { src: logo.dataUri, width: w, height: ph }),
    h("div", { ...nameStyle(40, 2), marginTop: 28 }, name),
  ]) as unknown as ReactElement;
}

// Loaded once per function instance. The paths are relative to this file; in the deployed function the project layout is kept, so they resolve to
// the same node_modules / api/_lib files that the build includes (vercel.json "functions" -> includeFiles).
const FONT_URL = new URL("./Geist-Regular.ttf", import.meta.url);
const WASM_URL = new URL("../../node_modules/@resvg/resvg-wasm/index_bg.wasm", import.meta.url);
// satori and resvg are loaded lazily, inside renderCard: if anything about them is missing or broken in a deployment, only the card render fails (the
// caller then serves the platform card) — it can never stop the function from starting.
let ready: Promise<{ satori: typeof import("satori").default; Resvg: typeof import("@resvg/resvg-wasm").Resvg; font: Buffer }> | null = null;
function init() {
  ready ??= (async () => {
    const [{ default: satori }, resvg] = await Promise.all([import("satori"), import("@resvg/resvg-wasm")]);
    await resvg.initWasm(readFileSync(WASM_URL));
    return { satori, Resvg: resvg.Resvg, font: readFileSync(FONT_URL) };
  })();
  ready.catch(() => { ready = null; });                 // a failed start is retried on the next request
  return ready;
}

async function rasterise(input: CardInput): Promise<Uint8Array> {
  const { satori, Resvg, font } = await init();
  const svg = await satori(cardElement(input), { width: CARD.width, height: CARD.height, fonts: [{ name: "Geist", data: font, weight: 400, style: "normal" }] });
  return new Resvg(svg, { fitTo: { mode: "width", value: CARD.width } }).render().asPng();
}

// The PNG is always sent whole with a Content-Length (nodeAdapter.ts) and stays under CARD.maxBytes: link-preview apps drop or shrink big images. A logo
// that is photographic enough to push the card past the limit is left off (the name is drawn alone) rather than risk the preview.
export async function renderCard(input: CardInput, cacheControl: string): Promise<Response> {
  let png = await rasterise(input);
  if (png.length > CARD.maxBytes && input.logo) png = await rasterise({ ...input, logo: null });
  return new Response(png as BodyInit, { status: 200, headers: { "Content-Type": "image/png", "Content-Length": String(png.length), "Cache-Control": cacheControl } });
}
