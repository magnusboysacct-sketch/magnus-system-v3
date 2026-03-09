# BOQ Duplicate Key Constraint Fix

## Problem Summary
Saving a BOQ was failing with:
```
duplicate key value violates unique constraint "boq_unique_version_per_project"
```

## Root Cause
The unique constraint `boq_unique_version_per_project` on `boq_headers` table enforces:
- Each `(company_id, project_id, version)` combination must be unique

**The Bug:**
The original save logic always tried to INSERT a new BOQ with `version: 1` when `boqId` was null in local state, even if:
1. A draft BOQ with version 1 already existed in the database
2. The user had previously saved a draft but the page was refreshed (losing local state)
3. Multiple drafts were being created instead of updating the existing one

**Sequence of the Bug:**
1. User creates a new BOQ → saves draft → `version 1` created ✅
2. User refreshes page → local `boqId` state is lost ❌
3. User makes edits → clicks save draft
4. Code sees `boqId === null` → tries to INSERT with `version: 1`
5. Database rejects: version 1 already exists for this project! ❌

## Database Schema

### Unique Constraint
```sql
CREATE UNIQUE INDEX boq_unique_version_per_project
ON boq_headers (company_id, project_id, version);
```

### Tables
```
boq_headers
  ├── id (uuid, primary key)
  ├── company_id (uuid) ─┐
  ├── project_id (uuid) ─┼─ UNIQUE constraint
  ├── version (integer) ─┘
  ├── status (text) - 'draft' or 'approved'
  ├── created_at (timestamptz)
  └── updated_at (timestamptz)
```

## Solution Implemented

### New Save Logic Flow

#### 1. **Determine Operation Type (INSERT vs UPDATE)**

**If local `boqId` exists:**
- Operation: `UPDATE`
- Fetch existing BOQ to verify it belongs to current project
- Use existing version number
- Update the BOQ header

**If local `boqId` is null:**
- Check database for existing BOQs for this project
- **If existing draft found:**
  - Operation: `UPDATE`
  - Reuse the existing draft BOQ ID
  - Keep the same version number
- **If no draft but other versions exist:**
  - Operation: `INSERT`
  - Calculate next version: `max(version) + 1`
- **If no BOQs exist:**
  - Operation: `INSERT`
  - Use version: `1`

#### 2. **Defensive Version Check**
Before any INSERT:
```typescript
// Check if the intended version already exists
const { data: versionCheck } = await supabase
  .from("boq_headers")
  .select("id")
  .eq("project_id", projectId)
  .eq("version", versionNumber)
  .maybeSingle();

if (versionCheck) {
  throw new Error(`Cannot INSERT: version ${versionNumber} already exists`);
}
```

#### 3. **Safe Insert/Update**
```typescript
if (operationType === "INSERT") {
  // Create new BOQ with calculated version
  const { data: ins } = await supabase
    .from("boq_headers")
    .insert([{ project_id, status: nextStatus, version: versionNumber }])
    .select("id, version")
    .single();

  headerId = ins.id;
  setBoqId(headerId);
} else {
  // Update existing BOQ
  await supabase
    .from("boq_headers")
    .update({ status: nextStatus, updated_at: new Date().toISOString() })
    .eq("id", headerId);
}
```

### Save Flow (Complete)

```
┌─────────────────────────────────────────┐
│ 1. Determine Operation Type            │
├─────────────────────────────────────────┤
│ Has local boqId?                        │
│   YES → UPDATE existing BOQ             │
│   NO  → Check database                  │
│         ├─ Draft exists? → UPDATE draft │
│         └─ No draft? → INSERT new       │
└─────────────────────────────────────────┘
           ↓
┌─────────────────────────────────────────┐
│ 2. Calculate Version Number             │
├─────────────────────────────────────────┤
│ UPDATE: Use existing version            │
│ INSERT: max(existing_versions) + 1      │
│         or 1 if no versions exist       │
└─────────────────────────────────────────┘
           ↓
┌─────────────────────────────────────────┐
│ 3. Defensive Version Check (INSERT)    │
├─────────────────────────────────────────┤
│ Verify version doesn't already exist   │
│ If exists → throw error                 │
└─────────────────────────────────────────┘
           ↓
┌─────────────────────────────────────────┐
│ 4. Execute INSERT or UPDATE             │
├─────────────────────────────────────────┤
│ INSERT: Create new boq_headers row      │
│ UPDATE: Update existing boq_headers row │
│ Capture returned boqs.id                │
└─────────────────────────────────────────┘
           ↓
┌─────────────────────────────────────────┐
│ 5. Verify BOQ Header Exists             │
├─────────────────────────────────────────┤
│ SELECT from boq_headers                 │
│ Confirm ID, version, project_id         │
└─────────────────────────────────────────┘
           ↓
┌─────────────────────────────────────────┐
│ 6. Delete Old Sections                  │
├─────────────────────────────────────────┤
│ DELETE FROM boq_sections                │
│ WHERE boq_id = headerId                 │
└─────────────────────────────────────────┘
           ↓
┌─────────────────────────────────────────┐
│ 7. Insert New Sections                  │
├─────────────────────────────────────────┤
│ INSERT INTO boq_sections                │
│ WITH boq_id = headerId                  │
└─────────────────────────────────────────┘
           ↓
┌─────────────────────────────────────────┐
│ 8. Insert Items                         │
├─────────────────────────────────────────┤
│ INSERT INTO boq_section_items           │
│ WITH section_id from step 7             │
└─────────────────────────────────────────┘
```

## Behavior by Scenario

### Scenario 1: First Save of New BOQ
```
Input:
  - boqId: null
  - No existing BOQs for project

Logic:
  - Check database → no BOQs found
  - Operation: INSERT
  - Version: 1

Result:
  ✅ Creates version 1
  ✅ Sets local boqId
```

### Scenario 2: Resaving Existing Draft
```
Input:
  - boqId: "abc-123"
  - BOQ exists in database as draft

Logic:
  - Have local boqId
  - Operation: UPDATE
  - Version: unchanged (e.g., 1)

Result:
  ✅ Updates existing draft
  ✅ No new version created
```

### Scenario 3: Page Refresh Then Save Draft
```
Input:
  - boqId: null (lost on refresh)
  - Draft version 1 exists in database

Logic:
  - No local boqId
  - Check database → draft found
  - Operation: UPDATE (reuse draft)
  - Version: 1 (unchanged)

Result:
  ✅ Updates existing draft
  ✅ No duplicate version created
  ✅ Sets local boqId to existing draft
```

### Scenario 4: Creating New Version
```
Input:
  - boqId: null
  - Approved version 1 exists
  - User wants to create new version

Logic:
  - No local boqId
  - Check database → approved v1 found
  - Operation: INSERT (new version)
  - Version: 2 (calculated)

Result:
  ✅ Creates version 2
  ✅ Version 1 remains unchanged
```

### Scenario 5: Updating Approved BOQ
```
Input:
  - boqId: "xyz-789"
  - BOQ exists as approved

Logic:
  - Have local boqId
  - Operation: UPDATE
  - Version: unchanged

Result:
  ✅ Updates existing approved BOQ
  ✅ Status remains approved (or changes to draft if requested)
```

## Comprehensive Logging

All save operations now log detailed information:

```
[BOQ Save] ========== Starting save process ==========
[BOQ Save] Current local boqId: null
[BOQ Save] Project ID: 550e8400-e29b-41d4-a716-446655440000
[BOQ Save] Target status: draft
[BOQ Save] Sections count: 3
[BOQ Save] No local boqId - checking for existing BOQ in database...
[BOQ Save] Found existing BOQ: { id: 'abc-123', version: 1, status: 'draft' }
[BOQ Save] Reusing existing draft BOQ
[BOQ Save] Operation type: UPDATE
[BOQ Save] Version number: 1
[BOQ Save] UPDATING existing BOQ header: abc-123
[BOQ Save] Successfully UPDATED BOQ header
[BOQ Save] Verifying BOQ header exists: abc-123
[BOQ Save] BOQ header verified successfully:
[BOQ Save]   - ID: abc-123
[BOQ Save]   - Version: 1
[BOQ Save]   - Project ID: 550e8400-e29b-41d4-a716-446655440000
[BOQ Save] Deleting existing sections for boq_id: abc-123
[BOQ Save] Existing sections deleted
[BOQ Save] Inserting 3 sections...
[BOQ Save] Section payload [0]: { id: 's1', boq_id: 'abc-123', title: 'Foundation' }
[BOQ Save] Section payload [1]: { id: 's2', boq_id: 'abc-123', title: 'Structure' }
[BOQ Save] Section payload [2]: { id: 's3', boq_id: 'abc-123', title: 'Finishes' }
[BOQ Save] Sections inserted successfully
[BOQ Save] Inserting 15 items...
[BOQ Save] Item payload [0]: { id: 'i1', section_id: 's1', item_name: 'Concrete' }
[BOQ Save] Item payload [1]: { id: 'i2', section_id: 's1', item_name: 'Rebar' }
[BOQ Save] Item payload [2]: { id: 'i3', section_id: 's2', item_name: 'Formwork' }
[BOQ Save] Items inserted successfully
[BOQ Save] ========== Save completed successfully! ==========
```

## Code Changes

### File: src/pages/BOQPage.tsx

**Function: `saveBoqToSupabase()`**

#### Key Changes:

1. **Added version number calculation**
   ```typescript
   let versionNumber = 1;
   let operationType: "INSERT" | "UPDATE" = "INSERT";
   ```

2. **Added existing BOQ check**
   ```typescript
   if (!headerId) {
     // Check if a BOQ already exists for this project
     const { data: existingBoqs } = await supabase
       .from("boq_headers")
       .select("id, version, status")
       .eq("project_id", projectId)
       .order("version", { ascending: false })
       .limit(1);

     const existingBoq = existingBoqs?.[0];

     if (existingBoq && nextStatus === "draft" && existingBoq.status === "draft") {
       // Reuse existing draft
       headerId = existingBoq.id;
       versionNumber = existingBoq.version;
       operationType = "UPDATE";
     } else if (existingBoq) {
       // Create new version
       versionNumber = existingBoq.version + 1;
       operationType = "INSERT";
     }
   }
   ```

3. **Added defensive version check**
   ```typescript
   if (operationType === "INSERT") {
     // Verify version doesn't already exist
     const { data: versionCheck } = await supabase
       .from("boq_headers")
       .select("id")
       .eq("project_id", projectId)
       .eq("version", versionNumber)
       .maybeSingle();

     if (versionCheck) {
       throw new Error(`Version ${versionNumber} already exists!`);
     }
   }
   ```

4. **Enhanced logging throughout**
   - Operation type (INSERT/UPDATE)
   - Version number being used
   - Each section payload
   - First 3 item payloads
   - Success/failure markers

## Testing Checklist

- [x] Build compiles successfully
- [ ] **Scenario 1**: First save creates version 1
- [ ] **Scenario 2**: Resaving draft updates existing (no new version)
- [ ] **Scenario 3**: Page refresh then save updates existing draft
- [ ] **Scenario 4**: Can create new version from approved BOQ
- [ ] **Scenario 5**: Can update approved BOQ
- [ ] **Scenario 6**: No duplicate key errors occur
- [ ] **Scenario 7**: Console logs show correct operation type
- [ ] **Scenario 8**: Sections and items save correctly

## Edge Cases Handled

✅ **Draft already exists with same version**
  - Reuses existing draft, updates it

✅ **Multiple saves in same session**
  - First save creates/updates and sets `boqId`
  - Subsequent saves use UPDATE path

✅ **Page refresh loses local state**
  - Checks database for existing draft
  - Reuses draft instead of creating duplicate

✅ **Approved BOQ exists**
  - Creates next version when needed
  - Updates existing when editing

✅ **Version collision**
  - Defensive check prevents INSERT of duplicate version
  - Throws clear error message

✅ **Cross-project contamination**
  - Verifies BOQ belongs to current project before UPDATE

## Future Considerations

### Version Management Strategy

Current behavior:
- Drafts are reused (no new version on save)
- New version created when approved BOQ is edited

Consider adding explicit "Create New Version" button for users who want to:
- Clone an existing BOQ
- Create a variation
- Archive an old version and start fresh

### Auto-save Implications

With auto-save enabled:
- First auto-save creates version 1
- Subsequent auto-saves UPDATE version 1
- This is correct behavior for draft mode

Recommendation: Keep this behavior, it's intuitive.

### Constraint Importance

**DO NOT REMOVE** the `boq_unique_version_per_project` constraint!

This constraint ensures:
- Data integrity
- No duplicate versions
- Clear version history
- Proper BOQ lifecycle management

The fix addresses the application logic, not the constraint.
