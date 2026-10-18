// src/lib/verifyPhoto.ts — the photo on the public verify pages.
// The photo is private; the verify-photo edge function hands out a 5-minute signed URL for the card that was scanned (see supabase/functions/verify-photo).
// While it loads, or if there is no photo, nothing is returned and the page shows the person's initials.
import { useEffect, useState } from "react";
import { supabase } from "./supabase";

export async function fetchVerifyPhoto(who: { code?: string; workerId?: string }): Promise<string | null> {
  try {
    const { data, error } = await supabase.functions.invoke("verify-photo", { body: who.code ? { code: who.code } : { workerId: who.workerId } });
    if (error) return null;
    const url = (data as { url?: string } | null)?.url;
    return typeof url === "string" && url.startsWith("https://") ? url : null;
  } catch {
    return null;
  }
}

// `hasPhoto`: the database says this card has a photo. `legacyUrl`: a ready URL from an older database function (used only if the new one is not applied yet).
export function useVerifyPhoto(who: { code?: string; workerId?: string }, hasPhoto: boolean, legacyUrl?: string | null): string | null {
  const { code, workerId } = who;
  const key = code ? "c:" + code : workerId ? "w:" + workerId : "";
  const [found, setFound] = useState<{ key: string; url: string | null } | null>(null);
  useEffect(() => {
    let alive = true;
    if (!hasPhoto || !key) return;
    fetchVerifyPhoto({ code, workerId }).then((u) => { if (alive) setFound({ key, url: u }); });
    return () => { alive = false; };
  }, [code, workerId, hasPhoto, key]);
  if (!hasPhoto) return null;
  return (found && found.key === key ? found.url : null) ?? (legacyUrl || null);
}
