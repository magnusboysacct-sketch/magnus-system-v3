# Purchase Orders Foundation - Implementation Summary

## Overview
Complete database and library foundation for Purchase Order system in Magnus System v3. NO UI changes - backend only.

---

## Database Migration: `create_purchase_orders`

### New Tables Created

#### 1. `purchase_orders`
Purchase order headers for formalizing material orders with suppliers.

**Columns:**
- `id` (uuid, PK) - Unique identifier
- `company_id` (uuid, FK → companies) - Company ownership
- `project_id` (uuid, FK → projects) - Parent project
- `supplier_id` (uuid, FK → suppliers, nullable) - Supplier from directory (optional)
- `supplier_name` (text, NOT NULL) - Supplier name (from directory or manual)
- `po_number` (text, NOT NULL) - PO number (e.g., "PO-2026-001")
- `title` (text, NOT NULL) - PO title/description
- `status` (text, default 'draft') - PO status
- `issue_date` (date, nullable) - Date issued to supplier
- `expected_date` (date, nullable) - Expected delivery date
- `notes` (text, nullable) - Additional notes
- `created_at` (timestamptz)
- `updated_at` (timestamptz)

**Status Values (CHECK constraint):**
- `draft` - Being prepared
- `issued` - Sent to supplier
- `part_delivered` - Partially received
- `delivered` - Fully received
- `cancelled` - Cancelled

**Indexes:**
- `idx_purchase_orders_company_id` - Fast company filtering
- `idx_purchase_orders_project_id` - Fast project filtering
- `idx_purchase_orders_supplier_id` - Supplier lookups
- `idx_purchase_orders_po_number` - Quick PO searches
- `idx_purchase_orders_status` - Status filtering
- `idx_purchase_orders_company_po_number_unique` (UNIQUE) - No duplicate PO numbers per company

#### 2. `purchase_order_items`
Line items within purchase orders.

**Columns:**
- `id` (uuid, PK) - Unique identifier
- `purchase_order_id` (uuid, FK → purchase_orders) - Parent PO
- `procurement_item_id` (uuid, FK → procurement_items, nullable) - Source procurement item
- `material_name` (text, NOT NULL) - Material/item name
- `description` (text, nullable) - Item description
- `quantity` (numeric, NOT NULL) - Quantity ordered
- `unit` (text, nullable) - Unit of measurement
- `unit_rate` (numeric, default 0) - Rate per unit
- `total_amount` (numeric, default 0) - Total cost (quantity × unit_rate)
- `created_at` (timestamptz)
- `updated_at` (timestamptz)

**CHECK Constraints:**
- `chk_po_items_quantity_positive` - quantity > 0
- `chk_po_items_unit_rate_non_negative` - unit_rate >= 0
- `chk_po_items_total_non_negative` - total_amount >= 0

**Indexes:**
- `idx_po_items_purchase_order_id` - Fast item lookups by PO
- `idx_po_items_procurement_item_id` - Track PO source

### Security (RLS)

Both tables have full RLS enabled with project member policies:
- Users can only access POs for projects they're members of
- CRUD operations restricted to project members
- Company isolation enforced via project membership

### Triggers

Auto-update `updated_at` timestamp on both tables.

---

## Library: `src/lib/purchaseOrders.ts`

### Types

```typescript
type PurchaseOrderStatus = "draft" | "issued" | "part_delivered" | "delivered" | "cancelled"

interface PurchaseOrder {
  id: string
  company_id: string
  project_id: string
  supplier_id: string | null
  supplier_name: string
  po_number: string
  title: string
  status: PurchaseOrderStatus
  issue_date: string | null
  expected_date: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

interface PurchaseOrderItem {
  id: string
  purchase_order_id: string
  procurement_item_id: string | null
  material_name: string
  description: string | null
  quantity: number
  unit: string | null
  unit_rate: number
  total_amount: number
  created_at: string
  updated_at: string
}

interface PurchaseOrderWithItems extends PurchaseOrder {
  items: PurchaseOrderItem[]
  itemCount: number
  totalValue: number
}
```

### Core Functions

#### `listPurchaseOrders(projectId?: string): Promise<PurchaseOrderWithItems[]>`
Lists all POs, optionally filtered by project. Returns POs with item counts and total values.

#### `getPurchaseOrder(id: string): Promise<PurchaseOrderWithItems | null>`
Fetches single PO with all items and calculated totals.

#### `createPurchaseOrder(input: CreatePurchaseOrderInput): Promise<Result>`
Creates new PO header. Auto-fetches company_id from user profile.

**Input:**
```typescript
{
  project_id: string
  supplier_id?: string | null
  supplier_name: string
  po_number: string
  title: string
  status?: PurchaseOrderStatus
  issue_date?: string | null
  expected_date?: string | null
  notes?: string | null
}
```

#### `updatePurchaseOrder(id: string, updates: Partial<PurchaseOrder>): Promise<Result>`
Updates PO header. Auto-updates `updated_at` timestamp.

#### `deletePurchaseOrder(id: string): Promise<Result>`
Deletes PO (cascade deletes all items via FK).

#### `createPurchaseOrderFromProcurementItems(input): Promise<Result>`
**Key Function** - Creates PO from selected procurement items.

**Input:**
```typescript
{
  project_id: string
  supplier_id?: string | null
  supplier_name: string
  po_number: string
  title: string
  procurement_item_ids: string[]
  issue_date?: string | null
  expected_date?: string | null
  notes?: string | null
}
```

**Process:**
1. Validates user's company
2. Fetches selected procurement items
3. Creates PO header
4. Creates PO items from procurement items
5. Computes `total_amount = quantity × unit_rate` for each item
6. Logs activity
7. Returns complete PO with items

**Rollback:** If item creation fails, deletes the PO header.

### Item Management Functions

#### `addPurchaseOrderItem(purchaseOrderId, item): Promise<Result>`
Adds single item to existing PO. Auto-calculates `total_amount`.

#### `updatePurchaseOrderItem(id, updates): Promise<Result>`
Updates PO item. Auto-recalculates `total_amount` if quantity or unit_rate changes.

#### `deletePurchaseOrderItem(id): Promise<Result>`
Deletes single PO item.

### Utility Functions

#### `generatePONumber(companyId: string, year?: number): Promise<string>`
Auto-generates next PO number for company.

**Format:** `PO-{YEAR}-{XXX}`

**Logic:**
- Finds highest PO number for company in given year
- Increments and pads to 3 digits
- Returns `PO-2026-001`, `PO-2026-002`, etc.

---

## Activity Type Updates

Added to `src/lib/activity.ts`:

**New Activity Types:**
- `purchase_order_created` - PO created (📋 blue)
- `purchase_order_issued` - PO sent to supplier (📤 green)
- `purchase_order_delivered` - PO fully delivered (✅ emerald)

Used in:
- `createPurchaseOrder()` - logs "purchase_order_created"
- `createPurchaseOrderFromProcurementItems()` - logs "purchase_order_created"

---

## Data Flow

### Creating PO from Procurement

```
Procurement Items (pending/ordered)
         ↓
User selects items + supplier
         ↓
createPurchaseOrderFromProcurementItems()
         ↓
1. Create purchase_orders record
2. Create purchase_order_items records
   - Links via procurement_item_id
   - Copies: material_name, description, quantity, unit, unit_rate
   - Computes: total_amount = quantity × unit_rate
         ↓
PurchaseOrderWithItems returned
```

### Supplier Handling

**From Directory:**
- `supplier_id` = supplier.id
- `supplier_name` = supplier.supplier_name

**Manual Entry:**
- `supplier_id` = null
- `supplier_name` = user-entered text

Both stored as text in `supplier_name` for consistency.

---

## Database Relationships

```
companies
   ↓ (company_id)
purchase_orders ←─────┐
   ↓ (purchase_order_id) │
purchase_order_items   │
   ↓ (procurement_item_id, nullable)
procurement_items ─────┘

projects
   ↓ (project_id)
purchase_orders

suppliers (nullable)
   ↓ (supplier_id)
purchase_orders
```

---

## Safety Features

### Data Integrity
- ✅ All foreign keys with proper cascade/set null
- ✅ CHECK constraints on status values
- ✅ CHECK constraints on numeric fields (positive quantity, non-negative rates)
- ✅ Unique constraint on PO number per company
- ✅ NOT NULL on critical fields

### Security
- ✅ Full RLS on both tables
- ✅ Project member access control
- ✅ Company isolation via project membership
- ✅ No cross-company data leakage

### Transactions
- ✅ Rollback on item creation failure
- ✅ Auto-update timestamps
- ✅ Activity logging

### Backward Compatibility
- ✅ No changes to procurement tables
- ✅ procurement_item_id is nullable (PO can exist without procurement)
- ✅ Manual PO creation supported
- ✅ supplier_id nullable (manual supplier entry allowed)

---

## What's NOT Included (By Design)

- ❌ No UI components
- ❌ No print functionality
- ❌ No PDF generation
- ❌ No email/sending logic
- ❌ No approval workflow (status changes manual)
- ❌ No auto-update of procurement items when PO issued
- ❌ No inventory tracking
- ❌ No payment tracking

These are intentionally excluded - foundation only.

---

## Testing Checklist

### Database Tests
- [ ] Create purchase order with directory supplier
- [ ] Create purchase order with manual supplier (supplier_id = null)
- [ ] Verify unique constraint on (company_id, po_number)
- [ ] Test status CHECK constraint (reject invalid status)
- [ ] Test quantity CHECK constraint (reject quantity <= 0)
- [ ] Test cascade delete (delete PO → items deleted)
- [ ] Test RLS (user A cannot see user B's POs)

### Library Tests
- [ ] `listPurchaseOrders()` returns correct item counts
- [ ] `getPurchaseOrder()` calculates totalValue correctly
- [ ] `createPurchaseOrder()` auto-fetches company_id
- [ ] `createPurchaseOrderFromProcurementItems()` with 5 items
- [ ] Verify total_amount = quantity × unit_rate for each item
- [ ] Test rollback on item creation failure
- [ ] `generatePONumber()` increments correctly
- [ ] Test PO-2026-001, PO-2026-002, PO-2026-003 sequence
- [ ] `updatePurchaseOrderItem()` recalculates total_amount
- [ ] Activity logging works for PO creation

### Integration Tests
- [ ] Create procurement items from BOQ
- [ ] Create PO from procurement items
- [ ] Verify procurement_item_id links correctly
- [ ] Update PO item quantity → total_amount updates
- [ ] Delete PO → all items deleted
- [ ] Multi-company isolation (Company A vs Company B)

---

## Next Steps (Future Work)

1. **UI Components**
   - Purchase Order list page
   - PO detail/edit page
   - "Create PO from Procurement" button
   - PO item editing

2. **Print/PDF**
   - PO print layout
   - PDF generation
   - Email to supplier

3. **Workflow**
   - PO approval process
   - Status transitions
   - Auto-update procurement items when PO issued

4. **Advanced Features**
   - Delivery tracking
   - Partial deliveries
   - Payment tracking
   - Supplier performance

---

## File Changes Summary

### New Files
- `src/lib/purchaseOrders.ts` (479 lines)

### Modified Files
- `src/lib/activity.ts` - Added 3 new activity types

### Database Migration
- `create_purchase_orders` - 2 tables, 11 indexes, 8 RLS policies, 2 triggers

---

## Build Status
✅ TypeScript compilation successful
✅ No errors
✅ No warnings (except bundle size - existing)

---

## Usage Example

```typescript
import {
  createPurchaseOrderFromProcurementItems,
  generatePONumber
} from './lib/purchaseOrders';

// Generate PO number
const poNumber = await generatePONumber(companyId);

// Create PO from procurement items
const result = await createPurchaseOrderFromProcurementItems({
  project_id: "abc-123",
  supplier_id: "supplier-uuid",
  supplier_name: "ABC Supplies Ltd",
  po_number: poNumber,
  title: "Materials Order - Week 12",
  procurement_item_ids: ["item-1", "item-2", "item-3"],
  issue_date: "2026-03-15",
  expected_date: "2026-03-22",
  notes: "Urgent delivery required"
});

if (result.success) {
  console.log("PO created:", result.data.po_number);
  console.log("Items:", result.data.itemCount);
  console.log("Total:", result.data.totalValue);
}
```

---

**Foundation Complete. Ready for UI integration.**
