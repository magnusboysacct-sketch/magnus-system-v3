import { supabase } from "./supabase";
import { logActivity } from "./activity";

export interface ProcurementItem {
  id: string;
  project_id: string;
  source_boq_item_id: string | null;
  material_name: string;
  quantity: number;
  unit: string | null;
  category: string | null;
  notes: string | null;
  status: "pending" | "ordered" | "received";
  created_at: string;
  updated_at: string;
}

export interface ProcurementItemWithSource extends ProcurementItem {
  source_item?: string;
  source_description?: string;
}

export async function generateProcurementFromBOQ(projectId: string) {
  console.log("[Procurement Generation] Starting for project:", projectId);

  if (!projectId) {
    return { success: false, error: "No project ID provided" };
  }

  try {
    const { data: userData } = await supabase.auth.getUser();
    const currentUserId = userData.user?.id;
    console.log("[Procurement Generation] Current user:", currentUserId);

    const { data: boqHeader, error: headerError } = await supabase
      .from("boq_headers")
      .select("id, status")
      .eq("project_id", projectId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (headerError) {
      console.error("[Procurement Generation] Error fetching BOQ header:", headerError);
      return { success: false, error: "Failed to fetch BOQ: " + headerError.message };
    }

    if (!boqHeader) {
      return { success: false, error: "No BOQ found for this project" };
    }

    console.log("[Procurement Generation] Using BOQ:", boqHeader.id, "Status:", boqHeader.status);

    const { data: sections, error: sectionsError } = await supabase
      .from("boq_sections")
      .select("id, title")
      .eq("boq_id", boqHeader.id)
      .order("sort_order", { ascending: true });

    if (sectionsError) {
      console.error("[Procurement Generation] Error fetching sections:", sectionsError);
      return { success: false, error: "Failed to fetch sections: " + sectionsError.message };
    }

    if (!sections || sections.length === 0) {
      return { success: false, error: "No sections found in BOQ" };
    }

    const sectionIds = sections.map((s) => s.id);
    console.log("[Procurement Generation] Found", sections.length, "sections");

    const { data: boqItems, error: itemsError } = await supabase
      .from("boq_section_items")
      .select("id, section_id, item_name, description, unit_id, qty, pick_category")
      .in("section_id", sectionIds)
      .order("section_id")
      .order("sort_order", { ascending: true });

    if (itemsError) {
      console.error("[Procurement Generation] Error fetching BOQ items:", itemsError);
      return { success: false, error: "Failed to fetch items: " + itemsError.message };
    }

    if (!boqItems || boqItems.length === 0) {
      return { success: false, error: "No BOQ items found" };
    }

    console.log("[Procurement Generation] Found", boqItems.length, "total items");

    const { data: units } = await supabase
      .from("master_units")
      .select("id, name")
      .in("id", boqItems.map((i) => i.unit_id).filter(Boolean));

    const unitMap = new Map(units?.map((u) => [u.id, u.name]) || []);

    console.log("[Procurement Generation] Clearing old procurement items...");
    const { error: deleteError } = await supabase
      .from("procurement_items")
      .delete()
      .eq("project_id", projectId);

    if (deleteError) {
      console.error("[Procurement Generation] Error clearing old items:", deleteError);
    }

    const procurementRecords = boqItems
      .filter((item) => {
        const qty = Number(item.qty) || 0;
        return qty > 0;
      })
      .map((item) => ({
        project_id: projectId,
        source_boq_item_id: item.id,
        material_name: item.item_name || "Unnamed Item",
        quantity: Number(item.qty) || 0,
        unit: item.unit_id ? unitMap.get(item.unit_id) || null : null,
        category: item.pick_category || null,
        notes: item.description || null,
        status: "pending" as const,
      }));

    if (procurementRecords.length === 0) {
      return {
        success: false,
        error: "No BOQ items with quantities > 0 found",
      };
    }

    console.log("[Procurement Generation] Creating", procurementRecords.length, "procurement items");
    console.log("[Procurement Generation] First item sample:", procurementRecords[0]);

    const { data: inserted, error: insertError } = await supabase
      .from("procurement_items")
      .insert(procurementRecords)
      .select();

    if (insertError) {
      console.error("[Procurement Generation] Error creating procurement items:", insertError);
      return { success: false, error: "Failed to insert items: " + insertError.message };
    }

    console.log("[Procurement Generation] Successfully created", inserted?.length || 0, "items");

    await logActivity(
      projectId,
      "procurement_generated",
      `Generated ${procurementRecords.length} procurement items from BOQ`
    );

    return {
      success: true,
      data: inserted,
      count: procurementRecords.length,
    };
  } catch (e: any) {
    console.error("[Procurement Generation] Exception:", e);
    return { success: false, error: e?.message || String(e) };
  }
}

export async function fetchProcurementItems(projectId: string) {
  if (!projectId) {
    return { success: false, error: "No project ID", data: [] };
  }

  try {
    const { data, error } = await supabase
      .from("procurement_items")
      .select(
        `
        *,
        source_boq_item:boq_section_items(item_name, description)
      `
      )
      .eq("project_id", projectId)
      .order("category", { ascending: true })
      .order("material_name", { ascending: true });

    if (error) {
      console.error("Error fetching procurement items:", error);
      return { success: false, error, data: [] };
    }

    const enrichedData: ProcurementItemWithSource[] = (data || []).map(
      (item: any) => ({
        ...item,
        source_item: item.source_boq_item?.item_name || null,
        source_description: item.source_boq_item?.description || null,
      })
    );

    return { success: true, data: enrichedData };
  } catch (e) {
    console.error("Exception fetching procurement items:", e);
    return { success: false, error: e, data: [] };
  }
}

export async function updateProcurementItemStatus(
  itemId: string,
  status: "pending" | "ordered" | "received"
) {
  try {
    const { data: existingItem } = await supabase
      .from("procurement_items")
      .select("status, material_name, project_id")
      .eq("id", itemId)
      .single();

    const { data, error } = await supabase
      .from("procurement_items")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", itemId)
      .select()
      .single();

    if (error) {
      console.error("Error updating procurement item:", error);
      return { success: false, error };
    }

    if (existingItem && status === "received" && existingItem.status !== "received") {
      await logActivity(existingItem.project_id, "procurement_received", `Received: ${existingItem.material_name}`);
    }

    return { success: true, data };
  } catch (e) {
    console.error("Exception updating procurement item:", e);
    return { success: false, error: e };
  }
}

export async function deleteProcurementItem(itemId: string) {
  try {
    const { error } = await supabase
      .from("procurement_items")
      .delete()
      .eq("id", itemId);

    if (error) {
      console.error("Error deleting procurement item:", error);
      return { success: false, error };
    }

    return { success: true };
  } catch (e) {
    console.error("Exception deleting procurement item:", e);
    return { success: false, error: e };
  }
}
