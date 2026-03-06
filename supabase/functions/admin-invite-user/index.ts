import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type InviteBody = {
  email?: string;
  role?: "estimator" | "supervisor" | "office_user" | "site_user";
  redirectTo?: string;
};

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

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
    const SUPABASE_SERVICE_ROLE_KEY =
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
      Deno.env.get("SERVICE_ROLE_KEY") ??
      "";

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return jsonResponse(
        { error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY secret" },
        500
      );
    }

    const supabaseUser = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      global: {
        headers: {
          Authorization: authHeader,
        },
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const {
      data: { user },
      error: userError,
    } = await supabaseUser.auth.getUser();

    if (userError || !user) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const body = (await req.json()) as InviteBody;
    const email = (body.email ?? "").trim().toLowerCase();
    const role = body.role;
    const redirectTo = (body.redirectTo ?? "").trim();

    const allowedRoles = ["estimator", "supervisor", "office_user", "site_user"];
    if (!email) {
      return jsonResponse({ error: "Email is required" }, 400);
    }
    if (!role || !allowedRoles.includes(role)) {
      return jsonResponse({ error: "Invalid role" }, 400);
    }
    if (!redirectTo) {
      return jsonResponse({ error: "redirectTo is required" }, 400);
    }

    const { data: profile, error: profileError } = await supabaseAdmin
      .from("user_profiles")
      .select("id, email, full_name, role, status, company_id")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) {
      return jsonResponse(
        { error: "Failed to load caller profile", details: profileError.message },
        500
      );
    }

    if (!profile) {
      return jsonResponse({ error: "Caller profile not found" }, 403);
    }

    if (profile.role !== "director") {
      return jsonResponse({ error: "Only directors can invite staff" }, 403);
    }

    if (profile.status && profile.status !== "active") {
      return jsonResponse({ error: "Your account is not active" }, 403);
    }

    if (!profile.company_id) {
      return jsonResponse({ error: "Director has no company_id" }, 403);
    }

    const { data: existingMember } = await supabaseAdmin
      .from("user_profiles")
      .select("id, email, company_id, role, status")
      .eq("company_id", profile.company_id)
      .ilike("email", email)
      .maybeSingle();

    if (existingMember) {
      return jsonResponse(
        { error: "This email is already a member of your company" },
        409
      );
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

    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const { data: inviteRow, error: inviteInsertError } = await supabaseAdmin
      .from("company_invitations")
      .insert({
        company_id: profile.company_id,
        email,
        role,
        invited_by: user.id,
        status: "pending",
        expires_at: expiresAt,
      })
      .select("*")
      .single();

    if (inviteInsertError) {
      return jsonResponse(
        { error: "Failed to create invitation", details: inviteInsertError.message },
        500
      );
    }

    const { data: invitedUserData, error: authInviteError } =
      await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
        redirectTo,
        data: {
          company_id: profile.company_id,
          invited_role: role,
          invited_by: user.id,
          invitation_id: inviteRow.id,
        },
      });

    if (authInviteError) {
      await supabaseAdmin
        .from("company_invitations")
        .update({
          status: "revoked",
          updated_at: new Date().toISOString(),
        })
        .eq("id", inviteRow.id);

      return jsonResponse(
        { error: "Failed to send auth invite", details: authInviteError.message },
        500
      );
    }

    return jsonResponse({
      success: true,
      message: "Invitation sent successfully",
      invitation: {
        id: inviteRow.id,
        email: inviteRow.email,
        role: inviteRow.role,
        company_id: inviteRow.company_id,
        status: inviteRow.status,
        expires_at: inviteRow.expires_at,
      },
      auth_user: invitedUserData?.user ?? null,
    });
  } catch (err) {
    return jsonResponse(
      {
        error: "Unexpected server error",
        details: err instanceof Error ? err.message : String(err),
      },
      500
    );
  }
});

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}