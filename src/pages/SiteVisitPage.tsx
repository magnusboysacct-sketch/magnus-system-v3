import React, { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Mic, MicOff, Camera, Upload, Pencil, Sparkles, ChevronLeft,
  Trash2, Save, Volume2, X, Check,
} from "lucide-react";
import { supabase } from "../lib/supabase";
import { magnusAI } from "../lib/magnusAI";

// ─── Sketch Types ─────────────────────────────────────────────────────────────
interface SketchStroke {
  tool: "pen" | "line" | "rect" | "circle" | "text" | "dimension" | "eraser";
  color: string;
  lineWidth: number;
  points: { x: number; y: number }[];
  text?: string;
  label?: string;
}

interface SketchPage {
  id: string;
  name: string;
  strokes: SketchStroke[];
}

// ─── Types ────────────────────────────────────────────────────────────────────
interface SiteVisit {
  id: string;
  project_id: string;
  visited_at: string;
  client_requirements: string;
  site_observations: string;
  materials_noted: string;
  labor_notes: string;
  ai_summary: string;
  voice_transcript: string;
  ai_boq_draft: any;
}

interface SitePhoto {
  id: string;
  photo_url: string;
  annotated_url: string | null;
  caption: string;
  ai_caption: string | null;
  annotation_data: any;
  publicUrl: string;
}

// ─── Photo Annotator ──────────────────────────────────────────────────────────
function PhotoAnnotator({
  photo,
  onSave,
  onClose,
}: {
  photo: SitePhoto;
  onSave: (annotationData: any, dataUrl: string) => void;
  onClose: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [tool, setTool] = useState<"pen" | "arrow" | "text" | "eraser">("pen");
  const [color, setColor] = useState("#ef4444");
  const [lineWidth] = useState(3);
  const [isDrawing, setIsDrawing] = useState(false);
  const [textInput, setTextInput] = useState("");
  const [textPos, setTextPos] = useState<{ x: number; y: number } | null>(null);
  const [annotations, setAnnotations] = useState<any[]>(photo.annotation_data?.annotations || []);
  const imgRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      imgRef.current = img;
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      redraw(ctx, img);
    };
    img.src = photo.publicUrl;
  }, [photo.publicUrl]);

  function redraw(ctx: CanvasRenderingContext2D, img: HTMLImageElement) {
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.drawImage(img, 0, 0);
    annotations.forEach(ann => drawAnnotation(ctx, ann));
  }

  function drawAnnotation(ctx: CanvasRenderingContext2D, ann: any) {
    ctx.strokeStyle = ann.color;
    ctx.lineWidth = ann.lineWidth;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    if (ann.type === "pen" && ann.points?.length > 1) {
      ctx.beginPath();
      ctx.moveTo(ann.points[0].x, ann.points[0].y);
      ann.points.forEach((p: any) => ctx.lineTo(p.x, p.y));
      ctx.stroke();
    } else if (ann.type === "arrow") {
      drawArrow(ctx, ann.from, ann.to, ann.color, ann.lineWidth);
    } else if (ann.type === "text") {
      ctx.fillStyle = ann.color;
      ctx.font = `bold ${ann.fontSize || 24}px sans-serif`;
      ctx.fillText(ann.text, ann.x, ann.y);
    }
  }

  function drawArrow(
    ctx: CanvasRenderingContext2D,
    from: { x: number; y: number },
    to: { x: number; y: number },
    color: string,
    lw: number
  ) {
    const headLen = 20;
    const angle = Math.atan2(to.y - from.y, to.x - from.x);
    ctx.strokeStyle = color;
    ctx.lineWidth = lw;
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.lineTo(to.x - headLen * Math.cos(angle - Math.PI / 6), to.y - headLen * Math.sin(angle - Math.PI / 6));
    ctx.moveTo(to.x, to.y);
    ctx.lineTo(to.x - headLen * Math.cos(angle + Math.PI / 6), to.y - headLen * Math.sin(angle + Math.PI / 6));
    ctx.stroke();
  }

  function getPos(e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
    return { x: (clientX - rect.left) * scaleX, y: (clientY - rect.top) * scaleY };
  }

  function startDraw(e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) {
    const pos = getPos(e);
    if (tool === "text") { setTextPos(pos); return; }
    setIsDrawing(true);
    if (tool === "pen" || tool === "eraser") {
      setAnnotations(prev => [...prev, { type: "pen", color: tool === "eraser" ? "#ffffff" : color, lineWidth: tool === "eraser" ? 20 : lineWidth, points: [pos] }]);
    } else if (tool === "arrow") {
      setAnnotations(prev => [...prev, { type: "arrow", color, lineWidth, from: pos, to: pos }]);
    }
  }

  function draw(e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) {
    if (!isDrawing) return;
    const pos = getPos(e);
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    setAnnotations(prev => {
      const updated = [...prev];
      const last = { ...updated[updated.length - 1] };
      if (tool === "pen" || tool === "eraser") last.points = [...(last.points || []), pos];
      else if (tool === "arrow") last.to = pos;
      updated[updated.length - 1] = last;
      if (imgRef.current) redraw(ctx, imgRef.current);
      return updated;
    });
  }

  function endDraw() { setIsDrawing(false); }

  function addText() {
    if (!textInput.trim() || !textPos) return;
    const updated = [...annotations, { type: "text", color, fontSize: 24, text: textInput, x: textPos.x, y: textPos.y }];
    setAnnotations(updated);
    const ctx = canvasRef.current?.getContext("2d")!;
    if (imgRef.current) redraw(ctx, imgRef.current);
    setTextInput(""); setTextPos(null);
  }

  function undo() {
    const next = annotations.slice(0, -1);
    setAnnotations(next);
    const ctx = canvasRef.current?.getContext("2d")!;
    if (imgRef.current) setTimeout(() => redraw(ctx, imgRef.current!), 0);
  }

  function handleSave() {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    if (imgRef.current) redraw(ctx, imgRef.current);
    onSave({ annotations }, canvas.toDataURL("image/jpeg", 0.9));
  }

  const COLORS = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#3b82f6", "#ffffff", "#000000"];

  return (
    <div className="fixed inset-0 bg-black/95 z-50 flex flex-col">
      <div className="flex items-center gap-3 px-4 py-3 bg-black/80 border-b border-white/10 flex-wrap">
        <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/10 text-white"><X size={18}/></button>
        <div className="flex items-center gap-1 bg-white/10 rounded-lg p-1">
          {([["pen","✏️"],["arrow","➡️"],["text","T"],["eraser","⌫"]] as const).map(([t, icon]) => (
            <button key={t} onClick={() => setTool(t as any)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${tool === t ? "bg-white text-black" : "text-white hover:bg-white/10"}`}>
              {icon}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          {COLORS.map(c => (
            <button key={c} onClick={() => setColor(c)}
              className={`w-6 h-6 rounded-full border-2 transition-transform ${color === c ? "border-white scale-125" : "border-transparent"}`}
              style={{ background: c }}/>
          ))}
        </div>
        <button onClick={undo} className="px-3 py-1.5 rounded-lg bg-white/10 text-white text-sm hover:bg-white/20">Undo</button>
        <button onClick={handleSave} className="ml-auto px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold flex items-center gap-2">
          <Check size={14}/> Save
        </button>
      </div>

      {textPos && (
        <div className="absolute z-[60] flex gap-2 items-center bg-black/80 p-2 rounded-lg" style={{ top: 64, left: "50%", transform: "translateX(-50%)" }}>
          <input value={textInput} onChange={e => setTextInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && addText()}
            placeholder="Type label..." autoFocus
            className="px-3 py-1.5 rounded-lg bg-white/10 text-white text-sm border border-white/20 focus:outline-none w-48"/>
          <button onClick={addText} className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-sm">Add</button>
          <button onClick={() => setTextPos(null)} className="p-1.5 rounded-lg hover:bg-white/10 text-white"><X size={14}/></button>
        </div>
      )}

      <div className="flex-1 overflow-auto flex items-center justify-center p-4">
        <canvas
          ref={canvasRef}
          className="max-w-full max-h-full cursor-crosshair rounded-lg"
          style={{ touchAction: "none" }}
          onMouseDown={startDraw} onMouseMove={draw} onMouseUp={endDraw} onMouseLeave={endDraw}
          onTouchStart={startDraw} onTouchMove={draw} onTouchEnd={endDraw}
        />
      </div>
    </div>
  );
}

// ─── SketchBoard ──────────────────────────────────────────────────────────────
function SketchBoard({
  pages,
  activePage,
  onPagesChange,
  onActivePageChange,
}: {
  pages: SketchPage[];
  activePage: number;
  onPagesChange: (pages: SketchPage[]) => void;
  onActivePageChange: (idx: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokesRef = useRef<SketchStroke[]>(pages[activePage]?.strokes ?? []);
  const [tool, setTool] = useState<SketchStroke["tool"]>("pen");
  const [color, setColor] = useState("#1e293b");
  const [lineWidth, setLineWidth] = useState(2);
  const [isDrawing, setIsDrawing] = useState(false);
  const currentStroke = useRef<SketchStroke | null>(null);
  const [textPrompt, setTextPrompt] = useState<{ x: number; y: number } | null>(null);
  const [textValue, setTextValue] = useState("");
  const [dimStroke, setDimStroke] = useState<SketchStroke | null>(null);
  const [dimLabel, setDimLabel] = useState("");
  const [renamingPage, setRenamingPage] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState("");

  // Sync strokesRef when page changes
  useEffect(() => {
    strokesRef.current = pages[activePage]?.strokes ?? [];
    redraw();
  }, [activePage, pages]);

  function redraw() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#f8fafc";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    strokesRef.current.forEach(s => drawStroke(ctx, s));
  }

  function drawStroke(ctx: CanvasRenderingContext2D, s: SketchStroke, preview?: boolean) {
    ctx.save();
    ctx.strokeStyle = s.tool === "eraser" ? "#f8fafc" : s.color;
    ctx.fillStyle = s.color;
    ctx.lineWidth = s.tool === "eraser" ? 20 : s.lineWidth;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    const pts = s.points;
    if (!pts || pts.length === 0) { ctx.restore(); return; }

    if (s.tool === "pen" || s.tool === "eraser") {
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      pts.forEach(p => ctx.lineTo(p.x, p.y));
      ctx.stroke();
    } else if (s.tool === "line") {
      if (pts.length < 2) { ctx.restore(); return; }
      ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y); ctx.lineTo(pts[1].x, pts[1].y); ctx.stroke();
    } else if (s.tool === "rect") {
      if (pts.length < 2) { ctx.restore(); return; }
      ctx.strokeRect(pts[0].x, pts[0].y, pts[1].x - pts[0].x, pts[1].y - pts[0].y);
    } else if (s.tool === "circle") {
      if (pts.length < 2) { ctx.restore(); return; }
      const rx = Math.abs(pts[1].x - pts[0].x) / 2;
      const ry = Math.abs(pts[1].y - pts[0].y) / 2;
      const cx = pts[0].x + (pts[1].x - pts[0].x) / 2;
      const cy = pts[0].y + (pts[1].y - pts[0].y) / 2;
      ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); ctx.stroke();
    } else if (s.tool === "text" && s.text) {
      ctx.font = `bold ${s.lineWidth * 6 + 10}px sans-serif`;
      ctx.fillText(s.text, pts[0].x, pts[0].y);
    } else if (s.tool === "dimension") {
      if (pts.length < 2) { ctx.restore(); return; }
      const from = pts[0]; const to = pts[1];
      const angle = Math.atan2(to.y - from.y, to.x - from.x);
      const headLen = 12;
      ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(to.x, to.y); ctx.stroke();
      // arrowheads
      [[from, angle + Math.PI], [to, angle]].forEach(([p, a]) => {
        const { x, y } = p as { x: number; y: number };
        const ang = a as number;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + headLen * Math.cos(ang - 0.4), y + headLen * Math.sin(ang - 0.4));
        ctx.moveTo(x, y);
        ctx.lineTo(x + headLen * Math.cos(ang + 0.4), y + headLen * Math.sin(ang + 0.4));
        ctx.stroke();
      });
      if (s.label) {
        const mx = (from.x + to.x) / 2;
        const my = (from.y + to.y) / 2 - 8;
        ctx.font = `bold ${s.lineWidth * 4 + 10}px sans-serif`;
        ctx.fillStyle = s.color;
        ctx.textAlign = "center";
        ctx.fillText(s.label, mx, my);
        ctx.textAlign = "left";
      }
    }
    ctx.restore();
  }

  function getPos(e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
    return { x: (clientX - rect.left) * scaleX, y: (clientY - rect.top) * scaleY };
  }

  function commitStroke(stroke: SketchStroke) {
    const updated = pages.map((pg, i) =>
      i === activePage ? { ...pg, strokes: [...pg.strokes, stroke] } : pg
    );
    strokesRef.current = updated[activePage].strokes;
    onPagesChange(updated);
  }

  function pointerDown(e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) {
    const pos = getPos(e);
    if (tool === "text") { setTextPrompt(pos); return; }
    setIsDrawing(true);
    const stroke: SketchStroke = { tool, color, lineWidth, points: [pos] };
    currentStroke.current = stroke;
  }

  function pointerMove(e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) {
    if (!isDrawing || !currentStroke.current) return;
    const pos = getPos(e);
    const s = currentStroke.current;
    if (tool === "pen" || tool === "eraser") {
      s.points.push(pos);
    } else {
      s.points = [s.points[0], pos];
    }
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#f8fafc"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    strokesRef.current.forEach(st => drawStroke(ctx, st));
    drawStroke(ctx, s, true);
  }

  function pointerUp() {
    if (!isDrawing || !currentStroke.current) return;
    setIsDrawing(false);
    const s = currentStroke.current;
    if (s.tool === "dimension") {
      setDimStroke(s);
    } else {
      commitStroke(s);
      redraw();
    }
    currentStroke.current = null;
  }

  function commitText() {
    if (!textValue.trim() || !textPrompt) return;
    const stroke: SketchStroke = { tool: "text", color, lineWidth, points: [textPrompt], text: textValue };
    commitStroke(stroke);
    redraw();
    setTextPrompt(null); setTextValue("");
  }

  function commitDim() {
    if (!dimStroke) return;
    const s = { ...dimStroke, label: dimLabel || "?" };
    commitStroke(s);
    redraw();
    setDimStroke(null); setDimLabel("");
  }

  function undo() {
    const updated = pages.map((pg, i) =>
      i === activePage ? { ...pg, strokes: pg.strokes.slice(0, -1) } : pg
    );
    strokesRef.current = updated[activePage].strokes;
    onPagesChange(updated);
    setTimeout(() => redraw(), 0);
  }

  function clearPage() {
    const updated = pages.map((pg, i) =>
      i === activePage ? { ...pg, strokes: [] } : pg
    );
    strokesRef.current = [];
    onPagesChange(updated);
    setTimeout(() => redraw(), 0);
  }

  function exportPNG() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const a = document.createElement("a");
    a.download = `sketch-${pages[activePage]?.name ?? "page"}.png`;
    a.href = canvas.toDataURL("image/png");
    a.click();
  }

  function addPage() {
    const newPage: SketchPage = { id: Date.now().toString(), name: `Page ${pages.length + 1}`, strokes: [] };
    onPagesChange([...pages, newPage]);
    onActivePageChange(pages.length);
  }

  function deletePage(idx: number) {
    if (pages.length <= 1) return;
    const updated = pages.filter((_, i) => i !== idx);
    onPagesChange(updated);
    onActivePageChange(Math.min(activePage, updated.length - 1));
  }

  function startRename(idx: number) {
    setRenamingPage(idx);
    setRenameValue(pages[idx].name);
  }

  function commitRename() {
    if (renamingPage === null) return;
    const updated = pages.map((pg, i) => i === renamingPage ? { ...pg, name: renameValue || pg.name } : pg);
    onPagesChange(updated);
    setRenamingPage(null);
  }

  const TOOLS: { key: SketchStroke["tool"]; label: string }[] = [
    { key: "pen", label: "✏️" },
    { key: "line", label: "—" },
    { key: "rect", label: "▭" },
    { key: "circle", label: "◯" },
    { key: "text", label: "T" },
    { key: "dimension", label: "↔" },
    { key: "eraser", label: "⌫" },
  ];
  const COLORS = ["#1e293b","#ef4444","#f97316","#eab308","#22c55e","#3b82f6","#8b5cf6","#ec4899"];
  const WIDTHS = [1, 2, 4, 8];

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-3 space-y-2">
        {/* Tools */}
        <div className="flex items-center gap-1 flex-wrap">
          {TOOLS.map(t => (
            <button key={t.key} onClick={() => setTool(t.key)}
              title={t.key}
              className={`px-3 py-1.5 rounded-lg text-sm font-bold transition-colors ${
                tool === t.key
                  ? "bg-blue-600 text-white"
                  : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
              }`}>
              {t.label}
            </button>
          ))}
          <div className="flex-1"/>
          <button onClick={undo} className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-medium hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">Undo</button>
          <button onClick={clearPage} className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-medium hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">Clear</button>
          <button onClick={exportPNG} className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium transition-colors">Export</button>
        </div>
        {/* Colors + width */}
        <div className="flex items-center gap-2 flex-wrap">
          {COLORS.map(c => (
            <button key={c} onClick={() => setColor(c)}
              className={`w-6 h-6 rounded-full border-2 transition-transform ${color === c ? "border-slate-400 scale-125" : "border-transparent"}`}
              style={{ background: c }}/>
          ))}
          <div className="w-px h-5 bg-slate-200 dark:bg-slate-700 mx-1"/>
          {WIDTHS.map(w => (
            <button key={w} onClick={() => setLineWidth(w)}
              className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold transition-colors ${
                lineWidth === w ? "bg-blue-100 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400" : "bg-slate-100 dark:bg-slate-800 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700"
              }`}>
              {w}
            </button>
          ))}
        </div>
      </div>

      {/* Canvas */}
      <div className="rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 relative">
        <canvas
          ref={canvasRef} width={800} height={550}
          className="w-full cursor-crosshair"
          style={{ touchAction: "none", background: "#f8fafc" }}
          onMouseDown={pointerDown} onMouseMove={pointerMove} onMouseUp={pointerUp} onMouseLeave={pointerUp}
          onTouchStart={pointerDown} onTouchMove={pointerMove} onTouchEnd={pointerUp}
        />
        {/* Text input overlay */}
        {textPrompt && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/30 z-10">
            <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 shadow-2xl flex flex-col gap-3 w-64">
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">Add text label</p>
              <input
                value={textValue} onChange={e => setTextValue(e.target.value)}
                onKeyDown={e => e.key === "Enter" && commitText()}
                autoFocus placeholder="Type label..."
                className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
              />
              <div className="flex gap-2">
                <button onClick={commitText} className="flex-1 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold">Add</button>
                <button onClick={() => { setTextPrompt(null); setTextValue(""); }} className="px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-sm">Cancel</button>
              </div>
            </div>
          </div>
        )}
        {/* Dimension label overlay */}
        {dimStroke && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/30 z-10">
            <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 shadow-2xl flex flex-col gap-3 w-64">
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">Dimension label (e.g. "24 ft")</p>
              <input
                value={dimLabel} onChange={e => setDimLabel(e.target.value)}
                onKeyDown={e => e.key === "Enter" && commitDim()}
                autoFocus placeholder='e.g. 24 ft'
                className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
              />
              <div className="flex gap-2">
                <button onClick={commitDim} className="flex-1 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold">Add</button>
                <button onClick={() => { setDimStroke(null); setDimLabel(""); }} className="px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-sm">Cancel</button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Page tabs */}
      <div className="flex items-center gap-1 overflow-x-auto pb-1">
        {pages.map((pg, idx) => (
          <div key={pg.id} className="flex items-center">
            {renamingPage === idx ? (
              <input
                value={renameValue} onChange={e => setRenameValue(e.target.value)}
                onBlur={commitRename} onKeyDown={e => e.key === "Enter" && commitRename()}
                autoFocus
                className="px-2 py-1 rounded-lg border border-blue-400 text-xs bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 w-24 focus:outline-none"
              />
            ) : (
              <button
                onClick={() => onActivePageChange(idx)}
                onDoubleClick={() => startRename(idx)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                  activePage === idx
                    ? "bg-blue-600 text-white"
                    : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
                }`}>
                {pg.name}
              </button>
            )}
            {pages.length > 1 && (
              <button onClick={() => deletePage(idx)}
                className="ml-0.5 p-1 rounded-md text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors">
                <X size={10}/>
              </button>
            )}
          </div>
        ))}
        <button onClick={addPage}
          className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700 whitespace-nowrap transition-colors">
          + Add Page
        </button>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function SiteVisitPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const [projectName, setProjectName] = useState("");
  const [visit, setVisit] = useState<SiteVisit | null>(null);
  const [photos, setPhotos] = useState<SitePhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<"notes" | "photos" | "sketch">("notes");
  const [annotatingPhoto, setAnnotatingPhoto] = useState<SitePhoto | null>(null);

  // Voice
  const [recording, setRecording] = useState(false);
  const [transcript, setTranscript] = useState("");
  const recognitionRef = useRef<any>(null);

  // AI
  const [aiLoading, setAiLoading] = useState(false);
  const [aiSuggestion, setAiSuggestion] = useState("");

  // Notes fields
  const [clientReqs, setClientReqs] = useState("");
  const [observations, setObservations] = useState("");
  const [materials, setMaterials] = useState("");
  const [laborNotes, setLaborNotes] = useState("");

  // Photo upload
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // Sketch
  const [sketchPages, setSketchPages] = useState<SketchPage[]>([
    { id: "1", name: "Page 1", strokes: [] },
  ]);
  const [activeSketchPage, setActiveSketchPage] = useState(0);

  useEffect(() => { if (projectId) { loadProject(); loadVisit(); } }, [projectId]);

  async function loadProject() {
    const { data } = await supabase.from("projects").select("name").eq("id", projectId!).single();
    if (data) setProjectName(data.name);
  }

  async function loadVisit() {
    setLoading(true);
    const { data } = await supabase
      .from("site_visits").select("*").eq("project_id", projectId!)
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (data) {
      setVisit(data);
      setClientReqs(data.client_requirements || "");
      setObservations(data.site_observations || "");
      setMaterials(data.materials_noted || "");
      setLaborNotes(data.labor_notes || "");
      setTranscript(data.voice_transcript || "");
      await loadPhotos(data.id);
    }
    setLoading(false);
  }

  async function loadPhotos(visitId: string) {
    const { data } = await supabase.from("site_visit_photos").select("*").eq("site_visit_id", visitId).order("created_at", { ascending: false });
    const withUrls = (data || []).map(p => {
      const { data: urlData } = supabase.storage.from("project-files").getPublicUrl(p.photo_url);
      return { ...p, publicUrl: p.annotated_url || urlData.publicUrl };
    });
    setPhotos(withUrls);
  }

  async function ensureVisit(): Promise<string> {
    if (visit?.id) return visit.id;
    const { data: { user } } = await supabase.auth.getUser();
    const { data: profile } = await supabase.from("user_profiles").select("company_id").eq("id", user!.id).single();
    const { data } = await supabase.from("site_visits").insert({
      project_id: projectId, company_id: profile?.company_id, visited_by: user!.id,
      client_requirements: "", site_observations: "", materials_noted: "", labor_notes: "", voice_transcript: "",
    }).select().single();
    setVisit(data);
    return data.id;
  }

  async function saveNotes() {
    setSaving(true);
    try {
      const visitId = await ensureVisit();
      await supabase.from("site_visits").update({
        client_requirements: clientReqs, site_observations: observations,
        materials_noted: materials, labor_notes: laborNotes,
        voice_transcript: transcript, updated_at: new Date().toISOString(),
      }).eq("id", visitId);
    } finally { setSaving(false); }
  }

  // ─── Voice ────────────────────────────────────────────────────────────────
  function startRecording() {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { alert("Voice recording not supported. Use Chrome."); return; }
    const rec = new SR();
    rec.continuous = true; rec.interimResults = true; rec.lang = "en-US";
    rec.onresult = (event: any) => {
      let final = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) final += event.results[i][0].transcript + " ";
      }
      if (final) setTranscript(prev => prev + final);
    };
    rec.start();
    recognitionRef.current = rec;
    setRecording(true);
  }

  function stopRecording() { recognitionRef.current?.stop(); setRecording(false); }

  function speakTranscript() {
    if (!transcript) return;
    const utt = new SpeechSynthesisUtterance(transcript);
    utt.rate = 0.9;
    window.speechSynthesis.speak(utt);
  }

  // ─── AI ───────────────────────────────────────────────────────────────────
  async function aiEnhanceNotes() {
    setAiLoading(true);
    try {
      const prompt = `You are a construction estimating assistant. A site supervisor recorded these field notes:

Client Requirements: ${clientReqs}
Site Observations: ${observations}
Materials Noted: ${materials}
Labor Notes: ${laborNotes}
Voice Transcript: ${transcript}

Please:
1. Organise and clean up these notes into clear sections
2. Identify any missing information that should be noted
3. Suggest what trades/work items will likely be needed
4. Flag anything that could affect cost or timeline

Respond in a clear, structured format that a construction estimator can use.`;
      const result = await magnusAI.chat(prompt);
      setAiSuggestion(result || "");
    } catch {
      setAiSuggestion("AI enhancement failed. Please try again.");
    } finally { setAiLoading(false); }
  }

  // ─── Photos ───────────────────────────────────────────────────────────────
  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const visitId = await ensureVisit();
    const { data: { user } } = await supabase.auth.getUser();
    const { data: profile } = await supabase.from("user_profiles").select("company_id").eq("id", user!.id).single();
    for (const file of Array.from(files)) {
      const ext = file.name.split(".").pop();
      const path = `site-visits/${projectId}/${Date.now()}-${Math.random().toString(36).substring(7)}.${ext}`;
      await supabase.storage.from("project-files").upload(path, file, { upsert: false });
      await supabase.from("site_visit_photos").insert({
        site_visit_id: visitId, project_id: projectId, company_id: profile?.company_id, photo_url: path, caption: "",
      });
    }
    await loadPhotos(visitId);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (cameraInputRef.current) cameraInputRef.current.value = "";
  }

  async function handleAnnotationSave(photo: SitePhoto, annotationData: any, dataUrl: string) {
    const blob = await (await fetch(dataUrl)).blob();
    const path = `site-visits/${projectId}/annotated-${photo.id}.jpg`;
    await supabase.storage.from("project-files").upload(path, blob, { upsert: true });
    const { data: urlData } = supabase.storage.from("project-files").getPublicUrl(path);
    await supabase.from("site_visit_photos").update({ annotation_data: annotationData, annotated_url: urlData.publicUrl }).eq("id", photo.id);
    setAnnotatingPhoto(null);
    if (visit?.id) await loadPhotos(visit.id);
  }

  async function deletePhoto(photo: SitePhoto) {
    if (!confirm("Delete this photo?")) return;
    await supabase.from("site_visit_photos").delete().eq("id", photo.id);
    await supabase.storage.from("project-files").remove([photo.photo_url]);
    if (visit?.id) await loadPhotos(visit.id);
  }

  // ─── Render ───────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center">
      <p className="text-slate-400 text-sm">Loading site visit...</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      {annotatingPhoto && (
        <PhotoAnnotator
          photo={annotatingPhoto}
          onSave={(data, url) => handleAnnotationSave(annotatingPhoto, data, url)}
          onClose={() => setAnnotatingPhoto(null)}
        />
      )}

      {/* Header */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
          <ChevronLeft size={18} className="text-slate-600 dark:text-slate-300"/>
        </button>
        <div className="flex-1">
          <h1 className="text-base font-bold text-slate-800 dark:text-slate-100">Site Visit Notes</h1>
          <p className="text-xs text-slate-500">{projectName}</p>
        </div>
        <button onClick={saveNotes} disabled={saving}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold rounded-xl transition-colors">
          <Save size={14}/> {saving ? "Saving..." : "Save"}
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        {([["notes","📝","Notes"],["photos","📸","Photos"],["sketch","✏️","Sketch"]] as const).map(([tab, icon, label]) => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-colors border-b-2 ${
              activeTab === tab
                ? "border-blue-500 text-blue-600 dark:text-blue-400"
                : "border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
            }`}>
            <span>{icon}</span> {label}
          </button>
        ))}
      </div>

      <div className="max-w-2xl mx-auto p-4 space-y-4">

        {/* ── NOTES TAB ── */}
        {activeTab === "notes" && (
          <div className="space-y-4">
            {/* Voice recorder */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">🎙️ Voice Notes</h3>
                <div className="flex items-center gap-2">
                  {transcript && (
                    <button onClick={speakTranscript}
                      className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-blue-500 transition-colors"
                      title="Play back transcript">
                      <Volume2 size={16}/>
                    </button>
                  )}
                  <button onClick={recording ? stopRecording : startRecording}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${
                      recording ? "bg-red-500 hover:bg-red-600 text-white animate-pulse" : "bg-blue-600 hover:bg-blue-700 text-white"
                    }`}>
                    {recording ? <><MicOff size={14}/> Stop</> : <><Mic size={14}/> Record</>}
                  </button>
                </div>
              </div>
              {recording && (
                <div className="flex items-center gap-2 text-red-500 text-xs mb-2 animate-pulse">
                  <span className="w-2 h-2 rounded-full bg-red-500 inline-block"/>
                  Recording... speak now
                </div>
              )}
              <textarea
                value={transcript} onChange={e => setTranscript(e.target.value)}
                placeholder="Tap Record and speak your site observations... or type directly here"
                className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-slate-700 dark:text-slate-200 placeholder-slate-400 resize-none h-28 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
              />
            </div>

            {/* Structured notes */}
            {([
              ["🏗️ What the Client Wants", clientReqs, setClientReqs, "e.g. 3-bedroom extension, new kitchen, repaint exterior..."],
              ["👁️ Site Observations", observations, setObservations, "e.g. Existing structure condition, access issues, soil type..."],
              ["🧱 Materials Noted", materials, setMaterials, "e.g. Need 6\" blocks, steel reinforcement, roofing sheets..."],
              ["👷 Labor Notes", laborNotes, setLaborNotes, "e.g. Estimate 3 masons, 2 laborers, 2 weeks..."],
            ] as const).map(([label, value, setter, placeholder]) => (
              <div key={label} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4">
                <label className="text-sm font-semibold text-slate-700 dark:text-slate-300 block mb-2">{label}</label>
                <textarea
                  value={value}
                  onChange={e => setter(e.target.value)}
                  placeholder={placeholder}
                  className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-slate-700 dark:text-slate-200 placeholder-slate-400 resize-none h-20 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                />
              </div>
            ))}

            {/* AI Enhance */}
            <button onClick={aiEnhanceNotes} disabled={aiLoading}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 disabled:opacity-50 text-white font-semibold text-sm transition-all">
              <Sparkles size={16}/>
              {aiLoading ? "AI is thinking..." : "✨ Enhance with AI"}
            </button>

            {aiSuggestion && (
              <div className="bg-purple-50 dark:bg-purple-500/10 border border-purple-200 dark:border-purple-500/30 rounded-2xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles size={14} className="text-purple-500"/>
                  <span className="text-xs font-semibold text-purple-600 dark:text-purple-400">AI Summary</span>
                </div>
                <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed">{aiSuggestion}</p>
              </div>
            )}
          </div>
        )}

        {/* ── PHOTOS TAB ── */}
        {activeTab === "photos" && (
          <div className="space-y-4">
            <div className="flex gap-3">
              <button onClick={() => cameraInputRef.current?.click()}
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors">
                <Camera size={16}/> Take Photo
              </button>
              <button onClick={() => fileInputRef.current?.click()}
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-sm font-semibold transition-colors">
                <Upload size={16}/> Upload
              </button>
            </div>

            <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" multiple onChange={handlePhotoUpload} className="hidden"/>
            <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handlePhotoUpload} className="hidden"/>

            {photos.length === 0 ? (
              <div className="text-center py-12">
                <Camera size={40} className="mx-auto text-slate-300 mb-3"/>
                <p className="text-slate-500 text-sm">No photos yet — take or upload site photos</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {photos.map(photo => (
                  <div key={photo.id} className="rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                    <div className="aspect-square overflow-hidden bg-slate-100 dark:bg-slate-800">
                      <img src={photo.publicUrl} alt={photo.caption || "Site photo"} className="w-full h-full object-cover"/>
                    </div>
                    <div className="flex border-t border-slate-100 dark:border-slate-800">
                      <button onClick={() => setAnnotatingPhoto(photo)}
                        className="flex-1 flex items-center justify-center gap-1 py-2 text-xs font-medium text-slate-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-500/10 transition-colors">
                        <Pencil size={12}/> Annotate
                      </button>
                      <div className="w-px bg-slate-100 dark:bg-slate-800"/>
                      <button onClick={() => deletePhoto(photo)}
                        className="flex-1 flex items-center justify-center gap-1 py-2 text-xs font-medium text-slate-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors">
                        <Trash2 size={12}/> Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── SKETCH TAB ── */}
        {activeTab === "sketch" && (
          <SketchBoard
            pages={sketchPages}
            activePage={activeSketchPage}
            onPagesChange={setSketchPages}
            onActivePageChange={setActiveSketchPage}
          />
        )}

      </div>
    </div>
  );
}
