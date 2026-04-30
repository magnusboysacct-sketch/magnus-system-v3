/**
 * Supplier Fuzzy-Match Recovery Service
 * 
 * Recovers vendor names using fuzzy matching against known suppliers
 * Used when OCR confidence is weak or vendor name is malformed
 */

export interface SupplierMatch {
  supplierName: string;
  confidence: number;
  matchedText: string;
  similarity: number;
  originalText: string;
}

export interface SupplierRecoveryResult {
  recovered: boolean;
  originalVendor: string | null;
  recoveredVendor: string | null;
  match: SupplierMatch | null;
  recoveryReason: string;
}

export class SupplierMatcher {
  // Known suppliers with variations and aliases
  private static readonly KNOWN_SUPPLIERS = [
    {
      name: 'EdgeChem',
      variations: [
        'edgechem',
        'edge chemical',
        'edge-chem',
        'edge chem',
        'edgechemicals',
        'edge chemicals',
        'edge-chemicals',
        'EDGE CHEM',
        'EDGE CHEMICAL',
        'EDGE-CHEM',
        'EDGE CHEMICALS',
        'EDGE-CHEMICALS'
      ]
    },
    {
      name: 'Hardware & Lumber',
      variations: [
        'hardware & lumber',
        'hardware and lumber',
        'hardware lumber',
        'hardware & lumber co',
        'hardware and lumber co',
        'h&l',
        'h & l',
        'h/l'
      ]
    },
    {
      name: 'Rapid True Value',
      variations: [
        'rapid true value',
        'rapid truevalue',
        'rapid true-value',
        'true value rapid',
        'truevalue rapid',
        'rapid tv',
        'rapid true',
        'true value'
      ]
    },
    {
      name: 'H&L Rapid',
      variations: [
        'h&l rapid',
        'h & l rapid',
        'h/l rapid',
        'hl rapid',
        'hardware lumber rapid',
        'hardware & lumber rapid'
      ]
    },
    {
      name: 'Tile City',
      variations: [
        'tile city',
        'tilecity',
        'tile-city',
        'tile city ltd',
        'tile city limited',
        'tilecity ltd'
      ]
    },
    {
      name: 'FESCO',
      variations: [
        'fesco',
        'fesco ltd',
        'fesco limited',
        'fesco jamaica',
        'fesco ja'
      ]
    },
    {
      name: 'TransJamaican',
      variations: [
        'transjamaican',
        'trans jamaican',
        'trans-jamaican',
        'transjamaica',
        'trans jamaica',
        'trans-jamaica',
        'transj',
        'trans j',
        'trans jam'
      ]
    },
    {
      name: 'TransJAM',
      variations: [
        'transjam',
        'trans jam',
        'trans-jam',
        'transjamaica',
        'trans jamaica',
        'trans-jamaica'
      ]
    },
    {
      name: 'MAY PEN WEST',
      variations: [
        'may pen west',
        'maypen west',
        'may-pen west',
        'may pen west ltd',
        'maypen west ltd',
        'may pen west limited'
      ]
    }
  ];

  /**
   * Attempt to recover vendor name using fuzzy matching
   */
  static async recoverVendorName(
    extractedVendor: string | null,
    ocrConfidence: number,
    rawText: string = ''
  ): Promise<SupplierRecoveryResult> {
    console.log('SUPPLIER_MATCHER: Starting vendor recovery', {
      extractedVendor,
      ocrConfidence,
      rawTextLength: rawText.length
    });

    // If no vendor extracted, try to find from raw text
    const searchText = extractedVendor || this.extractPotentialVendorFromRawText(rawText);
    
    if (!searchText || searchText.trim().length < 2) {
      return {
        recovered: false,
        originalVendor: extractedVendor,
        recoveredVendor: null,
        match: null,
        recoveryReason: 'No vendor text available for matching'
      };
    }

    // Check if recovery is needed (weak confidence or malformed)
    const needsRecovery = this.shouldAttemptRecovery(extractedVendor, ocrConfidence);
    
    if (!needsRecovery) {
      return {
        recovered: false,
        originalVendor: extractedVendor,
        recoveredVendor: extractedVendor,
        match: null,
        recoveryReason: 'OCR confidence adequate, no recovery needed'
      };
    }

    console.log('SUPPLIER_MATCHER: Attempting fuzzy matching for:', searchText);

    // Find best match
    const bestMatch = this.findBestSupplierMatch(searchText);
    
    if (bestMatch && bestMatch.confidence >= 0.7) {
      console.log('SUPPLIER_MATCHER: Recovery successful', {
        original: searchText,
        recovered: bestMatch.supplierName,
        confidence: bestMatch.confidence,
        similarity: bestMatch.similarity
      });

      return {
        recovered: true,
        originalVendor: extractedVendor,
        recoveredVendor: bestMatch.supplierName,
        match: bestMatch,
        recoveryReason: `High-confidence fuzzy match (${(bestMatch.confidence * 100).toFixed(1)}%)`
      };
    }

    console.log('SUPPLIER_MATCHER: No suitable match found');
    
    return {
      recovered: false,
      originalVendor: extractedVendor,
      recoveredVendor: extractedVendor,
      match: bestMatch,
      recoveryReason: bestMatch 
        ? `Low confidence match (${(bestMatch.confidence * 100).toFixed(1)}%)`
        : 'No supplier matches found'
    };
  }

  /**
   * Determine if recovery should be attempted
   */
  private static shouldAttemptRecovery(vendor: string | null, confidence: number): boolean {
    if (!vendor) return true; // No vendor extracted, try recovery
    
    // Always attempt recovery if confidence is low
    if (confidence < 0.6) return true;
    
    // Check for common OCR malformations
    const malformationIndicators = [
      vendor.length < 3,           // Too short
      vendor.length > 50,          // Too long
      /^[0-9\s\-\/]+$/.test(vendor), // Only numbers/symbols
      /(INVOICE|BILL|TOTAL|DATE|DUE|TAX)/i.test(vendor), // Common invoice words
      /^\s+$/.test(vendor),       // Only whitespace
      vendor.split('').filter(c => c.match(/[a-zA-Z]/)).length < 2 // Less than 2 letters
    ];

    return malformationIndicators.some(indicator => indicator);
  }

  /**
   * Extract potential vendor names from raw OCR text
   */
  private static extractPotentialVendorFromRawText(rawText: string): string | null {
    if (!rawText || rawText.trim().length === 0) return null;

    const lines = rawText.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    
    // Look for lines that might contain vendor names
    const vendorPatterns = [
      /^(.+?)\s+(?:LTD|LIMITED|INC|CORP|LLC|PLC|PTY)/i,
      /^(FROM|VENDOR|SUPPLIER|SELLER|BILL\s*TO|COMPANY):\s*(.+)$/i,
      /^([A-Z][A-Z\s&\-\.,]{4,})$/m,
      /^([A-Z][a-zA-Z\s&\-\.,]+(?:LTD|INC|CORP|LLC|PLC))/m
    ];

    for (const line of lines.slice(0, 5)) { // Check first 5 lines
      for (const pattern of vendorPatterns) {
        const match = line.match(pattern);
        if (match) {
          const vendor = match[2] || match[1];
          if (vendor && vendor.length > 2 && vendor.length < 50) {
            return vendor.trim();
          }
        }
      }
    }

    // Fallback: return first line if it looks reasonable
    if (lines.length > 0) {
      const firstLine = lines[0];
      if (firstLine.length > 2 && firstLine.length < 30 && /^[A-Za-z\s&\-\.,]+$/.test(firstLine)) {
        return firstLine.trim();
      }
    }

    return null;
  }

  /**
   * Find best supplier match using fuzzy string matching
   */
  private static findBestSupplierMatch(searchText: string): SupplierMatch | null {
    const normalizedSearch = this.normalizeText(searchText);
    let bestMatch: SupplierMatch | null = null;

    for (const supplier of this.KNOWN_SUPPLIERS) {
      for (const variation of supplier.variations) {
        const normalizedVariation = this.normalizeText(variation);
        const similarity = this.calculateSimilarity(normalizedSearch, normalizedVariation);
        
        // Calculate overall confidence based on similarity and exact match bonus
        let confidence = similarity;
        
        // Bonus for exact substring matches
        if (normalizedSearch.includes(normalizedVariation) || normalizedVariation.includes(normalizedSearch)) {
          confidence = Math.min(1.0, confidence + 0.3);
        }
        
        // Bonus for word-level matches
        const searchWords = normalizedSearch.split(/\s+/);
        const variationWords = normalizedVariation.split(/\s+/);
        const commonWords = searchWords.filter(word => variationWords.includes(word));
        if (commonWords.length > 0) {
          confidence = Math.min(1.0, confidence + (commonWords.length * 0.1));
        }

        // Penalty for very different lengths
        const lengthRatio = Math.min(searchText.length, variation.length) / Math.max(searchText.length, variation.length);
        if (lengthRatio < 0.5) {
          confidence *= 0.7;
        }

        if (confidence > 0.3 && (!bestMatch || confidence > bestMatch.confidence)) {
          bestMatch = {
            supplierName: supplier.name,
            confidence,
            matchedText: variation,
            similarity,
            originalText: searchText
          };
        }
      }
    }

    return bestMatch;
  }

  /**
   * Normalize text for comparison
   */
  private static normalizeText(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '') // Remove special characters
      .replace(/\s+/g, ' ') // Normalize spaces
      .trim();
  }

  /**
   * Calculate similarity between two strings using Levenshtein distance
   */
  private static calculateSimilarity(str1: string, str2: string): number {
    if (str1 === str2) return 1.0;
    if (str1.length === 0 || str2.length === 0) return 0.0;

    const matrix = Array(str2.length + 1).fill(null).map(() => Array(str1.length + 1).fill(null));
    
    for (let i = 0; i <= str1.length; i++) matrix[0][i] = i;
    for (let j = 0; j <= str2.length; j++) matrix[j][0] = j;

    for (let j = 1; j <= str2.length; j++) {
      for (let i = 1; i <= str1.length; i++) {
        const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[j][i] = Math.min(
          matrix[j][i - 1] + 1,     // deletion
          matrix[j - 1][i] + 1,     // insertion
          matrix[j - 1][i - 1] + indicator // substitution
        );
      }
    }

    const distance = matrix[str2.length][str1.length];
    const maxLength = Math.max(str1.length, str2.length);
    
    return 1 - (distance / maxLength);
  }

  /**
   * Get list of all known suppliers for debugging
   */
  static getKnownSuppliers(): Array<{ name: string; variations: string[] }> {
    return this.KNOWN_SUPPLIERS.map(s => ({ ...s }));
  }

  /**
   * Test similarity calculation for debugging
   */
  static testSimilarity(text1: string, text2: string): number {
    return this.calculateSimilarity(this.normalizeText(text1), this.normalizeText(text2));
  }
}
