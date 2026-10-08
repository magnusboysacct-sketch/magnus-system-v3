// Zip / save helpers for the public shared-photos page. Visitors have no login, so these work from plain image URLs only.
// (ProjectPhotosPage has its own zip handler for staff, which can also fall back to an authenticated storage download.)
import JSZip from "jszip";

// Safe file name for inside the zip: no path characters, no leading dots.
export function safeFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, " ").replace(/\s+/g, "-").replace(/^[-.]+|[-.]+$/g, "").slice(0, 80);
}

function extensionFor(url: string, blob: Blob): string {
  let pathname = url;
  try {
    pathname = new URL(url).pathname;
  } catch {
    /* keep the raw string */
  }
  const fromPath = /\.([a-z0-9]{2,5})$/i.exec(pathname)?.[1];
  if (fromPath) return fromPath.toLowerCase();
  const fromType = /^image\/(jpeg|jpg|png|webp|gif|heic)$/i.exec(blob.type)?.[1];
  if (fromType) return fromType.toLowerCase() === "jpeg" ? "jpg" : fromType.toLowerCase();
  return "jpg";
}

export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Today in Jamaica time (YYYY-MM-DD).
export function jamaicaToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Jamaica" }).format(new Date());
}

export interface ZipPhotoInput {
  url: string;
  caption?: string | null;
}

export interface ZipResult {
  blob: Blob | null; // null when nothing could be downloaded
  added: number;
  failed: string[]; // labels of the photos that could not be fetched
}

// Fetches every photo (a few at a time), skipping any that fail, and zips the rest.
export async function zipPhotoUrls(
  photos: ZipPhotoInput[],
  onProgress: (done: number, total: number) => void,
): Promise<ZipResult> {
  const zip = new JSZip();
  const used = new Set<string>();
  const failed: string[] = [];
  let done = 0;
  let next = 0;
  const worker = async () => {
    while (next < photos.length) {
      const index = next++;
      const photo = photos[index];
      try {
        const res = await fetch(photo.url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        const base = (photo.caption ? safeFileName(photo.caption) : "") || `photo-${index + 1}`;
        const ext = extensionFor(photo.url, blob);
        let name = `${base}.${ext}`;
        for (let n = 2; used.has(name.toLowerCase()); n++) name = `${base}-${n}.${ext}`;
        used.add(name.toLowerCase());
        zip.file(name, blob);
      } catch {
        failed.push(photo.caption || `photo ${index + 1}`);
      }
      done++;
      onProgress(done, photos.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, photos.length) }, worker));
  const added = photos.length - failed.length;
  if (added === 0) return { blob: null, added: 0, failed };
  // Photos are already compressed, so store without extra compression.
  const blob = await zip.generateAsync({ type: "blob", compression: "STORE" });
  return { blob, added, failed };
}

// Saves one photo. Returns false when the browser would not let us fetch it (the caller can open it in a new tab instead).
export async function savePhotoUrl(photo: ZipPhotoInput, index: number): Promise<boolean> {
  try {
    const res = await fetch(photo.url);
    if (!res.ok) return false;
    const blob = await res.blob();
    const base = (photo.caption ? safeFileName(photo.caption) : "") || `photo-${index + 1}`;
    saveBlob(blob, `${base}.${extensionFor(photo.url, blob)}`);
    return true;
  } catch {
    return false;
  }
}
