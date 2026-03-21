import React, { useState, useEffect } from "react";
import { Sparkles, X, Check, TrendingUp, Tag, Building2, FileText, Loader as Loader2 } from "lucide-react";
import { categorizeReceipt, getExpenseCategories, type ReceiptCategorization } from "../lib/aiEnhancer";

interface AIReceiptCategorizerProps {
  isOpen: boolean;
  onClose: () => void;
  onAccept: (categorization: {
    category: string;
    description: string;
    vendorType?: string;
  }) => void;
  vendor: string;
  amount: number;
  ocrText?: string;
}

export function AIReceiptCategorizer({
  isOpen,
  onClose,
  onAccept,
  vendor,
  amount,
  ocrText,
}: AIReceiptCategorizerProps) {
  const [processing, setProcessing] = useState(false);
  const [categorization, setCategorization] = useState<ReceiptCategorization | null>(null);
  const [availableCategories, setAvailableCategories] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [selectedDescription, setSelectedDescription] = useState<string>("");

  useEffect(() => {
    if (isOpen) {
      loadCategories();
      processReceipt();
    }
  }, [isOpen, vendor, amount, ocrText]);

  async function loadCategories() {
    const categories = await getExpenseCategories();
    setAvailableCategories(categories);
  }

  async function processReceipt() {
    if (!vendor) return;

    setProcessing(true);
    try {
      const result = await categorizeReceipt(vendor, amount, ocrText);
      setCategorization(result);
      setSelectedCategory(result.suggestedCategory || "");
      setSelectedDescription(result.suggestedDescription);
    } catch (error) {
      console.error("Error categorizing receipt:", error);
    } finally {
      setProcessing(false);
    }
  }

  function handleAccept() {
    if (categorization && selectedCategory) {
      onAccept({
        category: selectedCategory,
        description: selectedDescription,
        vendorType: categorization.suggestedVendorType || undefined,
      });
      onClose();
    }
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 rounded-2xl border border-slate-700 shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-slate-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-slate-200">AI Receipt Categorizer</h3>
              <p className="text-sm text-slate-400">Smart expense classification</p>
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
              <p className="text-sm text-slate-400">Analyzing receipt...</p>
            </div>
          ) : categorization ? (
            <>
              <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700 space-y-3">
                <h4 className="text-sm font-medium text-slate-300 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-slate-400" />
                  Receipt Details
                </h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-slate-500 mb-1">Vendor</p>
                    <p className="text-sm text-slate-200 font-medium">{vendor}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 mb-1">Amount</p>
                    <p className="text-sm text-slate-200 font-medium">${amount.toFixed(2)}</p>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <div className="flex-1 h-px bg-gradient-to-r from-transparent via-slate-600 to-transparent" />
                <Sparkles className="w-4 h-4 text-purple-400" />
                <div className="flex-1 h-px bg-gradient-to-r from-transparent via-slate-600 to-transparent" />
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium text-slate-300">AI Suggestions</h4>
                  <span
                    className={`text-xs px-2 py-1 rounded ${
                      categorization.confidence > 0.7
                        ? "bg-green-500/20 text-green-400"
                        : categorization.confidence > 0.5
                        ? "bg-yellow-500/20 text-yellow-400"
                        : "bg-slate-700 text-slate-400"
                    }`}
                  >
                    {Math.round(categorization.confidence * 100)}% confidence
                  </span>
                </div>

                {categorization.suggestedVendorType && (
                  <div className="bg-blue-500/10 rounded-lg p-4 border border-blue-500/30">
                    <div className="flex items-start gap-3">
                      <Building2 className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-blue-300">Vendor Type Detected</p>
                        <p className="text-sm text-slate-300 mt-1">{categorization.suggestedVendorType}</p>
                        <p className="text-xs text-slate-500 mt-2">{categorization.reasoning}</p>
                      </div>
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <label className="text-xs font-medium text-slate-400 uppercase tracking-wide flex items-center gap-2">
                    <Tag className="w-3 h-3" />
                    Suggested Category
                  </label>
                  <select
                    value={selectedCategory}
                    onChange={(e) => setSelectedCategory(e.target.value)}
                    className="w-full bg-slate-800 rounded-lg px-4 py-3 text-sm text-slate-200 border border-slate-600 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                  >
                    <option value="">Select category...</option>
                    {availableCategories.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                        {cat === categorization.suggestedCategory ? " (AI Suggested)" : ""}
                      </option>
                    ))}
                  </select>
                  {selectedCategory === categorization.suggestedCategory && (
                    <p className="text-xs text-green-400 flex items-center gap-1">
                      <Check className="w-3 h-3" />
                      AI recommendation selected
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-medium text-slate-400 uppercase tracking-wide flex items-center gap-2">
                    <TrendingUp className="w-3 h-3" />
                    Description
                  </label>
                  <textarea
                    value={selectedDescription}
                    onChange={(e) => setSelectedDescription(e.target.value)}
                    placeholder="Enter expense description..."
                    className="w-full bg-slate-800 rounded-lg px-4 py-3 text-sm text-slate-200 border border-slate-600 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none resize-none"
                    rows={3}
                  />
                  <p className="text-xs text-slate-500">You can edit the AI-generated description</p>
                </div>

                {ocrText && (
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-slate-400 uppercase tracking-wide">
                      OCR Extracted Text
                    </label>
                    <div className="bg-slate-800/50 rounded-lg p-3 border border-slate-700 max-h-32 overflow-y-auto">
                      <p className="text-xs text-slate-400 whitespace-pre-wrap font-mono">{ocrText}</p>
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center py-12">
              <p className="text-sm text-slate-400">No receipt to categorize</p>
            </div>
          )}
        </div>

        <div className="border-t border-slate-700 p-6 bg-slate-900/50">
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-500">
              Review and edit AI suggestions before applying.
            </p>
            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-lg text-sm font-medium text-slate-300 hover:bg-slate-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAccept}
                disabled={!categorization || !selectedCategory || processing}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-gradient-to-r from-purple-500 to-blue-500 text-white hover:from-purple-600 hover:to-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2"
              >
                <Check className="w-4 h-4" />
                Apply Categorization
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
