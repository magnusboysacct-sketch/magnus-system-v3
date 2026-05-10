-- Rollback SQL for Supplier Intelligence RLS Hardening
-- This migration restores the original insecure policies

-- Migration: 20260510170000_harden_supplier_intelligence_rls_rollback.sql

-- Drop secure policies
DROP POLICY IF EXISTS "Users can view company item supplier links" ON item_supplier_links;
DROP POLICY IF EXISTS "Users can create company item supplier links" ON item_supplier_links;
DROP POLICY IF EXISTS "Users can update company item supplier links" ON item_supplier_links;
DROP POLICY IF EXISTS "Users can delete company item supplier links" ON item_supplier_links;

DROP POLICY IF EXISTS "Users can view company supplier price history" ON supplier_item_price_history;
DROP POLICY IF EXISTS "Users can create company supplier price history" ON supplier_item_price_history;

-- Restore original insecure policies
CREATE POLICY "Users can view item supplier links"
ON item_supplier_links
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Users can create item supplier links"
ON item_supplier_links
FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Users can update item supplier links"
ON item_supplier_links
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "Users can delete item supplier links"
ON item_supplier_links
FOR DELETE
TO authenticated
USING (true);

CREATE POLICY "Users can view price history"
ON supplier_item_price_history
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Users can create price history"
ON supplier_item_price_history
FOR INSERT
TO authenticated
WITH CHECK (true);

-- Drop performance indexes (optional, can be kept)
DROP INDEX IF EXISTS idx_item_supplier_links_project_item_company;
DROP INDEX IF EXISTS idx_price_history_supplier_item_company;
