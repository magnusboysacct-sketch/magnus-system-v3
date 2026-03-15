/*
  # Three-Way Matching System for Supplier Invoices

  ## Overview
  Automated validation system that matches supplier invoices against purchase orders
  and receiving records before approval.

  ## New Tables

  ### 1. supplier_invoice_line_items
    - Line-item detail for supplier invoices
    - Links to purchase order items for matching
    - Stores quantity, unit cost, and total for each line
    - Enables item-level matching validation

  ## New Functions

  ### 1. perform_three_way_match(supplier_invoice_id)
    - Validates invoice against PO and receiving records
    - Checks quantity, price, and receiving status
    - Returns match status: matched, quantity_mismatch, price_mismatch, overbilling, no_po, no_receiving
    - Auto-approves perfect matches
    - Flags mismatches for review

  ### 2. auto_approve_matched_invoice(supplier_invoice_id)
    - Automatically approves invoices with perfect 3-way match
    - Updates status and timestamps

  ## Match Logic

  ### Perfect Match Criteria:
  - Purchase order exists and is approved/ordered
  - All line items match PO quantities (within tolerance)
  - All line items match PO prices (within tolerance)
  - Receiving records exist for all line items
  - Invoice quantity <= received quantity
  - No overbilling detected

  ### Mismatch Scenarios:
  - quantity_mismatch: Invoice qty != PO qty or received qty
  - price_mismatch: Invoice unit cost != PO unit cost
  - overbilling: Invoice total > PO total
  - no_po: No purchase order linked
  - no_receiving: No receiving records found

  ## Security
  - RLS policies inherited from parent tables
  - Functions use SECURITY DEFINER for cross-table access
*/

-- =====================================================
-- SUPPLIER INVOICE LINE ITEMS TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS supplier_invoice_line_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_invoice_id uuid NOT NULL REFERENCES supplier_invoices(id) ON DELETE CASCADE,
  purchase_order_item_id uuid REFERENCES purchase_order_items(id),
  line_no integer NOT NULL DEFAULT 1,
  item_name text NOT NULL,
  description text,
  unit text NOT NULL,
  quantity numeric NOT NULL CHECK (quantity > 0),
  unit_cost numeric NOT NULL CHECK (unit_cost >= 0),
  total_amount numeric NOT NULL CHECK (total_amount >= 0),
  
  -- Matching fields
  po_quantity numeric,
  po_unit_cost numeric,
  received_quantity numeric,
  match_status text CHECK (match_status IN ('matched', 'quantity_mismatch', 'price_mismatch', 'not_received', 'pending')),
  match_notes text,
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_supplier_invoice_line_items_invoice ON supplier_invoice_line_items(supplier_invoice_id);
CREATE INDEX IF NOT EXISTS idx_supplier_invoice_line_items_po_item ON supplier_invoice_line_items(purchase_order_item_id);

ALTER TABLE supplier_invoice_line_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view invoice line items for their company"
  ON supplier_invoice_line_items FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM supplier_invoices si
      WHERE si.id = supplier_invoice_line_items.supplier_invoice_id
      AND si.company_id IN (
        SELECT company_id FROM user_profiles WHERE id = auth.uid()
      )
    )
  );

CREATE POLICY "Users can insert invoice line items for their company"
  ON supplier_invoice_line_items FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM supplier_invoices si
      WHERE si.id = supplier_invoice_line_items.supplier_invoice_id
      AND si.company_id IN (
        SELECT company_id FROM user_profiles WHERE id = auth.uid()
      )
    )
  );

CREATE POLICY "Users can update invoice line items for their company"
  ON supplier_invoice_line_items FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM supplier_invoices si
      WHERE si.id = supplier_invoice_line_items.supplier_invoice_id
      AND si.company_id IN (
        SELECT company_id FROM user_profiles WHERE id = auth.uid()
      )
    )
  );

CREATE POLICY "Users can delete invoice line items for their company"
  ON supplier_invoice_line_items FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM supplier_invoices si
      WHERE si.id = supplier_invoice_line_items.supplier_invoice_id
      AND si.company_id IN (
        SELECT company_id FROM user_profiles WHERE id = auth.uid()
      )
    )
  );

-- =====================================================
-- THREE-WAY MATCHING FUNCTION
-- =====================================================

CREATE OR REPLACE FUNCTION perform_three_way_match(p_supplier_invoice_id uuid)
RETURNS TABLE (
  match_status text,
  match_details jsonb,
  can_auto_approve boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_invoice supplier_invoices%ROWTYPE;
  v_po_id uuid;
  v_has_mismatches boolean := false;
  v_missing_po boolean := false;
  v_missing_receiving boolean := false;
  v_price_tolerance numeric := 0.01;
  v_qty_tolerance numeric := 0.01;
  v_line_item RECORD;
  v_match_details jsonb := '[]'::jsonb;
  v_total_invoice_amount numeric := 0;
  v_total_po_amount numeric := 0;
  v_final_status text;
BEGIN
  -- Get invoice details
  SELECT * INTO v_invoice
  FROM supplier_invoices
  WHERE id = p_supplier_invoice_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'error'::text, '{"error": "Invoice not found"}'::jsonb, false;
    RETURN;
  END IF;

  v_po_id := v_invoice.purchase_order_id;

  -- Check if PO exists
  IF v_po_id IS NULL THEN
    UPDATE supplier_invoices
    SET three_way_match_status = 'no_po',
        po_matched = false,
        receiving_matched = false
    WHERE id = p_supplier_invoice_id;
    
    RETURN QUERY SELECT 'no_po'::text, '{"message": "No purchase order linked"}'::jsonb, false;
    RETURN;
  END IF;

  -- Check if PO is valid
  IF NOT EXISTS (
    SELECT 1 FROM purchase_orders 
    WHERE id = v_po_id 
    AND status IN ('approved', 'ordered', 'partial', 'received')
  ) THEN
    UPDATE supplier_invoices
    SET three_way_match_status = 'invalid_po',
        po_matched = false
    WHERE id = p_supplier_invoice_id;
    
    RETURN QUERY SELECT 'invalid_po'::text, '{"message": "Purchase order not approved or invalid status"}'::jsonb, false;
    RETURN;
  END IF;

  -- Loop through invoice line items and match against PO and receiving
  FOR v_line_item IN
    SELECT 
      sil.*,
      poi.quantity as po_qty,
      poi.unit_rate as po_rate,
      poi.total_amount as po_total,
      COALESCE(SUM(rri.received_qty), 0) as total_received_qty
    FROM supplier_invoice_line_items sil
    LEFT JOIN purchase_order_items poi ON poi.id = sil.purchase_order_item_id
    LEFT JOIN receiving_record_items rri ON rri.purchase_order_item_id = sil.purchase_order_item_id
    WHERE sil.supplier_invoice_id = p_supplier_invoice_id
    GROUP BY sil.id, sil.supplier_invoice_id, sil.purchase_order_item_id, sil.line_no, 
             sil.item_name, sil.description, sil.unit, sil.quantity, sil.unit_cost, 
             sil.total_amount, sil.po_quantity, sil.po_unit_cost, sil.received_quantity,
             sil.match_status, sil.match_notes, sil.created_at, sil.updated_at,
             poi.quantity, poi.unit_rate, poi.total_amount
  LOOP
    DECLARE
      v_line_status text := 'matched';
      v_line_notes text := '';
    BEGIN
      -- Check if PO item exists
      IF v_line_item.po_qty IS NULL THEN
        v_line_status := 'no_po_item';
        v_line_notes := 'No matching PO item found';
        v_has_mismatches := true;
        v_missing_po := true;
      ELSE
        -- Check quantity match
        IF ABS(v_line_item.quantity - v_line_item.po_qty) > (v_line_item.po_qty * v_qty_tolerance) THEN
          v_line_status := 'quantity_mismatch';
          v_line_notes := v_line_notes || 'Invoice qty (' || v_line_item.quantity || ') != PO qty (' || v_line_item.po_qty || '). ';
          v_has_mismatches := true;
        END IF;

        -- Check price match
        IF ABS(v_line_item.unit_cost - v_line_item.po_rate) > (v_line_item.po_rate * v_price_tolerance) THEN
          IF v_line_status = 'quantity_mismatch' THEN
            v_line_status := 'qty_price_mismatch';
          ELSE
            v_line_status := 'price_mismatch';
          END IF;
          v_line_notes := v_line_notes || 'Invoice price (' || v_line_item.unit_cost || ') != PO price (' || v_line_item.po_rate || '). ';
          v_has_mismatches := true;
        END IF;

        -- Check receiving
        IF v_line_item.total_received_qty = 0 THEN
          v_line_status := 'not_received';
          v_line_notes := v_line_notes || 'No receiving records found. ';
          v_missing_receiving := true;
          v_has_mismatches := true;
        ELSIF v_line_item.quantity > v_line_item.total_received_qty THEN
          v_line_status := 'exceeds_received';
          v_line_notes := v_line_notes || 'Invoice qty (' || v_line_item.quantity || ') > received qty (' || v_line_item.total_received_qty || '). ';
          v_has_mismatches := true;
        END IF;
      END IF;

      -- Update line item with match results
      UPDATE supplier_invoice_line_items
      SET match_status = v_line_status,
          match_notes = v_line_notes,
          po_quantity = v_line_item.po_qty,
          po_unit_cost = v_line_item.po_rate,
          received_quantity = v_line_item.total_received_qty,
          updated_at = now()
      WHERE id = v_line_item.id;

      -- Add to match details
      v_match_details := v_match_details || jsonb_build_object(
        'line_no', v_line_item.line_no,
        'item_name', v_line_item.item_name,
        'status', v_line_status,
        'notes', v_line_notes,
        'invoice_qty', v_line_item.quantity,
        'invoice_cost', v_line_item.unit_cost,
        'po_qty', v_line_item.po_qty,
        'po_cost', v_line_item.po_rate,
        'received_qty', v_line_item.total_received_qty
      );

      v_total_invoice_amount := v_total_invoice_amount + v_line_item.total_amount;
      v_total_po_amount := v_total_po_amount + COALESCE(v_line_item.po_total, 0);
    END;
  END LOOP;

  -- Determine final status
  IF v_missing_po THEN
    v_final_status := 'no_po';
  ELSIF v_missing_receiving THEN
    v_final_status := 'no_receiving';
  ELSIF v_total_invoice_amount > (v_total_po_amount * 1.01) THEN
    v_final_status := 'overbilling';
    v_has_mismatches := true;
  ELSIF v_has_mismatches THEN
    v_final_status := 'mismatch';
  ELSE
    v_final_status := 'matched';
  END IF;

  -- Update invoice header
  UPDATE supplier_invoices
  SET three_way_match_status = v_final_status,
      po_matched = (v_final_status IN ('matched', 'mismatch')),
      receiving_matched = (NOT v_missing_receiving),
      updated_at = now()
  WHERE id = p_supplier_invoice_id;

  -- Auto-approve if perfect match
  IF v_final_status = 'matched' AND v_invoice.status = 'pending' THEN
    PERFORM auto_approve_matched_invoice(p_supplier_invoice_id);
  END IF;

  RETURN QUERY SELECT 
    v_final_status,
    jsonb_build_object(
      'total_invoice_amount', v_total_invoice_amount,
      'total_po_amount', v_total_po_amount,
      'line_items', v_match_details
    ),
    (v_final_status = 'matched');
END;
$$;

-- =====================================================
-- AUTO-APPROVAL FUNCTION
-- =====================================================

CREATE OR REPLACE FUNCTION auto_approve_matched_invoice(p_supplier_invoice_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current_status text;
BEGIN
  -- Get current status
  SELECT status INTO v_current_status
  FROM supplier_invoices
  WHERE id = p_supplier_invoice_id;

  -- Only auto-approve if pending
  IF v_current_status = 'pending' THEN
    UPDATE supplier_invoices
    SET status = 'approved',
        approved_at = now(),
        approved_by = auth.uid(),
        updated_at = now()
    WHERE id = p_supplier_invoice_id;
    
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

-- =====================================================
-- TRIGGER FOR AUTO-MATCHING ON INSERT
-- =====================================================

CREATE OR REPLACE FUNCTION trigger_auto_match_on_line_item_complete()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_line_count integer;
  v_invoice_id uuid;
BEGIN
  v_invoice_id := NEW.supplier_invoice_id;
  
  -- Count line items for this invoice
  SELECT COUNT(*) INTO v_line_count
  FROM supplier_invoice_line_items
  WHERE supplier_invoice_id = v_invoice_id;
  
  -- If we have line items, perform matching
  IF v_line_count > 0 THEN
    PERFORM perform_three_way_match(v_invoice_id);
  END IF;
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER auto_match_invoice_on_line_insert
  AFTER INSERT ON supplier_invoice_line_items
  FOR EACH ROW
  EXECUTE FUNCTION trigger_auto_match_on_line_item_complete();

CREATE TRIGGER auto_match_invoice_on_line_update
  AFTER UPDATE ON supplier_invoice_line_items
  FOR EACH ROW
  EXECUTE FUNCTION trigger_auto_match_on_line_item_complete();
