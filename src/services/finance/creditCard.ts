import { supabase } from "../../lib/supabase";

// =====================================================
// CREDIT CARD TYPES
// =====================================================

export type CardType = "visa" | "mastercard" | "amex" | "discover" | "other";
export type TransactionType = "charge" | "payment" | "fee" | "interest" | "transfer";
export type MatchStatus = "unmatched" | "matched" | "reconciled" | "disputed";
export type MatchType = "manual" | "auto_expense" | "auto_supplier" | "auto_payment" | "auto_transfer" | "rule_based";
export type MatchedEntityType = "expense" | "supplier_invoice" | "client_payment" | "supplier_payment" | "gl_transaction" | "bank_transfer";
export type ValidationStatus = "pending" | "validated" | "flagged" | "error";

export interface CreditCardAccount {
  id: string;
  company_id: string;
  card_name: string;
  card_number_last_4?: string;
  card_type?: CardType;
  issuer_bank?: string;
  credit_limit: number;
  current_balance: number;
  available_credit: number;
  is_active: boolean;
  is_primary: boolean;
  payment_due_day?: number;
  minimum_payment_percentage: number;
  apr: number;
  chart_account_id?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
  created_by?: string;
}

export interface CreditCardStatement {
  id: string;
  credit_card_id: string;
  company_id: string;
  statement_date: string;
  statement_period?: string;
  statement_number?: string;
  opening_balance: number;
  closing_balance: number;
  minimum_payment_due: number;
  payment_due_date?: string;
  file_url: string;
  file_name: string;
  file_size: number;
  file_type: string;
  file_hash: string;
  parse_status: "pending" | "processing" | "completed" | "failed" | "skipped";
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

export interface CreditCardTransaction {
  id: string;
  credit_card_id: string;
  company_id: string;
  statement_id?: string;
  transaction_date: string;
  description: string;
  amount: number;
  running_balance?: number;
  transaction_type?: TransactionType;
  category?: string;
  merchant_name?: string;
  merchant_category?: string;
  reference_number?: string;
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
  liability_posted: boolean;
  liability_gl_transaction_id?: string;
  liability_posted_at?: string;
  liability_posted_by?: string;
  raw_data?: Record<string, any>;
  parsed_at?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface UnmatchedCreditCardTransaction {
  transaction_id: string;
  credit_card_id: string;
  transaction_date: string;
  description: string;
  amount: number;
  running_balance?: number;
  transaction_type?: TransactionType;
  category?: string;
  merchant_name?: string;
  reference_number?: string;
  confidence_score: number;
  raw_data?: Record<string, any>;
  card_name: string;
  card_number_last_4?: string;
  card_type?: CardType;
  issuer_bank?: string;
  statement_date?: string;
  file_name?: string;
}

export interface ParsedCreditCardTransactionData {
  date: string;
  description: string;
  amount: number;
  balance?: number;
  type?: TransactionType;
  category?: string;
  merchant?: string;
  reference?: string;
  raw_line?: string;
}

export interface CreditCardParseResult {
  success: boolean;
  transactions: ParsedCreditCardTransactionData[];
  error?: string;
  metadata?: {
    statement_period?: string;
    statement_number?: string;
    opening_balance?: number;
    closing_balance?: number;
    minimum_payment_due?: number;
    payment_due_date?: string;
    total_charges: number;
    total_payments: number;
  };
}

export interface CreditCardLiabilityPosting {
  transaction_id: string;
  gl_transaction_id: string;
  posted_at: string;
  posted_by: string;
  liability_amount: number;
  description: string;
}

// =====================================================
// CREDIT CARD ACCOUNTS FUNCTIONS
// =====================================================

export async function createCreditCardAccount(
  cardName: string,
  creditLimit: number,
  options: {
    cardNumberLast4?: string;
    cardType?: CardType;
    issuerBank?: string;
    paymentDueDay?: number;
    apr?: number;
    chartAccountId?: string;
    notes?: string;
  } = {}
): Promise<CreditCardAccount> {
  const { data: { user } } = await supabase.auth.getUser();

  // Get company_id from user profile
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("company_id")
    .eq("id", user?.id || "")
    .single();

  if (!profile) {
    throw new Error("User profile not found");
  }

  const { data, error } = await supabase
    .from("credit_card_accounts")
    .insert([
      {
        company_id: profile.company_id,
        card_name: cardName,
        card_number_last_4: options.cardNumberLast4,
        card_type: options.cardType,
        issuer_bank: options.issuerBank,
        credit_limit: creditLimit,
        payment_due_day: options.paymentDueDay,
        apr: options.apr || 0,
        chart_account_id: options.chartAccountId,
        notes: options.notes,
        created_by: user?.id,
      },
    ])
    .select()
    .single();

  if (error) throw error;
  return data as CreditCardAccount;
}

export async function fetchCreditCardAccounts(companyId?: string): Promise<CreditCardAccount[]> {
  let query = supabase
    .from("credit_card_accounts")
    .select("*")
    .eq("is_active", true)
    .order("is_primary", { ascending: false })
    .order("card_name", { ascending: true });

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

  const { data, error } = await query;

  if (error) throw error;
  return data || [];
}

export async function updateCreditCardAccount(id: string, updates: Partial<CreditCardAccount>): Promise<CreditCardAccount> {
  const { data, error } = await supabase
    .from("credit_card_accounts")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data as CreditCardAccount;
}

// =====================================================
// CREDIT CARD STATEMENTS FUNCTIONS
// =====================================================

export async function uploadCreditCardStatement(
  creditCardId: string,
  file: File,
  options: {
    statementDate?: string;
    statementPeriod?: string;
    statementNumber?: string;
    openingBalance?: number;
    closingBalance?: number;
    minimumPaymentDue?: number;
    paymentDueDate?: string;
    notes?: string;
  } = {}
): Promise<CreditCardStatement> {
  const { data: { user } } = await supabase.auth.getUser();

  // Get company_id from credit card account
  const { data: account } = await supabase
    .from("credit_card_accounts")
    .select("company_id")
    .eq("id", creditCardId)
    .single();

  if (!account) {
    throw new Error("Credit card account not found");
  }

  // Upload file to storage (using existing pattern)
  const fileExt = file.name.split(".").pop();
  const fileName = `credit-card-statements/${account.company_id}/${Date.now()}_${file.name}`;
  
  const { data: uploadData, error: uploadError } = await supabase.storage
    .from("project-files") // Reuse existing bucket
    .upload(fileName, file);

  if (uploadError) throw uploadError;

  // Calculate file hash (simple implementation)
  const fileHash = await calculateFileHash(file);

  // Create statement record
  const { data, error } = await supabase
    .from("credit_card_statements")
    .insert([
      {
        credit_card_id: creditCardId,
        company_id: account.company_id,
        statement_date: options.statementDate || new Date().toISOString().split("T")[0],
        statement_period: options.statementPeriod,
        statement_number: options.statementNumber,
        opening_balance: options.openingBalance || 0,
        closing_balance: options.closingBalance || 0,
        minimum_payment_due: options.minimumPaymentDue || 0,
        payment_due_date: options.paymentDueDate,
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
  return data as CreditCardStatement;
}

export async function fetchCreditCardStatements(
  creditCardId?: string,
  filters?: {
    status?: "pending" | "processing" | "completed" | "failed" | "skipped";
    startDate?: string;
    endDate?: string;
  }
): Promise<CreditCardStatement[]> {
  let query = supabase
    .from("credit_card_statements")
    .select("*");

  if (creditCardId) {
    query = query.eq("credit_card_id", creditCardId);
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

// =====================================================
// CREDIT CARD TRANSACTIONS FUNCTIONS
// =====================================================

export async function fetchCreditCardTransactions(
  companyId?: string,
  filters?: {
    matchStatus?: MatchStatus;
    transactionType?: TransactionType;
    startDate?: string;
    endDate?: string;
    statementId?: string;
    liabilityPosted?: boolean;
  }
): Promise<CreditCardTransaction[]> {
  let query = supabase
    .from("credit_card_transactions")
    .select("*");

  if (companyId) {
    query = query.eq("company_id", companyId);
  }

  if (filters?.matchStatus) {
    query = query.eq("match_status", filters.matchStatus);
  }

  if (filters?.transactionType) {
    query = query.eq("transaction_type", filters.transactionType);
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

  if (filters?.liabilityPosted !== undefined) {
    query = query.eq("liability_posted", filters.liabilityPosted);
  }

  const { data, error } = await query.order("transaction_date", { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function getUnmatchedCardTransactions(companyId: string, limit: number = 100): Promise<UnmatchedCreditCardTransaction[]> {
  const { data, error } = await supabase
    .from("v_unmatched_credit_card_transactions")
    .select("*")
    .eq("company_id", companyId)
    .limit(limit);

  if (error) throw error;
  return data || [];
}

export async function updateCreditCardTransactionMatch(
  transactionId: string,
  matchStatus: MatchStatus,
  matchedEntityType?: MatchedEntityType,
  matchedEntityId?: string,
  confidenceScore?: number,
  notes?: string
): Promise<CreditCardTransaction> {
  const { data, error } = await supabase
    .from("credit_card_transactions")
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
  return data as CreditCardTransaction;
}

// =====================================================
// CORE PARSING FUNCTIONS
// =====================================================

/**
 * Basic credit card statement parser (placeholder for future OCR implementation)
 */
export async function parseCreditCardStatement(file: File): Promise<CreditCardParseResult> {
  try {
    // This is a basic placeholder parser
    // In a full implementation, this would use OCR or specific bank format parsers
    
    const text = await extractTextFromFile(file);
    const transactions = parseCreditCardTransactionsFromText(text);
    
    return {
      success: true,
      transactions,
      metadata: {
        total_charges: transactions.filter(t => t.type === 'charge').reduce((sum, t) => sum + t.amount, 0),
        total_payments: transactions.filter(t => t.type === 'payment').reduce((sum, t) => sum + t.amount, 0),
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
 * Store parsed credit card transactions in database
 */
export async function storeCreditTransactions(
  statementId: string,
  transactions: ParsedCreditCardTransactionData[]
): Promise<{ success: boolean; stored: number; errors: string[] }> {
  const errors: string[] = [];
  let stored = 0;

  try {
    // Get statement details for company_id and credit_card_id
    const { data: statement } = await supabase
      .from("credit_card_statements")
      .select("credit_card_id, company_id")
      .eq("id", statementId)
      .single();

    if (!statement) {
      throw new Error("Statement not found");
    }

    // Prepare transactions for insertion
    const creditCardTransactions = transactions.map((transaction, index) => ({
      credit_card_id: statement.credit_card_id,
      company_id: statement.company_id,
      statement_id: statementId,
      transaction_date: transaction.date,
      description: transaction.description,
      amount: Math.abs(transaction.amount),
      running_balance: transaction.balance,
      transaction_type: determineCreditCardTransactionType(transaction.amount, transaction.type),
      category: transaction.category,
      merchant_name: transaction.merchant,
      reference_number: transaction.reference,
      confidence_score: 0.5, // Default confidence for parsed transactions
      raw_data: {
        raw_line: transaction.raw_line,
        parsed_at: new Date().toISOString(),
      },
      parsed_at: new Date().toISOString(),
    }));

    // Insert transactions in batches
    const batchSize = 50;
    for (let i = 0; i < creditCardTransactions.length; i += batchSize) {
      const batch = creditCardTransactions.slice(i, i + batchSize);
      
      const { error } = await supabase
        .from("credit_card_transactions")
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
 * Get unmatched credit card transactions with pagination
 */
export async function getUnmatchedCardTransactionsPaginated(
  companyId: string,
  page: number = 1,
  pageSize: number = 50
): Promise<{
  transactions: UnmatchedCreditCardTransaction[];
  totalCount: number;
  totalPages: number;
}> {
  const offset = (page - 1) * pageSize;

  // Get total count
  const { count, error: countError } = await supabase
    .from("credit_card_transactions")
    .select("id", { count: "exact", head: true })
    .eq("company_id", companyId)
    .eq("match_status", "unmatched");

  if (countError) throw countError;

  // Get transactions
  const { data, error } = await supabase
    .from("v_unmatched_credit_card_transactions")
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

/**
 * Post credit card transaction as liability
 */
export async function postCreditCardLiability(
  transactionId: string,
  description?: string,
  notes?: string
): Promise<CreditCardLiabilityPosting> {
  const { data, error } = await supabase
    .rpc("post_credit_card_liability", {
      p_transaction_id: transactionId,
      p_description: description || "Credit card charge",
      p_notes: notes,
    });

  if (error) throw error;

  // Get the updated transaction details
  const { data: transaction } = await supabase
    .from("credit_card_transactions")
    .select("liability_gl_transaction_id, liability_posted_at, liability_posted_by, amount")
    .eq("id", transactionId)
    .single();

  if (!transaction) {
    throw new Error("Transaction not found after posting");
  }

  return {
    transaction_id: transactionId,
    gl_transaction_id: transaction.liability_gl_transaction_id!,
    posted_at: transaction.liability_posted_at!,
    posted_by: transaction.liability_posted_by!,
    liability_amount: transaction.amount,
    description: description || "Credit card charge",
  };
}

/**
 * Get credit card liability summary
 */
export async function getCreditCardLiabilitySummary(companyId: string): Promise<{
  total_cards: number;
  total_credit_limit: number;
  total_balance: number;
  total_available_credit: number;
  total_unposted_transactions: number;
  total_liability_amount: number;
  cards: Array<{
    id: string;
    card_name: string;
    card_number_last_4?: string;
    credit_limit: number;
    current_balance: number;
    available_credit: number;
    unmatched_count: number;
  }>;
}> {
  const { data, error } = await supabase
    .from("v_credit_card_liability_summary")
    .select("*")
    .eq("company_id", companyId)
    .order("current_balance", { ascending: false });

  if (error) throw error;

  const cards = data || [];
  
  return {
    total_cards: cards.length,
    total_credit_limit: cards.reduce((sum, card) => sum + card.credit_limit, 0),
    total_balance: cards.reduce((sum, card) => sum + card.current_balance, 0),
    total_available_credit: cards.reduce((sum, card) => sum + card.available_credit, 0),
    total_unposted_transactions: cards.reduce((sum, card) => sum + card.unmatched_count, 0),
    total_liability_amount: cards.reduce((sum, card) => sum + (card.posted_amount || 0), 0),
    cards: cards.map(card => ({
      id: card.card_id,
      card_name: card.card_name,
      card_number_last_4: card.card_number_last_4,
      credit_limit: card.credit_limit,
      current_balance: card.current_balance,
      available_credit: card.available_credit,
      unmatched_count: card.unmatched_count,
    })),
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
 * Parse credit card transactions from extracted text
 */
function parseCreditCardTransactionsFromText(text: string): ParsedCreditCardTransactionData[] {
  const transactions: ParsedCreditCardTransactionData[] = [];
  const lines = text.split('\n').filter(line => line.trim());
  
  for (const line of lines) {
    // Basic pattern matching for common credit card statement formats
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
        amount: Math.abs(amount),
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
 * Determine credit card transaction type from amount and optional type
 */
function determineCreditCardTransactionType(amount: number, explicitType?: TransactionType): TransactionType {
  if (explicitType) return explicitType;
  
  // For credit cards, positive amounts are typically charges, negative are payments
  // But in our data model, we store all amounts as positive and use type to distinguish
  if (amount > 0) return "charge";
  if (amount < 0) return "payment";
  
  return "charge"; // Default to charge
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
 * Get credit card account details
 */
async function getCreditCardAccountDetails(creditCardId: string): Promise<{
  company_id: string;
  card_name: string;
  card_number_last_4?: string;
  card_type?: CardType;
  issuer_bank?: string;
} | null> {
  const { data, error } = await supabase
    .from("credit_card_accounts")
    .select("company_id, card_name, card_number_last_4, card_type, issuer_bank")
    .eq("id", creditCardId)
    .single();

  if (error) return null;
  return data;
}
