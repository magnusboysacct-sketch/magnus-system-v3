import React from "react";
import { useProjectContext } from "../context/ProjectContext";
import { useSwitchProject } from "../lib/useSwitchProject";

// A plain dropdown for the selected project. Changing it goes through useSwitchProject, the same as the sidebar picker: asks about unsaved changes,
// sets the selector and moves the address to the same page for the new project.
export default function ProjectSelector() {
  const { projects, currentProjectId, loadingProjects } = useProjectContext();
  const switchProject = useSwitchProject();

  function handleChange(projectId: string) {
    switchProject(projectId || null);
  }

  return (
    <div className="flex items-center gap-2">
      <label className="text-sm text-slate-600 dark:text-slate-300 whitespace-nowrap">
        Project
      </label>

      <select
        value={currentProjectId ?? ""}
        onChange={(e) => handleChange(e.target.value)}
        disabled={loadingProjects}
        className="h-10 min-w-[220px] rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-sm text-slate-800 dark:text-slate-100 shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
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