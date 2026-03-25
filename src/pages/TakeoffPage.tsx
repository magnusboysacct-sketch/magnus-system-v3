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

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

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
  const pdfCanvasRef = useRef<HTMLCanvasElement | null>(null);
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
  const [isUploadingDrawing, setIsUploadingDrawing] = useState(false);

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

  useEffect(() => {
    if (activeAsset?.kind === "pdf") {
      setPdfNumPages(activeAsset.numPages || activePage?.page_data?.asset?.numPages || 0);
    } else {
      setPdfNumPages(0);
    }
  }, [activeAsset, activePage]);

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
      console.log("UPLOAD START", {
        fileName: file?.name,
        fileType: file?.type,
        fileSize: file?.size,
        activePageId: activePage?.id,
      });

      if (!activePage?.id) {
        console.error("No active page id, upload cancelled");
        setErrorText("No active page selected.");
        return;
      }

      setIsUploadingDrawing(true);
      setErrorText("");

      try {
        const reader = new FileReader();

        reader.onerror = () => {
          console.error("FileReader failed");
          setErrorText("Failed to read selected file.");
          setIsUploadingDrawing(false);
        };

        reader.onload = async () => {
          try {
            const dataUrl = String(reader.result || "");
            console.log("FILE READER LOADED", {
              hasDataUrl: !!dataUrl,
              prefix: dataUrl.slice(0, 60),
            });

            const kind: "pdf" | "image" =
              file.type === "application/pdf" ||
              file.name.toLowerCase().endsWith(".pdf")
                ? "pdf"
                : "image";

            let nextWidth = activePage.width || 1200;
            let nextHeight = activePage.height || 900;
            let numPages: number | undefined = undefined;

            if (kind === "pdf") {
              try {
                const pdf = await pdfjs.getDocument(dataUrl).promise;
                numPages = pdf.numPages || 1;
                const page = await pdf.getPage(1);
                const viewport = page.getViewport({ scale: 1.5 });
                nextWidth = Math.max(800, Math.round(viewport.width));
                nextHeight = Math.max(600, Math.round(viewport.height));
                setPdfNumPages(numPages);
              } catch (pdfErr) {
                console.error("PDF metadata read failed", pdfErr);
              }
            } else {
              try {
                const imageSize = await new Promise<{ width: number; height: number }>(
                  (resolve, reject) => {
                    const img = new Image();
                    img.onload = () =>
                      resolve({
                        width: img.naturalWidth || activePage.width || 1200,
                        height: img.naturalHeight || activePage.height || 900,
                      });
                    img.onerror = reject;
                    img.src = dataUrl;
                  }
                );
                nextWidth = imageSize.width;
                nextHeight = imageSize.height;
              } catch (imgErr) {
                console.error("Image size read failed", imgErr);
              }
            }

            const asset: DrawingAsset = {
              kind,
              name: file.name,
              dataUrl,
              ...(numPages ? { numPages } : {}),
            };

            const pageData = {
              ...(activePage.page_data || {}),
              asset,
              uploadedAt: new Date().toISOString(),
            };

            console.log("SAVING PAGE DATA", {
              pageId: activePage.id,
              kind,
              fileName: file.name,
              numPages,
              nextWidth,
              nextHeight,
            });

            const { data, error } = await supabase
              .from("takeoff_pages")
              .update({
                page_label:
                  activePage.page_label || file.name.replace(/\.[^.]+$/, ""),
                page_data: pageData,
                width: nextWidth,
                height: nextHeight,
                updated_at: new Date().toISOString(),
              })
              .eq("id", activePage.id)
              .select("*");

            if (error) {
              console.error("SUPABASE UPDATE ERROR", error);
              setErrorText(error.message);
              setIsUploadingDrawing(false);
              return;
            }

            const updated = (data?.[0] || null) as TakeoffPageRow | null;
            console.log("UPLOAD SUCCESS", updated);

            if (updated) {
              setPages((prev) =>
                prev.map((p) => (p.id === activePage.id ? { ...p, ...updated } : p))
              );
            }

            setIsUploadingDrawing(false);
          } catch (err: any) {
            console.error("UPLOAD PROCESS ERROR", err);
            setErrorText(err?.message || "Upload failed.");
            setIsUploadingDrawing(false);
          }
        };

        reader.readAsDataURL(file);
      } catch (err: any) {
        console.error("UPLOAD OUTER ERROR", err);
        setErrorText(err?.message || "Upload failed.");
        setIsUploadingDrawing(false);
      }
    },
    [activePage]
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      console.log("FILE INPUT CHANGE", file);

      if (!file) {
        console.warn("No file selected");
        return;
      }

      handleUploadFile(file);
      e.target.value = "";
    },
    [handleUploadFile]
  );

  useEffect(() => {
    let cancelled = false;

    const renderPdfPreview = async () => {
      if (!activeAsset || activeAsset.kind !== "pdf") {
        setPdfNumPages(0);
        const canvas = pdfCanvasRef.current;
        if (canvas) {
          const ctx = canvas.getContext("2d");
          if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
        return;
      }

      try {
        const loadingTask = pdfjs.getDocument(activeAsset.dataUrl);
        const pdf = await loadingTask.promise;
        if (cancelled) return;

        const pageCount =
          pdf.numPages ||
          activeAsset.numPages ||
          activePage?.page_data?.asset?.numPages ||
          0;

        setPdfNumPages(pageCount);

        const page = await pdf.getPage(1);
        if (cancelled) return;

        const baseViewport = page.getViewport({ scale: 1 });
        const targetWidth = activePage?.width || Math.max(800, Math.round(baseViewport.width));
        const renderScale = targetWidth / baseViewport.width;
        const viewport = page.getViewport({ scale: renderScale });

        const canvas = pdfCanvasRef.current;
        if (!canvas) return;

        const context = canvas.getContext("2d");
        if (!context) return;

        canvas.width = Math.max(1, Math.round(viewport.width));
        canvas.height = Math.max(1, Math.round(viewport.height));
        canvas.style.width = `${Math.round(viewport.width)}px`;
        canvas.style.height = `${Math.round(viewport.height)}px`;

        await page.render({
          canvasContext: context,
          viewport,
        }).promise;

        if (cancelled) return;

        const nextWidth = Math.round(viewport.width);
        const nextHeight = Math.round(viewport.height);
        const storedPageCount = activePage?.page_data?.asset?.numPages || 0;

        if (
          activePage?.id &&
          (activePage.width !== nextWidth ||
            activePage.height !== nextHeight ||
            storedPageCount !== pageCount)
        ) {
          await upsertPage(activePage.id, {
            width: nextWidth,
            height: nextHeight,
            page_data: {
              ...(activePage.page_data || {}),
              asset: {
                ...(activePage.page_data?.asset || activeAsset),
                numPages: pageCount,
              },
            },
          });
        }
      } catch (err: any) {
        if (!cancelled) {
          console.error("PDF render error", err);
          setErrorText(err?.message || "Failed to render PDF preview.");
        }
      }
    };

    renderPdfPreview();

    return () => {
      cancelled = true;
    };
  }, [activeAsset, activePage, upsertPage]);

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
            {isUploadingDrawing ? "Uploading..." : "Upload Drawing"}
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
                    <div className="flex h-full w-full items-center justify-center bg-white">
                      <canvas
                        ref={pdfCanvasRef}
                        aria-label={activeAsset.name}
                        className="max-h-full max-w-full object-contain"
                      />
                    </div>
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
                                  height={20