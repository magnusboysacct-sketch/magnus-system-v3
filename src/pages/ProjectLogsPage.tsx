import { useParams, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { ArrowLeft, FileText, Plus, Pencil, Trash2, Download } from "lucide-react";
import MobileDailyLogForm from "../components/MobileDailyLogForm";
import { BaseModal } from "../components/common/BaseModal";

export default function ProjectLogsPage() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [projectName, setProjectName] = useState("");
  const [showNewLogModal, setShowNewLogModal] = useState(false);
  const [editingLog, setEditingLog] = useState<any | null>(null);

  useEffect(() => { loadLogs(); loadProject(); }, [projectId]);

  async function loadProject() {
    const { data } = await supabase.from("projects").select("name").eq("id", projectId!).single();
    if (data) setProjectName(data.name);
  }

  async function loadLogs() {
    setLoading(true);
    const { data } = await supabase
      .from("project_daily_logs")
      .select("*")
      .eq("project_id", projectId!)
      .order("log_date", { ascending: false });
    setLogs(data || []);
    setLoading(false);
  }

  async function deleteLog(id: string) {
    if (!confirm("Delete this daily log? This cannot be undone.")) return;
    await supabase.from("project_daily_logs").delete().eq("id", id);
    loadLogs();
  }

  function exportLog(log: any) {
    const lines = [
      `Daily Log — ${projectName}`,
      `Date: ${new Date(log.log_date).toLocaleDateString()}`,
      `Weather: ${log.weather || log.weather_condition || "—"}`,
      `Workers on Site: ${log.workers_count ?? "—"}`,
      `Work Performed: ${log.work_performed || "—"}`,
      `Deliveries: ${log.deliveries || "—"}`,
      `Issues: ${log.issues || "—"}`,
      `Notes: ${log.notes || "—"}`,
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `daily-log-${log.log_date}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function getWeatherEmoji(desc: string) {
    if (!desc) return "🌤️";
    const d = desc.toLowerCase();
    if (d.includes("sun") || d.includes("clear")) return "☀️";
    if (d.includes("cloud")) return "⛅";
    if (d.includes("rain") || d.includes("shower")) return "🌧️";
    if (d.includes("storm") || d.includes("thunder")) return "⛈️";
    if (d.includes("wind")) return "💨";
    if (d.includes("fog") || d.includes("mist")) return "🌫️";
    return "🌤️";
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-4 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate(`/projects/${projectId}`)}
          className="p-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
          <ArrowLeft size={18} className="text-slate-600 dark:text-slate-300"/>
        </button>
        <div>
          <h1 className="text-lg font-bold text-slate-800 dark:text-slate-100">Daily Logs</h1>
          <p className="text-xs text-slate-500">{projectName}</p>
        </div>
        <button onClick={() => setShowNewLogModal(true)}
          className="ml-auto flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl transition-colors">
          <Plus size={16}/> New Log
        </button>
      </div>

      {/* Logs list */}
      {loading ? (
        <div className="text-center py-12 text-slate-400 text-sm">Loading...</div>
      ) : logs.length === 0 ? (
        <div className="text-center py-12">
          <FileText size={40} className="mx-auto text-slate-300 mb-3"/>
          <p className="text-slate-500 text-sm">No daily logs yet</p>
        </div>
      ) : (
        <div className="space-y-3">
          {logs.map(log => (
            <div key={log.id} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="text-center min-w-[40px]">
                    <div className="text-lg font-bold text-slate-800 dark:text-slate-100">
                      {new Date(log.log_date).getDate()}
                    </div>
                    <div className="text-xs text-slate-400 uppercase">
                      {new Date(log.log_date).toLocaleString("default", { month: "short" })}
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-base">{getWeatherEmoji(log.weather || log.weather_condition || "")}</span>
                      <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                        {log.workers_count} worker{log.workers_count !== 1 ? "s" : ""}
                      </span>
                    </div>
                    {log.work_performed && (
                      <p className="text-xs text-slate-500 mt-1 line-clamp-2">{log.work_performed}</p>
                    )}
                  </div>
                </div>
                {/* Action buttons */}
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button onClick={() => setEditingLog(log)}
                    className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-blue-500 transition-colors">
                    <Pencil size={14}/>
                  </button>
                  <button onClick={() => exportLog(log)}
                    className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-green-500 transition-colors">
                    <Download size={14}/>
                  </button>
                  <button onClick={() => deleteLog(log.id)}
                    className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-red-500 transition-colors">
                    <Trash2 size={14}/>
                  </button>
                </div>
              </div>
              {log.issues && (
                <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                  <p className="text-xs text-orange-500 font-medium">⚠️ {log.issues}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* New Log Modal */}
      {projectId && (
        <BaseModal isOpen={showNewLogModal} onClose={() => setShowNewLogModal(false)} title="Daily Log" size="lg">
          <MobileDailyLogForm
            projectId={projectId}
            projectName={projectName}
            onSuccess={() => { setShowNewLogModal(false); loadLogs(); }}
            onCancel={() => setShowNewLogModal(false)}
          />
        </BaseModal>
      )}

      {/* Edit Log Modal */}
      {projectId && editingLog && (
        <BaseModal isOpen={!!editingLog} onClose={() => setEditingLog(null)} title="Edit Log" size="lg">
          <MobileDailyLogForm
            projectId={projectId}
            projectName={projectName}
            onSuccess={() => { setEditingLog(null); loadLogs(); }}
            onCancel={() => setEditingLog(null)}
            prefillDate={editingLog.log_date}
          />
        </BaseModal>
      )}
    </div>
  );
}
