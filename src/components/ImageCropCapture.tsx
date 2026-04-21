import React, { useState, useRef, useCallback } from "react";
import { Camera, Upload, X, Check, Crop } from "lucide-react";

interface ImageCropCaptureProps {
  title: string;
  subtitle?: string;
  onImageReady: (file: File) => void;
  onCancel: () => void;
  aspectRatio?: number;
  maxSize?: number; // Max dimension in pixels
  quality?: number; // 0-1 for JPEG quality
}

interface CroppedImage {
  file: File;
  preview: string;
}

export default function ImageCropCapture({
  title,
  subtitle,
  onImageReady,
  onCancel,
  aspectRatio = 1,
  maxSize = 800,
  quality = 0.8,
}: ImageCropCaptureProps) {
  const [step, setStep] = useState<'capture' | 'crop'>('capture');
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [croppedImage, setCroppedImage] = useState<CroppedImage | null>(null);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  // Handle file selection from camera or gallery
  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
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
  }, []);

  // Crop and compress the image
  const handleCrop = useCallback(async () => {
    if (!imageRef.current || !canvasRef.current) return;

    setProcessing(true);
    setError(null);

    try {
      const image = imageRef.current;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      
      if (!ctx) throw new Error('Canvas context not available');

      // Calculate crop dimensions
      const imgWidth = image.naturalWidth;
      const imgHeight = image.naturalHeight;
      let cropWidth = imgWidth;
      let cropHeight = imgHeight;

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

      // Set canvas size
      canvas.width = cropWidth;
      canvas.height = cropHeight;

      // Draw cropped image
      ctx.drawImage(image, x, y, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);

      // Resize if necessary
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

        const fileName = `cropped_${Date.now()}.jpg`;
        const file = new File([blob], fileName, { type: 'image/jpeg' });
        
        setCroppedImage({
          file,
          preview: URL.createObjectURL(blob)
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

        const fileName = `cropped_${Date.now()}.jpg`;
        const file = new File([blob], fileName, { type: 'image/jpeg' });
        
        setCroppedImage({
          file,
          preview: URL.createObjectURL(blob)
        });
      }

      setStep('crop');
    } catch (err) {
      console.error('Crop error:', err);
      setError('Failed to process image. Please try again.');
    } finally {
      setProcessing(false);
    }
  }, [aspectRatio, maxSize, quality]);

  // Handle final save
  const handleSave = useCallback(() => {
    if (croppedImage) {
      onImageReady(croppedImage.file);
    }
  }, [croppedImage, onImageReady]);

  // Reset to capture step
  const handleReset = useCallback(() => {
    setSelectedImage(null);
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
                <div className="text-base font-medium text-slate-900">Choose Photo</div>
                <div className="text-sm text-slate-600 mt-1">Select from gallery</div>
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
            accept="image/*"
            onChange={handleFileSelect}
            className="hidden"
          />
        </div>
      )}

      {/* Step 2: Crop */}
      {step === 'crop' && (
        <div className="space-y-4">
          {selectedImage && !croppedImage && (
            <>
              <div className="text-center">
                <div className="inline-flex items-center gap-2 px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm">
                  <Crop className="w-4 h-4" />
                  Adjust and crop your image
                </div>
              </div>

              <div className="relative bg-slate-100 rounded-lg overflow-hidden">
                <img
                  ref={imageRef}
                  src={selectedImage}
                  alt="Crop preview"
                  className="w-full h-auto max-h-96 object-contain"
                  style={{ aspectRatio }}
                />
                <canvas
                  ref={canvasRef}
                  className="hidden"
                />
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={handleReset}
                  disabled={processing}
                  className="flex-1 px-4 py-2 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <X className="w-4 h-4 inline mr-2" />
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleCrop}
                  disabled={processing}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
                  Image ready
                </div>
              </div>

              <div className="bg-slate-100 rounded-lg overflow-hidden">
                <img
                  src={croppedImage.preview}
                  alt="Cropped preview"
                  className="w-full h-auto max-h-64 object-contain"
                />
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={handleReset}
                  className="flex-1 px-4 py-2 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  <X className="w-4 h-4 inline mr-2" />
                  Retake
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
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
