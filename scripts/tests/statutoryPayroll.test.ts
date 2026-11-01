// scripts/tests/statutoryPayroll.test.ts — Jamaican deductions worked by hand with the 1 April 2026 rates.
import test from "node:test";
import assert from "node:assert/strict";
import { calculateMonthly, payDateFor, type StatutoryRates } from "../../src/lib/statutoryPayroll.ts";

const R2026: StatutoryRates = {
  effective_from: "2026-04-01", nis_employee_rate: 0.03, nis_employer_rate: 0.03, nis_annual_ceiling: 5_000_000,
  nht_employee_rate: 0.02, nht_employer_rate: 0.03, edu_employee_rate: 0.0225, edu_employer_rate: 0.035, heart_rate: 0.03,
  paye_threshold_annual: 1_902_360, paye_rate_band1: 0.25, paye_rate_band2: 0.30, paye_band1_ceiling: 6_000_000,
};

test("J$300,000 a month", () => {
  const p = calculateMonthly(300_000, R2026);
  assert.equal(p.nisDeduction, 9_000);              // 3% of 300,000
  assert.equal(p.nhtDeduction, 6_000);              // 2%
  assert.equal(p.statutoryIncome, 291_000);         // after NIS
  assert.equal(p.educationTaxDeduction, 6_547.5);   // 2.25% of 291,000
  assert.equal(p.payeDeduction, 33_117.5);          // 25% x (3,492,000 - 1,902,360) / 12
  assert.equal(p.netPay, 245_335);
  assert.equal(p.employerNISContribution, 9_000);
  assert.equal(p.employerNHTContribution, 9_000);
  assert.equal(p.employerEducationTaxContribution, 10_185);
  assert.equal(p.employerHeartContribution, 9_000);
});

test("J$600,000 a month: NIS stops at the J$5M ceiling, 30% band applies", () => {
  const p = calculateMonthly(600_000, R2026);
  assert.equal(p.nisDeduction, 12_500);             // 3% of 416,666.67
  assert.equal(p.statutoryIncome, 587_500);
  assert.equal(p.payeDeduction, 111_617.5);         // (25% x 4,097,640 + 30% x 1,050,000) / 12
});

test("below the threshold: no PAYE", () => {
  const p = calculateMonthly(150_000, R2026);       // 145,500 x 12 = 1,746,000 < 1,902,360
  assert.equal(p.payeDeduction, 0);
  assert.equal(p.nisDeduction, 4_500);
});

test("pay date is the last day of the month", () => {
  assert.equal(payDateFor(2, 2026), "2026-02-28");
  assert.equal(payDateFor(12, 2026), "2026-12-31");
  assert.equal(payDateFor(3, 2026), "2026-03-31");
});
