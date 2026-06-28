import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type AcceptBody = {
  invitationId?: string;
  userId?: string;
  email?: string;
  fullName?: string;
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

    const body = (await req.json()) as AcceptBody;

    const supabaseCaller = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: callerData, error: callerError } =
      await supabaseCaller.auth.getUser();

    if (callerError || !callerData.user) {
      return jsonResponse({
        error: "Unauthorized",
        details: callerError?.message || null,
      }, 401);
    }

    const newUserId = callerData.user.id;
    const newUserEmail = (callerData.user.email || body.email || "")
      .trim()
      .toLowerCase();

    if (!newUserEmail) {
      return jsonResponse({ error: "Could not determine invitee email" }, 400);
    }

    let invite;

    if (body.invitationId) {
      const { data, error } = await supabaseAdmin
        .from("company_invitations")
        .select("*")
        .eq("id", body.invitationId)
        .maybeSingle();

      if (error || !data) {
        return jsonResponse({ error: "Invitation not found" }, 404);
      }
      invite = data;
    } else {
      const { data, error } = await supabaseAdmin
        .from("company_invitations")
        .select("*")
        .ilike("email", newUserEmail)
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error || !data) {
        return jsonResponse(
          { error: "No pending invitation found for this email" },
          404
        );
      }
      invite = data;
    }

    if (invite.status === "accepted") {
      return jsonResponse({
        success: true,
        message: "Invitation was already accepted.",
        alreadyAccepted: true,
      });
    }

    if (invite.status !== "pending") {
      return jsonResponse(
        { error: `Invitation is ${invite.status}, cannot accept.` },
        409
      );
    }

    if (new Date(invite.expires_at).getTime() < Date.now()) {
      await supabaseAdmin
        .from("company_invitations")
        .update({ status: "expired", updated_at: new Date().toISOString() })
        .eq("id", invite.id);

      return jsonResponse({ error: "This invitation has expired." }, 410);
    }

    const { error: upsertError } = await supabaseAdmin
      .from("user_profiles")
      .upsert({
        id: newUserId,
        email: newUserEmail,
        full_name: body.fullName || null,
        role: invite.role,
        company_id: invite.company_id,
        status: "active",
        updated_at: new Date().toISOString(),
      }, { onConflict: "id" });

    if (upsertError) {
      return jsonResponse(
        { error: upsertError.message, details: upsertError },
        500
      );
    }

    const { error: acceptUpdateError } = await supabaseAdmin
      .from("company_invitations")
      .update({
        status: "accepted",
        accepted_at: new Date().toISOString(),
        accepted_by: newUserId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", invite.id);

    if (acceptUpdateError) {
      return jsonResponse({
        error: "Profile created, but failed to mark invitation accepted.",
        details: acceptUpdateError.message,
      }, 500);
    }

    return jsonResponse({
      success: true,
      message: "Invitation accepted and profile activated.",
      role: invite.role,
      companyId: invite.company_id,
    });
  } catch (err) {
    return jsonResponse({
      error: "Unexpected server error",
      details: err instanceof Error ? err.message : String(err),
    }, 500);
  }
});
