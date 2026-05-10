-- Harden Supplier Intelligence RLS Policies
-- This migration replaces insecure USING (true) and WITH CHECK (true) policies
-- with proper company ownership validation through project_item_id -> cost_items.company_id

-- Migration: 20260510170000_harden_supplier_intelligence_rls.sql

-- Drop existing insecure policies
DROP POLICY IF EXISTS "Users can view item supplier links" ON item_supplier_links;
DROP POLICY IF EXISTS "Users can create item supplier links" ON item_supplier_links;
DROP POLICY IF EXISTS "Users can update item supplier links" ON item_supplier_links;
DROP POLICY IF EXISTS "Users can delete item supplier links" ON item_supplier_links;

DROP POLICY IF EXISTS "Users can view price history" ON supplier_item_price_history;
DROP POLICY IF EXISTS "Users can create price history" ON supplier_item_price_history;

-- Create secure policies for item_supplier_links
-- Ownership chain: item_supplier_links.project_item_id -> cost_items.id -> cost_items.company_id

CREATE POLICY "Users can view company item supplier links"
ON item_supplier_links
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM cost_items ci
    WHERE ci.id = item_supplier_links.project_item_id
    AND ci.company_id IN (
      SELECT company_id FROM user_profiles WHERE id = auth.uid()
    )
  )
);

CREATE POLICY "Users can create company item supplier links"
ON item_supplier_links
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM cost_items ci
    WHERE ci.id = project_item_id
    AND ci.company_id IN (
      SELECT company_id FROM user_profiles WHERE id = auth.uid()
    )
  )
);

CREATE POLICY "Users can update company item supplier links"
ON item_supplier_links
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM cost_items ci
    WHERE ci.id = item_supplier_links.project_item_id
    AND ci.company_id IN (
      SELECT company_id FROM user_profiles WHERE id = auth.uid()
    )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM cost_items ci
    WHERE ci.id = project_item_id
    AND ci.company_id IN (
      SELECT company_id FROM user_profiles WHERE id = auth.uid()
    )
  )
);

CREATE POLICY "Users can delete company item supplier links"
ON item_supplier_links
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM cost_items ci
    WHERE ci.id = item_supplier_links.project_item_id
    AND ci.company_id IN (
      SELECT company_id FROM user_profiles WHERE id = auth.uid()
    )
  )
);

-- Create secure policies for supplier_item_price_history
-- Ownership chain: supplier_item_price_history.supplier_item_id -> supplier_items.id -> suppliers.company_id

CREATE POLICY "Users can view company supplier price history"
ON supplier_item_price_history
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM supplier_items si
    JOIN suppliers s ON s.id = si.supplier_id
    WHERE si.id = supplier_item_price_history.supplier_item_id
    AND s.company_id IN (
      SELECT company_id FROM user_profiles WHERE id = auth.uid()
    )
  )
);

CREATE POLICY "Users can create company supplier price history"
ON supplier_item_price_history
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM supplier_items si
    JOIN suppliers s ON s.id = si.supplier_id
    WHERE si.id = supplier_item_id
    AND s.company_id IN (
      SELECT company_id FROM user_profiles WHERE id = auth.uid()
    )
  )
);

-- Add indexes for performance with company ownership validation
CREATE INDEX IF NOT EXISTS idx_item_supplier_links_project_item_company 
ON item_supplier_links(project_item_id);

CREATE INDEX IF NOT EXISTS idx_price_history_supplier_item_company 
ON supplier_item_price_history(supplier_item_id);
