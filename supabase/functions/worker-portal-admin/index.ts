// supabase/functions/worker-portal-admin/index.ts
//
// The office side of the worker portal: give a worker portal access, reset their PIN, unlock, disable / enable, and read the status. Only a director, admin or
// secretary of the worker's own company may use it. The role is checked here AND again by the database functions it calls (worker_portal_staff_*), which run with the
// CALLER's login, so a mistake in one place does not open the other.
//
// Body (POST JSON, Authorization: the signed-in user's token):
//   { action: "status", worker_id }                 -> { status }
//   { action: "grant" | "reset", worker_id }        -> { pin, employee_id, worker_name, worker_phone, company_name, portal_url }   the temporary PIN is returned ONCE, never stored
//   { action: "unlock", worker_id }                 -> { ok }
//   { action: "set_enabled", worker_id, enabled }   -> { ok }
//
// The temporary PIN is random (6 digits, never an easy one) and stored only as a PBKDF2 hash; the worker must choose their own at the first sign-in.
import { createClient } from "npm:@supabase/supabase-js@2";
import { hashPassword } from "../_shared/portalPassword.ts";
import { canManageWorkerPortal, generateTempPin } from "../_shared/workerPortal.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" } });
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PORTAL_URL = "https://app.magnusboys.com/worker";

function randomInt(n: number): number {
  // uniform in [0, n): reject the top of the range so every digit is equally likely
  const limit = Math.floor(0x100000000 / n) * n;
  const buf = new Uint32Array(1);
  do crypto.getRandomValues(buf); while (buf[0] >= limit);
  return buf[0] % n;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonResponse({ error: "Missing Authorization header" }, 401);

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || Deno.env.get("PROJECT_URL") || "";
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SERVICE_ROLE_KEY") || "";
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return jsonResponse({ error: "Missing Supabase secrets" }, 500);

    // the caller's own login (so the database sees auth.uid()), and the service client for reading the worker / company
    const asCaller = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false, autoRefreshToken: false } });
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

    const { data: userData, error: userError } = await asCaller.auth.getUser();
    if (userError || !userData.user) return jsonResponse({ error: "Unauthorized" }, 401);
    const { data: profile } = await admin.from("user_profiles").select("role, status, company_id").eq("id", userData.user.id).maybeSingle();
    if (!profile || !canManageWorkerPortal(profile.role) || (profile.status && profile.status !== "active") || !profile.company_id) {
      return jsonResponse({ error: "Only a director, admin or secretary can manage worker portal access." }, 403);
    }

    let body: Record<string, unknown>;
    try { body = (await req.json()) as Record<string, unknown>; } catch { return jsonResponse({ error: "Invalid request" }, 400); }
    const action = String(body.action ?? "");
    const workerId = String(body.worker_id ?? "");
    if (!UUID.test(workerId)) return jsonResponse({ error: "Invalid worker" }, 400);

    // the worker must be in the caller's company (a missing worker and another company's worker look the same)
    const { data: worker } = await admin.from("workers").select("id, company_id, first_name, last_name, phone, employee_id, status").eq("id", workerId).maybeSingle();
    if (!worker || worker.company_id !== profile.company_id) return jsonResponse({ error: "Worker not found" }, 404);

    const fail = (e: { message?: string; code?: string }) => {
      if (e.code === "42501") return jsonResponse({ error: "Not allowed" }, 403);
      if (e.code === "22023" || e.code === "P0002") return jsonResponse({ error: e.message || "Not possible" }, 400);
      throw e;
    };

    if (action === "status") {
      const { data, error } = await asCaller.rpc("worker_portal_staff_status", { p_worker_id: workerId });
      if (error) return fail(error);
      return jsonResponse({ status: data });
    }

    if (action === "grant" || action === "reset") {
      if (worker.status !== "active") return jsonResponse({ error: "The worker is not active." }, 400);
      if (!worker.employee_id) return jsonResponse({ error: "The worker has no worker number yet." }, 400);
      const pin = generateTempPin(randomInt);
      const { error } = await asCaller.rpc("worker_portal_staff_set_pin", { p_worker_id: workerId, p_pin_hash: await hashPassword(pin) });
      if (error) return fail(error);
      const { data: cs } = await admin.from("company_settings").select("company_name").eq("company_id", profile.company_id).maybeSingle();
      const { data: co } = await admin.from("companies").select("name").eq("id", profile.company_id).maybeSingle();
      return jsonResponse({
        pin, employee_id: worker.employee_id, worker_name: `${worker.first_name ?? ""} ${worker.last_name ?? ""}`.trim(), worker_phone: worker.phone ?? null,
        company_name: (cs?.company_name || co?.name || "").toString().trim(), portal_url: PORTAL_URL,
      });
    }

    if (action === "unlock") {
      const { error } = await asCaller.rpc("worker_portal_staff_unlock", { p_worker_id: workerId });
      if (error) return fail(error);
      return jsonResponse({ ok: true });
    }

    if (action === "set_enabled") {
      if (typeof body.enabled !== "boolean") return jsonResponse({ error: "Invalid request" }, 400);
      const { error } = await asCaller.rpc("worker_portal_staff_set_enabled", { p_worker_id: workerId, p_enabled: body.enabled });
      if (error) return fail(error);
      return jsonResponse({ ok: true });
    }

    return jsonResponse({ error: "Invalid request" }, 400);
  } catch (e) {
    console.error("worker-portal-admin failed:", e instanceof Error ? e.message : e);
    return jsonResponse({ error: "Something went wrong. Please try again." }, 500);
  }
});
