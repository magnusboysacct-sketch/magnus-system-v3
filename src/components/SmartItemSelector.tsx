import React, { useState, useEffect, useMemo } from 'react';
import { X, Search, ChevronRight, Check } from 'lucide-react';
import { supabase } from '../lib/supabase';

export interface SmartItemSelection {
  category: string;
  itemGroup: string;
  materialType: string;
  useType: string;
  itemSize: string;
  variantCode: string;
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

type SelectionStep = 'category' | 'items' | 'confirm';

export function SmartItemSelector({
  companyId,
  onSelect,
  onCancel,
  initialSelection,
  title = 'Select Item',
}: SmartItemSelectorProps) {
  const [step, setStep] = useState<SelectionStep>('category');
  const [items, setItems] = useState<CostItemRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const [selection, setSelection] = useState<SmartItemSelection>({
    category: initialSelection?.category || '',
    itemGroup: initialSelection?.itemGroup || '',
    materialType: initialSelection?.materialType || '',
    useType: initialSelection?.useType || '',
    itemSize: initialSelection?.itemSize || '',
    variantCode: initialSelection?.variantCode || '',
    costItemId: initialSelection?.costItemId || null,
    itemName: initialSelection?.itemName || '',
    unit: initialSelection?.unit || '',
    currentRate: initialSelection?.currentRate || null,
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

  const categories = useMemo(() => {
    const uniqueCategories = new Set<string>();
    items.forEach((item) => {
      if (item.category) uniqueCategories.add(item.category);
    });
    return Array.from(uniqueCategories).sort();
  }, [items]);

  const categoryItems = useMemo(() => {
    if (!selection.category) return [];
    return items.filter((item) => item.category === selection.category);
  }, [items, selection.category]);

  function handleCategorySelect(category: string) {
    setSelection({
      ...selection,
      category,
      itemGroup: '',
      materialType: '',
      useType: '',
      itemSize: '',
      variantCode: '',
      costItemId: null,
      itemName: '',
      unit: '',
      currentRate: null,
    });
    setSearch('');
    setStep('items');
  }

  function handleItemSelect(item: CostItemRow) {
    setSelection({
      category: item.category || '',
      itemGroup: item.item_group || '',
      materialType: item.material_type || '',
      useType: item.use_type || '',
      itemSize: item.item_size || '',
      variantCode: item.variant_code || item.variant || '',
      costItemId: item.id,
      itemName: item.item_name,
      unit: item.unit || '',
      currentRate: item.current_rate,
    });
    setStep('confirm');
  }

  function handleConfirm() {
    if (!selection.costItemId) {
      console.error('No item selected');
      return;
    }
    onSelect(selection);
  }

  function handleBack() {
    setSearch('');
    if (step === 'items') {
      setStep('category');
      setSelection({
        ...selection,
        category: '',
        itemGroup: '',
        materialType: '',
        useType: '',
        itemSize: '',
        variantCode: '',
        costItemId: null,
        itemName: '',
        unit: '',
        currentRate: null,
      });
    } else if (step === 'confirm') {
      setStep('items');
      setSelection({
        ...selection,
        costItemId: null,
        itemName: '',
        unit: '',
        currentRate: null,
      });
    }
  }

  const searchFilteredCategories = useMemo(() => {
    const query = search.toLowerCase().trim();
    if (!query) return categories;
    return categories.filter((cat) => cat.toLowerCase().includes(query));
  }, [search, categories]);

  const searchFilteredItems = useMemo(() => {
    const query = search.toLowerCase().trim();
    if (!query) return categoryItems;
    return categoryItems.filter((item) =>
      item.item_name.toLowerCase().includes(query)
    );
  }, [search, categoryItems]);

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
        <div className="flex items-center justify-between p-6 border-b border-slate-800">
          <div>
            <h2 className="text-xl font-bold text-slate-100">{title}</h2>
            <div className="flex items-center gap-2 mt-2 text-sm text-slate-400">
              {selection.category && (
                <span className="px-2 py-1 bg-slate-800 rounded text-slate-300">
                  {selection.category}
                </span>
              )}
              {selection.itemName && (
                <>
                  <ChevronRight size={14} />
                  <span className="px-2 py-1 bg-slate-800 rounded text-slate-300">
                    {selection.itemName}
                  </span>
                </>
              )}
            </div>
          </div>
          <button
            onClick={onCancel}
            className="p-2 hover:bg-slate-800 rounded-lg transition text-slate-400 hover:text-slate-200"
          >
            <X size={20} />
          </button>
        </div>

        {step !== 'confirm' && (
          <div className="p-4 border-b border-slate-800">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={step === 'category' ? 'Search categories...' : 'Search items...'}
                className="w-full pl-10 pr-4 py-2 border border-slate-700 rounded-xl bg-slate-950 text-slate-100 placeholder-slate-500 focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 outline-none"
              />
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-4">
          {step === 'category' && (
            <>
              {searchFilteredCategories.length === 0 ? (
                <div className="text-center py-12 text-slate-400">
                  No categories found
                </div>
              ) : (
                <div className="space-y-2">
                  {searchFilteredCategories.map((cat) => (
                    <button
                      key={cat}
                      onClick={() => handleCategorySelect(cat)}
                      className="w-full text-left px-4 py-3 rounded-xl border border-slate-800 bg-slate-950/50 hover:bg-slate-800/50 hover:border-slate-700 transition flex items-center justify-between group"
                    >
                      <span className="font-medium text-slate-100">{cat}</span>
                      <ChevronRight size={18} className="text-slate-500 group-hover:text-slate-300" />
                    </button>
                  ))}
                </div>
              )}
            </>
          )}

          {step === 'items' && (
            <>
              {searchFilteredItems.length === 0 ? (
                <div className="text-center py-12 text-slate-400">
                  {search ? 'No items match your search' : 'No items found in this category'}
                </div>
              ) : (
                <div className="space-y-2">
                  {searchFilteredItems.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => handleItemSelect(item)}
                      className="w-full text-left px-4 py-3 rounded-xl border border-slate-800 bg-slate-950/50 hover:bg-slate-800/50 hover:border-slate-700 transition"
                    >
                      <div className="font-medium text-slate-100">{item.item_name}</div>
                      <div className="text-sm text-slate-400 mt-1 flex items-center gap-3">
                        {item.unit && <span>{item.unit}</span>}
                        {item.current_rate !== null && (
                          <span className="text-cyan-400">
                            ${Number(item.current_rate).toLocaleString(undefined, {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}

          {step === 'confirm' && (
            <div className="space-y-4">
              <div className="p-4 bg-slate-950/50 border border-slate-800 rounded-xl">
                <h3 className="font-semibold text-slate-100 mb-3">Selected Item</h3>
                <div className="space-y-2 text-sm">
                  {selection.category && (
                    <div>
                      <span className="text-slate-500">Category:</span>{' '}
                      <span className="font-medium text-slate-200">{selection.category}</span>
                    </div>
                  )}
                  {selection.itemName && (
                    <div>
                      <span className="text-slate-500">Item:</span>{' '}
                      <span className="font-medium text-slate-200">{selection.itemName}</span>
                    </div>
                  )}
                  {selection.unit && (
                    <div>
                      <span className="text-slate-500">Unit:</span>{' '}
                      <span className="font-medium text-slate-200">{selection.unit}</span>
                    </div>
                  )}
                  {selection.currentRate !== null && (
                    <div>
                      <span className="text-slate-500">Current Rate:</span>{' '}
                      <span className="font-medium text-cyan-400">
                        ${Number(selection.currentRate).toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="p-4 border-t border-slate-800 flex items-center justify-between">
          <button
            onClick={step === 'category' ? onCancel : handleBack}
            className="px-4 py-2 text-slate-400 hover:text-slate-200 transition"
          >
            {step === 'category' ? 'Cancel' : 'Back'}
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
