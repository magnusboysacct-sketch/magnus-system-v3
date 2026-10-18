// supabase/functions/verify-photo/index.ts
//
// The photo on the public ID verify pages (/v/:code and /verify/:workerId) for a visitor who is NOT logged in.
//
// Profile and passport photos are kept in the PRIVATE private-files bucket (the database stores the path), so a visitor cannot open them. This function is the
// one door: it looks the card up by the code in its QR (or, for cards printed before the codes existed, by the worker id), finds that person's profile /
// passport photo, and returns a signed URL that works for five minutes. It never returns an ID scan, never anything but a profile / passport photo of the
// person whose card was scanned, and nothing about the person but the picture.
//
// Body: { code } (12 hex characters) or { workerId } (uuid).
// Returns 200: { url }                 the photo, for 5 minutes
//         404: { error: "no_photo" }   unknown card, or no photo (the page shows initials)
//
// The pages call it with the anon key, so verify_jwt stays at its default (true), like photo-share-resolve.
import { createClient } from "npm:@supabase/supabase-js@2";
import { PRIVATE_BUCKET, SIGNED_URL_TTL_SECONDS, isShowablePhotoPath, parsePhotoRequest, privatePhotoPath } from "./logic.ts";

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
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

    let body: unknown;
    try { body = await req.json(); } catch { return jsonResponse({ error: "Invalid request" }, 400); }
    const request = parsePhotoRequest(body);
    if (!request) return noPhoto();

    // Which photo column belongs to this card: staff (user_profiles.avatar_url) or worker (workers.passport_photo_url - never id_photo_url).
    let stored: string | null = null;
    if (request.kind === "code") {
      const { data: staff } = await admin.from("user_profiles").select("avatar_url").eq("verify_code", request.code).maybeSingle();
      if (staff) stored = staff.avatar_url;
      else {
        const { data: worker } = await admin.from("workers").select("passport_photo_url").eq("verify_code", request.code).maybeSingle();
        stored = worker?.passport_photo_url ?? null;
      }
    } else {
      const { data: worker } = await admin.from("workers").select("passport_photo_url").eq("id", request.id).maybeSingle();
      stored = worker?.passport_photo_url ?? null;
    }

    const path = privatePhotoPath(stored);
    if (!path || !isShowablePhotoPath(path)) return noPhoto();

    const { data, error } = await admin.storage.from(PRIVATE_BUCKET).createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
    if (error || !data?.signedUrl) return noPhoto();
    return jsonResponse({ url: data.signedUrl });
  } catch (e) {
    console.error("verify-photo failed:", e instanceof Error ? e.message : e);
    return jsonResponse({ error: "Could not load the photo" }, 500);
  }
});
