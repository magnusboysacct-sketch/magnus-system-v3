import React from "react";

export default function DashboardPage() {
  return (
    <div className="p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <p className="text-slate-400 mt-1">Projects summary, quick stats, recent activity.</p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button className="px-3 py-2 rounded-xl bg-slate-800/60 hover:bg-slate-800 text-sm">
            Primary Action
          </button>
          <button className="px-3 py-2 rounded-xl bg-slate-800/30 hover:bg-slate-800/50 text-sm">
            Secondary
          </button>
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/30 p-4">
        <p className="text-sm text-slate-300">
          Skeleton ready. Next we wire Supabase tables + live CRUD.
        </p>
      </div>
    </div>
  );
}
