// src/components/FieldPaymentForm.tsx
// Complete field payment form:
// Step 1: Scan worker ID → auto-fill name, ID number, store ID photo
// Step 2: Enter payment details (amount, work type, hours, date)
// Step 3: Worker signs on screen
// Step 4: Generate receipt + store everything in database

import React, { useRef, useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { useProjectContext } from "../context/ProjectContext";
import { SimpleIDScanner } from "./SimpleIDScanner";
import {
  Check, X, ChevronRight, ChevronLeft, Camera,
  DollarSign, FileText, PenTool, User, Briefcase,
  Calendar, Clock, MapPin, Phone, AlertCircle,
  CheckCircle2, Download, Share2, RefreshCw
} from "lucide-react";
import { cn } from "../components/ui";

// ─── Types ────────────────────────────────────────────────────────────────────

type Step = "id_scan" | "payment" | "signature" | "receipt";

type FormData = {
  // Worker
  worker_name: string;
  worker_id_number: string;
  worker_phone: string;
  worker_address: string;
  id_photo_url: string;
  // Payment
  work_type: string;
  work_date: string;
  hours_worked: string;
  days_worked: string;
  rate_per_hour: string;
  rate_per_day: string;
  total_amount: string;
  payment_method: string;
  notes: string;
  project_id: string;
  // Signature
  signature_data: string;
  supervisor_name: string;
};

const WORK_TYPES = [
  "General Labour", "Mason", "Carpenter", "Painter", "Electrician",
  "Plumber", "Steel Fixer", "Tiler", "Welder", "Equipment Operator",
  "Driver", "Security", "Cleaning", "Landscaping", "Other"
];

const PAYMENT_METHODS = [
  { value: "cash",          label: "Cash" },
  { value: "bank_transfer", label: "Bank Transfer" },
  { value: "check",         label: "Cheque" },
  { value: "other",         label: "Other" },
];

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

// ─── Signature Pad ────────────────────────────────────────────────────────────

function SignaturePad({ onSign, onClear }: { onSign: (data: string) => void; onClear: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing   = useRef(false);
  const [hasSign, setHasSign] = useState(false);

  function getPos(e: MouseEvent | TouchEvent, canvas: HTMLCanvasElement) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width  / rect.width;
    const scaleY = canvas.height / rect.height;
    if ("touches" in e) {
      return {
        x: (e.touches[0].clientX - rect.left) * scaleX,
        y: (e.touches[0].clientY - rect.top)  * scaleY,
      };
    }
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    ctx.strokeStyle = "#0891b2"; // cyan-600
    ctx.lineWidth   = 2.5;
    ctx.lineCap     = "round";
    ctx.lineJoin    = "round";

    function start(e: MouseEvent | TouchEvent) {
      e.preventDefault();
      drawing.current = true;
      const pos = getPos(e, canvas!);
      ctx.beginPath(); ctx.moveTo(pos.x, pos.y);
    }
    function move(e: MouseEvent | TouchEvent) {
      if (!drawing.current) return;
      e.preventDefault();
      const pos = getPos(e, canvas!);
      ctx.lineTo(pos.x, pos.y); ctx.stroke();
      setHasSign(true);
    }
    function stop() {
      if (!drawing.current) return;
      drawing.current = false;
      onSign(canvas!.toDataURL("image/png"));
    }

    canvas.addEventListener("mousedown",  start);
    canvas.addEventListener("mousemove",  move);
    canvas.addEventListener("mouseup",    stop);
    canvas.addEventListener("touchstart", start, { passive: false });
    canvas.addEventListener("touchmove",  move,  { passive: false });
    canvas.addEventListener("touchend",   stop);

    return () => {
      canvas.removeEventListener("mousedown",  start);
      canvas.removeEventListener("mousemove",  move);
      canvas.removeEventListener("mouseup",    stop);
      canvas.removeEventListener("touchstart", start);
      canvas.removeEventListener("touchmove",  move);
      canvas.removeEventListener("touchend",   stop);
    };
  }, []);

  function clear() {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasSign(false);
    onClear();
  }

  return (
    <div className="space-y-2">
      <div className="relative rounded-xl border-2 border-dashed border-cyan-500/40 bg-white dark:bg-[#060910] overflow-hidden">
        <canvas ref={canvasRef} width={600} height={200}
          className="w-full touch-none cursor-crosshair" style={{ height: 180 }}/>
        {!hasSign && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="text-center">
              <PenTool size={24} className="text-slate-700 mx-auto mb-2"/>
              <div className="text-xs text-slate-600">Sign here</div>
            </div>
          </div>
        )}
      </div>
      {hasSign && (
        <button onClick={clear}
          className="flex items-center gap-1.5 text-[11px] text-slate-500 hover:text-red-400 transition-colors">
          <RefreshCw size={11}/> Clear signature
        </button>
      )}
    </div>
  );
}

// ─── Step Indicator ───────────────────────────────────────────────────────────

function StepBar({ step }: { step: Step }) {
  const steps: { key: Step; label: string; icon: React.ReactNode }[] = [
    { key:"id_scan",   label:"Scan ID",  icon:<User size={13}/> },
    { key:"payment",   label:"Payment",  icon:<DollarSign size={13}/> },
    { key:"signature", label:"Sign",     icon:<PenTool size={13}/> },
    { key:"receipt",   label:"Receipt",  icon:<FileText size={13}/> },
  ];
  const idx = steps.findIndex(s => s.key === step);

  return (
    <div className="flex items-center justify-between mb-6">
      {steps.map((s, i) => (
        <React.Fragment key={s.key}>
          <div className="flex flex-col items-center gap-1">
            <div className={cn("w-8 h-8 rounded-full flex items-center justify-center border-2 transition-all",
              i < idx  ? "bg-emerald-500 border-emerald-500 text-white" :
              i === idx ? "bg-cyan-600 border-cyan-400 text-white" :
                          "bg-white/[0.04] border-white/[0.12] text-slate-600")}>
              {i < idx ? <Check size={13}/> : s.icon}
            </div>
            <div className={cn("text-[9px] font-bold uppercase tracking-widest",
              i <= idx ? "text-slate-300" : "text-slate-700")}>{s.label}</div>
          </div>
          {i < steps.length - 1 && (
            <div className={cn("flex-1 h-0.5 mx-2 transition-all", i < idx ? "bg-emerald-500" : "bg-white/[0.08]")}/>
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface FieldPaymentFormProps {
  onComplete: () => void;
  onCancel: () => void;
}

export function FieldPaymentForm({ onComplete, onCancel }: FieldPaymentFormProps) {
  const { projects, currentProject } = useProjectContext();
  const [step, setStep]   = useState<Step>("id_scan");
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState<string | null>(null);
  const [paymentId, setPaymentId] = useState<string | null>(null);
  const [receiptNumber, setReceiptNumber] = useState<string>("");
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [supervisorId, setSupervisorId] = useState<string | null>(null);
  const [idPhotoFile, setIdPhotoFile] = useState<File | null>(null);
  const [idPhotoPreview, setIdPhotoPreview] = useState<string | null>(null);

  const [form, setForm] = useState<FormData>({
    worker_name: "", worker_id_number: "", worker_phone: "",
    worker_address: "", id_photo_url: "",
    work_type: "General Labour", work_date: new Date().toISOString().split("T")[0],
    hours_worked: "", days_worked: "1", rate_per_hour: "", rate_per_day: "",
    total_amount: "", payment_method: "cash", notes: "",
    project_id: currentProject?.id || "",
    signature_data: "", supervisor_name: "",
  });

  function set(key: keyof FormData) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm(f => ({ ...f, [key]: e.target.value }));
  }

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      setSupervisorId(user.id);
      supabase.from("user_profiles").select("company_id, full_name").eq("id", user.id).maybeSingle()
        .then(({ data }) => {
          if (data?.company_id) setCompanyId(data.company_id);
          if (data?.full_name)  setForm(f => ({ ...f, supervisor_name: data.full_name }));
        });
    });
  }, []);

  // Auto-calculate total when rate/days/hours change
  useEffect(() => {
    const days  = parseFloat(form.days_worked)  || 0;
    const hours = parseFloat(form.hours_worked) || 0;
    const rDay  = parseFloat(form.rate_per_day) || 0;
    const rHour = parseFloat(form.rate_per_hour)|| 0;
    let total = 0;
    if (rDay  > 0 && days  > 0) total = rDay  * days;
    if (rHour > 0 && hours > 0) total = rHour * hours;
    if (total > 0) setForm(f => ({ ...f, total_amount: total.toFixed(2) }));
  }, [form.days_worked, form.hours_worked, form.rate_per_day, form.rate_per_hour]);

  // ── ID Scan handler ──────────────────────────────────────────────────────────

  function handleIDScanResult(ocr: any) {
    const name = [ocr.firstName, ocr.middleName, ocr.lastName].filter(Boolean).join(" ");
    setForm(f => ({
      ...f,
      worker_name:      name      || f.worker_name,
      worker_id_number: ocr.idNumber || ocr.documentNumber || f.worker_id_number,
      worker_address:   ocr.address  || f.worker_address,
    }));
  }

  // ── Save Payment ─────────────────────────────────────────────────────────────

  async function savePayment() {
    setSaving(true); setError(null);
    try {
      // 1. Upload ID photo if we have one
      let idPhotoUrl = form.id_photo_url;
      if (idPhotoFile && companyId) {
        const path = `field-payments/ids/${companyId}/${Date.now()}_${form.worker_id_number || "id"}.jpg`;
        const { error: uploadErr } = await supabase.storage
          .from("project-files")
          .upload(path, idPhotoFile, { upsert: true });
        if (!uploadErr) {
          const { data: urlData } = supabase.storage.from("project-files").getPublicUrl(path);
          idPhotoUrl = urlData.publicUrl;
        }
      }

      // 2. Generate receipt number
      const recNum = `FP-${new Date().getFullYear()}${String(new Date().getMonth()+1).padStart(2,"0")}-${Date.now().toString().slice(-6)}`;
      setReceiptNumber(recNum);

      // 3. Create field payment record
      const { data: payment, error: payErr } = await supabase
        .from("field_payments")
        .insert({
          company_id:       companyId,
          project_id:       form.project_id || null,
          worker_name:      form.worker_name.trim(),
          worker_id_number: form.worker_id_number.trim() || null,
          worker_phone:     form.worker_phone.trim() || null,
          worker_address:   form.worker_address.trim() || null,
          id_photo_url:     idPhotoUrl || null,
          work_type:        form.work_type,
          work_date:        form.work_date,
          hours_worked:     parseFloat(form.hours_worked) || null,
          days_worked:      parseFloat(form.days_worked)  || null,
          rate_per_hour:    parseFloat(form.rate_per_hour)|| null,
          rate_per_day:     parseFloat(form.rate_per_day) || null,
          total_amount:     parseFloat(form.total_amount) || 0,
          payment_method:   form.payment_method,
          notes:            form.notes.trim() || null,
          status:           "draft",
          supervisor_id:    supervisorId,
          supervisor_name:  form.supervisor_name.trim() || null,
          synced_to_finance: false,
        })
        .select()
        .maybeSingle();

      if (payErr) throw payErr;
      if (!payment) throw new Error("Failed to create payment record");
      setPaymentId(payment.id);

      // 4. Save signature
      if (form.signature_data) {
        await supabase.from("field_payment_signatures").insert({
          field_payment_id: payment.id,
          company_id:       companyId,
          signature_type:   "worker",
          signature_data:   form.signature_data,
          signed_at:        new Date().toISOString(),
          signed_by:        form.worker_name,
        });

        // Update payment status to signed
        await supabase.from("field_payments")
          .update({ status: "signed", signed_at: new Date().toISOString() })
          .eq("id", payment.id);
      }

      // 5. Create receipt record
      await supabase.from("field_payment_receipts").insert({
        field_payment_id: payment.id,
        company_id:       companyId,
        receipt_type:     "payment_acknowledgment",
        receipt_number:   recNum,
      });

      // 6. Create expense record for finance tracking
      await supabase.from("expenses").insert({
        company_id:    companyId,
        project_id:    form.project_id || null,
        description:   `Field Payment — ${form.worker_name} (${form.work_type})`,
        amount:        parseFloat(form.total_amount) || 0,
        expense_date:  form.work_date,
        status:        "approved",
      });

      setStep("receipt");
    } catch(e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  // ── Render steps ─────────────────────────────────────────────────────────────

  const totalAmount = parseFloat(form.total_amount) || 0;

  return (
    <div className="min-h-full bg-[#080b10] dark:bg-[#080b10]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06] bg-[#0c1018]">
        <div>
          <div className="text-sm font-semibold text-slate-200">New Field Payment</div>
          <div className="text-[10px] text-slate-600">
            {step==="id_scan"   && "Step 1 of 4 — Scan worker ID"}
            {step==="payment"   && "Step 2 of 4 — Payment details"}
            {step==="signature" && "Step 3 of 4 — Worker signature"}
            {step==="receipt"   && "Step 4 of 4 — Receipt"}
          </div>
        </div>
        <button onClick={onCancel} className="p-1.5 rounded-lg hover:bg-white/10 text-slate-600 hover:text-slate-300 transition-colors">
          <X size={16}/>
        </button>
      </div>

      <div className="p-4 max-w-lg mx-auto">
        <StepBar step={step}/>

        {error && (
          <div className="mb-4 flex items-center gap-2 rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2.5 text-xs text-red-300">
            <AlertCircle size={13}/> {error}
            <button onClick={() => setError(null)} className="ml-auto"><X size={11}/></button>
          </div>
        )}

        {/* ── Step 1: ID Scan ── */}
        {step === "id_scan" && (
          <div className="space-y-4">
            <SimpleIDScanner
              onResult={handleIDScanResult}
              onCancel={() => {}}
            />

            {/* Manual entry fallback */}
            <div className="border-t border-white/[0.06] pt-4">
              <div className="text-[10px] font-bold uppercase tracking-widest text-slate-600 mb-3">
                Worker Details {form.worker_name && <span className="text-emerald-400 ml-2">✓ Auto-filled from ID</span>}
              </div>
              <div className="space-y-3">
                <div>
                  <label className="text-[9px] font-bold uppercase tracking-widest text-slate-600 block mb-1">Full Name *</label>
                  <input value={form.worker_name} onChange={set("worker_name")} placeholder="Worker full name"
                    className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-700 outline-none focus:border-cyan-500/50 transition-colors"/>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[9px] font-bold uppercase tracking-widest text-slate-600 block mb-1">ID Number</label>
                    <input value={form.worker_id_number} onChange={set("worker_id_number")} placeholder="National ID #"
                      className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-700 outline-none focus:border-cyan-500/50 transition-colors"/>
                  </div>
                  <div>
                    <label className="text-[9px] font-bold uppercase tracking-widest text-slate-600 block mb-1">Phone</label>
                    <input value={form.worker_phone} onChange={set("worker_phone")} placeholder="876-xxx-xxxx"
                      className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-700 outline-none focus:border-cyan-500/50 transition-colors"/>
                  </div>
                </div>
                <div>
                  <label className="text-[9px] font-bold uppercase tracking-widest text-slate-600 block mb-1">Address</label>
                  <input value={form.worker_address} onChange={set("worker_address")} placeholder="Worker address"
                    className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-700 outline-none focus:border-cyan-500/50 transition-colors"/>
                </div>
              </div>
            </div>

            <button
              onClick={() => setStep("payment")}
              disabled={!form.worker_name.trim()}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-sm text-white font-semibold transition-colors">
              Continue <ChevronRight size={16}/>
            </button>
          </div>
        )}

        {/* ── Step 2: Payment Details ── */}
        {step === "payment" && (
          <div className="space-y-4">
            {/* Worker summary */}
            <div className="flex items-center gap-3 rounded-xl bg-white/[0.03] border border-white/[0.06] p-3">
              <div className="w-10 h-10 rounded-full bg-cyan-500/20 flex items-center justify-center text-sm font-bold text-cyan-300">
                {form.worker_name.split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase()}
              </div>
              <div>
                <div className="text-sm font-semibold text-slate-200">{form.worker_name}</div>
                {form.worker_id_number && <div className="text-[10px] text-slate-600">ID: {form.worker_id_number}</div>}
              </div>
              <button onClick={() => setStep("id_scan")} className="ml-auto text-[10px] text-cyan-500 hover:text-cyan-400">Edit</button>
            </div>

            <div className="space-y-3">
              {/* Project */}
              <div>
                <label className="text-[9px] font-bold uppercase tracking-widest text-slate-600 block mb-1">Project</label>
                <select value={form.project_id} onChange={set("project_id")}
                  className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:border-cyan-500/50 [&>option]:bg-[#111820]">
                  <option value="">No project</option>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>

              {/* Work type + date */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[9px] font-bold uppercase tracking-widest text-slate-600 block mb-1">Work Type *</label>
                  <select value={form.work_type} onChange={set("work_type")}
                    className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:border-cyan-500/50 [&>option]:bg-[#111820]">
                    {WORK_TYPES.map(w => <option key={w} value={w}>{w}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[9px] font-bold uppercase tracking-widest text-slate-600 block mb-1">Work Date *</label>
                  <input type="date" value={form.work_date} onChange={set("work_date")}
                    className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:border-cyan-500/50 transition-colors"/>
                </div>
              </div>

              {/* Rate type selector */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[9px] font-bold uppercase tracking-widest text-slate-600 block mb-1">Days Worked</label>
                  <input type="number" value={form.days_worked} onChange={set("days_worked")} placeholder="1"
                    className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-700 outline-none focus:border-cyan-500/50 transition-colors"/>
                </div>
                <div>
                  <label className="text-[9px] font-bold uppercase tracking-widest text-slate-600 block mb-1">Rate per Day ($)</label>
                  <input type="number" value={form.rate_per_day} onChange={set("rate_per_day")} placeholder="0.00"
                    className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-700 outline-none focus:border-cyan-500/50 transition-colors"/>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[9px] font-bold uppercase tracking-widest text-slate-600 block mb-1">Hours Worked</label>
                  <input type="number" value={form.hours_worked} onChange={set("hours_worked")} placeholder="0"
                    className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-700 outline-none focus:border-cyan-500/50 transition-colors"/>
                </div>
                <div>
                  <label className="text-[9px] font-bold uppercase tracking-widest text-slate-600 block mb-1">Rate per Hour ($)</label>
                  <input type="number" value={form.rate_per_hour} onChange={set("rate_per_hour")} placeholder="0.00"
                    className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-700 outline-none focus:border-cyan-500/50 transition-colors"/>
                </div>
              </div>

              {/* Total */}
              <div>
                <label className="text-[9px] font-bold uppercase tracking-widest text-slate-600 block mb-1">Total Amount ($) *</label>
                <input type="number" value={form.total_amount} onChange={set("total_amount")} placeholder="0.00"
                  className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-3 text-xl font-bold text-emerald-400 placeholder-slate-700 outline-none focus:border-emerald-500/50 transition-colors"/>
              </div>

              {/* Payment method */}
              <div>
                <label className="text-[9px] font-bold uppercase tracking-widest text-slate-600 block mb-1">Payment Method</label>
                <div className="grid grid-cols-4 gap-2">
                  {PAYMENT_METHODS.map(m => (
                    <button key={m.value} onClick={() => setForm(f => ({...f, payment_method: m.value}))}
                      className={cn("py-2 rounded-lg text-[11px] font-semibold border transition-colors",
                        form.payment_method === m.value
                          ? "bg-cyan-500/20 border-cyan-500/40 text-cyan-300"
                          : "bg-white/[0.03] border-white/[0.07] text-slate-500 hover:border-white/[0.14]")}>
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="text-[9px] font-bold uppercase tracking-widest text-slate-600 block mb-1">Notes (optional)</label>
                <textarea value={form.notes} onChange={set("notes") as any} rows={2}
                  placeholder="Any additional notes..."
                  className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-700 outline-none focus:border-cyan-500/50 resize-none transition-colors"/>
              </div>
            </div>

            <div className="flex gap-3">
              <button onClick={() => setStep("id_scan")}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-white/[0.08] text-sm text-slate-400 hover:text-slate-300 transition-colors">
                <ChevronLeft size={15}/> Back
              </button>
              <button onClick={() => setStep("signature")}
                disabled={!form.total_amount || !form.work_type}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-sm text-white font-semibold transition-colors">
                Continue to Signature <ChevronRight size={15}/>
              </button>
            </div>
          </div>
        )}

        {/* ── Step 3: Signature ── */}
        {step === "signature" && (
          <div className="space-y-4">
            {/* Payment summary */}
            <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-4">
              <div className="text-[10px] font-bold uppercase tracking-widest text-emerald-600 mb-2">Payment Summary</div>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold text-slate-200">{form.worker_name}</div>
                  <div className="text-[10px] text-slate-500">{form.work_type} · {form.work_date}</div>
                  {form.worker_id_number && <div className="text-[10px] text-slate-600">ID: {form.worker_id_number}</div>}
                </div>
                <div className="text-2xl font-bold text-emerald-400">{fmt(totalAmount)}</div>
              </div>
              <div className="mt-2 text-[10px] text-slate-600 capitalize">
                Payment: {form.payment_method.replace("_"," ")}
              </div>
            </div>

            {/* Signature pad */}
            <div>
              <div className="text-xs font-semibold text-slate-300 mb-2 flex items-center gap-2">
                <PenTool size={13} className="text-cyan-400"/>
                Worker Signature
              </div>
              <div className="text-[10px] text-slate-600 mb-3">
                I acknowledge receiving the above payment for work performed.
              </div>
              <SignaturePad
                onSign={data => setForm(f => ({...f, signature_data: data}))}
                onClear={() => setForm(f => ({...f, signature_data: ""}))}
              />
            </div>

            {/* Supervisor */}
            <div>
              <label className="text-[9px] font-bold uppercase tracking-widest text-slate-600 block mb-1">Supervisor / Paid By</label>
              <input value={form.supervisor_name} onChange={set("supervisor_name")} placeholder="Your name"
                className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-700 outline-none focus:border-cyan-500/50 transition-colors"/>
            </div>

            <div className="flex gap-3">
              <button onClick={() => setStep("payment")}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-white/[0.08] text-sm text-slate-400 hover:text-slate-300 transition-colors">
                <ChevronLeft size={15}/> Back
              </button>
              <button onClick={savePayment} disabled={saving}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-sm text-white font-semibold transition-colors">
                {saving ? (
                  <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/> Saving...</>
                ) : (
                  <><Check size={15}/> Confirm & Save Payment</>
                )}
              </button>
            </div>
          </div>
        )}

        {/* ── Step 4: Receipt ── */}
        {step === "receipt" && (
          <div className="space-y-4">
            {/* Success banner */}
            <div className="flex items-center gap-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 p-4">
              <CheckCircle2 size={24} className="text-emerald-400 flex-shrink-0"/>
              <div>
                <div className="text-sm font-bold text-emerald-300">Payment Recorded!</div>
                <div className="text-[10px] text-emerald-600">Receipt #{receiptNumber}</div>
              </div>
            </div>

            {/* Receipt card */}
            <div className="rounded-xl border border-white/[0.07] bg-white dark:bg-[#0c1018] p-5 space-y-4">
              <div className="text-center border-b border-slate-200 dark:border-white/[0.06] pb-4">
                <div className="text-lg font-bold text-slate-900 dark:text-slate-100">PAYMENT RECEIPT</div>
                <div className="text-[10px] text-slate-500 mt-0.5">Magnus Construction ERP</div>
                <div className="text-[10px] text-slate-500">Receipt #{receiptNumber}</div>
              </div>

              <div className="space-y-2 text-sm">
                {[
                  { label:"Worker",       value: form.worker_name },
                  { label:"ID Number",    value: form.worker_id_number || "—" },
                  { label:"Work Type",    value: form.work_type },
                  { label:"Work Date",    value: form.work_date },
                  { label:"Payment",      value: form.payment_method.replace("_"," ") },
                  form.days_worked  && form.rate_per_day  ? { label:"Days × Rate",  value: `${form.days_worked} days × $${form.rate_per_day}` } : null,
                  form.hours_worked && form.rate_per_hour ? { label:"Hours × Rate", value: `${form.hours_worked} hrs × $${form.rate_per_hour}` } : null,
                ].filter(Boolean).map((row:any) => (
                  <div key={row.label} className="flex justify-between">
                    <span className="text-slate-500 dark:text-slate-600 text-xs">{row.label}</span>
                    <span className="text-slate-800 dark:text-slate-300 text-xs font-medium capitalize">{row.value}</span>
                  </div>
                ))}
              </div>

              <div className="border-t border-slate-200 dark:border-white/[0.06] pt-3 flex justify-between items-center">
                <span className="font-bold text-slate-900 dark:text-slate-100">TOTAL PAID</span>
                <span className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{fmt(totalAmount)}</span>
              </div>

              {form.signature_data && (
                <div className="border-t border-slate-200 dark:border-white/[0.06] pt-3">
                  <div className="text-[9px] text-slate-500 mb-1">WORKER SIGNATURE</div>
                  <img src={form.signature_data} alt="Signature" className="h-14 object-contain"/>
                  <div className="text-[9px] text-slate-500 mt-1">{form.worker_name}</div>
                </div>
              )}

              <div className="border-t border-slate-200 dark:border-white/[0.06] pt-3 text-[9px] text-slate-500 text-center">
                Paid by: {form.supervisor_name} · {new Date().toLocaleDateString()}
              </div>
            </div>

            {/* Actions */}
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => {
                  // Print receipt
                  window.print();
                }}
                className="flex items-center justify-center gap-2 py-2.5 rounded-xl border border-white/[0.08] text-sm text-slate-400 hover:text-slate-300 hover:border-white/[0.14] transition-colors">
                <Download size={14}/> Print
              </button>
              <button
                onClick={() => {
                  // Share via WhatsApp
                  const msg = `Payment Receipt\nWorker: ${form.worker_name}\nAmount: ${fmt(totalAmount)}\nDate: ${form.work_date}\nRef: ${receiptNumber}`;
                  window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`);
                }}
                className="flex items-center justify-center gap-2 py-2.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-sm text-emerald-300 hover:bg-emerald-500/20 transition-colors">
                <Share2 size={14}/> WhatsApp
              </button>
            </div>

            <button onClick={onComplete}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-sm text-white font-semibold transition-colors">
              <Check size={15}/> Done — New Payment
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
