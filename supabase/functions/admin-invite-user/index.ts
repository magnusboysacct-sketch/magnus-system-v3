import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const APP_URL = Deno.env.get("APP_URL") || "https://app.magnusboys.com";
const FROM_EMAIL = Deno.env.get("INVITE_FROM_EMAIL") || "onboarding@resend.dev";

type InviteBody = {
  email?: string;
  inviteEmail?: string;
  userEmail?: string;
  to?: string;
  role?: string;
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

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResponse({ error: "Missing Authorization header" }, 401);
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

    const body = (await req.json()) as InviteBody;

    const email = String(
      body.email || body.inviteEmail || body.userEmail || body.to || ""
    ).trim().toLowerCase();

    const rawRole = String(body.role || "site_user").trim();
    // Must match user_profiles.role CHECK constraint exactly (live constraint,
    // confirmed via pg_get_constraintdef — see role-vocabulary audit).
    // 'secretary' added after that audit, once the Secretary Workspace
    // migration landed and the role went live — this whitelist was never
    // updated to match at the time, so inviting anyone as Secretary
    // silently fell back to site_user until now.
    const allowedRoles = [
      "director",
      "admin",
      "estimator",
      "supervisor",
      "office_user",
      "site_user",
      "secretary",
    ];
    const role = allowedRoles.includes(rawRole) ? rawRole : "site_user";

    if (!email) {
      return jsonResponse({ error: "Email is required", receivedBody: body }, 400);
    }

    const supabaseUser = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: userData, error: userError } =
      await supabaseUser.auth.getUser();

    if (userError || !userData.user) {
      return jsonResponse({
        error: "Unauthorized",
        details: userError?.message || null,
      }, 401);
    }

    const callerId = userData.user.id;

    const { data: profile, error: profileError } = await supabaseAdmin
      .from("user_profiles")
      .select("id, role, status, company_id")
      .eq("id", callerId)
      .maybeSingle();

    if (profileError || !profile) {
      return jsonResponse({
        error: "Caller profile not found",
        details: profileError?.message || null,
      }, 403);
    }

    if (!["director", "admin"].includes(profile.role)) {
      return jsonResponse({ error: "Only directors and admins can invite staff" }, 403);
    }

    if (profile.status && profile.status !== "active") {
      return jsonResponse({ error: "Your account is not active" }, 403);
    }

    if (!profile.company_id) {
      return jsonResponse({ error: "Director has no company_id" }, 403);
    }

    const { data: existingMember } = await supabaseAdmin
      .from("user_profiles")
      .select("id")
      .eq("company_id", profile.company_id)
      .ilike("email", email)
      .maybeSingle();

    if (existingMember) {
      return jsonResponse({
        error: "This email is already a member of your company",
      }, 409);
    }

    await supabaseAdmin
      .from("company_invitations")
      .update({
        status: "revoked",
        updated_at: new Date().toISOString(),
      })
      .eq("company_id", profile.company_id)
      .ilike("email", email)
      .eq("status", "pending");

    const { data: company } = await supabaseAdmin
      .from("company_settings")
      .select("company_name, logo_url, tagline, website")
      .eq("company_id", profile.company_id)
      .maybeSingle();

    const companyName = company?.company_name || "Magnus System";
    const companyLogo = company?.logo_url || "";
    const companyTagline =
      company?.tagline || "Secure. Simple. Built for Construction.";
    const companyWebsite = company?.website || APP_URL;

    const redirectTo = `${APP_URL.replace(/\/+$/, "")}/accept-invite`;

    const expiresAt = new Date(
      Date.now() + 7 * 24 * 60 * 60 * 1000
    ).toISOString();

    const { data: inviteRow, error: inviteInsertError } = await supabaseAdmin
      .from("company_invitations")
      .insert({
        company_id: profile.company_id,
        email,
        role,
        invited_by: callerId,
        status: "pending",
        expires_at: expiresAt,
      })
      .select("*")
      .single();

    if (inviteInsertError) {
      return jsonResponse({
        error: inviteInsertError.message,
        details: inviteInsertError,
      }, 500);
    }

    const { data: linkData, error: linkError } =
      await supabaseAdmin.auth.admin.generateLink({
        type: "invite",
        email,
        options: {
          redirectTo,
          data: {
            company_id: profile.company_id,
            invited_role: role,
            invited_by: callerId,
            invitation_id: inviteRow.id,
          },
        },
      });

    if (linkError) {
      await supabaseAdmin
        .from("company_invitations")
        .update({
          status: "revoked",
          updated_at: new Date().toISOString(),
        })
        .eq("id", inviteRow.id);

      return jsonResponse({
        error: "Failed to generate invite link",
        details: linkError.message,
      }, 500);
    }

    const tokenHash = linkData.properties?.hashed_token;

    if (!tokenHash) {
      return jsonResponse({ error: "Invite token_hash was not generated" }, 500);
    }

    const inviteUrl = `${redirectTo}?token_hash=${encodeURIComponent(tokenHash)}&type=invite`;

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
            <h2 style="margin-top:0;">You've been invited</h2>
            <p>You've been invited to join <strong>${esc(companyName)}</strong> on the Magnus construction management platform.</p>
            <p>Click the button below to accept your invitation and activate your account.</p>

            <div style="text-align:center;margin:32px 0;">
              <a href="${inviteUrl}" style="background:#d4a017;color:#fff;padding:14px 28px;text-decoration:none;border-radius:6px;display:inline-block;font-weight:bold;">
                Accept Invitation
              </a>
            </div>

            <p style="font-size:13px;color:#777;">If the button does not work, copy and paste this link into your browser:</p>
            <p style="font-size:12px;word-break:break-all;color:#777;">${inviteUrl}</p>
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
        subject: `You're invited to ${companyName}`,
        html,
      }),
    });

    const resendResult = await resendResponse.json();

    if (!resendResponse.ok) {
      await supabaseAdmin
        .from("company_invitations")
        .update({
          status: "revoked",
          updated_at: new Date().toISOString(),
        })
        .eq("id", inviteRow.id);

      return jsonResponse({
        error: "Failed to send branded invite email",
        details: resendResult,
      }, 500);
    }

    return jsonResponse({
      success: true,
      message: "Invitation sent successfully",
      invitation: inviteRow,
      resend: resendResult,
    });
  } catch (err) {
    return jsonResponse({
      error: "Unexpected server error",
      details: err instanceof Error ? err.message : String(err),
    }, 500);
  }
});

