// src/pages/SettingsRecordsPage.tsx — Worker Records & ID Management
// Admin/Director only — print company worker IDs and field worker file sheets
import React, { useEffect, useState, useRef } from "react";
import { supabase } from "../lib/supabase";
import { useNavigate } from "react-router-dom";
import { Printer, Search, User, FileText, ChevronLeft, Shield, CreditCard, Briefcase, IdCard, Camera, X } from "lucide-react";
import { StaffIDCard } from "../components/StaffIDCard";
import { WorkerIDCard } from "../components/WorkerIDCard";
import { canManageStaff } from "../lib/permissions";
import EditableDropdown from "../components/common/EditableDropdown";
import PhotoCropModal from "../components/PhotoCropModal";

function fmtJMD(n: number) {
  return new Intl.NumberFormat("en-US",{style:"currency",currency:"JMD",minimumFractionDigits:0}).format(n);
}
function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-US",{month:"long",day:"numeric",year:"numeric"});
}

export default function SettingsRecordsPage() {
  const navigate = useNavigate();
  const [allowed, setAllowed] = useState<boolean|null>(null);
  const [companyId, setCompanyId] = useState<string|null>(null);
  const [company, setCompany] = useState<any>(null);
  const [logoBase64, setLogoBase64] = useState<string|null>(null);
  const [watermark, setWatermark] = useState<{url:string;opacity:number;size?:number}|null>(null);
  const [tab, setTab] = useState<"company"|"field"|"staff">("company");
  const [search, setSearch] = useState("");
  const [companyWorkers, setCompanyWorkers] = useState<any[]>([]);
  const [fieldWorkers, setFieldWorkers] = useState<any[]>([]);
  const [loadingWorkers, setLoadingWorkers] = useState(false);
  const [fieldPayments, setFieldPayments] = useState<any[]>([]);
  const [staffProfiles, setStaffProfiles] = useState<any[]>([]);
  const [staffError, setStaffError] = useState<string|null>(null);
  const [idCardStaffId, setIdCardStaffId] = useState<string|null>(null);
  const [idCardWorkerId, setIdCardWorkerId] = useState<string|null>(null);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [selectedStaff, setSelectedStaff] = useState<any|null>(null);
  const [staffForm, setStaffForm] = useState({ full_name:"", job_title:"", employee_number:"", trn:"", id_issued_date:"", id_expiry_date:"" });
  // Suggestions for the Job Title combobox — live distinct values already in
  // use across the company (both staff and field workers), not a per-browser
  // localStorage list like WorkersPage's job title dropdown. Once a new title
  // is saved to a real record, it naturally shows up here on next load — no
  // separate master list to keep in sync.
  const [jobTitleOptions, setJobTitleOptions] = useState<string[]>([]);
  const [newPhotoUrl, setNewPhotoUrl] = useState<string|null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [cropSrc, setCropSrc] = useState<string|null>(null); // object URL of the just-selected file, pending crop
  const [savingStaff, setSavingStaff] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);

  // Auth check — director only
  useEffect(()=>{
    supabase.auth.getUser().then(async({data})=>{
      if(!data.user){ setAllowed(false); return; }
      const {data:p}=await supabase.from("user_profiles").select("company_id,role").eq("id",data.user.id).maybeSingle();
      if(!p){ setAllowed(false); return; }
      const isAdmin = canManageStaff(p.role);
      setAllowed(isAdmin);
      if(isAdmin && p.company_id){
        setCompanyId(p.company_id);
        // Load company settings
        supabase.from("company_settings").select("*").eq("company_id",p.company_id).maybeSingle()
          .then(({data:cs})=>{
            setCompany(cs);
            if(cs?.watermark_enabled && cs?.watermark_url){
              setWatermark({url:cs.watermark_url, opacity:cs.watermark_opacity||0.15, size:cs.watermark_size||25});
            } else { setWatermark(null); }
            if(cs?.logo_url){
              fetch(cs.logo_url).then(r=>r.blob())
                .then(blob=>new Promise<string>((res,rej)=>{const fr=new FileReader();fr.onload=()=>res(fr.result as string);fr.onerror=rej;fr.readAsDataURL(blob);}))
                .then(b64=>setLogoBase64(b64)).catch(()=>{});
            }
          });
      }
    });
  },[]);

  useEffect(()=>{
    if(!companyId) return;
    setLoadingWorkers(true);
    Promise.all([
      supabase.from("workers").select("*").eq("company_id",companyId).order("last_name"),
      supabase.from("field_payments").select("*").eq("company_id",companyId).order("created_at",{ascending:false}),
    ]).then(([{data:w},{data:fp}])=>{
      setCompanyWorkers(w||[]);
      setFieldPayments(fp||[]);
      // Group field payments by worker_ref
      const workerMap: Record<string,any> = {};
      (fp||[]).forEach((p:any)=>{
        const key = p.worker_ref||p.worker_name;
        if(!workerMap[key]){
          workerMap[key]={
            name:p.worker_name, id_number:p.worker_id_number,
            phone:p.worker_phone, address:p.worker_address,
            id_photo_url:p.id_photo_url, payments:[], total:0, advances:0
          };
        }
        workerMap[key].payments.push(p);
        workerMap[key].total += p.total_amount||0;
        if(p.payment_type==="advance") workerMap[key].advances += p.total_amount||0;
        if(p.id_photo_url && !workerMap[key].id_photo_url) workerMap[key].id_photo_url = p.id_photo_url;
      });
      setFieldWorkers(Object.values(workerMap));
      setLoadingWorkers(false);
    });
    loadStaff();
    loadJobTitles();
  },[companyId]);

  async function loadStaff() {
    if(!companyId) return;
    setStaffError(null);
    // job_title migration (20260806000000_add_user_profiles_job_title.sql)
    // is confirmed applied in production — the retry-without-job_title
    // fallback that used to live here is gone. Error surfacing itself stays:
    // that's the actual fix for the original bug (a failed query silently
    // becoming "no staff" instead of showing what went wrong).
    const { data, error } = await supabase.from("user_profiles")
      .select("id, full_name, email, role, job_title, avatar_url, employee_number, trn, id_issued_date, id_expiry_date")
      .eq("company_id",companyId).order("full_name");
    if (error) {
      console.error("loadStaff error:", error);
      setStaffError(error.message);
      setStaffProfiles([]);
      return;
    }
    setStaffProfiles(data||[]);
  }

  // Distinct job titles already in use, across both field workers and staff,
  // so "Carpenter" (a worker title) shows up as a suggestion right alongside
  // "Director" (a staff title) — the two pools share one list on purpose.
  async function loadJobTitles() {
    if(!companyId) return;
    const [{data:w,error:werr},{data:sp,error:sperr}] = await Promise.all([
      supabase.from("workers").select("job_title").eq("company_id",companyId).not("job_title","is",null),
      supabase.from("user_profiles").select("job_title").eq("company_id",companyId).not("job_title","is",null),
    ]);
    // Non-critical — same job_title-column-missing case as loadStaff() can
    // hit this too (until the migration runs). Log and leave suggestions
    // empty rather than blocking the combobox entirely.
    if (werr) console.error("loadJobTitles (workers) error:", werr);
    if (sperr) console.error("loadJobTitles (user_profiles) error:", sperr);
    const set = new Set<string>();
    (w||[]).forEach((r:any)=>{ if(r.job_title?.trim()) set.add(r.job_title.trim()); });
    (sp||[]).forEach((r:any)=>{ if(r.job_title?.trim()) set.add(r.job_title.trim()); });
    setJobTitleOptions(Array.from(set).sort());
  }

  // No existing employee-ID auto-numbering pattern anywhere in the system to
  // inherit — workers.employee_id is also free-text with no format. Falls
  // back to the sequential MB-001 style the handoff allowed for this case.
  function deriveIdPrefix(name: string): string {
    const words = (name || "").trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) return "STAFF";
    return words.slice(0, 2).map(w => w[0]).join("").toUpperCase() || "STAFF";
  }

  async function generateEmployeeNumber(): Promise<string> {
    const prefix = deriveIdPrefix(company?.company_name || "");
    const { data } = await supabase
      .from("user_profiles")
      .select("employee_number")
      .eq("company_id", companyId)
      .not("employee_number", "is", null);
    let maxNum = 0;
    const re = new RegExp(`^${prefix}-(\\d+)$`, "i");
    (data || []).forEach((row: any) => {
      const m = re.exec(row.employee_number || "");
      if (m) maxNum = Math.max(maxNum, parseInt(m[1], 10));
    });
    return `${prefix}-${String(maxNum + 1).padStart(3, "0")}`;
  }

  function openEditModal(s: any) {
    setSelectedStaff(s);
    setStaffForm({
      full_name: s.full_name || "",
      job_title: s.job_title || "",
      employee_number: s.employee_number || "",
      trn: s.trn || "",
      id_issued_date: s.id_issued_date || "",
      id_expiry_date: s.id_expiry_date || "",
    });
    setNewPhotoUrl(null);
    setEditModalOpen(true);
    // No employee number yet — assign the next one now so it's ready by the
    // time they hit Save. The field itself is never manually editable.
    if (!s.employee_number) {
      generateEmployeeNumber().then(num => {
        setStaffForm(f => ({ ...f, employee_number: num }));
      });
    }
  }

  // Blob (from the crop modal's canvas output) has no filename, so this
  // always writes as .png — the original upload extension no longer matters
  // once every photo goes through the cropper.
  async function uploadStaffPhoto(file: File | Blob, userId: string): Promise<string | null> {
    const path = `staff-photos/${userId}.png`;
    const { error } = await supabase.storage
      .from("project-files")
      .upload(path, file, { upsert: true, contentType: "image/png" });
    if (error) { console.error("Photo upload error:", error); return null; }
    const { data } = supabase.storage
      .from("project-files")
      .getPublicUrl(path);
    return data.publicUrl;
  }

  // Selecting a file no longer uploads it directly — it opens the crop
  // modal first (see cropSrc/handleCropDone below), matching the ID card
  // photo slot's 65:80 aspect ratio so what's cropped is what actually
  // shows on the card.
  function handlePhotoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !selectedStaff) return;
    setCropSrc(URL.createObjectURL(file));
    if (photoInputRef.current) photoInputRef.current.value = "";
  }

  async function handleCropDone(blob: Blob) {
    if (cropSrc) URL.revokeObjectURL(cropSrc);
    setCropSrc(null);
    if (!selectedStaff) return;
    setUploadingPhoto(true);
    const url = await uploadStaffPhoto(blob, selectedStaff.id);
    if (url) setNewPhotoUrl(`${url}?t=${Date.now()}`); // cache-bust so the preview updates immediately on re-upload
    else alert("Failed to upload photo.");
    setUploadingPhoto(false);
  }

  function handleCropCancel() {
    if (cropSrc) URL.revokeObjectURL(cropSrc);
    setCropSrc(null);
  }

  function addYears(years: number) {
    const d = new Date();
    d.setFullYear(d.getFullYear() + years);
    setStaffForm(prev => ({ ...prev, id_expiry_date: d.toISOString().split("T")[0] }));
  }

  async function saveStaffDetails() {
    if (!selectedStaff) return;
    setSavingStaff(true);
    try {
      const updates: any = {
        full_name: staffForm.full_name.trim(),
        job_title: staffForm.job_title.trim() || null,
        employee_number: staffForm.employee_number.trim() || null,
        trn: staffForm.trn.trim() || null,
        id_issued_date: staffForm.id_issued_date || null,
        id_expiry_date: staffForm.id_expiry_date || null,
      };
      if (newPhotoUrl) updates.avatar_url = newPhotoUrl;

      const { error } = await supabase
        .from("user_profiles")
        .update(updates)
        .eq("id", selectedStaff.id);

      if (error) { alert("Failed to save: " + error.message); return; }
      // New job title just got saved to a real record — reload the
      // suggestion list too so the combobox picks it up immediately, not
      // just after the next full page load.
      await Promise.all([loadStaff(), loadJobTitles()]);
      setEditModalOpen(false);
    } catch (e: any) {
      alert("Error: " + e.message);
    } finally {
      setSavingStaff(false);
    }
  }

  function printCompanyWorkerFile(worker: any) {
    const html = `<!DOCTYPE html><html><head><title>Worker File - ${worker.first_name} ${worker.last_name}</title>
    <style>
      *{box-sizing:border-box;margin:0;padding:0}
      body{font-family:Georgia,serif;color:#1a1a1a;background:white;padding:40px}
      .header{display:flex;align-items:center;gap:20px;border-bottom:3px solid #1a1a1a;padding-bottom:20px;margin-bottom:24px}
      .logo{width:70px;height:70px;border-radius:10px;object-fit:cover}
      .company-name{font-size:22px;font-weight:900;letter-spacing:2px;text-transform:uppercase}
      .company-sub{font-size:11px;color:#666;margin-top:3px}
      .doc-title{text-align:center;margin-bottom:24px}
      .doc-title h2{font-size:18px;font-weight:900;letter-spacing:3px;text-transform:uppercase}
      .doc-title p{font-size:11px;color:#666;margin-top:4px}
      .content{display:grid;grid-template-columns:1fr 180px;gap:24px}
      .photo{width:180px;height:220px;object-fit:cover;border:2px solid #1a1a1a;border-radius:6px}
      .photo-placeholder{width:180px;height:220px;border:2px dashed #999;border-radius:6px;display:flex;align-items:center;justify-content:center;color:#999;font-size:12px}
      table{width:100%;border-collapse:collapse;margin-bottom:16px}
      td{padding:8px 4px;border-bottom:1px solid #eee;font-size:13px}
      td:first-child{color:#666;width:140px;font-size:11px;text-transform:uppercase;letter-spacing:1px}
      td:last-child{font-weight:600}
      .section-title{font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#999;margin:20px 0 8px}
      .id-photo{width:100%;max-height:180px;object-fit:contain;border:1px solid #eee;border-radius:6px;margin-top:8px}
      .footer{margin-top:32px;border-top:2px solid #1a1a1a;padding-top:16px;display:grid;grid-template-columns:1fr 1fr;gap:20px}
      .sig-line{border-top:1px solid #1a1a1a;margin-top:40px;padding-top:6px;font-size:11px;color:#666}
      @media print{@page{size:A4;margin:15mm}body{padding:20px}}
    </style></head><body>
    <div class="header">
      ${logoBase64?`<img src="${logoBase64}" class="logo"/>`:""}
      <div>
        <div class="company-name">${company?.company_name||""}</div>
        <div class="company-sub">${company?.address_line1||""}${company?.parish?`, ${company.parish}`:""}</div>
        <div class="company-sub">${company?.phone||""} · ${company?.email||""}</div>
      </div>
    </div>
    <div class="doc-title">
      <h2>Employee File Record</h2>
      <p>Confidential — For authorized personnel only · Printed: ${new Date().toLocaleDateString()}</p>
    </div>
    <div class="content">
      <div>
        <div class="section-title">Personal Information</div>
        <table>
          <tr><td>Full Name</td><td>${worker.first_name||""} ${worker.last_name||""}</td></tr>
          <tr><td>Employee ID</td><td>${worker.employee_id||"—"}</td></tr>
          <tr><td>ID Number</td><td>${worker.id_number||"—"}</td></tr>
          <tr><td>ID Type</td><td>${worker.national_id_type||"—"}</td></tr>
          <tr><td>Phone</td><td>${worker.phone||"—"}</td></tr>
          <tr><td>Email</td><td>${worker.email||"—"}</td></tr>
          <tr><td>Address</td><td>${worker.address||"—"}</td></tr>
          <tr><td>Date of Birth</td><td>${worker.date_of_birth?fmtDate(worker.date_of_birth):"—"}</td></tr>
        </table>
        <div class="section-title">Employment Details</div>
        <table>
          <tr><td>Role</td><td>${worker.worker_type||worker.role||"—"}</td></tr>
          <tr><td>Department</td><td>${worker.department||"—"}</td></tr>
          <tr><td>Start Date</td><td>${worker.start_date?fmtDate(worker.start_date):"—"}</td></tr>
          <tr><td>Pay Rate</td><td>${worker.pay_rate?fmtJMD(worker.pay_rate):"—"}</td></tr>
          <tr><td>Status</td><td>${worker.status||"—"}</td></tr>
        </table>
      </div>
      <div>
        ${worker.passport_photo_url?`<img src="${worker.passport_photo_url}" class="photo"/>`:`<div class="photo-placeholder">No Photo</div>`}
        ${worker.id_photo_url?`<div class="section-title">ID Document</div><img src="${worker.id_photo_url}" class="id-photo"/>`:""}
      </div>
    </div>
    <div class="footer">
      <div><div class="sig-line">Authorized By</div></div>
      <div><div class="sig-line">Date</div></div>
    </div>
    ${watermark?`<img src="${watermark.url}" style="position:fixed;top:50%;left:50%;transform:translate(-50%,-50%) rotate(-30deg);width:60%;opacity:${watermark.opacity};pointer-events:none;z-index:0"/>`:""}
    <div style="margin-top:24px;text-align:center;font-size:10px;color:#999">${company?.company_name||""} · ${company?.tagline?`"${company.tagline}" · `:""}CONFIDENTIAL</div>
    </body></html>`;
    const w = window.open("","_blank");
    if(!w) return;
    w.document.write(html);
    w.document.close();
    setTimeout(()=>w.print(),600);
  }

  function printFieldWorkerFile(worker: any) {
    const html = `<!DOCTYPE html><html><head><title>Field Worker File - ${worker.name}</title>
    <style>
      *{box-sizing:border-box;margin:0;padding:0}
      body{font-family:Georgia,serif;color:#1a1a1a;background:white;padding:40px}
      .header{display:flex;align-items:center;gap:20px;border-bottom:3px solid #1a1a1a;padding-bottom:20px;margin-bottom:24px}
      .logo{width:70px;height:70px;border-radius:10px;object-fit:cover}
      .company-name{font-size:22px;font-weight:900;letter-spacing:2px;text-transform:uppercase}
      .company-sub{font-size:11px;color:#666;margin-top:3px}
      .doc-title{text-align:center;margin-bottom:24px}
      .doc-title h2{font-size:18px;font-weight:900;letter-spacing:3px;text-transform:uppercase}
      .content{display:grid;grid-template-columns:1fr 220px;gap:24px}
      .id-photo{width:220px;height:auto;max-height:280px;object-fit:contain;border:2px solid #1a1a1a;border-radius:6px;background:#f5f5f5}
      .id-placeholder{width:220px;height:200px;border:2px dashed #999;border-radius:6px;display:flex;align-items:center;justify-content:center;color:#999;font-size:12px}
      table{width:100%;border-collapse:collapse;margin-bottom:16px}
      td{padding:8px 4px;border-bottom:1px solid #eee;font-size:13px}
      td:first-child{color:#666;width:140px;font-size:11px;text-transform:uppercase;letter-spacing:1px}
      td:last-child{font-weight:600}
      .section-title{font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#999;margin:16px 0 8px}
      .payment-row{display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #eee;font-size:12px}
      .total-row{display:flex;justify-content:space-between;padding:8px 0;font-weight:900;font-size:14px;border-top:2px solid #1a1a1a;margin-top:4px}
      .badge{display:inline-block;padding:2px 8px;border-radius:20px;font-size:10px;font-weight:700;text-transform:uppercase}
      .advance{background:#fef3c7;color:#92400e}
      .payment{background:#d1fae5;color:#065f46}
      .final{background:#cffafe;color:#164e63}
      @media print{@page{size:A4;margin:15mm}body{padding:20px}}
    </style></head><body>
    <div class="header">
      ${logoBase64?`<img src="${logoBase64}" class="logo"/>`:""}
      <div>
        <div class="company-name">${company?.company_name||""}</div>
        <div class="company-sub">${company?.address_line1||""}${company?.parish?`, ${company.parish}`:""}</div>
        <div class="company-sub">${company?.phone||""} · ${company?.email||""}</div>
      </div>
    </div>
    <div class="doc-title">
      <h2>Field Worker File Record</h2>
      <p>Confidential · Printed: ${new Date().toLocaleDateString()}</p>
    </div>
    <div class="content">
      <div>
        <div class="section-title">Worker Information</div>
        <table>
          <tr><td>Full Name</td><td>${worker.name||"—"}</td></tr>
          <tr><td>ID Number</td><td>${worker.id_number||"—"}</td></tr>
          <tr><td>Phone</td><td>${worker.phone||"—"}</td></tr>
          <tr><td>Address</td><td>${worker.address||"—"}</td></tr>
        </table>
        <div class="section-title">Payment History</div>
        ${worker.payments.map((p:any)=>`
          <div class="payment-row">
            <div>
              <span class="badge ${p.payment_type==="advance"?"advance":p.payment_type==="final"?"final":"payment"}">${p.payment_type}</span>
              <span style="margin-left:8px;color:#666">${fmtDate(p.created_at)}</span>
              ${p.project_name?`<span style="margin-left:8px;color:#999;font-size:11px">${p.project_name}</span>`:""}
            </div>
            <strong>${fmtJMD(p.total_amount)}</strong>
          </div>`).join("")}
        <div class="total-row">
          <span>Total Paid</span>
          <span>${fmtJMD(worker.total)}</span>
        </div>
        ${worker.advances>0?`<div style="font-size:12px;color:#92400e;margin-top:4px">⚡ Total Advances: ${fmtJMD(worker.advances)}</div>`:""}
      </div>
      <div>
        ${worker.id_photo_url?`<img src="${worker.id_photo_url}" class="id-photo"/>`:`<div class="id-placeholder">No ID Photo</div>`}
      </div>
    </div>
    <div style="margin-top:40px;border-top:2px solid #1a1a1a;padding-top:16px;display:grid;grid-template-columns:1fr 1fr;gap:20px">
      <div><div style="border-top:1px solid #1a1a1a;margin-top:40px;padding-top:6px;font-size:11px;color:#666">Authorized By</div></div>
      <div><div style="border-top:1px solid #1a1a1a;margin-top:40px;padding-top:6px;font-size:11px;color:#666">Date</div></div>
    </div>
    ${watermark?`<img src="${watermark.url}" style="position:fixed;top:50%;left:50%;transform:translate(-50%,-50%) rotate(-30deg);width:60%;opacity:${watermark.opacity};pointer-events:none;z-index:0"/>`:""}
    <div style="margin-top:24px;text-align:center;font-size:10px;color:#999">${company?.company_name||""} · CONFIDENTIAL</div>
    </body></html>`;
    const w = window.open("","_blank");
    if(!w) return;
    w.document.write(html);
    w.document.close();
    setTimeout(()=>w.print(),600);
  }

  if(allowed===null) return <div className="p-8 text-slate-500 text-sm">Checking access...</div>;
  if(allowed===false) return (
    <div className="p-8 text-center">
      <Shield size={40} className="text-red-400 mx-auto mb-4"/>
      <div className="text-slate-700 dark:text-slate-300 font-bold text-lg">Access Restricted</div>
      <div className="text-slate-500 text-sm mt-2">This section is for Directors and Administrators only.</div>
      <button onClick={()=>navigate("/settings")} className="mt-4 px-4 py-2 rounded-lg bg-slate-200 dark:bg-white/[0.06] text-slate-600 dark:text-slate-400 text-sm">← Back to Settings</button>
    </div>
  );

  const filteredCompany = companyWorkers.filter(w=>
    `${w.first_name} ${w.last_name} ${w.worker_type||""} ${w.id_number||""}`.toLowerCase().includes(search.toLowerCase())
  );
  const filteredField = fieldWorkers.filter(w=>
    `${w.name} ${w.id_number||""} ${w.phone||""}`.toLowerCase().includes(search.toLowerCase())
  );
  const filteredStaff = staffProfiles.filter(s=>
    `${s.full_name||""} ${s.email||""} ${s.role||""} ${s.job_title||""}`.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={()=>navigate("/settings")} className="p-1.5 rounded-lg hover:bg-white/[0.06] text-slate-500">
          <ChevronLeft size={16}/>
        </button>
        <div>
          <h1 className="text-xl font-bold text-slate-100">Records & IDs</h1>
          <p className="text-xs text-slate-500 mt-0.5">Print worker files and ID cards — Admin only</p>
        </div>
        <div className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20">
          <Shield size={12} className="text-amber-400"/>
          <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider">Director Access</span>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-600"/>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search workers..."
          className="w-full pl-8 pr-4 py-2.5 bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] rounded-lg text-sm text-slate-700 dark:text-slate-300 placeholder-slate-400 dark:placeholder-slate-600 outline-none focus:border-cyan-500/50"/>
      </div>

      {/* Tabs */}
      <div className="flex gap-1">
        <button onClick={()=>setTab("company")} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition ${tab==="company"?"bg-cyan-600 text-white":"text-slate-600 dark:text-slate-500 hover:text-slate-800 dark:hover:text-slate-300"}`}>
          <Briefcase size={12}/> Company Workers ({filteredCompany.length})
        </button>
        <button onClick={()=>setTab("field")} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition ${tab==="field"?"bg-cyan-600 text-white":"text-slate-600 dark:text-slate-500 hover:text-slate-800 dark:hover:text-slate-300"}`}>
          <User size={12}/> Field Workers ({filteredField.length})
        </button>
        <button onClick={()=>setTab("staff")} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition ${tab==="staff"?"bg-cyan-600 text-white":"text-slate-600 dark:text-slate-500 hover:text-slate-800 dark:hover:text-slate-300"}`}>
          <IdCard size={12}/> Staff ({filteredStaff.length})
        </button>
      </div>

      {/* Company Workers */}
      {tab==="company"&&(
        <div className="space-y-3">
          {filteredCompany.length===0&&<div className="text-center py-8 text-xs text-slate-500 dark:text-slate-600">No company workers found</div>}
          {filteredCompany.map(w=>(
            <div key={w.id} className="rounded-xl border border-slate-200 dark:border-white/[0.07] bg-slate-50 dark:bg-white/[0.02] p-4 flex items-center gap-4">
              {w.passport_photo_url?(
                <img src={w.passport_photo_url} className="w-12 h-12 rounded-full object-cover border border-slate-300 dark:border-white/[0.1]"/>
              ):(
                <div className="w-12 h-12 rounded-full bg-cyan-500/20 border border-cyan-500/20 flex items-center justify-center text-cyan-400 font-bold text-sm">
                  {(w.first_name?.[0]||"")+( w.last_name?.[0]||"")}
                </div>
              )}
              <div className="flex-1">
                <div className="text-sm font-bold text-slate-800 dark:text-slate-200">{w.first_name} {w.last_name}</div>
                <div className="text-[10px] text-slate-500">{w.worker_type||w.role||"Staff"}{w.id_number?` · ID: ${w.id_number}`:""}</div>
              </div>
              <div className="flex gap-2">
                <button onClick={()=>setIdCardWorkerId(w.id)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-xs font-semibold hover:bg-cyan-500/20 transition">
                  <CreditCard size={12}/> ID Card
                </button>
                <button onClick={()=>printCompanyWorkerFile(w)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold hover:bg-emerald-500/20 transition">
                  <FileText size={12}/> File Sheet
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Field Workers */}
      {tab==="field"&&(
        <div className="space-y-3">
          {filteredField.length===0&&<div className="text-center py-8 text-xs text-slate-500 dark:text-slate-600">No field workers found</div>}
          {filteredField.map((w,i)=>(
            <div key={i} className="rounded-xl border border-slate-200 dark:border-white/[0.07] bg-slate-50 dark:bg-white/[0.02] p-4 flex items-center gap-4">
              {w.id_photo_url?(
                <img src={w.id_photo_url} className="w-12 h-12 rounded-lg object-cover border border-slate-300 dark:border-white/[0.1]"/>
              ):(
                <div className="w-12 h-12 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 font-bold text-sm">
                  {w.name?.[0]?.toUpperCase()||"?"}
                </div>
              )}
              <div className="flex-1">
                <div className="text-sm font-bold text-slate-800 dark:text-slate-200">{w.name}</div>
                <div className="text-[10px] text-slate-500">
                  {w.id_number?`ID: ${w.id_number} · `:""}
                  {w.phone||""}
                </div>
                <div className="text-[10px] text-slate-500 dark:text-slate-600">{w.payments.length} payments · Total: {fmtJMD(w.total)}</div>
              </div>
              <button onClick={()=>printFieldWorkerFile(w)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold hover:bg-emerald-500/20 transition">
                <FileText size={12}/> Print File
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Staff (internal, user_profiles — director/admin/accounts/etc.) */}
      {tab==="staff"&&(
        <div className="space-y-3">
          {staffError && (
            <div className="rounded-xl border border-red-300 dark:border-red-500/30 bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400 text-xs p-3">
              {staffError}
            </div>
          )}
          {filteredStaff.length===0&&<div className="text-center py-8 text-xs text-slate-500 dark:text-slate-600">No staff found</div>}
          {filteredStaff.map(s=>(
            <div key={s.id} className="rounded-xl border border-slate-200 dark:border-white/[0.07] bg-slate-50 dark:bg-white/[0.02] p-4 flex items-center gap-4">
              {s.avatar_url?(
                <img src={s.avatar_url} className="w-12 h-12 rounded-full object-cover border border-slate-300 dark:border-white/[0.1]"/>
              ):(
                <div className="w-12 h-12 rounded-full bg-[#0f2744]/10 dark:bg-[#0f2744]/40 border border-[#C9A84C]/30 flex items-center justify-center text-[#C9A84C] font-bold text-sm">
                  {s.full_name?.[0]?.toUpperCase()||"?"}
                </div>
              )}
              <div className="flex-1">
                <div className="text-sm font-bold text-slate-800 dark:text-slate-200">{s.full_name||s.email}</div>
                <div className="text-[10px] text-slate-500">
                  {s.job_title || (s.role||"staff").replace(/_/g," ")}{s.employee_number?` · Emp No. ${s.employee_number}`:""}
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={()=>openEditModal(s)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-500/10 border border-slate-400/30 dark:border-white/[0.12] text-slate-600 dark:text-slate-300 text-xs font-semibold hover:bg-slate-500/20 transition">
                  <User size={12}/> Edit Details
                </button>
                <button onClick={()=>setIdCardStaffId(s.id)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#C9A84C]/10 border border-[#C9A84C]/30 text-[#C9A84C] text-xs font-semibold hover:bg-[#C9A84C]/20 transition">
                  <IdCard size={12}/> ID Card
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {idCardStaffId && (
        <StaffIDCard userId={idCardStaffId} onClose={()=>setIdCardStaffId(null)}/>
      )}

      {idCardWorkerId && (
        <WorkerIDCard workerId={idCardWorkerId} companyName={company?.company_name} onClose={()=>setIdCardWorkerId(null)}/>
      )}

      {editModalOpen && selectedStaff && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl p-6 w-full max-w-sm my-8">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-base font-semibold text-slate-800 dark:text-white">Edit Staff Details</h2>
                <p className="text-xs text-slate-500 mt-0.5">{selectedStaff.full_name || selectedStaff.email}</p>
              </div>
              <button onClick={()=>setEditModalOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                <X size={18}/>
              </button>
            </div>

            {/* Photo */}
            <div className="flex flex-col items-center mb-5">
              <button onClick={()=>photoInputRef.current?.click()} disabled={uploadingPhoto}
                className="relative w-20 h-20 rounded-full overflow-hidden border-2 border-slate-200 dark:border-white/[0.1] group">
                {(newPhotoUrl || selectedStaff.avatar_url) ? (
                  <img src={newPhotoUrl || selectedStaff.avatar_url} alt="" className="w-full h-full object-cover"/>
                ) : (
                  <div className="w-full h-full bg-[#0f2744]/10 dark:bg-[#0f2744]/40 flex items-center justify-center text-[#C9A84C] font-bold text-xl">
                    {selectedStaff.full_name?.[0]?.toUpperCase()||"?"}
                  </div>
                )}
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <Camera size={18} className="text-white"/>
                </div>
              </button>
              <input ref={photoInputRef} type="file" accept="image/*" onChange={handlePhotoSelect} className="hidden"/>
              <span className="text-[10px] text-slate-400 mt-1.5">{uploadingPhoto?"Uploading...":"Click photo to change"}</span>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-600 block mb-1">Full Name</label>
                <input value={staffForm.full_name} onChange={e=>setStaffForm(f=>({...f, full_name:e.target.value}))}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] rounded-lg text-sm text-slate-700 dark:text-slate-300 outline-none focus:border-cyan-500/50"/>
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-600 block mb-1">Job Title</label>
                <EditableDropdown
                  value={staffForm.job_title}
                  onChange={v=>setStaffForm(f=>({...f, job_title:v}))}
                  options={jobTitleOptions}
                  onAddOption={async(v)=>{ setJobTitleOptions(prev=> prev.includes(v) ? prev : [...prev, v].sort()); }}
                  onDeleteOption={async(v)=>{ setJobTitleOptions(prev=> prev.filter(t=>t!==v)); }}
                  placeholder="Select or type a job title..."
                />
                <div className="text-[10px] text-slate-400 dark:text-slate-600 mt-1 capitalize">System role: {(selectedStaff.role||"staff").replace(/_/g," ")}</div>
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-600 block mb-1">Employee No.</label>
                <div className="w-full px-3 py-2 bg-slate-100 dark:bg-white/[0.02] border border-slate-200 dark:border-white/[0.06] rounded-lg text-sm text-slate-500 dark:text-slate-500">
                  {staffForm.employee_number || "Assigning..."}
                </div>
                <div className="text-[10px] text-slate-400 dark:text-slate-600 mt-1">Auto-generated — cannot be edited manually.</div>
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-600 block mb-1">TRN</label>
                <input value={staffForm.trn} onChange={e=>setStaffForm(f=>({...f, trn:e.target.value}))} placeholder="123-456-789"
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] rounded-lg text-sm text-slate-700 dark:text-slate-300 outline-none focus:border-cyan-500/50"/>
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-600 block mb-1">ID Issue Date</label>
                <input type="date" value={staffForm.id_issued_date} onChange={e=>setStaffForm(f=>({...f, id_issued_date:e.target.value}))}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] rounded-lg text-sm text-slate-700 dark:text-slate-300 outline-none focus:border-cyan-500/50"/>
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-600 block mb-1">ID Expiry Date</label>
                <input type="date" value={staffForm.id_expiry_date} onChange={e=>setStaffForm(f=>({...f, id_expiry_date:e.target.value}))}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] rounded-lg text-sm text-slate-700 dark:text-slate-300 outline-none focus:border-cyan-500/50 mb-2"/>
                <div className="flex gap-2">
                  {[1,2,3].map(y=>(
                    <button key={y} onClick={()=>addYears(y)}
                      className="flex-1 px-2 py-1.5 rounded-lg bg-[#C9A84C]/10 border border-[#C9A84C]/30 text-[#C9A84C] text-xs font-semibold hover:bg-[#C9A84C]/20 transition">
                      +{y} yr
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button onClick={()=>setEditModalOpen(false)}
                className="flex-1 px-4 py-2.5 border border-slate-300 dark:border-slate-600 rounded-lg text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                Cancel
              </button>
              <button onClick={saveStaffDetails} disabled={savingStaff || !staffForm.full_name.trim()}
                className="flex-1 bg-blue-700 hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-2.5 rounded-lg text-sm transition-colors">
                {savingStaff?"Saving...":"Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {cropSrc && (
        <PhotoCropModal imageSrc={cropSrc} onCancel={handleCropCancel} onCropDone={handleCropDone}/>
      )}
    </div>
  );
}