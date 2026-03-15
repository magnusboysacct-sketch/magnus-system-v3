import { supabase } from "./supabase";

export interface PayrollPeriod {
  id: string;
  company_id: string;
  period_start: string;
  period_end: string;
  pay_date: string;
  status: "draft" | "processing" | "paid" | "cancelled";
  total_gross: number;
  total_deductions: number;
  total_net: number;
  processed_at?: string | null;
  processed_by?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface PayrollEntry {
  id: string;
  company_id: string;
  payroll_period_id: string;
  worker_id: string;
  regular_hours: number;
  overtime_hours: number;
  regular_pay: number;
  overtime_pay: number;
  gross_pay: number;
  federal_tax: number;
  state_tax: number;
  social_security: number;
  medicare: number;
  health_insurance: number;
  retirement_401k: number;
  other_deductions: number;
  total_deductions: number;
  net_pay: number;
  status: "pending" | "paid" | "cancelled";
  created_at?: string;
  updated_at?: string;
}

export interface WorkerTaxInfo {
  id: string;
  worker_id: string;
  company_id: string;
  filing_status?: "single" | "married" | "head_of_household" | null;
  federal_allowances: number;
  additional_federal_withholding: number;
  state_allowances: number;
  additional_state_withholding: number;
  health_insurance: number;
  retirement_401k_percent: number;
  retirement_401k_fixed: number;
  is_exempt_federal: boolean;
  is_exempt_state: boolean;
  is_exempt_fica: boolean;
  created_at?: string;
  updated_at?: string;
}

export async function fetchPayrollPeriods(companyId: string) {
  const { data, error } = await supabase
    .from("payroll_periods")
    .select("*")
    .eq("company_id", companyId)
    .order("period_end", { ascending: false });

  if (error) throw error;
  return data as PayrollPeriod[];
}

export async function createPayrollPeriod(period: Partial<PayrollPeriod>) {
  const { data, error } = await supabase
    .from("payroll_periods")
    .insert([period])
    .select()
    .single();

  if (error) throw error;
  return data as PayrollPeriod;
}

export async function fetchPayrollEntries(periodId: string) {
  const { data, error } = await supabase
    .from("payroll_entries")
    .select("*, workers(first_name, last_name, pay_rate, pay_type)")
    .eq("payroll_period_id", periodId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data;
}

export async function calculatePayrollForPeriod(
  companyId: string,
  periodStart: string,
  periodEnd: string
) {
  const { data: timeEntries, error: timeError } = await supabase
    .from("time_entries")
    .select("worker_id, regular_hours, overtime_hours, workers(pay_rate, overtime_rate)")
    .eq("company_id", companyId)
    .gte("entry_date", periodStart)
    .lte("entry_date", periodEnd)
    .eq("approved", true);

  if (timeError) throw timeError;

  const workerHours = timeEntries?.reduce((acc: any, entry: any) => {
    const workerId = entry.worker_id;
    if (!acc[workerId]) {
      acc[workerId] = {
        worker_id: workerId,
        regular_hours: 0,
        overtime_hours: 0,
        pay_rate: entry.workers?.pay_rate || 0,
        overtime_rate: entry.workers?.overtime_rate || entry.workers?.pay_rate * 1.5 || 0,
      };
    }
    acc[workerId].regular_hours += Number(entry.regular_hours || 0);
    acc[workerId].overtime_hours += Number(entry.overtime_hours || 0);
    return acc;
  }, {});

  return Object.values(workerHours || {});
}

export function calculatePayrollDeductions(
  grossPay: number,
  taxInfo: Partial<WorkerTaxInfo>,
  filingStatus: string = "single"
) {
  const federalRate = filingStatus === "married" ? 0.12 : 0.15;
  const stateRate = 0.05;
  const socialSecurityRate = 0.062;
  const medicareRate = 0.0145;

  let federalTax = taxInfo.is_exempt_federal ? 0 : grossPay * federalRate;
  federalTax += taxInfo.additional_federal_withholding || 0;

  let stateTax = taxInfo.is_exempt_state ? 0 : grossPay * stateRate;
  stateTax += taxInfo.additional_state_withholding || 0;

  const socialSecurity = taxInfo.is_exempt_fica ? 0 : grossPay * socialSecurityRate;
  const medicare = taxInfo.is_exempt_fica ? 0 : grossPay * medicareRate;

  const healthInsurance = taxInfo.health_insurance || 0;

  let retirement401k = taxInfo.retirement_401k_fixed || 0;
  if (taxInfo.retirement_401k_percent) {
    retirement401k += grossPay * (taxInfo.retirement_401k_percent / 100);
  }

  const totalDeductions =
    federalTax + stateTax + socialSecurity + medicare + healthInsurance + retirement401k;

  return {
    federal_tax: Number(federalTax.toFixed(2)),
    state_tax: Number(stateTax.toFixed(2)),
    social_security: Number(socialSecurity.toFixed(2)),
    medicare: Number(medicare.toFixed(2)),
    health_insurance: Number(healthInsurance.toFixed(2)),
    retirement_401k: Number(retirement401k.toFixed(2)),
    total_deductions: Number(totalDeductions.toFixed(2)),
  };
}

export async function generatePayrollEntries(periodId: string, companyId: string) {
  const { data: period } = await supabase
    .from("payroll_periods")
    .select("*")
    .eq("id", periodId)
    .single();

  if (!period) throw new Error("Payroll period not found");

  const workerHours = await calculatePayrollForPeriod(
    companyId,
    period.period_start,
    period.period_end
  );

  const entries = [];

  for (const wh of workerHours as any[]) {
    const { data: taxInfo } = await supabase
      .from("worker_tax_info")
      .select("*")
      .eq("worker_id", wh.worker_id)
      .maybeSingle();

    const regularPay = wh.regular_hours * wh.pay_rate;
    const overtimePay = wh.overtime_hours * wh.overtime_rate;
    const grossPay = regularPay + overtimePay;

    const deductions = calculatePayrollDeductions(grossPay, taxInfo || {});

    const netPay = grossPay - deductions.total_deductions;

    entries.push({
      company_id: companyId,
      payroll_period_id: periodId,
      worker_id: wh.worker_id,
      regular_hours: wh.regular_hours,
      overtime_hours: wh.overtime_hours,
      regular_pay: regularPay,
      overtime_pay: overtimePay,
      gross_pay: grossPay,
      ...deductions,
      net_pay: netPay,
      status: "pending",
    });
  }

  if (entries.length > 0) {
    const { data, error } = await supabase
      .from("payroll_entries")
      .insert(entries)
      .select();

    if (error) throw error;
    return data;
  }

  return [];
}

export async function processPayroll(periodId: string) {
  const { data: { user } } = await supabase.auth.getUser();

  const { data: entries } = await supabase
    .from("payroll_entries")
    .select("id, gross_pay, total_deductions, net_pay, worker_id, workers(first_name, last_name)")
    .eq("payroll_period_id", periodId);

  const totalGross = entries?.reduce((sum, e) => sum + Number(e.gross_pay), 0) || 0;
  const totalDeductions = entries?.reduce((sum, e) => sum + Number(e.total_deductions), 0) || 0;
  const totalNet = entries?.reduce((sum, e) => sum + Number(e.net_pay), 0) || 0;

  const { data: period, error: periodError } = await supabase
    .from("payroll_periods")
    .select("company_id, pay_date, period_start, period_end")
    .eq("id", periodId)
    .single();

  if (periodError) throw periodError;

  const { data, error } = await supabase
    .from("payroll_periods")
    .update({
      status: "paid",
      total_gross: totalGross,
      total_deductions: totalDeductions,
      total_net: totalNet,
      processed_at: new Date().toISOString(),
      processed_by: user?.id,
    })
    .eq("id", periodId)
    .select()
    .single();

  if (error) throw error;

  await supabase
    .from("payroll_entries")
    .update({ status: "paid" })
    .eq("payroll_period_id", periodId)
    .eq("status", "pending");

  if (entries && entries.length > 0) {
    const cashTransactions = entries.map((entry: any) => {
      const workerName = entry.workers
        ? `${entry.workers.first_name} ${entry.workers.last_name}`
        : "Worker";

      return {
        company_id: period.company_id,
        transaction_date: period.pay_date,
        transaction_type: "expense",
        category: "payroll",
        amount: Number(entry.net_pay),
        description: `Payroll payment to ${workerName} (${period.period_start} to ${period.period_end})`,
        payroll_entry_id: entry.id,
        created_by: user?.id,
      };
    });

    const { error: cashError } = await supabase
      .from("cash_transactions")
      .insert(cashTransactions);

    if (cashError) {
      console.error("Error creating cash transactions from payroll:", cashError);
    }
  }

  return data;
}

export async function fetchWorkerTaxInfo(workerId: string) {
  const { data, error } = await supabase
    .from("worker_tax_info")
    .select("*")
    .eq("worker_id", workerId)
    .maybeSingle();

  if (error) throw error;
  return data as WorkerTaxInfo | null;
}

export async function upsertWorkerTaxInfo(workerId: string, companyId: string, taxInfo: Partial<WorkerTaxInfo>) {
  const { data, error } = await supabase
    .from("worker_tax_info")
    .upsert([
      {
        worker_id: workerId,
        company_id: companyId,
        ...taxInfo,
      },
    ])
    .select()
    .single();

  if (error) throw error;
  return data as WorkerTaxInfo;
}
