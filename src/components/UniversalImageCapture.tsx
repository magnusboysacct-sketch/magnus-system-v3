import React, { useState, useRef, useCallback } from "react";
import { Camera, Upload, X, Check, Crop, FileText } from "lucide-react";

export type ImageCaptureMode = "id_photo" | "worker_photo" | "receipt" | "general";

interface UniversalImageCaptureProps {
  title: string;
  subtitle?: string;
  mode: ImageCaptureMode;
  onImageReady: (file: File, metadata?: { width: number; height: number; size: number }) => void;
  onCancel: () => void;
  maxSize?: number; // Max dimension in pixels
  quality?: number; // 0-1 for JPEG quality
  allowPDF?: boolean; // For receipts
}

interface CroppedImage {
  file: File;
  preview: string;
  width: number;
  height: number;
  size: number;
}

export default function UniversalImageCapture({
  title,
  subtitle,
  mode,
  onImageReady,
  onCancel,
  maxSize = 1600,
  quality = 0.8,
  allowPDF = false,
}: UniversalImageCaptureProps) {
  const [step, setStep] = useState<'capture' | 'crop' | 'pdf_preview'>('capture');
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [croppedImage, setCroppedImage] = useState<CroppedImage | null>(null);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  // Get aspect ratio based on mode
  const getAspectRatio = useCallback(() => {
    switch (mode) {
      case "id_photo":
        return 1.6; // Standard ID card ratio
      case "worker_photo":
        return 1.0; // Square for worker photos
      case "receipt":
        return 1.4; // Receipt-like aspect ratio
      case "general":
        return 1.0; // Default square
      default:
        return 1.0;
    }
  }, [mode]);

  // Get crop instructions based on mode
  const getCropInstructions = useCallback(() => {
    switch (mode) {
      case "id_photo":
        return "Crop to show the ID card clearly";
      case "worker_photo":
        return "Crop to show the worker's face clearly";
      case "receipt":
        return "Crop to show the receipt details";
      case "general":
        return "Adjust the crop as needed";
      default:
        return "Adjust the crop as needed";
    }
  }, [mode]);

  // Handle file selection from camera or gallery
  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    
    // Handle PDF files for receipts
    if (file.type === 'application/pdf') {
      if (!allowPDF) {
        setError('PDF files are not allowed for this type of image');
        return;
      }
      
      // Validate file size (max 10MB)
      if (file.size > 10 * 1024 * 1024) {
        setError('File is too large. Please select a file under 10MB.');
        return;
      }

      setSelectedFile(file);
      setStep('pdf_preview');
      setError(null);
      return;
    }

    if (!file.type.startsWith('image/')) {
      setError('Please select an image file');
      return;
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      setError('Image is too large. Please select an image under 10MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      if (event.target?.result) {
        setSelectedImage(event.target.result as string);
        setSelectedFile(file);
        setStep('crop');
        setError(null);
      }
    };
    reader.readAsDataURL(file);

    // Clear input
    if (e.target === fileInputRef.current && fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    if (e.target === cameraInputRef.current && cameraInputRef.current) {
      cameraInputRef.current.value = '';
    }
  }, [allowPDF]);

  // Crop and compress the image
  const handleCrop = useCallback(async () => {
    if (!imageRef.current || !canvasRef.current || !selectedFile) return;

    setProcessing(true);
    setError(null);

    try {
      const image = imageRef.current;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      
      if (!ctx) throw new Error('Canvas context not available');

      const aspectRatio = getAspectRatio();
      const imgWidth = image.naturalWidth;
      const imgHeight = image.naturalHeight;
      let cropWidth = imgWidth;
      let cropHeight = imgHeight;

      // Calculate crop dimensions based on aspect ratio
      if (aspectRatio > 1) {
        // Landscape orientation
        cropHeight = imgWidth / aspectRatio;
        if (cropHeight > imgHeight) {
          cropHeight = imgHeight;
          cropWidth = imgHeight * aspectRatio;
        }
      } else {
        // Portrait orientation
        cropWidth = imgHeight * aspectRatio;
        if (cropWidth > imgWidth) {
          cropWidth = imgWidth;
          cropHeight = imgWidth / aspectRatio;
        }
      }

      // Center the crop
      const x = (imgWidth - cropWidth) / 2;
      const y = (imgHeight - cropHeight) / 2;

      // Set canvas size to crop dimensions
      canvas.width = cropWidth;
      canvas.height = cropHeight;

      // Draw cropped image
      ctx.drawImage(image, x, y, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);

      // Resize if necessary to max size
      let finalWidth = cropWidth;
      let finalHeight = cropHeight;

      if (cropWidth > maxSize || cropHeight > maxSize) {
        const scale = Math.min(maxSize / cropWidth, maxSize / cropHeight);
        finalWidth = Math.floor(cropWidth * scale);
        finalHeight = Math.floor(cropHeight * scale);

        const resizedCanvas = document.createElement('canvas');
        const resizedCtx = resizedCanvas.getContext('2d');
        
        if (!resizedCtx) throw new Error('Resized canvas context not available');

        resizedCanvas.width = finalWidth;
        resizedCanvas.height = finalHeight;

        resizedCtx.drawImage(canvas, 0, 0, finalWidth, finalHeight);
        
        // Convert to blob
        const blob = await new Promise<Blob>((resolve, reject) => {
          resizedCanvas.toBlob(
            (blob) => {
              if (blob) {
                resolve(blob);
              } else {
                reject(new Error('Failed to create blob'));
              }
            },
            'image/jpeg',
            quality
          );
        });

        const fileName = `cropped_${mode}_${Date.now()}.jpg`;
        const file = new File([blob], fileName, { type: 'image/jpeg' });
        
        setCroppedImage({
          file,
          preview: URL.createObjectURL(blob),
          width: finalWidth,
          height: finalHeight,
          size: blob.size
        });

      } else {
        // Convert to blob without resizing
        const blob = await new Promise<Blob>((resolve, reject) => {
          canvas.toBlob(
            (blob) => {
              if (blob) {
                resolve(blob);
              } else {
                reject(new Error('Failed to create blob'));
              }
            },
            'image/jpeg',
            quality
          );
        });

        const fileName = `cropped_${mode}_${Date.now()}.jpg`;
        const file = new File([blob], fileName, { type: 'image/jpeg' });
        
        setCroppedImage({
          file,
          preview: URL.createObjectURL(blob),
          width: cropWidth,
          height: cropHeight,
          size: blob.size
        });
      }

      setStep('crop');
    } catch (err) {
      console.error('Crop error:', err);
      setError('Failed to process image. Please try again.');
    } finally {
      setProcessing(false);
    }
  }, [mode, getAspectRatio, maxSize, quality, selectedFile]);

  // Handle PDF upload directly
  const handlePDFUpload = useCallback(() => {
    if (!selectedFile) return;
    
    onImageReady(selectedFile, {
      width: 0, // PDFs don't have dimensions
      height: 0,
      size: selectedFile.size
    });
  }, [selectedFile, onImageReady]);

  // Handle final save
  const handleSave = useCallback(() => {
    if (croppedImage) {
      onImageReady(croppedImage.file, {
        width: croppedImage.width,
        height: croppedImage.height,
        size: croppedImage.size
      });
    }
  }, [croppedImage, onImageReady]);

  // Reset to capture step
  const handleReset = useCallback(() => {
    setSelectedImage(null);
    setSelectedFile(null);
    setCroppedImage(null);
    setStep('capture');
    setError(null);
  }, []);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="text-center">
        <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
        {subtitle && (
          <p className="text-sm text-slate-600 mt-1">{subtitle}</p>
        )}
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
          <div className="flex items-center gap-2">
            <X className="w-4 h-4 text-red-600" />
            <span className="text-sm text-red-700">{error}</span>
          </div>
        </div>
      )}

      {/* Step 1: Capture */}
      {step === 'capture' && (
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => cameraInputRef.current?.click()}
            className="w-full p-6 rounded-xl border-2 border-dashed border-slate-300 bg-white hover:border-blue-500 hover:bg-blue-50 transition-all group"
          >
            <div className="flex flex-col items-center gap-3">
              <div className="w-14 h-14 rounded-full bg-blue-500/20 flex items-center justify-center group-hover:bg-blue-500/30 transition">
                <Camera className="w-7 h-7 text-blue-600" />
              </div>
              <div className="text-center">
                <div className="text-base font-medium text-slate-900">Take Photo</div>
                <div className="text-sm text-slate-600 mt-1">Use camera to capture</div>
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="w-full p-6 rounded-xl border-2 border-dashed border-slate-300 bg-white hover:border-green-500 hover:bg-green-50 transition-all group"
          >
            <div className="flex flex-col items-center gap-3">
              <div className="w-14 h-14 rounded-full bg-green-500/20 flex items-center justify-center group-hover:bg-green-500/30 transition">
                <Upload className="w-7 h-7 text-green-600" />
              </div>
              <div className="text-center">
                <div className="text-base font-medium text-slate-900">
                  {allowPDF ? "Choose Photo or PDF" : "Choose Photo"}
                </div>
                <div className="text-sm text-slate-600 mt-1">
                  {allowPDF ? "Select from gallery or device" : "Select from gallery"}
                </div>
              </div>
            </div>
          </button>

          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleFileSelect}
            className="hidden"
          />

          <input
            ref={fileInputRef}
            type="file"
            accept={allowPDF ? "image/*,application/pdf" : "image/*"}
            onChange={handleFileSelect}
            className="hidden"
          />
        </div>
      )}

      {/* Step 2: PDF Preview */}
      {step === 'pdf_preview' && (
        <div className="space-y-4">
          <div className="text-center">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-orange-100 text-orange-700 rounded-full text-sm">
              <FileText className="w-4 h-4" />
              PDF Document Ready
            </div>
          </div>

          <div className="bg-slate-100 rounded-lg p-4 text-center">
            <FileText className="w-16 h-16 text-slate-400 mx-auto mb-2" />
            <div className="text-sm font-medium text-slate-900">{selectedFile?.name}</div>
            <div className="text-xs text-slate-600 mt-1">
              {selectedFile && `${(selectedFile.size / 1024).toFixed(1)} KB`}
            </div>
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleReset}
              className="flex-1 px-4 py-2 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 transition-colors"
            >
              <X className="w-4 h-4 inline mr-2" />
              Cancel
            </button>
            <button
              type="button"
              onClick={handlePDFUpload}
              className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
            >
              <Check className="w-4 h-4 inline mr-2" />
              Use This PDF
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Crop */}
      {step === 'crop' && (
        <div className="space-y-4">
          {selectedImage && !croppedImage && (
            <>
              <div className="text-center">
                <div className="inline-flex items-center gap-2 px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm">
                  <Crop className="w-4 h-4" />
                  {getCropInstructions()}
                </div>
              </div>

              <div className="relative bg-slate-100 rounded-lg overflow-hidden">
                <img
                  ref={imageRef}
                  src={selectedImage}
                  alt="Crop preview"
                  className="w-full h-auto max-h-48 sm:max-h-64 md:max-h-80 lg:max-h-96 object-contain"
                  style={{ aspectRatio: getAspectRatio() }}
                />
                <canvas
                  ref={canvasRef}
                  className="hidden"
                />
              </div>

              <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
                <button
                  type="button"
                  onClick={handleReset}
                  disabled={processing}
                  className="flex-1 px-3 py-2 sm:px-4 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm sm:text-base"
                >
                  <X className="w-4 h-4 inline mr-2" />
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleCrop}
                  disabled={processing}
                  className="flex-1 px-3 py-2 sm:px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm sm:text-base"
                >
                  {processing ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin inline mr-2" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <Crop className="w-4 h-4 inline mr-2" />
                      Crop & Save
                    </>
                  )}
                </button>
              </div>
            </>
          )}

          {croppedImage && (
            <>
              <div className="text-center">
                <div className="inline-flex items-center gap-2 px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm">
                  <Check className="w-4 h-4" />
                  Image Ready
                </div>
              </div>

              <div className="bg-slate-100 rounded-lg overflow-hidden">
                <img
                  src={croppedImage.preview}
                  alt="Cropped preview"
                  className="w-full h-auto max-h-32 sm:max-h-48 md:max-h-64 object-contain"
                />
              </div>

              <div className="text-center text-xs text-slate-600">
                {croppedImage.width} × {croppedImage.height}px ({(croppedImage.size / 1024).toFixed(1)} KB)
              </div>

              <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
                <button
                  type="button"
                  onClick={handleReset}
                  className="flex-1 px-3 py-2 sm:px-4 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 transition-colors text-sm sm:text-base"
                >
                  <X className="w-4 h-4 inline mr-2" />
                  Retake
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  className="flex-1 px-3 py-2 sm:px-4 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm sm:text-base"
                >
                  <Check className="w-4 h-4 inline mr-2" />
                  Use This Photo
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Cancel Button */}
      <div className="pt-4 border-t border-slate-200">
        <button
          type="button"
          onClick={onCancel}
          className="w-full px-4 py-2 text-slate-600 hover:text-slate-800 transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
