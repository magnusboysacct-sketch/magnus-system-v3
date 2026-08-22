// supabase/functions/send-secretary-document-email/index.ts
// Called from CorrespondenceSection.tsx's "Send by Email" action on an
// approved secretary_documents letter. Sends the rendered letter to a
// recipient (the worker, or a third party like a bank/visa office) via
// Resend — same proven pattern as send-payslip-email/index.ts (Resend
// fetch call, RESEND_API_KEY/INVITE_FROM_EMAIL secrets, service-role
// client for privileged reads, user client only to authenticate the
// caller). Runs server-side so the Resend API key never ships to the
// browser.
//
// Caller-role check is ["admin","director"] — NOT send-payslip-email's own
// ["director","admin","accounts"]. "accounts" hasn't been a real
// user_profiles.role value since this session's role-vocabulary fix
// (send-payslip-email itself was never updated and still has the stale
// check — out of scope to touch here, flagged separately).
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const FROM_EMAIL = Deno.env.get("INVITE_FROM_EMAIL") || "onboarding@resend.dev";

const DOC_TYPE_LABEL: Record<string, string> = {
  job_letter: "Job Letter",
  employment_letter: "Employment Letter",
  reference_letter: "Reference Letter",
};

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

function buildLetterEmailHTML(doc: { title: string; content: string | null }, company: any) {
  const paragraphs = (doc.content || "")
    .split("\n\n")
    .map(p => `<p style="margin:0 0 14px;white-space:pre-wrap;">${esc(p)}</p>`)
    .join("");

  return `
  <div style="font-family:Georgia,serif;color:#1a1a1a;max-width:640px;margin:0 auto;padding:32px;background:#fff;">
    <div style="display:flex;align-items:center;gap:16px;border-bottom:3px solid #1E3A5F;padding-bottom:16px;margin-bottom:24px;">
      ${company?.logo_url ? `<img src="${esc(company.logo_url)}" style="width:60px;height:60px;border-radius:8px;object-fit:cover;" />` : ""}
      <div>
        <div style="font-size:18px;font-weight:900;letter-spacing:1px;text-transform:uppercase;color:#1E3A5F;">${esc(company?.company_name || "")}</div>
        <div style="font-size:11px;color:#666;margin-top:2px;">${esc(company?.address_line1 || "")}${company?.parish ? `, ${esc(company.parish)}` : ""}</div>
      </div>
    </div>
    <div style="font-size:14px;line-height:1.7;">
      ${paragraphs}
    </div>
    <p style="margin-top:24px;padding-top:16px;border-top:1px solid #eee;font-size:10px;color:#999;">${esc(company?.company_name || "")} · Sent ${new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</p>
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

    const { documentId, to } = (await req.json()) as { documentId?: string; to?: string };
    if (!documentId) {
      return jsonResponse({ error: "documentId is required" }, 400);
    }
    const recipient = String(to || "").trim();
    if (!recipient || !recipient.includes("@")) {
      return jsonResponse({ error: "A valid recipient email is required" }, 400);
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

    if (!callerProfile || !["director", "admin"].includes(callerProfile.role)) {
      return jsonResponse({ error: "Not authorized to send secretary documents" }, 403);
    }

    // Service-role client bypasses RLS, so company_id and status are
    // enforced manually here — same pattern as send-payslip-email's own
    // company_id check on the payroll run.
    const { data: doc, error: docError } = await supabaseAdmin
      .from("secretary_documents")
      .select("id, title, content, status, document_type, company_id")
      .eq("id", documentId)
      .eq("company_id", callerProfile.company_id)
      .maybeSingle();

    if (docError || !doc) {
      return jsonResponse({ error: "Document not found" }, 404);
    }
    if (doc.status !== "approved") {
      return jsonResponse({ error: `Document is ${doc.status}, must be approved before it can be emailed` }, 409);
    }

    const { data: company } = await supabaseAdmin
      .from("company_settings")
      .select("company_name, logo_url, address_line1, parish, phone")
      .eq("company_id", callerProfile.company_id)
      .maybeSingle();

    const companyName = company?.company_name || "Magnus Boys Construction";
    const typeLabel = DOC_TYPE_LABEL[doc.document_type] || "Letter";
    const html = buildLetterEmailHTML(doc, company);
    const text = `${doc.title}\n\n${doc.content || ""}\n\n${companyName}`;

    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: `${companyName} <${FROM_EMAIL}>`,
        to: recipient,
        // doc.title already starts with the type label in the common case
        // (saveLetter's title-generation pattern: "Job Letter — Marcus
        // Bailey") — prepending typeLabel unconditionally duplicated it.
        // Only prepend when the title doesn't already carry it, so a
        // secretary-edited custom title still gets a useful type prefix.
        subject: `${doc.title.startsWith(typeLabel) ? "" : `${typeLabel} — `}${doc.title} — ${companyName}`,
        html,
        text,
      }),
    });

    const resendResult = await resendResponse.json();
    if (!resendResponse.ok) {
      return jsonResponse({ error: "Failed to send document email", details: resendResult }, 500);
    }

    return jsonResponse({ success: true, sentTo: recipient });
  } catch (err) {
    return jsonResponse({ error: "Unexpected server error", details: err instanceof Error ? err.message : String(err) }, 500);
  }
});
