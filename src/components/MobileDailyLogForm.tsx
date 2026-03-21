import React, { useState, useEffect } from "react";
import { Sparkles } from "lucide-react";
import { createDailyLog, type CreateDailyLogData } from "../lib/dailyLogs";
import { AIDailyLogEnhancer } from "./AIDailyLogEnhancer";
import type { DailyLogEnhancement } from "../lib/aiEnhancer";

interface MobileDailyLogFormProps {
  projectId: string;
  onSuccess?: () => void;
  onCancel?: () => void;
  prefillDate?: string;
}

const weatherOptions = [
  { value: "sunny", label: "☀️ Sunny", icon: "☀️" },
  { value: "cloudy", label: "☁️ Cloudy", icon: "☁️" },
  { value: "rainy", label: "🌧️ Rainy", icon: "🌧️" },
  { value: "windy", label: "💨 Windy", icon: "💨" },
  { value: "snowy", label: "❄️ Snowy", icon: "❄️" },
];

export default function MobileDailyLogForm({
  projectId,
  onSuccess,
  onCancel,
  prefillDate,
}: MobileDailyLogFormProps) {
  const today = new Date().toISOString().split('T')[0];

  const [logDate, setLogDate] = useState(prefillDate || today);
  const [weather, setWeather] = useState("");
  const [workersCount, setWorkersCount] = useState("");
  const [workPerformed, setWorkPerformed] = useState("");
  const [deliveries, setDeliveries] = useState("");
  const [issues, setIssues] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAIEnhancer, setShowAIEnhancer] = useState(false);
  const [quickNotes, setQuickNotes] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const logData: CreateDailyLogData = {
      project_id: projectId,
      log_date: logDate,
      weather: weather || undefined,
      workers_count: workersCount ? parseInt(workersCount) : undefined,
      work_performed: workPerformed || undefined,
      deliveries: deliveries || undefined,
      issues: issues || undefined,
      notes: notes || undefined,
    };

    const result = await createDailyLog(logData);

    if (result.success) {
      setLogDate(today);
      setWeather("");
      setWorkersCount("");
      setWorkPerformed("");
      setDeliveries("");
      setIssues("");
      setNotes("");

      if (onSuccess) {
        onSuccess();
      }
    } else {
      setError("Failed to create daily log. Please try again.");
    }

    setSubmitting(false);
  }

  function handleAIEnhancement(suggestions: DailyLogEnhancement["suggestions"]) {
    if (suggestions.workPerformed) setWorkPerformed(suggestions.workPerformed);
    if (suggestions.deliveries) setDeliveries(suggestions.deliveries);
    if (suggestions.issues) setIssues(suggestions.issues);
    if (suggestions.notes) setNotes(suggestions.notes);
    setQuickNotes("");
  }

  const hasQuickNotes = quickNotes.trim().length > 10;

  return (
    <>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="bg-blue-500/10 rounded-xl p-4 border border-blue-500/30 mb-4">
          <div className="flex items-start gap-3">
            <Sparkles className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-blue-300 mb-2">Quick Notes (AI Enhanced)</p>
              <textarea
                value={quickNotes}
                onChange={(e) => setQuickNotes(e.target.value)}
                placeholder="Type rough notes... AI will organize them into proper sections"
                rows={3}
                className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
              />
              <button
                type="button"
                onClick={() => setShowAIEnhancer(true)}
                disabled={!hasQuickNotes}
                className="mt-2 px-4 py-2 rounded-lg bg-gradient-to-r from-purple-500 to-blue-500 text-white text-sm font-medium hover:from-purple-600 hover:to-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2"
              >
                <Sparkles className="w-4 h-4" />
                Enhance with AI
              </button>
            </div>
          </div>
        </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">
            Date
          </label>
          <input
            type="date"
            value={logDate}
            onChange={(e) => setLogDate(e.target.value)}
            required
            max={today}
            className="w-full px-4 py-3.5 rounded-xl bg-slate-900 border border-slate-700 text-slate-200 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">
            Weather
          </label>
          <div className="grid grid-cols-5 gap-2">
            {weatherOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setWeather(option.value)}
                className={`p-3 rounded-xl border-2 transition-all text-2xl ${
                  weather === option.value
                    ? "border-blue-500 bg-blue-500/20"
                    : "border-slate-700 bg-slate-900 hover:border-slate-600"
                }`}
              >
                {option.icon}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">
            Workers on Site
          </label>
          <input
            type="number"
            value={workersCount}
            onChange={(e) => setWorkersCount(e.target.value)}
            min="0"
            placeholder="Enter number of workers"
            className="w-full px-4 py-3.5 rounded-xl bg-slate-900 border border-slate-700 text-slate-200 text-base placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">
            Work Performed
          </label>
          <textarea
            value={workPerformed}
            onChange={(e) => setWorkPerformed(e.target.value)}
            placeholder="What work was completed today?"
            rows={3}
            className="w-full px-4 py-3.5 rounded-xl bg-slate-900 border border-slate-700 text-slate-200 text-base placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">
            Deliveries
          </label>
          <textarea
            value={deliveries}
            onChange={(e) => setDeliveries(e.target.value)}
            placeholder="Materials delivered today..."
            rows={2}
            className="w-full px-4 py-3.5 rounded-xl bg-slate-900 border border-slate-700 text-slate-200 text-base placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">
            Issues / Concerns
          </label>
          <textarea
            value={issues}
            onChange={(e) => setIssues(e.target.value)}
            placeholder="Any problems or delays..."
            rows={2}
            className="w-full px-4 py-3.5 rounded-xl bg-slate-900 border border-slate-700 text-slate-200 text-base placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">
            Additional Notes
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Any other observations..."
            rows={2}
            className="w-full px-4 py-3.5 rounded-xl bg-slate-900 border border-slate-700 text-slate-200 text-base placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
          />
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/50 text-red-400 text-sm">
          {error}
        </div>
      )}

      <div className="flex gap-3 pt-2">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 px-6 py-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium text-base transition-colors"
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          disabled={submitting || !logDate}
          className="flex-1 px-6 py-4 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:bg-slate-700 disabled:text-slate-500 text-white font-medium text-base transition-colors"
        >
          {submitting ? "Saving..." : "Save Log"}
        </button>
      </div>
    </form>

      <AIDailyLogEnhancer
        isOpen={showAIEnhancer}
        onClose={() => setShowAIEnhancer(false)}
        onAccept={handleAIEnhancement}
        initialNotes={quickNotes}
      />
    </>
  );
}
