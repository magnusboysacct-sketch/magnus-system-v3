import { supabase } from "./supabase";

export type TaskStatus = "planned" | "active" | "complete";

export interface ProjectTask {
  id: string;
  project_id: string;
  task_name: string;
  start_date: string | null;
  end_date: string | null;
  status: TaskStatus;
  created_at: string;
  updated_at: string;
}

export async function fetchProjectTasks(projectId: string) {
  try {
    const { data, error } = await supabase
      .from("project_tasks")
      .select("*")
      .eq("project_id", projectId)
      .order("start_date", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Error fetching project tasks:", error);
      return { success: false, error, data: [] };
    }

    return { success: true, data: data || [] };
  } catch (e) {
    console.error("Exception fetching project tasks:", e);
    return { success: false, error: e, data: [] };
  }
}

export async function createProjectTask(
  projectId: string,
  taskName: string,
  startDate?: string,
  endDate?: string,
  status: TaskStatus = "planned"
) {
  try {
    const insertData: any = {
      project_id: projectId,
      task_name: taskName,
      status,
      start_date: startDate || null,
      end_date: endDate || null,
    };

    const { data, error } = await supabase
      .from("project_tasks")
      .insert(insertData)
      .select()
      .single();

    if (error) {
      console.error("Error creating project task:", error);
      return { success: false, error };
    }

    return { success: true, data };
  } catch (e) {
    console.error("Exception creating project task:", e);
    return { success: false, error: e };
  }
}

export async function updateProjectTask(
  taskId: string,
  updates: {
    task_name?: string;
    start_date?: string | null;
    end_date?: string | null;
    status?: TaskStatus;
  }
) {
  try {
    const updateData: any = {
      ...updates,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from("project_tasks")
      .update(updateData)
      .eq("id", taskId)
      .select()
      .single();

    if (error) {
      console.error("Error updating project task:", error);
      return { success: false, error };
    }

    return { success: true, data };
  } catch (e) {
    console.error("Exception updating project task:", e);
    return { success: false, error: e };
  }
}

export async function deleteProjectTask(taskId: string) {
  try {
    const { error } = await supabase
      .from("project_tasks")
      .delete()
      .eq("id", taskId);

    if (error) {
      console.error("Error deleting project task:", error);
      return { success: false, error };
    }

    return { success: true };
  } catch (e) {
    console.error("Exception deleting project task:", e);
    return { success: false, error: e };
  }
}
