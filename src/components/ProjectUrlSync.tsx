// Opening an address for a project (a link, Back / Forward, a bookmark) sets the project selector to that project, so the selector and the page never disagree.
// It follows the address and acts only when the address's project changes (see urlSyncDecision), so a switch made from the selector is not undone.
import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { useProjectContext } from "../context/ProjectContext";
import { projectIdFromPath, urlSyncDecision } from "../lib/projectScope";

export default function ProjectUrlSync() {
  const { pathname } = useLocation();
  const { projects, currentProjectId, loadingProjects, setCurrentProjectId } = useProjectContext();
  const lastHandled = useRef<string | null>(null);
  const urlProjectId = projectIdFromPath(pathname);

  useEffect(() => {
    const d = urlSyncDecision({ urlProjectId, lastHandled: lastHandled.current, currentProjectId, projectIds: projects.map((p) => p.id), loading: loadingProjects });
    if (d.action === "wait") return;
    lastHandled.current = urlProjectId;
    if (d.action === "select") setCurrentProjectId(d.projectId);
  }, [urlProjectId, currentProjectId, projects, loadingProjects, setCurrentProjectId]);

  return null;
}
