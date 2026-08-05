// src/components/PhotoCropModal.tsx — Lightweight crop-before-upload modal.
//
// SmartImageCapture.tsx / UniversalImageCapture.tsx already wrap crop
// libraries (react-easy-crop / react-image-crop respectively), but both are
// tightly coupled to document-scanning concerns (paper edge detection, OCR
// fill ratio, camera capture) that don't apply to a plain "crop a headshot"
// use case — reusing either wholesale would drag in a lot of unrelated UI.
// This uses react-easy-crop directly instead, since it's already a
// dependency (no new package added) and its API is a good fit for a simple
// fixed-aspect photo crop with pan/zoom.
import React, { useCallback, useState } from "react";
import Cropper, { type Area, type Point } from "react-easy-crop";
import { X, Check, ZoomIn } from "lucide-react";

interface PhotoCropModalProps {
  imageSrc: string;
  aspect?: number; // width / height — defaults to the ID card photo slot's 65:80
  onCancel: () => void;
  onCropDone: (blob: Blob) => void;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

async function getCroppedBlob(imageSrc: string, area: Area): Promise<Blob> {
  const img = await loadImage(imageSrc);
  const canvas = document.createElement("canvas");
  canvas.width = area.width;
  canvas.height = area.height;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, area.x, area.y, area.width, area.height, 0, 0, area.width, area.height);
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("Crop failed")), "image/png", 0.92);
  });
}

export default function PhotoCropModal({ imageSrc, aspect = 65 / 80, onCancel, onCropDone }: PhotoCropModalProps) {
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedArea, setCroppedArea] = useState<Area | null>(null);
  const [saving, setSaving] = useState(false);

  const onCropCompleteInternal = useCallback((_: Area, areaPixels: Area) => {
    setCroppedArea(areaPixels);
  }, []);

  async function handleSave() {
    if (!croppedArea) return;
    setSaving(true);
    try {
      const blob = await getCroppedBlob(imageSrc, croppedArea);
      onCropDone(blob);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl dark:bg-gray-900">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3 dark:border-white/10">
          <div className="text-sm font-semibold text-slate-800 dark:text-white">Crop Photo</div>
          <button onClick={onCancel} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10">
            <X size={18} />
          </button>
        </div>

        <div className="relative h-72 w-full bg-slate-900">
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            aspect={aspect}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropCompleteInternal}
          />
        </div>

        <div className="flex items-center gap-3 px-5 py-3">
          <ZoomIn size={14} className="flex-shrink-0 text-slate-400" />
          <input
            type="range" min={1} max={3} step={0.01} value={zoom}
            onChange={e => setZoom(Number(e.target.value))}
            className="w-full accent-cyan-600"
          />
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-5 py-3 dark:border-white/10">
          <button onClick={onCancel} disabled={saving}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-60 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5">
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving || !croppedArea}
            className="flex items-center gap-1.5 rounded-lg bg-cyan-600 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-700 disabled:opacity-60">
            <Check size={14} />
            {saving ? "Saving..." : "Use Photo"}
          </button>
        </div>
      </div>
    </div>
  );
}
