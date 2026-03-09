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

export interface BudgetSummary {
  material_budget: number;
  labor_budget: number;
  equipment_budget: number;
  other_budget: number;
  total_budget: number;
}

export interface BudgetVsActual {
  budget: BudgetSummary;
  actual: CostSummary;
  variance: {
    material_variance: number;
    labor_variance: number;
    equipment_variance: number;
    other_variance: number;
    total_variance: number;
  };
}

export async function createProjectCost(
  projectId: string,
  costType: CostType,
  description: string,
  amount: number,
  costDate?: string,
  sourceId?: string,
  notes?: string
) {
  try {
    const insertData: any = {
      project_id: projectId,
      cost_type: costType,
      description,
      amount,
      source_id: sourceId || null,
      notes: notes || null,
    };

    if (costDate) {
      insertData.cost_date = costDate;
    }

    const { data, error } = await supabase
      .from("project_costs")
      .insert(insertData)
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

export async function getProjectBudgetSummary(
  projectId: string
): Promise<BudgetSummary> {
  try {
    const { data: boqHeaders, error: headerError } = await supabase
      .from("boq_headers")
      .select("id")
      .eq("project_id", projectId)
      .order("updated_at", { ascending: false })
      .order("version", { ascending: false })
      .limit(1);

    if (headerError || !boqHeaders || boqHeaders.length === 0) {
      return {
        material_budget: 0,
        labor_budget: 0,
        equipment_budget: 0,
        other_budget: 0,
        total_budget: 0,
      };
    }

    const boqId = boqHeaders[0].id;

    const { data: items, error: itemsError } = await supabase
      .from("boq_items")
      .select("qty, rate, category, item")
      .eq("boq_id", boqId)
      .eq("is_section_header", false);

    if (itemsError || !items) {
      return {
        material_budget: 0,
        labor_budget: 0,
        equipment_budget: 0,
        other_budget: 0,
        total_budget: 0,
      };
    }

    const summary: BudgetSummary = {
      material_budget: 0,
      labor_budget: 0,
      equipment_budget: 0,
      other_budget: 0,
      total_budget: 0,
    };

    items.forEach((item) => {
      const qty = Number(item.qty) || 0;
      const rate = Number(item.rate) || 0;
      const amount = qty * rate;

      summary.total_budget += amount;

      const category = (item.category || "").toLowerCase();
      const itemName = (item.item || "").toLowerCase();
      const combined = `${category} ${itemName}`;

      if (
        combined.includes("labor") ||
        combined.includes("labour") ||
        combined.includes("crew") ||
        combined.includes("worker")
      ) {
        summary.labor_budget += amount;
      } else if (
        combined.includes("equipment") ||
        combined.includes("machinery") ||
        combined.includes("tool") ||
        combined.includes("crane") ||
        combined.includes("excavator")
      ) {
        summary.equipment_budget += amount;
      } else if (
        combined.includes("material") ||
        combined.includes("concrete") ||
        combined.includes("steel") ||
        combined.includes("brick") ||
        combined.includes("cement") ||
        combined.includes("sand") ||
        combined.includes("aggregate") ||
        combined.includes("timber") ||
        combined.includes("paint") ||
        combined.includes("pipe") ||
        combined.includes("cable")
      ) {
        summary.material_budget += amount;
      } else {
        summary.other_budget += amount;
      }
    });

    return summary;
  } catch (e) {
    console.error("Exception fetching budget summary:", e);
    return {
      material_budget: 0,
      labor_budget: 0,
      equipment_budget: 0,
      other_budget: 0,
      total_budget: 0,
    };
  }
}

export async function getBudgetVsActual(
  projectId: string
): Promise<BudgetVsActual> {
  const budget = await getProjectBudgetSummary(projectId);
  const actual = await getProjectCostSummary(projectId);

  return {
    budget,
    actual,
    variance: {
      material_variance: budget.material_budget - actual.material_cost,
      labor_variance: budget.labor_budget - actual.labor_cost,
      equipment_variance: budget.equipment_budget - actual.equipment_cost,
      other_variance: budget.other_budget - actual.other_cost,
      total_variance: budget.total_budget - actual.total_cost,
    },
  };
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
    undefined,
    procurementItem.id,
    `Auto-generated from procurement item`
  );
}
