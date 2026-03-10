import React, { useEffect, useState, useRef } from "react";
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
} from "../lib/procurement";
import { createProjectCost } from "../lib/costs";
import { supabase } from "../lib/supabase";

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
  const [filterStatus, setFilterStatus] = useState<string>("all");
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

  async function handleStatusChange(
    itemId: string,
    status: "pending" | "ordered" | "received"
  ) {
    if (!currentDocument) return;

    const item = currentDocument.items.find((i) => i.id === itemId);
    if (!item) return;

    if (status === "received" && item.status !== "received") {
      const unitCostStr = window.prompt(
        `Enter unit cost for ${item.material_name} (${item.unit || "unit"}):`
      );

      if (unitCostStr === null) {
        return;
      }

      const unitCost = parseFloat(unitCostStr);
      if (isNaN(unitCost) || unitCost < 0) {
        alert("Invalid unit cost entered");
        return;
      }

      const totalAmount = Number(item.quantity) * unitCost;
      const description = `${item.material_name} - ${item.quantity} ${item.unit || "units"}`;

      const costResult = await createProjectCost(
        item.project_id,
        "material",
        description,
        totalAmount,
        item.id,
        `Unit cost: ${unitCost} per ${item.unit || "unit"}`
      );

      if (!costResult.success) {
        alert("Failed to create cost record");
        return;
      }
    }

    const result = await updateProcurementItemStatus(itemId, status);
    if (result.success) {
      setCurrentDocument((prev) =>
        prev
          ? {
              ...prev,
              items: prev.items.map((i) =>
                i.id === itemId ? { ...i, status } : i
              ),
            }
          : null
      );
    } else {
      alert("Failed to update status");
    }
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
    window.print();
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
    return <DocumentView
      document={currentDocument}
      projectName={projectName}
      companyName={companyName}
      filterStatus={filterStatus}
      setFilterStatus={setFilterStatus}
      onBack={backToList}
      onStatusChange={handleStatusChange}
      onDeleteItem={handleDeleteItem}
      onUpdateHeader={handleUpdateHeader}
      onPrint={handlePrint}
      projectId={projectId}
    />;
  }

  return <ListView
    headers={headers}
    loading={loading}
    projectId={projectId}
    onOpenDocument={openDocument}
    onDeleteDocument={handleDeleteDocument}
    onNavigate={nav}
  />;
}

interface ListViewProps {
  headers: ProcurementHeaderWithItems[];
  loading: boolean;
  projectId: string;
  onOpenDocument: (docId: string) => void;
  onDeleteDocument: (docId: string) => void;
  onNavigate: (path: string) => void;
}

function ListView({ headers, loading, projectId, onOpenDocument, onDeleteDocument, onNavigate }: ListViewProps) {
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
                          : "bg-slate-700/50 text-slate-300")
                      }
                    >
                      {header.status}
                    </span>
                  </div>

                  {header.notes && (
                    <p className="text-sm text-slate-400 mt-1">{header.notes}</p>
                  )}

                  <div className="flex items-center gap-4 mt-2 text-xs text-slate-500">
                    <span>{header.itemCount} items</span>
                    <span>•</span>
                    <span>Updated {new Date(header.updated_at).toLocaleDateString()}</span>
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
  filterStatus: string;
  setFilterStatus: (status: string) => void;
  onBack: () => void;
  onStatusChange: (itemId: string, status: "pending" | "ordered" | "received") => void;
  onDeleteItem: (itemId: string) => void;
  onUpdateHeader: (updates: any) => void;
  onPrint: () => void;
  projectId: string;
}

function DocumentView({
  document,
  projectName,
  companyName,
  filterStatus,
  setFilterStatus,
  onBack,
  onStatusChange,
  onDeleteItem,
  onUpdateHeader,
  onPrint,
  projectId,
}: DocumentViewProps) {
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState(document.title);

  const filteredItems =
    filterStatus === "all"
      ? document.items
      : document.items.filter((item) => item.status === filterStatus);

  const groupedItems = filteredItems.reduce((acc, item) => {
    const category = item.category || "Uncategorized";
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(item);
    return acc;
  }, {} as Record<string, ProcurementItemWithSource[]>);

  const totalItems = document.items.length;
  const pendingCount = document.items.filter((i) => i.status === "pending").length;
  const orderedCount = document.items.filter((i) => i.status === "ordered").length;
  const receivedCount = document.items.filter((i) => i.status === "received").length;

  function handleTitleSave() {
    if (titleValue.trim() && titleValue !== document.title) {
      onUpdateHeader({ title: titleValue.trim() });
    }
    setEditingTitle(false);
  }

  function handleStatusUpdate(newStatus: "draft" | "approved" | "sent" | "completed") {
    onUpdateHeader({ status: newStatus });
  }

  return (
    <div className="p-6">
      <div className="no-print mb-6">
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
                handleStatusUpdate(
                  e.target.value as "draft" | "approved" | "sent" | "completed"
                )
              }
              className="px-3 py-2 rounded-xl bg-slate-800/60 border border-slate-700 text-sm"
            >
              <option value="draft">Draft</option>
              <option value="approved">Approved</option>
              <option value="sent">Sent</option>
              <option value="completed">Completed</option>
            </select>
            <button
              onClick={onPrint}
              className="px-3 py-2 rounded-xl bg-blue-900/30 hover:bg-blue-900/50 border border-blue-900/50 text-blue-300 text-sm"
            >
              Print
            </button>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-4 mb-6">
          <div className="rounded-xl border border-slate-800 bg-slate-900/30 p-4">
            <div className="text-xs text-slate-400">Total Items</div>
            <div className="text-2xl font-semibold mt-1">{totalItems}</div>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900/30 p-4">
            <div className="text-xs text-slate-400">Pending</div>
            <div className="text-2xl font-semibold mt-1 text-yellow-400">
              {pendingCount}
            </div>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900/30 p-4">
            <div className="text-xs text-slate-400">Ordered</div>
            <div className="text-2xl font-semibold mt-1 text-blue-400">
              {orderedCount}
            </div>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900/30 p-4">
            <div className="text-xs text-slate-400">Received</div>
            <div className="text-2xl font-semibold mt-1 text-emerald-400">
              {receivedCount}
            </div>
          </div>
        </div>

        <div className="mb-4 flex items-center gap-3">
          <div className="text-sm text-slate-400">Filter:</div>
          <div className="flex gap-2">
            {["all", "pending", "ordered", "received"].map((status) => (
              <button
                key={status}
                onClick={() => setFilterStatus(status)}
                className={
                  "px-3 py-1 rounded-lg text-xs " +
                  (filterStatus === status
                    ? "bg-slate-700 text-white"
                    : "bg-slate-800/30 text-slate-400 hover:bg-slate-800/50")
                }
              >
                {status.charAt(0).toUpperCase() + status.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div id="procurement-print" className="print-content">
        <div className="print-header hidden">
          <div className="text-center mb-8">
            {companyName && (
              <div className="text-2xl font-bold mb-2">{companyName}</div>
            )}
            <div className="text-xl font-semibold mb-1">Procurement List</div>
            <div className="text-lg text-slate-600 mb-4">{document.title}</div>
            <div className="flex justify-between text-sm text-slate-600 border-t border-b border-slate-300 py-2">
              <div>
                <strong>Project:</strong> {projectName}
              </div>
              <div>
                <strong>Date:</strong> {new Date().toLocaleDateString()}
              </div>
              <div>
                <strong>Status:</strong> {document.status.toUpperCase()}
              </div>
            </div>
          </div>
        </div>

        {filteredItems.length === 0 ? (
          <div className="rounded-2xl border border-slate-800 bg-slate-900/30 p-8 text-center no-print">
            <p className="text-slate-400">No items match the current filter</p>
          </div>
        ) : (
          <div className="space-y-6">
            {Object.entries(groupedItems).map(([category, categoryItems]) => (
              <div key={category} className="print-section">
                <div className="rounded-2xl border border-slate-800 bg-slate-900/30 overflow-hidden">
                  <div className="px-4 py-3 border-b border-slate-800 bg-slate-900/50 print-category-header">
                    <h3 className="font-semibold text-sm">{category}</h3>
                    <div className="text-xs text-slate-400 mt-0.5">
                      {categoryItems.length} items
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full print-table">
                      <thead>
                        <tr className="border-b border-slate-800 text-left text-xs text-slate-400">
                          <th className="px-4 py-3 font-medium">Material</th>
                          <th className="px-4 py-3 font-medium">Description</th>
                          <th className="px-4 py-3 font-medium">Quantity</th>
                          <th className="px-4 py-3 font-medium">Unit</th>
                          <th className="px-4 py-3 font-medium no-print">Status</th>
                          <th className="px-4 py-3 font-medium no-print">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {categoryItems.map((item) => (
                          <tr
                            key={item.id}
                            className="border-b border-slate-800/50 hover:bg-slate-900/50"
                          >
                            <td className="px-4 py-3">
                              <div className="font-medium text-sm">
                                {item.material_name}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-sm text-slate-400">
                              {item.description || item.notes || "-"}
                            </td>
                            <td className="px-4 py-3 text-sm font-medium">
                              {Number(item.quantity).toFixed(2)}
                            </td>
                            <td className="px-4 py-3 text-sm text-slate-400">
                              {item.unit || "-"}
                            </td>
                            <td className="px-4 py-3 no-print">
                              <select
                                value={item.status}
                                onChange={(e) =>
                                  onStatusChange(
                                    item.id,
                                    e.target.value as
                                      | "pending"
                                      | "ordered"
                                      | "received"
                                  )
                                }
                                className={
                                  "px-2 py-1 rounded text-xs border " +
                                  (item.status === "pending"
                                    ? "bg-yellow-900/20 border-yellow-900/40 text-yellow-300"
                                    : item.status === "ordered"
                                    ? "bg-blue-900/20 border-blue-900/40 text-blue-300"
                                    : "bg-emerald-900/20 border-emerald-900/40 text-emerald-300")
                                }
                              >
                                <option value="pending">Pending</option>
                                <option value="ordered">Ordered</option>
                                <option value="received">Received</option>
                              </select>
                            </td>
                            <td className="px-4 py-3 no-print">
                              <button
                                onClick={() => onDeleteItem(item.id)}
                                className="px-2 py-1 rounded text-xs bg-red-900/20 hover:bg-red-900/40 border border-red-900/40 text-red-300"
                              >
                                Delete
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="print-footer hidden mt-8 pt-4 border-t border-slate-300 text-xs text-slate-600 text-center">
          Generated on {new Date().toLocaleDateString()} at {new Date().toLocaleTimeString()}
        </div>
      </div>

      <style>{`
        @page {
          size: A4;
          margin: 15mm;
        }

        @media print {
          /* Hide everything by default */
          body * {
            visibility: hidden;
          }

          /* Only show the procurement print container and its children */
          #procurement-print,
          #procurement-print * {
            visibility: visible;
          }

          /* Position print container at top-left of page */
          #procurement-print {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            background: white !important;
            color: black !important;
          }

          /* Force white background and black text */
          body,
          html {
            background: white !important;
            color: black !important;
            margin: 0 !important;
            padding: 0 !important;
          }

          /* Hide UI elements globally */
          aside,
          nav,
          button,
          .no-print {
            display: none !important;
            visibility: hidden !important;
          }

          /* Show print-only elements */
          .print-header.hidden {
            display: block !important;
            visibility: visible !important;
          }

          .print-footer.hidden {
            display: block !important;
            visibility: visible !important;
          }

          /* Print content styling */
          .print-content {
            color: black !important;
            background: white !important;
          }

          /* Page break handling */
          .print-section {
            page-break-inside: avoid;
            margin-bottom: 1.5rem;
          }

          /* Category headers */
          .print-category-header {
            background: #f3f4f6 !important;
            border-bottom: 2px solid #d1d5db !important;
            color: black !important;
          }

          /* Table styling */
          .print-table {
            border-collapse: collapse;
            width: 100%;
          }

          .print-table th {
            background: #f9fafb !important;
            border-bottom: 2px solid #d1d5db !important;
            color: black !important;
            font-weight: 600;
            padding: 8px 12px;
          }

          .print-table td {
            border-bottom: 1px solid #e5e7eb !important;
            color: black !important;
            padding: 8px 12px;
          }

          .print-table tr:hover {
            background: transparent !important;
          }

          /* Remove dark mode colors */
          .rounded-xl,
          .rounded-2xl,
          .border-slate-800,
          .bg-slate-900 {
            background: white !important;
            border-color: #d1d5db !important;
          }
        }
      `}</style>
    </div>
  );
}
