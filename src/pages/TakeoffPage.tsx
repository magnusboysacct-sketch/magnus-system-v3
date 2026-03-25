import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { GlobalWorkerOptions, getDocument } from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";

GlobalWorkerOptions.workerSrc = pdfWorker;

type SaveState = "idle" | "saving" | "saved" | "error";
type ToolMode = "pan" | "line" | "area" | "count";
type RightTab = "measurements" | "library" | "details" | "settings";
type PickerMode = "items" | "assemblies";

type AssetKind = "image";

type DrawingAsset = {
  kind: AssetKind;
  name: string;
  dataUrl: string;
  mimeType?: string | null;
  width?: number | null;
  height?: number | null;
  sourceKind?: "image" | "pdf";
  sourceFileName?: string | null;
  sourcePageNumber?: number | null;
};

type MeasurementType = "line" | "area" | "count";

type Point = {
  x: number;
  y: number;
};

type LinkedResource = {
  type: "item" | "assembly";
  id: string;
  name: string;
};

type Measurement = {
  id: string;
  type: MeasurementType;
  points: Point[];
  createdAt: string;
  quantity?: number | null;
  unit?: string | null;
  label?: string | null;
  linkedResource?: LinkedResource | null;
};

type PageData = {
  asset?: DrawingAsset | null;
  measurements?: Measurement[];
  extractedDetails?: Record<string, unknown> | null;
  notes?: string | null;
};

type TakeoffPageRow = {
  id: string;
  project_id: string;
  drawing_id?: string | null;
  page_number: number;
  calibration_scale?: number | null;
  calibration_unit?: string | null;
  calibration_p1?: Point | null;
  calibration_p2?: Point | null;
  page_data?: PageData | null;
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

type LibraryRow = {
  id: string;
  name: string;
  item_code?: string | null;
  assembly_code?: string | null;
  description?: string | null;
};

const EMPTY_PAGE_NOTES = "";
const DRAWING_BG = "bg-slate-950";
const PANEL_BG = "bg-slate-900";
const PANEL_BORDER = "border-slate-800";
const INPUT_BG = "bg-slate-950";

function uid() {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function distance(p1: Point, p2: Point) {
  return Math.hypot(p2.x - p1.x, p2.y - p1.y);
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

function pointList(points: Point[]) {
  return points.map((p) => `${p.x},${p.y}`).join(" ");
}

function parseFraction(input: string) {
  const raw = String(input || "").trim();
  if (!raw) return 0;
  if (raw.includes("/")) {
    const [a, b] = raw.split("/");
    const num = Number(a);
    const den = Number(b);
    if (!Number.isFinite(num) || !Number.isFinite(den) || den === 0) return 0;
    return num / den;
  }
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

function composeFeetValue(
  feet: string,
  inches: string,
  fraction: string,
  unit: string
) {
  const ft = Number(feet || 0);
  const inch = Number(inches || 0);
  const frac = parseFraction(fraction);
  const totalInches = ft * 12 + inch + frac;
  if (unit === "ft") return totalInches / 12;
  if (unit === "in") return totalInches;
  if (unit === "m") return (totalInches * 0.0254);
  if (unit === "cm") return (totalInches * 2.54);
  return totalInches / 12;
}

function formatNumber(n: number, digits = 2) {
  if (!Number.isFinite(n)) return "0";
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: digits,
    minimumFractionDigits: 0,
  }).format(n);
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Failed to read file."));
    reader.onload = () => resolve(String(reader.result || ""));
    reader.readAsDataURL(file);
  });
}

function loadImageDimensions(dataUrl: string) {
  return new Promise<{ width: number; height: number }>((resolve, reject) => {
    const img = new Image();
    img.onerror = () => reject(new Error("Failed to load image."));
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.src = dataUrl;
  });
}

function base64ToUint8Array(dataUrl: string) {
  const part = dataUrl.split(",")[1] || "";
  const binary = atob(part);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function renderPdfPagesToImages(
  file: File
): Promise<
  Array<{
    pageNumber: number;
    dataUrl: string;
    width: number;
    height: number;
  }>
> {
  const dataUrl = await readFileAsDataUrl(file);
  const bytes = base64ToUint8Array(dataUrl);
  const pdf = await getDocument({ data: bytes }).promise;
  const results: Array<{
    pageNumber: number;
    dataUrl: string;
    width: number;
    height: number;
  }> = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const initialViewport = page.getViewport({ scale: 1 });
    const maxWidth = 1800;
    const scale = Math.min(2.2, Math.max(1, maxWidth / Math.max(initialViewport.width, 1)));
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not create PDF canvas context.");

    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);

    await page.render({
      canvasContext: ctx,
      viewport,
    }).promise;

    results.push({
      pageNumber,
      dataUrl: canvas.toDataURL("image/png", 1),
      width: canvas.width,
      height: canvas.height,
    });
  }

  return results;
}

function saveStateClasses(state: SaveState) {
  if (state === "saving") return "bg-amber-500/15 text-amber-300 border-amber-500/30";
  if (state === "saved") return "bg-emerald-500/15 text-emerald-300 border-emerald-500/30";
  if (state === "error") return "bg-rose-500/15 text-rose-300 border-rose-500/30";
  return "bg-slate-800 text-slate-300 border-slate-700";
}

function getScaleRatio(page: TakeoffPageRow | null | undefined) {
  const p1 = page?.calibration_point_1 || page?.calibration_p1 || null;
  const p2 = page?.calibration_point_2 || page?.calibration_p2 || null;
  const realDistance =
    Number(page?.calibration_distance ?? page?.calibration_scale ?? 0) || 0;

  if (!p1 || !p2 || realDistance <= 0) return null;
  const pixelDistance = distance(p1, p2);
  if (!pixelDistance) return null;
  return realDistance / pixelDistance;
}

function measureValue(
  m: Measurement,
  page: TakeoffPageRow | null | undefined
): { value: number | null; unit: string | null } {
  const ratio = getScaleRatio(page);
  const unit = page?.calibration_unit || "ft";

  if (m.type === "count") return { value: 1, unit: "count" };
  if (!ratio) return { value: null, unit: null };

  if (m.type === "line" && m.points.length >= 2) {
    const raw = distance(m.points[0], m.points[1]) * ratio;
    return { value: raw, unit };
  }

  if (m.type === "area" && m.points.length >= 3) {
    const raw = polygonArea(m.points) * ratio * ratio;
    return { value: raw, unit: `${unit}²` };
  }

  return { value: null, unit: null };
}

const TakeoffPage: React.FC = () => {
  const { projectId } = useParams<{ projectId: string }>();

  const [loading, setLoading] = useState(true);
  const [bootstrapping, setBootstrapping] = useState(false);
  const [pages, setPages] = useState<TakeoffPageRow[]>([]);
  const [activePageId, setActivePageId] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveMessage, setSaveMessage] = useState<string>("");
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);

  const [tool, setTool] = useState<ToolMode>("pan");
  const [rightTab, setRightTab] = useState<RightTab>("measurements");
  const [pickerMode, setPickerMode] = useState<PickerMode>("items");

  const [draftPoints, setDraftPoints] = useState<Point[]>([]);
  const [selectedMeasurementId, setSelectedMeasurementId] = useState<string | null>(null);

  const [isUploadBusy, setIsUploadBusy] = useState(false);
  const [uploadProgressLabel, setUploadProgressLabel] = useState<string>("");

  const [isCalibrationOpen, setIsCalibrationOpen] = useState(false);
  const [isCalibrationPicking, setIsCalibrationPicking] = useState(false);
  const [calibrationDraftP1, setCalibrationDraftP1] = useState<Point | null>(null);
  const [calibrationDraftP2, setCalibrationDraftP2] = useState<Point | null>(null);
  const [calibrationFeet, setCalibrationFeet] = useState("1");
  const [calibrationInches, setCalibrationInches] = useState("");
  const [calibrationFraction, setCalibrationFraction] = useState("0");
  const [calibrationUnit, setCalibrationUnit] = useState("ft");

  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);

  const [itemRows, setItemRows] = useState<LibraryRow[]>([]);
  const [assemblyRows, setAssemblyRows] = useState<LibraryRow[]>([]);
  const [librarySearch, setLibrarySearch] = useState("");
  const [linkedResource, setLinkedResource] = useState<LinkedResource | null>(null);

  const [notesDraft, setNotesDraft] = useState(EMPTY_PAGE_NOTES);

  const viewerOuterRef = useRef<HTMLDivElement | null>(null);
  const assetLayerRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const ensureSessionPromiseRef = useRef<Promise<string> | null>(null);
  const ensurePagePromiseRef = useRef<Promise<TakeoffPageRow> | null>(null);
  const panStartRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);

  const activePage = useMemo(
    () => pages.find((p) => p.id === activePageId) || null,
    [pages, activePageId]
  );

  const activeAsset = activePage?.page_data?.asset || null;
  const measurements = activePage?.page_data?.measurements || [];

  useEffect(() => {
    if (!activePage) return;
    setNotesDraft(String(activePage.page_data?.notes || ""));
  }, [activePage?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const sortedPages = useMemo(
    () => [...pages].sort((a, b) => a.page_number - b.page_number),
    [pages]
  );

  const filteredLibraryRows = useMemo(() => {
    const q = librarySearch.trim().toLowerCase();
    const source = pickerMode === "items" ? itemRows : assemblyRows;
    if (!q) return source;
    return source.filter((r) => {
      const hay = `${r.name} ${r.item_code || ""} ${r.assembly_code || ""} ${r.description || ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [librarySearch, pickerMode, itemRows, assemblyRows]);

  const selectedMeasurement = useMemo(
    () => measurements.find((m) => m.id === selectedMeasurementId) || null,
    [measurements, selectedMeasurementId]
  );

  const activeScaleRatio = useMemo(() => getScaleRatio(activePage), [activePage]);

  const setSaveStatus = useCallback((state: SaveState, message = "") => {
    setSaveState(state);
    setSaveMessage(message);
    if (state === "saved") {
      setLastSavedAt(new Date().toLocaleTimeString());
    }
  }, []);

  const loadPages = useCallback(
    async (projectIdValue: string) => {
      const { data, error } = await supabase
        .from("takeoff_pages")
        .select("*")
        .eq("project_id", projectIdValue)
        .order("page_number", { ascending: true });

      if (error) throw error;

      const rows = ((data || []) as TakeoffPageRow[]).map((row) => ({
        ...row,
        page_data: (row.page_data || {}) as PageData,
      }));

      setPages(rows);

      const existingSession = rows.find((r) => r.session_id)?.session_id || null;
      if (existingSession) setSessionId(existingSession);

      if (rows.length > 0) {
        setActivePageId((prev) => prev && rows.some((r) => r.id === prev) ? prev : rows[0].id);
      } else {
        setActivePageId(null);
      }

      return rows;
    },
    []
  );

  const ensureSession = useCallback(async () => {
    if (!projectId) throw new Error("No project selected.");

    if (sessionId) return sessionId;
    if (ensureSessionPromiseRef.current) return ensureSessionPromiseRef.current;

    ensureSessionPromiseRef.current = (async () => {
      const existing = sortedPages.find((p) => p.session_id)?.session_id;
      if (existing) {
        setSessionId(existing);
        return existing;
      }

      const { data, error } = await supabase
        .from("takeoff_pages")
        .select("session_id")
        .eq("project_id", projectId)
        .not("session_id", "is", null)
        .order("page_number", { ascending: true })
        .limit(1);

      if (error) throw error;

      const found = (data?.[0] as { session_id?: string | null } | undefined)?.session_id || null;
      if (found) {
        setSessionId(found);
        return found;
      }

      const generated = uid();
      setSessionId(generated);
      return generated;
    })();

    try {
      return await ensureSessionPromiseRef.current;
    } finally {
      ensureSessionPromiseRef.current = null;
    }
  }, [projectId, sessionId, sortedPages]);

  const persistPageRow = useCallback(
    async (pageId: string, patch: Partial<TakeoffPageRow>) => {
      const { data, error } = await supabase
        .from("takeoff_pages")
        .update({
          ...patch,
          updated_at: new Date().toISOString(),
        })
        .eq("id", pageId)
        .select("*")
        .single();

      if (error) throw error;

      const row = {
        ...(data as TakeoffPageRow),
        page_data: ((data as TakeoffPageRow)?.page_data || {}) as PageData,
      };

      setPages((prev) =>
        prev
          .map((p) => (p.id === row.id ? row : p))
          .sort((a, b) => a.page_number - b.page_number)
      );

      return row;
    },
    []
  );

  const createOrGetPage = useCallback(
    async (pageNumber: number) => {
      if (!projectId) throw new Error("No project selected.");

      const session = await ensureSession();

      const existingInState = sortedPages.find((p) => p.page_number === pageNumber);
      if (existingInState) {
        if (!existingInState.session_id && session) {
          return await persistPageRow(existingInState.id, { session_id: session });
        }
        return existingInState;
      }

      const { data: existingRows, error: fetchError } = await supabase
        .from("takeoff_pages")
        .select("*")
        .eq("project_id", projectId)
        .eq("page_number", pageNumber)
        .limit(1);

      if (fetchError) throw fetchError;

      const found = (existingRows?.[0] as TakeoffPageRow | undefined) || null;
      if (found) {
        const row = {
          ...found,
          page_data: (found.page_data || {}) as PageData,
        };
        setPages((prev) =>
          [...prev.filter((p) => p.id !== row.id), row].sort((a, b) => a.page_number - b.page_number)
        );
        if (!row.session_id) {
          return await persistPageRow(row.id, { session_id: session });
        }
        return row;
      }

      const insertPayload: Partial<TakeoffPageRow> = {
        id: uid(),
        project_id: projectId,
        session_id: session,
        page_number: pageNumber,
        page_label: `Page ${pageNumber}`,
        page_data: {
          measurements: [],
          notes: EMPTY_PAGE_NOTES,
        },
        width: null,
        height: null,
      };

      const { data: inserted, error: insertError } = await supabase
        .from("takeoff_pages")
        .insert(insertPayload)
        .select("*")
        .single();

      if (insertError) {
        const msg = String(insertError.message || "");
        if (msg.includes("takeoff_pages_session_page_idx") || msg.includes("duplicate key")) {
          const { data: retryRows, error: retryError } = await supabase
            .from("takeoff_pages")
            .select("*")
            .eq("project_id", projectId)
            .eq("page_number", pageNumber)
            .limit(1);

          if (retryError) throw retryError;
          const retryFound = (retryRows?.[0] as TakeoffPageRow | undefined) || null;
          if (retryFound) {
            const row = {
              ...retryFound,
              page_data: (retryFound.page_data || {}) as PageData,
            };
            setPages((prev) =>
              [...prev.filter((p) => p.id !== row.id), row].sort((a, b) => a.page_number - b.page_number)
            );
            return row;
          }
        }
        throw insertError;
      }

      const newRow = {
        ...(inserted as TakeoffPageRow),
        page_data: (((inserted as TakeoffPageRow)?.page_data || {}) as PageData),
      };

      setPages((prev) => [...prev, newRow].sort((a, b) => a.page_number - b.page_number));
      return newRow;
    },
    [ensureSession, persistPageRow, projectId, sortedPages]
  );

  const ensurePage = useCallback(async () => {
    if (activePage) return activePage;
    if (ensurePagePromiseRef.current) return ensurePagePromiseRef.current;

    ensurePagePromiseRef.current = (async () => {
      const page = await createOrGetPage(1);
      setActivePageId(page.id);
      return page;
    })();

    try {
      return await ensurePagePromiseRef.current;
    } finally {
      ensurePagePromiseRef.current = null;
    }
  }, [activePage, createOrGetPage]);

  const savePageData = useCallback(
    async (pageId: string, pageDataPatch: Partial<PageData>, otherPatch?: Partial<TakeoffPageRow>) => {
      const page = pages.find((p) => p.id === pageId);
      if (!page) throw new Error("Page not found.");

      const nextPageData: PageData = {
        ...(page.page_data || {}),
        ...pageDataPatch,
      };

      setSaveStatus("saving", "Saving...");
      try {
        const updated = await persistPageRow(pageId, {
          ...otherPatch,
          page_data: nextPageData,
        });
        setSaveStatus("saved", "Saved");
        return updated;
      } catch (error: any) {
        setSaveStatus("error", error?.message || "Save failed.");
        throw error;
      }
    },
    [pages, persistPageRow, setSaveStatus]
  );

  const trySyncMeasurementToTable = useCallback(
    async (page: TakeoffPageRow, measurement: Measurement, calibratedValue: number | null, calibratedUnit: string | null) => {
      const candidates: Array<Record<string, unknown>> = [
        {
          id: measurement.id,
          project_id: page.project_id,
          session_id: page.session_id,
          page_id: page.id,
          measurement_type: measurement.type,
          measurement_data: {
            points: measurement.points,
            linkedResource: measurement.linkedResource || null,
            label: measurement.label || null,
          },
          quantity: calibratedValue,
          unit: calibratedUnit,
          label: measurement.label || null,
        },
        {
          id: measurement.id,
          project_id: page.project_id,
          session_id: page.session_id,
          takeoff_page_id: page.id,
          type: measurement.type,
          points: measurement.points,
          value: calibratedValue,
          unit: calibratedUnit,
          label: measurement.label || null,
          data: {
            linkedResource: measurement.linkedResource || null,
          },
        },
        {
          id: measurement.id,
          page_id: page.id,
          type: measurement.type,
          points: measurement.points,
          quantity: calibratedValue,
          unit: calibratedUnit,
        },
      ];

      for (const payload of candidates) {
        const { error } = await supabase.from("takeoff_measurements").upsert(payload as any);
        if (!error) return;
      }
    },
    []
  );

  const saveMeasurement = useCallback(
    async (type: MeasurementType, points: Point[]) => {
      const page = await ensurePage();
      const nextMeasurement: Measurement = {
        id: uid(),
        type,
        points,
        createdAt: new Date().toISOString(),
        linkedResource: linkedResource ? { ...linkedResource } : null,
      };

      const previewPage = {
        ...page,
        page_data: {
          ...(page.page_data || {}),
          measurements: [...(page.page_data?.measurements || []), nextMeasurement],
        },
      } as TakeoffPageRow;

      const measured = measureValue(nextMeasurement, previewPage);
      nextMeasurement.quantity = measured.value;
      nextMeasurement.unit = measured.unit;
      if (measured.value != null && measured.unit) {
        nextMeasurement.label =
          type === "count" ? "Count" : `${formatNumber(measured.value, 2)} ${measured.unit}`;
      }

      const updatedMeasurements = [...(page.page_data?.measurements || []), nextMeasurement];

      await savePageData(page.id, {
        measurements: updatedMeasurements,
      });

      try {
        await trySyncMeasurementToTable(page, nextMeasurement, measured.value, measured.unit);
      } catch {
        // best effort only
      }

      setDraftPoints([]);
      setSelectedMeasurementId(nextMeasurement.id);
    },
    [ensurePage, linkedResource, savePageData, trySyncMeasurementToTable]
  );

  const removeMeasurement = useCallback(
    async (measurementId: string) => {
      if (!activePage) return;
      const next = measurements.filter((m) => m.id !== measurementId);
      await savePageData(activePage.id, { measurements: next });
      setSelectedMeasurementId((prev) => (prev === measurementId ? null : prev));
    },
    [activePage, measurements, savePageData]
  );

  const applyCalibration = useCallback(async () => {
    if (!activePage) throw new Error("No active page.");
    if (!calibrationDraftP1 || !calibrationDraftP2) {
      throw new Error("Pick two points first.");
    }

    const actualDistance = composeFeetValue(
      calibrationFeet,
      calibrationInches,
      calibrationFraction,
      calibrationUnit
    );

    if (!Number.isFinite(actualDistance) || actualDistance <= 0) {
      throw new Error("Enter a valid calibration distance.");
    }

    await savePageData(
      activePage.id,
      {},
      {
        calibration_point_1: calibrationDraftP1,
        calibration_point_2: calibrationDraftP2,
        calibration_p1: calibrationDraftP1,
        calibration_p2: calibrationDraftP2,
        calibration_distance: actualDistance,
        calibration_scale: actualDistance,
        calibration_unit: calibrationUnit,
      }
    );

    setIsCalibrationOpen(false);
    setBanner("Calibration saved.");
  }, [
    activePage,
    calibrationDraftP1,
    calibrationDraftP2,
    calibrationFeet,
    calibrationFraction,
    calibrationInches,
    calibrationUnit,
    savePageData,
  ]);

  const beginCalibration = useCallback(() => {
    setCalibrationDraftP1(null);
    setCalibrationDraftP2(null);
    setIsCalibrationOpen(false);
    setIsCalibrationPicking(true);
    setBanner("Click point 1, then point 2 on the drawing.");
  }, []);

  const resetCalibrationDraft = useCallback(() => {
    setCalibrationDraftP1(null);
    setCalibrationDraftP2(null);
    setCalibrationFeet("1");
    setCalibrationInches("");
    setCalibrationFraction("0");
    setCalibrationUnit(activePage?.calibration_unit || "ft");
  }, [activePage?.calibration_unit]);

  const saveNotes = useCallback(async () => {
    if (!activePage) return;
    await savePageData(activePage.id, { notes: notesDraft });
  }, [activePage, notesDraft, savePageData]);

  const uploadDrawing = useCallback(
    async (file: File) => {
      if (!projectId) throw new Error("No project selected.");

      setPageError(null);
      setIsUploadBusy(true);
      setUploadProgressLabel(`Uploading ${file.name}...`);

      try {
        const basePage = await ensurePage();
        const currentSession = await ensureSession();

        if (file.type.includes("pdf")) {
          setUploadProgressLabel(`Rendering PDF pages from ${file.name}...`);
          const renderedPages = await renderPdfPagesToImages(file);

          for (let i = 0; i < renderedPages.length; i += 1) {
            const item = renderedPages[i];
            setUploadProgressLabel(`Saving PDF page ${item.pageNumber} of ${renderedPages.length}...`);

            const pageRow = await createOrGetPage(item.pageNumber);

            const asset: DrawingAsset = {
              kind: "image",
              name: `${file.name} - Page ${item.pageNumber}`,
              dataUrl: item.dataUrl,
              mimeType: "image/png",
              width: item.width,
              height: item.height,
              sourceKind: "pdf",
              sourceFileName: file.name,
              sourcePageNumber: item.pageNumber,
            };

            await savePageData(
              pageRow.id,
              {
                asset,
                measurements: pageRow.page_data?.measurements || [],
                notes: pageRow.page_data?.notes || EMPTY_PAGE_NOTES,
              },
              {
                page_label: `${file.name} - Page ${item.pageNumber}`,
                width: item.width,
                height: item.height,
                session_id: currentSession,
              }
            );

            if (item.pageNumber === 1 || basePage.page_number === item.pageNumber) {
              setActivePageId(pageRow.id);
            }
          }

          await loadPages(projectId);
          setBanner(`PDF uploaded successfully: ${file.name}`);
        } else {
          setUploadProgressLabel(`Processing image ${file.name}...`);
          const dataUrl = await readFileAsDataUrl(file);
          const dims = await loadImageDimensions(dataUrl);

          const asset: DrawingAsset = {
            kind: "image",
            name: file.name,
            dataUrl,
            mimeType: file.type,
            width: dims.width,
            height: dims.height,
            sourceKind: "image",
            sourceFileName: file.name,
          };

          await savePageData(
            basePage.id,
            {
              asset,
              measurements: basePage.page_data?.measurements || [],
              notes: basePage.page_data?.notes || EMPTY_PAGE_NOTES,
            },
            {
              page_label: file.name,
              width: dims.width,
              height: dims.height,
              session_id: currentSession,
            }
          );

          setActivePageId(basePage.id);
          setBanner(`Image uploaded successfully: ${file.name}`);
        }
      } catch (error: any) {
        setPageError(error?.message || "Upload failed.");
        setSaveStatus("error", error?.message || "Upload failed.");
      } finally {
        setIsUploadBusy(false);
        setUploadProgressLabel("");
      }
    },
    [createOrGetPage, ensurePage, ensureSession, loadPages, projectId, savePageData, setSaveStatus]
  );

  const bootstrap = useCallback(async () => {
    if (!projectId) {
      setLoading(false);
      setPages([]);
      setActivePageId(null);
      setSessionId(null);
      return;
    }

    setLoading(true);
    setBootstrapping(true);
    setPageError(null);

    try {
      const existing = await loadPages(projectId);
      if (existing.length === 0) {
        const page = await createOrGetPage(1);
        setActivePageId(page.id);
        await loadPages(projectId);
      }
    } catch (error: any) {
      setPageError(error?.message || "Failed to initialize Takeoff.");
    } finally {
      setLoading(false);
      setBootstrapping(false);
    }
  }, [createOrGetPage, loadPages, projectId]);

  const loadLibrary = useCallback(async () => {
    try {
      const [{ data: items }, { data: assemblies }] = await Promise.all([
        supabase
          .from("items")
          .select("id,name,item_code,description")
          .order("name", { ascending: true }),
        supabase
          .from("assemblies")
          .select("id,name,assembly_code,description")
          .order("name", { ascending: true }),
      ]);

      setItemRows((items || []) as LibraryRow[]);
      setAssemblyRows((assemblies || []) as LibraryRow[]);
    } catch {
      setItemRows([]);
      setAssemblyRows([]);
    }
  }, []);

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    loadLibrary();
  }, [loadLibrary]);

  useEffect(() => {
    if (!activePage) {
      setCalibrationDraftP1(null);
      setCalibrationDraftP2(null);
      return;
    }

    setCalibrationUnit(activePage.calibration_unit || "ft");
    setCalibrationDraftP1(activePage.calibration_point_1 || activePage.calibration_p1 || null);
    setCalibrationDraftP2(activePage.calibration_point_2 || activePage.calibration_p2 || null);

    const existingDistance = Number(
      activePage.calibration_distance ?? activePage.calibration_scale ?? 1
    );

    if (existingDistance > 0) {
      if ((activePage.calibration_unit || "ft") === "ft") {
        const feetWhole = Math.floor(existingDistance);
        const inchesDecimal = (existingDistance - feetWhole) * 12;
        const inchesWhole = Math.floor(inchesDecimal);
        const frac = inchesDecimal - inchesWhole;
        setCalibrationFeet(String(feetWhole));
        setCalibrationInches(String(inchesWhole || ""));
        setCalibrationFraction(frac > 0 ? `${Math.round(frac * 16)}/16` : "0");
      } else {
        setCalibrationFeet(String(existingDistance));
        setCalibrationInches("");
        setCalibrationFraction("0");
      }
    }
  }, [activePage]);

  const handleOpenUpload = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleAddBlankPage = useCallback(async () => {
    try {
      setPageError(null);
      const nextNumber =
        (sortedPages.length ? Math.max(...sortedPages.map((p) => p.page_number)) : 0) + 1;
      const page = await createOrGetPage(nextNumber);
      setActivePageId(page.id);
      setBanner(`Blank page ${nextNumber} created.`);
    } catch (error: any) {
      setPageError(error?.message || "Could not add page.");
    }
  }, [createOrGetPage, sortedPages]);

  const handleCanvasClick = useCallback(
    async (evt: React.MouseEvent<SVGSVGElement>) => {
      if (!activePage || !activeAsset || !assetLayerRef.current) return;

      const rect = assetLayerRef.current.getBoundingClientRect();
      if (!rect.width || !rect.height) return;

      const assetWidth = activeAsset.width || activePage.width || rect.width;
      const assetHeight = activeAsset.height || activePage.height || rect.height;

      const clientX = evt.clientX - rect.left;
      const clientY = evt.clientY - rect.top;

      const x = clamp((clientX / rect.width) * assetWidth, 0, assetWidth);
      const y = clamp((clientY / rect.height) * assetHeight, 0, assetHeight);
      const p = { x, y };

      if (isCalibrationPicking) {
        if (!calibrationDraftP1) {
          setCalibrationDraftP1(p);
          setBanner("Calibration point 1 captured. Click point 2.");
          return;
        }
        if (!calibrationDraftP2) {
          setCalibrationDraftP2(p);
          setIsCalibrationPicking(false);
          setIsCalibrationOpen(true);
          setBanner("Calibration point 2 captured. Review and apply.");
          return;
        }
      }

      if (tool === "count") {
        await saveMeasurement("count", [p]);
        return;
      }

      if (tool === "line") {
        const next = [...draftPoints, p];
        setDraftPoints(next);
        if (next.length >= 2) {
          await saveMeasurement("line", next.slice(0, 2));
        }
        return;
      }

      if (tool === "area") {
        setDraftPoints((prev) => [...prev, p]);
      }
    },
    [
      activeAsset,
      activePage,
      calibrationDraftP1,
      calibrationDraftP2,
      draftPoints,
      isCalibrationPicking,
      saveMeasurement,
      tool,
    ]
  );

  const finishAreaMeasurement = useCallback(async () => {
    if (draftPoints.length < 3) return;
    await saveMeasurement("area", draftPoints);
  }, [draftPoints, saveMeasurement]);

  const cancelDraftMeasurement = useCallback(() => {
    setDraftPoints([]);
  }, []);

  const handleWheel = useCallback((evt: React.WheelEvent<HTMLDivElement>) => {
    if (!evt.ctrlKey && !evt.metaKey) return;
    evt.preventDefault();
    setZoom((prev) => clamp(prev + (evt.deltaY < 0 ? 0.1 : -0.1), 0.2, 5));
  }, []);

  const beginPan = useCallback((evt: React.MouseEvent<HTMLDivElement>) => {
    if (tool !== "pan") return;
    setIsPanning(true);
    panStartRef.current = {
      x: evt.clientX,
      y: evt.clientY,
      panX: pan.x,
      panY: pan.y,
    };
  }, [pan.x, pan.y, tool]);

  const movePan = useCallback((evt: React.MouseEvent<HTMLDivElement>) => {
    if (!isPanning || !panStartRef.current) return;
    const dx = evt.clientX - panStartRef.current.x;
    const dy = evt.clientY - panStartRef.current.y;
    setPan({
      x: panStartRef.current.panX + dx,
      y: panStartRef.current.panY + dy,
    });
  }, [isPanning]);

  const endPan = useCallback(() => {
    setIsPanning(false);
    panStartRef.current = null;
  }, []);

  const resetView = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  if (!projectId) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100">
        <div className="mx-auto flex min-h-screen max-w-4xl items-center justify-center px-6">
          <div className="w-full max-w-xl rounded-2xl border border-slate-800 bg-slate-900 p-8 shadow-2xl">
            <h1 className="text-2xl font-semibold text-white">Takeoff</h1>
            <p className="mt-3 text-sm text-slate-300">
              Open Takeoff from a project route:
              <span className="ml-2 rounded bg-slate-800 px-2 py-1 text-slate-200">
                /projects/:projectId/takeoff
              </span>
            </p>
          </div>
        </div>
      </div>
    );
  }

  const assetWidth = activeAsset?.width || activePage?.width || 1200;
  const assetHeight = activeAsset?.height || activePage?.height || 900;

  return (
    <div className="flex h-screen min-h-screen flex-col bg-slate-950 text-slate-100">
      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf,image/*"
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.currentTarget.value = "";
          if (!file) return;
          await uploadDrawing(file);
        }}
      />

      <header className="border-b border-slate-800 bg-slate-950/95 px-4 py-3 backdrop-blur">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-xl border border-slate-800 bg-slate-900 px-3 py-2">
              <div className="text-xs uppercase tracking-wide text-slate-400">Takeoff</div>
              <div className="text-sm font-semibold text-white">
                Project {projectId}
              </div>
            </div>

            <div
              className={cn(
                "rounded-xl border px-3 py-2 text-xs font-medium",
                saveStateClasses(saveState)
              )}
            >
              {saveState === "saving" && "Saving..."}
              {saveState === "saved" && `Saved${lastSavedAt ? ` • ${lastSavedAt}` : ""}`}
              {saveState === "error" && `Save Error${saveMessage ? ` • ${saveMessage}` : ""}`}
              {saveState === "idle" && "Ready"}
            </div>

            {bootstrapping && (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
                Initializing...
              </div>
            )}

            {isUploadBusy && (
              <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-xs text-cyan-300">
                {uploadProgressLabel || "Uploading..."}
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setTool("pan")}
              className={cn(
                "rounded-xl border px-3 py-2 text-sm",
                tool === "pan"
                  ? "border-cyan-500 bg-cyan-500/15 text-cyan-200"
                  : "border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800"
              )}
            >
              Pan
            </button>
            <button
              type="button"
              onClick={() => setTool("line")}
              className={cn(
                "rounded-xl border px-3 py-2 text-sm",
                tool === "line"
                  ? "border-cyan-500 bg-cyan-500/15 text-cyan-200"
                  : "border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800"
              )}
            >
              Line
            </button>
            <button
              type="button"
              onClick={() => setTool("area")}
              className={cn(
                "rounded-xl border px-3 py-2 text-sm",
                tool === "area"
                  ? "border-cyan-500 bg-cyan-500/15 text-cyan-200"
                  : "border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800"
              )}
            >
              Area
            </button>
            <button
              type="button"
              onClick={() => setTool("count")}
              className={cn(
                "rounded-xl border px-3 py-2 text-sm",
                tool === "count"
                  ? "border-cyan-500 bg-cyan-500/15 text-cyan-200"
                  : "border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800"
              )}
            >
              Count
            </button>

            <div className="mx-1 h-8 w-px bg-slate-800" />

            <button
              type="button"
              onClick={handleOpenUpload}
              className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 hover:bg-slate-800"
            >
              Upload Drawing
            </button>
            <button
              type="button"
              onClick={handleAddBlankPage}
              className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 hover:bg-slate-800"
            >
              Add Page
            </button>
            <button
              type="button"
              onClick={() => setIsCalibrationOpen(true)}
              className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 hover:bg-slate-800"
            >
              Calibration
            </button>
            <button
              type="button"
              onClick={() => setZoom((prev) => clamp(prev - 0.1, 0.2, 5))}
              className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 hover:bg-slate-800"
            >
              −
            </button>
            <div className="rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-200">
              {Math.round(zoom * 100)}%
            </div>
            <button
              type="button"
              onClick={() => setZoom((prev) => clamp(prev + 0.1, 0.2, 5))}
              className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 hover:bg-slate-800"
            >
              +
            </button>
            <button
              type="button"
              onClick={resetView}
              className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 hover:bg-slate-800"
            >
              Reset View
            </button>

            {tool === "area" && draftPoints.length >= 3 && (
              <button
                type="button"
                onClick={finishAreaMeasurement}
                className="rounded-xl border border-emerald-500/40 bg-emerald-500/15 px-3 py-2 text-sm text-emerald-200 hover:bg-emerald-500/20"
              >
                Finish Area
              </button>
            )}

            {draftPoints.length > 0 && (
              <button
                type="button"
                onClick={cancelDraftMeasurement}
                className="rounded-xl border border-rose-500/40 bg-rose-500/15 px-3 py-2 text-sm text-rose-200 hover:bg-rose-500/20"
              >
                Cancel Draft
              </button>
            )}
          </div>
        </div>

        {(banner || pageError) && (
          <div className="mt-3 flex flex-col gap-2">
            {banner && (
              <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-sm text-cyan-200">
                {banner}
              </div>
            )}
            {pageError && (
              <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
                {pageError}
              </div>
            )}
          </div>
        )}
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className={cn("w-72 border-r", PANEL_BORDER, PANEL_BG, "flex flex-col")}>
          <div className="border-b border-slate-800 px-4 py-3">
            <div className="text-sm font-semibold text-white">Pages</div>
            <div className="mt-1 text-xs text-slate-400">
              Session: {sessionId || "Bootstrapping..."}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {loading ? (
              <div className="rounded-xl border border-slate-800 bg-slate-950 p-4 text-sm text-slate-400">
                Loading pages...
              </div>
            ) : sortedPages.length === 0 ? (
              <div className="rounded-xl border border-slate-800 bg-slate-950 p-4 text-sm text-slate-400">
                No pages yet.
              </div>
            ) : (
              <div className="space-y-3">
                {sortedPages.map((page) => {
                  const asset = page.page_data?.asset;
                  const thumb = asset?.dataUrl;
                  return (
                    <button
                      key={page.id}
                      type="button"
                      onClick={() => {
                        setActivePageId(page.id);
                        setDraftPoints([]);
                        setSelectedMeasurementId(null);
                      }}
                      className={cn(
                        "w-full rounded-2xl border p-3 text-left transition",
                        page.id === activePageId
                          ? "border-cyan-500 bg-cyan-500/10"
                          : "border-slate-800 bg-slate-950 hover:bg-slate-900"
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-white">
                            {page.page_label || `Page ${page.page_number}`}
                          </div>
                          <div className="mt-1 text-xs text-slate-400">
                            Page #{page.page_number}
                          </div>
                        </div>
                        <div className="rounded-lg bg-slate-900 px-2 py-1 text-[11px] text-slate-300">
                          {(page.page_data?.measurements || []).length} m
                        </div>
                      </div>

                      <div className="mt-3 overflow-hidden rounded-xl border border-slate-800 bg-slate-900">
                        {thumb ? (
                          <img
                            src={thumb}
                            alt={page.page_label || `Page ${page.page_number}`}
                            className="h-32 w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-32 items-center justify-center text-xs text-slate-500">
                            No drawing
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </aside>

        <main className="min-w-0 flex-1">
          <div className="flex h-full flex-col">
            <div className="border-b border-slate-800 bg-slate-950 px-4 py-3">
              <div className="flex flex-wrap items-center gap-3">
                <div className="rounded-xl border border-slate-800 bg-slate-900 px-3 py-2">
                  <div className="text-xs text-slate-400">Active Page</div>
                  <div className="text-sm font-medium text-white">
                    {activePage?.page_label || "No page"}
                  </div>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-900 px-3 py-2">
                  <div className="text-xs text-slate-400">Calibration</div>
                  <div className="text-sm font-medium text-white">
                    {activeScaleRatio
                      ? `Active • ${activePage?.calibration_unit || "ft"}`
                      : "Not calibrated"}
                  </div>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-900 px-3 py-2">
                  <div className="text-xs text-slate-400">Linked Resource</div>
                  <div className="text-sm font-medium text-white">
                    {linkedResource ? `${linkedResource.type}: ${linkedResource.name}` : "None"}
                  </div>
                </div>
              </div>
            </div>

            <div className={cn("relative min-h-0 flex-1 overflow-hidden", DRAWING_BG)}>
              {!activePage ? (
                <div className="flex h-full items-center justify-center">
                  <div className="rounded-2xl border border-slate-800 bg-slate-900 p-8 text-center">
                    <div className="text-lg font-semibold text-white">No active page</div>
                    <div className="mt-2 text-sm text-slate-400">
                      Create or select a page to begin.
                    </div>
                  </div>
                </div>
              ) : !activeAsset ? (
                <div className="flex h-full items-center justify-center">
                  <div className="rounded-2xl border border-slate-800 bg-slate-900 p-8 text-center">
                    <div className="text-lg font-semibold text-white">No drawing uploaded</div>
                    <div className="mt-2 text-sm text-slate-400">
                      Upload a PDF or image to start measuring on this page.
                    </div>
                    <button
                      type="button"
                      onClick={handleOpenUpload}
                      className="mt-4 rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-sm text-slate-100 hover:bg-slate-700"
                    >
                      Upload Drawing
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  ref={viewerOuterRef}
                  className={cn(
                    "relative h-full w-full overflow-hidden",
                    tool === "pan" ? "cursor-grab active:cursor-grabbing" : "cursor-crosshair"
                  )}
                  onWheel={handleWheel}
                  onMouseDown={beginPan}
                  onMouseMove={movePan}
                  onMouseUp={endPan}
                  onMouseLeave={endPan}
                >
                  <div
                    className="absolute left-1/2 top-1/2"
                    style={{
                      transform: `translate(calc(-50% + ${pan.x}px), calc(-50% + ${pan.y}px)) scale(${zoom})`,
                      transformOrigin: "center center",
                    }}
                  >
                    <div
                      ref={assetLayerRef}
                      className="relative select-none shadow-2xl"
                      style={{
                        width: assetWidth,
                        height: assetHeight,
                      }}
                    >
                      <img
                        src={activeAsset.dataUrl}
                        alt={activeAsset.name}
                        draggable={false}
                        className="pointer-events-none absolute inset-0 h-full w-full object-contain"
                      />

                      <svg
                        width={assetWidth}
                        height={assetHeight}
                        className="absolute inset-0"
                        onClick={handleCanvasClick}
                        onDoubleClick={async () => {
                          if (tool === "area" && draftPoints.length >= 3) {
                            await finishAreaMeasurement();
                          }
                        }}
                      >
                        {measurements.map((m) => {
                          const isSelected = m.id === selectedMeasurementId;
                          const stroke = isSelected ? "#22d3ee" : "#38bdf8";
                          const fill = isSelected ? "rgba(34,211,238,0.18)" : "rgba(56,189,248,0.12)";

                          if (m.type === "count" && m.points[0]) {
                            const p = m.points[0];
                            return (
                              <g key={m.id} onClick={() => setSelectedMeasurementId(m.id)}>
                                <circle cx={p.x} cy={p.y} r={8} fill={stroke} opacity={0.9} />
                                <circle cx={p.x} cy={p.y} r={16} fill="transparent" stroke={stroke} strokeWidth={2} />
                              </g>
                            );
                          }

                          if (m.type === "line" && m.points.length >= 2) {
                            const midX = (m.points[0].x + m.points[1].x) / 2;
                            const midY = (m.points[0].y + m.points[1].y) / 2;
                            return (
                              <g key={m.id} onClick={() => setSelectedMeasurementId(m.id)}>
                                <line
                                  x1={m.points[0].x}
                                  y1={m.points[0].y}
                                  x2={m.points[1].x}
                                  y2={m.points[1].y}
                                  stroke={stroke}
                                  strokeWidth={3}
                                />
                                <circle cx={m.points[0].x} cy={m.points[0].y} r={5} fill={stroke} />
                                <circle cx={m.points[1].x} cy={m.points[1].y} r={5} fill={stroke} />
                                {m.label && (
                                  <g>
                                    <rect
                                      x={midX - 46}
                                      y={midY - 22}
                                      width={92}
                                      height={22}
                                      rx={8}
                                      fill="rgba(2,6,23,0.82)"
                                      stroke={stroke}
                                    />
                                    <text
                                      x={midX}
                                      y={midY - 7}
                                      fill="#e2e8f0"
                                      fontSize="11"
                                      textAnchor="middle"
                                    >
                                      {m.label}
                                    </text>
                                  </g>
                                )}
                              </g>
                            );
                          }

                          if (m.type === "area" && m.points.length >= 3) {
                            const cx =
                              m.points.reduce((sum, p) => sum + p.x, 0) / m.points.length;
                            const cy =
                              m.points.reduce((sum, p) => sum + p.y, 0) / m.points.length;
                            return (
                              <g key={m.id} onClick={() => setSelectedMeasurementId(m.id)}>
                                <polygon
                                  points={pointList(m.points)}
                                  fill={fill}
                                  stroke={stroke}
                                  strokeWidth={3}
                                />
                                {m.points.map((p, idx) => (
                                  <circle key={idx} cx={p.x} cy={p.y} r={5} fill={stroke} />
                                ))}
                                {m.label && (
                                  <g>
                                    <rect
                                      x={cx - 52}
                                      y={cy - 22}
                                      width={104}
                                      height={22}
                                      rx={8}
                                      fill="rgba(2,6,23,0.82)"
                                      stroke={stroke}
                                    />
                                    <text
                                      x={cx}
                                      y={cy - 7}
                                      fill="#e2e8f0"
                                      fontSize="11"
                                      textAnchor="middle"
                                    >
                                      {m.label}
                                    </text>
                                  </g>
                                )}
                              </g>
                            );
                          }

                          return null;
                        })}

                        {draftPoints.length > 0 && (
                          <g>
                            {tool === "line" && draftPoints.length >= 1 && (
                              <>
                                {draftPoints.map((p, idx) => (
                                  <circle key={idx} cx={p.x} cy={p.y} r={5} fill="#f59e0b" />
                                ))}
                                {draftPoints.length === 2 && (
                                  <line
                                    x1={draftPoints[0].x}
                                    y1={draftPoints[0].y}
                                    x2={draftPoints[1].x}
                                    y2={draftPoints[1].y}
                                    stroke="#f59e0b"
                                    strokeWidth={3}
                                  />
                                )}
                              </>
                            )}

                            {tool === "area" && (
                              <>
                                <polyline
                                  points={pointList(draftPoints)}
                                  fill="rgba(245,158,11,0.12)"
                                  stroke="#f59e0b"
                                  strokeWidth={3}
                                />
                                {draftPoints.map((p, idx) => (
                                  <circle key={idx} cx={p.x} cy={p.y} r={5} fill="#f59e0b" />
                                ))}
                              </>
                            )}
                          </g>
                        )}

                        {(calibrationDraftP1 || calibrationDraftP2) && (
                          <g>
                            {calibrationDraftP1 && (
                              <circle
                                cx={calibrationDraftP1.x}
                                cy={calibrationDraftP1.y}
                                r={8}
                                fill="#22c55e"
                              />
                            )}
                            {calibrationDraftP2 && (
                              <circle
                                cx={calibrationDraftP2.x}
                                cy={calibrationDraftP2.y}
                                r={8}
                                fill="#22c55e"
                              />
                            )}
                            {calibrationDraftP1 && calibrationDraftP2 && (
                              <line
                                x1={calibrationDraftP1.x}
                                y1={calibrationDraftP1.y}
                                x2={calibrationDraftP2.x}
                                y2={calibrationDraftP2.y}
                                stroke="#22c55e"
                                strokeWidth={3}
                                strokeDasharray="8 6"
                              />
                            )}
                          </g>
                        )}
                      </svg>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </main>

        <aside className={cn("w-[380px] border-l", PANEL_BORDER, PANEL_BG, "flex flex-col")}>
          <div className="border-b border-slate-800 px-4 py-3">
            <div className="flex gap-2">
              {([
                ["measurements", "Measurements"],
                ["library", "Library"],
                ["details", "Details"],
                ["settings", "Settings"],
              ] as Array<[RightTab, string]>).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setRightTab(key)}
                  className={cn(
                    "rounded-xl border px-3 py-2 text-sm",
                    rightTab === key
                      ? "border-cyan-500 bg-cyan-500/15 text-cyan-200"
                      : "border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800"
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            {rightTab === "measurements" && (
              <div className="space-y-4">
                <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
                  <div className="text-sm font-semibold text-white">Measurement Summary</div>
                  <div className="mt-3 grid grid-cols-3 gap-3">
                    <div className="rounded-xl border border-slate-800 bg-slate-900 p-3">
                      <div className="text-xs text-slate-400">Lines</div>
                      <div className="mt-1 text-lg font-semibold text-white">
                        {measurements.filter((m) => m.type === "line").length}
                      </div>
                    </div>
                    <div className="rounded-xl border border-slate-800 bg-slate-900 p-3">
                      <div className="text-xs text-slate-400">Areas</div>
                      <div className="mt-1 text-lg font-semibold text-white">
                        {measurements.filter((m) => m.type === "area").length}
                      </div>
                    </div>
                    <div className="rounded-xl border border-slate-800 bg-slate-900 p-3">
                      <div className="text-xs text-slate-400">Counts</div>
                      <div className="mt-1 text-lg font-semibold text-white">
                        {measurements.filter((m) => m.type === "count").length}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
                  <div className="text-sm font-semibold text-white">Saved Measurements</div>
                  {measurements.length === 0 ? (
                    <div className="mt-3 rounded-xl border border-slate-800 bg-slate-900 p-4 text-sm text-slate-400">
                      No measurements yet.
                    </div>
                  ) : (
                    <div className="mt-3 space-y-3">
                      {measurements.map((m) => {
                        const info = measureValue(m, activePage);
                        const code =
                          m.linkedResource?.type === "item"
                            ? itemRows.find((r) => r.id === m.linkedResource?.id)?.item_code
                            : assemblyRows.find((r) => r.id === m.linkedResource?.id)?.assembly_code;

                        return (
                          <div
                            key={m.id}
                            className={cn(
                              "rounded-xl border p-3",
                              selectedMeasurementId === m.id
                                ? "border-cyan-500 bg-cyan-500/10"
                                : "border-slate-800 bg-slate-900"
                            )}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <button
                                type="button"
                                onClick={() => setSelectedMeasurementId(m.id)}
                                className="min-w-0 text-left"
                              >
                                <div className="text-sm font-medium capitalize text-white">
                                  {m.type}
                                </div>
                                <div className="mt-1 text-xs text-slate-400">
                                  {info.value != null && info.unit
                                    ? `${formatNumber(info.value, 2)} ${info.unit}`
                                    : "Uncalibrated"}
                                </div>
                              </button>

                              <button
                                type="button"
                                onClick={() => removeMeasurement(m.id)}
                                className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-2 py-1 text-xs text-rose-200 hover:bg-rose-500/15"
                              >
                                Delete
                              </button>
                            </div>

                            {m.linkedResource && (
                              <div className="mt-3 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-300">
                                Linked: {m.linkedResource.type} • {m.linkedResource.name}
                                {code ? ` • ${code}` : ""}
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

            {rightTab === "library" && (
              <div className="space-y-4">
                <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setPickerMode("items")}
                      className={cn(
                        "rounded-xl border px-3 py-2 text-sm",
                        pickerMode === "items"
                          ? "border-cyan-500 bg-cyan-500/15 text-cyan-200"
                          : "border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800"
                      )}
                    >
                      Items
                    </button>
                    <button
                      type="button"
                      onClick={() => setPickerMode("assemblies")}
                      className={cn(
                        "rounded-xl border px-3 py-2 text-sm",
                        pickerMode === "assemblies"
                          ? "border-cyan-500 bg-cyan-500/15 text-cyan-200"
                          : "border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800"
                      )}
                    >
                      Assemblies
                    </button>
                  </div>

                  <input
                    value={librarySearch}
                    onChange={(e) => setLibrarySearch(e.target.value)}
                    placeholder={`Search ${pickerMode}...`}
                    className={cn(
                      "mt-3 w-full rounded-xl border border-slate-700 px-3 py-2 text-sm text-slate-100 outline-none",
                      INPUT_BG
                    )}
                  />

                  {linkedResource && (
                    <div className="mt-3 flex items-center justify-between rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
                      <span>
                        Selected: {linkedResource.type} • {linkedResource.name}
                      </span>
                      <button
                        type="button"
                        onClick={() => setLinkedResource(null)}
                        className="rounded-lg border border-emerald-500/30 px-2 py-1 text-xs"
                      >
                        Clear
                      </button>
                    </div>
                  )}
                </div>

                <div className="space-y-3">
                  {filteredLibraryRows.map((row) => {
                    const code = pickerMode === "items" ? row.item_code : row.assembly_code;
                    const active =
                      linkedResource?.type === (pickerMode === "items" ? "item" : "assembly") &&
                      linkedResource?.id === row.id;

                    return (
                      <button
                        key={row.id}
                        type="button"
                        onClick={() =>
                          setLinkedResource({
                            id: row.id,
                            name: row.name,
                            type: pickerMode === "items" ? "item" : "assembly",
                          })
                        }
                        className={cn(
                          "w-full rounded-xl border p-3 text-left",
                          active
                            ? "border-cyan-500 bg-cyan-500/10"
                            : "border-slate-800 bg-slate-950 hover:bg-slate-900"
                        )}
                      >
                        <div className="text-sm font-medium text-white">{row.name}</div>
                        <div className="mt-1 text-xs text-slate-400">
                          {code || "No code"}
                        </div>
                        {row.description && (
                          <div className="mt-2 line-clamp-2 text-xs text-slate-500">
                            {row.description}
                          </div>
                        )}
                      </button>
                    );
                  })}

                  {filteredLibraryRows.length === 0 && (
                    <div className="rounded-xl border border-slate-800 bg-slate-950 p-4 text-sm text-slate-400">
                      No {pickerMode} found.
                    </div>
                  )}
                </div>
              </div>
            )}

            {rightTab === "details" && (
              <div className="space-y-4">
                <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
                  <div className="text-sm font-semibold text-white">Page Notes</div>
                  <textarea
                    value={notesDraft}
                    onChange={(e) => setNotesDraft(e.target.value)}
                    rows={10}
                    placeholder="Enter notes, observations, or extracted details..."
                    className={cn(
                      "mt-3 w-full rounded-xl border border-slate-700 px-3 py-3 text-sm text-slate-100 outline-none",
                      INPUT_BG
                    )}
                  />
                  <button
                    type="button"
                    onClick={saveNotes}
                    className="mt-3 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 hover:bg-slate-800"
                  >
                    Save Notes
                  </button>
                </div>

                {selectedMeasurement && (
                  <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
                    <div className="text-sm font-semibold text-white">Selected Measurement</div>
                    <div className="mt-3 space-y-2 text-sm text-slate-300">
                      <div>Type: {selectedMeasurement.type}</div>
                      <div>
                        Value:{" "}
                        {selectedMeasurement.quantity != null && selectedMeasurement.unit
                          ? `${formatNumber(selectedMeasurement.quantity, 2)} ${selectedMeasurement.unit}`
                          : "Uncalibrated"}
                      </div>
                      <div>Points: {selectedMeasurement.points.length}</div>
                      <div>
                        Linked:{" "}
                        {selectedMeasurement.linkedResource
                          ? `${selectedMeasurement.linkedResource.type} • ${selectedMeasurement.linkedResource.name}`
                          : "None"}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {rightTab === "settings" && (
              <div className="space-y-4">
                <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
                  <div className="text-sm font-semibold text-white">Viewer Settings</div>
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setZoom(1)}
                      className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 hover:bg-slate-800"
                    >
                      100%
                    </button>
                    <button
                      type="button"
                      onClick={resetView}
                      className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 hover:bg-slate-800"
                    >
                      Reset Pan
                    </button>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
                  <div className="text-sm font-semibold text-white">Calibration Status</div>
                  <div className="mt-3 space-y-2 text-sm text-slate-300">
                    <div>
                      Unit: <span className="text-white">{activePage?.calibration_unit || "—"}</span>
                    </div>
                    <div>
                      Distance:{" "}
                      <span className="text-white">
                        {activePage?.calibration_distance != null
                          ? formatNumber(Number(activePage.calibration_distance), 4)
                          : "—"}
                      </span>
                    </div>
                    <div>
                      Ratio:{" "}
                      <span className="text-white">
                        {activeScaleRatio ? formatNumber(activeScaleRatio, 6) : "Not calibrated"}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </aside>
      </div>

      {isCalibrationOpen && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
          <div className="w-full max-w-xl rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl">
            <div className="border-b border-slate-800 px-5 py-4">
              <div className="text-lg font-semibold text-white">Calibration</div>
              <div className="mt-1 text-sm text-slate-400">
                Start closes this dialog, lets you pick point 1 and point 2 on the drawing, then reopens here.
              </div>
            </div>

            <div className="space-y-5 px-5 py-5">
              <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
                <div className="text-sm font-medium text-white">Picked Points</div>
                <div className="mt-2 grid grid-cols-1 gap-2 text-sm text-slate-300">
                  <div>
                    Point 1:{" "}
                    {calibrationDraftP1
                      ? `${formatNumber(calibrationDraftP1.x, 1)}, ${formatNumber(calibrationDraftP1.y, 1)}`
                      : "Not picked"}
                  </div>
                  <div>
                    Point 2:{" "}
                    {calibrationDraftP2
                      ? `${formatNumber(calibrationDraftP2.x, 1)}, ${formatNumber(calibrationDraftP2.y, 1)}`
                      : "Not picked"}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-4 gap-3">
                <div>
                  <label className="mb-1 block text-xs text-slate-400">Feet / Value</label>
                  <input
                    value={calibrationFeet}
                    onChange={(e) => setCalibrationFeet(e.target.value)}
                    className={cn(
                      "w-full rounded-xl border border-slate-700 px-3 py-2 text-sm text-slate-100 outline-none",
                      INPUT_BG
                    )}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-slate-400">Inches</label>
                  <input
                    value={calibrationInches}
                    onChange={(e) => setCalibrationInches(e.target.value)}
                    className={cn(
                      "w-full rounded-xl border border-slate-700 px-3 py-2 text-sm text-slate-100 outline-none",
                      INPUT_BG
                    )}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-slate-400">Fraction</label>
                  <input
                    value={calibrationFraction}
                    onChange={(e) => setCalibrationFraction(e.target.value)}
                    placeholder="1/8"
                    className={cn(
                      "w-full rounded-xl border border-slate-700 px-3 py-2 text-sm text-slate-100 outline-none",
                      INPUT_BG
                    )}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-slate-400">Unit</label>
                  <select
                    value={calibrationUnit}
                    onChange={(e) => setCalibrationUnit(e.target.value)}
                    className={cn(
                      "w-full rounded-xl border border-slate-700 px-3 py-2 text-sm text-slate-100 outline-none",
                      INPUT_BG
                    )}
                  >
                    <option value="ft">ft</option>
                    <option value="in">in</option>
                    <option value="m">m</option>
                    <option value="cm">cm</option>
                  </select>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={beginCalibration}
                  className="rounded-xl border border-cyan-500/30 bg-cyan-500/15 px-4 py-2 text-sm text-cyan-200 hover:bg-cyan-500/20"
                >
                  Start / Restart
                </button>
                <button
                  type="button"
                  onClick={resetCalibrationDraft}
                  className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800"
                >
                  Reset Values
                </button>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-800 px-5 py-4">
              <button
                type="button"
                onClick={() => setIsCalibrationOpen(false)}
                className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  try {
                    await applyCalibration();
                  } catch (error: any) {
                    setPageError(error?.message || "Calibration failed.");
                  }
                }}
                className="rounded-xl border border-emerald-500/30 bg-emerald-500/15 px-4 py-2 text-sm text-emerald-200 hover:bg-emerald-500/20"
              >
                Apply Calibration
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TakeoffPage;