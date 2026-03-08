import { evalCalc } from "./calcEngine";
import type { CalcEngineJSON } from "./calcEngine";

export type BOQCalcRun = {
  ok: boolean;
  qty: number;
  outputs: Record<string, number>;
  errors: string[];
  warnings: string[];
};

export function runBoqCalc(engine: any | null, inputs: Record<string, number>): BOQCalcRun | null {
  if (!engine) return null;

  const json = engine as CalcEngineJSON;

  try {
    const res = evalCalc(json, inputs);

    return {
      ok: res.ok,
      qty: res.qty,
      outputs: res.outputs,
      errors: res.errors,
      warnings: res.warnings,
    };
  } catch (e: any) {
    return {
      ok: false,
      qty: 0,
      outputs: {},
      errors: [e?.message ?? String(e)],
      warnings: [],
    };
  }
}
