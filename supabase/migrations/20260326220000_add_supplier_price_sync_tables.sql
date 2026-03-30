/*
  # Phase 1: Supplier Price Sync Database Foundation

  1. Purpose
    - Add supplier-item mapping capability
    - Extend rate tracking for supplier-specific pricing
    - Prepare foundation for Jamaica supplier price sync
    - Maintain full backward compatibility

  2. New Tables
    - `supplier_cost_items`
      - Links suppliers to cost_items
      - Stores supplier-specific product information
      - Supports preferred supplier designation
      - Follows existing company-based RLS pattern

  3. Extended Tables
    - `cost_item_rates` (extended, not modified)
      - Add supplier_id for supplier-specific rate tracking
      - Add is_supplier_specific flag for rate source identification
      - All existing columns preserved

  4. Backward Compatibility
    - Existing rate system unchanged
    - BOQ and Takeoff continue to work
    - v_cost_items_current view unaffected
    - No breaking changes to existing queries

  5. Migration Safety
    - All new columns are nullable with safe defaults
    - Foreign key constraints protect data integrity
    - RLS policies follow existing company-based pattern
    - Indexes added for performance
*/

-- Create supplier-item mapping table
CREATE TABLE IF NOT EXISTS supplier_cost_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id uuid NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  cost_item_id uuid NOT NULL REFERENCES cost_items(id) ON DELETE CASCADE,
  supplier_sku text,
  supplier_item_name text,
  supplier_description text,
  unit text,
  is_preferred boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Create unique constraint: one mapping per supplier-item pair
CREATE UNIQUE INDEX IF NOT EXISTS idx_supplier_cost_items_supplier_item_unique 
  ON supplier_cost_items(supplier_id, cost_item_id);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_supplier_cost_items_supplier_id 
  ON supplier_cost_items(supplier_id);
CREATE INDEX IF NOT EXISTS idx_supplier_cost_items_cost_item_id 
  ON supplier_cost_items(cost_item_id);
CREATE INDEX IF NOT EXISTS idx_supplier_cost_items_preferred 
  ON supplier_cost_items(is_preferred) WHERE is_preferred = true;
CREATE INDEX IF NOT EXISTS idx_supplier_cost_items_sku 
  ON supplier_cost_items(supplier_sku) WHERE supplier_sku IS NOT NULL;

-- Add trigger to auto-update updated_at timestamp
DROP TRIGGER IF EXISTS trg_supplier_cost_items_updated_at ON supplier_cost_items;
CREATE TRIGGER trg_supplier_cost_items_updated_at
  BEFORE UPDATE ON supplier_cost_items
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

-- Extend cost_item_rates table for supplier-specific pricing
DO $$
BEGIN
  -- Add supplier_id column for linking rates to suppliers
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'cost_item_rates' AND column_name = 'supplier_id'
  ) THEN
    ALTER TABLE cost_item_rates ADD COLUMN supplier_id uuid REFERENCES suppliers(id) ON DELETE SET NULL;
  END IF;

  -- Add flag to identify supplier-specific rates
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'cost_item_rates' AND column_name = 'is_supplier_specific'
  ) THEN
    ALTER TABLE cost_item_rates ADD COLUMN is_supplier_specific boolean DEFAULT false;
  END IF;
END $$;

-- Add indexes for new rate table columns
CREATE INDEX IF NOT EXISTS idx_cost_item_rates_supplier_id 
  ON cost_item_rates(supplier_id) WHERE supplier_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cost_item_rates_supplier_specific 
  ON cost_item_rates(is_supplier_specific) WHERE is_supplier_specific = true;

-- Enable Row Level Security on supplier_cost_items
ALTER TABLE supplier_cost_items ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can view supplier-item mappings in their company
CREATE POLICY "Users can view supplier_cost_items in their company"
  ON supplier_cost_items
  FOR SELECT
  TO authenticated
  USING (
    supplier_id IN (
      SELECT id FROM suppliers 
      WHERE company_id IN (
        SELECT company_id FROM user_profiles WHERE id = auth.uid()
      )
    )
  );

-- RLS Policy: Users can insert supplier-item mappings in their company
CREATE POLICY "Users can insert supplier_cost_items in their company"
  ON supplier_cost_items
  FOR INSERT
  TO authenticated
  WITH CHECK (
    supplier_id IN (
      SELECT id FROM suppliers 
      WHERE company_id IN (
        SELECT company_id FROM user_profiles WHERE id = auth.uid()
      )
    )
  );

-- RLS Policy: Users can update supplier-item mappings in their company
CREATE POLICY "Users can update supplier_cost_items in their company"
  ON supplier_cost_items
  FOR UPDATE
  TO authenticated
  USING (
    supplier_id IN (
      SELECT id FROM suppliers 
      WHERE company_id IN (
        SELECT company_id FROM user_profiles WHERE id = auth.uid()
      )
    )
  )
  WITH CHECK (
    supplier_id IN (
      SELECT id FROM suppliers 
      WHERE company_id IN (
        SELECT company_id FROM user_profiles WHERE id = auth.uid()
      )
    )
  );

-- RLS Policy: Users can delete supplier-item mappings in their company
CREATE POLICY "Users can delete supplier_cost_items in their company"
  ON supplier_cost_items
  FOR DELETE
  TO authenticated
  USING (
    supplier_id IN (
      SELECT id FROM suppliers 
      WHERE company_id IN (
        SELECT company_id FROM user_profiles WHERE id = auth.uid()
      )
    )
  );

-- Add comments for documentation
COMMENT ON TABLE supplier_cost_items IS 'Mapping table linking suppliers to cost items with supplier-specific product information';
COMMENT ON COLUMN supplier_cost_items.supplier_id IS 'Reference to the supplier';
COMMENT ON COLUMN supplier_cost_items.cost_item_id IS 'Reference to the cost item from the library';
COMMENT ON COLUMN supplier_cost_items.supplier_sku IS 'Supplier-specific product code/SKU';
COMMENT ON COLUMN supplier_cost_items.supplier_item_name IS 'Supplier-specific product name';
COMMENT ON COLUMN supplier_cost_items.supplier_description IS 'Supplier-specific product description';
COMMENT ON COLUMN supplier_cost_items.unit IS 'Supplier-specific unit of measure';
COMMENT ON COLUMN supplier_cost_items.is_preferred IS 'Flag indicating preferred supplier for this item';

COMMENT ON COLUMN cost_item_rates.supplier_id IS 'Reference to supplier for supplier-specific rates';
COMMENT ON COLUMN cost_item_rates.is_supplier_specific IS 'Flag indicating if this rate comes from a supplier (vs general market rate)';
