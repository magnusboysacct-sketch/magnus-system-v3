// src/lib/idCardGuide.ts
// The "How to get these printed" guide: ONE text, used by the download dialog, by PRINT INSTRUCTIONS.pdf and by the Help & Training article, so they never disagree.

export const CARD_SPEC_LINES = [
  "Size: CR80 (the standard ID / bank card size), 54 x 85.6 mm, portrait",
  "Double-sided: front and back",
  "Files: print-ready PDF with 3 mm bleed on every side (page size 60 x 91.6 mm); trim to the card size",
  "Colour, 300 dpi or higher (our files are 600 dpi)",
  "Square corners in the file: the card cutter or PVC card printer rounds them",
];

export const GLOSSARY = [
  ["Bleed", "an extra 3 mm of background around the edge of the card, so the cut never shows a white line"],
  ["Trim", "the final card size, 54 x 85.6 mm, after the bleed is cut off"],
  ["CR80", "the standard ID / bank card size"],
  ["dpi", "dots per inch: how sharp the print is (300 or more is good)"],
];

export const WHICH_FILE = [
  ["Card PDF", "for a print shop that has a PVC ID card printer. This is the one most shops want."],
  ["Print sheet PDF", "if you print on paper or card stock at an office printer and laminate the cards. It has crop marks (little lines showing where to cut) and the cards at true size."],
  ["PNG images", "only if the shop asks for pictures instead of a PDF."],
  ["Print instructions", "a one-page sheet with the card size, the number of cards and the list of names. Put it on the thumb drive or send it with the files."],
];

export const BEFORE_YOU_GO = [
  "Print ONE card at home first. In the print window choose 100% or Actual size (never Fit to page).",
  "Measure it: it should be 54 x 85.6 mm.",
  "Scan the QR code with your phone camera. It should open a page showing the person's name and a green VALID ID.",
];

export const WHEN_YOU_PICK_UP = [
  "Scan the QR code on a few of the cards before you pay.",
  "Check the colours against your screen and that the names, photos and logo are right.",
  "Check the card size and that the edges are cut evenly with no white line.",
];

export function kindWord(kinds: Array<"staff" | "worker">): string {
  const set = new Set(kinds);
  return set.size === 1 ? (set.has("staff") ? "staff " : "worker ") : "";
}

// The message to give the print shop (company name and number of cards filled in).
export function shopMessage(companyName: string, kinds: Array<"staff" | "worker">): string {
  const n = kinds.length;
  const noun = `${kindWord(kinds)}ID card${n === 1 ? "" : "s"}`;
  return `Hi, I need ${n} ${noun} printed for ${companyName}. Size: CR80 (standard ID / bank card), 54 x 85.6 mm, portrait, double-sided. ` +
    `Files are print-ready PDF with 3 mm bleed on all sides; please trim to the card size. Colour, 300 dpi or higher. ` +
    `Please do a test card first so I can check the colours and that the QR code scans.`;
}

// The same guide as plain paragraphs, for the Help & Training article.
export const GUIDE_ARTICLE_TITLE = "Printing ID cards at a print shop";
