import React from 'react';
import type { BestPriceResult, SupplierWithPerformance } from '../types/procurement';
import { calculateSupplierScore, type SupplierScore } from './useSupplierScore';

export function useSupplierRowAnalysis(
  item: any,
  suppliers: SupplierWithPerformance[],
  supplierRecommendations: Map<string, BestPriceResult>
) {
  return React.useMemo(() => {
    const isSupplierInDirectory = suppliers.some(
      (s) => s.id === (item.supplier_id ?? null)
    ) || suppliers.some(
      (s) => s.supplier_name === item.supplier
    );

    const rankedSuppliers = [...suppliers].sort((a, b) => {
      const ratingDiff = (b.average_rating ?? 0) - (a.average_rating ?? 0);
      if (Math.abs(ratingDiff) > 0.001) return ratingDiff;
      const countDiff = (b.rating_count ?? 0) - (a.rating_count ?? 0);
      if (countDiff !== 0) return countDiff;
      return a.supplier_name.localeCompare(b.supplier_name);
    });

    const bestRatedSupplier = rankedSuppliers.find(
      (s) => (s.average_rating ?? 0) > 0 || (s.rating_count ?? 0) > 0
    );

    const selectedSupplierRecord = suppliers.find(
      (s) => s.id === (item.supplier_id ?? null)
    ) || suppliers.find(
      (s) => s.supplier_name === item.supplier
    );

    const itemRecommendation = item.source_boq_item_id
      ? supplierRecommendations.get(item.source_boq_item_id)
      : null;

    const recommendedSupplierId = itemRecommendation?.best_price?.supplier_id;
    const recommendedSupplier = recommendedSupplierId
      ? suppliers.find((s) => s.id === recommendedSupplierId)
      : null;

    const getCheapestSupplier = () => {
      if (!itemRecommendation?.suppliers || itemRecommendation.suppliers.length === 0) return null;
      return itemRecommendation.suppliers.reduce((cheapest, current) => 
        current.rate < cheapest.rate ? current : cheapest
      );
    };

    const cheapestSupplier = getCheapestSupplier();

    const isBestRatedSelected =
      !!selectedSupplierRecord &&
      !!bestRatedSupplier &&
      selectedSupplierRecord.id === bestRatedSupplier.id;

    // Get supplier scores
    const supplierScores = new Map<string, SupplierScore>();
    suppliers.forEach(supplier => {
      const score = calculateSupplierScore(supplier, suppliers, itemRecommendation, item.unit_rate || 0);
      supplierScores.set(supplier.id, score);
    });

    // Find best scored supplier
    let bestScoredSupplier: SupplierWithPerformance | null = null;
    let bestScore = -1;
    supplierScores.forEach((score, supplierId) => {
      if (score.score > bestScore) {
        bestScore = score.score;
        bestScoredSupplier = suppliers.find(s => s.id === supplierId) || null;
      }
    });

    return {
      isSupplierInDirectory,
      rankedSuppliers,
      bestRatedSupplier,
      selectedSupplierRecord,
      itemRecommendation,
      recommendedSupplier,
      cheapestSupplier,
      isBestRatedSelected,
      supplierScores,
    };
  }, [suppliers, item.supplier_id, item.supplier, supplierRecommendations, item.source_boq_item_id]);
}
