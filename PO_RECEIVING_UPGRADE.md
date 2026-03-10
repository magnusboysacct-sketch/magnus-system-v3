# Purchase Order Receiving / Delivery Tracking

## Overview

Added material receiving and delivery tracking functionality to Purchase Orders in the Procurement area.

## Changes Made

### 1. Database Migration

**File:** `supabase/migrations/[timestamp]_add_po_delivery_tracking.sql`

**Changes:**
- Added `delivered_qty` column to `purchase_order_items` table (default 0)
- Added CHECK constraint: `delivered_qty >= 0 AND delivered_qty <= quantity`
- Added index on `delivered_qty` for efficient queries

### 2. Library Functions

**File:** `src/lib/purchaseOrders.ts`

**Changes:**
- Updated `PurchaseOrderItem` interface to include `delivered_qty: number`
- Added `receiveItems()` function that:
  - Updates `delivered_qty` for each PO item
  - Syncs `delivered_qty` back to linked `procurement_items` (if `procurement_item_id` exists)
  - Auto-updates PO status based on delivery progress:
    - `issued` - No items delivered
    - `part_delivered` - Some items partially or fully delivered, but not all
    - `delivered` - All items fully delivered

### 3. UI Updates

**File:** `src/pages/ProcurementPage.tsx`

**Changes:**
- Added `handleReceiveItems()` handler in main component
- Updated `PurchaseOrderDocumentView` component props to include `onReceive` callback
- Added receiving mode state management:
  - `receivingMode` - Toggle between normal and receiving view
  - `deliveryQuantities` - Track delivery quantities for each item
- Added "Receive Materials" button (emerald color)
- Updated items table to show:
  - **Normal mode:** Ordered, Delivered, Balance columns with status badges
  - **Receiving mode:** Ordered, Delivered Qty (editable input) columns
- Added "Save Deliveries" and "Cancel" buttons when in receiving mode

## How It Works

### Receiving Flow

1. **Start Receiving:**
   - User clicks "Receive Materials" button
   - UI switches to receiving mode
   - Input fields appear for each item's delivered quantity
   - Existing `delivered_qty` values pre-populate the inputs

2. **Enter Quantities:**
   - User enters delivered quantities for items received
   - Quantities are validated (0 to ordered quantity)
   - Can partially deliver (e.g., 50 out of 100 units)

3. **Save:**
   - User clicks "Save Deliveries"
   - System updates `delivered_qty` for each PO item
   - If item is linked to procurement item, syncs the quantity
   - PO status auto-updates based on delivery progress
   - Page refreshes to show updated data

### Status Auto-Update Logic

**PO status automatically changes based on item deliveries:**

- **All items fully delivered** → Status: `delivered`
- **Any item partially delivered OR any item has deliveries** → Status: `part_delivered`
- **No deliveries** → Status: `issued` or `draft`

### Procurement Integration

**If PO item has `procurement_item_id` link:**
- Updates `procurement_items.delivered_qty` to match PO item
- Keeps procurement tracking in sync with PO deliveries
- Allows procurement workflow to track actual deliveries

### Display Features

**Normal View:**
- **Ordered:** Quantity ordered (with unit)
- **Delivered:** Quantity delivered with status badge:
  - "Complete" (green) - Fully delivered
  - "Partial" (orange) - Partially delivered
  - "Pending" (gray) - Not delivered
- **Balance:** Remaining quantity to deliver
- **Unit Rate:** Cost per unit
- **Total:** Line total

**Receiving Mode:**
- **Ordered:** Quantity ordered (with unit)
- **Delivered Qty:** Editable number input (0 to ordered qty)
- **Unit Rate:** Cost per unit
- **Total:** Line total

## Database Schema

### purchase_order_items

```sql
delivered_qty numeric DEFAULT 0
CONSTRAINT chk_po_items_delivered_qty_valid
  CHECK (delivered_qty >= 0 AND delivered_qty <= quantity)
```

## API Functions

### receiveItems(poId, itemDeliveries)

**Parameters:**
```typescript
poId: string
itemDeliveries: { itemId: string; deliveredQty: number }[]
```

**Process:**
1. For each item:
   - Validate `deliveredQty` (0 to quantity)
   - Update `purchase_order_items.delivered_qty`
   - If linked, update `procurement_items.delivered_qty`
2. Calculate new PO status from all items
3. Update PO status automatically

**Returns:**
```typescript
{ success: boolean; error?: string }
```

## Test Checklist

### Basic Receiving

- [ ] Navigate to: Project → Procurement → Purchase Orders
- [ ] Open any PO document
- [ ] Click "Receive Materials" button
- [ ] **Verify:** UI switches to receiving mode
- [ ] **Verify:** Input fields appear for delivered quantities
- [ ] **Verify:** Current `delivered_qty` values pre-populate inputs
- [ ] **Verify:** "Save Deliveries" and "Cancel" buttons appear
- [ ] **Verify:** Status dropdown and Print button hidden in receiving mode

### Enter Deliveries

- [ ] Enter delivered quantities for items (e.g., 50 out of 100)
- [ ] Try entering negative quantity
  - **Verify:** Browser validates input (min="0")
- [ ] Try entering quantity > ordered quantity
  - **Verify:** Database constraint prevents invalid save
- [ ] Click "Cancel"
  - **Verify:** Returns to normal view without saving
- [ ] Click "Receive Materials" again
- [ ] Enter valid quantities
- [ ] Click "Save Deliveries"
  - **Verify:** Page refreshes with updated data
  - **Verify:** Delivered column shows new quantities
  - **Verify:** Status badges show "Partial" or "Complete"
  - **Verify:** Balance column shows correct remaining qty

### Status Updates

- [ ] **Test Partial Delivery:**
  - Set delivered_qty < quantity for some items
  - **Verify:** PO status changes to "Part Delivered"

- [ ] **Test Full Delivery:**
  - Set delivered_qty = quantity for all items
  - **Verify:** PO status changes to "Delivered"

- [ ] **Test No Delivery:**
  - Set delivered_qty = 0 for all items
  - **Verify:** PO status remains "Issued" or "Draft"

### Procurement Integration

- [ ] Create PO from procurement items (with link)
- [ ] Receive materials on PO
- [ ] Navigate to Procurement → Procurement Documents
- [ ] Open linked procurement document
- [ ] **Verify:** Procurement items show updated `delivered_qty`

### Display Verification

#### Normal View
- [ ] **Ordered:** Shows correct quantity with unit
- [ ] **Delivered:** Shows delivered quantity
- [ ] **Status Badge:**
  - [ ] "Complete" (green) when fully delivered
  - [ ] "Partial" (orange) when partially delivered
  - [ ] "Pending" (gray) when not delivered
- [ ] **Balance:** Shows correct remaining quantity
- [ ] **Unit Rate:** Shows cost per unit
- [ ] **Total:** Shows line total

#### Receiving Mode
- [ ] **Ordered:** Shows quantity with unit
- [ ] **Delivered Qty:** Shows editable input
- [ ] **Input validation:** 0 to ordered quantity
- [ ] **Unit Rate:** Shows cost per unit
- [ ] **Total:** Shows line total

### Edge Cases

- [ ] Receive materials on PO without procurement link
  - **Verify:** Works correctly, no procurement sync errors
- [ ] Receive 0 quantity
  - **Verify:** Saves correctly, no errors
- [ ] Receive exact ordered quantity
  - **Verify:** Status updates to "Delivered"
- [ ] Multiple partial deliveries (receive, then receive more)
  - **Verify:** Quantities accumulate correctly
- [ ] Cancel receiving multiple times
  - **Verify:** No side effects

### UI/UX

- [ ] "Receive Materials" button is emerald color
- [ ] Button disabled states work correctly
- [ ] Input fields have proper validation
- [ ] Table columns adjust properly in receiving mode
- [ ] Status badges have correct colors
- [ ] Number inputs format correctly (2 decimals)

## Build Status

✅ Build successful
✅ No TypeScript errors
✅ No new warnings

## Files Changed

1. **Database:** `supabase/migrations/[timestamp]_add_po_delivery_tracking.sql`
2. **Library:** `src/lib/purchaseOrders.ts`
3. **UI:** `src/pages/ProcurementPage.tsx`

## Summary

**What was added:**
- Material receiving/delivery tracking for Purchase Orders
- Delivered quantity tracking per PO item
- Auto-updating PO status based on deliveries
- Sync to procurement items if linked
- Compact receiving UI with editable quantities
- Status badges showing delivery progress

**How to use:**
1. Open any Purchase Order
2. Click "Receive Materials"
3. Enter delivered quantities
4. Click "Save Deliveries"
5. View updated delivery status and balances

**Status flow:**
- Draft → Issued → Part Delivered → Delivered

**Safe features:**
- Validates quantity ranges (0 to ordered)
- Syncs to procurement only if linked
- Auto-calculates balance quantities
- No manual status changes needed
