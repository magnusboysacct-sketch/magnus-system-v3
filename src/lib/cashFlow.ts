import { supabase } from "./supabase";

export interface OutstandingReceivable {
  invoice_id: string;
  project_id: string | null;
  client_id: string | null;
  invoice_number: string;
  invoice_date: string;
  due_date: string | null;
  total_amount: number;
  amount_paid: number;
  balance_due: number;
  days_outstanding: number;
  aging_category: string;
}

export interface OutstandingPayable {
  invoice_id: string;
  supplier_id: string | null;
  project_id: string | null;
  invoice_number: string;
  invoice_date: string;
  due_date: string | null;
  total_amount: number;
  amount_paid: number;
  balance_due: number;
  days_until_due: number;
  priority: string;
}

export interface UpcomingPayroll {
  period_id: string | null;
  period_start: string;
  period_end: string;
  pay_date: string;
  status: string;
  estimated_amount: number;
  is_forecast: boolean;
}

export interface CashFlowForecast {
  period_start: string;
  period_end: string;
  period_label: string;
  expected_inflows: number;
  expected_outflows: number;
  net_cash_flow: number;
  receivables_count: number;
  payables_count: number;
  payroll_count: number;
}

export interface CashPositionSummary {
  current_cash_balance: number;
  total_receivables: number;
  total_payables: number;
  upcoming_payroll_30_days: number;
  net_cash_position: number;
  receivables_30_days: number;
  receivables_60_days: number;
  receivables_90_days: number;
  payables_30_days: number;
  payables_60_days: number;
  payables_90_days: number;
}

export async function getOutstandingReceivables(
  companyId: string
): Promise<OutstandingReceivable[]> {
  const { data, error } = await supabase.rpc("get_outstanding_receivables", {
    p_company_id: companyId,
  });

  if (error) throw error;
  return (data || []) as OutstandingReceivable[];
}

export async function getOutstandingPayables(companyId: string): Promise<OutstandingPayable[]> {
  const { data, error } = await supabase.rpc("get_outstanding_payables", {
    p_company_id: companyId,
  });

  if (error) throw error;
  return (data || []) as OutstandingPayable[];
}

export async function getUpcomingPayroll(
  companyId: string,
  weeksAhead: number = 12
): Promise<UpcomingPayroll[]> {
  const { data, error } = await supabase.rpc("get_upcoming_payroll", {
    p_company_id: companyId,
    p_weeks_ahead: weeksAhead,
  });

  if (error) throw error;
  return (data || []) as UpcomingPayroll[];
}

export async function getCashFlowForecast(
  companyId: string,
  startDate?: string,
  endDate?: string,
  interval: "week" | "month" = "week"
): Promise<CashFlowForecast[]> {
  const params: any = {
    p_company_id: companyId,
    p_interval: interval,
  };

  if (startDate) params.p_start_date = startDate;
  if (endDate) params.p_end_date = endDate;

  const { data, error } = await supabase.rpc("get_cash_flow_forecast", params);

  if (error) throw error;
  return (data || []) as CashFlowForecast[];
}

export async function getCashPositionSummary(
  companyId: string
): Promise<CashPositionSummary | null> {
  const { data, error } = await supabase.rpc("get_cash_position_summary", {
    p_company_id: companyId,
  });

  if (error) throw error;
  return data && data.length > 0 ? (data[0] as CashPositionSummary) : null;
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatShortDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export function getDaysFromNow(dateString: string): number {
  const date = new Date(dateString);
  const now = new Date();
  const diffTime = date.getTime() - now.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

export function getPriorityColor(priority: string): string {
  switch (priority.toLowerCase()) {
    case "overdue":
      return "bg-red-100 text-red-800";
    case "high":
      return "bg-orange-100 text-orange-800";
    case "medium":
      return "bg-yellow-100 text-yellow-800";
    case "low":
      return "bg-green-100 text-green-800";
    default:
      return "bg-gray-100 text-gray-800";
  }
}

export function getAgingColor(category: string): string {
  switch (category) {
    case "Not Due":
      return "bg-green-100 text-green-800";
    case "1-30 Days":
      return "bg-yellow-100 text-yellow-800";
    case "31-60 Days":
      return "bg-orange-100 text-orange-800";
    case "61-90 Days":
      return "bg-red-100 text-red-800";
    case "90+ Days":
      return "bg-red-200 text-red-900";
    default:
      return "bg-gray-100 text-gray-800";
  }
}
