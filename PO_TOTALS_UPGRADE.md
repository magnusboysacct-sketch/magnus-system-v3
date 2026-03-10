# Purchase Order Document Totals Upgrade

## Overview

Enhanced the Purchase Order document view footer to show three financial totals instead of just one, providing complete visibility into ordered, delivered, and remaining values for partial deliveries.

## Changes Made

### File Changed

**`src/pages/ProcurementPage.tsx`** - Purchase Order document view footer

### What Changed

**Before:**
- Footer showed only "Total" with PO total value
- No visibility into how much value was delivered vs remaining
- Single row footer

**After:**
- Footer shows 3 columns in a grid layout:
  1. **PO Total** - Original total value (white)
  2. **Delivered Value** - Value of delivered items (green)
  3. **Remaining Value** - Value of undelivered items (white)

### Footer Layout

The new footer uses a 3-column grid showing:

```
┌─────────────────┬──────────────────┬──────────────────┐
│ PO Total        │ Delivered Value  │ Remaining Value  │
│ $10,000.00      │ $6,500.00       │ $3,500.00       │
└─────────────────┴──────────────────┴──────────────────┘
```

## Calculations Used

### 1. PO Total
```typescript
purchaseOrder.totalValue
```
- **Source:** Existing field from PO header
- **What it represents:** Total value of all items ordered
- **Calculation:** Sum of all item `total_amount` (quantity × unit_rate)

### 2. Delivered Value
```typescript
Sum of: delivered_qty × unit_rate for each item
```
- **Formula:** `Σ(item.delivered_qty × item.unit_rate)`
- **What it represents:** Actual dollar value of materials received so far
- **Example:**
  - Item A: 50 units delivered × $10/unit = $500
  - Item B: 100 units delivered × $25/unit = $2,500
  - **Delivered Value = $3,000**

### 3. Remaining Value
```typescript
Sum of: (quantity - delivered_qty) × unit_rate for each item
```
- **Formula:** `Σ((item.quantity - item.delivered_qty) × item.unit_rate)`
- **What it represents:** Dollar value of materials still to be delivered
- **Example:**
  - Item A: (100 ordered - 50 delivered) × $10/unit = $500
  - Item B: (150 ordered - 100 delivered) × $25/unit = $1,250
  - **Remaining Value = $1,750**

### Validation
```
PO Total = Delivered Value + Remaining Value
```

## Example Scenario

**Purchase Order #PO-2026-001:**

| Item | Ordered | Delivered | Balance | Unit Rate | Item Total | Delivered Value | Remaining Value |
|------|---------|-----------|---------|-----------|------------|-----------------|-----------------|
| Cement | 100 bags | 60 bags | 40 bags | $15.00 | $1,500.00 | $900.00 | $600.00 |
| Steel | 50 tons | 50 tons | 0 tons | $500.00 | $25,000.00 | $25,000.00 | $0.00 |
| Sand | 200 m³ | 0 m³ | 200 m³ | $30.00 | $6,000.00 | $0.00 | $6,000.00 |

**Footer Totals:**
- **PO Total:** $32,500.00
- **Delivered Value:** $25,900.00 (green) - 79.7% delivered
- **Remaining Value:** $6,600.00 - 20.3% pending

## Visual Design

**Layout:**
- 3-column grid within footer row
- Equal spacing between columns
- Labels in slate-400 (light gray)
- Values in larger font (text-base)
- Delivered Value highlighted in emerald-400 (green)
- PO Total and Remaining Value in white

**Responsive:**
- Works in both receiving mode and view mode
- Adjusts column span based on table columns (receivingMode affects header columns)

## Benefits

1. **Financial Visibility**
   - See exactly how much money has been delivered
   - Track remaining financial commitment
   - Monitor delivery progress in dollar terms, not just quantities

2. **Budget Tracking**
   - Understand cash flow impact of partial deliveries
   - Know how much value is still pending
   - Make informed decisions about payment schedules

3. **Delivery Monitoring**
   - Quick assessment of delivery completion
   - Identify high-value outstanding items
   - Track supplier performance financially

4. **No Breaking Changes**
   - PO Total still displayed prominently
   - All existing functionality preserved
   - Receiving mode unaffected
   - Print functionality unaffected

## Test Checklist

### Basic Display

- [ ] Navigate to: Procurement → Purchase Orders → [Select any PO]
- [ ] **Verify:** Footer displays 3 columns (PO Total, Delivered Value, Remaining Value)
- [ ] **Verify:** All values formatted as currency ($X,XXX.XX)
- [ ] **Verify:** Delivered Value is green (text-emerald-400)
- [ ] **Verify:** Layout is clean and aligned

### Calculations - New PO (No Deliveries)

Create new PO with 3 items:
- Item A: 100 units @ $10/unit = $1,000
- Item B: 50 units @ $20/unit = $1,000
- Item C: 25 units @ $40/unit = $1,000

**Expected Footer:**
- [ ] **PO Total:** $3,000.00
- [ ] **Delivered Value:** $0.00
- [ ] **Remaining Value:** $3,000.00
- [ ] **Validation:** $3,000 = $0 + $3,000 ✓

### Calculations - Partial Delivery

Using same PO, receive:
- Item A: 50 units (50% delivered)
- Item B: 50 units (100% delivered)
- Item C: 0 units (0% delivered)

**Expected Footer:**
- [ ] **PO Total:** $3,000.00 (unchanged)
- [ ] **Delivered Value:** $1,500.00
  - Item A: 50 × $10 = $500
  - Item B: 50 × $20 = $1,000
  - Item C: 0 × $40 = $0
  - Total: $1,500
- [ ] **Remaining Value:** $1,500.00
  - Item A: (100-50) × $10 = $500
  - Item B: (50-50) × $20 = $0
  - Item C: (25-0) × $40 = $1,000
  - Total: $1,500
- [ ] **Validation:** $3,000 = $1,500 + $1,500 ✓

### Calculations - Full Delivery

Using same PO, receive all remaining:
- Item A: 50 more units (total 100, 100% delivered)
- Item C: 25 units (100% delivered)

**Expected Footer:**
- [ ] **PO Total:** $3,000.00 (unchanged)
- [ ] **Delivered Value:** $3,000.00
- [ ] **Remaining Value:** $0.00
- [ ] **Validation:** $3,000 = $3,000 + $0 ✓

### Calculations - Complex Scenario

PO with varied unit rates:
- Item 1: 10 @ $100 = $1,000, delivered 5 = $500 delivered, $500 remaining
- Item 2: 100 @ $5 = $500, delivered 80 = $400 delivered, $100 remaining
- Item 3: 1 @ $2,000 = $2,000, delivered 0 = $0 delivered, $2,000 remaining
- Item 4: 50 @ $15 = $750, delivered 50 = $750 delivered, $0 remaining

**Expected Footer:**
- [ ] **PO Total:** $4,250.00
- [ ] **Delivered Value:** $1,650.00 ($500 + $400 + $0 + $750)
- [ ] **Remaining Value:** $2,600.00 ($500 + $100 + $2,000 + $0)
- [ ] **Validation:** $4,250 = $1,650 + $2,600 ✓

### Edge Cases

- [ ] **Empty PO (no items):**
  - All three values show $0.00
  - No calculation errors

- [ ] **Zero unit rates:**
  - PO Total: $0.00
  - Delivered Value: $0.00
  - Remaining Value: $0.00
  - No NaN or undefined

- [ ] **Decimal quantities:**
  - Item: 2.5 units @ $13.50 = $33.75
  - Delivered: 1.25 units = $16.88 (rounded)
  - Remaining: 1.25 units = $16.87 or $16.88 (rounding)
  - Calculations handle decimals correctly

- [ ] **Large numbers:**
  - Item: 10,000 @ $1,000 = $10,000,000
  - Values formatted with commas
  - No overflow or display issues

### Receiving Mode

- [ ] **In receiving mode:**
  - Click "Receive Items" button
  - Footer still displays correctly
  - Delivered Value calculation uses current `delivered_qty` (not input values)
  - Layout adjusts for receiving column

- [ ] **After receiving:**
  - Submit delivery
  - Delivered Value updates immediately
  - Remaining Value decreases accordingly
  - PO Total unchanged

### UI/UX

- [ ] **Alignment:**
  - Three columns evenly spaced
  - Labels aligned consistently
  - Values aligned consistently

- [ ] **Typography:**
  - Labels: text-sm, text-slate-400
  - Values: text-base, font-semibold
  - Delivered Value: text-emerald-400 (green)

- [ ] **Spacing:**
  - Gap between columns clear (gap-6)
  - Padding consistent with rest of table
  - Footer visually distinct with border-t-2

- [ ] **Colors:**
  - PO Total: white
  - Delivered Value: emerald-400 (green)
  - Remaining Value: white
  - Background: bg-slate-900/50

- [ ] **Responsive:**
  - Works on different screen sizes
  - Columns don't overlap
  - Text doesn't truncate unnecessarily

### Print Functionality

- [ ] **Print PO:**
  - Print functionality still works (uses separate print function)
  - Printed document may not include new footer layout (expected)
  - No JavaScript errors during print

### Existing Functionality

- [ ] **PO viewing:** Still works
- [ ] **Item details:** Still display correctly
- [ ] **Receiving:** Still works normally
- [ ] **Status updates:** Still work
- [ ] **Navigation:** Still works
- [ ] **No console errors**

## Summary

**What was improved:**
- Purchase Order document footer now shows 3 financial totals instead of 1
- Added Delivered Value calculation (sum of delivered_qty × unit_rate)
- Added Remaining Value calculation (sum of balance_qty × unit_rate)
- Maintained existing PO Total
- Enhanced financial visibility for partial deliveries

**Calculations:**
- **PO Total:** Original total value (unchanged)
- **Delivered Value:** Σ(delivered_qty × unit_rate)
- **Remaining Value:** Σ((quantity - delivered_qty) × unit_rate)
- **Validation:** PO Total = Delivered Value + Remaining Value

**Visual changes:**
- 3-column grid layout in footer
- Delivered Value highlighted in green
- Clear labels for each total
- Consistent with existing design theme

**Files changed:**
- `src/pages/ProcurementPage.tsx` - Enhanced PO document footer

**Build status:**
✅ Build successful
✅ No TypeScript errors
✅ Ready to test
