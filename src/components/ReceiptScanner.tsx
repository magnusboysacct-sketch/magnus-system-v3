// src/components/ReceiptScanner.tsx
// AI-powered receipt & invoice scanner
// Uses Claude Vision via Supabase Edge Function
// Falls back to manual entry if AI unavailable

import React, { useRef, useState, useEffect, useCallback } from "react";
import { Camera, Upload, ScanLine, Check, X, RefreshCw, Move, Sparkles, AlertCircle, Plus, Trash2 } from "lucide-react";
import { aiScanReceipt, type ReceiptScanResult } from "../lib/magnusAI";

interface ReceiptScannerProps {
  onResult:  (result: ReceiptScanResult) => void;
  onCancel:  () => void;
  mode?:     "receipt" | "invoice";
}

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

async function cropFile(
  img: HTMLImageElement,
  container: HTMLDivElement,
  box: { x: number; y: number; w: number; h: number }
): Promise<File> {
  const cW = container.offsetWidth, cH = container.offsetHeight;
  const ir = img.naturalWidth / img.naturalHeight;
  const cr = cW / cH;
  let dW, dH, oX, oY;
  if (ir > cr) { dW=cW; dH=cW/ir; oX=0; oY=(cH-dH)/2; }
  else          { dH=cH; dW=cH*ir; oX=(cW-dW)/2; oY=0; }
  const sx = Math.max(0, ((box.x/100)*cW - oX) * (img.naturalWidth/dW));
  const sy = Math.max(0, ((box.y/100)*cH - oY) * (img.naturalHeight/dH));
  const sw = Math.min(img.naturalWidth  - sx, (box.w/100)*cW * (img.naturalWidth/dW));
  const sh = Math.min(img.naturalHeight - sy, (box.h/100)*cH * (img.naturalHeight/dH));
  const MAX = 1600, scale = Math.min(MAX/sw, MAX/sh, 1);
  const canvas = document.createElement("canvas");
  canvas.width  = Math.round(sw*scale);
  canvas.height = Math.round(sh*scale);
  canvas.getContext("2d")!.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob>((res,rej) =>
    canvas.toBlob(b => b?res(b):rej(new Error("blob")), "image/jpeg", 0.92)
  );
  return new File([blob], "receipt_scan.jpg", { type:"image/jpeg" });
}

export function ReceiptScanner({ onResult, onCancel, mode = "receipt" }: ReceiptScannerProps) {
  const fileInputRef   = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const containerRef   = useRef<HTMLDivElement>(null);
  const lastCroppedFile = useRef<File | null>(null);
  const imgRef         = useRef<HTMLImageElement>(null);
  const previewRef     = useRef<HTMLCanvasElement>(null);

  const [step, setStep]         = useState<"upload"|"crop"|"scanning"|"review">("upload");
  const [imageSrc, setImageSrc] = useState<string|null>(null);
  const [error, setError]       = useState<string|null>(null);
  const [progress, setProgress] = useState("");
  const [aiPowered, setAiPowered] = useState(true);
  const [box, setBox]           = useState({ x:3, y:3, w:94, h:94 });

  const [fields, setFields] = useState<ReceiptScanResult>({
    vendor:"", amount:0, date:"", receiptNumber:"", tax:0,
    lineItems:[], paymentMethod:"", confidence:0, aiPowered:false,
  });

  const dragging = useRef<{type:string;startX:number;startY:number;startBox:typeof box}|null>(null);

  // Live zoom preview
  useEffect(() => {
    if (!previewRef.current || !imgRef.current || !containerRef.current || step !== "crop") return;
    const img = imgRef.current;
    if (!img.naturalWidth) return;
    const canvas = previewRef.current;
    const ctx = canvas.getContext("2d")!;
    const cW = containerRef.current.offsetWidth;
    const cH = containerRef.current.offsetHeight;
    const ir = img.naturalWidth / img.naturalHeight;
    const cr = cW / cH;
    let dW, dH, oX, oY;
    if (ir > cr) { dW=cW; dH=cW/ir; oX=0; oY=(cH-dH)/2; }
    else          { dH=cH; dW=cH*ir; oX=(cW-dW)/2; oY=0; }
    const sx = Math.max(0, ((box.x/100)*cW - oX) * (img.naturalWidth/dW));
    const sy = Math.max(0, ((box.y/100)*cH - oY) * (img.naturalHeight/dH));
    const sw = Math.min(img.naturalWidth - sx, (box.w/100)*cW * (img.naturalWidth/dW));
    const sh = Math.min(img.naturalHeight - sy, (box.h/100)*cH * (img.naturalHeight/dH));
    canvas.width  = canvas.offsetWidth  * 2;
    canvas.height = canvas.offsetHeight * 2;
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  }, [box, step, imageSrc]);

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return; e.target.value="";
    setImageSrc(URL.createObjectURL(file));
    setStep("crop"); setError(null);
  }

  // Drag
  function getPos(e: React.MouseEvent|React.TouchEvent) {
    const rect = containerRef.current!.getBoundingClientRect();
    const cx = "touches" in e ? e.touches[0].clientX : e.clientX;
    const cy = "touches" in e ? e.touches[0].clientY : e.clientY;
    return { x:((cx-rect.left)/rect.width)*100, y:((cy-rect.top)/rect.height)*100 };
  }
  function onPD(e: React.MouseEvent|React.TouchEvent, type: string) {
    e.preventDefault(); e.stopPropagation();
    const p = getPos(e);
    dragging.current = { type, startX:p.x, startY:p.y, startBox:{...box} };
  }
  const onPM = useCallback((e: MouseEvent|TouchEvent) => {
    if (!dragging.current || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const cx = "touches" in e ? (e as TouchEvent).touches[0].clientX : (e as MouseEvent).clientX;
    const cy = "touches" in e ? (e as TouchEvent).touches[0].clientY : (e as MouseEvent).clientY;
    const dx = ((cx-rect.left)/rect.width)*100  - dragging.current.startX;
    const dy = ((cy-rect.top) /rect.height)*100 - dragging.current.startY;
    const sb = dragging.current.startBox; const MIN = 15;
    setBox(() => {
      let {x,y,w,h} = sb;
      switch(dragging.current!.type) {
        case"move": x=Math.max(0,Math.min(100-w,x+dx)); y=Math.max(0,Math.min(100-h,y+dy)); break;
        case"se":   w=Math.max(MIN,Math.min(100-x,w+dx)); h=Math.max(MIN,Math.min(100-y,h+dy)); break;
        case"sw":   x=Math.min(sb.x+sb.w-MIN,x+dx); w=Math.max(MIN,w-dx); h=Math.max(MIN,Math.min(100-y,h+dy)); break;
        case"ne":   w=Math.max(MIN,Math.min(100-x,w+dx)); y=Math.min(sb.y+sb.h-MIN,y+dy); h=Math.max(MIN,h-dy); break;
        case"nw":   x=Math.min(sb.x+sb.w-MIN,x+dx); w=Math.max(MIN,w-dx); y=Math.min(sb.y+sb.h-MIN,y+dy); h=Math.max(MIN,h-dy); break;
        case"n":    y=Math.min(sb.y+sb.h-MIN,y+dy); h=Math.max(MIN,h-dy); break;
        case"s":    h=Math.max(MIN,Math.min(100-y,h+dy)); break;
        case"e":    w=Math.max(MIN,Math.min(100-x,w+dx)); break;
        case"w":    x=Math.min(sb.x+sb.w-MIN,x+dx); w=Math.max(MIN,w-dx); break;
      }
      return {x,y,w,h};
    });
  }, []);
  const onPU = useCallback(() => { dragging.current = null; }, []);
  useEffect(() => {
    window.addEventListener("mousemove", onPM);
    window.addEventListener("mouseup",   onPU);
    window.addEventListener("touchmove", onPM, { passive:false });
    window.addEventListener("touchend",  onPU);
    return () => {
      window.removeEventListener("mousemove", onPM);
      window.removeEventListener("mouseup",   onPU);
      window.removeEventListener("touchmove", onPM);
      window.removeEventListener("touchend",  onPU);
    };
  }, [onPM, onPU]);

  async function cropAndScan() {
    if (!imgRef.current || !containerRef.current) return;
    setStep("scanning"); setProgress("Preparing image...");
    try {
      const file = await cropFile(imgRef.current, containerRef.current, box);
      lastCroppedFile.current = file;
      setProgress("AI reading receipt...");
      const result = await aiScanReceipt(file);
      if (result) {
        setFields(result);
        setAiPowered(true);
      } else {
        setAiPowered(false);
        setFields({ vendor:"", amount:0, date:"", receiptNumber:"", tax:0, lineItems:[], paymentMethod:"", confidence:0, aiPowered:false });
      }
      setStep("review");
      setProgress("");
    } catch(e:any) {
      setError("Scan failed: " + e.message);
      setStep("crop"); setProgress("");
    }
  }

  function handleUseData() {
    onResult({ ...fields, aiPowered, confidence: aiPowered ? fields.confidence : 0.8 }, lastCroppedFile.current || undefined);
  }

  function reset() {
    setImageSrc(null); setError(null); setProgress(""); setStep("upload");
    setFields({ vendor:"", amount:0, date:"", receiptNumber:"", tax:0, lineItems:[], paymentMethod:"", confidence:0, aiPowered:false });
  }

  function updateLineItem(i: number, key: string, val: string) {
    setFields(f => {
      const items = [...(f.lineItems || [])];
      items[i] = { ...items[i], [key]: key === "description" ? val : parseFloat(val)||0 };
      // Recalculate total
      const total = items.reduce((s, item) => s + (item.amount || 0), 0);
      return { ...f, lineItems: items, amount: total };
    });
  }

  function addLineItem() {
    setFields(f => ({ ...f, lineItems: [...(f.lineItems||[]), { description:"", quantity:1, unitPrice:0, amount:0 }] }));
  }

  function removeLineItem(i: number) {
    setFields(f => {
      const items = f.lineItems.filter((_,idx) => idx !== i);
      const total = items.reduce((s, item) => s + (item.amount || 0), 0);
      return { ...f, lineItems: items, amount: total };
    });
  }

  const inputCls = "w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-700 outline-none focus:border-cyan-500/50 transition-colors";
  const H = "absolute w-5 h-5 bg-emerald-400 border-2 border-white rounded z-20 touch-none cursor-pointer";

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-emerald-500/10 to-cyan-500/10 border border-emerald-500/20 px-3 py-2">
        <Sparkles size={13} className="text-emerald-400 flex-shrink-0"/>
        <div>
          <div className="text-xs font-semibold text-emerald-300">Magnus AI â€” {mode === "invoice" ? "Invoice" : "Receipt"} Scanner</div>
          <div className="text-[10px] text-slate-500">
            {step==="upload"   && "Upload or photograph the receipt/invoice."}
            {step==="crop"     && "Frame the document in the box, then tap Scan."}
            {step==="scanning" && progress}
            {step==="review"   && (aiPowered ? "AI extracted these fields â€” correct anything wrong." : "Fill in the fields manually.")}
          </div>
        </div>
        {aiPowered && step==="review" && (
          <div className="ml-auto text-[9px] font-bold text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-full flex items-center gap-1">
            <Sparkles size={9}/> AI
          </div>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2 text-xs text-red-300">
          <X size={12}/> {error} <button onClick={reset} className="ml-auto underline">Retry</button>
        </div>
      )}

      {/* Upload */}
      {step==="upload" && (
        <div className="grid grid-cols-2 gap-3">
          <button onClick={()=>cameraInputRef.current?.click()}
            className="flex flex-col items-center gap-2 p-5 rounded-xl border-2 border-dashed border-white/[0.1] hover:border-emerald-500/50 hover:bg-emerald-500/10 transition-all">
            <div className="w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
              <Camera size={20} className="text-emerald-400"/>
            </div>
            <div className="text-xs font-semibold text-slate-300">Take Photo</div>
            <div className="text-[10px] text-slate-600">Camera</div>
          </button>
          <button onClick={()=>fileInputRef.current?.click()}
            className="flex flex-col items-center gap-2 p-5 rounded-xl border-2 border-dashed border-white/[0.1] hover:border-cyan-500/50 hover:bg-cyan-500/10 transition-all">
            <div className="w-12 h-12 rounded-full bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center">
              <Upload size={20} className="text-cyan-400"/>
            </div>
            <div className="text-xs font-semibold text-slate-300">Upload</div>
            <div className="text-[10px] text-slate-600">Gallery / File</div>
          </button>
          <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" onChange={handleFileInput} className="hidden"/>
          <input ref={fileInputRef}   type="file" accept="image/*,application/pdf" onChange={handleFileInput} className="hidden"/>
        </div>
      )}

      {/* Crop */}
      {(step==="crop"||step==="scanning") && imageSrc && (
        <div className="space-y-2">
          <div ref={containerRef} className="relative w-full rounded-xl overflow-hidden bg-black select-none" style={{height:280}}>
            <img ref={imgRef} src={imageSrc} alt="Receipt"
              className="w-full h-full object-contain pointer-events-none" draggable={false}/>

            {step==="crop" && (
              <>
                <div className="absolute inset-0 bg-black/50 pointer-events-none" style={{
                  clipPath:`polygon(0% 0%,100% 0%,100% 100%,0% 100%,0% ${box.y}%,${box.x}% ${box.y}%,${box.x}% ${box.y+box.h}%,${box.x+box.w}% ${box.y+box.h}%,${box.x+box.w}% ${box.y}%,0% ${box.y}%)`
                }}/>
                <div className="absolute border-2 border-emerald-400 z-10"
                  style={{left:`${box.x}%`,top:`${box.y}%`,width:`${box.w}%`,height:`${box.h}%`,cursor:"move"}}
                  onMouseDown={e=>onPD(e,"move")} onTouchStart={e=>onPD(e,"move")}>
                  <div className="absolute inset-0 pointer-events-none opacity-20">
                    <div className="absolute border-t border-emerald-400" style={{top:"33%",left:0,right:0}}/>
                    <div className="absolute border-t border-emerald-400" style={{top:"66%",left:0,right:0}}/>
                    <div className="absolute border-l border-emerald-400" style={{left:"33%",top:0,bottom:0}}/>
                    <div className="absolute border-l border-emerald-400" style={{left:"66%",top:0,bottom:0}}/>
                  </div>
                  {[["nw","-top-2.5 -left-2.5"],["ne","-top-2.5 -right-2.5"],
                    ["sw","-bottom-2.5 -left-2.5"],["se","-bottom-2.5 -right-2.5"],
                    ["n","-top-2.5 left-1/2 -translate-x-1/2"],["s","-bottom-2.5 left-1/2 -translate-x-1/2"],
                    ["w","top-1/2 -translate-y-1/2 -left-2.5"],["e","top-1/2 -translate-y-1/2 -right-2.5"],
                  ].map(([d,c])=>(
                    <div key={d} className={cn(H,c)}
                      onMouseDown={e=>{e.stopPropagation();onPD(e,d)}}
                      onTouchStart={e=>{e.stopPropagation();onPD(e,d)}}/>
                  ))}
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="bg-black/50 rounded-full p-1.5"><Move size={14} className="text-emerald-300"/></div>
                  </div>
                </div>
              </>
            )}

            {step==="scanning" && (
              <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center gap-3">
                <div className="relative w-12 h-12">
                  <div className="absolute inset-0 border-2 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin"/>
                  <div className="absolute inset-2 border-2 border-cyan-500/20 border-b-cyan-400 rounded-full animate-spin" style={{animationDirection:"reverse",animationDuration:"0.7s"}}/>
                  <Sparkles size={16} className="absolute inset-0 m-auto text-emerald-400"/>
                </div>
                <div className="text-center">
                  <div className="text-sm text-emerald-300 font-medium">{progress}</div>
                  <div className="text-[10px] text-slate-600 mt-0.5">Claude Vision AI</div>
                </div>
              </div>
            )}
          </div>

          {/* Zoom preview */}
          {step==="crop" && (
            <div className="space-y-1">
              <div className="text-[9px] font-bold uppercase tracking-widest text-slate-600 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse inline-block"/>
                Zoom preview
              </div>
              <div className="relative rounded-xl overflow-hidden border border-emerald-500/20 bg-black" style={{height:110}}>
                <canvas ref={previewRef} className="w-full h-full"/>
                <div className="absolute bottom-1 right-2 text-[9px] text-emerald-600 font-mono">ZOOMED</div>
              </div>
            </div>
          )}

          {step==="crop" && (
            <>
              <p className="text-[10px] text-slate-600 text-center">Frame the entire receipt Â· Drag corners to resize</p>
              <div className="flex gap-2">
                <button onClick={reset} className="px-4 py-2 rounded-lg border border-white/[0.08] text-xs text-slate-400 hover:text-slate-300 transition-colors">â† Change</button>
                <button onClick={cropAndScan} className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-gradient-to-r from-emerald-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 text-xs text-white font-semibold transition-all shadow-lg shadow-emerald-500/20">
                  <Sparkles size={13}/> Scan with AI
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Review */}
      {step==="review" && (
        <div className="space-y-3">
          {!aiPowered && (
            <div className="flex items-center gap-2 rounded-lg bg-amber-500/10 border border-amber-500/20 px-3 py-2 text-[11px] text-amber-300">
              <AlertCircle size={12}/> AI unavailable â€” fill in manually
            </div>
          )}

          {/* Main fields */}
          <div className="grid grid-cols-2 gap-2">
            <div className="col-span-2 space-y-1">
              <label className="text-[9px] font-bold uppercase tracking-widest text-slate-600">Vendor / Store Name</label>
              <input value={fields.vendor} onChange={e=>setFields(f=>({...f,vendor:e.target.value}))}
                placeholder="Store or business name" className={inputCls}/>
            </div>
            <div className="space-y-1">
              <label className="text-[9px] font-bold uppercase tracking-widest text-slate-600">Date</label>
              <input value={fields.date} onChange={e=>setFields(f=>({...f,date:e.target.value}))}
                placeholder="YYYY-MM-DD" className={inputCls}/>
            </div>
            <div className="space-y-1">
              <label className="text-[9px] font-bold uppercase tracking-widest text-slate-600">Receipt #</label>
              <input value={fields.receiptNumber} onChange={e=>setFields(f=>({...f,receiptNumber:e.target.value}))}
                placeholder="Receipt number" className={inputCls}/>
            </div>
            <div className="space-y-1">
              <label className="text-[9px] font-bold uppercase tracking-widest text-slate-600">Tax</label>
              <input type="number" value={fields.tax||""} onChange={e=>setFields(f=>({...f,tax:parseFloat(e.target.value)||0}))}
                placeholder="0.00" className={inputCls}/>
            </div>
            <div className="space-y-1">
              <label className="text-[9px] font-bold uppercase tracking-widest text-slate-600">Payment Method</label>
              <select value={fields.paymentMethod} onChange={e=>setFields(f=>({...f,paymentMethod:e.target.value}))}
                className={cn(inputCls, "[&>option]:bg-[#111820]")}>
                <option value="">Select...</option>
                <option value="cash">Cash</option>
                <option value="card">Card</option>
                <option value="transfer">Bank Transfer</option>
                <option value="cheque">Cheque</option>
              </select>
            </div>
          </div>

          {/* Total */}
          <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 px-4 py-3 flex items-center justify-between">
            <div>
              <div className="text-[9px] font-bold uppercase tracking-widest text-emerald-600 mb-1">Total Amount</div>
              <input type="number" value={fields.amount||""}
                onChange={e=>setFields(f=>({...f,amount:parseFloat(e.target.value)||0}))}
                placeholder="0.00"
                className="bg-transparent text-2xl font-bold text-emerald-400 outline-none w-40 placeholder-emerald-800"/>
            </div>
            {aiPowered && fields.confidence > 0 && (
              <div className={cn("text-[10px] font-bold px-2 py-1 rounded-full",
                fields.confidence > 0.8 ? "bg-emerald-500/15 text-emerald-400" :
                fields.confidence > 0.6 ? "bg-amber-500/15 text-amber-400" : "bg-red-500/15 text-red-400")}>
                {Math.round(fields.confidence*100)}% AI
              </div>
            )}
          </div>

          {/* Line items */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-[9px] font-bold uppercase tracking-widest text-slate-600">Line Items</div>
              <button onClick={addLineItem}
                className="flex items-center gap-1 text-[10px] text-cyan-500 hover:text-cyan-400 transition-colors">
                <Plus size={11}/> Add item
              </button>
            </div>
            {(fields.lineItems||[]).length === 0 && (
              <div className="text-[10px] text-slate-700 text-center py-2">No line items extracted â€” add manually if needed</div>
            )}
            {(fields.lineItems||[]).map((item, i) => (
              <div key={i} className="grid grid-cols-12 gap-1.5 items-center">
                <input value={item.description} onChange={e=>updateLineItem(i,"description",e.target.value)}
                  placeholder="Description" className={cn(inputCls,"col-span-5 text-xs py-1.5")}/>
                <input type="number" value={item.quantity||""} onChange={e=>updateLineItem(i,"quantity",e.target.value)}
                  placeholder="Qty" className={cn(inputCls,"col-span-2 text-xs py-1.5")}/>
                <input type="number" value={item.unitPrice||""} onChange={e=>updateLineItem(i,"unitPrice",e.target.value)}
                  placeholder="Price" className={cn(inputCls,"col-span-2 text-xs py-1.5")}/>
                <input type="number" value={item.amount||""} onChange={e=>updateLineItem(i,"amount",e.target.value)}
                  placeholder="Total" className={cn(inputCls,"col-span-2 text-xs py-1.5")}/>
                <button onClick={()=>removeLineItem(i)} className="col-span-1 flex justify-center text-red-500/50 hover:text-red-400 transition-colors">
                  <Trash2 size={13}/>
                </button>
              </div>
            ))}
          </div>

          <div className="flex gap-2 pt-1">
            <button onClick={()=>setStep("crop")} className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-white/[0.08] text-xs text-slate-400 hover:text-slate-300 transition-colors">
              <RefreshCw size={12}/> Rescan
            </button>
            <button onClick={handleUseData} className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs text-white font-semibold transition-colors">
              <Check size={12}/> Use This Data
            </button>
          </div>
        </div>
      )}

      <button onClick={onCancel} className="w-full py-1.5 text-[11px] text-slate-700 hover:text-slate-500 transition-colors">Cancel</button>
    </div>
  );
}
