import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Calendar, Camera, FileText, ChevronRight, Plus } from "lucide-react";
import { useProjectContext } from "../context/ProjectContext";
import { fetchDailyLogs, type DailyLog } from "../lib/dailyLogs";
import { fetchProjectPhotos } from "../lib/photos";
import { fetchProjectActivity, type ProjectActivity } from "../lib/activity";
import MobileDailyLogForm from "../components/MobileDailyLogForm";
import MobilePhotoCapture from "../components/MobilePhotoCapture";
import { BaseModal } from "../components/common/BaseModal";
import AIAssistantPanel from "../components/AIAssistantPanel";

export default function FieldOpsPage() {
  const navigate = useNavigate();
  const { currentProject } = useProjectContext();

  const [recentLogs, setRecentLogs] = useState<DailyLog[]>([]);
  const [recentPhotos, setRecentPhotos] = useState<any[]>([]);
  const [todayActivity, setTodayActivity] = useState<ProjectActivity[]>([]);
  const [loading, setLoading] = useState(true);

  const [showLogModal, setShowLogModal] = useState(false);
  const [showPhotoModal, setShowPhotoModal] = useState(false);

  const today = new Date().toISOString().split('T')[0];

  useEffect(() => {
    if (currentProject) {
      loadData();
    }
  }, [currentProject]);

  async function loadData() {
    if (!currentProject) return;

    setLoading(true);

    await Promise.all([
      loadRecentLogs(),
      loadRecentPhotos(),
      loadTodayActivity(),
    ]);

    setLoading(false);
  }

  async function loadRecentLogs() {
    if (!currentProject) return;

    const result = await fetchDailyLogs(currentProject.id);
    if (result.success && result.data) {
      setRecentLogs(result.data.slice(0, 5));
    }
  }

  async function loadRecentPhotos() {
    if (!currentProject) return;

    const result = await fetchProjectPhotos(currentProject.id);
    if (result.success && result.data) {
      setRecentPhotos(result.data.slice(0, 6));
    }
  }

  async function loadTodayActivity() {
    if (!currentProject) return;

    const result = await fetchProjectActivity(currentProject.id, 10);
    if (result.success && result.data) {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const todaysActivities = result.data.filter(activity => {
        const activityDate = new Date(activity.created_at);
        return activityDate >= todayStart;
      });

      setTodayActivity(todaysActivities);
    }
  }

  function handleLogSuccess() {
    setShowLogModal(false);
    loadData();
  }

  function handlePhotoSuccess() {
    setShowPhotoModal(false);
    loadData();
  }

  function getWeatherEmoji(weather: string) {
    const weatherMap: Record<string, string> = {
      sunny: "☀️",
      cloudy: "☁️",
      rainy: "🌧️",
      windy: "💨",
      snowy: "❄️",
    };
    return weatherMap[weather.toLowerCase()] || "🌤️";
  }

  if (!currentProject) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
        <div className="text-center">
          <div className="text-slate-400 mb-4">No project selected</div>
          <button
            onClick={() => navigate("/projects")}
            className="px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-medium transition"
          >
            Select Project
          </button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950">
        <div className="p-6 text-sm text-slate-400">Loading field operations...</div>
      </div>
    );
  }

  const todayLog = recentLogs.find(log => log.log_date === today);

  return (
    <div className="min-h-screen bg-slate-950">
      <div className="border-b border-slate-800 bg-slate-900/50 px-4 py-4 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-lg font-semibold text-slate-200">Field Operations</h1>
          <p className="text-sm text-slate-400 mt-0.5">{currentProject.name}</p>
        </div>
      </div>

      <div className="p-4 space-y-4 max-w-3xl mx-auto pb-24">
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => setShowLogModal(true)}
            className="p-5 rounded-xl bg-gradient-to-br from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 transition-all shadow-lg group"
          >
            <div className="flex flex-col items-center gap-2">
              <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                <FileText className="w-6 h-6 text-white" />
              </div>
              <div className="text-white font-medium text-base">Daily Log</div>
              <div className="text-blue-100 text-xs">
                {todayLog ? "Update Today" : "Create New"}
              </div>
            </div>
          </button>

          <button
            onClick={() => setShowPhotoModal(true)}
            className="p-5 rounded-xl bg-gradient-to-br from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 transition-all shadow-lg group"
          >
            <div className="flex flex-col items-center gap-2">
              <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                <Camera className="w-6 h-6 text-white" />
              </div>
              <div className="text-white font-medium text-base">Add Photos</div>
              <div className="text-green-100 text-xs">Capture Site</div>
            </div>
          </button>
        </div>

        {todayActivity.length > 0 && (
          <div className="rounded-xl border border-slate-800 bg-slate-900/30 p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-slate-200">Today's Activity</h2>
              <div className="text-xs text-slate-500">{todayActivity.length} updates</div>
            </div>
            <div className="space-y-2">
              {todayActivity.map((activity) => (
                <div key={activity.id} className="flex items-start gap-3 p-3 rounded-lg bg-slate-950/40">
                  <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center flex-shrink-0">
                    <div className="w-2 h-2 rounded-full bg-blue-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-slate-300">{activity.message}</div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      {new Date(activity.created_at).toLocaleTimeString('en-US', {
                        hour: 'numeric',
                        minute: '2-digit',
                      })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {todayLog && (
          <div className="rounded-xl border border-blue-800 bg-blue-950/30 p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Calendar className="w-5 h-5 text-blue-400" />
                <h2 className="text-sm font-semibold text-slate-200">Today's Log</h2>
              </div>
              <button
                onClick={() => setShowLogModal(true)}
                className="text-xs text-blue-400 hover:text-blue-300 font-medium"
              >
                Edit
              </button>
            </div>
            <div className="space-y-2">
              {todayLog.weather && (
                <div className="flex items-center gap-2">
                  <span className="text-xl">{getWeatherEmoji(todayLog.weather)}</span>
                  <span className="text-sm text-slate-400 capitalize">{todayLog.weather}</span>
                </div>
              )}
              {todayLog.workers_count > 0 && (
                <div className="text-sm text-slate-400">
                  <span className="font-medium text-slate-300">{todayLog.workers_count}</span> workers on site
                </div>
              )}
              {todayLog.work_performed && (
                <div className="text-sm text-slate-300 line-clamp-2">
                  {todayLog.work_performed}
                </div>
              )}
            </div>
          </div>
        )}

        <div className="rounded-xl border border-slate-800 bg-slate-900/30 p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-slate-200">Recent Logs</h2>
            <button
              onClick={() => navigate("/project-dashboard")}
              className="text-xs text-blue-400 hover:text-blue-300 font-medium flex items-center gap-1"
            >
              View All
              <ChevronRight className="w-3 h-3" />
            </button>
          </div>
          {recentLogs.length === 0 ? (
            <div className="text-center py-8 text-sm text-slate-500">
              No daily logs yet
            </div>
          ) : (
            <div className="space-y-2">
              {recentLogs.map((log) => (
                <div
                  key={log.id}
                  className="p-3 rounded-lg bg-slate-950/40 hover:bg-slate-900/60 transition cursor-pointer"
                  onClick={() => setShowLogModal(true)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="text-center">
                        <div className="text-lg font-semibold text-slate-200">
                          {new Date(log.log_date).getDate()}
                        </div>
                        <div className="text-xs text-slate-500">
                          {new Date(log.log_date).toLocaleDateString('en-US', { month: 'short' })}
                        </div>
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          {log.weather && (
                            <span className="text-sm">{getWeatherEmoji(log.weather)}</span>
                          )}
                          {log.workers_count > 0 && (
                            <span className="text-xs text-slate-400">
                              {log.workers_count} workers
                            </span>
                          )}
                        </div>
                        {log.work_performed && (
                          <div className="text-sm text-slate-300 line-clamp-1 mt-1">
                            {log.work_performed}
                          </div>
                        )}
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-600" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {recentPhotos.length > 0 && (
          <div className="rounded-xl border border-slate-800 bg-slate-900/30 p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-slate-200">Recent Photos</h2>
              <button
                onClick={() => navigate("/project-dashboard")}
                className="text-xs text-blue-400 hover:text-blue-300 font-medium flex items-center gap-1"
              >
                View All
                <ChevronRight className="w-3 h-3" />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {recentPhotos.map((photo) => (
                <div key={photo.id} className="aspect-square rounded-lg overflow-hidden bg-slate-950">
                  <img
                    src={photo.publicUrl}
                    alt={photo.caption || "Project photo"}
                    className="w-full h-full object-cover"
                  />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <BaseModal
        isOpen={showLogModal}
        onClose={() => setShowLogModal(false)}
        title="Daily Log"
      >
        <MobileDailyLogForm
          projectId={currentProject.id}
          onSuccess={handleLogSuccess}
          onCancel={() => setShowLogModal(false)}
          prefillDate={todayLog?.log_date}
        />
      </BaseModal>

      <BaseModal
        isOpen={showPhotoModal}
        onClose={() => setShowPhotoModal(false)}
        title="Add Photos"
      >
        <MobilePhotoCapture
          projectId={currentProject.id}
          onSuccess={handlePhotoSuccess}
          onCancel={() => setShowPhotoModal(false)}
        />
      </BaseModal>

      {currentProject && (
        <AIAssistantPanel
          context="daily_log"
          currentData={{
            hasLogToday: !!todayLog,
            consecutiveDaysWithoutLog: recentLogs.length === 0 ? 7 : 0,
            weatherConditions: todayLog?.weather === "rainy" || todayLog?.weather === "stormy" ? "poor" : "good",
            hasDelays: todayLog?.issues ? true : false,
          }}
          projectId={currentProject.id}
          onAction={(action, data) => {
            if (action === "Create Daily Log") {
              setShowLogModal(true);
            } else if (action === "View Today's Log") {
              setShowLogModal(true);
            } else if (action === "Add Photos") {
              setShowPhotoModal(true);
            }
          }}
        />
      )}
    </div>
  );
}
