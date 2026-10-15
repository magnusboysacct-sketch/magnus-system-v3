import { createClient } from "npm:@supabase/supabase-js@2";
import { emailButton, renderEmail } from "../_shared/emailLayout.ts";

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

// Undo the auth user that generateLink({ type: "invite" }) created as a side effect, so a failed invite leaves no
// orphaned unconfirmed account blocking the next attempt for that email (public.user_profiles.id cascades from
// auth.users, so the profile row the new-user trigger made goes with it). Only ever called with the id from THIS
// invocation's own generateLink result. A failure here is logged but never replaces the caller's original error.
async function removeCreatedAuthUser(
  admin: ReturnType<typeof createClient>,
  userId: string | null,
  reason: string,
) {
  if (!userId) return;
  try {
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) {
      console.error("admin-invite-user: cleanup of just-created auth user failed", { userId, reason, message: error.message });
    }
  } catch (cleanupErr) {
    console.error("admin-invite-user: cleanup of just-created auth user threw", {
      userId,
      reason,
      message: cleanupErr instanceof Error ? cleanupErr.message : String(cleanupErr),
    });
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Set only once generateLink has succeeded in THIS call (so the user is one we just created, never a pre-existing
  // account). Anything that fails afterwards, including an exception caught by the outer catch, cleans it up.
  let createdAuthUserId: string | null = null;
  let createdInviteId: string | null = null;
  let supabaseAdminForCleanup: ReturnType<typeof createClient> | null = null;

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
    supabaseAdminForCleanup = supabaseAdmin;

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

    const companyName = company?.company_name || "Your Company";
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

      // The real Supabase Auth error — the response below is user-facing, this is what shows in the
      // Edge Function logs (Dashboard > Edge Functions > admin-invite-user > Logs).
      console.error("admin-invite-user: generateLink failed", {
        email,
        message: linkError.message,
        code: (linkError as { code?: string }).code,
        status: (linkError as { status?: number }).status,
      });

      // Supabase Auth keeps one account per email across the whole project (not per company), so this
      // fires when the address already has a login here or in any other company, including one left
      // behind by an earlier invite that failed after the link was generated.
      const alreadyRegistered =
        (linkError as { code?: string }).code === "email_exists" ||
        /already (been )?registered|already exists/i.test(linkError.message || "");

      if (alreadyRegistered) {
        return jsonResponse({
          error:
            "This email already has an account in the system. Each email can currently only belong to one company - check if this person already has access elsewhere, or use a different email address.",
          details: linkError.message,
        }, 409);
      }

      return jsonResponse({
        error: "Failed to generate invite link",
        details: linkError.message,
      }, 500);
    }

    // generateLink succeeded, so it just created this (unconfirmed) auth user: from here on a failure must undo it.
    // (An email that already had an account never reaches this line — that is the linkError branch above.)
    createdAuthUserId = linkData.user?.id ?? null;
    createdInviteId = inviteRow.id;

    const tokenHash = linkData.properties?.hashed_token;

    if (!tokenHash) {
      await supabaseAdmin
        .from("company_invitations")
        .update({ status: "revoked", updated_at: new Date().toISOString() })
        .eq("id", inviteRow.id);
      await removeCreatedAuthUser(supabaseAdmin, createdAuthUserId, "token_hash missing");
      return jsonResponse({ error: "Invite token_hash was not generated" }, 500);
    }

    const inviteUrl = `${redirectTo}?token_hash=${encodeURIComponent(tokenHash)}&type=invite`;

    const html = renderEmail({
      title: `You're invited to ${companyName}`,
      brand: { logoUrl: companyLogo, companyName, tagline: companyTagline },
      bodyHtml: `
          <h2 style="margin:0 0 16px;font-family:Arial,Helvetica,sans-serif;font-size:20px;color:#111111;">You've been invited</h2>
          <p style="margin:0 0 14px;font-family:Arial,Helvetica,sans-serif;color:#222222;">You've been invited to join <strong>${esc(companyName)}</strong> on the Magnus construction management platform.</p>
          <p style="margin:0 0 14px;font-family:Arial,Helvetica,sans-serif;color:#222222;">Click the button below to accept your invitation and activate your account.</p>
          ${emailButton(inviteUrl, "Accept Invitation")}
          <p style="margin:0 0 14px;font-family:Arial,Helvetica,sans-serif;color:#222222;font-size:13px;color:#777777;">If the button does not work, copy and paste this link into your browser:</p>
      <p style="margin:0 0 14px;font-family:Arial,Helvetica,sans-serif;font-size:12px;word-break:break-all;color:#777777;">${inviteUrl}</p>`,
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

      console.error("admin-invite-user: Resend rejected the invite email", { email, status: resendResponse.status, resendResult });
      await removeCreatedAuthUser(supabaseAdmin, createdAuthUserId, "resend rejected the email");

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
    if (createdAuthUserId && supabaseAdminForCleanup) {
      console.error("admin-invite-user: unexpected error after the invite user was created", err);
      try {
        if (createdInviteId) {
          await supabaseAdminForCleanup
            .from("company_invitations")
            .update({ status: "revoked", updated_at: new Date().toISOString() })
            .eq("id", createdInviteId);
        }
      } catch (revokeErr) {
        console.error("admin-invite-user: could not revoke the invitation row during cleanup", revokeErr);
      }
      await removeCreatedAuthUser(supabaseAdminForCleanup, createdAuthUserId, "unexpected exception");
    }
    return jsonResponse({
      error: "Unexpected server error",
      details: err instanceof Error ? err.message : String(err),
    }, 500);
  }
});

