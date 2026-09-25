// src/pages/TakeoffPage.tsx — Magnus Boys Takeoff v4
// PlanSwift-inspired layout: left toolbar, canvas center, right panel
// Fixed: single-canvas rendering, correct pan/zoom coords, assembly templates

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import workerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { supabase } from "../lib/supabase";
import { useProjectContext } from "../context/ProjectContext";
import CollapsibleSection from "../components/common/CollapsibleSection";
import {
  Upload, Ruler, Download, FileText, X, ChevronLeft, ChevronRight,
  ZoomIn, ZoomOut, Maximize2, Trash2, Hash, Square, Box,
  AlertCircle, RefreshCw, Send, MousePointer, Plus, Check,
  Crosshair, Package, Layers, BarChart2, ChevronRight as Arrow,
  BookOpen, Wand2, Eye, EyeOff, Edit2, Flag, Minimize2, Waypoints
} from "lucide-react";

GlobalWorkerOptions.workerSrc = workerSrc;

// --- Types --------------------------------------------------------------------
type Point = { x: number; y: number };
type ToolMode = "select" | "pan" | "line" | "area" | "count" | "volume" | "wall" | "perimeter";

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
  wallLength?: number;
  wallHeight?: number;
  // Perpendicular distance (PDF-space units, signed) the "offset dimension line" is shifted from the true
  // measured line — an architectural-style dimension line, parallel to the real geometry, that the label
  // renders against. Absent/zero = default rendering, identical to before this existed. Line measurements
  // only for now. See drawAllWithPdf and the select-tool drag in onMouseDown/onMouseMove.
  dimensionOffset?: number;
  // Purely a display toggle: when true, drawAllWithPdf skips drawing this measurement entirely (geometry,
  // label, dots — everything), but it still counts in sendToBOQ() and the Summary tab's stats, still shows
  // (dimmed) in the Taken list, and can still be selected/deleted normally. Absent/false = draws as always.
  hidden?: boolean;
  // Batch mode: measurements finished while the same batch was active for their tool share one batchId (and
  // one colour). Each is otherwise a completely ordinary, independent measurement. Persisted in meta.batch_id.
  batchId?: string;
  // Volume only: the depth (inches) this shape was computed with. Persisted in meta.depth_in.
  depthIn?: number;
}

// The batch currently open for a tool (in memory only — a page reload ends any open batch, its members keep
// their batchId and stay grouped). depthIn is the volume batch's depth, entered once at its first shape.
interface ActiveBatch { id: string; color: string; depthIn?: number; }
const BATCH_TOOLS: ToolMode[] = ["line", "perimeter", "wall", "area", "volume", "count"];
const BATCH_LABEL: Partial<Record<ToolMode, string>> = { line: "Line", perimeter: "Perimeter", wall: "Wall", area: "Area", volume: "Volume", count: "Count" };

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
  coverage_factor?: number | null;
  coverage_unit?: string | null;
}

// --- Constants ----------------------------------------------------------------
// Rows shown per library section before "Show more".
const LIB_PAGE = 20;

// One screen-pixel radius for "grab / snap onto a point": divide by zoom for PDF units. 24 is a fingertip/stylus-friendly
// size (well above the 9px vertex squares). Used for the offset-dimension-line grab, the perimeter/area/volume
// auto-close-near-start, and the per-vertex hit-test for edit mode. (The smaller 12/zoom body-select and 10/zoom snap
// tolerances are deliberately different: they are about a line under the cursor, not a handle to pick up.)
const GRAB_TOL_PX = 24;
// Edit mode: a press on a vertex only becomes a drag once the pointer has moved this many SCREEN px; less than that
// is a tap ("select this vertex"), so a slightly shaky tap never nudges the geometry.
const VERTEX_DRAG_THRESHOLD_PX = 6;
// Edit mode "+" (add-a-node) handle at a segment midpoint: a smaller grab radius than a vertex (24), so on short
// segments the vertex still wins nearby; when both are in range the CLOSER one wins.
const MIDPOINT_TOL_PX = 16;
// Edit mode delete affordance: a small "x" disc drawn this many screen px up-and-right of the selected vertex (below
// it if the vertex is near the top edge), and how close a press must be to its centre to count as hitting it.
const DELETE_HANDLE_OFFSET_PX = 24;
const DELETE_HANDLE_HIT_PX = 16;

// PostgREST returns at most 1000 rows per response (its max-rows cap, by default), so a table that can grow past
// that is read in windows until an empty page comes back. Each window advances by the rows actually received, so a
// server cap below the requested window size cannot skip rows. Callers order by a unique column last (id) so equal
// values cannot shift between windows. An error part-way keeps what already loaded.
async function fetchAllWindows<T>(label: string, page: (from: number, to: number) => PromiseLike<{ data: any[] | null; error: any }>): Promise<T[]> {
  const WINDOW = 1000;
  let all: T[] = [];
  let from = 0;
  for (let guard = 0; guard < 200; guard++) {
    const { data, error } = await page(from, from + WINDOW - 1);
    if (error) { console.error(label + " load failed at row " + from + ":", error); break; }
    const rows = (data || []) as T[];
    if (rows.length === 0) break;
    all = all.concat(rows);
    from += rows.length;
  }
  return all;
}

// The Rate Library, read directly from cost_items (RLS applies to the table itself).
function fetchAllCostItems(): Promise<CostItem[]> {
  return fetchAllWindows<CostItem>("cost_items", (a, b) => supabase.from("cost_items")
    .select("id,item_name,unit,category,coverage_factor,coverage_unit").eq("is_active", true)
    .order("item_name").order("id").range(a, b));
}

// Remembered layout preferences (localStorage). Every access is wrapped: on any failure nothing is remembered and
// the defaults apply.
const LS_RIGHT = "takeoff_right_panel_collapsed";
const LS_RIGHT_TABLET = "takeoff_right_panel_collapsed_tablet";
const LS_FOCUS = "takeoff_focus_mode";
function readBool(key: string): boolean | null {
  try {
    const v = window.localStorage.getItem(key);
    return v === "1" ? true : v === "0" ? false : null;
  } catch { return null; }
}
function writeBool(key: string, value: boolean) {
  try { window.localStorage.setItem(key, value ? "1" : "0"); } catch { /* remembering is a convenience only */ }
}

const TOOL_CFG: Record<ToolMode, { label: string; shortcut: string; color: string; desc: string; icon: React.ReactNode }> = {
  select: { label: "Select",  shortcut: "S", color: "#94a3b8", desc: "Click to select. Space+drag to pan.",    icon: <MousePointer size={16}/> },
  pan:    { label: "Pan",     shortcut: "P", color: "#64748b", desc: "Click and drag to pan the view.",       icon: <span style={{fontSize:16}}>?</span> },
  line:   { label: "Linear",  shortcut: "L", color: "#38bdf8", desc: "Click start ? click end to measure.",    icon: <Ruler size={16}/> },
  area:   { label: "Area",    shortcut: "A", color: "#a78bfa", desc: "Click corners. Double-click to close.",  icon: <Square size={16}/> },
  count:  { label: "Count",   shortcut: "C", color: "#fb923c", desc: "Click to place markers.",                icon: <Hash size={16}/> },
  volume: { label: "Volume",  shortcut: "V", color: "#34d399", desc: "Trace base. Double-click ? enter depth.", icon: <Box size={16}/> },
  wall:   { label: "Wall",    shortcut: "W", color: "#f472b6", desc: "Draw wall line, then enter height.",     icon: <Layers size={16}/> },
  perimeter: { label: "Perimeter", shortcut: "—", color: "#22d3ee", desc: "Click to trace a path. Double-click to finish.", icon: <Waypoints size={16}/> },
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
// Combined total for a batch's members: count reads as a whole number, linear as feet-inches, the rest as number + unit.
function fmtBatchTotal(unit: string, total: number): string {
  if (unit === "ea") return `${Math.round(total)} ea`;
  return unit === "ft" ? feetInches(total) : `${fmt2(total)} ${unit}`;
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
// Ray-casting point-in-polygon (the ring is implicitly closed last -> first, as area/volume shapes are).
function pointInPolygon(p: Point, pts: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i], b = pts[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

// Edit mode: which vertex of ONE measurement's points (if any) is under p. Nearest wins when several are within
// GRAB_TOL_PX (screen px, so divided by zoom). Returns the index into points, or null. Pure — takes the points of
// the measurement being edited only, never other measurements. (An auto-closed perimeter stores its first point
// again as its last; on an exact tie the lower index wins, so step 2 must treat that pair as one node.)
function hitTestVertex(points: Point[], p: Point, zoom: number): number | null {
  const tol = GRAB_TOL_PX / zoom;
  let best = -1, bestD = Infinity;
  for (let i = 0; i < points.length; i++) {
    const d = dist(p, points[i]);
    if (d < tol && d < bestD) { best = i; bestD = d; }
  }
  return best < 0 ? null : best;
}

// The "size" of a measurement's geometry that its result is proportional to: a line's length, a perimeter's or
// wall's summed segment length, an area's or volume's polygon area (volume = area x a fixed depth).
function measureGeometry(type: ToolMode, pts: Point[]): number {
  if (type === "line") return pts.length >= 2 ? dist(pts[0], pts[1]) : 0;
  if (type === "area" || type === "volume") return polyArea(pts);
  if (type === "perimeter" || type === "wall") { let sum = 0; for (let i = 0; i < pts.length - 1; i++) sum += dist(pts[i], pts[i+1]); return sum; }
  return 0;
}

// What an edit changes on a measurement. rescaled=false means "could not rescale, result left as it was".
interface RecomputePatch { result: number; wallLength?: number; label?: string; rescaled: boolean; }

// After a measurement's points change (m.points -> newPoints): rescale the old result by new geometry / old geometry,
// rather than recomputing from calibration or wall height / volume depth — those aren't reliably stored (walls drawn
// before wallLength/wallHeight were saved, and older volumes, lack them), and rescaling keeps the scale it was drawn at.
// Count is a recount (result = number of markers). If the OLD geometry is zero (or non-finite) there is nothing to
// scale from: the result is returned unchanged with rescaled=false so the caller can decide. Pure.
function recompute(m: Measurement, newPoints: Point[]): RecomputePatch {
  if (m.type === "count") return { result: newPoints.length, rescaled: true };
  const oldG = measureGeometry(m.type, m.points), newG = measureGeometry(m.type, newPoints);
  if (!(oldG > 0) || !Number.isFinite(oldG) || !Number.isFinite(newG)) return { result: m.result, rescaled: false };
  const ratio = newG / oldG;
  const patch: RecomputePatch = { result: m.result * ratio, rescaled: true };
  if (m.type === "wall" && typeof m.wallLength === "number") {
    patch.wallLength = m.wallLength * ratio;
    // The wall's caption ("X long x Y high") is stored text; only regenerate it when the height is known too.
    if (typeof m.wallHeight === "number") patch.label = `${feetInches(patch.wallLength)} long x ${feetInches(m.wallHeight)} high`;
  }
  return patch;
}

// An auto-closed perimeter stores its first point again as its last; the two are one physical point.
function isClosedPerimeter(pts: Point[]): boolean { return pts.length >= 4 && dist(pts[0], pts[pts.length - 1]) < 1e-6; }

// Edit mode: what a press at p would grab on ONE measurement — a vertex (index into points), or the "+" handle at a
// segment midpoint (at = the index the new point would be spliced in at, i.e. between points[at-1] and points[at % n]).
// Multi-point types only (perimeter/wall/area/volume; area/volume include the closing edge, whose insertion index is
// n, i.e. appended). For a closed perimeter the last real point -> repeated first point segment inserts BEFORE the
// repeat, so the shape stays closed. Vertex within GRAB_TOL_PX, "+" within MIDPOINT_TOL_PX; if both are in range the
// closer wins (a tie goes to the vertex).
function hitTestEditTarget(m: { type: ToolMode; points: Point[] }, p: Point, zoom: number): { kind: "vertex"; index: number } | { kind: "mid"; at: number } | null {
  const pts = m.points, n = pts.length;
  const vIdx = hitTestVertex(pts, p, zoom);
  const vDist = vIdx === null ? Infinity : dist(p, pts[vIdx]);
  let mAt = -1, mDist = Infinity;
  if (m.type === "perimeter" || m.type === "wall" || m.type === "area" || m.type === "volume") {
    const tol = MIDPOINT_TOL_PX / zoom;
    const segCount = (m.type === "area" || m.type === "volume") ? n : n - 1;
    for (let i = 0; i < segCount; i++) {
      const a = pts[i], b = pts[(i + 1) % n];
      const d = dist(p, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
      if (d < tol && d < mDist) { mAt = i + 1; mDist = d; }
    }
  }
  if (vIdx !== null && (mAt < 0 || vDist <= mDist)) return { kind: "vertex", index: vIdx };
  if (mAt >= 0) return { kind: "mid", at: mAt };
  return null;
}

// May vertex idx of this measurement be deleted? A line never (always exactly 2 points). Open perimeter / wall need 2
// points left, so 3+ to delete one. Area / volume need 3 left. A closed perimeter needs 3 DISTINCT points left
// (its stored array has one more, the repeated first). A count marker may go while at least one remains.
function canDeleteVertex(m: { type: ToolMode; points: Point[] }, idx: number): boolean {
  const n = m.points.length;
  if (!(idx >= 0 && idx < n)) return false;
  if (m.type === "line") return false;
  if (m.type === "count") return n >= 2;
  if (m.type === "perimeter") return isClosedPerimeter(m.points) ? n - 1 >= 4 : n >= 3;
  if (m.type === "wall") return n >= 3;
  if (m.type === "area" || m.type === "volume") return n >= 4;
  return false;
}

// The points left after deleting vertex idx (callers check canDeleteVertex first). Deleting the SHARED start/end of a
// closed perimeter drops both copies and closes the loop on the next point instead, so the shape stays validly closed.
function pointsAfterDelete(m: { type: ToolMode; points: Point[] }, idx: number): Point[] {
  const pts = m.points;
  if (m.type === "perimeter" && isClosedPerimeter(pts) && (idx === 0 || idx === pts.length - 1)) {
    return [...pts.slice(1, pts.length - 1), pts[1]];
  }
  return pts.filter((_, i) => i !== idx);
}

// Where the delete "x" is drawn / hit for a vertex at canvas position cp.
function deleteHandlePos(cp: Point): Point {
  return { x: cp.x + DELETE_HANDLE_OFFSET_PX, y: cp.y < 40 ? cp.y + DELETE_HANDLE_OFFSET_PX : cp.y - DELETE_HANDLE_OFFSET_PX };
}

// Has an edit changed a result by more than floating-point noise? (Inserting a point on a straight segment re-sums the
// same length in two pieces and can differ in the last bits; that must not count as a change.)
function resultChanged(before: number, after: number): boolean { return Math.abs(after - before) > 1e-9 * Math.max(1, Math.abs(before)); }

function distToSeg(p: Point, a: Point, b: Point) {
  const A=p.x-a.x,B=p.y-a.y,C=b.x-a.x,D=b.y-a.y;
  const dot=A*C+B*D,len=C*C+D*D,t=len?clamp(dot/len,0,1):0;
  return Math.sqrt((p.x-a.x-t*C)**2+(p.y-a.y-t*D)**2);
}

// --- Error Boundary -----------------------------------------------------------
class ErrorBoundary extends React.Component<{children:React.ReactNode},{err:any}> {
  constructor(p:any){super(p);this.state={err:null};}
  static getDerivedStateFromError(e:any){return{err:e};}
  render(){
    if(this.state.err) return(
      <div className="min-h-screen bg-slate-50 dark:bg-[#080b10] flex items-center justify-center">
        <div className="text-center gap-3 flex flex-col items-center">
          <AlertCircle size={32} className="text-red-400"/>
          <p className="text-slate-700 dark:text-slate-300 text-sm">Takeoff crashed.</p>
          <button onClick={()=>window.location.reload()} className="px-4 py-2 rounded-lg bg-blue-600 text-white text-xs">Reload</button>
        </div>
      </div>
    );
    return this.props.children as any;
  }
}

// --- Mobile view ----------------------------------------------------------------
// Desktop stays the full draw-on-plan canvas tool. On mobile, precise finger-drawn
// measurements aren't realistic, so this trades drawing for: view the plan
// (native browser PDF pan/zoom via iframe), and manually record measurements taken
// on site with a tape measure — same Measurement shape, same save/BOQ pipeline.
const MOBILE_TYPE_CFG: { value: "line"|"area"|"count"|"volume"; label: string; unit: string }[] = [
  { value: "line",   label: "📏 Linear", unit: "m" },
  { value: "area",   label: "📐 Area",   unit: "m²" },
  { value: "count",  label: "🔢 Count",  unit: "nr" },
  { value: "volume", label: "📦 Volume", unit: "m³" },
];

function TakeoffMobileView({
  project,
  measurements,
  pdfUrl,
  costItems,
  onAddMeasurement,
  onDeleteMeasurement,
  onSendToBOQ,
}: {
  project: { name: string } | null | undefined;
  measurements: Measurement[];
  pdfUrl: string | null;
  costItems: CostItem[];
  onAddMeasurement: (m: Measurement) => void;
  onDeleteMeasurement: (id: string) => void;
  onSendToBOQ: () => void;
}) {
  const [activeTab, setActiveTab] = useState<"plan"|"measure"|"taken">(pdfUrl ? "plan" : "measure");
  const [form, setForm] = useState({
    type: "line" as "line"|"area"|"count"|"volume",
    value: "",   // linear: length · area: length · volume: length
    value2: "",  // area: width · volume: width
    value3: "",  // volume: depth
    label: "",
    unit: "m",
    itemName: "",
  });

  function handleAdd() {
    if (!form.value || !form.label) return;
    let result = Number(form.value) || 0;
    if (form.type === "area") result = result * (Number(form.value2) || 1);
    if (form.type === "volume") result = result * (Number(form.value2) || 1) * (Number(form.value3) || 1);

    const item = form.itemName.trim()
      ? costItems.find(i => i.item_name.toLowerCase() === form.itemName.trim().toLowerCase())
      : undefined;

    onAddMeasurement({
      id: uid(),
      type: form.type,
      points: [],
      result,
      unit: form.unit,
      label: form.label.trim(),
      color: nextColor(),
      linkedItemId: item?.id,
      linkedItemName: item?.item_name || form.itemName.trim() || undefined,
      timestamp: Date.now(),
    });
    setForm({ type: "line", value: "", value2: "", value3: "", label: "", unit: "m", itemName: "" });
    setActiveTab("taken");
  }

  return (
    <div className="flex flex-col h-screen bg-white dark:bg-slate-950">
      {/* Header */}
      <div className="flex-shrink-0 flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        <div>
          <h1 className="text-base font-bold text-slate-800 dark:text-slate-100">Takeoff</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">{project?.name || "No project"}</p>
        </div>
        <button onClick={onSendToBOQ} disabled={measurements.length === 0}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 text-white text-xs font-semibold transition-colors">
          Send to BOQ
        </button>
      </div>

      {/* Tab bar */}
      <div className="flex-shrink-0 flex border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        {[
          { key: "plan", label: "📐 Plan" },
          { key: "measure", label: "📏 Measure" },
          { key: "taken", label: `✅ Taken (${measurements.length})` },
        ].map(t => (
          <button key={t.key}
            onClick={() => setActiveTab(t.key as any)}
            className={`flex-1 py-3 text-xs font-semibold border-b-2 transition-colors ${
              activeTab === t.key
                ? "border-cyan-500 text-cyan-600 dark:text-cyan-400"
                : "border-transparent text-slate-500 dark:text-slate-400"
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">

        {/* Plan tab */}
        {activeTab === "plan" && (
          <div className="h-full flex flex-col">
            {!pdfUrl ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6">
                <FileText size={40} className="text-slate-300 dark:text-slate-700"/>
                <div className="text-sm font-semibold text-slate-600 dark:text-slate-300">No plan uploaded yet</div>
                <div className="text-xs text-slate-400 dark:text-slate-500 text-center">Upload a plan on desktop to view it here</div>
              </div>
            ) : (
              <div className="flex-1 bg-slate-100 dark:bg-slate-900 p-2">
                <iframe src={pdfUrl} className="w-full h-full rounded-lg border border-slate-200 dark:border-slate-700" title="Project Plan"/>
              </div>
            )}
          </div>
        )}

        {/* Measure tab */}
        {activeTab === "measure" && (
          <div className="h-full overflow-y-auto p-4 space-y-4">
            <div className="p-4 rounded-2xl bg-blue-50 dark:bg-blue-500/10 border border-blue-100 dark:border-blue-500/20 text-xs text-blue-600 dark:text-blue-400">
              💡 Use your tape measure on site, then enter the measurements here. They'll be added to your takeoff list and sent to the BOQ.
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">Measurement type</label>
              <div className="grid grid-cols-4 gap-2">
                {MOBILE_TYPE_CFG.map(t => (
                  <button key={t.value} type="button"
                    onClick={() => setForm(f => ({ ...f, type: t.value, unit: t.unit }))}
                    className={`py-2.5 rounded-xl text-xs font-semibold border-2 transition-colors text-center ${
                      form.type === t.value
                        ? "border-cyan-500 bg-cyan-50 dark:bg-cyan-500/10 text-cyan-600 dark:text-cyan-400"
                        : "border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400"
                    }`}>
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Description</label>
              <input type="text"
                value={form.label}
                onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
                placeholder="e.g. North wall, Column A, Foundation"
                className="w-full px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500/30"/>
            </div>

            {form.type === "line" && (
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Length (m)</label>
                <input type="number" min="0" step="0.01"
                  value={form.value}
                  onChange={e => setForm(f => ({ ...f, value: e.target.value }))}
                  placeholder="0.00"
                  className="w-full px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-semibold text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500/30"/>
              </div>
            )}
            {form.type === "area" && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Length (m)</label>
                  <input type="number" min="0" step="0.01"
                    value={form.value}
                    onChange={e => setForm(f => ({ ...f, value: e.target.value }))}
                    placeholder="0.00"
                    className="w-full px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-semibold text-slate-700 dark:text-slate-200 focus:outline-none"/>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Width (m)</label>
                  <input type="number" min="0" step="0.01"
                    value={form.value2}
                    onChange={e => setForm(f => ({ ...f, value2: e.target.value }))}
                    placeholder="0.00"
                    className="w-full px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-semibold text-slate-700 dark:text-slate-200 focus:outline-none"/>
                </div>
              </div>
            )}
            {form.type === "count" && (
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Count (number of items)</label>
                <input type="number" min="0" step="1"
                  value={form.value}
                  onChange={e => setForm(f => ({ ...f, value: e.target.value }))}
                  placeholder="0"
                  className="w-full px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-semibold text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500/30"/>
              </div>
            )}
            {form.type === "volume" && (
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Length (m)</label>
                  <input type="number" min="0" step="0.01"
                    value={form.value}
                    onChange={e => setForm(f => ({ ...f, value: e.target.value }))}
                    placeholder="0.00"
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 focus:outline-none"/>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Width (m)</label>
                  <input type="number" min="0" step="0.01"
                    value={form.value2}
                    onChange={e => setForm(f => ({ ...f, value2: e.target.value }))}
                    placeholder="0.00"
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 focus:outline-none"/>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Depth (m)</label>
                  <input type="number" min="0" step="0.01"
                    value={form.value3}
                    onChange={e => setForm(f => ({ ...f, value3: e.target.value }))}
                    placeholder="0.00"
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 focus:outline-none"/>
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Link to Rate Library item (optional)</label>
              <input type="text"
                value={form.itemName}
                onChange={e => setForm(f => ({ ...f, itemName: e.target.value }))}
                placeholder="e.g. Concrete Block 6&quot;, Rebar #4..."
                list="rate-items-mobile"
                className="w-full px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500/30"/>
              <datalist id="rate-items-mobile">
                {costItems.map(item => (
                  <option key={item.id} value={item.item_name}/>
                ))}
              </datalist>
            </div>

            <button
              onClick={handleAdd}
              disabled={!form.value || !form.label}
              className="w-full py-3.5 rounded-2xl bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 text-white text-sm font-bold transition-colors">
              + Add Measurement
            </button>
          </div>
        )}

        {/* Taken tab */}
        {activeTab === "taken" && (
          <div className="h-full overflow-y-auto">
            {measurements.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-3 p-6">
                <Ruler size={40} className="text-slate-300 dark:text-slate-700"/>
                <div className="text-sm font-semibold text-slate-600 dark:text-slate-300">No measurements yet</div>
                <div className="text-xs text-slate-400 dark:text-slate-500 text-center">Go to Measure tab to add measurements</div>
                <button onClick={() => setActiveTab("measure")}
                  className="px-4 py-2 rounded-xl bg-cyan-600 text-white text-sm font-semibold">
                  Start Measuring
                </button>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {measurements.map(m => (
                  <div key={m.id} className="flex items-center justify-between px-4 py-3">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-slate-700 dark:text-slate-200 truncate">{m.label || m.type}</div>
                      <div className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                        {fmt2(m.result)} {m.unit}
                        {m.linkedItemName && ` · ${m.linkedItemName}`}
                        {m.linkedAssemblyName && ` · ${m.linkedAssemblyName}`}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                        m.type === "line" ? "bg-blue-100 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400" :
                        m.type === "area" ? "bg-purple-100 dark:bg-purple-500/20 text-purple-600 dark:text-purple-400" :
                        m.type === "count" ? "bg-amber-100 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400" :
                        "bg-green-100 dark:bg-green-500/20 text-green-600 dark:text-green-400"
                      }`}>{m.type === "line" ? "linear" : m.type}</span>
                      <button onClick={() => onDeleteMeasurement(m.id)}
                        className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-500/10 text-slate-400 dark:text-slate-500 hover:text-red-500 transition-colors">
                        <X size={13}/>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {measurements.length > 0 && (
              <div className="p-4 border-t border-slate-100 dark:border-slate-800">
                <button onClick={onSendToBOQ}
                  className="w-full py-3 rounded-2xl bg-cyan-600 hover:bg-cyan-700 text-white text-sm font-bold transition-colors">
                  📤 Send All to BOQ ({measurements.length} measurements)
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// --- Main ---------------------------------------------------------------------
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
  // Two-finger touch: pinch-to-zoom + pan, tracked separately from panningRef/panStartRef above (those are for
  // the single-finger "select tool, empty space" mouse drag). pinchStartAnchorRef is the PDF-space point that
  // was under the two fingers' midpoint when the gesture began; keeping IT under the (moving) midpoint on every
  // touchmove is what makes pinch-zoom and two-finger pan work together in one natural gesture, exactly like a
  // map or PDF viewer. Single-finger touches never touch any of this — see onTouchStart/onTouchMove below.
  const pinchActiveRef = useRef(false);
  const pinchStartDistRef = useRef(0);
  const pinchStartZoomRef = useRef(1);
  const pinchStartAnchorRef = useRef<Point>({ x: 0, y: 0 });
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
  // Dragging a line measurement's offset dimension line (or its label), select tool only. The motion is
  // constrained to ONE axis — perpendicular to the true line — not a free 2D drag: mouse-down records the
  // click's PDF point, the line's unit normal at that moment, and the starting dimensionOffset; mouse-move
  // projects the mouse's movement onto that normal (a dot product) to get the new offset.
  const draggingOffsetIdRef = useRef<string|null>(null);
  const offsetDragStartRef = useRef<{ mousePdf: Point; normal: Point; startOffset: number }>({ mousePdf: { x: 0, y: 0 }, normal: { x: 0, y: 1 }, startOffset: 0 });
  const [inProgress, setInProgress] = useState<Point[]>([]);
  const inProgressRef = useRef<Point[]>([]);
  const [hoverPt, setHoverPt] = useState<Point|null>(null);
  const hoverRef = useRef<Point|null>(null);

  // Calibration
  const [calibrations, setCalibrations] =
useState<Record<number,{
  p1:Point;
  p2:Point;
  feetPerPx:number;
}>>({});

const calibration =
  calibrations[pageNum] || null;
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
  const [showWallSetup, setShowWallSetup] = useState(false);
  const [wallLineMode, setWallLineMode] = useState<"segment" | "continuous">("segment");
  const [wallHeightFeet, setWallHeightFeet] = useState("8");
  const [wallHeightInches, setWallHeightInches] = useState("0");
  const [wallHeightFraction, setWallHeightFraction] = useState(0);
  const [wallHeightConfirmed, setWallHeightConfirmed] = useState(false);
  const wallHeightConfirmedRef = useRef(false);
  const wallTotalHeightFeetRef = useRef(0);
  const wallLineModeRef = useRef<"segment" | "continuous">("segment");
  // Batch mode (every measuring tool, count included): shapes finished while a tool's batch is open all join
  // that batch — same batchId, same colour (picked once, when the batch starts), and for volume the same depth.
  // The batch stays open across page changes and tool switches until Finish is pressed for that tool. The ref
  // is the source of truth for the imperative click code; the state mirrors it so the buttons/badge re-render.
  const activeBatchesRef = useRef<Partial<Record<ToolMode, ActiveBatch>>>({});
  const [activeBatches, setActiveBatches] = useState<Partial<Record<ToolMode, ActiveBatch>>>({});
  // Set when Finish is pressed on a volume whose first shape still needs its depth: end the batch once the
  // depth prompt has been confirmed (and the shape created), not before.
  const endBatchAfterDepthRef = useRef(false);
  function writeBatches(next: Partial<Record<ToolMode, ActiveBatch>>) { activeBatchesRef.current = next; setActiveBatches(next); }
  // The open batch for a tool, starting a new one (new id, one new colour) if none is open.
  function joinBatch(tool: ToolMode): ActiveBatch {
    const cur = activeBatchesRef.current[tool];
    if (cur) return cur;
    const b: ActiveBatch = { id: uid(), color: nextColor() };
    writeBatches({ ...activeBatchesRef.current, [tool]: b });
    return b;
  }
  function endBatch(tool: ToolMode) {
    if (!activeBatchesRef.current[tool]) return;
    const next = { ...activeBatchesRef.current }; delete next[tool]; writeBatches(next);
  }
  function setBatchDepth(tool: ToolMode, depthIn: number) {
    const cur = activeBatchesRef.current[tool]; if (!cur) return;
    writeBatches({ ...activeBatchesRef.current, [tool]: { ...cur, depthIn } });
  }
  // After anything is deleted: an open batch none of whose members still exist is over.
  function pruneBatches(list: Measurement[]) {
    let changed = false; const next = { ...activeBatchesRef.current };
    for (const t of BATCH_TOOLS) { const b = next[t]; if (b && !list.some(m => m.batchId === b.id)) { delete next[t]; changed = true; } }
    if (changed) writeBatches(next);
  }
  // Auto-close, shared by perimeter/area/volume: a click within GRAB_TOL_PX screen pixels (divided by
  // zoom -> PDF units, same convention as the file's other 12/zoom and 24/zoom tolerances) of the shape's first
  // point (once 3+ points exist) closes it. 24 matches the stylus-friendly grab tolerance already used for the
  // offset-dimension-line drag. shapeClosedAtRef timestamps the last auto-close so the second click of a
  // double-click right after it is swallowed instead of starting a stray new shape.
  const SHAPE_CLOSE_SWALLOW_MS = 500;
  const shapeClosedAtRef = useRef(0);

  // Edit mode (node editing): the ONE measurement whose points are being edited. Separate from selectedId. Entering
  // forces the select tool and selects it; it ends via the Done button, Esc, another tool, another page, or the
  // measurement disappearing. Step 1 only shows handles — nothing is draggable/addable/deletable yet.
  const [editingId, setEditingId] = useState<string | null>(null);
  const editingIdRef = useRef<string | null>(null);
  function enterEdit(id: string) {
    // A hidden measurement draws nothing (no shape, no handles), so editing it blind makes no sense: unhide it as part
    // of entering edit mode. Goes through the ordinary measurements state, so the existing auto-save persists it.
    if (measurementsRef.current.some(x => x.id === id && x.hidden)) {
      const next = measurementsRef.current.map(x => x.id === id ? { ...x, hidden: false } : x);
      setMeasurements(next); measurementsRef.current = next;
    }
    setTool("select"); toolRef.current = "select";
    setInProgress([]); inProgressRef.current = [];
    setSelectedId(id); selectedIdRef.current = id;
    setEditingId(id); editingIdRef.current = id;
    scheduleRender();
  }
  function exitEdit() {
    if (!editingIdRef.current) return;
    cancelVertexDrag();
    setEditingId(null); editingIdRef.current = null;
    selectedVertexRef.current = null; hoverVertexRef.current = null;
    scheduleRender();
  }
  function toggleEdit(id: string) { if (editingIdRef.current === id) exitEdit(); else enterEdit(id); }

  // --- Edit mode: dragging a vertex of the measurement being edited ---------------------------------------------
  // orig is the measurement exactly as it was when the press began: every frame recomputes from it (not from the
  // previous frame), so the result is orig.result x (new geometry / orig geometry) with no drift. moved flips true
  // once the pointer travels VERTEX_DRAG_THRESHOLD_PX; until then nothing changes, and a release is a tap.
  const draggingVertexRef = useRef<{ id: string; index: number; startClient: Point; startPdf: Point; orig: Measurement; moved: boolean; addAt?: number } | null>(null);
  const hoverVertexRef = useRef<number | null>(null);      // mouse only: the vertex under the pointer (nothing to hover on touch)
  const selectedVertexRef = useRef<number | null>(null);   // set by a tap or a finished drag; step 3 will act on it
  // A press in edit mode grabs either a vertex (drag it) or a "+" midpoint (tap adds a point there; dragging from it
  // adds the point and drags it). addAt is set for the "+" case: the index the new point is spliced in at.
  function armVertexDrag(clientX: number, clientY: number): boolean {
    const id = editingIdRef.current; if (!id) return false;
    const m = measurementsRef.current.find(x => x.id === id);
    if (!m || m.hidden) return false; // a hidden measurement shows no handles, so there is nothing to grab
    const p = screenToPdf(clientX, clientY);
    const target = hitTestEditTarget(m, p, zoomRef.current);
    if (!target) return false;
    const base = { id, startClient: { x: clientX, y: clientY }, startPdf: p, orig: m, moved: false };
    draggingVertexRef.current = target.kind === "vertex" ? { ...base, index: target.index } : { ...base, index: target.at, addAt: target.at };
    return true;
  }
  // Writes newPoints onto the measurement being edited: result rescaled from `orig` by recompute() (kept exactly as it
  // was when the edit is geometry-neutral), plus wallLength / the wall caption where recompute() produced them.
  function commitPoints(orig: Measurement, newPoints: Point[]): Measurement | undefined {
    const patch = recompute(orig, newPoints);
    const changed = resultChanged(orig.result, patch.result);
    const result = changed ? patch.result : orig.result;
    let updated: Measurement | undefined;
    const next = measurementsRef.current.map(m => {
      if (m.id !== orig.id) return m;
      // A geometry-neutral edit (a "+" tap) also leaves wallLength and the wall caption exactly as they were.
      updated = { ...m, points: newPoints, result, ...(changed && patch.wallLength !== undefined ? { wallLength: patch.wallLength } : {}), ...(changed && patch.label !== undefined ? { label: patch.label } : {}) };
      return updated;
    });
    setMeasurements(next); measurementsRef.current = next;
    return updated;
  }
  // The point list a press would produce BEFORE any movement: orig.points, or with the midpoint spliced in for a "+".
  function dragBasis(d: { orig: Measurement; addAt?: number }): { basis: Point[]; base: Point } {
    const pts = d.orig.points;
    if (d.addAt === undefined) return { basis: pts, base: pts[0] };
    const a = pts[d.addAt - 1], b = pts[d.addAt % pts.length];
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    return { basis: [...pts.slice(0, d.addAt), mid, ...pts.slice(d.addAt)], base: mid };
  }
  function updateVertexDrag(clientX: number, clientY: number) {
    const d = draggingVertexRef.current; if (!d) return;
    if (!d.moved) {
      if (Math.hypot(clientX - d.startClient.x, clientY - d.startClient.y) < VERTEX_DRAG_THRESHOLD_PX) return;
      d.moved = true;
    }
    const p = screenToPdf(clientX, clientY);
    const { basis, base: mid } = dragBasis(d), n = basis.length;
    const start = d.addAt === undefined ? basis[d.index] : mid;
    // The vertex follows the pointer's displacement (so grabbing 20px off-centre doesn't make it jump), then may
    // snap onto another measurement's point — never onto any point of the measurement being edited itself.
    const want = { x: start.x + (p.x - d.startPdf.x), y: start.y + (p.y - d.startPdf.y) };
    const pos = snapToNearby(want, d.id);
    // An auto-closed perimeter stores its first point again as its last: they are ONE physical point, so both move.
    const closed = d.orig.type === "perimeter" && isClosedPerimeter(basis);
    const newPoints = basis.map((q, i) => (i === d.index || (closed && ((d.index === 0 && i === n-1) || (d.index === n-1 && i === 0)))) ? pos : q);
    commitPoints(d.orig, newPoints);
    scheduleRender();
  }
  function finishVertexDrag() {
    const d = draggingVertexRef.current; if (!d) return;
    draggingVertexRef.current = null;
    selectedVertexRef.current = d.index; // a tap selects the vertex; a finished drag leaves the dragged vertex selected
    if (d.addAt !== undefined && !d.moved) {
      // A tap on a "+": splice the midpoint in. Geometry is unchanged, so the result (and the BOQ) stay as they are.
      commitPoints(d.orig, dragBasis(d).basis);
    } else if (d.moved) {
      // Persistence needs nothing here: the debounced auto-save effect watches pageMeasurements. The linked BOQ task
      // is updated ONCE per drag (by the change in result since the press), never per frame.
      const cur = measurementsRef.current.find(m => m.id === d.id);
      if (cur && resultChanged(d.orig.result, cur.result)) upsertMeasurementTask(cur, d.orig.result);
    }
    scheduleRender();
  }
  // Delete affordance: is this canvas-local press on the "x" drawn beside the selected vertex?
  function hitDeleteHandle(sx: number, sy: number): boolean {
    const id = editingIdRef.current, idx = selectedVertexRef.current;
    if (!id || idx === null || draggingVertexRef.current) return false;
    const m = measurementsRef.current.find(x => x.id === id);
    if (!m || m.hidden || !canDeleteVertex(m, idx)) return false;
    const h = deleteHandlePos(pdfToCanvas(m.points[idx]));
    return Math.hypot(sx - h.x, sy - h.y) < DELETE_HANDLE_HIT_PX;
  }
  // Removes the selected vertex (the caller has checked hitDeleteHandle, which already applies the per-type minimums),
  // rescales the result, and sends the linked BOQ task the change once — the same delta pattern a drag uses on release.
  function deleteSelectedVertex() {
    const id = editingIdRef.current, idx = selectedVertexRef.current;
    if (!id || idx === null) return;
    const m = measurementsRef.current.find(x => x.id === id);
    if (!m || !canDeleteVertex(m, idx)) return;
    const updated = commitPoints(m, pointsAfterDelete(m, idx));
    selectedVertexRef.current = null; hoverVertexRef.current = null; // nothing may keep pointing at a vertex that is gone
    if (updated && resultChanged(m.result, updated.result)) upsertMeasurementTask(updated, m.result);
    scheduleRender();
  }
  // A second finger (pinch) or leaving edit mode mid-drag abandons it and puts the measurement back as it was.
  function cancelVertexDrag() {
    const d = draggingVertexRef.current; if (!d) return;
    draggingVertexRef.current = null;
    if (d.moved) {
      const next = measurementsRef.current.map(m => m.id === d.id ? d.orig : m);
      setMeasurements(next); measurementsRef.current = next;
    }
    scheduleRender();
  }
  useEffect(() => { if (editingIdRef.current && tool !== "select") exitEdit(); }, [tool]);
  useEffect(() => { if (editingIdRef.current) exitEdit(); }, [pageNum]);
  useEffect(() => { if (editingIdRef.current && !measurements.some(m => m.id === editingIdRef.current)) exitEdit(); }, [measurements]);

  // Depth modal for volume
  const [showDepthModal, setShowDepthModal] = useState(false);
  const [depthInches, setDepthInches] = useState("4");
  const pendingVolumeRef = useRef<Point[]>([]);

  // Library
  const [assemblies, setAssemblies] = useState<Assembly[]>([]);
  const [costItems, setCostItems] = useState<CostItem[]>([]);
  const [linkedAssemblyId, setLinkedAssemblyId] = useState<string>("");
  const [linkedItemId, setLinkedItemId] = useState<string>("");

  // Milestone picker
  const [projectMilestones, setProjectMilestones] = useState<{id:string; milestone_name:string}[]>([]);
  const [activeMilestoneId, setActiveMilestoneId] = useState<string>("");
  const activeMilestoneIdRef = useRef<string>("");
  const [activeMilestoneName, setActiveMilestoneName] = useState<string>("");
  const [showNewMsInput, setShowNewMsInput] = useState(false);
  const [newMsName, setNewMsName] = useState("");
  const [creatingMs, setCreatingMs] = useState(false);

  // Session
  // Mobile
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
  // Tablet = 768-1023px: same width check and same resize listener as the mobile breakpoint.
  const [isTablet, setIsTablet] = useState(() => window.innerWidth >= 768 && window.innerWidth < 1024);
  // Focus mode hides the page's own top bar and collapses both side panels; the right panel collapses to a thin rail.
  // Preferences are remembered (desktop and tablet separately, so re-opening the panel on a tablet sticks there).
  // Defaults: right panel open on desktop, collapsed on tablet.
  const [focusMode, setFocusMode] = useState(() => readBool(LS_FOCUS) === true);
  const [rightCollapsed, setRightCollapsed] = useState(() => readBool(LS_FOCUS) === true || (readBool(window.innerWidth >= 768 && window.innerWidth < 1024 ? LS_RIGHT_TABLET : LS_RIGHT) ?? (window.innerWidth >= 768 && window.innerWidth < 1024)));
  const pagesBeforeFocusRef = useRef(true);
  // Crossing into or out of tablet width applies that mode's remembered choice (or its default); tablet also keeps the Pages panel closed.
  useEffect(() => {
    if (focusMode) { setRightCollapsed(true); setPagesPanelCollapsed(true); return; }
    setRightCollapsed(readBool(isTablet ? LS_RIGHT_TABLET : LS_RIGHT) ?? isTablet);
    if (isTablet) setPagesPanelCollapsed(true);
  }, [isTablet]);
  const [pdfSignedUrl, setPdfSignedUrl] = useState<string|null>(null);
  useEffect(() => {
    function handleResize() { setIsMobile(window.innerWidth < 768); setIsTablet(window.innerWidth >= 768 && window.innerWidth < 1024); }
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);
  // Mobile plan viewer needs a directly-loadable PDF URL (the desktop canvas
  // renders via pdfjs, not a plain <img>/<iframe> src) — fetch one independently
  // whenever the active file changes.
  useEffect(() => {
    const path = pdfFiles[activePdfIdx]?.storagePath;
    if (!path) { setPdfSignedUrl(null); return; }
    let cancelled = false;
    supabase.storage.from("project-files").createSignedUrl(path, 3600*24).then(({ data }) => {
      if (!cancelled && data?.signedUrl) setPdfSignedUrl(data.signedUrl);
    });
    return () => { cancelled = true; };
  }, [pdfFiles, activePdfIdx]);

  const [sessionId, setSessionId] = useState<string|null>(null);
  const sessionIdRef = useRef<string|null>(null);
  const companyIdRef = useRef<string|null>(null);
  const [dbReady, setDbReady] = useState(false);
  const [error, setError] = useState<string|null>(null);
  const [rightTab, setRightTab] = useState<"templates"|"measurements"|"stats">("templates");
  const [searchAsm, setSearchAsm] = useState("");
  const [searchItems, setSearchItems] = useState("");
  // How many rows each library section shows; "Show more" adds a page, a new search goes back to one page.
  const [asmVisible, setAsmVisible] = useState(LIB_PAGE);
  const [itemsVisible, setItemsVisible] = useState(LIB_PAGE);

  // Keep refs in sync
  useEffect(()=>{ zoomRef.current = zoom; },[zoom]);
  useEffect(()=>{ panRef.current = pan; },[pan]);
  useEffect(()=>{ toolRef.current = tool; },[tool]);
  useEffect(()=>{ measurementsRef.current = measurements; },[measurements]);
  const pageMeasurementsRef = useRef<Measurement[]>([]);
  useEffect(()=>{ pageMeasurementsRef.current = pageMeasurements; },[pageMeasurements]);
  useEffect(()=>{ selectedIdRef.current = selectedId; },[selectedId]);
  useEffect(()=>{ calibRef.current = calibration; },[calibration]);
useEffect(() => {
  calibRef.current =
    calibrations[pageNum] || null;
}, [pageNum, calibrations]);

  useEffect(()=>{ calibratingRef.current = calibrating; },[calibrating]);
  useEffect(()=>{ calibPtsRef.current = calibPts; },[calibPts]);
  useEffect(()=>{ inProgressRef.current = inProgress; },[inProgress]);
  useEffect(()=>{ hoverRef.current = hoverPt; },[hoverPt]);
  useEffect(()=>{ activeMilestoneIdRef.current = activeMilestoneId; },[activeMilestoneId]);

  // --- Coordinate helpers ------------------------------------------------------
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

  // --- Main render loop --------------------------------------------------------
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
    const ms = pageMeasurementsRef.current;
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
        if (m.linkedAssemblyName) drawLabel(ctx, `? ${m.linkedAssemblyName}`, mx, my+4, "#a78bfa", true);

      } else if ((m.type === "area" || m.type === "volume") && m.points.length >= 3) {
        const pts = m.points.map(pdfToCanvas);
        ctx.strokeStyle = col; ctx.fillStyle = col + "22"; ctx.lineWidth = selected ? 2.5 : 1.5;
        ctx.beginPath(); pts.forEach((p,i) => { if(i===0) ctx.moveTo(p.x,p.y); else ctx.lineTo(p.x,p.y); }); ctx.closePath();
        ctx.fill(); ctx.stroke();
        // Centroid label
        const cx = pts.reduce((s,p)=>s+p.x,0)/pts.length;
        const cy = pts.reduce((s,p)=>s+p.y,0)/pts.length;
        drawLabel(ctx, m.unit === "ft" ? feetInches(m.result) : `${fmt2(m.result)} ${m.unit}`, cx, cy, col);
        if (m.linkedAssemblyName) drawLabel(ctx, `? ${m.linkedAssemblyName}`, cx, cy+18, "#a78bfa", true);

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

  // The label's drawn box (in canvas/screen space): font + measureText + padding, exactly as drawLabel below
  // paints it. Shared so the select-tool label hit-test in onMouseDown tests against the SAME box the label
  // is actually drawn in, rather than a second, independently maintained copy of this math.
  function labelBox(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, small = false): { x: number; y: number; w: number; h: number } {
    const font = small ? "bold 9px system-ui" : "bold 11px system-ui";
    ctx.font = font;
    const tw = ctx.measureText(text).width;
    const pad = 4, h = small ? 14 : 17;
    return { x: x-tw/2-pad, y: y-h+2, w: tw+pad*2, h };
  }
  function drawLabel(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string, small = false) {
    const box = labelBox(ctx, text, x, y, small);
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(10,13,20,0.88)";
    ctx.beginPath();
    roundRect(ctx, box.x, box.y, box.w, box.h, 4);
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

  // Edit mode handles (display only, step 1) for the ONE measurement being edited: a ring at every vertex — bigger than
  // the normal 9px squares/arrows so it is clear which points are grabbable — plus a "+" disc at each segment midpoint on
  // the multi-point types (perimeter/wall/area/volume; area/volume include the closing edge) previewing where a later
  // "add a node" would go. An auto-closed perimeter's duplicate last point is not drawn twice. Count gets a larger ring
  // around each numbered marker; a line gets its two end rings and no "+".
  // Step 2 adds three states on top of the plain ring: hover (mouse only) = bigger amber ring with a glow; selected (after
  // a tap or a finished drag) = filled in the measurement's colour; dragging = amber fill with the glow.
  function drawEditHandles(ctx: CanvasRenderingContext2D, m: Measurement, hoverIdx: number | null = null, selectedIdx: number | null = null, dragIdx: number | null = null) {
    const pts = m.points.map(pdfToCanvas);
    if (pts.length === 0) return;
    const closedPerim = m.type === "perimeter" && pts.length >= 4 && dist(pts[0], pts[pts.length-1]) < 0.5;
    const verts = closedPerim ? pts.slice(0, -1) : pts;
    ctx.save();
    ctx.setLineDash([]);
    if (m.type==="perimeter"||m.type==="wall"||m.type==="area"||m.type==="volume") {
      const segCount = (m.type==="area"||m.type==="volume") ? pts.length : pts.length - 1;
      for (let i = 0; i < segCount; i++) {
        const a = pts[i], b = pts[(i+1) % pts.length];
        const mx = (a.x+b.x)/2, my = (a.y+b.y)/2;
        ctx.fillStyle = "rgba(255,255,255,0.9)"; ctx.strokeStyle = m.color; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(mx, my, 7, 0, Math.PI*2); ctx.fill(); ctx.stroke();
        ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(mx-3.5, my); ctx.lineTo(mx+3.5, my); ctx.moveTo(mx, my-3.5); ctx.lineTo(mx, my+3.5); ctx.stroke();
      }
    }
    const r = m.type === "count" ? 13 : 9;
    // the shared start/end of an auto-closed perimeter is drawn once, as index 0
    const norm = (i: number | null) => (i !== null && closedPerim && i === pts.length - 1) ? 0 : i;
    const hi = norm(hoverIdx), si = norm(selectedIdx), di = norm(dragIdx);
    verts.forEach((p, i) => {
      const dragging = di === i, hover = hi === i && di === null, selected = si === i;
      ctx.save();
      if (dragging || hover) { ctx.shadowColor = "#f59e0b"; ctx.shadowBlur = 12; }
      ctx.fillStyle = dragging ? "#fde68a" : selected ? m.color : "#fff";
      ctx.strokeStyle = (dragging || hover) ? "#f59e0b" : selected ? "#fff" : m.color;
      ctx.lineWidth = (dragging || hover) ? 4 : 3;
      ctx.beginPath(); ctx.arc(p.x, p.y, (dragging || hover) ? r + 2 : r, 0, Math.PI*2); ctx.fill(); ctx.stroke();
      ctx.restore();
      if (m.type !== "count") { ctx.fillStyle = selected && !dragging ? "#fff" : m.color; ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, Math.PI*2); ctx.fill(); }
    });
    // Delete affordance: a red "x" disc beside the selected vertex — only where deleting that vertex is allowed (never on a
    // line, never below a type's minimum point count) and not while it is being dragged.
    if (selectedIdx !== null && dragIdx === null && canDeleteVertex(m, selectedIdx) && pts[selectedIdx]) {
      const h = deleteHandlePos(pts[selectedIdx]);
      ctx.fillStyle = "#ef4444"; ctx.strokeStyle = "#fff"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(h.x, h.y, 10, 0, Math.PI*2); ctx.fill(); ctx.stroke();
      ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(h.x-4, h.y-4); ctx.lineTo(h.x+4, h.y+4); ctx.moveTo(h.x+4, h.y-4); ctx.lineTo(h.x-4, h.y+4); ctx.stroke();
    }
    ctx.restore();
  }

  // Ported from SiteVisitPage.tsx's drawArrow (same atan2-angle + two 30°-back-stroke math), but draws only the
  // head at `to` — the shaft itself is already stroked by the caller as part of the measurement's own line.
  function drawArrowhead(ctx: CanvasRenderingContext2D, from: Point, to: Point, color: string, lw: number) {
    const headLen = 12;
    const angle = Math.atan2(to.y - from.y, to.x - from.x);
    ctx.save();
    ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(to.x, to.y);
    ctx.lineTo(to.x - headLen * Math.cos(angle - Math.PI / 6), to.y - headLen * Math.sin(angle - Math.PI / 6));
    ctx.moveTo(to.x, to.y);
    ctx.lineTo(to.x - headLen * Math.cos(angle + Math.PI / 6), to.y - headLen * Math.sin(angle + Math.PI / 6));
    ctx.stroke();
    ctx.restore();
  }

  // Small filled+stroked square centered on a single vertex — the architectural dimension-line "node" marker,
  // drawn at every vertex of a line/perimeter/calibration measurement. Deliberately a distinct shape from the
  // old dual-arc dot (still used by wall/offset-line) so these read as grab-handles: a future point-editing
  // feature can hit-test each one individually since the vertex's own {x,y} (points[i]) is exactly its center.
  function drawVertexSquare(ctx: CanvasRenderingContext2D, p: Point, color: string) {
    const s = 9; // side length in canvas px — similar visual weight to the old radius-5/2 dot pair, but a square
    ctx.save();
    ctx.fillStyle = color; ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.rect(p.x - s/2, p.y - s/2, s, s);
    ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  // Schedule render when deps change
  useEffect(() => { scheduleRender(); }, [zoom, pan, pageMeasurements, selectedId, inProgress, hoverPt, calibration, calibrating, calibPts, pdfPageSize]);

  // --- PDF rendering -----------------------------------------------------------
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
    const ms = pageMeasurementsRef.current;
    ms.forEach(m => {
      if (m.points.length === 0) return;
      if (m.hidden) return; // purely a display toggle — never skipped in sendToBOQ() or the Summary tab's stats
      const col = m.color;
      const selected = m.id === selectedIdRef.current;
      ctx.save();
      if (selected) { ctx.shadowColor = col; ctx.shadowBlur = 14; }
      if (m.type === "line" && m.points.length >= 2) {
        const [a, b] = [pdfToCanvas(m.points[0]), pdfToCanvas(m.points[1])];
        // Offset dimension line: a full parallel copy of the true line, shifted perpendicular to it by
        // dimensionOffset (PDF-space units). Absent/zero -> the true line is drawn exactly as before this
        // feature existed (byte-for-byte the same three lines this block always ran): no offset line, no
        // extension lines, single label at the true midpoint. Non-zero -> the true line's stroke and
        // endpoint dots are skipped entirely (decluttering the plan is the point of moving it), leaving only
        // its thin dashed extension-line stubs and the offset line as the sole visible representation. The
        // true line's own click-to-select hit-test (onMouseDown) still tests the true points regardless, so
        // it stays selectable/deletable even though nothing is drawn there.
        const dOff = m.dimensionOffset || 0;
        let lx = (a.x+b.x)/2, ly = (a.y+b.y)/2-14;
        if (dOff === 0) {
          ctx.strokeStyle = col; ctx.lineWidth = selected ? 3.5 : 2.5;
          ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y); ctx.stroke();
          // Outward-pointing arrowheads at both ends (each continuing the line's direction past that end) — the
          // architectural dimension-line convention. Both points are ends, so both get an arrow and no square.
          drawArrowhead(ctx, b, a, col, selected ? 3.5 : 2.5); // outward past the start: direction b -> a
          drawArrowhead(ctx, a, b, col, selected ? 3.5 : 2.5); // outward past the end: direction a -> b
        } else {
          const dx = m.points[1].x-m.points[0].x, dy = m.points[1].y-m.points[0].y;
          const len = Math.hypot(dx,dy) || 1;
          const nx = -dy/len, ny = dx/len; // unit normal, perpendicular to the true line's direction
          const offA = pdfToCanvas({ x: m.points[0].x+nx*dOff, y: m.points[0].y+ny*dOff });
          const offB = pdfToCanvas({ x: m.points[1].x+nx*dOff, y: m.points[1].y+ny*dOff });
          // Extension lines: true endpoint -> matching offset endpoint. Thin, dashed, muted (same style the
          // earlier label-leader work used) — the only remaining trace of where this was actually measured.
          ctx.save();
          ctx.strokeStyle = "rgba(148,163,184,0.6)"; ctx.lineWidth = 1; ctx.setLineDash([3,3]);
          ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.lineTo(offA.x,offA.y); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(b.x,b.y); ctx.lineTo(offB.x,offB.y); ctx.stroke();
          ctx.restore();
          // Offset line: the true line's own stroke is skipped above (not just left ambient), so its
          // strokeStyle/lineWidth are set explicitly here rather than relied on as leftover state — this is
          // now the sole visible line for this measurement, drawn at the same weight/color the true line
          // would have used, exactly like a drafting dimension line drawn at the weight of the feature it
          // measures.
          ctx.strokeStyle = col; ctx.lineWidth = selected ? 3.5 : 2.5;
          ctx.beginPath(); ctx.moveTo(offA.x,offA.y); ctx.lineTo(offB.x,offB.y); ctx.stroke();
          // The offset line is now the only visible line for this measurement and is itself a simple 2-point
          // line, so it gets the same markers as the zero-offset case: outward arrows at both ends, no squares.
          // Nothing at all is drawn at the TRUE line's own points here (only the dashed extension stubs above
          // start there).
          drawArrowhead(ctx, offB, offA, col, selected ? 3.5 : 2.5); // outward past the offset line's start
          drawArrowhead(ctx, offA, offB, col, selected ? 3.5 : 2.5); // outward past the offset line's end
          lx = (offA.x+offB.x)/2; ly = (offA.y+offB.y)/2-14;
        }
        drawLabel(ctx, m.unit === "ft" ? feetInches(m.result) : `${fmt2(m.result)} ${m.unit}`, lx, ly, col);
        if (m.linkedAssemblyName) drawLabel(ctx, `? ${m.linkedAssemblyName}`, lx, ly+18, "#a78bfa", true);
      } else if (m.type === "wall" && m.points.length >= 2) {
        const pts = m.points.map(pdfToCanvas);
        ctx.strokeStyle = col; ctx.lineWidth = selected ? 3.5 : 2.5;
        ctx.beginPath();
        pts.forEach((p,i) => { if (i===0) ctx.moveTo(p.x,p.y); else ctx.lineTo(p.x,p.y); });
        ctx.stroke();
        // Same convention as an open perimeter: a wall run never closes, so its first/last points get outward
        // arrows only and every interior vertex a square only (a 2-point wall: two arrows, no squares).
        for (let i = 1; i < pts.length - 1; i++) drawVertexSquare(ctx, pts[i], col);
        drawArrowhead(ctx, pts[1], pts[0], col, selected ? 3.5 : 2.5); // outward past the start
        drawArrowhead(ctx, pts[pts.length-2], pts[pts.length-1], col, selected ? 3.5 : 2.5); // outward past the end
        const midIdx = Math.floor(pts.length/2);
        const labelPt = pts.length % 2 === 0
          ? { x:(pts[midIdx-1].x+pts[midIdx].x)/2, y:(pts[midIdx-1].y+pts[midIdx].y)/2 }
          : pts[midIdx];
        drawLabel(ctx, `${fmt2(m.result)} ft²`, labelPt.x, labelPt.y-14, col);
        drawLabel(ctx, m.label, labelPt.x, labelPt.y+4, "#f472b6", true);
        if (m.linkedAssemblyName) drawLabel(ctx, `? ${m.linkedAssemblyName}`, labelPt.x, labelPt.y+22, "#a78bfa", true);
      } else if (m.type === "perimeter" && m.points.length >= 2) {
        // Same open-polyline drawing as wall just above (never closed), but dashed rather than solid — reads
        // as a reference/measurement line rather than a real wall, since both can otherwise share the same
        // per-instance rotating color and would only differ by their "ft" vs "ft²" label otherwise.
        const pts = m.points.map(pdfToCanvas);
        ctx.strokeStyle = col; ctx.lineWidth = selected ? 3.5 : 2.5; ctx.setLineDash([7,4]);
        ctx.beginPath();
        pts.forEach((p,i) => { if (i===0) ctx.moveTo(p.x,p.y); else ctx.lineTo(p.x,p.y); });
        ctx.stroke();
        ctx.setLineDash([]);
        // A point is EITHER a square OR an arrow, never both. Open path: the first and last point get an
        // outward arrowhead only; every interior vertex gets a square only. Closed path (the last point was
        // snapped exactly onto the first — see the perimeter click branch): there is no start or end any more,
        // so every distinct vertex is a square and there are no arrows. The duplicate last point isn't drawn twice.
        const closed = pts.length >= 4 && dist(pts[0], pts[pts.length-1]) < 0.5;
        if (closed) {
          for (let i = 0; i < pts.length - 1; i++) drawVertexSquare(ctx, pts[i], col);
        } else {
          for (let i = 1; i < pts.length - 1; i++) drawVertexSquare(ctx, pts[i], col);
          drawArrowhead(ctx, pts[1], pts[0], col, selected ? 3.5 : 2.5); // outward past the start: direction pts[1] -> pts[0]
          drawArrowhead(ctx, pts[pts.length-2], pts[pts.length-1], col, selected ? 3.5 : 2.5); // outward past the end
        }
        const midIdx = Math.floor(pts.length/2);
        const labelPt = pts.length % 2 === 0
          ? { x:(pts[midIdx-1].x+pts[midIdx].x)/2, y:(pts[midIdx-1].y+pts[midIdx].y)/2 }
          : pts[midIdx];
        drawLabel(ctx, m.unit === "ft" ? feetInches(m.result) : `${fmt2(m.result)} ${m.unit}`, labelPt.x, labelPt.y-14, col);
        if (m.linkedAssemblyName) drawLabel(ctx, `? ${m.linkedAssemblyName}`, labelPt.x, labelPt.y+4, "#a78bfa", true);
      } else if ((m.type==="area"||m.type==="volume") && m.points.length>=3) {
        const pts = m.points.map(pdfToCanvas);
        ctx.strokeStyle=col; ctx.fillStyle=col+"28"; ctx.lineWidth=selected?2.5:1.5;
        ctx.beginPath(); pts.forEach((p,i)=>{if(i===0)ctx.moveTo(p.x,p.y);else ctx.lineTo(p.x,p.y);}); ctx.closePath(); ctx.fill(); ctx.stroke();
        // A finished area/volume is always a closed shape: every corner is a square, no arrows anywhere.
        pts.forEach(p => drawVertexSquare(ctx, p, col));
        const cx=pts.reduce((s,p)=>s+p.x,0)/pts.length, cy=pts.reduce((s,p)=>s+p.y,0)/pts.length;
        drawLabel(ctx, m.unit === "ft" ? feetInches(m.result) : `${fmt2(m.result)} ${m.unit}`, cx, cy, col);
        if (m.linkedAssemblyName) drawLabel(ctx, `? ${m.linkedAssemblyName}`, cx, cy+20, "#a78bfa", true);
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

    // Edit mode (step 1: display only): handles on the one measurement being edited, drawn above everything else.
    const editM = editingIdRef.current ? ms.find(x => x.id === editingIdRef.current) : undefined;
    if (editM && !editM.hidden) drawEditHandles(ctx, editM, hoverVertexRef.current, selectedVertexRef.current, draggingVertexRef.current?.moved ? draggingVertexRef.current.index : null);

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
    if ((t==="line"||(t==="wall"&&wallLineModeRef.current==="segment"))&&ip.length===1&&hp){
      const a=pdfToCanvas(ip[0]),b=pdfToCanvas(hp);
      ctx.save(); ctx.strokeStyle=tcol; ctx.lineWidth=2; ctx.setLineDash([6,4]);
      ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y); ctx.stroke();
      ctx.fillStyle=tcol; ctx.setLineDash([]); ctx.beginPath(); ctx.arc(a.x,a.y,5,0,Math.PI*2); ctx.fill();
      if (calibRef.current){
        const d=dist(ip[0],hp)*calibRef.current.feetPerPx;
        if (t==="wall") {
          const wallArea = d * wallTotalHeightFeetRef.current;
          drawLabel(ctx,`${fmt2(wallArea)} ft²`,(a.x+b.x)/2,(a.y+b.y)/2-14,tcol);
        } else {
          drawLabel(ctx,feetInches(d),(a.x+b.x)/2,(a.y+b.y)/2-14,tcol);
        }
      }
      ctx.restore();
    }
    if ((t==="area"||t==="volume")&&ip.length>0&&hp){
      const allPts=[...ip,hp].map(pdfToCanvas);
      ctx.save(); ctx.strokeStyle=tcol; ctx.fillStyle=tcol+"18"; ctx.lineWidth=1.5; ctx.setLineDash([6,4]);
      ctx.beginPath(); allPts.forEach((p,i)=>{if(i===0)ctx.moveTo(p.x,p.y);else ctx.lineTo(p.x,p.y);}); ctx.closePath(); ctx.fill(); ctx.stroke();
      ip.forEach(p=>{const cp=pdfToCanvas(p);ctx.fillStyle=tcol;ctx.setLineDash([]);ctx.beginPath();ctx.arc(cp.x,cp.y,4,0,Math.PI*2);ctx.fill();});
      ctx.restore();
    }
    if (((t==="wall"&&wallLineModeRef.current==="continuous")||t==="perimeter")&&ip.length>0&&hp){
      const allPts=[...ip,hp].map(pdfToCanvas);
      ctx.save(); ctx.strokeStyle=tcol; ctx.lineWidth=2; ctx.setLineDash([6,4]);
      ctx.beginPath(); allPts.forEach((p,i)=>{if(i===0)ctx.moveTo(p.x,p.y);else ctx.lineTo(p.x,p.y);}); ctx.stroke();
      ip.forEach(p=>{const cp=pdfToCanvas(p);ctx.fillStyle=tcol;ctx.setLineDash([]);ctx.beginPath();ctx.arc(cp.x,cp.y,4,0,Math.PI*2);ctx.fill();});
      if (calibRef.current){
        let totalLengthFt = 0;
        for (let i = 0; i < ip.length - 1; i++) { totalLengthFt += dist(ip[i], ip[i+1]) * calibRef.current.feetPerPx; }
        totalLengthFt += dist(ip[ip.length-1], hp) * calibRef.current.feetPerPx;
        const lastPt = allPts[allPts.length-1];
        if (t==="wall") {
          const wallArea = totalLengthFt * wallTotalHeightFeetRef.current;
          drawLabel(ctx,`${fmt2(wallArea)} ft² total`,lastPt.x,lastPt.y-18,tcol);
        } else {
          drawLabel(ctx,`${feetInches(totalLengthFt)} total`,lastPt.x,lastPt.y-18,tcol);
        }
      }
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
      // Persisted scale line only — the transient in-progress rendering above (red circle + × glyph while
      // actively placing the two calibration points) is untouched. Same square + outward-arrowhead convention
      // as line (both points are ends, so arrows only, no squares).
      ctx.save(); ctx.globalAlpha=0.4;
      drawArrowhead(ctx, b, a, "#ef4444", 1.5);
      drawArrowhead(ctx, a, b, "#ef4444", 1.5);
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

  // --- Fit view ----------------------------------------------------------------
  // The view fitView() last produced (and the container size it was for), so a later resize can tell whether the
  // user was still on the fitted view or had zoomed / panned away from it.
  const lastFitRef = useRef<{ zoom: number; pan: Point; w: number; h: number } | null>(null);
  function fitView() {
    const c = containerRef.current;
    if (!c || pdfPageSize.x === 0) return;
    const cw = c.clientWidth, ch = c.clientHeight;
    const newZ = Math.min(cw / pdfPageSize.x, ch / pdfPageSize.y) * 0.92;
    const newPan = { x: (cw - pdfPageSize.x * newZ) / 2, y: (ch - pdfPageSize.y * newZ) / 2 };
    setZoom(newZ); setPan(newPan);
    zoomRef.current = newZ; panRef.current = newPan;
    lastFitRef.current = { zoom: newZ, pan: newPan, w: cw, h: ch };
    scheduleRender();
  }
  useEffect(() => { if (pdfPageSize.x > 0) fitView(); }, [pdfPageSize]);

  // The canvas bitmap is only resized inside drawAll(), which only runs when a render is scheduled, so when the
  // container changes size (app sidebar or a panel collapsing, window resize) it stayed stretched at the old size
  // until the next mouse move. Redraw on any size change, and re-fit if the view was still the fitted one.
  const fitViewRef = useRef(fitView);
  fitViewRef.current = fitView;
  useEffect(() => {
    const c = containerRef.current;
    if (!c || typeof ResizeObserver === "undefined") return;
    let lastW = c.clientWidth, lastH = c.clientHeight;
    const ro = new ResizeObserver(() => {
      try {
        const w = c.clientWidth, h = c.clientHeight;
        if (w === lastW && h === lastH) return;
        const lf = lastFitRef.current;
        const wasFit = !!lf && lf.w === lastW && lf.h === lastH
          && Math.abs(zoomRef.current - lf.zoom) < 1e-6
          && Math.abs(panRef.current.x - lf.pan.x) < 0.5 && Math.abs(panRef.current.y - lf.pan.y) < 0.5;
        lastW = w; lastH = h;
        if (wasFit) fitViewRef.current(); else scheduleRender();
      } catch { /* a failed redraw must never break the page */ }
    });
    ro.observe(c);
    return () => ro.disconnect();
  }, [isMobile]);

  // --- DB init -----------------------------------------------------------------
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
          setCalibrations(c);
calibRef.current =
  c[pageNum] || null;
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
              id: r.id,
              type: r.type,
              points: r.points, result: Number(r.result), unit: r.unit,
              label: r.meta?.label || "", color: r.meta?.color || nextColor(),
              dimensionOffset: typeof r.meta?.dimension_offset === "number" ? r.meta.dimension_offset : undefined,
              hidden: r.meta?.hidden === true ? true : undefined,
              batchId: typeof r.meta?.batch_id === "string" ? r.meta.batch_id : undefined,
              depthIn: typeof r.meta?.depth_in === "number" ? r.meta.depth_in : undefined,
              wallLength: typeof r.meta?.wall_length === "number" ? r.meta.wall_length : undefined,
              wallHeight: typeof r.meta?.wall_height === "number" ? r.meta.wall_height : undefined,
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
        // (in windows, so more than 1000 assemblies or component rows still load completely and the "N components" counts are right)
        let asmbs: any[] = [], acomps: any[] = [];
        try { asmbs = await fetchAllWindows<any>("assemblies", (a, b) => supabase.from("assemblies").select("id,name,category,unit,is_active").eq("is_active",true).order("name").order("id").range(a, b)); } catch (e) { console.error("assemblies load failed:", e); }
        try { acomps = await fetchAllWindows<any>("assembly_components", (a, b) => supabase.from("assembly_components").select("assembly_id").order("id").range(a, b)); } catch (e) { console.error("assembly_components load failed:", e); }
        const compCounts: Record<string,number> = {};
        (acomps||[]).forEach((c:any) => { compCounts[c.assembly_id] = (compCounts[c.assembly_id]||0)+1; });
        setAssemblies((asmbs||[]).map((a:any) => ({ id:a.id, name:a.name, category:a.category, unit:a.unit, componentCount:compCounts[a.id]||0 })));

        // Load cost items (include coverage fields for unit conversion), in windows so a library over 1000 rows loads completely
        try { setCostItems(await fetchAllCostItems()); } catch (e) { console.error("cost_items load failed:", e); }

        // Load project milestones for picker
        if (projectId) {
          const { data: msData } = await supabase.from("project_milestones")
            .select("id,milestone_name").eq("project_id", projectId).order("milestone_no",{ascending:true});
          setProjectMilestones(msData||[]);
        }

      } catch (e:any) { setError("Load failed: "+e?.message); }
      setDbReady(true);
    }
    init();
  }, [projectId]);

  // Save flush (shared by debounce, unmount, beforeunload, and explicit actions)
  const savingRef = useRef(false);
  const pendingFlushPageRef = useRef<number | null>(null);

  const flushMeasurementsSave = useCallback(async (pageToSave: number) => {
    if (!sessionIdRef.current) return;
    if (savingRef.current) { pendingFlushPageRef.current = pageToSave; return; }
    savingRef.current = true;
    try {
      await supabase.from("takeoff_measurements").delete().eq("session_id", sessionIdRef.current).eq("page_number", pageToSave);
      const current = measurementsRef.current.filter(m => (m.pageNumber ?? 1) === pageToSave);
      if (current.length > 0) {
        await supabase.from("takeoff_measurements").insert(current.map(m => ({
          session_id: sessionIdRef.current, company_id: companyIdRef.current, project_id: projectId,
          page_number: pageToSave, tool_type: m.type, type: m.type, points: m.points, result: m.result, unit: m.unit,
          closed_shape: false, multiplier: 1, waste_percent: 0, sort_order: 0, is_deleted: false,
          capture_mode: "manual", status: "active",
          geometry_json: m.points, anchor_points_json: m.points,
          formula_inputs_json: {}, resolved_fields_json: {}, metadata: {}, client_visible: true,
          linked_item_id: m.linkedItemId || null, linked_assembly_id: m.linkedAssemblyId || null,
          meta: { label:m.label, color:m.color, timestamp:m.timestamp, linked_assembly_name:m.linkedAssemblyName, linked_item_name:m.linkedItemName,
            ...(m.dimensionOffset ? { dimension_offset: m.dimensionOffset } : {}),
            ...(m.hidden ? { hidden: true } : {}),
            ...(m.batchId ? { batch_id: m.batchId } : {}),
            ...(m.depthIn ? { depth_in: m.depthIn } : {}),
            ...(m.wallLength !== undefined ? { wall_length: m.wallLength } : {}),
            ...(m.wallHeight !== undefined ? { wall_height: m.wallHeight } : {}) },
        })));
      }
      await supabase.from("takeoff_sessions").update({ last_page_number: pageToSave }).eq("id", sessionIdRef.current);
    } catch (e:any) { console.warn("Measurement save failed:", e?.message); }
    finally {
      savingRef.current = false;
      if (pendingFlushPageRef.current !== null) {
        const next = pendingFlushPageRef.current;
        pendingFlushPageRef.current = null;
        flushMeasurementsSave(next);
      }
    }
  }, [projectId]);

  // Debounced auto-save while drawing
  useEffect(() => {
    if (!sessionId || !dbReady) return;
    const tid = setTimeout(() => { flushMeasurementsSave(pageNum); }, 800);
    return () => clearTimeout(tid);
  }, [pageMeasurements, sessionId, dbReady, pageNum, flushMeasurementsSave]);

  // Flush on unmount (nav away, browser back, route change)
  useEffect(() => {
    return () => { if (sessionIdRef.current) flushMeasurementsSave(pageNum); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Flush on tab close / refresh
  useEffect(() => {
    function onBeforeUnload() { if (sessionIdRef.current) flushMeasurementsSave(pageNum); }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [pageNum, flushMeasurementsSave]);


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
  // --- PDF upload ---------------------------------------------------------------
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

  // --- Canvas events ------------------------------------------------------------
  // Shared by onMouseDown's select-tool branch and onTouchStart's direct touch-arming: hit-tests a screen
  // point (sx,sy, canvas-local pixels) and its PDF-space equivalent (p) against every line measurement's
  // offset line and label, and arms the drag state (selection + draggingOffsetIdRef + offsetDragStartRef) on
  // a hit. Returns true if something was grabbed. Callers remain responsible for calling preventDefault()
  // (MouseEvent and TouchEvent don't share a common type for it) and scheduleRender()/return on a hit — the
  // original mouse path never called preventDefault here either, so this keeps that exactly as it was.
  // onlyId: when set (edit mode), only that measurement's offset line can be grabbed, so selection stays pinned to it.
  function hitTestOffsetLine(p: Point, sx: number, sy: number, onlyId?: string | null): boolean {
    const ctx2d = canvasRef.current?.getContext("2d");
    if (!ctx2d) return false;
    // A synthetic mouse event from a single-finger touch (how drawing already works on tablet) is
    // indistinguishable from a real mouse event by the time it reaches onMouseDown — this file has no
    // pointerType/sourceCapabilities check anywhere, and the pinch-zoom touch handlers only ever engage at
    // 2 fingers. So rather than leaving this mouse-precision-only, the grab tolerance below is doubled
    // universally: comfortable for a fingertip, still small enough with a mouse not to feel imprecise.
    const GRAB_PAD_SCREEN = 12; // extra px padding around the label's own (zoom-independent) hit box
    for (const m of measurementsRef.current) {
      if (m.type !== "line" || m.points.length < 2) continue;
      if (onlyId && m.id !== onlyId) continue;
      const dOffM = m.dimensionOffset || 0;
      const dx = m.points[1].x-m.points[0].x, dy = m.points[1].y-m.points[0].y;
      const len = Math.hypot(dx,dy) || 1;
      const nx = -dy/len, ny = dx/len;
      const offA = { x: m.points[0].x+nx*dOffM, y: m.points[0].y+ny*dOffM };
      const offB = { x: m.points[1].x+nx*dOffM, y: m.points[1].y+ny*dOffM };
      const hitOffsetLine = distToSeg(p, offA, offB) < GRAB_TOL_PX/zoomRef.current;
      const labelScreen = pdfToCanvas({ x: (offA.x+offB.x)/2, y: (offA.y+offB.y)/2 });
      const text = m.unit === "ft" ? feetInches(m.result) : `${fmt2(m.result)} ${m.unit}`;
      const box = labelBox(ctx2d, text, labelScreen.x, labelScreen.y-14, false);
      const hitLabel = sx >= box.x-GRAB_PAD_SCREEN && sx <= box.x+box.w+GRAB_PAD_SCREEN && sy >= box.y-GRAB_PAD_SCREEN && sy <= box.y+box.h+GRAB_PAD_SCREEN;
      if (hitOffsetLine || hitLabel) {
        setSelectedId(m.id); selectedIdRef.current = m.id;
        draggingOffsetIdRef.current = m.id;
        offsetDragStartRef.current = { mousePdf: p, normal: { x: nx, y: ny }, startOffset: dOffM };
        return true;
      }
    }
    return false;
  }

  function onMouseMove(e: React.MouseEvent) {
    const p = screenToPdf(e.clientX, e.clientY);
    setHoverPt(p); hoverRef.current = p;
    if (draggingVertexRef.current) { updateVertexDrag(e.clientX, e.clientY); return; }
    if (editingIdRef.current) {
      // Hover feedback (mouse only — a touch has no pointer until it lands): which vertex a press here would grab.
      const em = measurementsRef.current.find(x => x.id === editingIdRef.current);
      hoverVertexRef.current = em && !em.hidden ? hitTestVertex(em.points, p, zoomRef.current) : null;
    }
    if (draggingOffsetIdRef.current) {
      const start = offsetDragStartRef.current;
      const id = draggingOffsetIdRef.current;
      // Project the mouse's movement onto the line's perpendicular axis (a dot product) — this is what
      // constrains the drag to one axis instead of a free 2D drag.
      const moveDx = p.x - start.mousePdf.x, moveDy = p.y - start.mousePdf.y;
      const proj = moveDx*start.normal.x + moveDy*start.normal.y;
      const nextOffset = start.startOffset + proj;
      const next = measurementsRef.current.map(m => m.id === id ? { ...m, dimensionOffset: nextOffset } : m);
      setMeasurements(next); measurementsRef.current = next;
      scheduleRender();
      return;
    }
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
      // Grabbing the OFFSET line (or its label) starts a drag; at zero offset it sits exactly on the true
      // line, so this doubles as "start dragging a fresh dimension line out of it." Clicking the TRUE line
      // when it's visually distinct from the offset line (offset != 0) falls through to the existing body
      // hit-test below instead, which only selects — never drags. See hitTestOffsetLine for the tolerance
      // constants and why they're the same for mouse and touch.
      const rect = containerRef.current?.getBoundingClientRect();
      // Edit mode: a press on a vertex of the measurement being edited starts a (tap-or-drag) vertex press.
      if (editingIdRef.current && rect && hitDeleteHandle(e.clientX - rect.left, e.clientY - rect.top)) { deleteSelectedVertex(); scheduleRender(); return; }
      if (editingIdRef.current && armVertexDrag(e.clientX, e.clientY)) { scheduleRender(); return; }
      if (rect && hitTestOffsetLine(p, e.clientX - rect.left, e.clientY - rect.top, editingIdRef.current)) {
        scheduleRender();
        return;
      }
      // Edit mode pins the selection to the measurement being edited: clicking anywhere else (another shape, empty
      // space) never changes it — empty space just pans. Only Done / Esc / another tool / another page end edit mode.
      if (editingIdRef.current) {
        selectedVertexRef.current = null;
        panningRef.current = true;
        panStartRef.current = { mouse: { x: e.clientX, y: e.clientY }, pan: { ...panRef.current } };
        scheduleRender();
        return;
      }
      // Find closest measurement
      const hit = measurementsRef.current.find(m => {
        if (m.type==="line"&&m.points.length>=2) return distToSeg(p,m.points[0],m.points[1]) < 12/zoomRef.current;
        if (m.type==="count") return m.points.some(q=>dist(p,q)<10/zoomRef.current);
        // Perimeter: distance to the NEAREST of all consecutive segments, reusing the same distToSeg() and
        // tolerance the line/count tests above use.
        if (m.type==="perimeter"&&m.points.length>=2) {
          for (let i=0;i<m.points.length-1;i++) if (distToSeg(p,m.points[i],m.points[i+1]) < 12/zoomRef.current) return true;
          return false;
        }
        // Wall / area / volume: the same edge-distance test (area and volume include the closing edge). Only shapes
        // on the page being viewed — unlike the older line/count/perimeter tests above, which look at every page.
        if (m.type==="wall"&&m.points.length>=2&&(m.pageNumber??1)===pageNum) {
          for (let i=0;i<m.points.length-1;i++) if (distToSeg(p,m.points[i],m.points[i+1]) < 12/zoomRef.current) return true;
          return false;
        }
        if ((m.type==="area"||m.type==="volume")&&m.points.length>=3&&(m.pageNumber??1)===pageNum) {
          for (let i=0;i<m.points.length;i++) if (distToSeg(p,m.points[i],m.points[(i+1)%m.points.length]) < 12/zoomRef.current) return true;
          return false;
        }
        return false;
      // Second pass, only if no line/edge was hit anywhere: a click INSIDE an area/volume polygon selects it. Done last
      // so a big area never shadows a line, count or perimeter drawn on top of it.
      }) || measurementsRef.current.find(m => (m.type==="area"||m.type==="volume")&&m.points.length>=3&&(m.pageNumber??1)===pageNum&&pointInPolygon(p,m.points)) || null;
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
        const batch = joinBatch("line"); const col = batch.color;
        const asmb = assemblies.find(a=>a.id===linkedAssemblyId);
        const item = costItems.find(i=>i.id===linkedItemId);
        const nm: Measurement = { id:uid(), batchId:batch.id, type:"line", points:[ip[0],snap], result, unit:"ft", label:"", color:col, linkedAssemblyId:linkedAssemblyId||undefined, linkedAssemblyName:asmb?.name, linkedItemId:linkedItemId||undefined, linkedItemName:item?.item_name, timestamp:Date.now(), pageNumber:pageNum };
        const next = [...measurementsRef.current, nm];
        setMeasurements(next); measurementsRef.current = next;
        setInProgress([]); inProgressRef.current = [];
        upsertMeasurementTask(nm);
      }
    } else if (toolRef.current === "wall") {
      const ip = inProgressRef.current;
      if (wallLineModeRef.current === "continuous") {
        if (ip.length === 0) {
          setInProgress([snap]); inProgressRef.current = [snap];
        } else {
          setInProgress(prev => { const n=[...prev,snap]; inProgressRef.current=n; return n; });
        }
      } else {
        // Segment mode: two clicks, finalize immediately
        if (ip.length === 0) {
          setInProgress([snap]); inProgressRef.current = [snap];
        } else {
          const calib = calibRef.current;
          const lengthFt = calib ? dist(ip[0], snap) * calib.feetPerPx : dist(ip[0], snap);
          const heightFt = wallTotalHeightFeetRef.current;
          const result = lengthFt * heightFt;
          const batch = joinBatch("wall"); const col = batch.color;
          const asmb = assemblies.find(a=>a.id===linkedAssemblyId);
          const item = costItems.find(i=>i.id===linkedItemId);
          const nm: Measurement = { id:uid(), batchId:batch.id, type:"wall", points:[ip[0],snap], result, unit:"ft²", label:`${feetInches(lengthFt)} long x ${feetInches(heightFt)} high`, color:col, linkedAssemblyId:linkedAssemblyId||undefined, linkedAssemblyName:asmb?.name, linkedItemId:linkedItemId||undefined, linkedItemName:item?.item_name, timestamp:Date.now(), pageNumber:pageNum, wallLength:lengthFt, wallHeight:heightFt };
          const next = [...measurementsRef.current, nm];
          setMeasurements(next); measurementsRef.current = next;
          setInProgress([]); inProgressRef.current = [];
          upsertMeasurementTask(nm);
        }
      }
    } else if (toolRef.current === "perimeter") {
      // Same click-to-append pattern as wall's continuous mode (~1537-1542), minus the mode switch and the
      // height step entirely — this tool only ever works one way, an open chain of points, no setup needed.
      const ip = inProgressRef.current;
      // Swallow the second click of a double-click that just auto-closed a perimeter, so it doesn't start a
      // stray new path (the double-click that used to be needed to close near the start still "works").
      if (Date.now() - shapeClosedAtRef.current < SHAPE_CLOSE_SWALLOW_MS) return;
      if (ip.length === 0) {
        setInProgress([snap]); inProgressRef.current = [snap];
      } else if (ip.length >= 3 && dist(snap, ip[0]) < GRAB_TOL_PX / zoomRef.current) {
        // Auto-close: snap exactly onto the first point and finish right here (same finish as double-click).
        shapeClosedAtRef.current = Date.now();
        finishPerimeter([...ip, { x: ip[0].x, y: ip[0].y }]);
      } else {
        setInProgress(prev => { const n=[...prev,snap]; inProgressRef.current=n; return n; });
      }
    } else if (toolRef.current === "area" || toolRef.current === "volume") {
      const ip = inProgressRef.current;
      // Same swallow guard as perimeter (see shapeClosedAtRef).
      if (Date.now() - shapeClosedAtRef.current < SHAPE_CLOSE_SWALLOW_MS) return;
      if (ip.length >= 3 && dist(snap, ip[0]) < GRAB_TOL_PX / zoomRef.current) {
        // Auto-close: the click is consumed (not appended) and the polygon closes implicitly onto its first
        // point, exactly as double-click closes it — through the very same finishAreaVolume() (for volume that
        // includes opening the depth prompt).
        shapeClosedAtRef.current = Date.now();
        finishAreaVolume(toolRef.current, ip);
      } else {
        setInProgress(prev => { const n=[...prev,snap]; inProgressRef.current=n; return n; });
      }
    } else if (toolRef.current === "count") {
      const asmb = assemblies.find(a=>a.id===linkedAssemblyId);
      // Count batches span pages: the batch's members are ordinary count measurements, one per page it has
      // points on (a measurement lives on exactly one page). Append to this page's member of the open batch,
      // or start this page's member — same batchId, same colour — if this is the batch's first point here.
      const batch = joinBatch("count");
      const existing = measurementsRef.current.find(m=>m.type==="count"&&m.batchId===batch.id&&(m.pageNumber??1)===pageNum);
      if (existing) {
        const updated = {...existing,points:[...existing.points,snap],result:existing.points.length+1};
        const next = measurementsRef.current.map(m=>m.id===existing.id?updated:m);
        setMeasurements(next); measurementsRef.current = next;
        // Keep the linked BOQ task's quantity tracking the count: add just this click's delta.
        upsertMeasurementTask(updated, existing.result);
      } else {
        const item = costItems.find(i=>i.id===linkedItemId);
        const nm: Measurement = { id:uid(), batchId:batch.id, type:"count", points:[snap], result:1, unit:"ea", label:"", color:batch.color, linkedAssemblyId:linkedAssemblyId||undefined, linkedAssemblyName:asmb?.name, linkedItemId:linkedItemId||undefined, linkedItemName:item?.item_name, timestamp:Date.now(), pageNumber:pageNum };
        const next = [...measurementsRef.current, nm];
        setMeasurements(next); measurementsRef.current = next;
        upsertMeasurementTask(nm);
      }
    }
    scheduleRender();
  }

  function onMouseUp(e: React.MouseEvent) {
    if (draggingVertexRef.current) finishVertexDrag();
    if (draggingOffsetIdRef.current) {
      // A drag that ends only a hair off zero should cleanly settle back to "no offset" — the pixel-identical
      // default rendering — rather than leaving a barely-visible ghost line. Threshold: 3 PDF-units, expressed
      // over zoom so it is a CONSTANT ~3 screen pixels at any zoom (same convention as the 12px/zoom select
      // tolerance elsewhere in this file) — smaller than the true line's own 2.5-3.5px stroke width, so a gap
      // this small is already imperceptible next to the line itself.
      const SNAP_ZERO_PDF = 3;
      const id = draggingOffsetIdRef.current;
      const m = measurementsRef.current.find(x => x.id === id);
      if (m && m.dimensionOffset && Math.abs(m.dimensionOffset) < SNAP_ZERO_PDF/zoomRef.current) {
        const next = measurementsRef.current.map(x => x.id === id ? { ...x, dimensionOffset: undefined } : x);
        setMeasurements(next); measurementsRef.current = next;
        scheduleRender();
      }
    }
    draggingOffsetIdRef.current = null; // ends the drag; the existing debounced auto-save effect picks up the dimensionOffset change on its own
    if (panningRef.current) { panningRef.current = false; }
  }

  // Double-click on the count tool ends its batch (same as the Finish Count button): the next click starts a
  // brand-new batch — new id, new colour.
  function finishCountBatch() {
    endBatch("count");
  }

  // Ends a tool's open batch (the header "Finish <Tool>" buttons and the on-canvas badge). If a shape is still
  // being drawn with that tool it is finished first (so its points aren't lost) and joins the batch before
  // the batch closes; an incomplete stub (e.g. a lone first click) is discarded. A volume whose first shape
  // still needs its depth closes the batch once the depth prompt is confirmed.
  function finishBatch(tool: ToolMode) {
    const ip = inProgressRef.current;
    if (toolRef.current === tool && ip.length > 0) {
      if (tool==="perimeter" && ip.length >= 2) finishPerimeter(ip);
      else if (tool==="wall" && wallLineModeRef.current==="continuous" && ip.length >= 2) finishWall(ip);
      else if ((tool==="area"||tool==="volume") && ip.length >= 3) {
        if (tool==="volume" && activeBatchesRef.current.volume?.depthIn === undefined) { endBatchAfterDepthRef.current = true; finishAreaVolume(tool, ip); return; }
        finishAreaVolume(tool, ip);
      } else { setInProgress([]); inProgressRef.current = []; }
    }
    endBatch(tool);
    scheduleRender();
  }

  // Finish a perimeter from a full point list: a plain linear total in feet (same segment-sum convention as
  // wall's continuous mode, minus height). Shared by the double-click gesture (open path) and the click
  // handler's proximity auto-close (closed path, where the last point has been snapped onto the first, so the
  // closing segment is included in the total automatically).
  function finishPerimeter(pts: Point[]) {
    const calib = calibRef.current;
    let totalLengthFt = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const segPx = dist(pts[i], pts[i+1]);
      totalLengthFt += calib ? segPx * calib.feetPerPx : segPx;
    }
    const batch = joinBatch("perimeter"); const col = batch.color;
    const asmb = assemblies.find(a=>a.id===linkedAssemblyId);
    const item = costItems.find(i=>i.id===linkedItemId);
    const nm: Measurement = { id:uid(), batchId:batch.id, type:"perimeter", points:[...pts], result:totalLengthFt, unit:"ft", label:"", color:col, linkedAssemblyId:linkedAssemblyId||undefined, linkedAssemblyName:asmb?.name, linkedItemId:linkedItemId||undefined, linkedItemName:item?.item_name, timestamp:Date.now(), pageNumber:pageNum };
    const next = [...measurementsRef.current, nm];
    setMeasurements(next); measurementsRef.current = next;
    setInProgress([]); inProgressRef.current = [];
    upsertMeasurementTask(nm);
    scheduleRender();
  }

  // "Finish Perimeter" button: finish the in-progress path as-is, OPEN — the same thing double-click does,
  // and deliberately never the auto-close-near-start snap. Needs 2+ points (a single point has no length).
  function finishPerimeterOpen() {
    const ip = inProgressRef.current;
    if (ip.length >= 2) finishPerimeter(ip);
  }

  // Close an area/volume polygon from its full point list (3+). Shared by the double-click gesture and the
  // click handler's proximity auto-close so both go through exactly one closing path: area is computed and
  // saved here; volume opens the depth prompt (confirmDepth() completes it).
  function finishAreaVolume(t: ToolMode, ip: Point[]) {
    if (t==="volume") {
      const knownDepth = activeBatchesRef.current.volume?.depthIn;
      if (knownDepth !== undefined) {
        // Depth was entered at this batch's first shape: reuse it, no prompt.
        createVolume(ip, knownDepth);
      } else {
        pendingVolumeRef.current = [...ip];
        setShowDepthModal(true);
      }
    } else {
      const calib = calibRef.current;
      const areaPx = polyArea(ip);
      const result = calib ? areaPx * calib.feetPerPx * calib.feetPerPx : areaPx;
      const asmb = assemblies.find(a=>a.id===linkedAssemblyId);
      const item = costItems.find(i=>i.id===linkedItemId);
      const batch = joinBatch("area");
      const nm: Measurement = { id:uid(), batchId:batch.id, type:"area", points:[...ip], result, unit:"ft²", label:"", color:batch.color, linkedAssemblyId:linkedAssemblyId||undefined, linkedAssemblyName:asmb?.name, linkedItemId:linkedItemId||undefined, linkedItemName:item?.item_name, timestamp:Date.now(), pageNumber:pageNum };
      const next = [...measurementsRef.current, nm];
      setMeasurements(next); measurementsRef.current = next;
      upsertMeasurementTask(nm);
    }
    setInProgress([]); inProgressRef.current = [];
    scheduleRender();
  }

  // Finish a continuous-mode wall from its point list (2+): summed length x wall height. Shared by the
  // double-click gesture and the "Finish Wall" button. A wall is a linear run, so there is no auto-close.
  function finishWall(ip: Point[]) {
    const calib = calibRef.current;
    let totalLengthFt = 0;
    for (let i = 0; i < ip.length - 1; i++) {
      const segPx = dist(ip[i], ip[i+1]);
      totalLengthFt += calib ? segPx * calib.feetPerPx : segPx;
    }
    const heightFt = wallTotalHeightFeetRef.current;
    const result = totalLengthFt * heightFt;
    const batch = joinBatch("wall"); const col = batch.color;
    const asmb = assemblies.find(a=>a.id===linkedAssemblyId);
    const item = costItems.find(i=>i.id===linkedItemId);
    const nm: Measurement = { id:uid(), batchId:batch.id, type:"wall", points:[...ip], result, unit:"ft²", label:`${feetInches(totalLengthFt)} long x ${feetInches(heightFt)} high`, color:col, linkedAssemblyId:linkedAssemblyId||undefined, linkedAssemblyName:asmb?.name, linkedItemId:linkedItemId||undefined, linkedItemName:item?.item_name, timestamp:Date.now(), pageNumber:pageNum, wallLength:totalLengthFt, wallHeight:heightFt };
    const next = [...measurementsRef.current, nm];
    setMeasurements(next); measurementsRef.current = next;
    setInProgress([]); inProgressRef.current = [];
    upsertMeasurementTask(nm);
    scheduleRender();
  }

  // "Finish Wall" button handler (continuous mode only; the button is only shown then).
  function finishWallButton() {
    const ip = inProgressRef.current;
    if (wallLineModeRef.current === "continuous" && ip.length >= 2) finishWall(ip);
  }

  // "Finish Area" / "Finish Volume" button handler: a third way to trigger the same finishAreaVolume() that
  // double-click and proximity auto-close already use (3+ points required, as for both of those).
  // Batches with 2+ members that have at least one member on this page, for the grouped Taken rows. Members are
  // gathered from every page (the total is the whole batch); single-member batches stay ordinary rows.
  function takenBatchGroups(): { id: string; members: Measurement[] }[] {
    const out: { id: string; members: Measurement[] }[] = []; const seen = new Set<string>();
    for (const pm of pageMeasurements) {
      if (!pm.batchId || seen.has(pm.batchId)) continue;
      const members = measurements.filter(x => x.batchId === pm.batchId);
      if (members.length >= 2) { seen.add(pm.batchId); out.push({ id: pm.batchId, members }); }
    }
    return out;
  }
  function takenGroupedIds(): Set<string> {
    const ids = new Set<string>();
    for (const g of takenBatchGroups()) for (const x of g.members) ids.add(x.id);
    return ids;
  }

  function finishAreaVolumeButton() {
    const t = toolRef.current, ip = inProgressRef.current;
    if ((t==="area"||t==="volume") && ip.length >= 3) finishAreaVolume(t, ip);
  }

  function onDblClick(e: React.MouseEvent) {
    const t = toolRef.current;
    const ip = inProgressRef.current;
    if (t === "count") {
      finishCountBatch();
    }
    if ((t==="area"||t==="volume") && ip.length >= 3) finishAreaVolume(t, ip);
    if (t==="wall" && wallLineModeRef.current==="continuous" && ip.length >= 2) finishWall(ip);
    if (t==="perimeter" && ip.length >= 2) finishPerimeter(ip);
  }

  // Create one volume measurement from a polygon and a depth in inches, joining the open volume batch (and
  // recording the depth against it if it is the batch's first shape).
  function createVolume(ip: Point[], d: number) {
    const calib = calibRef.current;
    const areaPx = polyArea(ip);
    const areaFt2 = calib ? areaPx * calib.feetPerPx * calib.feetPerPx : areaPx;
    const depthFt = d / 12;
    const result = areaFt2 * depthFt;
    const asmb = assemblies.find(a=>a.id===linkedAssemblyId);
    const item = costItems.find(i=>i.id===linkedItemId);
    const batch = joinBatch("volume");
    if (batch.depthIn === undefined) setBatchDepth("volume", d);
    const nm: Measurement = { id:uid(), batchId:batch.id, type:"volume", points:[...ip], result, unit:"ft³", label:`${d}" deep`, depthIn:d, color:batch.color, linkedAssemblyId:linkedAssemblyId||undefined, linkedAssemblyName:asmb?.name, linkedItemId:linkedItemId||undefined, linkedItemName:item?.item_name, timestamp:Date.now(), pageNumber:pageNum };
    const next = [...measurementsRef.current, nm];
    setMeasurements(next); measurementsRef.current = next;
    upsertMeasurementTask(nm);
  }

  function confirmDepth() {
    const d = parseFloat(depthInches) || 0;
    if (d <= 0 || pendingVolumeRef.current.length < 3) return;
    createVolume(pendingVolumeRef.current, d);
    setShowDepthModal(false); setDepthInches("4"); pendingVolumeRef.current = [];
    if (endBatchAfterDepthRef.current) { endBatchAfterDepthRef.current = false; endBatch("volume"); }
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

  // --- Two-finger touch: pinch-to-zoom + pan ------------------------------------------------------------
  // A single finger is deliberately left alone everywhere below: the browser already turns a one-finger
  // touch into synthetic mouse events (mousedown/mousemove/mouseup) that drive onMouseDown/onMouseMove/
  // onMouseUp above exactly as a real mouse would, and that already works. Calling preventDefault() on a
  // touchstart/touchmove — for ANY number of fingers — is what tells the browser not to synthesize those
  // mouse events, so these handlers only ever call it inside the e.touches.length===2 branch. Reusing the
  // same setZoom/setPan/zoomRef/panRef/clamp(...,0.05,12) that onWheel and the toolbar zoom buttons use, so
  // there is exactly one zoom range and one way zoom/pan state gets updated, not a second parallel one.
  function touchMidpoint(t: React.TouchList): Point {
    return { x: (t[0].clientX + t[1].clientX) / 2, y: (t[0].clientY + t[1].clientY) / 2 };
  }
  function touchDistance(t: React.TouchList): number {
    return Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
  }
  function onTouchStart(e: React.TouchEvent) {
    // Arm an offset-line drag directly from a real touchstart, without waiting for (or depending on) any
    // synthetic mousedown. On many mobile browsers the compatibility mousedown for a touch-and-hold gesture
    // is deferred and only fires together with mouseup/click AFTER the finger lifts — i.e. after the hold-
    // and-slide is already over — so draggingOffsetIdRef was never set in time for onTouchMove's drag-update
    // branch to see it during the actual gesture. Uses the same hitTestOffsetLine() onMouseDown's select-tool
    // branch calls, so both call sites share one hit-test, not two hand-copied versions that could drift.
    if (e.touches.length === 1 && toolRef.current === "select") {
      const t = e.touches[0];
      const p = screenToPdf(t.clientX, t.clientY);
      const rect = containerRef.current?.getBoundingClientRect();
      // Edit mode: arm a vertex press straight from the real touchstart (same reason as the offset line just below:
      // the synthetic mousedown for a touch-and-hold is deferred until after the finger lifts).
      if (editingIdRef.current && rect && hitDeleteHandle(t.clientX - rect.left, t.clientY - rect.top)) {
        e.preventDefault();
        deleteSelectedVertex();
        scheduleRender();
        return;
      }
      if (editingIdRef.current && armVertexDrag(t.clientX, t.clientY)) {
        e.preventDefault();
        scheduleRender();
        return;
      }
      if (rect && hitTestOffsetLine(p, t.clientX - rect.left, t.clientY - rect.top, editingIdRef.current)) {
        // This touch sequence is now ours: suppress the deferred synthetic mouse events entirely so they
        // cannot also fire and redo/interfere once the finger eventually lifts.
        e.preventDefault();
        scheduleRender();
        return;
      }
    }
    // If nothing was hit above (or the tool isn't "select"), fall through completely unchanged: normal
    // single-finger drawing is untouched, since nothing here called preventDefault or set any drag state.
    if (e.touches.length !== 2) return; // 1 finger (or 3+): untouched, no preventDefault — see comment above
    e.preventDefault();
    cancelVertexDrag(); // a second finger turns a vertex press into a pinch: abandon the press
    const c = containerRef.current; if (!c) return;
    const rect = c.getBoundingClientRect();
    const mid = touchMidpoint(e.touches);
    const midLocal = { x: mid.x - rect.left, y: mid.y - rect.top };
    pinchStartDistRef.current = touchDistance(e.touches);
    pinchStartZoomRef.current = zoomRef.current;
    pinchStartAnchorRef.current = {
      x: (midLocal.x - panRef.current.x) / zoomRef.current,
      y: (midLocal.y - panRef.current.y) / zoomRef.current,
    };
    pinchActiveRef.current = true;
  }
  function onTouchMove(e: React.TouchEvent) {
    // A single finger already dragging an offset dimension line (armed either directly by onTouchStart's own
    // hit-test above, or historically by a synthetic mousedown — see onMouseDown's select-tool label/line
    // hit-test) needs its own touch-driven path here: mobile browsers do not fire a continuous stream of
    // synthetic mousemove events while a finger is held and slid across the screen (compatibility mouse
    // events are effectively a mousedown-then-mouseup pair, not interleaved with every touchmove), so
    // onMouseMove's drag-update branch never actually runs during the finger-slide on a real device. This
    // mirrors onMouseMove's own perpendicular-projection math exactly, just reading the touch point directly
    // instead of depending on a synthetic mousemove that mobile browsers do not reliably deliver.
    if (e.touches.length === 1 && draggingVertexRef.current) {
      e.preventDefault();
      updateVertexDrag(e.touches[0].clientX, e.touches[0].clientY);
      return;
    }
    if (e.touches.length === 1 && draggingOffsetIdRef.current) {
      e.preventDefault();
      const t = e.touches[0];
      const p = screenToPdf(t.clientX, t.clientY);
      const start = offsetDragStartRef.current;
      const id = draggingOffsetIdRef.current;
      const moveDx = p.x - start.mousePdf.x, moveDy = p.y - start.mousePdf.y;
      const proj = moveDx*start.normal.x + moveDy*start.normal.y;
      const nextOffset = start.startOffset + proj;
      const next = measurementsRef.current.map(m => m.id === id ? { ...m, dimensionOffset: nextOffset } : m);
      setMeasurements(next); measurementsRef.current = next;
      scheduleRender();
      return;
    }
    if (e.touches.length !== 2) return; // 1 finger: untouched, drawing continues via the synthetic mouse events
    e.preventDefault();
    if (!pinchActiveRef.current || pinchStartDistRef.current === 0) return;
    const c = containerRef.current; if (!c) return;
    const rect = c.getBoundingClientRect();
    const mid = touchMidpoint(e.touches);
    const midLocal = { x: mid.x - rect.left, y: mid.y - rect.top };
    const distNow = touchDistance(e.touches);
    const nz = clamp(pinchStartZoomRef.current * (distNow / pinchStartDistRef.current), 0.05, 12);
    const anchor = pinchStartAnchorRef.current;
    const np = { x: midLocal.x - anchor.x * nz, y: midLocal.y - anchor.y * nz };
    setZoom(nz); zoomRef.current = nz;
    setPan(np); panRef.current = np;
    scheduleRender();
  }
  function onTouchEnd(e: React.TouchEvent) {
    if (draggingVertexRef.current) finishVertexDrag();
    // Mirrors onMouseUp's snap-to-zero exactly, for the same reason the touch-driven drag update above
    // exists: a synthetic mouseup may not reliably follow a real touch-and-drag on every device, so ending
    // the gesture must not depend on it. draggingOffsetIdRef is only ever armed by a single-finger tap (a
    // 2-finger touchstart never touches it), so any touchend seen while it is set means that one finger just
    // lifted — no touches.length check is needed here to know the drag is over.
    if (draggingOffsetIdRef.current) {
      const SNAP_ZERO_PDF = 3;
      const id = draggingOffsetIdRef.current;
      const m = measurementsRef.current.find(x => x.id === id);
      if (m && m.dimensionOffset && Math.abs(m.dimensionOffset) < SNAP_ZERO_PDF/zoomRef.current) {
        const next = measurementsRef.current.map(x => x.id === id ? { ...x, dimensionOffset: undefined } : x);
        setMeasurements(next); measurementsRef.current = next;
        scheduleRender();
      }
      draggingOffsetIdRef.current = null;
    }
    // Dropping to 0 or 1 remaining finger ends the pinch/pan gesture (a lone remaining finger does not
    // resume as a mouse-driven drag here — the synthetic mouse events for it, if any, are unaffected since
    // nothing above ever called preventDefault for it).
    if (e.touches.length < 2) { pinchActiveRef.current = false; pinchStartDistRef.current = 0; }
  }

  // Belt-and-suspenders backstop for the CSS touchAction:"none" on the canvas container below — some
  // browsers don't fully honor touch-action for pinch gestures, so also block the native default at the JS
  // level, same as ProjectPlansPage.tsx. Only ever acts on 2+ fingers, so a single-finger touch (and its
  // synthetic mouse events) is never affected by this either. Attached the same way as the wheel listener
  // above: manually, with { passive: false }, so preventDefault() here actually has an effect.
  useEffect(() => {
    const c = containerRef.current;
    if (!c) return;
    const preventPinch = (e: TouchEvent) => { if (e.touches.length > 1) e.preventDefault(); };
    c.addEventListener("touchstart", preventPinch, { passive: false });
    c.addEventListener("touchmove", preventPinch, { passive: false });
    return () => {
      c.removeEventListener("touchstart", preventPinch);
      c.removeEventListener("touchmove", preventPinch);
    };
  }, []);
  // excludeId: a measurement whose points must not be snapped onto (the one being dragged in edit mode — otherwise
  // its own current position, which is always within tolerance of where it is being dragged, would pull it back).
  function snapToNearby(p: Point, excludeId?: string): Point {
    const tol = 10 / zoomRef.current;
    for (const m of measurementsRef.current) { if (m.id === excludeId) continue; for (const q of m.points) if (dist(p, q) < tol) return q; }
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
      if (e.key === "Escape") { exitEdit(); setInProgress([]); inProgressRef.current = []; setCalibrating(false); calibratingRef.current = false; setCalibPts([]); calibPtsRef.current = []; scheduleRender(); }
      if ((e.key === "Delete" || e.key === "Backspace") && selectedIdRef.current) {
        const next = measurementsRef.current.filter(m=>m.id!==selectedIdRef.current);
        setMeasurements(next); measurementsRef.current = next; pruneBatches(next); setSelectedId(null); selectedIdRef.current = null; scheduleRender();
      }
    }
    function onKeyUp(e: KeyboardEvent) { if (e.code === "Space") spaceRef.current = false; }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => { window.removeEventListener("keydown", onKeyDown); window.removeEventListener("keyup", onKeyUp); };
  }, []);

  // --- Calibration confirm ------------------------------------------------------
  function confirmCalibration() {
    const feetPart = parseFloat(calibFeet) || 0;
    const inchesPart = parseFloat(calibInches) || 0;
    const feet = feetPart + ((inchesPart + calibFraction) / 12);
    if (feet <= 0 || calibPts.length < 2) return;
    const px = dist(calibPts[0], calibPts[1]);
    const nc = { p1: calibPts[0], p2: calibPts[1], feetPerPx: feet / px };
    const next = {
  ...calibrations,
  [pageNum]: nc,
};

setCalibrations(next);

calibRef.current =
  next[pageNum];
    setCalibrating(false); calibratingRef.current = false; setCalibPts([]); calibPtsRef.current = [];
    setShowCalibModal(false);
    if (sessionIdRef.current) { supabase.from("takeoff_sessions").update({ calibration: next }).eq("id", sessionIdRef.current).then(({error}) => { if (error) console.error("CALIBRATION SAVE ERROR:", error); else console.log("CALIBRATION SAVE SUCCESS"); }); } else { console.warn("CALIBRATION NOT SAVED - no sessionId"); }
    scheduleRender();
  }

  // --- Milestone-linked task upsert (fires on each completed measurement) ------
  // Calls are chained one after another: each is a read-then-write of the same project_tasks quantity, so fast
  // successive calls (e.g. rapid count clicks) must not interleave or they would overwrite each other.
  const upsertQueueRef = useRef<Promise<void>>(Promise.resolve());
  function upsertMeasurementTask(nm: Measurement, previousResult?: number): Promise<void> {
    const run = upsertQueueRef.current.then(() => doUpsertMeasurementTask(nm, previousResult));
    upsertQueueRef.current = run.catch(() => {});
    return run;
  }
  // previousResult (count appends only): the measurement's result before this change, so only the difference
  // is added to the task's quantity. Omitted on creation -> the full result is added, exactly as before.
  async function doUpsertMeasurementTask(nm: Measurement, previousResult?: number) {
    const pid = projectId;
    const msId = activeMilestoneIdRef.current;
    if (!msId || !pid) return;
    if (!nm.linkedAssemblyId && !nm.linkedItemId) return;
    try {
      // Apply coverage conversion for rate-library items that have a factor
      const item = nm.linkedItemId ? costItems.find(i => i.id === nm.linkedItemId) : null;
      const cf = item?.coverage_factor;
      const conv = (r: number) => (cf && cf > 0) ? Math.ceil(r / cf) : r;
      const fullQty = conv(nm.result);
      const convertedQty = previousResult !== undefined ? fullQty - conv(previousResult) : fullQty;
      if (previousResult !== undefined && convertedQty === 0) return;
      const sellUnit = (cf && cf > 0 && item?.unit) ? item.unit : nm.unit;

      const q = supabase.from("project_tasks")
        .select("id,quantity")
        .eq("milestone_id", msId)
        .eq("project_id", pid);
      if (nm.linkedAssemblyId) {
        q.eq("linked_assembly_id", nm.linkedAssemblyId);
      } else {
        q.eq("linked_item_id", nm.linkedItemId!).is("linked_assembly_id", null);
      }
      // If several tasks already match (e.g. made by hand on the dashboard) use the EARLIEST one instead of letting the
      // multi-row error read as "none" and inserting yet another; and a real query error must not look like "none" either.
      const { data: existing, error: lookupErr } = await q.order("created_at", { ascending: true }).limit(1).maybeSingle();
      if (lookupErr) throw lookupErr;
      if (existing) {
        await supabase.from("project_tasks")
          .update({ quantity: (existing.quantity || 0) + convertedQty, updated_at: new Date().toISOString() })
          .eq("id", existing.id);
      } else {
        await supabase.from("project_tasks").insert({
          project_id: pid,
          milestone_id: msId,
          task_name: nm.linkedAssemblyName || nm.linkedItemName || nm.label || nm.type,
          linked_assembly_id: nm.linkedAssemblyId || null,
          linked_item_id: nm.linkedItemId || null,
          linked_assembly_name: nm.linkedAssemblyName || null,
          linked_item_name: nm.linkedItemName || null,
          quantity: fullQty,
          unit: sellUnit,
          trade_type: "General Labour",
          rate_per_unit: 0,
          status: "planned",
        });
      }
    } catch(e) { console.error("upsertMeasurementTask:", e); }
  }

  async function createMilestoneAndActivate(name: string) {
    const pid = projectId;
    if (!name.trim() || !pid) return;
    setCreatingMs(true);
    try {
      const companyId = companyIdRef.current;
      if (!companyId) throw new Error("No company");
      const { data: ms, error } = await supabase.from("project_milestones").insert({
        company_id: companyId,
        project_id: pid,
        milestone_name: name.trim(),
        status: "planned",
        milestone_no: projectMilestones.length + 1,
      }).select("id,milestone_name").maybeSingle();
      if (error) throw error;
      if (ms) {
        setProjectMilestones(prev => [...prev, ms]);
        setActiveMilestoneId(ms.id);
        activeMilestoneIdRef.current = ms.id;
        setActiveMilestoneName(ms.milestone_name);
      }
    } catch(e:any) { setError("Could not create milestone: "+e.message); }
    setCreatingMs(false);
    setShowNewMsInput(false);
    setNewMsName("");
  }

  // --- Export & Send to BOQ -----------------------------------------------------
  function exportCSV() {
    const rows = measurements.map(m => [m.type, m.unit === "ft" ? feetInches(m.result) : fmt2(m.result), m.unit, m.linkedAssemblyName||"", m.linkedItemName||""].join(","));
    const csv = ["Type,Result,Unit,Assembly,Item",...rows].join("\n");
    const a = document.createElement("a"); a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv"})); a.download=`takeoff_${Date.now()}.csv`; a.click();
  }

  async function sendToBOQ() {
    await flushMeasurementsSave(pageNum);

  const groups: Record<string, {
    name:string;
    value:number;
    metric:string;
    assemblyId?: string;
    costItemId?: string;
    length?: number;
    height?: number;
    width?: number;
    heightMismatch?: boolean;
  }> = {};

  measurements.forEach(m => {
    // Assembly id, else the linked rate item's id (so two items that share a display name stay separate), else the
    // item name (measurements saved before item ids were carried), else the bare type.
    const key =
      m.linkedAssemblyId ||
      (m.linkedItemId ? "item:" + m.linkedItemId : "") ||
      m.linkedItemName ||
      m.type;

    // Apply coverage conversion for rate-library items with a coverage factor
    const item = m.linkedItemId ? costItems.find(i => i.id === m.linkedItemId) : null;
    const cf = item?.coverage_factor;
    const convertedVal = (cf && cf > 0) ? Math.ceil(m.result / cf) : m.result;
    const sellUnit = (cf && cf > 0 && item?.unit) ? item.unit : m.unit;

    if (!groups[key]) {
      groups[key] = {
        name:
          m.linkedAssemblyName ||
          m.linkedItemName ||
          m.type,
        value: 0,
        metric: sellUnit,
        assemblyId: m.linkedAssemblyId,
        // The rate-library item's real id (never set together with an assembly), so BOQ can look up its rate.
        costItemId: m.linkedAssemblyId ? undefined : m.linkedItemId,
      };
    }

    if (m.type === "wall" && typeof m.wallLength === "number" && typeof m.wallHeight === "number") {
      groups[key].length = (groups[key].length || 0) + m.wallLength;
      if (groups[key].height === undefined) {
        groups[key].height = m.wallHeight;
      } else if (groups[key].height !== m.wallHeight) {
        groups[key].heightMismatch = true;
      }
    }

    groups[key].value += convertedVal;
  });

  const data = Object.values(groups);

  const pid =
    routeProjectId ||
    currentProject?.id;

  if (pid)
    nav(`/projects/${pid}/boq?groups=${encodeURIComponent(JSON.stringify(data))}`);
  else
    nav(`/boq?groups=${encodeURIComponent(JSON.stringify(data))}`);
}
// --- Stats ---------------------------------------------------------------------
  const stats = useMemo(() => ({
    total: pageMeasurements.length,
    lines: pageMeasurements.filter(m=>m.type==="line").reduce((s,m)=>s+m.result, 0),
    areas: pageMeasurements.filter(m=>m.type==="area").reduce((s,m)=>s+m.result, 0),
    counts: pageMeasurements.filter(m=>m.type==="count").reduce((s,m)=>s+m.result, 0),
    volumes: pageMeasurements.filter(m=>m.type==="volume").reduce((s,m)=>s+m.result, 0),
  }), [pageMeasurements]);

  // All matches for each section's own search; the section renders the first asmVisible / itemsVisible of them.
  const filteredAssemblies = useMemo(() => {
    const q = searchAsm.trim().toLowerCase();
    return !q ? assemblies : assemblies.filter(a => (a.name||"").toLowerCase().includes(q)||(a.category||"").toLowerCase().includes(q));
  }, [assemblies, searchAsm]);

  const filteredItems = useMemo(() => {
    const q = searchItems.trim().toLowerCase();
    return !q ? costItems : costItems.filter(i=>(i.item_name||"").toLowerCase().includes(q)||(i.category||"").toLowerCase().includes(q));
  }, [costItems, searchItems]);

  const activeLinkedName = linkedAssemblyId
    ? assemblies.find(a=>a.id===linkedAssemblyId)?.name
    : linkedItemId ? costItems.find(i=>i.id===linkedItemId)?.item_name : null;

  // --- Right panel rail / focus mode ------------------------------------------
  function toggleRight() {
    const next = !rightCollapsed;
    setRightCollapsed(next);
    writeBool(isTablet ? LS_RIGHT_TABLET : LS_RIGHT, next);
  }
  function expandRight(tab: "templates"|"measurements"|"stats") {
    setRightTab(tab);
    if (rightCollapsed) { setRightCollapsed(false); writeBool(isTablet ? LS_RIGHT_TABLET : LS_RIGHT, false); }
  }
  function setFocus(on: boolean) {
    setFocusMode(on); writeBool(LS_FOCUS, on);
    if (on) { pagesBeforeFocusRef.current = pagesPanelCollapsed; setPagesPanelCollapsed(true); setRightCollapsed(true); }
    else { setPagesPanelCollapsed(pagesBeforeFocusRef.current); setRightCollapsed(readBool(isTablet ? LS_RIGHT_TABLET : LS_RIGHT) ?? isTablet); }
  }

  // --- Library lists: the linked assembly / item is pinned to the top of its section (marked "Linked"), whichever page or
  // search would otherwise list it. The rest keep their normal order. Only the ordering changes; linking works as before.
  const pinnedAsm = linkedAssemblyId ? assemblies.find(a => a.id === linkedAssemblyId) || null : null;
  const pinnedItem = linkedItemId ? costItems.find(i => i.id === linkedItemId) || null : null;
  const restAssemblies = pinnedAsm ? filteredAssemblies.filter(a => a.id !== pinnedAsm.id) : filteredAssemblies;
  const restItems = pinnedItem ? filteredItems.filter(i => i.id !== pinnedItem.id) : filteredItems;
  // Rows a section lists = the pinned row (if any) + the rest. The header count and "Showing X of Y" both use these, so they agree.
  const asmTotal = restAssemblies.length + (pinnedAsm ? 1 : 0);
  const itemsTotal = restItems.length + (pinnedItem ? 1 : 0);
  const asmShown = Math.min(asmVisible, restAssemblies.length) + (pinnedAsm ? 1 : 0);
  const itemsShown = Math.min(itemsVisible, restItems.length) + (pinnedItem ? 1 : 0);

  function renderAsmRow(a: Assembly) {
    const active = linkedAssemblyId === a.id;
    return (
      <button key={a.id} onClick={()=>{setLinkedAssemblyId(active?"":a.id);setLinkedItemId("");}}
        className={`w-full text-left rounded-lg px-3 py-2.5 border transition-all flex items-center gap-2.5 ${active?"border-purple-500/30 bg-purple-500/10":"border-slate-100 dark:border-white/[0.05] bg-slate-50 dark:bg-white/[0.02] hover:bg-slate-50 dark:bg-white/[0.04] hover:border-white/[0.09]"}`}>
        <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${active?"bg-purple-500/20":"bg-slate-50 dark:bg-white/[0.04]"}`}>
          <Layers size={12} className={active?"text-purple-400":"text-slate-500 dark:text-slate-600"}/>
        </div>
        <div className="flex-1 min-w-0">
          <div className={`text-[11px] font-semibold truncate ${active?"text-purple-200":"text-slate-700 dark:text-slate-300"}`}>{a.name}</div>
          <div className="text-[9px] text-slate-400 dark:text-slate-700">{a.category||"General"} · {a.componentCount} component{a.componentCount!==1?"s":""}{a.unit?` · ${a.unit}`:""}</div>
        </div>
        {active && <Check size={12} className="text-purple-400 flex-shrink-0"/>}
      </button>
    );
  }
  function renderItemRow(i: CostItem) {
    const active = linkedItemId === i.id;
    return (
      <button key={i.id} onClick={()=>{setLinkedItemId(active?"":i.id);setLinkedAssemblyId("");}}
        className={`w-full text-left rounded-lg px-3 py-2 border transition-all flex items-center gap-2 ${active?"border-blue-500/30 bg-blue-500/10":"border-slate-100 dark:border-white/[0.05] bg-slate-50 dark:bg-white/[0.02] hover:bg-slate-50 dark:bg-white/[0.04]"}`}>
        <div className="flex-1 min-w-0">
          <div className={`text-[11px] font-medium truncate ${active?"text-blue-200":"text-slate-600 dark:text-slate-400"}`}>{i.item_name}</div>
          <div className="text-[9px] text-slate-400 dark:text-slate-700">{i.category||"—"}{i.unit?` · ${i.unit}`:""}</div>
        </div>
        {active && <Check size={11} className="text-blue-400 flex-shrink-0"/>}
      </button>
    );
  }

  const curTool = TOOL_CFG[tool];

  // --- Mobile: swap in the plan-viewer + manual-entry experience. All hooks
  // above have already run unconditionally, so it's safe to branch here.
  if (isMobile) {
    return (
      <TakeoffMobileView
        project={currentProject}
        measurements={measurements}
        pdfUrl={pdfSignedUrl}
        costItems={costItems}
        onAddMeasurement={(m) => {
          const withPage = { ...m, pageNumber: pageNum };
          const next = [...measurementsRef.current, withPage];
          setMeasurements(next); measurementsRef.current = next;
        }}
        onDeleteMeasurement={(id) => {
          const next = measurementsRef.current.filter(m => m.id !== id);
          setMeasurements(next); measurementsRef.current = next;
          if (selectedIdRef.current === id) { setSelectedId(null); selectedIdRef.current = null; }
        }}
        onSendToBOQ={sendToBOQ}
      />
    );
  }

  // --- Render -------------------------------------------------------------------
  return (
    <div className="flex h-screen flex-col bg-slate-50 dark:bg-[#080b10] text-slate-900 dark:text-slate-100 select-none overflow-hidden">

      {/* -- Top Bar -- */}
      {!focusMode && <header className="flex-shrink-0 h-12 flex items-center gap-3 px-4 bg-white dark:bg-[#0d1117] border-b border-slate-200 dark:border-white/[0.06] z-20">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-xl bg-gradient-to-br from-sky-500 to-blue-700 flex items-center justify-center flex-shrink-0">
            <Ruler size={14} className="text-white"/>
          </div>
          <span className="text-sm font-bold text-slate-900 dark:text-slate-100">Takeoff</span>
          {currentProject && !isTablet && <><span className="text-white/20 text-xs">·</span><span className="text-xs text-slate-500 truncate max-w-[140px]">{currentProject.name}</span></>}
        </div>

        {/* Page nav */}
        {pdfDoc && (
          <div className="flex items-center gap-1 bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.07] rounded-lg px-1.5 py-1">
            <button onClick={()=>setPageNum(v=>Math.max(1,v-1))} disabled={pageNum<=1}
              className="p-0.5 rounded hover:bg-white/10 text-slate-500 dark:text-slate-600 hover:text-slate-700 dark:text-slate-300 disabled:opacity-30 transition"><ChevronLeft size={13}/></button>
            <span className="text-[10px] text-slate-500 px-1">{pageNum}/{numPages}</span>
            <button onClick={()=>setPageNum(v=>Math.min(numPages,v+1))} disabled={pageNum>=numPages}
              className="p-0.5 rounded hover:bg-white/10 text-slate-500 dark:text-slate-600 hover:text-slate-700 dark:text-slate-300 disabled:opacity-30 transition"><ChevronRight size={13}/></button>
          </div>
        )}

        <div className="flex-1"/>

        {/* Calibrate status */}
        <button onClick={()=>{setCalibrating(true);calibratingRef.current=true;setCalibPts([]);calibPtsRef.current=[];}}
          title={calibration ? `Calibrated: ${feetInches(dist(calibration.p1, calibration.p2) * calibration.feetPerPx)} (1px = ${calibration.feetPerPx.toFixed(5)} ft)` : "Click to set scale"}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[11px] font-medium transition ${calibrating?"bg-amber-500/15 border-amber-400/30 text-amber-300":calibration?"bg-emerald-500/10 border-emerald-500/20 text-emerald-300":"bg-slate-50 dark:bg-white/[0.04] border-slate-200 dark:border-white/[0.08] text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:text-slate-200"}`}>
          <Crosshair size={12}/>
          {!isTablet && (calibrating ? "Click 2 points…" : calibration ? `Scale: ${feetInches(dist(calibration.p1, calibration.p2) * calibration.feetPerPx)}` : "Set Scale")}
        </button>
        {calibration && !calibrating && (
          <button onClick={()=>{
              setCalibrations(prev => {
  const next = { ...prev };
  delete next[pageNum];
  return next;
});

calibRef.current = null;
              if (sessionIdRef.current) supabase.from("takeoff_sessions").update({ calibration: calibrations }).eq("id", sessionIdRef.current);
            }}
            title="Clear calibration and start over"
            className="flex items-center justify-center w-6 h-6 rounded-lg border border-slate-200 dark:border-white/[0.08] text-slate-500 dark:text-slate-400 hover:text-red-400 hover:border-red-500/30 transition">
            <X size={11}/>
          </button>
        )}

        {/* Done editing: shown only while a measurement is in edit mode (its points show handles). Esc does the same. */}
        {editingId && (
          <button onClick={exitEdit} title="Stop editing points (Esc)"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-[11px] font-bold transition shadow-sm">
            <Check size={12}/>{!isTablet && " Done editing"}
          </button>
        )}

        {/* Finish <Tool>: ends that tool's open BATCH (all shapes drawn since the last Finish are one group).
            Shown whenever the current tool has an open batch — including between shapes, when nothing is in
            progress. A shape still being drawn is finished first (see finishBatch). */}
        {BATCH_TOOLS.includes(tool) && activeBatches[tool] && (
          <button onClick={()=>finishBatch(tool)} title="End this batch — the next shape starts a new group (new colour)"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold transition shadow-sm">
            <Check size={12}/>{!isTablet && ` Finish ${BATCH_LABEL[tool]}`}
          </button>
        )}

        {/* Finish Shape: complete the path/polygon currently being drawn WITHOUT ending the batch — the
            stylus-friendly alternative to double-click. Perimeter/continuous wall: 2+ points (finishes open,
            never close-snapped); area/volume: 3+ points (volume prompts for depth at the batch's first shape). */}
        {((tool==="perimeter" && inProgress.length >= 2) || (tool==="wall" && wallLineMode==="continuous" && inProgress.length >= 2) || ((tool==="area" || tool==="volume") && inProgress.length >= 3)) && (
          <button onClick={tool==="perimeter" ? finishPerimeterOpen : tool==="wall" ? finishWallButton : finishAreaVolumeButton}
            title="Finish the shape being drawn and add it to the batch — the next click starts another shape"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-[11px] font-bold transition shadow-sm">
            <Check size={12}/>{!isTablet && " Finish Shape"}
          </button>
        )}

        {/* Focus mode */}
        <button onClick={()=>setFocus(true)} title="Focus mode: hide this bar and the side panels for more room"
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-white/[0.04] hover:bg-slate-200 dark:bg-white/[0.07] border border-slate-200 dark:border-white/[0.08] text-[11px] text-slate-600 dark:text-slate-400 transition">
          <Maximize2 size={12}/>{!isTablet && " Focus"}
        </button>

        {/* Upload */}
        <label title={isTablet ? "Upload PDF" : undefined} className="cursor-pointer flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-50 dark:bg-white/[0.04] hover:bg-slate-200 dark:bg-white/[0.07] border border-slate-200 dark:border-white/[0.08] text-[11px] text-slate-700 dark:text-slate-300 font-medium transition">
          <Upload size={12}/>{!isTablet && " Upload PDF"}
          <input type="file" accept=".pdf" className="hidden" onChange={e=>onPickFile(e.target.files?.[0]||null)}/>
        </label>

        {/* Export */}
        <button onClick={exportCSV} title={isTablet ? "Export" : undefined} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-white/[0.04] hover:bg-slate-200 dark:bg-white/[0.07] border border-slate-200 dark:border-white/[0.08] text-[11px] text-slate-600 dark:text-slate-400 transition">
          <Download size={12}/>{!isTablet && " Export"}
        </button>

        {/* Send to BOQ */}
        <button onClick={sendToBOQ} disabled={measurements.length===0}
          title={isTablet ? "Send to BOQ" : undefined}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-[11px] font-bold disabled:opacity-40 transition shadow-sm">
          <Send size={12}/>{!isTablet && " Send to BOQ"}
        </button>
      </header>}

      {/* -- Main layout -- */}
      <div className="flex flex-1 min-h-0">

        {/* -- Left Tool Bar -- */}
        <div className="flex-shrink-0 w-14 flex flex-col items-center py-3 gap-1 bg-white dark:bg-[#0d1117] border-r border-slate-200 dark:border-white/[0.06] z-10">
          {(Object.entries(TOOL_CFG) as [ToolMode, typeof TOOL_CFG[ToolMode]][]).map(([key, cfg]) => (
            <button key={key} onClick={()=>{if(key==="wall"){setShowWallSetup(true);return;}setTool(key);toolRef.current=key;setInProgress([]);inProgressRef.current=[];scheduleRender();}}
              title={`${cfg.label} (${cfg.shortcut})`}
              className={`w-10 h-10 rounded-xl flex flex-col items-center justify-center gap-0.5 border transition-all ${tool===key?"border-white/20 bg-white/10":"border-transparent hover:bg-slate-100 dark:bg-white/[0.05] hover:border-slate-200 dark:border-white/[0.07]"}`}>
              <span style={{color:tool===key?cfg.color:"#475569"}}>{cfg.icon}</span>
              <span className={`text-[7px] font-bold uppercase tracking-wider ${tool===key?"text-slate-700 dark:text-slate-300":"text-slate-400 dark:text-slate-700"}`}>{cfg.label.slice(0,3)}</span>
            </button>
          ))}

          <div className="flex-1"/>

          {/* Zoom controls */}
          <button onClick={()=>{setZoom(v=>clamp(v*1.2,0.05,12));scheduleRender();}} className="w-10 h-10 rounded-xl flex items-center justify-center hover:bg-slate-100 dark:bg-white/[0.05] text-slate-500 dark:text-slate-600 hover:text-slate-700 dark:text-slate-300 transition"><ZoomIn size={15}/></button>
          <button onClick={()=>{setZoom(v=>clamp(v*0.8,0.05,12));scheduleRender();}} className="w-10 h-10 rounded-xl flex items-center justify-center hover:bg-slate-100 dark:bg-white/[0.05] text-slate-500 dark:text-slate-600 hover:text-slate-700 dark:text-slate-300 transition"><ZoomOut size={15}/></button>
          <button onClick={fitView} className="w-10 h-10 rounded-xl flex items-center justify-center hover:bg-slate-100 dark:bg-white/[0.05] text-slate-500 dark:text-slate-600 hover:text-slate-700 dark:text-slate-300 transition" title="Fit view"><Maximize2 size={15}/></button>
        </div>


        {/* -- Pages Panel -- */}
        <div className={`flex-shrink-0 flex flex-col bg-white dark:bg-[#0d1117] border-r border-slate-200 dark:border-white/[0.06] z-10 transition-all ${pagesPanelCollapsed ? "w-10" : "w-64"}`}>
          <button onClick={()=>setPagesPanelCollapsed(v=>!v)}
            className="flex items-center justify-center h-10 hover:bg-slate-100 dark:bg-white/[0.05] text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:text-slate-300 transition border-b border-slate-200 dark:border-white/[0.06]"
            title={pagesPanelCollapsed ? "Show pages" : "Hide pages"}>
            {pagesPanelCollapsed ? <ChevronRight size={14}/> : <ChevronLeft size={14}/>}
            {!pagesPanelCollapsed && <span className="text-[10px] font-bold uppercase tracking-wider ml-1.5">Pages</span>}
          </button>
          {!pagesPanelCollapsed && (
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {pdfFiles.length === 0 && (
                <div className="text-[10px] text-slate-400 dark:text-slate-700 text-center py-6 px-2">No PDF uploaded yet</div>
              )}
              {pdfFiles.map((file, fIdx) => (
                <div key={fIdx} className="mb-3">
                  <div className="flex items-center justify-between px-1.5 py-1 mb-1">
                    <span className="text-[10px] font-semibold text-slate-600 dark:text-slate-400 truncate flex-1" title={file.name}>{file.name}</span>
                    <button onClick={()=>deletePdfFile(fIdx)} title="Delete this PDF file"
                      className="p-0.5 rounded text-slate-400 dark:text-slate-700 hover:text-red-400 transition flex-shrink-0">
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
                          <span className="text-[10px] text-slate-500 dark:text-slate-600 flex-1 truncate">Page {pn} (hidden)</span>
                          <button onClick={()=>setPageMeta(prev=>({...prev, [key]: {...prev[key], hidden: false}}))}
                            title="Unhide page" className="p-0.5 rounded text-slate-500 dark:text-slate-600 hover:text-emerald-400 transition">
                            <Eye size={11}/>
                          </button>
                        </div>
                      );
                    }
                    return (
                      <div key={pn} className={`flex items-center gap-1 px-1.5 py-1 rounded-lg group transition ${isActive ? "bg-sky-500/15 border border-sky-500/30" : "hover:bg-slate-50 dark:bg-white/[0.04]"}`}>
                        <button onClick={()=>{setActivePdfIdx(fIdx);setPageNum(pn);}}
                          className={`text-[11px] flex-1 text-left truncate ${isActive ? "text-sky-300 font-semibold" : "text-slate-600 dark:text-slate-400"}`}>
                          {meta.label || `Page ${pn}`}
                        </button>
                        <button onClick={()=>{
                            const newLabel = window.prompt("Label for this page:", meta.label || `Page ${pn}`);
                            if (newLabel !== null) setPageMeta(prev=>({...prev, [key]: {...prev[key], label: newLabel.trim() || undefined}}));
                          }}
                          title="Rename page" className="p-0.5 rounded text-slate-400 dark:text-slate-700 hover:text-sky-400 transition opacity-0 group-hover:opacity-100 flex-shrink-0">
                          <Edit2 size={10}/>
                        </button>
                        <button onClick={()=>setPageMeta(prev=>({...prev, [key]: {...prev[key], hidden: true}}))}
                          title="Hide page" className="p-0.5 rounded text-slate-400 dark:text-slate-700 hover:text-amber-400 transition opacity-0 group-hover:opacity-100 flex-shrink-0">
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
        {/* -- Canvas Area -- */}
        <div className="flex-1 relative min-w-0 overflow-hidden bg-slate-50 dark:bg-[#080b10]"
          ref={containerRef}
          style={{ cursor: panningRef.current ? "grabbing" : (spaceRef.current || tool==="pan") ? "grab" : tool==="select" ? "default" : "crosshair", touchAction: "none" }}
          onMouseMove={onMouseMove}
          onMouseDown={onMouseDown}
          onMouseUp={onMouseUp}
          onDoubleClick={onDblClick}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}

          onContextMenu={e=>e.preventDefault()}>

          <canvas ref={canvasRef} className="absolute inset-0"/>

          {/* Open-batch reminder: shown whenever ANY tool has an open batch, on every PDF page (it reads the whole
              measurement list, not the current page). Its Finish button also works in Focus mode, where the top
              bar is hidden. Stops mouse/touch events so tapping it never draws or pans. */}
          {BATCH_TOOLS.some(t => activeBatches[t]) && (
            <div className="absolute top-16 left-3 z-20 flex flex-col gap-1.5 max-w-[92%]"
              onMouseDown={e=>e.stopPropagation()} onMouseUp={e=>e.stopPropagation()} onDoubleClick={e=>e.stopPropagation()}
              onTouchStart={e=>e.stopPropagation()} onTouchMove={e=>e.stopPropagation()} onTouchEnd={e=>e.stopPropagation()}>
              {BATCH_TOOLS.filter(t => activeBatches[t]).map(t => {
                const b = activeBatches[t]!;
                const members = measurements.filter(m => m.batchId === b.id);
                const total = members.reduce((sum, m) => sum + m.result, 0);
                const unit = members[0]?.unit ?? "";
                return (
                  <div key={t} className="flex items-center gap-2 rounded-xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#0d1117]/95 backdrop-blur px-3 py-1.5 shadow-lg">
                    <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{backgroundColor:b.color}}/>
                    <span className="text-[11px] text-slate-700 dark:text-slate-300">
                      {t==="count"
                        ? `Counting: ${Math.round(total)} — tap Finish when done`
                        : `${BATCH_LABEL[t]} batch: ${members.length} shape${members.length===1?"":"s"}, ${fmtBatchTotal(unit, total)} so far — tap Finish when done`}
                    </span>
                    <button onClick={()=>finishBatch(t)} className="px-2 py-0.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-bold flex-shrink-0">Finish</button>
                  </div>
                );
              })}
            </div>
          )}

          {/* Focus mode: the top bar is hidden, so its three working buttons live in a slim strip in the canvas top-left corner,
              away from the calibration banner (top centre), the error toast (top right) and the Exit button (bottom right).
              The strip stops mouse events so clicking it never draws or pans. */}
          {focusMode && (
            <div className="absolute top-3 left-3 z-20 flex items-center gap-1 rounded-xl border border-slate-200 dark:border-white/[0.08] bg-white/95 dark:bg-[#0d1117]/95 backdrop-blur p-1 shadow-lg"
              onMouseDown={e=>e.stopPropagation()} onMouseUp={e=>e.stopPropagation()} onDoubleClick={e=>e.stopPropagation()}>
              <button onClick={()=>{setCalibrating(true);calibratingRef.current=true;setCalibPts([]);calibPtsRef.current=[];}}
                title={calibrating ? "Click 2 points on the drawing" : calibration ? `Scale: ${feetInches(dist(calibration.p1, calibration.p2) * calibration.feetPerPx)} (click to reset)` : "Set Scale"}
                className={`w-8 h-8 rounded-lg flex items-center justify-center transition ${calibrating?"bg-amber-500/15 text-amber-300":calibration?"bg-emerald-500/10 text-emerald-400":"text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/[0.05]"}`}>
                <Crosshair size={14}/>
              </button>
              <button onClick={exportCSV} title="Export"
                className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/[0.05] transition">
                <Download size={14}/>
              </button>
              <button onClick={sendToBOQ} disabled={measurements.length===0} title="Send to BOQ"
                className="w-8 h-8 rounded-lg flex items-center justify-center bg-cyan-600 hover:bg-cyan-500 text-white disabled:opacity-40 transition">
                <Send size={14}/>
              </button>
            </div>
          )}

          {/* Empty state */}
          {!pdfDoc && !loadingPdf && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 pointer-events-none">
              <div className="w-20 h-20 rounded-3xl border border-slate-200 dark:border-white/[0.07] bg-slate-50 dark:bg-white/[0.02] flex items-center justify-center">
                <FileText size={36} className="text-slate-300 dark:text-slate-700"/>
              </div>
              <div className="text-center">
                <div className="text-base font-semibold text-slate-600 dark:text-slate-400 mb-1">No drawing loaded</div>
                <div className="text-xs text-slate-400 dark:text-slate-700">Upload a PDF plan to start measuring</div>
              </div>
              <div className="flex items-center gap-8 mt-2">
                {(Object.entries(TOOL_CFG) as [ToolMode, typeof TOOL_CFG[ToolMode]][]).filter(([k])=>k!=="select").map(([k,cfg])=>(
                  <div key={k} className="flex flex-col items-center gap-1.5">
                    <div className="w-9 h-9 rounded-xl border border-slate-200 dark:border-white/[0.06] bg-slate-50 dark:bg-white/[0.03] flex items-center justify-center" style={{color:cfg.color}}>{cfg.icon}</div>
                    <span className="text-[9px] text-slate-400 dark:text-slate-700 uppercase tracking-wider">{cfg.label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Loading */}
          {loadingPdf && (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-50 dark:bg-[#080b10]/70 backdrop-blur-sm pointer-events-none">
              <div className="flex items-center gap-2.5 rounded-xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#0d1117] px-4 py-3 shadow-xl">
                <RefreshCw size={14} className="animate-spin text-sky-400"/>
                <span className="text-xs text-slate-600 dark:text-slate-400">Loading drawing…</span>
              </div>
            </div>
          )}

          {/* Calibration banner */}
          {calibrating && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2.5 rounded-xl border border-amber-500/25 bg-white dark:bg-[#0d1117]/95 backdrop-blur px-4 py-2.5 shadow-xl pointer-events-auto">
              <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse flex-shrink-0"/>
              <span className="text-xs text-amber-300 font-medium">Click 2 known points on the drawing · <kbd className="bg-white/10 px-1 rounded text-[10px]">Esc</kbd> to cancel</span>
              <span className="text-xs text-amber-500 ml-1">{calibPts.length}/2 placed</span>
              <button onClick={()=>{setCalibrating(false);calibratingRef.current=false;setCalibPts([]);calibPtsRef.current=[];}} className="ml-1 text-slate-500 dark:text-slate-600 hover:text-slate-700 dark:text-slate-300"><X size={13}/></button>
            </div>
          )}

          {/* Tool hint */}
          {tool!=="select"&&!calibrating&&(
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 rounded-xl border border-slate-200 dark:border-white/[0.07] bg-white dark:bg-[#0d1117]/90 backdrop-blur px-3.5 py-2 shadow-xl pointer-events-none">
              <span style={{color:curTool.color}}>{curTool.icon}</span>
              <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">{curTool.label}</span>
              <span className="text-[10px] text-slate-500 dark:text-slate-600">— {curTool.desc}</span>
              {tool==="line"&&inProgress.length===1&&<span className="text-[10px] text-sky-400 ml-1">· Click endpoint to finish</span>}
              {(tool==="area"||tool==="volume")&&inProgress.length>0&&<span className="text-[10px] text-violet-400 ml-1">· {inProgress.length} pts · double-click to close</span>}
            </div>
          )}

          {/* Zoom indicator */}
          <div className="absolute bottom-4 left-4 z-10 rounded-lg border border-slate-200 dark:border-white/[0.07] bg-white dark:bg-[#0d1117]/90 px-2.5 py-1 pointer-events-none">
            <span className="text-[10px] font-mono text-slate-500 dark:text-slate-600">{Math.round(zoom*100)}%</span>
          </div>

          {/* Error */}
          {error && (
            <div className="absolute top-4 right-4 z-20 flex items-center gap-2 rounded-xl border border-red-500/20 bg-white dark:bg-[#0d1117]/95 px-3 py-2.5 shadow-xl max-w-72">
              <AlertCircle size={13} className="text-red-400 flex-shrink-0"/>
              <span className="text-[11px] text-red-300">{error}</span>
              <button onClick={()=>setError(null)} className="ml-auto text-slate-400 dark:text-slate-700 hover:text-slate-600 dark:text-slate-400"><X size={12}/></button>
            </div>
          )}
        </div>

        {/* -- Right Panel -- */}
        <div className={`flex-shrink-0 flex flex-col bg-white dark:bg-[#0d1117] border-l border-slate-200 dark:border-white/[0.06] z-10 transition-all ${rightCollapsed ? "w-10" : "w-72"}`}>
          {rightCollapsed ? (
            /* Rail: expand button, one icon per tab, and a dot + short label for whatever is linked */
            <div className="flex flex-col items-center py-2 gap-1">
              <button onClick={toggleRight} title="Show panel"
                className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/[0.05] hover:text-slate-700 dark:hover:text-slate-300 transition">
                <ChevronLeft size={14}/>
              </button>
              {([["templates","Templates",<BookOpen size={14}/>],["measurements","Taken",<Ruler size={14}/>],["stats","Summary",<BarChart2 size={14}/>]] as const).map(([k,label,icon])=>(
                <button key={k} onClick={()=>expandRight(k)} title={label}
                  className={`w-8 h-8 rounded-lg flex items-center justify-center hover:bg-slate-100 dark:hover:bg-white/[0.05] transition ${rightTab===k?"text-sky-400":"text-slate-400 dark:text-slate-600 hover:text-slate-600 dark:hover:text-slate-300"}`}>
                  {icon}
                </button>
              ))}
              {activeLinkedName && (
                <button onClick={()=>expandRight("templates")} title={`Linked: ${activeLinkedName}`} className="mt-2 flex flex-col items-center gap-1.5">
                  <span className={`w-2.5 h-2.5 rounded-full animate-pulse ${linkedAssemblyId?"bg-purple-400":"bg-blue-400"}`}/>
                  <span className={`text-[9px] font-semibold ${linkedAssemblyId?"text-purple-300":"text-blue-300"}`} style={{writingMode:"vertical-rl"}}>{activeLinkedName.length>16?activeLinkedName.slice(0,15)+"…":activeLinkedName}</span>
                </button>
              )}
            </div>
          ) : (<>


          {/* Tabs */}
          <div className="flex border-b border-slate-200 dark:border-white/[0.06]">
            {([["templates","Templates"],["measurements","Taken"],["stats","Summary"]] as const).map(([k,label])=>(
              <button key={k} onClick={()=>setRightTab(k)}
                className={`flex-1 py-2.5 text-[10px] font-bold uppercase tracking-widest border-b-2 transition-colors ${rightTab===k?"border-sky-500 text-sky-300":"border-transparent text-slate-400 dark:text-slate-700 hover:text-slate-500"}`}>
                {label}
              </button>
            ))}
            <button onClick={toggleRight} title="Hide panel"
              className="w-9 flex-shrink-0 flex items-center justify-center border-b-2 border-transparent text-slate-400 dark:text-slate-600 hover:text-slate-600 dark:hover:text-slate-300 transition">
              <ChevronRight size={14}/>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto">

            {/* -- Templates Tab -- */}
            {rightTab==="templates"&&(
              <div className="p-3 space-y-3">

                {/* ── Milestone picker ── */}
                <div className="rounded-xl border border-slate-200 dark:border-white/[0.07] overflow-hidden">
                  <div className="flex items-center gap-1.5 px-3 py-2 bg-slate-50 dark:bg-white/[0.02] border-b border-slate-100 dark:border-white/[0.05]">
                    <Flag size={10} className="text-emerald-400"/>
                    <span className="text-[9px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-600 flex-1">Milestone</span>
                    {activeMilestoneId && (
                      <button onClick={()=>{setActiveMilestoneId("");activeMilestoneIdRef.current="";setActiveMilestoneName("");}} className="text-slate-400 dark:text-slate-500 hover:text-red-400 transition"><X size={10}/></button>
                    )}
                  </div>
                  <div className="p-2 space-y-1.5">
                    {activeMilestoneId ? (
                      <div className="flex items-center gap-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-3 py-2">
                        <div className="w-2 h-2 rounded-full bg-emerald-400 flex-shrink-0 animate-pulse"/>
                        <span className="text-[11px] text-emerald-300 font-semibold truncate flex-1">{activeMilestoneName}</span>
                      </div>
                    ) : (
                      <>
                        {projectMilestones.length > 0 && (
                          <select value="" onChange={e=>{
                            const ms = projectMilestones.find(m=>m.id===e.target.value);
                            if(ms){setActiveMilestoneId(ms.id);activeMilestoneIdRef.current=ms.id;setActiveMilestoneName(ms.milestone_name);}
                          }} className="w-full bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.07] rounded-lg px-2 py-1.5 text-[11px] text-slate-700 dark:text-slate-300 outline-none focus:border-emerald-500/40">
                            <option value="">Pick a milestone…</option>
                            {projectMilestones.map(m=>(
                              <option key={m.id} value={m.id}>{m.milestone_name}</option>
                            ))}
                          </select>
                        )}
                        {!showNewMsInput ? (
                          <button onClick={()=>setShowNewMsInput(true)}
                            className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded-lg border border-dashed border-emerald-500/30 text-[10px] text-emerald-500/70 hover:text-emerald-400 hover:border-emerald-500/50 transition">
                            <Plus size={10}/> New milestone
                          </button>
                        ) : (
                          <div className="flex gap-1">
                            <input autoFocus value={newMsName} onChange={e=>setNewMsName(e.target.value)}
                              onKeyDown={e=>{if(e.key==="Enter")createMilestoneAndActivate(newMsName);if(e.key==="Escape"){setShowNewMsInput(false);setNewMsName("");}}}
                              placeholder="Milestone name…"
                              className="flex-1 bg-slate-50 dark:bg-white/[0.04] border border-emerald-500/30 rounded-lg px-2 py-1 text-[11px] text-slate-700 dark:text-slate-300 outline-none focus:border-emerald-500/60"/>
                            <button onClick={()=>createMilestoneAndActivate(newMsName)} disabled={creatingMs||!newMsName.trim()}
                              className="px-2 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-bold disabled:opacity-40 transition">
                              {creatingMs?"…":"Add"}
                            </button>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {/* Active link */}
                {activeLinkedName && (
                  <div className="flex items-center gap-2 rounded-lg bg-sky-500/10 border border-sky-500/20 px-3 py-2">
                    <div className="w-2 h-2 rounded-full bg-sky-400 flex-shrink-0 animate-pulse"/>
                    <span className="text-[11px] text-sky-300 font-semibold truncate flex-1">{activeLinkedName}</span>
                    <button onClick={()=>{setLinkedAssemblyId("");setLinkedItemId("");}} className="text-slate-500 dark:text-slate-600 hover:text-slate-600 dark:text-slate-400"><X size={11}/></button>
                  </div>
                )}

                {/* Instruction */}
                {!activeLinkedName && (
                  <div className="text-[10px] text-slate-400 dark:text-slate-700 bg-slate-50 dark:bg-white/[0.02] border border-slate-100 dark:border-white/[0.05] rounded-lg px-3 py-2 leading-relaxed">
                    {activeMilestoneId ? "Select a template or item, then draw on the plan." : "Pick a milestone above, then select a template and draw."}
                  </div>
                )}

                {/* Assemblies */}
                {assemblies.length > 0 && (
                  <CollapsibleSection
                    title="Assemblies (Templates)" count={asmTotal} storageKey="takeoff_lib_assemblies_open"
                    icon={<Wand2 size={10} className="text-purple-400 flex-shrink-0"/>}
                    summary={linkedAssemblyId && activeLinkedName ? <span className="text-[10px] text-purple-300 font-semibold truncate max-w-[120px]" title={activeLinkedName}>● {activeLinkedName}</span> : undefined}>
                    <div className="relative">
                      <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-600 pointer-events-none"/>
                      <input value={searchAsm} onChange={e=>{setSearchAsm(e.target.value);setAsmVisible(LIB_PAGE);}}
                        placeholder="Search assemblies…"
                        className="w-full bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.07] rounded-lg pl-7 pr-2 py-2 text-[11px] text-slate-700 dark:text-slate-300 placeholder:text-slate-400 dark:placeholder:text-slate-600 outline-none focus:border-sky-500/40"/>
                    </div>
                    {pinnedAsm && (
                      <div className="space-y-1">
                        <div className="px-1 text-[8px] font-bold uppercase tracking-widest text-purple-400/80">Linked</div>
                        {renderAsmRow(pinnedAsm)}
                        {restAssemblies.length > 0 && <div className="border-t border-slate-200 dark:border-white/[0.07] mt-2"/>}
                      </div>
                    )}
                    <div className="space-y-1">
                      {restAssemblies.slice(0, asmVisible).map(renderAsmRow)}
                    </div>
                    {filteredAssemblies.length === 0 && (
                      <div className="text-[10px] text-slate-400 dark:text-slate-700 text-center py-3">No assemblies match.</div>
                    )}
                    {restAssemblies.length > 0 && (
                      <div className="flex items-center justify-between gap-2 pt-1">
                        <span className="text-[10px] text-slate-400 dark:text-slate-600">Showing {asmShown} of {asmTotal}</span>
                        {asmVisible < restAssemblies.length && (
                          <button onClick={()=>setAsmVisible(v=>v+LIB_PAGE)}
                            className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-white/[0.08] text-[10px] font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-white/[0.04] transition">
                            Show {Math.min(LIB_PAGE, restAssemblies.length - asmVisible)} more
                          </button>
                        )}
                      </div>
                    )}
                  </CollapsibleSection>
                )}

                {/* Items */}
                {costItems.length > 0 && (
                  <CollapsibleSection
                    title="Rate Library Items" count={itemsTotal} storageKey="takeoff_lib_items_open"
                    icon={<Package size={10} className="text-blue-400 flex-shrink-0"/>}
                    summary={linkedItemId && activeLinkedName ? <span className="text-[10px] text-blue-300 font-semibold truncate max-w-[120px]" title={activeLinkedName}>● {activeLinkedName}</span> : undefined}>
                    <div className="relative">
                      <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-600 pointer-events-none"/>
                      <input value={searchItems} onChange={e=>{setSearchItems(e.target.value);setItemsVisible(LIB_PAGE);}}
                        placeholder="Search rate items…"
                        className="w-full bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.07] rounded-lg pl-7 pr-2 py-2 text-[11px] text-slate-700 dark:text-slate-300 placeholder:text-slate-400 dark:placeholder:text-slate-600 outline-none focus:border-sky-500/40"/>
                    </div>
                    {pinnedItem && (
                      <div className="space-y-1">
                        <div className="px-1 text-[8px] font-bold uppercase tracking-widest text-blue-400/80">Linked</div>
                        {renderItemRow(pinnedItem)}
                        {restItems.length > 0 && <div className="border-t border-slate-200 dark:border-white/[0.07] mt-2"/>}
                      </div>
                    )}
                    <div className="space-y-1">
                      {restItems.slice(0, itemsVisible).map(renderItemRow)}
                    </div>
                    {filteredItems.length === 0 && (
                      <div className="text-[10px] text-slate-400 dark:text-slate-700 text-center py-3">No rate items match.</div>
                    )}
                    {restItems.length > 0 && (
                      <div className="flex items-center justify-between gap-2 pt-1">
                        <span className="text-[10px] text-slate-400 dark:text-slate-600">Showing {itemsShown} of {itemsTotal}</span>
                        {itemsVisible < restItems.length && (
                          <button onClick={()=>setItemsVisible(v=>v+LIB_PAGE)}
                            className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-white/[0.08] text-[10px] font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-white/[0.04] transition">
                            Show {Math.min(LIB_PAGE, restItems.length - itemsVisible)} more
                          </button>
                        )}
                      </div>
                    )}
                  </CollapsibleSection>
                )}
                {assemblies.length===0&&costItems.length===0&&(
                  <div className="text-[11px] text-slate-400 dark:text-slate-700 text-center py-6">No templates or items found.<br/>Build assemblies in the Assemblies page.</div>
                )}
              </div>
            )}

            {/* -- Measurements Tab -- */}
            {rightTab==="measurements"&&(
              <div className="p-3 space-y-2">
                {pageMeasurements.length===0?(
                  <div className="text-[11px] text-slate-400 dark:text-slate-700 text-center py-10">No measurements yet.<br/>Select a template and draw on the plan.</div>
                ):(
                  <>
                    {takenBatchGroups().map(g=>{
                      const first = g.members[0];
                      const total = g.members.reduce((sum,x)=>sum+x.result,0);
                      const pages = Array.from(new Set(g.members.map(x=>x.pageNumber??1))).sort((a,b)=>a-b);
                      const allHidden = g.members.every(x=>x.hidden);
                      const onThisPage = g.members.filter(x=>(x.pageNumber??1)===pageNum);
                      const selectedHere = onThisPage.some(x=>x.id===selectedId);
                      const ids = new Set(g.members.map(x=>x.id));
                      return (
                        <div key={"batch-"+g.id} onClick={()=>{const id=selectedHere?null:onThisPage[0].id;setSelectedId(id);selectedIdRef.current=id;scheduleRender();}}
                          className={`rounded-lg border px-3 py-2.5 cursor-pointer transition-all flex items-center gap-2.5 ${allHidden?"opacity-40":""} ${selectedHere?"border-sky-500/25 bg-sky-500/[0.07]":"border-slate-100 dark:border-white/[0.05] bg-slate-50 dark:bg-white/[0.02] hover:bg-slate-50 dark:bg-white/[0.04]"}`}>
                          <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{backgroundColor:first.color}}/>
                          <div className="flex-1 min-w-0">
                            <div className="text-[11px] font-semibold text-slate-800 dark:text-slate-200">{fmtBatchTotal(first.unit, total)}</div>
                            {first.linkedAssemblyName&&<div className="text-[9px] text-purple-400 truncate">? {first.linkedAssemblyName}</div>}
                            {first.linkedItemName&&!first.linkedAssemblyName&&<div className="text-[9px] text-blue-400 truncate">{first.linkedItemName}</div>}
                            <div className="text-[9px] text-slate-400 dark:text-slate-700 capitalize">{first.type} batch · {first.type==="count"?`${Math.round(total)} points`:`${g.members.length} shapes`}{pages.length>1?` · pages ${pages.join(", ")}`:""}{allHidden?" · hidden":""}</div>
                          </div>
                          <button onClick={e=>{e.stopPropagation();const anyVisible=g.members.some(x=>!x.hidden);const next=measurementsRef.current.map(x=>ids.has(x.id)?{...x,hidden:anyVisible}:x);setMeasurements(next);measurementsRef.current=next;scheduleRender();}}
                            title={allHidden?"Show this batch":"Hide this batch"}
                            className={`p-1 rounded transition flex-shrink-0 ${allHidden?"text-slate-400 dark:text-slate-600 hover:text-emerald-400":"text-slate-400 dark:text-slate-700 hover:text-amber-400"}`}>
                            {allHidden?<Eye size={11}/>:<EyeOff size={11}/>}
                          </button>
                          <button onClick={e=>{e.stopPropagation();toggleEdit(onThisPage[0].id);}}
                            title={onThisPage.some(x=>x.id===editingId)?"Done editing points":"Edit points (first shape of this batch on this page)"}
                            className={`p-1 rounded transition flex-shrink-0 ${onThisPage.some(x=>x.id===editingId)?"text-sky-400 bg-sky-500/15":"text-slate-400 dark:text-slate-700 hover:text-sky-400"}`}>
                            <Edit2 size={11}/>
                          </button>
                          <button onClick={e=>{e.stopPropagation();const next=measurementsRef.current.filter(x=>!ids.has(x.id));setMeasurements(next);measurementsRef.current=next;pruneBatches(next);if(selectedId&&ids.has(selectedId)){setSelectedId(null);selectedIdRef.current=null;}scheduleRender();}}
                            title="Delete this whole batch"
                            className="p-1 rounded hover:bg-red-500/15 text-slate-400 dark:text-slate-700 hover:text-red-400 transition flex-shrink-0">
                            <X size={11}/>
                          </button>
                        </div>
                      );
                    })}
                    {pageMeasurements.filter(m=>!takenGroupedIds().has(m.id)).map(m=>(
                      <div key={m.id} onClick={()=>{setSelectedId(m.id===selectedId?null:m.id);selectedIdRef.current=m.id===selectedId?null:m.id;scheduleRender();}}
                        className={`rounded-lg border px-3 py-2.5 cursor-pointer transition-all flex items-center gap-2.5 ${m.hidden?"opacity-40":""} ${m.id===selectedId?"border-sky-500/25 bg-sky-500/[0.07]":"border-slate-100 dark:border-white/[0.05] bg-slate-50 dark:bg-white/[0.02] hover:bg-slate-50 dark:bg-white/[0.04]"}`}>
                        <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{backgroundColor:m.color}}/>
                        <div className="flex-1 min-w-0">
                          <div className="text-[11px] font-semibold text-slate-800 dark:text-slate-200">{m.unit === "ft" ? feetInches(m.result) : fmt2(m.result)} <span className="text-slate-500 dark:text-slate-600 font-normal">{m.unit === "ft" ? "" : m.unit}</span></div>
                          {m.linkedAssemblyName&&<div className="text-[9px] text-purple-400 truncate">? {m.linkedAssemblyName}</div>}
                          {m.linkedItemName&&!m.linkedAssemblyName&&<div className="text-[9px] text-blue-400 truncate">{m.linkedItemName}</div>}
                          <div className="text-[9px] text-slate-400 dark:text-slate-700 capitalize">{m.type}{m.hidden?" · hidden":""}</div>
                        </div>
                        <button onClick={e=>{e.stopPropagation();const next=measurementsRef.current.map(x=>x.id===m.id?{...x,hidden:!x.hidden}:x);setMeasurements(next);measurementsRef.current=next;scheduleRender();}}
                          title={m.hidden?"Show measurement":"Hide measurement"}
                          className={`p-1 rounded transition flex-shrink-0 ${m.hidden?"text-slate-400 dark:text-slate-600 hover:text-emerald-400":"text-slate-400 dark:text-slate-700 hover:text-amber-400"}`}>
                          {m.hidden?<Eye size={11}/>:<EyeOff size={11}/>}
                        </button>
                        <button onClick={e=>{e.stopPropagation();toggleEdit(m.id);}}
                          title={m.id===editingId?"Done editing points":"Edit points"}
                          className={`p-1 rounded transition flex-shrink-0 ${m.id===editingId?"text-sky-400 bg-sky-500/15":"text-slate-400 dark:text-slate-700 hover:text-sky-400"}`}>
                          <Edit2 size={11}/>
                        </button>
                        <button onClick={e=>{e.stopPropagation();const next=measurementsRef.current.filter(x=>x.id!==m.id);setMeasurements(next);measurementsRef.current=next;pruneBatches(next);if(selectedId===m.id){setSelectedId(null);selectedIdRef.current=null;}scheduleRender();}}
                          className="p-1 rounded hover:bg-red-500/15 text-slate-400 dark:text-slate-700 hover:text-red-400 transition flex-shrink-0">
                          <X size={11}/>
                        </button>
                      </div>
                    ))}
                    <button onClick={()=>{
                        const anyVisible = pageMeasurements.some(x=>!x.hidden);
                        const next = measurementsRef.current.map(x => (x.pageNumber??1)===pageNum ? {...x, hidden: anyVisible} : x);
                        setMeasurements(next); measurementsRef.current = next; scheduleRender();
                      }}
                      className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg border border-slate-200 dark:border-white/[0.08] text-[10px] text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition mt-2">
                      {pageMeasurements.some(x=>!x.hidden)?<><EyeOff size={11}/> Hide All</>:<><Eye size={11}/> Show All</>}
                    </button>
                    <button onClick={()=>{setMeasurements([]);measurementsRef.current=[];writeBatches({});setSelectedId(null);selectedIdRef.current=null;scheduleRender();}}
                      className="w-full py-2 rounded-lg border border-red-500/15 text-[10px] text-red-500/60 hover:text-red-400 hover:border-red-500/25 transition mt-2">
                      Clear All
                    </button>
                  </>
                )}
              </div>
            )}

            {/* -- Stats Tab -- */}
            {rightTab==="stats"&&(
              <div className="p-3 space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  {[
                    ["Total Items", stats.total, "text-slate-800 dark:text-slate-200"],
                    ["Linear ft", fmt2(stats.lines), "text-sky-300"],
                    ["Area ft²", fmt2(stats.areas), "text-purple-300"],
                    ["Count", stats.counts, "text-amber-300"],
                    ["Volume ft³", fmt2(stats.volumes), "text-emerald-300"],
                    ["Scale", calibration ? "Set ?" : "Not set", calibration?"text-emerald-400":"text-amber-400"],
                  ].map(([l,v,c])=>(
                    <div key={l as string} className="rounded-xl border border-slate-200 dark:border-white/[0.06] bg-slate-50 dark:bg-white/[0.02] px-3 py-3">
                      <div className="text-[9px] text-slate-400 dark:text-slate-700 uppercase tracking-widest mb-1">{l}</div>
                      <div className={`text-lg font-bold ${c}`}>{v}</div>
                    </div>
                  ))}
                </div>

                {/* Group by assembly */}
                {pageMeasurements.filter(m=>m.linkedAssemblyName).length > 0 && (
                  <div className="rounded-xl border border-slate-200 dark:border-white/[0.07] overflow-hidden">
                    <div className="px-3 py-2 bg-slate-50 dark:bg-white/[0.02] border-b border-slate-100 dark:border-white/[0.05] text-[9px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-600">By Assembly</div>
                    {Object.entries(
                      pageMeasurements.filter(m=>m.linkedAssemblyName).reduce((acc:Record<string,number>, m) => {
                        const k = m.linkedAssemblyName!; acc[k] = (acc[k]||0) + m.result; return acc;
                      }, {})
                    ).map(([name, total]) => (
                      <div key={name} className="flex items-center justify-between px-3 py-2.5 border-b border-slate-100 dark:border-white/[0.04] last:border-0">
                        <div className="flex items-center gap-2"><Layers size={10} className="text-purple-400"/><span className="text-[11px] text-slate-700 dark:text-slate-300 truncate">{name}</span></div>
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
          </>)}
        </div>
      </div>

      {/* Exit focus mode: the top bar is hidden, so this is the way back */}
      {focusMode && (
        <button onClick={()=>setFocus(false)} title="Exit focus mode"
          className="fixed bottom-4 right-14 z-40 flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 dark:border-white/[0.1] bg-white/95 dark:bg-[#0d1117]/95 backdrop-blur shadow-lg text-[11px] font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/[0.06] transition">
          <Minimize2 size={12}/> Exit focus
        </button>
      )}

      {/* -- Calibration Modal -- */}
      {showCalibModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#0d1117] shadow-2xl p-5 space-y-4">
            <div>
              <div className="text-sm font-bold text-slate-900 dark:text-slate-100">Set Drawing Scale</div>
              <div className="text-[11px] text-slate-500 mt-0.5">What is the real-world distance between your 2 points?</div>
            </div>
            <div className="flex items-center gap-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-3 py-2">
              <Check size={11} className="text-emerald-400"/>
              <span className="text-[11px] text-emerald-300">2 points placed — enter the distance below</span>
            </div>
            <div>
              <label className="text-[11px] text-slate-500 block mb-1.5">Feet</label>
              <input type="number" value={calibFeet} onChange={e=>setCalibFeet(e.target.value)} autoFocus
                className="w-full rounded-lg border border-slate-200 dark:border-white/[0.08] bg-slate-50 dark:bg-white/[0.04] px-3 py-2 text-sm text-slate-800 dark:text-slate-200 outline-none focus:border-sky-500/50"
                placeholder="10" onKeyDown={e=>{if(e.key==="Enter")confirmCalibration();}}/>
            </div>
            <div>
              <label className="text-[11px] text-slate-500 block mb-1.5">Inches</label>
              <input type="number" min="0" max="11" value={calibInches} onChange={e=>setCalibInches(e.target.value)}
                className="w-full rounded-lg border border-slate-200 dark:border-white/[0.08] bg-slate-50 dark:bg-white/[0.04] px-3 py-2 text-sm text-slate-800 dark:text-slate-200 outline-none focus:border-sky-500/50"
                placeholder="0" onKeyDown={e=>{if(e.key==="Enter")confirmCalibration();}}/>
            </div>
            <div>
              <label className="text-[11px] text-slate-500 block mb-1.5">Fraction</label>
              <div className="grid grid-cols-4 gap-1.5">
                {FRACTION_OPTIONS.map((f, i) => (
                  <button key={i} type="button" onClick={()=>setCalibFraction(f)}
                    className={`py-1.5 rounded-lg border text-[11px] font-medium transition ${calibFraction===f?"bg-sky-600 border-sky-500 text-white":"bg-slate-50 dark:bg-white/[0.04] border-slate-200 dark:border-white/[0.08] text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:text-slate-200"}`}>
                    {FRACTION_LABELS[i]}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={()=>{setShowCalibModal(false);setCalibrating(false);calibratingRef.current=false;setCalibPts([]);calibPtsRef.current=[];}}
                className="flex-1 py-2 rounded-xl border border-slate-200 dark:border-white/[0.07] text-xs text-slate-500 hover:text-slate-700 dark:text-slate-300 transition">Cancel</button>
              <button onClick={confirmCalibration}
                className="flex-1 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold transition">Confirm Scale</button>
            </div>
          </div>
        </div>
      )}


      {/* -- Wall Setup Modal -- */}
      {showWallSetup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#0d1117] shadow-2xl p-5 space-y-4">
            <div>
              <div className="text-sm font-bold text-slate-900 dark:text-slate-100">Wall Setup</div>
              <div className="text-[11px] text-slate-500 mt-0.5">Choose how you'll draw, and set the wall height</div>
            </div>
            <div>
              <label className="text-[11px] text-slate-500 block mb-1.5">Drawing mode</label>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={()=>setWallLineMode("segment")}
                  className={`py-2 rounded-lg border text-[11px] font-medium transition ${wallLineMode==="segment"?"bg-pink-600 border-pink-500 text-white":"bg-slate-50 dark:bg-white/[0.04] border-slate-200 dark:border-white/[0.08] text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:text-slate-200"}`}>
                  Segment (one straight line)
                </button>
                <button onClick={()=>setWallLineMode("continuous")}
                  className={`py-2 rounded-lg border text-[11px] font-medium transition ${wallLineMode==="continuous"?"bg-pink-600 border-pink-500 text-white":"bg-slate-50 dark:bg-white/[0.04] border-slate-200 dark:border-white/[0.08] text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:text-slate-200"}`}>
                  Continuous (multiple points)
                </button>
              </div>
            </div>
            <div>
              <label className="text-[11px] text-slate-500 block mb-1.5">Feet</label>
              <input type="number" value={wallHeightFeet} onChange={e=>setWallHeightFeet(e.target.value)} autoFocus
                className="w-full rounded-lg border border-slate-200 dark:border-white/[0.08] bg-slate-50 dark:bg-white/[0.04] px-3 py-2 text-sm text-slate-800 dark:text-slate-200 outline-none focus:border-pink-500/50"
                placeholder="8"/>
            </div>
            <div>
              <label className="text-[11px] text-slate-500 block mb-1.5">Inches</label>
              <input type="number" min="0" max="11" value={wallHeightInches} onChange={e=>setWallHeightInches(e.target.value)}
                className="w-full rounded-lg border border-slate-200 dark:border-white/[0.08] bg-slate-50 dark:bg-white/[0.04] px-3 py-2 text-sm text-slate-800 dark:text-slate-200 outline-none focus:border-pink-500/50"
                placeholder="0"/>
            </div>
            <div>
              <label className="text-[11px] text-slate-500 block mb-1.5">Fraction</label>
              <div className="grid grid-cols-4 gap-1.5">
                {FRACTION_OPTIONS.map((f, i) => (
                  <button key={i} type="button" onClick={()=>setWallHeightFraction(f)}
                    className={`py-1.5 rounded-lg border text-[11px] font-medium transition ${wallHeightFraction===f?"bg-pink-600 border-pink-500 text-white":"bg-slate-50 dark:bg-white/[0.04] border-slate-200 dark:border-white/[0.08] text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:text-slate-200"}`}>
                    {FRACTION_LABELS[i]}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={()=>setShowWallSetup(false)}
                className="flex-1 py-2 rounded-xl border border-slate-200 dark:border-white/[0.07] text-xs text-slate-500 hover:text-slate-700 dark:text-slate-300 transition">Cancel</button>
              <button onClick={()=>{
                  const feetPart = parseFloat(wallHeightFeet) || 0;
                  const inchesPart = parseFloat(wallHeightInches) || 0;
                  const totalHeight = feetPart + ((inchesPart + wallHeightFraction) / 12);
                  wallTotalHeightFeetRef.current = totalHeight;
                  wallLineModeRef.current = wallLineMode;
                  setWallHeightConfirmed(true); wallHeightConfirmedRef.current = true;
                  setShowWallSetup(false);
                  setTool("wall"); toolRef.current = "wall";
                  setInProgress([]); inProgressRef.current = [];
                }}
                className="flex-1 py-2 rounded-xl bg-pink-600 hover:bg-pink-500 text-white text-xs font-semibold transition">Start Drawing</button>
            </div>
          </div>
        </div>
      )}
      {/* -- Volume Depth Modal -- */}
      {showDepthModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="w-full max-w-xs rounded-2xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#0d1117] shadow-2xl p-5 space-y-4">
            <div>
              <div className="text-sm font-bold text-slate-900 dark:text-slate-100">Volume Depth</div>
              <div className="text-[11px] text-slate-500 mt-0.5">Enter the depth of the slab or excavation</div>
            </div>
            <div>
              <label className="text-[11px] text-slate-500 block mb-1.5">Depth (inches)</label>
              <input type="number" value={depthInches} onChange={e=>setDepthInches(e.target.value)} autoFocus
                className="w-full rounded-lg border border-slate-200 dark:border-white/[0.08] bg-slate-50 dark:bg-white/[0.04] px-3 py-2 text-sm text-slate-800 dark:text-slate-200 outline-none focus:border-emerald-500/50"
                placeholder="4" onKeyDown={e=>{if(e.key==="Enter")confirmDepth();}}/>
            </div>
            <div className="flex gap-2">
              <button onClick={()=>{setShowDepthModal(false);pendingVolumeRef.current=[];setInProgress([]);inProgressRef.current=[];endBatchAfterDepthRef.current=false;}}
                className="flex-1 py-2 rounded-xl border border-slate-200 dark:border-white/[0.07] text-xs text-slate-500 hover:text-slate-700 dark:text-slate-300 transition">Cancel</button>
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