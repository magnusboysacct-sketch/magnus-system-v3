// A user's personal signature, with the company's default signature as the fallback.
//
// user_profiles.signature_path holds a storage PATH in the private private-files bucket (never a URL), made into a short-lived
// signed URL every time it is needed ("sign on read", the same pattern as contract signatures). The company default,
// company_settings.signature_url, is a permanent public URL (SettingsCompanyPage) and is passed through unchanged.
import { supabase } from "./supabase";
import { PRIVATE_FILES_BUCKET, signPrivatePath } from "./privateFiles";

export const USER_SIGNATURE_TTL_SECONDS = 3600; // 1 hour; always re-resolved when used

export type SignatureSource = "personal" | "company";

export interface ResolvedSignature {
  url: string; // displayable right now (signed URL for a personal signature, public URL for the company one)
  source: SignatureSource;
}

// <companyId>/user-signatures/<userId>_<ts>.png - the first folder must be the company id (the bucket's policies).
export function userSignaturePath(companyId: string, userId: string): string {
  return `${companyId}/user-signatures/${userId}_${Date.now()}.png`;
}

interface ProfileSignatureRow {
  company_id: string | null;
  signature_path: string | null;
  columnMissing: boolean; // true until the signature_path migration has been applied
}

async function readProfile(userId: string): Promise<ProfileSignatureRow | null> {
  const full = await supabase.from("user_profiles").select("company_id, signature_path").eq("id", userId).maybeSingle();
  if (!full.error) {
    if (!full.data) return null;
    return { company_id: full.data.company_id ?? null, signature_path: full.data.signature_path ?? null, columnMissing: false };
  }
  // The column does not exist yet: still return the company id so the company default keeps working.
  const basic = await supabase.from("user_profiles").select("company_id").eq("id", userId).maybeSingle();
  if (basic.error || !basic.data) return null;
  return { company_id: basic.data.company_id ?? null, signature_path: null, columnMissing: true };
}

// The signature to offer a user: THEIR OWN if they have saved one, else the company's default, else null. userId defaults to
// the signed-in user. If a personal signature is saved but cannot be loaded right now, this returns null rather than
// silently substituting the company's signature for someone's own.
export async function resolveUserSignature(userId?: string | null): Promise<ResolvedSignature | null> {
  try {
    let uid = userId || null;
    if (!uid) {
      const { data } = await supabase.auth.getUser();
      uid = data?.user?.id ?? null;
    }
    if (!uid) return null;

    const profile = await readProfile(uid);
    if (!profile) return null;

    if (profile.signature_path) {
      const url = await signPrivatePath(profile.signature_path, USER_SIGNATURE_TTL_SECONDS);
      return url ? { url, source: "personal" } : null;
    }

    if (!profile.company_id) return null;
    const { data: cs } = await supabase
      .from("company_settings")
      .select("signature_url")
      .eq("company_id", profile.company_id)
      .maybeSingle();
    const companyUrl = typeof cs?.signature_url === "string" ? cs.signature_url.trim() : "";
    return companyUrl ? { url: companyUrl, source: "company" } : null;
  } catch {
    return null;
  }
}

// Turns a displayable signature URL into a data URL (what the contract signing flow takes). Tries a plain fetch first, then the
// signed-in user's own storage download, which does not depend on the image host's CORS settings.
export async function signatureUrlToDataUrl(url: string): Promise<string> {
  let blob: Blob | null = null;
  try {
    const res = await fetch(url);
    if (res.ok) blob = await res.blob();
  } catch {
    /* fall through to the storage download */
  }
  if (!blob) {
    const m = /\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/]+)\/([^?]+)/.exec(url);
    if (m) {
      const { data, error } = await supabase.storage.from(m[1]).download(decodeURIComponent(m[2]));
      if (!error && data) blob = data;
    }
  }
  if (!blob) throw new Error("The saved signature could not be loaded.");
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error || new Error("The saved signature could not be read."));
    reader.readAsDataURL(blob as Blob);
  });
}

// ---- "My Signature" page ----------------------------------------------------------------------------------------------

export interface MySignature {
  userId: string;
  companyId: string;
  personalPath: string | null;
  personalUrl: string | null; // signed, displayable
  companyUrl: string | null; // the company default, for the "currently using" preview
  columnMissing: boolean; // the signature_path migration has not been applied yet
}

async function currentUserAndProfile(): Promise<{ userId: string; profile: ProfileSignatureRow }> {
  const { data } = await supabase.auth.getUser();
  const userId = data?.user?.id;
  if (!userId) throw new Error("Please sign in again.");
  const profile = await readProfile(userId);
  if (!profile?.company_id) throw new Error("Your account isn't linked to a company.");
  return { userId, profile };
}

export async function loadMySignature(): Promise<MySignature> {
  const { userId, profile } = await currentUserAndProfile();
  const companyId = profile.company_id as string;
  const personalUrl = profile.signature_path ? await signPrivatePath(profile.signature_path, USER_SIGNATURE_TTL_SECONDS) : null;
  const { data: cs } = await supabase.from("company_settings").select("signature_url").eq("company_id", companyId).maybeSingle();
  const companyUrl = typeof cs?.signature_url === "string" && cs.signature_url.trim() ? cs.signature_url.trim() : null;
  return { userId, companyId, personalPath: profile.signature_path, personalUrl, companyUrl, columnMissing: profile.columnMissing };
}

async function removeQuietly(path: string | null | undefined): Promise<void> {
  if (!path) return;
  try {
    await supabase.storage.from(PRIVATE_FILES_BUCKET).remove([path]);
  } catch {
    /* a leftover file is harmless; the database no longer points at it */
  }
}

// Uploads a new signature image and points the user's own profile row at it. The previous file is removed afterwards.
export async function saveMySignature(blob: Blob): Promise<void> {
  const { userId, profile } = await currentUserAndProfile();
  if (profile.columnMissing) throw new Error("Personal signatures aren't switched on yet (the database update has not been applied).");
  const path = userSignaturePath(profile.company_id as string, userId);
  const { error: upErr } = await supabase.storage.from(PRIVATE_FILES_BUCKET).upload(path, blob, { contentType: "image/png", upsert: false });
  if (upErr) throw new Error(upErr.message || "The signature could not be uploaded.");
  const { data, error } = await supabase.from("user_profiles").update({ signature_path: path }).eq("id", userId).select("id");
  if (error || !data || data.length === 0) {
    await removeQuietly(path);
    throw new Error(error?.message || "Your signature could not be saved.");
  }
  if (profile.signature_path && profile.signature_path !== path) await removeQuietly(profile.signature_path);
}

export async function clearMySignature(): Promise<void> {
  const { userId, profile } = await currentUserAndProfile();
  if (profile.columnMissing) return;
  const { data, error } = await supabase.from("user_profiles").update({ signature_path: null }).eq("id", userId).select("id");
  if (error || !data || data.length === 0) throw new Error(error?.message || "Your signature could not be removed.");
  await removeQuietly(profile.signature_path);
}
