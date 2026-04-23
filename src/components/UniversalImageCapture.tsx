import React, { useState, useRef, useCallback, useEffect } from "react";
import { Camera, Upload, X, Check, FileText, Move } from "lucide-react";
import ReactCrop, {
  type Crop,
  type PercentCrop,
  centerCrop,
  makeAspectCrop,
} from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";

export type ImageCaptureMode = "id_photo" | "worker_photo" | "receipt" | "general";

interface UniversalImageCaptureProps {
  title: string;
  subtitle?: string;
  mode: ImageCaptureMode;
  onImageReady: (
    file: File,
    metadata?: { width: number; height: number; size: number; ocrFile?: File }
  ) => void;
  onCancel: () => void;
  maxSize?: number;
  quality?: number;
  allowPDF?: boolean;
  initialFile?: File | null;
}

interface CroppedImage {
  file: File;
  preview: string;
  width: number;
  height: number;
  size: number;
  ocrFile?: File;
}

function clampCrop(crop: PercentCrop): PercentCrop {
  const x = Math.max(0, Math.min(crop.x ?? 0, 100));
  const y = Math.max(0, Math.min(crop.y ?? 0, 100));
  const width = Math.max(1, Math.min(crop.width ?? 1, 100 - x));
  const height = Math.max(1, Math.min(crop.height ?? 1, 100 - y));

  return {
    unit: "%",
    x,
    y,
    width,
    height,
  };
}

function makeDefaultCrop(
  mode: ImageCaptureMode,
  mediaWidth: number,
  mediaHeight: number
): PercentCrop {
  if (mode === "id_photo") {
    return centerCrop(
      makeAspectCrop(
        {
          unit: "%",
          width: 80,
        },
        1.6,
        mediaWidth,
        mediaHeight
      ),
      mediaWidth,
      mediaHeight
    );
  }

  if (mode === "worker_photo") {
    return centerCrop(
      makeAspectCrop(
        {
          unit: "%",
          width: 70,
        },
        1,
        mediaWidth,
        mediaHeight
      ),
      mediaWidth,
      mediaHeight
    );
  }

  if (mode === "receipt") {
    return clampCrop({
      unit: "%",
      x: 9,
      y: 11,
      width: 82,
      height: 82,
    });
  }

  return {
    unit: "%",
    x: 10,
    y: 10,
    width: 80,
    height: 80,
  };
}

function getInitialCropForMode(mode: ImageCaptureMode): PercentCrop {
  if (mode === "receipt") {
    return {
      unit: "%",
      x: 9,
      y: 11,
      width: 82,
      height: 82,
    };
  }

  return {
    unit: "%",
    x: 10,
    y: 10,
    width: 80,
    height: 80,
  };
}

export default function UniversalImageCapture({
  title,
  subtitle,
  mode,
  onImageReady,
  onCancel,
  maxSize,
  quality,
  allowPDF = false,
  initialFile,
}: UniversalImageCaptureProps) {
  const resolvedSubtitle =
    subtitle ||
    (mode === "receipt"
      ? "Adjust the crop area to capture the receipt details. Fill the frame with the receipt and avoid background."
      : "Adjust the crop area to capture the important details.");

  const finalMaxSize = maxSize || (mode === "receipt" ? 2000 : 1600);
  const finalQuality = quality || (mode === "receipt" ? 0.98 : 0.8);

  const [step, setStep] = useState<"capture" | "crop" | "crop_result" | "pdf_preview">("capture");
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [croppedImage, setCroppedImage] = useState<CroppedImage | null>(null);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [crop, setCrop] = useState<PercentCrop>(getInitialCropForMode(mode));

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    return () => {
      if (croppedImage?.preview) {
        URL.revokeObjectURL(croppedImage.preview);
      }
    };
  }, [croppedImage]);

  useEffect(() => {
    setCrop(getInitialCropForMode(mode));
  }, [mode]);

  useEffect(() => {
    if (!initialFile || selectedImage) return;

    if (initialFile.type === "application/pdf") {
      if (!allowPDF) {
        setError("PDF files are not allowed for this type of image");
        return;
      }

      if (initialFile.size > 10 * 1024 * 1024) {
        setError("File is too large. Please select a file under 10MB.");
        return;
      }

      setSelectedFile(initialFile);
      setStep("pdf_preview");
      setError(null);
      return;
    }

    if (!initialFile.type.startsWith("image/")) return;

    if (initialFile.size > 10 * 1024 * 1024) {
      setError("Image is too large. Please select an image under 10MB.");
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result;
      if (!result) return;

      setSelectedImage(result as string);
      setSelectedFile(initialFile);
      setStep("crop");
      setError(null);
      setCroppedImage(null);
      setCrop(getInitialCropForMode(mode));
    };
    reader.readAsDataURL(initialFile);
  }, [allowPDF, initialFile, mode, selectedImage]);

  const getAspectRatio = useCallback((): number | undefined => {
    switch (mode) {
      case "id_photo":
        return 1.6;
      case "worker_photo":
        return 1;
      case "receipt":
      case "general":
      default:
        return undefined;
    }
  }, [mode]);

  const getCropInstructions = useCallback(() => {
    switch (mode) {
      case "id_photo":
        return "Drag to crop ID card";
      case "worker_photo":
        return "Drag to crop worker's face";
      case "receipt":
        return "Drag to crop receipt details";
      case "general":
      default:
        return "Drag to adjust crop area";
    }
  }, [mode]);

  const clearInputs = () => {
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (cameraInputRef.current) cameraInputRef.current.value = "";
  };

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files?.length) return;

      const file = files[0];

      if (file.size > 10 * 1024 * 1024) {
        setError("File is too large. Please select a file under 10MB.");
        clearInputs();
        return;
      }

      setError(null);

      if (file.type === "application/pdf") {
        if (!allowPDF) {
          setError("PDF files are not allowed for this type of image");
          clearInputs();
          return;
        }

        setSelectedFile(file);
        setSelectedImage(null);
        setCroppedImage(null);
        setStep("pdf_preview");
        clearInputs();
        return;
      }

      if (!file.type.startsWith("image/")) {
        clearInputs();
        return;
      }

      const reader = new FileReader();
      reader.onload = (event) => {
        const result = event.target?.result;
        if (!result) return;

        if (croppedImage?.preview) {
          URL.revokeObjectURL(croppedImage.preview);
        }

        setSelectedImage(result as string);
        setSelectedFile(file);
        setCroppedImage(null);
        setCrop(getInitialCropForMode(mode));
        setStep("crop");
      };
      reader.readAsDataURL(file);
      clearInputs();
    },
    [allowPDF, croppedImage, mode]
  );

  const handleImageLoad = useCallback(
    (e: React.SyntheticEvent<HTMLImageElement>) => {
      const { naturalWidth, naturalHeight } = e.currentTarget;
      imageRef.current = e.currentTarget;
      setCrop(clampCrop(makeDefaultCrop(mode, naturalWidth, naturalHeight)));
    },
    [mode]
  );

  const handleCrop = useCallback(async () => {
    if (!selectedImage || !canvasRef.current || !imageRef.current) return;

    const safeCrop = clampCrop(crop);
    if (safeCrop.width <= 0 || safeCrop.height <= 0) {
      setError("Please select a crop area first.");
      return;
    }

    setProcessing(true);
    setError(null);

    try {
      const img = imageRef.current;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas context not available");

      const sourceX = Math.round((safeCrop.x / 100) * img.naturalWidth);
      const sourceY = Math.round((safeCrop.y / 100) * img.naturalHeight);
      const sourceWidth = Math.round((safeCrop.width / 100) * img.naturalWidth);
      const sourceHeight = Math.round((safeCrop.height / 100) * img.naturalHeight);

      const fittedMax = Math.max(sourceWidth, sourceHeight);
      const scale = fittedMax > finalMaxSize ? finalMaxSize / fittedMax : 1;

      const outputWidth = Math.max(1, Math.round(sourceWidth * scale));
      const outputHeight = Math.max(1, Math.round(sourceHeight * scale));

      canvas.width = outputWidth;
      canvas.height = outputHeight;

      ctx.clearRect(0, 0, outputWidth, outputHeight);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";

      ctx.drawImage(
        img,
        sourceX,
        sourceY,
        sourceWidth,
        sourceHeight,
        0,
        0,
        outputWidth,
        outputHeight
      );

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            setError("Failed to create cropped image. Please try again.");
            setProcessing(false);
            return;
          }

          if (croppedImage?.preview) {
            URL.revokeObjectURL(croppedImage.preview);
          }

          const fileName = `cropped_${Date.now()}.jpg`;
          const file = new File([blob], fileName, { type: "image/jpeg" });
          const preview = URL.createObjectURL(blob);

          setCroppedImage({
            file,
            preview,
            width: outputWidth,
            height: outputHeight,
            size: blob.size,
            ocrFile: file,
          });

          setStep("crop_result");
          setProcessing(false);
        },
        "image/jpeg",
        finalQuality
      );
    } catch (err) {
      console.error("Crop error:", err);
      setError("Failed to crop image. Please try again.");
      setProcessing(false);
    }
  }, [crop, croppedImage, finalMaxSize, finalQuality, selectedImage]);

  const handlePDFUpload = useCallback(() => {
    if (!selectedFile) return;

    onImageReady(selectedFile, {
      width: 0,
      height: 0,
      size: selectedFile.size,
    });
  }, [onImageReady, selectedFile]);

  const handleSave = useCallback(() => {
    if (!croppedImage) return;

    onImageReady(croppedImage.file, {
      width: croppedImage.width,
      height: croppedImage.height,
      size: croppedImage.size,
      ocrFile: croppedImage.ocrFile ?? croppedImage.file,
    });
  }, [croppedImage, onImageReady]);

  const handleRetake = useCallback(() => {
    if (croppedImage?.preview) {
      URL.revokeObjectURL(croppedImage.preview);
    }
    setCroppedImage(null);
    setStep(selectedImage ? "crop" : "capture");
    setError(null);
  }, [croppedImage, selectedImage]);

  const handleReset = useCallback(() => {
    if (croppedImage?.preview) {
      URL.revokeObjectURL(croppedImage.preview);
    }

    setSelectedImage(null);
    setSelectedFile(null);
    setCroppedImage(null);
    setCrop(getInitialCropForMode(mode));
    setError(null);
    setProcessing(false);
    setStep("capture");
    imageRef.current = null;
    clearInputs();
    onCancel();
  }, [croppedImage, mode, onCancel]);

  return (
    <div className="space-y-3">
      <style>{`
        .receipt-cropper {
          display: inline-block;
          max-width: 100%;
        }

        .receipt-cropper .ReactCrop__crop-selection {
          border: 2px dashed #ffffff;
          box-shadow: 0 0 0 9999em rgba(15, 23, 42, 0.45);
        }

        .receipt-cropper .ReactCrop__drag-handle {
          width: 14px;
          height: 14px;
          background: #2563eb;
          border: 2px solid #ffffff;
          opacity: 1;
        }

        .receipt-cropper .ReactCrop__drag-bar {
          opacity: 1;
          background: rgba(37, 99, 235, 0.95);
        }
      `}</style>

      <div className="text-center">
        <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
        {resolvedSubtitle && <p className="mt-1 text-sm text-slate-600">{resolvedSubtitle}</p>}
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3">
          <div className="flex items-center gap-2">
            <X className="h-4 w-4 text-red-600" />
            <span className="text-sm text-red-700">{error}</span>
          </div>
        </div>
      )}

      {step === "capture" && (
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => cameraInputRef.current?.click()}
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
            onClick={() => fileInputRef.current?.click()}
            className="group w-full rounded-xl border-2 border-dashed border-slate-300 bg-white p-6 transition-all hover:border-green-500 hover:bg-green-50"
          >
            <div className="flex flex-col items-center gap-3">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-green-500/20 transition group-hover:bg-green-500/30">
                <Upload className="h-7 w-7 text-green-600" />
              </div>
              <div className="text-center">
                <div className="text-base font-medium text-slate-900">
                  {allowPDF ? "Choose Photo or PDF" : "Choose Photo"}
                </div>
                <div className="mt-1 text-sm text-slate-600">
                  {allowPDF ? "Select from gallery or device" : "Select from gallery"}
                </div>
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
            accept={allowPDF ? "image/*,application/pdf" : "image/*"}
            onChange={handleFileSelect}
            className="hidden"
          />
        </div>
      )}

      {step === "pdf_preview" && (
        <div className="space-y-4">
          <div className="text-center">
            <div className="inline-flex items-center gap-2 rounded-full bg-orange-100 px-3 py-1 text-sm text-orange-700">
              <FileText className="h-4 w-4" />
              PDF Document Ready
            </div>
          </div>

          <div className="rounded-lg bg-slate-100 p-4 text-center">
            <FileText className="mx-auto mb-2 h-16 w-16 text-slate-400" />
            <div className="text-sm font-medium text-slate-900">{selectedFile?.name}</div>
            <div className="mt-1 text-xs text-slate-600">
              {selectedFile ? `${(selectedFile.size / 1024).toFixed(1)} KB` : ""}
            </div>
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleReset}
              className="flex-1 rounded-lg border border-slate-300 px-4 py-2 text-slate-700 transition-colors hover:bg-slate-50"
            >
              <X className="mr-2 inline h-4 w-4" />
              Cancel
            </button>
            <button
              type="button"
              onClick={handlePDFUpload}
              className="flex-1 rounded-lg bg-green-600 px-4 py-2 text-white transition-colors hover:bg-green-700"
            >
              <Check className="mr-2 inline h-4 w-4" />
              Use This PDF
            </button>
          </div>
        </div>
      )}

      {step === "crop" && !croppedImage && (
        <div className="space-y-3">
          <div className="flex justify-center pt-3">
            <div className="inline-flex items-center gap-2 rounded-full bg-blue-100 px-3 py-1.5 text-sm text-blue-700 shadow-sm">
              <Move className="h-4 w-4" />
              {getCropInstructions()}
            </div>
          </div>

          <div
            className="flex w-full items-center justify-center overflow-hidden rounded-lg bg-slate-100 px-3 pb-3 pt-5"
            style={{
              height: "66vh",
              minHeight: 540,
            }}
          >
            {!selectedImage ? (
              <div className="flex h-full w-full items-center justify-center text-slate-500">
                Loading image...
              </div>
            ) : (
              <div className="flex h-full w-full items-center justify-center overflow-auto pt-2">
                <ReactCrop
                  className="receipt-cropper"
                  crop={crop}
                  onChange={(nextCrop: Crop) => {
                    setCrop(clampCrop(nextCrop as PercentCrop));
                  }}
                  keepSelection
                  ruleOfThirds
                  minWidth={120}
                  minHeight={220}
                  aspect={getAspectRatio()}
                >
                  <img
                    ref={imageRef}
                    src={selectedImage}
                    alt="Crop preview"
                    onLoad={handleImageLoad}
                    style={{
                      display: "block",
                      maxWidth: "100%",
                      width: "auto",
                      maxHeight: "58vh",
                      objectFit: "contain",
                    }}
                  />
                </ReactCrop>
              </div>
            )}

            <canvas ref={canvasRef} className="hidden" />
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:gap-3">
            <button
              type="button"
              onClick={handleReset}
              disabled={processing}
              className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 sm:px-4 sm:text-base"
            >
              <X className="mr-2 inline h-4 w-4" />
              Cancel
            </button>
            <button
              type="button"
              onClick={handleCrop}
              disabled={processing || !crop}
              className="flex-1 rounded-lg bg-blue-600 px-3 py-2 text-sm text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 sm:px-4 sm:text-base"
            >
              {processing ? (
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
      )}

      {step === "crop_result" && croppedImage && (
        <div className="space-y-4">
          <div className="text-center">
            <div className="inline-flex items-center gap-2 rounded-full bg-green-100 px-3 py-1 text-sm text-green-700">
              <Check className="h-4 w-4" />
              Crop Complete
            </div>
          </div>

          <div className="overflow-hidden rounded-lg bg-slate-100">
            <img
              src={croppedImage.preview}
              alt="Cropped preview"
              className="h-auto max-h-32 w-full object-contain sm:max-h-48 md:max-h-64"
            />
          </div>

          <div className="text-center text-xs text-slate-600">
            {croppedImage.width} × {croppedImage.height}px ({(croppedImage.size / 1024).toFixed(1)}{" "}
            KB)
          </div>

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
              onClick={handleSave}
              className="flex-1 rounded-lg bg-green-600 px-3 py-2 text-sm text-white transition-colors hover:bg-green-700 sm:px-4 sm:text-base"
            >
              <Check className="mr-2 inline h-4 w-4" />
              Use This Photo
            </button>
          </div>
        </div>
      )}
    </div>
  );
}