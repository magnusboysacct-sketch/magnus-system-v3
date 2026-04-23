import type { ImageCaptureResult, CropArea } from '../types/imageCapture';

export function createImagePreview(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      if (e.target?.result) {
        resolve(e.target.result as string);
      } else {
        reject(new Error('Failed to create image preview'));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
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
