// The one way to change the selected project from the screen (sidebar picker and ProjectSelector): ask first if something is unsaved,
// set the selector, and move the address to the same page for the new project (rules in projectScope.ts).
import { useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useProjectContext } from "../context/ProjectContext";
import { addressAfterSwitch } from "./projectScope";
import { switchWarning } from "./unsavedChanges";

export function useSwitchProject(): (projectId: string | null) => boolean {
  const { currentProjectId, setCurrentProjectId } = useProjectContext();
  const navigate = useNavigate();
  const location = useLocation();
  return useCallback((projectId: string | null) => {
    if ((projectId || null) === currentProjectId) return false;
    const warning = projectId ? switchWarning() : null;
    if (warning && !window.confirm(warning)) return false;
    setCurrentProjectId(projectId || null);
    if (projectId) {
      const next = addressAfterSwitch(location.pathname, location.search, location.hash, projectId);
      if (next) navigate(next);
    }
    return true;
  }, [currentProjectId, setCurrentProjectId, navigate, location.pathname, location.search, location.hash]);
}
