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
  requiresManualEntry?: boolean;
}

export interface ReceiptUploadResult {
  receiptId: string;
  storagePath: string;
  ocrResult: OCRResult | null;
}

// Multi-pass OCR result interface
interface MultiPassOCRResult {
  passName: string;
  rawText: string;
  confidence: number;
  score: number;
  textLength: number;
  keywordCount: number;
  moneyCount: number;
  dateCount: number;
  readableWordRatio: number;
}

// OCR scoring weights
const OCR_SCORE_WEIGHTS = {
  confidence: 0.25,
  textLength: 0.20,
  keywords: 0.25,
  money: 0.15,
  dates: 0.10,
  readability: 0.05
};

// Receipt keywords for scoring
const RECEIPT_KEYWORDS = [
  'TOTAL', 'CASH', 'PAYMENT', 'DATE', 'RECEIPT', 'FARE', 'TAX', 'JMD', 'JMO',
  'AMOUNT', 'DUE', 'BALANCE', 'SALE', 'NET', 'GRAND', 'SUBTOTAL', 'CHANGE',
  'INVOICE', 'ORDER', 'TRANSACTION', 'PURCHASE', 'RECEIVED', 'THANK'
];

// Create multiple image variants for OCR
async function createImageVariants(imageDataUrl: string): Promise<{ name: string; dataUrl: string }[]> {
  console.log('=== CREATING IMAGE VARIANTS ===');
  
  const variants: { name: string; dataUrl: string }[] = [];
  
  // Original image
  variants.push({ name: 'original', dataUrl: imageDataUrl });
  
  try {
    // Create canvas for image processing
    const img = new Image();
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      img.src = imageDataUrl;
    });
    
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Cannot get canvas context');
    
    canvas.width = img.width;
    canvas.height = img.height;
    
    // 1. Grayscale variant
    ctx.drawImage(img, 0, 0);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    
    for (let i = 0; i < data.length; i += 4) {
      const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
      data[i] = gray;
      data[i + 1] = gray;
      data[i + 2] = gray;
    }
    
    ctx.putImageData(imageData, 0, 0);
    variants.push({ name: 'grayscale', dataUrl: canvas.toDataURL() });
    
    // 2. Contrast boosted variant
    ctx.drawImage(img, 0, 0);
    const contrastData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const contrastPixels = contrastData.data;
    const factor = 1.5; // Contrast boost
    
    for (let i = 0; i < contrastPixels.length; i += 4) {
      contrastPixels[i] = Math.min(255, Math.max(0, factor * (contrastPixels[i] - 128) + 128));
      contrastPixels[i + 1] = Math.min(255, Math.max(0, factor * (contrastPixels[i + 1] - 128) + 128));
      contrastPixels[i + 2] = Math.min(255, Math.max(0, factor * (contrastPixels[i + 2] - 128) + 128));
    }
    
    ctx.putImageData(contrastData, 0, 0);
    variants.push({ name: 'contrast', dataUrl: canvas.toDataURL() });
    
    // 3. Sharpened variant
    ctx.drawImage(img, 0, 0);
    const sharpenData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const sharpenPixels = sharpenData.data;
    const width = canvas.width;
    const height = canvas.height;
    
    // Simple sharpen kernel
    const kernel = [0, -1, 0, -1, 5, -1, 0, -1, 0];
    const tempData = new Uint8ClampedArray(sharpenPixels);
    
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        for (let c = 0; c < 3; c++) {
          let sum = 0;
          for (let ky = -1; ky <= 1; ky++) {
            for (let kx = -1; kx <= 1; kx++) {
              const idx = ((y + ky) * width + (x + kx)) * 4 + c;
              sum += tempData[idx] * kernel[(ky + 1) * 3 + (kx + 1)];
            }
          }
          sharpenPixels[(y * width + x) * 4 + c] = Math.min(255, Math.max(0, sum));
        }
      }
    }
    
    ctx.putImageData(sharpenData, 0, 0);
    variants.push({ name: 'sharpened', dataUrl: canvas.toDataURL() });
    
    // 4. Black/white threshold variant
    ctx.drawImage(img, 0, 0);
    const thresholdData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const thresholdPixels = thresholdData.data;
    const threshold = 128;
    
    for (let i = 0; i < thresholdPixels.length; i += 4) {
      const gray = thresholdPixels[i] * 0.299 + thresholdPixels[i + 1] * 0.587 + thresholdPixels[i + 2] * 0.114;
      const binary = gray > threshold ? 255 : 0;
      thresholdPixels[i] = binary;
      thresholdPixels[i + 1] = binary;
      thresholdPixels[i + 2] = binary;
    }
    
    ctx.putImageData(thresholdData, 0, 0);
    variants.push({ name: 'threshold', dataUrl: canvas.toDataURL() });
    
    // 5. Enlarged 2x variant
    const largeCanvas = document.createElement('canvas');
    const largeCtx = largeCanvas.getContext('2d');
    if (!largeCtx) throw new Error('Cannot get large canvas context');
    
    largeCanvas.width = img.width * 2;
    largeCanvas.height = img.height * 2;
    largeCtx.imageSmoothingEnabled = false; // Pixelated for better OCR
    largeCtx.drawImage(img, 0, 0, largeCanvas.width, largeCanvas.height);
    variants.push({ name: 'enlarged_2x', dataUrl: largeCanvas.toDataURL() });
    
    // 6. Enlarged 3x variant
    const x3Canvas = document.createElement('canvas');
    const x3Ctx = x3Canvas.getContext('2d');
    if (!x3Ctx) throw new Error('Cannot get 3x canvas context');
    
    x3Canvas.width = img.width * 3;
    x3Canvas.height = img.height * 3;
    x3Ctx.imageSmoothingEnabled = false; // Pixelated for better OCR
    x3Ctx.drawImage(img, 0, 0, x3Canvas.width, x3Canvas.height);
    variants.push({ name: 'enlarged_3x', dataUrl: x3Canvas.toDataURL() });
    
  } catch (error) {
    console.error('Error creating image variants:', error);
    // If image processing fails, at least return the original
  }
  
  console.log('CREATED VARIANTS:', variants.map(v => v.name));
  return variants;
}

// Score OCR result
function scoreOCRResult(passName: string, rawText: string, confidence: number): MultiPassOCRResult {
  console.log(`=== SCORING OCR PASS: ${passName} ===`);
  
  // Count receipt keywords
  const upperText = rawText.toUpperCase();
  const keywordCount = RECEIPT_KEYWORDS.reduce((count, keyword) => {
    return count + (upperText.includes(keyword) ? 1 : 0);
  }, 0);
  
  // Count valid money values
  const moneyMatches = rawText.match(/\b(\d{1,5}[,.]?\d{0,3}\.\d{2})\b/g);
  const moneyCount = moneyMatches ? moneyMatches.length : 0;
  
  // Count valid date-like values
  const dateMatches = rawText.match(/\b(\d{1,2}[\/\-,\s]\d{1,2}[\/\-,\s]\d{2,4})\b/g);
  const dateCount = dateMatches ? dateMatches.length : 0;
  
  // Calculate readable word ratio
  const words = rawText.split(/\s+/).filter(word => word.length > 0);
  const readableWords = words.filter(word => word.length > 1 && /^[a-zA-Z]+$/.test(word));
  const readableWordRatio = words.length > 0 ? readableWords.length / words.length : 0;
  
  // Calculate weighted score
  const normalizedConfidence = confidence;
  const normalizedLength = Math.min(rawText.length / 500, 1); // Normalize to 0-1 (500 chars = max)
  const normalizedKeywords = Math.min(keywordCount / 5, 1); // Normalize to 0-1 (5 keywords = max)
  const normalizedMoney = Math.min(moneyCount / 3, 1); // Normalize to 0-1 (3 amounts = max)
  const normalizedDates = Math.min(dateCount / 2, 1); // Normalize to 0-1 (2 dates = max)
  
  const score = 
    normalizedConfidence * OCR_SCORE_WEIGHTS.confidence +
    normalizedLength * OCR_SCORE_WEIGHTS.textLength +
    normalizedKeywords * OCR_SCORE_WEIGHTS.keywords +
    normalizedMoney * OCR_SCORE_WEIGHTS.money +
    normalizedDates * OCR_SCORE_WEIGHTS.dates +
    readableWordRatio * OCR_SCORE_WEIGHTS.readability;
  
  const result: MultiPassOCRResult = {
    passName,
    rawText,
    confidence,
    score,
    textLength: rawText.length,
    keywordCount,
    moneyCount,
    dateCount,
    readableWordRatio
  };
  
  console.log('OCR_SCORE_RESULT:', {
    passName,
    confidence,
    score: score.toFixed(3),
    textLength: rawText.length,
    keywordCount,
    moneyCount,
    dateCount,
    readableWordRatio: readableWordRatio.toFixed(2)
  });
  
  return result;
}

// Run OCR on multiple image variants and select best result
async function runMultiPassOCR(imageDataUrl: string): Promise<MultiPassOCRResult> {
  console.log('=== MULTI-PASS OCR START ===');
  
  // Create image variants
  const variants = await createImageVariants(imageDataUrl);
  
  // Run OCR on each variant
  const worker = await createWorker('eng');
  const results: MultiPassOCRResult[] = [];
  
  try {
    for (const variant of variants) {
      console.log(`Running OCR on variant: ${variant.name}`);
      
      const { data: { text, confidence } } = await worker.recognize(variant.dataUrl);
      
      const result = scoreOCRResult(variant.name, text, confidence / 100);
      results.push(result);
      
      console.log(`OCR PASS ${variant.name}: confidence=${(confidence/100).toFixed(2)}, score=${result.score.toFixed(3)}`);
    }
  } finally {
    await worker.terminate();
  }
  
  // Sort by score (highest first) and select best
  results.sort((a, b) => b.score - a.score);
  const bestResult = results[0];
  
  console.log('=== MULTI-PASS OCR RESULTS ===');
  results.forEach((result, index) => {
    console.log(`${index + 1}. ${result.passName}: score=${result.score.toFixed(3)}, confidence=${result.confidence.toFixed(2)}, length=${result.textLength}`);
  });
  
  console.log('=== SELECTED BEST OCR RESULT ===');
  console.log('BEST_PASS:', bestResult.passName);
  console.log('BEST_SCORE:', bestResult.score.toFixed(3));
  console.log('BEST_CONFIDENCE:', bestResult.confidence.toFixed(2));
  console.log('BEST_TEXT_PREVIEW:', bestResult.rawText.substring(0, 300) + (bestResult.rawText.length > 300 ? '...' : ''));
  
  return bestResult;
}

function isGarbageOCR(rawText: string, confidence: number, parsedFields: {
  vendor: string | null;
  date: string | null;
  amount: number | null;
  tax: number | null;
  receiptNumber: string | null;
}): boolean {
  console.log('=== GARBAGE DETECTION DEBUG ===');
  console.log('INPUT:', { confidence, parsedFields, rawTextLength: rawText.length });

  // NEW: Check if we have likely vendor + amount - don't reject these
  const hasVendorAndAmount = parsedFields.vendor && parsedFields.amount;
  const meaningfulTokens = rawText.split(/\s+/).filter(word => word.length > 2).length;
  const hasMeaningfulTokens = meaningfulTokens >= 3;
  
  if (hasVendorAndAmount && hasMeaningfulTokens) {
    console.log('GARBAGE OCR: NOT GARBAGE - Has vendor + amount + meaningful tokens');
    return false;
  }

  // Rule 1: Low confidence - more lenient with meaningful tokens
  const confidenceThreshold = hasMeaningfulTokens ? 0.35 : 0.45;
  if (confidence < confidenceThreshold) {
    console.log('GARBAGE OCR: Low confidence', confidence, '(threshold:', confidenceThreshold, ')');
    return true;
  }

  // Rule 2: Raw text mostly symbols/noise
  const nonAlphanumericCount = (rawText.match(/[^a-zA-Z0-9\s]/g) || []).length;
  const totalChars = rawText.length;
  if (nonAlphanumericCount > totalChars * 0.4) {
    console.log('GARBAGE OCR: Too many symbols', nonAlphanumericCount, '/', totalChars);
    return true;
  }

  // Rule 3: Less than 3 real words - more lenient
  const words = rawText.split(/\s+/).filter(word => word.length > 0);
  const realWords = words.filter(word => word.length > 1 && /^[a-zA-Z]+$/.test(word));
  if (realWords.length < 2) { // Reduced from 3 to 2
    console.log('GARBAGE OCR: Not enough real words', realWords.length);
    return true;
  }

  // Rule 4: Average word length < 2
  const avgWordLength = words.reduce((sum, word) => sum + word.length, 0) / words.length;
  if (avgWordLength < 2) {
    console.log('GARBAGE OCR: Average word length too low', avgWordLength);
    return true;
  }

  // Rule 5: Repeated random characters
  const repeatedChars = (rawText.match(/(.)\1{3,}/g) || []).length;
  if (repeatedChars > 2) {
    console.log('GARBAGE OCR: Too many repeated characters', repeatedChars);
    return true;
  }

  // Rule 6: Only 1 tiny field detected
  const detectedFields = [
    parsedFields.vendor,
    parsedFields.date,
    parsedFields.amount,
    parsedFields.tax,
    parsedFields.receiptNumber
  ].filter(field => field !== null);
  
  if (detectedFields.length === 1) {
    const singleField = detectedFields[0];
    const isTinyField = (
      (typeof singleField === 'string' && singleField.length <= 1) ||
      (typeof singleField === 'number' && singleField < 10)
    );
    
    if (isTinyField) {
      console.log('GARBAGE OCR: Only 1 tiny field detected', singleField);
      return true;
    }
  }

  // Rule 7: Vendor/date/amount/tax all null - but allow if meaningful tokens exist
  const mainFields = [parsedFields.vendor, parsedFields.date, parsedFields.amount, parsedFields.tax];
  const allMainFieldsNull = mainFields.every(field => field === null);
  
  if (allMainFieldsNull && !hasMeaningfulTokens) {
    console.log('GARBAGE OCR: All main fields null AND no meaningful tokens');
    return true;
  }

  console.log('GARBAGE OCR: NOT GARBAGE - Passed all checks');
  return false;
}

// Weighted scoring for structured result acceptance
function calculateAcceptanceScore(parsedFields: any, ocrResult: any): number {
  let score = 0;
  const factors = [];
  
  // Extracted fields count (40% weight)
  const extractedFields = [
    parsedFields.vendor ? 1 : 0,
    parsedFields.date ? 1 : 0,
    parsedFields.amount ? 1 : 0,
    parsedFields.tax ? 1 : 0,
    parsedFields.receiptNumber ? 1 : 0
  ].reduce((sum, field) => sum + field, 0);
  
  const fieldsScore = extractedFields * 0.4;
  score += fieldsScore;
  factors.push(`Fields: ${extractedFields}/5 (${(fieldsScore * 100).toFixed(1)}%)`);
  
  // OCR text length (20% weight)
  const textLength = ocrResult.rawText ? ocrResult.rawText.length : 0;
  const lengthScore = Math.min(textLength / 200, 1) * 0.2;
  score += lengthScore;
  factors.push(`Length: ${textLength} chars (${(lengthScore * 100).toFixed(1)}%)`);
  
  // Keyword matches (20% weight)
  const keywords = ['TOTAL', 'CASH', 'PAYMENT', 'DATE', 'RECEIPT', 'AMOUNT', 'DUE', 'BALANCE', 'SALE', 'TAX', 'JMD', 'JMO'];
  const keywordMatches = keywords.filter(keyword => 
    ocrResult.rawText && ocrResult.rawText.toUpperCase().includes(keyword)
  ).length;
  const keywordScore = (keywordMatches / keywords.length) * 0.2;
  score += keywordScore;
  factors.push(`Keywords: ${keywordMatches}/${keywords.length} (${(keywordScore * 100).toFixed(1)}%)`);
  
  // Numeric plausibility (20% weight)
  let plausibilityScore = 0;
  if (parsedFields.amount && parsedFields.amount > 0 && parsedFields.amount < 10000) {
    plausibilityScore += 0.1;
  }
  if (parsedFields.date) {
    plausibilityScore += 0.1;
  }
  score += plausibilityScore;
  factors.push(`Plausibility: ${(plausibilityScore * 100).toFixed(1)}%`);
  
  console.log('ACCEPTANCE_SCORE_FACTORS:', factors);
  console.log('FINAL_ACCEPTANCE_SCORE:', score);
  
  return score;
}

// Determine if manual entry should be required based on weighted criteria
function shouldRequireManualEntry(parsedFields: any, ocrResult: any, acceptanceScore: number): boolean {
  console.log('=== MANUAL ENTRY DECISION ===');
  console.log('ACCEPTANCE_SCORE:', acceptanceScore);
  
  // Check for garbage OCR first
  const isGarbage = isGarbageOCR(ocrResult.rawText, ocrResult.confidence, parsedFields);
  if (isGarbage) {
    console.log('MANUAL_ENTRY_REQUIRED: Garbage OCR detected');
    return true;
  }
  
  // PRIORITY 1: If amount + date exist, ALWAYS return structured result
  const hasAmountAndDate = !!(parsedFields.amount && parsedFields.date);
  if (hasAmountAndDate) {
    console.log('MANUAL_ENTRY_NOT_REQUIRED: Amount + Date found - ALWAYS ACCEPT');
    return false;
  }
  
  // PRIORITY 2: If amount + readable OCR text exist, return low-confidence result
  const hasAmountAndText = !!(parsedFields.amount && ocrResult.rawText && ocrResult.rawText.trim().length > 50);
  if (hasAmountAndText) {
    console.log('MANUAL_ENTRY_NOT_REQUIRED: Amount + readable text found - LOW CONFIDENCE ACCEPT');
    return false;
  }
  
  // PRIORITY 3: If date + vendor exist, return low-confidence result
  const hasDateAndVendor = !!(parsedFields.date && parsedFields.vendor);
  if (hasDateAndVendor) {
    console.log('MANUAL_ENTRY_NOT_REQUIRED: Date + Vendor found - LOW CONFIDENCE ACCEPT');
    return false;
  }
  
  // PRIORITY 4: Check for known words in OCR text even if vendor missing
  if (ocrResult.rawText && ocrResult.rawText.trim().length > 30) {
    const knownWords = ['TRANSJAM', 'MAY PEN WEST', 'RECEIPT', 'PASSAGE', 'TOTAL', 'CASH', 'JMD'];
    const hasKnownWords = knownWords.some(word => 
      ocrResult.rawText.toUpperCase().includes(word)
    );
    
    if (hasKnownWords) {
      console.log('MANUAL_ENTRY_NOT_REQUIRED: Known words found in OCR text - LOW CONFIDENCE ACCEPT');
      return false;
    }
  }
  
  // FINAL GATE: "No reliable data detected" only when truly empty
  const hasAnyData = !!(parsedFields.vendor || parsedFields.date || parsedFields.amount || parsedFields.tax || parsedFields.receiptNumber);
  const hasRawText = !!(ocrResult.rawText && ocrResult.rawText.trim().length > 20);
  
  if (!hasAnyData && !hasRawText) {
    console.log('MANUAL_ENTRY_REQUIRED: No data and no meaningful text');
    return true;
  }
  
  // If none of the above, use acceptance score threshold (very lenient)
  const scoreThreshold = 0.2; // Extremely lenient threshold
  const shouldAccept = acceptanceScore >= scoreThreshold;
  
  console.log('MANUAL_ENTRY_DECISION:', {
    acceptanceScore,
    threshold: scoreThreshold,
    shouldAccept,
    reason: shouldAccept ? 'Score above threshold' : 'Score below threshold'
  });
  
  return !shouldAccept;
}

// New multi-pass OCR function
async function performMultiPassOCR(file: File): Promise<OCRResult | null> {
  console.log('=== MULTI-PASS OCR: START ===');
  
  try {
    // Convert file to data URL for image processing
    const imageDataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    
    // Run multi-pass OCR
    const bestOCRResult = await runMultiPassOCR(imageDataUrl);
    
    // Parse the best OCR result
    const parsedFields = {
      vendor: extractVendor(bestOCRResult.rawText),
      date: extractDate(bestOCRResult.rawText),
      amount: extractAmount(bestOCRResult.rawText, bestOCRResult.confidence),
      tax: extractTax(bestOCRResult.rawText),
      receiptNumber: extractReceiptNumber(bestOCRResult.rawText)
    };
    
    // Apply fallback extraction if needed
    const shouldUseFallback = (
      bestOCRResult.confidence >= 0.30 && 
      bestOCRResult.confidence <= 0.50 &&
      bestOCRResult.rawText.length > 80 &&
      bestOCRResult.rawText.split(/\s+/).filter(word => word.length > 2).length >= 3
    );

    if (shouldUseFallback) {
      console.log('=== FALLBACK HEURISTIC EXTRACTION ===');
      const fallbackFields = extractFallbackFields(bestOCRResult.rawText);
      
      // Use fallback fields only if strict parsing failed
      if (!parsedFields.vendor && fallbackFields.vendor) {
        parsedFields.vendor = fallbackFields.vendor;
        console.log('FALLBACK_VENDOR:', fallbackFields.vendor);
      }
      
      if (!parsedFields.date && fallbackFields.date) {
        parsedFields.date = fallbackFields.date;
        console.log('FALLBACK_DATE:', fallbackFields.date);
      }
      
      if (!parsedFields.amount && fallbackFields.amount) {
        parsedFields.amount = fallbackFields.amount;
        console.log('FALLBACK_AMOUNT:', fallbackFields.amount);
      }
      
      if (!parsedFields.receiptNumber && fallbackFields.receiptNumber) {
        parsedFields.receiptNumber = fallbackFields.receiptNumber;
        console.log('FALLBACK_RECEIPT_NUMBER:', fallbackFields.receiptNumber);
      }
      
      // Mark confidence as low but usable
      bestOCRResult.confidence = Math.min(bestOCRResult.confidence, 0.35);
    }
    
    // Weighted scoring for structured result acceptance
    const acceptanceScore = calculateAcceptanceScore(parsedFields, bestOCRResult);
    console.log('=== ACCEPTANCE SCORING ===');
    console.log('ACCEPTANCE_SCORE:', acceptanceScore);
    
    // Determine if manual entry is required based on weighted criteria
    const requiresManualEntry = shouldRequireManualEntry(parsedFields, bestOCRResult, acceptanceScore);
    
    // Adjust confidence based on acceptance score
    if (!requiresManualEntry && acceptanceScore < 0.7) {
      bestOCRResult.confidence = Math.min(bestOCRResult.confidence, 0.6);
      console.log('CONFIDENCE_ADJUSTED_DOWN:', bestOCRResult.confidence);
    }
    
    console.log('=== MULTI-PASS OCR: RESULTS ===');
    console.log('BEST_PASS:', bestOCRResult.passName);
    console.log('FINAL_CONFIDENCE:', bestOCRResult.confidence);
    console.log('PARSED_FIELDS:', parsedFields);
    console.log('REQUIRES_MANUAL_ENTRY:', requiresManualEntry);
    
    return {
      vendor: parsedFields.vendor,
      date: parsedFields.date,
      amount: parsedFields.amount,
      tax: parsedFields.tax,
      receiptNumber: parsedFields.receiptNumber,
      rawText: bestOCRResult.rawText,
      confidence: bestOCRResult.confidence,
      requiresManualEntry
    };
    
  } catch (error) {
    console.error('Multi-pass OCR failed:', error);
    return null;
  }
}

export async function uploadReceipt(
  file: File,
  companyId: string,
  userId: string
): Promise<ReceiptUploadResult> {
  console.log('=== OCR PIPELINE: UPLOAD RECEIPT START ===');
  console.log('OCR_INPUT_FILE:', {
    name: file.name,
    size: file.size,
    type: file.type,
    constructor: file.constructor.name,
    isFile: file instanceof File,
    isBlob: file instanceof Blob,
    lastModified: file.lastModified
  });
  console.log('OCR_CONTEXT:', { companyId, userId });

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  const fileExt = file.name.split('.').pop()?.toLowerCase();
  const uuid = crypto.randomUUID();
  const storagePath = `${year}/${month}/${uuid}_${file.name}`;

  const { data: uploadData, error: uploadError } = await supabase.storage
    .from('receipts')
    .upload(storagePath, file, {
      contentType: file.type,
      upsert: false,
    });

  if (uploadError) {
    throw new Error(`Failed to upload receipt: ${uploadError.message}`);
  }

  let ocrResult: OCRResult | null = null;

  if (file.type.startsWith('image/')) {
    try {
      ocrResult = await performMultiPassOCR(file);
    } catch (error) {
      console.warn('Multi-pass OCR failed, continuing without OCR data:', error);
    }
  }

  const receiptRecord = {
    company_id: companyId,
    storage_path: storagePath,
    original_filename: file.name,
    file_type: file.type,
    file_size: file.size,
    upload_year: year,
    upload_month: month,
    created_by: userId,
    ocr_vendor: ocrResult?.vendor || null,
    ocr_date: ocrResult?.date || null,
    ocr_amount: ocrResult?.amount || null,
    ocr_tax: ocrResult?.tax || null,
    ocr_receipt_number: ocrResult?.receiptNumber || null,
    ocr_raw_text: ocrResult?.rawText || null,
    ocr_confidence: ocrResult?.confidence || null,
    ocr_processed_at: ocrResult ? new Date().toISOString() : null,
  };

  const { data: receipt, error: dbError } = await supabase
    .from('receipt_archive')
    .insert(receiptRecord)
    .select()
    .single();

  if (dbError) {
    await supabase.storage.from('receipts').remove([storagePath]);
    throw new Error(`Failed to save receipt record: ${dbError.message}`);
  }

  console.log('OCR_FLOW_STEP_1 uploadReceipt returned:', {
    receiptId: receipt.id,
    storagePath,
    ocrResult: ocrResult ? {
      hasData: !!(ocrResult.vendor || ocrResult.date || ocrResult.amount),
      vendor: ocrResult.vendor,
      date: ocrResult.date,
      amount: ocrResult.amount,
      tax: ocrResult.tax,
      receiptNumber: ocrResult.receiptNumber,
      confidence: ocrResult.confidence
    } : null
  });

  return {
    receiptId: receipt.id,
    storagePath,
    ocrResult,
  };
}


function extractVendor(text: string): string | null {
  const lines = text.split('\n').filter(line => line.trim().length > 0);

  if (lines.length === 0) return null;

  console.log('=== VENDOR EXTRACTION DEBUG ===');
  console.log('INPUT_LINES:', lines);

  // Known brands - high priority
  const knownBrands = [
    'transjam', 'jps', 'flow', 'digicel', 'lime', 'fesco', 'jpsco'
  ];

  // Business keywords for vendor detection - expanded
  const businessKeywords = [
    'ltd', 'limited', 'shop', 'mart', 'hardware', 'pharmacy', 'wholesale', 
    'supermarket', 'supplies', 'restaurant', 'bar', 'store', 'trading',
    'passage', 'west', 'pen', 'express', 'gas', 'station', 'market', 'plaza',
    'centre', 'center', 'mall', 'complex', 'building', 'tower', 'court',
    'receipt', 'cash', 'jmd', 'jmo', 'lumber', 'harbour', 'road'
  ];

  // Address/location words to reject (but allow in business names)
  const addressWords = [
    'p.o.', 'po box', 'box', 'avenue', 'ave', 'drive', 'dr', 'boulevard', 'blvd', 'court', 'ct'
  ];

  // Fragments and prefixes to strip
  const fragmentsToStrip = [
    /^mall:\s*/i, /^email:\s*/i, /^phone:\s*/i, /^tel:\s*/i, /^fax:\s*/i,
    /^www\./i, /^http/i, /^[^\w\s]+/, /^\d+[^\w\s]*/, /^\w{1,2}[:\.\-]\s*/
  ];

  const candidates = [];
  const rejectedReasons: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let trimmed = line.trim();
    
    // Strip common fragments and prefixes
    for (const fragment of fragmentsToStrip) {
      trimmed = trimmed.replace(fragment, '');
    }
    
    // Skip empty after stripping
    if (!trimmed) {
      rejectedReasons.push(`Line ${i}: Empty after stripping`);
      continue;
    }
    
    // Minimum quality threshold: must contain vowels + word structure + length > 5
    const hasVowels = /[aeiouAEIOU]/.test(trimmed);
    const wordCount = trimmed.split(/\s+/).filter(word => word.length > 0).length;
    if (!hasVowels || wordCount < 2 || trimmed.length <= 5) {
      rejectedReasons.push(`Line ${i}: Fails minimum quality (vowels: ${hasVowels}, words: ${wordCount}, length: ${trimmed.length})`);
      continue;
    }
    
    // Skip lines longer than 50 chars
    if (trimmed.length > 50) {
      rejectedReasons.push(`Line ${i}: Too long (${trimmed.length} chars)`);
      continue;
    }
    
    // Detect if this is a clipped fragment (penalize heavily)
    const tokens = trimmed.split(/\s+/);
    const shortFragments = tokens.filter(token => token.length <= 2).length;
    const isClippedFragment = shortFragments >= tokens.length * 0.5 || 
                             tokens.some(token => token.length <= 1) ||
                             trimmed.length <= 8;
    
    if (isClippedFragment) {
      rejectedReasons.push(`Line ${i}: Clipped fragment detected`);
      continue;
    }
    
    // Count clean words (letters only, length >= 3)
    const cleanWords = trimmed.split(/\s+/).filter(word => 
      word.length >= 3 && /^[a-zA-Z]+$/.test(word)
    );
    
    // Prefer 2-4 word uppercase location/business phrases
    const isUppercasePhrase = trimmed === trimmed.toUpperCase() && !/\d/.test(trimmed);
    const wordCountInRange = wordCount >= 2 && wordCount <= 4;
    const isLocationPhrase = businessKeywords.some(keyword => 
      trimmed.toLowerCase().includes(keyword)
    );
    
    // Check for known brands (score high)
    const hasKnownBrand = knownBrands.some(brand => 
      trimmed.toLowerCase().includes(brand)
    );
    
    // NEW: Reject lines that look like OCR noise
    // Pattern: alternating short fragments, random capitals, mixed case
    const hasOcrNoise = (
      // Too many alternating case patterns
      (trimmed.match(/[A-Z][a-z][A-Z][a-z]/g) || []).length > 1 ||
      // Random capital letters in middle of words
      (trimmed.match(/[a-z][A-Z][a-z]/g) || []).length > 1 ||
      // Too many single character words
      (trimmed.match(/\b[a-zA-Z]\b/g) || []).length > trimmed.split(/\s+/).length * 0.3
    );
    if (hasOcrNoise) {
      rejectedReasons.push(`Line ${i}: OCR noise pattern detected`);
      continue;
    }
    
    // Skip address/location lines
    const lowerLine = trimmed.toLowerCase();
    if (addressWords.some(word => lowerLine.includes(word))) {
      rejectedReasons.push(`Line ${i}: Contains address words`);
      continue;
    }
    
    // Reject lines that look like addresses (street numbers + location words)
    if (/^\d+\s+\d+/i.test(trimmed) || /^\d+\s+[a-z]/i.test(trimmed)) {
      rejectedReasons.push(`Line ${i}: Looks like address/phone`);
      continue;
    }
    
    // Accept if: known brand OR complete uppercase location/business phrase
    const shouldAccept = hasKnownBrand || 
                        (isUppercasePhrase && wordCountInRange && isLocationPhrase) ||
                        (isUppercasePhrase && wordCountInRange && cleanWords.length >= 2);
    
    if (!shouldAccept) {
      rejectedReasons.push(`Line ${i}: Fails vendor acceptance (brand: ${hasKnownBrand}, uppercase phrase: ${isUppercasePhrase}, word count: ${wordCountInRange}, location: ${isLocationPhrase}, clean words: ${cleanWords.length})`);
      continue;
    }
    
    // Calculate score - prefer complete phrases over fragments
    let score = 0;
    
    // High priority for known brands
    if (hasKnownBrand) {
      score += 50;
      console.log(`KNOWN_BRAND_BONUS: +50 for "${trimmed}"`);
    }
    
    // Strong bonus for complete uppercase location/business phrases (2-4 words)
    if (isUppercasePhrase && wordCountInRange && isLocationPhrase) {
      score += 40;
      console.log(`LOCATION_PHRASE_BONUS: +40 for "${trimmed}"`);
    }
    
    // Bonus for complete uppercase phrases with clean words
    if (isUppercasePhrase && wordCountInRange && cleanWords.length >= 2) {
      score += 30;
      console.log(`UPPERCASE_PHRASE_BONUS: +30 for "${trimmed}"`);
    }
    
    // Medium bonus for business keywords
    if (isLocationPhrase) {
      score += 20;
    }
    
    // Small bonus for clean words
    score += cleanWords.length * 5;
    
    // Position bonus (top lines are more likely to be vendor)
    const positionBonus = Math.max(0, 25 - (i * 5)); // 25, 20, 15, 10, 5, 0...
    score += positionBonus;
    
    // Penalty for any remaining fragment indicators
    if (shortFragments > 0) {
      score -= shortFragments * 10;
      console.log(`FRAGMENT_PENALTY: -${shortFragments * 10} for "${trimmed}"`);
    }
    
    candidates.push({ 
      line: trimmed, 
      score, 
      originalLine: line,
      index: i,
      hasBusinessKeyword: isLocationPhrase,
      cleanWords: cleanWords.length,
      totalWords: wordCount
    });
  }

  // Sort by score, then by position (top lines first)
  candidates.sort((a, b) => {
    if (a.score !== b.score) {
      return b.score - a.score;
    }
    return a.index - b.index;
  });

  // Debug logging
  console.log('RECEIPT_VENDOR_DEBUG', {
    candidates: candidates.map(c => ({
      line: c.line,
      score: c.score,
      index: c.index,
      hasBusinessKeyword: c.hasBusinessKeyword,
      cleanWords: c.cleanWords,
      totalWords: c.totalWords
    })),
    acceptedVendor: candidates.length > 0 ? candidates[0].line : null,
    rejectedReasons
  });

  // FINAL HARD GATE: Reject any remaining garbage candidates
  if (candidates.length > 0) {
    const best = candidates[0];
    
    // OCR junk tokens to reject
    const ocrJunkTokens = [
      'plim', 'waaay', 'nyj', 'hx', 'tis', 'rrr', 'sn', 'ec', 'fri', 'ter', 'ere',
      'sn', 'hx', 'fe', 'tis', 'plim', 'waaay', 'nyj', 'ec', 'rrr'
    ];
    
    // Check for digits
    if (/\d/.test(best.line)) {
      rejectedReasons.push(`Final gate: Contains digits`);
      return null;
    }
    
    // Check for parentheses
    if (/[()]/.test(best.line)) {
      rejectedReasons.push(`Final gate: Contains parentheses`);
      return null;
    }
    
    // Check for commas with fragmented text
    if (/,\s*\w{1,3}\b/.test(best.line)) {
      rejectedReasons.push(`Final gate: Contains commas with fragmented text`);
      return null;
    }
    
    // Check for more than 1 non-letter symbol
    const nonLetterSymbols = (best.line.match(/[^a-zA-Z\s]/g) || []).length;
    if (nonLetterSymbols > 1) {
      rejectedReasons.push(`Final gate: Too many non-letter symbols (${nonLetterSymbols})`);
      return null;
    }
    
    // Check for fewer than 2 clean words of length >= 3
    const cleanWords = best.line.split(/\s+/).filter(word => 
      word.length >= 3 && /^[a-zA-Z]+$/.test(word)
    );
    if (cleanWords.length < 2) {
      rejectedReasons.push(`Final gate: Not enough clean words (${cleanWords.length})`);
      return null;
    }
    
    // Check for words with repeated weird caps like WAAAY
    const hasWeirdCaps = /\b[A-Z]{3,}\b/.test(best.line) || 
                        /\b[a-z]*[A-Z]{2,}[a-z]*\b/.test(best.line);
    if (hasWeirdCaps) {
      rejectedReasons.push(`Final gate: Contains weird capitalization patterns`);
      return null;
    }
    
    // Check if overall line matches mostly letters/spaces
    const letterCount = (best.line.match(/[a-zA-Z]/g) || []).length;
    const spaceCount = (best.line.match(/\s/g) || []).length;
    if ((letterCount + spaceCount) < best.line.length * 0.8) {
      rejectedReasons.push(`Final gate: Not enough letters/spaces (${letterCount + spaceCount}/${best.line.length})`);
      return null;
    }
    
    // Check for OCR junk tokens
    const lowerLine = best.line.toLowerCase();
    const hasJunkTokens = ocrJunkTokens.some(token => lowerLine.includes(token));
    if (hasJunkTokens) {
      rejectedReasons.push(`Final gate: Contains OCR junk tokens`);
      return null;
    }
    
    // FINAL ACCEPTANCE: Only allow if strong business keyword OR perfect clean text
    const strongBusinessKeywords = [
      'ltd', 'limited', 'hardware', 'pharmacy', 'supermarket', 
      'wholesale', 'supplies', 'mart', 'shop', 'restaurant', 'bar'
    ];
    const hasStrongBusinessKeyword = strongBusinessKeywords.some(keyword => 
      lowerLine.includes(keyword)
    );
    
    // Must have strong business keyword OR be exceptionally clean
    if (!hasStrongBusinessKeyword) {
      // For non-business lines, require even stricter criteria
      const allWordsClean = best.line.split(/\s+/).every(word => 
        word.length >= 3 && /^[a-zA-Z]+$/.test(word) && word.length <= 15
      );
      
      if (!allWordsClean) {
        rejectedReasons.push(`Final gate: No strong business keyword and not perfectly clean`);
        return null;
      }
    }
    
    // Passed all gates - return the vendor
    return best.line;
  }

  // If no candidate passes, return null
  return null;
}


function extractDate(text: string): string | null {
  console.log('=== DATE EXTRACTION DEBUG ===');
  console.log('INPUT_TEXT:', text);

  // Enhanced date patterns - include noisy OCR formats and repair
  const datePatterns = [
    // Strong Jamaican dd/mm/yyyy format with clear separators
    {
      regex: /\b(0?[1-9]|[12]\d|3[01])[\/\-](0?[1-9]|1[0-2])[\/\-](20\d{2})\b/g,
      format: 'dd/mm/yyyy',
      priority: 10
    },
    // NEW: dd/mm/yyyy with comma separators (OCR common)
    {
      regex: /\b(0?[1-9]|[12]\d|3[01])[,](0?[1-9]|1[0-2])[,](20\d{2})\b/g,
      format: 'dd_mm_yyyy_comma',
      priority: 9
    },
    // NEW: Noisy OCR date patterns - common mistakes
    {
      regex: /\b(\d{1,2})[\/\-\,](\d{1,2})[\/\-\,](\d{3,6})\b/g, // Lenient for noisy OCR
      format: 'noisy_ocr_date',
      priority: 8
    },
    // Strong Month dd, yyyy format
    {
      regex: /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(0?[1-9]|[12]\d|3[01])[,\s]+(20\d{2})\b/gi,
      format: 'month_dd_yyyy',
      priority: 7
    },
    // NEW: mm/dd/yyyy format (US format) - auto-detect
    {
      regex: /\b(0?[1-9]|1[0-2])[\/\-](0?[1-9]|[12]\d|3[01])[\/\-](20\d{2})\b/g,
      format: 'mm_dd_yyyy',
      priority: 6
    },
    // NEW: Partial dd/mm format (no year) - high priority
    {
      regex: /\b(0?[1-9]|[12]\d|3[01])[\/\-](0?[1-9]|1[0-2])\b/g,
      format: 'dd/mm_partial',
      priority: 5
    },
    // NEW: Partial dd-mm format (no year)
    {
      regex: /\b(0?[1-9]|[12]\d|3[01])[\-](0?[1-9]|1[0-2])\b/g,
      format: 'dd-mm_partial',
      priority: 4
    }
  ];

  const candidates = [];
  const rejectedReasons: string[] = [];

  // Analyze overall text quality
  const textQuality = analyzeTextQuality(text);

  for (const pattern of datePatterns) {
    const matches = text.matchAll(pattern.regex);
    for (const match of matches) {
      let day, month, year;
      
      try {
        switch (pattern.format) {
          case 'dd/mm/yyyy':
            day = parseInt(match[1]);
            month = parseInt(match[2]);
            year = parseInt(match[3]);
            break;
            
          case 'month_dd_yyyy':
            const monthName = match[1];
            day = parseInt(match[2]);
            year = parseInt(match[3]);
            // Convert month name to number
            const monthNames = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
            month = monthNames.indexOf(monthName.toLowerCase().substring(0, 3)) + 1;
            break;
            
          case 'dd/mm_partial':
          case 'dd-mm_partial':
            day = parseInt(match[1]);
            month = parseInt(match[2]);
            // Auto-fill with current year
            year = new Date().getFullYear();
            console.log('AUTO-FILLING YEAR:', year, 'for partial date');
            break;
            
          case 'dd_mm_yyyy_comma':
            day = parseInt(match[1]);
            month = parseInt(match[2]);
            year = parseInt(match[3]);
            console.log('PARSED dd/mm/yyyy with comma separators');
            break;
            
          case 'noisy_ocr_date':
            // Apply smart repair to noisy OCR date
            const originalDateStr = match[0];
            const repairedDateStr = repairNoisyOCRDate(originalDateStr);
            
            if (repairedDateStr) {
              const repairedMatch = repairedDateStr.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
              if (repairedMatch) {
                day = parseInt(repairedMatch[1]);
                month = parseInt(repairedMatch[2]);
                year = parseInt(repairedMatch[3]);
                console.log('REPAIRED_NOISY_DATE:', {
                  original: originalDateStr,
                  repaired: repairedDateStr,
                  day, month, year
                });
                break;
              }
            }
            
            // If repair failed, try to parse as-is
            day = parseInt(match[1]);
            month = parseInt(match[2]);
            year = parseInt(match[3]);
            console.log('PARSED_NOISY_DATE_AS_IS:', { day, month, year });
            break;
            
          case 'mm_dd_yyyy':
            day = parseInt(match[2]);
            month = parseInt(match[1]);
            year = parseInt(match[3]);
            console.log('PARSED mm/dd/yyyy format');
            break;
            
          // NEW: Handle potential mm/dd/yyyy format - auto-detect when day > 12
          default:
            day = parseInt(match[1]);
            month = parseInt(match[2]);
            year = match[3] ? parseInt(match[3]) : new Date().getFullYear();
            
            // Auto-detect mm/dd/yyyy if day > 12 (days don't go above 31)
            if (day > 12 && month <= 12) {
              console.log('AUTO-DETECTED mm/dd/yyyy format - swapping day/month');
              const tempDay = day;
              day = month;
              month = tempDay;
            }
            
            if (!match[3]) {
              console.log('AUTO-FILLING YEAR:', year, 'for detected date');
            }
            break;
        }

        // Ensure variables are defined before validation
        if (day === undefined || month === undefined || year === undefined) {
          rejectedReasons.push(`Invalid date components: day=${day}, month=${month}, year=${year}`);
          continue;
        }

        // Relaxed date validation
        if (month < 1 || month > 12) {
          rejectedReasons.push(`Invalid month: ${month}`);
          continue;
        }
        
        if (day < 1 || day > 31) {
          rejectedReasons.push(`Invalid day: ${day}`);
          continue;
        }
        
        // Smart year validation - prefer current year, downgrade confidence for distant years
        const currentYear = new Date().getFullYear();
        const yearDiff = Math.abs(year - currentYear);
        
        if (year < (currentYear - 5) || year > (currentYear + 2)) {
          rejectedReasons.push(`Invalid year: ${year} (current: ${currentYear})`);
          continue;
        }
        
        // Downgrade confidence for years that differ by 2+ years
        if (yearDiff >= 2) {
          console.log('YEAR_CONFIDENCE_DOWNGRADE:', {
            detectedYear: year,
            currentYear: currentYear,
            diff: yearDiff,
            originalPriority: pattern.priority
          });
          // Reduce priority for distant years
          pattern.priority = Math.max(1, pattern.priority - 2);
        }

        // Additional validation for specific months
        if (month === 2 && day > 29) {
          rejectedReasons.push(`Invalid February day: ${day}`);
          continue;
        }
        
        if ((month === 4 || month === 6 || month === 9 || month === 11) && day > 30) {
          rejectedReasons.push(`Invalid day for month ${month}: ${day}`);
          continue;
        }

        // Check if date is in noisy line
        const lineContainingDate = text.split('\n').find(line => line.includes(match[0]));
        if (lineContainingDate) {
          const trimmedLine = lineContainingDate.trim();
          
          // Reject if line has too many non-alphanumeric characters
          const nonAlphanumericCount = (trimmedLine.match(/[^a-zA-Z0-9\s\/\-]/g) || []).length;
          if (nonAlphanumericCount > trimmedLine.length * 0.3) {
            rejectedReasons.push(`Date in noisy line: too many symbols (${nonAlphanumericCount})`);
            continue;
          }
          
          // Reject if line has obvious OCR junk patterns
          const ocrJunkPatterns = [
            /[A-Z]{3,}/g,  // Multiple consecutive caps
            /\b[a-zA-Z]\b/g, // Single letters
            /[a-zA-Z]\d[a-zA-Z]/g, // Letter-digit-letter patterns
          ];
          
          const junkCount = ocrJunkPatterns.reduce((count, pattern) => 
            count + (trimmedLine.match(pattern) || []).length, 0
          );
          
          if (junkCount > 2) {
            rejectedReasons.push(`Date in noisy line: OCR junk patterns (${junkCount})`);
            continue;
          }
          
          // Reject if line is very short and contains only the date (likely OCR artifact)
          if (trimmedLine.length < 15 && trimmedLine === match[0]) {
            rejectedReasons.push(`Date in isolated short line`);
            continue;
          }
        }

        // More lenient for partial dates
        if (textQuality.isPoor && pattern.priority < 7) {
          rejectedReasons.push(`Poor OCR quality: pattern priority too low (${pattern.priority})`);
          continue;
        }

        candidates.push({
          day,
          month,
          year,
          priority: pattern.priority,
          text: match[0],
          format: pattern.format,
          lineQuality: lineContainingDate ? 'good' : 'unknown'
        });
      } catch (e) {
        continue;
      }
    }
  }

  // Debug logging
  console.log('RECEIPT_DATE_DEBUG', {
    candidates: candidates.map(c => ({
      date: `${String(c.day).padStart(2, '0')}/${String(c.month).padStart(2, '0')}/${c.year}`,
      isoDate: normalizeDateForDatabase(c.day, c.month, c.year),
      priority: c.priority,
      text: c.text,
      lineQuality: c.lineQuality
    })),
    acceptedDate: candidates.length > 0 ? normalizeDateForDatabase(candidates[0].day, candidates[0].month, candidates[0].year) : null,
    rejectedReasons,
    textQuality
  });

  if (candidates.length === 0) return null;

  // Sort by priority (highest first)
  candidates.sort((a, b) => b.priority - a.priority);

  const best = candidates[0];
  
  // More lenient final check - accept partial dates too
  if (best.priority < 7 || (textQuality.isPoor && best.priority < 8)) {
    return null;
  }

  const formattedDate = normalizeDateForDatabase(best.day, best.month, best.year);
  return formattedDate;
}

// Smart OCR date repair function
function repairNoisyOCRDate(dateStr: string): string | null {
  console.log('=== OCR DATE REPAIR DEBUG ===');
  console.log('INPUT_DATE_STR:', dateStr);
  
  // Common OCR character corrections
  let repaired = dateStr.toUpperCase();
  
  // Z -> 2 (common OCR mistake for 2)
  repaired = repaired.replace(/Z/g, '2');
  
  // O -> 0 (common OCR mistake)
  repaired = repaired.replace(/O/g, '0');
  
  // I/L -> 1 (common OCR mistake in numeric contexts)
  repaired = repaired.replace(/[IL]/g, '1');
  
  // Remove extra spaces around separators
  repaired = repaired.replace(/\s*[\/\-\,]\s*/g, '/');
  
  // Handle multiple separators like 20/04/7/2026
  repaired = repaired.replace(/\/+\//g, '/');
  
  // Fix corrupted day fragments like Z000 -> 20, ZO -> 20
  repaired = repaired.replace(/^Z0+/g, '20'); // Z000 -> 20
  repaired = repaired.replace(/^Z0/g, '20');   // ZO -> 20
  repaired = repaired.replace(/^2(\d{3,})/g, '20'); // 2000+ -> 20
  
  // Fix corrupted patterns like Z000/04/2028
  const corruptedDayMatch = repaired.match(/^(Z0+|Z0|2\d{3,})\/(\d{1,2})\/(\d{4})/);
  if (corruptedDayMatch) {
    console.log('CORRUPTED_DAY_PATTERN_DETECTED:', corruptedDayMatch[0]);
    // Extract realistic day from the corrupted pattern
    const month = parseInt(corruptedDayMatch[2]);
    const year = parseInt(corruptedDayMatch[3]);
    
    // Prefer realistic day (1-31) based on context
    let realisticDay = 20; // Default to 20th
    if (month <= 12 && year >= 2020 && year <= 2035) {
      // Use 20th as default for corrupted day patterns
      realisticDay = 20;
    }
    
    repaired = `${realisticDay}/${String(month).padStart(2, '0')}/${year}`;
    console.log('REPAIRED_CORRUPTED_DAY:', repaired);
  }
  
  // Remove leading 7 from year if it makes year too long (common OCR error)
  repaired = repaired.replace(/(\d{1,2})\/(\d{1,2})\/7(\d{4,5})/, '$1/$2/$3');
  
  // Fix years with extra digits (reduce to nearest valid year 2020-2035)
  const yearMatch = repaired.match(/\/(\d{4,})$/);
  if (yearMatch) {
    let yearStr = yearMatch[1];
    
    // If year is too long, try to extract valid year
    if (yearStr.length > 4) {
      // Look for patterns like 20xx within the longer string
      const year2020Match = yearStr.match(/(20\d{2})/);
      if (year2020Match) {
        yearStr = year2020Match[1];
      } else {
        // Take first 4 digits and adjust to valid range
        yearStr = yearStr.substring(0, 4);
      }
    }
    
    // Smart year preference - prefer years near current year
    const currentYear = new Date().getFullYear();
    let year = parseInt(yearStr);
    
    // Ensure year is in realistic range (2020-2035)
    if (year < 2020) {
      year = 2020 + (year % 100); // Convert 2-digit years to current era
    } else if (year > 2035) {
      year = 2020 + (year % 35); // Wrap around to valid range
    }
    
    // Prefer current year when ambiguity exists (e.g., 2026 vs 2028)
    const yearDiff = Math.abs(year - currentYear);
    if (yearDiff >= 2) {
      // If year differs by 2+ years, prefer current year
      console.log('YEAR_PREFERENCE_ADJUSTMENT:', {
        detectedYear: year,
        currentYear: currentYear,
        diff: yearDiff,
        adjustedTo: currentYear
      });
      year = currentYear;
    }
    
    repaired = repaired.replace(/\/\d{4,}$/, '/' + year);
  }
  
  // Validate final date format
  const finalMatch = repaired.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!finalMatch) {
    console.log('REPAIR_FAILED: Invalid final format:', repaired);
    return null;
  }
  
  const day = parseInt(finalMatch[1]);
  const month = parseInt(finalMatch[2]);
  const year = parseInt(finalMatch[3]);
  
  // Validate realistic date ranges
  if (day < 1 || day > 31 || month < 1 || month > 12 || year < 2020 || year > 2035) {
    console.log('REPAIR_FAILED: Invalid date ranges:', { day, month, year });
    return null;
  }
  
  console.log('REPAIRED_DATE_STR:', repaired);
  return repaired;
}

// Normalize date to ISO format (YYYY-MM-DD) for database storage
function normalizeDateForDatabase(day: number, month: number, year: number): string {
  console.log('=== DATE NORMALIZATION DEBUG ===');
  console.log('INPUT_DATE:', { day, month, year });
  
  // Ensure valid date components
  const normalizedYear = year;
  const normalizedMonth = Math.max(1, Math.min(12, month));
  const normalizedDay = Math.max(1, Math.min(31, day));
  
  // Create ISO date string
  const isoDate = `${normalizedYear}-${String(normalizedMonth).padStart(2, '0')}-${String(normalizedDay).padStart(2, '0')}`;
  
  console.log('NORMALIZED_DATE:', isoDate);
  return isoDate;
}

// Fallback heuristic extraction for medium-confidence OCR
function extractFallbackFields(text: string): {
  vendor: string | null;
  date: string | null;
  amount: number | null;
  receiptNumber: string | null;
} {
  console.log('=== FALLBACK EXTRACTION START ===');
  console.log('FALLBACK_INPUT:', text.substring(0, 200));

  const result = {
    vendor: null as string | null,
    date: null as string | null,
    amount: null as number | null,
    receiptNumber: null as string | null
  };

  // 1. Vendor: Strongest top uppercase phrase
  const lines = text.split('\n').filter(line => line.trim().length > 0);
  for (let i = 0; i < Math.min(lines.length, 4); i++) { // Check first 4 lines
    const line = lines[i].trim();
    const uppercaseWords = line.split(/\s+/).filter(word => 
      word.length >= 3 && word === word.toUpperCase() && !/^\d+$/.test(word)
    );
    
    if (uppercaseWords.length >= 2) {
      result.vendor = uppercaseWords.join(' ');
      console.log('FALLBACK_VENDOR_FOUND:', result.vendor);
      break;
    }
  }

  // 2. Amount: Exactly one clean standalone amount
  const amountMatches = text.match(/\b(\d{1,5}[,.]?\d{0,3}\.\d{2})\b/g);
  if (amountMatches && amountMatches.length === 1) {
    const amount = parseFloat(amountMatches[0].replace(/,/g, ''));
    if (!isNaN(amount) && amount > 0 && amount < 100000) {
      result.amount = amount;
      console.log('FALLBACK_AMOUNT_FOUND:', amount);
    }
  }

  // 3. Date: Accept noisy OCR dates and normalize
  const datePatterns = [
    /\b(\d{1,2})[\/\-,\s](\d{1,2})[\/\-,\s](20\d{2})\b/g, // dd/mm/yyyy or mm/dd/yyyy
    /\b(\d{1,2})[\/\-,\s](\d{1,2})[\/\-,\s](\d{2})\b/g, // dd/mm/yy or mm/dd/yy
    /\b(\d{1,2})[\/\-,\s](\d{1,2})\b/g, // dd/mm or mm/dd (partial)
  ];

  for (const pattern of datePatterns) {
    const matches = text.matchAll(pattern);
    for (const match of matches) {
      let day = parseInt(match[1]);
      let month = parseInt(match[2]);
      let year = match[3] ? (match[3].length === 2 ? 2000 + parseInt(match[3]) : parseInt(match[3])) : new Date().getFullYear();
      
      // Auto-detect mm/dd vs dd/mm
      if (day > 12 && month <= 12) {
        const temp = day;
        day = month;
        month = temp;
      }
      
      // Validate and normalize
      if (day >= 1 && day <= 31 && month >= 1 && month <= 12 && year >= 2020 && year <= 2035) {
        result.date = normalizeDateForDatabase(day, month, year);
        console.log('FALLBACK_DATE_FOUND:', result.date);
        break;
      }
    }
    if (result.date) break;
  }

  // 4. Receipt number: More lenient for fallback
  const receiptPatterns = [
    /receipt\s*#?\s*:?\s*(\w{3,})/i,
    /invoice\s*#?\s*:?\s*(\w{3,})/i,
    /order\s*#?\s*:?\s*(\w{3,})/i,
    /#\s*(\d{3,})/,
  ];

  for (const pattern of receiptPatterns) {
    const match = text.match(pattern);
    if (match && match[1] && match[1].length >= 3) {
      result.receiptNumber = match[1].trim();
      console.log('FALLBACK_RECEIPT_NUMBER_FOUND:', result.receiptNumber);
      break;
    }
  }

  console.log('FALLBACK_RESULT:', result);
  return result;
}

function extractAmount(text: string, ocrConfidence: number): number | null {
  // Debug: Log the actual OCR confidence reaching this function
  console.log('=== AMOUNT EXTRACTION DEBUG ===');
  console.log('INPUT_TEXT:', text);
  console.log('OCR_CONFIDENCE:', ocrConfidence);
  
  // Enhanced strong label patterns - prioritize final payable totals
  const strongPatterns = [
    { regex: /(?:grand\s+total|total|amount|cash|due|balance|sale|net)[:\s]+\$?(\d+[,.]?\d*\.?\d{2})/gi, priority: 8, label: 'FINAL_TOTAL' },
    { regex: /(?:total|amount|cash|due|balance)[:\s]+\$?(\d+[,.]?\d*\.?\d{2})/gi, priority: 7, label: 'TOTAL_LABEL' },
    { regex: /(?:sale|net)[:\s]+\$?(\d+[,.]?\d*\.?\d{2})/gi, priority: 6, label: 'SALE_NET' },
  ];

  // Enhanced weak patterns - standalone money values and CASH patterns
  const weakPatterns = [
    { regex: /\$(\d+[,.]?\d*\.?\d{2})/g, priority: 3, label: 'UNLABELED_MONEY' },
    // NEW: CASH JMD pattern - prioritize if CASH JMD appears near number
    { regex: /(?:cash\s+jmd|jmd\s+cash)\s*[:\s]*\$?(\d+[,.]?\d*\.?\d{2})/gi, priority: 5, label: 'CASH_JMD' },
    // NEW: Clean standalone money values with 2 decimal places - more strict
    { regex: /\b(\d{1,5}[,.]?\d{0,3}\.\d{2})\b/g, priority: 4, label: 'STANDALONE_MONEY' },
  ];

  const candidates: { amount: number; priority: number; label: string; text: string; index: number }[] = [];
  const taxAmount = extractTax(text);
  const rejectedReasons: string[] = [];
  
  // Analyze text quality
  const textQuality = analyzeTextQuality(text);
  
  // Check strong patterns first
  for (const { regex, priority, label } of strongPatterns) {
    const matches = text.matchAll(regex);
    for (const match of matches) {
      const numStr = match[1].replace(/,/g, '');
      const num = parseFloat(numStr);
      
      if (!isNaN(num) && num > 0 && num < 100000) {
        // Fuel receipt: ignore per-unit prices (values followed by /Ltr, /gal, /kg, etc.)
        const fullMatch = match[0];
        if (/(?:\/ltr|\/gal|\/kg|\/l|\/g|per\s+(?:liter|gallon|kg|lb))/i.test(fullMatch)) {
          rejectedReasons.push(`Ignored ${num} (per-unit price)`);
          continue;
        }
        
        // Ignore likely tax values
        if (taxAmount && Math.abs(num - taxAmount) < (taxAmount * 0.1)) {
          rejectedReasons.push(`Ignored ${num} (likely tax)`);
          continue;
        }
        
        candidates.push({ 
          amount: num, 
          priority, 
          label, 
          text: match[0],
          index: match.index || 0
        });
      }
    }
  }

  // Always check weak patterns - we want standalone amounts too
  for (const { regex, priority, label } of weakPatterns) {
    const matches = text.matchAll(regex);
    for (const match of matches) {
      const numStr = match[1].replace(/,/g, '');
      const num = parseFloat(numStr);
      
      if (!isNaN(num) && num > 0 && num < 100000) {
        // Fuel receipt: ignore per-unit prices in weak patterns too
        const fullMatch = match[0];
        if (/(?:\/ltr|\/gal|\/kg|\/l|\/g|per\s+(?:liter|gallon|kg|lb))/i.test(fullMatch)) {
          rejectedReasons.push(`Ignored ${num} (per-unit price in weak pattern)`);
          continue;
        }
        
        // Reject obvious non-amount numbers
        if (isLikelyNotAmount(num, match[0], text)) {
          rejectedReasons.push(`Rejected ${num} (looks like ID/phone/address)`);
          continue;
        }
        
        // NEW: Reject fragmented OCR junk that forms fake amounts
        const numStr = match[1];
        const hasTooManyDigits = numStr.replace(/[^\d]/g, '').length > 6; // More than 6 digits is suspicious
        const hasIrregularSpacing = /\d{3,}\s+\d{3,}/.test(fullMatch); // Digits split by spaces
        const hasMixedSeparators = /[,.]\d+[,.]/.test(fullMatch); // Mixed comma/dot separators
        
        if (hasTooManyDigits || hasIrregularSpacing || hasMixedSeparators) {
          rejectedReasons.push(`Rejected ${num} (fragmented OCR junk: digits=${numStr.replace(/[^\d]/g, '').length}, spacing=${hasIrregularSpacing}, separators=${hasMixedSeparators})`);
          continue;
        }
        
        // More lenient with unlabeled numbers if they look like amounts
        if (label === 'STANDALONE_MONEY' && textQuality.isPoor && num > 10000 && isRoundNumber(num)) {
          // Still reject very large round numbers in poor quality
          rejectedReasons.push(`Rejected ${num} (too large round number in poor quality text)`);
          continue;
        }
        
        // Ignore likely tax values
        if (taxAmount && Math.abs(num - taxAmount) < (taxAmount * 0.1)) {
          rejectedReasons.push(`Ignored ${num} (likely tax)`);
          continue;
        }
        
        candidates.push({ 
          amount: num, 
          priority, 
          label, 
          text: match[0],
          index: match.index || 0
        });
      }
    }
  }

  // More lenient confidence rules - check if we have meaningful tokens
  const meaningfulTokens = text.split(/\s+/).filter(word => word.length > 2).length;
  const hasMeaningfulTokens = meaningfulTokens >= 3;
  
  // Lower confidence threshold when we have meaningful tokens
  const confidenceThreshold = hasMeaningfulTokens ? 0.3 : 0.4;
  
  if (ocrConfidence < confidenceThreshold) {
    // Check if we have any strong labeled candidates (FINAL_TOTAL, TOTAL_LABEL, SALE_NET)
    const hasStrongLabeledCandidate = candidates.some(c => 
      c.label === 'FINAL_TOTAL' || c.label === 'TOTAL_LABEL' || c.label === 'SALE_NET' || c.label === 'CASH_JMD'
    );
    
    if (!hasStrongLabeledCandidate) {
      rejectedReasons.push(`Low confidence (${ocrConfidence.toFixed(2)}) and no strong label - rejecting all amounts (meaningful tokens: ${meaningfulTokens})`);
      
      // Debug logging
      console.log('RECEIPT_AMOUNT_DEBUG', {
        confidence: ocrConfidence,
        candidates: candidates.map(c => ({ amount: c.amount, label: c.label, text: c.text })),
        acceptedAmount: null,
        rejectedReasons,
        rawTextQuality: textQuality,
        meaningfulTokens
      });
      
      return null;
    }
  }

  // Additional conservative checks for low confidence
  if (ocrConfidence < 0.4) {
    // Reject unlabeled or weakly labeled candidates, but allow CASH_JMD
    const filteredCandidates = candidates.filter(c => 
      c.label === 'FINAL_TOTAL' || c.label === 'TOTAL_LABEL' || c.label === 'SALE_NET' || c.label === 'CASH_JMD'
    );
    
    if (filteredCandidates.length === 0) {
      rejectedReasons.push(`Low confidence (${ocrConfidence.toFixed(2)}) - only unlabeled candidates found`);
      
      // Debug logging
      console.log('RECEIPT_AMOUNT_DEBUG', {
        confidence: ocrConfidence,
        candidates: candidates.map(c => ({ amount: c.amount, label: c.label, text: c.text })),
        acceptedAmount: null,
        rejectedReasons,
        rawTextQuality: textQuality
      });
      
      return null;
    }
    
    // Replace candidates with only strong ones
    candidates.length = 0;
    candidates.push(...filteredCandidates);
  }

  // Enhanced debug logging
  console.log('RECEIPT_AMOUNT_DEBUG', {
    confidence: ocrConfidence,
    candidates: candidates.map(c => ({ 
      amount: c.amount, 
      label: c.label, 
      text: c.text,
      index: c.index,
      priority: c.priority
    })),
    acceptedAmount: candidates.length > 0 ? candidates[0].amount : null,
    acceptedLabel: candidates.length > 0 ? candidates[0].label : null,
    rejectedReasons,
    rawTextQuality: textQuality,
    textLines: text.split('\n').length
  });

  if (candidates.length === 0) return null;

  // Enhanced sorting: prioritize by label, then position, then amount
  candidates.sort((a, b) => {
    // First priority: Strong labels (FINAL_TOTAL, TOTAL_LABEL, SALE_NET)
    const labelPriority: { [key: string]: number } = { 'FINAL_TOTAL': 3, 'TOTAL_LABEL': 2, 'SALE_NET': 1, 'UNLABELED_MONEY': 0 };
    const aLabelPriority = labelPriority[a.label] || 0;
    const bLabelPriority = labelPriority[b.label] || 0;
    
    if (aLabelPriority !== bLabelPriority) {
      return bLabelPriority - aLabelPriority;
    }
    
    // Second priority: Position in text (prefer amounts near bottom of receipt)
    const textLines = text.split('\n');
    const aLineIndex = Math.floor(a.index / (text.length / textLines.length));
    const bLineIndex = Math.floor(b.index / (text.length / textLines.length));
    const aPositionRatio = aLineIndex / textLines.length;
    const bPositionRatio = bLineIndex / textLines.length;
    
    // Prefer amounts in bottom half of receipt
    const aBottomBonus = aPositionRatio > 0.5 ? 1 : 0;
    const bBottomBonus = bPositionRatio > 0.5 ? 1 : 0;
    
    if (aBottomBonus !== bBottomBonus) {
      return bBottomBonus - aBottomBonus;
    }
    
    // Third priority: For same label and position, prefer larger realistic amounts
    return b.amount - a.amount;
  });

  const chosen = candidates[0];
  
  // Final check: if vendor/date/receipt# are all null and confidence is low, reject lone amount
  const vendor = extractVendor(text);
  const date = extractDate(text);
  const receiptNumber = extractReceiptNumber(text);
  
  if (ocrConfidence < 0.4 && !vendor && !date && !receiptNumber) {
    rejectedReasons.push(`Low confidence (${ocrConfidence.toFixed(2)}) with no other OCR data - rejecting lone amount`);
    
    // Debug logging
    console.log('RECEIPT_AMOUNT_DEBUG', {
      confidence: ocrConfidence,
      candidates: candidates.map(c => ({ amount: c.amount, label: c.label, text: c.text })),
      acceptedAmount: null,
      rejectedReasons: [...rejectedReasons, 'Low confidence with no other OCR data - rejecting lone amount'],
      rawTextQuality: textQuality
    });
    
    return null;
  }

  return chosen.amount;
}

function analyzeTextQuality(text: string): { isPoor: boolean; hasStrongWords: boolean; wordCount: number } {
  const wordCount = text.split(/\s+/).filter(w => w.length > 0).length;
  const strongWords = /(total|amount|cash|due|balance|subtotal|invoice|receipt|order)/gi;
  const hasStrongWords = strongWords.test(text);
  const isPoor = wordCount < 10 || !hasStrongWords || text.length < 50;
  
  return { isPoor, hasStrongWords, wordCount };
}

function isLikelyNotAmount(num: number, matchText: string, fullText: string): boolean {
  // Phone numbers
  if (num > 1000000000) return true;
  
  // IDs and long numbers
  if (num > 99999 && num < 1000000) return true;
  
  // Street numbers (usually smaller)
  if (num < 1000 && /\d+\s+(?:st|street|rd|road|ave|avenue|dr|drive|ln|lane)/i.test(fullText)) {
    return true;
  }
  
  // Round numbers that look like IDs
  if (isRoundNumber(num) && num > 10000) return true;
  
  return false;
}

function isRoundNumber(num: number): boolean {
  // Check if number ends with lots of zeros or .00, .50, .25 etc
  const str = num.toString();
  return /00$|\.00$|\.50$|\.25$|\.75$/.test(str) || (num % 1000 === 0 && num > 1000);
}

function extractTax(text: string): number | null {
  const taxPatterns = [
    /tax[:\s]+\$?(\d+[,.]?\d*\.?\d{2})/i,
    /sales tax[:\s]+\$?(\d+[,.]?\d*\.?\d{2})/i,
    /vat[:\s]+\$?(\d+[,.]?\d*\.?\d{2})/i,
  ];

  for (const pattern of taxPatterns) {
    const match = text.match(pattern);
    if (match) {
      const numStr = match[1].replace(/,/g, '');
      const num = parseFloat(numStr);
      if (!isNaN(num) && num > 0) {
        return num;
      }
    }
  }

  return null;
}

function extractReceiptNumber(text: string): string | null {
  console.log('=== RECEIPT NUMBER EXTRACTION DEBUG ===');
  console.log('INPUT_TEXT:', text);

  const patterns = [
    /receipt\s*#?\s*:?\s*(\w{3,}[-\w]*)/i, // Minimum 3 characters
    /invoice\s*#?\s*:?\s*(\w{3,}[-\w]*)/i, // Minimum 3 characters
    /order\s*#?\s*:?\s*(\w{3,}[-\w]*)/i, // Minimum 3 characters
    /#\s*(\d{4,})/,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      const receiptNumber = match[1].trim();
      
      // Reject tiny garbage fragments
      if (receiptNumber.length < 3) {
        console.log('REJECTED: Receipt number too short:', receiptNumber);
        continue;
      }
      
      // Reject single letters or obvious OCR junk
      if (/^[a-z]{1,2}$/i.test(receiptNumber)) {
        console.log('REJECTED: Receipt number looks like OCR junk:', receiptNumber);
        continue;
      }
      
      // Reject if contains only common OCR noise characters
      if (/^[^\w]*$/.test(receiptNumber)) {
        console.log('REJECTED: Receipt number contains no alphanumeric characters:', receiptNumber);
        continue;
      }
      
      console.log('ACCEPTED: Receipt number:', receiptNumber);
      return receiptNumber;
    }
  }

  console.log('NO RECEIPT NUMBER FOUND');
  return null;
}

export async function linkReceiptToExpense(
  receiptId: string,
  expenseId: string
): Promise<void> {
  const { error } = await supabase
    .from('receipt_archive')
    .update({ expense_id: expenseId })
    .eq('id', receiptId);

  if (error) {
    throw new Error(`Failed to link receipt to expense: ${error.message}`);
  }
}

export async function getReceiptUrl(storagePath: string): Promise<string> {
  const { data } = await supabase.storage
    .from('receipts')
    .createSignedUrl(storagePath, 3600);

  if (!data?.signedUrl) {
    throw new Error('Failed to generate receipt URL');
  }

  return data.signedUrl;
}

export async function getExpenseReceipts(expenseId: string) {
  const { data, error } = await supabase
    .from('receipt_archive')
    .select('*')
    .eq('expense_id', expenseId)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`Failed to fetch receipts: ${error.message}`);
  }

  return data || [];
}

export async function deleteReceipt(receiptId: string): Promise<void> {
  const { data: receipt, error: fetchError } = await supabase
    .from('receipt_archive')
    .select('storage_path')
    .eq('id', receiptId)
    .single();

  if (fetchError || !receipt) {
    throw new Error('Receipt not found');
  }

  const { error: storageError } = await supabase.storage
    .from('receipts')
    .remove([receipt.storage_path]);

  if (storageError) {
    console.warn('Failed to delete receipt file from storage:', storageError);
  }

  const { error: dbError } = await supabase
    .from('receipt_archive')
    .delete()
    .eq('id', receiptId);

  if (dbError) {
    throw new Error(`Failed to delete receipt: ${dbError.message}`);
  }
}
