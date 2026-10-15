// api/_lib/card.ts — renders the 1200x630 link-preview card (white, company logo centred at its natural shape, company name underneath).
import { ImageResponse } from "@vercel/og";
import type { ReactElement } from "react";
import { CARD, fitLogo } from "./sharePreview";

type Node = { type: string; props: Record<string, unknown> };
// Plain element objects (what JSX would produce) so this file needs no React or JSX setup.
const h = (type: string, style: Record<string, unknown>, children?: unknown, extra: Record<string, unknown> = {}): Node => ({ type, props: { style, children, ...extra } });

export interface CardInput {
  name: string;
  logo: { dataUri: string; width: number; height: number } | null;
}

// Card-image elements. With a logo: logo (contain), name under it. Without: the name alone, large. Everything stays inside the centre
// 630x630 square (width <= 560) so a square crop by a chat app still shows it whole.
export function cardElement({ name, logo }: CardInput): ReactElement {
  const nameStyle = (size: number, clamp: number) => ({
    display: "flex", maxWidth: 560, textAlign: "center", justifyContent: "center", fontSize: size, fontWeight: 600, color: "#111827", lineHeight: 1.15,
    lineClamp: clamp, wordBreak: "break-word",
  });
  const root = (children: unknown) =>
    h("div", { width: CARD.width, height: CARD.height, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "#ffffff" }, children);

  if (!logo) {
    const size = name.length <= 14 ? 96 : name.length <= 28 ? 72 : 56;
    return root(h("div", nameStyle(size, 3), name)) as unknown as ReactElement;
  }
  const { w, h: ph } = fitLogo(logo.width, logo.height);
  return root([
    h("img", { width: w, height: ph, objectFit: "contain" }, undefined, { src: logo.dataUri, width: w, height: ph }),
    h("div", { ...nameStyle(40, 2), marginTop: 28 }, name),
  ]) as unknown as ReactElement;
}

// ImageResponse adds its own (always year-long, immutable) Cache-Control, so the body is re-wrapped to make ours the only one: a card for a logo that
// could not be loaded must NOT be cached for a year.
export function renderCard(input: CardInput, cacheControl: string): Response {
  const img = new ImageResponse(cardElement(input), { width: CARD.width, height: CARD.height });
  return new Response(img.body, { status: 200, headers: { "Content-Type": "image/png", "Cache-Control": cacheControl } });
}
