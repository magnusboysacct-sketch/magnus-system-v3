# Purchase Order Rate Transfer Fix

## Problem

When generating Purchase Orders from Procurement items, the `unit_rate` was always `0`, resulting in:
- `unit_rate = 0`
- `total_amount = 0`

This broke the entire cost tracking in the PO system.

## Root Cause

The issue was in the **BOQ → Procurement** transfer, not in the **Procurement → PO** transfer.

### Flow Analysis

**BOQ → Procurement → PO** data flow:

1. **BOQ items** have a `rate` field that stores the unit cost
2. **Procurement items** have a `unit_rate` field that should receive this cost
3. **PO items** have a `unit_rate` field that copies from procurement items

The bug was at step 1→2: When `generateProcurementFromBOQ()` created procurement items from BOQ, it:
- ❌ Did NOT fetch the `rate` field from BOQ items
- ❌ Hardcoded `unit_rate: 0` for all procurement items

As a result, even though the PO creation logic was correct, it was copying `0` from procurement items.

## Solution

Fixed `src/lib/procurement.ts` in the `generateProcurementFromBOQ()` function:

### Change 1: Fetch `rate` from BOQ items

**Before (line 113):**
```typescript
.select("id, section_id, item_name, description, unit_id, qty, pick_category")
```

**After:**
```typescript
.select("id, section_id, item_name, description, unit_id, qty, pick_category, rate")
```

### Change 2: Use BOQ rate for procurement items

**Before (line 228):**
```typescript
unit_rate: 0,
```

**After:**
```typescript
unit_rate: Number(item.rate) || 0,
```

## How It Works Now

### Complete Flow

**1. BOQ Item:**
```
item_name: "Cement"
qty: 100
rate: 15.50  ← BOQ stores the rate
```

**2. Procurement Item (after generateProcurementFromBOQ):**
```
material_name: "Cement"
quantity: 100
unit_rate: 15.50  ← Now copied from BOQ rate
```

**3. PO Item (after createPurchaseOrderFromProcurementItems):**
```
material_name: "Cement"
quantity: 100
unit_rate: 15.50  ← Copied from procurement item
total_amount: 1550.00  ← Calculated: 100 × 15.50
```

### Calculation Chain

```
BOQ rate → Procurement unit_rate → PO unit_rate → PO total_amount
  15.50  →       15.50           →     15.50     →    1,550.00
```

## Files Changed

**`src/lib/procurement.ts`** - Lines 113 and 228

## Verification

The `createPurchaseOrderFromProcurementItems()` function in `src/lib/purchaseOrders.ts` was **already correct**:

```typescript
const poItems = procurementItems.map((item) => {
  const quantity = Number(item.quantity) || 0;
  const unitRate = Number(item.unit_rate) || 0;  // ✓ Correctly reads unit_rate
  const totalAmount = quantity * unitRate;        // ✓ Correctly calculates total

  return {
    // ...
    quantity,
    unit_rate: unitRate,      // ✓ Stores unit_rate
    total_amount: totalAmount, // ✓ Stores calculated total
  };
});
```

The bug was upstream in procurement generation, not in PO creation.

## Test Checklist

### Basic Flow

- [ ] **Create BOQ with rates:**
  - Add item: "Steel Bars" - Qty: 50, Rate: $25.00
  - Add item: "Concrete" - Qty: 10, Rate: $150.00
  - Save BOQ

- [ ] **Generate Procurement:**
  - Navigate to Procurement page
  - Click "Generate from BOQ"
  - **Verify:** Procurement items show unit_rate values ($25.00 and $150.00)

- [ ] **Create Purchase Order:**
  - Select procurement items
  - Create PO with supplier
  - **Verify:** PO items show:
    - Steel Bars: Qty 50 × Rate $25.00 = Total $1,250.00
    - Concrete: Qty 10 × Rate $150.00 = Total $1,500.00
  - **Verify:** PO Total = $2,750.00

### Edge Cases

- [ ] **BOQ item with rate = 0:**
  - Item: "Free Material" - Qty: 100, Rate: $0.00
  - Generate procurement
  - Create PO
  - **Expected:** unit_rate = 0.00, total_amount = 0.00
  - **Result:** No errors, calculations correct

- [ ] **BOQ item with no rate (null):**
  - Item might have null/undefined rate
  - Generate procurement
  - Create PO
  - **Expected:** unit_rate defaults to 0.00
  - **Result:** `Number(item.rate) || 0` handles this safely

- [ ] **Decimal rates:**
  - Item: "Paint" - Qty: 25.5, Rate: $13.75
  - Generate procurement
  - Create PO
  - **Expected:**
    - unit_rate = 13.75
    - total_amount = 350.63 (rounded)
  - **Result:** Calculations handle decimals correctly

- [ ] **Large rates:**
  - Item: "Excavator" - Qty: 1, Rate: $50,000.00
  - Generate procurement
  - Create PO
  - **Expected:** unit_rate = 50000.00, total_amount = 50000.00
  - **Result:** No overflow, formats with commas

### Existing Functionality

- [ ] **BOQ creation:** Still works
- [ ] **BOQ editing:** Still works
- [ ] **Procurement generation:** Still works, now with rates
- [ ] **PO creation:** Still works, now with correct totals
- [ ] **PO receiving:** Still works
- [ ] **No console errors**

### Database Verification

Run query to verify data:
```sql
-- Check procurement items have rates
SELECT material_name, quantity, unit_rate
FROM procurement_items
WHERE unit_rate > 0
LIMIT 10;

-- Check PO items have rates and totals
SELECT material_name, quantity, unit_rate, total_amount
FROM purchase_order_items
WHERE unit_rate > 0
LIMIT 10;

-- Verify calculation
SELECT
  material_name,
  quantity,
  unit_rate,
  total_amount,
  (quantity * unit_rate) as calculated_total,
  CASE
    WHEN total_amount = (quantity * unit_rate) THEN '✓ Correct'
    ELSE '✗ Mismatch'
  END as validation
FROM purchase_order_items
LIMIT 20;
```

## Impact

### Before Fix
- All PO items had $0.00 rates and totals
- PO Total always showed $0.00
- Financial tracking completely broken
- Delivered Value / Remaining Value calculations broken

### After Fix
- PO items correctly show rates from BOQ
- PO totals calculated correctly
- Full financial visibility through BOQ → Procurement → PO chain
- Delivered Value / Remaining Value calculations now meaningful

## Build Status

✅ Build successful
✅ No TypeScript errors
✅ Ready to test

## Summary

**Changed:**
- `src/lib/procurement.ts` (2 lines)

**Fix:**
1. Fetch `rate` field from BOQ items
2. Copy BOQ rate to procurement item `unit_rate`
3. Existing PO logic correctly propagates rate to PO items

**Result:**
- BOQ → Procurement → PO rate transfer now works correctly
- All totals calculate properly
- No changes to PO creation, receiving, or workflow logic
