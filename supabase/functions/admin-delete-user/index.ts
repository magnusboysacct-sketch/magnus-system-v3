import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type DeleteBody = {
  // For a pending invite (no auth user exists yet)
  invitationId?: string;
  // For an active/accepted user (has a real auth.users id)
  userId?: string;
};

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
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

    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
      return jsonResponse({ error: "Missing Supabase secrets" }, 500);
    }

    const body = (await req.json()) as DeleteBody;
    const { invitationId, userId } = body;

    if (!invitationId && !userId) {
      return jsonResponse(
        { error: "Provide either invitationId or userId" },
        400
      );
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

    const { data: callerProfile, error: callerProfileError } =
      await supabaseAdmin
        .from("user_profiles")
        .select("id, role, status, company_id")
        .eq("id", callerId)
        .maybeSingle();

    if (callerProfileError || !callerProfile) {
      return jsonResponse({
        error: "Caller profile not found",
        details: callerProfileError?.message || null,
      }, 403);
    }

    if (callerProfile.role !== "director") {
      return jsonResponse({ error: "Only directors can remove staff" }, 403);
    }

    if (callerProfile.status && callerProfile.status !== "active") {
      return jsonResponse({ error: "Your account is not active" }, 403);
    }

    if (!callerProfile.company_id) {
      return jsonResponse({ error: "Director has no company_id" }, 403);
    }

    // --- Case 1: deleting a pending invitation (no auth user yet) ---
    if (invitationId) {
      const { data: invite, error: inviteFetchError } = await supabaseAdmin
        .from("company_invitations")
        .select("id, company_id")
        .eq("id", invitationId)
        .maybeSingle();

      if (inviteFetchError || !invite) {
        return jsonResponse({ error: "Invitation not found" }, 404);
      }

      if (invite.company_id !== callerProfile.company_id) {
        return jsonResponse(
          { error: "Invitation does not belong to your company" },
          403
        );
      }

      const { error: deleteError } = await supabaseAdmin
        .from("company_invitations")
        .delete()
        .eq("id", invitationId);

      if (deleteError) {
        return jsonResponse(
          { error: deleteError.message, details: deleteError },
          500
        );
      }

      return jsonResponse({
        success: true,
        message: "Invitation permanently deleted.",
        type: "invitation",
        id: invitationId,
      });
    }

    // --- Case 2: deleting an active/accepted user (real auth account) ---
    if (userId === callerId) {
      return jsonResponse(
        { error: "You cannot delete your own account here." },
        400
      );
    }

    const { data: targetProfile, error: targetProfileError } =
      await supabaseAdmin
        .from("user_profiles")
        .select("id, company_id, role")
        .eq("id", userId)
        .maybeSingle();

    if (targetProfileError || !targetProfile) {
      return jsonResponse({ error: "User profile not found" }, 404);
    }

    if (targetProfile.company_id !== callerProfile.company_id) {
      return jsonResponse(
        { error: "User does not belong to your company" },
        403
      );
    }

    // Remove the profile row first.
    const { error: profileDeleteError } = await supabaseAdmin
      .from("user_profiles")
      .delete()
      .eq("id", userId);

    if (profileDeleteError) {
      return jsonResponse(
        { error: profileDeleteError.message, details: profileDeleteError },
        500
      );
    }

    // Then remove the actual auth login so they can no longer sign in.
    const { error: authDeleteError } =
      await supabaseAdmin.auth.admin.deleteUser(userId as string);

    if (authDeleteError) {
      return jsonResponse({
        error: "Profile deleted, but failed to delete auth login.",
        details: authDeleteError.message,
      }, 500);
    }

    return jsonResponse({
      success: true,
      message: "User and login permanently deleted.",
      type: "user",
      id: userId,
    });
  } catch (err) {
    return jsonResponse({
      error: "Unexpected server error",
      details: err instanceof Error ? err.message : String(err),
    }, 500);
  }
});
