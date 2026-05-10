import React, { useState, useCallback, useEffect, useRef } from 'react';
import Cropper, { type Point } from 'react-easy-crop';
import { Camera, Upload, X, Check, FileText, Move, Loader2, AlertTriangle, Lightbulb, RotateCw, RotateCcw, Crop, Monitor, Square, Scan } from 'lucide-react';
import type { SmartImageCaptureProps, CropArea, ImageCaptureResult } from '../types/imageCapture';
import { useImageCapture } from '../hooks/useImageCapture';
import { analyzeImageQuality, type ImageQualityAnalysis } from '../utils/imageUtils';
import { PaperEdgeDetector, type PaperBounds } from '../services/documentDetection/PaperEdgeDetector';
import { CropOptimizer, type CropSettings } from '../services/documentDetection/CropOptimizer';

export default function SmartImageCapture({
  title,
  subtitle,
  mode,
  scanType = 'auto',
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

  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(0.8); // Start slightly zoomed out for larger crop area
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<CropArea | null>(null);
  const [imageDimensions, setImageDimensions] = useState({ width: 0, height: 0 });
  const [qualityAnalysis, setQualityAnalysis] = useState<ImageQualityAnalysis | null>(null);
  const [analyzingQuality, setAnalyzingQuality] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [cropFrameType, setCropFrameType] = useState<'portrait' | 'landscape' | 'square'>('portrait');
  const [cropAspectRatio, setCropAspectRatio] = useState<number>(0.7); // Default portrait
  const [maxZoom, setMaxZoom] = useState(3);
  const [documentBounds, setDocumentBounds] = useState<PaperBounds | null>(null);
  const [autoFitEnabled, setAutoFitEnabled] = useState(true);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [ocrFillRatio, setOcrFillRatio] = useState(0);
  const [ocrSuggestion, setOcrSuggestion] = useState<string>('');
  const [cropOptimization, setCropOptimization] = useState<any>(null);
  const [userHasAdjustedCrop, setUserHasAdjustedCrop] = useState(false);
  const analysisTimeoutRef = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Smart crop frame detection and setup
  useEffect(() => {
    if (state.selectedImage) {
      const img = new Image();
      img.onload = () => {
        setImageDimensions({ width: img.width, height: img.height });
        
        // If document bounds exist, use CropOptimizer for frame selection
        if (documentBounds) {
          const optimization = CropOptimizer.optimizeCrop(documentBounds, imageDimensions);
          
          setCropFrameType(optimization.cropSettings.frameType);
          setCropAspectRatio(optimization.cropSettings.aspectRatio);
          setMaxZoom(optimization.cropSettings.maxZoom);
          setZoom(optimization.cropSettings.zoom);
          setCrop({ x: optimization.cropSettings.x, y: optimization.cropSettings.y });
          
          console.log('INITIAL_FRAME_FROM_DOCUMENT_BOUNDS:', {
            documentBounds,
            optimization: {
              frameType: optimization.cropSettings.frameType,
              aspectRatio: optimization.cropSettings.aspectRatio,
              confidence: optimization.confidence.toFixed(2),
              reasoning: optimization.reasoning
            }
          });
        } else {
          // Fallback: use image aspect ratio when no document bounds yet
          const imageRatio = img.width / img.height;
          
          // Default to landscape for wide documents/invoices (more aggressive)
          if (imageRatio > 1.2) {
            // Wide document - landscape frame
            setCropFrameType('landscape');
            setCropAspectRatio(1.5);
            setMaxZoom(6);
            setZoom(0.8); // Start zoomed out for larger crop area
          } else if (imageRatio >= 0.8 && imageRatio <= 1.2) {
            // Square-ish document - square frame
            setCropFrameType('square');
            setCropAspectRatio(1.0);
            setMaxZoom(4);
            setZoom(0.8);
          } else {
            // Tall document - portrait frame
            setCropFrameType('portrait');
            setCropAspectRatio(0.7);
            setMaxZoom(3.5);
            setZoom(0.8);
          }
          
          console.log('INITIAL_FRAME_FROM_IMAGE_RATIO:', {
            imageRatio: imageRatio.toFixed(2),
            frameType: imageRatio > 1.2 ? 'landscape' : imageRatio >= 0.8 && imageRatio <= 1.2 ? 'square' : 'portrait',
            aspectRatio: imageRatio > 1.2 ? 1.5 : imageRatio >= 0.8 && imageRatio <= 1.2 ? 1.0 : 0.7
          });
        }
        
        setCrop({ x: 0, y: 0 });
      };
      img.src = state.selectedImage;
    }
  }, [state.selectedImage, mode, documentBounds]);

  // Enhanced document edge detection using professional service
  const detectDocumentBounds = useCallback((imageSrc: string): Promise<PaperBounds | null> => {
    console.log('DETECTING_DOCUMENT_BOUNDARIES: Using PaperEdgeDetector service');
    return PaperEdgeDetector.detectPaperBoundaries(imageSrc, {
      brightnessThreshold: 140,
      contrastThreshold: 30,
      minPaperSize: 0.15,
      padding: 8,
      maxProcessingTime: 500
    });
  }, []);

  // Professional auto-fit crop using CropOptimizer service
  const applyAutoFitCrop = useCallback(async () => {
    if (!state.selectedImage || !autoFitEnabled || isAnalyzing) return;

    setIsAnalyzing(true);

    try {
      const timeoutId = setTimeout(() => {
        console.log('AUTO_FIT_TIMEOUT: Using default crop');
        // Use stable default crop when edge detection fails
        const imageRatio = imageDimensions.width / imageDimensions.height;
        let defaultFrameType: 'portrait' | 'landscape' | 'square';
        let defaultAspectRatio: number;
        let defaultMaxZoom: number;
        
        if (imageRatio > 1.2) {
          // Landscape ID - wide rectangle
          defaultFrameType = 'landscape';
          defaultAspectRatio = 1.6;
          defaultMaxZoom = 6;
        } else if (imageRatio >= 0.8 && imageRatio <= 1.2) {
          // Square ID - card-sized rectangle
          defaultFrameType = 'square';
          defaultAspectRatio = 1.0;
          defaultMaxZoom = 4;
        } else {
          // Portrait ID - card-sized rectangle
          defaultFrameType = 'portrait';
          defaultAspectRatio = 0.75;
          defaultMaxZoom = 3.5;
        }
        
        setCropFrameType(defaultFrameType);
        setCropAspectRatio(defaultAspectRatio);
        setMaxZoom(defaultMaxZoom);
        setZoom(0.8);
        setCrop({ x: 0, y: 0 });
        
        setIsAnalyzing(false);
        console.log('AUTO_FIT_DEFAULT_APPLIED:', {
          frameType: defaultFrameType,
          aspectRatio: defaultAspectRatio,
          imageRatio: imageRatio.toFixed(2)
        });
      }, 300);

      console.log('APPLYING_AUTO_FIT: Using CropOptimizer service');
      
      const bounds = await detectDocumentBounds(state.selectedImage);
      
      if (!bounds) {
        console.log('NO_DOCUMENT_BOUNDS_DETECTED: Using stable default crop');
        return; // Let timeout handle the default crop
      }

      // Use CropOptimizer for professional crop optimization
      const optimization = CropOptimizer.optimizeCrop(bounds, imageDimensions, cropFrameType);
      
      console.log('CROP_OPTIMIZATION_RESULT:', optimization);

      // Apply optimized crop settings
      setCropFrameType(optimization.cropSettings.frameType);
      setCropAspectRatio(optimization.cropSettings.aspectRatio);
      setMaxZoom(optimization.cropSettings.maxZoom);
      setZoom(optimization.cropSettings.zoom);
      setCrop({ 
        x: optimization.cropSettings.x, 
        y: optimization.cropSettings.y 
      });
      
      // Store optimization for OCR fill meter
      setCropOptimization(optimization);

      clearTimeout(timeoutId);
      setIsAnalyzing(false);

      console.log('AUTO_FIT_APPLIED:', {
        confidence: optimization.confidence.toFixed(2),
        reasoning: optimization.reasoning,
        fillRatio: (optimization.fillRatio * 100).toFixed(0) + '%',
        frameType: optimization.cropSettings.frameType,
        zoom: optimization.cropSettings.zoom.toFixed(2)
      });

    } catch (error) {
      setIsAnalyzing(false);
      console.error('AUTO_FIT_ERROR:', error);
    }
  }, [state.selectedImage, autoFitEnabled, isAnalyzing, detectDocumentBounds, imageDimensions, cropFrameType]);

  // OCR Fill Meter calculation using CropOptimizer service
  const calculateOcrFillRatio = useCallback(() => {
    if (!documentBounds || !imageDimensions.width || !imageDimensions.height) {
      return 0;
    }

    // Use CropOptimizer for consistent fill ratio calculation
    return CropOptimizer.calculateFillRatio(documentBounds, imageDimensions, zoom);
  }, [documentBounds, imageDimensions, zoom]);

  // OCR Suggestion using CropOptimizer service
  const calculateOcrSuggestion = useCallback((fillRatio: number) => {
    return CropOptimizer.getOCRFillSuggestion(fillRatio, cropFrameType);
  }, [cropFrameType]);

  // Update OCR Fill Meter when crop changes
  useEffect(() => {
    const fillRatio = calculateOcrFillRatio();
    setOcrFillRatio(fillRatio);
    setOcrSuggestion(calculateOcrSuggestion(fillRatio));
  }, [zoom, crop, cropFrameType, calculateOcrFillRatio, calculateOcrSuggestion]);

  // Apply auto-fit when image is loaded (run once per image, only if user hasn't adjusted)
  useEffect(() => {
    if (state.selectedImage && autoFitEnabled && !isAnalyzing && !userHasAdjustedCrop) {
      // Clear any existing timeout
      if (analysisTimeoutRef.current) {
        clearTimeout(analysisTimeoutRef.current);
      }
      
      // Run auto-fit with delay to prevent blocking
      analysisTimeoutRef.current = setTimeout(() => {
        applyAutoFitCrop();
      }, 100);
    }
    
    return () => {
      if (analysisTimeoutRef.current) {
        clearTimeout(analysisTimeoutRef.current);
      }
    };
  }, [state.selectedImage]); // Only depend on selectedImage to prevent loops

  // Analyze image quality when image is selected
  useEffect(() => {
    if (state.selectedImage) {
      setAnalyzingQuality(true);
      setQualityAnalysis(null);
      
      analyzeImageQuality(state.selectedImage)
        .then(analysis => {
          setQualityAnalysis(analysis);
          console.log('QUALITY_ANALYSIS_COMPLETE:', analysis);
        })
        .catch(error => {
          console.error('QUALITY_ANALYSIS_FAILED:', error);
        })
        .finally(() => {
          setAnalyzingQuality(false);
        });
    }
  }, [state.selectedImage]);

  const onCropComplete = useCallback((croppedArea: CropArea, croppedAreaPixels: CropArea) => {
    setCroppedAreaPixels(croppedAreaPixels);
    // User has manually adjusted the crop - prevent auto-optimization
    setUserHasAdjustedCrop(true);
  }, []);

  const onCropChange = useCallback((nextCrop: Point) => {
    // User is manually adjusting crop - prevent auto-optimization
    setUserHasAdjustedCrop(true);
    setCrop(nextCrop);
  }, []);

  const handleRotateLeft = useCallback(() => {
    setRotation(prev => (prev - 90) % 360);
  }, []);

  const handleRotateRight = useCallback(() => {
    setRotation(prev => (prev + 90) % 360);
  }, []);

  const onZoomChange = useCallback((nextZoom: number) => {
    // User is manually adjusting zoom - prevent auto-optimization
    setUserHasAdjustedCrop(true);
    setZoom(nextZoom);
  }, []);

  const handleCropFrameChange = useCallback((frameType: 'portrait' | 'landscape' | 'square') => {
    let newAspectRatio: number;
    let newMaxZoom: number;
    
    switch (frameType) {
      case 'portrait':
        newAspectRatio = 0.7;
        newMaxZoom = 2.5;
        break;
      case 'square':
        newAspectRatio = 1.0;
        newMaxZoom = 3;
        break;
      case 'landscape':
        newAspectRatio = 1.5;
        newMaxZoom = 4;
        break;
    }
    
    setCropFrameType(frameType);
    setCropAspectRatio(newAspectRatio);
    setMaxZoom(newMaxZoom);
    
    // Adjust zoom if it exceeds new max
    setZoom(currentZoom => Math.min(currentZoom, newMaxZoom));
    
    console.log('CROP_FRAME_CHANGED:', {
      frameType,
      aspectRatio: newAspectRatio,
      maxZoom: newMaxZoom
    });
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
      <div className="space-y-2 pt-0">
        {/* Header - Ultra Compact */}
        <div className="text-center pt-0 -mt-2">
          <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
          <div className="mt-0.5 flex justify-center">
            <div className="inline-flex items-center gap-2 rounded-full bg-blue-100 px-3 py-1 text-sm text-blue-700 shadow-sm">
              <Move className="h-4 w-4" />
              {mode === 'id' ? 'Drag image and zoom to fit ID in frame' : instructions}
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

        {/* Quality Analysis Display */}
        {analyzingQuality && (
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
            <div className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
              <span className="text-sm text-blue-700">Analyzing image quality...</span>
            </div>
          </div>
        )}

        {qualityAnalysis && qualityAnalysis.overall.needsImprovement && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                <span className="text-sm font-medium text-amber-800">Image Quality Tips</span>
              </div>
              
              {qualityAnalysis.overall.warnings.length > 0 && (
                <div className="space-y-1">
                  {qualityAnalysis.overall.warnings.map((warning, index) => (
                    <div key={index} className="flex items-center gap-2 text-sm text-amber-700">
                      <Lightbulb className="h-3 w-3" />
                      <span>{warning}</span>
                    </div>
                  ))}
                </div>
              )}
              
              <div className="text-xs text-amber-600 italic">
                You can still proceed, but these improvements may help OCR accuracy.
              </div>
            </div>
          </div>
        )}

        {/* Crop Container - Enlarged for better crop box size */}
        <div 
          ref={containerRef}
          className="relative overflow-hidden rounded-lg bg-slate-900"
          style={{ 
            minHeight: mode === 'receipt' ? '400px' : '380px',
            maxHeight: '65vh',
            height: 'clamp(380px, 55vh, 500px)'
          }}
        >
          {/* Crop Frame Controls */}
          <div className="absolute top-2 left-2 z-10 flex flex-col gap-1">
            <button
              type="button"
              onClick={() => setAutoFitEnabled(!autoFitEnabled)}
              className={`rounded p-2 text-white transition ${
                autoFitEnabled 
                  ? 'bg-green-600/80 hover:bg-green-700/80' 
                  : 'bg-slate-800/80 hover:bg-slate-700/80'
              }`}
              title="Auto-fit crop to document"
            >
              <Scan className="h-4 w-4" />
            </button>
          </div>

          {mode !== 'id' && (
          <div className="absolute top-2 right-2 z-10 flex flex-col gap-1">
            <button
              type="button"
              onClick={() => handleCropFrameChange('portrait')}
              className={`rounded p-2 text-white transition ${
                cropFrameType === 'portrait' 
                  ? 'bg-blue-600/80 hover:bg-blue-700/80' 
                  : 'bg-slate-800/80 hover:bg-slate-700/80'
              }`}
              title="Portrait crop"
            >
              <Crop className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => handleCropFrameChange('square')}
              className={`rounded p-2 text-white transition ${
                cropFrameType === 'square' 
                  ? 'bg-blue-600/80 hover:bg-blue-700/80' 
                  : 'bg-slate-800/80 hover:bg-slate-700/80'
              }`}
              title="Square crop"
            >
              <Square className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => handleCropFrameChange('landscape')}
              className={`rounded p-2 text-white transition ${
                cropFrameType === 'landscape' 
                  ? 'bg-blue-600/80 hover:bg-blue-700/80' 
                  : 'bg-slate-800/80 hover:bg-slate-700/80'
              }`}
              title="Landscape crop"
            >
              <Monitor className="h-4 w-4" />
            </button>
          </div>
        )}

          <div className="absolute inset-0 flex items-center justify-center p-1">
            <div className="relative w-full h-full">
              <Cropper
                image={state.selectedImage}
                crop={mode === 'id' ? { x: 0, y: 0 } : crop}
                zoom={zoom}
                aspect={mode === 'id' ? 1.6 : (cropAspectRatio || 1.6)}
                onCropChange={mode === 'id' ? () => {} : onCropChange}
                onCropComplete={onCropComplete}
                onZoomChange={onZoomChange}
                rotation={rotation}
                minZoom={0.3}
                maxZoom={maxZoom}
                zoomSpeed={0.1}
                objectFit="contain"
                style={{
                  containerStyle: {
                    backgroundColor: '#1e293b',
                    borderRadius: '0.5rem',
                    width: '100%',
                    height: '100%'
                  },
                  cropAreaStyle: {
                    border: '2px solid rgba(59, 130, 246, 0.6)',
                    boxShadow: '0 0 0 9999px rgba(30, 41, 59, 0.6)',
                    ...(mode === 'id' && {
                      cursor: 'move' // Show move cursor for ID mode
                    })
                  },
                  mediaStyle: {
                    transform: `rotate(${rotation}deg)`
                  }
                }}
              />
            </div>
          </div>
        </div>

        {/* Zoom and Frame Indicator */}
        <div className="flex items-center justify-between text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <span>Zoom: {(zoom * 100).toFixed(0)}% / {(maxZoom * 100).toFixed(0)}%</span>
            {autoFitEnabled && (
              <span className="text-green-600 flex items-center gap-1">
                <Scan className="h-3 w-3" />
                Auto-fit
              </span>
            )}
          </div>
          <span className="text-blue-600 capitalize">
            {cropFrameType} frame
          </span>
        </div>

        {/* Analysis Status */}
        {isAnalyzing && (
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-2">
            <div className="flex items-center gap-2 text-xs text-blue-700">
              <Loader2 className="h-3 w-3 animate-spin" />
              <span>Analyzing document...</span>
            </div>
          </div>
        )}

        {/* OCR Fill Meter */}
        {documentBounds && (
          <div className="rounded-lg border border-gray-200 bg-white p-3">
            <div className="mb-2">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-gray-700">OCR Fill Meter</span>
                <span className="text-xs text-gray-500">{Math.round(ocrFillRatio * 100)}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div 
                  className={`h-2 rounded-full transition-all duration-200 ${
                    ocrFillRatio < 0.3 
                      ? 'bg-red-500' 
                      : ocrFillRatio < 0.7 
                        ? 'bg-yellow-500' 
                        : 'bg-green-500'
                  }`}
                  style={{ width: `${ocrFillRatio * 100}%` }}
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${
                ocrFillRatio < 0.3 
                  ? 'bg-red-500' 
                  : ocrFillRatio < 0.7 
                    ? 'bg-yellow-500' 
                    : 'bg-green-500'
              }`} />
              <span className={`text-xs font-medium ${
                ocrFillRatio < 0.3 
                  ? 'text-red-700' 
                  : ocrFillRatio < 0.7 
                    ? 'text-yellow-700' 
                    : 'text-green-700'
              }`}>
                {ocrSuggestion}
              </span>
            </div>
          </div>
        )}

        {/* Document Detection Status */}
        {documentBounds && autoFitEnabled && !isAnalyzing && (
          <div className="rounded-lg border border-orange-200 bg-orange-50 p-2">
            <div className="flex items-center gap-2 text-xs text-orange-700">
              <Scan className="h-3 w-3" />
              <span>Aggressive document crop: Paper tightly fitted</span>
            </div>
          </div>
        )}

        {/* Manual Rotation Controls */}
        <div className="flex items-center justify-center gap-2">
          <button
            type="button"
            onClick={handleRotateLeft}
            className="rounded bg-slate-100 px-3 py-1 text-slate-600 transition hover:bg-slate-200"
            title="Rotate left"
          >
            <RotateCcw className="h-3 w-3 inline mr-1" />
            Rotate Left
          </button>
          <button
            type="button"
            onClick={handleRotateRight}
            className="rounded bg-slate-100 px-3 py-1 text-slate-600 transition hover:bg-slate-200"
            title="Rotate right"
          >
            <RotateCw className="h-3 w-3 inline mr-1" />
            Rotate Right
          </button>
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

