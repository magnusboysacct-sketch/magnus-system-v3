import { createClient } from "npm:@supabase/supabase-js@2";
import { emailButton, renderEmail } from "../_shared/emailLayout.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const APP_URL = Deno.env.get("APP_URL") || "https://app.magnusboys.com";
const FROM_EMAIL = Deno.env.get("INVITE_FROM_EMAIL") || "onboarding@resend.dev";

type ResetBody = {
  email?: string;
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return jsonResponse({ error: "Method not allowed" }, 405);
    }

    const SUPABASE_URL =
      Deno.env.get("SUPABASE_URL") || Deno.env.get("PROJECT_URL") || "";

    const SERVICE_ROLE_KEY =
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
      Deno.env.get("SERVICE_ROLE_KEY") ||
      "";

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") || "";

    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
      return jsonResponse({ error: "Missing Supabase secrets" }, 500);
    }

    if (!RESEND_API_KEY) {
      return jsonResponse({ error: "Missing RESEND_API_KEY secret" }, 500);
    }

    const body = (await req.json()) as ResetBody;
    const email = String(body.email || "").trim().toLowerCase();

    if (!email || !email.includes("@")) {
      return jsonResponse({ error: "A valid email is required" }, 400);
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: company } = await supabaseAdmin
      .from("user_profiles")
      .select("company_id")
      .ilike("email", email)
      .maybeSingle();

    let companyName = "Magnus System";
    let companyLogo = "";
    let companyTagline = "Secure. Simple. Built for Construction.";
    let companyWebsite = APP_URL;

    if (company?.company_id) {
      const { data: settings } = await supabaseAdmin
        .from("company_settings")
        .select("company_name, logo_url, tagline, website")
        .eq("company_id", company.company_id)
        .maybeSingle();

      if (settings) {
        companyName = settings.company_name || companyName;
        companyLogo = settings.logo_url || "";
        companyTagline = settings.tagline || companyTagline;
        companyWebsite = settings.website || companyWebsite;
      }
    }

    const redirectTo = `${APP_URL.replace(/\/+$/, "")}/reset-password`;

    const { data: linkData, error: linkError } =
      await supabaseAdmin.auth.admin.generateLink({
        type: "recovery",
        email,
        options: {
          redirectTo,
        },
      });

    if (linkError || !linkData) {
      console.error("generateLink error for password reset:", linkError?.message);
      return jsonResponse({
        success: true,
        message: "If an account exists for this email, a reset link has been sent.",
      });
    }

    const tokenHash = linkData.properties?.hashed_token;

    if (!tokenHash) {
      console.error("No hashed_token returned from generateLink (recovery)");
      return jsonResponse({
        success: true,
        message: "If an account exists for this email, a reset link has been sent.",
      });
    }

    const resetUrl = `${redirectTo}?token_hash=${encodeURIComponent(tokenHash)}&type=recovery`;

    const html = renderEmail({
      title: `Reset your password - ${companyName}`,
      brand: { logoUrl: companyLogo, companyName, tagline: companyTagline },
      bodyHtml: `
          <h2 style="margin:0 0 16px;font-family:Arial,Helvetica,sans-serif;font-size:20px;color:#111111;">Reset your password</h2>
          <p style="margin:0 0 14px;font-family:Arial,Helvetica,sans-serif;color:#222222;">We received a request to reset the password for your account on the Magnus construction management platform.</p>
          <p style="margin:0 0 14px;font-family:Arial,Helvetica,sans-serif;color:#222222;">Click the button below to choose a new password. If you didn't request this, you can safely ignore this email.</p>
          ${emailButton(resetUrl, "Reset Password")}
          <p style="margin:0 0 14px;font-family:Arial,Helvetica,sans-serif;color:#222222;font-size:13px;color:#777777;">If the button does not work, copy and paste this link into your browser:</p>
      <p style="margin:0 0 14px;font-family:Arial,Helvetica,sans-serif;font-size:12px;word-break:break-all;color:#777777;">${resetUrl}</p>
          <p style="margin:0 0 14px;font-family:Arial,Helvetica,sans-serif;color:#222222;font-size:12px;color:#999999;margin-top:24px;">This link will expire in 1 hour.</p>`,
      footerLines: [companyName, companyWebsite],
    });

    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `${companyName} <${FROM_EMAIL}>`,
        to: email,
        subject: `Reset your password - ${companyName}`,
        html,
      }),
    });

    if (!resendResponse.ok) {
      const resendResult = await resendResponse.json();
      console.error("Resend error sending password reset email:", resendResult);
    }

    return jsonResponse({
      success: true,
      message: "If an account exists for this email, a reset link has been sent.",
    });
  } catch (err) {
    console.error("Unexpected error in request-password-reset:", err);
    return jsonResponse({
      success: true,
      message: "If an account exists for this email, a reset link has been sent.",
    });
  }
});
