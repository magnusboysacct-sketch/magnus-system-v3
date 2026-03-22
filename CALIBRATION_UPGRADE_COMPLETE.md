# Calibration UI Upgrade - Complete

## Overview

The TakeoffPage calibration system has been upgraded to support feet, inches, and fractional inches with separate input fields, matching professional construction takeoff software.

## What Changed

### 1. CalibrationDraft Type Updated

**Before:**
```typescript
type CalibrationDraft = {
  p1: Point | null;
  p2: Point | null;
  distanceText: string;  // Single text field
  unit: UnitSystem;
};
```

**After:**
```typescript
type CalibrationDraft = {
  p1: Point | null;
  p2: Point | null;
  feet: string;          // Separate feet input
  inches: string;        // Separate inches input
  fraction: string;      // Fraction dropdown (1/8, 1/4, etc.)
  unit: UnitSystem;
};
```

### 2. New Conversion Functions

**parseFraction(fractionStr: string): number**
- Converts fraction strings like "1/8", "1/2", "3/4" to decimal
- Returns 0 for "0" or invalid input
- Example: "1/2" → 0.5, "3/8" → 0.375

**convertCalibrationToFeet(feet, inches, fraction): number | null**
- Converts feet + inches + fraction to total feet
- Formula: `totalFeet = feet + ((inches + fractionValue) / 12)`
- Returns null if total is <= 0
- Examples:
  - 10 ft, 0 in, 0 → 10.0 feet
  - 10 ft, 6 in, 0 → 10.5 feet
  - 10 ft, 6 in, 1/2 → 10.5416667 feet
  - 0 ft, 9 in, 3/4 → 0.8125 feet

### 3. Calibration UI Redesigned

**Before:**
- Single text input with placeholder for various formats
- Tried to parse "12'6\"" or "6.5\"" or "1/2\""

**After:**
Three separate inputs in the toolbar:

```
[Feet: __] ft  [Inches: __] in  [Fraction: dropdown]  [Unit: ft/m/in]  [Apply]
```

**Input Fields:**
1. **Feet Input**
   - Type: number
   - Placeholder: "0"
   - Min: 0
   - Width: 14 (w-14)

2. **Inches Input**
   - Type: number
   - Placeholder: "0"
   - Min: 0
   - Max: 11
   - Width: 14 (w-14)

3. **Fraction Dropdown**
   - Options: 0, 1/8, 1/4, 3/8, 1/2, 5/8, 3/4, 7/8
   - Displays as readable fractions
   - Default: "0"

4. **Unit Dropdown** (unchanged)
   - Options: ft, m, in
   - Default: ft

5. **Apply Button** (unchanged)
   - Commits calibration

### 4. Calibration Commit Logic Updated

**Before:**
```typescript
const parsedDistance = parseCalibrationInput(calibrationDraft.distanceText);
```

**After:**
```typescript
const distance = convertCalibrationToFeet(
  calibrationDraft.feet,
  calibrationDraft.inches,
  calibrationDraft.fraction
);
```

### 5. HUD Display Updated

**Before:**
```
Target: 10.5 ft
```

**After:**
```
Target: 10' 6 1/2" ft
```

The HUD now displays the calibration target in feet-inches-fraction format for clarity.

## How The Conversion Works

### Input Example: 10 ft 6 1/2 in

**Step 1: Parse Individual Values**
- feet = "10" → 10
- inches = "6" → 6
- fraction = "1/2" → 0.5 (via parseFraction)

**Step 2: Calculate Total Inches**
```typescript
const totalInches = 6 + 0.5 = 6.5 inches
```

**Step 3: Convert to Feet**
```typescript
const totalFeet = 10 + (6.5 / 12)
                = 10 + 0.5416667
                = 10.5416667 feet
```

**Step 4: Apply to Calibration**
This decimal feet value is used in the calibration scale calculation:
```typescript
const scale = distance / pxDistance
```

### More Examples

| Input | Conversion | Result |
|-------|------------|--------|
| 12 ft, 0 in, 0 | 12 + (0/12) | 12.0 ft |
| 0 ft, 6 in, 0 | 0 + (6/12) | 0.5 ft |
| 0 ft, 0 in, 1/2 | 0 + (0.5/12) | 0.0416667 ft |
| 10 ft, 6 in, 1/4 | 10 + (6.25/12) | 10.520833 ft |
| 5 ft, 11 in, 7/8 | 5 + (11.875/12) | 5.989583 ft |

## User Workflow

### Before (Single Input)
1. Click two calibration points
2. Type "10'6 1/2\"" in one field
3. Hope the parser understands
4. Click Apply

### After (Separate Inputs)
1. Click two calibration points
2. Enter feet: `10`
3. Enter inches: `6`
4. Select fraction: `1/2`
5. Click Apply

**Benefits:**
- Clearer, more intuitive
- No parsing errors
- Matches how builders think and measure
- Dropdown prevents fraction typos
- Number inputs with validation

## Validation

The system validates:
- At least one value must be > 0
- Total must be > 0 feet
- Inches must be 0-11
- Feet must be >= 0

If validation fails, error message displayed:
```
"Calibration requires two points and a valid distance."
```

## Examples of Valid Calibration Inputs

```
10 ft 0 in 0     → 10 ft exactly
10 ft 6 in 0     → 10.5 ft
10 ft 6 in 1/2   → 10.5416667 ft
0 ft 9 in 3/4    → 0.8125 ft (9.75 inches)
1 ft 0 in 1/8    → 1.0104167 ft
0 ft 6 in 0      → 0.5 ft (6 inches)
0 ft 0 in 1/4    → 0.020833 ft (1/4 inch)
```

## Technical Details

### State Initialization
```typescript
const [calibrationDraft, setCalibrationDraft] = useState<CalibrationDraft>({
  p1: null,
  p2: null,
  feet: "1",      // Default 1 foot
  inches: "0",    // Default 0 inches
  fraction: "0",  // Default no fraction
  unit: "ft",
});
```

### Fraction Options
Supports standard construction fractions:
- 0 (none)
- 1/8 inch
- 1/4 inch
- 3/8 inch
- 1/2 inch
- 5/8 inch
- 3/4 inch
- 7/8 inch

These match standard tape measure increments.

## Files Modified

- `src/pages/TakeoffPage.tsx`
  - Updated CalibrationDraft type
  - Added parseFraction function
  - Added convertCalibrationToFeet function
  - Replaced single input with three inputs
  - Updated commitCalibration to use conversion
  - Updated HUD display format
  - Updated state initialization

## Build Status

✅ **Build successful** - No errors or warnings

## Testing Checklist

- [x] Build succeeds
- [x] Feet input accepts numbers
- [x] Inches input accepts 0-11
- [x] Fraction dropdown has all options
- [x] Conversion calculates correctly
- [x] Calibration applies with new values
- [x] HUD displays feet-inches-fraction format
- [x] Error validation works
- [x] All existing functionality preserved

## Backwards Compatibility

**Migration:**
Old saved sessions with `distanceText` will not break the app because:
1. The old field is no longer referenced
2. New calibrations use the new format
3. Existing measurements remain valid
4. Users simply re-calibrate with new UI

## Future Enhancements

Potential improvements:
- Metric support (meters, centimeters)
- Decimal inches option
- Copy/paste calibration between pages
- Saved calibration presets
- Auto-detect common scales (1/4" = 1'-0", etc.)

## Summary

The calibration UI now matches professional construction takeoff software with:

✅ **Separate inputs** - Feet, inches, fraction fields
✅ **Clear conversion** - Transparent math, no parsing
✅ **Standard fractions** - 1/8, 1/4, 3/8, 1/2, 5/8, 3/4, 7/8
✅ **Intuitive UX** - Matches how builders measure
✅ **Validated input** - Number fields with min/max
✅ **Clean display** - HUD shows readable format
✅ **Production ready** - Build successful, tested

Users can now enter calibration distances naturally:
- 10 ft
- 10 ft 6 in
- 10 ft 6 1/2 in
- 0 ft 9 3/4 in

All values convert correctly to decimal feet for internal calculations!
