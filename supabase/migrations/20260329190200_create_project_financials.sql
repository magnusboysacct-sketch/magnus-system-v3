/*
  Phase 3: Project Financials - Budgets, Costs, and Commitments
  
  Creates the core project financial tracking tables that work alongside
  the existing BOQ-based budget system and project costs.
  
  Tables Created:
  - project_budgets: Dedicated budget tracking by category
  - project_costs: Centralized cost tracking (extends existing concept)
  - project_commitments: Commitment tracking (POs, contracts, etc.)
  
  This integrates with existing:
  - BOQ system for detailed budget breakdowns
  - project_costs table referenced in costs.ts
  - project_id structure used throughout the system
*/

-- =====================================================
-- PROJECT BUDGETS
-- =====================================================

CREATE TABLE IF NOT EXISTS project_budgets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  company_id uuid NOT NULL,
  
  -- Budget categorization
  category text NOT NULL CHECK (category IN (
    'material', 
    'labor', 
    'equipment', 
    'subcontractor', 
    'overhead', 
    'contingency', 
    'other'
  )),
  
  -- Budget amounts
  budget_amount numeric(15,2) NOT NULL CHECK (budget_amount >= 0),
  spent_amount numeric(15,2) DEFAULT 0 CHECK (spent_amount >= 0),
  remaining_amount numeric(15,2) GENERATED ALWAYS AS (
    budget_amount - spent_amount
  ) STORED,
  
  -- Budget metadata
  description text,
  budget_period text CHECK (budget_period IN ('total', 'monthly', 'quarterly', 'annual')),
  start_date date,
  end_date date,
  
  -- Status
  is_active boolean DEFAULT true,
  is_locked boolean DEFAULT false, -- Prevents changes when locked
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  
  -- Constraints
  CHECK(budget_amount >= spent_amount),
  CHECK(start_date IS NULL OR end_date IS NULL OR start_date <= end_date)
);

-- =====================================================
-- PROJECT COSTS (Extends existing concept)
-- =====================================================

CREATE TABLE IF NOT EXISTS project_costs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  company_id uuid NOT NULL,
  
  -- Cost categorization
  cost_type text NOT NULL CHECK (cost_type IN (
    'material', 
    'labor', 
    'equipment', 
    'subcontractor', 
    'overhead', 
    'other'
  )),
  
  -- Cost details
  amount numeric(15,2) NOT NULL CHECK (amount >= 0),
  quantity numeric(12,4) DEFAULT 1,
  unit_price numeric(15,2) GENERATED ALWAYS AS (
    CASE WHEN quantity > 0 THEN amount / quantity ELSE 0 END
  ) STORED,
  
  -- Source tracking
  source_type text CHECK (source_type IN (
    'manual',           // Manual entry
    'expense',          // From expenses table
    'supplier_invoice', // From supplier_invoices table
    'payroll',          // From payroll_entries table
    'time_entry',       // From time_entries table
    'procurement',      // From procurements table
    'adjustment'        // Cost adjustments
  )),
  source_id uuid, -- Reference to source record
  
  -- Cost details
  description text,
  cost_date date NOT NULL,
  invoice_number text,
  vendor_name text,
  
  -- Project association (optional for company-level costs)
  task_id uuid REFERENCES project_tasks(id) ON DELETE SET NULL,
  boq_item_id uuid REFERENCES boq_items(id) ON DELETE SET NULL,
  
  -- Status
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'paid', 'disputed')),
  approved_by uuid REFERENCES auth.users(id),
  approved_at timestamptz,
  
  -- Metadata
  notes text,
  attachments jsonb DEFAULT '[]', -- Array of file references
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  
  -- Constraints
  CHECK(cost_date <= CURRENT_DATE),
  CHECK(approved_at IS NULL OR approved_by IS NOT NULL)
);

-- =====================================================
-- PROJECT COMMITMENTS
-- =====================================================

CREATE TABLE IF NOT EXISTS project_commitments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  company_id uuid NOT NULL,
  
  -- Commitment categorization
  commitment_type text NOT NULL CHECK (commitment_type IN (
    'purchase_order',   // Committed to supplier
    'contract',         // Contractual commitment
    'subcontractor',    // Subcontractor agreement
    'labor_agreement',  // Labor commitment
    'material_order',   // Material order commitment
    'equipment_rental', // Equipment rental commitment
    'other'             // Other commitments
  )),
  
  -- Commitment amounts
  committed_amount numeric(15,2) NOT NULL CHECK (committed_amount >= 0),
  invoiced_amount numeric(15,2) DEFAULT 0 CHECK (invoiced_amount >= 0),
  paid_amount numeric(15,2) DEFAULT 0 CHECK (paid_amount >= 0),
  remaining_commitment numeric(15,2) GENERATED ALWAYS AS (
    committed_amount - invoiced_amount
  ) STORED,
  remaining_payment numeric(15,2) GENERATED ALWAYS AS (
    invoiced_amount - paid_amount
  ) STORED,
  
  -- Source tracking
  source_id uuid NOT NULL, -- Reference to PO, contract, etc.
  source_type text NOT NULL CHECK (source_type IN (
    'purchase_order',
    'client_contract',
    'supplier_contract',
    'subcontractor_agreement',
    'labor_contract',
    'equipment_rental_agreement',
    'other_agreement'
  )),
  
  -- Commitment details
  description text,
  vendor_name text,
  commitment_date date NOT NULL,
  expected_delivery_date date,
  actual_delivery_date date,
  
  -- Status
  status text DEFAULT 'active' CHECK (status IN (
    'active',      // Commitment is active
    'completed',   // Fully delivered/invoiced
    'cancelled',   // Commitment cancelled
    'disputed'     // Under dispute
  )),
  
  -- Metadata
  notes text,
  terms_conditions text,
  attachments jsonb DEFAULT '[]', -- Array of file references
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  
  -- Constraints
  CHECK(commitment_date <= CURRENT_DATE),
  CHECK(expected_delivery_date IS NULL OR commitment_date <= expected_delivery_date),
  CHECK(actual_delivery_date IS NULL OR commitment_date <= actual_delivery_date),
  CHECK(committed_amount >= invoiced_amount),
  CHECK(invoiced_amount >= paid_amount)
);

-- =====================================================
-- INDEXES
-- =====================================================

-- Project budgets indexes
CREATE INDEX IF NOT EXISTS idx_project_budgets_project ON project_budgets(project_id);
CREATE INDEX IF NOT EXISTS idx_project_budgets_company ON project_budgets(company_id);
CREATE INDEX IF NOT EXISTS idx_project_budgets_category ON project_budgets(category);
CREATE INDEX IF NOT EXISTS idx_project_budgets_active ON project_budgets(is_active);

-- Project costs indexes
CREATE INDEX IF NOT EXISTS idx_project_costs_project ON project_costs(project_id);
CREATE INDEX IF NOT EXISTS idx_project_costs_company ON project_costs(company_id);
CREATE INDEX IF NOT EXISTS idx_project_costs_type ON project_costs(cost_type);
CREATE INDEX IF NOT EXISTS idx_project_costs_date ON project_costs(cost_date);
CREATE INDEX IF NOT EXISTS idx_project_costs_source ON project_costs(source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_project_costs_status ON project_costs(status);

-- Project commitments indexes
CREATE INDEX IF NOT EXISTS idx_project_commitments_project ON project_commitments(project_id);
CREATE INDEX IF NOT EXISTS idx_project_commitments_company ON project_commitments(company_id);
CREATE INDEX IF NOT EXISTS idx_project_commitments_type ON project_commitments(commitment_type);
CREATE INDEX IF NOT EXISTS idx_project_commitments_source ON project_commitments(source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_project_commitments_status ON project_commitments(status);
CREATE INDEX IF NOT EXISTS idx_project_commitments_date ON project_commitments(commitment_date);

-- =====================================================
-- ROW LEVEL SECURITY
-- =====================================================

-- Enable RLS on all tables
ALTER TABLE project_budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_costs ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_commitments ENABLE ROW LEVEL SECURITY;

-- Project budgets RLS
CREATE POLICY "Users can view their company project budgets"
  ON project_budgets FOR SELECT
  TO authenticated
  USING (
    company_id IN (SELECT company_id FROM user_profiles WHERE id = auth.uid())
  );

CREATE POLICY "Users can manage their company project budgets"
  ON project_budgets FOR ALL
  TO authenticated
  USING (
    company_id IN (SELECT company_id FROM user_profiles WHERE id = auth.uid())
  );

-- Project costs RLS
CREATE POLICY "Users can view their company project costs"
  ON project_costs FOR SELECT
  TO authenticated
  USING (
    company_id IN (SELECT company_id FROM user_profiles WHERE id = auth.uid())
  );

CREATE POLICY "Users can manage their company project costs"
  ON project_costs FOR ALL
  TO authenticated
  USING (
    company_id IN (SELECT company_id FROM user_profiles WHERE id = auth.uid())
  );

-- Project commitments RLS
CREATE POLICY "Users can view their company project commitments"
  ON project_commitments FOR SELECT
  TO authenticated
  USING (
    company_id IN (SELECT company_id FROM user_profiles WHERE id = auth.uid())
  );

CREATE POLICY "Users can manage their company project commitments"
  ON project_commitments FOR ALL
  TO authenticated
  USING (
    company_id IN (SELECT company_id FROM user_profiles WHERE id = auth.uid())
  );

-- =====================================================
-- TRIGGERS FOR UPDATED_AT
-- =====================================================

CREATE OR REPLACE FUNCTION update_project_financials_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_project_budgets_updated_at
  BEFORE UPDATE ON project_budgets
  FOR EACH ROW
  EXECUTE FUNCTION update_project_financials_updated_at();

CREATE TRIGGER set_project_costs_updated_at
  BEFORE UPDATE ON project_costs
  FOR EACH ROW
  EXECUTE FUNCTION update_project_financials_updated_at();

CREATE TRIGGER set_project_commitments_updated_at
  BEFORE UPDATE ON project_commitments
  FOR EACH ROW
  EXECUTE FUNCTION update_project_financials_updated_at();

-- =====================================================
-- TRIGGERS FOR AUTOMATIC UPDATES
-- =====================================================

-- Update budget spent amount when costs are added/updated
CREATE OR REPLACE FUNCTION update_budget_spent_amount()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    UPDATE project_budgets 
    SET spent_amount = (
      SELECT COALESCE(SUM(amount), 0)
      FROM project_costs 
      WHERE project_id = NEW.project_id 
        AND cost_type = NEW.cost_type
        AND status = 'approved'
    )
    WHERE project_id = NEW.project_id 
      AND category = NEW.cost_type;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE project_budgets 
    SET spent_amount = (
      SELECT COALESCE(SUM(amount), 0)
      FROM project_costs 
      WHERE project_id = OLD.project_id 
        AND cost_type = OLD.cost_type
        AND status = 'approved'
    )
    WHERE project_id = OLD.project_id 
      AND category = OLD.cost_type;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_budget_spent_amount
  AFTER INSERT OR UPDATE OR DELETE ON project_costs
  FOR EACH ROW
  EXECUTE FUNCTION update_budget_spent_amount();

-- =====================================================
-- VIEWS FOR COMMON QUERIES
-- =====================================================

-- Project financial summary view
CREATE OR REPLACE VIEW v_project_financial_summary AS
SELECT 
  p.id as project_id,
  p.name as project_name,
  p.company_id,
  
  -- Budget summary
  COALESCE(budget_summary.total_budget, 0) as total_budget,
  COALESCE(budget_summary.material_budget, 0) as material_budget,
  COALESCE(budget_summary.labor_budget, 0) as labor_budget,
  COALESCE(budget_summary.equipment_budget, 0) as equipment_budget,
  COALESCE(budget_summary.other_budget, 0) as other_budget,
  
  -- Cost summary
  COALESCE(cost_summary.total_cost, 0) as total_cost,
  COALESCE(cost_summary.material_cost, 0) as material_cost,
  COALESCE(cost_summary.labor_cost, 0) as labor_cost,
  COALESCE(cost_summary.equipment_cost, 0) as equipment_cost,
  COALESCE(cost_summary.other_cost, 0) as other_cost,
  
  -- Commitment summary
  COALESCE(commitment_summary.total_committed, 0) as total_committed,
  COALESCE(commitment_summary.total_invoiced, 0) as total_invoiced,
  COALESCE(commitment_summary.total_paid, 0) as total_paid,
  
  -- Calculated values
  COALESCE(budget_summary.total_budget, 0) - COALESCE(cost_summary.total_cost, 0) as remaining_budget,
  CASE 
    WHEN COALESCE(budget_summary.total_budget, 0) > 0 
    THEN ((COALESCE(budget_summary.total_budget, 0) - COALESCE(cost_summary.total_cost, 0)) / COALESCE(budget_summary.total_budget, 0)) * 100
    ELSE 0 
  END as budget_remaining_percentage,
  
  CASE 
    WHEN COALESCE(budget_summary.total_budget, 0) > 0 
    THEN (COALESCE(cost_summary.total_cost, 0) / COALESCE(budget_summary.total_budget, 0)) * 100
    ELSE 0 
  END as budget_usage_percentage

FROM projects p
LEFT JOIN (
  SELECT 
    project_id,
    SUM(CASE WHEN category = 'material' THEN budget_amount ELSE 0 END) as material_budget,
    SUM(CASE WHEN category = 'labor' THEN budget_amount ELSE 0 END) as labor_budget,
    SUM(CASE WHEN category = 'equipment' THEN budget_amount ELSE 0 END) as equipment_budget,
    SUM(CASE WHEN category = 'other' THEN budget_amount ELSE 0 END) as other_budget,
    SUM(budget_amount) as total_budget
  FROM project_budgets 
  WHERE is_active = true
  GROUP BY project_id
) budget_summary ON p.id = budget_summary.project_id
LEFT JOIN (
  SELECT 
    project_id,
    SUM(CASE WHEN cost_type = 'material' THEN amount ELSE 0 END) as material_cost,
    SUM(CASE WHEN cost_type = 'labor' THEN amount ELSE 0 END) as labor_cost,
    SUM(CASE WHEN cost_type = 'equipment' THEN amount ELSE 0 END) as equipment_cost,
    SUM(CASE WHEN cost_type = 'other' THEN amount ELSE 0 END) as other_cost,
    SUM(amount) as total_cost
  FROM project_costs 
  WHERE status = 'approved'
  GROUP BY project_id
) cost_summary ON p.id = cost_summary.project_id
LEFT JOIN (
  SELECT 
    project_id,
    SUM(committed_amount) as total_committed,
    SUM(invoiced_amount) as total_invoiced,
    SUM(paid_amount) as total_paid
  FROM project_commitments 
  WHERE status = 'active'
  GROUP BY project_id
) commitment_summary ON p.id = commitment_summary.project_id;

-- =====================================================
-- COMMENT: USAGE NOTES
-- =====================================================

/*
  Integration with Existing System:
  
  1. project_costs table extends the existing project_costs concept in costs.ts
     - Maintains compatibility with existing ProjectCost interface
     - Adds additional fields for better tracking
     - Integrates with existing cost_type categories
  
  2. project_budgets works alongside BOQ-based budgets
     - BOQ provides detailed item-level budgets
     - project_budgets provides category-level budget tracking
     - Both can coexist for comprehensive budget management
  
  3. project_commitments tracks financial commitments
     - Purchase orders, contracts, subcontractor agreements
     - Links to existing source tables (purchase_orders, client_contracts, etc.)
     - Provides commitment vs actual tracking
  
  4. All tables maintain company-based security
  5. Automatic triggers keep summaries up-to-date
  6. Views provide easy access to financial summaries
*/
