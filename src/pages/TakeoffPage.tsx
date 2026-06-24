// src/pages/TakeoffPage.tsx — Magnus Boys Takeoff v4
// PlanSwift-inspired layout: left toolbar, canvas center, right panel
// Fixed: single-canvas rendering, correct pan/zoom coords, assembly templates

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import workerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { supabase } from "../lib/supabase";
import { useProjectContext } from "../context/ProjectContext";
import {
  Upload, Ruler, Download, FileText, X, ChevronLeft, ChevronRight,
  ZoomIn, ZoomOut, Maximize2, Trash2, Hash, Square, Box,
  AlertCircle, RefreshCw, Send, MousePointer, Plus, Check,
  Crosshair, Package, Layers, BarChart2, ChevronRight as Arrow,
  BookOpen, Wand2, Eye, EyeOff, Edit2
} from "lucide-react";

GlobalWorkerOptions.workerSrc = workerSrc;

// ─── Types ────────────────────────────────────────────────────────────────────
type Point = { x: number; y: number };
type ToolMode = "select" | "pan" | "line" | "area" | "count" | "volume";

interface Measurement {
  id: string;
  type: ToolMode;
  points: Point[];
  result: number;
  unit: string;
  label: string;
  color: string;
  linkedAssemblyId?: string;
  linkedAssemblyName?: string;
  linkedItemId?: string;
  linkedItemName?: string;
  timestamp: number;
  pageNumber?: number;
}

interface PdfFile {
  name: string;
  storagePath?: string;
  size: number;
}

interface Assembly {
  id: string;
  name: string;
  category: string | null;
  unit: string | null;
  componentCount?: number;
}

interface CostItem {
  id: string;
  item_name: string;
  unit: string | null;
  category: string | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────
const TOOL_CFG: Record<ToolMode, { label: string; shortcut: string; color: string; desc: string; icon: React.ReactNode }> = {
  select: { label: "Select",  shortcut: "S", color: "#94a3b8", desc: "Click to select. Space+drag to pan.",    icon: <MousePointer size={16}/> },
  pan:    { label: "Pan",     shortcut: "P", color: "#64748b", desc: "Click and drag to pan the view.",       icon: <span style={{fontSize:16}}>✥</span> },
  line:   { label: "Linear",  shortcut: "L", color: "#38bdf8", desc: "Click start → click end to measure.",    icon: <Ruler size={16}/> },
  area:   { label: "Area",    shortcut: "A", color: "#a78bfa", desc: "Click corners. Double-click to close.",  icon: <Square size={16}/> },
  count:  { label: "Count",   shortcut: "C", color: "#fb923c", desc: "Click to place markers.",                icon: <Hash size={16}/> },
  volume: { label: "Volume",  shortcut: "V", color: "#34d399", desc: "Trace base. Double-click → enter depth.", icon: <Box size={16}/> },
};

const MEASURE_COLORS = ["#38bdf8","#a78bfa","#fb923c","#34d399","#f472b6","#facc15","#60a5fa","#f87171"];
let colorIdx = 0;
function nextColor() { return MEASURE_COLORS[colorIdx++ % MEASURE_COLORS.length]; }

function clamp(n: number, min: number, max: number) { return Math.min(max, Math.max(min, n)); }
function fmt2(n: number) { return Number.isFinite(n) ? n.toFixed(2) : "0.00"; }
function feetInches(totalFeet: number): string {
  if (!Number.isFinite(totalFeet)) return `0' 0"`;
  const sign = totalFeet < 0 ? "-" : "";
  const abs = Math.abs(totalFeet);
  let feet = Math.floor(abs);
  let inches = (abs - feet) * 12;
  // Round to nearest quarter inch
  inches = Math.round(inches * 4) / 4;
  if (inches >= 12) { inches -= 12; feet += 1; }
  const whole = Math.floor(inches);
  const frac = inches - whole;
  let fracStr = "";
  if (frac === 0.25) fracStr = " 1/4";
  else if (frac === 0.5) fracStr = " 1/2";
  else if (frac === 0.75) fracStr = " 3/4";
  return `${sign}${feet}' ${whole}${fracStr}"`;
}
function fmtLen(n: number, unit: string): string {
  return unit === "ft" ? feetInches(n) : `${fmt2(n)} ${unit}`;
}
function fmtMoney(n: number) { return new Intl.NumberFormat("en-US",{style:"currency",currency:"JMD",minimumFractionDigits:0}).format(n); }
function uid() { try { return crypto.randomUUID(); } catch { return `${Date.now()}-${Math.random().toString(16).slice(2)}`; } }
function dist(a: Point, b: Point) { return Math.sqrt((b.x-a.x)**2+(b.y-a.y)**2); }
function polyArea(pts: Point[]) {
  if (pts.length < 3) return 0;
  let a = 0;
  for (let i = 0; i < pts.length; i++) { const j = (i+1)%pts.length; a += pts[i].x*pts[j].y - pts[j].x*pts[i].y; }
  return Math.abs(a)/2;
}
function distToSeg(p: Point, a: Point, b: Point) {
  const A=p.x-a.x,B=p.y-a.y,C=b.x-a.x,D=b.y-a.y;
  const dot=A*C+B*D,len=C*C+D*D,t=len?clamp(dot/len,0,1):0;
  return Math.sqrt((p.x-a.x-t*C)**2+(p.y-a.y-t*D)**2);
}

// ─── Error Boundary ───────────────────────────────────────────────────────────
class ErrorBoundary extends React.Component<{children:React.ReactNode},{err:any}> {
  constructor(p:any){super(p);this.state={err:null};}
  static getDerivedStateFromError(e:any){return{err:e};}
  render(){
    if(this.state.err) return(
      <div className="min-h-screen bg-[#080b10] flex items-center justify-center">
        <div className="text-center gap-3 flex flex-col items-center">
          <AlertCircle size={32} className="text-red-400"/>
          <p className="text-slate-300 text-sm">Takeoff crashed.</p>
          <button onClick={()=>window.location.reload()} className="px-4 py-2 rounded-lg bg-blue-600 text-white text-xs">Reload</button>
        </div>
      </div>
    );
    return this.props.children as any;
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────
function TakeoffInner() {
  const { projectId: routeProjectId } = useParams<{ projectId?: string }>();
  const { currentProject } = useProjectContext();
  const nav = useNavigate();
  const projectId = routeProjectId || currentProject?.id;

  // Canvas & viewport
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
  const panRef = useRef<Point>({ x: 0, y: 0 });
  const zoomRef = useRef(1);
  const panningRef = useRef(false);
  const panStartRef = useRef<{ mouse: Point; pan: Point }>({ mouse: { x: 0, y: 0 }, pan: { x: 0, y: 0 } });
  const spaceRef = useRef(false);

  // PDF
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [pageNum, setPageNum] = useState(1);
  const [numPages, setNumPages] = useState(0);
  const [pdfFiles, setPdfFiles] = useState<PdfFile[]>([]);
  const [activePdfIdx, setActivePdfIdx] = useState(0);
  const [pageMeta, setPageMeta] = useState<Record<string, {label?: string; hidden?: boolean}>>({});
  const [pagesPanelCollapsed, setPagesPanelCollapsed] = useState(true);
  const [loadingPdf, setLoadingPdf] = useState(false);
  const [pdfPageSize, setPdfPageSize] = useState<Point>({ x: 0, y: 0 }); // native page size in pts
  const renderTaskRef = useRef<any>(null);
  const renderSeqRef = useRef(0);

  // Tools & drawing
  const [tool, setTool] = useState<ToolMode>("select");
  const toolRef = useRef<ToolMode>("select");
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const pageMeasurements = useMemo(() => measurements.filter(m => (m.pageNumber ?? 1) === pageNum), [measurements, pageNum]);
  const measurementsRef = useRef<Measurement[]>([]);
  const [selectedId, setSelectedId] = useState<string|null>(null);
  const selectedIdRef = useRef<string|null>(null);
  const [inProgress, setInProgress] = useState<Point[]>([]);
  const inProgressRef = useRef<Point[]>([]);
  const [hoverPt, setHoverPt] = useState<Point|null>(null);
  const hoverRef = useRef<Point|null>(null);

  // Calibration
  const [calibration, setCalibration] = useState<{p1:Point;p2:Point;feetPerPx:number}|null>(null);
  const calibRef = useRef<typeof calibration>(null);
  const [calibrating, setCalibrating] = useState(false);
  const calibratingRef = useRef(false);
  const [calibPts, setCalibPts] = useState<Point[]>([]);
  const calibPtsRef = useRef<Point[]>([]);
  const [showCalibModal, setShowCalibModal] = useState(false);
  const [calibFeet, setCalibFeet] = useState("10");
  const [calibInches, setCalibInches] = useState("0");
  const [calibFraction, setCalibFraction] = useState(0);
  const FRACTION_OPTIONS = [0, 1/16, 1/8, 3/16, 1/4, 5/16, 3/8, 7/16, 1/2, 9/16, 5/8, 11/16, 3/4, 13/16, 7/8, 15/16];
  const FRACTION_LABELS = ["0", "1/16", "1/8", "3/16", "1/4", "5/16", "3/8", "7/16", "1/2", "9/16", "5/8", "11/16", "3/4", "13/16", "7/8", "15/16"];

  // Depth modal for volume
  const [showDepthModal, setShowDepthModal] = useState(false);
  const [depthInches, setDepthInches] = useState("4");
  const pendingVolumeRef = useRef<Point[]>([]);

  // Library
  const [assemblies, setAssemblies] = useState<Assembly[]>([]);
  const [costItems, setCostItems] = useState<CostItem[]>([]);
  const [linkedAssemblyId, setLinkedAssemblyId] = useState<string>("");
  const [linkedItemId, setLinkedItemId] = useState<string>("");

  // Session
  const [sessionId, setSessionId] = useState<string|null>(null);
  const sessionIdRef = useRef<string|null>(null);
  const companyIdRef = useRef<string|null>(null);
  const [dbReady, setDbReady] = useState(false);
  const [error, setError] = useState<string|null>(null);
  const [rightTab, setRightTab] = useState<"templates"|"measurements"|"stats">("templates");
  const [searchLib, setSearchLib] = useState("");

  // Keep refs in sync
  useEffect(()=>{ zoomRef.current = zoom; },[zoom]);
  useEffect(()=>{ panRef.current = pan; },[pan]);
  useEffect(()=>{ toolRef.current = tool; },[tool]);
  useEffect(()=>{ measurementsRef.current = measurements; },[measurements]);
  useEffect(()=>{ selectedIdRef.current = selectedId; },[selectedId]);
  useEffect(()=>{ calibRef.current = calibration; },[calibration]);
  useEffect(()=>{ calibratingRef.current = calibrating; },[calibrating]);
  useEffect(()=>{ calibPtsRef.current = calibPts; },[calibPts]);
  useEffect(()=>{ inProgressRef.current = inProgress; },[inProgress]);
  useEffect(()=>{ hoverRef.current = hoverPt; },[hoverPt]);

  // ─── Coordinate helpers ──────────────────────────────────────────────────────
  // Convert screen coords to PDF-page coords
  function screenToPdf(sx: number, sy: number): Point {
    const c = containerRef.current;
    if (!c) return { x: 0, y: 0 };
    const rect = c.getBoundingClientRect();
    const cx = sx - rect.left;
    const cy = sy - rect.top;
    return {
      x: (cx - panRef.current.x) / zoomRef.current,
      y: (cy - panRef.current.y) / zoomRef.current,
    };
  }

  // Convert PDF-page coords to canvas draw coords (canvas is full container size, pan/zoom applied in draw)
  function pdfToCanvas(p: Point): Point {
    return {
      x: p.x * zoomRef.current + panRef.current.x,
      y: p.y * zoomRef.current + panRef.current.y,
    };
  }

  // ─── Main render loop ────────────────────────────────────────────────────────
  const rafRef = useRef<number|null>(null);
  const needsRender = useRef(true);

  function scheduleRender() { needsRender.current = true; }

  useEffect(() => {
    function loop() {
      rafRef.current = requestAnimationFrame(loop);
      if (!needsRender.current) return;
      needsRender.current = false;
      drawAll();
    }
    rafRef.current = requestAnimationFrame(loop);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, []);

  function drawAll() {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    // Size canvas to container
    const w = container.clientWidth;
    const h = container.clientHeight;
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, w, h);

    // Draw checkerboard bg
    const size = 24;
    for (let x = 0; x < w; x += size) {
      for (let y = 0; y < h; y += size) {
        ctx.fillStyle = ((Math.floor(x/size)+Math.floor(y/size))%2===0) ? "#0a0d14" : "#080b10";
        ctx.fillRect(x, y, size, size);
      }
    }

    const z = zoomRef.current;
    const px = panRef.current.x;
    const py = panRef.current.y;

    // Draw PDF page background (white rect)
    if (pdfPageSize.x > 0) {
      ctx.fillStyle = "#fff";
      ctx.shadowColor = "rgba(0,0,0,0.5)";
      ctx.shadowBlur = 20;
      ctx.fillRect(px, py, pdfPageSize.x * z, pdfPageSize.y * z);
      ctx.shadowBlur = 0;
    }

    // Draw measurements
    const ms = measurementsRef.current;
    ms.forEach(m => {
      if (m.points.length === 0) return;
      const col = m.color;
      const selected = m.id === selectedIdRef.current;

      ctx.save();
      if (selected) { ctx.shadowColor = col; ctx.shadowBlur = 12; }

      if (m.type === "line" && m.points.length >= 2) {
        const [a, b] = [pdfToCanvas(m.points[0]), pdfToCanvas(m.points[1])];
        ctx.strokeStyle = col; ctx.lineWidth = selected ? 3.5 : 2;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        // Endpoint dots
        [a, b].forEach(p => { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, Math.PI*2); ctx.fill(); });
        // Label
        const mx = (a.x+b.x)/2, my = (a.y+b.y)/2;
        const label = m.unit === "ft" ? feetInches(m.result) : `${fmt2(m.result)} ${m.unit}`;
        drawLabel(ctx, label, mx, my-14, col);
        if (m.linkedAssemblyName) drawLabel(ctx, `⚡ ${m.linkedAssemblyName}`, mx, my+4, "#a78bfa", true);

      } else if ((m.type === "area" || m.type === "volume") && m.points.length >= 3) {
        const pts = m.points.map(pdfToCanvas);
        ctx.strokeStyle = col; ctx.fillStyle = col + "22"; ctx.lineWidth = selected ? 2.5 : 1.5;
        ctx.beginPath(); pts.forEach((p,i) => { if(i===0) ctx.moveTo(p.x,p.y); else ctx.lineTo(p.x,p.y); }); ctx.closePath();
        ctx.fill(); ctx.stroke();
        // Centroid label
        const cx = pts.reduce((s,p)=>s+p.x,0)/pts.length;
        const cy = pts.reduce((s,p)=>s+p.y,0)/pts.length;
        drawLabel(ctx, m.unit === "ft" ? feetInches(m.result) : `${fmt2(m.result)} ${m.unit}`, cx, cy, col);
        if (m.linkedAssemblyName) drawLabel(ctx, `⚡ ${m.linkedAssemblyName}`, cx, cy+18, "#a78bfa", true);

      } else if (m.type === "count") {
        m.points.forEach((p, i) => {
          const cp = pdfToCanvas(p);
          ctx.fillStyle = col; ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.arc(cp.x, cp.y, 7, 0, Math.PI*2); ctx.fill(); ctx.stroke();
          ctx.fillStyle = "#fff"; ctx.font = "bold 9px system-ui"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
          ctx.fillText(String(i+1), cp.x, cp.y);
        });
      }
      ctx.restore();
    });

    // Draw in-progress
    const ip = inProgressRef.current;
    const hp = hoverRef.current;
    const t = toolRef.current;
    const tcol = TOOL_CFG[t].color;

    if (calibratingRef.current) {
      const cpts = calibPtsRef.current;
      cpts.forEach(p => {
        const cp = pdfToCanvas(p);
        ctx.save();
        ctx.fillStyle = "#ef4444"; ctx.strokeStyle = "#fff"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(cp.x, cp.y, 8, 0, Math.PI*2); ctx.fill(); ctx.stroke();
        ctx.restore();
      });
      if (cpts.length === 1 && hp) {
        const a = pdfToCanvas(cpts[0]), b = pdfToCanvas(hp);
        ctx.save(); ctx.strokeStyle="#ef4444"; ctx.lineWidth=2; ctx.setLineDash([8,4]);
        ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y); ctx.stroke(); ctx.restore();
      }
    }

    if (t === "line" && ip.length === 1 && hp) {
      const a = pdfToCanvas(ip[0]), b = pdfToCanvas(hp);
      ctx.save(); ctx.strokeStyle = tcol; ctx.lineWidth = 2; ctx.setLineDash([6,4]);
      ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y); ctx.stroke();
      ctx.fillStyle = tcol; ctx.beginPath(); ctx.arc(a.x,a.y,4,0,Math.PI*2); ctx.fill();
      const d = calibRef.current ? dist(ip[0], hp) * calibRef.current.feetPerPx : 0;
      if (d > 0) drawLabel(ctx, feetInches(d), (a.x+b.x)/2, (a.y+b.y)/2-12, tcol);
      ctx.restore();
    }

    if ((t === "area" || t === "volume") && ip.length > 0 && hp) {
      const allPts = [...ip, hp].map(pdfToCanvas);
      ctx.save(); ctx.strokeStyle = tcol; ctx.fillStyle = tcol+"18"; ctx.lineWidth = 1.5; ctx.setLineDash([6,4]);
      ctx.beginPath(); allPts.forEach((p,i)=>{ if(i===0)ctx.moveTo(p.x,p.y); else ctx.lineTo(p.x,p.y); }); ctx.closePath();
      ctx.fill(); ctx.stroke();
      ip.forEach(p => { const cp=pdfToCanvas(p); ctx.fillStyle=tcol; ctx.setLineDash([]); ctx.beginPath(); ctx.arc(cp.x,cp.y,4,0,Math.PI*2); ctx.fill(); });
      ctx.restore();
    }

    // Crosshair
    if (hp && t !== "select") {
      const cp = pdfToCanvas(hp);
      ctx.save(); ctx.strokeStyle = "#fff"; ctx.lineWidth = 1; ctx.globalAlpha = 0.3; ctx.setLineDash([4,4]);
      ctx.beginPath(); ctx.moveTo(cp.x-20,cp.y); ctx.lineTo(cp.x+20,cp.y); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cp.x,cp.y-20); ctx.lineTo(cp.x,cp.y+20); ctx.stroke();
      ctx.restore();
    }

    // Calibration line if set
    if (calibRef.current) {
      const a = pdfToCanvas(calibRef.current.p1), b = pdfToCanvas(calibRef.current.p2);
      ctx.save(); ctx.strokeStyle="#ef4444"; ctx.lineWidth=2; ctx.globalAlpha=0.5;
      ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y); ctx.stroke();
      [a,b].forEach(p=>{ ctx.fillStyle="#ef4444"; ctx.beginPath(); ctx.arc(p.x,p.y,5,0,Math.PI*2); ctx.fill(); });
      ctx.restore();
    }
  }

  function drawLabel(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string, small = false) {
    const font = small ? "bold 9px system-ui" : "bold 11px system-ui";
    ctx.font = font;
    ctx.textAlign = "center";
    const tw = ctx.measureText(text).width;
    const pad = 4, h = small ? 14 : 17;
    ctx.fillStyle = "rgba(10,13,20,0.88)";
    ctx.beginPath();
    roundRect(ctx, x-tw/2-pad, y-h+2, tw+pad*2, h, 4);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.textBaseline = "bottom";
    ctx.fillText(text, x, y+1);
  }

  function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
    ctx.moveTo(x+r,y); ctx.lineTo(x+w-r,y); ctx.arcTo(x+w,y,x+w,y+r,r);
    ctx.lineTo(x+w,y+h-r); ctx.arcTo(x+w,y+h,x+w-r,y+h,r);
    ctx.lineTo(x+r,y+h); ctx.arcTo(x,y+h,x,y+h-r,r);
    ctx.lineTo(x,y+r); ctx.arcTo(x,y,x+r,y,r); ctx.closePath();
  }

  // Schedule render when deps change
  useEffect(() => { scheduleRender(); }, [zoom, pan, measurements, selectedId, inProgress, hoverPt, calibration, calibrating, calibPts, pdfPageSize]);

  // ─── PDF rendering ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!pdfDoc) return;
    let cancelled = false;
    const seq = ++renderSeqRef.current;

    async function render() {
      try {
        if (renderTaskRef.current) { renderTaskRef.current.cancel(); renderTaskRef.current = null; }
        const page = await pdfDoc.getPage(pageNum);
        if (cancelled || seq !== renderSeqRef.current) return;
        const vp = page.getViewport({ scale: 1 });
        setPdfPageSize({ x: vp.width, y: vp.height });

        // Render to offscreen canvas, then draw onto main canvas in draw loop
        const offscreen = document.createElement("canvas");
        offscreen.width = vp.width;
        offscreen.height = vp.height;
        const octx = offscreen.getContext("2d")!;
        const rt = page.render({ canvasContext: octx, viewport: vp });
        renderTaskRef.current = rt;
        await rt.promise;
        if (cancelled || seq !== renderSeqRef.current) return;

        // Replace drawAll to include the PDF image
        const img = new Image();
        img.src = offscreen.toDataURL();
        img.onload = () => {
          if (cancelled || seq !== renderSeqRef.current) return;
          // Monkey-patch drawAll to draw PDF image
          pdfImageRef.current = img;
          scheduleRender();
        };
      } catch (e: any) {
        if (e?.name !== "RenderingCancelledException") console.error("PDF render error:", e);
      }
    }
    render();
    return () => { cancelled = true; if (renderTaskRef.current) { renderTaskRef.current.cancel(); renderTaskRef.current = null; } };
  }, [pdfDoc, pageNum]);

  const pdfImageRef = useRef<HTMLImageElement|null>(null);

  // Override drawAll to include PDF image
  const drawAllWithPdf = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const w = container.clientWidth, h = container.clientHeight;
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, w, h);

    // BG
    const size = 24;
    for (let x = 0; x < w; x += size) for (let y = 0; y < h; y += size) {
      ctx.fillStyle = ((Math.floor(x/size)+Math.floor(y/size))%2===0) ? "#0a0d14" : "#080b10";
      ctx.fillRect(x, y, size, size);
    }

    const z = zoomRef.current, px = panRef.current.x, py = panRef.current.y;

    // Page shadow + white bg
    if (pdfPageSize.x > 0) {
      ctx.save(); ctx.shadowColor="rgba(0,0,0,0.6)"; ctx.shadowBlur=24;
      ctx.fillStyle="#1a1d28"; ctx.fillRect(px+4, py+4, pdfPageSize.x*z, pdfPageSize.y*z);
      ctx.shadowBlur=0; ctx.fillStyle="#fff"; ctx.fillRect(px, py, pdfPageSize.x*z, pdfPageSize.y*z);
      ctx.restore();
    }

    // PDF image
    if (pdfImageRef.current && pdfPageSize.x > 0) {
      ctx.drawImage(pdfImageRef.current, px, py, pdfPageSize.x*z, pdfPageSize.y*z);
    }

    // Measurements
    const ms = measurementsRef.current;
    ms.forEach(m => {
      if (m.points.length === 0) return;
      const col = m.color;
      const selected = m.id === selectedIdRef.current;
      ctx.save();
      if (selected) { ctx.shadowColor = col; ctx.shadowBlur = 14; }

      if (m.type === "line" && m.points.length >= 2) {
        const [a, b] = [pdfToCanvas(m.points[0]), pdfToCanvas(m.points[1])];
        ctx.strokeStyle = col; ctx.lineWidth = selected ? 3.5 : 2.5;
        ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y); ctx.stroke();
        [a,b].forEach(p => { ctx.fillStyle=col; ctx.beginPath(); ctx.arc(p.x,p.y,5,0,Math.PI*2); ctx.fill(); ctx.fillStyle="#fff"; ctx.beginPath(); ctx.arc(p.x,p.y,2,0,Math.PI*2); ctx.fill(); });
                drawLabel(ctx, m.unit === "ft" ? feetInches(m.result) : `${fmt2(m.result)} ${m.unit}`, (a.x+b.x)/2, (a.y+b.y)/2-14, col);
        if (m.linkedAssemblyName) drawLabel(ctx, `⚡ ${m.linkedAssemblyName}`, (a.x+b.x)/2, (a.y+b.y)/2+4, "#a78bfa", true);
      } else if ((m.type==="area"||m.type==="volume") && m.points.length>=3) {
        const pts = m.points.map(pdfToCanvas);
        ctx.strokeStyle=col; ctx.fillStyle=col+"28"; ctx.lineWidth=selected?2.5:1.5;
        ctx.beginPath(); pts.forEach((p,i)=>{if(i===0)ctx.moveTo(p.x,p.y);else ctx.lineTo(p.x,p.y);}); ctx.closePath(); ctx.fill(); ctx.stroke();
        const cx=pts.reduce((s,p)=>s+p.x,0)/pts.length, cy=pts.reduce((s,p)=>s+p.y,0)/pts.length;
        drawLabel(ctx, m.unit === "ft" ? feetInches(m.result) : `${fmt2(m.result)} ${m.unit}`, cx, cy, col);
        if (m.linkedAssemblyName) drawLabel(ctx, `⚡ ${m.linkedAssemblyName}`, cx, cy+20, "#a78bfa", true);
      } else if (m.type==="count") {
        m.points.forEach((p,i)=>{
          const cp=pdfToCanvas(p);
          ctx.fillStyle=col; ctx.strokeStyle="#fff"; ctx.lineWidth=1.5;
          ctx.beginPath(); ctx.arc(cp.x,cp.y,8,0,Math.PI*2); ctx.fill(); ctx.stroke();
          ctx.fillStyle="#fff"; ctx.font="bold 9px system-ui"; ctx.textAlign="center"; ctx.textBaseline="middle";
          ctx.fillText(String(i+1),cp.x,cp.y);
        });
      }
      ctx.restore();
    });

    // In-progress + hover preview
    const ip = inProgressRef.current, hp = hoverRef.current, t = toolRef.current;
    const tcol = TOOL_CFG[t].color;

    if (calibratingRef.current) {
      calibPtsRef.current.forEach(p => {
        const cp=pdfToCanvas(p);
        ctx.save(); ctx.fillStyle="#ef4444"; ctx.strokeStyle="#fff"; ctx.lineWidth=2;
        ctx.beginPath(); ctx.arc(cp.x,cp.y,8,0,Math.PI*2); ctx.fill(); ctx.stroke();
        ctx.fillStyle="#fff"; ctx.font="bold 10px system-ui"; ctx.textAlign="center"; ctx.textBaseline="middle";
        ctx.fillText("×",cp.x,cp.y); ctx.restore();
      });
      if (calibPtsRef.current.length===1&&hp){
        const a=pdfToCanvas(calibPtsRef.current[0]),b=pdfToCanvas(hp);
        ctx.save(); ctx.strokeStyle="#ef4444"; ctx.lineWidth=2; ctx.setLineDash([8,4]);
        ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y); ctx.stroke(); ctx.restore();
      }
    }

    if (t==="line"&&ip.length===1&&hp){
      const a=pdfToCanvas(ip[0]),b=pdfToCanvas(hp);
      ctx.save(); ctx.strokeStyle=tcol; ctx.lineWidth=2; ctx.setLineDash([6,4]);
      ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y); ctx.stroke();
      ctx.fillStyle=tcol; ctx.setLineDash([]); ctx.beginPath(); ctx.arc(a.x,a.y,5,0,Math.PI*2); ctx.fill();
      if (calibRef.current){ const d=dist(ip[0],hp)*calibRef.current.feetPerPx; drawLabel(ctx,feetInches(d),(a.x+b.x)/2,(a.y+b.y)/2-14,tcol); }
      ctx.restore();
    }
    if ((t==="area"||t==="volume")&&ip.length>0&&hp){
      const allPts=[...ip,hp].map(pdfToCanvas);
      ctx.save(); ctx.strokeStyle=tcol; ctx.fillStyle=tcol+"18"; ctx.lineWidth=1.5; ctx.setLineDash([6,4]);
      ctx.beginPath(); allPts.forEach((p,i)=>{if(i===0)ctx.moveTo(p.x,p.y);else ctx.lineTo(p.x,p.y);}); ctx.closePath(); ctx.fill(); ctx.stroke();
      ip.forEach(p=>{const cp=pdfToCanvas(p);ctx.fillStyle=tcol;ctx.setLineDash([]);ctx.beginPath();ctx.arc(cp.x,cp.y,4,0,Math.PI*2);ctx.fill();});
      ctx.restore();
    }
    if (hp&&t!=="select"&&!calibratingRef.current){
      const cp=pdfToCanvas(hp);
      ctx.save(); ctx.strokeStyle="#fff"; ctx.lineWidth=1; ctx.globalAlpha=0.25; ctx.setLineDash([4,4]);
      ctx.beginPath(); ctx.moveTo(0,cp.y); ctx.lineTo(w,cp.y); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cp.x,0); ctx.lineTo(cp.x,h); ctx.stroke();
      ctx.restore();
    }
    if (calibRef.current){
      const a=pdfToCanvas(calibRef.current.p1),b=pdfToCanvas(calibRef.current.p2);
      ctx.save(); ctx.strokeStyle="#ef4444"; ctx.lineWidth=1.5; ctx.globalAlpha=0.4;
      ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y); ctx.stroke();
      ctx.restore();
    }
  }, [pdfPageSize]);

  // Use the PDF-aware draw function
  useEffect(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    function loop() {
      rafRef.current = requestAnimationFrame(loop);
      if (!needsRender.current) return;
      needsRender.current = false;
      drawAllWithPdf();
    }
    rafRef.current = requestAnimationFrame(loop);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [drawAllWithPdf]);

  // ─── Fit view ────────────────────────────────────────────────────────────────
  function fitView() {
    const c = containerRef.current;
    if (!c || pdfPageSize.x === 0) return;
    const cw = c.clientWidth, ch = c.clientHeight;
    const newZ = Math.min(cw / pdfPageSize.x, ch / pdfPageSize.y) * 0.92;
    const newPan = { x: (cw - pdfPageSize.x * newZ) / 2, y: (ch - pdfPageSize.y * newZ) / 2 };
    setZoom(newZ); setPan(newPan);
    zoomRef.current = newZ; panRef.current = newPan;
    scheduleRender();
  }
  useEffect(() => { if (pdfPageSize.x > 0) fitView(); }, [pdfPageSize]);

  // ─── DB init ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!projectId) return;
    async function init() {
      try {
        // Get company_id for this user (needed for takeoff_sessions inserts)
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: profile } = await supabase.from("user_profiles").select("company_id").eq("id", user.id).maybeSingle();
          if (profile?.company_id) companyIdRef.current = profile.company_id;
        }
        // Load session
        const { data: session } = await supabase.from("takeoff_sessions")
          .select("id,calibration,pdf_file,pdf_files,last_page_number,page_meta").eq("project_id", projectId)
          .order("created_at", { ascending: false }).limit(1).maybeSingle();

        let sid = session?.id;
        if (!sid) {
          const { data: ns } = await supabase.from("takeoff_sessions").insert({ project_id: projectId, company_id: companyIdRef.current, last_page_number: 1 }).select().maybeSingle();
          sid = ns?.id;
        }
        if (sid) { setSessionId(sid); sessionIdRef.current = sid; }

        // Restore calibration
        if (session?.calibration) {
          const c = session.calibration;
          setCalibration(c); calibRef.current = c;
        }

        // Restore page metadata (labels, hidden pages)
        if (session?.page_meta && typeof session.page_meta === "object") {
          setPageMeta(session.page_meta);
        }
        // Restore PDFs
        const files = Array.isArray(session?.pdf_files) ? session.pdf_files.filter((f:any)=>f?.storagePath) : (session?.pdf_file?.storagePath ? [session.pdf_file] : []);
        if (files.length > 0) {
          setPdfFiles(files);
          setLoadingPdf(true);
          try {
            const { data: sd } = await supabase.storage.from("project-files").createSignedUrl(files[0].storagePath, 3600*24*7);
            if (sd?.signedUrl) {
              const doc = await getDocument(sd.signedUrl).promise;
              setPdfDoc(doc); setNumPages(doc.numPages);
              setPageNum(session?.last_page_number || 1);
            }
          } catch (e) { console.warn("PDF restore failed:", e); }
          finally { setLoadingPdf(false); }
        }

        // Restore measurements
        if (sid) {
          const { data: mData } = await supabase.from("takeoff_measurements")
            .select("id,type,points,unit,result,meta,group_id,linked_item_id,linked_assembly_id,page_number")
            .eq("session_id", sid).order("created_at", { ascending: true });
          if (mData && mData.length > 0) {
            const ms: Measurement[] = mData.map((r:any) => ({
              id: r.id, type: r.type, points: r.points, result: Number(r.result), unit: r.unit,
              label: r.meta?.label || "", color: r.meta?.color || nextColor(),
              linkedAssemblyId: r.linked_assembly_id || r.meta?.linked_assembly_id,
              linkedAssemblyName: r.meta?.linked_assembly_name,
              linkedItemId: r.linked_item_id || r.meta?.linked_item_id,
              linkedItemName: r.meta?.linked_item_name,
              timestamp: r.meta?.timestamp || Date.now(),
              pageNumber: r.page_number || 1,
            }));
            setMeasurements(ms); measurementsRef.current = ms;
          }
        }

        // Load assemblies
        const { data: asmbs } = await supabase.from("assemblies").select("id,name,category,unit,is_active").eq("is_active",true).order("name");
        const { data: acomps } = await supabase.from("assembly_components").select("assembly_id");
        const compCounts: Record<string,number> = {};
        (acomps||[]).forEach((c:any) => { compCounts[c.assembly_id] = (compCounts[c.assembly_id]||0)+1; });
        setAssemblies((asmbs||[]).map((a:any) => ({ id:a.id, name:a.name, category:a.category, unit:a.unit, componentCount:compCounts[a.id]||0 })));

        // Load cost items
        const { data: items } = await supabase.from("cost_items").select("id,item_name,unit,category").eq("is_active",true).order("item_name");
        setCostItems(items||[]);

      } catch (e:any) { setError("Load failed: "+e?.message); }
      setDbReady(true);
    }
    init();
  }, [projectId]);

  // Auto-save measurements
  useEffect(() => {
    if (!sessionId || !dbReady) return;
    const tid = setTimeout(async () => {
      try {
        await supabase.from("takeoff_measurements").delete().eq("session_id", sessionIdRef.current);
        if (measurements.length > 0) {
          await supabase.from("takeoff_measurements").insert(measurements.map(m => ({
            session_id: sessionIdRef.current, company_id: companyIdRef.current, project_id: projectId,
            page_number: pageNum, tool_type: m.type, type: m.type, points: m.points, result: m.result, unit: m.unit,
            closed_shape: false, multiplier: 1, waste_percent: 0, sort_order: 0, is_deleted: false,
            capture_mode: "manual", status: "active",
            geometry_json: m.points, anchor_points_json: m.points,
            formula_inputs_json: {}, resolved_fields_json: {}, metadata: {}, client_visible: true,
            linked_item_id: m.linkedItemId || null, linked_assembly_id: m.linkedAssemblyId || null,
            meta: { label:m.label, color:m.color, timestamp:m.timestamp, linked_assembly_name:m.linkedAssemblyName, linked_item_name:m.linkedItemName },
          })));
        }
        await supabase.from("takeoff_sessions").update({ last_page_number: pageNum }).eq("id", sessionIdRef.current);
      } catch (e:any) { console.warn("Auto-save failed:", e?.message); }
    }, 800);
    return () => clearTimeout(tid);
  }, [measurements, sessionId, dbReady, pageNum]);


  // Auto-save page metadata (labels, hidden pages)
  useEffect(() => {
    if (!sessionIdRef.current || !dbReady) return;
    const tid = setTimeout(async () => {
      try {
        await supabase.from("takeoff_sessions").update({ page_meta: pageMeta }).eq("id", sessionIdRef.current);
      } catch (e:any) { console.warn("Page metadata auto-save failed:", e?.message); }
    }, 800);
    return () => clearTimeout(tid);
  }, [pageMeta, dbReady]);
  // ─── PDF upload ───────────────────────────────────────────────────────────────
  async function deletePdfFile(fileIdx: number) {
    const file = pdfFiles[fileIdx];
    if (!file) return;
    if (!window.confirm(`Delete "${file.name}"? This cannot be undone.`)) return;
    try {
      if (file.storagePath) await supabase.storage.from("project-files").remove([file.storagePath]);
      const newFiles = pdfFiles.filter((_, i) => i !== fileIdx);
      setPdfFiles(newFiles);
      if (sessionIdRef.current) {
        await supabase.from("takeoff_sessions").update({ pdf_files: newFiles, pdf_file: newFiles[0] || null }).eq("id", sessionIdRef.current);
      }
      if (fileIdx === activePdfIdx) {
        if (newFiles.length > 0) {
          setActivePdfIdx(0);
          const { data: sd } = newFiles[0].storagePath ? await supabase.storage.from("project-files").createSignedUrl(newFiles[0].storagePath, 3600*24*7) : { data: null };
          if (sd?.signedUrl) {
            const doc = await getDocument(sd.signedUrl).promise;
            setPdfDoc(doc); setNumPages(doc.numPages); setPageNum(1);
          }
        } else {
          setPdfDoc(null); setNumPages(0); setPageNum(1); setActivePdfIdx(0);
        }
      } else if (fileIdx < activePdfIdx) {
        setActivePdfIdx(i => i - 1);
      }
    } catch (e: any) {
      setError("Failed to delete file: " + e?.message);
    }
  }

  async function onPickFile(file: File | null) {
    if (!file) return;
    setLoadingPdf(true); setError(null);
    try {
      const url = URL.createObjectURL(file);
      const doc = await getDocument(url).promise;
      URL.revokeObjectURL(url);
      setPdfDoc(doc); setNumPages(doc.numPages); setPageNum(1); pdfImageRef.current = null;

      if (!projectId) { setLoadingPdf(false); return; }
      const fn = `${projectId}/${Date.now()}-${file.name}`;
      const { error: ue } = await supabase.storage.from("project-files").upload(fn, file, { cacheControl:"3600", upsert:false });
      if (ue) throw ue;
      const { data: sd } = await supabase.storage.from("project-files").createSignedUrl(fn, 3600*24*7);
      const info: PdfFile = { name: file.name, storagePath: fn, size: file.size };
      setPdfFiles(prev => [...prev, info]);
      const newIdx = pdfFiles.length;
      setActivePdfIdx(newIdx);
      let sid = sessionIdRef.current;
      if (!sid) {
        const { data: ns } = await supabase.from("takeoff_sessions").insert({ project_id:projectId, company_id: companyIdRef.current, pdf_file:info, pdf_files:[info], last_page_number:1 }).select().maybeSingle();
        if (ns) { sid = ns.id; setSessionId(ns.id); sessionIdRef.current = ns.id; }
      } else {
        const { data: es } = await supabase.from("takeoff_sessions").select("pdf_files").eq("id",sid).maybeSingle();
        const existing = Array.isArray(es?.pdf_files) ? es.pdf_files : [];
        await supabase.from("takeoff_sessions").update({ pdf_file:info, pdf_files:[...existing,info] }).eq("id",sid);
      }
    } catch (e:any) { setError("Upload failed: "+e?.message); }
    finally { setLoadingPdf(false); }
  }

  // ─── Canvas events ────────────────────────────────────────────────────────────
  function onMouseMove(e: React.MouseEvent) {
    const p = screenToPdf(e.clientX, e.clientY);
    setHoverPt(p); hoverRef.current = p;
    if (panningRef.current) {
      const dx = e.clientX - panStartRef.current.mouse.x;
      const dy = e.clientY - panStartRef.current.mouse.y;
      const np = { x: panStartRef.current.pan.x+dx, y: panStartRef.current.pan.y+dy };
      setPan(np); panRef.current = np;
    }
    scheduleRender();
  }

  function onMouseDown(e: React.MouseEvent) {
    const p = screenToPdf(e.clientX, e.clientY);

    // Middle mouse or Space+left = pan
    if (e.button === 1 || (e.button === 0 && spaceRef.current)) {
      e.preventDefault();
      panningRef.current = true;
      panStartRef.current = { mouse: { x: e.clientX, y: e.clientY }, pan: { ...panRef.current } };
      return;
    }
    if (e.button !== 0) return;

    // Calibration
    if (calibratingRef.current) {
      const np = [...calibPtsRef.current, p];
      setCalibPts(np); calibPtsRef.current = np;
      if (np.length >= 2) setShowCalibModal(true);
      scheduleRender();
      return;
    }

    if (toolRef.current === "select") {
      // Find closest measurement
      const hit = measurementsRef.current.find(m => {
        if (m.type==="line"&&m.points.length>=2) return distToSeg(p,m.points[0],m.points[1]) < 12/zoomRef.current;
        if (m.type==="count") return m.points.some(q=>dist(p,q)<10/zoomRef.current);
        return false;
      }) || null;
      setSelectedId(hit?.id||null); selectedIdRef.current = hit?.id||null;
      if (!hit) {
        panningRef.current = true;
        panStartRef.current = { mouse: { x: e.clientX, y: e.clientY }, pan: { ...panRef.current } };
      }
      scheduleRender();
      return;
    }

    const snap = snapToNearby(p);
    if (toolRef.current === "line") {
      const ip = inProgressRef.current;
      if (ip.length === 0) {
        setInProgress([snap]); inProgressRef.current = [snap];
      } else {
        // Complete line
        const calib = calibRef.current;
        const result = calib ? dist(ip[0], snap) * calib.feetPerPx : dist(ip[0], snap);
        const col = nextColor();
        const asmb = assemblies.find(a=>a.id===linkedAssemblyId);
        const item = costItems.find(i=>i.id===linkedItemId);
        const nm: Measurement = { id:uid(), type:"line", points:[ip[0],snap], result, unit:"ft", label:"", color:col, linkedAssemblyId:linkedAssemblyId||undefined, linkedAssemblyName:asmb?.name, linkedItemId:linkedItemId||undefined, linkedItemName:item?.item_name, timestamp:Date.now(), pageNumber:pageNum };
        const next = [...measurementsRef.current, nm];
        setMeasurements(next); measurementsRef.current = next;
        setInProgress([]); inProgressRef.current = [];
      }
    } else if (toolRef.current === "area" || toolRef.current === "volume") {
      setInProgress(prev => { const n=[...prev,snap]; inProgressRef.current=n; return n; });
    } else if (toolRef.current === "count") {
      const asmb = assemblies.find(a=>a.id===linkedAssemblyId);
      const existing = measurementsRef.current.find(m=>m.type==="count"&&m.linkedAssemblyId===linkedAssemblyId&&!m.id.includes("solo"));
      if (existing) {
        const next = measurementsRef.current.map(m=>m.id===existing.id?{...m,points:[...m.points,snap],result:m.points.length+1}:m);
        setMeasurements(next); measurementsRef.current = next;
      } else {
        const nm: Measurement = { id:uid(), type:"count", points:[snap], result:1, unit:"ea", label:"", color:nextColor(), linkedAssemblyId:linkedAssemblyId||undefined, linkedAssemblyName:asmb?.name, timestamp:Date.now(), pageNumber:pageNum };
        const next = [...measurementsRef.current, nm];
        setMeasurements(next); measurementsRef.current = next;
      }
    }
    scheduleRender();
  }

  function onMouseUp(e: React.MouseEvent) {
    if (panningRef.current) { panningRef.current = false; }
  }

  function onDblClick(e: React.MouseEvent) {
    const t = toolRef.current;
    const ip = inProgressRef.current;
    if ((t==="area"||t==="volume") && ip.length >= 3) {
      if (t==="volume") {
        pendingVolumeRef.current = [...ip];
        setShowDepthModal(true);
      } else {
        const calib = calibRef.current;
        const areaPx = polyArea(ip);
        const result = calib ? areaPx * calib.feetPerPx * calib.feetPerPx : areaPx;
        const asmb = assemblies.find(a=>a.id===linkedAssemblyId);
        const nm: Measurement = { id:uid(), type:"area", points:[...ip], result, unit:"ft²", label:"", color:nextColor(), linkedAssemblyId:linkedAssemblyId||undefined, linkedAssemblyName:asmb?.name, timestamp:Date.now(), pageNumber:pageNum };
        const next = [...measurementsRef.current, nm];
        setMeasurements(next); measurementsRef.current = next;
      }
      setInProgress([]); inProgressRef.current = [];
      scheduleRender();
    }
  }

  function confirmDepth() {
    const d = parseFloat(depthInches) || 0;
    if (d <= 0 || pendingVolumeRef.current.length < 3) return;
    const ip = pendingVolumeRef.current;
    const calib = calibRef.current;
    const areaPx = polyArea(ip);
    const areaFt2 = calib ? areaPx * calib.feetPerPx * calib.feetPerPx : areaPx;
    const depthFt = d / 12;
    const result = areaFt2 * depthFt;
    const asmb = assemblies.find(a=>a.id===linkedAssemblyId);
    const nm: Measurement = { id:uid(), type:"volume", points:[...ip], result, unit:"ft³", label:`${d}" deep`, color:nextColor(), linkedAssemblyId:linkedAssemblyId||undefined, linkedAssemblyName:asmb?.name, timestamp:Date.now(), pageNumber:pageNum };
    const next = [...measurementsRef.current, nm];
    setMeasurements(next); measurementsRef.current = next;
    setShowDepthModal(false); setDepthInches("4"); pendingVolumeRef.current = [];
    scheduleRender();
  }

  function onWheel(e: WheelEvent) {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.12 : 0.88;
    const c = containerRef.current; if (!c) return;
    const rect = c.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    setZoom(prev => {
      const nz = clamp(prev * factor, 0.05, 12);
      const np = { x: mx - (mx - panRef.current.x) * (nz/prev), y: my - (my - panRef.current.y) * (nz/prev) };
      setPan(np); panRef.current = np; zoomRef.current = nz;
      scheduleRender();
      return nz;
    });
  }


  // Attach wheel listener manually with passive:false so preventDefault actually blocks
  // the browser/trackpad native zoom (pinch-to-zoom maps to ctrl+wheel events)
  useEffect(() => {
    const c = containerRef.current;
    if (!c) return;
    const handler = (e: WheelEvent) => onWheel(e);
    c.addEventListener("wheel", handler, { passive: false });
    return () => c.removeEventListener("wheel", handler);
  }, []);
  function snapToNearby(p: Point): Point {
    const tol = 10 / zoomRef.current;
    for (const m of measurementsRef.current) for (const q of m.points) if (dist(p, q) < tol) return q;
    return p;
  }

  // Keyboard shortcuts
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.code === "Space") { spaceRef.current = true; e.preventDefault(); return; }
      const map: Record<string,ToolMode> = {s:"select",p:"pan",l:"line",a:"area",c:"count",v:"volume"};
      const k = e.key.toLowerCase();
      if (map[k]) { setTool(map[k]); toolRef.current = map[k]; setInProgress([]); inProgressRef.current = []; }
      if (e.key === "Escape") { setInProgress([]); inProgressRef.current = []; setCalibrating(false); calibratingRef.current = false; setCalibPts([]); calibPtsRef.current = []; scheduleRender(); }
      if ((e.key === "Delete" || e.key === "Backspace") && selectedIdRef.current) {
        const next = measurementsRef.current.filter(m=>m.id!==selectedIdRef.current);
        setMeasurements(next); measurementsRef.current = next; setSelectedId(null); selectedIdRef.current = null; scheduleRender();
      }
    }
    function onKeyUp(e: KeyboardEvent) { if (e.code === "Space") spaceRef.current = false; }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => { window.removeEventListener("keydown", onKeyDown); window.removeEventListener("keyup", onKeyUp); };
  }, []);

  // ─── Calibration confirm ──────────────────────────────────────────────────────
  function confirmCalibration() {
    const feetPart = parseFloat(calibFeet) || 0;
    const inchesPart = parseFloat(calibInches) || 0;
    const feet = feetPart + ((inchesPart + calibFraction) / 12);
    if (feet <= 0 || calibPts.length < 2) return;
    const px = dist(calibPts[0], calibPts[1]);
    const nc = { p1: calibPts[0], p2: calibPts[1], feetPerPx: feet / px };
    setCalibration(nc); calibRef.current = nc;
    setCalibrating(false); calibratingRef.current = false; setCalibPts([]); calibPtsRef.current = [];
    setShowCalibModal(false);
    if (sessionIdRef.current) { supabase.from("takeoff_sessions").update({ calibration: nc }).eq("id", sessionIdRef.current).then(({error}) => { if (error) console.error("CALIBRATION SAVE ERROR:", error); else console.log("CALIBRATION SAVE SUCCESS"); }); } else { console.warn("CALIBRATION NOT SAVED - no sessionId"); }
    scheduleRender();
  }

  // ─── Generate Milestones from Takeoff ────────────────────────────────────────
  const [generatingMilestones, setGeneratingMilestones] = useState(false);
  const [milestoneMsg, setMilestoneMsg] = useState<string|null>(null);

  async function generateMilestones() {
    const pid = routeProjectId || currentProject?.id;
    if(!pid || measurements.length===0) return;
    setGeneratingMilestones(true); setMilestoneMsg(null);
    try {
      // Get company_id
      const {data:{user}} = await supabase.auth.getUser();
      if(!user) throw new Error("Not authenticated");
      const {data:profile} = await supabase.from("user_profiles").select("company_id").eq("id",user.id).maybeSingle();
      const companyId = profile?.company_id;
      if(!companyId) throw new Error("No company");

      // Group measurements by assembly/category → milestones
      const groups: Record<string, {name:string; measurements: typeof measurements}> = {};
      measurements.forEach(m => {
        const key = m.linkedAssemblyName || "General Works";
        if(!groups[key]) groups[key] = {name:key, measurements:[]};
        groups[key].measurements.push(m);
      });

      let milestonesCreated = 0;
      let tasksCreated = 0;

      for(const [key, group] of Object.entries(groups)) {
        // Create milestone
        const totalCost = group.measurements.reduce((s,m)=>s+m.result,0);
        const {data:ms, error:me} = await supabase.from("project_milestones").insert({
          company_id: companyId,
          project_id: pid,
          milestone_name: group.name,
          status: "planned",
        }).select().maybeSingle();
        if(me) { console.error("Milestone insert error:", me); continue; }
        if(me) continue;
        milestonesCreated++;

        // Create tasks under milestone
        for(const m of group.measurements) {
          await supabase.from("project_tasks").insert({
            project_id: pid,
            milestone_id: ms?.id,
            task_name: m.linkedItemName || m.label || (m.type==="line"?`Line ${m.result.toFixed(2)} ${m.unit}`:m.type==="area"?`Area ${m.result.toFixed(2)} ${m.unit}`:m.type==="count"?`Count ${m.result} items`:`${m.type} ${m.result.toFixed(2)} ${m.unit}`),
            trade_type: "General Labour",
            quantity: m.result,
            unit: m.unit,
            rate_per_unit: 0,
            status: "planned",
          });
          tasksCreated++;
        }
      }
      setMilestoneMsg(`✅ Created ${milestonesCreated} milestones and ${tasksCreated} tasks`);
      setTimeout(()=>setMilestoneMsg(null), 4000);
    } catch(e:any) {
      setMilestoneMsg(`❌ ${e.message}`);
    } finally {
      setGeneratingMilestones(false);
    }
  }

  // ─── Export & Send to BOQ ─────────────────────────────────────────────────────
  function exportCSV() {
    const rows = measurements.map(m => [m.type, m.unit === "ft" ? feetInches(m.result) : fmt2(m.result), m.unit, m.linkedAssemblyName||"", m.linkedItemName||""].join(","));
    const csv = ["Type,Result,Unit,Assembly,Item",...rows].join("\n");
    const a = document.createElement("a"); a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv"})); a.download=`takeoff_${Date.now()}.csv`; a.click();
  }

  function sendToBOQ() {
    const groups: Record<string, {name:string;value:number;metric:string}> = {};
    measurements.forEach(m => {
      const key = m.linkedAssemblyName || m.linkedItemName || m.type;
      if (!groups[key]) groups[key] = { name:key, value:0, metric:m.unit };
      groups[key].value += m.result;
    });
    const data = Object.values(groups);
    const pid = routeProjectId || currentProject?.id;
    if (pid) nav(`/projects/${pid}/boq?groups=${encodeURIComponent(JSON.stringify(data))}`);
    else nav(`/boq?groups=${encodeURIComponent(JSON.stringify(data))}`);
  }

  // ─── Stats ─────────────────────────────────────────────────────────────────────
  const stats = useMemo(() => ({
    total: measurements.length,
    lines: measurements.filter(m=>m.type==="line").reduce((s,m)=>s+m.result, 0),
    areas: measurements.filter(m=>m.type==="area").reduce((s,m)=>s+m.result, 0),
    counts: measurements.filter(m=>m.type==="count").reduce((s,m)=>s+m.result, 0),
    volumes: measurements.filter(m=>m.type==="volume").reduce((s,m)=>s+m.result, 0),
  }), [measurements]);

  const filteredAssemblies = useMemo(() => {
    const q = searchLib.trim().toLowerCase();
    return !q ? assemblies : assemblies.filter(a => (a.name||"").toLowerCase().includes(q)||(a.category||"").toLowerCase().includes(q));
  }, [assemblies, searchLib]);

  const filteredItems = useMemo(() => {
    const q = searchLib.trim().toLowerCase();
    return !q ? costItems.slice(0,20) : costItems.filter(i=>(i.item_name||"").toLowerCase().includes(q)||(i.category||"").toLowerCase().includes(q)).slice(0,20);
  }, [costItems, searchLib]);

  const activeLinkedName = linkedAssemblyId
    ? assemblies.find(a=>a.id===linkedAssemblyId)?.name
    : linkedItemId ? costItems.find(i=>i.id===linkedItemId)?.item_name : null;

  const curTool = TOOL_CFG[tool];

  // ─── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-screen flex-col bg-[#080b10] text-slate-100 select-none overflow-hidden">

      {/* ── Top Bar ── */}
      <header className="flex-shrink-0 h-12 flex items-center gap-3 px-4 bg-[#0d1117] border-b border-white/[0.06] z-20">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-xl bg-gradient-to-br from-sky-500 to-blue-700 flex items-center justify-center flex-shrink-0">
            <Ruler size={14} className="text-white"/>
          </div>
          <span className="text-sm font-bold text-slate-100">Takeoff</span>
          {currentProject && <><span className="text-white/20 text-xs">·</span><span className="text-xs text-slate-500 truncate max-w-[140px]">{currentProject.name}</span></>}
        </div>

        {/* Page nav */}
        {pdfDoc && (
          <div className="flex items-center gap-1 bg-white/[0.04] border border-white/[0.07] rounded-lg px-1.5 py-1">
            <button onClick={()=>setPageNum(v=>Math.max(1,v-1))} disabled={pageNum<=1}
              className="p-0.5 rounded hover:bg-white/10 text-slate-600 hover:text-slate-300 disabled:opacity-30 transition"><ChevronLeft size={13}/></button>
            <span className="text-[10px] text-slate-500 px-1">{pageNum}/{numPages}</span>
            <button onClick={()=>setPageNum(v=>Math.min(numPages,v+1))} disabled={pageNum>=numPages}
              className="p-0.5 rounded hover:bg-white/10 text-slate-600 hover:text-slate-300 disabled:opacity-30 transition"><ChevronRight size={13}/></button>
          </div>
        )}

        <div className="flex-1"/>

        {/* Calibrate status */}
        <button onClick={()=>{setCalibrating(true);calibratingRef.current=true;setCalibPts([]);calibPtsRef.current=[];}}
          title={calibration ? `Calibrated: ${feetInches(dist(calibration.p1, calibration.p2) * calibration.feetPerPx)} (1px = ${calibration.feetPerPx.toFixed(5)} ft)` : "Click to set scale"}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[11px] font-medium transition ${calibrating?"bg-amber-500/15 border-amber-400/30 text-amber-300":calibration?"bg-emerald-500/10 border-emerald-500/20 text-emerald-300":"bg-white/[0.04] border-white/[0.08] text-slate-400 hover:text-slate-200"}`}>
          <Crosshair size={12}/>
          {calibrating ? "Click 2 points…" : calibration ? `Scale: ${feetInches(dist(calibration.p1, calibration.p2) * calibration.feetPerPx)}` : "Set Scale"}
        </button>
        {calibration && !calibrating && (
          <button onClick={()=>{
              setCalibration(null); calibRef.current = null;
              if (sessionIdRef.current) supabase.from("takeoff_sessions").update({ calibration: null }).eq("id", sessionIdRef.current);
            }}
            title="Clear calibration and start over"
            className="flex items-center justify-center w-6 h-6 rounded-lg border border-white/[0.08] text-slate-500 hover:text-red-400 hover:border-red-500/30 transition">
            <X size={11}/>
          </button>
        )}

        {/* Upload */}
        <label className="cursor-pointer flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.07] border border-white/[0.08] text-[11px] text-slate-300 font-medium transition">
          <Upload size={12}/> Upload PDF
          <input type="file" accept=".pdf" className="hidden" onChange={e=>onPickFile(e.target.files?.[0]||null)}/>
        </label>

        {/* Export */}
        <button onClick={exportCSV} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.07] border border-white/[0.08] text-[11px] text-slate-400 transition">
          <Download size={12}/> Export
        </button>

        {/* Send to BOQ */}
        <button onClick={sendToBOQ} disabled={measurements.length===0}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-[11px] font-bold disabled:opacity-40 transition shadow-sm">
          <Send size={12}/> Send to BOQ
        </button>
        <button onClick={generateMilestones} disabled={measurements.length===0||generatingMilestones}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold disabled:opacity-40 transition shadow-sm">
          <Layers size={12}/> {generatingMilestones?"Generating...":"→ Milestones"}
        </button>
        {milestoneMsg&&<div className="text-[10px] text-emerald-400 font-semibold">{milestoneMsg}</div>}
      </header>

      {/* ── Main layout ── */}
      <div className="flex flex-1 min-h-0">

        {/* ── Left Tool Bar ── */}
        <div className="flex-shrink-0 w-14 flex flex-col items-center py-3 gap-1 bg-[#0d1117] border-r border-white/[0.06] z-10">
          {(Object.entries(TOOL_CFG) as [ToolMode, typeof TOOL_CFG[ToolMode]][]).map(([key, cfg]) => (
            <button key={key} onClick={()=>{setTool(key);toolRef.current=key;setInProgress([]);inProgressRef.current=[];scheduleRender();}}
              title={`${cfg.label} (${cfg.shortcut})`}
              className={`w-10 h-10 rounded-xl flex flex-col items-center justify-center gap-0.5 border transition-all ${tool===key?"border-white/20 bg-white/10":"border-transparent hover:bg-white/[0.05] hover:border-white/[0.07]"}`}>
              <span style={{color:tool===key?cfg.color:"#475569"}}>{cfg.icon}</span>
              <span className={`text-[7px] font-bold uppercase tracking-wider ${tool===key?"text-slate-300":"text-slate-700"}`}>{cfg.label.slice(0,3)}</span>
            </button>
          ))}

          <div className="flex-1"/>

          {/* Zoom controls */}
          <button onClick={()=>{setZoom(v=>clamp(v*1.2,0.05,12));scheduleRender();}} className="w-10 h-10 rounded-xl flex items-center justify-center hover:bg-white/[0.05] text-slate-600 hover:text-slate-300 transition"><ZoomIn size={15}/></button>
          <button onClick={()=>{setZoom(v=>clamp(v*0.8,0.05,12));scheduleRender();}} className="w-10 h-10 rounded-xl flex items-center justify-center hover:bg-white/[0.05] text-slate-600 hover:text-slate-300 transition"><ZoomOut size={15}/></button>
          <button onClick={fitView} className="w-10 h-10 rounded-xl flex items-center justify-center hover:bg-white/[0.05] text-slate-600 hover:text-slate-300 transition" title="Fit view"><Maximize2 size={15}/></button>
        </div>


        {/* ── Pages Panel ── */}
        <div className={`flex-shrink-0 flex flex-col bg-[#0d1117] border-r border-white/[0.06] z-10 transition-all ${pagesPanelCollapsed ? "w-10" : "w-64"}`}>
          <button onClick={()=>setPagesPanelCollapsed(v=>!v)}
            className="flex items-center justify-center h-10 hover:bg-white/[0.05] text-slate-500 hover:text-slate-300 transition border-b border-white/[0.06]"
            title={pagesPanelCollapsed ? "Show pages" : "Hide pages"}>
            {pagesPanelCollapsed ? <ChevronRight size={14}/> : <ChevronLeft size={14}/>}
            {!pagesPanelCollapsed && <span className="text-[10px] font-bold uppercase tracking-wider ml-1.5">Pages</span>}
          </button>
          {!pagesPanelCollapsed && (
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {pdfFiles.length === 0 && (
                <div className="text-[10px] text-slate-700 text-center py-6 px-2">No PDF uploaded yet</div>
              )}
              {pdfFiles.map((file, fIdx) => (
                <div key={fIdx} className="mb-3">
                  <div className="flex items-center justify-between px-1.5 py-1 mb-1">
                    <span className="text-[10px] font-semibold text-slate-400 truncate flex-1" title={file.name}>{file.name}</span>
                    <button onClick={()=>deletePdfFile(fIdx)} title="Delete this PDF file"
                      className="p-0.5 rounded text-slate-700 hover:text-red-400 transition flex-shrink-0">
                      <Trash2 size={11}/>
                    </button>
                  </div>
                  {fIdx === activePdfIdx && numPages > 0 && Array.from({length: numPages}, (_, i) => i + 1).map(pn => {
                    const key = `${fIdx}-${pn}`;
                    const meta = pageMeta[key] || {};
                    const isActive = fIdx === activePdfIdx && pn === pageNum;
                    if (meta.hidden) {
                      return (
                        <div key={pn} className="flex items-center gap-1 px-1.5 py-1 rounded-lg opacity-40">
                          <span className="text-[10px] text-slate-600 flex-1 truncate">Page {pn} (hidden)</span>
                          <button onClick={()=>setPageMeta(prev=>({...prev, [key]: {...prev[key], hidden: false}}))}
                            title="Unhide page" className="p-0.5 rounded text-slate-600 hover:text-emerald-400 transition">
                            <Eye size={11}/>
                          </button>
                        </div>
                      );
                    }
                    return (
                      <div key={pn} className={`flex items-center gap-1 px-1.5 py-1 rounded-lg group transition ${isActive ? "bg-sky-500/15 border border-sky-500/30" : "hover:bg-white/[0.04]"}`}>
                        <button onClick={()=>{setActivePdfIdx(fIdx);setPageNum(pn);}}
                          className={`text-[11px] flex-1 text-left truncate ${isActive ? "text-sky-300 font-semibold" : "text-slate-400"}`}>
                          {meta.label || `Page ${pn}`}
                        </button>
                        <button onClick={()=>{
                            const newLabel = window.prompt("Label for this page:", meta.label || `Page ${pn}`);
                            if (newLabel !== null) setPageMeta(prev=>({...prev, [key]: {...prev[key], label: newLabel.trim() || undefined}}));
                          }}
                          title="Rename page" className="p-0.5 rounded text-slate-700 hover:text-sky-400 transition opacity-0 group-hover:opacity-100 flex-shrink-0">
                          <Edit2 size={10}/>
                        </button>
                        <button onClick={()=>setPageMeta(prev=>({...prev, [key]: {...prev[key], hidden: true}}))}
                          title="Hide page" className="p-0.5 rounded text-slate-700 hover:text-amber-400 transition opacity-0 group-hover:opacity-100 flex-shrink-0">
                          <EyeOff size={10}/>
                        </button>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </div>
        {/* ── Canvas Area ── */}
        <div className="flex-1 relative min-w-0 overflow-hidden bg-[#080b10]"
          ref={containerRef}
          style={{ cursor: panningRef.current ? "grabbing" : (spaceRef.current || tool==="pan") ? "grab" : tool==="select" ? "default" : "crosshair" }}
          onMouseMove={onMouseMove}
          onMouseDown={onMouseDown}
          onMouseUp={onMouseUp}
          onDoubleClick={onDblClick}

          onContextMenu={e=>e.preventDefault()}>

          <canvas ref={canvasRef} className="absolute inset-0"/>

          {/* Empty state */}
          {!pdfDoc && !loadingPdf && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 pointer-events-none">
              <div className="w-20 h-20 rounded-3xl border border-white/[0.07] bg-white/[0.02] flex items-center justify-center">
                <FileText size={36} className="text-slate-800"/>
              </div>
              <div className="text-center">
                <div className="text-base font-semibold text-slate-400 mb-1">No drawing loaded</div>
                <div className="text-xs text-slate-700">Upload a PDF plan to start measuring</div>
              </div>
              <div className="flex items-center gap-8 mt-2">
                {(Object.entries(TOOL_CFG) as [ToolMode, typeof TOOL_CFG[ToolMode]][]).filter(([k])=>k!=="select").map(([k,cfg])=>(
                  <div key={k} className="flex flex-col items-center gap-1.5">
                    <div className="w-9 h-9 rounded-xl border border-white/[0.06] bg-white/[0.03] flex items-center justify-center" style={{color:cfg.color}}>{cfg.icon}</div>
                    <span className="text-[9px] text-slate-700 uppercase tracking-wider">{cfg.label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Loading */}
          {loadingPdf && (
            <div className="absolute inset-0 flex items-center justify-center bg-[#080b10]/70 backdrop-blur-sm pointer-events-none">
              <div className="flex items-center gap-2.5 rounded-xl border border-white/[0.08] bg-[#0d1117] px-4 py-3 shadow-xl">
                <RefreshCw size={14} className="animate-spin text-sky-400"/>
                <span className="text-xs text-slate-400">Loading drawing…</span>
              </div>
            </div>
          )}

          {/* Calibration banner */}
          {calibrating && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2.5 rounded-xl border border-amber-500/25 bg-[#0d1117]/95 backdrop-blur px-4 py-2.5 shadow-xl pointer-events-auto">
              <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse flex-shrink-0"/>
              <span className="text-xs text-amber-300 font-medium">Click 2 known points on the drawing · <kbd className="bg-white/10 px-1 rounded text-[10px]">Esc</kbd> to cancel</span>
              <span className="text-xs text-amber-500 ml-1">{calibPts.length}/2 placed</span>
              <button onClick={()=>{setCalibrating(false);calibratingRef.current=false;setCalibPts([]);calibPtsRef.current=[];}} className="ml-1 text-slate-600 hover:text-slate-300"><X size={13}/></button>
            </div>
          )}

          {/* Tool hint */}
          {tool!=="select"&&!calibrating&&(
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 rounded-xl border border-white/[0.07] bg-[#0d1117]/90 backdrop-blur px-3.5 py-2 shadow-xl pointer-events-none">
              <span style={{color:curTool.color}}>{curTool.icon}</span>
              <span className="text-[11px] font-semibold text-slate-300">{curTool.label}</span>
              <span className="text-[10px] text-slate-600">— {curTool.desc}</span>
              {tool==="line"&&inProgress.length===1&&<span className="text-[10px] text-sky-400 ml-1">· Click endpoint to finish</span>}
              {(tool==="area"||tool==="volume")&&inProgress.length>0&&<span className="text-[10px] text-violet-400 ml-1">· {inProgress.length} pts · double-click to close</span>}
            </div>
          )}

          {/* Zoom indicator */}
          <div className="absolute bottom-4 left-4 z-10 rounded-lg border border-white/[0.07] bg-[#0d1117]/90 px-2.5 py-1 pointer-events-none">
            <span className="text-[10px] font-mono text-slate-600">{Math.round(zoom*100)}%</span>
          </div>

          {/* Error */}
          {error && (
            <div className="absolute top-4 right-4 z-20 flex items-center gap-2 rounded-xl border border-red-500/20 bg-[#0d1117]/95 px-3 py-2.5 shadow-xl max-w-72">
              <AlertCircle size={13} className="text-red-400 flex-shrink-0"/>
              <span className="text-[11px] text-red-300">{error}</span>
              <button onClick={()=>setError(null)} className="ml-auto text-slate-700 hover:text-slate-400"><X size={12}/></button>
            </div>
          )}
        </div>

        {/* ── Right Panel ── */}
        <div className="flex-shrink-0 w-72 flex flex-col bg-[#0d1117] border-l border-white/[0.06] z-10">

          {/* Tabs */}
          <div className="flex border-b border-white/[0.06]">
            {([["templates","Templates"],["measurements","Taken"],["stats","Summary"]] as const).map(([k,label])=>(
              <button key={k} onClick={()=>setRightTab(k)}
                className={`flex-1 py-2.5 text-[10px] font-bold uppercase tracking-widest border-b-2 transition-colors ${rightTab===k?"border-sky-500 text-sky-300":"border-transparent text-slate-700 hover:text-slate-500"}`}>
                {label}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto">

            {/* ── Templates Tab ── */}
            {rightTab==="templates"&&(
              <div className="p-3 space-y-3">
                {/* Search */}
                <div className="relative">
                  <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-600 pointer-events-none"/>
                  <input value={searchLib} onChange={e=>setSearchLib(e.target.value)}
                    placeholder="Search templates & items…"
                    className="w-full bg-white/[0.04] border border-white/[0.07] rounded-lg pl-7 pr-2 py-2 text-[11px] text-slate-300 placeholder:text-slate-700 outline-none focus:border-sky-500/40"/>
                </div>

                {/* Active link */}
                {activeLinkedName && (
                  <div className="flex items-center gap-2 rounded-lg bg-sky-500/10 border border-sky-500/20 px-3 py-2">
                    <div className="w-2 h-2 rounded-full bg-sky-400 flex-shrink-0 animate-pulse"/>
                    <span className="text-[11px] text-sky-300 font-semibold truncate flex-1">{activeLinkedName}</span>
                    <button onClick={()=>{setLinkedAssemblyId("");setLinkedItemId("");}} className="text-slate-600 hover:text-slate-400"><X size={11}/></button>
                  </div>
                )}

                {/* Instruction */}
                {!activeLinkedName && (
                  <div className="text-[10px] text-slate-700 bg-white/[0.02] border border-white/[0.05] rounded-lg px-3 py-2 leading-relaxed">
                    Select a template or item below, then draw on the plan. Each measurement will be linked to it automatically.
                  </div>
                )}

                {/* Assemblies */}
                {filteredAssemblies.length > 0 && (
                  <div>
                    <div className="flex items-center gap-1.5 px-1 mb-2">
                      <Wand2 size={10} className="text-purple-400"/>
                      <span className="text-[9px] font-bold uppercase tracking-widest text-slate-600">Assemblies (Templates)</span>
                    </div>
                    <div className="space-y-1">
                      {filteredAssemblies.map(a => {
                        const active = linkedAssemblyId === a.id;
                        return (
                          <button key={a.id} onClick={()=>{setLinkedAssemblyId(active?"":a.id);setLinkedItemId("");}}
                            className={`w-full text-left rounded-lg px-3 py-2.5 border transition-all flex items-center gap-2.5 ${active?"border-purple-500/30 bg-purple-500/10":"border-white/[0.05] bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/[0.09]"}`}>
                            <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${active?"bg-purple-500/20":"bg-white/[0.04]"}`}>
                              <Layers size={12} className={active?"text-purple-400":"text-slate-600"}/>
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className={`text-[11px] font-semibold truncate ${active?"text-purple-200":"text-slate-300"}`}>{a.name}</div>
                              <div className="text-[9px] text-slate-700">{a.category||"General"} · {a.componentCount} component{a.componentCount!==1?"s":""}{a.unit?` · ${a.unit}`:""}</div>
                            </div>
                            {active && <Check size={12} className="text-purple-400 flex-shrink-0"/>}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Items */}
                {filteredItems.length > 0 && (
                  <div>
                    <div className="flex items-center gap-1.5 px-1 mb-2 mt-1">
                      <Package size={10} className="text-blue-400"/>
                      <span className="text-[9px] font-bold uppercase tracking-widest text-slate-600">Rate Library Items</span>
                    </div>
                    <div className="space-y-1">
                      {filteredItems.map(i => {
                        const active = linkedItemId === i.id;
                        return (
                          <button key={i.id} onClick={()=>{setLinkedItemId(active?"":i.id);setLinkedAssemblyId("");}}
                            className={`w-full text-left rounded-lg px-3 py-2 border transition-all flex items-center gap-2 ${active?"border-blue-500/30 bg-blue-500/10":"border-white/[0.05] bg-white/[0.02] hover:bg-white/[0.04]"}`}>
                            <div className="flex-1 min-w-0">
                              <div className={`text-[11px] font-medium truncate ${active?"text-blue-200":"text-slate-400"}`}>{i.item_name}</div>
                              <div className="text-[9px] text-slate-700">{i.category||"—"}{i.unit?` · ${i.unit}`:""}</div>
                            </div>
                            {active && <Check size={11} className="text-blue-400 flex-shrink-0"/>}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {assemblies.length===0&&costItems.length===0&&(
                  <div className="text-[11px] text-slate-700 text-center py-6">No templates or items found.<br/>Build assemblies in the Assemblies page.</div>
                )}
              </div>
            )}

            {/* ── Measurements Tab ── */}
            {rightTab==="measurements"&&(
              <div className="p-3 space-y-2">
                {measurements.length===0?(
                  <div className="text-[11px] text-slate-700 text-center py-10">No measurements yet.<br/>Select a template and draw on the plan.</div>
                ):(
                  <>
                    {measurements.map(m=>(
                      <div key={m.id} onClick={()=>{setSelectedId(m.id===selectedId?null:m.id);selectedIdRef.current=m.id===selectedId?null:m.id;scheduleRender();}}
                        className={`rounded-lg border px-3 py-2.5 cursor-pointer transition-all flex items-center gap-2.5 ${m.id===selectedId?"border-sky-500/25 bg-sky-500/[0.07]":"border-white/[0.05] bg-white/[0.02] hover:bg-white/[0.04]"}`}>
                        <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{backgroundColor:m.color}}/>
                        <div className="flex-1 min-w-0">
                          <div className="text-[11px] font-semibold text-slate-200">{m.unit === "ft" ? feetInches(m.result) : fmt2(m.result)} <span className="text-slate-600 font-normal">{m.unit === "ft" ? "" : m.unit}</span></div>
                          {m.linkedAssemblyName&&<div className="text-[9px] text-purple-400 truncate">⚡ {m.linkedAssemblyName}</div>}
                          {m.linkedItemName&&!m.linkedAssemblyName&&<div className="text-[9px] text-blue-400 truncate">{m.linkedItemName}</div>}
                          <div className="text-[9px] text-slate-700 capitalize">{m.type}</div>
                        </div>
                        <button onClick={e=>{e.stopPropagation();const next=measurementsRef.current.filter(x=>x.id!==m.id);setMeasurements(next);measurementsRef.current=next;if(selectedId===m.id){setSelectedId(null);selectedIdRef.current=null;}scheduleRender();}}
                          className="p-1 rounded hover:bg-red-500/15 text-slate-700 hover:text-red-400 transition">
                          <X size={11}/>
                        </button>
                      </div>
                    ))}
                    <button onClick={()=>{setMeasurements([]);measurementsRef.current=[];setSelectedId(null);selectedIdRef.current=null;scheduleRender();}}
                      className="w-full py-2 rounded-lg border border-red-500/15 text-[10px] text-red-500/60 hover:text-red-400 hover:border-red-500/25 transition mt-2">
                      Clear All
                    </button>
                  </>
                )}
              </div>
            )}

            {/* ── Stats Tab ── */}
            {rightTab==="stats"&&(
              <div className="p-3 space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  {[
                    ["Total Items", measurements.length, "text-slate-200"],
                    ["Linear ft", fmt2(stats.lines), "text-sky-300"],
                    ["Area ft²", fmt2(stats.areas), "text-purple-300"],
                    ["Count", stats.counts, "text-amber-300"],
                    ["Volume ft³", fmt2(stats.volumes), "text-emerald-300"],
                    ["Scale", calibration ? "Set ✓" : "Not set", calibration?"text-emerald-400":"text-amber-400"],
                  ].map(([l,v,c])=>(
                    <div key={l as string} className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-3">
                      <div className="text-[9px] text-slate-700 uppercase tracking-widest mb-1">{l}</div>
                      <div className={`text-lg font-bold ${c}`}>{v}</div>
                    </div>
                  ))}
                </div>

                {/* Group by assembly */}
                {measurements.filter(m=>m.linkedAssemblyName).length > 0 && (
                  <div className="rounded-xl border border-white/[0.07] overflow-hidden">
                    <div className="px-3 py-2 bg-white/[0.02] border-b border-white/[0.05] text-[9px] font-bold uppercase tracking-widest text-slate-600">By Assembly</div>
                    {Object.entries(
                      measurements.filter(m=>m.linkedAssemblyName).reduce((acc:Record<string,number>, m) => {
                        const k = m.linkedAssemblyName!; acc[k] = (acc[k]||0) + m.result; return acc;
                      }, {})
                    ).map(([name, total]) => (
                      <div key={name} className="flex items-center justify-between px-3 py-2.5 border-b border-white/[0.04] last:border-0">
                        <div className="flex items-center gap-2"><Layers size={10} className="text-purple-400"/><span className="text-[11px] text-slate-300 truncate">{name}</span></div>
                        <span className="text-[11px] font-bold text-purple-300 flex-shrink-0 ml-2">{fmt2(total)}</span>
                      </div>
                    ))}
                  </div>
                )}

                <button onClick={sendToBOQ} disabled={measurements.length===0}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-bold disabled:opacity-40 transition shadow-sm">
                  <Send size={14}/> Send All to BOQ
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Calibration Modal ── */}
      {showCalibModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-2xl border border-white/[0.08] bg-[#0d1117] shadow-2xl p-5 space-y-4">
            <div>
              <div className="text-sm font-bold text-slate-100">Set Drawing Scale</div>
              <div className="text-[11px] text-slate-500 mt-0.5">What is the real-world distance between your 2 points?</div>
            </div>
            <div className="flex items-center gap-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-3 py-2">
              <Check size={11} className="text-emerald-400"/>
              <span className="text-[11px] text-emerald-300">2 points placed — enter the distance below</span>
            </div>
            <div>
              <label className="text-[11px] text-slate-500 block mb-1.5">Feet</label>
              <input type="number" value={calibFeet} onChange={e=>setCalibFeet(e.target.value)} autoFocus
                className="w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-sm text-slate-200 outline-none focus:border-sky-500/50"
                placeholder="10" onKeyDown={e=>{if(e.key==="Enter")confirmCalibration();}}/>
            </div>
            <div>
              <label className="text-[11px] text-slate-500 block mb-1.5">Inches</label>
              <input type="number" min="0" max="11" value={calibInches} onChange={e=>setCalibInches(e.target.value)}
                className="w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-sm text-slate-200 outline-none focus:border-sky-500/50"
                placeholder="0" onKeyDown={e=>{if(e.key==="Enter")confirmCalibration();}}/>
            </div>
            <div>
              <label className="text-[11px] text-slate-500 block mb-1.5">Fraction</label>
              <div className="grid grid-cols-4 gap-1.5">
                {FRACTION_OPTIONS.map((f, i) => (
                  <button key={i} type="button" onClick={()=>setCalibFraction(f)}
                    className={`py-1.5 rounded-lg border text-[11px] font-medium transition ${calibFraction===f?"bg-sky-600 border-sky-500 text-white":"bg-white/[0.04] border-white/[0.08] text-slate-400 hover:text-slate-200"}`}>
                    {FRACTION_LABELS[i]}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={()=>{setShowCalibModal(false);setCalibrating(false);calibratingRef.current=false;setCalibPts([]);calibPtsRef.current=[];}}
                className="flex-1 py-2 rounded-xl border border-white/[0.07] text-xs text-slate-500 hover:text-slate-300 transition">Cancel</button>
              <button onClick={confirmCalibration}
                className="flex-1 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold transition">Confirm Scale</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Volume Depth Modal ── */}
      {showDepthModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="w-full max-w-xs rounded-2xl border border-white/[0.08] bg-[#0d1117] shadow-2xl p-5 space-y-4">
            <div>
              <div className="text-sm font-bold text-slate-100">Volume Depth</div>
              <div className="text-[11px] text-slate-500 mt-0.5">Enter the depth of the slab or excavation</div>
            </div>
            <div>
              <label className="text-[11px] text-slate-500 block mb-1.5">Depth (inches)</label>
              <input type="number" value={depthInches} onChange={e=>setDepthInches(e.target.value)} autoFocus
                className="w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-sm text-slate-200 outline-none focus:border-emerald-500/50"
                placeholder="4" onKeyDown={e=>{if(e.key==="Enter")confirmDepth();}}/>
            </div>
            <div className="flex gap-2">
              <button onClick={()=>{setShowDepthModal(false);pendingVolumeRef.current=[];setInProgress([]);inProgressRef.current=[];}}
                className="flex-1 py-2 rounded-xl border border-white/[0.07] text-xs text-slate-500 hover:text-slate-300 transition">Cancel</button>
              <button onClick={confirmDepth}
                className="flex-1 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition">Confirm</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Missing import for Search icon used in the component
function Search({ size, className }: { size: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
    </svg>
  );
}

export default function TakeoffPage() {
  return <ErrorBoundary><TakeoffInner/></ErrorBoundary>;
}