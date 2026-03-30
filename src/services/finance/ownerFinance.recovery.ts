import { supabase } from "../../lib/supabase";

// =====================================================
// OWNER FINANCE TYPES
// =====================================================

export type OwnerAccountType = "equity" | "draw" | "salary";
export type DrawSafetyStatus = "SAFE" | "CAUTION" | "BLOCK";
export type DrawStatus = "pending" | "approved" | "processed" | "rejected" | "cancelled";
export type SalaryFrequency = "weekly" | "biweekly" | "monthly" | "quarterly" | "annual";
export type EmploymentType = "full_time" | "part_time" | "contract" | "consultant";

export interface OwnerAccount {
  id: string;
  owner_id: string;
  company_id: string;
  account_type: OwnerAccountType;
  balance: number;
  description?: string;
  is_active: boolean;
  chart_account_id?: string;
  created_at: string;
  updated_at: string;
  created_by?: string;
}

export interface OwnerDraw {
  id: string;
  owner_id: string;
  company_id: string;
  amount: number;
  draw_date: string;
  safety_status: DrawSafetyStatus;
  safety_reason?: string;
  protection_level: number;
  status: DrawStatus;
  approved_by?: string;
  approved_at?: string;
  processed_by?: string;
  processed_at?: string;
  bank_account_id?: string;
  purpose?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
  created_by?: string;
}

export interface OwnerSalary {
  id: string;
  owner_id: string;
  company_id: string;
  amount: number;
  frequency: SalaryFrequency;
  next_payment_date?: string;
  last_payment_date?: string;
  is_active: boolean;
  is_taxable: boolean;
  tax_withholding_rate: number;
  other_deductions: number;
  bank_account_id?: string;
  job_title?: string;
  employment_type?: EmploymentType;
  created_at: string;
  updated_at: string;
  created_by?: string;
}

export interface OwnerFinancialSummary {
  owner_id: string;
  company_id: string;
  owner_email: string;
  owner_name: string;
  equity_balance: number;
  draw_balance: number;
  salary_amount: number;
  salary_frequency?: SalaryFrequency;
  next_payment_date?: string;
  total_draws: number;
  pending_draws: number;
  processed_draws: number;
  safe_draws: number;
  caution_draws: number;
  blocked_draws: number;
  avg_protection_level: number;
}

export interface CashProtectionCalculation {
  total_cash: number;
  project_funds: number;
  committed_costs: number;
  operational_reserve: number;
  free_cash: number;
  protection_percentage: number;
}

export interface DrawSafetyEvaluation {
  status: DrawSafetyStatus;
  free_cash: number;
  draw_amount: number;
  protection_level: number;
  safety_reason: string;
  recommendations: string[];
}

// =====================================================
// OWNER ACCOUNTS FUNCTIONS
// =====================================================

export async function createOwnerAccount(
  ownerId: string,
  accountType: OwnerAccountType,
  options: {
    description?: string;
    chartAccountId?: string;
    initialBalance?: number;
  } = {}
): Promise<OwnerAccount> {
  const { data: { user } } = await supabase.auth.getUser();
  
  // Get company_id from user profile
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("company_id")
    .eq("id", ownerId)
    .single();

  if (!profile) {
    throw new Error("User profile not found");
  }

  const { data, error } = await supabase
    .from("owner_accounts")
    .insert([
      {
        owner_id: ownerId,
        company_id: profile.company_id,
        account_type: accountType,
        balance: options.initialBalance || 0,
        description: options.description,
        chart_account_id: options.chartAccountId,
        created_by: user?.id,
      },
    ])
    .select()
    .single();

  if (error) throw error;
  return data as OwnerAccount;
}

export async function fetchOwnerAccounts(ownerId: string): Promise<OwnerAccount[]> {
  const { data, error } = await supabase
    .from("owner_accounts")
    .select("*")
    .eq("owner_id", ownerId)
    .eq("is_active", true)
    .order("account_type", { ascending: true });

  if (error) throw error;
  return data || [];
}

export async function updateOwnerAccount(id: string, updates: Partial<OwnerAccount>): Promise<OwnerAccount> {
  const { data, error } = await supabase
    .from("owner_accounts")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data as OwnerAccount;
}

// =====================================================
// OWNER DRAWS FUNCTIONS
// =====================================================

export async function createOwnerDraw(
  ownerId: string,
  amount: number,
  drawDate: string,
  options: {
    purpose?: string;
    bankAccountId?: string;
    notes?: string;
  } = {}
): Promise<OwnerDraw> {
  const { data: { user } } = await supabase.auth.getUser();
  
  // Get company_id from user profile
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("company_id")
    .eq("id", ownerId)
    .single();

  if (!profile) {
    throw new Error("User profile not found");
  }

  // Evaluate draw safety
  const safetyEvaluation = await evaluateDrawSafety(amount, profile.company_id);

  const { data, error } = await supabase
    .from("owner_draws")
    .insert([
      {
        owner_id: ownerId,
        company_id: profile.company_id,
        amount,
        draw_date: drawDate,
        safety_status: safetyEvaluation.status,
        safety_reason: safetyEvaluation.safety_reason,
        protection_level: safetyEvaluation.protection_level,
        purpose: options.purpose,
        bank_account_id: options.bankAccountId,
        notes: options.notes,
        created_by: user?.id,
      },
    ])
    .select()
    .single();

  if (error) throw error;
  return data as OwnerDraw;
}

export async function fetchOwnerDraws(
  ownerId: string,
  filters?: {
    status?: DrawStatus;
    safetyStatus?: DrawSafetyStatus;
    startDate?: string;
    endDate?: string;
  }
): Promise<OwnerDraw[]> {
  let query = supabase
    .from("owner_draws")
    .select("*")
    .eq("owner_id", ownerId);

  if (filters?.status) {
    query = query.eq("status", filters.status);
  }

  if (filters?.safetyStatus) {
    query = query.eq("safety_status", filters.safetyStatus);
  }

  if (filters?.startDate) {
    query = query.gte("draw_date", filters.startDate);
  }

  if (filters?.endDate) {
    query = query.lte("draw_date", filters.endDate);
  }

  const { data, error } = await query.order("draw_date", { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function approveOwnerDraw(drawId: string): Promise<OwnerDraw> {
  const { data: { user } } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from("owner_draws")
    .update({
      status: "approved",
      approved_by: user?.id,
      approved_at: new Date().toISOString(),
    })
    .eq("id", drawId)
    .select()
    .single();

  if (error) throw error;
  return data as OwnerDraw;
}

export async function processOwnerDraw(drawId: string): Promise<OwnerDraw> {
  const { data: { user } } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from("owner_draws")
    .update({
      status: "processed",
      processed_by: user?.id,
      processed_at: new Date().toISOString(),
    })
    .eq("id", drawId)
    .select()
    .single();

  if (error) throw error;
  return data as OwnerDraw;
}

// =====================================================
// OWNER SALARY FUNCTIONS
// =====================================================

export async function createOwnerSalary(
  ownerId: string,
  amount: number,
  frequency: SalaryFrequency,
  options: {
    jobTitle?: string;
    employmentType?: EmploymentType;
    taxWithholdingRate?: number;
    bankAccountId?: string;
    nextPaymentDate?: string;
  } = {}
): Promise<OwnerSalary> {
  const { data: { user } } = await supabase.auth.getUser();
  
  // Get company_id from user profile
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("company_id")
    .eq("id", ownerId)
    .single();

  if (!profile) {
    throw new Error("User profile not found");
  }

  const { data, error } = await supabase
    .from("owner_salary")
    .insert([
      {
        owner_id: ownerId,
        company_id: profile.company_id,
        amount,
        frequency,
        job_title: options.jobTitle,
        employment_type: options.employmentType,
        tax_withholding_rate: options.taxWithholdingRate || 0,
        bank_account_id: options.bankAccountId,
        next_payment_date: options.nextPaymentDate,
        created_by: user?.id,
      },
    ])
    .select()
    .single();

  if (error) throw error;
  return data as OwnerSalary;
}

export async function fetchOwnerSalary(ownerId: string): Promise<OwnerSalary | null> {
  const { data, error } = await supabase
    .from("owner_salary")
    .select("*")
    .eq("owner_id", ownerId)
    .eq("is_active", true)
    .single();

  if (error && error.code !== "PGRST116") throw error; // PGRST116 is "not found"
  return data as OwnerSalary || null;
}

export async function updateOwnerSalary(id: string, updates: Partial<OwnerSalary>): Promise<OwnerSalary> {
  const { data, error } = await supabase
    .from("owner_salary")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data as OwnerSalary;
}

// =====================================================
// CORE FINANCIAL FUNCTIONS
// =====================================================

/**
 * Calculates free cash available for owner draws
 */
export async function calculateFreeCash(companyId: string): Promise<number> {
  try {
    const { data, error } = await supabase
      .rpc("calculate_free_cash", { p_company_id: companyId });

    if (error) throw error;
    return Number(data) || 0;
  } catch (error) {
    console.error("Error calculating free cash:", error);
    return 0;
  }
}

/**
 * Evaluates draw safety with detailed analysis
 */
export async function evaluateDrawSafety(amount: number, companyId: string): Promise<DrawSafetyEvaluation> {
  try {
    // Get safety status from database function
    const { data: safetyStatus, error: safetyError } = await supabase
      .rpc("evaluate_draw_safety", { p_amount: amount, p_company_id: companyId });

    if (safetyError) throw safetyError;

    // Calculate detailed cash protection
    const protectionCalc = await calculateCashProtection(companyId);

    // Generate safety recommendations
    const recommendations = generateSafetyRecommendations(
      safetyStatus as DrawSafetyStatus,
      amount,
      protectionCalc.free_cash
    );

    // Calculate protection level
    const protectionLevel = protectionCalc.free_cash > 0 
      ? (amount / protectionCalc.free_cash) * 100 
      : 100;

    return {
      status: safetyStatus as DrawSafetyStatus,
      free_cash: protectionCalc.free_cash,
      draw_amount: amount,
      protection_level: protectionLevel,
      safety_reason: generateSafetyReason(safetyStatus as DrawSafetyStatus, protectionCalc),
      recommendations,
    };
  } catch (error) {
    console.error("Error evaluating draw safety:", error);
    return {
      status: "BLOCK",
      free_cash: 0,
      draw_amount: amount,
      protection_level: 100,
      safety_reason: "Unable to verify financial safety - blocked by default",
      recommendations: ["Contact system administrator", "Verify company financial data"],
    };
  }
}

/**
 * Gets owner draw summary
 */
export async function getOwnerDrawSummary(ownerId: string): Promise<{
  totalDraws: number;
  pendingDraws: number;
  processedDraws: number;
  recentDraws: OwnerDraw[];
  safetySummary: {
    safe: number;
    caution: number;
    blocked: number;
  };
}> {
  try {
    // Get all draws for the owner
    const { data: draws, error } = await supabase
      .from("owner_draws")
      .select("*")
      .eq("owner_id", ownerId)
      .order("draw_date", { ascending: false })
      .limit(50);

    if (error) throw error;

    const allDraws = draws || [];
    const recentDraws = allDraws.slice(0, 10); // Last 10 draws

    // Calculate summaries
    const totalDraws = allDraws.length;
    const pendingDraws = allDraws.filter(d => d.status === "pending").length;
    const processedDraws = allDraws.filter(d => d.status === "processed").length;

    const safetySummary = {
      safe: allDraws.filter(d => d.safety_status === "SAFE").length,
      caution: allDraws.filter(d => d.safety_status === "CAUTION").length,
      blocked: allDraws.filter(d => d.safety_status === "BLOCK").length,
    };

    return {
      totalDraws,
      pendingDraws,
      processedDraws,
      recentDraws,
      safetySummary,
    };
  } catch (error) {
    console.error("Error getting owner draw summary:", error);
    return {
      totalDraws: 0,
      pendingDraws: 0,
      processedDraws: 0,
      recentDraws: [],
      safetySummary: { safe: 0, caution: 0, blocked: 0 },
    };
  }
}

/**
 * Gets comprehensive owner financial summary
 */
export async function getOwnerFinancialSummary(ownerId: string): Promise<OwnerFinancialSummary | null> {
  try {
    const { data, error } = await supabase
      .from("v_owner_financial_summary")
      .select("*")
      .eq("owner_id", ownerId)
      .single();

    if (error) throw error;
    return data as OwnerFinancialSummary;
  } catch (error) {
    console.error("Error getting owner financial summary:", error);
    return null;
  }
}

// =====================================================
// HELPER FUNCTIONS
// =====================================================

/**
 * Calculates detailed cash protection breakdown
 */
async function calculateCashProtection(companyId: string): Promise<CashProtectionCalculation> {
  try {
    // Get total cash from bank accounts
    const { data: bankData, error: bankError } = await supabase
      .from("bank_accounts")
      .select("balance")
      .eq("company_id", companyId)
      .eq("is_active", true);

    if (bankError) throw bankError;

    const totalCash = bankData?.reduce((sum, account) => sum + Number(account.balance), 0) || 0;

    // Get project funds from Phase 3 financial summary
    const { data: projectData, error: projectError } = await supabase
      .from("v_project_financial_summary")
      .select("remaining_budget, total_committed")
      .eq("company_id", companyId);

    if (projectError) throw projectError;

    const projectFunds = projectData?.reduce((sum, project) => sum + Number(project.remaining_budget), 0) || 0;
    const committedCosts = projectData?.reduce((sum, project) => sum + Number(project.total_committed), 0) || 0;

    // Calculate operational reserve (15% of recent expenses or minimum $10,000)
    const { data: expenseData, error: expenseError } = await supabase
      .from("project_costs")
      .select("amount")
      .eq("company_id", companyId)
      .eq("status", "approved")
      .gte("cost_date", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);

    if (expenseError) throw expenseError;

    const monthlyExpenses = expenseData?.reduce((sum, expense) => sum + Number(expense.amount), 0) || 0;
    const operationalReserve = Math.max(monthlyExpenses * 0.15, 10000);

    // Calculate free cash
    const freeCash = Math.max(totalCash - projectFunds - committedCosts - operationalReserve, 0);

    // Calculate protection percentage
    const protectionPercentage = totalCash > 0 ? ((totalCash - freeCash) / totalCash) * 100 : 100;

    return {
      total_cash: totalCash,
      project_funds: projectFunds,
      committed_costs: committedCosts,
      operational_reserve: operationalReserve,
      free_cash: freeCash,
      protection_percentage: protectionPercentage,
    };
  } catch (error) {
    console.error("Error calculating cash protection:", error);
    return {
      total_cash: 0,
      project_funds: 0,
      committed_costs: 0,
      operational_reserve: 0,
      free_cash: 0,
      protection_percentage: 100,
    };
  }
}

/**
 * Generates safety recommendations based on status
 */
function generateSafetyRecommendations(
  status: DrawSafetyStatus,
  amount: number,
  freeCash: number
): string[] {
  switch (status) {
    case "SAFE":
      return [
        "Draw is within safe limits",
        "Sufficient cash reserves maintained",
        "No impact on project operations",
      ];
    case "CAUTION":
      return [
        "Draw exceeds recommended safe limit",
        "Consider reducing draw amount",
        "Monitor cash flow closely",
        "Ensure project funding is secure",
      ];
    case "BLOCK":
      return [
        "Draw amount exceeds safety threshold",
        "Significant risk to operations",
        "Wait for improved cash position",
        "Consider alternative financing",
        "Review project payment schedules",
      ];
    default:
      return ["Unable to determine safety status"];
  }
}

/**
 * Generates detailed safety reason
 */
function generateSafetyReason(status: DrawSafetyStatus, protection: CashProtectionCalculation): string {
  const { free_cash, project_funds, committed_costs, operational_reserve } = protection;

  switch (status) {
    case "SAFE":
      return `Draw is safe. Free cash: $${free_cash.toFixed(2)} available after protecting project funds ($${project_funds.toFixed(2)}), committed costs ($${committed_costs.toFixed(2)}), and operational reserve ($${operational_reserve.toFixed(2)}).`;
    case "CAUTION":
      return `Caution advised. Draw uses significant portion of free cash. Free cash: $${free_cash.toFixed(2)} after protecting essential funds.`;
    case "BLOCK":
      return `Draw blocked. Insufficient free cash available. Total protected funds: $${(project_funds + committed_costs + operational_reserve).toFixed(2)} including project funding and operational requirements.`;
    default:
      return "Safety status could not be determined.";
  }
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
 * Gets company_id for a user
 */
async function getUserCompanyId(userId: string): Promise<string> {
  const { data, error } = await supabase
    .from("user_profiles")
    .select("company_id")
    .eq("id", userId)
    .single();

  if (error) throw error;
  if (!data) throw new Error("User profile not found");
  
  return data.company_id;
}
