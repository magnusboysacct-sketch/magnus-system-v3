/*
  Phase 4: Owner Finance - Owner Accounts, Draws, and Salary
  
  Creates the owner finance system that tracks owner equity, draws, and salary
  while protecting project funds, committed costs, and operational cash.
  
  Tables Created:
  - owner_accounts: Owner equity and draw accounts
  - owner_draws: Owner draw requests with safety evaluation
  - owner_salary: Owner salary configuration and tracking
  
  This integrates with:
  - Phase 3 project financials for cash protection
  - Phase 1 chart of accounts for owner equity tracking
  - Existing user_profiles for company isolation
*/

-- =====================================================
-- OWNER ACCOUNTS
-- =====================================================

CREATE TABLE IF NOT EXISTS owner_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id uuid NOT NULL,
  
  -- Account classification
  account_type text NOT NULL CHECK (account_type IN ('equity', 'draw', 'salary')),
  
  -- Account balances
  balance numeric(15,2) DEFAULT 0 CHECK (balance >= 0),
  
  -- Account details
  description text,
  is_active boolean DEFAULT true,
  
  -- Chart of accounts integration
  chart_account_id uuid REFERENCES chart_of_accounts(id) ON DELETE SET NULL,
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  
  -- Constraints
  UNIQUE(owner_id, company_id, account_type),
  CHECK(balance >= 0)
);

-- =====================================================
-- OWNER DRAWS
-- =====================================================

CREATE TABLE IF NOT EXISTS owner_draws (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id uuid NOT NULL,
  
  -- Draw details
  amount numeric(15,2) NOT NULL CHECK (amount > 0),
  draw_date date NOT NULL,
  
  -- Safety evaluation
  safety_status text NOT NULL DEFAULT 'SAFE' CHECK (safety_status IN ('SAFE', 'CAUTION', 'BLOCK')),
  safety_reason text,
  protection_level numeric(5,2) DEFAULT 0, -- Percentage of available cash protected
  
  -- Draw status
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'processed', 'rejected', 'cancelled')),
  
  -- Processing details
  approved_by uuid REFERENCES auth.users(id),
  approved_at timestamptz,
  processed_by uuid REFERENCES auth.users(id),
  processed_at timestamptz,
  bank_account_id uuid REFERENCES bank_accounts(id) ON DELETE SET NULL,
  
  -- Draw purpose
  purpose text,
  notes text,
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  
  -- Constraints
  CHECK(draw_date <= CURRENT_DATE),
  CHECK(approved_at IS NULL OR approved_by IS NOT NULL),
  CHECK(processed_at IS NULL OR processed_by IS NOT NULL)
);

-- =====================================================
-- OWNER SALARY
-- =====================================================

CREATE TABLE IF NOT EXISTS owner_salary (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id uuid NOT NULL,
  
  -- Salary details
  amount numeric(15,2) NOT NULL CHECK (amount >= 0),
  frequency text NOT NULL CHECK (frequency IN ('weekly', 'biweekly', 'monthly', 'quarterly', 'annual')),
  
  -- Payment processing
  next_payment_date date,
  last_payment_date date,
  
  -- Salary status
  is_active boolean DEFAULT true,
  is_taxable boolean DEFAULT true,
  
  -- Tax and deductions
  tax_withholding_rate numeric(5,2) DEFAULT 0 CHECK (tax_withholding_rate >= 0 AND tax_withholding_rate <= 100),
  other_deductions numeric(15,2) DEFAULT 0 CHECK (other_deductions >= 0),
  
  -- Bank account for payments
  bank_account_id uuid REFERENCES bank_accounts(id) ON DELETE SET NULL,
  
  -- Salary details
  job_title text,
  employment_type text CHECK (employment_type IN ('full_time', 'part_time', 'contract', 'consultant')),
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  
  -- Constraints
  CHECK(next_payment_date >= CURRENT_DATE OR next_payment_date IS NULL),
  CHECK(last_payment_date <= CURRENT_DATE OR last_payment_date IS NULL)
);

-- =====================================================
-- INDEXES
-- =====================================================

-- Owner accounts indexes
CREATE INDEX IF NOT EXISTS idx_owner_accounts_owner ON owner_accounts(owner_id);
CREATE INDEX IF NOT EXISTS idx_owner_accounts_company ON owner_accounts(company_id);
CREATE INDEX IF NOT EXISTS idx_owner_accounts_type ON owner_accounts(account_type);
CREATE INDEX IF NOT EXISTS idx_owner_accounts_active ON owner_accounts(is_active);

-- Owner draws indexes
CREATE INDEX IF NOT EXISTS idx_owner_draws_owner ON owner_draws(owner_id);
CREATE INDEX IF NOT EXISTS idx_owner_draws_company ON owner_draws(company_id);
CREATE INDEX IF NOT EXISTS idx_owner_draws_date ON owner_draws(draw_date);
CREATE INDEX IF NOT EXISTS idx_owner_draws_status ON owner_draws(status);
CREATE INDEX IF NOT EXISTS idx_owner_draws_safety ON owner_draws(safety_status);

-- Owner salary indexes
CREATE INDEX IF NOT EXISTS idx_owner_salary_owner ON owner_salary(owner_id);
CREATE INDEX IF NOT EXISTS idx_owner_salary_company ON owner_salary(company_id);
CREATE INDEX IF NOT EXISTS idx_owner_salary_active ON owner_salary(is_active);
CREATE INDEX IF NOT EXISTS idx_owner_salary_next_payment ON owner_salary(next_payment_date);

-- =====================================================
-- ROW LEVEL SECURITY
-- =====================================================

-- Enable RLS on all tables
ALTER TABLE owner_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE owner_draws ENABLE ROW LEVEL SECURITY;
ALTER TABLE owner_salary ENABLE ROW LEVEL SECURITY;

-- Owner accounts RLS
CREATE POLICY "Owners can view their own accounts"
  ON owner_accounts FOR SELECT
  TO authenticated
  USING (
    owner_id = auth.uid()
  );

CREATE POLICY "Users can view their company owner accounts"
  ON owner_accounts FOR SELECT
  TO authenticated
  USING (
    company_id IN (SELECT company_id FROM user_profiles WHERE id = auth.uid())
  );

CREATE POLICY "Users can manage their company owner accounts"
  ON owner_accounts FOR ALL
  TO authenticated
  USING (
    company_id IN (SELECT company_id FROM user_profiles WHERE id = auth.uid())
  );

-- Owner draws RLS
CREATE POLICY "Owners can view their own draws"
  ON owner_draws FOR SELECT
  TO authenticated
  USING (
    owner_id = auth.uid()
  );

CREATE POLICY "Users can view their company owner draws"
  ON owner_draws FOR SELECT
  TO authenticated
  USING (
    company_id IN (SELECT company_id FROM user_profiles WHERE id = auth.uid())
  );

CREATE POLICY "Users can manage their company owner draws"
  ON owner_draws FOR ALL
  TO authenticated
  USING (
    company_id IN (SELECT company_id FROM user_profiles WHERE id = auth.uid())
  );

-- Owner salary RLS
CREATE POLICY "Owners can view their own salary"
  ON owner_salary FOR SELECT
  TO authenticated
  USING (
    owner_id = auth.uid()
  );

CREATE POLICY "Users can view their company owner salary"
  ON owner_salary FOR SELECT
  TO authenticated
  USING (
    company_id IN (SELECT company_id FROM user_profiles WHERE id = auth.uid())
  );

CREATE POLICY "Users can manage their company owner salary"
  ON owner_salary FOR ALL
  TO authenticated
  USING (
    company_id IN (SELECT company_id FROM user_profiles WHERE id = auth.uid())
  );

-- =====================================================
-- TRIGGERS FOR UPDATED_AT
-- =====================================================

CREATE OR REPLACE FUNCTION update_owner_finance_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_owner_accounts_updated_at
  BEFORE UPDATE ON owner_accounts
  FOR EACH ROW
  EXECUTE FUNCTION update_owner_finance_updated_at();

CREATE TRIGGER set_owner_draws_updated_at
  BEFORE UPDATE ON owner_draws
  FOR EACH ROW
  EXECUTE FUNCTION update_owner_finance_updated_at();

CREATE TRIGGER set_owner_salary_updated_at
  BEFORE UPDATE ON owner_salary
  FOR EACH ROW
  EXECUTE FUNCTION update_owner_finance_updated_at();

-- =====================================================
-- TRIGGERS FOR AUTOMATIC UPDATES
-- =====================================================

-- Update owner account balance when draws are processed
CREATE OR REPLACE FUNCTION update_owner_account_balance()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status != 'processed' AND NEW.status = 'processed' THEN
    -- Update draw account balance
    UPDATE owner_accounts 
    SET balance = balance + NEW.amount
    WHERE owner_id = NEW.owner_id 
      AND company_id = NEW.company_id 
      AND account_type = 'draw';
    
    -- Create corresponding GL entry for owner draw
    INSERT INTO gl_entries (
      transaction_id,
      company_id,
      account_id,
      debit,
      credit,
      description,
      line_number,
      entry_type
    )
    SELECT 
      gen_random_uuid(),
      NEW.company_id,
      oa.chart_account_id,
      NEW.amount,
      0,
      'Owner draw: ' || COALESCE(NEW.purpose, 'Personal draw'),
      1,
      'regular'
    FROM owner_accounts oa
    WHERE oa.owner_id = NEW.owner_id 
      AND oa.company_id = NEW.company_id 
      AND oa.account_type = 'draw'
      AND oa.chart_account_id IS NOT NULL;
      
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_owner_account_balance
  AFTER UPDATE ON owner_draws
  FOR EACH ROW
  EXECUTE FUNCTION update_owner_account_balance();

-- =====================================================
-- VIEWS FOR COMMON QUERIES
-- =====================================================

-- Owner financial summary view
CREATE OR REPLACE VIEW v_owner_financial_summary AS
SELECT 
  oa.owner_id,
  oa.company_id,
  up.email as owner_email,
  up.full_name as owner_name,
  
  -- Account balances
  COALESCE(equity.balance, 0) as equity_balance,
  COALESCE(draw.balance, 0) as draw_balance,
  COALESCE(salary.amount, 0) as salary_amount,
  salary.frequency as salary_frequency,
  salary.next_payment_date,
  
  -- Recent draw activity
  recent_draws.total_draws,
  recent_draws.pending_draws,
  recent_draws.processed_draws,
  
  -- Draw safety metrics
  draw_safety.safe_draws,
  draw_safety.caution_draws,
  draw_safety.blocked_draws,
  draw_safety.avg_protection_level

FROM owner_accounts oa
JOIN user_profiles up ON oa.owner_id = up.id
LEFT JOIN LATERAL (
  SELECT balance, chart_account_id
  FROM owner_accounts 
  WHERE owner_id = oa.owner_id 
    AND company_id = oa.company_id 
    AND account_type = 'equity'
    AND is_active = true
) equity ON true
LEFT JOIN LATERAL (
  SELECT balance, chart_account_id
  FROM owner_accounts 
  WHERE owner_id = oa.owner_id 
    AND company_id = oa.company_id 
    AND account_type = 'draw'
    AND is_active = true
) draw ON true
LEFT JOIN LATERAL (
  SELECT amount, frequency, next_payment_date
  FROM owner_salary 
  WHERE owner_id = oa.owner_id 
    AND company_id = oa.company_id 
    AND is_active = true
) salary ON true
LEFT JOIN LATERAL (
  SELECT 
    COUNT(*) FILTER (WHERE draw_date >= CURRENT_DATE - INTERVAL '30 days') as total_draws,
    COUNT(*) FILTER (WHERE status = 'pending') as pending_draws,
    COUNT(*) FILTER (WHERE status = 'processed') as processed_draws
  FROM owner_draws 
  WHERE owner_id = oa.owner_id 
    AND company_id = oa.company_id
    AND draw_date >= CURRENT_DATE - INTERVAL '30 days'
) recent_draws ON true
LEFT JOIN LATERAL (
  SELECT 
    COUNT(*) FILTER (WHERE safety_status = 'SAFE') as safe_draws,
    COUNT(*) FILTER (WHERE safety_status = 'CAUTION') as caution_draws,
    COUNT(*) FILTER (WHERE safety_status = 'BLOCK') as blocked_draws,
    COALESCE(AVG(protection_level), 0) as avg_protection_level
  FROM owner_draws 
  WHERE owner_id = oa.owner_id 
    AND company_id = oa.company_id
    AND draw_date >= CURRENT_DATE - INTERVAL '90 days'
) draw_safety ON true;

-- =====================================================
-- FUNCTIONS FOR CASH PROTECTION CALCULATIONS
-- =====================================================

-- Function to calculate free cash for owner draws
CREATE OR REPLACE FUNCTION calculate_free_cash(p_company_id uuid)
RETURNS numeric(15,2) AS $$
DECLARE
  total_cash numeric(15,2) := 0;
  project_funds numeric(15,2) := 0;
  committed_costs numeric(15,2) := 0;
  operational_reserve numeric(15,2) := 0;
  free_cash numeric(15,2) := 0;
BEGIN
  -- Get total cash from bank accounts
  SELECT COALESCE(SUM(balance), 0) INTO total_cash
  FROM bank_accounts 
  WHERE company_id = p_company_id 
    AND is_active = true;
  
  -- Get project funds that must be protected
  SELECT COALESCE(SUM(remaining_budget), 0) INTO project_funds
  FROM v_project_financial_summary 
  WHERE company_id = p_company_id;
  
  -- Get committed costs that must be protected
  SELECT COALESCE(SUM(remaining_commitment), 0) INTO committed_costs
  FROM v_project_financial_summary 
  WHERE company_id = p_company_id;
  
  -- Calculate operational reserve (15% of monthly expenses or minimum $10,000)
  SELECT GREATEST(
    COALESCE(SUM(amount), 0) * 0.15, -- 15% of recent monthly expenses
    10000 -- Minimum operational reserve
  ) INTO operational_reserve
  FROM project_costs 
  WHERE company_id = p_company_id 
    AND cost_date >= CURRENT_DATE - INTERVAL '30 days'
    AND status = 'approved';
  
  -- Calculate free cash (total cash - protected funds)
  free_cash := total_cash - project_funds - committed_costs - operational_reserve;
  
  -- Ensure free cash is not negative
  RETURN GREATEST(free_cash, 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to evaluate draw safety
CREATE OR REPLACE FUNCTION evaluate_draw_safety(p_amount numeric, p_company_id uuid)
RETURNS text AS $$
DECLARE
  free_cash numeric(15,2);
  safety_threshold_high numeric(15,2) := 0.25; -- 25% of free cash
  safety_threshold_low numeric(15,2) := 0.10;   -- 10% of free cash
BEGIN
  -- Calculate available free cash
  free_cash := calculate_free_cash(p_company_id);
  
  -- Evaluate safety status
  IF p_amount > free_cash * safety_threshold_high THEN
    RETURN 'BLOCK';
  ELSIF p_amount > free_cash * safety_threshold_low THEN
    RETURN 'CAUTION';
  ELSE
    RETURN 'SAFE';
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- COMMENT: USAGE NOTES
-- =====================================================

/*
  Owner Finance System:
  
  1. Protection Mechanisms:
     - Project funds are protected based on remaining budgets
     - Committed costs are protected from owner draws
     - Operational cash reserve is maintained (15% of expenses)
     - Safety thresholds prevent excessive draws
  
  2. Cash Protection Calculation:
     free_cash = total_bank_cash - project_funds - committed_costs - operational_reserve
  
  3. Safety Evaluation:
     SAFE: Draw <= 10% of free cash
     CAUTION: Draw > 10% but <= 25% of free cash  
     BLOCK: Draw > 25% of free cash
  
  4. Integration:
     - Uses Phase 3 project financial summaries
     - Integrates with Phase 1 chart of accounts
     - Maintains company-based security via user_profiles
     - Creates GL entries for processed draws
  
  5. Owner Accounts:
     - equity: Owner equity account
     - draw: Owner draw tracking account
     - salary: Owner salary configuration
*/
