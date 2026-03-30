import { supabase } from "../../lib/supabase";

// =====================================================
// BANK PARSER TYPES
// =====================================================

export type ParseStatus = "pending" | "processing" | "completed" | "failed" | "skipped";
export type MatchStatus = "unmatched" | "matched" | "reconciled" | "disputed";
export type MatchType = "manual" | "auto_invoice" | "auto_expense" | "auto_payroll" | "auto_payment" | "auto_transfer" | "rule_based";
export type MatchedEntityType = "client_invoice" | "supplier_invoice" | "expense" | "payroll_entry" | "client_payment" | "supplier_payment" | "gl_transaction" | "bank_transfer";
export type TransactionType = "credit" | "debit" | "transfer_in" | "transfer_out";
export type ValidationStatus = "pending" | "validated" | "flagged" | "error";

export interface BankStatement {
  id: string;
  bank_account_id: string;
  company_id: string;
  statement_date: string;
  statement_period?: string;
  statement_number?: string;
  file_url: string;
  file_name: string;
  file_size: number;
  file_type: string;
  file_hash: string;
  parse_status: ParseStatus;
  parse_error?: string;
  parse_started_at?: string;
  parse_completed_at?: string;
  transaction_count: number;
  matched_count: number;
  unmatched_count: number;
  reconciled: boolean;
  reconciled_by?: string;
  reconciled_at?: string;
  reconciliation_notes?: string;
  uploaded_by?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface BankTransaction {
  id: string;
  bank_account_id: string;
  company_id: string;
  statement_id?: string;
  transaction_date: string;
  description: string;
  amount: number;
  balance_after?: number;
  transaction_type?: TransactionType;
  category?: string;
  reference_number?: string;
  check_number?: string;
  match_status: MatchStatus;
  match_type?: MatchType;
  matched_entity_type?: MatchedEntityType;
  matched_entity_id?: string;
  matched_by?: string;
  matched_at?: string;
  gl_transaction_id?: string;
  posting_rule_id?: string;
  confidence_score: number;
  validation_status: ValidationStatus;
  validation_notes?: string;
  raw_data?: Record<string, any>;
  parsed_at?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface UnmatchedTransaction {
  transaction_id: string;
  bank_account_id: string;
  transaction_date: string;
  description: string;
  amount: number;
  balance_after?: number;
  transaction_type?: TransactionType;
  category?: string;
  reference_number?: string;
  confidence_score: number;
  raw_data?: Record<string, any>;
  account_name: string;
  bank_name: string;
  account_type: string;
  statement_date?: string;
  file_name?: string;
}

export interface ParsedTransactionData {
  date: string;
  description: string;
  amount: number;
  balance?: number;
  type?: TransactionType;
  category?: string;
  reference?: string;
  check_number?: string;
  raw_line?: string;
}

export interface ParseResult {
  success: boolean;
  transactions: ParsedTransactionData[];
  error?: string;
  metadata?: {
    statement_period?: string;
    statement_number?: string;
    opening_balance?: number;
    closing_balance?: number;
    total_credits: number;
    total_debits: number;
  };
}

export interface MatchingCandidate {
  entity_type: MatchedEntityType;
  entity_id: string;
  confidence_score: number;
  match_reason: string;
  entity_data: Record<string, any>;
}

// =====================================================
// BANK STATEMENTS FUNCTIONS
// =====================================================

export async function uploadBankStatement(
  bankAccountId: string,
  file: File,
  options: {
    statementDate?: string;
    statementPeriod?: string;
    statementNumber?: string;
    notes?: string;
  } = {}
): Promise<BankStatement> {
  const { data: { user } } = await supabase.auth.getUser();

  // Get company_id from bank account
  const { data: account } = await supabase
    .from("bank_accounts")
    .select("company_id")
    .eq("id", bankAccountId)
    .single();

  if (!account) {
    throw new Error("Bank account not found");
  }

  // Upload file to storage (using existing pattern)
  const fileExt = file.name.split(".").pop();
  const fileName = `bank-statements/${account.company_id}/${Date.now()}_${file.name}`;
  
  const { data: uploadData, error: uploadError } = await supabase.storage
    .from("project-files") // Reuse existing bucket
    .upload(fileName, file);

  if (uploadError) throw uploadError;

  // Calculate file hash (simple implementation)
  const fileHash = await calculateFileHash(file);

  // Create statement record
  const { data, error } = await supabase
    .from("bank_statements")
    .insert([
      {
        bank_account_id: bankAccountId,
        company_id: account.company_id,
        statement_date: options.statementDate || new Date().toISOString().split("T")[0],
        statement_period: options.statementPeriod,
        statement_number: options.statementNumber,
        file_url: fileName,
        file_name: file.name,
        file_size: file.size,
        file_type: file.type || `application/${fileExt}`,
        file_hash: fileHash,
        uploaded_by: user?.id,
        notes: options.notes,
      },
    ])
    .select()
    .single();

  if (error) throw error;
  return data as BankStatement;
}

export async function fetchBankStatements(
  bankAccountId?: string,
  filters?: {
    status?: ParseStatus;
    startDate?: string;
    endDate?: string;
  }
): Promise<BankStatement[]> {
  let query = supabase
    .from("bank_statements")
    .select("*");

  if (bankAccountId) {
    query = query.eq("bank_account_id", bankAccountId);
  }

  if (filters?.status) {
    query = query.eq("parse_status", filters.status);
  }

  if (filters?.startDate) {
    query = query.gte("statement_date", filters.startDate);
  }

  if (filters?.endDate) {
    query = query.lte("statement_date", filters.endDate);
  }

  const { data, error } = await query.order("statement_date", { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function updateBankStatement(id: string, updates: Partial<BankStatement>): Promise<BankStatement> {
  const { data, error } = await supabase
    .from("bank_statements")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data as BankStatement;
}

// =====================================================
// BANK TRANSACTIONS FUNCTIONS
// =====================================================

export async function fetchBankTransactions(
  companyId?: string,
  filters?: {
    matchStatus?: MatchStatus;
    startDate?: string;
    endDate?: string;
    statementId?: string;
  }
): Promise<BankTransaction[]> {
  let query = supabase
    .from("bank_transactions")
    .select("*");

  if (companyId) {
    query = query.eq("company_id", companyId);
  }

  if (filters?.matchStatus) {
    query = query.eq("match_status", filters.matchStatus);
  }

  if (filters?.startDate) {
    query = query.gte("transaction_date", filters.startDate);
  }

  if (filters?.endDate) {
    query = query.lte("transaction_date", filters.endDate);
  }

  if (filters?.statementId) {
    query = query.eq("statement_id", filters.statementId);
  }

  const { data, error } = await query.order("transaction_date", { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function getUnmatchedTransactions(companyId: string, limit: number = 100): Promise<UnmatchedTransaction[]> {
  const { data, error } = await supabase
    .from("v_unmatched_transactions")
    .select("*")
    .eq("company_id", companyId)
    .limit(limit);

  if (error) throw error;
  return data || [];
}

export async function updateTransactionMatch(
  transactionId: string,
  matchStatus: MatchStatus,
  matchedEntityType?: MatchedEntityType,
  matchedEntityId?: string,
  confidenceScore?: number,
  notes?: string
): Promise<BankTransaction> {
  const { data, error } = await supabase
    .from("bank_transactions")
    .update({
      match_status: matchStatus,
      matched_entity_type: matchedEntityType,
      matched_entity_id: matchedEntityId,
      confidence_score: confidenceScore,
      matched_by: (await supabase.auth.getUser()).data.user?.id,
      matched_at: new Date().toISOString(),
      notes,
    })
    .eq("id", transactionId)
    .select()
    .single();

  if (error) throw error;
  return data as BankTransaction;
}

// =====================================================
// CORE PARSING FUNCTIONS
// =====================================================

/**
 * Basic bank statement parser (placeholder for future OCR implementation)
 */
export async function parseBankStatement(file: File): Promise<ParseResult> {
  try {
    // This is a basic placeholder parser
    // In a full implementation, this would use OCR or specific bank format parsers
    
    const text = await extractTextFromFile(file);
    const transactions = parseTransactionsFromText(text);
    
    return {
      success: true,
      transactions,
      metadata: {
        total_credits: transactions.filter(t => t.amount > 0).reduce((sum, t) => sum + t.amount, 0),
        total_debits: Math.abs(transactions.filter(t => t.amount < 0).reduce((sum, t) => sum + t.amount, 0)),
      },
    };
  } catch (error) {
    return {
      success: false,
      transactions: [],
      error: error instanceof Error ? error.message : "Unknown parsing error",
    };
  }
}

/**
 * Store parsed bank transactions in database
 */
export async function storeBankTransactions(
  statementId: string,
  transactions: ParsedTransactionData[]
): Promise<{ success: boolean; stored: number; errors: string[] }> {
  const errors: string[] = [];
  let stored = 0;

  try {
    // Get statement details for company_id and bank_account_id
    const { data: statement } = await supabase
      .from("bank_statements")
      .select("bank_account_id, company_id")
      .eq("id", statementId)
      .single();

    if (!statement) {
      throw new Error("Statement not found");
    }

    // Prepare transactions for insertion
    const bankTransactions = transactions.map((transaction, index) => ({
      bank_account_id: statement.bank_account_id,
      company_id: statement.company_id,
      statement_id: statementId,
      transaction_date: transaction.date,
      description: transaction.description,
      amount: Math.abs(transaction.amount),
      balance_after: transaction.balance,
      transaction_type: determineTransactionType(transaction.amount, transaction.type),
      category: transaction.category,
      reference_number: transaction.reference,
      check_number: transaction.check_number,
      confidence_score: 0.5, // Default confidence for parsed transactions
      raw_data: {
        raw_line: transaction.raw_line,
        parsed_at: new Date().toISOString(),
      },
      parsed_at: new Date().toISOString(),
    }));

    // Insert transactions in batches
    const batchSize = 50;
    for (let i = 0; i < bankTransactions.length; i += batchSize) {
      const batch = bankTransactions.slice(i, i + batchSize);
      
      const { error } = await supabase
        .from("bank_transactions")
        .insert(batch);

      if (error) {
        errors.push(`Batch ${i / batchSize + 1}: ${error.message}`);
      } else {
        stored += batch.length;
      }
    }

    return {
      success: errors.length === 0,
      stored,
      errors,
    };
  } catch (error) {
    return {
      success: false,
      stored: 0,
      errors: [error instanceof Error ? error.message : "Unknown error"],
    };
  }
}

/**
 * Get unmatched transactions with pagination
 */
export async function getUnmatchedTransactionsPaginated(
  companyId: string,
  page: number = 1,
  pageSize: number = 50
): Promise<{
  transactions: UnmatchedTransaction[];
  totalCount: number;
  totalPages: number;
}> {
  const offset = (page - 1) * pageSize;

  // Get total count
  const { count, error: countError } = await supabase
    .from("bank_transactions")
    .select("id", { count: "exact", head: true })
    .eq("company_id", companyId)
    .eq("match_status", "unmatched");

  if (countError) throw countError;

  // Get transactions
  const { data, error } = await supabase
    .from("v_unmatched_transactions")
    .select("*")
    .eq("company_id", companyId)
    .range(offset, offset + pageSize - 1)
    .order("transaction_date", { ascending: false });

  if (error) throw error;

  return {
    transactions: data || [],
    totalCount: count || 0,
    totalPages: Math.ceil((count || 0) / pageSize),
  };
}

// =====================================================
// HELPER FUNCTIONS
// =====================================================

/**
 * Calculate file hash for duplicate detection
 */
async function calculateFileHash(file: File): Promise<string> {
  // Simple hash implementation (in production, use crypto.subtle.digest)
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  
  let hash = 0;
  for (let i = 0; i < bytes.length; i++) {
    hash = ((hash << 5) - hash) + bytes[i];
    hash = hash & hash; // Convert to 32-bit integer
  }
  
  return Math.abs(hash).toString(36);
}

/**
 * Extract text from file (placeholder for OCR)
 */
async function extractTextFromFile(file: File): Promise<string> {
  // This is a placeholder implementation
  // In a full implementation, this would use OCR libraries like Tesseract.js
  
  if (file.type === "text/plain" || file.type === "text/csv") {
    return await file.text();
  }
  
  if (file.type === "application/pdf") {
    // Placeholder: would use PDF parsing library
    throw new Error("PDF parsing not implemented in placeholder");
  }
  
  // For other formats, return empty text
  return "";
}

/**
 * Parse transactions from extracted text
 */
function parseTransactionsFromText(text: string): ParsedTransactionData[] {
  const transactions: ParsedTransactionData[] = [];
  const lines = text.split('\n').filter(line => line.trim());
  
  for (const line of lines) {
    // Basic pattern matching for common bank statement formats
    // This is a simplified parser - real implementation would be more sophisticated
    
    const dateMatch = line.match(/(\d{1,2}\/\d{1,2}\/\d{4}|\d{4}-\d{2}-\d{2})/);
    const amountMatch = line.match(/\$?(-?\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/);
    
    if (dateMatch && amountMatch) {
      const date = dateMatch[1];
      const amountStr = amountMatch[1].replace(/[$,]/g, '');
      const amount = parseFloat(amountStr);
      
      // Extract description (everything between date and amount)
      const dateIndex = line.indexOf(dateMatch[0]);
      const amountIndex = line.indexOf(amountMatch[0]);
      const description = line.substring(dateIndex + dateMatch[0].length, amountIndex).trim();
      
      transactions.push({
        date: normalizeDate(date),
        description: description || "Unknown transaction",
        amount,
        raw_line: line,
      });
    }
  }
  
  return transactions;
}

/**
 * Normalize date string to YYYY-MM-DD format
 */
function normalizeDate(dateStr: string): string {
  // Handle MM/DD/YYYY format
  if (dateStr.includes('/')) {
    const parts = dateStr.split('/');
    if (parts.length === 3) {
      const [month, day, year] = parts;
      return `${year.padStart(4, '0')}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }
  }
  
  // Handle YYYY-MM-DD format (already normalized)
  if (dateStr.includes('-')) {
    return dateStr;
  }
  
  // Default to current date if parsing fails
  return new Date().toISOString().split('T')[0];
}

/**
 * Determine transaction type from amount and optional type
 */
function determineTransactionType(amount: number, explicitType?: TransactionType): TransactionType {
  if (explicitType) return explicitType;
  
  if (amount > 0) return "credit";
  if (amount < 0) return "debit";
  
  return "debit"; // Default
}

/**
 * Find potential matches for a transaction (placeholder for future automation)
 */
export async function findMatchingCandidates(
  transaction: BankTransaction,
  companyId: string
): Promise<MatchingCandidate[]> {
  // This is a placeholder for future implementation
  // Would integrate with Phase 2 posting engine and existing finance tables
  
  const candidates: MatchingCandidate[] = [];
  
  // Example: Look for matching invoices by amount and date range
  if (transaction.amount > 0) {
    // Look for client payments
    const { data: clientPayments } = await supabase
      .from("client_payments")
      .select("id, amount, payment_date, client_id")
      .eq("company_id", companyId)
      .eq("amount", transaction.amount)
      .gte("payment_date", new Date(Date.parse(transaction.transaction_date) - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0])
      .lte("payment_date", new Date(Date.parse(transaction.transaction_date) + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0])
      .limit(5);

    clientPayments?.forEach(payment => {
      candidates.push({
        entity_type: "client_payment",
        entity_id: payment.id,
        confidence_score: 0.8,
        match_reason: "Amount and date match",
        entity_data: payment,
      });
    });
  }
  
  return candidates.sort((a, b) => b.confidence_score - a.confidence_score);
}

/**
 * Format currency for display
 */
export function formatCurrency(amount: number, currency: string = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(amount);
}

/**
 * Get bank account details
 */
async function getBankAccountDetails(bankAccountId: string): Promise<{
  company_id: string;
  account_name: string;
  bank_name: string;
  account_type: string;
} | null> {
  const { data, error } = await supabase
    .from("bank_accounts")
    .select("company_id, account_name, bank_name, account_type")
    .eq("id", bankAccountId)
    .single();

  if (error) return null;
  return data;
}
