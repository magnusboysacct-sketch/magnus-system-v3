import React, { useEffect, useRef, useState } from "react";
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import workerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { usePanZoom } from "../features/takeoff/hooks/usePanZoom";
import { useMeasurements } from "../features/takeoff/hooks/useMeasurements";
import { MeasurementLayer } from "../features/takeoff/components/MeasurementLayer";

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
  const { open, onClose, onApply, canApply, isCalibrating = false, calibPointsCount = 0, canConfirmCalibration = false, onCalibrationOk, onCalibrationCancel } = props;
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
      if (onCalibrationOk) {
        onCalibrationOk(feet);
      }
      return;
    }

    onApply(feet, { applyAllPages, autoDimLine });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-950 shadow-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
          <div className="text-lg font-semibold">Scale</div>
          <button onClick={onClose} className="px-2 py-1 rounded-lg hover:bg-slate-800/50">
            ✕
          </button>
        </div>

        <div className="px-5 pt-4">
          <div className="flex gap-2 text-sm">
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
                  "px-3 py-2 rounded-xl border " +
                  (tab === k ? "bg-slate-800 border-slate-700" : "bg-slate-950 border-slate-800 hover:bg-slate-900")
                }
              >
                {label}
              </button>
            ))}
          </div>

          <div className="mt-4 rounded-xl border border-slate-800 bg-slate-900/20 p-4">
            {isCalibrating && (
              <div className="text-sm text-slate-300 mb-3">
                Calibration mode: Click {calibPointsCount}/2 points on the drawing
              </div>
            )}

            {tab === "standard" && (
              <div className="grid grid-cols-2 gap-3 items-end">
                <div className="col-span-2 text-sm text-slate-300">
                  Enter the real distance between your two clicked points:
                </div>
                <label className="text-xs text-slate-400">
                  Feet
                  <input
                    value={stdFeet}
                    onChange={(e) => setStdFeet(e.target.value)}
                    className="mt-1 w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 text-sm"
                    placeholder="10"
                  />
                </label>
                <div className="text-xs text-slate-400 flex items-center">ft</div>
              </div>
            )}

            {tab === "fis" && (
              <div className="grid grid-cols-3 gap-3 items-end">
                <label className="text-xs text-slate-400">
                  Feet
                  <input
                    value={fisFeet}
                    onChange={(e) => setFisFeet(e.target.value)}
                    className="mt-1 w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 text-sm"
                    placeholder="45"
                  />
                </label>

                <label className="text-xs text-slate-400">
                  Inch
                  <input
                    value={fisInch}
                    onChange={(e) => setFisInch(e.target.value)}
                    className="mt-1 w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 text-sm"
                    placeholder="6"
                  />
                </label>

                <label className="text-xs text-slate-400">
                  Fraction
                  <input
                    value={fisFrac}
                    onChange={(e) => setFisFrac(e.target.value)}
                    className="mt-1 w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 text-sm"
                    placeholder="1/2"
                  />
                </label>

                <div className="col-span-3 text-xs text-slate-500">
                  Tip: Fraction accepts 1/2, 3/8, 0.25, etc.
                </div>
              </div>
            )}

            {tab === "metric" && (
              <div className="grid grid-cols-2 gap-3 items-end">
                <div className="col-span-2 text-sm text-slate-300">Enter the distance in meters:</div>
                <label className="text-xs text-slate-400">
                  Meters
                  <input
                    value={metricMeters}
                    onChange={(e) => setMetricMeters(e.target.value)}
                    className="mt-1 w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 text-sm"
                    placeholder="3"
                  />
                </label>
                <div className="text-xs text-slate-400 flex items-center">m</div>
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
              <input type="checkbox" checked={applyAllPages} onChange={(e) => setApplyAllPages(e.target.checked)} />
              Apply scale to all pages
            </label>
            <label className="flex items-center gap-2 text-slate-300">
              <input type="checkbox" checked={autoDimLine} onChange={(e) => setAutoDimLine(e.target.checked)} />
              Automatically create dimension line
            </label>
          </div>

          <div className="mt-5 flex items-center justify-between pb-5">
            <button
              onClick={() => onApply(0, { applyAllPages, autoDimLine })}
              className="px-3 py-2 rounded-xl bg-slate-800/40 hover:bg-slate-800/60 text-sm"
            >
              Clear Scale
            </button>

            <div className="flex gap-2">
              <button onClick={onCalibrationCancel || onClose} className="px-4 py-2 rounded-xl bg-slate-800/30 hover:bg-slate-800/50 text-sm">
                Cancel
              </button>
              <button
                disabled={isCalibrating ? !canStartCalibration : !canApply}
                onClick={apply}
                className={
                  "px-4 py-2 rounded-xl text-sm " +
                  ((isCalibrating ? canStartCalibration : canApply) ? "bg-emerald-900/50 hover:bg-emerald-900/70 border border-emerald-900/40" : "bg-slate-800/20 text-slate-500")
                }
              >
                OK
              </button>
            </div>
          </div>

          {!(isCalibrating ? canConfirmCalibration : canApply) && (
            <div className="pb-5 text-xs text-slate-500">
              {isCalibrating
                ? `Click ${2 - calibPointsCount} more point${calibPointsCount === 1 ? '' : 's'} on the drawing first, then press OK.`
                : "Click two points on the drawing first, then press OK."
              }
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

  const canStartCalibration = getEnteredFeet() > 0;

  const [error, setError] = useState<string | null>(null);
  const [loadingPdf, setLoadingPdf] = useState(false);
  const [overViewer, setOverViewer] = useState(false);

  const [scaleModalOpen, setScaleModalOpen] = useState(false);

  const fitScaleRef = useRef<number | null>(null);

  const isSpaceDownRef = useRef(false);
  const isPanningRef = useRef(false);
  const panStartRef = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
  const activePointerIdRef = useRef<number | null>(null);

  type ToolMode = "select" | "line" | "area" | "count";
  const [tool, setTool] = useState<ToolMode>("select");

  const [lineStart, setLineStart] = useState<Point | null>(null);
  const [lineEnd, setLineEnd] = useState<Point | null>(null);
  const [hoverPt, setHoverPt] = useState<Point | null>(null);

  const [areaPoints, setAreaPoints] = useState<Point[]>([]);
  const [areaHoverPt, setAreaHoverPt] = useState<Point | null>(null);

  const [countPoints, setCountPoints] = useState<Point[]>([]);
  const [feetPerPdfUnit, setFeetPerPdfUnit] = useState<number | null>(null);

  const [canvasWidth, setCanvasWidth] = useState(0);
  const [canvasHeight, setCanvasHeight] = useState(0);

  function distFeet(a:{x:number;y:number}, b:{x:number;y:number}) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const d = Math.sqrt(dx*dx + dy*dy);
    if (!d) return 0;

    if (!feetPerPdfUnit) return 0;
    return d * feetPerPdfUnit;
  }

  function formatFeetInches(totalFeet:number) {
    if (!isFinite(totalFeet) || totalFeet <= 0) return "";
    const feet = Math.floor(totalFeet);
    const inchesTotal = (totalFeet - feet) * 12;
    const inches = Math.floor(inchesTotal);
    const frac = inchesTotal - inches;

    const denom = 16;
    let num = Math.round(frac * denom);
    let fFeet = feet;
    let fIn = inches;

    if (num === denom) { num = 0; fIn += 1; }
    if (fIn === 12) { fIn = 0; fFeet += 1; }

    const fracStr = num === 0 ? "" : ` ${num}/${denom}`;
    return `${fFeet}' ${fIn}"${fracStr}`;
  }

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
      setCalibrating(false);
      setIsCalibrating(false);
      setCalPoints([]);
      setCalibPoints([]);

      panZoom.resetView();

      setTool("select");
      setLineStart(null);
      setLineEnd(null);
      setHoverPt(null);
      setAreaPoints([]);
      setAreaHoverPt(null);
      setCountPoints([]);

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
  }, [pdf, pageNumber, panZoom.zoom, panZoom.panX, panZoom.panY, calPoints.length, calibPoints.length, tool, lineStart?.x, lineStart?.y, lineEnd?.x, lineEnd?.y, hoverPt?.x, hoverPt?.y, areaPoints.length, areaHoverPt?.x, areaHoverPt?.y]);

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
  }, [tool, areaPoints, countPoints]);

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

  function nextPage() {
    if (pageNumber < numPages) {
      setPageNumber((p) => p + 1);
      fitScaleRef.current = null;
      setLineStart(null);
      setLineEnd(null);
      setHoverPt(null);
      setAreaPoints([]);
      setAreaHoverPt(null);
      setCountPoints([]);
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
      setLineStart(null);
      setLineEnd(null);
      setHoverPt(null);
      setAreaPoints([]);
      setAreaHoverPt(null);
      setCountPoints([]);
      setCalPoints([]);
      setCalibrating(false);
      setIsCalibrating(false);
      setCalibPoints([]);
    }
  }

  function startCalibrate() {
    setError(null);
    setCalibrating(true);
    setIsCalibrating(true);
    setCalibPoints([]);
    setTool("select");
    setLineStart(null);
    setLineEnd(null);
    setHoverPt(null);
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
      try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch {}
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
          addMeasurement({
            type: "line",
            points: [lineStart, p],
            pixelsPerUnit,
            unit: "ft",
            label: `Line measurement ${measurements.length + 1}`,
            color: "#60a5fa",
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

    if (tool === "count") {
      const p = canvasPointFromEvent(e);

      if (feetPerPixel && feetPerPixel > 0) {
        const pixelsPerUnit = 1 / feetPerPixel;
        addMeasurement({
          type: "count",
          points: [p],
          pixelsPerUnit,
          unit: "ea",
          label: `Count ${measurements.length + 1}`,
          color: "#f59e0b",
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
  }

  function onCanvasMove(e: React.MouseEvent<HTMLCanvasElement>) {
    if (tool === "line") {
      if (!lineStart) return;
      if (lineEnd) return;
      setHoverPt(canvasPointFromEvent(e));
      return;
    }

    if (tool === "area" && areaPoints.length > 0) {
      setAreaHoverPt(canvasPointFromEvent(e));
      return;
    }
  }

  function applyScaleFromModal(realFeet: number, opts: { applyAllPages: boolean; autoDimLine: boolean }) {
    if (realFeet === 0) {
      setFeetPerPixel(null);
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

      let areaPixels = 0;
      for (let i = 0; i < areaPoints.length; i++) {
        const j = (i + 1) % areaPoints.length;
        areaPixels += areaPoints[i].x * areaPoints[j].y;
        areaPixels -= areaPoints[j].x * areaPoints[i].y;
      }
      areaPixels = Math.abs(areaPixels / 2);

      const areaFt2 = areaPixels / (pixelsPerUnit * pixelsPerUnit);

      addMeasurement({
        type: "area",
        points: [...areaPoints],
        pixelsPerUnit,
        unit: "ft²",
        label: `Area ${measurements.length + 1}`,
        color: "#a78bfa",
      });
    }

    setAreaPoints([]);
    setAreaHoverPt(null);
  }

  const canConfirmCalibration = calibPoints.length === 2;

  useEffect(() => {
    if (!isCalibrating) return;
    if (calibPoints.length !== 2) return;
    if (!pendingCalibLength) return;

    const [a,b] = calibPoints;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const pixelDist = Math.sqrt(dx*dx + dy*dy);
    if (!pixelDist || pixelDist <= 0) return;

    const newFeetPerPixel = pendingCalibLength / pixelDist;
    setFeetPerPixel(newFeetPerPixel);
    setFeetPerPdfUnit(newFeetPerPixel);

    setIsCalibrating(false);
    setPendingCalibLength(null);
    setCalibPoints([]);
  }, [isCalibrating, calibPoints, pendingCalibLength]);

  return (
    <div className="p-6 h-full flex flex-col">
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

      <div className="mb-4 px-4 py-2 bg-yellow-500 text-black rounded-xl font-bold text-center text-sm">
        ⚡ TAKEOFF ENGINE ACTIVE (Phase 2) ⚡
      </div>

      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Takeoff</h1>
          <p className="text-slate-400 text-sm">Fit-to-view on load. Ctrl+wheel zoom-to-cursor. Line tool measures.</p>
        </div>

        <div className="flex items-center gap-2">
          <label className="px-3 py-2 rounded-xl bg-slate-800/60 hover:bg-slate-800 text-sm cursor-pointer">
            Upload PDF
            <input
              type="file"
              accept="application/pdf,.pdf"
              className="hidden"
              onChange={(e) => onPickFile(e.target.files?.[0] ?? null)}
            />
          </label>

          {pdf && (
            <button
              onClick={startCalibrate}
              className="px-3 py-2 rounded-xl bg-emerald-900/25 hover:bg-emerald-900/40 border border-emerald-900/40 text-sm"
            >
              Calibrate Scale
            </button>
          )}
        </div>
      </div>

      <div className="mt-4 flex items-center gap-2">
        <button
          onClick={() => {
            setTool("select");
            setLineStart(null);
            setLineEnd(null);
            setHoverPt(null);
            setAreaPoints([]);
            setAreaHoverPt(null);
            setCountPoints([]);
          }}
          className={"px-3 py-2 rounded-xl text-sm border " + (tool === "select" ? "bg-slate-800 border-slate-700" : "bg-slate-950 border-slate-800 hover:bg-slate-900")}
        >
          Select
        </button>

        <button
          onClick={() => {
            setTool("line");
            setLineStart(null);
            setLineEnd(null);
            setHoverPt(null);
            setAreaPoints([]);
            setAreaHoverPt(null);
            setCountPoints([]);
          }}
          className={"px-3 py-2 rounded-xl text-sm border " + (tool === "line" ? "bg-slate-800 border-slate-700" : "bg-slate-950 border-slate-800 hover:bg-slate-900")}
        >
          Line
        </button>

        <button
          onClick={() => {
            setTool("area");
            setLineStart(null);
            setLineEnd(null);
            setHoverPt(null);
            setAreaPoints([]);
            setAreaHoverPt(null);
            setCountPoints([]);
          }}
          className={"px-3 py-2 rounded-xl text-sm border " + (tool === "area" ? "bg-slate-800 border-slate-700" : "bg-slate-950 border-slate-800 hover:bg-slate-900")}
        >
          Area
        </button>

        <button
          onClick={() => {
            setTool("count");
            setLineStart(null);
            setLineEnd(null);
            setHoverPt(null);
            setAreaPoints([]);
            setAreaHoverPt(null);
            setCountPoints([]);
          }}
          className={"px-3 py-2 rounded-xl text-sm border " + (tool === "count" ? "bg-slate-800 border-slate-700" : "bg-slate-950 border-slate-800 hover:bg-slate-900")}
        >
          Count
        </button>

        <div className="flex-1" />

        {tool === "line" && <div className="text-xs text-slate-400">Click 2 points to measure. 3rd click starts new line.</div>}
        {tool === "area" && <div className="text-xs text-slate-400">Click to add vertices. Double-click or press Enter to finish (min 3 points). ESC to cancel.</div>}
        {tool === "count" && <div className="text-xs text-slate-400">Click to place count markers. ESC to cancel.</div>}
        {measurements.length > 0 && (
          <div className="text-xs text-emerald-300 border border-emerald-900/40 bg-emerald-950/20 px-2 py-1 rounded-lg">
            {measurements.length} measurement{measurements.length === 1 ? '' : 's'}
          </div>
        )}
      </div>

      {error && (
        <div className="mt-4 rounded-xl border border-red-900/40 bg-red-950/30 p-3 text-sm text-red-200">
          {error}
        </div>
      )}

      {loadingPdf && <div className="mt-4 text-sm text-slate-400">Loading PDF…</div>}

      {pdf && (
        <div className="mt-4 flex items-center gap-2">
          <button onClick={prevPage} className="px-3 py-2 bg-slate-800 rounded-lg">
            Prev
          </button>

          <span className="text-sm">
            Page {pageNumber} / {numPages}
          </span>

          <button onClick={nextPage} className="px-3 py-2 bg-slate-800 rounded-lg">
            Next
          </button>

          <div className="flex-1" />

          {feetPerPixel ? (
            <div className="text-xs text-emerald-300 border border-emerald-900/40 bg-emerald-950/20 px-2 py-1 rounded-lg">
              Scale set: {feetPerPixel.toFixed(4)} ft / px
            </div>
          ) : (
            <div className="text-xs text-slate-400">Scale not set (calibrate before measuring)</div>
          )}

          <div className="w-3" />
          <span className="text-sm">{Math.round(panZoom.zoom * 100)}%</span>

          <button
            onClick={async () => {
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
            className="ml-2 px-3 py-2 bg-slate-800 rounded-lg text-sm"
          >
            Fit
          </button>
        </div>
      )}

      <div className="mt-4 flex-1 border border-slate-800 rounded-xl bg-slate-950 overflow-hidden">
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
            className="p-3 h-full relative"
            style={{ touchAction: "none", cursor: "default" }}
          >
            <div style={{ display: "inline-block", transform: `translate(${panZoom.panX}px, ${panZoom.panY}px)` }}>
              <canvas
                ref={canvasRef}
                onClick={onCanvasClick}
                onDoubleClick={onCanvasDoubleClick}
                onMouseMove={onCanvasMove}
                className={calibrating || isPanningRef.current ? "cursor-crosshair" : (tool === "line" || tool === "area" || tool === "count") ? "cursor-crosshair" : "cursor-default"}
                style={{ userSelect: "none" }}
              />

              <MeasurementLayer
                measurements={measurements}
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

            <div className="mt-2 text-xs text-slate-400">
              {isCalibrating
                ? `Calibration: click 2 points on drawing (${calibPoints.length}/2).`
                : "Calibrate: open Scale, click 2 points on drawing, then OK."
              }
            </div>
          </div>
        ) : (
          <div className="h-full flex items-center justify-center text-slate-500">Upload a PDF drawing to begin.</div>
        )}
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
