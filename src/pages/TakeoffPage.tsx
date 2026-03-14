import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import workerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { usePanZoom } from "../features/takeoff/hooks/usePanZoom";
import { useMeasurements } from "../features/takeoff/hooks/useMeasurements";
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
type CalibPoint = { x: number; y: number };

function clamp(n: number, min: number, max: number) {
return Math.min(max, Math.max(min, n));
}

function dist(a: Point, b: Point) {
const dx = b.x - a.x;
const dy = b.y - a.y;
return Math.sqrt(dx * dx + dy * dy);
}

function parseFraction(input: string): number | null {
  const s = input.trim();
  if (!s) return 0;
  if (/^\d+(\.\d+)?$/.test(s)) return parseFloat(s);

  const m = s.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (!m) return null;

  const a = parseInt(m[1], 10);
  const b = parseInt(m[2], 10);
  if (!b) return null;

  return a / b;
}

function feetFromFIS(feet: number, inches: number, frac: number) {
return feet + (inches + frac) / 12;
}

function getToolButtonClass(active: boolean) {
return (
"inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm transition " +
(active
? "border-slate-600 bg-slate-800 text-white shadow-sm"
: "border-slate-800 bg-slate-950 hover:bg-slate-900 text-slate-200")
);
}

function getPanelClass() {
return "rounded-2xl border border-slate-800 bg-slate-900/50 backdrop-blur-sm";
}

type ScaleMode = "standard" | "fis" | "metric" | "auto";

function ScaleModal(props: {
open: boolean;
onClose: () => void;
onApply: (feet: number, opts: { applyAllPages: boolean; autoDimLine: boolean }) => void;
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

const canStartCalibration = Number(stdFeet || 0) > 0;

useEffect(() => {
if (!open) return;
setTab("standard");
}, [open]);

if (!open) return null;

function apply() {
let feet: number | null = null;

if (tab === "standard") {
  const n = Number(stdFeet);
  if (Number.isFinite(n) && n > 0) feet = n;
}

if (tab === "fis") {
  const f = Number(fisFeet || 0);
  const i = Number(fisInch || 0);
  const fr = parseFraction(fisFrac);
  if (fr == null) {
    alert("Invalid fraction (use 1/2, 3/8, etc.)");
    return;
  }
  const total = feetFromFIS(f, i, fr);
  if (Number.isFinite(total) && total > 0) feet = total;
}

if (tab === "metric") {
  const m = Number(metricMeters);
  if (Number.isFinite(m) && m > 0) feet = m * 3.28084;
}

if (tab === "auto") {
  alert("Auto scale is coming next (read scale from title block).");
  return;
}

if (!feet) {
  alert("Please enter a valid scale distance.");
  return;
}

if (isCalibrating) {
  if (onCalibrationOk) onCalibrationOk(feet);
  return;
}

onApply(feet, { applyAllPages, autoDimLine });

}

return (
<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
<div className="w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-950 shadow-2xl">
<div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
<div>
<div className="text-lg font-semibold">Scale</div>
<div className="text-xs text-slate-400">
Set drawing scale or calibrate from two picked points
</div>
</div>
<button onClick={onClose} className="rounded-lg px-2 py-1 hover:bg-slate-800/50">
✕
</button>
</div>

    <div className="px-5 pt-4">
      <div className="flex flex-wrap gap-2 text-sm">
        {[
          ["standard", "Standard"],
          ["fis", "F-I-S"],
          ["metric", "Metric"],
          ["auto", "Auto"],
        ].map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k as ScaleMode)}
            className={
              "rounded-xl border px-3 py-2 " +
              (tab === k
                ? "border-slate-700 bg-slate-800"
                : "border-slate-800 bg-slate-950 hover:bg-slate-900")
            }
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mt-4 rounded-xl border border-slate-800 bg-slate-900/20 p-4">
        {isCalibrating && (
          <div className="mb-3 text-sm text-slate-300">
            Calibration mode: click {calibPointsCount}/2 points on the drawing
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
                value={stdFeet}
                onChange={(e) => setStdFeet(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm"
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
                value={fisFeet}
                onChange={(e) => setFisFeet(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm"
                placeholder="45"
              />
            </label>

            <label className="text-xs text-slate-400">
              Inch
              <input
                value={fisInch}
                onChange={(e) => setFisInch(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm"
                placeholder="6"
              />
            </label>

            <label className="text-xs text-slate-400">
              Fraction
              <input
                value={fisFrac}
                onChange={(e) => setFisFrac(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm"
                placeholder="1/2"
              />
            </label>

            <div className="col-span-3 text-xs text-slate-500">
              Tip: Fraction accepts 1/2, 3/8, 0.25, etc.
            </div>
          </div>
        )}

        {tab === "metric" && (
          <div className="grid grid-cols-2 items-end gap-3">
            <div className="col-span-2 text-sm text-slate-300">Enter the distance in meters:</div>
            <label className="text-xs text-slate-400">
              Meters
              <input
                value={metricMeters}
                onChange={(e) => setMetricMeters(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm"
                placeholder="3"
              />
            </label>
            <div className="flex items-center text-xs text-slate-400">m</div>
          </div>
        )}

        {tab === "auto" && (
          <div className="text-sm text-slate-300">
            Auto scale (read scale from drawing title block) — coming next.
          </div>
        )}
      </div>

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

      <div className="mt-5 flex items-center justify-between pb-5">
        <button
          onClick={() => onApply(0, { applyAllPages, autoDimLine })}
          className="rounded-xl bg-slate-800/40 px-3 py-2 text-sm hover:bg-slate-800/60"
        >
          Clear Scale
        </button>

        <div className="flex gap-2">
          <button
            onClick={onCalibrationCancel || onClose}
            className="rounded-xl bg-slate-800/30 px-4 py-2 text-sm hover:bg-slate-800/50"
          >
            Cancel
          </button>
          <button
            disabled={isCalibrating ? !canStartCalibration : !canApply}
            onClick={apply}
            className={
              "rounded-xl px-4 py-2 text-sm " +
              ((isCalibrating ? canStartCalibration : canApply)
                ? "border border-emerald-900/40 bg-emerald-900/50 hover:bg-emerald-900/70"
                : "bg-slate-800/20 text-slate-500")
            }
          >
            OK
          </button>
        </div>
      </div>

      {!(isCalibrating ? canConfirmCalibration : canApply) && (
        <div className="pb-5 text-xs text-slate-500">
          {isCalibrating
            ? `Click ${2 - calibPointsCount} more point${calibPointsCount === 1 ? "" : "s"} on the drawing first, then press OK.`
            : "Click two points on the drawing first, then press OK."}
        </div>
      )}
    </div>
  </div>
</div>

);
}

class TakeoffErrorBoundary extends React.Component<{ children: React.ReactNode }, { err: any }> {
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
<div style={{ padding: 16, color: "#fff", background: "#111" }}>
<h2 style={{ marginBottom: 8 }}>Takeoff crashed</h2>
<pre style={{ whiteSpace: "pre-wrap" }}>
{String(this.state.err?.message || this.state.err)}
</pre>
<pre style={{ whiteSpace: "pre-wrap", opacity: 0.8 }}>
{String(this.state.err?.stack || "")}
</pre>
</div>
);
}
return this.props.children as any;
}
}

function TakeoffPageInner() {
const nav = useNavigate();
const { projectId: routeProjectId } = useParams<{ projectId?: string }>();

const canvasRef = useRef<HTMLCanvasElement | null>(null);
const viewerRef = useRef<HTMLDivElement | null>(null);

const renderTaskRef = useRef<any>(null);
const renderSeqRef = useRef(0);

const [pdf, setPdf] = useState<any>(null);
const [pageNumber, setPageNumber] = useState(1);
const [numPages, setNumPages] = useState(0);

const panZoom = usePanZoom({
minZoom: 0.2,
maxZoom: 6,
zoomSpeed: 0.08,
initialZoom: 1.0,
});

const {
measurements,
addMeasurement,
removeMeasurement,
updateMeasurement,
setAllMeasurements,
} = useMeasurements();

const [calibrating, setCalibrating] = useState(false);
const [calPoints, setCalPoints] = useState<Point[]>([]);
const [feetPerPixel, setFeetPerPixel] = useState<number | null>(null);

const [isCalibrating, setIsCalibrating] = useState(false);
const [calibPoints, setCalibPoints] = useState<CalibPoint[]>([]);
const [pendingCalibLength, setPendingCalibLength] = useState<number | null>(null);

function getEnteredFeet(): number {
return 1;
}

const [error, setError] = useState<string | null>(null);
const [loadingPdf, setLoadingPdf] = useState(false);
const [overViewer, setOverViewer] = useState(false);
const [scaleModalOpen, setScaleModalOpen] = useState(false);

const fitScaleRef = useRef<number | null>(null);

const isSpaceDownRef = useRef(false);
const isPanningRef = useRef(false);
const activePointerIdRef = useRef<number | null>(null);

type ToolMode = "select" | "line" | "area" | "count" | "volume";
const [tool, setTool] = useState<ToolMode>("select");

const [lineStart, setLineStart] = useState<Point | null>(null);
const [lineEnd, setLineEnd] = useState<Point | null>(null);
const [hoverPt, setHoverPt] = useState<Point | null>(null);

const [areaPoints, setAreaPoints] = useState<Point[]>([]);
const [areaHoverPt, setAreaHoverPt] = useState<Point | null>(null);

const [countPoints, setCountPoints] = useState<Point[]>([]);

const [volumePoints, setVolumePoints] = useState<Point[]>([]);
const [volumeHoverPt, setVolumeHoverPt] = useState<Point | null>(null);
const [showDepthPrompt, setShowDepthPrompt] = useState(false);
const [depthInput, setDepthInput] = useState("4");
const [feetPerPdfUnit, setFeetPerPdfUnit] = useState<number | null>(null);

const [canvasWidth, setCanvasWidth] = useState(0);
const [canvasHeight, setCanvasHeight] = useState(0);

const [groups, setGroups] = useState<
Array<{
id: string;
name: string;
color: string;
visible: boolean;
sortOrder: number;
}>

([]);

const [sessionId, setSessionId] = useState<string | null>(null);
const [activeProjectId, setActiveProjectId] = useState<string | null>(() => {
if (routeProjectId) return routeProjectId;
const keys = ["active_project_id", "selected_project_id", "project_id"];
for (const k of keys) {
const v = localStorage.getItem(k);
if (v && v.trim()) return v.trim();
}
return null;
});
const [dbLoaded, setDbLoaded] = useState(false);
const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
const [newGroupName, setNewGroupName] = useState("");
const [showNewGroupForm, setShowNewGroupForm] = useState(false);
const [currentProject, setCurrentProject] = useState<{ id: string; name: string | null } | null>(null);
const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "error">("saved");
const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

const { hasFeature, features } = usePlan();
const [showPaywall, setShowPaywall] = useState(false);
const [paywallFeature, setPaywallFeature] = useState("");

function distFeet(a: { x: number; y: number }, b: { x: number; y: number }) {
const dx = b.x - a.x;
const dy = b.y - a.y;
const d = Math.sqrt(dx * dx + dy * dy);
if (!d) return 0;
if (!feetPerPdfUnit) return 0;
return d * feetPerPdfUnit;
}

function formatFeetInches(totalFeet: number) {
if (!isFinite(totalFeet) || totalFeet <= 0) return "";
const feet = Math.floor(totalFeet);
const inchesTotal = (totalFeet - feet) * 12;
const inches = Math.floor(inchesTotal);
const frac = inchesTotal - inches;

const denom = 16;
let num = Math.round(frac * denom);
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

useEffect(() => {
if (routeProjectId && routeProjectId !== activeProjectId) {
setActiveProjectId(routeProjectId);
}
}, [routeProjectId, activeProjectId]);

useEffect(() => {
if (!routeProjectId) {
setCurrentProject(null);
return;
}

let alive = true;
async function loadProject() {
  try {
    const { data, error } = await supabase
      .from("projects")
      .select("id, name")
      .eq("id", routeProjectId)
      .maybeSingle();

    if (error) throw error;
    if (!alive) return;
    if (data) setCurrentProject(data);
  } catch (e) {
    console.error("Failed to load project:", e);
  }
}

loadProject();
return () => {
  alive = false;
};

}, [routeProjectId]);

useEffect(() => {
if (groups.length === 0) {
const defaultGroups = [
{ id: crypto.randomUUID(), name: "Concrete", color: "#10b981", visible: true, sortOrder: 0 },
{ id: crypto.randomUUID(), name: "Masonry", color: "#f59e0b", visible: true, sortOrder: 1 },
{ id: crypto.randomUUID(), name: "Electrical", color: "#3b82f6", visible: true, sortOrder: 2 },
{ id: crypto.randomUUID(), name: "Plumbing", color: "#06b6d4", visible: true, sortOrder: 3 },
];
setGroups(defaultGroups);
setActiveGroupId(defaultGroups[0].id);
}
}, [groups.length]);

async function onPickFile(file: File | null) {
setError(null);
if (!file) return;

if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
  setError("Please upload a PDF file.");
  return;
}

try {
  setLoadingPdf(true);

  const arrayBuffer = await file.arrayBuffer();
  const task = getDocument({ data: arrayBuffer });
  const loadedPdf = await task.promise;

  setPdf(loadedPdf);
  setNumPages(loadedPdf.numPages);
  setPageNumber(1);

  setFeetPerPixel(null);
  setFeetPerPdfUnit(null);
  setCalibrating(false);
  setIsCalibrating(false);
  setCalPoints([]);
  setCalibPoints([]);

  if (activeProjectId) {
    const session = await getOrCreateSession(activeProjectId, file.name);
    if (session) {
      setSessionId(session.id);
      const data = await loadTakeoff(session.id);
      if (data && !dbLoaded) {
        if (data.groups && data.groups.length > 0) setGroups(data.groups);
        if (data.measurements && data.measurements.length > 0) setAllMeasurements(data.measurements);
        setDbLoaded(true);
      }
    }
  }

  panZoom.resetView();

  setTool("select");
  setLineStart(null);
  setLineEnd(null);
  setHoverPt(null);
  setAreaPoints([]);
  setAreaHoverPt(null);
  setCountPoints([]);
  setVolumePoints([]);
  setVolumeHoverPt(null);
  setShowDepthPrompt(false);

  fitScaleRef.current = null;

  if (viewerRef.current) {
    viewerRef.current.scrollLeft = 0;
    viewerRef.current.scrollTop = 0;
  }
} catch (e: any) {
  setError("PDF load failed: " + (e?.message || String(e)));
  setPdf(null);
  setNumPages(0);
  setPageNumber(1);
} finally {
  setLoadingPdf(false);
}

}

async function computeFitScale() {
if (!pdf) return null;
const viewer = viewerRef.current;
if (!viewer) return null;

const page = await pdf.getPage(pageNumber);
const v = page.getViewport({ scale: 1 });

const pad = 24;
const vw = Math.max(200, viewer.clientWidth - pad);
const vh = Math.max(200, viewer.clientHeight - pad);

const fit = Math.min(vw / v.width, vh / v.height) * 0.98;
return clamp(fit, 0.3, 4);

}

function drawOverlay(ctx: CanvasRenderingContext2D) {
if (calPoints.length > 0) {
ctx.save();
ctx.lineWidth = 2;
ctx.strokeStyle = "#22c55e";
ctx.fillStyle = "#22c55e";

  for (const p of calPoints) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
    ctx.fill();
  }

  if (calPoints.length === 2) {
    ctx.beginPath();
    ctx.moveTo(calPoints[0].x, calPoints[0].y);
    ctx.lineTo(calPoints[1].x, calPoints[1].y);
    ctx.stroke();
  }

  ctx.restore();
}

const a = lineStart;
const b = lineEnd ?? (tool === "line" ? hoverPt : null);
if (tool === "line" && a && b) {
  ctx.save();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "#60a5fa";
  ctx.fillStyle = "#60a5fa";

  ctx.beginPath();
  ctx.arc(a.x, a.y, 5, 0, Math.PI * 2);
  ctx.fill();

  ctx.beginPath();
  ctx.arc(b.x, b.y, 5, 0, Math.PI * 2);
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();

  const px = dist(a, b);
  const totalFeet = distFeet(a, b);
  const label = totalFeet > 0 ? formatFeetInches(totalFeet) : `${px.toFixed(0)} px (calibrate to get feet)`;

  const midX = (a.x + b.x) / 2;
  const midY = (a.y + b.y) / 2;

  ctx.font = "14px system-ui, -apple-system, Segoe UI, Roboto, Arial";
  const pad = 6;
  const w = ctx.measureText(label).width + pad * 2;
  const h = 22;

  ctx.fillStyle = "rgba(2,6,23,0.85)";
  ctx.strokeStyle = "rgba(96,165,250,0.9)";
  ctx.lineWidth = 1;

  (ctx as any).roundRect
    ? (ctx as any).roundRect(midX - w / 2, midY - h - 8, w, h, 8)
    : (() => {
        ctx.beginPath();
        ctx.rect(midX - w / 2, midY - h - 8, w, h);
      })();

  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#e2e8f0";
  ctx.fillText(label, midX - w / 2 + pad, midY - 12);

  ctx.restore();
}

if (tool === "area" && areaPoints.length > 0) {
  ctx.save();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "#a78bfa";
  ctx.fillStyle = "rgba(167,139,250,0.2)";

  ctx.beginPath();
  ctx.moveTo(areaPoints[0].x, areaPoints[0].y);
  for (let i = 1; i < areaPoints.length; i++) {
    ctx.lineTo(areaPoints[i].x, areaPoints[i].y);
  }

  if (areaHoverPt && areaPoints.length >= 1) {
    ctx.lineTo(areaHoverPt.x, areaHoverPt.y);
    ctx.lineTo(areaPoints[0].x, areaPoints[0].y);
  }

  if (areaPoints.length >= 3) {
    ctx.closePath();
    ctx.fill();
  }

  ctx.stroke();

  ctx.fillStyle = "#a78bfa";
  for (const p of areaPoints) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

if (tool === "volume" && volumePoints.length > 0) {
  ctx.save();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "#10b981";
  ctx.fillStyle = "rgba(16,185,129,0.2)";

  ctx.beginPath();
  ctx.moveTo(volumePoints[0].x, volumePoints[0].y);
  for (let i = 1; i < volumePoints.length; i++) {
    ctx.lineTo(volumePoints[i].x, volumePoints[i].y);
  }

  if (volumeHoverPt && volumePoints.length >= 1) {
    ctx.lineTo(volumeHoverPt.x, volumeHoverPt.y);
    ctx.lineTo(volumePoints[0].x, volumePoints[0].y);
  }

  if (volumePoints.length >= 3) {
    ctx.closePath();
    ctx.fill();
  }

  ctx.stroke();

  ctx.fillStyle = "#10b981";
  for (const p of volumePoints) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

}

async function render() {
try {
if (!pdf) return;

  const canvas = canvasRef.current;
  const viewer = viewerRef.current;
  if (!canvas || !viewer) return;

  const seq = ++renderSeqRef.current;
  const page = await pdf.getPage(pageNumber);

  if (fitScaleRef.current == null) {
    const fit = await computeFitScale();
    if (fit != null) {
      fitScaleRef.current = fit;
      panZoom.fitToView(
        page.getViewport({ scale: 1 }).width,
        page.getViewport({ scale: 1 }).height,
        viewer.clientWidth,
        viewer.clientHeight
      );
      return;
    }
  }

  const viewport = page.getViewport({ scale: panZoom.zoom });
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);

  setCanvasWidth(canvas.width);
  setCanvasHeight(canvas.height);

  canvas.style.width = canvas.width + "px";
  canvas.style.height = canvas.height + "px";
  canvas.style.maxWidth = "none";
  canvas.style.maxHeight = "none";
  canvas.style.display = "block";

  if (renderTaskRef.current) {
    try {
      renderTaskRef.current.cancel();
    } catch {}
    renderTaskRef.current = null;
  }

  const task = page.render({ canvasContext: ctx, viewport });
  renderTaskRef.current = task;

  try {
    await task.promise;
  } catch (err: any) {
    if (err?.name !== "RenderingCancelledException") throw err;
    return;
  } finally {
    if (renderTaskRef.current === task) renderTaskRef.current = null;
  }

  if (seq !== renderSeqRef.current) return;
  drawOverlay(ctx);
} catch (e: any) {
  setError("Render failed: " + (e?.message || String(e)));
}

}

useEffect(() => {
let cancelled = false;
(async () => {
try {
if (!cancelled) await render();
} catch (e: any) {
if (!cancelled) setError("Render failed: " + (e?.message || String(e)));
}
})();
return () => {
cancelled = true;
};
}, [
pdf,
pageNumber,
panZoom.zoom,
panZoom.panX,
panZoom.panY,
calPoints.length,
calibPoints.length,
tool,
lineStart?.x,
lineStart?.y,
lineEnd?.x,
lineEnd?.y,
hoverPt?.x,
hoverPt?.y,
areaPoints.length,
areaHoverPt?.x,
areaHoverPt?.y,
volumePoints.length,
volumeHoverPt?.x,
volumeHoverPt?.y,
]);

useEffect(() => {
const onKeyDown = (e: KeyboardEvent) => {
if (e.code === "Space") {
e.preventDefault();
isSpaceDownRef.current = true;
}

  if (tool === "area") {
    if (e.code === "Enter" && areaPoints.length >= 3) {
      e.preventDefault();
      finishAreaPolygon();
    }
    if (e.code === "Escape") {
      e.preventDefault();
      setAreaPoints([]);
      setAreaHoverPt(null);
    }
  }

  if (tool === "count") {
    if (e.code === "Escape") {
      e.preventDefault();
      setCountPoints([]);
    }
  }

  if (tool === "volume") {
    if (e.code === "Enter" && volumePoints.length >= 3) {
      e.preventDefault();
      finishVolumePolygon();
    }
    if (e.code === "Escape") {
      e.preventDefault();
      setVolumePoints([]);
      setVolumeHoverPt(null);
      setShowDepthPrompt(false);
    }
  }
};

const onKeyUp = (e: KeyboardEvent) => {
  if (e.code === "Space") {
    isSpaceDownRef.current = false;
    isPanningRef.current = false;
    activePointerIdRef.current = null;
  }
};

window.addEventListener("keydown", onKeyDown, { passive: false });
window.addEventListener("keyup", onKeyUp);

return () => {
  window.removeEventListener("keydown", onKeyDown as any);
  window.removeEventListener("keyup", onKeyUp as any);
};

}, [tool, areaPoints, countPoints, volumePoints]);

useEffect(() => {
function onWheel(e: WheelEvent) {
if (!overViewer) return;
if (e.ctrlKey || e.metaKey) e.preventDefault();
}

function onKeyDown(e: KeyboardEvent) {
  if (!overViewer) return;
  if (e.ctrlKey || e.metaKey) {
    const k = e.key.toLowerCase();
    if (k === "+" || k === "=" || k === "-" || k === "0") e.preventDefault();
  }
}

window.addEventListener("wheel", onWheel, { passive: false, capture: true });
window.addEventListener("keydown", onKeyDown, { capture: true });

return () => {
  window.removeEventListener("wheel", onWheel as any, { capture: true } as any);
  window.removeEventListener("keydown", onKeyDown as any, { capture: true } as any);
};

}, [overViewer]);

function resetDraftToolState() {
setLineStart(null);
setLineEnd(null);
setHoverPt(null);
setAreaPoints([]);
setAreaHoverPt(null);
setCountPoints([]);
setVolumePoints([]);
setVolumeHoverPt(null);
setShowDepthPrompt(false);
}

function nextPage() {
if (pageNumber < numPages) {
setPageNumber((p) => p + 1);
fitScaleRef.current = null;
resetDraftToolState();
setCalPoints([]);
setCalibrating(false);
setIsCalibrating(false);
setCalibPoints([]);
}
}

function prevPage() {
if (pageNumber > 1) {
setPageNumber((p) => p - 1);
fitScaleRef.current = null;
resetDraftToolState();
setCalPoints([]);
setCalibrating(false);
setIsCalibrating(false);
setCalibPoints([]);
}
}

function goToPage(page: number) {
if (page < 1 || page > numPages) return;
setPageNumber(page);
fitScaleRef.current = null;
resetDraftToolState();
setCalPoints([]);
setCalibrating(false);
setIsCalibrating(false);
setCalibPoints([]);
}

function startCalibrate() {
setError(null);
setCalibrating(true);
setIsCalibrating(true);
setCalibPoints([]);
setTool("select");
resetDraftToolState();
setCalPoints([]);
setScaleModalOpen(true);
}

function cancelCalibrate() {
setCalibrating(false);
setIsCalibrating(false);
setCalibPoints([]);
setCalPoints([]);
setScaleModalOpen(false);
}

function canvasPointFromEvent(e: React.MouseEvent<HTMLCanvasElement>) {
const canvas = canvasRef.current!;
const rect = canvas.getBoundingClientRect();
return {
x: Math.round(e.clientX - rect.left),
y: Math.round(e.clientY - rect.top),
};
}

function shouldStartPan(e: React.PointerEvent) {
const LEFT = 0;
const MIDDLE = 1;
if (e.button === MIDDLE) return true;
if (e.button === LEFT && isSpaceDownRef.current) return true;
return false;
}

function onViewerPointerDown(e: React.PointerEvent) {
const el = viewerRef.current;
if (!el) return;
if (!shouldStartPan(e)) return;

e.preventDefault();
e.stopPropagation();

isPanningRef.current = true;
activePointerIdRef.current = e.pointerId;
(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);

panZoom.startPan(e.clientX, e.clientY);

}

function onViewerPointerMove(e: React.PointerEvent) {
if (!isPanningRef.current) return;
if (activePointerIdRef.current !== e.pointerId) return;

e.preventDefault();
panZoom.updatePan(e.clientX, e.clientY);

}

function endPan(e?: React.PointerEvent) {
if (!isPanningRef.current) return;
isPanningRef.current = false;
if (e && activePointerIdRef.current === e.pointerId) {
try {
(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
} catch {}
}
activePointerIdRef.current = null;
panZoom.endPan();
}

function onViewerPointerUp(e: React.PointerEvent) {
if (!isPanningRef.current) return;
e.preventDefault();
e.stopPropagation();
endPan(e);
}

function onViewerPointerLeave(e: React.PointerEvent) {
endPan(e);
}

function onViewerWheel(e: React.WheelEvent) {
const el = viewerRef.current;
if (!el) return;

e.preventDefault();

const isZoomGesture = e.ctrlKey;
if (!isZoomGesture) {
  panZoom.updatePan(e.clientX + e.deltaX, e.clientY + e.deltaY);
  return;
}

const rect = el.getBoundingClientRect();
panZoom.handleWheel(e.nativeEvent, rect);

}

function onCanvasClick(e: React.MouseEvent<HTMLCanvasElement>) {
if (isPanningRef.current) return;

if (isCalibrating) {
  e.preventDefault();
  e.stopPropagation();

  const el = viewerRef.current;
  if (!el) return;

  const rect = el.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;

  const x = (mx - panZoom.panX) / panZoom.zoom;
  const y = (my - panZoom.panY) / panZoom.zoom;
  const newPoint = { x, y };

  setCalibPoints((prev) => {
    if (prev.length >= 2) return [newPoint];
    return [...prev, newPoint];
  });

  return;
}

if (calibrating) {
  const p = canvasPointFromEvent(e);
  setCalPoints((prev) => {
    if (prev.length >= 2) return [p];
    return [...prev, p];
  });
  return;
}

if (tool === "line") {
  const p = canvasPointFromEvent(e);
  if (!lineStart) {
    setLineStart(p);
    setLineEnd(null);
    return;
  }
  if (!lineEnd) {
    setLineEnd(p);

    if (feetPerPixel && feetPerPixel > 0) {
      const pixelsPerUnit = 1 / feetPerPixel;
      const activeGroup = groups.find((g) => g.id === activeGroupId);
      addMeasurement({
        type: "line",
        points: [lineStart, p],
        pixelsPerUnit,
        unit: "ft",
        label: `Line measurement ${measurements.length + 1}`,
        color: activeGroup?.color || "#60a5fa",
        groupId: activeGroupId || undefined,
      });
    }
    return;
  }

  setLineStart(p);
  setLineEnd(null);
  return;
}

if (tool === "area") {
  const p = canvasPointFromEvent(e);
  setAreaPoints((prev) => [...prev, p]);
  return;
}

if (tool === "volume") {
  const p = canvasPointFromEvent(e);
  setVolumePoints((prev) => [...prev, p]);
  return;
}

if (tool === "count") {
  const p = canvasPointFromEvent(e);

  if (feetPerPixel && feetPerPixel > 0) {
    const pixelsPerUnit = 1 / feetPerPixel;
    const activeGroup = groups.find((g) => g.id === activeGroupId);
    addMeasurement({
      type: "count",
      points: [p],
      pixelsPerUnit,
      unit: "ea",
      label: `Count ${measurements.length + 1}`,
      color: activeGroup?.color || "#f59e0b",
      groupId: activeGroupId || undefined,
    });
  }
  return;
}

}

function onCanvasDoubleClick(e: React.MouseEvent<HTMLCanvasElement>) {
if (tool === "area" && areaPoints.length >= 3) {
e.preventDefault();
e.stopPropagation();
finishAreaPolygon();
}

if (tool === "volume" && volumePoints.length >= 3) {
  e.preventDefault();
  e.stopPropagation();
  finishVolumePolygon();
}

}

function onCanvasMove(e: React.MouseEvent<HTMLCanvasElement>) {
if (tool === "line") {
if (!lineStart || lineEnd) return;
setHoverPt(canvasPointFromEvent(e));
return;
}

if (tool === "area" && areaPoints.length > 0) {
  setAreaHoverPt(canvasPointFromEvent(e));
  return;
}

if (tool === "volume" && volumePoints.length > 0) {
  setVolumeHoverPt(canvasPointFromEvent(e));
  return;
}

}

function applyScaleFromModal(realFeet: number, opts: { applyAllPages: boolean; autoDimLine: boolean }) {
if (realFeet === 0) {
setFeetPerPixel(null);
setFeetPerPdfUnit(null);
setCalibrating(false);
setIsCalibrating(false);
setCalPoints([]);
setCalibPoints([]);
setScaleModalOpen(false);
setError(null);
return;
}

const pointsToUse = isCalibrating ? calibPoints : calPoints;
const pointsLength = isCalibrating ? calibPoints.length : calPoints.length;

if (pointsLength !== 2) {
  setError("Click two points on the drawing first.");
  return;
}

const pixelDist = dist(pointsToUse[0], pointsToUse[1]);
if (pixelDist <= 0) {
  setError("Points too close.");
  return;
}

const fpp = realFeet / pixelDist;
setFeetPerPixel(fpp);
setFeetPerPdfUnit(fpp);

setCalibrating(false);
setIsCalibrating(false);
setScaleModalOpen(false);
setError(null);

if (!opts.autoDimLine) {
  setCalPoints([]);
  setCalibPoints([]);
}

}

function handleCalibrationOk(lengthFeet: number) {
if (!lengthFeet) return;
setPendingCalibLength(lengthFeet);
setCalibPoints([]);
setIsCalibrating(true);
setScaleModalOpen(false);
}

function onCalibrationCancel() {
setIsCalibrating(false);
setCalibPoints([]);
setPendingCalibLength(null);
setScaleModalOpen(false);
}

function finishAreaPolygon() {
if (areaPoints.length < 3) return;

if (feetPerPixel && feetPerPixel > 0) {
  const pixelsPerUnit = 1 / feetPerPixel;
  const activeGroup = groups.find((g) => g.id === activeGroupId);

  addMeasurement({
    type: "area",
    points: [...areaPoints],
    pixelsPerUnit,
    unit: "ft²",
    label: `Area ${measurements.length + 1}`,
    color: activeGroup?.color || "#a78bfa",
    groupId: activeGroupId || undefined,
  });
}

setAreaPoints([]);
setAreaHoverPt(null);

}

function finishVolumePolygon() {
if (volumePoints.length < 3) return;
setShowDepthPrompt(true);
}

function confirmVolumeWithDepth() {
if (volumePoints.length < 3) return;

const depthInches = parseFloat(depthInput);
if (!depthInches || depthInches <= 0) {
  alert("Please enter a valid depth in inches");
  return;
}

if (feetPerPixel && feetPerPixel > 0) {
  const pixelsPerUnit = 1 / feetPerPixel;

  let areaPixels = 0;
  for (let i = 0; i < volumePoints.length; i++) {
    const j = (i + 1) % volumePoints.length;
    areaPixels += volumePoints[i].x * volumePoints[j].y;
    areaPixels -= volumePoints[j].x * volumePoints[i].y;
  }
  areaPixels = Math.abs(areaPixels / 2);

  const areaFt2 = areaPixels / (pixelsPerUnit * pixelsPerUnit);
  const depthFt = depthInches / 12;
  const volumeFt3 = areaFt2 * depthFt;
  const volumeYd3 = volumeFt3 / 27;
  const volumeM3 = volumeFt3 * 0.028316846592;

  const activeGroup = groups.find((g) => g.id === activeGroupId);
  addMeasurement({
    type: "volume",
    points: [...volumePoints],
    pixelsPerUnit,
    unit: "yd³",
    label: `Volume ${measurements.length + 1}`,
    color: activeGroup?.color || "#10b981",
    groupId: activeGroupId || undefined,
    meta: {
      depthInches,
      volumeM3,
      volumeFt3,
      areaFt2,
      volumeYd3,
    },
  });
}

setVolumePoints([]);
setVolumeHoverPt(null);
setShowDepthPrompt(false);
setDepthInput("4");

}

const canConfirmCalibration = calibPoints.length === 2;

useEffect(() => {
if (!isCalibrating) return;
if (calibPoints.length !== 2) return;
if (!pendingCalibLength) return;

const [a, b] = calibPoints;
const dx = b.x - a.x;
const dy = b.y - a.y;
const pixelDist = Math.sqrt(dx * dx + dy * dy);
if (!pixelDist || pixelDist <= 0) return;

const newFeetPerPixel = pendingCalibLength / pixelDist;
setFeetPerPixel(newFeetPerPixel);
setFeetPerPdfUnit(newFeetPerPixel);

setIsCalibrating(false);
setPendingCalibLength(null);
setCalibPoints([]);

}, [isCalibrating, calibPoints, pendingCalibLength]);

function toggleGroupVisibility(groupId: string) {
setGroups((prev) =>
prev.map((g) => (g.id === groupId ? { ...g, visible: !g.visible } : g))
);
}

function addNewGroup() {
if (!newGroupName.trim()) return;

const maxGroups = features.maxTakeoffGroups;
if (maxGroups !== null && groups.length >= maxGroups) {
  setPaywallFeature("Unlimited Takeoff Groups");
  setShowPaywall(true);
  return;
}

const colors = ["#ef4444", "#84cc16", "#8b5cf6", "#ec4899", "#14b8a6", "#f97316"];
const randomColor = colors[Math.floor(Math.random() * colors.length)];

const newGroup = {
  id: crypto.randomUUID(),
  name: newGroupName.trim(),
  color: randomColor,
  visible: true,
  sortOrder: groups.length,
};

setGroups((prev) => [...prev, newGroup]);
setNewGroupName("");
setShowNewGroupForm(false);

}

function deleteGroup(groupId: string) {
setGroups((prev) => prev.filter((g) => g.id !== groupId));
if (activeGroupId === groupId) {
setActiveGroupId(groups.find((g) => g.id !== groupId)?.id || null);
}
}

function exportToCSV() {
if (!hasFeature("takeoffExport")) {
setPaywallFeature("Export Takeoff to CSV");
setShowPaywall(true);
return;
}

const rows = [["Group", "Type", "Label", "Result", "Unit"]];

groups.forEach((group) => {
  const groupMeasurements = measurements.filter((m) => m.groupId === group.id);
  groupMeasurements.forEach((m) => {
    const unit =
      m.type === "line"
        ? "ft"
        : m.type === "area"
        ? "ft²"
        : m.type === "volume"
        ? "ft³"
        : "count";
    rows.push([group.name, m.type, m.label || "", m.result.toFixed(2), unit]);
  });
});

const ungrouped = measurements.filter((m) => !m.groupId);
ungrouped.forEach((m) => {
  const unit =
    m.type === "line"
      ? "ft"
      : m.type === "area"
      ? "ft²"
      : m.type === "volume"
      ? "ft³"
      : "count";
  rows.push(["Ungrouped", m.type, m.label || "", m.result.toFixed(2), unit]);
});

const csv = rows.map((row) => row.map((cell) => `"${cell}"`).join(",")).join("\n");
const blob = new Blob([csv], { type: "text/csv" });
const url = URL.createObjectURL(blob);
const a = document.createElement("a");
a.href = url;
a.download = "takeoff-export.csv";
a.click();
URL.revokeObjectURL(url);

}

function changeMeasurementGroup(measurementId: string, newGroupId: string | null) {
updateMeasurement(measurementId, { groupId: newGroupId || undefined });
}

function getGroupTotals(groupId: string) {
const groupMeasurements = measurements.filter((m) => m.groupId === groupId);

return {
  line: groupMeasurements
    .filter((m) => m.type === "line")
    .reduce((sum, m) => sum + m.result, 0),
  area: groupMeasurements
    .filter((m) => m.type === "area")
    .reduce((sum, m) => sum + m.result, 0),
  volume: groupMeasurements
    .filter((m) => m.type === "volume")
    .reduce((sum, m) => sum + m.result, 0),
  count: groupMeasurements
    .filter((m) => m.type === "count")
    .reduce((sum, m) => sum + m.result, 0),
};

}

const visibleMeasurements = measurements.filter((m) => {
if (!m.groupId) return true;
const group = groups.find((g) => g.id === m.groupId);
return group?.visible !== false;
});

const overallTotals = useMemo(() => {
return {
line: measurements.filter((m) => m.type === "line").reduce((sum, m) => sum + m.result, 0),
area: measurements.filter((m) => m.type === "area").reduce((sum, m) => sum + m.result, 0),
volume: measurements.filter((m) => m.type === "volume").reduce((sum, m) => sum + m.result, 0),
count: measurements.filter((m) => m.type === "count").reduce((sum, m) => sum + m.result, 0),
};
}, [measurements]);

const activeGroup = groups.find((g) => g.id === activeGroupId) || null;

const sortedGroups = useMemo(() => {
return [...groups].sort((a, b) => a.sortOrder - b.sortOrder);
}, [groups]);

const pageList = useMemo(() => {
return Array.from({ length: numPages }, (_, i) => i + 1);
}, [numPages]);

useEffect(() => {
if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);

setSaveStatus("saving");

saveTimeoutRef.current = setTimeout(async () => {
  try {
    const groupTotalsMap: Record<
      string,
      {
        line_ft: number;
        area_ft2: number;
        volume_yd3: number;
        count_ea: number;
      }
    > = {};

    groups.forEach((group) => {
      const totals = getGroupTotals(group.id);
      groupTotalsMap[group.id] = {
        line_ft: totals.line,
        area_ft2: totals.area,
        volume_yd3: totals.volume,
        count_ea: totals.count,
      };
    });

    localStorage.setItem("takeoff_group_totals", JSON.stringify(groupTotalsMap));

    const groupsMetadata = groups.map((g) => ({
      id: g.id,
      name: g.name,
      color: g.color,
      visible: g.visible,
    }));
    localStorage.setItem("takeoff_groups", JSON.stringify(groupsMetadata));

    if (activeProjectId && measurements.length > 0) {
      await saveMeasurementsToDB(activeProjectId, sessionId, measurements, groups);
    }

    setSaveStatus("saved");
  } catch (err) {
    console.error("Save failed:", err);
    setSaveStatus("error");
  }
}, 400);

return () => {
  if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
};

}, [measurements, groups, activeProjectId, sessionId]);

useEffect(() => {
if (!sessionId || !dbLoaded) return;

const calibrationData = feetPerPixel
  ? {
      isCalibrated: true,
      point1: calPoints[0] || null,
      point2: calPoints[1] || null,
      realDistance: 0,
      unit: "ft" as const,
      pixelsPerUnit: 1 / (feetPerPixel || 1),
    }
  : null;

saveTakeoffDebounced(
  sessionId,
  {
    groups: groups.map((g) => ({
      ...g,
      locked: false,
      trade: undefined,
    })),
    measurements,
    calibration: calibrationData,
  },
  800
);

return () => {
  cancelPendingSave();
};

}, [sessionId, measurements, groups, feetPerPixel, dbLoaded, calPoints]);

const activeGroupMeasurements = activeGroupId
? measurements.filter((m) => m.groupId === activeGroupId)
: measurements;

const sidebarToolHint =
tool === "line"
? "Click 2 points to measure. Third click starts a new line."
: tool === "area"
? "Click to add vertices. Double-click or press Enter to finish."
: tool === "count"
? "Click to place count markers."
: tool === "volume"
? "Click to add vertices, finish shape, then enter depth."
: "Select mode. Hold Space or use middle mouse button to pan.";

return (
<div className="h-[calc(100vh-2rem)] min-h-[760px] bg-slate-950 text-slate-100">
<ScaleModal
open={scaleModalOpen}
onClose={onCalibrationCancel}
onApply={applyScaleFromModal}
canApply={calPoints && calPoints.length === 2}
isCalibrating={isCalibrating}
calibPointsCount={calibPoints.length}
canConfirmCalibration={canConfirmCalibration}
onCalibrationOk={handleCalibrationOk}
onCalibrationCancel={onCalibrationCancel}
/>

  <div className="flex h-full flex-col gap-3 p-4">
    <div className={`${getPanelClass()} flex shrink-0 items-center justify-between px-4 py-3`}>
      <div className="flex min-w-0 items-center gap-4">
        <div className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2">
          <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Workspace</div>
          <div className="text-sm font-semibold">Takeoff</div>
        </div>

        {routeProjectId ? (
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Project Context</div>
            <div className="truncate text-sm font-medium">
              {currentProject?.name || `Project ${routeProjectId}`}
            </div>
            <div className="truncate text-xs text-slate-400">Project ID: {routeProjectId}</div>
          </div>
        ) : (
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-[0.18em] text-amber-500">Global Mode</div>
            <div className="text-sm font-medium text-amber-300">No project context selected</div>
            <div className="text-xs text-amber-400/70">
              Open takeoff from a project dashboard for project-linked measurements.
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        <div
          className={`rounded-xl border px-3 py-2 text-xs font-medium ${
            saveStatus === "saved"
              ? "border-emerald-900/30 bg-emerald-900/20 text-emerald-300"
              : saveStatus === "saving"
              ? "border-slate-700 bg-slate-800/50 text-slate-300"
              : "border-red-900/30 bg-red-900/20 text-red-300"
          }`}
        >
          {saveStatus === "saved" ? "Saved ✓" : saveStatus === "saving" ? "Saving…" : "Save failed"}
        </div>

        {routeProjectId && (
          <button
            onClick={() => nav(`/projects/${routeProjectId}`)}
            className="rounded-xl border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm hover:bg-slate-800"
          >
            Back to Project
          </button>
        )}
      </div>
    </div>

    <div className={`${getPanelClass()} shrink-0 px-4 py-3`}>
      <div className="flex flex-wrap items-center gap-2">
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm hover:bg-slate-800">
          <span>Upload PDF</span>
          <input
            type="file"
            accept="application/pdf,.pdf"
            className="hidden"
            onChange={(e) => onPickFile(e.target.files?.[0] ?? null)}
          />
        </label>

        <button
          onClick={() => {
            setTool("select");
            resetDraftToolState();
          }}
          className={getToolButtonClass(tool === "select")}
        >
          Select
        </button>

        <button
          onClick={() => {
            setTool("line");
            resetDraftToolState();
          }}
          className={getToolButtonClass(tool === "line")}
        >
          Line
        </button>

        <button
          onClick={() => {
            setTool("area");
            resetDraftToolState();
          }}
          className={getToolButtonClass(tool === "area")}
        >
          Area
        </button>

        <button
          onClick={() => {
            setTool("count");
            resetDraftToolState();
          }}
          className={getToolButtonClass(tool === "count")}
        >
          Count
        </button>

        <button
          onClick={() => {
            setTool("volume");
            resetDraftToolState();
          }}
          className={getToolButtonClass(tool === "volume")}
        >
          Volume
        </button>

        <div className="mx-1 h-8 w-px bg-slate-800" />

        <button
          onClick={startCalibrate}
          disabled={!pdf}
          className="rounded-xl border border-emerald-900/40 bg-emerald-900/25 px-3 py-2 text-sm hover:bg-emerald-900/40 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Calibrate Scale
        </button>

        <button
          onClick={exportToCSV}
          disabled={!pdf}
          className="rounded-xl border border-blue-900/40 bg-blue-900/25 px-3 py-2 text-sm hover:bg-blue-900/40 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Export CSV
        </button>

        <button
          onClick={async () => {
            if (!pdf) return;
            fitScaleRef.current = null;
            const fit = await computeFitScale();
            if (fit != null) {
              fitScaleRef.current = fit;
              const page = await pdf.getPage(pageNumber);
              const v = page.getViewport({ scale: 1 });
              const viewer = viewerRef.current;
              if (viewer) {
                panZoom.fitToView(v.width, v.height, viewer.clientWidth, viewer.clientHeight);
              }
            }
          }}
          disabled={!pdf}
          className="rounded-xl border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Fit
        </button>

        <div className="mx-1 h-8 w-px bg-slate-800" />

        <button
          onClick={prevPage}
          disabled={!pdf || pageNumber <= 1}
          className="rounded-xl border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Prev
        </button>

        <div className="rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm">
          Page {pageNumber} / {numPages || 0}
        </div>

        <button
          onClick={nextPage}
          disabled={!pdf || pageNumber >= numPages}
          className="rounded-xl border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Next
        </button>

        <div className="ml-auto flex items-center gap-2">
          <div className="rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-300">
            Zoom {Math.round(panZoom.zoom * 100)}%
          </div>
          {feetPerPixel ? (
            <div className="rounded-xl border border-emerald-900/40 bg-emerald-950/20 px-3 py-2 text-xs text-emerald-300">
              Scale set: {feetPerPixel.toFixed(4)} ft / px
            </div>
          ) : (
            <div className="rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-400">
              Scale not set
            </div>
          )}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-400">
        <div className="rounded-lg border border-slate-800 bg-slate-950 px-2 py-1">
          {sidebarToolHint}
        </div>
        {measurements.length > 0 && (
          <div className="rounded-lg border border-emerald-900/40 bg-emerald-950/20 px-2 py-1 text-emerald-300">
            {measurements.length} measurement{measurements.length === 1 ? "" : "s"}
          </div>
        )}
        {activeGroup && (
          <div className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-950 px-2 py-1">
            <span>Active Group:</span>
            <span
              className="inline-block h-3 w-3 rounded-full"
              style={{ backgroundColor: activeGroup.color }}
            />
            <span className="text-slate-200">{activeGroup.name}</span>
          </div>
        )}
      </div>
    </div>

    {showDepthPrompt && (
      <div className={`${getPanelClass()} shrink-0 border-emerald-900/40 bg-emerald-950/20 p-4`}>
        <div className="mb-2 text-sm font-semibold text-emerald-200">Enter Depth</div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="number"
            value={depthInput}
            onChange={(e) => setDepthInput(e.target.value)}
            className="w-28 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
            placeholder="4"
            autoFocus
          />
          <span className="text-sm text-slate-300">inches</span>
          <button
            onClick={confirmVolumeWithDepth}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium hover:bg-emerald-700"
          >
            Confirm
          </button>
          <button
            onClick={() => {
              setShowDepthPrompt(false);
              setVolumePoints([]);
              setVolumeHoverPt(null);
            }}
            className="rounded-lg bg-slate-700 px-4 py-2 text-sm hover:bg-slate-600"
          >
            Cancel
          </button>
        </div>
      </div>
    )}

    {error && (
      <div className={`${getPanelClass()} shrink-0 border-red-900/40 bg-red-950/20 p-3 text-sm text-red-200`}>
        {error}
      </div>
    )}

    {loadingPdf && (
      <div className="shrink-0 px-1 text-sm text-slate-400">Loading PDF…</div>
    )}

    <div className="grid min-h-0 flex-1 grid-cols-[260px_minmax(0,1fr)_360px] gap-3">
      <div className={`${getPanelClass()} min-h-0 overflow-hidden`}>
        <div className="border-b border-slate-800 px-4 py-3">
          <div className="text-sm font-semibold">Sheets & Navigation</div>
          <div className="text-xs text-slate-400">Page list, sheet jump, and drawing navigation</div>
        </div>

        <div className="flex h-full min-h-0 flex-col">
          <div className="border-b border-slate-800 px-4 py-3">
            <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
              <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Drawing Status</div>
              <div className="mt-2 text-sm text-slate-300">
                {pdf ? "PDF loaded and ready for takeoff" : "No drawing loaded yet"}
              </div>
              <div className="mt-2 text-xs text-slate-400">
                {pdf
                  ? `Page ${pageNumber} of ${numPages}`
                  : "Upload a PDF from the top ribbon to begin."}
              </div>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            <div className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Pages
            </div>

            {pdf ? (
              <div className="space-y-2">
                {pageList.map((page) => (
                  <button
                    key={page}
                    onClick={() => goToPage(page)}
                    className={`w-full rounded-xl border p-3 text-left transition ${
                      page === pageNumber
                        ? "border-blue-800 bg-blue-950/30"
                        : "border-slate-800 bg-slate-950 hover:bg-slate-900"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm font-medium">Sheet {page}</div>
                        <div className="text-xs text-slate-400">
                          {page === pageNumber ? "Current page" : "Jump to page"}
                        </div>
                      </div>
                      <div className="rounded-lg border border-slate-800 bg-slate-900 px-2 py-1 text-xs text-slate-300">
                        {page}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-slate-800 bg-slate-950 p-4 text-sm text-slate-500">
                No pages available until a PDF is uploaded.
              </div>
            )}

            <div className="mt-5">
              <div className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                Navigation Help
              </div>
              <div className="space-y-2 rounded-xl border border-slate-800 bg-slate-950 p-3 text-xs text-slate-400">
                <div>• Ctrl + wheel = zoom to cursor</div>
                <div>• Hold Space + drag = pan</div>
                <div>• Middle mouse button = pan</div>
                <div>• Enter = finish area/volume polygon</div>
                <div>• Esc = cancel active drawing input</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className={`${getPanelClass()} min-h-0 overflow-hidden`}>
        <div className="border-b border-slate-800 px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold">Drawing Workspace</div>
              <div className="text-xs text-slate-400">
                Professional takeoff canvas with pan, zoom, calibration, and overlays
              </div>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-300">
              {tool.toUpperCase()}
            </div>
          </div>
        </div>

        <div className="h-[calc(100%-64px)] min-h-0 p-3">
          {pdf ? (
            <div
              ref={viewerRef}
              onPointerDown={onViewerPointerDown}
              onPointerMove={onViewerPointerMove}
              onPointerUp={onViewerPointerUp}
              onPointerLeave={onViewerPointerLeave}
              onWheel={onViewerWheel}
              onMouseEnter={() => setOverViewer(true)}
              onMouseLeave={() => setOverViewer(false)}
              className="relative h-full overflow-hidden rounded-2xl border border-slate-800 bg-slate-950"
              style={{ touchAction: "none", cursor: "default" }}
            >
              <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-center justify-between bg-gradient-to-b from-slate-950/95 to-transparent px-4 py-3">
                <div className="rounded-lg border border-slate-800 bg-slate-950/90 px-3 py-1 text-xs text-slate-300">
                  Sheet {pageNumber} / {numPages}
                </div>
                <div className="rounded-lg border border-slate-800 bg-slate-950/90 px-3 py-1 text-xs text-slate-300">
                  Zoom {Math.round(panZoom.zoom * 100)}%
                </div>
              </div>

              <div className="h-full w-full overflow-hidden p-3">
                <div
                  style={{
                    display: "inline-block",
                    transform: `translate(${panZoom.panX}px, ${panZoom.panY}px)`,
                  }}
                >
                  <canvas
                    ref={canvasRef}
                    onClick={onCanvasClick}
                    onDoubleClick={onCanvasDoubleClick}
                    onMouseMove={onCanvasMove}
                    className={
                      calibrating || isPanningRef.current
                        ? "cursor-crosshair"
                        : tool === "line" || tool === "area" || tool === "count" || tool === "volume"
                        ? "cursor-crosshair"
                        : "cursor-default"
                    }
                    style={{ userSelect: "none" }}
                  />

                  <MeasurementLayer
                    measurements={visibleMeasurements}
                    scale={panZoom.zoom}
                    offsetX={0}
                    offsetY={0}
                    width={canvasWidth}
                    height={canvasHeight}
                    onMeasurementClick={(id) => {
                      console.log("Clicked measurement:", id);
                    }}
                  />
                </div>
              </div>

              <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-slate-950/95 to-transparent px-4 py-3">
                <div className="rounded-lg border border-slate-800 bg-slate-950/90 px-3 py-2 text-xs text-slate-400">
                  {isCalibrating
                    ? `Calibration mode: click 2 points on drawing (${calibPoints.length}/2).`
                    : "Ready for takeoff. Calibrate the drawing before measuring for real-world quantities."}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-slate-800 bg-slate-950 text-slate-500">
              Upload a PDF drawing to begin.
            </div>
          )}
        </div>
      </div>

      <div className={`${getPanelClass()} min-h-0 overflow-hidden`}>
        <div className="border-b border-slate-800 px-4 py-3">
          <div className="text-sm font-semibold">Groups, Totals & Measurements</div>
          <div className="text-xs text-slate-400">
            Organize takeoff by trade, review totals, and manage measured items
          </div>
        </div>

        <div className="flex h-full min-h-0 flex-col">
          <div className="border-b border-slate-800 p-4">
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
                <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Line</div>
                <div className="mt-1 text-lg font-semibold">{overallTotals.line.toFixed(2)}</div>
                <div className="text-xs text-slate-400">ft</div>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
                <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Area</div>
                <div className="mt-1 text-lg font-semibold">{overallTotals.area.toFixed(2)}</div>
                <div className="text-xs text-slate-400">ft²</div>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
                <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Volume</div>
                <div className="mt-1 text-lg font-semibold">{overallTotals.volume.toFixed(2)}</div>
                <div className="text-xs text-slate-400">yd³</div>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
                <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Count</div>
                <div className="mt-1 text-lg font-semibold">{overallTotals.count.toFixed(0)}</div>
                <div className="text-xs text-slate-400">ea</div>
              </div>
            </div>

            {groups.length > 0 && (
              <div className="mt-3 flex items-center gap-2">
                <label className="text-sm text-slate-400">Active Group:</label>
                <select
                  value={activeGroupId || ""}
                  onChange={(e) => setActiveGroupId(e.target.value || null)}
                  className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
                >
                  <option value="">None</option>
                  {sortedGroups.map((group) => (
                    <option key={group.id} value={group.id}>
                      {group.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            <div className="mb-5">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold">Groups</div>
                  <div className="text-xs text-slate-400">
                    Control visibility and assign measurements by trade
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                {sortedGroups.map((group) => {
                  const totals = getGroupTotals(group.id);
                  const hasData =
                    totals.line > 0 || totals.area > 0 || totals.volume > 0 || totals.count > 0;
                  const groupMeasurements = measurements.filter((m) => m.groupId === group.id);

                  return (
                    <div
                      key={group.id}
                      className={`rounded-xl border p-3 transition ${
                        activeGroupId === group.id
                          ? "border-slate-700 bg-slate-800/50"
                          : "border-slate-800 bg-slate-950 hover:bg-slate-900"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => toggleGroupVisibility(group.id)}
                          className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded hover:bg-slate-700"
                        >
                          {group.visible ? (
                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                              />
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                              />
                            </svg>
                          ) : (
                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
                              />
                            </svg>
                          )}
                        </button>

                        <span
                          className="h-3 w-3 flex-shrink-0 rounded-full"
                          style={{ backgroundColor: group.color }}
                        />

                        <button
                          onClick={() => setActiveGroupId(group.id)}
                          className="min-w-0 flex-1 truncate text-left text-sm font-medium"
                        >
                          {group.name}
                        </button>

                        {groupMeasurements.length > 0 && (
                          <div className="rounded-full bg-slate-700/50 px-2 py-0.5 text-xs text-slate-300">
                            {groupMeasurements.length}
                          </div>
                        )}

                        <button
                          onClick={() => deleteGroup(group.id)}
                          className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded text-slate-400 hover:bg-red-900/30 hover:text-red-400"
                        >
                          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M6 18L18 6M6 6l12 12"
                            />
                          </svg>
                        </button>
                      </div>

                      {hasData && (
                        <div className="mt-3 grid grid-cols-2 gap-2 border-t border-slate-700/50 pt-3 text-xs">
                          {totals.line > 0 && (
                            <div className="rounded-lg border border-slate-800 bg-slate-900/50 px-2 py-2">
                              <div className="text-slate-500">Line</div>
                              <div className="font-mono text-slate-200">{totals.line.toFixed(2)} ft</div>
                            </div>
                          )}
                          {totals.area > 0 && (
                            <div className="rounded-lg border border-slate-800 bg-slate-900/50 px-2 py-2">
                              <div className="text-slate-500">Area</div>
                              <div className="font-mono text-slate-200">{totals.area.toFixed(2)} ft²</div>
                            </div>
                          )}
                          {totals.volume > 0 && (
                            <div className="rounded-lg border border-slate-800 bg-slate-900/50 px-2 py-2">
                              <div className="text-slate-500">Volume</div>
                              <div className="font-mono text-slate-200">{totals.volume.toFixed(2)} yd³</div>
                            </div>
                          )}
                          {totals.count > 0 && (
                            <div className="rounded-lg border border-slate-800 bg-slate-900/50 px-2 py-2">
                              <div className="text-slate-500">Count</div>
                              <div className="font-mono text-slate-200">{totals.count} ea</div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="mt-3 border-t border-slate-800 pt-3">
                {showNewGroupForm ? (
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={newGroupName}
                      onChange={(e) => setNewGroupName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") addNewGroup();
                        if (e.key === "Escape") {
                          setShowNewGroupForm(false);
                          setNewGroupName("");
                        }
                      }}
                      placeholder="Group name"
                      className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
                      autoFocus
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={addNewGroup}
                        className="flex-1 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium hover:bg-emerald-700"
                      >
                        Add
                      </button>
                      <button
                        onClick={() => {
                          setShowNewGroupForm(false);
                          setNewGroupName("");
                        }}
                        className="flex-1 rounded-lg bg-slate-700 px-3 py-2 text-sm hover:bg-slate-600"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowNewGroupForm(true)}
                    className="flex w-full items-center justify-center gap-2 rounded-lg bg-slate-800 px-3 py-2 text-sm hover:bg-slate-700"
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    New Group
                  </button>
                )}
              </div>
            </div>

            <div>
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold">Measurements</div>
                  <div className="text-xs text-slate-400">
                    {activeGroup
                      ? `Showing ${activeGroup.name} measurements`
                      : "Showing all measurements"}
                  </div>
                </div>
                <div className="rounded-lg border border-slate-800 bg-slate-950 px-2 py-1 text-xs text-slate-300">
                  {activeGroupMeasurements.length}
                </div>
              </div>

              <div className="space-y-2">
                {activeGroupMeasurements.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-800 bg-slate-950 p-4 text-sm text-slate-500">
                    No measurements yet for this view.
                  </div>
                ) : (
                  activeGroupMeasurements.map((m) => (
                    <div key={m.id} className="rounded-xl border border-slate-800 bg-slate-950 p-3">
                      <div className="flex items-start gap-3">
                        <span
                          className="mt-1 h-3 w-3 flex-shrink-0 rounded-full"
                          style={{ backgroundColor: m.color || "#94a3b8" }}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium">
                            {m.label || `${m.type} measurement`}
                          </div>
                          <div className="mt-1 text-xs text-slate-400">
                            Type: {m.type} • Result: {m.result.toFixed(2)} {m.unit}
                          </div>
                          {m.groupId && (
                            <div className="mt-1 text-xs text-slate-500">
                              Group: {groups.find((g) => g.id === m.groupId)?.name || "Unknown"}
                            </div>
                          )}
                        </div>
                        <button
                          onClick={() => removeMeasurement(m.id)}
                          className="rounded-lg px-2 py-1 text-xs text-slate-400 hover:bg-red-900/30 hover:text-red-300"
                        >
                          Delete
                        </button>
                      </div>

                      <div className="mt-3 flex items-center gap-2">
                        <select
                          value={m.groupId || ""}
                          onChange={(e) => changeMeasurementGroup(m.id, e.target.value || null)}
                          className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-900 px-2 py-2 text-xs"
                        >
                          <option value="">Ungrouped</option>
                          {sortedGroups.map((g) => (
                            <option key={g.id} value={g.id}>
                              {g.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  ))
                )}

                {measurements.filter((m) => !m.groupId).length > 0 && !activeGroupId && (
                  <div className="mt-4 border-t border-slate-800 pt-4">
                    <div className="mb-2 text-xs font-semibold text-slate-400">
                      Ungrouped Measurements
                    </div>
                    <div className="space-y-2">
                      {measurements
                        .filter((m) => !m.groupId)
                        .map((m) => (
                          <div key={m.id} className="rounded-lg bg-slate-900/40 p-2 text-xs">
                            <div className="font-medium">{m.label || `${m.type} measurement`}</div>
                            <div className="text-slate-400">
                              {m.result.toFixed(2)} {m.unit}
                            </div>
                          </div>
                        ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <PaywallModal
      isOpen={showPaywall}
      onClose={() => setShowPaywall(false)}
      featureName={paywallFeature}
    />
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