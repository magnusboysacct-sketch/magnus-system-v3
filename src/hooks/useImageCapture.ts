import { useState, useCallback, useRef, useEffect } from 'react';
import type { 
  ImageCaptureMode, 
  ImageCaptureState, 
  ImageCaptureResult, 
  CropArea, 
  CropSettings 
} from '../types/imageCapture';
import { 
  createImagePreview, 
  cropImage, 
  validateImageFile, 
  getAspectRatioForMode, 
  getInitialCropForMode, 
  getInstructionsForMode,
  cleanupObjectUrl,
  createOptimizedImage,
  type ProcessingOptions,
  type ProcessingResult
} from '../utils/imageUtils';

interface UseImageCaptureOptions {
  mode: ImageCaptureMode;
  maxSize?: number;
  quality?: number;
  allowPDF?: boolean;
  initialFile?: File | null;
  onImageReady?: (result: ImageCaptureResult) => void;
  onCancel?: () => void;
}

export function useImageCapture({
  mode,
  maxSize = 2000,
  quality = 0.9,
  allowPDF = false,
  initialFile,
  onImageReady,
  onCancel
}: UseImageCaptureOptions) {
  // Add progress state for UI
  const [processingStage, setProcessingStage] = useState<string>('');
  const [processingMode, setProcessingMode] = useState<'fast' | 'deep'>('fast');

  const [state, setState] = useState<ImageCaptureState>({
    step: 'capture',
    selectedImage: null,
    selectedFile: null,
    croppedImage: null,
    ocrResult: null,
    processing: false,
    error: null
  });

  const [cropSettings, setCropSettings] = useState<CropSettings>({
    aspect: getAspectRatioForMode(mode),
    zoom: 1,
    crop: getInitialCropForMode(mode)
  });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Cleanup object URLs on unmount
  useEffect(() => {
    return () => {
      if (state.selectedImage) {
        cleanupObjectUrl(state.selectedImage);
      }
      if (state.croppedImage?.preview) {
        cleanupObjectUrl(state.croppedImage.preview);
      }
    };
  }, [state.selectedImage, state.croppedImage?.preview]);

  // Handle initial file
  useEffect(() => {
    if (initialFile && !state.selectedImage) {
      handleFileSelect({ target: { files: [initialFile] } } as any);
    }
  }, [initialFile]);

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];

    // Validate file
    const validation = validateImageFile(file);
    if (!validation.valid) {
      setState(prev => ({ ...prev, error: validation.error || null }));
      return;
    }

    // Handle PDF files
    if (file.type === 'application/pdf') {
      if (!allowPDF) {
        setState(prev => ({ ...prev, error: 'PDF files are not allowed for this type of image' }));
        return;
      }
      
      setState(prev => ({
        ...prev,
        selectedFile: file,
        step: 'result',
        error: null
      }));
      return;
    }

    // Handle image files
    try {
      setState(prev => ({ ...prev, processing: true, error: null }));
      
      const preview = await createImagePreview(file);
      
      setState(prev => ({
        ...prev,
        selectedImage: preview,
        selectedFile: file,
        step: 'crop',
        processing: false,
        error: null
      }));
    } catch (error) {
      setState(prev => ({
        ...prev,
        processing: false,
        error: 'Failed to load image. Please try again.'
      }));
    }

    // Clear input
    if (e.target === fileInputRef.current && fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [allowPDF]);

  const handleCropComplete = useCallback(async (croppedAreaPixels: CropArea) => {
    if (!state.selectedImage || !state.selectedFile) return;

    try {
      setState(prev => ({ ...prev, processing: true, error: null }));

      // Calculate output dimensions
      const sourceWidth = (croppedAreaPixels.width / 100) * (state.selectedFile as any).imageWidth || 1000;
      const sourceHeight = (croppedAreaPixels.height / 100) * (state.selectedFile as any).imageHeight || 1000;
      
      const maxDimension = maxSize;
      const aspectRatio = sourceWidth / sourceHeight;
      
      let outputWidth: number;
      let outputHeight: number;
      
      if (sourceWidth > sourceHeight) {
        outputWidth = Math.min(sourceWidth, maxDimension);
        outputHeight = outputWidth / aspectRatio;
      } else {
        outputHeight = Math.min(sourceHeight, maxDimension);
        outputWidth = outputHeight * aspectRatio;
      }

      // Crop the image
      const { file: croppedFile, width, height } = await cropImage(
        state.selectedImage,
        croppedAreaPixels,
        Math.round(outputWidth),
        Math.round(outputHeight),
        quality
      );

      // Create preview
      const preview = await createImagePreview(croppedFile);

      // Create optimized OCR copy with progress tracking
      setProcessingStage('Preparing image...');
      setProcessingMode('fast');
      
      const options: ProcessingOptions = {
        mode: 'fast',
        maxDimension: 2200,
        onProgress: (stage: string) => setProcessingStage(stage),
        timeoutMs: 12000
      };

      const processingResult: ProcessingResult = await createOptimizedImage(croppedFile, options);
      
      // If fast mode failed confidence, try deep mode
      if (processingResult.aborted || (processingResult.timings?.resize || 0) > 3000) {
        console.log('FAST_MODE_POOR_QUALITY: Switching to deep mode');
        setProcessingStage('Improving difficult receipt...');
        setProcessingMode('deep');
        
        const deepOptions: ProcessingOptions = {
          mode: 'deep',
          maxDimension: 2800,
          onProgress: (stage: string) => setProcessingStage(stage),
          timeoutMs: 12000
        };
        
        const deepResult = await createOptimizedImage(croppedFile, deepOptions);
        
        // Use deep result if it completed, otherwise fall back to fast result
        const finalResult = deepResult.aborted ? processingResult : deepResult;
        
        console.log('PROCESSING_COMPLETE:', {
          mode: finalResult.mode,
          timings: finalResult.timings,
          dimensions: finalResult.dimensions,
          aborted: finalResult.aborted
        });
        
        const result: ImageCaptureResult = {
          file: croppedFile,
          preview,
          width,
          height,
          size: croppedFile.size,
          ocrFile: finalResult.file
        };
        
        setProcessingStage('');
        
        setState(prev => ({
          ...prev,
          croppedImage: result,
          step: 'result',
          processing: false
        }));
        
        if (onImageReady) {
          onImageReady(result);
        }
      } else {
        // Fast mode succeeded
        console.log('FAST_MODE_SUCCESS:', {
          mode: processingResult.mode,
          timings: processingResult.timings,
          dimensions: processingResult.dimensions
        });
        
        const result: ImageCaptureResult = {
          file: croppedFile,
          preview,
          width,
          height,
          size: croppedFile.size,
          ocrFile: processingResult.file
        };
        
        setProcessingStage('');
        
        setState(prev => ({
          ...prev,
          croppedImage: result,
          step: 'result',
          processing: false
        }));
        
        if (onImageReady) {
          onImageReady(result);
        }
      }
    } catch (error) {
      setState(prev => ({
        ...prev,
        processing: false,
        error: 'Failed to crop image. Please try again.'
      }));
    }
  }, [state.selectedImage, state.selectedFile, maxSize, quality, onImageReady]);

  const handleReset = useCallback(() => {
    // Cleanup URLs
    if (state.selectedImage) {
      cleanupObjectUrl(state.selectedImage);
    }
    if (state.croppedImage?.preview) {
      cleanupObjectUrl(state.croppedImage.preview);
    }

    setState({
      step: 'capture',
      selectedImage: null,
      selectedFile: null,
      croppedImage: null,
      ocrResult: null,
      processing: false,
      error: null
    });

    setCropSettings({
      aspect: getAspectRatioForMode(mode),
      zoom: 1,
      crop: getInitialCropForMode(mode)
    });

    // Clear file inputs
    if (fileInputRef.current) fileInputRef.current.value = '';
    
    if (onCancel) {
      onCancel();
    }
  }, [state.selectedImage, state.croppedImage, mode, onCancel]);

  const handleRetake = useCallback(() => {
    if (state.croppedImage?.preview) {
      cleanupObjectUrl(state.croppedImage.preview);
    }

    setState(prev => ({
      ...prev,
      croppedImage: null,
      step: state.selectedImage ? 'crop' : 'capture',
      error: null
    }));
  }, [state.croppedImage?.preview, state.selectedImage]);

  const handleCameraCapture = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleGallerySelect = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  return {
    // State
    state,
    cropSettings,
    processingStage,
    processingMode,
    
    // Refs
    fileInputRef,
    canvasRef,
    
    // Actions
    handleFileSelect,
    handleCropComplete,
    handleReset,
    handleRetake,
    handleCameraCapture,
    handleGallerySelect,
    
    // Computed
    instructions: getInstructionsForMode(mode),
    aspectRatio: getAspectRatioForMode(mode),
    
    // Setters
    setCropSettings
  };
}
