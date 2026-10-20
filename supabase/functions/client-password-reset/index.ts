// Client-portal password reset. Handles both kinds of portal login:
//   - the client (manager) login, stored on clients (unchanged behaviour);
//   - a contact login, stored on client_contact_portal_access (reset link carries kind=contact).
// The client login is always looked up first, the same order client-portal-login uses.
import { createClient } from "npm:@supabase/supabase-js@2";
import { equalStrings, generateToken, hashPassword, normalizeEmail } from "../_shared/portalPassword.ts";
import { emailButton, renderEmail } from "../_shared/emailLayout.ts";
import { findPortalClientByEmail } from "../_shared/portalClientLookup.ts";

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
  kind?: "manager" | "contact";
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

    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
      return jsonResponse({ error: "Missing Supabase secrets" }, 500);
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const body = (await req.json()) as RequestBody;
    const action = body.action || "request";

    if (action === "request") {
      // normalizeEmail() also keeps the value safe inside the .or() filter below.
      const email = normalizeEmail(body.email);

      if (!email) {
        return jsonResponse({ error: "A valid email is required" }, 400);
      }

      const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") || "";
      if (!RESEND_API_KEY) {
        return jsonResponse({ error: "Missing RESEND_API_KEY secret" }, 500);
      }

      const genericResponse = {
        success: true,
        message: "If an account exists for this email, a reset link has been sent.",
      };

      const token = generateToken();
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

      // Who is resetting: the client login first, else a live contact login with that email.
      let kind: "manager" | "contact" = "manager";
      let companyId: string | null = null;

      // a client with a portal_email is found only by it; the contact email counts only while there is none (_shared/portalClientLookup.ts)
      const client = await findPortalClientByEmail<{ id: string; name: string | null; contact_name: string | null; email: string | null; portal_email: string | null; portal_enabled: boolean | null; company_id: string }>(
        supabaseAdmin, email, "id, name, contact_name, email, portal_email, portal_enabled, company_id");

      if (client) {
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
        companyId = client.company_id;
      } else {
        const { data: access } = await supabaseAdmin
          .from("client_contact_portal_access")
          .select("contact_id, company_id")
          .eq("portal_email", email)
          .eq("enabled", true)
          .is("revoked_at", null)
          .maybeSingle();
        if (!access) {
          return jsonResponse(genericResponse);
        }
        // The contact's client must still have the portal switched on
        const { data: contact } = await supabaseAdmin
          .from("client_contacts")
          .select("client_id")
          .eq("id", access.contact_id)
          .maybeSingle();
        const { data: contactClient } = contact
          ? await supabaseAdmin.from("clients").select("id").eq("id", contact.client_id).eq("portal_enabled", true).maybeSingle()
          : { data: null };
        if (!contactClient) {
          return jsonResponse(genericResponse);
        }

        const { error: updateError } = await supabaseAdmin
          .from("client_contact_portal_access")
          .update({ reset_token: token, reset_expires_at: expiresAt, updated_at: new Date().toISOString() })
          .eq("contact_id", access.contact_id);
        if (updateError) {
          console.error("Failed to store contact reset token:", updateError.message);
          return jsonResponse(genericResponse);
        }
        kind = "contact";
        companyId = access.company_id;
      }

      const { data: company } = await supabaseAdmin
        .from("company_settings")
        .select("company_name, logo_url, tagline, website")
        .eq("company_id", companyId)
        .maybeSingle();

      const companyName = company?.company_name || "Your Company";
      const companyLogo = company?.logo_url || "";
      const companyTagline = company?.tagline || "Secure. Simple. Built for Construction.";
      const companyWebsite = company?.website || APP_URL;

      const resetUrl = `${APP_URL.replace(/\/+$/, "")}/client-reset-password?token=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}${kind === "contact" ? "&kind=contact" : ""}`;

      const html = renderEmail({
        title: `Reset your password - ${companyName}`,
        brand: { logoUrl: companyLogo, companyName, tagline: companyTagline },
        bodyHtml: `
            <h2 style="margin:0 0 16px;font-family:Arial,Helvetica,sans-serif;font-size:20px;color:#111111;">Reset your client portal password</h2>
            <p style="margin:0 0 14px;font-family:Arial,Helvetica,sans-serif;color:#222222;">We received a request to reset the password for your client portal account.</p>
            <p style="margin:0 0 14px;font-family:Arial,Helvetica,sans-serif;color:#222222;">Click the button below to choose a new password. If you didn't request this, you can safely ignore this email — your current password will keep working.</p>
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
        console.error("Resend error sending client reset email:", resendResult);
      }

      return jsonResponse(genericResponse);
    }

    if (action === "confirm") {
      const email = normalizeEmail(body.email);
      const token = String(body.token || "").trim();
      const newPassword = String(body.newPassword || "");

      if (!email || !token) {
        return jsonResponse({ error: "Missing email or token" }, 400);
      }

      if (newPassword.length < 6) {
        return jsonResponse({ error: "Password must be at least 6 characters" }, 400);
      }

      // Contact login reset (link carries kind=contact)
      if (body.kind === "contact") {
        const { data: access } = await supabaseAdmin
          .from("client_contact_portal_access")
          .select("contact_id, reset_token, reset_expires_at")
          .eq("portal_email", email)
          .eq("enabled", true)
          .is("revoked_at", null)
          .maybeSingle();

        if (!access || !access.reset_token || !equalStrings(access.reset_token, token)) {
          return jsonResponse({ error: "Invalid or expired reset link." }, 400);
        }
        if (!access.reset_expires_at || new Date(access.reset_expires_at).getTime() < Date.now()) {
          return jsonResponse({ error: "This reset link has expired. Please request a new one." }, 400);
        }

        const now = new Date().toISOString();
        const { data: updated, error: updateError } = await supabaseAdmin
          .from("client_contact_portal_access")
          .update({ password_hash: await hashPassword(newPassword), activated_at: now,
                    reset_token: null, reset_expires_at: null, updated_at: now })
          .eq("contact_id", access.contact_id)
          .eq("reset_token", access.reset_token) // one use only
          .select("contact_id");
        if (updateError) return jsonResponse({ error: updateError.message }, 500);
        if (!updated?.length) return jsonResponse({ error: "Invalid or expired reset link." }, 400);

        // A new password signs the contact out everywhere else.
        await supabaseAdmin.from("client_portal_sessions").delete().eq("contact_id", access.contact_id);

        return jsonResponse({ success: true, message: "Password updated successfully. You can now sign in." });
      }

      const client = await findPortalClientByEmail<{ id: string; portal_email: string | null; portal_reset_token: string | null; portal_reset_expires_at: string | null }>(
        supabaseAdmin, email, "id, portal_reset_token, portal_reset_expires_at");

      if (!client) {
        return jsonResponse({ error: "Invalid or expired reset link." }, 400);
      }

      if (!client.portal_reset_token || !equalStrings(client.portal_reset_token, token)) {
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
