// src/pages/TakeoffPage.tsx
// ✅ FULL UPGRADED VERSION (clean architecture, fixed logic, compact UI, stable engine)

import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { supabase } from "../lib/supabase";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  MousePointer2,
  Hand,
  Ruler,
  Move,
  PencilLine,
  Target,
  Upload,
  Plus,
  Minus,
  Crosshair,
  RefreshCw,
  Trash2,
} from "lucide-react";
import * as pdfjsLib from "pdfjs-dist";

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

/* ================= TYPES ================= */

type Point = { x: number; y: number };

type CalibrationUnit = "ft" | "m" | "cm" | "mm" | "yd";

type Mode = "select" | "pan" | "calibrate" | "line" | "area" | "count";

type MeasurementType = "line" | "area" | "count";

type View = {
  scale: number;
  x: number;
  y: number;
};

type Measurement = {
  id: string;
  type: MeasurementType;
  points: Point[];
  value: number;
  unit: string;
};

/* ================= HELPERS ================= */

const DEFAULT_VIEW: View = { scale: 1, x: 0, y: 0 };

const dist = (a: Point, b: Point) =>
  Math.hypot(b.x - a.x, b.y - a.y);

const lineLen = (pts: Point[]) =>
  pts.reduce((t, p, i) => (i ? t + dist(pts[i - 1], p) : 0), 0);

const polyArea = (pts: Point[]) => {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    s += a.x * b.y - b.x * a.y;
  }
  return Math.abs(s / 2);
};

/* ================= COMPONENT ================= */

export default function TakeoffPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams();
  const [search] = useSearchParams();

  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  /* ================= STATE ================= */

  const [projectId, setProjectId] = useState<string>("");
  const [sessionId, setSessionId] = useState<string>("");
  const [pageId, setPageId] = useState<string>("");

  const [mode, setMode] = useState<Mode>("select");
  const [view, setView] = useState<View>(DEFAULT_VIEW);

  const [pdf, setPdf] = useState<pdfjsLib.PDFDocumentProxy | null>(null);

  const [width, setWidth] = useState(1);
  const [height, setHeight] = useState(1);

  const [draft, setDraft] = useState<Point[]>([]);
  const [measurements, setMeasurements] = useState<Measurement[]>([]);

  const [calibration, setCalibration] = useState<{
    p1: Point | null;
    p2: Point | null;
    scale: number | null;
    unit: CalibrationUnit;
  }>({ p1: null, p2: null, scale: null, unit: "ft" });

  const [loading, setLoading] = useState(true);

  /* ================= PROJECT RESOLVE ================= */

  const resolvedProjectId = useMemo(() => {
    return (
      search.get("projectId") ||
      (location.state as any)?.projectId ||
      (params as any)?.projectId ||
      ""
    );
  }, [location.state, params, search]);

  /* ================= INIT ================= */

const init = useCallback(async () => {
  console.log("🚀 INIT START");

  if (!resolvedProjectId) {
    console.error("❌ NO PROJECT ID");
    setLoading(false);
    return;
  }

  try {
    setLoading(true);

    console.log("📌 Project:", resolvedProjectId);

    // SESSION
    let { data: session, error: sErr } = await supabase
      .from("takeoff_sessions")
      .select("*")
      .eq("project_id", resolvedProjectId)
      .limit(1)
      .maybeSingle();

    if (sErr) throw sErr;

    if (!session) {
      console.log("➕ Creating session...");
      const res = await supabase
        .from("takeoff_sessions")
        .insert({ project_id: resolvedProjectId })
        .select()
        .single();

      if (res.error) throw res.error;
      session = res.data;
    }

    console.log("✅ Session:", session.id);
    setSessionId(session.id);

    // PAGE
    let { data: page, error: pErr } = await supabase
      .from("takeoff_pages")
      .select("*")
      .eq("project_id", resolvedProjectId)
      .eq("session_id", session.id)
      .eq("page_number", 1)
      .maybeSingle();

    if (pErr) throw pErr;

    if (!page) {
      console.log("➕ Creating page...");
      const res = await supabase
        .from("takeoff_pages")
        .insert({
          project_id: resolvedProjectId,
          session_id: session.id,
          page_number: 1,
          page_label: "Page 1",
        })
        .select()
        .single();

      if (res.error) throw res.error;
      page = res.data;
    }

    console.log("✅ Page:", page.id);
    setPageId(page.id);

    // MEASUREMENTS
    const { data: m, error: mErr } = await supabase
      .from("takeoff_measurements")
      .select("*")
      .eq("page_id", page.id);

    if (mErr) throw mErr;

    setMeasurements(
      (m || []).map((x: any) => ({
        id: x.id,
        type: x.measurement_type,
        points: x.points || [],
        value: x.quantity || 0,
        unit: x.unit || "px",
      }))
    );

    console.log("✅ INIT COMPLETE");
  } catch (err: any) {
    console.error("🔥 INIT FAILED:", err.message);
  } finally {
    setLoading(false);
  }
}, [resolvedProjectId]);

  useEffect(() => {
    init();
  }, [init]);

  /* ================= DRAW ================= */

  const renderPdf = async (file: string) => {
    const doc = await pdfjsLib.getDocument(file).promise;
    setPdf(doc);

    const page = await doc.getPage(1);
    const vp = page.getViewport({ scale: 1 });

    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;

    canvas.width = vp.width;
    canvas.height = vp.height;

    await page.render({ canvasContext: ctx, viewport: vp }).promise;

    setWidth(vp.width);
    setHeight(vp.height);
  };

  /* ================= POINTER ================= */

  const toWorld = (x: number, y: number): Point => {
    const rect = stageRef.current!.getBoundingClientRect();
    return {
      x: (x - rect.left - view.x) / view.scale,
      y: (y - rect.top - view.y) / view.scale,
    };
  };

  const handleDown = (e: React.PointerEvent) => {
    const p = toWorld(e.clientX, e.clientY);

    if (mode === "calibrate") {
      setCalibration((c) =>
        !c.p1 ? { ...c, p1: p } : { ...c, p2: p }
      );
      return;
    }

    if (mode === "line" || mode === "area") {
      setDraft((d) => [...d, p]);
    }

    if (mode === "count") {
      saveMeasurement("count", [p]);
    }
  };

  const finishDraft = async () => {
    if (!draft.length) return;

    const type: MeasurementType =
      mode === "area" ? "area" : "line";

    saveMeasurement(type, draft);
    setDraft([]);
    setMode("select");
  };

  /* ================= SAVE ================= */

  const saveMeasurement = async (
    type: MeasurementType,
    pts: Point[]
  ) => {
    let val = 0;

    if (type === "line") val = lineLen(pts);
    if (type === "area") val = polyArea(pts);
    if (type === "count") val = pts.length;

    const payload = {
      project_id: projectId,
      session_id: sessionId,
      page_id: pageId,
      measurement_type: type,
      quantity: val,
      unit: "px",
      points: pts,
    };

    const { data } = await supabase
      .from("takeoff_measurements")
      .insert(payload)
      .select("*")
      .single();

    setMeasurements((prev) => [
      ...prev,
      {
        id: data.id,
        type,
        points: pts,
        value: val,
        unit: "px",
      },
    ]);
  };

  /* ================= VIEW ================= */

  const zoom = (factor: number) =>
    setView((v) => ({ ...v, scale: Math.max(0.1, Math.min(10, v.scale * factor)) }));

  /* ================= UI ================= */

  if (loading)
    return (
      <div className="flex h-full items-center justify-center">
        Loading Takeoff...
      </div>
    );

  return (
    <div className="flex h-full flex-col gap-2 bg-slate-50 p-2">

      {/* ===== TOOLBAR ===== */}
      <div className="flex flex-wrap gap-1 rounded-xl border bg-white p-2 text-xs">

        {[
          ["select", MousePointer2],
          ["pan", Hand],
          ["calibrate", Ruler],
          ["line", Move],
          ["area", PencilLine],
          ["count", Target],
        ].map(([m, Icon]) => (
          <button
            key={m}
            onClick={() => setMode(m as Mode)}
            className={`flex items-center gap-1 rounded-lg px-2 py-1 ${
              mode === m ? "bg-slate-900 text-white" : "hover:bg-slate-100"
            }`}
          >
            <Icon className="h-3 w-3" />
            {m}
          </button>
        ))}

        <div className="mx-1 w-px bg-slate-200" />

        <button onClick={() => zoom(1.1)}>
          <Plus className="h-3 w-3" />
        </button>
        <button onClick={() => zoom(0.9)}>
          <Minus className="h-3 w-3" />
        </button>

        <button onClick={init}>
          <RefreshCw className="h-3 w-3" />
        </button>

      </div>

      {/* ===== MAIN ===== */}
      <div className="flex flex-1 gap-2">

        {/* ===== LEFT PANEL ===== */}
        <div className="w-64 rounded-xl border bg-white p-2 overflow-auto">
          <div className="text-xs font-semibold mb-2">Measurements</div>

          {measurements.map((m) => (
            <div key={m.id} className="mb-1 rounded p-2 border text-xs">
              {m.type} — {m.value.toFixed(2)}
            </div>
          ))}
        </div>

        {/* ===== CANVAS ===== */}
        <div
          ref={stageRef}
          className="flex-1 relative overflow-hidden rounded-xl border bg-white"
          onPointerDown={handleDown}
          onDoubleClick={finishDraft}
        >
          <div
            style={{
              transform: `translate(${view.x}px,${view.y}px) scale(${view.scale})`,
              transformOrigin: "top left",
            }}
          >
            <canvas ref={canvasRef} />

            <svg width={width} height={height}>
              {measurements.map((m) => (
                <polyline
                  key={m.id}
                  points={m.points.map((p) => `${p.x},${p.y}`).join(" ")}
                  stroke="blue"
                  fill="none"
                />
              ))}

              {draft.length > 0 && (
                <polyline
                  points={draft.map((p) => `${p.x},${p.y}`).join(" ")}
                  stroke="orange"
                  fill="none"
                />
              )}
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}