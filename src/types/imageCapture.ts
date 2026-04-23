export type ImageCaptureMode = "receipt" | "id" | "worker_photo" | "general";

export interface ImageCaptureResult {
  file: File;
  preview: string;
  width: number;
  height: number;
  size: number;
  ocrFile?: File;
}

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

export interface SmartImageCaptureProps {
  title: string;
  subtitle?: string;
  mode: ImageCaptureMode;
  onImageReady: (result: ImageCaptureResult) => void;
  onCancel: () => void;
  maxSize?: number;
  quality?: number;
  allowPDF?: boolean;
  initialFile?: File | null;
}

export interface ImageCaptureState {
  step: 'capture' | 'crop' | 'ocr' | 'result';
  selectedImage: string | null;
  selectedFile: File | null;
  croppedImage: ImageCaptureResult | null;
  ocrResult: OCRResult | IDOCRResult | null;
  processing: boolean;
  error: string | null;
}

export interface CropArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CropSettings {
  aspect: number | undefined;
  zoom: number;
  crop: CropArea;
}
