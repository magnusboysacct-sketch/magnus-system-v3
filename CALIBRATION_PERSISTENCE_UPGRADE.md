# Calibration Persistence System - Complete Upgrade

## Overview

The calibration system has been fully upgraded to persist calibration data to the database, survive page navigation, and provide complete control over calibration management.

## Problem Solved

**Before:**
- Calibration was only stored in component state
- Navigating away from the page lost all calibration
- No way to cancel calibration in progress
- No way to clear incorrect calibration
- No visual indication of calibration status

**After:**
- ✅ Calibration persists to Supabase database
- ✅ Calibration restores automatically on page load
- ✅ Cancel calibration in progress
- ✅ Clear saved calibration
- ✅ Recalibrate anytime
- ✅ Visual status indicator showing calibration state

## How It Works

### 1. Database Storage

**Storage Location:**
```typescript
takeoff_sessions.calibration = {
  page_1: { /* PageRow calibration data */ },
  page_2: { /* PageRow calibration data */ },
  page_3: { /* PageRow calibration data */ },
  ...
}
```

**Per-Page Calibration Data:**
```typescript
{
  session_id: string;
  page_number: number;
  page_label: string | null;
  width: number;
  height: number;
  calibration_point_1: { x: number, y: number };
  calibration_point_2: { x: number, y: number };
  calibration_distance: number;
  calibration_unit: "ft" | "m" | "in";
  calibration_scale: number; // real units per pixel
  updated_at: string;
}
```

### 2. Save Process

**When User Clicks "Apply":**

1. **Validate Inputs**
   - Check both points are set
   - Check distance is valid and > 0
   - Check pixel distance > 0

2. **Calculate Scale**
   ```typescript
   const scale = realWorldDistance / pixelDistance;
   ```

3. **Update Local State**
   - Add/update PageRow in pageRows array
   - Recalculate all measurements on current page
   - Switch to "select" mode

4. **Save to Database**
   ```typescript
   await supabase
     .from("takeoff_sessions")
     .update({
       calibration: {
         ...existingCalibration,
         [`page_${pageNumber}`]: calibrationData
       }
     })
     .eq("id", sessionId);
   ```

### 3. Load Process

**On Page Load / Session Load:**

1. **Fetch Session Data**
   ```typescript
   const { data: sessionRow } = await supabase
     .from("takeoff_sessions")
     .select("*")
     .eq("project_id", projectId)
     .single();
   ```

2. **Extract Page Calibrations**
   ```typescript
   const loadedPageRows: PageRow[] = [];
   if (sessionRow.calibration) {
     Object.keys(sessionRow.calibration).forEach((key) => {
       if (key.startsWith('page_')) {
         loadedPageRows.push(sessionRow.calibration[key]);
       }
     });
   }
   ```

3. **Set State**
   ```typescript
   setPageRows(loadedPageRows);
   ```

4. **Auto-Apply to Current Page**
   - Current page calibration is automatically available via:
   ```typescript
   const currentPageRow = pageRows.find(p => p.page_number === currentPage);
   const calibrationScale = currentPageRow?.calibration_scale ?? null;
   ```

### 4. New Functions

**savePageCalibrationToDB()**
```typescript
// Saves a single page's calibration to database
// Called automatically after commitCalibration()
// Updates session.calibration JSONB field
```

**commitCalibration()**
```typescript
// Original apply logic + database save
// Now async to handle DB operations
// Clears draft points after success
```

**cancelCalibration()**
```typescript
// Clears calibration draft points (p1, p2)
// Switches back to "select" mode
// Does NOT affect saved calibration
```

**clearCalibration()**
```typescript
// Removes saved calibration for current page
// Updates database
// Deletes page_N key from calibration object
// Clears local PageRow calibration data
```

**recalibrateCurrentPage()**
```typescript
// Switches to "calibrate" mode
// Clears draft points for fresh start
// Leaves saved calibration intact until new one applied
```

## User Interface

### Calibration Input Panel

**Always Visible:**
```
┌────────────────────────────────────────────────────────┐
│ 📏 CALIBRATION                                         │
│ [10] ft  [6] in  [1/2▾]  [ft▾]  [Apply] [Cancel]      │
└────────────────────────────────────────────────────────┘
```

**Fields:**
- Feet input (0+)
- Inches input (0-11)
- Fraction select (0, 1/8, 1/4, 3/8, 1/2, 5/8, 3/4, 7/8)
- Unit select (ft, m, in)
- Apply button (disabled until both points set)
- Cancel button (only visible when calibrating)

### Calibration Status Panel

**Shown When Page is Calibrated:**
```
┌────────────────────────────────────────────────────────┐
│ ✓ Page 1 Calibrated: 10' 6 1/2"  [Recalibrate] [Clear]│
└────────────────────────────────────────────────────────┘
```

**Features:**
- Green/emerald theme for success state
- Shows current page number
- Displays calibrated distance in real units
- Recalibrate button - starts fresh calibration
- Clear button - removes calibration entirely

**Hidden When:**
- Page is not calibrated
- User is in "calibrate" mode

### Button Behavior

**Apply Button:**
- Disabled when: `!p1 || !p2`
- Enabled when: Both calibration points set
- Click: Saves calibration, updates measurements

**Cancel Button:**
- Only shown when: `toolMode === "calibrate" && (p1 || p2)`
- Click: Clears draft, switches to select mode

**Recalibrate Button:**
- Only shown when: Page has saved calibration
- Click: Switches to calibrate mode, clears draft points

**Clear Button:**
- Only shown when: Page has saved calibration
- Click: Removes calibration from DB and state

## Workflow Examples

### Example 1: First-Time Calibration

```
1. User uploads PDF
2. User clicks "Calibrate" tool button
3. User clicks two points on drawing (known distance)
4. User enters: 10 ft, 6 in, 1/2
5. User clicks "Apply"
   → Calibration saved to state
   → Calibration saved to database
   → Tool switches to "Select"
   → Green status bar appears
6. User navigates to another page
7. User returns to page 1
   → Calibration automatically restored
   → Green status bar shows calibration
```

### Example 2: Cancel Calibration

```
1. User clicks "Calibrate" tool button
2. User clicks first point (p1)
3. User realizes they clicked wrong spot
4. User clicks "Cancel" button
   → Draft points cleared
   → Returns to "Select" mode
   → No changes to saved calibration
```

### Example 3: Clear Calibration

```
1. User has calibrated page 1
2. User realizes calibration was wrong scale
3. User sees green status bar with "Clear" button
4. User clicks "Clear"
   → Calibration removed from database
   → Calibration removed from state
   → Status bar disappears
   → Measurements show uncalibrated units
5. User can now recalibrate correctly
```

### Example 4: Recalibrate Page

```
1. User has calibrated page 1 (10 ft)
2. User realizes drawing scale is different
3. User clicks "Recalibrate" in status bar
   → Switches to calibrate mode
   → Clears draft points
   → Old calibration still shown on canvas
4. User clicks two NEW calibration points
5. User enters new distance: 15 ft
6. User clicks "Apply"
   → New calibration replaces old
   → Database updated
   → All measurements recalculated
```

### Example 5: Multi-Page Document

```
1. User uploads 5-page floor plan
2. User calibrates Page 1: 10 ft scale
3. User navigates to Page 2
   → Page 2 not calibrated
   → No status bar
   → Can calibrate independently
4. User calibrates Page 2: 15 ft scale
5. User switches between pages
   → Each page remembers its calibration
   → Database stores all 5 calibrations
```

## Technical Implementation

### Database Schema

**Existing Table:**
```sql
CREATE TABLE takeoff_sessions (
  id uuid PRIMARY KEY,
  project_id uuid NOT NULL,
  company_id uuid NOT NULL,
  pdf_name text,
  pdf_bucket text,
  pdf_path text,
  calibration jsonb NULL,  -- Stores all page calibrations
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
```

**Calibration Structure:**
```json
{
  "page_1": {
    "session_id": "uuid",
    "page_number": 1,
    "width": 1024,
    "height": 768,
    "calibration_point_1": { "x": 100, "y": 200 },
    "calibration_point_2": { "x": 500, "y": 200 },
    "calibration_distance": 10.541667,
    "calibration_unit": "ft",
    "calibration_scale": 0.0263542,
    "updated_at": "2026-03-22T..."
  },
  "page_2": { ... },
  "page_3": { ... }
}
```

### State Management

**Component State:**
```typescript
const [pageRows, setPageRows] = useState<PageRow[]>([]);
const [calibrationDraft, setCalibrationDraft] = useState<CalibrationDraft>({
  p1: null,
  p2: null,
  feet: "1",
  inches: "0",
  fraction: "0",
  unit: "ft",
});
```

**Derived State:**
```typescript
const currentPageRow = pageRows.find(p => p.page_number === currentPage);
const calibrationScale = currentPageRow?.calibration_scale ?? null;
const calibrationUnit = currentPageRow?.calibration_unit ?? "ft";
const calibrationDistance = currentPageRow?.calibration_distance ?? null;
```

### Key Code Changes

**1. Enhanced commitCalibration:**
```typescript
const commitCalibration = useCallback(async () => {
  // Validate inputs
  // Calculate scale
  // Update state
  // Save to database ← NEW
  if (updatedPageRow) {
    await savePageCalibrationToDB(updatedPageRow);
  }
}, [dependencies]);
```

**2. New savePageCalibrationToDB:**
```typescript
const savePageCalibrationToDB = useCallback(async (pageRow: PageRow) => {
  const calibrationData = { /* extract fields */ };

  await supabase
    .from("takeoff_sessions")
    .update({
      calibration: {
        ...existingCalibration,
        [`page_${pageRow.page_number}`]: calibrationData,
      },
    })
    .eq("id", session.id);
}, [session]);
```

**3. Enhanced loadSessionData:**
```typescript
const loadSessionData = useCallback(async (projectId: string) => {
  // ... fetch session ...

  // Load calibrations from database ← NEW
  const loadedPageRows: PageRow[] = [];
  if (sessionRow.calibration) {
    Object.keys(sessionRow.calibration).forEach((key) => {
      if (key.startsWith('page_')) {
        loadedPageRows.push(sessionRow.calibration[key]);
      }
    });
  }

  setPageRows(loadedPageRows);
}, []);
```

**4. New cancelCalibration:**
```typescript
const cancelCalibration = useCallback(() => {
  setCalibrationDraft((prev) => ({ ...prev, p1: null, p2: null }));
  setToolMode("select");
  setErrorText("");
}, []);
```

**5. New clearCalibration:**
```typescript
const clearCalibration = useCallback(async () => {
  // Update local state
  setPageRows(/* remove calibration */);

  // Update database
  const updatedCalibration = { ...session.calibration };
  delete updatedCalibration[`page_${currentPage}`];

  await supabase
    .from("takeoff_sessions")
    .update({ calibration: updatedCalibration })
    .eq("id", session.id);
}, [session, currentPage]);
```

**6. New recalibrateCurrentPage:**
```typescript
const recalibrateCurrentPage = useCallback(() => {
  setToolMode("calibrate");
  setCalibrationDraft((prev) => ({ ...prev, p1: null, p2: null }));
  setErrorText("");
}, []);
```

## Benefits

### For Users

✅ **Reliability**
- Calibration never gets lost
- Switch between pages freely
- Leave and return anytime

✅ **Control**
- Cancel mistakes before applying
- Clear incorrect calibrations
- Recalibrate anytime needed

✅ **Visibility**
- Clear status showing calibration state
- See calibrated distance at a glance
- Know which pages are ready

✅ **Multi-Page Support**
- Each page stores its own calibration
- Independent scales per page
- Perfect for varied drawing sets

### For System

✅ **Data Integrity**
- Single source of truth in database
- Automatic restore on load
- Consistent state management

✅ **Performance**
- Minimal database writes
- Efficient JSONB storage
- No extra tables needed

✅ **Maintainability**
- Clear function separation
- Self-documenting code
- Easy to debug

## Testing Checklist

- [x] Build succeeds
- [x] Apply calibration saves to DB
- [x] Navigate away and back restores calibration
- [x] Cancel clears draft without affecting saved
- [x] Clear removes calibration from DB
- [x] Recalibrate switches to calibrate mode
- [x] Apply button disabled until both points set
- [x] Cancel button only shows when calibrating
- [x] Status panel only shows when calibrated
- [x] Multi-page calibrations work independently
- [x] Measurements recalculate on calibration change

## Migration Notes

**Existing Sessions:**
- Old sessions without calibration field will work fine
- calibration field defaults to null
- First calibration creates the object
- No migration needed

**Backwards Compatibility:**
- Code checks for calibration existence before access
- Falls back to null scale if not calibrated
- No breaking changes to existing functionality

## Future Enhancements

### Possible Additions

1. **Calibration Templates**
   - Save common scales (1/4" = 1', 1/8" = 1')
   - Quick apply standard architectural scales

2. **Calibration History**
   - Track previous calibrations
   - Undo/redo calibration changes

3. **Visual Calibration Preview**
   - Show ruler overlay at calibration scale
   - Grid overlay based on calibration

4. **Calibration Validation**
   - Warn if scale seems unusual
   - Suggest standard scales

5. **Copy Calibration Between Pages**
   - Apply page 1 calibration to all pages
   - Useful for uniform drawing sets

6. **Import/Export Calibration**
   - Save calibration profiles
   - Share between projects

## Summary

### What Changed

**Database:**
- Calibration now saved to `takeoff_sessions.calibration` JSONB field
- Per-page calibration stored as `page_N` keys
- Automatic restore on session load

**Functions:**
- `commitCalibration()` → Now async, saves to DB
- `savePageCalibrationToDB()` → New, handles DB save
- `cancelCalibration()` → New, cancels draft
- `clearCalibration()` → New, removes saved calibration
- `recalibrateCurrentPage()` → New, starts fresh calibration

**UI:**
- Apply button now disables until points set
- Cancel button appears when calibrating
- Green status panel shows calibration state
- Recalibrate button for easy re-do
- Clear button for removing calibration

### Key Features

✅ **Persistent** - Survives navigation and reload
✅ **Controllable** - Cancel, clear, recalibrate anytime
✅ **Visible** - Clear status indicators
✅ **Reliable** - Database-backed storage
✅ **Multi-page** - Independent per page

The calibration system is now production-ready with full persistence, complete user control, and clear visual feedback!
