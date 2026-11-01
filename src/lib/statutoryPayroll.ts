// src/lib/statutoryPayroll.ts — Jamaican statutory rates from Magnus HQ for a pay date.
// The maths lives in statutoryPayrollCore.ts (no database import, so it can be tested on its own).
import { supabase } from "./supabase";
import type { StatutoryRates } from "./statutoryPayrollCore";

export { calculateMonthly, payDateFor } from "./statutoryPayrollCore";
export type { MonthlyPayroll, StatutoryRates } from "./statutoryPayrollCore";

/** The rates confirmed in Magnus HQ for a pay date, or null (then payroll keeps the company's own rates). */
export async function fetchStatutoryRates(payDate: string): Promise<StatutoryRates | null> {
  const { data, error } = await supabase.rpc("get_statutory_rates", { p_date: payDate });
  if (error || !data) return null;
  const x = data as Record<string, unknown>;
  const num = (k: string) => Number(x[k]);
  return {
    effective_from: String(x.effective_from),
    nis_employee_rate: num("nis_employee_rate"), nis_employer_rate: num("nis_employer_rate"),
    nis_annual_ceiling: x.nis_annual_ceiling == null ? null : num("nis_annual_ceiling"),
    nht_employee_rate: num("nht_employee_rate"), nht_employer_rate: num("nht_employer_rate"),
    edu_employee_rate: num("edu_employee_rate"), edu_employer_rate: num("edu_employer_rate"),
    heart_rate: num("heart_rate"), paye_threshold_annual: num("paye_threshold_annual"),
    paye_rate_band1: num("paye_rate_band1"), paye_rate_band2: num("paye_rate_band2"), paye_band1_ceiling: num("paye_band1_ceiling"),
  };
}
