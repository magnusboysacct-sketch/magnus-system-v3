import React from 'react';
import type { BestPriceResult, SupplierWithPerformance } from '../types/procurement';

export interface SupplierScore {
  score: number;
  label: string;
  explanation: string;
  priceScore: number;
  ratingScore: number;
  confidenceScore: number;
  competitionScore: number;
  spreadScore: number;
}

export function useSupplierScoreEngine(
  item: any,
  suppliers: SupplierWithPerformance[],
  supplierRecommendations: Map<string, BestPriceResult>
) {
  return React.useMemo(() => {
    const itemRecommendation = item.source_boq_item_id
      ? supplierRecommendations.get(item.source_boq_item_id)
      : null;

    if (!itemRecommendation?.suppliers || itemRecommendation.suppliers.length === 0) {
      return new Map<string, SupplierScore>();
    }

    // Calculate price range for normalization
    const prices = itemRecommendation.suppliers.map(s => s.rate);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const priceRange = maxPrice - minPrice || 1;

    // Calculate rating range for normalization
    const ratings = suppliers
      .filter(s => s.average_rating && s.average_rating > 0)
      .map(s => s.average_rating!);
    const maxRating = Math.max(...ratings, 5);
    const ratingRange = maxRating - Math.min(...ratings, 0) || 1;

    // Calculate max rating count for normalization
    const maxRatingCount = Math.max(...suppliers.map(s => s.rating_count || 0), 10);

    const scoredSuppliers = new Map<string, SupplierScore>();

    itemRecommendation.suppliers.forEach(supplierInfo => {
      const supplier = suppliers.find(s => s.id === supplierInfo.supplier_id);
      if (!supplier) return;

      // Price Score (0-100, lower price = higher score)
      const priceScore = ((maxPrice - supplierInfo.rate) / priceRange) * 100;

      // Rating Score (0-100, higher rating = higher score)
      const ratingScore = supplier.average_rating 
        ? ((supplier.average_rating - 0) / ratingRange) * 100 
        : 0;

      // Confidence Score (0-100, more reviews = higher score)
      const confidenceScore = ((supplier.rating_count || 0) / maxRatingCount) * 100;

      // Competition Score (0-100, more suppliers = higher score for each)
      const competitionScore = Math.min((itemRecommendation.suppliers!.length / 5) * 100, 100);

      // Spread Score (0-100, more spread = higher score)
      const spreadScore = priceRange > 0 
        ? ((supplierInfo.rate - minPrice) / priceRange) * 100
        : 50;

      // Weighted final score
      const weights = {
        price: 0.35,      // 35% - most important
        rating: 0.25,     // 25% - quality indicator
        confidence: 0.20,  // 20% - reliability
        competition: 0.10,  // 10% - market health
        spread: 0.10       // 10% - savings potential
      };

      const finalScore = 
        priceScore * weights.price +
        ratingScore * weights.rating +
        confidenceScore * weights.confidence +
        competitionScore * weights.competition +
        spreadScore * weights.spread;

      // Generate label based on score
      let label = 'Standard';
      let explanation = '';

      if (finalScore >= 85) {
        label = 'Best Value';
        explanation = 'Excellent price, strong rating, and good market position';
      } else if (finalScore >= 70) {
        label = 'High Confidence';
        explanation = 'Good balance of price and quality factors';
      } else if (finalScore >= 55) {
        label = 'Recommended';
        explanation = 'Decent option with some trade-offs';
      } else if (finalScore >= 40) {
        label = 'Acceptable';
        explanation = 'Functional but consider alternatives';
      } else {
        label = 'Consider Alternative';
        explanation = 'Better options likely available';
      }

      scoredSuppliers.set(supplierInfo.supplier_id, {
        score: Math.round(finalScore),
        label,
        explanation,
        priceScore: Math.round(priceScore),
        ratingScore: Math.round(ratingScore),
        confidenceScore: Math.round(confidenceScore),
        competitionScore: Math.round(competitionScore),
        spreadScore: Math.round(spreadScore)
      });
    });

    return scoredSuppliers;
  }, [item, suppliers, supplierRecommendations]);
}
