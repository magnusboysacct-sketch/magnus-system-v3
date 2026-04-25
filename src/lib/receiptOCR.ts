import { createWorker } from 'tesseract.js';
import { supabase } from './supabase';

export interface OCRResult {
  vendor: string | null;
  date: string | null;
  amount: number | null;
  tax: number | null;
  receiptNumber: string | null;
  invoiceNumber?: string | null;
  customerName?: string | null;
  documentType?: string;
  rawText: string;
  confidence: number;
  mode?: string;
  requiresManualEntry: boolean;
  debugInfo?: {
    selectedPass: string;
    topPasses: Array<{
      passName: string;
      score: number;
      confidence: number;
    }>;
    candidates: {
      vendor: Array<{
        value: string;
        sourceText: string;
        confidence: number;
        reason: string;
      }>;
      date: Array<{
        value: string;
        sourceText: string;
        confidence: number;
        reason: string;
      }>;
      amount: Array<{
        value: number;
        sourceText: string;
        confidence: number;
        reason: string;
      }>;
    };
    rejectionReasons?: string[];
    documentType?: string;
  };
}

export interface ReceiptUploadResult {
  success: boolean;
  ocrResult: OCRResult;
  receiptId: string;
  storagePath?: string;
}

// Known Jamaican vendors and businesses
const KNOWN_VENDORS = [
  'FESCO', 'TRANSJAM', 'TRANS JAMAICAN', 'MAY PEN WEST', 'MAYPEN WEST',
  'HARDWARE & LUMBER', 'HARDWARE AND LUMBER', 'RAPID TRUE VALUE', 'H&L',
  'FONTANA', 'MEGAMART', 'PRICESMART', 'HI-LO', 'TEXACO', 'TOTAL',
  'RUBIS', 'TOTAL GAS STATION', 'SHELL', 'CHEVRON', 'GP', 'JPS',
  'FLOW', 'DIGICEL', 'LIME'
];

// Receipt keywords for scoring
const RECEIPT_KEYWORDS = [
  'TOTAL', 'CASH', 'PAYMENT', 'DATE', 'RECEIPT', 'FARE', 'TAX', 'JMD', 'JMO',
  'AMOUNT', 'DUE', 'BALANCE', 'SALE', 'NET', 'GRAND', 'SUBTOTAL', 'CHANGE',
  'INVOICE', 'ORDER', 'TRANSACTION', 'PURCHASE', 'RECEIVED', 'THANK', 'CUSTOMER',
  'REGISTER', 'TERMINAL', 'CASHIER', 'CLERK'
];

// Money amount labels
const MONEY_LABELS = [
  'TOTAL', 'AMOUNT', 'CASH', 'PAID', 'BALANCE', 'DUE', 'PAYMENT',
  'SUBTOTAL', 'GRAND TOTAL', 'NET TOTAL', 'TAX', 'VAT', 'GCT'
];

// Image processing variants for multi-pass OCR
interface OCRPass {
  passName: string;
  imageData: string;
  description: string;
}

interface OCRPassResult {
  passName: string;
  text: string;
  confidence: number;
  score: number;
  scoreDetails: {
    tesseractConfidence: number;
    readableWordRatio: number;
    keywordCount: number;
    validMoneyCount: number;
    validDateCount: number;
    vendorCandidateCount: number;
    garbagePenalty: number;
  };
}

interface FieldCandidate {
  value: string | number;
  sourceText: string;
  confidence: number;
  reason: string;
  lineIndex?: number;
}

interface ExtractedFields {
  vendor: FieldCandidate[];
  date: FieldCandidate[];
  amount: FieldCandidate[];
  tax: FieldCandidate[];
  receiptNumber: FieldCandidate[];
  invoiceNumber?: FieldCandidate[];
  customerName?: FieldCandidate[];
  documentType?: string;
}

// Create image processing variants for multi-pass OCR
function createOCRVariants(originalImageData: string): OCRPass[] {
  return [
    {
      passName: 'original',
      imageData: originalImageData,
      description: 'Original image'
    },
    {
      passName: 'grayscale',
      imageData: applyGrayscale(originalImageData),
      description: 'Grayscale conversion'
    },
    {
      passName: 'high_contrast',
      imageData: applyHighContrast(originalImageData),
      description: 'High contrast enhancement'
    },
    {
      passName: 'threshold',
      imageData: applyThreshold(originalImageData),
      description: 'Black/white threshold'
    },
    {
      passName: 'sharpened',
      imageData: applySharpen(originalImageData),
      description: 'Sharpened'
    },
    {
      passName: 'enlarged_2x',
      imageData: applyEnlargement(originalImageData, 2),
      description: 'Enlarged 2x'
    },
    {
      passName: 'enlarged_3x',
      imageData: applyEnlargement(originalImageData, 3),
      description: 'Enlarged 3x'
    },
    {
      passName: 'brightness_boost',
      imageData: applyBrightnessContrast(originalImageData, 1.2, 1.3),
      description: 'Brightness/contrast boosted'
    }
  ];
}

// Image processing functions (simplified for now - would use canvas in real implementation)
function applyGrayscale(imageData: string): string {
  return imageData; // Placeholder - would implement actual grayscale
}

function applyHighContrast(imageData: string): string {
  return imageData; // Placeholder - would implement actual contrast
}

function applyThreshold(imageData: string): string {
  return imageData; // Placeholder - would implement actual threshold
}

function applySharpen(imageData: string): string {
  return imageData; // Placeholder - would implement actual sharpening
}

function applyEnlargement(imageData: string, factor: number): string {
  return imageData; // Placeholder - would implement actual enlargement
}

function applyBrightnessContrast(imageData: string, brightness: number, contrast: number): string {
  return imageData; // Placeholder - would implement actual brightness/contrast
}

// Score OCR pass quality
function scoreOCRPass(text: string, confidence: number): OCRPassResult['scoreDetails'] {
  const words = text.split(/\s+/).filter(w => w.length > 0);
  const totalWords = words.length;
  
  // Readable word ratio (words with only letters/numbers)
  const readableWords = words.filter(w => /^[a-zA-Z0-9]+$/.test(w));
  const readableWordRatio = totalWords > 0 ? readableWords.length / totalWords : 0;
  
  // Receipt keyword count
  const keywordCount = RECEIPT_KEYWORDS.filter(keyword => 
    text.toUpperCase().includes(keyword)
  ).length;
  
  // Valid money count (patterns like $123.45, 123.45, JMD 123)
  const moneyPattern = /\$?\d{1,3}[,\s]?\d{3}[.\s]?\d{2}|JMD\s?\d+[.,]\d{2}/gi;
  const validMoneyCount = (text.match(moneyPattern) || []).length;
  
  // Valid date count (common date patterns)
  const datePattern = /\b\d{1,4}[\/\-\,]\d{1,2}[\/\-\,]\d{2,4}\b/g;
  const validDateCount = (text.match(datePattern) || []).length;
  
  // Vendor candidate count
  const vendorCandidateCount = extractVendorCandidates(text).length;
  
  // Garbage character penalty
  const garbageChars = (text.match(/[^a-zA-Z0-9\s\.\,\-\:\$\/\&]/g) || []).length;
  const garbagePenalty = text.length > 0 ? garbageChars / text.length : 0;
  
  return {
    tesseractConfidence: confidence,
    readableWordRatio,
    keywordCount,
    validMoneyCount,
    validDateCount,
    vendorCandidateCount,
    garbagePenalty
  };
}

// Calculate overall OCR pass score
function calculateOCRPassScore(scoreDetails: OCRPassResult['scoreDetails']): number {
  let score = 0;
  
  // Tesseract confidence (30% weight)
  score += scoreDetails.tesseractConfidence * 0.3;
  
  // Readable word ratio (25% weight)
  score += scoreDetails.readableWordRatio * 0.25;
  
  // Keyword count (20% weight)
  score += Math.min(scoreDetails.keywordCount / 10, 1) * 0.2;
  
  // Valid money count (15% weight)
  score += Math.min(scoreDetails.validMoneyCount / 5, 1) * 0.15;
  
  // Valid date count (5% weight)
  score += Math.min(scoreDetails.validDateCount / 3, 1) * 0.05;
  
  // Vendor candidate count (3% weight)
  score += Math.min(scoreDetails.vendorCandidateCount / 3, 1) * 0.03;
  
  // Garbage penalty (subtract)
  score -= scoreDetails.garbagePenalty * 0.5;
  
  return Math.max(0, Math.min(1, score));
}

// Extract vendor candidates
function extractVendorCandidates(text: string): FieldCandidate[] {
  const candidates: FieldCandidate[] = [];
  const lines = text.split('\n').filter(line => line.trim().length > 0);
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Skip if too short or too long
    if (line.length < 3 || line.length > 50) continue;
    
    // Skip if looks like address/phone
    if (/^\d+|road|street|ave|blvd|phone|tel|po box/i.test(line)) continue;
    
    // Check for known vendors
    const knownVendor = KNOWN_VENDORS.find(vendor => 
      line.toUpperCase().includes(vendor.toUpperCase())
    );
    
    if (knownVendor) {
      candidates.push({
        value: knownVendor,
        sourceText: line,
        confidence: 0.9,
        reason: `Known vendor: ${knownVendor}`,
        lineIndex: i
      });
    }
    
    // Check for uppercase business phrases
    const isUppercase = line === line.toUpperCase() && !/\d/.test(line);
    const hasBusinessKeyword = RECEIPT_KEYWORDS.some(keyword => 
      line.toUpperCase().includes(keyword)
    );
    
    if (isUppercase && hasBusinessKeyword) {
      candidates.push({
        value: line,
        sourceText: line,
        confidence: 0.7,
        reason: 'Uppercase business phrase',
        lineIndex: i
      });
    }
    
    // Top lines bonus
    if (i < 3 && line.length >= 5 && /^[A-Z\s&]+$/.test(line)) {
      candidates.push({
        value: line,
        sourceText: line,
        confidence: 0.6,
        reason: 'Top line uppercase phrase',
        lineIndex: i
      });
    }
  }
  
  return candidates.sort((a, b) => b.confidence - a.confidence);
}

// Extract date candidates
function extractDateCandidates(text: string): FieldCandidate[] {
  const candidates: FieldCandidate[] = [];
  
  // Date patterns
  const datePatterns = [
    { regex: /\b(0?[1-9]|[12]\d|3[01])[\/\-](0?[1-9]|1[0-2])[\/\-](20\d{2})\b/g, format: 'dd/mm/yyyy' },
    { regex: /\b(0?[1-9]|[12]\d|3[01])[\/\-](0?[1-9]|1[0-2])[\/\-](\d{2})\b/g, format: 'dd/mm/yy' },
    { regex: /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(0?[1-9]|[12]\d|3[01])[,\s]+(20\d{2})\b/gi, format: 'month_dd_yyyy' },
    { regex: /\b(20\d{2})[\/\-](0?[1-9]|1[0-2])[\/\-](0?[1-9]|[12]\d|3[01])\b/g, format: 'yyyy/mm/dd' },
    { regex: /\b(0?[1-9]|[12]\d|3[01])[\,\s](0?[1-9]|1[0-2])[\,\s](20\d{2})\b/g, format: 'dd_mm_yyyy_comma' }
  ];
  
  for (const pattern of datePatterns) {
    let match;
    while ((match = pattern.regex.exec(text)) !== null) {
      const dateStr = match[0];
      let day, month, year;
      
      try {
        switch (pattern.format) {
          case 'dd/mm/yyyy':
            day = parseInt(match[1]);
            month = parseInt(match[2]);
            year = parseInt(match[3]);
            break;
          case 'dd/mm/yy':
            day = parseInt(match[1]);
            month = parseInt(match[2]);
            year = 2000 + parseInt(match[3]);
            break;
          case 'month_dd_yyyy':
            const monthNames: Record<string, number> = {Jan:1, Feb:2, Mar:3, Apr:4, May:5, Jun:6, Jul:7, Aug:8, Sep:9, Oct:10, Nov:11, Dec:12};
            day = parseInt(match[2]);
            month = monthNames[match[1].substring(0, 3)] || 1;
            year = parseInt(match[3]);
            break;
          case 'yyyy/mm/dd':
            year = parseInt(match[1]);
            month = parseInt(match[2]);
            day = parseInt(match[3]);
            break;
          case 'dd_mm_yyyy_comma':
            day = parseInt(match[1]);
            month = parseInt(match[2]);
            year = parseInt(match[3]);
            break;
        }
        
        // Validate and normalize
        if (day && month && year && day >= 1 && day <= 31 && month >= 1 && month <= 12) {
          const currentYear = new Date().getFullYear();
          year = Math.max(2020, Math.min(2035, year));
          
          // Prefer current year
          if (Math.abs(year - currentYear) > 2) {
            year = currentYear;
          }
          
          const isoDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          
          candidates.push({
            value: isoDate,
            sourceText: dateStr,
            confidence: 0.8,
            reason: `Date pattern: ${pattern.format}`
          });
        }
      } catch (e) {
        // Invalid date, skip
      }
    }
  }
  
  // Repair noisy dates
  const noisyDatePattern = /\b([A-Z0-9\/\-\,\s]{8,})\b/g;
  let noisyMatch;
  while ((noisyMatch = noisyDatePattern.exec(text)) !== null) {
    const repaired = repairNoisyDate(noisyMatch[1]);
    if (repaired) {
      const dateMatch = repaired.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
      if (dateMatch) {
        const [, day, month, year] = dateMatch;
        const isoDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        
        candidates.push({
          value: isoDate,
          sourceText: noisyMatch[1],
          confidence: 0.6,
          reason: 'Repaired noisy date'
        });
      }
    }
  }
  
  return candidates.sort((a, b) => b.confidence - a.confidence);
}

// Repair noisy date
function repairNoisyDate(dateStr: string): string | null {
  let repaired = dateStr.toUpperCase();
  
  // Common OCR corrections
  repaired = repaired.replace(/Z/g, '2');
  repaired = repaired.replace(/O/g, '0');
  repaired = repaired.replace(/[IL]/g, '1');
  repaired = repaired.replace(/\s*[\/\-\,]\s*/g, '/');
  
  // Fix corrupted patterns
  repaired = repaired.replace(/^Z0+/g, '20');
  repaired = repaired.replace(/^Z0/g, '20');
  repaired = repaired.replace(/^2(\d{3,})/g, '20');
  
  // Validate format
  const match = repaired.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  return match ? repaired : null;
}

// Extract amount candidates with enhanced patterns and filtering
function extractAmountCandidates(text: string): FieldCandidate[] {
  const candidates: FieldCandidate[] = [];
  const lines = text.split('\n').filter(line => line.trim().length > 0);
  
  console.log('=== AMOUNT EXTRACTION START ===');
  console.log('TOTAL_LINES:', lines.length);
  
  // FESCO fuel receipt detection
  const hasFescoVendor = text.toUpperCase().includes('FESCO');
  const fuelWords = ['LTR', 'LITRE', 'PUMP', 'DIESEL', 'GAS', 'FUEL'];
  const hasFuelWords = fuelWords.some(word => text.toUpperCase().includes(word));
  const isFescoFuel = hasFescoVendor || hasFuelWords;
  
  if (isFescoFuel) {
    console.log('FESCO_FUEL_DETECTION:', { hasFescoVendor, hasFuelWords });
  }
  
  // Label-first patterns - prioritize amounts closest to money labels
  const labelPatterns = [
    // Labels BEFORE amount: TOTAL 4000.00, CASH 4000.00, FARE 270.00, etc.
    { regex: /^(?:total|amount|fare|fee|cash|paid|balance|due|jmd|\$)\s*[:\s]*(\$?)(\d+[,.]?\d*\.?\d{2})/gim, priority: 15, label: 'LABEL_BEFORE_AMOUNT' },
    // Labels AFTER amount: 4000.00 TOTAL, 270.00 FARE, etc.
    { regex: /(\$?)(\d+[,.]?\d*\.?\d{2})\s+(?:total|amount|fare|fee|cash|paid|balance|due|jmd)$/gim, priority: 14, label: 'AMOUNT_LABEL_AFTER' },
    // Labels with colon: TOTAL: 4000.00, CASH: 270.00, etc.
    { regex: /(?:total|amount|fare|fee|cash|paid|balance|due|jmd|\$)\s*[:\=]\s*(\$?)(\d+[,.]?\d*\.?\d{2})/gim, priority: 13, label: 'LABEL_COLON_AMOUNT' },
    // Currency prefixes: $270.00, JMD 270.00
    { regex: /(?:jmd|\$)\s*(\$?)(\d+[,.]?\d*\.?\d{2})/gim, priority: 12, label: 'CURRENCY_PREFIX' },
    // Currency suffixes: 270.00 JMD, 270.00 $
    { regex: /(\$?)(\d+[,.]?\d*\.?\d{2})\s+(?:jmd|\$)$/gim, priority: 11, label: 'AMOUNT_CURRENCY_SUFFIX' }
  ];
  
  // Fallback patterns for unlabeled amounts
  const fallbackPatterns = [
    { regex: /\$(\d+[,.]?\d*\.?\d{2})/g, priority: 5, label: 'STANDALONE_MONEY' },
    { regex: /\b(\d+[,.]?\d*\.?\d{2})\b/g, priority: 4, label: 'STANDALONE_NUMBER' }
  ];
  
  // Track if we found any labeled matches across all lines
  let hasAnyLabeledMatch = false;
  
  // Process all lines and collect candidates
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Skip lines that look like phone numbers, dates, times, IDs, or GCT numbers
    if (line.match(/^(\+?1[-\s]?\(?\d{3}\)?[-\s]?\d{3}[-\s]?\d{4}|\d{10,}|tax\s*#|tax\s*id|invoice\s*#|receipt\s*#|gct\s*\d+)/i)) {
      continue;
    }
    
    // Skip lines that look like times (HH:MM format)
    if (line.match(/\b\d{1,2}:\d{2}\b/)) {
      continue;
    }
    
    // FESCO fuel: reject amounts 100-400 if same line contains litre/unit-rate clues
    if (isFescoFuel) {
      const amountMatch = line.match(/(\d+[,.]?\d*\.?\d{2})/);
      if (amountMatch) {
        const amount = parseFloat(amountMatch[1].replace(/,/g, ''));
        const hasLitreClues = line.match(/\/\s*ltr|litre|per\s*litre|unit\s*rate|\/\s*l|l\/|ltr/i);
        
        if (amount >= 100 && amount <= 400 && hasLitreClues) {
          console.log('FESCO_FUEL_UNIT_PRICE_REJECTED:', { line, amount, reason: 'Unit price range with litre clues' });
          continue;
        }
      }
    }
    
    // Calculate position ratio (0 = top, 1 = bottom)
    const positionRatio = i / lines.length;
    const isBottomHalf = positionRatio > 0.5;
    const bottomBonus = isBottomHalf ? 0.2 : 0;
    
    // Enhanced bottom bonus for FESCO fuel receipts (prefer largest amounts in lower half)
    const fescoFuelBonus = (isFescoFuel && isBottomHalf) ? 0.15 : 0;
    
    // Test label patterns first (highest priority)
    for (const pattern of labelPatterns) {
      const matches = [...line.matchAll(pattern.regex)];
      
      for (const match of matches) {
        const amountStr = match[2] || match[1]; // Handle both capture groups
        const amount = parseFloat(amountStr.replace(/,/g, ''));
        
        if (amount > 0 && amount < 100000) {
          candidates.push({
            value: amount,
            confidence: (pattern.priority * 0.1) + bottomBonus + fescoFuelBonus,
            reason: `${pattern.label}${isBottomHalf ? ' (bottom)' : ''}${fescoFuelBonus > 0 ? ' + FESCO_FUEL_BONUS' : ''}`,
            sourceText: match[0]
          });
          hasAnyLabeledMatch = true;
        }
      }
    }
  }
  
  // Second pass: only test fallback patterns if no labeled matches found anywhere
  if (!hasAnyLabeledMatch) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // Skip lines that look like phone numbers, dates, times, IDs, or GCT numbers
      if (line.match(/^(\+?1[-\s]?\(?\d{3}\)?[-\s]?\d{3}[-\s]?\d{4}|\d{10,}|tax\s*#|tax\s*id|invoice\s*#|receipt\s*#|gct\s*\d+)/i)) {
        continue;
      }
      
      // Skip lines that look like times (HH:MM format)
      if (line.match(/\b\d{1,2}:\d{2}\b/)) {
        continue;
      }
      
      // FESCO fuel: reject amounts 100-400 if same line contains litre/unit-rate clues
      if (isFescoFuel) {
        const amountMatch = line.match(/(\d+[,.]?\d*\.?\d{2})/);
        if (amountMatch) {
          const amount = parseFloat(amountMatch[1].replace(/,/g, ''));
          const hasLitreClues = line.match(/\/\s*ltr|litre|per\s*litre|unit\s*rate|\/\s*l|l\/|ltr/i);
          
          if (amount >= 100 && amount <= 400 && hasLitreClues) {
            continue;
          }
        }
      }
      
      // Calculate position ratio (0 = top, 1 = bottom)
      const positionRatio = i / lines.length;
      const isBottomHalf = positionRatio > 0.5;
      const bottomBonus = isBottomHalf ? 0.2 : 0;
      const fescoFuelBonus = (isFescoFuel && isBottomHalf) ? 0.15 : 0;
      
      for (const pattern of fallbackPatterns) {
        const matches = [...line.matchAll(pattern.regex)];
        
        for (const match of matches) {
          const amountStr = match[1] || match[0];
          const amount = parseFloat(amountStr.replace(/,/g, ''));
          
          // Additional validation for standalone numbers
          if (amount > 0 && amount < 100000 && 
              (pattern.label === 'STANDALONE_NUMBER' ? amount > 1.99 : true)) {
            candidates.push({
              value: amount,
              confidence: (pattern.priority * 0.1) + bottomBonus + fescoFuelBonus,
              reason: `${pattern.label}${isBottomHalf ? ' (bottom)' : ''}${fescoFuelBonus > 0 ? ' + FESCO_FUEL_BONUS' : ''}`,
              sourceText: match[0]
            });
          }
        }
      }
    }
  }
  
  console.log('AMOUNT_CANDIDATES:', candidates.map((c: FieldCandidate) => ({
    value: c.value,
    confidence: c.confidence,
    reason: c.reason,
    source: c.sourceText
  })));
  
  return candidates.sort((a, b) => b.confidence - a.confidence);
}

// Document type detection
function detectDocumentType(text: string): 'receipt' | 'invoice' {
  const upperText = text.toUpperCase();
  
  // Invoice indicators - ANY of these immediately classifies as invoice
  const invoiceKeywords = [
    'INVOICE',
    'TAX INVOICE',
    'TOTAL DUE',
    'BALANCE DUE',
    'GRAND TOTAL',
    'SUBTOTAL',
    'VAT',
    'BILL TO'
  ];
  
  // Check if ANY invoice keyword is found
  const hasInvoiceKeyword = invoiceKeywords.some(keyword => 
    upperText.includes(keyword)
  );
  
  console.log('DOCUMENT_TYPE_DETECTION:', {
    hasInvoiceKeyword,
    foundKeywords: invoiceKeywords.filter(keyword => upperText.includes(keyword))
  });
  
  // Immediately classify as invoice if ANY keyword found
  if (hasInvoiceKeyword) {
    console.log('DOCUMENT_TYPE: INVOICE');
    return 'invoice';
  }
  
  console.log('DOCUMENT_TYPE: RECEIPT');
  return 'receipt';
}
// Invoice-specific field extraction
function extractInvoiceFields(text: string): {
  vendor: FieldCandidate[];
  date: FieldCandidate[];
  amount: FieldCandidate[];
  invoiceNumber: FieldCandidate[];
  customerName: FieldCandidate[];
} {
  const lines = text.split('\n').filter(line => line.trim().length > 0);
  
  console.log('=== INVOICE MODE EXTRACTION ===');
  console.log('TOTAL_LINES:', lines.length);
  console.log('TEXT_PREVIEW:', text.substring(0, 300) + '...');
  
  // Extract vendor/company name (top lines, business keywords)
  const vendor = extractInvoiceVendor(lines);
  
  // Extract invoice number
  const invoiceNumber = extractInvoiceNumber(lines);
  
  // Extract invoice date
  const date = extractInvoiceDate(lines);
  
  // Extract grand total (prefer bottom of document)
  const amount = extractInvoiceTotal(lines);
  
  // Extract customer name
  const customerName = extractCustomerName(lines);
  
  console.log('INVOICE_EXTRACTION_RESULTS:', {
    vendorCount: vendor.length,
    invoiceNumberCount: invoiceNumber.length,
    dateCount: date.length,
    amountCount: amount.length,
    customerCount: customerName.length
  });

  return { vendor, date, amount, invoiceNumber, customerName };
}

// Vendor alias mapping for OCR variants
function normalizeVendorName(vendor: string | null): string | null {
  if (!vendor) return null;

  const vendorAliases: { [key: string]: string } = {
    // TransJam variants
    'TRANSJAM': 'MAY PEN WEST',
    'TRANSAM': 'MAY PEN WEST', 
    'RANSIAM': 'MAY PEN WEST',
    'TRANS JAM': 'MAY PEN WEST',
    'TRANS AM': 'MAY PEN WEST',
    'RANS IAM': 'MAY PEN WEST',
    
    // FESCO variants
    'FESCO': 'FESCO',
    'F E S C O': 'FESCO',
    'F.E.S.C.O': 'FESCO',
    'FES CO': 'FESCO',
    
    // EdgeChem variants
    'EDGECHEM': 'EdgeChem',
    'EDGE CHEM': 'EdgeChem',
    'EDGE CHEMICALS': 'EdgeChem',
    'EDGE-CHEM': 'EdgeChem',
    
    // Common variations
    'MAYPENWEST': 'MAY PEN WEST',
    'MAY PEN': 'MAY PEN WEST',
    'MAYPEN': 'MAY PEN WEST'
  };

  const normalized = vendorAliases[vendor.toUpperCase().trim()];
  if (normalized) {
    console.log('VENDOR_NORMALIZATION:', {
      original: vendor,
      normalized: normalized
    });
    return normalized;
  }

  return vendor;
}

// Extract vendor from invoice (company name at top)
function extractInvoiceVendor(lines: string[]): FieldCandidate[] {
  const candidates: FieldCandidate[] = [];
  const fullText = lines.join('\n').toUpperCase();

  // Rule 4: If text contains EdgeChem anywhere, vendor = EdgeChem immediately
  if (fullText.includes('EDGECHEM')) {
    candidates.push({
      value: 'EdgeChem',
      confidence: 1.0,
      sourceText: 'EdgeChem',
      reason: 'EdgeChem found anywhere in document'
    });
    return candidates;
  }

  // Rule 5: If header contains FESCO, vendor = FESCO
  if (lines.slice(0, 3).some(line => line.toUpperCase().includes('FESCO'))) {
    candidates.push({
      value: 'FESCO',
      confidence: 1.0,
      sourceText: 'FESCO',
      reason: 'FESCO found in header'
    });
    return candidates;
  }

  // Rule 2: Use only top 25% of OCR lines
  const topQuarterIndex = Math.max(1, Math.floor(lines.length * 0.25));
  const topLines = lines.slice(0, topQuarterIndex);

  // Rule 3: Product/item words to reject
  const productWords = [
    'PUTTY', 'PAINT', 'LTR', 'LITRE', 'QTY', 'PCS', 'ITEM', 
    'UNIT', 'PRICE', 'DESCRIPTION', 'DRNITURE', 'FURNITURE'
  ];
  
  for (const line of topLines) {
    let cleanLine = line.trim();
    
    // Remove leading noise words
    cleanLine = cleanLine.replace(/^(INVOICE|TAX INVOICE|AR|A\/R|BILL|RECEIPT)\s+/i, '');
    
    // Rule 7: Never use long noisy lines > 40 chars
    if (cleanLine.length > 40) continue;
    
    // Skip empty lines or lines that become empty after cleaning
    if (!cleanLine) continue;
    
    // Rule 3: Reject lines containing product/item words
    const hasProductWord = productWords.some(word => 
      cleanLine.toUpperCase().includes(word)
    );
    if (hasProductWord) continue;
    
    // Rule 6: Only accept clean header vendor candidates
    if (cleanLine.length > 2 && /^[A-Z]/i.test(cleanLine)) {
      let confidence = 0.5;
      let reason = 'Clean header line';
      
      // Boost confidence for business-like names
      if (cleanLine.match(/^(LLC|INC|CORP|LTD|CO\.|COMPANY|ENTERPRISES|GROUP|ASSOCIATES)$/i)) {
        confidence = 0.8;
        reason = 'Business entity suffix';
      } else if (/^[A-Z][A-Z\s&]+[A-Z]$/i.test(cleanLine) && cleanLine.length > 5) {
        confidence = 0.7;
        reason = 'All caps business name';
      }
      
      candidates.push({
        value: cleanLine,
        confidence,
        sourceText: line,
        reason
      });
    }
  }
  
  // Rule 6: If no clean header vendor found, return empty candidates
  return candidates.sort((a, b) => b.confidence - a.confidence);
}

// Extract invoice number
function extractInvoiceNumber(lines: string[]): FieldCandidate[] {
  const candidates: FieldCandidate[] = [];
  const text = lines.join('\n');
  
  const invoicePatterns = [
    { regex: /(?:INVOICE#?|INV#?|INVOICE\s*NO\.?|BILL#?)(?:\s*:)?\s*([A-Z0-9-]+)/gi, priority: 10, label: 'INVOICE_LABEL' },
    { regex: /(?:INVOICE\s*(?:NUMBER|NO)\.?\s*)([A-Z0-9-]+)/gi, priority: 9, label: 'INVOICE_NUMBER' },
    { regex: /(?:BILL\s*(?:NUMBER|NO)\.?\s*)([A-Z0-9-]+)/gi, priority: 8, label: 'BILL_NUMBER' },
    { regex: /#([A-Z0-9-]{3,})/gi, priority: 5, label: 'HASH_NUMBER' },
    { regex: /\b([A-Z]{2,4}[-\d]{3,})\b/gi, priority: 4, label: 'ALPHA_NUMERIC_CODE' }
  ];
  
  for (const pattern of invoicePatterns) {
    const matches = [...text.matchAll(pattern.regex)];
    
    for (const match of matches) {
      const invoiceNum = match[1] || match[0];
      
      if (invoiceNum.length >= 3 && invoiceNum.length <= 20) {
        candidates.push({
          value: invoiceNum,
          confidence: pattern.priority * 0.1,
          sourceText: match[0],
          reason: pattern.label
        });
      }
    }
  }
  
  return candidates.sort((a, b) => b.confidence - a.confidence);
}

// Extract invoice date
function extractInvoiceDate(lines: string[]): FieldCandidate[] {
  const candidates: FieldCandidate[] = [];
  const text = lines.join('\n');
  
  // Look for dates with invoice context
  const invoiceDatePatterns = [
    { regex: /(?:INVOICE\s*DATE|DATE|BILL\s*DATE)\s*[:\s]*\b(0?[1-9]|[12]\d|3[01])[\/\-](0?[1-9]|1[0-2])[\/\-](20\d{2})\b/gi, priority: 10, label: 'INVOICE_DATE_LABEL' },
    { regex: /(?:DUE\s*DATE|DUE)\s*[:\s]*\b(0?[1-9]|[12]\d|3[01])[\/\-](0?[1-9]|1[0-2])[\/\-](20\d{2})\b/gi, priority: 8, label: 'DUE_DATE' },
    { regex: /\b(0?[1-9]|[12]\d|3[01])[\/\-](0?[1-9]|1[0-2])[\/\-](20\d{2})\b/g, priority: 5, label: 'STANDALONE_DATE' },
    { regex: /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(0?[1-9]|[12]\d|3[01])[\s,]+(20\d{2})\b/gi, priority: 7, label: 'MONTH_DATE_YEAR' }
  ];
  
  for (const pattern of invoiceDatePatterns) {
    const matches = [...text.matchAll(pattern.regex)];
    
    for (const match of matches) {
      const dateStr = match[1] || match[0];
      
      candidates.push({
        value: dateStr,
        confidence: pattern.priority * 0.1,
        sourceText: match[0],
        reason: pattern.label
      });
    }
  }
  
  return candidates.sort((a, b) => b.confidence - a.confidence);
}

// Extract invoice total (prefer grand total at bottom)
function extractInvoiceTotal(lines: string[]): FieldCandidate[] {
  const candidates: FieldCandidate[] = [];
  const text = lines.join('\n');
  
  // Strong patterns for invoice totals - only use labeled totals, no guessing
  const totalPatterns = [
    { regex: /(?:TOTAL\s*DUE|BALANCE\s*DUE|AMOUNT\s*DUE|GRAND\s*TOTAL)\s*[:\s]*\$?([\d,]+\.?\d{2})/gi, priority: 15, label: 'INVOICE_TOTAL_DUE' },
    { regex: /(?:TOTAL|NET\s*TOTAL)\s*[:\s]*\$?([\d,]+\.?\d{2})/gi, priority: 12, label: 'INVOICE_TOTAL' },
    { regex: /\$([\d,]+\.\d{2})\s*(?:TOTAL\s*DUE|BALANCE\s*DUE|AMOUNT\s*DUE|GRAND\s*TOTAL)/gi, priority: 11, label: 'INVOICE_MONEY_WITH_TOTAL_DUE' },
    { regex: /\$([\d,]+\.\d{2})\s*(?:TOTAL|DUE|BALANCE)/gi, priority: 10, label: 'INVOICE_MONEY_WITH_TOTAL' }
  ];
  
  // First pass: look for grand total patterns
  for (const pattern of totalPatterns) {
    const matches = [...text.matchAll(pattern.regex)];
    
    for (const match of matches) {
      const amount = match[1];
      const numericAmount = parseFloat(amount.replace(/,/g, ''));
      
      if (numericAmount > 0 && numericAmount < 100000) {
        // Calculate line position for bottom preference (stronger for invoices)
        const lineIndex = lines.findIndex(line => line.includes(match[0]));
        const positionRatio = lineIndex / lines.length;
        const bottomBonus = positionRatio > 0.6 ? 0.3 : 0; // Stronger bottom preference for invoices
        
        // Skip obvious line items (lines with qty, unit price, or item descriptions)
        const lineText = lines[lineIndex] || '';
        const isLineItem = lineText.match(/(?:QTY|ITEM|DESCRIPTION|UNIT\s*PRICE|RATE|HOURS|DAYS|AMOUNT\s*\/|PER\s*(HOUR|DAY|ITEM))/i);
        
        if (!isLineItem) {
          candidates.push({
            value: amount,
            confidence: (pattern.priority * 0.1) + bottomBonus,
            sourceText: match[0],
            reason: pattern.label + (positionRatio > 0.6 ? ' (bottom)' : '')
          });
        }
      }
    }
  }
  
  // Line items and quantities are ignored for invoice mode as requested
  // Only use labeled total amounts for invoice extraction
  
  return candidates.sort((a, b) => b.confidence - a.confidence);
}

// Extract customer name
function extractCustomerName(lines: string[]): FieldCandidate[] {
  const candidates: FieldCandidate[] = [];
  
  // Look for "Bill To" section
  const billToIndex = lines.findIndex(line => 
    line.match(/BILL\s*TO|CUSTOMER|CLIENT/i)
  );
  
  if (billToIndex !== -1) {
    // Check next few lines for customer name
    for (let i = 1; i <= 3; i++) {
      const nextLine = lines[billToIndex + i];
      if (nextLine && nextLine.trim().length > 2) {
        const line = nextLine.trim();
        
        // Skip if it looks like an address or phone
        if (!line.match(/\d{3,}|Street|St|Avenue|Ave|Road|Rd|Phone|Tel/i)) {
          candidates.push({
            value: line,
            confidence: 0.8,
            sourceText: line,
            reason: 'BILL_TO_SECTION'
          });
        }
      }
    }
  }
  
  return candidates.sort((a, b) => b.confidence - a.confidence);
}

// Create OCR variants based on processing mode
async function createOCRVariantsOptimized(scannerFile: File, mode: 'fast' | 'deep'): Promise<{ file: File; name: string }[]> {
  console.log('=== CREATING OCR VARIANTS ===');
  console.log('MODE:', mode);
  console.log('INPUT:', {
    name: scannerFile.name,
    size: scannerFile.size,
    type: scannerFile.type
  });

  const variants: { file: File; name: string }[] = [];
  
  if (mode === 'fast') {
    // Fast mode: single optimized variant
    console.log('FAST_MODE: Creating single optimized variant');
    try {
      const optimizedFile = await createOptimizedGrayscaleVariant(scannerFile);
      variants.push({ file: optimizedFile, name: 'fast_optimized' });
    } catch (error) {
      console.warn('Failed to create fast variant:', error);
    }
  } else {
    // Deep mode: 3 variants for difficult receipts
    console.log('DEEP_MODE: Creating 3 variants for difficult receipt');
    
    // 1. Grayscale enhanced variant
    try {
      const grayscaleFile = await createGrayscaleEnhancedVariant(scannerFile);
      variants.push({ file: grayscaleFile, name: 'grayscale_enhanced' });
    } catch (error) {
      console.warn('Failed to create grayscale enhanced variant:', error);
    }
    
    // 2. Black-white threshold variant
    try {
      const thresholdFile = await createBlackWhiteThresholdVariant(scannerFile);
      variants.push({ file: thresholdFile, name: 'black_white_threshold' });
    } catch (error) {
      console.warn('Failed to create black-white threshold variant:', error);
    }
    
    // 3. Sharpened grayscale variant
    try {
      const sharpenedFile = await createSharpenedGrayscaleVariant(scannerFile);
      variants.push({ file: sharpenedFile, name: 'sharpened_grayscale' });
    } catch (error) {
      console.warn('Failed to create sharpened grayscale variant:', error);
    }
  }
  
  console.log('OCR_VARIANTS_CREATED:', {
    mode,
    totalVariants: variants.length,
    variantNames: variants.map(v => v.name)
  });
  
  return variants;
}

// Fast optimized variant for quick processing
async function createOptimizedGrayscaleVariant(file: File): Promise<File> {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      reject(new Error('Could not get canvas context'));
      return;
    }

    const img = new Image();
    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      
      // Draw original image
      ctx.drawImage(img, 0, 0);
      
      // Get image data and apply fast grayscale + contrast
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;
      
      for (let i = 0; i < data.length; i += 4) {
        // Fast grayscale with green emphasis
        const gray = data[i] * 0.3 + data[i + 1] * 0.6 + data[i + 2] * 0.1;
        
        // Fast contrast boost
        const enhanced = Math.min(255, Math.max(0, (gray - 128) * 1.4 + 128));
        
        data[i] = enhanced;
        data[i + 1] = enhanced;
        data[i + 2] = enhanced;
      }
      
      ctx.putImageData(imageData, 0, 0);
      
      canvas.toBlob((blob) => {
        if (blob) {
          const optimizedFile = new File([blob], `fast_optimized_${file.name}`, {
            type: 'image/jpeg',
            lastModified: Date.now()
          });
          resolve(optimizedFile);
        } else {
          reject(new Error('Failed to create optimized variant'));
        }
      }, 'image/jpeg', 0.9); // Higher quality for OCR
    };
    
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = URL.createObjectURL(file);
  });
}

// Create grayscale enhanced variant
async function createGrayscaleEnhancedVariant(file: File): Promise<File> {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      reject(new Error('Could not get canvas context'));
      return;
    }

    const img = new Image();
    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      
      // Draw original image
      ctx.drawImage(img, 0, 0);
      
      // Get image data and apply enhanced grayscale
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;
      
      for (let i = 0; i < data.length; i += 4) {
        // Enhanced grayscale with blue channel emphasis for better text contrast
        const gray = data[i] * 0.2 + data[i + 1] * 0.5 + data[i + 2] * 0.3;
        
        // Apply contrast enhancement
        const enhanced = Math.min(255, Math.max(0, (gray - 128) * 1.3 + 128));
        
        data[i] = enhanced;
        data[i + 1] = enhanced;
        data[i + 2] = enhanced;
      }
      
      ctx.putImageData(imageData, 0, 0);
      
      canvas.toBlob((blob) => {
        if (blob) {
          const enhancedFile = new File([blob], `grayscale_enhanced_${file.name}`, {
            type: 'image/jpeg',
            lastModified: Date.now()
          });
          resolve(enhancedFile);
        } else {
          reject(new Error('Failed to create grayscale enhanced variant'));
        }
      }, 'image/jpeg', 0.95);
    };
    
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = URL.createObjectURL(file);
  });
}

// Create black-white threshold variant
async function createBlackWhiteThresholdVariant(file: File): Promise<File> {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      reject(new Error('Could not get canvas context'));
      return;
    }

    const img = new Image();
    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      
      // Draw original image
      ctx.drawImage(img, 0, 0);
      
      // Get image data and apply black-white threshold
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;
      
      // Calculate optimal threshold using Otsu's method approximation
      let totalBrightness = 0;
      for (let i = 0; i < data.length; i += 4) {
        const brightness = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
        totalBrightness += brightness;
      }
      const avgBrightness = totalBrightness / (data.length / 4);
      const threshold = avgBrightness * 0.8; // 80% of average brightness
      
      for (let i = 0; i < data.length; i += 4) {
        const brightness = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
        const binary = brightness > threshold ? 255 : 0;
        
        data[i] = binary;
        data[i + 1] = binary;
        data[i + 2] = binary;
      }
      
      ctx.putImageData(imageData, 0, 0);
      
      canvas.toBlob((blob) => {
        if (blob) {
          const thresholdFile = new File([blob], `black_white_threshold_${file.name}`, {
            type: 'image/jpeg',
            lastModified: Date.now()
          });
          resolve(thresholdFile);
        } else {
          reject(new Error('Failed to create black-white threshold variant'));
        }
      }, 'image/jpeg', 0.95);
    };
    
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = URL.createObjectURL(file);
  });
}

// Create sharpened grayscale variant
async function createSharpenedGrayscaleVariant(file: File): Promise<File> {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      reject(new Error('Could not get canvas context'));
      return;
    }

    const img = new Image();
    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      
      // Draw original image
      ctx.drawImage(img, 0, 0);
      
      // Get image data and apply grayscale + sharpening
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;
      const tempData = new Uint8ClampedArray(data);
      
      // Convert to grayscale first
      for (let i = 0; i < data.length; i += 4) {
        const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
        tempData[i] = gray;
        tempData[i + 1] = gray;
        tempData[i + 2] = gray;
      }
      
      // Apply sharpening kernel
      const sharpenKernel = [
        0, -1, 0,
        -1, 5, -1,
        0, -1, 0
      ];
      
      for (let i = 0; i < data.length; i += 4) {
        const pixelIndex = i / 4;
        const x = pixelIndex % canvas.width;
        const y = Math.floor(pixelIndex / canvas.width);
        
        let sharpened = tempData[i]; // Default to original
        
        if (x > 0 && x < canvas.width - 1 && y > 0 && y < canvas.height - 1) {
          let sharpenSum = 0;
          for (let ky = -1; ky <= 1; ky++) {
            for (let kx = -1; kx <= 1; kx++) {
              const neighborIndex = ((y + ky) * canvas.width + (x + kx)) * 4;
              const kernelIndex = (ky + 1) * 3 + (kx + 1);
              sharpenSum += tempData[neighborIndex] * sharpenKernel[kernelIndex];
            }
          }
          sharpened = Math.min(255, Math.max(0, sharpenSum));
        }
        
        data[i] = sharpened;
        data[i + 1] = sharpened;
        data[i + 2] = sharpened;
      }
      
      ctx.putImageData(imageData, 0, 0);
      
      canvas.toBlob((blob) => {
        if (blob) {
          const sharpenedFile = new File([blob], `sharpened_grayscale_${file.name}`, {
            type: 'image/jpeg',
            lastModified: Date.now()
          });
          resolve(sharpenedFile);
        } else {
          reject(new Error('Failed to create sharpened grayscale variant'));
        }
      }, 'image/jpeg', 0.95);
    };
    
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = URL.createObjectURL(file);
  });
}

// Create enhanced grayscale variant
async function createEnhancedGrayscaleVariant(file: File): Promise<File> {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      reject(new Error('Could not get canvas context'));
      return;
    }

    const img = new Image();
    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      
      // Draw original image
      ctx.drawImage(img, 0, 0);
      
      // Get image data and apply enhanced grayscale
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;
      
      for (let i = 0; i < data.length; i += 4) {
        // Enhanced grayscale with blue channel emphasis for better text contrast
        const gray = data[i] * 0.2 + data[i + 1] * 0.5 + data[i + 2] * 0.3;
        
        // Apply slight contrast enhancement
        const enhanced = Math.min(255, Math.max(0, (gray - 128) * 1.2 + 128));
        
        data[i] = enhanced;
        data[i + 1] = enhanced;
        data[i + 2] = enhanced;
      }
      
      ctx.putImageData(imageData, 0, 0);
      
      canvas.toBlob((blob) => {
        if (blob) {
          const enhancedFile = new File([blob], `enhanced_grayscale_${file.name}`, {
            type: 'image/jpeg',
            lastModified: Date.now()
          });
          resolve(enhancedFile);
        } else {
          reject(new Error('Failed to create enhanced grayscale variant'));
        }
      }, 'image/jpeg', 0.95);
    };
    
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = URL.createObjectURL(file);
  });
}

// Create high contrast threshold variant
async function createHighContrastThresholdVariant(file: File): Promise<File> {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      reject(new Error('Could not get canvas context'));
      return;
    }

    const img = new Image();
    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      
      // Draw original image
      ctx.drawImage(img, 0, 0);
      
      // Get image data and apply high contrast threshold
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;
      
      // Calculate local threshold
      let totalBrightness = 0;
      for (let i = 0; i < data.length; i += 4) {
        const brightness = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
        totalBrightness += brightness;
      }
      const avgBrightness = totalBrightness / (data.length / 4);
      const threshold = avgBrightness * 0.85; // 85% of average brightness
      
      for (let i = 0; i < data.length; i += 4) {
        const brightness = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
        const binary = brightness > threshold ? 255 : 0;
        
        data[i] = binary;
        data[i + 1] = binary;
        data[i + 2] = binary;
      }
      
      ctx.putImageData(imageData, 0, 0);
      
      canvas.toBlob((blob) => {
        if (blob) {
          const thresholdFile = new File([blob], `threshold_${file.name}`, {
            type: 'image/jpeg',
            lastModified: Date.now()
          });
          resolve(thresholdFile);
        } else {
          reject(new Error('Failed to create threshold variant'));
        }
      }, 'image/jpeg', 0.95);
    };
    
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = URL.createObjectURL(file);
  });
}

// Create sharpened variant
async function createSharpenedVariant(file: File): Promise<File> {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      reject(new Error('Could not get canvas context'));
      return;
    }

    const img = new Image();
    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      
      // Draw original image
      ctx.drawImage(img, 0, 0);
      
      // Get image data and apply sharpening
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;
      const tempData = new Uint8ClampedArray(data);
      
      // Sharpening kernel
      const sharpenKernel = [
        0, -1, 0,
        -1, 5, -1,
        0, -1, 0
      ];
      
      for (let i = 0; i < data.length; i += 4) {
        const pixelIndex = i / 4;
        const x = pixelIndex % canvas.width;
        const y = Math.floor(pixelIndex / canvas.width);
        
        let sharpened = data[i]; // Default to original
        
        if (x > 0 && x < canvas.width - 1 && y > 0 && y < canvas.height - 1) {
          let sharpenSum = 0;
          for (let ky = -1; ky <= 1; ky++) {
            for (let kx = -1; kx <= 1; kx++) {
              const neighborIndex = ((y + ky) * canvas.width + (x + kx)) * 4;
              const kernelIndex = (ky + 1) * 3 + (kx + 1);
              sharpenSum += tempData[neighborIndex] * sharpenKernel[kernelIndex];
            }
          }
          sharpened = Math.min(255, Math.max(0, sharpenSum));
        }
        
        data[i] = sharpened;
        data[i + 1] = sharpened;
        data[i + 2] = sharpened;
      }
      
      ctx.putImageData(imageData, 0, 0);
      
      canvas.toBlob((blob) => {
        if (blob) {
          const sharpenedFile = new File([blob], `sharpened_${file.name}`, {
            type: 'image/jpeg',
            lastModified: Date.now()
          });
          resolve(sharpenedFile);
        } else {
          reject(new Error('Failed to create sharpened variant'));
        }
      }, 'image/jpeg', 0.95);
    };
    
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = URL.createObjectURL(file);
  });
}

// Create adaptive threshold variant
async function createAdaptiveThresholdVariant(file: File): Promise<File> {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      reject(new Error('Could not get canvas context'));
      return;
    }

    const img = new Image();
    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      
      // Draw original image
      ctx.drawImage(img, 0, 0);
      
      // Get image data and apply adaptive threshold
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;
      
      // Apply adaptive threshold using local neighborhoods
      const windowSize = 15; // 15x15 window for local threshold
      const halfWindow = Math.floor(windowSize / 2);
      
      for (let y = 0; y < canvas.height; y++) {
        for (let x = 0; x < canvas.width; x++) {
          const centerIdx = (y * canvas.width + x) * 4;
          
          // Calculate local threshold
          let localSum = 0;
          let localCount = 0;
          
          for (let wy = -halfWindow; wy <= halfWindow; wy++) {
            for (let wx = -halfWindow; wx <= halfWindow; wx++) {
              const ny = y + wy;
              const nx = x + wx;
              
              if (ny >= 0 && ny < canvas.height && nx >= 0 && nx < canvas.width) {
                const neighborIdx = (ny * canvas.width + nx) * 4;
                const brightness = data[neighborIdx] * 0.299 + data[neighborIdx + 1] * 0.587 + data[neighborIdx + 2] * 0.114;
                localSum += brightness;
                localCount++;
              }
            }
          }
          
          const localThreshold = (localSum / localCount) * 0.9; // 90% of local average
          const centerBrightness = data[centerIdx] * 0.299 + data[centerIdx + 1] * 0.587 + data[centerIdx + 2] * 0.114;
          const binary = centerBrightness > localThreshold ? 255 : 0;
          
          data[centerIdx] = binary;
          data[centerIdx + 1] = binary;
          data[centerIdx + 2] = binary;
        }
      }
      
      ctx.putImageData(imageData, 0, 0);
      
      canvas.toBlob((blob) => {
        if (blob) {
          const adaptiveFile = new File([blob], `adaptive_threshold_${file.name}`, {
            type: 'image/jpeg',
            lastModified: Date.now()
          });
          resolve(adaptiveFile);
        } else {
          reject(new Error('Failed to create adaptive threshold variant'));
        }
      }, 'image/jpeg', 0.95);
    };
    
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = URL.createObjectURL(file);
  });
}
// Multi-pass OCR engine with fast/deep mode optimization
async function performMultiPassOCR(file: File, mode: 'fast' | 'deep' = 'fast'): Promise<OCRPassResult[]> {
  console.log('=== MULTI-PASS OCR ENGINE START ===');
  console.log('MODE:', mode);
  console.log('INPUT_FILE_INFO:', {
    name: file.name,
    size: file.size,
    type: file.type
  });
  
  // Step 1: Create optimized OCR variants based on mode
  const ocrVariants = await createOCRVariantsOptimized(file, mode);
  console.log('OCR_VARIANTS_TO_PROCESS:', ocrVariants.length);
  console.log('OCR_VARIANT_NAMES:', ocrVariants.map((v: { name: string }) => v.name));
  
  const worker = await createWorker('eng');
  
  try {
    const results: OCRPassResult[] = [];
    
    for (const variant of ocrVariants) {
      console.log(`--- OCR PASS: ${variant.name} ---`);
      
      const imageDataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(variant.file);
      });
      
      const startTime = Date.now();
      const { data: { text, confidence } } = await worker.recognize(imageDataUrl);
      const processingTime = Date.now() - startTime;
      
      console.log(`OCR_PROCESSING_TIME: ${processingTime}ms`);
      console.log(`OCR_RAW_TEXT_LENGTH: ${text.length}`);
      console.log(`OCR_CONFIDENCE: ${confidence}`);
      
      if (text.length > 0) {
        console.log(`OCR_TEXT_PREVIEW: ${text.substring(0, 200)}${text.length > 200 ? '...' : ''}`);
      }
      
      // Calculate readability score
      const readabilityScore = calculateReadabilityScore(text);
      console.log(`READABILITY_SCORE: ${readabilityScore.toFixed(2)}`);
      
      // Score the OCR pass using readability as primary factor
      const scoreDetails = scoreOCRPass(text, confidence);
      const overallScore = calculateReadabilityBasedScore(readabilityScore, confidence, scoreDetails);
      
      const result: OCRPassResult = {
        passName: variant.name,
        text,
        confidence,
        score: overallScore,
        scoreDetails
      };
      
      results.push(result);
      
      console.log(`PASS_RESULT:`, {
        passName: variant.name,
        confidence,
        overallScore,
        readabilityScore: readabilityScore.toFixed(2),
        textLength: text.length,
        processingTime: `${processingTime}ms`,
        scoreDetails: {
          readableWordRatio: scoreDetails.readableWordRatio.toFixed(3),
          keywordCount: scoreDetails.keywordCount,
          validMoneyCount: scoreDetails.validMoneyCount,
          validDateCount: scoreDetails.validDateCount,
          vendorCandidateCount: scoreDetails.vendorCandidateCount,
          garbagePenalty: scoreDetails.garbagePenalty.toFixed(3)
        }
      });
    }
    
    // Sort by score (highest first)
    results.sort((a, b) => b.score - a.score);
    
    console.log('=== MULTI-PASS OCR RESULTS ===');
    console.log('SELECTED_PASS:', {
      passName: results[0]?.passName || 'NONE',
      score: results[0]?.score || 0,
      confidence: results[0]?.confidence || 0,
      textLength: results[0]?.text.length || 0,
      mode
    });
    
    console.log('ALL_VARIANT_CONFIDENCES:', results.map(r => ({
      variant: r.passName,
      confidence: r.confidence,
      score: r.score.toFixed(2)
    })));
    
    return results;
    
  } finally {
    await worker.terminate();
  }
}

// Calculate readability score for OCR text
function calculateReadabilityScore(text: string): number {
  if (!text || text.trim().length === 0) return 0;
  
  const words = text.trim().split(/\s+/).filter(word => word.length > 0);
  if (words.length === 0) return 0;
  
  let readableWords = 0;
  let totalWordScore = 0;
  
  for (const word of words) {
    let wordScore = 0;
    
    // Check if word contains only letters (basic readability)
    if (/^[a-zA-Z]+$/.test(word)) {
      wordScore += 1;
    }
    
    // Check if word is reasonably sized (3-20 characters)
    if (word.length >= 3 && word.length <= 20) {
      wordScore += 1;
    }
    
    // Check if word starts with capital letter (proper nouns, sentence starts)
    if (/^[A-Z]/.test(word)) {
      wordScore += 0.5;
    }
    
    // Check if word contains common receipt keywords
    const receiptKeywords = ['total', 'amount', 'cash', 'credit', 'debit', 'sale', 'tax', 'subtotal', 'balance', 'due', 'paid', 'invoice', 'receipt', 'order', 'item', 'price', 'cost', 'fee', 'charge'];
    if (receiptKeywords.some((keyword: string) => word.toLowerCase().includes(keyword))) {
      wordScore += 2;
    }
    
    // Check if word is a number or monetary value
    if (/^\$?\d+[,.]?\d*$/.test(word)) {
      wordScore += 1.5;
    }
    
    // Check if word contains date patterns
    if (/\d{1,2}[\/-]\d{1,2}[\/-]?\d{2,4}?/.test(word) || /(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/i.test(word)) {
      wordScore += 1.5;
    }
    
    // Penalize very short or very long words
    if (word.length < 2) wordScore -= 0.5;
    if (word.length > 25) wordScore -= 0.5;
    
    // Penalize words with many special characters
    const specialCharCount = (word.match(/[^a-zA-Z0-9\s$.,]/g) || []).length;
    if (specialCharCount > 2) wordScore -= specialCharCount * 0.3;
    
    // Penalize words with repeated characters (indicative of OCR errors)
    if (/(.)\1{3,}/.test(word)) wordScore -= 1;
    
    totalWordScore += Math.max(0, wordScore);
    if (wordScore > 0) readableWords++;
  }
  
  // Calculate base readability ratio
  const readabilityRatio = readableWords / words.length;
  
  // Calculate average word score
  const avgWordScore = totalWordScore / words.length;
  
  // Bonus for having a good mix of word types
  const hasNumbers = words.some(word => /^\$?\d/.test(word));
  const hasDates = words.some(word => /\d{1,2}[\/-]\d{1,2}/.test(word) || /(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/i.test(word));
  const keywords = ['total', 'amount', 'cash', 'credit', 'debit', 'sale', 'tax', 'subtotal', 'balance', 'due', 'paid', 'invoice', 'receipt', 'order', 'item', 'price', 'cost', 'fee', 'charge'];
  const hasKeywords = words.some(word => keywords.some((keyword: string) => word.toLowerCase().includes(keyword)));
  
  let contentBonus = 0;
  if (hasNumbers) contentBonus += 0.1;
  if (hasDates) contentBonus += 0.1;
  if (hasKeywords) contentBonus += 0.15;
  
  // Final readability score (0-100 scale)
  const finalScore = Math.min(100, (readabilityRatio * 40) + (avgWordScore * 20) + (contentBonus * 30));
  
  return finalScore;
}

// Calculate OCR pass score based primarily on readability
function calculateReadabilityBasedScore(readabilityScore: number, confidence: number, scoreDetails: {
  readableWordRatio: number;
  keywordCount: number;
  validMoneyCount: number;
  validDateCount: number;
  vendorCandidateCount: number;
  garbagePenalty: number;
}): number {
  // Readability is the primary factor (60% weight)
  const readabilityWeight = 0.6;
  // OCR confidence is secondary (25% weight)
  const confidenceWeight = 0.25;
  // Traditional scoring factors are tertiary (15% weight)
  const traditionalWeight = 0.15;
  
  const readabilityComponent = readabilityScore * readabilityWeight;
  const confidenceComponent = confidence * confidenceWeight;
  
  // Calculate traditional component
  const traditionalComponent = (
    scoreDetails.readableWordRatio * 20 +
    Math.min(scoreDetails.keywordCount * 2, 10) +
    Math.min(scoreDetails.validMoneyCount * 3, 15) +
    Math.min(scoreDetails.validDateCount * 2, 10) +
    Math.min(scoreDetails.vendorCandidateCount * 1, 5) -
    Math.abs(scoreDetails.garbagePenalty) * 10
  ) * traditionalWeight;
  
  return readabilityComponent + confidenceComponent + traditionalComponent;
}

// Extract all fields from OCR text with document type detection
function extractAllFields(text: string): ExtractedFields {
  // Detect document type first
  const documentType = detectDocumentType(text);
  
  console.log('=== FIELD EXTRACTION START ===');
  console.log('DOCUMENT_TYPE:', documentType);
  
  if (documentType === 'invoice') {
    // Use invoice-specific extraction
    const invoiceFields = extractInvoiceFields(text);
    
    // Convert invoice fields to standard format
    return {
      vendor: invoiceFields.vendor,
      date: invoiceFields.date,
      amount: invoiceFields.amount,
      tax: [], // TODO: Implement tax extraction for invoices
      receiptNumber: invoiceFields.invoiceNumber, // Map invoiceNumber to receiptNumber
      invoiceNumber: invoiceFields.invoiceNumber, // Keep invoice-specific field
      customerName: invoiceFields.customerName, // Add customer field
      documentType // Add document type for debug panel
    };
  } else {
    // Use receipt extraction (existing logic)
    return {
      vendor: extractVendorCandidates(text),
      date: extractDateCandidates(text),
      amount: extractAmountCandidates(text),
      tax: [], // TODO: Implement tax extraction
      receiptNumber: [], // TODO: Implement receipt number extraction
      documentType // Add document type for debug panel
    };
  }
}

// Select best OCR result and extract fields with mode awareness
async function processReceiptOCR(file: File, mode: 'fast' | 'deep' = 'fast'): Promise<{
  fields: ExtractedFields;
  selectedPass: OCRPassResult;
  allPasses: OCRPassResult[];
}> {
  const allPasses = await performMultiPassOCR(file, mode);
  
  if (allPasses.length === 0) {
    throw new Error('All OCR passes failed');
  }
  
  const selectedPass = allPasses[0];
  const fields = extractAllFields(selectedPass.text);
  
  console.log('OCR_PROCESSING_COMPLETE:', {
    mode,
    selectedPass: selectedPass.passName,
    confidence: selectedPass.confidence,
    score: selectedPass.score,
    textLength: selectedPass.text.length,
    extractedFields: {
      vendorCount: fields.vendor.length,
      dateCount: fields.date.length,
      amountCount: fields.amount.length
    }
  });
  
  return {
    fields,
    selectedPass,
    allPasses
  };
}

// Final acceptance logic
function shouldAcceptResult(fields: ExtractedFields, selectedPass: OCRPassResult): {
  accept: boolean;
  confidence: number;
  requiresManualEntry: boolean;
} {
  const hasVendor = fields.vendor.length > 0;
  const hasDate = fields.date.length > 0;
  const hasAmount = fields.amount.length > 0;
  const hasReadableText = selectedPass.text.length > 50;
  const hasKeywords = selectedPass.scoreDetails.keywordCount > 2;
  
  console.log('=== ACCEPTANCE LOGIC ===');
  console.log('FIELD PRESENCE:', { hasVendor, hasDate, hasAmount });
  console.log('TEXT QUALITY:', { hasReadableText, hasKeywords });
  
  // Accept if amount + date found
  if (hasAmount && hasDate) {
    console.log('ACCEPTED: Amount + Date found');
    return {
      accept: true,
      confidence: 0.8,
      requiresManualEntry: false
    };
  }
  
  // Accept if amount + vendor found
  if (hasAmount && hasVendor) {
    console.log('ACCEPTED: Amount + Vendor found');
    return {
      accept: true,
      confidence: 0.7,
      requiresManualEntry: false
    };
  }
  
  // Accept if vendor + date found
  if (hasVendor && hasDate) {
    console.log('ACCEPTED: Vendor + Date found');
    return {
      accept: true,
      confidence: 0.6,
      requiresManualEntry: false
    };
  }
  
  // Accept if amount found plus readable receipt keywords
  if (hasAmount && hasKeywords) {
    console.log('ACCEPTED: Amount + Keywords found');
    return {
      accept: true,
      confidence: 0.5,
      requiresManualEntry: false
    };
  }
  
  // Low confidence acceptance for single field with good text
  if ((hasAmount || hasDate || hasVendor) && hasReadableText) {
    console.log('ACCEPTED: Single field + readable text');
    return {
      accept: true,
      confidence: 0.4,
      requiresManualEntry: false
    };
  }
  
  // Only reject when all fields are missing or OCR is mostly garbage
  if (!hasVendor && !hasDate && !hasAmount && !hasReadableText) {
    console.log('REJECTED: No fields and no readable text');
    return {
      accept: false,
      confidence: 0.1,
      requiresManualEntry: true
    };
  }
  
  console.log('REJECTED: Insufficient data');
  return {
    accept: false,
    confidence: 0.2,
    requiresManualEntry: true
  };
}

// Main OCR function with mode support
export async function performOCR(file: File, mode: 'fast' | 'deep' = 'fast'): Promise<OCRResult | null> {
  try {
    const { fields, selectedPass, allPasses } = await processReceiptOCR(file, mode);
    const acceptance = shouldAcceptResult(fields, selectedPass);
    
    if (!acceptance.accept) {
      return {
        vendor: null,
        date: null,
        amount: null,
        tax: null,
        receiptNumber: null,
        rawText: selectedPass.text,
        confidence: acceptance.confidence,
        requiresManualEntry: acceptance.requiresManualEntry,
        debugInfo: {
          selectedPass: selectedPass.passName,
          topPasses: allPasses.slice(0, 3).map(p => ({
            passName: p.passName,
            score: p.score,
            confidence: p.confidence
          })),
          candidates: {
            vendor: fields.vendor.slice(0, 3).map(v => ({
              value: v.value as string,
              sourceText: v.sourceText,
              confidence: v.confidence,
              reason: v.reason
            })),
            date: fields.date.slice(0, 3).map(d => ({
              value: d.value as string,
              sourceText: d.sourceText,
              confidence: d.confidence,
              reason: d.reason
            })),
            amount: fields.amount.slice(0, 3).map(a => ({
              value: a.value as number,
              sourceText: a.sourceText,
              confidence: a.confidence,
              reason: a.reason
            }))
          },
          documentType: fields.documentType,
          rejectionReasons: ['Insufficient data extracted']
        }
      };
    }
    
    // Select best candidates
    const bestVendor = fields.vendor[0]?.value as string || null;
    const bestDate = fields.date[0]?.value as string || null;
    const bestAmount = fields.amount[0]?.value as number || null;
    const bestInvoiceNumber = fields.invoiceNumber?.[0]?.value as string || null;
    const bestCustomerName = fields.customerName?.[0]?.value as string || null;
    const bestReceiptNumber = fields.receiptNumber[0]?.value as string || null;
    
    console.log('=== FINAL SELECTED FIELDS ===');
    console.log('DOCUMENT_TYPE:', fields.documentType);
    console.log('VENDOR:', bestVendor);
    console.log('DATE:', bestDate);
    console.log('AMOUNT:', bestAmount);
    console.log('INVOICE_NUMBER:', bestInvoiceNumber);
    console.log('CUSTOMER_NAME:', bestCustomerName);
    console.log('RECEIPT_NUMBER:', bestReceiptNumber);
    
    return {
      vendor: bestVendor,
      date: bestDate,
      amount: bestAmount,
      tax: null,
      receiptNumber: bestReceiptNumber,
      invoiceNumber: bestInvoiceNumber,
      customerName: bestCustomerName,
      documentType: fields.documentType,
      rawText: selectedPass.text,
      confidence: acceptance.confidence,
      mode: mode,
      requiresManualEntry: acceptance.requiresManualEntry,
      debugInfo: {
        selectedPass: selectedPass.passName,
        topPasses: allPasses.slice(0, 3).map(p => ({
          passName: p.passName,
          score: p.score,
          confidence: p.confidence
        })),
        candidates: {
          vendor: fields.vendor.slice(0, 3).map(v => ({
            value: v.value as string,
            sourceText: v.sourceText,
            confidence: v.confidence,
            reason: v.reason
          })),
          date: fields.date.slice(0, 3).map(d => ({
            value: d.value as string,
            sourceText: d.sourceText,
            confidence: d.confidence,
            reason: d.reason
          })),
          amount: fields.amount.slice(0, 3).map(a => ({
            value: a.value as number,
            sourceText: a.sourceText,
            confidence: a.confidence,
            reason: a.reason
          }))
        },
        documentType: fields.documentType
      }
    };
    
  } catch (error) {
    console.error('Multi-pass OCR failed:', error);
    return null;
  }
}

// Legacy function for backward compatibility
export async function uploadReceipt(
  file: File,
  companyId: string,
  userId: string
): Promise<ReceiptUploadResult> {
  console.log('=== OCR PIPELINE: UPLOAD RECEIPT START ===');
  
  const ocrResult = await performOCR(file);
  
  if (!ocrResult) {
    throw new Error('OCR processing failed');
  }
  
  // Generate unique receipt ID
  const receiptId = `receipt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  // TODO: Implement actual file upload to Supabase
  // For now, return mock result
  return {
    success: true,
    ocrResult,
    receiptId
  };
}

// Export types for external use
export type { OCRPassResult, FieldCandidate, ExtractedFields };

// Legacy functions for backward compatibility
export async function linkReceiptToExpense(receiptId: string, expenseId: string): Promise<void> {
  // TODO: Implement linking logic
  console.log('Linking receipt to expense:', receiptId, expenseId);
}

interface ExpenseReceipt {
  id: string;
  storage_path: string;
}

export async function getExpenseReceipts(expenseId: string): Promise<ExpenseReceipt[]> {
  // TODO: Implement getting expense receipts
  return [];
}

export async function getReceiptUrl(receiptId: string): Promise<string> {
  // TODO: Implement getting receipt URL
  return '';
}
