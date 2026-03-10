# Purchase Order UI Integration - Test Checklist

## Overview
Added Purchase Order creation functionality to the Procurement page document view. Users can now select procurement items and create POs grouped by supplier.

---

## Changes Made

### Modified Files
- `src/pages/ProcurementPage.tsx` - Added PO creation functionality

### New Features
1. **Item Selection**
   - Checkbox for each procurement item
   - Select-all checkbox in table header (for filtered items)
   - Visual feedback showing selected count

2. **Create PO Button**
   - Appears in header when items are selected
   - Shows count of selected items
   - Disabled state during creation

3. **PO Creation Logic**
   - Only items with suppliers can be included
   - Automatically groups items by supplier name
   - Creates one PO per supplier group
   - Auto-generates PO numbers (PO-2026-001, etc.)
   - Uses `ordered_qty` if > 0, otherwise `quantity`
   - Uses `unit_rate` from procurement item
   - Links PO items to source procurement items

---

## Test Checklist

### Basic Functionality

#### Selection Tests
- [ ] Click checkbox - item gets selected
- [ ] Click checkbox again - item gets deselected
- [ ] Click select-all - all filtered items selected
- [ ] Click select-all when all selected - all items deselected
- [ ] Apply filter - select-all only affects visible items
- [ ] Clear filter - selection persists on previously selected items
- [ ] Selected count displays correctly in "Create PO" button

#### Create PO Button
- [ ] Button only appears when items are selected
- [ ] Button shows correct count: "Create PO (5)"
- [ ] Button disabled during creation
- [ ] Button text changes to "Creating..." during operation

### Supplier Validation

#### Items With Suppliers
- [ ] Select 3 items from Supplier A - creates 1 PO
- [ ] Select 2 items from Supplier A + 3 from Supplier B - creates 2 POs
- [ ] Select items from 5 different suppliers - creates 5 POs
- [ ] Success message shows correct count

#### Items Without Suppliers
- [ ] Select items with no supplier - shows error "must have a supplier assigned"
- [ ] Select mix of items (some with, some without supplier) - shows confirmation
- [ ] Confirm - only items with suppliers are included
- [ ] Cancel - operation cancelled, selection unchanged

#### Supplier Name Matching
- [ ] Items with same supplier name grouped together
- [ ] Case-sensitive grouping (if "ABC Ltd" ≠ "abc ltd")
- [ ] Whitespace handled correctly
- [ ] Custom suppliers (not in directory) work correctly

### PO Number Generation
- [ ] First PO: PO-2026-001
- [ ] Second PO: PO-2026-002
- [ ] Create multiple POs at once - each gets unique sequential number
- [ ] PO numbers unique per company
- [ ] Year changes correctly (test by changing system date if needed)

### PO Data Validation

#### PO Header
- [ ] `project_id` matches current project
- [ ] `supplier_id` = null (for now, as specified)
- [ ] `supplier_name` matches item supplier
- [ ] `po_number` unique and sequential
- [ ] `title` = "{Supplier Name} - {X} items"
- [ ] `status` = "draft"
- [ ] `company_id` auto-fetched from user profile

#### PO Items
- [ ] All selected items from supplier included
- [ ] `material_name` copied from procurement item
- [ ] `description` copied from procurement item
- [ ] `quantity` uses `ordered_qty` if > 0, else `quantity`
- [ ] `unit` copied from procurement item
- [ ] `unit_rate` copied from procurement item
- [ ] `total_amount` = quantity × unit_rate
- [ ] `procurement_item_id` links to source item

### Edge Cases

#### Empty States
- [ ] No items selected - button doesn't appear
- [ ] All filtered items selected - select-all checkbox checked
- [ ] No filtered items - select-all disabled

#### Error Handling
- [ ] One supplier fails - shows partial success message
- [ ] All suppliers fail - shows error message
- [ ] Network error - shows error, doesn't crash
- [ ] User not in company - shows error
- [ ] Invalid PO number - handled gracefully

#### Post-Creation
- [ ] Selection cleared after successful creation
- [ ] Can immediately select and create more POs
- [ ] Page doesn't reload
- [ ] Can return to list and see updated procurement

### Workflow Tests

#### Typical User Flow
1. [ ] Open procurement document
2. [ ] Filter by status "pending" or "approved"
3. [ ] Select 5 items from Supplier A
4. [ ] Select 3 items from Supplier B
5. [ ] Click "Create PO (8)"
6. [ ] Confirm creates 2 POs
7. [ ] Success message appears
8. [ ] Selection cleared
9. [ ] POs accessible (verify in database or future PO page)

#### Multi-Supplier Scenario
1. [ ] Document with 20 items across 4 suppliers
2. [ ] Select all items from 3 suppliers (15 items)
3. [ ] Click "Create PO (15)"
4. [ ] Verify 3 POs created with correct grouping
5. [ ] Check each PO has correct items

#### Partial Selection
1. [ ] Select 10 items from Supplier A
2. [ ] Deselect 3 items
3. [ ] Create PO with 7 items
4. [ ] Verify PO contains only 7 items

### Integration Tests

#### Database Verification
- [ ] Check `purchase_orders` table - records created
- [ ] Check `purchase_order_items` table - items created
- [ ] Verify foreign keys correct
- [ ] Verify unique constraint on `po_number`
- [ ] Check `project_activity` - PO creation logged

#### RLS Security
- [ ] User A creates PO - User B can't see it (different company)
- [ ] Project members can see PO
- [ ] Non-project members can't see PO

#### Procurement Not Affected
- [ ] Procurement items status unchanged
- [ ] Procurement items `ordered_qty` unchanged
- [ ] Can still edit procurement items after PO creation
- [ ] Can still delete procurement items
- [ ] Print procurement document still works

### UI/UX Tests

#### Visual Feedback
- [ ] Checkbox visible and clickable
- [ ] Checkbox checked state clear
- [ ] Button color/style appropriate (green)
- [ ] Button position doesn't break layout
- [ ] Disabled state visually distinct
- [ ] Loading state clear ("Creating...")

#### Responsive Design
- [ ] Works on wide screens
- [ ] Works on narrow screens (if applicable)
- [ ] Table scrolls horizontally if needed
- [ ] Button doesn't overflow

#### Existing Features Unchanged
- [ ] Can still edit item supplier
- [ ] Can still edit quantities
- [ ] Can still change status
- [ ] Can still delete items
- [ ] Can still update header
- [ ] Can still print document
- [ ] Filters still work
- [ ] Search still works
- [ ] Back button still works

---

## Known Limitations (By Design)

1. **No Supplier Directory Link**
   - `supplier_id` always null (manual entry only for now)
   - Future: Auto-match supplier names to directory

2. **No PO List Page**
   - POs created but not visible in UI yet
   - Need to verify in database
   - Future: Add Purchase Orders page

3. **No Procurement Update**
   - Creating PO doesn't change procurement item status
   - Manual workflow for now
   - Future: Auto-update status to "ordered"

4. **No PO Editing**
   - Can't edit PO after creation
   - Future: Add PO edit functionality

5. **No Print/PDF**
   - PO created but can't be printed yet
   - Future: Add PO print layout

---

## Database Queries for Manual Verification

### Check Created POs
```sql
SELECT
  po.id,
  po.po_number,
  po.supplier_name,
  po.title,
  po.status,
  COUNT(poi.id) as item_count,
  SUM(poi.total_amount) as total_value
FROM purchase_orders po
LEFT JOIN purchase_order_items poi ON poi.purchase_order_id = po.id
WHERE po.project_id = 'YOUR_PROJECT_ID'
GROUP BY po.id
ORDER BY po.created_at DESC;
```

### Check PO Items
```sql
SELECT
  poi.*,
  pi.material_name as source_material_name
FROM purchase_order_items poi
LEFT JOIN procurement_items pi ON pi.id = poi.procurement_item_id
WHERE poi.purchase_order_id = 'YOUR_PO_ID';
```

### Check Activity Log
```sql
SELECT *
FROM project_activity
WHERE project_id = 'YOUR_PROJECT_ID'
  AND activity_type = 'purchase_order_created'
ORDER BY created_at DESC;
```

---

## Rollback Plan

If issues found:
1. PO records are safe (won't affect existing data)
2. Can delete test POs manually from database
3. Can revert UI changes (code only in ProcurementPage.tsx)
4. No migrations to rollback

---

## Success Criteria

- [x] Build successful (no TypeScript errors)
- [ ] All basic functionality tests pass
- [ ] All supplier validation tests pass
- [ ] PO creation works for 1 supplier
- [ ] PO creation works for multiple suppliers
- [ ] Selection cleared after creation
- [ ] Existing procurement features unchanged
- [ ] No console errors during operation
- [ ] User-friendly error messages

---

## Next Steps (Future Work)

1. **Purchase Orders Page**
   - List all POs for project
   - View PO details
   - Edit PO
   - Delete PO

2. **PO Print/PDF**
   - Professional PO layout
   - Company branding
   - Email to supplier

3. **Supplier Directory Integration**
   - Auto-link `supplier_id` from directory
   - Populate supplier contact info
   - Supplier email addresses

4. **Procurement Workflow**
   - Auto-update item status to "ordered"
   - Track which items are on which PO
   - Link back from PO to procurement

5. **PO Status Workflow**
   - Issue PO (send to supplier)
   - Track deliveries
   - Mark as delivered
   - Auto-update procurement items

---

**Test Environment:** Magnus System v3
**Feature:** Purchase Order Creation from Procurement
**Status:** Ready for Testing
**Date:** 2026-03-10
