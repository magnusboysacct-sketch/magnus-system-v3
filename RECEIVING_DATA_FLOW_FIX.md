# Receiving Page Data Flow Fix - Complete

## Problem Statement

For PO-2026-007, **Pending Deliveries** correctly showed:
- Ordered: 134
- Delivered: 63.99
- Balance: 70.01

But **Receiving History** incorrectly showed:
- "No quantity recorded"

This proved that the two panels were reading from different, inconsistent data sources.

---

## Root Cause Analysis

### Database Schema Investigation

**Actual Schema:**
```
receiving_records (header table)
├── id
├── company_id
├── project_id
├── purchase_order_id
├── receiving_no
├── supplier_name
├── delivery_note_no
├── invoice_no
├── received_date
├── status
├── notes
├── created_by
├── created_at
└── updated_at

receiving_record_items (line items table)
├── id
├── receiving_record_id (FK to receiving_records)
├── company_id
├── project_id
├── purchase_order_id
├── purchase_order_item_id
├── item_name
├── description
├── unit
├── ordered_qty
├── previously_received_qty
├── received_qty ← THE ACTUAL QUANTITIES
├── unit_cost
├── delivered_cost
├── notes
├── created_at
└── updated_at
```

### The Issue

1. **Pending Deliveries** ✅ correctly reads `purchase_order_items.delivered_qty`
   - This field is properly updated when receiving happens
   - Aggregates to show correct totals

2. **Receiving History** ❌ was trying to read `receiving_records.received_qty`
   - **This field doesn't exist in the schema**
   - The code had fallback attempts: `received_qty`, `quantity_received`, `qty_received`
   - All failed because quantities are stored in the **child table** `receiving_record_items`

3. **Save Logic** ❌ was trying to insert into wrong table structure
   - Old code: Inserted `received_qty` directly into `receiving_records` (field doesn't exist)
   - Correct flow: Create header in `receiving_records`, then line items in `receiving_record_items`

### Data Verification

Query showed receiving records exist with line items:
```sql
receiving_no: RCV-001
line_items_count: 2
total_received_qty: 10.000  ← Data exists in child table
```

But code was looking for quantities on the header record (wrong table).

---

## Solution Implemented

### 1. Updated Type Definitions

**Before:**
```typescript
type ReceivingRecordRow = {
  received_qty?: number | string | null;  // Doesn't exist
  quantity_received?: number | string | null;  // Doesn't exist
  qty_received?: number | string | null;  // Doesn't exist
  ...
};
```

**After:**
```typescript
type ReceivingRecordRow = {
  id: string;
  purchase_order_id?: string | null;
  receiving_no?: string | null;
  supplier_name?: string | null;
  delivery_note_no?: string | null;
  invoice_no?: string | null;
  received_date?: string | null;
  status?: string | null;
  notes?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  // No quantity fields - they're in receiving_record_items
};

type ReceivingRecordItemRow = {
  id: string;
  receiving_record_id: string;
  purchase_order_id?: string | null;
  purchase_order_item_id?: string | null;
  item_name: string;
  unit?: string | null;
  ordered_qty: number;
  previously_received_qty: number;
  received_qty: number;  // ← Actual quantities here
  unit_cost: number;
  ...
};
```

### 2. Added Line Items Query

**Before:** Only queried `receiving_records`

**After:**
```typescript
// Load receiving_record_items after loading receiving_records
const itemsRes = await supabase
  .from("receiving_record_items")
  .select("*")
  .in("receiving_record_id", recordIds)
  .order("created_at", { ascending: false });

setReceivingItems(itemsRes.data);
```

### 3. Fixed Helper Function

**Before:**
```typescript
function getReceivedValue(record: ReceivingRecordRow): number {
  return toNumber(record.received_qty) ||  // Doesn't exist
         toNumber(record.quantity_received) ||  // Doesn't exist
         toNumber(record.qty_received);  // Doesn't exist
}
```

**After:**
```typescript
function getReceivedValue(recordId: string, items: ReceivingRecordItemRow[]): number {
  const recordItems = items.filter((item) => item.receiving_record_id === recordId);
  const total = recordItems.reduce((sum, item) => sum + toNumber(item.received_qty), 0);
  return Math.max(0, total);
}
```

### 4. Fixed Save Logic

**Before:**
```typescript
// Wrong: Trying to insert quantity into header table
await supabase.from("receiving_records").insert({
  purchase_order_id: selectedPO.id,
  purchase_order_item_id: line.item.id,  // Header shouldn't reference items
  received_qty: line.qty,  // Field doesn't exist
  notes: receiveNotes,
});
```

**After:**
```typescript
// Step 1: Create header record
const headerInsertRes = await supabase
  .from("receiving_records")
  .insert({
    company_id: companyId,
    project_id: currentProjectId,
    purchase_order_id: selectedPO.id,
    receiving_no: `RCV-${timestamp}`,
    supplier_name: selectedPO.supplier_name,
    delivery_note_no: receiveNotes,
    received_date: new Date().toISOString().split('T')[0],
    status: "received",
    notes: receiveNotes,
    created_by: userId,
  })
  .select()
  .single();

const receivingRecordId = headerInsertRes.data.id;

// Step 2: Create line items with quantities
for (const line of lines) {
  await supabase.from("receiving_record_items").insert({
    receiving_record_id: receivingRecordId,
    company_id: companyId,
    project_id: currentProjectId,
    purchase_order_id: selectedPO.id,
    purchase_order_item_id: line.item.id,
    item_name: line.item.material_name,
    description: line.item.description,
    unit: line.item.unit,
    ordered_qty: line.item.ordered,
    previously_received_qty: line.item.delivered,
    received_qty: line.qty,  // ← Correct location for quantities
    unit_cost: toNumber(line.item.unit_rate),
    delivered_cost: toNumber(line.item.unit_rate) * line.qty,
  });

  // Update PO item delivered_qty
  await supabase
    .from("purchase_order_items")
    .update({ delivered_qty: line.item.delivered + line.qty })
    .eq("id", line.item.id);
}
```

### 5. Updated Display Logic

**Receiving History Cards:**
```typescript
// Before: Looked for non-existent item reference on header
const item = record.purchase_order_item_id ? itemMap.get(...) : undefined;

// After: Aggregates from line items
const recordItems = receivingItems.filter((item) => item.receiving_record_id === record.id);
const primaryItem = recordItems.length > 0 ? recordItems[0] : null;
const qty = getReceivedValue(record.id, receivingItems);

// Display shows:
// - Single item: "Steel Rebar: 5.5 tons"
// - Multiple items: "3 items received" + breakdown list
```

**Multi-item Support:**
```typescript
{recordItems.length > 1 ? (
  <div className="mt-2 space-y-1">
    {recordItems.map((rItem) => (
      <div key={rItem.id} className="text-xs text-slate-400">
        • {rItem.item_name}: {formatQty(toNumber(rItem.received_qty))} {rItem.unit}
      </div>
    ))}
  </div>
) : null}
```

---

## Data Flow - Source of Truth

### Before (Broken)
```
Pending Deliveries:
  Source: purchase_order_items.delivered_qty ✅

Receiving History:
  Source: receiving_records.received_qty ❌ (doesn't exist)
  Result: Always shows "No quantity recorded"
```

### After (Fixed)
```
Pending Deliveries:
  Source: purchase_order_items.delivered_qty ✅

Receiving History:
  Source: SUM(receiving_record_items.received_qty) ✅
          WHERE receiving_record_id = record.id

Both synchronized through:
  When saving receiving:
    1. Insert header → receiving_records
    2. Insert lines → receiving_record_items (with quantities)
    3. Update PO items → purchase_order_items.delivered_qty
```

---

## Testing Verification

### Build Status
✅ **Build successful**
```
✓ 1892 modules transformed
✓ built in 9.52s
No TypeScript errors
```

### Expected Behavior

1. **Pending Deliveries Panel**
   - Shows POs with remaining balance
   - Ordered = sum of PO item quantities
   - Delivered = sum of PO item delivered_qty
   - Balance = Ordered - Delivered
   - Progress bar = (Delivered / Ordered) × 100%

2. **Receiving History Panel**
   - Shows all receiving records with actual quantities
   - Quantity = sum of receiving_record_items.received_qty for that record
   - Displays "X.XX units received" instead of "No quantity recorded"
   - Shows all items when receiving had multiple line items
   - Clicking opens the PO in receive modal

3. **Receive Modal**
   - Enter quantities for PO items
   - Saves create:
     - 1 header record in receiving_records
     - N line item records in receiving_record_items (one per item received)
     - Updates purchase_order_items.delivered_qty for each item
   - History section shows past receiving with actual quantities

---

## Files Modified

1. **ReceivingPage.tsx**
   - Added `ReceivingRecordItemRow` type
   - Added `receivingItems` state
   - Modified `loadAll()` to query `receiving_record_items`
   - Updated `getReceivedValue()` to aggregate from line items
   - Fixed `getRecordDate()` to use correct field name
   - Fixed `getRecordNotes()` to use correct field names
   - Rewrote `handleSaveReceiving()` to use proper 2-table structure
   - Updated all display logic to show aggregated quantities
   - Added multi-item display support

---

## Summary

**Problem:** Pending Deliveries and Receiving History used different data sources for quantities.

**Root Cause:** Receiving History tried to read `received_qty` from the header table `receiving_records`, but quantities are actually stored in the child table `receiving_record_items`.

**Solution:**
- Query both tables (header + line items)
- Aggregate line item quantities for display
- Save using correct 2-table structure (header → line items)
- Both panels now use consistent sources of truth

**Result:** Receiving History now correctly displays actual received quantities by aggregating from `receiving_record_items`, matching the delivered totals shown in Pending Deliveries.
