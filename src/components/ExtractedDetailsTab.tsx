import React, { useState, useEffect } from "react";
import { Check, X, CreditCard as Edit2, FileText, Ruler, StickyNote, Box, CircleAlert as AlertCircle } from "lucide-react";
import { supabase } from "../lib/supabase";

type ExtractionItem = {
  id: string;
  drawing_page_id: string;
  item_type: "dimension" | "note" | "element" | "title_block" | "revision" | "material" | "other";
  category: string | null;
  raw_text: string | null;
  normalized_value: string | null;
  numeric_value: number | null;
  unit: string | null;
  confidence_score: number | null;
  status: "new" | "reviewed" | "approved" | "rejected";
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
  page_number?: number;
  created_at: string;
};

type ExtractedDetailsTabProps = {
  projectId: string;
  companyId: string;
  currentSessionId: string | null;
};

export function ExtractedDetailsTab({ projectId, companyId, currentSessionId }: ExtractedDetailsTabProps) {
  const [items, setItems] = useState<ExtractionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "new" | "reviewed" | "approved" | "rejected">("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  useEffect(() => {
    loadItems();
  }, [projectId, currentSessionId]);

  async function loadItems() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("drawing_extraction_items")
        .select(`
          *,
          drawing_pages!inner(page_number, takeoff_session_id)
        `)
        .eq("project_id", projectId)
        .order("created_at", { ascending: false });

      if (error) throw error;

      const mapped = (data || []).map((item: any) => ({
        ...item,
        page_number: item.drawing_pages?.page_number,
      }));

      setItems(mapped);
    } catch (err) {
      console.error("Error loading extraction items:", err);
    } finally {
      setLoading(false);
    }
  }

  async function updateItemStatus(itemId: string, status: "reviewed" | "approved" | "rejected") {
    try {
      const { error } = await supabase
        .from("drawing_extraction_items")
        .update({
          status,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", itemId);

      if (error) throw error;

      setItems((prev) =>
        prev.map((item) =>
          item.id === itemId
            ? { ...item, status, reviewed_at: new Date().toISOString() }
            : item
        )
      );
    } catch (err) {
      console.error("Error updating item status:", err);
    }
  }

  async function saveEditedValue(itemId: string) {
    try {
      const { error } = await supabase
        .from("drawing_extraction_items")
        .update({ normalized_value: editValue })
        .eq("id", itemId);

      if (error) throw error;

      setItems((prev) =>
        prev.map((item) =>
          item.id === itemId ? { ...item, normalized_value: editValue } : item
        )
      );
      setEditingId(null);
      setEditValue("");
    } catch (err) {
      console.error("Error updating value:", err);
    }
  }

  const filteredItems = items.filter((item) => {
    if (filter !== "all" && item.status !== filter) return false;
    if (typeFilter !== "all" && item.item_type !== typeFilter) return false;
    return true;
  });

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "dimension":
        return <Ruler className="h-4 w-4" />;
      case "note":
        return <StickyNote className="h-4 w-4" />;
      case "element":
        return <Box className="h-4 w-4" />;
      case "title_block":
      case "revision":
      case "material":
        return <FileText className="h-4 w-4" />;
      default:
        return <AlertCircle className="h-4 w-4" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const styles = {
      new: "bg-blue-100 text-blue-700",
      reviewed: "bg-yellow-100 text-yellow-700",
      approved: "bg-green-100 text-green-700",
      rejected: "bg-red-100 text-red-700",
    };
    return (
      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${styles[status as keyof typeof styles] || styles.new}`}>
        {status}
      </span>
    );
  };

  const getConfidenceBadge = (score: number | null) => {
    if (score === null) return null;
    const percent = Math.round(score * 100);
    const color = score >= 0.8 ? "text-green-600" : score >= 0.5 ? "text-yellow-600" : "text-red-600";
    return <span className={`text-xs font-medium ${color}`}>{percent}%</span>;
  };

  const stats = {
    total: items.length,
    new: items.filter((i) => i.status === "new").length,
    reviewed: items.filter((i) => i.status === "reviewed").length,
    approved: items.filter((i) => i.status === "approved").length,
    rejected: items.filter((i) => i.status === "rejected").length,
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-slate-500">Loading extracted details...</div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header Stats */}
      <div className="border-b border-slate-200 bg-white p-4">
        <div className="mb-3 text-lg font-semibold text-slate-900">Extracted Details</div>
        <div className="flex gap-3">
          <div className="rounded-lg bg-slate-50 px-3 py-2">
            <div className="text-xs text-slate-500">Total</div>
            <div className="text-lg font-bold text-slate-900">{stats.total}</div>
          </div>
          <div className="rounded-lg bg-blue-50 px-3 py-2">
            <div className="text-xs text-blue-600">New</div>
            <div className="text-lg font-bold text-blue-700">{stats.new}</div>
          </div>
          <div className="rounded-lg bg-yellow-50 px-3 py-2">
            <div className="text-xs text-yellow-600">Reviewed</div>
            <div className="text-lg font-bold text-yellow-700">{stats.reviewed}</div>
          </div>
          <div className="rounded-lg bg-green-50 px-3 py-2">
            <div className="text-xs text-green-600">Approved</div>
            <div className="text-lg font-bold text-green-700">{stats.approved}</div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="border-b border-slate-200 bg-slate-50 p-3">
        <div className="flex flex-wrap gap-2">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as any)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm outline-none focus:border-blue-400"
          >
            <option value="all">All Status</option>
            <option value="new">New</option>
            <option value="reviewed">Reviewed</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>

          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm outline-none focus:border-blue-400"
          >
            <option value="all">All Types</option>
            <option value="dimension">Dimensions</option>
            <option value="note">Notes</option>
            <option value="element">Elements</option>
            <option value="title_block">Title Blocks</option>
            <option value="revision">Revisions</option>
            <option value="material">Materials</option>
            <option value="other">Other</option>
          </select>
        </div>
      </div>

      {/* Items List */}
      <div className="flex-1 overflow-auto bg-slate-50">
        {filteredItems.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-slate-500">
            <FileText className="mb-2 h-12 w-12 text-slate-300" />
            <div className="text-sm">No extracted details yet</div>
            <div className="mt-1 text-xs text-slate-400">
              Items will appear here when drawings are processed
            </div>
          </div>
        ) : (
          <div className="p-3 space-y-2">
            {filteredItems.map((item) => (
              <div
                key={item.id}
                className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className="mt-0.5 flex-shrink-0 rounded-lg bg-slate-100 p-2 text-slate-600">
                      {getTypeIcon(item.item_type)}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="mb-1 flex items-center gap-2">
                        <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
                          {item.item_type.replace("_", " ")}
                        </span>
                        {item.page_number && (
                          <span className="text-xs text-slate-400">Page {item.page_number}</span>
                        )}
                        {getStatusBadge(item.status)}
                      </div>

                      {item.raw_text && (
                        <div className="mb-2 text-sm text-slate-600">
                          <span className="font-medium">Raw: </span>
                          {item.raw_text}
                        </div>
                      )}

                      {editingId === item.id ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            className="flex-1 rounded-lg border border-slate-200 px-2 py-1 text-sm outline-none focus:border-blue-400"
                            autoFocus
                          />
                          <button
                            onClick={() => saveEditedValue(item.id)}
                            className="rounded-lg bg-blue-600 p-1.5 text-white hover:bg-blue-700"
                          >
                            <Check className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => {
                              setEditingId(null);
                              setEditValue("");
                            }}
                            className="rounded-lg bg-slate-200 p-1.5 text-slate-700 hover:bg-slate-300"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <div className="flex-1 text-sm font-medium text-slate-900">
                            {item.normalized_value || <span className="italic text-slate-400">No value</span>}
                            {item.unit && <span className="ml-1 text-slate-500">{item.unit}</span>}
                          </div>
                          <button
                            onClick={() => {
                              setEditingId(item.id);
                              setEditValue(item.normalized_value || "");
                            }}
                            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                            title="Edit value"
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}

                      {item.confidence_score !== null && (
                        <div className="mt-1 flex items-center gap-2 text-xs">
                          <span className="text-slate-500">Confidence:</span>
                          {getConfidenceBadge(item.confidence_score)}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex flex-shrink-0 gap-1">
                    {item.status !== "approved" && (
                      <button
                        onClick={() => updateItemStatus(item.id, "approved")}
                        className="rounded-lg p-1.5 text-green-600 hover:bg-green-50"
                        title="Approve"
                      >
                        <Check className="h-4 w-4" />
                      </button>
                    )}
                    {item.status !== "rejected" && (
                      <button
                        onClick={() => updateItemStatus(item.id, "rejected")}
                        className="rounded-lg p-1.5 text-red-600 hover:bg-red-50"
                        title="Reject"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
