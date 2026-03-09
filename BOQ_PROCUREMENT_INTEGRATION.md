# BOQ to Procurement Integration

This document describes the integration between the BOQ and Procurement systems, allowing BOQ items to generate a project-scoped procurement list.

## Overview

The system now supports:
1. Generating procurement items from BOQ data
2. Project-scoped procurement lists
3. Status tracking (pending, ordered, received)
4. Traceability back to source BOQ items

## Database Schema

### Table: `procurement_items`

Stores materials and items needed for procurement, generated from BOQ items.

**Columns:**
- `id` (uuid, primary key)
- `project_id` (uuid, references projects)
- `source_boq_item_id` (uuid, references boq_items, nullable)
- `material_name` (text, name of material/item)
- `quantity` (numeric, quantity needed)
- `unit` (text, unit of measurement)
- `category` (text, trade/category for grouping)
- `notes` (text, additional notes from BOQ description)
- `status` (text: 'pending', 'ordered', 'received')
- `created_at` (timestamptz)
- `updated_at` (timestamptz)

**Security:**
- RLS enabled
- Users can only access procurement items for projects they are members of

**Indexes:**
- `project_id` - Fast filtering by project
- `source_boq_item_id` - Tracing back to BOQ
- `status` - Filtering by procurement status

## Features

### 1. Generate Procurement from BOQ

**File:** `src/pages/BOQPage.tsx`

A "Generate Procurement" button appears in the BOQ header actions:
- Enabled when project is selected and BOQ has items
- Confirmation dialog before regeneration
- Replaces existing procurement items for the project

**How it works:**
```typescript
async function handleGenerateProcurement() {
  const result = await generateProcurementFromBOQ(routeProjectId);
  if (result.success) {
    navigate to procurement page
  }
}
```

**What gets generated:**
- All BOQ items with quantity > 0
- Material name from BOQ item name
- Quantity from BOQ quantity field
- Unit from BOQ unit field
- Category from BOQ category field
- Description as notes

### 2. Procurement Page Display

**File:** `src/pages/ProcurementPage.tsx`

Features:
- Project-scoped view (`/projects/:projectId/procurement`)
- Summary cards showing total, pending, ordered, and received counts
- Status filter buttons (all, pending, ordered, received)
- Grouped by category/trade
- Full traceability to source BOQ items

**Display columns:**
- Material - Item name with optional notes
- Quantity - Numeric value (2 decimal places)
- Unit - Unit of measurement
- Source BOQ Item - Name and description from original BOQ
- Status - Dropdown to change status
- Actions - Delete button

### 3. Status Management

Users can update procurement status directly from the table:
- **Pending** - Initial state (yellow)
- **Ordered** - Item has been ordered (blue)
- **Received** - Item has been received (green)

Status changes are saved immediately to the database.

## Helper Functions

**File:** `src/lib/procurement.ts`

### `generateProcurementFromBOQ(projectId)`
Generates procurement items from BOQ.

Process:
1. Fetch BOQ header for project
2. Fetch all BOQ items (non-section-headers)
3. Filter items with quantity > 0
4. Clear existing procurement items for project
5. Create new procurement items

Returns: `{ success: boolean, count?: number, error? }`

### `fetchProcurementItems(projectId)`
Retrieves all procurement items for a project with BOQ source data.

Returns:
```typescript
{
  success: boolean,
  data: ProcurementItemWithSource[]
}
```

### `updateProcurementItemStatus(itemId, status)`
Updates the status of a procurement item.

Parameters:
- `itemId` - Procurement item UUID
- `status` - 'pending' | 'ordered' | 'received'

Returns: `{ success: boolean, data? }`

### `deleteProcurementItem(itemId)`
Deletes a procurement item.

Returns: `{ success: boolean }`

## Usage Flow

### Complete Workflow

1. **Create BOQ Items**
   - Navigate to `/projects/:projectId/boq`
   - Add sections and items
   - Set quantities and units
   - Save the BOQ

2. **Generate Procurement List**
   - Click "Generate Procurement" button
   - Confirm regeneration in dialog
   - System creates procurement items from BOQ
   - Automatically navigates to procurement page

3. **Manage Procurement**
   - View items grouped by category
   - Update status as procurement progresses
   - Track pending, ordered, and received counts
   - Delete items if needed

4. **Example Flow**
   ```
   BOQ Section: "Concrete Work"
   - Item: "Concrete Mix 25MPa"
   - Qty: 150
   - Unit: m³

   Generated Procurement:
   - Material: "Concrete Mix 25MPa"
   - Quantity: 150
   - Unit: m³
   - Category: "Concrete Work"
   - Status: "pending"
   ```

## Technical Notes

### Data Integrity
- Foreign key to projects with CASCADE delete
- Foreign key to boq_items with SET NULL (preserves procurement if BOQ item deleted)
- RLS ensures project-scoped access

### Regeneration Behavior
- Clears ALL existing procurement items for the project
- Generates fresh from current BOQ state
- Warning dialog prevents accidental data loss

### Category Grouping
- Items grouped by category field
- Uncategorized items shown in "Uncategorized" group
- Alphabetical sorting within groups

### Status Tracking
- Color-coded by status (yellow/blue/green)
- Dropdown allows quick status changes
- Summary cards show distribution

### UI Design
- Consistent with Magnus System dark theme
- Table layout for detailed view
- Responsive design with overflow handling
- Visual hierarchy with grouped sections

## Future Enhancements

Potential improvements:
1. Supplier management integration
2. Purchase order generation
3. Cost tracking per procurement item
4. Delivery date tracking
5. Partial delivery support
6. Export to CSV/Excel
7. Procurement history and audit log
8. Multi-project procurement aggregation
