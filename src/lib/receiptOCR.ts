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
}

export interface ReceiptUploadResult {
  receiptId: string;
  storagePath: string;
  ocrResult: OCRResult | null;
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

  return {
    receiptId: receipt.id,
    storagePath,
    ocrResult,
  };
}

async function performOCR(file: File): Promise<OCRResult> {
  const worker = await createWorker('eng');

  try {
    const { data: { text, confidence } } = await worker.recognize(file);

    const result: OCRResult = {
      vendor: extractVendor(text),
      date: extractDate(text),
      amount: extractAmount(text),
      tax: extractTax(text),
      receiptNumber: extractReceiptNumber(text),
      rawText: text,
      confidence: confidence / 100,
    };

    return result;
  } finally {
    await worker.terminate();
  }
}

function extractVendor(text: string): string | null {
  const lines = text.split('\n').filter(line => line.trim().length > 0);

  if (lines.length === 0) return null;

  const firstLine = lines[0].trim();
  if (firstLine.length > 3 && firstLine.length < 50) {
    return firstLine;
  }

  return null;
}

function extractDate(text: string): string | null {
  const datePatterns = [
    /\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})\b/,
    /\b(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})\b/,
    /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]* (\d{1,2}),? (\d{4})\b/i,
  ];

  for (const pattern of datePatterns) {
    const match = text.match(pattern);
    if (match) {
      try {
        let dateStr: string;

        if (match[0].includes('jan') || match[0].includes('Jan')) {
          dateStr = match[0];
        } else if (match[1].length === 4) {
          dateStr = `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
        } else {
          const month = match[1].padStart(2, '0');
          const day = match[2].padStart(2, '0');
          const year = match[3].length === 2 ? `20${match[3]}` : match[3];
          dateStr = `${year}-${month}-${day}`;
        }

        const date = new Date(dateStr);
        if (!isNaN(date.getTime())) {
          return date.toISOString().split('T')[0];
        }
      } catch (e) {
        continue;
      }
    }
  }

  return null;
}

function extractAmount(text: string): number | null {
  const patterns = [
    /total[:\s]+\$?(\d+[,.]?\d*\.?\d{2})/i,
    /amount[:\s]+\$?(\d+[,.]?\d*\.?\d{2})/i,
    /\$(\d+[,.]?\d*\.?\d{2})/g,
  ];

  const amounts: number[] = [];

  for (const pattern of patterns) {
    const matches = text.matchAll(pattern);
    for (const match of matches) {
      const numStr = match[1].replace(/,/g, '');
      const num = parseFloat(numStr);
      if (!isNaN(num) && num > 0 && num < 100000) {
        amounts.push(num);
      }
    }
  }

  if (amounts.length === 0) return null;

  return Math.max(...amounts);
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
