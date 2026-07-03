import React from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ChevronLeft, Map } from "lucide-react";

export default function ProjectPlansPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
          <ChevronLeft size={18} className="text-slate-600 dark:text-slate-300"/>
        </button>
        <div className="flex-1">
          <h1 className="text-base font-bold text-slate-800 dark:text-slate-100">Plans & Drawings</h1>
        </div>
      </div>
      <div className="flex flex-col items-center justify-center py-32 gap-4">
        <Map size={48} className="text-slate-300 dark:text-slate-700"/>
        <p className="text-slate-500 dark:text-slate-400 text-sm">Plans viewer coming soon.</p>
        <p className="text-slate-400 dark:text-slate-600 text-xs">Run the SQL migrations first, then this page will be built out.</p>
      </div>
    </div>
  );
}
