# Procurement System - Quick Reference Guide

## Database Schema Quick View

### procurement_headers
```sql
id               uuid         PRIMARY KEY
project_id       uuid         NOT NULL FK → projects
boq_id           uuid         FK → boq_headers (nullable)
title            text         NOT NULL
status           text         DEFAULT 'draft' (draft|approved|sent|completed)
notes            text         nullable
created_at       timestamptz  DEFAULT now()
updated_at       timestamptz  DEFAULT now()
```

### procurement_items
```sql
id                    uuid      PRIMARY KEY
procurement_id        uuid      NOT NULL FK → procurement_headers
project_id            uuid      NOT NULL FK → projects
source_boq_item_id    uuid      FK → boq_section_items (nullable)
material_name         text      NOT NULL
description           text      nullable (NEW)
quantity              numeric   DEFAULT 0
unit                  text      nullable
category              text      nullable
notes                 text      nullable
status                text      DEFAULT 'pending' (pending|ordered|received)
supplier              text      nullable (NEW)
created_at            timestamptz
updated_at            timestamptz
```

## API Functions Reference

### Fetch Functions
```typescript
// Get all procurement documents for a project
fetchProcurementHeaders(projectId: string)
// Returns: { success, data: ProcurementHeaderWithItems[], error }

// Get specific document with all items
fetchProcurementDocument(procurementId: string)
// Returns: { success, data: ProcurementHeaderWithItems, error }
```

### Create/Update Functions
```typescript
// Generate from BOQ (creates or updates document)
generateProcurementFromBOQ(projectId: string)
// Returns: { success, data, count, procurementId, error }

// Update document header
updateProcurementHeader(
  procurementId: string,
  updates: { title?, status?, notes? }
)
// Returns: { success, data, error }

// Update item status
updateProcurementItemStatus(
  itemId: string,
  status: "pending" | "ordered" | "received"
)
// Returns: { success, data, error }
```

### Delete Functions
```typescript
// Delete entire document (cascades to items)
deleteProcurementHeader(procurementId: string)
// Returns: { success, error }

// Delete single item
deleteProcurementItem(itemId: string)
// Returns: { success, error }
```

## URL Parameters

### List View
```
/projects/{projectId}/procurement
/projects/{projectId}/procurement?view=list
```

### Document View
```
/projects/{projectId}/procurement?view=document&doc={procurementId}
```

## UI Components

### List View Shows:
- Document cards with title, status badge, notes
- Item count and last updated date
- View and Delete buttons per document
- Summary: Total Documents, Draft, Approved counts

### Document View Shows:
- Editable title (click to edit)
- Status dropdown (draft/approved/sent/completed)
- Print button
- Summary: Total Items, Pending, Ordered, Received counts
- Status filter (all/pending/ordered/received)
- Items table grouped by category
- Actions: Update status, Delete item

## Print Format

When printing procurement document:
- Company name header (if available)
- "Procurement List" title
- Document title
- Project name, Date, Status
- Items table by category
- Material, Description, Quantity, Unit columns
- Generation timestamp footer
- Page break handling for long lists

## RLS Policies Summary

### procurement_headers
1. **SELECT**: Project members can view their project's documents
2. **INSERT**: Project members can create documents for their projects
3. **UPDATE**: Project members can update their project's documents
4. **DELETE**: Project members can delete their project's documents

### procurement_items
1. **SELECT**: Access via procurement_headers → project_members
2. **INSERT**: Access via procurement_headers → project_members
3. **UPDATE**: Access via procurement_headers → project_members
4. **DELETE**: Access via procurement_headers → project_members

## Status Workflow

### Document Status
```
draft → approved → sent → completed
```

### Item Status
```
pending → ordered → received
```

When item status changes to "received":
- Prompts for unit cost
- Calculates total cost (quantity × unit cost)
- Creates cost record in project_costs table
- Logs activity

## Future Extensions

### Ready for Purchase Orders:
```sql
-- Add when ready
ALTER TABLE procurement_items ADD COLUMN purchase_order_id uuid REFERENCES purchase_orders(id);

CREATE TABLE purchase_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  procurement_id uuid REFERENCES procurement_headers(id),
  supplier_name text,
  status text,
  total_amount numeric,
  created_at timestamptz DEFAULT now()
);
```

### Multi-Supplier Split:
- Duplicate procurement items
- Assign different suppliers to each
- Track separately through PO workflow

## Common Queries

### Get document with item counts:
```sql
SELECT h.*, COUNT(i.id) as item_count
FROM procurement_headers h
LEFT JOIN procurement_items i ON i.procurement_id = h.id
WHERE h.project_id = $1
GROUP BY h.id
ORDER BY h.updated_at DESC;
```

### Get items by category:
```sql
SELECT category, COUNT(*) as count, SUM(quantity) as total_qty
FROM procurement_items
WHERE procurement_id = $1
GROUP BY category
ORDER BY category;
```

### Check FK integrity:
```sql
SELECT
  i.id,
  i.material_name,
  CASE WHEN h.id IS NOT NULL THEN 'OK' ELSE 'BROKEN' END as header_fk,
  CASE WHEN b.id IS NOT NULL THEN 'OK' ELSE 'NULL' END as boq_fk
FROM procurement_items i
LEFT JOIN procurement_headers h ON h.id = i.procurement_id
LEFT JOIN boq_section_items b ON b.id = i.source_boq_item_id
WHERE i.procurement_id = $1;
```

## Migration Notes

- Existing procurement_items automatically migrated to documents
- Each project's items grouped into one "BOQ Materials List" document
- All foreign keys preserved and validated
- No data loss during migration
- Status fields use same values (pending/ordered/received)

## Testing Checklist

- [ ] Generate procurement from BOQ
- [ ] View document list
- [ ] Open specific document
- [ ] Edit document title
- [ ] Change document status
- [ ] Filter items by status
- [ ] Update item status to "received" (enter cost)
- [ ] Delete single item
- [ ] Delete entire document
- [ ] Print document (check layout)
- [ ] Regenerate from BOQ (should update, not duplicate)
- [ ] Verify RLS (test with different project members)

## Support

For issues or questions:
1. Check RLS policies are enabled
2. Verify foreign key constraints
3. Check browser console for errors
4. Verify project membership for current user
5. Review migration log for data integrity
