import { useState, useRef } from 'react';
import { Upload, X, FileText, Image, Loader as Loader2, CircleCheck as CheckCircle } from 'lucide-react';
import { uploadReceipt, type OCRResult } from '../lib/receiptOCR';
import SmartImageCapture from './SmartImageCapture';
import { BaseModal } from './common/BaseModal';

interface ReceiptUploadProps {
  companyId: string;
  userId: string;
  onUploadComplete: (receiptId: string, ocrResult: OCRResult | null) => void;
  onCancel?: () => void;
}

export function ReceiptUpload({ companyId, userId, onUploadComplete, onCancel }: ReceiptUploadProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [displayFile, setDisplayFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [showImageCapture, setShowImageCapture] = useState(false);
  const [initialFile, setInitialFile] = useState<File | null>(null);
  const [ocrDebug, setOcrDebug] = useState<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    console.log('ReceiptUpload: handleFileSelect called with file:', file.name, file.type);

    if (file.size > 10 * 1024 * 1024) {
      setError('File size must be less than 10MB');
      return;
    }

    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf'];
    if (!validTypes.includes(file.type)) {
      setError('Please upload an image (JPG, PNG, WEBP) or PDF file');
      return;
    }

    setError(null);

    // For images, use the image capture workflow
    if (file.type.startsWith('image/')) {
      console.log('ReceiptUpload: Opening image capture for file:', file.name);
      // Store the file as initial file for the image capture component
      // This prevents the UI from showing preview before crop is complete
      setInitialFile(file);
      setShowImageCapture(true);
      
      // Store the original file in a ref for the image capture component
      if (fileInputRef.current) {
        fileInputRef.current.files = e.target.files;
      }
    } else {
      // For PDFs, handle directly
      console.log('ReceiptUpload: Handling PDF directly:', file.name);
      setSelectedFile(file);
      setPreview(null);
    }

    // Clear input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  function handleImageCapture(result: { file: File; preview: string; width: number; height: number; size: number; ocrFile?: File }) {
    console.log('=== SmartImageCapture: RECEIPT UPLOAD IMAGE CAPTURE START ===');
    console.log('ReceiptUpload: handleImageCapture called');
    console.log('MAIN_FILE_INFO:', {
      name: result.file.name,
      size: result.file.size,
      type: result.file.type,
      width: result.width,
      height: result.height,
      isFile: result.file instanceof File,
      isBlob: result.file instanceof Blob
    });
    
    // Log OCR file info if available
    if (result.ocrFile) {
      console.log('OCR_FILE_INFO:', {
        name: result.ocrFile.name,
        size: result.ocrFile.size,
        type: result.ocrFile.type,
        isFile: result.ocrFile instanceof File,
        isBlob: result.ocrFile instanceof Blob,
        sizeDifference: ((result.ocrFile.size / result.file.size - 1) * 100).toFixed(1) + '%'
      });
    } else {
      console.warn('OCR_FILE_INFO: No OCR file provided');
    }
    
    // Use OCR file if available, otherwise use main file
    const fileForUpload = result.ocrFile || result.file;
    
    console.log('=== SmartImageCapture: FINAL SELECTION ===');
    console.log('OCR_SOURCE_TYPE:', fileForUpload === result.file ? 'MAIN_FILE' : 'OCR_FILE');
    console.log('FINAL_FILE_INFO:', {
      name: fileForUpload.name,
      size: fileForUpload.size,
      type: fileForUpload.type,
      isFile: fileForUpload instanceof File,
      isBlob: fileForUpload instanceof Blob
    });
    console.log('IMAGE_DIMENSIONS:', result.width, 'x', result.height);
    
    // Set the file for upload
    setSelectedFile(fileForUpload);
    setShowImageCapture(false);
    setInitialFile(null); // Reset initial file
    setPreview(result.preview);
    
    console.log('=== SmartImageCapture: IMAGE CAPTURE COMPLETE ===');
    console.log('ReceiptUpload: File and preview set successfully');
    console.log('Ready for OCR processing');
  }

  function handleImageCaptureCancel() {
    console.log('ReceiptUpload: handleImageCaptureCancel called');
    setShowImageCapture(false);
    setInitialFile(null); // Reset initial file
  }

  async function handleUpload() {
    if (!selectedFile) {
      console.log('=== DEEP DEBUG: NO SELECTED FILE ===');
      console.log('ReceiptUpload: handleUpload called but no selectedFile');
      return;
    }

    console.log('=== DEEP DEBUG: RECEIPT UPLOAD START ===');
    console.log('ReceiptUpload: handleUpload called with selectedFile');
    console.log('ReceiptUpload: File name:', selectedFile.name);
    console.log('ReceiptUpload: File size:', selectedFile.size);
    console.log('ReceiptUpload: File type:', selectedFile.type);
    console.log('ReceiptUpload: File object type:', selectedFile.constructor.name);
    console.log('ReceiptUpload: File is File object:', selectedFile instanceof File);
    console.log('ReceiptUpload: File is Blob object:', selectedFile instanceof Blob);
    console.log('ReceiptUpload: File lastModified:', selectedFile.lastModified);
    console.log('ReceiptUpload: Company ID:', companyId, 'User ID:', userId);

    // Verify file is valid before proceeding
    if (selectedFile.size === 0) {
      console.error('ReceiptUpload: ERROR - File size is 0');
      setError('File is empty');
      return;
    }

    if (!selectedFile.type.startsWith('image/')) {
      console.error('ReceiptUpload: ERROR - File is not an image:', selectedFile.type);
      setError('File is not an image');
      return;
    }

    setUploading(true);
    setProcessing(true);
    setError(null);

    try {
      console.log('=== OCR PIPELINE: UPLOAD RECEIPT START ===');
      console.log('ReceiptUpload: About to call uploadReceipt');
      console.log('OCR_INPUT_FILE:', {
        name: selectedFile.name,
        size: selectedFile.size,
        type: selectedFile.type,
        constructor: selectedFile.constructor.name,
        isFile: selectedFile instanceof File,
        isBlob: selectedFile instanceof Blob,
        lastModified: selectedFile.lastModified
      });
      console.log('OCR_CONTEXT:', { companyId, userId });
      
      const result = await uploadReceipt(selectedFile, companyId, userId);
      
      console.log('=== OCR PIPELINE: UPLOAD RECEIPT RESULT ===');
      const debugInfo = {
        receiptId: result.receiptId,
        storagePath: result.storagePath,
        hasOcrResult: !!result.ocrResult,
        ocrResult: result.ocrResult ? {
          vendor: result.ocrResult.vendor,
          date: result.ocrResult.date,
          amount: result.ocrResult.amount,
          tax: result.ocrResult.tax,
          receiptNumber: result.ocrResult.receiptNumber,
          confidence: result.ocrResult.confidence,
          requiresManualEntry: result.ocrResult.requiresManualEntry,
          rawTextLength: result.ocrResult.rawText?.length || 0,
          rawTextPreview: result.ocrResult.rawText?.substring(0, 200) || 'NO RAW TEXT'
        } : 'NO OCR RESULT'
      };
      console.log('OCR_RESULT:', debugInfo);
      setOcrDebug(debugInfo);
      console.log('=== DEBUG: RECEIPT UPLOAD COMPLETE ===');
      console.log('ReceiptUpload: Upload complete, receipt ID:', result.receiptId);
      console.log('ReceiptUpload: Storage path:', result.storagePath);
      console.log('ReceiptUpload: OCR result received:', result.ocrResult);
      
      if (result.ocrResult) {
        console.log('ReceiptUpload: OCR result details:');
        console.log('  - Vendor:', result.ocrResult.vendor);
        console.log('  - Date:', result.ocrResult.date);
        console.log('  - Amount:', result.ocrResult.amount);
        console.log('  - Tax:', result.ocrResult.tax);
        console.log('  - Receipt Number:', result.ocrResult.receiptNumber);
        console.log('  - Confidence:', result.ocrResult.confidence);
        console.log('  - Raw text length:', result.ocrResult.rawText?.length || 0);
        console.log('  - Has any data:', !!(result.ocrResult.vendor || result.ocrResult.date || result.ocrResult.amount || result.ocrResult.tax || result.ocrResult.receiptNumber));
        console.log('  - Raw text preview:', result.ocrResult.rawText?.substring(0, 100) + (result.ocrResult.rawText?.length > 100 ? '...' : ''));
      } else {
        console.log('ReceiptUpload: No OCR result received');
      }

      // Reset states before calling onUploadComplete
      setUploading(false);
      setProcessing(false);
      
      console.log('=== DEBUG: CALLING onUploadComplete ===');
      console.log('ReceiptUpload: Calling onUploadComplete with:');
      console.log('  - receiptId:', result.receiptId);
      console.log('  - ocrResult:', result.ocrResult);
      
      // Call the completion handler
      console.log('OCR_FLOW_STEP_4 callback to parent:', {
        receiptId: result.receiptId,
        ocrResult: result.ocrResult ? {
          hasData: !!(result.ocrResult.vendor || result.ocrResult.date || result.ocrResult.amount),
          vendor: result.ocrResult.vendor,
          date: result.ocrResult.date,
          amount: result.ocrResult.amount,
          tax: result.ocrResult.tax,
          receiptNumber: result.ocrResult.receiptNumber,
          confidence: result.ocrResult.confidence
        } : null
      });
      
      onUploadComplete(result.receiptId, result.ocrResult);
      
      console.log('ReceiptUpload: onUploadComplete called successfully');
    } catch (err) {
      console.error('=== DEBUG: RECEIPT UPLOAD FAILED ===');
      console.error('ReceiptUpload: Upload failed:', err);
      setError(err instanceof Error ? err.message : 'Failed to upload receipt');
      setUploading(false);
      setProcessing(false);
    }
  }

  function handleRemove() {
    setSelectedFile(null);
    setDisplayFile(null);
    setPreview(null);
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  return (
    <div className="space-y-4">
      {!selectedFile ? (
        <div
          onClick={() => fileInputRef.current?.click()}
          className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 p-8 text-center hover:border-slate-400 hover:bg-slate-100 cursor-pointer transition-colors"
        >
          <Upload className="w-12 h-12 text-slate-400 mb-3" />
          <p className="text-sm font-medium text-slate-700 mb-1">
            Click to upload receipt
          </p>
          <p className="text-xs text-slate-500">
            Images (JPG, PNG, WEBP) or PDF, max 10MB
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/jpg,image/png,image/webp,application/pdf"
            onChange={handleFileSelect}
            className="hidden"
          />
        </div>
      ) : (
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="flex items-start gap-4">
            <div className="flex-shrink-0">
              {preview ? (
                <img
                  src={preview}
                  alt="Receipt preview"
                  className="w-24 h-24 object-cover rounded-lg border border-slate-200"
                />
              ) : (
                <div className="w-24 h-24 flex items-center justify-center bg-slate-100 rounded-lg border border-slate-200">
                  <FileText className="w-8 h-8 text-slate-400" />
                </div>
              )}
            </div>

            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-900 truncate">
                {selectedFile.name}
              </p>
              <p className="text-xs text-slate-500 mt-1">
                {(selectedFile.size / 1024).toFixed(1)} KB
              </p>

              {processing && (
                <div className="mt-3 flex items-center gap-2 text-xs text-blue-600">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Processing receipt with OCR...</span>
                </div>
              )}

              {!processing && !uploading && (
                <div className="mt-3 flex items-center gap-2">
                  <button
                    onClick={handleUpload}
                    className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    Upload & Scan
                  </button>
                  <button
                    onClick={handleRemove}
                    className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    <X className="w-3.5 h-3.5" />
                    Remove
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* OCR Debug Information */}
      {ocrDebug && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
          <p className="text-xs font-medium text-blue-800 mb-2">OCR Debug Info:</p>
          <div className="text-xs text-blue-700 space-y-1">
            <p><strong>Receipt ID:</strong> {ocrDebug.receiptId}</p>
            <p><strong>Has OCR Result:</strong> {ocrDebug.hasOcrResult ? 'Yes' : 'No'}</p>
            {ocrDebug.hasOcrResult && ocrDebug.ocrResult !== 'NO OCR RESULT' && (
              <>
                <p><strong>Confidence:</strong> {(ocrDebug.ocrResult.confidence * 100).toFixed(1)}%</p>
                <p><strong>Raw Text Length:</strong> {ocrDebug.ocrResult.rawTextLength}</p>
                <p><strong>Vendor:</strong> {ocrDebug.ocrResult.vendor || 'Not detected'}</p>
                <p><strong>Date:</strong> {ocrDebug.ocrResult.date || 'Not detected'}</p>
                <p><strong>Amount:</strong> {ocrDebug.ocrResult.amount || 'Not detected'}</p>
                <p><strong>Raw Text Preview:</strong> {ocrDebug.ocrResult.rawTextPreview}</p>
              </>
            )}
          </div>
        </div>
      )}

      {/* Image Capture Modal */}
      {showImageCapture && (
        <BaseModal isOpen={showImageCapture} onClose={handleImageCaptureCancel} size="md">
          <div className="p-4 sm:p-6">
              <SmartImageCapture
                title="Crop Receipt Photo"
                subtitle="Adjust the crop area to capture the receipt details"
                mode="receipt"
                onImageReady={handleImageCapture}
                onCancel={handleImageCaptureCancel}
                maxSize={2000}
                quality={0.95}
                allowPDF={false}
                initialFile={initialFile}
              />
          </div>
        </BaseModal>
      )}
    </div>
  );
}
