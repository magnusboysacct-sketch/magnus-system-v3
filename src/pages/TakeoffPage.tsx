// src/pages/TakeoffPage.tsx
import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { supabase } from "../lib/supabase";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  Crosshair,
  FileUp,
  Hand,
  Minus,
  Move,
  MousePointer2,
  PencilLine,
  Plus,
  RefreshCw,
  Ruler,
  Save,
  Target,
  Trash2,
  Upload,
} from "lucide-react";
import * as pdfjsLib from "pdfjs-dist";

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

type Point = { x: number; y: number };

type CalibrationUnit = "ft" | "in" | "m" | "cm" | "mm" | "yd";

type TakeoffMode =
  | "select"
  | "pan"
  | "calibrate"
  | "line"
  | "area"
  | "count";

type TakeoffTab =
  | "drawings"
  | "measurements"
  | "details"
  | "boq"
  | "settings";

type MeasurementType = "line" | "area" | "count";

type SessionRow = {
  id: string;
  project_id: string;
  drawing_id?: string | null;
  name?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type PageRow = {
  id: string;
  project_id: string;
  drawing_id?: string | null;
  page_number: number;
  session_id: string;
  page_label?: string | null;
  width?: number | null;
  height?: number | null;
  calibration_scale?: number | null;
  calibration_unit?: CalibrationUnit | null;
  calibration_distance?: number | null;
  calibration_point_1?: Point | null;
  calibration_point_2?: Point | null;
  calibration_p1?: Point | null;
  calibration_p2?: Point | null;
  page_data?: Record<string, any> | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type MeasurementRow = {
  id?: string;
  project_id?: string | null;
  session_id?: string | null;
  page_id?: string | null;
  takeoff_page_id?: string | null;
  type?: string | null;
  measurement_type?: string | null;
  name?: string | null;
  label?: string | null;
  unit?: string | null;
  quantity?: number | null;
  value?: number | null;
  data?: any;
  geometry?: any;
  points?: any;
  metadata?: any;
  measurement_data?: any;
  created_at?: string | null;
  updated_at?: string | null;
};

type ViewportState = {
  scale: number;
  offsetX: number;
  offsetY: number;
};

type DraftShape = {
  type: MeasurementType;
  points: Point[];
};

type SavedMeasurement = {
  id: string;
  type: MeasurementType;
  name: string;
  unit: string;
  value: number;
  displayValue: string;
  points: Point[];
  color: string;
  createdAt?: string | null;
  raw?: MeasurementRow;
};

type DrawingSource = {
  name: string;
  type: string;
  size: number;
  dataUrl?: string | null;
  inlinePersisted?: boolean;
  totalPages?: number;
};

const TABS: Array<{ key: TakeoffTab; label: string }> = [
  { key: "drawings", label: "Drawings" },
  { key: "measurements", label: "Measurements" },
  { key: "details", label: "Extracted Details" },
  { key: "boq", label: "BOQ Links" },
  { key: "settings", label: "Settings" },
];

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

const DEFAULT_VIEW: ViewportState = {
  scale: 1,
  offsetX: 0,
  offsetY: 0,
};

const COLORS = {
  line: "#0f766e",
  area: "#2563eb",
  count: "#dc2626",
  calibration: "#9333ea",
  draft: "#f59e0b",
};

function classNames(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function safeNumber(value: unknown, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function parseFraction(fraction: string) {
  if (!fraction || fraction === "0") return 0;
  const [a, b] = fraction.split("/").map(Number);
  if (!a || !b) return 0;
  return a / b;
}

function distance(a: Point, b: Point) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function polylineLength(points: Point[]) {
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    total += distance(points[i - 1], points[i]);
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
  return Math.abs(sum) / 2;
}

function formatMeasurementValue(type: MeasurementType, value: number, unit: string) {
  if (type === "count") return `${Math.round(value)} pt`;
  if (type === "area") return `${value.toFixed(2)} ${unit}²`;
  return `${value.toFixed(2)} ${unit}`;
}

function toWorldValue(
  type: MeasurementType,
  points: Point[],
  calibrationScale: number | null,
  calibrationUnit: CalibrationUnit | null
) {
  if (type === "count") {
    return {
      value: points.length,
      unit: "pt",
      display: `${points.length} pt`,
    };
  }

  const unit = calibrationUnit || "px";

  if (!calibrationScale || calibrationScale <= 0) {
    const pxValue = type === "area" ? polygonArea(points) : polylineLength(points);
    return {
      value: pxValue,
      unit: type === "area" ? "px" : "px",
      display:
        type === "area"
          ? `${pxValue.toFixed(2)} px²`
          : `${pxValue.toFixed(2)} px`,
    };
  }

  if (type === "line") {
    const val = polylineLength(points) * calibrationScale;
    return {
      value: val,
      unit,
      display: `${val.toFixed(2)} ${unit}`,
    };
  }

  const val = polygonArea(points) * calibrationScale * calibrationScale;
  return {
    value: val,
    unit,
    display: `${val.toFixed(2)} ${unit}²`,
  };
}

function pointToString(p: Point | null | undefined) {
  if (!p) return "—";
  return `${Math.round(p.x)}, ${Math.round(p.y)}`;
}

function normalizePoint(value: any): Point | null {
  if (!value || typeof value !== "object") return null;
  if (!Number.isFinite(Number(value.x)) || !Number.isFinite(Number(value.y))) return null;
  return { x: Number(value.x), y: Number(value.y) };
}

function getPageCalibrationP1(page: PageRow | null) {
  return normalizePoint(page?.calibration_point_1) || normalizePoint(page?.calibration_p1);
}

function getPageCalibrationP2(page: PageRow | null) {
  return normalizePoint(page?.calibration_point_2) || normalizePoint(page?.calibration_p2);
}

function decodeMeasurementPoints(row: MeasurementRow): Point[] {
  const bucket =
    row.points ??
    row.geometry?.points ??
    row.geometry?.vertices ??
    row.data?.points ??
    row.data?.vertices ??
    row.measurement_data?.points ??
    row.measurement_data?.vertices ??
    row.metadata?.points ??
    [];

  if (!Array.isArray(bucket)) return [];
  return bucket
    .map((p: any) => normalizePoint(p))
    .filter(Boolean) as Point[];
}

function normalizeMeasurement(row: MeasurementRow): SavedMeasurement {
  const typeRaw = (row.measurement_type || row.type || "line").toLowerCase();
  const type: MeasurementType =
    typeRaw === "area" ? "area" : typeRaw === "count" ? "count" : "line";
  const points = decodeMeasurementPoints(row);

  const numericValue = Number(
    row.quantity ??
      row.value ??
      row.data?.value ??
      row.measurement_data?.value ??
      (type === "count" ? points.length : 0)
  );

  const rawUnit =
    row.unit ??
    row.data?.unit ??
    row.measurement_data?.unit ??
    (type === "count" ? "pt" : "px");

  return {
    id: String(row.id || crypto.randomUUID()),
    type,
    name: row.name || row.label || `${type[0].toUpperCase()}${type.slice(1)} Measurement`,
    unit: rawUnit,
    value: Number.isFinite(numericValue) ? numericValue : 0,
    displayValue: formatMeasurementValue(
      type,
      Number.isFinite(numericValue) ? numericValue : 0,
      rawUnit
    ),
    points,
    color: type === "line" ? COLORS.line : type === "area" ? COLORS.area : COLORS.count,
    createdAt: row.created_at || row.updated_at || null,
    raw: row,
  };
}

async function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.onload = () => resolve(String(reader.result || ""));
    reader.readAsDataURL(file);
  });
}

export default function TakeoffPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams();
  const [searchParams] = useSearchParams();

  const stageRef = useRef<HTMLDivElement | null>(null);
  const overlayRef = useRef<SVGSVGElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [activeTab, setActiveTab] = useState<TakeoffTab>("drawings");
  const [mode, setMode] = useState<TakeoffMode>("select");
  const [loading, setLoading] = useState(true);
  const [savingPage, setSavingPage] = useState(false);
  const [savingMeasurement, setSavingMeasurement] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [projectId, setProjectId] = useState<string>("");
  const [session, setSession] = useState<SessionRow | null>(null);
  const [page, setPage] = useState<PageRow | null>(null);
  const [measurements, setMeasurements] = useState<SavedMeasurement[]>([]);

  const [drawingSource, setDrawingSource] = useState<DrawingSource | null>(null);
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [pdfPageCount, setPdfPageCount] = useState(1);

  const [naturalWidth, setNaturalWidth] = useState(1);
  const [naturalHeight, setNaturalHeight] = useState(1);

  const [view, setView] = useState<ViewportState>(DEFAULT_VIEW);
  const [draft, setDraft] = useState<DraftShape | null>(null);
  const [hoverWorldPoint, setHoverWorldPoint] = useState<Point | null>(null);
  const [selectedMeasurementId, setSelectedMeasurementId] = useState<string | null>(null);

  const [calibrationForm, setCalibrationForm] = useState({
    feet: "",
    inches: "",
    fraction: "0",
    unit: "ft" as CalibrationUnit,
  });
  const [calibrationDraftPoints, setCalibrationDraftPoints] = useState<{
    p1: Point | null;
    p2: Point | null;
  }>({ p1: null, p2: null });

  const [isPanning, setIsPanning] = useState(false);
  const panStateRef = useRef<{
    startClientX: number;
    startClientY: number;
    startOffsetX: number;
    startOffsetY: number;
  } | null>(null);

  const resolvedProjectId = useMemo(() => {
    const queryId =
      searchParams.get("projectId") ||
      searchParams.get("project_id") ||
      searchParams.get("pid");
    const stateId =
      (location.state as any)?.projectId ||
      (location.state as any)?.project_id ||
      "";
    const routeId =
      (params as any).projectId ||
      (params as any).id ||
      "";
    const storedId =
      typeof window !== "undefined"
        ? localStorage.getItem("magnus:selectedProjectId") || ""
        : "";

    return String(queryId || stateId || routeId || storedId || "");
  }, [location.state, params, searchParams]);

  const calibrationScale = useMemo(() => {
    if (page?.calibration_scale && page.calibration_scale > 0) return page.calibration_scale;
    const p1 = calibrationDraftPoints.p1;
    const p2 = calibrationDraftPoints.p2;
    if (!p1 || !p2) return null;
    const pixelDistance = distance(p1, p2);
    const totalDistance =
      safeNumber(calibrationForm.feet) +
      safeNumber(calibrationForm.inches) / 12 +
      parseFraction(calibrationForm.fraction) / 12;

    if (!pixelDistance || !totalDistance) return null;
    return totalDistance / pixelDistance;
  }, [page?.calibration_scale, calibrationDraftPoints, calibrationForm]);

  const calibrationUnit = useMemo<CalibrationUnit | null>(() => {
    return (page?.calibration_unit as CalibrationUnit | null) || calibrationForm.unit || "ft";
  }, [page?.calibration_unit, calibrationForm.unit]);

  const pageData = useMemo<Record<string, any>>(() => {
    return page?.page_data && typeof page.page_data === "object" ? page.page_data : {};
  }, [page?.page_data]);

  const currentPdfPageNumber = useMemo(() => {
    const stored = Number(pageData?.document?.currentPage || page?.page_number || 1);
    if (!Number.isFinite(stored) || stored < 1) return 1;
    return stored;
  }, [page?.page_number, pageData]);

  const stageCursor = useMemo(() => {
    if (mode === "pan" || isPanning) return "grab";
    if (mode === "calibrate") return "crosshair";
    if (mode === "line" || mode === "area" || mode === "count") return "crosshair";
    return "default";
  }, [isPanning, mode]);

  const selectedMeasurement = useMemo(
    () => measurements.find((m) => m.id === selectedMeasurementId) || null,
    [measurements, selectedMeasurementId]
  );

  const drawingSummaryText = useMemo(() => {
    if (!drawingSource) return "No drawing loaded";
    const inlineText = drawingSource.inlinePersisted ? "inline saved" : "session only";
    const pageText =
      drawingSource.type === "application/pdf" ? ` • page ${currentPdfPageNumber}/${pdfPageCount}` : "";
    return `${drawingSource.name}${pageText} • ${inlineText}`;
  }, [currentPdfPageNumber, drawingSource, pdfPageCount]);

  const fitToStage = useCallback(
    (contentWidth: number, contentHeight: number) => {
      const container = stageRef.current;
      if (!container || contentWidth <= 0 || contentHeight <= 0) return;
      const rect = container.getBoundingClientRect();
      const padding = 24;
      const scale = Math.min(
        Math.max((rect.width - padding * 2) / contentWidth, 0.05),
        Math.max((rect.height - padding * 2) / contentHeight, 0.05)
      );
      const offsetX = (rect.width - contentWidth * scale) / 2;
      const offsetY = (rect.height - contentHeight * scale) / 2;

      setView({
        scale: Math.max(0.05, Math.min(scale, 12)),
        offsetX,
        offsetY,
      });
    },
    []
  );

  const persistPageState = useCallback(
    async (patch: Partial<PageRow>, patchPageData?: Record<string, any>) => {
      if (!page?.id) return;
      setSavingPage(true);
      setError(null);

      const nextPageData = {
        ...(page.page_data || {}),
        ...(patchPageData || {}),
      };

      const payload: Record<string, any> = {
        ...patch,
        page_data: nextPageData,
        updated_at: new Date().toISOString(),
      };

      const { data, error: updateError } = await supabase
        .from("takeoff_pages")
        .update(payload)
        .eq("id", page.id)
        .select("*")
        .single();

      setSavingPage(false);

      if (updateError) {
        setError(updateError.message);
        return;
      }

      setPage(data as PageRow);
    },
    [page]
  );

  const loadMeasurements = useCallback(
    async (pageId: string, projectIdValue: string, sessionIdValue: string) => {
      const candidates = [
        supabase
          .from("takeoff_measurements")
          .select("*")
          .eq("page_id", pageId)
          .order("created_at", { ascending: true }),
        supabase
          .from("takeoff_measurements")
          .select("*")
          .eq("takeoff_page_id", pageId)
          .order("created_at", { ascending: true }),
        supabase
          .from("takeoff_measurements")
          .select("*")
          .eq("project_id", projectIdValue)
          .eq("session_id", sessionIdValue)
          .order("created_at", { ascending: true }),
      ];

      for (const query of candidates) {
        const result = await query;
        if (!result.error && Array.isArray(result.data)) {
          const mapped = result.data.map((row) => normalizeMeasurement(row as MeasurementRow));
          setMeasurements(mapped);
          return;
        }
      }

      setMeasurements([]);
    },
    []
  );

 const ensureSessionAndPage = useCallback(async () => {
  if (!resolvedProjectId) {
    setError("No project selected. Open Takeoff from a project or pass projectId in the route/query.");
    setLoading(false);
    return;
  }

  setProjectId(resolvedProjectId);
  setLoading(true);
  setError(null);

  try {
    let activeSession: SessionRow | null = null;

    const sessionSearch = await supabase
      .from("takeoff_sessions")
      .select("*")
      .eq("project_id", resolvedProjectId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (sessionSearch.error) throw sessionSearch.error;

    if (sessionSearch.data) {
      activeSession = sessionSearch.data as SessionRow;
    } else {
      const sessionInsert = await supabase
        .from("takeoff_sessions")
        .insert({
          project_id: resolvedProjectId,
          name: "Takeoff Session",
        })
        .select("*")
        .single();

      if (sessionInsert.error) throw sessionInsert.error;
      activeSession = sessionInsert.data as SessionRow;
    }

    setSession(activeSession);

    // ---------- SAFE PAGE LOAD / CREATE ----------
    let activePage: PageRow | null = null;

    const existingPage = await supabase
      .from("takeoff_pages")
      .select("*")
      .eq("project_id", resolvedProjectId)
      .eq("session_id", activeSession.id)
      .eq("page_number", 1)
      .maybeSingle();

    if (existingPage.error) throw existingPage.error;

    if (existingPage.data) {
      activePage = existingPage.data as PageRow;
    } else {
      const insertResult = await supabase
        .from("takeoff_pages")
        .insert({
          project_id: resolvedProjectId,
          session_id: activeSession.id,
          page_number: 1,
          page_label: "Page 1",
          width: 1,
          height: 1,
          page_data: {
            document: null,
            measurementsSummary: {
              line: 0,
              area: 0,
              count: 0,
            },
          },
        })
        .select("*")
        .single();

      if (insertResult.error) {
        // if another render inserted page 1 first, reload it instead of failing
        if (
          insertResult.error.message?.includes("duplicate key value") ||
          insertResult.error.code === "23505"
        ) {
          const reloadExisting = await supabase
            .from("takeoff_pages")
            .select("*")
            .eq("project_id", resolvedProjectId)
            .eq("session_id", activeSession.id)
            .eq("page_number", 1)
            .single();

          if (reloadExisting.error) throw reloadExisting.error;
          activePage = reloadExisting.data as PageRow;
        } else {
          throw insertResult.error;
        }
      } else {
        activePage = insertResult.data as PageRow;
      }
    }

    setPage(activePage);
    setCalibrationDraftPoints({
      p1: getPageCalibrationP1(activePage),
      p2: getPageCalibrationP2(activePage),
    });
    setCalibrationForm((prev) => ({
      ...prev,
      unit: (activePage.calibration_unit as CalibrationUnit | null) || prev.unit,
    }));

    await loadMeasurements(activePage.id, resolvedProjectId, activeSession.id);
  } catch (err: any) {
    setError(err?.message || "Failed to initialize takeoff session");
  } finally {
    setLoading(false);
  }
}, [loadMeasurements, resolvedProjectId]);

  useEffect(() => {
    void ensureSessionAndPage();
  }, [ensureSessionAndPage]);

  const renderPdfToCanvas = useCallback(
    async (pdf: pdfjsLib.PDFDocumentProxy, pageNumber: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const safePageNumber = Math.min(Math.max(pageNumber, 1), pdf.numPages);
      const pdfPage = await pdf.getPage(safePageNumber);
      const viewport = pdfPage.getViewport({ scale: 1 });
      const context = canvas.getContext("2d");
      if (!context) return;

      const ratio = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.floor(viewport.width * ratio));
      canvas.height = Math.max(1, Math.floor(viewport.height * ratio));
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;

      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.clearRect(0, 0, viewport.width, viewport.height);

      await pdfPage.render({
        canvasContext: context,
        viewport,
      }).promise;

      setNaturalWidth(viewport.width);
      setNaturalHeight(viewport.height);

      setPage((prev) =>
        prev
          ? {
              ...prev,
              width: viewport.width,
              height: viewport.height,
            }
          : prev
      );
    },
    []
  );

  const renderImageToCanvas = useCallback(async (dataUrl: string) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    await new Promise<void>((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const context = canvas.getContext("2d");
        if (!context) {
          reject(new Error("Canvas context unavailable"));
          return;
        }

        const ratio = window.devicePixelRatio || 1;
        canvas.width = Math.max(1, Math.floor(img.width * ratio));
        canvas.height = Math.max(1, Math.floor(img.height * ratio));
        canvas.style.width = `${img.width}px`;
        canvas.style.height = `${img.height}px`;

        context.setTransform(ratio, 0, 0, ratio, 0, 0);
        context.clearRect(0, 0, img.width, img.height);
        context.drawImage(img, 0, 0, img.width, img.height);

        setNaturalWidth(img.width);
        setNaturalHeight(img.height);

        setPage((prev) =>
          prev
            ? {
                ...prev,
                width: img.width,
                height: img.height,
              }
            : prev
        );
        resolve();
      };
      img.onerror = () => reject(new Error("Failed to load image"));
      img.src = dataUrl;
    });
  }, []);

  const loadDrawingIntoViewer = useCallback(
    async (source: DrawingSource, targetPdfPage?: number) => {
      setError(null);
      setDrawingSource(source);

      if (!source.dataUrl) return;

      if (source.type === "application/pdf") {
        const pdf = await pdfjsLib.getDocument(source.dataUrl).promise;
        setPdfDoc(pdf);
        setPdfPageCount(pdf.numPages);
        await renderPdfToCanvas(pdf, targetPdfPage || currentPdfPageNumber || 1);
      } else {
        setPdfDoc(null);
        setPdfPageCount(1);
        await renderImageToCanvas(source.dataUrl);
      }
    },
    [currentPdfPageNumber, renderImageToCanvas, renderPdfToCanvas]
  );

  useEffect(() => {
    const doc = pageData?.document;
    if (!doc?.dataUrl || !page) return;
    void loadDrawingIntoViewer(
      {
        name: doc.name || page.page_label || "Drawing",
        type: doc.type || "application/pdf",
        size: Number(doc.size || 0),
        dataUrl: doc.dataUrl,
        inlinePersisted: !!doc.inlinePersisted,
        totalPages: Number(doc.totalPages || 1),
      },
      Number(doc.currentPage || page.page_number || 1)
    );
  }, [loadDrawingIntoViewer, page, pageData]);

  useLayoutEffect(() => {
    if (naturalWidth > 1 && naturalHeight > 1) {
      fitToStage(naturalWidth, naturalHeight);
    }
  }, [fitToStage, naturalHeight, naturalWidth]);

  const screenToWorld = useCallback(
    (clientX: number, clientY: number): Point | null => {
      const stage = stageRef.current;
      if (!stage) return null;
      const rect = stage.getBoundingClientRect();
      const x = (clientX - rect.left - view.offsetX) / view.scale;
      const y = (clientY - rect.top - view.offsetY) / view.scale;

      return {
        x: Math.max(0, Math.min(naturalWidth, x)),
        y: Math.max(0, Math.min(naturalHeight, y)),
      };
    },
    [naturalHeight, naturalWidth, view]
  );

  const zoomAtPoint = useCallback(
    (clientX: number, clientY: number, zoomDelta: number) => {
      const stage = stageRef.current;
      if (!stage) return;
      const rect = stage.getBoundingClientRect();
      const px = clientX - rect.left;
      const py = clientY - rect.top;

      setView((prev) => {
        const nextScale = Math.max(0.05, Math.min(12, prev.scale * zoomDelta));
        const worldX = (px - prev.offsetX) / prev.scale;
        const worldY = (py - prev.offsetY) / prev.scale;

        return {
          scale: nextScale,
          offsetX: px - worldX * nextScale,
          offsetY: py - worldY * nextScale,
        };
      });
    },
    []
  );

  const saveCalibration = useCallback(async () => {
    if (!page) return;
    const p1 = calibrationDraftPoints.p1;
    const p2 = calibrationDraftPoints.p2;
    if (!p1 || !p2) {
      setError("Pick two calibration points on the drawing.");
      return;
    }

    const pixelDistance = distance(p1, p2);
    if (!pixelDistance) {
      setError("Calibration points are too close together.");
      return;
    }

    let distanceValue = 0;
    if (calibrationForm.unit === "ft") {
      distanceValue =
        safeNumber(calibrationForm.feet) +
        safeNumber(calibrationForm.inches) / 12 +
        parseFraction(calibrationForm.fraction) / 12;
    } else {
      distanceValue = safeNumber(calibrationForm.feet);
    }

    if (!distanceValue || distanceValue <= 0) {
      setError("Enter a valid calibration distance.");
      return;
    }

    const scale = distanceValue / pixelDistance;
    const nextPageData = {
      calibration: {
        unit: calibrationForm.unit,
        distance: distanceValue,
        p1,
        p2,
        pixelDistance,
        scale,
      },
      viewport: view,
    };

    await persistPageState(
      {
        calibration_scale: scale,
        calibration_unit: calibrationForm.unit,
        calibration_distance: distanceValue,
        calibration_point_1: p1,
        calibration_point_2: p2,
        calibration_p1: p1,
        calibration_p2: p2,
      },
      nextPageData
    );

    setMode("select");
  }, [calibrationDraftPoints, calibrationForm, page, persistPageState, view]);

  const resetCalibration = useCallback(async () => {
    setCalibrationDraftPoints({ p1: null, p2: null });
    setCalibrationForm({
      feet: "",
      inches: "",
      fraction: "0",
      unit: "ft",
    });

    if (page) {
      await persistPageState(
        {
          calibration_scale: null,
          calibration_unit: null,
          calibration_distance: null,
          calibration_point_1: null,
          calibration_point_2: null,
          calibration_p1: null,
          calibration_p2: null,
        },
        {
          calibration: null,
        }
      );
    }
  }, [page, persistPageState]);

  const persistMeasurement = useCallback(
    async (measurement: SavedMeasurement) => {
      if (!projectId || !session?.id || !page?.id) return;

      setSavingMeasurement(true);
      setError(null);

      const payloads: Array<Record<string, any>> = [
        {
          project_id: projectId,
          session_id: session.id,
          page_id: page.id,
          measurement_type: measurement.type,
          name: measurement.name,
          unit: measurement.unit,
          quantity: measurement.value,
          points: measurement.points,
          measurement_data: {
            value: measurement.value,
            unit: measurement.unit,
            points: measurement.points,
            color: measurement.color,
            displayValue: measurement.displayValue,
          },
        },
        {
          project_id: projectId,
          session_id: session.id,
          takeoff_page_id: page.id,
          type: measurement.type,
          label: measurement.name,
          unit: measurement.unit,
          value: measurement.value,
          geometry: {
            points: measurement.points,
            color: measurement.color,
          },
          metadata: {
            displayValue: measurement.displayValue,
          },
        },
        {
          project_id: projectId,
          session_id: session.id,
          page_id: page.id,
          type: measurement.type,
          name: measurement.name,
          data: {
            value: measurement.value,
            unit: measurement.unit,
            points: measurement.points,
            color: measurement.color,
            displayValue: measurement.displayValue,
          },
        },
      ];

      let inserted: MeasurementRow | null = null;
      let lastError: any = null;

      for (const payload of payloads) {
        const result = await supabase
          .from("takeoff_measurements")
          .insert(payload)
          .select("*")
          .single();

        if (!result.error && result.data) {
          inserted = result.data as MeasurementRow;
          break;
        }

        lastError = result.error;
      }

      setSavingMeasurement(false);

      if (!inserted) {
        setError(lastError?.message || "Failed to save measurement");
        return;
      }

      const normalized = normalizeMeasurement(inserted);
      setMeasurements((prev) => [...prev, normalized]);

      const summary = [...measurements, normalized].reduce(
        (acc, item) => {
          acc[item.type] += 1;
          return acc;
        },
        { line: 0, area: 0, count: 0 }
      );

      await persistPageState(
        {},
        {
          measurementsSummary: summary,
          lastMeasurementAt: new Date().toISOString(),
        }
      );
    },
    [measurements, page?.id, persistPageState, projectId, session?.id]
  );

  const deleteMeasurement = useCallback(
    async (measurement: SavedMeasurement) => {
      if (!measurement?.id) return;

      const deletionAttempts = [
        supabase.from("takeoff_measurements").delete().eq("id", measurement.id),
      ];

      for (const attempt of deletionAttempts) {
        const result = await attempt;
        if (!result.error) {
          setMeasurements((prev) => prev.filter((m) => m.id !== measurement.id));
          if (selectedMeasurementId === measurement.id) {
            setSelectedMeasurementId(null);
          }
          return;
        }
      }
    },
    [selectedMeasurementId]
  );

  const completeDraftMeasurement = useCallback(async () => {
    if (!draft) return;

    if (draft.type === "line" && draft.points.length < 2) return;
    if (draft.type === "area" && draft.points.length < 3) return;
    if (draft.type === "count" && draft.points.length < 1) return;

    const world = toWorldValue(draft.type, draft.points, page?.calibration_scale || null, page?.calibration_unit || null);

    const measurement: SavedMeasurement = {
      id: crypto.randomUUID(),
      type: draft.type,
      name:
        draft.type === "line"
          ? `Line ${measurements.filter((m) => m.type === "line").length + 1}`
          : draft.type === "area"
          ? `Area ${measurements.filter((m) => m.type === "area").length + 1}`
          : `Count ${measurements.filter((m) => m.type === "count").length + 1}`,
      unit: world.unit,
      value: world.value,
      displayValue: world.display,
      points: draft.points,
      color: draft.type === "line" ? COLORS.line : draft.type === "area" ? COLORS.area : COLORS.count,
    };

    setDraft(null);
    setMode("select");
    await persistMeasurement(measurement);
  }, [draft, measurements, page?.calibration_scale, page?.calibration_unit, persistMeasurement]);

  const handleStagePointerDown = useCallback(
    async (event: React.PointerEvent<HTMLDivElement>) => {
      const targetWorld = screenToWorld(event.clientX, event.clientY);
      if (!targetWorld) return;

      if (mode === "pan" || event.button === 1 || event.altKey || event.shiftKey) {
        setIsPanning(true);
        panStateRef.current = {
          startClientX: event.clientX,
          startClientY: event.clientY,
          startOffsetX: view.offsetX,
          startOffsetY: view.offsetY,
        };
        return;
      }

      if (mode === "calibrate") {
        setCalibrationDraftPoints((prev) => {
          if (!prev.p1) return { p1: targetWorld, p2: null };
          if (!prev.p2) return { p1: prev.p1, p2: targetWorld };
          return { p1: targetWorld, p2: null };
        });
        return;
      }

      if (mode === "line") {
        setDraft((prev) => {
          const points = prev?.type === "line" ? [...prev.points, targetWorld] : [targetWorld];
          const next = { type: "line" as MeasurementType, points };
          if (points.length >= 2) {
            void Promise.resolve().then(async () => {
              setDraft(next);
              await completeDraftMeasurement();
            });
          }
          return next;
        });
        return;
      }

      if (mode === "area") {
        setDraft((prev) => {
          const points = prev?.type === "area" ? [...prev.points, targetWorld] : [targetWorld];
          return { type: "area" as MeasurementType, points };
        });
        return;
      }

      if (mode === "count") {
        const next: DraftShape = {
          type: "count",
          points: [targetWorld],
        };
        setDraft(next);
        void Promise.resolve().then(async () => {
          setDraft(next);
          await completeDraftMeasurement();
        });
      }
    },
    [completeDraftMeasurement, mode, screenToWorld, view.offsetX, view.offsetY]
  );

  const handleStagePointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const world = screenToWorld(event.clientX, event.clientY);
      setHoverWorldPoint(world);

      if (!isPanning || !panStateRef.current) return;

      const dx = event.clientX - panStateRef.current.startClientX;
      const dy = event.clientY - panStateRef.current.startClientY;

      setView((prev) => ({
        ...prev,
        offsetX: panStateRef.current!.startOffsetX + dx,
        offsetY: panStateRef.current!.startOffsetY + dy,
      }));
    },
    [isPanning, screenToWorld]
  );

  const handleStagePointerUp = useCallback(() => {
    setIsPanning(false);
    panStateRef.current = null;
  }, []);

  const handleWheel = useCallback(
    (event: React.WheelEvent<HTMLDivElement>) => {
      if (event.ctrlKey || event.metaKey || mode === "pan") {
        event.preventDefault();
        const zoomDelta = event.deltaY < 0 ? 1.08 : 0.92;
        zoomAtPoint(event.clientX, event.clientY, zoomDelta);
      }
    },
    [mode, zoomAtPoint]
  );

  const handleStageDoubleClick = useCallback(async () => {
    if (draft?.type === "area" && draft.points.length >= 3) {
      await completeDraftMeasurement();
    }
  }, [completeDraftMeasurement, draft]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setDraft(null);
        if (mode !== "select") setMode("select");
      }
      if (event.key === "Enter" && draft?.type === "area" && draft.points.length >= 3) {
        void completeDraftMeasurement();
      }
      if ((event.key === "+" || event.key === "=") && stageRef.current) {
        const rect = stageRef.current.getBoundingClientRect();
        zoomAtPoint(rect.left + rect.width / 2, rect.top + rect.height / 2, 1.08);
      }
      if (event.key === "-" && stageRef.current) {
        const rect = stageRef.current.getBoundingClientRect();
        zoomAtPoint(rect.left + rect.width / 2, rect.top + rect.height / 2, 0.92);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [completeDraftMeasurement, draft, mode, zoomAtPoint]);

  const handleUploadFile = useCallback(
    async (file: File) => {
      if (!page) return;

      setError(null);

      const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
      const isImage = file.type.startsWith("image/");
      if (!isPdf && !isImage) {
        setError("Upload a PDF or image file.");
        return;
      }

      const dataUrl = await fileToDataUrl(file);
      const inlinePersisted = dataUrl.length < 7_500_000;

      const source: DrawingSource = {
        name: file.name,
        type: isPdf ? "application/pdf" : file.type,
        size: file.size,
        dataUrl,
        inlinePersisted,
      };

      await loadDrawingIntoViewer(source, 1);

      const nextPageData = {
        document: {
          name: file.name,
          type: source.type,
          size: file.size,
          dataUrl: inlinePersisted ? dataUrl : null,
          inlinePersisted,
          currentPage: 1,
          totalPages: isPdf ? pdfPageCount : 1,
          uploadedAt: new Date().toISOString(),
        },
        viewport: DEFAULT_VIEW,
      };

      await persistPageState(
        {
          page_label: file.name,
          page_number: 1,
          width: naturalWidth,
          height: naturalHeight,
        },
        nextPageData
      );
    },
    [loadDrawingIntoViewer, naturalHeight, naturalWidth, page, pdfPageCount, persistPageState]
  );

  const changePdfPage = useCallback(
    async (nextPageNumber: number) => {
      if (!pdfDoc || !page) return;

      const safePageNumber = Math.min(Math.max(nextPageNumber, 1), pdfDoc.numPages);
      await renderPdfToCanvas(pdfDoc, safePageNumber);

      await persistPageState(
        {
          page_number: safePageNumber,
        },
        {
          document: {
            ...(pageData?.document || {}),
            currentPage: safePageNumber,
            totalPages: pdfDoc.numPages,
          },
        }
      );
    },
    [page, pageData, pdfDoc, persistPageState, renderPdfToCanvas]
  );

  const overlayDraftPath = useMemo(() => {
    if (!draft || draft.points.length === 0) return "";
    const path = draft.points
      .map((p, idx) => `${idx === 0 ? "M" : "L"} ${p.x} ${p.y}`)
      .join(" ");
    if (draft.type === "area" && draft.points.length >= 3) {
      return `${path} Z`;
    }
    return path;
  }, [draft]);

  const measurementSummary = useMemo(() => {
    return measurements.reduce(
      (acc, item) => {
        acc[item.type] += 1;
        return acc;
      },
      { line: 0, area: 0, count: 0 }
    );
  }, [measurements]);

  if (loading) {
    return (
      <div className="flex h-full min-h-[70vh] items-center justify-center rounded-2xl border border-slate-200 bg-white">
        <div className="flex items-center gap-3 text-sm text-slate-600">
          <RefreshCw className="h-4 w-4 animate-spin" />
          Loading takeoff engine...
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-[calc(100vh-7rem)] flex-col gap-3 bg-slate-50">
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,image/*"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) {
            void handleUploadFile(file);
          }
          event.currentTarget.value = "";
        }}
      />

      <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <div className="rounded-xl bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
              Project
            </div>
            <div className="truncate text-sm font-medium text-slate-900">
              {projectId || "No project selected"}
            </div>
            <div className="hidden h-4 w-px bg-slate-200 md:block" />
            <div className="truncate text-xs text-slate-500">{drawingSummaryText}</div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setMode("select")}
              className={classNames(
                "inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs font-medium transition",
                mode === "select"
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              )}
            >
              <MousePointer2 className="h-3.5 w-3.5" />
              Select
            </button>

            <button
              type="button"
              onClick={() => setMode("pan")}
              className={classNames(
                "inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs font-medium transition",
                mode === "pan"
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              )}
            >
              <Hand className="h-3.5 w-3.5" />
              Pan
            </button>

            <button
              type="button"
              onClick={() => setMode("calibrate")}
              className={classNames(
                "inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs font-medium transition",
                mode === "calibrate"
                  ? "border-violet-700 bg-violet-700 text-white"
                  : "border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100"
              )}
            >
              <Ruler className="h-3.5 w-3.5" />
              Calibrate
            </button>

            <button
              type="button"
              onClick={() => setMode("line")}
              className={classNames(
                "inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs font-medium transition",
                mode === "line"
                  ? "border-teal-700 bg-teal-700 text-white"
                  : "border-teal-200 bg-teal-50 text-teal-700 hover:bg-teal-100"
              )}
            >
              <Move className="h-3.5 w-3.5" />
              Line
            </button>

            <button
              type="button"
              onClick={() => setMode("area")}
              className={classNames(
                "inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs font-medium transition",
                mode === "area"
                  ? "border-blue-700 bg-blue-700 text-white"
                  : "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100"
              )}
            >
              <PencilLine className="h-3.5 w-3.5" />
              Area
            </button>

            <button
              type="button"
              onClick={() => setMode("count")}
              className={classNames(
                "inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs font-medium transition",
                mode === "count"
                  ? "border-rose-700 bg-rose-700 text-white"
                  : "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
              )}
            >
              <Target className="h-3.5 w-3.5" />
              Count
            </button>

            <div className="mx-1 hidden h-6 w-px bg-slate-200 md:block" />

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              <Upload className="h-3.5 w-3.5" />
              Upload
            </button>

            <button
              type="button"
              onClick={() => fitToStage(naturalWidth, naturalHeight)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              <Crosshair className="h-3.5 w-3.5" />
              Fit
            </button>

            <button
              type="button"
              onClick={() =>
                setView((prev) => ({
                  ...prev,
                  scale: Math.min(12, prev.scale * 1.08),
                }))
              }
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>

            <button
              type="button"
              onClick={() =>
                setView((prev) => ({
                  ...prev,
                  scale: Math.max(0.05, prev.scale * 0.92),
                }))
              }
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              <Minus className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
          <span className="rounded-lg bg-slate-100 px-2 py-1">
            Zoom {(view.scale * 100).toFixed(0)}%
          </span>
          <span className="rounded-lg bg-slate-100 px-2 py-1">
            Size {Math.round(naturalWidth)} × {Math.round(naturalHeight)}
          </span>
          <span
            className={classNames(
              "rounded-lg px-2 py-1",
              page?.calibration_scale
                ? "bg-emerald-50 text-emerald-700"
                : "bg-amber-50 text-amber-700"
            )}
          >
            {page?.calibration_scale
              ? `Calibrated • 1 px = ${page.calibration_scale.toFixed(5)} ${page.calibration_unit || "ft"}`
              : "Not calibrated"}
          </span>
          <span className="rounded-lg bg-slate-100 px-2 py-1">
            Cursor {hoverWorldPoint ? pointToString(hoverWorldPoint) : "—"}
          </span>
          {savingPage && (
            <span className="rounded-lg bg-blue-50 px-2 py-1 text-blue-700">Saving page...</span>
          )}
          {savingMeasurement && (
            <span className="rounded-lg bg-blue-50 px-2 py-1 text-blue-700">Saving measurement...</span>
          )}
          {error && (
            <span className="rounded-lg bg-rose-50 px-2 py-1 text-rose-700">{error}</span>
          )}
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 xl:grid-cols-[320px,minmax(0,1fr)]">
        <div className="flex min-h-0 flex-col gap-3">
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-3 py-2">
              <div className="flex flex-wrap gap-1">
                {TABS.map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setActiveTab(tab.key)}
                    className={classNames(
                      "rounded-xl px-2.5 py-1.5 text-xs font-medium transition",
                      activeTab === tab.key
                        ? "bg-slate-900 text-white"
                        : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                    )}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="max-h-[calc(100vh-16rem)] overflow-y-auto p-3">
              {activeTab === "drawings" && (
                <div className="space-y-3">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Drawing Source
                    </div>
                    <div className="mt-2 text-sm font-medium text-slate-900">
                      {drawingSource?.name || page?.page_label || "No file loaded"}
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      Upload a PDF or image. The page stores drawing metadata and inline data when small enough.
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                      >
                        <FileUp className="h-3.5 w-3.5" />
                        Upload Drawing
                      </button>
                      <button
                        type="button"
                        onClick={() => void ensureSessionAndPage()}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                        Reload
                      </button>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-200 p-3">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Page Info
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-slate-600">
                      <div className="rounded-xl bg-slate-50 px-3 py-2">
                        <div className="text-[11px] text-slate-500">Session</div>
                        <div className="mt-1 truncate font-medium text-slate-900">
                          {session?.id || "—"}
                        </div>
                      </div>
                      <div className="rounded-xl bg-slate-50 px-3 py-2">
                        <div className="text-[11px] text-slate-500">Page ID</div>
                        <div className="mt-1 truncate font-medium text-slate-900">
                          {page?.id || "—"}
                        </div>
                      </div>
                      <div className="rounded-xl bg-slate-50 px-3 py-2">
                        <div className="text-[11px] text-slate-500">Page Number</div>
                        <div className="mt-1 font-medium text-slate-900">
                          {page?.page_number || 1}
                        </div>
                      </div>
                      <div className="rounded-xl bg-slate-50 px-3 py-2">
                        <div className="text-[11px] text-slate-500">PDF Pages</div>
                        <div className="mt-1 font-medium text-slate-900">{pdfPageCount}</div>
                      </div>
                    </div>

                    {pdfDoc && (
                      <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                          PDF Navigation
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            disabled={currentPdfPageNumber <= 1}
                            onClick={() => void changePdfPage(currentPdfPageNumber - 1)}
                            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 disabled:opacity-50"
                          >
                            Prev
                          </button>
                          <div className="rounded-xl bg-white px-3 py-2 text-xs font-medium text-slate-700">
                            Page {currentPdfPageNumber} / {pdfPageCount}
                          </div>
                          <button
                            type="button"
                            disabled={currentPdfPageNumber >= pdfPageCount}
                            onClick={() => void changePdfPage(currentPdfPageNumber + 1)}
                            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 disabled:opacity-50"
                          >
                            Next
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {activeTab === "measurements" && (
                <div className="space-y-3">
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div className="rounded-2xl border border-teal-100 bg-teal-50 px-3 py-2">
                      <div className="text-teal-700">Lines</div>
                      <div className="mt-1 text-lg font-semibold text-teal-900">
                        {measurementSummary.line}
                      </div>
                    </div>
                    <div className="rounded-2xl border border-blue-100 bg-blue-50 px-3 py-2">
                      <div className="text-blue-700">Areas</div>
                      <div className="mt-1 text-lg font-semibold text-blue-900">
                        {measurementSummary.area}
                      </div>
                    </div>
                    <div className="rounded-2xl border border-rose-100 bg-rose-50 px-3 py-2">
                      <div className="text-rose-700">Counts</div>
                      <div className="mt-1 text-lg font-semibold text-rose-900">
                        {measurementSummary.count}
                      </div>
                    </div>
                  </div>

                  {draft && (
                    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3">
                      <div className="text-xs font-semibold uppercase tracking-wide text-amber-700">
                        Active Draft
                      </div>
                      <div className="mt-1 text-sm font-medium text-amber-900">
                        {draft.type.toUpperCase()} • {draft.points.length} point
                        {draft.points.length === 1 ? "" : "s"}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {draft.type === "area" && draft.points.length >= 3 && (
                          <button
                            type="button"
                            onClick={() => void completeDraftMeasurement()}
                            className="rounded-xl border border-amber-200 bg-white px-3 py-2 text-xs font-medium text-amber-700"
                          >
                            Finish Area
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setDraft(null)}
                          className="rounded-xl border border-amber-200 bg-white px-3 py-2 text-xs font-medium text-amber-700"
                        >
                          Cancel Draft
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="space-y-2">
                    {measurements.length === 0 && (
                      <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
                        No measurements saved yet.
                      </div>
                    )}

                    {measurements.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setSelectedMeasurementId(item.id)}
                        className={classNames(
                          "w-full rounded-2xl border p-3 text-left transition",
                          selectedMeasurementId === item.id
                            ? "border-slate-900 bg-slate-900 text-white"
                            : "border-slate-200 bg-white hover:bg-slate-50"
                        )}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold">{item.name}</div>
                            <div
                              className={classNames(
                                "mt-1 text-xs",
                                selectedMeasurementId === item.id ? "text-slate-300" : "text-slate-500"
                              )}
                            >
                              {item.type.toUpperCase()} • {item.displayValue}
                            </div>
                          </div>
                          <div
                            className="mt-1 h-3 w-3 shrink-0 rounded-full"
                            style={{ backgroundColor: item.color }}
                          />
                        </div>
                      </button>
                    ))}
                  </div>

                  {selectedMeasurement && (
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Selected Measurement
                      </div>
                      <div className="mt-2 text-sm font-semibold text-slate-900">
                        {selectedMeasurement.name}
                      </div>
                      <div className="mt-1 text-xs text-slate-600">
                        {selectedMeasurement.displayValue}
                      </div>
                      <div className="mt-3 flex gap-2">
                        <button
                          type="button"
                          onClick={() => void deleteMeasurement(selectedMeasurement)}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-white px-3 py-2 text-xs font-medium text-rose-700"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Delete
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {activeTab === "details" && (
                <div className="space-y-3">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Calibration
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                      <div className="rounded-xl bg-white px-3 py-2">
                        <div className="text-slate-500">Point 1</div>
                        <div className="mt-1 font-medium text-slate-900">
                          {pointToString(calibrationDraftPoints.p1 || getPageCalibrationP1(page))}
                        </div>
                      </div>
                      <div className="rounded-xl bg-white px-3 py-2">
                        <div className="text-slate-500">Point 2</div>
                        <div className="mt-1 font-medium text-slate-900">
                          {pointToString(calibrationDraftPoints.p2 || getPageCalibrationP2(page))}
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 space-y-2">
                      <div className="grid grid-cols-4 gap-2">
                        <input
                          value={calibrationForm.feet}
                          onChange={(e) =>
                            setCalibrationForm((prev) => ({ ...prev, feet: e.target.value }))
                          }
                          placeholder={calibrationForm.unit === "ft" ? "Feet" : "Distance"}
                          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none ring-0"
                        />
                        <input
                          value={calibrationForm.inches}
                          onChange={(e) =>
                            setCalibrationForm((prev) => ({ ...prev, inches: e.target.value }))
                          }
                          placeholder="Inches"
                          disabled={calibrationForm.unit !== "ft"}
                          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none ring-0 disabled:bg-slate-100"
                        />
                        <select
                          value={calibrationForm.fraction}
                          onChange={(e) =>
                            setCalibrationForm((prev) => ({
                              ...prev,
                              fraction: e.target.value,
                            }))
                          }
                          disabled={calibrationForm.unit !== "ft"}
                          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none ring-0 disabled:bg-slate-100"
                        >
                          {FRACTIONS.map((fraction) => (
                            <option key={fraction} value={fraction}>
                              {fraction}
                            </option>
                          ))}
                        </select>
                        <select
                          value={calibrationForm.unit}
                          onChange={(e) =>
                            setCalibrationForm((prev) => ({
                              ...prev,
                              unit: e.target.value as CalibrationUnit,
                            }))
                          }
                          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none ring-0"
                        >
                          <option value="ft">ft</option>
                          <option value="in">in</option>
                          <option value="yd">yd</option>
                          <option value="m">m</option>
                          <option value="cm">cm</option>
                          <option value="mm">mm</option>
                        </select>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => setMode("calibrate")}
                          className="rounded-xl border border-violet-200 bg-white px-3 py-2 text-xs font-medium text-violet-700"
                        >
                          Start / Restart
                        </button>
                        <button
                          type="button"
                          onClick={() => void saveCalibration()}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700"
                        >
                          <Save className="h-3.5 w-3.5" />
                          Save Calibration
                        </button>
                        <button
                          type="button"
                          onClick={() => void resetCalibration()}
                          className="rounded-xl border border-rose-200 bg-white px-3 py-2 text-xs font-medium text-rose-700"
                        >
                          Reset
                        </button>
                      </div>

                      <div className="rounded-xl bg-white px-3 py-2 text-xs text-slate-600">
                        Click two points directly on the viewer while in Calibration mode. Calibration is saved to the real page fields and mirrored into page_data.
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Measurement Tips
                    </div>
                    <ul className="mt-2 space-y-1 text-xs text-slate-600">
                      <li>• Line: click two points.</li>
                      <li>• Area: click multiple points, then double-click or press Enter.</li>
                      <li>• Count: each click saves one count point.</li>
                      <li>• Hold Alt or Shift and drag to pan quickly.</li>
                      <li>• Ctrl/Cmd + wheel zooms around the cursor.</li>
                    </ul>
                  </div>
                </div>
              )}

              {activeTab === "boq" && (
                <div className="space-y-3">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                    BOQ linking panel is ready for the next step. Measurements are already being saved and can now feed assemblies, items, and BOQ quantities.
                  </div>
                  <button
                    type="button"
                    onClick={() => navigate("/boq", { state: { projectId } })}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Open BOQ Builder
                  </button>
                </div>
              )}

              {activeTab === "settings" && (
                <div className="space-y-3">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Viewer State
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-slate-600">
                      <div className="rounded-xl bg-white px-3 py-2">
                        <div className="text-slate-500">Offset X</div>
                        <div className="mt-1 font-medium text-slate-900">{view.offsetX.toFixed(1)}</div>
                      </div>
                      <div className="rounded-xl bg-white px-3 py-2">
                        <div className="text-slate-500">Offset Y</div>
                        <div className="mt-1 font-medium text-slate-900">{view.offsetY.toFixed(1)}</div>
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setView(DEFAULT_VIEW)}
                        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700"
                      >
                        Reset View
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          void persistPageState(
                            {
                              width: naturalWidth,
                              height: naturalHeight,
                            },
                            {
                              viewport: view,
                              document: pageData?.document || null,
                            }
                          )
                        }
                        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700"
                      >
                        Save Page Data
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="min-h-0 rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div
            ref={stageRef}
            className="relative h-full min-h-[70vh] overflow-hidden rounded-2xl bg-[radial-gradient(circle_at_1px_1px,_rgba(148,163,184,0.16)_1px,_transparent_0)] [background-size:18px_18px]"
            style={{ cursor: stageCursor }}
            onPointerDown={handleStagePointerDown}
            onPointerMove={handleStagePointerMove}
            onPointerUp={handleStagePointerUp}
            onPointerLeave={handleStagePointerUp}
            onDoubleClick={() => void handleStageDoubleClick()}
            onWheel={handleWheel}
          >
            <div
              className="absolute left-0 top-0 origin-top-left"
              style={{
                transform: `translate(${view.offsetX}px, ${view.offsetY}px) scale(${view.scale})`,
                width: naturalWidth,
                height: naturalHeight,
              }}
            >
              <canvas
                ref={canvasRef}
                className="absolute left-0 top-0 block bg-white shadow-[0_16px_40px_rgba(15,23,42,0.10)]"
              />

              <svg
                ref={overlayRef}
                className="absolute left-0 top-0"
                width={naturalWidth}
                height={naturalHeight}
                viewBox={`0 0 ${naturalWidth} ${naturalHeight}`}
                fill="none"
              >
                {measurements.map((m) => {
                  if (m.type === "line") {
                    const d = m.points
                      .map((p, idx) => `${idx === 0 ? "M" : "L"} ${p.x} ${p.y}`)
                      .join(" ");
                    return (
                      <g key={m.id}>
                        <path
                          d={d}
                          stroke={m.color}
                          strokeWidth={2}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                        {m.points.map((p, idx) => (
                          <circle key={`${m.id}-${idx}`} cx={p.x} cy={p.y} r={3} fill={m.color} />
                        ))}
                      </g>
                    );
                  }

                  if (m.type === "area") {
                    const d = `${m.points
                      .map((p, idx) => `${idx === 0 ? "M" : "L"} ${p.x} ${p.y}`)
                      .join(" ")} Z`;
                    return (
                      <g key={m.id}>
                        <path
                          d={d}
                          fill="rgba(37,99,235,0.18)"
                          stroke={m.color}
                          strokeWidth={2}
                          strokeLinejoin="round"
                        />
                        {m.points.map((p, idx) => (
                          <circle key={`${m.id}-${idx}`} cx={p.x} cy={p.y} r={3} fill={m.color} />
                        ))}
                      </g>
                    );
                  }

                  return (
                    <g key={m.id}>
                      {m.points.map((p, idx) => (
                        <g key={`${m.id}-${idx}`}>
                          <circle cx={p.x} cy={p.y} r={6} fill="rgba(220,38,38,0.15)" />
                          <circle cx={p.x} cy={p.y} r={3} fill={m.color} />
                        </g>
                      ))}
                    </g>
                  );
                })}

                {draft && draft.points.length > 0 && (
                  <g>
                    <path
                      d={overlayDraftPath}
                      stroke={COLORS.draft}
                      strokeWidth={2}
                      strokeDasharray="8 6"
                      fill={draft.type === "area" && draft.points.length >= 3 ? "rgba(245,158,11,0.12)" : "none"}
                    />
                    {draft.points.map((p, idx) => (
                      <circle key={`draft-${idx}`} cx={p.x} cy={p.y} r={3.5} fill={COLORS.draft} />
                    ))}
                  </g>
                )}

                {(calibrationDraftPoints.p1 || getPageCalibrationP1(page)) && (
                  <circle
                    cx={(calibrationDraftPoints.p1 || getPageCalibrationP1(page))!.x}
                    cy={(calibrationDraftPoints.p1 || getPageCalibrationP1(page))!.y}
                    r={5}
                    fill={COLORS.calibration}
                  />
                )}

                {(calibrationDraftPoints.p2 || getPageCalibrationP2(page)) && (
                  <circle
                    cx={(calibrationDraftPoints.p2 || getPageCalibrationP2(page))!.x}
                    cy={(calibrationDraftPoints.p2 || getPageCalibrationP2(page))!.y}
                    r={5}
                    fill={COLORS.calibration}
                  />
                )}

                {(calibrationDraftPoints.p1 || getPageCalibrationP1(page)) &&
                  (calibrationDraftPoints.p2 || getPageCalibrationP2(page)) && (
                    <line
                      x1={(calibrationDraftPoints.p1 || getPageCalibrationP1(page))!.x}
                      y1={(calibrationDraftPoints.p1 || getPageCalibrationP1(page))!.y}
                      x2={(calibrationDraftPoints.p2 || getPageCalibrationP2(page))!.x}
                      y2={(calibrationDraftPoints.p2 || getPageCalibrationP2(page))!.y}
                      stroke={COLORS.calibration}
                      strokeWidth={2}
                      strokeDasharray="6 6"
                    />
                  )}
              </svg>
            </div>

            {!drawingSource && (
              <div className="absolute inset-0 flex items-center justify-center p-8">
                <div className="max-w-md rounded-3xl border border-dashed border-slate-300 bg-white/85 p-8 text-center shadow-sm backdrop-blur">
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100">
                    <Upload className="h-6 w-6 text-slate-600" />
                  </div>
                  <div className="mt-4 text-base font-semibold text-slate-900">
                    Load a drawing to start takeoff
                  </div>
                  <div className="mt-2 text-sm text-slate-500">
                    Upload a PDF or image. Then calibrate directly on the viewer and start measuring.
                  </div>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="mt-4 inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800"
                  >
                    <Upload className="h-4 w-4" />
                    Upload Drawing
                  </button>
                </div>
              </div>
            )}

            <div className="pointer-events-none absolute bottom-3 left-3 rounded-2xl bg-slate-900/90 px-3 py-2 text-xs text-white shadow-lg">
              <div className="font-medium">{mode.toUpperCase()} MODE</div>
              <div className="mt-1 text-slate-300">
                {mode === "calibrate" && "Click two points on the drawing."}
                {mode === "line" && "Click two points to save a line."}
                {mode === "area" && "Click points, then double-click or press Enter."}
                {mode === "count" && "Click anywhere to place a count point."}
                {(mode === "select" || mode === "pan") && "Use wheel zoom and drag pan for navigation."}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}