import { supabase } from "./supabase";

export interface WorkerPayslip {
  id: string;
  payroll_period_id: string;
  period_start: string;
  period_end: string;
  pay_date: string;
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
  created_at: string;
}

export interface WorkerInfo {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  pay_rate: number;
  pay_type: "hourly" | "salary";
  hire_date: string | null;
  status: "active" | "inactive" | "terminated";
}

export async function checkWorkerPortalAccess(): Promise<{
  hasAccess: boolean;
  isWorkerPortalUser: boolean;
  workerId: string | null;
}> {
  try {
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return {
        hasAccess: false,
        isWorkerPortalUser: false,
        workerId: null,
      };
    }

    const { data: profile } = await supabase
      .from("user_profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile || profile.role !== "worker") {
      return {
        hasAccess: false,
        isWorkerPortalUser: false,
        workerId: null,
      };
    }

    const { data: worker } = await supabase
      .from("workers")
      .select("id")
      .eq("email", user.email)
      .eq("status", "active")
      .maybeSingle();

    if (!worker) {
      return {
        hasAccess: false,
        isWorkerPortalUser: true,
        workerId: null,
      };
    }

    return {
      hasAccess: true,
      isWorkerPortalUser: true,
      workerId: worker.id,
    };
  } catch (e) {
    console.error("Exception checking worker portal access:", e);
    return {
      hasAccess: false,
      isWorkerPortalUser: false,
      workerId: null,
    };
  }
}

export async function fetchWorkerInfo(workerId: string) {
  try {
    const { data, error } = await supabase
      .from("workers")
      .select("id, first_name, last_name, email, phone, pay_rate, pay_type, hire_date, status")
      .eq("id", workerId)
      .single();

    if (error) {
      console.error("Error fetching worker info:", error);
      return { success: false, data: null, error };
    }

    return { success: true, data: data as WorkerInfo, error: null };
  } catch (e) {
    console.error("Exception fetching worker info:", e);
    return { success: false, data: null, error: e };
  }
}

export async function fetchWorkerPayslips(workerId: string, limit: number = 12) {
  try {
    const { data, error } = await supabase
      .from("payroll_entries")
      .select(`
        id,
        payroll_period_id,
        regular_hours,
        overtime_hours,
        regular_pay,
        overtime_pay,
        gross_pay,
        federal_tax,
        state_tax,
        social_security,
        medicare,
        health_insurance,
        retirement_401k,
        other_deductions,
        total_deductions,
        net_pay,
        status,
        created_at,
        payroll_periods (
          period_start,
          period_end,
          pay_date
        )
      `)
      .eq("worker_id", workerId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      console.error("Error fetching worker payslips:", error);
      return { success: false, data: [], error };
    }

    const payslips = data.map((entry: any) => ({
      id: entry.id,
      payroll_period_id: entry.payroll_period_id,
      period_start: entry.payroll_periods?.period_start || "",
      period_end: entry.payroll_periods?.period_end || "",
      pay_date: entry.payroll_periods?.pay_date || "",
      regular_hours: entry.regular_hours,
      overtime_hours: entry.overtime_hours,
      regular_pay: entry.regular_pay,
      overtime_pay: entry.overtime_pay,
      gross_pay: entry.gross_pay,
      federal_tax: entry.federal_tax,
      state_tax: entry.state_tax,
      social_security: entry.social_security,
      medicare: entry.medicare,
      health_insurance: entry.health_insurance,
      retirement_401k: entry.retirement_401k,
      other_deductions: entry.other_deductions,
      total_deductions: entry.total_deductions,
      net_pay: entry.net_pay,
      status: entry.status,
      created_at: entry.created_at,
    }));

    return { success: true, data: payslips as WorkerPayslip[], error: null };
  } catch (e) {
    console.error("Exception fetching worker payslips:", e);
    return { success: false, data: [], error: e };
  }
}

export async function fetchWorkerYTDSummary(workerId: string, year?: number) {
  try {
    const currentYear = year || new Date().getFullYear();
    const startDate = `${currentYear}-01-01`;
    const endDate = `${currentYear}-12-31`;

    const { data, error } = await supabase
      .from("payroll_entries")
      .select(`
        gross_pay,
        federal_tax,
        state_tax,
        social_security,
        medicare,
        health_insurance,
        retirement_401k,
        total_deductions,
        net_pay,
        payroll_periods!inner (
          period_start,
          period_end
        )
      `)
      .eq("worker_id", workerId)
      .eq("status", "paid")
      .gte("payroll_periods.period_end", startDate)
      .lte("payroll_periods.period_end", endDate);

    if (error) {
      console.error("Error fetching YTD summary:", error);
      return { success: false, data: null, error };
    }

    const ytdSummary = data.reduce(
      (acc, entry) => ({
        gross_pay: acc.gross_pay + Number(entry.gross_pay),
        federal_tax: acc.federal_tax + Number(entry.federal_tax),
        state_tax: acc.state_tax + Number(entry.state_tax),
        social_security: acc.social_security + Number(entry.social_security),
        medicare: acc.medicare + Number(entry.medicare),
        health_insurance: acc.health_insurance + Number(entry.health_insurance),
        retirement_401k: acc.retirement_401k + Number(entry.retirement_401k),
        total_deductions: acc.total_deductions + Number(entry.total_deductions),
        net_pay: acc.net_pay + Number(entry.net_pay),
      }),
      {
        gross_pay: 0,
        federal_tax: 0,
        state_tax: 0,
        social_security: 0,
        medicare: 0,
        health_insurance: 0,
        retirement_401k: 0,
        total_deductions: 0,
        net_pay: 0,
      }
    );

    return { success: true, data: ytdSummary, error: null };
  } catch (e) {
    console.error("Exception fetching YTD summary:", e);
    return { success: false, data: null, error: e };
  }
}
