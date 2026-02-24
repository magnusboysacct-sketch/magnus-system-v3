import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  const PROJECT_URL = Deno.env.get("PROJECT_URL") ?? "";
  const SERVICE_ROLE_KEY = Deno.env.get("SERVICE_ROLE_KEY") ?? "";
  if (!PROJECT_URL || !SERVICE_ROLE_KEY) {
    return json(500, {
      error: "Missing secrets",
      missing: { PROJECT_URL: !PROJECT_URL, SERVICE_ROLE_KEY: !SERVICE_ROLE_KEY },
    });
  }

  const authHeader = req.headers.get("authorization") || "";
  const hasBearer = authHeader.toLowerCase().startsWith("bearer ");
  if (!hasBearer) {
    return json(401, { error: "Missing bearer", hasAuthorizationHeader: Boolean(authHeader) });
  }

  // Admin client (service role) for DB + admin invite actions
  const admin = createClient(PROJECT_URL, SERVICE_ROLE_KEY);

  // Authed client using caller JWT (still service role key, but auth context from header)
  const authed = createClient(PROJECT_URL, SERVICE_ROLE_KEY, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: userData, error: userError } = await authed.auth.getUser();
  const user = userData?.user;
  console.log("caller user id:", user?.id, "email:", user?.email);
  
  if (userError || !user) {
    return json(401, {
      error: "Invalid JWT",
      details: userError?.message ?? null,
      authHeaderPrefix: authHeader.slice(0, 30),
    });
  }

  // Authorize via user_profiles
  const { data: prof, error: profErr } = await admin
    .from("user_profiles")
    .select("role,status,company_id")
    .eq("id", user.id)
    .maybeSingle();

  if (profErr) return json(500, { error: profErr.message });
  if (!prof) return json(403, { error: "Profile not found", userId: user.id });
  if (prof.status !== "active") return json(403, { error: "User disabled" });
  if (!["director", "office_user"].includes(prof.role)) return json(403, { error: "Not allowed", role: prof.role, userId: user.id });

  // Body
  let payload: any = null;
  try {
    payload = await req.json();
  } catch {
    return json(400, { error: "Invalid JSON body" });
  }

  const email = String(payload?.email ?? "").trim().toLowerCase();
  const role = String(payload?.role ?? "").trim();

  if (!email) return json(400, { error: "Missing email" });
  if (!role) return json(400, { error: "Missing role" });

  // Invite user (NO EMAIL) -> returns an action link we can copy/open
  const { data: linkData, error: inviteErr } = await admin.auth.admin.generateLink({
    type: "invite",
    email,
    options: {
      data: { role, company_id: prof.company_id },
      redirectTo: "http://localhost:5173", 
    },
  });

  if (inviteErr) return json(400, { error: "Invite failed", details: inviteErr.message });

  const inviteLink = linkData?.properties?.action_link ?? null;

  return json(200, { ok: true, invited: email, inviteLink });
});
