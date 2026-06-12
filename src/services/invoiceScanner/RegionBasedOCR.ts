/**
 * Region-Based OCR for Invoice Processing
 * 
 * Splits invoice image into strategic regions and processes each separately
 * Focuses on areas where key invoice information is typically located
 */

import { createWorker } from 'tesseract.js';
import { SupplierMatcher, type SupplierRecoveryResult } from './SupplierMatcher';

export interface Region {
  name: string;
  x: number;      // Percentage from left (0-1)
  y: number;      // Percentage from top (0-1)
  width: number;  // Percentage of image width (0-1)
  height: number; // Percentage of image height (0-1)
  priority: 'vendor' | 'invoice' | 'date' | 'amount' | 'general';
}

export interface RegionOCRResult {
  region: string;
  text: string;
  confidence: number;
  priority: string;
  extractedFields: {
    vendor?: string;
    invoiceNumber?: string;
    date?: string;
    total?: number;
    subtotal?: number;
    tax?: number;
    amountDue?: number;
  };
}

export interface MergedInvoiceData {
  vendorName: string | null;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  grandTotal: number | null;
  subtotal: number | null;
  taxAmount: number | null;
  amountDue: number | null;
  confidence: number;
  sourceRegions: string[];
  supplierRecovery: SupplierRecoveryResult | null;
  rawText: string;
}

export class RegionBasedOCR {
  // Strategic regions for invoice information
  private static readonly REGIONS: Region[] = [
    // Header-center - often contains vendor/company name and logo
    {
      name: 'header-center',
      x: 0.2,  // Center 60% horizontally
      y: 0,
      width: 0.6,
      height: 0.2, // Top 20%
      priority: 'vendor'
    },
    
    // Top-right - primary location for vendor/company names and contact info
    {
      name: 'top-right',
      x: 0.5, // Right half
      y: 0,
      width: 0.5,
      height: 0.25, // Top 25%
      priority: 'vendor'
    },
    
    // Top-left - primary location for invoice numbers and dates
    {
      name: 'top-left',
      x: 0,
      y: 0,
      width: 0.5, // Left half
      height: 0.25, // Top 25%
      priority: 'invoice'
    },
    
    // Bottom-right - primary location for totals, subtotals, tax, amount due
    {
      name: 'bottom-right',
      x: 0.5, // Right half
      y: 0.7, // Bottom 30%
      width: 0.5,
      height: 0.3,
      priority: 'amount'
    },
    
    // Bottom-left - secondary location for amounts and payment terms
    {
      name: 'bottom-left',
      x: 0,
      y: 0.7, // Bottom 30%
      width: 0.5, // Left half
      height: 0.3,
      priority: 'amount'
    }
  ];

  /**
   * Process invoice using region-based OCR
   */
  static async processInvoiceRegions(
    imageUrl: string,
    preprocessing: 'standard' | 'strong' = 'standard'
  ): Promise<MergedInvoiceData> {
    console.log('REGION_BASED_OCR: Starting region-based invoice processing');
    
    try {
      // Process each region separately
      const regionResults: RegionOCRResult[] = [];
      
      for (const region of this.REGIONS) {
        console.log(`REGION_OCR: Processing ${region.name} region (${region.priority})`);
        
        try {
          // Extract region from image
          const regionImageUrl = await this.extractRegion(imageUrl, region);
          
          // Run OCR on region
          const ocrResult = await this.performRegionOCR(regionImageUrl);
          
          // Only process if OCR returned reasonable results
          if (ocrResult.text && ocrResult.text.trim().length > 0) {
            // Extract fields from region text
            const extractedFields = this.extractFieldsFromRegion(ocrResult.text, region.priority);
            
            regionResults.push({
              region: region.name,
              text: ocrResult.text,
              confidence: ocrResult.confidence,
              priority: region.priority,
              extractedFields
            });
            
            console.log(`REGION_OCR_COMPLETE: ${region.name}`, {
              confidence: ocrResult.confidence,
              textLength: ocrResult.text.length,
              extractedFields: Object.keys(extractedFields).length,
              hasVendor: !!extractedFields.vendor,
              hasInvoice: !!extractedFields.invoiceNumber,
              hasTotal: !!extractedFields.total
            });
          } else {
            console.warn(`REGION_OCR_EMPTY: ${region.name} - No text extracted`);
          }
          
        } catch (error) {
          console.error(`REGION_OCR_ERROR: ${region.name}`, error);
          // Continue with other regions - don't let one failure stop the process
        }
      }
      
      // Merge results from all regions
      const mergedData = await this.mergeRegionResults(regionResults);
      
      console.log('REGION_BASED_OCR_COMPLETE:', {
        totalRegions: regionResults.length,
        successfulRegions: regionResults.length,
        vendorFound: !!mergedData.vendorName,
        invoiceFound: !!mergedData.invoiceNumber,
        totalFound: !!mergedData.grandTotal,
        overallConfidence: mergedData.confidence,
        sourceRegions: mergedData.sourceRegions
      });
      
      return mergedData;
      
    } catch (error) {
      console.error('REGION_BASED_OCR_ERROR:', error);
      throw error;
    }
  }

  /**
   * Extract a specific region from the image
   */
  private static async extractRegion(imageUrl: string, region: Region): Promise<string> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          
          if (!ctx) {
            reject(new Error('Could not get canvas context'));
            return;
          }

          // Calculate region dimensions
          const regionWidth = img.width * region.width;
          const regionHeight = img.height * region.height;
          const regionX = img.width * region.x;
          const regionY = img.height * region.y;

          canvas.width = regionWidth;
          canvas.height = regionHeight;

          // Extract region
          ctx.drawImage(
            img,
            regionX, regionY, regionWidth, regionHeight, // Source rectangle
            0, 0, regionWidth, regionHeight              // Destination rectangle
          );

          resolve(canvas.toDataURL('image/jpeg', 0.95));
        } catch (error) {
          reject(error);
        }
      };
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = imageUrl;
    });
  }

  /**
   * Perform OCR on a specific region
   */
  private static async performRegionOCR(imageUrl: string): Promise<{ text: string; confidence: number }> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error('Region OCR timeout'));
      }, 10000); // 10 second timeout per region

      createWorker('eng', 1, {
        logger: (m) => {
          if (m.status === 'recognizing text') {
            // Reduce logging noise for regions
          }
        }
      })
        .then(worker => {
          return worker
            .recognize(imageUrl)
            .then(({ data: { text, confidence } }) => {
              clearTimeout(timeoutId);
              worker.terminate();

              resolve({
                text: text.trim(),
                confidence: confidence / 100 // Normalize to 0-1
              });
            })
            .catch(error => {
              clearTimeout(timeoutId);
              worker.terminate();
              reject(error);
            });
        })
        .catch(error => {
          clearTimeout(timeoutId);
          reject(error);
        });
    });
  }

  /**
   * Extract fields from region text based on region priority
   */
  private static extractFieldsFromRegion(text: string, priority: string): {
    vendor?: string;
    invoiceNumber?: string;
    date?: string;
    total?: number;
    subtotal?: number;
    tax?: number;
    amountDue?: number;
  } {
    const fields: any = {};
    const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);

    switch (priority) {
      case 'vendor':
        // Primary vendor extraction - look for company names, contact info
        fields.vendor = this.extractVendorName(lines);
        fields.invoiceNumber = this.extractInvoiceNumber(lines); // Secondary
        break;

      case 'invoice':
        // Primary invoice number and date extraction
        fields.invoiceNumber = this.extractInvoiceNumber(lines);
        fields.date = this.extractDate(lines);
        break;

      case 'amount':
        // Primary totals and amounts extraction
        fields.total = this.extractTotal(lines);
        fields.subtotal = this.extractSubtotal(lines);
        fields.tax = this.extractTax(lines);
        fields.amountDue = this.extractAmountDue(lines);
        break;

      case 'date':
        // Date-specific extraction (legacy, not used in new regions)
        fields.date = this.extractDate(lines);
        break;

      case 'general':
        // Fallback - look for anything
        fields.vendor = this.extractVendorName(lines);
        fields.invoiceNumber = this.extractInvoiceNumber(lines);
        fields.date = this.extractDate(lines);
        fields.total = this.extractTotal(lines);
        fields.subtotal = this.extractSubtotal(lines);
        fields.tax = this.extractTax(lines);
        fields.amountDue = this.extractAmountDue(lines);
        break;
    }

    return fields;
  }

  /**
   * Extract vendor name from text lines
   */
  private static extractVendorName(lines: string[]): string | null {
    const vendorPatterns = [
      // Company suffix patterns
      /^(.+?)\s+(?:LTD|LIMITED|INC|CORP|LLC|PLC|PTY|ENTERPRISES|SERVICES|SOLUTIONS|COMPANY|GROUP|HOLDINGS)/i,
      // Label patterns
      /^(FROM|VENDOR|SUPPLIER|SELLER|BILL\s*TO|COMPANY):\s*(.+)$/i,
      // All caps company names (common in headers)
      /^([A-Z][A-Z\s&\-\.,]{4,})$/m,
      // Mixed case with suffix
      /([A-Z][a-z\s&\-\.,]+(?:LTD|INC|CORP|LLC|PLC|ENTERPRISES|SERVICES|SOLUTIONS))/m,
      // Common Jamaican company patterns
      /^([A-Z][a-zA-Z\s&\-\.,]+(?:LIMITED|LTD))/i,
      // Phone/email patterns (helps identify company blocks)
      /^([A-Z][a-zA-Z\s&\-\.,]+)\s*(?:Phone|Tel|Email|@)/i,
      // Address patterns (company name followed by address)
      /^([A-Z][a-zA-Z\s&\-\.,]{3,})\s*\d+/m,
      // Single line company names (no suffix)
      /^([A-Z][a-zA-Z\s&\-\.,]{5,})$/m
    ];

    // Score candidates based on likelihood
    const candidates: Array<{ value: string; score: number }> = [];

    for (const line of lines) {
      for (let i = 0; i < vendorPatterns.length; i++) {
        const pattern = vendorPatterns[i];
        const match = line.match(pattern);
        if (match) {
          const vendor = match[2] || match[1];
          if (vendor && vendor.length > 3 && vendor.length < 50) {
            // Score based on pattern quality and vendor characteristics
            let score = 10 - i; // Higher patterns get higher base score
            
            // Boost for company suffixes
            if (/(LTD|LIMITED|INC|CORP|LLC|PLC|PTY)/i.test(vendor)) score += 3;
            if (/(ENTERPRISES|SERVICES|SOLUTIONS)/i.test(vendor)) score += 2;
            
            // Boost for proper capitalization
            if (/^[A-Z][a-zA-Z\s&\-\.,]+$/.test(vendor)) score += 1;
            
            // Boost for reasonable length
            if (vendor.length >= 5 && vendor.length <= 30) score += 1;
            
            // Penalty for common words
            if (/(INVOICE|BILL|TOTAL|DATE|DUE|TAX)/i.test(vendor)) score -= 5;
            
            candidates.push({ value: vendor.trim(), score });
          }
        }
      }
    }

    // Return highest scoring candidate
    if (candidates.length > 0) {
      candidates.sort((a, b) => b.score - a.score);
      return candidates[0].value;
    }

    return null;
  }

  /**
   * Extract invoice number from text lines
   */
  private static extractInvoiceNumber(lines: string[]): string | null {
    const invoicePatterns = [
      /(?:INVOICE\s*#?|BILL\s*#?|REF\s*#?):?\s*([A-Z0-9\-\/]{3,})/i,
      /(?:INVOICE|BILL|REF)\s*(?:NO|NUMBER|#)?\s*[:\.]?\s*([A-Z0-9\-\/]{3,})/i,
      /#\s*([A-Z0-9\-\/]{3,})/i,
      /INV[-\s]?([0-9]{3,})/i
    ];

    for (const line of lines) {
      for (const pattern of invoicePatterns) {
        const match = line.match(pattern);
        if (match) {
          return match[1].trim();
        }
      }
    }

    return null;
  }

  /**
   * Extract date from text lines
   */
  private static extractDate(lines: string[]): string | null {
    const datePatterns = [
      /(?:DATE|DUE|ISSUED|INVOICE\s*DATE):\s*(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/i,
      /(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})\s*(?:DUE|DATE|PAYMENT)/i,
      /(?:DUE\s*DATE|PAYMENT\s*DUE):\s*(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/i
    ];

    for (const line of lines) {
      for (const pattern of datePatterns) {
        const match = line.match(pattern);
        if (match) {
          return this.normalizeDate(match[1]);
        }
      }
    }

    return null;
  }

  /**
   * Extract total amount from text lines
   */
  private static extractTotal(lines: string[]): number | null {
    const totalPatterns = [
      // Primary total patterns (highest priority)
      /(?:GRAND\s*TOTAL|TOTAL|TOTAL\s*DUE):\s*[\$£€J\$]?\s*([\d,]+\.\d{2})/i,
      /(?:TOTAL\s*DUE|AMOUNT\s*DUE):\s*[\$£€J\$]?\s*([\d,]+\.\d{2})/i,
      /(?:BALANCE\s*DUE|OUTSTANDING):\s*[\$£€J\$]?\s*([\d,]+\.\d{2})/i,
      // Secondary patterns
      /TOTAL\s*[\$£€J\$]?\s*([\d,]+\.\d{2})/i,
      // End of line patterns
      /[\$£€J\$]?\s*([\d,]+\.\d{2})\s*TOTAL$/i,
      // Jamaican currency patterns
      /J\$\s*([\d,]+\.\d{2})\s*(?:TOTAL|DUE)/i,
      // Simple patterns (fallback)
      /^[\$£€J\$]?\s*([\d,]+\.\d{2})$/m
    ];

    // Score candidates based on pattern quality
    const candidates: Array<{ value: number; score: number; source: string }> = [];

    for (const line of lines) {
      for (let i = 0; i < totalPatterns.length; i++) {
        const pattern = totalPatterns[i];
        const match = line.match(pattern);
        if (match) {
          const amount = parseFloat(match[1].replace(/,/g, ''));
          if (!isNaN(amount) && amount > 0 && amount < 1000000) { // Reasonable range
            let score = 10 - i; // Higher patterns get higher base score
            
            // Boost for explicit TOTAL keywords
            if (/(GRAND\s*TOTAL|TOTAL|TOTAL\s*DUE)/i.test(line)) score += 5;
            if (/(AMOUNT\s*DUE|BALANCE\s*DUE)/i.test(line)) score += 4;
            
            // Boost for currency symbols
            if (/[\$£€J\$]/.test(line)) score += 2;
            
            // Boost for JMD currency
            if (/J\$/i.test(line)) score += 1;
            
            // Penalty for small amounts (likely not totals)
            if (amount < 10) score -= 3;
            
            candidates.push({ value: amount, score, source: line.trim() });
          }
        }
      }
    }

    // Return highest scoring candidate
    if (candidates.length > 0) {
      candidates.sort((a, b) => b.score - a.score);
      return candidates[0].value;
    }

    return null;
  }

  /**
   * Extract subtotal from text lines
   */
  private static extractSubtotal(lines: string[]): number | null {
    const subtotalPatterns = [
      /SUBTOTAL:\s*[\$£€J\$]?\s*([\d,]+\.\d{2})/i,
      /(?:SUB\s*TOTAL|BEFORE\s*TAX):\s*[\$£€J\$]?\s*([\d,]+\.\d{2})/i
    ];

    for (const line of lines) {
      for (const pattern of subtotalPatterns) {
        const match = line.match(pattern);
        if (match) {
          return parseFloat(match[1].replace(/,/g, ''));
        }
      }
    }

    return null;
  }

  /**
   * Extract tax amount from text lines
   */
  private static extractTax(lines: string[]): number | null {
    const taxPatterns = [
      /(?:TAX|VAT|GST|HST|GCT):\s*[\$£€J\$]?\s*([\d,]+\.\d{2})/i,
      /(?:TAX\s*AMOUNT|VAT\s*AMOUNT|GCT\s*AMOUNT):\s*[\$£€J\$]?\s*([\d,]+\.\d{2})/i,
      /(?:VAT|GST|GCT)\s*[\$£€J\$]?\s*([\d,]+\.\d{2})/i
    ];

    for (const line of lines) {
      for (const pattern of taxPatterns) {
        const match = line.match(pattern);
        if (match) {
          return parseFloat(match[1].replace(/,/g, ''));
        }
      }
    }

    return null;
  }

  /**
   * Extract amount due from text lines
   */
  private static extractAmountDue(lines: string[]): number | null {
    const duePatterns = [
      /(?:AMOUNT\s*DUE|BALANCE\s*DUE|DUE):\s*[\$£€J\$]?\s*([\d,]+\.\d{2})/i,
      /(?:PAYMENT\s*DUE|TOTAL\s*DUE):\s*[\$£€J\$]?\s*([\d,]+\.\d{2})/i
    ];

    for (const line of lines) {
      for (const pattern of duePatterns) {
        const match = line.match(pattern);
        if (match) {
          return parseFloat(match[1].replace(/,/g, ''));
        }
      }
    }

    return null;
  }

  /**
   * Normalize date format
   */
  private static normalizeDate(dateStr: string): string {
    const date = new Date(dateStr);
    if (!isNaN(date.getTime())) {
      return date.toISOString().split('T')[0]; // YYYY-MM-DD format
    }
    return dateStr;
  }

  /**
   * Merge results from all regions, prioritizing by confidence and region type
   */
  private static async mergeRegionResults(regionResults: RegionOCRResult[]): Promise<MergedInvoiceData> {
    const mergedData: MergedInvoiceData = {
      vendorName: null,
      invoiceNumber: null,
      invoiceDate: null,
      grandTotal: null,
      subtotal: null,
      taxAmount: null,
      amountDue: null,
      confidence: 0,
      sourceRegions: [],
      supplierRecovery: null,
      rawText: ''
    };

    console.log('MERGE_REGIONS: Processing results from', regionResults.length, 'regions');
    
    // Log region results for debugging
    regionResults.forEach(result => {
      console.log(`REGION_${result.region.toUpperCase()}:`, {
        confidence: result.confidence,
        priority: result.priority,
        extractedFields: Object.keys(result.extractedFields).length,
        fields: result.extractedFields
      });
    });

    // Group fields by type with their sources
    const fieldCandidates = {
      vendorName: [] as Array<{ value: string; confidence: number; source: string }>,
      invoiceNumber: [] as Array<{ value: string; confidence: number; source: string }>,
      invoiceDate: [] as Array<{ value: string; confidence: number; source: string }>,
      grandTotal: [] as Array<{ value: number; confidence: number; source: string }>,
      subtotal: [] as Array<{ value: number; confidence: number; source: string }>,
      taxAmount: [] as Array<{ value: number; confidence: number; source: string }>,
      amountDue: [] as Array<{ value: number; confidence: number; source: string }>
    };

    // Collect all candidates from each region
    for (const result of regionResults) {
      if (result.extractedFields.vendor) {
        fieldCandidates.vendorName.push({
          value: result.extractedFields.vendor,
          confidence: result.confidence,
          source: result.region
        });
      }

      if (result.extractedFields.invoiceNumber) {
        fieldCandidates.invoiceNumber.push({
          value: result.extractedFields.invoiceNumber,
          confidence: result.confidence,
          source: result.region
        });
      }

      if (result.extractedFields.date) {
        fieldCandidates.invoiceDate.push({
          value: result.extractedFields.date,
          confidence: result.confidence,
          source: result.region
        });
      }

      if (result.extractedFields.total) {
        fieldCandidates.grandTotal.push({
          value: result.extractedFields.total,
          confidence: result.confidence,
          source: result.region
        });
      }

      if (result.extractedFields.subtotal) {
        fieldCandidates.subtotal.push({
          value: result.extractedFields.subtotal,
          confidence: result.confidence,
          source: result.region
        });
      }

      if (result.extractedFields.tax) {
        fieldCandidates.taxAmount.push({
          value: result.extractedFields.tax,
          confidence: result.confidence,
          source: result.region
        });
      }

      if (result.extractedFields.amountDue) {
        fieldCandidates.amountDue.push({
          value: result.extractedFields.amountDue,
          confidence: result.confidence,
          source: result.region
        });
      }
    }

    // Select best candidates for each field
    const selectBestCandidate = (candidates: Array<{ value: any; confidence: number; source: string }>) => {
      if (candidates.length === 0) return null;
      
      // Enhanced priority order for new region strategy
      const regionPriorityOrder = {
        'header-center': 5, // Highest priority for vendor names
        'top-right': 4,     // High priority for vendor names
        'top-left': 3,      // High priority for invoice #/date
        'bottom-right': 3,  // High priority for totals
        'bottom-left': 2    // Secondary priority for amounts
      };
      
      const best = candidates.sort((a, b) => {
        if (a.confidence !== b.confidence) {
          return b.confidence - a.confidence;
        }
        // If confidence is equal, prefer higher priority regions
        const aRegionPriority = regionPriorityOrder[a.source as keyof typeof regionPriorityOrder] || 0;
        const bRegionPriority = regionPriorityOrder[b.source as keyof typeof regionPriorityOrder] || 0;
        return bRegionPriority - aRegionPriority;
      })[0];

      return best;
    };

    // Set best candidates
    const vendorBest = selectBestCandidate(fieldCandidates.vendorName);
    if (vendorBest) {
      mergedData.vendorName = vendorBest.value;
      mergedData.sourceRegions.push(vendorBest.source);
    }

    const invoiceBest = selectBestCandidate(fieldCandidates.invoiceNumber);
    if (invoiceBest) {
      mergedData.invoiceNumber = invoiceBest.value;
      mergedData.sourceRegions.push(invoiceBest.source);
    }

    const dateBest = selectBestCandidate(fieldCandidates.invoiceDate);
    if (dateBest) {
      mergedData.invoiceDate = dateBest.value;
      mergedData.sourceRegions.push(dateBest.source);
    }

    const totalBest = selectBestCandidate(fieldCandidates.grandTotal);
    if (totalBest) {
      mergedData.grandTotal = totalBest.value;
      mergedData.sourceRegions.push(totalBest.source);
    }

    const subtotalBest = selectBestCandidate(fieldCandidates.subtotal);
    if (subtotalBest) {
      mergedData.subtotal = subtotalBest.value;
      mergedData.sourceRegions.push(subtotalBest.source);
    }

    const taxBest = selectBestCandidate(fieldCandidates.taxAmount);
    if (taxBest) {
      mergedData.taxAmount = taxBest.value;
      mergedData.sourceRegions.push(taxBest.source);
    }

    const dueBest = selectBestCandidate(fieldCandidates.amountDue);
    if (dueBest) {
      mergedData.amountDue = dueBest.value;
      mergedData.sourceRegions.push(dueBest.source);
    }

    // Calculate overall confidence based on successful extractions
    const fieldWeights = {
      vendorName: 0.2,
      invoiceNumber: 0.2,
      invoiceDate: 0.15,
      grandTotal: 0.25,
      subtotal: 0.1,
      taxAmount: 0.1
    };

    let totalConfidence = 0;
    let totalWeight = 0;

    for (const [field, weight] of Object.entries(fieldWeights)) {
      const fieldValue = mergedData[field as keyof typeof mergedData];
      if (fieldValue !== null) {
        // Get the confidence of the selected field
        const candidates = fieldCandidates[field as keyof typeof fieldCandidates];
        const bestCandidate = selectBestCandidate(candidates);
        if (bestCandidate) {
          totalConfidence += bestCandidate.confidence * weight;
          totalWeight += weight;
        }
      }
    }

    mergedData.confidence = totalWeight > 0 ? totalConfidence / totalWeight : 0;
    mergedData.sourceRegions = [...new Set(mergedData.sourceRegions)]; // Remove duplicates

    // Collect all raw text for supplier recovery
    mergedData.rawText = regionResults.map(r => r.text).join('\n---\n');

    // Attempt supplier recovery for vendor name
    console.log('SUPPLIER_RECOVERY: Attempting vendor name recovery');
    const vendorRecovery = await SupplierMatcher.recoverVendorName(
      mergedData.vendorName,
      mergedData.confidence,
      mergedData.rawText
    );

    mergedData.supplierRecovery = vendorRecovery;

    if (vendorRecovery.recovered && vendorRecovery.recoveredVendor) {
      console.log('SUPPLIER_RECOVERY: Vendor name recovered', {
        original: mergedData.vendorName,
        recovered: vendorRecovery.recoveredVendor,
        confidence: vendorRecovery.match?.confidence,
        reason: vendorRecovery.recoveryReason
      });
      
      // Replace vendor name with recovered supplier
      mergedData.vendorName = vendorRecovery.recoveredVendor;
    } else {
      console.log('SUPPLIER_RECOVERY: No recovery needed or failed', {
        reason: vendorRecovery.recoveryReason
      });
    }

    return mergedData;
  }
}
