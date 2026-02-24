import { supabase } from "./supabase";

export type MasterCategory = { 
  id: string; 
  name: string; 
  is_active: boolean; 
  sort_order: number | null; 
};

export type MasterUnit = { 
  id: string; 
  name: string; 
  unit_type: string | null; 
  is_active: boolean; 
  sort_order: number | null; 
};

export async function fetchActiveMasterCategories() {
  const { data, error } = await supabase
    .from("master_categories")
    .select("id, name, scope_of_work")
    .eq("is_active", true)
    .order("name", { ascending: true });

  if (error) {
    console.error("Failed to fetch master categories:", error);
    return [];
  }

  return data ?? [];
}

export async function fetchActiveMasterUnits(): Promise<MasterUnit[]> {
  try {
    const { data, error } = await supabase
      .from("master_units")
      .select("*")
      .eq("is_active", true)
      .order("sort_order", { ascending: true, nullsFirst: false })
      .order("name", { ascending: true });

    if (error) {
      throw new Error(`Failed to fetch master units: ${error.message}`);
    }

    return data || [];
  } catch (err) {
    throw new Error(`Failed to fetch master units: ${err instanceof Error ? err.message : 'Unknown error'}`);
  }
}
