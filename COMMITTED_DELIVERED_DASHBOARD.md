# Committed vs Delivered Cost Dashboard

## Overview

Added financial visibility dashboard to the Finance page showing budget, committed PO value, delivered value, and remaining budget with category breakdown.

## Changes Made

### 1. Library Functions

**File:** `src/lib/costs.ts`

**Added Interfaces:**
```typescript
CommittedDeliveredSummary {
  total_budget: number;
  committed_value: number;
  delivered_value: number;
  remaining_budget: number;
  variance: number;
}

CategoryBreakdown {
  category: string;
  committed: number;
  delivered: number;
  remaining: number;
}
```

**Added Functions:**

1. **`getCommittedDeliveredSummary(projectId)`**
   - Fetches project budget from existing budget summary
   - Queries `purchase_order_items` for the project
   - Calculates:
     - **Committed Value:** Sum of all PO item `total_amount`
     - **Delivered Value:** Sum of `delivered_qty * unit_rate` for all items
     - **Remaining Budget:** `total_budget - delivered_value`
     - **Variance:** `total_budget - committed_value`

2. **`getCategoryBreakdown(projectId)`**
   - Fetches PO items with `procurement_item_id` links
   - Looks up category from `procurement_items.category`
   - Groups by category and calculates:
     - **Committed:** Total PO value per category
     - **Delivered:** Total delivered value per category
     - **Remaining:** Committed minus delivered
   - Returns sorted by committed value (highest first)

### 2. Finance Page Upgrade

**File:** `src/pages/FinancePage.tsx`

**Changes:**
- Changed from skeleton to full financial dashboard
- Added project context (needs projectId in URL)
- Added data loading from new functions
- Added 5 summary cards
- Added 2 progress bars
- Added category breakdown table

**UI Components:**

**Summary Cards (5 cards):**
1. **Budget / Estimated**
   - Shows total project budget
   - Main metric

2. **Committed PO Value** (blue)
   - Total value of all POs
   - Shows % of budget
   - Example: $50,000 (75% of budget)

3. **Delivered Value** (green)
   - Total value of delivered materials
   - Shows % of committed delivered
   - Example: $30,000 (60% delivered)

4. **Remaining Budget**
   - Budget minus delivered value
   - Shows % remaining
   - Example: $20,000 (30% remaining)

5. **Variance** (green/red)
   - Budget minus committed value
   - Green if under budget, red if over
   - Shows "Under budget" or "Over budget"

**Progress Bars:**
1. **Committed Progress**
   - Blue bar showing committed vs budget
   - Formula: `(committed_value / total_budget) * 100`

2. **Delivered Progress**
   - Green bar showing delivered vs committed
   - Formula: `(delivered_value / committed_value) * 100`

**Category Breakdown Table:**
- Only shows if categories exist
- Columns:
  - Category name (from procurement items)
  - Committed (total PO value)
  - Delivered (total delivered value, green)
  - Remaining (committed - delivered)
  - Progress (% bar + percentage)
- Footer row with totals
- Sorted by committed value (highest first)

## Calculations Used

### Committed Value
```
For each PO item in project:
  committed_value += item.total_amount
```
This represents the total value of all purchase orders issued for the project.

### Delivered Value
```
For each PO item in project:
  delivered_value += (item.delivered_qty * item.unit_rate)
```
This represents the actual value of materials received so far.

### Remaining Budget
```
remaining_budget = total_budget - delivered_value
```
Shows how much budget is left based on actual deliveries.

### Variance
```
variance = total_budget - committed_value
```
Shows budget vs commitments:
- Positive = Under budget (still have room)
- Negative = Over budget (committed more than budgeted)

### Category Breakdown

**Per Category:**
```
For each PO item linked to procurement item with category:
  category_committed += item.total_amount
  category_delivered += (item.delivered_qty * item.unit_rate)
  category_remaining = category_committed - category_delivered
  category_progress = (category_delivered / category_committed) * 100
```

**Grouping:**
- Items linked to procurement items get category from `procurement_items.category`
- Items without links or without category show as "Uncategorized"
- Categories sorted by committed value (highest first)

## Usage

### Access Finance Page

1. Navigate to project (e.g., `/projects/{projectId}`)
2. Click "Finance" card or navigate to `/projects/{projectId}/finance`
3. View financial dashboard

### Summary Cards Show:

- **Budget:** Total project budget (from project budget settings)
- **Committed:** Total PO value (sum of all POs)
- **Delivered:** Actual received value (sum of deliveries)
- **Remaining:** Budget left (budget - delivered)
- **Variance:** Budget cushion (budget - committed)

### Progress Bars Show:

- **Committed bar:** How much of budget is committed to POs
- **Delivered bar:** How much of committed value is delivered

### Category Table Shows:

- Breakdown by material category (if categories assigned)
- Each category's committed, delivered, and remaining values
- Visual progress bar per category
- Totals in footer

## Test Checklist

### Basic Display

- [ ] Navigate to: Project → Finance (or `/projects/{projectId}/finance`)
- [ ] **Verify:** Page loads without errors
- [ ] **Verify:** Project name shows in header
- [ ] **Verify:** 5 summary cards display
- [ ] **Verify:** All values formatted as currency ($X,XXX.XX)

### Summary Cards

- [ ] **Budget/Estimated card:**
  - [ ] Shows project budget value
  - [ ] Displays in white text

- [ ] **Committed PO Value card (blue):**
  - [ ] Shows total of all PO items
  - [ ] Shows % of budget in small text
  - [ ] Blue color (text-blue-400)

- [ ] **Delivered Value card (green):**
  - [ ] Shows sum of delivered_qty * unit_rate
  - [ ] Shows % delivered of committed
  - [ ] Green color (text-emerald-400)

- [ ] **Remaining Budget card:**
  - [ ] Shows budget - delivered
  - [ ] Shows % remaining of budget
  - [ ] White text

- [ ] **Variance card:**
  - [ ] Shows budget - committed
  - [ ] Green if positive (under budget)
  - [ ] Red if negative (over budget)
  - [ ] Shows "Under budget" or "Over budget" label

### Progress Bars

- [ ] **Committed progress bar:**
  - [ ] Shows committed / budget percentage
  - [ ] Blue bar (bg-blue-500)
  - [ ] Width matches percentage
  - [ ] Label shows: "$X,XXX of $X,XXX"

- [ ] **Delivered progress bar:**
  - [ ] Shows delivered / committed percentage
  - [ ] Green bar (bg-emerald-500)
  - [ ] Width matches percentage
  - [ ] Label shows: "$X,XXX of $X,XXX"

### Category Breakdown

- [ ] **If categories exist:**
  - [ ] Table displays below progress bars
  - [ ] Header: "Category Breakdown"
  - [ ] Columns: Category, Committed, Delivered, Remaining, Progress

- [ ] **Each category row:**
  - [ ] Category name displays
  - [ ] Committed shows total PO value
  - [ ] Delivered shows in green
  - [ ] Remaining shows committed - delivered
  - [ ] Progress bar displays
  - [ ] Progress % displays next to bar

- [ ] **Footer row:**
  - [ ] Shows "Total" label
  - [ ] Sums all committed values
  - [ ] Sums all delivered values (green)
  - [ ] Sums all remaining values

- [ ] **Sorting:**
  - [ ] Categories sorted by committed value (highest first)

- [ ] **If no categories:**
  - [ ] Table does not display
  - [ ] No errors in console

### Calculations Verification

Create test scenario:
- Project budget: $100,000
- Create 2 POs:
  - PO1: $40,000 (2 items, $20k each)
  - PO2: $30,000 (1 item)
- Receive deliveries:
  - PO1 Item 1: 50% delivered ($10,000)
  - PO1 Item 2: 100% delivered ($20,000)
  - PO2 Item 1: 0% delivered ($0)

**Expected Results:**
- [ ] Budget: $100,000
- [ ] Committed: $70,000
- [ ] Delivered: $30,000
- [ ] Remaining: $70,000 ($100k - $30k)
- [ ] Variance: $30,000 ($100k - $70k) - green "Under budget"
- [ ] Committed bar: 70%
- [ ] Delivered bar: 42.86% (30k/70k)

### Category Breakdown Verification

If PO items linked to procurement with categories:
- [ ] Category totals match individual PO items
- [ ] Delivered values match receiving records
- [ ] Progress percentages calculated correctly
- [ ] Footer totals match summary cards

### Edge Cases

- [ ] **No budget set:**
  - [ ] Shows $0.00 for budget
  - [ ] Percentages show "—" or 0%

- [ ] **No POs:**
  - [ ] Committed: $0.00
  - [ ] Delivered: $0.00
  - [ ] Remaining = Budget
  - [ ] No category table

- [ ] **No deliveries:**
  - [ ] Delivered: $0.00
  - [ ] Delivered bar: 0%
  - [ ] Category table shows 0% progress

- [ ] **No project ID in URL:**
  - [ ] Shows message to select project
  - [ ] "Go to Projects" button works

### UI/UX

- [ ] Cards have consistent spacing
- [ ] Currency formatting consistent ($X,XXX.XX)
- [ ] Progress bars smooth and responsive
- [ ] Table rows hover correctly
- [ ] Colors match theme (blue, green, red for variance)
- [ ] "Back to Project" button works
- [ ] Page responsive on different screen sizes

## Build Status

✅ Build successful
✅ No TypeScript errors
✅ No new warnings

## Files Changed

1. **Library:** `src/lib/costs.ts`
   - Added `CommittedDeliveredSummary` interface
   - Added `CategoryBreakdown` interface
   - Added `getCommittedDeliveredSummary()` function
   - Added `getCategoryBreakdown()` function

2. **UI:** `src/pages/FinancePage.tsx`
   - Complete upgrade from skeleton to functional dashboard
   - Added project context and data loading
   - Added 5 summary cards
   - Added 2 progress bars
   - Added category breakdown table

## Summary

**What was added:**
- Financial dashboard showing budget vs committed vs delivered
- 5 summary cards: Budget, Committed, Delivered, Remaining, Variance
- 2 progress bars: Commitment progress and delivery progress
- Category breakdown table with per-category financial tracking
- Real-time calculations from PO data and delivery records

**How calculations work:**
- **Committed:** Sum all PO item totals
- **Delivered:** Sum (delivered_qty × unit_rate) for all items
- **Remaining:** Budget minus delivered value
- **Variance:** Budget minus committed (shows over/under budget)
- **Categories:** Group by procurement item category, calculate per category

**How to use:**
1. Navigate to project Finance page
2. View summary cards for quick overview
3. Check progress bars for completion status
4. Review category breakdown for detailed cost tracking
5. Monitor variance to stay under budget
6. Track delivery progress vs commitments

**Key features:**
- Real-time data from purchase orders and deliveries
- Automatic calculation of all metrics
- Category-level visibility (if procurement items have categories)
- Color-coded status (green = good, red = over budget)
- Progress visualization with bars and percentages
