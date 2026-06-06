// src/pages/TakeoffPage.tsx — Complete Modern Rebuild v3
// UI: Horizontal top toolbar, floating canvas controls, clean right panel
// Bugs fixed: all takeoff_sessions column errors eliminated
// All PDF/canvas/measurement/calibration logic preserved exactly

import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import workerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { supabase } from "../lib/supabase";
import { computeQuantity } from "../lib/calculatorEngine";
import { useProjectContext } from "../context/ProjectContext";
import type { Measurement } from "../features/takeoff/types/takeoff.types";
import {
  Upload, Plus, Ruler, Download, FileText, X, Check,
  MousePointer, Minus, ZoomIn, ZoomOut, ChevronLeft, ChevronRight,
  Maximize2, Trash2, Eye, EyeOff, Hash, Square, Box,
  AlertCircle, RefreshCw, Send, Layers, BarChart2,
  Settings, Crosshair, Target, Move, Pencil
} from "lucide-react";

GlobalWorkerOptions.workerSrc = workerSrc;

// ─── Types ────────────────────────────────────────────────────────────────────

type Point = { x: number; y: number };
type ToolMode = "select" | "line" | "area" | "count" | "volume";
type PanelTab = "tools" | "layers" | "stats" | "settings";

interface PdfFile {
  name: string; url: string; size: number; lastModified: number; storagePath?: string;
}
interface LinkedItem {
  id: string; name: string; item_name?: string; unit: string; calc_engine_json?: any; type: 'item' | 'assembly'; color?: string;
}
interface ItemQuantity {
  item_id: string; total_quantity: number; unit: string; source_measurements: string[]; item: LinkedItem;
}
type GroupType = {
  id: string; name: string; color: string; visible: boolean; sortOrder: number; locked: boolean; trade?: string;
};
type SavedCalibration = {
  p1: Point; p2: Point; realDistanceFeet: number; scaleFeetPerPixel: number; unit: "ft"; createdAt: number;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function clamp(n: number, min: number, max: number) { return Math.min(max, Math.max(min, n)); }
function cn(...parts: Array<string | false | null | undefined>) { return parts.filter(Boolean).join(" "); }
function debounce<T extends (...args: any[]) => any>(fn: T, wait: number) {
  let t: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => { clearTimeout(t); t = setTimeout(() => fn(...args), wait); };
}
function fmt(v: number) {
  if (!Number.isFinite(v)) return "0";
  if (Math.abs(v) >= 1000) return v.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return v.toFixed(2);
}
function fmtFtIn(totalFeet: number) {
  if (!isFinite(totalFeet) || totalFeet <= 0) return "";
  const ft = Math.floor(totalFeet);
  const inTot = (totalFeet - ft) * 12;
  let inches = Math.floor(inTot);
  let num = Math.round((inTot - inches) * 16);
  if (num === 16) { num = 0; inches += 1; }
  if (inches === 12) { inches = 0; return `${ft + 1}' 0"`; }
  return `${ft}' ${inches}"${num ? ` ${num}/16` : ""}`;
}
function toNum(val: any) { const n = Number(val); return isNaN(n) ? 0 : n; }

// Tool definitions
const TOOLS = [
  { key: "select" as ToolMode, label: "Select",  shortcut: "S", icon: <MousePointer size={14}/>, color: "#94a3b8", desc: "Click measurements to select. Drag to pan." },
  { key: "line"   as ToolMode, label: "Line",    shortcut: "L", icon: <Ruler size={14}/>,         color: "#38bdf8", desc: "Click two points to measure distance." },
  { key: "area"   as ToolMode, label: "Area",    shortcut: "A", icon: <Square size={14}/>,        color: "#a78bfa", desc: "Click corners. Double-click to finish." },
  { key: "count"  as ToolMode, label: "Count",   shortcut: "C", icon: <Hash size={14}/>,          color: "#fb923c", desc: "Click to place markers." },
  { key: "volume" as ToolMode, label: "Volume",  shortcut: "V", icon: <Box size={14}/>,           color: "#34d399", desc: "Draw base area, then enter depth." },
];

const GROUP_COLORS = ["#38bdf8","#a78bfa","#fb923c","#34d399","#f472b6","#facc15","#60a5fa","#f87171"];

// ─── Scale Modal ──────────────────────────────────────────────────────────────

function ScaleModal({ open, onClose, calibPointsCount, canConfirm, onOk, onCancel }: {
  open: boolean; onClose: () => void; calibPointsCount: number; canConfirm: boolean;
  onOk: (feet: number) => void; onCancel: () => void;
}) {
  const [feet, setFeet] = useState("10");
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#111318] shadow-2xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-slate-100">Set Drawing Scale</div>
            <div className="text-[11px] text-slate-500 mt-0.5">Enter real distance between your 2 points</div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 text-slate-500"><X size={15}/></button>
        </div>
        <div className={cn("flex items-center gap-2 rounded-lg px-3 py-2 text-xs border", calibPointsCount >= 2 ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-300" : "bg-amber-500/10 border-amber-500/20 text-amber-300")}>
          <div className={cn("w-2 h-2 rounded-full flex-shrink-0", calibPointsCount >= 2 ? "bg-emerald-400" : "bg-amber-400 animate-pulse")} />
          {calibPointsCount}/2 points placed{calibPointsCount >= 2 ? " — enter distance below" : " — click drawing to place"}
        </div>
        <div>
          <label className="text-[11px] text-slate-500 block mb-1.5">Real distance (feet)</label>
          <div className="flex gap-2">
            <input type="number" value={feet} onChange={e => setFeet(e.target.value)} className="flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200 outline-none focus:border-cyan-500/50" placeholder="10" />
            <span className="flex items-center text-xs text-slate-600 px-1">ft</span>
          </div>
        </div>
        <div className="flex gap-2 pt-1">
          <button onClick={onCancel} className="flex-1 py-2 rounded-xl text-xs text-slate-500 hover:text-slate-300 border border-white/[0.06] hover:bg-white/5 transition-colors">Cancel</button>
          <button onClick={() => onOk(parseFloat(feet) || 0)} disabled={!canConfirm} className={cn("flex-1 py-2 rounded-xl text-xs font-semibold transition-colors", canConfirm ? "bg-cyan-600 hover:bg-cyan-500 text-white" : "bg-white/5 text-slate-600 cursor-not-allowed")}>Confirm Scale</button>
        </div>
      </div>
    </div>
  );
}

// ─── Error Boundary ───────────────────────────────────────────────────────────

class TakeoffErrorBoundary extends React.Component<{ children: React.ReactNode }, { err: any }> {
  constructor(p: any) { super(p); this.state = { err: null }; }
  static getDerivedStateFromError(e: any) { return { err: e }; }
  componentDidCatch(e: any) { console.error("TAKEOFF CRASH:", e); }
  render() {
    if (this.state.err) return (
      <div className="min-h-screen bg-slate-50 dark:bg-[#080b10] flex items-center justify-center">
        <div className="text-center space-y-4">
          <AlertCircle className="w-10 h-10 text-red-400 mx-auto" />
          <p className="text-sm text-slate-300">Takeoff crashed. <button onClick={() => window.location.reload()} className="text-cyan-400 underline">Refresh</button></p>
        </div>
      </div>
    );
    return this.props.children as any;
  }
}

// ─── Measurement Canvas Layer ─────────────────────────────────────────────────

function MeasurementLayer({ measurements, zoom, panX, panY }: { measurements: Measurement[]; zoom: number; panX: number; panY: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const ctx = c.getContext("2d"); if (!ctx) return;
    measurements.forEach(m => {
      const col = m.color || "#38bdf8";
      if (m.type === "line" && m.points.length >= 2) {
        const [a, b] = m.points;
        ctx.save(); ctx.strokeStyle = col; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.moveTo(a.x*zoom, a.y*zoom); ctx.lineTo(b.x*zoom, b.y*zoom); ctx.stroke();
        const mx=(a.x+b.x)/2, my=(a.y+b.y)/2;
        const label = `${m.result.toFixed(2)} ${m.unit}`;
        ctx.font = "11px system-ui"; ctx.fillStyle="rgba(14,165,233,0.92)";
        const tw = ctx.measureText(label).width;
        ctx.fillRect(mx*zoom-tw/2-4, my*zoom-19, tw+8, 17);
        ctx.fillStyle="#fff"; ctx.fillText(label, mx*zoom-tw/2, my*zoom-5);
        ctx.restore();
      } else if ((m.type==="area"||m.type==="volume") && m.points.length>=3) {
        ctx.save(); ctx.strokeStyle=col; ctx.fillStyle=col+"28"; ctx.lineWidth=1.5;
        ctx.beginPath(); m.points.forEach((p,i)=>{ if(i===0) ctx.moveTo(p.x*zoom,p.y*zoom); else ctx.lineTo(p.x*zoom,p.y*zoom); }); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
      } else if (m.type==="count") {
        m.points.forEach(p=>{ ctx.save(); ctx.fillStyle=col; ctx.strokeStyle="#fff"; ctx.lineWidth=1.5; ctx.beginPath(); ctx.arc(p.x*zoom,p.y*zoom,5,0,Math.PI*2); ctx.fill(); ctx.stroke(); ctx.restore(); });
      }
    });
  }, [measurements, zoom, panX, panY]);
  useEffect(()=>{
    const c=ref.current; if(!c) return;
    c.style.transform=`translate(${panX}px, ${panY}px)`;
    c.style.transformOrigin="0 0";
  },[zoom,panX,panY]);
  return <canvas ref={ref} className="absolute inset-0 pointer-events-none" />;
}

// ─── Main Component ───────────────────────────────────────────────────────────

function TakeoffPageInner() {
  const { projectId: routeProjectId } = useParams<{ projectId?: string }>();
  const { currentProject: globalProject } = useProjectContext();

  const projectId = routeProjectId || globalProject?.id;

  // Core state
  const [pdf, setPdf] = useState<any>(null);
  const [numPages, setNumPages] = useState(0);
  const [pageNumber, setPageNumber] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [tool, setTool] = useState<ToolMode>("select");
  const [panelTab, setPanelTab] = useState<PanelTab>("tools");
  const [rightPanelOpen, setRightPanelOpen] = useState(true);

  // Measurement state
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [groups, setGroups] = useState<GroupType[]>([]);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [lineStart, setLineStart] = useState<Point | null>(null);
  const [areaPoints, setAreaPoints] = useState<Point[]>([]);
  const [volumePoints, setVolumePoints] = useState<Point[]>([]);
  const [showDepth, setShowDepth] = useState(false);
  const [depthIn, setDepthIn] = useState("4");
  const [hoverPt, setHoverPt] = useState<Point | null>(null);
  const [areaHoverPt, setAreaHoverPt] = useState<Point | null>(null);
  const [volHoverPt, setVolHoverPt] = useState<Point | null>(null);

  // Calibration
  const [calibration, setCalibration] = useState<SavedCalibration | null>(null);
  const [isCalibrating, setIsCalibrating] = useState(false);
  const [calibDraft, setCalibDraft] = useState<Point[]>([]);
  const [scaleModal, setScaleModal] = useState(false);

  // PDF files
  const [pdfFile, setPdfFile] = useState<PdfFile | null>(null);
  const [pdfFiles, setPdfFiles] = useState<PdfFile[]>([]);
  const [activePdfIdx, setActivePdfIdx] = useState(0);
  const [loadingPdf, setLoadingPdf] = useState(false);

  // Linking
  const [costItems, setCostItems] = useState<any[]>([]);
  const [assemblies, setAssemblies] = useState<any[]>([]);
  const [linkedItemId, setLinkedItemId] = useState<string>();
  const [linkedAssemblyId, setLinkedAssemblyId] = useState<string>();

  // Session
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [dbLoaded, setDbLoaded] = useState(false);
  const [currentProject, setCurrentProject] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [showGroupForm, setShowGroupForm] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");

  // Canvas width/height for fit
  const [canvasW, setCanvasW] = useState(0);
  const [canvasH, setCanvasH] = useState(0);

  // Refs
  const viewerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const hoverRef = useRef<HTMLCanvasElement>(null);
  const renderSeq = useRef(0);
  const renderTask = useRef<any>(null);
  const panStart = useRef({ x:0,y:0,px:0,py:0 });
  const isPanning = useRef(false);
  const hasDown = useRef(false);
  const overViewer = useRef(false);
  const rafId = useRef<number|null>(null);
  const hoverState = useRef<{pt:Point|null}>({pt:null});

  const linkedItem = linkedItemId ? costItems.find(i=>i.id===linkedItemId) : undefined;
  const linkedAssembly = linkedAssemblyId ? assemblies.find(a=>a.id===linkedAssemblyId) : undefined;
  const activeGroup = useMemo(()=>groups.find(g=>g.id===activeGroupId)||null,[groups,activeGroupId]);

  // ─── Coord helpers ──────────────────────────────────────────────────────────

  function getMetrics() {
    const c = canvasRef.current; if (!c) return null;
    const r = c.getBoundingClientRect();
    return { r, sx: c.width/r.width, sy: c.height/r.height };
  }
  function s2w(cx:number,cy:number):Point|null {
    // viewerRef contains the canvas which is CSS-translated by panX/panY
    const vr=viewerRef.current; if(!vr) return null;
    const rect=vr.getBoundingClientRect();
    // Remove pan offset, divide by zoom to get PDF page coordinates
    return {x:(cx-rect.left-panX)/zoom, y:(cy-rect.top-panY)/zoom};
  }
  function w2s(p:Point):Point|null {
    // PDF page coords → screen coords inside the viewer
    const vr=viewerRef.current; if(!vr) return null;
    return {x:p.x*zoom+panX, y:p.y*zoom+panY};
  }
  function evPt(e:React.PointerEvent):Point|null { return s2w(e.clientX,e.clientY); }

  // ─── PDF render ─────────────────────────────────────────────────────────────

  async function renderPdf() {
    if (!canvasRef.current || !viewerRef.current || !pdf) return;
    const seq = ++renderSeq.current;
    if (renderTask.current) {
      try { renderTask.current.cancel(); await renderTask.current.promise; } catch {}
      renderTask.current = null;
    }
    if (seq !== renderSeq.current) return;
    const page = await pdf.getPage(pageNumber);
    if (seq !== renderSeq.current) return;
    const vp0 = page.getViewport({scale:1});
    setCanvasW(vp0.width); setCanvasH(vp0.height);
    // Pan via CSS transform — keeps click coordinates correct
    const vp = page.getViewport({scale:zoom});
    const c = canvasRef.current; if(!c) return;
    c.width = vp.width; c.height = vp.height;
    c.style.transform = `translate(${panX}px, ${panY}px)`;
    c.style.transformOrigin = "0 0";
    const ctx = c.getContext("2d"); if(!ctx) return;
    ctx.clearRect(0,0,c.width,c.height);
    const rt = page.render({canvasContext:ctx,viewport:vp});
    renderTask.current = rt;
    try { await rt.promise; } catch(e:any) { if(e?.name==="RenderingCancelledException") return; throw e; } finally { renderTask.current=null; }
    if (seq !== renderSeq.current) return;
  }

  function renderOverlay() {
    const c=overlayRef.current, pc=canvasRef.current; if(!c||!pc) return;
    c.width=pc.width; c.height=pc.height;
    // Match canvas CSS transform
    c.style.transform=`translate(${panX}px, ${panY}px)`;
    c.style.transformOrigin="0 0";
    const ctx=c.getContext("2d"); if(!ctx) return;
    ctx.clearRect(0,0,c.width,c.height);

    // Selected highlight
    if (selectedId) {
      const m=measurements.find(x=>x.id===selectedId);
      if(m && m.type==="line" && m.points.length===2) {
        const [p0,p1]=m.points;
        ctx.save();ctx.strokeStyle=m.color||"#38bdf8";ctx.lineWidth=5;ctx.shadowColor=m.color||"#38bdf8";ctx.shadowBlur=10;
        ctx.beginPath();ctx.moveTo(p0.x*zoom,p0.y*zoom);ctx.lineTo(p1.x*zoom,p1.y*zoom);ctx.stroke();ctx.restore();
      }
    }

    // Calibration drawn line
    if (calibration) {
      const a=calibration.p1, b=calibration.p2;
      ctx.save();ctx.strokeStyle="#ef4444";ctx.fillStyle="#ef4444";ctx.lineWidth=2.5;ctx.shadowColor="#ef4444";ctx.shadowBlur=6;
      [a,b].forEach(p=>{ctx.beginPath();ctx.arc(p.x*zoom,p.y*zoom,7,0,Math.PI*2);ctx.fill();ctx.fillStyle="#fff";ctx.beginPath();ctx.arc(p.x*zoom,p.y*zoom,3,0,Math.PI*2);ctx.fill();ctx.fillStyle="#ef4444";});
      ctx.beginPath();ctx.moveTo(a.x*zoom,a.y*zoom);ctx.lineTo(b.x*zoom,b.y*zoom);ctx.stroke();ctx.restore();
    }

    // Area/vol preview
    if (tool==="area"&&areaPoints.length>0&&areaHoverPt) {
      ctx.save();ctx.strokeStyle="#a78bfa";ctx.fillStyle="#a78bfa18";ctx.lineWidth=1.5;ctx.setLineDash([6,4]);
      ctx.beginPath();areaPoints.forEach((p,i)=>{if(i===0)ctx.moveTo(p.x*zoom,p.y*zoom);else ctx.lineTo(p.x*zoom,p.y*zoom);});
      ctx.lineTo(areaHoverPt.x*zoom,areaHoverPt.y*zoom);ctx.closePath();ctx.fill();ctx.stroke();ctx.restore();
    }
    if (tool==="volume"&&volumePoints.length>0&&volHoverPt) {
      ctx.save();ctx.strokeStyle="#34d399";ctx.fillStyle="#34d39918";ctx.lineWidth=1.5;ctx.setLineDash([6,4]);
      ctx.beginPath();volumePoints.forEach((p,i)=>{if(i===0)ctx.moveTo(p.x*zoom,p.y*zoom);else ctx.lineTo(p.x*zoom,p.y*zoom);});
      ctx.lineTo(volHoverPt.x*zoom,volHoverPt.y*zoom);ctx.closePath();ctx.fill();ctx.stroke();ctx.restore();
    }
  }

  function renderHover() {
    const c=hoverRef.current, pc=canvasRef.current; if(!c||!pc) return;
    c.width=pc.width; c.height=pc.height;
    c.style.transform=`translate(${panX}px, ${panY}px)`;
    c.style.transformOrigin="0 0";
    const ctx=c.getContext("2d"); if(!ctx) return;
    ctx.clearRect(0,0,c.width,c.height);
    const {pt}=hoverState.current;

    // Crosshair
    if (pt && tool!=="select") {
      const sx=pt.x*zoom, sy=pt.y*zoom;
      ctx.save();ctx.strokeStyle="#fff";ctx.lineWidth=1;ctx.globalAlpha=0.4;
      const sz=16;
      ctx.beginPath();ctx.moveTo(sx-sz,sy);ctx.lineTo(sx+sz,sy);ctx.stroke();
      ctx.beginPath();ctx.moveTo(sx,sy-sz);ctx.lineTo(sx,sy+sz);ctx.stroke();
      ctx.restore();
    }

    // Calibration draft
    if (isCalibrating&&calibDraft.length>0) {
      ctx.save();ctx.fillStyle="#ef4444";ctx.strokeStyle="#ef4444";ctx.lineWidth=2.5;ctx.shadowColor="#ef4444";ctx.shadowBlur=5;
      calibDraft.forEach((p,i)=>{
        // w2s now gives coords relative to viewer; canvas is CSS-translated so use zoom only
        const cx=p.x*zoom, cy=p.y*zoom;
        ctx.beginPath();ctx.arc(cx,cy,7,0,Math.PI*2);ctx.fill();
        ctx.fillStyle="#fff";ctx.beginPath();ctx.arc(cx,cy,3,0,Math.PI*2);ctx.fill();
        ctx.fillStyle="#ef4444";
        ctx.font="bold 11px system-ui";ctx.fillText(`${i+1}`,cx-3.5,cy-11);
      });
      if (calibDraft.length===1&&pt){
        const ax=calibDraft[0].x*zoom, ay=calibDraft[0].y*zoom;
        const bx=pt.x*zoom, by=pt.y*zoom;
        ctx.strokeStyle="#ef4444";ctx.lineWidth=2;ctx.setLineDash([8,4]);ctx.beginPath();ctx.moveTo(ax,ay);ctx.lineTo(bx,by);ctx.stroke();ctx.setLineDash([]);
      }
      ctx.restore();
    }

    // Line preview
    if (tool==="line"&&lineStart&&pt){
      // coords are in PDF space; canvas is CSS-translated so just multiply by zoom
      const ax=lineStart.x*zoom,ay=lineStart.y*zoom,bx=pt.x*zoom,by=pt.y*zoom;
      ctx.save();ctx.strokeStyle="#38bdf8";ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(ax,ay);ctx.lineTo(bx,by);ctx.stroke();ctx.restore();
    }
  }

  function scheduleHover() {
    if(rafId.current) cancelAnimationFrame(rafId.current);
    rafId.current=requestAnimationFrame(()=>{renderHover();rafId.current=null;});
  }

  // ─── Measurement helpers ─────────────────────────────────────────────────────

  function distPx(a:Point,b:Point){return Math.sqrt((b.x-a.x)**2+(b.y-a.y)**2);}
  function distFt(a:Point,b:Point){return calibration?distPx(a,b)*calibration.scaleFeetPerPixel:0;}

  function polyArea(pts:Point[]){
    if(pts.length<3)return 0;
    let a=0;for(let i=0;i<pts.length;i++){const j=(i+1)%pts.length;a+=pts[i].x*pts[j].y-pts[j].x*pts[i].y;}
    return Math.abs(a)/2;
  }

  function nearestPt(p:Point,tol=15):Point|null{
    let nearest:Point|null=null,minD=tol;
    [...measurements.flatMap(m=>m.points),...calibDraft].forEach(q=>{const d=distPx(p,q);if(d<minD){minD=d;nearest=q;}});
    return nearest;
  }

  function addM(m:Omit<Measurement,"id">){
    const nm={...m,id:crypto.randomUUID(),timestamp:Date.now()};
    setMeasurements(prev=>[...prev,nm]);
    return nm;
  }
  function removeM(id:string){setMeasurements(prev=>prev.filter(m=>m.id!==id));if(selectedId===id)setSelectedId(null);}

  // ─── Session / DB ────────────────────────────────────────────────────────────

  async function loadProject() {
    if (!projectId) { setDbLoaded(true); return; }
    try {
      const {data:proj,error:pe}=await supabase.from("projects").select("id,name").eq("id",projectId).maybeSingle();
      if(pe)throw pe; if(!proj)throw new Error("Project not found");
      setCurrentProject(proj);
    } catch(e:any){ setError("Project lookup failed: "+(e?.message||String(e))); setDbLoaded(true); return; }

    try {
      // FIXED: only select columns that exist in takeoff_sessions
      const {data:session}=await supabase.from("takeoff_sessions")
        .select("id, scale, pdf_file, pdf_files, page_number")
        .eq("project_id",projectId).order("created_at",{ascending:false}).limit(1).maybeSingle();

      if(session){
        setSessionId(session.id);
        if(session.scale?.calibration) setCalibration(session.scale.calibration);
        setPageNumber(session.page_number||1);
        const files=(Array.isArray(session.pdf_files)&&session.pdf_files.length>0)?session.pdf_files.filter((f:any)=>f?.storagePath):session.pdf_file?.storagePath?[session.pdf_file]:[];
        setPdfFiles(files); setActivePdfIdx(0);
        if(files.length>0){
          const first=files[0]; setPdfFile(first); setLoadingPdf(true);
          try{
            const{data:sd}=await supabase.storage.from("project-files").createSignedUrl(first.storagePath,60*60*24*7);
            if(sd?.signedUrl){const d=await getDocument(sd.signedUrl).promise;setPdf(d);setNumPages(d.numPages);setPdfFile({...first,url:sd.signedUrl});}
          }catch(e){console.warn("Failed to restore PDF:",e);}finally{setLoadingPdf(false);}
        }
      } else {
        // FIXED: no measurements column
        const{data:ns}=await supabase.from("takeoff_sessions")
          .insert({project_id:projectId,page_number:1}).select().maybeSingle();
        if(ns) setSessionId(ns.id);
      }
    } catch(e:any){ console.error("Session sync failed:",e); }

    // Load measurements from takeoff_measurements table
    if (sessionId) await loadMeasurements();

    // Load library data
    try {
      const{data:items}=await supabase.from("cost_items").select("id,item_name,unit,category,is_active").eq("is_active",true).order("item_name");
      setCostItems(items||[]);
      const{data:asmbs}=await supabase.from("assemblies").select("id,name,output_unit,is_active").eq("is_active",true).order("name");
      setAssemblies(asmbs||[]);
    } catch(e){ console.warn("Failed to load library:",e); }

    setDbLoaded(true);
  }

  async function loadMeasurements() {
    if(!sessionId) return;
    try {
      const{data,error}=await supabase.from("takeoff_measurements")
        .select("id,session_id,group_id,type,points,unit,result,linked_item_id,linked_assembly_id,meta,sort_order,created_at")
        .eq("session_id",sessionId).order("created_at",{ascending:true});
      if(!error&&data&&data.length>0){
        setMeasurements(data.map(m=>({
          id:m.id,type:m.type as Measurement["type"],points:m.points,result:Number(m.result),unit:m.unit,
          label:m.meta?.label,groupId:m.group_id,color:m.meta?.color,timestamp:m.meta?.timestamp||new Date(m.created_at).getTime(),
          linked_item_id:m.linked_item_id||m.meta?.linked_item_id,linked_item_name:m.meta?.linked_item_name,
          linked_assembly_id:m.linked_assembly_id||m.meta?.linked_assembly_id,linked_assembly_name:m.meta?.linked_assembly_name,
          meta:m.meta,pixelsPerUnit:m.meta?.pixelsPerUnit,
        })));
      }
    } catch(e){ console.warn("Failed to load measurements:",e); }
  }

  // Auto-save measurements
  useEffect(()=>{
    if(!sessionId||!dbLoaded) return;
    const tid=setTimeout(async()=>{
      try{
        const records=measurements.map(m=>({
          session_id:sessionId,group_id:m.groupId||null,type:m.type,points:m.points,unit:m.unit,result:m.result,
          linked_item_id:m.linked_item_id||null,linked_assembly_id:m.linked_assembly_id||null,
          meta:{label:m.label,color:m.color,timestamp:m.timestamp,linked_item_name:m.linked_item_name,linked_assembly_name:m.linked_assembly_name,pixelsPerUnit:m.pixelsPerUnit,depthInches:m.meta?.depthInches},
          sort_order:m.timestamp,
        }));
        await supabase.from("takeoff_measurements").delete().eq("session_id",sessionId);
        if(records.length>0) await supabase.from("takeoff_measurements").insert(records);
        // FIXED: only update existing columns
        await supabase.from("takeoff_sessions").update({page_number:pageNumber}).eq("id",sessionId);
      }catch(e:any){console.error("Save failed:",e);}
    },600);
    return()=>clearTimeout(tid);
  },[measurements,sessionId,dbLoaded,pageNumber]);

  useEffect(()=>{loadProject();},[projectId]);

  useEffect(()=>{
    if(!dbLoaded||groups.length>0) return;
    const def=[
      {id:"g1",name:"General",   color:"#38bdf8",visible:true,sortOrder:0,locked:false},
      {id:"g2",name:"Electrical",color:"#fb923c",visible:true,sortOrder:1,locked:false},
      {id:"g3",name:"Plumbing",  color:"#34d399",visible:true,sortOrder:2,locked:false},
      {id:"g4",name:"Structure", color:"#a78bfa",visible:true,sortOrder:3,locked:false},
    ];
    setGroups(def); setActiveGroupId("g1");
  },[dbLoaded,groups.length]);

  // ─── PDF ops ─────────────────────────────────────────────────────────────────

  async function restorePdf(path:string){
    const{data,error}=await supabase.storage.from("project-files").createSignedUrl(path,3600);
    if(error)throw error;
    const url=data?.signedUrl; if(!url)throw new Error("No signed URL");
    const d=await getDocument(url).promise;
    setPdf(d); setPdfFile({name:pdfFile?.name||"PDF",url,size:pdfFile?.size||0,lastModified:Date.now(),storagePath:path});
  }

  async function onPickFile(file:File|null){
    setError(null); if(!file) return;
    setLoadingPdf(true);
    try{
      const url=URL.createObjectURL(file);
      const d=await getDocument(url).promise;
      setPdf(d); setNumPages(d.numPages); setPageNumber(1); setZoom(1); setPanX(0); setPanY(0);
      URL.revokeObjectURL(url);
    }catch(e:any){setError("Failed to load PDF: "+(e?.message||"")); setLoadingPdf(false); return;}
    try{
      const pid=projectId; if(!pid) throw new Error("No project ID");
      const fn=`${pid}/${Date.now()}-${file.name}`;
      const{error:ue}=await supabase.storage.from("project-files").upload(fn,file,{cacheControl:"3600",upsert:false});
      if(ue)throw ue;
      const{data:sd}=await supabase.storage.from("project-files").createSignedUrl(fn,60*60*24*7);
      if(!sd?.signedUrl)throw new Error("No signed URL");
      const info:PdfFile={name:file.name,url:sd.signedUrl,size:file.size,lastModified:file.lastModified,storagePath:fn};
      setPdfFile(info); setPdfFiles(prev=>[...prev,info]); setActivePdfIdx(prev=>prev+1);
      let sid=sessionId;
      if(!sid&&pid){
        // FIXED: no measurements column
        const{data:cs}=await supabase.from("takeoff_sessions").insert({project_id:pid,pdf_file:info,pdf_files:[info]}).select().maybeSingle();
        if(cs){sid=cs.id;setSessionId(cs.id);}
      } else if(sid){
        const{data:es}=await supabase.from("takeoff_sessions").select("pdf_files").eq("id",sid).maybeSingle();
        const existing=Array.isArray(es?.pdf_files)?es.pdf_files:[];
        await supabase.from("takeoff_sessions").update({pdf_file:info,pdf_files:[...existing,info]}).eq("id",sid);
      }
    }catch(e:any){setError("PDF loaded, session sync failed: "+(e?.message||""));}
    finally{setLoadingPdf(false);}
  }

  async function deletePdf(){
    setError(null);
    try{
      if(pdfFile?.storagePath) await supabase.storage.from("project-files").remove([pdfFile.storagePath]);
      const rem=pdfFiles.filter((_,i)=>i!==activePdfIdx);
      const ni=rem.length===0?0:Math.min(activePdfIdx,rem.length-1);
      if(sessionId) await supabase.from("takeoff_sessions").update({pdf_file:rem.length>0?rem[ni]:null,pdf_files:rem}).eq("id",sessionId);
      setPdfFiles(rem);
      if(rem.length>0){setActivePdfIdx(ni);setLoadingPdf(true);try{await restorePdf(rem[ni].storagePath!);}finally{setLoadingPdf(false);}}
      else{setPdf(null);setPdfFile(null);setActivePdfIdx(0);setNumPages(0);setPageNumber(1);setZoom(1);setPanX(0);setPanY(0);setCalibration(null);}
    }catch(e:any){setError("Failed to delete PDF: "+(e?.message||""));}
  }

  // ─── Pan/Zoom ────────────────────────────────────────────────────────────────

  function onWheel(e:React.WheelEvent){
    if(!overViewer.current) return;
    e.preventDefault();
    const factor=e.deltaY>0?0.9:1.1;
    const vr=viewerRef.current; if(!vr) return;
    const rect=vr.getBoundingClientRect();
    const mx=e.clientX-rect.left, my=e.clientY-rect.top;
    setZoom(prev=>{
      const nz=clamp(prev*factor,0.1,10);
      // Zoom toward cursor
      setPanX(px=>mx-(mx-px)*(nz/prev));
      setPanY(py=>my-(my-py)*(nz/prev));
      return nz;
    });
  }
  function startPan(e:React.PointerEvent){isPanning.current=true;panStart.current={x:e.clientX,y:e.clientY,px:panX,py:panY};}
  function movePan(e:React.PointerEvent){
    if(!isPanning.current)return;
    // Pan is in screen pixels (CSS transform), so no zoom division needed
    setPanX(panStart.current.px+(e.clientX-panStart.current.x));
    setPanY(panStart.current.py+(e.clientY-panStart.current.y));
  }
  function endPan(){isPanning.current=false;}
  function fitView(){
    if(!viewerRef.current||!canvasW||!canvasH)return;
    const w=viewerRef.current.clientWidth,h=viewerRef.current.clientHeight;
    const newZoom=Math.min(w/canvasW,h/canvasH)*0.95;
    setZoom(newZoom);
    // Center the canvas
    setPanX((w - canvasW*newZoom)/2);
    setPanY((h - canvasH*newZoom)/2);
  }

  // ─── Calibration ─────────────────────────────────────────────────────────────

  function startCalibration(){setIsCalibrating(true);setCalibDraft([]);setScaleModal(false);}
  function confirmCalibration(feet:number){
    if(calibDraft.length!==2)return;
    const[p1,p2]=calibDraft;
    const px=distPx(p1,p2);
    const nc:SavedCalibration={p1,p2,realDistanceFeet:feet,scaleFeetPerPixel:feet/px,unit:"ft",createdAt:Date.now()};
    setCalibration(nc); setIsCalibrating(false); setCalibDraft([]); setScaleModal(false);
    if(sessionId) supabase.from("takeoff_sessions").update({scale:{calibration:nc}}).eq("id",sessionId);
  }
  function clearCalibration(){setCalibration(null);setCalibDraft([]);setIsCalibrating(false);setScaleModal(false);if(sessionId)supabase.from("takeoff_sessions").update({scale:null}).eq("id",sessionId);}

  // ─── Canvas interaction ───────────────────────────────────────────────────────

  async function onPointerDown(e:React.PointerEvent){
    if(hasDown.current)return; hasDown.current=true;
    const p=evPt(e); if(!p){hasDown.current=false;return;}
    if(isCalibrating){
      setCalibDraft(prev=>{const np=[...prev,p];if(np.length>=2)setScaleModal(true);return np;});
      return;
    }
    if(tool==="select"){
      const clicked=measurements.find(m=>m.type==="line"&&m.points.length===2&&distToSeg(p,m.points[0],m.points[1])<12)||null;
      setSelectedId(clicked?.id||null);
      startPan(e); return;
    }
    const sp=nearestPt(p,15)||p;
    if(tool==="line"){
      if(!lineStart){setLineStart(sp);}
      else{
        addM({type:"line",points:[lineStart,sp],result:distFt(lineStart,sp),unit:linkedItem?.unit||"ft",color:linkedItem?"#38bdf8":activeGroup?.color||"#38bdf8",groupId:activeGroupId||undefined,timestamp:Date.now(),linked_item_id:linkedItemId,linked_assembly_id:linkedAssemblyId,linked_item_name:linkedItem?.item_name||linkedItem?.name,linked_assembly_name:linkedAssembly?.name});
        setLineStart(null);
      }
    } else if(tool==="area"){setAreaPoints(prev=>[...prev,sp]);}
    else if(tool==="count"){addM({type:"count",points:[sp],result:1,unit:linkedItem?.unit||"ea",color:activeGroup?.color||"#fb923c",groupId:activeGroupId||undefined,timestamp:Date.now(),linked_item_id:linkedItemId});}
    else if(tool==="volume"){setVolumePoints(prev=>[...prev,sp]);}
  }

  function onPointerMove(e:React.PointerEvent){
    const p=evPt(e); if(!p)return;
    hoverState.current={pt:p};
    if(tool==="area")setAreaHoverPt(p);
    if(tool==="volume")setVolHoverPt(p);
    if(tool==="line"&&lineStart)setHoverPt(p);
    if(isPanning.current)movePan(e);
    scheduleHover();
  }
  function onPointerUp(){hasDown.current=false;endPan();}

  async function onDblClick(e:React.PointerEvent){
    if(tool==="area"&&areaPoints.length>=3){
      addM({type:"area",points:[...areaPoints],result:polyArea(areaPoints)*(calibration?calibration.scaleFeetPerPixel**2:1),unit:linkedItem?.unit||"ft²",color:activeGroup?.color||"#a78bfa",groupId:activeGroupId||undefined,timestamp:Date.now(),linked_item_id:linkedItemId});
      setAreaPoints([]);
    }
    if(tool==="volume"&&volumePoints.length>=3) setShowDepth(true);
  }

  function confirmDepth(){
    const d=toNum(depthIn); if(volumePoints.length<3||!d)return;
    addM({type:"volume",points:[...volumePoints],result:polyArea(volumePoints)*(d/12)*(calibration?calibration.scaleFeetPerPixel**2:1),unit:"ft³",color:activeGroup?.color||"#34d399",groupId:activeGroupId||undefined,timestamp:Date.now(),linked_item_id:linkedItemId,label:`Vol (${d}" deep)`});
    setVolumePoints([]); setShowDepth(false); setDepthIn("4");
  }

  function distToSeg(p:Point,a:Point,b:Point):number{
    const A=p.x-a.x,B=p.y-a.y,C=b.x-a.x,D=b.y-a.y;
    const dot=A*C+B*D,len=C*C+D*D;
    const t=len!==0?Math.max(0,Math.min(1,dot/len)):0;
    return Math.sqrt((p.x-(a.x+t*C))**2+(p.y-(a.y+t*D))**2);
  }

  function exportCSV(){
    const rows=measurements.map(m=>[m.type,m.label||"",fmt(m.result),m.unit||"",groups.find(g=>g.id===m.groupId)?.name||""].join(","));
    const csv=["Type,Label,Result,Unit,Group",...rows].join("\n");
    const a=document.createElement("a"); a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv"})); a.download=`takeoff_${Date.now()}.csv`; a.click();
  }

  // ─── Render effects ───────────────────────────────────────────────────────────

  useEffect(()=>{
    let cancelled=false;
    (async()=>{try{if(!cancelled)await renderPdf();}catch(e:any){if(!cancelled&&e?.name!=="RenderingCancelledException")setError("Render failed: "+(e?.message||""));}})();
    return()=>{cancelled=true;if(renderTask.current){renderTask.current.cancel();renderTask.current=null;}};
  },[pdf,pageNumber,zoom,panX,panY]);

  useEffect(()=>{ renderOverlay(); },[calibDraft.length,tool,lineStart?.x,areaPoints.length,volumePoints.length,zoom,panX,panY,selectedId,measurements,calibration,areaHoverPt,volHoverPt]);
  useEffect(()=>{ scheduleHover(); },[hoverPt?.x,hoverPt?.y,calibDraft.length,isCalibrating]);
  useEffect(()=>{ return()=>{ if(rafId.current)cancelAnimationFrame(rafId.current); if(renderTask.current)renderTask.current.cancel(); }; },[]);

  // ─── Derived ─────────────────────────────────────────────────────────────────

  const counts = useMemo(()=>({
    total:measurements.length,
    lines:measurements.filter(m=>m.type==="line").length,
    areas:measurements.filter(m=>m.type==="area").length,
    counts:measurements.filter(m=>m.type==="count").length,
    volumes:measurements.filter(m=>m.type==="volume").length,
  }),[measurements]);

  const visibleM = useMemo(()=>{
    const vis=new Set(groups.filter(g=>g.visible).map(g=>g.id));
    return measurements.filter(m=>!m.groupId||vis.has(m.groupId));
  },[measurements,groups]);

  const activeTool = TOOLS.find(t=>t.key===tool)!;

  // ─── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-screen flex-col bg-[#080b10] text-slate-100 select-none">

      <ScaleModal open={scaleModal} onClose={()=>setScaleModal(false)} calibPointsCount={calibDraft.length} canConfirm={calibDraft.length>=2}
        onOk={confirmCalibration} onCancel={()=>{setIsCalibrating(false);setCalibDraft([]);setScaleModal(false);}} />

      {/* ── Top Toolbar ── */}
      <header className="flex-shrink-0 flex items-center gap-3 px-4 h-12 border-b border-white/[0.06] bg-[#0c0f17]/95 backdrop-blur-md z-20">
        {/* Identity */}
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-6 h-6 rounded-md bg-gradient-to-br from-sky-500 to-blue-700 flex items-center justify-center flex-shrink-0">
            <Ruler size={13} className="text-white" />
          </div>
          <span className="text-sm font-semibold text-slate-100 flex-shrink-0">Takeoff</span>
          {currentProject && <><span className="text-white/20">·</span><span className="text-xs text-slate-500 truncate max-w-[160px]">{currentProject.name}</span></>}
        </div>

        <div className="flex-1" />

        {/* Tool selector — compact pills in toolbar */}
        <div className="flex items-center gap-0.5 bg-white/[0.04] border border-white/[0.07] rounded-lg p-0.5">
          {TOOLS.map(t=>(
            <button key={t.key} onClick={()=>setTool(t.key)} title={`${t.label} (${t.shortcut})`}
              className={cn("flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all", tool===t.key?"bg-white/10 text-slate-100":"text-slate-600 hover:text-slate-400")}>
              <span style={{color:tool===t.key?t.color:undefined}}>{t.icon}</span>
              <span className="hidden md:inline">{t.label}</span>
            </button>
          ))}
        </div>

        <div className="w-px h-5 bg-white/10" />

        {/* File ops */}
        <label className="cursor-pointer flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/[0.05] hover:bg-white/[0.09] border border-white/[0.07] text-[11px] font-medium text-slate-300 transition-colors">
          <Upload size={13}/> Upload
          <input type="file" accept=".pdf" className="hidden" onChange={e=>onPickFile(e.target.files?.[0]||null)} />
        </label>

        <label className="cursor-pointer flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/20 text-[11px] font-medium text-sky-300 transition-colors">
          <Plus size={13}/> Add
          <input type="file" accept=".pdf" className="hidden" onChange={e=>onPickFile(e.target.files?.[0]||null)} />
        </label>

        {pdfFiles.length>1&&(
          <select value={activePdfIdx} onChange={e=>{ const i=Number(e.target.value);setActivePdfIdx(i);setLoadingPdf(true);restorePdf(pdfFiles[i].storagePath!).finally(()=>setLoadingPdf(false)); }}
            className="bg-white/[0.05] border border-white/[0.08] rounded-lg px-2 py-1 text-[11px] text-slate-300 outline-none focus:border-sky-500/50">
            {pdfFiles.map((f,i)=><option key={i} value={i}>Drawing {i+1}</option>)}
          </select>
        )}

        {pdfFile&&<button onClick={deletePdf} className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-[11px] text-red-300 transition-colors"><Trash2 size={12}/></button>}

        <div className="w-px h-5 bg-white/10" />

        {/* Calibrate */}
        <button onClick={startCalibration}
          className={cn("flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[11px] font-medium transition-colors",
            isCalibrating?"bg-amber-500/15 border-amber-500/30 text-amber-300":
            calibration?"bg-emerald-500/10 border-emerald-500/20 text-emerald-300":
            "bg-white/[0.05] border-white/[0.07] text-slate-300 hover:bg-white/[0.09]")}>
          <Crosshair size={13}/> {isCalibrating?"Calibrating…":calibration?fmtFtIn(calibration.realDistanceFeet)+" ref":"Calibrate"}
        </button>
        {calibration&&<button onClick={clearCalibration} className="p-1.5 rounded-lg hover:bg-white/10 text-slate-700 hover:text-slate-400 transition-colors"><X size={13}/></button>}

        <button onClick={exportCSV} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.07] text-[11px] text-slate-400 transition-colors">
          <Download size={13}/> Export
        </button>

        {/* Toggle panel */}
        <button onClick={()=>setRightPanelOpen(v=>!v)} className="p-1.5 rounded-lg hover:bg-white/10 text-slate-600 hover:text-slate-300 transition-colors" title="Toggle panel">
          <Layers size={15}/>
        </button>
      </header>

      {/* ── Body ── */}
      <div className="flex min-h-0 flex-1">

        {/* ── PDF Canvas Area ── */}
        <div className="relative flex-1 min-w-0 bg-[#060810] overflow-hidden"
          ref={viewerRef}
          onPointerEnter={()=>{overViewer.current=true;}}
          onPointerLeave={()=>{overViewer.current=false;}}
          onWheel={onWheel}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        >
          {/* Floating zoom + page controls — bottom left */}
          <div className="absolute bottom-4 left-4 z-20 flex flex-col gap-2">
            <div className="flex items-center gap-1 rounded-xl border border-white/[0.08] bg-[#0c0f17]/95 px-2 py-1.5 backdrop-blur shadow-xl">
              <button onClick={()=>setZoom(v=>clamp(v*0.8,0.1,10))} className="p-1 rounded hover:bg-white/10 text-slate-500 hover:text-slate-300 transition-colors"><ZoomOut size={14}/></button>
              <span className="min-w-[38px] text-center text-[10px] font-mono text-slate-500">{Math.round(zoom*100)}%</span>
              <button onClick={()=>setZoom(v=>clamp(v*1.2,0.1,10))} className="p-1 rounded hover:bg-white/10 text-slate-500 hover:text-slate-300 transition-colors"><ZoomIn size={14}/></button>
              <div className="w-px h-3.5 bg-white/10 mx-0.5"/>
              <button onClick={fitView} className="p-1 rounded hover:bg-white/10 text-slate-500 hover:text-slate-300 transition-colors" title="Fit"><Maximize2 size={14}/></button>
            </div>
            {pdf&&(
              <div className="flex items-center gap-1 rounded-xl border border-white/[0.08] bg-[#0c0f17]/95 px-2 py-1.5 backdrop-blur shadow-xl">
                <button onClick={()=>{if(renderTask.current){renderTask.current.cancel();renderTask.current=null;}setPageNumber(v=>Math.max(1,v-1));}} disabled={!pdf||pageNumber<=1} className="p-1 rounded hover:bg-white/10 text-slate-500 hover:text-slate-300 disabled:opacity-30 transition-colors"><ChevronLeft size={14}/></button>
                <span className="min-w-[44px] text-center text-[10px] text-slate-500">{pageNumber}/{numPages}</span>
                <button onClick={()=>{if(renderTask.current){renderTask.current.cancel();renderTask.current=null;}setPageNumber(v=>Math.min(numPages,v+1));}} disabled={!pdf||pageNumber>=numPages} className="p-1 rounded hover:bg-white/10 text-slate-500 hover:text-slate-300 disabled:opacity-30 transition-colors"><ChevronRight size={14}/></button>
              </div>
            )}
          </div>

          {/* Calibration banner */}
          {isCalibrating&&(
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2.5 rounded-xl border border-amber-500/25 bg-[#0c0f17]/95 backdrop-blur px-4 py-2 shadow-xl">
              <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse"/>
              <span className="text-xs text-amber-300 font-medium">Click 2 points on the drawing to set scale</span>
              <button onClick={()=>{setIsCalibrating(false);setCalibDraft([]);}} className="ml-2 text-slate-600 hover:text-slate-300"><X size={13}/></button>
            </div>
          )}

          {/* Tool status badge — bottom center */}
          {tool!=="select"&&(
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 rounded-xl border border-white/[0.08] bg-[#0c0f17]/95 backdrop-blur px-3.5 py-2 shadow-xl">
              <span style={{color:activeTool.color}}>{activeTool.icon}</span>
              <span className="text-[11px] font-semibold text-slate-300">{activeTool.label}</span>
              <span className="text-[10px] text-slate-600">— {activeTool.desc}</span>
              {tool==="line"&&lineStart&&<span className="text-[10px] text-sky-400 ml-1">Point 1 placed — click second point</span>}
              {tool==="area"&&areaPoints.length>0&&<span className="text-[10px] text-violet-400 ml-1">{areaPoints.length} pts — double-click to close</span>}
            </div>
          )}

          {/* Depth prompt */}
          {showDepth&&(
            <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/50 backdrop-blur-sm">
              <div className="w-64 rounded-2xl border border-white/10 bg-[#111318] p-5 space-y-4 shadow-2xl">
                <div>
                  <div className="text-sm font-semibold text-slate-100 mb-0.5">Volume Depth</div>
                  <div className="text-[11px] text-slate-600">Enter slab / excavation depth in inches</div>
                </div>
                <input type="number" value={depthIn} onChange={e=>setDepthIn(e.target.value)} className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200 outline-none focus:border-cyan-500/50" placeholder="4" autoFocus />
                <div className="flex gap-2">
                  <button onClick={confirmDepth} className="flex-1 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-xs font-semibold text-white transition-colors">Confirm</button>
                  <button onClick={()=>{setShowDepth(false);setVolumePoints([]);}} className="py-2 px-4 rounded-xl border border-white/[0.06] text-xs text-slate-500 hover:text-slate-300 transition-colors">Cancel</button>
                </div>
              </div>
            </div>
          )}

          {/* Error toast */}
          {error&&(
            <div className="absolute top-4 right-4 z-30 max-w-72 flex items-start gap-2 rounded-xl border border-red-500/20 bg-[#0c0f17]/95 backdrop-blur px-3 py-2.5 shadow-xl">
              <AlertCircle size={13} className="text-red-400 flex-shrink-0 mt-0.5"/>
              <span className="text-[11px] text-red-300 leading-relaxed">{error}</span>
              <button onClick={()=>setError(null)} className="ml-auto text-slate-700 hover:text-slate-400"><X size={12}/></button>
            </div>
          )}

          {/* Loading */}
          {loadingPdf&&(
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#080b10]/70 backdrop-blur-sm">
              <div className="flex items-center gap-2.5 rounded-xl border border-white/[0.08] bg-[#111318] px-4 py-3 shadow-xl">
                <RefreshCw size={14} className="animate-spin text-sky-400"/>
                <span className="text-xs text-slate-400">Loading drawing…</span>
              </div>
            </div>
          )}

          {/* Empty state */}
          {!pdf&&!loadingPdf&&(
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-5">
              <div className="w-24 h-24 rounded-3xl border border-white/[0.07] bg-white/[0.03] flex items-center justify-center">
                <FileText size={40} className="text-slate-800"/>
              </div>
              <div className="text-center">
                <div className="text-base font-semibold text-slate-400 mb-1.5">No drawing loaded</div>
                <div className="text-xs text-slate-700 mb-5">Upload a PDF to begin measuring</div>
                <label className="inline-flex items-center gap-2 cursor-pointer px-6 py-3 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-sm font-semibold transition-colors shadow-lg shadow-sky-900/30">
                  <Upload size={15}/> Upload PDF
                  <input type="file" accept=".pdf" className="hidden" onChange={e=>onPickFile(e.target.files?.[0]||null)} />
                </label>
              </div>
              <div className="flex items-center gap-6 mt-2">
                {TOOLS.slice(1).map(t=>(
                  <div key={t.key} className="flex flex-col items-center gap-1.5">
                    <div className="w-8 h-8 rounded-lg border border-white/[0.06] bg-white/[0.03] flex items-center justify-center" style={{color:t.color}}>{t.icon}</div>
                    <span className="text-[9px] text-slate-700 uppercase tracking-wider">{t.label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Canvas stack */}
          {pdf&&(
            <div className="relative w-full h-full"
              onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}
              onDoubleClick={(e:any)=>onDblClick(e)}>
              <canvas ref={canvasRef} className="absolute left-0 top-0"/>
              <canvas ref={overlayRef} className="absolute left-0 top-0 pointer-events-none"/>
              <canvas ref={hoverRef} className="absolute left-0 top-0 pointer-events-none"/>
              <MeasurementLayer measurements={visibleM} zoom={zoom} panX={panX} panY={panY}/>
            </div>
          )}
        </div>

        {/* ── Right Panel ── */}
        {rightPanelOpen&&(
          <aside className="flex w-64 min-w-[256px] flex-col border-l border-white/[0.06] bg-[#0c0f17]">

            {/* Panel tabs */}
            <div className="flex border-b border-white/[0.06]">
              {([["tools","Tools"],["layers","Layers"],["stats","Stats"],["settings","Config"]] as [PanelTab,string][]).map(([k,label])=>(
                <button key={k} onClick={()=>setPanelTab(k)}
                  className={cn("flex-1 py-2.5 text-[10px] font-bold uppercase tracking-widest border-b-2 transition-colors", panelTab===k?"border-sky-500 text-sky-300":"border-transparent text-slate-700 hover:text-slate-500")}>
                  {label}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto">

              {/* ── Tools Panel ── */}
              {panelTab==="tools"&&(
                <div className="p-3 space-y-3">

                  {/* Active tool */}
                  <div className="rounded-xl border border-white/[0.07] overflow-hidden">
                    <div className="px-3 py-2 bg-white/[0.03] border-b border-white/[0.05] text-[9px] font-bold uppercase tracking-widest text-slate-700">Active Tool</div>
                    <div className="p-2 grid grid-cols-5 gap-1">
                      {TOOLS.map(t=>(
                        <button key={t.key} onClick={()=>setTool(t.key)} title={t.label}
                          className={cn("flex flex-col items-center gap-1 py-2 rounded-lg border transition-all",
                            tool===t.key?"border-sky-500/30 bg-sky-500/10":"border-white/[0.05] bg-transparent hover:border-white/10 hover:bg-white/[0.03]")}>
                          <span style={{color:tool===t.key?t.color:undefined}} className={tool===t.key?"":"text-slate-700"}>{t.icon}</span>
                          <span className={cn("text-[8px] font-bold uppercase tracking-wide", tool===t.key?"text-sky-300":"text-slate-700")}>{t.label.slice(0,3)}</span>
                        </button>
                      ))}
                    </div>
                    <div className="px-3 pb-3">
                      <div className="flex items-center gap-2 rounded-lg bg-white/[0.03] border border-white/[0.05] px-2.5 py-2">
                        <span style={{color:activeTool.color}} className="flex-shrink-0">{activeTool.icon}</span>
                        <span className="text-[10px] text-slate-600 leading-tight">{activeTool.desc}</span>
                      </div>
                    </div>
                  </div>

                  {/* Group */}
                  <div className="rounded-xl border border-white/[0.07] overflow-hidden">
                    <div className="px-3 py-2 bg-white/[0.03] border-b border-white/[0.05] flex items-center justify-between">
                      <span className="text-[9px] font-bold uppercase tracking-widest text-slate-700">Group</span>
                      <button onClick={()=>setPanelTab("layers")} className="text-[9px] text-slate-700 hover:text-slate-500">Manage →</button>
                    </div>
                    <div className="p-3 flex gap-2 items-center">
                      {activeGroup&&<div className="w-3.5 h-3.5 rounded-sm flex-shrink-0" style={{backgroundColor:activeGroup.color}}/>}
                      <select value={activeGroupId||""} onChange={e=>setActiveGroupId(e.target.value||null)} className="flex-1 bg-white/[0.04] border border-white/[0.07] rounded-lg px-2 py-1.5 text-[11px] text-slate-300 outline-none focus:border-sky-500/50 min-w-0">
                        <option value="">No group</option>
                        {groups.sort((a,b)=>a.sortOrder-b.sortOrder).map(g=><option key={g.id} value={g.id}>{g.name}</option>)}
                      </select>
                    </div>
                  </div>

                  {/* Link to item */}
                  {(costItems.length>0||assemblies.length>0)&&(
                    <div className="rounded-xl border border-white/[0.07] overflow-hidden">
                      <div className="px-3 py-2 bg-white/[0.03] border-b border-white/[0.05] text-[9px] font-bold uppercase tracking-widest text-slate-700">Link to Item</div>
                      <div className="p-3 space-y-2">
                        {costItems.length>0&&(
                          <select value={linkedItemId||""} onChange={e=>{setLinkedItemId(e.target.value||undefined);setLinkedAssemblyId(undefined);}} className="w-full bg-white/[0.04] border border-white/[0.07] rounded-lg px-2 py-1.5 text-[11px] text-slate-300 outline-none focus:border-sky-500/50">
                            <option value="">No cost item</option>
                            {costItems.map(i=><option key={i.id} value={i.id}>{i.item_name} ({i.unit})</option>)}
                          </select>
                        )}
                        {assemblies.length>0&&(
                          <select value={linkedAssemblyId||""} onChange={e=>{setLinkedAssemblyId(e.target.value||undefined);setLinkedItemId(undefined);}} className="w-full bg-white/[0.04] border border-white/[0.07] rounded-lg px-2 py-1.5 text-[11px] text-slate-300 outline-none focus:border-sky-500/50">
                            <option value="">No assembly</option>
                            {assemblies.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}
                          </select>
                        )}
                        {(linkedItemId||linkedAssemblyId)&&(
                          <div className="flex items-center gap-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1.5">
                            <Check size={11} className="text-emerald-400 flex-shrink-0"/>
                            <span className="text-[10px] text-emerald-300 truncate">{linkedItemId?costItems.find(i=>i.id===linkedItemId)?.item_name:assemblies.find(a=>a.id===linkedAssemblyId)?.name}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Measurements list */}
                  <div className="rounded-xl border border-white/[0.07] overflow-hidden">
                    <div className="px-3 py-2 bg-white/[0.03] border-b border-white/[0.05] flex items-center justify-between">
                      <span className="text-[9px] font-bold uppercase tracking-widest text-slate-700">Measurements</span>
                      <button onClick={exportCSV} className="text-[9px] text-slate-700 hover:text-slate-500 flex items-center gap-1"><Download size={10}/> CSV</button>
                    </div>
                    <div className="p-2 max-h-[280px] overflow-y-auto">
                      {measurements.length===0?(
                        <div className="text-[10px] text-slate-800 text-center py-6 italic">No measurements yet</div>
                      ):(
                        <div className="space-y-1">
                          {measurements.map(m=>{
                            const g=groups.find(x=>x.id===m.groupId);
                            return(
                              <div key={m.id} onClick={()=>setSelectedId(m.id===selectedId?null:m.id)}
                                className={cn("flex items-center gap-2 px-2.5 py-2 rounded-lg border cursor-pointer transition-colors",
                                  m.id===selectedId?"border-sky-500/25 bg-sky-500/[0.08]":"border-white/[0.04] bg-white/[0.02] hover:bg-white/[0.04]")}>
                                <div className="w-2 h-2 rounded-full flex-shrink-0" style={{backgroundColor:m.color||TOOLS.find(t=>t.key===m.type)?.color||"#60a5fa"}}/>
                                <div className="flex-1 min-w-0">
                                  <div className="text-[10px] font-semibold text-slate-300 truncate">{fmt(m.result)} <span className="text-slate-700 font-normal">{m.unit}</span></div>
                                  {g&&<div className="text-[9px] text-slate-700">{g.name}</div>}
                                </div>
                                <button onClick={e=>{e.stopPropagation();removeM(m.id);}} className="p-0.5 rounded hover:bg-red-500/15 text-transparent hover:text-red-400 transition-colors group-hover:text-slate-700"><X size={11}/></button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* ── Layers Panel ── */}
              {panelTab==="layers"&&(
                <div className="p-3 space-y-3">
                  <div className="rounded-xl border border-white/[0.07] overflow-hidden">
                    <div className="px-3 py-2 bg-white/[0.03] border-b border-white/[0.05] flex items-center justify-between">
                      <span className="text-[9px] font-bold uppercase tracking-widest text-slate-700">Groups / Layers</span>
                      <button onClick={()=>setShowGroupForm(v=>!v)} className="text-[9px] text-sky-400 hover:text-sky-300 flex items-center gap-0.5"><Plus size={10}/> Add</button>
                    </div>
                    {showGroupForm&&(
                      <div className="p-3 border-b border-white/[0.05] space-y-2">
                        <input type="text" value={newGroupName} onChange={e=>setNewGroupName(e.target.value)} placeholder="Group name" autoFocus
                          className="w-full bg-white/[0.05] border border-white/[0.08] rounded-lg px-2.5 py-1.5 text-[11px] text-slate-200 outline-none focus:border-sky-500/50 placeholder-slate-700"
                          onKeyPress={e=>{if(e.key==="Enter"&&newGroupName.trim()){const ng:GroupType={id:crypto.randomUUID(),name:newGroupName.trim(),color:GROUP_COLORS[groups.length%GROUP_COLORS.length],visible:true,sortOrder:groups.length,locked:false};setGroups(p=>[...p,ng]);setActiveGroupId(ng.id);setNewGroupName("");setShowGroupForm(false);}}} />
                        <div className="flex gap-1.5">
                          <button onClick={()=>{if(!newGroupName.trim())return;const ng:GroupType={id:crypto.randomUUID(),name:newGroupName.trim(),color:GROUP_COLORS[groups.length%GROUP_COLORS.length],visible:true,sortOrder:groups.length,locked:false};setGroups(p=>[...p,ng]);setActiveGroupId(ng.id);setNewGroupName("");setShowGroupForm(false);}} className="flex-1 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-[10px] font-semibold text-white transition-colors">Create</button>
                          <button onClick={()=>{setShowGroupForm(false);setNewGroupName("");}} className="px-3 py-1.5 rounded-lg border border-white/[0.06] text-[10px] text-slate-600 hover:text-slate-400 transition-colors">Cancel</button>
                        </div>
                      </div>
                    )}
                    <div className="p-2 space-y-1">
                      {groups.map(g=>{
                        const mc=measurements.filter(m=>m.groupId===g.id).length;
                        return(
                          <div key={g.id} className={cn("flex items-center gap-2 px-2.5 py-2 rounded-lg border transition-colors",g.id===activeGroupId?"border-sky-500/20 bg-sky-500/[0.07]":"border-white/[0.04] bg-white/[0.02] hover:bg-white/[0.03]")}>
                            <button onClick={()=>setGroups(p=>p.map(x=>x.id===g.id?{...x,visible:!x.visible}:x))} className="flex-shrink-0">
                              <div className="w-3 h-3 rounded-sm transition-opacity" style={{backgroundColor:g.visible?g.color:"#374151",opacity:g.visible?1:0.4}}/>
                            </button>
                            <div className="flex-1 min-w-0">
                              <div className="text-[11px] font-medium text-slate-300 truncate">{g.name}</div>
                              <div className="text-[9px] text-slate-700">{mc} item{mc!==1?"s":""}</div>
                            </div>
                            <button onClick={()=>setActiveGroupId(g.id)} className={cn("px-1.5 py-0.5 rounded text-[9px] font-semibold transition-colors flex-shrink-0",g.id===activeGroupId?"bg-sky-500/15 text-sky-300":"text-slate-700 hover:text-slate-400")}>
                              {g.id===activeGroupId?"Active":"Use"}
                            </button>
                            <button onClick={()=>{setGroups(p=>p.filter(x=>x.id!==g.id));if(activeGroupId===g.id)setActiveGroupId(null);}} className="p-0.5 rounded hover:bg-red-500/15 text-slate-800 hover:text-red-400 transition-colors flex-shrink-0"><X size={11}/></button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* ── Stats Panel ── */}
              {panelTab==="stats"&&(
                <div className="p-3 space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    {[["Total",counts.total,"text-slate-200"],["Lines",counts.lines,"text-sky-300"],["Areas",counts.areas,"text-violet-300"],["Counts",counts.counts,"text-amber-300"],["Volumes",counts.volumes,"text-emerald-300"],["Groups",groups.length,"text-slate-400"]].map(([l,v,c])=>(
                      <div key={l as string} className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-3">
                        <div className="text-[9px] text-slate-700 uppercase tracking-widest mb-1">{l}</div>
                        <div className={cn("text-2xl font-bold",c as string)}>{v}</div>
                      </div>
                    ))}
                  </div>
                  {measurements.length>0&&(
                    <div className="rounded-xl border border-white/[0.07] overflow-hidden">
                      <div className="px-3 py-2 bg-white/[0.03] border-b border-white/[0.05] text-[9px] font-bold uppercase tracking-widest text-slate-700">All Measurements</div>
                      <div className="p-2 space-y-1 max-h-64 overflow-y-auto">
                        {measurements.map(m=>(
                          <div key={m.id} className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-white/[0.02] border border-white/[0.04]">
                            <div className="flex items-center gap-2 min-w-0">
                              <div className="w-2 h-2 rounded-full flex-shrink-0" style={{backgroundColor:m.color||"#60a5fa"}}/>
                              <span className="text-[10px] text-slate-400 capitalize flex-shrink-0">{m.type}</span>
                              <span className="text-[10px] font-semibold text-slate-200 truncate">{fmt(m.result)} {m.unit}</span>
                            </div>
                            <button onClick={()=>removeM(m.id)} className="p-0.5 rounded hover:bg-red-500/15 text-slate-800 hover:text-red-400 flex-shrink-0"><X size={10}/></button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ── Settings Panel ── */}
              {panelTab==="settings"&&(
                <div className="p-3 space-y-3">
                  <div className="rounded-xl border border-white/[0.07] overflow-hidden">
                    <div className="px-3 py-2 bg-white/[0.03] border-b border-white/[0.05] text-[9px] font-bold uppercase tracking-widest text-slate-700">Calibration</div>
                    <div className="p-3 space-y-2 text-[10px]">
                      <Row label="Status" value={calibration?"✓ Calibrated":"⚠ Not set"} vColor={calibration?"text-emerald-400":"text-amber-400"}/>
                      {calibration&&<>
                        <Row label="Scale" value={`${calibration.scaleFeetPerPixel.toFixed(5)} ft/px`}/>
                        <Row label="Reference" value={fmtFtIn(calibration.realDistanceFeet)}/>
                      </>}
                      <div className="pt-1 flex gap-2">
                        <button onClick={startCalibration} className="flex-1 py-1.5 rounded-lg bg-white/[0.05] hover:bg-white/[0.09] border border-white/[0.07] text-[10px] text-slate-400 transition-colors flex items-center justify-center gap-1"><Crosshair size={11}/>Recalibrate</button>
                        {calibration&&<button onClick={clearCalibration} className="py-1.5 px-3 rounded-lg border border-white/[0.06] text-[10px] text-slate-700 hover:text-red-400 transition-colors">Clear</button>}
                      </div>
                    </div>
                  </div>
                  <div className="rounded-xl border border-white/[0.07] overflow-hidden">
                    <div className="px-3 py-2 bg-white/[0.03] border-b border-white/[0.05] text-[9px] font-bold uppercase tracking-widest text-slate-700">Drawing</div>
                    <div className="p-3 space-y-2 text-[10px]">
                      <Row label="Page" value={pdf?`${pageNumber} / ${numPages}`:"No PDF"}/>
                      <Row label="Zoom" value={`${Math.round(zoom*100)}%`}/>
                      <Row label="Measurements" value={String(counts.total)}/>
                      <Row label="Auto-save" value="On"/>
                      <Row label="Units" value="Imperial (ft)"/>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}

function Row({label,value,vColor="text-slate-400"}:{label:string;value:string;vColor?:string}){
  return(
    <div className="flex items-center justify-between">
      <span className="text-slate-700">{label}</span>
      <span className={cn("font-medium",vColor)}>{value}</span>
    </div>
  );
}

export default function TakeoffPage() {
  return <TakeoffErrorBoundary><TakeoffPageInner/></TakeoffErrorBoundary>;
}
