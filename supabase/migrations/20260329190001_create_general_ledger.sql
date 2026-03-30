/*
  Phase 1: Accounting Foundation - General Ledger
  
  Creates the General Ledger system with transaction headers and entry lines.
  Implements double-entry bookkeeping with proper validation.
  
  Tables Created:
  - gl_transactions: Transaction headers
  - gl_entries: Transaction line items (debit/credit entries)
*/

-- =====================================================
-- GENERAL LEDGER TRANSACTIONS (HEADERS)
-- =====================================================

CREATE TABLE IF NOT EXISTS gl_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  
  -- Transaction identification
  transaction_number text NOT NULL,
  transaction_date date NOT NULL,
  reference text,
  
  -- Source tracking
  source_type text NOT NULL CHECK (source_type IN (
    'manual', -- Manual journal entry
    'client_payment', -- From client_payments table
    'supplier_payment', -- From supplier_payments table  
    'expense', -- From expenses table
    'payroll', -- From payroll_entries table
    'invoice', -- From client_invoices table
    'procurement', -- From procurements table
    'bank_transfer', -- Bank transfers
    'adjustment', -- Period adjustments
    'opening_balance' -- Initial setup
  )),
  source_id uuid, -- Reference to source record
  
  -- Transaction properties
  description text NOT NULL,
  total_amount numeric(15,2) NOT NULL,
  currency text DEFAULT 'USD',
  
  -- Status
  status text DEFAULT 'draft' CHECK (status IN ('draft', 'posted', 'voided')),
  
  -- Approval workflow
  approved_by uuid REFERENCES auth.users(id),
  approved_at timestamptz,
  posted_by uuid REFERENCES auth.users(id),
  posted_at timestamptz,
  
  -- Metadata
  notes text,
  attachments jsonb DEFAULT '[]', -- Array of file references
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  
  -- Constraints
  UNIQUE(company_id, transaction_number),
  CHECK(total_amount > 0),
  CHECK(posted_at IS NULL OR status = 'posted'),
  CHECK(approved_at IS NULL OR approved_by IS NOT NULL)
);

-- =====================================================
-- GENERAL LEDGER ENTRIES (LINES)
-- =====================================================

CREATE TABLE IF NOT EXISTS gl_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id uuid NOT NULL REFERENCES gl_transactions(id) ON DELETE CASCADE,
  company_id uuid NOT NULL,
  
  -- Account reference
  account_id uuid NOT NULL REFERENCES chart_of_accounts(id),
  
  -- Entry amounts (one of debit or credit must be zero)
  debit numeric(15,2) DEFAULT 0,
  credit numeric(15,2) DEFAULT 0,
  
  -- Project association (nullable for company-level entries)
  project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
  
  -- Entry details
  description text,
  line_number integer NOT NULL,
  
  -- Entry classification
  entry_type text CHECK (entry_type IN ('regular', 'adjustment', 'reclassification', 'opening_balance')),
  
  -- Reconciliation tracking
  reconciled boolean DEFAULT false,
  reconciled_date date,
  reconciled_by uuid REFERENCES auth.users(id),
  
  -- Metadata
  notes text,
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  -- Constraints
  CHECK(debit >= 0 AND credit >= 0),
  CHECK((debit > 0 AND credit = 0) OR (credit > 0 AND debit = 0)), -- One must be zero
  CHECK(line_number > 0),
  UNIQUE(transaction_id, line_number)
);

-- =====================================================
-- INDEXES
-- =====================================================

-- gl_transactions indexes
CREATE INDEX IF NOT EXISTS idx_gl_transactions_company ON gl_transactions(company_id);
CREATE INDEX IF NOT EXISTS idx_gl_transactions_date ON gl_transactions(transaction_date);
CREATE INDEX IF NOT EXISTS idx_gl_transactions_status ON gl_transactions(status);
CREATE INDEX IF NOT EXISTS idx_gl_transactions_source ON gl_transactions(source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_gl_transactions_number ON gl_transactions(transaction_number);

-- gl_entries indexes  
CREATE INDEX IF NOT EXISTS idx_gl_entries_transaction ON gl_entries(transaction_id);
CREATE INDEX IF NOT EXISTS idx_gl_entries_company ON gl_entries(company_id);
CREATE INDEX IF NOT EXISTS idx_gl_entries_account ON gl_entries(account_id);
CREATE INDEX IF NOT EXISTS idx_gl_entries_project ON gl_entries(project_id);
CREATE INDEX IF NOT EXISTS idx_gl_entries_debit ON gl_entries(debit);
CREATE INDEX IF NOT EXISTS idx_gl_entries_credit ON gl_entries(credit);
CREATE INDEX IF NOT EXISTS idx_gl_entries_reconciled ON gl_entries(reconciled);

-- =====================================================
-- ROW LEVEL SECURITY
-- =====================================================

ALTER TABLE gl_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE gl_entries ENABLE ROW LEVEL SECURITY;

-- gl_transactions policies
CREATE POLICY "Users can view their company gl_transactions"
  ON gl_transactions FOR SELECT
  TO authenticated
  USING (
    company_id IN (SELECT company_id FROM user_profiles WHERE id = auth.uid())
  );

CREATE POLICY "Users can manage their company gl_transactions"
  ON gl_transactions FOR ALL
  TO authenticated
  USING (
    company_id IN (SELECT company_id FROM user_profiles WHERE id = auth.uid())
  );

-- gl_entries policies
CREATE POLICY "Users can view their company gl_entries"
  ON gl_entries FOR SELECT
  TO authenticated
  USING (
    company_id IN (SELECT company_id FROM user_profiles WHERE id = auth.uid())
  );

CREATE POLICY "Users can manage their company gl_entries"
  ON gl_entries FOR ALL
  TO authenticated
  USING (
    company_id IN (SELECT company_id FROM user_profiles WHERE id = auth.uid())
  );

-- =====================================================
-- TRIGGERS FOR UPDATED_AT
-- =====================================================

CREATE OR REPLACE FUNCTION update_gl_transactions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_gl_transactions_updated_at
  BEFORE UPDATE ON gl_transactions
  FOR EACH ROW
  EXECUTE FUNCTION update_gl_transactions_updated_at();

CREATE OR REPLACE FUNCTION update_gl_entries_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_gl_entries_updated_at
  BEFORE UPDATE ON gl_entries
  FOR EACH ROW
  EXECUTE FUNCTION update_gl_entries_updated_at();

-- =====================================================
-- DOUBLE-ENTRY VALIDATION FUNCTION
-- =====================================================

CREATE OR REPLACE FUNCTION validate_double_entry_balance()
RETURNS TRIGGER AS $$
DECLARE
  total_debit numeric;
  total_credit numeric;
  balance_diff numeric;
BEGIN
  -- Calculate total debits and credits for this transaction
  SELECT 
    COALESCE(SUM(debit), 0),
    COALESCE(SUM(credit), 0)
  INTO total_debit, total_credit
  FROM gl_entries 
  WHERE transaction_id = COALESCE(NEW.transaction_id, OLD.transaction_id);
  
  -- Calculate difference
  balance_diff := total_debit - total_credit;
  
  -- Allow small floating point differences (0.01 tolerance)
  IF ABS(balance_diff) > 0.01 THEN
    RAISE EXCEPTION 'Double-entry balance violation: debits (%) != credits (%)', 
      total_debit, total_credit;
  END IF;
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Trigger to validate balance on gl_entries changes
CREATE TRIGGER validate_gl_entries_balance
  AFTER INSERT OR UPDATE OR DELETE ON gl_entries
  FOR EACH STATEMENT
  EXECUTE FUNCTION validate_double_entry_balance();

-- =====================================================
-- ACCOUNT BALANCE UPDATING FUNCTION
-- =====================================================

CREATE OR REPLACE FUNCTION update_account_balance()
RETURNS TRIGGER AS $$
DECLARE
  net_change numeric;
BEGIN
  -- Calculate net change for this entry
  net_change := COALESCE(NEW.debit, 0) - COALESCE(OLD.debit, 0) 
              - COALESCE(NEW.credit, 0) + COALESCE(OLD.credit, 0);
  
  -- Update account balance (only for posted transactions)
  IF TG_OP = 'DELETE' THEN
    UPDATE chart_of_accounts 
    SET current_balance = current_balance - (OLD.debit - OLD.credit)
    WHERE id = OLD.account_id;
  ELSIF TG_OP = 'INSERT' THEN
    -- Only update if transaction is posted
    UPDATE chart_of_accounts 
    SET current_balance = current_balance + (NEW.debit - NEW.credit)
    WHERE id = NEW.account_id
    AND EXISTS (
      SELECT 1 FROM gl_transactions 
      WHERE id = NEW.transaction_id 
      AND status = 'posted'
    );
  ELSIF TG_OP = 'UPDATE' THEN
    -- Handle balance changes for updates
    IF OLD.transaction_id = NEW.transaction_id THEN
      -- Same transaction, update difference
      UPDATE chart_of_accounts 
      SET current_balance = current_balance + net_change
      WHERE id = NEW.account_id
      AND EXISTS (
        SELECT 1 FROM gl_transactions 
        WHERE id = NEW.transaction_id 
        AND status = 'posted'
      );
    ELSE
      -- Transaction changed, remove old and add new
      UPDATE chart_of_accounts 
      SET current_balance = current_balance - (OLD.debit - OLD.credit)
      WHERE id = OLD.account_id
      AND EXISTS (
        SELECT 1 FROM gl_transactions 
        WHERE id = OLD.transaction_id 
        AND status = 'posted'
      );
      
      UPDATE chart_of_accounts 
      SET current_balance = current_balance + (NEW.debit - NEW.credit)
      WHERE id = NEW.account_id
      AND EXISTS (
        SELECT 1 FROM gl_transactions 
        WHERE id = NEW.transaction_id 
        AND status = 'posted'
      );
    END IF;
  END IF;
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Trigger to update account balances
CREATE TRIGGER update_gl_account_balance
  AFTER INSERT OR UPDATE OR DELETE ON gl_entries
  FOR EACH ROW
  EXECUTE FUNCTION update_account_balance();

-- =====================================================
-- TRANSACTION POSTING VALIDATION
-- =====================================================

CREATE OR REPLACE FUNCTION validate_transaction_posting()
RETURNS TRIGGER AS $$
DECLARE
  entry_count integer;
  has_debit boolean;
  has_credit boolean;
  account_active boolean;
  project_linkable_check boolean;
BEGIN
  -- Only validate when posting
  IF NEW.status = 'posted' AND OLD.status != 'posted' THEN
    -- Check transaction has at least 2 entries
    SELECT COUNT(*) INTO entry_count
    FROM gl_entries 
    WHERE transaction_id = NEW.id;
    
    IF entry_count < 2 THEN
      RAISE EXCEPTION 'Transaction must have at least 2 entries to post';
    END IF;
    
    -- Check transaction has both debits and credits
    SELECT COUNT(*) > 0 INTO has_debit
    FROM gl_entries 
    WHERE transaction_id = NEW.id AND debit > 0;
    
    SELECT COUNT(*) > 0 INTO has_credit
    FROM gl_entries 
    WHERE transaction_id = NEW.id AND credit > 0;
    
    IF NOT (has_debit AND has_credit) THEN
      RAISE EXCEPTION 'Transaction must have both debits and credits to post';
    END IF;
    
    -- Check all accounts are active
    SELECT COUNT(*) = 0 INTO account_active
    FROM gl_entries ge
    JOIN chart_of_accounts co ON ge.account_id = co.id
    WHERE ge.transaction_id = NEW.id AND co.is_active = false;
    
    IF NOT account_active THEN
      RAISE EXCEPTION 'Cannot post transaction with inactive accounts';
    END IF;
    
    -- Check project-linkable rules
    SELECT COUNT(*) > 0 INTO project_linkable_check
    FROM gl_entries ge
    JOIN chart_of_accounts co ON ge.account_id = co.id
    WHERE ge.transaction_id = NEW.id 
    AND co.is_project_linkable = true 
    AND ge.project_id IS NULL;
    
    IF project_linkable_check THEN
      RAISE EXCEPTION 'Project-linkable accounts must have project_id specified';
    END IF;
    
    -- Set posting info
    NEW.posted_at = now();
    NEW.posted_by = auth.uid();
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER validate_gl_transaction_posting
  BEFORE UPDATE ON gl_transactions
  FOR EACH ROW
  EXECUTE FUNCTION validate_transaction_posting();

-- =====================================================
-- VIEWS FOR COMMON QUERIES
-- =====================================================

-- Posted transactions only
CREATE OR REPLACE VIEW v_posted_gl_transactions AS
SELECT 
  id,
  company_id,
  transaction_number,
  transaction_date,
  reference,
  source_type,
  source_id,
  description,
  total_amount,
  currency,
  posted_by,
  posted_at,
  notes,
  attachments
FROM gl_transactions 
WHERE status = 'posted'
ORDER BY transaction_date DESC, transaction_number DESC;

-- Posted entries with account details
CREATE OR REPLACE VIEW v_posted_gl_entries AS
SELECT 
  ge.id,
  ge.transaction_id,
  ge.company_id,
  ge.account_id,
  co.code as account_code,
  co.name as account_name,
  co.type as account_type,
  co.subtype as account_subtype,
  ge.debit,
  ge.credit,
  ge.project_id,
  p.name as project_name,
  ge.description,
  ge.line_number,
  ge.entry_type,
  ge.reconciled,
  ge.reconciled_date,
  ge.notes,
  gt.transaction_date,
  gt.transaction_number,
  gt.source_type,
  gt.source_id
FROM gl_entries ge
JOIN gl_transactions gt ON ge.transaction_id = gt.id
JOIN chart_of_accounts co ON ge.account_id = co.id
LEFT JOIN projects p ON ge.project_id = p.id
WHERE gt.status = 'posted'
ORDER BY gt.transaction_date DESC, gt.transaction_number DESC, ge.line_number;

-- Account balance view
CREATE OR REPLACE VIEW v_account_balances AS
SELECT 
  co.id,
  co.company_id,
  co.code,
  co.name,
  co.type,
  co.subtype,
  co.current_balance,
  co.opening_balance,
  co.is_project_linkable,
  co.is_owner_private,
  co.parent_id,
  co.level,
  -- Calculate period balances
  (SELECT COALESCE(SUM(debit - credit), 0) 
   FROM gl_entries ge 
   JOIN gl_transactions gt ON ge.transaction_id = gt.id
   WHERE ge.account_id = co.id 
   AND gt.status = 'posted'
   AND gt.transaction_date >= CURRENT_DATE - INTERVAL '30 days') as balance_30_days,
  (SELECT COALESCE(SUM(debit - credit), 0) 
   FROM gl_entries ge 
   JOIN gl_transactions gt ON ge.transaction_id = gt.id
   WHERE ge.account_id = co.id 
   AND gt.status = 'posted'
   AND gt.transaction_date >= CURRENT_DATE - INTERVAL '90 days') as balance_90_days
FROM chart_of_accounts co
WHERE co.is_active = true
ORDER BY co.code;
