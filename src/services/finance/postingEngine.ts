import { supabase } from "../../lib/supabase";

// =====================================================
// POSTING ENGINE TYPES
// =====================================================

export type SourceType = 
  | "manual"           // Manual journal entry
  | "client_payment"   // From client_payments table
  | "supplier_payment" // From supplier_payments table  
  | "expense"          // From expenses table
  | "payroll"          // From payroll_entries table
  | "invoice"          // From client_invoices table
  | "procurement"      // From procurements table
  | "bank_transfer"    // Bank transfers
  | "adjustment"       // Period adjustments
  | "opening_balance"; // Initial setup

export interface PostingRule {
  id: string;
  company_id: string;
  source_type: SourceType;
  debit_account_id: string;
  credit_account_id: string;
  conditions_json: Record<string, any>;
  is_active: boolean;
  description?: string;
  priority: number;
  created_at: string;
  updated_at: string;
  created_by?: string;
}

export interface PostingRuleWithAccounts extends PostingRule {
  debit_account_code: string;
  debit_account_name: string;
  debit_account_type: string;
  credit_account_code: string;
  credit_account_name: string;
  credit_account_type: string;
}

export interface JournalEntry {
  account_id: string;
  debit?: number;
  credit?: number;
  description?: string;
  project_id?: string;
}

export interface CreateTransactionRequest {
  transaction_date: string;
  source_type: SourceType;
  source_id?: string;
  description: string;
  entries: JournalEntry[];
  reference?: string;
  notes?: string;
  conditions?: Record<string, any>; // For rule matching
}

export interface PostingResult {
  success: boolean;
  transactionId?: string;
  transactionNumber?: string;
  error?: string;
  entries?: any[];
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  totalDebit: number;
  totalCredit: number;
}

// =====================================================
// POSTING RULES FUNCTIONS
// =====================================================

export async function fetchPostingRules(
  companyId: string, 
  sourceType?: SourceType
): Promise<PostingRuleWithAccounts[]> {
  let query = supabase
    .from("v_posting_rules_with_accounts")
    .select("*")
    .eq("company_id", companyId)
    .eq("is_active", true);

  if (sourceType) {
    query = query.eq("source_type", sourceType);
  }

  const { data, error } = await query.order("priority", { ascending: true });

  if (error) throw error;
  return data || [];
}

export async function createPostingRule(rule: Omit<PostingRule, "id" | "created_at" | "updated_at">): Promise<PostingRule> {
  const { data: { user } } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from("posting_rules")
    .insert([
      {
        ...rule,
        created_by: user?.id,
      },
    ])
    .select()
    .single();

  if (error) throw error;
  return data as PostingRule;
}

export async function updatePostingRule(id: string, updates: Partial<PostingRule>): Promise<PostingRule> {
  const { data, error } = await supabase
    .from("posting_rules")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data as PostingRule;
}

export async function deactivatePostingRule(id: string): Promise<void> {
  const { error } = await supabase
    .from("posting_rules")
    .update({ is_active: false })
    .eq("id", id);

  if (error) throw error;
}

// =====================================================
// POSTING ENGINE CORE FUNCTIONS
// =====================================================

/**
 * Validates that journal entries are balanced and properly formatted
 */
export function validateBalancedEntries(entries: JournalEntry[]): ValidationResult {
  const errors: string[] = [];
  let totalDebit = 0;
  let totalCredit = 0;

  // Validate each entry
  entries.forEach((entry, index) => {
    if (!entry.account_id) {
      errors.push(`Entry ${index + 1}: Account ID is required`);
    }

    const hasDebit = entry.debit && entry.debit > 0;
    const hasCredit = entry.credit && entry.credit > 0;

    if (!hasDebit && !hasCredit) {
      errors.push(`Entry ${index + 1}: Either debit or credit must be specified and greater than 0`);
    }

    if (hasDebit && hasCredit) {
      errors.push(`Entry ${index + 1}: Cannot specify both debit and credit`);
    }

    if (hasDebit) {
      totalDebit += entry.debit!;
    }

    if (hasCredit) {
      totalCredit += entry.credit!;
    }
  });

  // Check balance
  const balanceDiff = Math.abs(totalDebit - totalCredit);
  if (balanceDiff > 0.01) { // Allow small floating point differences
    errors.push(`Entries are not balanced: Debits (${totalDebit.toFixed(2)}) != Credits (${totalCredit.toFixed(2)})`);
  }

  return {
    valid: errors.length === 0,
    errors,
    totalDebit,
    totalCredit,
  };
}

/**
 * Creates a GL transaction with proper validation
 */
export async function createGLTransaction(
  request: CreateTransactionRequest,
  companyId: string
): Promise<PostingResult> {
  try {
    // Validate entries first
    const validation = validateBalancedEntries(request.entries);
    if (!validation.valid) {
      return {
        success: false,
        error: `Validation failed: ${validation.errors.join(", ")}`,
      };
    }

    // Generate transaction number
    const transactionNumber = await generateTransactionNumber(companyId);

    // Create transaction header
    const { data: transaction, error: transactionError } = await supabase
      .from("gl_transactions")
      .insert([
        {
          company_id: companyId,
          transaction_number: transactionNumber,
          transaction_date: request.transaction_date,
          reference: request.reference,
          source_type: request.source_type,
          source_id: request.source_id,
          description: request.description,
          total_amount: validation.totalDebit, // Use total debit as amount
          status: "draft",
          notes: request.notes,
        },
      ])
      .select()
      .single();

    if (transactionError) throw transactionError;
    if (!transaction) throw new Error("Failed to create transaction");

    // Create entries
    const glEntries = request.entries.map((entry, index) => ({
      transaction_id: transaction.id,
      company_id: companyId,
      account_id: entry.account_id,
      debit: entry.debit || 0,
      credit: entry.credit || 0,
      project_id: entry.project_id,
      description: entry.description,
      line_number: index + 1,
      entry_type: "regular",
    }));

    const { data: entries, error: entriesError } = await supabase
      .from("gl_entries")
      .insert(glEntries)
      .select();

    if (entriesError) throw entriesError;

    return {
      success: true,
      transactionId: transaction.id,
      transactionNumber: transaction.transaction_number,
      entries,
    };
  } catch (error) {
    console.error("Error creating GL transaction:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred",
    };
  }
}

/**
 * Posts a transaction with full data to the ledger (changes status from draft to posted)
 */
export async function postTransactionWithData(params: {
  source_type: string;
  source_id: string;
  company_id: string;
  transaction_date: string;
  description: string;
  amount: number;
  debit_account_id: string;
  credit_account_id: string;
  project_id?: string | null;
  notes?: string;
}): Promise<PostingResult> {
  try {
    // Create GL transaction header
    const { data: glTxn, error: glError } = await supabase
      .from("gl_transactions")
      .insert({
        company_id: params.company_id,
        transaction_number: `TXN_${Date.now()}`,
        transaction_date: params.transaction_date,
        reference: params.source_type,
        source_id: params.source_id,
        status: "posted",
        posted_by: (await supabase.auth.getUser()).data?.user?.id,
        posted_at: new Date().toISOString(),
        notes: params.notes,
      })
      .select()
      .single();

    if (glError) throw glError;
    if (!glTxn) throw new Error("Failed to create GL transaction");

    // Create journal entries
    const entries = [
      {
        account_id: params.debit_account_id,
        debit: params.amount,
        description: params.description,
        project_id: params.project_id,
      },
      {
        account_id: params.credit_account_id,
        credit: params.amount,
        description: params.description,
        project_id: params.project_id,
      },
    ];

    // Insert journal entries
    const { error: entriesError } = await supabase
      .from("gl_entries")
      .insert(
        entries.map(entry => ({
          transaction_id: glTxn.id,
          company_id: params.company_id,
          account_id: entry.account_id,
          debit: entry.debit,
          credit: entry.credit,
          description: entry.description,
          project_id: entry.project_id,
        }))
      );

    if (entriesError) throw entriesError;

    return {
      success: true,
      transactionId: glTxn.id,
      transactionNumber: glTxn.transaction_number,
    };
  } catch (error) {
    console.error("Error posting transaction:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred",
    };
  }
}

/**
 * Posts a transaction to the ledger (changes status from draft to posted)
 */
export async function postTransaction(transactionId: string): Promise<PostingResult> {
  try {
    // First validate the transaction can be posted
    const validation = await validateTransactionForPosting(transactionId);
    if (!validation.valid) {
      return {
        success: false,
        error: `Cannot post transaction: ${validation.errors.join(", ")}`,
      };
    }

    const { data: { user } } = await supabase.auth.getUser();

    // Update transaction status to posted
    const { data, error } = await supabase
      .from("gl_transactions")
      .update({
        status: "posted",
        posted_by: user?.id,
        posted_at: new Date().toISOString(),
      })
      .eq("id", transactionId)
      .select()
      .single();

    if (error) throw error;
    if (!data) throw new Error("Failed to post transaction");

    return {
      success: true,
      transactionId: data.id,
      transactionNumber: data.transaction_number,
    };
  } catch (error) {
    console.error("Error posting transaction:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred",
    };
  }
}

/**
 * Finds the best matching posting rule for a given source type and conditions
 */
export async function findMatchingPostingRule(
  companyId: string,
  sourceType: SourceType,
  conditions: Record<string, any> = {}
): Promise<PostingRuleWithAccounts | null> {
  const rules = await fetchPostingRules(companyId, sourceType);

  for (const rule of rules) {
    if (matchesConditions(rule.conditions_json, conditions)) {
      return rule;
    }
  }

  return null;
}

/**
 * Creates a transaction automatically based on posting rules
 */
export async function createTransactionFromRule(
  sourceType: SourceType,
  sourceId: string,
  amount: number,
  description: string,
  companyId: string,
  conditions: Record<string, any> = {},
  additionalOptions: {
    transaction_date?: string;
    reference?: string;
    notes?: string;
    project_id?: string;
  } = {}
): Promise<PostingResult> {
  try {
    // Find matching posting rule
    const rule = await findMatchingPostingRule(companyId, sourceType, conditions);
    if (!rule) {
      return {
        success: false,
        error: `No posting rule found for source type: ${sourceType}`,
      };
    }

    // Create journal entries based on rule
    const entries: JournalEntry[] = [
      {
        account_id: rule.debit_account_id,
        debit: amount,
        description: `${description} (Debit)`,
        project_id: additionalOptions.project_id,
      },
      {
        account_id: rule.credit_account_id,
        credit: amount,
        description: `${description} (Credit)`,
        project_id: additionalOptions.project_id,
      },
    ];

    // Create transaction
    return await createGLTransaction(
      {
        transaction_date: additionalOptions.transaction_date || new Date().toISOString().split("T")[0],
        source_type: sourceType,
        source_id: sourceId,
        description,
        entries,
        reference: additionalOptions.reference,
        notes: additionalOptions.notes,
        conditions,
      },
      companyId
    );
  } catch (error) {
    console.error("Error creating transaction from rule:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred",
    };
  }
}

// =====================================================
// HELPER FUNCTIONS
// =====================================================

/**
 * Generates a unique transaction number for a company
 */
async function generateTransactionNumber(companyId: string): Promise<string> {
  // Format: GL-YYYY-MM-NNNN
  const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  const prefix = `GL-${date}`;
  
  // Get the next sequence number for today
  const { data, error } = await supabase
    .from("gl_transactions")
    .select("transaction_number")
    .eq("company_id", companyId)
    .like("transaction_number", `${prefix}%`)
    .order("transaction_number", { ascending: false })
    .limit(1);

  if (error) throw error;

  let sequence = 1;
  if (data && data.length > 0) {
    const lastNumber = data[0].transaction_number;
    const lastSequence = parseInt(lastNumber.split('-').pop() || "0");
    sequence = lastSequence + 1;
  }

  return `${prefix}-${sequence.toString().padStart(4, '0')}`;
}

/**
 * Validates that a transaction can be posted
 */
async function validateTransactionForPosting(transactionId: string): Promise<ValidationResult> {
  const errors: string[] = [];

  // Get transaction details
  const { data: transaction, error: transactionError } = await supabase
    .from("gl_transactions")
    .select("*")
    .eq("id", transactionId)
    .single();

  if (transactionError || !transaction) {
    errors.push("Transaction not found");
    return { valid: false, errors, totalDebit: 0, totalCredit: 0 };
  }

  // Check status
  if (transaction.status !== "draft") {
    errors.push("Transaction is not in draft status");
  }

  // Get entries
  const { data: entries, error: entriesError } = await supabase
    .from("gl_entries")
    .select("*")
    .eq("transaction_id", transactionId)
    .order("line_number", { ascending: true });

  if (entriesError) {
    errors.push("Failed to fetch transaction entries");
    return { valid: false, errors, totalDebit: 0, totalCredit: 0 };
  }

  if (!entries || entries.length < 2) {
    errors.push("Transaction must have at least 2 entries");
  }

  // Validate entries
  let hasDebit = false;
  let hasCredit = false;
  let totalDebit = 0;
  let totalCredit = 0;

  for (const entry of entries) {
    if (entry.debit > 0) hasDebit = true;
    if (entry.credit > 0) hasCredit = true;
    totalDebit += entry.debit;
    totalCredit += entry.credit;

    // Check if account exists and is active
    const { data: account } = await supabase
      .from("chart_of_accounts")
      .select("is_active")
      .eq("id", entry.account_id)
      .eq("company_id", transaction.company_id)
      .single();

    if (!account) {
      errors.push(`Account ${entry.account_id} not found`);
    } else if (!account.is_active) {
      errors.push(`Account ${entry.account_id} is not active`);
    }
  }

  if (!hasDebit || !hasCredit) {
    errors.push("Transaction must have both debits and credits");
  }

  // Check balance
  const balanceDiff = Math.abs(totalDebit - totalCredit);
  if (balanceDiff > 0.01) {
    errors.push(`Entries are not balanced: Debits (${totalDebit.toFixed(2)}) != Credits (${totalCredit.toFixed(2)})`);
  }

  return {
    valid: errors.length === 0,
    errors,
    totalDebit,
    totalCredit,
  };
}

/**
 * Checks if conditions match the rule conditions
 */
function matchesConditions(ruleConditions: Record<string, any>, inputConditions: Record<string, any>): boolean {
  // If no conditions in rule, it matches everything
  if (Object.keys(ruleConditions).length === 0) {
    return true;
  }

  // Check each condition
  for (const [key, ruleValue] of Object.entries(ruleConditions)) {
    const inputValue = inputConditions[key];

    // If input doesn't have this condition, it doesn't match
    if (inputValue === undefined) {
      return false;
    }

    // Handle different types of conditions
    if (typeof ruleValue === "string" && typeof inputValue === "string") {
      // Exact string match
      if (ruleValue !== inputValue) {
        return false;
      }
    } else if (typeof ruleValue === "object" && ruleValue !== null) {
      // Handle complex conditions (e.g., ranges, arrays)
      if (!matchesComplexCondition(ruleValue, inputValue)) {
        return false;
      }
    } else {
      // Simple equality check
      if (ruleValue !== inputValue) {
        return false;
      }
    }
  }

  return true;
}

/**
 * Handles complex condition matching (ranges, arrays, etc.)
 */
function matchesComplexCondition(ruleValue: any, inputValue: any): boolean {
  // Handle array conditions (match if input is in array)
  if (Array.isArray(ruleValue)) {
    return ruleValue.includes(inputValue);
  }

  // Handle range conditions
  if (typeof ruleValue === "object" && ruleValue.min !== undefined && ruleValue.max !== undefined) {
    return inputValue >= ruleValue.min && inputValue <= ruleValue.max;
  }

  // Handle regex conditions
  if (ruleValue.regex && typeof ruleValue.regex === "string") {
    const regex = new RegExp(ruleValue.regex);
    return regex.test(inputValue);
  }

  // Default to equality
  return ruleValue === inputValue;
}
