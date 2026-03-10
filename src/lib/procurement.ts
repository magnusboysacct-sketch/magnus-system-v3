import { supabase } from "./supabase";
import { logActivity } from "./activity";

export interface ProcurementHeader {
  id: string;
  project_id: string;
  boq_id: string | null;
  title: string;
  status: "draft" | "approved" | "sent" | "completed" | "cancelled";
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProcurementItem {
  id: string;
  procurement_id: string;
  project_id: string;
  source_boq_item_id: string | null;
  material_name: string;
  description: string | null;
  quantity: number;
  unit: string | null;
  category: string | null;
  notes: string | null;
  status: "pending" | "requested" | "quoted" | "approved" | "ordered" | "part_delivered" | "received" | "cancelled";
  supplier: string | null;
  priority: "low" | "normal" | "high" | "urgent";
  request_date: string | null;
  needed_by_date: string | null;
  ordered_qty: number;
  delivered_qty: number;
  unit_rate: number;
  created_at: string;
  updated_at: string;
}

export interface ProcurementItemWithSource extends ProcurementItem {
  source_item?: string;
  source_description?: string;
}

export interface ProcurementHeaderWithItems extends ProcurementHeader {
  items: ProcurementItemWithSource[];
  itemCount: number;
}

export async function generateProcurementFromBOQ(projectId: string) {
  console.log("=".repeat(80));
  console.log("[Procurement Generation] STARTING");
  console.log("[Procurement Generation] Project ID:", projectId);
  console.log("=".repeat(80));

  if (!projectId) {
    console.error("[Procurement Generation] VALIDATION FAILED: No project ID provided");
    return { success: false, error: "No project ID provided" };
  }

  try {
    const { data: userData } = await supabase.auth.getUser();
    const currentUserId = userData.user?.id;
    console.log("[Procurement Generation] Current user ID:", currentUserId);

    // Step 1: Fetch BOQ header
    console.log("\n[Procurement Generation] Step 1: Fetching BOQ header...");
    const { data: boqHeader, error: headerError } = await supabase
      .from("boq_headers")
      .select("id, status, version")
      .eq("project_id", projectId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (headerError) {
      console.error("[Procurement Generation] ERROR fetching BOQ header:", headerError);
      return { success: false, error: "Failed to fetch BOQ: " + headerError.message };
    }

    if (!boqHeader) {
      console.error("[Procurement Generation] ERROR: No BOQ found for this project");
      return { success: false, error: "No BOQ found for this project. Please create and save a BOQ first." };
    }

    console.log("[Procurement Generation] ✓ BOQ found:", boqHeader.id);
    console.log("[Procurement Generation]   Status:", boqHeader.status);
    console.log("[Procurement Generation]   Version:", boqHeader.version);

    // Step 2: Fetch BOQ sections
    console.log("\n[Procurement Generation] Step 2: Fetching BOQ sections...");
    const { data: sections, error: sectionsError } = await supabase
      .from("boq_sections")
      .select("id, title")
      .eq("boq_id", boqHeader.id)
      .order("sort_order", { ascending: true });

    if (sectionsError) {
      console.error("[Procurement Generation] ERROR fetching sections:", sectionsError);
      return { success: false, error: "Failed to fetch sections: " + sectionsError.message };
    }

    if (!sections || sections.length === 0) {
      console.error("[Procurement Generation] ERROR: No sections found in BOQ");
      return { success: false, error: "No sections found in BOQ. Please add sections and save the BOQ first." };
    }

    const sectionIds = sections.map((s) => s.id);
    console.log("[Procurement Generation] ✓ Found", sections.length, "sections");

    // Step 3: Fetch BOQ items
    console.log("\n[Procurement Generation] Step 3: Fetching BOQ items...");
    const { data: boqItems, error: itemsError } = await supabase
      .from("boq_section_items")
      .select("id, section_id, item_name, description, unit_id, qty, pick_category, rate")
      .in("section_id", sectionIds)
      .order("section_id")
      .order("sort_order", { ascending: true });

    if (itemsError) {
      console.error("[Procurement Generation] ERROR fetching BOQ items:", itemsError);
      return { success: false, error: "Failed to fetch items: " + itemsError.message };
    }

    if (!boqItems || boqItems.length === 0) {
      console.error("[Procurement Generation] ERROR: No BOQ items found");
      return { success: false, error: "No BOQ items found. Please save the BOQ before generating procurement." };
    }

    console.log("[Procurement Generation] ✓ Found", boqItems.length, "BOQ items");

    // Step 4: Load unit mappings
    console.log("\n[Procurement Generation] Step 4: Loading unit mappings...");
    const { data: units } = await supabase
      .from("master_units")
      .select("id, name")
      .in("id", boqItems.map((i) => i.unit_id).filter(Boolean));

    const unitMap = new Map(units?.map((u) => [u.id, u.name]) || []);
    console.log("[Procurement Generation] ✓ Loaded", unitMap.size, "unit mappings");

    // Step 5: Check if procurement document already exists for this BOQ
    console.log("\n[Procurement Generation] Step 5: Checking for existing procurement document...");
    const { data: existingHeader, error: checkHeaderError } = await supabase
      .from("procurement_headers")
      .select("id")
      .eq("project_id", projectId)
      .eq("boq_id", boqHeader.id)
      .maybeSingle();

    if (checkHeaderError) {
      console.error("[Procurement Generation] ERROR checking headers:", checkHeaderError);
      return { success: false, error: "Failed to check existing documents: " + checkHeaderError.message };
    }

    let procurementHeaderId: string;

    if (existingHeader) {
      console.log("[Procurement Generation] ✓ Found existing document:", existingHeader.id);
      console.log("[Procurement Generation]   Will replace items in this document");
      procurementHeaderId = existingHeader.id;

      // Delete existing items for this procurement document
      const { error: deleteError } = await supabase
        .from("procurement_items")
        .delete()
        .eq("procurement_id", procurementHeaderId);

      if (deleteError) {
        console.error("[Procurement Generation] ERROR clearing old items:", deleteError);
      } else {
        console.log("[Procurement Generation] ✓ Cleared old items");
      }

      // Update the header's updated_at timestamp
      await supabase
        .from("procurement_headers")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", procurementHeaderId);

    } else {
      console.log("[Procurement Generation] No existing document - creating new one");

      // Create new procurement header
      const { data: newHeader, error: createHeaderError } = await supabase
        .from("procurement_headers")
        .insert({
          project_id: projectId,
          boq_id: boqHeader.id,
          title: `BOQ Materials List v${boqHeader.version}`,
          status: "draft",
          notes: `Generated from BOQ version ${boqHeader.version}`,
        })
        .select("id")
        .single();

      if (createHeaderError || !newHeader) {
        console.error("[Procurement Generation] ERROR creating header:", createHeaderError);
        return { success: false, error: "Failed to create procurement document: " + createHeaderError?.message };
      }

      procurementHeaderId = newHeader.id;
      console.log("[Procurement Generation] ✓ Created new document:", procurementHeaderId);
    }

    // Step 6: Transform BOQ items to procurement records
    console.log("\n[Procurement Generation] Step 6: Transforming BOQ items...");
    const procurementRecords = boqItems
      .filter((item) => {
        const qty = Number(item.qty) || 0;
        return qty > 0;
      })
      .map((item) => ({
        procurement_id: procurementHeaderId,
        project_id: projectId,
        source_boq_item_id: item.id,
        material_name: item.item_name || "Unnamed Item",
        description: item.description || null,
        quantity: Number(item.qty) || 0,
        unit: item.unit_id ? unitMap.get(item.unit_id) || null : null,
        category: item.pick_category || null,
        notes: null,
        status: "pending" as const,
        supplier: null,
        priority: "normal" as const,
        request_date: null,
        needed_by_date: null,
        ordered_qty: 0,
        delivered_qty: 0,
        unit_rate: Number(item.rate) || 0,
      }));

    console.log("[Procurement Generation] ✓ Filtered to", procurementRecords.length, "items with qty > 0");

    if (procurementRecords.length === 0) {
      return {
        success: false,
        error: "No BOQ items with quantities > 0 found",
      };
    }

    // Step 7: Insert procurement items
    console.log("\n[Procurement Generation] Step 7: Inserting procurement items...");
    const { data: inserted, error: insertError } = await supabase
      .from("procurement_items")
      .insert(procurementRecords)
      .select();

    if (insertError) {
      console.error("[Procurement Generation] ✗✗✗ INSERT FAILED ✗✗✗");
      console.error("[Procurement Generation] Error:", insertError);
      return { success: false, error: "Failed to insert items: " + insertError.message };
    }

    console.log("\n" + "=".repeat(80));
    console.log("[Procurement Generation] ✓✓✓ SUCCESS ✓✓✓");
    console.log("=".repeat(80));
    console.log("[Procurement Generation] Created", inserted?.length || 0, "procurement items");
    console.log("[Procurement Generation] Procurement Document ID:", procurementHeaderId);
    console.log("=".repeat(80));

    await logActivity(
      projectId,
      "procurement_generated",
      `Generated ${procurementRecords.length} procurement items from BOQ`
    );

    return {
      success: true,
      data: inserted,
      count: procurementRecords.length,
      procurementId: procurementHeaderId,
    };
  } catch (e: any) {
    console.error("[Procurement Generation] ✗✗✗ EXCEPTION ✗✗✗");
    console.error("[Procurement Generation] Exception:", e);
    return { success: false, error: e?.message || String(e) };
  }
}

export async function fetchProcurementHeaders(projectId: string) {
  if (!projectId) {
    return { success: false, error: "No project ID", data: [] };
  }

  try {
    const { data, error } = await supabase
      .from("procurement_headers")
      .select(
        `
        *,
        items:procurement_items(count)
      `
      )
      .eq("project_id", projectId)
      .order("updated_at", { ascending: false });

    if (error) {
      console.error("Error fetching procurement headers:", error);
      return { success: false, error, data: [] };
    }

    const enrichedData: ProcurementHeaderWithItems[] = (data || []).map(
      (header: any) => ({
        ...header,
        items: [],
        itemCount: Array.isArray(header.items) ? header.items[0]?.count || 0 : 0,
      })
    );

    return { success: true, data: enrichedData };
  } catch (e) {
    console.error("Exception fetching procurement headers:", e);
    return { success: false, error: e, data: [] };
  }
}

export async function fetchProcurementDocument(procurementId: string) {
  if (!procurementId) {
    return { success: false, error: "No procurement ID", data: null };
  }

  try {
    // Fetch header
    const { data: header, error: headerError } = await supabase
      .from("procurement_headers")
      .select("*")
      .eq("id", procurementId)
      .single();

    if (headerError || !header) {
      console.error("Error fetching procurement header:", headerError);
      return { success: false, error: headerError, data: null };
    }

    // Fetch items with source BOQ item data
    const { data: items, error: itemsError } = await supabase
      .from("procurement_items")
      .select(
        `
        *,
        source_boq_item:boq_section_items(item_name, description)
      `
      )
      .eq("procurement_id", procurementId)
      .order("category", { ascending: true })
      .order("material_name", { ascending: true });

    if (itemsError) {
      console.error("Error fetching procurement items:", itemsError);
      return { success: false, error: itemsError, data: null };
    }

    const enrichedItems: ProcurementItemWithSource[] = (items || []).map(
      (item: any) => ({
        ...item,
        source_item: item.source_boq_item?.item_name || null,
        source_description: item.source_boq_item?.description || null,
      })
    );

    const document: ProcurementHeaderWithItems = {
      ...header,
      items: enrichedItems,
      itemCount: enrichedItems.length,
    };

    return { success: true, data: document };
  } catch (e) {
    console.error("Exception fetching procurement document:", e);
    return { success: false, error: e, data: null };
  }
}

export async function updateProcurementHeader(
  procurementId: string,
  updates: Partial<Pick<ProcurementHeader, "title" | "status" | "notes">>
) {
  try {
    const { data, error } = await supabase
      .from("procurement_headers")
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq("id", procurementId)
      .select()
      .single();

    if (error) {
      console.error("Error updating procurement header:", error);
      return { success: false, error };
    }

    return { success: true, data };
  } catch (e) {
    console.error("Exception updating procurement header:", e);
    return { success: false, error: e };
  }
}

export async function updateProcurementItemStatus(
  itemId: string,
  status: "pending" | "requested" | "quoted" | "approved" | "ordered" | "part_delivered" | "received" | "cancelled"
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

export async function deleteProcurementHeader(procurementId: string) {
  try {
    // Items will be cascade deleted by FK constraint
    const { error } = await supabase
      .from("procurement_headers")
      .delete()
      .eq("id", procurementId);

    if (error) {
      console.error("Error deleting procurement header:", error);
      return { success: false, error };
    }

    return { success: true };
  } catch (e) {
    console.error("Exception deleting procurement header:", e);
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
