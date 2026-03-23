import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useParams } from "react-router-dom";
import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy } from "pdfjs-dist";
import workerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { supabase } from "../lib/supabase";
import { useProjectContext } from "../context/ProjectContext";
import { ExportToBOQModal } from "../components/ExportToBOQModal";

GlobalWorkerOptions.workerSrc = workerSrc;

type ToolMode = "select" | "hand" | "calibrate" | "line" | "area" | "count" | "volume";
type UnitSystem = "ft" | "m" | "in";
type SaveStatus = "idle" | "saving" | "saved" | "error";

type Point = {
  x: number;
  y: number;
};

type SessionRow = {
  id: string;
  project_id: string;
  company_id: string;
  name?: string | null;
  pdf_name?: string | null;
  pdf_storage_path?: string | null;
  pdf_bucket?: string | null;
  pdf_path?: string | null;
  pdf_url?: string | null;
  calibration?: any;
  created_at?: string | null;
  updated_at?: string | null;
};

type PageRow = {
  id?: string;
  session_id: string;
  page_number: number;
  page_label?: string | null;
  width?: number | null;
  height?: number | null;
  calibration_point_1?: Point | null;
  calibration_point_2?: Point | null;
  calibration_distance?: number | null;
  calibration_unit?: UnitSystem | null;
  calibration_scale?: number | null; // real units per PDF pixel
  updated_at?: string | null;
};

type GroupRow = {
  id: string;
  session_id: string;
  company_id: string;
  name: string;
  color: string;
  trade?: string | null;
  is_hidden?: boolean;
  sort_order: number;
  created_at?: string | null;
};

type MeasurementKind = "line" | "area" | "count" | "volume";

type MeasurementRow = {
  id: string;
  session_id: string;
  company_id: string;
  page_number: number;
  group_id: string | null;
  type: MeasurementKind;
  points: Point[];
  unit: string;
  result: number;
  raw_length?: number | null;
  raw_area?: number | null;
  raw_count?: number | null;
  raw_volume?: number | null;
  scale_x?: number | null;
  scale_y?: number | null;
  meta?: any;
  sort_order?: number;
  created_at?: string | null;
};

type CalibrationDraft = {
  p1: Point | null;
  p2: Point | null;
  distanceText: string;
  unit: UnitSystem;
};

const COLORS = [
  "#2563eb",
  "#16a34a",
  "#dc2626",
  "#9333ea",
  "#ea580c",
  "#0891b2",
  "#4f46e5",
  "#ca8a04",
];

const STORAGE_BUCKET_CANDIDATES = ["project-files"];
const SIGNED_URL_EXPIRY = 3600; // 1 hour in seconds

function uid() {
  return crypto.randomUUID();
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function distanceBetween(a: Point, b: Point) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function polylineLength(points: Point[]) {
  if (points.length < 2) return 0;
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    total += distanceBetween(points[i - 1], points[i]);
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

function formatNumber(value: number, digits = 2) {
  if (!Number.isFinite(value)) return "0";
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  });
}

function formatFeetInches(feet: number): string {
  if (!Number.isFinite(feet)) return "0'-0\"";

  const totalInches = feet * 12;
  const wholeFeet = Math.floor(feet);
  const remainingInches = totalInches - (wholeFeet * 12);

  if (remainingInches < 0.25) {
    return `${wholeFeet}'-0"`;
  }

  const roundedInches = Math.round(remainingInches * 2) / 2;

  if (roundedInches >= 12) {
    return `${wholeFeet + 1}'-0"`;
  }

  const wholeInches = Math.floor(roundedInches);
  const fraction = roundedInches - wholeInches;

  let inchString = "";
  if (fraction === 0) {
    inchString = `${wholeInches}"`;
  } else if (fraction === 0.5) {
    inchString = wholeInches > 0 ? `${wholeInches} 1/2"` : `1/2"`;
  } else {
    inchString = `${roundedInches}"`;
  }

  return `${wholeFeet}'-${inchString}`;
}

function toolToKind(tool: ToolMode): MeasurementKind | null {
  if (tool === "line") return "line";
  if (tool === "area") return "area";
  if (tool === "count") return "count";
  if (tool === "volume") return "volume";
  return null;
}

function getAreaUnit(base: UnitSystem) {
  if (base === "ft") return "ft²";
  if (base === "m") return "m²";
  return "in²";
}

function getVolumeUnit(base: UnitSystem) {
  if (base === "ft") return "ft³";
  if (base === "m") return "m³";
  return "in³";
}

function linePointsToSvg(points: Point[]) {
  return points.map((p) => `${p.x},${p.y}`).join(" ");
}

function polygonPointsToSvg(points: Point[]) {
  return points.map((p) => `${p.x},${p.y}`).join(" ");
}

function getMeasurementDisplayValue(measurement: MeasurementRow, isCalibrated: boolean) {
  if (!isCalibrated) {
    if (measurement.type === "line" && measurement.raw_length) {
      return measurement.raw_length;
    } else if (measurement.type === "area" && measurement.raw_area) {
      return measurement.raw_area;
    } else if (measurement.type === "count") {
      return 1;
    } else if (measurement.type === "volume" && measurement.raw_volume) {
      return measurement.raw_volume;
    }
    return 0;
  }
  return measurement.result ?? 0;
}

function getLineMidpoint(points: Point[]): Point | null {
  if (points.length < 2) return null;
  const mid = Math.floor(points.length / 2);
  if (points.length === 2) {
    return {
      x: (points[0].x + points[1].x) / 2,
      y: (points[0].y + points[1].y) / 2,
    };
  }
  return points[mid];
}

function getPolygonCentroid(points: Point[]): Point | null {
  if (points.length < 3) return null;
  let x = 0;
  let y = 0;
  for (const p of points) {
    x += p.x;
    y += p.y;
  }
  return {
    x: x / points.length,
    y: y / points.length,
  };
}

function getMeasurementBadge(measurement: MeasurementRow, isCalibrated: boolean) {
  const value = getMeasurementDisplayValue(measurement, isCalibrated);

  if (!isCalibrated && measurement.type !== "count") {
    return `${formatNumber(value)} px (uncalibrated)`;
  }

  const unit = measurement.unit ?? "";
  return `${formatNumber(value)} ${unit}`.trim();
}

function brightenColor(hex: string, percent: number = 30): string {
  const num = parseInt(hex.replace("#", ""), 16);
  const r = Math.min(255, ((num >> 16) & 255) + (255 - ((num >> 16) & 255)) * (percent / 100));
  const g = Math.min(255, ((num >> 8) & 255) + (255 - ((num >> 8) & 255)) * (percent / 100));
  const b = Math.min(255, (num & 255) + (255 - (num & 255)) * (percent / 100));
  return "#" + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
}

function calculateAngle(p1: Point, p2: Point): number {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  let angle = Math.atan2(dy, dx) * (180 / Math.PI);
  if (angle < 0) angle += 360;
  return angle;
}

function buildMeasurementFromDraft(args: {
  id?: string;
  sessionId: string;
  companyId: string;
  pageNumber: number;
  groupId: string | null;
  type: MeasurementKind;
  points: Point[];
  scale: number | null;
  baseUnit: UnitSystem;
  depth: number | null;
}): MeasurementRow {
  const { id, sessionId, companyId, pageNumber, groupId, type, points, scale, baseUnit, depth } = args;
  const lengthPx = polylineLength(points);
  const areaPx = polygonArea(points);
  const realLength = scale ? lengthPx * scale : 0;
  const realArea = scale ? areaPx * scale * scale : 0;
  const realVolume = scale ? realArea * (depth ?? 0) : 0;

  let result = 0;
  let unit: string = baseUnit;

  if (type === "line") {
    result = realLength;
    unit = baseUnit;
  } else if (type === "area") {
    result = realArea;
    unit = getAreaUnit(baseUnit);
  } else if (type === "count") {
    result = 1;
    unit = "ea";
  } else if (type === "volume") {
    result = realVolume;
    unit = getVolumeUnit(baseUnit);
  }

  return {
    id: id ?? uid(),
    session_id: sessionId,
    company_id: companyId,
    page_number: pageNumber,
    group_id: groupId,
    type,
    points,
    unit,
    result,
    raw_length: lengthPx,
    raw_area: areaPx,
    raw_count: type === "count" ? 1 : null,
    raw_volume: areaPx * (depth ?? 0),
    scale_x: scale,
    scale_y: scale,
    meta: { depth },
    sort_order: 0,
  };
}

function recalculateMeasurement(measurement: MeasurementRow, scale: number, baseUnit: UnitSystem): MeasurementRow {
  const lengthPx = measurement.raw_length ?? 0;
  const areaPx = measurement.raw_area ?? 0;
  const depth = measurement.meta?.depth ?? 0;

  const realLength = lengthPx * scale;
  const realArea = areaPx * scale * scale;
  const realVolume = areaPx * scale * scale * depth;

  let result = 0;
  let unit: string = baseUnit;

  if (measurement.type === "line") {
    result = realLength;
    unit = baseUnit;
  } else if (measurement.type === "area") {
    result = realArea;
    unit = getAreaUnit(baseUnit);
  } else if (measurement.type === "count") {
    result = 1;
    unit = "ea";
  } else if (measurement.type === "volume") {
    result = realVolume;
    unit = getVolumeUnit(baseUnit);
  }

  return {
    ...measurement,
    unit,
    result,
    scale_x: scale,
    scale_y: scale,
  };
}

async function tryRpc<T = any>(fn: string, params?: Record<string, any>): Promise<T | null> {
  const { data, error } = await supabase.rpc(fn, params ?? {});
  if (error) return null;
  return (data as T) ?? null;
}

async function getStorageUrl(bucket: string, path: string): Promise<string> {
  // For project-files bucket (private), use signed URL with long expiry
  if (bucket === 'project-files') {
    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUrl(path, SIGNED_URL_EXPIRY);

    if (error) {
      console.error('Failed to create signed URL:', error);
      throw new Error(`Failed to generate PDF URL: ${error.message}`);
    }

    if (!data?.signedUrl) {
      throw new Error('No signed URL returned from storage');
    }

    return data.signedUrl;
  }

  // For public buckets, use public URL
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);

  if (!data?.publicUrl) {
    throw new Error('No public URL returned from storage');
  }

  return data.publicUrl;
}

async function uploadPdfToStorage(file: File, projectId: string, sessionId: string) {
  // Remove extension from filename and sanitize
  const nameWithoutExt = file.name.replace(/\.pdf$/i, "").replace(/[^\w-]+/g, "_");
  const timestamp = Date.now();
  const fileName = `${timestamp}-${nameWithoutExt}.pdf`;
  const path = `${projectId}/${sessionId}/${fileName}`;

  for (const bucket of STORAGE_BUCKET_CANDIDATES) {
    const { error } = await supabase.storage.from(bucket).upload(path, file, {
      cacheControl: "3600",
      upsert: true,
      contentType: "application/pdf",
    });

    if (!error) {
      return {
        bucket,
        path,
      };
    }
  }

  return null;
}

export default function TakeoffPage() {
  const params = useParams();
  const projectContext = useProjectContext() as any;

  const activeProjectId: string | null =
    params.projectId ??
    projectContext?.currentProjectId ??
    projectContext?.selectedProjectId ??
    projectContext?.projectId ??
    projectContext?.activeProjectId ??
    null;

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayRef = useRef<SVGSVGElement | null>(null);
  const workspaceRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [loading, setLoading] = useState(true);
  const [loadingPdf, setLoadingPdf] = useState(false);
  const [errorText, setErrorText] = useState<string>("");
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [companyId, setCompanyId] = useState<string | null>(null);

  const [session, setSession] = useState<SessionRow | null>(null);
  const [pageRows, setPageRows] = useState<PageRow[]>([]);
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [measurements, setMeasurements] = useState<MeasurementRow[]>([]);

  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string>("");
  const [pdfName, setPdfName] = useState<string>("");
  const [pageCount, setPageCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [basePageSize, setBasePageSize] = useState({ width: 1, height: 1 });
  const [pageThumbnails, setPageThumbnails] = useState<Map<number, string>>(new Map());

  const [toolMode, setToolMode] = useState<ToolMode>("select");
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [selectedMeasurementId, setSelectedMeasurementId] = useState<string | null>(null);
  const [highlightedGroupId, setHighlightedGroupId] = useState<string | null>(null);

  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 24, y: 24 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [isSpacebarPressed, setIsSpacebarPressed] = useState(false);
  const [panMode, setPanMode] = useState<"none" | "middle" | "spacebar">("none");

  const [draftPoints, setDraftPoints] = useState<Point[]>([]);
  const [draftVolumeDepth, setDraftVolumeDepth] = useState<string>("1");
  const [measurementCounter, setMeasurementCounter] = useState(1);
  const [currentMousePoint, setCurrentMousePoint] = useState<Point | null>(null);
  const [cursorScreenPos, setCursorScreenPos] = useState<{ x: number; y: number } | null>(null);
  const [activeWorkspaceTab, setActiveWorkspaceTab] = useState<
  "drawings" | "measurements" | "extracted" | "boq" | "settings"
>("drawings");

  const [calibrationDraft, setCalibrationDraft] = useState<CalibrationDraft>({
    p1: null,
    p2: null,
    distanceText: "1",
    unit: "ft",
  });

  const [showExportModal, setShowExportModal] = useState(false);

  const [dragState, setDragState] = useState<{
    type: "measurement" | "calibration" | null;
    measurementId: string | null;
    pointIndex: number | null;
    calibrationPoint: "p1" | "p2" | null;
  }>({
    type: null,
    measurementId: null,
    pointIndex: null,
    calibrationPoint: null,
  });

  const deletedMeasurementIdsRef = useRef<string[]>([]);
  const deletedGroupIdsRef = useRef<string[]>([]);
  const saveTimeoutRef = useRef<number | null>(null);

  const safeGroups = useMemo(
    () =>
      [...groups]
        .filter(Boolean)
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
    [groups]
  );

  const currentPageRow = useMemo<PageRow | null>(() => {
    return pageRows.find((p) => p.page_number === currentPage) ?? null;
  }, [pageRows, currentPage]);

  const calibrationScale = currentPageRow?.calibration_scale ?? null;
  const calibrationUnit = (currentPageRow?.calibration_unit ?? "ft") as UnitSystem;

  const safeMeasurements = useMemo(
    () =>
      [...measurements]
        .filter(Boolean)
        .sort((a, b) => {
          const pageDiff = a.page_number - b.page_number;
          if (pageDiff !== 0) return pageDiff;
          const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
          const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
          return bTime - aTime;
        }),
    [measurements]
  );

  const pageMeasurements = useMemo(
    () => safeMeasurements.filter((m) => m.page_number === currentPage),
    [safeMeasurements, currentPage]
  );

  const selectedMeasurement = useMemo(
    () => safeMeasurements.find((m) => m.id === selectedMeasurementId) ?? null,
    [safeMeasurements, selectedMeasurementId]
  );

  const totalsByGroup = useMemo(() => {
    const map = new Map<
      string,
      {
        group: GroupRow | null;
        line: number;
        area: number;
        count: number;
        volume: number;
        lineUnit: string;
        areaUnit: string;
        countUnit: string;
        volumeUnit: string;
      }
    >();

    const ensure = (groupId: string | null) => {
      const key = groupId ?? "__ungrouped__";
      if (!map.has(key)) {
        map.set(key, {
          group: safeGroups.find((g) => g.id === groupId) ?? null,
          line: 0,
          area: 0,
          count: 0,
          volume: 0,
          lineUnit: calibrationUnit,
          areaUnit: getAreaUnit(calibrationUnit),
          countUnit: "ea",
          volumeUnit: getVolumeUnit(calibrationUnit),
        });
      }
      return map.get(key)!;
    };

    safeMeasurements.forEach((m) => {
      const row = ensure(m.group_id);
      if (m.type === "line") {
        row.line += m.result ?? 0;
        row.lineUnit = m.unit ?? row.lineUnit;
      }
      if (m.type === "area") {
        row.area += m.result ?? 0;
        row.areaUnit = m.unit ?? row.areaUnit;
      }
      if (m.type === "count") {
        row.count += m.result ?? 0;
        row.countUnit = m.unit ?? row.countUnit;
      }
      if (m.type === "volume") {
        row.volume += m.result ?? 0;
        row.volumeUnit = m.unit ?? row.volumeUnit;
      }
    });

    return Array.from(map.values());
  }, [safeMeasurements, safeGroups, calibrationUnit]);

  const groupSummariesForExport = useMemo(() => {
    return totalsByGroup
      .filter((t) => t.group !== null)
      .map((t) => ({
        groupId: t.group!.id,
        groupName: t.group!.name,
        color: t.group!.color,
        totalLength: t.line,
        totalArea: t.area,
        totalVolume: t.volume,
        totalCount: t.count,
        lengthUnit: t.lineUnit,
        areaUnit: t.areaUnit,
        volumeUnit: t.volumeUnit,
      }));
  }, [totalsByGroup]);

  const currentStageWidth = basePageSize.width * zoom;
  const currentStageHeight = basePageSize.height * zoom;

  const createDefaultGroup = useCallback((sessionId: string, companyId: string) => {
    const next: GroupRow = {
      id: uid(),
      session_id: sessionId,
      company_id: companyId,
      name: "General",
      color: COLORS[0],
      trade: null,
      is_hidden: false,
      sort_order: 1,
    };
    setGroups([next]);
    setSelectedGroupId(next.id);
  }, []);

  const loadSessionData = useCallback(
    async (projectId: string) => {
      setLoading(true);
      setErrorText("");

      try {
        // Fetch user's company_id first
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Not authenticated");

        const { data: profile, error: profileError } = await supabase
          .from("user_profiles")
          .select("company_id")
          .eq("id", user.id)
          .single();

        if (profileError) throw profileError;
        if (!profile?.company_id) throw new Error("User has no company");

        const userCompanyId = profile.company_id;
        setCompanyId(userCompanyId);

        let sessionRow: SessionRow | null = null;

        const rpcSession = await tryRpc<any>("get_or_create_takeoff_session", {
          p_project_id: projectId,
        });

        if (rpcSession) {
          sessionRow = Array.isArray(rpcSession) ? rpcSession[0] : rpcSession;
        }

        if (!sessionRow) {
          const { data: existing, error: existingError } = await supabase
            .from("takeoff_sessions")
            .select("*")
            .eq("project_id", projectId)
            .order("updated_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (existingError && existingError.code !== "PGRST116") throw existingError;

          if (existing) {
            sessionRow = existing as SessionRow;
          } else {
            const { data: inserted, error: insertError } = await supabase
              .from("takeoff_sessions")
              .insert({
                project_id: projectId,
                company_id: userCompanyId,
                pdf_name: "",
              })
              .select("*")
              .single();

            if (insertError) throw insertError;
            sessionRow = inserted as SessionRow;
          }
        }

        setSession(sessionRow);
     setCurrentPage(1);

        let groupData: GroupRow[] = [];
        let measurementData: MeasurementRow[] = [];

        const [groupsRes, measurementsRes] = await Promise.all([
          supabase
            .from("takeoff_groups")
            .select("*")
            .eq("session_id", sessionRow.id)
            .order("sort_order", { ascending: true }),
          supabase
            .from("takeoff_measurements")
            .select("*")
            .eq("session_id", sessionRow.id)
            .order("updated_at", { ascending: false }),
        ]);

        if (groupsRes.error) throw groupsRes.error;
        if (measurementsRes.error) throw measurementsRes.error;

        groupData = (groupsRes.data ?? []) as GroupRow[];
        measurementData = (measurementsRes.data ?? []) as MeasurementRow[];

        setPageRows([]);
        setGroups(groupData);
        setMeasurements(measurementData);

        if (groupData.length > 0) {
          setSelectedGroupId(groupData[0].id);
        } else {
          createDefaultGroup(sessionRow.id, sessionRow.company_id);
        }

        // Always generate fresh URL from bucket+path (never trust cached pdf_url)
        let resolvedPdfUrl = "";
        if (sessionRow.pdf_bucket && sessionRow.pdf_path) {
          resolvedPdfUrl = await getStorageUrl(sessionRow.pdf_bucket, sessionRow.pdf_path);
        }

        setPdfUrl(resolvedPdfUrl);
        setPdfName(sessionRow.pdf_name ?? "");
      } catch (error: any) {
        setErrorText(error?.message ?? "Failed to load takeoff session.");
      } finally {
        setLoading(false);
      }
    },
    [createDefaultGroup]
  );

  useEffect(() => {
    if (!activeProjectId) {
      setLoading(false);
      setErrorText("No active project selected.");
      return;
    }
    void loadSessionData(activeProjectId);
  }, [activeProjectId, loadSessionData]);

  useEffect(() => {
    if (!pdfUrl) {
      setPdfDoc(null);
      setPageCount(0);
      return;
    }

    let cancelled = false;

    const run = async () => {
      setLoadingPdf(true);
      setErrorText("");
      try {
        const pdf = await getDocument(pdfUrl).promise;
        if (cancelled) return;
        setPdfDoc(pdf);
        setPageCount(pdf.numPages);
        setCurrentPage((prev) => clamp(prev, 1, pdf.numPages));
      } catch (error: any) {
        if (!cancelled) {
          setErrorText(error?.message ?? "Failed to load PDF.");
          setPdfDoc(null);
          setPageCount(0);
        }
      } finally {
        if (!cancelled) setLoadingPdf(false);
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [pdfUrl]);

  useEffect(() => {
    if (!pdfDoc) {
      setPageThumbnails(new Map());
      return;
    }

    let cancelled = false;

    const generateThumbnails = async () => {
      const thumbnails = new Map<number, string>();

      for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
        if (cancelled) break;

        try {
          const page = await pdfDoc.getPage(pageNum);
          const viewport = page.getViewport({ scale: 0.2 });

          const canvas = document.createElement("canvas");
          const context = canvas.getContext("2d");
          if (!context) continue;

          canvas.width = viewport.width;
          canvas.height = viewport.height;

          await page.render({
            canvasContext: context,
            viewport: viewport,
            canvas: canvas,
          }).promise;

          const thumbnailDataUrl = canvas.toDataURL("image/png");
          thumbnails.set(pageNum, thumbnailDataUrl);

          if (!cancelled) {
            setPageThumbnails(new Map(thumbnails));
          }
        } catch (error) {
          console.error(`Failed to generate thumbnail for page ${pageNum}:`, error);
        }
      }
    };

    void generateThumbnails();

    return () => {
      cancelled = true;
    };
  }, [pdfDoc]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        return;
      }

      if ((event.key === "ArrowLeft" || event.key === "PageUp") && currentPage > 1) {
        event.preventDefault();
        setCurrentPage((prev) => Math.max(1, prev - 1));
      } else if ((event.key === "ArrowRight" || event.key === "PageDown") && currentPage < pageCount) {
        event.preventDefault();
        setCurrentPage((prev) => Math.min(pageCount, prev + 1));
      } else if (event.key === "Home") {
        event.preventDefault();
        setCurrentPage(1);
      } else if (event.key === "End") {
        event.preventDefault();
        setCurrentPage(pageCount);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentPage, pageCount]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        return;
      }
      if (event.code === "Space" && !isSpacebarPressed) {
        event.preventDefault();
        setIsSpacebarPressed(true);
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.code === "Space") {
        event.preventDefault();
        setIsSpacebarPressed(false);
        if (panMode === "spacebar") {
          setIsPanning(false);
          setPanMode("none");
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [isSpacebarPressed, panMode]);

  const renderCurrentPage = useCallback(async () => {
    if (!pdfDoc || !canvasRef.current) return;

    const page = await pdfDoc.getPage(currentPage);
    const dpr = window.devicePixelRatio || 1;
    const cssViewport = page.getViewport({ scale: 1 });
    const renderViewport = page.getViewport({ scale: zoom * dpr });

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = Math.floor(renderViewport.width);
    canvas.height = Math.floor(renderViewport.height);
    canvas.style.width = `${cssViewport.width * zoom}px`;
    canvas.style.height = `${cssViewport.height * zoom}px`;

    setBasePageSize({
      width: cssViewport.width,
      height: cssViewport.height,
    });

    await page.render({
      canvasContext: ctx,
      viewport: renderViewport,
      canvas: canvas,
    }).promise;

    setPageRows((prev) => {
      const existing = prev.find((p) => p.page_number === currentPage);
      if (existing) {
        return prev.map((p) =>
          p.page_number === currentPage
            ? {
                ...p,
                width: cssViewport.width,
                height: cssViewport.height,
              }
            : p
        );
      }

      if (!session) return prev;

      return [
        ...prev,
        {
          session_id: session.id,
          page_number: currentPage,
          width: cssViewport.width,
          height: cssViewport.height,
        },
      ].sort((a, b) => a.page_number - b.page_number);
    });
  }, [pdfDoc, currentPage, zoom, session]);

  useEffect(() => {
    void renderCurrentPage();
  }, [renderCurrentPage]);

  const performWorkspaceZoom = useCallback(
    (deltaY: number, clientX: number, clientY: number) => {
      const delta = -deltaY;
      const zoomFactor = delta > 0 ? 0.1 : -0.1;
      const newZoom = clamp(zoom + zoomFactor, 0.25, 4);

      if (newZoom === zoom) return;

      const workspace = workspaceRef.current;
      if (!workspace) {
        setZoom(newZoom);
        return;
      }

      const rect = workspace.getBoundingClientRect();
      const mouseX = clientX - rect.left;
      const mouseY = clientY - rect.top;

      const beforeZoomX = (mouseX - pan.x) / zoom;
      const beforeZoomY = (mouseY - pan.y) / zoom;

      const afterPanX = mouseX - beforeZoomX * newZoom;
      const afterPanY = mouseY - beforeZoomY * newZoom;

      setZoom(newZoom);
      setPan({ x: afterPanX, y: afterPanY });
    },
    [zoom, pan]
  );

  useEffect(() => {
    const workspace = workspaceRef.current;
    if (!workspace) return;

    const handleNativeWheel = (event: WheelEvent) => {
      if (!event.ctrlKey) return;

      event.preventDefault();
      event.stopPropagation();

      performWorkspaceZoom(event.deltaY, event.clientX, event.clientY);
    };

    workspace.addEventListener("wheel", handleNativeWheel, { passive: false });

    return () => {
      workspace.removeEventListener("wheel", handleNativeWheel);
    };
  }, [performWorkspaceZoom]);

  const queueAutosave = useCallback(() => {
    if (!session) return;
    if (saveTimeoutRef.current) {
      window.clearTimeout(saveTimeoutRef.current);
    }
    setSaveStatus("saving");

    saveTimeoutRef.current = window.setTimeout(async () => {
      try {
        const sessionPayload = {
          id: session.id,
          project_id: session.project_id,
          company_id: session.company_id,
          pdf_name: session.pdf_name ?? "",
          name: session.name ?? null,
          pdf_bucket: session.pdf_bucket ?? null,
          pdf_path: session.pdf_path ?? null,
          pdf_url: session.pdf_url ?? null,
          calibration: session.calibration ?? null,
          updated_at: new Date().toISOString(),
        };

        const groupPayload = groups.map((g, index) => ({
          id: g.id,
          session_id: session.id,
          company_id: g.company_id,
          name: g.name,
          color: g.color,
          trade: g.trade ?? null,
          is_hidden: g.is_hidden ?? false,
          sort_order: index + 1,
        }));

        const measurementPayload = measurements.map((m, index) => ({
          id: m.id,
          session_id: session.id,
          company_id: m.company_id,
          page_number: m.page_number,
          group_id: m.group_id,
          tool_type: m.type,
          type: m.type,
          points: m.points,
          unit: m.unit,
          result: m.result,
          raw_length: m.raw_length ?? null,
          raw_area: m.raw_area ?? null,
          raw_count: m.raw_count ?? null,
          raw_volume: m.raw_volume ?? null,
          scale_x: m.scale_x ?? null,
          scale_y: m.scale_y ?? null,
          meta: m.meta ?? null,
          sort_order: index,
        }));

        const [sessionRes, groupsRes, measurementsRes] = await Promise.all([
          supabase.from("takeoff_sessions").upsert(sessionPayload, { onConflict: "id" }),
          groupPayload.length
            ? supabase.from("takeoff_groups").upsert(groupPayload, { onConflict: "id" })
            : Promise.resolve({ error: null } as any),
          measurementPayload.length
            ? supabase.from("takeoff_measurements").upsert(measurementPayload, {
                onConflict: "id",
              })
            : Promise.resolve({ error: null } as any),
        ]);

        if (sessionRes.error) throw sessionRes.error;
        if (groupsRes.error) throw groupsRes.error;
        if (measurementsRes.error) throw measurementsRes.error;

        if (deletedMeasurementIdsRef.current.length) {
          const delRes = await supabase
            .from("takeoff_measurements")
            .delete()
            .in("id", deletedMeasurementIdsRef.current);
          if (delRes.error) throw delRes.error;
        }

        if (deletedGroupIdsRef.current.length) {
          const delRes = await supabase
            .from("takeoff_groups")
            .delete()
            .in("id", deletedGroupIdsRef.current);
          if (delRes.error) throw delRes.error;
        }

        deletedGroupIdsRef.current = [];
        deletedMeasurementIdsRef.current = [];
        setSaveStatus("saved");
      } catch (error: any) {
        setSaveStatus("error");
        setErrorText(error?.message ?? "Autosave failed.");
      }
    }, 700);
  }, [session, currentPage, groups, measurements, pdfName, pdfUrl]);

  useEffect(() => {
    if (!session) return;
    queueAutosave();
  }, [session, currentPage, groups, measurements, pdfName, pdfUrl, queueAutosave]);

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        window.clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  const addGroup = useCallback(() => {
    if (!session) return;
    const next: GroupRow = {
      id: uid(),
      session_id: session.id,
      company_id: session.company_id,
      name: `Group ${groups.length + 1}`,
      color: COLORS[groups.length % COLORS.length],
      trade: null,
      is_hidden: false,
      sort_order: groups.length + 1,
    };
    setGroups((prev) => [...prev, next]);
    setSelectedGroupId(next.id);
  }, [session, groups.length]);

  const updateGroupName = useCallback((groupId: string, name: string) => {
    setGroups((prev) =>
      prev.map((g) =>
        g.id === groupId
          ? {
              ...g,
              name,
              updated_at: new Date().toISOString(),
            }
          : g
      )
    );
  }, []);

  const deleteGroup = useCallback(
    (groupId: string) => {
      const hasMeasurements = measurements.some((m) => m.group_id === groupId);
      if (hasMeasurements) {
        setErrorText("Delete or reassign measurements in this group first.");
        return;
      }
      deletedGroupIdsRef.current.push(groupId);
      setGroups((prev) => prev.filter((g) => g.id !== groupId));
      if (selectedGroupId === groupId) {
        const next = safeGroups.find((g) => g.id !== groupId);
        setSelectedGroupId(next?.id ?? null);
      }
    },
    [measurements, selectedGroupId, safeGroups]
  );

  const removeMeasurement = useCallback(
    (measurementId: string) => {
      deletedMeasurementIdsRef.current.push(measurementId);
      setMeasurements((prev) => prev.filter((m) => m.id !== measurementId));
      if (selectedMeasurementId === measurementId) {
        setSelectedMeasurementId(null);
      }
    },
    [selectedMeasurementId]
  );

  const getPagePointFromEvent = useCallback((event: React.MouseEvent<SVGSVGElement>) => {
    const svg = overlayRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * basePageSize.width;
    const y = ((event.clientY - rect.top) / rect.height) * basePageSize.height;
    return { x, y };
  }, [basePageSize.width, basePageSize.height]);

  const commitCalibration = useCallback(() => {
    const p1 = calibrationDraft.p1;
    const p2 = calibrationDraft.p2;
    const distance = Number(calibrationDraft.distanceText);

    if (!p1 || !p2 || !Number.isFinite(distance) || distance <= 0) {
      setErrorText("Calibration requires two points and a valid distance.");
      return;
    }

    const pxDistance = distanceBetween(p1, p2);
    if (pxDistance <= 0) {
      setErrorText("Calibration points are invalid.");
      return;
    }

    const scale = distance / pxDistance;

    setPageRows((prev) => {
      const found = prev.find((p) => p.page_number === currentPage);
      if (found) {
        return prev.map((p) =>
          p.page_number === currentPage
            ? {
                ...p,
                session_id: session?.id ?? p.session_id,
                calibration_point_1: p1,
                calibration_point_2: p2,
                calibration_distance: distance,
                calibration_unit: calibrationDraft.unit,
                calibration_scale: scale,
                updated_at: new Date().toISOString(),
              }
            : p
        );
      }

      if (!session) return prev;

      return [
        ...prev,
        {
          session_id: session.id,
          page_number: currentPage,
          width: basePageSize.width,
          height: basePageSize.height,
          calibration_point_1: p1,
          calibration_point_2: p2,
          calibration_distance: distance,
          calibration_unit: calibrationDraft.unit,
          calibration_scale: scale,
          updated_at: new Date().toISOString(),
        },
      ];
    });

    setMeasurements((prev) =>
      prev.map((m) => {
        if (m.page_number !== currentPage) return m;
        return recalculateMeasurement(m, scale, calibrationDraft.unit);
      })
    );

    setToolMode("select");
    setDraftPoints([]);
  }, [calibrationDraft, currentPage, basePageSize, session]);

  const finishDraftMeasurement = useCallback(
    (kind: MeasurementKind, points: Point[]) => {
      if (!session) return;
      if (!selectedGroupId && safeGroups.length > 0) {
        setSelectedGroupId(safeGroups[0].id);
      }

      const nextName = `${kind[0].toUpperCase()}${kind.slice(1)} ${measurementCounter}`;
      const depth =
        kind === "volume" ? Math.max(Number(draftVolumeDepth) || 0, 0) : null;

      const next = buildMeasurementFromDraft({
        sessionId: session.id,
        companyId: session.company_id,
        pageNumber: currentPage,
        groupId: selectedGroupId ?? safeGroups[0]?.id ?? null,
        type: kind,
        points,
        scale: calibrationScale,
        baseUnit: calibrationUnit,
        depth,
      });

      setMeasurements((prev) => [next, ...prev]);
      setSelectedMeasurementId(next.id);
      setMeasurementCounter((prev) => prev + 1);
      setDraftPoints([]);
      setToolMode("select");
    },
    [
      session,
      currentPage,
      selectedGroupId,
      safeGroups,
      measurementCounter,
      draftVolumeDepth,
      calibrationScale,
      calibrationUnit,
    ]
  );

  const handleOverlayClick = useCallback(
    (event: React.MouseEvent<SVGSVGElement>) => {
      if (!pdfDoc) return;
      if (isSpacebarPressed || isPanning) return;

      const point = getPagePointFromEvent(event);
      if (!point) return;

      setErrorText("");

      if (toolMode === "calibrate") {
        setCalibrationDraft((prev) => {
          if (!prev.p1) return { ...prev, p1: point };
          if (!prev.p2) return { ...prev, p2: point };
          return { ...prev, p1: point, p2: null };
        });
        return;
      }

      if (toolMode === "count") {
        finishDraftMeasurement("count", [point]);
        return;
      }

      if (toolMode === "line") {
        setDraftPoints((prev) => {
          const next = [...prev, point];
          if (next.length >= 2) {
            finishDraftMeasurement("line", next);
            return [];
          }
          return next;
        });
        return;
      }

      if (toolMode === "area" || toolMode === "volume") {
        setDraftPoints((prev) => [...prev, point]);
      }
    },
    [pdfDoc, getPagePointFromEvent, toolMode, finishDraftMeasurement, isSpacebarPressed, isPanning]
  );

  const handleOverlayDoubleClick = useCallback(() => {
    if (toolMode === "area" && draftPoints.length >= 3) {
      finishDraftMeasurement("area", draftPoints);
      return;
    }
    if (toolMode === "volume" && draftPoints.length >= 3) {
      finishDraftMeasurement("volume", draftPoints);
    }
  }, [toolMode, draftPoints, finishDraftMeasurement]);

  const handleOverlayMouseMove = useCallback(
    (event: React.MouseEvent<SVGSVGElement>) => {
      if (!pdfDoc) return;
      const point = getPagePointFromEvent(event);
      if (!point) return;
      setCurrentMousePoint(point);
      setCursorScreenPos({ x: event.clientX, y: event.clientY });
    },
    [pdfDoc, getPagePointFromEvent]
  );

  const handleOverlayMouseLeave = useCallback(() => {
    setCurrentMousePoint(null);
    setCursorScreenPos(null);
  }, []);

  const handleWorkspaceMouseDown = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      const isMiddleMouse = event.button === 1;
      const isLeftMouse = event.button === 0;
      const shouldPan =
        toolMode === "hand" ||
        isMiddleMouse ||
        (isLeftMouse && isSpacebarPressed);

      if (!shouldPan) return;

      if (isMiddleMouse || (isLeftMouse && isSpacebarPressed)) {
        event.preventDefault();
      }

      setIsPanning(true);
      setPanMode(isMiddleMouse ? "middle" : isSpacebarPressed ? "spacebar" : "none");
      setPanStart({
        x: event.clientX - pan.x,
        y: event.clientY - pan.y,
      });
    },
    [toolMode, pan.x, pan.y, isSpacebarPressed]
  );

  const handleWorkspaceMouseMove = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (!isPanning) return;

      const shouldPan =
        toolMode === "hand" ||
        panMode === "middle" ||
        panMode === "spacebar";

      if (!shouldPan) return;

      event.preventDefault();
      setPan({
        x: event.clientX - panStart.x,
        y: event.clientY - panStart.y,
      });
    },
    [isPanning, toolMode, panStart.x, panStart.y, panMode]
  );

  const handleWorkspaceMouseUp = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    const isMiddleMouse = event.button === 1;

    if (isPanning && (panMode === "middle" || isMiddleMouse)) {
      event.preventDefault();
    }

    setIsPanning(false);
    if (panMode !== "spacebar") {
      setPanMode("none");
    }
  }, [isPanning, panMode]);

  const handleHandleMouseDown = useCallback(
    (
      event: React.MouseEvent,
      type: "measurement" | "calibration",
      measurementId: string | null,
      pointIndex: number | null,
      calibrationPoint: "p1" | "p2" | null
    ) => {
      event.stopPropagation();
      setDragState({ type, measurementId, pointIndex, calibrationPoint });
    },
    []
  );

  const handleOverlayMouseMoveWithDrag = useCallback(
    (event: React.MouseEvent<SVGSVGElement>) => {
      if (!pdfDoc) return;
      const point = getPagePointFromEvent(event);
      if (!point) return;

      setCurrentMousePoint(point);
      setCursorScreenPos({ x: event.clientX, y: event.clientY });

      if (dragState.type === "measurement" && dragState.measurementId && dragState.pointIndex !== null) {
        const measurement = measurements.find((m) => m.id === dragState.measurementId);
        if (!measurement) return;

        const updatedPoints = [...measurement.points];
        updatedPoints[dragState.pointIndex] = point;

        let updatedMeasurement = { ...measurement, points: updatedPoints };

        if (measurement.type === "line") {
          const rawLength = polylineLength(updatedPoints);
          updatedMeasurement = { ...updatedMeasurement, raw_length: rawLength };
          if (calibrationScale) {
            updatedMeasurement.result = rawLength * calibrationScale;
          }
        } else if (measurement.type === "area" || measurement.type === "volume") {
          const rawArea = polygonArea(updatedPoints);
          updatedMeasurement = { ...updatedMeasurement, raw_area: rawArea };
          if (calibrationScale) {
            const realArea = rawArea * calibrationScale * calibrationScale;
            if (measurement.type === "volume") {
              const depth = measurement.meta?.depth ?? 1;
              updatedMeasurement.result = realArea * depth;
              updatedMeasurement.raw_volume = rawArea * depth;
            } else {
              updatedMeasurement.result = realArea;
            }
          }
        }

        setMeasurements((prev) =>
          prev.map((m) => (m.id === dragState.measurementId ? updatedMeasurement : m))
        );
      } else if (dragState.type === "calibration" && dragState.calibrationPoint) {
        const propName = dragState.calibrationPoint === "p1" ? "calibration_point_1" : "calibration_point_2";
        setPageRows((prev) =>
          prev.map((p) =>
            p.page_number === currentPage
              ? {
                  ...p,
                  [propName]: point,
                }
              : p
          )
        );
      }
    },
    [
      pdfDoc,
      getPagePointFromEvent,
      dragState,
      measurements,
      calibrationScale,
      pageMeasurements,
      currentPage,
    ]
  );

  const handleOverlayMouseUpWithDrag = useCallback(() => {
    if (dragState.type === "measurement" && dragState.measurementId) {
      queueAutosave();
    } else if (dragState.type === "calibration") {
      queueAutosave();
    }
    setDragState({ type: null, measurementId: null, pointIndex: null, calibrationPoint: null });
  }, [dragState, queueAutosave]);

  const zoomIn = useCallback(() => setZoom((prev) => clamp(prev + 0.1, 0.25, 4)), []);
  const zoomOut = useCallback(() => setZoom((prev) => clamp(prev - 0.1, 0.25, 4)), []);
  const zoomFit = useCallback(() => {
    const wrapper = workspaceRef.current;
    if (!wrapper) return;
    const availableWidth = Math.max(wrapper.clientWidth - 64, 320);
    const fit = availableWidth / Math.max(basePageSize.width, 1);
    setZoom(clamp(fit, 0.25, 2.5));
    setPan({ x: 24, y: 24 });
  }, [basePageSize.width]);

  const resetView = useCallback(() => {
    setZoom(1);
    setPan({ x: 24, y: 24 });
  }, []);

  const triggerPdfSelect = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handlePdfChosen = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file || !session || !activeProjectId) return;

      setLoadingPdf(true);
      setErrorText("");

      try {
        const uploaded = await uploadPdfToStorage(file, activeProjectId, session.id);
        const localUrl = URL.createObjectURL(file);

        if (uploaded) {
          // Generate correct URL based on bucket type (signed for private, public for public)
          const storageUrl = await getStorageUrl(uploaded.bucket, uploaded.path);

          setPdfUrl(storageUrl);
          setPdfName(file.name);
          setSession((prev) =>
            prev
              ? {
                  ...prev,
                  pdf_name: file.name,
                  pdf_bucket: uploaded.bucket,
                  pdf_path: uploaded.path,
                  pdf_url: null,
                  updated_at: new Date().toISOString(),
                }
              : prev
          );
        } else {
          setPdfUrl(localUrl);
          setPdfName(file.name);
          setSession((prev) =>
            prev
              ? {
                  ...prev,
                  pdf_name: file.name,
                  pdf_bucket: null,
                  pdf_path: null,
                  pdf_url: localUrl,
                  updated_at: new Date().toISOString(),
                }
              : prev
          );
        }

        setCurrentPage(1);
        setPan({ x: 24, y: 24 });
        setZoom(1);
      } catch (error: any) {
        setErrorText(error?.message ?? "Failed to upload PDF.");
      } finally {
        setLoadingPdf(false);
        if (event.target) event.target.value = "";
      }
    },
    [session, activeProjectId]
  );

  const exportCsv = useCallback(() => {
    const lines = [
      [
        "Page",
        "Group",
        "Name",
        "Type",
        "Value",
        "Unit",
        "Depth",
        "Points",
      ].join(","),
    ];

    safeMeasurements.forEach((m) => {
      const groupName = safeGroups.find((g) => g.id === m.group_id)?.name ?? "Ungrouped";
      const value = getMeasurementDisplayValue(m, calibrationScale !== null);
      lines.push(
        [
          m.page_number,
          `"${groupName.replace(/"/g, '""')}"`,
          "",
          m.type,
          value,
          `"${m.unit.replace(/"/g, '""')}"`,
          "",
          `"${JSON.stringify(m.points).replace(/"/g, '""')}"`,
        ].join(",")
      );
    });

    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${pdfName || "takeoff"}-measurements.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }, [safeMeasurements, safeGroups, pdfName]);

  const selectedGroupColor =
    safeGroups.find((g) => g.id === selectedGroupId)?.color ?? COLORS[0];

  const draftLabel = useMemo(() => {
    if (toolMode === "calibrate") {
      const count = Number(Boolean(calibrationDraft.p1)) + Number(Boolean(calibrationDraft.p2));
      return `Calibration points: ${count}/2`;
    }
    if (toolMode === "area" || toolMode === "volume") {
      return `Draft points: ${draftPoints.length} (double-click to finish)`;
    }
    if (toolMode === "line") {
      return `Draft points: ${draftPoints.length}/2`;
    }
    return "";
  }, [toolMode, calibrationDraft, draftPoints.length]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-100 p-6 text-slate-700">
        <div className="mx-auto max-w-7xl rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          Loading Takeoff workspace...
        </div>
      </div>
    );
  }

  if (!activeProjectId) {
    return (
      <div className="min-h-screen bg-slate-100 p-6 text-slate-700">
        <div className="mx-auto max-w-7xl rounded-2xl border border-amber-200 bg-amber-50 p-8 shadow-sm">
          No active project selected. Open this page from a project context or route with a project ID.
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 text-slate-800">
      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={handlePdfChosen}
      />

      <div className="border-b border-slate-200 bg-white px-4 py-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-2 py-2">
            {(["select", "hand", "calibrate", "line", "area", "count", "volume"] as ToolMode[]).map(
              (mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => {
                    setToolMode(mode);
                    setDraftPoints([]);
                    if (mode !== "calibrate") {
                      setCalibrationDraft((prev) => ({ ...prev, p1: null, p2: null }));
                    }
                  }}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                    toolMode === mode
                      ? "bg-slate-900 dark:bg-slate-900 text-white"
                      : "bg-white text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  {mode === "select" ? "Select" : mode === "hand" ? "Hand" : mode[0].toUpperCase() + mode.slice(1)}
                </button>
              )
            )}
          </div>

          <div className="flex border-b bg-white px-2 text-sm">
  {[
    { key: "drawings", label: "Drawings" },
    { key: "measurements", label: "Measurements" },
    { key: "extracted", label: "Extracted Details" },
    { key: "boq", label: "BOQ Links" },
    { key: "settings", label: "Settings" },
  ].map((tab) => (
    <button
      key={tab.key}
      onClick={() => setActiveWorkspaceTab(tab.key as any)}
      className={`px-4 py-2 ${
        activeWorkspaceTab === tab.key
          ? "border-b-2 border-blue-600 font-semibold text-blue-600"
          : "text-gray-500"
      }`}
    >
      {tab.label}
    </button>
  ))}
</div>

          <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-2 py-2">
            <button type="button" onClick={zoomOut} className="rounded-lg bg-white px-3 py-1.5 text-sm hover:bg-slate-100">
              −
            </button>
            <div className="min-w-[72px] text-center text-sm font-medium">{Math.round(zoom * 100)}%</div>
            <button type="button" onClick={zoomIn} className="rounded-lg bg-white px-3 py-1.5 text-sm hover:bg-slate-100">
              +
            </button>
            <button type="button" onClick={zoomFit} className="rounded-lg bg-white px-3 py-1.5 text-sm hover:bg-slate-100">
              Fit
            </button>
            <button type="button" onClick={resetView} className="rounded-lg bg-white px-3 py-1.5 text-sm hover:bg-slate-100">
              Reset
            </button>
          </div>

          {pageCount > 1 && (
            <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-2 py-2">
              <button
                type="button"
                onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
                className="rounded-lg bg-white px-3 py-1.5 text-sm hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
              >
                ←
              </button>
              <div className="min-w-[80px] text-center text-sm font-medium">
                Page {currentPage} / {pageCount}
              </div>
              <button
                type="button"
                onClick={() => setCurrentPage((prev) => Math.min(pageCount, prev + 1))}
                disabled={currentPage === pageCount}
                className="rounded-lg bg-white px-3 py-1.5 text-sm hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
              >
                →
              </button>
            </div>
          )}

          <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
            <span className="text-xs uppercase tracking-wide text-slate-500">Calibration</span>
            <input
              value={calibrationDraft.distanceText}
              onChange={(e) =>
                setCalibrationDraft((prev) => ({
                  ...prev,
                  distanceText: e.target.value,
                }))
              }
              className="w-20 rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm outline-none"
            />
            <select
              value={calibrationDraft.unit}
              onChange={(e) =>
                setCalibrationDraft((prev) => ({
                  ...prev,
                  unit: e.target.value as UnitSystem,
                }))
              }
              className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm outline-none"
            >
              <option value="ft">ft</option>
              <option value="m">m</option>
              <option value="in">in</option>
            </select>
            <button
              type="button"
              onClick={commitCalibration}
              className="rounded-lg bg-slate-800 dark:bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700 dark:hover:bg-slate-800"
            >
              Apply
            </button>
          </div>

          <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
            <span className="text-xs uppercase tracking-wide text-slate-500">Volume Depth</span>
            <input
              value={draftVolumeDepth}
              onChange={(e) => setDraftVolumeDepth(e.target.value)}
              className="w-20 rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm outline-none"
            />
            <span className="text-sm text-slate-600">{calibrationUnit}</span>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={triggerPdfSelect}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium hover:bg-slate-50"
            >
              {pdfUrl ? "Replace PDF" : "Upload PDF"}
            </button>
            <button
              type="button"
              onClick={() => setShowExportModal(true)}
              disabled={safeMeasurements.length === 0}
              className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Send to BOQ
            </button>
            <button
              type="button"
              onClick={exportCsv}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium hover:bg-slate-50"
            >
              Export CSV
            </button>
            <div
              className={`rounded-xl px-4 py-2 text-sm font-medium ${
                saveStatus === "saving"
                  ? "bg-amber-100 text-amber-800"
                  : saveStatus === "saved"
                  ? "bg-emerald-100 text-emerald-800"
                  : saveStatus === "error"
                  ? "bg-rose-100 text-rose-800"
                  : "bg-slate-100 text-slate-700"
              }`}
            >
              {saveStatus === "saving"
                ? "Saving..."
                : saveStatus === "saved"
                ? "Saved"
                : saveStatus === "error"
                ? "Save error"
                : "Idle"}
            </div>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-4 text-sm text-slate-600">
          <div>Project: <span className="font-medium text-slate-900">{activeProjectId}</span></div>
          <div>Page: <span className="font-medium text-slate-900">{currentPage}{pageCount ? ` / ${pageCount}` : ""}</span></div>
          <div>PDF: <span className="font-medium text-slate-900">{pdfName || "None selected"}</span></div>
          <div>Scale: <span className="font-medium text-slate-900">{calibrationScale ? `1 px = ${formatNumber(calibrationScale, 6)} ${calibrationUnit}` : "Not calibrated"}</span></div>
          {draftLabel ? <div className="font-medium text-slate-900">{draftLabel}</div> : null}
        </div>

        {errorText ? (
          <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
            {errorText}
          </div>
        ) : null}
      </div>

      <div className="grid min-h-[calc(100vh-88px)] grid-cols-[280px_minmax(0,1fr)_360px] gap-0">
        <aside className="border-r border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-4 py-3">
            <div className="text-sm font-semibold text-slate-900">Pages</div>
            <div className="mt-1 text-xs text-slate-500">Drawing navigation</div>
          </div>

          <div className="max-h-[calc(100vh-145px)] overflow-y-auto p-3">
            {!pageCount ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-600">
                Upload a PDF to start measuring.
              </div>
            ) : (
              Array.from({ length: pageCount }, (_, index) => index + 1).map((pageNo) => {
                const pageMeasurementCount = safeMeasurements.filter((m) => m.page_number === pageNo).length;
                const active = pageNo === currentPage;
                return (
                  <button
                    key={pageNo}
                    type="button"
                    onClick={() => setCurrentPage(pageNo)}
                    className={`mb-3 w-full rounded-2xl border p-3 text-left transition ${
                      active
                        ? "border-slate-800 dark:border-slate-900 bg-slate-800 dark:bg-slate-900 text-white"
                        : "border-slate-200 bg-white hover:bg-slate-50"
                    }`}
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <div className="text-sm font-semibold">Page {pageNo}</div>
                      <div
                        className={`rounded-full px-2 py-0.5 text-xs ${
                          active ? "bg-white/15 text-white" : "bg-slate-100 text-slate-700"
                        }`}
                      >
                        {pageMeasurementCount} items
                      </div>
                    </div>
                    <div
                      className={`flex h-28 items-center justify-center overflow-hidden rounded-xl border ${
                        active
                          ? "border-white/15 bg-white/5"
                          : "border-slate-200 bg-slate-50"
                      }`}
                    >
                      {pageThumbnails.get(pageNo) ? (
                        <img
                          src={pageThumbnails.get(pageNo)}
                          alt={`Page ${pageNo} preview`}
                          className="h-full w-full object-contain"
                        />
                      ) : (
                        <div className={`text-xs ${active ? "text-white/80" : "text-slate-500"}`}>
                          Loading preview...
                        </div>
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </aside>

        <main
          ref={workspaceRef}
          className="relative overflow-hidden bg-slate-200"
          onMouseDown={handleWorkspaceMouseDown}
          onMouseMove={handleWorkspaceMouseMove}
          onMouseUp={handleWorkspaceMouseUp}
          onMouseLeave={handleWorkspaceMouseUp}
          onAuxClick={(e) => e.preventDefault()}
          onContextMenu={(e) => {
            if (e.button === 1 || isPanning) {
              e.preventDefault();
            }
          }}
        >
          {!pdfUrl ? (
            <div className="flex h-full items-center justify-center p-8">
              <div className="max-w-md rounded-3xl border border-dashed border-slate-400 bg-white/80 p-8 text-center shadow-sm backdrop-blur">
                <div className="text-xl font-semibold text-slate-900">Start a New Takeoff</div>
                <div className="mt-2 text-sm text-slate-600">
                  Upload your drawing PDF, calibrate a known distance, then begin measuring.
                </div>
                <button
                  type="button"
                  onClick={triggerPdfSelect}
                  className="mt-5 rounded-xl bg-slate-800 dark:bg-slate-900 px-5 py-3 text-sm font-medium text-white hover:bg-slate-700 dark:hover:bg-slate-800"
                >
                  Upload Drawing PDF
                </button>
              </div>
            </div>
          ) : (
            <div
              className="absolute left-0 top-0"
              style={{
                transform: `translate(${pan.x}px, ${pan.y}px)`,
                width: `${currentStageWidth}px`,
                height: `${currentStageHeight}px`,
              }}
            >
              <div className="relative rounded-2xl bg-white shadow-2xl">
                {loadingPdf ? (
                  <div className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-white/80 text-sm font-medium text-slate-700 backdrop-blur-sm">
                    Rendering PDF...
                  </div>
                ) : null}

                <canvas
                  ref={canvasRef}
                  className="block rounded-2xl"
                  style={{
                    width: `${currentStageWidth}px`,
                    height: `${currentStageHeight}px`,
                  }}
                />

                <svg
                  ref={overlayRef}
                  viewBox={`0 0 ${basePageSize.width} ${basePageSize.height}`}
                  className="absolute left-0 top-0 rounded-2xl"
                  style={{
                    width: `${currentStageWidth}px`,
                    height: `${currentStageHeight}px`,
                    cursor:
                      isPanning
                        ? "grabbing"
                        : toolMode === "hand" || isSpacebarPressed
                        ? "grab"
                        : toolMode === "select"
                        ? "default"
                        : "crosshair",
                  }}
                  onClick={handleOverlayClick}
                  onDoubleClick={handleOverlayDoubleClick}
                  onMouseMove={handleOverlayMouseMoveWithDrag}
                  onMouseUp={handleOverlayMouseUpWithDrag}
                  onMouseLeave={handleOverlayMouseLeave}
                >
                  {pageMeasurements
                    .slice()
                    .sort((a, b) => {
                      const aSelected = selectedMeasurementId === a.id;
                      const bSelected = selectedMeasurementId === b.id;
                      if (aSelected && !bSelected) return 1;
                      if (!aSelected && bSelected) return -1;
                      return 0;
                    })
                    .map((m) => {
                    const groupColor =
                      safeGroups.find((g) => g.id === m.group_id)?.color ?? "#2563eb";
                    const selected = selectedMeasurementId === m.id;
                    const isDimmed = highlightedGroupId !== null && m.group_id !== highlightedGroupId;
                    const baseOpacity = isDimmed ? 0.15 : 1;

                    if (m.type === "line") {
                      const midpoint = getLineMidpoint(m.points);
                      const lengthPx = m.raw_length ?? 0;
                      let labelText = "";
                      if (calibrationScale) {
                        const realLength = lengthPx * calibrationScale;
                        if (calibrationUnit === "ft") {
                          labelText = formatFeetInches(realLength);
                        } else {
                          labelText = `${formatNumber(realLength)} ${calibrationUnit}`;
                        }
                      } else {
                        labelText = `${formatNumber(lengthPx)} px`;
                      }

                      const displayColor = selected ? brightenColor(groupColor, 40) : groupColor;

                      return (
                        <g key={m.id} onClick={() => setSelectedMeasurementId(m.id)} style={{ cursor: "pointer" }} opacity={baseOpacity}>
                          {selected && (
                            <polyline
                              points={linePointsToSvg(m.points)}
                              fill="none"
                              stroke={displayColor}
                              strokeWidth={8}
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              opacity={0.3}
                            />
                          )}
                          <polyline
                            points={linePointsToSvg(m.points)}
                            fill="none"
                            stroke={displayColor}
                            strokeWidth={selected ? 4 : 2}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                          {m.points.map((p, idx) => (
                            <circle
                              key={`${m.id}-${idx}`}
                              cx={p.x}
                              cy={p.y}
                              r={selected ? 5 : 3}
                              fill={displayColor}
                              stroke={selected ? "white" : "none"}
                              strokeWidth={selected ? 1.5 : 0}
                            />
                          ))}
                          {selected && m.points.map((p, idx) => (
                            <g key={`handle-${m.id}-${idx}`}>
                              <circle
                                cx={p.x}
                                cy={p.y}
                                r={10}
                                fill="white"
                                stroke={displayColor}
                                strokeWidth={2.5}
                                style={{ cursor: "move" }}
                                onMouseDown={(e) => handleHandleMouseDown(e, "measurement", m.id, idx, null)}
                              />
                              <circle
                                cx={p.x}
                                cy={p.y}
                                r={3.5}
                                fill={displayColor}
                                pointerEvents="none"
                              />
                            </g>
                          ))}
                          {midpoint && (
                            <g>
                              <rect
                                x={midpoint.x - 30}
                                y={midpoint.y - 20}
                                width={60}
                                height={18}
                                rx={9}
                                fill="white"
                                fillOpacity={0.95}
                                stroke={displayColor}
                                strokeWidth={selected ? 2 : 1.5}
                              />
                              <text
                                x={midpoint.x}
                                y={midpoint.y - 8}
                                fill={displayColor}
                                fontSize={selected ? 12 : 11}
                                fontWeight="600"
                                textAnchor="middle"
                              >
                                {labelText}
                              </text>
                            </g>
                          )}
                        </g>
                      );
                    }

                    if (m.type === "area" || m.type === "volume") {
                      const centroid = getPolygonCentroid(m.points);
                      const areaPx = m.raw_area ?? 0;
                      let labelLines: string[] = [];

                      if (calibrationScale) {
                        const realArea = areaPx * calibrationScale * calibrationScale;
                        const areaUnit = getAreaUnit(calibrationUnit);

                        if (m.type === "volume") {
                          const depth = m.meta?.depth ?? 1;
                          const realVolume = realArea * depth;
                          const volumeUnit = getVolumeUnit(calibrationUnit);
                          labelLines = [`${formatNumber(realVolume)} ${volumeUnit}`];
                        } else {
                          labelLines = [`${formatNumber(realArea)} ${areaUnit}`];
                        }
                      } else {
                        if (m.type === "volume") {
                          labelLines = [`${formatNumber(areaPx)} px²`];
                        } else {
                          labelLines = [`${formatNumber(areaPx)} px²`];
                        }
                      }

                      const displayColor = selected ? brightenColor(groupColor, 40) : groupColor;

                      return (
                        <g key={m.id} onClick={() => setSelectedMeasurementId(m.id)} style={{ cursor: "pointer" }} opacity={baseOpacity}>
                          {selected && (
                            <polygon
                              points={polygonPointsToSvg(m.points)}
                              fill={displayColor}
                              fillOpacity={0.15}
                              stroke={displayColor}
                              strokeWidth={8}
                              strokeLinejoin="round"
                              opacity={0.3}
                            />
                          )}
                          <polygon
                            points={polygonPointsToSvg(m.points)}
                            fill={displayColor}
                            fillOpacity={m.type === "volume" ? 0.22 : 0.16}
                            stroke={displayColor}
                            strokeWidth={selected ? 4 : 2}
                            strokeLinejoin="round"
                          />
                          {m.points.map((p, idx) => (
                            <circle
                              key={`${m.id}-${idx}`}
                              cx={p.x}
                              cy={p.y}
                              r={selected ? 5 : 3}
                              fill={displayColor}
                              stroke={selected ? "white" : "none"}
                              strokeWidth={selected ? 1.5 : 0}
                            />
                          ))}
                          {selected && m.points.map((p, idx) => (
                            <g key={`handle-${m.id}-${idx}`}>
                              <circle
                                cx={p.x}
                                cy={p.y}
                                r={10}
                                fill="white"
                                stroke={displayColor}
                                strokeWidth={2.5}
                                style={{ cursor: "move" }}
                                onMouseDown={(e) => handleHandleMouseDown(e, "measurement", m.id, idx, null)}
                              />
                              <circle
                                cx={p.x}
                                cy={p.y}
                                r={3.5}
                                fill={displayColor}
                                pointerEvents="none"
                              />
                            </g>
                          ))}
                          {centroid && labelLines.length > 0 && (
                            <g>
                              {labelLines.map((line, idx) => {
                                const textWidth = line.length * 6 + 16;
                                const yOffset = idx * 20;
                                return (
                                  <g key={idx}>
                                    <rect
                                      x={centroid.x - textWidth / 2}
                                      y={centroid.y - 10 + yOffset}
                                      width={textWidth}
                                      height={18}
                                      rx={9}
                                      fill="white"
                                      fillOpacity={0.95}
                                      stroke={displayColor}
                                      strokeWidth={selected ? 2 : 1.5}
                                    />
                                    <text
                                      x={centroid.x}
                                      y={centroid.y + 2 + yOffset}
                                      fill={displayColor}
                                      fontSize={selected ? 12 : 11}
                                      fontWeight="600"
                                      textAnchor="middle"
                                    >
                                      {line}
                                    </text>
                                  </g>
                                );
                              })}
                            </g>
                          )}
                        </g>
                      );
                    }

                    const displayColor = selected ? brightenColor(groupColor, 40) : groupColor;

                    return (
                      <g key={m.id} onClick={() => setSelectedMeasurementId(m.id)} style={{ cursor: "pointer" }} opacity={baseOpacity}>
                        {selected && (
                          <circle
                            cx={m.points[0]?.x ?? 0}
                            cy={m.points[0]?.y ?? 0}
                            r={16}
                            fill={displayColor}
                            fillOpacity={0.2}
                            stroke="none"
                          />
                        )}
                        <circle
                          cx={m.points[0]?.x ?? 0}
                          cy={m.points[0]?.y ?? 0}
                          r={selected ? 10 : 7}
                          fill={displayColor}
                          fillOpacity={0.9}
                          stroke="white"
                          strokeWidth={selected ? 2.5 : 2}
                        />
                        {selected && (
                          <g>
                            <circle
                              cx={m.points[0]?.x ?? 0}
                              cy={m.points[0]?.y ?? 0}
                              r={14}
                              fill="white"
                              stroke={displayColor}
                              strokeWidth={2.5}
                              style={{ cursor: "move" }}
                              onMouseDown={(e) => handleHandleMouseDown(e, "measurement", m.id, 0, null)}
                            />
                            <circle
                              cx={m.points[0]?.x ?? 0}
                              cy={m.points[0]?.y ?? 0}
                              r={5}
                              fill={displayColor}
                              pointerEvents="none"
                            />
                          </g>
                        )}
                        <g>
                          <rect
                            x={(m.points[0]?.x ?? 0) + 12}
                            y={(m.points[0]?.y ?? 0) - 10}
                            width={24}
                            height={18}
                            rx={9}
                            fill="white"
                            fillOpacity={0.95}
                            stroke={displayColor}
                            strokeWidth={selected ? 2 : 1.5}
                          />
                          <text
                            x={(m.points[0]?.x ?? 0) + 24}
                            y={(m.points[0]?.y ?? 0) + 2}
                            fill={displayColor}
                            fontSize={selected ? 12 : 11}
                            fontWeight="600"
                            textAnchor="middle"
                          >
                            1
                          </text>
                        </g>
                      </g>
                    );
                  })}

                  {currentPageRow?.calibration_point_1 && currentPageRow?.calibration_point_2 && toolMode === "select" ? (
                    <g>
                      <line
                        x1={currentPageRow.calibration_point_1.x}
                        y1={currentPageRow.calibration_point_1.y}
                        x2={currentPageRow.calibration_point_2.x}
                        y2={currentPageRow.calibration_point_2.y}
                        stroke="#7c3aed"
                        strokeWidth={2}
                        strokeDasharray="4 4"
                        opacity={0.6}
                      />
                      <g>
                        <circle
                          cx={currentPageRow.calibration_point_1.x}
                          cy={currentPageRow.calibration_point_1.y}
                          r={8}
                          fill="white"
                          stroke="#7c3aed"
                          strokeWidth={2}
                          style={{ cursor: "move" }}
                          onMouseDown={(e) => handleHandleMouseDown(e, "calibration", null, null, "p1")}
                        />
                        <circle
                          cx={currentPageRow.calibration_point_1.x}
                          cy={currentPageRow.calibration_point_1.y}
                          r={3}
                          fill="#7c3aed"
                          pointerEvents="none"
                        />
                      </g>
                      <g>
                        <circle
                          cx={currentPageRow.calibration_point_2.x}
                          cy={currentPageRow.calibration_point_2.y}
                          r={8}
                          fill="white"
                          stroke="#7c3aed"
                          strokeWidth={2}
                          style={{ cursor: "move" }}
                          onMouseDown={(e) => handleHandleMouseDown(e, "calibration", null, null, "p2")}
                        />
                        <circle
                          cx={currentPageRow.calibration_point_2.x}
                          cy={currentPageRow.calibration_point_2.y}
                          r={3}
                          fill="#7c3aed"
                          pointerEvents="none"
                        />
                      </g>
                    </g>
                  ) : null}

                  {toolMode === "calibrate" && calibrationDraft.p1 ? (
                    <circle
                      cx={calibrationDraft.p1.x}
                      cy={calibrationDraft.p1.y}
                      r={5}
                      fill="#dc2626"
                    />
                  ) : null}

                  {toolMode === "calibrate" && calibrationDraft.p1 && calibrationDraft.p2 ? (
                    <>
                      <circle cx={calibrationDraft.p2.x} cy={calibrationDraft.p2.y} r={5} fill="#dc2626" />
                      <line
                        x1={calibrationDraft.p1.x}
                        y1={calibrationDraft.p1.y}
                        x2={calibrationDraft.p2.x}
                        y2={calibrationDraft.p2.y}
                        stroke="#dc2626"
                        strokeWidth={3}
                        strokeDasharray="8 6"
                      />
                    </>
                  ) : null}

                  {(toolMode === "line" || toolMode === "area" || toolMode === "volume") && draftPoints.length > 0 ? (
                    <g>
                      {draftPoints.length > 1 ? (
                        <polyline
                          points={linePointsToSvg(draftPoints)}
                          fill="none"
                          stroke={selectedGroupColor}
                          strokeWidth={2}
                          strokeDasharray="6 4"
                        />
                      ) : null}
                      {draftPoints.map((p, idx) => (
                        <circle key={`draft-${idx}`} cx={p.x} cy={p.y} r={4} fill={selectedGroupColor} />
                      ))}
                    </g>
                  ) : null}

                  {currentMousePoint && toolMode === "line" && draftPoints.length === 1 ? (
                    <g>
                      <line
                        x1={draftPoints[0].x}
                        y1={draftPoints[0].y}
                        x2={currentMousePoint.x}
                        y2={currentMousePoint.y}
                        stroke={selectedGroupColor}
                        strokeWidth={2}
                        strokeDasharray="3 3"
                        opacity={0.6}
                      />
                      <circle cx={currentMousePoint.x} cy={currentMousePoint.y} r={3} fill={selectedGroupColor} opacity={0.6} />
                    </g>
                  ) : null}

                  {currentMousePoint && (toolMode === "area" || toolMode === "volume") && draftPoints.length === 1 ? (
                    <g>
                      <line
                        x1={draftPoints[0].x}
                        y1={draftPoints[0].y}
                        x2={currentMousePoint.x}
                        y2={currentMousePoint.y}
                        stroke={selectedGroupColor}
                        strokeWidth={2}
                        strokeDasharray="3 3"
                        opacity={0.6}
                      />
                      <circle cx={currentMousePoint.x} cy={currentMousePoint.y} r={3} fill={selectedGroupColor} opacity={0.6} />
                    </g>
                  ) : null}

                  {currentMousePoint && (toolMode === "area" || toolMode === "volume") && draftPoints.length >= 2 ? (
                    <g>
                      <polygon
                        points={polygonPointsToSvg([...draftPoints, currentMousePoint])}
                        fill={selectedGroupColor}
                        fillOpacity={toolMode === "volume" ? 0.15 : 0.1}
                        stroke={selectedGroupColor}
                        strokeWidth={2}
                        strokeDasharray="3 3"
                        opacity={0.6}
                      />
                      <circle cx={currentMousePoint.x} cy={currentMousePoint.y} r={3} fill={selectedGroupColor} opacity={0.6} />
                    </g>
                  ) : null}

                  {currentMousePoint && (toolMode === "line" || toolMode === "area" || toolMode === "volume") && draftPoints.length > 0 ? (
                    (() => {
                      let previewPoints: Point[] = [];
                      let displayValue = "";

                      if (toolMode === "line" && draftPoints.length === 1) {
                        previewPoints = [draftPoints[0], currentMousePoint];
                        const lengthPx = polylineLength(previewPoints);
                        if (calibrationScale) {
                          const realLength = lengthPx * calibrationScale;
                          if (calibrationUnit === "ft") {
                            displayValue = formatFeetInches(realLength);
                          } else {
                            displayValue = `${formatNumber(realLength)} ${calibrationUnit}`;
                          }
                        } else {
                          displayValue = `${formatNumber(lengthPx)} px (uncalibrated)`;
                        }
                      } else if ((toolMode === "area" || toolMode === "volume") && draftPoints.length >= 2) {
                        previewPoints = [...draftPoints, currentMousePoint];
                        const areaPx = polygonArea(previewPoints);
                        if (calibrationScale) {
                          const realArea = areaPx * calibrationScale * calibrationScale;
                          const areaUnit = getAreaUnit(calibrationUnit);
                          if (toolMode === "volume") {
                            const depth = Math.max(Number(draftVolumeDepth) || 0, 0);
                            const realVolume = realArea * depth;
                            const volumeUnit = getVolumeUnit(calibrationUnit);
                            displayValue = `Area: ${formatNumber(realArea)} ${areaUnit}\nVolume: ${formatNumber(realVolume)} ${volumeUnit}`;
                          } else {
                            displayValue = `${formatNumber(realArea)} ${areaUnit}`;
                          }
                        } else {
                          if (toolMode === "volume") {
                            displayValue = `${formatNumber(areaPx)} px² (uncalibrated)`;
                          } else {
                            displayValue = `${formatNumber(areaPx)} px² (uncalibrated)`;
                          }
                        }
                      }

                      if (!displayValue) return null;

                      const textLines = displayValue.split('\n');
                      const offsetX = 12;
                      const offsetY = -12;

                      return (
                        <g>
                          {textLines.map((line, idx) => (
                            <g key={idx}>
                              <text
                                x={currentMousePoint.x + offsetX}
                                y={currentMousePoint.y + offsetY + (idx * 20)}
                                fill="white"
                                stroke="white"
                                strokeWidth={4}
                                fontSize={14}
                                fontWeight="600"
                                paintOrder="stroke"
                              >
                                {line}
                              </text>
                              <text
                                x={currentMousePoint.x + offsetX}
                                y={currentMousePoint.y + offsetY + (idx * 20)}
                                fill={selectedGroupColor}
                                fontSize={14}
                                fontWeight="600"
                              >
                                {line}
                              </text>
                            </g>
                          ))}
                        </g>
                      );
                    })()
                  ) : null}
                </svg>
              </div>
            </div>
          )}
        </main>

        <aside className="border-l border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-4 py-3">
            <div className="text-sm font-semibold text-slate-900">Groups & Measurements</div>
            <div className="mt-1 text-xs text-slate-500">Live totals and takeoff items</div>
          </div>

          {totalsByGroup.filter((t) => t.group !== null).length > 0 && (
            <div className="border-b border-slate-200 bg-slate-50/50 p-4">
              <div className="mb-3 flex items-center justify-between">
                <div className="text-sm font-semibold text-slate-900">Measurement Legend</div>
                {highlightedGroupId && (
                  <button
                    type="button"
                    onClick={() => setHighlightedGroupId(null)}
                    className="text-xs font-medium text-blue-600 hover:text-blue-700"
                  >
                    Clear Filter
                  </button>
                )}
              </div>
              <div className="space-y-2">
                {totalsByGroup
                  .filter((t) => t.group !== null)
                  .map((total) => {
                    const group = total.group!;
                    const measurementCount = safeMeasurements.filter((m) => m.group_id === group.id).length;
                    const isHighlighted = highlightedGroupId === group.id;
                    const hasMeasurements = measurementCount > 0;

                    return (
                      <button
                        key={group.id}
                        type="button"
                        onClick={() => setHighlightedGroupId(isHighlighted ? null : group.id)}
                        className={`w-full rounded-xl border p-3 text-left transition-all ${
                          isHighlighted
                            ? "border-blue-400 bg-blue-50 shadow-sm"
                            : "border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm"
                        }`}
                      >
                        <div className="mb-2 flex items-center gap-2">
                          <div
                            className="h-4 w-4 flex-shrink-0 rounded-full border-2 border-white shadow-sm"
                            style={{ backgroundColor: group.color }}
                          />
                          <div className="min-w-0 flex-1 text-sm font-semibold text-slate-900">{group.name}</div>
                          <div className="flex-shrink-0 rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-700">
                            {measurementCount}
                          </div>
                        </div>

                        {hasMeasurements && (
                          <div className="ml-6 space-y-1 text-xs">
                            {total.line > 0 && (
                              <div className="flex items-center justify-between">
                                <span className="text-slate-600">Length:</span>
                                <span className="font-semibold text-slate-900">
                                  {formatNumber(total.line)} {total.lineUnit}
                                </span>
                              </div>
                            )}
                            {total.area > 0 && (
                              <div className="flex items-center justify-between">
                                <span className="text-slate-600">Area:</span>
                                <span className="font-semibold text-slate-900">
                                  {formatNumber(total.area)} {total.areaUnit}
                                </span>
                              </div>
                            )}
                            {total.count > 0 && (
                              <div className="flex items-center justify-between">
                                <span className="text-slate-600">Count:</span>
                                <span className="font-semibold text-slate-900">
                                  {formatNumber(total.count)} {total.countUnit}
                                </span>
                              </div>
                            )}
                            {total.volume > 0 && (
                              <div className="flex items-center justify-between">
                                <span className="text-slate-600">Volume:</span>
                                <span className="font-semibold text-slate-900">
                                  {formatNumber(total.volume)} {total.volumeUnit}
                                </span>
                              </div>
                            )}
                          </div>
                        )}
                      </button>
                    );
                  })}
              </div>
            </div>
          )}

          <div className="grid h-[calc(100vh-145px)] grid-rows-[auto_1fr_auto]">
            <div className="border-b border-slate-200 p-4">
              <div className="mb-3 flex items-center justify-between">
                <div className="text-sm font-semibold text-slate-900">Groups</div>
                <button
                  type="button"
                  onClick={addGroup}
                  className="rounded-lg bg-slate-800 dark:bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700 dark:hover:bg-slate-800"
                >
                  Add Group
                </button>
              </div>

              <div className="max-h-48 space-y-2 overflow-y-auto">
                {safeGroups.map((group) => {
                  const measurementCount = safeMeasurements.filter((m) => m.group_id === group.id).length;
                  const active = selectedGroupId === group.id;
                  return (
                    <div
                      key={group.id}
                      className={`rounded-2xl border p-3 ${
                        active ? "border-slate-700 dark:border-slate-900 bg-slate-100 dark:bg-slate-50" : "border-slate-200 bg-white"
                      }`}
                    >
                      <div className="mb-2 flex items-center gap-2">
                        <button
                          type="button"
                          className="h-4 w-4 rounded-full border border-white shadow-sm"
                          style={{ backgroundColor: group.color }}
                          onClick={() => setSelectedGroupId(group.id)}
                          title={group.name}
                        />
                        <input
                          value={group.name}
                          onChange={(e) => updateGroupName(group.id, e.target.value)}
                          onFocus={() => setSelectedGroupId(group.id)}
                          className="min-w-0 flex-1 rounded-lg border border-slate-200 px-2 py-1 text-sm outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => deleteGroup(group.id)}
                          className="rounded-lg px-2 py-1 text-xs text-rose-600 hover:bg-rose-50"
                        >
                          Delete
                        </button>
                      </div>
                      <div className="text-xs text-slate-500">{measurementCount} measurements</div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="overflow-hidden">
              <div className="border-b border-slate-200 px-4 py-3">
                <div className="text-sm font-semibold text-slate-900">Page {currentPage} Measurements</div>
              </div>

              <div className="max-h-full overflow-y-auto p-4">
                {pageMeasurements.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-600">
                    No measurements on this page yet.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {pageMeasurements.map((m) => {
                      const group = safeGroups.find((g) => g.id === m.group_id) ?? null;
                      const active = selectedMeasurementId === m.id;
                      return (
                        <div
                          key={m.id}
                          className={`rounded-2xl border p-3 transition ${
                            active ? "border-slate-700 dark:border-slate-900 bg-slate-100 dark:bg-slate-50" : "border-slate-200 bg-white"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <button
                              type="button"
                              onClick={() => setSelectedMeasurementId(m.id)}
                              className="min-w-0 flex-1 text-left"
                            >
                              <div className="flex items-center gap-2">
                                <div
                                  className="h-3 w-3 rounded-full"
                                  style={{ backgroundColor: group?.color ?? "#2563eb" }}
                                />
                                <div className="truncate text-sm font-semibold text-slate-900">Measurement</div>
                              </div>
                              <div className="mt-1 text-xs text-slate-500">
                                {group?.name ?? "Ungrouped"} • {m.type.toUpperCase()}
                              </div>
                              <div className="mt-2 text-sm font-medium text-slate-800">
                                {getMeasurementBadge(m, calibrationScale !== null)}
                              </div>
                            </button>
                            <button
                              type="button"
                              onClick={() => removeMeasurement(m.id)}
                              className="rounded-lg px-2 py-1 text-xs text-rose-600 hover:bg-rose-50"
                            >
                              Delete
                            </button>
                          </div>

                          {active && m.type === "volume" ? (
                            <div className="mt-2 text-xs text-slate-500">
                              Depth: {formatNumber(m.meta?.depth ?? 0)} {calibrationUnit}
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <div className="border-t border-slate-200 bg-slate-50 p-4">
              <div className="mb-3 text-sm font-semibold text-slate-900">Totals</div>
              <div className="max-h-64 space-y-3 overflow-y-auto pr-1">
                {totalsByGroup.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-600">
                    Totals will appear here after you start measuring.
                  </div>
                ) : (
                  totalsByGroup.map((row, index) => (
                    <div key={`${row.group?.id ?? "ungrouped"}-${index}`} className="rounded-2xl border border-slate-200 bg-white p-3">
                      <div className="mb-2 flex items-center gap-2">
                        <div
                          className="h-3 w-3 rounded-full"
                          style={{ backgroundColor: row.group?.color ?? "#64748b" }}
                        />
                        <div className="text-sm font-semibold text-slate-900">
                          {row.group?.name ?? "Ungrouped"}
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="rounded-xl bg-slate-50 px-3 py-2">
                          <div className="text-slate-500">Length</div>
                          <div className="font-semibold text-slate-900">
                            {formatNumber(row.line)} {row.lineUnit}
                          </div>
                        </div>
                        <div className="rounded-xl bg-slate-50 px-3 py-2">
                          <div className="text-slate-500">Area</div>
                          <div className="font-semibold text-slate-900">
                            {formatNumber(row.area)} {row.areaUnit}
                          </div>
                        </div>
                        <div className="rounded-xl bg-slate-50 px-3 py-2">
                          <div className="text-slate-500">Count</div>
                          <div className="font-semibold text-slate-900">
                            {formatNumber(row.count)} {row.countUnit}
                          </div>
                        </div>
                        <div className="rounded-xl bg-slate-50 px-3 py-2">
                          <div className="text-slate-500">Volume</div>
                          <div className="font-semibold text-slate-900">
                            {formatNumber(row.volume)} {row.volumeUnit}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {selectedMeasurement ? (
                <div className="mt-4 rounded-2xl border-2 border-blue-200 bg-gradient-to-br from-blue-50 to-white p-4 shadow-sm">
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-semibold uppercase tracking-wider text-blue-600">Selected</div>
                    <button
                      onClick={() => setSelectedMeasurementId(null)}
                      className="rounded-lg p-1 text-slate-400 hover:bg-blue-100 hover:text-slate-600"
                      title="Deselect"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M18 6L6 18M6 6l12 12" />
                      </svg>
                    </button>
                  </div>

                  <div className="mt-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <div
                        className="h-3 w-3 rounded"
                        style={{
                          backgroundColor: safeGroups.find(g => g.id === selectedMeasurement.group_id)?.color ?? "#2563eb"
                        }}
                      />
                      <div className="flex-1 text-sm font-semibold text-slate-900">
                        {safeGroups.find(g => g.id === selectedMeasurement.group_id)?.name ?? "Measurement"}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 text-xs text-slate-600">
                      <span className="rounded-md bg-slate-100 px-2 py-1 font-medium">
                        {selectedMeasurement.type.toUpperCase()}
                      </span>
                      <span>•</span>
                      <span>Page {selectedMeasurement.page_number}</span>
                    </div>

                    <div className="mt-3 rounded-lg bg-white p-3 shadow-sm">
                      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Value</div>
                      <div className="mt-1 text-xl font-bold text-slate-900">
                        {getMeasurementBadge(selectedMeasurement, calibrationScale !== null)}
                      </div>
                    </div>

                    {selectedMeasurement.meta?.depth && (
                      <div className="rounded-lg bg-white p-2 shadow-sm">
                        <div className="text-xs text-slate-500">Depth: {selectedMeasurement.meta.depth} {calibrationUnit}</div>
                      </div>
                    )}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </aside>
      </div>

      <ExportToBOQModal
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
        projectId={activeProjectId || ""}
        groupSummaries={groupSummariesForExport}
        sessionId={session?.id || ""}
      />

      {cursorScreenPos && (() => {
        let hudContent: React.ReactNode = null;

        if (toolMode === "line" && draftPoints.length > 0 && currentMousePoint) {
          const previewPoints = draftPoints.length === 1
            ? [draftPoints[0], currentMousePoint]
            : [...draftPoints, currentMousePoint];

          const totalLengthPx = polylineLength(previewPoints);
          const lastSegmentPx = draftPoints.length > 0
            ? distanceBetween(draftPoints[draftPoints.length - 1], currentMousePoint)
            : 0;

          const angle = draftPoints.length > 0
            ? calculateAngle(draftPoints[draftPoints.length - 1], currentMousePoint)
            : 0;

          if (calibrationScale) {
            const totalLength = totalLengthPx * calibrationScale;
            const segmentLength = lastSegmentPx * calibrationScale;

            const totalText = calibrationUnit === "ft"
              ? formatFeetInches(totalLength)
              : `${formatNumber(totalLength)} ${calibrationUnit}`;
            const segmentText = calibrationUnit === "ft"
              ? formatFeetInches(segmentLength)
              : `${formatNumber(segmentLength)} ${calibrationUnit}`;

            hudContent = (
              <div className="space-y-1">
                <div className="flex items-center justify-between gap-4">
                  <span className="text-xs text-slate-500">Total:</span>
                  <span className="text-sm font-bold text-slate-900">{totalText}</span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span className="text-xs text-slate-500">Segment:</span>
                  <span className="text-sm font-semibold text-slate-700">{segmentText}</span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span className="text-xs text-slate-500">Angle:</span>
                  <span className="text-sm font-semibold text-slate-700">{formatNumber(angle)}°</span>
                </div>
              </div>
            );
          } else {
            hudContent = (
              <div className="space-y-1">
                <div className="flex items-center justify-between gap-4">
                  <span className="text-xs text-slate-500">Total:</span>
                  <span className="text-sm font-bold text-slate-900">{formatNumber(totalLengthPx)} px</span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span className="text-xs text-slate-500">Segment:</span>
                  <span className="text-sm font-semibold text-slate-700">{formatNumber(lastSegmentPx)} px</span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span className="text-xs text-slate-500">Angle:</span>
                  <span className="text-sm font-semibold text-slate-700">{formatNumber(angle)}°</span>
                </div>
              </div>
            );
          }
        } else if ((toolMode === "area" || toolMode === "volume") && draftPoints.length >= 2 && currentMousePoint) {
          const previewPoints = [...draftPoints, currentMousePoint];
          const areaPx = polygonArea(previewPoints);
          const perimeterPx = polylineLength([...previewPoints, previewPoints[0]]);

          if (toolMode === "volume") {
            const depth = Number(draftVolumeDepth) || 1;
            if (calibrationScale) {
              const realArea = areaPx * calibrationScale * calibrationScale;
              const realVolume = realArea * depth;
              const areaUnit = getAreaUnit(calibrationUnit);
              const volumeUnit = getVolumeUnit(calibrationUnit);

              const depthText = calibrationUnit === "ft"
                ? formatFeetInches(depth)
                : `${depth} ${calibrationUnit}`;

              hudContent = (
                <div className="space-y-1">
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-xs text-slate-500">Area:</span>
                    <span className="text-sm font-semibold text-slate-700">{formatNumber(realArea)} {areaUnit}</span>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-xs text-slate-500">Depth:</span>
                    <span className="text-sm font-semibold text-slate-700">{depthText}</span>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-xs text-slate-500">Volume:</span>
                    <span className="text-sm font-bold text-slate-900">{formatNumber(realVolume)} {volumeUnit}</span>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-xs text-slate-500">Points:</span>
                    <span className="text-sm font-semibold text-slate-700">{draftPoints.length}</span>
                  </div>
                </div>
              );
            } else {
              const volumePx = areaPx * depth;
              hudContent = (
                <div className="space-y-1">
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-xs text-slate-500">Area:</span>
                    <span className="text-sm font-semibold text-slate-700">{formatNumber(areaPx)} px²</span>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-xs text-slate-500">Depth:</span>
                    <span className="text-sm font-semibold text-slate-700">{depth} px</span>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-xs text-slate-500">Volume:</span>
                    <span className="text-sm font-bold text-slate-900">{formatNumber(volumePx)} px³</span>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-xs text-slate-500">Points:</span>
                    <span className="text-sm font-semibold text-slate-700">{draftPoints.length}</span>
                  </div>
                </div>
              );
            }
          } else {
            if (calibrationScale) {
              const realArea = areaPx * calibrationScale * calibrationScale;
              const realPerimeter = perimeterPx * calibrationScale;
              const areaUnit = getAreaUnit(calibrationUnit);

              const perimeterText = calibrationUnit === "ft"
                ? formatFeetInches(realPerimeter)
                : `${formatNumber(realPerimeter)} ${calibrationUnit}`;

              hudContent = (
                <div className="space-y-1">
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-xs text-slate-500">Area:</span>
                    <span className="text-sm font-bold text-slate-900">{formatNumber(realArea)} {areaUnit}</span>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-xs text-slate-500">Perimeter:</span>
                    <span className="text-sm font-semibold text-slate-700">{perimeterText}</span>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-xs text-slate-500">Points:</span>
                    <span className="text-sm font-semibold text-slate-700">{draftPoints.length}</span>
                  </div>
                </div>
              );
            } else {
              hudContent = (
                <div className="space-y-1">
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-xs text-slate-500">Area:</span>
                    <span className="text-sm font-bold text-slate-900">{formatNumber(areaPx)} px²</span>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-xs text-slate-500">Perimeter:</span>
                    <span className="text-sm font-semibold text-slate-700">{formatNumber(perimeterPx)} px</span>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-xs text-slate-500">Points:</span>
                    <span className="text-sm font-semibold text-slate-700">{draftPoints.length}</span>
                  </div>
                </div>
              );
            }
          }
        } else if (toolMode === "calibrate") {
          if (calibrationDraft.p1 && calibrationDraft.p2) {
            const distPx = distanceBetween(calibrationDraft.p1, calibrationDraft.p2);
            const targetDist = calibrationDraft.distanceText || "0";
            const targetUnit = calibrationDraft.unit;
            hudContent = (
              <div className="space-y-1">
                <div className="flex items-center justify-between gap-4">
                  <span className="text-xs text-slate-500">Distance:</span>
                  <span className="text-sm font-bold text-slate-900">{formatNumber(distPx)} px</span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span className="text-xs text-slate-500">Target:</span>
                  <span className="text-sm font-semibold text-slate-700">{targetDist} {targetUnit}</span>
                </div>
              </div>
            );
          } else if (calibrationDraft.p1 && currentMousePoint) {
            const distPx = distanceBetween(calibrationDraft.p1, currentMousePoint);
            hudContent = (
              <div className="space-y-1">
                <div className="flex items-center justify-between gap-4">
                  <span className="text-xs text-slate-500">Distance:</span>
                  <span className="text-sm font-bold text-slate-900">{formatNumber(distPx)} px</span>
                </div>
              </div>
            );
          }
        }

        if (!hudContent) return null;

        const hudWidth = 240;
        const hudHeight = 120;
        const offset = 20;
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;

        let hudX = cursorScreenPos.x + offset;
        let hudY = cursorScreenPos.y + offset;

        if (hudX + hudWidth > viewportWidth - 20) {
          hudX = cursorScreenPos.x - hudWidth - offset;
        }

        if (hudY + hudHeight > viewportHeight - 20) {
          hudY = cursorScreenPos.y - hudHeight - offset;
        }

        if (hudX < 20) hudX = 20;
        if (hudY < 20) hudY = 20;

        return (
          <div
            className="pointer-events-none fixed z-50 rounded-xl border-2 border-blue-300 bg-white px-4 py-3 shadow-2xl"
            style={{
              left: `${hudX}px`,
              top: `${hudY}px`,
            }}
          >
            <div className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-blue-600">
              {toolMode === "calibrate" ? "Calibrating" : "Drawing"}
            </div>
            {hudContent}
          </div>
        );
      })()}
    </div>
  );
}