// src/pages/FieldOpsPage.tsx — Full redesign
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Calendar, Camera, FileText, ChevronRight, Plus, AlertTriangle,
  DollarSign, Package, ShieldCheck, Users, Clock, CloudSun,
  CheckCircle2, Circle, RefreshCw, TrendingUp, Zap
} from "lucide-react";
import { useProjectContext } from "../context/ProjectContext";
import { fetchDailyLogs, type DailyLog } from "../lib/dailyLogs";
import { fetchProjectPhotos } from "../lib/photos";
import MobileDailyLogForm from "../components/MobileDailyLogForm";
import MobilePhotoCapture from "../components/MobilePhotoCapture";
import { BaseModal } from "../components/common/BaseModal";
import AIAssistantPanel from "../components/AIAssistantPanel";
import { supabase } from "../lib/supabase";

type SiteStatus = "active" | "delayed" | "on_hold";

const SAFETY_ITEMS = [
  "PPE checked for all workers",
  "Site perimeter secured",
  "Equipment inspected",
  "Emergency contacts posted",
  "First aid kit accessible",
  "No unauthorized personnel on site",
];

export default function FieldOpsPage() {
  const navigate = useNavigate();
  const { currentProject } = useProjectContext();

  const [recentLogs, setRecentLogs] = useState<DailyLog[]>([]);
  const [recentPhotos, setRecentPhotos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showLogModal, setShowLogModal] = useState(false);
  const [showPhotoModal, setShowPhotoModal] = useState(false);
  const [siteStatus, setSiteStatus] = useState<SiteStatus>("active");
  const [safetyChecked, setSafetyChecked] = useState<Set<number>>(new Set());
  const [showSafety, setShowSafety] = useState(false);
  const [showIssueModal, setShowIssueModal] = useState(false);
  const [issueText, setIssueText] = useState("");
  const [issueSeverity, setIssueSeverity] = useState<"low"|"medium"|"high">("medium");
  const [weather, setWeather] = useState<{temp:string;desc:string;icon:string} | null>(null);
  const [fieldPaymentsCount, setFieldPaymentsCount] = useState(0);

  const today = new Date().toISOString().split("T")[0];

  useEffect(() => { if (currentProject) loadData(); }, [currentProject]);

  async function loadData() {
    setLoading(true);
    await Promise.all([loadLogs(), loadPhotos(), loadFieldPayments()]);
    setLoading(false);
    // Simple weather fetch
    try {
      const res = await fetch(`https://wttr.in/?format=j1`);
      const d = await res.json();
      const c = d.current_condition[0];
      setWeather({ temp: c.temp_C + "°C", desc: c.weatherDesc[0].value, icon: getWeatherEmoji(c.weatherDesc[0].value) });
    } catch {}
  }

  async function loadLogs() {
    if (!currentProject) return;
    const r = await fetchDailyLogs(currentProject.id);
    if (r.success && r.data) setRecentLogs(r.data.slice(0, 5));
  }

  async function loadPhotos() {
    if (!currentProject) return;
    const r = await fetchProjectPhotos(currentProject.id);
    if (r.success && r.data) setRecentPhotos(r.data.slice(0, 6));
  }

  async function loadFieldPayments() {
    if (!currentProject) return;
    const { count } = await supabase.from("field_payments").select("id", { count: "exact", head: true }).eq("project_id", currentProject.id);
    setFieldPaymentsCount(count || 0);
  }

  function getWeatherEmoji(desc: string) {
    const d = desc.toLowerCase();
    if (d.includes("sun") || d.includes("clear")) return "☀️";
    if (d.includes("cloud")) return "⛅";
    if (d.includes("rain") || d.includes("shower")) return "🌧️";
    if (d.includes("storm") || d.includes("thunder")) return "⛈️";
    if (d.includes("wind")) return "💨";
    if (d.includes("fog") || d.includes("mist")) return "🌫️";
    return "🌤️";
  }

  async function submitIssue() {
    if (!issueText.trim() || !currentProject) return;
    await supabase.from("project_issues").insert({
      project_id: currentProject.id,
      description: issueText,
      severity: issueSeverity,
      reported_at: new Date().toISOString(),
      status: "open",
    }).maybeSingle();
    setIssueText(""); setShowIssueModal(false);
    alert("Issue logged successfully.");
  }

  const todayLog = recentLogs.find(l => l.log_date === today);
  const logsThisWeek = recentLogs.filter(l => {
    const d = new Date(l.log_date);
    return (Date.now() - d.getTime()) < 7 * 86400000;
  }).length;

  const statusColors: Record<SiteStatus, string> = {
    active: "bg-green-500/15 text-green-400 border-green-500/30",
    delayed: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
    on_hold: "bg-red-500/15 text-red-400 border-red-500/30",
  };

  const statusLabels: Record<SiteStatus, string> = {
    active: "● Active",
    delayed: "⚠ Delayed",
    on_hold: "⏸ On Hold",
  };

  if (!currentProject) return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#080b10] flex items-center justify-center p-6">
      <div className="text-center">
        <div className="text-slate-400 mb-4">No project selected</div>
        <button onClick={() => navigate("/projects")} className="px-6 py-3 rounded-xl bg-blue-600 text-white font-medium">Select Project</button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#080b10]">

      {/* Header */}
      <div className="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 px-4 py-4 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">Field Operations</h1>
            <p className="text-sm text-slate-500">{currentProject.name}</p>
          </div>
          <div className="flex items-center gap-2">
            {/* Site status toggle */}
            <select value={siteStatus} onChange={e => setSiteStatus(e.target.value as SiteStatus)}
              className={`text-xs font-semibold px-3 py-1.5 rounded-full border ${statusColors[siteStatus]} bg-transparent cursor-pointer`}>
              <option value="active">● Active</option>
              <option value="delayed">⚠ Delayed</option>
              <option value="on_hold">⏸ On Hold</option>
            </select>
            <button onClick={loadData} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-white/10 text-slate-400">
              <RefreshCw size={15}/>
            </button>
          </div>
        </div>
      </div>

      <div className="p-4 space-y-4 max-w-3xl mx-auto pb-24">

        {/* Weather + Quick Stats */}
        <div className="grid grid-cols-4 gap-3">
          <div className="col-span-1 rounded-xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 p-3 flex flex-col items-center justify-center">
            {weather ? (
              <>
                <div className="text-2xl">{weather.icon}</div>
                <div className="text-sm font-bold text-slate-800 dark:text-slate-100 mt-1">{weather.temp}</div>
                <div className="text-[10px] text-slate-400 text-center leading-tight">{weather.desc}</div>
              </>
            ) : (
              <div className="text-2xl">🌤️</div>
            )}
          </div>
          <div className="rounded-xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 p-3 text-center">
            <div className="text-2xl font-bold text-blue-500">{todayLog?.workers_count || 0}</div>
            <div className="text-[10px] text-slate-400 mt-1 flex items-center justify-center gap-1"><Users size={10}/> On Site</div>
          </div>
          <div className="rounded-xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 p-3 text-center">
            <div className="text-2xl font-bold text-green-500">{logsThisWeek}</div>
            <div className="text-[10px] text-slate-400 mt-1 flex items-center justify-center gap-1"><FileText size={10}/> Logs/Week</div>
          </div>
          <div className="rounded-xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 p-3 text-center">
            <div className="text-2xl font-bold text-purple-500">{recentPhotos.length}</div>
            <div className="text-[10px] text-slate-400 mt-1 flex items-center justify-center gap-1"><Camera size={10}/> Photos</div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-2 gap-3">
          <button onClick={() => setShowLogModal(true)}
            className="p-5 rounded-xl bg-gradient-to-br from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 transition-all shadow-lg group">
            <div className="flex flex-col items-center gap-2">
              <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                <FileText className="w-6 h-6 text-white"/>
              </div>
              <div className="text-white font-semibold">Daily Log</div>
              <div className="text-blue-100 text-xs">{todayLog ? "Update Today" : "Create New"}</div>
            </div>
          </button>

          <button onClick={() => setShowPhotoModal(true)}
            className="p-5 rounded-xl bg-gradient-to-br from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 transition-all shadow-lg group">
            <div className="flex flex-col items-center gap-2">
              <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                <Camera className="w-6 h-6 text-white"/>
              </div>
              <div className="text-white font-semibold">Add Photos</div>
              <div className="text-green-100 text-xs">Capture Site</div>
            </div>
          </button>

          <button onClick={() => navigate("/field-payments")}
            className="p-5 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 transition-all shadow-lg group">
            <div className="flex flex-col items-center gap-2">
              <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                <DollarSign className="w-6 h-6 text-white"/>
              </div>
              <div className="text-white font-semibold">Field Payments</div>
              <div className="text-amber-100 text-xs">{fieldPaymentsCount} payments</div>
            </div>
          </button>

          <button onClick={() => setShowIssueModal(true)}
            className="p-5 rounded-xl bg-gradient-to-br from-red-600 to-rose-700 hover:from-red-700 hover:to-rose-800 transition-all shadow-lg group">
            <div className="flex flex-col items-center gap-2">
              <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                <AlertTriangle className="w-6 h-6 text-white"/>
              </div>
              <div className="text-white font-semibold">Log Issue</div>
              <div className="text-red-100 text-xs">Report delay/problem</div>
            </div>
          </button>
        </div>

        {/* Safety Checklist */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/30 overflow-hidden">
          <button onClick={() => setShowSafety(!showSafety)}
            className="w-full flex items-center justify-between p-4 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
            <div className="flex items-center gap-2">
              <ShieldCheck size={18} className="text-emerald-500"/>
              <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">Safety Checklist</span>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${safetyChecked.size === SAFETY_ITEMS.length ? "bg-green-500/15 text-green-400" : "bg-yellow-500/15 text-yellow-400"}`}>
                {safetyChecked.size}/{SAFETY_ITEMS.length}
              </span>
            </div>
            <ChevronRight size={16} className={`text-slate-400 transition-transform ${showSafety ? "rotate-90" : ""}`}/>
          </button>
          {showSafety && (
            <div className="px-4 pb-4 space-y-2 border-t border-slate-100 dark:border-slate-800 pt-3">
              {SAFETY_ITEMS.map((item, i) => (
                <button key={i} onClick={() => {
                  const s = new Set(safetyChecked);
                  s.has(i) ? s.delete(i) : s.add(i);
                  setSafetyChecked(s);
                }} className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-white/5 transition-colors text-left">
                  {safetyChecked.has(i)
                    ? <CheckCircle2 size={18} className="text-green-500 flex-shrink-0"/>
                    : <Circle size={18} className="text-slate-300 dark:text-slate-600 flex-shrink-0"/>
                  }
                  <span className={`text-sm ${safetyChecked.has(i) ? "text-slate-400 line-through" : "text-slate-700 dark:text-slate-300"}`}>{item}</span>
                </button>
              ))}
              {safetyChecked.size === SAFETY_ITEMS.length && (
                <div className="mt-2 p-3 rounded-lg bg-green-500/10 text-green-400 text-sm font-medium text-center">
                  ✓ All safety checks complete!
                </div>
              )}
            </div>
          )}
        </div>

        {/* Today's Log */}
        {todayLog && (
          <div className="rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/30 p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Calendar size={16} className="text-blue-500"/>
                <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Today's Log</h2>
              </div>
              <button onClick={() => setShowLogModal(true)} className="text-xs text-blue-500 font-medium">Edit</button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {todayLog.weather && (
                <div className="flex items-center gap-2">
                  <span className="text-xl">{getWeatherEmoji(todayLog.weather)}</span>
                  <span className="text-sm text-slate-500 capitalize">{todayLog.weather}</span>
                </div>
              )}
              {todayLog.workers_count > 0 && (
                <div className="flex items-center gap-2">
                  <Users size={14} className="text-slate-400"/>
                  <span className="text-sm text-slate-600 dark:text-slate-300">{todayLog.workers_count} workers</span>
                </div>
              )}
            </div>
            {todayLog.work_performed && (
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-2 line-clamp-2">{todayLog.work_performed}</p>
            )}
          </div>
        )}

        {/* Recent Logs */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/30 p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Recent Logs</h2>
            <button onClick={() => navigate("/project-dashboard")} className="text-xs text-blue-500 font-medium flex items-center gap-1">
              View All <ChevronRight size={12}/>
            </button>
          </div>
          {recentLogs.length === 0 ? (
            <div className="text-center py-8 text-sm text-slate-400">No daily logs yet</div>
          ) : (
            <div className="space-y-2">
              {recentLogs.map(log => (
                <div key={log.id} onClick={() => setShowLogModal(true)}
                  className="p-3 rounded-lg bg-slate-50 dark:bg-slate-950/40 hover:bg-slate-100 dark:hover:bg-slate-900/60 transition cursor-pointer flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="text-center w-10">
                      <div className="text-base font-bold text-slate-700 dark:text-slate-200">{new Date(log.log_date).getDate()}</div>
                      <div className="text-[10px] text-slate-400">{new Date(log.log_date).toLocaleDateString("en-US",{month:"short"})}</div>
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        {log.weather && <span className="text-sm">{getWeatherEmoji(log.weather)}</span>}
                        {log.workers_count > 0 && <span className="text-xs text-slate-400">{log.workers_count} workers</span>}
                      </div>
                      {log.work_performed && <div className="text-xs text-slate-500 dark:text-slate-400 line-clamp-1 mt-0.5">{log.work_performed}</div>}
                    </div>
                  </div>
                  <ChevronRight size={14} className="text-slate-300"/>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Photos */}
        {recentPhotos.length > 0 && (
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/30 p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Recent Photos</h2>
              <button onClick={() => navigate("/project-dashboard")} className="text-xs text-blue-500 font-medium flex items-center gap-1">
                View All <ChevronRight size={12}/>
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {recentPhotos.map(photo => (
                <div key={photo.id} className="aspect-square rounded-lg overflow-hidden bg-slate-100 dark:bg-slate-950">
                  <img src={photo.publicUrl} alt={photo.caption||"Photo"} className="w-full h-full object-cover"/>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Log Issue Modal */}
      {showIssueModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <div className="flex items-center gap-2 mb-4">
              <AlertTriangle size={18} className="text-red-500"/>
              <h2 className="text-base font-bold text-slate-800 dark:text-slate-100">Log Issue / Delay</h2>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium text-slate-500 mb-1 block">Severity</label>
                <div className="flex gap-2">
                  {(["low","medium","high"] as const).map(s => (
                    <button key={s} onClick={() => setIssueSeverity(s)}
                      className={`flex-1 py-2 rounded-lg text-xs font-semibold capitalize transition-colors ${issueSeverity===s
                        ? s==="high"?"bg-red-500 text-white":s==="medium"?"bg-yellow-500 text-white":"bg-blue-500 text-white"
                        : "bg-slate-100 dark:bg-slate-800 text-slate-500"}`}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500 mb-1 block">Description</label>
                <textarea value={issueText} onChange={e => setIssueText(e.target.value)}
                  placeholder="Describe the issue or delay..."
                  className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-slate-800 dark:text-slate-200 resize-none h-28 focus:outline-none focus:ring-2 focus:ring-red-500/30"/>
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setShowIssueModal(false)} className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-sm text-slate-500">Cancel</button>
              <button onClick={submitIssue} className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-semibold transition-colors">Submit Issue</button>
            </div>
          </div>
        </div>
      )}

      <BaseModal isOpen={showLogModal} onClose={() => setShowLogModal(false)} title="Daily Log">
        <MobileDailyLogForm projectId={currentProject.id} onSuccess={() => {setShowLogModal(false);loadData();}} onCancel={() => setShowLogModal(false)} prefillDate={todayLog?.log_date}/>
      </BaseModal>

      <BaseModal isOpen={showPhotoModal} onClose={() => setShowPhotoModal(false)} title="Add Photos">
        <MobilePhotoCapture projectId={currentProject.id} onSuccess={() => {setShowPhotoModal(false);loadData();}} onCancel={() => setShowPhotoModal(false)}/>
      </BaseModal>

      {currentProject && (
        <AIAssistantPanel context="daily_log" currentData={{hasLogToday:!!todayLog,consecutiveDaysWithoutLog:recentLogs.length===0?7:0,weatherConditions:"good",hasDelays:false}} projectId={currentProject.id}
          onAction={(action) => {
            if (action==="Create Daily Log"||action==="View Today's Log") setShowLogModal(true);
            else if (action==="Add Photos") setShowPhotoModal(true);
          }}/>
      )}
    </div>
  );
}
