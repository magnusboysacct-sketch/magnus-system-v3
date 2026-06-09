// src/pages/AccessLogPage.tsx
import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { Card, Badge, Table, Th, Tr, Td, Empty } from "../components/ui";
import { RefreshCw, Clock, User, Trash2, Download, Filter, Settings2, CheckSquare, Square } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface LogEntry {
  id: string;
  scanned_at: string;
  action: string;
  device_info: string;
  worker: {
    first_name: string;
    last_name: string;
    worker_type: string;
    status: string;
    passport_photo_url?: string | null;
    id_photo_url?: string | null;
    employee_id?: string | null;
  };
}

function timeAgo(dt: string) {
  const diff = Math.floor((Date.now() - new Date(dt).getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return new Date(dt).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function deviceShort(ua: string) {
  if (!ua) return "Unknown";
  if (/iPhone|iPad/i.test(ua)) return "iPhone/iPad";
  if (/Android/i.test(ua)) return "Android";
  if (/Windows/i.test(ua)) return "Windows PC";
  if (/Mac/i.test(ua)) return "Mac";
  return "Browser";
}

function roleLabel(t?: string) {
  return (t || "worker").replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase());
}

export default function AccessLogPage() {
  const navigate = useNavigate();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dateFilter, setDateFilter] = useState<"all"|"today"|"week"|"month">("all");
  const [autoDelete, setAutoDelete] = useState(90);
  const [showSettings, setShowSettings] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase.from("user_profiles").select("company_id").eq("id", user.id).maybeSingle();
      if (profile?.company_id) { setCompanyId(profile.company_id); await loadLogs(profile.company_id); }
    }
    init();
  }, []);

  async function loadLogs(cid: string) {
    setLoading(true);
    const { data } = await supabase
      .from("access_logs")
      .select("id,scanned_at,action,device_info,worker:worker_id(first_name,last_name,worker_type,status,passport_photo_url,id_photo_url,employee_id)")
      .eq("company_id", cid).order("scanned_at", { ascending: false }).limit(500);
    setLogs((data as any) || []);
    setSelected(new Set());
    setLoading(false);
  }

  const filtered = logs.filter(l => {
    if (dateFilter === "all") return true;
    const d = new Date(l.scanned_at), now = new Date();
    if (dateFilter === "today") return d.toDateString() === now.toDateString();
    if (dateFilter === "week") return (now.getTime() - d.getTime()) < 7*86400000;
    if (dateFilter === "month") return (now.getTime() - d.getTime()) < 30*86400000;
    return true;
  });

  const todayCount = logs.filter(l => new Date(l.scanned_at).toDateString() === new Date().toDateString()).length;
  const uniqueWorkers = new Set(logs.map(l => l.worker?.first_name + l.worker?.last_name)).size;

  function toggleAll() { setSelected(selected.size === filtered.length ? new Set() : new Set(filtered.map(l => l.id))); }
  function toggleOne(id: string) { const s = new Set(selected); s.has(id) ? s.delete(id) : s.add(id); setSelected(s); }

  async function deleteSelected() {
    if (!selected.size || !confirm(`Delete ${selected.size} log(s)?`)) return;
    setDeleting(true);
    await supabase.from("access_logs").delete().in("id", Array.from(selected));
    setDeleting(false);
    if (companyId) await loadLogs(companyId);
  }

  async function clearAll() {
    if (!companyId || !confirm("Delete ALL access logs?")) return;
    setDeleting(true);
    await supabase.from("access_logs").delete().eq("company_id", companyId);
    setDeleting(false);
    await loadLogs(companyId);
  }

  async function applyAutoDelete() {
    if (!companyId) return;
    const cutoff = new Date(Date.now() - autoDelete*86400000).toISOString();
    await supabase.from("access_logs").delete().eq("company_id", companyId).lt("scanned_at", cutoff);
    await loadLogs(companyId);
    setShowSettings(false);
    alert(`Deleted logs older than ${autoDelete} days.`);
  }

  function exportCSV() {
    const rows = [["Worker","Role","Status","Device","Time","Date"],
      ...filtered.map(l => [`${l.worker?.first_name} ${l.worker?.last_name}`,roleLabel(l.worker?.worker_type),l.worker?.status||"",deviceShort(l.device_info),new Date(l.scanned_at).toLocaleTimeString(),new Date(l.scanned_at).toLocaleDateString()])];
    const csv = rows.map(r => r.map(c => `"${c}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], {type:"text/csv"}));
    a.download = `access-log-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
  }

  return (
    <div className="space-y-5 p-6">
      <button onClick={() => navigate(-1)} className="text-sm text-slate-400 hover:text-slate-200 transition-colors">← Back</button>
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Access Log</h1>
          <p className="text-sm text-slate-500">Every QR scan recorded in real time</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => companyId && loadLogs(companyId)} className="p-2 rounded-lg bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-slate-600 dark:text-slate-400 transition-colors"><RefreshCw size={15}/></button>
          <button onClick={exportCSV} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-slate-700 dark:text-slate-300 text-xs font-medium transition-colors"><Download size={13}/> Export CSV</button>
          <button onClick={() => setShowSettings(!showSettings)} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-slate-700 dark:text-slate-300 text-xs font-medium transition-colors"><Settings2 size={13}/> Auto-Delete</button>
          {selected.size > 0 && <button onClick={deleteSelected} disabled={deleting} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 text-xs font-medium border border-red-200 dark:border-red-500/20 transition-colors"><Trash2 size={13}/> Delete {selected.size}</button>}
          <button onClick={clearAll} disabled={deleting} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 text-xs font-medium border border-red-200 dark:border-red-500/20 transition-colors"><Trash2 size={13}/> Clear All</button>
        </div>
      </div>
      {showSettings && (
        <Card>
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Delete logs older than:</span>
            {[7,30,90,180,365].map(d => (
              <button key={d} onClick={() => setAutoDelete(d)} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${autoDelete===d?"bg-blue-600 text-white":"bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-400"}`}>{d} days</button>
            ))}
            <button onClick={applyAutoDelete} className="px-4 py-1.5 rounded-lg bg-red-500/20 text-red-500 text-xs font-medium border border-red-500/30 transition-colors">Apply Now</button>
          </div>
        </Card>
      )}
      <div className="grid grid-cols-3 gap-4">
        <Card><div className="text-xs text-slate-500 mb-1">Total Scans</div><div className="text-2xl font-bold text-slate-900 dark:text-slate-100">{logs.length}</div></Card>
        <Card><div className="text-xs text-slate-500 mb-1">Today</div><div className="text-2xl font-bold text-cyan-500">{todayCount}</div></Card>
        <Card><div className="text-xs text-slate-500 mb-1">Unique Workers</div><div className="text-2xl font-bold text-slate-900 dark:text-slate-100">{uniqueWorkers}</div></Card>
      </div>
      <div className="flex items-center gap-2">
        <Filter size={13} className="text-slate-400"/>
        {(["all","today","week","month"] as const).map(f => (
          <button key={f} onClick={() => setDateFilter(f)} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${dateFilter===f?"bg-cyan-600 text-white":"bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-400"}`}>
            {f==="all"?"All Time":f==="week"?"This Week":f==="month"?"This Month":"Today"}
          </button>
        ))}
        <span className="text-xs text-slate-400 ml-1">{filtered.length} records</span>
      </div>
      <Card padding={false}>
        {loading ? (
          <div className="flex items-center justify-center py-16 text-xs text-slate-500"><RefreshCw size={14} className="animate-spin mr-2"/> Loading...</div>
        ) : filtered.length === 0 ? (
          <Empty icon={<Clock size={20}/>} title="No logs found" body="No access logs match your current filter."></Empty>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th><button onClick={toggleAll} className="text-slate-400">{selected.size===filtered.length&&filtered.length>0?<CheckSquare size={14}/>:<Square size={14}/>}</button></Th>
                <Th>Worker</Th><Th>Role</Th><Th>Status</Th><Th>Device</Th><Th>Time</Th><Th></Th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(log => {
                const w = log.worker;
                const photo = w?.passport_photo_url||w?.id_photo_url||"";
                const authorized = w?.status==="active";
                return (
                  <Tr key={log.id}>
                    <Td><button onClick={() => toggleOne(log.id)}>{selected.has(log.id)?<CheckSquare size={14} className="text-blue-500"/>:<Square size={14} className="text-slate-400"/>}</button></Td>
                    <Td>
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full overflow-hidden bg-slate-200 dark:bg-slate-700 flex-shrink-0 flex items-center justify-center">
                          {photo?<img src={photo} alt="" className="w-full h-full object-cover"/>:<User size={14} className="text-slate-400"/>}
                        </div>
                        <div>
                          <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">{w?.first_name} {w?.last_name}</div>
                          {w?.employee_id&&<div className="text-[10px] text-slate-400">#{w.employee_id}</div>}
                        </div>
                      </div>
                    </Td>
                    <Td><span className="text-[11px] text-slate-500">{roleLabel(w?.worker_type)}</span></Td>
                    <Td><Badge color={authorized?"green":"red"} dot>{authorized?"Authorized":"Denied"}</Badge></Td>
                    <Td><span className="text-[11px] text-slate-500">{deviceShort(log.device_info)}</span></Td>
                    <Td>
                      <div className="flex items-center gap-1 text-[11px] text-slate-500"><Clock size={11}/> {timeAgo(log.scanned_at)}</div>
                      <div className="text-[10px] text-slate-400">{new Date(log.scanned_at).toLocaleTimeString()}</div>
                    </Td>
                    <Td>
                      <button onClick={async()=>{await supabase.from("access_logs").delete().eq("id",log.id);if(companyId)loadLogs(companyId);}} className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-500/15 text-slate-400 hover:text-red-500 transition-colors"><Trash2 size={12}/></button>
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}