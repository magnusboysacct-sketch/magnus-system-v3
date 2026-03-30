import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Search, Filter, CheckCircle, AlertCircle, Link as LinkIcon } from 'lucide-react';
import { listSuppliers, getCurrentCompanyId, type Supplier } from '../lib/suppliers';
import { getUnmatchedSupplierItems, updateUnmatchedSupplierItem, importSupplierPrices, type SupplierPriceImportRow } from '../lib/supplierPriceImport';
import { getBestSupplierPrices, getBestRateForCostItem, type BestPriceResult, type SupplierPriceInfo } from '../lib/supplierPriceComparison';
import { getRecentPriceChanges, logPriceChangeAlert, getChangeDescription, getChangeColorClass, type PriceChange } from '../lib/supplierPriceAlerts';
import { SmartItemSelector, type SmartItemSelection } from '../components/SmartItemSelector';
import { supabase } from '../lib/supabase';
import type { SupplierCostItem } from '../lib/suppliers';

type MatchStatus = 'all' | 'matched' | 'unmatched';

interface SupplierCostItemWithStatus extends SupplierCostItem {
  matchedCostItem?: {
    id: string;
    item_name: string;
    description: string | null;
    unit: string | null;
  } | null;
  status: 'matched' | 'unmatched';
}

export default function SupplierPriceSyncPage() {
  const { projectId } = useParams<{ projectId?: string }>();
  const nav = useNavigate();

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>('');
  const [items, setItems] = useState<SupplierCostItemWithStatus[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<MatchStatus>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [showItemSelector, setShowItemSelector] = useState(false);
  const [selectedItemForMatch, setSelectedItemForMatch] = useState<SupplierCostItem | null>(null);
  const [companyId, setCompanyId] = useState<string>('');
  const [applyingPrices, setApplyingPrices] = useState(false);
  const [applyingBestPrices, setApplyingBestPrices] = useState(false);
  const [showPriceComparison, setShowPriceComparison] = useState(false);
  const [selectedItemForComparison, setSelectedItemForComparison] = useState<SupplierCostItemWithStatus | null>(null);
  const [priceComparisonData, setPriceComparisonData] = useState<BestPriceResult | null>(null);
  const [showPriceAlerts, setShowPriceAlerts] = useState(false);
  const [priceAlerts, setPriceAlerts] = useState<(PriceChange & { supplier_name?: string })[]>([]);

  // Load suppliers
  useEffect(() => {
    loadSuppliers();
    loadCompanyId();
  }, []);

  async function loadCompanyId() {
    try {
      const id = await getCurrentCompanyId();
      setCompanyId(id || '');
    } catch (error) {
      console.error('Error loading company ID:', error);
    }
  }

  async function loadSuppliers() {
    try {
      const supplierList = await listSuppliers();
      setSuppliers(supplierList);
    } catch (error) {
      console.error('Error loading suppliers:', error);
    }
  }

  // Load items for selected supplier
  async function loadSupplierItems() {
    if (!selectedSupplierId) return;

    setLoading(true);
    try {
      const supplierItems = await getUnmatchedSupplierItems(selectedSupplierId);
      
      // For each item, try to find matching cost item
      const itemsWithStatus = await Promise.all(
        supplierItems.map(async (item) => {
          let matchedCostItem = null;
          let status: 'matched' | 'unmatched' = 'unmatched';

          if (item.cost_item_id) {
            // This item is already matched, fetch cost item details
            const { data: costItem } = await supabase
              .from('cost_items')
              .select('id, item_name, description, unit')
              .eq('id', item.cost_item_id)
              .maybeSingle();
            
            if (costItem) {
              matchedCostItem = costItem;
              status = 'matched';
            }
          }

          return {
            ...item,
            matchedCostItem,
            status
          };
        })
      );

      setItems(itemsWithStatus);
    } catch (error) {
      console.error('Error loading supplier items:', error);
    } finally {
      setLoading(false);
    }
  }

  // Handle item selection from SmartItemSelector
  async function handleItemSelected(selection: SmartItemSelection) {
    if (!selectedItemForMatch || !selection.costItemId) return;

    try {
      const success = await updateUnmatchedSupplierItem(
        selectedItemForMatch.id,
        selection.costItemId
      );

      if (success) {
        // Refresh items to show updated match
        await loadSupplierItems();
        setShowItemSelector(false);
        setSelectedItemForMatch(null);
      }
    } catch (error) {
      console.error('Error updating supplier item:', error);
    }
  }

  // Filter items based on status and search
  const filteredItems = useMemo(() => {
    let filtered = items;

    // Status filter
    if (statusFilter === 'matched') {
      filtered = filtered.filter(item => item.status === 'matched');
    } else if (statusFilter === 'unmatched') {
      filtered = filtered.filter(item => item.status === 'unmatched');
    }

    // Search filter
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      filtered = filtered.filter(item =>
        item.supplier_sku?.toLowerCase().includes(searchLower) ||
        item.supplier_item_name?.toLowerCase().includes(searchLower) ||
        item.supplier_description?.toLowerCase().includes(searchLower)
      );
    }

    return filtered;
  }, [items, statusFilter, searchTerm]);

  const stats = useMemo(() => {
    const total = items.length;
    const matched = items.filter(item => item.status === 'matched').length;
    const unmatched = items.filter(item => item.status === 'unmatched').length;

    return { total, matched, unmatched };
  }, [items]);

  const hasMatchedItems = useMemo(() => {
    return items.some(item => item.status === 'matched' && item.cost_item_id !== null);
  }, [items]);

  // Load price comparison data
  async function loadPriceComparison(costItemId: string) {
    try {
      const comparisonData = await getBestSupplierPrices(costItemId);
      setPriceComparisonData(comparisonData);
      setShowPriceComparison(true);
    } catch (error) {
      console.error('Error loading price comparison:', error);
      alert('Error loading price comparison data');
    }
  }

  // Load price alerts
  async function loadPriceAlerts() {
    try {
      if (!selectedSupplierId) {
        console.log('No supplier selected for price alerts');
        return;
      }

      const alerts = await getRecentPriceChanges(7);
      setPriceAlerts(alerts);
      setShowPriceAlerts(true);

      // Log alerts to console (temporary storage)
      alerts.forEach(alert => logPriceChangeAlert(alert));
    } catch (error) {
      console.error('Error loading price alerts:', error);
      alert('Error loading price alerts');
    }
  }

  // Apply supplier prices to cost system
  async function applySupplierPrices() {
    if (!selectedSupplierId || !hasMatchedItems) return;

    setApplyingPrices(true);
    let appliedCount = 0;
    let skippedCount = 0;

    try {
      // Get matched items for this supplier
      const matchedItems = items.filter(item => 
        item.status === 'matched' && item.cost_item_id !== null
      );

      if (matchedItems.length === 0) {
        // Show toast for no matched items
        console.log('No matched items found to apply prices');
        return;
      }

      // Get latest imported prices for this supplier
      const { data: importedPrices } = await supabase
        .from('cost_item_rates')
        .select('cost_item_id, rate, source, effective_date')
        .eq('supplier_id', selectedSupplierId)
        .eq('source', 'supplier_import')
        .eq('is_supplier_specific', true)
        .order('effective_date', { ascending: false })
        .order('created_at', { ascending: false });

      if (!importedPrices || importedPrices.length === 0) {
        console.log('No imported prices found for supplier');
        return;
      }

      // Apply each matched item price
      for (const item of matchedItems) {
        const importedPrice = importedPrices.find(ip => ip.cost_item_id === item.cost_item_id);
        
        if (!importedPrice) {
          skippedCount++;
          console.log(`No imported price found for cost item ${item.cost_item_id}`);
          continue;
        }

        // Check if same rate already exists today
        const { data: existingRate } = await supabase
          .from('cost_item_rates')
          .select('id')
          .eq('cost_item_id', item.cost_item_id)
          .eq('supplier_id', selectedSupplierId)
          .eq('rate', importedPrice.rate)
          .eq('effective_date', new Date().toISOString().split('T')[0])
          .maybeSingle();

        if (existingRate) {
          skippedCount++;
          console.log(`Rate already exists for cost item ${item.cost_item_id}`);
          continue;
        }

        // Insert new rate
        const { error: insertError } = await supabase
          .from('cost_item_rates')
          .insert({
            cost_item_id: item.cost_item_id,
            supplier_id: selectedSupplierId,
            rate: importedPrice.rate,
            currency: 'USD',
            effective_date: new Date().toISOString().split('T')[0],
            source: 'supplier_sync',
            is_supplier_specific: true
          });

        if (insertError) {
          console.error(`Error inserting rate for cost item ${item.cost_item_id}:`, insertError);
        } else {
          appliedCount++;
        }
      }

      // Get supplier name for feedback
      const supplier = suppliers.find(s => s.id === selectedSupplierId);
      const supplierName = supplier?.supplier_name || 'Unknown Supplier';

      // Show result feedback
      if (appliedCount > 0) {
        alert(`Successfully applied ${appliedCount} prices from ${supplierName}`);
      } else {
        alert(`No prices were applied from ${supplierName}. ${skippedCount} items were skipped.`);
      }

    } catch (error) {
      console.error('Error applying supplier prices:', error);
      alert(`Error applying prices: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setApplyingPrices(false);
    }
  }

  // Apply best prices to cost system
  async function applyBestPrices() {
    if (!selectedSupplierId || !hasMatchedItems) return;

    setApplyingBestPrices(true);
    let updatedCount = 0;
    let skippedCount = 0;
    const supplierInfo: Array<{item: string, supplier: string, rate: number}> = [];

    try {
      // Get matched items for this supplier
      const matchedItems = items.filter(item => 
        item.status === 'matched' && item.cost_item_id !== null
      );

      if (matchedItems.length === 0) {
        console.log('No matched items found to apply best prices');
        return;
      }

      // Apply best price for each matched item
      for (const item of matchedItems) {
        if (!item.cost_item_id) {
          skippedCount++;
          continue;
        }

        // Get best rate for this cost item
        const bestRate = await getBestRateForCostItem(item.cost_item_id);
        
        if (!bestRate) {
          skippedCount++;
          console.log(`No supplier rates found for cost item ${item.cost_item_id}`);
          continue;
        }

        // Check if same rate already exists today
        const { data: existingRate } = await supabase
          .from('cost_item_rates')
          .select('id')
          .eq('cost_item_id', item.cost_item_id)
          .eq('rate', bestRate.rate)
          .eq('effective_date', new Date().toISOString().split('T')[0])
          .maybeSingle();

        if (existingRate) {
          skippedCount++;
          console.log(`Best rate already exists for cost item ${item.cost_item_id}`);
          continue;
        }

        // Insert best rate
        const { error: insertError } = await supabase
          .from('cost_item_rates')
          .insert({
            cost_item_id: item.cost_item_id,
            supplier_id: bestRate.supplier_id,
            rate: bestRate.rate,
            currency: 'USD',
            effective_date: new Date().toISOString().split('T')[0],
            source: 'best_price',
            is_supplier_specific: true
          });

        if (insertError) {
          console.error(`Error inserting best rate for cost item ${item.cost_item_id}:`, insertError);
        } else {
          updatedCount++;
          supplierInfo.push({
            item: item.supplier_item_name || item.cost_item_id,
            supplier: bestRate.supplier_name,
            rate: bestRate.rate
          });
        }
      }

      // Show result feedback
      if (updatedCount > 0) {
        const supplierSummary = supplierInfo.map(s => `${s.supplier} ($${s.rate.toFixed(2)})`).join(', ');
        alert(`Successfully applied ${updatedCount} best prices.\n\nSuppliers used: ${supplierSummary}`);
      } else {
        alert(`No best prices were applied. ${skippedCount} items were skipped.`);
      }

    } catch (error) {
      console.error('Error applying best prices:', error);
      alert(`Error applying best prices: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setApplyingBestPrices(false);
    }
  }

  if (!projectId) {
    return (
      <div className="p-6 text-sm text-slate-500">
        Please select a project to access supplier price sync.
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-slate-950 text-white">
      {/* Header */}
      <div className="border-b border-slate-700 p-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold text-white">Supplier Price Sync</h1>
          <div className="text-sm text-slate-400">
            Project: {projectId}
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="border-b border-slate-700 p-4 space-y-4">
        <div className="flex items-center gap-4">
          {/* Supplier Dropdown */}
          <div className="flex-1 max-w-xs">
            <label className="block text-sm font-medium text-slate-300 mb-1">
              Supplier
            </label>
            <select
              value={selectedSupplierId}
              onChange={(e) => setSelectedSupplierId(e.target.value)}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
            >
              <option value="">Select a supplier...</option>
              {suppliers.map(supplier => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.supplier_name}
                </option>
              ))}
            </select>
          </div>

          {/* Load Button */}
          <div className="flex items-end gap-2">
            <button
              onClick={loadSupplierItems}
              disabled={!selectedSupplierId || loading}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-700 disabled:text-slate-400 text-white rounded font-medium transition-colors"
            >
              {loading ? 'Loading...' : 'Load Imported Items'}
            </button>

            {/* Apply Prices Button */}
            <button
              onClick={applySupplierPrices}
              disabled={!selectedSupplierId || !hasMatchedItems || applyingPrices}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-700 disabled:text-slate-400 text-white rounded font-medium transition-colors"
            >
              {applyingPrices ? 'Applying...' : 'Apply Prices to System'}
            </button>

            {/* Apply Best Prices Button */}
            <button
              onClick={applyBestPrices}
              disabled={!selectedSupplierId || !hasMatchedItems || applyingBestPrices}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-slate-700 disabled:text-slate-400 text-white rounded font-medium transition-colors"
            >
              {applyingBestPrices ? 'Applying...' : 'Apply Best Prices'}
            </button>

            {/* Price Alerts Button */}
            <button
              onClick={loadPriceAlerts}
              disabled={!selectedSupplierId}
              className="px-4 py-2 bg-orange-600 hover:bg-orange-700 disabled:bg-slate-700 disabled:text-slate-400 text-white rounded font-medium transition-colors"
            >
              Price Alerts
            </button>
          </div>
        </div>

        {/* Stats */}
        {items.length > 0 && (
          <div className="flex items-center gap-6 text-sm">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-emerald-500 rounded-full"></div>
              <span className="text-slate-300">Matched: {stats.matched}</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-amber-500 rounded-full"></div>
              <span className="text-slate-300">Unmatched: {stats.unmatched}</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-slate-500 rounded-full"></div>
              <span className="text-slate-300">Total: {stats.total}</span>
            </div>
          </div>
        )}

        {/* Filters */}
        {items.length > 0 && (
          <div className="flex items-center gap-4">
            {/* Status Filter */}
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-slate-400" />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as MatchStatus)}
                className="px-3 py-1 bg-slate-800 border border-slate-600 rounded text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
              >
                <option value="all">All Items</option>
                <option value="matched">Matched Only</option>
                <option value="unmatched">Unmatched Only</option>
              </select>
            </div>

            {/* Search */}
            <div className="flex-1 max-w-md">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search by SKU, name, or description..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-3 py-1 bg-slate-800 border border-slate-600 rounded text-white text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-slate-400">Loading supplier items...</div>
          </div>
        ) : items.length === 0 && selectedSupplierId ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="text-slate-400 mb-2">No imported items found for this supplier</div>
              <div className="text-sm text-slate-500">
                Import supplier prices first, then return to review and match items.
              </div>
            </div>
          </div>
        ) : items.length === 0 && !selectedSupplierId ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="text-slate-400 mb-2">Select a supplier to view imported items</div>
              <div className="text-sm text-slate-500">
                Choose a supplier from the dropdown above and click "Load Imported Items".
              </div>
            </div>
          </div>
        ) : (
          <div className="h-full overflow-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-800 sticky top-0">
                <tr>
                  <th className="px-4 py-3 text-left text-slate-300 font-medium border-b border-slate-700">
                    Supplier SKU
                  </th>
                  <th className="px-4 py-3 text-left text-slate-300 font-medium border-b border-slate-700">
                    Item Name
                  </th>
                  <th className="px-4 py-3 text-left text-slate-300 font-medium border-b border-slate-700">
                    Description
                  </th>
                  <th className="px-4 py-3 text-left text-slate-300 font-medium border-b border-slate-700">
                    Unit
                  </th>
                  <th className="px-4 py-3 text-left text-slate-300 font-medium border-b border-slate-700">
                    Matched Cost Item
                  </th>
                  <th className="px-4 py-3 text-left text-slate-300 font-medium border-b border-slate-700">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-slate-300 font-medium border-b border-slate-700">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((item, index) => (
                  <tr key={item.id} className="border-b border-slate-700 hover:bg-slate-800">
                    <td className="px-4 py-3 text-slate-200">
                      {item.supplier_sku || '-'}
                    </td>
                    <td className="px-4 py-3 text-slate-200">
                      {item.supplier_item_name || '-'}
                    </td>
                    <td className="px-4 py-3 text-slate-200">
                      {item.supplier_description || '-'}
                    </td>
                    <td className="px-4 py-3 text-slate-200">
                      {item.unit || '-'}
                    </td>
                    <td className="px-4 py-3">
                      {item.matchedCostItem ? (
                        <div>
                          <div className="text-slate-200 font-medium">
                            {item.matchedCostItem.item_name}
                          </div>
                          {item.matchedCostItem.description && (
                            <div className="text-xs text-slate-400">
                              {item.matchedCostItem.description}
                            </div>
                          )}
                          <div className="text-xs text-slate-500">
                            Unit: {item.matchedCostItem.unit || '-'}
                          </div>
                        </div>
                      ) : (
                        <span className="text-slate-500 italic">No match</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {item.status === 'matched' ? (
                        <div className="flex items-center gap-2">
                          <CheckCircle className="w-4 h-4 text-emerald-500" />
                          <span className="text-emerald-500 font-medium">Matched</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <AlertCircle className="w-4 h-4 text-amber-500" />
                          <span className="text-amber-500 font-medium">Unmatched</span>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {item.status === 'matched' ? (
                        <div className="flex gap-2">
                          <button
                            onClick={() => {
                              setSelectedItemForComparison(item);
                              loadPriceComparison(item.cost_item_id!);
                            }}
                            className="inline-flex items-center gap-2 px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white text-xs rounded font-medium transition-colors"
                          >
                            <LinkIcon className="w-3 h-3" />
                            View Prices
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => {
                            setSelectedItemForMatch(item);
                            setShowItemSelector(true);
                          }}
                          className="inline-flex items-center gap-2 px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white text-xs rounded font-medium transition-colors"
                        >
                          <LinkIcon className="w-3 h-3" />
                          Match Item
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Smart Item Selector Modal */}
      {showItemSelector && selectedItemForMatch && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-slate-900 border border-slate-700 rounded-lg shadow-xl max-w-4xl max-h-[90vh] overflow-hidden">
            <div className="p-6 border-b border-slate-700">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-white">
                    Match Cost Item
                  </h3>
                  <div className="text-sm text-slate-400 mt-1">
                    Select a cost item to match with: <span className="text-amber-400 font-medium">{selectedItemForMatch.supplier_item_name}</span>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setShowItemSelector(false);
                    setSelectedItemForMatch(null);
                  }}
                  className="text-slate-400 hover:text-white transition-colors"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-auto">
              <SmartItemSelector
                companyId={companyId || ''}
                onSelect={handleItemSelected}
                onCancel={() => {
                  setShowItemSelector(false);
                  setSelectedItemForMatch(null);
                }}
                title="Select Cost Item to Match"
              />
            </div>
          </div>
        </div>
      )}

      {/* Price Comparison Modal */}
      {showPriceComparison && selectedItemForComparison && priceComparisonData && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-slate-900 border border-slate-700 rounded-lg shadow-xl max-w-4xl max-h-[90vh] overflow-hidden">
            <div className="p-6 border-b border-slate-700">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-white">
                    Price Comparison
                  </h3>
                  <div className="text-sm text-slate-400 mt-1">
                    {selectedItemForComparison.supplier_item_name} - {selectedItemForComparison.supplier_description}
                  </div>
                  {priceComparisonData.suppliers.length > 1 && (
                    <div className="mt-2 inline-flex items-center gap-2 px-3 py-1 bg-emerald-600 text-white text-xs rounded-full font-medium">
                      <CheckCircle className="w-3 h-3" />
                      Best Price Available
                    </div>
                  )}
                </div>
                <button
                  onClick={() => {
                    setShowPriceComparison(false);
                    setSelectedItemForComparison(null);
                    setPriceComparisonData(null);
                  }}
                  className="text-slate-400 hover:text-white transition-colors"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-auto">
              <div className="p-6">
                <h4 className="text-md font-semibold text-white mb-4">Supplier Prices</h4>
                
                <div className="space-y-3">
                  {priceComparisonData.suppliers.map((supplier, index) => {
                    const isBestPrice = priceComparisonData.best_price?.supplier_id === supplier.supplier_id;
                    
                    return (
                      <div 
                        key={supplier.supplier_id}
                        className={`p-4 border rounded-lg ${
                          isBestPrice 
                            ? 'border-emerald-500 bg-emerald-500/10' 
                            : 'border-slate-600 bg-slate-800'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-3">
                            <div className="font-medium text-white">
                              {supplier.supplier_name}
                            </div>
                            {isBestPrice && (
                              <div className="inline-flex items-center gap-2 px-2 py-1 bg-emerald-600 text-white text-xs rounded-full font-medium">
                                <CheckCircle className="w-3 h-3" />
                                Best Price
                              </div>
                            )}
                          </div>
                          <div className="text-right">
                            <div className="text-2xl font-bold text-white">
                              ${supplier.rate.toFixed(2)}
                            </div>
                            <div className="text-sm text-slate-400">
                              per {selectedItemForComparison.unit || 'unit'}
                            </div>
                          </div>
                        </div>
                        
                        <div className="text-sm text-slate-300">
                          Effective: {new Date(supplier.effective_date).toLocaleDateString()}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {priceComparisonData.suppliers.length === 0 && (
                  <div className="text-center py-8 text-slate-400">
                    No supplier prices found for this item.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Price Alerts Modal */}
      {showPriceAlerts && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-slate-900 border border-slate-700 rounded-lg shadow-xl max-w-4xl max-h-[90vh] overflow-hidden">
            <div className="p-6 border-b border-slate-700">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-white">
                    Price Alerts - Recent Changes
                  </h3>
                  <div className="text-sm text-slate-400 mt-1">
                    Last 7 days of price changes across all suppliers
                  </div>
                </div>
                <button
                  onClick={() => {
                    setShowPriceAlerts(false);
                    setPriceAlerts([]);
                  }}
                  className="text-slate-400 hover:text-white transition-colors"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-auto">
              <div className="p-6">
                {priceAlerts.length === 0 ? (
                  <div className="text-center py-8 text-slate-400">
                    No price changes detected in the last 7 days.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {priceAlerts.map((alert, index) => (
                      <div 
                        key={`${alert.cost_item_id}-${alert.supplier_id}-${index}`}
                        className={`p-4 border rounded-lg ${getChangeColorClass(alert.change_type)}`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex-1">
                            <div className="font-medium text-white mb-1">
                              {alert.supplier_name || `Supplier ${alert.supplier_id}`}
                            </div>
                            <div className="text-sm text-slate-300">
                              Item: {alert.cost_item_id}
                            </div>
                            <div className="text-sm text-slate-300">
                              {getChangeDescription(alert)}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-2xl font-bold text-white">
                              ${alert.new_rate.toFixed(2)}
                            </div>
                            {alert.old_rate && (
                              <div className="text-sm text-slate-300 line-through">
                                ${alert.old_rate.toFixed(2)}
                              </div>
                            )}
                          </div>
                        </div>
                        
                        {alert.difference && alert.old_rate && (
                          <div className="text-sm text-slate-300">
                            Change: {alert.difference > 0 ? '+' : ''}${alert.difference.toFixed(2)} 
                            ({((alert.difference / alert.old_rate) * 100).toFixed(1)}%)
                          </div>
                        )}
                        
                        {alert.effective_date && (
                          <div className="text-xs text-slate-400">
                            Effective: {new Date(alert.effective_date).toLocaleDateString()}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
