/*
  # Create Purchase Orders System

  ## Overview
  Purchase Order (PO) system to formalize material orders with suppliers.
  POs can be created from procurement items or manually.

  ## New Tables

  ### 1. purchase_orders
    - `id` (uuid, primary key) - Unique PO identifier
    - `company_id` (uuid, not null, FK to companies) - Company ownership
    - `project_id` (uuid, not null, FK to projects) - Project this PO belongs to
    - `supplier_id` (uuid, nullable, FK to suppliers) - Supplier from directory (optional)
    - `supplier_name` (text, not null) - Supplier name (from directory or manual)
    - `po_number` (text, not null) - Purchase order number (e.g., "PO-2026-001")
    - `title` (text, not null) - PO title/description
    - `status` (text, default 'draft') - PO status: draft, issued, part_delivered, delivered, cancelled
    - `issue_date` (date, nullable) - Date PO was issued to supplier
    - `expected_date` (date, nullable) - Expected delivery date
    - `notes` (text, nullable) - Additional notes
    - `created_at` (timestamptz, default now())
    - `updated_at` (timestamptz, default now())

  ### 2. purchase_order_items
    - `id` (uuid, primary key) - Unique item identifier
    - `purchase_order_id` (uuid, not null, FK to purchase_orders) - Parent PO
    - `procurement_item_id` (uuid, nullable, FK to procurement_items) - Source procurement item (if created from procurement)
    - `material_name` (text, not null) - Material/item name
    - `description` (text, nullable) - Item description
    - `quantity` (numeric, not null) - Quantity ordered
    - `unit` (text, nullable) - Unit of measurement
    - `unit_rate` (numeric, default 0) - Rate per unit
    - `total_amount` (numeric, default 0) - Total cost (quantity * unit_rate)
    - `created_at` (timestamptz, default now())
    - `updated_at` (timestamptz, default now())

  ## Indexes
    - Index on company_id for fast company filtering
    - Index on project_id for fast project filtering
    - Index on supplier_id for supplier lookups
    - Index on po_number for quick PO searches
    - Unique constraint on (company_id, po_number) to prevent duplicate PO numbers per company
    - Index on purchase_order_id for item lookups
    - Index on procurement_item_id for tracking PO source

  ## Constraints
    - CHECK constraint on purchase_orders.status (draft, issued, part_delivered, delivered, cancelled)
    - CHECK constraint on purchase_order_items.quantity > 0
    - CHECK constraint on purchase_order_items.unit_rate >= 0
    - CHECK constraint on purchase_order_items.total_amount >= 0

  ## Security
    - Enable RLS on both tables
    - Users can only access POs for projects they are members of
    - Users can only create POs for their company's projects
    - Standard project member policies for CRUD operations

  ## Triggers
    - Auto-update updated_at timestamp on record changes
*/

-- Step 1: Create purchase_orders table
CREATE TABLE IF NOT EXISTS purchase_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  supplier_id uuid REFERENCES suppliers(id) ON DELETE SET NULL,
  supplier_name text NOT NULL,
  po_number text NOT NULL,
  title text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  issue_date date,
  expected_date date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- Constraint: status must be one of the valid values
  CONSTRAINT chk_purchase_orders_status
    CHECK (status IN ('draft', 'issued', 'part_delivered', 'delivered', 'cancelled'))
);

-- Step 2: Create purchase_order_items table
CREATE TABLE IF NOT EXISTS purchase_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id uuid NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  procurement_item_id uuid REFERENCES procurement_items(id) ON DELETE SET NULL,
  material_name text NOT NULL,
  description text,
  quantity numeric NOT NULL,
  unit text,
  unit_rate numeric NOT NULL DEFAULT 0,
  total_amount numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- Constraints: business rules
  CONSTRAINT chk_po_items_quantity_positive CHECK (quantity > 0),
  CONSTRAINT chk_po_items_unit_rate_non_negative CHECK (unit_rate >= 0),
  CONSTRAINT chk_po_items_total_non_negative CHECK (total_amount >= 0)
);

-- Step 3: Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_purchase_orders_company_id ON purchase_orders(company_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_project_id ON purchase_orders(project_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_supplier_id ON purchase_orders(supplier_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_po_number ON purchase_orders(po_number);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_status ON purchase_orders(status);

CREATE INDEX IF NOT EXISTS idx_po_items_purchase_order_id ON purchase_order_items(purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_po_items_procurement_item_id ON purchase_order_items(procurement_item_id);

-- Step 4: Create unique constraint for PO number per company
CREATE UNIQUE INDEX IF NOT EXISTS idx_purchase_orders_company_po_number_unique
  ON purchase_orders(company_id, po_number);

-- Step 5: Create triggers to auto-update updated_at timestamp
DROP TRIGGER IF EXISTS trg_purchase_orders_updated_at ON purchase_orders;
CREATE TRIGGER trg_purchase_orders_updated_at
  BEFORE UPDATE ON purchase_orders
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_purchase_order_items_updated_at ON purchase_order_items;
CREATE TRIGGER trg_purchase_order_items_updated_at
  BEFORE UPDATE ON purchase_order_items
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

-- Step 6: Enable Row Level Security
ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_order_items ENABLE ROW LEVEL SECURITY;

-- Step 7: Create RLS policies for purchase_orders

-- Policy: Project members can view purchase orders for their projects
CREATE POLICY "Project members can view purchase orders"
  ON purchase_orders
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM project_members
      WHERE project_members.project_id = purchase_orders.project_id
        AND project_members.user_id = auth.uid()
    )
  );

-- Policy: Project members can create purchase orders for their projects
CREATE POLICY "Project members can create purchase orders"
  ON purchase_orders
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM project_members
      WHERE project_members.project_id = purchase_orders.project_id
        AND project_members.user_id = auth.uid()
    )
  );

-- Policy: Project members can update purchase orders for their projects
CREATE POLICY "Project members can update purchase orders"
  ON purchase_orders
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM project_members
      WHERE project_members.project_id = purchase_orders.project_id
        AND project_members.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM project_members
      WHERE project_members.project_id = purchase_orders.project_id
        AND project_members.user_id = auth.uid()
    )
  );

-- Policy: Project members can delete purchase orders for their projects
CREATE POLICY "Project members can delete purchase orders"
  ON purchase_orders
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM project_members
      WHERE project_members.project_id = purchase_orders.project_id
        AND project_members.user_id = auth.uid()
    )
  );

-- Step 8: Create RLS policies for purchase_order_items

-- Policy: Project members can view PO items for their projects
CREATE POLICY "Project members can view purchase order items"
  ON purchase_order_items
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM purchase_orders
      JOIN project_members ON project_members.project_id = purchase_orders.project_id
      WHERE purchase_orders.id = purchase_order_items.purchase_order_id
        AND project_members.user_id = auth.uid()
    )
  );

-- Policy: Project members can create PO items for their projects
CREATE POLICY "Project members can create purchase order items"
  ON purchase_order_items
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM purchase_orders
      JOIN project_members ON project_members.project_id = purchase_orders.project_id
      WHERE purchase_orders.id = purchase_order_items.purchase_order_id
        AND project_members.user_id = auth.uid()
    )
  );

-- Policy: Project members can update PO items for their projects
CREATE POLICY "Project members can update purchase order items"
  ON purchase_order_items
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM purchase_orders
      JOIN project_members ON project_members.project_id = purchase_orders.project_id
      WHERE purchase_orders.id = purchase_order_items.purchase_order_id
        AND project_members.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM purchase_orders
      JOIN project_members ON project_members.project_id = purchase_orders.project_id
      WHERE purchase_orders.id = purchase_order_items.purchase_order_id
        AND project_members.user_id = auth.uid()
    )
  );

-- Policy: Project members can delete PO items for their projects
CREATE POLICY "Project members can delete purchase order items"
  ON purchase_order_items
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM purchase_orders
      JOIN project_members ON project_members.project_id = purchase_orders.project_id
      WHERE purchase_orders.id = purchase_order_items.purchase_order_id
        AND project_members.user_id = auth.uid()
    )
  );

-- Step 9: Add helpful comments
COMMENT ON TABLE purchase_orders IS 'Purchase orders sent to suppliers for material procurement';
COMMENT ON TABLE purchase_order_items IS 'Line items within purchase orders - materials/products being ordered';
COMMENT ON COLUMN purchase_orders.po_number IS 'Unique PO number per company, e.g., PO-2026-001';
COMMENT ON COLUMN purchase_orders.supplier_id IS 'Reference to supplier directory (optional, can be manual)';
COMMENT ON COLUMN purchase_orders.supplier_name IS 'Supplier name - from directory or manually entered';
COMMENT ON COLUMN purchase_order_items.procurement_item_id IS 'Links to source procurement item if PO created from procurement';
