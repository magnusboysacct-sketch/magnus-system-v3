import React, { useState, useEffect } from "react";
import { Sparkles, X, ChevronRight, CircleAlert as AlertCircle, Lightbulb, TriangleAlert as AlertTriangle, TrendingUp } from "lucide-react";
import { generateSuggestions, type AISuggestion, type AIContext, type AIPromptData } from "../lib/aiAssistant";
import { Button } from "./common/Button";

interface AIAssistantPanelProps {
  context: AIContext;
  currentData?: any;
  projectId?: string;
  onAction?: (action: string, data: any) => void;
}

export default function AIAssistantPanel({
  context,
  currentData,
  projectId,
  onAction,
}: AIAssistantPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<AISuggestion[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadSuggestions();
    }
  }, [isOpen, context, currentData]);

  async function loadSuggestions() {
    setLoading(true);

    const promptData: AIPromptData = {
      context,
      currentData,
      projectId,
    };

    const result = await generateSuggestions(promptData);
    setSuggestions(result);

    setLoading(false);
  }

  function getIcon(type: string) {
    switch (type) {
      case "warning":
        return <AlertTriangle className="w-4 h-4" />;
      case "recommendation":
        return <Lightbulb className="w-4 h-4" />;
      case "insight":
        return <TrendingUp className="w-4 h-4" />;
      default:
        return <AlertCircle className="w-4 h-4" />;
    }
  }

  function getColorClasses(type: string, priority: string) {
    if (type === "warning") {
      return {
        border: "border-yellow-800",
        bg: "bg-yellow-950/30",
        icon: "text-yellow-400",
        iconBg: "bg-yellow-500/20",
      };
    }

    if (priority === "high") {
      return {
        border: "border-blue-800",
        bg: "bg-blue-950/30",
        icon: "text-blue-400",
        iconBg: "bg-blue-500/20",
      };
    }

    return {
      border: "border-slate-800",
      bg: "bg-slate-900/30",
      icon: "text-slate-400",
      iconBg: "bg-slate-500/20",
    };
  }

  const highPrioritySuggestions = suggestions.filter((s) => s.priority === "high");

  if (!isOpen && highPrioritySuggestions.length > 0) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 w-14 h-14 rounded-full bg-gradient-to-br from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 shadow-lg flex items-center justify-center transition-all hover:scale-110 z-50 group"
      >
        <Sparkles className="w-6 h-6 text-white" />
        <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500 text-white text-xs font-bold flex items-center justify-center">
          {highPrioritySuggestions.length}
        </div>
      </button>
    );
  }

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 w-14 h-14 rounded-full bg-gradient-to-br from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 shadow-lg flex items-center justify-center transition-all hover:scale-110 z-50"
      >
        <Sparkles className="w-6 h-6 text-white" />
      </button>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 w-96 max-h-[600px] rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl z-50 flex flex-col">
      <div className="flex items-center justify-between p-4 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <div>
            <div className="text-sm font-semibold text-slate-200">AI Assistant</div>
            <div className="text-xs text-slate-500 capitalize">{context} context</div>
          </div>
        </div>
        <button
          onClick={() => setIsOpen(false)}
          className="w-8 h-8 rounded-lg hover:bg-slate-800 flex items-center justify-center transition"
        >
          <X className="w-4 h-4 text-slate-400" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {loading ? (
          <div className="text-center py-8 text-sm text-slate-500">
            Analyzing context...
          </div>
        ) : suggestions.length === 0 ? (
          <div className="text-center py-8">
            <div className="w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-3">
              <Sparkles className="w-6 h-6 text-green-400" />
            </div>
            <div className="text-sm font-medium text-slate-300">All Set!</div>
            <div className="text-xs text-slate-500 mt-1">
              No suggestions at this time
            </div>
          </div>
        ) : (
          suggestions.map((suggestion) => {
            const colors = getColorClasses(suggestion.type, suggestion.priority);
            return (
              <div
                key={suggestion.id}
                className={`rounded-xl border ${colors.border} ${colors.bg} p-4`}
              >
                <div className="flex items-start gap-3">
                  <div className={`w-8 h-8 rounded-full ${colors.iconBg} flex items-center justify-center flex-shrink-0`}>
                    <div className={colors.icon}>
                      {getIcon(suggestion.type)}
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-slate-200 mb-1">
                      {suggestion.title}
                    </div>
                    <div className="text-xs text-slate-400 mb-3">
                      {suggestion.description}
                    </div>
                    {suggestion.action && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          if (onAction) {
                            onAction(suggestion.action!.label, suggestion.action!.data);
                          }
                        }}
                        className="w-full"
                      >
                        {suggestion.action.label}
                        <ChevronRight className="w-3 h-3 ml-1" />
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="p-3 border-t border-slate-800">
        <div className="text-xs text-slate-500 text-center">
          Suggestions based on current {context} context
        </div>
      </div>
    </div>
  );
}
