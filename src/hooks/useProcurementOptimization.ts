import React from 'react';
import type { BestPriceResult } from '../types/procurement';

export function useProcurementOptimization(
  items: any[],
  supplierRecommendations: Map<string, BestPriceResult>
) {
  return React.useMemo(() => {
    let currentSelectedCost = 0;
    let optimizedCost = 0;
    let improvableItemsCount = 0;

    items.forEach((item) => {
      const quantity = item.quantity || 0;
      const currentRate = item.unit_rate || 0;
      const currentCost = quantity * currentRate;
      
      currentSelectedCost += currentCost;

      const recommendation = item.source_boq_item_id
        ? supplierRecommendations.get(item.source_boq_item_id)
        : null;

      let optimizedRate = currentRate;
      if (recommendation?.best_price?.rate) {
        optimizedRate = recommendation.best_price.rate;
      }

      const optimizedItemCost = quantity * optimizedRate;
      optimizedCost += optimizedItemCost;

      if (optimizedRate < currentRate && quantity > 0) {
        improvableItemsCount++;
      }
    });

    const potentialSavings = currentSelectedCost - optimizedCost;

    return {
      currentSelectedCost,
      optimizedCost,
      potentialSavings,
      improvableItemsCount,
    };
  }, [items, supplierRecommendations]);
}
