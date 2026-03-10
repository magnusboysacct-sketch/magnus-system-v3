# Procurement Supplier Directory Integration - Test Checklist

## Upgrade Summary
The Procurement page now uses the Supplier Directory for the supplier field, replacing free-text input with a dropdown selection while maintaining backward compatibility.

## Prerequisites
- [ ] Suppliers have been added in Settings → Master Lists → Suppliers tab
- [ ] At least 2-3 active suppliers exist for testing
- [ ] Existing procurement documents exist with items

## Supplier Dropdown Test (New Items)
- [ ] Open any procurement document
- [ ] Locate the "Supplier" column
- [ ] Click on a supplier cell (should show dropdown, not text input)
- [ ] Verify dropdown shows:
  - "-- Select Supplier --" (blank option)
  - All active suppliers from directory
  - "Other / Manual..." option at bottom
- [ ] Select a supplier from directory
- [ ] Verify supplier name saves correctly
- [ ] Refresh page, verify supplier persists

## Manual Entry Test
- [ ] Click supplier dropdown
- [ ] Select "Other / Manual..."
- [ ] Verify it switches to text input field
- [ ] Type custom supplier name: "Custom Supplier ABC"
- [ ] Press Enter or click outside field
- [ ] Verify custom name saves
- [ ] Refresh page, verify custom name persists

## Backward Compatibility Test (Existing Data)
- [ ] Find an item with an existing supplier name that's NOT in the directory
- [ ] Verify dropdown shows: "[Supplier Name] (custom)"
- [ ] Verify item displays correctly without errors
- [ ] Change to a directory supplier
- [ ] Verify it saves correctly
- [ ] Change back to "Other / Manual..."
- [ ] Verify you can enter any custom text again

## Empty Supplier Test
- [ ] Find item with no supplier set
- [ ] Verify dropdown shows "-- Select Supplier --" selected
- [ ] Select a supplier
- [ ] Verify saves correctly
- [ ] Change to blank ("-- Select Supplier --")
- [ ] Verify clears supplier field

## Filter Test (Existing Feature)
- [ ] Set different suppliers on multiple items
- [ ] Use the "All Suppliers" filter dropdown at top
- [ ] Verify filtering works with directory suppliers
- [ ] Verify filtering works with custom suppliers
- [ ] Verify "All Suppliers" shows all items

## Search Test (Existing Feature)
- [ ] Use search box at top of document
- [ ] Search by material name - verify results correct
- [ ] Search by category - verify results correct
- [ ] Verify supplier field still works in filtered results

## Multiple Items Test
- [ ] Select supplier "ABC Supplies" for item 1
- [ ] Select supplier "XYZ Materials" for item 2
- [ ] Select "Other / Manual..." for item 3, enter "Local Shop"
- [ ] Verify all three save correctly with different suppliers
- [ ] Verify filter dropdown shows all three suppliers

## Inactive Supplier Test
- [ ] Go to Settings → Master Lists → Suppliers
- [ ] Deactivate a supplier that's in use
- [ ] Go back to Procurement document
- [ ] Find item using that supplier
- [ ] Verify it shows as "[Supplier Name] (custom)" (still displays safely)
- [ ] Verify deactivated supplier NOT in dropdown for new selections
- [ ] Verify you can change to a different active supplier

## Print Test (Should Not Be Affected)
- [ ] Open procurement document with various suppliers
- [ ] Click "Print" button
- [ ] Verify print preview opens
- [ ] Verify supplier names display correctly in print
- [ ] Verify no print functionality broken

## Status Update Test (Should Not Be Affected)
- [ ] Change item status (pending → ordered, etc.)
- [ ] Verify supplier field unchanged
- [ ] Verify status update works normally

## Quantity Update Test (Should Not Be Affected)
- [ ] Update ordered_qty on item
- [ ] Verify supplier field unchanged
- [ ] Update delivered_qty on item
- [ ] Verify auto-status calculation still works
- [ ] Verify supplier field unchanged

## Priority Update Test (Should Not Be Affected)
- [ ] Change item priority
- [ ] Verify supplier dropdown still works
- [ ] Verify priority filter still works

## Delete Item Test
- [ ] Delete an item with a directory supplier
- [ ] Verify deletion works normally
- [ ] Delete an item with custom supplier
- [ ] Verify deletion works normally

## Multi-Company Security Test
- [ ] Create suppliers as User A (Company A)
- [ ] Create procurement document as User A with those suppliers
- [ ] Log in as User B (Company B)
- [ ] Open User B's procurement document
- [ ] Verify supplier dropdown shows ONLY Company B's suppliers
- [ ] Verify User B CANNOT see Company A's suppliers in dropdown

## Performance Test
- [ ] Create 20+ suppliers in directory
- [ ] Open procurement document
- [ ] Verify dropdown loads quickly
- [ ] Verify no lag when selecting suppliers
- [ ] Verify inline editing still fast

## Data Integrity Test
- [ ] Verify procurement_items.supplier remains TEXT column (not foreign key)
- [ ] Verify supplier name stored as text (supplier_name value)
- [ ] Verify no database errors in console
- [ ] Verify existing items not corrupted

## Edge Cases
- [ ] Try supplier with special characters: "O'Brien Supplies"
- [ ] Try supplier with long name (50+ chars)
- [ ] Try switching between directory/manual/directory rapidly
- [ ] Verify no JavaScript errors in console

---

## Expected Behavior Summary

**Directory Supplier (In List):**
- Shows in dropdown with plain name
- Selectable from dropdown
- Saves supplier_name as text

**Custom Supplier (Not In List):**
- Shows as "[Name] (custom)" if already set
- Can be edited via "Other / Manual..." option
- Saves as plain text
- Still filterable and searchable

**New/Empty Supplier:**
- Shows "-- Select Supplier --"
- Can select from directory OR use manual entry
- Manual entry opens text input field

**All Existing Features:**
- Filtering by supplier: WORKS
- Searching items: WORKS
- Inline editing other fields: WORKS
- Print functionality: WORKS
- Status/quantity/priority updates: WORKS
- Multi-company isolation: WORKS

---

## What Changed
- ✅ Supplier field now uses dropdown with active suppliers
- ✅ "Other / Manual..." option for custom entries
- ✅ Backward compatibility for existing custom suppliers
- ✅ Loads active suppliers from Supplier Directory

## What Did NOT Change
- ❌ Print functionality (untouched)
- ❌ Purchase Orders (not built yet)
- ❌ Database schema (supplier still TEXT field)
- ❌ Filtering/search logic
- ❌ Status workflow logic
- ❌ Any other procurement features
