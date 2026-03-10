// Procurement Workflow Control Helpers
// Provides status management, labels, and calculation helpers for the procurement system

// Item status progression: pending → requested → quoted → approved → ordered → part_delivered → received
// Can also transition to cancelled at any point
export const PROCUREMENT_ITEM_STATUSES = [
  "pending",
  "requested",
  "quoted",
  "approved",
  "ordered",
  "part_delivered",
  "received",
  "cancelled",
] as const;

export type ProcurementItemStatus = typeof PROCUREMENT_ITEM_STATUSES[number];

// Document workflow: draft → approved → sent → completed
// Can also transition to cancelled at any point
export const PROCUREMENT_HEADER_STATUSES = [
  "draft",
  "approved",
  "sent",
  "completed",
  "cancelled",
] as const;

export type ProcurementHeaderStatus = typeof PROCUREMENT_HEADER_STATUSES[number];

// Priority levels for procurement items
export const PROCUREMENT_PRIORITIES = [
  "low",
  "normal",
  "high",
  "urgent",
] as const;

export type ProcurementPriority = typeof PROCUREMENT_PRIORITIES[number];

// Human-readable labels for item statuses
export function getItemStatusLabel(status: ProcurementItemStatus): string {
  const labels: Record<ProcurementItemStatus, string> = {
    pending: "Pending",
    requested: "Requested",
    quoted: "Quoted",
    approved: "Approved",
    ordered: "Ordered",
    part_delivered: "Partially Delivered",
    received: "Received",
    cancelled: "Cancelled",
  };
  return labels[status] || status;
}

// Human-readable labels for header statuses
export function getHeaderStatusLabel(status: ProcurementHeaderStatus): string {
  const labels: Record<ProcurementHeaderStatus, string> = {
    draft: "Draft",
    approved: "Approved",
    sent: "Sent",
    completed: "Completed",
    cancelled: "Cancelled",
  };
  return labels[status] || status;
}

// Human-readable labels for priorities
export function getPriorityLabel(priority: ProcurementPriority): string {
  const labels: Record<ProcurementPriority, string> = {
    low: "Low",
    normal: "Normal",
    high: "High",
    urgent: "Urgent",
  };
  return labels[priority] || priority;
}

// Calculate remaining quantity to be delivered
export function calculateBalanceQty(quantity: number, deliveredQty: number): number {
  const balance = quantity - deliveredQty;
  return Math.max(balance, 0);
}

// Calculate total cost for an item
export function calculateItemTotal(orderedQty: number, unitRate: number): number {
  return orderedQty * unitRate;
}

// Auto-normalize item status based on quantity states
// This ensures status stays consistent with actual delivery progress
export function normalizeItemStatus(
  currentStatus: ProcurementItemStatus,
  quantity: number,
  deliveredQty: number,
  orderedQty: number
): ProcurementItemStatus {
  // If cancelled, always keep cancelled
  if (currentStatus === "cancelled") {
    return "cancelled";
  }

  // If fully delivered
  if (deliveredQty >= quantity && quantity > 0) {
    return "received";
  }

  // If partially delivered
  if (deliveredQty > 0 && deliveredQty < quantity) {
    return "part_delivered";
  }

  // If ordered but not delivered
  if (orderedQty > 0 && deliveredQty === 0) {
    return "ordered";
  }

  // Otherwise keep current status or default to pending
  return currentStatus || "pending";
}
