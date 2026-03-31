/*
  Phase 5: Bank Integration - Statements and Transactions
  
  Creates the bank statement and transaction parsing system that extends
  the existing bank_accounts table without modifying it.
  
  Tables Created:
  - bank_statements: Statement file storage and metadata
  - bank_transactions: Parsed transaction data with matching capabilities
  
  This integrates with:
  - Existing bank_accounts table (no modification)
  - Existing file storage system (project-files pattern)
  - Phase 2 posting engine for transaction matching
*/

-- =====================================================
-- BANK STATEMENTS
-- =====================================================

CREATE TABLE IF NOT EXISTS bank_statements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_account_id uuid NOT NULL REFERENCES bank_accounts(id) ON DELETE CASCADE,
  company_id uuid NOT NULL,
  
  -- Statement identification
  statement_date date NOT NULL,
  statement_period text, -- e.g., "January 2024", "Q1 2024"
  statement_number text,
  
  -- File storage
  file_url text NOT NULL,
  file_name text NOT NULL,
  file_size integer,
  file_type text,
  file_hash text, -- For duplicate detection
  
  -- Processing status
  parse_status text DEFAULT 'pending' CHECK (parse_status IN ('pending', 'processing', 'completed', 'failed', 'skipped')),
  parse_error text,
  parse_started_at timestamptz,
  parse_completed_at timestamptz,
  
  -- Transaction counts
  transaction_count integer DEFAULT 0,
  matched_count integer DEFAULT 0,
  unmatched_count integer GENERATED ALWAYS AS (
    transaction_count - matched_count
  ) STORED,
  
  -- Reconciliation
  reconciled boolean DEFAULT false,
  reconciled_by uuid REFERENCES auth.users(id),
  reconciled_at timestamptz,
  reconciliation_notes text,
  
  -- Metadata
  uploaded_by uuid REFERENCES auth.users(id),
  notes text,
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  -- Constraints
  UNIQUE(bank_account_id, statement_date, statement_number),
  CHECK(file_size > 0),
  CHECK(parse_started_at IS NULL OR parse_completed_at IS NULL OR parse_started_at <= parse_completed_at),
  CHECK(matched_count <= transaction_count)
);

-- =====================================================
-- BANK TRANSACTIONS
-- =====================================================

CREATE TABLE IF NOT EXISTS bank_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_account_id uuid NOT NULL REFERENCES bank_accounts(id) ON DELETE CASCADE,
  company_id uuid NOT NULL,
  statement_id uuid REFERENCES bank_statements(id) ON DELETE SET NULL,
  
  -- Transaction details
  transaction_date date NOT NULL,
  description text NOT NULL,
  amount numeric(15,2) NOT NULL,
  balance_after numeric(15,2),
  
  -- Transaction classification
  transaction_type text CHECK (transaction_type IN ('credit', 'debit', 'transfer_in', 'transfer_out')),
  category text,
  reference_number text,
  check_number text,
  
  -- Matching and reconciliation
  match_status text DEFAULT 'unmatched' CHECK (match_status IN ('unmatched', 'matched', 'reconciled', 'disputed')),
  match_type text CHECK (match_type IN (
    'manual',           -- Manual match
    'auto_invoice',     -- Auto-matched to invoice
    'auto_expense',     -- Auto-matched to expense
    'auto_payroll',     -- Auto-matched to payroll
    'auto_payment',      -- Auto-matched to payment
    'auto_transfer',    -- Auto-matched to transfer
    'rule_based'        -- Matched by posting rules
  )),
  
  -- Matched entity reference
  matched_entity_type text CHECK (matched_entity_type IN (
    'client_invoice',
    'supplier_invoice', 
    'expense',
    'payroll_entry',
    'client_payment',
    'supplier_payment',
    'gl_transaction',
    'bank_transfer'
  )),
  matched_entity_id uuid,
  matched_by uuid REFERENCES auth.users(id),
  matched_at timestamptz,
  
  -- Posting engine integration
  gl_transaction_id uuid REFERENCES gl_transactions(id) ON DELETE SET NULL,
  posting_rule_id uuid REFERENCES posting_rules(id) ON DELETE SET NULL,
  
  -- Validation and quality
  confidence_score numeric(3,2) DEFAULT 0.50 CHECK (confidence_score >= 0 AND confidence_score <= 1),
  validation_status text DEFAULT 'pending' CHECK (validation_status IN ('pending', 'validated', 'flagged', 'error')),
  validation_notes text,
  
  -- Metadata
  raw_data jsonb, -- Original parsed data
  parsed_at timestamptz,
  notes text,
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  -- Constraints
  CHECK(transaction_date <= CURRENT_DATE),
  CHECK(matched_at IS NULL OR matched_by IS NOT NULL),
  CHECK(matched_entity_id IS NULL OR matched_entity_type IS NOT NULL),
  CHECK(confidence_score >= 0 AND confidence_score <= 1)
);

-- =====================================================
-- INDEXES
-- =====================================================

-- Bank statements indexes
CREATE INDEX IF NOT EXISTS idx_bank_statements_account ON bank_statements(bank_account_id);
CREATE INDEX IF NOT EXISTS idx_bank_statements_company ON bank_statements(company_id);
CREATE INDEX IF NOT EXISTS idx_bank_statements_date ON bank_statements(statement_date);
CREATE INDEX IF NOT EXISTS idx_bank_statements_status ON bank_statements(parse_status);
CREATE INDEX IF NOT EXISTS idx_bank_statements_file_hash ON bank_statements(file_hash);

-- Bank transactions indexes
CREATE INDEX IF NOT EXISTS idx_bank_transactions_account ON bank_transactions(bank_account_id);
CREATE INDEX IF NOT EXISTS idx_bank_transactions_company ON bank_transactions(company_id);
CREATE INDEX IF NOT EXISTS idx_bank_transactions_statement ON bank_transactions(statement_id);
CREATE INDEX IF NOT EXISTS idx_bank_transactions_date ON bank_transactions(transaction_date);
CREATE INDEX IF NOT EXISTS idx_bank_transactions_amount ON bank_transactions(amount);
CREATE INDEX IF NOT EXISTS idx_bank_transactions_status ON bank_transactions(match_status);
CREATE INDEX IF NOT EXISTS idx_bank_transactions_type ON bank_transactions(transaction_type);
CREATE INDEX IF NOT EXISTS idx_bank_transactions_match ON bank_transactions(matched_entity_type, matched_entity_id);
CREATE INDEX IF NOT EXISTS idx_bank_transactions_gl ON bank_transactions(gl_transaction_id);
CREATE INDEX IF NOT EXISTS idx_bank_transactions_confidence ON bank_transactions(confidence_score);

-- =====================================================
-- ROW LEVEL SECURITY
-- =====================================================

-- Enable RLS on all tables
ALTER TABLE bank_statements ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_transactions ENABLE ROW LEVEL SECURITY;

-- Bank statements RLS
CREATE POLICY "Users can view their company bank statements"
  ON bank_statements FOR SELECT
  TO authenticated
  USING (
    company_id IN (SELECT company_id FROM user_profiles WHERE id = auth.uid())
  );

CREATE POLICY "Users can manage their company bank statements"
  ON bank_statements FOR ALL
  TO authenticated
  USING (
    company_id IN (SELECT company_id FROM user_profiles WHERE id = auth.uid())
  );

-- Bank transactions RLS
CREATE POLICY "Users can view their company bank transactions"
  ON bank_transactions FOR SELECT
  TO authenticated
  USING (
    company_id IN (SELECT company_id FROM user_profiles WHERE id = auth.uid())
  );

CREATE POLICY "Users can manage their company bank transactions"
  ON bank_transactions FOR ALL
  TO authenticated
  USING (
    company_id IN (SELECT company_id FROM user_profiles WHERE id = auth.uid())
  );

-- =====================================================
-- TRIGGERS FOR UPDATED_AT
-- =====================================================

CREATE OR REPLACE FUNCTION update_bank_integration_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_bank_statements_updated_at
  BEFORE UPDATE ON bank_statements
  FOR EACH ROW
  EXECUTE FUNCTION update_bank_integration_updated_at();

CREATE TRIGGER set_bank_transactions_updated_at
  BEFORE UPDATE ON bank_transactions
  FOR EACH ROW
  EXECUTE FUNCTION update_bank_integration_updated_at();

-- =====================================================
-- TRIGGERS FOR AUTOMATIC UPDATES
-- =====================================================

-- Update statement transaction counts when transactions are added/updated
CREATE OR REPLACE FUNCTION update_statement_transaction_counts()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' OR TG_OP = 'DELETE' THEN
    UPDATE bank_statements 
    SET 
      transaction_count = (
        SELECT COUNT(*) 
        FROM bank_transactions 
        WHERE statement_id = COALESCE(NEW.statement_id, OLD.statement_id)
      ),
      matched_count = (
        SELECT COUNT(*) 
        FROM bank_transactions 
        WHERE statement_id = COALESCE(NEW.statement_id, OLD.statement_id)
          AND match_status IN ('matched', 'reconciled')
      )
    WHERE id = COALESCE(NEW.statement_id, OLD.statement_id);
    
    RETURN COALESCE(NEW, OLD);
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_statement_transaction_counts
  AFTER INSERT OR UPDATE OR DELETE ON bank_transactions
  FOR EACH ROW
  EXECUTE FUNCTION update_statement_transaction_counts();

-- =====================================================
-- VIEWS FOR COMMON QUERIES
-- =====================================================

-- Unmatched transactions view
CREATE OR REPLACE VIEW v_unmatched_transactions AS
SELECT 
  bt.id,
  bt.bank_account_id,
  bt.company_id,
  bt.transaction_date,
  bt.description,
  bt.amount,
  bt.balance_after,
  bt.transaction_type,
  bt.category,
  bt.reference_number,
  bt.confidence_score,
  bt.raw_data,
  bt.created_at,
  ba.account_name,
  ba.bank_name,
  ba.account_type,
  bs.statement_date,
  bs.file_name
FROM bank_transactions bt
JOIN bank_accounts ba ON bt.bank_account_id = ba.id
LEFT JOIN bank_statements bs ON bt.statement_id = bs.id
WHERE bt.match_status = 'unmatched'
  AND bt.validation_status != 'error'
ORDER BY bt.transaction_date DESC, bt.amount DESC;

-- Transaction matching summary view
CREATE OR REPLACE VIEW v_transaction_matching_summary AS
SELECT 
  bt.company_id,
  bt.bank_account_id,
  ba.account_name,
  ba.bank_name,
  COUNT(*) as total_transactions,
  COUNT(*) FILTER (WHERE bt.match_status = 'unmatched') as unmatched_count,
  COUNT(*) FILTER (WHERE bt.match_status = 'matched') as matched_count,
  COUNT(*) FILTER (WHERE bt.match_status = 'reconciled') as reconciled_count,
  COUNT(*) FILTER (WHERE bt.validation_status = 'flagged') as flagged_count,
  SUM(bt.amount) as total_amount,
  AVG(bt.confidence_score) as avg_confidence,
  MAX(bt.transaction_date) as latest_transaction_date,
  MIN(bt.transaction_date) as earliest_transaction_date
FROM bank_transactions bt
JOIN bank_accounts ba ON bt.bank_account_id = ba.id
GROUP BY bt.company_id, bt.bank_account_id, ba.account_name, ba.bank_name
ORDER BY total_transactions DESC;

-- Statement processing summary view
CREATE OR REPLACE VIEW v_statement_processing_summary AS
SELECT 
  bs.company_id,
  COUNT(*) as total_statements,
  COUNT(*) FILTER (WHERE bs.parse_status = 'completed') as completed_count,
  COUNT(*) FILTER (WHERE bs.parse_status = 'failed') as failed_count,
  COUNT(*) FILTER (WHERE bs.parse_status = 'pending') as pending_count,
  SUM(bs.transaction_count) as total_transactions,
  SUM(bs.matched_count) as total_matched,
  SUM(bs.unmatched_count) as total_unmatched,
  AVG(bs.transaction_count) as avg_transactions_per_statement,
  MAX(bs.statement_date) as latest_statement_date,
  MIN(bs.statement_date) as earliest_statement_date
FROM bank_statements bs
GROUP BY bs.company_id
ORDER BY total_statements DESC;

-- =====================================================
-- FUNCTIONS FOR AUTOMATION SUPPORT
-- =====================================================

-- Function to get unmatched transactions for auto-matching
CREATE OR REPLACE FUNCTION get_unmatched_transactions_for_matching(p_company_id uuid, p_limit integer DEFAULT 100)
RETURNS TABLE (
  transaction_id uuid,
  bank_account_id uuid,
  transaction_date date,
  description text,
  amount numeric,
  confidence_score numeric,
  raw_data jsonb
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    bt.id,
    bt.bank_account_id,
    bt.transaction_date,
    bt.description,
    bt.amount,
    bt.confidence_score,
    bt.raw_data
  FROM bank_transactions bt
  WHERE bt.company_id = p_company_id
    AND bt.match_status = 'unmatched'
    AND bt.validation_status = 'pending'
    AND bt.confidence_score >= 0.5
  ORDER BY bt.confidence_score DESC, bt.amount DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to update transaction match status
CREATE OR REPLACE FUNCTION update_transaction_match(
  p_transaction_id uuid,
  p_match_status text,
  p_matched_entity_type text,
  p_matched_entity_id uuid,
  p_confidence_score numeric,
  p_notes text
)
RETURNS boolean AS $$
DECLARE
  v_user_id uuid;
BEGIN
  -- Get current user
  v_user_id := auth.uid();
  
  -- Update transaction
  UPDATE bank_transactions 
  SET 
    match_status = p_match_status,
    matched_entity_type = p_matched_entity_type,
    matched_entity_id = p_matched_entity_id,
    confidence_score = p_confidence_score,
    matched_by = v_user_id,
    matched_at = now(),
    notes = p_notes,
    updated_at = now()
  WHERE id = p_transaction_id;
  
  -- Check if update was successful
  IF FOUND THEN
    RETURN true;
  ELSE
    RETURN false;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- COMMENT: USAGE NOTES
-- =====================================================

/*
  Bank Integration System:
  
  1. File Storage:
     - Uses existing Supabase storage pattern (project-files bucket)
     - Stores bank statements in bank-statements folder
     - Maintains file metadata and processing status
  
  2. Transaction Parsing:
     - Basic parser structure for future OCR implementation
     - Stores raw parsed data in JSONB for flexibility
     - Confidence scoring for match quality assessment
  
  3. Matching System:
     - Integrates with Phase 2 posting engine
     - Supports multiple match types (manual, auto, rule-based)
     - Links to GL transactions when matched
  
  4. Automation Ready:
     - Functions for batch processing unmatched transactions
     - Confidence scoring for prioritization
     - Views for monitoring and reporting
  
  5. Integration Points:
     - Extends existing bank_accounts table (no modification)
     - Uses existing file storage patterns
     - Links to Phase 2 posting rules and GL transactions
     - Maintains company-based security model
*/
