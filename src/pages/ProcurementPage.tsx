import React, { useEffect, useState } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import {
  fetchProcurementHeaders,
  fetchProcurementDocument,
  updateProcurementItemStatus,
  updateProcurementHeader,
  deleteProcurementHeader,
  deleteProcurementItem,
} from "../lib/procurement";
import type {
  ProcurementHeaderWithItems,
  ProcurementItemWithSource,
  ProcurementItem,
} from "../lib/procurement";
import {
  getItemStatusLabel,
  getHeaderStatusLabel,
  getPriorityLabel,
  calculateBalanceQty,
  calculateItemTotal,
  normalizeItemStatus,
  PROCUREMENT_ITEM_STATUSES,
  PROCUREMENT_HEADER_STATUSES,
  PROCUREMENT_PRIORITIES,
  type ProcurementItemStatus,
  type ProcurementHeaderStatus,
  type ProcurementPriority,
} from "../lib/procurementWorkflow";
import { createProjectCost } from "../lib/costs";
import { supabase } from "../lib/supabase";
import { printProcurementDocument } from "../lib/procurementPrint";

export default function ProcurementPage() {
  const { projectId } = useParams<{ projectId?: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const nav = useNavigate();

  const viewMode = searchParams.get("view") || "list";
  const documentId = searchParams.get("doc") || null;

  const [headers, setHeaders] = useState<ProcurementHeaderWithItems[]>([]);
  const [currentDocument, setCurrentDocument] =
    useState<ProcurementHeaderWithItems | null>(null);
  const [loading, setLoading] = useState(true);
  const [projectName, setProjectName] = useState<string>("");
  const [companyName, setCompanyName] = useState<string>("");

  useEffect(() => {
    if (projectId) {
      loadProjectInfo();
      if (viewMode === "list") {
        loadProcurementHeaders();
      } else if (viewMode === "document" && documentId) {
        loadProcurementDocument(documentId);
      }
    }
  }, [projectId, viewMode, documentId]);

  async function loadProjectInfo() {
    if (!projectId) return;

    const { data: project } = await supabase
      .from("projects")
      .select("name, company_id")
      .eq("id", projectId)
      .single();

    if (project) {
      setProjectName(project.name || "");

      if (project.company_id) {
        const { data: company } = await supabase
          .from("companies")
          .select("name")
          .eq("id", project.company_id)
          .single();

        if (company) {
          setCompanyName(company.name || "");
        }
      }
    }
  }

  async function loadProcurementHeaders() {
    if (!projectId) return;

    setLoading(true);
    try {
      const result = await fetchProcurementHeaders(projectId);
      if (result.success) {
        setHeaders(result.data);
      }
    } catch (e) {
      console.error("Failed to load procurement headers:", e);
    } finally {
      setLoading(false);
    }
  }

  async function loadProcurementDocument(docId: string) {
    setLoading(true);
    try {
      const result = await fetchProcurementDocument(docId);
      if (result.success && result.data) {
        setCurrentDocument(result.data);
      }
    } catch (e) {
      console.error("Failed to load procurement document:", e);
    } finally {
      setLoading(false);
    }
  }

  function openDocument(docId: string) {
    setSearchParams({ view: "document", doc: docId });
  }

  function backToList() {
    setSearchParams({ view: "list" });
    setCurrentDocument(null);
    loadProcurementHeaders();
  }

  async function handleDeleteDocument(docId: string) {
    if (!window.confirm("Delete this procurement document? All items will be removed.")) return;

    const result = await deleteProcurementHeader(docId);
    if (result.success) {
      setHeaders((prev) => prev.filter((h) => h.id !== docId));
    } else {
      alert("Failed to delete document");
    }
  }

  async function handleUpdateItem(itemId: string, updates: Partial<ProcurementItem>) {
    if (!currentDocument) return;

    const item = currentDocument.items.find((i) => i.id === itemId);
    if (!item) return;

    // Auto-normalize status based on quantities
    let finalUpdates = { ...updates };
    if (updates.delivered_qty !== undefined || updates.ordered_qty !== undefined) {
      const newDeliveredQty = updates.delivered_qty ?? item.delivered_qty ?? 0;
      const newOrderedQty = updates.ordered_qty ?? item.ordered_qty ?? 0;
      const currentStatus = (updates.status ?? item.status) as ProcurementItemStatus;

      finalUpdates.status = normalizeItemStatus(
        currentStatus,
        item.quantity,
        newDeliveredQty,
        newOrderedQty
      );
    }

    // If status is changing to received and it wasn't received before, create cost record
    if (finalUpdates.status === "received" && item.status !== "received") {
      const unitRate = finalUpdates.unit_rate ?? item.unit_rate ?? 0;
      const deliveredQty = finalUpdates.delivered_qty ?? item.delivered_qty ?? 0;

      if (unitRate > 0 && deliveredQty > 0) {
        const totalAmount = deliveredQty * unitRate;
        const description = `${item.material_name} - ${deliveredQty} ${item.unit || "units"}`;

        await createProjectCost(
          item.project_id,
          "material",
          description,
          totalAmount,
          item.id,
          `Unit cost: ${unitRate} per ${item.unit || "unit"}`
        );
      }
    }

    const { data, error } = await supabase
      .from("procurement_items")
      .update({ ...finalUpdates, updated_at: new Date().toISOString() })
      .eq("id", itemId)
      .select()
      .single();

    if (error) {
      console.error("Error updating item:", error);
      alert("Failed to update item");
      return;
    }

    setCurrentDocument((prev) =>
      prev
        ? {
            ...prev,
            items: prev.items.map((i) =>
              i.id === itemId ? { ...i, ...data } : i
            ),
          }
        : null
    );
  }

  async function handleDeleteItem(itemId: string) {
    if (!window.confirm("Delete this item?")) return;

    const result = await deleteProcurementItem(itemId);
    if (result.success && currentDocument) {
      setCurrentDocument({
        ...currentDocument,
        items: currentDocument.items.filter((i) => i.id !== itemId),
        itemCount: currentDocument.itemCount - 1,
      });
    } else {
      alert("Failed to delete item");
    }
  }

  async function handleUpdateHeader(
    updates: Partial<Pick<ProcurementHeaderWithItems, "title" | "status" | "notes">>
  ) {
    if (!currentDocument) return;

    const result = await updateProcurementHeader(currentDocument.id, updates);
    if (result.success) {
      setCurrentDocument({ ...currentDocument, ...updates });
    }
  }

  function handlePrint() {
    if (!currentDocument) return;

    printProcurementDocument({
      document: currentDocument,
      projectName,
      companyName,
    });
  }

  if (!projectId) {
    return (
      <div className="p-6">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/30 p-8 text-center">
          <p className="text-slate-400">
            Please select a project to view procurement
          </p>
          <button
            onClick={() => nav("/projects")}
            className="mt-4 px-4 py-2 rounded-xl bg-slate-800/60 hover:bg-slate-800 text-sm"
          >
            Go to Projects
          </button>
        </div>
      </div>
    );
  }

  if (viewMode === "document" && currentDocument) {
    return (
      <DocumentView
        document={currentDocument}
        projectName={projectName}
        companyName={companyName}
        onBack={backToList}
        onUpdateItem={handleUpdateItem}
        onDeleteItem={handleDeleteItem}
        onUpdateHeader={handleUpdateHeader}
        onPrint={() => handlePrint()}
        projectId={projectId}
      />
    );
  }

  return (
    <ListView
      headers={headers}
      loading={loading}
      projectId={projectId}
      onOpenDocument={openDocument}
      onDeleteDocument={handleDeleteDocument}
      onNavigate={nav}
    />
  );
}

interface ListViewProps {
  headers: ProcurementHeaderWithItems[];
  loading: boolean;
  projectId: string;
  onOpenDocument: (docId: string) => void;
  onDeleteDocument: (docId: string) => void;
  onNavigate: (path: string) => void;
}

function ListView({
  headers,
  loading,
  projectId,
  onOpenDocument,
  onDeleteDocument,
  onNavigate,
}: ListViewProps) {
  const totalDocs = headers.length;
  const draftCount = headers.filter((h) => h.status === "draft").length;
  const approvedCount = headers.filter((h) => h.status === "approved").length;

  return (
    <div className="p-6">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-semibold">Procurement Documents</h1>
          <p className="text-slate-400 mt-1">
            Saved procurement lists and materials orders
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => onNavigate(`/projects/${projectId}/boq`)}
            className="px-3 py-2 rounded-xl bg-slate-800/60 hover:bg-slate-800 text-sm"
          >
            Go to BOQ
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="rounded-xl border border-slate-800 bg-slate-900/30 p-4">
          <div className="text-xs text-slate-400">Total Documents</div>
          <div className="text-2xl font-semibold mt-1">{totalDocs}</div>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/30 p-4">
          <div className="text-xs text-slate-400">Draft</div>
          <div className="text-2xl font-semibold mt-1 text-slate-300">
            {draftCount}
          </div>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/30 p-4">
          <div className="text-xs text-slate-400">Approved</div>
          <div className="text-2xl font-semibold mt-1 text-emerald-400">
            {approvedCount}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/30 p-8 text-center">
          <p className="text-slate-400">Loading procurement documents...</p>
        </div>
      ) : headers.length === 0 ? (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/30 p-8 text-center">
          <p className="text-slate-400 mb-2">No procurement documents found</p>
          <p className="text-xs text-slate-500">
            Generate a procurement list from the BOQ page
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {headers.map((header) => (
            <div
              key={header.id}
              className="rounded-xl border border-slate-800 bg-slate-900/30 p-4 hover:bg-slate-900/50 transition-colors"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => onOpenDocument(header.id)}
                      className="font-medium text-lg hover:text-blue-400 transition-colors text-left"
                    >
                      {header.title}
                    </button>
                    <span
                      className={
                        "px-2 py-0.5 rounded text-xs " +
                        (header.status === "draft"
                          ? "bg-slate-700/50 text-slate-300"
                          : header.status === "approved"
                          ? "bg-emerald-900/30 border border-emerald-900/50 text-emerald-300"
                          : header.status === "sent"
                          ? "bg-blue-900/30 border border-blue-900/50 text-blue-300"
                          : header.status === "completed"
                          ? "bg-green-900/30 border border-green-900/50 text-green-300"
                          : header.status === "cancelled"
                          ? "bg-red-900/30 border border-red-900/50 text-red-300"
                          : "bg-slate-700/50 text-slate-300")
                      }
                    >
                      {getHeaderStatusLabel(header.status as ProcurementHeaderStatus)}
                    </span>
                  </div>

                  {header.notes && (
                    <p className="text-sm text-slate-400 mt-1">{header.notes}</p>
                  )}

                  <div className="flex items-center gap-4 mt-2 text-xs text-slate-500">
                    <span>{header.itemCount} items</span>
                    <span>•</span>
                    <span>
                      Updated {new Date(header.updated_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => onOpenDocument(header.id)}
                    className="px-3 py-1.5 rounded-lg bg-slate-800/60 hover:bg-slate-800 text-xs"
                  >
                    View
                  </button>
                  <button
                    onClick={() => onDeleteDocument(header.id)}
                    className="px-3 py-1.5 rounded-lg bg-red-900/20 hover:bg-red-900/40 border border-red-900/40 text-red-300 text-xs"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface DocumentViewProps {
  document: ProcurementHeaderWithItems;
  projectName: string;
  companyName: string;
  onBack: () => void;
  onUpdateItem: (itemId: string, updates: Partial<ProcurementItem>) => void;
  onDeleteItem: (itemId: string) => void;
  onUpdateHeader: (updates: any) => void;
  onPrint: () => void;
  projectId: string;
}

function DocumentView({
  document,
  projectName,
  companyName,
  onBack,
  onUpdateItem,
  onDeleteItem,
  onUpdateHeader,
  onPrint,
  projectId,
}: DocumentViewProps) {
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState(document.title);
  const [searchText, setSearchText] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterPriority, setFilterPriority] = useState<string>("all");
  const [filterSupplier, setFilterSupplier] = useState<string>("all");

  // Get unique suppliers
  const suppliers = Array.from(
    new Set(document.items.map((i) => i.supplier).filter(Boolean))
  ).sort();

  // Apply filters
  let filteredItems = document.items;

  if (searchText.trim()) {
    const search = searchText.toLowerCase();
    filteredItems = filteredItems.filter(
      (item) =>
        item.material_name.toLowerCase().includes(search) ||
        item.description?.toLowerCase().includes(search) ||
        item.category?.toLowerCase().includes(search)
    );
  }

  if (filterStatus !== "all") {
    filteredItems = filteredItems.filter((item) => item.status === filterStatus);
  }

  if (filterPriority !== "all") {
    filteredItems = filteredItems.filter(
      (item) => (item.priority || "normal") === filterPriority
    );
  }

  if (filterSupplier !== "all") {
    filteredItems = filteredItems.filter((item) => item.supplier === filterSupplier);
  }

  const groupedItems = filteredItems.reduce((acc, item) => {
    const category = item.category || "Uncategorized";
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(item);
    return acc;
  }, {} as Record<string, ProcurementItemWithSource[]>);

  // Summary calculations
  const totalItems = document.items.length;
  const pendingCount = document.items.filter((i) => i.status === "pending").length;
  const orderedCount = document.items.filter((i) => i.status === "ordered").length;
  const partDeliveredCount = document.items.filter(
    (i) => i.status === "part_delivered"
  ).length;
  const receivedCount = document.items.filter((i) => i.status === "received").length;
  const urgentCount = document.items.filter((i) => i.priority === "urgent").length;
  const totalValue = document.items.reduce((sum, item) => {
    const orderedQty = item.ordered_qty || 0;
    const unitRate = item.unit_rate || 0;
    return sum + calculateItemTotal(orderedQty, unitRate);
  }, 0);

  function handleTitleSave() {
    if (titleValue.trim() && titleValue !== document.title) {
      onUpdateHeader({ title: titleValue.trim() });
    }
    setEditingTitle(false);
  }

  function handleStatusUpdate(newStatus: ProcurementHeaderStatus) {
    onUpdateHeader({ status: newStatus });
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="flex items-center gap-3">
            <button
              onClick={onBack}
              className="px-3 py-2 rounded-xl bg-slate-800/60 hover:bg-slate-800 text-sm"
            >
              ← Back to List
            </button>
            {editingTitle ? (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={titleValue}
                  onChange={(e) => setTitleValue(e.target.value)}
                  onBlur={handleTitleSave}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleTitleSave();
                    if (e.key === "Escape") {
                      setTitleValue(document.title);
                      setEditingTitle(false);
                    }
                  }}
                  autoFocus
                  className="px-3 py-1.5 rounded-lg bg-slate-900/50 border border-slate-700 text-lg font-semibold focus:outline-none focus:border-slate-600"
                />
              </div>
            ) : (
              <h1
                className="text-2xl font-semibold cursor-pointer hover:text-slate-300"
                onClick={() => setEditingTitle(true)}
              >
                {document.title}
              </h1>
            )}
          </div>

          <div className="flex items-center gap-2">
            <select
              value={document.status}
              onChange={(e) =>
                handleStatusUpdate(e.target.value as ProcurementHeaderStatus)
              }
              className="px-3 py-2 rounded-xl bg-slate-800/60 border border-slate-700 text-sm"
            >
              {PROCUREMENT_HEADER_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {getHeaderStatusLabel(status)}
                </option>
              ))}
            </select>
            <button
              onClick={onPrint}
              className="px-3 py-2 rounded-xl bg-blue-900/30 hover:bg-blue-900/50 border border-blue-900/50 text-blue-300 text-sm"
            >
              Print
            </button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-3 mb-6">
          <div className="rounded-xl border border-slate-800 bg-slate-900/30 p-3">
            <div className="text-xs text-slate-400">Total Items</div>
            <div className="text-xl font-semibold mt-1">{totalItems}</div>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900/30 p-3">
            <div className="text-xs text-slate-400">Pending</div>
            <div className="text-xl font-semibold mt-1 text-yellow-400">
              {pendingCount}
            </div>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900/30 p-3">
            <div className="text-xs text-slate-400">Ordered</div>
            <div className="text-xl font-semibold mt-1 text-blue-400">
              {orderedCount}
            </div>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900/30 p-3">
            <div className="text-xs text-slate-400">Part Del.</div>
            <div className="text-xl font-semibold mt-1 text-orange-400">
              {partDeliveredCount}
            </div>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900/30 p-3">
            <div className="text-xs text-slate-400">Received</div>
            <div className="text-xl font-semibold mt-1 text-emerald-400">
              {receivedCount}
            </div>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900/30 p-3">
            <div className="text-xs text-slate-400">Urgent</div>
            <div className="text-xl font-semibold mt-1 text-red-400">
              {urgentCount}
            </div>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900/30 p-3">
            <div className="text-xs text-slate-400">Total Value</div>
            <div className="text-xl font-semibold mt-1">
              ${totalValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </div>
          </div>
        </div>

        <div className="mb-4 space-y-3">
          <div className="flex items-center gap-3">
            <input
              type="text"
              placeholder="Search materials..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className="flex-1 px-3 py-2 rounded-lg bg-slate-900/50 border border-slate-700 text-sm focus:outline-none focus:border-slate-600"
            />
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <div className="text-sm text-slate-400">Filters:</div>

            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="px-3 py-1.5 rounded-lg bg-slate-800/60 border border-slate-700 text-xs"
            >
              <option value="all">All Status</option>
              {PROCUREMENT_ITEM_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {getItemStatusLabel(status)}
                </option>
              ))}
            </select>

            <select
              value={filterPriority}
              onChange={(e) => setFilterPriority(e.target.value)}
              className="px-3 py-1.5 rounded-lg bg-slate-800/60 border border-slate-700 text-xs"
            >
              <option value="all">All Priority</option>
              {PROCUREMENT_PRIORITIES.map((priority) => (
                <option key={priority} value={priority}>
                  {getPriorityLabel(priority)}
                </option>
              ))}
            </select>

            {suppliers.length > 0 && (
              <select
                value={filterSupplier}
                onChange={(e) => setFilterSupplier(e.target.value)}
                className="px-3 py-1.5 rounded-lg bg-slate-800/60 border border-slate-700 text-xs"
              >
                <option value="all">All Suppliers</option>
                {suppliers.map((supplier) => (
                  <option key={supplier!} value={supplier!}>
                    {supplier}
                  </option>
                ))}
              </select>
            )}

            {(searchText || filterStatus !== "all" || filterPriority !== "all" || filterSupplier !== "all") && (
              <button
                onClick={() => {
                  setSearchText("");
                  setFilterStatus("all");
                  setFilterPriority("all");
                  setFilterSupplier("all");
                }}
                className="px-3 py-1.5 rounded-lg bg-slate-800/30 hover:bg-slate-800/50 text-xs text-slate-400"
              >
                Clear Filters
              </button>
            )}
          </div>
        </div>
      </div>

      {filteredItems.length === 0 ? (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/30 p-8 text-center">
          <p className="text-slate-400">No items match the current filters</p>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(groupedItems).map(([category, categoryItems]) => (
            <div key={category}>
              <div className="rounded-2xl border border-slate-800 bg-slate-900/30 overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-800 bg-slate-900/50">
                  <h3 className="font-semibold text-sm">{category}</h3>
                  <div className="text-xs text-slate-400 mt-0.5">
                    {categoryItems.length} items
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-slate-800 text-left text-xs text-slate-400">
                        <th className="px-4 py-3 font-medium">Material</th>
                        <th className="px-4 py-3 font-medium">Supplier</th>
                        <th className="px-4 py-3 font-medium">Priority</th>
                        <th className="px-4 py-3 font-medium">Needed By</th>
                        <th className="px-4 py-3 font-medium">Qty</th>
                        <th className="px-4 py-3 font-medium">Ordered</th>
                        <th className="px-4 py-3 font-medium">Delivered</th>
                        <th className="px-4 py-3 font-medium">Balance</th>
                        <th className="px-4 py-3 font-medium">Rate</th>
                        <th className="px-4 py-3 font-medium">Total</th>
                        <th className="px-4 py-3 font-medium">Status</th>
                        <th className="px-4 py-3 font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {categoryItems.map((item) => (
                        <ItemRow
                          key={item.id}
                          item={item}
                          onUpdate={onUpdateItem}
                          onDelete={onDeleteItem}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface ItemRowProps {
  item: ProcurementItemWithSource;
  onUpdate: (itemId: string, updates: Partial<ProcurementItem>) => void;
  onDelete: (itemId: string) => void;
}

function ItemRow({ item, onUpdate, onDelete }: ItemRowProps) {
  const [editing, setEditing] = useState<string | null>(null);
  const [tempValue, setTempValue] = useState<string>("");

  const balanceQty = calculateBalanceQty(item.quantity, item.delivered_qty || 0);
  const totalCost = calculateItemTotal(item.ordered_qty || 0, item.unit_rate || 0);

  function startEdit(field: string, currentValue: any) {
    setEditing(field);
    setTempValue(String(currentValue || ""));
  }

  function saveEdit(field: string) {
    if (!editing) return;

    let value: any = tempValue.trim();

    if (field === "ordered_qty" || field === "delivered_qty" || field === "unit_rate") {
      const num = parseFloat(value);
      if (isNaN(num) || num < 0) {
        setEditing(null);
        return;
      }
      value = num;
    }

    onUpdate(item.id, { [field]: value });
    setEditing(null);
  }

  function cancelEdit() {
    setEditing(null);
    setTempValue("");
  }

  return (
    <tr className="border-b border-slate-800/50 hover:bg-slate-900/50">
      <td className="px-4 py-3">
        <div className="font-medium text-sm">{item.material_name}</div>
        {item.description && (
          <div className="text-xs text-slate-500 mt-0.5">{item.description}</div>
        )}
      </td>

      <td className="px-4 py-3">
        {editing === "supplier" ? (
          <input
            type="text"
            value={tempValue}
            onChange={(e) => setTempValue(e.target.value)}
            onBlur={() => saveEdit("supplier")}
            onKeyDown={(e) => {
              if (e.key === "Enter") saveEdit("supplier");
              if (e.key === "Escape") cancelEdit();
            }}
            autoFocus
            className="w-full px-2 py-1 rounded bg-slate-800 border border-slate-700 text-xs focus:outline-none focus:border-slate-600"
          />
        ) : (
          <div
            onClick={() => startEdit("supplier", item.supplier)}
            className="text-xs cursor-pointer hover:text-slate-300"
          >
            {item.supplier || <span className="text-slate-600">-</span>}
          </div>
        )}
      </td>

      <td className="px-4 py-3">
        <select
          value={item.priority || "normal"}
          onChange={(e) =>
            onUpdate(item.id, { priority: e.target.value as ProcurementPriority })
          }
          className={
            "px-2 py-1 rounded text-xs border " +
            (item.priority === "urgent"
              ? "bg-red-900/20 border-red-900/40 text-red-300"
              : item.priority === "high"
              ? "bg-orange-900/20 border-orange-900/40 text-orange-300"
              : item.priority === "low"
              ? "bg-slate-700/20 border-slate-700/40 text-slate-400"
              : "bg-slate-800/20 border-slate-700/40 text-slate-300")
          }
        >
          {PROCUREMENT_PRIORITIES.map((priority) => (
            <option key={priority} value={priority}>
              {getPriorityLabel(priority)}
            </option>
          ))}
        </select>
      </td>

      <td className="px-4 py-3">
        {editing === "needed_by_date" ? (
          <input
            type="date"
            value={tempValue}
            onChange={(e) => setTempValue(e.target.value)}
            onBlur={() => saveEdit("needed_by_date")}
            onKeyDown={(e) => {
              if (e.key === "Enter") saveEdit("needed_by_date");
              if (e.key === "Escape") cancelEdit();
            }}
            autoFocus
            className="px-2 py-1 rounded bg-slate-800 border border-slate-700 text-xs focus:outline-none focus:border-slate-600"
          />
        ) : (
          <div
            onClick={() =>
              startEdit(
                "needed_by_date",
                item.needed_by_date
                  ? new Date(item.needed_by_date).toISOString().split("T")[0]
                  : ""
              )
            }
            className="text-xs cursor-pointer hover:text-slate-300"
          >
            {item.needed_by_date ? (
              new Date(item.needed_by_date).toLocaleDateString()
            ) : (
              <span className="text-slate-600">-</span>
            )}
          </div>
        )}
      </td>

      <td className="px-4 py-3">
        <div className="text-sm font-medium">
          {Number(item.quantity).toFixed(2)}
        </div>
        <div className="text-xs text-slate-500">{item.unit || "-"}</div>
      </td>

      <td className="px-4 py-3">
        {editing === "ordered_qty" ? (
          <input
            type="number"
            step="0.01"
            value={tempValue}
            onChange={(e) => setTempValue(e.target.value)}
            onBlur={() => saveEdit("ordered_qty")}
            onKeyDown={(e) => {
              if (e.key === "Enter") saveEdit("ordered_qty");
              if (e.key === "Escape") cancelEdit();
            }}
            autoFocus
            className="w-20 px-2 py-1 rounded bg-slate-800 border border-slate-700 text-xs focus:outline-none focus:border-slate-600"
          />
        ) : (
          <div
            onClick={() => startEdit("ordered_qty", item.ordered_qty || 0)}
            className="text-sm cursor-pointer hover:text-slate-300"
          >
            {(item.ordered_qty || 0).toFixed(2)}
          </div>
        )}
      </td>

      <td className="px-4 py-3">
        {editing === "delivered_qty" ? (
          <input
            type="number"
            step="0.01"
            value={tempValue}
            onChange={(e) => setTempValue(e.target.value)}
            onBlur={() => saveEdit("delivered_qty")}
            onKeyDown={(e) => {
              if (e.key === "Enter") saveEdit("delivered_qty");
              if (e.key === "Escape") cancelEdit();
            }}
            autoFocus
            className="w-20 px-2 py-1 rounded bg-slate-800 border border-slate-700 text-xs focus:outline-none focus:border-slate-600"
          />
        ) : (
          <div
            onClick={() => startEdit("delivered_qty", item.delivered_qty || 0)}
            className="text-sm cursor-pointer hover:text-slate-300"
          >
            {(item.delivered_qty || 0).toFixed(2)}
          </div>
        )}
      </td>

      <td className="px-4 py-3">
        <div className="text-sm font-medium text-blue-400">{balanceQty.toFixed(2)}</div>
      </td>

      <td className="px-4 py-3">
        {editing === "unit_rate" ? (
          <input
            type="number"
            step="0.01"
            value={tempValue}
            onChange={(e) => setTempValue(e.target.value)}
            onBlur={() => saveEdit("unit_rate")}
            onKeyDown={(e) => {
              if (e.key === "Enter") saveEdit("unit_rate");
              if (e.key === "Escape") cancelEdit();
            }}
            autoFocus
            className="w-20 px-2 py-1 rounded bg-slate-800 border border-slate-700 text-xs focus:outline-none focus:border-slate-600"
          />
        ) : (
          <div
            onClick={() => startEdit("unit_rate", item.unit_rate || 0)}
            className="text-sm cursor-pointer hover:text-slate-300"
          >
            ${(item.unit_rate || 0).toFixed(2)}
          </div>
        )}
      </td>

      <td className="px-4 py-3">
        <div className="text-sm font-medium">
          ${totalCost.toLocaleString(undefined, { maximumFractionDigits: 2 })}
        </div>
      </td>

      <td className="px-4 py-3">
        <select
          value={item.status}
          onChange={(e) =>
            onUpdate(item.id, { status: e.target.value as ProcurementItemStatus })
          }
          className={
            "px-2 py-1 rounded text-xs border " +
            (item.status === "pending"
              ? "bg-yellow-900/20 border-yellow-900/40 text-yellow-300"
              : item.status === "requested"
              ? "bg-amber-900/20 border-amber-900/40 text-amber-300"
              : item.status === "quoted"
              ? "bg-cyan-900/20 border-cyan-900/40 text-cyan-300"
              : item.status === "approved"
              ? "bg-lime-900/20 border-lime-900/40 text-lime-300"
              : item.status === "ordered"
              ? "bg-blue-900/20 border-blue-900/40 text-blue-300"
              : item.status === "part_delivered"
              ? "bg-orange-900/20 border-orange-900/40 text-orange-300"
              : item.status === "received"
              ? "bg-emerald-900/20 border-emerald-900/40 text-emerald-300"
              : "bg-red-900/20 border-red-900/40 text-red-300")
          }
        >
          {PROCUREMENT_ITEM_STATUSES.map((status) => (
            <option key={status} value={status}>
              {getItemStatusLabel(status)}
            </option>
          ))}
        </select>
      </td>

      <td className="px-4 py-3">
        <button
          onClick={() => onDelete(item.id)}
          className="px-2 py-1 rounded text-xs bg-red-900/20 hover:bg-red-900/40 border border-red-900/40 text-red-300"
        >
          Delete
        </button>
      </td>
    </tr>
  );
}
