import React, { useState, useCallback, useEffect, useRef } from 'react';
import Cropper from 'react-easy-crop';
import { Camera, Upload, X, Check, FileText, Move, Loader2 } from 'lucide-react';
import type { SmartImageCaptureProps, CropArea, ImageCaptureResult } from '../types/imageCapture';
import { useImageCapture } from '../hooks/useImageCapture';

export default function SmartImageCapture({
  title,
  subtitle,
  mode,
  onImageReady,
  onCancel,
  maxSize,
  quality,
  allowPDF = false,
  initialFile
}: SmartImageCaptureProps) {
  const {
    state,
    cropSettings,
    fileInputRef,
    handleFileSelect,
    handleCropComplete,
    handleReset,
    handleRetake,
    handleCameraCapture,
    handleGallerySelect,
    instructions,
    aspectRatio,
    setCropSettings
  } = useImageCapture({
    mode,
    maxSize,
    quality,
    allowPDF,
    initialFile,
    onImageReady,
    onCancel
  });

  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<CropArea | null>(null);
  const [imageDimensions, setImageDimensions] = useState({ width: 0, height: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  // Intelligent initial crop setup based on image dimensions
  useEffect(() => {
    if (state.selectedImage) {
      const img = new Image();
      img.onload = () => {
        setImageDimensions({ width: img.width, height: img.height });
        
        if (mode === 'receipt') {
          // For receipts: analyze aspect ratio and set intelligent crop
          const imageRatio = img.width / img.height;
          
          if (imageRatio < 0.8) {
            // Tall receipt - zoom out to show more content
            setZoom(0.9);
            setCrop({ x: 0, y: 5 });
          } else if (imageRatio > 1.2) {
            // Wide receipt - zoom in and center
            setZoom(1.3);
            setCrop({ x: 15, y: 10 });
          } else {
            // Square-ish receipt - moderate zoom
            setZoom(1.1);
            setCrop({ x: 5, y: 5 });
          }
        } else {
          // For other modes: use default centered crop
          setZoom(1);
          setCrop({ x: 0, y: 0 });
        }
      };
      img.src = state.selectedImage;
    }
  }, [state.selectedImage, mode]);

  const onCropComplete = useCallback((croppedArea: CropArea, croppedAreaPixels: CropArea) => {
    setCroppedAreaPixels(croppedAreaPixels);
  }, []);

  const onCrop = useCallback(async () => {
    if (!state.selectedImage || !croppedAreaPixels) return;
    
    // Convert pixel crop to percentage crop for our hook
    const img = new Image();
    img.onload = async () => {
      const percentageCrop = {
        x: (croppedAreaPixels.x / img.width) * 100,
        y: (croppedAreaPixels.y / img.height) * 100,
        width: (croppedAreaPixels.width / img.width) * 100,
        height: (croppedAreaPixels.height / img.height) * 100
      };
      
      await handleCropComplete(percentageCrop);
    };
    img.src = state.selectedImage;
  }, [state.selectedImage, croppedAreaPixels, handleCropComplete]);

  // Capture Step
  if (state.step === 'capture') {
    return (
      <div className="space-y-4">
        {/* Header */}
        <div className="text-center">
          <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
          {subtitle && (
            <p className="mt-1 text-sm text-slate-600">{subtitle}</p>
          )}
        </div>

        {/* Error Display */}
        {state.error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3">
            <div className="flex items-center gap-2">
              <X className="h-4 w-4 text-red-600" />
              <span className="text-sm text-red-700">{state.error}</span>
            </div>
          </div>
        )}

        {/* Capture Options */}
        <div className="space-y-3">
          <button
            type="button"
            onClick={handleCameraCapture}
            className="group w-full rounded-xl border-2 border-dashed border-slate-300 bg-white p-6 transition-all hover:border-blue-500 hover:bg-blue-50"
          >
            <div className="flex flex-col items-center gap-3">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-500/20 transition group-hover:bg-blue-500/30">
                <Camera className="h-7 w-7 text-blue-600" />
              </div>
              <div className="text-center">
                <div className="text-base font-medium text-slate-900">Take Photo</div>
                <div className="mt-1 text-sm text-slate-600">Use camera to capture</div>
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={handleGallerySelect}
            className="group w-full rounded-xl border-2 border-dashed border-slate-300 bg-white p-6 transition-all hover:border-green-500 hover:bg-green-50"
          >
            <div className="flex flex-col items-center gap-3">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-green-500/20 transition group-hover:bg-green-500/30">
                <Upload className="h-7 w-7 text-green-600" />
              </div>
              <div className="text-center">
                <div className="text-base font-medium text-slate-900">
                  {allowPDF ? "Select from gallery or device" : "Select from gallery"}
                </div>
                <div className="mt-1 text-sm text-slate-600">
                  {allowPDF ? "Images (JPG, PNG, WEBP) or PDF" : "Images (JPG, PNG, WEBP)"}
                </div>
              </div>
            </div>
          </button>
        </div>

        {/* Hidden File Input */}
        <input
          ref={fileInputRef}
          type="file"
          accept={allowPDF ? "image/jpeg,image/jpg,image/png,image/webp,application/pdf" : "image/jpeg,image/jpg,image/png,image/webp"}
          onChange={handleFileSelect}
          className="hidden"
          capture="environment"
        />
      </div>
    );
  }

  // Crop Step
  if (state.step === 'crop' && state.selectedImage) {
    return (
      <div className="space-y-3">
        {/* Header - Compact */}
        <div className="text-center pt-1">
          <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
          <div className="mt-1 flex justify-center">
            <div className="inline-flex items-center gap-2 rounded-full bg-blue-100 px-3 py-1 text-sm text-blue-700 shadow-sm">
              <Move className="h-4 w-4" />
              {instructions}
            </div>
          </div>
        </div>

        {/* Error Display - Compact */}
        {state.error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-2">
            <div className="flex items-center gap-2">
              <X className="h-4 w-4 text-red-600" />
              <span className="text-sm text-red-700">{state.error}</span>
            </div>
          </div>
        )}

        {/* Crop Container - Increased height */}
        <div 
          ref={containerRef}
          className="relative overflow-hidden rounded-lg bg-slate-900"
          style={{ 
            minHeight: mode === 'receipt' ? '450px' : '400px',
            maxHeight: '75vh',
            height: 'clamp(400px, 65vh, 550px)'
          }}
        >
          <div className="absolute inset-0 flex items-center justify-center p-2">
            <div className="relative w-full h-full">
              <Cropper
                image={state.selectedImage}
                crop={crop}
                zoom={zoom}
                aspect={aspectRatio}
                onCropChange={setCrop}
                onCropComplete={onCropComplete}
                onZoomChange={setZoom}
                objectFit="contain"
                style={{
                  containerStyle: {
                    backgroundColor: '#1e293b',
                    borderRadius: '0.5rem',
                    width: '100%',
                    height: '100%'
                  },
                  cropAreaStyle: {
                    border: '2px solid rgba(59, 130, 246, 0.5)',
                    boxShadow: '0 0 0 9999px rgba(30, 41, 59, 0.8)'
                  }
                }}
              />
            </div>
          </div>
        </div>

        {/* Action Buttons - Enhanced and balanced */}
        <div className="flex flex-col gap-3 sm:flex-row sm:gap-3">
          <button
            type="button"
            onClick={handleReset}
            disabled={state.processing}
            className="flex-1 rounded-lg border-2 border-slate-400 bg-white px-4 py-3 text-sm font-medium text-slate-700 transition-all hover:border-slate-500 hover:bg-slate-50 active:border-slate-600 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-white sm:px-4 sm:text-base"
          >
            <X className="mr-2 inline h-4 w-4" />
            Cancel
          </button>
          <button
            type="button"
            onClick={onCrop}
            disabled={state.processing || !croppedAreaPixels}
            className="flex-1 rounded-lg bg-blue-600 px-4 py-3 text-sm font-medium text-white transition-all hover:bg-blue-700 active:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50 sm:px-4 sm:text-base"
          >
            {state.processing ? (
              <>
                <div className="mr-2 inline h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                Processing...
              </>
            ) : (
              <>
                <Check className="mr-2 inline h-4 w-4" />
                Crop & Save
              </>
            )}
          </button>
        </div>
      </div>
    );
  }

  // Result Step
  if (state.step === 'result' && state.croppedImage) {
    return (
      <div className="space-y-4">
        {/* Header */}
        <div className="text-center">
          <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
          <div className="mt-2 flex justify-center">
            <div className="inline-flex items-center gap-2 rounded-full bg-green-100 px-3 py-1.5 text-sm text-green-700 shadow-sm">
              <Check className="h-4 w-4" />
              Image Ready
            </div>
          </div>
        </div>

        {/* Preview */}
        <div className="overflow-hidden rounded-lg bg-slate-100">
          <img
            src={state.croppedImage.preview}
            alt="Cropped preview"
            className="h-auto max-h-32 w-full object-contain sm:max-h-48 md:max-h-64"
          />
        </div>

        {/* Image Info */}
        <div className="text-center text-sm text-slate-600">
          {state.croppedImage.width} × {state.croppedImage.height}px ({(state.croppedImage.size / 1024).toFixed(1)} KB)
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col gap-2 sm:flex-row sm:gap-3">
          <button
            type="button"
            onClick={handleRetake}
            className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 transition-colors hover:bg-slate-50 sm:px-4 sm:text-base"
          >
            <X className="mr-2 inline h-4 w-4" />
            Retake
          </button>
          <button
            type="button"
            onClick={() => {
              if (state.croppedImage) {
                onImageReady(state.croppedImage);
              }
            }}
            className="flex-1 rounded-lg bg-green-600 px-3 py-2 text-sm text-white transition-colors hover:bg-green-700 sm:px-4 sm:text-base"
          >
            <Check className="mr-2 inline h-4 w-4" />
            Use This Photo
          </button>
        </div>
      </div>
    );
  }

  // PDF Result (for PDF files)
  if (state.step === 'result' && state.selectedFile && state.selectedFile.type === 'application/pdf') {
    return (
      <div className="space-y-4">
        {/* Header */}
        <div className="text-center">
          <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
          <div className="mt-2 flex justify-center">
            <div className="inline-flex items-center gap-2 rounded-full bg-orange-100 px-3 py-1.5 text-sm text-orange-700 shadow-sm">
              <FileText className="h-4 w-4" />
              PDF Document Ready
            </div>
          </div>
        </div>

        {/* PDF Info */}
        <div className="rounded-lg bg-slate-100 p-4 text-center">
          <FileText className="mx-auto mb-2 h-16 w-16 text-slate-400" />
          <div className="text-sm font-medium text-slate-900">{state.selectedFile.name}</div>
          <div className="mt-1 text-xs text-slate-600">
            {(state.selectedFile.size / 1024).toFixed(1)} KB
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col gap-2 sm:flex-row sm:gap-3">
          <button
            type="button"
            onClick={handleReset}
            className="flex-1 rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 transition-colors hover:bg-slate-50 sm:text-base"
          >
            <X className="mr-2 inline h-4 w-4" />
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              if (state.selectedFile) {
                const result: ImageCaptureResult = {
                  file: state.selectedFile,
                  preview: '',
                  width: 0,
                  height: 0,
                  size: state.selectedFile.size
                };
                onImageReady(result);
              }
            }}
            className="flex-1 rounded-lg bg-green-600 px-4 py-2 text-sm text-white transition-colors hover:bg-green-700 sm:text-base"
          >
            <Check className="mr-2 inline h-4 w-4" />
            Use This PDF
          </button>
        </div>
      </div>
    );
  }

  // Processing State
  return (
    <div className="flex flex-col items-center justify-center space-y-4 py-8">
      <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      <div className="text-sm text-slate-600">Processing...</div>
    </div>
  );
}
