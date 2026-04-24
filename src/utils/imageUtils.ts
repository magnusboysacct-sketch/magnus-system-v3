import type { ImageCaptureResult, CropArea } from '../types/imageCapture';

export function createImagePreview(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve(reader.result as string);
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

// Performance-optimized preprocessing with FAST/DEEP modes
export interface ProcessingOptions {
  mode: 'fast' | 'deep';
  maxDimension?: number;
  onProgress?: (stage: string) => void;
  timeoutMs?: number;
}

export interface ProcessingResult {
  file: File;
  mode: string;
  timings: {
    [stage: string]: number;
  };
  dimensions: {
    width: number;
    height: number;
  };
  aborted?: boolean;
}

// Fast mode preprocessing (2-5 seconds)
export function createFastProcessedImage(file: File, options: ProcessingOptions = { mode: 'fast' }): Promise<ProcessingResult> {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    const timings: { [stage: string]: number } = {};
    
    options.onProgress?.('Preparing image...');
    
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      reject(new Error('Could not get canvas context'));
      return;
    }

    const img = new Image();
    img.onload = () => {
      try {
        console.log('=== FAST MODE PREPROCESSING START ===');
        console.log('INPUT_IMAGE:', {
          width: img.width,
          height: img.height,
          size: file.size,
          name: file.name,
          aspectRatio: (img.width / img.height).toFixed(2)
        });

        // Step 1: Resize image to max dimension
        const resizeStart = Date.now();
        const maxDim = options.maxDimension || 2200;
        const { canvas: resizedCanvas, scale } = resizeImage(img, maxDim);
        timings.resize = Date.now() - resizeStart;
        console.log('RESIZE_COMPLETE:', {
          originalSize: { width: img.width, height: img.height },
          resizedSize: { width: resizedCanvas.width, height: resizedCanvas.height },
          scale: scale.toFixed(2),
          timing: timings.resize + 'ms'
        });

        options.onProgress?.('Running OCR...');

        // Step 2: Fast grayscale conversion
        const grayscaleStart = Date.now();
        const grayscaleCanvas = applyFastGrayscale(resizedCanvas);
        timings.grayscale = Date.now() - grayscaleStart;
        console.log('GRAYSCALE_COMPLETE:', { timing: timings.grayscale + 'ms' });

        // Step 3: Fast contrast boost
        const contrastStart = Date.now();
        const contrastCanvas = applyFastContrastBoost(grayscaleCanvas);
        timings.contrast = Date.now() - contrastStart;
        console.log('CONTRAST_COMPLETE:', { timing: timings.contrast + 'ms' });

        // Step 4: Convert to file
        const fileStart = Date.now();
        contrastCanvas.toBlob((blob) => {
          timings.file = Date.now() - fileStart;
          
          if (blob) {
            const processedFile = new File([blob], `fast_${file.name}`, {
              type: 'image/jpeg',
              lastModified: Date.now()
            });
            
            const totalTime = Date.now() - startTime;
            console.log('FAST_MODE_COMPLETE:', {
              mode: 'fast',
              totalTime: totalTime + 'ms',
              timings,
              finalDimensions: { width: contrastCanvas.width, height: contrastCanvas.height },
              fileSize: processedFile.size
            });
            
            resolve({
              file: processedFile,
              mode: 'fast',
              timings,
              dimensions: { width: contrastCanvas.width, height: contrastCanvas.height }
            });
          } else {
            reject(new Error('Failed to create processed image'));
          }
        }, 'image/jpeg', 0.85); // Slightly lower quality for speed

      } catch (error) {
        console.error('FAST_MODE_ERROR:', error);
        reject(error);
      }
    };

    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = URL.createObjectURL(file);
  });
}

// Deep mode preprocessing (fallback for difficult receipts)
export function createDeepProcessedImage(file: File, options: ProcessingOptions = { mode: 'deep' }): Promise<ProcessingResult> {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    const timings: { [stage: string]: number } = {};
    let aborted = false;
    
    // Timeout protection
    const timeoutMs = options.timeoutMs || 12000;
    const timeout = setTimeout(() => {
      aborted = true;
      console.warn('DEEP_MODE_TIMEOUT: Processing aborted after', timeoutMs + 'ms');
      resolve({
        file: file, // Return original file
        mode: 'deep',
        timings: { timeout: timeoutMs },
        dimensions: { width: 0, height: 0 },
        aborted: true
      });
    }, timeoutMs);

    options.onProgress?.('Improving difficult receipt...');
    
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      clearTimeout(timeout);
      reject(new Error('Could not get canvas context'));
      return;
    }

    const img = new Image();
    img.onload = () => {
      if (aborted) {
        clearTimeout(timeout);
        return;
      }
      
      try {
        console.log('=== DEEP MODE PREPROCESSING START ===');
        console.log('INPUT_IMAGE:', {
          width: img.width,
          height: img.height,
          size: file.size,
          name: file.name
        });

        // Step 1: Enhanced document detection (chunked)
        const detectStart = Date.now();
        const documentDetection = detectDocumentRegionChunked(img, ctx);
        timings.detection = Date.now() - detectStart;
        if (aborted) { clearTimeout(timeout); return; }
        console.log('DOCUMENT_DETECTION:', {
          documentDetected: documentDetection.documentDetected,
          confidence: documentDetection.confidence.toFixed(3),
          timing: timings.detection + 'ms'
        });

        // Step 2: Auto-crop
        const cropStart = Date.now();
        const croppedCanvas = cropToDocumentEdges(img, ctx, documentDetection);
        timings.crop = Date.now() - cropStart;
        if (aborted) { clearTimeout(timeout); return; }
        console.log('AUTOCROP_COMPLETE:', { timing: timings.crop + 'ms' });

        // Step 3: Fast deskew (simplified Hough)
        const deskewStart = Date.now();
        const deskewedCanvas = applyFastDeskew(croppedCanvas);
        timings.deskew = Date.now() - deskewStart;
        if (aborted) { clearTimeout(timeout); return; }
        console.log('DESKEW_COMPLETE:', { timing: timings.deskew + 'ms' });

        // Step 4: Simplified denoising
        const denoiseStart = Date.now();
        const denoisedCanvas = applyFastDenoise(deskewedCanvas);
        timings.denoise = Date.now() - denoiseStart;
        if (aborted) { clearTimeout(timeout); return; }
        console.log('DENOISE_COMPLETE:', { timing: timings.denoise + 'ms' });

        options.onProgress?.('Finalizing...');

        // Step 5: Convert to file
        const fileStart = Date.now();
        denoisedCanvas.toBlob((blob) => {
          clearTimeout(timeout);
          timings.file = Date.now() - fileStart;
          
          if (blob && !aborted) {
            const processedFile = new File([blob], `deep_${file.name}`, {
              type: 'image/jpeg',
              lastModified: Date.now()
            });
            
            const totalTime = Date.now() - startTime;
            console.log('DEEP_MODE_COMPLETE:', {
              mode: 'deep',
              totalTime: totalTime + 'ms',
              timings,
              finalDimensions: { width: denoisedCanvas.width, height: denoisedCanvas.height },
              fileSize: processedFile.size
            });
            
            resolve({
              file: processedFile,
              mode: 'deep',
              timings,
              dimensions: { width: denoisedCanvas.width, height: denoisedCanvas.height }
            });
          } else {
            reject(new Error('Failed to create processed image'));
          }
        }, 'image/jpeg', 0.90);

      } catch (error) {
        clearTimeout(timeout);
        console.error('DEEP_MODE_ERROR:', error);
        reject(error);
      }
    };

    img.onerror = () => {
      clearTimeout(timeout);
      reject(new Error('Failed to load image'));
    };
    img.src = URL.createObjectURL(file);
  });
}

// Main entry point with automatic mode selection
export function createOptimizedImage(file: File, options: ProcessingOptions = { mode: 'fast' }): Promise<ProcessingResult> {
  if (options.mode === 'deep') {
    return createDeepProcessedImage(file, options);
  } else {
    return createFastProcessedImage(file, options);
  }
}

// Fast image resizing
function resizeImage(img: HTMLImageElement, maxDimension: number): { canvas: HTMLCanvasElement; scale: number } {
  const scale = Math.min(1, maxDimension / Math.max(img.width, img.height));
  const width = Math.round(img.width * scale);
  const height = Math.round(img.height * scale);
  
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return { canvas: document.createElement('canvas'), scale: 1 };
  
  canvas.width = width;
  canvas.height = height;
  
  // Use high-quality downsampling
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, width, height);
  
  return { canvas, scale };
}

// Fast grayscale conversion
function applyFastGrayscale(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  
  // Single pass grayscale conversion
  for (let i = 0; i < data.length; i += 4) {
    const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
    data[i] = gray;
    data[i + 1] = gray;
    data[i + 2] = gray;
  }
  
  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

// Fast contrast boost
function applyFastContrastBoost(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  
  // Global contrast enhancement (faster than local)
  const contrast = 1.3;
  const brightness = 10;
  const factor = (259 * (contrast + 255)) / (255 * (259 - contrast));
  
  for (let i = 0; i < data.length; i += 4) {
    data[i] = Math.min(255, Math.max(0, factor * (data[i] - 128) + 128 + brightness));
    data[i + 1] = Math.min(255, Math.max(0, factor * (data[i + 1] - 128) + 128 + brightness));
    data[i + 2] = Math.min(255, Math.max(0, factor * (data[i + 2] - 128) + 128 + brightness));
  }
  
  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

// Chunked document detection (reduced sampling)
function detectDocumentRegionChunked(img: HTMLImageElement, ctx: CanvasRenderingContext2D): {
  documentDetected: boolean;
  marginsRemoved: boolean;
  bounds: { x: number; y: number; width: number; height: number };
  confidence: number;
} {
  // Sample every 10th pixel for performance
  const sampleRate = 10;
  const tempCanvas = document.createElement('canvas');
  const tempCtx = tempCanvas.getContext('2d');
  if (!tempCtx) {
    return { documentDetected: false, marginsRemoved: false, bounds: { x: 0, y: 0, width: img.width, height: img.height }, confidence: 0 };
  }

  tempCanvas.width = Math.ceil(img.width / sampleRate);
  tempCanvas.height = Math.ceil(img.height / sampleRate);
  tempCtx.drawImage(img, 0, 0, tempCanvas.width, tempCanvas.height);

  const imageData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
  const data = imageData.data;

  // Simple brightness-based detection (faster than Sobel)
  const threshold = 200;
  let minX = tempCanvas.width, minY = tempCanvas.height, maxX = 0, maxY = 0;
  
  for (let y = 0; y < tempCanvas.height; y++) {
    for (let x = 0; x < tempCanvas.width; x++) {
      const idx = (y * tempCanvas.width + x) * 4;
      const brightness = data[idx] * 0.299 + data[idx + 1] * 0.587 + data[idx + 2] * 0.114;
      
      if (brightness > threshold) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }
  
  // Scale back to original dimensions
  const bounds = {
    x: minX * sampleRate,
    y: minY * sampleRate,
    width: (maxX - minX) * sampleRate,
    height: (maxY - minY) * sampleRate
  };
  
  const confidence = bounds.width * bounds.height / (img.width * img.height);
  const documentDetected = confidence > 0.3;
  const marginsRemoved = documentDetected && (bounds.x > 10 || bounds.y > 10);

  return {
    documentDetected,
    marginsRemoved,
    bounds,
    confidence
  };
}

// Fast deskew (simplified)
function applyFastDeskew(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  // Simple skew detection using edge sampling
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  
  // Sample edges every 20 pixels for performance
  const sampleRate = 20;
  let angleSum = 0;
  let angleCount = 0;
  
  for (let y = sampleRate; y < canvas.height - sampleRate; y += sampleRate) {
    for (let x = sampleRate; x < canvas.width - sampleRate; x += sampleRate) {
      const idx = (y * canvas.width + x) * 4;
      const brightness = data[idx] * 0.299 + data[idx + 1] * 0.587 + data[idx + 2] * 0.114;
      
      if (brightness < 100) { // Dark pixel (potential text)
        // Check neighboring pixels for angle estimation
        const rightIdx = (y * canvas.width + x + 5) * 4;
        const downIdx = ((y + 5) * canvas.width + x) * 4;
        
        if (rightIdx < data.length && downIdx < data.length) {
          const rightBrightness = data[rightIdx] * 0.299 + data[rightIdx + 1] * 0.587 + data[rightIdx + 2] * 0.114;
          const downBrightness = data[downIdx] * 0.299 + data[downIdx + 1] * 0.587 + data[downIdx + 2] * 0.114;
          
          // Simple angle estimation
          if (rightBrightness < 100 && downBrightness >= 100) {
            angleSum += Math.atan2(5, 5) * 180 / Math.PI;
            angleCount++;
          }
        }
      }
    }
  }
  
  const avgAngle = angleCount > 0 ? angleSum / angleCount : 0;
  
  // Only rotate if angle is significant
  if (Math.abs(avgAngle) < 1) {
    return canvas;
  }
  
  const rotatedCanvas = document.createElement('canvas');
  const rotatedCtx = rotatedCanvas.getContext('2d');
  if (!rotatedCtx) return canvas;

  const angleRad = avgAngle * Math.PI / 180;
  rotatedCanvas.width = canvas.width;
  rotatedCanvas.height = canvas.height;
  
  rotatedCtx.translate(rotatedCanvas.width / 2, rotatedCanvas.height / 2);
  rotatedCtx.rotate(-angleRad);
  rotatedCtx.drawImage(canvas, -canvas.width / 2, -canvas.height / 2);
  
  return rotatedCanvas;
}

// Fast denoising (simplified bilateral)
function applyFastDenoise(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  const tempData = new Uint8ClampedArray(data);
  
  // Simple 3x3 median filter (faster than bilateral)
  for (let y = 1; y < canvas.height - 1; y++) {
    for (let x = 1; x < canvas.width - 1; x++) {
      const centerIdx = (y * canvas.width + x) * 4;
      
      // Collect neighboring values
      const neighbors: number[] = [];
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const neighborIdx = ((y + dy) * canvas.width + (x + dx)) * 4;
          neighbors.push(tempData[neighborIdx]);
        }
      }
      
      // Apply median filter
      neighbors.sort((a, b) => a - b);
      const median = neighbors[Math.floor(neighbors.length / 2)];
      
      data[centerIdx] = median;
      data[centerIdx + 1] = median;
      data[centerIdx + 2] = median;
    }
  }
  
  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

// Crop to detected document edges (simplified for performance)
function cropToDocumentEdges(img: HTMLImageElement, ctx: CanvasRenderingContext2D, detection: {
  documentDetected: boolean;
  marginsRemoved: boolean;
  bounds: { x: number; y: number; width: number; height: number };
  confidence: number;
}): HTMLCanvasElement {
  if (!detection.documentDetected || !detection.marginsRemoved) {
    // No cropping needed, return original
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const cropCtx = canvas.getContext('2d');
    if (cropCtx) {
      cropCtx.drawImage(img, 0, 0);
    }
    return canvas;
  }

  const { x, y, width, height } = detection.bounds;
  const canvas = document.createElement('canvas');
  const cropCtx = canvas.getContext('2d');
  
  if (!cropCtx) {
    // Fallback to original
    const fallbackCanvas = document.createElement('canvas');
    fallbackCanvas.width = img.width;
    fallbackCanvas.height = img.height;
    const fallbackCtx = fallbackCanvas.getContext('2d');
    if (fallbackCtx) {
      fallbackCtx.drawImage(img, 0, 0);
    }
    return fallbackCanvas;
  }
  
  canvas.width = width;
  canvas.height = height;
  
  cropCtx.drawImage(img, x, y, width, height, 0, 0, width, height);
  return canvas;
}

// Sobel edge detection
function detectEdges(grayData: Uint8ClampedArray, width: number, height: number): Uint8ClampedArray {
  const edges = new Uint8ClampedArray(width * height);
  
  // Sobel kernels
  const sobelX = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
  const sobelY = [-1, -2, -1, 0, 0, 0, 1, 2, 1];
  
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      let pixelX = 0;
      let pixelY = 0;
      
      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          const idx = ((y + ky) * width + (x + kx));
          const kernelIdx = (ky + 1) * 3 + (kx + 1);
          pixelX += grayData[idx] * sobelX[kernelIdx];
          pixelY += grayData[idx] * sobelY[kernelIdx];
        }
      }
      
      const magnitude = Math.sqrt(pixelX * pixelX + pixelY * pixelY);
      edges[y * width + x] = Math.min(255, magnitude);
    }
  }
  
  return edges;
}

// Find document boundaries from edge map
function findDocumentBounds(edges: Uint8ClampedArray, width: number, height: number): {
  x: number; y: number; width: number; height: number;
} {
  const threshold = 50; // Edge magnitude threshold
  let minX = width, minY = height, maxX = 0, maxY = 0;
  
  // Scan for significant edges
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (edges[idx] > threshold) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }
  
  // Add small padding
  const padding = 5;
  minX = Math.max(0, minX - padding);
  minY = Math.max(0, minY - padding);
  maxX = Math.min(width, maxX + padding);
  maxY = Math.min(height, maxY + padding);
  
  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY
  };
}

// Calculate document detection confidence
function calculateDocumentConfidence(edges: Uint8ClampedArray, bounds: {
  x: number; y: number; width: number; height: number;
}, width: number, height: number): number {
  // Check for rectangular edge pattern
  let edgeScore = 0;
  let totalEdgePoints = 0;
  
  // Sample edges along boundaries
  for (let i = 0; i < bounds.width; i += 10) {
    const topIdx = bounds.y * width + bounds.x + i;
    const bottomIdx = (bounds.y + bounds.height) * width + bounds.x + i;
    if (topIdx < edges.length && bottomIdx < edges.length) {
      edgeScore += edges[topIdx] + edges[bottomIdx];
      totalEdgePoints += 2;
    }
  }
  
  for (let i = 0; i < bounds.height; i += 10) {
    const leftIdx = (bounds.y + i) * width + bounds.x;
    const rightIdx = (bounds.y + i) * width + bounds.x + bounds.width;
    if (leftIdx < edges.length && rightIdx < edges.length) {
      edgeScore += edges[leftIdx] + edges[rightIdx];
      totalEdgePoints += 2;
    }
  }
  
  const avgEdgeStrength = totalEdgePoints > 0 ? edgeScore / totalEdgePoints : 0;
  const areaRatio = (bounds.width * bounds.height) / (width * height);
  
  // Combine factors for confidence
  const confidence = (avgEdgeStrength / 255) * 0.6 + areaRatio * 0.4;
  return Math.min(1.0, confidence);
}

// Calculate skew angle using edge analysis
function calculateSkewAngle(canvas: HTMLCanvasElement): number {
  const ctx = canvas.getContext('2d');
  if (!ctx) return 0;

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  
  // Convert to grayscale
  const grayData = new Uint8ClampedArray(canvas.width * canvas.height);
  for (let i = 0; i < data.length; i += 4) {
    grayData[i / 4] = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
  }
  
  // Detect edges
  const edges = detectEdges(grayData, canvas.width, canvas.height);
  
  // Use Hough transform approximation for skew detection
  const angle = detectSkewWithHough(edges, canvas.width, canvas.height);
  
  // Limit to reasonable range
  return Math.max(-15, Math.min(15, angle));
}

// Hough transform for skew detection
function detectSkewWithHough(edges: Uint8ClampedArray, width: number, height: number): number {
  const angleStep = 0.5; // degrees
  const maxAngle = 15;
  const accumulator: { [key: string]: number } = {};
  
  // Sample edge points
  const edgePoints: { x: number; y: number }[] = [];
  for (let y = 0; y < height; y += 5) {
    for (let x = 0; x < width; x += 5) {
      const idx = y * width + x;
      if (edges[idx] > 50) {
        edgePoints.push({ x, y });
      }
    }
  }
  
  // Vote for angles
  for (const point of edgePoints) {
    for (let angle = -maxAngle; angle <= maxAngle; angle += angleStep) {
      const angleRad = angle * Math.PI / 180;
      const rho = point.x * Math.cos(angleRad) + point.y * Math.sin(angleRad);
      const key = `${angle.toFixed(1)}_${Math.round(rho)}`;
      accumulator[key] = (accumulator[key] || 0) + 1;
    }
  }
  
  // Find dominant angle
  let maxVotes = 0;
  let dominantAngle = 0;
  
  for (const [key, votes] of Object.entries(accumulator)) {
    if (votes > maxVotes) {
      maxVotes = votes;
      dominantAngle = parseFloat(key.split('_')[0]);
    }
  }
  
  return dominantAngle;
}

// Perspective correction for tilted receipts
function correctPerspective(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const angle = calculateSkewAngle(canvas);
  
  // If angle is very small, no correction needed
  if (Math.abs(angle) < 0.5) {
    return canvas;
  }

  const correctedCanvas = document.createElement('canvas');
  const correctedCtx = correctedCanvas.getContext('2d');
  if (!correctedCtx) return canvas;

  // Calculate new dimensions for rotated image
  const angleRad = angle * (Math.PI / 180);
  const sin = Math.abs(Math.sin(angleRad));
  const cos = Math.abs(Math.cos(angleRad));
  
  correctedCanvas.width = canvas.width * cos + canvas.height * sin;
  correctedCanvas.height = canvas.width * sin + canvas.height * cos;

  // Apply rotation
  correctedCtx.translate(correctedCanvas.width / 2, correctedCanvas.height / 2);
  correctedCtx.rotate(-angleRad);
  correctedCtx.drawImage(canvas, -canvas.width / 2, -canvas.height / 2);

  return correctedCanvas;
}

// Adaptive local contrast enhancement
function applyAdaptiveLocalContrast(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  
  // Convert to grayscale
  const grayData = new Uint8ClampedArray(canvas.width * canvas.height);
  for (let i = 0; i < data.length; i += 4) {
    grayData[i / 4] = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
  }
  
  // Apply adaptive local contrast using CLAHE-like approach
  const windowSize = 50; // Local window size
  const clipLimit = 3.0; // Contrast enhancement limit
  
  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      const idx = y * canvas.width + x;
      const centerGray = grayData[idx];
      
      // Calculate local statistics
      let localMin = 255, localMax = 0, localSum = 0, localCount = 0;
      
      for (let wy = -windowSize; wy <= windowSize; wy++) {
        for (let wx = -windowSize; wx <= windowSize; wx++) {
          const ny = y + wy;
          const nx = x + wx;
          
          if (ny >= 0 && ny < canvas.height && nx >= 0 && nx < canvas.width) {
            const neighborIdx = ny * canvas.width + nx;
            const neighborGray = grayData[neighborIdx];
            localMin = Math.min(localMin, neighborGray);
            localMax = Math.max(localMax, neighborGray);
            localSum += neighborGray;
            localCount++;
          }
        }
      }
      
      const localMean = localSum / localCount;
      const localRange = localMax - localMin;
      
      // Apply adaptive contrast
      if (localRange > 10) { // Only enhance if there's meaningful contrast
        let enhanced = ((centerGray - localMean) / localRange) * 255 * clipLimit;
        enhanced = Math.min(255, Math.max(0, enhanced + 128)); // Center around 128
        
        const dataIdx = idx * 4;
        data[dataIdx] = enhanced;
        data[dataIdx + 1] = enhanced;
        data[dataIdx + 2] = enhanced;
      }
    }
  }
  
  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

// Paper whitening and text darkening
function whitenPaperAndDarkenText(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  
  // Analyze brightness distribution
  let paperBrightness = 0;
  let textBrightness = 255;
  const histogram = new Array(256).fill(0);
  
  for (let i = 0; i < data.length; i += 4) {
    const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
    histogram[Math.round(gray)]++;
  }
  
  // Find paper and text brightness peaks
  let maxCount = 0;
  for (let i = 200; i < 256; i++) { // Paper is typically bright
    if (histogram[i] > maxCount) {
      maxCount = histogram[i];
      paperBrightness = i;
    }
  }
  
  maxCount = 0;
  for (let i = 0; i < 100; i++) { // Text is typically dark
    if (histogram[i] > maxCount) {
      maxCount = histogram[i];
      textBrightness = i;
    }
  }
  
  console.log('BRIGHTNESS_ANALYSIS:', {
    paperBrightness,
    textBrightness,
    contrast: paperBrightness - textBrightness
  });
  
  // Apply whitening and darkening
  const targetPaperBrightness = 245; // Near-white
  const targetTextBrightness = 30; // Very dark
  
  for (let i = 0; i < data.length; i += 4) {
    const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
    
    let normalized;
    if (gray > (paperBrightness + textBrightness) / 2) {
      // Whiten paper areas
      normalized = targetPaperBrightness;
    } else {
      // Darken text areas
      const textRatio = (gray - textBrightness) / (paperBrightness - textBrightness);
      normalized = targetTextBrightness + textRatio * (targetPaperBrightness - targetTextBrightness) * 0.3;
    }
    
    data[i] = normalized;
    data[i + 1] = normalized;
    data[i + 2] = normalized;
  }
  
  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

// Noise reduction and grain removal
function reduceNoiseAndGrain(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  const tempData = new Uint8ClampedArray(data);
  
  // Apply bilateral filter for edge-preserving denoising
  const spatialSigma = 1.5;
  const intensitySigma = 30;
  
  for (let y = 1; y < canvas.height - 1; y++) {
    for (let x = 1; x < canvas.width - 1; x++) {
      const centerIdx = (y * canvas.width + x) * 4;
      const centerGray = tempData[centerIdx];
      
      let weightedSum = 0;
      let totalWeight = 0;
      
      // 3x3 neighborhood
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const neighborIdx = ((y + dy) * canvas.width + (x + dx)) * 4;
          const neighborGray = tempData[neighborIdx];
          
          // Spatial weight
          const spatialDist = Math.sqrt(dx * dx + dy * dy);
          const spatialWeight = Math.exp(-(spatialDist * spatialDist) / (2 * spatialSigma * spatialSigma));
          
          // Intensity weight
          const intensityDist = Math.abs(centerGray - neighborGray);
          const intensityWeight = Math.exp(-(intensityDist * intensityDist) / (2 * intensitySigma * intensitySigma));
          
          const totalWeighted = spatialWeight * intensityWeight;
          weightedSum += neighborGray * totalWeighted;
          totalWeight += totalWeighted;
        }
      }
      
      const denoised = totalWeight > 0 ? weightedSum / totalWeight : centerGray;
      
      data[centerIdx] = denoised;
      data[centerIdx + 1] = denoised;
      data[centerIdx + 2] = denoised;
    }
  }
  
  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

// Upscale to scanner resolution
function upscaleToScannerResolution(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  // Target 300 DPI equivalent (assuming input is ~72 DPI)
  const scaleFactor = 4.2; // 300/72 ≈ 4.2
  
  const upscaledCanvas = document.createElement('canvas');
  const upscaledCtx = upscaledCanvas.getContext('2d');
  if (!upscaledCtx) return canvas;

  upscaledCanvas.width = Math.round(canvas.width * scaleFactor);
  upscaledCanvas.height = Math.round(canvas.height * scaleFactor);

  // Use high-quality scaling
  upscaledCtx.imageSmoothingEnabled = true;
  upscaledCtx.imageSmoothingQuality = 'high';
  upscaledCtx.drawImage(canvas, 0, 0, upscaledCanvas.width, upscaledCanvas.height);

  return upscaledCanvas;
}

// Detect paper edges in the image
function detectPaperEdges(img: HTMLImageElement, ctx: CanvasRenderingContext2D): {
  paperDetected: boolean;
  bounds: { x: number; y: number; width: number; height: number };
  confidence: number;
} {
  // Create a temporary canvas for edge detection
  const tempCanvas = document.createElement('canvas');
  const tempCtx = tempCanvas.getContext('2d');
  if (!tempCtx) {
    return { paperDetected: false, bounds: { x: 0, y: 0, width: img.width, height: img.height }, confidence: 0 };
  }

  tempCanvas.width = img.width;
  tempCanvas.height = img.height;
  tempCtx.drawImage(img, 0, 0);

  // Get image data for analysis
  const imageData = tempCtx.getImageData(0, 0, img.width, img.height);
  const data = imageData.data;

  // Convert to grayscale for edge detection
  const grayData = new Uint8ClampedArray(img.width * img.height);
  for (let i = 0; i < data.length; i += 4) {
    const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
    grayData[i / 4] = gray;
  }

  // Simple edge detection using brightness threshold
  const threshold = 200; // Paper is typically bright
  let minX = img.width, minY = img.height, maxX = 0, maxY = 0;
  let edgePoints = 0;

  // Scan from edges inward to find paper boundaries
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      const idx = y * img.width + x;
      const brightness = grayData[idx];
      
      // Consider bright areas as potential paper
      if (brightness > threshold) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
        edgePoints++;
      }
    }
  }

  // Calculate confidence based on edge point density
  const totalPoints = img.width * img.height;
  const confidence = edgePoints / totalPoints;
  const paperDetected = confidence > 0.3 && edgePoints > 1000;

  // Add padding around detected edges
  const padding = Math.max(10, Math.min(img.width, img.height) * 0.02);
  minX = Math.max(0, minX - padding);
  minY = Math.max(0, minY - padding);
  maxX = Math.min(img.width, maxX + padding);
  maxY = Math.min(img.height, maxY + padding);

  return {
    paperDetected,
    bounds: {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY
    },
    confidence
  };
}

// Crop image to detected paper edges
function cropToPaperEdges(img: HTMLImageElement, ctx: CanvasRenderingContext2D, detection: {
  paperDetected: boolean;
  bounds: { x: number; y: number; width: number; height: number };
}): HTMLCanvasElement {
  const croppedCanvas = document.createElement('canvas');
  const croppedCtx = croppedCanvas.getContext('2d');
  if (!croppedCtx) {
    // Fallback to full image
    const fallbackCanvas = document.createElement('canvas');
    const fallbackCtx = fallbackCanvas.getContext('2d');
    if (fallbackCtx) {
      fallbackCanvas.width = img.width;
      fallbackCanvas.height = img.height;
      fallbackCtx.drawImage(img, 0, 0);
    }
    return fallbackCanvas || croppedCanvas;
  }

  // Use detected bounds or full image as fallback
  const bounds = detection.paperDetected ? detection.bounds : { x: 0, y: 0, width: img.width, height: img.height };
  
  croppedCanvas.width = bounds.width;
  croppedCanvas.height = bounds.height;
  croppedCtx.drawImage(img, bounds.x, bounds.y, bounds.width, bounds.height, 0, 0, bounds.width, bounds.height);

  return croppedCanvas;
}

// Calculate deskew angle
function calculateDeskewAngle(canvas: HTMLCanvasElement): number {
  const ctx = canvas.getContext('2d');
  if (!ctx) return 0;

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;

  // Simple Hough transform approximation for skew detection
  // Look for dominant angles in edge points
  const edgePoints: { x: number; y: number }[] = [];
  const threshold = 128;

  // Sample edge points (every 10th pixel for performance)
  for (let y = 0; y < canvas.height; y += 10) {
    for (let x = 0; x < canvas.width; x += 10) {
      const idx = (y * canvas.width + x) * 4;
      const brightness = data[idx] * 0.299 + data[idx + 1] * 0.587 + data[idx + 2] * 0.114;
      
      if (brightness < threshold) {
        edgePoints.push({ x, y });
      }
    }
  }

  // Calculate approximate skew angle from edge points
  if (edgePoints.length < 10) return 0;

  // Simple linear regression to find dominant angle
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  edgePoints.forEach(point => {
    sumX += point.x;
    sumY += point.y;
    sumXY += point.x * point.y;
    sumX2 += point.x * point.x;
  });

  const n = edgePoints.length;
  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const angle = Math.atan(slope) * (180 / Math.PI);

  // Limit angle to reasonable range (-15 to 15 degrees)
  return Math.max(-15, Math.min(15, angle));
}

// Deskew/straighten image
function deskewImage(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const angle = calculateDeskewAngle(canvas);
  
  // If angle is very small, no need to deskew
  if (Math.abs(angle) < 0.5) {
    return canvas;
  }

  const deskewedCanvas = document.createElement('canvas');
  const deskewedCtx = deskewedCanvas.getContext('2d');
  if (!deskewedCtx) return canvas;

  // Calculate new dimensions for rotated image
  const angleRad = angle * (Math.PI / 180);
  const sin = Math.abs(Math.sin(angleRad));
  const cos = Math.abs(Math.cos(angleRad));
  
  deskewedCanvas.width = canvas.width * cos + canvas.height * sin;
  deskewedCanvas.height = canvas.width * sin + canvas.height * cos;

  // Rotate the image
  deskewedCtx.translate(deskewedCanvas.width / 2, deskewedCanvas.height / 2);
  deskewedCtx.rotate(-angleRad);
  deskewedCtx.drawImage(canvas, -canvas.width / 2, -canvas.height / 2);

  return deskewedCanvas;
}

// Normalize lighting and denoise
function normalizeLightingAndDenoise(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;

  // Calculate current brightness statistics
  let totalBrightness = 0;
  let minBrightness = 255;
  let maxBrightness = 0;
  
  for (let i = 0; i < data.length; i += 4) {
    const brightness = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
    totalBrightness += brightness;
    minBrightness = Math.min(minBrightness, brightness);
    maxBrightness = Math.max(maxBrightness, brightness);
  }
  
  const avgBrightness = totalBrightness / (data.length / 4);
  const dynamicRange = maxBrightness - minBrightness;

  console.log('LIGHTING_ANALYSIS:', {
    avgBrightness: Math.round(avgBrightness),
    minBrightness,
    maxBrightness,
    dynamicRange
  });

  // Apply adaptive normalization
  const targetPaperBrightness = 240; // Near-white paper
  const targetTextDarkness = 60; // Dark text
  const brightnessAdjustment = targetPaperBrightness / avgBrightness;
  const contrastFactor = 200 / dynamicRange; // Normalize contrast

  // Denoise and normalize
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    
    // Convert to grayscale
    const gray = r * 0.299 + g * 0.587 + b * 0.114;
    
    // Apply brightness normalization
    let normalized = (gray - avgBrightness) * contrastFactor + targetPaperBrightness;
    
    // Apply denoising (simple median filter approximation)
    if (i > canvas.width * 4 && i < data.length - canvas.width * 4) {
      const neighbors = [
        data[i - canvas.width * 4],     // top
        data[i + 4],                     // right
        data[i + canvas.width * 4],     // bottom
        data[i - 4]                      // left
      ];
      const median = neighbors.sort((a, b) => a - b)[1];
      normalized = normalized * 0.7 + median * 0.3; // Blend with median
    }
    
    // Clamp values
    normalized = Math.max(0, Math.min(255, normalized));
    
    // Set grayscale values
    data[i] = normalized;
    data[i + 1] = normalized;
    data[i + 2] = normalized;
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

// Upscale cleaned image for OCR
function upscaleForOCR(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  // Determine target size based on orientation
  const aspectRatio = canvas.width / canvas.height;
  let targetWidth: number, targetHeight: number;
  
  if (aspectRatio > 1.5) {
    // Wide receipt
    targetWidth = 3000;
    targetHeight = Math.round(targetWidth / aspectRatio);
  } else if (aspectRatio < 0.7) {
    // Tall receipt
    targetHeight = 3000;
    targetWidth = Math.round(targetHeight * aspectRatio);
  } else {
    // Square receipt
    targetWidth = 2500;
    targetHeight = 2500;
  }

  const upscaledCanvas = document.createElement('canvas');
  const upscaledCtx = upscaledCanvas.getContext('2d');
  if (!upscaledCtx) return canvas;

  upscaledCanvas.width = targetWidth;
  upscaledCanvas.height = targetHeight;

  // Use high-quality scaling for OCR
  upscaledCtx.imageSmoothingEnabled = true;
  upscaledCtx.imageSmoothingQuality = 'high';
  upscaledCtx.drawImage(canvas, 0, 0, targetWidth, targetHeight);

  return upscaledCanvas;
}

export function cropImage(
  imageSrc: string,
  crop: CropArea,
  outputWidth: number,
  outputHeight: number,
  quality: number = 0.9
): Promise<{ file: File; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        if (!ctx) {
          reject(new Error('Could not get canvas context'));
          return;
        }

        // Set canvas dimensions
        canvas.width = outputWidth;
        canvas.height = outputHeight;

        // Calculate source dimensions based on crop percentages
        const sourceX = (crop.x / 100) * image.naturalWidth;
        const sourceY = (crop.y / 100) * image.naturalHeight;
        const sourceWidth = (crop.width / 100) * image.naturalWidth;
        const sourceHeight = (crop.height / 100) * image.naturalHeight;

        // Draw cropped image
        ctx.drawImage(
          image,
          sourceX,
          sourceY,
          sourceWidth,
          sourceHeight,
          0,
          0,
          outputWidth,
          outputHeight
        );

        // Convert to blob
        canvas.toBlob(
          (blob) => {
            if (blob) {
              const file = new File([blob], `cropped_${Date.now()}.jpg`, {
                type: 'image/jpeg',
                lastModified: Date.now()
              });
              resolve({
                file,
                width: outputWidth,
                height: outputHeight
              });
            } else {
              reject(new Error('Failed to create cropped image'));
            }
          },
          'image/jpeg',
          quality
        );
      } catch (error) {
        reject(error);
      }
    };
    
    image.onerror = () => reject(new Error('Failed to load image'));
    image.src = imageSrc;
  });
}

export function validateImageFile(file: File): { valid: boolean; error?: string } {
  // Check file size (10MB limit)
  if (file.size > 10 * 1024 * 1024) {
    return { valid: false, error: 'File size must be less than 10MB' };
  }

  // Check file type
  const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
  if (!validTypes.includes(file.type)) {
    return { valid: false, error: 'Please upload an image (JPG, PNG, WEBP)' };
  }

  return { valid: true };
}

export function getAspectRatioForMode(mode: import('../types/imageCapture').ImageCaptureMode): number | undefined {
  switch (mode) {
    case "id":
      return 1.6; // Standard ID card ratio (16:10)
    case "worker_photo":
      return 1.0; // Square for worker photos
    case "receipt":
      return 0.7; // Tall receipts (height/width = 1/0.7 = 1.428)
    case "general":
      return undefined; // Free aspect ratio
    default:
      return undefined;
  }
}

export function getInitialCropForMode(mode: import('../types/imageCapture').ImageCaptureMode): CropArea {
  switch (mode) {
    case "receipt":
      return { x: 5, y: 5, width: 90, height: 90 }; // Large area for receipts
    case "id":
      return { x: 10, y: 10, width: 80, height: 50 }; // ID card aspect
    case "worker_photo":
      return { x: 10, y: 10, width: 80, height: 80 }; // Square for photos
    case "general":
    default:
      return { x: 10, y: 10, width: 80, height: 80 }; // Default square
  }
}

export function getInstructionsForMode(mode: import('../types/imageCapture').ImageCaptureMode): string {
  switch (mode) {
    case "receipt":
      return "Drag to crop receipt details";
    case "id":
      return "Position ID card within frame";
    case "worker_photo":
      return "Position worker's face in frame";
    case "general":
      return "Adjust crop area as needed";
    default:
      return "Adjust crop area";
  }
}

export function cleanupObjectUrl(url: string | null): void {
  if (url) {
    URL.revokeObjectURL(url);
  }
}
