import React, { useState, useRef } from "react";
import { Camera, Upload, X, Check } from "lucide-react";
import { uploadProjectPhoto, type UploadPhotoData } from "../lib/photos";

interface MobilePhotoCaptureProps {
  projectId: string;
  onSuccess?: () => void;
  onCancel?: () => void;
}

interface PhotoPreview {
  file: File;
  preview: string;
  caption: string;
}

export default function MobilePhotoCapture({
  projectId,
  onSuccess,
  onCancel,
}: MobilePhotoCaptureProps) {
  const [photos, setPhotos] = useState<PhotoPreview[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const newPhotos: PhotoPreview[] = [];

    Array.from(files).forEach((file) => {
      if (file.type.startsWith("image/")) {
        const reader = new FileReader();
        reader.onload = (event) => {
          if (event.target?.result) {
            newPhotos.push({
              file,
              preview: event.target.result as string,
              caption: "",
            });

            if (newPhotos.length === files.length) {
              setPhotos((prev) => [...prev, ...newPhotos]);
            }
          }
        };
        reader.readAsDataURL(file);
      }
    });

    if (fileInputRef.current) fileInputRef.current.value = "";
    if (cameraInputRef.current) cameraInputRef.current.value = "";
  }

  function handleRemovePhoto(index: number) {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
  }

  function handleUpdateCaption(index: number, caption: string) {
    setPhotos((prev) =>
      prev.map((photo, i) => (i === index ? { ...photo, caption } : photo))
    );
  }

  async function handleUpload() {
    if (photos.length === 0) return;

    setError(null);
    setUploading(true);

    try {
      const uploadPromises = photos.map((photo) => {
        const data: UploadPhotoData = {
          project_id: projectId,
          caption: photo.caption || undefined,
        };
        return uploadProjectPhoto(photo.file, data);
      });

      const results = await Promise.all(uploadPromises);

      const hasErrors = results.some((result) => !result.success);

      if (hasErrors) {
        setError("Some photos failed to upload. Please try again.");
      } else {
        setPhotos([]);
        if (onSuccess) {
          onSuccess();
        }
      }
    } catch (e) {
      setError("Failed to upload photos. Please try again.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-4">
      {photos.length === 0 ? (
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => cameraInputRef.current?.click()}
            className="w-full p-6 rounded-xl border-2 border-dashed border-slate-700 bg-slate-900 hover:border-blue-500 hover:bg-slate-800 transition-all group"
          >
            <div className="flex flex-col items-center gap-3">
              <div className="w-14 h-14 rounded-full bg-blue-500/20 flex items-center justify-center group-hover:bg-blue-500/30 transition">
                <Camera className="w-7 h-7 text-blue-400" />
              </div>
              <div className="text-center">
                <div className="text-base font-medium text-slate-200">Take Photo</div>
                <div className="text-sm text-slate-500 mt-1">Use camera to capture</div>
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="w-full p-6 rounded-xl border-2 border-dashed border-slate-700 bg-slate-900 hover:border-blue-500 hover:bg-slate-800 transition-all group"
          >
            <div className="flex flex-col items-center gap-3">
              <div className="w-14 h-14 rounded-full bg-green-500/20 flex items-center justify-center group-hover:bg-green-500/30 transition">
                <Upload className="w-7 h-7 text-green-400" />
              </div>
              <div className="text-center">
                <div className="text-base font-medium text-slate-200">Choose Photos</div>
                <div className="text-sm text-slate-500 mt-1">Select from gallery</div>
              </div>
            </div>
          </button>

          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            onChange={handleFileSelect}
            className="hidden"
          />

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleFileSelect}
            className="hidden"
          />
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium text-slate-300">
              {photos.length} {photos.length === 1 ? "Photo" : "Photos"} Selected
            </div>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="text-sm text-blue-400 hover:text-blue-300 font-medium"
            >
              + Add More
            </button>
          </div>

          <div className="space-y-3 max-h-[60vh] overflow-y-auto">
            {photos.map((photo, index) => (
              <div
                key={index}
                className="rounded-xl border border-slate-700 bg-slate-900 overflow-hidden"
              >
                <div className="relative aspect-video">
                  <img
                    src={photo.preview}
                    alt={`Preview ${index + 1}`}
                    className="w-full h-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => handleRemovePhoto(index)}
                    className="absolute top-2 right-2 w-8 h-8 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center transition"
                  >
                    <X className="w-5 h-5 text-white" />
                  </button>
                </div>
                <div className="p-3">
                  <input
                    type="text"
                    value={photo.caption}
                    onChange={(e) => handleUpdateCaption(index, e.target.value)}
                    placeholder="Add caption (optional)..."
                    className="w-full px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>
            ))}
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleFileSelect}
            className="hidden"
          />
        </div>
      )}

      {error && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/50 text-red-400 text-sm">
          {error}
        </div>
      )}

      <div className="flex gap-3 pt-2">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 px-6 py-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium text-base transition-colors"
          >
            Cancel
          </button>
        )}
        {photos.length > 0 && (
          <button
            type="button"
            onClick={handleUpload}
            disabled={uploading}
            className="flex-1 px-6 py-4 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:bg-slate-700 disabled:text-slate-500 text-white font-medium text-base transition-colors flex items-center justify-center gap-2"
          >
            {uploading ? (
              "Uploading..."
            ) : (
              <>
                <Check className="w-5 h-5" />
                Upload {photos.length} {photos.length === 1 ? "Photo" : "Photos"}
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}
