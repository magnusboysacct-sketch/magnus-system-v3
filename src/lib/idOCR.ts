import { createWorker } from 'tesseract.js';

export interface IDOCRResult {
  fullName: string | null;
  firstName: string | null;
  lastName: string | null;
  address: string | null;
  dateOfBirth: string | null;
  documentNumber: string | null;
  idNumber: string | null;
  licenceNumber: string | null;
  expiryDate: string | null;
  documentType: 'national_id' | 'drivers_licence' | 'unknown';
  rawText: string;
  confidence: number;
}

export interface IDUploadResult {
  idImageId: string;
  storagePath: string;
  ocrResult: IDOCRResult | null;
}

/**
 * Perform OCR on Jamaican ID or Driver's License
 */
export async function performIDOCR(file: File): Promise<IDOCRResult> {
  console.log('=== DEEP DEBUG: ID OCR PROCESSING START ===');
  console.log('ID OCR: Starting OCR for file:', file.name);
  console.log('ID OCR: File size:', file.size);
  console.log('ID OCR: File type:', file.type);
  
  // Analyze image before OCR
  const imageAnalysis = await new Promise<{ width: number; height: number; valid: boolean }>((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      console.log('ID OCR: Image loaded - dimensions:', img.naturalWidth, 'x', img.naturalHeight);
      const isValid = img.naturalWidth > 0 && img.naturalHeight > 0;
      resolve({
        width: img.naturalWidth,
        height: img.naturalHeight,
        valid: isValid
      });
    };
    img.onerror = () => {
      console.error('ID OCR: Failed to load image for analysis');
      reject(new Error('Failed to load image for analysis'));
    };
    img.src = URL.createObjectURL(file);
  });

  if (!imageAnalysis.valid) {
    throw new Error('Invalid image - cannot perform OCR');
  }

  // Create worker with ID-optimized settings
  console.log('ID OCR: Creating Tesseract worker with ID-optimized settings...');
  const worker = await createWorker('eng');

  try {
    // Configure worker for ID/document OCR
    console.log('ID OCR: Configuring worker for ID/document OCR...');
    await worker.setParameters({
      // Character whitelist optimized for IDs
      tessedit_char_whitelist: '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-/. ',
      preserve_interword_spaces: '1', // Preserve spaces between words
      tessedit_ocr_engine_mode: '1', // LSTM OCR engine
      user_defined_dpi: '300', // Higher DPI for better recognition
      tessedit_create_hocr: '0', // Disable HOCR for faster processing
      tessedit_create_tsv: '0', // Disable TSV for faster processing
      tessedit_create_txt: '1', // Enable plain text output
      tessedit_create_boxfile: '0', // Disable box file
      tessedit_create_alto: '0', // Disable ALTO output
      tessedit_psm: 6, // PSM suitable for block text/documents
    });
    console.log('ID OCR: Worker configured successfully');

    // Perform OCR with timing
    console.log('ID OCR: Starting text recognition...');
    
    // STRUCTURED DEBUG LOG IMMEDIATELY BEFORE TESSERACT RECOGNIZE
    const preRecognitionDebug = {
      stage: 'BEFORE_RECOGNITION',
      inputFileName: file.name,
      inputFileSize: file.size,
      inputFileType: file.type,
      inputFileLastModified: file.lastModified,
      imageDimensions: {
        original: { width: imageAnalysis.width, height: imageAnalysis.height },
        processed: { width: imageAnalysis.width, height: imageAnalysis.height }
      },
      workerState: 'READY',
      ocrMode: 'standard', // ID OCR uses standard mode
      usedUpscale: false, // ID OCR doesn't use upscaling
      usedPreprocess: false // ID OCR doesn't use preprocessing
    };
    
    console.log('=== ID_OCR_DEBUG: BEFORE_RECOGNITION ===');
    console.log(JSON.stringify(preRecognitionDebug, null, 2));
    
    const startTime = Date.now();
    const { data: { text, confidence } } = await worker.recognize(file);
    const endTime = Date.now();
    
    console.log('=== DEEP DEBUG: ID OCR RECOGNITION COMPLETE ===');
    console.log('ID OCR: Recognition time:', (endTime - startTime), 'ms');
    console.log('ID OCR: Raw text extracted:', text);
    console.log('ID OCR: Confidence:', confidence);
    console.log('ID OCR: Text length:', text.length);
    console.log('ID OCR: Text preview:', text.substring(0, 200) + (text.length > 200 ? '...' : ''));
    
    // Check for empty results
    if (text.trim().length === 0) {
      console.warn('ID OCR: WARNING - No text extracted from image');
      console.warn('ID OCR: Possible causes:');
      console.warn('  1. Image quality too low');
      console.warn('  2. Image not containing text');
      console.warn('  3. Wrong language settings');
      console.warn('  4. Image preprocessing needed');
    }

    const result: IDOCRResult = {
      fullName: extractFullName(text),
      firstName: extractFirstName(text),
      lastName: extractLastName(text),
      address: extractAddress(text),
      dateOfBirth: extractDateOfBirth(text),
      documentNumber: extractDocumentNumber(text),
      idNumber: extractIDNumber(text),
      licenceNumber: extractLicenceNumber(text),
      expiryDate: extractExpiryDate(text),
      documentType: detectDocumentType(text),
      rawText: text,
      confidence: confidence / 100,
    };

    console.log('=== DEEP DEBUG: ID OCR PARSING COMPLETE ===');
    console.log('ID OCR: Parsed result:', result);
    console.log('ID OCR: Extracted fields:');
    console.log('  - Full Name:', result.fullName);
    console.log('  - First Name:', result.firstName);
    console.log('  - Last Name:', result.lastName);
    console.log('  - Address:', result.address);
    console.log('  - Date of Birth:', result.dateOfBirth);
    console.log('  - Document Number:', result.documentNumber);
    console.log('  - ID Number:', result.idNumber);
    console.log('  - License Number:', result.licenceNumber);
    console.log('  - Expiry Date:', result.expiryDate);
    console.log('  - Document Type:', result.documentType);
    console.log('  - Confidence:', result.confidence);
    
    // Check if any data was extracted
    const hasAnyData = !!(result.fullName || result.firstName || result.lastName || 
                          result.address || result.dateOfBirth || result.documentNumber || 
                          result.idNumber || result.licenceNumber || result.expiryDate);
    
    console.log('ID OCR: Has any extracted data:', hasAnyData);
    
    if (!hasAnyData) {
      console.warn('ID OCR: WARNING - No structured data extracted from text');
      console.warn('ID OCR: Raw text available but parsing failed');
      console.warn('ID OCR: Raw text preview:', text.substring(0, 300));
    }
    
    // FINAL STRUCTURED DEBUG LOG
    const finalDebugObject = {
      stage: 'SUCCESS',
      inputFileName: file.name,
      inputFileSize: file.size,
      originalWidth: imageAnalysis.width,
      originalHeight: imageAnalysis.height,
      processedWidth: imageAnalysis.width,
      processedHeight: imageAnalysis.height,
      hasPixelData: true, // OCR succeeded, so pixel data exists
      usedUpscale: false, // ID OCR doesn't use upscaling
      usedPreprocess: false, // ID OCR doesn't use preprocessing
      ocrConfidence: result.confidence,
      rawTextLength: result.rawText?.length || 0,
      rawTextPreview: result.rawText?.substring(0, 100) + (result.rawText?.length > 100 ? '...' : ''),
      parsedFields: {
        fullName: !!result.fullName,
        firstName: !!result.firstName,
        lastName: !!result.lastName,
        address: !!result.address,
        dateOfBirth: !!result.dateOfBirth,
        documentNumber: !!result.documentNumber,
        idNumber: !!result.idNumber,
        licenceNumber: !!result.licenceNumber,
        expiryDate: !!result.expiryDate
      },
      returnedEmptyResult: !hasAnyData,
      errorMessage: null
    };
    
    console.log('=== ID_OCR_DEBUG ===');
    console.log(JSON.stringify(finalDebugObject, null, 2));
    
    return result;
  } catch (error) {
    console.error('=== DEEP DEBUG: ID OCR PROCESSING FAILED ===');
    console.error('ID OCR: OCR processing failed with error:', error);
    console.error('ID OCR: Error type:', typeof error);
    console.error('ID OCR: Error message:', error instanceof Error ? error.message : String(error));
    console.error('ID OCR: Error stack:', error instanceof Error ? error.stack : 'No stack available');
    
    // FINAL STRUCTURED DEBUG LOG FOR ERROR CASE
    const errorDebugObject = {
      stage: 'ERROR',
      inputFileName: file.name,
      inputFileSize: file.size,
      originalWidth: imageAnalysis?.width || 0,
      originalHeight: imageAnalysis?.height || 0,
      processedWidth: 0,
      processedHeight: 0,
      hasPixelData: false,
      usedUpscale: false,
      usedPreprocess: false,
      ocrConfidence: 0,
      rawTextLength: 0,
      rawTextPreview: '',
      parsedFields: {
        fullName: false,
        firstName: false,
        lastName: false,
        address: false,
        dateOfBirth: false,
        documentNumber: false,
        idNumber: false,
        licenceNumber: false,
        expiryDate: false
      },
      returnedEmptyResult: true,
      errorMessage: error instanceof Error ? error.message : String(error)
    };
    
    console.log('=== ID_OCR_DEBUG ===');
    console.log(JSON.stringify(errorDebugObject, null, 2));
    
    // Re-throw with more context
    if (error instanceof Error) {
      throw new Error(`ID OCR failed: ${error.message}`);
    } else {
      throw new Error('ID OCR failed with unknown error');
    }
  } finally {
    console.log('ID OCR: Terminating worker...');
    await worker.terminate();
    console.log('ID OCR: Worker terminated successfully');
  }
}

/**
 * Detect document type based on text patterns
 */
function detectDocumentType(text: string): 'national_id' | 'drivers_licence' | 'unknown' {
  const lowerText = text.toLowerCase();
  
  // Jamaican National ID patterns
  if (lowerText.includes('jamaica') || 
      lowerText.includes('national id') || 
      lowerText.includes('identification') ||
      lowerText.includes('tax registration') ||
      lowerText.includes('trn') ||
      /\b[A-Z]{3}\d{6}\b/.test(text)) { // Jamaican TRN pattern
    return 'national_id';
  }
  
  // Driver's License patterns
  if (lowerText.includes('driver') || 
      lowerText.includes('licence') || 
      lowerText.includes('license') ||
      lowerText.includes('class') ||
      /\bclass\s+[a-z1-9]+\b/i.test(text) ||
      /\b\d{2}-\d{2}-\d{4}\b/.test(text)) { // License number pattern
    return 'drivers_licence';
  }
  
  return 'unknown';
}

/**
 * Extract full name from text
 */
function extractFullName(text: string): string | null {
  const lines = text.split('\n').filter(line => line.trim().length > 0);
  
  // Look for name patterns (usually at the top)
  for (const line of lines) {
    const trimmed = line.trim();
    
    // Skip common non-name lines
    if (isNonNameLine(trimmed)) continue;
    
    // Check if it looks like a name (2-3 words, reasonable length)
    const words = trimmed.split(/\s+/).filter(word => word.length > 1);
    if (words.length >= 2 && words.length <= 4 && trimmed.length < 50) {
      // Check if words start with capital letters
      const capitalizedWords = words.filter(word => /^[A-Z][a-z]+$/.test(word));
      if (capitalizedWords.length >= Math.min(2, words.length)) {
        return trimmed;
      }
    }
  }
  
  return null;
}

/**
 * Extract first name from full name or text
 */
function extractFirstName(text: string): string | null {
  const fullName = extractFullName(text);
  if (fullName) {
    const words = fullName.trim().split(/\s+/);
    return words[0] || null;
  }
  
  // Fallback: look for single capitalized word
  const lines = text.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (/^[A-Z][a-z]+$/.test(trimmed) && trimmed.length > 2) {
      return trimmed;
    }
  }
  
  return null;
}

/**
 * Extract last name from full name
 */
function extractLastName(text: string): string | null {
  const fullName = extractFullName(text);
  if (fullName) {
    const words = fullName.trim().split(/\s+/);
    return words.length > 1 ? words[words.length - 1] : null;
  }
  
  return null;
}

/**
 * Extract address from text
 */
function extractAddress(text: string): string | null {
  const lines = text.split('\n').filter(line => line.trim().length > 0);
  
  // Look for address patterns
  for (const line of lines) {
    const trimmed = line.trim();
    
    // Skip obvious non-address lines
    if (isNonAddressLine(trimmed)) continue;
    
    // Check for address indicators
    if (/\d+/.test(trimmed) && // Contains numbers
        (trimmed.toLowerCase().includes('street') ||
         trimmed.toLowerCase().includes('road') ||
         trimmed.toLowerCase().includes('avenue') ||
         trimmed.toLowerCase().includes('lane') ||
         trimmed.toLowerCase().includes('drive') ||
         trimmed.toLowerCase().includes('st.') ||
         trimmed.toLowerCase().includes('rd.') ||
         trimmed.toLowerCase().includes('ave.') ||
         /\d+\s+[a-zA-Z]+\s+(street|road|avenue|lane|drive|st\.|rd\.|ave\.)/i.test(trimmed)) ||
        trimmed.length > 20) { // Long lines are often addresses
      return trimmed;
    }
  }
  
  return null;
}

/**
 * Extract date of birth from text
 */
function extractDateOfBirth(text: string): string | null {
  const patterns = [
    // Various date formats
    /\b(?:dob|date\s+of\s+birth|born|birth\s+date)[:\s]*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})\b/i,
    /\b(?:dob|date\s+of\s+birth|born|birth\s+date)[:\s]*(\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2})\b/i,
    /\b(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})\b/,
    /\b(\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2})\b/,
  ];
  
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      try {
        let dateStr = match[1];
        
        // Normalize to YYYY-MM-DD format
        if (dateStr.includes('/')) {
          const parts = dateStr.split('/');
          if (parts[2].length === 2) {
            // Assume MM/DD/YY -> YYYY-MM-DD
            const year = '20' + parts[2];
            dateStr = `${year}-${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}`;
          } else if (parts[0].length === 4) {
            // YYYY/MM/DD
            dateStr = `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
          } else {
            // MM/DD/YYYY
            dateStr = `${parts[2]}-${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}`;
          }
        }
        
        const date = new Date(dateStr);
        if (!isNaN(date.getTime())) {
          // Validate reasonable date range (1900-2005 for DOB)
          const year = date.getFullYear();
          if (year >= 1900 && year <= 2005) {
            return date.toISOString().split('T')[0];
          }
        }
      } catch (e) {
        continue;
      }
    }
  }
  
  return null;
}

/**
 * Extract document number from text
 */
function extractDocumentNumber(text: string): string | null {
  const patterns = [
    // Jamaican TRN pattern
    /\b(?:trn|tax\s+registration|tax\s+reg\.?|identification\s+no\.?|id\s+no\.?)[:\s]*([A-Z]{3}\d{6})\b/i,
    // Driver's license patterns
    /\b(?:licence|license|dl|driver\s+lic(?:ence)?)[:\s]*([A-Z]{2}\d{6})\b/i,
    /\b(?:licence|license|dl|driver\s+lic(?:ence)?)[:\s]*(\d{2}-\d{2}-\d{4})\b/i,
    // Generic ID patterns
    /\b(?:id|identification|document|card)[:\s]*([A-Z0-9]{6,12})\b/i,
    /\b([A-Z]{3}\d{6})\b/, // Jamaican TRN
    /\b(\d{2}-\d{2}-\d{4})\b/, // License format
  ];
  
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      return match[1].trim();
    }
  }
  
  return null;
}

/**
 * Extract ID number (alias for document number)
 */
function extractIDNumber(text: string): string | null {
  return extractDocumentNumber(text);
}

/**
 * Extract licence number (alias for document number)
 */
function extractLicenceNumber(text: string): string | null {
  return extractDocumentNumber(text);
}

/**
 * Extract expiry date from text
 */
function extractExpiryDate(text: string): string | null {
  const patterns = [
    // Expiry date patterns
    /\b(?:exp(?:iry)?|expires?|valid\s+until|exp\s*date)[:\s]*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})\b/i,
    /\b(?:exp(?:iry)?|expires?|valid\s+until|exp\s*date)[:\s]*(\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2})\b/i,
  ];
  
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      try {
        let dateStr = match[1];
        
        // Normalize to YYYY-MM-DD format
        if (dateStr.includes('/')) {
          const parts = dateStr.split('/');
          if (parts[2].length === 2) {
            // Assume MM/DD/YY -> YYYY-MM-DD
            const year = parseInt(parts[2]) < 50 ? '20' + parts[2] : '19' + parts[2];
            dateStr = `${year}-${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}`;
          } else if (parts[0].length === 4) {
            // YYYY/MM/DD
            dateStr = `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
          } else {
            // MM/DD/YYYY
            dateStr = `${parts[2]}-${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}`;
          }
        }
        
        const date = new Date(dateStr);
        if (!isNaN(date.getTime())) {
          // Validate reasonable expiry date (current date to 10 years future)
          const now = new Date();
          const future = new Date(now.getFullYear() + 10, now.getMonth(), now.getDate());
          if (date.getTime() >= now.getTime() && date.getTime() <= future.getTime()) {
            return date.toISOString().split('T')[0];
          }
        }
      } catch (e) {
        continue;
      }
    }
  }
  
  return null;
}

/**
 * Check if line is likely not a name
 */
function isNonNameLine(line: string): boolean {
  const lower = line.toLowerCase();
  return lower.includes('jamaica') ||
         lower.includes('government') ||
         lower.includes('national') ||
         lower.includes('identification') ||
         lower.includes('driver') ||
         lower.includes('licence') ||
         lower.includes('license') ||
         lower.includes('class') ||
         lower.includes('tax') ||
         lower.includes('registration') ||
         lower.includes('trn') ||
         lower.includes('dob') ||
         lower.includes('born') ||
         lower.includes('expires') ||
         lower.includes('exp') ||
         /\d{4}/.test(line) || // Lines with 4 digits are usually dates/numbers
         line.length > 50; // Very long lines are not names
}

/**
 * Check if line is likely not an address
 */
function isNonAddressLine(line: string): boolean {
  const lower = line.toLowerCase();
  return lower.includes('jamaica') ||
         lower.includes('government') ||
         lower.includes('national') ||
         lower.includes('identification') ||
         lower.includes('driver') ||
         lower.includes('licence') ||
         lower.includes('license') ||
         lower.includes('class') ||
         lower.includes('tax') ||
         lower.includes('registration') ||
         lower.includes('trn') ||
         lower.includes('dob') ||
         lower.includes('born') ||
         lower.includes('expires') ||
         lower.includes('exp') ||
         lower.includes('sex') ||
         lower.includes('male') ||
         lower.includes('female') ||
         lower.includes('blood') ||
         lower.includes('eyes') ||
         lower.includes('height') ||
         lower.includes('weight');
}
