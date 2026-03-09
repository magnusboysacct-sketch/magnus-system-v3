import { supabase } from "./supabase";

export interface DailyLog {
  id: string;
  project_id: string;
  log_date: string;
  weather: string;
  workers_count: number;
  work_performed: string;
  deliveries: string;
  issues: string;
  notes: string;
  created_by: string;
  created_at: string;
}

export interface CreateDailyLogData {
  project_id: string;
  log_date: string;
  weather?: string;
  workers_count?: number;
  work_performed?: string;
  deliveries?: string;
  issues?: string;
  notes?: string;
}

export interface UpdateDailyLogData {
  log_date?: string;
  weather?: string;
  workers_count?: number;
  work_performed?: string;
  deliveries?: string;
  issues?: string;
  notes?: string;
}

export async function fetchDailyLogs(projectId: string) {
  try {
    const { data, error } = await supabase
      .from("project_daily_logs")
      .select("*")
      .eq("project_id", projectId)
      .order("log_date", { ascending: false });

    if (error) {
      console.error("Error fetching daily logs:", error);
      return { success: false, error, data: [] };
    }

    return { success: true, data: data || [] };
  } catch (e) {
    console.error("Exception fetching daily logs:", e);
    return { success: false, error: e, data: [] };
  }
}

export async function createDailyLog(logData: CreateDailyLogData) {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: new Error("User not authenticated") };
    }

    const { data, error } = await supabase
      .from("project_daily_logs")
      .insert({
        ...logData,
        created_by: user.id,
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating daily log:", error);
      return { success: false, error };
    }

    return { success: true, data };
  } catch (e) {
    console.error("Exception creating daily log:", e);
    return { success: false, error: e };
  }
}

export async function updateDailyLog(logId: string, updates: UpdateDailyLogData) {
  try {
    const { data, error } = await supabase
      .from("project_daily_logs")
      .update(updates)
      .eq("id", logId)
      .select()
      .single();

    if (error) {
      console.error("Error updating daily log:", error);
      return { success: false, error };
    }

    return { success: true, data };
  } catch (e) {
    console.error("Exception updating daily log:", e);
    return { success: false, error: e };
  }
}

export async function deleteDailyLog(logId: string) {
  try {
    const { error } = await supabase
      .from("project_daily_logs")
      .delete()
      .eq("id", logId);

    if (error) {
      console.error("Error deleting daily log:", error);
      return { success: false, error };
    }

    return { success: true };
  } catch (e) {
    console.error("Exception deleting daily log:", e);
    return { success: false, error: e };
  }
}
