import type { SupplierWithPerformance } from '../types/procurement';
import type { BestPriceResult } from '../types/procurement';

export interface SupplierScore {
  score: number;
  scoreLabel: string;
  scoreReason: string;
  priceScore: number;
  ratingScore: number;
  confidenceScore: number;
  competitionScore: number;
  valueScore: number;
  scoreBreakdown?: {
    priceScore: number;
    ratingScore: number;
    confidenceScore: number;
    competitionScore: number;
    valueScore: number;
  };
}

export function calculateSupplierScore(
  supplier: SupplierWithPerformance,
  allSuppliers: SupplierWithPerformance[],
  itemRecommendation: BestPriceResult | null | undefined,
  currentRate: number
): SupplierScore {
  // Price competitiveness (40%)
  const prices = allSuppliers.map(s => s.average_rating ? 0 : 100); // Fallback high price for unrated
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const priceRange = maxPrice - minPrice || 1;
  const priceScore = supplier.average_rating ? 
    ((maxPrice - (supplier.average_rating ? 0 : 100)) / priceRange) * 40 : 20;

  // Average rating (25%)
  const ratings = allSuppliers
    .filter(s => s.average_rating && s.average_rating > 0)
    .map(s => s.average_rating!);
  const maxRating = Math.max(...ratings, 5);
  const ratingRange = maxRating - Math.min(...ratings, 0) || 1;
  const ratingScore = supplier.average_rating 
    ? ((supplier.average_rating - 0) / ratingRange) * 25 
    : 0;

  // Rating confidence (15%)
  const maxRatingCount = Math.max(...allSuppliers.map(s => s.rating_count || 0), 10);
  const confidenceScore = ((supplier.rating_count || 0) / maxRatingCount) * 15;

  // Competition depth (10%)
  const competitionScore = itemRecommendation?.suppliers 
    ? Math.min((itemRecommendation.suppliers.length / 3) * 10, 10)
    : 5;

  // Value gap/opportunity (10%)
  const valueScore = itemRecommendation?.best_price?.rate && supplier.average_rating
    ? Math.max(0, ((itemRecommendation.best_price.rate - (supplier.average_rating ? 0 : 100)) / itemRecommendation.best_price.rate) * 10)
    : 0;

  const finalScore = Math.min(100, priceScore + ratingScore + confidenceScore + competitionScore + valueScore);

  // Determine label
  let scoreLabel = 'Standard';
  let scoreReason = '';

  if (finalScore >= 85) {
    scoreLabel = 'Best Value';
    scoreReason = 'Excellent price, strong rating, and good confidence';
  } else if (finalScore >= 75) {
    scoreLabel = 'Lowest Cost';
    scoreReason = 'Best competitive pricing available';
  } else if (finalScore >= 65) {
    scoreLabel = 'Highest Rated';
    scoreReason = 'Top-rated supplier with good reviews';
  } else if (finalScore >= 50) {
    scoreLabel = 'High Confidence';
    scoreReason = 'Good balance of rating and experience';
  } else if (finalScore >= 35) {
    scoreLabel = 'Balanced Choice';
    scoreReason = 'Acceptable option with trade-offs';
  } else {
    scoreLabel = 'Consider Alternative';
    scoreReason = 'Better options likely available';
  }

  return {
    score: Math.round(finalScore),
    scoreLabel,
    scoreReason,
    priceScore: Math.round(priceScore),
    ratingScore: Math.round(ratingScore),
    confidenceScore: Math.round(confidenceScore),
    competitionScore: Math.round(competitionScore),
    valueScore: Math.round(valueScore),
    scoreBreakdown: {
      priceScore: Math.round(priceScore),
      ratingScore: Math.round(ratingScore),
      confidenceScore: Math.round(confidenceScore),
      competitionScore: Math.round(competitionScore),
      valueScore: Math.round(valueScore)
    }
  };
}
