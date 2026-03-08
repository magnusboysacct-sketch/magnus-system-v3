import { Parser } from "expr-eval";

/**
 * PlanSwift-style calculator engine
 * - Supports variables (user inputs), constants (item size), formulas (derived fields)
 * - Resolves dependencies, detects cycles, validates missing vars
 * - Uses expr-eval under the hood
 *
 * Design:
 *  - "vars" are inputs the BOQ user types (Length, Height, Area, etc.)
 *  - "consts" are item constants (SheetWidth=4, SheetHeight=8, blocks_per_m2=12.5)
 *  - "formulas" define derived values (area=Length*Height, qty=ceil(area/(w*h)))
 *
 * Notes:
 *  - Supports PlanSwift-like [Area] references (we normalize to Area)
 *  - Supports common functions: ceil, floor, round, abs, min, max
 */

export type CalcNumber = number;

export type CalcVariableDef = {
  key: string; // variable name used in formulas
  label?: string;
  unit?: string; // display only
  default?: CalcNumber;
  min?: CalcNumber;
  max?: CalcNumber;
  step?: CalcNumber;
};

export type CalcRounding =
  | { mode: "none" }
  | { mode: "round"; decimals?: number } // round to decimals (default 0)
  | { mode: "ceil" }
  | { mode: "floor" };

export type CalcEngineJSON = {
  version: 1;

  // user-entered inputs
  vars: CalcVariableDef[];

  // item constants (size, conversion factors, etc.)
  consts?: Record<string, CalcNumber>;

  // derived fields (dependency graph)
  formulas: Record<string, string>;

  // which field should become BOQ qty (required)
  qty_expr: string;

  // optional rounding applied to qty result
  qty_rounding?: CalcRounding;

  // optional: expose additional calculated outputs (for display/debug)
  outputs?: Record<string, string>;
};

export type CalcEvalResult = {
  ok: boolean;
  qty: number;
  scope: Record<string, number>;
  outputs: Record<string, number>;
  errors: string[];
  warnings: string[];
};

const DEFAULT_ROUNDING: CalcRounding = { mode: "round", decimals: 0 };

// [Area] -> Area
function normalizeExpr(expr: string): string {
  if (!expr) return "";
  return expr.replace(/\[([^\]]+)\]/g, (_m, inner) => String(inner).trim());
}

// Extract identifiers
function extractIdentifiers(parser: Parser, expr: string): Set<string> {
  const out = new Set<string>();
  try {
    const ast = parser.parse(expr);
    const vars = (ast as any).variables?.() as string[] | undefined;
    (vars ?? []).forEach((v) => out.add(v));
  } catch {
    // ignore
  }
  return out;
}

function applyRounding(value: number, rounding?: CalcRounding): number {
  const r = rounding ?? DEFAULT_ROUNDING;
  if (!Number.isFinite(value)) return 0;

  if (r.mode === "none") return value;
  if (r.mode === "ceil") return Math.ceil(value);
  if (r.mode === "floor") return Math.floor(value);

  const decimals = Number.isFinite(r.decimals as any) ? Number(r.decimals) : 0;
  const d = Math.max(0, Math.floor(decimals));
  const factor = Math.pow(10, d);
  return Math.round(value * factor) / factor;
}

function clamp(n: number, min?: number, max?: number) {
  let v = n;
  if (typeof min === "number" && Number.isFinite(min)) v = Math.max(min, v);
  if (typeof max === "number" && Number.isFinite(max)) v = Math.min(max, v);
  return v;
}

type Validation = {
  ok: boolean;
  errors: string[];
  warnings: string[];
  order: string[];
};

function topoSortFormulas(deps: Map<string, Set<string>>): { order: string[]; cycle?: string[] } {
  const inDegree = new Map<string, number>();
  const nodes = Array.from(deps.keys());

  for (const n of nodes) inDegree.set(n, 0);
  for (const [_node, set] of deps.entries()) {
    for (const d of set) {
      if (!deps.has(d)) continue;
      inDegree.set(d, (inDegree.get(d) ?? 0) + 1);
    }
  }

  const queue: string[] = [];
  for (const [n, deg] of inDegree.entries()) {
    if (deg === 0) queue.push(n);
  }

  const order: string[] = [];
  while (queue.length) {
    const n = queue.shift()!;
    order.push(n);

    const outgoing = deps.get(n) ?? new Set<string>();
    for (const d of outgoing) {
      if (!deps.has(d)) continue;
      inDegree.set(d, (inDegree.get(d) ?? 0) - 1);
      if ((inDegree.get(d) ?? 0) === 0) queue.push(d);
    }
  }

  if (order.length !== nodes.length) {
    const remaining = nodes.filter((n) => !order.includes(n));
    return { order, cycle: remaining };
  }

  return { order };
}

export function validateCalc(json: CalcEngineJSON): Validation {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!json || json.version !== 1) errors.push("Calculator JSON must have version: 1.");
  if (!json.vars || !Array.isArray(json.vars)) errors.push("Calculator JSON must include vars[].");
  if (!json.formulas || typeof json.formulas !== "object") errors.push("Calculator JSON must include formulas{}.");
  if (!json.qty_expr || typeof json.qty_expr !== "string") errors.push("Calculator JSON must include qty_expr.");

  const parser = new Parser();
  parser.functions = {
    ...parser.functions,
    ceil: Math.ceil,
    floor: Math.floor,
    round: Math.round,
    abs: Math.abs,
    min: Math.min,
    max: Math.max,
  };

  const varKeys = new Set((json.vars ?? []).map((v) => v.key));
  const constKeys = new Set(Object.keys(json.consts ?? {}));
  const formulaKeys = new Set(Object.keys(json.formulas ?? {}));
  const allKnown = new Set<string>([...varKeys, ...constKeys, ...formulaKeys]);

  const deps = new Map<string, Set<string>>();

  for (const key of formulaKeys) {
    const raw = String(json.formulas[key] ?? "");
    const expr = normalizeExpr(raw);
    if (!expr.trim()) {
      errors.push(`Formula "${key}" is empty.`);
      deps.set(key, new Set());
      continue;
    }

    try {
      parser.parse(expr);
    } catch (e: any) {
      errors.push(`Formula "${key}" parse error: ${e?.message ?? String(e)}`);
    }

    const ids = extractIdentifiers(parser, expr);
    deps.set(key, ids);
    for (const id of ids) {
      if (!allKnown.has(id)) {
        warnings.push(`Formula "${key}" references unknown identifier "${id}". (Defaults to 0 unless provided)`);
      }
    }
  }

  const qtyExpr = normalizeExpr(json.qty_expr ?? "");
  try {
    parser.parse(qtyExpr);
  } catch (e: any) {
    errors.push(`qty_expr parse error: ${e?.message ?? String(e)}`);
  }

  const formulaDepsOnly = new Map<string, Set<string>>();
  for (const [k, set] of deps.entries()) {
    const only = new Set<string>();
    for (const id of set) if (formulaKeys.has(id)) only.add(id);
    formulaDepsOnly.set(k, only);
  }

  const sorted = topoSortFormulas(formulaDepsOnly);
  if (sorted.cycle?.length) {
    errors.push(`Cycle detected in formulas: ${sorted.cycle.join(", ")}`);
  }

  return { ok: errors.length === 0, errors, warnings, order: sorted.order };
}

export function evalCalc(json: CalcEngineJSON, inputs: Record<string, number>): CalcEvalResult {
  const v = validateCalc(json);
  const errors: string[] = [...v.errors];
  const warnings: string[] = [...v.warnings];

  const safeFail = (msg?: string): CalcEvalResult => ({
    ok: false,
    qty: 0,
    scope: {},
    outputs: {},
    errors: msg ? [...errors, msg] : errors,
    warnings,
  });

  if (!v.ok) return safeFail();

  const parser = new Parser();
  parser.functions = {
    ...parser.functions,
    ceil: Math.ceil,
    floor: Math.floor,
    round: Math.round,
    abs: Math.abs,
    min: Math.min,
    max: Math.max,
  };

  const scope: Record<string, number> = {};

  for (const def of json.vars) {
    const base = typeof def.default === "number" && Number.isFinite(def.default) ? def.default : 0;
    scope[def.key] = base;
  }

  for (const [k, val] of Object.entries(json.consts ?? {})) {
    scope[k] = typeof val === "number" && Number.isFinite(val) ? val : 0;
  }

  for (const def of json.vars) {
    if (Object.prototype.hasOwnProperty.call(inputs, def.key)) {
      const n = Number((inputs as any)[def.key]);
      scope[def.key] = clamp(Number.isFinite(n) ? n : 0, def.min, def.max);
    }
  }

  for (const [k, val] of Object.entries(inputs ?? {})) {
    if (Object.prototype.hasOwnProperty.call(scope, k)) continue;
    const n = Number(val);
    scope[k] = Number.isFinite(n) ? n : 0;
  }

  for (const key of v.order) {
    const raw = String(json.formulas[key] ?? "");
    const expr = normalizeExpr(raw);
    try {
      const value = parser.evaluate(expr, scope);
      scope[key] = typeof value === "number" && Number.isFinite(value) ? value : 0;
    } catch (e: any) {
      errors.push(`Eval failed for formula "${key}": ${e?.message ?? String(e)}`);
      scope[key] = 0;
    }
  }

  const qtyExpr = normalizeExpr(json.qty_expr ?? "");
  let qtyVal = 0;

  try {
    const value = parser.evaluate(qtyExpr, scope);
    qtyVal = typeof value === "number" && Number.isFinite(value) ? value : 0;
  } catch (e: any) {
    errors.push(`Eval failed for qty_expr: ${e?.message ?? String(e)}`);
    qtyVal = 0;
  }

  const qty = applyRounding(qtyVal, json.qty_rounding);

  const outputs: Record<string, number> = {};
  for (const [outKey, raw] of Object.entries(json.outputs ?? {})) {
    const expr = normalizeExpr(String(raw ?? ""));
    if (!expr.trim()) continue;
    try {
      const value = parser.evaluate(expr, scope);
      outputs[outKey] = typeof value === "number" && Number.isFinite(value) ? value : 0;
    } catch (e: any) {
      warnings.push(`Output "${outKey}" failed: ${e?.message ?? String(e)}`);
      outputs[outKey] = 0;
    }
  }

  return {
    ok: errors.length === 0,
    qty,
    scope,
    outputs,
    errors,
    warnings,
  };
}
