/*
  Phase 2: Unified Posting Engine - Posting Rules
  
  Creates the posting_rules table that defines how different transaction types
  are automatically mapped to debit/credit accounts in the General Ledger.
  
  This table enables the posting engine to automatically create proper
  double-entry journal entries based on business rules.
*/

-- =====================================================
-- POSTING RULES
-- =====================================================

CREATE TABLE IF NOT EXISTS posting_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  
  -- Rule identification
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
  
  -- Account mapping (required for double-entry)
  debit_account_id uuid NOT NULL REFERENCES chart_of_accounts(id),
  credit_account_id uuid NOT NULL REFERENCES chart_of_accounts(id),
  
  -- Rule conditions (JSON for flexible matching)
  conditions_json jsonb DEFAULT '{}',
  
  -- Rule status
  is_active boolean DEFAULT true,
  
  -- Metadata
  description text,
  priority integer DEFAULT 100, -- Lower number = higher priority
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  
  -- Constraints
  CHECK(debit_account_id != credit_account_id), -- Cannot debit and credit same account
  CHECK(priority >= 1 AND priority <= 999)
);

-- =====================================================
-- INDEXES
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_posting_rules_company ON posting_rules(company_id);
CREATE INDEX IF NOT EXISTS idx_posting_rules_source_type ON posting_rules(source_type);
CREATE INDEX IF NOT EXISTS idx_posting_rules_active ON posting_rules(is_active);
CREATE INDEX IF NOT EXISTS idx_posting_rules_priority ON posting_rules(priority);
CREATE INDEX IF NOT EXISTS idx_posting_rules_debit_account ON posting_rules(debit_account_id);
CREATE INDEX IF NOT EXISTS idx_posting_rules_credit_account ON posting_rules(credit_account_id);

-- =====================================================
-- ROW LEVEL SECURITY
-- =====================================================

ALTER TABLE posting_rules ENABLE ROW LEVEL SECURITY;

-- Users can view their company posting rules
CREATE POLICY "Users can view their company posting rules"
  ON posting_rules FOR SELECT
  TO authenticated
  USING (
    company_id IN (SELECT company_id FROM user_profiles WHERE id = auth.uid())
  );

-- Users can manage their company posting rules
CREATE POLICY "Users can manage their company posting rules"
  ON posting_rules FOR ALL
  TO authenticated
  USING (
    company_id IN (SELECT company_id FROM user_profiles WHERE id = auth.uid())
  );

-- =====================================================
-- TRIGGERS FOR UPDATED_AT
-- =====================================================

CREATE OR REPLACE FUNCTION update_posting_rules_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_posting_rules_updated_at
  BEFORE UPDATE ON posting_rules
  FOR EACH ROW
  EXECUTE FUNCTION update_posting_rules_updated_at();

-- =====================================================
-- CONSTRAINTS TO PREVENT INVALID ACCOUNT MAPPINGS
-- =====================================================

CREATE OR REPLACE FUNCTION validate_posting_rule_accounts()
RETURNS TRIGGER AS $$
DECLARE
  debit_active boolean;
  credit_active boolean;
BEGIN
  -- Check if debit account exists and is active
  SELECT is_active INTO debit_active
  FROM chart_of_accounts 
  WHERE id = NEW.debit_account_id AND company_id = NEW.company_id;
  
  -- Check if credit account exists and is active
  SELECT is_active INTO credit_active
  FROM chart_of_accounts 
  WHERE id = NEW.credit_account_id AND company_id = NEW.company_id;
  
  IF NOT FOUND OR NOT debit_active THEN
    RAISE EXCEPTION 'Debit account must exist and be active';
  END IF;
  
  IF NOT FOUND OR NOT credit_active THEN
    RAISE EXCEPTION 'Credit account must exist and be active';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER validate_posting_rule_accounts_trigger
  BEFORE INSERT OR UPDATE ON posting_rules
  FOR EACH ROW
  EXECUTE FUNCTION validate_posting_rule_accounts();

-- =====================================================
-- VIEWS FOR COMMON QUERIES
-- =====================================================

-- Active posting rules only
CREATE OR REPLACE VIEW v_active_posting_rules AS
SELECT 
  id,
  company_id,
  source_type,
  debit_account_id,
  credit_account_id,
  conditions_json,
  description,
  priority,
  created_at,
  updated_at
FROM posting_rules 
WHERE is_active = true
ORDER BY priority ASC, created_at ASC;

-- Posting rules with account details
CREATE OR REPLACE VIEW v_posting_rules_with_accounts AS
SELECT 
  pr.id,
  pr.company_id,
  pr.source_type,
  pr.debit_account_id,
  pr.credit_account_id,
  pr.conditions_json,
  pr.description,
  pr.priority,
  pr.is_active,
  pr.created_at,
  pr.updated_at,
  debit_account.code as debit_account_code,
  debit_account.name as debit_account_name,
  debit_account.type as debit_account_type,
  credit_account.code as credit_account_code,
  credit_account.name as credit_account_name,
  credit_account.type as credit_account_type
FROM posting_rules pr
JOIN chart_of_accounts debit_account ON pr.debit_account_id = debit_account.id
JOIN chart_of_accounts credit_account ON pr.credit_account_id = credit_account.id
ORDER BY pr.priority ASC, pr.created_at ASC;

-- =====================================================
-- COMMENT: USAGE EXAMPLES
-- =====================================================

/*
  Posting Rules Examples:
  
  1. Client Payment Rule:
  - source_type: 'client_payment'
  - debit_account_id: Bank Account (1000 series)
  - credit_account_id: Accounts Receivable (1100 series)
  - conditions_json: {"payment_method": "check"}
  
  2. Supplier Payment Rule:
  - source_type: 'supplier_payment'  
  - debit_account_id: Accounts Payable (2100 series)
  - credit_account_id: Bank Account (1000 series)
  - conditions_json: {"payment_method": "ach"}
  
  3. Expense Rule:
  - source_type: 'expense'
  - debit_account_id: Expense Account (6000 series)
  - credit_account_id: Bank Account (1000 series)
  - conditions_json: {"category": "materials"}
  
  4. Payroll Rule:
  - source_type: 'payroll'
  - debit_account_id: Payroll Expense (6100 series)
  - credit_account_id: Bank Account (1000 series)
  - conditions_json: {"payment_type": "direct_deposit"}
*/
