import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
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

    const body = await req.json() as { userId?: string };
    const targetUserId = String(body.userId || "").trim();

    if (!targetUserId) {
      return jsonResponse({ error: "userId is required" }, 400);
    }

    // Verify caller via their JWT
    const supabaseUser = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: userData, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !userData.user) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const callerId = userData.user.id;

    // Block self-deletion
    if (callerId === targetUserId) {
      return jsonResponse({ error: "You cannot remove yourself" }, 400);
    }

    // Load caller's profile — must be director or admin in the same company
    const { data: callerProfile, error: callerErr } = await supabaseAdmin
      .from("user_profiles")
      .select("role, company_id, status")
      .eq("id", callerId)
      .maybeSingle();

    if (callerErr || !callerProfile) {
      return jsonResponse({ error: "Caller profile not found" }, 403);
    }

    if (!["director", "admin"].includes(callerProfile.role)) {
      return jsonResponse({ error: "Only directors and admins can remove users" }, 403);
    }

    if (callerProfile.status !== "active") {
      return jsonResponse({ error: "Your account is not active" }, 403);
    }

    // Verify target belongs to caller's company
    const { data: targetProfile, error: targetErr } = await supabaseAdmin
      .from("user_profiles")
      .select("id, company_id, role")
      .eq("id", targetUserId)
      .maybeSingle();

    if (targetErr || !targetProfile) {
      return jsonResponse({ error: "Target user not found" }, 404);
    }

    if (targetProfile.company_id !== callerProfile.company_id) {
      return jsonResponse({ error: "User is not in your company" }, 403);
    }

    // Directors cannot be removed by admins (only another director can)
    if (targetProfile.role === "director" && callerProfile.role !== "director") {
      return jsonResponse({ error: "Only a director can remove another director" }, 403);
    }

    // Delete from auth.users — cascades to user_profiles (ON DELETE CASCADE)
    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(targetUserId);

    if (deleteError) {
      return jsonResponse({
        error: "Failed to delete user",
        details: deleteError.message,
      }, 500);
    }

    return jsonResponse({ success: true, deletedUserId: targetUserId });

  } catch (err) {
    return jsonResponse({
      error: "Unexpected server error",
      details: err instanceof Error ? err.message : String(err),
    }, 500);
  }
});
