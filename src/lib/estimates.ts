import { supabase } from "./supabase";
import { logActivity } from "./activity";

export interface EstimateHeader {
  id: string;
  project_id: string;
  title: string;
  status: "draft" | "sent" | "approved" | "declined";
  version: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface EstimateItem {
  id: string;
  estimate_id: string;
  line_no: number;
  item_type: "labor" | "material" | "equipment" | "subcontractor" | "other";
  category: string | null;
  item: string;
  description: string | null;
  unit: string | null;
  qty: number;
  rate: number;
  amount: number;
  created_at: string;
  updated_at: string;
}

export async function generateEstimateFromBOQ(projectId: string, boqId: string) {
  console.log("[Estimate Generation] Starting for project:", projectId, "BOQ:", boqId);

  if (!projectId || !boqId) {
    return { success: false, error: "Missing project ID or BOQ ID" };
  }

  try {
    const { data: userData } = await supabase.auth.getUser();
    const currentUserId = userData.user?.id;
    console.log("[Estimate Generation] Current user:", currentUserId);

    const { data: boqHeader, error: headerError } = await supabase
      .from("boq_headers")
      .select("id, project_id, status, version")
      .eq("id", boqId)
      .eq("project_id", projectId)
      .maybeSingle();

    if (headerError) {
      console.error("[Estimate Generation] Error fetching BOQ header:", headerError);
      return { success: false, error: "Failed to fetch BOQ: " + headerError.message };
    }

    if (!boqHeader) {
      return { success: false, error: "BOQ not found or access denied" };
    }

    if (boqHeader.status !== "approved") {
      return { success: false, error: "BOQ must be approved before generating estimate" };
    }

    const { data: sections, error: sectionsError } = await supabase
      .from("boq_sections")
      .select("id, title")
      .eq("boq_id", boqId)
      .order("sort_order", { ascending: true });

    if (sectionsError) {
      console.error("[Estimate Generation] Error fetching sections:", sectionsError);
      return { success: false, error: "Failed to fetch BOQ sections: " + sectionsError.message };
    }

    if (!sections || sections.length === 0) {
      return { success: false, error: "No sections found in BOQ" };
    }

    const sectionIds = sections.map((s) => s.id);

    const { data: items, error: itemsError } = await supabase
      .from("boq_section_items")
      .select("id, section_id, item_name, description, unit_id, qty, rate")
      .in("section_id", sectionIds)
      .order("section_id")
      .order("sort_order", { ascending: true });

    if (itemsError) {
      console.error("[Estimate Generation] Error fetching items:", itemsError);
      return { success: false, error: "Failed to fetch BOQ items: " + itemsError.message };
    }

    if (!items || items.length === 0) {
      return { success: false, error: "No items found in BOQ" };
    }

    console.log("[Estimate Generation] Found", items.length, "items across", sections.length, "sections");

    const { data: units } = await supabase
      .from("master_units")
      .select("id, name")
      .in("id", items.map((i) => i.unit_id).filter(Boolean));

    const unitMap = new Map(units?.map((u) => [u.id, u.name]) || []);

    const { data: existingEstimate } = await supabase
      .from("estimate_headers")
      .select("id, version")
      .eq("project_id", projectId)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();

    const nextVersion = existingEstimate ? existingEstimate.version + 1 : 1;

    console.log("[Estimate Generation] Creating estimate version:", nextVersion);

    const { data: newEstimate, error: estimateError } = await supabase
      .from("estimate_headers")
      .insert([
        {
          project_id: projectId,
          title: `Estimate v${nextVersion} (from BOQ)`,
          status: "draft",
          version: nextVersion,
          notes: `Generated from BOQ on ${new Date().toLocaleDateString()}`,
        },
      ])
      .select()
      .single();

    if (estimateError) {
      console.error("[Estimate Generation] Error creating estimate header:", estimateError);
      return { success: false, error: "Failed to create estimate: " + estimateError.message };
    }

    console.log("[Estimate Generation] Created estimate:", newEstimate.id);

    const estimateItems = items.map((item, index) => ({
      estimate_id: newEstimate.id,
      line_no: index + 1,
      item_type: "material" as const,
      category: null,
      item: item.item_name || "Unnamed Item",
      description: item.description || null,
      unit: item.unit_id ? unitMap.get(item.unit_id) || null : null,
      qty: Number(item.qty) || 0,
      rate: Number(item.rate) || 0,
      amount: (Number(item.qty) || 0) * (Number(item.rate) || 0),
    }));

    console.log("[Estimate Generation] Inserting", estimateItems.length, "estimate items");

    const { error: itemsInsertError } = await supabase
      .from("estimate_items")
      .insert(estimateItems);

    if (itemsInsertError) {
      console.error("[Estimate Generation] Error inserting items:", itemsInsertError);
      await supabase.from("estimate_headers").delete().eq("id", newEstimate.id);
      return { success: false, error: "Failed to create estimate items: " + itemsInsertError.message };
    }

    console.log("[Estimate Generation] Successfully generated estimate");

    await logActivity(
      projectId,
      "estimate_created",
      `Generated estimate v${nextVersion} from BOQ`
    );

    return {
      success: true,
      data: newEstimate,
      itemCount: estimateItems.length,
      estimateId: newEstimate.id,
    };
  } catch (e: any) {
    console.error("[Estimate Generation] Exception:", e);
    return { success: false, error: e?.message || String(e) };
  }
}

export async function fetchEstimates(projectId: string) {
  if (!projectId) {
    return { success: false, error: "No project ID", data: [] };
  }

  try {
    const { data, error } = await supabase
      .from("estimate_headers")
      .select("*")
      .eq("project_id", projectId)
      .order("version", { ascending: false });

    if (error) {
      console.error("Error fetching estimates:", error);
      return { success: false, error, data: [] };
    }

    return { success: true, data: data || [] };
  } catch (e) {
    console.error("Exception fetching estimates:", e);
    return { success: false, error: e, data: [] };
  }
}
