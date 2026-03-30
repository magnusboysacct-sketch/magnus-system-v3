import { supabase } from './supabase';
import type { Supplier } from './suppliers';

export interface SupplierPriceInfo {
  supplier_id: string;
  supplier_name: string;
  rate: number;
  effective_date: string;
}

export interface BestPriceResult {
  cost_item_id: string;
  suppliers: SupplierPriceInfo[];
  best_price: {
    supplier_id: string;
    supplier_name: string;
    rate: number;
  } | null;
}

/**
 * Get best supplier prices for a cost item
 * 
 * @param costItemId - The cost item ID to compare prices for
 * @returns Best price result with all supplier prices
 */
export async function getBestSupplierPrices(costItemId: string): Promise<BestPriceResult> {
  try {
    // Get all supplier-specific rates for this cost item
    const { data: rates, error } = await supabase
      .from('cost_item_rates')
      .select(`
        supplier_id,
        rate,
        effective_date,
        created_at
      `)
      .eq('cost_item_id', costItemId)
      .eq('is_supplier_specific', true)
      .order('effective_date', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching supplier rates:', error);
      throw new Error(`Failed to fetch supplier rates: ${error.message}`);
    }

    if (!rates || rates.length === 0) {
      return {
        cost_item_id: costItemId,
        suppliers: [],
        best_price: null
      };
    }

    // Group by supplier and get latest rate per supplier
    const supplierMap = new Map<string, SupplierPriceInfo>();
    
    for (const rate of rates) {
      const existing = supplierMap.get(rate.supplier_id);
      
      // Keep only the latest rate for each supplier
      if (!existing || new Date(rate.effective_date) > new Date(existing.effective_date)) {
        // Get supplier name
        const { data: supplier } = await supabase
          .from('suppliers')
          .select('supplier_name')
          .eq('id', rate.supplier_id)
          .maybeSingle();

        supplierMap.set(rate.supplier_id, {
          supplier_id: rate.supplier_id,
          supplier_name: supplier?.supplier_name || 'Unknown Supplier',
          rate: rate.rate,
          effective_date: rate.effective_date
        });
      }
    }

    // Convert to array and find best price
    const supplierPrices = Array.from(supplierMap.values());
    
    if (supplierPrices.length === 0) {
      return {
        cost_item_id: costItemId,
        suppliers: [],
        best_price: null
      };
    }

    // Find the best (lowest) price
    const bestPrice = supplierPrices.reduce((best, current) => {
      if (!best || current.rate < best.rate) {
        return current;
      }
      return best;
    });

    return {
      cost_item_id: costItemId,
      suppliers: supplierPrices,
      best_price: bestPrice
    };
  } catch (error) {
    console.error('Error in getBestSupplierPrices:', error);
    throw new Error(`Failed to get best supplier prices: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Get multiple best prices for multiple cost items
 * 
 * @param costItemIds - Array of cost item IDs
 * @returns Array of best price results
 */
export async function getMultipleBestSupplierPrices(costItemIds: string[]): Promise<BestPriceResult[]> {
  try {
    const results = await Promise.all(
      costItemIds.map(costItemId => getBestSupplierPrices(costItemId))
    );
    
    return results;
  } catch (error) {
    console.error('Error in getMultipleBestSupplierPrices:', error);
    throw new Error(`Failed to get multiple best supplier prices: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Get supplier price comparison for a specific supplier
 * 
 * @param costItemId - Cost item ID
 * @param supplierId - Supplier ID to compare
 * @returns Supplier price info or null if not found
 */
export async function getSupplierPriceForItem(costItemId: string, supplierId: string): Promise<SupplierPriceInfo | null> {
  try {
    const { data: rate, error } = await supabase
      .from('cost_item_rates')
      .select(`
        supplier_id,
        rate,
        effective_date,
        created_at
      `)
      .eq('cost_item_id', costItemId)
      .eq('supplier_id', supplierId)
      .eq('is_supplier_specific', true)
      .order('effective_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('Error fetching supplier price:', error);
      return null;
    }

    if (!rate) {
      return null;
    }

    // Get supplier name
    const { data: supplier } = await supabase
      .from('suppliers')
      .select('supplier_name')
      .eq('id', rate.supplier_id)
      .maybeSingle();

    return {
      supplier_id: rate.supplier_id,
      supplier_name: supplier?.supplier_name || 'Unknown Supplier',
      rate: rate.rate,
      effective_date: rate.effective_date
    };
  } catch (error) {
    console.error('Error in getSupplierPriceForItem:', error);
    return null;
  }
}

/**
 * Check if cost item has multiple supplier prices
 * 
 * @param costItemId - Cost item ID
 * @returns True if multiple suppliers have rates for this item
 */
export async function hasMultipleSuppliers(costItemId: string): Promise<boolean> {
  try {
    const { data: rates, error } = await supabase
      .from('cost_item_rates')
      .select('supplier_id')
      .eq('cost_item_id', costItemId)
      .eq('is_supplier_specific', true);

    if (error) {
      console.error('Error checking multiple suppliers:', error);
      return false;
    }

    if (!rates || rates.length === 0) {
      return false;
    }

    // Count unique suppliers
    const uniqueSuppliers = new Set(rates.map(r => r.supplier_id));
    return uniqueSuppliers.size > 1;
  } catch (error) {
    console.error('Error in hasMultipleSuppliers:', error);
    return false;
  }
}

/**
 * Get best rate for a cost item (lowest supplier price)
 * 
 * @param costItemId - Cost item ID
 * @returns Best rate info or null if no supplier rates exist
 */
export async function getBestRateForCostItem(costItemId: string): Promise<{
  rate: number;
  supplier_id: string;
  supplier_name: string;
} | null> {
  try {
    const bestPriceResult = await getBestSupplierPrices(costItemId);
    
    if (!bestPriceResult.best_price) {
      return null;
    }

    return {
      rate: bestPriceResult.best_price.rate,
      supplier_id: bestPriceResult.best_price.supplier_id,
      supplier_name: bestPriceResult.best_price.supplier_name
    };
  } catch (error) {
    console.error('Error in getBestRateForCostItem:', error);
    return null;
  }
}
