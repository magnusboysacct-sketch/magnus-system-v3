// src/components/MagnusScanner.tsx
// Unified document scanner — ID, Receipt, Invoice
// Uses Magnus OCR Engine v2 — no external API costs
// Advanced preprocessing: adaptive threshold, unsharp mask, multi-pass OCR

import React, { useRef, useState, useEffect, useCallback } from "react";
import { Camera, Upload, ScanLine, Check, X, RefreshCw, Move, Layers } from "lucide-react";
import { performOCR, type OCRResult } from "../lib/magnusOCR";

export type ScanMode = "id" | "receipt" | "invoice" | "document";

export interface ScanResult {
  mode: ScanMode;
  firstName?: string; middleName?: string; lastName?: string; fullName?: string;
  idNumber?: string; dateOfBirth?: string; expiryDate?: string; address?: string;
  documentType?: string; vendor?: string; amount?: number; date?: string;
  receiptNumber?: string; tax?: number; rawText?: string; confidence: number;
  allFields: Record<string, string>;
}

interface MagnusScannerProps {
  mode: ScanMode;
  title?: string;
  onResult: (result: ScanResult) => void;
  onCancel: () => void;
  showCropBox?: boolean;
}

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

const FIELD_LABELS: Record<ScanMode, { key: string; label: string; full?: boolean }[]> = {
  id: [
    { key:"firstName",   label:"First Name" },
    { key:"middleName",  label:"Middle Name" },
    { key:"lastName",    label:"Last Name / Surname" },
    { key:"idNumber",    label:"ID Number" },
    { key:"dateOfBirth", label:"Date of Birth" },
    { key:"expiryDate",  label:"Expiry Date" },
    { key:"address",     label:"Address", full:true },
  ],
  receipt: [
    { key:"vendor",        label:"Vendor / Store" },
    { key:"receiptNumber", label:"Receipt #" },
    { key:"date",          label:"Date" },
    { key:"amount",        label:"Total Amount" },
    { key:"tax",           label:"Tax" },
  ],
  invoice: [
    { key:"vendor",        label:"Supplier" },
    { key:"receiptNumber", label:"Invoice #" },
    { key:"date",          label:"Date" },
    { key:"amount",        label:"Total Amount" },
    { key:"tax",           label:"Tax" },
    { key:"address",       label:"Address", full:true },
  ],
  document: [
    { key:"fullName",      label:"Name" },
    { key:"date",          label:"Date" },
    { key:"amount",        label:"Amount" },
    { key:"receiptNumber", label:"Reference #" },
    { key:"address",       label:"Address", full:true },
  ],
};

const MODE_COLORS: Record<ScanMode, string> = {
  id:       "from-blue-500/10 to-cyan-500/10 border-cyan-500/20",
  receipt:  "from-emerald-500/10 to-cyan-500/10 border-emerald-500/20",
  invoice:  "from-amber-500/10 to-orange-500/10 border-amber-500/20",
  document: "from-violet-500/10 to-blue-500/10 border-violet-500/20",
};

async function cropFile(
  img: HTMLImageElement, container: HTMLDivElement,
  box: { x:number; y:number; w:number; h:number }
): Promise<File> {
  const cW = container.offsetWidth, cH = container.offsetHeight;
  const ir = img.naturalWidth / img.naturalHeight;
  const cr = cW / cH;
  let dW, dH, oX, oY;
  if (ir > cr) { dW=cW; dH=cW/ir; oX=0; oY=(cH-dH)/2; }
  else          { dH=cH; dW=cH*ir; oX=(cW-dW)/2; oY=0; }

  const bpX=(box.x/100)*cW-oX, bpY=(box.y/100)*cH-oY;
  const bpW=(box.w/100)*cW,     bpH=(box.h/100)*cH;
  const sX=img.naturalWidth/dW, sY=img.naturalHeight/dH;
  const sx=Math.max(0,bpX*sX), sy=Math.max(0,bpY*sY);
  const sw=Math.min(img.naturalWidth-sx,bpW*sX), sh=Math.min(img.naturalHeight-sy,bpH*sY);

  const MAX=2000, scale=Math.min(MAX/sw,MAX/sh,1);
  const canvas=document.createElement("canvas");
  canvas.width=Math.round(sw*scale); canvas.height=Math.round(sh*scale);
  canvas.getContext("2d")!.drawImage(img,sx,sy,sw,sh,0,0,canvas.width,canvas.height);
  const blob = await new Promise<Blob>((res,rej)=>canvas.toBlob(b=>b?res(b):rej(new Error("blob")),"image/jpeg",0.95));
  return new File([blob],"scan.jpg",{type:"image/jpeg"});
}


// ─── Zoom Preview ─────────────────────────────────────────────────────────────
// Shows enlarged version of the crop box so user can verify content before scanning

function ZoomPreview({
  imageSrc, box, containerRef, imgRef
}: {
  imageSrc: string;
  box: { x: number; y: number; w: number; h: number };
  containerRef: React.RefObject<HTMLDivElement>;
  imgRef: React.RefObject<HTMLImageElement>;
}) {
  const previewRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!previewRef.current || !imgRef.current || !containerRef.current) return;
    const img = imgRef.current;
    const container = containerRef.current;
    const canvas = previewRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx || !img.naturalWidth) return;

    // Calculate displayed image bounds (object-contain)
    const cW = container.offsetWidth;
    const cH = container.offsetHeight;
    const ir = img.naturalWidth / img.naturalHeight;
    const cr = cW / cH;
    let dW, dH, oX, oY;
    if (ir > cr) { dW=cW; dH=cW/ir; oX=0; oY=(cH-dH)/2; }
    else          { dH=cH; dW=cH*ir; oX=(cW-dW)/2; oY=0; }

    // Box in pixel coords
    const bpX = (box.x/100)*cW - oX;
    const bpY = (box.y/100)*cH - oY;
    const bpW = (box.w/100)*cW;
    const bpH = (box.h/100)*cH;

    // Convert to natural image coords
    const sX = img.naturalWidth / dW;
    const sY = img.naturalHeight / dH;
    const sx = Math.max(0, bpX * sX);
    const sy = Math.max(0, bpY * sY);
    const sw = Math.min(img.naturalWidth  - sx, bpW * sX);
    const sh = Math.min(img.naturalHeight - sy, bpH * sY);

    // Draw zoomed crop into preview canvas
    canvas.width  = canvas.offsetWidth  * 2; // retina
    canvas.height = canvas.offsetHeight * 2;
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  }, [box, imageSrc]);

  return (
    <div className="space-y-1">
      <div className="text-[9px] font-bold uppercase tracking-widest text-slate-600 flex items-center gap-1.5">
        <span className="w-1.5 h-1.5 rounded-full bg-cyan-500 animate-pulse"/>
        Zoom Preview — what will be scanned
      </div>
      <div className="relative rounded-xl overflow-hidden border border-cyan-500/20 bg-black" style={{ height: 140 }}>
        <canvas
          ref={previewRef}
          className="w-full h-full object-contain"
          style={{ imageRendering: "auto" }}
        />
        <div className="absolute bottom-1.5 right-1.5 text-[9px] text-cyan-500/60 font-mono">ZOOMED</div>
      </div>
    </div>
  );
}

export function MagnusScanner({ mode, title, onResult, onCancel, showCropBox=true }: MagnusScannerProps) {
  const fileInputRef   = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const containerRef   = useRef<HTMLDivElement>(null);
  const imgRef         = useRef<HTMLImageElement>(null);

  const [step, setStep]         = useState<"upload"|"crop"|"scanning"|"review">("upload");
  const [imageSrc, setImageSrc] = useState<string|null>(null);
  const [error, setError]       = useState<string|null>(null);
  const [progress, setProgress] = useState("");
  const [box, setBox]           = useState({x:5,y:10,w:90,h:75});
  const [fields, setFields]     = useState<Record<string,string>>({});
  const [passes, setPasses]     = useState(0);
  const dragging = useRef<{type:string;startX:number;startY:number;startBox:typeof box}|null>(null);

  useEffect(()=>{ if(mode==="id") setBox({x:5,y:10,w:90,h:75}); else setBox({x:3,y:3,w:94,h:94}); },[mode]);

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return; e.target.value="";
    setImageSrc(URL.createObjectURL(file)); setStep("crop"); setError(null);
  }

  async function runOCR(file: File) {
    setStep("scanning"); setPasses(0);
    try {
      let passCount = 0;
      const result = await performOCR(file, (msg) => {
        setProgress(msg);
        if (msg.includes("pass")) setPasses(++passCount);
      });
      // Map result to editable fields
      const f: Record<string,string> = {};
      FIELD_LABELS[mode].forEach(({key})=>{
        const val = (result as any)[key];
        f[key] = val!=null ? String(val) : "";
      });
      setFields(f);
      setStep("review");
    } catch(e:any) {
      setError("Scan failed: "+(e.message||"Unknown error"));
      setStep("crop");
    }
    setProgress("");
  }

  async function cropAndScan() {
    if (!imgRef.current || !containerRef.current) return;
    try {
      const file = await cropFile(imgRef.current, containerRef.current, box);
      await runOCR(file);
    } catch(e:any) {
      setError("Crop failed: "+e.message);
      setStep("crop");
    }
  }

  function handleUseData() {
    const result: ScanResult = {
      mode, confidence: 0.9, allFields: fields,
      firstName:     fields.firstName,
      middleName:    fields.middleName,
      lastName:      fields.lastName,
      fullName:      fields.fullName || [fields.firstName,fields.middleName,fields.lastName].filter(Boolean).join(" "),
      idNumber:      fields.idNumber,
      dateOfBirth:   fields.dateOfBirth,
      expiryDate:    fields.expiryDate,
      address:       fields.address,
      vendor:        fields.vendor,
      amount:        fields.amount ? parseFloat(fields.amount) : undefined,
      date:          fields.date,
      receiptNumber: fields.receiptNumber,
      tax:           fields.tax ? parseFloat(fields.tax) : undefined,
    };
    onResult(result);
  }

  function reset() { setImageSrc(null); setError(null); setProgress(""); setStep("upload"); setFields({}); setPasses(0); }

  // Drag
  function getPos(e: React.MouseEvent|React.TouchEvent) {
    const rect=containerRef.current!.getBoundingClientRect();
    const cx="touches"in e?e.touches[0].clientX:e.clientX;
    const cy="touches"in e?e.touches[0].clientY:e.clientY;
    return{x:((cx-rect.left)/rect.width)*100,y:((cy-rect.top)/rect.height)*100};
  }
  function onPD(e:React.MouseEvent|React.TouchEvent,type:string){e.preventDefault();e.stopPropagation();const p=getPos(e);dragging.current={type,startX:p.x,startY:p.y,startBox:{...box}};}
  const onPM=useCallback((e:MouseEvent|TouchEvent)=>{
    if(!dragging.current||!containerRef.current)return;
    const rect=containerRef.current.getBoundingClientRect();
    const cx="touches"in e?(e as TouchEvent).touches[0].clientX:(e as MouseEvent).clientX;
    const cy="touches"in e?(e as TouchEvent).touches[0].clientY:(e as MouseEvent).clientY;
    const dx=((cx-rect.left)/rect.width)*100-dragging.current.startX;
    const dy=((cy-rect.top)/rect.height)*100-dragging.current.startY;
    const sb=dragging.current.startBox; const MIN=15;
    setBox(()=>{
      let{x,y,w,h}=sb;
      switch(dragging.current!.type){
        case"move":x=Math.max(0,Math.min(100-w,x+dx));y=Math.max(0,Math.min(100-h,y+dy));break;
        case"se":w=Math.max(MIN,Math.min(100-x,w+dx));h=Math.max(MIN,Math.min(100-y,h+dy));break;
        case"sw":x=Math.min(sb.x+sb.w-MIN,x+dx);w=Math.max(MIN,w-dx);h=Math.max(MIN,Math.min(100-y,h+dy));break;
        case"ne":w=Math.max(MIN,Math.min(100-x,w+dx));y=Math.min(sb.y+sb.h-MIN,y+dy);h=Math.max(MIN,h-dy);break;
        case"nw":x=Math.min(sb.x+sb.w-MIN,x+dx);w=Math.max(MIN,w-dx);y=Math.min(sb.y+sb.h-MIN,y+dy);h=Math.max(MIN,h-dy);break;
        case"n":y=Math.min(sb.y+sb.h-MIN,y+dy);h=Math.max(MIN,h-dy);break;
        case"s":h=Math.max(MIN,Math.min(100-y,h+dy));break;
        case"e":w=Math.max(MIN,Math.min(100-x,w+dx));break;
        case"w":x=Math.min(sb.x+sb.w-MIN,x+dx);w=Math.max(MIN,w-dx);break;
      }
      return{x,y,w,h};
    });
  },[]);
  const onPU=useCallback(()=>{dragging.current=null;},[]);
  useEffect(()=>{
    window.addEventListener("mousemove",onPM);window.addEventListener("mouseup",onPU);
    window.addEventListener("touchmove",onPM,{passive:false});window.addEventListener("touchend",onPU);
    return()=>{window.removeEventListener("mousemove",onPM);window.removeEventListener("mouseup",onPU);
    window.removeEventListener("touchmove",onPM);window.removeEventListener("touchend",onPU);};
  },[onPM,onPU]);

  const H="absolute w-5 h-5 bg-cyan-400 border-2 border-white rounded z-20 touch-none cursor-pointer";

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className={cn("flex items-center gap-2.5 rounded-lg bg-gradient-to-r border px-3 py-2.5", MODE_COLORS[mode])}>
        <ScanLine size={14} className="text-cyan-400 flex-shrink-0"/>
        <div>
          <div className="text-xs font-semibold text-slate-200">{title || `Magnus ${mode.toUpperCase()} Scanner`}</div>
          <div className="text-[10px] text-slate-500">
            {step==="upload"   && "Upload or photograph your document."}
            {step==="crop"     && "Frame the document tightly in the box, then tap Scan."}
            {step==="scanning" && progress}
            {step==="review"   && "Review extracted fields — edit anything incorrect."}
          </div>
        </div>
        {step==="scanning" && passes > 0 && (
          <div className="ml-auto flex items-center gap-1 text-[10px] text-cyan-500">
            <Layers size={11}/> {passes} passes
          </div>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2 text-xs text-red-300">
          <X size={12}/>{error}<button onClick={reset} className="ml-auto underline">Retry</button>
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

      {/* Crop / Scan */}
      {(step==="crop"||step==="scanning") && imageSrc && (
        <div className="space-y-2">
          <div ref={containerRef} className="relative w-full rounded-xl overflow-hidden bg-black select-none" style={{height:300}}>
            <img ref={imgRef} src={imageSrc} alt="doc" className="w-full h-full object-contain pointer-events-none" draggable={false}/>

            {step==="crop" && showCropBox && (
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
                  {[["nw","-top-2.5 -left-2.5"],["ne","-top-2.5 -right-2.5"],["sw","-bottom-2.5 -left-2.5"],["se","-bottom-2.5 -right-2.5"],
                    ["n","-top-2.5 left-1/2 -translate-x-1/2"],["s","-bottom-2.5 left-1/2 -translate-x-1/2"],
                    ["w","top-1/2 -translate-y-1/2 -left-2.5"],["e","top-1/2 -translate-y-1/2 -right-2.5"]
                  ].map(([d,c])=>(
                    <div key={d} className={cn(H,c)} onMouseDown={e=>{e.stopPropagation();onPD(e,d)}} onTouchStart={e=>{e.stopPropagation();onPD(e,d)}}/>
                  ))}
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="bg-black/50 rounded-full p-1.5"><Move size={14} className="text-cyan-300"/></div>
                  </div>
                </div>
              </>
            )}

            {step==="scanning" && (
              <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center gap-3">
                <div className="relative w-14 h-14">
                  <div className="absolute inset-0 border-2 border-cyan-500/20 border-t-cyan-500 rounded-full animate-spin"/>
                  <div className="absolute inset-2 border-2 border-cyan-500/10 border-b-cyan-400 rounded-full animate-spin" style={{animationDirection:"reverse",animationDuration:"0.8s"}}/>
                  <ScanLine size={18} className="absolute inset-0 m-auto text-cyan-400"/>
                </div>
                <div className="text-center px-4">
                  <div className="text-sm text-cyan-300 font-medium">{progress}</div>
                  <div className="text-[10px] text-slate-600 mt-1">Magnus OCR Engine — multi-pass processing</div>
                </div>
              </div>
            )}
          </div>

          {step==="crop" && (
            <>
              <p className="text-[10px] text-slate-600 text-center">Drag corners to resize · Drag inside to move · Frame document tightly</p>
              <div className="flex gap-2">
                <button onClick={reset} className="px-4 py-2 rounded-lg border border-white/[0.08] text-xs text-slate-400 hover:text-slate-300 transition-colors">← Change</button>
                <button onClick={cropAndScan} className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-xs text-white font-semibold transition-colors">
                  <ScanLine size={13}/> Scan Document
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Review */}
      {step==="review" && (
        <div className="space-y-3">
          <div className="text-[10px] font-bold uppercase tracking-widest text-slate-600">Extracted — Edit if needed</div>
          <div className="grid grid-cols-2 gap-2">
            {FIELD_LABELS[mode].map(({key,label,full})=>(
              <div key={key} className={cn("space-y-1",full&&"col-span-2")}>
                <label className="text-[9px] font-bold uppercase tracking-widest text-slate-600">{label}</label>
                <input value={fields[key]||""} onChange={e=>setFields(f=>({...f,[key]:e.target.value}))}
                  placeholder={`${label}...`}
                  className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-700 outline-none focus:border-cyan-500/50 transition-colors"/>
              </div>
            ))}
          </div>
          {(mode==="receipt"||mode==="invoice") && fields.amount && parseFloat(fields.amount)>0 && (
            <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-3 py-2 flex items-center justify-between">
              <span className="text-[10px] text-emerald-400 font-semibold">Total</span>
              <span className="text-lg font-bold text-emerald-300">${parseFloat(fields.amount||"0").toFixed(2)}</span>
            </div>
          )}
          <div className="flex gap-2 pt-1">
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
