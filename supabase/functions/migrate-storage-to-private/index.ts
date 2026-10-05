// supabase/functions/migrate-storage-to-private/index.ts
//
// ONE-TIME migration: copies EXISTING worker ID photos, worker passport photos, field-payment ID photos and staff
// profile photos (user_profiles.avatar_url) from
// the public "project-files" bucket into the private "private-files" bucket, replaces the stored public URL with a
// fresh 1-year signed URL, and logs every row it processes to storage_migration_log.
//
// - Director-only, scoped to the caller's own company (same auth gate as admin-delete-user).
// - dry_run defaults to TRUE and makes ZERO writes (no storage copy, no database update, no log insert).
// - The old public copies are NOT deleted — that is a separate, later step. Until then every row is reversible
//   from storage_migration_log (old_url is recorded).
// - Contract signatures are deliberately NOT handled here.
//
// Body (JSON, all optional): { "dry_run": false, "table_filter": "workers" | "field_payments" | "workers.id_photo_url" | ... }
// Only the literal boolean false turns off dry_run.

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SOURCE_BUCKET = "project-files";
const DEST_BUCKET = "private-files";
const PUBLIC_MARKER = "/object/public/project-files/";
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365; // same expiry as src/lib/fieldPayments.ts
const BATCH_SIZE = 50;
const MAX_BATCHES_PER_TARGET = 200; // hard stop against a runaway loop
const TIME_BUDGET_MS = 100_000; // stop starting new rows near the edge-function wall-clock limit; just rerun
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Target = { table: string; column: string; folder: string };

// Contracts are intentionally absent.
const TARGETS: Target[] = [
  { table: "workers", column: "id_photo_url", folder: "workers/ids" },
  { table: "workers", column: "passport_photo_url", folder: "workers/passport" },
  { table: "field_payments", column: "id_photo_url", folder: "field-payments/ids" },
  // Staff photos: the stored value is the public URL plus a "?t=<timestamp>" cache-buster, which parseOldPath strips.
  { table: "user_profiles", column: "avatar_url", folder: "staff-photos" },
];

type Detail = {
  id: string;
  status: "migrated" | "skipped" | "failed" | "would_migrate";
  old_path?: string;
  new_path?: string;
  reason?: string;
};

type TargetResult = {
  table: string;
  column: string;
  migrated: number;
  skipped: number;
  failed: number;
  would_migrate: number;
  error?: string;
  details: Detail[];
};

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Pulls the storage object path out of a full public project-files URL. Never throws.
export function parseOldPath(
  rawUrl: unknown,
  supabaseUrl: string,
): { path: string } | { skip: string } {
  if (typeof rawUrl !== "string" || !rawUrl.trim()) return { skip: "empty value" };
  const url = rawUrl.trim();
  if (url.includes("/object/sign/")) return { skip: "already a signed URL" };
  const at = url.indexOf(PUBLIC_MARKER);
  if (at === -1) return { skip: "not a project-files public URL" };

  try {
    if (supabaseUrl && new URL(url).origin !== new URL(supabaseUrl).origin) {
      return { skip: "URL belongs to a different host" };
    }
  } catch {
    return { skip: "unparseable URL" };
  }

  let remainder = url.slice(at + PUBLIC_MARKER.length).split("#")[0].split("?")[0];
  try {
    remainder = decodeURIComponent(remainder);
  } catch {
    return { skip: "undecodable path" };
  }
  remainder = remainder.replace(/^\/+/, "");
  if (!remainder || remainder.endsWith("/")) return { skip: "empty object path" };
  return { path: remainder };
}

// <companyId>/<folder>/<basename>. Returns a skip reason if the old path embeds a different company id.
export function buildNewPath(
  oldPath: string,
  folder: string,
  companyId: string,
): { path: string } | { skip: string } {
  const segs = oldPath.split("/").filter(Boolean);
  const basename = segs[segs.length - 1];
  if (!basename) return { skip: "no file name in path" };
  const embedded = segs.slice(0, -1).find((s) => UUID_RE.test(s));
  if (embedded && embedded !== companyId) {
    return { skip: "path embeds a different company id" };
  }
  return { path: `${companyId}/${folder}/${basename}` };
}

function isAlreadyExists(err: any): boolean {
  const msg = String(err?.message || err || "").toLowerCase();
  const code = String(err?.statusCode ?? err?.status ?? "");
  return code === "409" || msg.includes("already exists") || msg.includes("duplicate");
}

function emptyResult(t: Target): TargetResult {
  return { table: t.table, column: t.column, migrated: 0, skipped: 0, failed: 0, would_migrate: 0, details: [] };
}

export async function migrate(
  admin: any,
  opts: { companyId: string; dryRun: boolean; tableFilter: string | null; supabaseUrl: string },
) {
  const { companyId, dryRun, tableFilter, supabaseUrl } = opts;
  const started = Date.now();
  const logErrors: string[] = [];
  let truncated = false;

  const targets = TARGETS.filter((t) =>
    !tableFilter || t.table === tableFilter || `${t.table}.${t.column}` === tableFilter
  );

  async function writeLog(
    t: Target,
    rowId: string,
    oldUrl: string,
    newUrl: string | null,
    status: "migrated" | "skipped" | "failed",
  ) {
    if (dryRun) return; // dry runs never touch the log
    try {
      const { error } = await admin.from("storage_migration_log").insert({
        table_name: t.table,
        row_id: rowId,
        column_name: t.column,
        old_url: oldUrl,
        new_url: newUrl,
        status,
      });
      if (error) logErrors.push(`${t.table}.${t.column} ${rowId}: ${error.message}`);
    } catch (e) {
      logErrors.push(`${t.table}.${t.column} ${rowId}: ${(e as Error)?.message || String(e)}`);
    }
  }

  async function processRow(t: Target, row: any, res: TargetResult) {
    const rowId = String(row.id);
    const oldUrl: string = row[t.column];
    try {
      const parsed = parseOldPath(oldUrl, supabaseUrl);
      if ("skip" in parsed) {
        res.skipped++;
        res.details.push({ id: rowId, status: "skipped", reason: parsed.skip });
        await writeLog(t, rowId, String(oldUrl ?? ""), null, "skipped");
        return;
      }
      const built = buildNewPath(parsed.path, t.folder, companyId);
      if ("skip" in built) {
        res.skipped++;
        res.details.push({ id: rowId, status: "skipped", old_path: parsed.path, reason: built.skip });
        await writeLog(t, rowId, oldUrl, null, "skipped");
        return;
      }

      if (dryRun) {
        res.would_migrate++;
        res.details.push({ id: rowId, status: "would_migrate", old_path: parsed.path, new_path: built.path });
        return;
      }

      // 1. Server-side cross-bucket copy; "already exists" counts as success so reruns are idempotent.
      const { error: copyErr } = await admin.storage
        .from(SOURCE_BUCKET)
        .copy(parsed.path, built.path, { destinationBucket: DEST_BUCKET });
      if (copyErr && !isAlreadyExists(copyErr)) {
        // Fallback for this row only: download then re-upload.
        const { data: blob, error: dlErr } = await admin.storage.from(SOURCE_BUCKET).download(parsed.path);
        if (dlErr || !blob) {
          throw new Error(`copy failed (${copyErr.message}); download failed (${dlErr?.message || "no data"})`);
        }
        const { error: upErr } = await admin.storage
          .from(DEST_BUCKET)
          .upload(built.path, blob, { upsert: false, contentType: (blob as Blob).type || undefined });
        if (upErr && !isAlreadyExists(upErr)) {
          throw new Error(`copy failed (${copyErr.message}); upload failed (${upErr.message})`);
        }
      }

      // 2. Fresh 1-year signed URL.
      const { data: signed, error: signErr } = await admin.storage
        .from(DEST_BUCKET)
        .createSignedUrl(built.path, ONE_YEAR_SECONDS);
      if (signErr || !signed?.signedUrl) {
        throw new Error(`object copied but signing failed: ${signErr?.message || "no URL returned"}`);
      }

      // 3. Update guarded by the old value, so a concurrent edit is never overwritten.
      const { data: updated, error: updErr } = await admin
        .from(t.table)
        .update({ [t.column]: signed.signedUrl })
        .eq("id", row.id)
        .eq(t.column, oldUrl)
        .select("id");
      if (updErr) throw new Error(`row update failed: ${updErr.message}`);
      if (!updated || updated.length !== 1) {
        throw new Error("row changed while migrating; left as-is (object already copied)");
      }

      res.migrated++;
      res.details.push({ id: rowId, status: "migrated", old_path: parsed.path, new_path: built.path });
      await writeLog(t, rowId, oldUrl, signed.signedUrl, "migrated");
    } catch (e) {
      res.failed++;
      res.details.push({ id: rowId, status: "failed", reason: (e as Error)?.message || String(e) });
      await writeLog(t, rowId, String(oldUrl ?? ""), null, "failed");
    }
  }

  const results: TargetResult[] = [];

  for (const t of targets) {
    const res = emptyResult(t);
    results.push(res);
    try {
      let lastId: string | null = null;
      for (let batch = 0; batch < MAX_BATCHES_PER_TARGET; batch++) {
        if (Date.now() - started > TIME_BUDGET_MS) {
          truncated = true;
          break;
        }
        let q = admin
          .from(t.table)
          .select(`id, company_id, ${t.column}`)
          .eq("company_id", companyId)
          .like(t.column, "%" + PUBLIC_MARKER + "%")
          .order("id", { ascending: true })
          .limit(BATCH_SIZE);
        if (lastId) q = q.gt("id", lastId);
        const { data: rows, error } = await q;
        if (error) {
          res.error = error.message;
          break;
        }
        if (!rows || rows.length === 0) break;
        for (const row of rows) {
          if (Date.now() - started > TIME_BUDGET_MS) {
            truncated = true;
            break;
          }
          await processRow(t, row, res);
          lastId = String(row.id);
        }
        if (truncated || rows.length < BATCH_SIZE) break;
      }
    } catch (e) {
      res.error = (e as Error)?.message || String(e);
    }
  }

  const total = (k: "migrated" | "skipped" | "failed" | "would_migrate") =>
    results.reduce((n, r) => n + r[k], 0);

  return {
    dry_run: dryRun,
    company_id: companyId,
    table_filter: tableFilter,
    migrated: total("migrated"),
    skipped: total("skipped"),
    failed: total("failed"),
    would_migrate: total("would_migrate"),
    truncated,
    log_errors: logErrors,
    details: results,
  };
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

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || Deno.env.get("PROJECT_URL") || "";
    const SERVICE_ROLE_KEY =
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SERVICE_ROLE_KEY") || "";

    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
      return jsonResponse({ error: "Missing Supabase secrets" }, 500);
    }

    let body: { dry_run?: unknown; table_filter?: unknown } = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }
    const dryRun = body?.dry_run !== false; // only the literal false does a real run
    const tableFilter =
      typeof body?.table_filter === "string" && body.table_filter.trim() ? body.table_filter.trim() : null;

    if (tableFilter) {
      const valid = TARGETS.some((t) => t.table === tableFilter || `${t.table}.${t.column}` === tableFilter);
      if (!valid) {
        return jsonResponse({
          error: "Unknown table_filter",
          valid: [...new Set(TARGETS.flatMap((t) => [t.table, `${t.table}.${t.column}`]))],
        }, 400);
      }
    }

    const supabaseUser = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: userData, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !userData.user) {
      return jsonResponse({ error: "Unauthorized", details: userError?.message || null }, 401);
    }

    const { data: callerProfile, error: callerProfileError } = await supabaseAdmin
      .from("user_profiles")
      .select("id, role, status, company_id")
      .eq("id", userData.user.id)
      .maybeSingle();

    if (callerProfileError || !callerProfile) {
      return jsonResponse({
        error: "Caller profile not found",
        details: callerProfileError?.message || null,
      }, 403);
    }

    if (callerProfile.role !== "director") {
      return jsonResponse({ error: "Only directors can run the storage migration" }, 403);
    }

    if (callerProfile.status && callerProfile.status !== "active") {
      return jsonResponse({ error: "Your account is not active" }, 403);
    }

    if (!callerProfile.company_id) {
      return jsonResponse({ error: "Director has no company_id" }, 403);
    }

    const summary = await migrate(supabaseAdmin, {
      companyId: callerProfile.company_id,
      dryRun,
      tableFilter,
      supabaseUrl: SUPABASE_URL,
    });

    return jsonResponse(summary);
  } catch (e) {
    console.error("migrate-storage-to-private error:", (e as Error)?.message || e);
    return jsonResponse({ error: "Unexpected error", details: (e as Error)?.message || String(e) }, 500);
  }
});
