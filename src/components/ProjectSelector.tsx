import React from "react";
import { useProjectContext } from "../context/ProjectContext";

export default function ProjectSelector() {
  const {
    projects,
    currentProjectId,
    setCurrentProjectId,
    loadingProjects,
  } = useProjectContext();

  return (
    <div className="flex items-center gap-2">
      <label className="text-sm text-slate-600 whitespace-nowrap">
        Project
      </label>

      <select
        value={currentProjectId ?? ""}
        onChange={(e) => setCurrentProjectId(e.target.value || null)}
        disabled={loadingProjects}
        className="h-10 min-w-[220px] rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
      >
        <option value="">
          {loadingProjects ? "Loading projects..." : "Select project"}
        </option>

        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
    </div>
  );
}