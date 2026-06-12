/**
 * OCR Result Scoring Service
 * 
 * Scores OCR results from different pipelines to determine the best result
 * Used in hybrid auto-detect mode to compare receipt vs invoice OCR
 */

import type { OCRResult } from '../../lib/receiptOCR';
import type { InvoiceScanResult } from './InvoiceScanner';

export interface ScoredResult {
  pipeline: 'receipt' | 'invoice';
  result: OCRResult | InvoiceScanResult;
  score: number;
  breakdown: {
    confidence: number;
    vendorPresence: number;
    datePresence: number;
    amountPresence: number;
    textLength: number;
    keywordBonus: number;
    gibberishPenalty: number;
    dataCompleteness: number;
  };
  reasoning: string;
}

export class OCRScorer {
  // Invoice-specific keywords that indicate invoice documents
  private static readonly INVOICE_KEYWORDS = [
    'INVOICE', 'TAX INVOICE', 'BILL', 'STATEMENT', 'ACCOUNT',
    'TOTAL', 'AMOUNT DUE', 'BALANCE DUE', 'DUE DATE',
    'EdgeChem', 'Hardware & Lumber', 'Rapid True Value',
    'FESCO', 'TransJamaican', 'TransJAM', 'MAY PEN WEST'
  ];

  /**
   * Score both receipt and invoice OCR results and return the best
   */
  static async scoreAndSelectBest(
    receiptResult: OCRResult | null,
    invoiceResult: InvoiceScanResult | null,
    rawImageText: string = ''
  ): Promise<{
    winner: 'receipt' | 'invoice' | 'none';
    bestResult: OCRResult | InvoiceScanResult | null;
    scores: {
      receipt: ScoredResult | null;
      invoice: ScoredResult | null;
    };
    reasoning: string;
  }> {
    console.log('OCR_SCORER: Starting hybrid auto-dect scoring');

    // Score receipt result
    const receiptScore = receiptResult ? this.scoreReceiptResult(receiptResult, rawImageText) : null;

    // Score invoice result
    const invoiceScore = invoiceResult ? this.scoreInvoiceResult(invoiceResult, rawImageText) : null;

    console.log('OCR_SCORER: Scores calculated', {
      receipt: receiptScore?.score || 0,
      invoice: invoiceScore?.score || 0
    });

    // Determine winner
    let winner: 'receipt' | 'invoice' | 'none';
    let bestResult: OCRResult | InvoiceScanResult | null = null;
    let reasoning: string;

    if (!receiptScore && !invoiceScore) {
      winner = 'none';
      bestResult = null;
      reasoning = 'No valid OCR results to compare';
    } else if (!receiptScore) {
      winner = 'invoice';
      bestResult = invoiceResult;
      reasoning = 'Only invoice OCR produced results';
    } else if (!invoiceScore) {
      winner = 'receipt';
      bestResult = receiptResult;
      reasoning = 'Only receipt OCR produced results';
    } else {
      // Compare scores
      if (invoiceScore.score > receiptScore.score) {
        winner = 'invoice';
        bestResult = invoiceResult;
        reasoning = `Invoice OCR won (${invoiceScore.score.toFixed(2)} vs ${receiptScore.score.toFixed(2)})`;
      } else if (receiptScore.score > invoiceScore.score) {
        winner = 'receipt';
        bestResult = receiptResult;
        reasoning = `Receipt OCR won (${receiptScore.score.toFixed(2)} vs ${invoiceScore.score.toFixed(2)})`;
      } else {
        // Tie-breaking logic
        winner = this.breakTie(receiptScore, invoiceScore);
        bestResult = winner === 'receipt' ? receiptResult : invoiceResult;
        reasoning = `Tie broken in favor of ${winner} OCR`;
      }
    }

    console.log('OCR_SCORER: Winner selected', {
      winner,
      reasoning,
      finalScore: bestResult ? (winner === 'receipt' ? receiptScore?.score : invoiceScore?.score) : 0
    });

    return {
      winner,
      bestResult,
      scores: {
        receipt: receiptScore,
        invoice: invoiceScore
      },
      reasoning
    };
  }

  /**
   * Score receipt OCR result
   */
  private static scoreReceiptResult(result: OCRResult, rawImageText: string): ScoredResult {
    const breakdown = {
      confidence: this.scoreConfidence(result.confidence),
      vendorPresence: this.scoreVendorPresence(result.vendor),
      datePresence: this.scoreDatePresence(result.date),
      amountPresence: this.scoreAmountPresence(result.amount),
      textLength: this.scoreTextLength(result.rawText),
      keywordBonus: this.scoreInvoiceKeywords(result.rawText, -0.2), // Penalty for invoice keywords
      gibberishPenalty: this.scoreGibberishRatio(result.rawText),
      dataCompleteness: this.scoreDataCompleteness(result.vendor, result.date, result.amount)
    };

    const score = Object.values(breakdown).reduce((sum, value) => sum + value, 0);
    const reasoning = this.generateReasoning(breakdown, 'receipt');

    return {
      pipeline: 'receipt',
      result,
      score,
      breakdown,
      reasoning
    };
  }

  /**
   * Score invoice OCR result
   */
  private static scoreInvoiceResult(result: InvoiceScanResult, rawImageText: string): ScoredResult {
    if (!result.success || !result.invoiceData) {
      // Failed invoice result gets very low score
      return {
        pipeline: 'invoice',
        result,
        score: 0.1,
        breakdown: {
          confidence: 0.1,
          vendorPresence: 0,
          datePresence: 0,
          amountPresence: 0,
          textLength: 0,
          keywordBonus: 0,
          gibberishPenalty: -0.5,
          dataCompleteness: -0.5
        },
        reasoning: 'Invoice OCR processing failed'
      };
    }

    const invoiceData = result.invoiceData;
    const breakdown = {
      confidence: this.scoreConfidence(Math.max(result.ocrConfidence, invoiceData.confidence)),
      vendorPresence: this.scoreVendorPresence(invoiceData.vendorName),
      datePresence: this.scoreDatePresence(invoiceData.invoiceDate),
      amountPresence: this.scoreAmountPresence(invoiceData.grandTotal),
      textLength: this.scoreTextLength(invoiceData.rawText),
      keywordBonus: this.scoreInvoiceKeywords(rawImageText, 0.3), // Bonus for invoice keywords
      gibberishPenalty: this.scoreGibberishRatio(invoiceData.rawText),
      dataCompleteness: this.scoreDataCompleteness(invoiceData.vendorName, invoiceData.invoiceDate, invoiceData.grandTotal)
    };

    // Bonus for supplier recovery
    if (invoiceData.rawText.includes('supplier recovery')) {
      breakdown.keywordBonus += 0.1;
    }

    const score = Object.values(breakdown).reduce((sum, value) => sum + value, 0);
    const reasoning = this.generateReasoning(breakdown, 'invoice');

    return {
      pipeline: 'invoice',
      result,
      score,
      breakdown,
      reasoning
    };
  }

  /**
   * Score confidence (0-1 scale, max 0.3 points)
   */
  private static scoreConfidence(confidence: number): number {
    // Convert 0-1 confidence to 0-0.3 score
    return Math.min(0.3, confidence * 0.3);
  }

  /**
   * Score vendor presence (max 0.2 points)
   */
  private static scoreVendorPresence(vendor: string | null): number {
    if (!vendor) return 0;
    
    // Bonus for known suppliers
    if (this.isKnownSupplier(vendor)) return 0.2;
    
    // Partial credit for any vendor name
    if (vendor.length > 2 && vendor.length < 50) return 0.15;
    
    return 0.1;
  }

  /**
   * Score date presence (max 0.15 points)
   */
  private static scoreDatePresence(date: string | null): number {
    if (!date) return 0;
    
    // Check if it's a valid date format
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/; // YYYY-MM-DD
    if (dateRegex.test(date)) return 0.15;
    
    // Partial credit for any date-like string
    if (/\d{2,4}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}/.test(date)) return 0.1;
    
    return 0.05;
  }

  /**
   * Score amount presence (max 0.2 points)
   */
  private static scoreAmountPresence(amount: number | null): number {
    if (!amount) return 0;
    
    // Bonus for reasonable amounts
    if (amount > 0 && amount < 1000000) return 0.2;
    
    // Partial credit for any amount
    if (amount > 0) return 0.1;
    
    return 0;
  }

  /**
   * Score text length (max 0.15 points)
   */
  private static scoreTextLength(text: string): number {
    if (!text) return 0;
    
    const length = text.length;
    
    // Bonus for substantial text
    if (length > 500) return 0.15;
    if (length > 200) return 0.12;
    if (length > 100) return 0.08;
    if (length > 50) return 0.05;
    
    return 0.02;
  }

  /**
   * Score invoice keywords (bonus or penalty)
   */
  private static scoreInvoiceKeywords(text: string, multiplier: number): number {
    if (!text) return 0;
    
    const lowerText = text.toLowerCase();
    let keywordCount = 0;
    
    for (const keyword of this.INVOICE_KEYWORDS) {
      if (lowerText.includes(keyword.toLowerCase())) {
        keywordCount++;
      }
    }
    
    // Apply multiplier (positive for invoice bonus, negative for receipt penalty)
    return Math.min(0.3, Math.max(-0.3, keywordCount * multiplier));
  }

  /**
   * Check if vendor is a known supplier
   */
  private static isKnownSupplier(vendor: string): boolean {
    const knownSuppliers = [
      'EdgeChem', 'Hardware & Lumber', 'Rapid True Value', 'H&L Rapid',
      'Tile City', 'FESCO', 'TransJamaican', 'TransJAM', 'MAY PEN WEST'
    ];
    
    return knownSuppliers.some(supplier => 
      vendor.toLowerCase().includes(supplier.toLowerCase()) ||
      supplier.toLowerCase().includes(vendor.toLowerCase())
    );
  }

  /**
   * Score gibberish ratio (penalty for unreadable text)
   */
  private static scoreGibberishRatio(text: string): number {
    if (!text) return -0.5;
    
    const words = text.split(/\s+/).filter(w => w.length > 0);
    const totalWords = words.length;
    
    if (totalWords === 0) return -0.5;
    
    // Count readable words (letters and numbers only)
    const readableWords = words.filter(w => /^[a-zA-Z0-9]+$/.test(w));
    const readableRatio = readableWords.length / totalWords;
    
    // Count gibberish indicators
    const gibberishIndicators = words.filter(w => {
      // Very short random characters
      if (w.length === 1 && /[a-z]/i.test(w)) return true;
      // Random character sequences
      if (w.length > 1 && /^[a-z]{2,}$/i.test(w) && !this.isLikelyWord(w)) return true;
      // Mixed random characters and numbers
      if (/^[a-z0-9]{3,}$/i.test(w) && !this.isLikelyWord(w) && !/\d/.test(w)) return true;
      return false;
    });
    
    const gibberishRatio = gibberishIndicators.length / totalWords;
    
    // Apply penalties
    if (gibberishRatio > 0.7) return -0.4; // High gibberish
    if (gibberishRatio > 0.5) return -0.3; // Medium gibberish
    if (gibberishRatio > 0.3) return -0.2; // Low gibberish
    
    // Bonus for high readability
    if (readableRatio > 0.8) return 0.1;
    if (readableRatio > 0.6) return 0.05;
    
    return 0;
  }

  /**
   * Score data completeness (bonus for having all key fields)
   */
  private static scoreDataCompleteness(vendor: string | null, date: string | null, amount: number | null): number {
    let score = 0;
    let fields = 0;
    
    if (vendor && vendor.length > 2) {
      score += 0.15;
      fields++;
    }
    
    if (date) {
      score += 0.1;
      fields++;
    }
    
    if (amount && amount > 0) {
      score += 0.15;
      fields++;
    }
    
    // Bonus for complete data
    if (fields === 3) {
      score += 0.1; // Complete data bonus
    } else if (fields === 2) {
      score += 0.05; // Partial data bonus
    } else if (fields === 0) {
      score -= 0.3; // No data penalty
    }
    
    return score;
  }

  /**
   * Check if a word is likely a real word
   */
  private static isLikelyWord(word: string): boolean {
    // Common English words (simplified check)
    const commonWords = [
      'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'had', 'her', 'was', 'one', 'our', 'out', 'day',
      'get', 'has', 'him', 'his', 'how', 'man', 'new', 'now', 'old', 'see', 'two', 'way', 'who', 'boy', 'did',
      'its', 'let', 'put', 'say', 'she', 'too', 'use', 'her', 'was', 'one', 'our', 'out', 'day', 'get', 'has',
      'invoice', 'total', 'amount', 'due', 'date', 'bill', 'receipt', 'cash', 'payment', 'order', 'number',
      'customer', 'company', 'limited', 'ltd', 'inc', 'corp', 'street', 'road', 'kingston', 'jamaica'
    ];
    
    return commonWords.includes(word.toLowerCase()) || word.length > 4;
  }

  /**
   * Generate reasoning for the score
   */
  private static generateReasoning(breakdown: any, pipeline: string): string {
    const reasons = [];
    
    if (breakdown.confidence > 0.2) reasons.push('high confidence');
    if (breakdown.vendorPresence > 0.15) reasons.push('vendor detected');
    if (breakdown.datePresence > 0.1) reasons.push('date detected');
    if (breakdown.amountPresence > 0.15) reasons.push('amount detected');
    if (breakdown.textLength > 0.1) reasons.push('substantial text');
    if (breakdown.keywordBonus > 0.1) reasons.push('invoice keywords');
    if (breakdown.keywordBonus < -0.1) reasons.push('receipt keywords');
    if (breakdown.gibberishPenalty < -0.2) reasons.push('high gibberish');
    if (breakdown.dataCompleteness > 0.2) reasons.push('complete data');
    if (breakdown.dataCompleteness < -0.2) reasons.push('missing data');
    
    if (reasons.length === 0) reasons.push('minimal data');
    
    return `${pipeline} OCR: ${reasons.join(', ')}`;
  }

  /**
   * Break ties between receipt and invoice results
   */
  private static breakTie(receiptScore: ScoredResult, invoiceScore: ScoredResult): 'receipt' | 'invoice' {
    // Prefer invoice if it has supplier recovery
    const invoiceResult = invoiceScore.result as InvoiceScanResult;
    if (invoiceResult?.invoiceData?.rawText?.includes('supplier recovery')) {
      return 'invoice';
    }
    
    // Prefer result with higher confidence
    if (invoiceScore.breakdown.confidence > receiptScore.breakdown.confidence) {
      return 'invoice';
    }
    
    // Prefer result with more complete data
    const invoiceDataPoints = [
      invoiceScore.breakdown.vendorPresence,
      invoiceScore.breakdown.datePresence,
      invoiceScore.breakdown.amountPresence
    ].filter(score => score > 0.1).length;
    
    const receiptDataPoints = [
      receiptScore.breakdown.vendorPresence,
      receiptScore.breakdown.datePresence,
      receiptScore.breakdown.amountPresence
    ].filter(score => score > 0.1).length;
    
    if (invoiceDataPoints > receiptDataPoints) return 'invoice';
    if (receiptDataPoints > invoiceDataPoints) return 'receipt';
    
    // Default to receipt for ties
    return 'receipt';
  }

  /**
   * Get scoring breakdown for debugging
   */
  static getScoringBreakdown(result: ScoredResult): {
    pipeline: string;
    totalScore: number;
    confidence: number;
    vendorPresence: number;
    datePresence: number;
    amountPresence: number;
    textLength: number;
    keywordBonus: number;
    gibberishPenalty: number;
    dataCompleteness: number;
    reasoning: string;
  } {
    return {
      pipeline: result.pipeline,
      totalScore: result.score,
      confidence: result.breakdown.confidence,
      vendorPresence: result.breakdown.vendorPresence,
      datePresence: result.breakdown.datePresence,
      amountPresence: result.breakdown.amountPresence,
      textLength: result.breakdown.textLength,
      keywordBonus: result.breakdown.keywordBonus,
      gibberishPenalty: result.breakdown.gibberishPenalty,
      dataCompleteness: result.breakdown.dataCompleteness,
      reasoning: result.reasoning
    };
  }
}
