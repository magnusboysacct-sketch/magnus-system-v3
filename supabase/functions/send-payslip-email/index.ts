// supabase/functions/send-payslip-email/index.ts
// Called from PayrollPage after a staff payroll run is created. Sends the
// branded payslip to the staff member's email via Resend. Runs server-side
// so the Resend API key never has to be shipped to the browser.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const FROM_EMAIL = Deno.env.get("INVITE_FROM_EMAIL") || "onboarding@resend.dev";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function esc(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function fmtJMD(n: number) {
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n) || 0);
}

function buildPayslipHTML(staff: any, run: any, period: string, company: any) {
  const heartTotal = Number(run.employer_heart_contribution) || 0;
  return `
  <div style="font-family:Calibri,Arial,sans-serif;color:#1a1a1a;max-width:640px;margin:0 auto;padding:32px;background:#fff;">
    <div style="display:flex;align-items:center;gap:16px;border-bottom:3px solid #1E3A5F;padding-bottom:16px;margin-bottom:20px;">
      ${company?.logo_url ? `<img src="${esc(company.logo_url)}" style="width:60px;height:60px;border-radius:8px;object-fit:cover;" />` : ""}
      <div>
        <div style="font-size:20px;font-weight:900;letter-spacing:1px;text-transform:uppercase;color:#1E3A5F;">${esc(company?.company_name || "")}</div>
        <div style="font-size:11px;color:#666;margin-top:2px;">${esc(company?.address_line1 || "")}${company?.parish ? `, ${esc(company.parish)}` : ""}</div>
      </div>
    </div>
    <div style="text-align:center;font-size:15px;font-weight:900;letter-spacing:2px;text-transform:uppercase;color:#1E3A5F;border:2px solid #1E3A5F;padding:8px;margin-bottom:20px;">
      Payslip — ${esc(period)}
    </div>
    <p>Hi ${esc(staff.full_name || "")},</p>
    <p>Your payslip for <strong>${esc(period)}</strong> is ready. Here is a summary — the full payslip is attached below.</p>
    <table style="width:100%;border-collapse:collapse;margin-top:16px;">
      <tr><td style="padding:6px 4px;border-bottom:1px solid #f0f0f0;font-size:13px;">Gross Salary</td><td style="padding:6px 4px;border-bottom:1px solid #f0f0f0;font-size:13px;text-align:right;font-weight:600;">JMD ${fmtJMD(run.gross_pay)}</td></tr>
      <tr><td style="padding:6px 4px;border-bottom:1px solid #f0f0f0;font-size:13px;">NIS (2.75%)</td><td style="padding:6px 4px;border-bottom:1px solid #f0f0f0;font-size:13px;text-align:right;">-JMD ${fmtJMD(run.nis_deduction)}</td></tr>
      <tr><td style="padding:6px 4px;border-bottom:1px solid #f0f0f0;font-size:13px;">NHT (2%)</td><td style="padding:6px 4px;border-bottom:1px solid #f0f0f0;font-size:13px;text-align:right;">-JMD ${fmtJMD(run.nht_deduction)}</td></tr>
      <tr><td style="padding:6px 4px;border-bottom:1px solid #f0f0f0;font-size:13px;">Education Tax (2.25%)</td><td style="padding:6px 4px;border-bottom:1px solid #f0f0f0;font-size:13px;text-align:right;">-JMD ${fmtJMD(run.education_tax_deduction)}</td></tr>
      <tr><td style="padding:6px 4px;border-bottom:1px solid #f0f0f0;font-size:13px;">PAYE Income Tax</td><td style="padding:6px 4px;border-bottom:1px solid #f0f0f0;font-size:13px;text-align:right;">-JMD ${fmtJMD(run.paye_deduction)}</td></tr>
      <tr><td style="padding:12px 4px 0;font-size:17px;font-weight:900;color:#1E3A5F;border-top:2px solid #1E3A5F;">NET PAY</td><td style="padding:12px 4px 0;font-size:17px;font-weight:900;color:#1E3A5F;border-top:2px solid #1E3A5F;text-align:right;">JMD ${fmtJMD(run.net_pay)}</td></tr>
    </table>
    <div style="margin-top:24px;padding-top:16px;border-top:1px solid #eee;font-size:10px;color:#999;">
      <div style="font-size:9px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#999;margin-bottom:6px;">Employer Contributions (company record only)</div>
      NIS Employer (2.5%): JMD ${fmtJMD(run.employer_nis_contribution)} &nbsp;·&nbsp;
      NHT Employer (3%): JMD ${fmtJMD(run.employer_nht_contribution)} &nbsp;·&nbsp;
      Education Tax Employer (3.5%): JMD ${fmtJMD(run.employer_education_tax_contribution)} &nbsp;·&nbsp;
      HEART Trust (3%): JMD ${fmtJMD(heartTotal)}
    </div>
    <p style="margin-top:24px;font-size:11px;color:#999;">${esc(company?.company_name || "")} · Confidential · Generated ${new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</p>
  </div>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return jsonResponse({ error: "Method not allowed" }, 405);
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResponse({ error: "Missing Authorization header" }, 401);
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || Deno.env.get("PROJECT_URL") || "";
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SERVICE_ROLE_KEY") || "";
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") || "";

    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
      return jsonResponse({ error: "Missing Supabase secrets" }, 500);
    }
    if (!RESEND_API_KEY) {
      return jsonResponse({ error: "Missing RESEND_API_KEY secret" }, 500);
    }

    const { runId } = (await req.json()) as { runId?: string };
    if (!runId) {
      return jsonResponse({ error: "runId is required" }, 400);
    }

    const supabaseUser = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: userData, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !userData.user) {
      return jsonResponse({ error: "Unauthorized", details: userError?.message || null }, 401);
    }

    const { data: callerProfile } = await supabaseAdmin
      .from("user_profiles")
      .select("role, company_id")
      .eq("id", userData.user.id)
      .maybeSingle();

    if (!callerProfile || !["director", "admin", "accounts"].includes(callerProfile.role)) {
      return jsonResponse({ error: "Not authorized to send payslips" }, 403);
    }

    const { data: run, error: runError } = await supabaseAdmin
      .from("staff_payroll_runs")
      .select("*")
      .eq("id", runId)
      .eq("company_id", callerProfile.company_id)
      .maybeSingle();

    if (runError || !run) {
      return jsonResponse({ error: "Payroll run not found" }, 404);
    }

    const { data: staff } = await supabaseAdmin
      .from("user_profiles")
      .select("full_name, email, role, trn")
      .eq("id", run.user_id)
      .maybeSingle();

    if (!staff?.email) {
      return jsonResponse({ error: "Staff member has no email on file" }, 400);
    }

    const { data: company } = await supabaseAdmin
      .from("company_settings")
      .select("company_name, logo_url, address_line1, parish, phone")
      .eq("company_id", callerProfile.company_id)
      .maybeSingle();

    const companyName = company?.company_name || "Magnus Boys Construction";
    const period = `${MONTH_NAMES[run.period_month - 1]} ${run.period_year}`;
    const html = buildPayslipHTML(staff, run, period, company);
    const text = `Hi ${staff.full_name || ""},\n\nYour payslip for ${period} is ready.\n\nGross Salary: JMD ${fmtJMD(run.gross_pay)}\nTotal Deductions: JMD ${fmtJMD(run.total_employee_deductions)}\nNet Pay: JMD ${fmtJMD(run.net_pay)}\n\n${companyName}`;

    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: `${companyName} <${FROM_EMAIL}>`,
        to: staff.email,
        subject: `Your Payslip — ${period} — ${companyName}`,
        html,
        text,
      }),
    });

    const resendResult = await resendResponse.json();
    if (!resendResponse.ok) {
      return jsonResponse({ error: "Failed to send payslip email", details: resendResult }, 500);
    }

    await supabaseAdmin
      .from("staff_payroll_runs")
      .update({ email_sent_at: new Date().toISOString() })
      .eq("id", runId);

    return jsonResponse({ success: true, sentTo: staff.email });
  } catch (err) {
    return jsonResponse({ error: "Unexpected server error", details: err instanceof Error ? err.message : String(err) }, 500);
  }
});
