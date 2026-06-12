/**
 * Invoice Data Extractor
 * 
 * Specialized extraction for supplier invoices with multi-column text cleanup
 * Optimized for vendor names, invoice numbers, dates, totals, and tax amounts
 */

export interface InvoiceData {
  vendorName: string | null;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  dueDate: string | null;
  grandTotal: number | null;
  subtotal: number | null;
  taxAmount: number | null;
  taxRate: number | null;
  amountDue: number | null;
  currency: string;
  lineItems: Array<{
    description: string;
    quantity: number | null;
    unitPrice: number | null;
    total: number | null;
  }>;
  confidence: number;
  extractionMethod: string;
  rawText: string;
}

export interface ExtractionCandidate {
  value: string | number;
  confidence: number;
  sourceText: string;
  reason: string;
  position: number;
}

export class InvoiceDataExtractor {
  private static readonly INVOICE_KEYWORDS = [
    'INVOICE', 'TAX INVOICE', 'BILL', 'STATEMENT', 'ACCOUNT',
    'VENDOR', 'SUPPLIER', 'SELLER', 'PROVIDER', 'COMPANY'
  ];

  private static readonly VENDOR_PATTERNS = [
    { regex: /^([A-Z][A-Z\s&\-\.,]{5,})\s+(?:INVOICE|BILL|TAX)/i, weight: 10 },
    { regex: /^(FROM|VENDOR|SUPPLIER|SELLER|BILL\s*TO):\s*(.+)$/im, weight: 9 },
    { regex: /^([A-Z][A-Z\s&\-\.,]{5,})$/m, weight: 3 }, // Company names in caps
    { regex: /(LTD|LIMITED|INC|CORP|LLC|PLC|PTY|ENTERPRISES|SERVICES|SOLUTIONS)/i, weight: 4 },
    { regex: /^([A-Z][a-z\s&\-\.,]+(?:LTD|INC|CORP|LLC|PLC))/m, weight: 5 }
  ];

  private static readonly INVOICE_NUMBER_PATTERNS = [
    { regex: /(?:INVOICE\s*#?|BILL\s*#?|REF\s*#?):?\s*([A-Z0-9\-\/]{3,})/i, weight: 10 },
    { regex: /(?:INVOICE|BILL|REF)\s*(?:NO|NUMBER|#)?\s*[:\.]?\s*([A-Z0-9\-\/]{3,})/i, weight: 9 },
    { regex: /#\s*([A-Z0-9\-\/]{3,})/i, weight: 5 },
    { regex: /INV[-\s]?([0-9]{3,})/i, weight: 7 }
  ];

  private static readonly DATE_PATTERNS = [
    { regex: /(?:DATE|DUE|ISSUED|INVOICE\s*DATE):\s*(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/i, weight: 10 },
    { regex: /(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})\s*(?:DUE|DATE|PAYMENT)/i, weight: 8 },
    { regex: /(?:DUE\s*DATE|PAYMENT\s*DUE):\s*(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/i, weight: 9 }
  ];

  private static readonly TOTAL_PATTERNS = [
    { regex: /(?:GRAND\s*TOTAL|TOTAL|TOTAL\s*DUE):\s*[\$£€J\$]?\s*([\d,]+\.\d{2})/i, weight: 10 },
    { regex: /(?:TOTAL\s*DUE|AMOUNT\s*DUE):\s*[\$£€J\$]?\s*([\d,]+\.\d{2})/i, weight: 9 },
    { regex: /(?:BALANCE\s*DUE|OUTSTANDING):\s*[\$£€J\$]?\s*([\d,]+\.\d{2})/i, weight: 8 },
    { regex: /TOTAL\s*[\$£€J\$]?\s*([\d,]+\.\d{2})/i, weight: 6 },
    { regex: /^[\$£€J\$]?\s*([\d,]+\.\d{2})\s*TOTAL$/im, weight: 7 }
  ];

  private static readonly TAX_PATTERNS = [
    { regex: /(?:TAX|VAT|GST|HST|GCT):\s*[\$£€J\$]?\s*([\d,]+\.\d{2})/i, weight: 10 },
    { regex: /(?:TAX\s*AMOUNT|VAT\s*AMOUNT|GCT\s*AMOUNT):\s*[\$£€J\$]?\s*([\d,]+\.\d{2})/i, weight: 9 },
    { regex: /SUBTOTAL:\s*[\$£€J\$]?\s*([\d,]+\.\d{2})/i, weight: 7 },
    { regex: /(?:VAT|GST|GCT)\s*[\$£€J\$]?\s*([\d,]+\.\d{2})/i, weight: 6 }
  ];

  /**
   * Extract invoice data from OCR text
   */
  static extractInvoiceData(ocrText: string, confidence: number): InvoiceData {
    console.log('INVOICE_EXTRACTION: Starting specialized invoice data extraction');
    
    const lines = this.cleanTextForExtraction(ocrText);
    const extractedData: Partial<InvoiceData> = {
      currency: this.detectCurrency(ocrText),
      lineItems: [],
      rawText: ocrText,
      confidence: confidence * 0.8 // Base confidence on OCR quality
    };

    // Extract vendor name
    extractedData.vendorName = this.extractVendorName(lines);
    
    // Extract invoice number
    extractedData.invoiceNumber = this.extractInvoiceNumber(lines);
    
    // Extract dates
    const dates = this.extractDates(lines);
    extractedData.invoiceDate = dates.invoiceDate;
    extractedData.dueDate = dates.dueDate;
    
    // Extract amounts
    const amounts = this.extractAmounts(lines);
    extractedData.grandTotal = amounts.grandTotal;
    extractedData.subtotal = amounts.subtotal;
    extractedData.taxAmount = amounts.taxAmount;
    extractedData.amountDue = amounts.amountDue;
    
    // Extract line items
    extractedData.lineItems = this.extractLineItems(lines);
    
    // Calculate overall confidence
    extractedData.confidence = this.calculateExtractionConfidence(extractedData);
    extractedData.extractionMethod = 'invoice_specialized';

    console.log('INVOICE_EXTRACTION_COMPLETE:', {
      vendor: extractedData.vendorName,
      invoiceNumber: extractedData.invoiceNumber,
      total: extractedData.grandTotal,
      confidence: extractedData.confidence.toFixed(3),
      lineItems: extractedData.lineItems?.length || 0
    });

    return extractedData as InvoiceData;
  }

  /**
   * Clean text for better extraction
   */
  private static cleanTextForExtraction(text: string): string[] {
    return text
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .filter(line => !line.match(/^(page|page\s*\d+|continued|\s*[-=]{3,})$/i)) // Remove page headers/footers
      .map(line => this.fixCommonOCRErrors(line));
  }

  /**
   * Fix common OCR errors in invoices
   */
  private static fixCommonOCRErrors(line: string): string {
    return line
      .replace(/O/g, '0') // Fix O's in numbers
      .replace(/l/g, '1') // Fix ones in invoice numbers
      .replace(/I/g, '1') // Fix I's in numbers
      .replace(/\$/g, '$') // Fix currency symbols
      .replace(/J\$/g, 'J$') // Fix JMD currency
      .replace(/,/g, ',') // Fix commas in numbers
      .replace(/\.\s+/g, '.') // Remove spaces after periods
      .replace(/\s+\./g, '.') // Remove spaces before periods
      .replace(/\s+/g, ' ') // Normalize spaces
      .replace(/\s*[:]\s*/g, ': ') // Normalize colons
      .replace(/\s*[\/]\s*/g, '/') // Normalize slashes
      .replace(/\s*[-]\s*/g, '-') // Normalize dashes
      .trim();
  }

  /**
   * Extract vendor name with multiple strategies
   */
  private static extractVendorName(lines: string[]): string | null {
    const candidates: ExtractionCandidate[] = [];

    lines.forEach((line, index) => {
      this.VENDOR_PATTERNS.forEach(pattern => {
        const match = line.match(pattern.regex);
        if (match) {
          const vendorName = match[2] || match[1];
          if (vendorName && vendorName.length > 3) {
            candidates.push({
              value: vendorName.trim(),
              confidence: pattern.weight / 10,
              sourceText: line,
              reason: `Pattern: ${pattern.regex.source}`,
              position: index
            });
          }
        }
      });
    });

    // Select best candidate
    const bestCandidate = candidates
      .sort((a, b) => b.confidence - a.confidence)[0];

    return bestCandidate ? bestCandidate.value as string : null;
  }

  /**
   * Extract invoice number
   */
  private static extractInvoiceNumber(lines: string[]): string | null {
    const candidates: ExtractionCandidate[] = [];

    lines.forEach((line, index) => {
      this.INVOICE_NUMBER_PATTERNS.forEach(pattern => {
        const match = line.match(pattern.regex);
        if (match) {
          const invoiceNumber = match[1];
          candidates.push({
            value: invoiceNumber,
            confidence: pattern.weight / 10,
            sourceText: line,
            reason: `Pattern: ${pattern.regex.source}`,
            position: index
          });
        }
      });
    });

    const bestCandidate = candidates
      .sort((a, b) => b.confidence - a.confidence)[0];

    return bestCandidate ? bestCandidate.value as string : null;
  }

  /**
   * Extract dates (invoice and due dates)
   */
  private static extractDates(lines: string[]): { invoiceDate: string | null; dueDate: string | null } {
    const dates = { invoiceDate: null as string | null, dueDate: null as string | null };
    const candidates: Array<{ type: 'invoice' | 'due'; candidate: ExtractionCandidate }> = [];

    lines.forEach((line, index) => {
      this.DATE_PATTERNS.forEach(pattern => {
        const match = line.match(pattern.regex);
        if (match) {
          const dateStr = match[1];
          const normalizedDate = this.normalizeDate(dateStr);
          const type = line.toLowerCase().includes('due') ? 'due' : 'invoice';
          
          candidates.push({
            type,
            candidate: {
              value: normalizedDate,
              confidence: pattern.weight / 10,
              sourceText: line,
              reason: `Pattern: ${pattern.regex.source}`,
              position: index
            }
          });
        }
      });
    });

    // Select best candidates for each date type
    const invoiceCandidates = candidates.filter(c => c.type === 'invoice');
    const dueCandidates = candidates.filter(c => c.type === 'due');

    if (invoiceCandidates.length > 0) {
      dates.invoiceDate = invoiceCandidates
        .sort((a, b) => b.candidate.confidence - a.candidate.confidence)[0]
        .candidate.value as string;
    }

    if (dueCandidates.length > 0) {
      dates.dueDate = dueCandidates
        .sort((a, b) => b.candidate.confidence - a.candidate.confidence)[0]
        .candidate.value as string;
    }

    return dates;
  }

  /**
   * Extract monetary amounts
   */
  private static extractAmounts(lines: string[]): {
    grandTotal: number | null;
    subtotal: number | null;
    taxAmount: number | null;
    amountDue: number | null;
  } {
    const amounts = {
      grandTotal: null as number | null,
      subtotal: null as number | null,
      taxAmount: null as number | null,
      amountDue: null as number | null
    };

    const candidates: Array<{ type: 'total' | 'subtotal' | 'tax' | 'due'; candidate: ExtractionCandidate }> = [];

    lines.forEach((line, index) => {
      // Check total patterns
      this.TOTAL_PATTERNS.forEach(pattern => {
        const match = line.match(pattern.regex);
        if (match) {
          const amount = parseFloat(match[1].replace(/,/g, ''));
          candidates.push({
            type: line.toLowerCase().includes('due') ? 'due' : 'total',
            candidate: {
              value: amount,
              confidence: pattern.weight / 10,
              sourceText: line,
              reason: `Pattern: ${pattern.regex.source}`,
              position: index
            }
          });
        }
      });

      // Check tax patterns
      this.TAX_PATTERNS.forEach(pattern => {
        const match = line.match(pattern.regex);
        if (match) {
          const amount = parseFloat(match[1].replace(/,/g, ''));
          candidates.push({
            type: 'tax',
            candidate: {
              value: amount,
              confidence: pattern.weight / 10,
              sourceText: line,
              reason: `Pattern: ${pattern.regex.source}`,
              position: index
            }
          });
        }
      });
    });

    // Select best candidates for each amount type
    ['total', 'subtotal', 'tax', 'due'].forEach(type => {
      const typeCandidates = candidates.filter(c => c.type === type);
      if (typeCandidates.length > 0) {
        const best = typeCandidates
          .sort((a, b) => b.candidate.confidence - a.candidate.confidence)[0]
          .candidate.value as number;
        
        if (type === 'total') amounts.grandTotal = best;
        else if (type === 'subtotal') amounts.subtotal = best;
        else if (type === 'tax') amounts.taxAmount = best;
        else if (type === 'due') amounts.amountDue = best;
      }
    });

    return amounts;
  }

  /**
   * Extract line items from multi-column text
   */
  private static extractLineItems(lines: string[]): Array<{
    description: string;
    quantity: number | null;
    unitPrice: number | null;
    total: number | null;
  }> {
    const lineItems: Array<{
      description: string;
      quantity: number | null;
      unitPrice: number | null;
      total: number | null;
    }> = [];

    // Look for lines that appear to be line items
    lines.forEach((line, index) => {
      // Skip header lines and totals
      if (this.isHeaderOrTotalLine(line)) return;

      // Try to parse as line item
      const item = this.parseLineItem(line);
      if (item && item.description.length > 3) {
        lineItems.push(item);
      }
    });

    return lineItems.slice(0, 20); // Limit to first 20 items
  }

  /**
   * Parse individual line item
   */
  private static parseLineItem(line: string): {
    description: string;
    quantity: number | null;
    unitPrice: number | null;
    total: number | null;
  } | null {
    // Look for patterns like: "Item Description 2 $50.00 $100.00"
    const patterns = [
      /(.+?)\s+(\d+)\s+[\$£€]?\s*([\d,]+\.\d{2})\s+[\$£€]?\s*([\d,]+\.\d{2})/,
      /(.+?)\s+[\$£€]?\s*([\d,]+\.\d{2})\s+(\d+)\s+[\$£€]?\s*([\d,]+\.\d{2})/,
      /(.+?)\s+[\$£€]?\s*([\d,]+\.\d{2})/
    ];

    for (const pattern of patterns) {
      const match = line.match(pattern);
      if (match) {
        if (pattern === patterns[0]) {
          // Description, Quantity, Unit Price, Total
          return {
            description: match[1].trim(),
            quantity: parseInt(match[2]),
            unitPrice: parseFloat(match[3].replace(/,/g, '')),
            total: parseFloat(match[4].replace(/,/g, ''))
          };
        } else if (pattern === patterns[1]) {
          // Description, Unit Price, Quantity, Total
          return {
            description: match[1].trim(),
            quantity: parseInt(match[3]),
            unitPrice: parseFloat(match[2].replace(/,/g, '')),
            total: parseFloat(match[4].replace(/,/g, ''))
          };
        } else {
          // Description, Total (simplified)
          return {
            description: match[1].trim(),
            quantity: null,
            unitPrice: null,
            total: parseFloat(match[2].replace(/,/g, ''))
          };
        }
      }
    }

    return null;
  }

  /**
   * Check if line is header or total
   */
  private static isHeaderOrTotalLine(line: string): boolean {
    const upperLine = line.toUpperCase();
    return this.INVOICE_KEYWORDS.some(keyword => upperLine.includes(keyword)) ||
           upperLine.includes('TOTAL') ||
           upperLine.includes('SUBTOTAL') ||
           upperLine.includes('TAX') ||
           upperLine.includes('DUE') ||
           upperLine.includes('AMOUNT') ||
           !!line.match(/^[\s\-_=]{3,}$/); // Separator lines
  }

  /**
   * Detect currency from text
   */
  private static detectCurrency(text: string): string {
    if (text.includes('JMD') || text.includes('J$')) return 'JMD';
    if (text.includes('USD') || text.includes('$')) return 'USD';
    if (text.includes('EUR') || text.includes('€')) return 'EUR';
    if (text.includes('GBP') || text.includes('£')) return 'GBP';
    return 'USD'; // Default to USD
  }

  /**
   * Normalize date format
   */
  private static normalizeDate(dateStr: string): string {
    // Try to normalize various date formats
    const date = new Date(dateStr);
    if (!isNaN(date.getTime())) {
      return date.toISOString().split('T')[0]; // YYYY-MM-DD format
    }
    return dateStr; // Return original if parsing fails
  }

  /**
   * Calculate overall extraction confidence
   */
  private static calculateExtractionConfidence(data: Partial<InvoiceData>): number {
    const factors = [
      data.vendorName ? 0.15 : 0,
      data.invoiceNumber ? 0.15 : 0,
      data.invoiceDate ? 0.1 : 0,
      data.grandTotal ? 0.3 : 0,
      data.subtotal ? 0.1 : 0,
      data.taxAmount ? 0.1 : 0,
      data.amountDue ? 0.1 : 0,
      data.lineItems && data.lineItems.length > 0 ? 0.1 : 0
    ];

    const baseConfidence = Math.min(1, factors.reduce((a, b) => a + b, 0));
    
    // Boost confidence if we have the most critical fields
    const criticalFields = [
      data.vendorName,
      data.invoiceNumber, 
      data.grandTotal
    ].filter(Boolean).length;
    
    const criticalBonus = criticalFields >= 2 ? 0.1 : 0;
    
    return Math.min(1, baseConfidence + criticalBonus);
  }
}
