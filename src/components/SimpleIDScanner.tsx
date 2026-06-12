// src/components/SimpleIDScanner.tsx
// AI-powered ID scanner — uses Claude Vision via Supabase Edge Function
// Falls back to manual entry if AI unavailable
// Crop box + zoom preview + editable fields

import React, { useRef, useState, useEffect, useCallback } from "react";
import { Camera, Upload, ScanLine, Check, X, RefreshCw, Move, Sparkles, AlertCircle } from "lucide-react";
import { aiScanID, type IDScanResult } from "../lib/magnusAI";

interface SimpleIDScannerProps {
  onResult: (result: IDScanResult, croppedFile?: File) => void;
  onCancel:  () => void;
}

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

// Crop file from image using box percentages
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
  return new File([blob], "id_scan.jpg", { type:"image/jpeg" });
}

export function SimpleIDScanner({ onResult, onCancel }: SimpleIDScannerProps) {
  const fileInputRef   = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const containerRef   = useRef<HTMLDivElement>(null);
  const imgRef         = useRef<HTMLImageElement>(null);
  const previewRef     = useRef<HTMLCanvasElement>(null);

  const [step, setStep]         = useState<"upload"|"crop"|"scanning"|"review">("upload");
  const [imageSrc, setImageSrc] = useState<string|null>(null);
  const [error, setError]       = useState<string|null>(null);
  const [progress, setProgress] = useState("");
  const [aiPowered, setAiPowered] = useState(true);
  const [box, setBox]           = useState({ x:5, y:10, w:90, h:75 });
  const [fields, setFields]     = useState<IDScanResult>({
    firstName:"", middleName:"", lastName:"", fullName:"",
    idNumber:"", dateOfBirth:"", expiryDate:"", address:"",
    documentType:"national_id", confidence:0, aiPowered:false,
  });

  const lastCroppedFile = useRef<File | null>(null);
  const dragging = useRef<{type:string;startX:number;startY:number;startBox:typeof box}|null>(null);

  // ── Update zoom preview live ──────────────────────────────────────────────

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
    const sw = Math.min(img.naturalWidth  - sx, (box.w/100)*cW * (img.naturalWidth/dW));
    const sh = Math.min(img.naturalHeight - sy, (box.h/100)*cH * (img.naturalHeight/dH));
    canvas.width  = canvas.offsetWidth  * 2;
    canvas.height = canvas.offsetHeight * 2;
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  }, [box, step, imageSrc]);

  // ── File input ────────────────────────────────────────────────────────────

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return; e.target.value="";
    setImageSrc(URL.createObjectURL(file));
    setStep("crop"); setError(null);
  }

  // ── Drag logic ────────────────────────────────────────────────────────────

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

  // ── Scan ─────────────────────────────────────────────────────────────────

  async function cropAndScan() {
    if (!imgRef.current || !containerRef.current) return;
    setStep("scanning"); setProgress("Cropping ID area...");
    try {
      const file = await cropFile(imgRef.current, containerRef.current, box);
      lastCroppedFile.current = file;
      setProgress("AI reading ID...");
      const result = await aiScanID(file);

      if (result) {
        // AI succeeded
        setFields(result);
        setAiPowered(true);
      } else {
        // AI failed — show empty fields for manual entry
        setAiPowered(false);
        setFields({
          firstName:"", middleName:"", lastName:"", fullName:"",
          idNumber:"", dateOfBirth:"", expiryDate:"", address:"",
          documentType:"national_id", confidence:0, aiPowered:false,
        });
      }
      setStep("review");
      setProgress("");
    } catch(e:any) {
      setError("Scan failed: " + e.message);
      setStep("crop"); setProgress("");
    }
  }

  function handleUseData() {
    const result: IDScanResult = {
      ...fields,
      fullName: [fields.firstName, fields.middleName, fields.lastName].filter(Boolean).join(" ") || fields.fullName,
      aiPowered,
      confidence: aiPowered ? fields.confidence : 0.8,
    };
    onResult(result, lastCroppedFile.current || undefined);
  }

  function reset() {
    setImageSrc(null); setError(null); setProgress(""); setStep("upload");
    setFields({ firstName:"", middleName:"", lastName:"", fullName:"", idNumber:"", dateOfBirth:"", expiryDate:"", address:"", documentType:"national_id", confidence:0, aiPowered:false });
  }

  const H = "absolute w-5 h-5 bg-cyan-400 border-2 border-white rounded z-20 touch-none cursor-pointer";

  const inputCls = "w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-700 outline-none focus:border-cyan-500/50 transition-colors";

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-cyan-500/10 to-violet-500/10 border border-cyan-500/20 px-3 py-2">
        <Sparkles size={13} className="text-cyan-400 flex-shrink-0"/>
        <div>
          <div className="text-xs font-semibold text-cyan-300">Magnus AI — ID Scanner</div>
          <div className="text-[10px] text-slate-500">
            {step==="upload"   && "Upload or photograph the ID card."}
            {step==="crop"     && "Drag the box tightly around the ID, then tap Scan."}
            {step==="scanning" && progress}
            {step==="review"   && (aiPowered ? "AI extracted these fields — correct anything wrong." : "AI unavailable — please fill in the fields manually.")}
          </div>
        </div>
        {aiPowered && step==="review" && (
          <div className="ml-auto text-[9px] font-bold text-cyan-500 bg-cyan-500/10 px-2 py-0.5 rounded-full flex items-center gap-1">
            <Sparkles size={9}/> AI
          </div>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2 text-xs text-red-300">
          <X size={12}/> {error}
          <button onClick={reset} className="ml-auto underline">Retry</button>
        </div>
      )}

      {/* Upload */}
      {step==="upload" && (
        <div className="grid grid-cols-2 gap-3">
          <button onClick={()=>cameraInputRef.current?.click()}
            className="flex flex-col items-center gap-2 p-5 rounded-xl border-2 border-dashed border-white/[0.1] hover:border-cyan-500/50 hover:bg-cyan-500/10 transition-all">
            <div className="w-12 h-12 rounded-full bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center">
              <Camera size={20} className="text-cyan-400"/>
            </div>
            <div className="text-xs font-semibold text-slate-300">Take Photo</div>
            <div className="text-[10px] text-slate-600">Use camera</div>
          </button>
          <button onClick={()=>fileInputRef.current?.click()}
            className="flex flex-col items-center gap-2 p-5 rounded-xl border-2 border-dashed border-white/[0.1] hover:border-emerald-500/50 hover:bg-emerald-500/10 transition-all">
            <div className="w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
              <Upload size={20} className="text-emerald-400"/>
            </div>
            <div className="text-xs font-semibold text-slate-300">Upload Photo</div>
            <div className="text-[10px] text-slate-600">From gallery</div>
          </button>
          <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" onChange={handleFileInput} className="hidden"/>
          <input ref={fileInputRef}   type="file" accept="image/*" onChange={handleFileInput} className="hidden"/>
        </div>
      )}

      {/* Crop + Scan */}
      {(step==="crop"||step==="scanning") && imageSrc && (
        <div className="space-y-2">
          {/* Main image with crop box */}
          <div ref={containerRef} className="relative w-full rounded-xl overflow-hidden bg-black select-none" style={{height:260}}>
            <img ref={imgRef} src={imageSrc} alt="ID"
              className="w-full h-full object-contain pointer-events-none" draggable={false}
              onLoad={() => {
                // Trigger zoom preview after image loads
                if (previewRef.current) {
                  const event = new Event("resize");
                  window.dispatchEvent(event);
                }
              }}
            />

            {step==="crop" && (
              <>
                <div className="absolute inset-0 bg-black/60 pointer-events-none" style={{
                  clipPath:`polygon(0% 0%,100% 0%,100% 100%,0% 100%,0% ${box.y}%,${box.x}% ${box.y}%,${box.x}% ${box.y+box.h}%,${box.x+box.w}% ${box.y+box.h}%,${box.x+box.w}% ${box.y}%,0% ${box.y}%)`
                }}/>
                <div className="absolute border-2 border-cyan-400 z-10"
                  style={{left:`${box.x}%`,top:`${box.y}%`,width:`${box.w}%`,height:`${box.h}%`,cursor:"move"}}
                  onMouseDown={e=>onPD(e,"move")} onTouchStart={e=>onPD(e,"move")}>
                  <div className="absolute inset-0 pointer-events-none opacity-20">
                    <div className="absolute border-t border-cyan-400" style={{top:"33%",left:0,right:0}}/>
                    <div className="absolute border-t border-cyan-400" style={{top:"66%",left:0,right:0}}/>
                    <div className="absolute border-l border-cyan-400" style={{left:"33%",top:0,bottom:0}}/>
                    <div className="absolute border-l border-cyan-400" style={{left:"66%",top:0,bottom:0}}/>
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
                    <div className="bg-black/50 rounded-full p-1.5"><Move size={14} className="text-cyan-300"/></div>
                  </div>
                </div>
              </>
            )}

            {step==="scanning" && (
              <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center gap-3">
                <div className="relative w-12 h-12">
                  <div className="absolute inset-0 border-2 border-cyan-500/20 border-t-cyan-500 rounded-full animate-spin"/>
                  <div className="absolute inset-2 border-2 border-violet-500/20 border-b-violet-400 rounded-full animate-spin" style={{animationDirection:"reverse",animationDuration:"0.7s"}}/>
                  <Sparkles size={16} className="absolute inset-0 m-auto text-cyan-400"/>
                </div>
                <div className="text-center">
                  <div className="text-sm text-cyan-300 font-medium">{progress}</div>
                  <div className="text-[10px] text-slate-600 mt-0.5">Claude Vision AI</div>
                </div>
              </div>
            )}
          </div>

          {/* Zoom preview */}
          {step==="crop" && (
            <div className="space-y-1">
              <div className="text-[9px] font-bold uppercase tracking-widest text-slate-600 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-500 animate-pulse inline-block"/>
                Zoom preview — what will be scanned
              </div>
              <div className="relative rounded-xl overflow-hidden border border-cyan-500/20 bg-black" style={{height:120}}>
                <canvas ref={previewRef} className="w-full h-full" style={{imageRendering:"auto"}}/>
                <div className="absolute bottom-1 right-2 text-[9px] text-cyan-600 font-mono">ZOOMED</div>
              </div>
            </div>
          )}

          {step==="crop" && (
            <>
              <p className="text-[10px] text-slate-600 text-center">Drag corners to resize · Drag inside to move · Frame the ID card tightly</p>
              <div className="flex gap-2">
                <button onClick={reset} className="px-4 py-2 rounded-lg border border-white/[0.08] text-xs text-slate-400 hover:text-slate-300 transition-colors">← Change</button>
                <button onClick={cropAndScan} className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-gradient-to-r from-cyan-600 to-violet-600 hover:from-cyan-500 hover:to-violet-500 text-xs text-white font-semibold transition-all shadow-lg shadow-cyan-500/20">
                  <Sparkles size={13}/> Zoom & Scan with AI
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Review — editable fields */}
      {step==="review" && (
        <div className="space-y-3">
          {!aiPowered && (
            <div className="flex items-center gap-2 rounded-lg bg-amber-500/10 border border-amber-500/20 px-3 py-2 text-[11px] text-amber-300">
              <AlertCircle size={12}/> AI unavailable — fill in the fields manually
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="text-[9px] font-bold uppercase tracking-widest text-slate-600">First Name</label>
              <input value={fields.firstName} onChange={e=>setFields(f=>({...f,firstName:e.target.value}))} placeholder="FELICA" className={inputCls}/>
            </div>
            <div className="space-y-1">
              <label className="text-[9px] font-bold uppercase tracking-widest text-slate-600">Middle Name</label>
              <input value={fields.middleName} onChange={e=>setFields(f=>({...f,middleName:e.target.value}))} placeholder="EVERETT" className={inputCls}/>
            </div>
            <div className="space-y-1">
              <label className="text-[9px] font-bold uppercase tracking-widest text-slate-600">Last Name</label>
              <input value={fields.lastName} onChange={e=>setFields(f=>({...f,lastName:e.target.value}))} placeholder="GREEN" className={inputCls}/>
            </div>
            <div className="space-y-1">
              <label className="text-[9px] font-bold uppercase tracking-widest text-slate-600">ID Number</label>
              <input value={fields.idNumber} onChange={e=>setFields(f=>({...f,idNumber:e.target.value}))} placeholder="40347280" className={inputCls}/>
            </div>
            <div className="space-y-1">
              <label className="text-[9px] font-bold uppercase tracking-widest text-slate-600">Date of Birth</label>
              <input value={fields.dateOfBirth} onChange={e=>setFields(f=>({...f,dateOfBirth:e.target.value}))} placeholder="1960-12-29" className={inputCls}/>
            </div>
            <div className="space-y-1">
              <label className="text-[9px] font-bold uppercase tracking-widest text-slate-600">Expiry Date</label>
              <input value={fields.expiryDate} onChange={e=>setFields(f=>({...f,expiryDate:e.target.value}))} placeholder="2031-12-31" className={inputCls}/>
            </div>
            <div className="space-y-1 col-span-2">
              <label className="text-[9px] font-bold uppercase tracking-widest text-slate-600">Address</label>
              <input value={fields.address} onChange={e=>setFields(f=>({...f,address:e.target.value}))} placeholder="Portland Cottage, Clarendon" className={inputCls}/>
            </div>
          </div>

          {aiPowered && fields.confidence > 0 && (
            <div className={cn("text-[10px] text-center font-medium",
              fields.confidence > 0.8 ? "text-emerald-400" :
              fields.confidence > 0.6 ? "text-amber-400" : "text-red-400")}>
              {Math.round(fields.confidence * 100)}% AI confidence
              {fields.confidence < 0.7 && " — please verify all fields"}
            </div>
          )}

          <div className="flex gap-2">
            <button onClick={()=>setStep("crop")} className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-white/[0.08] text-xs text-slate-400 hover:text-slate-300 transition-colors">
              <RefreshCw size={12}/> Rescan
            </button>
            <button onClick={handleUseData} className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-xs text-white font-semibold transition-colors">
              <Check size={12}/> Use This Data
            </button>
          </div>
        </div>
      )}

      <button onClick={onCancel} className="w-full py-1.5 text-[11px] text-slate-700 hover:text-slate-500 transition-colors">Cancel</button>
    </div>
  );
}
