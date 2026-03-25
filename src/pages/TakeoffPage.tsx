// src/pages/TakeoffPage.tsx
import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import * as pdfjsLib from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

type ToolMode = "pan" | "select" | "calibrate" | "line" | "area" | "count";
type RightTab =
  | "drawings"
  | "measurements"
  | "details"
  | "boq"
  | "settings";

type Point = { x: number; y: number };

type TakeoffPageRow = {
  id: string;
  project_id: string;
  drawing_id: string | null;
  page_number: number;
  calibration_scale: number | null;
  calibration_unit: string | null;
  calibration_p1: any | null;
  calibration_p2: any | null;
  page_data: any | null;
  created_at: string | null;
  updated_at: string | null;
  session_id: string | null;
  page_label: string | null;
  width: number | null;
  height: number | null;
  calibration_point_1: any | null;
  calibration_point_2: any | null;
  calibration_distance: number | null;
};

type LocalMeasurement = {
  id: string;
  type: "line" | "area" | "count";
  label: string;
  points: Point[];
  rawValue: number;
  scaledValue: number;
  unit: string;
  color: string;
  meta?: Record<string, any>;
};

type DrawingAsset = {
  kind: "pdf" | "image";
  name: string;
  sourceUrl: string;
  pages: Array<{
    pageNumber: number;
    imageUrl: string;
    width: number;
    height: number;
    label: string;
  }>;
};

type CalibrationForm = {
  feet: string;
  inches: string;
  fraction: string;
  unit: "ft" | "m";
};

type FitMode = "manual" | "width" | "page";

const STORAGE_KEY_PREFIX = "magnus_takeoff_session_";

const TOOL_COLORS: Record<LocalMeasurement["type"], string> = {
  line: "#38bdf8",
  area: "#22c55e",
  count: "#f59e0b",
};

function uid() {
  try {
    return crypto.randomUUID();
  } catch {
    return `id_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  }
}

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function parseJsonPoint(value: any): Point | null {
  if (!value) return null;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (
        parsed &&
        typeof parsed.x === "number" &&
        typeof parsed.y === "number"
      ) {
        return { x: parsed.x, y: parsed.y };
      }
    } catch {
      return null;
    }
  }
  if (
    typeof value === "object" &&
    typeof value.x === "number" &&
    typeof value.y === "number"
  ) {
    return { x: value.x, y: value.y };
  }
  return null;
}

function distance(a: Point, b: Point) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function polygonArea(points: Point[]) {
  if (points.length < 3) return 0;
  let area = 0;
  for (let i = 0; i < points.length; i += 1) {
    const j = (i + 1) % points.length;
    area += points[i].x * points[j].y - points[j].x * points[i].y;
  }
  return Math.abs(area) / 2;
}

function polygonCentroid(points: Point[]) {
  if (!points.length) return { x: 0, y: 0 };
  const sum = points.reduce(
    (acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }),
    { x: 0, y: 0 }
  );
  return { x: sum.x / points.length, y: sum.y / points.length };
}

function inchesFromFraction(fraction: string) {
  const value = fraction.trim();
  if (!value || value === "0") return 0;
  if (!value.includes("/")) {
    const num = Number(value);
    return Number.isFinite(num) ? num : 0;
  }
  const [a, b] = value.split("/").map((v) => Number(v.trim()));
  if (!Number.isFinite(a) || !Number.isFinite(b) || b === 0) return 0;
  return a / b;
}

function calibrationDistanceFromForm(form: CalibrationForm) {
  if (form.unit === "m") {
    const meters = Number(form.feet || "0");
    return Number.isFinite(meters) ? meters : 0;
  }
  const feet = Number(form.feet || "0");
  const inches = Number(form.inches || "0");
  const frac = inchesFromFraction(form.fraction || "0");
  return feet + (inches + frac) / 12;
}

function splitFeetAndInches(totalFeet: number) {
  if (!Number.isFinite(totalFeet) || totalFeet <= 0) {
    return { feet: "1", inches: "", fraction: "0" };
  }
  const wholeFeet = Math.floor(totalFeet);
  const totalInches = (totalFeet - wholeFeet) * 12;
  const wholeInches = Math.floor(totalInches);
  const remainder = totalInches - wholeInches;
  const sixteenths = Math.round(remainder * 16);

  if (sixteenths === 0) {
    return {
      feet: String(wholeFeet),
      inches: wholeInches ? String(wholeInches) : "",
      fraction: "0",
    };
  }

  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  const divisor = gcd(sixteenths, 16);

  return {
    feet: String(wholeFeet),
    inches: wholeInches ? String(wholeInches) : "",
    fraction: `${sixteenths / divisor}/${16 / divisor}`,
  };
}

function formatNumber(value: number, digits = 2) {
  if (!Number.isFinite(value)) return "0";
  return value.toLocaleString(undefined, {
    maximumFractionDigits: digits,
    minimumFractionDigits: 0,
  });
}

function formatMeasurement(m: LocalMeasurement) {
  if (m.type === "count") return `${formatNumber(m.scaledValue, 0)} ct`;
  return `${formatNumber(m.scaledValue)} ${m.unit}`;
}

function dbToLocalMeasurement(row: any): LocalMeasurement {
  const points = Array.isArray(row.points) ? row.points : [];
  return {
    id: row.id,
    type: row.type,
    label: row.label || row.type?.toUpperCase?.() || "Measurement",
    points,
    rawValue: Number(row.raw_value || 0),
    scaledValue: Number(row.scaled_value || 0),
    unit:
      row.unit ||
      (row.type === "area" ? "ft²" : row.type === "line" ? "ft" : "ct"),
    color:
      row.color ||
      TOOL_COLORS[(row.type as LocalMeasurement["type"]) || "line"] ||
      "#38bdf8",
    meta: row.meta || {},
  };
}

function localToDbMeasurement(
  measurement: LocalMeasurement,
  pageId: string,
  projectId: string,
  sessionId: string
) {
  return {
    id: measurement.id,
    page_id: pageId,
    project_id: projectId,
    session_id: sessionId,
    type: measurement.type,
    label: measurement.label,
    points: measurement.points,
    raw_value: measurement.rawValue,
    scaled_value: measurement.scaledValue,
    unit: measurement.unit,
    color: measurement.color,
    meta: measurement.meta || {},
    updated_at: new Date().toISOString(),
  };
}

async function renderPdfPages(file: File): Promise<DrawingAsset> {
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  const pages: DrawingAsset["pages"] = [];

  for (let i = 1; i <= pdf.numPages; i += 1) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 1.6 });
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) continue;
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    await page.render({ canvasContext: context, viewport }).promise;
    pages.push({
      pageNumber: i,
      imageUrl: canvas.toDataURL("image/png"),
      width: viewport.width,
      height: viewport.height,
      label: `${file.name} · Page ${i}`,
    });
  }

  return {
    kind: "pdf",
    name: file.name,
    sourceUrl: "",
    pages,
  };
}

async function renderImageFile(file: File): Promise<DrawingAsset> {
  const objectUrl = URL.createObjectURL(file);
  const size = await new Promise<{ width: number; height: number }>(
    (resolve) => {
      const img = new Image();
      img.onload = () =>
        resolve({ width: img.naturalWidth, height: img.naturalHeight });
      img.src = objectUrl;
    }
  );

  return {
    kind: "image",
    name: file.name,
    sourceUrl: objectUrl,
    pages: [
      {
        pageNumber: 1,
        imageUrl: objectUrl,
        width: size.width,
        height: size.height,
        label: file.name,
      },
    ],
  };
}

export default function TakeoffPage() {
  const navigate = useNavigate();
  const { projectId } = useParams<{ projectId: string }>();

  const [authReady, setAuthReady] = useState(false);
  const [projectName, setProjectName] = useState<string>("");

  const [sessionId, setSessionId] = useState<string>("");
  const [pages, setPages] = useState<TakeoffPageRow[]>([]);
  const [activePageId, setActivePageId] = useState<string>("");
  const [measurements, setMeasurements] = useState<LocalMeasurement[]>([]);

  const [loading, setLoading] = useState(true);
  const [pageBusy, setPageBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveStamp, setSaveStamp] = useState<string>("");

  const [rightTab, setRightTab] = useState<RightTab>("drawings");
  const [tool, setTool] = useState<ToolMode>("pan");
  const [fitMode, setFitMode] = useState<FitMode>("page");

  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });

  const [draftPoints, setDraftPoints] = useState<Point[]>([]);
  const [draftHoverPoint, setDraftHoverPoint] = useState<Point | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hoverCanvasPoint, setHoverCanvasPoint] = useState<Point | null>(null);

  const [showCalibration, setShowCalibration] = useState(false);
  const [calibrationPicking, setCalibrationPicking] = useState(false);
  const [calibrationP1, setCalibrationP1] = useState<Point | null>(null);
  const [calibrationP2, setCalibrationP2] = useState<Point | null>(null);
  const [calibrationForm, setCalibrationForm] = useState<CalibrationForm>({
    feet: "1",
    inches: "",
    fraction: "0",
    unit: "ft",
  });

  const [dragState, setDragState] = useState<{
    pointerId: number;
    startClientX: number;
    startClientY: number;
    startPanX: number;
    startPanY: number;
  } | null>(null);

  const [selectedMeasurementId, setSelectedMeasurementId] = useState<string>("");

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const canvasWrapRef = useRef<HTMLDivElement | null>(null);
  const saveTimerRef = useRef<number | null>(null);
  const autoFitPendingRef = useRef<boolean>(false);

  const activePage = useMemo(
    () => pages.find((p) => p.id === activePageId) || null,
    [pages, activePageId]
  );

  const activePageData = useMemo(() => {
    const data = activePage?.page_data || {};
    return typeof data === "object" && data ? data : {};
  }, [activePage]);

  const drawingImageUrl = useMemo(() => {
    return activePageData?.rendered_image_url || activePageData?.image_url || "";
  }, [activePageData]);

  const drawingWidth = useMemo(() => {
    return Number(activePage?.width || activePageData?.width || 0);
  }, [activePage, activePageData]);

  const drawingHeight = useMemo(() => {
    return Number(activePage?.height || activePageData?.height || 0);
  }, [activePage, activePageData]);

  const calibrationDistance = useMemo(() => {
    if (!activePage) return 0;
    return Number(activePage.calibration_distance ?? activePage.calibration_scale ?? 0);
  }, [activePage]);

  const calibrationUnit = useMemo(() => {
    return activePage?.calibration_unit || "ft";
  }, [activePage]);

  const pxToUnitScale = useMemo(() => {
    const p1 =
      parseJsonPoint(activePage?.calibration_point_1) ||
      parseJsonPoint(activePage?.calibration_p1);
    const p2 =
      parseJsonPoint(activePage?.calibration_point_2) ||
      parseJsonPoint(activePage?.calibration_p2);
    const realDistance = calibrationDistance;
    if (!p1 || !p2 || !realDistance) return 0;
    const px = distance(p1, p2);
    if (!px) return 0;
    return realDistance / px;
  }, [activePage, calibrationDistance]);

  const areaUnit = useMemo(() => {
    return calibrationUnit === "m" ? "m²" : "ft²";
  }, [calibrationUnit]);

  const lineUnit = useMemo(() => {
    return calibrationUnit === "m" ? "m" : "ft";
  }, [calibrationUnit]);

  const totals = useMemo(() => {
    let line = 0;
    let area = 0;
    let count = 0;
    for (const item of measurements) {
      if (item.type === "line") line += item.scaledValue;
      else if (item.type === "area") area += item.scaledValue;
      else if (item.type === "count") count += item.scaledValue;
    }
    return { line, area, count };
  }, [measurements]);

  const hasRenderedPages = useMemo(() => {
    return pages.some((page) => {
      const pageData =
        typeof page.page_data === "object" && page.page_data ? page.page_data : {};
      return Boolean(pageData?.rendered_image_url || pageData?.image_url);
    });
  }, [pages]);

  const fitToWidth = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport || !drawingWidth || !drawingHeight) return;
    const vpW = viewport.clientWidth;
    const vpH = viewport.clientHeight;
    if (!vpW || !vpH) return;

    const padding = 32;
    const nextZoom = Math.max(
      0.1,
      Math.min(8, Number(((vpW - padding * 2) / drawingWidth).toFixed(4)))
    );

    const scaledHeight = drawingHeight * nextZoom;
    const nextPanX = Math.round((vpW - drawingWidth * nextZoom) / 2);
    const nextPanY = scaledHeight < vpH ? Math.round((vpH - scaledHeight) / 2) : padding;

    setZoom(nextZoom);
    setPan({ x: nextPanX, y: nextPanY });
    setFitMode("width");
  }, [drawingWidth, drawingHeight]);

  const fitToPage = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport || !drawingWidth || !drawingHeight) return;
    const vpW = viewport.clientWidth;
    const vpH = viewport.clientHeight;
    if (!vpW || !vpH) return;

    const padding = 32;
    const scaleX = (vpW - padding * 2) / drawingWidth;
    const scaleY = (vpH - padding * 2) / drawingHeight;
    const nextZoom = Math.max(
      0.1,
      Math.min(8, Number(Math.min(scaleX, scaleY).toFixed(4)))
    );

    const nextPanX = Math.round((vpW - drawingWidth * nextZoom) / 2);
    const nextPanY = Math.round((vpH - drawingHeight * nextZoom) / 2);

    setZoom(nextZoom);
    setPan({ x: nextPanX, y: nextPanY });
    setFitMode("page");
  }, [drawingWidth, drawingHeight]);

  const setHundredPercent = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport || !drawingWidth || !drawingHeight) return;
    const vpW = viewport.clientWidth;
    const vpH = viewport.clientHeight;
    const nextZoom = 1;
    const nextPanX = Math.round((vpW - drawingWidth * nextZoom) / 2);
    const nextPanY = Math.round((vpH - drawingHeight * nextZoom) / 2);

    setZoom(nextZoom);
    setPan({ x: nextPanX, y: nextPanY });
    setFitMode("manual");
  }, [drawingWidth, drawingHeight]);

  const scheduleAutoFit = useCallback(
    (mode: FitMode = "page") => {
      autoFitPendingRef.current = true;
      setFitMode(mode);
    },
    []
  );

  useLayoutEffect(() => {
    if (!autoFitPendingRef.current) return;
    if (!drawingWidth || !drawingHeight) return;
    autoFitPendingRef.current = false;

    const id = window.requestAnimationFrame(() => {
      if (fitMode === "width") fitToWidth();
      else fitToPage();
    });

    return () => window.cancelAnimationFrame(id);
  }, [activePageId, drawingWidth, drawingHeight, fitMode, fitToPage, fitToWidth]);

  useEffect(() => {
    const onResize = () => {
      if (!drawingWidth || !drawingHeight) return;
      if (fitMode === "width") fitToWidth();
      else if (fitMode === "page") fitToPage();
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [drawingWidth, drawingHeight, fitMode, fitToPage, fitToWidth]);

  const setStableSessionId = useCallback((pid: string) => {
    const key = `${STORAGE_KEY_PREFIX}${pid}`;
    let current = localStorage.getItem(key);
    if (!current) {
      current = uid();
      localStorage.setItem(key, current);
    }
    setSessionId(current);
    return current;
  }, []);

  const markSaved = useCallback(() => {
    setSaving(false);
    setSaveStamp(new Date().toLocaleTimeString());
  }, []);

  const loadProjectMeta = useCallback(async () => {
    if (!projectId) return;
    const { data } = await supabase
      .from("projects")
      .select("id, name")
      .eq("id", projectId)
      .limit(1);
    if (data?.[0]?.name) setProjectName(data[0].name);
  }, [projectId]);

  const createPageRecord = useCallback(
    async (
      pid: string,
      sid: string,
      pageNumber: number,
      seed?: Partial<TakeoffPageRow>
    ): Promise<TakeoffPageRow | null> => {
      const insertPayload = {
        project_id: pid,
        session_id: sid,
        page_number: pageNumber,
        drawing_id: seed?.drawing_id ?? null,
        page_label: seed?.page_label ?? `Page ${pageNumber}`,
        page_data: seed?.page_data ?? {},
        width: seed?.width ?? null,
        height: seed?.height ?? null,
        calibration_scale: seed?.calibration_scale ?? null,
        calibration_unit: seed?.calibration_unit ?? null,
        calibration_distance: seed?.calibration_distance ?? null,
        calibration_point_1: seed?.calibration_point_1 ?? null,
        calibration_point_2: seed?.calibration_point_2 ?? null,
        calibration_p1: seed?.calibration_p1 ?? null,
        calibration_p2: seed?.calibration_p2 ?? null,
      };

      const inserted = await supabase.from("takeoff_pages").insert(insertPayload).select("*");
      if (!inserted.error && inserted.data?.[0]) {
        return inserted.data[0] as TakeoffPageRow;
      }

      const fallback = await supabase
        .from("takeoff_pages")
        .select("*")
        .eq("project_id", pid)
        .eq("session_id", sid)
        .eq("page_number", pageNumber)
        .order("created_at", { ascending: true })
        .limit(1);

      return (fallback.data?.[0] as TakeoffPageRow | undefined) || null;
    },
    []
  );

  const ensurePage = useCallback(
    async (
      pid: string,
      sid: string,
      pageNumber: number,
      seed?: Partial<TakeoffPageRow>
    ): Promise<TakeoffPageRow | null> => {
      const existing = await supabase
        .from("takeoff_pages")
        .select("*")
        .eq("project_id", pid)
        .eq("session_id", sid)
        .eq("page_number", pageNumber)
        .order("created_at", { ascending: true })
        .limit(1);

      const first = existing.data?.[0] as TakeoffPageRow | undefined;
      if (first) return first;

      return createPageRecord(pid, sid, pageNumber, seed);
    },
    [createPageRecord]
  );

  const loadPages = useCallback(
    async (pid: string, sid: string) => {
      const query = await supabase
        .from("takeoff_pages")
        .select("*")
        .eq("project_id", pid)
        .eq("session_id", sid)
        .order("page_number", { ascending: true })
        .order("created_at", { ascending: true });

      let rows = (query.data || []) as TakeoffPageRow[];

      if (!rows.length) {
        const firstPage = await ensurePage(pid, sid, 1, {
          page_label: "Page 1",
          page_data: {},
        });
        rows = firstPage ? [firstPage] : [];
      }

      rows = [...rows].sort((a, b) => {
        const aRendered = Boolean(
          (typeof a.page_data === "object" && a.page_data
            ? a.page_data.rendered_image_url || a.page_data.image_url
            : null) || a.width || a.height
        );
        const bRendered = Boolean(
          (typeof b.page_data === "object" && b.page_data
            ? b.page_data.rendered_image_url || b.page_data.image_url
            : null) || b.width || b.height
        );
        if (aRendered !== bRendered) return aRendered ? -1 : 1;
        return (a.page_number || 0) - (b.page_number || 0);
      });

      setPages(rows);

      if (rows.length) {
        const firstRendered =
          rows.find((row) => {
            const data =
              typeof row.page_data === "object" && row.page_data ? row.page_data : {};
            return Boolean(data?.rendered_image_url || data?.image_url);
          }) || rows[0];

        setActivePageId((prev) => {
          if (rows.some((r) => r.id === prev)) return prev;
          return firstRendered.id;
        });
      } else {
        setActivePageId("");
      }
    },
    [ensurePage]
  );

  const loadMeasurements = useCallback(async (pid: string, pageId: string) => {
    const { data } = await supabase
      .from("takeoff_measurements")
      .select("*")
      .eq("project_id", pid)
      .eq("page_id", pageId)
      .order("created_at", { ascending: true });

    setMeasurements((data || []).map(dbToLocalMeasurement));
  }, []);

  const initialize = useCallback(async () => {
    if (!projectId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setAuthReady(true);
      setLoading(false);
      return;
    }

    setAuthReady(true);
    const sid = setStableSessionId(projectId);
    await loadProjectMeta();
    await loadPages(projectId, sid);
    setLoading(false);
    scheduleAutoFit("page");
  }, [projectId, setStableSessionId, loadProjectMeta, loadPages, scheduleAutoFit]);

  useEffect(() => {
    initialize();
  }, [initialize]);

  useEffect(() => {
    if (!projectId || !activePageId) return;
    loadMeasurements(projectId, activePageId);
  }, [projectId, activePageId, loadMeasurements]);

  useEffect(() => {
    if (!activePage) return;

    const p1 =
      parseJsonPoint(activePage.calibration_point_1) ||
      parseJsonPoint(activePage.calibration_p1);
    const p2 =
      parseJsonPoint(activePage.calibration_point_2) ||
      parseJsonPoint(activePage.calibration_p2);

    setCalibrationP1(p1);
    setCalibrationP2(p2);

    if ((activePage.calibration_unit || "ft") === "m") {
      setCalibrationForm({
        feet: String(
          activePage.calibration_distance || activePage.calibration_scale || 1
        ),
        inches: "",
        fraction: "0",
        unit: "m",
      });
    } else {
      const parsed = splitFeetAndInches(
        Number(activePage.calibration_distance || activePage.calibration_scale || 1)
      );
      setCalibrationForm({
        feet: parsed.feet,
        inches: parsed.inches,
        fraction: parsed.fraction,
        unit: "ft",
      });
    }

    setDraftPoints([]);
    setDraftHoverPoint(null);
    setHoverCanvasPoint(null);
    setIsDrawing(false);
    setSelectedMeasurementId("");
    scheduleAutoFit(fitMode === "width" ? "width" : "page");
  }, [activePage, fitMode, scheduleAutoFit]);

  const persistPage = useCallback(
    async (pageId: string, patch: Partial<TakeoffPageRow>) => {
      if (!pageId) return;
      setSaving(true);

      const payload: Record<string, any> = {
        ...patch,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase.from("takeoff_pages").update(payload).eq("id", pageId);

      if (!error) {
        setPages((prev) =>
          prev.map((p) => (p.id === pageId ? ({ ...p, ...payload } as TakeoffPageRow) : p))
        );
        markSaved();
      } else {
        setSaving(false);
      }
    },
    [markSaved]
  );

  const persistMeasurements = useCallback(
    async (nextMeasurements: LocalMeasurement[]) => {
      if (!projectId || !activePageId || !sessionId) return;

      setSaving(true);

      const deleteIds = measurements
        .map((m) => m.id)
        .filter((id) => !nextMeasurements.some((n) => n.id === id));

      if (deleteIds.length) {
        await supabase.from("takeoff_measurements").delete().in("id", deleteIds);
      }

      if (nextMeasurements.length) {
        const payload = nextMeasurements.map((m) =>
          localToDbMeasurement(m, activePageId, projectId, sessionId)
        );
        await supabase.from("takeoff_measurements").upsert(payload, {
          onConflict: "id",
        });
      }

      markSaved();
    },
    [projectId, activePageId, sessionId, measurements, markSaved]
  );

  useEffect(() => {
    if (!projectId || !activePageId) return;
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      persistMeasurements(measurements);
    }, 700);

    return () => {
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    };
  }, [measurements, persistMeasurements, projectId, activePageId]);

  const zoomBy = useCallback((delta: number) => {
    setFitMode("manual");
    setZoom((z) => Math.max(0.25, Math.min(6, Number((z + delta).toFixed(2)))));
  }, []);

  const getCanvasPoint = useCallback(
    (clientX: number, clientY: number): Point | null => {
      const el = canvasWrapRef.current;
      if (!el || !drawingWidth || !drawingHeight) return null;
      const rect = el.getBoundingClientRect();
      const x = (clientX - rect.left) / zoom;
      const y = (clientY - rect.top) / zoom;
      const clampedX = Math.max(0, Math.min(drawingWidth, x));
      const clampedY = Math.max(0, Math.min(drawingHeight, y));
      return { x: clampedX, y: clampedY };
    },
    [drawingWidth, drawingHeight, zoom]
  );

  const addMeasurement = useCallback(
    (type: LocalMeasurement["type"], points: Point[]) => {
      if (!points.length) return;

      let rawValue = 0;
      let scaledValue = 0;
      let unit = lineUnit;

      if (type === "line" && points.length >= 2) {
        rawValue = distance(points[0], points[1]);
        scaledValue = pxToUnitScale ? rawValue * pxToUnitScale : 0;
        unit = lineUnit;
      } else if (type === "area" && points.length >= 3) {
        rawValue = polygonArea(points);
        scaledValue = pxToUnitScale ? rawValue * pxToUnitScale * pxToUnitScale : 0;
        unit = areaUnit;
      } else if (type === "count") {
        rawValue = 1;
        scaledValue = 1;
        unit = "ct";
      }

      const next: LocalMeasurement = {
        id: uid(),
        type,
        label:
          type === "line"
            ? `Line ${measurements.filter((m) => m.type === "line").length + 1}`
            : type === "area"
            ? `Area ${measurements.filter((m) => m.type === "area").length + 1}`
            : `Count ${measurements.filter((m) => m.type === "count").length + 1}`,
        points,
        rawValue,
        scaledValue,
        unit,
        color: TOOL_COLORS[type],
        meta: {},
      };

      setMeasurements((prev) => [...prev, next]);
      setSelectedMeasurementId(next.id);
    },
    [areaUnit, lineUnit, measurements, pxToUnitScale]
  );

  const beginCalibrationWorkflow = useCallback(() => {
    setShowCalibration(true);
    setCalibrationPicking(true);
    setTool("calibrate");
    setDraftPoints([]);
    setDraftHoverPoint(null);
    setHoverCanvasPoint(null);
    setIsDrawing(false);
  }, []);

  const resetCalibrationDraftOnly = useCallback(() => {
    setCalibrationP1(null);
    setCalibrationP2(null);
    setCalibrationPicking(true);
    setTool("calibrate");
    setDraftPoints([]);
    setDraftHoverPoint(null);
  }, []);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!activePage || !drawingImageUrl) return;

      if (tool === "pan") {
        setFitMode("manual");
        setDragState({
          pointerId: e.pointerId,
          startClientX: e.clientX,
          startClientY: e.clientY,
          startPanX: pan.x,
          startPanY: pan.y,
        });
        return;
      }

      const point = getCanvasPoint(e.clientX, e.clientY);
      if (!point) return;

      if (tool === "calibrate" || calibrationPicking) {
        if (!calibrationP1 || (calibrationP1 && calibrationP2)) {
          setCalibrationP1(point);
          setCalibrationP2(null);
        } else {
          setCalibrationP2(point);
          setCalibrationPicking(false);
          setShowCalibration(true);
          setTool("pan");
        }
        return;
      }

      if (tool === "count") {
        addMeasurement("count", [point]);
        return;
      }

      if (tool === "line") {
        if (!isDrawing) {
          setDraftPoints([point]);
          setDraftHoverPoint(point);
          setIsDrawing(true);
        } else {
          const pts = [draftPoints[0], point];
          addMeasurement("line", pts);
          setDraftPoints([]);
          setDraftHoverPoint(null);
          setIsDrawing(false);
          setTool("pan");
        }
        return;
      }

      if (tool === "area") {
        if (!isDrawing) {
          setDraftPoints([point]);
          setDraftHoverPoint(point);
          setIsDrawing(true);
        } else {
          setDraftPoints((prev) => [...prev, point]);
        }
      }
    },
    [
      activePage,
      drawingImageUrl,
      tool,
      calibrationPicking,
      calibrationP1,
      calibrationP2,
      getCanvasPoint,
      pan.x,
      pan.y,
      addMeasurement,
      isDrawing,
      draftPoints,
      setFitMode,
    ]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const point = getCanvasPoint(e.clientX, e.clientY);
      setHoverCanvasPoint(point);

      if (dragState && dragState.pointerId === e.pointerId) {
        setPan({
          x: dragState.startPanX + (e.clientX - dragState.startClientX),
          y: dragState.startPanY + (e.clientY - dragState.startClientY),
        });
        return;
      }

      if (!point) return;

      if ((tool === "line" || tool === "area") && isDrawing) {
        setDraftHoverPoint(point);
      }
    },
    [dragState, getCanvasPoint, tool, isDrawing]
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (dragState && dragState.pointerId === e.pointerId) {
        setDragState(null);
      }
    },
    [dragState]
  );

  const handlePointerLeave = useCallback(() => {
    setHoverCanvasPoint(null);
    if (tool !== "line" && tool !== "area") {
      setDraftHoverPoint(null);
    }
  }, [tool]);

  const handleDoubleClick = useCallback(() => {
    if (tool === "area" && draftPoints.length >= 3) {
      addMeasurement("area", draftPoints);
      setDraftPoints([]);
      setDraftHoverPoint(null);
      setIsDrawing(false);
      setTool("pan");
    }
  }, [tool, draftPoints, addMeasurement]);

  const handleWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      setFitMode("manual");
      setZoom((prev) =>
        Math.max(0.25, Math.min(6, Number((prev + (e.deltaY > 0 ? -0.1 : 0.1)).toFixed(2))))
      );
    }
  }, []);

  const applyCalibration = useCallback(async () => {
    if (!activePage || !calibrationP1 || !calibrationP2) return;
    const realDistance = calibrationDistanceFromForm(calibrationForm);
    if (!realDistance) return;

    await persistPage(activePage.id, {
      calibration_scale: realDistance,
      calibration_distance: realDistance,
      calibration_unit: calibrationForm.unit,
      calibration_point_1: calibrationP1,
      calibration_point_2: calibrationP2,
      calibration_p1: calibrationP1,
      calibration_p2: calibrationP2,
    });

    setShowCalibration(false);
    setCalibrationPicking(false);
    setTool("pan");
  }, [activePage, calibrationP1, calibrationP2, calibrationForm, persistPage]);

  const resetCalibration = useCallback(async () => {
    if (!activePage) return;
    setCalibrationP1(null);
    setCalibrationP2(null);
    setCalibrationForm({
      feet: "1",
      inches: "",
      fraction: "0",
      unit: "ft",
    });
    await persistPage(activePage.id, {
      calibration_scale: null,
      calibration_distance: null,
      calibration_unit: null,
      calibration_point_1: null,
      calibration_point_2: null,
      calibration_p1: null,
      calibration_p2: null,
    });
  }, [activePage, persistPage]);

  const handleUploadFiles = useCallback(
    async (files: FileList | null) => {
      if (!files || !projectId || !sessionId) return;
      setPageBusy(true);

      try {
        const currentRows = [...pages].sort((a, b) => (a.page_number || 0) - (b.page_number || 0));
        const blankReusable =
          currentRows.length === 1 &&
          !hasRenderedPages &&
          currentRows[0]
            ? currentRows[0]
            : null;

        let nextPageNumber = blankReusable
          ? blankReusable.page_number || 1
          : currentRows.reduce((max, p) => Math.max(max, p.page_number || 0), 0) + 1;

        let firstUploadedActiveId = "";
        let reusedBlank = false;

        for (const file of Array.from(files)) {
          const isPdf =
            file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
          const asset = isPdf ? await renderPdfPages(file) : await renderImageFile(file);

          for (const page of asset.pages) {
            const commonPatch: Partial<TakeoffPageRow> = {
              page_label: page.label,
              width: page.width,
              height: page.height,
              page_data: {
                asset_kind: asset.kind,
                asset_name: asset.name,
                rendered_image_url: page.imageUrl,
                image_url: page.imageUrl,
                original_file_name: file.name,
                source_url: asset.sourceUrl || null,
                page_number: page.pageNumber,
                width: page.width,
                height: page.height,
              },
            };

            let record: TakeoffPageRow | null = null;

            if (blankReusable && !reusedBlank) {
              const { data, error } = await supabase
                .from("takeoff_pages")
                .update({
                  ...commonPatch,
                  updated_at: new Date().toISOString(),
                })
                .eq("id", blankReusable.id)
                .select("*");

              if (!error && data?.[0]) {
                record = data[0] as TakeoffPageRow;
                reusedBlank = true;
                nextPageNumber = (blankReusable.page_number || 1) + 1;
              }
            }

            if (!record) {
              record = await createPageRecord(projectId, sessionId, nextPageNumber, {
                ...commonPatch,
                page_number: nextPageNumber,
              });
              nextPageNumber += 1;
            }

            if (record && !firstUploadedActiveId) {
              firstUploadedActiveId = record.id;
            }
          }
        }

        await loadPages(projectId, sessionId);

        if (firstUploadedActiveId) {
          setActivePageId(firstUploadedActiveId);
          scheduleAutoFit("page");
        }
      } finally {
        setPageBusy(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    },
    [
      projectId,
      sessionId,
      pages,
      hasRenderedPages,
      loadPages,
      createPageRecord,
      scheduleAutoFit,
    ]
  );

  const addBlankPage = useCallback(async () => {
    if (!projectId || !sessionId) return;

    const nextPageNumber =
      pages.reduce((max, p) => Math.max(max, p.page_number || 0), 0) + 1;

    const record = await createPageRecord(projectId, sessionId, nextPageNumber, {
      page_label: `Page ${nextPageNumber}`,
      page_data: {},
    });

    await loadPages(projectId, sessionId);

    if (record) {
      setActivePageId(record.id);
      scheduleAutoFit("page");
    }
  }, [projectId, sessionId, pages, createPageRecord, loadPages, scheduleAutoFit]);

  const removeMeasurement = useCallback(
    (id: string) => {
      setMeasurements((prev) => prev.filter((m) => m.id !== id));
      if (selectedMeasurementId === id) setSelectedMeasurementId("");
    },
    [selectedMeasurementId]
  );

  const selectedMeasurement = useMemo(
    () => measurements.find((m) => m.id === selectedMeasurementId) || null,
    [measurements, selectedMeasurementId]
  );

  const viewerHint = useMemo(() => {
    if (tool === "pan") return "Drag to pan. Ctrl/Cmd + wheel to zoom.";
    if (tool === "calibrate" || calibrationPicking) {
      return calibrationP1
        ? "Pick the second calibration point."
        : "Pick the first calibration point.";
    }
    if (tool === "line") {
      return isDrawing
        ? "Move to preview. Click second point to finish."
        : "Click first point to start line.";
    }
    if (tool === "area") {
      return isDrawing
        ? "Move to preview. Click to add points. Double-click to finish."
        : "Click to start area polygon.";
    }
    if (tool === "count") return "Click anywhere to place a count point.";
    return "";
  }, [tool, calibrationPicking, calibrationP1, isDrawing]);

  const liveLinePreview = useMemo(() => {
    if (tool !== "line" || !isDrawing || draftPoints.length !== 1 || !draftHoverPoint) return null;
    const raw = distance(draftPoints[0], draftHoverPoint);
    const scaled = pxToUnitScale ? raw * pxToUnitScale : 0;
    return `${formatNumber(scaled)} ${lineUnit}`;
  }, [tool, isDrawing, draftPoints, draftHoverPoint, pxToUnitScale, lineUnit]);

  const liveAreaPreview = useMemo(() => {
    if (tool !== "area" || !isDrawing || draftPoints.length < 2 || !draftHoverPoint) return null;
    const previewPoints = [...draftPoints, draftHoverPoint];
    if (previewPoints.length < 3) return null;
    const raw = polygonArea(previewPoints);
    const scaled = pxToUnitScale ? raw * pxToUnitScale * pxToUnitScale : 0;
    return `${formatNumber(scaled)} ${areaUnit}`;
  }, [tool, isDrawing, draftPoints, draftHoverPoint, pxToUnitScale, areaUnit]);

  const livePreviewLabel = liveLinePreview || liveAreaPreview || "";

  if (!projectId) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100">
        <div className="mx-auto flex min-h-screen max-w-5xl items-center justify-center px-6 py-12">
          <div className="w-full max-w-2xl rounded-2xl border border-slate-800 bg-slate-900/80 p-8 shadow-2xl">
            <div className="mb-4 text-sm font-medium uppercase tracking-[0.18em] text-cyan-400">
              Magnus Takeoff
            </div>
            <h1 className="text-3xl font-semibold text-white">
              Open Takeoff from a project dashboard
            </h1>
            <p className="mt-3 text-sm leading-6 text-slate-400">
              This page is route-based. Open it from a project using:
              <span className="ml-2 rounded-md border border-slate-700 bg-slate-800 px-2 py-1 font-mono text-slate-200">
                /projects/:projectId/takeoff
              </span>
            </p>
            <div className="mt-6">
              <button
                type="button"
                onClick={() => navigate("/projects")}
                className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-4 py-2 text-sm font-medium text-cyan-300 hover:bg-cyan-500/20"
              >
                Go to Projects
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen overflow-hidden bg-slate-950 text-slate-100">
      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf,image/*"
        multiple
        className="hidden"
        onChange={(e) => handleUploadFiles(e.target.files)}
      />

      <div className="flex h-full flex-col">
        <header className="border-b border-slate-800 bg-slate-950/95 px-4 py-2.5 backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => navigate(`/projects/${projectId}`)}
                  className="rounded-lg border border-slate-800 bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-800"
                >
                  Back
                </button>
                <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-300">
                  Takeoff
                </div>
              </div>

              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <h1 className="truncate text-lg font-semibold text-white">
                  {projectName || "Project Takeoff"}
                </h1>
                <span className="rounded-md border border-slate-800 bg-slate-900 px-2 py-1 text-[11px] text-slate-400">
                  Project ID: {projectId}
                </span>
                {activePage && (
                  <span className="rounded-md border border-slate-800 bg-slate-900 px-2 py-1 text-[11px] text-slate-300">
                    {activePage.page_label || `Page ${activePage.page_number}`}
                  </span>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1 rounded-xl border border-slate-800 bg-slate-900 p-1">
                {(
                  [
                    ["pan", "Pan"],
                    ["calibrate", "Cal"],
                    ["line", "Line"],
                    ["area", "Area"],
                    ["count", "Count"],
                  ] as Array<[ToolMode, string]>
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => {
                      setTool(value);
                      if (value === "calibrate") {
                        beginCalibrationWorkflow();
                      } else {
                        setCalibrationPicking(false);
                        setDraftPoints([]);
                        setDraftHoverPoint(null);
                        setIsDrawing(false);
                      }
                    }}
                    className={cn(
                      "rounded-lg px-2.5 py-1.5 text-xs font-medium transition",
                      tool === value
                        ? "bg-cyan-500 text-slate-950"
                        : "text-slate-300 hover:bg-slate-800"
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-1 rounded-xl border border-slate-800 bg-slate-900 p-1">
                <button
                  type="button"
                  onClick={() => zoomBy(-0.1)}
                  className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-800"
                >
                  −
                </button>
                <button
                  type="button"
                  onClick={setHundredPercent}
                  className={cn(
                    "rounded-lg px-2.5 py-1.5 text-xs font-medium",
                    zoom === 1 ? "bg-slate-800 text-white" : "text-slate-200 hover:bg-slate-800"
                  )}
                >
                  100%
                </button>
                <button
                  type="button"
                  onClick={fitToWidth}
                  className={cn(
                    "rounded-lg px-2.5 py-1.5 text-xs font-medium",
                    fitMode === "width"
                      ? "bg-slate-800 text-white"
                      : "text-slate-300 hover:bg-slate-800"
                  )}
                >
                  Fit W
                </button>
                <button
                  type="button"
                  onClick={fitToPage}
                  className={cn(
                    "rounded-lg px-2.5 py-1.5 text-xs font-medium",
                    fitMode === "page"
                      ? "bg-slate-800 text-white"
                      : "text-slate-300 hover:bg-slate-800"
                  )}
                >
                  Fit P
                </button>
                <button
                  type="button"
                  onClick={() => zoomBy(0.1)}
                  className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-800"
                >
                  +
                </button>
              </div>

              <button
                type="button"
                onClick={() => setShowCalibration(true)}
                className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-xs font-medium text-emerald-300 hover:bg-emerald-500/15"
              >
                {pxToUnitScale
                  ? `Calibrated · 1px = ${formatNumber(pxToUnitScale, 4)} ${lineUnit}`
                  : "Calibration"}
              </button>

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-medium text-slate-200 hover:bg-slate-800"
              >
                Upload PDF / Image
              </button>

              <button
                type="button"
                onClick={addBlankPage}
                className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-medium text-slate-200 hover:bg-slate-800"
              >
                Add Page
              </button>

              <div className="rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-[11px] text-slate-400">
                {saving ? "Saving…" : saveStamp ? `Saved ${saveStamp}` : "Ready"}
              </div>
            </div>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-slate-400">
            <span>{viewerHint}</span>
            {pageBusy && <span className="text-cyan-300">Processing drawing…</span>}
            {calibrationDistance > 0 && (
              <span className="text-emerald-300">
                Scale: {formatNumber(calibrationDistance)} {calibrationUnit}
              </span>
            )}
            {livePreviewLabel && (
              <span className="text-cyan-300">Live: {livePreviewLabel}</span>
            )}
          </div>
        </header>

        <div className="grid min-h-0 flex-1 grid-cols-[270px_minmax(0,1fr)_330px]">
          <aside className="flex min-h-0 flex-col border-r border-slate-800 bg-slate-950/70">
            <div className="border-b border-slate-800 px-4 py-3">
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                Drawings
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              {loading ? (
                <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 text-sm text-slate-400">
                  Loading takeoff…
                </div>
              ) : pages.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-800 bg-slate-900/60 p-4 text-sm text-slate-400">
                  No pages yet. Upload a PDF or image to begin.
                </div>
              ) : (
                <div className="space-y-2.5">
                  {pages.map((page) => {
                    const pageData =
                      typeof page.page_data === "object" && page.page_data ? page.page_data : {};
                    const thumb = pageData.rendered_image_url || pageData.image_url || "";
                    const isActive = page.id === activePageId;

                    return (
                      <button
                        key={page.id}
                        type="button"
                        onClick={() => {
                          setActivePageId(page.id);
                          setSelectedMeasurementId("");
                          setDraftPoints([]);
                          setDraftHoverPoint(null);
                          setIsDrawing(false);
                          scheduleAutoFit("page");
                        }}
                        className={cn(
                          "w-full rounded-2xl border p-2 text-left transition",
                          isActive
                            ? "border-cyan-500/50 bg-cyan-500/10 shadow-[0_0_0_1px_rgba(34,211,238,0.08)]"
                            : "border-slate-800 bg-slate-900 hover:bg-slate-800/80"
                        )}
                      >
                        <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-950">
                          {thumb ? (
                            <div className="relative">
                              <img
                                src={thumb}
                                alt={page.page_label || `Page ${page.page_number}`}
                                className="h-28 w-full object-cover object-top"
                              />
                              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950/90 via-slate-950/35 to-transparent px-2 py-1.5">
                                <div className="text-[10px] uppercase tracking-[0.16em] text-slate-300">
                                  Drawing
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div className="flex h-28 items-center justify-center text-xs text-slate-500">
                              Blank Page
                            </div>
                          )}
                        </div>

                        <div className="mt-2 flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium text-slate-100">
                              {page.page_label || `Page ${page.page_number}`}
                            </div>
                            <div className="mt-0.5 text-[11px] text-slate-400">
                              Page #{page.page_number}
                            </div>
                          </div>
                          <div className="rounded-md border border-slate-800 bg-slate-950 px-1.5 py-1 text-[10px] text-slate-500">
                            {Number(page.width || 0)} × {Number(page.height || 0)}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </aside>

          <main className="relative min-w-0 bg-slate-950">
            <div
              ref={viewportRef}
              className="relative h-full w-full overflow-hidden bg-[radial-gradient(circle_at_center,rgba(30,41,59,0.35),rgba(2,6,23,0.98))]"
              onWheel={handleWheel}
            >
              {!activePage || !drawingImageUrl ? (
                <div className="flex h-full items-center justify-center p-6">
                  <div className="w-full max-w-xl rounded-2xl border border-dashed border-slate-800 bg-slate-900/60 p-8 text-center">
                    <div className="text-lg font-semibold text-white">No drawing loaded</div>
                    <p className="mt-2 text-sm text-slate-400">
                      Upload a PDF or image to start measuring. Pages will be created and saved to this project.
                    </p>
                    <div className="mt-5">
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-4 py-2 text-sm font-medium text-cyan-300 hover:bg-cyan-500/20"
                      >
                        Upload Drawing
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="absolute inset-0">
                  <div
                    ref={canvasWrapRef}
                    className={cn(
                      "absolute left-0 top-0 origin-top-left touch-none select-none",
                      tool === "pan"
                        ? "cursor-grab active:cursor-grabbing"
                        : tool === "calibrate" || calibrationPicking
                        ? "cursor-crosshair"
                        : tool === "line" || tool === "area" || tool === "count"
                        ? "cursor-crosshair"
                        : "cursor-default"
                    )}
                    style={{
                      width: drawingWidth || 1,
                      height: drawingHeight || 1,
                      transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                    }}
                    onPointerDown={handlePointerDown}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    onPointerCancel={handlePointerUp}
                    onPointerLeave={handlePointerLeave}
                    onDoubleClick={handleDoubleClick}
                  >
                    <img
                      src={drawingImageUrl}
                      alt={activePage.page_label || "Drawing"}
                      draggable={false}
                      className="pointer-events-none block select-none"
                      style={{
                        width: drawingWidth || "auto",
                        height: drawingHeight || "auto",
                        maxWidth: "none",
                      }}
                    />

                    <svg
                      className="absolute inset-0 h-full w-full"
                      viewBox={`0 0 ${drawingWidth || 1} ${drawingHeight || 1}`}
                    >
                      {measurements.map((m) => {
                        if (m.type === "count") {
                          const pt = m.points[0];
                          if (!pt) return null;
                          return (
                            <g
                              key={m.id}
                              onClick={() => setSelectedMeasurementId(m.id)}
                              style={{ cursor: "pointer" }}
                            >
                              <circle cx={pt.x} cy={pt.y} r={12} fill={m.color} fillOpacity={0.16} />
                              <circle
                                cx={pt.x}
                                cy={pt.y}
                                r={5}
                                fill={m.color}
                                stroke={selectedMeasurementId === m.id ? "#ffffff" : "transparent"}
                                strokeWidth={2}
                              />
                              <text
                                x={pt.x + 14}
                                y={pt.y - 10}
                                fontSize="16"
                                fill="#e2e8f0"
                              >
                                {m.label}
                              </text>
                            </g>
                          );
                        }

                        if (m.type === "line" && m.points.length >= 2) {
                          const [a, b] = m.points;
                          return (
                            <g
                              key={m.id}
                              onClick={() => setSelectedMeasurementId(m.id)}
                              style={{ cursor: "pointer" }}
                            >
                              <line
                                x1={a.x}
                                y1={a.y}
                                x2={b.x}
                                y2={b.y}
                                stroke={m.color}
                                strokeWidth={selectedMeasurementId === m.id ? 4 : 3}
                              />
                              <circle cx={a.x} cy={a.y} r={4} fill={m.color} />
                              <circle cx={b.x} cy={b.y} r={4} fill={m.color} />
                              <rect
                                x={(a.x + b.x) / 2 - 34}
                                y={(a.y + b.y) / 2 - 26}
                                width={68}
                                height={22}
                                rx={8}
                                fill="rgba(2,6,23,0.75)"
                              />
                              <text
                                x={(a.x + b.x) / 2}
                                y={(a.y + b.y) / 2 - 11}
                                textAnchor="middle"
                                fontSize="14"
                                fill="#e2e8f0"
                              >
                                {formatMeasurement(m)}
                              </text>
                            </g>
                          );
                        }

                        if (m.type === "area" && m.points.length >= 3) {
                          const pointsStr = m.points.map((p) => `${p.x},${p.y}`).join(" ");
                          const centroid = polygonCentroid(m.points);
                          return (
                            <g
                              key={m.id}
                              onClick={() => setSelectedMeasurementId(m.id)}
                              style={{ cursor: "pointer" }}
                            >
                              <polygon
                                points={pointsStr}
                                fill={m.color}
                                fillOpacity={0.18}
                                stroke={m.color}
                                strokeWidth={selectedMeasurementId === m.id ? 4 : 3}
                              />
                              <rect
                                x={centroid.x - 38}
                                y={centroid.y - 14}
                                width={76}
                                height={24}
                                rx={8}
                                fill="rgba(2,6,23,0.75)"
                              />
                              <text
                                x={centroid.x}
                                y={centroid.y + 2}
                                textAnchor="middle"
                                fontSize="14"
                                fill="#e2e8f0"
                              >
                                {formatMeasurement(m)}
                              </text>
                            </g>
                          );
                        }

                        return null;
                      })}

                      {tool === "line" && isDrawing && draftPoints.length === 1 && draftHoverPoint && (
                        <g>
                          <line
                            x1={draftPoints[0].x}
                            y1={draftPoints[0].y}
                            x2={draftHoverPoint.x}
                            y2={draftHoverPoint.y}
                            stroke="#ffffff"
                            strokeWidth={2}
                            strokeDasharray="6 6"
                          />
                          <circle cx={draftPoints[0].x} cy={draftPoints[0].y} r={5} fill="#ffffff" />
                          <circle cx={draftHoverPoint.x} cy={draftHoverPoint.y} r={4} fill="#ffffff" fillOpacity={0.75} />
                        </g>
                      )}

                      {tool === "area" && isDrawing && draftPoints.length >= 1 && (
                        <g>
                          <polyline
                            points={draftPoints.map((p) => `${p.x},${p.y}`).join(" ")}
                            fill="none"
                            stroke="#ffffff"
                            strokeWidth={2}
                            strokeDasharray="6 6"
                          />
                          {draftHoverPoint && (
                            <polyline
                              points={[...draftPoints, draftHoverPoint]
                                .map((p) => `${p.x},${p.y}`)
                                .join(" ")}
                              fill="none"
                              stroke="#ffffff"
                              strokeWidth={2}
                              strokeOpacity={0.8}
                            />
                          )}
                          {draftPoints.length >= 2 && draftHoverPoint && (
                            <polygon
                              points={[...draftPoints, draftHoverPoint]
                                .map((p) => `${p.x},${p.y}`)
                                .join(" ")}
                              fill="#ffffff"
                              fillOpacity={0.08}
                              stroke="none"
                            />
                          )}
                          {draftPoints.map((p, idx) => (
                            <circle key={idx} cx={p.x} cy={p.y} r={4} fill="#ffffff" />
                          ))}
                          {draftHoverPoint && (
                            <circle cx={draftHoverPoint.x} cy={draftHoverPoint.y} r={4} fill="#ffffff" fillOpacity={0.75} />
                          )}
                        </g>
                      )}

                      {calibrationP1 && (
                        <g>
                          <circle cx={calibrationP1.x} cy={calibrationP1.y} r={10} fill="#22c55e" fillOpacity={0.18} />
                          <circle cx={calibrationP1.x} cy={calibrationP1.y} r={5} fill="#22c55e" />
                        </g>
                      )}
                      {calibrationP2 && (
                        <g>
                          <circle cx={calibrationP2.x} cy={calibrationP2.y} r={10} fill="#22c55e" fillOpacity={0.18} />
                          <circle cx={calibrationP2.x} cy={calibrationP2.y} r={5} fill="#22c55e" />
                        </g>
                      )}
                      {calibrationP1 && calibrationP2 && (
                        <line
                          x1={calibrationP1.x}
                          y1={calibrationP1.y}
                          x2={calibrationP2.x}
                          y2={calibrationP2.y}
                          stroke="#22c55e"
                          strokeWidth={3}
                          strokeDasharray="8 6"
                        />
                      )}

                      {hoverCanvasPoint && (tool === "calibrate" || tool === "line" || tool === "area" || tool === "count") && (
                        <g opacity={0.65}>
                          <line
                            x1={hoverCanvasPoint.x}
                            y1={0}
                            x2={hoverCanvasPoint.x}
                            y2={drawingHeight || 1}
                            stroke="#e2e8f0"
                            strokeWidth={1}
                            strokeDasharray="5 5"
                          />
                          <line
                            x1={0}
                            y1={hoverCanvasPoint.y}
                            x2={drawingWidth || 1}
                            y2={hoverCanvasPoint.y}
                            stroke="#e2e8f0"
                            strokeWidth={1}
                            strokeDasharray="5 5"
                          />
                        </g>
                      )}
                    </svg>
                  </div>

                  <div className="pointer-events-none absolute left-4 top-4 rounded-xl border border-slate-800 bg-slate-900/90 px-3 py-2 text-xs text-slate-300 shadow-xl">
                    <div className="font-medium text-white">
                      {activePage.page_label || `Page ${activePage.page_number}`}
                    </div>
                    <div className="mt-1 text-slate-400">
                      Zoom {Math.round(zoom * 100)}% · {measurements.length} marks
                    </div>
                  </div>

                  <div className="pointer-events-none absolute right-4 top-4 rounded-xl border border-slate-800 bg-slate-900/90 px-3 py-2 text-xs text-slate-300 shadow-xl">
                    <div>Fit: {fitMode === "width" ? "Width" : fitMode === "page" ? "Page" : "Manual"}</div>
                    {hoverCanvasPoint && (
                      <div className="mt-1 text-slate-400">
                        X {Math.round(hoverCanvasPoint.x)} · Y {Math.round(hoverCanvasPoint.y)}
                      </div>
                    )}
                  </div>

                  <div className="pointer-events-none absolute bottom-4 left-4 rounded-xl border border-slate-800 bg-slate-900/90 px-3 py-2 text-xs text-slate-300 shadow-xl">
                    <div>Line: {formatNumber(totals.line)} {lineUnit}</div>
                    <div>Area: {formatNumber(totals.area)} {areaUnit}</div>
                    <div>Count: {formatNumber(totals.count, 0)}</div>
                  </div>
                </div>
              )}
            </div>
          </main>

          <aside className="flex min-h-0 flex-col border-l border-slate-800 bg-slate-950/70">
            <div className="border-b border-slate-800 p-2">
              <div className="grid grid-cols-5 gap-1 rounded-xl border border-slate-800 bg-slate-900 p-1">
                {(
                  [
                    ["drawings", "Drawings"],
                    ["measurements", "Measures"],
                    ["details", "Details"],
                    ["boq", "BOQ"],
                    ["settings", "Settings"],
                  ] as Array<[RightTab, string]>
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setRightTab(value)}
                    className={cn(
                      "rounded-lg px-2 py-2 text-[11px] font-medium transition",
                      rightTab === value
                        ? "bg-cyan-500 text-slate-950"
                        : "text-slate-300 hover:bg-slate-800"
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {rightTab === "drawings" && (
                <div className="space-y-4">
                  <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
                    <div className="text-sm font-semibold text-white">Page Setup</div>
                    <div className="mt-3 space-y-2 text-sm text-slate-300">
                      <div className="flex items-center justify-between">
                        <span>Pages</span>
                        <span>{pages.length}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>Session</span>
                        <span className="truncate pl-4 text-right text-slate-400">
                          {sessionId || "—"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>Canvas</span>
                        <span className="text-slate-400">
                          {drawingWidth || 0} × {drawingHeight || 0}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>Active Drawings</span>
                        <span className="text-slate-400">
                          {hasRenderedPages ? "Loaded" : "Blank only"}
                        </span>
                      </div>
                    </div>

                    <div className="mt-4 flex gap-2">
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-medium text-slate-100 hover:bg-slate-700"
                      >
                        Upload
                      </button>
                      <button
                        type="button"
                        onClick={addBlankPage}
                        className="rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-medium text-slate-100 hover:bg-slate-700"
                      >
                        Add Blank
                      </button>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
                    <div className="text-sm font-semibold text-white">Calibration</div>
                    <div className="mt-3 space-y-2 text-sm text-slate-300">
                      <div className="flex items-center justify-between">
                        <span>Status</span>
                        <span className={cn(pxToUnitScale ? "text-emerald-300" : "text-amber-300")}>
                          {pxToUnitScale ? "Ready" : "Not Set"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>Distance</span>
                        <span>
                          {calibrationDistance
                            ? `${formatNumber(calibrationDistance)} ${calibrationUnit}`
                            : "—"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>Scale</span>
                        <span>
                          {pxToUnitScale
                            ? `${formatNumber(pxToUnitScale, 5)} ${lineUnit}/px`
                            : "—"}
                        </span>
                      </div>
                    </div>

                    <div className="mt-4 flex gap-2">
                      <button
                        type="button"
                        onClick={beginCalibrationWorkflow}
                        className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-medium text-emerald-300 hover:bg-emerald-500/20"
                      >
                        Start / Restart
                      </button>
                      <button
                        type="button"
                        onClick={resetCalibration}
                        className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs font-medium text-rose-300 hover:bg-rose-500/20"
                      >
                        Reset
                      </button>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
                    <div className="text-sm font-semibold text-white">View</div>
                    <div className="mt-4 grid grid-cols-3 gap-2">
                      <button
                        type="button"
                        onClick={fitToWidth}
                        className="rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-medium text-slate-100 hover:bg-slate-700"
                      >
                        Fit Width
                      </button>
                      <button
                        type="button"
                        onClick={fitToPage}
                        className="rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-medium text-slate-100 hover:bg-slate-700"
                      >
                        Fit Page
                      </button>
                      <button
                        type="button"
                        onClick={setHundredPercent}
                        className="rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-medium text-slate-100 hover:bg-slate-700"
                      >
                        100%
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {rightTab === "measurements" && (
                <div className="space-y-4">
                  <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
                    <div className="text-sm font-semibold text-white">Totals</div>
                    <div className="mt-3 grid grid-cols-3 gap-2">
                      <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
                        <div className="text-[11px] uppercase tracking-wide text-slate-500">Line</div>
                        <div className="mt-1 text-sm font-semibold text-cyan-300">
                          {formatNumber(totals.line)} {lineUnit}
                        </div>
                      </div>
                      <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
                        <div className="text-[11px] uppercase tracking-wide text-slate-500">Area</div>
                        <div className="mt-1 text-sm font-semibold text-emerald-300">
                          {formatNumber(totals.area)} {areaUnit}
                        </div>
                      </div>
                      <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
                        <div className="text-[11px] uppercase tracking-wide text-slate-500">Count</div>
                        <div className="mt-1 text-sm font-semibold text-amber-300">
                          {formatNumber(totals.count, 0)}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-800 bg-slate-900">
                    <div className="border-b border-slate-800 px-4 py-3 text-sm font-semibold text-white">
                      Measurements
                    </div>
                    <div className="max-h-[55vh] overflow-y-auto">
                      {measurements.length === 0 ? (
                        <div className="p-4 text-sm text-slate-400">
                          No measurements yet.
                        </div>
                      ) : (
                        <div className="divide-y divide-slate-800">
                          {measurements.map((m) => (
                            <button
                              key={m.id}
                              type="button"
                              onClick={() => setSelectedMeasurementId(m.id)}
                              className={cn(
                                "w-full px-4 py-3 text-left transition hover:bg-slate-800/60",
                                selectedMeasurementId === m.id && "bg-slate-800/70"
                              )}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span
                                      className="inline-block h-2.5 w-2.5 rounded-full"
                                      style={{ backgroundColor: m.color }}
                                    />
                                    <div className="truncate text-sm font-medium text-slate-100">
                                      {m.label}
                                    </div>
                                  </div>
                                  <div className="mt-1 text-xs text-slate-400">
                                    {m.type.toUpperCase()} · {formatMeasurement(m)}
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    removeMeasurement(m.id);
                                  }}
                                  className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-[11px] text-slate-400 hover:bg-slate-800 hover:text-white"
                                >
                                  Delete
                                </button>
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {rightTab === "details" && (
                <div className="space-y-4">
                  <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
                    <div className="text-sm font-semibold text-white">Selected</div>
                    {!selectedMeasurement ? (
                      <div className="mt-3 text-sm text-slate-400">
                        Select a measurement to inspect its details.
                      </div>
                    ) : (
                      <div className="mt-3 space-y-3 text-sm">
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400">Label</span>
                          <span className="text-slate-100">{selectedMeasurement.label}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400">Type</span>
                          <span className="text-slate-100">{selectedMeasurement.type}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400">Value</span>
                          <span className="text-slate-100">{formatMeasurement(selectedMeasurement)}</span>
                        </div>
                        <div className="rounded-xl border border-slate-800 bg-slate-950 p-3 text-xs text-slate-400">
                          Points:{" "}
                          {selectedMeasurement.points
                            .map((p) => `(${Math.round(p.x)}, ${Math.round(p.y)})`)
                            .join(" · ")}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {rightTab === "boq" && (
                <div className="space-y-4">
                  <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
                    <div className="text-sm font-semibold text-white">BOQ Readiness</div>
                    <div className="mt-3 space-y-2 text-sm text-slate-400">
                      <p>
                        Measurements are being saved by project and page and are ready for downstream BOQ linking.
                      </p>
                      <p>
                        Next integration can map line, area, and count measurements to items, assemblies, and section quantities.
                      </p>
                    </div>
                    <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950 p-3 text-xs text-slate-500">
                      Project: {projectId}
                      <br />
                      Session: {sessionId || "—"}
                      <br />
                      Page: {activePage?.id || "—"}
                    </div>
                  </div>
                </div>
              )}

              {rightTab === "settings" && (
                <div className="space-y-4">
                  <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
                    <div className="text-sm font-semibold text-white">Viewer</div>
                    <div className="mt-4 space-y-3">
                      <label className="block">
                        <span className="mb-1 block text-xs font-medium text-slate-400">
                          Page Label
                        </span>
                        <input
                          value={activePage?.page_label || ""}
                          onChange={(e) => {
                            const next = e.target.value;
                            setPages((prev) =>
                              prev.map((p) =>
                                p.id === activePageId ? { ...p, page_label: next } : p
                              )
                            );
                          }}
                          onBlur={() => {
                            if (activePage) {
                              const current =
                                pages.find((p) => p.id === activePage.id)?.page_label || "";
                              persistPage(activePage.id, {
                                page_label: current,
                              });
                            }
                          }}
                          className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500"
                        />
                      </label>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </aside>
        </div>
      </div>

      {showCalibration && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl">
            <div className="border-b border-slate-800 px-5 py-4">
              <div className="text-lg font-semibold text-white">Calibration</div>
              <div className="mt-1 text-sm text-slate-400">
                Pick two points on the drawing, then enter the real-world distance.
              </div>
            </div>

            <div className="space-y-5 px-5 py-5">
              <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-medium text-white">Picked Points</div>
                  <div className="rounded-full border border-slate-800 bg-slate-900 px-2.5 py-1 text-[11px] text-slate-400">
                    {calibrationPicking
                      ? calibrationP1
                        ? "Waiting for point 2"
                        : "Waiting for point 1"
                      : calibrationP1 && calibrationP2
                      ? "Points selected"
                      : "Not started"}
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-xl border border-slate-800 bg-slate-900 p-3">
                    <div className="text-xs uppercase tracking-wide text-slate-500">Point 1</div>
                    <div className="mt-1 text-slate-200">
                      {calibrationP1
                        ? `${Math.round(calibrationP1.x)}, ${Math.round(calibrationP1.y)}`
                        : "Not selected"}
                    </div>
                  </div>
                  <div className="rounded-xl border border-slate-800 bg-slate-900 p-3">
                    <div className="text-xs uppercase tracking-wide text-slate-500">Point 2</div>
                    <div className="mt-1 text-slate-200">
                      {calibrationP2
                        ? `${Math.round(calibrationP2.x)}, ${Math.round(calibrationP2.y)}`
                        : "Not selected"}
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex gap-2">
                  <button
                    type="button"
                    onClick={beginCalibrationWorkflow}
                    className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-sm font-medium text-emerald-300 hover:bg-emerald-500/20"
                  >
                    Start / Restart
                  </button>

                  <button
                    type="button"
                    onClick={resetCalibrationDraftOnly}
                    className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-2 text-sm font-medium text-rose-300 hover:bg-rose-500/20"
                  >
                    Reset Draft
                  </button>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
                <div className="mb-3 text-sm font-medium text-white">Real Distance</div>

                <div className="mb-4 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setCalibrationForm((prev) => ({ ...prev, unit: "ft" }))}
                    className={cn(
                      "rounded-xl px-4 py-2 text-sm font-medium",
                      calibrationForm.unit === "ft"
                        ? "bg-cyan-500 text-slate-950"
                        : "border border-slate-700 bg-slate-900 text-slate-300"
                    )}
                  >
                    Feet / Inches
                  </button>
                  <button
                    type="button"
                    onClick={() => setCalibrationForm((prev) => ({ ...prev, unit: "m" }))}
                    className={cn(
                      "rounded-xl px-4 py-2 text-sm font-medium",
                      calibrationForm.unit === "m"
                        ? "bg-cyan-500 text-slate-950"
                        : "border border-slate-700 bg-slate-900 text-slate-300"
                    )}
                  >
                    Meters
                  </button>
                </div>

                {calibrationForm.unit === "ft" ? (
                  <div className="grid grid-cols-3 gap-3">
                    <label className="block">
                      <span className="mb-1 block text-xs font-medium text-slate-400">Feet</span>
                      <input
                        value={calibrationForm.feet}
                        onChange={(e) =>
                          setCalibrationForm((prev) => ({ ...prev, feet: e.target.value }))
                        }
                        className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500"
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-xs font-medium text-slate-400">Inches</span>
                      <input
                        value={calibrationForm.inches}
                        onChange={(e) =>
                          setCalibrationForm((prev) => ({ ...prev, inches: e.target.value }))
                        }
                        className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500"
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-xs font-medium text-slate-400">Fraction</span>
                      <input
                        value={calibrationForm.fraction}
                        onChange={(e) =>
                          setCalibrationForm((prev) => ({ ...prev, fraction: e.target.value }))
                        }
                        placeholder="0, 1/2, 3/8"
                        className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500"
                      />
                    </label>
                  </div>
                ) : (
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-slate-400">Meters</span>
                    <input
                      value={calibrationForm.feet}
                      onChange={(e) =>
                        setCalibrationForm((prev) => ({ ...prev, feet: e.target.value }))
                      }
                      className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500"
                    />
                  </label>
                )}

                <div className="mt-4 rounded-xl border border-slate-800 bg-slate-900 p-3 text-sm text-slate-300">
                  Distance to save:{" "}
                  <span className="font-semibold text-white">
                    {formatNumber(calibrationDistanceFromForm(calibrationForm), 4)}{" "}
                    {calibrationForm.unit}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-800 px-5 py-4">
              <button
                type="button"
                onClick={() => {
                  setShowCalibration(false);
                  setCalibrationPicking(false);
                  setTool("pan");
                }}
                className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-medium text-slate-300 hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={
                  !calibrationP1 ||
                  !calibrationP2 ||
                  calibrationDistanceFromForm(calibrationForm) <= 0
                }
                onClick={applyCalibration}
                className={cn(
                  "rounded-xl px-4 py-2 text-sm font-semibold",
                  !calibrationP1 ||
                    !calibrationP2 ||
                    calibrationDistanceFromForm(calibrationForm) <= 0
                    ? "cursor-not-allowed bg-slate-700 text-slate-400"
                    : "bg-cyan-500 text-slate-950 hover:bg-cyan-400"
                )}
              >
                Apply Calibration
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

