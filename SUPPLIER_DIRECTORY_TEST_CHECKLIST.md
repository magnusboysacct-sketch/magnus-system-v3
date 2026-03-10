# Supplier Directory - Test Checklist

## Setup Complete ✓
- Database table `suppliers` created with RLS
- `src/lib/suppliers.ts` functions created
- Settings → Master Lists page updated with Suppliers tab

## Navigation Test
- [ ] Navigate to Settings → Master Lists
- [ ] Verify three tabs visible: Categories, Units, **Suppliers** (new)
- [ ] Click Suppliers tab
- [ ] Verify tab activates (blue underline)

## Add Supplier Test
- [ ] Click "Add Supplier" button
- [ ] Form appears with fields:
  - Supplier Name (required)
  - Contact Name
  - Email
  - Phone
  - Address
  - Payment Terms
  - Notes
- [ ] Fill in only Supplier Name: "Test Supplier 1"
- [ ] Click "Add"
- [ ] Verify form closes
- [ ] Verify supplier appears in table
- [ ] Verify green status indicator shows

## Full Form Test
- [ ] Click "Add Supplier" again
- [ ] Fill all fields:
  - Supplier Name: "ABC Building Supplies"
  - Contact Name: "John Smith"
  - Email: "john@abc.com"
  - Phone: "876-555-1234"
  - Address: "123 Main St, Kingston"
  - Payment Terms: "Net 30"
  - Notes: "Preferred supplier for concrete"
- [ ] Click "Add"
- [ ] Verify all data shows correctly in table

## Duplicate Name Test
- [ ] Try to add supplier with same name as existing
- [ ] Verify error message: "A supplier with the name ... already exists"

## Search Test
- [ ] Add several suppliers with different names/contacts
- [ ] Type in search box
- [ ] Verify filters by:
  - Supplier name
  - Contact name
  - Email
  - Phone
- [ ] Clear search, verify all suppliers return

## Edit Supplier Test
- [ ] Click "Edit" on any supplier
- [ ] Verify form pre-fills with current data
- [ ] Change supplier name to "Updated Supplier Name"
- [ ] Change contact to "Jane Doe"
- [ ] Click "Update"
- [ ] Verify changes appear in table
- [ ] Verify updated_at timestamp changes

## Toggle Status Test
- [ ] Click "Deactivate" on active supplier
- [ ] Verify:
  - Status dot turns gray
  - Supplier name shows line-through
  - Button changes to "Activate"
- [ ] Click "Activate"
- [ ] Verify supplier returns to active state (green dot, no line-through)

## Delete Supplier Test
- [ ] Click "Delete" on any supplier
- [ ] Verify confirmation dialog: "Delete supplier [name]?"
- [ ] Click Cancel - verify nothing happens
- [ ] Click "Delete" again, confirm
- [ ] Verify supplier removed from list

## Cancel Form Test
- [ ] Click "Add Supplier"
- [ ] Fill some fields
- [ ] Click "Cancel"
- [ ] Verify form closes without saving
- [ ] Verify no new supplier added

## Multi-Company Security Test
- [ ] Create supplier as User A (Company A)
- [ ] Log in as User B (Company B)
- [ ] Navigate to Suppliers tab
- [ ] Verify User B CANNOT see User A's suppliers
- [ ] Verify User B CAN add their own suppliers

## UI/UX Verification
- [ ] Verify dark theme consistent with rest of app
- [ ] Verify colors match Categories/Units tabs
- [ ] Verify table is readable and aligned
- [ ] Verify all buttons have hover states
- [ ] Verify form fields have proper focus styles
- [ ] Verify responsive layout (if needed)

## Data Persistence Test
- [ ] Add multiple suppliers
- [ ] Refresh page
- [ ] Verify all suppliers still present
- [ ] Switch to different tab (Categories)
- [ ] Return to Suppliers tab
- [ ] Verify suppliers still loaded

## Performance Test
- [ ] Add 20+ suppliers
- [ ] Verify table renders quickly
- [ ] Test search with many results
- [ ] Verify no lag or performance issues

## Error Handling Test
- [ ] Try to save with empty supplier name
- [ ] Verify appropriate error message
- [ ] Disconnect network (if possible)
- [ ] Try to save supplier
- [ ] Verify error message appears

---

## Expected Behavior Summary

**Active Supplier:**
- Green status dot
- Normal text (no strikethrough)
- "Deactivate" button

**Inactive Supplier:**
- Gray status dot
- Strikethrough text
- "Activate" button

**All operations should:**
- Update the list immediately after save
- Show appropriate error messages on failure
- Maintain data integrity (no duplicates within company)
- Respect RLS (company-scoped data only)
