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
  userRole: string | null;
  userId: string | null;
  setCurrentProjectId: (projectId: string | null) => void;
  refreshProjects: () => Promise<void>;
};

const ProjectContext = createContext<ProjectContextType | undefined>(undefined);

const STORAGE_KEY = "magnus_current_project_id";

export function ProjectProvider({ children }: { children: React.ReactNode }) {
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [currentProjectId, setCurrentProjectIdState] = useState<string | null>(null);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  const loadProjects = useCallback(async () => {
    setLoadingProjects(true);

    // Get current authenticated user
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      console.error("No authenticated user found");
      setProjects([]);
      setUserRole(null);
      setUserId(null);
      setLoadingProjects(false);
      return;
    }

    // Load user's role and company_id from user_profiles
    const { data: profileData, error: profileError } = await supabase
      .from("user_profiles")
      .select("role, company_id, id")
      .eq("id", user.id)
      .single();

    if (profileError || !profileData?.company_id) {
      console.error("Failed to load user profile or no company assigned:", profileError);
      setProjects([]);
      setUserRole(null);
      setUserId(null);
      setLoadingProjects(false);
      return;
    }

    setUserRole(profileData.role ?? null);
    setUserId(profileData.id ?? null);

    // Directors and admins see every project in the company. Everyone else
    // only sees projects they've been assigned to via project_members.
    let data: any[] | null = null;
    let error: any = null;
    if (profileData.role === "director" || profileData.role === "admin") {
      const res = await supabase
        .from("projects")
        .select("id, name, client_id, status")
        .eq("company_id", profileData.company_id)
        .order("name", { ascending: true });
      data = res.data;
      error = res.error;
    } else {
      const { data: memberRows, error: memberError } = await supabase
        .from("project_members")
        .select("project_id")
        .eq("user_id", profileData.id)
        .eq("is_active", true);
      if (memberError) {
        error = memberError;
      } else {
        const projectIds = (memberRows || []).map((m: any) => m.project_id);
        if (projectIds.length === 0) {
          data = [];
        } else {
          const res = await supabase
            .from("projects")
            .select("id, name, client_id, status")
            .in("id", projectIds)
            .order("name", { ascending: true });
          data = res.data;
          error = res.error;
        }
      }
    }

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
      userRole,
      userId,
      setCurrentProjectId,
      refreshProjects: loadProjects,
    }),
    [projects, currentProjectId, currentProject, loadingProjects, userRole, userId, setCurrentProjectId, loadProjects]
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