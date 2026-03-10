# Procurement Workflow Control - Test Checklist

## Summary of Changes

### New Helper File
- `src/lib/procurementWorkflow.ts` - Workflow control helpers with status management, labels, and calculation utilities

### Updated Files
1. **src/lib/procurement.ts**
   - Extended `ProcurementItem` interface with new fields (priority, dates, quantities, rates)
   - Extended `ProcurementHeader` interface with "cancelled" status
   - Updated generation function to include default values for new fields

2. **src/pages/ProcurementPage.tsx**
   - Integrated workflow helper functions
   - Added comprehensive filtering (search, status, priority, supplier)
   - Added 7 summary cards (Total, Pending, Ordered, Part Delivered, Received, Urgent, Total Value)
   - Added inline editing for all new fields
   - Auto-normalization of status based on quantities
   - Maintained existing layout/theme

## Test Checklist

### List View Tests
- [ ] View list of procurement documents
- [ ] All 5 header statuses display correctly (Draft, Approved, Sent, Completed, Cancelled)
- [ ] Status badges show correct colors
- [ ] Can open a document
- [ ] Can delete a document
- [ ] Navigate to BOQ page works

### Document View - Header Tests
- [ ] Click title to edit inline
- [ ] Change document status dropdown (all 5 statuses available)
- [ ] Print button works (existing functionality)
- [ ] Back to list button works

### Document View - Summary Cards
- [ ] Total Items card shows correct count
- [ ] Pending card shows correct count (yellow)
- [ ] Ordered card shows correct count (blue)
- [ ] Part Delivered card shows correct count (orange)
- [ ] Received card shows correct count (emerald)
- [ ] Urgent card shows correct count (red)
- [ ] Total Value card shows sum of (ordered_qty × unit_rate)

### Document View - Filters
- [ ] Search box filters by material name, description, category
- [ ] Status filter dropdown shows all 8 statuses
- [ ] Priority filter dropdown shows all 4 priorities
- [ ] Supplier filter dropdown populates dynamically
- [ ] Clear Filters button appears when any filter is active
- [ ] Clear Filters resets all filters
- [ ] Filters work together (AND logic)

### Document View - Item Fields (Inline Editing)
- [ ] Click supplier to edit (text input)
- [ ] Priority dropdown changes (Low, Normal, High, Urgent)
- [ ] Click needed_by_date to edit (date picker)
- [ ] Click ordered_qty to edit (number input)
- [ ] Click delivered_qty to edit (number input)
- [ ] Click unit_rate to edit (number input)
- [ ] Balance qty auto-calculates: max(quantity - delivered_qty, 0)
- [ ] Total cost auto-calculates: ordered_qty × unit_rate
- [ ] Status dropdown shows all 8 statuses with correct colors

### Auto-Normalization Tests
- [ ] When delivered_qty >= quantity → status auto-changes to "received"
- [ ] When 0 < delivered_qty < quantity → status auto-changes to "part_delivered"
- [ ] When ordered_qty > 0 and delivered_qty = 0 → status auto-changes to "ordered"
- [ ] Cancelled status stays cancelled regardless of quantities
- [ ] Status normalization only triggers when quantities change

### Cost Recording Tests (Existing Behavior)
- [ ] When status changes to "received" with unit_rate and delivered_qty, creates project cost record
- [ ] Cost record appears in Finance/Costs section

### Generation Tests
- [ ] Generate new procurement document from BOQ
- [ ] New items have default values:
  - status = "pending"
  - priority = "normal"
  - ordered_qty = 0
  - delivered_qty = 0
  - unit_rate = 0
  - supplier = null
  - needed_by_date = null

### Layout/Theme Tests
- [ ] Existing layout structure preserved
- [ ] Dark theme colors maintained
- [ ] Grouped by category display still works
- [ ] Table columns are readable (not too narrow)
- [ ] Mobile responsiveness maintained
- [ ] Hover states work correctly

### Delete Tests
- [ ] Can delete individual items
- [ ] Item count updates correctly
- [ ] Can delete entire document

### Print Tests (Should Not Break)
- [ ] Print button generates PDF
- [ ] Print layout not affected by UI changes

## Known Limitations
- Wide table with 12 columns - horizontal scroll may be needed on smaller screens
- Inline editing uses blur events - clicking away saves changes
- No validation on negative quantities (relies on database constraints)
- Supplier filter only shows suppliers already assigned to items

## Data Migration Notes
- Existing procurement items will have default values for new fields:
  - priority defaults to "normal" if null
  - quantities default to 0 if null
  - Old statuses (pending, ordered, received) still valid
  - New statuses add more granular workflow tracking
