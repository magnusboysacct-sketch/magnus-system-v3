import React from 'react';
import type { ProcurementItemWithSource } from '../types/procurement';

export function useProcurementSummary(items: ProcurementItemWithSource[]) {
  return React.useMemo(() => {
    return {
      totalItems: items.length,
      pendingCount: items.filter((i) => i.status === "pending").length,
      orderedCount: items.filter((i) => i.status === "ordered").length,
      partDeliveredCount: items.filter((i) => i.status === "part_delivered").length,
      receivedCount: items.filter((i) => i.status === "received").length,
      urgentCount: items.filter((i) => i.priority === "urgent").length,
      totalValue: items.reduce((sum, item) => {
        const quantity = item.quantity || 0;
        const unitRate = item.unit_rate || 0;
        return sum + (quantity * unitRate);
      }, 0),
    };
  }, [items]);
}
