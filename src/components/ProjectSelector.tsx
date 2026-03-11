import React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useProjectContext } from "../context/ProjectContext";

export default function ProjectSelector() {
  const {
    projects,
    currentProjectId,
    setCurrentProjectId,
    loadingProjects,
  } = useProjectContext();

  const navigate = useNavigate();
  const location = useLocation();

  function buildProjectAwarePath(projectId: string) {
    const path = location.pathname;

    if (path === "/boq" || path.startsWith("/projects/")) {
      if (path.includes("/takeoff")) return `/projects/${projectId}/takeoff`;
      if (path.includes("/procurement")) return `/projects/${projectId}/procurement`;
      if (path.includes("/finance")) return `/projects/${projectId}/finance`;
      if (path.includes("/reports")) return `/projects/${projectId}/reports`;
      return `/projects/${projectId}/boq`;
    }

    if (path === "/takeoff") return `/projects/${projectId}/takeoff`;
    if (path === "/procurement") return `/projects/${projectId}/procurement`;
    if (path === "/finance") return `/projects/${projectId}/finance`;
    if (path === "/reports") return `/projects/${projectId}/reports`;

    return path;
  }

  function handleChange(projectId: string) {
    const nextId = projectId || null;
    setCurrentProjectId(nextId);

    if (nextId) {
      navigate(buildProjectAwarePath(nextId));
    }
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