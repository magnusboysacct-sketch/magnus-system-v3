-- Fix item_type casing to match UI constants (Material / Labor / Equipment)
UPDATE cost_items
SET item_type = initcap(item_type)
WHERE item_type IN ('material', 'labor', 'equipment', 'subcontract', 'other');
