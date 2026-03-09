# Takeoff to BOQ Integration

This document describes the integration between the Takeoff and BOQ systems, allowing measurements from PDF takeoffs to populate BOQ quantities.

## Overview

The system now supports:
1. Saving takeoff measurements to the database (project-scoped)
2. Importing takeoff quantities into BOQ items
3. Mapping takeoff groups to BOQ items

## Database Schema

### Table: `takeoff_pdf_measurements`

Stores measurements created in the TakeoffPage PDF viewer.

**Columns:**
- `id` (uuid, primary key)
- `project_id` (uuid, references projects)
- `session_id` (text, identifies the PDF/drawing)
- `measurement_type` (text: 'line', 'area', 'volume', 'count')
- `label` (text, user-provided name)
- `quantity` (numeric, calculated value)
- `unit` (text: 'ft', 'ft²', 'yd³', 'ea')
- `group_name` (text, trade/category from TakeoffPage)
- `group_id` (uuid, group identifier)
- `metadata` (jsonb, stores points, colors, etc.)
- `created_at` (timestamptz)
- `updated_at` (timestamptz)

**Security:**
- RLS enabled
- Users can only access measurements for projects they are members of

## Features

### 1. TakeoffPage Auto-Save to Database

**File:** `src/pages/TakeoffPage.tsx`

When a project context exists (`/projects/:projectId/takeoff`):
- Measurements are automatically saved to the database
- Saves are debounced (400ms delay)
- Both localStorage and database are updated

**Implementation:**
```typescript
if (activeProjectId && measurements.length > 0) {
  await saveMeasurementsToDB(
    activeProjectId,
    sessionId,
    measurements,
    groups
  );
}
```

### 2. Import Takeoff Quantities into BOQ

**File:** `src/pages/BOQPage.tsx`

A new import button appears next to each BOQ item's Qty field:
- Only visible when editing and in project context
- Opens a modal showing available takeoff measurements
- Groups measurements by takeoff group (trade/category)

**How to use:**
1. Open a BOQ item
2. Click the download icon next to the Qty field
3. Select a takeoff group (e.g., "Concrete", "Masonry")
4. Select a metric (line, area, volume, or count)
5. Click "Import Quantity"
6. The quantity is populated from takeoff measurements

### 3. Import Modal

**File:** `src/components/ImportTakeoffModal.tsx`

Features:
- Fetches measurements grouped by trade/category
- Shows totals for each metric type
- Only displays metrics that have values > 0
- Radio button selection for metric type
- Visual feedback with values displayed

## Helper Functions

**File:** `src/lib/takeoffDB.ts`

### `saveMeasurementsToDB()`
Saves measurements from TakeoffPage to database.

Parameters:
- `projectId` - Project UUID
- `sessionId` - PDF session identifier
- `measurements` - Array of measurements
- `groups` - Array of group definitions

Returns: `{ success: boolean, data?, error? }`

### `fetchMeasurementsFromDB()`
Retrieves all measurements for a project.

Parameters:
- `projectId` - Project UUID

Returns: `{ success: boolean, data: TakeoffPDFMeasurement[] }`

### `getMeasurementsSummaryByGroup()`
Gets aggregated totals grouped by trade/category.

Parameters:
- `projectId` - Project UUID

Returns:
```typescript
{
  success: boolean,
  data: Array<{
    group_name: string;
    line_ft: number;
    area_ft2: number;
    volume_yd3: number;
    count_ea: number;
  }>
}
```

## Usage Flow

### Complete Workflow

1. **Create Takeoff Measurements**
   - Navigate to `/projects/:projectId/takeoff`
   - Upload a PDF drawing
   - Calibrate the scale
   - Use measurement tools (line, area, volume, count)
   - Assign measurements to groups (trades)
   - Measurements auto-save to database

2. **Import into BOQ**
   - Navigate to `/projects/:projectId/boq`
   - Create or edit a BOQ section and items
   - For any item, click the import icon next to Qty
   - Select the takeoff group
   - Select the metric type
   - Quantity is automatically populated

3. **Example Mapping**
   ```
   Takeoff Group: "Concrete"
   - Area measurement: 1250 ft²

   BOQ Item: "Concrete Slab Pour"
   - Import from Concrete → Area (ft²)
   - Result: Qty = 1250
   ```

## Technical Notes

### Type Safety
- TypeScript types ensure measurement types match database constraints
- Only valid measurement types (line, area, volume, count) are saved
- Point measurements are filtered out before database save

### Performance
- Debounced saves prevent database hammering
- Summaries are calculated on-demand
- Database queries filtered by project_id for efficiency

### Data Integrity
- Measurements tied to projects via foreign key
- Cascade delete when project is deleted
- RLS ensures users only access their project data

## Future Enhancements

Potential improvements:
1. Bidirectional sync (BOQ → Takeoff highlighting)
2. Historical tracking of quantity changes
3. Automatic unit conversion
4. Multi-measurement aggregation
5. Drawing annotations export to PDF
