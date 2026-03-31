import React, { useEffect, useState } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import {
  fetchProcurementHeaders,
  fetchProcurementDocument,
  updateProcurementHeader,
  deleteProcurementHeader,
  deleteProcurementItem,
} from "../lib/procurement";
import type {
  ProcurementHeaderWithItems,
  ProcurementItem,
} from "../lib/procurement";
import type {
  ProcurementItemWithSource,
  SupplierWithPerformance,
  BestPriceResult,
} from "../types/procurement";
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
import { printPurchaseOrder } from "../lib/purchaseOrderPrint";
import { listSuppliers, type Supplier } from "../lib/suppliers";
import {
  createPurchaseOrderFromProcurementItems,
  generatePONumber,
  listPurchaseOrders,
  getPurchaseOrder,
  updatePurchaseOrder,
  deletePurchaseOrder,
  receiveItems,
  type PurchaseOrderWithItems,
  type PurchaseOrderStatus,
} from "../lib/purchaseOrders";
import { getBestSupplierPrices, type SupplierPriceInfo } from "../lib/supplierPriceComparison";
import { useProjectContext } from "../context/ProjectContext";
import { theme } from "../lib/theme";
import { useProcurementFilters } from "../hooks/useProcurementFilters";
import { useProcurementSummary } from "../hooks/useProcurementSummary";
import { useProcurementOptimization } from "../hooks/useProcurementOptimization";
import { useProcurementIntelligence } from "../hooks/useProcurementIntelligence";
import { useSupplierRowAnalysis } from "../hooks/useSupplierRowAnalysis";
import { useProcurementApproval } from "../hooks/useProcurementApproval";
import { getProcurementApproval, updateProcurementApproval, getCurrentUserProfile, getProcurementApprovalHistory, getDocumentWorkflow, getWorkflowSteps, canUserApproveDocument, isDocumentFullyApproved } from "../lib/procurementApproval";
import { toast } from "../lib/toast";

export default function ProcurementPage() {
  const { currentProjectId, currentProject } = useProjectContext();
  const { projectId: routeProjectId } = useParams<{ projectId?: string }>();
  const projectId = routeProjectId || currentProjectId;
  const [searchParams, setSearchParams] = useSearchParams();
  const nav = useNavigate();

  const viewMode = searchParams.get("view") || "list";
  const documentId = searchParams.get("doc") || null;

  const section = searchParams.get("section") || "procurement";

  const [headers, setHeaders] = useState<ProcurementHeaderWithItems[]>([]);
  const [currentDocument, setCurrentDocument] = useState<ProcurementHeaderWithItems | null>(null);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrderWithItems[]>([]);
  const [currentPO, setCurrentPO] = useState<PurchaseOrderWithItems | null>(null);
  const [loading, setLoading] = useState(true);
  const [projectName, setProjectName] = useState<string>("");
  const [companyName, setCompanyName] = useState<string>("");

  if (!currentProjectId) {
    return (
      <div className="p-6 text-sm text-slate-500">
        Please select a project from top bar before using Procurement.
      </div>
    );
  }

  useEffect(() => {
    if (projectId) {
      loadProjectInfo();
      if (viewMode === "list") {
        if (section === "procurement") {
          loadProcurementHeaders();
        } else if (section === "purchase-orders") {
          loadPurchaseOrders();
        }
      } else if (viewMode === "document" && documentId) {
        if (section === "procurement") {
          loadProcurementDocument(documentId);
        } else if (section === "purchase-orders") {
          loadPurchaseOrderDocument(documentId);
        }
      }
    }
  }, [projectId, currentProjectId, viewMode, documentId, section]);

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

  async function loadPurchaseOrders() {
    if (!projectId) return;

    setLoading(true);
    try {
      const data = await listPurchaseOrders(projectId);
      setPurchaseOrders(data);
    } catch (e) {
      console.error("Failed to load purchase orders:", e);
    } finally {
      setLoading(false);
    }
  }

  async function loadPurchaseOrderDocument(poId: string) {
    setLoading(true);
    try {
      const data = await getPurchaseOrder(poId);
      if (data) {
        setCurrentPO(data);
      }
    } catch (e) {
      console.error("Failed to load purchase order:", e);
    } finally {
      setLoading(false);
    }
  }

  function openDocument(docId: string) {
    setSearchParams({ view: "document", doc: docId, section });
  }

  function openPurchaseOrder(poId: string) {
    setSearchParams({ view: "document", doc: poId, section: "purchase-orders" });
  }

  function backToList() {
    setSearchParams({ view: "list", section });
    setCurrentDocument(null);
    setCurrentPO(null);
    if (section === "procurement") {
      loadProcurementHeaders();
    } else if (section === "purchase-orders") {
      loadPurchaseOrders();
    }
  }

  function switchSection(newSection: string) {
    setSearchParams({ view: "list", section: newSection });
    setCurrentDocument(null);
    setCurrentPO(null);
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

  async function handleDeletePurchaseOrder(poId: string) {
    if (!window.confirm("Delete this purchase order? All items will be removed.")) return;

    const result = await deletePurchaseOrder(poId);
    if (result.success) {
      setPurchaseOrders((prev) => prev.filter((po) => po.id !== poId));
    } else {
      alert("Failed to delete purchase order");
    }
  }

  async function handleUpdatePurchaseOrder(
    updates: Partial<Pick<PurchaseOrderWithItems, "status" | "issue_date" | "expected_date" | "notes">>
  ) {
    if (!currentPO) return;

    const result = await updatePurchaseOrder(currentPO.id, updates);
    if (result.success && result.data) {
      setCurrentPO({ ...currentPO, ...result.data });
    }
  }

  async function handleReceiveItems(itemDeliveries: { itemId: string; deliveredQty: number }[]) {
    if (!currentPO) return;

    const result = await receiveItems(currentPO.id, itemDeliveries);
    if (result.success) {
      loadPurchaseOrderDocument(currentPO.id);
    } else {
      alert("Failed to receive items: " + (result.error || "Unknown error"));
    }
  }

  async function handleUpdateItem(itemId: string, updates: Partial<ProcurementItem>) {
    if (!currentDocument) return;

    const item = currentDocument.items.find((i) => i.id === itemId);
    if (!item) return;

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
      .eq("project_id", currentProjectId)
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

  function handlePrintPO() {
    if (!currentPO) return;

    printPurchaseOrder({
      purchaseOrder: currentPO,
      projectName,
      companyName,
    });
  }

  async function handleCreateReceiving(procurementId: string) {
    try {
      const { data, error } = await supabase.rpc("create_receiving_from_procurement", {
        p_procurement_id: procurementId,
      });

      if (error) throw error;

      alert("Receiving draft created successfully.");
      console.log("[Procurement] Receiving created:", data);

      if (viewMode === "list" && section === "procurement") {
        await loadProcurementHeaders();
      }
    } catch (e: any) {
      console.error("[Procurement] Failed to create receiving:", e);
      alert(e?.message ?? "Failed to create receiving");
    }
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

  if (viewMode === "document") {
    if (section === "procurement" && currentDocument) {
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
          onSwitchSection={switchSection}
          currentSection={section}
        />
      );
    } else if (section === "purchase-orders" && currentPO) {
      return (
        <PurchaseOrderDocumentView
          purchaseOrder={currentPO}
          projectName={projectName}
          currentProjectName={currentProject?.name || ""}
          companyName={companyName}
          onBack={backToList}
          onUpdate={handleUpdatePurchaseOrder}
          onPrint={handlePrintPO}
          onReceive={handleReceiveItems}
        />
      );
    }
  }

  if (section === "procurement") {
    return (
        <ListView
        headers={headers}
        loading={loading}
        projectId={projectId}
        currentProjectName={currentProject?.name || ""}
        onOpenDocument={openDocument}
        onDeleteDocument={handleDeleteDocument}
        onCreateReceiving={handleCreateReceiving}
        onNavigate={nav}
        onSwitchSection={switchSection}
        currentSection={section}
      />
    );
  } else if (section === "purchase-orders") {
    return (
      <PurchaseOrdersListView
        purchaseOrders={purchaseOrders}
        loading={loading}
        currentProjectName={currentProject?.name || ""}
        onOpenPO={openPurchaseOrder}
        onDeletePO={handleDeletePurchaseOrder}
        onSwitchSection={switchSection}
        currentSection={section}
      />
    );
  }

  return null;
}

interface ListViewProps {
  headers: ProcurementHeaderWithItems[];
  loading: boolean;
  projectId: string;
  currentProjectName: string;
  onOpenDocument: (docId: string) => void;
  onDeleteDocument: (docId: string) => void;
  onCreateReceiving: (docId: string) => void;
  onNavigate: (path: string) => void;
  onSwitchSection: (section: string) => void;
  currentSection: string;
}

function ListView({
  headers,
  loading,
  projectId,
  currentProjectName,
  onOpenDocument,
  onDeleteDocument,
  onCreateReceiving,
  onNavigate,
  onSwitchSection,
  currentSection,
}: ListViewProps) {
  const totalDocs = headers.length;
  const draftCount = headers.filter((h) => h.status === "draft").length;
  const approvedCount = headers.filter((h) => h.status === "approved").length;

  return (
    <div className="p-6">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-semibold">Procurement Documents</h1>

          {currentProjectName && (
            <div className={`mt-2 text-sm ${theme.text.muted}`}>
              Project:{" "}
              <span className={`font-semibold ${theme.text.secondary}`}>
                {currentProjectName}
              </span>
            </div>
          )}

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

      <div className="flex gap-2 mb-6 border-b border-slate-800">
        <button
          onClick={() => onSwitchSection("procurement")}
          className={
            "px-4 py-2 text-sm font-medium border-b-2 transition-colors " +
            (currentSection === "procurement"
              ? "border-blue-400 text-blue-400"
              : "border-transparent text-slate-400 hover:text-slate-300")
          }
        >
          Procurement Documents
        </button>
        <button
          onClick={() => onSwitchSection("purchase-orders")}
          className={
            "px-4 py-2 text-sm font-medium border-b-2 transition-colors " +
            (currentSection === "purchase-orders"
              ? "border-blue-400 text-blue-400"
              : "border-transparent text-slate-400 hover:text-slate-300")
          }
        >
          Purchase Orders
        </button>
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
                    onClick={() => onCreateReceiving(header.id)}
                    className="px-3 py-1.5 rounded-lg bg-slate-800/60 hover:bg-slate-800 text-xs"
                  >
                    Create Receiving
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
  onSwitchSection: (section: string) => void;
  currentSection: string;
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
  onSwitchSection,
  currentSection,
}: DocumentViewProps) {
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState(document.title);
  const [searchText, setSearchText] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterPriority, setFilterPriority] = useState<string>("all");
  const [filterSupplier, setFilterSupplier] = useState<string>("all");
  const [suppliers, setSuppliers] = useState<(Supplier & {
    average_rating?: number;
    rating_count?: number;
  })[]>([]);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [creatingPOs, setCreatingPOs] = useState(false);
  const [supplierRecommendations, setSupplierRecommendations] = useState<Map<string, BestPriceResult>>(new Map());

  // Approval workflow
  const [approvalState, setApprovalState] = useState<{
    status: string;
    approvedBy: string;
    approvedAt: string | null;
    notes: string;
  }>({
    status: "pending",
    approvedBy: "",
    approvedAt: null,
    notes: ""
  });

  const [approvalHistory, setApprovalHistory] = useState<any[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [documentWorkflow, setDocumentWorkflow] = useState<any>(null);
  const [workflowSteps, setWorkflowSteps] = useState<any[]>([]);
  const [canApprove, setCanApprove] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);

  function getDocumentApproval() {
    return approvalState;
  }

  async function updateApproval(status: string, notes: string) {
    try {
      // Check if user can approve
      if (status === 'approved' && !canApprove) {
        toast.warning("You don't have permission to approve this document at the current workflow step.");
        return;
      }

      // Get current user profile
      const userProfile = await getCurrentUserProfile();
      
      // Update database with user_id instead of approved_by text
      const result = await updateProcurementApproval(document.id, status as any, userProfile?.id, notes);
      
      if (result.success) {
        // Reload approval state to get updated data
        await loadApprovalState();
        // Also reload history
        await loadApprovalHistory();
        // Reload workflow info
        await loadWorkflowInfo();
      } else {
        console.error('Failed to update approval:', result.error);
        // Optionally show error to user
      }
    } catch (err) {
      console.error('Error updating approval:', err);
    }
  }

  async function resetApproval() {
    try {
      const result = await updateProcurementApproval(document.id, 'reset');
      
      if (result.success) {
        // Reload approval state to get updated data
        await loadApprovalState();
        // Also reload history
        await loadApprovalHistory();
        // Reload workflow info
        await loadWorkflowInfo();
      } else {
        console.error('Failed to reset approval:', result.error);
      }
    } catch (err) {
      console.error('Error resetting approval:', err);
    }
  }

  async function loadApprovalHistory() {
    if (!document) return;

    try {
      const history = await getProcurementApprovalHistory(document.id);
      setApprovalHistory(history);
    } catch (err) {
      console.error("Failed to load approval history:", err);
    }
  }

  async function loadWorkflowInfo() {
    if (!document || !currentUser) return;

    try {
      // Load document workflow
      const workflow = await getDocumentWorkflow(document.id);
      setDocumentWorkflow(workflow);

      // Load workflow steps
      if (workflow?.workflow_id) {
        const steps = await getWorkflowSteps(workflow.workflow_id);
        setWorkflowSteps(steps);
      }

      // Check if current user can approve
      const canApproveDoc = await canUserApproveDocument(document.id, currentUser.id);
      setCanApprove(canApproveDoc);
    } catch (err) {
      console.error("Failed to load workflow info:", err);
    }
  }

  async function loadCurrentUser() {
    try {
      const user = await getCurrentUserProfile();
      setCurrentUser(user);
    } catch (err) {
      console.error("Failed to load current user:", err);
    }
  }

  function handleAutoSelectSupplier() {
    const filteredItems = document.items.filter((item) => selectedItems.has(item.id));
    if (filteredItems.length === 0) return;

    filteredItems.forEach((item: ProcurementItemWithSource) => {
      const recommendation = supplierRecommendations.get(item.id);
      if (recommendation?.best_price) {
        onUpdateItem(item.id, {
          supplier: recommendation.best_price.supplier_name,
          unit_rate: recommendation.best_price.rate
        });
      }
    });
  }

  useEffect(() => {
    loadSuppliers();
    loadSupplierRecommendations();
    loadCurrentUser().then(() => {
      loadApprovalState();
      loadApprovalHistory();
      loadWorkflowInfo();
    });
  }, []);

  async function loadApprovalState() {
    if (!document) return;

    try {
      const approval = await getProcurementApproval(document.id);
      if (approval) {
        setApprovalState({
          status: approval.status,
          approvedBy: approval.approved_by || "",
          approvedAt: approval.approved_at,
          notes: approval.notes || ""
        });
      }
    } catch (err) {
      console.error("Failed to load approval state:", err);
    }
  }

  async function loadSupplierRecommendations() {
    if (!document) return;

    try {
      const costItemIds = document.items
        .filter((item) => item.source_boq_item_id)
        .map((item) => item.source_boq_item_id!);

      if (costItemIds.length === 0) return;

      const recommendations = await Promise.all(costItemIds.map(id => getBestSupplierPrices(id)));
      const allRecommendations = recommendations.flat();
      const recommendationMap = new Map(
        allRecommendations.map((rec) => [rec.cost_item_id, rec])
      );

      setSupplierRecommendations(recommendationMap);
    } catch (err) {
      console.error("Failed to load supplier recommendations:", err);
    }
  }

  async function loadSuppliers() {
    try {
      const [supplierData, performanceRes] = await Promise.all([
        listSuppliers(),
        supabase
          .from("v_supplier_performance")
          .select("supplier_id, average_rating, rating_count"),
      ]);

      const performanceMap = new Map(
        (performanceRes.data || []).map((row) => [
          row.supplier_id,
          {
            average_rating: Number(row.average_rating || 0),
            rating_count: Number(row.rating_count || 0),
          },
        ])
      );

      setSuppliers(
        supplierData
          .filter((s) => s.is_active)
          .map((s) => ({
            ...s,
            average_rating: performanceMap.get(s.id)?.average_rating ?? 0,
            rating_count: performanceMap.get(s.id)?.rating_count ?? 0,
          }))
      );
    } catch (err) {
      console.error("Failed to load suppliers:", err);
    }
  }

  // Use custom hooks for performance and separation of concerns
  const {
    itemSuppliers,
    filteredItems,
    groupedItems,
  } = useProcurementFilters(document.items, searchText, filterStatus, filterPriority, filterSupplier);

  const summaryCounts = useProcurementSummary(document.items);

  const optimizationMetrics = useProcurementOptimization(document.items, supplierRecommendations);

  const intelligenceMetrics = useProcurementIntelligence(document.items, supplierRecommendations, suppliers);

  function handleTitleSave() {
    if (titleValue.trim() && titleValue !== document.title) {
      onUpdateHeader({ title: titleValue.trim() });
    }
    setEditingTitle(false);
  }

  function handleStatusUpdate(newStatus: ProcurementHeaderStatus) {
    onUpdateHeader({ status: newStatus });
  }

  function toggleItemSelection(itemId: string) {
    setSelectedItems((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(itemId)) {
        newSet.delete(itemId);
      } else {
        newSet.add(itemId);
      }
      return newSet;
    });
  }

  function toggleSelectAll() {
    if (selectedItems.size === filteredItems.length) {
      setSelectedItems(new Set());
    } else {
      setSelectedItems(new Set(filteredItems.map((item) => item.id)));
    }
  }

  async function handleCreatePurchaseOrders() {
    if (selectedItems.size === 0) {
      alert("Please select items to create purchase orders");
      return;
    }

    // Check if document is fully approved (role-based workflow)
    const fullyApproved = await isDocumentFullyApproved(document.id);
    if (!fullyApproved) {
      toast.warning("Purchase orders can only be created for documents that have completed all required approval steps.");
      return;
    }

    const selectedItemsData = document.items.filter((item) =>
      selectedItems.has(item.id)
    );

    const itemsWithSupplier = selectedItemsData.filter(
      (item) => item.supplier && item.supplier.trim() !== ""
    );

    if (itemsWithSupplier.length === 0) {
      alert("Selected items must have a supplier assigned");
      return;
    }

    if (itemsWithSupplier.length !== selectedItemsData.length) {
      const proceed = window.confirm(
        `${selectedItemsData.length - itemsWithSupplier.length} selected items have no supplier and will be skipped. Continue?`
      );
      if (!proceed) return;
    }

    const groupedBySupplier = itemsWithSupplier.reduce((acc, item) => {
      const itemWithMeta = item as ProcurementItemWithSource;
      let supplierId: string | null = itemWithMeta.supplier_id || null;
      let supplierName: string;

      if (supplierId) {
        // Use supplier_id as primary key
        const supplier = suppliers.find((s) => s.id === supplierId);
        supplierName = supplier?.supplier_name || `Supplier ${supplierId}`;
      } else if (item.supplier) {
        // Fallback to supplier_name
        supplierName = item.supplier;
        supplierId = null;
      } else {
        // Skip items with no supplier info
        return acc;
      }

      const key = supplierId ? `id:${supplierId}` : `name:${supplierName}`;
      if (!acc[key]) {
        acc[key] = {
          supplierId,
          supplierName,
          items: [],
        };
      }
      acc[key].items.push(item);
      return acc;
    }, {} as Record<string, { supplierId: string | null; supplierName: string; items: ProcurementItemWithSource[] }>);

    setCreatingPOs(true);
    const results: { supplier: string; success: boolean; error?: string }[] = [];

    try {
      const { data: userProfile } = await supabase
        .from("user_profiles")
        .select("company_id")
        .eq("id", (await supabase.auth.getUser()).data.user?.id)
        .single();

      if (!userProfile?.company_id) {
        alert("Unable to determine company");
        setCreatingPOs(false);
        return;
      }

      for (const { supplierId, supplierName, items } of Object.values(groupedBySupplier)) {
        try {
          const poNumber = await generatePONumber(userProfile.company_id);

          const result = await createPurchaseOrderFromProcurementItems({
            project_id: projectId,
            supplier_id: supplierId,
            supplier_name: supplierName,
            po_number: poNumber,
            title: `${supplierName} - ${items.length} items`,
            procurement_item_ids: items.map((item) => item.id),
          });

          if (result.success) {
            results.push({ supplier: supplierName, success: true });
          } else {
            results.push({
              supplier: supplierName,
              success: false,
              error: result.error,
            });
          }
        } catch (e: any) {
          results.push({
            supplier: supplierName,
            success: false,
            error: e?.message || "Unknown error",
          });
        }
      }

      const successCount = results.filter((r) => r.success).length;
      const failCount = results.filter((r) => !r.success).length;

      if (failCount === 0) {
        alert(
          `Successfully created ${successCount} purchase order${successCount > 1 ? "s" : ""}`
        );
        setSelectedItems(new Set());
      } else {
        const failedSuppliers = results
          .filter((r) => !r.success)
          .map((r) => `${r.supplier}: ${r.error}`)
          .join("\n");
        alert(
          `Created ${successCount} purchase orders.\n${failCount} failed:\n${failedSuppliers}`
        );
      }
    } catch (e: any) {
      alert("Failed to create purchase orders: " + (e?.message || "Unknown error"));
    } finally {
      setCreatingPOs(false);
    }
  }

  function handleUseOptimizedSuppliers() {
    if (selectedItems.size === 0) {
      alert("Please select items to optimize");
      return;
    }

    let updatedCount = 0;
    const selectedItemsList = document.items.filter((item) =>
      selectedItems.has(item.id)
    );

    selectedItemsList.forEach((item) => {
      const recommendation = item.source_boq_item_id
        ? supplierRecommendations.get(item.source_boq_item_id)
        : null;

      if (recommendation?.best_price?.supplier_id) {
        const recommendedSupplierId = recommendation.best_price.supplier_id;
        const recommendedSupplier = suppliers.find(
          (s) => s.id === recommendedSupplierId
        );

        if (recommendedSupplier && recommendation.best_price?.rate) {
          const updates: Partial<ProcurementItem> = {
            supplier: recommendedSupplier.supplier_name,
            unit_rate: recommendation.best_price.rate,
          };

          onUpdateItem(item.id, updates);
          updatedCount++;
        }
      }
    });

    alert(`Updated ${updatedCount} items to optimized suppliers`);
  }

  async function handleCreateOptimizedPurchaseOrders() {
    if (selectedItems.size === 0) {
      alert("Please select items to create optimized purchase orders");
      return;
    }

    const proceed = window.confirm("Create optimized purchase orders using best supplier recommendations?");
    if (!proceed) return;

    const selectedItemsData = document.items.filter((item) =>
      selectedItems.has(item.id)
    );

    // Group items by optimized supplier
    const groupedByOptimizedSupplier = selectedItemsData.reduce((acc, item) => {
      const itemWithMeta = item as ProcurementItemWithSource;
      const recommendation = item.source_boq_item_id
        ? supplierRecommendations.get(item.source_boq_item_id)
        : null;

      let supplierId: string | null = null;
      let supplierName: string;

      if (recommendation?.best_price?.supplier_id) {
        // Use recommended supplier
        supplierId = recommendation.best_price.supplier_id;
        const recommendedSupplier = suppliers.find((s) => s.id === supplierId);
        supplierName = recommendedSupplier?.supplier_name || `Supplier ${supplierId}`;
      } else {
        // Fallback to current supplier
        const itemWithMeta = item as ProcurementItemWithSource;
        supplierId = itemWithMeta.supplier_id ?? null;
        supplierName = item.supplier || `Unknown Supplier`;
      }

      const key = supplierId || supplierName;
      if (!acc[key]) {
        acc[key] = {
          supplierId,
          supplierName,
          items: [],
        };
      }
      acc[key].items.push(item);
      return acc;
    }, {} as Record<string, { supplierId: string | null; supplierName: string; items: ProcurementItemWithSource[] }>);

    setCreatingPOs(true);
    const results: { supplier: string; success: boolean; error?: string }[] = [];

    try {
      const { data: userProfile } = await supabase
        .from("user_profiles")
        .select("company_id")
        .eq("id", (await supabase.auth.getUser()).data.user?.id)
        .single();

      if (!userProfile?.company_id) {
        alert("Unable to determine company");
        setCreatingPOs(false);
        return;
      }

      for (const { supplierId, supplierName, items } of Object.values(groupedByOptimizedSupplier)) {
        try {
          const poNumber = await generatePONumber(userProfile.company_id);

          const result = await createPurchaseOrderFromProcurementItems({
            project_id: projectId,
            supplier_id: supplierId,
            supplier_name: supplierName,
            po_number: poNumber,
            title: `${supplierName} - ${items.length} items (Optimized)`,
            procurement_item_ids: items.map((item) => item.id),
          });

          if (result.success) {
            results.push({ supplier: supplierName, success: true });
          } else {
            results.push({
              supplier: supplierName,
              success: false,
              error: result.error,
            });
          }
        } catch (e: any) {
          results.push({
            supplier: supplierName,
            success: false,
            error: e?.message || "Unknown error",
          });
        }
      }

      const successCount = results.filter((r) => r.success).length;
      const failCount = results.filter((r) => !r.success).length;

      if (failCount === 0) {
        alert(
          `Successfully created ${successCount} optimized purchase order${successCount > 1 ? "s" : ""}`
        );
        setSelectedItems(new Set());
      } else {
        const failedSuppliers = results
          .filter((r) => !r.success)
          .map((r) => `${r.supplier}: ${r.error}`)
          .join("\n");
        alert(
          `Created ${successCount} optimized purchase orders.\n${failCount} failed:\n${failedSuppliers}`
        );
      }
    } catch (e: any) {
      alert("Failed to create optimized purchase orders: " + (e?.message || "Unknown error"));
    } finally {
      setCreatingPOs(false);
    }
  }

  return (
    <div className="p-6">
      <div className="flex gap-2 mb-6 border-b border-slate-800">
        <button
          onClick={() => onSwitchSection("procurement")}
          className={
            "px-4 py-2 text-sm font-medium border-b-2 transition-colors " +
            (currentSection === "procurement"
              ? "border-blue-400 text-blue-400"
              : "border-transparent text-slate-400 hover:text-slate-300")
          }
        >
          Procurement Documents
        </button>
        <button
          onClick={() => onSwitchSection("purchase-orders")}
          className={
            "px-4 py-2 text-sm font-medium border-b-2 transition-colors " +
            (currentSection === "purchase-orders"
              ? "border-blue-400 text-blue-400"
              : "border-transparent text-slate-400 hover:text-slate-300")
          }
        >
          Purchase Orders
        </button>
      </div>

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
            <div className="flex items-center gap-2">
              <button
                onClick={handleAutoSelectSupplier}
                disabled={selectedItems.size === 0 || getDocumentApproval()?.status === 'approved'}
                className="px-3 py-2 rounded-xl text-sm bg-blue-900/30 hover:bg-blue-900/50 border border-blue-900/50 text-blue-300 text-[10px] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Auto Select
              </button>
              <button
                onClick={handleCreateOptimizedPurchaseOrders}
                disabled={selectedItems.size === 0 || getDocumentApproval()?.status === 'approved'}
                className="px-3 py-2 rounded-xl text-sm bg-emerald-900/30 hover:bg-emerald-900/50 border-emerald-900/50 text-emerald-300 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Create Optimized POs
              </button>
              {getDocumentApproval()?.status === 'approved' && (
                <button
                  onClick={() => updateApproval('pending', 'Optimization cancelled - new plan needed')}
                  className="px-3 py-2 rounded-xl text-sm bg-orange-900/30 hover:bg-orange-900/50 border-orange-900/50 text-orange-300"
                >
                  Reject / Reset
                </button>
              )}
              {getDocumentApproval()?.status === 'rejected' && (
                <button
                  onClick={resetApproval}
                  className="px-3 py-2 rounded-xl text-sm bg-slate-700/30 hover:bg-slate-800/50 border border-slate-700/50 text-slate-300"
                >
                  Reset Status
                </button>
              )}
            </div>
            <button
              onClick={handleCreatePurchaseOrders}
              disabled={creatingPOs || selectedItems.size === 0}
              className={
                "px-3 py-2 rounded-xl text-sm transition-colors " +
                (selectedItems.size === 0
                  ? "bg-slate-800/30 border border-slate-700/50 text-slate-500 cursor-not-allowed"
                  : "bg-green-900/30 hover:bg-green-900/50 border border-green-900/50 text-green-300 disabled:opacity-50")
              }
            >
              {creatingPOs
                ? "Creating..."
                : `Create Purchase Order (${selectedItems.size})`}
            </button>
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

        {/* Procurement Optimization Dashboard */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/30 p-4 mb-4">
          <div className="text-sm font-medium text-slate-300 mb-3">Procurement Optimization Dashboard</div>
          <div className="grid grid-cols-4 gap-3 mb-3">
            <div className="rounded-lg border border-slate-800/50 bg-slate-900/50 p-3">
              <div className="text-xs text-slate-400">Current Cost</div>
              <div className="text-lg font-semibold mt-1">
                ${optimizationMetrics.currentSelectedCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </div>
            </div>
            <div className="rounded-lg border border-slate-800/50 bg-slate-900/50 p-3">
              <div className="text-xs text-slate-400">Optimized Cost</div>
              <div className="text-lg font-semibold mt-1 text-emerald-400">
                ${optimizationMetrics.optimizedCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </div>
            </div>
            <div className="rounded-lg border border-slate-800/50 bg-slate-900/50 p-3">
              <div className="text-xs text-slate-400">Potential Savings</div>
              <div className={`text-lg font-semibold mt-1 ${optimizationMetrics.potentialSavings > 0 ? 'text-green-400' : 'text-slate-400'}`}>
                ${Math.abs(optimizationMetrics.potentialSavings).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                {optimizationMetrics.potentialSavings > 0 && (
                  <div className="text-xs mt-1">
                    ({Math.round((optimizationMetrics.potentialSavings / optimizationMetrics.currentSelectedCost) * 100)}%)
                  </div>
                )}
              </div>
            </div>
            <div className="rounded-lg border border-slate-800/50 bg-slate-900/50 p-3">
              <div className="text-xs text-slate-400">Improvable Items</div>
              <div className="text-lg font-semibold mt-1 text-yellow-400">
                {optimizationMetrics.improvableItemsCount}
              </div>
            </div>
          </div>
          <div className="text-xs text-slate-400">
            {optimizationMetrics.potentialSavings > 0 
              ? `Optimization found savings opportunities across ${optimizationMetrics.improvableItemsCount} items.`
              : "Current supplier selections are already near optimal."}
          </div>
        </div>

        {/* Procurement Intelligence Panel */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/30 p-4 mb-4">
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm font-medium text-slate-300">Procurement Intelligence</div>
            {getDocumentApproval()?.status && (
              <div className="flex items-center gap-2">
                <div className="px-2 py-1 rounded text-xs font-medium bg-blue-600 text-white">
                  {getDocumentApproval()?.status}
                </div>
                <div className="text-xs text-slate-400">
                  {getDocumentApproval()?.approvedBy ? `Approved by ${getDocumentApproval()?.approvedBy}` : ''}
                  {getDocumentApproval()?.approvedAt ? ` on ${new Date(getDocumentApproval()!.approvedAt as string).toLocaleDateString()}` : ""}
                </div>
                <button
                  onClick={() => setShowHistory(!showHistory)}
                  className="ml-2 text-xs underline hover:text-blue-300"
                >
                  {showHistory ? 'Hide' : 'Show'} History
                </button>
                <button
                  onClick={() => updateApproval('pending', 'Status reset for re-evaluation')}
                  className="ml-2 text-xs underline hover:text-blue-300"
                >
                  Reset
                </button>
              </div>
            )}
            <div className="grid grid-cols-5 gap-3 mb-3">
              <div className="rounded-lg border border-slate-800/50 bg-slate-900/50 p-3">
                <div className="text-xs text-slate-400">Risky Items</div>
                <div className="text-lg font-semibold mt-1 text-red-400">
                  {intelligenceMetrics.riskyItemsCount}
                </div>
              </div>
              <div className="rounded-lg border border-slate-800/50 bg-slate-900/50 p-3">
                <div className="text-xs text-slate-400">Low Confidence</div>
                <div className="text-lg font-semibold mt-1 text-amber-400">
                  {intelligenceMetrics.lowConfidenceCount}
                </div>
              </div>
              <div className="rounded-lg border border-slate-800/50 bg-slate-900/50 p-3">
                <div className="text-xs text-slate-400">No Competition</div>
                <div className="text-lg font-semibold mt-1 text-orange-400">
                  {intelligenceMetrics.noCompetitionCount}
                </div>
              </div>
              <div className="rounded-lg border border-slate-800/50 bg-slate-900/50 p-3">
                <div className="text-xs text-slate-400">Manual Suppliers</div>
                <div className="text-lg font-semibold mt-1 text-yellow-400">
                  {intelligenceMetrics.manualSupplierCount}
                </div>
              </div>
              <div className="rounded-lg border border-slate-800/50 bg-slate-900/50 p-3">
                <div className="text-xs text-slate-400">Price Spread Alerts</div>
                <div className="text-lg font-semibold mt-1 text-emerald-400">
                  {intelligenceMetrics.highSpreadCount}
                </div>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-5 gap-3 mb-3">
            <div className="rounded-lg border border-slate-800/50 bg-slate-900/50 p-3">
              <div className="text-xs text-slate-400">Risky Items</div>
              <div className="text-lg font-semibold mt-1 text-red-400">
                {intelligenceMetrics.riskyItemsCount}
              </div>
            </div>
            <div className="rounded-lg border border-slate-800/50 bg-slate-900/50 p-3">
              <div className="text-xs text-slate-400">Low Confidence</div>
              <div className="text-lg font-semibold mt-1 text-amber-400">
                {intelligenceMetrics.lowConfidenceCount}
              </div>
            </div>
            <div className="rounded-lg border border-slate-800/50 bg-slate-900/50 p-3">
              <div className="text-xs text-slate-400">No Competition</div>
              <div className="text-lg font-semibold mt-1 text-orange-400">
                {intelligenceMetrics.noCompetitionCount}
              </div>
            </div>
            <div className="rounded-lg border border-slate-800/50 bg-slate-900/50 p-3">
              <div className="text-xs text-slate-400">Manual Suppliers</div>
              <div className="text-lg font-semibold mt-1 text-yellow-400">
                {intelligenceMetrics.manualSupplierCount}
              </div>
            </div>
            <div className="rounded-lg border border-slate-800/50 bg-slate-900/50 p-3">
              <div className="text-xs text-slate-400 mb-2">Approval Status</div>
              <div className="text-lg font-semibold">
                {getDocumentApproval()?.status || 'Not Started'}
              </div>
              {getDocumentApproval()?.approvedBy && (
                <div className="text-sm text-slate-400 mt-1">
                  Approved by: {getDocumentApproval()?.approvedBy}
                </div>
              )}
              {getDocumentApproval()?.approvedAt && (
                <div className="text-sm text-slate-400 mt-1">
                  Approved on: {getDocumentApproval()?.approvedAt ? new Date(getDocumentApproval()!.approvedAt as string).toLocaleDateString() : "-"}
                </div>
              )}
              {showHistory && approvalHistory.length > 0 && (
                <div className="mt-4 p-3 rounded-lg border border-slate-700/50 bg-slate-800/30">
                  <div className="text-sm font-medium text-slate-300 mb-2">Approval History</div>
                  <div className="space-y-2">
                    {approvalHistory.map((approval, index) => (
                      <div key={approval.id} className="text-xs text-slate-400 p-2 rounded border border-slate-700/30">
                        <div className="flex items-center justify-between">
                          <span className="font-medium">
                            {approval.status} #{approval.sequence_number}
                          </span>
                          <span>
                            {new Date(approval.created_at).toLocaleDateString()}
                          </span>
                        </div>
                        <div className="mt-1">
                          By: {approval.user_profiles?.full_name || approval.user_profiles?.email || 'Unknown User'}
                        </div>
                        {approval.notes && (
                          <div className="mt-1 text-slate-500">
                            Notes: {approval.notes}
                          </div>
                        )}
                        {approval.approved_at && (
                          <div className="mt-1 text-green-400">
                            Approved: {new Date(approval.approved_at).toLocaleDateString()}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="mt-3">
                <textarea
                  value={getDocumentApproval()?.notes || ''}
                  onChange={(e) => updateApproval(getDocumentApproval()?.status || 'pending', e.target.value)}
                  placeholder="Add approval notes..."
                  className="w-full px-3 py-2 rounded-lg bg-slate-800/50 border border-slate-700 text-sm text-slate-200 placeholder-slate-500"
                  rows={3}
                />
                <div className="flex gap-2 mt-3">
                  {getDocumentApproval()?.status !== 'approved' && (
                    <button
                      onClick={() => updateApproval('approved', 'Approved via optimization analysis')}
                      className="px-3 py-2 rounded-lg bg-green-900/30 hover:bg-green-900/50 border border-green-900/50 text-green-300 text-sm"
                    >
                      Approve Optimization
                    </button>
                  )}
                  {getDocumentApproval()?.status !== 'pending' && (
                    <button
                      onClick={() => updateApproval('pending', 'Status reset for re-evaluation')}
                      className="px-3 py-2 rounded-lg bg-orange-900/30 hover:bg-orange-900/50 border border-orange-900/50 text-orange-300 text-sm"
                    >
                      Reject / Reset
                    </button>
                  )}
                </div>
              </div>
            </div>
            <div className="rounded-lg border border-slate-800/50 bg-slate-900/50 p-3">
              <div className="text-xs text-slate-400">Price Spread Alerts</div>
              <div className="text-lg font-semibold mt-1 text-emerald-400">
                {intelligenceMetrics.highSpreadCount}
              </div>
            </div>
          </div>
          <div className="text-xs text-slate-400 space-y-1">
            {intelligenceMetrics.riskyItemsCount > 0 && (
              <div>⚠️ Some selected suppliers may need review before ordering.</div>
            )}
            {intelligenceMetrics.noCompetitionCount > 0 && (
              <div>📊 Some items have limited supplier competition.</div>
            )}
            {intelligenceMetrics.highSpreadCount > 0 && (
              <div>💰 Price spread suggests additional savings may be available.</div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-7 gap-3 mb-6">
          <div className="rounded-xl border border-slate-800 bg-slate-900/30 p-3">
            <div className="text-xs text-slate-400">Total Items</div>
            <div className="text-xl font-semibold mt-1">{summaryCounts.totalItems}</div>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900/30 p-3">
            <div className="text-xs text-slate-400">Pending</div>
            <div className="text-xl font-semibold mt-1 text-yellow-400">
              {summaryCounts.pendingCount}
            </div>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900/30 p-3">
            <div className="text-xs text-slate-400">Ordered</div>
            <div className="text-xl font-semibold mt-1 text-blue-400">
              {summaryCounts.orderedCount}
            </div>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900/30 p-3">
            <div className="text-xs text-slate-400">Part Del.</div>
            <div className="text-xl font-semibold mt-1 text-orange-400">
              {summaryCounts.partDeliveredCount}
            </div>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900/30 p-3">
            <div className="text-xs text-slate-400">Received</div>
            <div className="text-xl font-semibold mt-1 text-emerald-400">
              {summaryCounts.receivedCount}
            </div>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900/30 p-3">
            <div className="text-xs text-slate-400">Urgent</div>
            <div className="text-xl font-semibold mt-1 text-red-400">
              {summaryCounts.urgentCount}
            </div>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900/30 p-3">
            <div className="text-xs text-slate-400">Total Value</div>
            <div className="text-xl font-semibold mt-1">
              ${summaryCounts.totalValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
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

            {itemSuppliers.length > 0 && (
              <select
                value={filterSupplier}
                onChange={(e) => setFilterSupplier(e.target.value)}
                className="px-3 py-1.5 rounded-lg bg-slate-800/60 border border-slate-700 text-xs"
              >
                <option value="all">All Suppliers</option>
                {itemSuppliers.map((supplier) => (
                  <option key={supplier} value={supplier}>
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
                        <th className="px-4 py-3 font-medium w-8">
                          <input
                            type="checkbox"
                            checked={
                              filteredItems.length > 0 &&
                              selectedItems.size === filteredItems.length
                            }
                            onChange={toggleSelectAll}
                            className="rounded border-slate-700 bg-slate-800"
                          />
                        </th>
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
                          suppliers={suppliers}
                          supplierRecommendations={supplierRecommendations}
                          selected={selectedItems.has(item.id)}
                          onToggleSelect={() => toggleItemSelection(item.id)}
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
  suppliers: SupplierWithPerformance[];
  supplierRecommendations: Map<string, BestPriceResult>;
  selected: boolean;
  onToggleSelect: () => void;
  onUpdate: (itemId: string, updates: Partial<ProcurementItem>) => void;
  onDelete: (itemId: string) => void;
}

function ItemRow({
  item,
  suppliers,
  supplierRecommendations,
  selected,
  onToggleSelect,
  onUpdate,
  onDelete,
}: ItemRowProps) {
  const [editing, setEditing] = useState<string | null>(null);
  const [tempValue, setTempValue] = useState<string>("");
  const [showScoreBreakdown, setShowScoreBreakdown] = useState<string | null>(null);
  const [showScoreWhy, setShowScoreWhy] = useState(false);

  const balanceQty = calculateBalanceQty(item.quantity, item.delivered_qty || 0);
  const totalCost = calculateItemTotal(item.quantity || 0, item.unit_rate || 0);

  // Use custom hook for supplier analysis
  const supplierData = useSupplierRowAnalysis(item, suppliers, supplierRecommendations);
  const {
    isSupplierInDirectory,
    rankedSuppliers,
    bestRatedSupplier,
    selectedSupplierRecord,
    itemRecommendation,
    recommendedSupplier,
    cheapestSupplier,
    isBestRatedSelected,
    supplierScores,
  } = supplierData;

  function startEdit(field: string, currentValue: any) {
    setEditing(field);
    setTempValue(String(currentValue || ""));
  }

  function saveEdit(field: string) {
    if (!editing) return;

    let value: any = tempValue.trim();

    if (field === "supplier") {
      const selectedSupplier = suppliers.find((s) => s.id === value);
      const supplierScore = selectedSupplier ? supplierScores.get(selectedSupplier.id) : null;
      
      onUpdate(item.id, {
        supplier: selectedSupplier?.supplier_name || null,
      });
      setEditing(null);
      setTempValue("");
      return;
    }

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

  function handleAutoSelectSupplier() {
    if (!recommendedSupplier) return;

    onUpdate(item.id, {
      supplier: recommendedSupplier.supplier_name
    });
  }

  function handleSupplierChange(value: string) {
    if (value === "__manual__") {
      setEditing("supplier");
      setTempValue(item.supplier || "");
    } else {
      const selectedSupplier = suppliers.find((s) => s.id === value);

      onUpdate(item.id, {
        supplier: selectedSupplier?.supplier_name || null,
      });
    }
  }

  return (
    <tr className="border-b border-slate-800/50 hover:bg-slate-900/50">
      <td className="px-4 py-3">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggleSelect}
          className="w-4 h-4 text-blue-400 rounded border-slate-700 focus:ring-2 focus:ring-blue-500"
        />
      </td>
      <td className="px-4 py-3">{item.material_name || item.description || "Item"}</td>

      <td className="px-4 py-3">
        <div className="space-y-1 text-xs text-slate-400">
          {item.supplier || "No supplier"}
          {recommendedSupplier && (
            <div className="text-blue-400">
              💡 {recommendedSupplier.supplier_name}
            </div>
          )}
          {recommendedSupplier && recommendedSupplier.id && supplierScores.has(recommendedSupplier.id) && (
            <div className="text-slate-300">
              Score {supplierScores.get(recommendedSupplier.id)!.score} · {supplierScores.get(recommendedSupplier.id)!.scoreLabel}
            </div>
          )}
        </div>
      </td>

      <td className="px-4 py-3">{item.quantity}</td>
      <td className="px-4 py-3">${item.unit_rate?.toFixed(2) || "0.00"}</td>

      <td className="px-4 py-3 text-right">
        ${(item.quantity * (item.unit_rate || 0)).toFixed(2)}
      </td>
    </tr>
  );
}

interface PurchaseOrdersListViewProps {
  purchaseOrders: PurchaseOrderWithItems[];
  loading: boolean;
  currentProjectName: string;
  onOpenPO: (poId: string) => void;
  onDeletePO: (poId: string) => void;
  onSwitchSection: (section: string) => void;
  currentSection: string;
}

function PurchaseOrdersListView({
  purchaseOrders,
  loading,
  currentProjectName,
  onOpenPO,
  onDeletePO,
  onSwitchSection,
  currentSection,
}: PurchaseOrdersListViewProps) {
  const totalPOs = purchaseOrders.length;
  const draftCount = purchaseOrders.filter((po) => po.status === "draft").length;
  const issuedCount = purchaseOrders.filter((po) => po.status === "issued").length;
  const deliveredCount = purchaseOrders.filter((po) => po.status === "delivered").length;

  function getStatusLabel(status: PurchaseOrderStatus): string {
    switch (status) {
      case "draft":
        return "Draft";
      case "issued":
        return "Issued";
      case "part_delivered":
        return "Part Delivered";
      case "delivered":
        return "Delivered";
      case "cancelled":
        return "Cancelled";
      default:
        return status;
    }
  }

  return (
    <div className="p-6">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-semibold">Purchase Orders</h1>
          {currentProjectName && (
            <div className={`mt-2 text-sm ${theme.text.muted}`}>
              Project:{" "}
              <span className={`font-semibold ${theme.text.secondary}`}>
                {currentProjectName}
              </span>
            </div>
          )}
          <p className="text-slate-400 mt-1">
            Manage purchase orders for materials and supplies
          </p>
        </div>
      </div>

      <div className="flex gap-2 mb-6 border-b border-slate-800">
        <button
          onClick={() => onSwitchSection("procurement")}
          className={
            "px-4 py-2 text-sm font-medium border-b-2 transition-colors " +
            (currentSection === "procurement"
              ? "border-blue-400 text-blue-400"
              : "border-transparent text-slate-400 hover:text-slate-300")
          }
        >
          Procurement Documents
        </button>
        <button
          onClick={() => onSwitchSection("purchase-orders")}
          className={
            "px-4 py-2 text-sm font-medium border-b-2 transition-colors " +
            (currentSection === "purchase-orders"
              ? "border-blue-400 text-blue-400"
              : "border-transparent text-slate-400 hover:text-slate-300")
          }
        >
          Purchase Orders
        </button>
      </div>

      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="rounded-xl border border-slate-800 bg-slate-900/30 p-4">
          <div className="text-xs text-slate-400">Total POs</div>
          <div className="text-2xl font-semibold mt-1">{totalPOs}</div>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/30 p-4">
          <div className="text-xs text-slate-400">Draft</div>
          <div className="text-2xl font-semibold mt-1 text-slate-300">
            {draftCount}
          </div>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/30 p-4">
          <div className="text-xs text-slate-400">Issued</div>
          <div className="text-2xl font-semibold mt-1 text-blue-400">
            {issuedCount}
          </div>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/30 p-4">
          <div className="text-xs text-slate-400">Delivered</div>
          <div className="text-2xl font-semibold mt-1 text-emerald-400">
            {deliveredCount}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/30 p-8 text-center">
          <p className="text-slate-400">Loading purchase orders...</p>
        </div>
      ) : purchaseOrders.length === 0 ? (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/30 p-8 text-center">
          <p className="text-slate-400 mb-2">No purchase orders found</p>
          <p className="text-xs text-slate-500">
            Create purchase orders from procurement documents
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {purchaseOrders.map((po) => (
            <div
              key={po.id}
              className="rounded-xl border border-slate-800 bg-slate-900/30 p-4 hover:bg-slate-900/50 transition-colors"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => onOpenPO(po.id)}
                      className="font-medium text-lg hover:text-blue-400 transition-colors text-left"
                    >
                      {po.po_number}
                    </button>
                    <span
                      className={
                        "px-2 py-0.5 rounded text-xs " +
                        (po.status === "draft"
                          ? "bg-slate-700/50 text-slate-300"
                          : po.status === "issued"
                          ? "bg-blue-900/30 border border-blue-900/50 text-blue-300"
                          : po.status === "part_delivered"
                          ? "bg-orange-900/30 border border-orange-900/50 text-orange-300"
                          : po.status === "delivered"
                          ? "bg-emerald-900/30 border border-emerald-900/50 text-emerald-300"
                          : po.status === "cancelled"
                          ? "bg-red-900/30 border border-red-900/50 text-red-300"
                          : "bg-slate-700/50 text-slate-300")
                      }
                    >
                      {getStatusLabel(po.status)}
                    </span>
                  </div>

                  <p className="text-sm text-slate-300 mt-1">{po.supplier_name}</p>
                  {po.title && (
                    <p className="text-sm text-slate-400 mt-0.5">{po.title}</p>
                  )}

                  <div className="flex items-center gap-4 mt-2 text-xs text-slate-500">
                    <span>{po.itemCount} items</span>
                    <span>•</span>
                    <span>
                      {po.issue_date
                        ? `Issued ${new Date(po.issue_date).toLocaleDateString()}`
                        : "Not issued"}
                    </span>
                    {po.itemCount > 0 && (
                      <>
                        <span>•</span>
                        <span className="text-slate-400 font-medium">
                          Total: ${po.totalValue.toLocaleString(undefined, {
                            maximumFractionDigits: 2,
                          })}
                        </span>
                      </>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => onOpenPO(po.id)}
                    className="px-3 py-1.5 rounded-lg bg-slate-800/60 hover:bg-slate-800 text-xs"
                  >
                    View
                  </button>
                  <button
                    onClick={() => onDeletePO(po.id)}
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

interface PurchaseOrderDocumentViewProps {
  purchaseOrder: PurchaseOrderWithItems;
  projectName: string;
  currentProjectName: string;
  companyName: string;
  onBack: () => void;
  onUpdate: (updates: Partial<Pick<PurchaseOrderWithItems, "status" | "issue_date" | "expected_date" | "notes">>) => void;
  onPrint: () => void;
  onReceive: (itemDeliveries: { itemId: string; deliveredQty: number }[]) => void;
}

const PO_STATUSES: PurchaseOrderStatus[] = [
  "draft",
  "issued",
  "part_delivered",
  "delivered",
  "cancelled",
];

function PurchaseOrderDocumentView({
  purchaseOrder,
  projectName,
  currentProjectName,
  companyName,
  onBack,
  onUpdate,
  onPrint,
  onReceive,
}: PurchaseOrderDocumentViewProps) {
  const [editingField, setEditingField] = useState<string | null>(null);
  const [tempValue, setTempValue] = useState<string>("");
  const [receivingMode, setReceivingMode] = useState(false);
  const [deliveryQuantities, setDeliveryQuantities] = useState<Record<string, number>>({});

  function getStatusLabel(status: PurchaseOrderStatus): string {
    switch (status) {
      case "draft":
        return "Draft";
      case "issued":
        return "Issued";
      case "part_delivered":
        return "Part Delivered";
      case "delivered":
        return "Delivered";
      case "cancelled":
        return "Cancelled";
      default:
        return status;
    }
  }

  function startEdit(field: string, currentValue: any) {
    setEditingField(field);
    setTempValue(String(currentValue || ""));
  }

  function saveEdit(field: string) {
    if (!editingField) return;
    const value = tempValue.trim();
    onUpdate({ [field]: value || null } as any);
    setEditingField(null);
  }

  function cancelEdit() {
    setEditingField(null);
    setTempValue("");
  }

  function startReceiving() {
    const initial: Record<string, number> = {};
    purchaseOrder.items.forEach((item) => {
      initial[item.id] = item.delivered_qty || 0;
    });
    setDeliveryQuantities(initial);
    setReceivingMode(true);
  }

  function cancelReceiving() {
    setReceivingMode(false);
    setDeliveryQuantities({});
  }

  function saveReceiving() {
    const deliveries = Object.entries(deliveryQuantities).map(([itemId, qty]) => ({
      itemId,
      deliveredQty: qty,
    }));
    onReceive(deliveries);
    setReceivingMode(false);
    setDeliveryQuantities({});
  }

  function updateDeliveryQty(itemId: string, qty: number) {
    setDeliveryQuantities((prev) => ({
      ...prev,
      [itemId]: qty,
    }));
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <div className="flex items-center gap-3">
              <button
                onClick={onBack}
                className="px-3 py-2 rounded-xl bg-slate-800/60 hover:bg-slate-800 text-sm"
              >
                ← Back to List
              </button>
              <h1 className="text-2xl font-semibold">{purchaseOrder.po_number}</h1>
            </div>

            {currentProjectName && (
              <div className={`mt-2 text-sm ${theme.text.muted}`}>
                Project:{" "}
                <span className={`font-semibold ${theme.text.secondary}`}>
                  {currentProjectName}
                </span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            {receivingMode ? (
              <>
                <button
                  onClick={saveReceiving}
                  className="px-3 py-2 rounded-xl bg-green-900/30 hover:bg-green-900/50 border border-green-900/50 text-green-300 text-sm"
                >
                  Save Deliveries
                </button>
                <button
                  onClick={cancelReceiving}
                  className="px-3 py-2 rounded-xl bg-slate-800/60 hover:bg-slate-800 text-sm"
                >
                  Cancel
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={startReceiving}
                  className="px-3 py-2 rounded-xl bg-emerald-900/30 hover:bg-emerald-900/50 border border-emerald-900/50 text-emerald-300 text-sm"
                >
                  Receive Materials
                </button>
                <button
                  onClick={onPrint}
                  className="px-3 py-2 rounded-xl bg-blue-900/30 hover:bg-blue-900/50 border border-blue-900/50 text-blue-300 text-sm"
                >
                  Print PO
                </button>
                <select
                  value={purchaseOrder.status}
                  onChange={(e) =>
                    onUpdate({ status: e.target.value as PurchaseOrderStatus })
                  }
                  className="px-3 py-2 rounded-xl bg-slate-800/60 border border-slate-700 text-sm"
                >
                  {PO_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {getStatusLabel(status)}
                    </option>
                  ))}
                </select>
              </>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/30 p-4 mb-6">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-xs text-slate-400 mb-1">Supplier</div>
              <div className="font-medium">{purchaseOrder.supplier_name}</div>
            </div>

            <div>
              <div className="text-xs text-slate-400 mb-1">Title</div>
              <div className="text-sm">{purchaseOrder.title}</div>
            </div>

            <div>
              <div className="text-xs text-slate-400 mb-1">Issue Date</div>
              {editingField === "issue_date" ? (
                <input
                  type="date"
                  value={tempValue}
                  onChange={(e) => setTempValue(e.target.value)}
                  onBlur={() => saveEdit("issue_date")}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") saveEdit("issue_date");
                    if (e.key === "Escape") cancelEdit();
                  }}
                  autoFocus
                  className="px-2 py-1 rounded bg-slate-800 border border-slate-700 text-sm focus:outline-none focus:border-slate-600"
                />
              ) : (
                <div
                  onClick={() =>
                    startEdit(
                      "issue_date",
                      purchaseOrder.issue_date
                        ? new Date(purchaseOrder.issue_date).toISOString().split("T")[0]
                        : ""
                    )
                  }
                  className="text-sm cursor-pointer hover:text-slate-300"
                >
                  {purchaseOrder.issue_date ? (
                    new Date(purchaseOrder.issue_date).toLocaleDateString()
                  ) : (
                    <span className="text-slate-600">Not set</span>
                  )}
                </div>
              )}
            </div>

            <div>
              <div className="text-xs text-slate-400 mb-1">Expected Date</div>
              {editingField === "expected_date" ? (
                <input
                  type="date"
                  value={tempValue}
                  onChange={(e) => setTempValue(e.target.value)}
                  onBlur={() => saveEdit("expected_date")}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") saveEdit("expected_date");
                    if (e.key === "Escape") cancelEdit();
                  }}
                  autoFocus
                  className="px-2 py-1 rounded bg-slate-800 border border-slate-700 text-sm focus:outline-none focus:border-slate-600"
                />
              ) : (
                <div
                  onClick={() =>
                    startEdit(
                      "expected_date",
                      purchaseOrder.expected_date
                        ? new Date(purchaseOrder.expected_date).toISOString().split("T")[0]
                        : ""
                    )
                  }
                  className="text-sm cursor-pointer hover:text-slate-300"
                >
                  {purchaseOrder.expected_date ? (
                    new Date(purchaseOrder.expected_date).toLocaleDateString()
                  ) : (
                    <span className="text-slate-600">Not set</span>
                  )}
                </div>
              )}
            </div>
          </div>

          {purchaseOrder.notes && (
            <div className="mt-4 pt-4 border-t border-slate-800">
              <div className="text-xs text-slate-400 mb-1">Notes</div>
              <div className="text-sm text-slate-300">{purchaseOrder.notes}</div>
            </div>
          )}
        </div>

        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="rounded-xl border border-slate-800 bg-slate-900/30 p-3">
            <div className="text-xs text-slate-400">Total Items</div>
            <div className="text-xl font-semibold mt-1">
              {purchaseOrder.itemCount}
            </div>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900/30 p-3">
            <div className="text-xs text-slate-400">Total Value</div>
            <div className="text-xl font-semibold mt-1">
              ${purchaseOrder.totalValue.toLocaleString(undefined, {
                maximumFractionDigits: 2,
              })}
            </div>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900/30 p-3">
            <div className="text-xs text-slate-400">Status</div>
            <div className="text-xl font-semibold mt-1">
              {getStatusLabel(purchaseOrder.status)}
            </div>
          </div>
        </div>
      </div>

      {purchaseOrder.items.length === 0 ? (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/30 p-8 text-center">
          <p className="text-slate-400">No items in this purchase order</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/30 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-800 bg-slate-900/50">
            <h3 className="font-semibold text-sm">Purchase Order Items</h3>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-800 text-left text-xs text-slate-400">
                  <th className="px-4 py-3 font-medium">Material</th>
                  <th className="px-4 py-3 font-medium">Ordered</th>
                  {receivingMode && (
                    <th className="px-4 py-3 font-medium">Delivered Qty</th>
                  )}
                  {!receivingMode && (
                    <>
                      <th className="px-4 py-3 font-medium">Delivered</th>
                      <th className="px-4 py-3 font-medium">Balance</th>
                    </>
                  )}
                  <th className="px-4 py-3 font-medium">Unit Rate</th>
                  <th className="px-4 py-3 font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {purchaseOrder.items.map((item) => {
                  const orderedQty = Number(item.quantity);
                  const deliveredQty = receivingMode
                    ? Number(deliveryQuantities[item.id] || 0)
                    : Number(item.delivered_qty || 0);
                  const balanceQty = orderedQty - deliveredQty;

                  return (
                    <tr
                      key={item.id}
                      className="border-b border-slate-800/50 hover:bg-slate-900/50"
                    >
                      <td className="px-4 py-3">
                        <div className="font-medium text-sm">{item.material_name}</div>
                        {item.description && (
                          <div className="text-xs text-slate-500 mt-0.5">
                            {item.description}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-sm font-medium">
                          {orderedQty.toFixed(2)}
                        </div>
                        <div className="text-xs text-slate-500">{item.unit || "-"}</div>
                      </td>
                      {receivingMode ? (
                        <td className="px-4 py-3">
                          <input
                            type="number"
                            min="0"
                            max={orderedQty}
                            step="0.01"
                            value={deliveryQuantities[item.id] || 0}
                            onChange={(e) =>
                              updateDeliveryQty(item.id, Number(e.target.value))
                            }
                            className="w-24 px-2 py-1 rounded bg-slate-800 border border-slate-700 text-sm focus:outline-none focus:border-slate-600"
                          />
                        </td>
                      ) : (
                        <>
                          <td className="px-4 py-3">
                            <div className="text-sm font-medium">
                              {deliveredQty.toFixed(2)}
                            </div>
                            <div className="text-xs text-slate-500">
                              {deliveredQty === orderedQty ? (
                                <span className="text-emerald-400">Complete</span>
                              ) : deliveredQty > 0 ? (
                                <span className="text-orange-400">Partial</span>
                              ) : (
                                <span className="text-slate-500">Pending</span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="text-sm font-medium">
                              {balanceQty.toFixed(2)}
                            </div>
                          </td>
                        </>
                      )}
                      <td className="px-4 py-3">
                        <div className="text-sm">
                          ${Number(item.unit_rate).toFixed(2)}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-sm font-medium">
                          ${Number(item.total_amount).toLocaleString(undefined, {
                            maximumFractionDigits: 2,
                          })}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-700 bg-slate-900/50">
                  <td className="px-4 py-3" colSpan={receivingMode ? 4 : 5}>
                    <div className="grid grid-cols-3 gap-6 text-sm">
                      <div>
                        <div className="text-slate-400 mb-1">PO Total</div>
                        <div className="font-semibold text-base">
                          ${purchaseOrder.totalValue.toLocaleString(undefined, {
                            maximumFractionDigits: 2,
                          })}
                        </div>
                      </div>
                      <div>
                        <div className="text-slate-400 mb-1">Delivered Value</div>
                        <div className="font-semibold text-base text-emerald-400">
                          ${(() => {
                            const deliveredValue = purchaseOrder.items.reduce((sum, item) => {
                              const deliveredQty = Number(item.delivered_qty || 0);
                              const unitRate = Number(item.unit_rate || 0);
                              return sum + (deliveredQty * unitRate);
                            }, 0);
                            return deliveredValue.toLocaleString(undefined, {
                              maximumFractionDigits: 2,
                            });
                          })()}
                        </div>
                      </div>
                      <div>
                        <div className="text-slate-400 mb-1">Remaining Value</div>
                        <div className="font-semibold text-base">
                          ${(() => {
                            const remainingValue = purchaseOrder.items.reduce((sum, item) => {
                              const orderedQty = Number(item.quantity || 0);
                              const deliveredQty = Number(item.delivered_qty || 0);
                              const balanceQty = orderedQty - deliveredQty;
                              const unitRate = Number(item.unit_rate || 0);
                              return sum + (balanceQty * unitRate);
                            }, 0);
                            return remainingValue.toLocaleString(undefined, {
                              maximumFractionDigits: 2,
                            });
                          })()}
                        </div>
                      </div>
                    </div>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
