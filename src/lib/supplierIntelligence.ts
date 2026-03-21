import { supabase } from "./supabase";

export interface SupplierItem {
  id: string;
  supplier_id: string;
  item_name: string;
  supplier_sku: string;
  description?: string;
  unit: string;
  current_price: number;
  currency: string;
  last_price_update: string;
  availability_status: "in_stock" | "out_of_stock" | "discontinued" | "unknown";
  lead_time_days?: number;
  minimum_order_quantity?: number;
  package_size?: string;
  manufacturer?: string;
  manufacturer_sku?: string;
  category?: string;
  supplier_url?: string;
  created_at: string;
  updated_at: string;
}

export interface ItemSupplierLink {
  id: string;
  project_item_id: string;
  supplier_item_id: string;
  is_preferred: boolean;
  notes?: string;
  created_at: string;
}

export interface PriceHistory {
  id: string;
  supplier_item_id: string;
  price: number;
  currency: string;
  recorded_at: string;
}

export async function fetchSupplierItems(supplierId: string) {
  try {
    const { data, error } = await supabase
      .from("supplier_items")
      .select("*")
      .eq("supplier_id", supplierId)
      .order("item_name", { ascending: true });

    if (error) {
      console.error("Error fetching supplier items:", error);
      return { success: false, error, data: [] };
    }

    return { success: true, data: data || [] };
  } catch (e) {
    console.error("Exception fetching supplier items:", e);
    return { success: false, error: e, data: [] };
  }
}

export async function searchSupplierItems(searchTerm: string, supplierId?: string) {
  try {
    let query = supabase
      .from("supplier_items")
      .select("*, suppliers(name)")
      .or(`item_name.ilike.%${searchTerm}%,supplier_sku.ilike.%${searchTerm}%,description.ilike.%${searchTerm}%`)
      .limit(50);

    if (supplierId) {
      query = query.eq("supplier_id", supplierId);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Error searching supplier items:", error);
      return { success: false, error, data: [] };
    }

    return { success: true, data: data || [] };
  } catch (e) {
    console.error("Exception searching supplier items:", e);
    return { success: false, error: e, data: [] };
  }
}

export async function linkItemToSupplier(
  projectItemId: string,
  supplierItemId: string,
  isPreferred: boolean = false,
  notes?: string
) {
  try {
    const { data, error } = await supabase
      .from("item_supplier_links")
      .insert({
        project_item_id: projectItemId,
        supplier_item_id: supplierItemId,
        is_preferred: isPreferred,
        notes,
      })
      .select()
      .single();

    if (error) {
      console.error("Error linking item to supplier:", error);
      return { success: false, error };
    }

    return { success: true, data };
  } catch (e) {
    console.error("Exception linking item to supplier:", e);
    return { success: false, error: e };
  }
}

export async function getItemSupplierLinks(projectItemId: string) {
  try {
    const { data, error } = await supabase
      .from("item_supplier_links")
      .select(`
        *,
        supplier_items(
          *,
          suppliers(name, contact_name, phone, email)
        )
      `)
      .eq("project_item_id", projectItemId);

    if (error) {
      console.error("Error fetching item supplier links:", error);
      return { success: false, error, data: [] };
    }

    return { success: true, data: data || [] };
  } catch (e) {
    console.error("Exception fetching item supplier links:", e);
    return { success: false, error: e, data: [] };
  }
}

export async function updateSupplierItemPrice(
  supplierItemId: string,
  newPrice: number,
  recordHistory: boolean = true
) {
  try {
    if (recordHistory) {
      const { data: currentItem } = await supabase
        .from("supplier_items")
        .select("current_price, currency")
        .eq("id", supplierItemId)
        .single();

      if (currentItem) {
        await supabase.from("supplier_item_price_history").insert({
          supplier_item_id: supplierItemId,
          price: currentItem.current_price,
          currency: currentItem.currency,
        });
      }
    }

    const { data, error } = await supabase
      .from("supplier_items")
      .update({
        current_price: newPrice,
        last_price_update: new Date().toISOString(),
      })
      .eq("id", supplierItemId)
      .select()
      .single();

    if (error) {
      console.error("Error updating supplier item price:", error);
      return { success: false, error };
    }

    return { success: true, data };
  } catch (e) {
    console.error("Exception updating supplier item price:", e);
    return { success: false, error: e };
  }
}

export async function getPriceHistory(supplierItemId: string, limit: number = 12) {
  try {
    const { data, error } = await supabase
      .from("supplier_item_price_history")
      .select("*")
      .eq("supplier_item_id", supplierItemId)
      .order("recorded_at", { ascending: false })
      .limit(limit);

    if (error) {
      console.error("Error fetching price history:", error);
      return { success: false, error, data: [] };
    }

    return { success: true, data: data || [] };
  } catch (e) {
    console.error("Exception fetching price history:", e);
    return { success: false, error: e, data: [] };
  }
}

export async function createSupplierItem(itemData: Partial<SupplierItem>) {
  try {
    const { data, error } = await supabase
      .from("supplier_items")
      .insert({
        ...itemData,
        last_price_update: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating supplier item:", error);
      return { success: false, error };
    }

    return { success: true, data };
  } catch (e) {
    console.error("Exception creating supplier item:", e);
    return { success: false, error: e };
  }
}

export async function updateSupplierItem(
  itemId: string,
  updates: Partial<SupplierItem>
) {
  try {
    const { data, error } = await supabase
      .from("supplier_items")
      .update(updates)
      .eq("id", itemId)
      .select()
      .single();

    if (error) {
      console.error("Error updating supplier item:", error);
      return { success: false, error };
    }

    return { success: true, data };
  } catch (e) {
    console.error("Exception updating supplier item:", e);
    return { success: false, error: e };
  }
}

export function calculatePriceTrend(history: PriceHistory[]): {
  trend: "up" | "down" | "stable";
  percentChange: number;
  description: string;
} {
  if (history.length < 2) {
    return {
      trend: "stable",
      percentChange: 0,
      description: "Insufficient data",
    };
  }

  const latest = history[0].price;
  const oldest = history[history.length - 1].price;
  const percentChange = ((latest - oldest) / oldest) * 100;

  let trend: "up" | "down" | "stable" = "stable";
  if (percentChange > 2) trend = "up";
  else if (percentChange < -2) trend = "down";

  let description = "";
  if (trend === "up") {
    description = `Price increased ${Math.abs(percentChange).toFixed(1)}% over time`;
  } else if (trend === "down") {
    description = `Price decreased ${Math.abs(percentChange).toFixed(1)}% over time`;
  } else {
    description = "Price stable";
  }

  return { trend, percentChange, description };
}

export async function suggestSupplierMatches(itemName: string, description?: string) {
  try {
    const searchTerms = [itemName];
    if (description) {
      const words = description.split(" ").filter((w) => w.length > 3);
      searchTerms.push(...words.slice(0, 3));
    }

    const searchPattern = searchTerms.join("|");

    const { data, error } = await supabase
      .from("supplier_items")
      .select(`
        *,
        suppliers(name, contact_name)
      `)
      .or(
        `item_name.ilike.%${itemName}%,description.ilike.%${itemName}%`
      )
      .limit(10);

    if (error) {
      console.error("Error suggesting supplier matches:", error);
      return { success: false, error, data: [] };
    }

    const scored = (data || []).map((item: any) => {
      let score = 0;
      const itemNameLower = item.item_name.toLowerCase();
      const searchLower = itemName.toLowerCase();

      if (itemNameLower === searchLower) score += 100;
      else if (itemNameLower.includes(searchLower)) score += 50;
      else if (searchLower.includes(itemNameLower)) score += 30;

      if (item.description) {
        const descLower = item.description.toLowerCase();
        if (description && descLower.includes(description.toLowerCase())) {
          score += 20;
        }
      }

      return { ...item, matchScore: score };
    });

    scored.sort((a, b) => b.matchScore - a.matchScore);

    return { success: true, data: scored.slice(0, 5) };
  } catch (e) {
    console.error("Exception suggesting supplier matches:", e);
    return { success: false, error: e, data: [] };
  }
}
