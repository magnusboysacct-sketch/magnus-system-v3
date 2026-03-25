// src/pages/TakeoffPage.tsx
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Search,
  FolderTree,
  Package,
  Boxes,
  Ruler,
  Square,
  Hash,
  Move,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Save,
  X,
  ChevronLeft,
  ChevronRight,
  Plus,
  CheckCircle2,
  AlertCircle,
  FileText,
  Layers3,
  Settings,
  Link2,
  PencilRuler,
  FolderOpen,
} from "lucide-react";
import * as pdfjs from "pdfjs-dist";
import { supabase } from "../lib/supabase";

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

type ToolMode = "pan" | "line" | "area" | "count";
type RightTab =
  | "drawings"
  | "measurements"
  | "library"
  | "extracted"
  | "boq"
  | "settings";
type LibraryTab = "items" | "assemblies";
type PickerMode = "drawer" | "modal";

type Point = { x: number; y: number };

type TakeoffSessionRow = {
  id: string;
  project_id: string;
  name?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type TakeoffPageRow = {
  id: string;
  project_id: string;
  drawing_id: string | null;
  page_number: number;
  calibration_scale: number | null;
  calibration_unit: string | null;
  calibration_p1?: Point | null;
  calibration_p2?: Point | null;
  page_data: any;
  created_at?: string | null;
  updated_at?: string | null;
  session_id: string;
  page_label: string | null;
  width: number | null;
  height: number | null;
  calibration_point_1?: Point | null;
  calibration_point_2?: Point | null;
  calibration_distance?: number | null;
};

type MeasurementRow = {
  id: string;
  project_id: string;
  session_id: string | null;
  page_id: string | null;
  type: ToolMode;
  name?: string | null;
  points: Point[];
  quantity: number | null;
  unit: string | null;
  notes?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  meta?: any;
};

type CategoryRow = {
  id: string;
  name: string;
  code?: string | null;
};

type ItemRow = {
  id: string;
  name: string;
  item_code?: string | null;
  category_id?: string | null;
  description?: string | null;
  base_unit?: string | null;
  unit_type?: string | null;
  default_quantity?: number | null;
  is_active?: boolean | null;
};

type AssemblyRow = {
  id: string;
  name: string;
  assembly_code?: string | null;
  category_id?: string | null;
  description?: string | null;
  output_unit?: string | null;
  unit_type?: string | null;
  is_active?: boolean | null;
};

type DrawingAsset = {
  kind: "pdf" | "image";
  name: string;
  dataUrl: string;
  numPages?: number;
};

type CalibrationDraft = {
  p1: Point | null;
  p2: Point | null;
  distanceText: string;
  unit: string;
};

type LibrarySelection = {
  type: "item" | "assembly";
  id: string;
  name: string;
  code?: string | null;
  unit?: string | null;
  unitType?: string | null;
};

const FRACTIONS = [
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

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function isPoint(v: any): v is Point {
  return !!v && typeof v.x === "number" && typeof v.y === "number";
}

function parseFraction(v: string) {
  if (!v || v === "0") return 0;
  const [a, b] = v.split("/");
  const n = Number(a);
  const d = Number(b);
  if (!Number.isFinite(n) || !Number.isFinite(d) || d === 0) return 0;
  return n / d;
}

function feetFromFIS(feet: string, inches: string, fraction: string) {
  const f = Number(feet || 0);
  const i = Number(inches || 0);
  return f + i / 12 + parseFraction(fraction) / 12;
}

function distancePx(a: Point, b: Point) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function lineLength(points: Point[]) {
  if (points.length < 2) return 0;
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    total += distancePx(points[i - 1], points[i]);
  }
  return total;
}

function polygonArea(points: Point[]) {
  if (points.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum / 2);
}

function formatNumber(n: number | null | undefined, digits = 2) {
  if (n == null || Number.isNaN(n)) return "—";
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  });
}

function formatDate(d?: string | null) {
  if (!d) return "";
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString();
}

function getPageAsset(page: TakeoffPageRow | null): DrawingAsset | null {
  if (!page?.page_data) return null;
  const pd = page.page_data || {};
  if (pd.asset?.dataUrl && pd.asset?.kind) return pd.asset as DrawingAsset;
  if (pd.drawing?.dataUrl && pd.drawing?.kind) return pd.drawing as DrawingAsset;
  if (typeof pd.imageDataUrl === "string") {
    return {
      kind: "image",
      name: page.page_label || `Page ${page.page_number}`,
      dataUrl: pd.imageDataUrl,
    };
  }
  return null;
}

function toSvgPoint(
  e: React.MouseEvent<SVGSVGElement, MouseEvent>,
  svgEl: SVGSVGElement
): Point {
  const pt = svgEl.createSVGPoint();
  pt.x = e.clientX;
  pt.y = e.clientY;
  const transformed = pt.matrixTransform(svgEl.getScreenCTM()?.inverse());
  return { x: transformed.x, y: transformed.y };
}

function toolLabel(mode: ToolMode) {
  if (mode === "line") return "Linear";
  if (mode === "area") return "Area";
  if (mode === "count") return "Count";
  return "Pan";
}

function measurementUnit(type: ToolMode, page: TakeoffPageRow | null) {
  const u = page?.calibration_unit || "ft";
  if (type === "line") return u;
  if (type === "area") return `${u}²`;
  if (type === "count") return "ea";
  return "";
}

function computeMeasurementQuantity(
  type: ToolMode,
  points: Point[],
  page: TakeoffPageRow | null
) {
  if (type === "count") return points.length;
  const p1 = page?.calibration_point_1;
  const p2 = page?.calibration_point_2;
  const realDist = page?.calibration_distance || page?.calibration_scale;
  if (!isPoint(p1) || !isPoint(p2) || !realDist) {
    if (type === "line") return lineLength(points);
    if (type === "area") return polygonArea(points);
    return 0;
  }
  const px = distancePx(p1, p2);
  if (!px) return 0;
  const scale = realDist / px;
  if (type === "line") return lineLength(points) * scale;
  if (type === "area") return polygonArea(points) * scale * scale;
  return 0;
}

export default function TakeoffPage() {
  const navigate = useNavigate();
  const params = useParams<{ projectId: string }>();
  const projectId = params.projectId || "";

  const viewerRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const saveTimerRef = useRef<number | null>(null);
  const isMountedRef = useRef(true);

  const [loading, setLoading] = useState(true);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">(
    "idle"
  );
  const [errorText, setErrorText] = useState<string>("");

  const [session, setSession] = useState<TakeoffSessionRow | null>(null);
  const [pages, setPages] = useState<TakeoffPageRow[]>([]);
  const [activePageId, setActivePageId] = useState<string>("");
  const activePage = useMemo(
    () => pages.find((p) => p.id === activePageId) || pages[0] || null,
    [pages, activePageId]
  );

  const [measurements, setMeasurements] = useState<MeasurementRow[]>([]);
  const [activeTool, setActiveTool] = useState<ToolMode>("pan");
  const [draftPoints, setDraftPoints] = useState<Point[]>([]);
  const [selectedMeasurementId, setSelectedMeasurementId] = useState<string>("");

  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState<Point | null>(null);

  const [rightTab, setRightTab] = useState<RightTab>("drawings");
  const [libraryTab, setLibraryTab] = useState<LibraryTab>("items");
  const [pickerMode, setPickerMode] = useState<PickerMode>("drawer");
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [librarySearch, setLibrarySearch] = useState("");
  const [libraryCategoryId, setLibraryCategoryId] = useState("all");
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [items, setItems] = useState<ItemRow[]>([]);
  const [assemblies, setAssemblies] = useState<AssemblyRow[]>([]);
  const [linkedSelection, setLinkedSelection] = useState<LibrarySelection | null>(
    null
  );

  const [showCalibrationModal, setShowCalibrationModal] = useState(false);
  const [calibrationDraft, setCalibrationDraft] = useState<CalibrationDraft>({
    p1: null,
    p2: null,
    distanceText: "1",
    unit: "ft",
  });
  const [calibrationForm, setCalibrationForm] = useState({
    feet: "",
    inches: "",
    fraction: "0",
    unit: "ft",
  });
  const [isPickingCalibration, setIsPickingCalibration] = useState(false);
  const [calibrationReopenAfterPoint2, setCalibrationReopenAfterPoint2] =
    useState(false);

  const [pdfNumPages, setPdfNumPages] = useState<number>(0);

  const activePageMeasurements = useMemo(
    () => measurements.filter((m) => m.page_id === activePage?.id),
    [measurements, activePage?.id]
  );

  const selectedMeasurement = useMemo(
    () => measurements.find((m) => m.id === selectedMeasurementId) || null,
    [measurements, selectedMeasurementId]
  );

  const filteredCategories = useMemo(() => {
    const s = librarySearch.trim().toLowerCase();
    if (!s) return categories;
    return categories.filter(
      (c) =>
        c.name.toLowerCase().includes(s) ||
        (c.code || "").toLowerCase().includes(s)
    );
  }, [categories, librarySearch]);

  const filteredItems = useMemo(() => {
    const s = librarySearch.trim().toLowerCase();
    return items.filter((row) => {
      const catMatch =
        libraryCategoryId === "all" || row.category_id === libraryCategoryId;
      const searchMatch =
        !s ||
        row.name.toLowerCase().includes(s) ||
        (row.item_code || "").toLowerCase().includes(s) ||
        (row.description || "").toLowerCase().includes(s);
      return catMatch && searchMatch;
    });
  }, [items, librarySearch, libraryCategoryId]);

  const filteredAssemblies = useMemo(() => {
    const s = librarySearch.trim().toLowerCase();
    return assemblies.filter((row) => {
      const catMatch =
        libraryCategoryId === "all" || row.category_id === libraryCategoryId;
      const searchMatch =
        !s ||
        row.name.toLowerCase().includes(s) ||
        (row.assembly_code || "").toLowerCase().includes(s) ||
        (row.description || "").toLowerCase().includes(s);
      return catMatch && searchMatch;
    });
  }, [assemblies, librarySearch, libraryCategoryId]);

  const activeAsset = useMemo(() => getPageAsset(activePage), [activePage]);

  const updateSaveState = useCallback((state: typeof saveState) => {
    setSaveState(state);
    if (state === "saved") {
      window.clearTimeout(saveTimerRef.current ?? undefined);
      saveTimerRef.current = window.setTimeout(() => {
        if (isMountedRef.current) setSaveState("idle");
      }, 1500);
    }
  }, []);

  const loadProjectContext = useCallback(async () => {
    if (!projectId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setErrorText("");

    try {
      const { data: auth } = await supabase.auth.getUser();
      const user = auth?.user;
      if (!user) {
        setLoading(false);
        return;
      }

      const sessionQuery = await supabase
        .from("takeoff_sessions")
        .select("*")
        .eq("project_id", projectId)
        .order("created_at", { ascending: true })
        .limit(1);

      let currentSession = (sessionQuery.data?.[0] || null) as TakeoffSessionRow | null;

      if (!currentSession) {
        const insertSession = await supabase
          .from("takeoff_sessions")
          .insert({
            project_id: projectId,
            name: "Default Takeoff Session",
          })
          .select("*")
          .limit(1);

        currentSession = (insertSession.data?.[0] || null) as TakeoffSessionRow | null;
      }

      setSession(currentSession);

      if (!currentSession?.id) {
        throw new Error("Unable to create or load takeoff session.");
      }

      const pagesQuery = await supabase
        .from("takeoff_pages")
        .select("*")
        .eq("project_id", projectId)
        .eq("session_id", currentSession.id)
        .order("page_number", { ascending: true });

      let pageRows = (pagesQuery.data || []) as TakeoffPageRow[];

      if (!pageRows.length) {
        const newPageInsert = await supabase
          .from("takeoff_pages")
          .insert({
            project_id: projectId,
            session_id: currentSession.id,
            page_number: 1,
            page_label: "Page 1",
            page_data: {},
            width: 1200,
            height: 900,
            calibration_scale: null,
            calibration_unit: "ft",
            calibration_distance: null,
            calibration_point_1: null,
            calibration_point_2: null,
          })
          .select("*");

        pageRows = (newPageInsert.data || []) as TakeoffPageRow[];
      }

      setPages(pageRows);
      setActivePageId((prev) => prev || pageRows[0]?.id || "");

      const measurementsQuery = await supabase
        .from("takeoff_measurements")
        .select("*")
        .eq("project_id", projectId)
        .eq("session_id", currentSession.id)
        .order("created_at", { ascending: true });

      const measurementRows = ((measurementsQuery.data || []) as any[]).map((row) => ({
        ...row,
        points: Array.isArray(row.points) ? row.points : [],
        meta: row.meta || {},
      })) as MeasurementRow[];

      setMeasurements(measurementRows);

      const [categoriesRes, itemsRes, assembliesRes] = await Promise.all([
        supabase
          .from("master_categories")
          .select("id,name,code")
          .order("sort_order", { ascending: true, nullsFirst: false })
          .order("name", { ascending: true }),
        supabase
          .from("items")
          .select(
            "id,name,item_code,category_id,description,base_unit,unit_type,default_quantity,is_active"
          )
          .eq("is_active", true)
          .order("name", { ascending: true }),
        supabase
          .from("assemblies")
          .select(
            "id,name,assembly_code,category_id,description,output_unit,unit_type,is_active"
          )
          .eq("is_active", true)
          .order("name", { ascending: true }),
      ]);

      setCategories((categoriesRes.data || []) as CategoryRow[]);
      setItems((itemsRes.data || []) as ItemRow[]);
      setAssemblies((assembliesRes.data || []) as AssemblyRow[]);
    } catch (err: any) {
      setErrorText(err?.message || "Failed to load Takeoff page.");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    isMountedRef.current = true;
    loadProjectContext();
    return () => {
      isMountedRef.current = false;
      window.clearTimeout(saveTimerRef.current ?? undefined);
    };
  }, [loadProjectContext]);

  useEffect(() => {
    if (!activePage) return;

    const p1 = activePage.calibration_point_1 || activePage.calibration_p1 || null;
    const p2 = activePage.calibration_point_2 || activePage.calibration_p2 || null;

    setCalibrationDraft({
      p1: isPoint(p1) ? p1 : null,
      p2: isPoint(p2) ? p2 : null,
      distanceText: activePage.calibration_distance
        ? String(activePage.calibration_distance)
        : activePage.calibration_scale
        ? String(activePage.calibration_scale)
        : "1",
      unit: activePage.calibration_unit || "ft",
    });

    setCalibrationForm((prev) => ({
      ...prev,
      unit: activePage.calibration_unit || prev.unit || "ft",
    }));
  }, [activePage]);

  const upsertPage = useCallback(
    async (pageId: string, patch: Partial<TakeoffPageRow>) => {
      if (!pageId) return;

      updateSaveState("saving");
      const payload: any = {
        ...patch,
        updated_at: new Date().toISOString(),
      };

      const res = await supabase
        .from("takeoff_pages")
        .update(payload)
        .eq("id", pageId)
        .select("*")
        .limit(1);

      if (res.error) {
        setErrorText(res.error.message);
        updateSaveState("error");
        return;
      }

      const updated = (res.data?.[0] || null) as TakeoffPageRow | null;
      if (!updated) {
        updateSaveState("saved");
        return;
      }

      setPages((prev) => prev.map((p) => (p.id === pageId ? { ...p, ...updated } : p)));
      updateSaveState("saved");
    },
    [updateSaveState]
  );

  const createNewPage = useCallback(async () => {
    if (!session?.id || !projectId) return;

    const nextNumber =
      pages.reduce((max, p) => Math.max(max, p.page_number || 0), 0) + 1;

    updateSaveState("saving");
    const res = await supabase
      .from("takeoff_pages")
      .insert({
        project_id: projectId,
        session_id: session.id,
        page_number: nextNumber,
        page_label: `Page ${nextNumber}`,
        page_data: {},
        width: 1200,
        height: 900,
        calibration_unit: "ft",
      })
      .select("*");

    if (res.error) {
      setErrorText(res.error.message);
      updateSaveState("error");
      return;
    }

    const row = (res.data?.[0] || null) as TakeoffPageRow | null;
    if (row) {
      setPages((prev) => [...prev, row]);
      setActivePageId(row.id);
    }
    updateSaveState("saved");
  }, [pages, projectId, session?.id, updateSaveState]);

  const removeMeasurementDraft = useCallback(() => {
    setDraftPoints([]);
  }, []);

  const saveMeasurement = useCallback(
    async (type: ToolMode, points: Point[]) => {
      if (!projectId || !session?.id || !activePage?.id || !points.length) return;

      const quantity = computeMeasurementQuantity(type, points, activePage);
      const unit = measurementUnit(type, activePage);

      updateSaveState("saving");
      const res = await supabase
        .from("takeoff_measurements")
        .insert({
          project_id: projectId,
          session_id: session.id,
          page_id: activePage.id,
          type,
          name: `${toolLabel(type)} ${activePageMeasurements.length + 1}`,
          points,
          quantity,
          unit,
          meta: linkedSelection
            ? {
                linked_library_type: linkedSelection.type,
                linked_library_id: linkedSelection.id,
                linked_library_name: linkedSelection.name,
                linked_library_code: linkedSelection.code || null,
                linked_library_unit: linkedSelection.unit || null,
                linked_library_unit_type: linkedSelection.unitType || null,
              }
            : {},
        })
        .select("*");

      if (res.error) {
        setErrorText(res.error.message);
        updateSaveState("error");
        return;
      }

      const row = (res.data?.[0] || null) as any;
      if (row) {
        const mapped: MeasurementRow = {
          ...row,
          points: Array.isArray(row.points) ? row.points : [],
          meta: row.meta || {},
        };
        setMeasurements((prev) => [...prev, mapped]);
        setSelectedMeasurementId(mapped.id);
      }

      setDraftPoints([]);
      updateSaveState("saved");
    },
    [
      activePage,
      activePageMeasurements.length,
      linkedSelection,
      projectId,
      session?.id,
      updateSaveState,
    ]
  );

  const deleteMeasurement = useCallback(
    async (id: string) => {
      if (!id) return;
      updateSaveState("saving");
      const res = await supabase.from("takeoff_measurements").delete().eq("id", id);
      if (res.error) {
        setErrorText(res.error.message);
        updateSaveState("error");
        return;
      }
      setMeasurements((prev) => prev.filter((m) => m.id !== id));
      if (selectedMeasurementId === id) setSelectedMeasurementId("");
      updateSaveState("saved");
    },
    [selectedMeasurementId, updateSaveState]
  );

  const startCalibrationPick = useCallback(() => {
    setCalibrationDraft((prev) => ({ ...prev, p1: null, p2: null }));
    setIsPickingCalibration(true);
    setCalibrationReopenAfterPoint2(true);
    setShowCalibrationModal(false);
    setActiveTool("pan");
    removeMeasurementDraft();
  }, [removeMeasurementDraft]);

  const startCalibrationPickSecondary = useCallback(() => {
    setCalibrationDraft((prev) => ({ ...prev, p1: null, p2: null }));
    setIsPickingCalibration(true);
    setCalibrationReopenAfterPoint2(true);
    setShowCalibrationModal(false);
    setActiveTool("pan");
    removeMeasurementDraft();
  }, [removeMeasurementDraft]);

  const applyCalibration = useCallback(async () => {
    if (!activePage?.id || !calibrationDraft.p1 || !calibrationDraft.p2) return;

    const fisValue = feetFromFIS(
      calibrationForm.feet,
      calibrationForm.inches,
      calibrationForm.fraction
    );
    const fallbackValue = Number(calibrationDraft.distanceText || 0);
    const distance =
      calibrationForm.unit === "ft" && (calibrationForm.feet || calibrationForm.inches)
        ? fisValue
        : fallbackValue;

    if (!distance || Number.isNaN(distance) || distance <= 0) return;

    const patch: Partial<TakeoffPageRow> = {
      calibration_unit: calibrationForm.unit || calibrationDraft.unit || "ft",
      calibration_distance: distance,
      calibration_scale: distance,
      calibration_point_1: calibrationDraft.p1,
      calibration_point_2: calibrationDraft.p2,
      calibration_p1: calibrationDraft.p1,
      calibration_p2: calibrationDraft.p2,
      page_data: {
        ...(activePage.page_data || {}),
        calibration: {
          p1: calibrationDraft.p1,
          p2: calibrationDraft.p2,
          unit: calibrationForm.unit || calibrationDraft.unit || "ft",
          distance,
        },
      },
    };

    await upsertPage(activePage.id, patch);
    setShowCalibrationModal(false);
    setIsPickingCalibration(false);
    setCalibrationReopenAfterPoint2(false);
  }, [activePage, calibrationDraft, calibrationForm, upsertPage]);

  const resetCalibration = useCallback(async () => {
    if (!activePage?.id) return;
    setCalibrationDraft({
      p1: null,
      p2: null,
      distanceText: "1",
      unit: "ft",
    });
    setCalibrationForm({
      feet: "",
      inches: "",
      fraction: "0",
      unit: "ft",
    });
    await upsertPage(activePage.id, {
      calibration_unit: "ft",
      calibration_distance: null,
      calibration_scale: null,
      calibration_point_1: null,
      calibration_point_2: null,
      calibration_p1: null,
      calibration_p2: null,
      page_data: {
        ...(activePage.page_data || {}),
        calibration: null,
      },
    });
  }, [activePage, upsertPage]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (!viewerRef.current) return;
    e.preventDefault();
    const delta = e.deltaY < 0 ? 0.1 : -0.1;
    setZoom((prev) => Math.min(4, Math.max(0.25, +(prev + delta).toFixed(2))));
  }, []);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (activeTool !== "pan") return;
      setIsPanning(true);
      setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    },
    [activeTool, pan.x, pan.y]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isPanning || !panStart) return;
      setPan({ x: e.clientX - panStart.x, y: e.clientY - panStart.y });
    },
    [isPanning, panStart]
  );

  const handleMouseUp = useCallback(() => {
    setIsPanning(false);
    setPanStart(null);
  }, []);

  const handleCanvasClick = useCallback(
    async (e: React.MouseEvent<SVGSVGElement, MouseEvent>) => {
      if (!activePage || !svgRef.current) return;
      const pt = toSvgPoint(e, svgRef.current);

      if (isPickingCalibration) {
        if (!calibrationDraft.p1) {
          setCalibrationDraft((prev) => ({ ...prev, p1: pt }));
          return;
        }
        if (!calibrationDraft.p2) {
          setCalibrationDraft((prev) => ({ ...prev, p2: pt }));
          setIsPickingCalibration(false);
          if (calibrationReopenAfterPoint2) {
            setTimeout(() => {
              if (!isMountedRef.current) return;
              setShowCalibrationModal(true);
            }, 50);
          }
          return;
        }
      }

      if (activeTool === "pan") return;

      if (activeTool === "count") {
        await saveMeasurement("count", [pt]);
        return;
      }

      if (activeTool === "line") {
        const next = [...draftPoints, pt];
        setDraftPoints(next);
        if (next.length >= 2) {
          await saveMeasurement("line", next);
        }
        return;
      }

      if (activeTool === "area") {
        const next = [...draftPoints, pt];
        setDraftPoints(next);
      }
    },
    [
      activePage,
      activeTool,
      calibrationDraft.p1,
      calibrationDraft.p2,
      calibrationReopenAfterPoint2,
      draftPoints,
      isPickingCalibration,
      saveMeasurement,
    ]
  );

  const finishAreaMeasurement = useCallback(async () => {
    if (activeTool !== "area" || draftPoints.length < 3) return;
    await saveMeasurement("area", draftPoints);
  }, [activeTool, draftPoints, saveMeasurement]);

  const openUpload = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleUploadFile = useCallback(
    async (file: File) => {
      if (!activePage?.id) return;
      const reader = new FileReader();

      reader.onload = async () => {
        const dataUrl = String(reader.result || "");
        const kind: "pdf" | "image" = file.type.includes("pdf") ? "pdf" : "image";
        const asset: DrawingAsset = {
          kind,
          name: file.name,
          dataUrl,
        };

        const pageData = {
          ...(activePage.page_data || {}),
          asset,
          uploadedAt: new Date().toISOString(),
        };

        await upsertPage(activePage.id, {
          page_label: activePage.page_label || file.name.replace(/\.[^.]+$/, ""),
          page_data: pageData,
        });
      };

      reader.readAsDataURL(file);
    },
    [activePage, upsertPage]
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      handleUploadFile(file);
      e.target.value = "";
    },
    [handleUploadFile]
  );

  const handlePdfLoaded = useCallback(
    async (numPages: number) => {
      setPdfNumPages(numPages);
      if (!activePage?.id) return;
      await upsertPage(activePage.id, {
        page_data: {
          ...(activePage.page_data || {}),
          asset: {
            ...(activePage.page_data?.asset || activeAsset || {}),
            numPages,
          },
        },
      });
    },
    [activeAsset, activePage, upsertPage]
  );

  const linkLibrarySelection = useCallback(
    (entry: LibrarySelection) => {
      setLinkedSelection(entry);
      setLibraryOpen(false);
      setRightTab("library");
    },
    []
  );

  const currentCategoryName = useMemo(() => {
    if (libraryCategoryId === "all") return "All Categories";
    return categories.find((c) => c.id === libraryCategoryId)?.name || "Category";
  }, [categories, libraryCategoryId]);

  if (!projectId) {
    return (
      <div className="flex h-full min-h-[70vh] items-center justify-center bg-slate-950 text-slate-100">
        <div className="w-full max-w-xl rounded-2xl border border-slate-800 bg-slate-900 p-8 text-center shadow-2xl">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-slate-700 bg-slate-800">
            <FolderOpen className="h-7 w-7 text-cyan-300" />
          </div>
          <h2 className="text-xl font-semibold">No project selected</h2>
          <p className="mt-2 text-sm text-slate-400">
            Open Takeoff from a selected project route.
          </p>
          <button
            onClick={() => navigate("/projects")}
            className="mt-6 rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-4 py-2 text-sm font-medium text-cyan-200 hover:bg-cyan-500/20"
          >
            Go to Projects
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-[calc(100vh-72px)] flex-col bg-slate-950 text-slate-100">
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,image/*"
        className="hidden"
        onChange={handleFileInput}
      />

      <div className="border-b border-slate-800 bg-slate-900/95 px-3 py-2 backdrop-blur">
        <div className="flex flex-wrap items-center gap-2">
          <div className="mr-2 flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-900 px-2.5 py-2">
            <button
              onClick={() => setActiveTool("pan")}
              className={cn(
                "rounded-lg px-2.5 py-1.5 text-xs font-medium transition",
                activeTool === "pan"
                  ? "bg-cyan-500/20 text-cyan-200"
                  : "text-slate-300 hover:bg-slate-800"
              )}
            >
              <span className="flex items-center gap-1.5">
                <Move className="h-3.5 w-3.5" />
                Pan
              </span>
            </button>
            <button
              onClick={() => setActiveTool("line")}
              className={cn(
                "rounded-lg px-2.5 py-1.5 text-xs font-medium transition",
                activeTool === "line"
                  ? "bg-cyan-500/20 text-cyan-200"
                  : "text-slate-300 hover:bg-slate-800"
              )}
            >
              <span className="flex items-center gap-1.5">
                <Ruler className="h-3.5 w-3.5" />
                Line
              </span>
            </button>
            <button
              onClick={() => setActiveTool("area")}
              className={cn(
                "rounded-lg px-2.5 py-1.5 text-xs font-medium transition",
                activeTool === "area"
                  ? "bg-cyan-500/20 text-cyan-200"
                  : "text-slate-300 hover:bg-slate-800"
              )}
            >
              <span className="flex items-center gap-1.5">
                <Square className="h-3.5 w-3.5" />
                Area
              </span>
            </button>
            <button
              onClick={() => setActiveTool("count")}
              className={cn(
                "rounded-lg px-2.5 py-1.5 text-xs font-medium transition",
                activeTool === "count"
                  ? "bg-cyan-500/20 text-cyan-200"
                  : "text-slate-300 hover:bg-slate-800"
              )}
            >
              <span className="flex items-center gap-1.5">
                <Hash className="h-3.5 w-3.5" />
                Count
              </span>
            </button>
          </div>

          <div className="flex items-center gap-1 rounded-xl border border-slate-800 bg-slate-900 px-2 py-1.5">
            <button
              onClick={() => setZoom((z) => Math.max(0.25, +(z - 0.1).toFixed(2)))}
              className="rounded-lg p-1.5 text-slate-300 hover:bg-slate-800"
            >
              <ZoomOut className="h-4 w-4" />
            </button>
            <div className="min-w-[58px] text-center text-xs font-medium text-slate-200">
              {Math.round(zoom * 100)}%
            </div>
            <button
              onClick={() => setZoom((z) => Math.min(4, +(z + 0.1).toFixed(2)))}
              className="rounded-lg p-1.5 text-slate-300 hover:bg-slate-800"
            >
              <ZoomIn className="h-4 w-4" />
            </button>
            <button
              onClick={() => {
                setZoom(1);
                setPan({ x: 0, y: 0 });
              }}
              className="ml-1 rounded-lg p-1.5 text-slate-300 hover:bg-slate-800"
            >
              <RotateCcw className="h-4 w-4" />
            </button>
          </div>

          <button
            onClick={() => setShowCalibrationModal(true)}
            className="flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-200 hover:bg-amber-500/20"
          >
            <PencilRuler className="h-4 w-4" />
            Calibration
            {activePage?.calibration_distance ? (
              <span className="rounded-md bg-emerald-500/15 px-1.5 py-0.5 text-[10px] text-emerald-300">
                Saved
              </span>
            ) : (
              <span className="rounded-md bg-slate-700 px-1.5 py-0.5 text-[10px] text-slate-300">
                Not Set
              </span>
            )}
          </button>

          <button
            onClick={openUpload}
            className="rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-xs font-medium text-slate-200 hover:bg-slate-800"
          >
            Upload Drawing
          </button>

          <button
            onClick={createNewPage}
            className="rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-xs font-medium text-slate-200 hover:bg-slate-800"
          >
            Add Page
          </button>

          <button
            onClick={() => {
              setRightTab("library");
              setLibraryOpen(true);
            }}
            className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-xs font-medium text-cyan-200 hover:bg-cyan-500/20"
          >
            {linkedSelection ? (
              <span className="flex items-center gap-2">
                <Link2 className="h-4 w-4" />
                Linked: {linkedSelection.name}
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <FolderTree className="h-4 w-4" />
                Pick Item / Assembly
              </span>
            )}
          </button>

          <div className="ml-auto flex items-center gap-2">
            {saveState === "saving" && (
              <div className="flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-slate-300">
                <Save className="h-4 w-4" />
                Saving...
              </div>
            )}
            {saveState === "saved" && (
              <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">
                <CheckCircle2 className="h-4 w-4" />
                Saved
              </div>
            )}
            {saveState === "error" && (
              <div className="flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
                <AlertCircle className="h-4 w-4" />
                Save Error
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-[240px_minmax(0,1fr)_340px] gap-0">
        <aside className="flex min-h-0 flex-col border-r border-slate-800 bg-slate-925">
          <div className="border-b border-slate-800 px-3 py-3">
            <div className="text-sm font-semibold text-slate-100">Pages</div>
            <div className="mt-1 text-xs text-slate-400">
              Session: {session?.name || "Default"}
            </div>
          </div>

          <div className="flex-1 space-y-2 overflow-auto p-3">
            {pages.map((page) => {
              const pageAsset = getPageAsset(page);
              const isActive = page.id === activePage?.id;

              return (
                <button
                  key={page.id}
                  onClick={() => setActivePageId(page.id)}
                  className={cn(
                    "w-full overflow-hidden rounded-2xl border text-left transition",
                    isActive
                      ? "border-cyan-500/40 bg-cyan-500/10"
                      : "border-slate-800 bg-slate-900 hover:bg-slate-850"
                  )}
                >
                  <div className="flex items-center justify-between border-b border-slate-800 px-3 py-2">
                    <div className="text-sm font-medium text-slate-100">
                      {page.page_label || `Page ${page.page_number}`}
                    </div>
                    <div className="text-[11px] text-slate-400">#{page.page_number}</div>
                  </div>
                  <div className="p-3">
                    <div className="flex h-28 items-center justify-center rounded-xl border border-dashed border-slate-700 bg-slate-950 text-xs text-slate-500">
                      {pageAsset ? pageAsset.name : "No drawing"}
                    </div>
                    <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400">
                      <span>
                        {page.calibration_distance
                          ? `${formatNumber(page.calibration_distance)} ${page.calibration_unit || "ft"}`
                          : "Not calibrated"}
                      </span>
                      <span>
                        {
                          measurements.filter((m) => m.page_id === page.id).length
                        }{" "}
                        qty
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </aside>

        <main className="relative min-h-0 overflow-hidden bg-slate-950">
          <div className="flex h-full flex-col">
            <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
              <div>
                <div className="text-sm font-semibold text-slate-100">
                  {activePage?.page_label || "Untitled Page"}
                </div>
                <div className="mt-1 text-xs text-slate-400">
                  Tool: {toolLabel(activeTool)}
                  {linkedSelection ? ` • Linked: ${linkedSelection.name}` : ""}
                </div>
              </div>

              <div className="flex items-center gap-2">
                {activeTool === "area" && draftPoints.length >= 3 && (
                  <button
                    onClick={finishAreaMeasurement}
                    className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-medium text-emerald-200 hover:bg-emerald-500/20"
                  >
                    Finish Area
                  </button>
                )}
                {!!draftPoints.length && (
                  <button
                    onClick={removeMeasurementDraft}
                    className="rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-xs font-medium text-slate-200 hover:bg-slate-800"
                  >
                    Cancel Draft
                  </button>
                )}
              </div>
            </div>

            <div
              ref={viewerRef}
              className="relative flex-1 overflow-hidden"
              onWheel={handleWheel}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
            >
              <div
                className="absolute inset-0 flex items-center justify-center"
                style={{
                  transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                  transformOrigin: "center center",
                }}
              >
                <div
                  className="relative overflow-hidden rounded-2xl border border-slate-800 bg-white shadow-[0_20px_70px_rgba(0,0,0,0.45)]"
                  style={{
                    width: activePage?.width || 1200,
                    height: activePage?.height || 900,
                  }}
                >
                  {loading ? (
                    <div className="flex h-full items-center justify-center text-sm text-slate-500">
                      Loading...
                    </div>
                  ) : activeAsset?.kind === "image" ? (
                    <img
                      src={activeAsset.dataUrl}
                      alt={activeAsset.name}
                      className="h-full w-full object-contain"
                    />
                  ) : activeAsset?.kind === "pdf" ? (
                    <iframe
                      src={activeAsset.dataUrl}
                      title={activeAsset.name}
                      className="h-full w-full"
                      onLoad={() => {
                        const pagesCount =
                          activeAsset.numPages ||
                          activePage?.page_data?.asset?.numPages ||
                          0;
                        if (pagesCount) setPdfNumPages(pagesCount);
                      }}
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center bg-slate-100 text-sm text-slate-500">
                      Upload a drawing or PDF to begin takeoff
                    </div>
                  )}

                  <svg
                    ref={svgRef}
                    viewBox={`0 0 ${activePage?.width || 1200} ${activePage?.height || 900}`}
                    className="absolute inset-0 h-full w-full"
                    onClick={handleCanvasClick}
                  >
                    {activePageMeasurements.map((m) => {
                      const isSelected = m.id === selectedMeasurementId;
                      const baseColor =
                        m.type === "line"
                          ? "#22d3ee"
                          : m.type === "area"
                          ? "#f59e0b"
                          : "#34d399";

                      if (m.type === "count") {
                        return (
                          <g key={m.id} onClick={() => setSelectedMeasurementId(m.id)}>
                            {m.points.map((p, idx) => (
                              <g key={idx}>
                                <circle
                                  cx={p.x}
                                  cy={p.y}
                                  r={isSelected ? 10 : 7}
                                  fill={baseColor}
                                  fillOpacity={0.85}
                                  stroke="#0f172a"
                                  strokeWidth={2}
                                />
                                <text
                                  x={p.x + 12}
                                  y={p.y - 10}
                                  fontSize="12"
                                  fill="#ffffff"
                                  stroke="#0f172a"
                                  strokeWidth="0.75"
                                >
                                  {m.name || "Count"}
                                </text>
                              </g>
                            ))}
                          </g>
                        );
                      }

                      if (m.type === "line") {
                        const d = m.points
                          .map((p, idx) => `${idx === 0 ? "M" : "L"} ${p.x} ${p.y}`)
                          .join(" ");
                        const mid = m.points[Math.floor(m.points.length / 2)] || m.points[0];
                        return (
                          <g key={m.id} onClick={() => setSelectedMeasurementId(m.id)}>
                            <path
                              d={d}
                              fill="none"
                              stroke={baseColor}
                              strokeWidth={isSelected ? 4 : 3}
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                            {mid && (
                              <g>
                                <rect
                                  x={mid.x + 8}
                                  y={mid.y - 18}
                                  width={88}
                                  height={20}
                                  rx={6}
                                  fill="rgba(15,23,42,0.9)"
                                />
                                <text
                                  x={mid.x + 14}
                                  y={mid.y - 4}
                                  fontSize="12"
                                  fill="#e2e8f0"
                                >
                                  {formatNumber(m.quantity)} {m.unit || ""}
                                </text>
                              </g>
                            )}
                          </g>
                        );
                      }

                      const pointsStr = m.points.map((p) => `${p.x},${p.y}`).join(" ");
                      const first = m.points[0];
                      return (
                        <g key={m.id} onClick={() => setSelectedMeasurementId(m.id)}>
                          <polygon
                            points={pointsStr}
                            fill={baseColor}
                            fillOpacity={0.18}
                            stroke={baseColor}
                            strokeWidth={isSelected ? 4 : 3}
                            strokeLinejoin="round"
                          />
                          {first && (
                            <g>
                              <rect
                                x={first.x + 8}
                                y={first.y - 18}
                                width={96}
                                height={20}
                                rx={6}
                                fill="rgba(15,23,42,0.9)"
                              />
                              <text
                                x={first.x + 14}
                                y={first.y - 4}
                                fontSize="12"
                                fill="#e2e8f0"
                              >
                                {formatNumber(m.quantity)} {m.unit || ""}
                              </text>
                            </g>
                          )}
                        </g>
                      );
                    })}

                    {draftPoints.length > 0 && activeTool !== "count" && (
                      <g pointerEvents="none">
                        {activeTool === "line" && draftPoints.length >= 1 && (
                          <>
                            {draftPoints.map((p, idx) => (
                              <circle
                                key={idx}
                                cx={p.x}
                                cy={p.y}
                                r={5}
                                fill="#38bdf8"
                              />
                            ))}
                            <path
                              d={draftPoints
                                .map(
                                  (p, idx) => `${idx === 0 ? "M" : "L"} ${p.x} ${p.y}`
                                )
                                .join(" ")}
                              fill="none"
                              stroke="#38bdf8"
                              strokeDasharray="6 4"
                              strokeWidth={2.5}
                            />
                          </>
                        )}
                        {activeTool === "area" && (
                          <>
                            {draftPoints.map((p, idx) => (
                              <circle
                                key={idx}
                                cx={p.x}
                                cy={p.y}
                                r={5}
                                fill="#f59e0b"
                              />
                            ))}
                            <polyline
                              points={draftPoints.map((p) => `${p.x},${p.y}`).join(" ")}
                              fill="rgba(245,158,11,0.08)"
                              stroke="#f59e0b"
                              strokeDasharray="6 4"
                              strokeWidth={2.5}
                            />
                          </>
                        )}
                      </g>
                    )}

                    {(calibrationDraft.p1 || calibrationDraft.p2) && (
                      <g pointerEvents="none">
                        {calibrationDraft.p1 && (
                          <>
                            <circle
                              cx={calibrationDraft.p1.x}
                              cy={calibrationDraft.p1.y}
                              r={8}
                              fill="#f97316"
                              stroke="#ffffff"
                              strokeWidth={2}
                            />
                            <text
                              x={calibrationDraft.p1.x + 10}
                              y={calibrationDraft.p1.y - 10}
                              fontSize="12"
                              fill="#ffffff"
                              stroke="#0f172a"
                              strokeWidth="0.75"
                            >
                              P1
                            </text>
                          </>
                        )}
                        {calibrationDraft.p2 && (
                          <>
                            <circle
                              cx={calibrationDraft.p2.x}
                              cy={calibrationDraft.p2.y}
                              r={8}
                              fill="#f97316"
                              stroke="#ffffff"
                              strokeWidth={2}
                            />
                            <text
                              x={calibrationDraft.p2.x + 10}
                              y={calibrationDraft.p2.y - 10}
                              fontSize="12"
                              fill="#ffffff"
                              stroke="#0f172a"
                              strokeWidth="0.75"
                            >
                              P2
                            </text>
                          </>
                        )}
                        {calibrationDraft.p1 && calibrationDraft.p2 && (
                          <line
                            x1={calibrationDraft.p1.x}
                            y1={calibrationDraft.p1.y}
                            x2={calibrationDraft.p2.x}
                            y2={calibrationDraft.p2.y}
                            stroke="#f97316"
                            strokeWidth={3}
                            strokeDasharray="8 5"
                          />
                        )}
                      </g>
                    )}
                  </svg>
                </div>
              </div>

              {isPickingCalibration && (
                <div className="absolute left-1/2 top-4 z-20 -translate-x-1/2 rounded-2xl border border-amber-500/30 bg-slate-900/95 px-4 py-3 shadow-xl backdrop-blur">
                  <div className="text-sm font-semibold text-amber-200">
                    Calibration Point Picking
                  </div>
                  <div className="mt-1 text-xs text-slate-300">
                    {!calibrationDraft.p1
                      ? "Click point 1 on the drawing."
                      : !calibrationDraft.p2
                      ? "Click point 2 on the drawing."
                      : "Processing..."}
                  </div>
                </div>
              )}

              {errorText && (
                <div className="absolute bottom-4 left-4 z-20 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200 shadow-xl">
                  {errorText}
                </div>
              )}
            </div>
          </div>
        </main>

        <aside className="flex min-h-0 flex-col border-l border-slate-800 bg-slate-925">
          <div className="border-b border-slate-800 px-3 py-3">
            <div className="grid grid-cols-3 gap-1 rounded-xl border border-slate-800 bg-slate-900 p-1">
              {[
                { id: "drawings", label: "Drawings", icon: FileText },
                { id: "measurements", label: "Measures", icon: Layers3 },
                { id: "library", label: "Library", icon: FolderTree },
                { id: "extracted", label: "Extracted", icon: Search },
                { id: "boq", label: "BOQ", icon: Link2 },
                { id: "settings", label: "Settings", icon: Settings },
              ].map((tab) => {
                const Icon = tab.icon;
                const active = rightTab === (tab.id as RightTab);
                return (
                  <button
                    key={tab.id}
                    onClick={() => setRightTab(tab.id as RightTab)}
                    className={cn(
                      "flex items-center justify-center gap-1 rounded-lg px-2 py-2 text-[11px] font-medium transition",
                      active
                        ? "bg-cyan-500/20 text-cyan-200"
                        : "text-slate-300 hover:bg-slate-800"
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-auto p-3">
            {rightTab === "drawings" && (
              <div className="space-y-3">
                <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
                  <div className="text-sm font-semibold text-slate-100">Page Details</div>
                  <div className="mt-3 space-y-2 text-xs text-slate-300">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Label</span>
                      <span>{activePage?.page_label || "—"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Page #</span>
                      <span>{activePage?.page_number || "—"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Size</span>
                      <span>
                        {activePage?.width || 0} × {activePage?.height || 0}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Drawing</span>
                      <span className="max-w-[150px] truncate text-right">
                        {activeAsset?.name || "None"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">PDF Pages</span>
                      <span>{pdfNumPages || activeAsset?.numPages || "—"}</span>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
                  <div className="mb-2 text-sm font-semibold text-slate-100">
                    Calibration
                  </div>
                  <div className="text-xs text-slate-400">
                    {activePage?.calibration_distance
                      ? `Saved: ${formatNumber(activePage.calibration_distance)} ${
                          activePage.calibration_unit || "ft"
                        }`
                      : "Not calibrated yet"}
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setShowCalibrationModal(true)}
                      className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-200 hover:bg-amber-500/20"
                    >
                      Open
                    </button>
                    <button
                      onClick={startCalibrationPickSecondary}
                      className="rounded-xl border border-slate-800 bg-slate-850 px-3 py-2 text-xs font-medium text-slate-200 hover:bg-slate-800"
                    >
                      Start / Restart
                    </button>
                  </div>
                </div>
              </div>
            )}

            {rightTab === "measurements" && (
              <div className="space-y-3">
                <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-semibold text-slate-100">
                      Measurements
                    </div>
                    <div className="text-xs text-slate-400">
                      {activePageMeasurements.length}
                    </div>
                  </div>

                  <div className="mt-3 space-y-2">
                    {activePageMeasurements.length === 0 && (
                      <div className="rounded-xl border border-dashed border-slate-700 px-3 py-5 text-center text-xs text-slate-500">
                        No measurements on this page yet
                      </div>
                    )}

                    {activePageMeasurements.map((m) => (
                      <div
                        key={m.id}
                        className={cn(
                          "rounded-xl border p-3",
                          m.id === selectedMeasurementId
                            ? "border-cyan-500/40 bg-cyan-500/10"
                            : "border-slate-800 bg-slate-950"
                        )}
                      >
                        <button
                          onClick={() => setSelectedMeasurementId(m.id)}
                          className="w-full text-left"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <div className="text-sm font-medium text-slate-100">
                                {m.name || toolLabel(m.type)}
                              </div>
                              <div className="mt-1 text-[11px] text-slate-400">
                                {toolLabel(m.type)}
                                {m.meta?.linked_library_name
                                  ? ` • ${m.meta.linked_library_name}`
                                  : ""}
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="text-sm font-semibold text-slate-100">
                                {formatNumber(m.quantity)} {m.unit || ""}
                              </div>
                              <div className="text-[11px] text-slate-500">
                                {formatDate(m.created_at)}
                              </div>
                            </div>
                          </div>
                        </button>

                        <div className="mt-3 flex items-center justify-between">
                          <div className="text-[11px] text-slate-500">
                            {m.points.length} point{m.points.length === 1 ? "" : "s"}
                          </div>
                          <button
                            onClick={() => deleteMeasurement(m.id)}
                            className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-2.5 py-1 text-[11px] font-medium text-rose-200 hover:bg-rose-500/20"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {rightTab === "library" && (
              <div className="space-y-3">
                <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-semibold text-slate-100">
                      Rate Item / Assembly Link
                    </div>
                    <button
                      onClick={() => setLibraryOpen(true)}
                      className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-xs font-medium text-cyan-200 hover:bg-cyan-500/20"
                    >
                      Open Picker
                    </button>
                  </div>

                  {!linkedSelection ? (
                    <div className="mt-3 rounded-xl border border-dashed border-slate-700 px-3 py-5 text-center text-xs text-slate-500">
                      No item or assembly linked yet
                    </div>
                  ) : (
                    <div className="mt-3 rounded-xl border border-slate-800 bg-slate-950 p-3">
                      <div className="flex items-center gap-2 text-sm font-medium text-slate-100">
                        {linkedSelection.type === "item" ? (
                          <Package className="h-4 w-4 text-cyan-300" />
                        ) : (
                          <Boxes className="h-4 w-4 text-amber-300" />
                        )}
                        {linkedSelection.name}
                      </div>
                      <div className="mt-2 text-xs text-slate-400">
                        {linkedSelection.type === "item" ? "Item" : "Assembly"}
                        {linkedSelection.code ? ` • ${linkedSelection.code}` : ""}
                        {linkedSelection.unit ? ` • ${linkedSelection.unit}` : ""}
                      </div>
                      <div className="mt-3 flex gap-2">
                        <button
                          onClick={() => setLibraryOpen(true)}
                          className="rounded-xl border border-slate-800 bg-slate-850 px-3 py-2 text-xs font-medium text-slate-200 hover:bg-slate-800"
                        >
                          Change
                        </button>
                        <button
                          onClick={() => setLinkedSelection(null)}
                          className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs font-medium text-rose-200 hover:bg-rose-500/20"
                        >
                          Clear
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
                  <div className="text-sm font-semibold text-slate-100">
                    Future Calculation Flow
                  </div>
                  <div className="mt-2 text-xs leading-5 text-slate-400">
                    Link a Takeoff measurement to a library item or assembly now. The
                    selection is stored in measurement meta so formula-driven quantity,
                    waste, productivity, and assembly expansion can connect cleanly later.
                  </div>
                </div>
              </div>
            )}

            {rightTab === "extracted" && (
              <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
                <div className="text-sm font-semibold text-slate-100">
                  Extracted Details
                </div>
                <div className="mt-3 rounded-xl border border-dashed border-slate-700 px-3 py-8 text-center text-xs text-slate-500">
                  Reserved for title block parsing, notes extraction, and smart detail capture
                </div>
              </div>
            )}

            {rightTab === "boq" && (
              <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
                <div className="text-sm font-semibold text-slate-100">BOQ Links</div>
                <div className="mt-3 rounded-xl border border-dashed border-slate-700 px-3 py-8 text-center text-xs text-slate-500">
                  Reserved for takeoff-to-BOQ section, item, and assembly linking
                </div>
              </div>
            )}

            {rightTab === "settings" && (
              <div className="space-y-3">
                <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
                  <div className="text-sm font-semibold text-slate-100">
                    Picker Layout
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setPickerMode("drawer")}
                      className={cn(
                        "rounded-xl px-3 py-2 text-xs font-medium",
                        pickerMode === "drawer"
                          ? "border border-cyan-500/30 bg-cyan-500/10 text-cyan-200"
                          : "border border-slate-800 bg-slate-950 text-slate-300"
                      )}
                    >
                      Right Drawer
                    </button>
                    <button
                      onClick={() => setPickerMode("modal")}
                      className={cn(
                        "rounded-xl px-3 py-2 text-xs font-medium",
                        pickerMode === "modal"
                          ? "border border-cyan-500/30 bg-cyan-500/10 text-cyan-200"
                          : "border border-slate-800 bg-slate-950 text-slate-300"
                      )}
                    >
                      Center Modal
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </aside>
      </div>

      {showCalibrationModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm">
          <div className="w-full max-w-xl rounded-3xl border border-slate-800 bg-slate-900 shadow-2xl">
            <div className="flex items-start justify-between border-b border-slate-800 px-5 py-4">
              <div>
                <div className="text-lg font-semibold text-slate-100">
                  Calibrate Drawing
                </div>
                <div className="mt-1 text-sm text-slate-400">
                  Pick two known points, then enter the real-world distance.
                </div>
              </div>
              <button
                onClick={() => {
                  setShowCalibrationModal(false);
                  setIsPickingCalibration(false);
                  setCalibrationReopenAfterPoint2(false);
                }}
                className="rounded-xl p-2 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-5 px-5 py-5">
              <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
                <div className="text-sm font-medium text-slate-200">
                  Pick Points on Drawing
                </div>
                <div className="mt-2 text-xs leading-5 text-slate-400">
                  Click Start / Restart. The modal will close so you can pick point 1
                  and point 2 directly on the drawing. After point 2 is selected, this
                  modal reopens automatically.
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={startCalibrationPick}
                    className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm font-medium text-amber-200 hover:bg-amber-500/20"
                  >
                    Start / Restart
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setCalibrationDraft({
                        p1: null,
                        p2: null,
                        distanceText: "1",
                        unit: "ft",
                      });
                      setCalibrationForm({
                        feet: "",
                        inches: "",
                        fraction: "0",
                        unit: "ft",
                      });
                    }}
                    className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-2 text-sm font-medium text-rose-200 hover:bg-rose-500/20"
                  >
                    Reset Draft
                  </button>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
                  <div className="rounded-xl border border-slate-800 bg-slate-900 px-3 py-3">
                    <div className="text-slate-400">Point 1</div>
                    <div className="mt-1 font-medium text-slate-200">
                      {calibrationDraft.p1
                        ? `${formatNumber(calibrationDraft.p1.x)} , ${formatNumber(
                            calibrationDraft.p1.y
                          )}`
                        : "Not selected"}
                    </div>
                  </div>
                  <div className="rounded-xl border border-slate-800 bg-slate-900 px-3 py-3">
                    <div className="text-slate-400">Point 2</div>
                    <div className="mt-1 font-medium text-slate-200">
                      {calibrationDraft.p2
                        ? `${formatNumber(calibrationDraft.p2.x)} , ${formatNumber(
                            calibrationDraft.p2.y
                          )}`
                        : "Not selected"}
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
                <div className="text-sm font-medium text-slate-200">
                  Enter Real Distance
                </div>

                <div className="mt-4 grid grid-cols-4 gap-3">
                  <label className="col-span-1">
                    <div className="mb-1 text-xs text-slate-400">Feet</div>
                    <input
                      value={calibrationForm.feet}
                      onChange={(e) =>
                        setCalibrationForm((prev) => ({
                          ...prev,
                          feet: e.target.value,
                        }))
                      }
                      className="w-full rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none ring-0 placeholder:text-slate-500"
                      placeholder="0"
                    />
                  </label>

                  <label className="col-span-1">
                    <div className="mb-1 text-xs text-slate-400">Inches</div>
                    <input
                      value={calibrationForm.inches}
                      onChange={(e) =>
                        setCalibrationForm((prev) => ({
                          ...prev,
                          inches: e.target.value,
                        }))
                      }
                      className="w-full rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none ring-0 placeholder:text-slate-500"
                      placeholder="0"
                    />
                  </label>

                  <label className="col-span-1">
                    <div className="mb-1 text-xs text-slate-400">Fraction</div>
                    <select
                      value={calibrationForm.fraction}
                      onChange={(e) =>
                        setCalibrationForm((prev) => ({
                          ...prev,
                          fraction: e.target.value,
                        }))
                      }
                      className="w-full rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none"
                    >
                      {FRACTIONS.map((f) => (
                        <option key={f} value={f}>
                          {f}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="col-span-1">
                    <div className="mb-1 text-xs text-slate-400">Unit</div>
                    <select
                      value={calibrationForm.unit}
                      onChange={(e) =>
                        setCalibrationForm((prev) => ({
                          ...prev,
                          unit: e.target.value,
                        }))
                      }
                      className="w-full rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none"
                    >
                      <option value="ft">ft</option>
                      <option value="m">m</option>
                      <option value="yd">yd</option>
                      <option value="in">in</option>
                    </select>
                  </label>
                </div>

                <div className="mt-4">
                  <div className="mb-1 text-xs text-slate-400">
                    Numeric Distance (optional quick entry)
                  </div>
                  <input
                    value={calibrationDraft.distanceText}
                    onChange={(e) =>
                      setCalibrationDraft((prev) => ({
                        ...prev,
                        distanceText: e.target.value,
                      }))
                    }
                    className="w-full rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500"
                    placeholder="1"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-800 px-5 py-4">
              <button
                onClick={() => {
                  setShowCalibrationModal(false);
                  setIsPickingCalibration(false);
                  setCalibrationReopenAfterPoint2(false);
                }}
                className="rounded-xl border border-slate-800 bg-slate-950 px-4 py-2 text-sm font-medium text-slate-300 hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                onClick={resetCalibration}
                className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-2 text-sm font-medium text-rose-200 hover:bg-rose-500/20"
              >
                Clear Saved
              </button>
              <button
                onClick={applyCalibration}
                disabled={!calibrationDraft.p1 || !calibrationDraft.p2}
                className={cn(
                  "rounded-xl px-4 py-2 text-sm font-medium",
                  calibrationDraft.p1 && calibrationDraft.p2
                    ? "border border-cyan-500/30 bg-cyan-500/10 text-cyan-200 hover:bg-cyan-500/20"
                    : "cursor-not-allowed border border-slate-800 bg-slate-850 text-slate-500"
                )}
              >
                Apply Calibration
              </button>
            </div>
          </div>
        </div>
      )}

      {libraryOpen && pickerMode === "modal" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm">
          <div className="flex h-[80vh] w-full max-w-6xl overflow-hidden rounded-3xl border border-slate-800 bg-slate-900 shadow-2xl">
            <div className="flex w-[260px] flex-col border-r border-slate-800 bg-slate-950">
              <div className="border-b border-slate-800 p-4">
                <div className="text-sm font-semibold text-slate-100">
                  Library Categories
                </div>
                <div className="mt-2 rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-slate-400">
                  {currentCategoryName}
                </div>
              </div>

              <div className="overflow-auto p-3">
                <button
                  onClick={() => setLibraryCategoryId("all")}
                  className={cn(
                    "mb-2 w-full rounded-xl px-3 py-2 text-left text-sm",
                    libraryCategoryId === "all"
                      ? "border border-cyan-500/30 bg-cyan-500/10 text-cyan-200"
                      : "border border-slate-800 bg-slate-900 text-slate-300 hover:bg-slate-800"
                  )}
                >
                  All Categories
                </button>
                {filteredCategories.map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => setLibraryCategoryId(cat.id)}
                    className={cn(
                      "mb-2 w-full rounded-xl px-3 py-2 text-left text-sm",
                      libraryCategoryId === cat.id
                        ? "border border-cyan-500/30 bg-cyan-500/10 text-cyan-200"
                        : "border border-slate-800 bg-slate-900 text-slate-300 hover:bg-slate-800"
                    )}
                  >
                    <div className="font-medium">{cat.name}</div>
                    {!!cat.code && (
                      <div className="mt-0.5 text-[11px] text-slate-500">{cat.code}</div>
                    )}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex min-w-0 flex-1 flex-col">
              <div className="flex items-center gap-3 border-b border-slate-800 px-5 py-4">
                <div className="grid grid-cols-2 gap-1 rounded-xl border border-slate-800 bg-slate-950 p-1">
                  <button
                    onClick={() => setLibraryTab("items")}
                    className={cn(
                      "rounded-lg px-3 py-2 text-sm font-medium",
                      libraryTab === "items"
                        ? "bg-cyan-500/20 text-cyan-200"
                        : "text-slate-300 hover:bg-slate-800"
                    )}
                  >
                    Items
                  </button>
                  <button
                    onClick={() => setLibraryTab("assemblies")}
                    className={cn(
                      "rounded-lg px-3 py-2 text-sm font-medium",
                      libraryTab === "assemblies"
                        ? "bg-cyan-500/20 text-cyan-200"
                        : "text-slate-300 hover:bg-slate-800"
                    )}
                  >
                    Assemblies
                  </button>
                </div>

                <div className="relative min-w-0 flex-1">
                  <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
                  <input
                    value={librarySearch}
                    onChange={(e) => setLibrarySearch(e.target.value)}
                    placeholder="Search code, name, description..."
                    className="w-full rounded-xl border border-slate-800 bg-slate-950 py-2 pl-10 pr-3 text-sm text-slate-100 outline-none placeholder:text-slate-500"
                  />
                </div>

                <button
                  onClick={() => setLibraryOpen(false)}
                  className="rounded-xl border border-slate-800 bg-slate-950 p-2 text-slate-300 hover:bg-slate-800"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="min-h-0 flex-1 overflow-auto p-4">
                {libraryTab === "items" ? (
                  <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                    {filteredItems.map((row) => (
                      <button
                        key={row.id}
                        onClick={() =>
                          linkLibrarySelection({
                            type: "item",
                            id: row.id,
                            name: row.name,
                            code: row.item_code || null,
                            unit: row.base_unit || null,
                            unitType: row.unit_type || null,
                          })
                        }
                        className="rounded-2xl border border-slate-800 bg-slate-950 p-4 text-left transition hover:border-cyan-500/30 hover:bg-slate-900"
                      >
                        <div className="flex items-start gap-3">
                          <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-xl border border-cyan-500/20 bg-cyan-500/10">
                            <Package className="h-5 w-5 text-cyan-300" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-semibold text-slate-100">
                              {row.name}
                            </div>
                            <div className="mt-1 text-xs text-slate-400">
                              {row.item_code || "No code"}
                              {row.base_unit ? ` • ${row.base_unit}` : ""}
                              {row.unit_type ? ` • ${row.unit_type}` : ""}
                            </div>
                            {row.description && (
                              <div className="mt-2 line-clamp-2 text-xs leading-5 text-slate-500">
                                {row.description}
                              </div>
                            )}
                          </div>
                        </div>
                      </button>
                    ))}
                    {filteredItems.length === 0 && (
                      <div className="col-span-full rounded-2xl border border-dashed border-slate-700 px-4 py-10 text-center text-sm text-slate-500">
                        No items found
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                    {filteredAssemblies.map((row) => (
                      <button
                        key={row.id}
                        onClick={() =>
                          linkLibrarySelection({
                            type: "assembly",
                            id: row.id,
                            name: row.name,
                            code: row.assembly_code || null,
                            unit: row.output_unit || null,
                            unitType: row.unit_type || null,
                          })
                        }
                        className="rounded-2xl border border-slate-800 bg-slate-950 p-4 text-left transition hover:border-amber-500/30 hover:bg-slate-900"
                      >
                        <div className="flex items-start gap-3">
                          <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-xl border border-amber-500/20 bg-amber-500/10">
                            <Boxes className="h-5 w-5 text-amber-300" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-semibold text-slate-100">
                              {row.name}
                            </div>
                            <div className="mt-1 text-xs text-slate-400">
                              {row.assembly_code || "No code"}
                              {row.output_unit ? ` • ${row.output_unit}` : ""}
                              {row.unit_type ? ` • ${row.unit_type}` : ""}
                            </div>
                            {row.description && (
                              <div className="mt-2 line-clamp-2 text-xs leading-5 text-slate-500">
                                {row.description}
                              </div>
                            )}
                          </div>
                        </div>
                      </button>
                    ))}
                    {filteredAssemblies.length === 0 && (
                      <div className="col-span-full rounded-2xl border border-dashed border-slate-700 px-4 py-10 text-center text-sm text-slate-500">
                        No assemblies found
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {libraryOpen && pickerMode === "drawer" && (
        <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[980px] border-l border-slate-800 bg-slate-900 shadow-2xl">
          <div className="flex w-[240px] flex-col border-r border-slate-800 bg-slate-950">
            <div className="border-b border-slate-800 p-4">
              <div className="text-sm font-semibold text-slate-100">Folders</div>
              <div className="mt-1 text-xs text-slate-400">
                Pick an item or assembly for this takeoff
              </div>
            </div>

            <div className="overflow-auto p-3">
              <button
                onClick={() => setLibraryCategoryId("all")}
                className={cn(
                  "mb-2 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm",
                  libraryCategoryId === "all"
                    ? "border border-cyan-500/30 bg-cyan-500/10 text-cyan-200"
                    : "border border-slate-800 bg-slate-900 text-slate-300 hover:bg-slate-800"
                )}
              >
                <FolderTree className="h-4 w-4" />
                All Categories
              </button>
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setLibraryCategoryId(cat.id)}
                  className={cn(
                    "mb-2 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm",
                    libraryCategoryId === cat.id
                      ? "border border-cyan-500/30 bg-cyan-500/10 text-cyan-200"
                      : "border border-slate-800 bg-slate-900 text-slate-300 hover:bg-slate-800"
                  )}
                >
                  <FolderOpen className="h-4 w-4" />
                  <span className="truncate">{cat.name}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex items-center gap-3 border-b border-slate-800 px-5 py-4">
              <div className="grid grid-cols-2 gap-1 rounded-xl border border-slate-800 bg-slate-950 p-1">
                <button
                  onClick={() => setLibraryTab("items")}
                  className={cn(
                    "rounded-lg px-3 py-2 text-sm font-medium",
                    libraryTab === "items"
                      ? "bg-cyan-500/20 text-cyan-200"
                      : "text-slate-300 hover:bg-slate-800"
                  )}
                >
                  Rate Items
                </button>
                <button
                  onClick={() => setLibraryTab("assemblies")}
                  className={cn(
                    "rounded-lg px-3 py-2 text-sm font-medium",
                    libraryTab === "assemblies"
                      ? "bg-cyan-500/20 text-cyan-200"
                      : "text-slate-300 hover:bg-slate-800"
                  )}
                >
                  Assemblies
                </button>
              </div>

              <div className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
                <input
                  value={librarySearch}
                  onChange={(e) => setLibrarySearch(e.target.value)}
                  placeholder="Search name, code, description..."
                  className="w-full rounded-xl border border-slate-800 bg-slate-950 py-2 pl-10 pr-3 text-sm text-slate-100 outline-none placeholder:text-slate-500"
                />
              </div>

              <button
                onClick={() => setLibraryOpen(false)}
                className="rounded-xl border border-slate-800 bg-slate-950 p-2 text-slate-300 hover:bg-slate-800"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-auto p-4">
              {libraryTab === "items" ? (
                <div className="space-y-2">
                  {filteredItems.map((row) => (
                    <button
                      key={row.id}
                      onClick={() =>
                        linkLibrarySelection({
                          type: "item",
                          id: row.id,
                          name: row.name,
                          code: row.item_code || null,
                          unit: row.base_unit || null,
                          unitType: row.unit_type || null,
                        })
                      }
                      className="flex w-full items-center gap-3 rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-left hover:border-cyan-500/30 hover:bg-slate-900"
                    >
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-cyan-500/20 bg-cyan-500/10">
                        <Package className="h-5 w-5 text-cyan-300" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold text-slate-100">
                          {row.name}
                        </div>
                        <div className="mt-1 text-xs text-slate-400">
                          {row.item_code || "No code"}
                          {row.base_unit ? ` • ${row.base_unit}` : ""}
                          {row.unit_type ? ` • ${row.unit_type}` : ""}
                        </div>
                      </div>
                      <ChevronLeft className="h-4 w-4 text-slate-500" />
                    </button>
                  ))}
                  {filteredItems.length === 0 && (
                    <div className="rounded-2xl border border-dashed border-slate-700 px-4 py-10 text-center text-sm text-slate-500">
                      No items found
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredAssemblies.map((row) => (
                    <button
                      key={row.id}
                      onClick={() =>
                        linkLibrarySelection({
                          type: "assembly",
                          id: row.id,
                          name: row.name,
                          code: row.assembly_code || null,
                          unit: row.output_unit || null,
                          unitType: row.unit_type || null,
                        })
                      }
                      className="flex w-full items-center gap-3 rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-left hover:border-amber-500/30 hover:bg-slate-900"
                    >
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-amber-500/20 bg-amber-500/10">
                        <Boxes className="h-5 w-5 text-amber-300" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold text-slate-100">
                          {row.name}
                        </div>
                        <div className="mt-1 text-xs text-slate-400">
                          {row.assembly_code || "No code"}
                          {row.output_unit ? ` • ${row.output_unit}` : ""}
                          {row.unit_type ? ` • ${row.unit_type}` : ""}
                        </div>
                      </div>
                      <ChevronLeft className="h-4 w-4 text-slate-500" />
                    </button>
                  ))}
                  {filteredAssemblies.length === 0 && (
                    <div className="rounded-2xl border border-dashed border-slate-700 px-4 py-10 text-center text-sm text-slate-500">
                      No assemblies found
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}