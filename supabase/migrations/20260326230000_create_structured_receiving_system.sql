/*
  # Procurement Phase 1: Structured Receiving System

  ## Overview
  Create proper receiving tracking tables while maintaining backward compatibility
  with existing procurement, PO, and finance flows.

  ## New Tables

  ### 1. receiving_records
    - Header table for receiving transactions
    - Links to purchase orders and projects
    - Tracks delivery information and notes
    - Maintains audit trail with timestamps

  ### 2. receiving_record_items
    - Line items for receiving transactions
    - Links to purchase order items
    - Tracks quantities received per item
    - Enables detailed receiving history

  ## Backward Compatibility
  - Existing purchase_order_items.delivered_qty logic preserved
  - Current procurement status flow unchanged
  - Finance integration remains the same
  - Existing ReceivingPage.tsx functionality maintained

  ## Integration Points
  - Receiving flow now creates structured records + updates delivered_qty
  - Enables receiving history and reporting
  - Foundation for future receiving enhancements
*/

-- =====================================================
-- RECEIVING RECORDS TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS receiving_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id uuid NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  supplier_id uuid REFERENCES suppliers(id) ON DELETE SET NULL,
  received_date date NOT NULL DEFAULT CURRENT_DATE,
  delivery_note text,
  invoice_number text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Ensure supplier_id column exists (in case table was created without it)
DO $$
BEGIN
  -- Check if column exists, if not add it
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'receiving_records' 
    AND column_name = 'supplier_id'
  ) THEN
    ALTER TABLE receiving_records 
    ADD COLUMN supplier_id uuid REFERENCES suppliers(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_receiving_records_purchase_order_id ON receiving_records(purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_receiving_records_project_id ON receiving_records(project_id);
CREATE INDEX IF NOT EXISTS idx_receiving_records_received_date ON receiving_records(received_date);

-- Only create supplier_id index if column exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'receiving_records' 
    AND column_name = 'supplier_id'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_receiving_records_supplier_id ON receiving_records(supplier_id);
  END IF;
END $$;

-- =====================================================
-- RECEIVING RECORD ITEMS TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS receiving_record_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receiving_record_id uuid NOT NULL REFERENCES receiving_records(id) ON DELETE CASCADE,
  purchase_order_item_id uuid NOT NULL REFERENCES purchase_order_items(id) ON DELETE CASCADE,
  received_qty numeric NOT NULL CHECK (received_qty > 0),
  unit text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_receiving_record_items_record_id ON receiving_record_items(receiving_record_id);
CREATE INDEX IF NOT EXISTS idx_receiving_record_items_po_item_id ON receiving_record_items(purchase_order_item_id);

-- =====================================================
-- ENABLE ROW LEVEL SECURITY
-- =====================================================

ALTER TABLE receiving_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE receiving_record_items ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- RLS POLICIES FOR receiving_records
-- =====================================================

-- Users can view receiving records for their projects
CREATE POLICY "Users can view receiving records for their projects"
  ON receiving_records FOR SELECT
  TO authenticated
  USING (
    project_id IN (
      SELECT project_id FROM project_members 
      WHERE user_id = auth.uid() 
      AND is_active = true
    )
  );

-- Users can insert receiving records for their projects
CREATE POLICY "Users can insert receiving records for their projects"
  ON receiving_records FOR INSERT
  TO authenticated
  WITH CHECK (
    project_id IN (
      SELECT project_id FROM project_members 
      WHERE user_id = auth.uid() 
      AND is_active = true
    )
  );

-- Users can update receiving records for their projects
CREATE POLICY "Users can update receiving records for their projects"
  ON receiving_records FOR UPDATE
  TO authenticated
  USING (
    project_id IN (
      SELECT project_id FROM project_members 
      WHERE user_id = auth.uid() 
      AND is_active = true
    )
  );

-- Users can delete receiving records for their projects
CREATE POLICY "Users can delete receiving records for their projects"
  ON receiving_records FOR DELETE
  TO authenticated
  USING (
    project_id IN (
      SELECT project_id FROM project_members 
      WHERE user_id = auth.uid() 
      AND is_active = true
    )
  );

-- =====================================================
-- RLS POLICIES FOR receiving_record_items
-- =====================================================

-- Users can view receiving items for their projects (via parent record)
CREATE POLICY "Users can view receiving items for their projects"
  ON receiving_record_items FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM receiving_records rr
      WHERE rr.id = receiving_record_items.receiving_record_id
      AND rr.project_id IN (
        SELECT project_id FROM project_members 
        WHERE user_id = auth.uid() 
        AND is_active = true
      )
    )
  );

-- Users can insert receiving items for their projects (via parent record)
CREATE POLICY "Users can insert receiving items for their projects"
  ON receiving_record_items FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM receiving_records rr
      WHERE rr.id = receiving_record_items.receiving_record_id
      AND rr.project_id IN (
        SELECT project_id FROM project_members 
        WHERE user_id = auth.uid() 
        AND is_active = true
      )
    )
  );

-- Users can update receiving items for their projects (via parent record)
CREATE POLICY "Users can update receiving items for their projects"
  ON receiving_record_items FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM receiving_records rr
      WHERE rr.id = receiving_record_items.receiving_record_id
      AND rr.project_id IN (
        SELECT project_id FROM project_members 
        WHERE user_id = auth.uid() 
        AND is_active = true
      )
    )
  );

-- Users can delete receiving items for their projects (via parent record)
CREATE POLICY "Users can delete receiving items for their projects"
  ON receiving_record_items FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM receiving_records rr
      WHERE rr.id = receiving_record_items.receiving_record_id
      AND rr.project_id IN (
        SELECT project_id FROM project_members 
        WHERE user_id = auth.uid() 
        AND is_active = true
      )
    )
  );

-- =====================================================
-- TRIGGERS FOR UPDATED_AT
-- =====================================================

-- Auto-update updated_at on receiving_records
CREATE OR REPLACE FUNCTION update_receiving_records_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_receiving_records_updated_at
  BEFORE UPDATE ON receiving_records
  FOR EACH ROW
  EXECUTE FUNCTION update_receiving_records_updated_at();

-- =====================================================
-- HELPER FUNCTIONS
-- =====================================================

-- Function to get total received quantity for a PO item
CREATE OR REPLACE FUNCTION get_total_received_qty(po_item_id uuid)
RETURNS numeric AS $$
BEGIN
  RETURN COALESCE(
    (
      SELECT SUM(ri.received_qty)
      FROM receiving_record_items ri
      WHERE ri.purchase_order_item_id = po_item_id
    ),
    0
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get receiving history for a purchase order
CREATE OR REPLACE FUNCTION get_receiving_history(purchase_order_id uuid)
RETURNS TABLE (
  receiving_record_id uuid,
  received_date date,
  delivery_note text,
  invoice_number text,
  notes text,
  total_items_received bigint
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    rr.id,
    rr.received_date,
    rr.delivery_note,
    rr.invoice_number,
    rr.notes,
    COUNT(ri.id)::bigint
  FROM receiving_records rr
  LEFT JOIN receiving_record_items ri ON rr.id = ri.receiving_record_id
  WHERE rr.purchase_order_id = get_receiving_history.purchase_order_id
  GROUP BY rr.id, rr.received_date, rr.delivery_note, rr.invoice_number, rr.notes
  ORDER BY rr.received_date DESC, rr.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
