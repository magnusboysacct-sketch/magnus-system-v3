import React from 'react';
import type { BestPriceResult, SupplierWithPerformance } from '../types/procurement';

export function useProcurementIntelligence(
  items: any[],
  supplierRecommendations: Map<string, BestPriceResult>,
  suppliers: SupplierWithPerformance[]
) {
  return React.useMemo(() => {
    let riskyItemsCount = 0;
    let lowConfidenceCount = 0;
    let noCompetitionCount = 0;
    let manualSupplierCount = 0;
    let highSpreadCount = 0;

    items.forEach((item) => {
      const selectedSupplierRecord = suppliers.find(
        (s) => s.id === item.supplier_id
      ) || suppliers.find(
        (s) => s.supplier_name === item.supplier
      );

      const recommendation = item.source_boq_item_id
        ? supplierRecommendations.get(item.source_boq_item_id)
        : null;

      // Low rating risk: selected supplier average_rating < 3.5
      if (selectedSupplierRecord?.average_rating && selectedSupplierRecord.average_rating < 3.5) {
        riskyItemsCount++;
      }

      // Low confidence: selected supplier rating_count < 3
      if (selectedSupplierRecord?.rating_count && selectedSupplierRecord.rating_count < 3) {
        lowConfidenceCount++;
      }

      // No competition: recommendation has 0 or 1 supplier option
      if (recommendation?.suppliers && recommendation.suppliers.length <= 1) {
        noCompetitionCount++;
      }

      // Manual supplier risk: supplier not in supplier directory
      if (!selectedSupplierRecord && item.supplier) {
        manualSupplierCount++;
      }

      // Price spread alert: current rate > recommended/cheapest by more than 10%
      if (item.unit_rate && recommendation?.best_price) {
        const priceSpread = (item.unit_rate - recommendation.best_price.rate) / recommendation.best_price.rate;
        if (priceSpread > 0.1) {
          highSpreadCount++;
        }
      }
    });

    return {
      riskyItemsCount,
      lowConfidenceCount,
      noCompetitionCount,
      manualSupplierCount,
      highSpreadCount,
    };
  }, [items, supplierRecommendations, suppliers]);
}
