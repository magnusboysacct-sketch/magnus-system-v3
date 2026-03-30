import { supabase } from "./supabase";
import { logActivity } from "./activity";

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
  // Extended fields for actionEngine, decisionEngine, optimizationEngine
  crew_size?: number;
  production_rate_per_day?: number;
  percent_complete?: number;
  actual_duration_days?: number;
  planned_duration_days?: number;
  weather_impact_factor?: number;
  labor_cost_per_day?: number;
  equipment_cost_per_day?: number;
  material_cost_total?: number;
  boq_item_id?: string | null;
  quantity?: number;
}

export interface ProjectProgress {
  total_tasks: number;
  completed_tasks: number;
  progress_percent: number;
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

    await logActivity(projectId, "task_created", `Created task: ${taskName}`);

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
    const { data: existingTask } = await supabase
      .from("project_tasks")
      .select("status, task_name, project_id")
      .eq("id", taskId)
      .single();

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

    if (existingTask && updates.status === "complete" && existingTask.status !== "complete") {
      await logActivity(existingTask.project_id, "task_completed", `Completed task: ${existingTask.task_name}`);
    } else if (existingTask && updates.status && updates.status !== existingTask.status) {
      await logActivity(existingTask.project_id, "task_updated", `Updated task: ${existingTask.task_name}`);
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

export async function getProjectProgress(projectId: string): Promise<ProjectProgress> {
  try {
    const { data, error } = await supabase
      .from("project_tasks")
      .select("status")
      .eq("project_id", projectId);

    if (error) {
      console.error("Error fetching project progress:", error);
      return {
        total_tasks: 0,
        completed_tasks: 0,
        progress_percent: 0,
      };
    }

    const tasks = data || [];
    const total_tasks = tasks.length;
    const completed_tasks = tasks.filter((task) => task.status === "complete").length;
    const progress_percent = total_tasks > 0 ? Math.round((completed_tasks / total_tasks) * 100) : 0;

    return {
      total_tasks,
      completed_tasks,
      progress_percent,
    };
  } catch (e) {
    console.error("Exception fetching project progress:", e);
    return {
      total_tasks: 0,
      completed_tasks: 0,
      progress_percent: 0,
    };
  }
}

// Additional functions for aiForecast.ts and decisionEngine.ts compatibility

export function getEffectivePlannedDuration(task: ProjectTask): number {
  return task.planned_duration_days ?? 0;
}

export function getWeatherCalculations(task: ProjectTask): {
  weatherDelay: number;
  weatherImpact: number;
} {
  return {
    weatherDelay: 0,
    weatherImpact: task.weather_impact_factor ?? 1,
  };
}

export function getTaskCostCalculations(task: ProjectTask): {
  plannedTaskCost: number;
} {
  const plannedDuration = task.planned_duration_days ?? 0;
  const laborCost = (task.labor_cost_per_day ?? 0) * plannedDuration;
  const equipmentCost = (task.equipment_cost_per_day ?? 0) * plannedDuration;
  const materialCost = task.material_cost_total ?? 0;
  
  return {
    plannedTaskCost: laborCost + equipmentCost + materialCost,
  };
}
