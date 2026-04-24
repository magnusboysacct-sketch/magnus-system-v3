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

export function createOCREnhancedImage(file: File): Promise<File> {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      reject(new Error('Could not get canvas context'));
      return;
    }

    const img = new Image();
    img.onload = () => {
      try {
        // Set canvas to original image dimensions
        canvas.width = img.width;
        canvas.height = img.height;

        // Draw original image
        ctx.drawImage(img, 0, 0);

        // Get image data for OCR enhancement
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;

        // Calculate image brightness for auto-adjustment
        let totalBrightness = 0;
        for (let i = 0; i < data.length; i += 4) {
          const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
          totalBrightness += gray;
        }
        const avgBrightness = totalBrightness / (data.length / 4);

        // Auto brighten dark receipts
        const brightnessAdjustment = avgBrightness < 100 ? 1.3 : (avgBrightness < 150 ? 1.1 : 1.0);

        // Enhanced contrast for OCR
        const contrast = 1.25;
        const factor = (259 * (contrast + 255)) / (255 * (259 - contrast));

        // Apply sharpening kernel
        const sharpenKernel = [
          0, -1, 0,
          -1, 5, -1,
          0, -1, 0
        ];

        // Create temporary copy for sharpening
        const tempData = new Uint8ClampedArray(data);

        for (let i = 0; i < data.length; i += 4) {
          // Enhanced grayscale conversion
          const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
          
          // Apply brightness adjustment
          const brightened = gray * brightnessAdjustment;
          
          // Apply contrast boost
          const enhanced = factor * (brightened - 128) + 128;
          const clamped = Math.min(255, Math.max(0, enhanced));
          
          // Apply light sharpening
          const pixelIndex = i / 4;
          const x = pixelIndex % canvas.width;
          const y = Math.floor(pixelIndex / canvas.width);
          
          let sharpened = clamped;
          if (x > 0 && x < canvas.width - 1 && y > 0 && y < canvas.height - 1) {
            let sharpenSum = 0;
            for (let ky = -1; ky <= 1; ky++) {
              for (let kx = -1; kx <= 1; kx++) {
                const neighborIndex = ((y + ky) * canvas.width + (x + kx)) * 4;
                const neighborGray = tempData[neighborIndex] * 0.299 + tempData[neighborIndex + 1] * 0.587 + tempData[neighborIndex + 2] * 0.114;
                const kernelIndex = (ky + 1) * 3 + (kx + 1);
                sharpenSum += neighborGray * sharpenKernel[kernelIndex];
              }
            }
            sharpened = Math.min(255, Math.max(0, sharpenSum));
          }
          
          data[i] = sharpened;
          data[i + 1] = sharpened;
          data[i + 2] = sharpened;
        }

        ctx.putImageData(imageData, 0, 0);

        canvas.toBlob((blob) => {
          if (blob) {
            const ocrFile = new File([blob], `ocr_${file.name}`, {
              type: 'image/jpeg',
              lastModified: Date.now()
            });
            resolve(ocrFile);
          } else {
            reject(new Error('Failed to create OCR enhanced image'));
          }
        }, 'image/jpeg', 0.95); // Maximum quality for OCR

      } catch (error) {
        reject(error);
      }
    };

    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = URL.createObjectURL(file);
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
