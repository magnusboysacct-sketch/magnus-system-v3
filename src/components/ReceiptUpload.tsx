import { useState, useRef } from 'react';
import { Upload, X, FileText, Image, Loader as Loader2, CircleCheck as CheckCircle } from 'lucide-react';
import { uploadReceipt, type OCRResult } from '../lib/receiptOCR';

interface ReceiptUploadProps {
  companyId: string;
  userId: string;
  onUploadComplete: (receiptId: string, ocrResult: OCRResult | null) => void;
  onCancel?: () => void;
}

export function ReceiptUpload({ companyId, userId, onUploadComplete, onCancel }: ReceiptUploadProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

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
    setSelectedFile(file);

    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (e) => {
        setPreview(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    } else {
      setPreview(null);
    }
  }

  async function handleUpload() {
    if (!selectedFile) return;

    setUploading(true);
    setProcessing(true);
    setError(null);

    try {
      const result = await uploadReceipt(selectedFile, companyId, userId);
      onUploadComplete(result.receiptId, result.ocrResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload receipt');
      setUploading(false);
      setProcessing(false);
    }
  }

  function handleRemove() {
    setSelectedFile(null);
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
    </div>
  );
}
