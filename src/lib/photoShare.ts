// Photo share links: a link (photo_share_links row) lets someone WITHOUT a login view a chosen set of a project's photos.
// Staff create, list and revoke links here; visitors open /shared/<token>, which asks the photo-share-resolve edge function
// for the photos (the function only returns photos stored on the link row).
import { supabase } from "./supabase";

// Same cap as the zip download, so "Download All" on the shared page can always zip every photo on a link.
export const PHOTO_SHARE_MAX_PHOTOS = 50;
export const SHARE_EXPIRY_DAYS = [7, 30] as const;
export type ShareExpiryDays = (typeof SHARE_EXPIRY_DAYS)[number];

// Always use the production domain for links that get sent to other people (same rule as the client portal links).
const SHARE_BASE =
  window.location.hostname === "localhost" ? window.location.origin : "https://app.magnusboys.com";

export function buildSharedPhotosUrl(token: string): string {
  return `${SHARE_BASE}/shared/${token}`;
}

// Date only, in Jamaica time, e.g. "Oct 15, 2026".
export function formatShareDate(iso: string | null | undefined): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      timeZone: "America/Jamaica",
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return String(iso);
  }
}

export interface PhotoShareLink {
  id: string;
  token: string;
  title: string | null;
  photo_ids: string[];
  created_at: string;
  expires_at: string;
  revoked_at: string | null;
}

export type ShareLinkStatus = "active" | "expired" | "revoked";

export function shareLinkStatus(link: Pick<PhotoShareLink, "expires_at" | "revoked_at">, now: number = Date.now()): ShareLinkStatus {
  if (link.revoked_at) return "revoked";
  const expires = new Date(link.expires_at).getTime();
  if (!Number.isFinite(expires) || expires <= now) return "expired";
  return "active";
}

const LINK_COLUMNS = "id, token, title, photo_ids, created_at, expires_at, revoked_at";

// Creates a link for exactly the photo ids passed in. company_id comes from the signed-in user's own profile (the table's
// policy requires it to match) and created_by is the signed-in user.
export async function createPhotoShareLink(input: {
  projectId: string;
  photoIds: string[];
  title?: string;
  days: ShareExpiryDays;
}): Promise<PhotoShareLink> {
  const photoIds = [...new Set(input.photoIds)];
  if (photoIds.length === 0) throw new Error("Select at least one photo to share.");
  if (photoIds.length > PHOTO_SHARE_MAX_PHOTOS) {
    throw new Error(`You can share up to ${PHOTO_SHARE_MAX_PHOTOS} photos in one link.`);
  }

  const { data: auth } = await supabase.auth.getUser();
  const user = auth?.user;
  if (!user) throw new Error("Please sign in again to create a link.");
  const { data: profile } = await supabase.from("user_profiles").select("company_id").eq("id", user.id).maybeSingle();
  if (!profile?.company_id) throw new Error("Your company could not be found. Please sign in again.");

  const expiresAt = new Date(Date.now() + input.days * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("photo_share_links")
    .insert({
      company_id: profile.company_id,
      project_id: input.projectId,
      photo_ids: photoIds,
      title: input.title?.trim() || null,
      created_by: user.id,
      expires_at: expiresAt,
    })
    .select(LINK_COLUMNS)
    .single();
  if (error || !data) throw new Error(error?.message || "The link could not be created.");
  return data as PhotoShareLink;
}

export async function listPhotoShareLinks(projectId: string): Promise<PhotoShareLink[]> {
  const { data, error } = await supabase
    .from("photo_share_links")
    .select(LINK_COLUMNS)
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data || []) as PhotoShareLink[];
}

// Switches a link off immediately (the edge function rejects revoked links). Throws if nothing was updated.
export async function revokePhotoShareLink(id: string): Promise<void> {
  const { data, error } = await supabase
    .from("photo_share_links")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id)
    .is("revoked_at", null)
    .select("id");
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error("The link could not be revoked.");
}
