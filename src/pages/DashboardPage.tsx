import React from "react";
import { useProjectContext } from "../context/ProjectContext";
import { theme } from "../lib/theme";

export default function DashboardPage() {
  const { currentProjectId, currentProject } = useProjectContext();

  if (!currentProjectId) {
  return (
    <div className={`p-6 text-sm ${theme.text.muted}`}>
      Please select a project from the top bar to view the Dashboard.
    </div>
  );
}

  return (
    <div className="p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className={`text-2xl font-semibold ${theme.text.primary}`}>Dashboard</h1>
          <p className={`${theme.text.muted} mt-1`}>Projects summary, quick stats, recent activity.</p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button className={`px-3 py-2 rounded-xl ${theme.button.primary} text-sm`}>
            Primary Action
          </button>
          <button className={`px-3 py-2 rounded-xl ${theme.button.secondary} text-sm`}>
            Secondary
          </button>
        </div>
      </div>

      {currentProject && (
        <div className={`mt-4 text-sm ${theme.text.muted}`}>
          Project: <span className={`font-semibold ${theme.text.primary}`}>{currentProject.name}</span>
        </div>
      )}

      <div className={`mt-6 rounded-2xl border ${theme.border.base} ${theme.surface.muted} p-4`}>
        <p className={`text-sm ${theme.text.secondary}`}>
          Skeleton ready. Next we wire Supabase tables + live CRUD.
        </p>
      </div>
    </div>
  );
}