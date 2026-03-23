// UPDATED TakeoffPage.tsx (REAL SCHEMA VERSION)

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useParams, useSearchParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useProjectContext } from "../context/ProjectContext";

/* ---------------- TYPES ---------------- */

type Point = { x: number; y: number };

type TakeoffPageRow = {
  id: string;
  session_id: string;
  project_id: string;
  page_number: number;
  page_label: string | null;
  drawing_id: string | null;

  calibration_scale: number | null;
  calibration_unit: string | null;
  calibration_distance: number | null;

  calibration_point_1: Point | null;
  calibration_point_2: Point | null;

  calibration_p1: Point | null;
  calibration_p2: Point | null;

  page_data: any;

  width: number | null;
  height: number | null;
};

/* ---------------- HELPERS ---------------- */

function uid() {
  return `${Math.random().toString(36).slice(2)}_${Date.now()}`;
}

function dist(a: Point, b: Point) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/* ---------------- MAIN ---------------- */

export default function TakeoffPage() {
  const { projectId: routeProjectId } = useParams();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const projectContext = useProjectContext();

  const [projectId, setProjectId] = useState<string | null>(null);

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [pages, setPages] = useState<TakeoffPageRow[]>([]);
  const [activePage, setActivePage] = useState<TakeoffPageRow | null>(null);

  const [calibration, setCalibration] = useState<any>(null);

  /* ---------------- PROJECT RESOLVE ---------------- */

  useEffect(() => {
    const resolved =
      projectContext?.activeProjectId ||
      routeProjectId ||
      searchParams.get("projectId") ||
      (location.state as any)?.projectId ||
      null;

    setProjectId(resolved);
  }, [projectContext, routeProjectId, searchParams, location]);

  /* ---------------- SESSION ---------------- */

  const ensureSession = useCallback(async () => {
    if (!projectId) return null;

    const existing = await supabase
      .from("takeoff_sessions")
      .select("*")
      .eq("project_id", projectId)
      .limit(1)
      .maybeSingle();

    if (existing.data) {
      setSessionId(existing.data.id);
      return existing.data.id;
    }

    const created = await supabase
      .from("takeoff_sessions")
      .insert({
        project_id: projectId,
        name: "Takeoff Session",
        status: "active",
      })
      .select("*")
      .single();

    if (created.data) {
      setSessionId(created.data.id);
      return created.data.id;
    }

    return null;
  }, [projectId]);

  /* ---------------- PAGE ---------------- */

  const ensurePage = useCallback(
    async (sessionId: string) => {
      const existing = await supabase
        .from("takeoff_pages")
        .select("*")
        .eq("session_id", sessionId)
        .eq("page_number", 1)
        .maybeSingle();

      if (existing.data) {
        setActivePage(existing.data);
        return existing.data;
      }

      const created = await supabase
        .from("takeoff_pages")
        .insert({
          session_id: sessionId,
          project_id: projectId,
          page_number: 1,
          page_label: "Page 1",
          page_data: {},
        })
        .select("*")
        .single();

      if (created.data) {
        setActivePage(created.data);
        return created.data;
      }

      return null;
    },
    [projectId]
  );

  /* ---------------- BOOTSTRAP ---------------- */

  useEffect(() => {
    if (!projectId) return;

    (async () => {
      const s = await ensureSession();
      if (!s) return;

      const p = await ensurePage(s);
      if (!p) return;

      setCalibration(
        p.calibration_scale
          ? {
              scale: p.calibration_scale,
              unit: p.calibration_unit,
              distance: p.calibration_distance,
              p1: p.calibration_point_1 || p.calibration_p1,
              p2: p.calibration_point_2 || p.calibration_p2,
            }
          : null
      );
    })();
  }, [projectId, ensureSession, ensurePage]);

  /* ---------------- SAVE ---------------- */

  const savePage = useCallback(
    async (patch: Partial<TakeoffPageRow>) => {
      if (!activePage) return;

      const payload = {
        ...patch,
        page_label: patch.page_label ?? activePage.page_label,
        page_data: patch.page_data ?? activePage.page_data,
      };

      const { data } = await supabase
        .from("takeoff_pages")
        .update(payload)
        .eq("id", activePage.id)
        .select("*")
        .single();

      if (data) setActivePage(data);
    },
    [activePage]
  );

  /* ---------------- CALIBRATION ---------------- */

  const applyCalibration = async (p1: Point, p2: Point, realDistance: number, unit: string) => {
    const pxDistance = dist(p1, p2);
    const scale = realDistance / pxDistance;

    const payload = {
      calibration_scale: scale,
      calibration_unit: unit,
      calibration_distance: realDistance,

      calibration_point_1: p1,
      calibration_point_2: p2,

      calibration_p1: p1,
      calibration_p2: p2,
    };

    await savePage(payload);

    setCalibration({
      scale,
      unit,
      distance: realDistance,
      p1,
      p2,
    });
  };

  /* ---------------- UI ---------------- */

  if (!projectId) {
    return (
      <div className="p-10 text-center text-slate-500">
        Select a project to start Takeoff
      </div>
    );
  }

  return (
    <div className="h-screen bg-slate-100 p-3">
      <div className="h-full rounded-2xl bg-white shadow p-4 flex flex-col gap-3">
        
        {/* HEADER */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="font-semibold text-lg">Takeoff</h1>
            <p className="text-xs text-slate-500">
              {activePage?.page_label || "No Page"}
            </p>
          </div>

          <button
            onClick={() => savePage({})}
            className="bg-slate-900 text-white px-3 py-2 rounded-xl text-sm"
          >
            Save
          </button>
        </div>

        {/* DRAWING AREA */}
        <div className="flex-1 border rounded-xl relative bg-slate-50 flex items-center justify-center">
          <div className="text-slate-400 text-sm">
            Drawing Viewer (ready for PDF integration)
          </div>

          {/* CALIBRATION LINE */}
          {calibration?.p1 && calibration?.p2 && (
            <svg className="absolute inset-0">
              <line
                x1={`${calibration.p1.x * 100}%`}
                y1={`${calibration.p1.y * 100}%`}
                x2={`${calibration.p2.x * 100}%`}
                y2={`${calibration.p2.y * 100}%`}
                stroke="green"
                strokeWidth="2"
              />
            </svg>
          )}
        </div>

        {/* FOOTER */}
        <div className="text-xs text-slate-500">
          {calibration
            ? `Calibrated (${calibration.unit})`
            : "Not calibrated"}
        </div>
      </div>
    </div>
  );
}