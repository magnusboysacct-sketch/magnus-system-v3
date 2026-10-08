import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { ChevronLeft, ChevronRight, Clock, Download, Image as ImageIcon, X } from "lucide-react";
import { supabase } from "../lib/supabase";
import { formatShareDate } from "../lib/photoShare";
import { jamaicaToday, safeFileName, saveBlob, savePhotoUrl, zipPhotoUrls } from "../lib/sharedPhotoZip";

// Public page: opened from a share link, no login. The photo-share-resolve edge function checks the link and returns the
// photos stored on it; nothing else is readable from here.

type SharedPhoto = { id: string; url: string; caption: string | null; created_at: string | null };
type SharedGallery = {
  companyName: string | null;
  companyLogo: string | null;
  projectName: string | null;
  title: string | null;
  expiresAt: string | null;
  photos: SharedPhoto[];
};
type LoadState =
  | { kind: "loading" }
  | { kind: "error"; message: string; canRetry: boolean }
  | { kind: "ok"; data: SharedGallery };

const GENERIC_ERROR = "We couldn't load these photos. Please check your connection and try again.";
const MAX_ZIP_PHOTOS = 50;

export default function SharedPhotosPage() {
  const { token } = useParams<{ token: string }>();
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [logoFailed, setLogoFailed] = useState(false);
  const [zipProgress, setZipProgress] = useState<{ done: number; total: number } | null>(null);
  const [zipNote, setZipNote] = useState("");
  const [lightboxBusy, setLightboxBusy] = useState(false);

  // Keep shared galleries out of search engines.
  useEffect(() => {
    const meta = document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex, nofollow";
    document.head.appendChild(meta);
    return () => {
      document.head.removeChild(meta);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setState({ kind: "loading" });
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke("photo-share-resolve", { body: { shareToken: token } });
        if (cancelled) return;
        if (error) {
          // The function answers a bad link with a 404 and a message ("This link has expired" / "no longer available").
          let message = GENERIC_ERROR;
          let canRetry = true;
          try {
            const body = await (error as any).context?.json?.();
            if (body && typeof body.error === "string" && body.error) {
              message = body.error;
              canRetry = !body.reason;
            }
          } catch {
            /* not a JSON error body - use the generic message */
          }
          if (!cancelled) setState({ kind: "error", message, canRetry });
          return;
        }
        if (!data || !Array.isArray(data.photos)) {
          setState({ kind: "error", message: GENERIC_ERROR, canRetry: true });
          return;
        }
        setState({ kind: "ok", data: data as SharedGallery });
      } catch {
        if (!cancelled) setState({ kind: "error", message: GENERIC_ERROR, canRetry: true });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, attempt]);

  const photos = state.kind === "ok" ? state.data.photos : [];

  useEffect(() => {
    if (state.kind !== "ok") return;
    const { companyName, projectName } = state.data;
    const previous = document.title;
    document.title = [projectName, companyName].filter(Boolean).join(" - ") || "Shared photos";
    return () => {
      document.title = previous;
    };
  }, [state]);

  // Lightbox keyboard controls.
  useEffect(() => {
    if (openIndex === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenIndex(null);
      else if (e.key === "ArrowLeft") setOpenIndex((i) => (i === null ? i : (i - 1 + photos.length) % photos.length));
      else if (e.key === "ArrowRight") setOpenIndex((i) => (i === null ? i : (i + 1) % photos.length));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openIndex, photos.length]);

  async function downloadAll() {
    if (state.kind !== "ok" || zipProgress) return;
    const { data } = state;
    const chosen = data.photos.slice(0, MAX_ZIP_PHOTOS);
    setZipNote("");
    setZipProgress({ done: 0, total: chosen.length });
    try {
      const result = await zipPhotoUrls(chosen, (done, total) => setZipProgress({ done, total }));
      if (!result.blob) {
        setZipNote("These photos could not be downloaded right now. Please try again.");
        return;
      }
      const base = safeFileName(data.projectName || data.title || "") || "project";
      saveBlob(result.blob, `${base}-photos-${jamaicaToday()}.zip`);
      const parts: string[] = [];
      parts.push(
        result.failed.length === 0
          ? `${result.added} photo${result.added === 1 ? "" : "s"} downloaded.`
          : `${result.added} of ${chosen.length} photos downloaded, ${result.failed.length} failed.`,
      );
      if (data.photos.length > chosen.length) parts.push(`Only the first ${MAX_ZIP_PHOTOS} photos are included in the zip.`);
      setZipNote(parts.join(" "));
    } catch {
      setZipNote("The zip file could not be created. Please try again.");
    } finally {
      setZipProgress(null);
    }
  }

  async function saveCurrent(index: number) {
    const photo = photos[index];
    if (!photo || lightboxBusy) return;
    setLightboxBusy(true);
    const ok = await savePhotoUrl(photo, index);
    // If the browser won't let us fetch it, open the image so it can be saved from there.
    if (!ok) window.open(photo.url, "_blank", "noopener");
    setLightboxBusy(false);
  }

  const shell = "min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100";

  if (state.kind === "loading") {
    return (
      <div className={`${shell} flex items-center justify-center`}>
        <p className="text-sm text-slate-400">Loading photos...</p>
      </div>
    );
  }

  if (state.kind === "error") {
    return (
      <div className={`${shell} flex items-center justify-center p-6`}>
        <div className="text-center max-w-sm">
          <ImageIcon size={40} className="mx-auto text-slate-300 mb-3" />
          <h1 className="text-lg font-bold mb-2">{state.message}</h1>
          {state.canRetry ? (
            <button
              onClick={() => setAttempt((n) => n + 1)}
              className="mt-2 px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl"
            >
              Try again
            </button>
          ) : (
            <p className="text-sm text-slate-500">Please ask the sender for a new link.</p>
          )}
        </div>
      </div>
    );
  }

  const { data } = state;
  const open = openIndex !== null ? photos[openIndex] : null;

  return (
    <div className={shell}>
      {/* Branding */}
      <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3">
          {data.companyLogo && !logoFailed && (
            <img
              src={data.companyLogo}
              alt=""
              onError={() => setLogoFailed(true)}
              className="h-10 max-w-[120px] object-contain"
            />
          )}
          {data.companyName && <span className="font-bold text-base truncate">{data.companyName}</span>}
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-5">
        <div className="flex flex-col sm:flex-row sm:items-end gap-3 mb-5">
          <div className="flex-1 min-w-0">
            {data.projectName && <h1 className="text-xl font-bold">{data.projectName}</h1>}
            {data.title && <p className="text-sm text-slate-600 dark:text-slate-300">{data.title}</p>}
            <p className="text-xs text-slate-500 mt-1 flex items-center gap-1.5 flex-wrap">
              <span>
                {photos.length} photo{photos.length === 1 ? "" : "s"}
              </span>
              {data.expiresAt && (
                <>
                  <span>·</span>
                  <Clock size={12} />
                  <span>Available until {formatShareDate(data.expiresAt)}</span>
                </>
              )}
            </p>
          </div>
          {photos.length > 0 && (
            <button
              onClick={downloadAll}
              disabled={!!zipProgress}
              className="flex items-center justify-center gap-2 px-4 py-2.5 bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white text-sm font-semibold rounded-xl transition-colors"
            >
              <Download size={16} />
              {zipProgress ? `Zipping ${zipProgress.done} of ${zipProgress.total}...` : "Download All (Zip)"}
            </button>
          )}
        </div>

        {zipNote && (
          <div className="mb-4 rounded-xl px-4 py-3 text-sm flex items-start gap-3 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200">
            <p className="flex-1">{zipNote}</p>
            <button onClick={() => setZipNote("")} className="opacity-60 hover:opacity-100" aria-label="Dismiss">
              <X size={16} />
            </button>
          </div>
        )}

        {photos.length === 0 ? (
          <div className="text-center py-16">
            <ImageIcon size={40} className="mx-auto text-slate-300 mb-3" />
            <p className="text-slate-500 text-sm">There are no photos to show on this link.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-3">
            {photos.map((photo, index) => (
              <button
                key={photo.id}
                onClick={() => setOpenIndex(index)}
                className="relative aspect-square rounded-xl overflow-hidden bg-slate-200 dark:bg-slate-800 group text-left"
              >
                <img
                  src={photo.url}
                  alt={photo.caption || "Project photo"}
                  loading="lazy"
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                />
                {photo.caption && (
                  <span className="absolute bottom-0 left-0 right-0 px-2 py-1 text-xs text-white bg-black/50 truncate">
                    {photo.caption}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </main>

      {/* Lightbox */}
      {open && openIndex !== null && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-4" onClick={() => setOpenIndex(null)}>
          <button
            onClick={() => setOpenIndex(null)}
            className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
            aria-label="Close"
          >
            <X size={20} className="text-white" />
          </button>
          <div className="absolute top-4 left-4 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => saveCurrent(openIndex)}
              disabled={lightboxBusy}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-60 text-white text-xs font-medium transition-colors"
            >
              <Download size={14} /> Save
            </button>
            <span className="text-white/70 text-xs">
              {openIndex + 1} / {photos.length}
            </span>
          </div>
          {photos.length > 1 && (
            <>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setOpenIndex((openIndex - 1 + photos.length) % photos.length);
                }}
                className="absolute left-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
                aria-label="Previous photo"
              >
                <ChevronLeft size={24} className="text-white" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setOpenIndex((openIndex + 1) % photos.length);
                }}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
                aria-label="Next photo"
              >
                <ChevronRight size={24} className="text-white" />
              </button>
            </>
          )}
          <img
            src={open.url}
            alt={open.caption || "Project photo"}
            onClick={(e) => e.stopPropagation()}
            className="max-w-full max-h-full rounded-xl object-contain"
          />
          {open.caption && (
            <div className="absolute bottom-6 left-0 right-0 text-center px-4">
              <p className="text-white text-sm bg-black/50 inline-block px-4 py-2 rounded-full">{open.caption}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
