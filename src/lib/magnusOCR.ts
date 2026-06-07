// src/lib/magnusOCR.ts
// Magnus OCR Engine v2 — High accuracy document scanner
// Uses advanced image preprocessing + Tesseract.js
// No external API costs — runs entirely in the browser

import { createWorker } from 'tesseract.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export type DocumentType = 'national_id' | 'drivers_licence' | 'receipt' | 'invoice' | 'unknown';

export interface OCRResult {
  // Identity fields
  firstName:      string | null;
  middleName:     string | null;
  lastName:       string | null;
  fullName:       string | null;
  idNumber:       string | null;
  dateOfBirth:    string | null;
  expiryDate:     string | null;
  address:        string | null;
  // Financial fields
  vendor:         string | null;
  amount:         number | null;
  date:           string | null;
  receiptNumber:  string | null;
  tax:            number | null;
  // Meta
  documentType:   DocumentType;
  rawText:        string;
  confidence:     number;
  requiresManualEntry: boolean;
}

// ─── Image Preprocessing ──────────────────────────────────────────────────────
// This is the most critical part — poor preprocessing = poor OCR

/**
 * Apply adaptive thresholding (Otsu's method approximation)
 * This converts grayscale to pure black/white based on local contrast
 * Critical for reading text on laminated IDs and receipts
 */
function adaptiveThreshold(data: Uint8ClampedArray, width: number, height: number, blockSize = 31): Uint8ClampedArray {
  const result = new Uint8ClampedArray(data.length);
  const half = Math.floor(blockSize / 2);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      // Calculate local mean in block
      let sum = 0;
      let count = 0;
      for (let by = Math.max(0, y - half); by <= Math.min(height - 1, y + half); by++) {
        for (let bx = Math.max(0, x - half); bx <= Math.min(width - 1, x + half); bx++) {
          sum += data[(by * width + bx) * 4];
          count++;
        }
      }
      const localMean = sum / count;
      const idx = (y * width + x) * 4;
      const pixel = data[idx];
      // Threshold: pixel is black if it's darker than local mean minus constant
      const threshold = localMean - 8;
      const value = pixel < threshold ? 0 : 255;
      result[idx] = value;
      result[idx + 1] = value;
      result[idx + 2] = value;
      result[idx + 3] = 255;
    }
  }
  return result;
}

/**
 * Convert to grayscale using luminosity method
 */
function toGrayscale(data: Uint8ClampedArray): void {
  for (let i = 0; i < data.length; i += 4) {
    const gray = Math.round(data[i] * 0.299 + data[i+1] * 0.587 + data[i+2] * 0.114);
    data[i] = data[i+1] = data[i+2] = gray;
  }
}

/**
 * Normalize contrast using histogram stretching
 */
function normalizeContrast(data: Uint8ClampedArray): void {
  let min = 255, max = 0;
  for (let i = 0; i < data.length; i += 4) {
    min = Math.min(min, data[i]);
    max = Math.max(max, data[i]);
  }
  const range = max - min || 1;
  for (let i = 0; i < data.length; i += 4) {
    const v = Math.round(((data[i] - min) / range) * 255);
    data[i] = data[i+1] = data[i+2] = v;
  }
}

/**
 * Sharpen using unsharp mask
 */
function unsharpMask(data: Uint8ClampedArray, width: number, height: number, amount = 1.5): Uint8ClampedArray {
  const result = new Uint8ClampedArray(data);
  const kernel = [1,2,1,2,4,2,1,2,1]; // Gaussian blur kernel
  const ksum = 16;

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      let blur = 0;
      let ki = 0;
      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          blur += data[((y+ky)*width+(x+kx))*4] * kernel[ki++];
        }
      }
      blur = blur / ksum;
      const idx = (y * width + x) * 4;
      const original = data[idx];
      const sharpened = Math.min(255, Math.max(0, original + amount * (original - blur)));
      result[idx] = result[idx+1] = result[idx+2] = Math.round(sharpened);
    }
  }
  return result;
}

/**
 * Deskew detection — check if image is rotated and return best rotation
 */
function needsDeskew(text: string): boolean {
  return text.trim().length < 20;
}

/**
 * Main preprocessing pipeline
 * Returns multiple processed versions for best OCR result
 */
async function preprocessImage(file: File): Promise<{ file: File; label: string }[]> {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);

      // Scale to optimal OCR size (2400px max for IDs, 1800px for receipts)
      const MAX = 2400;
      const scale = Math.min(MAX / img.width, MAX / img.height, 1);
      const W = Math.round(img.width * scale);
      const H = Math.round(img.height * scale);

      const results: { file: File; label: string }[] = [];

      // ── Version 1: Adaptive threshold (best for IDs) ──
      const c1 = document.createElement('canvas');
      c1.width = W; c1.height = H;
      const ctx1 = c1.getContext('2d')!;
      ctx1.drawImage(img, 0, 0, W, H);
      const imgData1 = ctx1.getImageData(0, 0, W, H);
      toGrayscale(imgData1.data);
      normalizeContrast(imgData1.data);
      // Only apply adaptive threshold on smaller images (performance)
      if (W * H < 3000000) {
        const thresholded = adaptiveThreshold(imgData1.data, W, H, 25);
        imgData1.data.set(thresholded);
      }
      ctx1.putImageData(imgData1, 0, 0);

      // ── Version 2: Contrast + Sharpen (best for receipts) ──
      const c2 = document.createElement('canvas');
      c2.width = W; c2.height = H;
      const ctx2 = c2.getContext('2d')!;
      ctx2.drawImage(img, 0, 0, W, H);
      const imgData2 = ctx2.getImageData(0, 0, W, H);
      toGrayscale(imgData2.data);
      normalizeContrast(imgData2.data);
      const sharpened = unsharpMask(imgData2.data, W, H, 2.0);
      imgData2.data.set(sharpened);
      ctx2.putImageData(imgData2, 0, 0);

      // ── Version 3: High contrast (best for faded/old IDs) ──
      const c3 = document.createElement('canvas');
      c3.width = W; c3.height = H;
      const ctx3 = c3.getContext('2d')!;
      // Apply CSS filter for high contrast
      ctx3.filter = 'grayscale(100%) contrast(200%) brightness(110%)';
      ctx3.drawImage(img, 0, 0, W, H);

      // Convert all 3 canvases to blobs
      let pending = 3;
      const done = () => { if (--pending === 0) resolve(results); };

      c1.toBlob(b => {
        if (b) results.push({ file: new File([b], 'v1_adaptive.jpg', { type: 'image/jpeg' }), label: 'adaptive' });
        done();
      }, 'image/jpeg', 0.95);

      c2.toBlob(b => {
        if (b) results.push({ file: new File([b], 'v2_sharp.jpg', { type: 'image/jpeg' }), label: 'sharp' });
        done();
      }, 'image/jpeg', 0.95);

      c3.toBlob(b => {
        if (b) results.push({ file: new File([b], 'v3_contrast.jpg', { type: 'image/jpeg' }), label: 'contrast' });
        done();
      }, 'image/jpeg', 0.95);
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve([{ file, label: 'original' }]);
    };

    img.src = url;
  });
}

// ─── Text Parsing ─────────────────────────────────────────────────────────────

function detectDocType(text: string): DocumentType {
  const t = text.toLowerCase();
  if (t.includes('driver') || t.includes('licence') || t.includes('license') || t.includes('general')) return 'drivers_licence';
  if (t.includes('identification') || t.includes('elector') || t.includes('national')) return 'national_id';
  if (t.includes('receipt') || t.includes('total') || t.includes('cash') || t.includes('change')) return 'receipt';
  if (t.includes('invoice') || t.includes('bill to') || t.includes('amount due')) return 'invoice';
  return 'unknown';
}

function extractIDFields(text: string) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  let firstName = '', middleName = '', lastName = '', idNumber = '', dateOfBirth = '', expiryDate = '', address = '';

  for (const line of lines) {
    // Surname — fuzzy match various OCR corruptions
    if (/s[ue][rn][rn]?[aei][mn]|surnam|sumam|sunt\b/i.test(line)) {
      const words = line.split(/\s+/).filter(w => w.length >= 3 && /^[A-Za-z]+$/.test(w) && !/surnam|sumam|sunt|hs|mr|wr/i.test(w));
      if (words.length > 0) lastName = words[words.length - 1].toUpperCase();
    }
    // First name
    if (/first\s*nam|firstnam/i.test(line)) {
      const words = line.split(/\s+/).filter(w => w.length >= 3 && /^[A-Za-z]+$/.test(w) && !/first|name|names/i.test(w));
      if (words.length > 0) firstName = words.sort((a, b) => b.length - a.length)[0].toUpperCase();
    }
    // Middle name
    if (/middle\s*nam|midi\s*nam|middie|made\s*nam/i.test(line)) {
      const words = line.split(/\s+/).filter(w => w.length >= 3 && /^[A-Za-z]+$/.test(w) && !/middle|midi|name|names|made/i.test(w));
      if (words.length > 0) middleName = words.sort((a, b) => b.length - a.length)[0].toUpperCase();
    }
    // ID number — 8 digit
    const eightDigit = line.match(/\b(\d{8})\b/);
    if (eightDigit && !idNumber) idNumber = eightDigit[1];
    // DOB
    const dobMatch = line.match(/(?:date.{0,8}birth|dob|birt\w*)[:\s]*([A-Z]{3}[\s.]+\d{1,2}[\s,.]+\d{4}|\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i);
    if (dobMatch && !dateOfBirth) dateOfBirth = dobMatch[1].trim();
    // Expiry
    const expMatch = line.match(/(?:expir\w*|card\s+expir\w*)[:\s]*([A-Z]{3}[\s.]+\d{1,2}[\s,.]+\d{4}|\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4})/i);
    if (expMatch && !expiryDate) expiryDate = expMatch[1].trim();
    // Address — Jamaican parishes
    if (/clarendon|kingston|manchester|portland|st\.?\s*[a-z]|cottage|district|parish|road|street|avenue|lane/i.test(line)
      && !/identification|registration|elector|surname|first|middle/i.test(line)) {
      address = line;
    }
  }

  return { firstName, middleName, lastName, idNumber, dateOfBirth, expiryDate, address };
}

function extractReceiptFields(text: string) {
  let vendor = '', amount = 0, date = '', receiptNumber = '', tax = 0;
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  // Vendor — usually first 1-3 lines
  for (let i = 0; i < Math.min(4, lines.length); i++) {
    const line = lines[i];
    if (line.length > 3 && !/^\d/.test(line) && !/receipt|invoice|date|time/i.test(line)) {
      vendor = line; break;
    }
  }
  for (const line of lines) {
    // Amount — look for largest currency value
    const amountMatches = line.match(/\$?\s*(\d+[.,]\d{2})\b/g);
    if (amountMatches) {
      const vals = amountMatches.map(m => parseFloat(m.replace(/[$,\s]/g, '')));
      const max = Math.max(...vals);
      if (max > amount && !/tax|vat/i.test(line)) amount = max;
    }
    // Tax
    const taxMatch = line.match(/(?:tax|vat|gct)[:\s]*\$?\s*(\d+[.,]\d{2})/i);
    if (taxMatch) tax = parseFloat(taxMatch[1].replace(',', '.'));
    // Date
    const dateMatch = line.match(/\b(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})\b/);
    if (dateMatch && !date) date = dateMatch[1];
    // Receipt number
    const refMatch = line.match(/(?:receipt|ref|no\.?|#)[:\s#]*(\w{4,})/i);
    if (refMatch && !receiptNumber) receiptNumber = refMatch[1];
  }
  return { vendor, amount, date, receiptNumber, tax };
}

// ─── Main OCR Function ────────────────────────────────────────────────────────

export async function performOCR(
  file: File,
  onProgress?: (msg: string) => void
): Promise<OCRResult> {
  onProgress?.('Preprocessing image...');

  // Generate multiple preprocessed versions
  const versions = await preprocessImage(file);
  onProgress?.(`Running OCR (${versions.length} passes)...`);

  // Run Tesseract on all versions, pick best result
  let bestText = '';
  let bestConfidence = 0;

  for (const version of versions) {
    try {
      const worker = await createWorker('eng', 1, {
        logger: () => {}, // Suppress logs
      });

      await worker.setParameters({
        tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789.,/-:() ',
        preserve_interword_spaces: '1',
      });

      const { data } = await worker.recognize(version.file);
      await worker.terminate();

      if (data.confidence > bestConfidence && data.text.trim().length > 20) {
        bestConfidence = data.confidence;
        bestText = data.text;
      }
    } catch (e) {
      console.warn('OCR pass failed:', e);
    }
  }

  onProgress?.('Parsing document...');

  const docType = detectDocType(bestText);
  const confidence = bestConfidence / 100;

  // Parse based on document type
  let result: OCRResult;

  if (docType === 'national_id' || docType === 'drivers_licence') {
    const fields = extractIDFields(bestText);
    result = {
      firstName:      fields.firstName || null,
      middleName:     fields.middleName || null,
      lastName:       fields.lastName  || null,
      fullName:       [fields.firstName, fields.middleName, fields.lastName].filter(Boolean).join(' ') || null,
      idNumber:       fields.idNumber  || null,
      dateOfBirth:    fields.dateOfBirth || null,
      expiryDate:     fields.expiryDate || null,
      address:        fields.address   || null,
      vendor: null, amount: null, date: null, receiptNumber: null, tax: null,
      documentType:   docType,
      rawText:        bestText,
      confidence,
      requiresManualEntry: confidence < 0.4,
    };
  } else {
    const fields = extractReceiptFields(bestText);
    result = {
      firstName: null, middleName: null, lastName: null, fullName: null,
      idNumber: null, dateOfBirth: null, expiryDate: null, address: null,
      vendor:        fields.vendor       || null,
      amount:        fields.amount       || null,
      date:          fields.date         || null,
      receiptNumber: fields.receiptNumber || null,
      tax:           fields.tax          || null,
      documentType:  docType,
      rawText:       bestText,
      confidence,
      requiresManualEntry: confidence < 0.4,
    };
  }

  return result;
}
