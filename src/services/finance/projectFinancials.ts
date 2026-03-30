import { supabase } from "../../lib/supabase";

// =====================================================
// PROJECT FINANCIALS TYPES
// =====================================================

export type BudgetCategory = "material" | "labor" | "equipment" | "subcontractor" | "overhead" | "contingency" | "other";
export type CostType = "material" | "labor" | "equipment" | "subcontractor" | "overhead" | "other";
export type CommitmentType = "purchase_order" | "contract" | "subcontractor" | "labor_agreement" | "material_order" | "equipment_rental" | "other";

export type CostSourceType = "manual" | "expense" | "supplier_invoice" | "payroll" | "time_entry" | "procurement" | "adjustment";
export type CommitmentSourceType = "purchase_order" | "client_contract" | "supplier_contract" | "subcontractor_agreement" | "labor_contract" | "equipment_rental_agreement" | "other_agreement";

export interface ProjectBudget {
  id: string;
  project_id: string;
  company_id: string;
  category: BudgetCategory;
  budget_amount: number;
  spent_amount: number;
  remaining_amount: number;
  description?: string;
  budget_period?: "total" | "monthly" | "quarterly" | "annual";
  start_date?: string;
  end_date?: string;
  is_active: boolean;
  is_locked: boolean;
  created_at: string;
  updated_at: string;
  created_by?: string;
}

export interface ProjectCost {
  id: string;
  project_id: string;
  company_id: string;
  cost_type: CostType;
  amount: number;
  quantity: number;
  unit_price: number;
  source_type?: CostSourceType;
  source_id?: string;
  description?: string;
  cost_date: string;
  invoice_number?: string;
  vendor_name?: string;
  task_id?: string;
  boq_item_id?: string;
  status: "pending" | "approved" | "paid" | "disputed";
  approved_by?: string;
  approved_at?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
  created_by?: string;
}

export interface ProjectCommitment {
  id: string;
  project_id: string;
  company_id: string;
  commitment_type: CommitmentType;
  committed_amount: number;
  invoiced_amount: number;
  paid_amount: number;
  remaining_commitment: number;
  remaining_payment: number;
  source_id: string;
  source_type: CommitmentSourceType;
  description?: string;
  vendor_name?: string;
  commitment_date: string;
  expected_delivery_date?: string;
  actual_delivery_date?: string;
  status: "active" | "completed" | "cancelled" | "disputed";
  notes?: string;
  terms_conditions?: string;
  created_at: string;
  updated_at: string;
  created_by?: string;
}

export interface ProjectFinancialSummary {
  budget: number;
  actual: number;
  committed: number;
  remaining: number;
}

export interface DetailedProjectFinancialSummary {
  project_id: string;
  project_name?: string;
  company_id: string;
  
  // Budget breakdown
  total_budget: number;
  material_budget: number;
  labor_budget: number;
  equipment_budget: number;
  other_budget: number;
  
  // Cost breakdown
  total_cost: number;
  material_cost: number;
  labor_cost: number;
  equipment_cost: number;
  other_cost: number;
  
  // Commitment breakdown
  total_committed: number;
  total_invoiced: number;
  total_paid: number;
  
  // Calculated values
  remaining_budget: number;
  budget_remaining_percentage: number;
  budget_usage_percentage: number;
}

// =====================================================
// PROJECT BUDGETS FUNCTIONS
// =====================================================

export async function createProjectBudget(
  projectId: string,
  category: BudgetCategory,
  budgetAmount: number,
  options: {
    description?: string;
    budgetPeriod?: "total" | "monthly" | "quarterly" | "annual";
    startDate?: string;
    endDate?: string;
  } = {}
): Promise<ProjectBudget> {
  const { data: { user } } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from("project_budgets")
    .insert([
      {
        project_id: projectId,
        company_id: (await getProjectCompany(projectId)).company_id,
        category,
        budget_amount: budgetAmount,
        description: options.description,
        budget_period: options.budgetPeriod,
        start_date: options.startDate,
        end_date: options.endDate,
        created_by: user?.id,
      },
    ])
    .select()
    .single();

  if (error) throw error;
  return data as ProjectBudget;
}

export async function fetchProjectBudgets(projectId: string): Promise<ProjectBudget[]> {
  const { data, error } = await supabase
    .from("project_budgets")
    .select("*")
    .eq("project_id", projectId)
    .eq("is_active", true)
    .order("category", { ascending: true });

  if (error) throw error;
  return data || [];
}

export async function updateProjectBudget(id: string, updates: Partial<ProjectBudget>): Promise<ProjectBudget> {
  const { data, error } = await supabase
    .from("project_budgets")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data as ProjectBudget;
}

// =====================================================
// PROJECT COSTS FUNCTIONS
// =====================================================

export async function createProjectCost(
  projectId: string,
  costType: CostType,
  amount: number,
  options: {
    description?: string;
    costDate?: string;
    sourceType?: CostSourceType;
    sourceId?: string;
    invoiceNumber?: string;
    vendorName?: string;
    taskId?: string;
    boqItemId?: string;
    quantity?: number;
    notes?: string;
  } = {}
): Promise<ProjectCost> {
  const { data: { user } } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from("project_costs")
    .insert([
      {
        project_id: projectId,
        company_id: (await getProjectCompany(projectId)).company_id,
        cost_type: costType,
        amount,
        quantity: options.quantity || 1,
        description: options.description,
        cost_date: options.costDate || new Date().toISOString().split("T")[0],
        source_type: options.sourceType,
        source_id: options.sourceId,
        invoice_number: options.invoiceNumber,
        vendor_name: options.vendorName,
        task_id: options.taskId,
        boq_item_id: options.boqItemId,
        notes: options.notes,
        created_by: user?.id,
      },
    ])
    .select()
    .single();

  if (error) throw error;
  return data as ProjectCost;
}

export async function fetchProjectCosts(
  projectId: string,
  filters?: {
    costType?: CostType;
    status?: "pending" | "approved" | "paid" | "disputed";
    startDate?: string;
    endDate?: string;
  }
): Promise<ProjectCost[]> {
  let query = supabase
    .from("project_costs")
    .select("*")
    .eq("project_id", projectId);

  if (filters?.costType) {
    query = query.eq("cost_type", filters.costType);
  }

  if (filters?.status) {
    query = query.eq("status", filters.status);
  }

  if (filters?.startDate) {
    query = query.gte("cost_date", filters.startDate);
  }

  if (filters?.endDate) {
    query = query.lte("cost_date", filters.endDate);
  }

  const { data, error } = await query.order("cost_date", { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function approveProjectCost(costId: string): Promise<ProjectCost> {
  const { data: { user } } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from("project_costs")
    .update({
      status: "approved",
      approved_by: user?.id,
      approved_at: new Date().toISOString(),
    })
    .eq("id", costId)
    .select()
    .single();

  if (error) throw error;
  return data as ProjectCost;
}

// =====================================================
// PROJECT COMMITMENTS FUNCTIONS
// =====================================================

export async function createProjectCommitment(
  projectId: string,
  commitmentType: CommitmentType,
  committedAmount: number,
  sourceId: string,
  sourceType: CommitmentSourceType,
  options: {
    description?: string;
    vendorName?: string;
    commitmentDate?: string;
    expectedDeliveryDate?: string;
    termsConditions?: string;
    notes?: string;
  } = {}
): Promise<ProjectCommitment> {
  const { data: { user } } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from("project_commitments")
    .insert([
      {
        project_id: projectId,
        company_id: (await getProjectCompany(projectId)).company_id,
        commitment_type: commitmentType,
        committed_amount: committedAmount,
        source_id: sourceId,
        source_type: sourceType,
        description: options.description,
        vendor_name: options.vendorName,
        commitment_date: options.commitmentDate || new Date().toISOString().split("T")[0],
        expected_delivery_date: options.expectedDeliveryDate,
        terms_conditions: options.termsConditions,
        notes: options.notes,
        created_by: user?.id,
      },
    ])
    .select()
    .single();

  if (error) throw error;
  return data as ProjectCommitment;
}

export async function fetchProjectCommitments(
  projectId: string,
  filters?: {
    commitmentType?: CommitmentType;
    status?: "active" | "completed" | "cancelled" | "disputed";
  }
): Promise<ProjectCommitment[]> {
  let query = supabase
    .from("project_commitments")
    .select("*")
    .eq("project_id", projectId);

  if (filters?.commitmentType) {
    query = query.eq("commitment_type", filters.commitmentType);
  }

  if (filters?.status) {
    query = query.eq("status", filters.status);
  }

  const { data, error } = await query.order("commitment_date", { ascending: false });

  if (error) throw error;
  return data || [];
}

// =====================================================
// CORE FINANCIAL SUMMARY FUNCTIONS
// =====================================================

/**
 * Gets the basic project financial summary
 */
export async function getProjectFinancialSummary(projectId: string): Promise<ProjectFinancialSummary> {
  try {
    // Get budget summary
    const { data: budgetData, error: budgetError } = await supabase
      .from("project_budgets")
      .select("budget_amount")
      .eq("project_id", projectId)
      .eq("is_active", true);

    if (budgetError) throw budgetError;

    const totalBudget = budgetData?.reduce((sum, budget) => sum + Number(budget.budget_amount), 0) || 0;

    // Get actual costs (approved only)
    const { data: costData, error: costError } = await supabase
      .from("project_costs")
      .select("amount")
      .eq("project_id", projectId)
      .eq("status", "approved");

    if (costError) throw costError;

    const totalActual = costData?.reduce((sum, cost) => sum + Number(cost.amount), 0) || 0;

    // Get commitments (active only)
    const { data: commitmentData, error: commitmentError } = await supabase
      .from("project_commitments")
      .select("committed_amount")
      .eq("project_id", projectId)
      .eq("status", "active");

    if (commitmentError) throw commitmentError;

    const totalCommitted = commitmentData?.reduce((sum, commitment) => sum + Number(commitment.committed_amount), 0) || 0;

    const remaining = totalBudget - totalActual;

    return {
      budget: totalBudget,
      actual: totalActual,
      committed: totalCommitted,
      remaining: Math.max(0, remaining), // Ensure non-negative
    };
  } catch (error) {
    console.error("Error getting project financial summary:", error);
    return {
      budget: 0,
      actual: 0,
      committed: 0,
      remaining: 0,
    };
  }
}

/**
 * Gets detailed project financial summary with breakdowns
 */
export async function getDetailedProjectFinancialSummary(projectId: string): Promise<DetailedProjectFinancialSummary | null> {
  try {
    const { data, error } = await supabase
      .from("v_project_financial_summary")
      .select("*")
      .eq("project_id", projectId)
      .single();

    if (error) throw error;
    return data as DetailedProjectFinancialSummary;
  } catch (error) {
    console.error("Error getting detailed project financial summary:", error);
    return null;
  }
}

/**
 * Calculates project margin based on budget vs actual costs
 */
export async function calculateProjectMargin(projectId: string): Promise<{
  margin: number;
  marginPercentage: number;
  budgetUsage: number;
}> {
  try {
    const summary = await getProjectFinancialSummary(projectId);
    
    if (summary.budget === 0) {
      return {
        margin: 0,
        marginPercentage: 0,
        budgetUsage: 0,
      };
    }

    const margin = summary.budget - summary.actual;
    const marginPercentage = (margin / summary.budget) * 100;
    const budgetUsage = (summary.actual / summary.budget) * 100;

    return {
      margin: Math.max(0, margin), // Ensure non-negative
      marginPercentage: Math.max(0, marginPercentage),
      budgetUsage,
    };
  } catch (error) {
    console.error("Error calculating project margin:", error);
    return {
      margin: 0,
      marginPercentage: 0,
      budgetUsage: 0,
    };
  }
}

/**
 * Gets project financial health indicators
 */
export async function getProjectFinancialHealth(projectId: string): Promise<{
  healthStatus: "healthy" | "warning" | "critical";
  budgetVariance: number;
  commitmentCoverage: number;
  costEfficiency: number;
}> {
  try {
    const summary = await getProjectFinancialSummary(projectId);
    const margin = await calculateProjectMargin(projectId);

    // Calculate health indicators
    const budgetVariance = summary.budget > 0 ? ((summary.budget - summary.actual) / summary.budget) * 100 : 0;
    const commitmentCoverage = summary.committed > 0 ? (summary.actual / summary.committed) * 100 : 100;
    const costEfficiency = summary.budget > 0 ? (summary.actual / summary.budget) * 100 : 0;

    // Determine health status
    let healthStatus: "healthy" | "warning" | "critical" = "healthy";
    
    if (budgetVariance < 0 || costEfficiency > 100) {
      healthStatus = "critical";
    } else if (budgetVariance < 10 || costEfficiency > 90) {
      healthStatus = "warning";
    }

    return {
      healthStatus,
      budgetVariance,
      commitmentCoverage,
      costEfficiency,
    };
  } catch (error) {
    console.error("Error getting project financial health:", error);
    return {
      healthStatus: "healthy",
      budgetVariance: 0,
      commitmentCoverage: 0,
      costEfficiency: 0,
    };
  }
}

// =====================================================
// UTILITY FUNCTIONS
// =====================================================

/**
 * Helper function to get company_id for a project
 */
async function getProjectCompany(projectId: string): Promise<{ company_id: string }> {
  const { data, error } = await supabase
    .from("projects")
    .select("company_id")
    .eq("id", projectId)
    .single();

  if (error) throw error;
  if (!data) throw new Error("Project not found");
  
  return data;
}

/**
 * Formats currency values for display
 */
export function formatCurrency(amount: number, currency: string = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(amount);
}

/**
 * Calculates percentage with safe division
 */
export function calculatePercentage(value: number, total: number): number {
  if (total === 0) return 0;
  return (value / total) * 100;
}

/**
 * Aggregates costs by type for a project
 */
export async function getCostsByType(projectId: string): Promise<Record<CostType, number>> {
  try {
    const { data, error } = await supabase
      .from("project_costs")
      .select("cost_type, amount")
      .eq("project_id", projectId)
      .eq("status", "approved");

    if (error) throw error;

    const aggregated: Record<string, number> = {
      material: 0,
      labor: 0,
      equipment: 0,
      subcontractor: 0,
      overhead: 0,
      other: 0,
    };

    data?.forEach((cost) => {
      const costType = cost.cost_type as CostType;
      aggregated[costType] = (aggregated[costType] || 0) + Number(cost.amount);
    });

    return aggregated as Record<CostType, number>;
  } catch (error) {
    console.error("Error getting costs by type:", error);
    return {
      material: 0,
      labor: 0,
      equipment: 0,
      subcontractor: 0,
      overhead: 0,
      other: 0,
    };
  }
}

/**
 * Aggregates budgets by category for a project
 */
export async function getBudgetsByCategory(projectId: string): Promise<Record<BudgetCategory, number>> {
  try {
    const { data, error } = await supabase
      .from("project_budgets")
      .select("category, budget_amount")
      .eq("project_id", projectId)
      .eq("is_active", true);

    if (error) throw error;

    const aggregated: Record<string, number> = {
      material: 0,
      labor: 0,
      equipment: 0,
      subcontractor: 0,
      overhead: 0,
      contingency: 0,
      other: 0,
    };

    data?.forEach((budget) => {
      const category = budget.category as BudgetCategory;
      aggregated[category] = (aggregated[category] || 0) + Number(budget.budget_amount);
    });

    return aggregated as Record<BudgetCategory, number>;
  } catch (error) {
    console.error("Error getting budgets by category:", error);
    return {
      material: 0,
      labor: 0,
      equipment: 0,
      subcontractor: 0,
      overhead: 0,
      contingency: 0,
      other: 0,
    };
  }
}
