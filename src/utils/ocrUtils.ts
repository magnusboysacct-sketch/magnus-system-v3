import type { OCRResult, IDOCRResult } from '../types/imageCapture';
import { uploadReceipt, type OCRResult as ReceiptOCRResult } from '../lib/receiptOCR';
import { performIDOCR, type IDOCRResult as IDOCRResultType } from '../lib/idOCR';

export async function processReceiptOCR(
  file: File,
  companyId: string,
  userId: string
): Promise<ReceiptOCRResult | null> {
  try {
    console.log('=== SmartImageCapture: Processing Receipt OCR ===');
    const result = await uploadReceipt(file, companyId, userId);
    return result.ocrResult;
  } catch (error) {
    console.error('SmartImageCapture: Receipt OCR failed:', error);
    throw new Error('Failed to process receipt with OCR');
  }
}

export async function processIDOCR(file: File): Promise<IDOCRResultType> {
  try {
    console.log('=== SmartImageCapture: Processing ID OCR ===');
    const result = await performIDOCR(file);
    return result;
  } catch (error) {
    console.error('SmartImageCapture: ID OCR failed:', error);
    throw new Error('Failed to process ID with OCR');
  }
}

export function formatOCRResult(ocrResult: ReceiptOCRResult | IDOCRResultType): OCRResult | IDOCRResult {
  // Check if it's a receipt OCR result
  if ('vendor' in ocrResult && 'amount' in ocrResult) {
    return ocrResult as OCRResult;
  }
  
  // Check if it's an ID OCR result
  if ('fullName' in ocrResult && 'documentType' in ocrResult) {
    return ocrResult as IDOCRResult;
  }
  
  // Fallback - treat as receipt result
  return ocrResult as OCRResult;
}

export function hasValidOCRData(result: OCRResult | IDOCRResult | null): boolean {
  if (!result) return false;
  
  // Check receipt OCR data
  if ('vendor' in result) {
    const receiptResult = result as OCRResult;
    return !!(receiptResult.vendor || receiptResult.date || receiptResult.amount);
  }
  
  // Check ID OCR data
  if ('fullName' in result) {
    const idResult = result as IDOCRResult;
    return !!(idResult.fullName || idResult.firstName || idResult.lastName || 
              idResult.documentNumber || idResult.idNumber);
  }
  
  return false;
}

export function getOCRConfidence(result: OCRResult | IDOCRResult | null): number {
  if (!result) return 0;
  return result.confidence || 0;
}

export function requiresManualEntry(result: OCRResult | IDOCRResult | null): boolean {
  if (!result) return true;
  
  // Check explicit flag
  if ('requiresManualEntry' in result && result.requiresManualEntry) {
    return true;
  }
  
  // Check confidence threshold
  const confidence = getOCRConfidence(result);
  if (confidence < 0.6) return true;
  
  // Check if any data was extracted
  return !hasValidOCRData(result);
}
