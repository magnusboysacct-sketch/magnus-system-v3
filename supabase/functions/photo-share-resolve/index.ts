// supabase/functions/photo-share-resolve/index.ts
//
// Resolves a photo share link (photo_share_links.token) into viewable photo URLs plus the company's branding, for a
// visitor who is NOT logged in. Visitors have no Supabase session, so they cannot sign storage URLs themselves; this
// function does it with the service role AFTER checking the link:
//   - the link must exist, must not be revoked (revoked_at) and must not have expired (expires_at);
//   - the photos returned are ONLY those whose ids are stored on the link row (photo_ids) AND that belong to the link's
//     own project, and that project must belong to the link's own company. The request body supplies the token and
//     nothing else - no photo list, project or company from the caller is ever read.
//
// project_photos.photo_url holds a storage path in one of two places (the same rule as src/lib/privateFiles.ts):
//   - <companyId>/field-photos/<projectId>/...  -> the private "private-files" bucket: signed here for 1 hour, never stored;
//   - anything else                              -> the public "project-photos" bucket: a plain public URL.
//
// Body: { shareToken }
// Returns 200: { companyName, companyLogo, projectName, title, expiresAt, photos: [{ id, url, caption, created_at }] }
// Returns 404: { error, reason }  reason is "expired" (message "This link has expired") or "not_found" / "revoked"
//              (message "This link is no longer available"); the page shows the message.
//
// The share page calls this with only the anon key (a JWT), so verify_jwt stays at its default (true), like
// portal-contract-signature-urls.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type RequestBody = {
  shareToken?: string;
};

const PRIVATE_BUCKET = "private-files";
const PUBLIC_BUCKET = "project-photos";
const SIGNED_URL_TTL_SECONDS = 3600;
const MAX_PHOTOS = 200; // keeps the id list in the query string comfortably small
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MSG_EXPIRED = "This link has expired";
const MSG_UNAVAILABLE = "This link is no longer available";

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function unavailable(reason: "not_found" | "revoked" | "expired") {
  return jsonResponse({ error: reason === "expired" ? MSG_EXPIRED : MSG_UNAVAILABLE, reason }, 404);
}

// Same rule as isFieldPhotoPath in src/lib/privateFiles.ts: the second path segment is "field-photos".
function isFieldPhotoPath(path: string): boolean {
  return path.split("/")[1] === "field-photos";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return jsonResponse({ error: "Method not allowed" }, 405);
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || Deno.env.get("PROJECT_URL") || "";
    const SERVICE_ROLE_KEY =
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SERVICE_ROLE_KEY") || "";

    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
      return jsonResponse({ error: "Missing Supabase secrets" }, 500);
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    let body: RequestBody;
    try {
      body = (await req.json()) as RequestBody;
    } catch (_err) {
      return jsonResponse({ error: "Invalid request" }, 400);
    }

    // 1. The link. Only the token is read from the request.
    const shareToken = String(body?.shareToken || "").trim();
    if (!UUID_RE.test(shareToken)) return unavailable("not_found");

    const { data: link, error: linkErr } = await supabaseAdmin
      .from("photo_share_links")
      .select("id, company_id, project_id, photo_ids, title, expires_at, revoked_at")
      .eq("token", shareToken)
      .maybeSingle();
    if (linkErr) {
      console.error("photo-share-resolve link lookup failed:", linkErr.message);
      return jsonResponse({ error: "Could not load this link. Please try again." }, 500);
    }
    if (!link) return unavailable("not_found");
    if (link.revoked_at) return unavailable("revoked");
    // A link with no readable expiry is treated as expired rather than as permanent.
    const expiresMs = link.expires_at ? new Date(link.expires_at).getTime() : NaN;
    if (!Number.isFinite(expiresMs) || expiresMs <= Date.now()) return unavailable("expired");

    // 2. The project, which must be the link's own company's.
    const { data: project, error: projectErr } = await supabaseAdmin
      .from("projects")
      .select("id, name")
      .eq("id", link.project_id)
      .eq("company_id", link.company_id)
      .maybeSingle();
    if (projectErr) {
      console.error("photo-share-resolve project lookup failed:", projectErr.message);
      return jsonResponse({ error: "Could not load this link. Please try again." }, 500);
    }
    if (!project) return unavailable("not_found");

    // 3. Branding.
    const { data: company } = await supabaseAdmin
      .from("company_settings")
      .select("company_name, logo_url")
      .eq("company_id", link.company_id)
      .limit(1)
      .maybeSingle();

    // 4. The photos: only ids stored on the link, and only from the link's own project.
    const photoIds: string[] = (Array.isArray(link.photo_ids) ? link.photo_ids : [])
      .filter((id: unknown): id is string => typeof id === "string" && UUID_RE.test(id))
      .slice(0, MAX_PHOTOS);

    let rows: any[] = [];
    if (photoIds.length > 0) {
      const { data, error: photosErr } = await supabaseAdmin
        .from("project_photos")
        .select("id, project_id, photo_url, caption, created_at")
        .eq("project_id", link.project_id)
        .in("id", photoIds)
        .order("created_at", { ascending: false });
      if (photosErr) {
        console.error("photo-share-resolve photo lookup failed:", photosErr.message);
        return jsonResponse({ error: "Could not load this link. Please try again." }, 500);
      }
      rows = data || [];
    }

    // 5. Viewable URLs. Private paths must sit under the link's own company folder, so a row can never be used to sign
    // another company's file; they are signed in one request.
    const privatePaths = rows
      .map((r) => r.photo_url)
      .filter((p): p is string => typeof p === "string" && isFieldPhotoPath(p) && p.split("/")[0] === link.company_id);
    const signed = new Map<string, string>();
    if (privatePaths.length > 0) {
      try {
        const { data, error } = await supabaseAdmin.storage
          .from(PRIVATE_BUCKET)
          .createSignedUrls([...new Set(privatePaths)], SIGNED_URL_TTL_SECONDS);
        if (!error && data) {
          for (const item of data) {
            if (item?.path && item.signedUrl && !item.error) signed.set(item.path, item.signedUrl);
          }
        }
      } catch (err) {
        console.error("photo-share-resolve signing failed:", err instanceof Error ? err.message : String(err));
      }
    }

    const photos: Array<{ id: string; url: string; caption: string | null; created_at: string | null }> = [];
    for (const row of rows) {
      const path = typeof row.photo_url === "string" ? row.photo_url : "";
      if (!path) continue;
      let url: string | null = null;
      if (isFieldPhotoPath(path)) {
        url = signed.get(path) || null;
      } else {
        url = supabaseAdmin.storage.from(PUBLIC_BUCKET).getPublicUrl(path).data.publicUrl || null;
      }
      // A photo that cannot be shown is left out rather than failing the whole page.
      if (!url) continue;
      photos.push({ id: row.id, url, caption: row.caption ?? null, created_at: row.created_at ?? null });
    }

    return jsonResponse({
      companyName: company?.company_name ?? null,
      companyLogo: company?.logo_url ?? null,
      projectName: project.name ?? null,
      title: link.title ?? null,
      expiresAt: link.expires_at,
      photos,
    });
  } catch (err) {
    console.error("Unexpected error in photo-share-resolve:", err);
    return jsonResponse(
      { error: "Unexpected server error", details: err instanceof Error ? err.message : String(err) },
      500
    );
  }
});
