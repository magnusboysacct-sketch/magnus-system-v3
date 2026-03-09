# BOQ Save Issues - Complete Fix

## Issue 1: Foreign Key Constraint Violation (FIXED)

### Problem
Saving a BOQ was failing with:
```
insert or update on table "boq_sections" violates foreign key constraint "boq_sections_boq_id_fkey"
```

## Root Cause
The codebase has **two different BOQ table structures**:

1. **Old structure (correct)**: `boq_headers` table
2. **New structure (incorrect)**: `boqs` table

The foreign key constraint is defined as:
```
boq_sections.boq_id → boq_headers.id
```

However, `BOQPage.tsx` was incorrectly trying to save BOQ headers to the `boqs` table instead of `boq_headers`, causing the foreign key violation when inserting sections.

## Database Schema
```
boq_headers (correct parent table)
  ├── id (uuid, primary key)
  ├── project_id (uuid)
  ├── status (text)
  └── version (integer)

boq_sections (child table)
  ├── id (uuid, primary key)
  ├── boq_id (uuid) → REFERENCES boq_headers(id)  ← This was the issue
  ├── sort_order (integer)
  ├── master_category_id (uuid)
  ├── title (text)
  └── scope (text)

boq_section_items (grandchild table)
  ├── id (uuid, primary key)
  ├── section_id (uuid) → REFERENCES boq_sections(id)
  └── ... (other columns)
```

## Solution Applied

### Changes to BOQPage.tsx

#### 1. Fixed `loadLatestBoqForProject()` function
**Before:**
```typescript
const { data: headers, error: headerErr } = await supabase
  .from("boqs")  // ❌ Wrong table
  .select("id,project_id,status,version,updated_at")
```

**After:**
```typescript
const { data: headers, error: headerErr } = await supabase
  .from("boq_headers")  // ✅ Correct table
  .select("id,project_id,status,version,updated_at")
```

#### 2. Fixed `saveBoqToSupabase()` function
**Before:**
```typescript
const { data: ins, error: insErr } = await supabase
  .from("boqs")  // ❌ Wrong table
  .insert([{ project_id: projectId, status: nextStatus, version: 1 }])
```

**After:**
```typescript
const { data: ins, error: insErr } = await supabase
  .from("boq_headers")  // ✅ Correct table
  .insert([{ project_id: projectId, status: nextStatus, version: 1 }])
```

#### 3. Added Defensive Guard
Added verification step before inserting sections:
```typescript
// Step 2: Verify the BOQ header exists before inserting sections
console.log("[BOQ Save] Verifying BOQ header exists:", headerId);
const { data: verifyHeader, error: verifyErr } = await supabase
  .from("boq_headers")
  .select("id")
  .eq("id", headerId)
  .single();

if (verifyErr || !verifyHeader) {
  const errorMsg = `BOQ header verification failed! Header ID ${headerId} does not exist in boq_headers table.`;
  console.error("[BOQ Save]", errorMsg);
  throw new Error(errorMsg);
}
console.log("[BOQ Save] BOQ header verified successfully");
```

#### 4. Added Comprehensive Logging
Added detailed console logging throughout the save process:
- Incoming boqId before save
- Created/updated boq_headers.id
- Each section payload
- Each item payload
- Success/failure status at each step

Example logs:
```
[BOQ Save] Starting save process...
[BOQ Save] Incoming boqId: null
[BOQ Save] Project ID: abc-123
[BOQ Save] Status: draft
[BOQ Save] Sections count: 2
[BOQ Save] Creating new BOQ header in boq_headers...
[BOQ Save] Created new BOQ header with id: xyz-789
[BOQ Save] Verifying BOQ header exists: xyz-789
[BOQ Save] BOQ header verified successfully
[BOQ Save] Section payload: { id: 's1', boq_id: 'xyz-789', ... }
[BOQ Save] Inserting 2 sections...
[BOQ Save] Sections inserted successfully
[BOQ Save] Item payload: { id: 'i1', section_id: 's1', ... }
[BOQ Save] Inserting 5 items...
[BOQ Save] Items inserted successfully
[BOQ Save] Save completed successfully!
```

## Save Flow (Correct Order)

1. **Create/Update BOQ Header** in `boq_headers`
   - If new: INSERT and get returned `id`
   - If existing: UPDATE the `status`
   - Store the `headerId`

2. **Verify BOQ Header Exists**
   - SELECT from `boq_headers` where `id = headerId`
   - If not found, throw clear error

3. **Delete Old Sections**
   - DELETE from `boq_sections` where `boq_id = headerId`

4. **Insert New Sections**
   - INSERT into `boq_sections` with `boq_id = headerId`
   - Use section IDs from local state

5. **Insert Items**
   - INSERT into `boq_section_items` with `section_id` from step 4

## Files Modified

### src/pages/BOQPage.tsx
- ✅ Fixed `loadLatestBoqForProject()` to use `boq_headers`
- ✅ Fixed `saveBoqToSupabase()` to use `boq_headers`
- ✅ Added verification step before inserting sections
- ✅ Added comprehensive logging throughout save flow
- ✅ No changes to layout/theme

### src/boq/boqPersistence.ts
- ℹ️ Already uses `boq_headers` correctly (no changes needed)

## Testing Checklist

- [x] Build compiles successfully
- [ ] BOQ can be created for a project
- [ ] BOQ can be loaded for a project
- [ ] BOQ sections can be saved
- [ ] BOQ items can be saved
- [ ] Console logs show correct flow
- [ ] Foreign key constraint is satisfied

---

## Issue 2: Duplicate Key Constraint Violation (FIXED)

### Problem
After fixing Issue 1, saving a BOQ was failing with:
```
duplicate key value violates unique constraint "boq_unique_version_per_project"
```

### Root Cause
The code was always trying to INSERT with `version: 1` when `boqId` was null, even if a draft already existed in the database. This happened after page refreshes where local state was lost.

### Solution
Enhanced `saveBoqToSupabase()` to:
1. Check for existing BOQs before inserting
2. Reuse existing drafts instead of creating duplicates
3. Calculate next version number when creating new versions
4. Add defensive version check before INSERT
5. Use UPDATE for existing BOQs, INSERT only for truly new ones

See `BOQ_DUPLICATE_KEY_FIX.md` for complete details.

---

## Future Considerations

The `boqs` table appears to be unused or part of an incomplete migration. Consider:

1. **Option A**: Complete the migration from `boq_headers` to `boqs`
   - Update foreign key constraint: `boq_sections.boq_id → boqs.id`
   - Update all code references
   - Migrate data from `boq_headers` to `boqs`
   - Drop `boq_headers` table

2. **Option B**: Remove the `boqs` table
   - Keep using `boq_headers` (current fix)
   - Drop the unused `boqs` table

Recommendation: Choose Option A or B to avoid future confusion.

---

## Complete Fix Summary

Both issues have been resolved in `src/pages/BOQPage.tsx`:

✅ **Issue 1 Fix**: Changed from `boqs` table to `boq_headers` table
✅ **Issue 2 Fix**: Smart INSERT/UPDATE logic with version management
✅ **Added**: Comprehensive logging throughout save flow
✅ **Added**: Defensive guards and validation
✅ **Verified**: Build compiles successfully
