/**
 * Paper Edge Detection Service
 * 
 * Professional document boundary detection with enhanced algorithms
 * Optimized for receipts, invoices, and business documents
 */

export interface PaperBounds {
  x: number;
  y: number;
  width: number;
  height: number;
  confidence: number;
  detectionMethod: 'brightness' | 'contrast' | 'hybrid';
}

export interface DetectionConfig {
  brightnessThreshold: number;
  contrastThreshold: number;
  minPaperSize: number;
  padding: number;
  maxProcessingTime: number;
}

export class PaperEdgeDetector {
  private static readonly DEFAULT_CONFIG: DetectionConfig = {
    brightnessThreshold: 140,
    contrastThreshold: 30,
    minPaperSize: 0.15, // 15% of smallest dimension
    padding: 8,
    maxProcessingTime: 500
  };

  /**
   * Detect paper boundaries using enhanced edge detection
   */
  static async detectPaperBoundaries(
    imageSrc: string, 
    config: Partial<DetectionConfig> = {}
  ): Promise<PaperBounds | null> {
    const finalConfig = { ...this.DEFAULT_CONFIG, ...config };
    
    return new Promise((resolve) => {
      // Failsafe timeout
      const timeoutId = setTimeout(() => {
        console.log('DOCUMENT_DETECTION_TIMEOUT: Using default crop');
        resolve(null);
      }, finalConfig.maxProcessingTime);

      const img = new Image();
      img.onload = () => {
        try {
          const bounds = this.detectBoundsFromImage(img, finalConfig);
          clearTimeout(timeoutId);
          resolve(bounds);
        } catch (error) {
          clearTimeout(timeoutId);
          console.error('DOCUMENT_DETECTION_ERROR:', error);
          resolve(null);
        }
      };

      img.onerror = () => {
        clearTimeout(timeoutId);
        resolve(null);
      };
      img.src = imageSrc;
    });
  }

  /**
   * Main detection algorithm with multiple methods
   */
  private static detectBoundsFromImage(
    img: HTMLImageElement, 
    config: DetectionConfig
  ): PaperBounds | null {
    // Create optimized canvas for detection
    const scale = Math.min(400 / Math.max(img.width, img.height), 1);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    if (!ctx) return null;

    canvas.width = img.width * scale;
    canvas.height = img.height * scale;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;

    // Try multiple detection methods
    const methods = [
      () => this.detectWithBrightnessAndContrast(data, canvas, config),
      () => this.detectWithAdaptiveThreshold(data, canvas, config),
      () => this.detectWithEdgeTracing(data, canvas, config)
    ];

    for (const method of methods) {
      try {
        const result = method();
        if (result && this.validateBounds(result, canvas, config)) {
          return this.scaleBoundsToOriginal(result, scale, img);
        }
      } catch (error) {
        console.warn('Detection method failed:', error);
        continue;
      }
    }

    return null;
  }

  /**
   * Enhanced brightness and contrast detection
   */
  private static detectWithBrightnessAndContrast(
    data: Uint8ClampedArray, 
    canvas: HTMLCanvasElement, 
    config: DetectionConfig
  ): PaperBounds | null {
    const { width, height } = canvas;
    const brightnessMap: number[][] = [];
    
    // Create brightness map
    for (let y = 0; y < height; y++) {
      brightnessMap[y] = [];
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        const brightness = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
        brightnessMap[y][x] = brightness;
      }
    }

    // Find boundaries using edge detection
    let minX = width, minY = height, maxX = 0, maxY = 0;
    let foundPixels = false;

    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const brightness = brightnessMap[y][x];
        
        if (brightness > config.brightnessThreshold) {
          // Check contrast with neighbors
          const neighbors = [
            brightnessMap[y-1][x], brightnessMap[y+1][x],
            brightnessMap[y][x-1], brightnessMap[y][x+1]
          ];
          
          const avgNeighborBrightness = neighbors.reduce((a, b) => a + b, 0) / 4;
          const contrast = Math.abs(brightness - avgNeighborBrightness);
          
          if (contrast > config.contrastThreshold || brightness > config.brightnessThreshold + 20) {
            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            maxX = Math.max(maxX, x);
            maxY = Math.max(maxY, y);
            foundPixels = true;
          }
        }
      }
    }

    if (!foundPixels) return null;

    return {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY,
      confidence: this.calculateConfidence(minX, minY, maxX - minX, maxY - minY, width, height),
      detectionMethod: 'brightness'
    };
  }

  /**
   * Adaptive threshold detection for varying lighting conditions
   */
  private static detectWithAdaptiveThreshold(
    data: Uint8ClampedArray, 
    canvas: HTMLCanvasElement, 
    config: DetectionConfig
  ): PaperBounds | null {
    const { width, height } = canvas;
    
    // Calculate local threshold for each region
    const regionSize = 50;
    const regions: Array<{x: number, y: number, threshold: number}> = [];
    
    for (let ry = 0; ry < height; ry += regionSize) {
      for (let rx = 0; rx < width; rx += regionSize) {
        const regionBrightness = this.calculateRegionBrightness(data, rx, ry, regionSize, width);
        regions.push({
          x: rx,
          y: ry,
          threshold: regionBrightness * 0.8 // Adaptive threshold
        });
      }
    }

    // Find boundaries using adaptive thresholds
    let minX = width, minY = height, maxX = 0, maxY = 0;
    let foundPixels = false;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        const brightness = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
        
        // Find appropriate region threshold
        const region = regions.find(r => 
          x >= r.x && x < r.x + regionSize && 
          y >= r.y && y < r.y + regionSize
        );
        
        const threshold = region ? region.threshold : config.brightnessThreshold;
        
        if (brightness > threshold) {
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
          foundPixels = true;
        }
      }
    }

    if (!foundPixels) return null;

    return {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY,
      confidence: this.calculateConfidence(minX, minY, maxX - minX, maxY - minY, width, height),
      detectionMethod: 'contrast'
    };
  }

  /**
   * Edge tracing for more precise boundary detection
   */
  private static detectWithEdgeTracing(
    data: Uint8ClampedArray, 
    canvas: HTMLCanvasElement, 
    config: DetectionConfig
  ): PaperBounds | null {
    const { width, height } = canvas;
    
    // Simple edge detection using Sobel-like operator
    const edges: boolean[][] = [];
    for (let y = 1; y < height - 1; y++) {
      edges[y] = [];
      for (let x = 1; x < width - 1; x++) {
        const idx = (y * width + x) * 4;
        const brightness = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
        
        // Calculate gradient
        const topIdx = ((y - 1) * width + x) * 4;
        const bottomIdx = ((y + 1) * width + x) * 4;
        const leftIdx = (y * width + (x - 1)) * 4;
        const rightIdx = (y * width + (x + 1)) * 4;
        
        const topBrightness = (data[topIdx] + data[topIdx + 1] + data[topIdx + 2]) / 3;
        const bottomBrightness = (data[bottomIdx] + data[bottomIdx + 1] + data[bottomIdx + 2]) / 3;
        const leftBrightness = (data[leftIdx] + data[leftIdx + 1] + data[leftIdx + 2]) / 3;
        const rightBrightness = (data[rightIdx] + data[rightIdx + 1] + data[rightIdx + 2]) / 3;
        
        const gradientX = rightBrightness - leftBrightness;
        const gradientY = bottomBrightness - topBrightness;
        const gradientMagnitude = Math.sqrt(gradientX * gradientX + gradientY * gradientY);
        
        edges[y][x] = gradientMagnitude > config.contrastThreshold && brightness > config.brightnessThreshold;
      }
    }

    // Trace edges to find boundaries
    let minX = width, minY = height, maxX = 0, maxY = 0;
    let foundPixels = false;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (edges[y]?.[x]) {
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
          foundPixels = true;
        }
      }
    }

    if (!foundPixels) return null;

    return {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY,
      confidence: this.calculateConfidence(minX, minY, maxX - minX, maxY - minY, width, height),
      detectionMethod: 'hybrid'
    };
  }

  /**
   * Calculate region brightness for adaptive threshold
   */
  private static calculateRegionBrightness(
    data: Uint8ClampedArray, 
    startX: number, 
    startY: number, 
    size: number, 
    width: number
  ): number {
    let totalBrightness = 0;
    let pixelCount = 0;

    for (let y = startY; y < Math.min(startY + size, data.length / (width * 4)); y++) {
      for (let x = startX; x < Math.min(startX + size, width); x++) {
        const idx = (y * width + x) * 4;
        totalBrightness += (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
        pixelCount++;
      }
    }

    return pixelCount > 0 ? totalBrightness / pixelCount : 128;
  }

  /**
   * Calculate detection confidence
   */
  private static calculateConfidence(
    minX: number, 
    minY: number, 
    width: number, 
    height: number, 
    canvasWidth: number, 
    canvasHeight: number
  ): number {
    const areaRatio = (width * height) / (canvasWidth * canvasHeight);
    const centerBias = this.calculateCenterBias(minX, minY, width, height, canvasWidth, canvasHeight);
    const shapeQuality = this.calculateShapeQuality(width, height);
    
    return Math.min(1, (areaRatio * 0.4) + (centerBias * 0.3) + (shapeQuality * 0.3));
  }

  /**
   * Calculate center bias (prefer centered documents)
   */
  private static calculateCenterBias(
    x: number, 
    y: number, 
    width: number, 
    height: number, 
    canvasWidth: number, 
    canvasHeight: number
  ): number {
    const centerX = x + width / 2;
    const centerY = y + height / 2;
    const canvasCenterX = canvasWidth / 2;
    const canvasCenterY = canvasHeight / 2;
    
    const distanceFromCenter = Math.sqrt(
      Math.pow(centerX - canvasCenterX, 2) + Math.pow(centerY - canvasCenterY, 2)
    );
    
    const maxDistance = Math.sqrt(Math.pow(canvasWidth / 2, 2) + Math.pow(canvasHeight / 2, 2));
    return 1 - (distanceFromCenter / maxDistance);
  }

  /**
   * Calculate shape quality (prefer reasonable aspect ratios)
   */
  private static calculateShapeQuality(width: number, height: number): number {
    const aspectRatio = width / height;
    const idealRatios = [0.7, 1.0, 1.4]; // portrait, square, landscape
    
    const closestRatio = idealRatios.reduce((prev, curr) => 
      Math.abs(curr - aspectRatio) < Math.abs(prev - aspectRatio) ? curr : prev
    );
    
    const deviation = Math.abs(aspectRatio - closestRatio) / closestRatio;
    return Math.max(0, 1 - deviation);
  }

  /**
   * Validate detected bounds
   */
  private static validateBounds(
    bounds: PaperBounds, 
    canvas: HTMLCanvasElement, 
    config: DetectionConfig
  ): boolean {
    const { width, height } = canvas;
    const minSize = Math.min(width, height) * config.minPaperSize;
    
    return bounds.width >= minSize && 
           bounds.height >= minSize &&
           bounds.confidence > 0.3 &&
           bounds.x >= 0 && 
           bounds.y >= 0 && 
           bounds.x + bounds.width <= width &&
           bounds.y + bounds.height <= height;
  }

  /**
   * Scale bounds back to original image dimensions
   */
  private static scaleBoundsToOriginal(
    bounds: PaperBounds, 
    scale: number, 
    img: HTMLImageElement
  ): PaperBounds {
    const padding = 8; // Add padding for safety
    return {
      x: Math.max(0, (bounds.x - padding) / scale),
      y: Math.max(0, (bounds.y - padding) / scale),
      width: Math.min(img.width, (bounds.width + padding * 2) / scale),
      height: Math.min(img.height, (bounds.height + padding * 2) / scale),
      confidence: bounds.confidence,
      detectionMethod: bounds.detectionMethod
    };
  }
}
