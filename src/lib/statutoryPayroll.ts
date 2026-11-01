// src/lib/statutoryPayroll.ts — Jamaican monthly payroll deductions from the statutory rates set in Magnus HQ.
// Used by the Payroll page once the rates for the pay date are confirmed in HQ. The maths (per month):
//   NIS        = rate x pay, but only on pay up to the NIS ceiling (annual ceiling / 12). Same for the employer.
//   NHT        = rate x pay (no ceiling).
//   Statutory income = pay - employee NIS   (approved pension contributions would also come off; not used here yet)
//   Education Tax = rate x statutory income (employee and employer).
//   PAYE       = yearly: band 1 rate on income between the threshold and the band 1 ceiling, band 2 rate above it; / 12.
//   HEART      = employer rate x pay.

import { supabase } from "./supabase";

export type StatutoryRates = {
  effective_from: string;
  nis_employee_rate: number;
  nis_employer_rate: number;
  nis_annual_ceiling: number | null;
  nht_employee_rate: number;
  nht_employer_rate: number;
  edu_employee_rate: number;
  edu_employer_rate: number;
  heart_rate: number;
  paye_threshold_annual: number;
  paye_rate_band1: number;
  paye_rate_band2: number;
  paye_band1_ceiling: number;
};

export type MonthlyPayroll = {
  nisDeduction: number;
  nhtDeduction: number;
  educationTaxDeduction: number;
  payeDeduction: number;
  totalEmployeeDeductions: number;
  netPay: number;
  employerNISContribution: number;
  employerNHTContribution: number;
  employerEducationTaxContribution: number;
  employerHeartContribution: number;
  totalEmployerContributions: number;
  statutoryIncome: number;
};

const r2 = (n: number) => Math.round(n * 100) / 100;

export function calculateMonthly(grossPay: number, r: StatutoryRates): MonthlyPayroll {
  const gross = Math.max(0, Number(grossPay) || 0);
  const nisBase = r.nis_annual_ceiling == null ? gross : Math.min(gross, Number(r.nis_annual_ceiling) / 12);

  const nisDeduction = r2(nisBase * r.nis_employee_rate);
  const nhtDeduction = r2(gross * r.nht_employee_rate);
  const statutoryIncome = r2(gross - nisDeduction);
  const educationTaxDeduction = r2(statutoryIncome * r.edu_employee_rate);

  const annual = statutoryIncome * 12;
  const band1 = Math.max(0, Math.min(annual, r.paye_band1_ceiling) - r.paye_threshold_annual);
  const band2 = Math.max(0, annual - r.paye_band1_ceiling);
  const payeDeduction = r2((band1 * r.paye_rate_band1 + band2 * r.paye_rate_band2) / 12);

  const totalEmployeeDeductions = r2(nisDeduction + nhtDeduction + educationTaxDeduction + payeDeduction);

  const employerNISContribution = r2(nisBase * r.nis_employer_rate);
  const employerNHTContribution = r2(gross * r.nht_employer_rate);
  const employerEducationTaxContribution = r2(statutoryIncome * r.edu_employer_rate);
  const employerHeartContribution = r2(gross * r.heart_rate);

  return {
    nisDeduction, nhtDeduction, educationTaxDeduction, payeDeduction, totalEmployeeDeductions,
    netPay: r2(gross - totalEmployeeDeductions),
    employerNISContribution, employerNHTContribution, employerEducationTaxContribution, employerHeartContribution,
    totalEmployerContributions: r2(employerNISContribution + employerNHTContribution + employerEducationTaxContribution + employerHeartContribution),
    statutoryIncome,
  };
}

/** The last day of a pay month, as YYYY-MM-DD (month is 1-12). */
export function payDateFor(month: number, year: number): string {
  const d = new Date(Date.UTC(year, month, 0));
  return d.toISOString().slice(0, 10);
}

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
