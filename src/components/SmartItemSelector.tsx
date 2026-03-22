import React, { useState, useEffect, useMemo } from 'react';
import { X, Search, ChevronRight, Check } from 'lucide-react';
import { supabase } from '../lib/supabase';

export interface SmartItemSelection {
  type: string;
  category: string;
  item: string;
  variant: string;
  costItemId: string | null;
  itemName: string;
  unit: string;
  currentRate: number | null;
}

interface CostItemRow {
  id: string;
  item_name: string;
  category: string | null;
  item_group: string | null;
  material_type: string | null;
  use_type: string | null;
  item_size: string | null;
  variant_code: string | null;
  variant: string | null;
  unit: string | null;
  current_rate: number | null;
  item_type: string | null;
}

interface SmartItemSelectorProps {
  companyId: string;
  onSelect: (selection: SmartItemSelection) => void;
  onCancel: () => void;
  initialSelection?: Partial<SmartItemSelection>;
  title?: string;
}

type SelectionStep = 'type' | 'category' | 'item' | 'variant' | 'confirm';

export function SmartItemSelector({
  companyId,
  onSelect,
  onCancel,
  initialSelection,
  title = 'Select Item',
}: SmartItemSelectorProps) {
  const [step, setStep] = useState<SelectionStep>('type');
  const [items, setItems] = useState<CostItemRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const [selection, setSelection] = useState({
    type: '',
    category: '',
    item: '',
    variant: '',
  });

  useEffect(() => {
    loadItems();
  }, [companyId]);

  async function loadItems() {
    try {
      const { data, error } = await supabase
        .from('v_cost_items_current')
        .select(
          'id, item_name, category, item_group, material_type, use_type, item_size, variant_code, variant, unit, current_rate, item_type'
        )
        .eq('company_id', companyId)
        .eq('is_active', true)
        .order('item_name');

      if (error) throw error;
      setItems((data as CostItemRow[]) || []);
    } catch (err) {
      console.error('Error loading items:', err);
    } finally {
      setLoading(false);
    }
  }

  // Helper functions to get unique values
  function uniqSorted(arr: string[]): string[] {
    return Array.from(new Set(arr)).sort();
  }

  // Type options (Material, Labor, Equipment, etc.)
  const typeOptions = useMemo(() => {
    const discovered = items
      .map((r) => (r.item_type ?? '').trim())
      .filter(Boolean);
    const common = ['Material', 'Labor', 'Equipment', 'Subcontract', 'Other'];
    return uniqSorted([...common, ...discovered]);
  }, [items]);

  // Items filtered by type
  function itemsForType(type: string) {
    if (!type) return items;
    return items.filter(
      (r) => (r.item_type ?? '').toLowerCase() === type.toLowerCase()
    );
  }

  // Category options for selected type
  const categoryOptions = useMemo(() => {
    if (!selection.type) return [];
    return uniqSorted(
      itemsForType(selection.type)
        .map((r) => (r.category ?? '').trim())
        .filter(Boolean)
    );
  }, [items, selection.type]);

  // Item name options for selected type + category
  const itemOptions = useMemo(() => {
    if (!selection.type || !selection.category) return [];
    const list = itemsForType(selection.type).filter(
      (r) => (r.category ?? '').trim() === selection.category
    );
    return uniqSorted(list.map((r) => r.item_name.trim()).filter(Boolean));
  }, [items, selection.type, selection.category]);

  // Variant options for selected type + category + item
  const variantOptions = useMemo(() => {
    if (!selection.type || !selection.category || !selection.item) return [];
    const list = itemsForType(selection.type).filter(
      (r) =>
        (r.category ?? '').trim() === selection.category &&
        r.item_name.trim() === selection.item
    );
    return list
      .map((r) => (r.variant ?? '').trim())
      .filter(Boolean)
      .sort();
  }, [items, selection.type, selection.category, selection.item]);

  // Get current options for the current step with search filter
  const currentOptions = useMemo(() => {
    const q = search.toLowerCase().trim();
    const filter = (arr: string[]) =>
      !q ? arr : arr.filter((x) => x.toLowerCase().includes(q));

    if (step === 'type') return { list: filter(typeOptions), hasNone: false };
    if (step === 'category')
      return { list: filter(categoryOptions), hasNone: false };
    if (step === 'item') return { list: filter(itemOptions), hasNone: false };
    if (step === 'variant')
      return { list: filter(variantOptions), hasNone: variantOptions.length === 0 };

    return { list: [], hasNone: false };
  }, [
    step,
    search,
    typeOptions,
    categoryOptions,
    itemOptions,
    variantOptions,
  ]);

  function handleTypeSelect(type: string) {
    setSelection({
      type,
      category: '',
      item: '',
      variant: '',
    });
    setSearch('');
    setStep('category');
  }

  function handleCategorySelect(category: string) {
    setSelection({
      ...selection,
      category,
      item: '',
      variant: '',
    });
    setSearch('');
    setStep('item');
  }

  function handleItemSelect(item: string) {
    setSelection({
      ...selection,
      item,
      variant: '',
    });
    setSearch('');
    setStep('variant');
  }

  function handleVariantSelect(variant: string) {
    setSelection({
      ...selection,
      variant,
    });
    setStep('confirm');
  }

  function handleConfirm() {
    // Find the matching item
    const finalType = selection.type.trim();
    const finalCategory = selection.category.trim();
    const finalItem = selection.item.trim();
    const finalVariant = selection.variant.trim();

    const matchedItem = items.find(
      (r) =>
        (r.item_type ?? '').toLowerCase() === finalType.toLowerCase() &&
        (r.category ?? '').trim() === finalCategory &&
        r.item_name.trim() === finalItem &&
        (!finalVariant || (r.variant ?? '').trim() === finalVariant)
    );

    if (!matchedItem) {
      console.error('No matching item found');
      return;
    }

    const result: SmartItemSelection = {
      type: finalType,
      category: finalCategory,
      item: finalItem,
      variant: finalVariant,
      costItemId: matchedItem.id,
      itemName: matchedItem.item_name,
      unit: matchedItem.unit || '',
      currentRate: matchedItem.current_rate,
    };

    onSelect(result);
  }

  function handleBack() {
    setSearch('');
    if (step === 'category') {
      setStep('type');
      setSelection({ ...selection, category: '', item: '', variant: '' });
    } else if (step === 'item') {
      setStep('category');
      setSelection({ ...selection, item: '', variant: '' });
    } else if (step === 'variant') {
      setStep('item');
      setSelection({ ...selection, variant: '' });
    } else if (step === 'confirm') {
      setStep('variant');
    }
  }

  function stepTitle(s: SelectionStep): string {
    if (s === 'type') return 'Type';
    if (s === 'category') return 'Category';
    if (s === 'item') return 'Item';
    if (s === 'variant') return 'Variant';
    return 'Confirm';
  }

  function breadcrumb(): string {
    const parts: string[] = [];
    if (selection.type) parts.push(selection.type);
    if (selection.category) parts.push(selection.category);
    if (selection.item) parts.push(selection.item);
    if (selection.variant) parts.push(selection.variant);
    return parts.join(' → ');
  }

  if (loading) {
    return (
      <div className="fixed inset-0 bg-slate-950/75 backdrop-blur-sm flex items-center justify-center z-50">
        <div className="bg-slate-900 rounded-2xl border border-slate-800 p-8 max-w-md w-full">
          <div className="text-center text-slate-400">Loading items...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-slate-950/75 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 rounded-2xl border border-slate-800 shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-800">
          <div className="flex-1 mr-4">
            <h2 className="text-xl font-bold text-slate-100">{title}</h2>
            <div className="text-sm text-slate-400 mt-1">
              {step !== 'confirm' ? stepTitle(step) : 'Review Selection'}
            </div>
            {breadcrumb() && (
              <div className="text-xs text-cyan-400 mt-1">{breadcrumb()}</div>
            )}
          </div>
          <button
            onClick={onCancel}
            className="p-2 hover:bg-slate-800 rounded-lg transition text-slate-400 hover:text-slate-200"
          >
            <X size={20} />
          </button>
        </div>

        {/* Search bar (not shown on confirm step) */}
        {step !== 'confirm' && (
          <div className="p-4 border-b border-slate-800">
            <div className="relative">
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
                size={18}
              />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={`Search ${stepTitle(step).toLowerCase()}...`}
                className="w-full pl-10 pr-4 py-2 border border-slate-700 rounded-xl bg-slate-950 text-slate-100 placeholder-slate-500 focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 outline-none"
              />
            </div>
          </div>
        )}

        {/* Content area */}
        <div className="flex-1 overflow-y-auto p-4">
          {step === 'confirm' ? (
            <div className="space-y-4">
              <div className="p-4 bg-slate-950/50 border border-slate-800 rounded-xl">
                <h3 className="font-semibold text-slate-100 mb-3">
                  Selected Item
                </h3>
                <div className="space-y-2 text-sm">
                  {selection.type && (
                    <div>
                      <span className="text-slate-500">Type:</span>{' '}
                      <span className="font-medium text-slate-200">
                        {selection.type}
                      </span>
                    </div>
                  )}
                  {selection.category && (
                    <div>
                      <span className="text-slate-500">Category:</span>{' '}
                      <span className="font-medium text-slate-200">
                        {selection.category}
                      </span>
                    </div>
                  )}
                  {selection.item && (
                    <div>
                      <span className="text-slate-500">Item:</span>{' '}
                      <span className="font-medium text-slate-200">
                        {selection.item}
                      </span>
                    </div>
                  )}
                  {selection.variant && (
                    <div>
                      <span className="text-slate-500">Variant:</span>{' '}
                      <span className="font-medium text-slate-200">
                        {selection.variant}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : step === 'variant' && currentOptions.hasNone ? (
            <div className="p-4">
              <div className="text-sm text-slate-200 mb-2">
                No variants found for this item.
              </div>
              <div className="text-xs text-slate-400 mb-4">
                Continue with no variant.
              </div>
              <button
                onClick={() => handleVariantSelect('')}
                className="w-full px-4 py-3 rounded-xl border border-slate-700 bg-slate-950/50 hover:bg-slate-800/50 hover:border-slate-600 transition text-left"
              >
                <div className="font-medium text-slate-100">No variant</div>
              </button>
            </div>
          ) : currentOptions.list.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              {search
                ? `No ${stepTitle(step).toLowerCase()} matches your search`
                : `No ${stepTitle(step).toLowerCase()} found`}
            </div>
          ) : (
            <div className="space-y-2">
              {currentOptions.list.map((opt) => (
                <button
                  key={opt}
                  onClick={() => {
                    if (step === 'type') handleTypeSelect(opt);
                    else if (step === 'category') handleCategorySelect(opt);
                    else if (step === 'item') handleItemSelect(opt);
                    else if (step === 'variant') handleVariantSelect(opt);
                  }}
                  className="w-full text-left px-4 py-3 rounded-xl border border-slate-800 bg-slate-950/50 hover:bg-slate-800/50 hover:border-slate-700 transition flex items-center justify-between group"
                >
                  <span className="font-medium text-slate-100">{opt}</span>
                  <ChevronRight
                    size={18}
                    className="text-slate-500 group-hover:text-slate-300"
                  />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 flex items-center justify-between">
          <button
            onClick={step === 'type' ? onCancel : handleBack}
            className="px-4 py-2 text-slate-400 hover:text-slate-200 transition"
          >
            {step === 'type' ? 'Cancel' : 'Back'}
          </button>
          {step === 'confirm' && (
            <button
              onClick={handleConfirm}
              className="px-6 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl font-medium transition flex items-center gap-2"
            >
              <Check size={18} />
              Confirm Selection
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
