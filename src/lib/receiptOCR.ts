import { createWorker } from 'tesseract.js';
import { supabase } from './supabase';
import { classifyDocument, shouldUseInvoiceScanner, type DocumentType, type ClassificationResult } from './documentClassifier';
import { createInvoiceProcessedImage } from '../utils/imageUtils';
import { InvoiceScanner, type InvoiceScanResult } from '../services/invoiceScanner/InvoiceScanner';
import { OCRScorer, type ScoredResult } from '../services/invoiceScanner/OCRScorer';

export type ScanType = 'auto' | 'receipt' | 'invoice';

export interface OCRResult {
  vendor: string | null;
  date: string | null;
  amount: number | null;
  tax: number | null;
  receiptNumber: string | null;
  invoiceNumber?: string | null;
  customerName?: string | null;
  documentType?: string;
  documentTypeConfidence?: number;
  classificationReasoning?: string;
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
    scoringBreakdown?: {
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
    };
    autoDetectWinner?: string;
    autoDetectReasoning?: string;
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
  classification?: ClassificationResult;
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

// Enhanced document type detection using classifier
function detectDocumentTypeWithClassifier(text: string): ClassificationResult {
  console.log('=== DOCUMENT CLASSIFICATION START ===');
  console.log('TEXT_LENGTH:', text.length);
  console.log('TEXT_PREVIEW:', text.substring(0, 200) + (text.length > 200 ? '...' : ''));
  
  const classification = classifyDocument(text);
  
  console.log('CLASSIFICATION_RESULT:', {
    documentType: classification.documentType,
    confidence: classification.confidence,
    topScore: classification.scores[classification.documentType],
    reasoning: classification.reasoning,
    topKeywords: classification.topKeywords.slice(0, 5).map(kw => ({
      keyword: kw.keyword,
      weight: kw.weight,
      type: kw.type
    }))
  });
  
  return classification;
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

  // Auto-learned vendor aliases (persistent storage would be ideal)
  const learnedAliases: { [key: string]: string } = {};

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

// Extract invoice date (top-right area only)
function extractInvoiceDate(lines: string[]): FieldCandidate[] {
  const candidates: FieldCandidate[] = [];
  
  // Zone-based search: top 40% of lines for date area
  const topEndIndex = Math.ceil(lines.length * 0.4); // Top 40%
  const topLines = lines.slice(0, topEndIndex);
  
  console.log('INVOICE_DATE_ZONE_SEARCH:', {
    totalLines: lines.length,
    topEndIndex,
    topLines: topLines.length,
    zoneText: topLines.slice(0, 3).join(' | ') // Show first 3 lines for debug
  });
  
  // Date labels to search for in top-right area (with fuzzy tolerance)
  const dateLabels = [
    'INVOICE DATE',
    'DATE'
  ];
  
  // Fuzzy date label patterns for OCR variants
  const fuzzyDatePatterns = [
    /D[AE]T[AE]/gi, // DATE, DATF, D4TE
    /D[AE]TF/gi, // DATF variants
    /D4T[AE]/gi, // D4TE variants
    /INVO[1I]CE\s*D[AE]T[AE]/gi, // INVOICE DATE variants
    /INVO[1I]CE\s*D[AE]TF/gi, // INVOICE DATF variants
    /INVO[1I]CE\s*D4T[AE]/gi // INVOICE D4TE variants
  ];
  
  // Search each top line for date labels
  for (let i = 0; i < topLines.length; i++) {
    const line = topLines[i].trim();
    const lineUpper = line.toUpperCase();
    
    // Skip empty lines
    if (!line) continue;
    
    // Check for exact labels first
    let foundLabel = dateLabels.find(label => lineUpper.includes(label));
    let isFuzzy = false;
    
    // If no exact label, check for fuzzy patterns
    if (!foundLabel) {
      for (const fuzzyPattern of fuzzyDatePatterns) {
        if (fuzzyPattern.test(line)) {
          foundLabel = 'FUZZY_DATE';
          isFuzzy = true;
          console.log('FOUND_FUZZY_DATE_LABEL:', { pattern: fuzzyPattern.source, line });
          break;
        }
      }
    } else {
      console.log('FOUND_DATE_LABEL:', { label: foundLabel, line });
    }
    
    if (foundLabel) {
      
      // Extract date from this line
      const datePatterns = [
        /(?:INVOICE\s*DATE|DATE)\s*[:\s]*\b(0?[1-9]|[12]\d|3[01])[\/\-](0?[1-9]|1[0-2])[\/\-](20\d{2})\b/gi, // Labeled date
        /\b(0?[1-9]|[12]\d|3[01])[\/\-](0?[1-9]|1[0-2])[\/\-](20\d{2})\b/g, // dd/mm/yyyy or dd-mm-yyyy
        /\b(20\d{2})[\/\-](0?[1-9]|1[0-2])[\/\-](0?[1-9]|[12]\d|3[01])\b/g, // yyyy-mm-dd
        /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(0?[1-9]|[12]\d|3[01])[\s,]+(20\d{2})\b/gi // Month date
      ];
      
      for (const pattern of datePatterns) {
        const matches = [...line.matchAll(pattern)];
        
        for (const match of matches) {
          const dateStr = match[1] || match[0];
          
          // Safe-first: validate date format
          if (dateStr.match(/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}$/) || 
              dateStr.match(/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2}[\s,]+\d{4}$/i)) {
            
            // Calculate zone confidence (higher if deeper in top area)
            const zonePosition = (i + 1) / topLines.length; // 0 = top, 1 = bottom of top zone
            const zoneBonus = zonePosition < 0.5 ? 0.2 : 0.1; // Bonus for top half of zone
            
            // Right-alignment bonus (dates at end of lines are more likely headers)
            const trimmedLine = line.trim();
            const datePosition = trimmedLine.indexOf(match[0]);
            const lineLength = trimmedLine.length;
            const rightBonus = datePosition > lineLength * 0.5 ? 0.1 : 0;
            
            // Base confidence depends on label type
            let baseConfidence = 0.7;
            if (foundLabel === 'INVOICE DATE') {
              baseConfidence = 0.9; // Highest confidence for exact label
            } else if (foundLabel === 'DATE') {
              baseConfidence = 0.8; // High confidence for generic label
            } else if (foundLabel === 'FUZZY_DATE') {
              baseConfidence = 0.6; // Lower confidence for fuzzy labels
            }
            
            const totalConfidence = baseConfidence + zoneBonus + rightBonus;
            
            console.log('EXTRACTED_DATE:', {
              date: dateStr,
              foundLabel,
              zonePosition,
              zoneBonus,
              rightBonus,
              totalConfidence,
              source: match[0]
            });
            
            candidates.push({
              value: dateStr,
              confidence: totalConfidence,
              sourceText: match[0],
              reason: `${foundLabel} (top-right zone)` + 
                (isFuzzy ? ' (fuzzy)' : '') +
                (zoneBonus > 0.1 ? ' (top zone)' : '') +
                (rightBonus > 0 ? ' (right-aligned)' : '')
            });
            
            break; // Only take first date from line
          }
        }
        
        if (candidates.length > 0) break; // Only take first match per line
      }
    }
  }
  
  // Safe-first: if no confident candidates found, return empty
  const confidentCandidates = candidates.filter(c => c.confidence >= 0.7);
  
  console.log('INVOICE_DATE_RESULTS:', {
    totalCandidates: candidates.length,
    confidentCandidates: confidentCandidates.length,
    results: confidentCandidates.map(c => ({
      value: c.value,
      confidence: c.confidence,
      reason: c.reason
    }))
  });
  
  return confidentCandidates.sort((a, b) => b.confidence - a.confidence);
}

// Extract invoice total (EdgeChem keyword search for invoices)
function extractInvoiceTotal(lines: string[]): FieldCandidate[] {
  const candidates: FieldCandidate[] = [];
  const text = lines.join('\n');
  
  // Check if this is an EdgeChem invoice
  const isEdgeChem = text.toUpperCase().includes('EDGECHEM');
  
  console.log('INVOICE_TOTAL_EDGECHEM_SEARCH:', {
    totalLines: lines.length,
    isEdgeChem,
    sampleText: text.substring(0, 200) + (text.length > 200 ? '...' : '')
  });
  
  // EdgeChem-specific keywords
  const edgeChemKeywords = ['INVOICE', 'TOTAL', 'SUMME', 'DATE', 'BALANCE', 'DUE'];
  const amountKeywords = ['TOTAL', 'DUE', 'BALANCE', 'SUMME'];
  
  if (isEdgeChem) {
    console.log('EDGECHEM_DETECTED - SEARCHING_KEYWORDS');
    
    // Search bottom half for amounts
    const bottomHalfIndex = Math.floor(lines.length * 0.5);
    const bottomLines = lines.slice(bottomHalfIndex);
    
    let largestAmount = 0;
    let largestCandidate = null;
    let foundLabeledAmount = false;
    
    for (let i = 0; i < bottomLines.length; i++) {
      const line = bottomLines[i].trim();
      const lineUpper = line.toUpperCase();
      
      // Find numeric clusters
      const numericClusters = line.match(/\b[\d\s,\.]+\b/g);
      
      if (numericClusters) {
        for (const cluster of numericClusters) {
          const normalizedAmount = normalizeOCRMoney(cluster);
          
          if (normalizedAmount !== null && normalizedAmount > 50) {
            // Check if near amount keywords
            let keywordBonus = 0;
            const hasAmountKeyword = amountKeywords.some(keyword => lineUpper.includes(keyword));
            
            if (hasAmountKeyword) {
              keywordBonus = 0.3;
              foundLabeledAmount = true;
              console.log('EDGECHEM_LABELED_AMOUNT:', { amount: normalizedAmount, keyword: lineUpper, source: line });
            }
            
            // Skip rejection patterns
            const isRejected = lineUpper.includes('QTY') ||
                             lineUpper.includes('EA') ||
                             lineUpper.includes('PCS') ||
                             lineUpper.includes('ITEM') ||
                             lineUpper.includes('DESCRIPTION') ||
                             lineUpper.includes('UNIT') ||
                             lineUpper.includes('PRICE');
            
            if (!isRejected) {
              const confidence = 0.7 + keywordBonus; // Base confidence + keyword bonus
              
              // Track largest amount
              if (normalizedAmount > largestAmount) {
                largestAmount = normalizedAmount;
                largestCandidate = {
                  value: normalizedAmount.toString(),
                  confidence: confidence,
                  sourceText: line,
                  reason: hasAmountKeyword ? `EdgeChem labeled amount (${amountKeywords.find(k => lineUpper.includes(k))})` : 'EdgeChem bottom half amount'
                };
              }
            }
          }
        }
      }
    }
    
    // Only return if labeled amount found, otherwise leave blank
    if (foundLabeledAmount && largestCandidate) {
      candidates.push(largestCandidate);
      console.log('EDGECHEM_LABELED_SELECTED:', { amount: largestAmount, candidate: largestCandidate });
    } else {
      console.log('EDGECHEM_NO_LABELED_AMOUNT - LEAVING_BLANK');
    }
  } else {
    // Non-EdgeChem invoices - use original logic
    const bottomStartIndex = Math.floor(lines.length * 0.5);
    const bottomLines = lines.slice(bottomStartIndex);
    
    let largestAmount = 0;
    let largestCandidate = null;
    
    for (let i = 0; i < bottomLines.length; i++) {
      const line = bottomLines[i].trim();
      const lineUpper = line.toUpperCase();
      
      // Skip rejection patterns
      const isRejected = lineUpper.includes('QTY') ||
                       lineUpper.includes('EA') ||
                       lineUpper.includes('PCS') ||
                       lineUpper.includes('ITEM') ||
                       lineUpper.includes('DESCRIPTION') ||
                       lineUpper.includes('UNIT') ||
                       lineUpper.includes('PRICE');
      
      if (!isRejected) {
        const numericClusters = line.match(/\b[\d\s,\.]+\b/g);
        
        if (numericClusters) {
          for (const cluster of numericClusters) {
            const normalizedAmount = normalizeOCRMoney(cluster);
            
            if (normalizedAmount !== null && normalizedAmount > 50) {
              if (normalizedAmount > largestAmount) {
                largestAmount = normalizedAmount;
                largestCandidate = {
                  value: normalizedAmount.toString(),
                  confidence: 0.6,
                  sourceText: line,
                  reason: 'Largest amount (bottom half)'
                };
              }
            }
          }
        }
      }
    }
    
    if (largestCandidate) {
      candidates.push(largestCandidate);
    }
  }
  
  // Sort by confidence
  const sortedCandidates = candidates.sort((a, b) => b.confidence - a.confidence);
  
  console.log('INVOICE_TOTAL_EDGECHEM_RESULTS:', {
    totalCandidates: candidates.length,
    topCandidate: sortedCandidates[0] || null,
    results: sortedCandidates.slice(0, 3).map(c => ({
      value: c.value,
      confidence: c.confidence,
      reason: c.reason
    }))
  });
  
  // Return top ranked candidate or empty array
  return sortedCandidates.length > 0 ? [sortedCandidates[0]] : [];
}

// Normalize OCR broken money patterns
function normalizeOCRMoney(cluster: string): number | null {
  // Remove spaces and clean up
  let cleaned = cluster.replace(/\s+/g, '');
  
  // Handle OCR broken patterns
  // S332 000 -> 332.00
  if (cleaned.match(/^S\d+000$/)) {
    const number = cleaned.replace(/^S/, '').replace(/000$/, '');
    return parseFloat(number + '.00');
  }
  
  // 332 000 -> 332.00
  if (cleaned.match(/^\d+000$/)) {
    const number = cleaned.replace(/000$/, '');
    return parseFloat(number + '.00');
  }
  
  // 3 320 00 -> 3320.00
  if (cleaned.match(/^\d+\s\d+00$/)) {
    const withoutSpaces = cleaned.replace(/\s/g, '');
    const number = withoutSpaces.replace(/00$/, '');
    return parseFloat(number + '.00');
  }
  
  // 400000 -> 4000.00 if likely currency format (4 digits + 000)
  if (cleaned.match(/^\d{4}000$/)) {
    const number = cleaned.replace(/000$/, '');
    return parseFloat(number + '.00');
  }
  
  // Standard currency formats
  if (cleaned.match(/^\d+,\d+\.\d{2}$/)) {
    return parseFloat(cleaned.replace(/,/g, ''));
  }
  
  if (cleaned.match(/^\d+\.\d{2}$/)) {
    return parseFloat(cleaned);
  }
  
  // Numbers with commas
  if (cleaned.match(/^\d+,\d+$/)) {
    return parseFloat(cleaned.replace(/,/g, ''));
  }
  
  // Plain numbers (convert to currency format)
  if (cleaned.match(/^\d+$/)) {
    const number = parseFloat(cleaned);
    // Only accept reasonable currency amounts
    if (number > 0 && number < 100000) {
      return number;
    }
  }
  
  return null; // Not a recognizable money format
}

// Reject non-total amounts (quantities, unit prices, item counts, phone numbers)
function rejectNonTotalAmounts(line: string, cluster: string, amount: number): boolean {
  const lineUpper = line.toUpperCase();
  const clusterUpper = cluster.toUpperCase();
  
  // Reject phone numbers (7+ digits, phone patterns)
  if (cluster.match(/^\d{7,}$/) || 
      lineUpper.match(/PHONE|TEL|FAX|CALL|CONTACT/i) ||
      cluster.match(/^\d{3}[-\s]?\d{3}[-\s]?\d{4}$/)) {
    return true;
  }
  
  // Reject quantities and unit prices
  if (lineUpper.match(/QTY|QUANTITY|PCS|PIECES|ITEM|UNIT|PRICE|RATE|HOURS|DAYS|EA|EACH|PER|KG|LBS|OZ|ML|L|G|M|CM|IN|FT/i)) {
    return true;
  }
  
  // Reject item counts and small numbers (likely quantities)
  if (amount < 10 && !cluster.includes('.') && !cluster.includes(',')) {
    return true;
  }
  
  // Reject dates
  if (cluster.match(/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}$/) ||
      cluster.match(/^\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2}$/)) {
    return true;
  }
  
  // Reject percentages
  if (cluster.includes('%') || lineUpper.match(/PERCENT|DISCOUNT|TAX|VAT|RATE/i)) {
    return true;
  }
  
  // Reject very large numbers (likely not realistic totals)
  if (amount > 50000) {
    return true;
  }
  
  return false; // Accept as potential total
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

// Extract all fields from OCR text with enhanced document type detection
function extractAllFields(text: string): ExtractedFields {
  // Detect document type using classifier
  const classification = detectDocumentTypeWithClassifier(text);
  const documentType = classification.documentType;
  
  console.log('=== FIELD EXTRACTION START ===');
  console.log('DOCUMENT_TYPE:', documentType);
  console.log('CLASSIFICATION_CONFIDENCE:', classification.confidence);
  
  // Route extraction based on document type
  switch (documentType) {
    case 'fuel_receipt':
      return extractFuelReceiptFields(text, classification);
    
    case 'hardware_receipt':
      return extractHardwareReceiptFields(text, classification);
    
    case 'invoice':
    case 'tax_invoice':
      return extractInvoiceFieldsEnhanced(text, classification);
    
    case 'worker_payment_form':
      return extractWorkerPaymentFields(text, classification);
    
    case 'payment_voucher':
      return extractPaymentVoucherFields(text, classification);
    
    case 'purchase_order':
      return extractPurchaseOrderFields(text, classification);
    
    case 'estimate':
      return extractEstimateFields(text, classification);
    
    case 'id_card':
      return extractIdCardFields(text, classification);
    
    case 'receipt':
    default:
      // Use standard receipt extraction for general receipts and unknown types
      return {
        vendor: extractVendorCandidates(text),
        date: extractDateCandidates(text),
        amount: extractAmountCandidates(text),
        tax: [], // TODO: Implement tax extraction
        receiptNumber: [], // TODO: Implement receipt number extraction
        documentType: documentType,
        classification: classification
      };
  }
}

// Document-specific extraction functions

// Fuel receipt extraction - prioritize fuel station names, litres, fuel amounts
function extractFuelReceiptFields(text: string, classification: ClassificationResult): ExtractedFields {
  console.log('=== FUEL RECEIPT EXTRACTION ===');
  
  const lines = text.split('\n').filter(line => line.trim().length > 0);
  
  // Prioritize fuel station vendors
  const fuelVendors = ['FESCO', 'TEXACO', 'SHELL', 'TOTAL', 'RUBIS', 'PETROJAM', 'CHEVRON'];
  const vendorCandidates = extractVendorCandidates(text).filter(v => 
    typeof v.value === 'string' && fuelVendors.some(fuel => (v.value as string).toUpperCase().includes(fuel))
  );
  
  // Look for fuel amounts (prioritize amounts near FUEL, LITRES, GALLONS)
  const amountCandidates = extractAmountCandidates(text).filter(a => {
    const line = a.sourceText.toUpperCase();
    return line.includes('FUEL') || line.includes('LITR') || line.includes('GALLON') || 
           line.includes('TOTAL') || line.includes('AMOUNT');
  });
  
  // Extract receipt number (often transaction numbers)
  const receiptNumberCandidates = extractReceiptNumberCandidates(text);
  
  return {
    vendor: vendorCandidates.length > 0 ? vendorCandidates : extractVendorCandidates(text),
    date: extractDateCandidates(text),
    amount: amountCandidates.length > 0 ? amountCandidates : extractAmountCandidates(text),
    tax: [], // Fuel receipts usually don't show tax separately
    receiptNumber: receiptNumberCandidates,
    documentType: 'fuel_receipt',
    classification: classification
  };
}

// Hardware receipt extraction - prioritize suppliers, items, tax
function extractHardwareReceiptFields(text: string, classification: ClassificationResult): ExtractedFields {
  console.log('=== HARDWARE RECEIPT EXTRACTION ===');
  
  // Prioritize hardware vendors
  const hardwareVendors = ['HARDWARE', 'H&L', 'RAPID', 'TRUE VALUE', 'BUILDING'];
  const vendorCandidates = extractVendorCandidates(text).filter(v => 
    typeof v.value === 'string' && hardwareVendors.some(hw => (v.value as string).toUpperCase().includes(hw))
  );
  
  // Look for tax amounts (VAT/GCT)
  const taxCandidates = extractTaxCandidates(text);
  
  return {
    vendor: vendorCandidates.length > 0 ? vendorCandidates : extractVendorCandidates(text),
    date: extractDateCandidates(text),
    amount: extractAmountCandidates(text),
    tax: taxCandidates,
    receiptNumber: extractReceiptNumberCandidates(text),
    documentType: 'hardware_receipt',
    classification: classification
  };
}

// Enhanced invoice extraction for EdgeChem and similar supplier invoices
function extractInvoiceFieldsEnhanced(text: string, classification: ClassificationResult): ExtractedFields {
  console.log('=== SUPPLIER INVOICE EXTRACTION ===');
  console.log('DOCUMENT_TYPE:', classification.documentType);
  
  // Apply OCR number cleanup for invoice text
  const cleanedText = cleanInvoiceNumbers(text);
  const lines = cleanedText.split('\n').filter(line => line.trim().length > 0);
  
  console.log('INVOICE_LINES_COUNT:', lines.length);
  console.log('INVOICE_TEXT_PREVIEW:', cleanedText.substring(0, 300) + '...');
  
  // Extract supplier invoice amount from bottom 50%
  const supplierAmountCandidates = extractSupplierInvoiceAmount(lines);
  
  // Extract supplier invoice date from top 40%
  const supplierDateCandidates = extractSupplierInvoiceDate(lines);
  
  // Use existing invoice extraction for other fields
  const invoiceFields = extractInvoiceFields(cleanedText);
  
  console.log('SUPPLIER_EXTRACTION_RESULTS:', {
    amountCandidates: supplierAmountCandidates.length,
    dateCandidates: supplierDateCandidates.length,
    vendorCandidates: invoiceFields.vendor.length,
    invoiceNumberCandidates: invoiceFields.invoiceNumber.length,
    customerCandidates: invoiceFields.customerName.length
  });
  
  return {
    vendor: invoiceFields.vendor,
    date: supplierDateCandidates.length > 0 ? supplierDateCandidates : invoiceFields.date,
    amount: supplierAmountCandidates.length > 0 ? supplierAmountCandidates : invoiceFields.amount,
    tax: extractTaxCandidates(cleanedText),
    receiptNumber: invoiceFields.invoiceNumber,
    invoiceNumber: invoiceFields.invoiceNumber,
    customerName: invoiceFields.customerName,
    documentType: classification.documentType,
    classification: classification
  };
}

// OCR number cleanup for supplier invoices - only inside numeric strings
function cleanInvoiceNumbers(text: string): string {
  return text
    // Clean numeric strings only - preserve letters
    .replace(/\b([0-9OISBZ,\.]+)\b/g, (match, numStr) => {
      return numStr
        .replace(/O/g, '0') // O -> 0
        .replace(/I/g, '1') // I -> 1  
        .replace(/S/g, '5') // S -> 5
        .replace(/B/g, '8') // B -> 8
        .replace(/Z/g, '2'); // Z -> 2
    })
    // Clean up extra whitespace
    .replace(/\s+/g, ' ')
    .trim();
}

// Extract supplier invoice amount from bottom 50% with specific labels
function extractSupplierInvoiceAmount(lines: string[]): FieldCandidate[] {
  console.log('=== SUPPLIER INVOICE AMOUNT EXTRACTION ===');
  
  const candidates: FieldCandidate[] = [];
  const totalLines = lines.length;
  
  // Specific amount labels for supplier invoices
  const amountLabels = [
    'TOTAL DUE',
    'BALANCE DUE',
    'AMOUNT DUE',
    'NET TOTAL',
    'GRAND TOTAL',
    'TOTAL'
  ];
  
  // Search bottom 50% of document
  const bottomStart = Math.floor(totalLines * 0.5);
  const bottomLines = lines.slice(bottomStart);
  
  console.log('AMOUNT_SEARCH_ZONE:', {
    totalLines,
    bottomStart,
    bottomLinesCount: bottomLines.length
  });
  
  // Search for amount labels and extract nearest currency/number
  for (let i = 0; i < bottomLines.length; i++) {
    const line = bottomLines[i];
    const lineUpper = line.toUpperCase();
    
    // Check for amount labels
    for (const label of amountLabels) {
      if (lineUpper.includes(label)) {
        console.log('FOUND_AMOUNT_LABEL:', label, 'IN_LINE:', line);
        
        // Extract amount from current line
        const currentAmountMatch = line.match(/[\$,\s]*([0-9,]+\.?[0-9]*)/);
        if (currentAmountMatch) {
          const amount = parseFloat(currentAmountMatch[1].replace(/,/g, ''));
          
          if (!isNaN(amount) && amount > 0 && amount < 1000000) {
            const confidence = Math.min(0.95, 0.7 + (amountLabels.indexOf(label) * 0.05));
            
            candidates.push({
              value: amount,
              confidence: confidence,
              sourceText: line,
              reason: `Supplier invoice amount: ${label}`,
              lineIndex: bottomStart + i
            });
            
            console.log('AMOUNT_CANDIDATE_CURRENT:', {
              amount,
              confidence,
              label,
              sourceLine: line
            });
          }
        }
        
        // Check next line for amount
        if (i + 1 < bottomLines.length) {
          const nextLine = bottomLines[i + 1];
          const nextAmountMatch = nextLine.match(/[\$,\s]*([0-9,]+\.?[0-9]*)/);
          if (nextAmountMatch) {
            const amount = parseFloat(nextAmountMatch[1].replace(/,/g, ''));
            
            if (!isNaN(amount) && amount > 0 && amount < 1000000) {
              const confidence = Math.min(0.9, 0.65 + (amountLabels.indexOf(label) * 0.05));
              
              candidates.push({
                value: amount,
                confidence: confidence,
                sourceText: nextLine,
                reason: `Supplier invoice amount after ${label}`,
                lineIndex: bottomStart + i + 1
              });
              
              console.log('AMOUNT_CANDIDATE_NEXT:', {
                amount,
                confidence,
                label,
                sourceLine: nextLine
              });
            }
          }
        }
        
        // Check previous line for amount
        if (i > 0) {
          const prevLine = bottomLines[i - 1];
          const prevAmountMatch = prevLine.match(/[\$,\s]*([0-9,]+\.?[0-9]*)/);
          if (prevAmountMatch) {
            const amount = parseFloat(prevAmountMatch[1].replace(/,/g, ''));
            
            if (!isNaN(amount) && amount > 0 && amount < 1000000) {
              const confidence = Math.min(0.85, 0.6 + (amountLabels.indexOf(label) * 0.05));
              
              candidates.push({
                value: amount,
                confidence: confidence,
                sourceText: prevLine,
                reason: `Supplier invoice amount before ${label}`,
                lineIndex: bottomStart + i - 1
              });
              
              console.log('AMOUNT_CANDIDATE_PREV:', {
                amount,
                confidence,
                label,
                sourceLine: prevLine
              });
            }
          }
        }
      }
    }
  }
  
  // If no amount found with labels, pick largest currency-looking number near bottom
  if (candidates.length === 0) {
    console.log('NO_LABELED_AMOUNT_FOUND - SEARCHING FOR LARGEST CURRENCY NUMBER');
    
    // Search bottom 30% for any currency amounts
    const bottom30Start = Math.floor(totalLines * 0.7);
    const bottom30Lines = lines.slice(bottom30Start);
    
    const currencyAmounts: Array<{amount: number, line: string, index: number}> = [];
    
    for (let i = 0; i < bottom30Lines.length; i++) {
      const line = bottom30Lines[i];
      const amountMatches = line.matchAll(/[\$,\s]*([0-9,]+\.?[0-9]*)/g);
      
      for (const match of amountMatches) {
        const amount = parseFloat(match[1].replace(/,/g, ''));
        
        if (!isNaN(amount) && amount > 0 && amount < 1000000) {
          currencyAmounts.push({
            amount,
            line: line,
            index: bottom30Start + i
          });
        }
      }
    }
    
    // Pick the largest amount
    if (currencyAmounts.length > 0) {
      const largestAmount = currencyAmounts.reduce((max, curr) => 
        curr.amount > max.amount ? curr : max
      );
      
      candidates.push({
        value: largestAmount.amount,
        confidence: 0.6, // Lower confidence for unlabeled amount
        sourceText: largestAmount.line,
        reason: 'Largest currency amount near bottom (no label)',
        lineIndex: largestAmount.index
      });
      
      console.log('LARGEST_CURRENCY_AMOUNT:', {
        amount: largestAmount.amount,
        sourceLine: largestAmount.line,
        lineIndex: largestAmount.index
      });
    }
  }
  
  // Sort by confidence
  const sortedCandidates = candidates.sort((a, b) => b.confidence - a.confidence);
  
  console.log('SUPPLIER_AMOUNT_CANDIDATES:', sortedCandidates.slice(0, 3).map(c => ({
    value: c.value,
    confidence: c.confidence,
    reason: c.reason
  })));
  
  return sortedCandidates;
}

// Extract supplier invoice date from top 45% with enhanced patterns and OCR cleanup
function extractSupplierInvoiceDate(lines: string[]): FieldCandidate[] {
  console.log('=== ENHANCED INVOICE DATE EXTRACTION ===');
  
  const candidates: FieldCandidate[] = [];
  const totalLines = lines.length;
  
  // Enhanced date labels for supplier invoices
  const dateLabels = [
    'DATE',
    'INVOICE DATE',
    'DATED',
    'TAX DATE'
  ];
  
  // Search top 45% of document
  const topEnd = Math.ceil(totalLines * 0.45);
  const topLines = lines.slice(0, topEnd);
  
  console.log('DATE_SEARCH_ZONE:', {
    totalLines,
    topEnd,
    topLinesCount: topLines.length,
    searchPercentage: '45%'
  });
  
  // Enhanced date patterns for EdgeChem and similar invoices
  const datePatterns = [
    // dd/mm/yyyy
    /\b(0?[1-9]|[12]\d|3[01])[\/](0?[1-9]|1[0-2])[\/](20\d{2})\b/g,
    // dd-mm-yyyy
    /\b(0?[1-9]|[12]\d|3[01])[\-](0?[1-9]|1[0-2])[\-](20\d{2})\b/g,
    // yyyy-mm-dd
    /\b(20\d{2})[\-](0?[1-9]|1[0-2])[\-](0?[1-9]|[12]\d|3[01])\b/g,
    // dd.mm.yyyy
    /\b(0?[1-9]|[12]\d|3[01])[\.](0?[1-9]|1[0-2])[\.](20\d{2})\b/g
  ];
  
  // Find all dates in top 45% first
  const allDateCandidates: Array<{
    date: string;
    day: string;
    month: string;
    year: string;
    lineIndex: number;
    sourceLine: string;
    originalText: string;
  }> = [];
  
  for (let i = 0; i < topLines.length; i++) {
    const line = topLines[i];
    
    for (const pattern of datePatterns) {
      const matches = [...line.matchAll(pattern)];
      
      for (const match of matches) {
        const originalDate = match[0];
        let day, month, year;
        
        // Apply OCR cleanup inside dates
        const cleanedDate = originalDate
          .replace(/O/g, '0') // O -> 0
          .replace(/I/g, '1') // I -> 1
          .replace(/S/g, '5'); // S -> 5
        
        console.log('DATE_OCR_CLEANUP:', {
          original: originalDate,
          cleaned: cleanedDate
        });
        
        // Parse different date formats
        if (match[1] && match[2] && match[3]) {
          if (match[1].length === 4) {
            // yyyy-mm-dd format
            year = cleanedDate.substring(0, 4);
            month = cleanedDate.substring(5, 7);
            day = cleanedDate.substring(8, 10);
          } else {
            // dd/mm/yyyy, dd-mm-yyyy, dd.mm.yyyy formats
            const separator = originalDate.includes('/') ? '/' : 
                            originalDate.includes('-') ? '-' : '.';
            const parts = cleanedDate.split(separator);
            day = parts[0];
            month = parts[1];
            year = parts[2];
          }
        }
        
        // Validate date components
        if (day && month && year) {
          const dayNum = parseInt(day);
          const monthNum = parseInt(month);
          const yearNum = parseInt(year);
          
          if (dayNum >= 1 && dayNum <= 31 && monthNum >= 1 && monthNum <= 12 && 
              yearNum >= 2000 && yearNum <= 2030) {
            
            const formattedDate = `${yearNum}-${monthNum.toString().padStart(2, '0')}-${dayNum.toString().padStart(2, '0')}`;
            
            allDateCandidates.push({
              date: formattedDate,
              day,
              month,
              year,
              lineIndex: i,
              sourceLine: line,
              originalText: originalDate
            });
            
            console.log('FOUND_DATE:', {
              original: originalDate,
              cleaned: cleanedDate,
              formatted: formattedDate,
              lineIndex: i,
              sourceLine: line
            });
          }
        }
      }
    }
  }
  
  // Find invoice labels to determine proximity
  const invoiceLabels = ['INVOICE', 'INVOICE #', 'INVOICE NO', 'TAX INVOICE', 'BILL TO'];
  const labelPositions: Array<{label: string, lineIndex: number}> = [];
  
  for (let i = 0; i < topLines.length; i++) {
    const lineUpper = topLines[i].toUpperCase();
    
    for (const label of invoiceLabels) {
      if (lineUpper.includes(label)) {
        labelPositions.push({
          label,
          lineIndex: i
        });
        console.log('FOUND_INVOICE_LABEL:', label, 'AT_LINE:', i);
      }
    }
  }
  
  // Score dates based on label proximity and date labels
  for (const dateCandidate of allDateCandidates) {
    let confidence = 0.5; // Base confidence
    let reason = 'Date found';
    
    // Check if date is near date labels
    const lineUpper = topLines[dateCandidate.lineIndex].toUpperCase();
    for (const dateLabel of dateLabels) {
      if (lineUpper.includes(dateLabel)) {
        confidence = Math.min(0.9, confidence + 0.3);
        reason = `Date near ${dateLabel} label`;
        console.log('DATE_LABEL_BOOST:', dateLabel, 'FOR_DATE:', dateCandidate.date);
        break;
      }
    }
    
    // Check if date is near invoice labels
    let minDistance = Infinity;
    let nearestLabel = '';
    
    for (const labelPos of labelPositions) {
      const distance = Math.abs(dateCandidate.lineIndex - labelPos.lineIndex);
      if (distance < minDistance) {
        minDistance = distance;
        nearestLabel = labelPos.label;
      }
    }
    
    if (minDistance < 5) { // Within 5 lines of invoice label
      confidence = Math.min(0.85, confidence + (0.2 * (1 - minDistance / 5)));
      reason += `, near ${nearestLabel} (${minDistance} lines)`;
      console.log('INVOICE_LABEL_PROXIMITY_BOOST:', {
        date: dateCandidate.date,
        nearestLabel,
        distance: minDistance,
        newConfidence: confidence
      });
    }
    
    // Check next line for date labels
    if (dateCandidate.lineIndex + 1 < topLines.length) {
      const nextLineUpper = topLines[dateCandidate.lineIndex + 1].toUpperCase();
      for (const dateLabel of dateLabels) {
        if (nextLineUpper.includes(dateLabel)) {
          confidence = Math.min(0.9, confidence + 0.25);
          reason += `, date label on next line`;
          console.log('NEXT_LINE_DATE_LABEL_BOOST:', dateLabel, 'FOR_DATE:', dateCandidate.date);
          break;
        }
      }
    }
    
    // Check previous line for date labels
    if (dateCandidate.lineIndex > 0) {
      const prevLineUpper = topLines[dateCandidate.lineIndex - 1].toUpperCase();
      for (const dateLabel of dateLabels) {
        if (prevLineUpper.includes(dateLabel)) {
          confidence = Math.min(0.9, confidence + 0.25);
          reason += `, date label on previous line`;
          console.log('PREV_LINE_DATE_LABEL_BOOST:', dateLabel, 'FOR_DATE:', dateCandidate.date);
          break;
        }
      }
    }
    
    candidates.push({
      value: dateCandidate.date,
      confidence: confidence,
      sourceText: dateCandidate.sourceLine,
      reason: reason,
      lineIndex: dateCandidate.lineIndex
    });
  }
  
  // If multiple dates found, prioritize those nearest invoice labels
  const sortedCandidates = candidates.sort((a, b) => {
    // First prioritize by confidence
    if (Math.abs(a.confidence - b.confidence) > 0.1) {
      return b.confidence - a.confidence;
    }
    
    // If similar confidence, prioritize those with invoice label proximity
    const aHasInvoiceProximity = a.reason.includes('near') && a.reason.includes('INVOICE');
    const bHasInvoiceProximity = b.reason.includes('near') && b.reason.includes('INVOICE');
    
    if (aHasInvoiceProximity && !bHasInvoiceProximity) {
      return -1;
    }
    if (!aHasInvoiceProximity && bHasInvoiceProximity) {
      return 1;
    }
    
    // Then prioritize those with date labels
    const aHasDateLabel = a.reason.includes('DATE') && !a.reason.includes('near');
    const bHasDateLabel = b.reason.includes('DATE') && !b.reason.includes('near');
    
    if (aHasDateLabel && !bHasDateLabel) {
      return -1;
    }
    if (!aHasDateLabel && bHasDateLabel) {
      return 1;
    }
    
    // Finally by confidence
    return b.confidence - a.confidence;
  });
  
  console.log('ENHANCED_DATE_CANDIDATES:', sortedCandidates.slice(0, 3).map(c => ({
    value: c.value,
    confidence: c.confidence,
    reason: c.reason,
    lineIndex: c.lineIndex
  })));
  
  return sortedCandidates;
}

// OCR text cleanup for invoice processing
function cleanOCRText(text: string): string {
  return text
    // Convert common OCR garbage characters
    .replace(/0/g, 'O') // Replace 0 with O (except in numbers)
    .replace(/1/g, 'I') // Replace 1 with I (except in numbers)
    .replace(/5/g, 'S') // Replace 5 with S (except in numbers)
    .replace(/8/g, 'B') // Replace 8 with B (except in numbers)
    // But preserve numbers in monetary values
    .replace(/\$([0-9OBIS8]+)/g, (match, num) => {
      const cleanNum = num.replace(/O/g, '0').replace(/I/g, '1').replace(/S/g, '5').replace(/B/g, '8');
      return '$' + cleanNum;
    })
    .replace(/([0-9OBIS8,]+\.?[0-9OBIS8]*)/g, (match, num) => {
      const cleanNum = num.replace(/O/g, '0').replace(/I/g, '1').replace(/S/g, '5').replace(/B/g, '8');
      return cleanNum;
    })
    // Clean up extra whitespace
    .replace(/\s+/g, ' ')
    .trim();
}

// Enhanced invoice amount extraction with prioritized labels and bottom-half focus
function extractInvoiceAmountEnhanced(lines: string[], documentType: string): FieldCandidate[] {
  console.log('=== ENHANCED INVOICE AMOUNT EXTRACTION ===');
  
  const candidates: FieldCandidate[] = [];
  const totalLines = lines.length;
  
  // Prioritized amount labels for invoices
  const prioritizedLabels = [
    'TOTAL DUE',
    'BALANCE DUE', 
    'GRAND TOTAL',
    'NET TOTAL',
    'AMOUNT DUE',
    'TOTAL',
    'SUBTOTAL',
    'AMOUNT',
    'SUM TOTAL',
    'FINAL TOTAL'
  ];
  
  // Search bottom half first (more likely to contain totals)
  const bottomHalfStart = Math.floor(totalLines * 0.5);
  const bottomLines = lines.slice(bottomHalfStart);
  const topLines = lines.slice(0, bottomHalfStart);
  
  console.log('ZONE_SEARCH:', {
    totalLines,
    bottomHalfStart,
    bottomLinesCount: bottomLines.length,
    topLinesCount: topLines.length
  });
  
  // Search bottom half with high priority
  for (let i = 0; i < bottomLines.length; i++) {
    const line = bottomLines[i];
    const lineUpper = line.toUpperCase();
    
    // Check for prioritized labels
    for (const label of prioritizedLabels) {
      if (lineUpper.includes(label)) {
        console.log('FOUND_PRIORITY_LABEL:', label, 'IN_LINE:', line);
        
        // Extract amount from this line or next line
        const amountMatch = line.match(/[\$,\s]*([0-9,]+\.?[0-9]*)/);
        if (amountMatch) {
          const amount = parseFloat(amountMatch[1].replace(/,/g, ''));
          
          if (!isNaN(amount) && amount > 0 && amount < 1000000) {
            const confidence = Math.min(0.9, 0.6 + (prioritizedLabels.indexOf(label) * 0.05));
            
            candidates.push({
              value: amount,
              confidence: confidence,
              sourceText: line,
              reason: `Invoice total label: ${label} (bottom half)`,
              lineIndex: bottomHalfStart + i
            });
            
            console.log('AMOUNT_CANDIDATE_BOTTOM:', {
              amount,
              confidence,
              label,
              sourceLine: line
            });
          }
        }
        
        // Also check next line for amount
        if (i + 1 < bottomLines.length) {
          const nextLine = bottomLines[i + 1];
          const nextAmountMatch = nextLine.match(/[\$,\s]*([0-9,]+\.?[0-9]*)/);
          if (nextAmountMatch) {
            const amount = parseFloat(nextAmountMatch[1].replace(/,/g, ''));
            
            if (!isNaN(amount) && amount > 0 && amount < 1000000) {
              const confidence = Math.min(0.85, 0.55 + (prioritizedLabels.indexOf(label) * 0.05));
              
              candidates.push({
                value: amount,
                confidence: confidence,
                sourceText: nextLine,
                reason: `Invoice total amount after ${label} (bottom half)`,
                lineIndex: bottomHalfStart + i + 1
              });
              
              console.log('AMOUNT_CANDIDATE_NEXT_LINE:', {
                amount,
                confidence,
                label,
                sourceLine: nextLine
              });
            }
          }
        }
      }
    }
  }
  
  // Search top half for any missed amounts (lower priority)
  for (let i = 0; i < topLines.length; i++) {
    const line = topLines[i];
    const lineUpper = line.toUpperCase();
    
    // Only check top half for high-priority labels
    const highPriorityLabels = prioritizedLabels.slice(0, 5);
    
    for (const label of highPriorityLabels) {
      if (lineUpper.includes(label)) {
        console.log('FOUND_PRIORITY_LABEL_TOP:', label, 'IN_LINE:', line);
        
        const amountMatch = line.match(/[\$,\s]*([0-9,]+\.?[0-9]*)/);
        if (amountMatch) {
          const amount = parseFloat(amountMatch[1].replace(/,/g, ''));
          
          if (!isNaN(amount) && amount > 0 && amount < 1000000) {
            const confidence = Math.min(0.8, 0.5 + (prioritizedLabels.indexOf(label) * 0.03));
            
            candidates.push({
              value: amount,
              confidence: confidence,
              sourceText: line,
              reason: `Invoice total label: ${label} (top half)`,
              lineIndex: i
            });
            
            console.log('AMOUNT_CANDIDATE_TOP:', {
              amount,
              confidence,
              label,
              sourceLine: line
            });
          }
        }
      }
    }
  }
  
  // Sort by confidence, prioritizing bottom half results
  const sortedCandidates = candidates.sort((a, b) => {
    // Prioritize higher confidence
    if (Math.abs(a.confidence - b.confidence) > 0.1) {
      return b.confidence - a.confidence;
    }
    // If similar confidence, prioritize bottom half
    if (a.reason.includes('bottom half') && !b.reason.includes('bottom half')) {
      return -1;
    }
    if (!a.reason.includes('bottom half') && b.reason.includes('bottom half')) {
      return 1;
    }
    return b.confidence - a.confidence;
  });
  
  console.log('ENHANCED_AMOUNT_CANDIDATES:', sortedCandidates.slice(0, 3).map(c => ({
    value: c.value,
    confidence: c.confidence,
    reason: c.reason
  })));
  
  return sortedCandidates;
}

// Enhanced invoice date extraction with improved labels and top-half focus
function extractInvoiceDateEnhanced(lines: string[], documentType: string): FieldCandidate[] {
  console.log('=== ENHANCED INVOICE DATE EXTRACTION ===');
  
  const candidates: FieldCandidate[] = [];
  const totalLines = lines.length;
  
  // Improved date labels for invoices
  const dateLabels = [
    'DATE',
    'INVOICE DATE',
    'TAX DATE',
    'DATED',
    'ISSUED DATE',
    'BILL DATE',
    'DATE OF ISSUE',
    'DATE OF INVOICE'
  ];
  
  // Search top half first (more likely to contain dates)
  const topHalfEnd = Math.ceil(totalLines * 0.5);
  const topLines = lines.slice(0, topHalfEnd);
  const bottomLines = lines.slice(topHalfEnd);
  
  console.log('DATE_ZONE_SEARCH:', {
    totalLines,
    topHalfEnd,
    topLinesCount: topLines.length,
    bottomLinesCount: bottomLines.length
  });
  
  // Enhanced date patterns
  const datePatterns = [
    // dd/mm/yyyy and dd-mm-yyyy
    /\b(0?[1-9]|[12]\d|3[01])[\/\-](0?[1-9]|1[0-2])[\/\-](20\d{2})\b/g,
    // yyyy-mm-dd
    /\b(20\d{2})[\/\-](0?[1-9]|1[0-2])[\/\-](0?[1-9]|[12]\d|3[01])\b/g,
    // Month dd, yyyy
    /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(0?[1-9]|[12]\d|3[01])[,\s]+(20\d{2})\b/gi,
    // dd Month yyyy
    /\b(0?[1-9]|[12]\d|3[01])\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(20\d{2})\b/gi
  ];
  
  // Search top half with high priority
  for (let i = 0; i < topLines.length; i++) {
    const line = topLines[i];
    const lineUpper = line.toUpperCase();
    
    // Check for date labels
    for (const label of dateLabels) {
      if (lineUpper.includes(label)) {
        console.log('FOUND_DATE_LABEL:', label, 'IN_LINE:', line);
        
        // Extract date from this line or next line
        for (const pattern of datePatterns) {
          const matches = [...line.matchAll(pattern)];
          
          for (const match of matches) {
            let dateStr = match[0];
            let day, month, year;
            
            // Parse different date formats
            if (match[1] && match[2] && match[3]) {
              // dd/mm/yyyy or dd-mm-yyyy
              day = match[1];
              month = match[2];
              year = match[3];
            } else if (match[1] && match[2] && match[3]) {
              // yyyy-mm-dd
              year = match[1];
              month = match[2];
              day = match[3];
            } else if (match[1] && match[2] && match[3]) {
              // Month dd, yyyy
              month = match[1];
              day = match[2];
              year = match[3];
            }
            
            // Validate and format date
            if (day && month && year) {
              const dayNum = parseInt(day);
              const monthNum = month.match(/^\d+$/) ? parseInt(month) : new Date(Date.parse(month + ' 1, 2000')).getMonth() + 1;
              const yearNum = parseInt(year);
              
              if (dayNum >= 1 && dayNum <= 31 && monthNum >= 1 && monthNum <= 12 && yearNum >= 2000 && yearNum <= 2030) {
                const formattedDate = `${yearNum}-${monthNum.toString().padStart(2, '0')}-${dayNum.toString().padStart(2, '0')}`;
                
                const confidence = Math.min(0.9, 0.7 + (dateLabels.indexOf(label) * 0.03));
                
                candidates.push({
                  value: formattedDate,
                  confidence: confidence,
                  sourceText: line,
                  reason: `Invoice date label: ${label} (top half)`,
                  lineIndex: i
                });
                
                console.log('DATE_CANDIDATE_TOP:', {
                  date: formattedDate,
                  confidence,
                  label,
                  sourceLine: line
                });
              }
            }
          }
        }
        
        // Also check next line for date
        if (i + 1 < topLines.length) {
          const nextLine = topLines[i + 1];
          
          for (const pattern of datePatterns) {
            const matches = [...nextLine.matchAll(pattern)];
            
            for (const match of matches) {
              let dateStr = match[0];
              let day, month, year;
              
              // Similar parsing logic as above
              if (match[1] && match[2] && match[3]) {
                day = match[1];
                month = match[2];
                year = match[3];
                
                const dayNum = parseInt(day);
                const monthNum = month.match(/^\d+$/) ? parseInt(month) : new Date(Date.parse(month + ' 1, 2000')).getMonth() + 1;
                const yearNum = parseInt(year);
                
                if (dayNum >= 1 && dayNum <= 31 && monthNum >= 1 && monthNum <= 12 && yearNum >= 2000 && yearNum <= 2030) {
                  const formattedDate = `${yearNum}-${monthNum.toString().padStart(2, '0')}-${dayNum.toString().padStart(2, '0')}`;
                  
                  const confidence = Math.min(0.85, 0.65 + (dateLabels.indexOf(label) * 0.03));
                  
                  candidates.push({
                    value: formattedDate,
                    confidence: confidence,
                    sourceText: nextLine,
                    reason: `Invoice date after ${label} (top half)`,
                    lineIndex: i + 1
                  });
                  
                  console.log('DATE_CANDIDATE_NEXT_LINE:', {
                    date: formattedDate,
                    confidence,
                    label,
                    sourceLine: nextLine
                  });
                }
              }
            }
          }
        }
      }
    }
  }
  
  // Search bottom half for any missed dates (lower priority)
  for (let i = 0; i < bottomLines.length; i++) {
    const line = bottomLines[i];
    const lineUpper = line.toUpperCase();
    
    // Only check bottom half for high-priority date labels
    const highPriorityDateLabels = ['DATE', 'INVOICE DATE', 'TAX DATE'];
    
    for (const label of highPriorityDateLabels) {
      if (lineUpper.includes(label)) {
        console.log('FOUND_DATE_LABEL_BOTTOM:', label, 'IN_LINE:', line);
        
        for (const pattern of datePatterns) {
          const matches = [...line.matchAll(pattern)];
          
          for (const match of matches) {
            // Similar parsing and validation as above
            if (match[1] && match[2] && match[3]) {
              const day = match[1];
              const month = match[2];
              const year = match[3];
              
              const dayNum = parseInt(day);
              const monthNum = month.match(/^\d+$/) ? parseInt(month) : new Date(Date.parse(month + ' 1, 2000')).getMonth() + 1;
              const yearNum = parseInt(year);
              
              if (dayNum >= 1 && dayNum <= 31 && monthNum >= 1 && monthNum <= 12 && yearNum >= 2000 && yearNum <= 2030) {
                const formattedDate = `${yearNum}-${monthNum.toString().padStart(2, '0')}-${dayNum.toString().padStart(2, '0')}`;
                
                const confidence = Math.min(0.75, 0.5 + (highPriorityDateLabels.indexOf(label) * 0.03));
                
                candidates.push({
                  value: formattedDate,
                  confidence: confidence,
                  sourceText: line,
                  reason: `Invoice date label: ${label} (bottom half)`,
                  lineIndex: topHalfEnd + i
                });
                
                console.log('DATE_CANDIDATE_BOTTOM:', {
                  date: formattedDate,
                  confidence,
                  label,
                  sourceLine: line
                });
              }
            }
          }
        }
      }
    }
  }
  
  // Sort by confidence, prioritizing top half results
  const sortedCandidates = candidates.sort((a, b) => {
    // Prioritize higher confidence
    if (Math.abs(a.confidence - b.confidence) > 0.1) {
      return b.confidence - a.confidence;
    }
    // If similar confidence, prioritize top half
    if (a.reason.includes('top half') && !b.reason.includes('top half')) {
      return -1;
    }
    if (!a.reason.includes('top half') && b.reason.includes('top half')) {
      return 1;
    }
    return b.confidence - a.confidence;
  });
  
  console.log('ENHANCED_DATE_CANDIDATES:', sortedCandidates.slice(0, 3).map(c => ({
    value: c.value,
    confidence: c.confidence,
    reason: c.reason
  })));
  
  return sortedCandidates;
}

// Worker payment form extraction
function extractWorkerPaymentFields(text: string, classification: ClassificationResult): ExtractedFields {
  console.log('=== WORKER PAYMENT FORM EXTRACTION ===');
  
  const lines = text.split('\n').filter(line => line.trim().length > 0);
  const upperText = text.toUpperCase();
  
  // Extract worker name (usually near "NAME", "WORKER", "EMPLOYEE")
  const nameCandidates: FieldCandidate[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineUpper = line.toUpperCase();
    
    if (lineUpper.includes('NAME') || lineUpper.includes('WORKER') || lineUpper.includes('EMPLOYEE')) {
      // Look for name on same or next line
      const nameLine = lineUpper.includes('NAME') ? line : lines[i + 1] || '';
      const nameMatch = nameLine.match(/[A-Z][a-z]+\s+[A-Z][a-z]+/);
      if (nameMatch) {
        nameCandidates.push({
          value: nameMatch[0],
          confidence: 0.8,
          sourceText: nameLine,
          reason: 'Worker name found'
        });
      }
    }
  }
  
  // Extract wages/amount (near "WAGES", "PAY", "TOTAL")
  const amountCandidates = extractAmountCandidates(text).filter(a => {
    const line = a.sourceText.toUpperCase();
    return line.includes('WAGE') || line.includes('PAY') || line.includes('TOTAL') || 
           line.includes('NET') || line.includes('AMOUNT');
  });
  
  return {
    vendor: [], // Worker forms usually don't have vendors
    date: extractDateCandidates(text),
    amount: amountCandidates.length > 0 ? amountCandidates : extractAmountCandidates(text),
    tax: [],
    receiptNumber: [],
    customerName: nameCandidates,
    documentType: 'worker_payment_form',
    classification: classification
  };
}

// Payment voucher extraction
function extractPaymentVoucherFields(text: string, classification: ClassificationResult): ExtractedFields {
  console.log('=== PAYMENT VOUCHER EXTRACTION ===');
  
  // Extract amount (near "PAYMENT", "AMOUNT", "TOTAL")
  const amountCandidates = extractAmountCandidates(text).filter(a => {
    const line = a.sourceText.toUpperCase();
    return line.includes('PAYMENT') || line.includes('AMOUNT') || line.includes('TOTAL');
  });
  
  // Extract voucher number
  const receiptNumberCandidates = extractReceiptNumberCandidates(text).filter(r => {
    const line = r.sourceText.toUpperCase();
    return line.includes('VOUCHER') || line.includes('VOU');
  });
  
  return {
    vendor: extractVendorCandidates(text),
    date: extractDateCandidates(text),
    amount: amountCandidates.length > 0 ? amountCandidates : extractAmountCandidates(text),
    tax: [],
    receiptNumber: receiptNumberCandidates,
    documentType: 'payment_voucher',
    classification: classification
  };
}

// Purchase order extraction
function extractPurchaseOrderFields(text: string, classification: ClassificationResult): ExtractedFields {
  console.log('=== PURCHASE ORDER EXTRACTION ===');
  
  // Extract PO number
  const receiptNumberCandidates = extractReceiptNumberCandidates(text).filter(r => {
    const line = r.sourceText.toUpperCase();
    return line.includes('PO') || line.includes('PURCHASE ORDER') || line.includes('P.O.');
  });
  
  return {
    vendor: extractVendorCandidates(text),
    date: extractDateCandidates(text),
    amount: extractAmountCandidates(text),
    tax: extractTaxCandidates(text),
    receiptNumber: receiptNumberCandidates,
    documentType: 'purchase_order',
    classification: classification
  };
}

// Estimate/quotation extraction
function extractEstimateFields(text: string, classification: ClassificationResult): ExtractedFields {
  console.log('=== ESTIMATE EXTRACTION ===');
  
  // Extract estimate number
  const receiptNumberCandidates = extractReceiptNumberCandidates(text).filter(r => {
    const line = r.sourceText.toUpperCase();
    return line.includes('EST') || line.includes('QUOTE') || line.includes('QUOTATION');
  });
  
  return {
    vendor: extractVendorCandidates(text),
    date: extractDateCandidates(text),
    amount: extractAmountCandidates(text),
    tax: extractTaxCandidates(text),
    receiptNumber: receiptNumberCandidates,
    documentType: 'estimate',
    classification: classification
  };
}

// ID card extraction
function extractIdCardFields(text: string, classification: ClassificationResult): ExtractedFields {
  console.log('=== ID CARD EXTRACTION ===');
  
  const lines = text.split('\n').filter(line => line.trim().length > 0);
  const upperText = text.toUpperCase();
  
  // Extract name (usually prominent)
  const nameCandidates: FieldCandidate[] = [];
  for (const line of lines) {
    const nameMatch = line.match(/[A-Z][a-z]+\s+[A-Z][a-z]+/);
    if (nameMatch && !line.toUpperCase().includes('DATE') && !line.toUpperCase().includes('NUMBER')) {
      nameCandidates.push({
        value: nameMatch[0],
        confidence: 0.9,
        sourceText: line,
        reason: 'ID card name format'
      });
    }
  }
  
  // Extract ID number (near "NUMBER", "ID", "LICENSE")
  const receiptNumberCandidates: FieldCandidate[] = [];
  for (const line of lines) {
    const lineUpper = line.toUpperCase();
    if (lineUpper.includes('NUMBER') || lineUpper.includes('ID') || lineUpper.includes('LICENSE')) {
      const idMatch = line.match(/\b[A-Z0-9]{6,12}\b/);
      if (idMatch) {
        receiptNumberCandidates.push({
          value: idMatch[0],
          confidence: 0.9,
          sourceText: line,
          reason: 'ID card number'
        });
      }
    }
  }
  
  return {
    vendor: [], // ID cards don't have vendors
    date: extractDateCandidates(text),
    amount: [], // ID cards don't have amounts
    tax: [],
    receiptNumber: receiptNumberCandidates,
    customerName: nameCandidates,
    documentType: 'id_card',
    classification: classification
  };
}

// Helper function for receipt number extraction (missing from original)
function extractReceiptNumberCandidates(text: string): FieldCandidate[] {
  const candidates: FieldCandidate[] = [];
  const lines = text.split('\n').filter(line => line.trim().length > 0);
  
  // Common receipt number patterns
  const receiptPatterns = [
    /(?:RECEIPT|REC|TICKET|TRANSACTION|ORDER|INVOICE)\s*#?\s*([A-Z0-9\-]+)/gi,
    /#([A-Z0-9\-]+)/gi,
    /\b([A-Z]{2,4}\d{4,8})\b/gi,
    /\b(\d{6,12})\b/gi
  ];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const lineUpper = line.toUpperCase();
    
    for (const pattern of receiptPatterns) {
      const matches = [...line.matchAll(pattern)];
      
      for (const match of matches) {
        const receiptNumber = match[1];
        
        if (receiptNumber && receiptNumber.length >= 4) {
          candidates.push({
            value: receiptNumber,
            confidence: 0.6,
            sourceText: line,
            reason: 'Receipt number pattern match',
            lineIndex: i
          });
        }
      }
    }
  }
  
  return candidates.sort((a, b) => b.confidence - a.confidence);
}

// Helper function for tax extraction
function extractTaxCandidates(text: string): FieldCandidate[] {
  const candidates: FieldCandidate[] = [];
  const lines = text.split('\n').filter(line => line.trim().length > 0);
  
  // Tax amount patterns
  const taxPatterns = [
    /(?:TAX|VAT|GCT)\s*[:\s]*\$?([\d,]+\.\d{2})/gi,
    /(?:TAX|VAT|GCT)\s*[:\s]*([\d,]+\.\d{2})/gi,
    /TAXABLE\s*[:\s]*\$?([\d,]+\.\d{2})/gi
  ];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const lineUpper = line.toUpperCase();
    
    // Only look for tax if line contains tax keywords
    if (!lineUpper.includes('TAX') && !lineUpper.includes('VAT') && !lineUpper.includes('GCT')) {
      continue;
    }
    
    for (const pattern of taxPatterns) {
      const matches = [...line.matchAll(pattern)];
      
      for (const match of matches) {
        const taxAmount = parseFloat(match[1].replace(/,/g, ''));
        
        if (!isNaN(taxAmount) && taxAmount > 0 && taxAmount < 10000) {
          candidates.push({
            value: taxAmount,
            confidence: 0.8,
            sourceText: line,
            reason: 'Tax amount pattern match',
            lineIndex: i
          });
        }
      }
    }
  }
  
  return candidates.sort((a, b) => b.confidence - a.confidence);
}

// Select best OCR result and extract fields with mode awareness
async function processReceiptOCR(file: File, mode: 'fast' | 'deep' = 'fast'): Promise<{
  fields: ExtractedFields;
  selectedPass: OCRPassResult;
  allPasses: OCRPassResult[];
}> {
  console.log('=== PROCESS RECEIPT OCR START ===');
  console.log('INPUT_FILE:', {
    name: file.name,
    size: file.size,
    type: file.type
  });
  
  // First, perform a quick OCR to determine document type
  console.log('PERFORMING_INITIAL_CLASSIFICATION_OCR...');
  const initialPasses = await performMultiPassOCR(file, 'fast');
  
  if (initialPasses.length === 0) {
    throw new Error('Initial OCR classification failed');
  }
  
  // Classify document type from initial OCR
  const classification = classifyDocument(initialPasses[0].text);
  console.log('DOCUMENT_CLASSIFICATION:', {
    documentType: classification.documentType,
    confidence: classification.confidence,
    reasoning: classification.reasoning
  });
  
  let processedFile = file;
  let allPasses = initialPasses;
  
  // Apply invoice-specific preprocessing for invoice/tax_invoice documents
  if (classification.documentType === 'invoice' || classification.documentType === 'tax_invoice') {
    console.log('APPLYING_INVOICE_PREPROCESSING...');
    
    try {
      const invoiceResult = await createInvoiceProcessedImage(file, { 
        mode: 'fast',
        onProgress: (stage) => console.log('INVOICE_PREPROCESSING_STAGE:', stage)
      });
      
      processedFile = invoiceResult.file;
      console.log('INVOICE_PREPROCESSING_COMPLETE:', {
        originalSize: file.size,
        processedSize: invoiceResult.file.size,
        processingTime: Object.values(invoiceResult.timings).reduce((a, b) => a + b, 0) + 'ms',
        stages: Object.keys(invoiceResult.timings)
      });
      
      // Re-run OCR with preprocessed image for better results
      console.log('PERFORMING_ENHANCED_OCR_ON_PREPROCESSED_IMAGE...');
      allPasses = await performMultiPassOCR(processedFile, mode);
      
      if (allPasses.length === 0) {
        console.warn('ENHANCED_OCR_FAILED, FALLING_BACK_TO_INITIAL_RESULTS');
        allPasses = initialPasses;
      } else {
        console.log('ENHANCED_OCR_SUCCESS:', {
          newConfidence: allPasses[0].confidence,
          originalConfidence: initialPasses[0].confidence,
          improvement: (allPasses[0].confidence - initialPasses[0].confidence).toFixed(3)
        });
      }
      
    } catch (error) {
      console.error('INVOICE_PREPROCESSING_FAILED:', error);
      console.log('FALLING_BACK_TO_ORIGINAL_OCR_RESULTS');
      allPasses = initialPasses;
    }
  } else {
    console.log('USING_STANDARD_PREPROCESSING_FOR:', classification.documentType);
    // Use standard OCR passes for non-invoice documents
    if (mode !== 'fast') {
      allPasses = await performMultiPassOCR(file, mode);
    }
  }
  
  if (allPasses.length === 0) {
    throw new Error('All OCR passes failed');
  }
  
  const selectedPass = allPasses[0];
  const fields = extractAllFields(selectedPass.text);
  
  // Add classification to fields for downstream processing
  fields.classification = classification;
  fields.documentType = classification.documentType;
  
  console.log('OCR_PROCESSING_COMPLETE:', {
    mode,
    documentType: classification.documentType,
    preprocessingApplied: classification.documentType === 'invoice' || classification.documentType === 'tax_invoice',
    selectedPass: selectedPass.passName,
    confidence: selectedPass.confidence,
    score: selectedPass.score,
    textLength: selectedPass.text.length,
    extractedFields: {
      vendorCount: fields.vendor.length,
      dateCount: fields.date.length,
      amountCount: fields.amount.length,
      invoiceNumberCount: fields.invoiceNumber?.length || 0,
      customerNameCount: fields.customerName?.length || 0
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

// Get raw image text for keyword analysis
async function getRawImageText(file: File): Promise<string> {
  try {
    const imageDataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    
    const worker = await createWorker('eng', 1);
    const { data: { text } } = await worker.recognize(imageDataUrl);
    await worker.terminate();
    
    return text;
  } catch (error) {
    console.error('GET_RAW_TEXT_ERROR:', error);
    return '';
  }
}

// Quick document classification from image
async function classifyDocumentFromImage(file: File): Promise<ClassificationResult> {
  try {
    // Quick OCR for classification
    const imageDataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    
    const worker = await createWorker('eng', 1);
    const { data: { text } } = await worker.recognize(imageDataUrl);
    await worker.terminate();
    
    return classifyDocument(text);
  } catch (error) {
    console.error('QUICK_CLASSIFICATION_ERROR:', error);
    // Return unknown classification on error
    return {
      documentType: 'unknown',
      confidence: 0,
      scores: {} as Record<DocumentType, number>,
      topKeywords: [],
      reasoning: 'Classification failed - using unknown'
    };
  }
}

// Convert invoice scanner result to OCR result format
function convertInvoiceResultToOCRResult(invoiceResult: InvoiceScanResult, scoringResult?: any): OCRResult {
  const { invoiceData, ocrConfidence, preprocessing } = invoiceResult;
  
  if (!invoiceData) {
    return {
      vendor: null,
      date: null,
      amount: null,
      tax: null,
      receiptNumber: null,
      rawText: '',
      confidence: 0,
      requiresManualEntry: true,
      documentType: 'invoice',
      documentTypeConfidence: 0,
      classificationReasoning: 'Invoice scanner failed'
    };
  }

  return {
    vendor: invoiceData.vendorName,
    date: invoiceData.invoiceDate,
    amount: invoiceData.grandTotal,
    tax: invoiceData.taxAmount,
    receiptNumber: invoiceData.invoiceNumber,
    invoiceNumber: invoiceData.invoiceNumber,
    rawText: invoiceData.rawText,
    confidence: Math.max(ocrConfidence, invoiceData.confidence),
    requiresManualEntry: invoiceData.confidence < 0.7,
    documentType: 'invoice',
    documentTypeConfidence: invoiceData.confidence,
    classificationReasoning: `Invoice scanner: ${invoiceData.extractionMethod}`,
    debugInfo: {
      selectedPass: 'invoice_scanner',
      topPasses: [{
        passName: 'invoice_scanner',
        score: invoiceData.confidence,
        confidence: ocrConfidence
      }],
      candidates: {
        vendor: invoiceData.vendorName ? [{
          value: invoiceData.vendorName,
          sourceText: invoiceData.rawText,
          confidence: invoiceData.confidence,
          reason: 'Invoice scanner extraction'
        }] : [],
        date: invoiceData.invoiceDate ? [{
          value: invoiceData.invoiceDate,
          sourceText: invoiceData.rawText,
          confidence: invoiceData.confidence,
          reason: 'Invoice scanner extraction'
        }] : [],
        amount: invoiceData.grandTotal ? [{
          value: invoiceData.grandTotal,
          sourceText: invoiceData.rawText,
          confidence: invoiceData.confidence,
          reason: 'Invoice scanner extraction'
        }] : []
      },
      // Add scoring breakdown for hybrid mode
      scoringBreakdown: scoringResult ? OCRScorer.getScoringBreakdown(scoringResult) : undefined,
      autoDetectWinner: scoringResult?.pipeline || 'invoice',
      autoDetectReasoning: scoringResult?.reasoning || 'Direct invoice mode'
    }
  };
}

// Helper function to create OCR result from fields
function createOCRResultFromFields(
  fields: ExtractedFields, 
  selectedPass: OCRPassResult, 
  allPasses: OCRPassResult[], 
  acceptance: { accept: boolean; confidence: number; requiresManualEntry: boolean },
  mode: 'fast' | 'deep'
): OCRResult {
  // Select best candidates
  const bestVendor = fields.vendor[0]?.value as string || null;
  const bestDate = fields.date[0]?.value as string || null;
  const bestAmount = fields.amount[0]?.value as number || null;
  const bestInvoiceNumber = fields.invoiceNumber?.[0]?.value as string || null;
  const bestCustomerName = fields.customerName?.[0]?.value as string || null;
  const bestReceiptNumber = fields.receiptNumber[0]?.value as string || null;
  
  // Extract classification information
  const classification = fields.classification;
  
  return {
    vendor: bestVendor,
    date: bestDate,
    amount: bestAmount,
    tax: null,
    receiptNumber: bestReceiptNumber,
    invoiceNumber: bestInvoiceNumber,
    customerName: bestCustomerName,
    documentType: fields.documentType,
    documentTypeConfidence: classification?.confidence,
    classificationReasoning: classification?.reasoning,
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
}

// Main OCR function with mode support
export async function performOCR(file: File, mode: 'fast' | 'deep' = 'fast', scanType: ScanType = 'auto'): Promise<OCRResult | null> {
  try {
    console.log('OCR_PROCESSING_START:', { mode, scanType });
    
    // Force invoice scanner if explicitly requested
    if (scanType === 'invoice') {
      console.log('INVOICE_FORCED: Using specialized invoice scanner (user selected)');
      const invoiceResult = await InvoiceScanner.processInvoice(file, {
        ocrLanguage: 'eng',
        preprocessing: true,
        maxProcessingTime: 20000,
        enableLineItems: true,
        useRegionBasedOCR: true
      });
      
      if (invoiceResult.success && invoiceResult.invoiceData) {
        return convertInvoiceResultToOCRResult(invoiceResult);
      }
      
      console.log('INVOICE_SCANNER_FAILED: Falling back to standard OCR');
    }
    
    // Force receipt OCR if explicitly requested
    if (scanType === 'receipt') {
      console.log('RECEIPT_FORCED: Using standard receipt OCR (user selected)');
      const { fields, selectedPass, allPasses } = await processReceiptOCR(file, mode);
      const acceptance = shouldAcceptResult(fields, selectedPass);
      return createOCRResultFromFields(fields, selectedPass, allPasses, acceptance, mode);
    }
    
    // Auto detect: hybrid mode - run both pipelines and select best
    if (scanType === 'auto') {
      console.log('AUTO_DETECT: Using hybrid mode - running both OCR pipelines');
      
      // Get raw image text for keyword analysis
      const rawImageText = await getRawImageText(file);
      
      // Run both OCR pipelines in parallel
      const [receiptResult, invoiceResult] = await Promise.allSettled([
        // Standard receipt OCR
        processReceiptOCR(file, mode).then(async ({ fields, selectedPass, allPasses }) => {
          const acceptance = shouldAcceptResult(fields, selectedPass);
          return createOCRResultFromFields(fields, selectedPass, allPasses, acceptance, mode);
        }).catch(error => {
          console.error('RECEIPT_OCR_ERROR:', error);
          return null;
        }),
        
        // Invoice OCR with region-based processing and supplier recovery
        InvoiceScanner.processInvoice(file, {
          ocrLanguage: 'eng',
          preprocessing: true,
          maxProcessingTime: 20000,
          enableLineItems: true,
          useRegionBasedOCR: true
        }).catch(error => {
          console.error('INVOICE_OCR_ERROR:', error);
          return null;
        })
      ]);
      
      // Extract results from Promise.allSettled
      const receiptOCRResult = receiptResult.status === 'fulfilled' ? receiptResult.value : null;
      const invoiceOCRResult = invoiceResult.status === 'fulfilled' ? invoiceResult.value : null;
      
      console.log('AUTO_DETECT: Both pipelines completed', {
        receiptSuccess: !!receiptOCRResult,
        invoiceSuccess: invoiceOCRResult?.success || false,
        receiptConfidence: receiptOCRResult?.confidence || 0,
        invoiceConfidence: invoiceOCRResult?.ocrConfidence || 0
      });
      
      // Score and select the best result
      const scoringResult = await OCRScorer.scoreAndSelectBest(
        receiptOCRResult,
        invoiceOCRResult,
        rawImageText
      );
      
      console.log('AUTO_DETECT: Scoring complete', {
        winner: scoringResult.winner,
        reasoning: scoringResult.reasoning,
        receiptScore: scoringResult.scores.receipt?.score || 0,
        invoiceScore: scoringResult.scores.invoice?.score || 0
      });
      
      // Return the best result
      if (scoringResult.winner === 'invoice' && scoringResult.bestResult) {
        const invoiceResult = scoringResult.bestResult as InvoiceScanResult;
        const invoiceScore = scoringResult.scores.invoice;
        console.log('AUTO_DETECT: Selected invoice OCR result');
        return convertInvoiceResultToOCRResult(invoiceResult, invoiceScore);
      } else if (scoringResult.winner === 'receipt' && scoringResult.bestResult) {
        console.log('AUTO_DETECT: Selected receipt OCR result');
        const receiptResult = scoringResult.bestResult as OCRResult;
        const receiptScore = scoringResult.scores.receipt;
        
        // Add scoring breakdown to receipt result
        if (receiptResult.debugInfo && receiptScore) {
          receiptResult.debugInfo.scoringBreakdown = OCRScorer.getScoringBreakdown(receiptScore);
          receiptResult.debugInfo.autoDetectWinner = 'receipt';
          receiptResult.debugInfo.autoDetectReasoning = receiptScore.reasoning;
        }
        
        return receiptResult;
      } else {
        console.log('AUTO_DETECT: No valid results, falling back to receipt OCR');
        // Fallback to receipt OCR if both failed
        if (receiptOCRResult) return receiptOCRResult;
        
        // Last resort - run receipt OCR again
        const { fields, selectedPass, allPasses } = await processReceiptOCR(file, mode);
        const acceptance = shouldAcceptResult(fields, selectedPass);
        return createOCRResultFromFields(fields, selectedPass, allPasses, acceptance, mode);
      }
    }
    
    // Standard receipt OCR processing
    const { fields, selectedPass, allPasses } = await processReceiptOCR(file, mode);
    const acceptance = shouldAcceptResult(fields, selectedPass);
    
    if (!acceptance.accept) {
      // Extract classification information even for rejected results
    const classification = fields.classification;
    
    return {
        vendor: null,
        date: null,
        amount: null,
        tax: null,
        receiptNumber: null,
        documentType: fields.documentType,
        documentTypeConfidence: classification?.confidence,
        classificationReasoning: classification?.reasoning,
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
    
    // Extract classification information
    const classification = fields.classification;
    
    return {
      vendor: bestVendor,
      date: bestDate,
      amount: bestAmount,
      tax: null,
      receiptNumber: bestReceiptNumber,
      invoiceNumber: bestInvoiceNumber,
      customerName: bestCustomerName,
      documentType: fields.documentType,
      documentTypeConfidence: classification?.confidence,
      classificationReasoning: classification?.reasoning,
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
  userId: string,
  scanType: ScanType = 'auto'
): Promise<ReceiptUploadResult> {
  console.log('=== OCR PIPELINE: UPLOAD RECEIPT START ===');
  console.log('SCAN_TYPE:', scanType);
  
  const ocrResult = await performOCR(file, 'fast', scanType);
  
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
