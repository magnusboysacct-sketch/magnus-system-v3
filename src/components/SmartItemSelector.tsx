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

type SelectionStep = 'category' | 'group' | 'material' | 'useType' | 'size' | 'variant' | 'confirm';

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

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      if (selection.category && item.category !== selection.category) return false;
      if (selection.itemGroup && item.item_group !== selection.itemGroup) return false;
      if (selection.materialType && item.material_type !== selection.materialType) return false;
      if (selection.useType && item.use_type !== selection.useType) return false;
      if (selection.itemSize && item.item_size !== selection.itemSize) return false;
      return true;
    });
  }, [items, selection]);

  const categories = useMemo(() => {
    const uniqueCategories = new Set<string>();
    items.forEach((item) => {
      if (item.category) uniqueCategories.add(item.category);
    });
    return Array.from(uniqueCategories).sort();
  }, [items]);

  const itemGroups = useMemo(() => {
    const uniqueGroups = new Set<string>();
    items.forEach((item) => {
      if (selection.category && item.category === selection.category && item.item_group) {
        uniqueGroups.add(item.item_group);
      }
    });
    return Array.from(uniqueGroups).sort();
  }, [items, selection.category]);

  const materialTypes = useMemo(() => {
    const uniqueMaterials = new Set<string>();
    items.forEach((item) => {
      if (
        selection.category &&
        item.category === selection.category &&
        selection.itemGroup &&
        item.item_group === selection.itemGroup &&
        item.material_type
      ) {
        uniqueMaterials.add(item.material_type);
      }
    });
    return Array.from(uniqueMaterials).sort();
  }, [items, selection.category, selection.itemGroup]);

  const useTypes = useMemo(() => {
    const uniqueUseTypes = new Set<string>();
    items.forEach((item) => {
      if (
        selection.category &&
        item.category === selection.category &&
        selection.itemGroup &&
        item.item_group === selection.itemGroup &&
        selection.materialType &&
        item.material_type === selection.materialType &&
        item.use_type
      ) {
        uniqueUseTypes.add(item.use_type);
      }
    });
    return Array.from(uniqueUseTypes).sort();
  }, [items, selection.category, selection.itemGroup, selection.materialType]);

  const sizes = useMemo(() => {
    const uniqueSizes = new Set<string>();
    items.forEach((item) => {
      if (
        selection.category &&
        item.category === selection.category &&
        selection.itemGroup &&
        item.item_group === selection.itemGroup &&
        selection.materialType &&
        item.material_type === selection.materialType &&
        selection.useType &&
        item.use_type === selection.useType &&
        item.item_size
      ) {
        uniqueSizes.add(item.item_size);
      }
    });
    return Array.from(uniqueSizes).sort();
  }, [items, selection.category, selection.itemGroup, selection.materialType, selection.useType]);

  const variants = useMemo(() => {
    return filteredItems.filter((item) => {
      return (
        selection.category &&
        item.category === selection.category &&
        selection.itemGroup &&
        item.item_group === selection.itemGroup &&
        selection.materialType &&
        item.material_type === selection.materialType &&
        selection.useType &&
        item.use_type === selection.useType &&
        selection.itemSize &&
        item.item_size === selection.itemSize
      );
    });
  }, [filteredItems, selection]);

  function handleCategorySelect(category: string) {
    setSelection({ ...selection, category, itemGroup: '', materialType: '', useType: '', itemSize: '', variantCode: '' });
    const hasGroups = items.some((item) => item.category === category && item.item_group);
    setStep(hasGroups ? 'group' : 'confirm');
  }

  function handleGroupSelect(group: string) {
    setSelection({ ...selection, itemGroup: group, materialType: '', useType: '', itemSize: '', variantCode: '' });
    const hasMaterials = items.some(
      (item) => item.category === selection.category && item.item_group === group && item.material_type
    );
    setStep(hasMaterials ? 'material' : 'confirm');
  }

  function handleMaterialSelect(material: string) {
    setSelection({ ...selection, materialType: material, useType: '', itemSize: '', variantCode: '' });
    const hasUseTypes = items.some(
      (item) =>
        item.category === selection.category &&
        item.item_group === selection.itemGroup &&
        item.material_type === material &&
        item.use_type
    );
    setStep(hasUseTypes ? 'useType' : 'confirm');
  }

  function handleUseTypeSelect(useType: string) {
    setSelection({ ...selection, useType, itemSize: '', variantCode: '' });
    const hasSizes = items.some(
      (item) =>
        item.category === selection.category &&
        item.item_group === selection.itemGroup &&
        item.material_type === selection.materialType &&
        item.use_type === useType &&
        item.item_size
    );
    setStep(hasSizes ? 'size' : 'confirm');
  }

  function handleSizeSelect(size: string) {
    setSelection({ ...selection, itemSize: size, variantCode: '' });
    const hasVariants = items.some(
      (item) =>
        item.category === selection.category &&
        item.item_group === selection.itemGroup &&
        item.material_type === selection.materialType &&
        item.use_type === selection.useType &&
        item.item_size === size &&
        (item.variant_code || item.variant)
    );
    setStep(hasVariants ? 'variant' : 'confirm');
  }

  function handleVariantSelect(item: CostItemRow) {
    setSelection({
      ...selection,
      variantCode: item.variant_code || item.variant || '',
      costItemId: item.id,
      itemName: item.item_name,
      unit: item.unit || '',
      currentRate: item.current_rate,
    });
    setStep('confirm');
  }

  function handleConfirm() {
    if (!selection.category) return;

    let finalSelection = { ...selection };

    if (!finalSelection.costItemId) {
      const matchedItem = filteredItems.find(
        (item) =>
          item.category === selection.category &&
          (!selection.itemGroup || item.item_group === selection.itemGroup) &&
          (!selection.materialType || item.material_type === selection.materialType) &&
          (!selection.useType || item.use_type === selection.useType) &&
          (!selection.itemSize || item.item_size === selection.itemSize)
      );

      if (matchedItem) {
        finalSelection = {
          ...finalSelection,
          costItemId: matchedItem.id,
          itemName: matchedItem.item_name,
          unit: matchedItem.unit || '',
          currentRate: matchedItem.current_rate,
        };
      }
    }

    onSelect(finalSelection);
  }

  function handleBack() {
    const stepOrder: SelectionStep[] = ['category', 'group', 'material', 'useType', 'size', 'variant', 'confirm'];
    const currentIndex = stepOrder.indexOf(step);
    if (currentIndex > 0) {
      setStep(stepOrder[currentIndex - 1]);
    }
  }

  const searchFiltered = useMemo(() => {
    const query = search.toLowerCase().trim();
    if (!query) return null;

    let options: string[] = [];
    if (step === 'category') options = categories;
    else if (step === 'group') options = itemGroups;
    else if (step === 'material') options = materialTypes;
    else if (step === 'useType') options = useTypes;
    else if (step === 'size') options = sizes;

    return options.filter((opt) => opt.toLowerCase().includes(query));
  }, [search, step, categories, itemGroups, materialTypes, useTypes, sizes]);

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-white dark:bg-slate-900 rounded-lg p-8 max-w-md w-full">
          <div className="text-center text-slate-600 dark:text-slate-400">Loading items...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-900 rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-slate-700">
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">{title}</h2>
            <div className="flex items-center gap-2 mt-2 text-sm text-slate-600 dark:text-slate-400">
              {selection.category && <span className="px-2 py-1 bg-slate-100 dark:bg-slate-800 rounded">{selection.category}</span>}
              {selection.itemGroup && (
                <>
                  <ChevronRight size={14} />
                  <span className="px-2 py-1 bg-slate-100 dark:bg-slate-800 rounded">{selection.itemGroup}</span>
                </>
              )}
              {selection.materialType && (
                <>
                  <ChevronRight size={14} />
                  <span className="px-2 py-1 bg-slate-100 dark:bg-slate-800 rounded">{selection.materialType}</span>
                </>
              )}
              {selection.useType && (
                <>
                  <ChevronRight size={14} />
                  <span className="px-2 py-1 bg-slate-100 dark:bg-slate-800 rounded">{selection.useType}</span>
                </>
              )}
              {selection.itemSize && (
                <>
                  <ChevronRight size={14} />
                  <span className="px-2 py-1 bg-slate-100 dark:bg-slate-800 rounded">{selection.itemSize}</span>
                </>
              )}
            </div>
          </div>
          <button
            onClick={onCancel}
            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition"
          >
            <X size={20} />
          </button>
        </div>

        {step !== 'confirm' && (
          <div className="p-4 border-b border-slate-200 dark:border-slate-700">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={`Search ${step}...`}
                className="w-full pl-10 pr-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-4">
          {step === 'category' && (
            <div className="space-y-2">
              {(searchFiltered || categories).map((cat) => (
                <button
                  key={cat}
                  onClick={() => handleCategorySelect(cat)}
                  className="w-full text-left px-4 py-3 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 transition flex items-center justify-between group"
                >
                  <span className="font-medium text-slate-900 dark:text-white">{cat}</span>
                  <ChevronRight size={18} className="text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300" />
                </button>
              ))}
            </div>
          )}

          {step === 'group' && (
            <div className="space-y-2">
              {(searchFiltered || itemGroups).map((group) => (
                <button
                  key={group}
                  onClick={() => handleGroupSelect(group)}
                  className="w-full text-left px-4 py-3 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 transition flex items-center justify-between group"
                >
                  <span className="font-medium text-slate-900 dark:text-white">{group}</span>
                  <ChevronRight size={18} className="text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300" />
                </button>
              ))}
            </div>
          )}

          {step === 'material' && (
            <div className="space-y-2">
              {(searchFiltered || materialTypes).map((material) => (
                <button
                  key={material}
                  onClick={() => handleMaterialSelect(material)}
                  className="w-full text-left px-4 py-3 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 transition flex items-center justify-between group"
                >
                  <span className="font-medium text-slate-900 dark:text-white">{material}</span>
                  <ChevronRight size={18} className="text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300" />
                </button>
              ))}
            </div>
          )}

          {step === 'useType' && (
            <div className="space-y-2">
              {(searchFiltered || useTypes).map((useType) => (
                <button
                  key={useType}
                  onClick={() => handleUseTypeSelect(useType)}
                  className="w-full text-left px-4 py-3 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 transition flex items-center justify-between group"
                >
                  <span className="font-medium text-slate-900 dark:text-white">{useType}</span>
                  <ChevronRight size={18} className="text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300" />
                </button>
              ))}
            </div>
          )}

          {step === 'size' && (
            <div className="space-y-2">
              {(searchFiltered || sizes).map((size) => (
                <button
                  key={size}
                  onClick={() => handleSizeSelect(size)}
                  className="w-full text-left px-4 py-3 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 transition flex items-center justify-between group"
                >
                  <span className="font-medium text-slate-900 dark:text-white">{size}</span>
                  <ChevronRight size={18} className="text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300" />
                </button>
              ))}
            </div>
          )}

          {step === 'variant' && (
            <div className="space-y-2">
              {variants.map((item) => (
                <button
                  key={item.id}
                  onClick={() => handleVariantSelect(item)}
                  className="w-full text-left px-4 py-3 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 transition"
                >
                  <div className="font-medium text-slate-900 dark:text-white">{item.item_name}</div>
                  <div className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                    {item.variant_code || item.variant} • {item.unit} • {item.current_rate ? `$${item.current_rate.toFixed(2)}` : 'No rate'}
                  </div>
                </button>
              ))}
            </div>
          )}

          {step === 'confirm' && (
            <div className="space-y-4">
              <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-lg">
                <h3 className="font-semibold text-slate-900 dark:text-white mb-3">Selected Item</h3>
                <div className="space-y-2 text-sm">
                  {selection.category && (
                    <div>
                      <span className="text-slate-600 dark:text-slate-400">Category:</span>{' '}
                      <span className="font-medium text-slate-900 dark:text-white">{selection.category}</span>
                    </div>
                  )}
                  {selection.itemGroup && (
                    <div>
                      <span className="text-slate-600 dark:text-slate-400">Item Group:</span>{' '}
                      <span className="font-medium text-slate-900 dark:text-white">{selection.itemGroup}</span>
                    </div>
                  )}
                  {selection.materialType && (
                    <div>
                      <span className="text-slate-600 dark:text-slate-400">Material:</span>{' '}
                      <span className="font-medium text-slate-900 dark:text-white">{selection.materialType}</span>
                    </div>
                  )}
                  {selection.useType && (
                    <div>
                      <span className="text-slate-600 dark:text-slate-400">Use Type:</span>{' '}
                      <span className="font-medium text-slate-900 dark:text-white">{selection.useType}</span>
                    </div>
                  )}
                  {selection.itemSize && (
                    <div>
                      <span className="text-slate-600 dark:text-slate-400">Size:</span>{' '}
                      <span className="font-medium text-slate-900 dark:text-white">{selection.itemSize}</span>
                    </div>
                  )}
                  {selection.itemName && (
                    <div>
                      <span className="text-slate-600 dark:text-slate-400">Item:</span>{' '}
                      <span className="font-medium text-slate-900 dark:text-white">{selection.itemName}</span>
                    </div>
                  )}
                  {selection.unit && (
                    <div>
                      <span className="text-slate-600 dark:text-slate-400">Unit:</span>{' '}
                      <span className="font-medium text-slate-900 dark:text-white">{selection.unit}</span>
                    </div>
                  )}
                  {selection.currentRate !== null && (
                    <div>
                      <span className="text-slate-600 dark:text-slate-400">Current Rate:</span>{' '}
                      <span className="font-medium text-slate-900 dark:text-white">${selection.currentRate.toFixed(2)}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="p-4 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between">
          <button
            onClick={step === 'category' ? onCancel : handleBack}
            className="px-4 py-2 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition"
          >
            {step === 'category' ? 'Cancel' : 'Back'}
          </button>
          {step === 'confirm' && (
            <button
              onClick={handleConfirm}
              className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition flex items-center gap-2"
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
