import { supabase } from "../../lib/supabase";

// =====================================================
// AUTOMATION ENGINE TYPES
// =====================================================

export type PatternType = "text" | "regex" | "exact";
export type RuleType = "all" | "debit" | "credit" | "charge" | "payment" | "fee" | "interest" | "transfer";
export type MatchOperator = "equals" | "contains" | "starts_with" | "ends_with" | "regex" | "greater_than" | "less_than" | "between";
export type TargetEntityType = "expense" | "supplier_invoice" | "client_invoice" | "client_payment" | "supplier_payment" | "gl_transaction" | "bank_transfer" | "credit_card_payment" | "payroll_entry" | "procurement";

export type AutomationRuleType = "exact_match" | "pattern_match" | "amount_range" | "date_range" | "reference_match" | "combined" | "custom";

export interface ClassificationRule {
  id: string;
  company_id: string;
  name: string;
  description?: string;
  pattern: string;
  pattern_type: PatternType;
  category: string;
  subcategory?: string;
  confidence_score: number;
  transaction_type: RuleType;
  amount_min?: number;
  amount_max?: number;
  description_contains?: string;
  description_not_contains?: string;
  priority: number;
  is_active: boolean;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

export interface MatchingRule {
  id: string;
  company_id: string;
  name: string;
  description?: string;
  rule_type: AutomationRuleType;
  conditions_json: Record<string, any>;
  target_entity_type: TargetEntityType;
  target_field?: string;
  target_value: string;
  match_operator: MatchOperator;
  confidence_score: number;
  priority: number;
  is_active: boolean;
  auto_apply: boolean;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

export interface ClassificationResult {
  rule_id: string;
  category: string;
  subcategory?: string;
  confidence_score: number;
  match_type: PatternType;
  rule_name: string;
}

export interface MatchingResult {
  rule_id: string;
  target_entity_type: TargetEntityType;
  target_entity_id: string;
  target_field: string;
  target_value: string;
  confidence_score: number;
  match_details: Record<string, any>;
}

export interface ConfidenceScoreBreakdown {
  base_score: number;
  pattern_score: number;
  amount_score: number;
  reference_score: number;
  existing_score: number;
  final_score: number;
}

export interface TransactionForClassification {
  description: string;
  amount: number;
  transaction_type?: RuleType;
  transaction_date?: string;
  reference_number?: string;
  existing_matches?: MatchingResult[];
}

export interface TransactionForMatching {
  description: string;
  amount: number;
  transaction_type?: RuleType;
  transaction_date?: string;
  reference_number?: string;
  target_entity_type?: TargetEntityType;
  existing_matches?: MatchingResult[];
}

// =====================================================
// CLASSIFICATION RULES FUNCTIONS
// =====================================================

export async function createClassificationRule(
  rule: Omit<ClassificationRule, "id" | "created_at" | "updated_at"> & { company_id?: string }
): Promise<ClassificationRule> {
  const { data: { user } } = await supabase.auth.getUser();

  // Get company_id from user profile
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("company_id")
    .eq("id", user?.id || "")
    .single();

  const companyId = profile?.company_id || rule.company_id;

  if (!companyId) {
    throw new Error("Company ID is required");
  }

  const { data, error } = await supabase
    .from("classification_rules")
    .insert([
      {
        ...rule,
        company_id: companyId,
        created_by: user?.id,
      },
    ])
    .select()
    .single();

  if (error) throw error;
  return data as ClassificationRule;
}

export async function fetchClassificationRules(
  companyId?: string,
  filters?: {
    category?: string;
    isActive?: boolean;
    transactionType?: RuleType;
  }
): Promise<ClassificationRule[]> {
  let query = supabase
    .from("classification_rules")
    .select("*");

  if (companyId) {
    query = query.eq("company_id", companyId);
  } else {
    // If no company_id provided, use current user's company
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("company_id")
      .eq("id", (await supabase.auth.getUser()).data.user?.id || "")
      .single();
    
    if (profile) {
      query = query.eq("company_id", profile.company_id);
    }
  }

  if (filters?.category) {
    query = query.eq("category", filters.category);
  }

  if (filters?.isActive !== undefined) {
    query = query.eq("is_active", filters.isActive);
  }

  if (filters?.transactionType) {
    query = query.eq("transaction_type", filters.transactionType);
  }

  const { data, error } = await query.order("priority", { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function updateClassificationRule(id: string, updates: Partial<ClassificationRule>): Promise<ClassificationRule> {
  const { data, error } = await supabase
    .from("classification_rules")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data as ClassificationRule;
}

export async function deleteClassificationRule(id: string): Promise<void> {
  const { error } = await supabase
    .from("classification_rules")
    .update({ is_active: false })
    .eq("id", id);

  if (error) throw error;
}

// =====================================================
// MATCHING RULES FUNCTIONS
// =====================================================

export async function createMatchingRule(
  rule: Omit<MatchingRule, "id" | "created_at" | "updated_at"> & { company_id?: string }
): Promise<MatchingRule> {
  const { data: { user } } = await supabase.auth.getUser();

  // Get company_id from user profile
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("company_id")
    .eq("id", user?.id || "")
    .single();

  const companyId = profile?.company_id || rule.company_id;

  if (!companyId) {
    throw new Error("Company ID is required");
  }

  const { data, error } = await supabase
    .from("matching_rules")
    .insert([
      {
        ...rule,
        company_id: companyId,
        created_by: user?.id,
      },
    ])
    .select()
    .single();

  if (error) throw error;
  return data as MatchingRule;
}

export async function fetchMatchingRules(
  companyId?: string,
  filters?: {
    targetEntityType?: TargetEntityType;
    isActive?: boolean;
    autoApply?: boolean;
    ruleType?: AutomationRuleType;
  }
): Promise<MatchingRule[]> {
  let query = supabase
    .from("matching_rules")
    .select("*");

  if (companyId) {
    query = query.eq("company_id", companyId);
  } else {
    // If no company_id provided, use current user's company
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("company_id")
      .eq("id", (await supabase.auth.getUser()).data.user?.id || "")
      .single();
    
    if (profile) {
      query = query.eq("company_id", profile.company_id);
    }
  }

  if (filters?.targetEntityType) {
    query = query.eq("target_entity_type", filters.targetEntityType);
  }

  if (filters?.isActive !== undefined) {
    query = query.eq("is_active", filters.isActive);
  }

  if (filters?.autoApply !== undefined) {
    query = query.eq("auto_apply", filters.autoApply);
  }

  if (filters?.ruleType) {
    query = query.eq("rule_type", filters.ruleType);
  }

  const { data, error } = await query.order("priority", { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function updateMatchingRule(id: string, updates: Partial<MatchingRule>): Promise<MatchingRule> {
  const { data, error } = await supabase
    .from("matching_rules")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data as MatchingRule;
}

export async function deleteMatchingRule(id: string): Promise<void> {
  const { error } = await supabase
    .from("matching_rules")
    .update({ is_active: false })
    .eq("id", id);

  if (error) throw error;
}

// =====================================================
// CORE AUTOMATION FUNCTIONS
// =====================================================

/**
 * Classify a transaction based on classification rules
 */
export async function classifyTransaction(
  transaction: TransactionForClassification,
  companyId: string
): Promise<ClassificationResult | null> {
  try {
    const { data, error } = await supabase
      .rpc("classify_transaction", {
        p_company_id: companyId,
        p_description: transaction.description,
        p_amount: transaction.amount,
        p_transaction_type: transaction.transaction_type || "all",
        p_transaction_date: transaction.transaction_date || new Date().toISOString().split("T")[0],
      });

    if (error) throw error;
    
    if (data && data.length > 0) {
      return data[0] as ClassificationResult;
    }
    
    return null;
  } catch (error) {
    console.error("Error classifying transaction:", error);
    return null;
  }
}

/**
 * Find matching entities for a transaction
 */
export async function matchTransaction(
  transaction: TransactionForMatching,
  companyId: string
): Promise<MatchingResult[]> {
  try {
    const { data, error } = await supabase
      .rpc("match_transaction", {
        p_company_id: companyId,
        p_description: transaction.description,
        p_amount: transaction.amount,
        p_transaction_date: transaction.transaction_date || new Date().toISOString().split("T")[0],
        p_reference_number: transaction.reference_number,
        p_entity_type: transaction.target_entity_type,
      });

    if (error) throw error;
    
    return data || [];
  } catch (error) {
    console.error("Error matching transaction:", error);
    return [];
  }
}

/**
 * Calculate confidence score for a transaction
 */
export async function getConfidenceScore(
  transaction: TransactionForClassification | TransactionForMatching,
  companyId: string
): Promise<number> {
  try {
    const { data, error } = await supabase
      .rpc("get_confidence_score", {
        p_company_id: companyId,
        p_description: transaction.description,
        p_amount: transaction.amount,
        p_transaction_type: transaction.transaction_type || "all",
        p_reference_number: transaction.reference_number,
        p_existing_matches: JSON.stringify(transaction.existing_matches || []),
      });

    if (error) throw error;
    
    return Number(data) || 0.50;
  } catch (error) {
    console.error("Error calculating confidence score:", error);
    return 0.50; // Default confidence score
  }
}

/**
 * Batch classify multiple transactions
 */
export async function batchClassifyTransactions(
  transactions: TransactionForClassification[],
  companyId: string
): Promise<Array<{ transaction: TransactionForClassification; classification: ClassificationResult | null }>> {
  const results = [];
  
  for (const transaction of transactions) {
    try {
      const classification = await classifyTransaction(transaction, companyId);
      results.push({ transaction, classification });
    } catch (error) {
      console.error(`Error classifying transaction: ${transaction.description}`, error);
      results.push({ transaction, classification: null });
    }
  }
  
  return results;
}

/**
 * Batch match multiple transactions
 */
export async function batchMatchTransactions(
  transactions: TransactionForMatching[],
  companyId: string
): Promise<Array<{ transaction: TransactionForMatching; matches: MatchingResult[] }>> {
  const results = [];
  
  for (const transaction of transactions) {
    try {
      const matches = await matchTransaction(transaction, companyId);
      results.push({ transaction, matches });
    } catch (error) {
      console.error(`Error matching transaction: ${transaction.description}`, error);
      results.push({ transaction, matches: [] });
    }
  }
  
  return results;
}

/**
 * Get confidence score breakdown for analysis
 */
export async function getConfidenceScoreBreakdown(
  transaction: TransactionForClassification | TransactionForMatching,
  companyId: string
): Promise<ConfidenceScoreBreakdown> {
  try {
    // This is a simplified breakdown - in a full implementation, we would
    // calculate each component separately
    
    const baseScore = transaction.description ? 0.60 : 0.50;
    const patternScore = await getPatternMatchingScore(transaction, companyId);
    const amountScore = transaction.amount && transaction.amount === Math.round(transaction.amount) ? 0.20 : 0.10;
    const referenceScore = transaction.reference_number && transaction.reference_number.length > 3 ? 0.15 : 0;
    const existingMatches = (transaction as any).existing_matches || [];
    const existingScore = existingMatches.length * 0.05;
    const existingScoreCapped = Math.min(existingScore, 0.25);
    
    const finalScore = Math.min(baseScore + patternScore + amountScore + referenceScore + existingScoreCapped, 1.00);
    
    return {
      base_score: baseScore,
      pattern_score: patternScore,
      amount_score: amountScore,
      reference_score: referenceScore,
      existing_score: existingScoreCapped,
      final_score: finalScore,
    };
  } catch (error) {
    console.error("Error calculating confidence score breakdown:", error);
    return {
      base_score: 0.50,
      pattern_score: 0,
      amount_score: 0,
      reference_score: 0,
      existing_score: 0,
      final_score: 0.50,
    };
  }
}

// =====================================================
// HELPER FUNCTIONS
// =====================================================

/**
 * Get pattern matching score for a transaction
 */
async function getPatternMatchingScore(
  transaction: TransactionForClassification | TransactionForMatching,
  companyId: string
): Promise<number> {
  try {
    const { data, error } = await supabase
      .from("v_active_classification_rules")
      .select("confidence_score")
      .eq("company_id", companyId)
      .limit(1);

    if (error) throw error;
    
    // Check if transaction matches any pattern
    const hasPatternMatch = await checkPatternMatch(transaction, companyId);
    
    return hasPatternMatch && data && data.length > 0 ? data[0].confidence_score : 0;
  } catch (error) {
    console.error("Error getting pattern matching score:", error);
    return 0;
  }
}

/**
 * Check if transaction matches any pattern
 */
async function checkPatternMatch(
  transaction: TransactionForClassification | TransactionForMatching,
  companyId: string
): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from("v_active_classification_rules")
      .select("pattern, pattern_type")
      .eq("company_id", companyId)
      .limit(10);

    if (error) throw error;
    
    if (!data || data.length === 0) return false;
    
    const description = transaction.description || "";
    
    // Check if any pattern matches
    for (const rule of data) {
      if (rule.pattern_type === "text") {
        if (description.toLowerCase().includes(rule.pattern.toLowerCase()) ||
            description.toLowerCase().startsWith(rule.pattern.toLowerCase()) ||
            description.toLowerCase().endsWith(rule.pattern.toLowerCase()) ||
            description.toLowerCase() === rule.pattern.toLowerCase()) {
          return true;
        }
      } else if (rule.pattern_type === "exact") {
        if (description === rule.pattern) {
          return true;
        }
      }
      // Note: regex matching would require more complex implementation
    }
    
    return false;
  } catch (error) {
    console.error("Error checking pattern match:", error);
    return false;
  }
}

/**
 * Test a classification pattern against text
 */
export function testPattern(pattern: string, text: string, patternType: PatternType = "text"): boolean {
  switch (patternType) {
    case "text":
      return text.toLowerCase().includes(pattern.toLowerCase()) ||
             text.toLowerCase().startsWith(pattern.toLowerCase()) ||
             text.toLowerCase().endsWith(pattern.toLowerCase());
    case "exact":
      return text === pattern;
    case "regex":
      try {
        const regex = new RegExp(pattern, "i");
        return regex.test(text);
      } catch {
        return false;
      }
    default:
      return false;
  }
}

/**
 * Create a simple classification rule
 */
export function createSimpleClassificationRule(
  companyId: string,
  name: string,
  pattern: string,
  category: string,
  options: {
    description?: string;
    subcategory?: string;
    confidenceScore?: number;
    transactionType?: RuleType;
    amountMin?: number;
    amountMax?: number;
    priority?: number;
    descriptionContains?: string;
    descriptionNotContains?: string;
  } = {}
): Promise<ClassificationRule> {
  return createClassificationRule({
    company_id: companyId,
    name,
    description: options.description,
    pattern,
    pattern_type: "text",
    category,
    subcategory: options.subcategory,
    confidence_score: options.confidenceScore || 0.50,
    transaction_type: options.transactionType || "all",
    amount_min: options.amountMin,
    amount_max: options.amountMax,
    description_contains: options.descriptionContains,
    description_not_contains: options.descriptionNotContains,
    priority: options.priority || 100,
    is_active: true,
  });
}

/**
 * Create a simple matching rule
 */
export function createSimpleMatchingRule(
  companyId: string,
  name: string,
  targetEntityType: TargetEntityType,
  targetValue: string,
  options: {
    description?: string;
    targetField?: string;
    matchOperator?: MatchOperator;
    confidenceScore?: number;
    priority?: number;
    autoApply?: boolean;
    conditions?: Record<string, any>;
  } = {}
): Promise<MatchingRule> {
  return createMatchingRule({
    company_id: companyId,
    name,
    description: options.description,
    rule_type: "exact_match",
    conditions_json: options.conditions || {},
    target_entity_type: targetEntityType,
    target_field: options.targetField || "description",
    target_value: targetValue,
    match_operator: options.matchOperator || "contains",
    confidence_score: options.confidenceScore || 0.50,
    priority: options.priority || 100,
    auto_apply: options.autoApply || false,
    is_active: true,
  });
}

/**
 * Format confidence score as percentage
 */
export function formatConfidenceScore(score: number): string {
  return `${Math.round(score * 100)}%`;
}

/**
 * Get automation statistics for a company
 */
export async function getAutomationStats(companyId: string): Promise<{
  classificationRules: {
    total: number;
    active: number;
    byCategory: Record<string, number>;
  };
  matchingRules: {
    total: number;
    active: number;
    autoApply: number;
    byEntityType: Record<string, number>;
  };
  recentClassifications: number;
  recentMatches: number;
}> {
  try {
    // Get classification rules stats
    const { data: classRules } = await supabase
      .from("classification_rules")
      .select("category, is_active")
      .eq("company_id", companyId);

    const classificationStats = {
      total: classRules?.length || 0,
      active: classRules?.filter(rule => rule.is_active).length || 0,
      byCategory: classRules?.reduce((acc, rule) => {
        const category = rule.category || 'uncategorized';
        acc[category] = (acc[category] || 0) + 1;
        return acc;
      }, {} as Record<string, number>) || {},
    };

    // Get matching rules stats
    const { data: matchRules } = await supabase
      .from("matching_rules")
      .select("target_entity_type, is_active, auto_apply")
      .eq("company_id", companyId);

    const matchingStats = {
      total: matchRules?.length || 0,
      active: matchRules?.filter(rule => rule.is_active).length || 0,
      autoApply: matchRules?.filter(rule => rule.auto_apply).length || 0,
      byEntityType: matchRules?.reduce((acc, rule) => {
        const entityType = rule.target_entity_type || 'unknown';
        acc[entityType] = (acc[entityType] || 0) + 1;
        return acc;
      }, {} as Record<string, number>) || {},
    };

    // Get recent activity (this would require additional tables in a full implementation)
    const recentClassifications = 0;
    const recentMatches = 0;

    return {
      classificationRules: classificationStats,
      matchingRules: matchingStats,
      recentClassifications,
      recentMatches,
    };
  } catch (error) {
    console.error("Error getting automation stats:", error);
    return {
      classificationRules: { total: 0, active: 0, byCategory: {} },
      matchingRules: { total: 0, active: 0, autoApply: 0, byEntityType: {} },
      recentClassifications: 0,
      recentMatches: 0,
    };
  }
}
