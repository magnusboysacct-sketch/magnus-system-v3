import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  fetchProcurementItems,
  updateProcurementItemStatus,
  deleteProcurementItem,
} from "../lib/procurement";
import type { ProcurementItemWithSource } from "../lib/procurement";
import { createProjectCost } from "../lib/costs";

export default function ProcurementPage() {
  const { projectId } = useParams<{ projectId?: string }>();
  const nav = useNavigate();
  const [items, setItems] = useState<ProcurementItemWithSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>("all");

  useEffect(() => {
    if (projectId) {
      loadProcurementItems();
    }
  }, [projectId]);

  async function loadProcurementItems() {
    if (!projectId) return;

    setLoading(true);
    try {
      const result = await fetchProcurementItems(projectId);
      if (result.success) {
        setItems(result.data);
      }
    } catch (e) {
      console.error("Failed to load procurement items:", e);
    } finally {
      setLoading(false);
    }
  }

  async function handleStatusChange(
    itemId: string,
    status: "pending" | "ordered" | "received"
  ) {
    const item = items.find((i) => i.id === itemId);
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
      setItems((prev) =>
        prev.map((i) => (i.id === itemId ? { ...i, status } : i))
      );
    } else {
      alert("Failed to update status");
    }
  }

  async function handleDelete(itemId: string) {
    if (!window.confirm("Delete this procurement item?")) return;

    const result = await deleteProcurementItem(itemId);
    if (result.success) {
      setItems((prev) => prev.filter((item) => item.id !== itemId));
    } else {
      alert("Failed to delete item");
    }
  }

  const filteredItems =
    filterStatus === "all"
      ? items
      : items.filter((item) => item.status === filterStatus);

  const groupedItems = filteredItems.reduce((acc, item) => {
    const category = item.category || "Uncategorized";
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(item);
    return acc;
  }, {} as Record<string, ProcurementItemWithSource[]>);

  const totalItems = items.length;
  const pendingCount = items.filter((i) => i.status === "pending").length;
  const orderedCount = items.filter((i) => i.status === "ordered").length;
  const receivedCount = items.filter((i) => i.status === "received").length;

  if (!projectId) {
    return (
      <div className="p-6">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/30 p-8 text-center">
          <p className="text-slate-400">
            Please select a project to view procurement items
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

  return (
    <div className="p-6">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-semibold">Procurement</h1>
          <p className="text-slate-400 mt-1">
            Materials generated from BOQ items
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => nav(`/projects/${projectId}/boq`)}
            className="px-3 py-2 rounded-xl bg-slate-800/60 hover:bg-slate-800 text-sm"
          >
            Back to BOQ
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

      {loading ? (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/30 p-8 text-center">
          <p className="text-slate-400">Loading procurement items...</p>
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/30 p-8 text-center">
          <p className="text-slate-400 mb-2">No procurement items found</p>
          <p className="text-xs text-slate-500">
            Generate procurement items from the BOQ page
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(groupedItems).map(([category, categoryItems]) => (
            <div
              key={category}
              className="rounded-2xl border border-slate-800 bg-slate-900/30 overflow-hidden"
            >
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
                      <th className="px-4 py-3 font-medium">Quantity</th>
                      <th className="px-4 py-3 font-medium">Unit</th>
                      <th className="px-4 py-3 font-medium">Source BOQ Item</th>
                      <th className="px-4 py-3 font-medium">Status</th>
                      <th className="px-4 py-3 font-medium">Actions</th>
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
                          {item.notes && (
                            <div className="text-xs text-slate-500 mt-0.5">
                              {item.notes}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          {Number(item.quantity).toFixed(2)}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-400">
                          {item.unit || "-"}
                        </td>
                        <td className="px-4 py-3">
                          {item.source_item ? (
                            <div>
                              <div className="text-sm">{item.source_item}</div>
                              {item.source_description && (
                                <div className="text-xs text-slate-500">
                                  {item.source_description}
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="text-sm text-slate-500">-</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <select
                            value={item.status}
                            onChange={(e) =>
                              handleStatusChange(
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
                        <td className="px-4 py-3">
                          <button
                            onClick={() => handleDelete(item.id)}
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
          ))}
        </div>
      )}
    </div>
  );
}
