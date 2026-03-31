/*
  Phase 6: Credit Card Integration - Statements and Transactions
  
  Creates the credit card statement and transaction system that treats
  credit cards as liabilities (not cash) following accounting principles.
  
  Tables Created:
  - credit_card_accounts: Credit card account management as liability accounts
  - credit_card_statements: Statement file storage and metadata
  - credit_card_transactions: Parsed transaction data with matching capabilities
  
  This integrates with:
  - Phase 1 chart of accounts (liability accounts)
  - Phase 2 posting engine for liability posting
  - Phase 5 bank integration patterns (reused structure)
  - Existing file storage system (project-files pattern)
*/

-- =====================================================
-- CREDIT CARD ACCOUNTS
-- =====================================================

CREATE TABLE IF NOT EXISTS credit_card_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  
  -- Card identification
  card_name text NOT NULL,
  card_number_last_4 text,
  card_type text CHECK (card_type IN ('visa', 'mastercard', 'amex', 'discover', 'other')),
  issuer_bank text,
  
  -- Credit limits and balances (treated as liability)
  credit_limit numeric(15,2) NOT NULL CHECK (credit_limit > 0),
  current_balance numeric(15,2) DEFAULT 0 CHECK (current_balance >= 0),
  available_credit numeric(15,2) GENERATED ALWAYS AS (
    credit_limit - current_balance
  ) STORED,
  
  -- Account status
  is_active boolean DEFAULT true,
  is_primary boolean DEFAULT false,
  
  -- Payment details
  payment_due_day integer CHECK (payment_due_day >= 1 AND payment_due_day <= 31),
  minimum_payment_percentage numeric(5,2) DEFAULT 2.00 CHECK (minimum_payment_percentage >= 0 AND minimum_payment_percentage <= 100),
  apr numeric(5,2) DEFAULT 0.00 CHECK (apr >= 0),
  
  -- Chart of accounts integration (liability account)
  chart_account_id uuid REFERENCES chart_of_accounts(id) ON DELETE SET NULL,
  
  -- Metadata
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  
  -- Constraints
  CHECK(current_balance <= credit_limit),
  CHECK(available_credit >= 0)
);

-- =====================================================
-- CREDIT CARD STATEMENTS
-- =====================================================

CREATE TABLE IF NOT EXISTS credit_card_statements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  credit_card_id uuid NOT NULL REFERENCES credit_card_accounts(id) ON DELETE CASCADE,
  company_id uuid NOT NULL,
  
  -- Statement identification
  statement_date date NOT NULL,
  statement_period text, -- e.g., "January 2024", "Q1 2024"
  statement_number text,
  
  -- Statement balances (liability accounting)
  opening_balance numeric(15,2) DEFAULT 0,
  closing_balance numeric(15,2) DEFAULT 0,
  minimum_payment_due numeric(15,2) DEFAULT 0,
  payment_due_date date,
  
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
  UNIQUE(credit_card_id, statement_date, statement_number),
  CHECK(file_size > 0),
  CHECK(parse_started_at IS NULL OR parse_completed_at IS NULL OR parse_started_at <= parse_completed_at),
  CHECK(matched_count <= transaction_count),
  CHECK(closing_balance >= opening_balance),
  CHECK(minimum_payment_due >= 0)
);

-- =====================================================
-- CREDIT CARD TRANSACTIONS
-- =====================================================

CREATE TABLE IF NOT EXISTS credit_card_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  credit_card_id uuid NOT NULL REFERENCES credit_card_accounts(id) ON DELETE CASCADE,
  company_id uuid NOT NULL,
  statement_id uuid REFERENCES credit_card_statements(id) ON DELETE SET NULL,
  
  -- Transaction details
  transaction_date date NOT NULL,
  description text NOT NULL,
  amount numeric(15,2) NOT NULL, -- Positive amounts represent charges (increase liability)
  running_balance numeric(15,2),
  
  -- Transaction classification (liability perspective)
  transaction_type text CHECK (transaction_type IN ('charge', 'payment', 'fee', 'interest', 'transfer')),
  category text,
  merchant_name text,
  merchant_category text,
  reference_number text,
  
  -- Matching and reconciliation
  match_status text DEFAULT 'unmatched' CHECK (match_status IN ('unmatched', 'matched', 'reconciled', 'disputed')),
  match_type text CHECK (match_type IN (
    'manual',           -- Manual match
    'auto_expense',     -- Auto-matched to expense
    'auto_supplier',    -- Auto-matched to supplier invoice
    'auto_payment',     -- Auto-matched to payment
    'auto_transfer',    -- Auto-matched to transfer
    'rule_based'        -- Matched by posting rules
  )),
  
  -- Matched entity reference
  matched_entity_type text CHECK (matched_entity_type IN (
    'expense',
    'supplier_invoice',
    'client_payment',
    'supplier_payment',
    'gl_transaction',
    'bank_transfer'
  )),
  matched_entity_id uuid,
  matched_by uuid REFERENCES auth.users(id),
  matched_at timestamptz,
  
  -- Posting engine integration (liability posting)
  gl_transaction_id uuid REFERENCES gl_transactions(id) ON DELETE SET NULL,
  posting_rule_id uuid REFERENCES posting_rules(id) ON DELETE SET NULL,
  
  -- Validation and quality
  confidence_score numeric(3,2) DEFAULT 0.50 CHECK (confidence_score >= 0 AND confidence_score <= 1),
  validation_status text DEFAULT 'pending' CHECK (validation_status IN ('pending', 'validated', 'flagged', 'error')),
  validation_notes text,
  
  -- Liability posting
  liability_posted boolean DEFAULT false,
  liability_gl_transaction_id uuid REFERENCES gl_transactions(id) ON DELETE SET NULL,
  liability_posted_at timestamptz,
  liability_posted_by uuid REFERENCES auth.users(id),
  
  -- Metadata
  raw_data jsonb, -- Original parsed data
  parsed_at timestamptz,
  notes text,
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  -- Constraints
  CHECK(transaction_date <= CURRENT_DATE),
  CHECK(amount > 0),
  CHECK(matched_at IS NULL OR matched_by IS NOT NULL),
  CHECK(matched_entity_id IS NULL OR matched_entity_type IS NOT NULL),
  CHECK(confidence_score >= 0 AND confidence_score <= 1)
);

-- =====================================================
-- INDEXES
-- =====================================================

-- Credit card accounts indexes
CREATE INDEX IF NOT EXISTS idx_credit_card_accounts_company ON credit_card_accounts(company_id);
CREATE INDEX IF NOT EXISTS idx_credit_card_accounts_active ON credit_card_accounts(is_active);
CREATE INDEX IF NOT EXISTS idx_credit_card_accounts_primary ON credit_card_accounts(is_primary);
CREATE INDEX IF NOT EXISTS idx_credit_card_accounts_chart ON credit_card_accounts(chart_account_id);

-- Credit card statements indexes
CREATE INDEX IF NOT EXISTS idx_credit_card_statements_card ON credit_card_statements(credit_card_id);
CREATE INDEX IF NOT EXISTS idx_credit_card_statements_company ON credit_card_statements(company_id);
CREATE INDEX IF NOT EXISTS idx_credit_card_statements_date ON credit_card_statements(statement_date);
CREATE INDEX IF NOT EXISTS idx_credit_card_statements_status ON credit_card_statements(parse_status);
CREATE INDEX IF NOT EXISTS idx_credit_card_statements_file_hash ON credit_card_statements(file_hash);

-- Credit card transactions indexes
CREATE INDEX IF NOT EXISTS idx_credit_card_transactions_card ON credit_card_transactions(credit_card_id);
CREATE INDEX IF NOT EXISTS idx_credit_card_transactions_company ON credit_card_transactions(company_id);
CREATE INDEX IF NOT EXISTS idx_credit_card_transactions_statement ON credit_card_transactions(statement_id);
CREATE INDEX IF NOT EXISTS idx_credit_card_transactions_date ON credit_card_transactions(transaction_date);
CREATE INDEX IF NOT EXISTS idx_credit_card_transactions_amount ON credit_card_transactions(amount);
CREATE INDEX IF NOT EXISTS idx_credit_card_transactions_status ON credit_card_transactions(match_status);
CREATE INDEX IF NOT EXISTS idx_credit_card_transactions_type ON credit_card_transactions(transaction_type);
CREATE INDEX IF NOT EXISTS idx_credit_card_transactions_match ON credit_card_transactions(matched_entity_type, matched_entity_id);
CREATE INDEX IF NOT EXISTS idx_credit_card_transactions_gl ON credit_card_transactions(gl_transaction_id);
CREATE INDEX IF NOT EXISTS idx_credit_card_transactions_liability ON credit_card_transactions(liability_gl_transaction_id);
CREATE INDEX IF NOT EXISTS idx_credit_card_transactions_confidence ON credit_card_transactions(confidence_score);

-- =====================================================
-- ROW LEVEL SECURITY
-- =====================================================

-- Enable RLS on all tables
ALTER TABLE credit_card_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_card_statements ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_card_transactions ENABLE ROW LEVEL SECURITY;

-- Credit card accounts RLS
CREATE POLICY "Users can view their company credit card accounts"
  ON credit_card_accounts FOR SELECT
  TO authenticated
  USING (
    company_id IN (SELECT company_id FROM user_profiles WHERE id = auth.uid())
  );

CREATE POLICY "Users can manage their company credit card accounts"
  ON credit_card_accounts FOR ALL
  TO authenticated
  USING (
    company_id IN (SELECT company_id FROM user_profiles WHERE id = auth.uid())
  );

-- Credit card statements RLS
CREATE POLICY "Users can view their company credit card statements"
  ON credit_card_statements FOR SELECT
  TO authenticated
  USING (
    company_id IN (SELECT company_id FROM user_profiles WHERE id = auth.uid())
  );

CREATE POLICY "Users can manage their company credit card statements"
  ON credit_card_statements FOR ALL
  TO authenticated
  USING (
    company_id IN (SELECT company_id FROM user_profiles WHERE id = auth.uid())
  );

-- Credit card transactions RLS
CREATE POLICY "Users can view their company credit card transactions"
  ON credit_card_transactions FOR SELECT
  TO authenticated
  USING (
    company_id IN (SELECT company_id FROM user_profiles WHERE id = auth.uid())
  );

CREATE POLICY "Users can manage their company credit card transactions"
  ON credit_card_transactions FOR ALL
  TO authenticated
  USING (
    company_id IN (SELECT company_id FROM user_profiles WHERE id = auth.uid())
  );

-- =====================================================
-- TRIGGERS FOR UPDATED_AT
-- =====================================================

CREATE OR REPLACE FUNCTION update_credit_card_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_credit_card_accounts_updated_at
  BEFORE UPDATE ON credit_card_accounts
  FOR EACH ROW
  EXECUTE FUNCTION update_credit_card_updated_at();

CREATE TRIGGER set_credit_card_statements_updated_at
  BEFORE UPDATE ON credit_card_statements
  FOR EACH ROW
  EXECUTE FUNCTION update_credit_card_updated_at();

CREATE TRIGGER set_credit_card_transactions_updated_at
  BEFORE UPDATE ON credit_card_transactions
  FOR EACH ROW
  EXECUTE FUNCTION update_credit_card_updated_at();

-- =====================================================
-- TRIGGERS FOR AUTOMATIC UPDATES
-- =====================================================

-- Update statement transaction counts when transactions are added/updated
CREATE OR REPLACE FUNCTION update_credit_card_statement_transaction_counts()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' OR TG_OP = 'DELETE' THEN
    UPDATE credit_card_statements 
    SET 
      transaction_count = (
        SELECT COUNT(*) 
        FROM credit_card_transactions 
        WHERE statement_id = COALESCE(NEW.statement_id, OLD.statement_id)
      ),
      matched_count = (
        SELECT COUNT(*) 
        FROM credit_card_transactions 
        WHERE statement_id = COALESCE(NEW.statement_id, OLD.statement_id)
          AND match_status IN ('matched', 'reconciled')
      )
    WHERE id = COALESCE(NEW.statement_id, OLD.statement_id);
    
    RETURN COALESCE(NEW, OLD);
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_credit_card_statement_transaction_counts
  AFTER INSERT OR UPDATE OR DELETE ON credit_card_transactions
  FOR EACH ROW
  EXECUTE FUNCTION update_credit_card_statement_transaction_counts();

-- Update credit card balance when transactions are posted as liabilities
CREATE OR REPLACE FUNCTION update_credit_card_balance()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' OR TG_OP = 'DELETE' THEN
    -- Update credit card balance (liability increases with charges)
    UPDATE credit_card_accounts 
    SET current_balance = (
      SELECT COALESCE(SUM(amount), 0)
      FROM credit_card_transactions 
      WHERE credit_card_id = COALESCE(NEW.credit_card_id, OLD.credit_card_id)
        AND transaction_type IN ('charge', 'fee', 'interest')
        AND liability_posted = true
    )
    WHERE id = COALESCE(NEW.credit_card_id, OLD.credit_card_id);
    
    RETURN COALESCE(NEW, OLD);
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_credit_card_balance
  AFTER INSERT OR UPDATE OR DELETE ON credit_card_transactions
  FOR EACH ROW
  EXECUTE FUNCTION update_credit_card_balance();

-- =====================================================
-- VIEWS FOR COMMON QUERIES
-- =====================================================

-- Unmatched credit card transactions view
CREATE OR REPLACE VIEW v_unmatched_credit_card_transactions AS
SELECT 
  cct.id,
  cct.credit_card_id,
  cct.company_id,
  cct.transaction_date,
  cct.description,
  cct.amount,
  cct.running_balance,
  cct.transaction_type,
  cct.category,
  cct.merchant_name,
  cct.reference_number,
  cct.confidence_score,
  cct.raw_data,
  cct.created_at,
  cca.card_name,
  cca.card_number_last_4,
  cca.card_type,
  cca.issuer_bank,
  ccs.statement_date,
  ccs.file_name
FROM credit_card_transactions cct
JOIN credit_card_accounts cca ON cct.credit_card_id = cca.id
LEFT JOIN credit_card_statements ccs ON cct.statement_id = ccs.id
WHERE cct.match_status = 'unmatched'
  AND cct.validation_status != 'error'
  AND cct.liability_posted = false
ORDER BY cct.transaction_date DESC, cct.amount DESC;

-- Credit card liability summary view
CREATE OR REPLACE VIEW v_credit_card_liability_summary AS
SELECT 
  cca.company_id,
  cca.id as card_id,
  cca.card_name,
  cca.card_number_last_4,
  cca.card_type,
  cca.issuer_bank,
  cca.credit_limit,
  cca.current_balance,
  cca.available_credit,
  cca.apr,
  COUNT(cct.id) as total_transactions,
  COUNT(cct.id) FILTER (WHERE cct.match_status = 'unmatched') as unmatched_count,
  COUNT(cct.id) FILTER (WHERE cct.liability_posted = true) as posted_count,
  SUM(cct.amount) FILTER (WHERE cct.liability_posted = true) as posted_amount,
  MAX(cct.transaction_date) as latest_transaction_date,
  MIN(cct.transaction_date) as earliest_transaction_date
FROM credit_card_accounts cca
LEFT JOIN credit_card_transactions cct ON cca.id = cct.credit_card_id
WHERE cca.is_active = true
GROUP BY cca.company_id, cca.id, cca.card_name, cca.card_number_last_4, cca.card_type, cca.issuer_bank, cca.credit_limit, cca.current_balance, cca.available_credit, cca.apr
ORDER BY cca.current_balance DESC;

-- =====================================================
-- FUNCTIONS FOR AUTOMATION SUPPORT
-- =====================================================

-- Function to get unmatched credit card transactions for auto-matching
CREATE OR REPLACE FUNCTION get_unmatched_credit_card_transactions(p_company_id uuid, p_limit integer DEFAULT 100)
RETURNS TABLE (
  transaction_id uuid,
  credit_card_id uuid,
  transaction_date date,
  description text,
  amount numeric,
  confidence_score numeric,
  raw_data jsonb
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    cct.id,
    cct.credit_card_id,
    cct.transaction_date,
    cct.description,
    cct.amount,
    cct.confidence_score,
    cct.raw_data
  FROM credit_card_transactions cct
  WHERE cct.company_id = p_company_id
    AND cct.match_status = 'unmatched'
    AND cct.validation_status = 'pending'
    AND cct.confidence_score >= 0.5
    AND cct.liability_posted = false
  ORDER BY cct.confidence_score DESC, cct.amount DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to post credit card transaction as liability
CREATE OR REPLACE FUNCTION post_credit_card_liability(
  p_transaction_id uuid,
  p_description text,
  p_notes text
)
RETURNS boolean AS $$
DECLARE
  v_transaction RECORD;
  v_card_account RECORD;
  v_user_id uuid;
  v_gl_transaction_id uuid;
BEGIN
  -- Get current user
  v_user_id := auth.uid();
  
  -- Get transaction details
  SELECT * INTO v_transaction
  FROM credit_card_transactions 
  WHERE id = p_transaction_id;
  
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  
  -- Get credit card account details
  SELECT * INTO v_card_account
  FROM credit_card_accounts 
  WHERE id = v_transaction.credit_card_id;
  
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  
  -- Create GL transaction for liability posting
  INSERT INTO gl_transactions (
    company_id,
    transaction_number,
    transaction_date,
    description,
    total_amount,
    currency,
    status,
    source_type,
    source_id,
    notes,
    created_by
  ) VALUES (
    v_transaction.company_id,
    'CC-' || TO_CHAR(now(), 'YYYY-MM-DD-HH24MI') || '-' || substr(v_transaction.id::text, 1, 8),
    v_transaction.transaction_date,
    p_description || ' - ' || v_transaction.description,
    v_transaction.amount,
    'USD',
    'posted',
    'credit_card_charge',
    v_transaction.id,
    p_notes,
    v_user_id
  ) RETURNING id INTO v_gl_transaction_id;
  
  -- Update transaction as liability posted
  UPDATE credit_card_transactions 
  SET 
    liability_posted = true,
    liability_gl_transaction_id = v_gl_transaction_id,
    liability_posted_at = now(),
    liability_posted_by = v_user_id,
    updated_at = now()
  WHERE id = p_transaction_id;
  
  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- COMMENT: USAGE NOTES
-- =====================================================

/*
  Credit Card Integration System:
  
  1. Liability Accounting:
     - Credit cards treated as liability accounts (not cash)
     - Charges increase liability balance
     - Payments decrease liability balance
     - Posted to GL as liability transactions
  
  2. Statement Processing:
     - Uses same file storage pattern as bank statements
     - Tracks opening/closing balances and minimum payments
     - Maintains transaction counts and matching status
  
  3. Transaction Matching:
     - Similar to bank transactions but credit card specific
     - Matches to expenses, supplier invoices, payments
     - Confidence scoring for automation prioritization
  
  4. Liability Posting:
     - Separate GL transaction posting for liability accounting
     - Updates credit card balance when liabilities posted
     - Tracks posted vs unposted transactions
  
  5. Integration Points:
     - Reuses Phase 5 bank integration patterns
     - Integrates with Phase 1 chart of accounts (liability accounts)
     - Links to Phase 2 posting engine for rule-based matching
     - Maintains company-based security model
*/
