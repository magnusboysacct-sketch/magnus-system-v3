import { supabase } from "./supabase";
import { logActivity } from "./activity";

export type PurchaseOrderStatus = "draft" | "issued" | "part_delivered" | "delivered" | "cancelled";

export interface PurchaseOrder {
  id: string;
  company_id: string;
  project_id: string;
  supplier_id: string | null;
  supplier_name: string;
  po_number: string;
  title: string;
  status: PurchaseOrderStatus;
  issue_date: string | null;
  expected_date: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface PurchaseOrderItem {
  id: string;
  purchase_order_id: string;
  procurement_item_id: string | null;
  material_name: string;
  description: string | null;
  quantity: number;
  unit: string | null;
  unit_rate: number;
  total_amount: number;
  delivered_qty: number;
  created_at: string;
  updated_at: string;
}

export interface PurchaseOrderWithItems extends PurchaseOrder {
  items: PurchaseOrderItem[];
  itemCount: number;
  totalValue: number;
}

export interface CreatePurchaseOrderInput {
  project_id: string;
  supplier_id?: string | null;
  supplier_name: string;
  po_number: string;
  title: string;
  status?: PurchaseOrderStatus;
  issue_date?: string | null;
  expected_date?: string | null;
  notes?: string | null;
}

export interface CreatePurchaseOrderItemInput {
  material_name: string;
  description?: string | null;
  quantity: number;
  unit?: string | null;
  unit_rate?: number;
  procurement_item_id?: string | null;
}

export interface CreatePurchaseOrderFromProcurementInput {
  project_id: string;
  supplier_id?: string | null;
  supplier_name: string;
  po_number: string;
  title: string;
  procurement_item_ids: string[];
  issue_date?: string | null;
  expected_date?: string | null;
  notes?: string | null;
}

export async function listPurchaseOrders(projectId?: string) {
  try {
    let query = supabase
      .from("purchase_orders")
      .select(`
        *,
        items:purchase_order_items(total_amount)
      `)
      .order("updated_at", { ascending: false });

    if (projectId) {
      query = query.eq("project_id", projectId);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Error listing purchase orders:", error);
      return [];
    }

    const enriched: PurchaseOrderWithItems[] = (data || []).map((po: any) => {
      const items = Array.isArray(po.items) ? po.items : [];
      const totalValue = items.reduce((sum: number, item: any) => {
        return sum + (Number(item.total_amount) || 0);
      }, 0);

      return {
        ...po,
        items: [],
        itemCount: items.length,
        totalValue,
      };
    });

    return enriched;
  } catch (e) {
    console.error("Exception listing purchase orders:", e);
    return [];
  }
}

export async function getPurchaseOrder(id: string) {
  try {
    const { data: po, error: poError } = await supabase
      .from("purchase_orders")
      .select("*")
      .eq("id", id)
      .single();

    if (poError || !po) {
      console.error("Error fetching purchase order:", poError);
      return null;
    }

    const { data: items, error: itemsError } = await supabase
      .from("purchase_order_items")
      .select("*")
      .eq("purchase_order_id", id)
      .order("material_name", { ascending: true });

    if (itemsError) {
      console.error("Error fetching purchase order items:", itemsError);
      return null;
    }

    const totalValue = (items || []).reduce(
      (sum, item) => sum + Number(item.total_amount || 0),
      0
    );

    const result: PurchaseOrderWithItems = {
      ...po,
      items: items || [],
      itemCount: items?.length || 0,
      totalValue,
    };

    return result;
  } catch (e) {
    console.error("Exception getting purchase order:", e);
    return null;
  }
}

export async function createPurchaseOrder(input: CreatePurchaseOrderInput) {
  try {
    const { data: userProfile } = await supabase
      .from("user_profiles")
      .select("company_id")
      .eq("id", (await supabase.auth.getUser()).data.user?.id)
      .single();

    if (!userProfile?.company_id) {
      return { success: false, error: "Company not found" };
    }

    const { data, error } = await supabase
      .from("purchase_orders")
      .insert({
        company_id: userProfile.company_id,
        project_id: input.project_id,
        supplier_id: input.supplier_id || null,
        supplier_name: input.supplier_name,
        po_number: input.po_number,
        title: input.title,
        status: input.status || "draft",
        issue_date: input.issue_date || null,
        expected_date: input.expected_date || null,
        notes: input.notes || null,
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating purchase order:", error);
      return { success: false, error: error.message };
    }

    await logActivity(
      input.project_id,
      "purchase_order_created",
      `Created PO ${input.po_number}: ${input.title}`
    );

    return { success: true, data };
  } catch (e: any) {
    console.error("Exception creating purchase order:", e);
    return { success: false, error: e?.message || String(e) };
  }
}

export async function updatePurchaseOrder(
  id: string,
  updates: Partial<Omit<PurchaseOrder, "id" | "company_id" | "project_id" | "created_at" | "updated_at">>
) {
  try {
    const { data, error } = await supabase
      .from("purchase_orders")
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error("Error updating purchase order:", error);
      return { success: false, error: error.message };
    }

    return { success: true, data };
  } catch (e: any) {
    console.error("Exception updating purchase order:", e);
    return { success: false, error: e?.message || String(e) };
  }
}

export async function deletePurchaseOrder(id: string) {
  try {
    const { error } = await supabase
      .from("purchase_orders")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("Error deleting purchase order:", error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (e: any) {
    console.error("Exception deleting purchase order:", e);
    return { success: false, error: e?.message || String(e) };
  }
}

export async function createPurchaseOrderFromProcurementItems(
  input: CreatePurchaseOrderFromProcurementInput
) {
  try {
    const { data: userProfile } = await supabase
      .from("user_profiles")
      .select("company_id")
      .eq("id", (await supabase.auth.getUser()).data.user?.id)
      .single();

    if (!userProfile?.company_id) {
      return { success: false, error: "Company not found" };
    }

    if (!input.procurement_item_ids || input.procurement_item_ids.length === 0) {
      return { success: false, error: "No procurement items selected" };
    }

    const { data: procurementItems, error: fetchError } = await supabase
      .from("procurement_items")
      .select("*")
      .in("id", input.procurement_item_ids);

    if (fetchError || !procurementItems || procurementItems.length === 0) {
      console.error("Error fetching procurement items:", fetchError);
      return { success: false, error: "Failed to fetch procurement items" };
    }

    const { data: po, error: poError } = await supabase
      .from("purchase_orders")
      .insert({
        company_id: userProfile.company_id,
        project_id: input.project_id,
        supplier_id: input.supplier_id || null,
        supplier_name: input.supplier_name,
        po_number: input.po_number,
        title: input.title,
        status: "draft",
        issue_date: input.issue_date || null,
        expected_date: input.expected_date || null,
        notes: input.notes || null,
      })
      .select()
      .single();

    if (poError || !po) {
      console.error("Error creating purchase order:", poError);
      return { success: false, error: "Failed to create purchase order" };
    }

    const poItems = procurementItems.map((item) => {
      const quantity = Number(item.quantity) || 0;
      const unitRate = Number(item.unit_rate) || 0;
      const totalAmount = quantity * unitRate;

      return {
        purchase_order_id: po.id,
        procurement_item_id: item.id,
        material_name: item.material_name,
        description: item.description || null,
        quantity,
        unit: item.unit || null,
        unit_rate: unitRate,
        total_amount: totalAmount,
      };
    });

    const { data: insertedItems, error: itemsError } = await supabase
      .from("purchase_order_items")
      .insert(poItems)
      .select();

    if (itemsError) {
      console.error("Error creating purchase order items:", itemsError);
      await supabase.from("purchase_orders").delete().eq("id", po.id);
      return { success: false, error: "Failed to create purchase order items" };
    }

    await logActivity(
      input.project_id,
      "purchase_order_created",
      `Created PO ${input.po_number} with ${insertedItems?.length || 0} items from procurement`
    );

    const totalValue = poItems.reduce((sum, item) => sum + item.total_amount, 0);

    const result: PurchaseOrderWithItems = {
      ...po,
      items: insertedItems || [],
      itemCount: insertedItems?.length || 0,
      totalValue,
    };

    return { success: true, data: result };
  } catch (e: any) {
    console.error("Exception creating PO from procurement:", e);
    return { success: false, error: e?.message || String(e) };
  }
}

export async function addPurchaseOrderItem(
  purchaseOrderId: string,
  item: CreatePurchaseOrderItemInput
) {
  try {
    const quantity = Number(item.quantity) || 0;
    const unitRate = Number(item.unit_rate) || 0;
    const totalAmount = quantity * unitRate;

    const { data, error } = await supabase
      .from("purchase_order_items")
      .insert({
        purchase_order_id: purchaseOrderId,
        procurement_item_id: item.procurement_item_id || null,
        material_name: item.material_name,
        description: item.description || null,
        quantity,
        unit: item.unit || null,
        unit_rate: unitRate,
        total_amount: totalAmount,
      })
      .select()
      .single();

    if (error) {
      console.error("Error adding purchase order item:", error);
      return { success: false, error: error.message };
    }

    return { success: true, data };
  } catch (e: any) {
    console.error("Exception adding purchase order item:", e);
    return { success: false, error: e?.message || String(e) };
  }
}

export async function updatePurchaseOrderItem(
  id: string,
  updates: Partial<Omit<PurchaseOrderItem, "id" | "purchase_order_id" | "created_at" | "updated_at">>
) {
  try {
    if (updates.quantity !== undefined || updates.unit_rate !== undefined) {
      const { data: currentItem } = await supabase
        .from("purchase_order_items")
        .select("quantity, unit_rate")
        .eq("id", id)
        .single();

      const quantity = updates.quantity !== undefined
        ? Number(updates.quantity)
        : Number(currentItem?.quantity || 0);

      const unitRate = updates.unit_rate !== undefined
        ? Number(updates.unit_rate)
        : Number(currentItem?.unit_rate || 0);

      updates.total_amount = quantity * unitRate;
    }

    const { data, error } = await supabase
      .from("purchase_order_items")
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error("Error updating purchase order item:", error);
      return { success: false, error: error.message };
    }

    return { success: true, data };
  } catch (e: any) {
    console.error("Exception updating purchase order item:", e);
    return { success: false, error: e?.message || String(e) };
  }
}

export async function deletePurchaseOrderItem(id: string) {
  try {
    const { error } = await supabase
      .from("purchase_order_items")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("Error deleting purchase order item:", error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (e: any) {
    console.error("Exception deleting purchase order item:", e);
    return { success: false, error: e?.message || String(e) };
  }
}

export async function generatePONumber(companyId: string, year?: number): Promise<string> {
  const currentYear = year || new Date().getFullYear();
  const prefix = `PO-${currentYear}-`;

  const { data, error } = await supabase
    .from("purchase_orders")
    .select("po_number")
    .eq("company_id", companyId)
    .like("po_number", `${prefix}%`)
    .order("po_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error && error.code !== "PGRST116") {
    console.error("Error generating PO number:", error);
    return `${prefix}001`;
  }

  if (!data) {
    return `${prefix}001`;
  }

  const lastNumber = data.po_number.replace(prefix, "");
  const nextNumber = parseInt(lastNumber, 10) + 1;
  const paddedNumber = String(nextNumber).padStart(3, "0");

  return `${prefix}${paddedNumber}`;
}

export async function receiveItems(
  poId: string,
  itemDeliveries: { itemId: string; deliveredQty: number }[]
) {
  try {
    const { data: po } = await supabase
      .from("purchase_orders")
      .select("project_id")
      .eq("id", poId)
      .single();

    if (!po?.project_id) {
      console.error("PO not found or missing project_id");
      return { success: false, error: "PO not found" };
    }

    for (const delivery of itemDeliveries) {
      const { itemId, deliveredQty } = delivery;

      const { data: currentItem, error: fetchError } = await supabase
        .from("purchase_order_items")
        .select("quantity, delivered_qty, procurement_item_id, material_name, unit, unit_rate")
        .eq("id", itemId)
        .single();

      if (fetchError || !currentItem) {
        console.error("Error fetching PO item:", fetchError);
        continue;
      }

      const newDeliveredQty = Number(deliveredQty);
      if (newDeliveredQty < 0 || newDeliveredQty > Number(currentItem.quantity)) {
        console.error("Invalid delivered quantity for item:", itemId);
        continue;
      }

      const previousDeliveredQty = Number(currentItem.delivered_qty) || 0;
      const incrementalDelivery = newDeliveredQty - previousDeliveredQty;

      const { error: updateError } = await supabase
        .from("purchase_order_items")
        .update({
          delivered_qty: newDeliveredQty,
          updated_at: new Date().toISOString(),
        })
        .eq("id", itemId);

      if (updateError) {
        console.error("Error updating PO item delivered_qty:", updateError);
        continue;
      }

      if (currentItem.procurement_item_id) {
        const { error: procError } = await supabase
          .from("procurement_items")
          .update({
            delivered_qty: newDeliveredQty,
            updated_at: new Date().toISOString(),
          })
          .eq("id", currentItem.procurement_item_id);

        if (procError) {
          console.error("Error syncing delivered_qty to procurement_items:", procError);
        }
      }

      if (incrementalDelivery > 0) {
        const unitRate = Number(currentItem.unit_rate) || 0;
        const costAmount = incrementalDelivery * unitRate;
        const description = `${currentItem.material_name} - ${incrementalDelivery} ${currentItem.unit || "units"} received`;

        const { error: costError } = await supabase
          .from("project_costs")
          .insert({
            project_id: po.project_id,
            cost_type: "material",
            source_id: itemId,
            source_type: "po_item",
            description,
            amount: costAmount,
            cost_date: new Date().toISOString().split("T")[0],
            notes: `Auto-created from PO item delivery`,
          });

        if (costError) {
          console.error("Error creating project_cost from delivery:", costError);
        }
      }
    }

    const { data: allItems } = await supabase
      .from("purchase_order_items")
      .select("quantity, delivered_qty")
      .eq("purchase_order_id", poId);

    if (allItems && allItems.length > 0) {
      let newStatus: PurchaseOrderStatus = "issued";

      const allFullyDelivered = allItems.every(
        (item) => Number(item.delivered_qty) === Number(item.quantity)
      );
      const anyPartiallyDelivered = allItems.some(
        (item) => Number(item.delivered_qty) > 0 && Number(item.delivered_qty) < Number(item.quantity)
      );
      const anyDelivered = allItems.some((item) => Number(item.delivered_qty) > 0);

      if (allFullyDelivered) {
        newStatus = "delivered";
      } else if (anyPartiallyDelivered || anyDelivered) {
        newStatus = "part_delivered";
      }

      await supabase
        .from("purchase_orders")
        .update({
          status: newStatus,
          updated_at: new Date().toISOString(),
        })
        .eq("id", poId);
    }

    return { success: true };
  } catch (e: any) {
    console.error("Exception receiving items:", e);
    return { success: false, error: e?.message || String(e) };
  }
}
