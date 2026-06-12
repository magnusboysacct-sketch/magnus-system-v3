// src/components/FieldPaymentForm.tsx
// Step 1: Scan ID | Step 2: Payment | Step 3: Sign | Step 4: Receipt + PDF + WhatsApp + Email
import React, { useRef, useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { useProjectContext } from "../context/ProjectContext";
import { SimpleIDScanner } from "./SimpleIDScanner";
import {
  Check, X, ChevronRight, ChevronLeft,
  DollarSign, FileText, PenTool, User,
  AlertCircle, CheckCircle2, Share2, RefreshCw, Mail, Printer
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
    const canvas=canvasRef.current!; canvas.getContext("2d")!.clearRect(0,0,canvas.width,canvas.height);
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

  const [form, setForm] = useState<FormData>({
    worker_name:"", worker_id_number:"", worker_phone:"",
    worker_address:"", id_photo_url:"",
    work_type:"General Labour", work_date:new Date().toISOString().split("T")[0],
    hours_worked:"", days_worked:"1", rate_per_hour:"", rate_per_day:"",
    total_amount:"", payment_method:"cash", notes:"",
    project_id:currentProject?.id||"",
    signature_data:"", supervisor_name:"",
    rate_type:"day", task_description:"",
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

  useEffect(()=>{
    if(form.rate_type==="task")return;
    const days=parseFloat(form.days_worked)||0;
    const hours=parseFloat(form.hours_worked)||0;
    const rDay=parseFloat(form.rate_per_day)||0;
    const rHour=parseFloat(form.rate_per_hour)||0;
    let total=0;
    if(rDay>0&&days>0)total=rDay*days;
    if(rHour>0&&hours>0)total=rHour*hours;
    if(total>0)setForm(f=>({...f,total_amount:total.toFixed(2)}));
  },[form.days_worked,form.hours_worked,form.rate_per_day,form.rate_per_hour,form.rate_type]);

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
      const {data:payment,error:pe}=await supabase.from("field_payments").insert({
        company_id:companyId, project_id:form.project_id||null,
        worker_name:form.worker_name.trim(), worker_id_number:form.worker_id_number.trim()||null,
        worker_phone:form.worker_phone.trim()||null, worker_address:form.worker_address.trim()||null,
        id_photo_url:idPhotoUrl||null,
        work_type:form.rate_type==="task"?`Task: ${form.task_description}`:form.work_type,
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

  function downloadPDF() {
    const w=window.open("","_blank"); if(!w)return;
    const total=parseFloat(form.total_amount)||0;
    w.document.write(`<!DOCTYPE html><html><head><title>Receipt ${receiptNumber}</title>
    <style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:Georgia,serif;color:#1a1a1a;padding:40px}
    .header{text-align:center;border-bottom:3px solid #1a1a1a;padding-bottom:20px;margin-bottom:20px}
    .logo{width:72px;height:72px;border-radius:10px;object-fit:cover;margin:0 auto 10px;display:block}
    .co-name{font-size:18px;font-weight:900;letter-spacing:2px;text-transform:uppercase}
    .co-info{font-size:11px;color:#666;margin-top:4px}
    .title{font-size:22px;font-weight:900;margin:14px 0 4px;text-transform:uppercase;letter-spacing:4px}
    .ref{font-size:11px;color:#666}
    table{width:100%;border-collapse:collapse;margin:14px 0}
    td{padding:8px 12px;border-bottom:1px solid #f0f0f0;font-size:13px}
    td:first-child{color:#666;width:160px}td:last-child{font-weight:600;text-align:right}
    .total-row td{padding:12px;font-size:18px;font-weight:900;border-top:3px solid #1a1a1a;border-bottom:3px solid #1a1a1a}
    .total-row td:last-child{color:#16a34a;font-size:22px}
    .sig{margin-top:20px;border-top:1px solid #e5e7eb;padding-top:14px}
    .sig-label{font-size:10px;color:#999;letter-spacing:1px;text-transform:uppercase;margin-bottom:6px}
    .footer{margin-top:28px;text-align:center;font-size:10px;color:#999;border-top:1px solid #e5e7eb;padding-top:14px}
    @media print{body{padding:20px}}</style></head><body>
    <div class="header">
    ${company?.logo_url?`<img src="${company.logo_url}" class="logo"/>`:""}
    <div class="co-name">${company?.company_name||"Magnus Boys Construction"}</div>
    <div class="co-info">${company?.address_line1||""}${company?.city?`, ${company.city}`:""}<br/>${company?.phone?`Tel: ${company.phone}`:""}${company?.phone&&company?.email?" · ":""}${company?.email||""}</div>
    <div class="title">Payment Receipt</div>
    <div class="ref">Receipt #${receiptNumber} &nbsp;|&nbsp; ${new Date().toLocaleDateString("en-US",{month:"long",day:"numeric",year:"numeric"})}</div>
    </div>
    <table>
    <tr><td>Worker</td><td>${form.worker_name}</td></tr>
    ${form.worker_id_number?`<tr><td>ID Number</td><td>${form.worker_id_number}</td></tr>`:""}
    ${form.worker_phone?`<tr><td>Phone</td><td>${form.worker_phone}</td></tr>`:""}
    ${form.rate_type==="task"?`<tr><td>Task</td><td>${form.task_description}</td></tr>`:`<tr><td>Work Type</td><td>${form.work_type}</td></tr>`}
    <tr><td>Work Date</td><td>${form.work_date}</td></tr>
    <tr><td>Payment Method</td><td>${form.payment_method.replace("_"," ").toUpperCase()}</td></tr>
    ${form.rate_type==="day"&&form.days_worked&&form.rate_per_day?`<tr><td>Days × Rate</td><td>${form.days_worked} days × ${fmtJMD(parseFloat(form.rate_per_day))}</td></tr>`:""}
    ${form.rate_type==="hour"&&form.hours_worked&&form.rate_per_hour?`<tr><td>Hours × Rate</td><td>${form.hours_worked} hrs × ${fmtJMD(parseFloat(form.rate_per_hour))}</td></tr>`:""}
    ${form.notes?`<tr><td>Notes</td><td>${form.notes}</td></tr>`:""}
    <tr class="total-row"><td>TOTAL PAID</td><td>${fmtJMD(total)}</td></tr>
    </table>
    ${form.signature_data?`<div class="sig"><div class="sig-label">Worker Signature</div><img src="${form.signature_data}" style="height:56px;border:1px solid #e5e7eb;border-radius:6px;padding:4px"/><div style="font-size:11px;color:#666;margin-top:4px">${form.worker_name}</div></div>`:""}
    <div class="footer">Paid by: ${form.supervisor_name} &nbsp;|&nbsp; ${new Date().toLocaleDateString()}<br/>${company?.company_name||"Magnus Boys Construction"}${company?.tagline?` · ${company.tagline}`:""}</div>
    </body></html>`);
    w.document.close(); setTimeout(()=>w.print(),500);
  }

  function sendWhatsApp() {
    const total=parseFloat(form.total_amount)||0;
    const msg=`*PAYMENT RECEIPT*\n*${company?.company_name||"Magnus Boys Construction"}*\n\nReceipt #: ${receiptNumber}\nWorker: ${form.worker_name}\nID: ${form.worker_id_number||"—"}\n${form.rate_type==="task"?`Task: ${form.task_description}`:`Work: ${form.work_type}`}\nDate: ${form.work_date}\nPayment: ${form.payment_method.replace("_"," ")}\n\n*TOTAL PAID: ${fmtJMD(total)}*\n\nPaid by: ${form.supervisor_name} · ${new Date().toLocaleDateString()}\n${company?.phone||""} · ${company?.email||""}`;
    const phone=form.worker_phone?.replace(/\D/g,"");
    window.open(`https://wa.me/${phone?`1${phone}`:""}?text=${encodeURIComponent(msg)}`,"_blank");
  }

  function sendEmail() {
    const total=parseFloat(form.total_amount)||0;
    const subject=encodeURIComponent(`Payment Receipt - ${form.worker_name} - ${receiptNumber}`);
    const body=encodeURIComponent(`PAYMENT RECEIPT\n${company?.company_name||"Magnus Boys Construction"}\n${company?.address_line1||""} ${company?.city||""}\nTel: ${company?.phone||""} | ${company?.email||""}\n\nReceipt #: ${receiptNumber}\nDate: ${new Date().toLocaleDateString()}\n\nWorker: ${form.worker_name}\nID: ${form.worker_id_number||"—"}\n${form.rate_type==="task"?`Task: ${form.task_description}`:`Work Type: ${form.work_type}`}\nWork Date: ${form.work_date}\nPayment: ${form.payment_method.replace("_"," ")}\n\nTOTAL PAID: ${fmtJMD(total)}\n\nPaid by: ${form.supervisor_name} · ${new Date().toLocaleDateString()}`);
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

              <div><label className="text-[9px] font-bold uppercase tracking-widest text-slate-600 block mb-2">Payment Type</label>
                <div className="grid grid-cols-3 gap-2">
                  {[{v:"day",l:"By Day"},{v:"hour",l:"By Hour"},{v:"task",l:"By Task"}].map(t=>(
                    <button key={t.v} onClick={()=>setForm(f=>({...f,rate_type:t.v}))}
                      className={cn("py-2.5 rounded-lg text-xs font-bold border transition",form.rate_type===t.v?"bg-cyan-500/20 border-cyan-500/40 text-cyan-300":"bg-white/[0.03] border-white/[0.07] text-slate-500")}>
                      {t.l}</button>))}</div></div>

              {form.rate_type==="day"&&<div className="grid grid-cols-2 gap-3">
                <div><label className="text-[9px] font-bold uppercase tracking-widest text-slate-600 block mb-1">Days Worked</label>
                  <input type="number" value={form.days_worked} onChange={set("days_worked")} placeholder="1" className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-700 outline-none"/></div>
                <div><label className="text-[9px] font-bold uppercase tracking-widest text-slate-600 block mb-1">Rate per Day (JMD)</label>
                  <input type="number" value={form.rate_per_day} onChange={set("rate_per_day")} placeholder="0.00" className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-700 outline-none"/></div>
              </div>}

              {form.rate_type==="hour"&&<div className="grid grid-cols-2 gap-3">
                <div><label className="text-[9px] font-bold uppercase tracking-widest text-slate-600 block mb-1">Hours Worked</label>
                  <input type="number" value={form.hours_worked} onChange={set("hours_worked")} placeholder="0" className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-700 outline-none"/></div>
                <div><label className="text-[9px] font-bold uppercase tracking-widest text-slate-600 block mb-1">Rate per Hour (JMD)</label>
                  <input type="number" value={form.rate_per_hour} onChange={set("rate_per_hour")} placeholder="0.00" className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-700 outline-none"/></div>
              </div>}

              {form.rate_type==="task"&&<div className="space-y-3">
                <div><label className="text-[9px] font-bold uppercase tracking-widest text-slate-600 block mb-1">Task Description *</label>
                  <input value={form.task_description} onChange={set("task_description")} placeholder="e.g. Lay 100 blocks, Paint 2 rooms, Pour foundation..." className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-700 outline-none"/></div>
                <div><label className="text-[9px] font-bold uppercase tracking-widest text-slate-600 block mb-1">Amount for Task (JMD)</label>
                  <input type="number" value={form.total_amount} onChange={set("total_amount")} placeholder="0.00" className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-3 text-xl font-bold text-emerald-400 placeholder-slate-700 outline-none"/></div>
              </div>}

              {form.rate_type!=="task"&&<div><label className="text-[9px] font-bold uppercase tracking-widest text-slate-600 block mb-1">Total Amount (JMD) *</label>
                <input type="number" value={form.total_amount} onChange={set("total_amount")} placeholder="0.00" className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-3 text-xl font-bold text-emerald-400 placeholder-slate-700 outline-none"/></div>}

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
              <button onClick={()=>setStep("signature")} disabled={!form.total_amount||(!form.work_type&&form.rate_type!=="task")}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-sm text-white font-semibold">
                Continue to Signature <ChevronRight size={15}/></button>
            </div>
          </div>
        )}

        {step==="signature"&&(
          <div className="space-y-4">
            <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-4">
              <div className="text-[10px] font-bold uppercase tracking-widest text-emerald-600 mb-2">Payment Summary</div>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold text-slate-200">{form.worker_name}</div>
                  <div className="text-[10px] text-slate-500">{form.rate_type==="task"?form.task_description:form.work_type} · {form.work_date}</div>
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

        {step==="receipt"&&(
          <div className="space-y-4">
            <div className="flex items-center gap-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 p-4">
              <CheckCircle2 size={24} className="text-emerald-400 flex-shrink-0"/>
              <div><div className="text-sm font-bold text-emerald-300">Payment Recorded!</div><div className="text-[10px] text-emerald-600">Receipt #{receiptNumber}</div></div>
            </div>

            <div className="rounded-xl border border-white/[0.07] bg-[#0c1018] p-5 space-y-4">
              <div className="text-center border-b border-white/[0.06] pb-4">
                {company?.logo_url&&<img src={company.logo_url} style={{width:60,height:60,borderRadius:10,objectFit:"cover",margin:"0 auto 10px",display:"block"}}/>}
                <div className="text-base font-black text-slate-100 uppercase tracking-wider">{company?.company_name||"Magnus Boys Construction"}</div>
                {company?.address_line1&&<div className="text-[10px] text-slate-500 mt-1">{company.address_line1}{company?.city?`, ${company.city}`:""}</div>}
                <div className="text-[10px] text-slate-500">{company?.phone&&`Tel: ${company.phone}`}{company?.phone&&company?.email?" · ":""}{company?.email||""}</div>
                <div className="text-base font-bold text-slate-100 mt-3 uppercase tracking-widest">Payment Receipt</div>
                <div className="text-[10px] text-slate-500">Receipt #{receiptNumber}</div>
              </div>
              <div className="space-y-2 text-sm">
                {[
                  {label:"Worker",value:form.worker_name},
                  {label:"ID Number",value:form.worker_id_number||"—"},
                  form.rate_type==="task"?{label:"Task",value:form.task_description}:{label:"Work Type",value:form.work_type},
                  {label:"Work Date",value:form.work_date},
                  {label:"Payment",value:form.payment_method.replace("_"," ")},
                  form.rate_type==="day"&&form.days_worked&&form.rate_per_day?{label:"Days × Rate",value:`${form.days_worked} days × ${fmtJMD(parseFloat(form.rate_per_day))}`}:null,
                  form.rate_type==="hour"&&form.hours_worked&&form.rate_per_hour?{label:"Hours × Rate",value:`${form.hours_worked} hrs × ${fmtJMD(parseFloat(form.rate_per_hour))}`}:null,
                ].filter(Boolean).map((row:any)=>(
                  <div key={row.label} className="flex justify-between">
                    <span className="text-slate-600 text-xs">{row.label}</span>
                    <span className="text-slate-300 text-xs font-semibold capitalize">{row.value}</span>
                  </div>
                ))}
              </div>
              <div className="border-t-2 border-white/[0.1] pt-3 flex justify-between items-center">
                <span className="font-black text-slate-100 text-sm">TOTAL PAID</span>
                <span className="text-2xl font-black text-emerald-400">{fmtJMD(totalAmount)}</span>
              </div>
              {form.signature_data&&(
                <div className="border-t border-white/[0.06] pt-3">
                  <div className="text-[9px] text-slate-500 mb-1 uppercase tracking-wider">Worker Signature</div>
                  <img src={form.signature_data} alt="Signature" className="h-14 object-contain"/>
                  <div className="text-[9px] text-slate-500 mt-1">{form.worker_name}</div>
                </div>
              )}
              <div className="border-t border-white/[0.06] pt-3 text-[9px] text-slate-500 text-center">
                Paid by: {form.supervisor_name} · {new Date().toLocaleDateString()}<br/>
                {company?.company_name||"Magnus Boys Construction"}{company?.tagline?` · ${company.tagline}`:""}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <button onClick={downloadPDF} className="flex flex-col items-center justify-center gap-1.5 py-3 rounded-xl border border-white/[0.08] hover:border-white/[0.14] text-slate-400 hover:text-slate-200 transition">
                <Printer size={16}/><span className="text-[11px] font-semibold">Print/PDF</span></button>
              <button onClick={sendWhatsApp} className="flex flex-col items-center justify-center gap-1.5 py-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 transition">
                <Share2 size={16}/><span className="text-[11px] font-semibold">WhatsApp</span></button>
              <button onClick={sendEmail} className="flex flex-col items-center justify-center gap-1.5 py-3 rounded-xl border border-blue-500/30 bg-blue-500/10 hover:bg-blue-500/20 text-blue-300 transition">
                <Mail size={16}/><span className="text-[11px] font-semibold">Email</span></button>
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