/*
  # Add Purchase Order Delivery Tracking

  ## Overview
  Enable receiving/delivery tracking for Purchase Orders by adding delivered_qty
  to purchase_order_items table.

  ## Changes

  ### 1. Purchase Order Items - New Column
    - `delivered_qty` (numeric, default 0) - Quantity delivered/received so far

  ### 2. Business Rules
    - delivered_qty must be non-negative
    - delivered_qty cannot exceed ordered quantity

  ## Security
    - No RLS changes needed - existing policies cover all columns
    - Existing UPDATE policies allow modifications to new field

  ## Related Features
    - When delivered_qty is updated, PO status auto-updates:
      - delivered_qty = 0 for all items → status remains draft/issued
      - 0 < delivered_qty < quantity for any item → status = part_delivered
      - delivered_qty = quantity for all items → status = delivered
    - If procurement_item_id is linked, sync delivered_qty back to procurement_items
*/

-- Step 1: Add delivered_qty column to purchase_order_items
ALTER TABLE purchase_order_items
  ADD COLUMN IF NOT EXISTS delivered_qty numeric DEFAULT 0;

-- Step 2: Add CHECK constraint for delivered_qty
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_po_items_delivered_qty_valid'
  ) THEN
    ALTER TABLE purchase_order_items
      ADD CONSTRAINT chk_po_items_delivered_qty_valid
      CHECK (delivered_qty >= 0 AND delivered_qty <= quantity);
  END IF;
END $$;

-- Step 3: Add helpful comment
COMMENT ON COLUMN purchase_order_items.delivered_qty IS 'Quantity delivered/received so far (supports partial deliveries, cannot exceed ordered quantity)';

-- Step 4: Add index for efficient queries
CREATE INDEX IF NOT EXISTS idx_purchase_order_items_delivered_qty
  ON purchase_order_items(delivered_qty);
