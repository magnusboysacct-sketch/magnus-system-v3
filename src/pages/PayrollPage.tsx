// src/pages/PayrollPage.tsx — Internal-staff payroll (director/admin/accounts).
// Separate from payroll_periods/payroll_entries, which are for field workers
// (worker_id FK's to workers(id)) — see staff_payroll_runs migration notes.
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import {
  PageHeader, Card, Badge, Btn, Input, Select, Field, Empty, Tabs, Alert, cn
} from "../components/ui";
import { Banknote, Printer, Mail, CheckCircle2, AlertTriangle, RefreshCw } from "lucide-react";

type PageTab = "payrun" | "history" | "remittances";

interface StaffMember {
  id: string;
  full_name: string | null;
  email: string | null;
  role: string;
  trn: string | null;
}

interface PayrollRun {
  id: string;
  user_id: string;
  period_month: number;
  period_year: number;
  gross_pay: number;
  nis_deduction: number;
  nht_deduction: number;
  education_tax_deduction: number;
  paye_deduction: number;
  total_employee_deductions: number;
  employer_nis_contribution: number;
  employer_nht_contribution: number;
  employer_education_tax_contribution: number;
  employer_heart_contribution: number;
  total_employer_contributions: number;
  net_pay: number;
  notes: string | null;
  paid_at: string;
  email_sent_at: string | null;
  staff?: { full_name: string | null; email: string | null } | null;
}

interface Remittance {
  id: string;
  period_month: number;
  period_year: number;
  paye_total: number;
  education_tax_employee_total: number;
  education_tax_employer_total: number;
  heart_trust_total: number;
  nht_total: number;
  nis_total: number;
  total_due: number;
  due_date: string;
  status: "pending" | "paid";
  paid_date: string | null;
}

interface CompanyBranding {
  company_name: string | null;
  logo_url: string | null;
  address_line1: string | null;
  parish: string | null;
  phone: string | null;
}

// Fallback used until payroll_tax_settings loads, or if a company has no
// row yet — same values that used to be hardcoded in jamaicanPayroll.ts,
// now editable per-company at /settings/payroll-rates.
const DEFAULT_RATES = {
  nis_employee_rate: 0.0275,
  nht_employee_rate: 0.0200,
  education_tax_employee_rate: 0.0225,
  paye_threshold_annual: 1500096,
  paye_rate_band1: 0.25,
  paye_rate_band2: 0.30,
  paye_band1_ceiling: 6000000,
  nis_employer_rate: 0.0250,
  nht_employer_rate: 0.0300,
  education_tax_employer_rate: 0.0350,
  heart_trust_rate: 0.0300,
  nht_monthly_cap: 125000,
};

type TaxRates = typeof DEFAULT_RATES;

interface PayrollCalcResult {
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
}

// jamaicanPayrollCalculator has these rates hardcoded inside its class
// methods (no way to pass custom rates in), so this replaces the call to
// it entirely rather than trying to parameterize it.
function calculateWithRates(grossPay: number, r: TaxRates): PayrollCalcResult {
  const nisDeduction = Math.round(grossPay * r.nis_employee_rate * 100) / 100;
  const nhtDeduction = Math.round(Math.min(grossPay * r.nht_employee_rate, r.nht_monthly_cap) * 100) / 100;
  const educationTaxDeduction = Math.round(grossPay * r.education_tax_employee_rate * 100) / 100;

  const annualGross = grossPay * 12;
  const taxableAnnual = Math.max(0, annualGross - r.paye_threshold_annual);
  let annualPAYE = 0;
  if (taxableAnnual > 0) {
    const band1Amount = Math.min(taxableAnnual, r.paye_band1_ceiling - r.paye_threshold_annual);
    const band2Amount = Math.max(0, taxableAnnual - (r.paye_band1_ceiling - r.paye_threshold_annual));
    annualPAYE = (band1Amount * r.paye_rate_band1) + (band2Amount * r.paye_rate_band2);
  }
  const payeDeduction = Math.round((annualPAYE / 12) * 100) / 100;

  const totalEmployeeDeductions = nisDeduction + nhtDeduction + educationTaxDeduction + payeDeduction;
  const netPay = grossPay - totalEmployeeDeductions;

  const employerNISContribution = Math.round(grossPay * r.nis_employer_rate * 100) / 100;
  const employerNHTContribution = Math.round(grossPay * r.nht_employer_rate * 100) / 100;
  const employerEducationTaxContribution = Math.round(grossPay * r.education_tax_employer_rate * 100) / 100;
  const employerHeartContribution = Math.round(grossPay * r.heart_trust_rate * 100) / 100;
  const totalEmployerContributions = employerNISContribution + employerNHTContribution + employerEducationTaxContribution + employerHeartContribution;

  return {
    nisDeduction, nhtDeduction, educationTaxDeduction, payeDeduction,
    totalEmployeeDeductions, netPay,
    employerNISContribution, employerNHTContribution, employerEducationTaxContribution, employerHeartContribution,
    totalEmployerContributions,
  };
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function fmtJMD(n: number) {
  return (Number(n) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

// Reconstructs the rate actually applied to a saved run from its own stored
// amounts, rather than showing today's configured rate — payroll_tax_settings
// can change between pay runs, so a fixed label would go stale on old payslips.
function pctOf(amount: number, gross: number) {
  if (!gross) return "0.00";
  return ((amount / gross) * 100).toFixed(2);
}

function generatePayslipHTML(staff: { full_name: string | null; role: string; trn: string | null }, run: Pick<PayrollRun,
  "gross_pay" | "nis_deduction" | "nht_deduction" | "education_tax_deduction" | "paye_deduction" |
  "total_employee_deductions" | "net_pay" | "employer_nis_contribution" | "employer_nht_contribution" |
  "employer_education_tax_contribution" | "employer_heart_contribution">, period: string, company: CompanyBranding | null) {
  return `<!DOCTYPE html><html><head><title>Payslip</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Calibri, Arial, sans-serif; color: #1a1a1a; padding: 40px; background: white; }
    .watermark { position: fixed; top: 50%; left: 50%; transform: translate(-50%,-50%) rotate(-35deg); font-size: 80px; font-weight: 900; color: rgba(30,58,95,0.04); white-space: nowrap; pointer-events: none; z-index: 0; text-transform: uppercase; letter-spacing: 8px; }
    .header { display: flex; align-items: center; gap: 20px; border-bottom: 3px solid #1E3A5F; padding-bottom: 20px; margin-bottom: 24px; }
    .logo { width: 70px; height: 70px; border-radius: 10px; object-fit: cover; }
    .company-name { font-size: 22px; font-weight: 900; letter-spacing: 2px; text-transform: uppercase; color: #1E3A5F; }
    .title { text-align: center; font-size: 16px; font-weight: 900; letter-spacing: 3px; text-transform: uppercase; margin-bottom: 24px; color: #1E3A5F; border: 2px solid #1E3A5F; padding: 10px; }
    .section { margin-bottom: 20px; }
    .section-title { font-size: 10px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; color: #999; margin-bottom: 8px; border-bottom: 1px solid #eee; padding-bottom: 4px; }
    table { width: 100%; border-collapse: collapse; }
    td { padding: 7px 4px; border-bottom: 1px solid #f5f5f5; font-size: 13px; }
    td:last-child { text-align: right; font-weight: 600; }
    .net-row td { font-size: 18px; font-weight: 900; color: #1E3A5F; border-top: 3px solid #1E3A5F; border-bottom: none; padding-top: 12px; }
    .employer-row td { color: #666; font-size: 12px; }
    .sig { margin-top: 60px; display: grid; grid-template-columns: 1fr 1fr; gap: 60px; }
    .sig-line { border-top: 1px solid #1a1a1a; padding-top: 6px; font-size: 11px; color: #666; margin-top: 40px; }
    @media print { @page { size: A4; margin: 15mm; } }
  </style></head><body>
  <div class="watermark">${company?.company_name || "MAGNUS BOYS"}</div>
  <div class="header">
    ${company?.logo_url ? `<img src="${company.logo_url}" class="logo"/>` : ""}
    <div>
      <div class="company-name">${company?.company_name || ""}</div>
      <div style="font-size:11px;color:#666;margin-top:3px">${company?.address_line1 || ""}${company?.parish ? `, ${company.parish}` : ""}</div>
      <div style="font-size:11px;color:#666">${company?.phone || ""}</div>
    </div>
  </div>
  <div class="title">PAYSLIP — ${period}</div>
  <div class="section">
    <div class="section-title">Employee Details</div>
    <table>
      <tr><td>Name</td><td>${staff.full_name || ""}</td></tr>
      <tr><td>Position</td><td>${staff.role || ""}</td></tr>
      <tr><td>TRN</td><td>${staff.trn || "—"}</td></tr>
      <tr><td>Pay Period</td><td>${period}</td></tr>
      <tr><td>Pay Date</td><td>${new Date().toLocaleDateString("en-US",{month:"long",day:"numeric",year:"numeric"})}</td></tr>
    </table>
  </div>
  <div class="section">
    <div class="section-title">Earnings</div>
    <table>
      <tr><td>Gross Salary</td><td>JMD ${fmtJMD(run.gross_pay)}</td></tr>
    </table>
  </div>
  <div class="section">
    <div class="section-title">Employee Deductions</div>
    <table>
      <tr><td>NIS (${pctOf(run.nis_deduction, run.gross_pay)}%)</td><td>JMD ${fmtJMD(run.nis_deduction)}</td></tr>
      <tr><td>NHT (${pctOf(run.nht_deduction, run.gross_pay)}%)</td><td>JMD ${fmtJMD(run.nht_deduction)}</td></tr>
      <tr><td>Education Tax (${pctOf(run.education_tax_deduction, run.gross_pay)}%)</td><td>JMD ${fmtJMD(run.education_tax_deduction)}</td></tr>
      <tr><td>PAYE Income Tax</td><td>JMD ${fmtJMD(run.paye_deduction)}</td></tr>
      <tr><td><strong>Total Deductions</strong></td><td><strong>JMD ${fmtJMD(run.total_employee_deductions)}</strong></td></tr>
    </table>
  </div>
  <div class="section">
    <table>
      <tr class="net-row"><td>NET PAY</td><td>JMD ${fmtJMD(run.net_pay)}</td></tr>
    </table>
  </div>
  <div class="section" style="margin-top:20px">
    <div class="section-title">Employer Contributions (Company Record Only)</div>
    <table>
      <tr class="employer-row"><td>NIS Employer (${pctOf(run.employer_nis_contribution, run.gross_pay)}%)</td><td>JMD ${fmtJMD(run.employer_nis_contribution)}</td></tr>
      <tr class="employer-row"><td>NHT Employer (${pctOf(run.employer_nht_contribution, run.gross_pay)}%)</td><td>JMD ${fmtJMD(run.employer_nht_contribution)}</td></tr>
      <tr class="employer-row"><td>Education Tax Employer (${pctOf(run.employer_education_tax_contribution, run.gross_pay)}%)</td><td>JMD ${fmtJMD(run.employer_education_tax_contribution)}</td></tr>
      <tr class="employer-row"><td>HEART Trust (${pctOf(run.employer_heart_contribution, run.gross_pay)}%)</td><td>JMD ${fmtJMD(run.employer_heart_contribution)}</td></tr>
    </table>
  </div>
  <div class="sig">
    <div><div class="sig-line">Authorised Signature</div></div>
    <div><div class="sig-line">Date</div></div>
  </div>
  <div style="margin-top:30px;text-align:center;font-size:10px;color:#999">${company?.company_name || ""} · CONFIDENTIAL · Generated ${new Date().toLocaleDateString()}</div>
  </body></html>`;
}

function urgencyOf(dueDate: string, status: string): "none" | "soon" | "week" | "overdue" {
  if (status === "paid") return "none";
  const days = Math.ceil((new Date(dueDate).getTime() - Date.now()) / 86400000);
  if (days < 0) return "overdue";
  if (days < 7) return "week";
  if (days <= 14) return "soon";
  return "none";
}

const URGENCY_STYLE: Record<string, { icon: string; label: string; cls: string }> = {
  soon: { icon: "🟡", label: "Remittance due soon", cls: "bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/20 text-amber-800 dark:text-amber-300" },
  week: { icon: "🔴", label: "Pay this week", cls: "bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/20 text-red-800 dark:text-red-300" },
  overdue: { icon: "🚨", label: "OVERDUE — penalties may apply", cls: "bg-red-100 dark:bg-red-500/20 border-red-300 dark:border-red-500/30 text-red-900 dark:text-red-200" },
};

export default function PayrollPage() {
  const [tab, setTab] = useState<PageTab>("payrun");
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [company, setCompany] = useState<CompanyBranding | null>(null);

  const [staffList, setStaffList] = useState<StaffMember[]>([]);
  const now = new Date();
  const [selectedStaffId, setSelectedStaffId] = useState("");
  const [periodMonth, setPeriodMonth] = useState(now.getMonth() + 1);
  const [periodYear, setPeriodYear] = useState(now.getFullYear());
  const [grossSalary, setGrossSalary] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);
  const [paySuccess, setPaySuccess] = useState<string | null>(null);

  const [history, setHistory] = useState<PayrollRun[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [resendingId, setResendingId] = useState<string | null>(null);

  const [remittances, setRemittances] = useState<Remittance[]>([]);
  const [loadingRemittances, setLoadingRemittances] = useState(true);

  const [taxRates, setTaxRates] = useState<TaxRates | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      setUserId(user.id);
      supabase.from("user_profiles").select("company_id").eq("id", user.id).maybeSingle()
        .then(({ data }) => { if (data?.company_id) setCompanyId(data.company_id); });
    });
  }, []);

  useEffect(() => {
    if (!companyId) return;
    loadStaffList();
    loadHistory();
    loadRemittances();
    loadCompany();
    loadTaxRates();
  }, [companyId]);

  async function loadTaxRates() {
    if (!companyId) return;
    const { data, error } = await supabase
      .from("payroll_tax_settings")
      .select("*")
      .eq("company_id", companyId)
      .maybeSingle();
    if (error) { console.error("loadTaxRates error:", error); return; }
    setTaxRates(data ? {
      nis_employee_rate: Number(data.nis_employee_rate),
      nht_employee_rate: Number(data.nht_employee_rate),
      education_tax_employee_rate: Number(data.education_tax_employee_rate),
      paye_threshold_annual: Number(data.paye_threshold_annual),
      paye_rate_band1: Number(data.paye_rate_band1),
      paye_rate_band2: Number(data.paye_rate_band2),
      paye_band1_ceiling: Number(data.paye_band1_ceiling),
      nis_employer_rate: Number(data.nis_employer_rate),
      nht_employer_rate: Number(data.nht_employer_rate),
      education_tax_employer_rate: Number(data.education_tax_employer_rate),
      heart_trust_rate: Number(data.heart_trust_rate),
      nht_monthly_cap: Number(data.nht_monthly_cap),
    } : null);
  }

  async function loadCompany() {
    if (!companyId) return;
    const { data } = await supabase
      .from("company_settings")
      .select("company_name, logo_url, address_line1, parish, phone")
      .eq("company_id", companyId)
      .maybeSingle();
    setCompany(data as CompanyBranding | null);
  }

  async function loadStaffList() {
    if (!companyId) return;
    const { data, error } = await supabase
      .from("user_profiles")
      .select("id, full_name, email, role, trn")
      .eq("company_id", companyId)
      .neq("role", "viewer")
      .order("full_name");
    if (error) { console.error("loadStaffList error:", error); return; }
    setStaffList((data || []) as StaffMember[]);
  }

  // Plain rows + a separate user_profiles lookup, not an embedded join —
  // an embed here (staff_payroll_runs.user_id -> user_profiles) depends on
  // PostgREST's schema cache having picked up the FK from this migration,
  // which isn't guaranteed right after DDL run by hand (see StaffPortalManagerPage).
  async function loadHistory() {
    if (!companyId) return;
    setLoadingHistory(true);
    const { data, error } = await supabase
      .from("staff_payroll_runs")
      .select("*")
      .eq("company_id", companyId)
      .order("period_year", { ascending: false })
      .order("period_month", { ascending: false })
      .order("paid_at", { ascending: false });
    if (error) {
      console.error("loadHistory error:", error);
      setLoadingHistory(false);
      return;
    }
    const rows = (data || []) as PayrollRun[];
    const staffIds = Array.from(new Set(rows.map(r => r.user_id)));
    const names: Record<string, { full_name: string | null; email: string | null }> = {};
    if (staffIds.length > 0) {
      const { data: profiles } = await supabase.from("user_profiles").select("id, full_name, email").in("id", staffIds);
      (profiles || []).forEach((p: any) => { names[p.id] = { full_name: p.full_name, email: p.email }; });
    }
    setHistory(rows.map(r => ({ ...r, staff: names[r.user_id] ?? null })));
    setLoadingHistory(false);
  }

  async function loadRemittances() {
    if (!companyId) return;
    setLoadingRemittances(true);
    const { data, error } = await supabase
      .from("government_remittances")
      .select("*")
      .eq("company_id", companyId)
      .order("period_year", { ascending: false })
      .order("period_month", { ascending: false });
    if (error) { console.error("loadRemittances error:", error); setLoadingRemittances(false); return; }
    setRemittances((data || []) as Remittance[]);
    setLoadingRemittances(false);
  }

  const grossNum = parseFloat(grossSalary) || 0;
  const selectedStaff = staffList.find(s => s.id === selectedStaffId) || null;
  const periodLabel = `${MONTH_NAMES[periodMonth - 1]} ${periodYear}`;

  const effectiveRates = taxRates || DEFAULT_RATES;

  const calcResult: PayrollCalcResult | null = useMemo(() => {
    if (!selectedStaffId || grossNum <= 0) return null;
    return calculateWithRates(grossNum, effectiveRates);
  }, [selectedStaffId, grossNum, effectiveRates]);

  async function updateRemittances(cid: string, month: number, year: number) {
    const { data: runs, error } = await supabase
      .from("staff_payroll_runs")
      .select("paye_deduction, education_tax_deduction, employer_education_tax_contribution, employer_heart_contribution, nht_deduction, employer_nht_contribution, nis_deduction, employer_nis_contribution")
      .eq("company_id", cid)
      .eq("period_month", month)
      .eq("period_year", year);
    if (error) { console.error("updateRemittances fetch error:", error); return; }

    const sum = (key: string) => (runs || []).reduce((s: number, r: any) => s + (Number(r[key]) || 0), 0);
    const payeTotal = sum("paye_deduction");
    const eduEmployee = sum("education_tax_deduction");
    const eduEmployer = sum("employer_education_tax_contribution");
    const heartTotal = sum("employer_heart_contribution");
    const nhtTotal = sum("nht_deduction") + sum("employer_nht_contribution");
    const nisTotal = sum("nis_deduction") + sum("employer_nis_contribution");
    const totalDue = payeTotal + eduEmployee + eduEmployer + heartTotal + nhtTotal + nisTotal;
    // period_month is 1-indexed (Jan=1); JS Date's monthIndex is 0-indexed,
    // so passing it straight through lands one calendar month ahead — the
    // 14th-of-the-following-month TAJ remittance deadline.
    const dueDate = new Date(year, month, 14).toISOString().slice(0, 10);

    const { data: existing } = await supabase
      .from("government_remittances")
      .select("id")
      .eq("company_id", cid).eq("period_month", month).eq("period_year", year)
      .maybeSingle();

    const payload = {
      company_id: cid,
      period_month: month,
      period_year: year,
      paye_total: payeTotal,
      education_tax_employee_total: eduEmployee,
      education_tax_employer_total: eduEmployer,
      heart_trust_total: heartTotal,
      nht_total: nhtTotal,
      nis_total: nisTotal,
      total_due: totalDue,
      due_date: dueDate,
      updated_at: new Date().toISOString(),
    };

    if (existing) {
      await supabase.from("government_remittances").update(payload).eq("id", existing.id);
    } else {
      await supabase.from("government_remittances").insert({ ...payload, status: "pending" });
    }
  }

  async function handlePay() {
    setPayError(null);
    setPaySuccess(null);
    if (!companyId || !userId || !selectedStaff || !calcResult || grossNum <= 0) return;
    setSaving(true);
    try {
      const payload = {
        company_id: companyId,
        user_id: selectedStaff.id,
        period_month: periodMonth,
        period_year: periodYear,
        gross_pay: grossNum,
        nis_deduction: calcResult.nisDeduction,
        nht_deduction: calcResult.nhtDeduction,
        education_tax_deduction: calcResult.educationTaxDeduction,
        paye_deduction: calcResult.payeDeduction,
        total_employee_deductions: calcResult.totalEmployeeDeductions,
        employer_nis_contribution: calcResult.employerNISContribution,
        employer_nht_contribution: calcResult.employerNHTContribution,
        employer_education_tax_contribution: calcResult.employerEducationTaxContribution,
        employer_heart_contribution: calcResult.employerHeartContribution,
        total_employer_contributions: calcResult.totalEmployerContributions,
        net_pay: calcResult.netPay,
        notes: notes.trim() || null,
        paid_by: userId,
      };

      const { data: run, error } = await supabase.from("staff_payroll_runs").insert(payload).select().single();
      if (error) {
        console.error("Error creating payroll run:", error);
        const dupe = (error as any).code === "23505";
        setPayError(dupe
          ? `${selectedStaff.full_name || "This staff member"} has already been paid for ${periodLabel}.`
          : `Failed to save payroll run: ${error.message}`);
        return;
      }

      let emailNote = "email not sent";
      try {
        const { error: emailError } = await supabase.functions.invoke("send-payslip-email", { body: { runId: run.id } });
        emailNote = emailError ? `email failed: ${emailError.message}` : `payslip emailed to ${selectedStaff.email || "—"}`;
        if (emailError) console.error("Payslip email failed:", emailError);
      } catch (e: any) {
        console.error("Payslip email exception:", e);
        emailNote = "email failed: " + e.message;
      }

      await updateRemittances(companyId, periodMonth, periodYear);

      setPaySuccess(`Paid ${selectedStaff.full_name || selectedStaff.email} — JMD ${calcResult.netPay.toLocaleString()} net (${emailNote}).`);
      setSelectedStaffId("");
      setGrossSalary("");
      setNotes("");
      await loadHistory();
      await loadRemittances();
    } catch (e: any) {
      console.error("Exception running payroll:", e);
      setPayError("Unexpected error: " + e.message);
    } finally {
      setSaving(false);
    }
  }

  function printPayslip(run: PayrollRun) {
    const staffMeta = staffList.find(s => s.id === run.user_id);
    const staffForPrint = {
      full_name: run.staff?.full_name || staffMeta?.full_name || "",
      role: staffMeta?.role || "",
      trn: staffMeta?.trn || null,
    };
    const period = `${MONTH_NAMES[run.period_month - 1]} ${run.period_year}`;
    const html = generatePayslipHTML(staffForPrint, run, period, company);
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(html);
    w.document.close();
    setTimeout(() => w.print(), 600);
  }

  async function resendEmail(run: PayrollRun) {
    setResendingId(run.id);
    try {
      const { error } = await supabase.functions.invoke("send-payslip-email", { body: { runId: run.id } });
      if (error) { alert("Failed to resend: " + error.message); return; }
      await loadHistory();
    } catch (e: any) {
      alert("Error: " + e.message);
    } finally {
      setResendingId(null);
    }
  }

  async function markRemittancePaid(r: Remittance) {
    if (!confirm(`Mark ${MONTH_NAMES[r.period_month - 1]} ${r.period_year} remittance as paid?`)) return;
    const { error } = await supabase
      .from("government_remittances")
      .update({ status: "paid", paid_date: new Date().toISOString().slice(0, 10) })
      .eq("id", r.id);
    if (error) { alert("Failed: " + error.message); return; }
    await loadRemittances();
  }

  function printRemittanceSummary(r: Remittance) {
    const period = `${MONTH_NAMES[r.period_month - 1]} ${r.period_year}`;
    const html = `<!DOCTYPE html><html><head><title>Remittance Summary — ${period}</title>
    <style>
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { font-family: Calibri, Arial, sans-serif; color: #1a1a1a; padding: 40px; }
      h1 { font-size: 18px; text-transform: uppercase; letter-spacing: 2px; color: #1E3A5F; border-bottom: 3px solid #1E3A5F; padding-bottom: 12px; margin-bottom: 20px; }
      table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
      td { padding: 7px 4px; border-bottom: 1px solid #f0f0f0; font-size: 13px; }
      td:last-child { text-align: right; font-weight: 600; }
      .total td { font-size: 16px; font-weight: 900; color: #1E3A5F; border-top: 2px solid #1E3A5F; border-bottom: none; padding-top: 10px; }
      @media print { @page { size: A4; margin: 15mm; } }
    </style></head><body>
    <h1>${company?.company_name || ""} — Government Remittance — ${period}</h1>
    <p style="font-size:12px;color:#666;margin-bottom:16px;">Due: ${fmtDate(r.due_date)}</p>
    <table>
      <tr><td>TAJ — PAYE</td><td>JMD ${fmtJMD(r.paye_total)}</td></tr>
      <tr><td>TAJ — Education Tax (employee)</td><td>JMD ${fmtJMD(r.education_tax_employee_total)}</td></tr>
      <tr><td>TAJ — Education Tax (employer)</td><td>JMD ${fmtJMD(r.education_tax_employer_total)}</td></tr>
      <tr><td>TAJ — HEART Trust</td><td>JMD ${fmtJMD(r.heart_trust_total)}</td></tr>
      <tr><td>NHT</td><td>JMD ${fmtJMD(r.nht_total)}</td></tr>
      <tr><td>NIS</td><td>JMD ${fmtJMD(r.nis_total)}</td></tr>
      <tr class="total"><td>TOTAL TO REMIT</td><td>JMD ${fmtJMD(r.total_due)}</td></tr>
    </table>
    <p style="font-size:11px;color:#999;">Status: ${r.status === "paid" ? `Paid ${r.paid_date ? fmtDate(r.paid_date) : ""}` : "Pending"}</p>
    </body></html>`;
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(html);
    w.document.close();
    setTimeout(() => w.print(), 600);
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#080b10]">
      <PageHeader title="Payroll" subtitle="Internal staff pay runs, payslips, and government remittances" />

      <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-4">
        <Tabs
          tabs={[
            { key: "payrun", label: "Pay Run" },
            { key: "history", label: "History", count: history.length },
            { key: "remittances", label: "Remittances", count: remittances.filter(r => r.status === "pending").length || undefined },
          ]}
          active={tab}
          onChange={setTab}
        />

        {tab === "payrun" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <div className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-4">Pay Run</div>
              <div className="space-y-4">
                <Field label="Staff Member">
                  <Select value={selectedStaffId} onChange={e => setSelectedStaffId(e.target.value)}>
                    <option value="">Select staff member...</option>
                    {staffList.map(s => (
                      <option key={s.id} value={s.id}>{s.full_name || s.email || s.id} — {s.role}</option>
                    ))}
                  </Select>
                </Field>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Month">
                    <Select value={periodMonth} onChange={e => setPeriodMonth(Number(e.target.value))}>
                      {MONTH_NAMES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                    </Select>
                  </Field>
                  <Field label="Year">
                    <Input type="number" value={periodYear} onChange={e => setPeriodYear(Number(e.target.value) || now.getFullYear())} />
                  </Field>
                </div>
                <Field label="Gross Salary (JMD)">
                  <Input type="number" min="0" step="0.01" value={grossSalary} onChange={e => setGrossSalary(e.target.value)} placeholder="150000" />
                </Field>
                <Field label="Notes (optional)">
                  <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g. Includes housing allowance" />
                </Field>

                {payError && <Alert type="error">{payError}</Alert>}
                {paySuccess && <Alert type="success">{paySuccess}</Alert>}

                <Btn
                  variant="primary"
                  size="lg"
                  className="w-full justify-center"
                  disabled={!selectedStaff || !calcResult || saving}
                  onClick={handlePay}
                >
                  {saving ? "Processing..." : `Pay ${selectedStaff?.full_name || "Staff Member"}`}
                </Btn>
              </div>
            </Card>

            <Card>
              <div className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-4">Breakdown — {periodLabel}</div>
              {!calcResult ? (
                <div className="text-sm text-slate-400 dark:text-slate-600 text-center py-12">
                  Select a staff member and enter a gross salary to see the calculation
                </div>
              ) : (
                <div className="space-y-4 text-sm">
                  <div className="flex justify-between font-semibold text-slate-800 dark:text-slate-200">
                    <span>Gross Salary</span>
                    <span>JMD {fmtJMD(grossNum)}</span>
                  </div>
                  <div className="border-t border-slate-200 dark:border-slate-800 pt-3">
                    <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-600 mb-2">Employee Deductions</div>
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-slate-600 dark:text-slate-400"><span>NIS ({(effectiveRates.nis_employee_rate * 100).toFixed(2)}%)</span><span>-JMD {fmtJMD(calcResult.nisDeduction)}</span></div>
                      <div className="flex justify-between text-slate-600 dark:text-slate-400"><span>NHT ({(effectiveRates.nht_employee_rate * 100).toFixed(2)}%)</span><span>-JMD {fmtJMD(calcResult.nhtDeduction)}</span></div>
                      <div className="flex justify-between text-slate-600 dark:text-slate-400"><span>Education Tax ({(effectiveRates.education_tax_employee_rate * 100).toFixed(2)}%)</span><span>-JMD {fmtJMD(calcResult.educationTaxDeduction)}</span></div>
                      <div className="flex justify-between text-slate-600 dark:text-slate-400"><span>PAYE Income Tax</span><span>-JMD {fmtJMD(calcResult.payeDeduction)}</span></div>
                    </div>
                    <div className="flex justify-between font-semibold text-slate-700 dark:text-slate-300 border-t border-slate-200 dark:border-slate-800 mt-2 pt-2">
                      <span>Total Deductions</span><span className="text-red-500">-JMD {fmtJMD(calcResult.totalEmployeeDeductions)}</span>
                    </div>
                  </div>

                  <div className="flex justify-between items-center p-4 rounded-xl bg-green-50 dark:bg-green-500/10 border border-green-200 dark:border-green-500/20">
                    <span className="font-semibold text-slate-800 dark:text-slate-200">NET PAY</span>
                    <span className="text-2xl font-bold text-green-600 dark:text-green-400">JMD {fmtJMD(calcResult.netPay)}</span>
                  </div>

                  <div className="border-t border-slate-200 dark:border-slate-800 pt-3">
                    <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-600 mb-2">Employer Contributions (company pays extra)</div>
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-slate-500 dark:text-slate-500"><span>NIS ({(effectiveRates.nis_employer_rate * 100).toFixed(2)}%)</span><span>JMD {fmtJMD(calcResult.employerNISContribution)}</span></div>
                      <div className="flex justify-between text-slate-500 dark:text-slate-500"><span>NHT ({(effectiveRates.nht_employer_rate * 100).toFixed(2)}%)</span><span>JMD {fmtJMD(calcResult.employerNHTContribution)}</span></div>
                      <div className="flex justify-between text-slate-500 dark:text-slate-500"><span>Education Tax ({(effectiveRates.education_tax_employer_rate * 100).toFixed(2)}%)</span><span>JMD {fmtJMD(calcResult.employerEducationTaxContribution)}</span></div>
                      <div className="flex justify-between text-slate-500 dark:text-slate-500"><span>HEART Trust ({(effectiveRates.heart_trust_rate * 100).toFixed(2)}%)</span><span>JMD {fmtJMD(calcResult.employerHeartContribution)}</span></div>
                    </div>
                    <div className="flex justify-between font-semibold text-slate-700 dark:text-slate-300 border-t border-slate-200 dark:border-slate-800 mt-2 pt-2">
                      <span>Total Employer Cost</span><span>JMD {fmtJMD(grossNum + calcResult.totalEmployerContributions)}</span>
                    </div>
                  </div>
                </div>
              )}
            </Card>
          </div>
        )}

        {tab === "history" && (
          loadingHistory ? (
            <div className="text-sm text-slate-500 dark:text-slate-600 py-8 text-center">Loading…</div>
          ) : history.length === 0 ? (
            <Empty icon={<Banknote size={22} />} title="No payroll runs yet" body="Pay a staff member from the Pay Run tab to see it here." />
          ) : (
            <div className="space-y-3">
              {history.map(run => (
                <Card key={run.id}>
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div>
                      <div className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                        {run.staff?.full_name || run.staff?.email || "Unknown"} — {MONTH_NAMES[run.period_month - 1]} {run.period_year}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-600 mt-1">
                        Gross: JMD {fmtJMD(run.gross_pay)} &nbsp;|&nbsp; Net: JMD {fmtJMD(run.net_pay)}
                        {run.notes && <> &nbsp;|&nbsp; {run.notes}</>}
                      </div>
                      <div className="flex items-center gap-2 mt-2">
                        <Badge color="green"><CheckCircle2 size={10} className="mr-0.5" />Paid</Badge>
                        {run.email_sent_at
                          ? <Badge color="blue">Emailed</Badge>
                          : <Badge color="amber">Not emailed</Badge>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Btn variant="secondary" size="sm" icon={<Printer size={13} />} onClick={() => printPayslip(run)}>Print Payslip</Btn>
                      <Btn variant="secondary" size="sm" icon={<Mail size={13} />} disabled={resendingId === run.id} onClick={() => resendEmail(run)}>
                        {resendingId === run.id ? "Sending..." : "Resend Email"}
                      </Btn>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )
        )}

        {tab === "remittances" && (
          loadingRemittances ? (
            <div className="text-sm text-slate-500 dark:text-slate-600 py-8 text-center">Loading…</div>
          ) : remittances.length === 0 ? (
            <Empty icon={<AlertTriangle size={22} />} title="No remittances yet" body="These are calculated automatically the first time you run payroll for a month." />
          ) : (
            <div className="space-y-4">
              {remittances.map(r => {
                const urgency = urgencyOf(r.due_date, r.status);
                const style = URGENCY_STYLE[urgency];
                return (
                  <Card key={r.id}>
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <div className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                          {MONTH_NAMES[r.period_month - 1].toUpperCase()} {r.period_year}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-600">Due: {fmtDate(r.due_date)}</div>
                      </div>
                      <Badge color={r.status === "paid" ? "green" : "amber"}>{r.status === "paid" ? "Paid" : "Pending"}</Badge>
                    </div>

                    {style && (
                      <div className={cn("flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-semibold mb-3", style.cls)}>
                        <span>{style.icon}</span>
                        <span>{style.label}</span>
                      </div>
                    )}

                    <div className="space-y-1 text-sm">
                      <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-600 mt-1 mb-1">TAJ (Tax Administration Jamaica)</div>
                      <div className="flex justify-between text-slate-600 dark:text-slate-400"><span>PAYE</span><span>JMD {fmtJMD(r.paye_total)}</span></div>
                      <div className="flex justify-between text-slate-600 dark:text-slate-400"><span>Education Tax (employee)</span><span>JMD {fmtJMD(r.education_tax_employee_total)}</span></div>
                      <div className="flex justify-between text-slate-600 dark:text-slate-400"><span>Education Tax (employer)</span><span>JMD {fmtJMD(r.education_tax_employer_total)}</span></div>
                      <div className="flex justify-between text-slate-600 dark:text-slate-400"><span>HEART Trust</span><span>JMD {fmtJMD(r.heart_trust_total)}</span></div>
                      <div className="flex justify-between font-semibold text-slate-700 dark:text-slate-300 border-t border-slate-200 dark:border-slate-800 mt-1 pt-1">
                        <span>Total due TAJ</span>
                        <span>JMD {fmtJMD(r.paye_total + r.education_tax_employee_total + r.education_tax_employer_total + r.heart_trust_total)}</span>
                      </div>
                      <div className="flex justify-between text-slate-600 dark:text-slate-400 mt-2"><span>NHT</span><span>JMD {fmtJMD(r.nht_total)}</span></div>
                      <div className="flex justify-between text-slate-600 dark:text-slate-400"><span>NIS</span><span>JMD {fmtJMD(r.nis_total)}</span></div>
                      <div className="flex justify-between items-center p-3 mt-2 rounded-lg bg-slate-50 dark:bg-slate-950/40 border border-slate-200 dark:border-slate-800">
                        <span className="font-semibold text-slate-800 dark:text-slate-200">TOTAL TO REMIT</span>
                        <span className="text-lg font-bold text-slate-900 dark:text-slate-100">JMD {fmtJMD(r.total_due)}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 mt-4">
                      {r.status !== "paid" && (
                        <Btn variant="success" size="sm" icon={<CheckCircle2 size={13} />} onClick={() => markRemittancePaid(r)}>Mark as Paid</Btn>
                      )}
                      <Btn variant="secondary" size="sm" icon={<Printer size={13} />} onClick={() => printRemittanceSummary(r)}>Print Summary</Btn>
                    </div>
                  </Card>
                );
              })}
            </div>
          )
        )}
      </div>
    </div>
  );
}
