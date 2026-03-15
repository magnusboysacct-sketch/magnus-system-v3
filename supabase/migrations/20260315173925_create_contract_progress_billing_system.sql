/*
  # Contract Progress Billing System

  ## Overview
  Enables progress-based billing from BOQ items and contract milestones with retainage support.
  Links billable items to client invoices for Accounts Receivable tracking.

  ## New Tables

  ### 1. contract_billing_items
    - Links BOQ items to billing
    - Tracks percent complete for each item
    - Stores previously billed amounts
    - Auto-calculates current billing amount
    - Supports retainage percentage
    - Maintains running balance

  ### 2. contract_milestones
    - Defines billing milestones for contract
    - Links to specific deliverables or phases
    - Tracks milestone completion percentage
    - Enables milestone-based billing

  ## Enhanced Tables

  ### client_invoice_line_items (add columns)
    - boq_item_id: Links line item to BOQ item
    - milestone_id: Links line item to contract milestone
    - percent_complete: Percent of work completed for this billing
    - previously_billed: Amount billed in previous invoices
    - retainage_percent: Retainage held on this line
    - retainage_amount: Calculated retainage amount

  ## New Functions

  ### 1. calculate_contract_billing(contract_id, billing_date)
    - Calculates billable amounts for all BOQ items
    - Applies retainage percentage
    - Returns line items ready for invoice generation
    - Updates billing history

  ### 2. get_contract_billing_summary(contract_id)
    - Returns contract value, billed to date, retainage held
    - Calculates remaining contract balance
    - Shows percent complete overall

  ## Security
  - RLS policies for company-based access
  - User can only bill for their company's contracts
*/

-- =====================================================
-- CONTRACT BILLING ITEMS TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS contract_billing_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  contract_id uuid NOT NULL REFERENCES client_contracts(id) ON DELETE CASCADE,
  boq_item_id uuid REFERENCES boq_items(id) ON DELETE SET NULL,
  
  -- Item details
  line_no integer NOT NULL DEFAULT 1,
  description text NOT NULL,
  unit text NOT NULL,
  contract_quantity numeric NOT NULL CHECK (contract_quantity >= 0),
  contract_rate numeric NOT NULL CHECK (contract_rate >= 0),
  contract_amount numeric NOT NULL CHECK (contract_amount >= 0),
  
  -- Progress tracking
  percent_complete numeric DEFAULT 0 CHECK (percent_complete >= 0 AND percent_complete <= 100),
  quantity_completed numeric DEFAULT 0 CHECK (quantity_completed >= 0),
  
  -- Billing history
  previously_billed_amount numeric DEFAULT 0 CHECK (previously_billed_amount >= 0),
  previously_billed_quantity numeric DEFAULT 0 CHECK (previously_billed_quantity >= 0),
  
  -- Retainage
  retainage_percent numeric DEFAULT 0 CHECK (retainage_percent >= 0 AND retainage_percent <= 100),
  total_retainage_held numeric DEFAULT 0 CHECK (total_retainage_held >= 0),
  
  -- Calculated fields (updated by function)
  current_amount_due numeric DEFAULT 0,
  remaining_contract_balance numeric DEFAULT 0,
  
  is_active boolean DEFAULT true,
  notes text,
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contract_billing_items_contract ON contract_billing_items(contract_id);
CREATE INDEX IF NOT EXISTS idx_contract_billing_items_boq ON contract_billing_items(boq_item_id);
CREATE INDEX IF NOT EXISTS idx_contract_billing_items_company ON contract_billing_items(company_id);

ALTER TABLE contract_billing_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view billing items for their company"
  ON contract_billing_items FOR SELECT
  TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM user_profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can insert billing items for their company"
  ON contract_billing_items FOR INSERT
  TO authenticated
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM user_profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can update billing items for their company"
  ON contract_billing_items FOR UPDATE
  TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM user_profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can delete billing items for their company"
  ON contract_billing_items FOR DELETE
  TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM user_profiles WHERE id = auth.uid()
    )
  );

-- =====================================================
-- CONTRACT MILESTONES TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS contract_milestones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  contract_id uuid NOT NULL REFERENCES client_contracts(id) ON DELETE CASCADE,
  
  milestone_no integer NOT NULL,
  milestone_name text NOT NULL,
  description text,
  
  -- Milestone value
  milestone_amount numeric NOT NULL CHECK (milestone_amount >= 0),
  
  -- Progress
  percent_complete numeric DEFAULT 0 CHECK (percent_complete >= 0 AND percent_complete <= 100),
  is_completed boolean DEFAULT false,
  
  -- Dates
  scheduled_date date,
  completion_date date,
  
  -- Billing
  billed_amount numeric DEFAULT 0 CHECK (billed_amount >= 0),
  retainage_percent numeric DEFAULT 0 CHECK (retainage_percent >= 0 AND retainage_percent <= 100),
  
  notes text,
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contract_milestones_contract ON contract_milestones(contract_id);
CREATE INDEX IF NOT EXISTS idx_contract_milestones_company ON contract_milestones(company_id);

ALTER TABLE contract_milestones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view milestones for their company"
  ON contract_milestones FOR SELECT
  TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM user_profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can insert milestones for their company"
  ON contract_milestones FOR INSERT
  TO authenticated
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM user_profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can update milestones for their company"
  ON contract_milestones FOR UPDATE
  TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM user_profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can delete milestones for their company"
  ON contract_milestones FOR DELETE
  TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM user_profiles WHERE id = auth.uid()
    )
  );

-- =====================================================
-- ENHANCE CLIENT INVOICE LINE ITEMS
-- =====================================================

DO $$
BEGIN
  -- Add BOQ item reference
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'client_invoice_line_items' AND column_name = 'boq_item_id'
  ) THEN
    ALTER TABLE client_invoice_line_items ADD COLUMN boq_item_id uuid REFERENCES boq_items(id) ON DELETE SET NULL;
  END IF;

  -- Add milestone reference
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'client_invoice_line_items' AND column_name = 'milestone_id'
  ) THEN
    ALTER TABLE client_invoice_line_items ADD COLUMN milestone_id uuid REFERENCES contract_milestones(id) ON DELETE SET NULL;
  END IF;

  -- Add billing item reference
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'client_invoice_line_items' AND column_name = 'billing_item_id'
  ) THEN
    ALTER TABLE client_invoice_line_items ADD COLUMN billing_item_id uuid REFERENCES contract_billing_items(id) ON DELETE SET NULL;
  END IF;

  -- Add percent complete
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'client_invoice_line_items' AND column_name = 'percent_complete'
  ) THEN
    ALTER TABLE client_invoice_line_items ADD COLUMN percent_complete numeric DEFAULT 0 CHECK (percent_complete >= 0 AND percent_complete <= 100);
  END IF;

  -- Add previously billed
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'client_invoice_line_items' AND column_name = 'previously_billed'
  ) THEN
    ALTER TABLE client_invoice_line_items ADD COLUMN previously_billed numeric DEFAULT 0;
  END IF;

  -- Add retainage percent
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'client_invoice_line_items' AND column_name = 'retainage_percent'
  ) THEN
    ALTER TABLE client_invoice_line_items ADD COLUMN retainage_percent numeric DEFAULT 0 CHECK (retainage_percent >= 0 AND retainage_percent <= 100);
  END IF;

  -- Add retainage amount
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'client_invoice_line_items' AND column_name = 'retainage_amount'
  ) THEN
    ALTER TABLE client_invoice_line_items ADD COLUMN retainage_amount numeric DEFAULT 0;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_client_invoice_line_items_boq ON client_invoice_line_items(boq_item_id);
CREATE INDEX IF NOT EXISTS idx_client_invoice_line_items_milestone ON client_invoice_line_items(milestone_id);
CREATE INDEX IF NOT EXISTS idx_client_invoice_line_items_billing ON client_invoice_line_items(billing_item_id);

-- =====================================================
-- CALCULATE CONTRACT BILLING FUNCTION
-- =====================================================

CREATE OR REPLACE FUNCTION calculate_contract_billing(
  p_contract_id uuid,
  p_billing_date date DEFAULT CURRENT_DATE
)
RETURNS TABLE (
  billing_item_id uuid,
  boq_item_id uuid,
  line_no integer,
  description text,
  unit text,
  contract_quantity numeric,
  contract_rate numeric,
  contract_amount numeric,
  percent_complete numeric,
  quantity_completed numeric,
  previously_billed_amount numeric,
  current_billing_quantity numeric,
  current_billing_amount numeric,
  retainage_percent numeric,
  retainage_amount numeric,
  net_amount_due numeric,
  remaining_balance numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    cbi.id as billing_item_id,
    cbi.boq_item_id,
    cbi.line_no,
    cbi.description,
    cbi.unit,
    cbi.contract_quantity,
    cbi.contract_rate,
    cbi.contract_amount,
    cbi.percent_complete,
    cbi.quantity_completed,
    cbi.previously_billed_amount,
    
    -- Current billing quantity
    GREATEST(0, cbi.quantity_completed - cbi.previously_billed_quantity) as current_billing_quantity,
    
    -- Current billing amount (based on percent complete)
    GREATEST(0, (cbi.contract_amount * cbi.percent_complete / 100) - cbi.previously_billed_amount) as current_billing_amount,
    
    cbi.retainage_percent,
    
    -- Retainage amount on current billing
    GREATEST(0, ((cbi.contract_amount * cbi.percent_complete / 100) - cbi.previously_billed_amount) * cbi.retainage_percent / 100) as retainage_amount,
    
    -- Net amount due (billing amount - retainage)
    GREATEST(0, ((cbi.contract_amount * cbi.percent_complete / 100) - cbi.previously_billed_amount) * (1 - cbi.retainage_percent / 100)) as net_amount_due,
    
    -- Remaining contract balance
    GREATEST(0, cbi.contract_amount - (cbi.contract_amount * cbi.percent_complete / 100)) as remaining_balance
    
  FROM contract_billing_items cbi
  WHERE cbi.contract_id = p_contract_id
    AND cbi.is_active = true
    AND cbi.percent_complete > 0
    AND ((cbi.contract_amount * cbi.percent_complete / 100) - cbi.previously_billed_amount) > 0.01
  ORDER BY cbi.line_no;
END;
$$;

-- =====================================================
-- GET CONTRACT BILLING SUMMARY FUNCTION
-- =====================================================

CREATE OR REPLACE FUNCTION get_contract_billing_summary(p_contract_id uuid)
RETURNS TABLE (
  contract_amount numeric,
  total_billed_to_date numeric,
  total_retainage_held numeric,
  total_paid numeric,
  total_outstanding numeric,
  remaining_contract_balance numeric,
  percent_billed numeric,
  percent_complete numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_contract_amount numeric;
  v_total_billed numeric := 0;
  v_total_retainage numeric := 0;
  v_total_paid numeric := 0;
  v_total_outstanding numeric := 0;
  v_percent_complete numeric := 0;
BEGIN
  -- Get contract amount
  SELECT cc.contract_amount INTO v_contract_amount
  FROM client_contracts cc
  WHERE cc.id = p_contract_id;

  IF v_contract_amount IS NULL THEN
    v_contract_amount := 0;
  END IF;

  -- Get total billed from invoices
  SELECT COALESCE(SUM(ci.total_amount), 0) INTO v_total_billed
  FROM client_invoices ci
  WHERE ci.contract_id = p_contract_id
    AND ci.status != 'cancelled';

  -- Get total paid
  SELECT COALESCE(SUM(ci.amount_paid), 0) INTO v_total_paid
  FROM client_invoices ci
  WHERE ci.contract_id = p_contract_id
    AND ci.status != 'cancelled';

  -- Get total retainage held
  SELECT COALESCE(SUM(cbi.total_retainage_held), 0) INTO v_total_retainage
  FROM contract_billing_items cbi
  WHERE cbi.contract_id = p_contract_id
    AND cbi.is_active = true;

  -- Calculate outstanding
  v_total_outstanding := v_total_billed - v_total_paid;

  -- Calculate average percent complete
  SELECT COALESCE(AVG(cbi.percent_complete), 0) INTO v_percent_complete
  FROM contract_billing_items cbi
  WHERE cbi.contract_id = p_contract_id
    AND cbi.is_active = true;

  RETURN QUERY SELECT
    v_contract_amount,
    v_total_billed,
    v_total_retainage,
    v_total_paid,
    v_total_outstanding,
    GREATEST(0, v_contract_amount - v_total_billed),
    CASE WHEN v_contract_amount > 0 THEN (v_total_billed / v_contract_amount * 100) ELSE 0 END,
    v_percent_complete;
END;
$$;

-- =====================================================
-- UPDATE BILLING ITEM AFTER INVOICE FUNCTION
-- =====================================================

CREATE OR REPLACE FUNCTION update_billing_item_after_invoice(
  p_billing_item_id uuid,
  p_billed_amount numeric,
  p_billed_quantity numeric,
  p_retainage_amount numeric
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE contract_billing_items
  SET 
    previously_billed_amount = previously_billed_amount + p_billed_amount,
    previously_billed_quantity = previously_billed_quantity + p_billed_quantity,
    total_retainage_held = total_retainage_held + p_retainage_amount,
    remaining_contract_balance = contract_amount - (previously_billed_amount + p_billed_amount),
    updated_at = now()
  WHERE id = p_billing_item_id;
END;
$$;

-- =====================================================
-- SYNC BOQ ITEMS TO BILLING ITEMS FUNCTION
-- =====================================================

CREATE OR REPLACE FUNCTION sync_boq_to_billing_items(p_contract_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_company_id uuid;
  v_project_id uuid;
  v_boq_id uuid;
  v_count integer := 0;
  v_boq_item RECORD;
  v_retainage_percent numeric;
BEGIN
  -- Get contract details
  SELECT company_id, project_id, retention_percent INTO v_company_id, v_project_id, v_retainage_percent
  FROM client_contracts
  WHERE id = p_contract_id;

  IF v_company_id IS NULL THEN
    RETURN 0;
  END IF;

  -- Get BOQ for project
  SELECT id INTO v_boq_id
  FROM boq_headers
  WHERE project_id = v_project_id
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_boq_id IS NULL THEN
    RETURN 0;
  END IF;

  -- Insert billing items from BOQ items (exclude section headers)
  FOR v_boq_item IN
    SELECT *
    FROM boq_items
    WHERE boq_id = v_boq_id
      AND is_section_header = false
      AND amount > 0
    ORDER BY line_no
  LOOP
    -- Only insert if not already exists
    IF NOT EXISTS (
      SELECT 1 FROM contract_billing_items
      WHERE contract_id = p_contract_id
        AND boq_item_id = v_boq_item.id
    ) THEN
      INSERT INTO contract_billing_items (
        company_id,
        contract_id,
        boq_item_id,
        line_no,
        description,
        unit,
        contract_quantity,
        contract_rate,
        contract_amount,
        retainage_percent,
        remaining_contract_balance
      ) VALUES (
        v_company_id,
        p_contract_id,
        v_boq_item.id,
        v_boq_item.line_no,
        COALESCE(v_boq_item.item, v_boq_item.description, 'Item'),
        COALESCE(v_boq_item.unit, 'EA'),
        COALESCE(v_boq_item.qty, v_boq_item.quantity, 0),
        COALESCE(v_boq_item.rate, 0),
        COALESCE(v_boq_item.amount, 0),
        COALESCE(v_retainage_percent, 0),
        COALESCE(v_boq_item.amount, 0)
      );
      
      v_count := v_count + 1;
    END IF;
  END LOOP;

  RETURN v_count;
END;
$$;
