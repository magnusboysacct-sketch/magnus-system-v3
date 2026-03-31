import React from 'react';
import type { ProcurementItemWithSource } from '../types/procurement';

export function useProcurementFilters(
  items: ProcurementItemWithSource[],
  searchText: string,
  filterStatus: string,
  filterPriority: string,
  filterSupplier: string
) {
  const itemSuppliers = React.useMemo(() => 
    Array.from(
      new Set(items.map((i) => i.supplier).filter((s): s is string => Boolean(s)))
    ).sort(),
    [items]
  );

  const filteredItems = React.useMemo(() => {
    let filtered = items;

    if (searchText.trim()) {
      const search = searchText.toLowerCase();
      filtered = filtered.filter(
        (item) =>
          item.material_name.toLowerCase().includes(search) ||
          item.description?.toLowerCase().includes(search) ||
          item.category?.toLowerCase().includes(search)
      );
    }

    if (filterStatus !== "all") {
      filtered = filtered.filter((item) => item.status === filterStatus);
    }

    if (filterPriority !== "all") {
      filtered = filtered.filter((item) => (item.priority || "normal") === filterPriority);
    }

    if (filterSupplier !== "all") {
      filtered = filtered.filter((item) => item.supplier === filterSupplier);
    }

    return filtered;
  }, [items, searchText, filterStatus, filterPriority, filterSupplier]);

  const groupedItems = React.useMemo(() => 
    filteredItems.reduce((acc, item) => {
      const category = item.category || "Uncategorized";
      if (!acc[category]) {
        acc[category] = [];
      }
      acc[category].push(item);
      return acc;
    }, {} as Record<string, ProcurementItemWithSource[]>),
    [filteredItems]
  );

  return {
    itemSuppliers,
    filteredItems,
    groupedItems,
  };
}
