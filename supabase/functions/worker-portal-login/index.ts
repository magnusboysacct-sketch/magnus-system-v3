// supabase/functions/worker-portal-login/index.ts
//
// Sign-in for the worker portal (/worker): worker number + 6-digit PIN. Like the client portal, a worker is NOT a Supabase Auth user and has no user_profiles row:
// this function checks the PIN (PBKDF2, see _shared/portalPassword.ts), and hands back a random session token. Only a SHA-256 hash of the token is stored; the portal
// pages then read through token-checked database functions that return only that worker's data (migration 20260952000000).
//
// Actions (POST JSON):
//   { action: "login", number, pin }                    -> { ok, token, must_change_pin, expires_at }
//   { action: "change_pin", token, new_pin, current_pin? } -> { ok }   (current_pin is required unless the PIN is still the temporary one)
//   { action: "logout", token }                         -> { ok }
//
// Every sign-in failure (unknown number, wrong PIN, no access, locked, disabled, inactive worker or company, bad format) gives the SAME answer, so the screen reveals
// nothing about which numbers exist. 5 wrong tries lock the worker for 15 minutes, 10 until the office unlocks; 20 wrong tries from one address in 15 minutes block that
// address (only a hash of the address is stored). The database does the counting (worker_portal_record_failure / worker_portal_ip_*).
//
// Browser callers send the anon key, which is a valid JWT, so verify_jwt stays true (like client-portal-login).
import { createClient } from "npm:@supabase/supabase-js@2";
import { generateToken, hashPassword, verifyPassword } from "../_shared/portalPassword.ts";
import { GENERIC_LOGIN_ERROR, clientIp, isPinShape, normalizeEmployeeNumber, weakPinReason } from "../_shared/workerPortal.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" } });
}
const wrong = () => jsonResponse({ error: GENERIC_LOGIN_ERROR }, 401);
const enc = new TextEncoder();
async function sha256Hex(text: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", enc.encode(text));
  return Array.from(new Uint8Array(d)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
// A hash to check against when there is nobody to check, so "unknown number" takes as long as "wrong PIN".
let dummyHash: string | null = null;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || Deno.env.get("PROJECT_URL") || "";
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SERVICE_ROLE_KEY") || "";
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return jsonResponse({ error: "Missing Supabase secrets" }, 500);
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

    let body: Record<string, unknown>;
    try { body = (await req.json()) as Record<string, unknown>; } catch { return jsonResponse({ error: "Invalid request" }, 400); }
    const action = String(body.action ?? "");

    // ── logout ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
    if (action === "logout") {
      const token = String(body.token ?? "");
      if (token.length >= 20 && token.length <= 200) await admin.rpc("worker_portal_logout", { p_token: token });
      return jsonResponse({ ok: true });
    }

    // ── change_pin ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
    if (action === "change_pin") {
      const token = String(body.token ?? "");
      const newPin = body.new_pin;
      if (token.length < 20 || token.length > 200) return jsonResponse({ error: "Your session has ended. Please sign in again." }, 401);
      if (!isPinShape(newPin)) return jsonResponse({ error: "The PIN must be exactly 6 digits." }, 400);
      const weak = weakPinReason(newPin);
      if (weak) return jsonResponse({ error: weak }, 400);

      const { data: info, error: infoErr } = await admin.rpc("worker_portal_session_pin", { p_token: token });
      if (infoErr) throw infoErr;
      if (!info) return jsonResponse({ error: "Your session has ended. Please sign in again." }, 401);

      if (!info.must_change_pin) {
        // a normal change: the current PIN must be right (wrong ones count towards the lock like at sign-in)
        const current = body.current_pin;
        const ok = isPinShape(current) && (await verifyPassword(current, info.pin_hash)).ok;
        if (!ok) {
          await admin.rpc("worker_portal_record_failure", { p_worker_id: info.worker_id });
          return jsonResponse({ error: "Your current PIN is wrong." }, 401);
        }
        if ((await verifyPassword(newPin, info.pin_hash)).ok) return jsonResponse({ error: "Choose a PIN that is different from your current one." }, 400);
      } else if ((await verifyPassword(newPin, info.pin_hash)).ok) {
        return jsonResponse({ error: "Choose a PIN of your own, not the temporary one." }, 400);
      }
      const { data: done, error: setErr } = await admin.rpc("worker_portal_change_pin", { p_token: token, p_pin_hash: await hashPassword(newPin) });
      if (setErr) throw setErr;
      if (!done) return jsonResponse({ error: "Your session has ended. Please sign in again." }, 401);
      return jsonResponse({ ok: true });
    }

    // ── login ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
    if (action !== "login") return jsonResponse({ error: "Invalid request" }, 400);

    const salt = Deno.env.get("WORKER_PORTAL_IP_SALT") || SERVICE_ROLE_KEY.slice(0, 24);
    const ipHash = await sha256Hex(`${salt}|${clientIp(req.headers)}`);
    const { data: blocked } = await admin.rpc("worker_portal_ip_blocked", { p_ip_hash: ipHash });
    if (blocked === true) return jsonResponse({ error: "Too many wrong tries. Please wait a few minutes and try again." }, 429);

    const number = normalizeEmployeeNumber(body.number);
    const pin = body.pin;
    const failed = async (workerId?: string) => {
      if (workerId) await admin.rpc("worker_portal_record_failure", { p_worker_id: workerId });
      await admin.rpc("worker_portal_ip_record", { p_ip_hash: ipHash, p_ok: false });
      return wrong();
    };
    const spendTime = async () => { dummyHash ??= await hashPassword("dummy-pin-for-timing"); await verifyPassword(isPinShape(pin) ? pin : "000000", dummyHash); };

    if (!number || !isPinShape(pin)) { await spendTime(); return await failed(); }
    const { data: state, error: stateErr } = await admin.rpc("worker_portal_login_state", { p_number: number });
    if (stateErr) throw stateErr;
    if (!state) { await spendTime(); return await failed(); }
    // locked, disabled, inactive worker / company: the same answer as a wrong PIN (and no try is counted: nothing was guessed)
    if (!state.can_try) { await spendTime(); await admin.rpc("worker_portal_ip_record", { p_ip_hash: ipHash, p_ok: false }); return wrong(); }

    const check = await verifyPassword(pin, state.pin_hash);
    if (!check.ok) return await failed(state.worker_id);

    const token = generateToken();
    const { data: session, error: sessErr } = await admin.rpc("worker_portal_record_success", { p_worker_id: state.worker_id, p_token_hash: await sha256Hex(token) });
    if (sessErr) throw sessErr;
    if (!session) return await failed();
    await admin.rpc("worker_portal_ip_record", { p_ip_hash: ipHash, p_ok: true });
    return jsonResponse({ ok: true, token, must_change_pin: session.must_change_pin === true, expires_at: session.expires_at });
  } catch (e) {
    console.error("worker-portal-login failed:", e instanceof Error ? e.message : e);
    return jsonResponse({ error: "Something went wrong. Please try again." }, 500);
  }
});
