// src/lib/fileLinks.ts — ready-made links to private files, so "Open" and "Download" are plain links the phone / browser follows
// straight away. (Making the link only after the tap, then opening a new tab, is blocked as a pop-up by many phones and browsers:
// the file did not open.) Links last an hour; pages renew them before that.
import { supabase } from "./supabase";

export const LINK_SECONDS = 3600;
export const RENEW_MS = 45 * 60 * 1000;

export async function fileLinks(paths: string[], bucket = "private-files"): Promise<Record<string, string>> {
  const list = Array.from(new Set(paths.filter(Boolean)));
  const out: Record<string, string> = {};
  for (let i = 0; i < list.length; i += 100) {
    const { data } = await supabase.storage.from(bucket).createSignedUrls(list.slice(i, i + 100), LINK_SECONDS);
    (data || []).forEach((d) => { if (d.path && d.signedUrl) out[d.path] = d.signedUrl; });
  }
  return out;
}

// The same link, but the browser saves the file (with its own name) instead of showing it.
export function downloadLink(url: string | undefined, fileName: string): string | undefined {
  if (!url) return undefined;
  return `${url}${url.includes("?") ? "&" : "?"}download=${encodeURIComponent(fileName)}`;
}

// When there is no ready link: open the new tab FIRST (inside the tap, so it is not blocked), then send it to the file.
export async function openLater(getUrl: () => Promise<string>): Promise<void> {
  const w = window.open("about:blank", "_blank");
  try {
    const url = await getUrl();
    if (w) { w.opener = null; w.location.href = url; } else window.location.href = url;
  } catch (e) { w?.close(); throw e; }
}
