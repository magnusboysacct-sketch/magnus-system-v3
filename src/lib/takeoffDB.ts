import { supabase } from "./supabase";

export interface TakeoffPDFMeasurement {
  id: string;
  project_id: string;
  session_id: string | null;
  measurement_type: "line" | "area" | "volume" | "count";
  label: string | null;
  quantity: number;
  unit: string;
  group_name: string | null;
  group_id: string | null;
  metadata: any;
  created_at: string;
  updated_at: string;
}

export async function saveMeasurementsToDB(
  projectId: string,
  sessionId: string | null,
  measurements: Array<{
    id: string;
    type: "line" | "area" | "volume" | "count" | "point";
    label?: string;
    result: number;
    unit: string;
    groupId?: string;
    metadata?: any;
  }>,
  groups: Array<{
    id: string;
    name: string;
    color: string;
  }>
) {
  if (!projectId) {
    console.warn("No project ID, skipping database save");
    return { success: false, error: "No project ID" };
  }

  try {
    const groupMap = new Map(groups.map((g) => [g.id, g]));

    const validMeasurements = measurements.filter(
      (m) => m.type === "line" || m.type === "area" || m.type === "volume" || m.type === "count"
    );

    const records = validMeasurements.map((m) => {
      const group = m.groupId ? groupMap.get(m.groupId) : null;
      return {
        project_id: projectId,
        session_id: sessionId,
        measurement_type: m.type as "line" | "area" | "volume" | "count",
        label: m.label || null,
        quantity: m.result,
        unit: m.unit,
        group_name: group?.name || null,
        group_id: m.groupId || null,
        metadata: m.metadata || {},
      };
    });

    const { data, error } = await supabase
      .from("takeoff_pdf_measurements")
      .delete()
      .eq("project_id", projectId)
      .eq("session_id", sessionId || "");

    if (error) {
      console.error("Error clearing old measurements:", error);
    }

    if (records.length > 0) {
      const { data: inserted, error: insertError } = await supabase
        .from("takeoff_pdf_measurements")
        .insert(records)
        .select();

      if (insertError) {
        console.error("Error saving measurements:", insertError);
        return { success: false, error: insertError };
      }

      return { success: true, data: inserted };
    }

    return { success: true, data: [] };
  } catch (e) {
    console.error("Exception saving measurements:", e);
    return { success: false, error: e };
  }
}

export async function fetchMeasurementsFromDB(projectId: string) {
  if (!projectId) {
    return { success: false, error: "No project ID", data: [] };
  }

  try {
    const { data, error } = await supabase
      .from("takeoff_pdf_measurements")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Error fetching measurements:", error);
      return { success: false, error, data: [] };
    }

    return { success: true, data: data as TakeoffPDFMeasurement[] };
  } catch (e) {
    console.error("Exception fetching measurements:", e);
    return { success: false, error: e, data: [] };
  }
}

export async function getMeasurementsSummaryByGroup(projectId: string) {
  if (!projectId) {
    return { success: false, error: "No project ID", data: [] };
  }

  try {
    const { data, error } = await supabase
      .from("takeoff_pdf_measurements")
      .select("*")
      .eq("project_id", projectId);

    if (error) {
      console.error("Error fetching measurements:", error);
      return { success: false, error, data: [] };
    }

    const measurements = data as TakeoffPDFMeasurement[];

    const groupMap = new Map<
      string,
      {
        group_name: string;
        line_ft: number;
        area_ft2: number;
        volume_yd3: number;
        count_ea: number;
      }
    >();

    measurements.forEach((m) => {
      const groupName = m.group_name || "Ungrouped";
      if (!groupMap.has(groupName)) {
        groupMap.set(groupName, {
          group_name: groupName,
          line_ft: 0,
          area_ft2: 0,
          volume_yd3: 0,
          count_ea: 0,
        });
      }

      const group = groupMap.get(groupName)!;

      if (m.measurement_type === "line" && m.unit === "ft") {
        group.line_ft += Number(m.quantity);
      } else if (m.measurement_type === "area" && m.unit === "ft²") {
        group.area_ft2 += Number(m.quantity);
      } else if (m.measurement_type === "volume" && m.unit === "yd³") {
        group.volume_yd3 += Number(m.quantity);
      } else if (m.measurement_type === "count") {
        group.count_ea += Number(m.quantity);
      }
    });

    return { success: true, data: Array.from(groupMap.values()) };
  } catch (e) {
    console.error("Exception fetching summary:", e);
    return { success: false, error: e, data: [] };
  }
}
