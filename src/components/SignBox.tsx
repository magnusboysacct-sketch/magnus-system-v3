// src/components/SignBox.tsx — a "sign here" box for phones and computers (finger or mouse). Gives a PNG data URL.
// Same drawing as the field-payment signature (FieldPaymentForm), as a shared component.

import { useEffect, useRef, useState } from "react";
import { PenTool, RefreshCw } from "lucide-react";

export function SignBox({ onSign, onClear }: { onSign: (dataUrl: string) => void; onClear: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const signRef = useRef(onSign);
  const [hasSign, setHasSign] = useState(false);

  useEffect(() => { signRef.current = onSign; }, [onSign]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "#0f172a"; ctx.lineWidth = 2.5; ctx.lineCap = "round"; ctx.lineJoin = "round";
    const pos = (e: MouseEvent | TouchEvent) => {
      const r = canvas.getBoundingClientRect();
      const sx = canvas.width / r.width, sy = canvas.height / r.height;
      const p = "touches" in e ? e.touches[0] : e;
      return { x: (p.clientX - r.left) * sx, y: (p.clientY - r.top) * sy };
    };
    const start = (e: MouseEvent | TouchEvent) => { e.preventDefault(); drawing.current = true; const p = pos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); };
    const move = (e: MouseEvent | TouchEvent) => { if (!drawing.current) return; e.preventDefault(); const p = pos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); setHasSign(true); };
    const stop = () => { if (!drawing.current) return; drawing.current = false; signRef.current(canvas.toDataURL("image/png")); };
    canvas.addEventListener("mousedown", start); canvas.addEventListener("mousemove", move); window.addEventListener("mouseup", stop);
    canvas.addEventListener("touchstart", start, { passive: false }); canvas.addEventListener("touchmove", move, { passive: false }); canvas.addEventListener("touchend", stop);
    return () => {
      canvas.removeEventListener("mousedown", start); canvas.removeEventListener("mousemove", move); window.removeEventListener("mouseup", stop);
      canvas.removeEventListener("touchstart", start); canvas.removeEventListener("touchmove", move); canvas.removeEventListener("touchend", stop);
    };
  }, []);

  function clear() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (canvas && ctx) { ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, canvas.width, canvas.height); }
    setHasSign(false);
    onClear();
  }

  return (
    <div className="space-y-1.5">
      <div className="relative rounded-xl border-2 border-dashed border-cyan-500/40 bg-white overflow-hidden">
        <canvas ref={canvasRef} width={600} height={200} className="w-full touch-none cursor-crosshair" style={{ height: 150 }} />
        {!hasSign && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-slate-400">
            <div className="text-center"><PenTool size={20} className="mx-auto mb-1" /><div className="text-xs">Sign here</div></div>
          </div>
        )}
      </div>
      {hasSign && (
        <button type="button" onClick={clear} className="flex items-center gap-1.5 text-[11px] text-slate-500 hover:text-red-500">
          <RefreshCw size={11} /> Clear and sign again
        </button>
      )}
    </div>
  );
}
