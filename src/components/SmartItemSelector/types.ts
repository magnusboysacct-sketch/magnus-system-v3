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
