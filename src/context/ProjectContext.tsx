import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
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

// PostgREST's max-rows cap (default 1000) is a HARD SERVER-SIDE limit —
// .range() only requests a window, it cannot force the server past its
// own configured ceiling in one response (this was the wrong assumption
// in an earlier fix here, confirmed and corrected on ExpensesPage.tsx —
// the "N total" headline stayed correct via a separate count-only query,
// but the actual data array was still silently capped). Real fix: loop
// requesting successive windows until a page comes back shorter than
// requested — the actual end of the data, regardless of what the
// server's true max-rows turns out to be. Shared by both query branches
// below (director/admin company-wide, and the project_members-scoped
// path — the latter is realistically bounded well under 1000 for any one
// user, but paginating it too removes any lingering doubt at negligible cost).
async function paginateAll<T>(buildQuery: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: any }>): Promise<{ data: T[]; error: any }> {
  const PAGE = 1000;
  let all: T[] = [];
  let from = 0;
  for (let guard = 0; guard < 200; guard++) { // hard safety stop (200,000 rows) against a runaway loop, not a realistic ceiling
    const { data: page, error } = await buildQuery(from, from + PAGE - 1);
    if (error) return { data: all, error };
    all = all.concat(page || []);
    if (!page || page.length < PAGE) break;
    from += PAGE;
  }
  return { data: all, error: null };
}

export function ProjectProvider({ children }: { children: React.ReactNode }) {
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [totalProjectsCount, setTotalProjectsCount] = useState<number | null>(null);
  const [currentProjectId, setCurrentProjectIdState] = useState<string | null>(null);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  // hasLoadedRef: true once loadProjects() has gotten past BOTH the
  // getUser() and user_profiles checks below — i.e. auth was genuinely
  // resolved (whether the user turns out to have 0 or N projects). Stays
  // false only when we bailed out early for "no user"/"no profile", which
  // is ambiguous between "genuinely logged out" and "session not restored
  // from storage yet" — see the onAuthStateChange listener below, which
  // uses this to decide whether a later auth event should retry.
  //
  // loadInFlightRef: true for the duration of any in-progress call —
  // prevents the listener from firing a redundant concurrent fetch while
  // the mount-time call (or a previous retry) is still awaiting a response.
  const hasLoadedRef = useRef(false);
  const loadInFlightRef = useRef(false);

  const loadProjects = useCallback(async () => {
    if (loadInFlightRef.current) return;
    loadInFlightRef.current = true;
    setLoadingProjects(true);

    try {

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
    hasLoadedRef.current = true;

    // Directors, admins, and secretaries see every project in the company.
    // secretary added deliberately (not a bug fix — the role didn't exist
    // until this session, so it correctly fell through to the
    // project_members-only path by default until now). Every other role
    // (estimator, supervisor, office_user, site_user) is unchanged — still
    // scoped to their own project_members assignments below.
    let data: any[] | null = null;
    let error: any = null;
    let totalCount: number | null = null;
    if (profileData.role === "director" || profileData.role === "admin" || profileData.role === "secretary") {
      const [paged, countRes] = await Promise.all([
        paginateAll<any>((from, to) =>
          supabase
            .from("projects")
            .select("id, name, client_id, status")
            .eq("company_id", profileData.company_id)
            .order("name", { ascending: true })
            .range(from, to)
        ),
        supabase
          .from("projects")
          .select("id", { count: "exact", head: true })
          .eq("company_id", profileData.company_id),
      ]);
      data = paged.data;
      error = paged.error;
      // Exact count is a separate, cheap query — not subject to the same
      // row-return cap either way, but paginateAll above already gets the
      // real total from the data itself now; kept for a second, independent
      // confirmation and because it resolves in parallel rather than after.
      totalCount = countRes.count ?? paged.data.length;
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
          // A restricted (non-director/admin) user's visible set is
          // inherently bounded by their own project_members rows, not the
          // whole company — realistically well under 1000, but paginated
          // via the same helper anyway rather than trusting a single
          // .range() request not to be silently truncated.
          const paged = await paginateAll<any>((from, to) =>
            supabase
              .from("projects")
              .select("id, name, client_id, status")
              .in("id", projectIds)
              .order("name", { ascending: true })
              .range(from, to)
          );
          data = paged.data;
          error = paged.error;
          totalCount = paged.data.length;
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

    } finally {
      loadInFlightRef.current = false;
    }
  }, []);

  useEffect(() => {
    loadProjects();

    // The auth-race-condition fix: on some page loads, the Supabase
    // client hasn't finished restoring the session from storage by the
    // time the plain loadProjects() call above fires getUser() — it
    // correctly (but unhelpfully) reads as "not logged in", so projects
    // gets set to [] with no error. onAuthStateChange's INITIAL_SESSION
    // event fires exactly once, right when the client's restore actually
    // completes — the real "auth is now ready" signal, confirmed against
    // the installed @supabase/supabase-js's own AuthChangeEvent type
    // rather than assumed. SIGNED_IN/TOKEN_REFRESHED are handled the same
    // way defensively, in case the race is lost in one of those other
    // shapes instead. Only retries if hasLoadedRef is still false (the
    // mount-time call above hasn't genuinely resolved auth yet) and
    // nothing is already in flight — see the refs' own comments above
    // loadProjects for why both checks are needed to avoid a duplicate
    // fetch/flash in the ordinary, already-working case.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (
        (event === "INITIAL_SESSION" || event === "SIGNED_IN" || event === "TOKEN_REFRESHED") &&
        !hasLoadedRef.current &&
        !loadInFlightRef.current
      ) {
        loadProjects();
      }
    });

    return () => {
      subscription.unsubscribe();
    };
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