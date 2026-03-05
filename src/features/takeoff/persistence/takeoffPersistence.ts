import { supabase } from "../../../lib/supabase";
import type { Measurement, MeasurementGroup, CalibrationState } from "../types/takeoff.types";

export type TakeoffSession = {
  id: string;
  project_id: string;
  pdf_name: string;
  pdf_storage_path: string | null;
  page_count: number;
  calibration: CalibrationState | null;
  created_at: string;
  updated_at: string;
};

export type TakeoffData = {
  groups: MeasurementGroup[];
  measurements: Measurement[];
  calibration: CalibrationState | null;
};

let saveTimeout: number | null = null;

export async function getOrCreateSession(
  projectId: string,
  pdfName?: string
): Promise<TakeoffSession | null> {
  try {
    const { data: existingSessions, error: fetchError } = await supabase
      .from("takeoff_sessions")
      .select("*")
      .eq("project_id", projectId)
      .order("updated_at", { ascending: false })
      .limit(1);

    if (fetchError) {
      console.error("Error fetching takeoff sessions:", fetchError);
      return null;
    }

    if (existingSessions && existingSessions.length > 0) {
      return existingSessions[0] as TakeoffSession;
    }

    const { data: newSession, error: createError } = await supabase
      .from("takeoff_sessions")
      .insert({
        project_id: projectId,
        pdf_name: pdfName || "Untitled",
        page_count: 1,
        calibration: null,
      })
      .select()
      .single();

    if (createError) {
      console.error("Error creating takeoff session:", createError);
      return null;
    }

    return newSession as TakeoffSession;
  } catch (e) {
    console.error("getOrCreateSession failed:", e);
    return null;
  }
}

export async function loadTakeoff(sessionId: string): Promise<TakeoffData | null> {
  try {
    const [groupsResult, measurementsResult, sessionResult] = await Promise.all([
      supabase
        .from("takeoff_groups")
        .select("*")
        .eq("session_id", sessionId)
        .order("sort_order", { ascending: true }),
      supabase
        .from("takeoff_measurements")
        .select("*")
        .eq("session_id", sessionId)
        .order("sort_order", { ascending: true }),
      supabase
        .from("takeoff_sessions")
        .select("calibration")
        .eq("id", sessionId)
        .single(),
    ]);

    if (groupsResult.error) {
      console.error("Error loading groups:", groupsResult.error);
      return null;
    }

    if (measurementsResult.error) {
      console.error("Error loading measurements:", measurementsResult.error);
      return null;
    }

    if (sessionResult.error) {
      console.error("Error loading session:", sessionResult.error);
      return null;
    }

    const dbGroups = groupsResult.data || [];
    const dbMeasurements = measurementsResult.data || [];
    const calibration = sessionResult.data?.calibration as CalibrationState | null;

    const groups: MeasurementGroup[] = dbGroups.map((g: any) => ({
      id: g.id,
      name: g.name,
      color: g.color,
      trade: g.trade || undefined,
      visible: !g.is_hidden,
      locked: false,
      sortOrder: g.sort_order,
    }));

    const measurements: Measurement[] = dbMeasurements.map((m: any) => ({
      id: m.id,
      type: m.type,
      points: m.points,
      result: Number(m.result),
      unit: m.unit,
      groupId: m.group_id || undefined,
      timestamp: new Date(m.created_at).getTime(),
      meta: m.meta || undefined,
    }));

    return {
      groups,
      measurements,
      calibration,
    };
  } catch (e) {
    console.error("loadTakeoff failed:", e);
    return null;
  }
}

export function saveTakeoffDebounced(
  sessionId: string,
  data: TakeoffData,
  delay: number = 800
): void {
  if (saveTimeout) {
    clearTimeout(saveTimeout);
  }

  saveTimeout = setTimeout(() => {
    saveTakeoff(sessionId, data).catch((e) => {
      console.error("Debounced saveTakeoff failed:", e);
    });
  }, delay);
}

export async function saveTakeoff(
  sessionId: string,
  data: TakeoffData
): Promise<boolean> {
  try {
    const { groups, measurements, calibration } = data;

    const { error: sessionError } = await supabase
      .from("takeoff_sessions")
      .update({
        calibration: calibration,
        updated_at: new Date().toISOString(),
      })
      .eq("id", sessionId);

    if (sessionError) {
      console.error("Error updating session:", sessionError);
      return false;
    }

    const { error: deleteGroupsError } = await supabase
      .from("takeoff_groups")
      .delete()
      .eq("session_id", sessionId);

    if (deleteGroupsError) {
      console.error("Error deleting old groups:", deleteGroupsError);
      return false;
    }

    if (groups.length > 0) {
      const groupsToInsert = groups.map((g, idx) => ({
        id: g.id,
        session_id: sessionId,
        name: g.name,
        color: g.color,
        trade: g.trade || null,
        is_hidden: !g.visible,
        sort_order: g.sortOrder !== undefined ? g.sortOrder : idx,
      }));

      const { error: insertGroupsError } = await supabase
        .from("takeoff_groups")
        .insert(groupsToInsert);

      if (insertGroupsError) {
        console.error("Error inserting groups:", insertGroupsError);
        return false;
      }
    }

    const { error: deleteMeasurementsError } = await supabase
      .from("takeoff_measurements")
      .delete()
      .eq("session_id", sessionId);

    if (deleteMeasurementsError) {
      console.error("Error deleting old measurements:", deleteMeasurementsError);
      return false;
    }

    if (measurements.length > 0) {
      const measurementsToInsert = measurements.map((m, idx) => ({
        id: m.id,
        session_id: sessionId,
        page_number: 1,
        group_id: m.groupId || null,
        type: m.type,
        points: m.points,
        unit: m.unit,
        result: m.result,
        meta: m.meta || null,
        sort_order: idx,
      }));

      const { error: insertMeasurementsError } = await supabase
        .from("takeoff_measurements")
        .insert(measurementsToInsert);

      if (insertMeasurementsError) {
        console.error("Error inserting measurements:", insertMeasurementsError);
        return false;
      }
    }

    return true;
  } catch (e) {
    console.error("saveTakeoff failed:", e);
    return false;
  }
}

export function cancelPendingSave(): void {
  if (saveTimeout) {
    clearTimeout(saveTimeout);
    saveTimeout = null;
  }
}
