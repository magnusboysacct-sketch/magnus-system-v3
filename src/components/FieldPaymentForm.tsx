// src/components/FieldPaymentForm.tsx
// Step 1: Scan ID | Step 2: Payment | Step 3: Sign | Step 4: Receipt → Generate PDF/Image → Share
import React, { useRef, useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { useProjectContext } from "../context/ProjectContext";
import { SimpleIDScanner } from "./SimpleIDScanner";
import html2canvas from "html2canvas";
import {
  Check, X, ChevronRight, ChevronLeft,
  DollarSign, FileText, PenTool, User,
  AlertCircle, CheckCircle2, Share2, RefreshCw, 
  Mail, Printer, Image, Loader
} from "lucide-react";
import { cn } from "../components/ui";

type Step = "id_scan" | "payment" | "signature" | "receipt";

type FormData = {
  worker_name: string; worker_id_number: string; worker_phone: string;
  worker_address: string; id_photo_url: string;
  work_type: string; work_date: string;
  hours_worked: string; days_worked: string;
  rate_per_hour: string; rate_per_day: string;
  total_amount: string; payment_method: string;
  notes: string; project_id: string;
  signature_data: string; supervisor_name: string;
  rate_type: string; task_description: string;
  task_quantity: string; task_unit_rate: string;
};

const WORK_TYPES = [
  "General Labour","Mason","Carpenter","Painter","Electrician",
  "Plumber","Steel Fixer","Tiler","Welder","Equipment Operator",
  "Driver","Security","Cleaning","Landscaping","Other"
];

const PAYMENT_METHODS = [
  { value:"cash", label:"Cash" },
  { value:"bank_transfer", label:"Bank Transfer" },
  { value:"check", label:"Cheque" },
  { value:"other", label:"Other" },
];

function fmtJMD(n: number) {
  return new Intl.NumberFormat("en-US",{style:"currency",currency:"JMD",minimumFractionDigits:2}).format(n);
}function SignaturePad({ onSign, onClear }: { onSign:(data:string)=>void; onClear:()=>void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [hasSign, setHasSign] = useState(false);

  function getPos(e: MouseEvent|TouchEvent, canvas: HTMLCanvasElement) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width/rect.width;
    const scaleY = canvas.height/rect.height;
    if ("touches" in e) return { x:(e.touches[0].clientX-rect.left)*scaleX, y:(e.touches[0].clientY-rect.top)*scaleY };
    return { x:(e.clientX-rect.left)*scaleX, y:(e.clientY-rect.top)*scaleY };
  }

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    ctx.strokeStyle="#0891b2"; ctx.lineWidth=2.5; ctx.lineCap="round"; ctx.lineJoin="round";
    function start(e: MouseEvent|TouchEvent) { e.preventDefault(); drawing.current=true; const pos=getPos(e,canvas!); ctx.beginPath(); ctx.moveTo(pos.x,pos.y); }
    function move(e: MouseEvent|TouchEvent) { if(!drawing.current)return; e.preventDefault(); const pos=getPos(e,canvas!); ctx.lineTo(pos.x,pos.y); ctx.stroke(); setHasSign(true); }
    function stop() { if(!drawing.current)return; drawing.current=false; onSign(canvas!.toDataURL("image/png")); }
    canvas.addEventListener("mousedown",start); canvas.addEventListener("mousemove",move); canvas.addEventListener("mouseup",stop);
    canvas.addEventListener("touchstart",start,{passive:false}); canvas.addEventListener("touchmove",move,{passive:false}); canvas.addEventListener("touchend",stop);
    return () => {
      canvas.removeEventListener("mousedown",start); canvas.removeEventListener("mousemove",move); canvas.removeEventListener("mouseup",stop);
      canvas.removeEventListener("touchstart",start); canvas.removeEventListener("touchmove",move); canvas.removeEventListener("touchend",stop);
    };
  }, []);

  function clear() {
    const canvas=canvasRef.current!;
    canvas.getContext("2d")!.clearRect(0,0,canvas.width,canvas.height);
    setHasSign(false); onClear();
  }

  return (
    <div className="space-y-2">
      <div className="relative rounded-xl border-2 border-dashed border-cyan-500/40 bg-white dark:bg-[#060910] overflow-hidden">
        <canvas ref={canvasRef} width={600} height={200} className="w-full touch-none cursor-crosshair" style={{height:180}}/>
        {!hasSign && <div className="absolute inset-0 flex items-center justify-center pointer-events-none"><div className="text-center"><PenTool size={24} className="text-slate-700 mx-auto mb-2"/><div className="text-xs text-slate-600">Sign here</div></div></div>}
      </div>
      {hasSign && <button onClick={clear} className="flex items-center gap-1.5 text-[11px] text-slate-500 hover:text-red-400 transition-colors"><RefreshCw size={11}/> Clear signature</button>}
    </div>
  );
}

function StepBar({ step }: { step: Step }) {
  const steps = [
    {key:"id_scan",label:"Scan ID",icon:<User size={13}/>},
    {key:"payment",label:"Payment",icon:<DollarSign size={13}/>},
    {key:"signature",label:"Sign",icon:<PenTool size={13}/>},
    {key:"receipt",label:"Receipt",icon:<FileText size={13}/>},
  ];
  const idx = steps.findIndex(s=>s.key===step);
  return (
    <div className="flex items-center justify-between mb-6">
      {steps.map((s,i)=>(
        <React.Fragment key={s.key}>
          <div className="flex flex-col items-center gap-1">
            <div className={cn("w-8 h-8 rounded-full flex items-center justify-center border-2 transition-all",
              i<idx?"bg-emerald-500 border-emerald-500 text-white":i===idx?"bg-cyan-600 border-cyan-400 text-white":"bg-white/[0.04] border-white/[0.12] text-slate-600")}>
              {i<idx?<Check size={13}/>:s.icon}
            </div>
            <div className={cn("text-[9px] font-bold uppercase tracking-widest",i<=idx?"text-slate-300":"text-slate-700")}>{s.label}</div>
          </div>
          {i<steps.length-1&&<div className={cn("flex-1 h-0.5 mx-2",i<idx?"bg-emerald-500":"bg-white/[0.08]")}/>}
        </React.Fragment>
      ))}
    </div>
  );
}interface FieldPaymentFormProps { onComplete:()=>void; onCancel:()=>void; }

export function FieldPaymentForm({ onComplete, onCancel }: FieldPaymentFormProps) {
  const { projects, currentProject } = useProjectContext();
  const [step, setStep] = useState<Step>("id_scan");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string|null>(null);
  const [receiptNumber, setReceiptNumber] = useState("");
  const [companyId, setCompanyId] = useState<string|null>(null);
  const [supervisorId, setSupervisorId] = useState<string|null>(null);
  const [idPhotoFile, setIdPhotoFile] = useState<File|null>(null);
  const [company, setCompany] = useState<any>(null);
  const [showPDFModal, setShowPDFModal] = useState(false);
  const [generatingImage, setGeneratingImage] = useState(false);
  const receiptRef = useRef<HTMLDivElement>(null);

  const [form, setForm] = useState<FormData>({
    worker_name:"", worker_id_number:"", worker_phone:"",
    worker_address:"", id_photo_url:"",
    work_type:"General Labour", work_date:new Date().toISOString().split("T")[0],
    hours_worked:"", days_worked:"1", rate_per_hour:"", rate_per_day:"",
    total_amount:"", payment_method:"cash", notes:"",
    project_id:currentProject?.id||"",
    signature_data:"", supervisor_name:"",
    rate_type:"day", task_description:"",
    task_quantity:"", task_unit_rate:"",
  });

  function set(key: keyof FormData) {
    return (e: React.ChangeEvent<HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement>) =>
      setForm(f=>({...f,[key]:e.target.value}));
  }

  useEffect(()=>{
    supabase.auth.getUser().then(({data:{user}})=>{
      if(!user)return;
      setSupervisorId(user.id);
      supabase.from("user_profiles").select("company_id,full_name").eq("id",user.id).maybeSingle()
        .then(({data})=>{
          if(data?.company_id){
            setCompanyId(data.company_id);
            supabase.from("company_settings").select("company_name,logo_url,phone,email,address_line1,city,tagline")
              .eq("company_id",data.company_id).maybeSingle()
              .then(({data:cs})=>setCompany(cs));
          }
          if(data?.full_name)setForm(f=>({...f,supervisor_name:data.full_name}));
        });
    });
  },[]);

  // Auto-calculate total
  useEffect(()=>{
    if(form.rate_type==="day"){
      const days=parseFloat(form.days_worked)||0;
      const rate=parseFloat(form.rate_per_day)||0;
      if(days>0&&rate>0)setForm(f=>({...f,total_amount:(days*rate).toFixed(2)}));
    } else if(form.rate_type==="hour"){
      const hours=parseFloat(form.hours_worked)||0;
      const rate=parseFloat(form.rate_per_hour)||0;
      if(hours>0&&rate>0)setForm(f=>({...f,total_amount:(hours*rate).toFixed(2)}));
    } else if(form.rate_type==="task"){
      const qty=parseFloat(form.task_quantity)||0;
      const rate=parseFloat(form.task_unit_rate)||0;
      if(qty>0&&rate>0)setForm(f=>({...f,total_amount:(qty*rate).toFixed(2)}));
    }
  },[form.days_worked,form.rate_per_day,form.hours_worked,form.rate_per_hour,form.task_quantity,form.task_unit_rate,form.rate_type]);

  function handleIDScanResult(ocr: any) {
    const name=[ocr.firstName,ocr.middleName,ocr.lastName].filter(Boolean).join(" ");
    setForm(f=>({...f,worker_name:name||f.worker_name,worker_id_number:ocr.idNumber||ocr.documentNumber||f.worker_id_number,worker_address:ocr.address||f.worker_address}));
  }

  async function savePayment() {
    setSaving(true); setError(null);
    try {
      let idPhotoUrl=form.id_photo_url;
      if(idPhotoFile&&companyId){
        const path=`field-payments/ids/${companyId}/${Date.now()}_${form.worker_id_number||"id"}.jpg`;
        const {error:ue}=await supabase.storage.from("project-files").upload(path,idPhotoFile,{upsert:true});
        if(!ue){const {data:ud}=supabase.storage.from("project-files").getPublicUrl(path);idPhotoUrl=ud.publicUrl;}
      }
      const recNum=`FP-${new Date().getFullYear()}${String(new Date().getMonth()+1).padStart(2,"0")}-${Date.now().toString().slice(-6)}`;
      setReceiptNumber(recNum);

      const workTypeLabel = form.rate_type==="task"
        ? `Task: ${form.task_description}${form.task_quantity?` (${form.task_quantity} units)`:""}`
        : form.work_type;

      const {data:payment,error:pe}=await supabase.from("field_payments").insert({
        company_id:companyId, project_id:form.project_id||null,
        worker_name:form.worker_name.trim(), worker_id_number:form.worker_id_number.trim()||null,
        worker_phone:form.worker_phone.trim()||null, worker_address:form.worker_address.trim()||null,
        id_photo_url:idPhotoUrl||null, work_type:workTypeLabel,
        work_date:form.work_date,
        hours_worked:parseFloat(form.hours_worked)||null, days_worked:parseFloat(form.days_worked)||null,
        rate_per_hour:parseFloat(form.rate_per_hour)||null, rate_per_day:parseFloat(form.rate_per_day)||null,
        total_amount:parseFloat(form.total_amount)||0, payment_method:form.payment_method,
        notes:form.notes.trim()||null, status:"draft",
        supervisor_id:supervisorId, supervisor_name:form.supervisor_name.trim()||null,
        synced_to_finance:false,
      }).select().maybeSingle();
      if(pe)throw pe;
      if(!payment)throw new Error("Failed to create payment");
      if(form.signature_data){
        await supabase.from("field_payment_signatures").insert({
          field_payment_id:payment.id, company_id:companyId,
          signature_type:"worker", signature_data:form.signature_data,
          signed_at:new Date().toISOString(), signed_by:form.worker_name,
        });
        await supabase.from("field_payments").update({status:"signed",signed_at:new Date().toISOString()}).eq("id",payment.id);
      }
      await supabase.from("field_payment_receipts").insert({
        field_payment_id:payment.id, company_id:companyId,
        receipt_type:"payment_acknowledgment", receipt_number:recNum,
      });
      await supabase.from("expenses").insert({
        company_id:companyId, project_id:form.project_id||null,
        description:`Field Payment — ${form.worker_name} (${form.work_type})`,
        amount:parseFloat(form.total_amount)||0, expense_date:form.work_date, status:"approved",
      });
      setStep("receipt");
    } catch(e:any){ setError(e.message); }
    finally{ setSaving(false); }
  }

  // Generate image and share via WhatsApp
  async function generateImageAndWhatsApp() {
    const el = receiptRef.current; if(!el) return;
    setGeneratingImage(true);
    try {
      const canvas = await html2canvas(el, {
        scale:2, useCORS:true, backgroundColor:"#ffffff",
        logging:false, allowTaint:true,
      });
      // Download image
      const link = document.createElement("a");
      link.download = `Receipt-${receiptNumber}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
      // Open WhatsApp after short delay
      setTimeout(()=>{
        const phone = form.worker_phone?.replace(/\D/g,"");
        const msg = `Receipt #${receiptNumber} for ${form.worker_name} — ${fmtJMD(parseFloat(form.total_amount)||0)} — Please find receipt image attached.`;
        window.open(`https://wa.me/${phone?`1${phone}`:""}?text=${encodeURIComponent(msg)}`,"_blank");
      },1000);
    } catch(e){ console.error(e); }
    setGeneratingImage(false);
  }

  // Print PDF
  function printPDF() {
    const el = receiptRef.current; if(!el) return;
    const w = window.open("","_blank"); if(!w) return;
    w.document.write(`<!DOCTYPE html><html><head><title>Receipt ${receiptNumber}</title>
    <style>*{box-sizing:border-box}body{margin:0;font-family:Georgia,serif}</style></head>
    <body>${el.innerHTML}</body></html>`);
    w.document.close();
    setTimeout(()=>w.print(),500);
  }

  // Email
  function sendEmail() {
    const total=parseFloat(form.total_amount)||0;
    const subject=encodeURIComponent(`Payment Receipt - ${form.worker_name} - ${receiptNumber}`);
    const body=encodeURIComponent(
      `PAYMENT RECEIPT\n${company?.company_name||"Magnus Boys Construction"}\n${company?.address_line1||""} ${company?.city||""}\nTel: ${company?.phone||""} | ${company?.email||""}\n\n`+
      `Receipt #: ${receiptNumber}\nDate: ${new Date().toLocaleDateString()}\n\n`+
      `Worker: ${form.worker_name}\nID: ${form.worker_id_number||"—"}\n`+
      `${form.rate_type==="task"?`Task: ${form.task_description} (${form.task_quantity} units × ${fmtJMD(parseFloat(form.task_unit_rate)||0)})`:form.work_type}\n`+
      `Work Date: ${form.work_date}\nPayment: ${form.payment_method.replace("_"," ")}\n\n`+
      `TOTAL PAID: ${fmtJMD(total)}\n\nPaid by: ${form.supervisor_name} · ${new Date().toLocaleDateString()}`
    );
    window.open(`mailto:?subject=${subject}&body=${body}`,"_blank");
  }

  const totalAmount=parseFloat(form.total_amount)||0;return (
    <div className="min-h-full bg-[#080b10]">
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06] bg-[#0c1018]">
        <div>
          <div className="text-sm font-semibold text-slate-200">New Field Payment</div>
          <div className="text-[10px] text-slate-600">
            {step==="id_scan"&&"Step 1 of 4 — Scan worker ID"}
            {step==="payment"&&"Step 2 of 4 — Payment details"}
            {step==="signature"&&"Step 3 of 4 — Worker signature"}
            {step==="receipt"&&"Step 4 of 4 — Receipt"}
          </div>
        </div>
        <button onClick={onCancel} className="p-1.5 rounded-lg hover:bg-white/10 text-slate-600 hover:text-slate-300"><X size={16}/></button>
      </div>

      <div className="p-4 max-w-lg mx-auto">
        <StepBar step={step}/>

        {error&&<div className="mb-4 flex items-center gap-2 rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2.5 text-xs text-red-300"><AlertCircle size={13}/>{error}<button onClick={()=>setError(null)} className="ml-auto"><X size={11}/></button></div>}

        {/* ── STEP 1: ID SCAN ── */}
        {step==="id_scan"&&(
          <div className="space-y-4">
            <SimpleIDScanner onResult={handleIDScanResult} onCancel={()=>{}}/>
            <div className="border-t border-white/[0.06] pt-4">
              <div className="text-[10px] font-bold uppercase tracking-widest text-slate-600 mb-3">Worker Details {form.worker_name&&<span className="text-emerald-400 ml-2">✓ Auto-filled</span>}</div>
              <div className="space-y-3">
                <div><label className="text-[9px] font-bold uppercase tracking-widest text-slate-600 block mb-1">Full Name *</label>
                  <input value={form.worker_name} onChange={set("worker_name")} placeholder="Worker full name" className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-700 outline-none focus:border-cyan-500/50"/></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="text-[9px] font-bold uppercase tracking-widest text-slate-600 block mb-1">ID Number</label>
                    <input value={form.worker_id_number} onChange={set("worker_id_number")} placeholder="National ID #" className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-700 outline-none focus:border-cyan-500/50"/></div>
                  <div><label className="text-[9px] font-bold uppercase tracking-widest text-slate-600 block mb-1">Phone</label>
                    <input value={form.worker_phone} onChange={set("worker_phone")} placeholder="876-xxx-xxxx" className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-700 outline-none focus:border-cyan-500/50"/></div>
                </div>
                <div><label className="text-[9px] font-bold uppercase tracking-widest text-slate-600 block mb-1">Address</label>
                  <input value={form.worker_address} onChange={set("worker_address")} placeholder="Worker address" className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-700 outline-none focus:border-cyan-500/50"/></div>
              </div>
            </div>
            <button onClick={()=>setStep("payment")} disabled={!form.worker_name.trim()}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-sm text-white font-semibold">
              Continue <ChevronRight size={16}/>
            </button>
          </div>
        )}

        {/* ── STEP 2: PAYMENT ── */}
        {step==="payment"&&(
          <div className="space-y-4">
            <div className="flex items-center gap-3 rounded-xl bg-white/[0.03] border border-white/[0.06] p-3">
              <div className="w-10 h-10 rounded-full bg-cyan-500/20 flex items-center justify-center text-sm font-bold text-cyan-300">{form.worker_name.split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase()}</div>
              <div><div className="text-sm font-semibold text-slate-200">{form.worker_name}</div>{form.worker_id_number&&<div className="text-[10px] text-slate-600">ID: {form.worker_id_number}</div>}</div>
              <button onClick={()=>setStep("id_scan")} className="ml-auto text-[10px] text-cyan-500">Edit</button>
            </div>
            <div className="space-y-3">
              <div><label className="text-[9px] font-bold uppercase tracking-widest text-slate-600 block mb-1">Project</label>
                <select value={form.project_id} onChange={set("project_id")} className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-slate-200 outline-none [&>option]:bg-[#111820]">
                  <option value="">No project</option>{projects.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></div>

              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-[9px] font-bold uppercase tracking-widest text-slate-600 block mb-1">Work Type</label>
                  <select value={form.work_type} onChange={set("work_type")} className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-slate-200 outline-none [&>option]:bg-[#111820]">
                    {WORK_TYPES.map(w=><option key={w} value={w}>{w}</option>)}</select></div>
                <div><label className="text-[9px] font-bold uppercase tracking-widest text-slate-600 block mb-1">Work Date</label>
                  <input type="date" value={form.work_date} onChange={set("work_date")} className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-slate-200 outline-none"/></div>
              </div>

              {/* Payment Type */}
              <div><label className="text-[9px] font-bold uppercase tracking-widest text-slate-600 block mb-2">Payment Type</label>
                <div className="grid grid-cols-3 gap-2">
                  {[{v:"day",l:"By Day"},{v:"hour",l:"By Hour"},{v:"task",l:"By Task"}].map(t=>(
                    <button key={t.v} onClick={()=>setForm(f=>({...f,rate_type:t.v,total_amount:""}))}
                      className={cn("py-2.5 rounded-lg text-xs font-bold border transition",form.rate_type===t.v?"bg-cyan-500/20 border-cyan-500/40 text-cyan-300":"bg-white/[0.03] border-white/[0.07] text-slate-500 hover:border-white/[0.14]")}>
                      {t.l}</button>))}</div></div>

              {/* By Day */}
              {form.rate_type==="day"&&(
                <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="text-[9px] font-bold uppercase tracking-widest text-slate-600 block mb-1">Number of Days</label>
                      <input type="number" value={form.days_worked} onChange={set("days_worked")} placeholder="1"
                        className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2.5 text-sm text-slate-200 placeholder-slate-700 outline-none focus:border-cyan-500/50"/></div>
                    <div><label className="text-[9px] font-bold uppercase tracking-widest text-slate-600 block mb-1">Rate per Day (JMD)</label>
                      <input type="number" value={form.rate_per_day} onChange={set("rate_per_day")} placeholder="0.00"
                        className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2.5 text-sm text-slate-200 placeholder-slate-700 outline-none focus:border-cyan-500/50"/></div>
                  </div>
                  {form.days_worked&&form.rate_per_day&&<div className="text-xs text-slate-500 text-center">{form.days_worked} days × {fmtJMD(parseFloat(form.rate_per_day)||0)} = <span className="text-emerald-400 font-bold text-sm">{fmtJMD(totalAmount)}</span></div>}
                </div>
              )}

              {/* By Hour */}
              {form.rate_type==="hour"&&(
                <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="text-[9px] font-bold uppercase tracking-widest text-slate-600 block mb-1">Number of Hours</label>
                      <input type="number" value={form.hours_worked} onChange={set("hours_worked")} placeholder="0"
                        className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2.5 text-sm text-slate-200 placeholder-slate-700 outline-none focus:border-cyan-500/50"/></div>
                    <div><label className="text-[9px] font-bold uppercase tracking-widest text-slate-600 block mb-1">Rate per Hour (JMD)</label>
                      <input type="number" value={form.rate_per_hour} onChange={set("rate_per_hour")} placeholder="0.00"
                        className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2.5 text-sm text-slate-200 placeholder-slate-700 outline-none focus:border-cyan-500/50"/></div>
                  </div>
                  {form.hours_worked&&form.rate_per_hour&&<div className="text-xs text-slate-500 text-center">{form.hours_worked} hrs × {fmtJMD(parseFloat(form.rate_per_hour)||0)} = <span className="text-emerald-400 font-bold text-sm">{fmtJMD(totalAmount)}</span></div>}
                </div>
              )}

              {/* By Task */}
              {form.rate_type==="task"&&(
                <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3 space-y-3">
                  <div><label className="text-[9px] font-bold uppercase tracking-widest text-slate-600 block mb-1">Task Description *</label>
                    <input value={form.task_description} onChange={set("task_description")} placeholder="e.g. Lay blocks, Paint rooms, Pour foundation..."
                      className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2.5 text-sm text-slate-200 placeholder-slate-700 outline-none focus:border-cyan-500/50"/></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="text-[9px] font-bold uppercase tracking-widest text-slate-600 block mb-1">Quantity / Units</label>
                      <input type="number" value={form.task_quantity} onChange={set("task_quantity")} placeholder="e.g. 100"
                        className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2.5 text-sm text-slate-200 placeholder-slate-700 outline-none focus:border-cyan-500/50"/></div>
                    <div><label className="text-[9px] font-bold uppercase tracking-widest text-slate-600 block mb-1">Rate per Unit (JMD)</label>
                      <input type="number" value={form.task_unit_rate} onChange={set("task_unit_rate")} placeholder="e.g. 18"
                        className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2.5 text-sm text-slate-200 placeholder-slate-700 outline-none focus:border-cyan-500/50"/></div>
                  </div>
                  {form.task_quantity&&form.task_unit_rate&&<div className="text-xs text-slate-500 text-center">{form.task_quantity} units × {fmtJMD(parseFloat(form.task_unit_rate)||0)} = <span className="text-emerald-400 font-bold text-sm">{fmtJMD(totalAmount)}</span></div>}
                  <div><label className="text-[9px] font-bold uppercase tracking-widest text-slate-600 block mb-1">Total Amount (JMD)</label>
                    <input type="number" value={form.total_amount} onChange={set("total_amount")} placeholder="0.00"
                      className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-3 text-xl font-bold text-emerald-400 placeholder-slate-700 outline-none"/></div>
                </div>
              )}

              <div><label className="text-[9px] font-bold uppercase tracking-widest text-slate-600 block mb-1">Payment Method</label>
                <div className="grid grid-cols-4 gap-2">{PAYMENT_METHODS.map(m=>(
                  <button key={m.value} onClick={()=>setForm(f=>({...f,payment_method:m.value}))}
                    className={cn("py-2 rounded-lg text-[11px] font-semibold border transition",form.payment_method===m.value?"bg-cyan-500/20 border-cyan-500/40 text-cyan-300":"bg-white/[0.03] border-white/[0.07] text-slate-500")}>
                    {m.label}</button>))}</div></div>

              <div><label className="text-[9px] font-bold uppercase tracking-widest text-slate-600 block mb-1">Notes (optional)</label>
                <textarea value={form.notes} onChange={set("notes") as any} rows={2} placeholder="Additional notes..." className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-700 outline-none resize-none"/></div>
            </div>
            <div className="flex gap-3">
              <button onClick={()=>setStep("id_scan")} className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-white/[0.08] text-sm text-slate-400"><ChevronLeft size={15}/> Back</button>
              <button onClick={()=>setStep("signature")} disabled={!form.total_amount}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-sm text-white font-semibold">
                Continue to Signature <ChevronRight size={15}/></button>
            </div>
          </div>
        )}

        {/* ── STEP 3: SIGNATURE ── */}
        {step==="signature"&&(
          <div className="space-y-4">
            <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-4">
              <div className="text-[10px] font-bold uppercase tracking-widest text-emerald-600 mb-2">Payment Summary</div>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold text-slate-200">{form.worker_name}</div>
                  <div className="text-[10px] text-slate-500">
                    {form.rate_type==="task"?form.task_description:form.work_type} · {form.work_date}
                  </div>
                  {form.rate_type==="day"&&<div className="text-[10px] text-slate-600">{form.days_worked} days × {fmtJMD(parseFloat(form.rate_per_day)||0)}</div>}
                  {form.rate_type==="hour"&&<div className="text-[10px] text-slate-600">{form.hours_worked} hrs × {fmtJMD(parseFloat(form.rate_per_hour)||0)}</div>}
                  {form.rate_type==="task"&&<div className="text-[10px] text-slate-600">{form.task_quantity} units × {fmtJMD(parseFloat(form.task_unit_rate)||0)}</div>}
                </div>
                <div className="text-2xl font-bold text-emerald-400">{fmtJMD(totalAmount)}</div>
              </div>
            </div>
            <div>
              <div className="text-xs font-semibold text-slate-300 mb-2 flex items-center gap-2"><PenTool size={13} className="text-cyan-400"/>Worker Signature</div>
              <div className="text-[10px] text-slate-600 mb-3">I acknowledge receiving the above payment for work performed.</div>
              <SignaturePad onSign={data=>setForm(f=>({...f,signature_data:data}))} onClear={()=>setForm(f=>({...f,signature_data:""}))}/>
            </div>
            <div><label className="text-[9px] font-bold uppercase tracking-widest text-slate-600 block mb-1">Supervisor / Paid By</label>
              <input value={form.supervisor_name} onChange={set("supervisor_name")} placeholder="Your name" className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-700 outline-none"/></div>
            <div className="flex gap-3">
              <button onClick={()=>setStep("payment")} className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-white/[0.08] text-sm text-slate-400"><ChevronLeft size={15}/> Back</button>
              <button onClick={savePayment} disabled={saving}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-sm text-white font-semibold">
                {saving?<><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/>Saving...</>:<><Check size={15}/>Confirm & Save</>}
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 4: RECEIPT ── */}
        {step==="receipt"&&(
          <div className="space-y-4">
            <div className="flex items-center gap-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 p-4">
              <CheckCircle2 size={24} className="text-emerald-400 flex-shrink-0"/>
              <div><div className="text-sm font-bold text-emerald-300">Payment Recorded!</div><div className="text-[10px] text-emerald-600">Receipt #{receiptNumber}</div></div>
            </div>

            {/* Receipt — rendered for screenshot */}
            <div ref={receiptRef} style={{background:"#ffffff",borderRadius:16,padding:28,fontFamily:"Georgia,serif",color:"#1a1a1a"}}>
              {/* Company Header */}
              <div style={{textAlign:"center",borderBottom:"3px solid #1a1a1a",paddingBottom:20,marginBottom:20}}>
                {company?.logo_url&&<img src={company.logo_url} crossOrigin="anonymous" style={{width:72,height:72,borderRadius:10,objectFit:"cover",margin:"0 auto 10px",display:"block"}}/>}
                <div style={{fontSize:18,fontWeight:900,letterSpacing:2,textTransform:"uppercase"}}>{company?.company_name||"Magnus Boys Construction"}</div>
                {company?.address_line1&&<div style={{fontSize:11,color:"#666",marginTop:4}}>{company.address_line1}{company?.city?`, ${company.city}`:""}</div>}
                <div style={{fontSize:11,color:"#666"}}>{company?.phone?`Tel: ${company.phone}`:""}{company?.phone&&company?.email?" · ":""}{company?.email||""}</div>
                <div style={{fontSize:20,fontWeight:900,marginTop:14,textTransform:"uppercase",letterSpacing:4}}>Payment Receipt</div>
                <div style={{fontSize:11,color:"#666",marginTop:4}}>Receipt #{receiptNumber} · {new Date().toLocaleDateString("en-US",{month:"long",day:"numeric",year:"numeric"})}</div>
              </div>

              {/* Details */}
              <table style={{width:"100%",borderCollapse:"collapse",marginBottom:16}}>
                <tbody>
                  {[
                    ["Worker", form.worker_name],
                    form.worker_id_number?["ID Number", form.worker_id_number]:null,
                    form.worker_phone?["Phone", form.worker_phone]:null,
                    form.rate_type==="task"?["Task", form.task_description]:["Work Type", form.work_type],
                    ["Work Date", form.work_date],
                    ["Payment Method", form.payment_method.replace("_"," ").toUpperCase()],
                    form.rate_type==="day"&&form.days_worked?["Days × Rate", `${form.days_worked} days × ${fmtJMD(parseFloat(form.rate_per_day)||0)}`]:null,
                    form.rate_type==="hour"&&form.hours_worked?["Hours × Rate", `${form.hours_worked} hrs × ${fmtJMD(parseFloat(form.rate_per_hour)||0)}`]:null,
                    form.rate_type==="task"&&form.task_quantity?["Qty × Rate", `${form.task_quantity} units × ${fmtJMD(parseFloat(form.task_unit_rate)||0)}`]:null,
                    form.notes?["Notes", form.notes]:null,
                  ].filter(Boolean).map((row:any,i:number)=>(
                    <tr key={i} style={{borderBottom:"1px solid #f0f0f0"}}>
                      <td style={{padding:"7px 10px",color:"#666",fontSize:12,width:150}}>{row[0]}</td>
                      <td style={{padding:"7px 10px",fontSize:13,fontWeight:600,textAlign:"right",textTransform:"capitalize"}}>{row[1]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Total */}
              <div style={{borderTop:"3px solid #1a1a1a",borderBottom:"3px solid #1a1a1a",padding:"12px 10px",display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
                <span style={{fontSize:16,fontWeight:900}}>TOTAL PAID</span>
                <span style={{fontSize:24,fontWeight:900,color:"#16a34a"}}>{fmtJMD(totalAmount)}</span>
              </div>

              {/* Signature */}
              {form.signature_data&&(
                <div style={{borderTop:"1px solid #e5e7eb",paddingTop:14,marginTop:8}}>
                  <div style={{fontSize:10,color:"#999",letterSpacing:1,textTransform:"uppercase",marginBottom:6}}>Worker Signature</div>
                  <img src={form.signature_data} style={{height:56,border:"1px solid #e5e7eb",borderRadius:6,padding:4}}/>
                  <div style={{fontSize:11,color:"#666",marginTop:4}}>{form.worker_name}</div>
                </div>
              )}

              {/* Footer */}
              <div style={{borderTop:"1px solid #e5e7eb",marginTop:16,paddingTop:12,textAlign:"center",fontSize:10,color:"#999"}}>
                Paid by: {form.supervisor_name} · {new Date().toLocaleDateString()}<br/>
                {company?.company_name||"Magnus Boys Construction"}{company?.tagline?` · ${company.tagline}`:""}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4 space-y-3">
              <div className="text-[10px] font-bold uppercase tracking-widest text-slate-600 mb-2">Share Receipt</div>

              {/* Generate Image + WhatsApp */}
              <button onClick={generateImageAndWhatsApp} disabled={generatingImage}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 font-semibold transition">
                {generatingImage?<><Loader size={16} className="animate-spin"/>Generating image…</>:<><Image size={16}/>Generate Image & Send WhatsApp</>}
              </button>
              <div className="text-[10px] text-slate-700 text-center">Downloads receipt image → opens WhatsApp → attach and send</div>

              <div className="grid grid-cols-2 gap-3 pt-1">
                <button onClick={printPDF} className="flex items-center justify-center gap-2 py-2.5 rounded-xl border border-white/[0.08] hover:border-white/[0.14] text-slate-400 hover:text-slate-200 transition text-sm font-semibold">
                  <Printer size={15}/> Print / PDF
                </button>
                <button onClick={sendEmail} className="flex items-center justify-center gap-2 py-2.5 rounded-xl border border-blue-500/30 bg-blue-500/10 hover:bg-blue-500/20 text-blue-300 transition text-sm font-semibold">
                  <Mail size={15}/> Email
                </button>
              </div>
            </div>

            <button onClick={onComplete} className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-sm text-white font-semibold">
              <Check size={15}/> Done — New Payment
            </button>
          </div>
        )}
      </div>
    </div>
  );
}