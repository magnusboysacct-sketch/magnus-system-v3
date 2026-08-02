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
  worker_type: string | null;
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
      .select("id, first_name, last_name, email, phone, pay_rate, pay_type, hire_date, status, worker_type")
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

export interface WorkerNotice {
  id: string;
  company_id: string;
  title: string;
  body: string;
  pinned: boolean;
  visible_to: "all" | "internal_staff" | "site_workers";
  expires_at: string | null;
  posted_by: string | null;
  created_at: string;
}

export interface WorkerMessage {
  id: string;
  company_id: string;
  worker_user_id: string;
  sender_type: "worker" | "management";
  sender_id: string;
  body: string;
  read_by_worker: boolean;
  read_by_management: boolean;
  created_at: string;
}

export interface CompanyBranding {
  company_name: string | null;
  logo_url: string | null;
}

export async function fetchCompanyBranding(companyId: string) {
  try {
    const { data, error } = await supabase
      .from("company_settings")
      .select("company_name, logo_url")
      .eq("company_id", companyId)
      .maybeSingle();
    if (error) throw error;
    return { success: true, data: data as CompanyBranding | null, error: null };
  } catch (e) {
    console.error("Exception fetching company branding:", e);
    return { success: false, data: null, error: e };
  }
}

// Notices visible to a worker of the given worker_type (see
// worker_portal_notices.visible_to check constraint). Site-facing roles
// (subcontractor/crew_lead) count as "site_workers"; 'employee' as
// "internal_staff" — the only signal the workers table offers for this split.
export async function fetchNoticesForWorker(companyId: string, workerType: string | null) {
  try {
    const category = workerType === "employee" ? "internal_staff" : "site_workers";
    const { data, error } = await supabase
      .from("worker_portal_notices")
      .select("*")
      .eq("company_id", companyId)
      .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
      .or(`visible_to.eq.all,visible_to.eq.${category}`)
      .order("pinned", { ascending: false })
      .order("created_at", { ascending: false });
    if (error) throw error;
    return { success: true, data: (data || []) as WorkerNotice[], error: null };
  } catch (e) {
    console.error("Exception fetching notices:", e);
    return { success: false, data: [] as WorkerNotice[], error: e };
  }
}

export async function fetchNoticeReadIds(workerId: string) {
  try {
    const { data, error } = await supabase
      .from("worker_portal_notice_reads")
      .select("notice_id")
      .eq("worker_id", workerId);
    if (error) throw error;
    return new Set((data || []).map((r: any) => r.notice_id as string));
  } catch (e) {
    console.error("Exception fetching notice reads:", e);
    return new Set<string>();
  }
}

export async function markNoticeRead(noticeId: string, workerId: string) {
  const { error } = await supabase.from("worker_portal_notice_reads").upsert(
    { notice_id: noticeId, worker_id: workerId, read_at: new Date().toISOString() },
    { onConflict: "notice_id,worker_id" }
  );
  if (error) console.error("Error marking notice read:", error);
  return !error;
}

export async function fetchWorkerMessages(companyId: string, workerUserId: string) {
  try {
    const { data, error } = await supabase
      .from("worker_portal_messages")
      .select("*")
      .eq("company_id", companyId)
      .eq("worker_user_id", workerUserId)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return { success: true, data: (data || []) as WorkerMessage[], error: null };
  } catch (e) {
    console.error("Exception fetching messages:", e);
    return { success: false, data: [] as WorkerMessage[], error: e };
  }
}

export async function markMessagesReadByWorker(workerUserId: string) {
  const { error } = await supabase
    .from("worker_portal_messages")
    .update({ read_by_worker: true })
    .eq("worker_user_id", workerUserId)
    .eq("sender_type", "management")
    .eq("read_by_worker", false);
  if (error) console.error("Error marking messages read:", error);
}

export async function sendWorkerMessage(companyId: string, workerUserId: string, body: string) {
  const { error } = await supabase.from("worker_portal_messages").insert({
    company_id: companyId,
    worker_user_id: workerUserId,
    sender_type: "worker",
    sender_id: workerUserId,
    body: body.trim(),
    read_by_management: false,
    read_by_worker: true,
  });
  if (error) console.error("Error sending message:", error);
  return !error;
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
