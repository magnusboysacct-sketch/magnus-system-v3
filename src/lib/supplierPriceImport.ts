import { supabase } from "./supabase";
import type { SupplierCostItem, CreateSupplierCostItemInput, CreateSupplierRateInput } from "./suppliers";

// Input row for supplier price import
export interface SupplierPriceImportRow {
  supplier_id: string;
  supplier_sku?: string | null;
  supplier_item_name?: string | null;
  supplier_description?: string | null;
  unit?: string | null;
  price: number;
}

// Import result summary
export interface SupplierPriceImportResult {
  totalRows: number;
  matchedItems: number;
  unmatchedItems: number;
  ratesInserted: number;
  errors: string[];
  warnings: string[];
}

// Internal mapping result
interface ItemMappingResult {
  costItemId: string | null;
  supplierCostItemId: string | null;
  isNewMapping: boolean;
  matchMethod: 'sku' | 'name' | 'unmatched';
}

/**
 * Import supplier prices with safety and validation
 * 
 * @param rows - Array of supplier price rows to import
 * @returns Import result summary
 */
export async function importSupplierPrices(
  rows: SupplierPriceImportRow[]
): Promise<SupplierPriceImportResult> {
  const result: SupplierPriceImportResult = {
    totalRows: rows.length,
    matchedItems: 0,
    unmatchedItems: 0,
    ratesInserted: 0,
    errors: [],
    warnings: []
  };

  if (!rows || rows.length === 0) {
    result.warnings.push("No rows provided for import");
    return result;
  }

  // Process each row
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    
    try {
      // Validate row data
      const validationError = validateImportRow(row, i + 1);
      if (validationError) {
        result.errors.push(validationError);
        continue;
      }

      // Step 1: Find or create mapping
      const mappingResult = await findOrCreateItemMapping(row);
      
      if (mappingResult.matchMethod === 'unmatched') {
        result.unmatchedItems++;
        result.warnings.push(`Row ${i + 1}: No matching cost item found for "${row.supplier_item_name}" (SKU: ${row.supplier_sku || 'none'})`);
      } else {
        result.matchedItems++;
        
        // Step 2: Insert rate if we have a cost item
        if (mappingResult.costItemId) {
          await insertSupplierRate(row, mappingResult.costItemId);
          result.ratesInserted++;
        }
      }

    } catch (error) {
      const errorMsg = `Row ${i + 1}: ${error instanceof Error ? error.message : 'Unknown error'}`;
      result.errors.push(errorMsg);
      console.error('Supplier price import error:', errorMsg, error);
    }
  }

  return result;
}

/**
 * Validate a single import row
 */
function validateImportRow(row: SupplierPriceImportRow, rowNumber: number): string | null {
  // Check required fields
  if (!row.supplier_id) {
    return `Row ${rowNumber}: Missing supplier_id`;
  }

  if (!row.supplier_item_name && !row.supplier_sku) {
    return `Row ${rowNumber}: Must have either supplier_item_name or supplier_sku`;
  }

  // Validate price
  if (!isValidNumber(row.price) || row.price <= 0) {
    return `Row ${rowNumber}: Invalid price (${row.price}). Price must be a positive number`;
  }

  return null;
}

/**
 * Validate number is finite and positive
 */
function isValidNumber(value: any): value is number {
  return typeof value === 'number' && Number.isFinite(value) && !Number.isNaN(value);
}

/**
 * Find existing mapping or create new one
 */
async function findOrCreateItemMapping(row: SupplierPriceImportRow): Promise<ItemMappingResult> {
  // Try SKU match first
  if (row.supplier_sku) {
    const skuMatch = await findMappingBySku(row.supplier_id, row.supplier_sku);
    if (skuMatch) {
      return {
        costItemId: skuMatch.cost_item_id,
        supplierCostItemId: skuMatch.id,
        isNewMapping: false,
        matchMethod: 'sku'
      };
    }
  }

  // Try name match as fallback
  if (row.supplier_item_name) {
    const nameMatch = await findMappingByName(row.supplier_id, row.supplier_item_name);
    if (nameMatch) {
      return {
        costItemId: nameMatch.cost_item_id,
        supplierCostItemId: nameMatch.id,
        isNewMapping: false,
        matchMethod: 'name'
      };
    }
  }

  // Create unmatched mapping
  const newMapping = await createUnmatchedMapping(row);
  return {
    costItemId: null,
    supplierCostItemId: newMapping.id,
    isNewMapping: true,
    matchMethod: 'unmatched'
  };
}

/**
 * Find mapping by supplier SKU
 */
async function findMappingBySku(supplierId: string, sku: string): Promise<SupplierCostItem | null> {
  const { data, error } = await supabase
    .from('supplier_cost_items')
    .select(`
      id,
      cost_item_id,
      supplier_id,
      supplier_sku,
      supplier_item_name,
      supplier_description,
      unit,
      is_preferred,
      created_at,
      updated_at
    `)
    .eq('supplier_id', supplierId)
    .eq('supplier_sku', sku)
    .maybeSingle();

  if (error) {
    console.error('Error finding mapping by SKU:', error);
    return null;
  }

  return data;
}

/**
 * Find mapping by supplier item name (basic match)
 */
async function findMappingByName(supplierId: string, itemName: string): Promise<SupplierCostItem | null> {
  // First try exact match
  const { data: exactMatch, error: exactError } = await supabase
    .from('supplier_cost_items')
    .select(`
      id,
      cost_item_id,
      supplier_id,
      supplier_sku,
      supplier_item_name,
      supplier_description,
      unit,
      is_preferred,
      created_at,
      updated_at
    `)
    .eq('supplier_id', supplierId)
    .eq('supplier_item_name', itemName)
    .maybeSingle();

  if (exactError) {
    console.error('Error finding exact name match:', exactError);
  }

  if (exactMatch) {
    return exactMatch;
  }

  // Try case-insensitive partial match
  const { data: partialMatch, error: partialError } = await supabase
    .from('supplier_cost_items')
    .select(`
      id,
      cost_item_id,
      supplier_id,
      supplier_sku,
      supplier_item_name,
      supplier_description,
      unit,
      is_preferred,
      created_at,
      updated_at
    `)
    .eq('supplier_id', supplierId)
    .ilike('supplier_item_name', `%${itemName}%`)
    .limit(5);

  if (partialError) {
    console.error('Error finding partial name match:', partialError);
    return null;
  }

  // Return best match (first result)
  return partialMatch && partialMatch.length > 0 ? partialMatch[0] : null;
}

/**
 * Create unmatched mapping for items that don't exist in cost_items
 */
async function createUnmatchedMapping(row: SupplierPriceImportRow): Promise<SupplierCostItem> {
  const mappingData: CreateSupplierCostItemInput = {
    supplier_id: row.supplier_id,
    cost_item_id: '', // Will be updated when cost item is created
    supplier_sku: row.supplier_sku || null,
    supplier_item_name: row.supplier_item_name || null,
    supplier_description: row.supplier_description || null,
    unit: row.unit || null,
    is_preferred: false
  };

  const { data, error } = await supabase
    .from('supplier_cost_items')
    .insert(mappingData)
    .select()
    .single();

  if (error) {
    console.error('Error creating unmatched mapping:', error);
    throw new Error(`Failed to create supplier mapping: ${error.message}`);
  }

  return data;
}

/**
 * Insert supplier-specific rate
 */
async function insertSupplierRate(row: SupplierPriceImportRow, costItemId: string): Promise<void> {
  const rateData: CreateSupplierRateInput = {
    cost_item_id: costItemId,
    rate: row.price,
    currency: 'USD', // Default currency, can be extended later
    effective_date: new Date().toISOString().split('T')[0], // Today's date
    source: 'supplier_import',
    supplier_id: row.supplier_id,
    is_supplier_specific: true
  };

  const { error } = await supabase
    .from('cost_item_rates')
    .insert(rateData);

  if (error) {
    console.error('Error inserting supplier rate:', error);
    throw new Error(`Failed to insert supplier rate: ${error.message}`);
  }
}

/**
 * Get unmatched supplier items for later reconciliation
 */
export async function getUnmatchedSupplierItems(supplierId: string): Promise<SupplierCostItem[]> {
  const { data, error } = await supabase
    .from('supplier_cost_items')
    .select(`
      id,
      supplier_id,
      cost_item_id,
      supplier_sku,
      supplier_item_name,
      supplier_description,
      unit,
      is_preferred,
      created_at,
      updated_at
    `)
    .eq('supplier_id', supplierId)
    .is('cost_item_id', null);

  if (error) {
    console.error('Error fetching unmatched items:', error);
    return [];
  }

  return data || [];
}

/**
 * Update unmatched supplier item with cost item reference
 */
export async function updateUnmatchedSupplierItem(
  supplierCostItemId: string, 
  costItemId: string
): Promise<boolean> {
  const { error } = await supabase
    .from('supplier_cost_items')
    .update({ cost_item_id: costItemId })
    .eq('id', supplierCostItemId);

  if (error) {
    console.error('Error updating unmatched item:', error);
    return false;
  }

  return true;
}

/**
 * Get supplier price history for an item
 */
export async function getSupplierPriceHistory(
  supplierId: string, 
  costItemId: string
): Promise<any[]> {
  const { data, error } = await supabase
    .from('cost_item_rates')
    .select(`
      id,
      rate,
      currency,
      effective_date,
      source,
      batch_id,
      supplier_id,
      is_supplier_specific,
      created_at
    `)
    .eq('supplier_id', supplierId)
    .eq('cost_item_id', costItemId)
    .eq('is_supplier_specific', true)
    .order('effective_date', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching supplier price history:', error);
    return [];
  }

  return data || [];
}
