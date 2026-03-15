import { supabase } from "./supabase";

export interface CostCode {
  id?: string;
  company_id: string;
  code: string;
  description: string;
  category?: string | null;
  parent_code_id?: string | null;
  is_billable: boolean;
  budget_amount: number;
  is_active: boolean;
  notes?: string | null;
  created_at?: string;
  updated_at?: string;
  created_by?: string | null;
}

export interface CostCodeSummary {
  cost_code_id: string;
  company_id: string;
  code: string;
  description: string;
  category: string | null;
  budget_amount: number;
  boq_budget: number;
  procurement_committed: number;
  po_committed: number;
  actual_costs: number;
  invoice_actual: number;
  total_budget: number;
  total_committed: number;
  total_actual: number;
  variance: number;
}

export interface ProjectCostsByCode {
  cost_code_id: string;
  cost_code: string;
  cost_code_description: string;
  cost_code_category: string | null;
  budget_amount: number;
  boq_budget: number;
  committed_amount: number;
  actual_amount: number;
  variance: number;
  percent_spent: number;
}

export async function fetchCostCodes(companyId: string): Promise<CostCode[]> {
  const { data, error } = await supabase
    .from("cost_codes")
    .select("*")
    .eq("company_id", companyId)
    .order("code", { ascending: true });

  if (error) throw error;
  return data as CostCode[];
}

export async function fetchActiveCostCodes(companyId: string): Promise<CostCode[]> {
  const { data, error } = await supabase
    .from("cost_codes")
    .select("*")
    .eq("company_id", companyId)
    .eq("is_active", true)
    .order("code", { ascending: true });

  if (error) throw error;
  return data as CostCode[];
}

export async function fetchCostCodeById(id: string): Promise<CostCode> {
  const { data, error } = await supabase
    .from("cost_codes")
    .select("*")
    .eq("id", id)
    .single();

  if (error) throw error;
  return data as CostCode;
}

export async function createCostCode(costCode: Partial<CostCode>): Promise<CostCode> {
  const { data: { user } } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from("cost_codes")
    .insert([
      {
        ...costCode,
        created_by: user?.id,
      },
    ])
    .select()
    .single();

  if (error) throw error;
  return data as CostCode;
}

export async function updateCostCode(id: string, updates: Partial<CostCode>): Promise<CostCode> {
  const { data, error } = await supabase
    .from("cost_codes")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data as CostCode;
}

export async function deleteCostCode(id: string): Promise<void> {
  const { error } = await supabase.from("cost_codes").delete().eq("id", id);

  if (error) throw error;
}

export async function deactivateCostCode(id: string): Promise<CostCode> {
  return updateCostCode(id, { is_active: false });
}

export async function activateCostCode(id: string): Promise<CostCode> {
  return updateCostCode(id, { is_active: true });
}

export async function fetchCostCodesByCategory(
  companyId: string,
  category: string
): Promise<CostCode[]> {
  const { data, error } = await supabase
    .from("cost_codes")
    .select("*")
    .eq("company_id", companyId)
    .eq("category", category)
    .eq("is_active", true)
    .order("code", { ascending: true });

  if (error) throw error;
  return data as CostCode[];
}

export async function fetchCostCodeSummary(companyId: string): Promise<CostCodeSummary[]> {
  const { data, error } = await supabase
    .from("v_cost_code_summary")
    .select("*")
    .eq("company_id", companyId)
    .order("code", { ascending: true });

  if (error) throw error;
  return data as CostCodeSummary[];
}

export async function getProjectCostsByCode(projectId: string): Promise<ProjectCostsByCode[]> {
  const { data, error } = await supabase.rpc("get_project_costs_by_code", {
    p_project_id: projectId,
  });

  if (error) throw error;
  return (data || []) as ProjectCostsByCode[];
}

export async function getCompanyCostCodes(companyId: string): Promise<CostCode[]> {
  const { data, error } = await supabase.rpc("get_company_cost_codes", {
    p_company_id: companyId,
  });

  if (error) throw error;
  return (data || []) as CostCode[];
}

export async function getCostCodeCategories(companyId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from("cost_codes")
    .select("category")
    .eq("company_id", companyId)
    .not("category", "is", null)
    .order("category", { ascending: true });

  if (error) throw error;

  const categories = Array.from(new Set(data.map((row) => row.category).filter(Boolean)));
  return categories as string[];
}

export async function createStandardCostCodes(companyId: string): Promise<number> {
  const standardCodes = [
    { code: "01-0000", description: "General Requirements", category: "General" },
    { code: "02-0000", description: "Site Construction", category: "Site Work" },
    { code: "03-0000", description: "Concrete", category: "Concrete" },
    { code: "04-0000", description: "Masonry", category: "Masonry" },
    { code: "05-0000", description: "Metals", category: "Metals" },
    { code: "06-0000", description: "Wood & Plastics", category: "Carpentry" },
    { code: "07-0000", description: "Thermal & Moisture Protection", category: "Waterproofing" },
    { code: "08-0000", description: "Doors & Windows", category: "Openings" },
    { code: "09-0000", description: "Finishes", category: "Finishes" },
    { code: "10-0000", description: "Specialties", category: "Specialties" },
    { code: "11-0000", description: "Equipment", category: "Equipment" },
    { code: "12-0000", description: "Furnishings", category: "Furnishings" },
    { code: "13-0000", description: "Special Construction", category: "Special" },
    { code: "14-0000", description: "Conveying Systems", category: "Elevators" },
    { code: "21-0000", description: "Fire Suppression", category: "Fire Protection" },
    { code: "22-0000", description: "Plumbing", category: "Plumbing" },
    { code: "23-0000", description: "HVAC", category: "HVAC" },
    { code: "26-0000", description: "Electrical", category: "Electrical" },
    { code: "27-0000", description: "Communications", category: "Low Voltage" },
    { code: "28-0000", description: "Electronic Safety & Security", category: "Security" },
  ];

  const { data: { user } } = await supabase.auth.getUser();

  const costCodesToInsert = standardCodes.map((code) => ({
    company_id: companyId,
    code: code.code,
    description: code.description,
    category: code.category,
    is_billable: true,
    budget_amount: 0,
    is_active: true,
    created_by: user?.id,
  }));

  const { data, error } = await supabase
    .from("cost_codes")
    .insert(costCodesToInsert)
    .select();

  if (error) throw error;
  return data?.length || 0;
}
