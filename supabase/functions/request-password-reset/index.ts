import { createClient } from "npm:@supabase/supabase-js@2";

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

    const html = `
      <div style="font-family:Arial,sans-serif;background:#f6f6f6;padding:30px;">
        <div style="max-width:620px;margin:auto;background:#fff;border-radius:10px;overflow:hidden;border:1px solid #ddd;">
          <div style="background:#111;color:#fff;padding:24px;text-align:center;border-top:5px solid #d4a017;">
            ${
              companyLogo
                ? `<img src="${esc(companyLogo)}" alt="${esc(companyName)}" style="max-height:70px;margin-bottom:12px;">`
                : ""
            }
            <h2 style="margin:0;font-size:24px;">${esc(companyName)}</h2>
            <p style="margin:8px 0 0;font-size:13px;color:#ddd;">${esc(companyTagline)}</p>
          </div>

          <div style="padding:32px;color:#222;">
            <h2 style="margin-top:0;">Reset your password</h2>
            <p>We received a request to reset the password for your account on the Magnus construction management platform.</p>
            <p>Click the button below to choose a new password. If you didn't request this, you can safely ignore this email.</p>

            <div style="text-align:center;margin:32px 0;">
              <a href="${resetUrl}" style="background:#d4a017;color:#fff;padding:14px 28px;text-decoration:none;border-radius:6px;display:inline-block;font-weight:bold;">
                Reset Password
              </a>
            </div>

            <p style="font-size:13px;color:#777;">If the button does not work, copy and paste this link into your browser:</p>
            <p style="font-size:12px;word-break:break-all;color:#777;">${resetUrl}</p>

            <p style="font-size:12px;color:#999;margin-top:24px;">This link will expire in 1 hour.</p>
          </div>

          <div style="background:#f0f0f0;padding:18px;text-align:center;font-size:12px;color:#666;">
            <p style="margin:0;">${esc(companyName)}</p>
            <p style="margin:5px 0;">${esc(companyWebsite)}</p>
          </div>
        </div>
      </div>
    `;

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
