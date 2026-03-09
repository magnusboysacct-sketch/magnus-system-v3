import { supabase } from "./supabase";

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
  if (!projectId) {
    return { success: false, error: "No project ID provided" };
  }

  try {
    const { data: boqHeaders, error: headerError } = await supabase
      .from("boq_headers")
      .select("id")
      .eq("project_id", projectId)
      .maybeSingle();

    if (headerError) {
      console.error("Error fetching BOQ header:", headerError);
      return { success: false, error: headerError };
    }

    if (!boqHeaders) {
      return { success: false, error: "No BOQ found for this project" };
    }

    const { data: boqItems, error: itemsError } = await supabase
      .from("boq_items")
      .select("id, item, description, unit, qty, quantity, category")
      .eq("boq_id", boqHeaders.id)
      .eq("is_section_header", false);

    if (itemsError) {
      console.error("Error fetching BOQ items:", itemsError);
      return { success: false, error: itemsError };
    }

    if (!boqItems || boqItems.length === 0) {
      return { success: false, error: "No BOQ items found" };
    }

    const { error: deleteError } = await supabase
      .from("procurement_items")
      .delete()
      .eq("project_id", projectId);

    if (deleteError) {
      console.error("Error clearing old procurement items:", deleteError);
    }

    const procurementRecords = boqItems
      .filter((item) => {
        const qty = item.quantity || item.qty || 0;
        return qty > 0;
      })
      .map((item) => ({
        project_id: projectId,
        source_boq_item_id: item.id,
        material_name: item.item || "Unnamed Item",
        quantity: item.quantity || item.qty || 0,
        unit: item.unit || null,
        category: item.category || null,
        notes: item.description || null,
        status: "pending" as const,
      }));

    if (procurementRecords.length === 0) {
      return {
        success: false,
        error: "No BOQ items with quantities > 0 found",
      };
    }

    const { data: inserted, error: insertError } = await supabase
      .from("procurement_items")
      .insert(procurementRecords)
      .select();

    if (insertError) {
      console.error("Error creating procurement items:", insertError);
      return { success: false, error: insertError };
    }

    return {
      success: true,
      data: inserted,
      count: procurementRecords.length,
    };
  } catch (e) {
    console.error("Exception generating procurement:", e);
    return { success: false, error: e };
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
        source_boq_item:boq_items(item, description)
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
        source_item: item.source_boq_item?.item || null,
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
