import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy, type PDFPageProxy } from "pdfjs-dist";
import workerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";

import { MeasurementLayer } from "../features/takeoff/components/MeasurementLayer";
import {
  getOrCreateSession,
  loadTakeoff,
  saveTakeoffDebounced,
  cancelPendingSave,
} from "../features/takeoff/persistence/takeoffPersistence";
import { usePlan } from "../hooks/usePlan";
import PaywallModal from "../components/PaywallModal";
import { supabase } from "../lib/supabase";
import { saveMeasurementsToDB } from "../lib/takeoffDB";

GlobalWorkerOptions.workerSrc = workerSrc;

type Point = { x: number; y: number };

type ToolType = "select" | "calibrate" | "line" | "area" | "count" | "volume" | "pan";

type Group = {
  id: string;
  name: string;
  color?: string;
  notes?: string;
};

type Measurement = {
  id: string;
  type: "line" | "area" | "count" | "volume";
  groupId: string | null;
  page: number;
  points: Point[];
  count?: number;
  depth?: number;
  label?: string;
  createdAt: string;
};

type PdfPageInfo = {
  pageNumber: number;
  width: number;
  height: number;
  thumbUrl?: string;
};

type PersistedTakeoff = {
  fileName?: string | null;
  fileDataUrl?: string | null;
  currentPage?: number;
  zoom?: number;
  panX?: number;
  panY?: number;
  groups?: Group[];
  measurements?: Measurement[];
  activeGroupId?: string | null;
  calibrationPoints?: Point[];
  unitsPerPixel?: number | null;
  calibrationLength?: number | null;
  unitLabel?: string;
  draftPoints?: Point[];
  volumeDepth?: number;
};

const DEFAULT_GROUPS: Group[] = [
  { id: "group-general", name: "General" },
  { id: "group-concrete", name: "Concrete" },
  { id: "group-blockwork", name: "Blockwork" },
  { id: "group-finishes", name: "Finishes" },
];

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const toNumber = (value: unknown, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const uid = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;

const distance = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y);

const polygonAreaPx = (points: Point[]) => {
  if (!Array.isArray(points) || points.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < points.length; i += 1) {
    const p1 = points[i];
    const p2 = points[(i + 1) % points.length];
    sum += p1.x * p2.y - p2.x * p1.y;
  }
  return Math.abs(sum) / 2;
};

const polylineLengthPx = (points: Point[]) => {
  if (!Array.isArray(points) || points.length < 2) return 0;
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    total += distance(points[i - 1], points[i]);
  }
  return total;
};

const formatNumber = (value: number, max = 2) =>
  new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: max,
  }).format(Number.isFinite(value) ? value : 0);

const formatMeasurementValue = (
  m: Measurement,
  unitsPerPixel: number | null,
  unitLabel: string
) => {
  if (!unitsPerPixel || unitsPerPixel <= 0) {
    if (m.type === "count") return `${m.count ?? 1} ct`;
    if (m.type === "line") return `${formatNumber(polylineLengthPx(m.points), 1)} px`;
    if (m.type === "area") return `${formatNumber(polygonAreaPx(m.points), 1)} px²`;
    if (m.type === "volume") return `${formatNumber(polygonAreaPx(m.points) * (m.depth ?? 0), 1)} px³`;
    return "-";
  }

  if (m.type === "count") return `${m.count ?? 1} ct`;

  const pxLength = polylineLengthPx(m.points);
  const pxArea = polygonAreaPx(m.points);
  const lengthValue = pxLength * unitsPerPixel;
  const areaValue = pxArea * unitsPerPixel * unitsPerPixel;

  if (m.type === "line") return `${formatNumber(lengthValue)} ${unitLabel}`;

  if (m.type === "area") return `${formatNumber(areaValue)} ${unitLabel}²`;

  if (m.type === "volume") {
    const depth = toNumber(m.depth, 0);
    const volValue = areaValue * depth;
    return `${formatNumber(volValue)} ${unitLabel}³`;
  }

  return "-";
};

const TakeoffPage: React.FC = () => {
  const navigate = useNavigate();
  const params = useParams();
  const planData = (usePlan?.() as any) ?? {};
  const isPaidPlan =
    Boolean(planData?.isPaid) ||
    Boolean(planData?.canUseTakeoff) ||
    planData?.plan === "pro" ||
    planData?.plan === "business" ||
    planData?.tier === "pro";

  const projectId =
    (params as any)?.projectId ||
    (params as any)?.id ||
    (params as any)?.takeoffId ||
    null;

  const persistenceSessionRef = useRef<any>(null);

  const pdfCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const workspaceRef = useRef<HTMLDivElement | null>(null);
  const pointerStateRef = useRef<{
    dragging: boolean;
    mode: "pan" | "idle";
    startX: number;
    startY: number;
    originPanX: number;
    originPanY: number;
  } | null>(null);

  const [showPaywall, setShowPaywall] = useState(false);

  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null);
  const [pageInfos, setPageInfos] = useState<PdfPageInfo[]>([]);
  const [currentPage, setCurrentPage] = useState(1);

  const [fileName, setFileName] = useState<string>("");
  const [fileDataUrl, setFileDataUrl] = useState<string | null>(null);

  const [renderedPageSize, setRenderedPageSize] = useState({ width: 1, height: 1 });

  const [zoom, setZoom] = useState(1);
  const [fitZoom, setFitZoom] = useState(1);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);

  const [tool, setTool] = useState<ToolType>("select");
  const [draftPoints, setDraftPoints] = useState<Point[]>([]);

  const [groups, setGroups] = useState<Group[]>(DEFAULT_GROUPS);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(DEFAULT_GROUPS[0].id);

  const [measurements, setMeasurements] = useState<Measurement[]>([]);

  const [unitsPerPixel, setUnitsPerPixel] = useState<number | null>(null);
  const [unitLabel, setUnitLabel] = useState("ft");
  const [calibrationPoints, setCalibrationPoints] = useState<Point[]>([]);
  const [calibrationLength, setCalibrationLength] = useState<number>(10);
  const [showCalibrationPanel, setShowCalibrationPanel] = useState(false);

  const [volumeDepth, setVolumeDepth] = useState<number>(1);

  const safeGroups = useMemo<Group[]>(
    () => (Array.isArray(groups) ? groups.filter(Boolean) : []),
    [groups]
  );

  const safeMeasurements = useMemo<Measurement[]>(
    () =>
      Array.isArray(measurements)
        ? measurements.filter(
            (m): m is Measurement =>
              Boolean(m) &&
              Array.isArray(m.points) &&
              typeof m.page === "number" &&
              typeof m.type === "string"
          )
        : [],
    [measurements]
  );

  const currentPageMeasurements = useMemo(
    () => safeMeasurements.filter((m) => m.page === currentPage),
    [safeMeasurements, currentPage]
  );

  const pageInfo = useMemo(
    () => pageInfos.find((p) => p.pageNumber === currentPage) ?? null,
    [pageInfos, currentPage]
  );

  const currentGroup = useMemo(
    () => safeGroups.find((g) => g.id === activeGroupId) ?? null,
    [safeGroups, activeGroupId]
  );

  const totalsByGroup = useMemo(() => {
    const map = new Map<
      string,
      {
        group: Group | null;
        line: number;
        area: number;
        volume: number;
        count: number;
      }
    >();

    const ensure = (groupId: string | null) => {
      const key = groupId ?? "ungrouped";
      if (!map.has(key)) {
        map.set(key, {
          group: safeGroups.find((g) => g.id === groupId) ?? null,
          line: 0,
          area: 0,
          volume: 0,
          count: 0,
        });
      }
      return map.get(key)!;
    };

    for (const m of safeMeasurements) {
      const entry = ensure(m.groupId ?? null);

      if (m.type === "count") {
        entry.count += m.count ?? 1;
        continue;
      }

      if (!unitsPerPixel || unitsPerPixel <= 0) continue;

      const pxLen = polylineLengthPx(m.points);
      const pxArea = polygonAreaPx(m.points);

      if (m.type === "line") {
        entry.line += pxLen * unitsPerPixel;
      } else if (m.type === "area") {
        entry.area += pxArea * unitsPerPixel * unitsPerPixel;
      } else if (m.type === "volume") {
        entry.volume += pxArea * unitsPerPixel * unitsPerPixel * toNumber(m.depth, 0);
      }
    }

    return Array.from(map.values());
  }, [safeMeasurements, safeGroups, unitsPerPixel]);

  const viewMeasurements = useMemo(() => {
    return currentPageMeasurements.map((m) => ({
      ...m,
      valueText: formatMeasurementValue(m, unitsPerPixel, unitLabel),
      groupName: safeGroups.find((g) => g.id === m.groupId)?.name ?? "Ungrouped",
    }));
  }, [currentPageMeasurements, safeGroups, unitsPerPixel, unitLabel]);

  const loadPdfFromDataUrl = useCallback(async (dataUrl: string) => {
    const loadingTask = getDocument(dataUrl);
    const doc = await loadingTask.promise;
    setPdfDoc(doc);

    const infos: PdfPageInfo[] = [];
    for (let i = 1; i <= doc.numPages; i += 1) {
      const page = await doc.getPage(i);
      const viewport = page.getViewport({ scale: 1 });
      infos.push({
        pageNumber: i,
        width: viewport.width,
        height: viewport.height,
      });
    }
    setPageInfos(infos);
  }, []);

  const renderCurrentPage = useCallback(async () => {
    if (!pdfDoc || !pdfCanvasRef.current) return;
    const page: PDFPageProxy = await pdfDoc.getPage(currentPage);
    const viewport = page.getViewport({ scale: zoom });

    const canvas = pdfCanvasRef.current;
    const context = canvas.getContext("2d");
    if (!context) return;

    canvas.width = Math.max(1, Math.floor(viewport.width));
    canvas.height = Math.max(1, Math.floor(viewport.height));
    canvas.style.width = `${viewport.width}px`;
    canvas.style.height = `${viewport.height}px`;

    setRenderedPageSize({ width: viewport.width, height: viewport.height });

    await page.render({
      canvasContext: context,
      viewport,
    }).promise;
  }, [pdfDoc, currentPage, zoom]);

  const fitToWorkspace = useCallback(() => {
    if (!pageInfo || !workspaceRef.current) return;

    const container = workspaceRef.current;
    const padding = 40;
    const availableWidth = Math.max(100, container.clientWidth - padding);
    const availableHeight = Math.max(100, container.clientHeight - padding);

    const nextFitZoom = Math.min(
      availableWidth / Math.max(1, pageInfo.width),
      availableHeight / Math.max(1, pageInfo.height)
    );

    const normalized = clamp(nextFitZoom, 0.2, 5);
    setFitZoom(normalized);
    setZoom(normalized);
    setPanX(0);
    setPanY(0);
  }, [pageInfo]);

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const api = {
          getOrCreateSession,
          loadTakeoff,
        } as any;

        if (typeof api.getOrCreateSession === "function") {
          persistenceSessionRef.current = await api.getOrCreateSession({
            projectId,
            page: "takeoff",
          });
        }

        let persisted: PersistedTakeoff | null = null;
        if (typeof api.loadTakeoff === "function") {
          persisted = await api.loadTakeoff(persistenceSessionRef.current ?? { projectId });
        }

        if (!mounted || !persisted) return;

        if (persisted.fileDataUrl) {
          setFileDataUrl(persisted.fileDataUrl);
          setFileName(persisted.fileName ?? "");
          await loadPdfFromDataUrl(persisted.fileDataUrl);
        }

        setCurrentPage(toNumber(persisted.currentPage, 1));
        setZoom(toNumber(persisted.zoom, 1));
        setPanX(toNumber(persisted.panX, 0));
        setPanY(toNumber(persisted.panY, 0));
        setGroups(
          Array.isArray(persisted.groups) && persisted.groups.length
            ? persisted.groups
            : DEFAULT_GROUPS
        );
        setMeasurements(Array.isArray(persisted.measurements) ? persisted.measurements : []);
        setActiveGroupId(persisted.activeGroupId ?? DEFAULT_GROUPS[0].id);
        setCalibrationPoints(Array.isArray(persisted.calibrationPoints) ? persisted.calibrationPoints : []);
        setUnitsPerPixel(
          typeof persisted.unitsPerPixel === "number" && persisted.unitsPerPixel > 0
            ? persisted.unitsPerPixel
            : null
        );
        setCalibrationLength(toNumber(persisted.calibrationLength, 10));
        setUnitLabel(persisted.unitLabel || "ft");
        setDraftPoints(Array.isArray(persisted.draftPoints) ? persisted.draftPoints : []);
        setVolumeDepth(toNumber(persisted.volumeDepth, 1));
      } catch (error) {
        console.error("Takeoff restore failed:", error);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [projectId, loadPdfFromDataUrl]);

  useEffect(() => {
    renderCurrentPage().catch((error) => console.error("PDF render failed:", error));
  }, [renderCurrentPage]);

  useEffect(() => {
    if (!pageInfo) return;
    fitToWorkspace();
  }, [pageInfo, fitToWorkspace]);

  useEffect(() => {
    const payload: PersistedTakeoff = {
      fileName,
      fileDataUrl,
      currentPage,
      zoom,
      panX,
      panY,
      groups: safeGroups,
      measurements: safeMeasurements,
      activeGroupId,
      calibrationPoints,
      unitsPerPixel,
      calibrationLength,
      unitLabel,
      draftPoints,
      volumeDepth,
    };

    try {
      const api = { saveTakeoffDebounced } as any;
      if (typeof api.saveTakeoffDebounced === "function") {
        api.saveTakeoffDebounced(persistenceSessionRef.current ?? { projectId }, payload);
      }
    } catch (error) {
      console.error("Takeoff autosave failed:", error);
    }
  }, [
    fileName,
    fileDataUrl,
    currentPage,
    zoom,
    panX,
    panY,
    safeGroups,
    safeMeasurements,
    activeGroupId,
    calibrationPoints,
    unitsPerPixel,
    calibrationLength,
    unitLabel,
    draftPoints,
    volumeDepth,
    projectId,
  ]);

  useEffect(() => {
    return () => {
      try {
        const api = { cancelPendingSave } as any;
        if (typeof api.cancelPendingSave === "function") {
          api.cancelPendingSave(persistenceSessionRef.current ?? { projectId });
        }
      } catch (error) {
        console.error("Cancel pending save failed:", error);
      }
    };
  }, [projectId]);

  const pageToWorldScale = zoom;

  const clientToPagePoint = useCallback(
    (clientX: number, clientY: number): Point | null => {
      const canvas = pdfCanvasRef.current;
      const workspace = workspaceRef.current;
      if (!canvas || !workspace) return null;

      const canvasRect = canvas.getBoundingClientRect();
      const x = (clientX - canvasRect.left) / Math.max(pageToWorldScale, 0.0001);
      const y = (clientY - canvasRect.top) / Math.max(pageToWorldScale, 0.0001);

      if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
      return { x, y };
    },
    [pageToWorldScale]
  );

  const finalizeLineMeasurement = useCallback(
    (points: Point[]) => {
      if (points.length < 2) return;
      setMeasurements((prev) => [
        ...prev,
        {
          id: uid("m"),
          type: "line",
          groupId: activeGroupId,
          page: currentPage,
          points: points.slice(0, 2),
          createdAt: new Date().toISOString(),
        },
      ]);
      setDraftPoints([]);
    },
    [activeGroupId, currentPage]
  );

  const finalizeAreaMeasurement = useCallback(
    (points: Point[]) => {
      if (points.length < 3) return;
      setMeasurements((prev) => [
        ...prev,
        {
          id: uid("m"),
          type: "area",
          groupId: activeGroupId,
          page: currentPage,
          points: [...points],
          createdAt: new Date().toISOString(),
        },
      ]);
      setDraftPoints([]);
    },
    [activeGroupId, currentPage]
  );

  const finalizeVolumeMeasurement = useCallback(
    (points: Point[]) => {
      if (points.length < 3) return;
      setMeasurements((prev) => [
        ...prev,
        {
          id: uid("m"),
          type: "volume",
          groupId: activeGroupId,
          page: currentPage,
          points: [...points],
          depth: toNumber(volumeDepth, 0),
          createdAt: new Date().toISOString(),
        },
      ]);
      setDraftPoints([]);
    },
    [activeGroupId, currentPage, volumeDepth]
  );

  const addCountMeasurement = useCallback(
    (point: Point) => {
      setMeasurements((prev) => [
        ...prev,
        {
          id: uid("m"),
          type: "count",
          groupId: activeGroupId,
          page: currentPage,
          points: [point],
          count: 1,
          createdAt: new Date().toISOString(),
        },
      ]);
    },
    [activeGroupId, currentPage]
  );

  const handleCanvasClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!pdfDoc) return;

      if (!isPaidPlan && (tool === "line" || tool === "area" || tool === "count" || tool === "volume")) {
        setShowPaywall(true);
        return;
      }

      const point = clientToPagePoint(e.clientX, e.clientY);
      if (!point) return;

      if (tool === "calibrate") {
        setCalibrationPoints((prev) => {
          const next = [...prev, point].slice(-2);
          return next;
        });
        setShowCalibrationPanel(true);
        return;
      }

      if (tool === "count") {
        addCountMeasurement(point);
        return;
      }

      if (tool === "line") {
        const next = [...draftPoints, point];
        if (next.length >= 2) {
          finalizeLineMeasurement(next);
        } else {
          setDraftPoints(next);
        }
        return;
      }

      if (tool === "area" || tool === "volume") {
        setDraftPoints((prev) => [...prev, point]);
      }
    },
    [
      pdfDoc,
      tool,
      clientToPagePoint,
      addCountMeasurement,
      draftPoints,
      finalizeLineMeasurement,
      isPaidPlan,
    ]
  );

  const handleCanvasDoubleClick = useCallback(() => {
    if (tool === "area") {
      finalizeAreaMeasurement(draftPoints);
    } else if (tool === "volume") {
      finalizeVolumeMeasurement(draftPoints);
    }
  }, [tool, draftPoints, finalizeAreaMeasurement, finalizeVolumeMeasurement]);

  const applyCalibration = useCallback(() => {
    if (calibrationPoints.length !== 2) return;
    const pxDistance = distance(calibrationPoints[0], calibrationPoints[1]);
    if (pxDistance <= 0) return;
    const realDistance = toNumber(calibrationLength, 0);
    if (realDistance <= 0) return;

    setUnitsPerPixel(realDistance / pxDistance);
    setShowCalibrationPanel(false);
    setTool("select");
  }, [calibrationPoints, calibrationLength]);

  const handleFileSelect = useCallback(
    async (file: File | null) => {
      if (!file) return;
      setFileName(file.name);

      const dataUrl: string = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result ?? ""));
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      setFileDataUrl(dataUrl);
      await loadPdfFromDataUrl(dataUrl);
      setCurrentPage(1);
      setDraftPoints([]);
      setMeasurements([]);
      setCalibrationPoints([]);
      setUnitsPerPixel(null);
      setPanX(0);
      setPanY(0);
    },
    [loadPdfFromDataUrl]
  );

  const deleteMeasurement = useCallback((id: string) => {
    setMeasurements((prev) => prev.filter((m) => m.id !== id));
  }, []);

  const addGroup = useCallback(() => {
    const name = window.prompt("Enter group name", `Group ${safeGroups.length + 1}`);
    if (!name?.trim()) return;
    const next: Group = {
      id: uid("group"),
      name: name.trim(),
    };
    setGroups((prev) => [...prev, next]);
    setActiveGroupId(next.id);
  }, [safeGroups.length]);

  const renameGroup = useCallback((groupId: string) => {
    const current = safeGroups.find((g) => g.id === groupId);
    if (!current) return;
    const name = window.prompt("Rename group", current.name);
    if (!name?.trim()) return;
    setGroups((prev) =>
      prev.map((g) => (g.id === groupId ? { ...g, name: name.trim() } : g))
    );
  }, [safeGroups]);

  const deleteGroup = useCallback(
    (groupId: string) => {
      if (!window.confirm("Delete this group? Measurements will become ungrouped.")) return;
      setGroups((prev) => prev.filter((g) => g.id !== groupId));
      setMeasurements((prev) =>
        prev.map((m) => (m.groupId === groupId ? { ...m, groupId: null } : m))
      );
      if (activeGroupId === groupId) {
        setActiveGroupId(DEFAULT_GROUPS[0]?.id ?? null);
      }
    },
    [activeGroupId]
  );

  const saveToDatabaseNow = useCallback(async () => {
    try {
      const payload = {
        project_id: projectId,
        file_name: fileName || null,
        page_count: pageInfos.length,
        measurements: safeMeasurements,
        groups: safeGroups,
        units_per_pixel: unitsPerPixel,
        unit_label: unitLabel,
        current_page: currentPage,
      };

      try {
        const api = { saveMeasurementsToDB } as any;
        if (typeof api.saveMeasurementsToDB === "function") {
          await api.saveMeasurementsToDB(payload);
          return;
        }
      } catch (err) {
        console.warn("saveMeasurementsToDB failed, falling back to Supabase insert:", err);
      }

      await supabase.from("takeoff_sessions").upsert({
        project_id: projectId,
        file_name: fileName || null,
        data: payload,
        updated_at: new Date().toISOString(),
      });
    } catch (error) {
      console.error("Save to database failed:", error);
      window.alert("Save failed. Check console for details.");
    }
  }, [
    projectId,
    fileName,
    pageInfos.length,
    safeMeasurements,
    safeGroups,
    unitsPerPixel,
    unitLabel,
    currentPage,
  ]);

  const exportCsv = useCallback(() => {
    const rows = [
      [
        "Measurement ID",
        "Type",
        "Group",
        "Page",
        "Points",
        "Depth",
        "Value",
        "Created At",
      ],
      ...safeMeasurements.map((m) => [
        m.id,
        m.type,
        safeGroups.find((g) => g.id === m.groupId)?.name ?? "Ungrouped",
        String(m.page),
        JSON.stringify(m.points),
        String(m.depth ?? ""),
        formatMeasurementValue(m, unitsPerPixel, unitLabel),
        m.createdAt,
      ]),
    ];

    const csv = rows
      .map((row) =>
        row
          .map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`)
          .join(",")
      )
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = `${fileName?.replace(/\.pdf$/i, "") || "takeoff"}-measurements.csv`;
    a.click();

    URL.revokeObjectURL(url);
  }, [safeMeasurements, safeGroups, unitsPerPixel, unitLabel, fileName]);

  const zoomIn = useCallback(() => setZoom((z) => clamp(z * 1.15, 0.2, 10)), []);
  const zoomOut = useCallback(() => setZoom((z) => clamp(z / 1.15, 0.2, 10)), []);

  const startPan = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (tool !== "pan" && tool !== "select") return;
    pointerStateRef.current = {
      dragging: true,
      mode: "pan",
      startX: e.clientX,
      startY: e.clientY,
      originPanX: panX,
      originPanY: panY,
    };
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
  }, [tool, panX, panY]);

  const movePan = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const state = pointerStateRef.current;
    if (!state?.dragging || state.mode !== "pan") return;
    const dx = e.clientX - state.startX;
    const dy = e.clientY - state.startY;
    setPanX(state.originPanX + dx);
    setPanY(state.originPanY + dy);
  }, []);

  const endPan = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const state = pointerStateRef.current;
    if (state?.dragging) {
      pointerStateRef.current = null;
      try {
        (e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId);
      } catch {
        //
      }
    }
  }, []);

  return (
    <div className="h-screen w-full bg-slate-100 text-slate-900 flex flex-col overflow-hidden">
      <div className="border-b border-slate-200 bg-white">
        <div className="flex items-center gap-3 px-4 py-3">
          <button
            onClick={() => navigate(-1)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-50"
          >
            Back
          </button>

          <label className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-50 cursor-pointer">
            Upload PDF
            <input
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={(e) => handleFileSelect(e.target.files?.[0] ?? null)}
            />
          </label>

          <div className="h-6 w-px bg-slate-200" />

          <button
            onClick={() => setTool("select")}
            className={`rounded-lg px-3 py-2 text-sm font-medium ${
              tool === "select" ? "bg-slate-900 text-white" : "border border-slate-300 hover:bg-slate-50"
            }`}
          >
            Select
          </button>
          <button
            onClick={() => setTool("pan")}
            className={`rounded-lg px-3 py-2 text-sm font-medium ${
              tool === "pan" ? "bg-slate-900 text-white" : "border border-slate-300 hover:bg-slate-50"
            }`}
          >
            Pan
          </button>
          <button
            onClick={() => {
              setTool("calibrate");
              setShowCalibrationPanel(true);
              setCalibrationPoints([]);
            }}
            className={`rounded-lg px-3 py-2 text-sm font-medium ${
              tool === "calibrate" ? "bg-blue-600 text-white" : "border border-slate-300 hover:bg-slate-50"
            }`}
          >
            Calibrate
          </button>
          <button
            onClick={() => setTool("line")}
            className={`rounded-lg px-3 py-2 text-sm font-medium ${
              tool === "line" ? "bg-emerald-600 text-white" : "border border-slate-300 hover:bg-slate-50"
            }`}
          >
            Line
          </button>
          <button
            onClick={() => setTool("area")}
            className={`rounded-lg px-3 py-2 text-sm font-medium ${
              tool === "area" ? "bg-amber-600 text-white" : "border border-slate-300 hover:bg-slate-50"
            }`}
          >
            Area
          </button>
          <button
            onClick={() => setTool("count")}
            className={`rounded-lg px-3 py-2 text-sm font-medium ${
              tool === "count" ? "bg-violet-600 text-white" : "border border-slate-300 hover:bg-slate-50"
            }`}
          >
            Count
          </button>
          <button
            onClick={() => setTool("volume")}
            className={`rounded-lg px-3 py-2 text-sm font-medium ${
              tool === "volume" ? "bg-rose-600 text-white" : "border border-slate-300 hover:bg-slate-50"
            }`}
          >
            Volume
          </button>

          <div className="h-6 w-px bg-slate-200" />

          <button
            onClick={zoomOut}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-50"
          >
            −
          </button>
          <div className="min-w-[72px] text-center text-sm font-medium">
            {formatNumber(zoom * 100, 0)}%
          </div>
          <button
            onClick={zoomIn}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-50"
          >
            +
          </button>
          <button
            onClick={fitToWorkspace}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-50"
          >
            Fit
          </button>

          <div className="ml-auto flex items-center gap-2">
            <select
              value={activeGroupId ?? ""}
              onChange={(e) => setActiveGroupId(e.target.value || null)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
            >
              {safeGroups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
              {!safeGroups.length && <option value="">No groups</option>}
            </select>

            {tool === "volume" && (
              <div className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2">
                <span className="text-sm text-slate-500">Depth</span>
                <input
                  type="number"
                  step="0.01"
                  value={volumeDepth}
                  onChange={(e) => setVolumeDepth(toNumber(e.target.value, 1))}
                  className="w-20 rounded border border-slate-300 px-2 py-1 text-sm"
                />
                <span className="text-sm text-slate-500">{unitLabel}</span>
              </div>
            )}

            <button
              onClick={exportCsv}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-50"
            >
              Export CSV
            </button>
            <button
              onClick={saveToDatabaseNow}
              className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
            >
              Save
            </button>
          </div>
        </div>

        <div className="flex items-center gap-4 border-t border-slate-100 px-4 py-2 text-xs text-slate-500">
          <span>File: {fileName || "No PDF loaded"}</span>
          <span>Page: {currentPage}/{pageInfos.length || 0}</span>
          <span>
            Scale:{" "}
            {unitsPerPixel ? `1 px = ${formatNumber(unitsPerPixel, 4)} ${unitLabel}` : "Not calibrated"}
          </span>
          <span>Tool: {tool}</span>
          {currentGroup && <span>Group: {currentGroup.name}</span>}
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        <aside className="w-[260px] min-w-[260px] border-r border-slate-200 bg-white flex flex-col">
          <div className="border-b border-slate-200 px-4 py-3">
            <div className="text-sm font-semibold text-slate-900">Pages</div>
            <div className="mt-1 text-xs text-slate-500">Navigate PDF sheets</div>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {pageInfos.map((p) => (
              <button
                key={p.pageNumber}
                onClick={() => {
                  setCurrentPage(p.pageNumber);
                  setDraftPoints([]);
                }}
                className={`w-full rounded-xl border p-3 text-left transition ${
                  p.pageNumber === currentPage
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-200 bg-slate-50 hover:bg-slate-100"
                }`}
              >
                <div className="text-sm font-semibold">Page {p.pageNumber}</div>
                <div className={`mt-1 text-xs ${p.pageNumber === currentPage ? "text-slate-200" : "text-slate-500"}`}>
                  {Math.round(p.width)} × {Math.round(p.height)}
                </div>
                <div className={`mt-2 text-xs ${p.pageNumber === currentPage ? "text-slate-300" : "text-slate-400"}`}>
                  {safeMeasurements.filter((m) => m.page === p.pageNumber).length} measurements
                </div>
              </button>
            ))}
          </div>

          <div className="border-t border-slate-200 px-4 py-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold text-slate-900">Groups</div>
                <div className="text-xs text-slate-500">Organize takeoff items</div>
              </div>
              <button
                onClick={addGroup}
                className="rounded-lg border border-slate-300 px-2 py-1 text-xs font-medium hover:bg-slate-50"
              >
                Add
              </button>
            </div>

            <div className="mt-3 space-y-2">
              {safeGroups.map((g) => {
                const count = safeMeasurements.filter((m) => m.groupId === g.id).length;
                return (
                  <div
                    key={g.id}
                    className={`rounded-xl border p-2 ${
                      g.id === activeGroupId ? "border-slate-900 bg-slate-50" : "border-slate-200"
                    }`}
                  >
                    <button
                      onClick={() => setActiveGroupId(g.id)}
                      className="w-full text-left"
                    >
                      <div className="text-sm font-medium">{g.name}</div>
                      <div className="text-xs text-slate-500">{count} items</div>
                    </button>
                    <div className="mt-2 flex gap-2">
                      <button
                        onClick={() => renameGroup(g.id)}
                        className="rounded-md border border-slate-300 px-2 py-1 text-[11px] hover:bg-slate-50"
                      >
                        Rename
                      </button>
                      <button
                        onClick={() => deleteGroup(g.id)}
                        className="rounded-md border border-red-200 px-2 py-1 text-[11px] text-red-600 hover:bg-red-50"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </aside>

        <main className="min-w-0 flex-1 bg-slate-200 relative">
          <div
            ref={workspaceRef}
            className="absolute inset-0 overflow-hidden"
          >
            <div
              className="absolute left-1/2 top-1/2"
              style={{
                transform: `translate(calc(-50% + ${panX}px), calc(-50% + ${panY}px))`,
              }}
            >
              <div
                className="relative origin-center"
                style={{
                  transform: `scale(${zoom})`,
                  width: pageInfo?.width ?? renderedPageSize.width,
                  height: pageInfo?.height ?? renderedPageSize.height,
                }}
                onClick={handleCanvasClick}
                onDoubleClick={handleCanvasDoubleClick}
                onPointerDown={startPan}
                onPointerMove={movePan}
                onPointerUp={endPan}
                onPointerLeave={endPan}
              >
                <canvas
                  ref={pdfCanvasRef}
                  className="block bg-white shadow-2xl"
                />

                <div className="absolute inset-0">
                  {React.createElement(MeasurementLayer as any, {
                    measurements: currentPageMeasurements,
                    draftPoints,
                    tool,
                    zoom,
                    panX: 0,
                    panY: 0,
                    pageWidth: pageInfo?.width ?? renderedPageSize.width,
                    pageHeight: pageInfo?.height ?? renderedPageSize.height,
                    unitsPerPixel,
                    unitLabel,
                  })}
                </div>
              </div>
            </div>
          </div>

          {tool === "area" && draftPoints.length > 0 && (
            <div className="absolute bottom-4 left-4 rounded-xl border border-amber-200 bg-white px-4 py-3 shadow-lg">
              <div className="text-sm font-semibold text-slate-900">Area Draft</div>
              <div className="mt-1 text-xs text-slate-500">
                Click to add points. Double-click to finish polygon.
              </div>
              <div className="mt-2 flex gap-2">
                <button
                  onClick={() => finalizeAreaMeasurement(draftPoints)}
                  className="rounded-lg bg-amber-600 px-3 py-2 text-xs font-medium text-white"
                >
                  Finish
                </button>
                <button
                  onClick={() => setDraftPoints([])}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {tool === "volume" && draftPoints.length > 0 && (
            <div className="absolute bottom-4 left-4 rounded-xl border border-rose-200 bg-white px-4 py-3 shadow-lg">
              <div className="text-sm font-semibold text-slate-900">Volume Draft</div>
              <div className="mt-1 text-xs text-slate-500">
                Click to add points. Double-click to finish polygon.
              </div>
              <div className="mt-2 flex gap-2">
                <button
                  onClick={() => finalizeVolumeMeasurement(draftPoints)}
                  className="rounded-lg bg-rose-600 px-3 py-2 text-xs font-medium text-white"
                >
                  Finish
                </button>
                <button
                  onClick={() => setDraftPoints([])}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {showCalibrationPanel && (
            <div className="absolute right-4 top-4 w-[320px] rounded-2xl border border-blue-200 bg-white p-4 shadow-2xl">
              <div className="text-base font-semibold text-slate-900">Calibration</div>
              <div className="mt-1 text-sm text-slate-500">
                Pick two points on the drawing, then enter the real-world distance.
              </div>

              <div className="mt-4 space-y-3">
                <div>
                  <div className="mb-1 text-xs font-medium text-slate-500">Point status</div>
                  <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm">
                    {calibrationPoints.length}/2 points selected
                  </div>
                </div>

                <div className="grid grid-cols-[1fr_92px] gap-2">
                  <div>
                    <div className="mb-1 text-xs font-medium text-slate-500">Known distance</div>
                    <input
                      type="number"
                      step="0.01"
                      value={calibrationLength}
                      onChange={(e) => setCalibrationLength(toNumber(e.target.value, 10))}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                  </div>

                  <div>
                    <div className="mb-1 text-xs font-medium text-slate-500">Unit</div>
                    <select
                      value={unitLabel}
                      onChange={(e) => setUnitLabel(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    >
                      <option value="ft">ft</option>
                      <option value="in">in</option>
                      <option value="m">m</option>
                      <option value="mm">mm</option>
                      <option value="yd">yd</option>
                    </select>
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={applyCalibration}
                    disabled={calibrationPoints.length !== 2}
                    className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                  >
                    Apply
                  </button>
                  <button
                    onClick={() => {
                      setCalibrationPoints([]);
                      setShowCalibrationPanel(false);
                      setTool("select");
                    }}
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}
        </main>

        <aside className="w-[360px] min-w-[360px] border-l border-slate-200 bg-white flex flex-col">
          <div className="border-b border-slate-200 px-4 py-3">
            <div className="text-sm font-semibold text-slate-900">Totals & Measurements</div>
            <div className="mt-1 text-xs text-slate-500">
              Review current page items and grouped totals
            </div>
          </div>

          <div className="border-b border-slate-200 p-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-slate-50 p-3">
                <div className="text-xs text-slate-500">Current Page</div>
                <div className="mt-1 text-xl font-semibold text-slate-900">
                  {currentPageMeasurements.length}
                </div>
              </div>
              <div className="rounded-2xl bg-slate-50 p-3">
                <div className="text-xs text-slate-500">All Measurements</div>
                <div className="mt-1 text-xl font-semibold text-slate-900">
                  {safeMeasurements.length}
                </div>
              </div>
            </div>

            <div className="mt-4 space-y-2">
              {totalsByGroup.map((entry, idx) => (
                <div key={`${entry.group?.id ?? "ungrouped"}-${idx}`} className="rounded-xl border border-slate-200 p-3">
                  <div className="text-sm font-semibold text-slate-900">
                    {entry.group?.name ?? "Ungrouped"}
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-slate-600">
                    <div>Line: {formatNumber(entry.line)} {unitLabel}</div>
                    <div>Area: {formatNumber(entry.area)} {unitLabel}²</div>
                    <div>Volume: {formatNumber(entry.volume)} {unitLabel}³</div>
                    <div>Count: {formatNumber(entry.count, 0)}</div>
                  </div>
                </div>
              ))}
              {!totalsByGroup.length && (
                <div className="rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-500">
                  No totals yet.
                </div>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-sm font-semibold text-slate-900">Page {currentPage} items</div>
              {draftPoints.length > 0 && (
                <button
                  onClick={() => setDraftPoints([])}
                  className="rounded-lg border border-slate-300 px-2 py-1 text-xs font-medium hover:bg-slate-50"
                >
                  Clear Draft
                </button>
              )}
            </div>

            <div className="space-y-3">
              {viewMeasurements.map((m) => (
                <div key={m.id} className="rounded-2xl border border-slate-200 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold capitalize text-slate-900">
                        {m.type}
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
                        {m.groupName} • {m.valueText}
                      </div>
                    </div>

                    <button
                      onClick={() => deleteMeasurement(m.id)}
                      className="rounded-md border border-red-200 px-2 py-1 text-[11px] font-medium text-red-600 hover:bg-red-50"
                    >
                      Delete
                    </button>
                  </div>

                  <div className="mt-2 text-xs text-slate-500">
                    Points: {m.points.length}
                    {m.type === "volume" ? ` • Depth: ${formatNumber(toNumber(m.depth, 0))} ${unitLabel}` : ""}
                  </div>
                  <div className="mt-1 text-[11px] text-slate-400">
                    {new Date(m.createdAt).toLocaleString()}
                  </div>
                </div>
              ))}

              {!viewMeasurements.length && (
                <div className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
                  No measurements on this page yet.
                </div>
              )}
            </div>
          </div>
        </aside>
      </div>

      {React.createElement(PaywallModal as any, {
        open: showPaywall,
        onClose: () => setShowPaywall(false),
      })}
    </div>
  );
};

export default TakeoffPage;