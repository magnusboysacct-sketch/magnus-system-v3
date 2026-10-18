// src/lib/verifyPhotoCore.ts — what the verify pages make of a verify_id / verify_worker result, with no network (testable in Node).
// The pages work with the database function BEFORE and AFTER migration 20260948:
//   before: the function returns photo_url (the stored value: an old long-lived signed URL, or - for a photo saved by the new app - a plain storage path);
//   after:  it returns has_photo (true / false) and no URL.
// Either way the picture comes from the verify-photo function when it is deployed; an old photo_url that is a real https link is the fallback until then.
export interface VerifyPhotoFields { has_photo?: boolean | null; photo_url?: string | null }

export function verifyPhotoInfo(result: VerifyPhotoFields | null | undefined): { hasPhoto: boolean; legacyUrl: string | null } {
  if (!result) return { hasPhoto: false, legacyUrl: null };
  const url = typeof result.photo_url === "string" ? result.photo_url.trim() : "";
  const hasPhoto = typeof result.has_photo === "boolean" ? result.has_photo : url !== "";
  // a stored PATH is not something a browser can show: only a real link is used as the fallback
  return { hasPhoto, legacyUrl: /^https:\/\//i.test(url) ? url : null };
}
