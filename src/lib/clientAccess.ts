import { supabase } from "./supabase";

export interface ClientAccessInfo {
  hasAccess: boolean;
  isClientPortalUser: boolean;
  projectId: string;
}

export async function checkClientPortalAccess(projectId: string): Promise<ClientAccessInfo> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return {
        hasAccess: false,
        isClientPortalUser: false,
        projectId,
      };
    }

    const { data, error } = await supabase
      .from("project_members")
      .select("client_portal_access, role")
      .eq("project_id", projectId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (error || !data) {
      return {
        hasAccess: false,
        isClientPortalUser: false,
        projectId,
      };
    }

    return {
      hasAccess: true,
      isClientPortalUser: data.client_portal_access === true,
      projectId,
    };
  } catch (e) {
    console.error("Exception checking client portal access:", e);
    return {
      hasAccess: false,
      isClientPortalUser: false,
      projectId,
    };
  }
}

export async function getClientProjects() {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, data: [], error: new Error("Not authenticated") };
    }

    const { data, error } = await supabase
      .from("project_members")
      .select(`
        project_id,
        client_portal_access,
        projects (
          id,
          name,
          status,
          start_date,
          end_date,
          client_id,
          clients (
            name
          )
        )
      `)
      .eq("user_id", user.id)
      .eq("client_portal_access", true);

    if (error) {
      console.error("Error fetching client projects:", error);
      return { success: false, data: [], error };
    }

    return { success: true, data: data || [] };
  } catch (e) {
    console.error("Exception fetching client projects:", e);
    return { success: false, data: [], error: e };
  }
}

export async function updateClientPortalAccess(projectId: string, userId: string, hasAccess: boolean) {
  try {
    const { error } = await supabase
      .from("project_members")
      .update({ client_portal_access: hasAccess })
      .eq("project_id", projectId)
      .eq("user_id", userId);

    if (error) {
      console.error("Error updating client portal access:", error);
      return { success: false, error };
    }

    return { success: true };
  } catch (e) {
    console.error("Exception updating client portal access:", e);
    return { success: false, error: e };
  }
}
