/*
  Phase 1: Accounting Foundation - Chart of Accounts
  
  Creates the core Chart of Accounts structure for the General Ledger system.
  This is the foundation for all financial accounting in Magnus System v3.
  
  Tables Created:
  - chart_of_accounts: Master account structure with hierarchy
*/

-- =====================================================
-- CHART OF ACCOUNTS
-- =====================================================

CREATE TABLE IF NOT EXISTS chart_of_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  
  -- Account identification
  code text NOT NULL,
  name text NOT NULL,
  
  -- Account classification
  type text NOT NULL CHECK (type IN ('asset', 'liability', 'equity', 'revenue', 'expense')),
  subtype text CHECK (subtype IN (
    -- Asset subtypes
    'current_asset', 'fixed_asset', 'bank', 'accounts_receivable', 'inventory', 'prepaid_expense',
    -- Liability subtypes  
    'current_liability', 'long_term_liability', 'accounts_payable', 'accrued_expense', 'deferred_revenue',
    -- Equity subtypes
    'owner_equity', 'retained_earnings', 'common_stock', 'additional_paid_in_capital',
    -- Revenue subtypes
    'service_revenue', 'product_revenue', 'other_revenue',
    -- Expense subtypes
    'operating_expense', 'cost_of_goods_sold', 'selling_expense', 'administrative_expense', 'payroll_expense', 'other_expense'
  )),
  
  -- Account properties
  is_project_linkable boolean DEFAULT false,
  is_owner_private boolean DEFAULT false,
  is_active boolean DEFAULT true,
  
  -- Hierarchy
  parent_id uuid REFERENCES chart_of_accounts(id) ON DELETE SET NULL,
  level integer,
  
  -- Balance tracking
  opening_balance numeric(15,2) DEFAULT 0,
  current_balance numeric(15,2) DEFAULT 0,
  
  -- Metadata
  description text,
  notes text,
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  
  -- Constraints
  UNIQUE(company_id, code),
  CHECK(level >= 1 AND level <= 10),
  CHECK(opening_balance >= 0 OR type IN ('asset', 'expense', 'revenue')), -- Contra-accounts can have negative opening balances
  CHECK(current_balance >= 0 OR type IN ('asset', 'expense', 'revenue'))
);

-- =====================================================
-- INDEXES
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_chart_of_accounts_company ON chart_of_accounts(company_id);
CREATE INDEX IF NOT EXISTS idx_chart_of_accounts_type ON chart_of_accounts(type);
CREATE INDEX IF NOT EXISTS idx_chart_of_accounts_subtype ON chart_of_accounts(subtype);
CREATE INDEX IF NOT EXISTS idx_chart_of_accounts_parent ON chart_of_accounts(parent_id);
CREATE INDEX IF NOT EXISTS idx_chart_of_accounts_active ON chart_of_accounts(is_active);
CREATE INDEX IF NOT EXISTS idx_chart_of_accounts_project_linkable ON chart_of_accounts(is_project_linkable);
CREATE INDEX IF NOT EXISTS idx_chart_of_accounts_owner_private ON chart_of_accounts(is_owner_private);

-- =====================================================
-- ROW LEVEL SECURITY
-- =====================================================

ALTER TABLE chart_of_accounts ENABLE ROW LEVEL SECURITY;

-- Users can view their company's chart of accounts
CREATE POLICY "Users can view their company chart of accounts"
  ON chart_of_accounts FOR SELECT
  TO authenticated
  USING (
    company_id IN (SELECT company_id FROM user_profiles WHERE id = auth.uid())
  );

-- Users can manage their company's chart of accounts
CREATE POLICY "Users can manage their company chart of accounts"
  ON chart_of_accounts FOR ALL
  TO authenticated
  USING (
    company_id IN (SELECT company_id FROM user_profiles WHERE id = auth.uid())
  );

-- =====================================================
-- TRIGGERS FOR UPDATED_AT
-- =====================================================

CREATE OR REPLACE FUNCTION update_chart_of_accounts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_chart_of_accounts_updated_at
  BEFORE UPDATE ON chart_of_accounts
  FOR EACH ROW
  EXECUTE FUNCTION update_chart_of_accounts_updated_at();

-- =====================================================
-- CONSTRAINTS TO PREVENT CIRCULAR REFERENCES
-- =====================================================

CREATE OR REPLACE FUNCTION prevent_chart_of_accounts_circular_reference()
RETURNS TRIGGER AS $$
BEGIN
  -- Prevent self-reference
  IF NEW.id = NEW.parent_id THEN
    RAISE EXCEPTION 'Account cannot be its own parent';
  END IF;
  
  -- Prevent circular references by checking the parent chain
  IF NEW.parent_id IS NOT NULL THEN
    WITH RECURSIVE parent_chain AS (
      SELECT parent_id, 1 as depth
      FROM chart_of_accounts 
      WHERE id = NEW.id
      
      UNION ALL
      
      SELECT co.parent_id, pc.depth + 1
      FROM chart_of_accounts co
      JOIN parent_chain pc ON co.id = pc.parent_id
      WHERE pc.depth < 10
    )
    SELECT 1 FROM parent_chain WHERE parent_id = NEW.id;
    
    IF FOUND THEN
      RAISE EXCEPTION 'Circular reference detected in account hierarchy';
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER prevent_chart_of_accounts_circular_reference_trigger
  BEFORE INSERT OR UPDATE ON chart_of_accounts
  FOR EACH ROW
  EXECUTE FUNCTION prevent_chart_of_accounts_circular_reference();

-- =====================================================
-- VIEWS FOR COMMON ACCOUNT QUERIES
-- =====================================================

-- Active accounts only
CREATE OR REPLACE VIEW v_active_chart_of_accounts AS
SELECT 
  id,
  company_id,
  code,
  name,
  type,
  subtype,
  is_project_linkable,
  is_owner_private,
  parent_id,
  level,
  current_balance,
  description,
  created_at,
  updated_at
FROM chart_of_accounts 
WHERE is_active = true;

-- Project-linkable accounts only
CREATE OR REPLACE VIEW v_project_linkable_accounts AS
SELECT 
  id,
  company_id,
  code,
  name,
  type,
  subtype,
  parent_id,
  level,
  current_balance,
  description
FROM chart_of_accounts 
WHERE is_active = true AND is_project_linkable = true;

-- Owner private accounts only
CREATE OR REPLACE VIEW v_owner_private_accounts AS
SELECT 
  id,
  company_id,
  code,
  name,
  type,
  subtype,
  parent_id,
  level,
  current_balance,
  description
FROM chart_of_accounts 
WHERE is_active = true AND is_owner_private = true;

-- Account hierarchy view
CREATE OR REPLACE VIEW v_account_hierarchy AS
WITH RECURSIVE account_tree AS (
  -- Base case: root accounts (no parent)
  SELECT 
    id,
    company_id,
    code,
    name,
    type,
    subtype,
    is_project_linkable,
    is_owner_private,
    parent_id,
    level,
    current_balance,
    description,
    ARRAY[name] as path,
    ARRAY[id] as id_path
  FROM chart_of_accounts 
  WHERE parent_id IS NULL AND is_active = true
  
  UNION ALL
  
  -- Recursive case: child accounts
  SELECT 
    c.id,
    c.company_id,
    c.code,
    c.name,
    c.type,
    c.subtype,
    c.is_project_linkable,
    c.is_owner_private,
    c.parent_id,
    c.level,
    c.current_balance,
    c.description,
    at.path || c.name,
    at.id_path || c.id
  FROM chart_of_accounts c
  JOIN account_tree at ON c.parent_id = at.id
  WHERE c.is_active = true
)
SELECT 
  id,
  company_id,
  code,
  name,
  type,
  subtype,
  is_project_linkable,
  is_owner_private,
  parent_id,
  level,
  current_balance,
  description,
  path,
  id_path
FROM account_tree
ORDER BY id_path;
