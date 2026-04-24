import { createWorker } from 'tesseract.js';
import { supabase } from './supabase';

export interface OCRResult {
  vendor: string | null;
  date: string | null;
  amount: number | null;
  tax: number | null;
  receiptNumber: string | null;
  rawText: string;
  confidence: number;
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

// Extract amount candidates
function extractAmountCandidates(text: string): FieldCandidate[] {
  const candidates: FieldCandidate[] = [];
  
  // Strong patterns with labels
  for (const label of MONEY_LABELS) {
    const pattern = new RegExp(`${label}\\s*[:\\=]?\\s*\\$?(\\d+[,.]?\\d*\\.?\\d{0,2})`, 'gi');
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const amount = parseFloat(match[1].replace(/[,\s]/g, ''));
      if (amount > 0 && amount < 10000) {
        candidates.push({
          value: amount,
          sourceText: match[0],
          confidence: 0.9,
          reason: `Labeled amount: ${label}`
        });
      }
    }
  }
  
  // JMD patterns
  const jmdPattern = /JMD\s*\$?(\\d+[,.]?\\d*\\.?\\d{0,2})/gi;
  let jmdMatch;
  while ((jmdMatch = jmdPattern.exec(text)) !== null) {
    const amount = parseFloat(jmdMatch[1].replace(/[,\s]/g, ''));
    if (amount > 0 && amount < 10000) {
      candidates.push({
        value: amount,
        sourceText: jmdMatch[0],
        confidence: 0.85,
        reason: 'JMD amount'
      });
    }
  }
  
  // Standalone money patterns
  const moneyPattern = /\$?(\\d{1,3}[,\s]?\\d{3}[.\s]?\\d{2})/g;
  let moneyMatch;
  while ((moneyMatch = moneyPattern.exec(text)) !== null) {
    const amount = parseFloat(moneyMatch[1].replace(/[,\s]/g, ''));
    if (amount > 0 && amount < 10000) {
      candidates.push({
        value: amount,
        sourceText: moneyMatch[0],
        confidence: 0.7,
        reason: 'Standalone money amount'
      });
    }
  }
  
  // Bottom half bonus
  const lines = text.split('\n');
  const bottomHalf = lines.slice(Math.floor(lines.length / 2));
  const bottomText = bottomHalf.join('\n');
  
  const bottomPattern = /\$?(\\d{1,3}[,\s]?\\d{3}[.\s]?\\d{2})/g;
  let bottomMatch;
  while ((bottomMatch = bottomPattern.exec(bottomText)) !== null) {
    const amount = parseFloat(bottomMatch[1].replace(/[,\s]/g, ''));
    if (amount > 0 && amount < 10000) {
      candidates.push({
        value: amount,
        sourceText: bottomMatch[0],
        confidence: 0.75,
        reason: 'Bottom half amount'
      });
    }
  }
  
  return candidates.sort((a, b) => b.confidence - a.confidence);
}

// Extract all fields from OCR text
function extractAllFields(text: string): ExtractedFields {
  return {
    vendor: extractVendorCandidates(text),
    date: extractDateCandidates(text),
    amount: extractAmountCandidates(text),
    tax: [], // TODO: Implement tax extraction
    receiptNumber: [] // TODO: Implement receipt number extraction
  };
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
          rejectionReasons: ['Insufficient data extracted']
        }
      };
    }
    
    // Select best candidates
    const bestVendor = fields.vendor[0]?.value as string || null;
    const bestDate = fields.date[0]?.value as string || null;
    const bestAmount = fields.amount[0]?.value as number || null;
    
    console.log('=== FINAL SELECTED FIELDS ===');
    console.log('VENDOR:', bestVendor);
    console.log('DATE:', bestDate);
    console.log('AMOUNT:', bestAmount);
    
    return {
      vendor: bestVendor,
      date: bestDate,
      amount: bestAmount,
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
        }
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
