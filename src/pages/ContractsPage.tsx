// src/pages/ContractsPage.tsx — Full Contracts & Proposals Module
// @ts-ignore
import { openPrintWindow } from "../lib/printUtils";
// @ts-ignore
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import React, { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { magnusAI } from "../lib/magnusAI";
import { useCompanySettings } from "../hooks/useCompanySettings";
import {
  Plus, FileText, Search, RefreshCw, X, Check, Edit2, Trash2,
  Save, ChevronDown, ChevronUp, AlertCircle, Bot, Sparkles,
  Loader, Send, CheckCircle2, Clock, DollarSign, Calendar,
  Users, Building2, Download, Printer, Eye, Copy,
  ArrowRight, Shield, Star, Zap
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────
interface Contract {
  id: string;
  company_id: string;
  project_id: string | null;
  client_id: string | null;
  contract_number: string;
  contract_name: string;
  contract_date: string | null;
  start_date: string | null;
  completion_date: string | null;
  contract_amount: number;
  retention_percent: number;
  payment_terms: string | null;
  billing_schedule: string | null;
  status: string;
  notes: string | null;
  scope_of_work: string | null;
  terms_and_conditions: string | null;
  contractor_signed_at: string | null;
  client_signed_at: string | null;
  warranty_period_months: number;
  penalty_clause: string | null;
  governing_law: string;
  created_at: string;
  // joined
  project?: { name: string } | null;
  client?: { name: string; contact_name: string | null; email: string | null; phone: string | null; address: string | null } | null;
}

interface PaymentSchedule {
  id?: string;
  contract_id?: string;
  company_id?: string;
  milestone_name: string;
  milestone_description: string;
  due_date: string;
  amount: number;
  percent_complete: number;
  status: string;
  sort_order: number;
}

interface Client { id: string; name: string; contact_name: string | null; email: string | null; phone: string | null; address: string | null; }
interface Project { id: string; name: string; status: string | null; }

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtJMD(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "JMD", minimumFractionDigits: 2 }).format(n);
}
function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
function genContractNo() {
  const y = new Date().getFullYear();
  const r = Math.floor(Math.random() * 9000) + 1000;
  return `MBC-${y}-${r}`;
}

const STATUS_CFG: Record<string, { color: string; bg: string; border: string; label: string; icon: React.ReactNode }> = {
  draft:     { color:"text-slate-300",   bg:"bg-slate-500/10",   border:"border-slate-500/20",   label:"Draft",     icon:<Clock size={10}/> },
  sent:      { color:"text-blue-300",    bg:"bg-blue-500/10",    border:"border-blue-500/20",    label:"Sent",      icon:<Send size={10}/> },
  signed:    { color:"text-emerald-300", bg:"bg-emerald-500/10", border:"border-emerald-500/20", label:"Signed",    icon:<CheckCircle2 size={10}/> },
  active:    { color:"text-cyan-300",    bg:"bg-cyan-500/10",    border:"border-cyan-500/20",    label:"Active",    icon:<Zap size={10}/> },
  completed: { color:"text-purple-300",  bg:"bg-purple-500/10",  border:"border-purple-500/20",  label:"Completed", icon:<Star size={10}/> },
  cancelled: { color:"text-red-300",     bg:"bg-red-500/10",     border:"border-red-500/20",     label:"Cancelled", icon:<X size={10}/> },
};

const DEFAULT_TERMS = `1. SCOPE OF WORK
The Contractor agrees to perform all work as described in this contract in a good and workmanlike manner.

2. PAYMENT TERMS
Payment shall be made according to the Payment Schedule attached hereto. Late payments shall accrue interest at 2% per month.

3. VARIATIONS
No variation or alteration to the scope of works shall be carried out without written instruction from the Client. All variations must be agreed in writing before work commences.

4. MATERIALS
All materials supplied by the Contractor shall be new and of good quality unless otherwise agreed in writing.

5. DELAYS
The Contractor shall not be liable for delays caused by circumstances beyond their reasonable control including but not limited to adverse weather, supply chain disruptions, or client-caused delays.

6. DEFECTS LIABILITY
The Contractor shall remedy any defects arising from faulty workmanship or materials for a period of ${12} months following practical completion.

7. DISPUTE RESOLUTION
Any disputes arising from this contract shall first be referred to mediation before legal proceedings are commenced.

8. GOVERNING LAW
This contract shall be governed by the laws of Jamaica.

9. ENTIRE AGREEMENT
This contract constitutes the entire agreement between the parties and supersedes all prior negotiations and agreements.`;

// ─── Contract Card ────────────────────────────────────────────────────────────
function ContractCard({ contract, onView, onDelete, onDuplicate }: {
  contract: Contract; onView: () => void; onDelete: () => void; onDuplicate: () => void;
}) {
  const cfg = STATUS_CFG[contract.status] || STATUS_CFG.draft;
  return (
    <div onClick={onView}
      className="group rounded-xl border border-white/[0.07] bg-[#0d1117] hover:border-white/[0.13] hover:bg-white/[0.02] transition-all cursor-pointer p-5 flex flex-col gap-4">
      <div className="flex items-start justify-between">
        <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center flex-shrink-0">
          <FileText size={16} className="text-blue-400"/>
        </div>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition" onClick={e=>e.stopPropagation()}>
          <button onClick={onDuplicate} className="p-1.5 rounded-lg hover:bg-white/10 text-slate-600 hover:text-slate-300 transition" title="Duplicate"><Copy size={11}/></button>
          <button onClick={onDelete} className="p-1.5 rounded-lg hover:bg-red-500/10 text-slate-600 hover:text-red-400 transition" title="Delete"><Trash2 size={11}/></button>
        </div>
      </div>

      <div>
        <div className="text-[10px] font-mono text-slate-600 mb-1">{contract.contract_number}</div>
        <div className="text-sm font-bold text-slate-100 mb-0.5 truncate">{contract.contract_name}</div>
        <div className="text-[10px] text-slate-600">{contract.client?.name || "No client"} · {contract.project?.name || "No project"}</div>
      </div>

      <div className="text-xl font-bold text-emerald-400">{fmtJMD(contract.contract_amount)}</div>

      <div className="flex items-center justify-between pt-3 border-t border-white/[0.05]">
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold border ${cfg.color} ${cfg.bg} ${cfg.border}`}>
          {cfg.icon} {cfg.label}
        </span>
        <span className="text-[9px] text-slate-700">{fmtDate(contract.contract_date)}</span>
      </div>

      {/* Signature status */}
      <div className="flex gap-2">
        <div className={`flex-1 flex items-center gap-1.5 px-2 py-1 rounded-lg text-[9px] font-semibold border ${contract.contractor_signed_at ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" : "bg-white/[0.03] border-white/[0.06] text-slate-700"}`}>
          <Shield size={9}/> Contractor {contract.contractor_signed_at ? "✓" : "Pending"}
        </div>
        <div className={`flex-1 flex items-center gap-1.5 px-2 py-1 rounded-lg text-[9px] font-semibold border ${contract.client_signed_at ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" : "bg-white/[0.03] border-white/[0.06] text-slate-700"}`}>
          <Users size={9}/> Client {contract.client_signed_at ? "✓" : "Pending"}
        </div>
      </div>
    </div>
  );
}

// ─── PDF Preview Modal ────────────────────────────────────────────────────────
function ContractPDFPreview({ contract, schedule, company, onClose, watermark }: {
  contract: Contract; schedule: PaymentSchedule[]; company: any; onClose: () => void;
  watermark?: {url:string;opacity:number}|null;
}) {
  const totalScheduled = schedule.reduce((s, p) => s + Number(p.amount || 0), 0);
  function downloadPDF() {
    const html = document.getElementById("contract-print-content")?.innerHTML || "";
    const extraCss = `
      .page{max-width:800px;margin:0 auto;padding:60px}
      h1{font-size:32px;font-weight:900}
      h2{font-size:18px;font-weight:700;margin-bottom:12px;border-bottom:2px solid #1a1a1a;padding-bottom:8px}
      table{width:100%;border-collapse:collapse;margin-bottom:16px}
      th{background:#1a1a1a;color:white;padding:10px 12px;text-align:left;font-size:11px;text-transform:uppercase}
      td{padding:10px 12px;border-bottom:1px solid #e5e7eb;font-size:13px}
      .cover{min-height:100vh;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;border-bottom:4px solid #1a1a1a;margin-bottom:60px;padding:80px 40px;page-break-after:always}
      .section{margin-bottom:48px;page-break-inside:avoid}
      .sig-block{display:grid;grid-template-columns:1fr 1fr;gap:40px;margin-top:40px}
      .sig-line{border-top:2px solid #1a1a1a;margin-top:48px;padding-top:8px;font-size:12px}
    `;
    openPrintWindow(`<style>${extraCss}</style>${html}`, {
      title: contract.contract_number + "-" + contract.contract_name,
      watermark: watermark ? {...watermark, size: watermark.size} : null,
      tagline: company?.tagline
    });
  }

    function printContract() {
    const html = document.getElementById("contract-print-content")?.innerHTML || "";
    const extraCss = `
      .page{max-width:800px;margin:0 auto;padding:60px}
      h1{font-size:32px;font-weight:900}
      h2{font-size:18px;font-weight:700;margin-bottom:12px;border-bottom:2px solid #1a1a1a;padding-bottom:8px}
      table{width:100%;border-collapse:collapse;margin-bottom:16px}
      th{background:#1a1a1a;color:white;padding:10px 12px;text-align:left;font-size:11px;text-transform:uppercase}
      td{padding:10px 12px;border-bottom:1px solid #e5e7eb;font-size:13px}
      .cover{min-height:100vh;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;border-bottom:4px solid #1a1a1a;margin-bottom:60px;padding:80px 40px}
      .section{margin-bottom:48px;page-break-inside:avoid}
      .sig-block{display:grid;grid-template-columns:1fr 1fr;gap:40px;margin-top:40px}
      .sig-line{border-top:2px solid #1a1a1a;margin-top:48px;padding-top:8px;font-size:12px}
    `;
    openPrintWindow(`<style>${extraCss}</style>${html}`, {
      title: contract.contract_name,
      watermark,
      tagline: company?.tagline
    });
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex flex-col">
      {/* Header */}
      <div className="flex-shrink-0 flex items-center justify-between px-6 py-3 bg-[#0d1117] border-b border-white/[0.07]">
        <div className="flex items-center gap-2">
          <FileText size={14} className="text-blue-400"/>
          <span className="text-sm font-bold text-slate-100">{contract.contract_name}</span>
          <span className="text-xs text-slate-600 font-mono">{contract.contract_number}</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={downloadPDF}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition">
            <Download size={12}/> Save as PDF
          </button>
          <button onClick={printContract}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition">
            <Printer size={12}/> Print
          </button>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/[0.06] text-slate-500 hover:text-slate-300 transition">
            <X size={15}/>
          </button>
        </div>
      </div>

      {/* Preview */}
      <div className="flex-1 overflow-y-auto bg-gray-100 p-8">
        <div id="contract-print-content" style={{position:"relative"}}>

          <div className="page bg-white shadow-2xl mx-auto max-w-[800px]" style={{fontFamily:"Georgia,serif",color:"#1a1a1a"}}>


            {/* Cover Page */}
            <div id="contract-cover-section" className="cover" style={{minHeight:"60vh",display:"flex",flexDirection:"column",justifyContent:"center",alignItems:"center",textAlign:"center",borderBottom:"4px solid #1a1a1a",marginBottom:60,padding:"80px 40px"}}>
              {company?.logo_url && (
                <img src={company.logo_url} alt="logo" style={{width:80,height:80,borderRadius:12,objectFit:"cover",marginBottom:20}}/>
              )}
              <div style={{fontSize:13,fontWeight:700,letterSpacing:4,textTransform:"uppercase",color:"#6b7280",marginBottom:8}}>
                {company?.company_name || company?.company_name||"Magnus Boys Construction"}
              </div>
              <div style={{fontSize:11,color:"#9ca3af",marginBottom:40}}>
                {company?.address_line1 || ""} {company?.city || ""} · {company?.phone || ""} · {company?.email || ""}
              </div>
              <div style={{fontSize:11,fontWeight:700,letterSpacing:6,textTransform:"uppercase",color:"#9ca3af",marginBottom:12}}>CONTRACT & PROPOSAL</div>
              <h1 style={{fontSize:36,fontWeight:900,marginBottom:16,lineHeight:1.2}}>{contract.contract_name}</h1>
              <div style={{fontSize:14,color:"#6b7280",marginBottom:32}}>
                Prepared for: <strong style={{color:"#1a1a1a"}}>{contract.client?.contact_name || contract.client?.name || "Client"}</strong>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:24,marginTop:16,width:"100%",maxWidth:500}}>
                {[
                  { label:"Contract No.", value:contract.contract_number },
                  { label:"Date", value:fmtDate(contract.contract_date) },
                  { label:"Contract Value", value:fmtJMD(contract.contract_amount) },
                ].map(i=>(
                  <div key={i.label} style={{textAlign:"center"}}>
                    <div style={{fontSize:10,fontWeight:700,letterSpacing:2,textTransform:"uppercase",color:"#9ca3af",marginBottom:4}}>{i.label}</div>
                    <div style={{fontSize:13,fontWeight:800}}>{i.value}</div>
                  </div>
                ))}
              </div>
            </div>


            <div id="contract-body-section" style={{padding:"0 60px 60px"}}>

              {/* Executive Summary */}
              <div className="section" style={{marginBottom:48}}>
                <h2 style={{fontSize:18,fontWeight:700,marginBottom:12,borderBottom:"2px solid #1a1a1a",paddingBottom:8}}>Executive Summary</h2>
                <table style={{width:"100%",borderCollapse:"collapse",marginBottom:16}}>
                  <tbody>
                    {[
                      ["Client", contract.client?.contact_name || contract.client?.name || "—"],
                      ["Company", contract.client?.name || "—"],
                      ["Project", contract.project?.name || "—"],
                      ["Site Address", contract.client?.address || "—"],
                      ["Start Date", fmtDate(contract.start_date)],
                      ["Completion Date", fmtDate(contract.completion_date)],
                      ["Contract Value", fmtJMD(contract.contract_amount)],
                      ["Retention", `${contract.retention_percent || 0}%`],
                      ["Warranty Period", `${contract.warranty_period_months || 12} months`],
                      ["Governing Law", contract.governing_law || "Jamaica"],
                    ].map(([k,v])=>(
                      <tr key={k} style={{borderBottom:"1px solid #f3f4f6"}}>
                        <td style={{padding:"8px 12px",fontWeight:700,fontSize:12,width:180,color:"#6b7280",textTransform:"uppercase",letterSpacing:0.5}}>{k}</td>
                        <td style={{padding:"8px 12px",fontSize:13}}>{v}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Scope of Work */}
              {contract.scope_of_work && (
                <div className="section" style={{marginBottom:48}}>
                  <h2 style={{fontSize:18,fontWeight:700,marginBottom:16,borderBottom:"2px solid #1a1a1a",paddingBottom:8}}>Scope of Work</h2>
                  <div style={{fontSize:13,lineHeight:1.9,whiteSpace:"pre-wrap",color:"#374151"}}>{contract.scope_of_work}</div>
                </div>
              )}

              {/* Payment Schedule */}
              {schedule.length > 0 && (
                <div className="section" style={{marginBottom:48}}>
                  <h2 style={{fontSize:18,fontWeight:700,marginBottom:16,borderBottom:"2px solid #1a1a1a",paddingBottom:8}}>Payment Schedule</h2>
                  <table style={{width:"100%",borderCollapse:"collapse"}}>
                    <thead>
                      <tr style={{background:"#1a1a1a"}}>
                        {["#","Milestone","Description","Due Date","Amount","% of Total"].map(h=>(
                          <th key={h} style={{padding:"10px 12px",textAlign:"left",fontSize:11,textTransform:"uppercase",color:"white",fontWeight:700}}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {schedule.map((p, i) => (
                        <tr key={i} style={{borderBottom:"1px solid #e5e7eb",background:i%2===0?"white":"#f9fafb"}}>
                          <td style={{padding:"10px 12px",fontSize:13}}>{i+1}</td>
                          <td style={{padding:"10px 12px",fontSize:13,fontWeight:700}}>{p.milestone_name}</td>
                          <td style={{padding:"10px 12px",fontSize:12,color:"#6b7280"}}>{p.milestone_description}</td>
                          <td style={{padding:"10px 12px",fontSize:12}}>{fmtDate(p.due_date)}</td>
                          <td style={{padding:"10px 12px",fontSize:13,fontWeight:700}}>{fmtJMD(Number(p.amount))}</td>
                          <td style={{padding:"10px 12px",fontSize:12}}>{Math.round((Number(p.amount)/contract.contract_amount)*100)}%</td>
                        </tr>
                      ))}
                      <tr style={{background:"#1a1a1a",color:"white"}}>
                        <td colSpan={4} style={{padding:"10px 12px",fontSize:13,fontWeight:700}}>TOTAL</td>
                        <td style={{padding:"10px 12px",fontSize:13,fontWeight:700}}>{fmtJMD(totalScheduled)}</td>
                        <td style={{padding:"10px 12px",fontSize:13,fontWeight:700}}>100%</td>
                      </tr>
                    </tbody>
                  </table>
                  {contract.payment_terms && (
                    <p style={{marginTop:12,fontSize:12,color:"#6b7280",fontStyle:"italic"}}>{contract.payment_terms}</p>
                  )}
                </div>
              )}

              {/* Terms & Conditions */}
              {contract.terms_and_conditions && (
                <div className="section" style={{marginBottom:48}}>
                  <h2 style={{fontSize:18,fontWeight:700,marginBottom:16,borderBottom:"2px solid #1a1a1a",paddingBottom:8}}>Terms & Conditions</h2>
                  <div style={{fontSize:12,lineHeight:1.9,whiteSpace:"pre-wrap",color:"#374151"}}>{contract.terms_and_conditions}</div>
                </div>
              )}

              {/* Penalty Clause */}
              {contract.penalty_clause && (
                <div className="section" style={{marginBottom:48}}>
                  <h2 style={{fontSize:18,fontWeight:700,marginBottom:12,borderBottom:"2px solid #1a1a1a",paddingBottom:8}}>Penalty Clause</h2>
                  <div style={{fontSize:12,lineHeight:1.9,color:"#374151"}}>{contract.penalty_clause}</div>
                </div>
              )}

              {/* Signatures */}
              <div className="section" style={{marginBottom:48}}>
                <h2 style={{fontSize:18,fontWeight:700,marginBottom:24,borderBottom:"2px solid #1a1a1a",paddingBottom:8}}>Signatures</h2>
                <p style={{fontSize:12,color:"#6b7280",marginBottom:24}}>
                  By signing below, both parties agree to be bound by the terms and conditions of this contract.
                </p>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:60}}>
                  <div>
                    <div style={{fontWeight:700,fontSize:13,marginBottom:4}}>CONTRACTOR</div>
                    <div style={{fontSize:12,color:"#6b7280",marginBottom:32}}>{company?.company_name || company?.company_name||"Magnus Boys Construction"}</div>
                    {contract.contractor_signed_at ? (
                      <div style={{fontSize:12,color:"#16a34a",fontWeight:700}}>✓ Signed {fmtDate(contract.contractor_signed_at)}</div>
                    ) : (
                      <div style={{borderTop:"2px solid #1a1a1a",paddingTop:8,fontSize:11,color:"#9ca3af"}}>Authorized Signature & Date</div>
                    )}
                    <div style={{marginTop:16,borderTop:"1px solid #e5e7eb",paddingTop:8,fontSize:11,color:"#9ca3af"}}>Print Name</div>
                    <div style={{marginTop:16,borderTop:"1px solid #e5e7eb",paddingTop:8,fontSize:11,color:"#9ca3af"}}>Title</div>
                  </div>
                  <div>
                    <div style={{fontWeight:700,fontSize:13,marginBottom:4}}>CLIENT</div>
                    <div style={{fontSize:12,color:"#6b7280",marginBottom:32}}>{contract.client?.contact_name || contract.client?.name || "Client"}</div>
                    {contract.client_signed_at ? (
                      <div style={{fontSize:12,color:"#16a34a",fontWeight:700}}>✓ Signed {fmtDate(contract.client_signed_at)}</div>
                    ) : (
                      <div style={{borderTop:"2px solid #1a1a1a",paddingTop:8,fontSize:11,color:"#9ca3af"}}>Authorized Signature & Date</div>
                    )}
                    <div style={{marginTop:16,borderTop:"1px solid #e5e7eb",paddingTop:8,fontSize:11,color:"#9ca3af"}}>Print Name</div>
                    <div style={{marginTop:16,borderTop:"1px solid #e5e7eb",paddingTop:8,fontSize:11,color:"#9ca3af"}}>Witness</div>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div style={{borderTop:"2px solid #1a1a1a",paddingTop:16,textAlign:"center",fontSize:11,color:"#9ca3af"}}>
                {company?.company_name || company?.company_name||"Magnus Boys Construction"} · {company?.phone || ""} · {company?.email || ""} · Powered by Magnus ERP
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function ContractsPage() {
  const nav = useNavigate();
  const { settings: company } = useCompanySettings();
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [companyId, setCompanyId] = useState<string>("");
  const [watermark, setWatermark] = useState<{url:string;opacity:number;size?:number}|null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Modals
  const [showNew, setShowNew] = useState(false);
  const [viewingContract, setViewingContract] = useState<Contract | null>(null);
  const [showPDF, setShowPDF] = useState(false);
  const [editingContract, setEditingContract] = useState<Contract | null>(null);

  // Payment schedule
  const [schedule, setSchedule] = useState<PaymentSchedule[]>([]);
  const [saving, setSaving] = useState(false);

  // AI
  const [aiLoading, setAiLoading] = useState<string | null>(null);

  // New contract form
  const [form, setForm] = useState({
    contract_name: "", client_id: "", project_id: "", contract_number: genContractNo(),
    contract_date: new Date().toISOString().slice(0,10),
    start_date: "", completion_date: "",
    contract_amount: "", retention_percent: "5",
    payment_terms: "Payment due within 14 days of invoice.",
    scope_of_work: "", terms_and_conditions: DEFAULT_TERMS,
    penalty_clause: "", warranty_period_months: "12",
    governing_law: "Jamaica", notes: "", status: "draft",
  });

  // Default payment schedule
  const defaultSchedule: PaymentSchedule[] = [
    { milestone_name:"Deposit",          milestone_description:"Initial deposit to commence work",      due_date:"", amount:0, percent_complete:0,  status:"pending", sort_order:1 },
    { milestone_name:"Foundation",       milestone_description:"Upon completion of foundation works",   due_date:"", amount:0, percent_complete:25, status:"pending", sort_order:2 },
    { milestone_name:"Superstructure",   milestone_description:"Upon completion of superstructure",     due_date:"", amount:0, percent_complete:50, status:"pending", sort_order:3 },
    { milestone_name:"Roofing",          milestone_description:"Upon completion of roofing",            due_date:"", amount:0, percent_complete:75, status:"pending", sort_order:4 },
    { milestone_name:"Final Payment",    milestone_description:"Upon practical completion",             due_date:"", amount:0, percent_complete:100,status:"pending", sort_order:5 },
  ];
  const [newSchedule, setNewSchedule] = useState<PaymentSchedule[]>(defaultSchedule);

  useEffect(() => {
    async function init() {
      const { data:{ user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data:p } = await supabase.from("user_profiles").select("company_id").eq("id",user.id).maybeSingle();
      if (p?.company_id) {
        setCompanyId(p.company_id);
        await loadAll(p.company_id);
        const {data:cs} = await supabase.from("company_settings").select("*").eq("company_id",p.company_id).maybeSingle();
        if(cs?.watermark_enabled && cs?.watermark_url){
          setWatermark({url:cs.watermark_url, opacity:cs.watermark_opacity||0.15, size:cs.watermark_size||25});
        }
      }
    }
    init();
  }, []);

  async function loadAll(cid: string) {
    setLoading(true);
    try {
      const [contractsRes, clientsRes, projectsRes] = await Promise.all([
        supabase.from("client_contracts")
          .select("*, project:project_id(name), client:client_id(name,contact_name,email,phone,address)")
          .eq("company_id", cid).order("created_at", { ascending: false }),
        supabase.from("clients").select("id,name,contact_name,email,phone,address").eq("company_id", cid).order("name"),
        supabase.from("projects").select("id,name,status").eq("company_id", cid).order("name"),
      ]);
      setContracts((contractsRes.data || []) as Contract[]);
      setClients(clientsRes.data || []);
      setProjects(projectsRes.data || []);
    } catch (e: any) { setError(e.message); }
    setLoading(false);
  }

  async function loadSchedule(contractId: string) {
    const { data } = await supabase.from("contract_payment_schedules")
      .select("*").eq("contract_id", contractId).order("sort_order");
    setSchedule(data || []);
  }

  async function createContract() {
    if (!form.contract_name.trim()) { setError("Contract name is required."); return; }
    setSaving(true);
    try {
      const { data, error: e } = await supabase.from("client_contracts").insert({
        company_id: companyId,
        project_id: form.project_id || null,
        client_id: form.client_id || null,
        contract_number: form.contract_number,
        contract_name: form.contract_name.trim(),
        contract_date: form.contract_date || null,
        start_date: form.start_date || null,
        completion_date: form.completion_date || null,
        contract_amount: parseFloat(form.contract_amount) || 0,
        retention_percent: parseFloat(form.retention_percent) || 0,
        payment_terms: form.payment_terms || null,
        scope_of_work: form.scope_of_work || null,
        terms_and_conditions: form.terms_and_conditions || null,
        penalty_clause: form.penalty_clause || null,
        warranty_period_months: parseInt(form.warranty_period_months) || 12,
        governing_law: form.governing_law || "Jamaica",
        notes: form.notes || null,
        status: "draft",
      }).select().single();
      if (e) throw e;

      // Save payment schedule
      const scheduleItems = newSchedule.filter(s => s.milestone_name.trim());
      if (scheduleItems.length > 0) {
        await supabase.from("contract_payment_schedules").insert(
          scheduleItems.map(s => ({
            contract_id: data.id, company_id: companyId,
            milestone_name: s.milestone_name, milestone_description: s.milestone_description,
            due_date: s.due_date || null, amount: Number(s.amount) || 0,
            percent_complete: Number(s.percent_complete) || 0,
            status: "pending", sort_order: s.sort_order,
          }))
        );
      }
      showToast("Contract created!");
      setShowNew(false);
      await loadAll(companyId);
    } catch (e: any) { setError(e.message); }
    setSaving(false);
  }

  async function updateContract(id: string, updates: Partial<Contract>) {
    await supabase.from("client_contracts").update({ ...updates, updated_at: new Date().toISOString() }).eq("id", id);
    setContracts(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c));
    if (viewingContract?.id === id) setViewingContract(prev => prev ? { ...prev, ...updates } : null);
  }

  async function deleteContract(id: string) {
    if (!confirm("Delete this contract and all payment schedules?")) return;
    await supabase.from("contract_payment_schedules").delete().eq("contract_id", id);
    await supabase.from("client_contracts").delete().eq("id", id);
    setContracts(prev => prev.filter(c => c.id !== id));
    if (viewingContract?.id === id) setViewingContract(null);
    showToast("Contract deleted.");
  }

  async function duplicateContract(contract: Contract) {
    const { data } = await supabase.from("client_contracts").insert({
      ...contract, id: undefined, contract_number: genContractNo(),
      contract_name: contract.contract_name + " (Copy)",
      status: "draft", contractor_signed_at: null, client_signed_at: null,
      created_at: undefined, updated_at: undefined,
    }).select().single();
    if (data) {
      const { data: sched } = await supabase.from("contract_payment_schedules").select("*").eq("contract_id", contract.id);
      if (sched?.length) {
        await supabase.from("contract_payment_schedules").insert(sched.map((s: any) => ({ ...s, id: undefined, contract_id: data.id, created_at: undefined, updated_at: undefined })));
      }
      showToast("Contract duplicated!");
      await loadAll(companyId);
    }
  }

  async function signContract(contractId: string, party: "contractor" | "client") {
    const field = party === "contractor" ? "contractor_signed_at" : "client_signed_at";
    await updateContract(contractId, { [field]: new Date().toISOString() } as any);
    showToast(`${party === "contractor" ? "Contractor" : "Client"} signature recorded!`);
  }

  // ─── AI Functions ───────────────────────────────────────────────────────────
  async function aiGenerateScope() {
    if (!form.contract_name.trim()) { setError("Enter a contract name first."); return; }
    setAiLoading("scope");
    try {
      const project = projects.find(p => p.id === form.project_id);
      const client = clients.find(c => c.id === form.client_id);
      const text = await magnusAI.chat(
        `You are a Jamaica construction contract specialist for Magnus Boys Construction.
Write a professional Scope of Work for this construction contract:

Contract: ${form.contract_name}
Project: ${project?.name || "General Construction"}
Client: ${client?.name || "Client"}
Contract Value: JMD ${form.contract_amount || "TBD"}
Start Date: ${form.start_date || "TBD"}
Completion Date: ${form.completion_date || "TBD"}

Write a detailed, professional scope of work that:
1. Describes exactly what work will be performed
2. Lists what IS included
3. Lists what is NOT included (exclusions)
4. Mentions materials responsibility
5. References Jamaica building standards where applicable

Format it clearly with numbered sections. Be specific and professional.
This document represents Magnus Boys Construction to the client.`
      );
      setForm(f => ({ ...f, scope_of_work: String(text).trim() }));
      showToast("Scope of work generated!");
    } catch { setError("Could not generate scope. Try again."); }
    setAiLoading(null);
  }

  async function aiGeneratePaymentSchedule() {
    if (!form.contract_amount) { setError("Enter contract amount first."); return; }
    setAiLoading("schedule");
    try {
      const amount = parseFloat(form.contract_amount);
      const text = await magnusAI.chat(
        `You are a Jamaica construction payment schedule expert.
Create a payment schedule for a construction contract worth JMD ${fmtJMD(amount)}.
Project: ${form.contract_name}
Duration: ${form.start_date ? `${form.start_date} to ${form.completion_date || "TBD"}` : "TBD"}

Respond ONLY with this JSON array, no other text:
[
  {"milestone_name":"Deposit","milestone_description":"Initial deposit to commence work","percent":30},
  {"milestone_name":"Foundation Complete","milestone_description":"Upon completion of foundation works","percent":20},
  {"milestone_name":"Superstructure Complete","milestone_description":"Upon completion of superstructure to wall plate","percent":25},
  {"milestone_name":"Roofing Complete","milestone_description":"Upon completion of roofing works","percent":15},
  {"milestone_name":"Practical Completion","milestone_description":"Upon final inspection and handover","percent":10}
]

Adjust percentages based on the project type and value. Make sure they add up to 100.`
      );
      const clean = String(text).replace(/```json|```/g,"").trim();
      const start = clean.indexOf("["), end = clean.lastIndexOf("]");
      if (start === -1) throw new Error("No JSON");
      const parsed = JSON.parse(clean.slice(start, end+1));
      const generated: PaymentSchedule[] = parsed.map((p: any, i: number) => ({
        milestone_name: p.milestone_name,
        milestone_description: p.milestone_description,
        due_date: "",
        amount: Math.round(amount * (p.percent / 100)),
        percent_complete: p.percent,
        status: "pending",
        sort_order: i + 1,
      }));
      setNewSchedule(generated);
      showToast("Payment schedule generated!");
    } catch { setError("Could not generate schedule. Try again."); }
    setAiLoading(null);
  }

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(null), 3000); }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return contracts.filter(c => {
      const matchSearch = !q || c.contract_name.toLowerCase().includes(q) || c.contract_number.toLowerCase().includes(q) || (c.client?.name || "").toLowerCase().includes(q);
      const matchStatus = !statusFilter || c.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [contracts, search, statusFilter]);

  const stats = {
    total: contracts.length,
    draft: contracts.filter(c => c.status === "draft").length,
    active: contracts.filter(c => c.status === "active" || c.status === "signed").length,
    totalValue: contracts.reduce((s, c) => s + Number(c.contract_amount || 0), 0),
  };

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#080b10] text-slate-100">

      {/* Header */}
      <div className="border-b border-white/[0.06] bg-[#0d1117] px-6 py-5 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-100">Contracts & Proposals</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            {stats.total} contracts · <span className="text-emerald-400 font-semibold">{fmtJMD(stats.totalValue)}</span> total value
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => loadAll(companyId)} className="p-2 rounded-lg bg-white/[0.04] hover:bg-white/[0.07] border border-white/[0.08] text-slate-500 hover:text-slate-300 transition">
            <RefreshCw size={13} className={loading ? "animate-spin" : ""}/>
          </button>
          <button onClick={() => { setForm({...form, contract_number: genContractNo()}); setNewSchedule(defaultSchedule); setShowNew(true); }}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold transition shadow-sm">
            <Plus size={13}/> New Contract
          </button>
        </div>
      </div>

      <div className="p-6 space-y-5">

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label:"Total Contracts", value:stats.total,              color:"text-slate-200",   key:"" },
            { label:"Draft",           value:stats.draft,              color:"text-slate-400",   key:"draft" },
            { label:"Active/Signed",   value:stats.active,             color:"text-emerald-400", key:"active" },
            { label:"Total Value",     value:fmtJMD(stats.totalValue), color:"text-blue-400",    key:"" },
          ].map(s => (
            <button key={s.label} onClick={() => s.key && setStatusFilter(sf => sf === s.key ? "" : s.key)}
              className={`rounded-xl border p-4 text-left transition-all ${statusFilter === s.key && s.key ? "border-blue-500/30 bg-blue-500/10" : "border-white/[0.07] bg-[#0d1117] hover:border-white/[0.12]"}`}>
              <div className="text-[9px] font-bold uppercase tracking-widest text-slate-600 mb-1">{s.label}</div>
              <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
            </button>
          ))}
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-48 max-w-sm">
            <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600 pointer-events-none"/>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search contracts…"
              className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg pl-8 pr-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 outline-none focus:border-blue-500/50"/>
          </div>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            className="bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-slate-400 outline-none w-40">
            <option value="">All statuses</option>
            {Object.entries(STATUS_CFG).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>

        {/* Contract Grid */}
        {loading ? (
          <div className="flex items-center justify-center py-16 text-slate-600 text-sm gap-2">
            <RefreshCw size={14} className="animate-spin"/> Loading contracts…
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
            <div className="w-14 h-14 rounded-2xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center">
              <FileText size={22} className="text-slate-700"/>
            </div>
            <p className="text-slate-400 text-sm font-medium">{search ? "No contracts match" : "No contracts yet"}</p>
            <p className="text-slate-700 text-xs">Create your first professional contract</p>
            <button onClick={() => setShowNew(true)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition mt-1">
              <Plus size={12}/> New Contract
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtered.map(c => (
              <ContractCard key={c.id} contract={c}
                onView={async () => { setViewingContract(c); await loadSchedule(c.id); }}
                onDelete={() => deleteContract(c.id)}
                onDuplicate={() => duplicateContract(c)}/>
            ))}
          </div>
        )}
      </div>

      {/* ── Contract Detail Modal ── */}
      {viewingContract && !showPDF && (
        <div className="fixed inset-0 z-50 flex bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-3xl ml-auto bg-[#0d1117] border-l border-white/[0.08] flex flex-col h-full overflow-y-auto">
            {/* Header */}
            <div className="flex-shrink-0 flex items-center justify-between px-6 py-4 border-b border-white/[0.07] bg-[#080b10]/50 sticky top-0 z-10">
              <div>
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-base font-bold text-slate-100">{viewingContract.contract_name}</span>
                  {(() => { const cfg = STATUS_CFG[viewingContract.status] || STATUS_CFG.draft; return (
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold border ${cfg.color} ${cfg.bg} ${cfg.border}`}>
                      {cfg.icon} {cfg.label}
                    </span>
                  ); })()}
                </div>
                <p className="text-[11px] text-slate-600 font-mono">{viewingContract.contract_number}</p>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => {
                    const msg = encodeURIComponent(`Hello ${viewingContract.client?.contact_name || viewingContract.client?.name || ""},\n\nPlease find your contract details below:\n\nContract: ${viewingContract.contract_name}\nContract No: ${viewingContract.contract_number}\nValue: ${fmtJMD(viewingContract.contract_amount)}\n\nPlease contact us to review and sign.\n\nMagnus Boys Construction`);
                    window.open(`https://wa.me/?text=${msg}`, "_blank");
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition">
                  <Send size={12}/> WhatsApp
                </button>
                <button onClick={() => {
                    const subject = encodeURIComponent(`Contract: ${viewingContract.contract_name} - ${viewingContract.contract_number}`);
                    const body = encodeURIComponent(`Dear ${viewingContract.client?.contact_name || viewingContract.client?.name || "Client"},\n\nPlease find your contract details below:\n\nContract Name: ${viewingContract.contract_name}\nContract No: ${viewingContract.contract_number}\nContract Value: ${fmtJMD(viewingContract.contract_amount)}\nStart Date: ${fmtDate(viewingContract.start_date)}\nCompletion Date: ${fmtDate(viewingContract.completion_date)}\n\nPlease contact us to review and sign.\n\nRegards,\nMagnus Boys Construction`);
                    const email = viewingContract.client?.email || "";
                    window.open(`mailto:${email}?subject=${subject}&body=${body}`, "_blank");
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-700 hover:bg-blue-600 text-white text-xs font-bold transition">
                  <Send size={12}/> Email
                </button>
                <button onClick={() => setShowPDF(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.08] text-white text-xs font-bold transition">
                  <Eye size={12}/> Preview & Print
                </button>
                <button onClick={() => setViewingContract(null)} className="p-1.5 rounded-lg hover:bg-white/[0.06] text-slate-500 hover:text-slate-300 transition">
                  <X size={15}/>
                </button>
              </div>
            </div>

            <div className="flex-1 p-6 space-y-5">
              {/* Key Details */}
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label:"Client",    value:viewingContract.client?.contact_name || viewingContract.client?.name || "—" },
                  { label:"Project",   value:viewingContract.project?.name || "—" },
                  { label:"Value",     value:fmtJMD(viewingContract.contract_amount) },
                  { label:"Retention", value:`${viewingContract.retention_percent || 0}%` },
                  { label:"Start",     value:fmtDate(viewingContract.start_date) },
                  { label:"Complete",  value:fmtDate(viewingContract.completion_date) },
                ].map(d => (
                  <div key={d.label} className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3">
                    <div className="text-[9px] font-bold uppercase tracking-widest text-slate-700 mb-1">{d.label}</div>
                    <div className="text-sm font-bold text-slate-200">{d.value}</div>
                  </div>
                ))}
              </div>

              {/* Status Actions */}
              <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
                <div className="text-[10px] font-bold uppercase tracking-widest text-slate-600 mb-3">Update Status</div>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(STATUS_CFG).map(([k, cfg]) => (
                    <button key={k} onClick={() => updateContract(viewingContract.id, { status: k } as any)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[11px] font-semibold transition ${viewingContract.status === k ? `${cfg.bg} ${cfg.border} ${cfg.color}` : "border-white/[0.07] text-slate-600 hover:text-slate-300"}`}>
                      {cfg.icon} {cfg.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Signatures */}
              <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
                <div className="text-[10px] font-bold uppercase tracking-widest text-slate-600 mb-3">Digital Signatures</div>
                <div className="grid grid-cols-2 gap-3">
                  <div className={`rounded-xl border p-3 ${viewingContract.contractor_signed_at ? "border-emerald-500/20 bg-emerald-500/[0.06]" : "border-white/[0.06]"}`}>
                    <div className="flex items-center gap-2 mb-2">
                      <Shield size={12} className={viewingContract.contractor_signed_at ? "text-emerald-400" : "text-slate-600"}/>
                      <span className="text-xs font-bold text-slate-300">Contractor</span>
                    </div>
                    {viewingContract.contractor_signed_at ? (
                      <div className="text-[11px] text-emerald-400 font-semibold">✓ Signed {fmtDate(viewingContract.contractor_signed_at)}</div>
                    ) : (
                      <button onClick={() => signContract(viewingContract.id, "contractor")}
                        className="w-full py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold transition">
                        Sign Now
                      </button>
                    )}
                  </div>
                  <div className={`rounded-xl border p-3 ${viewingContract.client_signed_at ? "border-emerald-500/20 bg-emerald-500/[0.06]" : "border-white/[0.06]"}`}>
                    <div className="flex items-center gap-2 mb-2">
                      <Users size={12} className={viewingContract.client_signed_at ? "text-emerald-400" : "text-slate-600"}/>
                      <span className="text-xs font-bold text-slate-300">Client</span>
                    </div>
                    {viewingContract.client_signed_at ? (
                      <div className="text-[11px] text-emerald-400 font-semibold">✓ Signed {fmtDate(viewingContract.client_signed_at)}</div>
                    ) : (
                      <button onClick={() => signContract(viewingContract.id, "client")}
                        className="w-full py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-bold transition">
                        Record Signature
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Payment Schedule */}
              <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] overflow-hidden">
                <div className="px-4 py-3 border-b border-white/[0.06] flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-slate-600">Payment Schedule</span>
                  <span className="text-xs text-slate-600">{schedule.length} milestones</span>
                </div>
                {schedule.length === 0 ? (
                  <div className="text-center py-6 text-xs text-slate-600">No payment schedule set</div>
                ) : (
                  <div>
                    {schedule.map((p, i) => (
                      <div key={p.id || i} className={`flex items-center gap-4 px-4 py-3 border-b border-white/[0.04] last:border-0 ${i%2===1?"bg-white/[0.01]":""}`}>
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-[10px] font-bold ${p.status==="paid"?"bg-emerald-500/20 text-emerald-400":"bg-white/[0.06] text-slate-500"}`}>
                          {p.status === "paid" ? "✓" : i+1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-bold text-slate-200">{p.milestone_name}</div>
                          <div className="text-[10px] text-slate-600">{p.milestone_description}</div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <div className="text-sm font-bold text-emerald-400">{fmtJMD(Number(p.amount))}</div>
                          <div className="text-[9px] text-slate-700">{fmtDate(p.due_date)}</div>
                        </div>
                        <select value={p.status}
                          onChange={async e => {
                            await supabase.from("contract_payment_schedules").update({ status: e.target.value }).eq("id", p.id!);
                            await loadSchedule(viewingContract.id);
                          }}
                          className="text-[10px] bg-[#080b10] border border-white/[0.07] rounded px-1.5 py-1 text-slate-400 outline-none w-20">
                          <option value="pending">Pending</option>
                          <option value="invoiced">Invoiced</option>
                          <option value="paid">Paid</option>
                        </select>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Scope */}
              {viewingContract.scope_of_work && (
                <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-slate-600 mb-3">Scope of Work</div>
                  <div className="text-xs text-slate-400 leading-relaxed whitespace-pre-wrap max-h-48 overflow-y-auto">{viewingContract.scope_of_work}</div>
                </div>
              )}

              {/* Notes */}
              {viewingContract.notes && (
                <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-slate-600 mb-2">Notes</div>
                  <div className="text-xs text-slate-400 leading-relaxed">{viewingContract.notes}</div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── PDF Preview ── */}
      {showPDF && viewingContract && (
        <ContractPDFPreview watermark={watermark}
          contract={viewingContract} schedule={schedule} company={company}
          onClose={() => setShowPDF(false)}/>
      )}

      {/* ── New Contract Modal ── */}
      {showNew && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="w-full max-w-3xl rounded-2xl border border-white/[0.08] bg-[#0d1117] shadow-2xl my-8">
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.07]">
              <div>
                <div className="text-sm font-bold text-slate-100">New Contract & Proposal</div>
                <div className="text-[11px] text-slate-500 mt-0.5">Create a professional contract for your client</div>
              </div>
              <button onClick={() => { setShowNew(false); setError(null); }} className="p-1.5 rounded-lg hover:bg-white/[0.06] text-slate-500 hover:text-slate-300 transition"><X size={15}/></button>
            </div>

            <div className="p-6 space-y-5">
              {error && (
                <div className="flex items-center gap-2 rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2">
                  <AlertCircle size={11} className="text-red-400"/>
                  <span className="text-[11px] text-red-300">{error}</span>
                  <button onClick={() => setError(null)} className="ml-auto"><X size={11} className="text-slate-600 hover:text-slate-400"/></button>
                </div>
              )}

              {/* Section 1: Basic Info */}
              <div className="space-y-3">
                <div className="text-[10px] font-bold uppercase tracking-widest text-slate-600">Contract Details</div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <label className="text-[10px] text-slate-500 block mb-1.5 font-medium uppercase tracking-wider">Contract Name *</label>
                    <input value={form.contract_name} onChange={e => setForm(f => ({ ...f, contract_name: e.target.value }))} autoFocus
                      placeholder="e.g. Residential Construction - Smith Residence"
                      className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2.5 text-sm text-slate-200 outline-none focus:border-blue-500/50"/>
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-500 block mb-1.5 font-medium uppercase tracking-wider">Contract Number</label>
                    <input value={form.contract_number} onChange={e => setForm(f => ({ ...f, contract_number: e.target.value }))}
                      className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2.5 text-sm text-slate-200 font-mono outline-none focus:border-blue-500/50"/>
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-500 block mb-1.5 font-medium uppercase tracking-wider">Contract Date</label>
                    <input type="date" value={form.contract_date} onChange={e => setForm(f => ({ ...f, contract_date: e.target.value }))}
                      className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2.5 text-sm text-slate-200 outline-none focus:border-blue-500/50"/>
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-500 block mb-1.5 font-medium uppercase tracking-wider">Client</label>
                    <select value={form.client_id} onChange={e => setForm(f => ({ ...f, client_id: e.target.value }))}
                      className="w-full bg-[#080b10] border border-white/[0.08] rounded-lg px-3 py-2.5 text-sm text-slate-200 outline-none focus:border-blue-500/50">
                      <option value="">Select client…</option>
                      {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-500 block mb-1.5 font-medium uppercase tracking-wider">Project</label>
                    <select value={form.project_id} onChange={e => setForm(f => ({ ...f, project_id: e.target.value }))}
                      className="w-full bg-[#080b10] border border-white/[0.08] rounded-lg px-3 py-2.5 text-sm text-slate-200 outline-none focus:border-blue-500/50">
                      <option value="">Select project…</option>
                      {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-500 block mb-1.5 font-medium uppercase tracking-wider">Contract Value (JMD)</label>
                    <input type="number" value={form.contract_amount} onChange={e => setForm(f => ({ ...f, contract_amount: e.target.value }))}
                      placeholder="0.00"
                      className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2.5 text-sm text-slate-200 outline-none focus:border-blue-500/50"/>
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-500 block mb-1.5 font-medium uppercase tracking-wider">Retention %</label>
                    <input type="number" value={form.retention_percent} onChange={e => setForm(f => ({ ...f, retention_percent: e.target.value }))}
                      className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2.5 text-sm text-slate-200 outline-none focus:border-blue-500/50"/>
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-500 block mb-1.5 font-medium uppercase tracking-wider">Start Date</label>
                    <input type="date" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))}
                      className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2.5 text-sm text-slate-200 outline-none focus:border-blue-500/50"/>
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-500 block mb-1.5 font-medium uppercase tracking-wider">Completion Date</label>
                    <input type="date" value={form.completion_date} onChange={e => setForm(f => ({ ...f, completion_date: e.target.value }))}
                      className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2.5 text-sm text-slate-200 outline-none focus:border-blue-500/50"/>
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-500 block mb-1.5 font-medium uppercase tracking-wider">Warranty Period (months)</label>
                    <input type="number" value={form.warranty_period_months} onChange={e => setForm(f => ({ ...f, warranty_period_months: e.target.value }))}
                      className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2.5 text-sm text-slate-200 outline-none focus:border-blue-500/50"/>
                  </div>
                </div>
              </div>

              {/* Section 2: Scope of Work */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-slate-600">Scope of Work</div>
                  <button onClick={aiGenerateScope} disabled={aiLoading === "scope" || !form.contract_name.trim()}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/20 text-[10px] text-purple-400 font-semibold disabled:opacity-40 transition">
                    {aiLoading === "scope" ? <Loader size={9} className="animate-spin"/> : <Sparkles size={9}/>}
                    {aiLoading === "scope" ? "Writing…" : "AI Write Scope"}
                  </button>
                </div>
                <textarea value={form.scope_of_work} onChange={e => setForm(f => ({ ...f, scope_of_work: e.target.value }))}
                  rows={6} placeholder="Describe the work to be performed…"
                  className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2.5 text-sm text-slate-200 placeholder:text-slate-600 outline-none focus:border-blue-500/50 resize-none"/>
              </div>

              {/* Section 3: Payment Schedule */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-slate-600">Payment Schedule</div>
                  <button onClick={aiGeneratePaymentSchedule} disabled={aiLoading === "schedule" || !form.contract_amount}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/20 text-[10px] text-purple-400 font-semibold disabled:opacity-40 transition">
                    {aiLoading === "schedule" ? <Loader size={9} className="animate-spin"/> : <Sparkles size={9}/>}
                    {aiLoading === "schedule" ? "Generating…" : "AI Suggest Schedule"}
                  </button>
                </div>
                <div className="rounded-xl border border-white/[0.07] overflow-hidden">
                  <div className="grid text-[9px] font-bold uppercase tracking-widest text-slate-700 px-4 py-2 bg-white/[0.02] border-b border-white/[0.05]"
                    style={{gridTemplateColumns:"2fr 2fr 120px 120px 24px"}}>
                    <span>Milestone</span><span>Description</span><span>Amount (JMD)</span><span>Due Date</span><span/>
                  </div>
                  {newSchedule.map((p, i) => (
                    <div key={i} className={`grid items-center px-4 py-2 gap-2 border-b border-white/[0.04] last:border-0 ${i%2===1?"bg-white/[0.01]":""}`}
                      style={{gridTemplateColumns:"2fr 2fr 120px 120px 24px"}}>
                      <input value={p.milestone_name} onChange={e => setNewSchedule(s => s.map((x,j)=>j===i?{...x,milestone_name:e.target.value}:x))}
                        className="bg-white/[0.04] border border-white/[0.07] rounded px-2 py-1.5 text-[11px] text-slate-200 outline-none focus:border-blue-500/40"/>
                      <input value={p.milestone_description} onChange={e => setNewSchedule(s => s.map((x,j)=>j===i?{...x,milestone_description:e.target.value}:x))}
                        className="bg-white/[0.04] border border-white/[0.07] rounded px-2 py-1.5 text-[11px] text-slate-400 outline-none focus:border-blue-500/40"/>
                      <input type="number" value={p.amount} onChange={e => setNewSchedule(s => s.map((x,j)=>j===i?{...x,amount:Number(e.target.value)}:x))}
                        className="bg-white/[0.04] border border-white/[0.07] rounded px-2 py-1.5 text-[11px] text-slate-200 outline-none focus:border-blue-500/40 text-right"/>
                      <input type="date" value={p.due_date} onChange={e => setNewSchedule(s => s.map((x,j)=>j===i?{...x,due_date:e.target.value}:x))}
                        className="bg-white/[0.04] border border-white/[0.07] rounded px-2 py-1.5 text-[11px] text-slate-200 outline-none focus:border-blue-500/40"/>
                      <button onClick={() => setNewSchedule(s => s.filter((_,j)=>j!==i))} className="text-slate-700 hover:text-red-400 transition"><X size={12}/></button>
                    </div>
                  ))}
                  <div className="px-4 py-2 border-t border-white/[0.05] flex items-center justify-between">
                    <button onClick={() => setNewSchedule(s => [...s, { milestone_name:"", milestone_description:"", due_date:"", amount:0, percent_complete:0, status:"pending", sort_order:s.length+1 }])}
                      className="flex items-center gap-1 text-[10px] text-slate-600 hover:text-slate-300 transition">
                      <Plus size={10}/> Add milestone
                    </button>
                    <span className="text-[10px] text-slate-600 font-mono">
                      Total: {fmtJMD(newSchedule.reduce((s,p)=>s+Number(p.amount||0),0))}
                    </span>
                  </div>
                </div>
              </div>

              {/* Section 4: Terms */}
              <div className="space-y-2">
                <div className="text-[10px] font-bold uppercase tracking-widest text-slate-600">Terms & Conditions</div>
                <textarea value={form.terms_and_conditions} onChange={e => setForm(f => ({ ...f, terms_and_conditions: e.target.value }))}
                  rows={8} placeholder="Terms and conditions…"
                  className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2.5 text-xs text-slate-400 placeholder:text-slate-600 outline-none focus:border-blue-500/50 resize-none font-mono leading-relaxed"/>
              </div>

              {/* Section 5: Optional */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] text-slate-500 block mb-1.5 font-medium uppercase tracking-wider">Penalty Clause (optional)</label>
                  <textarea value={form.penalty_clause} onChange={e => setForm(f => ({ ...f, penalty_clause: e.target.value }))}
                    rows={3} placeholder="e.g. JMD 5,000 per day for delays beyond completion date…"
                    className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-xs text-slate-400 placeholder:text-slate-600 outline-none focus:border-blue-500/50 resize-none"/>
                </div>
                <div>
                  <label className="text-[10px] text-slate-500 block mb-1.5 font-medium uppercase tracking-wider">Payment Terms</label>
                  <textarea value={form.payment_terms} onChange={e => setForm(f => ({ ...f, payment_terms: e.target.value }))}
                    rows={3} placeholder="e.g. Payment due within 14 days of invoice."
                    className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-xs text-slate-400 placeholder:text-slate-600 outline-none focus:border-blue-500/50 resize-none"/>
                </div>
              </div>

              <div>
                <label className="text-[10px] text-slate-500 block mb-1.5 font-medium uppercase tracking-wider">Internal Notes</label>
                <input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder="Internal notes (not shown on contract)"
                  className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2.5 text-sm text-slate-200 placeholder:text-slate-600 outline-none focus:border-blue-500/50"/>
              </div>
            </div>

            <div className="flex justify-end gap-2 px-6 py-4 border-t border-white/[0.07]">
              <button onClick={() => { setShowNew(false); setError(null); }}
                className="px-4 py-2 rounded-lg bg-white/[0.04] border border-white/[0.07] text-sm text-slate-400 hover:text-slate-200 transition">Cancel</button>
              <button onClick={createContract} disabled={!form.contract_name.trim() || saving}
                className="flex items-center gap-1.5 px-6 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold disabled:opacity-40 transition">
                <Plus size={13}/> {saving ? "Creating…" : "Create Contract"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[300] pointer-events-none">
          <div className="bg-[#0d1117] border border-emerald-500/25 text-emerald-400 text-sm font-semibold px-5 py-3 rounded-xl shadow-2xl flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"/>
            {toast}
          </div>
        </div>
      )}
    </div>
  );
}