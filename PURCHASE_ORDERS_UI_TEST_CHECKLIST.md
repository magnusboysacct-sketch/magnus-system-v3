# Purchase Orders UI - Test Checklist

## Overview
Added Purchase Orders list and document views inside the existing Procurement page. Users can now view, manage, and track purchase orders alongside procurement documents.

---

## Changes Made

### Modified Files
- `src/pages/ProcurementPage.tsx` - Added PO list and document views

### New Features

1. **Section Switcher**
   - Tabs to switch between "Procurement Documents" and "Purchase Orders"
   - Uses same URL pattern with `?section=` query parameter
   - Maintains existing view/doc routing

2. **Purchase Orders List View**
   - Shows all POs for current project
   - Displays: PO number, supplier, status, item count, total value, issue date
   - Summary stats: Total POs, Draft, Issued, Delivered
   - Actions: View, Delete

3. **Purchase Order Document View**
   - Shows full PO details
   - Editable fields: status, issue date, expected date
   - Items table with quantities and totals
   - Read-only material details

---

## Test Checklist

### Navigation & Switching

#### Section Tabs
- [ ] Load Procurement page - shows "Procurement Documents" tab active by default
- [ ] Click "Purchase Orders" tab - switches to PO list view
- [ ] Click "Procurement Documents" tab - switches back to procurement list
- [ ] URL updates with `?section=procurement` or `?section=purchase-orders`
- [ ] Refresh page - stays on current section
- [ ] Direct URL with `?section=purchase-orders` - opens PO list

#### View Persistence
- [ ] Switch from Procurement to POs - returns to list view
- [ ] Open a PO, go back, switch section - comes back to PO list
- [ ] Open procurement doc, switch to POs, switch back - still on procurement list

### Purchase Orders List View

#### Layout & Display
- [ ] Header shows "Purchase Orders" title
- [ ] Tabs visible at top (Procurement Documents | Purchase Orders)
- [ ] Summary cards show: Total POs, Draft, Issued, Delivered
- [ ] PO cards display correctly with all info
- [ ] Empty state shows when no POs exist
- [ ] Loading state shows while fetching data

#### PO Card Information
- [ ] PO number displayed prominently (e.g., "PO-2026-001")
- [ ] Status badge shows correct color and label
- [ ] Supplier name displayed
- [ ] Title/description shown (if exists)
- [ ] Item count shows (e.g., "5 items")
- [ ] Issue date shows if set, otherwise "Not issued"
- [ ] Total value calculated and displayed correctly
- [ ] View and Delete buttons visible and styled correctly

#### Status Badge Colors
- [ ] Draft: gray background
- [ ] Issued: blue background
- [ ] Part Delivered: orange background
- [ ] Delivered: green background
- [ ] Cancelled: red background

#### Summary Stats
- [ ] Total POs count correct
- [ ] Draft count matches POs with status=draft
- [ ] Issued count matches POs with status=issued
- [ ] Delivered count matches POs with status=delivered
- [ ] Stats update when PO deleted

### Purchase Order Document View

#### Opening & Navigation
- [ ] Click PO number - opens document view
- [ ] Click "View" button - opens document view
- [ ] URL updates with `?view=document&doc={id}&section=purchase-orders`
- [ ] Back button returns to PO list
- [ ] Refresh page - stays on PO document

#### Header Section
- [ ] PO number displayed as title
- [ ] Back button visible and functional
- [ ] Status dropdown shows current status
- [ ] Can change status via dropdown
- [ ] Status updates persist

#### Details Card
- [ ] Supplier name shown
- [ ] Title/description shown
- [ ] Issue date shows or "Not set"
- [ ] Expected date shows or "Not set"
- [ ] Notes shown if exist
- [ ] Click issue date - shows date picker
- [ ] Click expected date - shows date picker
- [ ] Can update dates
- [ ] ESC cancels date edit
- [ ] Enter saves date edit

#### Summary Cards
- [ ] Total Items count correct
- [ ] Total Value matches sum of all items
- [ ] Status label shown correctly

#### Items Table
- [ ] Table shows all PO items
- [ ] Columns: Material, Quantity, Unit Rate, Total
- [ ] Material name displayed
- [ ] Description shown (if exists)
- [ ] Quantity formatted to 2 decimals
- [ ] Unit displayed
- [ ] Unit rate formatted as currency
- [ ] Total amount calculated correctly
- [ ] Footer shows grand total
- [ ] Grand total matches header Total Value

### Data Management

#### Loading Purchase Orders
- [ ] Load project - fetches POs for that project only
- [ ] Switch projects - shows POs for new project
- [ ] Only user's company POs visible (RLS)
- [ ] POs sorted by updated_at descending

#### Creating POs (from Procurement)
- [ ] Create PO from procurement items
- [ ] New PO appears in list immediately
- [ ] Can switch to PO section and see it
- [ ] Open new PO - all data correct

#### Updating POs
- [ ] Change status - updates in database
- [ ] Change issue date - persists
- [ ] Change expected date - persists
- [ ] Changes reflected in list view
- [ ] Updated_at timestamp changes

#### Deleting POs
- [ ] Click Delete - shows confirmation
- [ ] Confirm - PO removed from list
- [ ] Cancel - PO not deleted
- [ ] Delete removes all PO items (cascade)
- [ ] Can't delete if in document view (only from list)
- [ ] Summary stats update after delete

### Status Workflow

#### Status Transitions
- [ ] Draft → Issued
- [ ] Issued → Part Delivered
- [ ] Part Delivered → Delivered
- [ ] Any status → Cancelled
- [ ] Cancelled stays cancelled (manual change needed to revert)

#### Status Dropdown
- [ ] Shows all 5 statuses: draft, issued, part_delivered, delivered, cancelled
- [ ] Labels user-friendly: Draft, Issued, Part Delivered, Delivered, Cancelled
- [ ] Current status selected
- [ ] Change persists on blur

### Empty States

#### No POs
- [ ] Message: "No purchase orders found"
- [ ] Subtitle: "Create purchase orders from procurement documents"
- [ ] No summary cards show 0

#### No Items in PO
- [ ] Message: "No items in this purchase order"
- [ ] Shows even though this shouldn't happen normally

### Edge Cases

#### Date Handling
- [ ] No issue date - shows "Not set"
- [ ] No expected date - shows "Not set"
- [ ] Invalid date - handled gracefully
- [ ] Future dates allowed
- [ ] Past dates allowed
- [ ] Clear date (set to null) - works

#### Calculations
- [ ] Zero quantity items - total = $0.00
- [ ] Zero unit rate - total = $0.00
- [ ] Large numbers format correctly with commas
- [ ] Decimal values show 2 decimal places
- [ ] No items - grand total = $0.00

#### Multi-User
- [ ] User A creates PO - User B can't see it (different company)
- [ ] Project members can all see POs
- [ ] Non-project members can't see POs
- [ ] RLS policies enforced

### UI/UX

#### Visual Consistency
- [ ] Matches existing procurement page style
- [ ] Same colors, fonts, spacing
- [ ] Cards have same rounded corners
- [ ] Buttons use same styling
- [ ] Tables use same layout
- [ ] Status badges consistent with procurement

#### Responsive Behavior
- [ ] Works on wide screens
- [ ] Table scrolls horizontally if needed
- [ ] Cards stack properly
- [ ] Tabs don't overflow

#### Loading States
- [ ] Loading message shown while fetching
- [ ] Smooth transition from loading to content
- [ ] No flash of empty state

### Integration Tests

#### Procurement → PO Flow
1. [ ] Create procurement document
2. [ ] Add items with suppliers
3. [ ] Select items and create PO
4. [ ] Switch to "Purchase Orders" tab
5. [ ] See newly created PO in list
6. [ ] Open PO - verify all items present
7. [ ] Verify quantities and rates match procurement

#### Status Tracking
1. [ ] Create PO (draft status)
2. [ ] Open PO document
3. [ ] Change status to "issued"
4. [ ] Set issue date to today
5. [ ] Go back to list
6. [ ] Verify status badge shows "Issued"
7. [ ] Verify issue date displays

#### Multiple POs
1. [ ] Create 3 POs from different suppliers
2. [ ] All 3 appear in list
3. [ ] Summary shows Total POs = 3
4. [ ] Open each PO - correct supplier and items
5. [ ] Delete one PO
6. [ ] List shows 2 POs
7. [ ] Summary shows Total POs = 2

### Existing Features Unchanged

#### Procurement Not Broken
- [ ] Can still view procurement documents
- [ ] Can still edit procurement items
- [ ] Can still create POs from procurement
- [ ] Can still print procurement documents
- [ ] All procurement features work as before

#### Navigation
- [ ] Back button works in both sections
- [ ] URL routing works correctly
- [ ] Browser back/forward works
- [ ] Refresh preserves state

---

## Database Verification

### Check PO Display Data
```sql
-- Verify PO list matches database
SELECT
  po.po_number,
  po.supplier_name,
  po.status,
  po.issue_date,
  COUNT(poi.id) as item_count,
  SUM(poi.total_amount) as total_value
FROM purchase_orders po
LEFT JOIN purchase_order_items poi ON poi.purchase_order_id = po.id
WHERE po.project_id = 'YOUR_PROJECT_ID'
GROUP BY po.id
ORDER BY po.updated_at DESC;
```

### Check PO Details
```sql
-- Verify document view data
SELECT * FROM purchase_orders WHERE id = 'YOUR_PO_ID';

SELECT * FROM purchase_order_items WHERE purchase_order_id = 'YOUR_PO_ID';
```

### Check Updates
```sql
-- After changing status
SELECT status, updated_at FROM purchase_orders WHERE id = 'YOUR_PO_ID';

-- After setting dates
SELECT issue_date, expected_date FROM purchase_orders WHERE id = 'YOUR_PO_ID';
```

---

## Known Limitations (By Design)

1. **Read-Only Items**
   - Can't edit PO item quantities or rates
   - Can't add/remove items from PO
   - PO items are fixed after creation
   - Future: Add item editing capability

2. **No Print/PDF**
   - Can't print PO yet
   - No PDF generation
   - Future: Add PO print layout

3. **No Email/Send**
   - Can't send PO to supplier
   - No email integration
   - Future: Add email functionality

4. **No Delivery Tracking**
   - Status changes manual
   - No automatic updates from deliveries
   - Future: Link to delivery receipts

5. **No Supplier Contact Info**
   - Shows supplier name only
   - No address, phone, email
   - Future: Link to supplier directory

---

## Success Criteria

- [x] Build successful (no TypeScript errors)
- [ ] Can view list of POs for project
- [ ] Can open PO document view
- [ ] Can change PO status
- [ ] Can set issue/expected dates
- [ ] Can delete POs
- [ ] Section tabs work correctly
- [ ] All data displays correctly
- [ ] Calculations accurate
- [ ] Existing procurement features unchanged
- [ ] No console errors
- [ ] UI matches existing theme

---

## Rollback Plan

If issues found:
1. All changes in single file (ProcurementPage.tsx)
2. Can revert to previous version
3. No database migrations needed
4. PO data safe (read-only operations)
5. Procurement features isolated

---

## Future Enhancements

1. **PO Editing**
   - Edit item quantities
   - Edit unit rates
   - Add/remove items
   - Recalculate totals

2. **Print/PDF**
   - Professional PO layout
   - Company branding
   - Terms and conditions
   - Signature lines

3. **Email Integration**
   - Send PO to supplier
   - Track email opens
   - Supplier acknowledgment
   - Auto-reminders

4. **Delivery Management**
   - Record deliveries
   - Partial delivery tracking
   - Auto-update status
   - Link to procurement items

5. **Supplier Integration**
   - Link to supplier directory
   - Auto-fill contact info
   - Supplier payment terms
   - Supplier performance tracking

6. **Approval Workflow**
   - Multi-level approvals
   - Approval history
   - Budget checks
   - Authorization limits

---

**Test Environment:** Magnus System v3
**Feature:** Purchase Orders UI
**Status:** Ready for Testing
**Date:** 2026-03-10
