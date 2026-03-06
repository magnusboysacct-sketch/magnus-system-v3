// src/lib/calculatorEngine.ts
// PlanSwift-style lightweight calculator engine
// Supports formulas like:
//  - "L*W" (area)
//  - "L*W*D" (volume)
//  - "COUNT*(L+W)" (perimeter-ish)
//  - "CEIL((L*W)/32)" (sheets from area)
// Variables are user-provided (length/width/depth/count/etc) + safe helpers.

export type CalcVars = Record<string, number>;

export type CalcOptions = {
  wastePercent?: number;   // add waste, e.g. 10 = +10%
  roundTo?: number;        // round decimals, e.g. 2
  clampZero?: boolean;     // if negative results -> 0
};

export type CalcResult = {
  ok: boolean;
  value: number;
  error?: string;
  debug?: {
    normalizedFormula: string;
    usedVars: CalcVars;
    wastePercent: number;
    roundedTo: number | null;
  };
};

const DEFAULT_OPTS: Required<CalcOptions> = {
  wastePercent: 0,
  roundTo: 2,
  clampZero: true,
};

function isFiniteNumber(n: any): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

function toFinite(n: any, fallback = 0): number {
  const x = typeof n === "string" ? Number(n) : n;
  return Number.isFinite(x) ? x : fallback;
}

function roundTo(n: number, places: number): number {
  const p = Math.pow(10, places);
  return Math.round(n * p) / p;
}

/**
 * Default variable builder (safe starting point).
 * You can expand this later to match your Takeoff Group fields.
 */
export function buildDefaultVars(input?: Partial<{
  length: number;
  width: number;
  depth: number;
  height: number;
  count: number;
  area: number;
  volume: number;
}>) {
  const v: CalcVars = {
    L: toFinite(input?.length, 0),
    W: toFinite(input?.width, 0),
    D: toFinite(input?.depth, 0),
    H: toFinite(input?.height, 0),
    COUNT: toFinite(input?.count, 1),
    AREA: toFinite(input?.area, 0),
    VOLUME: toFinite(input?.volume, 0),
  };

  // Convenience aliases:
  v.LENGTH = v.L;
  v.WIDTH = v.W;
  v.DEPTH = v.D;
  v.HEIGHT = v.H;
  v.QTY = v.COUNT;

  return v;
}

/**
 * Normalize a user formula:
 * - Trim
 * - Replace “×” with "*"
 * - Remove dangerous characters
 * - Uppercase variable names
 */
export function normalizeFormula(formula: string) {
  let f = String(formula || "").trim();
  if (!f) return "";

  f = f.replace(/×/g, "*");

  // Allow: letters, numbers, underscore, spaces, operators, parentheses, commas, dots
  // Block: quotes, braces, semicolons, backticks, etc.
  f = f.replace(/[^A-Za-z0-9_+\-*/().,%<>=!&|?:\s]/g, "");

  // Uppercase variables (not function names - we handle both anyway)
  // We'll just uppercase everything alphabetic; safe for our functions too.
  f = f.toUpperCase();

  return f;
}

/**
 * Safe math helpers exposed to formulas.
 * NOTE: We do NOT expose global objects.
 */
function getSafeScope() {
  // IMPORTANT: keep only pure functions
  const scope = {
    // basic
    ABS: (x: number) => Math.abs(x),
    MIN: (...xs: number[]) => Math.min(...xs),
    MAX: (...xs: number[]) => Math.max(...xs),

    // rounding
    ROUND: (x: number, places?: number) =>
      roundTo(x, Number.isFinite(places as any) ? (places as number) : 0),
    CEIL: (x: number) => Math.ceil(x),
    FLOOR: (x: number) => Math.floor(x),

    // powers
    SQRT: (x: number) => Math.sqrt(x),
    POW: (a: number, b: number) => Math.pow(a, b),

    // trig (if ever needed)
    SIN: (x: number) => Math.sin(x),
    COS: (x: number) => Math.cos(x),
    TAN: (x: number) => Math.tan(x),

    // conditions
    IF: (cond: any, a: any, b: any) => (cond ? a : b),

    // clamp
    CLAMP: (x: number, lo: number, hi: number) => Math.min(Math.max(x, lo), hi),
  };

  return scope;
}

/**
 * Extract variable tokens used in a formula.
 * We treat identifiers as [A-Z_][A-Z0-9_]*
 */
export function extractVars(formula: string) {
  const f = normalizeFormula(formula);
  if (!f) return [];

  const tokens = f.match(/\b[A-Z_][A-Z0-9_]*\b/g) || [];
  // Remove known functions so they don't appear as vars
  const fnNames = new Set(Object.keys(getSafeScope()));
  const unique = Array.from(new Set(tokens)).filter((t) => !fnNames.has(t));
  return unique;
}

/**
 * Core compute.
 * - Returns 0 if formula empty
 * - Applies waste + rounding
 */
export function computeQuantity(
  formula: string,
  vars: CalcVars,
  options?: CalcOptions
): CalcResult {
  const opts = { ...DEFAULT_OPTS, ...(options || {}) };
  const f = normalizeFormula(formula);

  if (!f) {
    return {
      ok: true,
      value: 0,
      debug: {
        normalizedFormula: "",
        usedVars: vars || {},
        wastePercent: opts.wastePercent,
        roundedTo: opts.roundTo ?? null,
      },
    };
  }

  const safeScope = getSafeScope();

  // Only allow these operators/structures; we already stripped bad chars.
  // Evaluate using Function with injected scope + vars only.
  // IMPORTANT: This is not “perfect sandboxing” but safe enough for your internal tool
  // because we remove dangerous characters and we don't expose global objects.
  try {
    const v: CalcVars = {};
    for (const [k, val] of Object.entries(vars || {})) {
      v[String(k).toUpperCase()] = toFinite(val, 0);
    }

    // Build argument list
    const fnNames = Object.keys(safeScope);
    const varNames = Object.keys(v);

    const argNames = [...fnNames, ...varNames];
    const argValues = [
      ...fnNames.map((n) => (safeScope as any)[n]),
      ...varNames.map((n) => v[n]),
    ];

    // eslint-disable-next-line no-new-func
    const fn = new Function(...argNames, `return (${f});`);

    let raw = fn(...argValues);
    raw = toFinite(raw, 0);

    // clamp negatives
    if (opts.clampZero && raw < 0) raw = 0;

    // waste
    const waste = toFinite(opts.wastePercent, 0);
    if (waste !== 0) raw = raw * (1 + waste / 100);

    // rounding
    let out = raw;
    const rt = opts.roundTo;
    if (Number.isFinite(rt)) out = roundTo(out, rt);

    return {
      ok: true,
      value: out,
      debug: {
        normalizedFormula: f,
        usedVars: v,
        wastePercent: waste,
        roundedTo: Number.isFinite(rt) ? rt : null,
      },
    };
  } catch (e: any) {
    return {
      ok: false,
      value: 0,
      error: e?.message ? String(e.message) : "Formula error",
      debug: {
        normalizedFormula: f,
        usedVars: vars || {},
        wastePercent: opts.wastePercent,
        roundedTo: opts.roundTo ?? null,
      },
    };
  }
}