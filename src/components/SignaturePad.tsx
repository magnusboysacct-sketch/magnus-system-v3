import React, { useRef, useState, useEffect, useCallback } from "react";
import { X, RotateCcw, Pen, Check } from "lucide-react";

interface SignaturePadProps {
  title: string;
  subtitle?: string;
  onSave: (signatureData: string) => void;
  onCancel: () => void;
  width?: number;
  height?: number;
  className?: string;
}

export default function SignaturePad({
  title,
  subtitle,
  onSave,
  onCancel,
  width = 400,
  height = 200,
  className = "",
}: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [isEmpty, setIsEmpty] = useState(true);
  const [lastPoint, setLastPoint] = useState<{ x: number; y: number } | null>(null);

  // Set canvas size and context
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    try {
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      // Set canvas actual size
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      
      ctx.scale(dpr, dpr);
      
      // Set drawing styles
      ctx.strokeStyle = "#000000";
      ctx.lineWidth = 2;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      
      // Clear canvas with white background
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, rect.width, rect.height);
    } catch (error) {
      console.error("Error initializing signature canvas:", error);
    }
  }, [width, height]);

  const getCoordinates = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;

    const rect = canvas.getBoundingClientRect();
    
    if ("touches" in e) {
      return {
        x: e.touches[0].clientX - rect.left,
        y: e.touches[0].clientY - rect.top,
      };
    } else {
      return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };
    }
  }, []);

  const startDrawing = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const coords = getCoordinates(e);
    if (!coords) return;

    setIsDrawing(true);
    setLastPoint(coords);
    setIsEmpty(false);
  }, [getCoordinates]);

  // Prevent scrolling when drawing on touch devices
  const preventTouchScroll = useCallback((e: React.TouchEvent) => {
    if (isDrawing) {
      e.preventDefault();
    }
  }, [isDrawing]);

  const draw = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    if (!isDrawing) return;

    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx || !canvas) return;

    const coords = getCoordinates(e);
    if (!coords || !lastPoint) return;

    try {
      ctx.beginPath();
      ctx.moveTo(lastPoint.x, lastPoint.y);
      ctx.lineTo(coords.x, coords.y);
      ctx.stroke();

      setLastPoint(coords);
    } catch (error) {
      console.error("Error drawing signature:", error);
      // Stop drawing on error
      setIsDrawing(false);
      setLastPoint(null);
    }
  }, [isDrawing, lastPoint, getCoordinates]);

  const stopDrawing = useCallback(() => {
    setIsDrawing(false);
    setLastPoint(null);
  }, []);

  const clearSignature = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx || !canvas) return;

    try {
      const rect = canvas.getBoundingClientRect();
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, rect.width, rect.height);
      
      setIsEmpty(true);
    } catch (error) {
      console.error("Error clearing signature:", error);
    }
  }, []);

  const saveSignature = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || isEmpty) return;

    try {
      const signatureData = canvas.toDataURL("image/png");
      
      // Validate signature data
      if (!signatureData || signatureData === "data:,") {
        console.error("Invalid signature data generated");
        return;
      }
      
      onSave(signatureData);
    } catch (error) {
      console.error("Error generating signature data:", error);
      // Don't call onSave if signature generation fails
    }
  }, [isEmpty, onSave]);

  // Touch event handling for mobile
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    startDrawing(e);
  }, [startDrawing]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    draw(e);
  }, [draw]);

  const handleTouchEnd = useCallback(() => {
    stopDrawing();
  }, [stopDrawing]);

  // Mouse event handling for desktop
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    startDrawing(e);
  }, [startDrawing]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    draw(e);
  }, [draw]);

  const handleMouseUp = useCallback(() => {
    stopDrawing();
  }, [stopDrawing]);

  return (
    <div 
      className={`fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 ${className}`}
      onTouchMove={preventTouchScroll}
      style={{ touchAction: 'none' }}
    >
      <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
            {subtitle && (
              <p className="text-sm text-slate-600">{subtitle}</p>
            )}
          </div>
          <button
            onClick={onCancel}
            className="rounded-lg p-2 hover:bg-slate-100 transition-colors"
            disabled={isDrawing}
          >
            <X size={20} className="text-slate-600" />
          </button>
        </div>

        {/* Signature Canvas */}
        <div className="p-6">
          <div className="mb-4 text-center">
            <p className="text-sm text-slate-600">
              Sign below using your finger or stylus
            </p>
          </div>
          
          <div className="relative rounded-lg border-2 border-slate-300 bg-white overflow-hidden">
            <canvas
              ref={canvasRef}
              className="w-full touch-none"
              style={{ 
                height: `${height}px`,
                touchAction: 'none'
              }}
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
            />
            
            {/* Signature line */}
            <div className="absolute bottom-8 left-6 right-6 border-t-2 border-slate-300 border-dashed" />
          </div>

          {/* Controls */}
          <div className="mt-6 flex items-center justify-between">
            <button
              onClick={clearSignature}
              className="flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
            >
              <RotateCcw size={16} />
              Clear
            </button>

            <div className="flex items-center gap-2 text-sm text-slate-500">
              <Pen size={16} />
              {isEmpty ? "Signature required" : "Signature captured"}
            </div>

            <button
              onClick={saveSignature}
              disabled={isEmpty || isDrawing}
              className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                isEmpty || isDrawing
                  ? "border border-slate-300 bg-slate-100 text-slate-400 cursor-not-allowed"
                  : "bg-blue-600 text-white hover:bg-blue-700"
              }`}
            >
              <Check size={16} />
              {isDrawing ? "Drawing..." : "Save Signature"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
