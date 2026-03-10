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

export default function ProcurementPage() {
  const { projectId } = useParams<{ projectId?: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const nav = useNavigate();

  const viewMode = searchParams.get("view") || "list";
  const documentId = searchParams.get("doc") || null;
  const section = searchParams.get("section") || "procurement";

  const [headers, setHeaders] = useState<ProcurementHeaderWithItems[]>([]);
  const [currentDocument, setCurrentDocument] =
    useState<ProcurementHeaderWithItems | null>(null);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrderWithItems[]>([]);
  const [currentPO, setCurrentPO] = useState<PurchaseOrderWithItems | null>(null);
  const [loading, setLoading] = useState(true);
  const [projectName, setProjectName] = useState<string>("");
  const [companyName, setCompanyName] = useState<string>("");

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
  }, [projectId, viewMode, documentId, section]);

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

  function handlePrintPO() {
    if (!currentPO) return;

    printPurchaseOrder({
      purchaseOrder: currentPO,
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
        onOpenDocument={openDocument}
        onDeleteDocument={handleDeleteDocument}
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
  onOpenDocument: (docId: string) => void;
  onDeleteDocument: (docId: string) => void;
  onNavigate: (path: string) => void;
  onSwitchSection: (section: string) => void;
  currentSection: string;
}

function ListView({
  headers,
  loading,
  projectId,
  onOpenDocument,
  onDeleteDocument,
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
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [creatingPOs, setCreatingPOs] = useState(false);

  useEffect(() => {
    loadSuppliers();
  }, []);

  async function loadSuppliers() {
    try {
      const data = await listSuppliers();
      setSuppliers(data.filter(s => s.is_active));
    } catch (err) {
      console.error("Failed to load suppliers:", err);
    }
  }

  // Get unique suppliers from items (for filtering)
  const itemSuppliers = Array.from(
    new Set(document.items.map((i) => i.supplier).filter((s): s is string => Boolean(s)))
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
      const supplierName = item.supplier!;
      if (!acc[supplierName]) {
        acc[supplierName] = [];
      }
      acc[supplierName].push(item);
      return acc;
    }, {} as Record<string, ProcurementItemWithSource[]>);

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

      for (const [supplierName, items] of Object.entries(groupedBySupplier)) {
        try {
          const poNumber = await generatePONumber(userProfile.company_id);

          const supplier = suppliers.find((s) => s.supplier_name === supplierName);

          const result = await createPurchaseOrderFromProcurementItems({
            project_id: projectId,
            supplier_id: supplier?.id || null,
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
  suppliers: Supplier[];
  selected: boolean;
  onToggleSelect: () => void;
  onUpdate: (itemId: string, updates: Partial<ProcurementItem>) => void;
  onDelete: (itemId: string) => void;
}

function ItemRow({ item, suppliers, selected, onToggleSelect, onUpdate, onDelete }: ItemRowProps) {
  const [editing, setEditing] = useState<string | null>(null);
  const [tempValue, setTempValue] = useState<string>("");

  const balanceQty = calculateBalanceQty(item.quantity, item.delivered_qty || 0);
  const totalCost = calculateItemTotal(item.ordered_qty || 0, item.unit_rate || 0);

  // Check if current supplier exists in directory
  const isSupplierInDirectory = item.supplier && suppliers.some(s => s.supplier_name === item.supplier);

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

  function handleSupplierChange(supplierName: string) {
    if (supplierName === "__manual__") {
      setEditing("supplier");
      setTempValue(item.supplier || "");
    } else {
      onUpdate(item.id, { supplier: supplierName });
    }
  }

  return (
    <tr className="border-b border-slate-800/50 hover:bg-slate-900/50">
      <td className="px-4 py-3">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggleSelect}
          className="rounded border-slate-700 bg-slate-800"
        />
      </td>
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
          <select
            value={isSupplierInDirectory ? item.supplier || "" : "__manual__"}
            onChange={(e) => handleSupplierChange(e.target.value)}
            className="w-full px-2 py-1 rounded bg-slate-800 border border-slate-700 text-xs focus:outline-none focus:border-slate-600"
          >
            <option value="">-- Select Supplier --</option>
            {suppliers.map((supplier) => (
              <option key={supplier.id} value={supplier.supplier_name}>
                {supplier.supplier_name}
              </option>
            ))}
            {item.supplier && !isSupplierInDirectory && (
              <option value="__manual__">{item.supplier} (custom)</option>
            )}
            <option value="__manual__">Other / Manual...</option>
          </select>
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

interface PurchaseOrdersListViewProps {
  purchaseOrders: PurchaseOrderWithItems[];
  loading: boolean;
  onOpenPO: (poId: string) => void;
  onDeletePO: (poId: string) => void;
  onSwitchSection: (section: string) => void;
  currentSection: string;
}

function PurchaseOrdersListView({
  purchaseOrders,
  loading,
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
          <div className="flex items-center gap-3">
            <button
              onClick={onBack}
              className="px-3 py-2 rounded-xl bg-slate-800/60 hover:bg-slate-800 text-sm"
            >
              ← Back to List
            </button>
            <h1 className="text-2xl font-semibold">{purchaseOrder.po_number}</h1>
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
                  <td className="px-4 py-3 text-sm font-semibold" colSpan={3}>
                    Total
                  </td>
                  <td className="px-4 py-3 text-sm font-semibold">
                    ${purchaseOrder.totalValue.toLocaleString(undefined, {
                      maximumFractionDigits: 2,
                    })}
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
