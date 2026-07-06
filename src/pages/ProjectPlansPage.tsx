import React, { useState, useEffect, useLayoutEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ChevronLeft, Upload, Search, Plus, X, ZoomIn, ZoomOut,
  ChevronRight, ChevronLeft as ChevronLeftIcon, Bookmark,
  Pencil, Download, Move, Ruler, Type, Trash2, Check,
  ArrowRight, RotateCcw, Maximize2, Layers,
} from "lucide-react";
import { supabase } from "../lib/supabase";

// ─── Types ────────────────────────────────────────────────────────────────────
interface Plan {
  id: string;
  project_id: string;
  file_name: string;
  file_url: string;
  file_type: string;
  file_size: number | null;
  category: string;
  page_count: number;
  calibration_data: CalibrationData | null;
  created_at: string;
  publicUrl: string;
}

interface CalibrationData {
  pixelsPerUnit: number;
  unit: string;
  knownLength: number;
}

interface Annotation {
  id: string;
  type: "pen" | "arrow" | "text";
  color: string;
  lineWidth: number;
  points: { x: number; y: number }[];
  text?: string;
}

interface Measurement {
  id: string;
  from: { x: number; y: number };
  to: { x: number; y: number };
  label: string;
  pixelLength: number;
  realLength: number | null;
  unit: string | null;
}

interface BookmarkItem {
  id: string;
  page: number;
  label: string;
  note: string;
}

const CATEGORIES = [
  "General", "Architectural", "Structural", "Electrical",
  "Plumbing", "Mechanical", "Civil", "Landscape", "Shop Drawings",
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtSize(bytes: number | null) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// Parses construction-style lengths: "10", "10.25", "1/4", "10 1/4", "10-1/4",
// and feet+inches like 1'6", 1' 6", 1'6.5", 1'6 1/2", 5'
function parseFraction(input: string): number | null {
  const s = input.trim();
  if (!s) return null;

  const feetInches = s.match(/^(\d+(?:\.\d+)?)'(?:\s*(\d+(?:\.\d+)?)(?:\s+(\d+)\/(\d+))?"?)?$/);
  if (feetInches) {
    const feet = Number(feetInches[1]);
    let inches = feetInches[2] ? Number(feetInches[2]) : 0;
    if (feetInches[3] && feetInches[4]) inches += Number(feetInches[3]) / Number(feetInches[4]);
    return feet + inches / 12;
  }

  const mixed = s.match(/^(\d+(?:\.\d+)?)[\s-]+(\d+)\/(\d+)$/);
  if (mixed) return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);
  const frac = s.match(/^(\d+)\/(\d+)$/);
  if (frac) return Number(frac[1]) / Number(frac[2]);
  const dec = Number(s.replace(/["']/g, ""));
  return Number.isFinite(dec) ? dec : null;
}

// Formats a decimal inch value as a mixed number rounded to the nearest 1/16"
function formatInches(value: number): string {
  const whole = Math.floor(value);
  let num = Math.round((value - whole) * 16);
  let den = 16;
  if (num === 16) return `${whole + 1}"`;
  if (num === 0) return `${whole}"`;
  while (num % 2 === 0) { num /= 2; den /= 2; }
  return whole > 0 ? `${whole} ${num}/${den}"` : `${num}/${den}"`;
}

// ─── PDF Renderer ─────────────────────────────────────────────────────────────
async function renderPdfPage(
  url: string,
  pageNum: number,
  canvas: HTMLCanvasElement,
  scale: number
): Promise<number> {
  const pdfjsLib = await import("pdfjs-dist");
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.mjs",
    import.meta.url
  ).toString();
  const pdf = await pdfjsLib.getDocument({ url, withCredentials: false }).promise;
  const page = await pdf.getPage(pageNum);
  const viewport = page.getViewport({ scale });
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  await page.render({ canvasContext: canvas.getContext("2d")!, viewport, canvas }).promise;
  return pdf.numPages;
}

async function getPdfPageCount(url: string): Promise<number> {
  const pdfjsLib = await import("pdfjs-dist");
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.mjs",
    import.meta.url
  ).toString();
  const pdf = await pdfjsLib.getDocument({ url, withCredentials: false }).promise;
  return pdf.numPages;
}

// ─── PlanViewer ───────────────────────────────────────────────────────────────
function PlanViewer({
  plan,
  onClose,
  onCalibrationSave,
}: {
  plan: Plan;
  onClose: () => void;
  onCalibrationSave: (data: CalibrationData) => void;
}) {
  const isPdf = plan.file_type === "application/pdf" || plan.file_url.toLowerCase().endsWith(".pdf");

  // Render state
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const annotCanvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [pageNum, setPageNum] = useState(1);
  const [totalPages, setTotalPages] = useState(isPdf ? (plan.page_count ?? 1) : 1);
  const [scale, setScale] = useState(1.2);
  const [rendering, setRendering] = useState(false);

  // Pan state
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const panStart = useRef<{ mx: number; my: number; px: number; py: number } | null>(null);
  const isPanning = useRef(false);

  // Tool state
  const [activeTool, setActiveTool] = useState<"pan" | "pen" | "arrow" | "text" | "measure" | "calibrate">("pan");
  const [penColor, setPenColor] = useState("#ef4444");
  const [penWidth, setPenWidth] = useState(2);

  // Annotations
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const drawingAnnot = useRef<Annotation | null>(null);
  const isAnnotDrawing = useRef(false);

  // Text input overlay
  const [textPos, setTextPos] = useState<{ x: number; y: number } | null>(null);
  const [textVal, setTextVal] = useState("");

  // Measurements
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const measStart = useRef<{ x: number; y: number } | null>(null);
  const isMeasuring = useRef(false);
  const [pendingMeas, setPendingMeas] = useState<Omit<Measurement, "id"> | null>(null);

  // Calibration — two-click approach
  const [calibration, setCalibration] = useState<CalibrationData | null>(plan.calibration_data ?? null);
  const [calibStep, setCalibStep] = useState<"idle" | "drawing" | "input">("idle");
  const [calibPoints, setCalibPoints] = useState<{ x: number; y: number }[]>([]);
  const [pendingCalib, setPendingCalib] = useState<{ from: { x: number; y: number }; to: { x: number; y: number }; px: number } | null>(null);
  const [calibLength, setCalibLength] = useState("");
  const [calibUnit, setCalibUnit] = useState("ft");
  const [calibFeet, setCalibFeet] = useState("");
  const [calibInches, setCalibInches] = useState("");
  const [calibFraction, setCalibFraction] = useState("0");

  // Bookmarks
  const [bookmarks, setBookmarks] = useState<BookmarkItem[]>([]);
  const [showBookmarks, setShowBookmarks] = useState(false);
  const [bookmarkLabel, setBookmarkLabel] = useState("");
  const [addingBookmark, setAddingBookmark] = useState(false);

  // Thumbnails
  const [showThumbs, setShowThumbs] = useState(false);
  const thumbRefs = useRef<Map<number, HTMLCanvasElement>>(new Map());

  // ── Load page ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isPdf) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    setRendering(true);
    renderPdfPage(plan.publicUrl, pageNum, canvas, scale)
      .then(total => { setTotalPages(total); setRendering(false); syncAnnotCanvas(); })
      .catch(() => setRendering(false));
  }, [pageNum, scale, plan.publicUrl, isPdf]);

  // Sync annotation canvas size to the underlying PDF canvas or image
  function syncAnnotCanvas() {
    const ann = annotCanvasRef.current;
    if (!ann) return;
    if (isPdf) {
      const base = canvasRef.current;
      if (!base) return;
      ann.width = base.width;
      ann.height = base.height;
    } else {
      const img = imgRef.current;
      if (!img) return;
      ann.width = img.naturalWidth;
      ann.height = img.naturalHeight;
    }
    redrawAnnotations(annotations);
  }

  // ── Thumbnails ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!showThumbs || !isPdf) return;
    for (let p = 1; p <= totalPages; p++) {
      const c = thumbRefs.current.get(p);
      if (c && c.dataset.loaded !== "1") {
        renderPdfPage(plan.publicUrl, p, c, 0.2).then(() => { c.dataset.loaded = "1"; });
      }
    }
  }, [showThumbs, totalPages]);

  // ── Annotation draw ───────────────────────────────────────────────────────
  function redrawAnnotations(anns: Annotation[]) {
    const ann = annotCanvasRef.current;
    if (!ann) return;
    const ctx = ann.getContext("2d")!;
    ctx.clearRect(0, 0, ann.width, ann.height);
    anns.forEach(a => drawAnnot(ctx, a));
    measurements.forEach(m => drawMeasLine(ctx, m.from, m.to, m.label, "#f97316"));
    drawCalibOverlay(ctx);
  }

  // Locked calibration dot(s)/line — kept in sync with calibPoints so it
  // survives any redraw instead of being a one-off imperative paint.
  function drawCalibOverlay(ctx: CanvasRenderingContext2D) {
    if (calibPoints.length === 0) return;
    drawCalibDot(ctx, calibPoints[0]);
    if (calibPoints.length >= 2) {
      drawCalibDot(ctx, calibPoints[1]);
      drawCalibLine(ctx, calibPoints[0], calibPoints[1]);
    }
  }

  function drawCalibDot(ctx: CanvasRenderingContext2D, pt: { x: number; y: number }) {
    ctx.save();
    ctx.fillStyle = "#f59e0b";
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }

  function drawCalibLine(ctx: CanvasRenderingContext2D, from: { x: number; y: number }, to: { x: number; y: number }) {
    ctx.save();
    ctx.strokeStyle = "#f59e0b";
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 3]);
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
    ctx.setLineDash([]);
    const px = Math.hypot(to.x - from.x, to.y - from.y);
    ctx.fillStyle = "#f59e0b";
    ctx.font = "bold 13px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(`${px.toFixed(0)} px`, (from.x + to.x) / 2, (from.y + to.y) / 2 - 10);
    ctx.textAlign = "left";
    ctx.restore();
  }

  function drawAnnot(ctx: CanvasRenderingContext2D, a: Annotation) {
    ctx.save();
    ctx.strokeStyle = a.color; ctx.fillStyle = a.color;
    ctx.lineWidth = a.lineWidth; ctx.lineCap = "round"; ctx.lineJoin = "round";
    if (a.type === "pen" && a.points.length > 1) {
      ctx.beginPath(); ctx.moveTo(a.points[0].x, a.points[0].y);
      a.points.forEach(p => ctx.lineTo(p.x, p.y)); ctx.stroke();
    } else if (a.type === "arrow" && a.points.length >= 2) {
      const [from, to] = [a.points[0], a.points[a.points.length - 1]];
      const angle = Math.atan2(to.y - from.y, to.x - from.x);
      const hl = 14;
      ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(to.x, to.y);
      ctx.lineTo(to.x - hl * Math.cos(angle - 0.4), to.y - hl * Math.sin(angle - 0.4));
      ctx.moveTo(to.x, to.y);
      ctx.lineTo(to.x - hl * Math.cos(angle + 0.4), to.y - hl * Math.sin(angle + 0.4));
      ctx.stroke();
    } else if (a.type === "text" && a.text) {
      ctx.font = `bold 16px sans-serif`;
      ctx.fillText(a.text, a.points[0].x, a.points[0].y);
    }
    ctx.restore();
  }

  function drawMeasLine(
    ctx: CanvasRenderingContext2D,
    from: { x: number; y: number },
    to: { x: number; y: number },
    label: string,
    color: string
  ) {
    ctx.save();
    ctx.strokeStyle = color; ctx.fillStyle = color;
    ctx.lineWidth = 2; ctx.setLineDash([6, 3]);
    ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(to.x, to.y); ctx.stroke();
    ctx.setLineDash([]);
    ctx.font = "bold 13px sans-serif"; ctx.textAlign = "center";
    ctx.fillText(label, (from.x + to.x) / 2, (from.y + to.y) / 2 - 6);
    ctx.textAlign = "left";
    ctx.restore();
  }

  function formatMeasurement(px: number, calib: CalibrationData): string {
    const real = px / calib.pixelsPerUnit;
    return calib.unit === "in" ? formatInches(real) : `${real.toFixed(2)} ${calib.unit}`;
  }

  useLayoutEffect(() => { redrawAnnotations(annotations); }, [annotations, measurements, calibPoints]);

  // ── Pointer events ────────────────────────────────────────────────────────
  function getCanvasPos(e: React.MouseEvent<HTMLCanvasElement>): { x: number; y: number } {
    const canvas = annotCanvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
  }

  function onMouseDown(e: React.MouseEvent<HTMLCanvasElement>) {
    const pos = getCanvasPos(e);
    if (activeTool === "pan") {
      isPanning.current = true;
      panStart.current = { mx: e.clientX, my: e.clientY, px: pan.x, py: pan.y };
      return;
    }
    if (activeTool === "pen" || activeTool === "arrow") {
      isAnnotDrawing.current = true;
      const a: Annotation = { id: crypto.randomUUID(), type: activeTool, color: penColor, lineWidth: penWidth, points: [pos] };
      drawingAnnot.current = a;
      return;
    }
    if (activeTool === "text") {
      setTextPos(pos); return;
    }
    if (activeTool === "measure") {
      if (!isMeasuring.current) {
        isMeasuring.current = true;
        measStart.current = pos;
      } else {
        // Second click — finalize the measurement and open the save popup.
        const start = measStart.current!;
        const dx = pos.x - start.x; const dy = pos.y - start.y;
        const px = Math.sqrt(dx * dx + dy * dy);
        const real = calibration ? px / calibration.pixelsPerUnit : null;
        const label = real != null
          ? (calibration!.unit === "in" ? formatInches(real) : `${real.toFixed(2)} ${calibration!.unit}`)
          : `${px.toFixed(0)} px`;
        const m: Measurement = {
          id: crypto.randomUUID(), from: start, to: pos,
          label, pixelLength: px, realLength: real, unit: calibration?.unit ?? null,
        };
        setPendingMeas(m);
        isMeasuring.current = false;
        measStart.current = null;
      }
      return;
    }
    if (activeTool === "calibrate") {
      if (calibStep === "idle") {
        setCalibPoints([pos]);
        setCalibStep("drawing");
      } else if (calibStep === "drawing" && calibPoints.length === 1) {
        // Second click — compute pixel distance and open input dialog.
        // The locked dot/line stays visible via the calibPoints-driven redraw effect.
        const dx = pos.x - calibPoints[0].x;
        const dy = pos.y - calibPoints[0].y;
        const px = Math.sqrt(dx * dx + dy * dy);
        setCalibPoints([calibPoints[0], pos]);
        setPendingCalib({ from: calibPoints[0], to: pos, px });
        setCalibStep("input");
      }
      return;
    }
  }

  function onMouseMove(e: React.MouseEvent<HTMLCanvasElement>) {
    if (activeTool === "pan" && isPanning.current && panStart.current) {
      setPan({ x: panStart.current.px + e.clientX - panStart.current.mx, y: panStart.current.py + e.clientY - panStart.current.my });
      return;
    }
    if ((activeTool === "pen" || activeTool === "arrow") && isAnnotDrawing.current && drawingAnnot.current) {
      const pos = getCanvasPos(e);
      if (activeTool === "pen") drawingAnnot.current.points.push(pos);
      else drawingAnnot.current.points = [drawingAnnot.current.points[0], pos];
      const ann = annotCanvasRef.current!;
      const ctx = ann.getContext("2d")!;
      ctx.clearRect(0, 0, ann.width, ann.height);
      annotations.forEach(a => drawAnnot(ctx, a));
      measurements.forEach(m => drawMeasLine(ctx, m.from, m.to, m.label, "#f97316"));
      drawAnnot(ctx, drawingAnnot.current);
    }
    if (activeTool === "calibrate" && calibStep === "drawing" && calibPoints.length === 1) {
      const pos = getCanvasPos(e);
      const ann = annotCanvasRef.current;
      if (!ann) return;
      const ctx = ann.getContext("2d")!;
      ctx.clearRect(0, 0, ann.width, ann.height);
      annotations.forEach(a => drawAnnot(ctx, a));
      measurements.forEach(m => drawMeasLine(ctx, m.from, m.to, m.label, "#f97316"));
      drawCalibDot(ctx, calibPoints[0]);
      drawCalibLine(ctx, calibPoints[0], pos);
      return;
    }
    if (activeTool === "measure" && isMeasuring.current) {
      const pos = getCanvasPos(e);
      const start = measStart.current;
      if (!start) return;
      const ann = annotCanvasRef.current!;
      const ctx = ann.getContext("2d")!;
      ctx.clearRect(0, 0, ann.width, ann.height);
      annotations.forEach(a => drawAnnot(ctx, a));
      measurements.forEach(m => drawMeasLine(ctx, m.from, m.to, m.label, "#f97316"));
      const px = Math.hypot(pos.x - start.x, pos.y - start.y);
      const liveLabel = calibration
        ? formatMeasurement(px, calibration)
        : `${px.toFixed(0)} px`;
      drawMeasLine(ctx, start, pos, liveLabel, "#f97316");
    }
  }

  function onMouseUp(e: React.MouseEvent<HTMLCanvasElement>) {
    isPanning.current = false;
    if ((activeTool === "pen" || activeTool === "arrow") && isAnnotDrawing.current && drawingAnnot.current) {
      isAnnotDrawing.current = false;
      const next = [...annotations, drawingAnnot.current];
      setAnnotations(next);
      drawingAnnot.current = null;
      return;
    }
    // Measure and calibrate are both two-click tools; nothing to do on mouseUp
  }

  function commitText() {
    if (!textVal.trim() || !textPos) return;
    const a: Annotation = { id: crypto.randomUUID(), type: "text", color: penColor, lineWidth: penWidth, points: [textPos], text: textVal };
    setAnnotations(prev => [...prev, a]);
    setTextPos(null); setTextVal("");
  }

  function commitMeasurement() {
    if (!pendingMeas) return;
    setMeasurements(prev => [...prev, { ...pendingMeas, id: crypto.randomUUID() }]);
    setPendingMeas(null);
  }

  function commitCalibration() {
    if (!pendingCalib) return;
    const realLength = calibUnit === "ft"
      ? (parseFloat(calibFeet || "0") + (parseFloat(calibInches || "0") + parseFloat(calibFraction || "0")) / 12)
      : parseFraction(calibLength);
    if (realLength == null || realLength <= 0) return;
    const ppu = pendingCalib.px / realLength;
    const data: CalibrationData = { pixelsPerUnit: ppu, unit: calibUnit, knownLength: realLength };
    setCalibration(data);
    onCalibrationSave(data);
    setPendingCalib(null); setCalibLength("");
    setCalibFeet(""); setCalibInches(""); setCalibFraction("0");
    setCalibStep("idle"); setCalibPoints([]);
  }

  function addBookmark() {
    const b: BookmarkItem = { id: crypto.randomUUID(), page: pageNum, label: bookmarkLabel || `Page ${pageNum}`, note: "" };
    setBookmarks(prev => [...prev, b]);
    setBookmarkLabel(""); setAddingBookmark(false);
  }

  function exportAnnotated() {
    const base = canvasRef.current;
    const ann = annotCanvasRef.current;
    if (!base || !ann) return;
    const out = document.createElement("canvas");
    out.width = base.width; out.height = base.height;
    const ctx = out.getContext("2d")!;
    ctx.drawImage(base, 0, 0);
    ctx.drawImage(ann, 0, 0);
    const a = document.createElement("a");
    a.download = `${plan.file_name}-p${pageNum}-annotated.png`;
    a.href = out.toDataURL("image/png"); a.click();
  }

  const TOOLS = [
    { key: "pan" as const, icon: <Move size={15}/>, title: "Pan" },
    { key: "pen" as const, icon: <Pencil size={15}/>, title: "Draw" },
    { key: "arrow" as const, icon: <ArrowRight size={15}/>, title: "Arrow" },
    { key: "text" as const, icon: <Type size={15}/>, title: "Text" },
    { key: "measure" as const, icon: <Ruler size={15}/>, title: "Measure" },
    { key: "calibrate" as const, icon: <Maximize2 size={15}/>, title: "Calibrate" },
  ];
  const COLORS = ["#ef4444","#f97316","#eab308","#22c55e","#3b82f6","#8b5cf6","#ffffff","#000000"];

  return (
    <div className="fixed inset-0 bg-slate-950 z-50 flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 bg-slate-900 border-b border-slate-800 flex-wrap">
        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors">
          <X size={16}/>
        </button>
        <span className="text-sm font-semibold text-white truncate max-w-xs">{plan.file_name}</span>

        <div className="flex items-center gap-1 bg-slate-800 rounded-lg p-1 ml-1">
          {TOOLS.map(t => (
            <button key={t.key} onClick={() => setActiveTool(t.key)} title={t.title}
              className={`p-1.5 rounded-md transition-colors ${activeTool === t.key ? "bg-blue-600 text-white" : "text-slate-400 hover:text-white hover:bg-slate-700"}`}>
              {t.icon}
            </button>
          ))}
        </div>

        {/* Color + width (pen/arrow/text) */}
        {(activeTool === "pen" || activeTool === "arrow" || activeTool === "text") && (
          <div className="flex items-center gap-1.5">
            {COLORS.map(c => (
              <button key={c} onClick={() => setPenColor(c)}
                className={`w-5 h-5 rounded-full border-2 transition-transform ${penColor === c ? "border-white scale-125" : "border-transparent"}`}
                style={{ background: c }}/>
            ))}
            {[1, 2, 4].map(w => (
              <button key={w} onClick={() => setPenWidth(w)}
                className={`px-2 py-0.5 rounded text-xs font-bold transition-colors ${penWidth === w ? "bg-blue-600 text-white" : "bg-slate-700 text-slate-300 hover:bg-slate-600"}`}>
                {w}
              </button>
            ))}
          </div>
        )}

        <div className="flex-1"/>

        {/* Page nav */}
        {isPdf && (
          <div className="flex items-center gap-1">
            <button onClick={() => setPageNum(p => Math.max(1, p - 1))} disabled={pageNum === 1}
              className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white disabled:opacity-30 transition-colors">
              <ChevronLeftIcon size={15}/>
            </button>
            <span className="text-xs text-slate-300 px-1">{pageNum} / {totalPages}</span>
            <button onClick={() => setPageNum(p => Math.min(totalPages, p + 1))} disabled={pageNum === totalPages}
              className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white disabled:opacity-30 transition-colors">
              <ChevronRight size={15}/>
            </button>
          </div>
        )}

        {/* Zoom */}
        <div className="flex items-center gap-1">
          <button onClick={() => setScale(s => Math.max(0.3, +(s - 0.2).toFixed(1)))} className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"><ZoomOut size={15}/></button>
          <span className="text-xs text-slate-300 w-10 text-center">{Math.round(scale * 100)}%</span>
          <button onClick={() => setScale(s => Math.min(5, +(s + 0.2).toFixed(1)))} className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"><ZoomIn size={15}/></button>
          <button onClick={() => { setScale(1.2); setPan({ x: 0, y: 0 }); }} className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors" title="Reset view"><RotateCcw size={13}/></button>
        </div>

        <button onClick={() => setShowThumbs(s => !s)} title="Thumbnails"
          className={`p-1.5 rounded-lg transition-colors ${showThumbs ? "bg-blue-600 text-white" : "hover:bg-slate-800 text-slate-400 hover:text-white"}`}>
          <Layers size={15}/>
        </button>
        <button onClick={() => setShowBookmarks(s => !s)} title="Bookmarks"
          className={`p-1.5 rounded-lg transition-colors ${showBookmarks ? "bg-blue-600 text-white" : "hover:bg-slate-800 text-slate-400 hover:text-white"}`}>
          <Bookmark size={15}/>
        </button>
        <button onClick={() => setAddingBookmark(true)} title="Add bookmark"
          className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors">
          <Plus size={15}/>
        </button>
        <button onClick={exportAnnotated} title="Export annotated PNG"
          className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors">
          <Download size={15}/>
        </button>
        <button onClick={() => { setAnnotations([]); setMeasurements([]); }} title="Clear annotations"
          className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-red-400 transition-colors">
          <Trash2 size={15}/>
        </button>
      </div>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Thumbnail strip */}
        {showThumbs && isPdf && (
          <div className="w-28 bg-slate-900 border-r border-slate-800 overflow-y-auto flex flex-col gap-2 p-2 flex-shrink-0">
            {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
              <div key={p} onClick={() => setPageNum(p)}
                className={`rounded-lg overflow-hidden cursor-pointer border-2 transition-colors ${pageNum === p ? "border-blue-500" : "border-transparent hover:border-slate-600"}`}>
                <canvas
                  ref={el => { if (el) thumbRefs.current.set(p, el); }}
                  className="w-full"
                />
                <div className="text-center text-[10px] text-slate-500 py-0.5">{p}</div>
              </div>
            ))}
          </div>
        )}

        {/* Bookmark panel */}
        {showBookmarks && (
          <div className="w-56 bg-slate-900 border-r border-slate-800 overflow-y-auto flex flex-col gap-1 p-3 flex-shrink-0">
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Bookmarks</div>
            {bookmarks.length === 0 && (
              <div className="text-xs text-slate-600 text-center py-4">No bookmarks yet.<br/>Use + to add one.</div>
            )}
            {bookmarks.map(b => (
              <div key={b.id} onClick={() => { setPageNum(b.page); }}
                className="flex items-center gap-2 p-2 rounded-lg hover:bg-slate-800 cursor-pointer group">
                <Bookmark size={12} className="text-amber-400 flex-shrink-0"/>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-slate-200 truncate">{b.label}</div>
                  <div className="text-[10px] text-slate-500">Page {b.page}</div>
                </div>
                <button onClick={ev => { ev.stopPropagation(); setBookmarks(prev => prev.filter(x => x.id !== b.id)); }}
                  className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:text-red-400 text-slate-500 transition-all">
                  <X size={10}/>
                </button>
              </div>
            ))}
            {calibration && (
              <div className="mt-3 pt-3 border-t border-slate-800">
                <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Calibration</div>
                <div className="text-xs text-slate-300">{calibration.pixelsPerUnit.toFixed(1)} px/{calibration.unit}</div>
                <button onClick={() => setCalibration(null)} className="text-[10px] text-red-400 hover:text-red-300 mt-1">Clear</button>
              </div>
            )}
          </div>
        )}

        {/* Canvas area */}
        <div ref={containerRef} className="flex-1 overflow-auto bg-slate-950 relative flex items-start justify-center p-4">
          {rendering && (
            <div className="absolute inset-0 flex items-center justify-center z-10">
              <div className="text-slate-400 text-sm animate-pulse">Rendering…</div>
            </div>
          )}
          <div style={{ transform: `translate(${pan.x}px, ${pan.y}px)`, userSelect: "none" }} className="relative inline-block">
            {isPdf ? (
              <canvas ref={canvasRef} className="block shadow-2xl"/>
            ) : (
              <img ref={imgRef} src={plan.publicUrl} alt={plan.file_name} className="block shadow-2xl max-w-none" style={{ width: `${scale * 100}%`, transform: "none" }} onLoad={syncAnnotCanvas}/>
            )}
            <canvas ref={annotCanvasRef}
              className="absolute inset-0 w-full h-full"
              style={{ cursor: activeTool === "pan" ? "grab" : "crosshair", touchAction: "none" }}
              onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp}
            />
          </div>

          {/* Text input overlay */}
          {textPos && (
            <div className="absolute z-20 flex items-center gap-2 bg-slate-900/95 border border-slate-700 rounded-xl p-3 shadow-2xl" style={{ top: "20%", left: "50%", transform: "translateX(-50%)" }}>
              <input value={textVal} onChange={e => setTextVal(e.target.value)}
                onKeyDown={e => e.key === "Enter" && commitText()}
                autoFocus placeholder="Label…"
                className="px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-sm text-white placeholder-slate-500 focus:outline-none w-40"/>
              <button onClick={commitText} className="p-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white"><Check size={14}/></button>
              <button onClick={() => { setTextPos(null); setTextVal(""); }} className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400"><X size={14}/></button>
            </div>
          )}

          {/* Add bookmark overlay */}
          {addingBookmark && (
            <div className="absolute z-20 flex items-center gap-2 bg-slate-900/95 border border-slate-700 rounded-xl p-3 shadow-2xl" style={{ top: "20%", left: "50%", transform: "translateX(-50%)" }}>
              <Bookmark size={14} className="text-amber-400"/>
              <input value={bookmarkLabel} onChange={e => setBookmarkLabel(e.target.value)}
                onKeyDown={e => e.key === "Enter" && addBookmark()}
                autoFocus placeholder={`Bookmark page ${pageNum}…`}
                className="px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-sm text-white placeholder-slate-500 focus:outline-none w-44"/>
              <button onClick={addBookmark} className="p-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white"><Check size={14}/></button>
              <button onClick={() => setAddingBookmark(false)} className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400"><X size={14}/></button>
            </div>
          )}

          {/* Measurement confirm overlay */}
          {pendingMeas && (
            <div className="absolute z-20 bg-slate-900/95 border border-slate-700 rounded-xl p-4 shadow-2xl" style={{ top: "20%", left: "50%", transform: "translateX(-50%)" }}>
              <div className="text-sm text-slate-200 mb-2">Add measurement?</div>
              <div className="text-xs text-slate-400 mb-3">
                {pendingMeas.label} ({pendingMeas.pixelLength.toFixed(0)} px)
                {calibration ? "" : " — calibrate for real units"}
              </div>
              <div className="flex gap-2">
                <button onClick={commitMeasurement} className="px-3 py-1.5 rounded-lg bg-orange-600 hover:bg-orange-700 text-white text-xs font-semibold">Add</button>
                <button onClick={() => setPendingMeas(null)} className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs">Discard</button>
              </div>
            </div>
          )}

          {/* Calibration confirm overlay */}
          {pendingCalib && (
            <div className="absolute z-20 bg-slate-900/95 border border-slate-700 rounded-xl p-4 shadow-2xl" style={{ top: "20%", left: "50%", transform: "translateX(-50%)" }}>
              <div className="text-sm font-semibold text-slate-200 mb-1">Set calibration</div>
              <div className="text-xs text-slate-400 mb-3">Line = {pendingCalib.px.toFixed(0)} px. What is the real length?</div>
              <div className="flex items-end gap-2 mb-3">
                {calibUnit === "ft" ? (
                  <>
                    <div className="flex flex-col items-center gap-1">
                      <input type="number" min="0" value={calibFeet} onChange={e => setCalibFeet(e.target.value)}
                        onKeyDown={e => e.key === "Enter" && commitCalibration()}
                        placeholder="0" autoFocus
                        className="w-16 px-2 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-sm text-white text-center focus:outline-none focus:border-blue-500"/>
                      <span className="text-[10px] text-slate-500">ft</span>
                    </div>
                    <span className="text-slate-500 text-sm mb-4">—</span>
                    <div className="flex flex-col items-center gap-1">
                      <input type="number" min="0" max="11" value={calibInches} onChange={e => setCalibInches(e.target.value)}
                        onKeyDown={e => e.key === "Enter" && commitCalibration()}
                        placeholder="0"
                        className="w-16 px-2 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-sm text-white text-center focus:outline-none focus:border-blue-500"/>
                      <span className="text-[10px] text-slate-500">in</span>
                    </div>
                    <span className="text-slate-500 text-sm mb-4">—</span>
                    <div className="flex flex-col items-center gap-1">
                      <select value={calibFraction} onChange={e => setCalibFraction(e.target.value)}
                        className="w-20 px-2 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-sm text-white text-center focus:outline-none focus:border-blue-500">
                        <option value="0">—</option>
                        <option value="0.125">⅛"</option>
                        <option value="0.25">¼"</option>
                        <option value="0.375">⅜"</option>
                        <option value="0.5">½"</option>
                        <option value="0.625">⅝"</option>
                        <option value="0.75">¾"</option>
                        <option value="0.875">⅞"</option>
                      </select>
                      <span className="text-[10px] text-slate-500">frac</span>
                    </div>
                  </>
                ) : (
                  <input value={calibLength} onChange={e => setCalibLength(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && commitCalibration()}
                    placeholder={calibUnit === "in" ? `e.g. 10 or 10 1/4` : "e.g. 10"} autoFocus
                    className="px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-sm text-white w-28 focus:outline-none"/>
                )}
                <select value={calibUnit} onChange={e => setCalibUnit(e.target.value)}
                  className="px-2 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-sm text-white focus:outline-none">
                  {["ft","m","in","mm","cm","yd"].map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
              {calibUnit === "ft" && (
                <div className="text-xs text-amber-400 mb-3 text-center">
                  = {(parseFloat(calibFeet || "0") + (parseFloat(calibInches || "0") + parseFloat(calibFraction || "0")) / 12).toFixed(4)} ft
                </div>
              )}
              {calibUnit === "in" && (
                <div className="text-[10px] text-slate-500 mb-3 -mt-2">Accepts: 10, 10 1/4, 10-1/4</div>
              )}
              <div className="flex gap-2">
                <button onClick={commitCalibration} className="px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-xs font-semibold">Save calibration</button>
                <button onClick={() => { setPendingCalib(null); setCalibStep("idle"); setCalibPoints([]); }} className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs">Cancel</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── FileList ─────────────────────────────────────────────────────────────────
function FileList({
  plans,
  uploading,
  onUpload,
  onOpen,
  onDelete,
}: {
  plans: Plan[];
  uploading: boolean;
  onUpload: (files: FileList) => void;
  onOpen: (plan: Plan) => void;
  onDelete: (plan: Plan) => void;
}) {
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("All");
  const fileRef = useRef<HTMLInputElement>(null);

  const filtered = plans.filter(p => {
    const matchCat = catFilter === "All" || p.category === catFilter;
    const matchSearch = !search || p.file_name.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  });

  const cats = ["All", ...CATEGORIES.filter(c => plans.some(p => p.category === c))];

  function thumbUrl(plan: Plan) {
    if (plan.file_type.startsWith("image/")) return plan.publicUrl;
    return null;
  }

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[180px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search plans…"
            className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-700 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30"/>
        </div>
        <select value={catFilter} onChange={e => setCatFilter(e.target.value)}
          className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-700 dark:text-slate-200 focus:outline-none">
          {cats.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <button onClick={() => fileRef.current?.click()} disabled={uploading}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold transition-colors">
          <Upload size={14}/> {uploading ? "Uploading…" : "Upload"}
        </button>
        <input ref={fileRef} type="file" accept=".pdf,image/*" multiple className="hidden"
          onChange={e => e.target.files && onUpload(e.target.files)}/>
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <div className="text-center py-20">
          <div className="text-4xl mb-3">📐</div>
          <p className="text-slate-500 dark:text-slate-400 text-sm">
            {plans.length === 0 ? "No plans uploaded yet — click Upload to add PDFs or images." : "No plans match your search."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {filtered.map(plan => {
            const thumb = thumbUrl(plan);
            return (
              <div key={plan.id}
                className="group bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden hover:border-blue-400 dark:hover:border-blue-500 transition-colors cursor-pointer"
                onClick={() => onOpen(plan)}>
                {/* Thumbnail */}
                <div className="aspect-[4/3] bg-slate-100 dark:bg-slate-800 flex items-center justify-center overflow-hidden">
                  {thumb ? (
                    <img src={thumb} alt={plan.file_name} className="w-full h-full object-cover"/>
                  ) : (
                    <div className="flex flex-col items-center gap-1">
                      <div className="text-3xl">📄</div>
                      {plan.page_count > 1 && (
                        <div className="text-xs text-slate-400">{plan.page_count} pages</div>
                      )}
                    </div>
                  )}
                </div>
                {/* Info */}
                <div className="p-3">
                  <div className="text-xs font-semibold text-slate-700 dark:text-slate-200 truncate">{plan.file_name}</div>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-[10px] text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">{plan.category}</span>
                    <span className="text-[10px] text-slate-400">{fmtSize(plan.file_size)}</span>
                  </div>
                  <div className="text-[10px] text-slate-400 mt-1">{fmtDate(plan.created_at)}</div>
                </div>
                {/* Actions */}
                <div className="border-t border-slate-100 dark:border-slate-800 flex opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={e => { e.stopPropagation(); onOpen(plan); }}
                    className="flex-1 py-2 text-xs font-medium text-slate-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-500/10 transition-colors">
                    Open
                  </button>
                  <div className="w-px bg-slate-100 dark:bg-slate-800"/>
                  <button onClick={e => { e.stopPropagation(); onDelete(plan); }}
                    className="flex-1 py-2 text-xs font-medium text-slate-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors">
                    Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function ProjectPlansPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [viewingPlan, setViewingPlan] = useState<Plan | null>(null);

  // Category picker during upload
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [uploadCategory, setUploadCategory] = useState("General");
  const [showCategoryModal, setShowCategoryModal] = useState(false);

  useEffect(() => {
    if (projectId) { loadProject(); loadPlans(); }
  }, [projectId]);

  async function loadProject() {
    const { data } = await supabase.from("projects").select("name").eq("id", projectId!).single();
    if (data) setProjectName(data.name);
  }

  async function loadPlans() {
    setLoading(true);
    const { data } = await supabase
      .from("project_plans").select("*").eq("project_id", projectId!)
      .order("created_at", { ascending: false });
    const withUrls = (data || []).map((p: any) => {
      const { data: urlData } = supabase.storage.from("project-files").getPublicUrl(p.file_url);
      return { ...p, publicUrl: urlData.publicUrl } as Plan;
    });
    setPlans(withUrls);
    setLoading(false);
  }

  function handleFileDrop(files: FileList) {
    const arr = Array.from(files);
    setPendingFiles(arr);
    setUploadCategory("General");
    setShowCategoryModal(true);
  }

  async function doUpload() {
    if (!pendingFiles.length || !projectId) return;
    setShowCategoryModal(false);
    setUploading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: profile } = await supabase.from("user_profiles").select("company_id").eq("id", user!.id).single();

      for (const file of pendingFiles) {
        const ext = file.name.split(".").pop() ?? "bin";
        const path = `plans/${projectId}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
        const { error: upErr } = await supabase.storage.from("project-files").upload(path, file, { upsert: false });
        if (upErr) { console.error(upErr); continue; }

        let pageCount = 1;
        if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
          const { data: urlData } = supabase.storage.from("project-files").getPublicUrl(path);
          try { pageCount = await getPdfPageCount(urlData.publicUrl); } catch {}
        }

        await supabase.from("project_plans").insert({
          project_id: projectId,
          company_id: profile?.company_id,
          file_name: file.name,
          file_url: path,
          file_type: file.type || "application/octet-stream",
          file_size: file.size,
          category: uploadCategory,
          page_count: pageCount,
          uploaded_by: user!.id,
        });
      }
    } finally {
      setUploading(false);
      setPendingFiles([]);
      await loadPlans();
    }
  }

  async function handleDelete(plan: Plan) {
    if (!confirm(`Delete "${plan.file_name}"?`)) return;
    await supabase.from("project_plans").delete().eq("id", plan.id);
    await supabase.storage.from("project-files").remove([plan.file_url]);
    await loadPlans();
  }

  async function handleCalibrationSave(planId: string, data: CalibrationData) {
    await supabase.from("project_plans").update({ calibration_data: data }).eq("id", planId);
    setPlans(prev => prev.map(p => p.id === planId ? { ...p, calibration_data: data } : p));
    if (viewingPlan?.id === planId) setViewingPlan(prev => prev ? { ...prev, calibration_data: data } : prev);
  }

  if (loading) return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center">
      <p className="text-slate-400 text-sm animate-pulse">Loading plans…</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      {/* Header */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
          <ChevronLeft size={18} className="text-slate-600 dark:text-slate-300"/>
        </button>
        <div className="flex-1">
          <h1 className="text-base font-bold text-slate-800 dark:text-slate-100">Plans & Drawings</h1>
          <p className="text-xs text-slate-500">{projectName}</p>
        </div>
        <span className="text-xs text-slate-400">{plans.length} file{plans.length !== 1 ? "s" : ""}</span>
      </div>

      <div className="max-w-5xl mx-auto p-4">
        <FileList
          plans={plans}
          uploading={uploading}
          onUpload={handleFileDrop}
          onOpen={plan => setViewingPlan(plan)}
          onDelete={handleDelete}
        />
      </div>

      {/* Category picker modal */}
      {showCategoryModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 w-full max-w-sm shadow-2xl space-y-4">
            <h2 className="text-base font-bold text-slate-800 dark:text-slate-100">Set category</h2>
            <p className="text-xs text-slate-500">{pendingFiles.length} file{pendingFiles.length !== 1 ? "s" : ""} selected</p>
            <ul className="text-xs text-slate-600 dark:text-slate-400 space-y-0.5 max-h-24 overflow-y-auto">
              {pendingFiles.map(f => <li key={f.name} className="truncate">• {f.name}</li>)}
            </ul>
            <select value={uploadCategory} onChange={e => setUploadCategory(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/30">
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <div className="flex gap-3">
              <button onClick={doUpload}
                className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm transition-colors">
                Upload
              </button>
              <button onClick={() => { setShowCategoryModal(false); setPendingFiles([]); }}
                className="px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-sm hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Plan viewer */}
      {viewingPlan && (
        <PlanViewer
          plan={viewingPlan}
          onClose={() => setViewingPlan(null)}
          onCalibrationSave={data => handleCalibrationSave(viewingPlan.id, data)}
        />
      )}
    </div>
  );
}
