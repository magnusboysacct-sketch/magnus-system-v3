import React, { useState } from "react";
import { Sparkles, X, Check, CreditCard as Edit3, Loader as Loader2 } from "lucide-react";
import { enhanceDailyLog, type DailyLogEnhancement } from "../lib/aiEnhancer";

interface AIDailyLogEnhancerProps {
  isOpen: boolean;
  onClose: () => void;
  onAccept: (enhancement: DailyLogEnhancement["suggestions"]) => void;
  initialNotes: string;
}

export function AIDailyLogEnhancer({ isOpen, onClose, onAccept, initialNotes }: AIDailyLogEnhancerProps) {
  const [processing, setProcessing] = useState(false);
  const [enhancement, setEnhancement] = useState<DailyLogEnhancement | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editedSuggestions, setEditedSuggestions] = useState<DailyLogEnhancement["suggestions"]>({});

  React.useEffect(() => {
    if (isOpen && initialNotes && !enhancement) {
      processNotes();
    }
  }, [isOpen, initialNotes]);

  async function processNotes() {
    if (!initialNotes.trim()) return;

    setProcessing(true);
    try {
      const result = await enhanceDailyLog(initialNotes);
      setEnhancement(result);
      setEditedSuggestions(result.suggestions);
    } catch (error) {
      console.error("Error enhancing log:", error);
    } finally {
      setProcessing(false);
    }
  }

  function handleAccept() {
    if (enhancement) {
      onAccept(editMode ? editedSuggestions : enhancement.suggestions);
      onClose();
    }
  }

  function handleEdit(field: keyof DailyLogEnhancement["suggestions"], value: string) {
    setEditedSuggestions((prev) => ({
      ...prev,
      [field]: value,
    }));
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 rounded-2xl border border-slate-700 shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-slate-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-slate-200">AI Daily Log Enhancer</h3>
              <p className="text-sm text-slate-400">Professional summary from your notes</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-slate-800 text-slate-400 hover:text-slate-300 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {processing ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="w-8 h-8 text-blue-400 animate-spin mb-4" />
              <p className="text-sm text-slate-400">Analyzing your notes...</p>
            </div>
          ) : enhancement ? (
            <>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium text-slate-300">Original Notes</h4>
                  <span className="text-xs text-slate-500">{enhancement.originalText.length} characters</span>
                </div>
                <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
                  <p className="text-sm text-slate-300 whitespace-pre-wrap">{enhancement.originalText}</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <div className="flex-1 h-px bg-gradient-to-r from-transparent via-slate-600 to-transparent" />
                <Sparkles className="w-4 h-4 text-purple-400" />
                <div className="flex-1 h-px bg-gradient-to-r from-transparent via-slate-600 to-transparent" />
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium text-slate-300">AI Enhanced Version</h4>
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-xs px-2 py-1 rounded ${
                        enhancement.confidence > 0.7
                          ? "bg-green-500/20 text-green-400"
                          : enhancement.confidence > 0.5
                          ? "bg-yellow-500/20 text-yellow-400"
                          : "bg-slate-700 text-slate-400"
                      }`}
                    >
                      {Math.round(enhancement.confidence * 100)}% confidence
                    </span>
                    <button
                      onClick={() => setEditMode(!editMode)}
                      className={`flex items-center gap-1 text-xs px-2 py-1 rounded transition-colors ${
                        editMode
                          ? "bg-blue-500/20 text-blue-400"
                          : "bg-slate-700 text-slate-400 hover:bg-slate-600"
                      }`}
                    >
                      <Edit3 className="w-3 h-3" />
                      {editMode ? "Editing" : "Edit"}
                    </button>
                  </div>
                </div>

                <div className="space-y-4">
                  {enhancement.suggestions.workPerformed && (
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-slate-400 uppercase tracking-wide">
                        Work Performed
                      </label>
                      {editMode ? (
                        <textarea
                          value={editedSuggestions.workPerformed || ""}
                          onChange={(e) => handleEdit("workPerformed", e.target.value)}
                          className="w-full bg-slate-800 rounded-lg p-3 text-sm text-slate-200 border border-slate-600 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none resize-none"
                          rows={3}
                        />
                      ) : (
                        <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
                          <p className="text-sm text-slate-300">{enhancement.suggestions.workPerformed}</p>
                        </div>
                      )}
                    </div>
                  )}

                  {enhancement.suggestions.deliveries && (
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-slate-400 uppercase tracking-wide">Deliveries</label>
                      {editMode ? (
                        <textarea
                          value={editedSuggestions.deliveries || ""}
                          onChange={(e) => handleEdit("deliveries", e.target.value)}
                          className="w-full bg-slate-800 rounded-lg p-3 text-sm text-slate-200 border border-slate-600 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none resize-none"
                          rows={2}
                        />
                      ) : (
                        <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
                          <p className="text-sm text-slate-300">{enhancement.suggestions.deliveries}</p>
                        </div>
                      )}
                    </div>
                  )}

                  {enhancement.suggestions.issues && (
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-slate-400 uppercase tracking-wide">
                        Issues & Delays
                      </label>
                      {editMode ? (
                        <textarea
                          value={editedSuggestions.issues || ""}
                          onChange={(e) => handleEdit("issues", e.target.value)}
                          className="w-full bg-slate-800 rounded-lg p-3 text-sm text-slate-200 border border-slate-600 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none resize-none"
                          rows={2}
                        />
                      ) : (
                        <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
                          <p className="text-sm text-slate-300">{enhancement.suggestions.issues}</p>
                        </div>
                      )}
                    </div>
                  )}

                  {enhancement.suggestions.notes && (
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-slate-400 uppercase tracking-wide">
                        Additional Notes
                      </label>
                      {editMode ? (
                        <textarea
                          value={editedSuggestions.notes || ""}
                          onChange={(e) => handleEdit("notes", e.target.value)}
                          className="w-full bg-slate-800 rounded-lg p-3 text-sm text-slate-200 border border-slate-600 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none resize-none"
                          rows={2}
                        />
                      ) : (
                        <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
                          <p className="text-sm text-slate-300">{enhancement.suggestions.notes}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center py-12">
              <p className="text-sm text-slate-400">No notes to enhance</p>
            </div>
          )}
        </div>

        <div className="border-t border-slate-700 p-6 bg-slate-900/50">
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-500">
              AI will organize your notes. You can edit before accepting.
            </p>
            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-lg text-sm font-medium text-slate-300 hover:bg-slate-800 transition-colors"
              >
                Ignore
              </button>
              <button
                onClick={handleAccept}
                disabled={!enhancement || processing}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-gradient-to-r from-purple-500 to-blue-500 text-white hover:from-purple-600 hover:to-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2"
              >
                <Check className="w-4 h-4" />
                Accept & Apply
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
