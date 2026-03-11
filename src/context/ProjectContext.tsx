import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { supabase } from "../lib/supabase";

export type ProjectOption = {
  id: string;
  name: string;
  client_id?: string | null;
  status?: string | null;
};

type ProjectContextType = {
  projects: ProjectOption[];
  currentProjectId: string | null;
  currentProject: ProjectOption | null;
  loadingProjects: boolean;
  setCurrentProjectId: (projectId: string | null) => void;
  refreshProjects: () => Promise<void>;
};

const ProjectContext = createContext<ProjectContextType | undefined>(undefined);

const STORAGE_KEY = "magnus_current_project_id";

export function ProjectProvider({ children }: { children: React.ReactNode }) {
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [currentProjectId, setCurrentProjectIdState] = useState<string | null>(null);
  const [loadingProjects, setLoadingProjects] = useState(true);

  const loadProjects = useCallback(async () => {
    setLoadingProjects(true);

    const { data, error } = await supabase
      .from("projects")
      .select("id, name, client_id, status")
      .order("name", { ascending: true });

    if (error) {
      console.error("Failed to load projects:", error);
      setProjects([]);
      setLoadingProjects(false);
      return;
    }

    const rows: ProjectOption[] = (data || []).map((p: any) => ({
      id: p.id,
      name: p.name,
      client_id: p.client_id ?? null,
      status: p.status ?? null,
    }));

    setProjects(rows);
    setLoadingProjects(false);

    const saved = localStorage.getItem(STORAGE_KEY);

    if (saved) {
      const exists = rows.some((p) => p.id === saved);
      if (exists) {
        setCurrentProjectIdState(saved);
        return;
      }
    }

    if (!saved && rows.length > 0) {
      const firstId = rows[0].id;
      setCurrentProjectIdState(firstId);
      localStorage.setItem(STORAGE_KEY, firstId);
      return;
    }

    if (rows.length === 0) {
      setCurrentProjectIdState(null);
      localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  const setCurrentProjectId = useCallback((projectId: string | null) => {
    setCurrentProjectIdState(projectId);
    if (projectId) {
      localStorage.setItem(STORAGE_KEY, projectId);
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  const currentProject = useMemo(() => {
    return projects.find((p) => p.id === currentProjectId) || null;
  }, [projects, currentProjectId]);

  const value = useMemo<ProjectContextType>(
    () => ({
      projects,
      currentProjectId,
      currentProject,
      loadingProjects,
      setCurrentProjectId,
      refreshProjects: loadProjects,
    }),
    [projects, currentProjectId, currentProject, loadingProjects, setCurrentProjectId, loadProjects]
  );

  return <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>;
}

export function useProjectContext() {
  const ctx = useContext(ProjectContext);
  if (!ctx) {
    throw new Error("useProjectContext must be used inside ProjectProvider");
  }
  return ctx;
}