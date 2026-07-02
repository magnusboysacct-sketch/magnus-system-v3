import { useParams, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { ArrowLeft, Camera, Plus, X, Trash2, Download } from "lucide-react";
import MobilePhotoCapture from "../components/MobilePhotoCapture";
import { BaseModal } from "../components/common/BaseModal";

export default function ProjectPhotosPage() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const [photos, setPhotos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [projectName, setProjectName] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState<any | null>(null);

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

    const photosWithUrls = (data || []).map(photo => {
      const { data: urlData } = supabase.storage.from("project-photos").getPublicUrl(photo.photo_url);
      return { ...photo, publicUrl: urlData.publicUrl };
    });
    setPhotos(photosWithUrls);
    setLoading(false);
  }

  async function deletePhoto(photo: any) {
    if (!confirm("Delete this photo? This cannot be undone.")) return;
    await supabase.from("project_photos").delete().eq("id", photo.id);
    await supabase.storage.from("project-photos").remove([photo.photo_url]);
    setSelectedPhoto(null);
    loadPhotos();
  }

  async function downloadPhoto(photo: any) {
    const a = document.createElement("a");
    a.href = photo.publicUrl;
    a.download = `site-photo-${photo.id}.jpg`;
    a.target = "_blank";
    a.click();
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-4 max-w-2xl mx-auto">
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
        <button onClick={() => setShowAddModal(true)}
          className="ml-auto flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold rounded-xl transition-colors">
          <Plus size={16}/> Add Photos
        </button>
      </div>

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
          {photos.map(photo => (
            <div key={photo.id} className="relative rounded-2xl overflow-hidden bg-slate-200 dark:bg-slate-800 group">
              {/* Photo */}
              <div onClick={() => setSelectedPhoto(photo)} className="aspect-square cursor-pointer">
                <img src={photo.publicUrl} alt={photo.caption || "Site photo"}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"/>
              </div>
              {/* Caption */}
              {photo.caption && (
                <div className="px-2 py-1 bg-white dark:bg-slate-900">
                  <p className="text-xs text-slate-500 truncate">{photo.caption}</p>
                </div>
              )}
              {/* Action buttons */}
              <div className="flex border-t border-slate-100 dark:border-slate-800">
                <button onClick={() => downloadPhoto(photo)}
                  className="flex-1 flex items-center justify-center gap-1 py-2 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-500 hover:text-green-500 transition-colors text-xs font-medium">
                  <Download size={13}/> Save
                </button>
                <div className="w-px bg-slate-100 dark:bg-slate-800"/>
                <button onClick={() => deletePhoto(photo)}
                  className="flex-1 flex items-center justify-center gap-1 py-2 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-500 hover:text-red-500 transition-colors text-xs font-medium">
                  <Trash2 size={13}/> Delete
                </button>
              </div>
            </div>
          ))}
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
            <button onClick={() => downloadPhoto(selectedPhoto)}
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
