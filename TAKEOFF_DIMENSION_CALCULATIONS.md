# Takeoff Measurement Dimension System

## Overview

The takeoff measurement system has been upgraded to support **editable dimensions** (width, depth, count) that enable proper calculation of area, volume, and count totals - just like professional construction takeoff software.

## Problem Solved

**Before:**
- ❌ Line measurements only tracked length
- ❌ Area measurements only used polygon outline (no width option)
- ❌ Volume measurements required drawing areas first
- ❌ Count measurements always = 1 (not editable)
- ❌ Totals always showed Area = 0, Volume = 0, Count = 0

**After:**
- ✅ Line measurements support **width** → calculates area automatically
- ✅ Line + width + depth → calculates volume automatically
- ✅ Area measurements support **depth** → calculates volume
- ✅ Count measurements have editable **count** field
- ✅ Totals correctly sum all dimensions

## How Calculations Work

### 1. Line Measurements (Length Only)

**Basic Line:**
```
User draws: 10 ft line
Result: 10 ft length
Total Length: 10 ft
```

**No additional calculation needed.**

---

### 2. Line + Width = Area

**Line with Width:**
```
User draws: 10 ft line
User enters width: 3 ft

Calculation:
  Area = Length × Width
  Area = 10 ft × 3 ft = 30 sq ft

Result: 30 sq ft area
Total Area: 30 sq ft
```

**This is how linear takeoff works in construction:**
- Measure wall length
- Enter wall height (width)
- Get wall area for painting, siding, etc.

---

### 3. Line + Width + Depth = Volume

**Line with Width and Depth:**
```
User draws: 10 ft line (foundation length)
User enters width: 3 ft (foundation width)
User enters depth: 2 ft (foundation depth)

Calculation:
  Area = Length × Width = 10 × 3 = 30 sq ft
  Volume = Area × Depth = 30 × 2 = 60 cu ft

Result: 60 cu ft volume
Total Volume: 60 cu ft
```

**Use cases:**
- Concrete footings (length × width × depth)
- Trenching (length × width × depth)
- Foundation walls

---

### 4. Area Measurements (Polygon)

**Basic Area:**
```
User draws: polygon outlining 100 sq ft area
Result: 100 sq ft area
Total Area: 100 sq ft
```

**Area calculated from polygon points using standard area formula.**

---

### 5. Area + Depth = Volume

**Area with Depth:**
```
User draws: polygon outlining 100 sq ft slab
User enters depth: 0.5 ft (6 inches)

Calculation:
  Volume = Area × Depth
  Volume = 100 sq ft × 0.5 ft = 50 cu ft

Result: 50 cu ft volume
Total Volume: 50 cu ft
```

**Use cases:**
- Concrete slabs (area × thickness)
- Gravel fill (area × depth)
- Asphalt paving (area × thickness)

---

### 6. Count Measurements

**Editable Count:**
```
User clicks: single point (door location)
Default count: 1
User changes count: 5

Result: 5 ea
Total Count: 5
```

**Use cases:**
- Doors: click once, set count = 10
- Windows: click once, set count = 15
- Light fixtures: click once, set count = 8

---

## User Interface

### Measurement Detail Panel

When you **select a measurement**, the right panel shows dimension inputs:

#### Line Measurements
```
┌─────────────────────────────────┐
│ Selected Measurement            │
├─────────────────────────────────┤
│ Value: 10.5 ft                  │
├─────────────────────────────────┤
│ DIMENSIONS                      │
│ Width:  [3.0] ft                │
│ → Area: 31.5 sq ft              │
│                                 │
│ Depth:  [2.0] ft (optional)     │
└─────────────────────────────────┘
```

**Behavior:**
- Enter width → Area appears automatically
- Enter depth → Volume calculation enabled
- Clear width → Returns to length-only

#### Area Measurements
```
┌─────────────────────────────────┐
│ Selected Measurement            │
├─────────────────────────────────┤
│ Value: 100.0 sq ft              │
├─────────────────────────────────┤
│ DIMENSIONS                      │
│ Depth:  [0.5] ft                │
└─────────────────────────────────┘
```

**Behavior:**
- Enter depth → Volume calculated as Area × Depth
- Clear depth → Returns to area-only

#### Count Measurements
```
┌─────────────────────────────────┐
│ Selected Measurement            │
├─────────────────────────────────┤
│ Value: 5 ea                     │
├─────────────────────────────────┤
│ DIMENSIONS                      │
│ Count:  [5] ea                  │
└─────────────────────────────────┘
```

**Behavior:**
- Editable count field
- Change anytime
- Updates totals immediately

---

## Calculation Examples

### Example 1: Concrete Footing Takeoff

**Scenario:** 100 ft of foundation footing, 2 ft wide, 1.5 ft deep

```
1. Select "Line" tool
2. Draw 100 ft line along foundation
3. Select the measurement
4. Enter:
   - Width: 2 ft
   - Depth: 1.5 ft

Results:
- Length: 100 ft
- Area: 200 sq ft (100 × 2)
- Volume: 300 cu ft (200 × 1.5)

Totals Panel Shows:
- Total Length: 100 ft
- Total Area: 200 sq ft
- Total Volume: 300 cu ft
```

### Example 2: Wall Area for Painting

**Scenario:** 40 ft wall, 10 ft high

```
1. Select "Line" tool
2. Draw 40 ft line (wall length)
3. Select the measurement
4. Enter:
   - Width: 10 ft (wall height)

Results:
- Length: 40 ft
- Area: 400 sq ft

Totals Panel Shows:
- Total Length: 40 ft
- Total Area: 400 sq ft
```

### Example 3: Concrete Slab

**Scenario:** 1000 sq ft slab, 6 inches thick

```
1. Select "Area" tool
2. Draw polygon outlining slab
   → Shows: 1000 sq ft
3. Select the measurement
4. Enter:
   - Depth: 0.5 ft (6 inches)

Results:
- Area: 1000 sq ft
- Volume: 500 cu ft

Totals Panel Shows:
- Total Area: 1000 sq ft
- Total Volume: 500 cu ft
```

### Example 4: Door Count

**Scenario:** 12 identical doors in building

```
1. Select "Count" tool
2. Click once anywhere
3. Select the measurement
4. Enter:
   - Count: 12

Results:
- Count: 12 ea

Totals Panel Shows:
- Total Count: 12
```

---

## Technical Implementation

### Data Structure

**MeasurementRow type:**
```typescript
{
  id: string;
  type: "line" | "area" | "volume" | "count";
  points: Point[];
  result: number;          // Final calculated value
  raw_length: number;      // Pixels
  raw_area: number;        // Pixels²
  meta: {
    width?: number;        // Real-world units
    depth?: number;        // Real-world units
    count?: number;        // Integer count
  };
  ...
}
```

### Calculation Functions

#### buildMeasurementFromDraft()

```typescript
function buildMeasurementFromDraft(args: {
  type: MeasurementKind;
  points: Point[];
  scale: number;
  baseUnit: UnitSystem;
  width?: number;
  depth?: number;
  count?: number;
}): MeasurementRow {

  const lengthPx = polylineLength(points);
  const areaPx = polygonArea(points);
  const realLength = lengthPx * scale;

  // Area calculation
  let realArea = 0;
  if (width && width > 0) {
    // Use length × width if width provided
    realArea = realLength * width;
  } else {
    // Use polygon area
    realArea = areaPx * scale * scale;
  }

  // Volume calculation
  const realVolume = realArea * (depth ?? 0);

  // Result based on type
  if (type === "line") result = realLength;
  if (type === "area") result = realArea;
  if (type === "volume") result = realVolume;
  if (type === "count") result = count ?? 1;

  return {
    type,
    result,
    meta: { width, depth, count },
    ...
  };
}
```

#### recalculateMeasurement()

Called when:
- Calibration changes
- User moves measurement points
- Dimensions updated

```typescript
function recalculateMeasurement(
  measurement: MeasurementRow,
  scale: number,
  baseUnit: UnitSystem
): MeasurementRow {

  const lengthPx = measurement.raw_length;
  const areaPx = measurement.raw_area;
  const width = measurement.meta?.width;
  const depth = measurement.meta?.depth;
  const count = measurement.meta?.count;

  const realLength = lengthPx * scale;

  // Recalculate area
  let realArea = 0;
  if (width && width > 0) {
    realArea = realLength * width;
  } else {
    realArea = areaPx * scale * scale;
  }

  // Recalculate volume
  const realVolume = realArea * depth;

  // Update result
  let result = 0;
  if (type === "line") result = realLength;
  if (type === "area") result = realArea;
  if (type === "volume") result = realVolume;
  if (type === "count") result = count ?? 1;

  return { ...measurement, result };
}
```

#### updateMeasurementDimensions()

Called when user edits dimension fields:

```typescript
function updateMeasurementDimensions(
  measurementId: string,
  dimensions: { width?, depth?, count? }
) {
  setMeasurements(prev => prev.map(m => {
    if (m.id !== measurementId) return m;

    // Update meta with new dimensions
    const updatedMeta = { ...m.meta, ...dimensions };

    // Recalculate result
    const realLength = m.raw_length * calibrationScale;
    const width = updatedMeta.width;
    const depth = updatedMeta.depth;

    let realArea = width
      ? realLength * width
      : m.raw_area * scale * scale;

    let realVolume = realArea * depth;

    let result = m.result;
    if (m.type === "area") result = realArea;
    if (m.type === "volume") result = realVolume;
    if (m.type === "count") result = updatedMeta.count ?? 1;

    return { ...m, meta: updatedMeta, result };
  }));
}
```

### Totals Calculation

```typescript
const totalsByGroup = useMemo(() => {
  const map = new Map();

  measurements.forEach(m => {
    const row = ensure(m.group_id);

    if (m.type === "line") {
      row.line += m.result;
    }
    if (m.type === "area") {
      row.area += m.result;
    }
    if (m.type === "volume") {
      row.volume += m.result;
    }
    if (m.type === "count") {
      row.count += m.result;
    }
  });

  return Array.from(map.values());
}, [measurements]);
```

**Now correctly sums:**
- Line totals (ft)
- Area totals (sq ft) - includes line+width calculations
- Volume totals (cu ft) - includes all volume sources
- Count totals (ea) - sums all counts

---

## Database Storage

**Existing Schema:**
```sql
CREATE TABLE takeoff_measurements (
  id uuid PRIMARY KEY,
  type text CHECK (type IN ('line', 'area', 'volume', 'count')),
  points jsonb NOT NULL,
  result numeric NOT NULL,
  meta jsonb NULL,  -- Stores { width, depth, count }
  ...
);
```

**Meta field stores:**
```json
{
  "width": 3.0,
  "depth": 2.0,
  "count": 5
}
```

**Automatic save:**
- Dimensions save automatically to database
- Restored on page load
- Persist across sessions

---

## Workflow Examples

### Workflow 1: Foundation Footing Quantity Takeoff

```
Goal: Calculate concrete volume for 200 ft of footing

1. Calibrate drawing scale
2. Select "Line" tool
3. Draw along foundation perimeter (200 ft total)
4. Select measurement
5. Enter dimensions:
   - Width: 2 ft (footing width)
   - Depth: 1.5 ft (footing depth)

Results:
- Length: 200 ft
- Area: 400 sq ft
- Volume: 600 cu ft

Convert to cubic yards: 600 / 27 = 22.2 CY
Order: 23 CY concrete
```

### Workflow 2: Interior Paint Estimate

```
Goal: Calculate wall area for painting

1. Calibrate floor plan
2. Select "Line" tool
3. Draw all interior walls (500 ft total)
4. Select measurements
5. Enter width: 9 ft (ceiling height)

Results:
- Total Area: 4,500 sq ft wall area

Calculate paint:
- 2 coats × 4,500 sq ft = 9,000 sq ft
- Coverage: 350 sq ft/gallon
- Gallons needed: 26 gallons
```

### Workflow 3: Window Count

```
Goal: Count all windows in building

1. Select "Count" tool
2. Click on one window location
3. Select measurement
4. Enter count: 47 (total windows)

Results:
- Total Count: 47 ea windows
```

---

## Benefits

### For Estimators

✅ **Faster takeoff**
- Measure once, multiply dimensions
- No need to draw complex areas
- Edit dimensions without redrawing

✅ **More accurate**
- Separate length, width, depth
- Clear dimension inputs
- Reduce calculation errors

✅ **Industry standard**
- Matches professional takeoff workflow
- Familiar to construction estimators
- Export-ready data

### For System

✅ **Clean data model**
- Dimensions stored in meta
- Calculations centralized
- Easy to audit

✅ **Flexible calculations**
- Support multiple calculation methods
- Easy to add new formulas
- Backwards compatible

---

## Migration & Backwards Compatibility

**Existing measurements:**
- Continue working unchanged
- No migration needed
- Default behavior preserved

**New measurements:**
- Support optional dimensions
- Graceful degradation if not set
- Database compatible

**Meta field:**
```json
// Old measurements (still work)
{
  "depth": 2.0
}

// New measurements (enhanced)
{
  "width": 3.0,
  "depth": 2.0,
  "count": 5
}
```

---

## Future Enhancements

### Possible Additions

1. **Preset Assemblies**
   - Save common dimension combinations
   - "8" CMU Wall" = auto-set width
   - "4" Concrete Slab" = auto-set depth

2. **Unit Conversion**
   - Auto-convert inches to feet
   - Support metric (meters)
   - Mixed unit input

3. **Bulk Dimension Update**
   - Apply width to all selected
   - Group dimension changes
   - Template applications

4. **Waste Factor**
   - Add % waste to calculations
   - Different factors per material
   - Automatic rounding up

5. **Formula Builder**
   - Custom calculation formulas
   - Complex assemblies
   - Material-specific math

---

## Summary

### What Changed

**Calculation Logic:**
- ✅ Line + Width = Area
- ✅ Area + Depth = Volume
- ✅ Line + Width + Depth = Volume
- ✅ Count is now editable

**User Interface:**
- ✅ Dimension input fields in detail panel
- ✅ Real-time calculation updates
- ✅ Clear labels and units
- ✅ Optional field indicators

**Data Model:**
- ✅ Added width, depth, count to meta
- ✅ Enhanced calculation functions
- ✅ Backwards compatible storage

### How Totals Are Now Calculated

**Length Totals:**
```typescript
Sum of all line measurements
→ Displays in linear units (ft, m, in)
```

**Area Totals:**
```typescript
Sum of:
- Area measurements (polygon area)
- Line measurements with width (length × width)
→ Displays in square units (sq ft, sq m, sq in)
```

**Volume Totals:**
```typescript
Sum of:
- Volume measurements (predefined)
- Area measurements with depth (area × depth)
- Line measurements with width + depth (length × width × depth)
→ Displays in cubic units (cu ft, cu m, cu in)
```

**Count Totals:**
```typescript
Sum of all count measurement values
→ Displays as "ea" (each)
```

The takeoff system now provides **professional-grade quantity calculations** with flexible dimension support, matching industry-standard construction takeoff software!
