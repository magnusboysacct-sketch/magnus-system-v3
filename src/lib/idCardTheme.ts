// src/lib/idCardTheme.ts
// Per-company ID card colours (company_settings.id_card_primary / id_card_accent) and the rules that keep every card readable whatever colours are chosen.
//
//   * The card's face is the PRIMARY colour. Text on it is white or near-black, whichever has more contrast (WCAG ratio at least 4.5:1, see readableOn).
//   * The ACCENT colour is used for stripes, the job title and the footer values. If it has less than 4.5:1 against the primary colour it is lightened or
//     darkened until it does (hue kept); the last resort is the text colour itself.
//   * Faint secondary text (labels, small captions) is brightened until it also has 4.5:1. The default Navy & Gold card is the card the company already
//     has, so it is left exactly as it was (its faint labels keep their original softness).
//   * The QR code is not themed: it is always dark navy on a pure white plate.
// Pure functions, no DOM: used by the card renderer, the Settings colour picker, the verify page and the tests.

export interface IdCardTheme { primary: string; accent: string }

// what comes from the database / a form: either colour may be missing or null
export type MaybeTheme = { primary?: string | null; accent?: string | null };

export const DEFAULT_THEME: IdCardTheme = { primary: "#15315A", accent: "#C9A84C" };

export interface ThemePreset { id: string; name: string; theme: IdCardTheme }
export const THEME_PRESETS: ThemePreset[] = [
  { id: "navy-gold",       name: "Navy & Gold",        theme: { primary: "#15315A", accent: "#C9A84C" } },
  { id: "black-gold",      name: "Black & Gold",       theme: { primary: "#111111", accent: "#C9A84C" } },
  { id: "forest-gold",     name: "Forest Green & Gold", theme: { primary: "#1B4332", accent: "#C9A84C" } },
  { id: "maroon-gold",     name: "Maroon & Gold",      theme: { primary: "#6B1D2A", accent: "#C9A84C" } },
  { id: "charcoal-silver", name: "Charcoal & Silver",  theme: { primary: "#2F3640", accent: "#C0C6CE" } },
  { id: "royal-white",     name: "Royal Blue & White", theme: { primary: "#1E40AF", accent: "#FFFFFF" } },
];

export const HEX_RE = /^#[0-9a-fA-F]{6}$/;
export const isHex = (s: unknown): s is string => typeof s === "string" && HEX_RE.test(s);

// ── colour maths ────────────────────────────────────────────────────────────────────────────────────────────────────────────
export type RGB = [number, number, number];
export const hexToRgb = (hex: string): RGB => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
const h2 = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
export const rgbToHex = ([r, g, b]: RGB) => ("#" + h2(r) + h2(g) + h2(b)).toUpperCase();
export const normalizeHex = (hex: string) => hex.toUpperCase();

const lin = (c: number) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); };
// WCAG relative luminance, 0 (black) .. 1 (white)
export const luminance = (hex: string) => { const [r, g, b] = hexToRgb(hex); return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b); };
// WCAG contrast ratio, 1 .. 21
export function contrast(a: string, b: string) {
  const la = luminance(a), lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
// mix(a, b, t): t = 0 is a, t = 1 is b
export function mix(a: string, b: string, t: number): string {
  const x = hexToRgb(a), y = hexToRgb(b);
  return rgbToHex([x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t]);
}
export function rgba(hex: string, alpha: number) { const [r, g, b] = hexToRgb(hex); return `rgba(${r},${g},${b},${alpha})`; }

export const TEXT_LIGHT = "#FFFFFF";
export const TEXT_DARK = "#050505";        // near-black: with white it gives at least 4.5:1 on EVERY background (see the tests)
export const MIN_CONTRAST = 4.5;

// White or near-black text, whichever reads better on `bg`.
export function readableOn(bg: string): string {
  return contrast(TEXT_LIGHT, bg) >= contrast(TEXT_DARK, bg) ? TEXT_LIGHT : TEXT_DARK;
}

// `color` itself if it has at least `min` contrast on `bg`; otherwise pushed toward white (on a dark bg) or black (on a light bg) in small steps, hue kept.
// If even the extreme is not enough (cannot happen for white / black) the readable text colour is returned.
export function ensureContrast(color: string, bg: string, min = MIN_CONTRAST): string {
  if (contrast(color, bg) >= min) return normalizeHex(color);
  const target = luminance(bg) < 0.4 ? TEXT_LIGHT : TEXT_DARK;
  for (let t = 0.04; t <= 1.0001; t += 0.04) {
    const c = mix(color, target, t);
    if (contrast(c, bg) >= min) return c;
  }
  return readableOn(bg);
}

// ── the palette a card is drawn with ────────────────────────────────────────────────────────────────────────────────────────
export interface CardPalette {
  isDefault: boolean;
  primary: string;                 // face colour of the front
  fg: string;                      // text colour on the primary colour: white or near-black
  accent: string;                  // accent, adjusted so it reads on the primary colour
  fgA(alpha: number): string;      // fg at `alpha`, brightened where needed so it still has 4.5:1 on the primary colour (not for the default theme)
  status(color: string): string;   // a status colour (expiry red / amber / green) made readable on the primary colour
  // back face
  tint: string;                    // face colour of the back: a very light tint of the primary colour
  tintLine: string;                // hairlines on the back
  ink: string;                     // headline text on the back (company name)
  inkA(alpha: number): string;     // body text on the back at `alpha`, readable on the tint
  banner: string;                  // the "IF FOUND, RETURN" banner colour
  bannerText: string;
  logoInitial: string;             // letter colour on the white logo plate when there is no logo
}

const AMBER = "#F2A93B";
const DEFAULT_TINT = "#E7EDF6";
const DEFAULT_TINT_LINE = "#C7D4E6";
const BODY_INK = "#1C1A14";

// What is saved: any non-hex value means "use the default".
export function normalizeTheme(t?: MaybeTheme | null): IdCardTheme {
  return {
    primary: t && isHex(t.primary) ? normalizeHex(t.primary) : DEFAULT_THEME.primary,
    accent: t && isHex(t.accent) ? normalizeHex(t.accent) : DEFAULT_THEME.accent,
  };
}
export const isDefaultTheme = (t?: MaybeTheme | null) => {
  const n = normalizeTheme(t);
  return n.primary === DEFAULT_THEME.primary && n.accent === DEFAULT_THEME.accent;
};

export function resolvePalette(theme?: MaybeTheme | null): CardPalette {
  const t = normalizeTheme(theme);
  const isDefault = isDefaultTheme(t);
  const primary = t.primary;
  const fg = readableOn(primary);
  const accent = isDefault ? t.accent : ensureContrast(t.accent, primary);
  const min = isDefault ? 0 : MIN_CONTRAST;
  // `fg` at `alpha` over `bg`: raise alpha until the blended colour has the minimum contrast
  const fadeOn = (text: string, bg: string, alpha: number): string => {
    let a = alpha;
    while (a < 1 && contrast(mix(bg, text, a), bg) < min) a = Math.min(1, a + 0.05);
    return rgba(text, Math.round(a * 100) / 100);
  };

  const tint = isDefault ? DEFAULT_TINT : mix(primary, "#FFFFFF", 0.9);
  const tintLine = isDefault ? DEFAULT_TINT_LINE : mix(primary, "#FFFFFF", 0.78);
  const ink = ensureContrast(primary, tint);
  const banner = t.accent.toUpperCase() === DEFAULT_THEME.accent ? AMBER : accent;
  return {
    isDefault, primary, fg, accent,
    fgA: (alpha) => fadeOn(fg, primary, alpha),
    status: (color) => {
      if (!isHex(color)) return isDefault ? color : fadeOn(fg, primary, 0.6);
      return isDefault ? color : ensureContrast(color, primary);
    },
    tint, tintLine, ink,
    inkA: (alpha) => fadeOn(BODY_INK, tint, alpha),
    banner, bannerText: isDefault ? primary : readableOn(banner),
    logoInitial: ensureContrast(primary, "#FFFFFF"),
  };
}

// For the verify page header: company colours, with the text colour chosen automatically.
export function headerColors(theme?: MaybeTheme | null) {
  const p = resolvePalette(theme);
  return { bg: p.primary, fg: p.fg, accent: p.accent };
}
