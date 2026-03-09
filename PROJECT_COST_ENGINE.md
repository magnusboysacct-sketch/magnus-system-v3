# Project Cost Engine

This document describes the Project Cost Engine, which tracks project costs vs budget by automatically capturing costs from procurement and enabling manual cost entry.

## Overview

The system now supports:
1. Automatic cost tracking when materials are received
2. Project-scoped cost records by type (material, labor, equipment, other)
3. Cost summary aggregation and display
4. Integration with procurement workflow
5. Financial dashboard on project overview

## Database Schema

### Table: `project_costs`

Stores all costs associated with a project, categorized by type.

**Columns:**
- `id` (uuid, primary key)
- `project_id` (uuid, references projects)
- `cost_type` (text: 'material', 'labor', 'equipment', 'other')
- `source_id` (uuid, nullable, references source records like procurement_items)
- `description` (text, description of the cost)
- `amount` (numeric, cost amount, must be >= 0)
- `cost_date` (date, when the cost was incurred)
- `notes` (text, optional additional notes)
- `created_at` (timestamptz)
- `updated_at` (timestamptz)

**Security:**
- RLS enabled
- Users can only access costs for projects they are members of
- Full CRUD policies based on project membership

**Indexes:**
- `project_id` - Fast filtering by project
- `cost_type` - Category filtering
- `cost_date` - Time-based queries
- `source_id` - Tracing back to source records

## Features

### 1. Automatic Cost Creation from Procurement

**File:** `src/pages/ProcurementPage.tsx`

When a procurement item status changes to "received":
1. System prompts user for unit cost
2. Calculates total cost: `quantity × unit_cost`
3. Creates a `project_costs` record with:
   - `cost_type`: 'material'
   - `source_id`: procurement item ID
   - `description`: Material name with quantity and unit
   - `amount`: Total calculated cost
   - `notes`: Unit cost reference

**Example Flow:**
```
Procurement Item: "Concrete Mix 25MPa"
- Quantity: 150 m³
- Status change: pending → received
- User prompted: "Enter unit cost per m³"
- User enters: $120.00
- System creates cost:
  - Description: "Concrete Mix 25MPa - 150 m³"
  - Amount: $18,000.00
  - Notes: "Unit cost: 120 per m³"
```

**Code Implementation:**
```typescript
async function handleStatusChange(itemId, status) {
  const item = items.find(i => i.id === itemId);

  if (status === "received" && item.status !== "received") {
    const unitCost = parseFloat(window.prompt("Enter unit cost:"));
    const totalAmount = item.quantity * unitCost;

    await createProjectCost(
      item.project_id,
      "material",
      `${item.material_name} - ${item.quantity} ${item.unit}`,
      totalAmount,
      item.id,
      `Unit cost: ${unitCost} per ${item.unit}`
    );
  }

  await updateProcurementItemStatus(itemId, status);
}
```

### 2. Cost Summary Calculation

**File:** `src/lib/costs.ts`

**Function:** `getProjectCostSummary(projectId)`

Returns aggregated costs by category:

```typescript
interface CostSummary {
  material_cost: number;
  labor_cost: number;
  equipment_cost: number;
  other_cost: number;
  total_cost: number;
}
```

**Process:**
1. Fetch all project_costs for the project
2. Aggregate amounts by cost_type
3. Calculate total across all types
4. Return structured summary

### 3. Project Dashboard Cost Display

**File:** `src/pages/ProjectDashboardPage.tsx`

The dashboard now includes a prominent cost summary card displaying:

**Layout:**
- 5-column grid (responsive to 2 columns on mobile)
- Color-coded by cost type:
  - Material: Blue
  - Labor: Amber
  - Equipment: Purple
  - Other: Slate
  - Total: Emerald (highlighted)

**Data Updates:**
- Loads when project dashboard loads
- Fetches latest cost summary from database
- Displays formatted currency values

**Display Format:**
```
Material Cost    Labor Cost    Equipment Cost    Other Cost    Total Cost
$18,000.00      $0.00         $0.00             $0.00         $18,000.00
```

## Helper Functions

**File:** `src/lib/costs.ts`

### `createProjectCost(projectId, costType, description, amount, sourceId?, notes?)`

Creates a new cost record.

**Parameters:**
- `projectId` - Project UUID
- `costType` - 'material' | 'labor' | 'equipment' | 'other'
- `description` - Text description of the cost
- `amount` - Numeric cost amount
- `sourceId` - Optional UUID of source record (e.g., procurement_item_id)
- `notes` - Optional additional notes

**Returns:** `{ success: boolean, data?, error? }`

### `getProjectCostSummary(projectId)`

Retrieves aggregated cost summary for a project.

**Returns:** `CostSummary` object with costs by type and total

### `fetchProjectCosts(projectId)`

Retrieves all cost records for a project, ordered by date.

**Returns:** `{ success: boolean, data: ProjectCost[] }`

### `deleteProjectCost(costId)`

Deletes a cost record.

**Returns:** `{ success: boolean }`

### `createCostFromProcurement(procurementItem, unitCost)`

Helper function to create a material cost from a procurement item.

Automatically calculates total and formats description.

## Usage Flow

### Complete Workflow

1. **Create BOQ and Generate Procurement**
   - Build BOQ with items and quantities
   - Generate procurement list from BOQ

2. **Manage Procurement Status**
   - Mark items as "ordered" when purchasing
   - When materials arrive, change status to "received"

3. **Automatic Cost Capture**
   - System prompts for unit cost
   - Validates input (must be positive number)
   - Calculates total cost: qty × unit cost
   - Creates project_costs record
   - Links to source procurement item

4. **View Cost Summary**
   - Navigate to Project Dashboard
   - See cost breakdown by category
   - Monitor total project costs
   - Track against budget (future feature)

### Example Scenario

```
Project: "Office Building Renovation"

Step 1: Create BOQ
- Add items: Concrete, Steel, Labor, etc.

Step 2: Generate Procurement
- Creates procurement_items from BOQ

Step 3: Order Materials
- Mark "Concrete Mix 25MPa" as "ordered"

Step 4: Receive Materials
- Mark "Concrete Mix 25MPa" as "received"
- Prompt: "Enter unit cost per m³"
- Enter: 120.00
- System creates cost: $18,000.00

Step 5: View Dashboard
- Material Cost: $18,000.00
- Total Cost: $18,000.00

Step 6: Continue Process
- Receive more materials
- Costs automatically accumulate
- Dashboard updates reflect current totals
```

## Data Integrity

### Traceability
- Each cost record can link to source (procurement_items)
- Source ID allows tracking back to original BOQ item
- Full audit trail from takeoff → BOQ → procurement → cost

### Validation
- Unit cost must be valid positive number
- Total amount calculated automatically
- Amount field has CHECK constraint (>= 0)
- Required fields enforced at database level

### Security
- Project-scoped access via RLS
- Only project members can view/create costs
- Secure against unauthorized access
- Foreign key CASCADE on project delete

## Future Enhancements

Potential improvements:

1. **Budget Management**
   - Set project budgets by category
   - Display budget vs actual comparison
   - Alert when approaching budget limits
   - Variance analysis and reporting

2. **Manual Cost Entry**
   - Add costs not from procurement
   - Labor cost tracking interface
   - Equipment rental cost entry
   - Miscellaneous expense tracking

3. **Cost Analytics**
   - Cost trends over time
   - Category breakdown charts
   - Cost forecasting based on progress
   - Comparison across similar projects

4. **Integration Enhancements**
   - Import costs from accounting systems
   - Export to financial software
   - Receipt/invoice attachment
   - Approval workflows for costs

5. **Reporting**
   - Cost reports by period
   - Category-wise analysis
   - Profitability calculations
   - Client-facing cost summaries

6. **Rate Management**
   - Store material rate history
   - Suggest rates based on history
   - Supplier price comparison
   - Automatic rate updates

## Technical Notes

### Performance
- Indexed on project_id for fast filtering
- Cost aggregation happens at query time
- Minimal overhead on procurement workflow
- Dashboard loads costs asynchronously

### User Experience
- Non-blocking prompt for unit cost
- Cancel option available (ESC or Cancel button)
- Immediate validation of input
- Clear error messages for invalid entries
- Automatic navigation flow maintained

### Type Safety
- Strong TypeScript types for all cost operations
- Enum-like string unions for cost_type
- Validated interfaces for data structures
- Type-safe helper functions

### Database Design
- Normalized structure
- Flexible source_id for various sources
- Date tracking for temporal queries
- Extensible for future cost sources
