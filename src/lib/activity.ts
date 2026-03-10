import { supabase } from "./supabase";

export type ActivityType =
  | "document_upload"
  | "photo_upload"
  | "daily_log"
  | "task_created"
  | "task_completed"
  | "task_updated"
  | "procurement_received"
  | "procurement_created"
  | "procurement_generated"
  | "estimate_created"
  | "cost_added"
  | "project_created"
  | "project_updated";

export interface ProjectActivity {
  id: string;
  project_id: string;
  activity_type: ActivityType;
  message: string;
  created_by: string | null;
  created_at: string;
  user_profile?: {
    full_name: string | null;
    email: string | null;
  };
}

export async function fetchProjectActivity(projectId: string, limit: number = 50) {
  try {
    const { data, error } = await supabase
      .from("project_activity")
      .select(`
        id,
        project_id,
        activity_type,
        message,
        created_by,
        created_at,
        user_profiles:created_by (
          full_name,
          email
        )
      `)
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      console.error("Error fetching project activity:", error);
      return { success: false, error, data: [] };
    }

    const activities: ProjectActivity[] = (data || []).map((item: any) => ({
      id: item.id,
      project_id: item.project_id,
      activity_type: item.activity_type,
      message: item.message,
      created_by: item.created_by,
      created_at: item.created_at,
      user_profile: item.user_profiles
        ? {
            full_name: item.user_profiles.full_name,
            email: item.user_profiles.email,
          }
        : undefined,
    }));

    return { success: true, data: activities };
  } catch (e) {
    console.error("Exception fetching project activity:", e);
    return { success: false, error: e, data: [] };
  }
}

export async function createProjectActivity(
  projectId: string,
  activityType: ActivityType,
  message: string
) {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      console.error("Cannot create activity: user not authenticated");
      return { success: false, error: new Error("Not authenticated") };
    }

    const { data, error } = await supabase
      .from("project_activity")
      .insert({
        project_id: projectId,
        activity_type: activityType,
        message,
        created_by: user.id,
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating project activity:", error);
      return { success: false, error };
    }

    return { success: true, data };
  } catch (e) {
    console.error("Exception creating project activity:", e);
    return { success: false, error: e };
  }
}

export async function logActivity(
  projectId: string,
  activityType: ActivityType,
  message: string
) {
  await createProjectActivity(projectId, activityType, message);
}

export function getActivityIcon(activityType: ActivityType): string {
  switch (activityType) {
    case "document_upload":
      return "📄";
    case "photo_upload":
      return "📸";
    case "daily_log":
      return "📋";
    case "task_created":
      return "✅";
    case "task_completed":
      return "🎯";
    case "task_updated":
      return "📝";
    case "procurement_received":
      return "📦";
    case "procurement_created":
      return "🛒";
    case "procurement_generated":
      return "🔧";
    case "estimate_created":
      return "📊";
    case "cost_added":
      return "💰";
    case "project_created":
      return "🚀";
    case "project_updated":
      return "🔄";
    default:
      return "•";
  }
}

export function getActivityColor(activityType: ActivityType): string {
  switch (activityType) {
    case "document_upload":
      return "text-blue-400";
    case "photo_upload":
      return "text-slate-400";
    case "daily_log":
      return "text-cyan-400";
    case "task_created":
      return "text-green-400";
    case "task_completed":
      return "text-emerald-400";
    case "task_updated":
      return "text-yellow-400";
    case "procurement_received":
      return "text-orange-400";
    case "procurement_created":
      return "text-blue-400";
    case "procurement_generated":
      return "text-teal-400";
    case "estimate_created":
      return "text-cyan-400";
    case "cost_added":
      return "text-red-400";
    case "project_created":
      return "text-green-500";
    case "project_updated":
      return "text-blue-500";
    default:
      return "text-slate-400";
  }
}
