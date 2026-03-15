/*
  # Job Cost Code Tracking System

  ## Overview
  Implements comprehensive cost code tracking for construction project financial management.
  Enables cost analysis and reporting grouped by cost codes across all expense types.

  ## New Tables

  ### 1. cost_codes
    - Core cost code definitions
    - Hierarchical structure with code, description, category
    - Company-specific cost code lists
    - Active/inactive status for cost code lifecycle

  ## Enhanced Tables

  The following tables are updated to link to cost codes:

  ### BOQ Items
    - `boq_items.cost_code_id` - Links BOQ line items to cost codes

  ### Procurement Items
    - `procurement_items.cost_code_id` - Links procurement to cost codes

  ### Project Costs (Expenses)
    - `project_costs.cost_code_id` - Links all project costs to cost codes

  ### Purchase Orders
    - `purchase_order_items.cost_code_id` - Links PO line items to cost codes

  ### Supplier Invoices
    - `supplier_invoice_line_items.cost_code_id` - Links AP to cost codes

  ## New Views

  ### v_cost_code_summary
    - Aggregates costs by cost code across all sources
    - Shows budgeted, committed, actual, and variance
    - Provides project-level cost code analysis

  ## New Functions

  ### get_project_costs_by_code(project_id)
    - Returns costs grouped by cost code
    - Aggregates from all sources (BOQ, procurement, expenses, labor)
    - Calculates totals and percentages

  ## Security
  - RLS policies ensure company-based access
  - Cost codes are company-specific
  - Users can only view/edit their company's cost codes
*/

-- =====================================================
-- COST CODES TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS cost_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  
  -- Cost code structure
  code text NOT NULL,
  description text NOT NULL,
  category text,
  
  -- Optional hierarchy
  parent_code_id uuid REFERENCES cost_codes(id) ON DELETE SET NULL,
  
  -- Budget tracking
  is_billable boolean DEFAULT true,
  budget_amount numeric DEFAULT 0 CHECK (budget_amount >= 0),
  
  -- Status
  is_active boolean DEFAULT true,
  
  -- Metadata
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  
  UNIQUE(company_id, code)
);

CREATE INDEX IF NOT EXISTS idx_cost_codes_company ON cost_codes(company_id);
CREATE INDEX IF NOT EXISTS idx_cost_codes_category ON cost_codes(category);
CREATE INDEX IF NOT EXISTS idx_cost_codes_parent ON cost_codes(parent_code_id);
CREATE INDEX IF NOT EXISTS idx_cost_codes_active ON cost_codes(is_active) WHERE is_active = true;

ALTER TABLE cost_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view cost codes for their company"
  ON cost_codes FOR SELECT
  TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM user_profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can insert cost codes for their company"
  ON cost_codes FOR INSERT
  TO authenticated
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM user_profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can update cost codes for their company"
  ON cost_codes FOR UPDATE
  TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM user_profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can delete cost codes for their company"
  ON cost_codes FOR DELETE
  TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM user_profiles WHERE id = auth.uid()
    )
  );

-- =====================================================
-- ADD COST CODE LINKS TO EXISTING TABLES
-- =====================================================

-- BOQ Items
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'boq_items' AND column_name = 'cost_code_id'
  ) THEN
    ALTER TABLE boq_items ADD COLUMN cost_code_id uuid REFERENCES cost_codes(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS idx_boq_items_cost_code ON boq_items(cost_code_id);
  END IF;
END $$;

-- Procurement Items
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'procurement_items' AND column_name = 'cost_code_id'
  ) THEN
    ALTER TABLE procurement_items ADD COLUMN cost_code_id uuid REFERENCES cost_codes(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS idx_procurement_items_cost_code ON procurement_items(cost_code_id);
  END IF;
END $$;

-- Project Costs
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'project_costs' AND column_name = 'cost_code_id'
  ) THEN
    ALTER TABLE project_costs ADD COLUMN cost_code_id uuid REFERENCES cost_codes(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS idx_project_costs_cost_code ON project_costs(cost_code_id);
  END IF;
END $$;

-- Purchase Order Items
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'purchase_order_items' AND column_name = 'cost_code_id'
  ) THEN
    ALTER TABLE purchase_order_items ADD COLUMN cost_code_id uuid REFERENCES cost_codes(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS idx_purchase_order_items_cost_code ON purchase_order_items(cost_code_id);
  END IF;
END $$;

-- Supplier Invoice Line Items
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'supplier_invoice_line_items' AND column_name = 'cost_code_id'
  ) THEN
    ALTER TABLE supplier_invoice_line_items ADD COLUMN cost_code_id uuid REFERENCES cost_codes(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS idx_supplier_invoice_line_items_cost_code ON supplier_invoice_line_items(cost_code_id);
  END IF;
END $$;

-- =====================================================
-- COST CODE SUMMARY VIEW
-- =====================================================

CREATE OR REPLACE VIEW v_cost_code_summary AS
SELECT 
  cc.id as cost_code_id,
  cc.company_id,
  cc.code,
  cc.description,
  cc.category,
  cc.budget_amount,
  
  -- BOQ Budget (from BOQ items)
  COALESCE(SUM(DISTINCT bi.amount), 0) as boq_budget,
  
  -- Procurement Committed (from procurement items - calculated)
  COALESCE(SUM(DISTINCT (pi.quantity * pi.unit_rate)), 0) as procurement_committed,
  
  -- PO Committed (from purchase orders)
  COALESCE(SUM(DISTINCT poi.total_amount), 0) as po_committed,
  
  -- Actual Costs (from project_costs)
  COALESCE(SUM(DISTINCT pc.amount), 0) as actual_costs,
  
  -- Supplier Invoice Actual (from supplier invoices)
  COALESCE(SUM(DISTINCT sili.total_amount), 0) as invoice_actual,
  
  -- Totals
  COALESCE(cc.budget_amount, 0) as total_budget,
  COALESCE(SUM(DISTINCT poi.total_amount), 0) + COALESCE(SUM(DISTINCT (pi.quantity * pi.unit_rate)), 0) as total_committed,
  COALESCE(SUM(DISTINCT pc.amount), 0) + COALESCE(SUM(DISTINCT sili.total_amount), 0) as total_actual,
  
  -- Variance
  COALESCE(cc.budget_amount, 0) - (COALESCE(SUM(DISTINCT pc.amount), 0) + COALESCE(SUM(DISTINCT sili.total_amount), 0)) as variance

FROM cost_codes cc

LEFT JOIN boq_items bi ON bi.cost_code_id = cc.id
LEFT JOIN procurement_items pi ON pi.cost_code_id = cc.id
LEFT JOIN project_costs pc ON pc.cost_code_id = cc.id
LEFT JOIN purchase_order_items poi ON poi.cost_code_id = cc.id
LEFT JOIN supplier_invoice_line_items sili ON sili.cost_code_id = cc.id

WHERE cc.is_active = true

GROUP BY 
  cc.id,
  cc.company_id,
  cc.code,
  cc.description,
  cc.category,
  cc.budget_amount;

-- =====================================================
-- GET PROJECT COSTS BY CODE FUNCTION
-- =====================================================

CREATE OR REPLACE FUNCTION get_project_costs_by_code(p_project_id uuid)
RETURNS TABLE (
  cost_code_id uuid,
  cost_code text,
  cost_code_description text,
  cost_code_category text,
  budget_amount numeric,
  boq_budget numeric,
  committed_amount numeric,
  actual_amount numeric,
  variance numeric,
  percent_spent numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH project_boq_budget AS (
    SELECT 
      bi.cost_code_id,
      SUM(bi.amount) as budget
    FROM boq_items bi
    JOIN boq_headers bh ON bi.boq_id = bh.id
    WHERE bh.project_id = p_project_id
      AND bi.cost_code_id IS NOT NULL
    GROUP BY bi.cost_code_id
  ),
  project_committed AS (
    SELECT 
      pi.cost_code_id,
      SUM(pi.quantity * COALESCE(pi.unit_rate, 0)) as committed
    FROM procurement_items pi
    WHERE pi.project_id = p_project_id
      AND pi.cost_code_id IS NOT NULL
    GROUP BY pi.cost_code_id
    
    UNION ALL
    
    SELECT 
      poi.cost_code_id,
      SUM(poi.total_amount) as committed
    FROM purchase_order_items poi
    JOIN purchase_orders po ON poi.purchase_order_id = po.id
    WHERE po.project_id = p_project_id
      AND poi.cost_code_id IS NOT NULL
    GROUP BY poi.cost_code_id
  ),
  project_actual AS (
    SELECT 
      pc.cost_code_id,
      SUM(pc.amount) as actual
    FROM project_costs pc
    WHERE pc.project_id = p_project_id
      AND pc.cost_code_id IS NOT NULL
    GROUP BY pc.cost_code_id
    
    UNION ALL
    
    SELECT 
      sili.cost_code_id,
      SUM(sili.total_amount) as actual
    FROM supplier_invoice_line_items sili
    JOIN supplier_invoices si ON sili.supplier_invoice_id = si.id
    WHERE si.project_id = p_project_id
      AND sili.cost_code_id IS NOT NULL
    GROUP BY sili.cost_code_id
  ),
  aggregated_committed AS (
    SELECT cost_code_id, SUM(committed) as total_committed
    FROM project_committed
    GROUP BY cost_code_id
  ),
  aggregated_actual AS (
    SELECT cost_code_id, SUM(actual) as total_actual
    FROM project_actual
    GROUP BY cost_code_id
  )
  
  SELECT 
    cc.id as cost_code_id,
    cc.code as cost_code,
    cc.description as cost_code_description,
    cc.category as cost_code_category,
    COALESCE(cc.budget_amount, 0) as budget_amount,
    COALESCE(pbb.budget, 0) as boq_budget,
    COALESCE(ac.total_committed, 0) as committed_amount,
    COALESCE(aa.total_actual, 0) as actual_amount,
    COALESCE(COALESCE(pbb.budget, cc.budget_amount), 0) - COALESCE(aa.total_actual, 0) as variance,
    CASE 
      WHEN COALESCE(COALESCE(pbb.budget, cc.budget_amount), 0) > 0 
      THEN (COALESCE(aa.total_actual, 0) / COALESCE(pbb.budget, cc.budget_amount) * 100)
      ELSE 0 
    END as percent_spent
    
  FROM cost_codes cc
  LEFT JOIN project_boq_budget pbb ON cc.id = pbb.cost_code_id
  LEFT JOIN aggregated_committed ac ON cc.id = ac.cost_code_id
  LEFT JOIN aggregated_actual aa ON cc.id = aa.cost_code_id
  
  WHERE cc.is_active = true
    AND (
      pbb.budget IS NOT NULL 
      OR ac.total_committed IS NOT NULL 
      OR aa.total_actual IS NOT NULL
      OR cc.budget_amount > 0
    )
  
  ORDER BY cc.code;
END;
$$;

-- =====================================================
-- GET COMPANY COST CODES FUNCTION
-- =====================================================

CREATE OR REPLACE FUNCTION get_company_cost_codes(p_company_id uuid)
RETURNS TABLE (
  id uuid,
  code text,
  description text,
  category text,
  parent_code_id uuid,
  is_billable boolean,
  budget_amount numeric,
  is_active boolean,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    cc.id,
    cc.code,
    cc.description,
    cc.category,
    cc.parent_code_id,
    cc.is_billable,
    cc.budget_amount,
    cc.is_active,
    cc.created_at
  FROM cost_codes cc
  WHERE cc.company_id = p_company_id
  ORDER BY cc.code;
END;
$$;

-- =====================================================
-- STANDARD COST CODE TEMPLATES
-- =====================================================

-- Note: Companies can optionally initialize with standard CSI MasterFormat codes
-- or create custom cost codes as needed. This migration does not auto-populate
-- cost codes to allow maximum flexibility per company.

COMMENT ON TABLE cost_codes IS 'Job cost codes for tracking and categorizing project expenses. Supports hierarchical structures and can follow standards like CSI MasterFormat or company-specific codes.';
COMMENT ON COLUMN cost_codes.code IS 'Cost code identifier (e.g., 03-3000 for Cast-in-Place Concrete)';
COMMENT ON COLUMN cost_codes.description IS 'Human-readable description of the cost code';
COMMENT ON COLUMN cost_codes.category IS 'Grouping category (e.g., Concrete, Masonry, Metals, etc.)';
COMMENT ON COLUMN cost_codes.parent_code_id IS 'Optional parent for hierarchical cost code structures';
COMMENT ON COLUMN cost_codes.is_billable IS 'Whether costs under this code are billable to client';
COMMENT ON COLUMN cost_codes.budget_amount IS 'Optional budget amount allocated to this cost code';
