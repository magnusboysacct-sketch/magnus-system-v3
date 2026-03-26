import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useParams } from "react-router-dom";
import * as pdfjsLib from "pdfjs-dist";
import { supabase } from "../../supabase/client";

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "../../node_modules/pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

type ToolMode = "select" | "pan" | "line" | "area" | "count";
type PickerMode = "items" | "assemblies";

type Point = {
  x: number;
  y: number;
};

type DrawingAsset = {
  kind: "pdf" | "image" | null;
  name?: string;
  dataUrl?: string;
  mimeType?: string;
  pdfPageNumber?: number;
  pageCount?: number;
};

type PageRow = {
  id: string;
  project_id: string;
  drawing_id?: string | null;
  page_number: number;
  calibration_scale?: number | null;
  calibration_unit?: string | null;
  calibration_p1?: Point | null;
  calibration_p2?: Point | null;
  page_data?: any;
  created_at?: string | null;
  updated_at?: string | null;
  session_id?: string | null;
  page_label?: string | null;
  width?: number | null;
  height?: number | null;
  calibration_point_1?: Point | null;
  calibration_point_2?: Point | null;
  calibration_distance?: number | null;
};

type SessionRow = {
  id: string;
  project_id: string;
  name?: string | null;
  created_at?: string | null;
};

type MeasurementRow = {
  id: string;
  project_id?: string | null;
  session_id?: string | null;
  page_id?: string | null;
  page_number?: number | null;
  drawing_id?: string | null;
  group_id?: string | null;
  group_name?: string | null;
  item_id?: string | null;
  assembly_id?: string | null;
  name?: string | null;
  label?: string | null;
  measurement_type?: string | null;
  type?: string | null;
  unit?: string | null;
  quantity?: number | null;
  amount?: number | null;
  points?: Point[] | null;
  geometry?: any;
  color?: string | null;
  notes?: string | null;
  page_label?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  data?: any;
  measurement_data?: any;
};

type PickerCategory = {
  id: string;
  name: string;
  code?: string | null;
};

type PickerItem = {
  id: string;
  name: string;
  item_code?: string | null;
  assembly_code?: string | null;
  description?: string | null;
  category_id?: string | null;
  base_unit?: string | null;
  output_unit?: string | null;
  item_kind?: string | null;
  line_type?: string | null;
};

const TOOL_LABELS: Record<ToolMode, string> = {
  select: "Select",
  pan: "Pan",
  line: "Line",
  area: "Area",
  count: "Count",
};

const fmt = (n: number, d = 2) => {
  if (!Number.isFinite(n)) return "0";
  return Number(n).toFixed(d);
};

const distancePx = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y);

const polygonAreaPx = (pts: Point[]) => {
  if (pts.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < pts.length; i += 1) {
    const p1 = pts[i];
    const p2 = pts[(i + 1) % pts.length];
    sum += p1.x * p2.y - p2.x * p1.y;
  }
  return Math.abs(sum) / 2;
};

const centroidOfPoints = (pts: Point[]) => {
  if (!pts.length) return { x: 0, y: 0 };
  const x = pts.reduce((s, p) => s + p.x, 0) / pts.length;
  const y = pts.reduce((s, p) => s + p.y, 0) / pts.length;
  return { x, y };
};

const pointNearPoint = (a: Point, b: Point, tolerance = 8) =>
  Math.abs(a.x - b.x) <= tolerance && Math.abs(a.y - b.y) <= tolerance;

const getScaleFactor = (page: PageRow | null) => {
  const p1 =
    (page?.calibration_point_1 as Point | null) ||
    (page?.calibration_p1 as Point | null) ||
    null;
  const p2 =
    (page?.calibration_point_2 as Point | null) ||
    (page?.calibration_p2 as Point | null) ||
    null;
  const dist = Number(page?.calibration_distance || 0);
  if (!p1 || !p2 || !dist) return null;
  const px = distancePx(p1, p2);
  if (!px) return null;
  return dist / px;
};

const lineDisplayValue = (pts: Point[], page: PageRow | null) => {
  if (pts.length < 2) return 0;
  const scale = getScaleFactor(page);
  const px = distancePx(pts[0], pts[1]);
  return scale ? px * scale : px;
};

const areaDisplayValue = (pts: Point[], page: PageRow | null) => {
  if (pts.length < 3) return 0;
  const scale = getScaleFactor(page);
  const pxArea = polygonAreaPx(pts);
  return scale ? pxArea * scale * scale : pxArea;
};

const getMeasurementType = (m: MeasurementRow) =>
  (m.measurement_type || m.type || "").toLowerCase();

const getMeasurementPoints = (m: MeasurementRow): Point[] => {
  const raw = m.points || m.geometry?.points || m.measurement_data?.points || m.data?.points;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((p: any) => ({
      x: Number(p?.x || 0),
      y: Number(p?.y || 0),
    }))
    .filter((p: Point) => Number.isFinite(p.x) && Number.isFinite(p.y));
};

const getMeasurementQuantity = (m: MeasurementRow) => {
  const direct = Number(m.quantity ?? m.amount ?? 0);
  if (Number.isFinite(direct) && direct) return direct;
  const fromData = Number(m.measurement_data?.quantity ?? m.data?.quantity ?? 0);
  return Number.isFinite(fromData) ? fromData : 0;
};

const getMeasurementUnit = (m: MeasurementRow) =>
  m.unit ||
  m.measurement_data?.unit ||
  m.data?.unit ||
  "";

const makeGroupName = (count: number) => `Group ${count + 1}`;

const readFileAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.onload = () => resolve(String(reader.result || ""));
    reader.readAsDataURL(file);
  });

export default function TakeoffPage() {
  const { projectId } = useParams<{ projectId: string }>();

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const viewerWrapRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<HTMLDivElement | null>(null);
  const pageCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const [loading, setLoading] = useState(true);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [loadError, setLoadError] = useState<string>("");
  const [session, setSession] = useState<SessionRow | null>(null);
  const [pages, setPages] = useState<PageRow[]>([]);
  const [activePageId, setActivePageId] = useState<string>("");
  const [measurements, setMeasurements] = useState<MeasurementRow[]>([]);
  const [activeTool, setActiveTool] = useState<ToolMode>("select");
  const [selectedMeasurementId, setSelectedMeasurementId] = useState<string>("");
  const [selectedGroupId, setSelectedGroupId] = useState<string>("");
  const [draftPoints, setDraftPoints] = useState<Point[]>([]);
  const [hoverPoint, setHoverPoint] = useState<Point | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState<Point | null>(null);
  const [scrollStart, setScrollStart] = useState<Point | null>(null);

  const [zoom, setZoom] = useState(1);
  const [basePageSize, setBasePageSize] = useState({ width: 1200, height: 900 });

  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfThumbs, setPdfThumbs] = useState<Record<number, string>>({});

  const [showCalibrationModal, setShowCalibrationModal] = useState(false);
  const [isCalibrationPicking, setIsCalibrationPicking] = useState(false);
  const [calibrationPickStage, setCalibrationPickStage] = useState<1 | 2>(1);
  const [calibrationPoint1, setCalibrationPoint1] = useState<Point | null>(null);
  const [calibrationPoint2, setCalibrationPoint2] = useState<Point | null>(null);
  const [calibrationDistance, setCalibrationDistance] = useState<string>("");
  const [calibrationUnit, setCalibrationUnit] = useState<string>("ft");

  const [showPicker, setShowPicker] = useState(false);
  const [pickerMode, setPickerMode] = useState<PickerMode>("items");
  const [pickerCategories, setPickerCategories] = useState<PickerCategory[]>([]);
  const [pickerCategoryId, setPickerCategoryId] = useState<string>("");
  const [pickerRows, setPickerRows] = useState<PickerItem[]>([]);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [pickerSearch, setPickerSearch] = useState("");

  const activePage = useMemo(
    () => pages.find((p) => p.id === activePageId) || null,
    [pages, activePageId]
  );

  const activeAsset: DrawingAsset = useMemo(() => {
    const raw = activePage?.page_data?.asset || null;
    if (!raw) return { kind: null };
    return {
      kind: raw.kind || null,
      name: raw.name,
      dataUrl: raw.dataUrl,
      mimeType: raw.mimeType,
      pdfPageNumber: raw.pdfPageNumber,
      pageCount: raw.pageCount,
    };
  }, [activePage]);

  const pageMeasurements = useMemo(() => {
    if (!activePage) return [];
    return measurements.filter((m) => {
      const pid = m.page_id || m.data?.page_id || m.measurement_data?.page_id;
      if (pid && pid === activePage.id) return true;
      const pno = Number(m.page_number ?? m.data?.page_number ?? m.measurement_data?.page_number ?? 0);
      return pno === Number(activePage.page_number);
    });
  }, [measurements, activePage]);

  const groupedMeasurements = useMemo(() => {
    const groups = new Map<
      string,
      {
        id: string;
        name: string;
        rows: MeasurementRow[];
      }
    >();

    pageMeasurements.forEach((m) => {
      const gid =
        m.group_id ||
        m.measurement_data?.group_id ||
        m.data?.group_id ||
        "ungrouped";
      const gname =
        m.group_name ||
        m.measurement_data?.group_name ||
        m.data?.group_name ||
        (gid === "ungrouped" ? "Ungrouped" : gid);
      if (!groups.has(gid)) {
        groups.set(gid, { id: gid, name: gname, rows: [] });
      }
      groups.get(gid)!.rows.push(m);
    });

    return Array.from(groups.values());
  }, [pageMeasurements]);

  const liveDraftValue = useMemo(() => {
    if (!activePage) return "";
    if (activeTool === "line") {
      const pts = hoverPoint && draftPoints.length === 1 ? [...draftPoints, hoverPoint] : draftPoints;
      if (pts.length < 2) return "";
      const val = lineDisplayValue(pts, activePage);
      const unit = activePage.calibration_unit || "px";
      return `${fmt(val)} ${unit}`;
    }
    if (activeTool === "area") {
      const pts =
        hoverPoint && draftPoints.length >= 2 ? [...draftPoints, hoverPoint] : draftPoints;
      if (pts.length < 2) return "";
      if (pts.length < 3) {
        const seg = lineDisplayValue([pts[pts.length - 2], pts[pts.length - 1]], activePage);
        const unit = activePage.calibration_unit || "px";
        return `${fmt(seg)} ${unit}`;
      }
      const val = areaDisplayValue(pts, activePage);
      const unit = activePage.calibration_unit ? `${activePage.calibration_unit}²` : "px²";
      return `${fmt(val)} ${unit}`;
    }
    if (activeTool === "count") {
      return draftPoints.length ? `${draftPoints.length} pt` : "";
    }
    return "";
  }, [activeTool, draftPoints, hoverPoint, activePage]);

  const overlaySize = useMemo(() => {
    return {
      width: Number(activePage?.width || basePageSize.width || 1200),
      height: Number(activePage?.height || basePageSize.height || 900),
    };
  }, [activePage, basePageSize]);

  const getPointerPoint = useCallback((clientX: number, clientY: number): Point | null => {
    const viewer = viewerRef.current;
    if (!viewer) return null;
    const rect = viewer.getBoundingClientRect();
    const x = (clientX - rect.left) / zoom;
    const y = (clientY - rect.top) / zoom;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return { x, y };
  }, [zoom]);

  const persistPageUpdate = useCallback(async (pageId: string, patch: Partial<PageRow>) => {
    const { data, error } = await supabase
      .from("takeoff_pages")
      .update(patch as any)
      .eq("id", pageId)
      .select("*")
      .single();

    if (error) throw error;
    const updated = data as unknown as PageRow;
    setPages((prev) => prev.map((p) => (p.id === pageId ? updated : p)));
    return updated;
  }, []);

 const loadMeasurements = useCallback(async (currentSession: SessionRow, pageList: PageRow[]) => {
  if (!pageList.length || !projectId) {
    setMeasurements([]);
    return;
  }

  const activeIds = pageList.map((p) => p.id).filter(Boolean);

  const { data, error } = await supabase
    .from("takeoff_measurements")
    .select("*")
    .eq("project_id", projectId)
    .eq("session_id", currentSession.id)
    .in("page_id", activeIds)
    .order("created_at", { ascending: true })
    .limit(2000);

  if (error) {
    console.error("Failed to load takeoff_measurements", error);
    setMeasurements([]);
    return;
  }

  setMeasurements((data || []) as MeasurementRow[]);
}, [projectId]);

  const bootstrap = useCallback(async () => {
    if (!projectId) {
      setLoadError("Open Takeoff from a project.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setLoadError("");

    try {
      let sessionRow: SessionRow | null = null;

      const sessionRes = await supabase
        .from("takeoff_sessions")
        .select("*")
        .eq("project_id", projectId)
        .order("created_at", { ascending: true })
        .limit(1);

      if (sessionRes.error) throw sessionRes.error;

      const existingSessions = (sessionRes.data || []) as SessionRow[];

      if (existingSessions.length) {
        sessionRow = existingSessions[0];
      } else {
        const createRes = await supabase
          .from("takeoff_sessions")
          .insert({
            project_id: projectId,
            name: "Takeoff Session 1",
          } as any)
          .select("*")
          .single();

        if (createRes.error) throw createRes.error;
        sessionRow = createRes.data as SessionRow;
      }

      setSession(sessionRow);

      const pagesRes = await supabase
        .from("takeoff_pages")
        .select("*")
        .eq("project_id", projectId)
        .eq("session_id", sessionRow.id)
        .order("page_number", { ascending: true });

      if (pagesRes.error) throw pagesRes.error;

      let pageRows = (pagesRes.data || []) as PageRow[];

      if (!pageRows.length) {
        const createPage = await supabase
          .from("takeoff_pages")
          .insert({
            project_id: projectId,
            session_id: sessionRow.id,
            page_number: 1,
            page_label: "Page 1",
            width: 1200,
            height: 900,
            page_data: {},
          } as any)
          .select("*")
          .single();

        if (createPage.error) throw createPage.error;
        pageRows = [createPage.data as PageRow];
      }

      setPages(pageRows);
      setActivePageId((prev) => prev || pageRows[0]?.id || "");
      await loadMeasurements(sessionRow, pageRows);
    } catch (error: any) {
      console.error(error);
      setLoadError(error?.message || "Failed to load Takeoff page.");
    } finally {
      setLoading(false);
    }
  }, [projectId, loadMeasurements]);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  const renderImagePage = useCallback(
    async (dataUrl: string) => {
      const canvas = pageCanvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const img = new Image();
      img.onload = async () => {
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);

        setBasePageSize({ width: img.width, height: img.height });

        if (activePage) {
          const needsUpdate =
            Number(activePage.width || 0) !== img.width ||
            Number(activePage.height || 0) !== img.height;
          if (needsUpdate) {
            try {
              await persistPageUpdate(activePage.id, {
                width: img.width,
                height: img.height,
              });
            } catch (error) {
              console.error("Failed to sync image size", error);
            }
          }
        }
      };
      img.src = dataUrl;
    },
    [activePage, persistPageUpdate]
  );

  const renderPdfThumbnails = useCallback(async (doc: pdfjsLib.PDFDocumentProxy) => {
    const thumbs: Record<number, string> = {};
    const maxPages = doc.numPages;

    for (let i = 1; i <= maxPages; i += 1) {
      try {
        const page = await doc.getPage(i);
        const viewport = page.getViewport({ scale: 0.18 });
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        if (!ctx) continue;
        canvas.width = Math.max(1, Math.floor(viewport.width));
        canvas.height = Math.max(1, Math.floor(viewport.height));
        await page.render({
          canvasContext: ctx,
          viewport,
        }).promise;
        thumbs[i] = canvas.toDataURL("image/png");
      } catch (error) {
        console.error("Thumb render failed", error);
      }
    }

    setPdfThumbs(thumbs);
  }, []);

  const renderPdfPage = useCallback(
    async (dataUrl: string, pageNumber: number) => {
      setPdfLoading(true);
      try {
        const loadingTask = pdfjsLib.getDocument({
          data: Uint8Array.from(atob(dataUrl.split(",")[1] || ""), (c) => c.charCodeAt(0)),
          useWorkerFetch: false,
          isEvalSupported: false,
          useSystemFonts: true,
        });

        const doc = await loadingTask.promise;
        setPdfDoc(doc);

        const page = await doc.getPage(pageNumber);
        const viewport = page.getViewport({ scale: 1.4 });

        const canvas = pageCanvasRef.current;
        if (!canvas) {
          setPdfLoading(false);
          return;
        }

        const ctx = canvas.getContext("2d");
        if (!ctx) {
          setPdfLoading(false);
          return;
        }

        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        await page.render({
          canvasContext: ctx,
          viewport,
        }).promise;

        setBasePageSize({
          width: Math.floor(viewport.width),
          height: Math.floor(viewport.height),
        });

        if (activePage) {
          const needsUpdate =
            Number(activePage.width || 0) !== Math.floor(viewport.width) ||
            Number(activePage.height || 0) !== Math.floor(viewport.height);

          if (needsUpdate) {
            try {
              await persistPageUpdate(activePage.id, {
                width: Math.floor(viewport.width),
                height: Math.floor(viewport.height),
              });
            } catch (error) {
              console.error("Failed syncing PDF page size", error);
            }
          }
        }

        void renderPdfThumbnails(doc);
      } catch (error) {
        console.error("PDF render failed", error);
      } finally {
        setPdfLoading(false);
      }
    },
    [activePage, persistPageUpdate, renderPdfThumbnails]
  );

  useEffect(() => {
    if (!activePage || !activeAsset.kind || !activeAsset.dataUrl) {
      const canvas = pageCanvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (canvas && ctx) {
        canvas.width = overlaySize.width;
        canvas.height = overlaySize.height;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
      setPdfDoc(null);
      setPdfThumbs({});
      return;
    }

    if (activeAsset.kind === "image") {
      void renderImagePage(activeAsset.dataUrl);
      return;
    }

    if (activeAsset.kind === "pdf") {
      const pageNumber = Number(activeAsset.pdfPageNumber || activePage.page_number || 1);
      void renderPdfPage(activeAsset.dataUrl, pageNumber);
    }
  }, [activePage, activeAsset, renderImagePage, renderPdfPage, overlaySize]);

  const saveMeasurement = useCallback(
    async (
      type: "line" | "area" | "count",
      points: Point[],
      opts?: { itemId?: string; assemblyId?: string; groupId?: string; groupName?: string }
    ) => {
      if (!activePage || !session || !projectId) return;

      let quantity = 0;
      let unit = "";

      if (type === "line") {
        quantity = lineDisplayValue(points, activePage);
        unit = activePage.calibration_unit || "px";
      } else if (type === "area") {
        quantity = areaDisplayValue(points, activePage);
        unit = activePage.calibration_unit ? `${activePage.calibration_unit}²` : "px²";
      } else {
        quantity = points.length || 1;
        unit = "count";
      }

      const nextGroupId =
        opts?.groupId ||
        selectedGroupId ||
        crypto.randomUUID();

      const nextGroupName =
        opts?.groupName ||
        groupedMeasurements.find((g) => g.id === selectedGroupId)?.name ||
        makeGroupName(groupedMeasurements.length);

      setSaveState("saving");

      const payload: Record<string, any> = {
        project_id: projectId,
        session_id: session.id,
        page_id: activePage.id,
        page_number: activePage.page_number,
        drawing_id: activePage.drawing_id || null,
        group_id: nextGroupId,
        group_name: nextGroupName,
        item_id: opts?.itemId || null,
        assembly_id: opts?.assemblyId || null,
        measurement_type: type,
        type,
        unit,
        quantity,
        points,
        page_label: activePage.page_label || `Page ${activePage.page_number}`,
        measurement_data: {
          points,
          quantity,
          unit,
          group_id: nextGroupId,
          group_name: nextGroupName,
          item_id: opts?.itemId || null,
          assembly_id: opts?.assemblyId || null,
        },
      };

      try {
        const { data, error } = await supabase
          .from("takeoff_measurements")
          .insert(payload as any)
          .select("*")
          .single();

        if (error) throw error;

        const row = data as MeasurementRow;
        setMeasurements((prev) => [...prev, row]);
        setSelectedMeasurementId(row.id);
        setSelectedGroupId(nextGroupId);
        setSaveState("saved");
        setTimeout(() => setSaveState("idle"), 900);
      } catch (error) {
        console.error("Measurement save failed", error);
        setSaveState("error");
        setTimeout(() => setSaveState("idle"), 1500);
      } finally {
        setDraftPoints([]);
        setHoverPoint(null);
      }
    },
    [activePage, groupedMeasurements, projectId, selectedGroupId, session]
  );

  const finishAreaMeasurement = useCallback(async () => {
    if (activeTool !== "area" || draftPoints.length < 3) return;
    await saveMeasurement("area", draftPoints);
  }, [activeTool, draftPoints, saveMeasurement]);

  const cancelCurrentTool = useCallback(() => {
    setDraftPoints([]);
    setHoverPoint(null);
    setIsCalibrationPicking(false);
    setCalibrationPickStage(1);
    setActiveTool("select");
  }, []);

  const handleDeleteSelectedMeasurement = useCallback(async () => {
    if (!selectedMeasurementId) return;
    try {
      const { error } = await supabase
        .from("takeoff_measurements")
        .delete()
        .eq("id", selectedMeasurementId);

      if (error) throw error;

      setMeasurements((prev) => prev.filter((m) => m.id !== selectedMeasurementId));
      setSelectedMeasurementId("");
    } catch (error) {
      console.error("Delete measurement failed", error);
    }
  }, [selectedMeasurementId]);

  const handleDeleteSelectedGroup = useCallback(async () => {
    if (!selectedGroupId) return;
    const rows = pageMeasurements.filter(
      (m) =>
        (m.group_id || m.measurement_data?.group_id || m.data?.group_id || "") === selectedGroupId
    );
    if (!rows.length) return;

    try {
      const ids = rows.map((r) => r.id);
      const { error } = await supabase
        .from("takeoff_measurements")
        .delete()
        .in("id", ids);

      if (error) throw error;

      setMeasurements((prev) => prev.filter((m) => !ids.includes(m.id)));
      setSelectedGroupId("");
      if (rows.some((r) => r.id === selectedMeasurementId)) {
        setSelectedMeasurementId("");
      }
    } catch (error) {
      console.error("Delete group failed", error);
    }
  }, [pageMeasurements, selectedGroupId, selectedMeasurementId]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        if (isCalibrationPicking) {
          setIsCalibrationPicking(false);
          setCalibrationPickStage(1);
          setShowCalibrationModal(true);
          return;
        }
        if (draftPoints.length) {
          setDraftPoints([]);
          setHoverPoint(null);
          return;
        }
        cancelCurrentTool();
      }

      if (event.key === "Delete") {
        if (selectedMeasurementId) {
          event.preventDefault();
          void handleDeleteSelectedMeasurement();
          return;
        }
        if (selectedGroupId) {
          event.preventDefault();
          void handleDeleteSelectedGroup();
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    cancelCurrentTool,
    draftPoints.length,
    handleDeleteSelectedGroup,
    handleDeleteSelectedMeasurement,
    isCalibrationPicking,
    selectedGroupId,
    selectedMeasurementId,
  ]);

  const startCalibrationPicking = useCallback(() => {
    setShowCalibrationModal(false);
    setIsCalibrationPicking(true);
    setCalibrationPickStage(1);
    setCalibrationPoint1(null);
    setCalibrationPoint2(null);
  }, []);

  const saveCalibration = useCallback(async () => {
    if (!activePage || !calibrationPoint1 || !calibrationPoint2 || !calibrationDistance) return;

    const distance = Number(calibrationDistance || 0);
    if (!distance) return;

    try {
      await persistPageUpdate(activePage.id, {
        calibration_distance: distance,
        calibration_scale: distance,
        calibration_unit: calibrationUnit,
        calibration_point_1: calibrationPoint1,
        calibration_point_2: calibrationPoint2,
        calibration_p1: calibrationPoint1,
        calibration_p2: calibrationPoint2,
      });
      setShowCalibrationModal(false);
    } catch (error) {
      console.error("Calibration save failed", error);
    }
  }, [
    activePage,
    calibrationDistance,
    calibrationPoint1,
    calibrationPoint2,
    calibrationUnit,
    persistPageUpdate,
  ]);

  const handleViewerClick = useCallback(
    async (e: React.MouseEvent<HTMLDivElement>) => {
      const point = getPointerPoint(e.clientX, e.clientY);
      if (!point || !activePage) return;

      if (isCalibrationPicking) {
        if (calibrationPickStage === 1) {
          setCalibrationPoint1(point);
          setCalibrationPickStage(2);
          return;
        }
        setCalibrationPoint2(point);
        setIsCalibrationPicking(false);
        setCalibrationPickStage(1);
        setShowCalibrationModal(true);
        return;
      }

      if (activeTool === "select" || activeTool === "pan") return;

      if (activeTool === "count") {
        await saveMeasurement("count", [point]);
        return;
      }

      if (activeTool === "line") {
        const next = [...draftPoints, point];
        setDraftPoints(next);
        if (next.length === 2) {
          await saveMeasurement("line", next);
        }
        return;
      }

      if (activeTool === "area") {
        if (draftPoints.length >= 3 && pointNearPoint(point, draftPoints[0], 12)) {
          await saveMeasurement("area", draftPoints);
          return;
        }
        setDraftPoints((prev) => [...prev, point]);
      }
    },
    [
      activePage,
      activeTool,
      calibrationPickStage,
      draftPoints,
      getPointerPoint,
      isCalibrationPicking,
      saveMeasurement,
    ]
  );

  const handleViewerContextMenu = useCallback(
    async (e: React.MouseEvent<HTMLDivElement>) => {
      if (activeTool === "area" && draftPoints.length >= 3) {
        e.preventDefault();
        await finishAreaMeasurement();
      }
    },
    [activeTool, draftPoints.length, finishAreaMeasurement]
  );

  const handleViewerMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const point = getPointerPoint(e.clientX, e.clientY);
      if (point) setHoverPoint(point);

      if (activeTool !== "pan" || !isPanning || !panStart || !scrollStart || !viewerWrapRef.current) {
        return;
      }

      const dx = e.clientX - panStart.x;
      const dy = e.clientY - panStart.y;
      viewerWrapRef.current.scrollLeft = scrollStart.x - dx;
      viewerWrapRef.current.scrollTop = scrollStart.y - dy;
    },
    [activeTool, getPointerPoint, isPanning, panStart, scrollStart]
  );

  const handleViewerMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (activeTool !== "pan") return;
      setIsPanning(true);
      setPanStart({ x: e.clientX, y: e.clientY });
      setScrollStart({
        x: viewerWrapRef.current?.scrollLeft || 0,
        y: viewerWrapRef.current?.scrollTop || 0,
      });
    },
    [activeTool]
  );

  const handleViewerMouseUp = useCallback(() => {
    setIsPanning(false);
    setPanStart(null);
    setScrollStart(null);
  }, []);

  const openUpload = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const ensurePageRowsForPdf = useCallback(
    async (
      dataUrl: string,
      file: File,
      doc: pdfjsLib.PDFDocumentProxy,
      currentSession: SessionRow
    ) => {
      const existingPages = [...pages].sort((a, b) => a.page_number - b.page_number);
      const pageCount = doc.numPages;
      const nextRows: PageRow[] = [];

      for (let i = 1; i <= pageCount; i += 1) {
        const page = await doc.getPage(i);
        const viewport = page.getViewport({ scale: 1.4 });
        const existing = existingPages.find((p) => p.page_number === i);

        const pageData = {
          ...(existing?.page_data || {}),
          asset: {
            kind: "pdf",
            name: file.name,
            dataUrl,
            mimeType: file.type,
            pdfPageNumber: i,
            pageCount,
          },
        };

        if (existing) {
          const { data, error } = await supabase
            .from("takeoff_pages")
            .update({
              page_label: existing.page_label || `Page ${i}`,
              width: Math.floor(viewport.width),
              height: Math.floor(viewport.height),
              page_data: pageData,
            } as any)
            .eq("id", existing.id)
            .select("*")
            .single();

          if (error) throw error;
          nextRows.push(data as PageRow);
        } else {
          const { data, error } = await supabase
            .from("takeoff_pages")
            .insert({
              project_id: projectId,
              session_id: currentSession.id,
              page_number: i,
              page_label: `Page ${i}`,
              width: Math.floor(viewport.width),
              height: Math.floor(viewport.height),
              page_data: pageData,
            } as any)
            .select("*")
            .single();

          if (error) throw error;
          nextRows.push(data as PageRow);
        }
      }

      if (existingPages.length > pageCount) {
        const extraIds = existingPages
          .filter((p) => p.page_number > pageCount)
          .map((p) => p.id);

        if (extraIds.length) {
          const { error } = await supabase
            .from("takeoff_pages")
            .delete()
            .in("id", extraIds);

          if (error) throw error;
        }
      }

      nextRows.sort((a, b) => a.page_number - b.page_number);
      setPages(nextRows);
      setActivePageId(nextRows[0]?.id || "");
    },
    [pages, projectId]
  );

  const handleUploadFile = useCallback(
    async (file: File) => {
      if (!activePage || !session) return;

      try {
        setSaveState("saving");
        const dataUrl = await readFileAsDataUrl(file);

        if (file.type.includes("pdf")) {
          const loadingTask = pdfjsLib.getDocument({
            data: Uint8Array.from(atob(dataUrl.split(",")[1] || ""), (c) => c.charCodeAt(0)),
            useWorkerFetch: false,
            isEvalSupported: false,
            useSystemFonts: true,
          });
          const doc = await loadingTask.promise;
          await ensurePageRowsForPdf(dataUrl, file, doc, session);
          setPdfDoc(doc);
          void renderPdfThumbnails(doc);
        } else {
          const pageData = {
            ...(activePage.page_data || {}),
            asset: {
              kind: "image",
              name: file.name,
              dataUrl,
              mimeType: file.type,
            },
          };

          const updated = await persistPageUpdate(activePage.id, {
            page_data: pageData,
          });

          setPages((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
        }

        setSaveState("saved");
        setTimeout(() => setSaveState("idle"), 900);
      } catch (error) {
        console.error("Upload failed", error);
        setSaveState("error");
        setTimeout(() => setSaveState("idle"), 1500);
      }
    },
    [
      activePage,
      ensurePageRowsForPdf,
      persistPageUpdate,
      renderPdfThumbnails,
      session,
    ]
  );

  const handleFileInput = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file) return;
      await handleUploadFile(file);
    },
    [handleUploadFile]
  );

  const loadPickerData = useCallback(async () => {
    try {
      setPickerLoading(true);

      const catsRes = await supabase
        .from("master_categories")
        .select("id,name,code")
        .order("name", { ascending: true });

      if (!catsRes.error) {
        const cats = (catsRes.data || []) as PickerCategory[];
        setPickerCategories(cats);
        if (!pickerCategoryId && cats[0]) setPickerCategoryId(cats[0].id);
      }

      if (pickerMode === "items") {
        let q = supabase
          .from("items")
          .select("id,name,item_code,description,category_id,base_unit,item_kind,line_type")
          .order("name", { ascending: true });

        if (pickerCategoryId) q = q.eq("category_id", pickerCategoryId);
        if (pickerSearch.trim()) q = q.ilike("name", `%${pickerSearch.trim()}%`);

        const { data } = await q;
        setPickerRows((data || []) as PickerItem[]);
      } else {
        let q = supabase
          .from("assemblies")
          .select("id,name,assembly_code,description,category_id,output_unit")
          .order("name", { ascending: true });

        if (pickerCategoryId) q = q.eq("category_id", pickerCategoryId);
        if (pickerSearch.trim()) q = q.ilike("name", `%${pickerSearch.trim()}%`);

        const { data } = await q;
        setPickerRows((data || []) as PickerItem[]);
      }
    } catch (error) {
      console.error("Picker load failed", error);
    } finally {
      setPickerLoading(false);
    }
  }, [pickerCategoryId, pickerMode, pickerSearch]);

  useEffect(() => {
    if (!showPicker) return;
    void loadPickerData();
  }, [showPicker, loadPickerData]);

  const insertPickerMeasurement = useCallback(
    async (row: PickerItem) => {
      if (activeTool === "count" && hoverPoint) {
        await saveMeasurement("count", [hoverPoint], {
          itemId: pickerMode === "items" ? row.id : undefined,
          assemblyId: pickerMode === "assemblies" ? row.id : undefined,
        });
        setShowPicker(false);
        return;
      }

      if (activeTool === "line" && draftPoints.length === 2) {
        await saveMeasurement("line", draftPoints, {
          itemId: pickerMode === "items" ? row.id : undefined,
          assemblyId: pickerMode === "assemblies" ? row.id : undefined,
        });
        setShowPicker(false);
        return;
      }

      if (activeTool === "area" && draftPoints.length >= 3) {
        await saveMeasurement("area", draftPoints, {
          itemId: pickerMode === "items" ? row.id : undefined,
          assemblyId: pickerMode === "assemblies" ? row.id : undefined,
        });
        setShowPicker(false);
        return;
      }

      setShowPicker(false);
    },
    [activeTool, draftPoints, hoverPoint, pickerMode, saveMeasurement]
  );

  const selectedMeasurement = useMemo(
    () => pageMeasurements.find((m) => m.id === selectedMeasurementId) || null,
    [pageMeasurements, selectedMeasurementId]
  );

  const draftSvg = useMemo(() => {
    const pts =
      hoverPoint &&
      ((activeTool === "line" && draftPoints.length === 1) ||
        (activeTool === "area" && draftPoints.length >= 1))
        ? [...draftPoints, hoverPoint]
        : draftPoints;

    if (!pts.length) return null;

    if (activeTool === "line" && pts.length >= 2) {
      return (
        <line
          x1={pts[0].x}
          y1={pts[0].y}
          x2={pts[1].x}
          y2={pts[1].y}
          stroke="#38bdf8"
          strokeWidth={2}
          strokeDasharray="8 6"
        />
      );
    }

    if (activeTool === "area") {
      return (
        <>
          <polyline
            points={pts.map((p) => `${p.x},${p.y}`).join(" ")}
            fill={pts.length >= 3 ? "rgba(56,189,248,0.14)" : "none"}
            stroke="#38bdf8"
            strokeWidth={2}
            strokeDasharray="8 6"
          />
          {pts.map((p, idx) => (
            <circle
              key={`draft-${idx}`}
              cx={p.x}
              cy={p.y}
              r={4}
              fill={idx === 0 ? "#22c55e" : "#38bdf8"}
            />
          ))}
        </>
      );
    }

    return null;
  }, [activeTool, draftPoints, hoverPoint]);

  if (!projectId) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-950 text-slate-200">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-8 shadow-2xl">
          <div className="text-lg font-semibold">Open Takeoff from a project dashboard</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-slate-950 text-slate-100">
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,image/*"
        className="hidden"
        onChange={handleFileInput}
      />

      <div className="border-b border-slate-800 bg-slate-950/95 px-3 py-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="mr-2 rounded-lg border border-slate-800 bg-slate-900 px-3 py-1.5 text-sm font-semibold">
            Takeoff
          </div>

          <div className="flex flex-wrap items-center gap-1 rounded-xl border border-slate-800 bg-slate-900 p-1">
            {(["select", "pan", "line", "area", "count"] as ToolMode[]).map((tool) => (
              <button
                key={tool}
                type="button"
                onClick={() => {
                  setActiveTool(tool);
                  setDraftPoints([]);
                  setHoverPoint(null);
                }}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                  activeTool === tool
                    ? "bg-sky-500 text-white"
                    : "bg-slate-800 text-slate-200 hover:bg-slate-700"
                }`}
              >
                {TOOL_LABELS[tool]}
              </button>
            ))}
            <button
              type="button"
              onClick={cancelCurrentTool}
              className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-700"
            >
              Cancel Tool
            </button>
          </div>

          <div className="flex items-center gap-1 rounded-xl border border-slate-800 bg-slate-900 p-1">
            <button
              type="button"
              onClick={() => setZoom((z) => Math.max(0.25, Number((z - 0.1).toFixed(2))))}
              className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-medium hover:bg-slate-700"
            >
              -
            </button>
            <div className="min-w-[64px] text-center text-xs font-medium text-slate-300">
              {Math.round(zoom * 100)}%
            </div>
            <button
              type="button"
              onClick={() => setZoom((z) => Math.min(4, Number((z + 0.1).toFixed(2))))}
              className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-medium hover:bg-slate-700"
            >
              +
            </button>
            <button
              type="button"
              onClick={() => setZoom(1)}
              className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-medium hover:bg-slate-700"
            >
              1:1
            </button>
          </div>

          <div className="flex items-center gap-1 rounded-xl border border-slate-800 bg-slate-900 p-1">
            <button
              type="button"
              onClick={openUpload}
              className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-medium hover:bg-slate-700"
            >
              Upload
            </button>
            <button
              type="button"
              onClick={() => setShowCalibrationModal(true)}
              className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-medium hover:bg-slate-700"
            >
              Calibrate
            </button>
            <button
              type="button"
              onClick={() => setShowPicker(true)}
              className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-medium hover:bg-slate-700"
            >
              Item / Assembly
            </button>
          </div>

          <div className="ml-auto flex items-center gap-2 text-xs">
            {liveDraftValue ? (
              <div className="rounded-lg border border-sky-500/30 bg-sky-500/10 px-3 py-1.5 text-sky-200">
                LIVE: {liveDraftValue}
              </div>
            ) : null}

            <div
              className={`rounded-lg border px-3 py-1.5 ${
                saveState === "saving"
                  ? "border-amber-500/30 bg-amber-500/10 text-amber-200"
                  : saveState === "saved"
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                  : saveState === "error"
                  ? "border-red-500/30 bg-red-500/10 text-red-200"
                  : "border-slate-800 bg-slate-900 text-slate-300"
              }`}
            >
              {saveState === "saving"
                ? "Saving..."
                : saveState === "saved"
                ? "Saved"
                : saveState === "error"
                ? "Save Error"
                : "Ready"}
            </div>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1">
        <div className="grid h-full grid-cols-[220px_minmax(0,1fr)_320px] gap-0">
          <aside className="border-r border-slate-800 bg-slate-925/60 flex flex-col">
            <div className="border-b border-slate-800 px-3 py-2 text-sm font-semibold">
              Pages
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-2">
              {pages.map((p) => {
                const pageNo = Number(p.page_number || 1);
                const thumb = pdfThumbs[pageNo];
                const isActive = p.id === activePageId;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setActivePageId(p.id)}
                    className={`mb-2 w-full rounded-xl border p-2 text-left transition ${
                      isActive
                        ? "border-sky-500 bg-slate-800"
                        : "border-slate-800 bg-slate-900 hover:bg-slate-800"
                    }`}
                  >
                    <div className="mb-2 text-xs font-semibold text-slate-200">
                      {p.page_label || `Page ${pageNo}`}
                    </div>
                    <div className="overflow-hidden rounded-lg border border-slate-800 bg-slate-950">
                      {thumb ? (
                        <img
                          src={thumb}
                          alt={p.page_label || `Page ${pageNo}`}
                          className="block w-full"
                        />
                      ) : (
                        <div className="flex h-24 items-center justify-center text-[11px] text-slate-500">
                          {activeAsset.kind === "image" ? "Image" : "Preview"}
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </aside>

          <main className="relative min-w-0 bg-slate-950">
            {loading ? (
              <div className="flex h-full items-center justify-center text-slate-400">
                Loading takeoff...
              </div>
            ) : loadError ? (
              <div className="flex h-full items-center justify-center px-6 text-center text-red-300">
                {loadError}
              </div>
            ) : (
              <div
                ref={viewerWrapRef}
                className="h-full overflow-auto"
                onMouseUp={handleViewerMouseUp}
                onMouseLeave={handleViewerMouseUp}
              >
                <div className="flex min-h-full items-center justify-center p-6">
                  <div
                    ref={viewerRef}
                    className="relative origin-top-left"
                    style={{
                      width: overlaySize.width,
                      height: overlaySize.height,
                      transform: `scale(${zoom})`,
                      transformOrigin: "top left",
                      cursor:
                        activeTool === "pan"
                          ? isPanning
                            ? "grabbing"
                            : "grab"
                          : activeTool === "select"
                          ? "default"
                          : "crosshair",
                    }}
                    onClick={handleViewerClick}
                    onContextMenu={handleViewerContextMenu}
                    onMouseMove={handleViewerMouseMove}
                    onMouseDown={handleViewerMouseDown}
                  >
                    <canvas
                      ref={pageCanvasRef}
                      className="block rounded-xl border border-slate-800 bg-white shadow-2xl"
                      width={overlaySize.width}
                      height={overlaySize.height}
                    />

                    {!activeAsset.kind ? (
                      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                        <div className="pointer-events-auto w-[340px] rounded-2xl border border-slate-800 bg-slate-900/80 p-6 text-center shadow-2xl">
                          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-800 text-xl">
                            +
                          </div>
                          <div className="text-base font-semibold text-white">
                            No drawing loaded
                          </div>
                          <div className="mt-2 text-sm text-slate-400">
                            Upload a PDF or image to start measuring.
                          </div>
                          <button
                            type="button"
                            onClick={openUpload}
                            className="mt-4 rounded-xl bg-sky-500 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-400"
                          >
                            Upload Drawing
                          </button>
                        </div>
                      </div>
                    ) : null}

                    {pdfLoading ? (
                      <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-slate-950/15">
                        <div className="rounded-xl bg-slate-900/90 px-4 py-2 text-sm text-slate-100 shadow-lg">
                          Rendering PDF...
                        </div>
                      </div>
                    ) : null}

                    <svg
                      className="absolute inset-0 h-full w-full"
                      viewBox={`0 0 ${overlaySize.width} ${overlaySize.height}`}
                    >
                      {pageMeasurements.map((m) => {
                        const pts = getMeasurementPoints(m);
                        const type = getMeasurementType(m);
                        const selected = m.id === selectedMeasurementId;
                        const groupSelected =
                          (m.group_id || m.measurement_data?.group_id || m.data?.group_id || "") ===
                          selectedGroupId;
                        const stroke = selected
                          ? "#f59e0b"
                          : groupSelected
                          ? "#22c55e"
                          : "#38bdf8";

                        if (type === "line" && pts.length >= 2) {
                          const mid = centroidOfPoints(pts);
                          return (
                            <g
                              key={m.id}
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedMeasurementId(m.id);
                                setSelectedGroupId(
                                  m.group_id || m.measurement_data?.group_id || m.data?.group_id || ""
                                );
                              }}
                              className="cursor-pointer"
                            >
                              <line
                                x1={pts[0].x}
                                y1={pts[0].y}
                                x2={pts[1].x}
                                y2={pts[1].y}
                                stroke={stroke}
                                strokeWidth={selected ? 3.5 : 2.5}
                              />
                              <circle cx={pts[0].x} cy={pts[0].y} r={4} fill={stroke} />
                              <circle cx={pts[1].x} cy={pts[1].y} r={4} fill={stroke} />
                              <text
                                x={mid.x}
                                y={mid.y - 8}
                                textAnchor="middle"
                                className="fill-white text-[12px]"
                              >
                                {fmt(getMeasurementQuantity(m))} {getMeasurementUnit(m)}
                              </text>
                            </g>
                          );
                        }

                        if (type === "area" && pts.length >= 3) {
                          const center = centroidOfPoints(pts);
                          return (
                            <g
                              key={m.id}
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedMeasurementId(m.id);
                                setSelectedGroupId(
                                  m.group_id || m.measurement_data?.group_id || m.data?.group_id || ""
                                );
                              }}
                              className="cursor-pointer"
                            >
                              <polygon
                                points={pts.map((p) => `${p.x},${p.y}`).join(" ")}
                                fill={selected ? "rgba(245,158,11,0.18)" : "rgba(56,189,248,0.16)"}
                                stroke={stroke}
                                strokeWidth={selected ? 3.5 : 2.5}
                              />
                              {pts.map((p, idx) => (
                                <circle key={`${m.id}-${idx}`} cx={p.x} cy={p.y} r={4} fill={stroke} />
                              ))}
                              <text
                                x={center.x}
                                y={center.y}
                                textAnchor="middle"
                                className="fill-white text-[12px]"
                              >
                                {fmt(getMeasurementQuantity(m))} {getMeasurementUnit(m)}
                              </text>
                            </g>
                          );
                        }

                        if (type === "count" && pts.length >= 1) {
                          return (
                            <g
                              key={m.id}
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedMeasurementId(m.id);
                                setSelectedGroupId(
                                  m.group_id || m.measurement_data?.group_id || m.data?.group_id || ""
                                );
                              }}
                              className="cursor-pointer"
                            >
                              <circle
                                cx={pts[0].x}
                                cy={pts[0].y}
                                r={selected ? 8 : 6}
                                fill={stroke}
                              />
                              <text
                                x={pts[0].x + 10}
                                y={pts[0].y - 10}
                                className="fill-white text-[12px]"
                              >
                                1
                              </text>
                            </g>
                          );
                        }

                        return null;
                      })}

                      {draftSvg}

                      {isCalibrationPicking && calibrationPoint1 ? (
                        <g>
                          <circle cx={calibrationPoint1.x} cy={calibrationPoint1.y} r={6} fill="#f59e0b" />
                          {hoverPoint && calibrationPickStage === 2 ? (
                            <line
                              x1={calibrationPoint1.x}
                              y1={calibrationPoint1.y}
                              x2={hoverPoint.x}
                              y2={hoverPoint.y}
                              stroke="#f59e0b"
                              strokeWidth={2}
                              strokeDasharray="6 4"
                            />
                          ) : null}
                        </g>
                      ) : null}
                    </svg>
                  </div>
                </div>
              </div>
            )}
          </main>

          <aside className="border-l border-slate-800 bg-slate-925/60 flex flex-col">
            <div className="border-b border-slate-800 px-3 py-2 text-sm font-semibold">
              Measurements
            </div>

            <div className="border-b border-slate-800 p-3">
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={handleDeleteSelectedMeasurement}
                  disabled={!selectedMeasurementId}
                  className="rounded-xl bg-slate-800 px-3 py-2 text-xs font-medium text-slate-100 hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Delete Measurement
                </button>
                <button
                  type="button"
                  onClick={handleDeleteSelectedGroup}
                  disabled={!selectedGroupId}
                  className="rounded-xl bg-slate-800 px-3 py-2 text-xs font-medium text-slate-100 hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Delete Group
                </button>
              </div>

              {selectedMeasurement ? (
                <div className="mt-3 rounded-xl border border-slate-800 bg-slate-900 p-3 text-xs">
                  <div className="font-semibold text-slate-100">
                    {(selectedMeasurement.label ||
                      selectedMeasurement.name ||
                      getMeasurementType(selectedMeasurement) ||
                      "Measurement") as string}
                  </div>
                  <div className="mt-1 text-slate-400">
                    {fmt(getMeasurementQuantity(selectedMeasurement))}{" "}
                    {getMeasurementUnit(selectedMeasurement)}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              {groupedMeasurements.length ? (
                <div className="space-y-3">
                  {groupedMeasurements.map((group) => {
                    const groupActive = selectedGroupId === group.id;
                    return (
                      <div
                        key={group.id}
                        className={`rounded-2xl border ${
                          groupActive
                            ? "border-emerald-500/40 bg-emerald-500/5"
                            : "border-slate-800 bg-slate-900"
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => setSelectedGroupId(group.id)}
                          className="flex w-full items-center justify-between rounded-t-2xl px-3 py-2 text-left"
                        >
                          <div>
                            <div className="text-sm font-semibold text-slate-100">
                              {group.name}
                            </div>
                            <div className="text-[11px] text-slate-400">
                              {group.rows.length} item{group.rows.length === 1 ? "" : "s"}
                            </div>
                          </div>
                          <div className="text-xs text-slate-400">{group.id === "ungrouped" ? "" : ""}</div>
                        </button>

                        <div className="space-y-1 px-2 pb-2">
                          {group.rows.map((m) => {
                            const selected = selectedMeasurementId === m.id;
                            return (
                              <button
                                key={m.id}
                                type="button"
                                onClick={() => {
                                  setSelectedMeasurementId(m.id);
                                  setSelectedGroupId(group.id);
                                }}
                                className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-xs ${
                                  selected
                                    ? "bg-amber-500/15 text-amber-100"
                                    : "bg-slate-800 text-slate-200 hover:bg-slate-700"
                                }`}
                              >
                                <div className="truncate">
                                  <div className="font-medium">
                                    {m.label || m.name || getMeasurementType(m) || "Measurement"}
                                  </div>
                                  <div className="text-[11px] text-slate-400">
                                    {getMeasurementType(m).toUpperCase()}
                                  </div>
                                </div>
                                <div className="ml-3 whitespace-nowrap">
                                  {fmt(getMeasurementQuantity(m))} {getMeasurementUnit(m)}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4 text-sm text-slate-400">
                  No measurements on this page yet.
                </div>
              )}
            </div>
          </aside>
        </div>
      </div>

      {showCalibrationModal ? (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-slate-950/70 p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-5 shadow-2xl">
            <div className="mb-4 text-lg font-semibold text-white">Calibrate Page</div>

            <div className="space-y-3">
              <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3 text-sm text-slate-300">
                {calibrationPoint1 && calibrationPoint2
                  ? "Two points selected. Enter the real distance and save."
                  : "Click Start, pick point 1 and point 2 on the drawing, then this window will reopen automatically."}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3 text-xs text-slate-300">
                  P1:{" "}
                  {calibrationPoint1
                    ? `${fmt(calibrationPoint1.x, 0)}, ${fmt(calibrationPoint1.y, 0)}`
                    : "Not set"}
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3 text-xs text-slate-300">
                  P2:{" "}
                  {calibrationPoint2
                    ? `${fmt(calibrationPoint2.x, 0)}, ${fmt(calibrationPoint2.y, 0)}`
                    : "Not set"}
                </div>
              </div>

              <div className="grid grid-cols-[1fr_110px] gap-3">
                <input
                  value={calibrationDistance}
                  onChange={(e) => setCalibrationDistance(e.target.value)}
                  placeholder="Distance"
                  className="rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-sky-500"
                />
                <select
                  value={calibrationUnit}
                  onChange={(e) => setCalibrationUnit(e.target.value)}
                  className="rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-sky-500"
                >
                  <option value="ft">ft</option>
                  <option value="m">m</option>
                  <option value="in">in</option>
                  <option value="yd">yd</option>
                </select>
              </div>
            </div>

            <div className="mt-5 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowCalibrationModal(false);
                  setIsCalibrationPicking(false);
                }}
                className="rounded-xl bg-slate-800 px-4 py-2 text-sm font-medium text-slate-100 hover:bg-slate-700"
              >
                Close
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={startCalibrationPicking}
                  className="rounded-xl bg-slate-800 px-4 py-2 text-sm font-medium text-slate-100 hover:bg-slate-700"
                >
                  {calibrationPoint1 || calibrationPoint2 ? "Restart" : "Start"}
                </button>
                <button
                  type="button"
                  onClick={() => void saveCalibration()}
                  disabled={!calibrationPoint1 || !calibrationPoint2 || !calibrationDistance}
                  className="rounded-xl bg-sky-500 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Save Calibration
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {showPicker ? (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-slate-950/70 p-4">
          <div className="flex h-[80vh] w-full max-w-5xl overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl">
            <div className="flex w-64 flex-col border-r border-slate-800">
              <div className="border-b border-slate-800 p-3">
                <div className="mb-2 text-sm font-semibold text-white">Library</div>
                <div className="flex gap-1 rounded-xl border border-slate-800 bg-slate-950 p-1">
                  <button
                    type="button"
                    onClick={() => setPickerMode("items")}
                    className={`flex-1 rounded-lg px-3 py-2 text-xs font-medium ${
                      pickerMode === "items"
                        ? "bg-sky-500 text-white"
                        : "bg-slate-800 text-slate-200"
                    }`}
                  >
                    Items
                  </button>
                  <button
                    type="button"
                    onClick={() => setPickerMode("assemblies")}
                    className={`flex-1 rounded-lg px-3 py-2 text-xs font-medium ${
                      pickerMode === "assemblies"
                        ? "bg-sky-500 text-white"
                        : "bg-slate-800 text-slate-200"
                    }`}
                  >
                    Assemblies
                  </button>
                </div>
              </div>

              <div className="border-b border-slate-800 p-3">
                <input
                  value={pickerSearch}
                  onChange={(e) => setPickerSearch(e.target.value)}
                  placeholder="Search..."
                  className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-sky-500"
                />
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto p-2">
                {pickerCategories.map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setPickerCategoryId(cat.id)}
                    className={`mb-1 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm ${
                      pickerCategoryId === cat.id
                        ? "bg-slate-800 text-white"
                        : "text-slate-300 hover:bg-slate-800"
                    }`}
                  >
                    <span className="text-slate-500">▸</span>
                    <span className="truncate">{cat.name}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex min-w-0 flex-1 flex-col">
              <div className="flex items-center justify-between border-b border-slate-800 p-3">
                <div>
                  <div className="text-base font-semibold text-white">
                    {pickerMode === "items" ? "Items" : "Assemblies"}
                  </div>
                  <div className="text-xs text-slate-400">
                    Select from your folder-style library
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowPicker(false)}
                    className="rounded-xl bg-slate-800 px-4 py-2 text-sm font-medium text-slate-100 hover:bg-slate-700"
                  >
                    Close
                  </button>
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto p-3">
                {pickerLoading ? (
                  <div className="text-sm text-slate-400">Loading library...</div>
                ) : pickerRows.length ? (
                  <div className="space-y-2">
                    {pickerRows.map((row) => (
                      <button
                        key={row.id}
                        type="button"
                        onClick={() => void insertPickerMeasurement(row)}
                        className="flex w-full items-start justify-between rounded-2xl border border-slate-800 bg-slate-950 p-4 text-left hover:bg-slate-800"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-semibold text-white">
                            {row.name}
                          </div>
                          <div className="mt-1 text-xs text-slate-400">
                            {row.item_code || row.assembly_code || "No code"}
                          </div>
                          {row.description ? (
                            <div className="mt-2 line-clamp-2 text-xs text-slate-500">
                              {row.description}
                            </div>
                          ) : null}
                        </div>
                        <div className="ml-4 whitespace-nowrap rounded-lg bg-slate-800 px-3 py-1.5 text-xs text-slate-200">
                          {row.base_unit || row.output_unit || ""}
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4 text-sm text-slate-400">
                    No {pickerMode} found.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}