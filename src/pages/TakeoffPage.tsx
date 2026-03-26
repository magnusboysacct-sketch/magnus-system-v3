import React, { useRef } from "react";
import { FolderOpen } from "lucide-react";

export default function TakeoffPage() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  return (
    <div className="h-screen bg-slate-950 text-white flex flex-col">
      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf,image/*"
        className="hidden"
      />

      <div className="relative flex-1 overflow-hidden">
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="pointer-events-auto w-[340px] rounded-2xl border border-slate-800 bg-slate-900/70 p-6 text-center shadow-xl">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-700 bg-slate-800/80">
              <FolderOpen className="h-5 w-5 text-slate-300" />
            </div>

            <div className="text-sm font-semibold text-slate-100">
              No drawing loaded
            </div>

            <div className="mt-2 text-sm text-slate-400">
              Upload a PDF or image to begin measuring.
            </div>

            <div className="mt-4">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-medium text-slate-100 hover:bg-slate-700"
              >
                Upload Drawing
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}