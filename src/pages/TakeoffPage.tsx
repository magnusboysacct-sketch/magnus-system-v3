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
  project_id: string | null;
  name?: string | null;
  pdf_name?: string | null;
  pdf_bucket?: string | null;
  pdf_path?: string | null;
  pdf_url?: string | null;
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
  name: string;
  color: string;
  sort_order: number;
  unit?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type MeasurementKind = "line" | "area" | "count" | "volume";

type MeasurementRow = {
  id: string;
  session_id: string;
  page_number: number;
  group_id: string | null;
  name: string;
  kind: MeasurementKind;
  points: Point[];
  length_value: number | null;
  area_value: number | null;
  count_value: number | null;
  volume_value: number | null;
  depth_value: number | null;
  unit_label: string | null;
  notes?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
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

const STORAGE_BUCKET_CANDIDATES = ["takeoff-files", "takeoff", "project-files", "documents"];

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

function getMeasurementDisplayValue(measurement: MeasurementRow) {
  switch (measurement.kind) {
    case "line":
      return measurement.length_value ?? 0;
    case "area":
      return measurement.area_value ?? 0;
    case "count":
      return measurement.count_value ?? 0;
    case "volume":
      return measurement.volume_value ?? 0;
    default:
      return 0;
  }
}

function getMeasurementBadge(measurement: MeasurementRow) {
  const value = getMeasurementDisplayValue(measurement);
  const unit = measurement.unit_label ?? "";
  return `${formatNumber(value)} ${unit}`.trim();
}

function buildMeasurementFromDraft(args: {
  id?: string;
  sessionId: string;
  pageNumber: number;
  groupId: string | null;
  name: string;
  kind: MeasurementKind;
  points: Point[];
  scale: number | null;
  baseUnit: UnitSystem;
  depth: number | null;
}): MeasurementRow {
  const { id, sessionId, pageNumber, groupId, name, kind, points, scale, baseUnit, depth } = args;
  const lengthPx = polylineLength(points);
  const areaPx = polygonArea(points);
  const realLength = scale ? lengthPx * scale : 0;
  const realArea = scale ? areaPx * scale * scale : 0;
  const realVolume = scale ? realArea * (depth ?? 0) : 0;

  if (kind === "line") {
    return {
      id: id ?? uid(),
      session_id: sessionId,
      page_number: pageNumber,
      group_id: groupId,
      name,
      kind,
      points,
      length_value: realLength,
      area_value: null,
      count_value: null,
      volume_value: null,
      depth_value: null,
      unit_label: baseUnit,
      updated_at: new Date().toISOString(),
    };
  }

  if (kind === "area") {
    return {
      id: id ?? uid(),
      session_id: sessionId,
      page_number: pageNumber,
      group_id: groupId,
      name,
      kind,
      points,
      length_value: null,
      area_value: realArea,
      count_value: null,
      volume_value: null,
      depth_value: null,
      unit_label: getAreaUnit(baseUnit),
      updated_at: new Date().toISOString(),
    };
  }

  if (kind === "count") {
    return {
      id: id ?? uid(),
      session_id: sessionId,
      page_number: pageNumber,
      group_id: groupId,
      name,
      kind,
      points,
      length_value: null,
      area_value: null,
      count_value: 1,
      volume_value: null,
      depth_value: null,
      unit_label: "ea",
      updated_at: new Date().toISOString(),
    };
  }

  return {
    id: id ?? uid(),
    session_id: sessionId,
    page_number: pageNumber,
    group_id: groupId,
    name,
    kind,
    points,
    length_value: null,
    area_value: realArea,
    count_value: null,
    volume_value: realVolume,
    depth_value: depth ?? 0,
    unit_label: getVolumeUnit(baseUnit),
    updated_at: new Date().toISOString(),
  };
}

async function tryRpc<T = any>(fn: string, params?: Record<string, any>): Promise<T | null> {
  const { data, error } = await supabase.rpc(fn, params ?? {});
  if (error) return null;
  return (data as T) ?? null;
}

async function uploadPdfToStorage(file: File, projectId: string, sessionId: string) {
  const fileExt = file.name.split(".").pop() ?? "pdf";
  const path = `${projectId}/${sessionId}/${Date.now()}-${file.name.replace(/[^\w.-]+/g, "_")}.${fileExt}`;

  for (const bucket of STORAGE_BUCKET_CANDIDATES) {
    const { error } = await supabase.storage.from(bucket).upload(path, file, {
      cacheControl: "3600",
      upsert: true,
      contentType: "application/pdf",
    });

    if (!error) {
      const { data } = supabase.storage.from(bucket).getPublicUrl(path);
      return {
        bucket,
        path,
        publicUrl: data.publicUrl,
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

  const [toolMode, setToolMode] = useState<ToolMode>("select");
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [selectedMeasurementId, setSelectedMeasurementId] = useState<string | null>(null);

  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 24, y: 24 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });

  const [draftPoints, setDraftPoints] = useState<Point[]>([]);
  const [draftVolumeDepth, setDraftVolumeDepth] = useState<string>("1");
  const [measurementCounter, setMeasurementCounter] = useState(1);

  const [calibrationDraft, setCalibrationDraft] = useState<CalibrationDraft>({
    p1: null,
    p2: null,
    distanceText: "1",
    unit: "ft",
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
          const aTime = a.updated_at ? new Date(a.updated_at).getTime() : 0;
          const bTime = b.updated_at ? new Date(b.updated_at).getTime() : 0;
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
      if (m.kind === "line") {
        row.line += m.length_value ?? 0;
        row.lineUnit = m.unit_label ?? row.lineUnit;
      }
      if (m.kind === "area") {
        row.area += m.area_value ?? 0;
        row.areaUnit = m.unit_label ?? row.areaUnit;
      }
      if (m.kind === "count") {
        row.count += m.count_value ?? 0;
        row.countUnit = m.unit_label ?? row.countUnit;
      }
      if (m.kind === "volume") {
        row.volume += m.volume_value ?? 0;
        row.volumeUnit = m.unit_label ?? row.volumeUnit;
      }
    });

    return Array.from(map.values());
  }, [safeMeasurements, safeGroups, calibrationUnit]);

  const currentStageWidth = basePageSize.width * zoom;
  const currentStageHeight = basePageSize.height * zoom;

  const createDefaultGroup = useCallback((sessionId: string) => {
    const next: GroupRow = {
      id: uid(),
      session_id: sessionId,
      name: "General",
      color: COLORS[0],
      sort_order: 1,
      unit: null,
      updated_at: new Date().toISOString(),
    };
    setGroups([next]);
    setSelectedGroupId(next.id);
  }, []);

  const loadSessionData = useCallback(
    async (projectId: string) => {
      setLoading(true);
      setErrorText("");

      try {
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
    name: "Takeoff Session",
  })
  .select("*")
  .single();

            if (insertError) throw insertError;
            sessionRow = inserted as SessionRow;
          }
        }

        setSession(sessionRow);
     setCurrentPage(1);

        let pageData: PageRow[] = [];
        let groupData: GroupRow[] = [];
        let measurementData: MeasurementRow[] = [];

        const rpcPayload = await tryRpc<any>("load_takeoff_session", {
          p_session_id: sessionRow.id,
        });

        if (rpcPayload && typeof rpcPayload === "object") {
          pageData = Array.isArray(rpcPayload.pages) ? rpcPayload.pages : [];
          groupData = Array.isArray(rpcPayload.groups) ? rpcPayload.groups : [];
          measurementData = Array.isArray(rpcPayload.measurements) ? rpcPayload.measurements : [];
        } else {
          const [pagesRes, groupsRes, measurementsRes] = await Promise.all([
            supabase
              .from("takeoff_pages")
              .select("*")
              .eq("session_id", sessionRow.id)
              .order("page_number", { ascending: true }),
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

          if (pagesRes.error) throw pagesRes.error;
          if (groupsRes.error) throw groupsRes.error;
          if (measurementsRes.error) throw measurementsRes.error;

          pageData = (pagesRes.data ?? []) as PageRow[];
          groupData = (groupsRes.data ?? []) as GroupRow[];
          measurementData = (measurementsRes.data ?? []) as MeasurementRow[];
        }

        setPageRows(pageData);
        setGroups(groupData);
        setMeasurements(measurementData);

        if (groupData.length > 0) {
          setSelectedGroupId(groupData[0].id);
        } else {
          createDefaultGroup(sessionRow.id);
        }

        const resolvedPdfUrl =
          sessionRow.pdf_url ||
          (sessionRow.pdf_bucket && sessionRow.pdf_path
            ? supabase.storage.from(sessionRow.pdf_bucket).getPublicUrl(sessionRow.pdf_path).data.publicUrl
            : "");

        setPdfUrl(resolvedPdfUrl ?? "");
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
  name: session.name ?? "Takeoff Session",
  pdf_name: pdfName || session.pdf_name || null,
  pdf_bucket: session.pdf_bucket ?? null,
  pdf_path: session.pdf_path ?? null,
  pdf_url: pdfUrl || session.pdf_url || null,
  updated_at: new Date().toISOString(),
};

        const pagePayload = pageRows.map((p) => ({
          session_id: session.id,
          page_number: p.page_number,
          page_label: p.page_label ?? null,
          width: p.width ?? null,
          height: p.height ?? null,
          calibration_point_1: p.calibration_point_1 ?? null,
          calibration_point_2: p.calibration_point_2 ?? null,
          calibration_distance: p.calibration_distance ?? null,
          calibration_unit: p.calibration_unit ?? null,
          calibration_scale: p.calibration_scale ?? null,
          updated_at: new Date().toISOString(),
        }));

        const groupPayload = groups.map((g, index) => ({
          id: g.id,
          session_id: session.id,
          name: g.name,
          color: g.color,
          sort_order: index + 1,
          unit: g.unit ?? null,
          updated_at: new Date().toISOString(),
        }));

        const measurementPayload = measurements.map((m) => ({
          id: m.id,
          session_id: session.id,
          page_number: m.page_number,
          group_id: m.group_id,
          name: m.name,
          kind: m.kind,
          points: m.points,
          length_value: m.length_value,
          area_value: m.area_value,
          count_value: m.count_value,
          volume_value: m.volume_value,
          depth_value: m.depth_value,
          unit_label: m.unit_label,
          notes: m.notes ?? null,
          updated_at: new Date().toISOString(),
        }));

        const rpcSaved = await tryRpc("save_takeoff_session", {
          p_session: sessionPayload,
          p_pages: pagePayload,
          p_groups: groupPayload,
          p_measurements: measurementPayload,
          p_deleted_group_ids: deletedGroupIdsRef.current,
          p_deleted_measurement_ids: deletedMeasurementIdsRef.current,
        });

        if (!rpcSaved) {
          const [sessionRes, pagesRes, groupsRes, measurementsRes] = await Promise.all([
            supabase.from("takeoff_sessions").upsert(sessionPayload, { onConflict: "id" }),
            pagePayload.length
              ? supabase.from("takeoff_pages").upsert(pagePayload, {
                  onConflict: "session_id,page_number",
                })
              : Promise.resolve({ error: null } as any),
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
          if (pagesRes.error) throw pagesRes.error;
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
        }

        deletedGroupIdsRef.current = [];
        deletedMeasurementIdsRef.current = [];
        setSaveStatus("saved");
      } catch (error: any) {
        setSaveStatus("error");
        setErrorText(error?.message ?? "Autosave failed.");
      }
    }, 700);
  }, [session, currentPage, pageRows, groups, measurements, pdfName, pdfUrl]);

  useEffect(() => {
    if (!session) return;
    queueAutosave();
  }, [session, currentPage, pageRows, groups, measurements, pdfName, pdfUrl, queueAutosave]);

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
      name: `Group ${groups.length + 1}`,
      color: COLORS[groups.length % COLORS.length],
      sort_order: groups.length + 1,
      updated_at: new Date().toISOString(),
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
        pageNumber: currentPage,
        groupId: selectedGroupId ?? safeGroups[0]?.id ?? null,
        name: nextName,
        kind,
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
    [pdfDoc, getPagePointFromEvent, toolMode, finishDraftMeasurement]
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

  const handleWorkspaceMouseDown = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (toolMode !== "hand") return;
      setIsPanning(true);
      setPanStart({
        x: event.clientX - pan.x,
        y: event.clientY - pan.y,
      });
    },
    [toolMode, pan.x, pan.y]
  );

  const handleWorkspaceMouseMove = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (!isPanning || toolMode !== "hand") return;
      setPan({
        x: event.clientX - panStart.x,
        y: event.clientY - panStart.y,
      });
    },
    [isPanning, toolMode, panStart.x, panStart.y]
  );

  const handleWorkspaceMouseUp = useCallback(() => {
    setIsPanning(false);
  }, []);

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
          setPdfUrl(uploaded.publicUrl);
          setPdfName(file.name);
          setSession((prev) =>
            prev
              ? {
                  ...prev,
                  pdf_name: file.name,
                  pdf_bucket: uploaded.bucket,
                  pdf_path: uploaded.path,
                  pdf_url: uploaded.publicUrl,
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
      const value = getMeasurementDisplayValue(m);
      lines.push(
        [
          m.page_number,
          `"${groupName.replace(/"/g, '""')}"`,
          `"${m.name.replace(/"/g, '""')}"`,
          m.kind,
          value,
          `"${(m.unit_label ?? "").replace(/"/g, '""')}"`,
          m.depth_value ?? "",
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
                      ? "bg-slate-900 text-white"
                      : "bg-white text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  {mode === "select" ? "Select" : mode === "hand" ? "Hand" : mode[0].toUpperCase() + mode.slice(1)}
                </button>
              )
            )}
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
              className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800"
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
                        ? "border-slate-900 bg-slate-900 text-white"
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
                      className={`flex h-28 items-center justify-center rounded-xl border text-xs ${
                        active
                          ? "border-white/15 bg-white/5 text-white/80"
                          : "border-slate-200 bg-slate-50 text-slate-500"
                      }`}
                    >
                      Drawing sheet preview
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
                  className="mt-5 rounded-xl bg-slate-900 px-5 py-3 text-sm font-medium text-white hover:bg-slate-800"
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
                      toolMode === "hand"
                        ? isPanning
                          ? "grabbing"
                          : "grab"
                        : toolMode === "select"
                        ? "default"
                        : "crosshair",
                  }}
                  onClick={handleOverlayClick}
                  onDoubleClick={handleOverlayDoubleClick}
                >
                  {pageMeasurements.map((m) => {
                    const groupColor =
                      safeGroups.find((g) => g.id === m.group_id)?.color ?? "#2563eb";
                    const selected = selectedMeasurementId === m.id;

                    if (m.kind === "line") {
                      return (
                        <g key={m.id} onClick={() => setSelectedMeasurementId(m.id)}>
                          <polyline
                            points={linePointsToSvg(m.points)}
                            fill="none"
                            stroke={groupColor}
                            strokeWidth={selected ? 3 : 2}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                          {m.points.map((p, idx) => (
                            <circle
                              key={`${m.id}-${idx}`}
                              cx={p.x}
                              cy={p.y}
                              r={selected ? 4 : 3}
                              fill={groupColor}
                            />
                          ))}
                        </g>
                      );
                    }

                    if (m.kind === "area" || m.kind === "volume") {
                      return (
                        <g key={m.id} onClick={() => setSelectedMeasurementId(m.id)}>
                          <polygon
                            points={polygonPointsToSvg(m.points)}
                            fill={groupColor}
                            fillOpacity={m.kind === "volume" ? 0.22 : 0.16}
                            stroke={groupColor}
                            strokeWidth={selected ? 3 : 2}
                            strokeLinejoin="round"
                          />
                          {m.points.map((p, idx) => (
                            <circle
                              key={`${m.id}-${idx}`}
                              cx={p.x}
                              cy={p.y}
                              r={selected ? 4 : 3}
                              fill={groupColor}
                            />
                          ))}
                        </g>
                      );
                    }

                    return (
                      <g key={m.id} onClick={() => setSelectedMeasurementId(m.id)}>
                        <circle
                          cx={m.points[0]?.x ?? 0}
                          cy={m.points[0]?.y ?? 0}
                          r={selected ? 9 : 7}
                          fill={groupColor}
                          fillOpacity={0.85}
                          stroke="white"
                          strokeWidth={2}
                        />
                      </g>
                    );
                  })}

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

          <div className="grid h-[calc(100vh-145px)] grid-rows-[auto_1fr_auto]">
            <div className="border-b border-slate-200 p-4">
              <div className="mb-3 flex items-center justify-between">
                <div className="text-sm font-semibold text-slate-900">Groups</div>
                <button
                  type="button"
                  onClick={addGroup}
                  className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800"
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
                        active ? "border-slate-900 bg-slate-50" : "border-slate-200 bg-white"
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
                            active ? "border-slate-900 bg-slate-50" : "border-slate-200 bg-white"
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
                                <div className="truncate text-sm font-semibold text-slate-900">{m.name}</div>
                              </div>
                              <div className="mt-1 text-xs text-slate-500">
                                {group?.name ?? "Ungrouped"} • {m.kind.toUpperCase()}
                              </div>
                              <div className="mt-2 text-sm font-medium text-slate-800">
                                {getMeasurementBadge(m)}
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

                          {active && m.kind === "volume" ? (
                            <div className="mt-2 text-xs text-slate-500">
                              Depth: {formatNumber(m.depth_value ?? 0)} {calibrationUnit}
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
                <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-3">
                  <div className="text-sm font-semibold text-slate-900">Selected</div>
                  <div className="mt-2 text-sm font-medium text-slate-800">{selectedMeasurement.name}</div>
                  <div className="mt-1 text-xs text-slate-500">
                    Page {selectedMeasurement.page_number} • {selectedMeasurement.kind.toUpperCase()}
                  </div>
                  <div className="mt-2 text-sm text-slate-700">{getMeasurementBadge(selectedMeasurement)}</div>
                </div>
              ) : null}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}