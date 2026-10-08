import React from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { resolveProjectPhotoUrls, projectPhotoBucket } from "../lib/privateFiles";
import JSZip from "jszip";
import { ArrowLeft, Camera, Plus, X, Trash2, Download, Check, Link2, Share2 } from "lucide-react";
import MobilePhotoCapture from "../components/MobilePhotoCapture";
import { BaseModal } from "../components/common/BaseModal";
import PhotoShareModal from "../components/PhotoShareModal";
import PhotoShareLinksModal from "../components/PhotoShareLinksModal";

// A zip is built in the browser's memory, so one download is capped.
const MAX_ZIP_PHOTOS = 50;

// Safe file name for inside the zip: no path characters, no leading dots.
function safeName(name: string): string {
  return name.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, " ").replace(/\s+/g, "-").replace(/^[-.]+|[-.]+$/g, "").slice(0, 80);
}

function photoExtension(photo: any, blob: Blob): string {
  const fromPath = /\.([a-z0-9]{2,5})$/i.exec(String(photo.photo_url || ""))?.[1];
  if (fromPath) return fromPath.toLowerCase();
  const fromType = /^image\/(jpeg|jpg|png|webp|gif|heic)$/i.exec(blob.type)?.[1];
  if (fromType) return fromType.toLowerCase() === "jpeg" ? "jpg" : fromType.toLowerCase();
  return "jpg";
}

// Name inside the zip: the caption if there is one, else the stored file's own name, else a generated one.
function baseNameFor(photo: any, index: number): string {
  const fromCaption = photo.caption ? safeName(String(photo.caption)) : "";
  if (fromCaption) return fromCaption;
  const stored = String(photo.photo_url || "").split("/").pop() || "";
  const fromFile = safeName(stored.replace(/\.[a-z0-9]{2,5}$/i, ""));
  return fromFile || `site-photo-${index + 1}`;
}

// Today in Jamaica time (YYYY-MM-DD) for the zip file name.
function jamaicaToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Jamaica" }).format(new Date());
}

// Photo bytes: fetch the display URL (public for gallery photos, signed for field photos); if the browser refuses that
// (CORS / network), fall back to the authenticated storage download the single-photo Save button already uses.
async function fetchPhotoBlob(photo: any): Promise<Blob> {
  if (photo.publicUrl) {
    try {
      const res = await fetch(photo.publicUrl);
      if (res.ok) return await res.blob();
    } catch {
      /* fall through to the storage download */
    }
  }
  const { data, error } = await supabase.storage.from(projectPhotoBucket(photo.photo_url)).download(photo.photo_url);
  if (error || !data) throw error || new Error("download failed");
  return data;
}

export default function ProjectPhotosPage() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const [photos, setPhotos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [projectName, setProjectName] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState<any | null>(null);
  // Select mode (for the zip download). selectedIds holds photo ids, as on FinanceTransactionsPage.
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [zipProgress, setZipProgress] = useState<{ done: number; total: number } | null>(null);
  const [zipResult, setZipResult] = useState<{ ok: boolean; message: string; failed: string[] } | null>(null);
  // Share links (a no-login link to the selected photos) and the list of this project's existing links.
  const [showShareModal, setShowShareModal] = useState(false);
  const [showLinksModal, setShowLinksModal] = useState(false);

  useEffect(() => { loadPhotos(); loadProject(); }, [projectId]);

  async function loadProject() {
    const { data } = await supabase.from("projects").select("name").eq("id", projectId!).single();
    if (data) setProjectName(data.name);
  }

  async function loadPhotos() {
    setLoading(true);
    const { data } = await supabase
      .from("project_photos")
      .select("*")
      .eq("project_id", projectId!)
      .order("created_at", { ascending: false });

    // Photos from the field app are in the private private-files bucket (signed on read); the rest are in project-photos.
    const urls = await resolveProjectPhotoUrls((data || []).map(photo => photo.photo_url));
    const photosWithUrls = (data || []).map(photo => ({ ...photo, publicUrl: urls.get(photo.photo_url) || "" }));
    setPhotos(photosWithUrls);
    // Drop selections for photos that no longer exist.
    setSelectedIds(prev => prev.filter(id => photosWithUrls.some(p => p.id === id)));
    setLoading(false);
  }

  async function deletePhoto(photo: any) {
    if (!confirm("Delete this photo? This cannot be undone.")) return;
    await supabase.from("project_photos").delete().eq("id", photo.id);
    await supabase.storage.from(projectPhotoBucket(photo.photo_url)).remove([photo.photo_url]);
    setSelectedPhoto(null);
    loadPhotos();
  }

  async function downloadPhoto(photo: any, e: React.MouseEvent) {
    e.stopPropagation();
    try {
      const { data, error } = await supabase.storage
        .from(projectPhotoBucket(photo.photo_url))
        .download(photo.photo_url);
      if (error || !data) { alert("Failed to download photo."); return; }
      const url = URL.createObjectURL(data);
      const a = document.createElement("a");
      a.href = url;
      a.download = photo.caption
        ? `${photo.caption.replace(/\s+/g, "-")}.jpg`
        : `site-photo-${photo.id}.jpg`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      alert("Failed to download photo.");
    }
  }

  function exitSelectMode() {
    setSelectMode(false);
    setSelectedIds([]);
  }

  function toggleSelected(id: string) {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  async function downloadZip() {
    if (zipProgress) return;
    const chosen = photos.filter(p => selectedIds.includes(p.id));
    if (chosen.length === 0) return;
    if (chosen.length > MAX_ZIP_PHOTOS) {
      setZipResult({ ok: false, message: `You can download up to ${MAX_ZIP_PHOTOS} photos at a time. Please deselect ${chosen.length - MAX_ZIP_PHOTOS} and try again.`, failed: [] });
      return;
    }
    setZipResult(null);
    setZipProgress({ done: 0, total: chosen.length });
    const zip = new JSZip();
    const used = new Set<string>();
    const failed: string[] = [];
    let done = 0;
    let next = 0;
    // A few photos at a time; each failure is recorded and skipped.
    const worker = async () => {
      while (next < chosen.length) {
        const index = next++;
        const photo = chosen[index];
        try {
          const blob = await fetchPhotoBlob(photo);
          const ext = photoExtension(photo, blob);
          const base = baseNameFor(photo, index);
          let name = `${base}.${ext}`;
          for (let n = 2; used.has(name.toLowerCase()); n++) name = `${base}-${n}.${ext}`;
          used.add(name.toLowerCase());
          zip.file(name, blob);
        } catch {
          failed.push(photo.caption || baseNameFor(photo, index));
        }
        done++;
        setZipProgress({ done, total: chosen.length });
      }
    };
    try {
      await Promise.all(Array.from({ length: Math.min(4, chosen.length) }, worker));
      const added = chosen.length - failed.length;
      if (added === 0) {
        setZipResult({ ok: false, message: "None of the selected photos could be downloaded.", failed });
        return;
      }
      const blob = await zip.generateAsync({ type: "blob", compression: "STORE" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${safeName(projectName) || "project"}-photos-${jamaicaToday()}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setZipResult(failed.length === 0
        ? { ok: true, message: `${added} photo${added === 1 ? "" : "s"} downloaded.`, failed: [] }
        : { ok: false, message: `${added} of ${chosen.length} photos downloaded, ${failed.length} failed.`, failed });
      if (failed.length === 0) exitSelectMode();
    } catch {
      setZipResult({ ok: false, message: "The zip file could not be created. Please try again.", failed: [] });
    } finally {
      setZipProgress(null);
    }
  }

  const overLimit = selectedIds.length > MAX_ZIP_PHOTOS;

  return (
    <div className={`min-h-screen bg-slate-50 dark:bg-slate-950 p-4 max-w-2xl mx-auto${selectMode ? " pb-36" : ""}`}>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate(`/projects/${projectId}`)}
          className="p-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
          <ArrowLeft size={18} className="text-slate-600 dark:text-slate-300"/>
        </button>
        <div>
          <h1 className="text-lg font-bold text-slate-800 dark:text-slate-100">Site Photos</h1>
          <p className="text-xs text-slate-500">{projectName}</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {photos.length > 0 && (
            <button onClick={() => (selectMode ? exitSelectMode() : setSelectMode(true))}
              className="px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-sm font-semibold rounded-xl transition-colors hover:bg-slate-50 dark:hover:bg-slate-700">
              {selectMode ? "Cancel" : "Select"}
            </button>
          )}
          <button onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold rounded-xl transition-colors">
            <Plus size={16}/> Add Photos
          </button>
        </div>
      </div>

      {/* Shared links */}
      {projectId && (
        <div className="mb-4 -mt-3">
          <button onClick={() => setShowLinksModal(true)}
            className="flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-blue-500 transition-colors">
            <Link2 size={14}/> Shared links
          </button>
        </div>
      )}

      {/* Zip result */}
      {zipResult && (
        <div className={`mb-4 rounded-xl px-4 py-3 text-sm flex items-start gap-3 ${zipResult.ok ? "bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-300" : "bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-300"}`}>
          <div className="flex-1">
            <p className="font-medium">{zipResult.message}</p>
            {zipResult.failed.length > 0 && (
              <p className="text-xs mt-1 opacity-80">Could not download: {zipResult.failed.join(", ")}</p>
            )}
          </div>
          <button onClick={() => setZipResult(null)} className="opacity-60 hover:opacity-100" aria-label="Dismiss"><X size={16}/></button>
        </div>
      )}

      {/* Photos grid */}
      {loading ? (
        <div className="text-center py-12 text-slate-400 text-sm">Loading...</div>
      ) : photos.length === 0 ? (
        <div className="text-center py-12">
          <Camera size={40} className="mx-auto text-slate-300 mb-3"/>
          <p className="text-slate-500 text-sm">No photos yet</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {photos.map(photo => {
            const isSelected = selectedIds.includes(photo.id);
            return (
            <div key={photo.id} className={`relative rounded-2xl overflow-hidden bg-slate-200 dark:bg-slate-800 group${selectMode && isSelected ? " ring-4 ring-green-500" : ""}`}>
              {/* Photo */}
              <div onClick={() => (selectMode ? toggleSelected(photo.id) : setSelectedPhoto(photo))} className="aspect-square cursor-pointer">
                <img src={photo.publicUrl} alt={photo.caption || "Site photo"}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"/>
              </div>
              {/* Selection circle (select mode only) */}
              {selectMode && (
                <button onClick={() => toggleSelected(photo.id)} aria-label={isSelected ? "Deselect photo" : "Select photo"}
                  className={`absolute top-2 left-2 w-7 h-7 rounded-full flex items-center justify-center border-2 transition-colors ${isSelected ? "bg-green-600 border-green-600 text-white" : "bg-black/30 border-white text-transparent"}`}>
                  <Check size={16}/>
                </button>
              )}
              {/* Caption */}
              {photo.caption && (
                <div className="px-2 py-1 bg-white dark:bg-slate-900">
                  <p className="text-xs text-slate-500 truncate">{photo.caption}</p>
                </div>
              )}
              {/* Action buttons (hidden in select mode so a tap can't delete by accident) */}
              {!selectMode && (
              <div className="flex border-t border-slate-100 dark:border-slate-800">
                <button onClick={(e) => downloadPhoto(photo, e)}
                  className="flex-1 flex items-center justify-center gap-1 py-2 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-500 hover:text-green-500 transition-colors text-xs font-medium">
                  <Download size={13}/> Save
                </button>
                <div className="w-px bg-slate-100 dark:bg-slate-800"/>
                <button onClick={() => deletePhoto(photo)}
                  className="flex-1 flex items-center justify-center gap-1 py-2 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-500 hover:text-red-500 transition-colors text-xs font-medium">
                  <Trash2 size={13}/> Delete
                </button>
              </div>
              )}
            </div>
            );
          })}
        </div>
      )}

      {/* Select-mode action bar */}
      {selectMode && selectedIds.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-40 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-700 px-4 py-3">
          <div className="max-w-2xl mx-auto flex flex-wrap items-center gap-3">
            <div className="flex-1 min-w-[8rem]">
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                {zipProgress ? `Zipping ${zipProgress.done} of ${zipProgress.total}...` : `${selectedIds.length} selected`}
              </p>
              {overLimit && !zipProgress && (
                <p className="text-xs text-red-500">Maximum {MAX_ZIP_PHOTOS} photos at a time - deselect {selectedIds.length - MAX_ZIP_PHOTOS}.</p>
              )}
            </div>
            <button onClick={exitSelectMode} disabled={!!zipProgress}
              className="px-4 py-2 text-sm font-semibold rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 disabled:opacity-50">
              Cancel
            </button>
            <button onClick={() => setShowShareModal(true)} disabled={!!zipProgress || overLimit}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold rounded-xl transition-colors">
              <Share2 size={16}/> Share Link
            </button>
            <button onClick={downloadZip} disabled={!!zipProgress || overLimit}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-semibold rounded-xl transition-colors">
              <Download size={16}/> Download Zip
            </button>
          </div>
        </div>
      )}

      {/* Lightbox */}
      {selectedPhoto && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-4"
          onClick={() => setSelectedPhoto(null)}>
          {/* Close */}
          <button onClick={() => setSelectedPhoto(null)}
            className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors">
            <X size={20} className="text-white"/>
          </button>
          {/* Action buttons */}
          <div className="absolute top-4 left-4 flex gap-2" onClick={e => e.stopPropagation()}>
            <button onClick={(e) => downloadPhoto(selectedPhoto, e)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-medium transition-colors">
              <Download size={14}/> Download
            </button>
            <button onClick={() => deletePhoto(selectedPhoto)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/80 hover:bg-red-600 text-white text-xs font-medium transition-colors">
              <Trash2 size={14}/> Delete
            </button>
          </div>
          <img src={selectedPhoto.publicUrl} alt={selectedPhoto.caption || "Site photo"}
            className="max-w-full max-h-full rounded-xl object-contain"/>
          {selectedPhoto.caption && (
            <div className="absolute bottom-6 left-0 right-0 text-center">
              <p className="text-white text-sm bg-black/50 inline-block px-4 py-2 rounded-full">
                {selectedPhoto.caption}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Share link modals */}
      {projectId && (
        <>
          <PhotoShareModal
            open={showShareModal}
            projectId={projectId}
            projectName={projectName}
            photoIds={photos.filter(p => selectedIds.includes(p.id)).map(p => p.id)}
            onClose={(created) => { setShowShareModal(false); if (created) exitSelectMode(); }}
          />
          <PhotoShareLinksModal open={showLinksModal} projectId={projectId} onClose={() => setShowLinksModal(false)} />
        </>
      )}

      {/* Add Photos Modal */}
      {projectId && (
        <BaseModal isOpen={showAddModal} onClose={() => setShowAddModal(false)} title="Add Photos" size="lg">
          <MobilePhotoCapture
            projectId={projectId}
            onSuccess={() => { setShowAddModal(false); loadPhotos(); }}
            onCancel={() => setShowAddModal(false)}
          />
        </BaseModal>
      )}
    </div>
  );
}
