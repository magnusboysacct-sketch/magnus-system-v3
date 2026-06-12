ALTER TABLE item_supplier_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_item_price_history ENABLE ROW LEVEL SECURITY;
 
-- CORRECTED Supplier Intelligence RLS Hardening
-- This migration replaces insecure USING (true) and WITH CHECK (true) policies
-- with proper company ownership validation through CORRECT ownership chain

-- Migration: 20260510170000_harden_supplier_intelligence_rls_corrected.sql

-- CORRECTED OWNERSHIP CHAIN ANALYSIS:
-- item_supplier_links.project_item_id references TWO possible tables:
-- 1. procurement_items.id (via source_boq_item_id -> boq_section_items.id)
-- 2. boq_section_items.id (via boq_sections -> boq_headers -> companies)
--
-- Both paths ultimately lead to company ownership through projects.company_id

-- Drop existing insecure policies
DROP POLICY IF EXISTS "Users can view item supplier links" ON item_supplier_links;
DROP POLICY IF EXISTS "Users can create item supplier links" ON item_supplier_links;
DROP POLICY IF EXISTS "Users can update item supplier links" ON item_supplier_links;
DROP POLICY IF EXISTS "Users can delete item supplier links" ON item_supplier_links;

DROP POLICY IF EXISTS "Users can view price history" ON supplier_item_price_history;
DROP POLICY IF EXISTS "Users can create price history" ON supplier_item_price_history;

-- Create secure policies for item_supplier_links
-- CORRECTED Ownership chain: item_supplier_links.project_item_id -> procurement_items/boq_section_items -> projects.company_id

CREATE POLICY "Users can view company item supplier links"
ON item_supplier_links
FOR SELECT
TO authenticated
USING (
  -- Check via procurement_items path
  EXISTS (
    SELECT 1 FROM procurement_items pi
    JOIN projects p ON p.id = pi.project_id
    WHERE pi.id = item_supplier_links.project_item_id
    AND p.company_id IN (
      SELECT company_id FROM user_profiles WHERE id = auth.uid()
    )
  )
  OR
  -- Check via boq_section_items path  
  EXISTS (
    SELECT 1 FROM boq_section_items bsi
    JOIN boq_sections bs ON bs.id = bsi.section_id
    JOIN boq_headers bh ON bh.id = bs.boq_id
    WHERE bsi.id = item_supplier_links.project_item_id
    AND bh.company_id IN (
      SELECT company_id FROM user_profiles WHERE id = auth.uid()
    )
  )
);

CREATE POLICY "Users can create company item supplier links"
ON item_supplier_links
FOR INSERT
TO authenticated
WITH CHECK (
  -- Check via procurement_items path
  EXISTS (
    SELECT 1 FROM procurement_items pi
    JOIN projects p ON p.id = pi.project_id
    WHERE pi.id = project_item_id
    AND p.company_id IN (
      SELECT company_id FROM user_profiles WHERE id = auth.uid()
    )
  )
  OR
  -- Check via boq_section_items path
  EXISTS (
    SELECT 1 FROM boq_section_items bsi
    JOIN boq_sections bs ON bs.id = bsi.section_id
    JOIN boq_headers bh ON bh.id = bs.boq_id
    WHERE bsi.id = project_item_id
    AND bh.company_id IN (
      SELECT company_id FROM user_profiles WHERE id = auth.uid()
    )
  )
);

CREATE POLICY "Users can update company item supplier links"
ON item_supplier_links
FOR UPDATE
TO authenticated
USING (
  -- Check via procurement_items path
  EXISTS (
    SELECT 1 FROM procurement_items pi
    JOIN projects p ON p.id = pi.project_id
    WHERE pi.id = item_supplier_links.project_item_id
    AND p.company_id IN (
      SELECT company_id FROM user_profiles WHERE id = auth.uid()
    )
  )
  OR
  -- Check via boq_section_items path
  EXISTS (
    SELECT 1 FROM boq_section_items bsi
    JOIN boq_sections bs ON bs.id = bsi.section_id
    JOIN boq_headers bh ON bh.id = bs.boq_id
    WHERE bsi.id = item_supplier_links.project_item_id
    AND bh.company_id IN (
      SELECT company_id FROM user_profiles WHERE id = auth.uid()
    )
  )
)
WITH CHECK (
  -- Check via procurement_items path
  EXISTS (
    SELECT 1 FROM procurement_items pi
    JOIN projects p ON p.id = pi.project_id
    WHERE pi.id = project_item_id
    AND p.company_id IN (
      SELECT company_id FROM user_profiles WHERE id = auth.uid()
    )
  )
  OR
  -- Check via boq_section_items path
  EXISTS (
    SELECT 1 FROM boq_section_items bsi
    JOIN boq_sections bs ON bs.id = bsi.section_id
    JOIN boq_headers bh ON bh.id = bs.boq_id
    WHERE bsi.id = project_item_id
    AND bh.company_id IN (
      SELECT company_id FROM user_profiles WHERE id = auth.uid()
    )
  )
);

CREATE POLICY "Users can delete company item supplier links"
ON item_supplier_links
FOR DELETE
TO authenticated
USING (
  -- Check via procurement_items path
  EXISTS (
    SELECT 1 FROM procurement_items pi
    JOIN projects p ON p.id = pi.project_id
    WHERE pi.id = item_supplier_links.project_item_id
    AND p.company_id IN (
      SELECT company_id FROM user_profiles WHERE id = auth.uid()
    )
  )
  OR
  -- Check via boq_section_items path
  EXISTS (
    SELECT 1 FROM boq_section_items bsi
    JOIN boq_sections bs ON bs.id = bsi.section_id
    JOIN boq_headers bh ON bh.id = bs.boq_id
    WHERE bsi.id = item_supplier_links.project_item_id
    AND bh.company_id IN (
      SELECT company_id FROM user_profiles WHERE id = auth.uid()
    )
  )
);

-- supplier_item_price_history policies remain correct (no changes needed)
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