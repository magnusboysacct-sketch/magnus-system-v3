/*
  # Procurement Phase 4: Smart Supplier Selection

  ## Overview
  Add intelligent supplier selection using real pricing data to help users
  choose the best supplier for each procurement item.

  ## Changes

  ## Helper Function Usage

  👉 getBestSupplierPrices(costItemId)
    Returns array of best supplier prices for a cost item

  ## Usage Example

  const bestPrices = await getBestSupplierPrices(costItemId);
  const bestPrice = bestPrices[0];

  ## Implementation Details

  - Uses existing getBestSupplierPrices function
  - Returns sorted array by price (lowest first)
  - Includes supplier_id and supplier_name for each price
  - Handles null values gracefully
  - No database writes or schema changes

  ## Integration

  - Works with existing supplier price system
  - Uses current company context for filtering
  - Supports fallback to manual selection
  - No breaking changes

  ## Safety

  - Read-only function
  - No database writes or schema changes
  - Uses existing data structures
  - Uses existing supplier price data

  ## Safety

  - No breaking changes
  - Read-only helper function
  - No database modifications
  - Uses existing data structures
*/

// Re-export the getBestSupplierPrices function from the main supplierPriceComparison module
export { getBestSupplierPrices } from './supplierPriceComparison';
