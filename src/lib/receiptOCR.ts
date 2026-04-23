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

function isGarbageOCR(rawText: string, confidence: number, parsedFields: {
  vendor: string | null;
  date: string | null;
  amount: number | null;
  tax: number | null;
  receiptNumber: string | null;
}): boolean {
  // Rule 1: Low confidence
  if (confidence < 0.45) {
    console.log('GARBAGE OCR: Low confidence', confidence);
    return true;
  }

  // Rule 2: Raw text mostly symbols/noise
  const nonAlphanumericCount = (rawText.match(/[^a-zA-Z0-9\s]/g) || []).length;
  const totalChars = rawText.length;
  if (nonAlphanumericCount > totalChars * 0.4) {
    console.log('GARBAGE OCR: Too many symbols', nonAlphanumericCount, '/', totalChars);
    return true;
  }

  // Rule 3: Less than 3 real words
  const words = rawText.split(/\s+/).filter(word => word.length > 0);
  const realWords = words.filter(word => word.length > 1 && /^[a-zA-Z]+$/.test(word));
  if (realWords.length < 3) {
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

  // Rule 7: Vendor/date/amount/tax all null
  const mainFields = [parsedFields.vendor, parsedFields.date, parsedFields.amount, parsedFields.tax];
  const allMainFieldsNull = mainFields.every(field => field === null);
  
  if (allMainFieldsNull) {
    console.log('GARBAGE OCR: All main fields null');
    return true;
  }

  return false;
}

export async function uploadReceipt(
  file: File,
  companyId: string,
  userId: string
): Promise<ReceiptUploadResult> {
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
      ocrResult = await performOCR(file);
    } catch (error) {
      console.warn('OCR failed, continuing without OCR data:', error);
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

async function preprocessImageForOCRStage1(file: File): Promise<File> {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      reject(new Error('Could not get canvas context'));
      return;
    }

    const img = new Image();
    img.onload = () => {
      try {
        console.log('=== OCR STAGE 1 PREPROCESSING ===');
        console.log('Original image:', {
          width: img.width,
          height: img.height,
          name: file.name,
          size: file.size,
          type: file.type
        });

        // Normalize image so long edge is 1800-2200px for fast pass
        const maxDimension = 2000;
        const aspectRatio = img.width / img.height;
        
        let targetWidth: number;
        let targetHeight: number;
        
        if (img.width > img.height) {
          targetWidth = Math.min(img.width, maxDimension);
          targetHeight = targetWidth / aspectRatio;
        } else {
          targetHeight = Math.min(img.height, maxDimension);
          targetWidth = targetHeight * aspectRatio;
        }

        canvas.width = targetWidth;
        canvas.height = targetHeight;
        
        console.log('Stage 1 target dimensions:', {
          width: targetWidth,
          height: targetHeight,
          aspectRatio: aspectRatio.toFixed(2)
        });

        // Draw scaled image
        ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
        
        // Light grayscale + light contrast cleanup
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        
        // Very gentle contrast (1.03) for fast pass
        const contrast = 1.03;
        const factor = (259 * (contrast + 255)) / (255 * (259 - contrast));
        
        for (let i = 0; i < data.length; i += 4) {
          // Light grayscale conversion
          const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
          
          // Light contrast boost
          const enhanced = factor * (gray - 128) + 128;
          const clamped = Math.min(255, Math.max(0, enhanced));
          
          data[i] = clamped;
          data[i + 1] = clamped;
          data[i + 2] = clamped;
        }
        
        ctx.putImageData(imageData, 0, 0);
        
        canvas.toBlob((blob) => {
          if (blob) {
            console.log('Stage 1 OCR input ready:', {
              size: blob.size,
              type: blob.type,
              dimensions: `${canvas.width}x${canvas.height}`,
              preprocessingApplied: 'light'
            });
            
            const processedFile = new File([blob], `stage1_${file.name}`, {
              type: 'image/jpeg',
              lastModified: Date.now()
            });
            resolve(processedFile);
          } else {
            reject(new Error('Failed to process image'));
          }
        }, 'image/jpeg', 0.85); // Moderate quality for speed
        
      } catch (error) {
        reject(error);
      }
    };
    
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = URL.createObjectURL(file);
  });
}

async function preprocessImageForOCRStage2(file: File): Promise<File> {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      reject(new Error('Could not get canvas context'));
      return;
    }

    const img = new Image();
    img.onload = () => {
      try {
        console.log('=== OCR STAGE 2 PREPROCESSING (FALLBACK) ===');
        console.log('Original image:', {
          width: img.width,
          height: img.height,
          name: file.name,
          size: file.size,
          type: file.type
        });

        // Higher resolution for fallback pass, cap at 2800px long edge
        const maxDimension = 2800;
        const aspectRatio = img.width / img.height;
        
        let targetWidth: number;
        let targetHeight: number;
        
        if (img.width > img.height) {
          targetWidth = Math.min(img.width, maxDimension);
          targetHeight = targetWidth / aspectRatio;
        } else {
          targetHeight = Math.min(img.height, maxDimension);
          targetWidth = targetHeight * aspectRatio;
        }

        canvas.width = targetWidth;
        canvas.height = targetHeight;
        
        console.log('Stage 2 target dimensions:', {
          width: targetWidth,
          height: targetHeight,
          aspectRatio: aspectRatio.toFixed(2)
        });

        // Draw scaled image
        ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
        
        // Better quality preprocessing for fallback
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        
        // Moderate contrast (1.05) for better accuracy
        const contrast = 1.05;
        const factor = (259 * (contrast + 255)) / (255 * (259 - contrast));
        
        for (let i = 0; i < data.length; i += 4) {
          // Preserve color for better OCR in fallback
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          
          // Apply contrast to each channel
          data[i] = Math.min(255, Math.max(0, factor * (r - 128) + 128));
          data[i + 1] = Math.min(255, Math.max(0, factor * (g - 128) + 128));
          data[i + 2] = Math.min(255, Math.max(0, factor * (b - 128) + 128));
        }
        
        ctx.putImageData(imageData, 0, 0);
        
        canvas.toBlob((blob) => {
          if (blob) {
            console.log('Stage 2 OCR input ready:', {
              size: blob.size,
              type: blob.type,
              dimensions: `${canvas.width}x${canvas.height}`,
              preprocessingApplied: 'enhanced'
            });
            
            const processedFile = new File([blob], `stage2_${file.name}`, {
              type: 'image/jpeg',
              lastModified: Date.now()
            });
            resolve(processedFile);
          } else {
            reject(new Error('Failed to process image'));
          }
        }, 'image/jpeg', 0.92); // Higher quality for accuracy
        
      } catch (error) {
        reject(error);
      }
    };
    
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = URL.createObjectURL(file);
  });
}

async function performOCR(file: File): Promise<OCRResult> {
  const worker = await createWorker('eng');
  const ocrStartTime = Date.now();

  try {
    console.log('=== 2-STAGE OCR PIPELINE START ===');
    console.log('Input file to OCR:', {
      name: file.name,
      size: file.size,
      type: file.type
    });

    // Determine source type for logging
    const sourceType = file.name.startsWith('ocr_') ? 'CROPPED' : 'ORIGINAL';
    console.log('OCR_SOURCE_TYPE:', sourceType);

    // STAGE 1: FAST PASS
    console.log('=== STAGE 1: FAST PASS ===');
    const stage1StartTime = Date.now();
    const stage1File = await preprocessImageForOCRStage1(file);
    
    console.log('Stage 1 input to Tesseract:', {
      name: stage1File.name,
      size: stage1File.size,
      type: stage1File.type
    });
    
    const { data: { text: text1, confidence: confidence1 } } = await worker.recognize(stage1File);
    const stage1Duration = Date.now() - stage1StartTime;
    
    console.log('=== STAGE 1 RESULTS ===');
    console.log('OCR_STAGE: 1');
    console.log('OCR_INPUT_WIDTH:', 'normalized_to_2000px');
    console.log('OCR_INPUT_HEIGHT:', 'normalized_to_2000px');
    console.log('OCR_FILE_SIZE:', stage1File.size);
    console.log('OCR_DURATION_MS:', stage1Duration);
    console.log('OCR_CONFIDENCE:', confidence1);
    console.log('Text length:', text1.length);
    console.log('Text preview:', text1.substring(0, 100) + (text1.length > 100 ? '...' : ''));

    // Check if Stage 1 is good enough
    const stage1ConfidenceThreshold = 65; // Minimum confidence to accept
    const stage1TextQuality = text1.length > 50 && confidence1 >= stage1ConfidenceThreshold;
    
    let finalResult: OCRResult;
    let usedStage = 1;
    
    if (stage1TextQuality) {
      console.log('=== STAGE 1 SUCCESS - USING FAST PASS RESULTS ===');
      
      const vendor = extractVendor(text1);
      const date = extractDate(text1);
      const amount = extractAmount(text1, confidence1 / 100);
      const tax = extractTax(text1);
      const receiptNumber = extractReceiptNumber(text1);

      finalResult = {
        vendor,
        date,
        amount,
        tax,
        receiptNumber,
        rawText: text1,
        confidence: confidence1 / 100,
      };
      
      usedStage = 1;
      
    } else {
      console.log('=== STAGE 1 INSUFFICIENT - FALLBACK TO STAGE 2 ===');
      
      // STAGE 2: FALLBACK PASS
      console.log('=== STAGE 2: FALLBACK PASS ===');
      const stage2StartTime = Date.now();
      const stage2File = await preprocessImageForOCRStage2(file);
      
      console.log('Stage 2 input to Tesseract:', {
        name: stage2File.name,
        size: stage2File.size,
        type: stage2File.type
      });
      
      const { data: { text: text2, confidence: confidence2 } } = await worker.recognize(stage2File);
      const stage2Duration = Date.now() - stage2StartTime;
      
      console.log('=== STAGE 2 RESULTS ===');
      console.log('OCR_STAGE: 2');
      console.log('OCR_INPUT_WIDTH:', 'normalized_to_2800px');
      console.log('OCR_INPUT_HEIGHT:', 'normalized_to_2800px');
      console.log('OCR_FILE_SIZE:', stage2File.size);
      console.log('OCR_DURATION_MS:', stage2Duration);
      console.log('OCR_CONFIDENCE:', confidence2);
      console.log('Text length:', text2.length);
      console.log('Text preview:', text2.substring(0, 100) + (text2.length > 100 ? '...' : ''));

      // Use Stage 2 results (better or worse, we don't retry again)
      const vendor = extractVendor(text2);
      const date = extractDate(text2);
      const amount = extractAmount(text2, confidence2 / 100);
      const tax = extractTax(text2);
      const receiptNumber = extractReceiptNumber(text2);

      finalResult = {
        vendor,
        date,
        amount,
        tax,
        receiptNumber,
        rawText: text2,
        confidence: confidence2 / 100,
      };
      
      usedStage = 2;
    }

    // Apply garbage OCR detection to final result
    const parsedFields = { 
      vendor: finalResult.vendor, 
      date: finalResult.date, 
      amount: finalResult.amount, 
      tax: finalResult.tax, 
      receiptNumber: finalResult.receiptNumber 
    };
    
    const isGarbage = isGarbageOCR(finalResult.rawText, finalResult.confidence, parsedFields);
    if (isGarbage) {
      finalResult.vendor = null;
      finalResult.date = null;
      finalResult.amount = null;
      finalResult.tax = null;
      finalResult.receiptNumber = null;
      finalResult.requiresManualEntry = true;
    }

    const totalDuration = Date.now() - ocrStartTime;
    
    console.log('=== 2-STAGE OCR PIPELINE COMPLETE ===');
    console.log('Final result:', {
      usedStage,
      vendor: finalResult.vendor,
      date: finalResult.date,
      amount: finalResult.amount,
      tax: finalResult.tax,
      receiptNumber: finalResult.receiptNumber,
      confidence: finalResult.confidence,
      requiresManualEntry: finalResult.requiresManualEntry,
      totalDuration: `${totalDuration}ms`
    });

    return finalResult;
    
  } finally {
    await worker.terminate();
  }
}

function extractVendor(text: string): string | null {
  const lines = text.split('\n').filter(line => line.trim().length > 0);

  if (lines.length === 0) return null;

  // Business keywords for vendor detection
  const businessKeywords = [
    'ltd', 'limited', 'shop', 'mart', 'hardware', 'pharmacy', 'wholesale', 
    'supermarket', 'supplies', 'restaurant', 'bar', 'store', 'trading'
  ];

  // Address/location words to reject
  const addressWords = [
    'road', 'rd', 'street', 'st', 'lane', 'crescent', 'harbour', 'p.o.', 'po box', 'box',
    'avenue', 'ave', 'drive', 'dr', 'boulevard', 'blvd', 'court', 'ct'
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
    
    // Skip lines longer than 50 chars or shorter than 3 chars
    if (trimmed.length > 50 || trimmed.length < 3) {
      rejectedReasons.push(`Line ${i}: Invalid length (${trimmed.length} chars)`);
      continue;
    }
    
    // NEW: Reject lines with too many short fragments (1-2 chars)
    const tokens = trimmed.split(/\s+/);
    const shortFragments = tokens.filter(token => token.length <= 2).length;
    if (shortFragments > tokens.length * 0.6) {
      rejectedReasons.push(`Line ${i}: Too many short fragments (${shortFragments}/${tokens.length})`);
      continue;
    }
    
    // NEW: Reject lines with too many mixed capitals/lowercase fragments
    const mixedCaseTokens = tokens.filter(token => 
      token.length > 1 && /[a-z]/.test(token) && /[A-Z]/.test(token)
    ).length;
    if (mixedCaseTokens > tokens.length * 0.4) {
      rejectedReasons.push(`Line ${i}: Too many mixed case fragments (${mixedCaseTokens}/${tokens.length})`);
      continue;
    }
    
    // NEW: Reject lines with too many symbols/punctuation
    const symbolCount = (trimmed.match(/[^\w\s]/g) || []).length;
    if (symbolCount > trimmed.length * 0.2) {
      rejectedReasons.push(`Line ${i}: Too many symbols (${symbolCount}/${trimmed.length})`);
      continue;
    }
    
    // NEW: Reject lines with too many isolated 1-2 character tokens
    const isolatedTokens = tokens.filter(token => token.length <= 2).length;
    if (isolatedTokens > tokens.length * 0.5) {
      rejectedReasons.push(`Line ${i}: Too many isolated tokens (${isolatedTokens}/${tokens.length})`);
      continue;
    }
    
    // NEW: Reject lines where fewer than 60% of characters are letters/spaces
    const letterCount = (trimmed.match(/[a-zA-Z]/g) || []).length;
    const spaceCount = (trimmed.match(/\s/g) || []).length;
    if ((letterCount + spaceCount) < trimmed.length * 0.6) {
      rejectedReasons.push(`Line ${i}: Not enough letters/spaces (${letterCount + spaceCount}/${trimmed.length})`);
      continue;
    }
    
    // NEW: Reject lines with fewer than 2 clean words of length >= 3
    const cleanWords = trimmed.split(/\s+/).filter(word => 
      word.length >= 3 && /^[a-zA-Z]+$/.test(word)
    );
    if (cleanWords.length < 2) {
      rejectedReasons.push(`Line ${i}: Not enough clean words (${cleanWords.length})`);
      continue;
    }
    
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
    
    // Check for business keywords
    const hasBusinessKeyword = businessKeywords.some(keyword => lowerLine.includes(keyword));
    
    // Count total words
    const totalWords = trimmed.split(/\s+/).filter(word => word.length > 0);
    
    // NEW: Only accept if one of these conditions is met
    const hasEnoughCleanWords = cleanWords.length >= 2;
    const hasBusinessKeywordMatch = hasBusinessKeyword;
    
    if (!hasEnoughCleanWords && !hasBusinessKeywordMatch) {
      rejectedReasons.push(`Line ${i}: Fails acceptance criteria (clean words: ${cleanWords.length}, business keyword: ${hasBusinessKeyword})`);
      continue;
    }
    
    // Calculate score
    let score = 0;
    if (hasBusinessKeywordMatch) score += 20;
    if (hasEnoughCleanWords) score += 15;
    if (totalWords.length >= 3) score += 5;
    if (cleanWords.length >= 3) score += 5;
    
    // Prefer lines near the top (lower index = higher position bonus)
    const positionBonus = Math.max(0, 10 - i);
    score += positionBonus;
    
    candidates.push({ 
      line: trimmed, 
      score, 
      originalLine: line,
      index: i,
      hasBusinessKeyword: hasBusinessKeywordMatch,
      cleanWords: cleanWords.length,
      totalWords: totalWords.length
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
  // Strong date patterns only - no weak patterns
  const datePatterns = [
    // Strong Jamaican dd/mm/yyyy format with clear separators
    {
      regex: /\b(0?[1-9]|[12]\d|3[01])[\/\-](0?[1-9]|1[0-2])[\/\-](20\d{2})\b/g,
      format: 'dd/mm/yyyy',
      priority: 10
    },
    // Strong Month dd, yyyy format
    {
      regex: /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(0?[1-9]|[12]\d|3[01])[,\s]+(20\d{2})\b/gi,
      format: 'month_dd_yyyy',
      priority: 8
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
        }

        // Ensure variables are defined before validation
        if (day === undefined || month === undefined || year === undefined) {
          rejectedReasons.push(`Invalid date components: day=${day}, month=${month}, year=${year}`);
          continue;
        }

        // Strict date validation
        if (month < 1 || month > 12) {
          rejectedReasons.push(`Invalid month: ${month}`);
          continue;
        }
        
        if (day < 1 || day > 31) {
          rejectedReasons.push(`Invalid day: ${day}`);
          continue;
        }
        
        if (year < 2020 || year > 2035) {
          rejectedReasons.push(`Invalid year: ${year}`);
          continue;
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

        // If OCR quality is poor, be extra strict
        if (textQuality.isPoor) {
          // Only accept very high priority dates from poor quality text
          if (pattern.priority < 9) {
            rejectedReasons.push(`Poor OCR quality: pattern priority too low (${pattern.priority})`);
            continue;
          }
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
      priority: c.priority,
      text: c.text,
      lineQuality: c.lineQuality
    })),
    acceptedDate: candidates.length > 0 ? `${String(candidates[0].day).padStart(2, '0')}/${String(candidates[0].month).padStart(2, '0')}/${candidates[0].year}` : null,
    rejectedReasons,
    textQuality
  });

  if (candidates.length === 0) return null;

  // Sort by priority (highest first)
  candidates.sort((a, b) => b.priority - a.priority);

  const best = candidates[0];
  
  // Final sanity check - only accept if high priority and good context
  if (best.priority < 8 || textQuality.isPoor) {
    return null;
  }

  const formattedDate = `${String(best.day).padStart(2, '0')}/${String(best.month).padStart(2, '0')}/${best.year}`;
  return formattedDate;
}

function extractAmount(text: string, ocrConfidence: number): number | null {
  // Debug: Log the actual OCR confidence reaching this function
  console.log('=== EXTRACTAMOUNT DEBUG: OCR confidence received:', ocrConfidence, '(raw from Tesseract)');
  
  // Strong label patterns - must be near these words
  const strongPatterns = [
    { regex: /(?:grand\s+total|total|amount|cash|due|balance|subtotal)[:\s]+\$?(\d+[,.]?\d*\.?\d{2})/gi, priority: 5, label: 'STRONG_LABEL' },
    { regex: /(?:total|amount|cash|due|balance)[:\s]+\$?(\d+[,.]?\d*\.?\d{2})/gi, priority: 5, label: 'STRONG_LABEL' },
  ];

  // Weak patterns - unlabeled money values
  const weakPatterns = [
    { regex: /\$(\d+[,.]?\d*\.?\d{2})/g, priority: 1, label: 'UNLABELED_MONEY' },
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

  // Only check weak patterns if no strong candidates found
  if (candidates.length === 0) {
    for (const { regex, priority, label } of weakPatterns) {
      const matches = text.matchAll(regex);
      for (const match of matches) {
        const numStr = match[1].replace(/,/g, '');
        const num = parseFloat(numStr);
        
        if (!isNaN(num) && num > 0 && num < 100000) {
          // Reject obvious non-amount numbers
          if (isLikelyNotAmount(num, match[0], text)) {
            rejectedReasons.push(`Rejected ${num} (looks like ID/phone/address)`);
            continue;
          }
          
          // Be very careful with unlabeled big round numbers in low-quality text
          if (textQuality.isPoor && num > 1000 && isRoundNumber(num)) {
            rejectedReasons.push(`Rejected ${num} (unlabeled round number in poor quality text)`);
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
  }

  // HARD RULE: When confidence < 0.4 and no strong label exists, return null
  if (ocrConfidence < 0.4) {
    // Check if we have any strong labeled candidates
    const hasStrongLabeledCandidate = candidates.some(c => c.label === 'STRONG_LABEL');
    
    if (!hasStrongLabeledCandidate) {
      rejectedReasons.push(`Low confidence (${ocrConfidence.toFixed(2)}) and no strong label - rejecting all amounts`);
      
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
  }

  // Additional conservative checks for low confidence
  if (ocrConfidence < 0.4) {
    // Reject unlabeled or weakly labeled candidates
    const filteredCandidates = candidates.filter(c => c.label === 'STRONG_LABEL');
    
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

  // Debug logging
  console.log('RECEIPT_AMOUNT_DEBUG', {
    confidence: ocrConfidence,
    candidates: candidates.map(c => ({ amount: c.amount, label: c.label, text: c.text })),
    acceptedAmount: candidates.length > 0 ? candidates[0].amount : null,
    rejectedReasons,
    rawTextQuality: textQuality
  });

  if (candidates.length === 0) return null;

  // Sort by priority first, then by amount
  candidates.sort((a, b) => {
    if (a.priority !== b.priority) {
      return b.priority - a.priority;
    }
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
  const patterns = [
    /receipt\s*#?\s*:?\s*(\w+[-\w]*)/i,
    /invoice\s*#?\s*:?\s*(\w+[-\w]*)/i,
    /order\s*#?\s*:?\s*(\w+[-\w]*)/i,
    /#\s*(\d{4,})/,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      return match[1].trim();
    }
  }

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
