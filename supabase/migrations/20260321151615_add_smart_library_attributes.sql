/*
  # Smart Library Cascading Selection Attributes

  1. Purpose
    - Enable guided, cascading item selection workflow
    - Support drill-down: Category → Item Group → Material → Use Type → Size → Variant
    - Prepare for supplier-linked and variant-heavy items
    - Keep backward compatible with existing flows

  2. New Columns Added to cost_items
    - `item_group` - Item type/group (e.g., "Pipe", "Wire", "Block", "Sheet")
    - `material_type` - Material specification (e.g., "PVC", "Copper", "Concrete", "Steel")
    - `use_type` - Application/use case (e.g., "Drainage", "Potable Water", "Electrical", "Structural")
    - `size_spec` - Size specification (already exists as `item_size`, but ensure it's properly used)
    - `variant_code` - Structured variant identifier (complement to existing `variant` text field)
    - `supplier_sku` - Supplier product code for future supplier linking
    - `is_active` - Active/archived flag for library management
    
  3. Selection Flow Example
    - Step 1: Category = "Plumbing Materials"
    - Step 2: Item Group = "Pipe"
    - Step 3: Material = "PVC"
    - Step 4: Use Type = "Drainage"
    - Step 5: Size = "4 inch"
    - Step 6: Variant = "Schedule 40"
    - Result: PVC Drainage Pipe 4" Sch 40

  4. Backward Compatibility
    - All new columns are nullable
    - Existing items continue to work
    - Old selection flow remains functional
    - New smart selector is opt-in enhancement
*/

-- Add smart library attribute columns to cost_items
DO $$
BEGIN
  -- Item group/type (e.g., "Pipe", "Wire", "Block")
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'cost_items' AND column_name = 'item_group'
  ) THEN
    ALTER TABLE cost_items ADD COLUMN item_group text;
  END IF;

  -- Material type (e.g., "PVC", "Copper", "Concrete")
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'cost_items' AND column_name = 'material_type'
  ) THEN
    ALTER TABLE cost_items ADD COLUMN material_type text;
  END IF;

  -- Use type/application (e.g., "Drainage", "Potable Water", "Structural")
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'cost_items' AND column_name = 'use_type'
  ) THEN
    ALTER TABLE cost_items ADD COLUMN use_type text;
  END IF;

  -- Variant code (structured identifier)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'cost_items' AND column_name = 'variant_code'
  ) THEN
    ALTER TABLE cost_items ADD COLUMN variant_code text;
  END IF;

  -- Supplier SKU for future supplier linking
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'cost_items' AND column_name = 'supplier_sku'
  ) THEN
    ALTER TABLE cost_items ADD COLUMN supplier_sku text;
  END IF;

  -- Active/archived flag
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'cost_items' AND column_name = 'is_active'
  ) THEN
    ALTER TABLE cost_items ADD COLUMN is_active boolean DEFAULT true;
  END IF;

  -- Tags for flexible categorization
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'cost_items' AND column_name = 'tags'
  ) THEN
    ALTER TABLE cost_items ADD COLUMN tags text[];
  END IF;
END $$;

-- Create indexes for efficient filtering in cascading selection
CREATE INDEX IF NOT EXISTS idx_cost_items_item_group 
  ON cost_items(item_group) WHERE item_group IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_cost_items_material_type 
  ON cost_items(material_type) WHERE material_type IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_cost_items_use_type 
  ON cost_items(use_type) WHERE use_type IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_cost_items_is_active 
  ON cost_items(is_active);

CREATE INDEX IF NOT EXISTS idx_cost_items_category_group 
  ON cost_items(category, item_group);

CREATE INDEX IF NOT EXISTS idx_cost_items_smart_cascade 
  ON cost_items(company_id, category, item_group, material_type, use_type, item_size) 
  WHERE is_active = true;

-- Update v_cost_items_current view to include new fields
DROP VIEW IF EXISTS v_cost_items_current CASCADE;

CREATE VIEW v_cost_items_current AS
SELECT 
  ci.id,
  ci.item_name,
  ci.description,
  ci.cost_code,
  ci.category,
  ci.item_type,
  ci.unit,
  ci.variant,
  ci.item_size,
  ci.item_group,
  ci.material_type,
  ci.use_type,
  ci.variant_code,
  ci.supplier_sku,
  ci.is_active,
  ci.tags,
  ci.company_id,
  ci.calculator_json,
  ci.calc_engine_json,
  ci.formula,
  ci.waste_percent,
  ci.labor_formula,
  ci.material_formula,
  ci.equipment_formula,
  ci.calculator_notes,
  ci.measurement_type,
  ci.formula_variables,
  ci.created_at,
  ci.updated_at,
  r.rate as current_rate,
  r.currency as current_currency,
  r.effective_date as current_effective_date,
  r.source as current_source,
  r.batch_id as current_batch_id
FROM cost_items ci
LEFT JOIN LATERAL (
  SELECT rate, currency, effective_date, source, batch_id
  FROM cost_item_rates
  WHERE cost_item_id = ci.id
  ORDER BY effective_date DESC NULLS LAST, created_at DESC
  LIMIT 1
) r ON true;

COMMENT ON VIEW v_cost_items_current IS 'Cost items with their most recent rates and smart library attributes for cascading selection';
