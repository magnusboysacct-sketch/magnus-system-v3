import type { ProcurementItem } from "../lib/procurement";
import type { Supplier } from "../lib/suppliers";

export interface ProcurementItemWithSource extends ProcurementItem {
  source_boq_item_id: string | null;
  supplier_id?: string | null;
}

export interface SupplierWithPerformance extends Supplier {
  average_rating?: number;
  rating_count?: number;
}

export interface BestPriceResult {
  best_price?: {
    supplier_id: string;
    supplier_name: string;
    rate: number;
  } | null;
  suppliers?: Array<{
    supplier_id: string;
    supplier_name: string;
    rate: number;
  }>;
}
