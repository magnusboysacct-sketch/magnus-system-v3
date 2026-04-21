import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import workerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { supabase } from "../lib/supabase";
import { computeQuantity } from "../lib/calculatorEngine";
import { useProjectContext } from "../context/ProjectContext";
import type {
  Measurement,
  CalibrationState,
} from "../features/takeoff/types/takeoff.types";

GlobalWorkerOptions.workerSrc = workerSrc;

type Point = { x: number; y: number };
type CalibPoint = { x: number; y: number };
type ToolMode = "select" | "line" | "area" | "count" | "volume";
type SidebarTab = "draw" | "measurements" | "groups" | "library" | "settings";

interface PdfFile {
  name: string;
  url: string;
  size: number;
  lastModified: number;
  storagePath?: string;
}

interface LinkedItem {
  id: string;
  name: string;
  unit: string;
  calc_engine_json?: any;
  type: 'item' | 'assembly';
  color?: string;
}

interface ItemQuantity {
  item_id: string;
  total_quantity: number;
  unit: string;
  source_measurements: string[];
  item: LinkedItem;
}

type GroupType = {
  id: string;
  name: string;
  color: string;
  visible: boolean;
  sortOrder: number;
  locked: boolean;
  trade?: string;
};

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function classNames(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function formatResult(value: number) {
  if (!Number.isFinite(value)) return "0";
  if (Math.abs(value) >= 1000) return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return value.toFixed(2);
}

function measurementTypeLabel(type: Measurement["type"]) {
  switch (type) {
    case "line":
      return "Line";
    case "area":
      return "Area";
    case "count":
      return "Count";
    case "volume":
      return "Volume";
    default:
      return type;
  }
}

function measurementIcon(type: Measurement["type"]) {
  switch (type) {
    case "line":
      return "📏";
    case "area":
      return "⬡";
    case "count":
      return "🔢";
    case "volume":
      return "📦";
    default:
      return "•";
  }
}

function toolHelpText(tool: ToolMode) {
  switch (tool) {
    case "select":
      return "Pan around page and inspect measurements.";
    case "line":
      return "Click two points to measure a line.";
    case "area":
      return "Click around shape. Double-click or press Enter to finish.";
    case "count":
      return "Click to place count markers.";
    case "volume":
      return "Click around base. Double-click or press Enter to set depth.";
    default:
      return "";
  }
}

type ScaleMode = "standard" | "fis" | "metric" | "auto";

type SavedCalibration = {
  p1: { x: number; y: number };
  p2: { x: number; y: number };
  realDistanceFeet: number;
  scaleFeetPerPixel: number;
  unit: "ft";
  createdAt: number;
};

function ScaleModal(props: {
  open: boolean;
  onClose: () => void;
  onApply: (lengthFeet: number, opts: { applyAllPages: boolean; autoDimLine: boolean }) => void;
  canApply: boolean;
  isCalibrating?: boolean;
  calibPointsCount?: number;
  canConfirmCalibration?: boolean;
  onCalibrationOk?: (lengthFeet: number) => void;
  onCalibrationCancel?: () => void;
}) {
  const {
    open,
    onClose,
    onApply,
    canApply,
    isCalibrating = false,
    calibPointsCount = 0,
    canConfirmCalibration = false,
    onCalibrationOk,
    onCalibrationCancel,
  } = props;

  const [tab, setTab] = useState<ScaleMode>("standard");
  const [stdFeet, setStdFeet] = useState("10");
  const [fisFeet, setFisFeet] = useState("");
  const [fisInch, setFisInch] = useState("");
  const [fisFrac, setFisFrac] = useState("");
  const [metricMeters, setMetricMeters] = useState("3");
  const [applyAllPages, setApplyAllPages] = useState(true);
  const [autoDimLine, setAutoDimLine] = useState(true);

  const canStartCalibration = calibPointsCount === 2;

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-950 shadow-2xl shadow-black/40">
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
          <div>
            <div className="text-lg font-semibold text-white">Scale</div>
            <div className="text-xs text-slate-400">Set drawing calibration</div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-slate-300 hover:bg-slate-800/60"
          >
            ✕
          </button>
        </div>
        <div className="px-5 pt-4">
          <div className="grid grid-cols-4 gap-2 text-sm">
            {[
              ["standard", "Standard"],
              ["fis", "F-I-S"],
              ["metric", "Metric"],
              ["auto", "Auto"],
            ].map(([k, label]) => (
              <button
                key={k}
                onClick={() => setTab(k as ScaleMode)}
                className={classNames(
                  "rounded-xl border px-3 py-2 transition",
                  tab === k
                    ? "border-slate-600 bg-slate-800 text-white"
                    : "border-slate-800 bg-slate-950 text-slate-300 hover:bg-slate-900"
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-900/30 p-4">
          {isCalibrating && (
            <div className="mb-3 rounded-xl border border-emerald-900/40 bg-emerald-950/20 px-3 py-2 text-sm text-emerald-300">
              Calibration mode: Click {calibPointsCount}/2 points on drawing
            </div>
          )}
          
          {tab === "standard" && (
            <div className="grid grid-cols-2 items-end gap-3">
              <div className="col-span-2 text-sm text-slate-300">
                Enter the real distance between your two clicked points:
              </div>
              <label className="text-xs text-slate-400">
                Feet
                <input
                  type="number"
                  value={stdFeet}
                  onChange={(e) => setStdFeet(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-slate-600"
                  placeholder="10"
                />
              </label>
              <div className="flex items-center text-xs text-slate-400">ft</div>
            </div>
          )}

          {tab === "fis" && (
            <div className="grid grid-cols-3 items-end gap-3">
              <label className="text-xs text-slate-400">
                Feet
                <input
                  type="number"
                  value={fisFeet}
                  onChange={(e) => setFisFeet(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-slate-600"
                  placeholder="45"
                />
              </label>

              <label className="text-xs text-slate-400">
                Inch
                <input
                  type="number"
                  value={fisInch}
                  onChange={(e) => setFisInch(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-slate-600"
                  placeholder="6"
                />
              </label>

              <label className="text-xs text-slate-400">
                Fraction
                <input
                  type="text"
                  value={fisFrac}
                  onChange={(e) => setFisFrac(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-slate-600"
                  placeholder="1/2"
                />
              </label>

              <div className="col-span-3 text-xs text-slate-500">
                Fraction accepts 1/2, 3/8, 0.25, etc.
              </div>
            </div>
          )}

          {tab === "metric" && (
            <div className="grid grid-cols-2 items-end gap-3">
              <div className="col-span-2 text-sm text-slate-300">Enter distance in meters:</div>
              <label className="text-xs text-slate-400">
                Meters
                <input
                  type="number"
                  value={metricMeters}
                  onChange={(e) => setMetricMeters(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-slate-600"
                  placeholder="3"
                />
              </label>
              <div className="flex items-center text-xs text-slate-400">m</div>
            </div>
          )}

          <div className="mt-4 space-y-2 text-sm">
            <label className="flex items-center gap-2 text-slate-300">
              <input
                type="checkbox"
                checked={applyAllPages}
                onChange={(e) => setApplyAllPages(e.target.checked)}
              />
              Apply scale to all pages
            </label>
            <label className="flex items-center gap-2 text-slate-300">
              <input
                type="checkbox"
                checked={autoDimLine}
                onChange={(e) => setAutoDimLine(e.target.checked)}
              />
              Automatically create dimension line
            </label>
          </div>
        </div>

        <div className="mt-5 flex items-center justify-between pb-5">
          <button
            onClick={() => onApply(0, { applyAllPages, autoDimLine })}
            className="rounded-xl bg-slate-800/50 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800/80"
          >
            Clear Scale
          </button>
          <div className="flex gap-2">
            <button
              onClick={onCalibrationCancel || onClose}
              className="rounded-xl bg-slate-800/40 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800/70"
            >
              Cancel
            </button>
            <button
              onClick={isCalibrating ? () => {
                let feet = 0;
                if (tab === "standard") {
                  feet = parseFloat(stdFeet) || 0;
                } else if (tab === "fis") {
                  const f = parseFloat(fisFeet) || 0;
                  const i = parseFloat(fisInch) || 0;
                  let frac = 0;
                  if (fisFrac.includes("/")) {
                    const [num, denom] = fisFrac.split("/").map((v: any) => parseFloat(v) || 0);
                    if (denom !== 0) frac = num / denom;
                  } else {
                    frac = parseFloat(fisFrac) || 0;
                  }
                  feet = f + (i + frac) / 12;
                } else if (tab === "metric") {
                  feet = (parseFloat(metricMeters) || 0) * 3.28084;
                }
                onCalibrationOk?.(feet);
              } : () => { onApply(0, { applyAllPages, autoDimLine }); }}
              disabled={!isCalibrating ? !canApply : !canConfirmCalibration}
              className={classNames(
                "rounded-xl border px-4 py-2 text-sm",
                (isCalibrating ? canConfirmCalibration : canApply)
                  ? "border-emerald-900/40 bg-emerald-900/50 text-white hover:bg-emerald-900/70"
                  : "border-slate-800 bg-slate-800/20 text-slate-500"
              )}
            >
              OK
            </button>
          </div>
        </div>

        {!(isCalibrating ? canConfirmCalibration : canApply) && (
          <div className="pb-5 text-xs text-slate-500">
            {isCalibrating
              ? `Click ${2 - calibPointsCount} more point${calibPointsCount === 1 ? "" : "s"} on drawing first, then press OK.`
              : "Click two points on the drawing first, then press OK."}
          </div>
        )}
      </div>
    </div>
  );
}

class TakeoffErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { err: any }
> {
  constructor(props: any) {
    super(props);
    this.state = { err: null };
  }

  static getDerivedStateFromError(err: any) {
    return { err };
  }

  componentDidCatch(err: any) {
    console.error("TAKEOFF PAGE CRASH:", err);
  }

  render() {
    if (this.state.err) {
      return (
        <div className="min-h-screen bg-slate-950 flex items-center justify-center p-8">
          <div className="text-center">
            <div className="text-2xl mb-4">⚠️</div>
            <div className="text-lg mb-2">Takeoff Page Error</div>
            <div className="text-sm text-slate-400 mb-4">
              Something went wrong. Please refresh the page.
            </div>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white"
            >
              Refresh Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children as any;
  }
}

function MeasurementLayer({
  measurements,
  scale,
  offsetX,
  offsetY,
  onMeasurementClick,
  onMeasurementHover,
}: {
  measurements: Measurement[];
  scale: number;
  offsetX: number;
  offsetY: number;
  onMeasurementClick?: (id: string) => void;
  onMeasurementHover?: (id: string | null) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderSeqRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const seq = ++renderSeqRef.current;

    measurements.forEach((m) => {
      if (m.type === "line") {
        const [a, b] = m.points;
        ctx.save();
        ctx.strokeStyle = m.color || "#ffffff";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(a.x * scale + offsetX, a.y * scale + offsetY);
        ctx.lineTo(b.x * scale + offsetX, b.y * scale + offsetY);
        ctx.stroke();

        // Draw label
        const midX = (a.x + b.x) / 2;
        const midY = (a.y + b.y) / 2;
        ctx.fillStyle = "rgba(96,165,250,0.9)";
        ctx.font = "12px sans-serif";
        const label = `${m.result.toFixed(2)} ${m.unit}`;
        const w = ctx.measureText(label).width;
        const h = 16;
        if ((ctx as any).roundRect) {
          (ctx as any).roundRect(midX * scale + offsetX - w / 2, midY * scale + offsetY - h - 8, w, h, 8);
        } else {
          ctx.beginPath();
          ctx.rect(midX * scale + offsetX - w / 2, midY * scale + offsetY - h - 8, w, h);
        }
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      } else if (m.type === "area") {
        ctx.save();
        ctx.strokeStyle = m.color || "#ffffff";
        ctx.fillStyle = (m.color || "#ffffff") + "20";
        ctx.lineWidth = 1;
        ctx.beginPath();
        m.points.forEach((p, i) => {
          if (i === 0) {
            ctx.moveTo(p.x * scale + offsetX, p.y * scale + offsetY);
          } else {
            ctx.lineTo(p.x * scale + offsetX, p.y * scale + offsetY);
          }
        });
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      } else if (m.type === "count") {
        m.points.forEach((p) => {
          ctx.save();
          ctx.fillStyle = m.color || "#ffffff";
          ctx.beginPath();
          ctx.arc(p.x * scale + offsetX, p.y * scale + offsetY, 4, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        });
      } else if (m.type === "volume") {
        ctx.save();
        ctx.strokeStyle = m.color || "#ffffff";
        ctx.fillStyle = (m.color || "#ffffff") + "20";
        ctx.lineWidth = 1;
        ctx.beginPath();
        m.points.forEach((p, i) => {
          if (i === 0) {
            ctx.moveTo(p.x * scale + offsetX, p.y * scale + offsetY);
          } else {
            ctx.lineTo(p.x * scale + offsetX, p.y * scale + offsetY);
          }
        });
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }
    });
  }, [measurements, scale, offsetX, offsetY]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 pointer-events-none"
      style={{ width: "100%", height: "100%" }}
    />
  );
}

function TakeoffPageInner() {
  const { projectId: routeProjectId } = useParams<{ projectId?: string }>();
  const nav = useNavigate();
  const [pdf, setPdf] = useState<any>(null);
  const [numPages, setNumPages] = useState(0);
  const [pageNumber, setPageNumber] = useState(1);
  const [panZoom, setPanZoom] = useState({ zoom: 1, panX: 0, panY: 0 });
  const [showDepthPrompt, setShowDepthPrompt] = useState(false);
  const [depthInput, setDepthInput] = useState("4");
  const [pdfFile, setPdfFile] = useState<PdfFile | null>(null);
  const [selectedMeasurementId, setSelectedMeasurementId] = useState<string | null>(null);
  const [undoStack, setUndoStack] = useState<Measurement[]>([]);
  const [hoveredPoint, setHoveredPoint] = useState<Point | null>(null);
  const [hoveredLine, setHoveredLine] = useState<{ start: Point; end: Point; measurementId: string } | null>(null);
  const [crosshairPos, setCrosshairPos] = useState<Point | null>(null);
  const [selectedLinkedItem, setSelectedLinkedItem] = useState<LinkedItem | null>(null);
  const [itemQuantities, setItemQuantities] = useState<Map<string, ItemQuantity>>(new Map());

  // NEW Calibration state
  const [currentCalibration, setCurrentCalibration] = useState<SavedCalibration | null>(null);
  const [calibrationDraftPoints, setCalibrationDraftPoints] = useState<Point[]>([]);
  const [calibrationHoverPoint, setCalibrationHoverPoint] = useState<Point | null>(null);
  const [isCalibrating, setIsCalibrating] = useState(false);

  const [measurements, setAllMeasurements] = useState<Measurement[]>([]);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [activeCostItem, setActiveCostItem] = useState<any>(null);
  const [showNewGroupForm, setShowNewGroupForm] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "error">("saved");
  const [error, setError] = useState<string | null>(null);
  const [loadingPdf, setLoadingPdf] = useState(false);
  const [overViewer, setOverViewer] = useState(false);
  const [scaleModalOpen, setScaleModalOpen] = useState(false);

  const fitScaleRef = useRef<number | null>(null);
  const viewerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderSeqRef = useRef(0);
  const renderTaskRef = useRef<any>(null);
  const panStartRef = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
  const activePointerIdRef = useRef<number | null>(null);

  const [tool, setTool] = useState<ToolMode>("select");
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>("draw");

  const [lineStart, setLineStart] = useState<Point | null>(null);
  const [lineEnd, setLineEnd] = useState<Point | null>(null);
  const [areaPoints, setAreaPoints] = useState<Point[]>([]);
  const [areaHoverPt, setAreaHoverPt] = useState<Point | null>(null);
  const [volumePoints, setVolumePoints] = useState<Point[]>([]);
  const [volumeHoverPt, setVolumeHoverPt] = useState<Point | null>(null);
  const [hoverPt, setHoverPt] = useState<Point | null>(null);
  const [canvasWidth, setCanvasWidth] = useState(0);
  const [canvasHeight, setCanvasHeight] = useState(0);

  const [groups, setGroups] = useState<GroupType[]>([]);

  // Phase 1 Organization state
  const [folders, setFolders] = useState<any[]>([]);
  const [tags, setTags] = useState<any[]>([]);
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);

  // Manager UI state
  const [showAddFolder, setShowAddFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [showAddTag, setShowAddTag] = useState(false);
  const [newTagName, setNewTagName] = useState("");
  const [newTagGroup, setNewTagGroup] = useState("");

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(() => {
    return routeProjectId || null;
  });
  const [currentProject, setCurrentProject] = useState<any>(null);
  const [dbLoaded, setDbLoaded] = useState(false);

  // Global project context
  const { currentProject: globalProject } = useProjectContext();

  // Safe project ID getter with global context fallback
  const projectId = routeProjectId || activeProjectId || globalProject?.id;

  const hoverCanvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const hoverSeqRef = useRef(0);
  const overlaySeqRef = useRef(0);
  const rafIdRef = useRef<number | null>(null);
  const hoverStateRef = useRef<{ hoverPt: Point | null; lineEnd: Point | null }>({ hoverPt: null, lineEnd: null });
  const isSpaceDownRef = useRef(false);
  const isPanningRef = useRef(false);
  const hasPointerDownRef = useRef(false);

  // LAYER 1: PDF-only rendering - completely isolated
  async function renderPdfPage() {
    if (!canvasRef.current || !viewerRef.current || !pdf) return;

    const seq = ++renderSeqRef.current;

    // HARD LOCK: Cancel any existing render task
    if (renderTaskRef.current) {
      try {
        renderTaskRef.current.cancel();
        await renderTaskRef.current.promise;
      } catch (e: any) {
        // Ignore RenderingCancelledException
        if (e?.name !== 'RenderingCancelledException') {
          console.warn('Render cancellation error:', e);
        }
      }
      renderTaskRef.current = null;
    }

    // Race condition guard
    if (seq !== renderSeqRef.current) return;

    const page = await pdf.getPage(pageNumber);

    // Race condition guard
    if (seq !== renderSeqRef.current) return;

    if (fitScaleRef.current == null) {
      const viewport = page.getViewport({ scale: 1.5 });
      setCanvasWidth(viewport.width);
      setCanvasHeight(viewport.height);
    }

    const viewport = page.getViewport({ 
      scale: panZoom.zoom,
      offsetX: -panZoom.panX,
      offsetY: -panZoom.panY
    });
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.width = viewport.width;
    canvas.height = viewport.height;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Render PDF page with cancellable task - PURE rendering, no manual transforms
    const renderTask = page.render({ canvasContext: ctx, viewport });
    renderTaskRef.current = renderTask;
    
    try {
      await renderTask.promise;
    } catch (e: any) {
      if (e?.name === 'RenderingCancelledException') {
        return; // Don't continue if cancelled
      }
      throw e; // Re-throw other errors
    } finally {
      renderTaskRef.current = null;
    }

    // Only continue if this render is still the latest
    if (seq !== renderSeqRef.current) return;
  }

  // LAYER 2: Overlay rendering - no PDF rendering
  function renderOverlay() {
    const canvas = overlayCanvasRef.current;
    const pdfCanvas = canvasRef.current;
    if (!canvas || !pdfCanvas) return;

    const seq = ++overlaySeqRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Match PDF canvas size exactly for pixel-perfect alignment
    canvas.width = pdfCanvas.width;
    canvas.height = pdfCanvas.height;
    
    // Set canvas CSS size to match PDF canvas display size
    canvas.style.width = pdfCanvas.style.width;
    canvas.style.height = pdfCanvas.style.height;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw selected measurement highlight
    if (selectedMeasurementId) {
      const measurement = measurements.find(m => m.id === selectedMeasurementId);
      if (measurement) {
        const color = measurement.linked_item_id 
          ? itemQuantities.get(measurement.linked_item_id)?.item.color || measurement.color || "#ffffff"
          : measurement.color || "#ffffff";
        
        ctx.save();
        ctx.strokeStyle = color;
        ctx.lineWidth = 4;
        ctx.shadowColor = color;
        ctx.shadowBlur = 8;
        
        if (measurement.type === "line" && measurement.points.length === 2) {
          const [a, b] = measurement.points;
          ctx.beginPath();
          ctx.moveTo(a.x * panZoom.zoom + panZoom.panX, a.y * panZoom.zoom + panZoom.panY);
          ctx.lineTo(b.x * panZoom.zoom + panZoom.panX, b.y * panZoom.zoom + panZoom.panY);
          ctx.stroke();
        } else if (measurement.type === "area" && measurement.points.length >= 3) {
          ctx.beginPath();
          measurement.points.forEach((p, i) => {
            if (i === 0) {
              ctx.moveTo(p.x * panZoom.zoom + panZoom.panX, p.y * panZoom.zoom + panZoom.panY);
            } else {
              ctx.lineTo(p.x * panZoom.zoom + panZoom.panX, p.y * panZoom.zoom + panZoom.panY);
            }
          });
          ctx.closePath();
          ctx.stroke();
        } else if (measurement.type === "volume" && measurement.points.length >= 3) {
          ctx.beginPath();
          measurement.points.forEach((p, i) => {
            if (i === 0) {
              ctx.moveTo(p.x * panZoom.zoom + panZoom.panX, p.y * panZoom.zoom + panZoom.panY);
            } else {
              ctx.lineTo(p.x * panZoom.zoom + panZoom.panX, p.y * panZoom.zoom + panZoom.panY);
            }
          });
          ctx.closePath();
          ctx.stroke();
        } else if (measurement.type === "count") {
          measurement.points.forEach((p) => {
            ctx.beginPath();
            ctx.arc(p.x * panZoom.zoom + panZoom.panX, p.y * panZoom.zoom + panZoom.panY, 6, 0, Math.PI * 2);
            ctx.stroke();
          });
        }
        
        ctx.restore();
      }
    }

    // Draw hover highlights
    if (hoveredPoint) {
      ctx.save();
      ctx.strokeStyle = "#fbbf24";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(hoveredPoint.x * panZoom.zoom + panZoom.panX, hoveredPoint.y * panZoom.zoom + panZoom.panY, 6, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    if (hoveredLine) {
      ctx.save();
      ctx.strokeStyle = "#fbbf24";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(hoveredLine.start.x * panZoom.zoom + panZoom.panX, hoveredLine.start.y * panZoom.zoom + panZoom.panY);
      ctx.lineTo(hoveredLine.end.x * panZoom.zoom + panZoom.panX, hoveredLine.end.y * panZoom.zoom + panZoom.panY);
      ctx.stroke();
      ctx.restore();
    }

    // Draw saved calibration if exists - CLEAN CALIBRATION ONLY
    if (currentCalibration) {
      ctx.save();
      ctx.strokeStyle = "#ef4444";
      ctx.fillStyle = "#ef4444";
      ctx.lineWidth = 3;
      ctx.shadowColor = "#ef4444";
      ctx.shadowBlur = 6;
      
      // Draw saved calibration points
      ctx.beginPath();
      ctx.arc(currentCalibration.p1.x * panZoom.zoom + panZoom.panX, currentCalibration.p1.y * panZoom.zoom + panZoom.panY, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(currentCalibration.p1.x * panZoom.zoom + panZoom.panX, currentCalibration.p1.y * panZoom.zoom + panZoom.panY, 4, 0, Math.PI * 2);
      ctx.fill();
      
      ctx.fillStyle = "#ef4444";
      ctx.beginPath();
      ctx.arc(currentCalibration.p2.x * panZoom.zoom + panZoom.panX, currentCalibration.p2.y * panZoom.zoom + panZoom.panY, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(currentCalibration.p2.x * panZoom.zoom + panZoom.panX, currentCalibration.p2.y * panZoom.zoom + panZoom.panY, 4, 0, Math.PI * 2);
      ctx.fill();
      
      // Draw saved calibration line
      ctx.strokeStyle = "#ef4444";
      ctx.lineWidth = 3;
      ctx.shadowColor = "#ef4444";
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.moveTo(currentCalibration.p1.x * panZoom.zoom + panZoom.panX, currentCalibration.p1.y * panZoom.zoom + panZoom.panY);
      ctx.lineTo(currentCalibration.p2.x * panZoom.zoom + panZoom.panX, currentCalibration.p2.y * panZoom.zoom + panZoom.panY);
      ctx.stroke();
      
      // Draw saved calibration label
      const label = formatFeetInches(currentCalibration.realDistanceFeet);
      const midX = (currentCalibration.p1.x + currentCalibration.p2.x) / 2;
      const midY = (currentCalibration.p1.y + currentCalibration.p2.y) / 2;
      ctx.fillStyle = "rgba(239,68,68,0.95)";
      ctx.font = "bold 14px sans-serif";
      const w = ctx.measureText(label).width;
      const h = 20;
      if ((ctx as any).roundRect) {
        (ctx as any).roundRect(midX * panZoom.zoom + panZoom.panX - w / 2 - 4, midY * panZoom.zoom + panZoom.panY - h - 10, w + 8, h + 4, 8);
      } else {
        ctx.beginPath();
        ctx.rect(midX * panZoom.zoom + panZoom.panX - w / 2 - 4, midY * panZoom.zoom + panZoom.panY - h - 10, w + 8, h + 4);
      }
      ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.fillText(label, midX * panZoom.zoom + panZoom.panX - w / 2, midY * panZoom.zoom + panZoom.panY - 6);
      ctx.restore();
    }
    
    
    // Draw area preview with dashed line to cursor
    if (tool === "area" && areaPoints.length > 0 && areaHoverPt) {
      ctx.save();
      const color = selectedLinkedItem?.color || "#a78bfa";
      ctx.strokeStyle = color;
      ctx.fillStyle = color + "20";
      ctx.lineWidth = 1;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      areaPoints.forEach((p, i) => {
        if (i === 0) {
          ctx.moveTo(p.x * panZoom.zoom + panZoom.panX, p.y * panZoom.zoom + panZoom.panY);
        } else {
          ctx.lineTo(p.x * panZoom.zoom + panZoom.panX, p.y * panZoom.zoom + panZoom.panY);
        }
      });
      ctx.lineTo(areaHoverPt.x * panZoom.zoom + panZoom.panX, areaHoverPt.y * panZoom.zoom + panZoom.panY);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    // Draw volume preview with dashed line to cursor
    if (tool === "volume" && volumePoints.length > 0 && volumeHoverPt) {
      ctx.save();
      const color = selectedLinkedItem?.color || "#f59e0b";
      ctx.strokeStyle = color;
      ctx.fillStyle = color + "20";
      ctx.lineWidth = 1;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      volumePoints.forEach((p, i) => {
        if (i === 0) {
          ctx.moveTo(p.x * panZoom.zoom + panZoom.panX, p.y * panZoom.zoom + panZoom.panY);
        } else {
          ctx.lineTo(p.x * panZoom.zoom + panZoom.panX, p.y * panZoom.zoom + panZoom.panY);
        }
      });
      ctx.lineTo(volumeHoverPt.x * panZoom.zoom + panZoom.panX, volumeHoverPt.y * panZoom.zoom + panZoom.panY);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  }

  // LAYER 3: Hover rendering with RAF throttling
  function renderHover() {
    const canvas = hoverCanvasRef.current;
    const pdfCanvas = canvasRef.current;
    if (!canvas || !pdfCanvas) return;

    const seq = ++hoverSeqRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Match PDF canvas size exactly for pixel-perfect alignment
    canvas.width = pdfCanvas.width;
    canvas.height = pdfCanvas.height;
    
    // Set canvas CSS size to match PDF canvas display size
    canvas.style.width = pdfCanvas.style.width;
    canvas.style.height = pdfCanvas.style.height;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const { hoverPt, lineEnd } = hoverStateRef.current;

    // Draw crosshair cursor
    if (crosshairPos && tool !== "select") {
      ctx.save();
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.6;
      
      const x = crosshairPos.x * panZoom.zoom + panZoom.panX;
      const y = crosshairPos.y * panZoom.zoom + panZoom.panY;
      const size = 20;
      
      // Horizontal line - ALWAYS begin new path
      ctx.beginPath();
      ctx.moveTo(x - size, y);
      ctx.lineTo(x + size, y);
      ctx.stroke();
      
      // Vertical line - ALWAYS begin new path
      ctx.beginPath();
      ctx.moveTo(x, y - size);
      ctx.lineTo(x, y + size);
      ctx.stroke();
      
      // Show selected item name
      if (selectedLinkedItem) {
        ctx.fillStyle = "rgba(255,255,255,0.9)";
        ctx.font = "11px sans-serif";
        const text = selectedLinkedItem.name;
        const textWidth = ctx.measureText(text).width;
        ctx.fillText(text, x + size + 5, y - 5);
      }
      
      ctx.restore();
    }

    // Draw hover indicator - STATELESS
    if (hoverPt && tool !== "select") {
      ctx.save();
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1;
      // ALWAYS begin new path - no accumulation
      ctx.beginPath();
      ctx.arc(hoverPt.x * panZoom.zoom + panZoom.panX, hoverPt.y * panZoom.zoom + panZoom.panY, 3, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // Draw live line preview with distance - STATELESS single line
    if (tool === "line" && lineStart && (hoverPt || lineEnd)) {
      const a = lineStart;
      const b = lineEnd || hoverPt;
      if (a && b) {
        const color = selectedLinkedItem?.color || "#60a5fa";
        ctx.save();
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        // ALWAYS begin new path - draw only start point to current cursor
        ctx.beginPath();
        ctx.moveTo(a.x * panZoom.zoom + panZoom.panX, a.y * panZoom.zoom + panZoom.panY);
        ctx.lineTo(b.x * panZoom.zoom + panZoom.panX, b.y * panZoom.zoom + panZoom.panY);
        ctx.stroke();

        // Draw live distance label
        const pixelDist = dist(a, b);
        const totalFeet = distFeet(a, b);
        const label = totalFeet > 0 
          ? formatFeetInches(totalFeet)
          : `${pixelDist.toFixed(0)} px`;
        
        // Add item name if linked
        const fullLabel = selectedLinkedItem 
          ? `${selectedLinkedItem.name}: ${label}`
          : label;

        const midX = (a.x + b.x) / 2;
        const midY = (a.y + b.y) / 2;
        ctx.fillStyle = "rgba(96,165,250,0.9)";
        ctx.font = "12px sans-serif";
        const w = ctx.measureText(fullLabel).width;
        const h = 16;
        if ((ctx as any).roundRect) {
          (ctx as any).roundRect(midX * panZoom.zoom + panZoom.panX - w / 2, midY * panZoom.zoom + panZoom.panY - h - 8, w, h, 8);
        } else {
          ctx.beginPath();
          ctx.rect(midX * panZoom.zoom + panZoom.panX - w / 2, midY * panZoom.zoom + panZoom.panY - h - 8, w, h);
        }
        ctx.fill();
        ctx.fillStyle = "#ffffff";
        ctx.fillText(fullLabel, midX * panZoom.zoom + panZoom.panX - w / 2, midY * panZoom.zoom + panZoom.panY - 2);
        ctx.restore();
      }
    }
    
    // Draw calibration draft points and preview line in hover layer - CLEAN CALIBRATION ONLY
    if (isCalibrating && calibrationDraftPoints.length > 0) {
      ctx.save();
      ctx.strokeStyle = "#ef4444";
      ctx.fillStyle = "#ef4444";
      ctx.lineWidth = 3;
      ctx.shadowColor = "#ef4444";
      ctx.shadowBlur = 6;
      
      // Draw draft points with labels
      calibrationDraftPoints.forEach((p, i) => {
        // Draw point
        ctx.beginPath();
        ctx.arc(p.x * panZoom.zoom + panZoom.panX, p.y * panZoom.zoom + panZoom.panY, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(p.x * panZoom.zoom + panZoom.panX, p.y * panZoom.zoom + panZoom.panY, 4, 0, Math.PI * 2);
        ctx.fill();
        
        // Draw label
        ctx.fillStyle = "#ef4444";
        ctx.font = "bold 12px sans-serif";
        const labelText = `${i + 1}`;
        const textW = ctx.measureText(labelText).width;
        ctx.fillText(labelText, p.x * panZoom.zoom + panZoom.panX - textW / 2, p.y * panZoom.zoom + panZoom.panY - 12);
      });
      
      // Draw preview line from point 1 to hover point
      if (calibrationDraftPoints.length === 1 && calibrationHoverPoint) {
        ctx.strokeStyle = "#ef4444";
        ctx.lineWidth = 2;
        ctx.setLineDash([8, 4]);
        ctx.beginPath();
        ctx.moveTo(calibrationDraftPoints[0].x * panZoom.zoom + panZoom.panX, calibrationDraftPoints[0].y * panZoom.zoom + panZoom.panY);
        ctx.lineTo(calibrationHoverPoint.x * panZoom.zoom + panZoom.panX, calibrationHoverPoint.y * panZoom.zoom + panZoom.panY);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      
      ctx.restore();
    }
  }

  // Throttled hover update using RAF
  function updateHoverState(newHoverPt: Point | null, newLineEnd: Point | null) {
    hoverStateRef.current = { hoverPt: newHoverPt, lineEnd: newLineEnd };
    
    if (rafIdRef.current) {
      cancelAnimationFrame(rafIdRef.current);
    }
    
    rafIdRef.current = requestAnimationFrame(() => {
      renderHover();
      rafIdRef.current = null;
    });
  }

  // Legacy render function for compatibility
  async function render() {
    await renderPdfPage();
    renderOverlay();
  }

  function drawOverlay(ctx: CanvasRenderingContext2D) {
    // This function is kept for compatibility but no longer used
    // Overlay rendering is now handled by renderOverlay() and renderHover()
  }

  function addMeasurement(m: Omit<Measurement, "id">) {
    const newMeasurement = {
      ...m,
      id: crypto.randomUUID(),
      timestamp: Date.now(),
    };
    setAllMeasurements((prev) => [...prev, newMeasurement]);
    
    // Calculate quantity if linked item exists
    if (selectedLinkedItem) {
      calculateAndUpdateQuantity(newMeasurement, selectedLinkedItem);
    }
    
    return newMeasurement;
  }

  function updateMeasurement(id: string, updates: Partial<Measurement>) {
    setAllMeasurements((prev) =>
      prev.map((m) => (m.id === id ? { ...m, ...updates } : m))
    );
    
    // Recalculate quantity if measurement has linked item
    const measurement = measurements.find(m => m.id === id);
    if (measurement && measurement.linked_item_id) {
      const linkedItem = selectedLinkedItem || {
        id: measurement.linked_item_id,
        name: measurement.linked_item_name || '',
        unit: measurement.unit,
        type: 'item' as const,
      };
      calculateAndUpdateQuantity({ ...measurement, ...updates }, linkedItem);
    }
  }

  function removeMeasurement(id: string) {
    const measurement = measurements.find(m => m.id === id);
    if (measurement) {
      // Add to undo stack before removing
      setUndoStack(prev => [...prev.slice(-9), measurement]);
      
      // Remove from item quantities
      if (measurement.linked_item_id) {
        const currentQuantities = itemQuantities.get(measurement.linked_item_id);
        if (currentQuantities) {
          const updatedMeasurements = currentQuantities.source_measurements.filter(mId => mId !== id);
          if (updatedMeasurements.length === 0) {
            setItemQuantities(prev => {
              const newMap = new Map(prev);
              newMap.delete(measurement.linked_item_id!);
              return newMap;
            });
          } else {
            // Recalculate total quantity
            const remainingMeasurements = measurements.filter(m => 
              m.linked_item_id === measurement.linked_item_id && m.id !== id
            );
            const totalQuantity = remainingMeasurements.reduce((sum, m) => sum + (m.calculated_quantity || m.result), 0);
            
            setItemQuantities(prev => {
              const newMap = new Map(prev);
              newMap.set(measurement.linked_item_id!, {
                ...currentQuantities,
                total_quantity: totalQuantity,
                source_measurements: updatedMeasurements,
              });
              return newMap;
            });
          }
        }
      }
    }
    
    setAllMeasurements((prev) => prev.filter((m) => m.id !== id));
    if (selectedMeasurementId === id) {
      setSelectedMeasurementId(null);
    }
  }

  function calculateAndUpdateQuantity(measurement: Measurement, linkedItem: LinkedItem) {
    try {
      let calculatedQuantity = measurement.result;
      
      if (linkedItem.calc_engine_json) {
        const calcJson = typeof linkedItem.calc_engine_json === 'string' 
          ? JSON.parse(linkedItem.calc_engine_json) 
          : linkedItem.calc_engine_json;
          
        if (calcJson.formulas?.qty) {
          let vars: any = {};
          
          switch (measurement.type) {
            case "line":
              vars = { length: measurement.result };
              break;
            case "area":
              vars = { area: measurement.result };
              break;
            case "volume":
              vars = {
                length: Math.sqrt(measurement.result * 27),
                width: Math.sqrt(measurement.result * 27),
                height: 1,
              };
              break;
            case "count":
              vars = { count: measurement.result };
              break;
          }
          
          const calcResult = computeQuantity(calcJson.formulas.qty, vars, {
            roundTo: 2,
            clampZero: true,
          });
          
          calculatedQuantity = calcResult.ok ? calcResult.value : measurement.result;
        }
      }
      
      // Update measurement with calculated quantity and linked item info
      updateMeasurement(measurement.id, {
        calculated_quantity: calculatedQuantity,
        linked_item_id: linkedItem.id,
        linked_item_name: linkedItem.name,
        unit: linkedItem.unit,
      });
      
      // Update item quantities aggregation
      const existingQuantity = itemQuantities.get(linkedItem.id);
      const measurementIds = existingQuantity?.source_measurements || [];
      
      if (!measurementIds.includes(measurement.id)) {
        const updatedMeasurements = [...measurementIds, measurement.id];
        const allLinkedMeasurements = measurements.filter(m => 
          m.linked_item_id === linkedItem.id || updatedMeasurements.includes(m.id)
        );
        const totalQuantity = allLinkedMeasurements.reduce((sum, m) => 
          sum + (m.calculated_quantity || m.result), 0
        );
        
        setItemQuantities(prev => {
          const newMap = new Map(prev);
          newMap.set(linkedItem.id, {
            item_id: linkedItem.id,
            total_quantity: totalQuantity,
            unit: linkedItem.unit,
            source_measurements: updatedMeasurements,
            item: linkedItem,
          });
          return newMap;
        });
      }
      
    } catch (err) {
      console.error('Quantity calculation error:', err);
    }
  }

  function findNearestPoint(point: Point, tolerance: number = 15): Point | null {
    const allPoints: Point[] = [];
    
    // Add measurement points
    measurements.forEach(m => {
      m.points.forEach(p => allPoints.push(p));
    });
    
    // Add calibration draft points to search
    calibrationDraftPoints.forEach(p => allPoints.push(p));
    
    let nearest: Point | null = null;
    let minDist = tolerance;
    
    allPoints.forEach(p => {
      const d = dist(point, p);
      if (d < minDist) {
        minDist = d;
        nearest = p;
      }
    });
    
    return nearest;
  }

  function findNearestLine(point: Point, tolerance: number = 15): { start: Point; end: Point; measurementId: string } | null {
    let nearest: { start: Point; end: Point; measurementId: string } | null = null;
    let minDist = tolerance;
    
    measurements.forEach(m => {
      if (m.type === "line" && m.points.length === 2) {
        const [start, end] = m.points;
        const d = distanceToLineSegment(point, start, end);
        if (d < minDist) {
          minDist = d;
          nearest = { start, end, measurementId: m.id };
        }
      }
    });
    
    return nearest;
  }

  function distanceToLineSegment(point: Point, start: Point, end: Point): number {
    const A = point.x - start.x;
    const B = point.y - start.y;
    const C = end.x - start.x;
    const D = end.y - start.y;
    
    const dot = A * C + B * D;
    const lenSq = C * C + D * D;
    let param = -1;
    
    if (lenSq !== 0) {
      param = dot / lenSq;
    }
    
    let xx, yy;
    
    if (param < 0) {
      xx = start.x;
      yy = start.y;
    } else if (param > 1) {
      xx = end.x;
      yy = end.y;
    } else {
      xx = start.x + param * C;
      yy = start.y + param * D;
    }
    
    const dx = point.x - xx;
    const dy = point.y - yy;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function toggleGroupVisibility(groupId: string) {
    setGroups((prev) =>
      prev.map((g) => (g.id === groupId ? { ...g, visible: !g.visible } : g))
    );
  }

  function dist(a: Point, b: Point) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function toNumber(val: any): number {
    if (val === null || val === undefined || val === "") return 0;
    const n = Number(val);
    return isNaN(n) ? 0 : n;
  }

  function parseFraction(frac: string): number {
    if (!frac.includes("/")) return toNumber(frac);
    const [num, denom] = frac.split("/").map(toNumber);
    if (denom === 0) return 0;
    return num / denom;
  }

  function parseFis(feet: string, inches: string, fraction: string): number {
    const f = toNumber(feet);
    const i = toNumber(inches);
    const frac = parseFraction(fraction);
    return f + i / 12 + frac;
  }

  function formatFeetInches(totalFeet: number) {
    if (!isFinite(totalFeet) || totalFeet <= 0) return "";
    const feet = Math.floor(totalFeet);
    const inchesTotal = (totalFeet - feet) * 12;
    let inches = Math.floor(inchesTotal);
    let frac = inchesTotal - inches;

    let num = Math.round(frac * 16);
    const denom = 16;

    let fFeet = feet;
    let fIn = inches;

    if (num === denom) {
      num = 0;
      fIn += 1;
    }
    if (fIn === 12) {
      fIn = 0;
      fFeet += 1;
    }

    const fracStr = num === 0 ? "" : ` ${num}/${denom}`;
    return `${fFeet}' ${fIn}"${fracStr}`;
  }

  let alive = false;

  // Phase 1: Load organization data (folders and tags)
  async function loadOrganizationData(projectId: string) {
    try {
      // Load folders
      const { data: foldersData } = await supabase
        .from("takeoff_folders")
        .select("*")
        .eq("project_id", projectId)
        .order("sort_order", { ascending: true });
      
      setFolders(foldersData || []);

      // Load tags
      const { data: tagsData } = await supabase
        .from("takeoff_tags")
        .select("*")
        .eq("project_id", projectId)
        .order("tag_name", { ascending: true });
      
      setTags(tagsData || []);
    } catch (err) {
      console.warn("Failed to load organization data:", err);
    }
  }

  // Add folder function
  async function addFolder() {
    if (!newFolderName.trim() || !projectId) return;
    
    try {
      const { data: newFolder, error } = await supabase
        .from("takeoff_folders")
        .insert({
          project_id: projectId,
          company_id: globalProject?.company_id || null,
          folder_name: newFolderName.trim(),
          folder_type: 'standard',
          path_text: newFolderName.trim(),
          depth: 0,
          sort_order: folders.length,
          is_system_generated: false,
          is_locked: false,
        })
        .select()
        .single();
      
      if (error) throw error;
      
      if (newFolder) {
        setFolders(prev => [...prev, newFolder]);
        setNewFolderName("");
        setShowAddFolder(false);
      }
    } catch (err: any) {
      console.error("Failed to add folder:", err);
      setError("Failed to add folder: " + (err?.message || String(err)));
    }
  }

  // Add tag function
  async function addTag() {
    if (!newTagName.trim() || !projectId) return;
    
    try {
      const { data: newTag, error } = await supabase
        .from("takeoff_tags")
        .insert({
          project_id: projectId,
          company_id: globalProject?.company_id || null,
          tag_name: newTagName.trim(),
          tag_group: newTagGroup.trim() || null,
          is_system_generated: false,
        })
        .select()
        .single();
      
      if (error) throw error;
      
      if (newTag) {
        setTags(prev => [...prev, newTag]);
        setNewTagName("");
        setNewTagGroup("");
        setShowAddTag(false);
      }
    } catch (err: any) {
      console.error("Failed to add tag:", err);
      setError("Failed to add tag: " + (err?.message || String(err)));
    }
  }

  async function loadProject() {
    alive = true;
    
    // Phase 1: Load project info (with timeout protection)
    try {
      if (!projectId) {
        // Only show error if no project in global context either
        if (!globalProject) {
          setError("Please select a project first");
        }
        return;
      }

      // Add timeout to project lookup
      const projectPromise = supabase
        .from("projects")
        .select("id, name")
        .eq("id", projectId)
        .single();
        
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error("Project lookup timeout")), 10000)
      );
        
      const { data: project, error } = await Promise.race([projectPromise, timeoutPromise]) as any;

      if (error) throw error;
      if (!project) throw new Error("Project not found");

      setCurrentProject(project);
      setActiveProjectId(projectId);
    } catch (e: any) {
      console.error("Project lookup failed:", e);
      setError("Project lookup failed: " + (e?.message || String(e)));
      setDbLoaded(true); // Still mark as loaded to allow manual PDF upload
      return;
    }
    
    // Phase 2: Load session data (best-effort)
    try {
      // Add timeout to session lookup
      const sessionPromise = supabase
        .from("takeoff_sessions")
        .select("*")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();
        
      const sessionTimeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error("Session lookup timeout")), 10000)
      );
        
      const { data: session } = await Promise.race([sessionPromise, sessionTimeoutPromise]) as any;

      if (session) {
        setSessionId(session.id);
        setGroups(session.groups || []);
        setActiveGroupId(session.active_group_id || null);
        
        // Dual-load: Structured first, legacy as fallback
        // Note: Individual measurement loading handled by useEffect above
        setGroups(session.groups || []);
        setActiveGroupId(session.active_group_id || null);
        
        // Restore calibration if available
        if (session.scale?.calibration) {
          setCurrentCalibration(session.scale.calibration);
        }
        
        setPageNumber(session.page_number || 1);
        
        // Phase 3: Restore PDF if available (best-effort)
        if (session.pdf_file && session.pdf_file.storagePath) {
          setPdfFile(session.pdf_file);
          try {
            // Create fresh signed URL for private bucket
            const { data: signedData } = await supabase.storage
              .from("project-files")
              .createSignedUrl(session.pdf_file.storagePath, 60 * 60 * 24 * 7); // 7 days
            
            if (signedData?.signedUrl) {
              // Load PDF from signed URL
              const pdfDoc = await getDocument(signedData.signedUrl).promise;
              setPdf(pdfDoc);
              setNumPages(pdfDoc.numPages);
            }
          } catch (e) {
            console.warn("Failed to restore PDF:", e);
            // Don't block session loading if PDF fails
          }
        }
        
        // Restore pan/zoom
        if (session.pan_zoom) {
          setPanZoom(session.pan_zoom);
        }
      } else {
        // Create new session (with timeout protection)
        const newSessionPromise = supabase
          .from("takeoff_sessions")
          .insert({
            project_id: activeProjectId,
            measurements: [],
            groups: [],
            page_number: 1,
          })
          .select()
          .single();
          
        const newSessionTimeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error("Session creation timeout")), 10000)
        );
          
        const { data: newSession } = await Promise.race([newSessionPromise, newSessionTimeoutPromise]) as any;

        if (newSession) {
          setSessionId(newSession.id);
        }
      }
    } catch (e: any) {
      console.error("Session sync failed:", e);
      setError("Session sync failed: " + (e?.message || String(e)));
      // Don't block - allow manual PDF upload
    }

    // Phase 4: Load organization data
      if (projectId) {
        await loadOrganizationData(projectId);
      }

      setDbLoaded(true);
  }

  useEffect(() => {
    loadProject();
    return () => {
      alive = false;
    };
  }, [activeProjectId]);

  useEffect(() => {
    if (!dbLoaded) return;

    const defaultGroups = [
      { id: "1", name: "General", color: "#60a5fa", visible: true, sortOrder: 0, locked: false },
      { id: "2", name: "Electrical", color: "#f59e0b", visible: true, sortOrder: 1, locked: false },
      { id: "3", name: "Plumbing", color: "#10b981", visible: true, sortOrder: 2, locked: false },
      { id: "4", name: "HVAC", color: "#8b5cf6", visible: true, sortOrder: 3, locked: false },
    ];

    if (groups.length === 0) {
      setGroups(defaultGroups);
      setActiveGroupId(defaultGroups[0].id);
    }
  }, [groups.length]);

  // Deterministic dual-load: Phase 1 structured first, legacy as fallback
  useEffect(() => {
    if (!sessionId || !dbLoaded) return;
    
    const timeoutId = setTimeout(async () => {
      // Phase 1: Try structured measurements first (deterministic)
      try {
        const { data: structuredMeasurements, error } = await supabase
          .from("takeoff_measurements")
          .select("*")
          .eq("session_id", sessionId)
          .order("created_at", { ascending: true });
        
        if (!error && structuredMeasurements && structuredMeasurements.length > 0) {
          // Convert structured measurements to legacy format
          const convertedMeasurements: Measurement[] = structuredMeasurements.map(m => ({
            id: m.id,
            type: m.type as Measurement["type"],
            points: m.points,
            result: Number(m.result),
            unit: m.unit,
            label: m.meta?.label,
            groupId: m.group_id,
            color: m.meta?.color,
            timestamp: m.meta?.timestamp || new Date(m.created_at).getTime(),
            linked_item_id: m.meta?.linked_item_id,
            linked_item_name: m.meta?.linked_item_name,
            calculated_quantity: m.meta?.calculated_quantity,
            meta: {
              depthInches: m.meta?.depthInches,
              ...m.meta,
            },
            pixelsPerUnit: m.meta?.pixelsPerUnit,
          }));
          
          setAllMeasurements(convertedMeasurements);
          return; // Use structured data exclusively
        }
      } catch (err) {
        console.warn("Failed to load structured measurements:", err);
      }
      
      // Fallback: Load from legacy session storage
      try {
        const { data: session } = await supabase
          .from("takeoff_sessions")
          .select("measurements")
          .eq("id", sessionId)
          .single();
        
        if (session?.measurements) {
          setAllMeasurements(session.measurements);
        }
      } catch (err) {
        console.warn("Failed to load legacy measurements:", err);
      }
    }, 100);

    return () => clearTimeout(timeoutId);
  }, [sessionId, dbLoaded]);

  // Dual-save: Legacy session storage + Phase 1 structured storage
  useEffect(() => {
    if (!sessionId || !dbLoaded) return;
    
    const timeoutId = setTimeout(async () => {
      // Phase 1: Save structured measurements (primary storage)
      const measurementRecords = measurements.map(m => ({
        session_id: sessionId,
        page_number: pageNumber,
        group_id: m.groupId || null,
        folder_id: activeFolderId || null,
        type: m.type,
        points: m.points,
        unit: m.unit,
        result: m.result,
        meta: {
          label: m.label,
          color: m.color,
          timestamp: m.timestamp,
          linked_item_id: m.linked_item_id,
          linked_item_name: m.linked_item_name,
          calculated_quantity: m.calculated_quantity,
          pixelsPerUnit: m.pixelsPerUnit,
          depthInches: m.meta?.depthInches,
          // Map to Master Plan fields
          measurement_name: m.label || `${m.type.charAt(0).toUpperCase() + m.type.slice(1)} ${Math.round(m.result)} ${m.unit}`,
          measurement_type: m.type,
          capture_mode: 'manual',
          status: 'active',
          raw_value: m.result,
          calculated_value: m.calculated_quantity || m.result,
          display_value: m.calculated_quantity || m.result,
          unit_type: m.unit,
          link_mode: m.linked_item_id ? 'item' : 'unlinked',
        },
        sort_order: m.timestamp, // Use timestamp for consistent ordering
      }));
      
      // Atomic upsert: delete all, then insert all
      await supabase
        .from("takeoff_measurements")
        .delete()
        .eq("session_id", sessionId);
        
      if (measurementRecords.length > 0) {
        await supabase
          .from("takeoff_measurements")
          .insert(measurementRecords);
      }
      
      // Save measurement tags for selected tags
      if (selectedTagIds.length > 0) {
        // Clear existing tags for these measurements
        await supabase
          .from("takeoff_measurement_tags")
          .delete()
          .in("measurement_id", measurements.map(m => m.id));
        
        // Insert new tag relationships
        const tagRelations = measurements.flatMap(m => 
          selectedTagIds.map(tagId => ({
            measurement_id: m.id,
            tag_id: tagId,
          }))
        );
        
        if (tagRelations.length > 0) {
          await supabase
            .from("takeoff_measurement_tags")
            .insert(tagRelations);
        }
      }

      // Legacy: Save to session JSON (fallback only)
      await supabase
        .from("takeoff_sessions")
        .update({ 
          measurements: measurements,
          groups: groups,
          active_group_id: activeGroupId,
        })
        .eq("id", sessionId);
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [measurements, groups, activeGroupId, sessionId, dbLoaded, pageNumber, activeFolderId, selectedTagIds]);

  async function onPickFile(file: File | null) {
    setError(null);
    if (!file) return;

    setLoadingPdf(true);
    
    // Phase 1: Load PDF immediately, separate from DB operations
    try {
      // Load PDF locally first to show it as fast as possible
      const localUrl = URL.createObjectURL(file);
      const pdfDoc = await getDocument(localUrl).promise;
      setPdf(pdfDoc);
      setNumPages(pdfDoc.numPages);
      setPageNumber(1);
      setPanZoom({ zoom: 1, panX: 0, panY: 0 });
      setCalibrationDraftPoints([]);
      setCalibrationHoverPoint(null);
      setError(null);
      URL.revokeObjectURL(localUrl); // Clean up
    } catch (e: any) {
      setError("Failed to load PDF: " + (e?.message || String(e)));
      setLoadingPdf(false);
      return; // Don't proceed with upload if PDF itself failed
    }
    
    // Phase 2: Attempt DB upload and session sync (best-effort)
    try {
      // Ensure we have a valid project ID
      const projectId = routeProjectId || activeProjectId || globalProject?.id;
      
      if (!projectId) {
        throw new Error("Project ID missing. Cannot upload PDF.");
      }

      // Upload PDF to Supabase Storage
      const fileName = `${projectId}/${Date.now()}-${file.name}`;
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from("project-files")
        .upload(fileName, file, {
          cacheControl: "3600",
          upsert: false,
        });

      if (uploadError) throw uploadError;

      // Generate signed URL instead of public URL for private bucket
      const { data: signedData } = await supabase.storage
        .from("project-files")
        .createSignedUrl(fileName, 60 * 60 * 24 * 7); // 7 days

      if (!signedData?.signedUrl) {
        throw new Error("Failed to generate signed URL for PDF");
      }

      const signedUrl = signedData.signedUrl;
      
      // Save PDF file info to session (store storagePath permanently, signed URL only in session)
      const pdfFileInfo: PdfFile = {
        name: file.name,
        url: signedUrl, // Store signed URL in session state only
        size: file.size,
        lastModified: file.lastModified,
        storagePath: fileName, // Store storage path permanently
      };
      setPdfFile(pdfFileInfo);
      
      // Update session with PDF info
      if (sessionId) {
        await supabase
          .from("takeoff_sessions")
          .update({
            pdf_file: pdfFileInfo,
            page_number: 1,
            pan_zoom: { zoom: 1, panX: 0, panY: 0 },
          })
          .eq("id", sessionId);
      }
    } catch (e: any) {
      console.error("PDF upload/session sync failed:", e);
      // Show non-blocking warning - PDF is already loaded and visible
      setError("PDF loaded, but session sync failed: " + (e?.message || String(e)));
    } finally {
      setLoadingPdf(false);
    }
  }

  function onViewerWheel(e: React.WheelEvent) {
    if (!overViewer) return;
    if (e.ctrlKey || e.metaKey) e.preventDefault();

    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setPanZoom((prev) => ({ ...prev, zoom: clamp(prev.zoom * delta, 0.1, 10) }));
  }

  function startPan(e: React.PointerEvent) {
    if (!overViewer) return;
    if (e.ctrlKey || e.metaKey) e.preventDefault();

    activePointerIdRef.current = e.pointerId;
    panStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      panX: panZoom.panX,
      panY: panZoom.panY,
    };
  }

  function updatePan(e: React.PointerEvent) {
    if (!overViewer) return;
    if (activePointerIdRef.current !== e.pointerId) return;

    const dx = e.clientX - panStartRef.current.x;
    const dy = e.clientY - panStartRef.current.y;

    // FIXED: Inverted pan direction - natural dragging behavior
    setPanZoom((prev) => ({
      ...prev,
      panX: panStartRef.current.panX - dx / prev.zoom,
      panY: panStartRef.current.panY - dy / prev.zoom,
    }));
  }

  function endPan(_: React.PointerEvent) {
    activePointerIdRef.current = null;
  }

  function onViewerPointerEnter(_: React.PointerEvent) {
    setOverViewer(true);
  }

  function onViewerPointerLeave(_: React.PointerEvent) {
    setOverViewer(false);
  }

  function canvasPointFromEvent(e: React.PointerEvent): Point | null {
    const canvas = canvasRef.current;
    const viewer = viewerRef.current;
    if (!canvas || !viewer) return null;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    // Convert screen coordinates to canvas logical coordinates
    // This matches the PDF viewport coordinate system used in renderPdfPage
    const canvasX = (e.clientX - rect.left) * scaleX;
    const canvasY = (e.clientY - rect.top) * scaleY;

    return {
      x: canvasX,
      y: canvasY,
    };
  }

  function distFeet(a: { x: number; y: number }, b: { x: number; y: number }) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (!d) return 0;

    // Use only the current calibration scale
    if (!currentCalibration) return 0;
    return d * currentCalibration.scaleFeetPerPixel;
  }

  async function fetchCostItem(groupId: string) {
    try {
      const { data, error } = await supabase
        .from("calc_engine_json")
        .select("calc_engine_json")
        .eq("id", groupId)
        .single();

      if (error) throw error;
      return data;
    } catch (err) {
      console.error("Failed to fetch cost item:", err);
      return null;
    }
  }

  async function calculateQuantity(measurement: Measurement, costItem: any) {
    if (!costItem) return measurement.result;

    try {
      const calcJson =
        typeof costItem.calc_engine_json === "string"
          ? JSON.parse(costItem.calc_engine_json)
          : costItem.calc_engine_json;

      if (!calcJson.formulas?.qty) {
        return measurement.result;
      }

      let vars: any = {};

      switch (measurement.type) {
        case "line":
          vars = { length: measurement.result };
          break;
        case "area":
          vars = { area: measurement.result };
          break;
        case "volume":
          vars = {
            length: Math.sqrt(measurement.result * 27),
            width: Math.sqrt(measurement.result * 27),
            height: 1,
          };
          break;
        case "count":
          vars = { count: measurement.result };
          break;
      }

      const calcResult = computeQuantity(calcJson.formulas.qty, vars, {
        roundTo: 2,
        clampZero: true,
      });

      return calcResult.ok ? calcResult.value : measurement.result;
    } catch (err) {
      console.error("Formula calculation error:", err);
      return measurement.result;
    }
  }

  // Shared interaction state cleanup helper
  function resetInteractionState() {
    // Clear pointer refs
    activePointerIdRef.current = null;
    hasPointerDownRef.current = false;
    isPanningRef.current = false;
    
    // Clear hover state
    setHoveredPoint(null);
    setHoveredLine(null);
    setCrosshairPos(null);
    setHoverPt(null);
    
    // Clear tool draft hover states
    setLineEnd(null);
    setAreaHoverPt(null);
    setVolumeHoverPt(null);
    
    // Clear hover state ref
    hoverStateRef.current = { hoverPt: null, lineEnd: null };
    
    // Cancel any pending RAF hover render
    if (rafIdRef.current) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
  }

  // Calibration functions - CLEAN CALIBRATION ONLY
  function confirmCalibration(realDistanceFeet: number) {
    if (calibrationDraftPoints.length !== 2) return;
    
    const [p1, p2] = calibrationDraftPoints;
    const pixelDist = dist(p1, p2);
    const scaleFeetPerPixel = realDistanceFeet / pixelDist;
    
    const newCalibration: SavedCalibration = {
      p1,
      p2,
      realDistanceFeet,
      scaleFeetPerPixel,
      unit: "ft",
      createdAt: Date.now(),
    };
    
    setCurrentCalibration(newCalibration);
    resetInteractionState();
    
    // Save calibration to session
    if (sessionId) {
      supabase
        .from("takeoff_sessions")
        .update({
          scale: { calibration: newCalibration }
        })
        .eq("id", sessionId);
    }
  }
  
  function clearCalibration() {
    setCurrentCalibration(null);
    setCalibrationDraftPoints([]);
    setCalibrationHoverPoint(null);
    setIsCalibrating(false);
    setScaleModalOpen(false);
    
    // Reset interaction state to prevent mouse-lock bug
    resetInteractionState();
    
    // Clear calibration from session
    if (sessionId) {
      supabase
        .from("takeoff_sessions")
        .update({
          scale: null
        })
        .eq("id", sessionId);
    }
  }

  function confirmVolumeWithDepth() {
    const depth = toNumber(depthInput);
    if (volumePoints.length < 3 || !depth) return;

    const area = calculatePolygonArea(volumePoints);
    const volume = area * (depth / 12);
    
    const newMeasurement = addMeasurement({
      type: "volume",
      points: [...volumePoints],
      result: volume,
      unit: selectedLinkedItem?.unit || "ft³",
      color: selectedLinkedItem?.color || activeGroup?.color || "#f59e0b",
      groupId: activeGroupId || undefined,
      timestamp: Date.now(),
      linked_item_id: selectedLinkedItem?.id,
      linked_item_name: selectedLinkedItem?.name,
      label: `Volume (${depth}" depth)`,
    });

    setShowDepthPrompt(false);
    setDepthInput("4");
  }

  async function completeVolume() {
    if (volumePoints.length < 3) return;
    setShowDepthPrompt(true);
  }

  function calculatePolygonArea(points: Point[]): number {
    if (points.length < 3) return 0;
    let area = 0;
    for (let i = 0; i < points.length; i++) {
      const j = (i + 1) % points.length;
      area += points[i].x * points[j].y;
      area -= points[j].x * points[i].y;
    }
    return Math.abs(area) / 2;
  }

  // Get BOQ data for export
  function getBOQData() {
    return Array.from(itemQuantities.values()).map(qty => ({
      item_id: qty.item_id,
      item_name: qty.item.name,
      item_type: qty.item.type,
      total_quantity: qty.total_quantity,
      unit: qty.unit,
      source_measurements: qty.source_measurements,
      measurement_count: qty.source_measurements.length,
    }));
  }

  function exportToCSV() {
    if (measurements.length === 0) return;

    const headers = ["Type", "Label", "Result", "Unit", "Group", "Item", "Timestamp"];
    const rows = measurements.map((m) => [
      m.type,
      m.label || "",
      m.result.toString(),
      m.unit || "",
      groups.find((g) => g.id === m.groupId)?.name || "",
      m.linked_item_name || "",
      m.timestamp,
    ]);

    const csv = [headers, ...rows].map((row) => row.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `takeoff_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function addNewGroup() {
    if (!newGroupName.trim()) return;
    const newGroup: GroupType = {
      id: crypto.randomUUID(),
      name: newGroupName.trim(),
      color: "#" + Math.floor(Math.random()*16777215).toString(16),
      visible: true,
      sortOrder: groups.length,
      locked: false,
    };
    setGroups(prev => [...prev, newGroup]);
    setNewGroupName("");
    setShowNewGroupForm(false);
  }

  function deleteGroup(groupId: string) {
    setGroups(prev => prev.filter(g => g.id !== groupId));
    if (activeGroupId === groupId) {
      setActiveGroupId(null);
    }
  }

  async function computeFitScale() {
    if (!viewerRef.current || !canvasWidth || !canvasHeight) return null;
    const viewerWidth = viewerRef.current.clientWidth;
    const viewerHeight = viewerRef.current.clientHeight;
    const scaleX = viewerWidth / canvasWidth;
    const scaleY = viewerHeight / canvasHeight;
    return Math.min(scaleX, scaleY) * 0.95;
  }

  function fitToView(canvasW: number, canvasH: number, viewerW: number, viewerH: number) {
    const scaleX = viewerW / canvasW;
    const scaleY = viewerH / canvasH;
    const newZoom = Math.min(scaleX, scaleY) * 0.95;
    setPanZoom({ zoom: newZoom, panX: 0, panY: 0 });
  }

  function startPanViewer(e: React.PointerEvent) {
    if (!overViewer) return;
    if (e.ctrlKey || e.metaKey) e.preventDefault();

    isPanningRef.current = true;
    activePointerIdRef.current = e.pointerId;
    panStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      panX: panZoom.panX,
      panY: panZoom.panY,
    };
  }

  function updatePanViewer(e: React.PointerEvent) {
    if (!isPanningRef.current || activePointerIdRef.current !== e.pointerId) return;

    const dx = e.clientX - panStartRef.current.x;
    const dy = e.clientY - panStartRef.current.y;

    setPanZoom((prev) => ({
      ...prev,
      panX: panStartRef.current.panX + dx / prev.zoom,
      panY: panStartRef.current.panY + dy / prev.zoom,
    }));
    
    // Save pan/zoom to session
    if (sessionId) {
      const newPanZoom = {
        zoom: panZoom.zoom,
        panX: panStartRef.current.panX + dx / panZoom.zoom,
        panY: panStartRef.current.panY + dy / panZoom.zoom,
      };
      supabase
        .from("takeoff_sessions")
        .update({ pan_zoom: newPanZoom })
        .eq("id", sessionId);
    }
  }

  function endPanViewer(e: React.PointerEvent) {
    isPanningRef.current = false;
    activePointerIdRef.current = null;
  }

  function zoomIn() {
    const newZoom = clamp(panZoom.zoom * 1.2, 0.1, 10);
    setPanZoom(prev => ({ ...prev, zoom: newZoom }));
    
    // Save zoom to session
    if (sessionId) {
      supabase
        .from("takeoff_sessions")
        .update({ pan_zoom: { ...panZoom, zoom: newZoom } })
        .eq("id", sessionId);
    }
  }

  function nextPage() {
    if (!pdf || pageNumber >= numPages) return;
    
    // Cancel current render task
    if (renderTaskRef.current) {
      renderTaskRef.current.cancel();
      renderTaskRef.current = null;
    }
    
    setPageNumber(prev => prev + 1);
    
    // Update session
    if (sessionId) {
      supabase
        .from("takeoff_sessions")
        .update({ page_number: pageNumber + 1 })
        .eq("id", sessionId);
    }
  }
  
  function prevPage() {
    if (!pdf || pageNumber <= 1) return;
    
    // Cancel current render task
    if (renderTaskRef.current) {
      renderTaskRef.current.cancel();
      renderTaskRef.current = null;
    }
    
    setPageNumber(prev => prev - 1);
    
    // Update session
    if (sessionId) {
      supabase
        .from("takeoff_sessions")
        .update({ page_number: pageNumber - 1 })
        .eq("id", sessionId);
    }
  }

  function zoomOut() {
    const newZoom = clamp(panZoom.zoom * 0.8, 0.1, 10);
    setPanZoom(prev => ({ ...prev, zoom: newZoom }));
    
    // Save zoom to session
    if (sessionId) {
      supabase
        .from("takeoff_sessions")
        .update({ pan_zoom: { ...panZoom, zoom: newZoom } })
        .eq("id", sessionId);
    }
  }

  async function onCanvasPointerDown(e: React.PointerEvent) {
    if (hasPointerDownRef.current) return;
    hasPointerDownRef.current = true;
    
    const p = canvasPointFromEvent(e);
    if (!p) return;
    
    // Handle calibration point picking - ISOLATED BRANCH
    if (isCalibrating) {
      setCalibrationDraftPoints(prev => {
        const newPoints = [...prev, p];
        if (newPoints.length >= 2) {
          // Auto-open modal after second point
          setScaleModalOpen(true);
        }
        return newPoints;
      });
      // IMPORTANT: Do NOT run any other logic while calibrating
      return;
    }
    
    // Handle measurement selection
    if (tool === "select") {
      // Check if clicking on a measurement
      let clickedMeasurement: Measurement | null = null;
      
      // Check lines first
      const nearestLine = findNearestLine(p, 10);
      if (nearestLine) {
        clickedMeasurement = measurements.find(m => m.id === nearestLine.measurementId) || null;
      } else {
        // Check points
        const nearestPoint = findNearestPoint(p, 10);
        if (nearestPoint) {
          clickedMeasurement = measurements.find(m => 
            m.points.some(mp => dist(mp, nearestPoint) < 1)
          ) || null;
        }
      }
      
      setSelectedMeasurementId(clickedMeasurement?.id || null);
      startPanViewer(e);
      return;
    }
    
    // Snap to nearest point for measurement tools
    const snappedPoint = findNearestPoint(p, 15) || p;
    
    if (tool === "line") {
      if (!lineStart) {
        setLineStart(snappedPoint);
        setLineEnd(null);
      } else {
        // Complete line on second click
        const newMeasurement = addMeasurement({
          type: "line",
          points: [lineStart!, snappedPoint],
          result: distFeet(lineStart!, snappedPoint),
          unit: selectedLinkedItem?.unit || "ft",
          color: selectedLinkedItem?.color || activeGroup?.color || "#60a5fa",
          groupId: activeGroupId || undefined,
          timestamp: Date.now(),
          linked_item_id: selectedLinkedItem?.id,
          linked_item_name: selectedLinkedItem?.name,
        });
        
        // Reset for next line
        setLineStart(null);
        setLineEnd(null);
      }
    } else if (tool === "area") {
      setAreaPoints((prev) => [...prev, snappedPoint]);
    } else if (tool === "count") {
      const newMeasurement = addMeasurement({
        type: "count",
        points: [snappedPoint],
        result: 1,
        unit: selectedLinkedItem?.unit || "ea",
        color: selectedLinkedItem?.color || activeGroup?.color || "#f59e0b",
        groupId: activeGroupId || undefined,
        timestamp: Date.now(),
        linked_item_id: selectedLinkedItem?.id,
        linked_item_name: selectedLinkedItem?.name,
      });
    } else if (tool === "volume") {
      setVolumePoints((prev) => [...prev, snappedPoint]);
    }
  }

  async function onCanvasPointerMove(e: React.PointerEvent) {
    const p = canvasPointFromEvent(e);
    setHoverPt(p);
    setCrosshairPos(p);
    
    // Update calibration hover point during calibration
    if (isCalibrating && calibrationDraftPoints.length === 1) {
      setCalibrationHoverPoint(p);
    }

    // Update hover highlights
    if (tool !== "select" && p) {
      const nearestPoint = findNearestPoint(p, 15);
      setHoveredPoint(nearestPoint);
      
      const nearestLine = findNearestLine(p, 15);
      setHoveredLine(nearestLine);
    } else {
      setHoveredPoint(null);
      setHoveredLine(null);
    }

    if (tool === "area") {
      setAreaHoverPt(p);
    }
    if (tool === "volume") {
      setVolumeHoverPt(p);
    }

    if (tool === "line" && lineStart) {
      setLineEnd(p);
    }
  }

  function onCanvasPointerUp(_: React.PointerEvent) {
    hasPointerDownRef.current = false;
  }

  async function onCanvasDoubleClick(e: React.PointerEvent) {
    if (tool === "area" && areaPoints.length >= 3) {
      await completeArea();
    }
    if (tool === "volume" && volumePoints.length >= 3) {
      await completeVolume();
    }
  }

  async function completeArea() {
    if (areaPoints.length < 3) return;
    
    const areaFt2 = calculatePolygonArea(areaPoints);
    const newMeasurement = addMeasurement({
      type: "area",
      points: [...areaPoints],
      result: areaFt2,
      unit: selectedLinkedItem?.unit || "ft²",
      color: selectedLinkedItem?.color || activeGroup?.color || "#a78bfa",
      groupId: activeGroupId || undefined,
      timestamp: Date.now(),
      linked_item_id: selectedLinkedItem?.id,
      linked_item_name: selectedLinkedItem?.name,
    });
    
    setAreaPoints([]);
  }

  // Keyboard shortcuts
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.code === "Space") {
        e.preventDefault();
        isSpaceDownRef.current = true;
      } else if (e.code === "Escape") {
        e.preventDefault();
        // Cancel current draft
        if (tool === "area") {
          setAreaPoints([]);
          setAreaHoverPt(null);
        } else if (tool === "volume") {
          setVolumePoints([]);
          setVolumeHoverPt(null);
        } else if (tool === "line") {
          setLineStart(null);
          setLineEnd(null);
        } else if (isCalibrating) {
          setCalibrationDraftPoints([]);
          setCalibrationHoverPoint(null);
          setIsCalibrating(false);
        }
      } else if (e.code === "Enter") {
        e.preventDefault();
        // Finish polygon tools
        if (tool === "area" && areaPoints.length >= 3) {
          completeArea();
        } else if (tool === "volume" && volumePoints.length >= 3) {
          completeVolume();
        }
      }
    }
    
    function handleKeyUp(e: KeyboardEvent) {
      if (e.code === "Space") {
        e.preventDefault();
        isSpaceDownRef.current = false;
      }
    }
    
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [tool, isCalibrating, areaPoints, volumePoints, lineStart]);

  // PDF-only render effect - NO hover dependencies
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        if (!cancelled) await renderPdfPage();
      } catch (e: any) {
        if (!cancelled && e?.name !== 'RenderingCancelledException') {
          setError("Render failed: " + (e?.message || String(e)));
        }
      }
    })();

    return () => {
      cancelled = true;
      // Cancel any ongoing render task when effect unmounts
      if (renderTaskRef.current) {
        renderTaskRef.current.cancel();
        renderTaskRef.current = null;
      }
    };
  }, [
    pdf,
    pageNumber,
    panZoom.zoom,
    panZoom.panX,
    panZoom.panY,
  ]);

  // Overlay render effect - includes tool previews but NO hover
  useEffect(() => {
    renderOverlay();
  }, [
    calibrationDraftPoints.length,
    tool,
    lineStart?.x,
    lineStart?.y,
    lineEnd?.x,
    lineEnd?.y,
    areaPoints.length,
    volumePoints.length,
    panZoom.zoom,
    panZoom.panX,
    panZoom.panY,
    selectedMeasurementId,
    measurements,
    hoveredPoint,
    hoveredLine,
  ]);

  // Hover effect - uses throttled updates, NO PDF rendering
  useEffect(() => {
    updateHoverState(hoverPt, lineEnd);
  }, [
    hoverPt?.x,
    hoverPt?.y,
    lineEnd?.x,
    lineEnd?.y,
    crosshairPos?.x,
    crosshairPos?.y,
  ]);

  // Cleanup RAF and render tasks on unmount
  useEffect(() => {
    return () => {
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      if (renderTaskRef.current) {
        renderTaskRef.current.cancel();
        renderTaskRef.current = null;
      }
    };
  }, []);

  const activeGroup = useMemo(
    () => groups.find((g) => g.id === activeGroupId) || null,
    [groups, activeGroupId]
  );

  const measurementCounts = useMemo(() => {
    return {
      total: measurements.length,
      lines: measurements.filter((m) => m.type === "line").length,
      areas: measurements.filter((m) => m.type === "area").length,
      counts: measurements.filter((m) => m.type === "count").length,
      volumes: measurements.filter((m) => m.type === "volume").length,
    };
  }, [measurements]);

  const groupedMeasurements = useMemo(() => {
    return {
      grouped: measurements.filter((m) => !!m.groupId),
      ungrouped: measurements.filter((m) => !m.groupId),
    };
  }, [measurements]);

  const visibleMeasurements = useMemo(() => {
    const visibleGroupIds = new Set(groups.filter((g) => g.visible).map((g) => g.id));
    return measurements.filter((m) => !m.groupId || visibleGroupIds.has(m.groupId));
  }, [measurements, groups]);

  const pdfReady = !!pdf;

  return (
    <div className="flex h-screen flex-col bg-slate-950 text-white">
      <ScaleModal
        open={scaleModalOpen}
        onClose={() => setScaleModalOpen(false)}
        onApply={(feet) => {
          confirmCalibration(feet);
        }}
        canApply={calibrationDraftPoints.length === 2}
        isCalibrating={true}
        calibPointsCount={calibrationDraftPoints.length}
        canConfirmCalibration={calibrationDraftPoints.length === 2}
        onCalibrationOk={(feet) => {
          confirmCalibration(feet);
        }}
        onCalibrationCancel={() => {
          setIsCalibrating(false);
          setCalibrationDraftPoints([]);
          setScaleModalOpen(false);
          resetInteractionState();
        }}
      />

      <div className="border-b border-slate-800 bg-slate-900/90">
        <div className="flex items-center justify-between px-4 py-2">
          <div className="flex items-center gap-4">
            <h1 className="text-lg font-semibold text-white">Takeoff</h1>
            {currentProject && (
              <div className="text-sm text-slate-300">
                {currentProject.name}
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-1">
            <label className="cursor-pointer rounded-lg border border-slate-800 bg-slate-900 px-2 py-1 text-xs font-medium text-slate-200 transition hover:bg-slate-800">
              📁 Upload
              <input
                type="file"
                accept=".pdf"
                className="hidden"
                onChange={(e) => onPickFile(e.target.files?.[0] || null)}
              />
            </label>

            <button
              onClick={clearCalibration}
              className="rounded-lg border border-slate-800 bg-slate-900 px-2 py-1 text-xs font-medium text-slate-200 transition hover:bg-slate-800"
            >
              📏 Calibrate
            </button>
            {currentCalibration && (
              <button
                onClick={clearCalibration}
                className="rounded-lg border border-slate-800 bg-slate-900 px-2 py-1 text-xs font-medium text-slate-200 transition hover:bg-slate-800"
              >
                🗑️ Clear Calibration
              </button>
            )}

            <button
              onClick={exportToCSV}
              className="rounded-lg border border-slate-800 bg-slate-900 px-2 py-1 text-xs font-medium text-slate-200 transition hover:bg-slate-800"
            >
              📊 Export
            </button>
          </div>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="relative min-w-0 flex-1 bg-slate-950">
          <div className="absolute left-2 top-2 z-20 right-2">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="flex max-w-full flex-col gap-2">
                <div className="flex flex-wrap gap-1 rounded-xl border border-slate-800 bg-slate-950/85 p-1 shadow-xl shadow-black/20 backdrop-blur">
                  {[
                    ["select", "↖", "Select"],
                    ["line", "📏", "Line"],
                    ["area", "⬡", "Area"],
                    ["count", "🔢", "Count"],
                    ["volume", "📦", "Volume"],
                  ].map(([k, icon, label]) => (
                    <button
                      key={k}
                      onClick={() => setTool(k as ToolMode)}
                      className={classNames(
                        "flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium transition",
                        tool === k
                          ? "bg-blue-600 text-white"
                          : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                      )}
                    >
                      {icon} {label}
                    </button>
                  ))}
                </div>

                <div className="rounded-xl border border-slate-800 bg-slate-950/85 p-1.5 shadow-xl shadow-black/20 backdrop-blur">
                  <div className="flex items-center gap-1">
                    <button
                      onClick={zoomOut}
                      className="rounded-lg bg-slate-900 px-2 py-1 text-xs text-slate-200 transition hover:bg-slate-800"
                    >
                      −
                    </button>
                    <div className="min-w-[50px] text-center text-xs text-slate-300">
                      {Math.round(panZoom.zoom * 100)}%
                    </div>
                    <button
                      onClick={zoomIn}
                      className="rounded-lg bg-slate-900 px-2 py-1 text-xs text-slate-200 transition hover:bg-slate-800"
                    >
                      +
                    </button>
                    <button
                      onClick={async () => {
                        const fit = await computeFitScale();
                        if (fit != null) {
                          fitToView(
                            canvasWidth,
                            canvasHeight,
                            viewerRef.current?.clientWidth || 800,
                            viewerRef.current?.clientHeight || 600
                          );
                        }
                      }}
                      className="rounded-lg bg-slate-900 px-2 py-1 text-xs text-slate-200 transition hover:bg-slate-800"
                    >
                      Fit
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-start gap-2">
                <div className="rounded-xl border border-slate-800 bg-slate-950/85 p-1 shadow-xl shadow-black/20 backdrop-blur">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={prevPage}
                      disabled={!pdf || pageNumber <= 1}
                      className="rounded-lg bg-slate-900 px-2 py-1 text-xs text-slate-200 transition hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      ←
                    </button>
                    <div className="min-w-[60px] text-center text-xs text-slate-300">
                      {pdf ? `${pageNumber}/${numPages}` : "No PDF"}
                    </div>
                    <button
                      onClick={nextPage}
                      disabled={!pdf || pageNumber >= numPages}
                      className="rounded-lg bg-slate-900 px-2 py-1 text-xs text-slate-200 transition hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      →
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {isCalibrating && (
            <div className="absolute left-1/2 top-4 z-30 -translate-x-1/2 rounded-xl border border-emerald-900/40 bg-emerald-950/90 px-4 py-2 text-sm text-emerald-300 shadow-xl shadow-black/20 backdrop-blur">
              Click 2 points to calibrate
            </div>
          )}
          {showDepthPrompt && tool === "volume" && (
            <div className="absolute right-2 top-32 z-20 w-64 rounded-xl border border-slate-800 bg-slate-950/95 p-3 shadow-2xl shadow-black/30 backdrop-blur">
              <div className="mb-1 text-sm font-semibold text-white">Volume Depth</div>
              <div className="mb-3 text-xs text-slate-400">Enter slab/excavation depth in inches.</div>
              <input
                type="number"
                value={depthInput}
                onChange={(e) => setDepthInput(e.target.value)}
                className="w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-slate-600"
                placeholder="4"
              />
              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => confirmVolumeWithDepth()}
                  className="flex-1 rounded-lg bg-blue-600 px-3 py-2 text-xs font-medium text-white hover:bg-blue-700"
                >
                  OK
                </button>
                <button
                  onClick={() => setShowDepthPrompt(false)}
                  className="flex-1 rounded-lg bg-slate-800 px-3 py-2 text-xs font-medium text-slate-200 hover:bg-slate-700"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {error && (
            <div className="absolute right-2 top-2 z-20 max-w-sm rounded-xl border border-red-900/40 bg-red-950/70 px-4 py-3 text-sm text-red-200 shadow-xl shadow-black/20 backdrop-blur">
              {error}
            </div>
          )}

          {loadingPdf && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm">
              <div className="rounded-xl border border-slate-800 bg-slate-950 px-5 py-4 text-sm text-slate-200 shadow-xl">
                Loading PDF...
              </div>
            </div>
          )}

          {!pdf && (
            <div className="absolute inset-0 flex items-center justify-center p-6">
              <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900/40 p-8 text-center shadow-2xl shadow-black/20">
                <div className="mb-4 text-4xl">📄</div>
                <div className="mb-2 text-xl font-semibold text-white">No PDF loaded</div>
                <div className="mb-5 text-sm text-slate-400">
                  Upload a drawing to start measuring.
                </div>
                <label className="inline-flex cursor-pointer items-center rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700">
                  Upload PDF
                  <input
                    type="file"
                    accept=".pdf"
                    className="hidden"
                    onChange={(e) => onPickFile(e.target.files?.[0] || null)}
                  />
                </label>
              </div>
            </div>
          )}

          <div
            ref={viewerRef}
            className="relative h-full overflow-hidden"
            onPointerEnter={onViewerPointerEnter}
            onPointerLeave={onViewerPointerLeave}
            onWheel={onViewerWheel}
            onPointerDown={startPanViewer}
            onPointerMove={updatePanViewer}
            onPointerUp={endPanViewer}
          >
            {pdf && (
              <div className="relative w-full h-full">
                <canvas
                  ref={canvasRef}
                  className="absolute left-0 top-0"
                  onPointerDown={onCanvasPointerDown}
                  onPointerMove={onCanvasPointerMove}
                  onPointerUp={onCanvasPointerUp}
                  onDoubleClick={(e: any) => onCanvasDoubleClick(e)}
                />
                <canvas
                  ref={overlayCanvasRef}
                  className="absolute left-0 top-0 pointer-events-none"
                />
                <canvas
                  ref={hoverCanvasRef}
                  className="absolute left-0 top-0 pointer-events-none"
                />
              </div>
            )}
          </div>

          {/* Measurement Layer */}
          {pdf && (
            <MeasurementLayer
              measurements={visibleMeasurements}
              scale={panZoom.zoom}
              offsetX={panZoom.panX}
              offsetY={panZoom.panY}
            />
          )}
        </div>

        {/* Right Sidebar */}
        <aside className="flex w-[320px] min-w-[320px] flex-col border-l border-slate-800 bg-slate-950/70">
          <div className="border-b border-slate-800 px-2 py-1.5">
            <div className="flex rounded-lg border border-slate-800 bg-slate-900/70 p-1">
              {[
                ["draw", "Draw"],
                ["measurements", "Measurements"],
                ["groups", "Groups"],
                ["library", "Library"],
                ["settings", "Settings"],
              ].map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setSidebarTab(key as SidebarTab)}
                  className={classNames(
                    "flex-1 rounded-lg px-2 py-1 text-xs font-medium transition",
                    sidebarTab === key
                      ? "bg-slate-200 text-slate-950"
                      : "text-slate-300 hover:bg-slate-800"
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {sidebarTab === "draw" && (
              <div className="space-y-3">
                <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-3">
                  <div className="mb-2 text-sm font-semibold text-white">Active Tool</div>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      ["select", "↖", "Select"],
                      ["line", "📏", "Line"],
                      ["area", "⬡", "Area"],
                      ["count", "🔢", "Count"],
                      ["volume", "📦", "Volume"],
                    ].map(([k, label]) => (
                      <button
                        key={k}
                        onClick={() => setTool(k as ToolMode)}
                        className={classNames(
                          "rounded-lg px-3 py-2 text-left text-xs font-medium transition",
                          tool === k
                            ? "bg-blue-600 text-white"
                            : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                        )}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <div className="mt-3 rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-xs text-slate-400">
                    {toolHelpText(tool)}
                  </div>
                </div>

                <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-3">
                  <div className="mb-2 text-sm font-semibold text-white">Working Group</div>
                  <select
                    value={activeGroupId || ""}
                    onChange={(e) => setActiveGroupId(e.target.value || null)}
                    className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-slate-600"
                  >
                    <option value="">No group</option>
                    {groups
                      .sort((a, b) => a.sortOrder - b.sortOrder)
                      .map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.name}
                        </option>
                      ))}
                  </select>
                </div>

                {/* Phase 1: Compact Organization */}
                {(folders.length > 0 || tags.length > 0) && (
                  <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-3">
                    <div className="mb-2 text-sm font-semibold text-white">Organization</div>
                    
                    {folders.length > 0 && (
                      <div className="mb-3">
                        <div className="mb-1 text-xs text-slate-400">Folder</div>
                        <select
                          value={activeFolderId || ""}
                          onChange={(e) => setActiveFolderId(e.target.value || null)}
                          className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-slate-600"
                        >
                          <option value="">No folder</option>
                          {folders.map((folder) => (
                            <option key={folder.id} value={folder.id}>
                              {folder.folder_name}
                            </option>
                          ))}
                        </select>
                        <button
                          onClick={() => setShowAddFolder(true)}
                          className="mt-2 w-full rounded-lg border border-slate-800 bg-slate-900 px-2 py-1 text-xs font-medium text-slate-200 transition hover:bg-slate-800"
                        >
                          + Add Folder
                        </button>
                        {showAddFolder && (
                          <div className="mt-2 rounded-lg border border-slate-700 bg-slate-800/50 p-2">
                            <input
                              type="text"
                              value={newFolderName}
                              onChange={(e) => setNewFolderName(e.target.value)}
                              placeholder="Folder name"
                              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-white outline-none focus:border-slate-600 mb-2"
                              onKeyPress={(e) => {
                                if (e.key === "Enter") addFolder();
                              }}
                            />
                            <div className="flex gap-1">
                              <button
                                onClick={() => addFolder()}
                                className="flex-1 rounded-lg bg-blue-600 px-2 py-1 text-xs font-medium text-white hover:bg-blue-700"
                              >
                                Create
                              </button>
                              <button
                                onClick={() => {
                                  setShowAddFolder(false);
                                  setNewFolderName("");
                                }}
                                className="rounded-lg bg-slate-800 px-2 py-1 text-xs font-medium text-slate-200 hover:bg-slate-700"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                    
                    {tags.length > 0 && (
                      <div>
                        <div className="mb-1 text-xs text-slate-400">Tags</div>
                        <div className="max-h-24 overflow-y-auto space-y-1">
                          {tags.map((tag) => (
                            <label key={tag.id} className="flex items-center gap-2 text-xs">
                              <input
                                type="checkbox"
                                checked={selectedTagIds.includes(tag.id)}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setSelectedTagIds(prev => [...prev, tag.id]);
                                  } else {
                                    setSelectedTagIds(prev => prev.filter(id => id !== tag.id));
                                  }
                                }}
                                className="rounded border-slate-700 bg-slate-900 text-blue-600 focus:ring-blue-600 focus:ring-offset-slate-900"
                              />
                              <span>{tag.tag_name}</span>
                            </label>
                          ))}
                        </div>
                        <button
                          onClick={() => setShowAddTag(true)}
                          className="mt-2 w-full rounded-lg border border-slate-800 bg-slate-900 px-2 py-1 text-xs font-medium text-slate-200 transition hover:bg-slate-800"
                        >
                          + Add Tag
                        </button>
                        {showAddTag && (
                          <div className="mt-2 rounded-lg border border-slate-700 bg-slate-800/50 p-2">
                            <input
                              type="text"
                              value={newTagName}
                              onChange={(e) => setNewTagName(e.target.value)}
                              placeholder="Tag name"
                              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-white outline-none focus:border-slate-600 mb-2"
                              onKeyPress={(e) => {
                                if (e.key === "Enter") addTag();
                              }}
                            />
                            <input
                              type="text"
                              value={newTagGroup}
                              onChange={(e) => setNewTagGroup(e.target.value)}
                              placeholder="Group (optional)"
                              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-white outline-none focus:border-slate-600 mb-2"
                            />
                            <div className="flex gap-1">
                              <button
                                onClick={() => addTag()}
                                className="flex-1 rounded-lg bg-blue-600 px-2 py-1 text-xs font-medium text-white hover:bg-blue-700"
                              >
                                Create
                              </button>
                              <button
                                onClick={() => {
                                  setShowAddTag(false);
                                  setNewTagName("");
                                  setNewTagGroup("");
                                }}
                                className="rounded-lg bg-slate-800 px-2 py-1 text-xs font-medium text-slate-200 hover:bg-slate-700"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-3">
                  <div className="mb-2 text-sm font-semibold text-white">Quick Stats</div>
                  <div className="grid grid-cols-3 gap-2 text-[11px]">
                    <div className="rounded-xl border border-slate-800 bg-slate-900/50 px-3 py-3">
                      <div className="text-[11px] text-slate-400">Total</div>
                      <div className="mt-1 text-lg font-semibold text-white">{measurementCounts.total}</div>
                    </div>
                    <div className="rounded-xl border border-slate-800 bg-slate-900/50 px-3 py-3">
                      <div className="text-[11px] text-slate-400">Ungrouped</div>
                      <div className="mt-1 text-lg font-semibold text-white">{groupedMeasurements.ungrouped.length}</div>
                    </div>
                    <div className="rounded-xl border border-slate-800 bg-slate-900/50 px-3 py-3">
                      <div className="text-[11px] text-slate-400">Lines</div>
                      <div className="mt-1 text-lg font-semibold text-white">{measurementCounts.lines}</div>
                    </div>
                    <div className="rounded-xl border border-slate-800 bg-slate-900/50 px-3 py-3">
                      <div className="text-[11px] text-slate-400">Areas</div>
                      <div className="mt-1 text-lg font-semibold text-white">{measurementCounts.areas}</div>
                    </div>
                    <div className="rounded-xl border border-slate-800 bg-slate-900/50 px-3 py-3">
                      <div className="text-[11px] text-slate-400">Counts</div>
                      <div className="mt-1 text-lg font-semibold text-white">{measurementCounts.counts}</div>
                    </div>
                    <div className="rounded-xl border border-slate-800 bg-slate-900/50 px-3 py-3">
                      <div className="text-[11px] text-slate-400">Volumes</div>
                      <div className="mt-1 text-lg font-semibold text-white">{measurementCounts.volumes}</div>
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-3">
                    <div className="mb-3 flex items-center justify-between">
                      <div className="text-sm font-semibold text-white">All Measurements</div>
                      <button
                        onClick={exportToCSV}
                        className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-700"
                      >
                        Export CSV
                      </button>
                    </div>

                    {measurements.length === 0 ? (
                      <div className="rounded-lg border border-dashed border-slate-800 px-3 py-6 text-center text-sm text-slate-500">
                        No measurements yet.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {measurements.map((m) => {
                          const group = groups.find((g) => g.id === m.groupId);
                          
                          return (
                            <div
                              key={m.id}
                              className="rounded-lg border border-slate-800 bg-slate-950/70 p-3"
                            >
                              <div className="flex items-start justify-between">
                                <div className="flex items-center gap-2">
                                  <div className="text-lg">{measurementIcon(m.type)}</div>
                                  <div>
                                    <div className="text-xs text-slate-400">{measurementTypeLabel(m.type)}</div>
                                    <div className="text-sm font-medium text-white">
                                      {formatResult(m.result)} {m.unit}
                                    </div>
                                  </div>
                                </div>
                                <button
                                  onClick={() => removeMeasurement(m.id)}
                                  className="rounded px-2 py-1 text-xs text-slate-400 hover:bg-slate-800"
                                >
                                  ✕
                                </button>
                              </div>
                              {m.label && (
                                <div className="mt-2 text-xs text-slate-400">{m.label}</div>
                              )}
                              {group && (
                                <div className="mt-2 flex items-center gap-2">
                                  <div
                                    className="w-3 h-3 rounded-full"
                                    style={{ backgroundColor: group.color }}
                                  />
                                  <div className="text-xs text-slate-400">{group.name}</div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {sidebarTab === "measurements" && (
              <div className="space-y-3">
                <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-3">
                  <div className="mb-3 text-sm font-semibold text-white">Measurements</div>
                  <div className="space-y-2">
                    {[
                      ["All", "all"],
                      ["Lines", "line"],
                      ["Areas", "area"],
                      ["Counts", "count"],
                      ["Volumes", "volume"],
                    ].map(([label, type]) => (
                      <button
                        key={type}
                        onClick={() => {
                          // TODO: Filter measurements by type
                        }}
                        className={classNames(
                          "w-full rounded-lg px-3 py-2 text-left text-xs font-medium transition",
                          type === "all"
                            ? "bg-slate-800 text-white"
                            : "bg-slate-900 text-slate-300 hover:bg-slate-800"
                        )}
                      >
                        {label} ({measurementCounts[type as keyof typeof measurementCounts]})
                      </button>
                    ))}
                  </div>
                </div>

                <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-3">
                  <div className="mb-3 flex items-center justify-between">
                    <div className="text-sm font-semibold text-white">Export</div>
                    <button
                      onClick={exportToCSV}
                      className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-700"
                    >
                      📊 CSV
                    </button>
                  </div>
                </div>
              </div>
            )}

            {sidebarTab === "groups" && (
              <div className="space-y-3">
                <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-3">
                  <div className="mb-3 flex items-center justify-between">
                    <div className="text-sm font-semibold text-white">Groups</div>
                    <button
                      onClick={() => setShowNewGroupForm(true)}
                      className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-700"
                    >
                      + Add
                    </button>
                  </div>

                  {showNewGroupForm && (
                    <div className="mb-3 rounded-lg border border-slate-700 bg-slate-800/50 p-3">
                      <input
                        type="text"
                        value={newGroupName}
                        onChange={(e) => setNewGroupName(e.target.value)}
                        placeholder="Group name"
                        className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-slate-600 mb-2"
                        onKeyPress={(e) => {
                          if (e.key === "Enter") addNewGroup();
                        }}
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => addNewGroup()}
                          className="flex-1 rounded-lg bg-blue-600 px-3 py-2 text-xs font-medium text-white hover:bg-blue-700"
                        >
                          Create
                        </button>
                        <button
                          onClick={() => setShowNewGroupForm(false)}
                          className="rounded-lg bg-slate-800 px-3 py-2 text-xs font-medium text-slate-200 hover:bg-slate-700"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="space-y-2">
                    {groups.map((group) => (
                      <div
                        key={group.id}
                        className={classNames(
                          "rounded-lg border p-3 transition",
                          group.id === activeGroupId
                            ? "border-blue-600 bg-blue-950/30"
                            : "border-slate-800 bg-slate-950/50"
                        )}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div
                              className="w-3 h-3 rounded-full cursor-pointer"
                              style={{ backgroundColor: group.color }}
                              onClick={() => toggleGroupVisibility(group.id)}
                            />
                            <div className="text-sm font-medium text-white">{group.name}</div>
                          </div>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => setActiveGroupId(group.id)}
                              className={classNames(
                                "rounded px-2 py-1 text-xs",
                                group.id === activeGroupId
                                  ? "bg-blue-600 text-white"
                                  : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                              )}
                            >
                              Select
                            </button>
                            <button
                              onClick={() => deleteGroup(group.id)}
                              className="rounded px-2 py-1 text-xs text-slate-400 hover:bg-slate-700"
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                        <div className="mt-2 text-xs text-slate-400">
                          {measurementCounts.total} measurement{measurementCounts.total !== 1 ? "s" : ""}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {sidebarTab === "library" && (
              <div className="space-y-3">
                <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-3">
                  <div className="mb-3 text-sm font-semibold text-white">Cost Items Library</div>
                  <div className="space-y-2">
                    <div className="text-xs text-slate-400">Select an item to link measurements:</div>
                    <div className="space-y-1">
                      {/* Mock items - replace with real library data */}
                      {[
                        { id: 'item-1', name: '2x4 Lumber', unit: 'ft', type: 'item' as const, color: '#60a5fa' },
                        { id: 'item-2', name: 'Drywall', unit: 'ft²', type: 'item' as const, color: '#a78bfa' },
                        { id: 'item-3', name: 'Concrete', unit: 'ft³', type: 'item' as const, color: '#f59e0b' },
                        { id: 'assembly-1', name: 'Wall Assembly', unit: 'ft²', type: 'assembly' as const, color: '#10b981' },
                      ].map(item => (
                        <button
                          key={item.id}
                          onClick={() => setSelectedLinkedItem(item)}
                          className={classNames(
                            "w-full rounded-lg px-3 py-2 text-left text-xs transition",
                            selectedLinkedItem?.id === item.id
                              ? "bg-blue-600 text-white"
                              : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                          )}
                        >
                          <div className="flex items-center gap-2">
                            <div 
                              className="w-3 h-3 rounded-full" 
                              style={{ backgroundColor: item.color }}
                            />
                            <div>
                              <div className="font-medium">{item.name}</div>
                              <div className="text-xs opacity-75">{item.unit} • {item.type}</div>
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                
                {selectedLinkedItem && (
                  <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-3">
                    <div className="mb-2 text-sm font-semibold text-white">Selected Item</div>
                    <div className="flex items-center gap-2">
                      <div 
                        className="w-4 h-4 rounded-full" 
                        style={{ backgroundColor: selectedLinkedItem.color }}
                      />
                      <div className="text-sm text-slate-300">
                        {selectedLinkedItem.name} ({selectedLinkedItem.unit})
                      </div>
                    </div>
                    <div className="mt-2 text-xs text-slate-400">
                      New measurements will be linked to this item
                    </div>
                  </div>
                )}
                
                {itemQuantities.size > 0 && (
                  <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-3">
                    <div className="mb-3 text-sm font-semibold text-white">BOQ Summary</div>
                    <div className="space-y-2">
                      {Array.from(itemQuantities.values()).map(qty => (
                        <div key={qty.item_id} className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2">
                            <div 
                              className="w-3 h-3 rounded-full" 
                              style={{ backgroundColor: qty.item.color }}
                            />
                            <div className="text-slate-300">{qty.item.name}</div>
                          </div>
                          <div className="text-slate-400">
                            {formatResult(qty.total_quantity)} {qty.unit}
                          </div>
                        </div>
                      ))}
                    </div>
                    <button
                      onClick={() => {
                        const boqData = getBOQData();
                        const json = JSON.stringify(boqData, null, 2);
                        const blob = new Blob([json], { type: 'application/json' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `boq_${Date.now()}.json`;
                        a.click();
                        URL.revokeObjectURL(url);
                      }}
                      className="mt-3 w-full rounded-lg bg-slate-800 px-3 py-2 text-xs font-medium text-slate-200 hover:bg-slate-700"
                    >
                      Export BOQ Data
                    </button>
                  </div>
                )}
              </div>
            )}

            {sidebarTab === "settings" && (
              <div className="space-y-3">
                <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-3">
                  <div className="mb-2 text-sm font-semibold text-white">Settings</div>
                  <div className="space-y-2 text-xs text-slate-400">
                    <div>Calibration: {currentCalibration ? `${currentCalibration.scaleFeetPerPixel.toFixed(4)} ft/px` : "Not set"}</div>
                    <div>Reference: {currentCalibration ? formatFeetInches(currentCalibration.realDistanceFeet) : "None"}</div>
                    <div>Page: {pdf ? `${pageNumber}/${numPages}` : "No PDF"}</div>
                    <div>Zoom: {Math.round(panZoom.zoom * 100)}%</div>
                    <div>Measurements: {measurementCounts.total}</div>
                  </div>
                </div>

                <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-3">
                  <div className="mb-2 text-sm font-semibold text-white">Preferences</div>
                  <div className="space-y-2 text-xs text-slate-400">
                    <div>Auto-save: Enabled</div>
                    <div>Default units: Imperial</div>
                    <div>Grid snap: 5px</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

export default function TakeoffPage() {
  return (
    <TakeoffErrorBoundary>
      <TakeoffPageInner />
    </TakeoffErrorBoundary>
  );
}

