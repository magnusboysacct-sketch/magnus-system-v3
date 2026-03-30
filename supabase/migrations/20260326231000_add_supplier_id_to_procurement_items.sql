/*
  # Procurement Phase 2: Supplier Structure Fix

  ## Overview
  Add supplier_id to procurement_items for proper supplier relationships
  while maintaining backward compatibility with existing supplier text field.

  ## Changes

  ### 1. Add supplier_id to procurement_items
    - Add nullable supplier_id foreign key to suppliers table
    - Keep existing supplier text field for backward compatibility
    - Enable dual supplier reference system

  ### 2. Update Indexes
    - Add index on supplier_id for efficient queries
    - Keep existing supplier text index

  ### 3. Update RLS Policies
    - Include supplier_id in existing policies
    - Maintain current access patterns

  ## Backward Compatibility
  - Existing supplier text field preserved
  - All existing functionality continues to work
  - Gradual migration to structured supplier references
  - Fallback to text field when supplier_id is null

  ## Data Migration (Optional)
  - Attempt to match existing supplier text to suppliers table
  - Populate supplier_id where matches found
  - No forced overwrites of existing data
*/

-- =====================================================
-- ADD supplier_id TO procurement_items
-- =====================================================

-- Add supplier_id column to procurement_items
ALTER TABLE procurement_items 
  ADD COLUMN IF NOT EXISTS supplier_id uuid REFERENCES suppliers(id) ON DELETE SET NULL;

-- Add index for supplier_id lookups
CREATE INDEX IF NOT EXISTS idx_procurement_items_supplier_id ON procurement_items(supplier_id);

-- =====================================================
-- OPTIONAL DATA MIGRATION
-- =====================================================

-- Try to match existing supplier text to suppliers table
-- This is a safe migration that only adds supplier_id where exact matches are found
DO $$
DECLARE
  procurement_record RECORD;
  supplier_match RECORD;
  matched_count INTEGER := 0;
BEGIN
  -- Loop through procurement items with supplier text but no supplier_id
  FOR procurement_record IN 
    SELECT id, supplier, project_id
    FROM procurement_items 
    WHERE supplier IS NOT NULL 
    AND supplier_id IS NULL
    AND supplier != ''
    AND supplier != 'Unknown Supplier'
    LIMIT 1000  -- Process in batches to avoid long-running migrations
  LOOP
    -- Try to find exact supplier match within same company
    BEGIN
      SELECT s.id INTO supplier_match
      FROM suppliers s
      JOIN projects p ON s.company_id = p.company_id
      WHERE p.id = procurement_record.project_id
      AND s.supplier_name = procurement_record.supplier
      AND s.is_active = true
      LIMIT 1;
      
      -- If match found, update supplier_id
      IF supplier_match.id IS NOT NULL THEN
        UPDATE procurement_items 
        SET supplier_id = supplier_match.id 
        WHERE id = procurement_record.id;
        
        matched_count := matched_count + 1;
      END IF;
      
      supplier_match := NULL; -- Reset for next iteration
    EXCEPTION
      WHEN OTHERS THEN
        -- Log error but continue processing
        RAISE NOTICE 'Error matching supplier for procurement item %: %', 
                     procurement_record.id, SQLERRM;
    END;
  END LOOP;
  
  RAISE NOTICE 'Supplier migration completed. Matched % records.', matched_count;
END $$;

-- =====================================================
-- UPDATE RLS POLICIES (if needed)
-- =====================================================

-- Existing policies should continue to work as they use project_id for access control
-- No changes needed to RLS policies since supplier_id is just an additional field

-- =====================================================
-- HELPER FUNCTION FOR SUPPLIER RESOLUTION
-- =====================================================

-- Function to get supplier info (either from supplier_id or text field)
CREATE OR REPLACE FUNCTION get_procurement_supplier_info(
  procurement_item_id uuid
)
RETURNS TABLE (
  supplier_id uuid,
  supplier_name text,
  is_structured boolean
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    pi.supplier_id,
    CASE 
      WHEN pi.supplier_id IS NOT NULL THEN s.supplier_name
      ELSE pi.supplier
    END as supplier_name,
    (pi.supplier_id IS NOT NULL) as is_structured
  FROM procurement_items pi
  LEFT JOIN suppliers s ON pi.supplier_id = s.id
  WHERE pi.id = get_procurement_supplier_info.procurement_item_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
