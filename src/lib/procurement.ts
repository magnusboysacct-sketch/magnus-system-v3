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
      .select("id, status")
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
    console.log("[Procurement Generation]   Section IDs:", sectionIds);

    // Step 3: Fetch BOQ items from boq_section_items
    console.log("\n[Procurement Generation] Step 3: Fetching BOQ items from boq_section_items table...");
    const { data: boqItems, error: itemsError } = await supabase
      .from("boq_section_items")
      .select("id, section_id, item_name, description, unit_id, qty, pick_category")
      .in("section_id", sectionIds)
      .order("section_id")
      .order("sort_order", { ascending: true });

    if (itemsError) {
      console.error("[Procurement Generation] ERROR fetching BOQ items:", itemsError);
      return { success: false, error: "Failed to fetch items: " + itemsError.message };
    }

    if (!boqItems || boqItems.length === 0) {
      console.error("[Procurement Generation] ERROR: No BOQ items found in database");
      return { success: false, error: "No BOQ items found. Please save the BOQ before generating procurement." };
    }

    console.log("[Procurement Generation] ✓ Found", boqItems.length, "BOQ items in database");
    console.log("[Procurement Generation]   Sample item IDs:", boqItems.slice(0, 3).map(i => i.id));
    console.log("[Procurement Generation]   First item:", JSON.stringify(boqItems[0], null, 2));

    // Validate that all items have valid database IDs
    const invalidItems = boqItems.filter(item => !item.id || item.id.startsWith('id_'));
    if (invalidItems.length > 0) {
      console.error("[Procurement Generation] ERROR: Found items with temporary IDs");
      console.error("[Procurement Generation]   Invalid items:", invalidItems);
      return {
        success: false,
        error: "BOQ contains unsaved items with temporary IDs. Please save the BOQ before generating procurement."
      };
    }
    console.log("[Procurement Generation] ✓ All items have valid database UUIDs");

    // Step 4: Load unit mappings
    console.log("\n[Procurement Generation] Step 4: Loading unit mappings...");
    const { data: units } = await supabase
      .from("master_units")
      .select("id, name")
      .in("id", boqItems.map((i) => i.unit_id).filter(Boolean));

    const unitMap = new Map(units?.map((u) => [u.id, u.name]) || []);
    console.log("[Procurement Generation] ✓ Loaded", unitMap.size, "unit mappings");

    // Step 5: Clear old procurement items
    console.log("\n[Procurement Generation] Step 5: Clearing old procurement items...");
    console.log("[Procurement Generation]   Target table: procurement_items");
    console.log("[Procurement Generation]   Project ID:", projectId);
    const { data: deleted, error: deleteError } = await supabase
      .from("procurement_items")
      .delete()
      .eq("project_id", projectId)
      .select();

    if (deleteError) {
      console.error("[Procurement Generation] ERROR clearing old items:", deleteError);
    } else {
      console.log("[Procurement Generation] ✓ Deleted", deleted?.length || 0, "old items");
    }

    // Step 6: Transform BOQ items to procurement records
    console.log("\n[Procurement Generation] Step 6: Transforming BOQ items to procurement records...");
    const procurementRecords = boqItems
      .filter((item) => {
        const qty = Number(item.qty) || 0;
        const include = qty > 0;
        if (!include) {
          console.log("[Procurement Generation]   Skipping (qty=0):", item.item_name);
        }
        return include;
      })
      .map((item) => {
        const record = {
          project_id: projectId,
          source_boq_item_id: item.id,
          material_name: item.item_name || "Unnamed Item",
          quantity: Number(item.qty) || 0,
          unit: item.unit_id ? unitMap.get(item.unit_id) || null : null,
          category: item.pick_category || null,
          notes: item.description || null,
          status: "pending" as const,
        };
        console.log("[Procurement Generation]   Mapping:", {
          boq_item_id: item.id,
          name: item.item_name,
          qty: item.qty,
          source_boq_item_id: record.source_boq_item_id
        });
        return record;
      });

    console.log("[Procurement Generation] ✓ Filtered to", procurementRecords.length, "items with qty > 0");

    if (procurementRecords.length === 0) {
      console.error("[Procurement Generation] ERROR: No items remaining after filtering");
      return {
        success: false,
        error: "No BOQ items with quantities > 0 found",
      };
    }

    console.log("\n[Procurement Generation] Procurement records to insert:");
    procurementRecords.slice(0, 3).forEach((rec, idx) => {
      console.log(`[Procurement Generation]   Record ${idx + 1}:`, JSON.stringify(rec, null, 2));
    });

    // Step 7: Insert procurement items
    console.log("\n[Procurement Generation] Step 7: Inserting into procurement_items...");
    console.log("[Procurement Generation]   Inserting", procurementRecords.length, "records");
    console.log("[Procurement Generation]   Validating all source_boq_item_id values are valid UUIDs:");
    procurementRecords.forEach((rec, idx) => {
      const isValidUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rec.source_boq_item_id || '');
      console.log(`[Procurement Generation]     ${idx + 1}. ${rec.material_name}: ${rec.source_boq_item_id} ${isValidUUID ? '✓' : '✗ INVALID'}`);
    });

    const { data: inserted, error: insertError } = await supabase
      .from("procurement_items")
      .insert(procurementRecords)
      .select();

    if (insertError) {
      console.error("\n" + "=".repeat(80));
      console.error("[Procurement Generation] ✗✗✗ INSERT FAILED ✗✗✗");
      console.error("=".repeat(80));
      console.error("[Procurement Generation] Error code:", insertError.code);
      console.error("[Procurement Generation] Error message:", insertError.message);
      console.error("[Procurement Generation] Error details:", insertError.details);
      console.error("[Procurement Generation] Error hint:", insertError.hint);
      console.error("[Procurement Generation] Full error:", JSON.stringify(insertError, null, 2));
      console.error("=".repeat(80));
      return { success: false, error: "Failed to insert items: " + insertError.message };
    }

    console.log("\n" + "=".repeat(80));
    console.log("[Procurement Generation] ✓✓✓ SUCCESS ✓✓✓");
    console.log("=".repeat(80));
    console.log("[Procurement Generation] Successfully created", inserted?.length || 0, "procurement items");
    console.log("[Procurement Generation] Inserted records (first 2):");
    inserted?.slice(0, 2).forEach((item, idx) => {
      console.log(`[Procurement Generation]   ${idx + 1}. ID: ${item.id}`);
      console.log(`[Procurement Generation]      Material: ${item.material_name}`);
      console.log(`[Procurement Generation]      Source BOQ Item ID: ${item.source_boq_item_id}`);
      console.log(`[Procurement Generation]      Quantity: ${item.quantity} ${item.unit || ''}`);
    });
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
    };
  } catch (e: any) {
    console.error("\n" + "=".repeat(80));
    console.error("[Procurement Generation] ✗✗✗ EXCEPTION ✗✗✗");
    console.error("=".repeat(80));
    console.error("[Procurement Generation] Exception:", e);
    console.error("[Procurement Generation] Stack:", e?.stack);
    console.error("=".repeat(80));
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
