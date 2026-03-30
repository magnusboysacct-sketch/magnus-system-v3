import { supabase } from "./supabase";

// BOQ Section and Item types for task linking
export interface BOQSection {
  id: string;
  boq_id: string;
  sort_order: number;
  master_category_id: string | null;
  title: string;
  scope: string | null;
}

export interface BOQItem {
  id: string;
  section_id: string;
  sort_order: number;
  pick_type: string;
  pick_category: string;
  pick_item: string;
  pick_variant: string;
  cost_item_id: string | null;
  item_name: string;
  description: string;
  unit_id: string | null;
  qty: number;
  rate: number;
}

// Fetch BOQ sections for a project
export async function fetchProjectBOQSections(projectId: string): Promise<{ success: boolean; data?: BOQSection[]; error?: string }> {
  try {
    // First get the latest approved BOQ header for the project
    const { data: header, error: headerError } = await supabase
      .from("boq_headers")
      .select("id")
      .eq("project_id", projectId)
      .eq("status", "approved")
      .order("version", { ascending: false })
      .limit(1)
      .single();

    if (headerError || !header) {
      return { success: false, error: "No approved BOQ found for this project" };
    }

    // Get sections for this BOQ
    const { data: sections, error: sectionsError } = await supabase
      .from("boq_sections")
      .select("id,boq_id,sort_order,master_category_id,title,scope")
      .eq("boq_id", header.id)
      .order("sort_order", { ascending: true });

    if (sectionsError) {
      console.error("Error fetching BOQ sections:", sectionsError);
      return { success: false, error: sectionsError.message };
    }

    return { success: true, data: sections || [] };
  } catch (e) {
    console.error("Exception fetching BOQ sections:", e);
    return { success: false, error: "Failed to fetch BOQ sections" };
  }
}

// Fetch BOQ items for a specific section
export async function fetchBOQItemsBySection(sectionId: string): Promise<{ success: boolean; data?: BOQItem[]; error?: string }> {
  try {
    const { data: items, error } = await supabase
      .from("boq_section_items")
      .select(
        "id,section_id,sort_order,pick_type,pick_category,pick_item,pick_variant,cost_item_id,item_name,description,unit_id,qty,rate"
      )
      .eq("section_id", sectionId)
      .order("sort_order", { ascending: true });

    if (error) {
      console.error("Error fetching BOQ items:", error);
      return { success: false, error: error.message };
    }

    return { success: true, data: items || [] };
  } catch (e) {
    console.error("Exception fetching BOQ items:", e);
    return { success: false, error: "Failed to fetch BOQ items" };
  }
}

// Fetch all BOQ items for a project (for dropdown population)
export async function fetchProjectBOQItems(projectId: string): Promise<{ success: boolean; data?: (BOQItem & { section_title: string })[]; error?: string }> {
  try {
    // First get sections
    const sectionsResult = await fetchProjectBOQSections(projectId);
    if (!sectionsResult.success || !sectionsResult.data) {
      return { success: false, error: sectionsResult.error };
    }

    const sections = sectionsResult.data;
    const allItems: (BOQItem & { section_title: string })[] = [];

    // Fetch items for each section
    for (const section of sections) {
      const itemsResult = await fetchBOQItemsBySection(section.id);
      if (itemsResult.success && itemsResult.data) {
        const itemsWithSection = itemsResult.data.map(item => ({
          ...item,
          section_title: section.title
        }));
        allItems.push(...itemsWithSection);
      }
    }

    return { success: true, data: allItems };
  } catch (e) {
    console.error("Exception fetching project BOQ items:", e);
    return { success: false, error: "Failed to fetch project BOQ items" };
  }
}

// Get BOQ item quantity for task sync
export async function getBOQItemQuantity(boqItemId: string): Promise<{ success: boolean; quantity?: number; unit?: string; error?: string }> {
  try {
    const { data: item, error } = await supabase
      .from("boq_section_items")
      .select("qty, unit_id")
      .eq("id", boqItemId)
      .single();

    if (error) {
      console.error("Error fetching BOQ item quantity:", error);
      return { success: false, error: error.message };
    }

    return { 
      success: true, 
      quantity: item?.qty || 0,
      unit: item?.unit_id || undefined
    };
  } catch (e) {
    console.error("Exception fetching BOQ item quantity:", e);
    return { success: false, error: "Failed to fetch BOQ item quantity" };
  }
}
