import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const APP_URL = Deno.env.get("APP_URL") || "https://app.magnusboys.com";
const FROM_EMAIL = Deno.env.get("INVITE_FROM_EMAIL") || "onboarding@resend.dev";

type RequestBody = {
  action?: "request" | "confirm";
  email?: string;
  token?: string;
  newPassword?: string;
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

async function hashPassword(p: string): Promise<string> {
  const data = new TextEncoder().encode(p + "magnus_portal_2026");
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
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

    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
      return jsonResponse({ error: "Missing Supabase secrets" }, 500);
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const body = (await req.json()) as RequestBody;
    const action = body.action || "request";

    if (action === "request") {
      const email = String(body.email || "").trim().toLowerCase();

      if (!email || !email.includes("@")) {
        return jsonResponse({ error: "A valid email is required" }, 400);
      }

      const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") || "";
      if (!RESEND_API_KEY) {
        return jsonResponse({ error: "Missing RESEND_API_KEY secret" }, 500);
      }

      const { data: client } = await supabaseAdmin
        .from("clients")
        .select("id, name, contact_name, email, portal_email, portal_enabled, company_id")
        .or(`email.eq.${email},portal_email.eq.${email}`)
        .eq("portal_enabled", true)
        .maybeSingle();

      const genericResponse = {
        success: true,
        message: "If an account exists for this email, a reset link has been sent.",
      };

      if (!client) {
        return jsonResponse(genericResponse);
      }

      const token = generateToken();
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

      const { error: updateError } = await supabaseAdmin
        .from("clients")
        .update({
          portal_reset_token: token,
          portal_reset_expires_at: expiresAt,
        })
        .eq("id", client.id);

      if (updateError) {
        console.error("Failed to store reset token:", updateError.message);
        return jsonResponse(genericResponse);
      }

      const { data: company } = await supabaseAdmin
        .from("company_settings")
        .select("company_name, logo_url, tagline, website")
        .eq("company_id", client.company_id)
        .maybeSingle();

      const companyName = company?.company_name || "Magnus Boys Construction";
      const companyLogo = company?.logo_url || "";
      const companyTagline = company?.tagline || "Secure. Simple. Built for Construction.";
      const companyWebsite = company?.website || APP_URL;

      const resetUrl = `${APP_URL.replace(/\/+$/, "")}/client-reset-password?token=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}`;

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
              <h2 style="margin-top:0;">Reset your client portal password</h2>
              <p>We received a request to reset the password for your client portal account.</p>
              <p>Click the button below to choose a new password. If you didn't request this, you can safely ignore this email — your current password will keep working.</p>

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
        console.error("Resend error sending client reset email:", resendResult);
      }

      return jsonResponse(genericResponse);
    }

    if (action === "confirm") {
      const email = String(body.email || "").trim().toLowerCase();
      const token = String(body.token || "").trim();
      const newPassword = String(body.newPassword || "");

      if (!email || !token) {
        return jsonResponse({ error: "Missing email or token" }, 400);
      }

      if (newPassword.length < 6) {
        return jsonResponse({ error: "Password must be at least 6 characters" }, 400);
      }

      const { data: client, error: lookupError } = await supabaseAdmin
        .from("clients")
        .select("id, portal_reset_token, portal_reset_expires_at")
        .or(`email.eq.${email},portal_email.eq.${email}`)
        .eq("portal_enabled", true)
        .maybeSingle();

      if (lookupError || !client) {
        return jsonResponse({ error: "Invalid or expired reset link." }, 400);
      }

      if (!client.portal_reset_token || client.portal_reset_token !== token) {
        return jsonResponse({ error: "Invalid or expired reset link." }, 400);
      }

      if (
        !client.portal_reset_expires_at ||
        new Date(client.portal_reset_expires_at).getTime() < Date.now()
      ) {
        return jsonResponse({ error: "This reset link has expired. Please request a new one." }, 400);
      }

      const newHash = await hashPassword(newPassword);

      const { error: updateError } = await supabaseAdmin
        .from("clients")
        .update({
          portal_password_hash: newHash,
          portal_activated_at: new Date().toISOString(),
          portal_reset_token: null,
          portal_reset_expires_at: null,
        })
        .eq("id", client.id);

      if (updateError) {
        return jsonResponse({ error: updateError.message }, 500);
      }

      return jsonResponse({
        success: true,
        message: "Password updated successfully. You can now sign in.",
      });
    }

    return jsonResponse({ error: "Unknown action" }, 400);
  } catch (err) {
    console.error("Unexpected error in client-password-reset:", err);
    return jsonResponse({
      error: "Unexpected server error",
      details: err instanceof Error ? err.message : String(err),
    }, 500);
  }
});
