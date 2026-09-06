// src/components/common/CostItemPicker.tsx — "Select Item from Rate Library" modal
//
// Extracted from AssembliesPage.tsx's inline item-search modal (search + filtered
// list of cost_items, click a row to select) so it can be reused anywhere a real
// Rate Library item needs to be picked — AssembliesPage.tsx's own component editor
// and AssemblyWizard.tsx's review step, at minimum. Behavior is unchanged from the
// original inline version; only the search/filter state moved inside this
// component instead of living on the parent page.
import React, { useMemo, useState } from "react";
import { Search, X, Package, ChevronRight } from "lucide-react";

export interface CostItem {
  id: string;
  item_name: string;
  unit: string | null;
  category: string | null;
  item_type: string | null;
  variant: string | null;
}

interface CostItemPickerProps {
  costItems: CostItem[];
  onSelect: (item: CostItem) => void;
  onClose: () => void;
}

export default function CostItemPicker({ costItems, onSelect, onClose }: CostItemPickerProps) {
  const [itemSearch, setItemSearch] = useState("");

  const filteredItems = useMemo(() => {
    const q = itemSearch.trim().toLowerCase();
    return !q ? costItems.slice(0, 30) : costItems.filter(i =>
      i.item_name.toLowerCase().includes(q) || (i.category || "").toLowerCase().includes(q)
    ).slice(0, 40);
  }, [costItems, itemSearch]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-xl rounded-2xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#0d1117] shadow-2xl max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-white/[0.07]">
          <div>
            <div className="text-sm font-bold text-slate-900 dark:text-slate-100">Select Item from Rate Library</div>
            <div className="text-[11px] text-slate-500 mt-0.5">{costItems.length} items available</div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-200 dark:bg-white/[0.06] text-slate-500 hover:text-slate-700 dark:text-slate-300 transition"><X size={15}/></button>
        </div>
        <div className="px-5 pt-4 pb-3 border-b border-slate-200 dark:border-white/[0.06]">
          <div className="relative">
            <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-600 pointer-events-none"/>
            <input autoFocus value={itemSearch} onChange={e => setItemSearch(e.target.value)}
              placeholder="Search items…"
              className="w-full bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] rounded-lg pl-8 pr-3 py-2.5 text-sm text-slate-800 dark:text-slate-200 placeholder:text-slate-500 dark:text-slate-600 outline-none focus:border-purple-500/50"/>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {filteredItems.map(i => (
            <button key={i.id} onClick={() => onSelect(i)}
              className="w-full text-left px-5 py-3 border-b border-slate-100 dark:border-white/[0.04] last:border-0 hover:bg-slate-50 dark:bg-white/[0.04] transition flex items-center gap-3">
              <div className="w-7 h-7 rounded-lg bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.07] flex items-center justify-center flex-shrink-0">
                <Package size={12} className="text-slate-500 dark:text-slate-600"/>
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-slate-800 dark:text-slate-200 truncate">{i.item_name}</div>
                <div className="text-[10px] text-slate-500 dark:text-slate-600">{i.category || "—"}{i.unit ? ` · ${i.unit}` : ""}{i.variant ? ` · ${i.variant}` : ""}</div>
              </div>
              <ChevronRight size={13} className="text-slate-400 dark:text-slate-700 flex-shrink-0"/>
            </button>
          ))}
          {filteredItems.length === 0 && (
            <div className="text-center py-10 text-slate-500 dark:text-slate-600 text-sm">No items match your search</div>
          )}
        </div>
      </div>
    </div>
  );
}
