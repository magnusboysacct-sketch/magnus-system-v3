// supabase/functions/worker-portal-files/index.ts
//
// The worker's own photo for the portal. Profile / passport photos are in the PRIVATE private-files bucket, so the page cannot open them: this function checks the
// worker's portal session token (worker_portal_photo_ref, service role only) and returns a signed URL that works for five minutes. It only ever signs the session
// worker's own passport / profile photo (the same rule as verify-photo: a staff-photos or workers/passport file of the company's own folder), never an ID scan.
//
// Body: { action: "photo", token }   Returns 200 { url }   404 { error: "no_photo" }
// The page calls it with the anon key (a JWT), so verify_jwt stays true.
import { createClient } from "npm:@supabase/supabase-js@2";
import { PRIVATE_BUCKET, SIGNED_URL_TTL_SECONDS, isShowablePhotoPath, privatePhotoPath } from "../verify-photo/logic.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" } });
}
const noPhoto = () => jsonResponse({ error: "no_photo" }, 404);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || Deno.env.get("PROJECT_URL") || "";
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SERVICE_ROLE_KEY") || "";
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return jsonResponse({ error: "Missing Supabase secrets" }, 500);

    let body: Record<string, unknown>;
    try { body = (await req.json()) as Record<string, unknown>; } catch { return jsonResponse({ error: "Invalid request" }, 400); }
    const token = String(body.token ?? "");
    if (body.action !== "photo" || token.length < 20 || token.length > 200) return noPhoto();

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: ref, error } = await admin.rpc("worker_portal_photo_ref", { p_token: token });
    if (error || !ref?.photo) return noPhoto();

    const path = privatePhotoPath(String(ref.photo));
    if (!path || !isShowablePhotoPath(path) || !path.startsWith(`${ref.company_id}/`)) return noPhoto();
    const { data, error: signErr } = await admin.storage.from(PRIVATE_BUCKET).createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
    if (signErr || !data?.signedUrl) return noPhoto();
    return jsonResponse({ url: data.signedUrl });
  } catch (e) {
    console.error("worker-portal-files failed:", e instanceof Error ? e.message : e);
    return jsonResponse({ error: "Could not load the photo" }, 500);
  }
});
