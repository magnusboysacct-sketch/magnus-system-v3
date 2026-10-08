import { useEffect, useState } from "react";
import {
  SHARE_EXPIRY_DAYS,
  buildSharedPhotosUrl,
  createPhotoShareLink,
  formatShareDate,
  type PhotoShareLink,
  type ShareExpiryDays,
} from "../lib/photoShare";
import { buildMailtoUrl, buildWhatsAppUrl } from "../lib/portalShare";

interface Props {
  open: boolean;
  projectId: string;
  projectName: string;
  photoIds: string[];
  // created is true when a link was made, so the caller can leave select mode.
  onClose: (created: boolean) => void;
}

// Creates a share link for exactly the photos passed in, then offers Copy Link / WhatsApp / Email (the same three options
// as the client-portal link dialog on ClientsPage).
export default function PhotoShareModal({ open, projectId, projectName, photoIds, onClose }: Props) {
  const [title, setTitle] = useState("");
  const [days, setDays] = useState<ShareExpiryDays>(7);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [link, setLink] = useState<PhotoShareLink | null>(null);
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitle("");
    setDays(7);
    setCreating(false);
    setError("");
    setLink(null);
    setCopied(false);
    setCopyFailed(false);
  }, [open]);

  if (!open) return null;

  async function create() {
    if (creating) return;
    setCreating(true);
    setError("");
    try {
      setLink(await createPhotoShareLink({ projectId, photoIds, title, days }));
    } catch (e: any) {
      setError(e?.message || "The link could not be created.");
    } finally {
      setCreating(false);
    }
  }

  const url = link ? buildSharedPhotosUrl(link.token) : "";
  const until = link ? formatShareDate(link.expires_at) : "";
  const heading = link?.title || "Project photos";
  const message = link
    ? `${heading} - ${projectName}\n\nView the photos here (no login needed):\n${url}\n\nThis link is available until ${until}.`
    : "";

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setCopyFailed(false);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopyFailed(true);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto">
        {!link ? (
          <>
            <div className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-1">Share a link to these photos</div>
            <p className="text-sm text-slate-500 mb-4">
              {photoIds.length} photo{photoIds.length === 1 ? "" : "s"} selected. Anyone with the link can view them, no login
              needed. You can switch the link off any time from Shared Links.
            </p>

            <label className="block text-xs font-semibold text-slate-500 mb-1">Title (optional)</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={100}
              placeholder="e.g. Slab pour progress"
              className="w-full mb-4 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-800 dark:text-slate-100"
            />

            <div className="block text-xs font-semibold text-slate-500 mb-1">Link works for</div>
            <div className="flex gap-2 mb-4">
              {SHARE_EXPIRY_DAYS.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDays(d)}
                  className={`flex-1 py-2 rounded-xl text-sm font-semibold border transition-colors ${
                    days === d
                      ? "bg-blue-600 border-blue-600 text-white"
                      : "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200"
                  }`}
                >
                  {d} days
                </button>
              ))}
            </div>

            {error && <p className="text-sm text-red-500 mb-3">{error}</p>}

            <div className="flex gap-2">
              <button
                onClick={() => onClose(false)}
                disabled={creating}
                className="flex-1 py-2.5 text-sm font-semibold rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={create}
                disabled={creating || photoIds.length === 0}
                className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold rounded-xl transition-colors"
              >
                {creating ? "Creating..." : "Create Link"}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-2">✅ Link ready</div>
            <p className="text-sm text-slate-500 mb-3">
              {link.photo_ids.length} photo{link.photo_ids.length === 1 ? "" : "s"} shared. The link works until{" "}
              <strong>{until}</strong>.
            </p>
            <div className="bg-slate-100 dark:bg-slate-800 rounded-xl p-3 text-xs text-blue-500 break-all font-mono mb-4 select-all">
              {url}
            </div>
            {copyFailed && (
              <p className="text-xs text-amber-600 mb-3">Could not copy automatically - press and hold the link above to copy it.</p>
            )}
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={copy}
                className={`flex-1 py-2.5 text-white text-sm font-semibold rounded-xl transition-all ${
                  copied ? "bg-green-600" : "bg-blue-600 hover:bg-blue-700"
                }`}
              >
                {copied ? "✓ Copied!" : "📋 Copy Link"}
              </button>
              <a
                href={buildWhatsAppUrl("", message)}
                target="_blank"
                rel="noreferrer"
                className="flex-1 py-2.5 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold rounded-xl transition-colors text-center no-underline flex items-center justify-center"
              >
                💬 WhatsApp
              </a>
              <a
                href={buildMailtoUrl("", `${heading} - ${projectName}`, message)}
                className="flex-1 py-2.5 bg-slate-600 hover:bg-slate-700 text-white text-sm font-semibold rounded-xl transition-colors text-center no-underline flex items-center justify-center"
              >
                ✉️ Email
              </a>
            </div>
            <button
              onClick={() => onClose(true)}
              className="w-full mt-2 py-2 text-slate-500 text-xs hover:text-slate-300 transition-colors"
            >
              Close
            </button>
          </>
        )}
      </div>
    </div>
  );
}
