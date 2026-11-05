// supabase/functions/worker-portal-files/index.ts
//
// The worker's own photo for the portal. Profile / passport photos are in the PRIVATE private-files bucket, so the page cannot open them: this function checks the
// worker's portal session token (worker_portal_photo_ref, service role only) and returns a signed URL that works for five minutes. It only ever signs the session
// worker's own passport / profile photo (the same rule as verify-photo: a staff-photos or workers/passport file of the company's own folder), never an ID scan.
//
// Body: { action: "photo", token }   Returns 200 { url }   404 { error: "no_photo" }
//
// Clock in / out selfie (migration 20260987000000): { action: "clock_photo", token, image: "data:image/jpeg;base64,..." } stores the JPEG (at most 1.5 MB) in
// private-files at <company>/attendance/<yyyy-mm>/<worker>/<random>.jpg and returns 200 { path }. worker_clock_in / worker_clock_out only accept a path in that
// worker's own folder. The worker can't read the photo back; only the office can.
// Work pictures and voice notes (migration 20260988000000):
//   { action: "work_photo", token, image: "data:image/jpeg;base64,..." }  -> <company>/attendance/<yyyy-mm>/<worker>/work/<random>.jpg   (at most 1.5 MB)
//   { action: "voice", token, audio: "data:audio/webm;base64,..." }       -> <company>/attendance/<yyyy-mm>/<worker>/voice/<random>.webm (at most 3 MB;
//     webm, mp4 (iPhone), ogg, mpeg, aac). Returns 200 { path }; the page then calls worker_clock_add_media with it.
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
    if (!["photo", "clock_photo", "work_photo", "voice"].includes(String(body.action)) || token.length < 20 || token.length > 200) return noPhoto();

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

    if (body.action === "clock_photo" || body.action === "work_photo" || body.action === "voice") {
      const { data: who, error: whoErr } = await admin.rpc("worker_portal_photo_ref", { p_token: token });   // checks the session
      if (whoErr || !who?.worker_id || !who?.company_id) return jsonResponse({ error: "Your session has ended. Sign in again." }, 401);
      const month = new Date(Date.now() - 5 * 3600_000).toISOString().slice(0, 7);          // Jamaica time
      const base = `${who.company_id}/attendance/${month}/${who.worker_id}`;
      let bytes: Uint8Array, path: string, contentType: string;
      if (body.action === "voice") {
        const m = /^data:(audio\/(?:webm|mp4|ogg|mpeg|aac))(?:;[^,]*)?;base64,([A-Za-z0-9+/=]+)$/.exec(String(body.audio ?? ""));
        if (!m) return jsonResponse({ error: "No recording." }, 400);
        contentType = m[1];
        bytes = Uint8Array.from(atob(m[2]), (c) => c.charCodeAt(0));
        if (bytes.length < 500 || bytes.length > 3_000_000) return jsonResponse({ error: "That recording could not be used." }, 400);
        const ext = { "audio/webm": "webm", "audio/mp4": "m4a", "audio/ogg": "ogg", "audio/mpeg": "mp3", "audio/aac": "aac" }[contentType] || "webm";
        path = `${base}/voice/${crypto.randomUUID()}.${ext}`;
      } else {
        const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(String(body.image ?? ""));
        if (!m) return jsonResponse({ error: "No photo." }, 400);
        contentType = "image/jpeg";
        bytes = Uint8Array.from(atob(m[1]), (c) => c.charCodeAt(0));
        if (bytes.length < 1000 || bytes.length > 1_500_000 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return jsonResponse({ error: "That photo could not be used." }, 400);
        path = body.action === "work_photo" ? `${base}/work/${crypto.randomUUID()}.jpg` : `${base}/${crypto.randomUUID()}.jpg`;
      }
      const { error: upErr } = await admin.storage.from(PRIVATE_BUCKET).upload(path, bytes, { contentType, upsert: false });
      if (upErr) return jsonResponse({ error: "Could not save it. Try again." }, 500);
      return jsonResponse({ path });
    }
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
