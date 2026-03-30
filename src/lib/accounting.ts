import { supabase } from "./supabase";

// =====================================================
// CHART OF ACCOUNTS TYPES
// =====================================================

export type AccountType = "asset" | "liability" | "equity" | "revenue" | "expense";

export type AccountSubtype = 
  // Asset subtypes
  | "current_asset" | "fixed_asset" | "bank" | "accounts_receivable" | "inventory" | "prepaid_expense"
  // Liability subtypes  
  | "current_liability" | "long_term_liability" | "accounts_payable" | "accrued_expense" | "deferred_revenue"
  // Equity subtypes
  | "owner_equity" | "retained_earnings" | "common_stock" | "additional_paid_in_capital"
  // Revenue subtypes
  | "service_revenue" | "product_revenue" | "other_revenue"
  // Expense subtypes
  | "operating_expense" | "cost_of_goods_sold" | "selling_expense" | "administrative_expense" | "payroll_expense" | "other_expense";

export interface ChartOfAccount {
  id: string;
  company_id: string;
  code: string;
  name: string;
  type: AccountType;
  subtype?: AccountSubtype;
  is_project_linkable: boolean;
  is_owner_private: boolean;
  is_active: boolean;
  parent_id?: string;
  level: number;
  opening_balance: number;
  current_balance: number;
  description?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
  created_by?: string;
}

export interface AccountHierarchy extends ChartOfAccount {
  path: string[];
  id_path: string[];
  children?: AccountHierarchy[];
}

// =====================================================
// GENERAL LEDGER TYPES
// =====================================================

export type TransactionSourceType = 
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

export type TransactionStatus = "draft" | "posted" | "voided";

export type EntryType = "regular" | "adjustment" | "reclassification" | "opening_balance";

export interface GLTransaction {
  id: string;
  company_id: string;
  transaction_number: string;
  transaction_date: string;
  reference?: string;
  source_type: TransactionSourceType;
  source_id?: string;
  description: string;
  total_amount: number;
  currency: string;
  status: TransactionStatus;
  approved_by?: string;
  approved_at?: string;
  posted_by?: string;
  posted_at?: string;
  notes?: string;
  attachments?: any[];
  created_at: string;
  updated_at: string;
  created_by?: string;
}

export interface GLEntry {
  id: string;
  transaction_id: string;
  company_id: string;
  account_id: string;
  debit: number;
  credit: number;
  project_id?: string;
  description?: string;
  line_number: number;
  entry_type?: EntryType;
  reconciled: boolean;
  reconciled_date?: string;
  reconciled_by?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface GLEntryWithDetails extends GLEntry {
  account_code: string;
  account_name: string;
  account_type: AccountType;
  account_subtype?: AccountSubtype;
  project_name?: string;
  transaction_date: string;
  transaction_number: string;
  source_type: TransactionSourceType;
  source_id?: string;
}

export interface AccountBalance {
  id: string;
  company_id: string;
  code: string;
  name: string;
  type: AccountType;
  subtype?: AccountSubtype;
  current_balance: number;
  opening_balance: number;
  is_project_linkable: boolean;
  is_owner_private: boolean;
  parent_id?: string;
  level: number;
  balance_30_days: number;
  balance_90_days: number;
}

// =====================================================
// JOURNAL ENTRY CREATION TYPES
// =====================================================

export interface JournalEntry {
  account_id: string;
  debit?: number;
  credit?: number;
  description?: string;
  project_id?: string;
}

export interface CreateGLTransaction {
  transaction_date: string;
  reference?: string;
  source_type: TransactionSourceType;
  source_id?: string;
  description: string;
  entries: JournalEntry[];
  notes?: string;
  attachments?: any[];
}

export interface TransactionValidationError {
  field: string;
  message: string;
}

// =====================================================
// CHART OF ACCOUNTS FUNCTIONS
// =====================================================

export async function fetchChartOfAccounts(companyId: string): Promise<ChartOfAccount[]> {
  const { data, error } = await supabase
    .from("chart_of_accounts")
    .select("*")
    .eq("company_id", companyId)
    .order("code", { ascending: true });

  if (error) throw error;
  return data || [];
}

export async function fetchAccountHierarchy(companyId: string): Promise<AccountHierarchy[]> {
  const { data, error } = await supabase
    .from("v_account_hierarchy")
    .select("*")
    .eq("company_id", companyId)
    .order("id_path", { ascending: true });

  if (error) throw error;
  return data || [];
}

export async function fetchProjectLinkableAccounts(companyId: string): Promise<ChartOfAccount[]> {
  const { data, error } = await supabase
    .from("v_project_linkable_accounts")
    .select("*")
    .eq("company_id", companyId)
    .order("code", { ascending: true });

  if (error) throw error;
  return data || [];
}

export async function fetchOwnerPrivateAccounts(companyId: string): Promise<ChartOfAccount[]> {
  const { data, error } = await supabase
    .from("v_owner_private_accounts")
    .select("*")
    .eq("company_id", companyId)
    .order("code", { ascending: true });

  if (error) throw error;
  return data || [];
}

export async function createChartOfAccount(account: Partial<ChartOfAccount>): Promise<ChartOfAccount> {
  const { data: { user } } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from("chart_of_accounts")
    .insert([
      {
        ...account,
        created_by: user?.id,
      },
    ])
    .select()
    .single();

  if (error) throw error;
  return data as ChartOfAccount;
}

export async function updateChartOfAccount(id: string, updates: Partial<ChartOfAccount>): Promise<ChartOfAccount> {
  const { data, error } = await supabase
    .from("chart_of_accounts")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data as ChartOfAccount;
}

export async function deactivateChartOfAccount(id: string): Promise<void> {
  const { error } = await supabase
    .from("chart_of_accounts")
    .update({ is_active: false })
    .eq("id", id);

  if (error) throw error;
}

// =====================================================
// GENERAL LEDGER FUNCTIONS
// =====================================================

export async function fetchGLTransactions(
  companyId: string, 
  options?: {
    startDate?: string;
    endDate?: string;
    status?: TransactionStatus;
    sourceType?: TransactionSourceType;
    projectId?: string;
  }
): Promise<GLTransaction[]> {
  let query = supabase
    .from("gl_transactions")
    .select("*")
    .eq("company_id", companyId);

  if (options?.startDate) query = query.gte("transaction_date", options.startDate);
  if (options?.endDate) query = query.lte("transaction_date", options.endDate);
  if (options?.status) query = query.eq("status", options.status);
  if (options?.sourceType) query = query.eq("source_type", options.sourceType);

  const { data, error } = await query.order("transaction_date", { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function fetchPostedGLTransactions(companyId: string): Promise<GLTransaction[]> {
  const { data, error } = await supabase
    .from("v_posted_gl_transactions")
    .select("*")
    .eq("company_id", companyId)
    .order("transaction_date", { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function fetchGLEntries(transactionId: string): Promise<GLEntryWithDetails[]> {
  const { data, error } = await supabase
    .from("v_posted_gl_entries")
    .select("*")
    .eq("transaction_id", transactionId)
    .order("line_number", { ascending: true });

  if (error) throw error;
  return data || [];
}

export async function fetchAccountBalances(companyId: string): Promise<AccountBalance[]> {
  const { data, error } = await supabase
    .from("v_account_balances")
    .select("*")
    .eq("company_id", companyId)
    .order("code", { ascending: true });

  if (error) throw error;
  return data || [];
}

export async function generateTransactionNumber(companyId: string): Promise<string> {
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

export async function createGLTransaction(
  transaction: CreateGLTransaction,
  companyId: string
): Promise<GLTransaction> {
  const { data: { user } } = await supabase.auth.getUser();
  
  // Validate transaction
  const errors = validateJournalEntry(transaction);
  if (errors.length > 0) {
    throw new Error(`Transaction validation failed: ${errors.map(e => e.message).join(", ")}`);
  }

  // Generate transaction number
  const transactionNumber = await generateTransactionNumber(companyId);
  
  // Calculate total amount
  const totalDebit = transaction.entries.reduce((sum, entry) => sum + (entry.debit || 0), 0);
  const totalCredit = transaction.entries.reduce((sum, entry) => sum + (entry.credit || 0), 0);
  const totalAmount = Math.max(totalDebit, totalCredit);

  // Create transaction header
  const { data: transactionData, error: transactionError } = await supabase
    .from("gl_transactions")
    .insert([
      {
        company_id: companyId,
        transaction_number: transactionNumber,
        transaction_date: transaction.transaction_date,
        reference: transaction.reference,
        source_type: transaction.source_type,
        source_id: transaction.source_id,
        description: transaction.description,
        total_amount: totalAmount,
        status: "draft",
        notes: transaction.notes,
        attachments: transaction.attachments,
        created_by: user?.id,
      },
    ])
    .select()
    .single();

  if (transactionError) throw transactionError;
  if (!transactionData) throw new Error("Failed to create transaction");

  // Create entries
  const entries = transaction.entries.map((entry, index) => ({
    transaction_id: transactionData.id,
    company_id: companyId,
    account_id: entry.account_id,
    debit: entry.debit || 0,
    credit: entry.credit || 0,
    project_id: entry.project_id,
    description: entry.description,
    line_number: index + 1,
    entry_type: "regular" as EntryType,
  }));

  const { error: entriesError } = await supabase
    .from("gl_entries")
    .insert(entries);

  if (entriesError) throw entriesError;

  return transactionData as GLTransaction;
}

export async function postGLTransaction(transactionId: string): Promise<GLTransaction> {
  const { data: { user } } = await supabase.auth.getUser();

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
  return data as GLTransaction;
}

export async function voidGLTransaction(transactionId: string, reason: string): Promise<GLTransaction> {
  const { data: { user } } = await supabase.auth.getUser();

  // Create voiding entry (reversal)
  const originalTransaction = await fetchGLTransactions("", { 
    status: "posted" 
  }).then(transactions => transactions.find(t => t.id === transactionId));

  if (!originalTransaction) {
    throw new Error("Original transaction not found");
  }

  const originalEntries = await fetchGLEntries(transactionId);
  
  // Create reversal transaction
  const reversalTransaction: CreateGLTransaction = {
    transaction_date: new Date().toISOString().split('T')[0],
    reference: `VOID: ${originalTransaction.transaction_number}`,
    source_type: "adjustment",
    description: `Voiding transaction: ${originalTransaction.description}`,
    entries: originalEntries.map(entry => ({
      account_id: entry.account_id,
      debit: entry.credit, // Reverse the credit
      credit: entry.debit, // Reverse the debit
      description: `Reversal: ${entry.description}`,
      project_id: entry.project_id,
    })),
    notes: `Voided on ${new Date().toISOString()}. Reason: ${reason}`,
  };

  const reversal = await createGLTransaction(reversalTransaction, originalTransaction.company_id);
  await postGLTransaction(reversal.id);

  // Mark original as voided
  const { data, error } = await supabase
    .from("gl_transactions")
    .update({
      status: "voided",
      notes: `Voided on ${new Date().toISOString()}. Reason: ${reason}`,
    })
    .eq("id", transactionId)
    .select()
    .single();

  if (error) throw error;
  return data as GLTransaction;
}

// =====================================================
// VALIDATION FUNCTIONS
// =====================================================

export function validateJournalEntry(transaction: CreateGLTransaction): TransactionValidationError[] {
  const errors: TransactionValidationError[] = [];

  // Validate entries
  if (!transaction.entries || transaction.entries.length < 2) {
    errors.push({ field: "entries", message: "Transaction must have at least 2 entries" });
  }

  const totalDebit = transaction.entries.reduce((sum, entry) => sum + (entry.debit || 0), 0);
  const totalCredit = transaction.entries.reduce((sum, entry) => sum + (entry.credit || 0), 0);

  if (Math.abs(totalDebit - totalCredit) > 0.01) {
    errors.push({ 
      field: "balance", 
      message: `Debits (${totalDebit}) must equal credits (${totalCredit})` 
    });
  }

  // Validate each entry
  transaction.entries.forEach((entry, index) => {
    if (!entry.account_id) {
      errors.push({ field: `entries[${index}].account_id`, message: "Account ID is required" });
    }

    if (!entry.debit && !entry.credit) {
      errors.push({ field: `entries[${index}].amount`, message: "Either debit or credit must be specified" });
    }

    if (entry.debit && entry.credit) {
      errors.push({ field: `entries[${index}].amount`, message: "Cannot specify both debit and credit" });
    }

    if (entry.debit && entry.debit < 0) {
      errors.push({ field: `entries[${index}].debit`, message: "Debit must be positive" });
    }

    if (entry.credit && entry.credit < 0) {
      errors.push({ field: `entries[${index}].credit`, message: "Credit must be positive" });
    }
  });

  return errors;
}

// =====================================================
// UTILITY FUNCTIONS
// =====================================================

export function getAccountTypeNormalBalance(type: AccountType): "debit" | "credit" {
  switch (type) {
    case "asset":
    case "expense":
      return "debit";
    case "liability":
    case "equity":
    case "revenue":
      return "credit";
    default:
      return "debit";
  }
}

export function formatCurrency(amount: number, currency: string = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(amount);
}

export function generateAccountCode(parentCode?: string, sequence?: number): string {
  if (parentCode) {
    return `${parentCode}${sequence?.toString().padStart(2, '0') || '01'}`;
  }
  return sequence?.toString().padStart(4, '0') || '0001';
}
