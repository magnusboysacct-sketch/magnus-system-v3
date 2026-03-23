// src/pages/TakeoffPage.tsx
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useLocation, useParams, useSearchParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useProjectContext } from "../hooks/useProjectContext";
import {
  ChevronLeft,
  ChevronRight,
  Compass,
  FileDigit,
  FileText,
  Gauge,
  Layers3,
  Link2,
  Maximize2,
  Minimize2,
  MousePointer2,
  PencilRuler,
  Plus,
  RefreshCcw,
  Ruler,
  Save,
  Search,
  Settings,
  Square,
  Trash2,
  Upload,
  X,
} from "lucide-react";

type MainTab =
  | "drawings"
  | "measurements"
  | "details"
  | "boq"
  | "settings";

type DrawMode = "pan" | "calibration" | "line" | "area" | "count";
type UnitType = "ft" | "m" | "in" | "mm";

type Point = {
  x: number;
  y: number;
};

type CalibrationDraft = {
  p1: Point | null;
  p2: Point | null;
  distanceText: string;
  unit: UnitType;
};

type CalibrationForm = {
  feet: string;
  inches: string;
  fraction: string;
  unit: UnitType;
};

type CalibrationState = {
  p1: Point | null;
  p2: Point | null;
  distance: number;
  unit: UnitType;
  scale: number;
};

type MeasurementRow = {
  id: string;
  page_id: string | null;
  type: "line" | "area" | "count";
  label: string;
  unit: string;
  value: number;
  points: Point[];
  created_at?: string | null;
  updated_at?: string | null;
  source?: "db" | "local";
};

type TakeoffSessionRow = {
  id: string;
  company_id?: string | null;
  project_id?: string | null;
  name?: string | null;
  status?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type TakeoffPageRow = {
  id: string;
  session_id: string;
  project_id?: string | null;
  company_id?: string | null;
  page_number: number;
  title?: string | null;
  file_name?: string | null;
  preview_url?: string | null;
  rotation?: number | null;
  calibration_unit?: string | null;
  calibration_distance?: number | null;
  calibration_scale?: number | null;
  calibration_p1_x?: number | null;
  calibration_p1_y?: number | null;
  calibration_p2_x?: number | null;
  calibration_p2_y?: number | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type ViewerClickCapture =
  | { mode: "calibration"; points: Point[] }
  | { mode: "line"; points: Point[] }
  | { mode: "area"; points: Point[] }
  | { mode: "count"; points: Point[] }
  | null;

type ProjectRow = {
  id: string;
  company_id?: string | null;
  name?: string | null;
  project_name?: string | null;
  title?: string | null;
  is_active?: boolean | null;
};

const TAB_OPTIONS: Array<{
  key: MainTab;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { key: "drawings", label: "Drawings", icon: FileText },
  { key: "measurements", label: "Measurements", icon: Ruler },
  { key: "details", label: "Extracted Details", icon: FileDigit },
  { key: "boq", label: "BOQ Links", icon: Link2 },
  { key: "settings", label: "Settings", icon: Settings },
];

const FRACTION_OPTIONS = [
  "0",
  "1/16",
  "1/8",
  "3/16",
  "1/4",
  "5/16",
  "3/8",
  "7/16",
  "1/2",
  "9/16",
  "5/8",
  "11/16",
  "3/4",
  "13/16",
  "7/8",
  "15/16",
];

const DEFAULT_CALIBRATION_FORM: CalibrationForm = {
  feet: "",
  inches: "",
  fraction: "0",
  unit: "ft",
};

const DEFAULT_CALIBRATION_DRAFT: CalibrationDraft = {
  p1: null,
  p2: null,
  distanceText: "1",
  unit: "ft",
};

function uid(prefix = "id") {
  return `${prefix}_${Math.random().toString(36).slice(2)}_${Date.now()}`;
}

function clsx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function fractionToDecimal(value: string): number {
  if (!value || value === "0") return 0;
  const [a, b] = value.split("/").map(Number);
  if (!a || !b) return 0;
  return a / b;
}

function calibrationFormToDistance(form: CalibrationForm): number {
  if (form.unit === "ft") {
    const feet = Number(form.feet || 0);
    const inches = Number(form.inches || 0);
    const frac = fractionToDecimal(form.fraction || "0");
    return feet + (inches + frac) / 12;
  }
  if (form.unit === "in") {
    const inches = Number(form.inches || 0);
    const frac = fractionToDecimal(form.fraction || "0");
    return inches + frac;
  }
  return Number(form.feet || 0);
}

function formatMeasurement(value: number, unit: string) {
  if (!Number.isFinite(value)) return `0 ${unit}`;
  return `${value.toLocaleString(undefined, {
    maximumFractionDigits: 2,
  })} ${unit}`;
}

function dist(a: Point, b: Point) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function polygonArea(points: Point[]) {
  if (points.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < points.length; i += 1) {
    const j = (i + 1) % points.length;
    sum += points[i].x * points[j].y - points[j].x * points[i].y;
  }
  return Math.abs(sum / 2);
}

function tryParseStoredJson<T>(value: string | null, fallback: T): T {
  try {
    return value ? (JSON.parse(value) as T) : fallback;
  } catch {
    return fallback;
  }
}

function getLocalMeasurementsKey(pageId: string | null) {
  return `magnus_takeoff_measurements_${pageId || "none"}`;
}

function getLocalPageStateKey(pageId: string | null) {
  return `magnus_takeoff_page_state_${pageId || "none"}`;
}

function getProjectIdFallback() {
  const candidates = [
    localStorage.getItem("magnus:selectedProjectId"),
    localStorage.getItem("selectedProjectId"),
    localStorage.getItem("projectId"),
    sessionStorage.getItem("magnus:selectedProjectId"),
    sessionStorage.getItem("selectedProjectId"),
    sessionStorage.getItem("projectId"),
  ];
  return candidates.find(Boolean) || null;
}

function getProjectDisplayName(project: Partial<ProjectRow> | null | undefined) {
  if (!project) return "";
  return project.name || project.project_name || project.title || "";
}

function normalizeProjectRow(input: any): ProjectRow | null {
  if (!input) return null;

  if (typeof input === "string") {
    return { id: input, name: "" };
  }

  const id =
    input.id ||
    input.project_id ||
    input.value ||
    input.projectId ||
    input.selectedProjectId;

  if (!id) return null;

  return {
    id: String(id),
    company_id: input.company_id ?? null,
    name: input.name ?? null,
    project_name: input.project_name ?? input.projectName ?? null,
    title: input.title ?? null,
    is_active: input.is_active ?? null,
  };
}

function uniqueProjects(rows: ProjectRow[]) {
  const map = new Map<string, ProjectRow>();
  for (const row of rows) {
    if (!row?.id) continue;
    if (!map.has(row.id)) map.set(row.id, row);
  }
  return Array.from(map.values()).sort((a, b) =>
    getProjectDisplayName(a).localeCompare(getProjectDisplayName(b))
  );
}

async function safeUpsertTakeoffPage(payload: Record<string, any>) {
  const candidates: Array<Record<string, any>> = [
    payload,
    {
      session_id: payload.session_id,
      page_number: payload.page_number,
      project_id: payload.project_id,
      company_id: payload.company_id,
      title: payload.title ?? null,
      file_name: payload.file_name ?? null,
      preview_url: payload.preview_url ?? null,
      rotation: payload.rotation ?? 0,
      calibration_unit: payload.calibration_unit ?? null,
      calibration_distance: payload.calibration_distance ?? null,
      calibration_scale: payload.calibration_scale ?? null,
      calibration_p1_x: payload.calibration_p1_x ?? null,
      calibration_p1_y: payload.calibration_p1_y ?? null,
      calibration_p2_x: payload.calibration_p2_x ?? null,
      calibration_p2_y: payload.calibration_p2_y ?? null,
    },
    {
      session_id: payload.session_id,
      page_number: payload.page_number,
      project_id: payload.project_id,
      company_id: payload.company_id,
      title: payload.title ?? null,
    },
  ];

  let lastError: any = null;

  for (const candidate of candidates) {
    const result = await supabase
      .from("takeoff_pages")
      .upsert(candidate, { onConflict: "session_id,page_number" })
      .select("*")
      .single();

    if (!result.error && result.data) return result;
    lastError = result.error;
  }

  const fallback = await supabase
    .from("takeoff_pages")
    .select("*")
    .eq("session_id", payload.session_id)
    .eq("page_number", payload.page_number)
    .maybeSingle();

  if (!fallback.error && fallback.data) {
    return { data: fallback.data, error: null };
  }

  return { data: null, error: lastError || fallback.error };
}

async function safeUpdateTakeoffPage(pageId: string, payload: Record<string, any>) {
  const cleaned = Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== undefined)
  );

  const result = await supabase
    .from("takeoff_pages")
    .update(cleaned)
    .eq("id", pageId)
    .select("*")
    .single();

  if (!result.error && result.data) return result;

  const lighter = Object.fromEntries(
    Object.entries({
      title: payload.title,
      file_name: payload.file_name,
      preview_url: payload.preview_url,
      rotation: payload.rotation,
      calibration_unit: payload.calibration_unit,
      calibration_distance: payload.calibration_distance,
      calibration_scale: payload.calibration_scale,
      calibration_p1_x: payload.calibration_p1_x,
      calibration_p1_y: payload.calibration_p1_y,
      calibration_p2_x: payload.calibration_p2_x,
      calibration_p2_y: payload.calibration_p2_y,
    }).filter(([, value]) => value !== undefined)
  );

  return supabase
    .from("takeoff_pages")
    .update(lighter)
    .eq("id", pageId)
    .select("*")
    .single();
}

async function safeLoadProjects(companyId: string | null) {
  const attempts: Array<() => Promise<any>> = [];

  if (companyId) {
    attempts.push(() =>
      supabase
        .from("projects")
        .select("id, company_id, name, project_name, title, is_active")
        .eq("company_id", companyId)
    );
  }

  attempts.push(() =>
    supabase
      .from("projects")
      .select("id, company_id, name, project_name, title, is_active")
  );

  for (const attempt of attempts) {
    const result = await attempt();
    if (!result.error && Array.isArray(result.data)) {
      return (result.data as any[]).map(normalizeProjectRow).filter(Boolean) as ProjectRow[];
    }
  }

  return [] as ProjectRow[];
}

export default function TakeoffPage() {
  const viewerRef = useRef<HTMLDivElement | null>(null);
  const autoSaveTimerRef = useRef<number | null>(null);
  const bootstrapKeyRef = useRef<string>("");

  const routeParams = useParams();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  const projectContext = (useProjectContext?.() ?? {}) as any;

  const [tab, setTab] = useState<MainTab>("drawings");
  const [drawMode, setDrawMode] = useState<DrawMode>("pan");
  const [zoom, setZoom] = useState(1);
  const [fitMode, setFitMode] = useState<"fit" | "actual">("fit");
  const [searchText, setSearchText] = useState("");
  const [statusText, setStatusText] = useState("Ready");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pageLoading, setPageLoading] = useState(false);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [changingProject, setChangingProject] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  const [userId, setUserId] = useState<string | null>(null);
  const [companyId, setCompanyId] = useState<string | null>(null);

  const [projectId, setProjectId] = useState<string | null>(null);
  const [projectName, setProjectName] = useState<string>("");
  const [availableProjects, setAvailableProjects] = useState<ProjectRow[]>([]);

  const [sessions, setSessions] = useState<TakeoffSessionRow[]>([]);
  const [pages, setPages] = useState<TakeoffPageRow[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [activePageNumber, setActivePageNumber] = useState(1);
  const [activePage, setActivePage] = useState<TakeoffPageRow | null>(null);

  const [showCalibrationModal, setShowCalibrationModal] = useState(false);
  const [calibrationDraft, setCalibrationDraft] = useState<CalibrationDraft>(
    DEFAULT_CALIBRATION_DRAFT
  );
  const [calibrationForm, setCalibrationForm] = useState<CalibrationForm>(
    DEFAULT_CALIBRATION_FORM
  );
  const [calibration, setCalibration] = useState<CalibrationState | null>(null);
  const [viewerCapture, setViewerCapture] = useState<ViewerClickCapture>(null);

  const [measurements, setMeasurements] = useState<MeasurementRow[]>([]);
  const [selectedMeasurementId, setSelectedMeasurementId] = useState<string | null>(
    null
  );

  const [pageTitleInput, setPageTitleInput] = useState("");
  const [pageUrlInput, setPageUrlInput] = useState("");
  const [detailNotes, setDetailNotes] = useState("");
  const [boqLink, setBoqLink] = useState("");

  const activePageId = activePage?.id || null;

  const resolvedRouteProjectId =
    (routeParams as Record<string, string | undefined>).projectId ||
    (routeParams as Record<string, string | undefined>).id ||
    searchParams.get("projectId") ||
    searchParams.get("project_id") ||
    ((location.state as any)?.projectId as string | undefined) ||
    ((location.state as any)?.selectedProjectId as string | undefined) ||
    null;

  const contextProjects = useMemo(() => {
    const raw =
      projectContext.projects ||
      projectContext.availableProjects ||
      projectContext.projectOptions ||
      projectContext.filteredProjects ||
      projectContext.allProjects ||
      [];
    if (!Array.isArray(raw)) return [] as ProjectRow[];
    return uniqueProjects(
      raw.map(normalizeProjectRow).filter(Boolean) as ProjectRow[]
    );
  }, [projectContext]);

  const contextProject = useMemo(() => {
    return (
      normalizeProjectRow(projectContext.activeProject) ||
      normalizeProjectRow(projectContext.selectedProject) ||
      normalizeProjectRow(projectContext.currentProject) ||
      normalizeProjectRow(projectContext.project) ||
      null
    );
  }, [projectContext]);

  const contextProjectId = useMemo(() => {
    return (
      contextProject?.id ||
      projectContext.activeProjectId ||
      projectContext.selectedProjectId ||
      projectContext.currentProjectId ||
      projectContext.projectId ||
      null
    );
  }, [contextProject, projectContext]);

  const contextProjectName = useMemo(() => {
    return (
      getProjectDisplayName(contextProject) ||
      projectContext.activeProjectName ||
      projectContext.selectedProjectName ||
      ""
    );
  }, [contextProject, projectContext]);

  const selectedMeasurement = useMemo(
    () => measurements.find((m) => m.id === selectedMeasurementId) || null,
    [measurements, selectedMeasurementId]
  );

  const filteredMeasurements = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    if (!q) return measurements;
    return measurements.filter((m) => {
      return (
        m.label.toLowerCase().includes(q) ||
        m.type.toLowerCase().includes(q) ||
        m.unit.toLowerCase().includes(q)
      );
    });
  }, [measurements, searchText]);

  const activePageDisplayTitle = useMemo(() => {
    if (!activePage) return projectId ? "Untitled Page" : "No Page Loaded";
    return activePage.title || activePage.file_name || `Page ${activePage.page_number}`;
  }, [activePage, projectId]);

  const measurementSummary = useMemo(() => {
    const lines = measurements.filter((m) => m.type === "line").length;
    const areas = measurements.filter((m) => m.type === "area").length;
    const counts = measurements.filter((m) => m.type === "count").length;
    return { lines, areas, counts, total: measurements.length };
  }, [measurements]);

  const calibrationReady = Boolean(
    calibration?.p1 && calibration?.p2 && calibration?.scale
  );

  const canWork = Boolean(projectId && !loading && !changingProject);

  const setStatus = useCallback((text: string) => {
    setStatusText(text);
  }, []);

  const persistProjectFallback = useCallback((nextProjectId: string | null) => {
    if (nextProjectId) {
      localStorage.setItem("magnus:selectedProjectId", nextProjectId);
      sessionStorage.setItem("magnus:selectedProjectId", nextProjectId);
      localStorage.setItem("selectedProjectId", nextProjectId);
      sessionStorage.setItem("selectedProjectId", nextProjectId);
    } else {
      localStorage.removeItem("magnus:selectedProjectId");
      sessionStorage.removeItem("magnus:selectedProjectId");
    }
  }, []);

  const persistLocalPageState = useCallback(
    (pageId: string | null, next: Partial<{ detailNotes: string; boqLink: string }>) => {
      if (!pageId) return;
      const key = getLocalPageStateKey(pageId);
      const current = tryParseStoredJson<{ detailNotes: string; boqLink: string }>(
        localStorage.getItem(key),
        { detailNotes: "", boqLink: "" }
      );
      const merged = { ...current, ...next };
      localStorage.setItem(key, JSON.stringify(merged));
    },
    []
  );

  const loadLocalPageState = useCallback((pageId: string | null) => {
    if (!pageId) return { detailNotes: "", boqLink: "" };
    return tryParseStoredJson<{ detailNotes: string; boqLink: string }>(
      localStorage.getItem(getLocalPageStateKey(pageId)),
      { detailNotes: "", boqLink: "" }
    );
  }, []);

  const saveMeasurementsLocal = useCallback((pageId: string | null, rows: MeasurementRow[]) => {
    if (!pageId) return;
    localStorage.setItem(getLocalMeasurementsKey(pageId), JSON.stringify(rows));
  }, []);

  const loadMeasurementsLocal = useCallback((pageId: string | null) => {
    if (!pageId) return [] as MeasurementRow[];
    return tryParseStoredJson<MeasurementRow[]>(
      localStorage.getItem(getLocalMeasurementsKey(pageId)),
      []
    );
  }, []);

  const loadUserContext = useCallback(async () => {
    setLoading(true);
    setErrorText(null);

    const auth = await supabase.auth.getUser();
    const user = auth.data.user;

    if (!user) {
      setErrorText("You must be signed in to use Takeoff.");
      setLoading(false);
      return;
    }

    setUserId(user.id);

    const profileResult = await supabase
      .from("user_profiles")
      .select("company_id")
      .eq("id", user.id)
      .maybeSingle();

    if (profileResult.error) {
      setErrorText(profileResult.error.message);
    }

    setCompanyId(profileResult.data?.company_id || null);
    setLoading(false);
  }, []);

  const loadAvailableProjects = useCallback(async () => {
    setProjectsLoading(true);

    let merged: ProjectRow[] = [];

    if (contextProjects.length > 0) {
      merged = uniqueProjects(contextProjects);
    }

    const dbProjects = await safeLoadProjects(companyId);
    if (dbProjects.length > 0) {
      merged = uniqueProjects([...merged, ...dbProjects]);
    }

    setAvailableProjects(merged);
    setProjectsLoading(false);
  }, [companyId, contextProjects]);

  const pushProjectIntoContext = useCallback(
    async (project: ProjectRow | null) => {
      const nextId = project?.id || null;

      const attempts: Array<() => any> = [];

      if (typeof projectContext.setActiveProjectId === "function") {
        attempts.push(() => projectContext.setActiveProjectId(nextId));
      }
      if (typeof projectContext.setSelectedProjectId === "function") {
        attempts.push(() => projectContext.setSelectedProjectId(nextId));
      }
      if (typeof projectContext.setCurrentProjectId === "function") {
        attempts.push(() => projectContext.setCurrentProjectId(nextId));
      }
      if (typeof projectContext.setProjectId === "function") {
        attempts.push(() => projectContext.setProjectId(nextId));
      }
      if (typeof projectContext.selectProject === "function") {
        attempts.push(() => projectContext.selectProject(project || nextId));
      }
      if (typeof projectContext.setActiveProject === "function") {
        attempts.push(() => projectContext.setActiveProject(project || nextId));
      }
      if (typeof projectContext.setSelectedProject === "function") {
        attempts.push(() => projectContext.setSelectedProject(project || nextId));
      }
      if (typeof projectContext.setCurrentProject === "function") {
        attempts.push(() => projectContext.setCurrentProject(project || nextId));
      }
      if (typeof projectContext.setProject === "function") {
        attempts.push(() => projectContext.setProject(project || nextId));
      }

      for (const attempt of attempts) {
        try {
          const maybePromise = attempt();
          if (maybePromise && typeof maybePromise.then === "function") {
            await maybePromise;
          }
        } catch {
          // keep trying the next setter shape
        }
      }

      persistProjectFallback(nextId);
    },
    [persistProjectFallback, projectContext]
  );

  const applySelectedProject = useCallback(
    async (nextProject: ProjectRow | null) => {
      const nextId = nextProject?.id || null;
      const nextName = getProjectDisplayName(nextProject);

      setChangingProject(true);
      setErrorText(null);
      setStatus(nextId ? "Switching project..." : "Project cleared");

      bootstrapKeyRef.current = "";
      setSessions([]);
      setPages([]);
      setActiveSessionId(null);
      setActivePageNumber(1);
      setActivePage(null);
      setMeasurements([]);
      setSelectedMeasurementId(null);
      setCalibration(null);
      setPageTitleInput("");
      setPageUrlInput("");
      setDetailNotes("");
      setBoqLink("");

      setProjectId(nextId);
      setProjectName(nextName);

      await pushProjectIntoContext(nextProject);

      setChangingProject(false);
      setStatus(nextId ? "Project selected" : "Ready");
    },
    [pushProjectIntoContext, setStatus]
  );

  const loadMeasurementsFromDb = useCallback(
    async (page: TakeoffPageRow, nextCalibration: CalibrationState | null) => {
      const localMeasurements = loadMeasurementsLocal(page.id);

      const dbRows = await supabase
        .from("takeoff_measurements")
        .select("*")
        .eq("page_id", page.id)
        .order("created_at", { ascending: true });

      if (!dbRows.error && Array.isArray(dbRows.data)) {
        const mapped = dbRows.data.map((row: any) => ({
          id: row.id,
          page_id: row.page_id ?? page.id,
          type: (row.type || "line") as "line" | "area" | "count",
          label: row.label || row.name || "Measurement",
          unit: row.unit || (row.type === "count" ? "qty" : nextCalibration?.unit || "ft"),
          value: Number(row.value ?? row.quantity ?? 0),
          points: Array.isArray(row.points_json)
            ? row.points_json
            : Array.isArray(row.points)
            ? row.points
            : [],
          created_at: row.created_at ?? null,
          updated_at: row.updated_at ?? null,
          source: "db" as const,
        })) as MeasurementRow[];

        setMeasurements(mapped);
        setSelectedMeasurementId(mapped[0]?.id || null);
        saveMeasurementsLocal(page.id, mapped);
        return;
      }

      setMeasurements(localMeasurements);
      setSelectedMeasurementId(localMeasurements[0]?.id || null);
    },
    [loadMeasurementsLocal, saveMeasurementsLocal]
  );

  const hydratePageState = useCallback(
    async (page: TakeoffPageRow | null) => {
      setActivePage(page);

      if (!page) {
        setMeasurements([]);
        setSelectedMeasurementId(null);
        setCalibration(null);
        setPageTitleInput("");
        setPageUrlInput("");
        setDetailNotes("");
        setBoqLink("");
        return;
      }

      setPageTitleInput(page.title || page.file_name || "");
      setPageUrlInput(page.preview_url || "");

      const localState = loadLocalPageState(page.id);
      setDetailNotes(localState.detailNotes || "");
      setBoqLink(localState.boqLink || "");

      const nextCalibration =
        page.calibration_scale &&
        page.calibration_distance &&
        page.calibration_unit &&
        Number.isFinite(Number(page.calibration_scale))
          ? {
              p1:
                page.calibration_p1_x != null && page.calibration_p1_y != null
                  ? {
                      x: Number(page.calibration_p1_x),
                      y: Number(page.calibration_p1_y),
                    }
                  : null,
              p2:
                page.calibration_p2_x != null && page.calibration_p2_y != null
                  ? {
                      x: Number(page.calibration_p2_x),
                      y: Number(page.calibration_p2_y),
                    }
                  : null,
              distance: Number(page.calibration_distance),
              unit: page.calibration_unit as UnitType,
              scale: Number(page.calibration_scale),
            }
          : null;

      setCalibration(nextCalibration);
      await loadMeasurementsFromDb(page, nextCalibration);
    },
    [loadLocalPageState, loadMeasurementsFromDb]
  );

  const loadSessionsForProject = useCallback(async () => {
    if (!projectId) {
      setSessions([]);
      return [] as TakeoffSessionRow[];
    }

    let query = supabase
      .from("takeoff_sessions")
      .select("*")
      .eq("project_id", projectId)
      .order("updated_at", { ascending: false });

    if (companyId) {
      query = query.eq("company_id", companyId);
    }

    let result = await query;
    if (result.error && companyId) {
      result = await supabase
        .from("takeoff_sessions")
        .select("*")
        .eq("project_id", projectId)
        .order("updated_at", { ascending: false });
    }

    if (result.error) {
      setErrorText(result.error.message);
      setSessions([]);
      return [] as TakeoffSessionRow[];
    }

    const rows = (result.data || []) as TakeoffSessionRow[];
    setSessions(rows);
    return rows;
  }, [companyId, projectId]);

  const ensureSession = useCallback(async () => {
    if (!projectId) return null;

    if (activeSessionId && sessions.some((s) => s.id === activeSessionId)) {
      return activeSessionId;
    }

    const loadedSessions = sessions.length > 0 ? sessions : await loadSessionsForProject();
    const existing = loadedSessions[0];
    if (existing?.id) {
      setActiveSessionId(existing.id);
      return existing.id;
    }

    const createPayload: Record<string, any> = {
      project_id: projectId,
      name: `Takeoff ${new Date().toLocaleDateString()}`,
      status: "active",
    };
    if (companyId) createPayload.company_id = companyId;

    const created = await supabase
      .from("takeoff_sessions")
      .insert(createPayload)
      .select("*")
      .single();

    if (created.error || !created.data) {
      setErrorText(created.error?.message || "Failed to create takeoff session.");
      return null;
    }

    const session = created.data as TakeoffSessionRow;
    setSessions([session, ...loadedSessions]);
    setActiveSessionId(session.id);
    return session.id;
  }, [activeSessionId, companyId, loadSessionsForProject, projectId, sessions]);

  const loadPages = useCallback(async (sessionId: string) => {
    setPageLoading(true);

    const result = await supabase
      .from("takeoff_pages")
      .select("*")
      .eq("session_id", sessionId)
      .order("page_number", { ascending: true });

    setPageLoading(false);

    if (result.error) {
      setErrorText(result.error.message);
      setPages([]);
      setActivePage(null);
      return [] as TakeoffPageRow[];
    }

    const rows = (result.data || []) as TakeoffPageRow[];
    setPages(rows);
    return rows;
  }, []);

  const ensurePage = useCallback(
    async (pageNumber: number, sessionIdOverride?: string | null) => {
      const sessionId = sessionIdOverride || (await ensureSession());
      if (!sessionId || !projectId) return null;

      const existing = pages.find(
        (p) => p.session_id === sessionId && p.page_number === pageNumber
      );
      if (existing) return existing;

      const payload: Record<string, any> = {
        session_id: sessionId,
        page_number: pageNumber,
        project_id: projectId,
        company_id: companyId,
        title: `Page ${pageNumber}`,
        file_name: null,
        preview_url: null,
        rotation: 0,
      };

      const result = await safeUpsertTakeoffPage(payload);

      if (result.error || !result.data) {
        setErrorText(result.error?.message || "Failed to create takeoff page.");
        return null;
      }

      const row = result.data as TakeoffPageRow;
      setPages((prev) => {
        const next = prev.filter(
          (p) => !(p.session_id === row.session_id && p.page_number === row.page_number)
        );
        return [...next, row].sort((a, b) => a.page_number - b.page_number);
      });

      return row;
    },
    [companyId, ensureSession, pages, projectId]
  );

  const bootstrapTakeoff = useCallback(async () => {
    if (loading || changingProject || !projectId) return;

    const bootstrapKey = `${companyId || "no-company"}:${projectId}`;
    if (
      bootstrapKeyRef.current === bootstrapKey &&
      activeSessionId &&
      pages.length > 0 &&
      activePage
    ) {
      return;
    }

    bootstrapKeyRef.current = bootstrapKey;
    setErrorText(null);

    const loadedSessions = await loadSessionsForProject();

    let sessionId =
      (activeSessionId && loadedSessions.find((s) => s.id === activeSessionId)?.id) ||
      loadedSessions[0]?.id ||
      null;

    if (!sessionId) {
      sessionId = await ensureSession();
    }

    if (!sessionId) return;

    const loadedPages = await loadPages(sessionId);
    let targetPage =
      loadedPages.find((p) => p.page_number === activePageNumber) ||
      loadedPages[0] ||
      null;

    if (!targetPage) {
      targetPage = await ensurePage(1, sessionId);
    }

    if (!targetPage) return;

    setActiveSessionId(sessionId);
    setActivePageNumber(targetPage.page_number);
    await hydratePageState(targetPage);
    setStatus("Takeoff ready");
  }, [
    activePage,
    activePageNumber,
    activeSessionId,
    changingProject,
    companyId,
    ensurePage,
    ensureSession,
    hydratePageState,
    loadPages,
    loadSessionsForProject,
    loading,
    pages.length,
    projectId,
    setStatus,
  ]);

  const saveActivePage = useCallback(
    async (patch?: Partial<TakeoffPageRow>) => {
      if (!projectId) {
        setErrorText("Select a project before saving takeoff pages.");
        return null;
      }

      setSaving(true);
      setErrorText(null);

      const pageNumber = activePage?.page_number || activePageNumber || 1;
      const targetPage = activePage ?? (await ensurePage(pageNumber));
      if (!targetPage) {
        setSaving(false);
        return null;
      }

      const payload: Record<string, any> = {
        project_id: projectId,
        company_id: companyId,
        title: pageTitleInput || targetPage.title || `Page ${pageNumber}`,
        file_name: targetPage.file_name ?? null,
        preview_url: pageUrlInput || targetPage.preview_url || null,
        rotation: targetPage.rotation ?? 0,
        ...patch,
      };

      const result = await safeUpdateTakeoffPage(targetPage.id, payload);
      setSaving(false);

      if (result.error || !result.data) {
        setErrorText(result.error?.message || "Failed to save takeoff page.");
        return null;
      }

      const updated = result.data as TakeoffPageRow;
      setPages((prev) =>
        prev.map((p) => (p.id === updated.id ? updated : p)).sort((a, b) => a.page_number - b.page_number)
      );
      setActivePage(updated);
      setStatus("Page saved");
      return updated;
    },
    [
      activePage,
      activePageNumber,
      companyId,
      ensurePage,
      pageTitleInput,
      pageUrlInput,
      projectId,
      setStatus,
    ]
  );

  const queueAutoSave = useCallback(
    (patch?: Partial<TakeoffPageRow>) => {
      if (!projectId) return;
      if (autoSaveTimerRef.current) {
        window.clearTimeout(autoSaveTimerRef.current);
      }
      autoSaveTimerRef.current = window.setTimeout(() => {
        void saveActivePage(patch);
      }, 500);
    },
    [projectId, saveActivePage]
  );

  const saveCalibrationToPage = useCallback(
    async (nextCalibration: CalibrationState | null) => {
      setCalibration(nextCalibration);

      const patch: Partial<TakeoffPageRow> = nextCalibration
        ? {
            calibration_unit: nextCalibration.unit,
            calibration_distance: nextCalibration.distance,
            calibration_scale: nextCalibration.scale,
            calibration_p1_x: nextCalibration.p1?.x ?? null,
            calibration_p1_y: nextCalibration.p1?.y ?? null,
            calibration_p2_x: nextCalibration.p2?.x ?? null,
            calibration_p2_y: nextCalibration.p2?.y ?? null,
          }
        : {
            calibration_unit: null,
            calibration_distance: null,
            calibration_scale: null,
            calibration_p1_x: null,
            calibration_p1_y: null,
            calibration_p2_x: null,
            calibration_p2_y: null,
          };

      await saveActivePage(patch);
    },
    [saveActivePage]
  );

  const saveMeasurementDb = useCallback(async (row: MeasurementRow) => {
    if (!row.page_id) return;

    const candidates: Array<Record<string, any>> = [
      {
        id: row.id,
        page_id: row.page_id,
        type: row.type,
        label: row.label,
        unit: row.unit,
        value: row.value,
        points_json: row.points,
      },
      {
        id: row.id,
        page_id: row.page_id,
        type: row.type,
        label: row.label,
        unit: row.unit,
        value: row.value,
        points: row.points,
      },
      {
        id: row.id,
        page_id: row.page_id,
        type: row.type,
        label: row.label,
        unit: row.unit,
        value: row.value,
      },
    ];

    for (const payload of candidates) {
      const result = await supabase
        .from("takeoff_measurements")
        .upsert(payload)
        .select("*")
        .maybeSingle();

      if (!result.error) return;
    }
  }, []);

  const commitMeasurements = useCallback(
    async (rows: MeasurementRow[]) => {
      setMeasurements(rows);
      saveMeasurementsLocal(activePageId, rows);
      for (const row of rows) {
        void saveMeasurementDb(row);
      }
    },
    [activePageId, saveMeasurementDb, saveMeasurementsLocal]
  );

  const handleViewerPoint = useCallback(
    async (point: Point) => {
      if (!viewerCapture) return;

      if (viewerCapture.mode === "calibration") {
        const nextPoints = [...viewerCapture.points, point].slice(0, 2);
        setViewerCapture({ mode: "calibration", points: nextPoints });
        setCalibrationDraft((prev) => ({
          ...prev,
          p1: nextPoints[0] || null,
          p2: nextPoints[1] || null,
        }));
        setStatus(
          nextPoints.length === 1 ? "Calibration point 1 set" : "Calibration point 2 set"
        );
        setShowCalibrationModal(true);
        return;
      }

      if (viewerCapture.mode === "line") {
        const nextPoints = [...viewerCapture.points, point].slice(0, 2);
        if (nextPoints.length < 2) {
          setViewerCapture({ mode: "line", points: nextPoints });
          setStatus("Line point 1 set");
          return;
        }

        if (!calibrationReady || !calibration) {
          setErrorText("Calibrate the page before taking line measurements.");
          setViewerCapture(null);
          setDrawMode("pan");
          return;
        }

        const normalizedLength = dist(nextPoints[0], nextPoints[1]);
        const value = normalizedLength * calibration.scale;

        const row: MeasurementRow = {
          id: uid("line"),
          page_id: activePageId,
          type: "line",
          label: `Line ${measurements.filter((m) => m.type === "line").length + 1}`,
          unit: calibration.unit,
          value,
          points: nextPoints,
          source: "local",
        };

        const nextRows = [...measurements, row];
        await commitMeasurements(nextRows);
        setSelectedMeasurementId(row.id);
        setViewerCapture(null);
        setDrawMode("pan");
        setStatus("Line measurement added");
        return;
      }

      if (viewerCapture.mode === "area") {
        const nextPoints = [...viewerCapture.points, point];
        setViewerCapture({ mode: "area", points: nextPoints });
        setStatus(`Area points: ${nextPoints.length}`);
        return;
      }

      if (viewerCapture.mode === "count") {
        const row: MeasurementRow = {
          id: uid("count"),
          page_id: activePageId,
          type: "count",
          label: `Count ${measurements.filter((m) => m.type === "count").length + 1}`,
          unit: "qty",
          value: 1,
          points: [point],
          source: "local",
        };

        const nextRows = [...measurements, row];
        await commitMeasurements(nextRows);
        setSelectedMeasurementId(row.id);
        setViewerCapture({ mode: "count", points: [] });
        setStatus("Count point added");
      }
    },
    [
      activePageId,
      calibration,
      calibrationReady,
      commitMeasurements,
      measurements,
      setStatus,
      viewerCapture,
    ]
  );

  const completeAreaMeasurement = useCallback(async () => {
    if (!viewerCapture || viewerCapture.mode !== "area") return;
    if (viewerCapture.points.length < 3) {
      setErrorText("Area measurement needs at least 3 points.");
      return;
    }
    if (!calibrationReady || !calibration) {
      setErrorText("Calibrate the page before taking area measurements.");
      return;
    }

    const normalizedArea = polygonArea(viewerCapture.points);
    const value = normalizedArea * calibration.scale * calibration.scale;

    const row: MeasurementRow = {
      id: uid("area"),
      page_id: activePageId,
      type: "area",
      label: `Area ${measurements.filter((m) => m.type === "area").length + 1}`,
      unit: `${calibration.unit}²`,
      value,
      points: viewerCapture.points,
      source: "local",
    };

    const nextRows = [...measurements, row];
    await commitMeasurements(nextRows);
    setSelectedMeasurementId(row.id);
    setViewerCapture(null);
    setDrawMode("pan");
    setStatus("Area measurement added");
  }, [
    activePageId,
    calibration,
    calibrationReady,
    commitMeasurements,
    measurements,
    setStatus,
    viewerCapture,
  ]);

  const resetCalibrationDraft = useCallback(() => {
    setCalibrationDraft(DEFAULT_CALIBRATION_DRAFT);
    setCalibrationForm(DEFAULT_CALIBRATION_FORM);
    setViewerCapture(null);
  }, []);

  const openCalibrationModal = useCallback(() => {
    setShowCalibrationModal(true);
    setCalibrationDraft({
      p1: calibration?.p1 || null,
      p2: calibration?.p2 || null,
      distanceText:
        calibration?.distance != null ? String(calibration.distance) : "1",
      unit: (calibration?.unit || "ft") as UnitType,
    });

    if ((calibration?.unit || "ft") === "ft") {
      const totalFeet = calibration?.distance ?? 0;
      const wholeFeet = Math.floor(totalFeet);
      const remainingInches = Math.round((totalFeet - wholeFeet) * 12 * 16) / 16;
      const wholeInches = Math.floor(remainingInches);
      const frac = remainingInches - wholeInches;

      const fractionMap: Record<number, string> = {
        0: "0",
        0.0625: "1/16",
        0.125: "1/8",
        0.1875: "3/16",
        0.25: "1/4",
        0.3125: "5/16",
        0.375: "3/8",
        0.4375: "7/16",
        0.5: "1/2",
        0.5625: "9/16",
        0.625: "5/8",
        0.6875: "11/16",
        0.75: "3/4",
        0.8125: "13/16",
        0.875: "7/8",
        0.9375: "15/16",
      };

      setCalibrationForm({
        feet: calibration ? String(wholeFeet) : "",
        inches: calibration ? String(wholeInches) : "",
        fraction: fractionMap[frac] || "0",
        unit: (calibration?.unit || "ft") as UnitType,
      });
    } else {
      setCalibrationForm({
        feet: calibration?.distance != null ? String(calibration.distance) : "",
        inches: "",
        fraction: "0",
        unit: (calibration?.unit || "ft") as UnitType,
      });
    }
  }, [calibration]);

  const startCalibrationCapture = useCallback(() => {
    setViewerCapture({ mode: "calibration", points: [] });
    setDrawMode("calibration");
    setStatus("Click two points on the drawing to calibrate");
    setShowCalibrationModal(false);
  }, [setStatus]);

  const applyCalibration = useCallback(async () => {
    const p1 = calibrationDraft.p1;
    const p2 = calibrationDraft.p2;
    if (!p1 || !p2) {
      setErrorText("Select two calibration points first.");
      return;
    }

    let distanceValue = Number(calibrationDraft.distanceText || 0);
    if (!distanceValue || Number.isNaN(distanceValue)) {
      distanceValue = calibrationFormToDistance(calibrationForm);
    }

    if (!distanceValue || Number.isNaN(distanceValue) || distanceValue <= 0) {
      setErrorText("Enter a valid calibration distance.");
      return;
    }

    const normalizedDistance = dist(p1, p2);
    if (!normalizedDistance || normalizedDistance <= 0) {
      setErrorText("Calibration points must not overlap.");
      return;
    }

    const nextCalibration: CalibrationState = {
      p1,
      p2,
      distance: distanceValue,
      unit: calibrationForm.unit || calibrationDraft.unit || "ft",
      scale: distanceValue / normalizedDistance,
    };

    await saveCalibrationToPage(nextCalibration);
    setShowCalibrationModal(false);
    setViewerCapture(null);
    setDrawMode("pan");
    setStatus(`Calibrated: ${formatMeasurement(distanceValue, nextCalibration.unit)}`);
  }, [calibrationDraft, calibrationForm, saveCalibrationToPage, setStatus]);

  const removeMeasurement = useCallback(
    async (id: string) => {
      const nextRows = measurements.filter((m) => m.id !== id);
      setMeasurements(nextRows);
      setSelectedMeasurementId(nextRows[0]?.id || null);
      saveMeasurementsLocal(activePageId, nextRows);
      await supabase.from("takeoff_measurements").delete().eq("id", id);
    },
    [activePageId, measurements, saveMeasurementsLocal]
  );

  const updateMeasurement = useCallback(
    async (id: string, patch: Partial<MeasurementRow>) => {
      const nextRows = measurements.map((m) => (m.id === id ? { ...m, ...patch } : m));
      setMeasurements(nextRows);
      saveMeasurementsLocal(activePageId, nextRows);
      const row = nextRows.find((m) => m.id === id);
      if (row) void saveMeasurementDb(row);
    },
    [activePageId, measurements, saveMeasurementDb, saveMeasurementsLocal]
  );

  const goToPage = useCallback(
    async (pageNumber: number) => {
      if (!projectId) return;

      setActivePageNumber(pageNumber);

      const existing = pages.find((p) => p.page_number === pageNumber);
      if (existing) {
        await hydratePageState(existing);
        return;
      }

      const created = await ensurePage(pageNumber);
      if (created) {
        await hydratePageState(created);
      }
    },
    [ensurePage, hydratePageState, pages, projectId]
  );

  const addPage = useCallback(async () => {
    if (!projectId) return;
    const nextPageNumber =
      pages.length > 0 ? Math.max(...pages.map((p) => p.page_number)) + 1 : 1;
    const row = await ensurePage(nextPageNumber);
    if (row) {
      setActivePageNumber(row.page_number);
      await hydratePageState(row);
      setStatus(`Page ${row.page_number} created`);
    }
  }, [ensurePage, hydratePageState, pages, projectId, setStatus]);

  const handleViewerClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!viewerRef.current) return;
      if (!viewerCapture && drawMode === "pan") return;

      const rect = viewerRef.current.getBoundingClientRect();
      const x = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
      const y = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height));
      void handleViewerPoint({ x, y });
    },
    [drawMode, handleViewerPoint, viewerCapture]
  );

  useEffect(() => {
    void loadUserContext();
  }, [loadUserContext]);

  useEffect(() => {
    if (!loading) {
      void loadAvailableProjects();
    }
  }, [loadAvailableProjects, loading]);

  useEffect(() => {
    if (!loading) {
      const nextProjectId =
        contextProjectId || resolvedRouteProjectId || getProjectIdFallback() || null;

      if (!nextProjectId) {
        setProjectId(null);
        setProjectName("");
        return;
      }

      const projectFromContext =
        (contextProject?.id === nextProjectId ? contextProject : null) ||
        availableProjects.find((p) => p.id === nextProjectId) ||
        null;

      setProjectId(nextProjectId);
      setProjectName(
        getProjectDisplayName(projectFromContext) ||
          contextProjectName ||
          projectName ||
          ""
      );
      persistProjectFallback(nextProjectId);
    }
  }, [
    availableProjects,
    contextProject,
    contextProjectId,
    contextProjectName,
    loading,
    persistProjectFallback,
    projectName,
    resolvedRouteProjectId,
  ]);

  useEffect(() => {
    if (!loading && projectId) {
      void bootstrapTakeoff();
    }
  }, [bootstrapTakeoff, loading, projectId]);

  useEffect(() => {
    if (!activePageId) return;
    persistLocalPageState(activePageId, { detailNotes, boqLink });
  }, [activePageId, boqLink, detailNotes, persistLocalPageState]);

  useEffect(() => {
    return () => {
      if (autoSaveTimerRef.current) {
        window.clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, []);

  const renderOverlay = () => {
    const linePoints = viewerCapture?.mode === "line" ? viewerCapture.points : [];
    const areaPoints = viewerCapture?.mode === "area" ? viewerCapture.points : [];
    const calPoints =
      viewerCapture?.mode === "calibration" ? viewerCapture.points : [];

    return (
      <>
        {measurements.map((m) => (
          <React.Fragment key={m.id}>
            {m.type === "line" && m.points.length >= 2 && (
              <svg className="pointer-events-none absolute inset-0 h-full w-full">
                <line
                  x1={`${m.points[0].x * 100}%`}
                  y1={`${m.points[0].y * 100}%`}
                  x2={`${m.points[1].x * 100}%`}
                  y2={`${m.points[1].y * 100}%`}
                  stroke={m.id === selectedMeasurementId ? "#0f172a" : "#334155"}
                  strokeWidth={m.id === selectedMeasurementId ? 3 : 2}
                  strokeDasharray={m.id === selectedMeasurementId ? "0" : "6 4"}
                />
              </svg>
            )}

            {m.type === "area" && m.points.length >= 3 && (
              <svg className="pointer-events-none absolute inset-0 h-full w-full">
                <polygon
                  points={m.points.map((p) => `${p.x * 100},${p.y * 100}`).join(" ")}
                  fill="rgba(15,23,42,0.10)"
                  stroke={m.id === selectedMeasurementId ? "#0f172a" : "#334155"}
                  strokeWidth={m.id === selectedMeasurementId ? 3 : 2}
                />
              </svg>
            )}

            {m.type === "count" &&
              m.points.map((p, i) => (
                <div
                  key={`${m.id}_${i}`}
                  className="pointer-events-none absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-slate-900 shadow"
                  style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }}
                />
              ))}
          </React.Fragment>
        ))}

        {calibration?.p1 && (
          <div
            className="pointer-events-none absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-emerald-600 shadow"
            style={{
              left: `${calibration.p1.x * 100}%`,
              top: `${calibration.p1.y * 100}%`,
            }}
          />
        )}
        {calibration?.p2 && (
          <div
            className="pointer-events-none absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-emerald-600 shadow"
            style={{
              left: `${calibration.p2.x * 100}%`,
              top: `${calibration.p2.y * 100}%`,
            }}
          />
        )}
        {calibration?.p1 && calibration?.p2 && (
          <svg className="pointer-events-none absolute inset-0 h-full w-full">
            <line
              x1={`${calibration.p1.x * 100}%`}
              y1={`${calibration.p1.y * 100}%`}
              x2={`${calibration.p2.x * 100}%`}
              y2={`${calibration.p2.y * 100}%`}
              stroke="#059669"
              strokeWidth={3}
            />
          </svg>
        )}

        {linePoints.length >= 1 && (
          <div
            className="pointer-events-none absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-sky-600 shadow"
            style={{
              left: `${linePoints[0].x * 100}%`,
              top: `${linePoints[0].y * 100}%`,
            }}
          />
        )}
        {linePoints.length >= 2 && (
          <svg className="pointer-events-none absolute inset-0 h-full w-full">
            <line
              x1={`${linePoints[0].x * 100}%`}
              y1={`${linePoints[0].y * 100}%`}
              x2={`${linePoints[1].x * 100}%`}
              y2={`${linePoints[1].y * 100}%`}
              stroke="#0284c7"
              strokeWidth={3}
            />
          </svg>
        )}

        {areaPoints.map((p, i) => (
          <div
            key={`area_pt_${i}`}
            className="pointer-events-none absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-violet-600 shadow"
            style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }}
          />
        ))}
        {areaPoints.length >= 2 && (
          <svg className="pointer-events-none absolute inset-0 h-full w-full">
            <polyline
              points={areaPoints.map((p) => `${p.x * 100},${p.y * 100}`).join(" ")}
              fill="rgba(124,58,237,0.08)"
              stroke="#7c3aed"
              strokeWidth={3}
            />
          </svg>
        )}

        {calPoints.map((p, i) => (
          <div
            key={`cal_pt_${i}`}
            className="pointer-events-none absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-emerald-600 shadow"
            style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }}
          />
        ))}
        {calPoints.length >= 2 && (
          <svg className="pointer-events-none absolute inset-0 h-full w-full">
            <line
              x1={`${calPoints[0].x * 100}%`}
              y1={`${calPoints[0].y * 100}%`}
              x2={`${calPoints[1].x * 100}%`}
              y2={`${calPoints[1].y * 100}%`}
              stroke="#059669"
              strokeWidth={3}
            />
          </svg>
        )}
      </>
    );
  };

  const emptyState = (
    <div className="flex h-full items-center justify-center p-6">
      <div className="w-full max-w-xl rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-900 text-white">
          <PencilRuler className="h-7 w-7" />
        </div>
        <h2 className="text-xl font-semibold tracking-tight text-slate-900">
          Select a project to start takeoff
        </h2>
        <p className="mt-2 text-sm text-slate-500">
          This page now stays usable even when no active project is already set.
          Pick a project below and the takeoff session and first page will be created automatically.
        </p>

        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto]">
          <select
            value={projectId || ""}
            onChange={async (e) => {
              const next = availableProjects.find((p) => p.id === e.target.value) || null;
              await applySelectedProject(next);
            }}
            disabled={projectsLoading || changingProject}
            className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-slate-300 disabled:opacity-60"
          >
            <option value="">
              {projectsLoading ? "Loading projects..." : "Select project"}
            </option>
            {availableProjects.map((project) => (
              <option key={project.id} value={project.id}>
                {getProjectDisplayName(project) || project.id}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={async () => {
              const first = availableProjects[0] || null;
              if (first) {
                await applySelectedProject(first);
              }
            }}
            disabled={availableProjects.length === 0 || projectsLoading || changingProject}
            className="rounded-2xl bg-slate-900 px-5 py-3 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {changingProject ? "Opening..." : "Select Project"}
          </button>
        </div>

        <div className="mt-4 text-xs text-slate-500">
          {availableProjects.length > 0
            ? `${availableProjects.length} project${availableProjects.length === 1 ? "" : "s"} available`
            : projectsLoading
            ? "Loading available projects..."
            : "No projects found for this user/company yet."}
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <div className="mx-auto flex h-screen max-w-[1800px] flex-col gap-3 p-3">
        <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2.5 shadow-sm">
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <div className="rounded-xl bg-slate-900 p-2 text-white">
                    <PencilRuler className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <h1 className="truncate text-lg font-semibold tracking-tight">
                      Takeoff
                    </h1>
                    <p className="truncate text-xs text-slate-500">
                      {projectId
                        ? `Project: ${projectName || projectId}`
                        : "No project selected"}{" "}
                      • {activePageDisplayTitle}
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="min-w-[240px]">
                  <select
                    value={projectId || ""}
                    onChange={async (e) => {
                      const next =
                        availableProjects.find((p) => p.id === e.target.value) || null;
                      await applySelectedProject(next);
                    }}
                    disabled={projectsLoading || changingProject}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-300 disabled:opacity-60"
                  >
                    <option value="">
                      {projectsLoading ? "Loading projects..." : "Select project"}
                    </option>
                    {availableProjects.map((project) => (
                      <option key={project.id} value={project.id}>
                        {getProjectDisplayName(project) || project.id}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1">
                  <button
                    type="button"
                    onClick={() => void goToPage(Math.max(1, activePageNumber - 1))}
                    disabled={!canWork}
                    className="rounded-lg p-2 text-slate-600 hover:bg-white hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-40"
                    title="Previous page"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <div className="min-w-[84px] rounded-lg bg-white px-2.5 py-1.5 text-center text-sm font-medium shadow-sm ring-1 ring-slate-200">
                    Page {activePageNumber}
                  </div>
                  <button
                    type="button"
                    onClick={() => void goToPage(activePageNumber + 1)}
                    disabled={!canWork}
                    className="rounded-lg p-2 text-slate-600 hover:bg-white hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-40"
                    title="Next page"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => void addPage()}
                    disabled={!canWork}
                    className="rounded-lg p-2 text-slate-600 hover:bg-white hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-40"
                    title="Add page"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>

                <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1">
                  <button
                    type="button"
                    onClick={() => {
                      setFitMode("fit");
                      setZoom(1);
                    }}
                    className={clsx(
                      "rounded-lg px-3 py-1.5 text-xs font-medium transition",
                      fitMode === "fit"
                        ? "bg-slate-900 text-white shadow-sm"
                        : "text-slate-600 hover:bg-white hover:text-slate-900"
                    )}
                  >
                    Fit
                  </button>
                  <button
                    type="button"
                    onClick={() => setFitMode("actual")}
                    className={clsx(
                      "rounded-lg px-3 py-1.5 text-xs font-medium transition",
                      fitMode === "actual"
                        ? "bg-slate-900 text-white shadow-sm"
                        : "text-slate-600 hover:bg-white hover:text-slate-900"
                    )}
                  >
                    100%
                  </button>
                  <button
                    type="button"
                    onClick={() => setZoom((z) => Math.max(0.4, z - 0.1))}
                    className="rounded-lg p-2 text-slate-600 hover:bg-white hover:text-slate-900"
                  >
                    <Minimize2 className="h-4 w-4" />
                  </button>
                  <div className="min-w-[58px] text-center text-xs font-medium text-slate-700">
                    {Math.round(zoom * 100)}%
                  </div>
                  <button
                    type="button"
                    onClick={() => setZoom((z) => Math.min(3, z + 0.1))}
                    className="rounded-lg p-2 text-slate-600 hover:bg-white hover:text-slate-900"
                  >
                    <Maximize2 className="h-4 w-4" />
                  </button>
                </div>

                <button
                  type="button"
                  onClick={openCalibrationModal}
                  disabled={!canWork}
                  className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Compass className="h-4 w-4" />
                  Calibration
                  <span
                    className={clsx(
                      "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                      calibrationReady
                        ? "bg-emerald-600 text-white"
                        : "bg-white text-emerald-700 ring-1 ring-emerald-200"
                    )}
                  >
                    {calibrationReady ? "Set" : "Not set"}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => void saveActivePage()}
                  disabled={!canWork || saving}
                  className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Save className="h-4 w-4" />
                  {saving ? "Saving..." : "Save"}
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex flex-wrap items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1">
                {[
                  { key: "pan", label: "Pan", icon: MousePointer2 },
                  { key: "line", label: "Line", icon: Ruler },
                  { key: "area", label: "Area", icon: Square },
                  { key: "count", label: "Count", icon: Gauge },
                ].map((tool) => {
                  const Icon = tool.icon;
                  const isActive = drawMode === tool.key;
                  return (
                    <button
                      key={tool.key}
                      type="button"
                      disabled={!canWork}
                      onClick={() => {
                        setErrorText(null);
                        setDrawMode(tool.key as DrawMode);
                        setViewerCapture(
                          tool.key === "pan"
                            ? null
                            : { mode: tool.key as "line" | "area" | "count", points: [] }
                        );
                        setStatus(`${tool.label} mode selected`);
                      }}
                      className={clsx(
                        "inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium transition",
                        isActive
                          ? "bg-slate-900 text-white shadow-sm"
                          : "text-slate-600 hover:bg-white hover:text-slate-900",
                        !canWork && "cursor-not-allowed opacity-40"
                      )}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      {tool.label}
                    </button>
                  );
                })}

                {viewerCapture?.mode === "area" && canWork && (
                  <>
                    <button
                      type="button"
                      onClick={() => void completeAreaMeasurement()}
                      className="rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-violet-700"
                    >
                      Finish Area
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setViewerCapture({ mode: "area", points: [] });
                        setStatus("Area capture restarted");
                      }}
                      className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
                    >
                      Restart
                    </button>
                  </>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="relative min-w-[240px] flex-1 xl:w-[280px]">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                    placeholder="Search measurements..."
                    className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm outline-none placeholder:text-slate-400 focus:border-slate-300"
                  />
                </div>

                <div className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                  <Layers3 className="h-4 w-4" />
                  <span>{measurementSummary.total} items</span>
                  <span className="text-slate-300">|</span>
                  <span>{changingProject ? "Switching project..." : statusText}</span>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1">
              {TAB_OPTIONS.map((item) => {
                const Icon = item.icon;
                const isActive = tab === item.key;
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setTab(item.key)}
                    className={clsx(
                      "inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium transition",
                      isActive
                        ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200"
                        : "text-slate-600 hover:bg-white hover:text-slate-900"
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {item.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {errorText && (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 shadow-sm">
            {errorText}
          </div>
        )}

        {!projectId ? (
          emptyState
        ) : (
          <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 xl:grid-cols-[260px_minmax(0,1fr)_360px]">
            <div className="min-h-0 rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
                <div>
                  <h2 className="text-sm font-semibold text-slate-900">Pages</h2>
                  <p className="text-xs text-slate-500">
                    Session drawings and page navigation
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void addPage()}
                  disabled={!canWork}
                  className="rounded-lg border border-slate-200 bg-slate-50 p-2 text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                  title="Add page"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>

              <div className="flex h-[calc(100%-73px)] flex-col">
                <div className="border-b border-slate-100 px-4 py-3">
                  <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Session
                  </label>
                  <select
                    value={activeSessionId || ""}
                    onChange={async (e) => {
                      const nextSessionId = e.target.value || null;
                      setActiveSessionId(nextSessionId);
                      if (!nextSessionId) return;

                      const loadedPages = await loadPages(nextSessionId);
                      let nextPage =
                        loadedPages.find((p) => p.page_number === activePageNumber) ||
                        loadedPages[0] ||
                        null;

                      if (!nextPage) {
                        nextPage = await ensurePage(1, nextSessionId);
                      }

                      if (nextPage) {
                        setActivePageNumber(nextPage.page_number);
                        await hydratePageState(nextPage);
                      }
                    }}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-300"
                  >
                    <option value="">Create / Select session</option>
                    {sessions.map((session) => (
                      <option key={session.id} value={session.id}>
                        {session.name || session.id}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="min-h-0 flex-1 overflow-auto px-2 py-2">
                  {pageLoading ? (
                    <div className="px-3 py-8 text-center text-sm text-slate-500">
                      Loading pages...
                    </div>
                  ) : pages.length === 0 ? (
                    <div className="px-3 py-8 text-center text-sm text-slate-500">
                      Preparing page 1...
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {pages.map((page) => {
                        const isActive = page.page_number === activePageNumber;
                        return (
                          <button
                            key={page.id}
                            type="button"
                            onClick={() => void goToPage(page.page_number)}
                            className={clsx(
                              "w-full rounded-xl border px-3 py-3 text-left transition",
                              isActive
                                ? "border-slate-900 bg-slate-900 text-white shadow-sm"
                                : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                            )}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="min-w-0">
                                <div className="truncate text-sm font-semibold">
                                  {page.title || page.file_name || `Page ${page.page_number}`}
                                </div>
                                <div
                                  className={clsx(
                                    "truncate text-xs",
                                    isActive ? "text-slate-300" : "text-slate-500"
                                  )}
                                >
                                  Page {page.page_number}
                                </div>
                              </div>
                              {page.calibration_scale ? (
                                <span
                                  className={clsx(
                                    "rounded-full px-2 py-1 text-[10px] font-semibold",
                                    isActive
                                      ? "bg-white/15 text-white"
                                      : "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
                                  )}
                                >
                                  Calibrated
                                </span>
                              ) : null}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="min-h-0 rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
                <div className="min-w-0">
                  <h2 className="truncate text-sm font-semibold text-slate-900">
                    {activePageDisplayTitle}
                  </h2>
                  <p className="truncate text-xs text-slate-500">
                    {activePage?.preview_url
                      ? "Interactive drawing view"
                      : "Add a drawing URL or upload a local preview"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {calibrationReady && calibration && (
                    <div className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-200">
                      {formatMeasurement(calibration.distance, calibration.unit)}
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => void saveActivePage()}
                    disabled={!canWork || saving}
                    className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Save View
                  </button>
                </div>
              </div>

              <div className="flex h-[calc(100%-73px)] flex-col">
                <div className="border-b border-slate-100 px-4 py-3">
                  <div className="grid grid-cols-1 gap-2 lg:grid-cols-[1.1fr_1.4fr_auto]">
                    <input
                      value={pageTitleInput}
                      onChange={(e) => {
                        setPageTitleInput(e.target.value);
                        queueAutoSave({ title: e.target.value });
                      }}
                      placeholder="Page title"
                      className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-300"
                    />
                    <input
                      value={pageUrlInput}
                      onChange={(e) => {
                        setPageUrlInput(e.target.value);
                        queueAutoSave({ preview_url: e.target.value });
                      }}
                      placeholder="Drawing URL / public file URL"
                      className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-300"
                    />
                    <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100">
                      <Upload className="h-4 w-4" />
                      Local Preview
                      <input
                        type="file"
                        accept="image/*,.pdf"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          const localUrl = URL.createObjectURL(file);
                          const nextTitle = pageTitleInput || file.name;
                          setPageTitleInput(nextTitle);
                          setPageUrlInput(localUrl);
                          queueAutoSave({
                            title: nextTitle,
                            file_name: file.name,
                            preview_url: localUrl,
                          });
                          setStatus("Local preview attached");
                        }}
                      />
                    </label>
                  </div>
                </div>

                <div className="min-h-0 flex-1 overflow-hidden bg-slate-50 p-3">
                  <div
                    ref={viewerRef}
                    onClick={handleViewerClick}
                    className={clsx(
                      "relative h-full w-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-inner",
                      drawMode === "pan" ? "cursor-default" : "cursor-crosshair"
                    )}
                  >
                    <div
                      className="absolute inset-0 origin-center transition-transform"
                      style={{
                        transform: `scale(${zoom})`,
                      }}
                    >
                      {pageUrlInput ? (
                        pageUrlInput.toLowerCase().includes(".pdf") ? (
                          <iframe
                            src={pageUrlInput}
                            title="Drawing PDF"
                            className="h-full w-full"
                          />
                        ) : (
                          <img
                            src={pageUrlInput}
                            alt={activePageDisplayTitle}
                            className={clsx(
                              "h-full w-full",
                              fitMode === "fit" ? "object-contain" : "object-none"
                            )}
                          />
                        )
                      ) : (
                        <div className="flex h-full items-center justify-center">
                          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 py-8 text-center">
                            <PencilRuler className="mx-auto mb-3 h-8 w-8 text-slate-400" />
                            <div className="text-sm font-semibold text-slate-700">
                              No drawing loaded
                            </div>
                            <p className="mt-1 text-xs text-slate-500">
                              Add a drawing URL above or attach a local file preview.
                            </p>
                          </div>
                        </div>
                      )}
                      {renderOverlay()}
                    </div>

                    <div className="pointer-events-none absolute bottom-3 left-3 rounded-xl bg-white/90 px-3 py-2 text-[11px] font-medium text-slate-700 shadow ring-1 ring-slate-200 backdrop-blur">
                      Mode: {drawMode.toUpperCase()}
                      {viewerCapture?.mode === "area" && (
                        <span className="ml-2 text-violet-700">
                          • {viewerCapture.points.length} points
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="min-h-0 rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-200 px-4 py-3">
                <h2 className="text-sm font-semibold text-slate-900">
                  {TAB_OPTIONS.find((t) => t.key === tab)?.label}
                </h2>
                <p className="text-xs text-slate-500">
                  Context tools and page-specific data
                </p>
              </div>

              <div className="h-[calc(100%-73px)] overflow-auto">
                {tab === "drawings" && (
                  <div className="space-y-4 p-4">
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <div className="mb-2 text-sm font-semibold text-slate-900">
                        Drawing Summary
                      </div>
                      <div className="space-y-2 text-sm text-slate-600">
                        <div className="flex justify-between gap-3">
                          <span>Project</span>
                          <span className="font-medium text-slate-900">
                            {projectName || projectId || "—"}
                          </span>
                        </div>
                        <div className="flex justify-between gap-3">
                          <span>Page</span>
                          <span className="font-medium text-slate-900">
                            {activePageNumber}
                          </span>
                        </div>
                        <div className="flex justify-between gap-3">
                          <span>Calibration</span>
                          <span className="font-medium text-slate-900">
                            {calibrationReady ? "Configured" : "Not set"}
                          </span>
                        </div>
                        <div className="flex justify-between gap-3">
                          <span>Measurements</span>
                          <span className="font-medium text-slate-900">
                            {measurementSummary.total}
                          </span>
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={openCalibrationModal}
                      className="flex w-full items-center justify-between rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-left hover:bg-emerald-100"
                    >
                      <div>
                        <div className="text-sm font-semibold text-emerald-800">
                          Calibration
                        </div>
                        <div className="text-xs text-emerald-700">
                          Manage saved scale and reset points
                        </div>
                      </div>
                      <RefreshCcw className="h-4 w-4 text-emerald-700" />
                    </button>
                  </div>
                )}

                {tab === "measurements" && (
                  <div className="flex h-full flex-col">
                    <div className="grid grid-cols-3 gap-2 border-b border-slate-100 p-4">
                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                        <div className="text-[11px] uppercase tracking-wide text-slate-500">
                          Lines
                        </div>
                        <div className="mt-1 text-lg font-semibold text-slate-900">
                          {measurementSummary.lines}
                        </div>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                        <div className="text-[11px] uppercase tracking-wide text-slate-500">
                          Areas
                        </div>
                        <div className="mt-1 text-lg font-semibold text-slate-900">
                          {measurementSummary.areas}
                        </div>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                        <div className="text-[11px] uppercase tracking-wide text-slate-500">
                          Counts
                        </div>
                        <div className="mt-1 text-lg font-semibold text-slate-900">
                          {measurementSummary.counts}
                        </div>
                      </div>
                    </div>

                    <div className="min-h-0 flex-1 overflow-auto p-3">
                      {filteredMeasurements.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
                          No measurements yet. Use Line, Area, or Count tools to start.
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {filteredMeasurements.map((row) => {
                            const isActive = row.id === selectedMeasurementId;
                            return (
                              <div
                                key={row.id}
                                className={clsx(
                                  "rounded-2xl border p-3",
                                  isActive
                                    ? "border-slate-900 bg-slate-900 text-white"
                                    : "border-slate-200 bg-white"
                                )}
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <button
                                    type="button"
                                    onClick={() => setSelectedMeasurementId(row.id)}
                                    className="min-w-0 flex-1 text-left"
                                  >
                                    <div className="truncate text-sm font-semibold">
                                      {row.label}
                                    </div>
                                    <div
                                      className={clsx(
                                        "mt-1 text-xs",
                                        isActive ? "text-slate-300" : "text-slate-500"
                                      )}
                                    >
                                      {row.type.toUpperCase()} •{" "}
                                      {formatMeasurement(row.value, row.unit)}
                                    </div>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => void removeMeasurement(row.id)}
                                    className={clsx(
                                      "rounded-lg p-2",
                                      isActive
                                        ? "text-slate-300 hover:bg-white/10 hover:text-white"
                                        : "text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                                    )}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                </div>

                                {isActive && (
                                  <div className="mt-3 grid grid-cols-1 gap-2">
                                    <input
                                      value={row.label}
                                      onChange={(e) =>
                                        void updateMeasurement(row.id, {
                                          label: e.target.value,
                                        })
                                      }
                                      className="rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-sm text-white placeholder:text-slate-300 outline-none"
                                      placeholder="Measurement label"
                                    />
                                    <div className="grid grid-cols-2 gap-2">
                                      <input
                                        value={row.value}
                                        onChange={(e) =>
                                          void updateMeasurement(row.id, {
                                            value: Number(e.target.value || 0),
                                          })
                                        }
                                        className="rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-sm text-white outline-none"
                                        placeholder="Value"
                                        type="number"
                                        step="0.01"
                                      />
                                      <input
                                        value={row.unit}
                                        onChange={(e) =>
                                          void updateMeasurement(row.id, {
                                            unit: e.target.value,
                                          })
                                        }
                                        className="rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-sm text-white outline-none"
                                        placeholder="Unit"
                                      />
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {tab === "details" && (
                  <div className="space-y-4 p-4">
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <div className="mb-2 text-sm font-semibold text-slate-900">
                        Extracted Details
                      </div>
                      <textarea
                        value={detailNotes}
                        onChange={(e) => setDetailNotes(e.target.value)}
                        placeholder="Store extracted notes, plan marks, room references, elevations, etc."
                        className="min-h-[220px] w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm outline-none focus:border-slate-300"
                      />
                    </div>
                  </div>
                )}

                {tab === "boq" && (
                  <div className="space-y-4 p-4">
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <div className="mb-2 text-sm font-semibold text-slate-900">
                        BOQ Link / Reference
                      </div>
                      <input
                        value={boqLink}
                        onChange={(e) => setBoqLink(e.target.value)}
                        placeholder="Paste linked BOQ id, route, or note"
                        className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm outline-none focus:border-slate-300"
                      />
                      <p className="mt-2 text-xs text-slate-500">
                        Use this for a BOQ route, BOQ ID, estimate note, or future takeoff-to-BOQ mapping.
                      </p>
                    </div>
                  </div>
                )}

                {tab === "settings" && (
                  <div className="space-y-4 p-4">
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <div className="mb-3 text-sm font-semibold text-slate-900">
                        Page Settings
                      </div>
                      <div className="space-y-2 text-sm text-slate-600">
                        <div className="flex justify-between gap-3">
                          <span>Current project</span>
                          <span className="font-medium text-slate-900">
                            {projectName || projectId || "—"}
                          </span>
                        </div>
                        <div className="flex justify-between gap-3">
                          <span>Session</span>
                          <span className="font-medium text-slate-900">
                            {activeSessionId || "—"}
                          </span>
                        </div>
                        <div className="flex justify-between gap-3">
                          <span>Page</span>
                          <span className="font-medium text-slate-900">
                            {activePageNumber}
                          </span>
                        </div>
                        <div className="flex justify-between gap-3">
                          <span>Calibration</span>
                          <span className="font-medium text-slate-900">
                            {calibrationReady
                              ? formatMeasurement(
                                  calibration?.distance || 0,
                                  calibration?.unit || "ft"
                                )
                              : "Not set"}
                          </span>
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={async () => {
                        setErrorText(null);
                        await saveCalibrationToPage(null);
                        setStatus("Calibration reset");
                      }}
                      className="flex w-full items-center justify-between rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-left hover:bg-rose-100"
                    >
                      <div>
                        <div className="text-sm font-semibold text-rose-800">
                          Reset Calibration
                        </div>
                        <div className="text-xs text-rose-700">
                          Remove saved scale from this page
                        </div>
                      </div>
                      <X className="h-4 w-4 text-rose-700" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {showCalibrationModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
            <div className="w-full max-w-xl rounded-3xl border border-slate-200 bg-white shadow-2xl">
              <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
                <div>
                  <h3 className="text-base font-semibold text-slate-900">
                    Calibrate Drawing
                  </h3>
                  <p className="text-xs text-slate-500">
                    Pick two points and enter the real-world distance.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setShowCalibrationModal(false);
                    setViewerCapture(null);
                    setDrawMode("pan");
                  }}
                  className="rounded-xl p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="space-y-5 px-5 py-5">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="mb-2 text-sm font-semibold text-slate-900">
                    Points
                  </div>
                  <div className="grid grid-cols-1 gap-2 text-sm md:grid-cols-2">
                    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                      Point 1:{" "}
                      <span className="font-medium text-slate-900">
                        {calibrationDraft.p1
                          ? `${(calibrationDraft.p1.x * 100).toFixed(1)}%, ${(calibrationDraft.p1.y * 100).toFixed(1)}%`
                          : "Not selected"}
                      </span>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                      Point 2:{" "}
                      <span className="font-medium text-slate-900">
                        {calibrationDraft.p2
                          ? `${(calibrationDraft.p2.x * 100).toFixed(1)}%, ${(calibrationDraft.p2.y * 100).toFixed(1)}%`
                          : "Not selected"}
                      </span>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={startCalibrationCapture}
                      className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium hover:bg-slate-100"
                    >
                      Start / Restart
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        resetCalibrationDraft();
                        setStatus("Calibration draft reset");
                      }}
                      className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-medium text-rose-700 hover:bg-rose-100"
                    >
                      Reset
                    </button>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="mb-3 text-sm font-semibold text-slate-900">
                    Real Distance
                  </div>

                  <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-600">
                        Feet / Main
                      </label>
                      <input
                        value={calibrationForm.feet}
                        onChange={(e) =>
                          setCalibrationForm((prev) => ({
                            ...prev,
                            feet: e.target.value,
                          }))
                        }
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-300"
                        placeholder={calibrationForm.unit === "ft" ? "Feet" : "Value"}
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-600">
                        Inches
                      </label>
                      <input
                        value={calibrationForm.inches}
                        onChange={(e) =>
                          setCalibrationForm((prev) => ({
                            ...prev,
                            inches: e.target.value,
                          }))
                        }
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-300"
                        placeholder="Inches"
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-600">
                        Fraction
                      </label>
                      <select
                        value={calibrationForm.fraction}
                        onChange={(e) =>
                          setCalibrationForm((prev) => ({
                            ...prev,
                            fraction: e.target.value,
                          }))
                        }
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-300"
                      >
                        {FRACTION_OPTIONS.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-600">
                        Unit
                      </label>
                      <select
                        value={calibrationForm.unit}
                        onChange={(e) =>
                          setCalibrationForm((prev) => ({
                            ...prev,
                            unit: e.target.value as UnitType,
                          }))
                        }
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-300"
                      >
                        <option value="ft">ft</option>
                        <option value="m">m</option>
                        <option value="in">in</option>
                        <option value="mm">mm</option>
                      </select>
                    </div>
                  </div>

                  <div className="mt-3">
                    <label className="mb-1 block text-xs font-medium text-slate-600">
                      Direct Distance Override
                    </label>
                    <input
                      value={calibrationDraft.distanceText}
                      onChange={(e) =>
                        setCalibrationDraft((prev) => ({
                          ...prev,
                          distanceText: e.target.value,
                        }))
                      }
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-300"
                      placeholder="Optional direct distance value"
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-5 py-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowCalibrationModal(false);
                    setViewerCapture(null);
                    setDrawMode("pan");
                  }}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void applyCalibration()}
                  className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
                >
                  Apply Calibration
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}