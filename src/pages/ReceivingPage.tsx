import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useProjectContext } from "../context/ProjectContext";

type ProjectRow = {
  id: string;
  name: string | null;
};

type PurchaseOrderRow = {
  id: string;
  po_number: string | null;
  supplier_name: string | null;
  project_id: string | null;
  status: string | null;
  created_at: string | null;
};

type PurchaseOrderItemRow = {
  id: string;
  purchase_order_id: string;
  material_name: string | null;
  description: string | null;
  unit: string | null;
  quantity: number | string | null;
  delivered_qty: number | string | null;
  unit_rate: number | string | null;
  total_amount: number | string | null;
};

type ReceivingRecordRow = {
  id: string;
  purchase_order_id?: string | null;
  purchase_order_item_id?: string | null;
  received_qty?: number | string | null;
  quantity_received?: number | string | null;
  qty_received?: number | string | null;
  notes?: string | null;
  note?: string | null;
  reference_no?: string | null;
  delivery_note_no?: string | null;
  received_at?: string | null;
  created_at?: string | null;
  [key: string]: unknown;
};

type PendingPOGroup = {
  supplierName: string;
  purchaseOrders: PendingPurchaseOrder[];
};

type PendingPurchaseOrder = {
  header: PurchaseOrderRow;
  items: PurchaseOrderItemRow[];
  orderedTotal: number;
  deliveredTotal: number;
  balanceTotal: number;
  progressPct: number;
};

type SelectedReceiveInput = Record<string, string>;

function toNumber(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const cleaned = value.replace(/,/g, "").trim();
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function formatQty(value: number): string {
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 2,
  }).format(value);
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "JMD",
    maximumFractionDigits: 2,
  }).format(value || 0);
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

function getBalance(item: PurchaseOrderItemRow): number {
  return Math.max(0, toNumber(item.quantity) - toNumber(item.delivered_qty));
}

function getReceivedValue(record: ReceivingRecordRow): number {
  return Math.max(
    0,
    toNumber(record.received_qty) ||
      toNumber(record.quantity_received) ||
      toNumber(record.qty_received)
  );
}

function getRecordDate(record: ReceivingRecordRow): string | null {
  return (record.received_at as string | null) || (record.created_at as string | null) || null;
}

function getRecordNotes(record: ReceivingRecordRow): string {
  return String(record.notes || record.note || record.reference_no || record.delivery_note_no || "").trim();
}

function getHeaderStatusLabel(status: string | null | undefined): string {
  switch ((status || "").toLowerCase()) {
    case "draft":
      return "Draft";
    case "issued":
      return "Issued";
    case "part_delivered":
      return "Part Delivered";
    case "received":
      return "Received";
    case "cancelled":
      return "Cancelled";
    default:
      return status || "Unknown";
  }
}

function getHistoryQtyTone(qty: number): string {
  if (qty > 0) return "text-emerald-300";
  return "text-slate-300";
}

function getHistoryQtyLabel(qty: number, unit?: string | null): string {
  if (qty > 0) {
    return `${formatQty(qty)}${unit ? ` ${unit}` : ""} received`;
  }
  return "No quantity recorded";
}

function getHistoryBadge(qty: number): {
  text: string;
  className: string;
} {
  if (qty > 0) {
    return {
      text: "Received",
      className:
        "border-emerald-500/20 bg-emerald-500/10 text-emerald-300",
    };
  }

  return {
    text: "Log Entry",
    className:
      "border-slate-600/40 bg-slate-800/70 text-slate-300",
  };
}

export default function ReceivingPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { currentProjectId, currentProject } = useProjectContext();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrderRow[]>([]);
  const [purchaseOrderItems, setPurchaseOrderItems] = useState<PurchaseOrderItemRow[]>([]);
  const [receivingHistory, setReceivingHistory] = useState<ReceivingRecordRow[]>([]);

  const [selectedPOId, setSelectedPOId] = useState<string | null>(
    searchParams.get("poId") || searchParams.get("po") || null
  );
  const [receiveQtyByItemId, setReceiveQtyByItemId] = useState<SelectedReceiveInput>({});
  const [receiveNotes, setReceiveNotes] = useState("");

  const loadAll = useCallback(
    async (projectId: string | null | undefined) => {
      setLoading(true);
      setPageError(null);

      try {
        if (!projectId) {
          setPurchaseOrders([]);
          setPurchaseOrderItems([]);
          setReceivingHistory([]);
          return;
        }

        const poRes = await supabase
          .from("purchase_orders")
          .select("id, po_number, supplier_name, project_id, status, created_at")
          .eq("project_id", projectId)
          .order("created_at", { ascending: false });

        if (poRes.error) throw poRes.error;

        const poRows = (poRes.data || []) as PurchaseOrderRow[];
        setPurchaseOrders(poRows);

        const poIds = poRows.map((row) => row.id);

        if (poIds.length === 0) {
          setPurchaseOrderItems([]);
          setReceivingHistory([]);
          return;
        }

        const itemsRes = await supabase
          .from("purchase_order_items")
          .select(
            "id, purchase_order_id, material_name, description, unit, quantity, delivered_qty, unit_rate, total_amount"
          )
          .in("purchase_order_id", poIds);

        if (itemsRes.error) throw itemsRes.error;

        setPurchaseOrderItems((itemsRes.data || []) as PurchaseOrderItemRow[]);

        const historyRes = await supabase
          .from("receiving_records")
          .select("*")
          .in("purchase_order_id", poIds)
          .order("created_at", { ascending: false })
          .limit(200);

        if (historyRes.error) {
          console.warn("Receiving history query failed:", historyRes.error);
          setReceivingHistory([]);
        } else {
          setReceivingHistory((historyRes.data || []) as ReceivingRecordRow[]);
        }
      } catch (error: any) {
        console.error(error);
        setPageError(error?.message || "Failed to load receiving dashboard.");
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    setSelectedPOId(null);
    setReceiveQtyByItemId({});
    setReceiveNotes("");
    setSuccessMessage(null);
    loadAll(currentProjectId);
  }, [loadAll, currentProjectId]);

  useEffect(() => {
    const next = new URLSearchParams(searchParams);

    if (selectedPOId) next.set("poId", selectedPOId);
    else next.delete("poId");

    setSearchParams(next, { replace: true });
  }, [selectedPOId, searchParams, setSearchParams]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && selectedPOId) {
        setSelectedPOId(null);
        setReceiveQtyByItemId({});
        setReceiveNotes("");
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedPOId]);

  const poMap = useMemo(() => {
    const map = new Map<string, PurchaseOrderRow>();
    for (const row of purchaseOrders) map.set(row.id, row);
    return map;
  }, [purchaseOrders]);

  const itemMap = useMemo(() => {
    const map = new Map<string, PurchaseOrderItemRow>();
    for (const row of purchaseOrderItems) map.set(row.id, row);
    return map;
  }, [purchaseOrderItems]);

  const itemsByPO = useMemo(() => {
    const map = new Map<string, PurchaseOrderItemRow[]>();
    for (const item of purchaseOrderItems) {
      const arr = map.get(item.purchase_order_id) || [];
      arr.push(item);
      map.set(item.purchase_order_id, arr);
    }
    return map;
  }, [purchaseOrderItems]);

  const pendingPOs = useMemo<PendingPurchaseOrder[]>(() => {
    const rows: PendingPurchaseOrder[] = [];

    for (const header of purchaseOrders) {
      const status = (header.status || "").toLowerCase();
      if (status === "cancelled") continue;

      const items = (itemsByPO.get(header.id) || []).filter((item) => getBalance(item) > 0);
      if (items.length === 0) continue;

      const orderedTotal = items.reduce((sum, item) => sum + toNumber(item.quantity), 0);
      const deliveredTotal = items.reduce((sum, item) => sum + toNumber(item.delivered_qty), 0);
      const balanceTotal = Math.max(0, orderedTotal - deliveredTotal);
      const progressPct = orderedTotal > 0 ? Math.min(100, (deliveredTotal / orderedTotal) * 100) : 0;

      rows.push({
        header,
        items,
        orderedTotal,
        deliveredTotal,
        balanceTotal,
        progressPct,
      });
    }

    return rows.sort((a, b) => {
      const aDate = new Date(a.header.created_at || 0).getTime();
      const bDate = new Date(b.header.created_at || 0).getTime();
      return bDate - aDate;
    });
  }, [itemsByPO, purchaseOrders]);

  const pendingGroups = useMemo<PendingPOGroup[]>(() => {
    const grouped = new Map<string, PendingPurchaseOrder[]>();

    for (const po of pendingPOs) {
      const supplierName = (po.header.supplier_name || "Unknown Supplier").trim() || "Unknown Supplier";
      const arr = grouped.get(supplierName) || [];
      arr.push(po);
      grouped.set(supplierName, arr);
    }

    return Array.from(grouped.entries())
      .map(([supplierName, purchaseOrdersForSupplier]) => ({
        supplierName,
        purchaseOrders: purchaseOrdersForSupplier,
      }))
      .sort((a, b) => a.supplierName.localeCompare(b.supplierName));
  }, [pendingPOs]);

  const selectedPO = useMemo(() => {
    return purchaseOrders.find((po) => po.id === selectedPOId) || null;
  }, [purchaseOrders, selectedPOId]);

  const selectedPOItems = useMemo(() => {
    if (!selectedPOId) return [];
    return (itemsByPO.get(selectedPOId) || []).map((item) => ({
      ...item,
      ordered: toNumber(item.quantity),
      delivered: toNumber(item.delivered_qty),
      balance: getBalance(item),
      lineTotal:
        toNumber(item.total_amount) ||
        toNumber(item.quantity) * toNumber(item.unit_rate),
    }));
  }, [itemsByPO, selectedPOId]);

  const selectedPOHistory = useMemo(() => {
    if (!selectedPOId) return [];
    return receivingHistory
      .filter((row) => row.purchase_order_id === selectedPOId)
      .sort((a, b) => {
        const aDate = new Date(getRecordDate(a) || 0).getTime();
        const bDate = new Date(getRecordDate(b) || 0).getTime();
        return bDate - aDate;
      });
  }, [receivingHistory, selectedPOId]);

  const totalPendingPOs = pendingPOs.length;
  const totalPendingItems = pendingPOs.reduce((sum, po) => sum + po.items.length, 0);
  const totalPendingBalanceQty = pendingPOs.reduce((sum, po) => sum + po.balanceTotal, 0);

  const recentHistory = useMemo(() => {
    return [...receivingHistory]
      .sort((a, b) => {
        const aDate = new Date(getRecordDate(a) || 0).getTime();
        const bDate = new Date(getRecordDate(b) || 0).getTime();
        return bDate - aDate;
      })
      .slice(0, 50);
  }, [receivingHistory]);

  const itemInputMeta = useMemo(() => {
    const meta: Record<
      string,
      {
        raw: string;
        entered: number;
        balance: number;
        isOver: boolean;
      }
    > = {};

    for (const item of selectedPOItems) {
      const raw = receiveQtyByItemId[item.id] || "";
      const entered = Math.max(0, toNumber(raw));
      const balance = Math.max(0, item.balance);
      meta[item.id] = {
        raw,
        entered,
        balance,
        isOver: entered > balance,
      };
    }

    return meta;
  }, [receiveQtyByItemId, selectedPOItems]);

  const modalHasOverReceive = useMemo(() => {
    return Object.values(itemInputMeta).some((meta) => meta.isOver);
  }, [itemInputMeta]);

  const modalOverReceiveMessage = useMemo(() => {
    const firstOverItem = selectedPOItems.find((item) => itemInputMeta[item.id]?.isOver);
    if (!firstOverItem) return null;

    const meta = itemInputMeta[firstOverItem.id];
    return `Entered qty for "${firstOverItem.material_name || "item"}" is ${formatQty(
      meta.entered
    )}, but remaining balance is only ${formatQty(meta.balance)}.`;
  }, [itemInputMeta, selectedPOItems]);

  const hasAnyQtyEntered = useMemo(() => {
    return Object.values(receiveQtyByItemId).some((value) => Math.max(0, toNumber(value)) > 0);
  }, [receiveQtyByItemId]);

  function openPO(poId: string) {
    setPageError(null);
    setSuccessMessage(null);
    setSelectedPOId(poId);
    setReceiveQtyByItemId({});
    setReceiveNotes("");
  }

  function closeModal() {
    setSelectedPOId(null);
    setReceiveQtyByItemId({});
    setReceiveNotes("");
  }

  function setReceiveQty(itemId: string, value: string) {
    setReceiveQtyByItemId((prev) => ({ ...prev, [itemId]: value }));
  }

  function clampReceiveQtyOnBlur(itemId: string, balance: number) {
    setReceiveQtyByItemId((prev) => {
      const raw = prev[itemId] || "";
      if (!raw.trim()) return prev;

      const parsed = Math.max(0, toNumber(raw));
      const clamped = Math.min(parsed, Math.max(0, balance));

      if (parsed === 0) {
        return { ...prev, [itemId]: "" };
      }

      return {
        ...prev,
        [itemId]: clamped > 0 ? String(clamped) : "",
      };
    });
  }

  async function handleSaveReceiving() {
    if (!selectedPO) return;

    const lines = selectedPOItems
      .map((item) => {
        const raw = receiveQtyByItemId[item.id] || "";
        const qty = Math.max(0, toNumber(raw));
        return {
          item,
          qty,
        };
      })
      .filter((row) => row.qty > 0);

    if (lines.length === 0) {
      setPageError("Enter at least one received quantity before saving.");
      return;
    }

    const overReceived = lines.find((row) => row.qty > row.item.balance);
    if (overReceived) {
      setPageError(
        `Entered qty for "${overReceived.item.material_name || "item"}" is ${formatQty(
          overReceived.qty
        )}, but remaining balance is only ${formatQty(overReceived.item.balance)}.`
      );
      return;
    }

    setSaving(true);
    setPageError(null);
    setSuccessMessage(null);

    try {
      for (const line of lines) {
        const newDelivered = line.item.delivered + line.qty;

        const updateItemRes = await supabase
          .from("purchase_order_items")
          .update({ delivered_qty: newDelivered })
          .eq("id", line.item.id);

        if (updateItemRes.error) throw updateItemRes.error;

        const insertRecordRes = await supabase.from("receiving_records").insert({
          purchase_order_id: selectedPO.id,
          purchase_order_item_id: line.item.id,
          received_qty: line.qty,
          notes: receiveNotes || null,
        });

        if (insertRecordRes.error) {
          console.warn("receiving_records insert failed:", insertRecordRes.error);
        }
      }

      const refreshedItemsRes = await supabase
        .from("purchase_order_items")
        .select(
          "id, purchase_order_id, material_name, description, unit, quantity, delivered_qty, unit_rate, total_amount"
        )
        .eq("purchase_order_id", selectedPO.id);

      if (refreshedItemsRes.error) throw refreshedItemsRes.error;

      const refreshedItems = (refreshedItemsRes.data || []) as PurchaseOrderItemRow[];
      const orderedTotal = refreshedItems.reduce((sum, item) => sum + toNumber(item.quantity), 0);
      const deliveredTotal = refreshedItems.reduce((sum, item) => sum + toNumber(item.delivered_qty), 0);

      let nextStatus = selectedPO.status || "draft";
      if (orderedTotal > 0 && deliveredTotal <= 0) {
        nextStatus = selectedPO.status || "draft";
      } else if (orderedTotal > 0 && deliveredTotal < orderedTotal) {
        nextStatus = "part_delivered";
      } else if (orderedTotal > 0 && deliveredTotal >= orderedTotal) {
        nextStatus = "received";
      }

      const updatePoRes = await supabase
        .from("purchase_orders")
        .update({ status: nextStatus })
        .eq("id", selectedPO.id);

      if (updatePoRes.error) throw updatePoRes.error;

      setReceiveQtyByItemId({});
      setReceiveNotes("");
      await loadAll(currentProjectId);
      setSelectedPOId(selectedPO.id);
      setSuccessMessage("Receiving saved successfully.");
    } catch (error: any) {
      console.error(error);
      setPageError(error?.message || "Failed to save receiving.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-6 text-slate-100">
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Receiving</h1>
          <p className="mt-1 text-sm text-slate-400">
            Review open purchase orders, receive materials, and track receiving history.
          </p>
          <div className="mt-2 text-xs text-slate-500">
            Project: {currentProject?.name || "No project selected"}
          </div>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <button
            onClick={() => loadAll(currentProjectId)}
            className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-2 text-sm hover:bg-slate-800"
          >
            Refresh
          </button>
        </div>
      </div>

      {pageError ? (
        <div className="mb-4 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {pageError}
        </div>
      ) : null}

      {successMessage ? (
        <div className="mb-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
          {successMessage}
        </div>
      ) : null}

      {!currentProjectId ? (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-10 text-center text-sm text-slate-400">
          Select a project from the global Project Context to view receiving.
        </div>
      ) : (
        <>
          <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
              <div className="text-xs uppercase tracking-wide text-slate-400">Pending POs</div>
              <div className="mt-2 text-3xl font-semibold">{loading ? "—" : totalPendingPOs}</div>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
              <div className="text-xs uppercase tracking-wide text-slate-400">Pending Items</div>
              <div className="mt-2 text-3xl font-semibold">{loading ? "—" : totalPendingItems}</div>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
              <div className="text-xs uppercase tracking-wide text-slate-400">Balance Qty</div>
              <div className="mt-2 text-3xl font-semibold">
                {loading ? "—" : formatQty(totalPendingBalanceQty)}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <section className="rounded-2xl border border-slate-800 bg-slate-900/70">
              <div className="border-b border-slate-800 px-5 py-4">
                <h2 className="text-lg font-semibold">Pending Deliveries</h2>
                <p className="mt-1 text-sm text-slate-400">
                  Includes draft, issued, and part-delivered purchase orders with remaining balance.
                </p>
              </div>

              <div className="p-5">
                {loading ? (
                  <div className="py-10 text-center text-sm text-slate-400">Loading pending deliveries...</div>
                ) : pendingGroups.length === 0 ? (
                  <div className="py-10 text-center text-sm text-slate-400">
                    No pending deliveries found for the current project.
                  </div>
                ) : (
                  <div className="space-y-5">
                    {pendingGroups.map((group) => (
                      <div key={group.supplierName} className="rounded-2xl border border-slate-800 bg-slate-950/50">
                        <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
                          <div>
                            <div className="font-medium">{group.supplierName}</div>
                            <div className="text-xs text-slate-400">
                              {group.purchaseOrders.length} pending PO{group.purchaseOrders.length === 1 ? "" : "s"}
                            </div>
                          </div>
                        </div>

                        <div className="divide-y divide-slate-800">
                          {group.purchaseOrders.map((po) => (
                            <button
                              key={po.header.id}
                              type="button"
                              onClick={() => openPO(po.header.id)}
                              className={`w-full px-4 py-4 text-left transition hover:bg-slate-800/40 ${
                                selectedPOId === po.header.id ? "bg-slate-800/40" : ""
                              }`}
                            >
                              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                                <div>
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="text-sm font-semibold">
                                      {po.header.po_number || "Unnamed PO"}
                                    </span>
                                    <span className="rounded-full border border-slate-700 px-2 py-0.5 text-[11px] text-slate-300">
                                      {getHeaderStatusLabel(po.header.status)}
                                    </span>
                                  </div>
                                  <div className="mt-1 text-xs text-slate-400">
                                    Created {formatDate(po.header.created_at)}
                                  </div>
                                </div>

                                <div className="grid grid-cols-3 gap-4 text-xs text-slate-300 lg:min-w-[320px]">
                                  <div>
                                    <div className="text-slate-500">Ordered</div>
                                    <div className="mt-1 text-sm font-medium">{formatQty(po.orderedTotal)}</div>
                                  </div>
                                  <div>
                                    <div className="text-slate-500">Delivered</div>
                                    <div className="mt-1 text-sm font-medium">{formatQty(po.deliveredTotal)}</div>
                                  </div>
                                  <div>
                                    <div className="text-slate-500">Balance</div>
                                    <div className="mt-1 text-sm font-medium">{formatQty(po.balanceTotal)}</div>
                                  </div>
                                </div>
                              </div>

                              <div className="mt-3">
                                <div className="mb-1 flex items-center justify-between text-[11px] text-slate-400">
                                  <span>Progress</span>
                                  <span>{po.progressPct.toFixed(0)}%</span>
                                </div>
                                <div className="h-2 overflow-hidden rounded-full bg-slate-800">
                                  <div
                                    className="h-full rounded-full bg-cyan-500"
                                    style={{ width: `${po.progressPct}%` }}
                                  />
                                </div>
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>

            <section className="rounded-2xl border border-slate-800 bg-slate-900/70">
              <div className="border-b border-slate-800 px-5 py-4">
                <h2 className="text-lg font-semibold">Receiving History</h2>
                <p className="mt-1 text-sm text-slate-400">
                  Most recent receiving activity from existing receiving records.
                </p>
              </div>

              <div className="p-5">
                {loading ? (
                  <div className="py-10 text-center text-sm text-slate-400">Loading history...</div>
                ) : recentHistory.length === 0 ? (
                  <div className="py-10 text-center text-sm text-slate-400">
                    No receiving history found yet.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {recentHistory.map((record) => {
                      const po = record.purchase_order_id ? poMap.get(record.purchase_order_id) : undefined;
                      const item = record.purchase_order_item_id ? itemMap.get(record.purchase_order_item_id) : undefined;
                      const qty = getReceivedValue(record);
                      const badge = getHistoryBadge(qty);
                      const notes = getRecordNotes(record);

                      return (
                        <button
                          key={record.id}
                          type="button"
                          onClick={() => {
                            if (record.purchase_order_id) openPO(record.purchase_order_id);
                          }}
                          className="w-full rounded-2xl border border-slate-800 bg-slate-950/50 p-4 text-left transition hover:bg-slate-800/40"
                        >
                          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-sm font-semibold">
                                  {po?.po_number || "Purchase Order"}
                                </span>
                                <span
                                  className={`rounded-full border px-2 py-0.5 text-[11px] ${badge.className}`}
                                >
                                  {badge.text}
                                </span>
                              </div>

                              <div className="mt-2 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
                                <div>
                                  <div className="text-[11px] uppercase tracking-wide text-slate-500">
                                    Supplier
                                  </div>
                                  <div className="mt-0.5 truncate text-slate-300">
                                    {po?.supplier_name || "Unknown Supplier"}
                                  </div>
                                </div>

                                <div>
                                  <div className="text-[11px] uppercase tracking-wide text-slate-500">
                                    Item
                                  </div>
                                  <div className="mt-0.5 truncate text-slate-300">
                                    {item?.material_name || item?.description || "Receiving entry"}
                                  </div>
                                </div>
                              </div>

                              {notes ? (
                                <div className="mt-3 rounded-xl border border-slate-800 bg-slate-900/50 px-3 py-2">
                                  <div className="text-[11px] uppercase tracking-wide text-slate-500">
                                    Notes / Reference
                                  </div>
                                  <div className="mt-1 text-xs text-slate-300">{notes}</div>
                                </div>
                              ) : null}
                            </div>

                            <div className="shrink-0 lg:min-w-[180px] lg:text-right">
                              <div className="text-[11px] uppercase tracking-wide text-slate-500">
                                Quantity
                              </div>
                              <div className={`mt-1 text-sm font-semibold ${getHistoryQtyTone(qty)}`}>
                                {getHistoryQtyLabel(qty, item?.unit)}
                              </div>
                              <div className="mt-2 text-[11px] uppercase tracking-wide text-slate-500">
                                Logged
                              </div>
                              <div className="mt-1 text-xs text-slate-400">
                                {formatDate(getRecordDate(record))}
                              </div>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </section>
          </div>
        </>
      )}

      {selectedPO ? (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-slate-950/75 p-4 backdrop-blur-sm"
          onClick={closeModal}
        >
          <div
            className="mt-4 flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b border-slate-800 px-5 py-4">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-semibold">
                    {selectedPO.po_number || "Unnamed PO"}
                  </h2>
                  <span className="rounded-full border border-slate-700 px-2 py-0.5 text-[11px] text-slate-300">
                    {getHeaderStatusLabel(selectedPO.status)}
                  </span>
                </div>
                <div className="mt-1 text-sm text-slate-400">
                  Supplier: {selectedPO.supplier_name || "Unknown Supplier"}
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  Created {formatDate(selectedPO.created_at)}
                </div>
              </div>

              <div className="flex shrink-0 gap-2">
                <button
                  onClick={() => navigate(`/purchase-orders?poId=${selectedPO.id}`)}
                  className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm hover:bg-slate-800"
                >
                  Open PO
                </button>
                <button
                  onClick={closeModal}
                  className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm hover:bg-slate-800"
                >
                  Close
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-5">
              <div className="space-y-5">
                {modalHasOverReceive && modalOverReceiveMessage ? (
                  <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
                    {modalOverReceiveMessage}
                  </div>
                ) : null}

                <div className="overflow-hidden rounded-2xl border border-slate-800">
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead className="bg-slate-950/70 text-left text-slate-400">
                        <tr>
                          <th className="px-4 py-3 font-medium">Material</th>
                          <th className="px-4 py-3 font-medium">Unit</th>
                          <th className="px-4 py-3 font-medium">Ordered</th>
                          <th className="px-4 py-3 font-medium">Delivered</th>
                          <th className="px-4 py-3 font-medium">Balance</th>
                          <th className="px-4 py-3 font-medium">Receive Now</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800">
                        {selectedPOItems.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                              No line items found for this purchase order.
                            </td>
                          </tr>
                        ) : (
                          selectedPOItems.map((item) => {
                            const meta = itemInputMeta[item.id] || {
                              raw: "",
                              entered: 0,
                              balance: item.balance,
                              isOver: false,
                            };

                            return (
                              <tr key={item.id} className="bg-slate-900/30">
                                <td className="px-4 py-3 align-top">
                                  <div className="font-medium text-slate-100">
                                    {item.material_name || "Unnamed Material"}
                                  </div>
                                  {item.description ? (
                                    <div className="mt-1 text-xs text-slate-400">{item.description}</div>
                                  ) : null}
                                  {(item.lineTotal || 0) > 0 ? (
                                    <div className="mt-1 text-xs text-slate-500">
                                      Line Total: {formatMoney(item.lineTotal)}
                                    </div>
                                  ) : null}
                                </td>
                                <td className="px-4 py-3 text-slate-300">{item.unit || "—"}</td>
                                <td className="px-4 py-3 text-slate-300">{formatQty(item.ordered)}</td>
                                <td className="px-4 py-3 text-slate-300">{formatQty(item.delivered)}</td>
                                <td className="px-4 py-3">
                                  <span
                                    className={
                                      item.balance > 0 ? "font-medium text-amber-300" : "font-medium text-emerald-300"
                                    }
                                  >
                                    {formatQty(item.balance)}
                                  </span>
                                </td>
                                <td className="px-4 py-3">
                                  <div className="space-y-1.5">
                                    <input
                                      type="number"
                                      min="0"
                                      step="0.01"
                                      disabled={item.balance <= 0 || saving}
                                      value={receiveQtyByItemId[item.id] || ""}
                                      onChange={(e) => setReceiveQty(item.id, e.target.value)}
                                      onBlur={() => clampReceiveQtyOnBlur(item.id, item.balance)}
                                      placeholder={item.balance > 0 ? `Max ${formatQty(item.balance)}` : "Complete"}
                                      className={`w-32 rounded-xl border bg-slate-950 px-3 py-2 text-sm outline-none ${
                                        meta.isOver
                                          ? "border-amber-500/70 text-amber-100"
                                          : "border-slate-700"
                                      }`}
                                    />

                                    <div className="text-[11px] text-slate-400">
                                      Remaining: {formatQty(item.balance)}
                                    </div>

                                    {meta.entered > 0 ? (
                                      meta.isOver ? (
                                        <div className="text-[11px] text-amber-300">
                                          Entered {formatQty(meta.entered)} — exceeds balance by{" "}
                                          {formatQty(meta.entered - meta.balance)}
                                        </div>
                                      ) : (
                                        <div className="text-[11px] text-emerald-300">
                                          After save: {formatQty(Math.max(0, meta.balance - meta.entered))} remaining
                                        </div>
                                      )
                                    ) : null}

                                    {item.balance <= 0 ? (
                                      <div className="text-[11px] text-emerald-300">Fully received</div>
                                    ) : null}
                                  </div>
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4">
                  <label className="mb-2 block text-sm font-medium text-slate-300">Receiving Notes</label>
                  <textarea
                    value={receiveNotes}
                    onChange={(e) => setReceiveNotes(e.target.value)}
                    rows={3}
                    placeholder="Optional note, delivery note number, truck info, or remarks..."
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none"
                  />

                  <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="text-xs text-slate-400">
                      {modalHasOverReceive
                        ? "One or more entered quantities are above the remaining balance. Adjust them before saving."
                        : hasAnyQtyEntered
                        ? "Saving receiving updates will increase delivered quantities and append receiving records."
                        : "Enter quantities to receive. Values above balance will be highlighted and clamped on blur."}
                    </div>

                    <button
                      onClick={handleSaveReceiving}
                      disabled={saving || modalHasOverReceive}
                      className="rounded-xl bg-cyan-600 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-500 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {saving ? "Saving..." : "Save Receiving"}
                    </button>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4">
                  <div className="mb-3 text-sm font-medium text-slate-300">PO Receiving History</div>
                  {selectedPOHistory.length === 0 ? (
                    <div className="text-sm text-slate-400">No receiving records yet for this PO.</div>
                  ) : (
                    <div className="space-y-3">
                      {selectedPOHistory.map((record) => {
                        const item = record.purchase_order_item_id
                          ? itemMap.get(record.purchase_order_item_id)
                          : undefined;
                        const qty = getReceivedValue(record);
                        const badge = getHistoryBadge(qty);
                        const notes = getRecordNotes(record);

                        return (
                          <div key={record.id} className="rounded-xl border border-slate-800 bg-slate-900/40 p-3">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <div className="text-sm font-medium text-slate-100">
                                    {item?.material_name || item?.description || "Receiving entry"}
                                  </div>
                                  <span
                                    className={`rounded-full border px-2 py-0.5 text-[11px] ${badge.className}`}
                                  >
                                    {badge.text}
                                  </span>
                                </div>

                                {notes ? (
                                  <div className="mt-2 text-xs text-slate-400">{notes}</div>
                                ) : (
                                  <div className="mt-2 text-xs text-slate-500">
                                    No notes or reference entered.
                                  </div>
                                )}
                              </div>

                              <div className="shrink-0 text-left sm:text-right">
                                <div className="text-[11px] uppercase tracking-wide text-slate-500">
                                  Quantity
                                </div>
                                <div className={`mt-1 text-sm font-semibold ${getHistoryQtyTone(qty)}`}>
                                  {getHistoryQtyLabel(qty, item?.unit)}
                                </div>
                                <div className="mt-2 text-xs text-slate-400">
                                  {formatDate(getRecordDate(record))}
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}