// src/pages/FieldAppPage.tsx — Magnus Boys Field Worker PWA — Phase 1
// Digital Signature + Receipt Scan + Expense Logging + Full Mobile ERP
import React, { useEffect, useState, useRef, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { useCompanySettings } from "../hooks/useCompanySettings";
import {
  FileText, Camera, DollarSign, AlertTriangle, ShieldCheck,
  CheckCircle2, Circle, Home, Hammer, Receipt, Pen,
  RotateCcw, Check, Loader, Plus, Trash2
} from "lucide-react";

type Screen = "home" | "log" | "photos" | "payments" | "issue" | "safety" | "expenses";

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

// ─── Signature Pad ────────────────────────────────────────────────────────────
function SignaturePad({ onSave, onCancel, label }: { onSave:(dataUrl:string)=>void; onCancel:()=>void; label:string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [hasSignature, setHasSignature] = useState(false);

  function getPos(e: any, canvas: HTMLCanvasElement) {
    const rect = canvas.getBoundingClientRect();
    const touch = e.touches?.[0] || e;
    return { x: touch.clientX - rect.left, y: touch.clientY - rect.top };
  }

  function startDraw(e: any) {
    e.preventDefault();
    drawing.current = true;
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const pos = getPos(e, canvas);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
  }

  function draw(e: any) {
    e.preventDefault();
    if (!drawing.current) return;
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#f1f5f9";
    const pos = getPos(e, canvas);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    setHasSignature(true);
  }

  function stopDraw(e: any) { e.preventDefault(); drawing.current = false; }

  function clear() {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasSignature(false);
  }

  function save() {
    if (!hasSignature) { alert("Please sign first."); return; }
    const canvas = canvasRef.current!;
    // White background for saved image
    const offscreen = document.createElement("canvas");
    offscreen.width = canvas.width; offscreen.height = canvas.height;
    const ctx = offscreen.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, offscreen.width, offscreen.height);
    ctx.drawImage(canvas, 0, 0);
    onSave(offscreen.toDataURL("image/png"));
  }

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.9)",zIndex:200,display:"flex",flexDirection:"column",padding:16,gap:12}}>
      <div style={{fontSize:16,fontWeight:800,color:"#f1f5f9",textAlign:"center"}}>{label}</div>
      <div style={{fontSize:12,color:"#64748b",textAlign:"center"}}>Sign in the box below</div>
      <div style={{flex:1,background:"#1e293b",borderRadius:16,border:"2px solid rgba(255,255,255,0.1)",overflow:"hidden",position:"relative"}}>
        <canvas ref={canvasRef} width={440} height={300}
          style={{width:"100%",height:"100%",touchAction:"none",display:"block"}}
          onMouseDown={startDraw} onMouseMove={draw} onMouseUp={stopDraw}
          onTouchStart={startDraw} onTouchMove={draw} onTouchEnd={stopDraw}/>
        {!hasSignature && (
          <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",pointerEvents:"none"}}>
            <span style={{fontSize:13,color:"rgba(255,255,255,0.15)"}}>Sign here with your finger</span>
          </div>
        )}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
        <button onClick={onCancel} style={{padding:"14px",borderRadius:12,border:"1px solid rgba(255,255,255,0.1)",background:"rgba(255,255,255,0.04)",color:"#94a3b8",fontSize:14,cursor:"pointer"}}>Cancel</button>
        <button onClick={clear} style={{padding:"14px",borderRadius:12,border:"1px solid rgba(255,255,255,0.1)",background:"rgba(255,255,255,0.04)",color:"#f59e0b",fontSize:14,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
          <RotateCcw size={14}/> Clear
        </button>
        <button onClick={save} disabled={!hasSignature} style={{padding:"14px",borderRadius:12,border:"none",background:hasSignature?"#16a34a":"rgba(255,255,255,0.08)",color:"white",fontSize:14,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
          <Check size={14}/> Confirm
        </button>
      </div>
    </div>
  );
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
  const { settings: company } = useCompanySettings();
  const today = new Date().toISOString().slice(0,10);

  useEffect(() => {
    if (company?.company_name) document.title = company.company_name + " Field";
  }, [company]);

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
      supabase.from("field_payments").select("amount,paid_at,payment_method,signature_url,worker:worker_id(first_name,last_name)").eq("company_id",cid).order("paid_at",{ascending:false}).limit(10),
      supabase.from("project_photos").select("*").eq("project_id",pid).order("created_at",{ascending:false}).limit(6),
    ]);
    setTodayLog(logRes.data);
    setRecentPayments(payRes.data||[]);
    setPhotos(photoRes.data||[]);
  }

  async function switchProject(pid: string) {
    const p = projects.find(x=>x.id===pid);
    if (!p) return;
    setProject(p); localStorage.setItem("field_app_project",pid);
    await loadProjectData(pid, companyId);
  }

  function showToast(msg: string) { setToast(msg); setTimeout(()=>setToast(null),3500); }

  if (loading) return (
    <div style={{minHeight:"100vh",background:"#080b10",display:"flex",alignItems:"center",justifyContent:"center"}}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <div style={{textAlign:"center"}}>
        <div style={{width:40,height:40,border:"3px solid #0891b2",borderTopColor:"transparent",borderRadius:"50%",animation:"spin 0.8s linear infinite",margin:"0 auto 12px"}}/>
        <p style={{color:"#64748b",fontSize:13}}>Loading…</p>
      </div>
    </div>
  );

  const NAV = [
    { s:"home" as Screen,     icon:<Home size={18}/>,         label:"Home" },
    { s:"log" as Screen,      icon:<FileText size={18}/>,     label:"Log" },
    { s:"payments" as Screen, icon:<DollarSign size={18}/>,   label:"Pay" },
    { s:"expenses" as Screen, icon:<Receipt size={18}/>,      label:"Expenses" },
    { s:"safety" as Screen,   icon:<ShieldCheck size={18}/>,  label:"Safety" },
  ];

  return (
    <div style={{minHeight:"100vh",background:"#080b10",color:"#f1f5f9",fontFamily:"system-ui,sans-serif",maxWidth:480,margin:"0 auto",position:"relative",paddingBottom:80}}>
      <style>{`
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes fadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
        *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
        body{margin:0;background:#080b10}
        input,textarea,select{font-size:16px!important}
        ::-webkit-scrollbar{width:0}
      `}</style>
      <div style={{height:"env(safe-area-inset-top,0px)"}}/>

      {/* Header */}
      <div style={{background:"#0d1117",borderBottom:"1px solid rgba(255,255,255,0.06)",padding:"12px 16px",position:"sticky",top:0,zIndex:50}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            {company?.logo_url ? (
              <img src={company.logo_url} style={{width:34,height:34,borderRadius:8,objectFit:"cover",border:"1px solid rgba(255,255,255,0.1)"}}/>
            ) : (
              <div style={{width:34,height:34,borderRadius:8,background:"linear-gradient(135deg,#0891b2,#0e7490)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,fontWeight:800,color:"white"}}>
                {(company?.company_name||"??").slice(0,2).toUpperCase()}
              </div>
            )}
            <div>
              <div style={{fontSize:13,fontWeight:700,color:"#f1f5f9"}}>{company?.company_name||"Field App"}</div>
              <div style={{fontSize:10,color:"#475569"}}>{user?.email?.split("@")[0]}</div>
            </div>
          </div>
          {projects.length > 1 ? (
            <select value={project?.id||""} onChange={e=>switchProject(e.target.value)}
              style={{background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:8,padding:"6px 10px",fontSize:12,color:"#94a3b8",outline:"none",maxWidth:160}}>
              {projects.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          ) : (
            <div style={{fontSize:12,color:"#94a3b8",fontWeight:600,maxWidth:140,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{project?.name||"No project"}</div>
          )}
        </div>
      </div>

      <div style={{animation:"fadeUp 0.3s ease"}}>
        {screen==="home" && <HomeScreen project={project} weather={weather} todayLog={todayLog} recentPayments={recentPayments} photos={photos} safetyChecked={safetyChecked} setScreen={setScreen}/>}
        {screen==="log" && <DailyLogScreen projectId={project?.id} today={today} existing={todayLog} onSave={async()=>{await loadProjectData(project.id,companyId);setScreen("home");showToast("Daily log saved!");}} onBack={()=>setScreen("home")}/>}
        {screen==="photos" && <PhotoScreen projectId={project?.id} photos={photos} onSave={async()=>{await loadProjectData(project.id,companyId);showToast("Photo uploaded!");}} onBack={()=>setScreen("home")}/>}
        {screen==="payments" && <PaymentsScreen companyId={companyId} projectId={project?.id} payments={recentPayments} onBack={()=>setScreen("home")} onRefresh={async()=>await loadProjectData(project.id,companyId)} showToast={showToast}/>}
        {screen==="expenses" && <ExpensesScreen companyId={companyId} projectId={project?.id} onBack={()=>setScreen("home")} showToast={showToast}/>}
        {screen==="issue" && <IssueScreen projectId={project?.id} onSave={()=>{setScreen("home");showToast("Issue logged!");}} onBack={()=>setScreen("home")}/>}
        {screen==="safety" && <SafetyScreen checked={safetyChecked} onChange={setSafetyChecked} onBack={()=>setScreen("home")}/>}
      </div>

      {/* Bottom Nav */}
      <div style={{position:"fixed",bottom:0,left:"50%",transform:"translateX(-50%)",width:"100%",maxWidth:480,background:"rgba(13,17,23,0.97)",backdropFilter:"blur(16px)",borderTop:"1px solid rgba(255,255,255,0.08)",display:"flex",zIndex:50,paddingBottom:"env(safe-area-inset-bottom,0px)"}}>
        {NAV.map(n=>(
          <button key={n.s} onClick={()=>setScreen(n.s)}
            style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:3,padding:"10px 0",background:"none",border:"none",cursor:"pointer",color:screen===n.s?"#0891b2":"#475569",transition:"color 0.2s"}}>
            {n.icon}
            <span style={{fontSize:9,fontWeight:600,textTransform:"uppercase",letterSpacing:0.5}}>{n.label}</span>
          </button>
        ))}
      </div>

      {toast && (
        <div style={{position:"fixed",bottom:80,left:"50%",transform:"translateX(-50%)",background:"#0d1117",border:"1px solid rgba(34,197,94,0.3)",borderRadius:12,padding:"10px 20px",color:"#22c55e",fontSize:13,fontWeight:700,zIndex:100,whiteSpace:"nowrap",boxShadow:"0 8px 32px rgba(0,0,0,0.5)"}}>
          ✓ {toast}
        </div>
      )}
    </div>
  );
}

// ─── Home Screen ──────────────────────────────────────────────────────────────
function HomeScreen({ project, weather, todayLog, recentPayments, photos, safetyChecked, setScreen }: any) {
  return (
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

      {/* Today's Log */}
      <div style={{background:todayLog?"rgba(34,197,94,0.08)":"rgba(245,158,11,0.08)",border:`1px solid ${todayLog?"rgba(34,197,94,0.2)":"rgba(245,158,11,0.2)"}`,borderRadius:12,padding:"12px 16px",display:"flex",alignItems:"center",gap:12}}>
        <div style={{fontSize:24}}>{todayLog?"✅":"📋"}</div>
        <div style={{flex:1}}>
          <div style={{fontSize:13,fontWeight:700,color:todayLog?"#22c55e":"#f59e0b"}}>{todayLog?"Daily log submitted":"No log yet today"}</div>
          <div style={{fontSize:11,color:"#64748b"}}>{todayLog?`${todayLog.workers_count||0} workers · ${todayLog.work_performed?.slice(0,40)||"Logged"}`:"Tap Daily Log to submit"}</div>
        </div>
        <button onClick={()=>setScreen("log")} style={{padding:"6px 12px",background:todayLog?"rgba(34,197,94,0.15)":"rgba(245,158,11,0.15)",border:`1px solid ${todayLog?"rgba(34,197,94,0.3)":"rgba(245,158,11,0.3)"}`,borderRadius:8,color:todayLog?"#22c55e":"#f59e0b",fontSize:11,fontWeight:700,cursor:"pointer"}}>
          {todayLog?"Update":"Log Now"}
        </button>
      </div>

      {/* Quick Actions Grid */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
        {[
          { s:"log",      label:"Daily Log",    sub:todayLog?"Update":"New log",       icon:<FileText size={22} color="white"/>,      grad:"linear-gradient(135deg,#2563eb,#1d4ed8)" },
          { s:"photos",   label:"Site Photos",  sub:`${photos.length} uploaded`,       icon:<Camera size={22} color="white"/>,        grad:"linear-gradient(135deg,#16a34a,#15803d)" },
          { s:"payments", label:"Pay Worker",   sub:`${recentPayments.length} recent`, icon:<DollarSign size={22} color="white"/>,    grad:"linear-gradient(135deg,#d97706,#b45309)" },
          { s:"expenses", label:"Log Expense",  sub:"Scan receipt",                    icon:<Receipt size={22} color="white"/>,       grad:"linear-gradient(135deg,#7c3aed,#6d28d9)" },
          { s:"issue",    label:"Log Issue",    sub:"Report problem",                  icon:<AlertTriangle size={22} color="white"/>, grad:"linear-gradient(135deg,#dc2626,#b91c1c)" },
          { s:"safety",   label:"Safety Check", sub:`${safetyChecked.size}/${SAFETY_ITEMS.length} done`, icon:<ShieldCheck size={22} color="white"/>, grad:"linear-gradient(135deg,#0891b2,#0e7490)" },
        ].map(a=>(
          <button key={a.s} onClick={()=>setScreen(a.s as Screen)}
            style={{background:a.grad,borderRadius:14,padding:"16px 14px",border:"none",cursor:"pointer",textAlign:"left",display:"flex",alignItems:"center",gap:12,boxShadow:"0 4px 16px rgba(0,0,0,0.3)"}}>
            <div style={{width:44,height:44,borderRadius:"50%",background:"rgba(255,255,255,0.2)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
              {a.icon}
            </div>
            <div>
              <div style={{color:"white",fontWeight:700,fontSize:14}}>{a.label}</div>
              <div style={{color:"rgba(255,255,255,0.65)",fontSize:11,marginTop:2}}>{a.sub}</div>
            </div>
          </button>
        ))}
      </div>

      {/* Recent Payments */}
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
                <div style={{fontSize:10,color:"#475569"}}>{p.payment_method||"Cash"} · {new Date(p.paid_at).toLocaleDateString()}{p.signature_url?" · ✍️ Signed":""}</div>
              </div>
              <div style={{fontSize:14,fontWeight:800,color:"#22c55e"}}>{fmtJMD(Number(p.amount||0))}</div>
            </div>
          ))}
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
    setSaving(false); onSave();
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
      await supabase.storage.from("project-files").upload(path,file,{cacheControl:"3600",upsert:false});
      const { data:sd } = supabase.storage.from("project-files").getPublicUrl(path);
      await supabase.from("project_photos").insert({ project_id:projectId, url:sd.publicUrl, public_url:sd.publicUrl, caption:caption||null });
      setCaption(""); onSave();
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

// ─── Payments Screen — with Digital Signature ─────────────────────────────────
function PaymentsScreen({ companyId, projectId, payments, onBack, onRefresh, showToast }: any) {
  const [showAdd, setShowAdd] = useState(false);
  const [workers, setWorkers] = useState<any[]>([]);
  const [selWorker, setSelWorker] = useState("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("Cash");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [showSig, setShowSig] = useState(false);
  const [sigDataUrl, setSigDataUrl] = useState<string|null>(null);
  const selectedWorker = workers.find(w=>w.id===selWorker);

  useEffect(()=>{
    if(companyId) supabase.from("workers").select("id,first_name,last_name").eq("company_id",companyId).eq("status","active").then(({data})=>setWorkers(data||[]));
  },[companyId]);

  async function savePayment() {
    if(!selWorker||!amount){alert("Select worker and enter amount.");return;}
    setSaving(true);
    // Upload signature if exists
    let sigUrl = null;
    if (sigDataUrl) {
      try {
        const blob = await (await fetch(sigDataUrl)).blob();
        const path = `signatures/${companyId}/${Date.now()}.png`;
        const { error:ue } = await supabase.storage.from("project-files").upload(path, blob, {contentType:"image/png",upsert:false});
        if (!ue) {
          const { data:sd } = supabase.storage.from("project-files").getPublicUrl(path);
          sigUrl = sd.publicUrl;
        }
      } catch {}
    }
    await supabase.from("field_payments").insert({
      company_id:companyId, project_id:projectId||null, worker_id:selWorker,
      amount:parseFloat(amount), payment_method:method,
      paid_at:new Date().toISOString(), status:"paid",
      notes:notes||null, signature_url:sigUrl,
    });
    setSaving(false); setShowAdd(false); setSelWorker(""); setAmount(""); setNotes(""); setSigDataUrl(null);
    showToast("Payment saved with signature!");
    if(onRefresh) onRefresh();
  }

  const total = payments.reduce((s:number,p:any)=>s+Number(p.amount||0),0);

  return (
    <div style={{padding:16}}>
      {showSig && (
        <SignaturePad
          label={`${selectedWorker?.first_name||"Worker"} ${selectedWorker?.last_name||""} — Sign to confirm payment of ${fmtJMD(Number(amount||0))}`}
          onSave={(url)=>{setSigDataUrl(url);setShowSig(false);}}
          onCancel={()=>setShowSig(false)}/>
      )}

      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:20}}>
        <button onClick={onBack} style={{background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:10,padding:"8px 14px",color:"#94a3b8",fontSize:13,cursor:"pointer"}}>← Back</button>
        <h2 style={{fontSize:18,fontWeight:800,color:"#f1f5f9",margin:0}}>Field Payments</h2>
        <button onClick={()=>setShowAdd(!showAdd)} style={{marginLeft:"auto",background:"linear-gradient(135deg,#d97706,#b45309)",border:"none",borderRadius:10,padding:"10px 20px",color:"white",fontSize:14,fontWeight:700,cursor:"pointer"}}>+ Add</button>
      </div>

      {showAdd && (
        <div style={{background:"rgba(255,255,255,0.04)",border:"1px solid rgba(217,119,6,0.3)",borderRadius:16,padding:16,marginBottom:16,display:"flex",flexDirection:"column",gap:12}}>
          <div style={{fontSize:14,fontWeight:700,color:"#f59e0b"}}>New Field Payment</div>

          <select value={selWorker} onChange={(e:any)=>setSelWorker(e.target.value)}
            style={{width:"100%",background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:10,padding:"12px 14px",color:selWorker?"#f1f5f9":"#64748b",fontSize:15,outline:"none"}}>
            <option value="">Select worker…</option>
            {workers.map((w:any)=><option key={w.id} value={w.id}>{w.first_name} {w.last_name}</option>)}
          </select>

          <input type="number" value={amount} onChange={(e:any)=>setAmount(e.target.value)} placeholder="Amount (JMD)"
            style={{width:"100%",background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:10,padding:"12px 14px",color:"#f1f5f9",fontSize:15,outline:"none"}}/>

          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8}}>
            {["Cash","Cheque","Transfer"].map((m:string)=>(
              <button key={m} onClick={()=>setMethod(m)}
                style={{padding:"10px",borderRadius:10,border:"2px solid "+(method===m?"#d97706":"rgba(255,255,255,0.08)"),background:method===m?"rgba(217,119,6,0.15)":"rgba(255,255,255,0.04)",color:method===m?"#f59e0b":"#64748b",fontSize:13,fontWeight:600,cursor:"pointer"}}>
                {m}
              </button>
            ))}
          </div>

          <input value={notes} onChange={(e:any)=>setNotes(e.target.value)} placeholder="Notes (optional)"
            style={{width:"100%",background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:10,padding:"12px 14px",color:"#f1f5f9",fontSize:14,outline:"none"}}/>

          {/* Signature section */}
          <div style={{background:"rgba(255,255,255,0.02)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:12,padding:12}}>
            <div style={{fontSize:11,color:"#64748b",fontWeight:700,textTransform:"uppercase",letterSpacing:1,marginBottom:8}}>Worker Signature</div>
            {sigDataUrl ? (
              <div style={{display:"flex",alignItems:"center",gap:10}}>
                <img src={sigDataUrl} style={{height:48,borderRadius:8,background:"white",padding:4}}/>
                <span style={{fontSize:12,color:"#22c55e",fontWeight:600}}>✓ Signed</span>
                <button onClick={()=>setSigDataUrl(null)} style={{marginLeft:"auto",fontSize:11,color:"#ef4444",background:"none",border:"none",cursor:"pointer"}}>Remove</button>
              </div>
            ) : (
              <button onClick={()=>{if(!selWorker||!amount){alert("Select worker and amount first.");return;}setShowSig(true);}}
                style={{width:"100%",padding:"12px",borderRadius:10,border:"2px dashed rgba(255,255,255,0.15)",background:"rgba(255,255,255,0.02)",color:"#64748b",fontSize:13,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
                <Pen size={14}/> Tap to get worker signature
              </button>
            )}
          </div>

          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
            <button onClick={()=>setShowAdd(false)} style={{padding:"12px",borderRadius:10,border:"1px solid rgba(255,255,255,0.1)",background:"rgba(255,255,255,0.04)",color:"#94a3b8",fontSize:14,cursor:"pointer"}}>Cancel</button>
            <button onClick={savePayment} disabled={saving} style={{padding:"12px",borderRadius:10,border:"none",background:saving?"rgba(217,119,6,0.4)":"linear-gradient(135deg,#d97706,#b45309)",color:"white",fontSize:14,fontWeight:700,cursor:"pointer"}}>{saving?"Saving…":"Save Payment"}</button>
          </div>
        </div>
      )}

      <div style={{background:"linear-gradient(135deg,rgba(217,119,6,0.15),rgba(180,83,9,0.08))",border:"1px solid rgba(217,119,6,0.25)",borderRadius:16,padding:"20px",textAlign:"center",marginBottom:16}}>
        <div style={{fontSize:11,color:"#d97706",fontWeight:700,letterSpacing:2,textTransform:"uppercase",marginBottom:8}}>Total Paid (Recent)</div>
        <div style={{fontSize:32,fontWeight:900,color:"#f59e0b"}}>{fmtJMD(total)}</div>
      </div>

      {payments.length === 0 ? (
        <div style={{textAlign:"center",padding:"40px 0",color:"#475569",fontSize:14}}>No payments yet</div>
      ) : payments.map((p:any,i:number)=>(
        <div key={i} style={{background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.07)",borderRadius:14,padding:"14px 16px",marginBottom:8,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div>
            <div style={{fontSize:14,fontWeight:700,color:"#e2e8f0"}}>{p.worker?.first_name} {p.worker?.last_name}</div>
            <div style={{fontSize:11,color:"#475569",marginTop:2}}>
              {p.payment_method||"Cash"} · {new Date(p.paid_at).toLocaleDateString("en-US",{month:"short",day:"numeric"})}
              {p.signature_url && <span style={{color:"#22c55e"}}> · ✍️ Signed</span>}
            </div>
          </div>
          <div style={{fontSize:18,fontWeight:800,color:"#22c55e"}}>{fmtJMD(Number(p.amount||0))}</div>
        </div>
      ))}
    </div>
  );
}

// ─── Expenses Screen — with Receipt Photo Scan ────────────────────────────────
function ExpensesScreen({ companyId, projectId, onBack, showToast }: any) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [scanning, setScanning] = useState(false);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [form, setForm] = useState({ description:"", amount:"", vendor:"", category:"Materials", date:new Date().toISOString().slice(0,10), notes:"" });
  const [saving, setSaving] = useState(false);
  const [receiptUrl, setReceiptUrl] = useState<string|null>(null);

  useEffect(()=>{
    if(companyId) supabase.from("expenses").select("*").eq("company_id",companyId).order("created_at",{ascending:false}).limit(10).then(({data})=>setExpenses(data||[]));
  },[companyId]);

  async function handleReceipt(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    setScanning(true);
    try {
      // Upload photo first
      const path = `receipts/${companyId}/${Date.now()}-${file.name}`;
      await supabase.storage.from("project-files").upload(path,file,{cacheControl:"3600",upsert:false});
      const { data:sd } = supabase.storage.from("project-files").getPublicUrl(path);
      setReceiptUrl(sd.publicUrl);

      // Convert to base64 for AI
      const base64 = await new Promise<string>((res,rej)=>{
        const r = new FileReader();
        r.onload=()=>res((r.result as string).split(",")[1]);
        r.onerror=()=>rej(new Error("Read failed"));
        r.readAsDataURL(file);
      });

      // Call AI via Supabase Edge Function
      const { data:aiData } = await supabase.functions.invoke("magnus-ai", {
        body: {
          action: "scan_receipt",
          imageBase64: base64,
          mimeType: file.type,
        }
      });

      if (aiData?.result) {
        const r = aiData.result;
        setForm(f=>({
          ...f,
          description: r.description || r.items?.[0]?.description || f.description,
          amount: r.total?.toString() || r.amount?.toString() || f.amount,
          vendor: r.vendor || r.supplier || f.vendor,
          date: r.date || f.date,
        }));
        showToast("Receipt scanned! Check the details below.");
      }
    } catch(e:any) { alert("Scan failed: "+e.message); }
    setScanning(false);
  }

  async function saveExpense() {
    if(!form.description||!form.amount){alert("Description and amount required.");return;}
    setSaving(true);
    await supabase.from("expenses").insert({
      company_id:companyId, project_id:projectId||null,
      description:form.description, amount:parseFloat(form.amount),
      vendor_name:form.vendor||null, category:form.category,
      expense_date:form.date, notes:form.notes||null,
      receipt_url:receiptUrl||null, status:"pending",
    });
    setSaving(false);
    setForm({ description:"", amount:"", vendor:"", category:"Materials", date:new Date().toISOString().slice(0,10), notes:"" });
    setReceiptUrl(null);
    showToast("Expense logged!");
    const {data} = await supabase.from("expenses").select("*").eq("company_id",companyId).order("created_at",{ascending:false}).limit(10);
    setExpenses(data||[]);
  }

  return (
    <div style={{padding:16}}>
      <input ref={fileRef} type="file" accept="image/*" capture="environment" style={{display:"none"}} onChange={handleReceipt}/>

      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:20}}>
        <button onClick={onBack} style={{background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:10,padding:"8px 14px",color:"#94a3b8",fontSize:13,cursor:"pointer"}}>← Back</button>
        <h2 style={{fontSize:18,fontWeight:800,color:"#f1f5f9",margin:0}}>Log Expense</h2>
      </div>

      {/* Scan Receipt Button */}
      <button onClick={()=>fileRef.current?.click()} disabled={scanning}
        style={{width:"100%",padding:"18px",borderRadius:14,border:"2px dashed rgba(124,58,237,0.4)",background:scanning?"rgba(124,58,237,0.1)":"rgba(124,58,237,0.06)",color:scanning?"#a78bfa":"#7c3aed",fontSize:15,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:10,marginBottom:16}}>
        {scanning ? <><Loader size={18} style={{animation:"spin 0.8s linear infinite"}}/> AI Reading Receipt…</> : <><Camera size={18}/> Scan Receipt / Invoice</>}
      </button>

      {receiptUrl && (
        <div style={{marginBottom:12,borderRadius:12,overflow:"hidden",border:"1px solid rgba(124,58,237,0.3)"}}>
          <img src={receiptUrl} style={{width:"100%",maxHeight:160,objectFit:"cover"}}/>
          <div style={{padding:"8px 12px",background:"rgba(124,58,237,0.1)",fontSize:11,color:"#a78bfa",fontWeight:600}}>✓ Receipt uploaded · AI has read this</div>
        </div>
      )}

      <div style={{display:"flex",flexDirection:"column",gap:12}}>
        <div>
          <label style={{fontSize:11,color:"#64748b",fontWeight:700,textTransform:"uppercase",letterSpacing:1,display:"block",marginBottom:6}}>Description *</label>
          <input value={form.description} onChange={e=>setForm(f=>({...f,description:e.target.value}))} placeholder="What was purchased?"
            style={{width:"100%",background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:10,padding:"12px 14px",color:"#f1f5f9",fontSize:15,outline:"none"}}/>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          <div>
            <label style={{fontSize:11,color:"#64748b",fontWeight:700,textTransform:"uppercase",letterSpacing:1,display:"block",marginBottom:6}}>Amount (JMD) *</label>
            <input type="number" value={form.amount} onChange={e=>setForm(f=>({...f,amount:e.target.value}))} placeholder="0.00"
              style={{width:"100%",background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:10,padding:"12px 14px",color:"#f1f5f9",fontSize:15,outline:"none"}}/>
          </div>
          <div>
            <label style={{fontSize:11,color:"#64748b",fontWeight:700,textTransform:"uppercase",letterSpacing:1,display:"block",marginBottom:6}}>Date</label>
            <input type="date" value={form.date} onChange={e=>setForm(f=>({...f,date:e.target.value}))}
              style={{width:"100%",background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:10,padding:"12px 14px",color:"#f1f5f9",fontSize:14,outline:"none"}}/>
          </div>
        </div>
        <div>
          <label style={{fontSize:11,color:"#64748b",fontWeight:700,textTransform:"uppercase",letterSpacing:1,display:"block",marginBottom:6}}>Vendor / Supplier</label>
          <input value={form.vendor} onChange={e=>setForm(f=>({...f,vendor:e.target.value}))} placeholder="e.g. Hardware World"
            style={{width:"100%",background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:10,padding:"12px 14px",color:"#f1f5f9",fontSize:15,outline:"none"}}/>
        </div>
        <div>
          <label style={{fontSize:11,color:"#64748b",fontWeight:700,textTransform:"uppercase",letterSpacing:1,display:"block",marginBottom:6}}>Category</label>
          <select value={form.category} onChange={e=>setForm(f=>({...f,category:e.target.value}))}
            style={{width:"100%",background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:10,padding:"12px 14px",color:"#f1f5f9",fontSize:15,outline:"none"}}>
            {["Materials","Labour","Equipment","Transport","Utilities","Subcontractor","Other"].map(c=><option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <button onClick={saveExpense} disabled={saving}
          style={{width:"100%",padding:"16px 0",background:saving?"rgba(124,58,237,0.4)":"linear-gradient(135deg,#7c3aed,#6d28d9)",border:"none",borderRadius:14,color:"white",fontSize:16,fontWeight:700,cursor:"pointer"}}>
          {saving?"Saving…":"Save Expense ✓"}
        </button>
      </div>

      {expenses.length > 0 && (
        <div style={{marginTop:20}}>
          <div style={{fontSize:11,color:"#64748b",fontWeight:700,textTransform:"uppercase",letterSpacing:1,marginBottom:10}}>Recent Expenses</div>
          {expenses.slice(0,5).map((e:any,i:number)=>(
            <div key={i} style={{background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.07)",borderRadius:12,padding:"12px 14px",marginBottom:8,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div>
                <div style={{fontSize:13,fontWeight:600,color:"#e2e8f0"}}>{e.description}</div>
                <div style={{fontSize:10,color:"#475569",marginTop:2}}>{e.vendor_name||"—"} · {e.category}{e.receipt_url?" · 🧾":""}</div>
              </div>
              <div style={{fontSize:15,fontWeight:800,color:"#a78bfa"}}>{fmtJMD(Number(e.amount||0))}</div>
            </div>
          ))}
        </div>
      )}
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
    setSaving(false); onSave();
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
            <div style={{width:28,height:28,borderRadius:"50%",background:checked.has(i)?"#22c55e":"rgba(255,255,255,0.08)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
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
