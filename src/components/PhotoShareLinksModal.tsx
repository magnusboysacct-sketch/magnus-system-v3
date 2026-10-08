import { useEffect, useState } from "react";
import {
  buildSharedPhotosUrl,
  formatShareDate,
  listPhotoShareLinks,
  revokePhotoShareLink,
  shareLinkStatus,
  type PhotoShareLink,
} from "../lib/photoShare";

interface Props {
  open: boolean;
  projectId: string;
  onClose: () => void;
}

const STATUS_STYLE = {
  active: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
  expired: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  revoked: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
} as const;

// This project's photo share links, with a Revoke button on each live one.
export default function PhotoShareLinksModal({ open, projectId, onClose }: Props) {
  const [links, setLinks] = useState<PhotoShareLink[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError("");
    try {
      setLinks(await listPhotoShareLinks(projectId));
    } catch (e: any) {
      setError(e?.message || "Shared links could not be loaded.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (open) load();
  }, [open, projectId]);

  if (!open) return null;

  async function revoke(link: PhotoShareLink) {
    if (!confirm("Switch this link off? Anyone who has it will no longer be able to see the photos.")) return;
    setBusyId(link.id);
    setError("");
    try {
      await revokePhotoShareLink(link.id);
      await load();
    } catch (e: any) {
      setError(e?.message || "The link could not be revoked.");
    } finally {
      setBusyId(null);
    }
  }

  async function copy(link: PhotoShareLink) {
    try {
      await navigator.clipboard.writeText(buildSharedPhotosUrl(link.token));
      setCopiedId(link.id);
      setTimeout(() => setCopiedId((id) => (id === link.id ? null : id)), 2000);
    } catch {
      setError("Could not copy the link automatically.");
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 w-full max-w-md shadow-2xl max-h-[90vh] flex flex-col">
        <div className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-3">Shared links</div>

        {error && <p className="text-sm text-red-500 mb-3">{error}</p>}

        <div className="flex-1 overflow-y-auto -mx-1 px-1">
          {loading ? (
            <p className="text-sm text-slate-400 text-center py-6">Loading...</p>
          ) : links.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-6">
              No links yet. Tap Select, pick some photos, then Share Link.
            </p>
          ) : (
            <ul className="space-y-3">
              {links.map((link) => {
                const status = shareLinkStatus(link);
                return (
                  <li key={link.id} className="rounded-xl border border-slate-200 dark:border-slate-700 p-3">
                    <div className="flex items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">
                          {link.title || "Untitled"}
                        </p>
                        <p className="text-xs text-slate-500">
                          {link.photo_ids.length} photo{link.photo_ids.length === 1 ? "" : "s"} · created{" "}
                          {formatShareDate(link.created_at)}
                        </p>
                        <p className="text-xs text-slate-500">
                          {status === "revoked"
                            ? `switched off ${formatShareDate(link.revoked_at)}`
                            : `${status === "expired" ? "expired" : "expires"} ${formatShareDate(link.expires_at)}`}
                        </p>
                      </div>
                      <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full capitalize ${STATUS_STYLE[status]}`}>
                        {status}
                      </span>
                    </div>
                    {status === "active" && (
                      <div className="flex gap-2 mt-3">
                        <button
                          onClick={() => copy(link)}
                          className="flex-1 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200"
                        >
                          {copiedId === link.id ? "✓ Copied" : "📋 Copy Link"}
                        </button>
                        <button
                          onClick={() => revoke(link)}
                          disabled={busyId === link.id}
                          className="flex-1 py-1.5 text-xs font-semibold rounded-lg border border-red-200 dark:border-red-900 text-red-600 disabled:opacity-50"
                        >
                          {busyId === link.id ? "Revoking..." : "Revoke"}
                        </button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <button onClick={onClose} className="w-full mt-3 py-2 text-slate-500 text-xs hover:text-slate-300 transition-colors">
          Close
        </button>
      </div>
    </div>
  );
}
