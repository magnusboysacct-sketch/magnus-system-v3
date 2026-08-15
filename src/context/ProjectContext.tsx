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
  // Exact company-wide project count, independent of the `projects` array
  // above — see loadProjects(). Purely additive: existing consumers that
  // only read `projects` (its own length included) are entirely
  // unaffected; ProjectsPage.tsx and DashboardPage.tsx's "N total"
  // headline figures use this instead, since projects.length is subject
  // to the same PostgREST 1000-row cap already found and fixed elsewhere
  // in this app.
  totalProjectsCount: number | null;
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
  const [totalProjectsCount, setTotalProjectsCount] = useState<number | null>(null);
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
    let totalCount: number | null = null;
    if (profileData.role === "director" || profileData.role === "admin") {
      // PostgREST silently caps an unranged .select() at its default
      // max-rows (1000) — same bug confirmed and fixed on ExpensesPage.tsx.
      // .range() raises that ceiling explicitly; the separate exact-count
      // query isn't subject to the same row-return cap, so ProjectsPage.tsx
      // / DashboardPage.tsx's "N total" headline figures stay correct even
      // past the .range() bound.
      const [res, countRes] = await Promise.all([
        supabase
          .from("projects")
          .select("id, name, client_id, status")
          .eq("company_id", profileData.company_id)
          .order("name", { ascending: true })
          .range(0, 49999),
        supabase
          .from("projects")
          .select("id", { count: "exact", head: true })
          .eq("company_id", profileData.company_id),
      ]);
      data = res.data;
      error = res.error;
      totalCount = countRes.count ?? null;
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
          totalCount = 0;
        } else {
          const res = await supabase
            .from("projects")
            .select("id, name, client_id, status")
            .in("id", projectIds)
            .order("name", { ascending: true })
            .range(0, 49999);
          data = res.data;
          error = res.error;
          // A restricted (non-director/admin) user's visible set is
          // inherently bounded by their own project_members rows, not the
          // whole company — already accurate at this scale, no separate
          // count query needed.
          totalCount = res.data?.length ?? null;
        }
      }
    }

    if (error) {
      console.error("Failed to load projects:", error);
      setProjects([]);
      setTotalProjectsCount(null);
      setLoadingProjects(false);
      return;
    }

    setTotalProjectsCount(totalCount);

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
      totalProjectsCount,
      currentProjectId,
      currentProject,
      loadingProjects,
      userRole,
      userId,
      setCurrentProjectId,
      refreshProjects: loadProjects,
    }),
    [projects, totalProjectsCount, currentProjectId, currentProject, loadingProjects, userRole, userId, setCurrentProjectId, loadProjects]
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