import React from "react";
import { Plus, Sparkles, Package, Layers } from "lucide-react";
import type { BOQSuggestion } from "../lib/boqSuggestions";

interface BOQSuggestionCardProps {
  suggestion: BOQSuggestion;
  onAdd: (suggestion: BOQSuggestion) => void;
  onIgnore: (suggestionId: string) => void;
  isAdding?: boolean;
}

export function BOQSuggestionCard({ suggestion, onAdd, onIgnore, isAdding }: BOQSuggestionCardProps) {
  return (
    <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700 hover:border-slate-600 transition-colors">
      <div className="flex items-start gap-3">
        <div
          className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
            suggestion.isAssembly
              ? "bg-purple-500/20 text-purple-400"
              : "bg-blue-500/20 text-blue-400"
          }`}
        >
          {suggestion.isAssembly ? <Layers className="w-5 h-5" /> : <Package className="w-5 h-5" />}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="flex-1 min-w-0">
              <h4 className="text-sm font-medium text-slate-200 truncate">
                {suggestion.description}
              </h4>
              <p className="text-xs text-slate-400 mt-0.5">
                {suggestion.item_code} • {suggestion.unit}
                {suggestion.category && ` • ${suggestion.category}`}
              </p>
            </div>

            <span
              className={`text-xs px-2 py-1 rounded flex-shrink-0 ${
                suggestion.confidence > 0.7
                  ? "bg-green-500/20 text-green-400"
                  : suggestion.confidence > 0.5
                  ? "bg-yellow-500/20 text-yellow-400"
                  : "bg-slate-700 text-slate-400"
              }`}
            >
              {Math.round(suggestion.confidence * 100)}%
            </span>
          </div>

          <div className="flex items-start gap-2 mb-3">
            <Sparkles className="w-3 h-3 text-purple-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-slate-400 flex-1">{suggestion.reason}</p>
          </div>

          {suggestion.relatedTo && suggestion.relatedTo.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-3">
              {suggestion.relatedTo.map((related) => (
                <span
                  key={related}
                  className="text-xs px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/30"
                >
                  Related to: {related}
                </span>
              ))}
            </div>
          )}

          {suggestion.isAssembly && suggestion.assemblyItems && suggestion.assemblyItems.length > 0 && (
            <div className="mb-3 bg-slate-900/50 rounded p-2 border border-slate-700">
              <p className="text-xs text-slate-400 mb-1">
                Assembly includes {suggestion.assemblyItems.length} items:
              </p>
              <div className="space-y-1">
                {suggestion.assemblyItems.slice(0, 3).map((item, idx) => (
                  <p key={idx} className="text-xs text-slate-500">
                    • {item.description} ({item.quantity} {item.unit})
                  </p>
                ))}
                {suggestion.assemblyItems.length > 3 && (
                  <p className="text-xs text-slate-500">
                    + {suggestion.assemblyItems.length - 3} more items
                  </p>
                )}
              </div>
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={() => onAdd(suggestion)}
              disabled={isAdding}
              className="flex-1 px-3 py-2 rounded-lg bg-gradient-to-r from-purple-500 to-blue-500 text-white text-xs font-medium hover:from-purple-600 hover:to-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              {isAdding ? "Adding..." : suggestion.isAssembly ? "Add Assembly" : "Add to BOQ"}
            </button>
            <button
              onClick={() => onIgnore(suggestion.id)}
              disabled={isAdding}
              className="px-3 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Ignore
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
