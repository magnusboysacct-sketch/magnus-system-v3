import { supabase } from "./supabase";

export type CostType = "material" | "labor" | "equipment" | "other";

export interface ProjectCost {
  id: string;
  project_id: string;
  cost_type: CostType;
  source_id: string | null;
  description: string;
  amount: number;
  cost_date: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface CostSummary {
  material_cost: number;
  labor_cost: number;
  equipment_cost: number;
  other_cost: number;
  total_cost: number;
}

export async function createProjectCost(
  projectId: string,
  costType: CostType,
  description: string,
  amount: number,
  sourceId?: string,
  notes?: string
) {
  try {
    const { data, error } = await supabase
      .from("project_costs")
      .insert({
        project_id: projectId,
        cost_type: costType,
        description,
        amount,
        source_id: sourceId || null,
        notes: notes || null,
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating project cost:", error);
      return { success: false, error };
    }

    return { success: true, data };
  } catch (e) {
    console.error("Exception creating project cost:", e);
    return { success: false, error: e };
  }
}

export async function getProjectCostSummary(
  projectId: string
): Promise<CostSummary> {
  try {
    const { data, error } = await supabase
      .from("project_costs")
      .select("cost_type, amount")
      .eq("project_id", projectId);

    if (error) {
      console.error("Error fetching project costs:", error);
      return {
        material_cost: 0,
        labor_cost: 0,
        equipment_cost: 0,
        other_cost: 0,
        total_cost: 0,
      };
    }

    const summary: CostSummary = {
      material_cost: 0,
      labor_cost: 0,
      equipment_cost: 0,
      other_cost: 0,
      total_cost: 0,
    };

    data?.forEach((cost) => {
      const amount = Number(cost.amount) || 0;
      summary.total_cost += amount;

      switch (cost.cost_type) {
        case "material":
          summary.material_cost += amount;
          break;
        case "labor":
          summary.labor_cost += amount;
          break;
        case "equipment":
          summary.equipment_cost += amount;
          break;
        case "other":
          summary.other_cost += amount;
          break;
      }
    });

    return summary;
  } catch (e) {
    console.error("Exception fetching cost summary:", e);
    return {
      material_cost: 0,
      labor_cost: 0,
      equipment_cost: 0,
      other_cost: 0,
      total_cost: 0,
    };
  }
}

export async function fetchProjectCosts(projectId: string) {
  try {
    const { data, error } = await supabase
      .from("project_costs")
      .select("*")
      .eq("project_id", projectId)
      .order("cost_date", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching project costs:", error);
      return { success: false, error, data: [] };
    }

    return { success: true, data: data || [] };
  } catch (e) {
    console.error("Exception fetching project costs:", e);
    return { success: false, error: e, data: [] };
  }
}

export async function deleteProjectCost(costId: string) {
  try {
    const { error } = await supabase
      .from("project_costs")
      .delete()
      .eq("id", costId);

    if (error) {
      console.error("Error deleting project cost:", error);
      return { success: false, error };
    }

    return { success: true };
  } catch (e) {
    console.error("Exception deleting project cost:", e);
    return { success: false, error: e };
  }
}

export async function createCostFromProcurement(
  procurementItem: {
    id: string;
    project_id: string;
    material_name: string;
    quantity: number;
    unit: string | null;
  },
  unitCost: number
) {
  const totalAmount = Number(procurementItem.quantity) * unitCost;
  const description = `${procurementItem.material_name} - ${procurementItem.quantity} ${procurementItem.unit || "units"}`;

  return createProjectCost(
    procurementItem.project_id,
    "material",
    description,
    totalAmount,
    procurementItem.id,
    `Auto-generated from procurement item`
  );
}
