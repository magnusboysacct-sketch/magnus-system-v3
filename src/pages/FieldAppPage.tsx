// src/pages/FieldAppPage.tsx — Magnus Boys Field Worker PWA
// Mobile-first, touch-friendly, installs as app on phone
import React, { useEffect, useState, useRef } from "react";
import { supabase } from "../lib/supabase";
import {
  FileText, Camera, DollarSign, AlertTriangle, ShieldCheck,
  CheckCircle2, Circle, RefreshCw, Users, CloudSun, Clock,
  ChevronRight, X, Send, Home, LogOut, Hammer
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────
type Screen = "home" | "log" | "photos" | "payments" | "issue" | "safety";

const SAFETY_ITEMS = [
  "PPE checked for all workers",
  "Site perimeter secured",
  "Equipment inspected",
  "Emergency contacts posted",
  "First aid kit accessible",
  "No unauthorized personnel on site",
];

function fmtJMD(n: number) {
  return new Intl.NumberFormat("en-US", { style:"currency", currency:"JMD", minimumFractionDigits:0 }).format(n);
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function FieldAppPage() {
  const [screen, setScreen] = useState<Screen>("home");
  const [project, setProject] = useState<any>(null);
  const [projects, setProjects] = useState<any[]>([]);
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [weather, setWeather] = useState<{temp:string;desc:string;icon:string}|null>(null);
  const [todayLog, setTodayLog] = useState<any>(null);
  const [recentPayments, setRecentPayments] = useState<any[]>([]);
  const [photos, setPhotos] = useState<any[]>([]);
  const [safetyChecked, setSafetyChecked] = useState<Set<number>>(new Set());
  const [toast, setToast] = useState<string|null>(null);
  const [companyId, setCompanyId] = useState<string>("");

  const today = new Date().toISOString().slice(0,10);

  useEffect(() => {
    async function init() {
      const { data:{ user } } = await supabase.auth.getUser();
      if (!user) { window.location.href = "/login"; return; }
      setUser(user);
      const { data:p } = await supabase.from("user_profiles").select("company_id,full_name").eq("id",user.id).maybeSingle();
      if (p?.company_id) {
        setCompanyId(p.company_id);
        const { data:proj } = await supabase.from("projects").select("id,name,status,site_address")
          .eq("company_id",p.company_id).eq("status","active").order("name").limit(20);
        setProjects(proj||[]);
        const saved = localStorage.getItem("field_app_project");
        const first = (proj||[])[0];
        const active = saved ? (proj||[]).find((x:any)=>x.id===saved)||first : first;
        if (active) { setProject(active); await loadProjectData(active.id, p.company_id); }
      }
      setLoading(false);
      // Weather
      try {
        const r = await fetch("https://wttr.in/Kingston+Jamaica?format=j1");
        const d = await r.json();
        const c = d.current_condition[0];
        const desc = c.weatherDesc[0].value;
        const icons: Record<string,string> = { sun:"☀️", cloud:"⛅", rain:"🌧️", storm:"⛈️", fog:"🌫️", wind:"💨" };
        const icon = Object.entries(icons).find(([k])=>desc.toLowerCase().includes(k))?.[1] || "🌤️";
        setWeather({ temp:c.temp_C+"°C", desc, icon });
      } catch {}
    }
    init();
  }, []);

  async function loadProjectData(pid: string, cid: string) {
    const [logRes, payRes, photoRes] = await Promise.all([
      supabase.from("daily_logs").select("*").eq("project_id",pid).eq("log_date",today).maybeSingle(),
      supabase.from("field_payments").select("amount,paid_at,payment_method,worker:worker_id(first_name,last_name)").eq("company_id",cid).order("paid_at",{ascending:false}).limit(5),
      supabase.from("project_photos").select("*").eq("project_id",pid).order("created_at",{ascending:false}).limit(6),
    ]);
    setTodayLog(logRes.data);
    setRecentPayments(payRes.data||[]);
    setPhotos(photoRes.data||[]);
  }

  async function switchProject(pid: string) {
    const p = projects.find(x=>x.id===pid);
    if (!p) return;
    setProject(p);
    localStorage.setItem("field_app_project",pid);
    await loadProjectData(pid, companyId);
  }

  function showToast(msg: string) { setToast(msg); setTimeout(()=>setToast(null),3000); }

  if (loading) return (
    <div style={{minHeight:"100vh",background:"#080b10",display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{textAlign:"center"}}>
        <div style={{width:40,height:40,border:"3px solid #0891b2",borderTopColor:"transparent",borderRadius:"50%",animation:"spin 0.8s linear infinite",margin:"0 auto 12px"}}/>
        <p style={{color:"#64748b",fontSize:13}}>Loading…</p>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    </div>
  );

  return (
    <div style={{minHeight:"100vh",background:"#080b10",color:"#f1f5f9",fontFamily:"system-ui,sans-serif",maxWidth:480,margin:"0 auto",position:"relative",paddingBottom:80}}>
      <style>{`
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes fadeUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
        *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
        body{margin:0;background:#080b10}
        input,textarea,select{font-size:16px!important}
      `}</style>

      {/* Status Bar Spacer */}
      <div style={{height:"env(safe-area-inset-top,0px)"}}/>

      {/* Header */}
      <div style={{background:"#0d1117",borderBottom:"1px solid rgba(255,255,255,0.06)",padding:"12px 16px",position:"sticky",top:0,zIndex:50}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <div style={{width:32,height:32,borderRadius:8,background:"linear-gradient(135deg,#0891b2,#0e7490)",display:"flex",alignItems:"center",justifyContent:"center"}}>
              <Hammer size={16} color="white"/>
            </div>
            <div>
              <div style={{fontSize:13,fontWeight:700,color:"#f1f5f9"}}>MB Field</div>
              <div style={{fontSize:10,color:"#475569"}}>{user?.email?.split("@")[0]}</div>
            </div>
          </div>
          {projects.length > 1 ? (
            <select value={project?.id||""} onChange={e=>switchProject(e.target.value)}
              style={{background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:8,padding:"6px 10px",fontSize:12,color:"#94a3b8",outline:"none",maxWidth:160}}>
              {projects.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          ) : (
            <div style={{fontSize:12,color:"#94a3b8",fontWeight:600}}>{project?.name||"No project"}</div>
          )}
        </div>
      </div>

      {/* Content */}
      <div style={{animation:"fadeUp 0.3s ease"}}>

        {/* ── HOME ── */}
        {screen==="home" && (
          <div style={{padding:16,display:"flex",flexDirection:"column",gap:12}}>

            {/* Weather + Date */}
            <div style={{background:"linear-gradient(135deg,rgba(8,145,178,0.15),rgba(14,116,144,0.08))",border:"1px solid rgba(8,145,178,0.2)",borderRadius:16,padding:"16px 20px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div>
                <div style={{fontSize:11,color:"#0891b2",fontWeight:700,letterSpacing:1,textTransform:"uppercase",marginBottom:4}}>Today</div>
                <div style={{fontSize:18,fontWeight:800,color:"#f1f5f9"}}>{new Date().toLocaleDateString("en-US",{weekday:"long"})}</div>
                <div style={{fontSize:12,color:"#64748b"}}>{new Date().toLocaleDateString("en-US",{month:"long",day:"numeric",year:"numeric"})}</div>
                {project?.site_address && <div style={{fontSize:11,color:"#475569",marginTop:4}}>📍 {project.site_address}</div>}
              </div>
              {weather && (
                <div style={{textAlign:"center"}}>
                  <div style={{fontSize:36}}>{weather.icon}</div>
                  <div style={{fontSize:16,fontWeight:700,color:"#f1f5f9"}}>{weather.temp}</div>
                  <div style={{fontSize:10,color:"#64748b"}}>{weather.desc.split(" ").slice(0,2).join(" ")}</div>
                </div>
              )}
            </div>

            {/* Today's Log Status */}
            <div style={{background:todayLog?"rgba(34,197,94,0.08)":"rgba(245,158,11,0.08)",border:`1px solid ${todayLog?"rgba(34,197,94,0.2)":"rgba(245,158,11,0.2)"}`,borderRadius:12,padding:"12px 16px",display:"flex",alignItems:"center",gap:12}}>
              <div style={{fontSize:24}}>{todayLog?"✅":"📋"}</div>
              <div style={{flex:1}}>
                <div style={{fontSize:13,fontWeight:700,color:todayLog?"#22c55e":"#f59e0b"}}>
                  {todayLog?"Daily log submitted":"No log yet today"}
                </div>
                {todayLog ? (
                  <div style={{fontSize:11,color:"#64748b"}}>{todayLog.workers_count||0} workers · {todayLog.work_performed?.slice(0,40)||"Logged"}</div>
                ) : (
                  <div style={{fontSize:11,color:"#64748b"}}>Tap Daily Log to submit</div>
                )}
              </div>
              <button onClick={()=>setScreen("log")}
                style={{padding:"6px 12px",background:todayLog?"rgba(34,197,94,0.15)":"rgba(245,158,11,0.15)",border:`1px solid ${todayLog?"rgba(34,197,94,0.3)":"rgba(245,158,11,0.3)"}`,borderRadius:8,color:todayLog?"#22c55e":"#f59e0b",fontSize:11,fontWeight:700,cursor:"pointer"}}>
                {todayLog?"Update":"Log Now"}
              </button>
            </div>

            {/* Quick Actions */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              {[
                { screen:"log" as Screen,      label:"Daily Log",      sub:todayLog?"Update":"New",         icon:<FileText size={24} color="white"/>,       grad:"linear-gradient(135deg,#2563eb,#1d4ed8)" },
                { screen:"photos" as Screen,   label:"Site Photos",    sub:`${photos.length} today`,        icon:<Camera size={24} color="white"/>,         grad:"linear-gradient(135deg,#16a34a,#15803d)" },
                { screen:"payments" as Screen, label:"Payments",       sub:`${recentPayments.length} recent`,icon:<DollarSign size={24} color="white"/>,    grad:"linear-gradient(135deg,#d97706,#b45309)" },
                { screen:"issue" as Screen,    label:"Log Issue",      sub:"Report problem",                icon:<AlertTriangle size={24} color="white"/>,  grad:"linear-gradient(135deg,#dc2626,#b91c1c)" },
                { screen:"safety" as Screen,   label:"Safety Check",   sub:`${safetyChecked.size}/${SAFETY_ITEMS.length}`,icon:<ShieldCheck size={24} color="white"/>, grad:"linear-gradient(135deg,#0891b2,#0e7490)" },
              ].map(a => (
                <button key={a.screen} onClick={()=>setScreen(a.screen)}
                  style={{background:a.grad,borderRadius:16,padding:"20px 16px",border:"none",cursor:"pointer",textAlign:"center",display:"flex",flexDirection:"column",alignItems:"center",gap:10,boxShadow:"0 4px 20px rgba(0,0,0,0.3)",transition:"transform 0.1s",gridColumn:a.screen==="safety"?"span 2":"span 1"}}>
                  <div style={{width:52,height:52,borderRadius:"50%",background:"rgba(255,255,255,0.2)",display:"flex",alignItems:"center",justifyContent:"center"}}>
                    {a.icon}
                  </div>
                  <div>
                    <div style={{color:"white",fontWeight:700,fontSize:15}}>{a.label}</div>
                    <div style={{color:"rgba(255,255,255,0.7)",fontSize:11,marginTop:2}}>{a.sub}</div>
                  </div>
                </button>
              ))}
            </div>

            {/* Recent Payments preview */}
            {recentPayments.length > 0 && (
              <div style={{background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.07)",borderRadius:16,overflow:"hidden"}}>
                <div style={{padding:"12px 16px",borderBottom:"1px solid rgba(255,255,255,0.06)",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <span style={{fontSize:13,fontWeight:700,color:"#cbd5e1"}}>Recent Payments</span>
                  <button onClick={()=>setScreen("payments")} style={{fontSize:11,color:"#0891b2",background:"none",border:"none",cursor:"pointer"}}>View all →</button>
                </div>
                {recentPayments.slice(0,3).map((p:any,i:number)=>(
                  <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 16px",borderBottom:"1px solid rgba(255,255,255,0.04)"}}>
                    <div>
                      <div style={{fontSize:12,fontWeight:600,color:"#e2e8f0"}}>{p.worker?.first_name} {p.worker?.last_name}</div>
                      <div style={{fontSize:10,color:"#475569"}}>{p.payment_method||"Cash"} · {new Date(p.paid_at).toLocaleDateString()}</div>
                    </div>
                    <div style={{fontSize:14,fontWeight:800,color:"#22c55e"}}>{fmtJMD(Number(p.amount||0))}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── DAILY LOG ── */}
        {screen==="log" && <DailyLogScreen projectId={project?.id} today={today} existing={todayLog} onSave={async()=>{await loadProjectData(project.id,companyId);setScreen("home");showToast("Daily log saved!");}} onBack={()=>setScreen("home")}/>}

        {/* ── PHOTOS ── */}
        {screen==="photos" && <PhotoScreen projectId={project?.id} photos={photos} onSave={async()=>{await loadProjectData(project.id,companyId);showToast("Photo uploaded!");}} onBack={()=>setScreen("home")}/>}

        {/* ── PAYMENTS ── */}
        {screen==="payments" && <PaymentsScreen companyId={companyId} payments={recentPayments} onBack={()=>setScreen("home")}/>}

        {/* ── LOG ISSUE ── */}
        {screen==="issue" && <IssueScreen projectId={project?.id} onSave={()=>{setScreen("home");showToast("Issue logged!");}} onBack={()=>setScreen("home")}/>}

        {/* ── SAFETY ── */}
        {screen==="safety" && <SafetyScreen checked={safetyChecked} onChange={setSafetyChecked} onBack={()=>setScreen("home")}/>}
      </div>

      {/* Bottom Nav */}
      <div style={{position:"fixed",bottom:0,left:"50%",transform:"translateX(-50%)",width:"100%",maxWidth:480,background:"rgba(13,17,23,0.97)",backdropFilter:"blur(16px)",borderTop:"1px solid rgba(255,255,255,0.08)",display:"flex",zIndex:50,paddingBottom:"env(safe-area-inset-bottom,0px)"}}>
        {[
          { s:"home" as Screen,     icon:<Home size={20}/>,         label:"Home" },
          { s:"log" as Screen,      icon:<FileText size={20}/>,     label:"Log" },
          { s:"photos" as Screen,   icon:<Camera size={20}/>,       label:"Photos" },
          { s:"payments" as Screen, icon:<DollarSign size={20}/>,   label:"Payments" },
          { s:"safety" as Screen,   icon:<ShieldCheck size={20}/>,  label:"Safety" },
        ].map(n=>(
          <button key={n.s} onClick={()=>setScreen(n.s)}
            style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:3,padding:"10px 0",background:"none",border:"none",cursor:"pointer",color:screen===n.s?"#0891b2":"#475569",transition:"color 0.2s"}}>
            {n.icon}
            <span style={{fontSize:9,fontWeight:600,textTransform:"uppercase",letterSpacing:0.5}}>{n.label}</span>
          </button>
        ))}
      </div>

      {/* Toast */}
      {toast && (
        <div style={{position:"fixed",bottom:80,left:"50%",transform:"translateX(-50%)",background:"#0d1117",border:"1px solid rgba(34,197,94,0.3)",borderRadius:12,padding:"10px 20px",color:"#22c55e",fontSize:13,fontWeight:700,zIndex:100,whiteSpace:"nowrap",boxShadow:"0 8px 32px rgba(0,0,0,0.5)"}}>
          ✓ {toast}
        </div>
      )}
    </div>
  );
}

// ─── Daily Log Screen ─────────────────────────────────────────────────────────
function DailyLogScreen({ projectId, today, existing, onSave, onBack }: any) {
  const [workers, setWorkers] = useState(existing?.workers_count||"");
  const [weather, setWeather] = useState(existing?.weather||"sunny");
  const [work, setWork] = useState(existing?.work_performed||"");
  const [materials, setMaterials] = useState(existing?.materials_used||"");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!work.trim()) { alert("Please describe work performed."); return; }
    setSaving(true);
    const data = { project_id:projectId, log_date:today, workers_count:Number(workers)||0, weather, work_performed:work, materials_used:materials };
    if (existing) await supabase.from("daily_logs").update(data).eq("id",existing.id);
    else await supabase.from("daily_logs").insert(data);
    setSaving(false);
    onSave();
  }

  return (
    <div style={{padding:16}}>
      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:20}}>
        <button onClick={onBack} style={{background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:10,padding:"8px 14px",color:"#94a3b8",fontSize:13,cursor:"pointer"}}>← Back</button>
        <h2 style={{fontSize:18,fontWeight:800,color:"#f1f5f9",margin:0}}>Daily Log</h2>
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:14}}>
        <div>
          <label style={{fontSize:11,color:"#64748b",fontWeight:700,textTransform:"uppercase",letterSpacing:1,display:"block",marginBottom:6}}>Workers on Site</label>
          <input type="number" value={workers} onChange={e=>setWorkers(e.target.value)} placeholder="0"
            style={{width:"100%",background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:12,padding:"14px 16px",color:"#f1f5f9",fontSize:16,outline:"none"}}/>
        </div>
        <div>
          <label style={{fontSize:11,color:"#64748b",fontWeight:700,textTransform:"uppercase",letterSpacing:1,display:"block",marginBottom:6}}>Weather</label>
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8}}>
            {[{v:"sunny",e:"☀️"},{v:"cloudy",e:"⛅"},{v:"rainy",e:"🌧️"},{v:"windy",e:"💨"}].map(w=>(
              <button key={w.v} onClick={()=>setWeather(w.v)}
                style={{padding:"12px 8px",borderRadius:12,border:`2px solid ${weather===w.v?"#0891b2":"rgba(255,255,255,0.08)"}`,background:weather===w.v?"rgba(8,145,178,0.15)":"rgba(255,255,255,0.04)",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:4}}>
                <span style={{fontSize:24}}>{w.e}</span>
                <span style={{fontSize:10,color:weather===w.v?"#0891b2":"#64748b",fontWeight:600,textTransform:"capitalize"}}>{w.v}</span>
              </button>
            ))}
          </div>
        </div>
        <div>
          <label style={{fontSize:11,color:"#64748b",fontWeight:700,textTransform:"uppercase",letterSpacing:1,display:"block",marginBottom:6}}>Work Performed *</label>
          <textarea value={work} onChange={e=>setWork(e.target.value)} placeholder="Describe what was done today..."
            style={{width:"100%",background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:12,padding:"14px 16px",color:"#f1f5f9",fontSize:14,outline:"none",resize:"none",height:100}}/>
        </div>
        <div>
          <label style={{fontSize:11,color:"#64748b",fontWeight:700,textTransform:"uppercase",letterSpacing:1,display:"block",marginBottom:6}}>Materials Used</label>
          <textarea value={materials} onChange={e=>setMaterials(e.target.value)} placeholder="e.g. 200 blocks, 5 bags cement..."
            style={{width:"100%",background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:12,padding:"14px 16px",color:"#f1f5f9",fontSize:14,outline:"none",resize:"none",height:72}}/>
        </div>
        <button onClick={save} disabled={saving}
          style={{width:"100%",padding:"16px 0",background:saving?"rgba(8,145,178,0.4)":"#0891b2",border:"none",borderRadius:14,color:"white",fontSize:16,fontWeight:700,cursor:"pointer",marginTop:4}}>
          {saving?"Saving…":"Save Daily Log ✓"}
        </button>
      </div>
    </div>
  );
}

// ─── Photo Screen ─────────────────────────────────────────────────────────────
function PhotoScreen({ projectId, photos, onSave, onBack }: any) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [caption, setCaption] = useState("");

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    setUploading(true);
    try {
      const path = `projects/${projectId}/${Date.now()}-${file.name}`;
      const { error:ue } = await supabase.storage.from("project-files").upload(path,file,{cacheControl:"3600",upsert:false});
      if (ue) throw ue;
      const { data:sd } = await supabase.storage.from("project-files").getPublicUrl(path);
      await supabase.from("project_photos").insert({ project_id:projectId, url:sd.publicUrl, public_url:sd.publicUrl, caption:caption||null });
      setCaption("");
      onSave();
    } catch(e:any) { alert("Upload failed: "+e.message); }
    setUploading(false);
  }

  return (
    <div style={{padding:16}}>
      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:20}}>
        <button onClick={onBack} style={{background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:10,padding:"8px 14px",color:"#94a3b8",fontSize:13,cursor:"pointer"}}>← Back</button>
        <h2 style={{fontSize:18,fontWeight:800,color:"#f1f5f9",margin:0}}>Site Photos</h2>
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:12}}>
        <input value={caption} onChange={e=>setCaption(e.target.value)} placeholder="Caption (optional)"
          style={{width:"100%",background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:12,padding:"12px 16px",color:"#f1f5f9",fontSize:14,outline:"none"}}/>
        <button onClick={()=>fileRef.current?.click()} disabled={uploading}
          style={{width:"100%",padding:"18px 0",background:uploading?"rgba(22,163,74,0.4)":"linear-gradient(135deg,#16a34a,#15803d)",border:"none",borderRadius:14,color:"white",fontSize:16,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:10}}>
          <Camera size={20} color="white"/>
          {uploading?"Uploading…":"Take / Upload Photo"}
        </button>
        <input ref={fileRef} type="file" accept="image/*" capture="environment" style={{display:"none"}} onChange={handleFile}/>
        {photos.length > 0 && (
          <div>
            <div style={{fontSize:11,color:"#64748b",fontWeight:700,textTransform:"uppercase",letterSpacing:1,marginBottom:10}}>Recent Photos</div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:6}}>
              {photos.map((p:any)=>(
                <div key={p.id} style={{aspectRatio:"1",borderRadius:10,overflow:"hidden",background:"rgba(255,255,255,0.04)"}}>
                  <img src={p.url||p.public_url||p.publicUrl||""} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Payments Screen ──────────────────────────────────────────────────────────
function PaymentsScreen({ companyId, payments, onBack }: any) {
  const total = payments.reduce((s:number,p:any)=>s+Number(p.amount||0),0);
  return (
    <div style={{padding:16}}>
      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:20}}>
        <button onClick={onBack} style={{background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:10,padding:"8px 14px",color:"#94a3b8",fontSize:13,cursor:"pointer"}}>← Back</button>
        <h2 style={{fontSize:18,fontWeight:800,color:"#f1f5f9",margin:0}}>Field Payments</h2>
      </div>
      <div style={{background:"linear-gradient(135deg,rgba(217,119,6,0.15),rgba(180,83,9,0.08))",border:"1px solid rgba(217,119,6,0.25)",borderRadius:16,padding:"20px",textAlign:"center",marginBottom:16}}>
        <div style={{fontSize:11,color:"#d97706",fontWeight:700,letterSpacing:2,textTransform:"uppercase",marginBottom:8}}>Total Paid (Recent)</div>
        <div style={{fontSize:32,fontWeight:900,color:"#f59e0b"}}>{new Intl.NumberFormat("en-US",{style:"currency",currency:"JMD",maximumFractionDigits:0}).format(total)}</div>
      </div>
      {payments.length === 0 ? (
        <div style={{textAlign:"center",padding:"40px 0",color:"#475569",fontSize:14}}>No payments yet</div>
      ) : payments.map((p:any,i:number)=>(
        <div key={i} style={{background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.07)",borderRadius:14,padding:"14px 16px",marginBottom:8,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div>
            <div style={{fontSize:14,fontWeight:700,color:"#e2e8f0"}}>{p.worker?.first_name} {p.worker?.last_name}</div>
            <div style={{fontSize:11,color:"#475569",marginTop:2}}>{p.payment_method||"Cash"} · {new Date(p.paid_at).toLocaleDateString("en-US",{month:"short",day:"numeric"})}</div>
          </div>
          <div style={{fontSize:18,fontWeight:800,color:"#22c55e"}}>{new Intl.NumberFormat("en-US",{style:"currency",currency:"JMD",maximumFractionDigits:0}).format(Number(p.amount||0))}</div>
        </div>
      ))}
    </div>
  );
}

// ─── Issue Screen ─────────────────────────────────────────────────────────────
function IssueScreen({ projectId, onSave, onBack }: any) {
  const [severity, setSeverity] = useState<"low"|"medium"|"high">("medium");
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!text.trim()) { alert("Please describe the issue."); return; }
    setSaving(true);
    await supabase.from("project_issues").insert({ project_id:projectId, description:text, severity, reported_at:new Date().toISOString(), status:"open" });
    setSaving(false);
    onSave();
  }

  return (
    <div style={{padding:16}}>
      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:20}}>
        <button onClick={onBack} style={{background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:10,padding:"8px 14px",color:"#94a3b8",fontSize:13,cursor:"pointer"}}>← Back</button>
        <h2 style={{fontSize:18,fontWeight:800,color:"#f1f5f9",margin:0}}>Log Issue</h2>
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:14}}>
        <div>
          <label style={{fontSize:11,color:"#64748b",fontWeight:700,textTransform:"uppercase",letterSpacing:1,display:"block",marginBottom:8}}>Severity</label>
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8}}>
            {([["low","🟢","Low"],["medium","🟡","Medium"],["high","🔴","High"]] as const).map(([v,e,l])=>(
              <button key={v} onClick={()=>setSeverity(v as any)}
                style={{padding:"14px 8px",borderRadius:12,border:`2px solid ${severity===v?v==="high"?"#dc2626":v==="medium"?"#d97706":"#16a34a":"rgba(255,255,255,0.08)"}`,background:severity===v?v==="high"?"rgba(220,38,38,0.15)":v==="medium"?"rgba(217,119,6,0.15)":"rgba(22,163,74,0.15)":"rgba(255,255,255,0.04)",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:6}}>
                <span style={{fontSize:24}}>{e}</span>
                <span style={{fontSize:12,fontWeight:700,color:severity===v?v==="high"?"#ef4444":v==="medium"?"#f59e0b":"#22c55e":"#64748b"}}>{l}</span>
              </button>
            ))}
          </div>
        </div>
        <div>
          <label style={{fontSize:11,color:"#64748b",fontWeight:700,textTransform:"uppercase",letterSpacing:1,display:"block",marginBottom:8}}>Description *</label>
          <textarea value={text} onChange={e=>setText(e.target.value)} placeholder="Describe the issue or delay in detail..."
            style={{width:"100%",background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:12,padding:"14px 16px",color:"#f1f5f9",fontSize:14,outline:"none",resize:"none",height:120}}/>
        </div>
        <button onClick={save} disabled={saving}
          style={{width:"100%",padding:"16px 0",background:saving?"rgba(220,38,38,0.4)":"linear-gradient(135deg,#dc2626,#b91c1c)",border:"none",borderRadius:14,color:"white",fontSize:16,fontWeight:700,cursor:"pointer"}}>
          {saving?"Submitting…":"Submit Issue ⚠️"}
        </button>
      </div>
    </div>
  );
}

// ─── Safety Screen ────────────────────────────────────────────────────────────
function SafetyScreen({ checked, onChange, onBack }: any) {
  const allDone = checked.size === SAFETY_ITEMS.length;
  return (
    <div style={{padding:16}}>
      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:20}}>
        <button onClick={onBack} style={{background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:10,padding:"8px 14px",color:"#94a3b8",fontSize:13,cursor:"pointer"}}>← Back</button>
        <h2 style={{fontSize:18,fontWeight:800,color:"#f1f5f9",margin:0}}>Safety Checklist</h2>
        <span style={{marginLeft:"auto",fontSize:13,fontWeight:700,color:allDone?"#22c55e":"#f59e0b"}}>{checked.size}/{SAFETY_ITEMS.length}</span>
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:8}}>
        {SAFETY_ITEMS.map((item,i)=>(
          <button key={i} onClick={()=>{const s=new Set(checked);s.has(i)?s.delete(i):s.add(i);onChange(s);}}
            style={{display:"flex",alignItems:"center",gap:14,padding:"16px",borderRadius:14,border:`1px solid ${checked.has(i)?"rgba(34,197,94,0.3)":"rgba(255,255,255,0.08)"}`,background:checked.has(i)?"rgba(34,197,94,0.08)":"rgba(255,255,255,0.03)",cursor:"pointer",textAlign:"left",transition:"all 0.15s"}}>
            <div style={{width:28,height:28,borderRadius:"50%",background:checked.has(i)?"#22c55e":"rgba(255,255,255,0.08)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,transition:"background 0.2s"}}>
              {checked.has(i) ? <CheckCircle2 size={18} color="white"/> : <Circle size={18} color="#64748b"/>}
            </div>
            <span style={{fontSize:14,color:checked.has(i)?"#86efac":"#cbd5e1",fontWeight:checked.has(i)?600:400,textDecoration:checked.has(i)?"line-through":"none"}}>{item}</span>
          </button>
        ))}
        {allDone && (
          <div style={{background:"rgba(34,197,94,0.1)",border:"1px solid rgba(34,197,94,0.3)",borderRadius:14,padding:"16px",textAlign:"center",marginTop:8}}>
            <div style={{fontSize:28,marginBottom:6}}>✅</div>
            <div style={{fontSize:16,fontWeight:800,color:"#22c55e"}}>All safety checks complete!</div>
            <div style={{fontSize:12,color:"#16a34a",marginTop:4}}>Site is cleared to proceed</div>
          </div>
        )}
      </div>
    </div>
  );
}
