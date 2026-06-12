/**
 * Crop Optimization Service
 * 
 * Intelligent crop fitting and frame selection for documents
 * Optimized for OCR quality and user experience
 */

import type { PaperBounds } from './PaperEdgeDetector';

export interface CropSettings {
  x: number;
  y: number;
  zoom: number;
  frameType: 'portrait' | 'landscape' | 'square';
  aspectRatio: number;
  maxZoom: number;
}

export interface ImageDimensions {
  width: number;
  height: number;
}

export interface CropOptimizationResult {
  cropSettings: CropSettings;
  confidence: number;
  reasoning: string;
  fillRatio: number;
}

export class CropOptimizer {
  private static readonly FRAME_CONFIGS = {
    portrait: { aspectRatio: 0.75, maxZoom: 3.5, fillTarget: 0.88 }, // Slightly wider for ID cards
    landscape: { aspectRatio: 1.6, maxZoom: 6, fillTarget: 0.92 }, // Wider for licences
    square: { aspectRatio: 1.0, maxZoom: 4, fillTarget: 0.85 }
  };

  /**
   * Optimize crop settings for detected document
   */
  static optimizeCrop(
    documentBounds: PaperBounds,
    imageDimensions: ImageDimensions,
    currentFrame?: 'portrait' | 'landscape' | 'square'
  ): CropOptimizationResult {
    // Determine optimal frame type
    const frameType = this.selectOptimalFrame(documentBounds, currentFrame);
    const frameConfig = this.FRAME_CONFIGS[frameType];

    // Calculate optimal zoom to fit full document
    const zoom = this.calculateOptimalZoom(documentBounds, imageDimensions, frameConfig);
    
    // Center crop on document
    const cropPosition = this.centerCropOnDocument(documentBounds, imageDimensions, zoom);

    const cropSettings: CropSettings = {
      x: cropPosition.x,
      y: cropPosition.y,
      zoom,
      frameType,
      aspectRatio: frameConfig.aspectRatio,
      maxZoom: frameConfig.maxZoom
    };

    // Calculate quality metrics
    const fillRatio = this.calculateFillRatio(documentBounds, imageDimensions, zoom);
    const confidence = this.calculateOptimizationConfidence(documentBounds, frameType, fillRatio);
    const reasoning = this.generateReasoning(documentBounds, frameType, zoom, fillRatio);

    return {
      cropSettings,
      confidence,
      reasoning,
      fillRatio
    };
  }

  /**
   * Select optimal frame type based on document dimensions
   */
  private static selectOptimalFrame(
    documentBounds: PaperBounds,
    currentFrame?: 'portrait' | 'landscape' | 'square'
  ): 'portrait' | 'landscape' | 'square' {
    const documentRatio = documentBounds.width / documentBounds.height;

    // Use document shape for frame selection
    if (documentRatio > 1.15) {
      return 'landscape';
    } else if (documentRatio >= 0.85 && documentRatio <= 1.15) {
      return 'square';
    } else {
      return 'portrait';
    }
  }

  /**
   * Calculate optimal zoom to fit full document
   */
  private static calculateOptimalZoom(
    documentBounds: PaperBounds,
    imageDimensions: ImageDimensions,
    frameConfig: { aspectRatio: number; maxZoom: number; fillTarget: number }
  ): number {
    const { width: imgWidth, height: imgHeight } = imageDimensions;
    const { width: docWidth, height: docHeight } = documentBounds;

    let zoomFactor: number;

    if (frameConfig.aspectRatio > 1.0) {
      // Landscape frame - fit document width
      zoomFactor = (imgWidth * frameConfig.fillTarget) / docWidth;
    } else if (frameConfig.aspectRatio < 1.0) {
      // Portrait frame - fit document height
      zoomFactor = (imgHeight * frameConfig.fillTarget) / docHeight;
    } else {
      // Square frame - fit the smaller dimension
      zoomFactor = Math.min(
        (imgWidth * frameConfig.fillTarget) / docWidth,
        (imgHeight * frameConfig.fillTarget) / docHeight
      );
    }

    // Ensure zoom is within reasonable bounds
    return Math.max(0.5, Math.min(zoomFactor, frameConfig.maxZoom));
  }

  /**
   * Center crop position on document center
   */
  private static centerCropOnDocument(
    documentBounds: PaperBounds,
    imageDimensions: ImageDimensions,
    zoom: number
  ): { x: number; y: number } {
    const { width: imgWidth, height: imgHeight } = imageDimensions;
    const { x: docX, y: docY, width: docWidth, height: docHeight } = documentBounds;

    // Calculate document center in image coordinates
    const documentCenterX = docX + docWidth / 2;
    const documentCenterY = docY + docHeight / 2;

    // Convert to crop percentage coordinates (react-easy-crop format)
    const cropX = ((documentCenterX / imgWidth) * 100) - 50;
    const cropY = ((documentCenterY / imgHeight) * 100) - 50;

    // Clamp to valid range
    return {
      x: Math.max(-50, Math.min(50, cropX)),
      y: Math.max(-50, Math.min(50, cropY))
    };
  }

  /**
   * Calculate how well the document fills the crop area
   */
  static calculateFillRatio(
    documentBounds: PaperBounds,
    imageDimensions: ImageDimensions,
    zoom: number
  ): number {
    const { width: imgWidth, height: imgHeight } = imageDimensions;
    const { width: docWidth, height: docHeight } = documentBounds;

    // Calculate crop area in pixels at current zoom
    const cropWidthPixels = (imgWidth * zoom) / 100;
    const cropHeightPixels = (imgHeight * zoom) / 100;

    // Calculate how much of document fits in crop area
    const documentInCropWidth = Math.min(docWidth, cropWidthPixels);
    const documentInCropHeight = Math.min(docHeight, cropHeightPixels);
    const documentInCropArea = documentInCropWidth * documentInCropHeight;

    // Calculate crop area
    const cropArea = cropWidthPixels * cropHeightPixels;

    // Return fill ratio (document area / crop area)
    return cropArea > 0 ? documentInCropArea / cropArea : 0;
  }

  /**
   * Calculate confidence in the optimization
   */
  private static calculateOptimizationConfidence(
    documentBounds: PaperBounds,
    frameType: string,
    fillRatio: number
  ): number {
    let confidence = documentBounds.confidence * 0.5; // Base confidence from detection

    // Add confidence based on fill ratio
    if (fillRatio > 0.7) {
      confidence += 0.3; // Good fill
    } else if (fillRatio > 0.5) {
      confidence += 0.2; // Acceptable fill
    } else {
      confidence += 0.1; // Poor fill
    }

    // Add confidence based on frame match
    const documentRatio = documentBounds.width / documentBounds.height;
    if (
      (frameType === 'landscape' && documentRatio > 1.15) ||
      (frameType === 'portrait' && documentRatio < 0.85) ||
      (frameType === 'square' && documentRatio >= 0.85 && documentRatio <= 1.15)
    ) {
      confidence += 0.2; // Good frame match
    }

    return Math.min(1, confidence);
  }

  /**
   * Generate human-readable reasoning for the optimization
   */
  private static generateReasoning(
    documentBounds: PaperBounds,
    frameType: string,
    zoom: number,
    fillRatio: number
  ): string {
    const documentRatio = documentBounds.width / documentBounds.height;
    const reasoning: string[] = [];

    reasoning.push(`Document ratio: ${documentRatio.toFixed(2)} → ${frameType} frame`);
    reasoning.push(`Zoom: ${zoom.toFixed(2)}x to fit full document`);
    reasoning.push(`Fill ratio: ${(fillRatio * 100).toFixed(0)}%`);
    reasoning.push(`Detection method: ${documentBounds.detectionMethod}`);

    if (fillRatio > 0.7) {
      reasoning.push('Excellent fit for OCR');
    } else if (fillRatio > 0.5) {
      reasoning.push('Good fit for OCR');
    } else {
      reasoning.push('May need manual adjustment for optimal OCR');
    }

    return reasoning.join(' | ');
  }

  /**
   * Get OCR fill suggestion based on optimization result
   */
  static getOCRFillSuggestion(fillRatio: number, frameType: string): string {
    if (fillRatio < 0.3) {
      return 'Zoom closer';
    } else if (fillRatio < 0.5) {
      return frameType === 'portrait' ? 'Use landscape frame' : 'Center document';
    } else if (fillRatio < 0.7) {
      return 'Acceptable for OCR';
    } else {
      return 'Excellent scan size';
    }
  }

  /**
   * Validate crop settings
   */
  static validateCropSettings(cropSettings: CropSettings): boolean {
    return (
      cropSettings.zoom >= 0.3 &&
      cropSettings.zoom <= cropSettings.maxZoom &&
      cropSettings.x >= -50 &&
      cropSettings.x <= 50 &&
      cropSettings.y >= -50 &&
      cropSettings.y <= 50 &&
      cropSettings.aspectRatio > 0
    );
  }

  /**
   * Get default crop settings for when no document is detected
   */
  static getDefaultCropSettings(
    imageDimensions: ImageDimensions,
    frameType: 'portrait' | 'landscape' | 'square' = 'portrait'
  ): CropSettings {
    const frameConfig = this.FRAME_CONFIGS[frameType];
    
    return {
      x: 0,
      y: 0,
      zoom: 0.8, // Start slightly zoomed out
      frameType,
      aspectRatio: frameConfig.aspectRatio,
      maxZoom: frameConfig.maxZoom
    };
  }
}
