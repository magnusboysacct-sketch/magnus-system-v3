/**
 * Invoice Image Preprocessor
 * 
 * Enhanced preprocessing specifically for supplier invoices
 * Optimized for multi-column text and detailed line items
 */

export interface PreprocessingOptions {
  grayscale: boolean;
  contrast: number;
  upscale: number;
  sharpen: boolean;
  removeShadows: boolean;
  enhanceText: boolean;
  autoContrast: boolean;
  backgroundCleanup: boolean;
  thresholding: boolean;
}

export interface PreprocessingResult {
  processedImage: string;
  originalImage: string;
  processingSteps: string[];
  quality: {
    sharpness: number;
    contrast: number;
    textClarity: number;
  };
}

export class InvoicePreprocessor {
  private static readonly INVOICE_OPTIONS: PreprocessingOptions = {
    grayscale: true,
    contrast: 1.4,
    upscale: 2,
    sharpen: true,
    removeShadows: true,
    enhanceText: true,
    autoContrast: true,
    backgroundCleanup: true,
    thresholding: false // Only for second pass
  };

  private static readonly STRONG_OPTIONS: PreprocessingOptions = {
    grayscale: true,
    contrast: 1.6,
    upscale: 2,
    sharpen: true,
    removeShadows: true,
    enhanceText: true,
    autoContrast: true,
    backgroundCleanup: true,
    thresholding: true // Strong thresholding for second pass
  };

  /**
   * Preprocess invoice image for optimal OCR
   */
  static async preprocessInvoice(imageSrc: string): Promise<PreprocessingResult> {
    return this.preprocessWithOptions(imageSrc, this.INVOICE_OPTIONS);
  }

  /**
   * Preprocess with strong thresholding for second pass
   */
  static async preprocessStrong(imageSrc: string): Promise<PreprocessingResult> {
    return this.preprocessWithOptions(imageSrc, this.STRONG_OPTIONS);
  }

  /**
   * Core preprocessing method with configurable options
   */
  private static async preprocessWithOptions(imageSrc: string, options: PreprocessingOptions): Promise<PreprocessingResult> {
    console.log('INVOICE_PREPROCESSING: Starting enhanced preprocessing');
    
    const processingSteps: string[] = [];
    const originalImage = imageSrc;
    let processedImage = imageSrc;

    try {
      // Step 1: Grayscale conversion
      if (options.grayscale) {
        processedImage = await this.applyGrayscale(processedImage);
        processingSteps.push('Grayscale conversion');
      }

      // Step 2: Auto contrast stretch for faded text
      if (options.autoContrast) {
        processedImage = await this.applyAutoContrastStretch(processedImage);
        processingSteps.push('Auto contrast stretch');
      }

      // Step 3: Contrast enhancement
      if (options.contrast !== 1) {
        processedImage = await this.applyContrast(processedImage, options.contrast);
        processingSteps.push(`Contrast enhancement (${options.contrast}x)`);
      }

      // Step 4: Background cleanup
      if (options.backgroundCleanup) {
        processedImage = await this.cleanupBackground(processedImage);
        processingSteps.push('Background cleanup');
      }

      // Step 5: Upscaling for better text resolution
      if (options.upscale > 1) {
        processedImage = await this.applyUpscale(processedImage, options.upscale);
        processingSteps.push(`Upscaling (${options.upscale}x)`);
      }

      // Step 6: Sharpening for text clarity
      if (options.sharpen) {
        processedImage = await this.applySharpen(processedImage);
        processingSteps.push('Text sharpening');
      }

      // Step 7: Shadow removal
      if (options.removeShadows) {
        processedImage = await this.removeShadows(processedImage);
        processingSteps.push('Shadow removal');
      }

      // Step 8: Text enhancement
      if (options.enhanceText) {
        processedImage = await this.enhanceText(processedImage);
        processingSteps.push('Text enhancement');
      }

      // Step 9: Thresholding for strong contrast (second pass only)
      if (options.thresholding) {
        processedImage = await this.applyThresholding(processedImage);
        processingSteps.push('Strong thresholding');
      }

      // Calculate quality metrics
      const quality = await this.calculateQuality(processedImage);

      console.log('INVOICE_PREPROCESSING_COMPLETE:', {
        steps: processingSteps,
        quality: {
          sharpness: quality.sharpness.toFixed(3),
          contrast: quality.contrast.toFixed(3),
          textClarity: quality.textClarity.toFixed(3)
        }
      });

      return {
        processedImage,
        originalImage,
        processingSteps,
        quality
      };

    } catch (error) {
      console.error('INVOICE_PREPROCESSING_ERROR:', error);
      // Fallback to original image
      return {
        processedImage: originalImage,
        originalImage,
        processingSteps: ['Failed - using original'],
        quality: { sharpness: 0, contrast: 0, textClarity: 0 }
      };
    }
  }

  /**
   * Apply grayscale conversion
   */
  private static async applyGrayscale(imageSrc: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          
          if (!ctx) {
            reject(new Error('Could not get canvas context'));
            return;
          }

          canvas.width = img.width;
          canvas.height = img.height;
          
          // Apply grayscale filter
          ctx.filter = 'grayscale(100%)';
          ctx.drawImage(img, 0, 0);
          
          resolve(canvas.toDataURL('image/jpeg', 0.95));
        } catch (error) {
          reject(error);
        }
      };
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = imageSrc;
    });
  }

  /**
   * Apply contrast enhancement
   */
  private static async applyContrast(imageSrc: string, contrast: number): Promise<string> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          
          if (!ctx) {
            reject(new Error('Could not get canvas context'));
            return;
          }

          canvas.width = img.width;
          canvas.height = img.height;
          
          // Apply contrast filter
          ctx.filter = `contrast(${contrast})`;
          ctx.drawImage(img, 0, 0);
          
          resolve(canvas.toDataURL('image/jpeg', 0.95));
        } catch (error) {
          reject(error);
        }
      };
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = imageSrc;
    });
  }

  /**
   * Apply upscaling for better text resolution
   */
  private static async applyUpscale(imageSrc: string, scaleFactor: number): Promise<string> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          
          if (!ctx) {
            reject(new Error('Could not get canvas context'));
            return;
          }

          const newWidth = img.width * scaleFactor;
          const newHeight = img.height * scaleFactor;
          
          canvas.width = newWidth;
          canvas.height = newHeight;
          
          // Enable high-quality upscaling
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          
          // Draw scaled image
          ctx.drawImage(img, 0, 0, newWidth, newHeight);
          
          resolve(canvas.toDataURL('image/jpeg', 0.95));
        } catch (error) {
          reject(error);
        }
      };
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = imageSrc;
    });
  }

  /**
   * Apply auto contrast stretch for faded text
   */
  private static async applyAutoContrastStretch(imageSrc: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          
          if (!ctx) {
            reject(new Error('Could not get canvas context'));
            return;
          }

          canvas.width = img.width;
          canvas.height = img.height;
          
          // Draw original image
          ctx.drawImage(img, 0, 0);
          
          // Get image data
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const data = imageData.data;
          
          // Find min and max brightness values
          let minBrightness = 255;
          let maxBrightness = 0;
          
          for (let i = 0; i < data.length; i += 4) {
            const brightness = (data[i] + data[i + 1] + data[i + 2]) / 3;
            minBrightness = Math.min(minBrightness, brightness);
            maxBrightness = Math.max(maxBrightness, brightness);
          }
          
          // Apply contrast stretch
          const range = maxBrightness - minBrightness;
          if (range > 0) {
            for (let i = 0; i < data.length; i += 4) {
              const brightness = (data[i] + data[i + 1] + data[i + 2]) / 3;
              const stretchedBrightness = ((brightness - minBrightness) / range) * 255;
              const factor = stretchedBrightness / brightness;
              
              data[i] = Math.min(255, data[i] * factor);
              data[i + 1] = Math.min(255, data[i + 1] * factor);
              data[i + 2] = Math.min(255, data[i + 2] * factor);
            }
          }
          
          // Put processed image data back
          ctx.putImageData(imageData, 0, 0);
          
          resolve(canvas.toDataURL('image/jpeg', 0.95));
        } catch (error) {
          reject(error);
        }
      };
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = imageSrc;
    });
  }

  /**
   * Clean up background and improve text contrast
   */
  private static async cleanupBackground(imageSrc: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          
          if (!ctx) {
            reject(new Error('Could not get canvas context'));
            return;
          }

          canvas.width = img.width;
          canvas.height = img.height;
          
          // Apply background cleanup filter
          ctx.filter = 'brightness(1.2) contrast(1.3) saturate(0.8)';
          ctx.drawImage(img, 0, 0);
          
          resolve(canvas.toDataURL('image/jpeg', 0.95));
        } catch (error) {
          reject(error);
        }
      };
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = imageSrc;
    });
  }

  /**
   * Apply strong thresholding for binary text
   */
  private static async applyThresholding(imageSrc: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          
          if (!ctx) {
            reject(new Error('Could not get canvas context'));
            return;
          }

          canvas.width = img.width;
          canvas.height = img.height;
          
          // Draw grayscale image
          ctx.filter = 'grayscale(100%)';
          ctx.drawImage(img, 0, 0);
          
          // Get image data and apply threshold
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const data = imageData.data;
          const threshold = 128; // Mid-point threshold
          
          for (let i = 0; i < data.length; i += 4) {
            const brightness = (data[i] + data[i + 1] + data[i + 2]) / 3;
            const binary = brightness > threshold ? 255 : 0;
            
            data[i] = binary;
            data[i + 1] = binary;
            data[i + 2] = binary;
          }
          
          // Put thresholded image back
          ctx.putImageData(imageData, 0, 0);
          
          resolve(canvas.toDataURL('image/jpeg', 0.95));
        } catch (error) {
          reject(error);
        }
      };
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = imageSrc;
    });
  }

  /**
   * Apply sharpening for text clarity
   */
  private static async applySharpen(imageSrc: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          
          if (!ctx) {
            reject(new Error('Could not get canvas context'));
            return;
          }

          canvas.width = img.width;
          canvas.height = img.height;
          
          // Apply sharpening filter
          ctx.filter = 'contrast(1.2) brightness(1.1)';
          ctx.drawImage(img, 0, 0);
          
          resolve(canvas.toDataURL('image/jpeg', 0.95));
        } catch (error) {
          reject(error);
        }
      };
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = imageSrc;
    });
  }

  /**
   * Remove shadows and improve background
   */
  private static async removeShadows(imageSrc: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          
          if (!ctx) {
            reject(new Error('Could not get canvas context'));
            return;
          }

          canvas.width = img.width;
          canvas.height = img.height;
          
          // Apply shadow removal filter
          ctx.filter = 'brightness(1.3) contrast(1.2) saturate(0.8)';
          ctx.drawImage(img, 0, 0);
          
          resolve(canvas.toDataURL('image/jpeg', 0.95));
        } catch (error) {
          reject(error);
        }
      };
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = imageSrc;
    });
  }

  /**
   * Enhance text clarity
   */
  private static async enhanceText(imageSrc: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          
          if (!ctx) {
            reject(new Error('Could not get canvas context'));
            return;
          }

          canvas.width = img.width;
          canvas.height = img.height;
          
          // Apply text enhancement
          ctx.filter = 'contrast(1.3) brightness(1.2) saturate(0.5)';
          ctx.drawImage(img, 0, 0);
          
          resolve(canvas.toDataURL('image/jpeg', 0.95));
        } catch (error) {
          reject(error);
        }
      };
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = imageSrc;
    });
  }

  /**
   * Calculate quality metrics for processed image
   */
  private static async calculateQuality(imageSrc: string): Promise<{
    sharpness: number;
    contrast: number;
    textClarity: number;
  }> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          
          if (!ctx) {
            reject(new Error('Could not get canvas context'));
            return;
          }

          // Use smaller size for analysis
          const analysisSize = Math.min(img.width, img.height, 600);
          canvas.width = analysisSize;
          canvas.height = analysisSize;
          
          ctx.drawImage(img, 0, 0, analysisSize, analysisSize);
          const imageData = ctx.getImageData(0, 0, analysisSize, analysisSize);
          const data = imageData.data;
          
          // Calculate metrics
          const sharpness = this.calculateSharpness(data, analysisSize, analysisSize);
          const contrast = this.calculateContrast(data);
          const textClarity = this.calculateTextClarity(data, analysisSize, analysisSize);
          
          resolve({
            sharpness,
            contrast,
            textClarity
          });
        } catch (error) {
          reject(error);
        }
      };
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = imageSrc;
    });
  }

  /**
   * Calculate sharpness using Laplacian operator
   */
  private static calculateSharpness(data: Uint8ClampedArray, width: number, height: number): number {
    let sharpnessSum = 0;
    let pixelCount = 0;
    
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = (y * width + x) * 4;
        
        const center = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
        const top = ((data[((y - 1) * width + x) * 4] + data[((y - 1) * width + x) * 4 + 1] + data[((y - 1) * width + x) * 4 + 2]) / 3);
        const bottom = ((data[((y + 1) * width + x) * 4] + data[((y + 1) * width + x) * 4 + 1] + data[((y + 1) * width + x) * 4 + 2]) / 3);
        const left = ((data[(y * width + (x - 1)) * 4] + data[(y * width + (x - 1)) * 4 + 1] + data[(y * width + (x - 1)) * 4 + 2]) / 3);
        const right = ((data[(y * width + (x + 1)) * 4] + data[(y * width + (x + 1)) * 4 + 1] + data[(y * width + (x + 1)) * 4 + 2]) / 3);
        
        const laplacian = Math.abs(4 * center - top - bottom - left - right);
        sharpnessSum += laplacian;
        pixelCount++;
      }
    }
    
    const averageSharpness = pixelCount > 0 ? sharpnessSum / pixelCount : 0;
    return Math.min(averageSharpness / 255, 1);
  }

  /**
   * Calculate contrast using standard deviation
   */
  private static calculateContrast(data: Uint8ClampedArray): number {
    const brightnesses: number[] = [];
    
    for (let i = 0; i < data.length; i += 4) {
      const brightness = (data[i] + data[i + 1] + data[i + 2]) / 3;
      brightnesses.push(brightness);
    }
    
    const mean = brightnesses.reduce((a, b) => a + b, 0) / brightnesses.length;
    const variance = brightnesses.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / brightnesses.length;
    const standardDeviation = Math.sqrt(variance);
    
    return Math.min(standardDeviation / 128, 1);
  }

  /**
   * Calculate text clarity (edge density for text regions)
   */
  private static calculateTextClarity(data: Uint8ClampedArray, width: number, height: number): number {
    let edgeCount = 0;
    let totalPixels = 0;
    
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = (y * width + x) * 4;
        
        const center = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
        const right = ((data[(y * width + (x + 1)) * 4] + data[(y * width + (x + 1)) * 4 + 1] + data[(y * width + (x + 1)) * 4 + 2]) / 3);
        
        const difference = Math.abs(center - right);
        if (difference > 30) { // Threshold for text edges
          edgeCount++;
        }
        totalPixels++;
      }
    }
    
    return totalPixels > 0 ? edgeCount / totalPixels : 0;
  }
}
