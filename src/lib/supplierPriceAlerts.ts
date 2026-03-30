import { supabase } from './supabase';

export interface PriceChange {
  cost_item_id: string;
  supplier_id: string;
  change_type: 'increase' | 'decrease' | 'new' | 'best_change';
  old_rate: number | null;
  new_rate: number;
  difference: number | null;
  effective_date: string | null;
}

/**
 * Detect price changes by comparing latest supplier rates with previous rates
 * 
 * @param supplierId - Supplier ID to check for price changes
 * @returns Array of detected price changes
 */
export async function detectPriceChanges(supplierId: string): Promise<PriceChange[]> {
  try {
    // Get all supplier-specific rates ordered by date
    const { data: rates, error } = await supabase
      .from('cost_item_rates')
      .select(`
        cost_item_id,
        rate,
        effective_date,
        created_at,
        source
      `)
      .eq('supplier_id', supplierId)
      .eq('is_supplier_specific', true)
      .order('effective_date', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching rates for price change detection:', error);
      throw new Error(`Failed to fetch rates: ${error.message}`);
    }

    if (!rates || rates.length === 0) {
      return [];
    }

    // Group rates by cost item
    const ratesByItem = new Map<string, typeof rates>();
    
    for (const rate of rates) {
      if (!ratesByItem.has(rate.cost_item_id)) {
        ratesByItem.set(rate.cost_item_id, []);
      }
      ratesByItem.get(rate.cost_item_id)!.push(rate);
    }

    // Detect changes for each cost item
    const changes: PriceChange[] = [];

    for (const [costItemId, itemRates] of ratesByItem) {
      if (itemRates.length < 2) {
        // Only one rate, this is a new price
        const latestRate = itemRates[0];
        
        changes.push({
          cost_item_id: costItemId,
          supplier_id: supplierId,
          change_type: 'new',
          old_rate: null,
          new_rate: latestRate.rate,
          difference: null,
          effective_date: latestRate.effective_date
        });
        continue;
      }

      // Get latest and previous rates
      const latestRate = itemRates[0];
      const previousRate = itemRates[1];

      // Check if this is a best price change
      const isLatestBestPrice = latestRate.source === 'best_price';
      const isPreviousBestPrice = previousRate.source === 'best_price';

      let changeType: 'increase' | 'decrease' | 'best_change';
      
      if (isLatestBestPrice && !isPreviousBestPrice) {
        // Changed to best price
        changeType = 'best_change';
      } else if (latestRate.rate > previousRate.rate) {
        // Price increased
        changeType = 'increase';
      } else if (latestRate.rate < previousRate.rate) {
        // Price decreased
        changeType = 'decrease';
      } else {
        // No change, skip
        continue;
      }

      const difference = Math.abs(latestRate.rate - previousRate.rate);

      changes.push({
        cost_item_id: costItemId,
        supplier_id: supplierId,
        change_type: changeType,
        old_rate: previousRate.rate,
        new_rate: latestRate.rate,
        difference,
        effective_date: latestRate.effective_date
      });
    }

    return changes;
  } catch (error) {
    console.error('Error in detectPriceChanges:', error);
    throw new Error(`Failed to detect price changes: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Get price changes for multiple suppliers
 * 
 * @param supplierIds - Array of supplier IDs
 * @returns Array of all price changes across suppliers
 */
export async function detectMultiplePriceChanges(supplierIds: string[]): Promise<PriceChange[]> {
  try {
    const results = await Promise.all(
      supplierIds.map(supplierId => detectPriceChanges(supplierId))
    );
    
    return results.flat();
  } catch (error) {
    console.error('Error in detectMultiplePriceChanges:', error);
    throw new Error(`Failed to detect multiple price changes: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Get recent price changes for dashboard
 * 
 * @param days - Number of days to look back
 * @returns Recent price changes with supplier info
 */
export async function getRecentPriceChanges(days: number = 7): Promise<(PriceChange & { supplier_name: string })[]> {
  try {
    // Get recent rates with supplier info
    const { data: recentRates, error } = await supabase
      .from('cost_item_rates')
      .select(`
        cost_item_id,
        rate,
        effective_date,
        created_at,
        supplier_id,
        source,
        suppliers!inner(supplier_name)
      `)
      .eq('is_supplier_specific', true)
      .gte('created_at', new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString())
      .order('created_at', { ascending: false })
      .limit(1000); // Limit to prevent performance issues

    if (error) {
      console.error('Error fetching recent rates:', error);
      return [];
    }

    if (!recentRates || recentRates.length === 0) {
      return [];
    }

    // Group rates by cost item and supplier
    const ratesByItemSupplier = new Map<string, typeof recentRates>();
    
    for (const rate of recentRates) {
      const key = `${rate.cost_item_id}-${rate.supplier_id}`;
      if (!ratesByItemSupplier.has(key)) {
        ratesByItemSupplier.set(key, []);
      }
      ratesByItemSupplier.get(key)!.push(rate);
    }

    const changes: (PriceChange & { supplier_name: string })[] = [];

    for (const [key, itemRates] of ratesByItemSupplier) {
      if (itemRates.length < 2) continue;

      const latestRate = itemRates[0];
      const previousRate = itemRates[1];

      let changeType: 'increase' | 'decrease' | 'best_change' | null = null;
      
      if (latestRate.rate > previousRate.rate) {
        changeType = 'increase';
      } else if (latestRate.rate < previousRate.rate) {
        changeType = 'decrease';
      } else if (latestRate.source === 'best_price' && previousRate.source !== 'best_price') {
        changeType = 'best_change';
      }

      if (changeType) {
        // Extract supplier name from the rate object structure
        const supplierName = (latestRate as any).suppliers?.supplier_name || 'Unknown Supplier';
        
        changes.push({
          cost_item_id: latestRate.cost_item_id,
          supplier_id: latestRate.supplier_id,
          change_type: changeType,
          old_rate: previousRate.rate,
          new_rate: latestRate.rate,
          difference: Math.abs(latestRate.rate - previousRate.rate),
          supplier_name: supplierName,
          effective_date: latestRate.effective_date
        });
      }
    }

    return changes;
  } catch (error) {
    console.error('Error in getRecentPriceChanges:', error);
    return [];
  }
}

/**
 * Log price change alert to console (temporary storage)
 * 
 * @param change - Price change to log
 */
export function logPriceChangeAlert(change: PriceChange & { supplier_name?: string }): void {
  const timestamp = new Date().toISOString();
  const changeText = getChangeDescription(change);
  
  console.group(`🔔 Price Change Alert - ${timestamp}`);
  console.log(`Item: ${change.cost_item_id}`);
  console.log(`Supplier: ${change.supplier_id}${change.supplier_name ? ` (${change.supplier_name})` : ''}`);
  console.log(`Change: ${changeText}`);
  if (change.old_rate && change.new_rate) {
    console.log(`Price: $${change.old_rate.toFixed(2)} → $${change.new_rate.toFixed(2)}`);
    if (change.difference) {
      console.log(`Difference: $${change.difference.toFixed(2)} (${change.difference > 0 ? '+' : ''}${((change.difference / change.old_rate) * 100).toFixed(1)}%)`);
    }
  }
  console.groupEnd();
}

/**
 * Get human-readable description of price change
 * 
 * @param change - Price change object
 * @returns Description string
 */
export function getChangeDescription(change: PriceChange): string {
  switch (change.change_type) {
    case 'increase':
      return 'Price increased';
    case 'decrease':
      return 'Price decreased';
    case 'new':
      return 'New price available';
    case 'best_change':
      return 'Best price applied';
    default:
      return 'Price updated';
  }
}

/**
 * Get color class for price change type
 * 
 * @param changeType - Type of price change
 * @returns CSS class name
 */
export function getChangeColorClass(changeType: string): string {
  switch (changeType) {
    case 'decrease':
      return 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20'; // Green for cheaper
    case 'increase':
      return 'text-red-500 bg-red-500/10 border-red-500/20'; // Red for more expensive
    case 'best_change':
      return 'text-blue-500 bg-blue-500/10 border-blue-500/20'; // Blue for best price
    case 'new':
      return 'text-amber-500 bg-amber-500/10 border-amber-500/20'; // Amber for new
    default:
      return 'text-slate-500 bg-slate-500/10 border-slate-500/20'; // Gray for unknown
  }
}
